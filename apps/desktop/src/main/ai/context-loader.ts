// Feature context assembly (SPEC §8.2 mapping table). Sources: the local db
// first, fetch-through via the metered OFAPI client (GET only — P3 is strictly
// read-only toward OFAPI) when the db is short. All block text formats are the
// shared legacy-locked formatters; values are passed RAW — escapeForPrompt runs
// inside the prompt builder (verified: templateValues escapes transcript,
// spending, subscription, display name, bio and draft — escaping here would
// double-escape).

import { z } from 'zod';
import {
  DEEP_FETCH_MAX_PAGES,
  FAN_DATA_CACHE_TTL_MS,
  MESSAGES_PAGE_LIMIT,
  OFAPI_INTER_PAGE_DELAY_MS,
  TRANSACTIONS_PAGE_CAP,
} from '@chatgoose/shared/constants';
import {
  estimateTargetPages,
  extractOldestMessageId,
  normalizeTranscriptMessages,
} from '@chatgoose/shared/transcript/index';
import type { OfapiChatMessage, TranscriptMessage } from '@chatgoose/shared/transcript/index';
import {
  deriveMonthlyBreakdowns,
  deriveMonthlyTotals,
  formatFanSpendingData,
} from '@chatgoose/shared/context/spending';
import type { FanTransactionRow, SpendingSums } from '@chatgoose/shared/context/spending';
import { formatFanSubscriptionData } from '@chatgoose/shared/context/subscription';
import type {
  FanSubscriptionInput,
  SubscribedOnData,
  SubscribeHistoryEntry,
} from '@chatgoose/shared/context/subscription';
import type { OfApiPurpose } from '@chatgoose/shared/activity/index';
import type { DataLayer, FanRow, MessageRow } from '../db/index';
import type { OfApiClient } from '../ofapi/client';
import type { OfApiSubscribedOnData, OfApiUser } from '../ofapi/schemas';
import { signedTransactionAmounts } from '../ofapi/transactions';

export interface ContextLoaderOptions {
  data: Pick<DataLayer, 'messages' | 'fans' | 'chats'>;
  client: Pick<
    OfApiClient,
    'listMessages' | 'getUserByUsername' | 'getUsersByIds' | 'listTransactions'
  >;
  now?: () => number;
  /** Inter-page pacing sleep; injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
}

export interface LoadTranscriptArgs {
  accountId: string;
  chatId: string;
  /** Last-N window: quick 100 / improve 25 / deep 1500 / … from settings (SPEC §8.4). */
  count: number;
  /**
   * Deep features (fan-summary/chat-review) are cache-first: db rows are
   * reused and only the gap of OLDER history below the oldest cached row is
   * fetched. Quick features re-fetch the whole window from the top instead.
   */
  deep?: boolean;
  /**
   * When false/omitted, the OFAPI fetch-through (listMessages paging when the
   * db window is short) is suppressed and the transcript is served purely from
   * already-cached db rows. The fetch-through is a message-body read that marks
   * the fan read on OnlyFans, so it is allowed only when settings.autoReadChats
   * is on (passed by the coordinator). True restores legacy fetch-through.
   */
  allowFetchThrough?: boolean;
  signal?: AbortSignal;
  onPage?: (currentPage: number, targetPages: number) => void;
}

export interface FanContextArgs {
  accountId: string;
  chatId: string;
  /** Deep features bill their context fetches to 'scan-deep-fetch'. */
  deep?: boolean;
  signal?: AbortSignal;
}

export interface FanContextBlock {
  /** Legacy-locked block text; '' when no data. */
  block: string;
  /**
   * The live OFAPI lookup succeeded this run — feeds the summary-cache
   * spendingVerified/subscriptionVerified flags (SPEC §8.5: a summary built
   * from degraded/db-fallback context must not be cached as authoritative).
   */
  verified: boolean;
}

export interface ContextLoader {
  loadTranscript(args: LoadTranscriptArgs): Promise<TranscriptMessage[]>;
  /** Custom name > name (SPEC §8.2); db-backed, falls back to the chat row, then the id. */
  resolveFanDisplayName(accountId: string, chatId: string): string;
  /** FAN SPENDING DATA block. Optional stage: fetch failures degrade, never throw. */
  loadSpendingBlock(args: FanContextArgs): Promise<FanContextBlock>;
  /** FAN SUBSCRIPTION DATA block. Optional stage like spending. */
  loadSubscriptionBlock(args: FanContextArgs): Promise<FanContextBlock>;
  /**
   * Fan bio for hi-greeting (SPEC §8.2: `GET /{account}/users/{username}`
   * `about`). Optional stage — absent username, fetch failure or an empty
   * bio resolve to undefined; a failed live fetch falls back to the synced
   * fan row's copy.
   */
  loadFanBio(args: FanContextArgs): Promise<string | undefined>;
}

// ─── helpers ──────────────────────────────────────────────────────────────

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * db row → the shared transcript-normalizer input shape. SPEC §8.2 tip rule:
 * a tip message's `text` is platform boilerplate in the fan's UI language —
 * the fan's words live in `tipText`, so it substitutes for `text` here.
 */
function rowToTranscriptInput(row: MessageRow): OfapiChatMessage {
  return {
    id: Number(row.messageId),
    createdAt: row.createdAt,
    isSentByMe: row.isSentByMe,
    text: row.isTip ? (row.tipText ?? '') : row.textHtml,
    price: row.price,
    isOpened: row.isOpened,
    isNew: row.isNew,
    isTip: row.isTip,
    tipAmount: row.tipAmount,
    mediaCount: row.media.length,
    media: row.media.map((item) => ({ id: item.id, type: item.type })),
  };
}

/** Same tip-text substitution for fetch-through messages (they carry tipText). */
const tipTextSchema = z.looseObject({ tipText: z.string().nullish() });

function fetchedToTranscriptInput(message: OfapiChatMessage): OfapiChatMessage {
  if (message.isTip !== true) {
    return message;
  }
  const extras = tipTextSchema.safeParse(message);
  return { ...message, text: extras.success ? (extras.data.tipText ?? '') : '' };
}

function isAbort(error: unknown, signal: AbortSignal | undefined): boolean {
  return Boolean(signal?.aborted) || (error instanceof Error && error.name === 'AbortError');
}

// OfApiSubscribedOnData is a loose parse: typed fields are read directly, the
// fields the loose schema does not declare (subscribes history, promo extras)
// are re-validated here before entering the legacy-locked formatter.
const subscriptionExtrasSchema = z.looseObject({
  regularPrice: z.number().nullish(),
  newPrice: z.number().nullish(),
  discountPeriod: z.number().nullish(),
  subscribes: z
    .array(
      z.looseObject({
        isCurrent: z.boolean().nullish(),
        cancelDate: z.string().nullish(),
        expireDate: z.string().nullish(),
        startDate: z.string().nullish(),
      }),
    )
    .nullish(),
});

const userExtrasSchema = z.looseObject({ subscribedOnExpiredNow: z.boolean().nullish() });

function toSubscribedOnData(sub: OfApiSubscribedOnData): SubscribedOnData {
  const extrasParsed = subscriptionExtrasSchema.safeParse(sub);
  const extras = extrasParsed.success ? extrasParsed.data : null;
  const subscribes: SubscribeHistoryEntry[] | null =
    extras?.subscribes != null
      ? extras.subscribes.map((entry) => ({
          isCurrent: entry.isCurrent ?? null,
          cancelDate: entry.cancelDate ?? null,
          expireDate: entry.expireDate ?? null,
          startDate: entry.startDate ?? null,
        }))
      : null;
  return {
    subscribeAt: sub.subscribeAt ?? null,
    expiredAt: sub.expiredAt ?? null,
    renewedAt: sub.renewedAt ?? null,
    duration: sub.duration ?? null,
    subscribePrice: sub.subscribePrice ?? null,
    regularPrice: extras?.regularPrice ?? null,
    price: sub.price ?? null,
    newPrice: extras?.newPrice ?? null,
    discountPercent: sub.discountPercent ?? null,
    discountPeriod: extras?.discountPeriod ?? null,
    unsubscribeReason: sub.unsubscribeReason ?? null,
    hasActivePaidSubscriptions: sub.hasActivePaidSubscriptions ?? null,
    subscribes,
  };
}

function userToSubscriptionInput(user: OfApiUser): FanSubscriptionInput {
  const extras = userExtrasSchema.safeParse(user);
  return {
    subscribedOn: user.subscribedOn ?? null,
    subscribedOnExpiredNow: extras.success ? (extras.data.subscribedOnExpiredNow ?? null) : null,
    subscribedOnData: user.subscribedOnData != null ? toSubscribedOnData(user.subscribedOnData) : null,
  };
}

/**
 * Degraded fallback when the live fan fetch fails: rebuild a minimal input
 * from the synced fan row. The cancelDate value is only ever null-checked by
 * resolveAutoRenew, so a marker string is enough to carry "renew off".
 */
function dbFanToSubscriptionInput(fan: FanRow): FanSubscriptionInput | null {
  const sub = fan.subscription;
  if (sub === null) {
    return null;
  }
  if (sub.status === 'none') {
    return { subscribedOn: false, subscribedOnData: null };
  }
  return {
    subscribedOn: true,
    subscribedOnExpiredNow: sub.status === 'expired',
    subscribedOnData: {
      subscribeAt: sub.subscribedAt,
      renewedAt: sub.renewsAt,
      duration: sub.durationLabel,
      subscribePrice: sub.priceUsd,
      subscribes: [
        {
          isCurrent: sub.status === 'active',
          cancelDate: sub.autoRenewOff ? 'cancelled' : null,
        },
      ],
    },
  };
}

function userToSpendingSums(user: OfApiUser): SpendingSums | null {
  const sub = user.subscribedOnData;
  if (sub == null || sub.totalSumm == null) {
    return null;
  }
  return {
    totalSumm: sub.totalSumm,
    subscribesSumm: sub.subscribesSumm ?? null,
    tipsSumm: sub.tipsSumm ?? null,
    messagesSumm: sub.messagesSumm ?? null,
    postsSumm: sub.postsSumm ?? null,
    streamsSumm: sub.streamsSumm ?? null,
  };
}

function dbFanToSpendingSums(fan: FanRow): SpendingSums | null {
  const spending = fan.spending;
  if (spending === null) {
    return null;
  }
  return {
    totalSumm: spending.total,
    subscribesSumm: spending.subscriptions,
    tipsSumm: spending.tips,
    messagesSumm: spending.messages,
    postsSumm: spending.posts,
    streamsSumm: spending.streams,
  };
}

interface CachedValue<T> {
  value: T;
  at: number;
}

// ─── factory ──────────────────────────────────────────────────────────────

export function createContextLoader(options: ContextLoaderOptions): ContextLoader {
  const { data, client } = options;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;

  const userCache = new Map<string, CachedValue<OfApiUser>>();
  const transactionsCache = new Map<
    string,
    CachedValue<{ rows: FanTransactionRow[]; partial: boolean }>
  >();

  function cacheKey(accountId: string, chatId: string): string {
    return `${accountId}|${chatId}`;
  }

  function fresh<T>(entry: CachedValue<T> | undefined): T | undefined {
    if (entry !== undefined && now() - entry.at < FAN_DATA_CACHE_TTL_MS) {
      return entry.value;
    }
    return undefined;
  }

  /** On-demand fan detail (one mass-list GET, 5-min cache). null = fetch failed (optional stage). */
  async function getUser(
    accountId: string,
    chatId: string,
    signal: AbortSignal | undefined,
    purpose: OfApiPurpose,
  ): Promise<OfApiUser | null> {
    const key = cacheKey(accountId, chatId);
    const cached = fresh(userCache.get(key));
    if (cached !== undefined) {
      return cached;
    }
    try {
      signal?.throwIfAborted();
      const users = await client.getUsersByIds({ accountId, ids: [chatId], purpose });
      const user = users[chatId];
      if (user === undefined) {
        return null;
      }
      userCache.set(key, { value: user, at: now() });
      return user;
    } catch (error) {
      if (isAbort(error, signal)) {
        throw error;
      }
      return null;
    }
  }

  /** Monthly spending source: marker-paginated /transactions, cap 5 pages, filtered to the fan. */
  async function getFanTransactions(
    accountId: string,
    chatId: string,
    signal: AbortSignal | undefined,
    purpose: OfApiPurpose,
  ): Promise<{ rows: FanTransactionRow[]; partial: boolean } | null> {
    const key = cacheKey(accountId, chatId);
    const cached = fresh(transactionsCache.get(key));
    if (cached !== undefined) {
      return cached;
    }

    const rows: FanTransactionRow[] = [];
    let partial = false;
    let marker: number | undefined;
    let fetchedAnyPage = false;
    try {
      for (let page = 1; page <= TRANSACTIONS_PAGE_CAP; page += 1) {
        signal?.throwIfAborted();
        const result = await client.listTransactions({
          accountId,
          purpose,
          ...(marker !== undefined ? { marker } : {}),
        });
        fetchedAnyPage = true;
        for (const tx of result.transactions) {
          const signed = signedTransactionAmounts(tx);
          if (
            tx.user?.id != null &&
            String(tx.user.id) === chatId &&
            signed !== null &&
            tx.createdAt != null
          ) {
            rows.push({ type: tx.type ?? '', amount: signed.amount, date: tx.createdAt });
          }
        }
        if (result.hasMore !== true || result.nextMarker === null) {
          break;
        }
        if (page === TRANSACTIONS_PAGE_CAP) {
          partial = true;
          break;
        }
        marker = result.nextMarker;
      }
    } catch (error) {
      if (isAbort(error, signal)) {
        throw error;
      }
      if (!fetchedAnyPage) {
        return null;
      }
      partial = true;
    }
    const value = { rows, partial };
    transactionsCache.set(key, { value, at: now() });
    return value;
  }

  return {
    async loadTranscript({ accountId, chatId, count, deep, signal, onPage, allowFetchThrough }) {
      const page = data.messages.page({ accountId, chatId, limit: count });
      const rows = page.items.filter((row) => !row.deleted);

      // Fetch-through (newest-first, first_id scrollback) only when the db
      // window is short; failures fail open onto whatever is already local.
      // Quick: re-fetch the whole window from the top. Deep: cache-first —
      // fetch only the gap of older history, cursoring from the oldest cached
      // row (first_id is boundary-inclusive; the dedupe collapses the overlap).
      const fetched: OfapiChatMessage[] = [];
      // Fetch-through is an AUTOMATIC OFAPI message-body read (the GET marks the
      // chat read on OnlyFans). Run it only when auto-read is enabled; otherwise
      // serve the transcript purely from locally-cached rows (needed = 0), so AI
      // never marks a fan read.
      const needed = allowFetchThrough
        ? deep === true
          ? count - rows.length
          : rows.length < count
            ? count
            : 0
        : 0;
      if (needed > 0) {
        const targetPages = Math.min(estimateTargetPages(needed), DEEP_FETCH_MAX_PAGES);
        let cursor: string | undefined = deep === true ? rows[0]?.messageId : undefined;
        for (let pageNo = 1; pageNo <= targetPages; pageNo += 1) {
          signal?.throwIfAborted();
          onPage?.(pageNo, targetPages);
          let result: Awaited<ReturnType<OfApiClient['listMessages']>>;
          try {
            result = await client.listMessages({
              accountId,
              chatId,
              limit: MESSAGES_PAGE_LIMIT,
              order: 'desc',
              purpose: deep === true ? 'scan-deep-fetch' : 'message-tail',
              ...(cursor !== undefined ? { firstId: cursor } : {}),
            });
          } catch (error) {
            if (isAbort(error, signal) || (rows.length === 0 && fetched.length === 0)) {
              throw error;
            }
            break;
          }
          fetched.push(...result.messages);
          if (
            fetched.length >= needed ||
            result.messages.length === 0 ||
            result.nextPageUrl === null
          ) {
            break;
          }
          const oldest = extractOldestMessageId(result.messages);
          if (oldest === null) {
            break;
          }
          cursor = String(oldest);
          if (pageNo < targetPages) {
            await sleep(OFAPI_INTER_PAGE_DELAY_MS);
          }
        }
      }

      // SPEC §8.2 tip ladder step 2: amounts joined from local rows by id.
      const tipAmountsByMessageId = new Map<number, number>();
      for (const row of rows) {
        if (row.tipAmount !== null && row.tipAmount > 0) {
          tipAmountsByMessageId.set(Number(row.messageId), row.tipAmount);
        }
      }

      const normalized = normalizeTranscriptMessages(
        // Fresh OFAPI data first: dedupe keeps the first occurrence per id.
        [...fetched.map(fetchedToTranscriptInput), ...rows.map(rowToTranscriptInput)],
        { tipAmountsByMessageId },
      );
      return normalized.slice(-count);
    },

    resolveFanDisplayName(accountId, chatId) {
      const fan = data.fans.get(accountId, chatId);
      if (fan !== null) {
        const custom = fan.customName?.trim();
        if (custom) {
          return custom;
        }
        if (fan.name.trim()) {
          return fan.name;
        }
      }
      const chat = data.chats.get(accountId, chatId);
      if (chat !== null && chat.fanName.trim()) {
        return chat.fanName;
      }
      return chatId;
    },

    async loadSpendingBlock({ accountId, chatId, deep, signal }) {
      // Quick features refresh fan details (hydration cost); deep Scans bill
      // their context fetches to the scan-deep-fetch ledger row.
      const purpose: OfApiPurpose = deep === true ? 'scan-deep-fetch' : 'hydration';
      const user = await getUser(accountId, chatId, signal, purpose);
      const dbFan = data.fans.get(accountId, chatId);
      const liveSums = user !== null ? userToSpendingSums(user) : null;
      // Legacy spendingDataVerified semantics: the live lookup produced data
      // this run; the db fallback is unverified by definition.
      const verified = liveSums !== null;
      const sums = liveSums ?? (dbFan !== null ? dbFanToSpendingSums(dbFan) : null);
      if (sums === null) {
        return { block: '', verified };
      }

      const transactions = await getFanTransactions(accountId, chatId, signal, purpose);
      const monthlyTotals = transactions !== null ? deriveMonthlyTotals(transactions.rows) : [];
      const monthlyBreakdowns =
        transactions !== null ? deriveMonthlyBreakdowns(transactions.rows) : [];
      const block = formatFanSpendingData({
        fanId: chatId,
        sums,
        monthlyTotals,
        monthlyBreakdowns,
        monthlyBreakdownsPartial: transactions === null ? true : transactions.partial,
      });
      return { block, verified };
    },

    async loadSubscriptionBlock({ accountId, chatId, deep, signal }) {
      const user = await getUser(accountId, chatId, signal, deep === true ? 'scan-deep-fetch' : 'hydration');
      if (user !== null) {
        // Legacy subscriptionLookupVerified: the lookup COMPLETED in full —
        // verified even when the fan has no subscription data.
        return { block: formatFanSubscriptionData(userToSubscriptionInput(user), now()), verified: true };
      }
      const dbFan = data.fans.get(accountId, chatId);
      if (dbFan !== null) {
        return { block: formatFanSubscriptionData(dbFanToSubscriptionInput(dbFan), now()), verified: false };
      }
      return { block: '', verified: false };
    },

    async loadFanBio({ accountId, chatId, signal }) {
      const fan = data.fans.get(accountId, chatId);
      const username = fan?.username.trim() ?? '';
      if (username !== '') {
        try {
          signal?.throwIfAborted();
          const user = await client.getUserByUsername({ accountId, username, purpose: 'hydration' });
          // A successful live answer is authoritative — an empty live bio
          // means the bio was removed, so the synced copy must not resurrect it.
          const about = user.about?.trim();
          return about ? about : undefined;
        } catch (error) {
          if (isAbort(error, signal)) {
            throw error;
          }
          // fall through to the synced copy
        }
      }
      const dbAbout = fan?.about?.trim();
      return dbAbout ? dbAbout : undefined;
    },
  };
}
