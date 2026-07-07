import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HubError, type HubUsageBatchResult, type HubUsageEvent } from '../src/hub/client';
import {
  createUsageReporter,
  HUB_USAGE_DEAD_LETTER_SWEEP_MS,
  HUB_USAGE_REPORT_DEBOUNCE_MS,
  type PendingUsageEvent,
  type UsageEventStore,
  type UsageReporterErrorContext,
  type UsageReporterEventInput,
} from '../src/hub/usage-reporter';
import type { CgError } from '../src/errors/index';

const BASE_TIME = new Date('2026-06-11T12:00:00.000Z');

function makeEvent(id: string, overrides: Partial<UsageReporterEventInput> = {}): UsageReporterEventInput {
  return {
    clientEventId: id,
    feature: 'fast-reply',
    model: 'claude-sonnet-4-5',
    inputTokens: 1000,
    outputTokens: 50,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    completedAt: BASE_TIME.toISOString(),
    ...overrides,
  };
}

interface StoreCalls {
  save: string[][];
  remove: string[][];
  incrementAttempts: string[][];
  markQuarantined: string[][];
}

function memoryStore(initial: PendingUsageEvent[] = []) {
  const rows = new Map<string, PendingUsageEvent>(
    initial.map((row) => [row.id, { ...row, event: { ...row.event } }]),
  );
  const calls: StoreCalls = { save: [], remove: [], incrementAttempts: [], markQuarantined: [] };
  const store: UsageEventStore = {
    load: () => [...rows.values()],
    save: (events) => {
      calls.save.push(events.map((event) => event.id));
      for (const event of events) {
        rows.set(event.id, { ...event, event: { ...event.event } });
      }
    },
    remove: (ids) => {
      calls.remove.push([...ids]);
      for (const id of ids) {
        rows.delete(id);
      }
    },
    incrementAttempts: (ids) => {
      calls.incrementAttempts.push([...ids]);
      for (const id of ids) {
        const row = rows.get(id);
        if (row) {
          row.attempts += 1;
        }
      }
    },
    markQuarantined: (ids) => {
      calls.markQuarantined.push([...ids]);
      for (const id of ids) {
        const row = rows.get(id);
        if (row) {
          row.quarantined = true;
        }
      }
    },
  };
  return { store, rows, calls };
}

type BatchOutcome = 'ok' | 'invalid' | Error;

function stubHubClient(options: { offset?: number | null; outcomes?: BatchOutcome[] } = {}) {
  const batches: HubUsageEvent[][] = [];
  const outcomes = [...(options.outcomes ?? [])];
  return {
    batches,
    client: {
      postUsageBatch: ({ events }: { events: HubUsageEvent[] }): Promise<HubUsageBatchResult> => {
        batches.push(events);
        const next = outcomes.shift() ?? 'ok';
        if (next instanceof Error) {
          return Promise.reject(next);
        }
        // 'invalid': a 200 where core burned one event per-item (bad
        // completedAt) without identifying which — counts only.
        const invalidCount = next === 'invalid' ? 1 : 0;
        return Promise.resolve({
          receivedCount: events.length,
          insertedCount: events.length - invalidCount,
          invalidCount,
          dedupedCount: 0,
        });
      },
      getServerTimeOffsetMs: () => options.offset ?? null,
    },
  };
}

function errorCollector() {
  const errors: Array<{ error: CgError; context: UsageReporterErrorContext }> = [];
  return {
    errors,
    onError: (error: CgError, context: UsageReporterErrorContext) => {
      errors.push({ error, context });
    },
  };
}

const networkError = () => new HubError('network', { message: 'fetch failed' });
const badRequestError = () => new HubError('bad-request', { detail: { status: 400 } });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(BASE_TIME);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createUsageReporter', () => {
  it('coalesces enqueues into one batch 1 s after the first event (legacy debounce)', async () => {
    const { store, calls } = memoryStore();
    const { client, batches } = stubHubClient();
    const reporter = createUsageReporter({ client, store });

    reporter.enqueue(makeEvent('a'));
    await vi.advanceTimersByTimeAsync(300);
    reporter.enqueue(makeEvent('b'));
    await vi.advanceTimersByTimeAsync(699);
    expect(batches).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(batches).toHaveLength(1);
    expect(batches[0]?.map((event) => event.clientEventId)).toEqual(['a', 'b']);
    expect(calls.save).toEqual([['a'], ['b']]);
    expect(calls.remove).toEqual([['a', 'b']]);
    expect(reporter.getPendingCount()).toBe(0);
  });

  it('chunks the queue into batches of at most 100', async () => {
    const { store } = memoryStore();
    const { client, batches } = stubHubClient();
    const reporter = createUsageReporter({ client, store });

    for (let index = 0; index < 150; index += 1) {
      reporter.enqueue(makeEvent(`e-${index}`));
    }
    await vi.advanceTimersByTimeAsync(HUB_USAGE_REPORT_DEBOUNCE_MS);

    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(100);
    expect(batches[1]).toHaveLength(50);
    expect(reporter.getPendingCount()).toBe(0);
  });

  it('retries after 5 s then 15 s, then parks in the dead-letter tier without ever deleting (Stage 4)', async () => {
    const { store, calls, rows } = memoryStore();
    const { client, batches } = stubHubClient({ outcomes: [networkError(), networkError(), networkError()] });
    const { errors, onError } = errorCollector();
    const reporter = createUsageReporter({ client, store, onError });

    reporter.enqueue(makeEvent('a'));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(batches).toHaveLength(1);
    expect(calls.incrementAttempts).toEqual([['a']]);
    expect(rows.get('a')?.attempts).toBe(1);

    // First retry waits the full 5 s.
    await vi.advanceTimersByTimeAsync(4_999);
    expect(batches).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(batches).toHaveLength(2);
    expect(calls.incrementAttempts).toEqual([['a'], ['a']]);

    // Second retry waits 15 s; its failure is the 3rd attempt → dead-letter,
    // never removal: the event stays persisted with attempts=3.
    await vi.advanceTimersByTimeAsync(14_999);
    expect(batches).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(batches).toHaveLength(3);
    expect(calls.remove).toEqual([]);
    expect(rows.get('a')?.attempts).toBe(3);
    expect(reporter.getPendingCount()).toBe(1);
    expect(reporter.getDeadLetterCount()).toBe(1);
    expect(errors).toHaveLength(0);

    // The hot loop stays quiet until the hourly sweep — a poisoned event
    // cannot busy-loop the queue.
    await vi.advanceTimersByTimeAsync(HUB_USAGE_DEAD_LETTER_SWEEP_MS - 60_000);
    expect(batches).toHaveLength(3);
  });

  it('retries dead-letter events on the hourly sweep and drains them exactly once on success', async () => {
    const { store, calls, rows } = memoryStore();
    const { client, batches } = stubHubClient({ outcomes: [networkError(), networkError(), networkError()] });
    const reporter = createUsageReporter({ client, store });

    reporter.enqueue(makeEvent('a'));
    // 3 failures: t=1s, +5s, +15s → dead-letter.
    await vi.advanceTimersByTimeAsync(21_000);
    expect(batches).toHaveLength(3);
    expect(reporter.getDeadLetterCount()).toBe(1);

    // The hourly sweep requeues; the next outcome is 'ok' → delivered and
    // removed exactly once.
    await vi.advanceTimersByTimeAsync(HUB_USAGE_DEAD_LETTER_SWEEP_MS + HUB_USAGE_REPORT_DEBOUNCE_MS);
    expect(batches).toHaveLength(4);
    expect(calls.remove).toEqual([['a']]);
    expect(rows.has('a')).toBe(false);
    expect(reporter.getPendingCount()).toBe(0);
    expect(reporter.getDeadLetterCount()).toBe(0);

    // Nothing left: no further batches on later sweeps.
    await vi.advanceTimersByTimeAsync(2 * HUB_USAGE_DEAD_LETTER_SWEEP_MS);
    expect(batches).toHaveLength(4);
  });

  it('survives 10 consecutive failures and still delivers exactly once', async () => {
    const { store, calls, rows } = memoryStore();
    const outcomes: BatchOutcome[] = Array.from({ length: 10 }, () => networkError());
    const { client, batches } = stubHubClient({ outcomes });
    const reporter = createUsageReporter({ client, store });

    reporter.enqueue(makeEvent('a'));
    // Hot loop: attempts 1-3 (1 s, +5 s, +15 s), then hourly sweeps for the rest.
    await vi.advanceTimersByTimeAsync(21_000);
    expect(batches).toHaveLength(3);
    for (let sweep = 0; sweep < 8; sweep += 1) {
      await vi.advanceTimersByTimeAsync(HUB_USAGE_DEAD_LETTER_SWEEP_MS + HUB_USAGE_REPORT_DEBOUNCE_MS);
    }

    // 10 failures + 1 success = 11 batch calls; drained exactly once.
    expect(batches).toHaveLength(11);
    expect(calls.remove).toEqual([['a']]);
    expect(rows.has('a')).toBe(false);
    expect(reporter.getPendingCount()).toBe(0);
  });

  it('quarantines on HTTP 400 without retrying and surfaces CG-HUB-02', async () => {
    const { store, calls, rows } = memoryStore();
    const { client, batches } = stubHubClient({ outcomes: [badRequestError()] });
    const { errors, onError } = errorCollector();
    const reporter = createUsageReporter({ client, store, onError });

    reporter.enqueue(makeEvent('a'));
    reporter.enqueue(makeEvent('b'));
    await vi.advanceTimersByTimeAsync(1_000);

    expect(batches).toHaveLength(1);
    expect(reporter.getPendingCount()).toBe(0);
    expect(reporter.getQuarantined().map((pending) => pending.id)).toEqual(['a', 'b']);
    expect(calls.markQuarantined).toEqual([['a', 'b']]);
    expect(rows.get('a')?.quarantined).toBe(true);
    expect(calls.incrementAttempts).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.error.code).toBe('CG-HUB-02');
    expect(errors[0]?.context).toEqual({ kind: 'quarantined', clientEventIds: ['a', 'b'] });

    // Never blind-retried.
    await vi.advanceTimersByTimeAsync(600_000);
    expect(batches).toHaveLength(1);
  });

  // A 200 with invalidCount > 0 means core silently burned events it never
  // identified — deleting the whole batch locally would destroy the only copy
  // of business facts (SPEC §8.6 per-item skip).
  it('keeps the batch when a 200 reports invalidCount > 0 and removes it only after a clean resend', async () => {
    const { store, calls } = memoryStore();
    const { client, batches } = stubHubClient({ outcomes: ['invalid', 'ok'] });
    const { errors, onError } = errorCollector();
    const reporter = createUsageReporter({ client, store, onError });

    reporter.enqueue(makeEvent('a'));
    reporter.enqueue(makeEvent('b'));
    await vi.advanceTimersByTimeAsync(1_000);

    // Invalid response: nothing deleted, nothing quarantined — the batch
    // stays queued for one resend (core dedupes by clientEventId, and this
    // response taught us the server-time offset for the clamp).
    expect(batches).toHaveLength(1);
    expect(calls.remove).toEqual([]);
    expect(calls.markQuarantined).toEqual([]);
    expect(reporter.getPendingCount()).toBe(2);

    // Clean resend: the same two events go out again and are removed.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(batches).toHaveLength(2);
    expect(batches[1]?.map((event) => event.clientEventId)).toEqual(['a', 'b']);
    expect(calls.remove).toEqual([['a', 'b']]);
    expect(reporter.getPendingCount()).toBe(0);
    expect(errors).toHaveLength(0);
  });

  it('quarantines the batch when invalidCount persists across the resend limit', async () => {
    const { store, calls, rows } = memoryStore();
    const { client, batches } = stubHubClient({ outcomes: ['invalid', 'invalid'] });
    const { errors, onError } = errorCollector();
    const reporter = createUsageReporter({ client, store, onError });

    reporter.enqueue(makeEvent('a'));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(batches).toHaveLength(1);
    expect(reporter.getPendingCount()).toBe(1);

    // Second invalid response in a row: the offset was known and the clamp
    // still could not repair it — park in quarantine, never delete.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(batches).toHaveLength(2);
    expect(calls.remove).toEqual([]);
    expect(calls.markQuarantined).toEqual([['a']]);
    expect(rows.get('a')?.quarantined).toBe(true);
    expect(reporter.getPendingCount()).toBe(0);
    expect(reporter.getQuarantined().map((pending) => pending.id)).toEqual(['a']);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.error.code).toBe('CG-HUB-02');
    expect(errors[0]?.context).toEqual({ kind: 'quarantined', clientEventIds: ['a'] });

    // Parked for good — no further resends.
    await vi.advanceTimersByTimeAsync(600_000);
    expect(batches).toHaveLength(2);
  });

  it('clamps completedAt to server time when the local clock runs ahead', async () => {
    const { store } = memoryStore();
    // Server is 10 minutes behind the local clock (local +10 min skew).
    const { client, batches } = stubHubClient({ offset: -600_000 });
    const reporter = createUsageReporter({ client, store });

    reporter.enqueue(makeEvent('skewed', { completedAt: BASE_TIME.toISOString() }));
    await vi.advanceTimersByTimeAsync(1_000);

    const expectedServerNow = new Date(BASE_TIME.getTime() + 1_000 - 600_000).toISOString();
    expect(batches[0]?.[0]?.completedAt).toBe(expectedServerNow);
  });

  it('leaves past completedAt values untouched and skips clamping with no offset', async () => {
    const past = new Date(BASE_TIME.getTime() - 3_600_000).toISOString();

    const skewed = stubHubClient({ offset: -600_000 });
    const skewedReporter = createUsageReporter({ client: skewed.client, store: memoryStore().store });
    skewedReporter.enqueue(makeEvent('past', { completedAt: past }));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(skewed.batches[0]?.[0]?.completedAt).toBe(past);

    const offsetless = stubHubClient({ offset: null });
    const offsetlessReporter = createUsageReporter({ client: offsetless.client, store: memoryStore().store });
    const future = new Date(BASE_TIME.getTime() + 3_600_000).toISOString();
    offsetlessReporter.enqueue(makeEvent('future', { completedAt: future }));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(offsetless.batches[0]?.[0]?.completedAt).toBe(future);
  });

  it("maps 'compare' to 'fast-reply' (PLAN P4: per-card reporting)", async () => {
    const { store } = memoryStore();
    const { client, batches } = stubHubClient();
    const reporter = createUsageReporter({ client, store });

    reporter.enqueue(makeEvent('card-1', { feature: 'compare' }));
    await vi.advanceTimersByTimeAsync(1_000);

    expect(batches[0]?.[0]?.feature).toBe('fast-reply');
  });

  it('defaults isCacheHit/isRegeneration to false on the wire', async () => {
    const { store } = memoryStore();
    const { client, batches } = stubHubClient();
    const reporter = createUsageReporter({ client, store });

    reporter.enqueue(makeEvent('a'));
    await vi.advanceTimersByTimeAsync(1_000);

    expect(batches[0]?.[0]?.isCacheHit).toBe(false);
    expect(batches[0]?.[0]?.isRegeneration).toBe(false);
  });

  it('rejects an invalid event at enqueue instead of poisoning the queue', async () => {
    const { store, calls } = memoryStore();
    const { client, batches } = stubHubClient();
    const { errors, onError } = errorCollector();
    const reporter = createUsageReporter({ client, store, onError });

    reporter.enqueue(makeEvent('bad', { inputTokens: -1 }));

    expect(reporter.getPendingCount()).toBe(0);
    expect(calls.save).toEqual([]);
    expect(errors[0]?.context).toEqual({ kind: 'rejected', clientEventIds: ['bad'] });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(batches).toHaveLength(0);
  });

  it('does nothing on flushNow with an empty queue', async () => {
    const { store } = memoryStore();
    const { client, batches } = stubHubClient();
    const reporter = createUsageReporter({ client, store });

    await reporter.flushNow();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(batches).toHaveLength(0);
  });

  it('restores the persisted queue on startup: pending flush, quarantined stay parked, invalid rows deleted', async () => {
    const wireEvent: HubUsageEvent = {
      clientEventId: 'restored',
      feature: 'ping',
      model: 'claude-haiku-4',
      inputTokens: 10,
      outputTokens: 5,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      isCacheHit: false,
      isRegeneration: false,
      completedAt: BASE_TIME.toISOString(),
    };
    const { store, calls } = memoryStore([
      { id: 'restored', event: wireEvent, attempts: 1, quarantined: false },
      { id: 'parked', event: { ...wireEvent, clientEventId: 'parked' }, attempts: 0, quarantined: true },
      {
        id: 'corrupt',
        event: { ...wireEvent, clientEventId: 'corrupt', model: '' },
        attempts: 0,
        quarantined: false,
      },
    ]);
    const { client, batches } = stubHubClient();
    const reporter = createUsageReporter({ client, store });

    expect(calls.remove).toEqual([['corrupt']]);
    expect(reporter.getPendingCount()).toBe(1);
    expect(reporter.getQuarantined().map((pending) => pending.id)).toEqual(['parked']);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(batches).toHaveLength(1);
    expect(batches[0]?.map((event) => event.clientEventId)).toEqual(['restored']);
  });

  it('keeps a scheduled retry timer when new events arrive and flushes them together', async () => {
    const { store } = memoryStore();
    const { client, batches } = stubHubClient({ outcomes: [networkError()] });
    const reporter = createUsageReporter({ client, store });

    reporter.enqueue(makeEvent('a'));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(batches).toHaveLength(1);

    // Arrives during the 5 s retry wait; must not reset or shorten it.
    reporter.enqueue(makeEvent('b'));
    await vi.advanceTimersByTimeAsync(4_999);
    expect(batches).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(batches).toHaveLength(2);
    expect(batches[1]?.map((event) => event.clientEventId)).toEqual(['a', 'b']);
  });

  it('stops timers on dispose but keeps events persisted', async () => {
    const { store, rows } = memoryStore();
    const { client, batches } = stubHubClient();
    const reporter = createUsageReporter({ client, store });

    reporter.enqueue(makeEvent('a'));
    reporter.dispose();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(batches).toHaveLength(0);
    expect(rows.has('a')).toBe(true);
  });
});
