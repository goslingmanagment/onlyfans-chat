// AI usage reporter — SPEC §8.6, legacy behavioral spec (research §7.4) plus
// the desktop additions: persisted queue (crash-safe via an injected store
// seam), HTTP-400 quarantine (never blind-retry; CG-HUB-02), and completedAt
// clamped to server time so core's >5-min-future rejection cannot trigger.
// Legacy-tuned constants kept: 1 s debounce, 100/batch. The legacy
// drop-after-3-failures rule is RETIRED (kernel Stage 4 stop-loss): usage
// events are business facts and a failed flush never deletes them. After the
// 3rd failed attempt an event moves to the dead-letter tier — retried only on
// app start and on an hourly sweep, so a poisoned event cannot busy-loop the
// hot queue, but it is never removed. Removal happens only for 2xx-confirmed
// events with invalidCount 0 (a 200 that reports per-item invalids keeps the
// batch queued for one resend, then quarantines it). Rows that fail the wire
// contract at load are retained as local evidence and parked in memory rather
// than sent. Core dedupes upstream by (userId, clientEventId) —
// the reporter does no local dedupe, and longer retry horizons (or whole-batch
// resends) therefore cannot double-count spend.

import type { CgErrorDetail } from '../errors/index';
import { CgError } from '../errors/index';
import type { HubClient, HubUsageEvent, HubUsageFeature } from './client';
import { HUB_USAGE_BATCH_MAX_EVENTS, HubError, hubUsageEventSchema } from './client';

// ─── Legacy constants (normative; research §7.4) ──────────────────────────

export const HUB_USAGE_REPORT_DEBOUNCE_MS = 1_000;
/** Failed attempts after which an event parks in the dead-letter tier (never deleted). */
export const HUB_USAGE_DEAD_LETTER_AFTER_ATTEMPTS = 3;
/** Capped backoff; the last value repeats for every later attempt. */
export const HUB_USAGE_REPORT_RETRY_DELAYS_MS = [
  5_000,
  15_000,
  60_000,
  300_000,
  900_000,
  3_600_000,
] as const;
/** Dead-letter events re-enter the queue on app start and on this sweep interval. */
export const HUB_USAGE_DEAD_LETTER_SWEEP_MS = 3_600_000;
/**
 * Consecutive 200-with-invalidCount flushes tolerated before the batch parks
 * in quarantine. The first invalid response also teaches the client the
 * server-time offset, so the resend goes out with completedAt clamped — one
 * retry is enough to repair clock skew; anything still invalid after that is
 * unparseable server-side and resending cannot fix it.
 */
export const HUB_USAGE_INVALID_RESEND_LIMIT = 2;

// ─── Store seam (desktop main wires this to the usage_events table) ───────

export interface PendingUsageEvent {
  /** Store key; equals event.clientEventId. */
  id: string;
  /** Wire-ready event: feature already mapped to core's enum. completedAt is clamped at flush time, not here. */
  event: HubUsageEvent;
  /** Failed flush attempts so far; persisted so the dead-letter tier survives restarts. */
  attempts: number;
  /** Rejected by core with HTTP 400 (or failed contract validation); never resent. */
  quarantined: boolean;
}

/**
 * Persistence seam. Synchronous by design (the desktop backs it with
 * better-sqlite3). `save` should upsert by id; `load` must return rows in
 * insertion order.
 */
export interface UsageEventStore {
  load(): PendingUsageEvent[];
  save(events: readonly PendingUsageEvent[]): void;
  remove(ids: readonly string[]): void;
  incrementAttempts(ids: readonly string[]): void;
  markQuarantined(ids: readonly string[]): void;
}

// ─── Reporter input ────────────────────────────────────────────────────────

/**
 * Features the desktop reports. 'compare' is not in core's closed enum: it is
 * mapped to 'fast-reply' at enqueue (PLAN P4 decision — Compare orchestrates
 * fast-reply per personality card, so each card reports as 'fast-reply').
 */
export type ReportableFeature = HubUsageFeature | 'compare';

export interface UsageReporterEventInput {
  clientEventId: string;
  feature: ReportableFeature;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  conversationId?: string;
  durationMs?: number;
  isCacheHit?: boolean;
  isRegeneration?: boolean;
  /** ISO 8601 instant; clamped to server time at flush when the offset is known. */
  completedAt: string;
}

// ─── Reporter ──────────────────────────────────────────────────────────────

export interface UsageReporterErrorContext {
  /** 'quarantined' = HTTP 400 path; 'rejected' = failed validation at enqueue. Failed flushes never drop events (Stage 4). */
  kind: 'quarantined' | 'rejected';
  clientEventIds: string[];
}

export interface UsageReporterOptions {
  client: Pick<HubClient, 'postUsageBatch' | 'getServerTimeOffsetMs'>;
  store: UsageEventStore;
  now?: () => number;
  /** Timer seams; default to global setTimeout/clearTimeout. */
  setTimeoutImpl?: (callback: () => void, ms: number) => unknown;
  clearTimeoutImpl?: (handle: unknown) => void;
  onError?: (error: CgError, context: UsageReporterErrorContext) => void;
}

export interface UsageReporter {
  /** Fire-and-forget: invalid events surface via onError ('rejected') instead of throwing. */
  enqueue(event: UsageReporterEventInput): void;
  /** Cancels any pending timer and flushes immediately (shutdown path). No-op while a flush is running. */
  flushNow(): Promise<void>;
  /** Undelivered events: hot queue plus the dead-letter tier. */
  getPendingCount(): number;
  /** Events parked after HUB_USAGE_DEAD_LETTER_AFTER_ATTEMPTS failures; retried on start + hourly. */
  getDeadLetterCount(): number;
  getQuarantined(): readonly PendingUsageEvent[];
  /** Stops new work and waits for the current store-owning flush continuation. */
  quiesce(): Promise<void>;
  /** Cancels timers; queued events stay persisted for the next session. */
  dispose(): void;
}

interface TimerGlobals {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const timerGlobals = globalThis as unknown as TimerGlobals;

function toCgError(error: unknown): CgError {
  if (error instanceof CgError) {
    return error;
  }
  const detail: CgErrorDetail = {
    providerMessage: error instanceof Error ? error.message : String(error),
  };
  return new HubError('http', { detail });
}

function isQuarantineFailure(error: unknown): boolean {
  return error instanceof HubError && error.reason === 'bad-request';
}

export function createUsageReporter(options: UsageReporterOptions): UsageReporter {
  const { client, store, onError } = options;
  const now = options.now ?? (() => Date.now());
  const setTimeoutImpl = options.setTimeoutImpl ?? ((callback, ms) => timerGlobals.setTimeout(callback, ms));
  const clearTimeoutImpl = options.clearTimeoutImpl ?? ((handle) => timerGlobals.clearTimeout(handle));

  const queue: PendingUsageEvent[] = [];
  const deadLetter: PendingUsageEvent[] = [];
  const quarantined: PendingUsageEvent[] = [];
  let timer: unknown = null;
  let sweepTimer: unknown = null;
  let flushing = false;
  let flushPromise: Promise<void> | null = null;
  let disposed = false;
  /** Consecutive 200s reporting invalidCount > 0 (see HUB_USAGE_INVALID_RESEND_LIMIT). */
  let consecutiveInvalidFlushes = 0;

  // Crash recovery: restore the persisted queue. Rows that no longer satisfy
  // the wire contract (schema drift across app versions) must not enter a
  // batch, but they are business-fact evidence and therefore must not be
  // deleted. Park a quarantined view in memory while leaving the raw store row
  // untouched for diagnostics and a future repair/migration.
  for (const pending of store.load()) {
    if (!hubUsageEventSchema.safeParse(pending.event).success) {
      quarantined.push({ ...pending, quarantined: true });
      continue;
    }
    if (pending.quarantined) {
      quarantined.push(pending);
    } else {
      queue.push(pending);
    }
  }

  function schedule(delayMs: number): void {
    // Legacy semantics: coalesce — an already-armed timer (or running flush,
    // which reschedules in its finally) wins; enqueues never reset it.
    if (timer !== null || flushing || disposed) {
      return;
    }
    timer = setTimeoutImpl(() => {
      timer = null;
      void flush();
    }, delayMs);
  }

  // Dead-letter tier (Stage 4): events past the attempt threshold leave the
  // hot loop but are never deleted — they re-enter the queue on the hourly
  // sweep (and on app start, because load() puts every non-quarantined row
  // back into the hot queue).
  function scheduleDeadLetterSweep(): void {
    if (sweepTimer !== null || disposed || deadLetter.length === 0) {
      return;
    }
    sweepTimer = setTimeoutImpl(() => {
      sweepTimer = null;
      if (disposed || deadLetter.length === 0) {
        return;
      }
      queue.push(...deadLetter.splice(0));
      schedule(HUB_USAGE_REPORT_DEBOUNCE_MS);
    }, HUB_USAGE_DEAD_LETTER_SWEEP_MS);
  }

  /** completedAt may not lie in core's future (>5 min ahead 400s the batch — SPEC §8.6). */
  function clampCompletedAt(event: HubUsageEvent): HubUsageEvent {
    const offset = client.getServerTimeOffsetMs();
    if (offset === null) {
      return event;
    }
    const serverNowMs = now() + offset;
    const completedAtMs = Date.parse(event.completedAt);
    if (!Number.isFinite(completedAtMs) || completedAtMs <= serverNowMs) {
      return event;
    }
    return { ...event, completedAt: new Date(serverNowMs).toISOString() };
  }

  async function performFlush(): Promise<void> {
    flushing = true;
    let retryDelayMs: number | null = null;

    try {
      while (queue.length > 0) {
        if (disposed) {
          break;
        }
        const batch = queue.slice(0, HUB_USAGE_BATCH_MAX_EVENTS);
        const ids = batch.map((pending) => pending.id);

        try {
          const result = await client.postUsageBatch({
            events: batch.map((pending) => clampCompletedAt(pending.event)),
          });
          if (result.invalidCount > 0) {
            // 200-with-invalid: core burned invalidCount events per-item (bad
            // completedAt — SPEC §8.6) without identifying which. Deleting the
            // batch would destroy the only copy of those facts. This response
            // also recorded the server-time offset, so one resend goes out
            // clamped; core's (userId, clientEventId) dedupe makes re-posting
            // the accepted rows free.
            consecutiveInvalidFlushes += 1;
            if (consecutiveInvalidFlushes < HUB_USAGE_INVALID_RESEND_LIMIT) {
              retryDelayMs = HUB_USAGE_REPORT_DEBOUNCE_MS;
              break;
            }
            // The clamped resend still reported invalids (unparseable
            // completedAt): park the batch like an HTTP 400 — never delete.
            consecutiveInvalidFlushes = 0;
            queue.splice(0, batch.length);
            for (const pending of batch) {
              pending.quarantined = true;
            }
            quarantined.push(...batch);
            store.markQuarantined(ids);
            onError?.(
              new HubError('bad-request', {
                message: `usage batch kept ${String(result.invalidCount)} invalid event(s) after a clamped resend`,
              }),
              { kind: 'quarantined', clientEventIds: ids },
            );
            continue;
          }
          consecutiveInvalidFlushes = 0;
          queue.splice(0, batch.length);
          store.remove(ids);
        } catch (error) {
          if (isQuarantineFailure(error)) {
            // HTTP 400: deterministic rejection — never blind-retry (SPEC §8.6).
            // Later chunks may be fine, so keep draining the queue.
            queue.splice(0, batch.length);
            for (const pending of batch) {
              pending.quarantined = true;
            }
            quarantined.push(...batch);
            store.markQuarantined(ids);
            onError?.(toCgError(error), { kind: 'quarantined', clientEventIds: ids });
            continue;
          }

          // Network / timeout / 5xx / auth: capped backoff, never delete
          // (Stage 4 stop-loss). Attempts persist; past the threshold the
          // event parks in the dead-letter tier for the start/hourly retries.
          store.incrementAttempts(ids);
          queue.splice(0, batch.length);
          const requeued: PendingUsageEvent[] = [];
          for (const pending of batch) {
            pending.attempts += 1;
            if (pending.attempts >= HUB_USAGE_DEAD_LETTER_AFTER_ATTEMPTS) {
              deadLetter.push(pending);
            } else {
              requeued.push(pending);
            }
          }
          if (requeued.length > 0) {
            queue.unshift(...requeued);
            const highestAttempt = Math.max(...requeued.map((pending) => pending.attempts));
            const delayIndex = Math.min(highestAttempt - 1, HUB_USAGE_REPORT_RETRY_DELAYS_MS.length - 1);
            retryDelayMs = HUB_USAGE_REPORT_RETRY_DELAYS_MS[delayIndex] ?? HUB_USAGE_REPORT_DEBOUNCE_MS;
          }
          break;
        }
      }
    } finally {
      flushing = false;
      if (queue.length > 0) {
        schedule(retryDelayMs ?? HUB_USAGE_REPORT_DEBOUNCE_MS);
      }
      scheduleDeadLetterSweep();
    }
  }

  function flush(): Promise<void> {
    if (flushPromise !== null) {
      return flushPromise;
    }
    const tracked = performFlush().finally(() => {
      if (flushPromise === tracked) {
        flushPromise = null;
      }
    });
    flushPromise = tracked;
    return tracked;
  }

  function disposeReporter(): void {
    disposed = true;
    if (timer !== null) {
      clearTimeoutImpl(timer);
      timer = null;
    }
    if (sweepTimer !== null) {
      clearTimeoutImpl(sweepTimer);
      sweepTimer = null;
    }
  }

  // Persisted backlog from a previous session flushes on the normal debounce.
  if (queue.length > 0) {
    schedule(HUB_USAGE_REPORT_DEBOUNCE_MS);
  }

  return {
    enqueue(input) {
      if (disposed) {
        return;
      }
      const { feature, conversationId, durationMs, isCacheHit, isRegeneration, ...rest } = input;
      const candidate = {
        ...rest,
        // 'compare' has no core enum entry; report per-card as 'fast-reply' (PLAN P4).
        feature: feature === 'compare' ? 'fast-reply' : feature,
        ...(conversationId !== undefined ? { conversationId } : {}),
        ...(durationMs !== undefined ? { durationMs } : {}),
        isCacheHit: isCacheHit ?? false,
        isRegeneration: isRegeneration ?? false,
      };
      const parsed = hubUsageEventSchema.safeParse(candidate);
      if (!parsed.success) {
        // Telemetry must not break the operation pipeline: report and drop.
        onError?.(
          new HubError('bad-request', {
            message: 'usage event failed contract validation',
            detail: { providerMessage: parsed.error.message.slice(0, 400) },
          }),
          { kind: 'rejected', clientEventIds: [input.clientEventId] },
        );
        return;
      }
      const pending: PendingUsageEvent = {
        id: parsed.data.clientEventId,
        event: parsed.data,
        attempts: 0,
        quarantined: false,
      };
      queue.push(pending);
      store.save([pending]);
      schedule(HUB_USAGE_REPORT_DEBOUNCE_MS);
    },

    async flushNow() {
      if (timer !== null) {
        clearTimeoutImpl(timer);
        timer = null;
      }
      await flush();
    },

    getPendingCount() {
      return queue.length + deadLetter.length;
    },

    getDeadLetterCount() {
      return deadLetter.length;
    },

    getQuarantined() {
      return quarantined;
    },

    async quiesce() {
      disposeReporter();
      await flushPromise;
    },

    dispose() {
      disposeReporter();
    },
  };
}
