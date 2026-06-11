// PollingSync (SPEC §6.1) — designed as a cost feature. Chat-list poll is the
// primary detector; message fetches happen only on list deltas, as ascending
// tail fetches from the cached boundary. Hot poll reads page 1 only; periodic
// deep sweeps and a chunked, resumable initial hydration walk deeper pages.
// Hydration is LIST-ONLY: at 900+ chats (loravie, measured 2026-06-11) a
// tail-fetch per discovered chat would cost ~900 credits and hours of serial
// fetches — message history loads on conversation open instead.
// STRICTLY READ-ONLY toward OFAPI.

import { z } from 'zod';
import { OFAPI_INTER_PAGE_DELAY_MS, type OfApiPurpose } from '@chatgoose/shared';
import type { SyncEvent } from '@chatgoose/shared/protocol/index';
import type { OfApiClient } from '../ofapi/client';
import type { DataLayer, FanTransactionUpsert } from '../db/index';
import type { OfApiChat, OfApiTransaction } from '../ofapi/schemas';
import { paginateMarker } from '../ofapi/pagination';
import type { SleepFn } from '../ofapi/rate-limiter';
import {
  mapAccount,
  mapChat,
  mapFan,
  mapFanTransaction,
  mapMessage,
  type ToMediaUrl,
} from './mappers';
import type { SyncListener, SyncProvider, SyncStatusSnapshot } from './provider';

const FOCUSED_POLL_MS = 20_000;
const UNFOCUSED_POLL_MS = 60_000;
const HIDDEN_FACTOR = 4;
const BUDGET_FACTOR = 4;
// SPEC §6.2: while hub SSE is live, the chat-list poll is reconciliation only —
// slow ×6, never stop (the hub stream carries ids, not bodies). The read-state
// sweep stays FULL-RATE regardless: no upstream webhook exists for isNew flips,
// so hub mode changes nothing about seen-tick detection.
const HUB_DEMOTION_FACTOR = 6;
// OnlyFans ignores limit>10 on chats and dictates its own page size (live
// 2026-06-11: ~10 near the order=recent head, 10–19 deeper); limit≤10 is
// honored, so we request an explicit 10 and advance the offset by what
// actually arrived (self-correcting against server-chosen sizes).
const CHATS_PAGE_LIMIT = 10;
// Recency invariant (order=recent): any chat whose lastMessage changed surfaces
// on page 1, so the hot poll needs page 1 only. Deeper pages matter solely for
// initial load and for read-state/unread drift on older chats — the deep sweep
// covers those.
const DEEP_SWEEP_PAGES = 5;
const DEEP_SWEEP_INTERVAL_MS = 5 * 60_000;
// Initial hydration: resumable chunked walk, a few pages per poll tick so the
// hot detector keeps running between chunks. loravie FREE measured at 900+
// chats ≈ 60–90 pages; the cap is a runaway guard, not the expected size.
// Progress persists in settings so a restart resumes instead of rewalking.
const HYDRATION_PAGES_PER_TICK = 10;
const HYDRATION_MAX_PAGES = 150;
const READ_STATE_SWEEP_MS = 30_000;
const READ_STATE_SWEEP_IDLE_STOP_MS = 10 * 60_000;
const READ_STATE_OWN_MESSAGE_MAX_AGE_MS = 24 * 60 * 60_000;
const MEDIA_READY_POLL_MS = 15_000;
const MEDIA_READY_POLL_CAP_MS = 10 * 60_000;
const FAN_DETAIL_TTL_MS = 5 * 60_000;
const OFFLINE_AFTER_FAILURES = 3;
// Fan-spend sweep (DESIGN §1 30-day figure): the first walk pulls the full
// -30days transactions window once; every later sweep starts at the newest
// cached row minus an overlap, so steady state is ~1 page per sweep. Page
// limit 10 = the documented recommendation (vendored openapi.json); larger
// values are unverified upstream. Runs only after hydration completes — the
// initial walk must not compete with the chat-list hydration for credits.
const SPEND_SWEEP_INTERVAL_MS = 10 * 60_000;
const SPEND_TX_PAGE_LIMIT = 10;
const SPEND_SWEEP_MAX_PAGES = 100;
const SPEND_SWEEP_OVERLAP_MS = 60 * 60_000;
/** Retention horizon: window (30d) + 1d slack; the cutoff is read-time. */
const SPEND_RETENTION_MS = 31 * 24 * 60 * 60_000;

export interface PollingSyncOptions {
  client: OfApiClient;
  data: DataLayer;
  toMediaUrl: ToMediaUrl;
  /** ×4 polling slowdown when the shift credit budget is exhausted (never stops). */
  isBudgetExhausted?: () => boolean;
  now?: () => number;
  /** Inter-page pacing during multi-page chat walks (injectable for tests). */
  sleep?: SleepFn;
}

type PollDepth = 'hot' | 'deep';

interface AccountLoop {
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  lastSuccessAt: number | null;
  lastDeepSweepAt: number | null;
  lastSpendSweepAt: number | null;
  consecutiveFailures: number;
}

/** Persisted per account (settings table) so restarts resume, never rewalk. */
const hydrationStateSchema = z.object({
  nextOffset: z.number().int().nonnegative(),
  pagesWalked: z.number().int().nonnegative(),
  done: z.boolean(),
});
type HydrationState = z.infer<typeof hydrationStateSchema>;

const FRESH_HYDRATION: HydrationState = { nextOffset: 0, pagesWalked: 0, done: false };

function hydrationKey(accountId: string): string {
  return `sync.chatHydration.${accountId}`;
}

export function createPollingSync(options: PollingSyncOptions): SyncProvider & {
  /** Visible for the composition root: poll one account immediately. */
  pollAccount(accountId: string): Promise<void>;
  /** Hub-live cadence demotion (×6 on the poll loop only; sweeps unaffected). */
  setHubDemoted(demoted: boolean): void;
} {
  const { client, data, toMediaUrl } = options;
  const now = options.now ?? Date.now;
  const isBudgetExhausted = options.isBudgetExhausted ?? ((): boolean => false);
  const sleep: SleepFn =
    options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  const listeners = new Set<SyncListener>();
  const loops = new Map<string, AccountLoop>();
  let running = false;
  let focusedAccount: string | null = null;
  let windowVisible = true;
  let hubDemoted = false;
  let openConversation: { accountId: string; chatId: string } | null = null;

  let sweepTimer: ReturnType<typeof setTimeout> | null = null;
  let sweepLastChangeAt = 0;
  const mediaPollers = new Map<string, { startedAt: number; timer: ReturnType<typeof setTimeout> }>();

  function emit(event: SyncEvent): void {
    for (const listener of listeners) {
      listener(event);
    }
  }

  function intervalFor(accountId: string): number {
    const base = accountId === focusedAccount ? FOCUSED_POLL_MS : UNFOCUSED_POLL_MS;
    const hidden = windowVisible ? 1 : HIDDEN_FACTOR;
    const budget = isBudgetExhausted() ? BUDGET_FACTOR : 1;
    const hub = hubDemoted ? HUB_DEMOTION_FACTOR : 1;
    return base * hidden * budget * hub;
  }

  function schedule(accountId: string, delayMs: number): void {
    const loop = loops.get(accountId);
    if (!loop || !running) {
      return;
    }
    if (loop.timer) {
      clearTimeout(loop.timer);
    }
    loop.timer = setTimeout(() => {
      void pollAccount(accountId).finally(() => schedule(accountId, intervalFor(accountId)));
    }, delayMs);
  }

  /** Tail fetch from the newest cached id (last_id+asc is boundary-inclusive — dedupe by id). */
  async function fetchChatTail(
    accountId: string,
    chatId: string,
  ): Promise<{ freshIds: string[]; hadCachedMessages: boolean }> {
    const cachedPage = data.messages.page({ accountId, chatId, limit: 1 });
    const newestCached = cachedPage.items.at(-1)?.messageId;
    const { messages } = newestCached
      ? await client.listMessages({
          accountId,
          chatId,
          lastId: newestCached,
          order: 'asc',
          limit: 100,
          purpose: 'message-tail',
        })
      : await client.listMessages({ accountId, chatId, order: 'desc', limit: 100, purpose: 'message-tail' });

    const fresh = messages.filter(
      (message) => data.messages.get(accountId, chatId, String(message.id)) === null,
    );
    const upserts = messages.map((message) => mapMessage(accountId, chatId, message, toMediaUrl));
    data.messages.upsertMany(upserts);
    data.messages.prune(accountId, chatId); // retention (SPEC §10: 5,000/chat default)
    trackUnreadyMedia(accountId, chatId, upserts);
    return {
      freshIds: fresh.map((message) => String(message.id)),
      hadCachedMessages: newestCached !== undefined,
    };
  }

  function trackUnreadyMedia(
    accountId: string,
    chatId: string,
    upserts: ReadonlyArray<{ messageId: string; media: ReadonlyArray<{ isReady: boolean }> }>,
  ): void {
    for (const message of upserts) {
      if (!message.media.some((item) => !item.isReady)) {
        continue;
      }
      const key = `${accountId}/${chatId}/${message.messageId}`;
      if (mediaPollers.has(key)) {
        continue;
      }
      const startedAt = now();
      const poll = (): void => {
        if (now() - startedAt > MEDIA_READY_POLL_CAP_MS) {
          mediaPollers.delete(key);
          return;
        }
        void client
          .getMessage({ accountId, chatId, messageId: message.messageId, purpose: 'media' })
          .then((fresh) => {
            const upsert = mapMessage(accountId, chatId, fresh, toMediaUrl);
            data.messages.upsertMany([upsert]);
            if (upsert.media.every((item) => item.isReady)) {
              mediaPollers.delete(key);
              return;
            }
            mediaPollers.set(key, { startedAt, timer: setTimeout(poll, MEDIA_READY_POLL_MS) });
          })
          .catch(() => {
            mediaPollers.set(key, { startedAt, timer: setTimeout(poll, MEDIA_READY_POLL_MS) });
          });
      };
      mediaPollers.set(key, { startedAt, timer: setTimeout(poll, MEDIA_READY_POLL_MS) });
    }
  }

  /**
   * Delta rule (SPEC §6.1): message fetches only when the list shows change.
   * Compares against the chat ROW's own last_message_id baseline — hydration is
   * list-only, so the messages table says nothing about what we last saw.
   */
  function chatChanged(accountId: string, chat: OfApiChat): boolean {
    const fanId = chat.fan?.id;
    if (fanId == null) {
      return false;
    }
    const cached = data.chats.get(accountId, String(fanId));
    if (!cached) {
      return true;
    }
    const lastId = chat.lastMessage?.id != null ? String(chat.lastMessage.id) : null;
    return (
      (lastId !== null && lastId !== cached.lastMessageId) ||
      (chat.unreadMessagesCount ?? 0) !== cached.unreadCount ||
      (chat.lastReadMessageId != null ? String(chat.lastReadMessageId) : null) !==
        cached.lastReadMessageId
    );
  }

  /** Walk recency-ordered chat pages (limit/offset cursor; nextPageUrl presence = has-more). */
  async function walkChatPages(
    accountId: string,
    startOffset: number,
    maxPages: number,
    purpose: OfApiPurpose,
  ): Promise<{ chats: OfApiChat[]; nextOffset: number; pages: number; exhausted: boolean }> {
    const collected: OfApiChat[] = [];
    const seenFanIds = new Set<string>();
    let offset = startOffset;
    let pages = 0;
    let exhausted = false;
    for (let page = 0; page < maxPages; page += 1) {
      if (page > 0) {
        await sleep(OFAPI_INTER_PAGE_DELAY_MS); // legacy deep-fetch pacing
      }
      const { chats, nextPageUrl } = await client.listChats({
        accountId,
        limit: CHATS_PAGE_LIMIT,
        offset,
        order: 'recent',
        skipUsers: 'none',
        purpose,
      });
      pages += 1;
      for (const chat of chats) {
        const fanId = chat.fan?.id;
        if (fanId != null) {
          if (seenFanIds.has(String(fanId))) {
            continue; // recency reshuffle between pages can repeat a chat
          }
          seenFanIds.add(String(fanId));
        }
        collected.push(chat);
      }
      offset += chats.length; // server-chosen page sizes vary — advance by what arrived
      if (nextPageUrl === null || chats.length === 0) {
        exhausted = true;
        break;
      }
    }
    return { chats: collected, nextOffset: offset, pages, exhausted };
  }

  function readHydration(accountId: string): HydrationState {
    return data.settings.getParsed(hydrationKey(accountId), hydrationStateSchema) ?? FRESH_HYDRATION;
  }

  /** Upsert chat + fan rows only — the list payload is all the inbox needs. */
  function upsertChatRows(accountId: string, chats: readonly OfApiChat[]): void {
    const chatUpserts = [];
    const fetchedAt = new Date(now()).toISOString();
    for (const chat of chats) {
      const mapped = mapChat(accountId, chat, toMediaUrl);
      if (mapped) {
        chatUpserts.push(mapped);
      }
      if (chat.fan != null) {
        data.fans.upsert(mapFan(accountId, chat.fan, toMediaUrl, fetchedAt));
      }
    }
    data.chats.upsertMany(chatUpserts);
  }

  async function pollAccount(accountId: string, depth: PollDepth = 'hot'): Promise<void> {
    const loop = loops.get(accountId);
    if (!loop || loop.inFlight) {
      return; // overlap protection — Phase-0 measured p95 7.5 s on list-chats
    }
    loop.inFlight = true;
    try {
      const prevSuccessAt = loop.lastSuccessAt;
      const hydration = readHydration(accountId);
      const deepDue =
        hydration.done &&
        (depth === 'deep' ||
          loop.lastDeepSweepAt === null ||
          now() - loop.lastDeepSweepAt >= DEEP_SWEEP_INTERVAL_MS);
      // Head walk: the delta detector. Page 1 suffices on hot ticks (recency
      // invariant, see CHATS_PAGE_LIMIT); deep sweeps cover read-state drift.
      const head = await walkChatPages(
        accountId,
        0,
        deepDue ? DEEP_SWEEP_PAGES : 1,
        deepDue ? 'deep-sweep' : 'hot-poll',
      );

      const deltas: { chatId: string; wasCached: boolean }[] = [];
      for (const chat of head.chats) {
        if (!chatChanged(accountId, chat)) {
          continue;
        }
        const fanId = chat.fan?.id;
        if (fanId == null) {
          continue;
        }
        const chatId = String(fanId);
        const wasCached = data.chats.get(accountId, chatId) !== null;
        // Tail-fetch policy (the cost rule at 900+ chats):
        //  - cached chat changed → always fetch, even at baseline (silently
        //    swallows the downtime backlog so it never replays as live events);
        //  - uncached chat → fetch only post-baseline (a fresh conversation
        //    surfacing on the head pages); at baseline it is pure hydration.
        if (wasCached || prevSuccessAt !== null) {
          deltas.push({ chatId, wasCached });
        }
      }
      upsertChatRows(accountId, head.chats);

      for (const delta of deltas) {
        const { freshIds, hadCachedMessages } = await fetchChatTail(accountId, delta.chatId);
        if (prevSuccessAt === null) {
          continue; // baseline: history is not news (notifications hang off these)
        }
        for (const messageId of freshIds) {
          const row = data.messages.get(accountId, delta.chatId, messageId);
          if (!row) {
            continue;
          }
          // No cached boundary (chat never opened / just discovered): the tail
          // is mostly backlog — only messages newer than the previous successful
          // poll are live. With a boundary, fresh-by-id is exact.
          if (!hadCachedMessages && Date.parse(row.createdAt) <= prevSuccessAt) {
            continue;
          }
          emit(
            row.isSentByMe
              ? { type: 'messageSent', accountId, chatId: delta.chatId, messageId }
              : { type: 'messageReceived', accountId, chatId: delta.chatId, messageId },
          );
          if (row.isTip) {
            emit({
              type: 'tipReceived',
              accountId,
              chatId: delta.chatId,
              messageId,
              ...(row.tipAmount != null ? { amountUsd: row.tipAmount } : {}),
            });
          }
        }
      }

      emit({ type: 'chatListUpdated', accountId });

      // Hydration chunk: list-only, no delta processing — message history loads
      // on conversation open. Runs after the fresh-delta work so live messages
      // never wait behind a deep walk; resumes past the head across ticks and
      // restarts (progress persisted).
      if (!hydration.done) {
        await sleep(OFAPI_INTER_PAGE_DELAY_MS);
        const chunk = await walkChatPages(
          accountId,
          Math.max(hydration.nextOffset, head.nextOffset),
          HYDRATION_PAGES_PER_TICK,
          'hydration',
        );
        upsertChatRows(accountId, chunk.chats);
        const pagesWalked = hydration.pagesWalked + chunk.pages;
        data.settings.set(hydrationKey(accountId), {
          nextOffset: chunk.nextOffset,
          pagesWalked,
          done: chunk.exhausted || pagesWalked >= HYDRATION_MAX_PAGES,
        } satisfies HydrationState);
        emit({ type: 'chatListUpdated', accountId }); // progressive inbox paint
      }

      // Fan-spend sweep (DESIGN §1): incremental transactions walk on its own
      // cadence, gated on hydration so the one-time -30days window walk never
      // competes with the chat-list hydration for credits. Failure-isolated —
      // a transactions hiccup must not degrade the chat poll's status.
      if (
        hydration.done &&
        (loop.lastSpendSweepAt === null ||
          now() - loop.lastSpendSweepAt >= SPEND_SWEEP_INTERVAL_MS)
      ) {
        try {
          await sweepFanSpend(accountId);
        } catch {
          // transient; the stamp below still advances so a broken transactions
          // endpoint retries at sweep cadence, not on every poll tick
        } finally {
          loop.lastSpendSweepAt = now();
        }
      }

      loop.lastSuccessAt = now();
      if (deepDue) {
        loop.lastDeepSweepAt = now();
      }
      loop.consecutiveFailures = 0;
    } catch {
      loop.consecutiveFailures += 1;
    } finally {
      loop.inFlight = false;
    }
  }

  // ── Conditional read-state sweep (SPEC §6.1/§6.2 policy) ────────────────
  function sweepEligible(): boolean {
    if (!windowVisible || !openConversation) {
      return false;
    }
    const { accountId, chatId } = openConversation;
    const recent = data.messages.page({ accountId, chatId, limit: 50 }).items;
    const cutoff = now() - READ_STATE_OWN_MESSAGE_MAX_AGE_MS;
    return recent.some(
      (message) =>
        message.isSentByMe && message.isNew && Date.parse(message.createdAt) >= cutoff,
    );
  }

  function scheduleSweep(): void {
    if (sweepTimer) {
      clearTimeout(sweepTimer);
      sweepTimer = null;
    }
    if (!running || !openConversation) {
      return;
    }
    sweepTimer = setTimeout(() => {
      void runSweep().finally(scheduleSweep);
    }, READ_STATE_SWEEP_MS);
  }

  async function runSweep(): Promise<void> {
    if (!openConversation || !sweepEligible()) {
      return;
    }
    if (now() - sweepLastChangeAt > READ_STATE_SWEEP_IDLE_STOP_MS) {
      return; // auto-stop after 10 min without an isNew flip; reopen re-arms
    }
    const { accountId, chatId } = openConversation;
    try {
      const { messages } = await client.listMessages({
        accountId,
        chatId,
        order: 'desc',
        limit: 50,
        purpose: 'message-tail',
      });
      let flipped = false;
      for (const message of messages) {
        const cached = data.messages.get(accountId, chatId, String(message.id));
        if (cached && cached.isSentByMe && cached.isNew && message.isNew === false) {
          flipped = true;
        }
      }
      data.messages.upsertMany(
        messages.map((message) => mapMessage(accountId, chatId, message, toMediaUrl)),
      );
      if (flipped) {
        sweepLastChangeAt = now();
        emit({ type: 'readStateChanged', accountId, chatId });
      }
    } catch {
      // transient; next sweep retries
    }
  }

  /** OFAPI startDate format ("2025-01-01 00:00:00", per vendored openapi.json
   *  example). Emitted in UTC; upstream TZ semantics are unverified — the
   *  1-hour overlap plus (account_id, tx_id) idempotency absorb any drift. */
  function ofapiStartDate(ms: number): string {
    return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
  }

  /** Incremental transactions walk → fan_transactions. First run covers the
   *  full -30days window; later runs resume from the newest cached row minus
   *  the overlap, so steady state is ~1 page (≈1 credit) per sweep. */
  async function sweepFanSpend(accountId: string): Promise<void> {
    const latest = data.fanTransactions.latestCreatedAt(accountId);
    const sinceMs = latest === null ? null : Date.parse(latest) - SPEND_SWEEP_OVERLAP_MS;
    // Newest-first ordering: stop as soon as a page reaches past the lower bound.
    const lowerBoundMs = sinceMs ?? now() - SPEND_RETENTION_MS;
    const outcome = await paginateMarker<OfApiTransaction>({
      want: {
        kind: 'until',
        predicate: (tx) => tx.createdAt != null && Date.parse(tx.createdAt) < lowerBoundMs,
      },
      maxPages: SPEND_SWEEP_MAX_PAGES,
      sleep,
      idOf: (tx) => String(tx.id),
      fetchPage: async (marker) => {
        const page = await client.listTransactions({
          accountId,
          limit: SPEND_TX_PAGE_LIMIT,
          purpose: 'spend-sweep',
          startDate: sinceMs === null ? '-30days' : ofapiStartDate(sinceMs),
          ...(marker !== null ? { marker } : {}),
        });
        return {
          items: page.transactions,
          nextMarker: page.nextMarker,
          hasMore: page.hasMore,
        };
      },
    });
    const rows = outcome.items
      .map((tx) => mapFanTransaction(accountId, tx))
      .filter((row): row is FanTransactionUpsert => row !== null);
    data.fanTransactions.upsertMany(rows);
    data.fanTransactions.pruneOlderThan(
      accountId,
      new Date(now() - SPEND_RETENTION_MS).toISOString(),
    );
  }

  async function refreshFanDetail(accountId: string, chatId: string): Promise<void> {
    const cached = data.fans.get(accountId, chatId);
    if (cached && now() - Date.parse(cached.fetchedAt) < FAN_DETAIL_TTL_MS) {
      return;
    }
    const username = cached?.username;
    if (!username) {
      return;
    }
    try {
      const user = await client.getUserByUsername({ accountId, username, purpose: 'hydration' });
      data.fans.upsert(mapFan(accountId, user, toMediaUrl, new Date(now()).toISOString()));
    } catch {
      // fail-open (legacy behavior): user-details 404s for deactivated fans —
      // the chat-embedded fan object remains the source.
    }
  }

  return {
    start(accountIds) {
      running = true;
      for (const accountId of accountIds) {
        if (!loops.has(accountId)) {
          loops.set(accountId, {
            timer: null,
            inFlight: false,
            lastSuccessAt: null,
            lastDeepSweepAt: null,
            lastSpendSweepAt: null,
            consecutiveFailures: 0,
          });
        }
        void pollAccount(accountId).finally(() => schedule(accountId, intervalFor(accountId)));
      }
    },
    stop() {
      running = false;
      for (const loop of loops.values()) {
        if (loop.timer) {
          clearTimeout(loop.timer);
        }
        loop.timer = null;
      }
      if (sweepTimer) {
        clearTimeout(sweepTimer);
        sweepTimer = null;
      }
      for (const poller of mediaPollers.values()) {
        clearTimeout(poller.timer);
      }
      mediaPollers.clear();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async refreshChat(accountId, chatId) {
      await fetchChatTail(accountId, chatId);
      emit({ type: 'chatListUpdated', accountId });
    },
    async openConversation(accountId, chatId) {
      openConversation = { accountId, chatId };
      sweepLastChangeAt = now(); // re-arm the idle window on every open
      scheduleSweep();
      await Promise.all([fetchChatTail(accountId, chatId), refreshFanDetail(accountId, chatId)]);
    },
    closeConversation(accountId, chatId) {
      if (
        openConversation &&
        openConversation.accountId === accountId &&
        openConversation.chatId === chatId
      ) {
        openConversation = null;
        if (sweepTimer) {
          clearTimeout(sweepTimer);
          sweepTimer = null;
        }
      }
    },
    setFocusedAccount(accountId) {
      focusedAccount = accountId;
      if (running && accountId && loops.has(accountId)) {
        schedule(accountId, 0); // resume burst on focus
      }
    },
    setWindowVisible(visible) {
      const wasHidden = !windowVisible;
      windowVisible = visible;
      if (running && visible && wasHidden) {
        for (const accountId of loops.keys()) {
          schedule(accountId, 0); // resume burst when the window comes back
        }
      }
    },
    setHubDemoted(demoted) {
      const wasDemoted = hubDemoted;
      hubDemoted = demoted;
      if (running && !demoted && wasDemoted) {
        // Hub dropped: pending timers were scheduled at the slow cadence —
        // reschedule at the restored interval (the composition root's
        // reconciliation forceRefresh covers the immediate gap).
        for (const accountId of loops.keys()) {
          schedule(accountId, intervalFor(accountId));
        }
      }
    },
    async forceRefresh(accountId) {
      const targets = accountId ? [accountId] : [...loops.keys()];
      // Manual refresh = deep sweep: pull DEEP_SWEEP_PAGES, not just page 1.
      await Promise.all(targets.map((target) => pollAccount(target, 'deep')));
    },
    status(): SyncStatusSnapshot {
      const freshness: Record<string, string> = {};
      const pollIntervalsMs: Record<string, number> = {};
      let worstFailures = 0;
      for (const [accountId, loop] of loops) {
        if (loop.lastSuccessAt != null) {
          freshness[accountId] = new Date(loop.lastSuccessAt).toISOString();
        }
        pollIntervalsMs[accountId] = intervalFor(accountId);
        worstFailures = Math.max(worstFailures, loop.consecutiveFailures);
      }
      const state =
        worstFailures >= OFFLINE_AFTER_FAILURES
          ? 'offline'
          : worstFailures > 0
            ? 'degraded'
            : 'live';
      return { freshness, state, pollIntervalsMs, deepSweepEveryMs: DEEP_SWEEP_INTERVAL_MS };
    },
    pollAccount,
  };
}

/** Bootstrap: pull team accounts into the db; returns ids to poll. */
export async function syncAccounts(
  client: OfApiClient,
  data: DataLayer,
  toMediaUrl?: ToMediaUrl,
): Promise<string[]> {
  const accounts = await client.listAccounts({ purpose: 'hydration' });
  data.accounts.upsertMany(accounts.map((account) => mapAccount(account, toMediaUrl)));
  for (const account of accounts) {
    if (account.is_authenticated === false) {
      // surfaced via account auth state; PRD F10 banner reads from db
    }
  }
  return accounts.map((account) => account.id);
}
