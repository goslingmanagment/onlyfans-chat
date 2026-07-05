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
import type { SyncListener, SyncProvider, SyncStatusSnapshot } from './provider';

export type HubMode = 'live' | 'degraded' | 'off';
const HUB_FALLBACK_REASONS = [
  'hub-id-only-fallback',
  'hub-mismatched-message-fallback',
  'hub-malformed-message-fallback',
  'hub-notification-fallback',
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
  /** Stage 24: v2 gap recovery installed a fresh cursor — polling reconciles
   *  the missed window (the v2 snapshot carries no projection pages). */
  onV2GapRecovered: () => Promise<void>;
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

  function snapshotHeadIsCurrent(thread: SyncSnapshotThread, existingAt: string | null): boolean {
    if (thread.lastMessageAt === null) {
      return existingAt === null;
    }
    if (existingAt === null) {
      return true;
    }
    return Date.parse(thread.lastMessageAt) >= Date.parse(existingAt);
  }

  function upsertSnapshotThread(accountId: string, thread: SyncSnapshotThread): void {
    const existing = data.chats.get(accountId, thread.chatId);
    if (!thread.visible && existing === null) {
      return;
    }
    const useSnapshotHead = snapshotHeadIsCurrent(thread, existing?.lastMessageAt ?? null);
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

    for (const thread of snapshot.threads) {
      upsertSnapshotThread(snapshot.page.accountId, thread);
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
      upsertSnapshotThread(snapshot.page.accountId, thread);
    }
    emit({ type: 'chatListUpdated', accountId: snapshot.page.accountId });
    onLog('info', 'hub snapshot page applied', {
      accountId: snapshot.page.accountId,
      snapshotCursor: snapshot.snapshotCursor,
      threads: snapshot.threads.length,
      nextPageCursor: snapshot.nextPageCursor,
      unresolvedTombstones: snapshot.unresolvedTombstones.length,
    });
  }

  /** Stage 24 v2 gap recovery: the stream re-baselined to "now"; the missed
   * window reconciles through the authoritative polling path (list-only head
   * refresh per handled account — same reconciliation the per-event fallback
   * uses). */
  async function handleV2GapRecovered(): Promise<void> {
    recordFallback('hub-v2-gap-cursor-rebaseline', 'syncSnapshotRequired', {
      accounts: handledAccountIds.length,
    });
    for (const accountId of handledAccountIds) {
      try {
        await polling.refreshAccountHead(accountId);
      } catch {
        // transient fetch failure: polling cadence reconciles later
      }
      emit({ type: 'chatListUpdated', accountId });
    }
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
        try {
          await polling.refreshChat(event.accountId, event.chatId);
        } catch {
          // transient fetch failure: still emit — polling reconciles later
        }
        emit(event);
        recordApplied(event.type);
        break;
      }
      case 'ppvUnlocked':
      case 'tipReceived':
        // Notification-shaped events are not full messages. Keep the existing
        // reconciliation path; with auto-read off, refreshChat is list-only.
        recordFallback('hub-notification-fallback', event.type, {
          type: event.type,
          accountId: event.accountId,
          chatId: event.chatId,
          messageId: event.messageId,
        });
        try {
          await polling.refreshChat(event.accountId, event.chatId);
        } catch {
          // transient fetch failure: still emit — polling reconciles later
        }
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
          try {
            await polling.refreshAccountHead(event.accountId);
          } catch {
            // transient fetch failure: the next hub activity/degrade refresh reconciles
          }
          return; // unknown message: nothing to tombstone, drop silently
        }
        // Tombstone (deleted=1) publishes bus scope 'messages' for the chat.
        data.messages.markDeleted(event.accountId, chatId, [event.messageId]);
        try {
          await polling.refreshAccountHead(event.accountId);
        } catch {
          // transient fetch failure: still emit the tombstone
        }
        emit({ ...event, chatId });
        recordApplied(event.type);
        break;
      }
      case 'chatListUpdated':
        try {
          await polling.refreshAccountHead(event.accountId);
        } catch {
          emit(event);
        }
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
      // Hub degraded/stopped: restore polling and run one reconciliation sweep
      // to close the gap the stream was covering (SPEC §6.2).
      onLog(status === 'stopped' ? 'info' : 'warn', 'SSE not live; polling resumed', { status });
      polling.setHubPollingSuspended(false);
      void polling.forceRefresh().catch(() => undefined);
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
    stop() {
      running = false;
      stopHub();
      polling.stop();
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
    refreshChat: (accountId, chatId, purpose) => polling.refreshChat(accountId, chatId, purpose),
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
