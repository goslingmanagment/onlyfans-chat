// Hub-aware sync composition (SPEC §6.2): PollingSync keeps running and keeps
// owning hydration, read-state sweeps, media polling, refreshChat and
// openConversation; HubSync only changes WHEN bodies are fetched. Hub frames
// carry ids, not bodies — message-bearing events trigger a tail fetch through
// the polling provider before re-emitting, so SQLite stays the single source
// of truth. Both providers' events flow through ONE listener set: the send
// engine's messageSent subscription works identically in either mode.

import { z } from 'zod';
import type { SyncEvent } from '@chatgoose/shared/protocol/index';
import type { DataLayer } from '../db/index';
import type { HubSync, HubSyncStatus } from './hub-sync';
import type { SyncListener, SyncProvider, SyncStatusSnapshot } from './provider';

type PollingLike = SyncProvider & {
  pollAccount(accountId: string): Promise<void>;
  setHubDemoted(demoted: boolean): void;
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
  now?: () => number;
}

/** Stream liveness for the Activity panel (PLAN item 9). */
export interface HubActivitySnapshot {
  /** Epoch ms of the last parsed hub frame; null = none yet (or restart-stale day). */
  lastEventAt: number | null;
  lastEventType: string | null;
  /** Frames handled today (UTC) — persisted, survives restarts. */
  eventsToday: number;
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
  lastEventAt: z.number().nullable(),
  lastEventType: z.string().nullable(),
});
type EventStats = z.infer<typeof eventStatsSchema>;

export interface HubAwareSync extends SyncProvider {
  pollAccount(accountId: string): Promise<void>;
  /** Recreates the hub connection from current settings (key/URL changes). */
  reconfigureHub(): Promise<void>;
  hubStatus(): HubSyncStatus | null;
  hubActivity(): HubActivitySnapshot;
}

export function createHubAwareSync(options: HubAwareSyncOptions): HubAwareSync {
  const { polling, data, createHub } = options;
  const now = options.now ?? Date.now;

  const listeners = new Set<SyncListener>();
  let hub: HubSync | null = null;
  let hubLive = false;
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
    lastEventAt: null,
    lastEventType: null,
  };

  function recordHubEvent(event: SyncEvent): void {
    const day = utcDayOf(now());
    eventStats = {
      day,
      count: eventStats.day === day ? eventStats.count + 1 : 1,
      lastEventAt: now(),
      lastEventType: event.type,
    };
    try {
      data.settings.set(HUB_EVENT_STATS_KEY, eventStats);
    } catch {
      // Liveness bookkeeping must never break event handling.
    }
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
      case 'messageSent':
      case 'ppvUnlocked':
      case 'tipReceived':
        // Fetch the bodies first so renderer invalidation finds fresh rows.
        // refreshChat emits its own chatListUpdated; it never emits message
        // events, so re-emitting the original frame cannot duplicate.
        try {
          await polling.refreshChat(event.accountId, event.chatId);
        } catch {
          // transient fetch failure: still emit — polling reconciles later
        }
        emit(event);
        break;
      case 'messageDeleted': {
        const chatId = event.chatId ?? lookupChatId(event.accountId, event.messageId);
        if (chatId === null) {
          return; // unknown message: nothing to tombstone, drop silently
        }
        // Tombstone (deleted=1) publishes bus scope 'messages' for the chat.
        data.messages.markDeleted(event.accountId, chatId, [event.messageId]);
        emit({ ...event, chatId });
        break;
      }
      default:
        emit(event); // typing/presence/accountAuthChanged/chatListUpdated/…
    }
  }

  function handleHubStatus(status: HubSyncStatus): void {
    const isLive = status === 'live';
    statusChangedAtMs = now();
    liveSinceMs = isLive ? (liveSinceMs ?? now()) : null;
    if (isLive && !hubLive) {
      polling.setHubDemoted(true);
    } else if (!isLive && hubLive) {
      // Hub degraded/stopped: restore full cadence and run one reconciliation
      // sweep to close the gap the stream was covering (SPEC §6.2).
      polling.setHubDemoted(false);
      void polling.forceRefresh().catch(() => undefined);
    }
    hubLive = isLive;
  }

  async function startHub(): Promise<void> {
    hubGeneration += 1;
    const generation = hubGeneration;
    const next = await createHub({ onEvent: handleHubEvent, onStatusChange: handleHubStatus });
    if (!running || generation !== hubGeneration) {
      next?.stop(); // superseded while resolving settings/keychain
      return;
    }
    hub = next;
    hub?.start();
  }

  function stopHub(): void {
    hubGeneration += 1;
    hub?.stop();
    hub = null;
    if (hubLive) {
      hubLive = false;
      polling.setHubDemoted(false);
    }
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
    refreshChat: (accountId, chatId) => polling.refreshChat(accountId, chatId),
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
      stopHub();
      await startHub();
    },
    hubStatus: () => hub?.status() ?? null,
    hubActivity: (): HubActivitySnapshot => {
      const day = utcDayOf(now());
      const sameDay = eventStats.day === day;
      return {
        lastEventAt: sameDay ? eventStats.lastEventAt : null,
        lastEventType: sameDay ? eventStats.lastEventType : null,
        eventsToday: sameDay ? eventStats.count : 0,
        liveSinceMs,
        statusChangedAtMs,
        droppedFrames: hub?.droppedFrameCount() ?? 0,
      };
    },
  };
}
