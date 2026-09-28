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
import type {
  HubEventCommit,
  HubFrameMeta,
  HubReplaySummary,
  HubSync,
  HubSyncStatus,
} from './hub-sync';
import { createSyncIntentWorker, type SyncIntentWorker } from './intents';
import { compareMessageIds } from './message-id';
import {
  applyMoneyFact,
  createMoneyFactsCatchUp,
  type MoneyFactEvent,
  type MoneyFactOutcome,
  type MoneyFactsCatchUp,
  type MoneyFactsFetch,
} from './money-facts';
import type {
  ChatTailReadOutcome,
  HubMessageApplyOutcome,
  ListReadOutcome,
  ListReadRecord,
  ListReadTrigger,
  ListVerificationReason,
  ReadAccountHeadOptions,
} from './polling-sync';
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
  /** D39: a money fact failed to apply locally; the facts catch-up re-applies it. */
  'hub-money-fact-error',
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
  /** D38: synchronous apply inside the frame transaction. */
  applyHubMessage(
    accountId: string,
    chatId: string,
    message: NormalizedSyncMessage,
  ): HubMessageApplyOutcome;
  /** D38: page-1 read outside the cadence (verification, safety, intents). */
  readAccountHead(
    accountId: string,
    trigger: ListReadTrigger,
    options?: ReadAccountHeadOptions,
  ): Promise<ListReadOutcome>;
  readChatTailForIntent(accountId: string, chatId: string): Promise<ChatTailReadOutcome>;
  verifyAccounts(accountIds: readonly string[], reason: ListVerificationReason): void;
  noteSystemResume(): void;
  listHeadReached(accountId: string, chatId: string, messageId: string): boolean;
};

export interface HubFactoryCallbacks {
  /** D38: synchronous; runs inside the frame's cursor transaction. */
  onEvent: (event: SyncEvent, meta?: HubFrameMeta) => HubEventCommit;
  onCaughtUp: (summary?: HubReplaySummary) => void;
  onStatusChange: (status: HubSyncStatus) => void;
  onSnapshot: (snapshot: SyncSnapshotResponse) => Promise<void>;
  onSnapshotRequired: (input: {
    requestedSeq: number;
    oldestAvailableSeq: number | null;
    currentSeq: number;
  }) => void;
  /** Refresh current read-gateway grants before v2 state reconciliation. */
  onV2GapRecovered: () => Promise<readonly string[]>;
  /** The hub's Date header (see HubSyncOptions.onServerDate). */
  onServerDate: (serverDateMs: number, receivedAtLocalMs: number) => void;
  /** D39: page ids a v2 snapshot answered with (HubSyncOptions.onAccountPages). */
  onAccountPages: (pages: ReadonlyArray<{ accountRef: string; hubAccountId: number }>) => void;
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
  /** settings.autoReadChats — decides how a thin frame's intent is proven. */
  autoReadEnabled?: () => boolean;
  /**
   * D39: one `GET /api/v1/events/v2/facts` page through the hub's SDK client
   * (the facts catch-up). Omitted = no catch-up (tests, hub not configured).
   */
  moneyFacts?: MoneyFactsFetch;
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

/**
 * D38 list-freshness state for the status bar and the inbox banner. SYNCING
 * lasts from the start of a verification epoch (session start, a stream
 * outage longer than 60 s, a replay gap) until Core's replay_completed marker
 * AND a page-1 verification (or its exhausted retries) of every account.
 */
export interface ListSyncSnapshot {
  syncing: boolean;
  /** Epoch ms the current SYNCING stretch began; null while not syncing. */
  syncingSinceMs: number | null;
  /** Start of the current verification epoch; null before the first one. */
  epochStartedAtMs: number | null;
  epochReason: ListVerificationReason | null;
}

export interface HubAwareSync extends SyncProvider {
  pollAccount(accountId: string): Promise<void>;
  refreshAccountHead(accountId: string): Promise<void>;
  /** Recreates the hub connection from current settings (key/URL changes). */
  reconfigureHub(): Promise<void>;
  /** D38: PollingSync reports every successful page-1 read here. */
  handleListRead(record: ListReadRecord): void;
  /** D38: PollingSync reports an exhausted verification here. */
  handleListVerificationFailed(accountId: string, reason: ListVerificationReason): void;
  /** D38: the OS resumed from sleep — one safety check. */
  noteSystemResume(): void;
  listSync(): ListSyncSnapshot;
  /** D38 diagnostics/tests: the intent worker. */
  syncIntents(): SyncIntentWorker;
  /** D39 diagnostics/tests: the money facts catch-up. */
  moneyFactsCatchUp(): MoneyFactsCatchUp;
  /** Hub status/liveness changes; payload is read through query:sync.status. */
  subscribeStatus(listener: () => void): () => void;
  hubStatus(): HubSyncStatus | null;
  hubMode(): HubMode;
  hubModeOverride(): HubModeOverrideSetting;
  hubActivity(): HubActivitySnapshot;
}

/**
 * D38 toast age gate, widened by D40: a hub frame whose fact is older than
 * this never alerts, whatever its provenance says. Redeliveries are excluded
 * by provenance, not by age: every redelivered receipt carries the provider's
 * header (production 2026-09-26: 14 of 14 in the manual redelivery), and
 * replay and the facts catch-up are silent anyway. What remains late but live
 * is OFAPI's own delay — incoming messages 3–10 min late in delay episodes,
 * and 4% of purchases / 7% of tips reaching Core after 9 min (D38's 9-min gate
 * muted those). Up to an hour late is still news to the chatter; anything
 * older is history. Measured on the hub's clock (see hubNowMs).
 */
export const NOTIFICATION_MAX_AGE_MS = 60 * 60_000;
/** Log once when the PC clock differs from the hub by more than this. */
const CLOCK_SKEW_WARN_MS = 60_000;
/** The hub's Date header truncates to whole seconds: +0.5 s on average. */
const DATE_HEADER_ROUNDING_MS = 500;
const CLOCK_SAMPLES = 5;
/** Samples within this of each other agree (Date is whole-second, RTT noise). */
const CLOCK_AGREEMENT_MS = 10_000;
/** A stream outage longer than this re-verifies every account's list. */
export const RECONNECT_VERIFY_AFTER_MS = 60_000;
/**
 * Re-verification is paid work started by a stream transition, so it is
 * bounded (incident 2026-07-15: a flapping stream must never scale reads):
 * at most one epoch per this window, i.e. ≤ 1 page-1 read per account per
 * 5 minutes however often the stream drops or Core answers 409.
 */
export const REVERIFY_MIN_INTERVAL_MS = 5 * 60_000;
/** Fail-open for a Core without the replay_completed marker (v1 fallback). */
const REPLAY_MARKER_FALLBACK_MS = 60_000;

/** Meta for callers without a transport: the v1 legacy treatment. */
const NO_FRAME_META: HubFrameMeta = {
  lane: 'durable',
  provenance: null,
  occurredAt: null,
  deliveredLive: true,
  hubAccountId: null,
  accountSeq: null,
  transactionRef: null,
  thread: null,
};

/**
 * D38 «live frame»: delivered after this connection's replay boundary AND
 * (v2) labelled `live` by Core. The ephemeral lane is live by construction;
 * v1 frames carry no provenance and keep their legacy treatment.
 */
export function isLiveFrame(meta: HubFrameMeta): boolean {
  if (meta.lane === 'ephemeral') {
    return true;
  }
  if (meta.provenance === null) {
    return meta.deliveredLive;
  }
  return meta.deliveredLive && meta.provenance === 'live';
}

interface VerificationEpoch {
  reason: ListVerificationReason;
  startedAtMs: number;
  replayCompleted: boolean;
  pending: Set<string>;
  verified: Set<string>;
  failed: Set<string>;
  completedAtMs: number | null;
}

export function createHubAwareSync(options: HubAwareSyncOptions): HubAwareSync {
  const { polling, data, createHub } = options;
  const now = options.now ?? Date.now;
  const onLog = options.onLog ?? (() => undefined);
  const modeOverride = options.hubModeOverride ?? (() => 'auto' as const);
  const autoReadEnabled = options.autoReadEnabled ?? ((): boolean => false);

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

  function recordDailyReceived(event: SyncEvent, live: boolean): void {
    eventStats = {
      ...eventStats,
      count: eventStats.count + 1,
      byType: bumpMap(eventStats.byType, event.type),
      // D38: «последний пуш» counts only live frames — a replayed backlog at
      // launch must not read as «ПУШ 0 с назад».
      ...(live ? { lastEventAt: now(), lastEventType: event.type } : {}),
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

  function recordHubEvent(event: SyncEvent, live: boolean): void {
    ensureStatsForToday();
    recordDailyReceived(event, live);
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

  // ── D38 hub clock ─────────────────────────────────────────────────────────
  // Frame timestamps (occurredAt, message createdAt) are upstream/hub time.
  // Comparing them with a skewed PC clock would silence every alert (PC fast)
  // or let stale facts ring (PC slow). The hub's Date header on every stream
  // (re)connect gives an offset; without a sample the local clock is used.
  const clockSamples: number[] = [];
  let hubClockOffsetMs = 0;
  let clockSkewWarned = false;

  function noteServerDate(serverDateMs: number, receivedAtLocalMs: number): void {
    const offset = serverDateMs + DATE_HEADER_ROUNDING_MS - receivedAtLocalMs;
    if (!Number.isFinite(offset)) {
      return;
    }
    clockSamples.push(offset);
    if (clockSamples.length > CLOCK_SAMPLES) {
      clockSamples.shift();
    }
    const sorted = [...clockSamples].sort((left, right) => left - right);
    const candidate = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const agreeing = clockSamples.filter(
      (sample) => Math.abs(sample - candidate) <= CLOCK_AGREEMENT_MS,
    ).length;
    // A skew beyond a minute changes which alerts ring: trust it only when two
    // samples agree, so one bogus Date header can neither mute nor admit.
    if (Math.abs(candidate) <= CLOCK_SKEW_WARN_MS || agreeing >= 2) {
      hubClockOffsetMs = candidate;
    }
    if (Math.abs(hubClockOffsetMs) > CLOCK_SKEW_WARN_MS && !clockSkewWarned) {
      clockSkewWarned = true;
      onLog('warn', 'local clock differs from the hub; alerts use the hub clock', {
        offsetMs: hubClockOffsetMs,
      });
    }
  }

  /** Now on the hub's clock (local clock plus the measured offset). */
  function hubNowMs(): number {
    return now() + hubClockOffsetMs;
  }

  // Attention gate (see docs/plans/2026-07-22-startup-notification-flood.md):
  // replay restores state; only messages arriving while this session watches
  // may toast/beep. Epoch fallback covers cores without the v2 marker.
  const NOTIFICATION_EPOCH_GRACE_MS = 60_000;
  const ALERTED_IDS_CAP = 500;
  /** Sleep detector: an interval tick that arrives this much later than its
   * schedule means the machine suspended (or the process froze) — the session
   * was NOT watching, so the gate re-arms and the wake backlog replays
   * silently, same as a cold start. Message arrival gaps are deliberately NOT
   * a signal: a quiet chat or an SSE outage with the app awake keeps the
   * marker's live mode, so the outage backlog still alerts (polling parity). */
  const SLEEP_TICK_MS = 30_000;
  const ATTENTION_REARM_GAP_MS = 5 * 60_000;
  /** Hub frames with NO resolvable timestamp (v1 id-only with auto-read off)
   * stay quiet only within this window after the epoch — a bounded replay
   * settle, not a session-long mute. Past it they alert: a fresh v1 id-only
   * message must not lose its notification just because it has no body. */
  const MISSING_TS_SETTLE_MS = 5 * 60_000;
  let notificationEpochMs = now();
  let sawReplayCompleted = false;
  let suppressionWarned = false;
  const alertedIds = new Set<string>();
  const alertedOrder: string[] = [];
  let lastSleepTickMs = now();
  let sleepDetector: ReturnType<typeof setInterval> | null = null;

  /** Called from the tick AND from every gate evaluation: on some platforms
   * suspended timers are not overdue at wake, and the SSE resume can deliver
   * its replay before the first post-resume tick — the gate itself must see
   * the wall-clock gap, not merely hope the interval fired first. */
  function maybeRearmAfterSuspend(): void {
    const nowMs = now();
    if (nowMs - lastSleepTickMs > SLEEP_TICK_MS + ATTENTION_REARM_GAP_MS) {
      sawReplayCompleted = false;
      notificationEpochMs = nowMs;
      suppressionWarned = false;
      onLog('info', 'attention gate re-armed after suspend', {
        gapMs: nowMs - lastSleepTickMs,
      });
      // D38: the same wake also owes one safety check of the focused list
      // (deferred: this can run inside a frame transaction).
      setTimeout(() => {
        if (running) {
          polling.noteSystemResume();
        }
      }, 0);
    }
    lastSleepTickMs = nowMs;
  }

  function markAlerted(key: string): void {
    alertedIds.add(key);
    alertedOrder.push(key);
    if (alertedOrder.length > ALERTED_IDS_CAP) {
      const evicted = alertedOrder.shift();
      if (evicted !== undefined) {
        alertedIds.delete(evicted);
      }
    }
  }

  /** D38: provenance and age gate for v2 durable frames (null = passes). */
  function frameAttentionVeto(meta: HubFrameMeta | undefined): string | null {
    if (meta === undefined || meta.lane !== 'durable' || meta.provenance === null) {
      return null; // v1 / polling / tests without a transport: legacy rules
    }
    if (meta.provenance !== 'live') {
      // redelivery / repair / unknown (a missing or unrecognised value).
      return `provenance-${meta.provenance}`;
    }
    const occurredMs = meta.occurredAt === null ? Number.NaN : Date.parse(meta.occurredAt);
    if (!Number.isFinite(occurredMs)) {
      return 'age-unknown';
    }
    if (hubNowMs() - occurredMs > NOTIFICATION_MAX_AGE_MS) {
      return 'too-old';
    }
    return null;
  }

  function attentionEligible(
    event: Extract<SyncEvent, { type: 'messageReceived' }>,
    source: 'hub' | 'polling',
    meta?: HubFrameMeta,
  ): boolean {
    maybeRearmAfterSuspend();
    const key = `${event.accountId}/${event.chatId}/${event.messageId}`;
    if (alertedIds.has(key)) {
      return false;
    }
    // D39: a tip MESSAGE never alerts or rings (owner decision) — the tip's
    // quiet alert comes from Core's tip.received fact. Polling events carry
    // no body; their row is already written, so it answers.
    const isTipMessage = event.message?.isTip
      ?? data.messages.get(event.accountId, event.chatId, event.messageId)?.isTip
      ?? false;
    if (isTipMessage) {
      onLog('debug', 'attention gate: a tip message is not an alert', {
        accountId: event.accountId,
        chatId: event.chatId,
        messageId: event.messageId,
      });
      return false;
    }
    const veto = source === 'hub' ? frameAttentionVeto(meta) : null;
    if (veto !== null) {
      onLog('debug', 'attention gate: frame not news', {
        veto,
        accountId: event.accountId,
        chatId: event.chatId,
        messageId: event.messageId,
      });
      return false;
    }
    let eligible: boolean;
    if (sawReplayCompleted && source === 'hub') {
      // The marker is an SSE-connection signal: it vouches only for frames
      // that arrived on that stream after its replay flushed. A slow poll
      // finishing after the marker may still carry pre-epoch backlog rows —
      // polling always answers to the timestamp gate below.
      eligible = true;
    } else {
      // Timestamp preference: enriched body, the v2 frame's journal time,
      // then the local row — id-only fallback frames and polling events are
      // both durably applied before they emit, so the row is authoritative.
      const ts = event.message?.createdAt
        ?? event.occurredAt
        ?? data.messages.get(event.accountId, event.chatId, event.messageId)?.createdAt;
      const ms = ts === undefined ? Number.NaN : Date.parse(ts);
      if (Number.isFinite(ms)) {
        // Upstream time → local time through the hub clock offset (D38).
        eligible = ms - hubClockOffsetMs >= notificationEpochMs - NOTIFICATION_EPOCH_GRACE_MS;
      } else if (source === 'polling') {
        // Polling only emits ids it just read back from the DB, so a missing
        // row means a synthetic caller — and its baseline sweep already
        // swallowed the cold-start backlog. Fail open.
        eligible = true;
      } else {
        // Hub frame with no resolvable time (v1 id-only, auto-read off —
        // refreshChat wrote no row). Quiet only through the bounded replay
        // settle window after the epoch; past it this is a live message that
        // simply has no body, and it must still alert.
        eligible = now() - notificationEpochMs > MISSING_TS_SETTLE_MS;
      }
      if (!eligible && !suppressionWarned) {
        // One warn per session: a clock skewed ahead of the epoch would mute
        // every alert until the marker deploys — make that state diagnosable.
        suppressionWarned = true;
        onLog('warn', 'attention gate suppressing pre-epoch frames (no marker yet)', {
          timestamp: ts ?? null,
          epochMs: notificationEpochMs,
        });
      }
    }
    if (eligible) {
      markAlerted(key);
    }
    return eligible;
  }

  function emitMessageEvent(
    event: Extract<SyncEvent, { type: 'messageReceived' | 'messageSent' }>,
    meta?: HubFrameMeta,
  ): void {
    if (event.type !== 'messageReceived') {
      emit(event);
      return;
    }
    emit(attentionEligible(event, 'hub', meta) ? event : { ...event, live: false });
  }

  function emitStatus(): void {
    for (const listener of statusListeners) {
      listener();
    }
  }

  // Polling shares the SAME gate and registry as the hub lane. Its baseline
  // sweep swallows the cold-start backlog, but after a suspend its auto-read
  // sweep re-emits the wake backlog as fresh-by-id rows — the epoch decides
  // those, and the registry stops a hub replay from re-alerting an id that
  // polling already alerted (and vice versa).
  polling.subscribe((event) => {
    if (event.type !== 'messageReceived') {
      emit(event);
      return;
    }
    emit(attentionEligible(event, 'polling') ? event : { ...event, live: false });
  });

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
    // A revoked account can no longer be verified: it must not pin SYNCING.
    if (epoch !== null) {
      for (const accountId of [...epoch.pending]) {
        if (!handledAccountIds.includes(accountId)) {
          epoch.pending.delete(accountId);
        }
      }
      maybeCompleteEpoch();
    }
    // Intents of a revoked account can never be satisfied here.
    intents.closeAccountsExcept(handledAccountIds);
    // D38: a replay gap (409) or grant rebaseline re-proves every list.
    reverifyLists('gap');
    // D39: the fresh cursor resumes past the gap; only the ledger read proves
    // the money facts inside it (free, never an alert).
    facts.request(handledAccountIds, 'gap');
    return handledAccountIds;
  }

  // ── D38 sync intents ─────────────────────────────────────────────────────
  const intents: SyncIntentWorker = createSyncIntentWorker({
    data,
    reads: {
      // Intent-driven list reads are body-free and lag-safe (a thin frame's
      // list can trail the frame), except for a deletion: only an
      // authoritative read can move a deleted head back to the survivor.
      accountHead: (accountId, readOptions) =>
        polling.readAccountHead(accountId, 'intent', {
          preserveLocalHead: !readOptions.authoritative,
          bodyDeltas: false,
          tombstonedHeadIds: readOptions.tombstonedHeadIds,
        }),
      chatTail: (accountId, chatId) => polling.readChatTailForIntent(accountId, chatId),
      autoReadEnabled,
      listHeadReached: (accountId, chatId, messageId) =>
        polling.listHeadReached(accountId, chatId, messageId),
    },
    accountReady: (accountId) => epoch?.pending.has(accountId) !== true,
    accountHandled: (accountId) => handledAccountIds.includes(accountId),
    clearTombstonedHeads: (accountId, messageIds) => {
      clearStillTombstonedCachedHeads(accountId, messageIds);
    },
    now,
    onLog,
  });

  // ── D39 purchases ─────────────────────────────────────────────────────────
  /** Diagnostic label of the next hub (re)configuration's catch-up. */
  let nextFactsReason: 'session-start' | 'reconfigure' = 'session-start';
  const facts: MoneyFactsCatchUp = createMoneyFactsCatchUp({
    data,
    fetchFacts: options.moneyFacts ?? null,
    accountHandled: (accountId) => handledAccountIds.includes(accountId),
    now,
    onLog,
  });

  /** A v2 snapshot's page ids (gap/grant recovery), before any frame. */
  function noteAccountPages(
    pages: ReadonlyArray<{ accountRef: string; hubAccountId: number }>,
  ): void {
    for (const page of pages) {
      try {
        if (facts.notePage(page.accountRef, page.hubAccountId)) {
          facts.request([page.accountRef], 'page-mapped');
        }
      } catch (error) {
        onLog('warn', 'money facts page mapping failed', {
          accountId: page.accountRef,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * The fan's label for a purchase alert, without awaiting a read: Core's
   * thread label, the local chat row, the local fans cache; a handle
   * (username) only when no display name exists anywhere.
   */
  function purchaseFanName(
    accountId: string,
    chatId: string,
    thread: HubFrameMeta['thread'],
  ): string | undefined {
    const chat = data.chats.get(accountId, chatId);
    const fan = data.fans.get(accountId, chatId);
    return [
      thread?.fanName,
      chat?.fanName,
      fan?.customName,
      fan?.name,
      thread?.username,
      fan?.username,
    ].find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim();
  }

  /**
   * D39 quiet purchase alert gate (null = alert). Only a v2 stream frame
   * labelled `live`, delivered after THIS connection's replay_completed and at
   * most NOTIFICATION_MAX_AGE_MS old on the hub clock is news; a PPV must also
   * be new to this device. Replay, repair, redelivery, unknown provenance, v1
   * and the facts catch-up (which never calls this) stay silent.
   */
  function purchaseAlertVeto(
    event: Extract<MoneyFactEvent, { type: 'ppvUnlocked' | 'tipReceived' }>,
    meta: HubFrameMeta,
    outcome: MoneyFactOutcome | 'error',
  ): string | null {
    if (meta.lane !== 'durable' || meta.provenance === null) {
      return 'not-v2-stream';
    }
    if (!meta.deliveredLive) {
      return 'replay';
    }
    const frameVeto = frameAttentionVeto(meta);
    if (frameVeto !== null) {
      return frameVeto;
    }
    if (outcome !== 'error' && outcome.kind === 'ppv' && outcome.recorded && !outcome.newFact) {
      return 'known-fact';
    }
    const key = event.type === 'ppvUnlocked' && event.messageId !== undefined
      ? `ppv/${event.accountId}/${event.messageId}`
      : `${event.type}/${event.accountId}/${meta.hubAccountId ?? '?'}:${meta.accountSeq ?? '?'}`;
    if (alertedIds.has(key)) {
      return 'already-alerted';
    }
    markAlerted(key);
    return null;
  }

  /** D44: the purchase-alert rules for a new subscriber (null = rings). */
  function subscriberAlertVeto(
    event: Extract<SyncEvent, { type: 'subscriberStarted' }>,
    meta: HubFrameMeta,
  ): string | null {
    if (meta.lane !== 'durable' || meta.provenance === null) {
      return 'not-v2-stream';
    }
    if (!meta.deliveredLive) {
      return 'replay';
    }
    const frameVeto = frameAttentionVeto(meta);
    if (frameVeto !== null) {
      return frameVeto;
    }
    const key = `subscriber/${event.accountId}/${meta.hubAccountId ?? '?'}:${meta.accountSeq ?? '?'}`;
    if (alertedIds.has(key)) {
      return 'already-alerted';
    }
    markAlerted(key);
    return null;
  }

  /**
   * Acceptance (D39): one line per money fact applied from the stream. Joins
   * Core's `v2 money frame written` log and `domain_events` on
   * (hubAccountId, accountSeq); `appliedAt` is on the hub's clock, so
   * «hub receipt → local apply» = appliedAt − the webhook's received_at.
   */
  function logMoneyFactApplied(
    event: MoneyFactEvent,
    meta: HubFrameMeta,
    outcome: MoneyFactOutcome | 'error',
    alertVeto: string | null,
  ): void {
    const appliedAtHubMs = hubNowMs();
    const occurredMs = meta.occurredAt === null ? Number.NaN : Date.parse(meta.occurredAt);
    onLog('info', 'purchase applied', {
      type: event.type,
      accountId: event.accountId,
      hubAccountId: meta.hubAccountId,
      accountSeq: meta.accountSeq,
      ...(event.type === 'transactionPosted'
        ? { fanId: event.fanId, transactionId: event.transactionId }
        : { chatId: event.chatId, messageId: event.messageId ?? null }),
      amountUsd: event.amountUsd ?? null,
      provenance: meta.provenance,
      replay: !meta.deliveredLive,
      outcome: outcome === 'error' ? 'error' : outcome,
      alert: event.type === 'transactionPosted' ? false : alertVeto === null,
      alertVeto,
      occurredAt: meta.occurredAt,
      appliedAt: new Date(appliedAtHubMs).toISOString(),
      sinceOccurredMs: Number.isFinite(occurredMs) ? appliedAtHubMs - occurredMs : null,
    });
  }

  /**
   * «List not older than T» for a frame. A replayed frame describes the past,
   * so a read that started after the fact proves it (the startup page-1 read
   * usually does). A live frame is dated by its local receipt, which is also
   * safe against a skewed local clock.
   */
  function frameNotBeforeMs(meta: HubFrameMeta): number {
    const receivedMs = now();
    if (!meta.deliveredLive && meta.occurredAt !== null) {
      const occurredMs = Date.parse(meta.occurredAt);
      if (Number.isFinite(occurredMs)) {
        // Hub time → local time: list reads are stamped with the local clock.
        return Math.min(occurredMs - hubClockOffsetMs, receivedMs);
      }
    }
    return receivedMs;
  }

  /**
   * D38: the first message of a chat that is not in the local list yet
   * arrives before the owed list read creates the row, so a notification
   * could only say «Новое сообщение». Without awaiting the network: take the
   * fan's name from the local fans cache, else mark the chat as new.
   */
  function withNewChatHint(
    event: Extract<SyncEvent, { type: 'messageReceived' }>,
  ): Extract<SyncEvent, { type: 'messageReceived' }> {
    if (data.chats.get(event.accountId, event.chatId) !== null) {
      return event;
    }
    const fan = data.fans.get(event.accountId, event.chatId);
    const name = [fan?.customName, fan?.name, fan?.username].find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    );
    return name !== undefined ? { ...event, fanName: name } : { ...event, newChat: true };
  }

  /**
   * D38: applies one hub event SYNCHRONOUSLY inside HubSync's frame
   * transaction (local state + sync intents + the v2 cursor commit together)
   * and never awaits the network. Whatever read the frame still owes becomes a
   * durable sync intent; the returned effect runs after the commit.
   */
  function handleHubEvent(event: SyncEvent, meta: HubFrameMeta = NO_FRAME_META): HubEventCommit {
    recordHubEvent(event, isLiveFrame(meta));
    const effects: Array<() => void> = [];
    let kickIntents = false;
    if (meta.lane === 'durable' && meta.hubAccountId !== null) {
      // D39: every durable frame names its account's Core page id — the key
      // of the facts catch-up. A first sight owes the account its history.
      let pageDue: boolean;
      try {
        pageDue = facts.notePage(event.accountId, meta.hubAccountId);
      } catch {
        pageDue = false; // bookkeeping must never reject the frame
      }
      if (pageDue) {
        effects.push(() => facts.request([event.accountId], 'page-mapped'));
      }
    }
    switch (event.type) {
      case 'messageReceived':
      case 'messageSent': {
        let appliedLocally = false;
        if (event.message && event.message.id === event.messageId) {
          let outcome: HubMessageApplyOutcome | 'error';
          try {
            outcome = polling.applyHubMessage(event.accountId, event.chatId, event.message);
          } catch {
            outcome = 'error';
          }
          if (outcome === 'applied' || outcome === 'tombstoned' || outcome === 'chat-missing') {
            // M arrived: any thin-frame obligation for it is met.
            intents.closeChatMessage(event.accountId, event.chatId, event.messageId, 'message-arrived');
            if (outcome === 'chat-missing') {
              // The row is stored but the chat is unknown here: a list read owes it.
              intents.openAccountList(event.accountId, frameNotBeforeMs(meta), 'unknown-chat');
              kickIntents = true;
            }
            onLog('debug', 'hub enriched message applied', {
              type: event.type,
              accountId: event.accountId,
              chatId: event.chatId,
              messageId: event.messageId,
            });
            appliedLocally = true;
          } else {
            recordFallback(
              outcome === 'error' ? 'hub-ingest-error-fallback' : 'hub-malformed-message-fallback',
              event.type,
              {
                type: event.type,
                accountId: event.accountId,
                chatId: event.chatId,
                messageId: event.messageId,
              },
            );
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
        if (!appliedLocally) {
          // Thin frame (D13): the fallback read is a durable obligation in the
          // same transaction as the cursor — never awaited here.
          kickIntents =
            intents.openChatMessage(
              event.accountId,
              event.chatId,
              event.messageId,
              frameNotBeforeMs(meta),
              'thin-frame',
            ) || kickIntents;
        }
        const announced = event.type === 'messageReceived' ? withNewChatHint(event) : event;
        effects.push(() => emitMessageEvent(announced, meta));
        recordApplied(event.type);
        break;
      }
      case 'ppvUnlocked':
      case 'tipReceived':
      case 'transactionPosted': {
        // D39: money facts apply locally, synchronously, in the frame's
        // transaction — no paid chat read any more. Like every notification-
        // shaped event they are ADVISORY toward the stream cursor and must
        // never reject: a deterministically failing frame replays forever
        // (incident 2026-07-15). A failed apply is logged; the facts catch-up
        // re-applies it from the ledger.
        let outcome: MoneyFactOutcome | 'error';
        try {
          outcome = applyMoneyFact(
            data,
            event,
            {
              hubAccountId: meta.hubAccountId,
              accountSeq: meta.accountSeq,
              provenance: meta.provenance ?? 'unknown',
              occurredAt: meta.occurredAt,
              source: 'stream',
            },
            now(),
          );
        } catch (error) {
          outcome = 'error';
          recordFallback('hub-money-fact-error', event.type, {
            type: event.type,
            accountId: event.accountId,
            accountSeq: meta.accountSeq,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        if (event.type === 'transactionPosted') {
          // State only (the chat list's spend figure follows via db:changed);
          // a tip or purchase alert comes from its own fact, never from here.
          logMoneyFactApplied(event, meta, outcome, 'transaction');
          recordApplied(event.type);
          break;
        }
        const veto = purchaseAlertVeto(event, meta, outcome);
        logMoneyFactApplied(event, meta, outcome, veto);
        const fanName = veto === null
          ? purchaseFanName(event.accountId, event.chatId, meta.thread)
          : undefined;
        const announced: MoneyFactEvent = {
          ...event,
          ...(fanName !== undefined ? { fanName } : {}),
          live: veto === null,
        };
        effects.push(() => emit(announced));
        recordApplied(event.type);
        break;
      }
      case 'messageDeleted': {
        const chatId = event.chatId ?? lookupChatId(event.accountId, event.messageId);
        // An authoritative page-1 read owes the survivor head; a cached head
        // that still shows the deleted message afterwards is cleared.
        intents.openDeleteHead(event.accountId, event.messageId, frameNotBeforeMs(meta));
        kickIntents = true;
        if (chatId === null) {
          recordFallback('unknown-delete-head-refresh', event.type, {
            accountId: event.accountId,
            messageId: event.messageId,
          });
          break; // unknown message: nothing to tombstone, no re-emit
        }
        // Tombstone (deleted=1) publishes bus scope 'messages' for the chat.
        data.messages.markDeleted(event.accountId, chatId, [event.messageId]);
        intents.closeChatMessage(event.accountId, chatId, event.messageId, 'message-deleted');
        effects.push(() => emit({ ...event, chatId }));
        recordApplied(event.type);
        break;
      }
      case 'subscriberStarted': {
        // D44: the same list nudge as before (a new subscriber is a new chat
        // row), plus an alert on main's explicit yes.
        intents.openAccountList(event.accountId, frameNotBeforeMs(meta), 'list-nudge');
        kickIntents = true;
        const veto = subscriberAlertVeto(event, meta);
        onLog('debug', 'subscriber started', {
          accountId: event.accountId,
          accountSeq: meta.accountSeq,
          veto,
        });
        const announced = { ...event, live: veto === null };
        effects.push(() => emit(announced));
        recordApplied(event.type);
        break;
      }
      case 'chatListUpdated':
        // This event is a nudge, not a replacement chat snapshot. In
        // particular, subscription events are projected to chatListUpdated
        // while the read gateway may still advertise the previous message
        // head. The owed list read is lag-safe (keeps a newer local head).
        intents.openAccountList(event.accountId, frameNotBeforeMs(meta), 'list-nudge');
        kickIntents = true;
        recordApplied(event.type);
        break;
      default:
        effects.push(() => emit(event)); // typing/presence/accountAuthChanged/…
        recordApplied(event.type);
    }
    return () => {
      for (const effect of effects) {
        effect();
      }
      if (kickIntents) {
        intents.kick();
      }
    };
  }

  // ── D38 list verification epochs (SYNCING) ───────────────────────────────
  let epoch: VerificationEpoch | null = null;
  /** When the stream last stopped being live (null while live / never live). */
  let notLiveSinceMs: number | null = null;
  let replayFallbackTimer: ReturnType<typeof setTimeout> | null = null;

  function clearReplayFallback(): void {
    if (replayFallbackTimer !== null) {
      clearTimeout(replayFallbackTimer);
      replayFallbackTimer = null;
    }
  }

  function armReplayFallback(): void {
    clearReplayFallback();
    const current = epoch;
    if (current === null || current.replayCompleted || !hubLive) {
      return;
    }
    replayFallbackTimer = setTimeout(() => {
      replayFallbackTimer = null;
      if (epoch !== current || current.replayCompleted || !hubLive) {
        return;
      }
      onLog('warn', 'replay marker missing; treating the stream as caught up', {
        reason: current.reason,
        liveForMs: REPLAY_MARKER_FALLBACK_MS,
      });
      current.replayCompleted = true;
      maybeCompleteEpoch();
    }, REPLAY_MARKER_FALLBACK_MS);
  }

  function beginEpoch(reason: ListVerificationReason, accountIds: readonly string[]): void {
    epoch = {
      reason,
      startedAtMs: now(),
      replayCompleted: false,
      pending: new Set(accountIds),
      verified: new Set(),
      failed: new Set(),
      completedAtMs: null,
    };
    onLog('info', 'list sync started', { reason, accounts: accountIds.length });
    armReplayFallback();
    emitStatus();
  }

  function maybeCompleteEpoch(): void {
    const current = epoch;
    if (current === null || current.completedAtMs !== null) {
      return;
    }
    if (!current.replayCompleted || current.pending.size > 0) {
      return;
    }
    current.completedAtMs = now();
    clearReplayFallback();
    // Acceptance: how long SYNCING lasted, and what it proved.
    onLog('info', 'list sync complete', {
      reason: current.reason,
      ms: current.completedAtMs - current.startedAtMs,
      verified: current.verified.size,
      failed: [...current.failed],
    });
    intents.kick();
    emitStatus();
  }

  function hubSyncApplies(): boolean {
    return hub !== null && modeOverride() !== 'polling';
  }

  function listSyncSnapshot(): ListSyncSnapshot {
    const current = epoch;
    const syncing = hubSyncApplies() && current !== null && current.completedAtMs === null;
    return {
      syncing,
      syncingSinceMs: syncing ? current.startedAtMs : null,
      epochStartedAtMs: current?.startedAtMs ?? null,
      epochReason: current?.reason ?? null,
    };
  }

  function handleCaughtUp(summary?: HubReplaySummary): void {
    sawReplayCompleted = true;
    if (summary !== undefined) {
      // Acceptance: the replay should carry only the OnlyFans pages.
      onLog('info', 'hub replay completed', { ...summary });
    }
    if (epoch !== null && !epoch.replayCompleted) {
      epoch.replayCompleted = true;
      maybeCompleteEpoch();
    }
  }

  function handleListRead(record: ListReadRecord): void {
    const current = epoch;
    if (
      current !== null
      && current.pending.has(record.accountId)
      && record.startedAtMs >= current.startedAtMs
    ) {
      current.pending.delete(record.accountId);
      current.verified.add(record.accountId);
      maybeCompleteEpoch();
    }
    intents.noteListRead(record.accountId, record.startedAtMs);
    emitStatus();
  }

  function handleListVerificationFailed(accountId: string): void {
    const current = epoch;
    if (current !== null && current.pending.delete(accountId)) {
      current.failed.add(accountId);
      maybeCompleteEpoch();
    }
    intents.kick();
    emitStatus();
  }

  /** A stream outage > 60 s or a replay gap: the list must be re-proven. */
  function reverifyLists(reason: ListVerificationReason): void {
    if (!running) {
      return;
    }
    if (epoch !== null && now() - epoch.startedAtMs < REVERIFY_MIN_INTERVAL_MS) {
      // The replayed stream still carries every event of the gap; the list
      // was proven less than 5 minutes ago. Coalesce instead of paying again.
      onLog('info', 'list re-verification coalesced', {
        reason,
        sinceLastEpochMs: now() - epoch.startedAtMs,
      });
      return;
    }
    beginEpoch(reason, handledAccountIds);
    polling.verifyAccounts(handledAccountIds, reason);
  }

  function handleHubStatus(status: HubSyncStatus): void {
    const isLive = status === 'live';
    const override = modeOverride();
    statusChangedAtMs = now();
    liveSinceMs = isLive ? (liveSinceMs ?? now()) : null;
    if (isLive && !hubLive) {
      // D38: only an outage longer than 60 s re-verifies the list (the
      // planned 15-min reconnect never leaves 'live'); a recovery epoch that
      // already began during the outage covers it.
      const outageMs = notLiveSinceMs === null ? null : now() - notLiveSinceMs;
      const coveredByEpoch = epoch !== null
        && notLiveSinceMs !== null
        && epoch.startedAtMs >= notLiveSinceMs;
      notLiveSinceMs = null;
      // Bounded paid work on a transition (see REVERIFY_MIN_INTERVAL_MS).
      if (outageMs !== null && outageMs > RECONNECT_VERIFY_AFTER_MS && !coveredByEpoch) {
        onLog('info', 'stream back after an outage; re-verifying lists', { outageMs });
        reverifyLists('reconnect');
      }
    } else if (!isLive && hubLive) {
      notLiveSinceMs = now();
    }
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
        onCaughtUp: handleCaughtUp,
        onStatusChange: (status) => {
          handleHubStatus(status);
          if (status === 'live') {
            armReplayFallback();
          }
        },
        onSnapshot: applyHubSnapshot,
        onSnapshotRequired: (input) => {
          recordFallback('hub-replay-gap-snapshot', 'syncSnapshotRequired', input);
          reverifyLists('gap');
          facts.request(handledAccountIds, 'gap');
        },
        onV2GapRecovered: handleV2GapRecovered,
        onServerDate: noteServerDate,
        onAccountPages: noteAccountPages,
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
    // D39: the facts catch-up from each account's watermark — the whole
    // history the first time. Every (re)configuration: a new credential
    // starts its stream without a cursor, which skips history.
    facts.request(handledAccountIds, nextFactsReason);
    nextFactsReason = 'reconfigure';
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
      // Timer lives strictly between start and stop: a candidate runtime
      // that never commits (activation failure) must not leak a ticking
      // interval pinning its whole graph, and stop→start must restore
      // suspend detection.
      if (sleepDetector === null) {
        lastSleepTickMs = now();
        sleepDetector = setInterval(maybeRearmAfterSuspend, SLEEP_TICK_MS);
      }
      handledAccountIds = [...accountIds];
      // D38: the session starts SYNCING; polling.start runs each account's
      // verification (page 1 first) in parallel with the hub replay.
      notLiveSinceMs = null;
      beginEpoch('session-start', handledAccountIds);
      // An intent persisted by an earlier session for an account this runtime
      // no longer handles would otherwise stay open forever.
      intents.closeAccountsExcept(handledAccountIds);
      intents.start();
      facts.start();
      nextFactsReason = 'session-start';
      polling.start(accountIds);
      void startHub();
    },
    async stop() {
      running = false;
      if (sleepDetector !== null) {
        clearInterval(sleepDetector);
        sleepDetector = null;
      }
      clearReplayFallback();
      intents.stop();
      facts.stop();
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
    handleListRead,
    handleListVerificationFailed,
    noteSystemResume() {
      onLog('info', 'system resumed; one safety check');
      polling.noteSystemResume();
    },
    listSync: listSyncSnapshot,
    syncIntents: () => intents,
    moneyFactsCatchUp: () => facts,
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
