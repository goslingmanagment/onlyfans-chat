// Hub-aware sync composition (SPEC §6.2): PollingSync owns hydration,
// read-state sweeps, media polling, refreshChat, readChatTailForUserOpen and
// openConversation. While HubSync is live, periodic chat-list polling is paused
// after hydration; enriched message frames ingest locally, and id-only/
// notification activity falls back to scoped/body reads or debounced list-only
// refreshes. Both providers' events flow through ONE listener set: the send
// engine's messageSent subscription works identically in either mode.

import { z } from 'zod';
import type { HubModeOverrideSetting } from '@chatgoose/shared/hub/mode';
import type { NormalizedSyncMessage, SyncEvent } from '@chatgoose/shared/protocol/index';
import type { DataLayer } from '../db/index';
import type { HubSync, HubSyncStatus } from './hub-sync';
import type { SyncListener, SyncProvider, SyncStatusSnapshot } from './provider';

export type HubMode = 'live' | 'degraded' | 'off';
export type HubFallbackReason =
  | 'hub-id-only-fallback'
  | 'hub-mismatched-message-fallback'
  | 'hub-malformed-message-fallback'
  | 'hub-notification-fallback'
  | 'hub-ingest-error-fallback'
  | 'unknown-delete-head-refresh';

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
}

export interface HubAwareSyncOptions {
  polling: PollingLike;
  data: DataLayer;
  /** Resolves null when hub settings (base URL + chatter key) are absent. */
  createHub: (callbacks: HubFactoryCallbacks) => Promise<HubSync | null>;
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
  lastFallbackReason: HubFallbackReason | null;
  /** Epoch ms the stream went live; null while not live. */
  liveSinceMs: number | null;
  /** Epoch ms of the last status transition (e.g. "unreachable since 19:42"). */
  statusChangedAtMs: number | null;
  droppedFrames: number;
}

const HUB_EVENT_STATS_KEY = 'hubSync.eventStats';

const eventStatsSchema = z.object({
  day: z.string(),
  count: z.number().int().nonnegative(),
  applied: z.number().int().nonnegative().default(0),
  fallback: z.number().int().nonnegative().default(0),
  dropped: z.number().int().nonnegative().default(0),
  byType: z.record(z.string(), z.number().int().nonnegative()).default({}),
  lastEventAt: z.number().nullable(),
  lastEventType: z.string().nullable(),
  lastFallbackReason: z
    .enum([
      'hub-id-only-fallback',
      'hub-mismatched-message-fallback',
      'hub-malformed-message-fallback',
      'hub-notification-fallback',
      'hub-ingest-error-fallback',
      'unknown-delete-head-refresh',
    ])
    .nullable()
    .default(null),
});
type EventStats = z.infer<typeof eventStatsSchema>;

export interface HubAwareSync extends SyncProvider {
  pollAccount(accountId: string): Promise<void>;
  refreshAccountHead(accountId: string): Promise<void>;
  /** Recreates the hub connection from current settings (key/URL changes). */
  reconfigureHub(): Promise<void>;
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
  let hub: HubSync | null = null;
  let hubLive = false;
  let forceHubSuspended = false;
  let running = false;
  /** Invalidates in-flight async hub creation on stop/reconfigure (no leaks). */
  let hubGeneration = 0;
  let liveSinceMs: number | null = null;
  let statusChangedAtMs: number | null = null;

  function utcDayOf(epochMs: number): string {
    return new Date(epochMs).toISOString().slice(0, 10);
  }

  // Daily event counter persists in the settings KV (same home as
  // hubSync.lastEventId) so a mid-shift restart keeps the day's count.
  let eventStats: EventStats = data.settings.getParsed(HUB_EVENT_STATS_KEY, eventStatsSchema) ?? {
    day: utcDayOf(now()),
    count: 0,
    applied: 0,
    fallback: 0,
    dropped: 0,
    byType: {},
    lastEventAt: null,
    lastEventType: null,
    lastFallbackReason: null,
  };

  function resetStatsFor(day: string): void {
    eventStats = {
      day,
      count: 0,
      applied: 0,
      fallback: 0,
      dropped: 0,
      byType: {},
      lastEventAt: null,
      lastEventType: null,
      lastFallbackReason: null,
    };
  }

  function persistEventStats(): void {
    try {
      data.settings.set(HUB_EVENT_STATS_KEY, eventStats);
    } catch {
      // Liveness bookkeeping must never break event handling.
    }
  }

  function recordHubEvent(event: SyncEvent): void {
    const day = utcDayOf(now());
    if (eventStats.day !== day) {
      resetStatsFor(day);
    }
    eventStats = {
      ...eventStats,
      count: eventStats.count + 1,
      byType: { ...eventStats.byType, [event.type]: (eventStats.byType[event.type] ?? 0) + 1 },
      lastEventAt: now(),
      lastEventType: event.type,
    };
    persistEventStats();
  }

  function recordApplied(): void {
    eventStats = { ...eventStats, applied: eventStats.applied + 1 };
    persistEventStats();
  }

  function recordFallback(reason: HubFallbackReason, fields?: Record<string, unknown>): void {
    eventStats = {
      ...eventStats,
      fallback: eventStats.fallback + 1,
      lastFallbackReason: reason,
    };
    persistEventStats();
    onLog('info', `hub fallback: ${reason}`, { reason, ...fields });
  }

  function recordDropped(reason: HubFallbackReason, fields?: Record<string, unknown>): void {
    eventStats = {
      ...eventStats,
      dropped: eventStats.dropped + 1,
      lastFallbackReason: reason,
    };
    persistEventStats();
    onLog('warn', `hub event dropped: ${reason}`, { reason, ...fields });
  }

  function emit(event: SyncEvent): void {
    for (const listener of listeners) {
      listener(event);
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
              recordApplied();
              break;
            }
            recordFallback('hub-malformed-message-fallback', {
              type: event.type,
              accountId: event.accountId,
              chatId: event.chatId,
              messageId: event.messageId,
            });
          } catch {
            recordFallback('hub-ingest-error-fallback', {
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
        recordApplied();
        break;
      }
      case 'ppvUnlocked':
      case 'tipReceived':
        // Notification-shaped events are not full messages. Keep the existing
        // reconciliation path; with auto-read off, refreshChat is list-only.
        recordFallback('hub-notification-fallback', {
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
        recordApplied();
        break;
      case 'messageDeleted': {
        const chatId = event.chatId ?? lookupChatId(event.accountId, event.messageId);
        if (chatId === null) {
          recordFallback('unknown-delete-head-refresh', {
            accountId: event.accountId,
            messageId: event.messageId,
          });
          try {
            await polling.refreshAccountHead(event.accountId);
          } catch {
            // transient fetch failure: the next hub activity/degrade refresh reconciles
          }
          recordDropped('unknown-delete-head-refresh', {
            accountId: event.accountId,
            messageId: event.messageId,
          });
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
        recordApplied();
        break;
      }
      case 'chatListUpdated':
        try {
          await polling.refreshAccountHead(event.accountId);
        } catch {
          emit(event);
        }
        recordApplied();
        break;
      default:
        emit(event); // typing/presence/accountAuthChanged/…
        recordApplied();
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
      return;
    }
    onLog('info', 'hub configure check started');
    const next = await createHub({ onEvent: handleHubEvent, onStatusChange: handleHubStatus });
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
      return;
    }
    if (override === 'hub' && !forceHubSuspended) {
      onLog('warn', 'hub forced; polling fallback suspended while SSE connects', { override });
      polling.setHubPollingSuspended(true);
      forceHubSuspended = true;
    }
    onLog('info', 'hub configured; starting SSE');
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
    refreshAccountHead: (accountId) => polling.refreshAccountHead(accountId),
    refreshChat: (accountId, chatId, purpose) => polling.refreshChat(accountId, chatId, purpose),
    readChatTailForUserOpen: (accountId, chatId, purpose) =>
      polling.readChatTailForUserOpen(accountId, chatId, purpose),
    ensureChat: (accountId, chatId, hint) => polling.ensureChat(accountId, chatId, hint),
    openConversation: (accountId, chatId) => polling.openConversation(accountId, chatId),
    closeConversation: (accountId, chatId) => polling.closeConversation(accountId, chatId),
    setFocusedAccount: (accountId) => polling.setFocusedAccount(accountId),
    setWindowVisible: (visible) => polling.setWindowVisible(visible),
    forceRefresh: (accountId) => polling.forceRefresh(accountId),
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
        lastFallbackReason: sameDay ? eventStats.lastFallbackReason : null,
        liveSinceMs,
        statusChangedAtMs,
        droppedFrames: hub?.droppedFrameCount() ?? 0,
      };
    },
  };
}
