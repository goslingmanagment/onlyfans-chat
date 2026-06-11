// PollingSync (SPEC §6.1) — designed as a cost feature. Chat-list poll is the
// primary detector; message fetches happen only on list deltas, as ascending
// tail fetches from the cached boundary. Hot poll reads page 1 only; periodic
// deep sweeps and a one-time initial hydration walk deeper pages (OnlyFans caps
// the chats page size at 10). STRICTLY READ-ONLY toward OFAPI.

import { OFAPI_INTER_PAGE_DELAY_MS } from '@chatgoose/shared';
import type { SyncEvent } from '@chatgoose/shared/protocol/index';
import type { OfApiClient } from '../ofapi/client';
import type { DataLayer } from '../db/index';
import type { OfApiChat } from '../ofapi/schemas';
import type { SleepFn } from '../ofapi/rate-limiter';
import { mapAccount, mapChat, mapFan, mapMessage, type ToMediaUrl } from './mappers';
import type { SyncListener, SyncProvider, SyncStatusSnapshot } from './provider';

const FOCUSED_POLL_MS = 20_000;
const UNFOCUSED_POLL_MS = 60_000;
const HIDDEN_FACTOR = 4;
const BUDGET_FACTOR = 4;
// OnlyFans hard-caps the chats page size at 10 (live-verified 2026-06-11):
// limit>10 is silently truncated, so always page by an explicit 10.
const CHATS_PAGE_LIMIT = 10;
// Recency invariant (order=recent): any chat whose lastMessage changed surfaces
// on page 1, so the hot poll needs page 1 only. Deeper pages matter solely for
// initial load and for read-state/unread drift on older chats — the deep sweep
// covers those.
const DEEP_SWEEP_PAGES = 5;
const DEEP_SWEEP_INTERVAL_MS = 5 * 60_000;
const INITIAL_HYDRATION_MAX_PAGES = 30;
const READ_STATE_SWEEP_MS = 30_000;
const READ_STATE_SWEEP_IDLE_STOP_MS = 10 * 60_000;
const READ_STATE_OWN_MESSAGE_MAX_AGE_MS = 24 * 60 * 60_000;
const MEDIA_READY_POLL_MS = 15_000;
const MEDIA_READY_POLL_CAP_MS = 10 * 60_000;
const FAN_DETAIL_TTL_MS = 5 * 60_000;
const OFFLINE_AFTER_FAILURES = 3;

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
  /**
   * In-memory only: a restart mid-hydration leaves a partial cache and does NOT
   * re-walk 30 pages on next launch — deep sweeps heal the remainder over time.
   */
  hydrated: boolean;
  consecutiveFailures: number;
}

export function createPollingSync(options: PollingSyncOptions): SyncProvider & {
  /** Visible for the composition root: poll one account immediately. */
  pollAccount(accountId: string): Promise<void>;
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
    return base * hidden * budget;
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
  async function fetchChatTail(accountId: string, chatId: string): Promise<string[]> {
    const cachedPage = data.messages.page({ accountId, chatId, limit: 1 });
    const newestCached = cachedPage.items.at(-1)?.messageId;
    const { messages } = newestCached
      ? await client.listMessages({ accountId, chatId, lastId: newestCached, order: 'asc', limit: 100 })
      : await client.listMessages({ accountId, chatId, order: 'desc', limit: 100 });

    const fresh = messages.filter(
      (message) => data.messages.get(accountId, chatId, String(message.id)) === null,
    );
    const upserts = messages.map((message) => mapMessage(accountId, chatId, message, toMediaUrl));
    data.messages.upsertMany(upserts);
    data.messages.prune(accountId, chatId); // retention (SPEC §10: 5,000/chat default)
    trackUnreadyMedia(accountId, chatId, upserts);
    return fresh.map((message) => String(message.id));
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
          .getMessage({ accountId, chatId, messageId: message.messageId })
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

  /** Delta rule (SPEC §6.1): message fetches only when the list shows change. */
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
    const cachedNewest = data.messages
      .page({ accountId, chatId: String(fanId), limit: 1 })
      .items.at(-1)?.messageId;
    return (
      (lastId !== null && lastId !== (cachedNewest ?? null)) ||
      (chat.unreadMessagesCount ?? 0) !== cached.unreadCount ||
      (chat.lastReadMessageId != null ? String(chat.lastReadMessageId) : null) !==
        cached.lastReadMessageId
    );
  }

  /** Walk recency-ordered chat pages (limit/offset cursor; nextPageUrl presence = has-more). */
  async function listChatPages(accountId: string, maxPages: number): Promise<OfApiChat[]> {
    const collected: OfApiChat[] = [];
    const seenFanIds = new Set<string>();
    for (let page = 0; page < maxPages; page += 1) {
      if (page > 0) {
        await sleep(OFAPI_INTER_PAGE_DELAY_MS); // legacy deep-fetch pacing
      }
      const { chats, nextPageUrl } = await client.listChats({
        accountId,
        limit: CHATS_PAGE_LIMIT,
        offset: page * CHATS_PAGE_LIMIT,
        order: 'recent',
        skipUsers: 'none',
      });
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
      if (nextPageUrl === null || chats.length === 0) {
        break;
      }
    }
    return collected;
  }

  async function pollAccount(accountId: string, depth: PollDepth = 'hot'): Promise<void> {
    const loop = loops.get(accountId);
    if (!loop || loop.inFlight) {
      return; // overlap protection — Phase-0 measured p95 7.5 s on list-chats
    }
    loop.inFlight = true;
    try {
      // Initial hydration: empty chats cache → full walk, once per loop lifetime.
      const cacheEmpty =
        data.chats.list({ accountId, filter: 'all', limit: 1 }).items.length === 0;
      const hydrating = !loop.hydrated && cacheEmpty;
      const deepDue =
        depth === 'deep' ||
        loop.lastDeepSweepAt === null ||
        now() - loop.lastDeepSweepAt >= DEEP_SWEEP_INTERVAL_MS;
      const maxPages = hydrating
        ? INITIAL_HYDRATION_MAX_PAGES
        : deepDue
          ? DEEP_SWEEP_PAGES
          : 1; // hot poll: page 1 only — recency invariant, see CHATS_PAGE_LIMIT

      const prevSuccessAt = loop.lastSuccessAt;
      const chats = await listChatPages(accountId, maxPages);

      const deltas: { chatId: string; wasCached: boolean }[] = [];
      const chatUpserts = [];
      const fetchedAt = new Date(now()).toISOString();
      for (const chat of chats) {
        if (chatChanged(accountId, chat)) {
          const fanId = chat.fan?.id;
          if (fanId != null) {
            const chatId = String(fanId);
            deltas.push({ chatId, wasCached: data.chats.get(accountId, chatId) !== null });
          }
        }
        const mapped = mapChat(accountId, chat, toMediaUrl);
        if (mapped) {
          chatUpserts.push(mapped);
        }
        if (chat.fan != null) {
          data.fans.upsert(mapFan(accountId, chat.fan, toMediaUrl, fetchedAt));
        }
      }
      data.chats.upsertMany(chatUpserts);

      // Baseline (first successful poll of this process lifetime, incl. initial
      // hydration): hydrate the DB fully but emit no message-level events —
      // history is not news (notifications/toasts hang off these events).
      for (const delta of deltas) {
        const freshIds = await fetchChatTail(accountId, delta.chatId);
        if (prevSuccessAt === null) {
          continue;
        }
        for (const messageId of freshIds) {
          const row = data.messages.get(accountId, delta.chatId, messageId);
          if (!row) {
            continue;
          }
          // Uncached chat entering the window post-baseline: its tail is mostly
          // backlog — only messages newer than the previous successful poll are live.
          if (!delta.wasCached && Date.parse(row.createdAt) <= prevSuccessAt) {
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
      loop.lastSuccessAt = now();
      loop.hydrated = true;
      if (maxPages > 1) {
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
      const user = await client.getUserByUsername({ accountId, username });
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
            hydrated: false,
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
    async forceRefresh(accountId) {
      const targets = accountId ? [accountId] : [...loops.keys()];
      // Manual refresh = deep sweep: pull DEEP_SWEEP_PAGES, not just page 1.
      await Promise.all(targets.map((target) => pollAccount(target, 'deep')));
    },
    status(): SyncStatusSnapshot {
      const freshness: Record<string, string> = {};
      let worstFailures = 0;
      for (const [accountId, loop] of loops) {
        if (loop.lastSuccessAt != null) {
          freshness[accountId] = new Date(loop.lastSuccessAt).toISOString();
        }
        worstFailures = Math.max(worstFailures, loop.consecutiveFailures);
      }
      const state =
        worstFailures >= OFFLINE_AFTER_FAILURES
          ? 'offline'
          : worstFailures > 0
            ? 'degraded'
            : 'live';
      return { freshness, state };
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
  const accounts = await client.listAccounts();
  data.accounts.upsertMany(accounts.map((account) => mapAccount(account, toMediaUrl)));
  for (const account of accounts) {
    if (account.is_authenticated === false) {
      // surfaced via account auth state; PRD F10 banner reads from db
    }
  }
  return accounts.map((account) => account.id);
}
