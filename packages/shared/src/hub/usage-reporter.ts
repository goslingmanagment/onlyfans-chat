// AI usage reporter — SPEC §8.6, legacy behavioral spec (research §7.4) plus
// the desktop additions: persisted queue (crash-safe via an injected store
// seam), HTTP-400 quarantine (never blind-retry; CG-HUB-02), and completedAt
// clamped to server time so core's >5-min-future rejection cannot trigger.
// Legacy-tuned constants are normative: 1 s debounce, 100/batch, retry 5 s /
// 15 s, drop after the 3rd failed attempt. Core dedupes upstream by
// (userId, clientEventId) — the reporter does no local dedupe.

import type { CgErrorDetail } from '../errors/index';
import { CgError } from '../errors/index';
import type { HubClient, HubUsageEvent, HubUsageFeature } from './client';
import { HUB_USAGE_BATCH_MAX_EVENTS, HubError, hubUsageEventSchema } from './client';

// ─── Legacy constants (normative; research §7.4) ──────────────────────────

export const HUB_USAGE_REPORT_DEBOUNCE_MS = 1_000;
export const HUB_USAGE_REPORT_MAX_ATTEMPTS = 3;
export const HUB_USAGE_REPORT_RETRY_DELAYS_MS = [5_000, 15_000] as const;

// ─── Store seam (desktop main wires this to the usage_events table) ───────

export interface PendingUsageEvent {
  /** Store key; equals event.clientEventId. */
  id: string;
  /** Wire-ready event: feature already mapped to core's enum. completedAt is clamped at flush time, not here. */
  event: HubUsageEvent;
  /** Failed flush attempts so far; persisted so the drop-after-3 rule survives restarts. */
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
  /** 'quarantined' = HTTP 400 path; 'dropped' = 3rd failed attempt; 'rejected' = failed validation at enqueue. */
  kind: 'quarantined' | 'dropped' | 'rejected';
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
  getPendingCount(): number;
  getQuarantined(): readonly PendingUsageEvent[];
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
  const quarantined: PendingUsageEvent[] = [];
  let timer: unknown = null;
  let flushing = false;
  let disposed = false;

  // Crash recovery: restore the persisted queue. Rows that no longer satisfy
  // the wire contract (schema drift across app versions) are deleted — they
  // would 400 the batch forever.
  const invalidIds: string[] = [];
  for (const pending of store.load()) {
    if (!hubUsageEventSchema.safeParse(pending.event).success) {
      invalidIds.push(pending.id);
      continue;
    }
    if (pending.quarantined) {
      quarantined.push(pending);
    } else {
      queue.push(pending);
    }
  }
  if (invalidIds.length > 0) {
    store.remove(invalidIds);
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

  async function flush(): Promise<void> {
    if (flushing) {
      return;
    }
    flushing = true;
    let retryDelayMs: number | null = null;

    try {
      while (queue.length > 0) {
        const batch = queue.slice(0, HUB_USAGE_BATCH_MAX_EVENTS);
        const ids = batch.map((pending) => pending.id);

        try {
          await client.postUsageBatch({ events: batch.map((pending) => clampCompletedAt(pending.event)) });
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

          // Network / timeout / 5xx / auth: retry 5 s then 15 s, drop after
          // the 3rd failed attempt (legacy rule; attempts persisted).
          store.incrementAttempts(ids);
          queue.splice(0, batch.length);
          const requeued: PendingUsageEvent[] = [];
          const droppedIds: string[] = [];
          for (const pending of batch) {
            pending.attempts += 1;
            if (pending.attempts >= HUB_USAGE_REPORT_MAX_ATTEMPTS) {
              droppedIds.push(pending.id);
            } else {
              requeued.push(pending);
            }
          }
          if (droppedIds.length > 0) {
            store.remove(droppedIds);
            onError?.(toCgError(error), { kind: 'dropped', clientEventIds: droppedIds });
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
      return queue.length;
    },

    getQuarantined() {
      return quarantined;
    },

    dispose() {
      disposed = true;
      if (timer !== null) {
        clearTimeoutImpl(timer);
        timer = null;
      }
    },
  };
}
