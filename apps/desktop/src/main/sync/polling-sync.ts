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
import type { NormalizedSyncMessage, SyncEvent } from '@chatgoose/shared/protocol/index';
import type { ChatListFilter, OfApiClient } from '../ofapi/client';
import type { ChatRow, ChatUpsert, DataLayer, FanTransactionUpsert, MessageUpsert } from '../db/index';
import type { OfApiChat, OfApiMessage, OfApiTransaction } from '../ofapi/schemas';
import { paginateFirstLastId, paginateMarker } from '../ofapi/pagination';
import type { SleepFn } from '../ofapi/rate-limiter';
import {
  mapAccount,
  mapChat,
  mapFan,
  mapFanTransaction,
  mapHubMessage,
  mapMessage,
  type ToMediaUrl,
} from './mappers';
import { compareMessageIds } from './message-id';
import type {
  SyncListener,
  SyncProvider,
  SyncStatusSnapshot,
  UnreadReconcileTrigger,
} from './provider';

const FOCUSED_POLL_MS = 20_000;
const UNFOCUSED_POLL_MS = 60_000;
const HIDDEN_FACTOR = 4;
const BUDGET_FACTOR = 4;
// SPEC §6.2: while hub SSE is live, the periodic chat-list poll pauses after
// initial hydration finishes. Id-only and notification hub frames use this
// debounce window to coalesce body-free list refreshes when auto-read is off.
const HUB_LIST_REFRESH_DEBOUNCE_MS = 2_000;
/** A steady stream of thin Hub frames must not postpone the durable list read
 * forever. The trailing debounce coalesces bursts, while this independent cap
 * guarantees that the shared obligation eventually runs. */
const HUB_LIST_REFRESH_MAX_WAIT_MS = 10_000;
/** D1-N2 (W4.2): gap-recovery reconcile waits out an in-flight poll tick. */
const RECONCILE_INFLIGHT_WAIT_MS = 250;
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
const USER_OPEN_COLD_PAGE_LIMIT = 30;
const USER_BACKFILL_PAGE_LIMIT = 30;
const USER_OPEN_BACKFILL_THRESHOLD = 30;
/** Automatic catch-up can span the full retained local window. Reaching this
 * guard without seeing the list's known head is a failed poll, never coverage. */
const POLL_DELTA_MAX_PAGES = 500;
// Fan-spend sweep (DESIGN §1 30-day figure): the first walk pulls the full
// -30days transactions window once; every later sweep starts at the newest
// cached row minus an overlap, so steady state is ~1 page per sweep. Page
// limit 10 = the documented recommendation (vendored openapi.json); larger
// values are unverified upstream. Runs only after hydration completes — the
// initial walk must not compete with the chat-list hydration for credits.
const LEGACY_SPEND_SWEEP_INTERVAL_MS = 10 * 60_000;
const REDUCED_SPEND_SWEEP_INTERVAL_MS = 60 * 60_000;
const SPEND_TX_PAGE_LIMIT = 10;
const SPEND_SWEEP_MAX_PAGES = 100;
const SPEND_SWEEP_OVERLAP_MS = 60 * 60_000;
const SPEND_INITIAL_WINDOW_MS = 30 * 24 * 60 * 60_000;
/**
 * Retention horizon (Stage 4 stop-loss: ~10× the legacy 31 d) — transactions
 * are business facts and the kernel holds no copy yet; the read window stays
 * 30 d, only the prune cutoff moved.
 */
const SPEND_RETENTION_MS = 310 * 24 * 60 * 60_000;

/** Versioned coverage state makes existing installs perform one trustworthy
 * full-window backfill after this fix, even when their old capped sweep already
 * left a newest row that would otherwise masquerade as complete coverage. */
const spendCoverageSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('backfill'),
    startDate: z.string(),
    nextMarker: z.number().int().nonnegative().nullable(),
    pagesCompleted: z.number().int().nonnegative(),
  }),
  z.object({
    status: z.literal('complete'),
    completedAt: z.string(),
  }),
]);
type SpendCoverage = z.infer<typeof spendCoverageSchema>;

function spendCoverageKey(accountId: string): string {
  return `sync.spendCoverage.v1.${accountId}`;
}

export interface UnreadReconcileSettings {
  enabled: boolean;
  triggerOnUnreadTabOpen: boolean;
  triggerOnWindowFocus: boolean;
  triggerOnAccountFocus: boolean;
  focusDebounceMs: number;
  immediateMaxPages: number;
  focusedIntervalMs: number;
  focusedMaxPages: number;
  hiddenEnabled: boolean;
  hiddenIntervalMs: number;
  hiddenMaxPages: number;
}

export const DEFAULT_UNREAD_RECONCILE_SETTINGS: UnreadReconcileSettings = {
  enabled: true,
  triggerOnUnreadTabOpen: true,
  triggerOnWindowFocus: true,
  triggerOnAccountFocus: true,
  focusDebounceMs: 30_000,
  immediateMaxPages: 3,
  focusedIntervalMs: 5 * 60_000,
  focusedMaxPages: 2,
  hiddenEnabled: true,
  hiddenIntervalMs: 15 * 60_000,
  hiddenMaxPages: 1,
};

export interface PollingSyncOptions {
  client: OfApiClient;
  data: DataLayer;
  toMediaUrl: ToMediaUrl;
  /** ×4 polling slowdown when the shift credit budget is exhausted (never stops). */
  isBudgetExhausted?: () => boolean;
  /**
   * Gate for AUTOMATIC OFAPI message-body reads (settings.autoReadChats).
   * Default OFF: poll-delta tail fetches, the read-state sweep and background
   * media polling are skipped because each such GET marks the chat read on
   * OnlyFans. The chat-list poll (listChats) and openConversation are NOT
   * gated — the list never marks read, and an explicit open is the one
   * sanctioned read.
   */
  autoReadEnabled?: () => boolean;
  /**
   * D6 rollback guard. True keeps the legacy 10-minute fan-spend sweep.
   * The future reduced-cadence branch must be gated behind false.
   */
  spendSweepRollbackToLegacy?: () => boolean;
  /**
   * Stage 12: while a harvest is incomplete, retention prunes are frozen —
   * a prune could delete rows the harvest walk has not reached yet, losing
   * them before they ever hit the kernel. Rows only accumulate meanwhile.
   */
  isPruneFrozen?: () => boolean;
  /** Body-free list-only read-state reconcile for hub-live unread drift. */
  unreadReconcileSettings?: () => Partial<UnreadReconcileSettings> | undefined;
  now?: () => number;
  /** Inter-page pacing during multi-page chat walks (injectable for tests). */
  sleep?: SleepFn;
  /** DIAGNOSTIC (temporary, 2026-06-23): structured log sink for open-tail outcome. */
  onLog?: (
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    fields?: Record<string, unknown>,
  ) => void;
  /** DIAGNOSTIC (temporary, 2026-06-23): current OFAPI read transport label. */
  readTransport?: () => string | null | undefined;
}

type PollDepth = 'hot' | 'deep';

interface AccountLoop {
  timer: ReturnType<typeof setTimeout> | null;
  spendTimer: ReturnType<typeof setTimeout> | null;
  unreadReconcileTimer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  spendInFlight: boolean;
  unreadReconcileInFlight: boolean;
  lastSuccessAt: number | null;
  lastDeepSweepAt: number | null;
  lastSpendSweepAt: number | null;
  lastUnreadReconcileAt: number | null;
  consecutiveFailures: number;
}

function createAccountLoopState(): AccountLoop {
  return {
    timer: null,
    spendTimer: null,
    unreadReconcileTimer: null,
    inFlight: false,
    spendInFlight: false,
    unreadReconcileInFlight: false,
    lastSuccessAt: null,
    lastDeepSweepAt: null,
    lastSpendSweepAt: null,
    lastUnreadReconcileAt: null,
    consecutiveFailures: 0,
  };
}

interface PendingHubListRefresh {
  timer: ReturnType<typeof setTimeout> | null;
  maxWaitTimer: ReturnType<typeof setTimeout> | null;
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
}

interface ThreadHistoryCoverage {
  hasOlder: boolean;
  lastErrorCode: string | null;
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

function safeErrorOutcome(error: unknown): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (error instanceof Error) {
    fields['errorName'] = error.name;
  }
  if (error === null || typeof error !== 'object') {
    fields['valueType'] = typeof error;
    return fields;
  }
  const record = error as Record<string, unknown>;
  if (typeof record['code'] === 'string') {
    fields['errorCode'] = record['code'];
  }
  if (typeof record['upstreamStatus'] === 'number') {
    fields['upstreamStatus'] = record['upstreamStatus'];
  }
  const detail = record['detail'];
  if (detail !== null && typeof detail === 'object') {
    const detailRecord = detail as Record<string, unknown>;
    if (typeof detailRecord['status'] === 'number') {
      fields['httpStatus'] = detailRecord['status'];
    }
    if (typeof detailRecord['retryAfterMs'] === 'number') {
      fields['retryAfterMs'] = detailRecord['retryAfterMs'];
    }
  }
  return fields;
}

function safeMessageCount(data: DataLayer, accountId: string, chatId: string): number | null {
  try {
    return data.messages.count(accountId, chatId);
  } catch {
    return null;
  }
}

function safeChatLastMessageId(data: DataLayer, accountId: string, chatId: string): string | null {
  try {
    return data.chats.get(accountId, chatId)?.lastMessageId ?? null;
  } catch {
    return null;
  }
}

export function createPollingSync(options: PollingSyncOptions): SyncProvider & {
  /** Visible for the composition root: poll one account immediately. */
  pollAccount(accountId: string): Promise<void>;
  /** Hub-live automatic chat-list polling suspension; read-state sweeps unaffected. */
  setHubPollingSuspended(suspended: boolean): void;
  /** Event-driven, body-free page-1 list refresh for hub account-level activity. */
  refreshAccountHead(accountId: string): Promise<void>;
  /** Awaitable page-1 refresh that shares the account's poll single-flight guard. */
  reconcileAccountHeadNow(accountId: string): Promise<void>;
  /** Refresh read-gateway account grants and reconfigure active polling loops. */
  refreshAccountGrants(): Promise<string[]>;
  /** Body-free local ingestion for enriched hub message events. */
  ingestHubMessage(
    accountId: string,
    chatId: string,
    message: NormalizedSyncMessage,
  ): Promise<boolean>;
  /** Body-free `filter=unread` read-state reconcile (no message bodies, no mark-read). */
  reconcileUnread(accountId?: string, trigger?: UnreadReconcileTrigger): Promise<void>;
} {
  const { client, data, toMediaUrl } = options;
  const now = options.now ?? Date.now;
  const isBudgetExhausted = options.isBudgetExhausted ?? ((): boolean => false);
  const autoReadEnabled = options.autoReadEnabled ?? ((): boolean => false);
  const spendSweepRollbackToLegacy =
    options.spendSweepRollbackToLegacy ?? ((): boolean => false);
  const isPruneFrozen = options.isPruneFrozen ?? ((): boolean => false);
  const pruneMessages = (accountId: string, chatId: string): void => {
    if (!isPruneFrozen()) {
      data.messages.prune(accountId, chatId);
    }
  };
  const unreadReconcileSettings =
    options.unreadReconcileSettings ?? ((): Partial<UnreadReconcileSettings> | undefined => undefined);
  const sleep: SleepFn =
    options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const onLog = options.onLog ?? ((): void => undefined);
  const readTransport = options.readTransport ?? ((): string | null | undefined => undefined);

  const listeners = new Set<SyncListener>();
  const loops = new Map<string, AccountLoop>();
  const activeTasks = new Set<Promise<unknown>>();
  let running = false;
  let stopping: Promise<void> | null = null;
  let focusedAccount: string | null = null;
  let windowVisible = true;
  let hubPollingSuspended = false;
  let openConversation: { accountId: string; chatId: string } | null = null;

  let sweepTimer: ReturnType<typeof setTimeout> | null = null;
  let sweepLastChangeAt = 0;
  const mediaPollers = new Map<string, { startedAt: number; timer: ReturnType<typeof setTimeout> }>();
  const hubListRefreshes = new Map<string, PendingHubListRefresh>();
  const historyCoverage = new Map<string, ThreadHistoryCoverage>();

  function trackActive<T>(task: Promise<T>): Promise<T> {
    activeTasks.add(task);
    void task.then(
      () => activeTasks.delete(task),
      () => activeTasks.delete(task),
    );
    return task;
  }

  async function drainActiveTasks(): Promise<void> {
    // A finishing task may have synchronously enrolled a nested continuation
    // before observing `running = false`; keep taking snapshots until the set
    // is genuinely empty.
    while (activeTasks.size > 0) {
      const snapshot = [...activeTasks];
      await Promise.allSettled(snapshot);
      for (const task of snapshot) {
        activeTasks.delete(task);
      }
    }
  }

  function historyKey(accountId: string, chatId: string): string {
    return `${accountId}/${chatId}`;
  }

  function emit(event: SyncEvent): void {
    for (const listener of listeners) {
      listener(event);
    }
  }

  function shouldSuspendLoop(accountId: string): boolean {
    return hubPollingSuspended && readHydration(accountId).done;
  }

  function intervalFor(accountId: string): number | null {
    if (shouldSuspendLoop(accountId)) {
      return null;
    }
    const base = accountId === focusedAccount ? FOCUSED_POLL_MS : UNFOCUSED_POLL_MS;
    const hidden = windowVisible ? 1 : HIDDEN_FACTOR;
    const budget = isBudgetExhausted() ? BUDGET_FACTOR : 1;
    return base * hidden * budget;
  }

  function spendSweepIntervalMs(): number {
    if (spendSweepRollbackToLegacy()) {
      return LEGACY_SPEND_SWEEP_INTERVAL_MS;
    }
    // Core transactions.new projection is authoritative after the clean
    // production shadow comparison. Keep an hourly reconcile for estimated PPV
    // and fixture-blocked tips until those domains gain authoritative contracts.
    return REDUCED_SPEND_SWEEP_INTERVAL_MS;
  }

  function unreadSettings(): UnreadReconcileSettings {
    return { ...DEFAULT_UNREAD_RECONCILE_SETTINGS, ...(unreadReconcileSettings() ?? {}) };
  }

  function listLocalUnreadChats(accountId: string): ChatRow[] {
    const out: ChatRow[] = [];
    const limit = 500;
    let offset = 0;
    for (;;) {
      const page = data.chats.list({ accountId, filter: 'unread', limit, offset });
      out.push(...page.items);
      if (!page.hasMore || page.items.length === 0) {
        break;
      }
      offset += page.items.length;
    }
    return out;
  }

  function hasLocalUnread(accountId: string): boolean {
    return data.chats.list({ accountId, filter: 'unread', limit: 1 }).items.length > 0;
  }

  function unreadIntervalFor(accountId: string): number | null {
    const settings = unreadSettings();
    if (
      !settings.enabled ||
      !running ||
      focusedAccount !== accountId ||
      !shouldSuspendLoop(accountId) ||
      !hasLocalUnread(accountId)
    ) {
      return null;
    }
    if (windowVisible) {
      return settings.focusedIntervalMs;
    }
    return settings.hiddenEnabled ? settings.hiddenIntervalMs : null;
  }

  function unreadTimerMaxPages(): number {
    const settings = unreadSettings();
    return windowVisible ? settings.focusedMaxPages : settings.hiddenMaxPages;
  }

  function triggerAllowed(trigger: UnreadReconcileTrigger, settings: UnreadReconcileSettings): boolean {
    if (trigger === 'unread-tab') return settings.triggerOnUnreadTabOpen;
    if (trigger === 'window-focus') return settings.triggerOnWindowFocus;
    if (trigger === 'account-focus') return settings.triggerOnAccountFocus;
    return true;
  }

  function scheduleUnreadReconcile(accountId: string, delayMs = unreadIntervalFor(accountId)): void {
    const loop = loops.get(accountId);
    if (!loop) {
      return;
    }
    if (loop.unreadReconcileTimer) {
      clearTimeout(loop.unreadReconcileTimer);
      loop.unreadReconcileTimer = null;
    }
    if (!running || delayMs === null) {
      return;
    }
    loop.unreadReconcileTimer = setTimeout(() => {
      void runUnreadReconcile(accountId, unreadTimerMaxPages(), 'timer').finally(() =>
        scheduleUnreadReconcile(accountId),
      );
    }, delayMs);
  }

  function armUnreadReconcile(accountId: string): void {
    const loop = loops.get(accountId);
    if (!loop || loop.unreadReconcileTimer) {
      return;
    }
    scheduleUnreadReconcile(accountId);
  }

  function scheduleAllUnreadReconcile(): void {
    for (const accountId of loops.keys()) {
      scheduleUnreadReconcile(accountId);
    }
  }

  function schedule(accountId: string, delayMs: number | null): void {
    const loop = loops.get(accountId);
    if (!loop) {
      return;
    }
    if (loop.timer) {
      clearTimeout(loop.timer);
      loop.timer = null;
    }
    if (!running || delayMs === null) {
      return;
    }
    loop.timer = setTimeout(() => {
      void pollAccount(accountId).finally(() => schedule(accountId, intervalFor(accountId)));
    }, delayMs);
  }

  function scheduleBurst(accountId: string): void {
    schedule(accountId, intervalFor(accountId) === null ? null : 0);
  }

  function clearHubListRefreshes(): void {
    for (const pending of hubListRefreshes.values()) {
      if (pending.timer) {
        clearTimeout(pending.timer);
      }
      if (pending.maxWaitTimer) {
        clearTimeout(pending.maxWaitTimer);
      }
      pending.reject(new Error('PollingSync stopped before Hub list reconciliation completed'));
    }
    hubListRefreshes.clear();
  }

  function removeAccountLoop(accountId: string): void {
    const loop = loops.get(accountId);
    if (!loop) {
      return;
    }
    // Delete first: completions from already-in-flight work may still apply
    // idempotent cache rows, but every finally/scheduler sees no active loop.
    loops.delete(accountId);
    if (loop.timer) clearTimeout(loop.timer);
    if (loop.spendTimer) clearTimeout(loop.spendTimer);
    if (loop.unreadReconcileTimer) clearTimeout(loop.unreadReconcileTimer);
    loop.timer = null;
    loop.spendTimer = null;
    loop.unreadReconcileTimer = null;

    const pending = hubListRefreshes.get(accountId);
    if (pending) {
      if (pending.timer) clearTimeout(pending.timer);
      if (pending.maxWaitTimer) clearTimeout(pending.maxWaitTimer);
      hubListRefreshes.delete(accountId);
      // A revoked account is no longer part of this runtime's durable state
      // obligation; unlike shutdown, grant shrink may settle the queued read.
      pending.resolve();
    }
    for (const [key, poller] of mediaPollers) {
      if (key.startsWith(`${accountId}/`)) {
        clearTimeout(poller.timer);
        mediaPollers.delete(key);
      }
    }
    for (const key of historyCoverage.keys()) {
      if (key.startsWith(`${accountId}/`)) {
        historyCoverage.delete(key);
      }
    }
    if (focusedAccount === accountId) {
      focusedAccount = null;
    }
    if (openConversation?.accountId === accountId) {
      openConversation = null;
      if (sweepTimer) clearTimeout(sweepTimer);
      sweepTimer = null;
    }
    // Preserve cached rows and related messages, but remove the revoked grant
    // from renderer-facing lists rather than deleting data through account FKs.
    data.accounts.revokeGrant(accountId);
  }

  function addAccountLoop(accountId: string, pollImmediately: boolean): void {
    let created = false;
    if (!loops.has(accountId)) {
      loops.set(accountId, createAccountLoopState());
      created = true;
    }
    if (!running) {
      return;
    }
    const loop = loops.get(accountId)!;
    if (readHydration(accountId).done && loop.spendTimer === null && !loop.spendInFlight) {
      scheduleSpendSweep(accountId, 0);
    }
    if (pollImmediately) {
      void pollAccount(accountId).finally(() => {
        schedule(accountId, intervalFor(accountId));
        scheduleUnreadReconcile(accountId);
      });
    } else if (created) {
      schedule(accountId, intervalFor(accountId));
      scheduleUnreadReconcile(accountId);
    }
  }

  function scheduleSpendSweep(accountId: string, delayMs: number): void {
    const loop = loops.get(accountId);
    if (!loop) {
      return;
    }
    if (loop.spendTimer) {
      clearTimeout(loop.spendTimer);
      loop.spendTimer = null;
    }
    if (!running) {
      return;
    }
    loop.spendTimer = setTimeout(() => {
      loop.spendTimer = null;
      void runSpendSweep(accountId);
    }, delayMs);
  }

  /** Tail fetch from the newest cached id (last_id+asc is boundary-inclusive — dedupe by id).
   *  ONE page max (limit=100) — never paginate deeper; a side absent from the
   *  newest 100 renders «—» honestly (PLAN item 13). Every caller is one of the
   *  four thread-fetch paths (poll-delta, conversation open, quick-look
   *  hydrate, scoped refresh), so the per-fan freshness stamp is written HERE —
   *  including for empty threads, so automatic paths never re-spend on fans
   *  who never wrote. */
  async function fetchChatTail(
    accountId: string,
    chatId: string,
    purpose: OfApiPurpose = 'message-tail',
    // `force` = this read was triggered by an explicit user open (the sanctioned
    // read when autoRead is OFF), so the follow-up media polling must run even
    // when background reads are gated off.
    force = false,
    options: {
      priority?: 'user';
      coldLimit?: number;
      recentWindow?: boolean;
      retry?: 'idempotent' | 'none';
    } = {},
  ): Promise<{ freshIds: string[]; hadCachedMessages: boolean }> {
    const cachedPage = data.messages.page({ accountId, chatId, limit: 1 });
    const newestCached = options.recentWindow === true ? undefined : cachedPage.items.at(-1)?.messageId;
    const diagCountBefore = safeMessageCount(data, accountId, chatId); // DIAGNOSTIC (temporary)
    const diagMode =
      options.recentWindow === true ? 'recent-desc' : newestCached === undefined ? 'cold-desc' : 'asc-since';
    const requestLimit = newestCached === undefined ? (options.coldLimit ?? 100) : 100;
    const diagHeadLastMessageId = safeChatLastMessageId(data, accountId, chatId);
    const diagStart = now(); // DIAGNOSTIC (temporary)
    const { messages } = await (async (): ReturnType<typeof client.listMessages> => {
      try {
        return newestCached
          ? await client.listMessages({
              accountId,
              chatId,
              lastId: newestCached,
              order: 'asc',
              limit: requestLimit,
              purpose,
              ...(options.retry !== undefined ? { retry: options.retry } : {}),
              ...(options.priority !== undefined ? { priority: options.priority } : {}),
            })
          : await client.listMessages({
              accountId,
              chatId,
              order: 'desc',
              limit: requestLimit,
              purpose,
              ...(options.retry !== undefined ? { retry: options.retry } : {}),
              ...(options.priority !== undefined ? { priority: options.priority } : {}),
            });
      } catch (error) {
        onLog('warn', 'diag openTail', {
          accountId,
          chatId,
          purpose,
          force,
          result: 'failed',
          mode: diagMode,
          cursor: options.recentWindow === true ? null : (newestCached ?? null),
          limit: requestLimit,
          transport: readTransport() ?? null,
          hadCached: newestCached !== undefined,
          countBefore: diagCountBefore,
          chatLastMessageId: diagHeadLastMessageId,
          elapsedMs: now() - diagStart,
          ...safeErrorOutcome(error),
        });
        throw error;
      }
    })();
    data.threadFetchLog.stamp(accountId, chatId, new Date(now()).toISOString());

    let fresh: typeof messages;
    let upserts: MessageUpsert[];
    try {
      fresh = messages.filter(
        (message) => data.messages.get(accountId, chatId, String(message.id)) === null,
      );
      upserts = messages.map((message) => mapMessage(accountId, chatId, message, toMediaUrl));
      data.messages.upsertMany(upserts);
      pruneMessages(accountId, chatId); // retention (SPEC §10: 5,000/chat default)
    } catch (error) {
      onLog('warn', 'diag openTail', {
        accountId,
        chatId,
        purpose,
        force,
        result: 'failed-after-response',
        mode: diagMode,
        cursor: options.recentWindow === true ? null : (newestCached ?? null),
        limit: requestLimit,
        transport: readTransport() ?? null,
        returned: messages.length,
        hadCached: newestCached !== undefined,
        countBefore: diagCountBefore,
        countAfter: safeMessageCount(data, accountId, chatId),
        chatLastMessageId: diagHeadLastMessageId,
        elapsedMs: now() - diagStart,
        ...safeErrorOutcome(error),
      });
      throw error;
    }
    const diagCountAfter = safeMessageCount(data, accountId, chatId);
    const diagResult =
      messages.length === 0
        ? 'empty'
        : diagCountBefore !== null && diagCountAfter !== null && diagCountAfter > diagCountBefore
          ? 'inserted'
          : 'no-change';
    // DIAGNOSTIC (temporary — empty-thread investigation 2026-06-23). Counts only,
    // never message text. Failed reads are logged in the catch path above.
    onLog('info', 'diag openTail', {
      accountId,
      chatId,
      purpose,
      force,
      result: diagResult,
      mode: diagMode,
      cursor: options.recentWindow === true ? null : (newestCached ?? null),
      limit: requestLimit,
      transport: readTransport() ?? null,
      returned: messages.length,
      fresh: fresh.length,
      returnedIncludesChatLastMessageId:
        diagHeadLastMessageId === null
          ? null
          : messages.some((message) => String(message.id) === diagHeadLastMessageId),
      hadCached: newestCached !== undefined,
      countBefore: diagCountBefore,
      countAfter: diagCountAfter,
      chatLastMessageId: diagHeadLastMessageId,
      elapsedMs: now() - diagStart,
    });
    // Media polling (client.getMessage) is itself a message-body read — only
    // enroll it for an explicit open (force) or when auto-read is enabled.
    if (force || autoReadEnabled()) {
      trackUnreadyMedia(accountId, chatId, upserts);
    }
    return {
      freshIds: fresh.map((message) => String(message.id)),
      hadCachedMessages: newestCached !== undefined,
    };
  }

  /** Automatic polling catch-up has a stronger contract than explicit preview
   * hydration: once listChats advertises a head, walk the inclusive ascending
   * tail until that exact id is present. The ordinary fetchChatTail path stays
   * one-page for QuickLook/Spenders and explicit user opens. */
  async function fetchChatDeltaThroughHead(
    accountId: string,
    chatId: string,
    upstreamHeadId: string | null,
  ): Promise<{ freshIds: string[]; hadCachedMessages: boolean }> {
    const cachedPage = data.messages.page({ accountId, chatId, limit: 1 });
    const newestCached = cachedPage.items.at(-1)?.messageId;
    if (
      upstreamHeadId !== null &&
      data.messages.get(accountId, chatId, upstreamHeadId) !== null
    ) {
      return { freshIds: [], hadCachedMessages: newestCached !== undefined };
    }
    if (newestCached === undefined || upstreamHeadId === null) {
      const result = await fetchChatTail(accountId, chatId);
      if (upstreamHeadId !== null && data.messages.get(accountId, chatId, upstreamHeadId) === null) {
        throw new Error(`poll delta did not include upstream head ${upstreamHeadId}`);
      }
      return result;
    }

    const startedAt = now();
    const outcome = await paginateFirstLastId<OfApiMessage>({
      direction: 'forward',
      startId: newestCached,
      want: {
        kind: 'until',
        predicate: (message) => String(message.id) === upstreamHeadId,
      },
      maxPages: POLL_DELTA_MAX_PAGES,
      sleep,
      idOf: (message) => String(message.id),
      fetchPage: async (lastId) => {
        const page = await client.listMessages({
          accountId,
          chatId,
          ...(lastId !== null ? { lastId } : {}),
          order: 'asc',
          limit: 100,
          purpose: 'message-tail',
        });
        return { items: page.messages };
      },
    });
    if (!outcome.satisfied) {
      onLog('warn', 'poll delta coverage incomplete', {
        accountId,
        chatId,
        cursor: newestCached,
        upstreamHeadId,
        pages: outcome.pages,
        exhausted: outcome.exhausted,
      });
      throw new Error(`poll delta did not reach upstream head ${upstreamHeadId}`);
    }

    const fresh = outcome.items.filter(
      (message) => data.messages.get(accountId, chatId, String(message.id)) === null,
    );
    const upserts = outcome.items.map((message) => mapMessage(accountId, chatId, message, toMediaUrl));
    data.messages.upsertMany(upserts);
    pruneMessages(accountId, chatId);
    data.threadFetchLog.stamp(accountId, chatId, new Date(now()).toISOString());
    if (autoReadEnabled()) {
      trackUnreadyMedia(accountId, chatId, upserts);
    }
    onLog('info', 'diag pollDelta', {
      accountId,
      chatId,
      cursor: newestCached,
      upstreamHeadId,
      pages: outcome.pages,
      returned: outcome.items.length,
      fresh: fresh.length,
      elapsedMs: now() - startedAt,
    });
    return {
      freshIds: fresh.map((message) => String(message.id)),
      hadCachedMessages: true,
    };
  }

  async function backfillOlder(
    accountId: string,
    chatId: string,
  ): Promise<{ returned: number; fresh: number; hasOlder: boolean }> {
    const key = historyKey(accountId, chatId);
    const coverage = historyCoverage.get(key);
    if (coverage?.hasOlder === false) {
      return { returned: 0, fresh: 0, hasOlder: false };
    }

    const oldest = data.messages.oldest(accountId, chatId);
    if (oldest === null) {
      return { returned: 0, fresh: 0, hasOlder: false };
    }

    const countBefore = safeMessageCount(data, accountId, chatId);
    const startedAt = now();
    let messages: Awaited<ReturnType<typeof client.listMessages>>['messages'];
    try {
      ({ messages } = await client.listMessages({
        accountId,
        chatId,
        firstId: oldest.messageId,
        order: 'desc',
        limit: USER_BACKFILL_PAGE_LIMIT,
        purpose: 'message-tail',
        priority: 'user',
        retry: 'none',
        readIntent: 'deep-history-v1',
      }));
    } catch (error) {
      const fields = safeErrorOutcome(error);
      historyCoverage.set(key, {
        hasOlder: true,
        lastErrorCode: typeof fields['errorCode'] === 'string' ? fields['errorCode'] : null,
      });
      onLog('warn', 'diag backfillOlder', {
        accountId,
        chatId,
        result: 'failed',
        cursor: oldest.messageId,
        limit: USER_BACKFILL_PAGE_LIMIT,
        transport: readTransport() ?? null,
        countBefore,
        elapsedMs: now() - startedAt,
        ...fields,
      });
      throw error;
    }

    let fresh: typeof messages;
    try {
      fresh = messages.filter(
        (message) => data.messages.get(accountId, chatId, String(message.id)) === null,
      );
      const upserts = messages.map((message) => mapMessage(accountId, chatId, message, toMediaUrl));
      data.messages.upsertMany(upserts);
      pruneMessages(accountId, chatId);
    } catch (error) {
      onLog('warn', 'diag backfillOlder', {
        accountId,
        chatId,
        result: 'failed-after-response',
        cursor: oldest.messageId,
        limit: USER_BACKFILL_PAGE_LIMIT,
        transport: readTransport() ?? null,
        returned: messages.length,
        countBefore,
        countAfter: safeMessageCount(data, accountId, chatId),
        elapsedMs: now() - startedAt,
        ...safeErrorOutcome(error),
      });
      throw error;
    }

    const hasOlder = messages.length >= USER_BACKFILL_PAGE_LIMIT && fresh.length > 0;
    historyCoverage.set(key, { hasOlder, lastErrorCode: null });
    const countAfter = safeMessageCount(data, accountId, chatId);
    onLog('info', 'diag backfillOlder', {
      accountId,
      chatId,
      result: fresh.length > 0 ? 'inserted' : 'empty',
      cursor: oldest.messageId,
      limit: USER_BACKFILL_PAGE_LIMIT,
      transport: readTransport() ?? null,
      returned: messages.length,
      fresh: fresh.length,
      hasOlder,
      countBefore,
      countAfter,
      elapsedMs: now() - startedAt,
    });
    return { returned: messages.length, fresh: fresh.length, hasOlder };
  }

  async function backfillSmallLocalWindow(accountId: string, chatId: string): Promise<void> {
    const count = safeMessageCount(data, accountId, chatId);
    if (count === null || count <= 0 || count >= USER_OPEN_BACKFILL_THRESHOLD) {
      return;
    }
    await backfillOlder(accountId, chatId);
  }

  async function readHistoryForExplicitUserOpen(
    accountId: string,
    chatId: string,
    purpose: OfApiPurpose = 'message-tail',
  ): Promise<void> {
    const countBeforeOpenFetch = safeMessageCount(data, accountId, chatId);
    const smallLocalWindow =
      countBeforeOpenFetch !== null &&
      countBeforeOpenFetch > 0 &&
      countBeforeOpenFetch < USER_OPEN_BACKFILL_THRESHOLD;
    await fetchChatTail(accountId, chatId, purpose, /* force */ true, {
      priority: 'user',
      retry: 'none',
      coldLimit: USER_OPEN_COLD_PAGE_LIMIT,
      recentWindow: smallLocalWindow,
    });
    if (smallLocalWindow) {
      await backfillSmallLocalWindow(accountId, chatId);
    }
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
        if (!running || !loops.has(accountId)) {
          mediaPollers.delete(key);
          return;
        }
        if (now() - startedAt > MEDIA_READY_POLL_CAP_MS) {
          mediaPollers.delete(key);
          return;
        }
        const task = client
          .getMessage({ accountId, chatId, messageId: message.messageId, purpose: 'media' })
          .then((fresh) => {
            if (!running || !loops.has(accountId)) {
              mediaPollers.delete(key);
              return;
            }
            const upsert = mapMessage(accountId, chatId, fresh, toMediaUrl);
            data.messages.upsertMany([upsert]);
            if (upsert.media.every((item) => item.isReady)) {
              mediaPollers.delete(key);
              return;
            }
            if (running && loops.has(accountId)) {
              mediaPollers.set(key, { startedAt, timer: setTimeout(poll, MEDIA_READY_POLL_MS) });
            }
          })
          .catch(() => {
            if (running && loops.has(accountId)) {
              mediaPollers.set(key, { startedAt, timer: setTimeout(poll, MEDIA_READY_POLL_MS) });
            }
          });
        void trackActive(task);
      };
      mediaPollers.set(key, { startedAt, timer: setTimeout(poll, MEDIA_READY_POLL_MS) });
    }
  }

  function listHeadReachedExpectedMessage(
    accountId: string,
    chatId: string,
    expectedMessageId: string,
  ): boolean {
    const actual = data.chats.get(accountId, chatId)?.lastMessageId ?? null;
    if (actual === expectedMessageId) {
      return true;
    }
    // OnlyFans platform message ids are numeric on this boundary. Accepting a
    // strictly newer numeric list head prevents a busy chat from wedging on an
    // intermediate SSE frame that is no longer the latest preview. Unknown id
    // shapes stay exact-match only.
    return actual !== null
      && /^\d+$/.test(actual)
      && /^\d+$/.test(expectedMessageId)
      && compareMessageIds(actual, expectedMessageId) > 0;
  }

  function hubMessageAdvances(message: MessageUpsert, chat: ChatRow): boolean {
    if (chat.lastMessageAt === null) {
      return true;
    }
    const messageMs = Date.parse(message.createdAt);
    const chatMs = Date.parse(chat.lastMessageAt);
    if (Number.isNaN(messageMs) || Number.isNaN(chatMs)) {
      return false;
    }
    if (messageMs !== chatMs) {
      return messageMs > chatMs;
    }
    return chat.lastMessageId === null || compareMessageIds(message.messageId, chat.lastMessageId) > 0;
  }

  function previewFromMessage(message: MessageUpsert): string {
    const text = message.textPlain.split('\n')[0]?.trim() ?? '';
    if (text.length > 0) {
      return text;
    }
    if (message.isTip) {
      return 'Tip';
    }
    if (message.media.length > 0) {
      return 'Media';
    }
    return '';
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
    options: { filter?: ChatListFilter } = {},
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
        ...(options.filter !== undefined ? { filter: options.filter } : {}),
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

  function cachedHeadIsNewer(cached: ChatRow, next: ChatUpsert): boolean {
    if (cached.lastMessageAt !== null && next.lastMessageAt !== null) {
      const cachedMs = Date.parse(cached.lastMessageAt);
      const nextMs = Date.parse(next.lastMessageAt);
      if (!Number.isNaN(cachedMs) && !Number.isNaN(nextMs) && cachedMs !== nextMs) {
        return cachedMs > nextMs;
      }
    }
    if (cached.lastMessageId !== null && next.lastMessageId !== null) {
      return compareMessageIds(cached.lastMessageId, next.lastMessageId) > 0;
    }
    return cached.lastMessageId !== null && next.lastMessageId === null;
  }

  function applyLocalHeadGuard(
    accountId: string,
    next: ChatUpsert,
    preserveEqualHeadMetadata: boolean,
  ): ChatUpsert {
    const cached = data.chats.get(accountId, next.chatId);
    const sameHead =
      cached !== null &&
      cached.lastMessageId !== null &&
      cached.lastMessageId === next.lastMessageId;
    if (
      cached === null ||
      (!cachedHeadIsNewer(cached, next) && !(preserveEqualHeadMetadata && sameHead))
    ) {
      return next;
    }
    return {
      ...next,
      unreadCount: cached.unreadCount,
      hasUnreadTips: cached.hasUnreadTips,
      lastMessageAt: cached.lastMessageAt,
      lastMessagePreview: cached.lastMessagePreview,
      lastMessageIsSentByMe: cached.lastMessageIsSentByMe,
      lastMessageId: cached.lastMessageId,
    };
  }

  /** Upsert chat + fan rows only — the list payload is all the inbox needs. */
  function upsertChatRows(
    accountId: string,
    chats: readonly OfApiChat[],
    options: { preserveLocalHead?: boolean; preserveEqualHeadMetadata?: boolean } = {},
  ): void {
    const chatUpserts = [];
    const fetchedAt = new Date(now()).toISOString();
    for (const chat of chats) {
      const mapped = mapChat(accountId, chat, toMediaUrl);
      if (mapped) {
        chatUpserts.push(
          options.preserveLocalHead === true
            ? applyLocalHeadGuard(
                accountId,
                mapped,
                options.preserveEqualHeadMetadata === true,
              )
            : mapped,
        );
      }
      if (chat.fan != null) {
        data.fans.upsert(mapFan(accountId, chat.fan, toMediaUrl, fetchedAt));
      }
    }
    data.chats.upsertMany(chatUpserts);
  }

  async function runUnreadReconcileInner(
    accountId: string,
    maxPages: number,
    trigger: UnreadReconcileTrigger,
  ): Promise<void> {
    const loop = loops.get(accountId);
    const settings = unreadSettings();
    if (!loop || !running || loop.unreadReconcileInFlight || !settings.enabled) {
      return;
    }
    const localUnreadAtStart = listLocalUnreadChats(accountId);
    if (localUnreadAtStart.length === 0) {
      return;
    }

    loop.unreadReconcileInFlight = true;
    try {
      const startHeads = new Map(
        localUnreadAtStart.map((chat) => [chat.chatId, chat.lastMessageId] as const),
      );
      const scan = await walkChatPages(
        accountId,
        0,
        Math.max(1, Math.floor(maxPages)),
        'unread-reconcile',
        { filter: 'unread' },
      );
      upsertChatRows(accountId, scan.chats, { preserveLocalHead: true });

      const returned = new Set<string>();
      for (const chat of scan.chats) {
        const fanId = chat.fan?.id;
        if (fanId != null) {
          returned.add(String(fanId));
        }
      }

      const cleared: ChatUpsert[] = [];
      if (scan.exhausted) {
        for (const startChat of localUnreadAtStart) {
          if (returned.has(startChat.chatId)) {
            continue;
          }
          const current = data.chats.get(accountId, startChat.chatId);
          if (
            current === null ||
            current.unreadCount === 0 ||
            startHeads.get(startChat.chatId) !== current.lastMessageId
          ) {
            continue;
          }
          cleared.push({
            accountId: current.accountId,
            chatId: current.chatId,
            fanName: current.fanName,
            avatar: current.avatar,
            unreadCount: 0,
            hasUnreadTips: current.hasUnreadTips,
            lastMessageAt: current.lastMessageAt,
            lastMessagePreview: current.lastMessagePreview,
            lastMessageIsSentByMe: current.lastMessageIsSentByMe,
            lastMessageId: current.lastMessageId,
            lastReadMessageId: current.lastReadMessageId,
            pinned: current.pinned,
            canSendMessage: current.canSendMessage,
            canNotSendReason: current.canNotSendReason,
            raw: { source: 'unread-reconcile', trigger },
          });
        }
        data.chats.upsertMany(cleared);
      }

      loop.lastUnreadReconcileAt = now();
      if (scan.chats.length > 0 || cleared.length > 0) {
        emit({ type: 'chatListUpdated', accountId });
      }
    } catch {
      // Transient unread-reconcile failures must not poison the main sync
      // health counter while hub-live polling is otherwise suspended.
    } finally {
      loop.unreadReconcileInFlight = false;
    }
  }

  function runUnreadReconcile(
    accountId: string,
    maxPages: number,
    trigger: UnreadReconcileTrigger,
  ): Promise<void> {
    return trackActive(runUnreadReconcileInner(accountId, maxPages, trigger));
  }

  async function reconcileUnread(
    accountId?: string,
    trigger: UnreadReconcileTrigger = 'manual',
  ): Promise<void> {
    const settings = unreadSettings();
    if (!settings.enabled || !triggerAllowed(trigger, settings)) {
      return;
    }
    const targets = accountId ? [accountId] : focusedAccount ? [focusedAccount] : [...loops.keys()];
    const nowMs = now();
    await Promise.all(
      targets.map(async (target) => {
        const loop = loops.get(target);
        if (!loop || (trigger !== 'manual' && !shouldSuspendLoop(target)) || !hasLocalUnread(target)) {
          return;
        }
        if (
          trigger !== 'manual' &&
          loop.lastUnreadReconcileAt !== null &&
          nowMs - loop.lastUnreadReconcileAt < settings.focusDebounceMs
        ) {
          return;
        }
        await runUnreadReconcile(target, settings.immediateMaxPages, trigger);
        scheduleUnreadReconcile(target);
      }),
    );
  }

  function fireUnreadReconcile(accountId: string | null, trigger: UnreadReconcileTrigger): void {
    if (accountId === null) {
      return;
    }
    void reconcileUnread(accountId, trigger);
  }

  async function ensureChat(
    accountId: string,
    chatId: string,
    hint?: { username?: string | null },
  ): Promise<boolean> {
    if (data.chats.get(accountId, chatId) !== null) {
      return true;
    }
    const username = hint?.username ?? data.fans.get(accountId, chatId)?.username ?? null;
    if (username === null || username.trim().length === 0) {
      return false;
    }
    const { chats } = await client.listChats({
      accountId,
      query: username.trim(),
      limit: CHATS_PAGE_LIMIT,
      order: 'recent',
      skipUsers: 'none',
      purpose: 'spenders',
    });
    const match = chats.find((chat) => chat.fan?.id != null && String(chat.fan.id) === chatId);
    if (match === undefined) {
      return false;
    }
    upsertChatRows(accountId, [match]);
    return data.chats.get(accountId, chatId) !== null;
  }

  async function runAccountHeadRefresh(
    accountId: string,
    loop: { lastSuccessAt: number | null; consecutiveFailures: number },
    preserveLocalHead: boolean,
  ): Promise<void> {
    try {
      const head = await walkChatPages(accountId, 0, 1, 'hot-poll');
      // Thin-message fallback reads can lag the event they are proving. Only
      // those callers (including chatListUpdated nudges projected from
      // subscription events) preserve a newer local Hub head. Authoritative
      // delete and ordinary polling reads must remain able to move a head
      // backwards to the previous surviving message (or null).
      upsertChatRows(
        accountId,
        head.chats,
        preserveLocalHead
          ? { preserveLocalHead: true, preserveEqualHeadMetadata: true }
          : {},
      );
      loop.lastSuccessAt = now();
      loop.consecutiveFailures = 0;
      armUnreadReconcile(accountId);
      emit({ type: 'chatListUpdated', accountId });
    } catch (error) {
      loop.consecutiveFailures += 1;
      throw error;
    }
  }

  /** Awaitable immediate head refresh for recovery/diagnostics. It participates
   * in the same per-account single-flight guard as pollAccount: wait for the
   * current owner, claim synchronously, and release in finally. */
  async function reconcileAccountHeadNowInner(
    accountId: string,
    preserveLocalHead: boolean,
  ): Promise<void> {
    const loop = loops.get(accountId);
    if (!loop) {
      return;
    }
    while (true) {
      if (!running) {
        throw new Error(`Account reconciliation cancelled for ${accountId}`);
      }
      if (loops.get(accountId) !== loop) {
        return;
      }
      if (!loop.inFlight) {
        loop.inFlight = true;
        break;
      }
      await sleep(RECONCILE_INFLIGHT_WAIT_MS);
    }
    try {
      if (!running) {
        throw new Error(`Account reconciliation cancelled for ${accountId}`);
      }
      if (loops.get(accountId) !== loop) {
        return;
      }
      await runAccountHeadRefresh(accountId, loop, preserveLocalHead);
    } finally {
      loop.inFlight = false;
    }
  }

  function reconcileAccountHeadNow(accountId: string): Promise<void> {
    return trackActive(reconcileAccountHeadNowInner(accountId, false));
  }

  function runPendingHubListRefresh(accountId: string, pending: PendingHubListRefresh): void {
    if (hubListRefreshes.get(accountId) !== pending) {
      return;
    }
    if (pending.timer) {
      clearTimeout(pending.timer);
      pending.timer = null;
    }
    if (pending.maxWaitTimer) {
      clearTimeout(pending.maxWaitTimer);
      pending.maxWaitTimer = null;
    }
    hubListRefreshes.delete(accountId);
    // Use the awaitable single-flight owner: a normal poll already in flight is
    // waited out instead of turning the Hub obligation into a false success.
    void trackActive(reconcileAccountHeadNowInner(accountId, true))
      .then(pending.resolve, pending.reject);
  }

  function armHubListRefresh(accountId: string, pending: PendingHubListRefresh): void {
    if (pending.timer) {
      clearTimeout(pending.timer);
    }
    pending.timer = setTimeout(() => {
      runPendingHubListRefresh(accountId, pending);
    }, HUB_LIST_REFRESH_DEBOUNCE_MS);
  }

  function refreshAccountHead(accountId: string): Promise<void> {
    if (!running) {
      return Promise.resolve();
    }
    const existing = hubListRefreshes.get(accountId);
    if (existing) {
      armHubListRefresh(accountId, existing);
      return existing.promise;
    }
    let resolvePending!: () => void;
    let rejectPending!: (error: unknown) => void;
    const promise = new Promise<void>((resolve, reject) => {
      resolvePending = resolve;
      rejectPending = reject;
    });
    const pending: PendingHubListRefresh = {
      timer: null,
      maxWaitTimer: null,
      promise,
      resolve: resolvePending,
      reject: rejectPending,
    };
    hubListRefreshes.set(accountId, pending);
    armHubListRefresh(accountId, pending);
    pending.maxWaitTimer = setTimeout(() => {
      runPendingHubListRefresh(accountId, pending);
    }, HUB_LIST_REFRESH_MAX_WAIT_MS);
    void promise.catch(() => undefined);
    return promise;
  }

  async function ingestHubMessage(
    accountId: string,
    chatId: string,
    message: NormalizedSyncMessage,
  ): Promise<boolean> {
    const upsert = mapHubMessage(accountId, chatId, message);
    if (upsert === null) {
      return false;
    }

    const existing = data.messages.get(accountId, chatId, upsert.messageId);
    if (existing?.deleted === true) {
      return true;
    }

    const existed = existing !== null;
    data.messages.upsertMany([upsert]);
    pruneMessages(accountId, chatId);
    if (autoReadEnabled()) {
      trackUnreadyMedia(accountId, chatId, [upsert]);
    }

    const chat = data.chats.get(accountId, chatId);
    if (chat === null) {
      await refreshAccountHead(accountId);
      return true;
    }

    const advances = hubMessageAdvances(upsert, chat);
    const newIncoming = !existed && !upsert.isSentByMe;
    const clearUnread = !existed && upsert.isSentByMe && advances;
    data.chats.upsert({
      accountId: chat.accountId,
      chatId: chat.chatId,
      fanName: chat.fanName,
      avatar: chat.avatar,
      unreadCount: clearUnread ? 0 : newIncoming ? chat.unreadCount + 1 : chat.unreadCount,
      hasUnreadTips: clearUnread ? false : chat.hasUnreadTips || (newIncoming && upsert.isTip),
      lastMessageAt: advances ? upsert.createdAt : chat.lastMessageAt,
      lastMessagePreview: advances ? previewFromMessage(upsert) : chat.lastMessagePreview,
      lastMessageIsSentByMe: advances ? upsert.isSentByMe : chat.lastMessageIsSentByMe,
      lastMessageId: advances ? upsert.messageId : chat.lastMessageId,
      lastReadMessageId: chat.lastReadMessageId,
      pinned: chat.pinned,
      canSendMessage: chat.canSendMessage,
      canNotSendReason: chat.canNotSendReason,
      raw: { source: 'hub-message', messageId: upsert.messageId },
    });
    armUnreadReconcile(accountId);
    return true;
  }

  async function pollAccountInner(accountId: string, depth: PollDepth = 'hot'): Promise<void> {
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

      const deltas: { chatId: string; upstreamHeadId: string | null }[] = [];
      for (const chat of head.chats) {
        if (!chatChanged(accountId, chat)) {
          continue;
        }
        const fanId = chat.fan?.id;
        if (fanId == null) {
          continue;
        }
        const chatId = String(fanId);
        const cachedChat = data.chats.get(accountId, chatId);
        const wasCached = cachedChat !== null;
        const mappedChat = mapChat(accountId, chat, toMediaUrl);
        // A Hub-enriched message can reach SQLite before the eventually
        // consistent list endpoint exposes it. Never walk forward from that
        // newer local cursor in search of an older advertised head: it cannot
        // succeed and would turn normal REST lag into a permanent failed poll.
        const upstreamHeadIsOlder =
          cachedChat !== null &&
          mappedChat !== null &&
          cachedHeadIsNewer(cachedChat, mappedChat);
        // Tail-fetch policy (the cost rule at 900+ chats):
        //  - cached chat changed → always fetch, even at baseline (silently
        //    swallows the downtime backlog so it never replays as live events);
        //  - uncached chat → fetch only post-baseline (a fresh conversation
        //    surfacing on the head pages); at baseline it is pure hydration.
        if ((wasCached || prevSuccessAt !== null) && !upstreamHeadIsOlder) {
          deltas.push({
            chatId,
            upstreamHeadId: chat.lastMessage?.id != null ? String(chat.lastMessage.id) : null,
          });
        }
      }

      // Tail fetches are AUTOMATIC message-body reads → gated on autoReadChats.
      // The chat list, unread counts and previews above came from listChats
      // (no read marked) and update in BOTH modes; only the per-delta body
      // fetch + the live message/tip events it drives are skipped when OFF.
      if (autoReadEnabled()) {
        for (const delta of deltas) {
          const { freshIds, hadCachedMessages } = await fetchChatDeltaThroughHead(
            accountId,
            delta.chatId,
            delta.upstreamHeadId,
          );
          // Each fetch has already durably upserted its rows. Emit its live
          // events before moving to the next chat, otherwise a later chat
          // failure would make these rows non-fresh on retry and lose the
          // events forever.
          if (prevSuccessAt !== null) {
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
        }
      }

      // Do not publish the upstream head until every automatic body delta has
      // reached it. On a capped/failed tail the old head remains the detector,
      // so the next poll retries instead of converting a transient gap into a
      // permanent one.
      // Ordinary polling is an authoritative reconciliation surface when a
      // deletion webhook never arrived. Unlike a thin-event fallback, it must
      // be allowed to publish a real backward/null head.
      upsertChatRows(accountId, head.chats);

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
        upsertChatRows(accountId, chunk.chats, { preserveLocalHead: true });
        const pagesWalked = hydration.pagesWalked + chunk.pages;
        const nextHydration = {
          nextOffset: chunk.nextOffset,
          pagesWalked,
          done: chunk.exhausted || pagesWalked >= HYDRATION_MAX_PAGES,
        } satisfies HydrationState;
        data.settings.set(hydrationKey(accountId), nextHydration);
        emit({ type: 'chatListUpdated', accountId }); // progressive inbox paint
        if (nextHydration.done && loop.spendTimer === null && !loop.spendInFlight) {
          scheduleSpendSweep(accountId, 0);
        }
      }

      loop.lastSuccessAt = now();
      if (deepDue) {
        loop.lastDeepSweepAt = now();
      }
      loop.consecutiveFailures = 0;
      armUnreadReconcile(accountId);
    } catch {
      loop.consecutiveFailures += 1;
    } finally {
      loop.inFlight = false;
    }
  }

  function pollAccount(accountId: string, depth: PollDepth = 'hot'): Promise<void> {
    return trackActive(pollAccountInner(accountId, depth));
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
    // The read-state sweep calls listMessages (a message-body read) — never arm
    // its timer when automatic reads are off.
    if (!running || !openConversation || !autoReadEnabled()) {
      return;
    }
    sweepTimer = setTimeout(() => {
      void runSweep().finally(scheduleSweep);
    }, READ_STATE_SWEEP_MS);
  }

  async function runSweepInner(): Promise<void> {
    // listMessages here marks the open chat read on OnlyFans — gated off.
    if (!autoReadEnabled() || !openConversation || !sweepEligible()) {
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

  function runSweep(): Promise<void> {
    return trackActive(runSweepInner());
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
    let coverage = data.settings.getParsed(spendCoverageKey(accountId), spendCoverageSchema);
    if (coverage === undefined) {
      coverage = {
        status: 'backfill',
        // Freeze the lower bound while a capped marker walk spans several
        // scheduled sweeps. A relative -30days filter would move underneath a
        // persisted marker and could skip rows between runs.
        startDate: ofapiStartDate(now() - SPEND_INITIAL_WINDOW_MS),
        nextMarker: null,
        pagesCompleted: 0,
      } satisfies SpendCoverage;
      data.settings.set(spendCoverageKey(accountId), coverage);
    }

    const backfill = coverage.status === 'backfill' ? coverage : null;
    const latest = data.fanTransactions.latestCreatedAt(accountId);
    const sinceMs = backfill !== null || latest === null
      ? null
      : Date.parse(latest) - SPEND_SWEEP_OVERLAP_MS;
    // Newest-first ordering: stop as soon as a page reaches past the lower bound.
    const lowerBoundMs = backfill !== null
      ? Date.parse(`${backfill.startDate.replace(' ', 'T')}Z`)
      : sinceMs ?? now() - SPEND_INITIAL_WINDOW_MS;
    let continuationMarker: number | null = backfill?.nextMarker ?? null;
    const outcome = await paginateMarker<OfApiTransaction>({
      want: {
        kind: 'until',
        predicate: (tx) => tx.createdAt != null && Date.parse(tx.createdAt) < lowerBoundMs,
      },
      maxPages: SPEND_SWEEP_MAX_PAGES,
      sleep,
      idOf: (tx) => String(tx.id),
      ...(backfill === null
        ? {}
        : {
            onPage: (page: {
              items: OfApiTransaction[];
              nextMarker: number | null;
              hasMore: boolean;
              pageNumber: number;
            }) => {
              const pageRows = page.items
                .map((tx) => mapFanTransaction(accountId, tx))
                .filter((row): row is FanTransactionUpsert => row !== null);
              data.fanTransactions.upsertMany(pageRows);
              if (page.hasMore && page.nextMarker !== null) {
                data.settings.set(spendCoverageKey(accountId), {
                  ...backfill,
                  nextMarker: page.nextMarker,
                  pagesCompleted: backfill.pagesCompleted + page.pageNumber,
                } satisfies SpendCoverage);
              }
            },
          }),
      ...(backfill?.nextMarker !== null && backfill?.nextMarker !== undefined
        ? { startMarker: backfill.nextMarker }
        : {}),
      fetchPage: async (marker) => {
        const page = await client.listTransactions({
          accountId,
          limit: SPEND_TX_PAGE_LIMIT,
          purpose: 'spend-sweep',
          startDate: backfill?.startDate ?? (sinceMs === null ? '-30days' : ofapiStartDate(sinceMs)),
          ...(marker !== null ? { marker } : {}),
        });
        continuationMarker = page.nextMarker;
        return {
          items: page.transactions,
          nextMarker: page.nextMarker,
          hasMore: page.hasMore,
        };
      },
    });
    if (backfill === null) {
      const rows = outcome.items
        .map((tx) => mapFanTransaction(accountId, tx))
        .filter((row): row is FanTransactionUpsert => row !== null);
      data.fanTransactions.upsertMany(rows);
    }
    if (backfill !== null) {
      if (outcome.satisfied || outcome.exhausted) {
        data.settings.set(spendCoverageKey(accountId), {
          status: 'complete',
          completedAt: new Date(now()).toISOString(),
        } satisfies SpendCoverage);
      } else {
        if (continuationMarker === null) {
          // A capped response that claims more pages but supplies no marker is
          // malformed. Keep the prior checkpoint and retry idempotently rather
          // than falsely declaring the historical window complete.
          throw new Error('transactions backfill capped without a continuation marker');
        }
        data.settings.set(spendCoverageKey(accountId), {
          ...backfill,
          nextMarker: continuationMarker,
          pagesCompleted: backfill.pagesCompleted + outcome.pages,
        } satisfies SpendCoverage);
      }
    }
    if (!isPruneFrozen()) {
      data.fanTransactions.pruneOlderThan(
        accountId,
        new Date(now() - SPEND_RETENTION_MS).toISOString(),
      );
    }
  }

  async function runSpendSweepInner(accountId: string): Promise<void> {
    const loop = loops.get(accountId);
    if (!loop || !running || loop.spendInFlight) {
      return;
    }
    if (!readHydration(accountId).done) {
      return;
    }
    if (isBudgetExhausted()) {
      scheduleSpendSweep(accountId, spendSweepIntervalMs());
      return;
    }
    const intervalMs = spendSweepIntervalMs();
    const dueIn =
      loop.lastSpendSweepAt === null
        ? 0
        : intervalMs - (now() - loop.lastSpendSweepAt);
    if (dueIn > 0) {
      scheduleSpendSweep(accountId, dueIn);
      return;
    }
    loop.spendInFlight = true;
    try {
      await sweepFanSpend(accountId);
    } catch {
      // transient; the stamp below still advances so a broken transactions
      // endpoint retries at sweep cadence, independent of chat-list polling
    } finally {
      loop.lastSpendSweepAt = now();
      loop.spendInFlight = false;
      scheduleSpendSweep(accountId, spendSweepIntervalMs());
    }
  }

  function runSpendSweep(accountId: string): Promise<void> {
    return trackActive(runSpendSweepInner(accountId));
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

  async function refreshAccountGrants(): Promise<string[]> {
    const accountIds = [...new Set(await syncAccounts(client, data, toMediaUrl))];
    const next = new Set(accountIds);
    for (const accountId of [...loops.keys()]) {
      if (!next.has(accountId)) {
        removeAccountLoop(accountId);
      }
    }
    // Durable state snapshots run immediately after this refresh, so new loops
    // wait for their normal cadence instead of racing the authoritative apply.
    for (const accountId of accountIds) {
      addAccountLoop(accountId, false);
    }
    return accountIds;
  }

  return {
    start(accountIds) {
      if (stopping !== null) {
        throw new Error('PollingSync cannot restart while stop() is still draining');
      }
      running = true;
      for (const accountId of accountIds) {
        addAccountLoop(accountId, true);
      }
    },
    stop() {
      if (stopping !== null) {
        return stopping;
      }
      running = false;
      for (const loop of loops.values()) {
        if (loop.timer) {
          clearTimeout(loop.timer);
        }
        loop.timer = null;
        if (loop.spendTimer) {
          clearTimeout(loop.spendTimer);
        }
        loop.spendTimer = null;
        if (loop.unreadReconcileTimer) {
          clearTimeout(loop.unreadReconcileTimer);
        }
        loop.unreadReconcileTimer = null;
      }
      if (sweepTimer) {
        clearTimeout(sweepTimer);
        sweepTimer = null;
      }
      for (const poller of mediaPollers.values()) {
        clearTimeout(poller.timer);
      }
      mediaPollers.clear();
      clearHubListRefreshes();
      const drain = drainActiveTasks();
      stopping = drain;
      void drain.finally(() => {
        if (stopping === drain) {
          stopping = null;
        }
      });
      return drain;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refreshChat(accountId, chatId, purpose, expectedMessageId) {
      return trackActive((async () => {
        // refreshChat is the AUTOMATIC/background body-read seam (hub message
        // reactions, scoped Spenders refresh). When auto-read is off, skip the
        // tail GET (which would mark the chat read) and just nudge the list;
        // listChats-driven rows stay fresh through a debounced hub activity refresh.
        const bodyReadEnabled = autoReadEnabled();
        // Replay fast-path: once the proof condition below already holds
        // locally (typical for startup catch-up frames — the first head
        // refresh advanced the cached head past the whole backlog), another
        // paid read cannot add anything; each skipped call also skips an
        // awaited 2 s debounce that would otherwise pace the SSE replay.
        if (expectedMessageId !== undefined) {
          const alreadyApplied = bodyReadEnabled
            ? data.messages.get(accountId, chatId, expectedMessageId) !== null
            : listHeadReachedExpectedMessage(accountId, chatId, expectedMessageId);
          if (alreadyApplied) {
            return;
          }
        }
        if (!bodyReadEnabled) {
          await refreshAccountHead(accountId);
        } else {
          await fetchChatTail(accountId, chatId, purpose);
          emit({ type: 'chatListUpdated', accountId });
        }
        if (expectedMessageId !== undefined) {
          const applied = bodyReadEnabled
            ? data.messages.get(accountId, chatId, expectedMessageId) !== null
            : listHeadReachedExpectedMessage(accountId, chatId, expectedMessageId);
          if (!applied) {
            throw new Error(
              `Hub fallback did not observe message ${expectedMessageId} in ${accountId}/${chatId}`,
            );
          }
        }
      })());
    },
    readChatTailForUserOpen(accountId, chatId, purpose) {
      return trackActive((async () => {
        // Deliberate single-chat user read (QuickLook/open-like): use the same
        // force path as openConversation so history loads even with auto-read
        // OFF, without setting openConversation or arming the read-state sweep.
        await readHistoryForExplicitUserOpen(accountId, chatId, purpose);
        emit({ type: 'chatListUpdated', accountId });
      })());
    },
    loadOlderMessagesForUserOpen(accountId, chatId) {
      return trackActive(backfillOlder(accountId, chatId));
    },
    ensureChat: (accountId, chatId, hint) =>
      trackActive(ensureChat(accountId, chatId, hint)),
    openConversation(accountId, chatId) {
      return trackActive((async () => {
        openConversation = { accountId, chatId };
        sweepLastChangeAt = now(); // re-arm the idle window on every open
        scheduleSweep();
        // openConversation is the ONE sanctioned message-body read when auto-read
        // is OFF — force the tail fetch (and its media polling) unconditionally.
        await readHistoryForExplicitUserOpen(accountId, chatId, 'message-tail');
        // Local unread-clear (body-free; runs in BOTH modes). Fixes the
        // stuck-unread bug: reading a chat in OnlyMonster does not change its
        // lastMessage, so the hot poll never re-surfaces it and the cached
        // unread_count stays stale. Clearing only after the read succeeds prevents
        // failed opens from hiding still-unread chats locally.
        const cached = data.chats.get(accountId, chatId);
        if (cached !== null && (cached.unreadCount > 0 || cached.hasUnreadTips)) {
          data.chats.upsert({
            accountId: cached.accountId,
            chatId: cached.chatId,
            fanName: cached.fanName,
            avatar: cached.avatar,
            unreadCount: 0,
            hasUnreadTips: false,
            lastMessageAt: cached.lastMessageAt,
            lastMessagePreview: cached.lastMessagePreview,
            lastMessageIsSentByMe: cached.lastMessageIsSentByMe,
            lastMessageId: cached.lastMessageId,
            lastReadMessageId: cached.lastReadMessageId,
            pinned: cached.pinned,
            canSendMessage: cached.canSendMessage,
            canNotSendReason: cached.canNotSendReason,
            raw: null, // write-only column; chats reads never select it
          });
          scheduleUnreadReconcile(accountId);
        }
        void trackActive(refreshFanDetail(accountId, chatId));
      })());
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
        scheduleBurst(accountId); // resume burst on focus when polling is active
        fireUnreadReconcile(accountId, 'account-focus');
      }
      scheduleAllUnreadReconcile();
    },
    setWindowVisible(visible) {
      const wasHidden = !windowVisible;
      windowVisible = visible;
      if (running && visible && wasHidden) {
        for (const accountId of loops.keys()) {
          scheduleBurst(accountId); // resume burst when the window comes back
        }
        fireUnreadReconcile(focusedAccount, 'window-focus');
      }
      scheduleAllUnreadReconcile();
    },
    setHubPollingSuspended(suspended) {
      const wasSuspended = hubPollingSuspended;
      hubPollingSuspended = suspended;
      if (!running || suspended === wasSuspended) {
        return;
      }
      for (const accountId of loops.keys()) {
        if (suspended && shouldSuspendLoop(accountId)) {
          schedule(accountId, null);
        } else {
          // Hub dropped, or the account is still hydrating: keep/restore the
          // normal cadence only. The first resumed tick evaluates deepDue
          // itself (lastDeepSweepAt is stale after a long SSE-live stretch),
          // so gap coverage stays under the standing 5-minute deep cap —
          // stream flapping must never scale paid reads (incident 2026-07-15).
          schedule(accountId, intervalFor(accountId));
        }
        scheduleUnreadReconcile(accountId);
      }
    },
    refreshAccountHead,
    reconcileAccountHeadNow,
    refreshAccountGrants: () => trackActive(refreshAccountGrants()),
    ingestHubMessage: (accountId, chatId, message) =>
      trackActive(ingestHubMessage(accountId, chatId, message)),
    reconcileUnread,
    async forceRefresh(accountId) {
      const targets = accountId ? [accountId] : [...loops.keys()];
      // Manual refresh = deep sweep: pull DEEP_SWEEP_PAGES, not just page 1.
      await Promise.all(targets.map((target) => pollAccount(target, 'deep')));
    },
    status(): SyncStatusSnapshot {
      const freshness: Record<string, string> = {};
      const pollIntervalsMs: Record<string, number | null> = {};
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
      return {
        freshness,
        listVerifiedAt: freshness,
        state,
        pollIntervalsMs,
        deepSweepEveryMs: DEEP_SWEEP_INTERVAL_MS,
      };
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
  // The response is the complete authoritative grant set for this credential.
  // Reconcile it even during initial boot: a prior build only upserted the new
  // ids, leaving replaced OFAPI identities visible forever in local cache.
  data.accounts.reconcileGrants(accounts.map((account) => mapAccount(account, toMediaUrl)));
  for (const account of accounts) {
    if (account.is_authenticated === false) {
      // surfaced via account auth state; PRD F10 banner reads from db
    }
  }
  return accounts.map((account) => account.id);
}
