// Hub-aware sync composition (SPEC §6.2): PollingSync owns hydration,
// read-state sweeps, media polling, refreshChat, readChatTailForUserOpen and
// openConversation. While HubSync is live, periodic chat-list polling is paused
// after hydration; enriched message frames ingest locally, and id-only/
// notification activity falls back to scoped/body reads or debounced list-only
// refreshes. Both providers' events flow through ONE listener set: the send
// engine's messageSent subscription works identically in either mode.

import { z } from 'zod';
import type { HubModeOverrideSetting } from '@chatgoose/shared/hub/mode';
import type {
  NormalizedSyncMessage,
  SyncEvent,
  SyncSnapshotResponse,
  SyncSnapshotThread,
} from '@chatgoose/shared/protocol/index';
import type { DataLayer } from '../db/index';
import type { HubSync, HubSyncStatus } from './hub-sync';
import { compareMessageIds } from './message-id';
import type { SyncListener, SyncProvider, SyncStatusSnapshot } from './provider';

export type HubMode = 'live' | 'degraded' | 'off';
const HUB_FALLBACK_REASONS = [
  'hub-id-only-fallback',
  'hub-mismatched-message-fallback',
  'hub-malformed-message-fallback',
  'hub-notification-fallback',
  'hub-notification-refresh-failed',
  'hub-ingest-error-fallback',
  'hub-replay-gap-snapshot',
  'hub-v2-gap-cursor-rebaseline',
  'unknown-delete-head-refresh',
] as const;

export type HubFallbackReason = (typeof HUB_FALLBACK_REASONS)[number];

export interface HubTelemetryCounter {
  total: number;
  byType: Record<string, number>;
}

export interface HubTelemetrySnapshot {
  received: HubTelemetryCounter;
  applied: HubTelemetryCounter;
  fallback: HubTelemetryCounter;
  dropped: HubTelemetryCounter;
  fallbackByReason: Record<string, number>;
}

type PollingLike = SyncProvider & {
  pollAccount(accountId: string): Promise<void>;
  setHubPollingSuspended(suspended: boolean): void;
  refreshAccountHead(accountId: string): Promise<void>;
  /** Awaitable refresh sharing PollingSync's per-account single-flight guard. */
  reconcileAccountHeadNow(accountId: string): Promise<void>;
  /** Refreshes read-gateway grants and atomically reconfigures polling loops. */
  refreshAccountGrants(): Promise<string[]>;
  ingestHubMessage(
    accountId: string,
    chatId: string,
    message: NormalizedSyncMessage,
  ): Promise<boolean>;
};

export interface HubFactoryCallbacks {
  onEvent: (event: SyncEvent) => Promise<void>;
  onStatusChange: (status: HubSyncStatus) => void;
  onSnapshot: (snapshot: SyncSnapshotResponse) => Promise<void>;
  onSnapshotRequired: (input: {
    requestedSeq: number;
    oldestAvailableSeq: number | null;
    currentSeq: number;
  }) => void;
  /** Refresh current read-gateway grants before v2 state reconciliation. */
  onV2GapRecovered: () => Promise<readonly string[]>;
}

export interface HubAwareSyncOptions {
  polling: PollingLike;
  data: DataLayer;
  /** Resolves null when hub settings (base URL + chatter key) are absent. */
  createHub: (
    callbacks: HubFactoryCallbacks,
    accountIds: readonly string[],
  ) => Promise<HubSync | null>;
  /** Dev/support-only D3 override. Auto keeps production behavior. */
  hubModeOverride?: () => HubModeOverrideSetting;
  now?: () => number;
  onLog?: (
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    fields?: Record<string, unknown>,
  ) => void;
}

/** Stream liveness for the Activity panel (PLAN item 9). */
export interface HubActivitySnapshot {
  /** Epoch ms of the last parsed hub frame; null = none yet (or restart-stale day). */
  lastEventAt: number | null;
  lastEventType: string | null;
  /** Parsed hub SyncEvent frames received today (UTC) — persisted, survives restarts. */
  eventsToday: number;
  /** Hub events applied to the local event stream today. */
  appliedEventsToday: number;
  /** Hub events that used a REST/list fallback today. */
  fallbackEventsToday: number;
  /** Hub events dropped after parse/lookup today; parser drops are counted separately by HubSync. */
  droppedEventsToday: number;
  eventsByTypeToday: Record<string, number>;
  appliedByTypeToday: Record<string, number>;
  fallbackByTypeToday: Record<string, number>;
  droppedByTypeToday: Record<string, number>;
  fallbackByReasonToday: Record<string, number>;
  lifetime: HubTelemetrySnapshot;
  lastFallbackReason: HubFallbackReason | null;
  /** Epoch ms the stream went live; null while not live. */
  liveSinceMs: number | null;
  /** Epoch ms of the last status transition (e.g. "unreachable since 19:42"). */
  statusChangedAtMs: number | null;
  droppedFrames: number;
}

const HUB_EVENT_STATS_KEY = 'hubSync.eventStats';

const countByTypeSchema = z.record(z.string(), z.number().int().nonnegative());
const telemetryCounterSchema = z.object({
  total: z.number().int().nonnegative().default(0),
  byType: countByTypeSchema.default({}),
});
const emptyTelemetryCounter = { total: 0, byType: {} };
const emptyTelemetrySnapshot = {
  received: emptyTelemetryCounter,
  applied: emptyTelemetryCounter,
  fallback: emptyTelemetryCounter,
  dropped: emptyTelemetryCounter,
  fallbackByReason: {},
};
const telemetrySnapshotSchema = z.object({
  received: telemetryCounterSchema.default(emptyTelemetryCounter),
  applied: telemetryCounterSchema.default(emptyTelemetryCounter),
  fallback: telemetryCounterSchema.default(emptyTelemetryCounter),
  dropped: telemetryCounterSchema.default(emptyTelemetryCounter),
  fallbackByReason: countByTypeSchema.default({}),
});

const eventStatsSchema = z.object({
  day: z.string(),
  count: z.number().int().nonnegative(),
  applied: z.number().int().nonnegative().default(0),
  fallback: z.number().int().nonnegative().default(0),
  dropped: z.number().int().nonnegative().default(0),
  byType: countByTypeSchema.default({}),
  appliedByType: countByTypeSchema.default({}),
  fallbackByType: countByTypeSchema.default({}),
  droppedByType: countByTypeSchema.default({}),
  fallbackByReason: countByTypeSchema.default({}),
  lifetime: telemetrySnapshotSchema.default(emptyTelemetrySnapshot),
  lastEventAt: z.number().nullable(),
  lastEventType: z.string().nullable(),
  lastFallbackReason: z.enum(HUB_FALLBACK_REASONS).nullable().default(null),
});
type EventStats = z.infer<typeof eventStatsSchema>;

export interface HubAwareSync extends SyncProvider {
  pollAccount(accountId: string): Promise<void>;
  refreshAccountHead(accountId: string): Promise<void>;
  /** Recreates the hub connection from current settings (key/URL changes). */
  reconfigureHub(): Promise<void>;
  /** Hub status/liveness changes; payload is read through query:sync.status. */
  subscribeStatus(listener: () => void): () => void;
  hubStatus(): HubSyncStatus | null;
  hubMode(): HubMode;
  hubModeOverride(): HubModeOverrideSetting;
  hubActivity(): HubActivitySnapshot;
}

export function createHubAwareSync(options: HubAwareSyncOptions): HubAwareSync {
  const { polling, data, createHub } = options;
  const now = options.now ?? Date.now;
  const onLog = options.onLog ?? (() => undefined);
  const modeOverride = options.hubModeOverride ?? (() => 'auto' as const);

  const listeners = new Set<SyncListener>();
  const statusListeners = new Set<() => void>();
  let hub: HubSync | null = null;
  let hubLive = false;
  let forceHubSuspended = false;
  let running = false;
  /** Invalidates in-flight async hub creation on stop/reconfigure (no leaks). */
  let hubGeneration = 0;
  let liveSinceMs: number | null = null;
  let statusChangedAtMs: number | null = null;
  let handledAccountIds: readonly string[] = [];

  function utcDayOf(epochMs: number): string {
    return new Date(epochMs).toISOString().slice(0, 10);
  }

  function emptyCounter(): HubTelemetryCounter {
    return { total: 0, byType: {} };
  }

  function emptyLifetime(): HubTelemetrySnapshot {
    return {
      received: emptyCounter(),
      applied: emptyCounter(),
      fallback: emptyCounter(),
      dropped: emptyCounter(),
      fallbackByReason: {},
    };
  }

  function emptyStats(day: string): EventStats {
    return {
      day,
      count: 0,
      applied: 0,
      fallback: 0,
      dropped: 0,
      byType: {},
      appliedByType: {},
      fallbackByType: {},
      droppedByType: {},
      fallbackByReason: {},
      lifetime: emptyLifetime(),
      lastEventAt: null,
      lastEventType: null,
      lastFallbackReason: null,
    };
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  function readInitialEventStats(): EventStats {
    const currentDay = utcDayOf(now());
    const raw = data.settings.get(HUB_EVENT_STATS_KEY);
    const parsed = eventStatsSchema.safeParse(raw);
    if (!parsed.success) {
      return emptyStats(currentDay);
    }
    if (isRecord(raw) && raw['lifetime'] === undefined) {
      const migrated = parsed.data;
      migrated.lifetime = {
        received: { total: migrated.count, byType: { ...migrated.byType } },
        applied: { total: migrated.applied, byType: { ...migrated.appliedByType } },
        fallback: { total: migrated.fallback, byType: { ...migrated.fallbackByType } },
        dropped: { total: migrated.dropped, byType: { ...migrated.droppedByType } },
        fallbackByReason:
          migrated.lastFallbackReason === null || migrated.fallback === 0
            ? {}
            : { [migrated.lastFallbackReason]: migrated.fallback },
      };
      return migrated;
    }
    return parsed.data;
  }

  function bumpMap(map: Record<string, number>, key: string): Record<string, number> {
    return { ...map, [key]: (map[key] ?? 0) + 1 };
  }

  function bumpCounter(counter: HubTelemetryCounter, eventType: string): HubTelemetryCounter {
    return {
      total: counter.total + 1,
      byType: bumpMap(counter.byType, eventType),
    };
  }

  // Daily event counter persists in the settings KV (same home as
  // hubSync.lastEventId) so a mid-shift restart keeps the day's count.
  let eventStats: EventStats = readInitialEventStats();

  function resetStatsFor(day: string): void {
    eventStats = {
      ...emptyStats(day),
      lifetime: eventStats.lifetime,
    };
  }

  function ensureStatsForToday(): void {
    const day = utcDayOf(now());
    if (eventStats.day !== day) {
      resetStatsFor(day);
    }
  }

  function recordLifetime(
    kind: 'received' | 'applied' | 'fallback' | 'dropped',
    eventType: string,
  ): void {
    eventStats = {
      ...eventStats,
      lifetime: {
        ...eventStats.lifetime,
        [kind]: bumpCounter(eventStats.lifetime[kind], eventType),
      },
    };
  }

  function recordDailyFallbackReason(reason: HubFallbackReason): void {
    eventStats = {
      ...eventStats,
      fallbackByReason: bumpMap(eventStats.fallbackByReason, reason),
      lifetime: {
        ...eventStats.lifetime,
        fallbackByReason: bumpMap(eventStats.lifetime.fallbackByReason, reason),
      },
    };
  }

  function recordDailyFallback(reason: HubFallbackReason, eventType: string): void {
    eventStats = {
      ...eventStats,
      fallback: eventStats.fallback + 1,
      fallbackByType: bumpMap(eventStats.fallbackByType, eventType),
      lastFallbackReason: reason,
    };
    recordLifetime('fallback', eventType);
    recordDailyFallbackReason(reason);
  }

  function recordDailyApplied(eventType: string): void {
    eventStats = {
      ...eventStats,
      applied: eventStats.applied + 1,
      appliedByType: bumpMap(eventStats.appliedByType, eventType),
    };
    recordLifetime('applied', eventType);
  }

  function recordDailyReceived(event: SyncEvent): void {
    eventStats = {
      ...eventStats,
      count: eventStats.count + 1,
      byType: bumpMap(eventStats.byType, event.type),
      lastEventAt: now(),
      lastEventType: event.type,
    };
    recordLifetime('received', event.type);
  }

  function persistEventStats(): void {
    try {
      data.settings.set(HUB_EVENT_STATS_KEY, eventStats);
    } catch {
      // Liveness bookkeeping must never break event handling.
    }
  }

  function recordHubEvent(event: SyncEvent): void {
    ensureStatsForToday();
    recordDailyReceived(event);
    persistEventStats();
  }

  function recordApplied(eventType: string): void {
    ensureStatsForToday();
    recordDailyApplied(eventType);
    persistEventStats();
  }

  function recordFallback(
    reason: HubFallbackReason,
    eventType: string,
    fields?: Record<string, unknown>,
  ): void {
    ensureStatsForToday();
    recordDailyFallback(reason, eventType);
    persistEventStats();
    onLog('info', `hub fallback: ${reason}`, { reason, ...fields });
  }

  function emit(event: SyncEvent): void {
    for (const listener of listeners) {
      listener(event);
    }
  }

  function emitStatus(): void {
    for (const listener of statusListeners) {
      listener();
    }
  }

  // All polling events forward unchanged — one subscription surface.
  polling.subscribe(emit);

  /** messages.deleted arrives without chatId — recover it from the local row. */
  function lookupChatId(accountId: string, messageId: string): string | null {
    // Raw row probe: MessagesQueries has no (account, message) lookup and the
    // db module is outside this change's lane; messages PK columns are stable.
    const row: unknown = data.db
      .prepare(
        'SELECT chat_id FROM messages WHERE account_id = @account_id AND message_id = @message_id',
      )
      .get({ account_id: accountId, message_id: messageId });
    if (
      typeof row === 'object' &&
      row !== null &&
      'chat_id' in row &&
      typeof row.chat_id === 'string'
    ) {
      return row.chat_id;
    }
    return null;
  }

  /**
   * An unresolved Core tombstone can target a preview-only cached head: with
   * auto-read disabled there is deliberately no local message row to mark.
   * Reconciliation normally replaces it with the previous upstream head; if
   * the read projection still lags, clear only the exact deleted head so it
   * cannot remain visible after the recovery cursor is checkpointed.
   */
  function clearStillTombstonedCachedHeads(
    accountId: string,
    messageIds: readonly string[],
  ): void {
    for (const messageId of new Set(messageIds)) {
      const row: unknown = data.db
        .prepare(
          'SELECT chat_id FROM chats WHERE account_id = @account_id AND last_message_id = @message_id',
        )
        .get({ account_id: accountId, message_id: messageId });
      if (
        typeof row !== 'object'
        || row === null
        || !('chat_id' in row)
        || typeof row.chat_id !== 'string'
      ) {
        continue;
      }
      const current = data.chats.get(accountId, row.chat_id);
      if (current === null || current.lastMessageId !== messageId) {
        continue;
      }
      // An outgoing cached head never contributes to unread/tip aggregates.
      // When the authoritative list still lags this tombstone, clearing that
      // head must not consume an older unread fan message that remains in the
      // thread. Incoming heads retain the existing best-effort decrement until
      // the next authoritative reconciliation replaces the whole tuple.
      const outgoingHead = current.lastMessageIsSentByMe;
      const unreadCount = outgoingHead
        ? current.unreadCount
        : Math.max(0, current.unreadCount - 1);
      data.chats.upsert({
        accountId: current.accountId,
        chatId: current.chatId,
        fanName: current.fanName,
        avatar: current.avatar,
        unreadCount,
        hasUnreadTips: outgoingHead
          ? current.hasUnreadTips
          : (unreadCount === 0 ? false : current.hasUnreadTips),
        lastMessageAt: null,
        lastMessagePreview: '',
        lastMessageIsSentByMe: false,
        lastMessageId: null,
        lastReadMessageId: current.lastReadMessageId,
        pinned: current.pinned,
        canSendMessage: current.canSendMessage,
        canNotSendReason: current.canNotSendReason,
        raw: { source: 'hub-delete-tombstone', deletedMessageId: messageId },
      });
    }
  }

  function snapshotHeadIsCurrent(
    thread: SyncSnapshotThread,
    existingAt: string | null,
    existingMessageId: string | null,
    existingHeadWasDeleted: boolean,
  ): boolean {
    // A tombstone is an authoritative reason for a head to move backwards or
    // become null. Timestamp monotonicity is invalid for that transition.
    if (existingHeadWasDeleted) {
      return true;
    }
    if (thread.lastMessageId === existingMessageId) {
      return true;
    }
    if (thread.lastMessageId === null) {
      return existingMessageId === null;
    }
    if (existingMessageId === null) {
      return true;
    }
    if (thread.lastMessageAt !== null && existingAt !== null) {
      const snapshotMs = Date.parse(thread.lastMessageAt);
      const existingMs = Date.parse(existingAt);
      if (!Number.isNaN(snapshotMs) && !Number.isNaN(existingMs) && snapshotMs !== existingMs) {
        return snapshotMs > existingMs;
      }
    }
    // OF timestamps can tie. The durable numeric message id is the remaining
    // monotonic signal; without this tie-break a delayed M5 snapshot can
    // overwrite a locally observed M6 and then be checkpointed permanently.
    return compareMessageIds(thread.lastMessageId, existingMessageId) >= 0;
  }

  function upsertSnapshotThread(
    accountId: string,
    thread: SyncSnapshotThread,
    tombstonedMessageIds: ReadonlySet<string>,
  ): void {
    const existing = data.chats.get(accountId, thread.chatId);
    if (!thread.visible && existing === null) {
      return;
    }
    const existingHeadWasDeleted =
      existing?.lastMessageId !== null
      && existing?.lastMessageId !== undefined
      && (
        tombstonedMessageIds.has(existing.lastMessageId)
        || data.messages.get(accountId, thread.chatId, existing.lastMessageId)?.deleted === true
      );
    const useSnapshotHead = snapshotHeadIsCurrent(
      thread,
      existing?.lastMessageAt ?? null,
      existing?.lastMessageId ?? null,
      existingHeadWasDeleted,
    );
    const hasUnreadTips = useSnapshotHead
      ? (thread.hasUnreadTips ?? (thread.unreadCount === 0 ? false : (existing?.hasUnreadTips ?? false)))
      : (existing?.hasUnreadTips ?? false);
    data.chats.upsert({
      accountId,
      chatId: thread.chatId,
      fanName: existing?.fanName ?? thread.fanName,
      avatar: existing?.avatar ?? null,
      unreadCount: useSnapshotHead ? thread.unreadCount : (existing?.unreadCount ?? 0),
      hasUnreadTips,
      lastMessageAt: useSnapshotHead ? thread.lastMessageAt : (existing?.lastMessageAt ?? null),
      lastMessagePreview: useSnapshotHead
        ? thread.lastMessagePreview
        : (existing?.lastMessagePreview ?? ''),
      lastMessageIsSentByMe: useSnapshotHead
        ? thread.lastMessageIsSentByMe
        : (existing?.lastMessageIsSentByMe ?? false),
      lastMessageId: useSnapshotHead
        ? thread.lastMessageId
        : (existing?.lastMessageId ?? null),
      lastReadMessageId: existing?.lastReadMessageId ?? null,
      pinned: existing?.pinned ?? false,
      canSendMessage: existing?.canSendMessage ?? true,
      canNotSendReason: existing?.canNotSendReason ?? null,
      raw: {
        source: 'hub-snapshot',
        sourceUpdatedAt: thread.sourceUpdatedAt,
        visible: thread.visible,
      },
    });
  }

  async function applyHubSnapshot(snapshot: SyncSnapshotResponse): Promise<void> {
    if (!handledAccountIds.includes(snapshot.page.accountId)) {
      throw new Error(`Snapshot account ${snapshot.page.accountId} is not handled locally`);
    }
    if (snapshot.page.authenticated !== null) {
      data.accounts.setAuthState(
        snapshot.page.accountId,
        snapshot.page.authenticated ? 'authenticated' : 'unauthenticated',
      );
    }

    const tombstonedMessageIds = new Set([
      ...snapshot.threads.flatMap((thread) =>
        thread.messages
          .filter((item) => item.deletedAt !== null)
          .map((item) => item.messageId)),
      ...snapshot.unresolvedTombstones.map((item) => item.messageId),
    ]);

    for (const thread of snapshot.threads) {
      upsertSnapshotThread(snapshot.page.accountId, thread, tombstonedMessageIds);
    }
    for (const thread of snapshot.threads) {
      if (!thread.visible && data.chats.get(snapshot.page.accountId, thread.chatId) === null) {
        continue;
      }
      for (const item of thread.messages) {
        if (
          item.chatId !== thread.chatId
          || (item.message !== null && item.message.id !== item.messageId)
        ) {
          throw new Error(`Snapshot message scope mismatch for ${item.messageId}`);
        }
        const local = data.messages.get(snapshot.page.accountId, thread.chatId, item.messageId);
        if (item.message !== null && local?.deleted !== true) {
          if (local) {
            // Existing bodies may have been corrected by a concurrent explicit
            // REST read. Preserve them; only merge monotonic webhook facts.
            data.messages.upsertMany([{
              ...local,
              isOpened: local.isOpened === true || item.message.isOpened === true
                ? true
                : (local.isOpened ?? item.message.isOpened ?? null),
              isTip: local.isTip || (item.message.isTip ?? false),
              tipAmount: Math.max(
                local.tipAmount ?? 0,
                item.message.tipAmountUsd ?? 0,
              ) || null,
              raw: {
                source: 'hub-snapshot-merge',
                sourceUpdatedAt: item.sourceUpdatedAt,
                sourceFanoutSeq: item.sourceFanoutSeq,
              },
            }]);
          } else {
            const applied = await polling.ingestHubMessage(
              snapshot.page.accountId,
              thread.chatId,
              item.message,
            );
            if (!applied) {
              throw new Error(`Snapshot message failed local mapping for ${item.messageId}`);
            }
          }
        }
        if (item.deletedAt !== null) {
          data.messages.markDeleted(snapshot.page.accountId, thread.chatId, [item.messageId]);
        }
      }
    }
    for (const tombstone of snapshot.unresolvedTombstones) {
      const chatId = lookupChatId(snapshot.page.accountId, tombstone.messageId);
      if (chatId !== null) {
        data.messages.markDeleted(snapshot.page.accountId, chatId, [tombstone.messageId]);
      }
    }
    // Re-apply authoritative heads after message upserts, which intentionally
    // use the normal idempotent ingest path and its local chat-head heuristic.
    for (const thread of snapshot.threads) {
      upsertSnapshotThread(snapshot.page.accountId, thread, tombstonedMessageIds);
    }
    if (snapshot.unresolvedTombstones.length > 0) {
      // Core intentionally cannot attach these deletes to a thread. With
      // auto-read off Desktop may likewise have only a cached chat preview and
      // no message row, so a local tombstone alone cannot repair the head.
      // Await one authoritative account reconciliation before HubSync may
      // persist this page's continuation/checkpoint.
      await polling.reconcileAccountHeadNow(snapshot.page.accountId);
      clearStillTombstonedCachedHeads(
        snapshot.page.accountId,
        snapshot.unresolvedTombstones.map((item) => item.messageId),
      );
    } else {
      emit({ type: 'chatListUpdated', accountId: snapshot.page.accountId });
    }
    onLog('info', 'hub snapshot page applied', {
      accountId: snapshot.page.accountId,
      snapshotCursor: snapshot.snapshotCursor,
      threads: snapshot.threads.length,
      nextPageCursor: snapshot.nextPageCursor,
      unresolvedTombstones: snapshot.unresolvedTombstones.length,
    });
  }

  /** The fresh-cursor request proved the bearer is valid. Refresh the actual
   * read-gateway account universe before HubSync snapshots or filters events:
   * grant shrink, shrink-to-zero and newly granted accounts all reconfigure the
   * provider without deleting cached local data. */
  async function handleV2GapRecovered(): Promise<readonly string[]> {
    const previousAccountIds = handledAccountIds;
    const refreshedAccountIds = await polling.refreshAccountGrants();
    handledAccountIds = [...refreshedAccountIds];
    recordFallback('hub-v2-gap-cursor-rebaseline', 'syncSnapshotRequired', {
      accountsBefore: previousAccountIds.length,
      accountsAfter: handledAccountIds.length,
    });
    onLog('info', 'v2 account grants refreshed for durable reconciliation', {
      accountsBefore: previousAccountIds.length,
      accountsAfter: handledAccountIds.length,
    });
    return handledAccountIds;
  }

  async function handleHubEvent(event: SyncEvent): Promise<void> {
    recordHubEvent(event);
    switch (event.type) {
      case 'messageReceived':
      case 'messageSent': {
        if (event.message && event.message.id === event.messageId) {
          try {
            if (await polling.ingestHubMessage(event.accountId, event.chatId, event.message)) {
              onLog('debug', 'hub enriched message applied', {
                type: event.type,
                accountId: event.accountId,
                chatId: event.chatId,
                messageId: event.messageId,
              });
              emit(event);
              recordApplied(event.type);
              break;
            }
            recordFallback('hub-malformed-message-fallback', event.type, {
              type: event.type,
              accountId: event.accountId,
              chatId: event.chatId,
              messageId: event.messageId,
            });
          } catch {
            recordFallback('hub-ingest-error-fallback', event.type, {
              type: event.type,
              accountId: event.accountId,
              chatId: event.chatId,
              messageId: event.messageId,
            });
            // fall through to the legacy reconciliation path below
          }
        } else {
          recordFallback(
            event.message ? 'hub-mismatched-message-fallback' : 'hub-id-only-fallback',
            event.type,
            {
              type: event.type,
              accountId: event.accountId,
              chatId: event.chatId,
              messageId: event.messageId,
              hubMessageId: event.message?.id,
            },
          );
        }

        // Older Core frames and incomplete/mismatched bodies still reconcile via
        // the polling provider. With auto-read off this is list-only.
        // Cursor safety: a thin frame is not durable locally until this fallback
        // read has really applied. Let failure reject onEvent so HubSync replays
        // the frame instead of checkpointing past missing state.
        await polling.refreshChat(event.accountId, event.chatId, undefined, event.messageId);
        emit(event);
        recordApplied(event.type);
        break;
      }
      case 'ppvUnlocked':
        // Notification-shaped events are ADVISORY toward the stream cursor:
        // the unlock is applied locally through the monotonic markOpened
        // merge, and OFAPI itself reports isOpened on any later body read, so
        // this handler must never reject. A rejected onEvent blocks the
        // checkpoint, and a deterministically failing frame (incident
        // 2026-07-15: core shipped the creator id as the conversation) then
        // replays forever — an SSE reconnect loop that burns paid reads. Only
        // message-body carriers (messageReceived/Sent) may reject.
        recordFallback('hub-notification-fallback', event.type, {
          type: event.type,
          accountId: event.accountId,
          chatId: event.chatId,
          messageId: event.messageId,
        });
        if (event.messageId !== undefined) {
          data.messages.markOpened(event.accountId, event.chatId, event.messageId);
        }
        // Best-effort preview refresh, detached from the checkpoint. No
        // expectedMessageId: an unlocked PPV is historical and legitimately
        // absent from the cached tail window; demanding it locally is what
        // wedged the stream.
        void polling
          .refreshChat(event.accountId, event.chatId, undefined, undefined)
          .then(() => {
            // If the refresh materialized a previously uncached target, apply
            // the same fact now. The SQL merge prevents this (or a later stale
            // fetch) from ever regressing an already-opened message.
            if (event.messageId !== undefined) {
              data.messages.markOpened(event.accountId, event.chatId, event.messageId);
            }
          })
          .catch(() => {
            recordFallback('hub-notification-refresh-failed', event.type, {
              type: event.type,
              accountId: event.accountId,
              chatId: event.chatId,
              messageId: event.messageId,
            });
          });
        emit(event);
        recordApplied(event.type);
        break;
      case 'tipReceived':
        // Notification-shaped events are not full messages — and, like
        // ppvUnlocked above, advisory toward the cursor: the refresh is
        // best-effort and must not reject the checkpoint.
        recordFallback('hub-notification-fallback', event.type, {
          type: event.type,
          accountId: event.accountId,
          chatId: event.chatId,
          messageId: event.messageId,
        });
        void polling
          .refreshChat(event.accountId, event.chatId, undefined, undefined)
          .catch(() => {
            recordFallback('hub-notification-refresh-failed', event.type, {
              type: event.type,
              accountId: event.accountId,
              chatId: event.chatId,
              messageId: event.messageId,
            });
          });
        emit(event);
        recordApplied(event.type);
        break;
      case 'messageDeleted': {
        const chatId = event.chatId ?? lookupChatId(event.accountId, event.messageId);
        if (chatId === null) {
          recordFallback('unknown-delete-head-refresh', event.type, {
            accountId: event.accountId,
            messageId: event.messageId,
          });
          await polling.reconcileAccountHeadNow(event.accountId);
          clearStillTombstonedCachedHeads(event.accountId, [event.messageId]);
          return; // unknown message: nothing to tombstone, drop silently
        }
        // Tombstone (deleted=1) publishes bus scope 'messages' for the chat.
        data.messages.markDeleted(event.accountId, chatId, [event.messageId]);
        await polling.reconcileAccountHeadNow(event.accountId);
        clearStillTombstonedCachedHeads(event.accountId, [event.messageId]);
        emit({ ...event, chatId });
        recordApplied(event.type);
        break;
      }
      case 'chatListUpdated':
        // This event is a nudge, not a replacement chat snapshot. In
        // particular, subscription events are projected to chatListUpdated
        // while the read gateway may still advertise the previous message
        // head. Preserve a newer Hub-delivered head until an authoritative
        // ordinary poll or messageDeleted reconciliation proves otherwise.
        await polling.refreshAccountHead(event.accountId);
        recordApplied(event.type);
        break;
      default:
        emit(event); // typing/presence/accountAuthChanged/…
        recordApplied(event.type);
    }
  }

  function handleHubStatus(status: HubSyncStatus): void {
    const isLive = status === 'live';
    const override = modeOverride();
    statusChangedAtMs = now();
    liveSinceMs = isLive ? (liveSinceMs ?? now()) : null;
    if (override === 'hub') {
      if (isLive && !hubLive) {
        onLog('info', 'SSE live; force-hub keeps polling suspended', { status, override });
        if (!forceHubSuspended) {
          polling.setHubPollingSuspended(true);
          forceHubSuspended = true;
        }
      } else if (!isLive && hubLive) {
        onLog('warn', 'SSE not live; force-hub keeps polling suspended', { status, override });
      } else {
        onLog(
          status === 'degraded' || status === 'auth-failed' ? 'warn' : 'info',
          `SSE ${status}`,
          { status, override },
        );
      }
      hubLive = isLive;
      emitStatus();
      return;
    }
    if (isLive && !hubLive) {
      onLog('info', 'SSE live; polling suspended', { status });
      polling.setHubPollingSuspended(true);
    } else if (!isLive && hubLive) {
      // Hub degraded/stopped: restore the standing poll cadence and nothing
      // more. SSE state transitions may change the SCHEDULER MODE but must
      // never initiate paid work beyond it — the resumed loop's first tick
      // already runs the deep sweep under its own 5-minute cap when one is
      // due. The removed forceRefresh here (uncapped 5-page sweep × every
      // account per flap) was the cost amplifier of incident 2026-07-15:
      // a poisoned frame flapped the stream every ~14s all night and each
      // flap burned a full deep sweep (~14k credits). Manual refresh remains
      // the only deep-sweep bypass, via the explicit user IPC path.
      onLog(status === 'stopped' ? 'info' : 'warn', 'SSE not live; polling resumed', { status });
      polling.setHubPollingSuspended(false);
    } else {
      onLog(
        status === 'degraded' || status === 'auth-failed' ? 'warn' : 'info',
        `SSE ${status}`,
        { status },
      );
    }
    hubLive = isLive;
    emitStatus();
  }

  async function startHub(): Promise<void> {
    hubGeneration += 1;
    const generation = hubGeneration;
    const override = modeOverride();
    if (override === 'polling') {
      onLog('warn', 'hub forced to polling; SSE connection skipped', { override });
      if (forceHubSuspended || hubLive) {
        polling.setHubPollingSuspended(false);
      }
      hubLive = false;
      forceHubSuspended = false;
      hub = null;
      emitStatus();
      return;
    }
    onLog('info', 'hub configure check started');
    const next = await createHub(
      {
        onEvent: handleHubEvent,
        onStatusChange: handleHubStatus,
        onSnapshot: applyHubSnapshot,
        onSnapshotRequired: (input) => {
          recordFallback('hub-replay-gap-snapshot', 'syncSnapshotRequired', input);
        },
        onV2GapRecovered: handleV2GapRecovered,
      },
      handledAccountIds,
    );
    if (!running || generation !== hubGeneration) {
      next?.stop(); // superseded while resolving settings/keychain
      return;
    }
    hub = next;
    if (hub === null) {
      if (override === 'hub') {
        onLog('warn', 'hub forced but not configured; using polling only', { override });
      }
      onLog('info', 'hub not configured; using polling only');
      emitStatus();
      return;
    }
    if (override === 'hub' && !forceHubSuspended) {
      onLog('warn', 'hub forced; polling fallback suspended while SSE connects', { override });
      polling.setHubPollingSuspended(true);
      forceHubSuspended = true;
    }
    onLog('info', 'hub configured; starting SSE');
    emitStatus();
    hub.start();
  }

  function stopHub(): void {
    hubGeneration += 1;
    onLog('info', 'hub stopped');
    hub?.stop();
    hub = null;
    if (hubLive || forceHubSuspended) {
      onLog('info', 'polling resumed after hub stop');
      polling.setHubPollingSuspended(false);
    }
    hubLive = false;
    forceHubSuspended = false;
    emitStatus();
  }

  function hubMode(): HubMode {
    const status = hub?.status() ?? null;
    if (status === 'live') {
      return 'live';
    }
    return status === null || status === 'stopped' ? 'off' : 'degraded';
  }

  return {
    start(accountIds) {
      running = true;
      handledAccountIds = [...accountIds];
      polling.start(accountIds);
      void startHub();
    },
    async stop() {
      running = false;
      stopHub();
      await polling.stop();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeStatus(listener) {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    refreshAccountHead: (accountId) => polling.refreshAccountHead(accountId),
    refreshChat: (accountId, chatId, purpose, expectedMessageId) =>
      polling.refreshChat(accountId, chatId, purpose, expectedMessageId),
    readChatTailForUserOpen: (accountId, chatId, purpose) =>
      polling.readChatTailForUserOpen(accountId, chatId, purpose),
    loadOlderMessagesForUserOpen: (accountId, chatId) =>
      polling.loadOlderMessagesForUserOpen(accountId, chatId),
    ensureChat: (accountId, chatId, hint) => polling.ensureChat(accountId, chatId, hint),
    openConversation: (accountId, chatId) => polling.openConversation(accountId, chatId),
    closeConversation: (accountId, chatId) => polling.closeConversation(accountId, chatId),
    setFocusedAccount: (accountId) => polling.setFocusedAccount(accountId),
    setWindowVisible: (visible) => polling.setWindowVisible(visible),
    forceRefresh: (accountId) => polling.forceRefresh(accountId),
    reconcileUnread: (accountId, trigger) => polling.reconcileUnread(accountId, trigger),
    status: (): SyncStatusSnapshot => polling.status(),
    pollAccount: (accountId) => polling.pollAccount(accountId),
    async reconfigureHub() {
      if (!running) {
        return;
      }
      onLog('info', 'hub reconfigure requested');
      stopHub();
      await startHub();
    },
    hubStatus: () => hub?.status() ?? null,
    hubMode,
    hubModeOverride: () => modeOverride(),
    hubActivity: (): HubActivitySnapshot => {
      const day = utcDayOf(now());
      const sameDay = eventStats.day === day;
      return {
        lastEventAt: sameDay ? eventStats.lastEventAt : null,
        lastEventType: sameDay ? eventStats.lastEventType : null,
        eventsToday: sameDay ? eventStats.count : 0,
        appliedEventsToday: sameDay ? eventStats.applied : 0,
        fallbackEventsToday: sameDay ? eventStats.fallback : 0,
        droppedEventsToday: sameDay ? eventStats.dropped : 0,
        eventsByTypeToday: sameDay ? eventStats.byType : {},
        appliedByTypeToday: sameDay ? eventStats.appliedByType : {},
        fallbackByTypeToday: sameDay ? eventStats.fallbackByType : {},
        droppedByTypeToday: sameDay ? eventStats.droppedByType : {},
        fallbackByReasonToday: sameDay ? eventStats.fallbackByReason : {},
        lifetime: eventStats.lifetime,
        lastFallbackReason: sameDay ? eventStats.lastFallbackReason : null,
        liveSinceMs,
        statusChangedAtMs,
        droppedFrames: hub?.droppedFrameCount() ?? 0,
      };
    },
  };
}
