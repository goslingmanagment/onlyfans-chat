// UsageEventStore seam over the real usage_events table (in-memory SQLite):
// insertion order, upsert-by-id, attempts persistence, quarantine flag inside
// the payload JSON surviving reload, and interop with the rows the AI
// coordinator parks (raw payload encoding) — including the shared reporter's
// crash-recovery behaviors running over this store.

import { describe, expect, it, vi, afterEach } from 'vitest';
import { createUsageReporter, HubError, hubUsageEventSchema } from '@chatgoose/shared/hub/index';
import type { HubUsageEvent, PendingUsageEvent } from '@chatgoose/shared/hub/index';
import { createSqliteUsageEventStore, summarizeUsageSpool } from '@main/hub/usage-store';
import { mapUsagePayloadToHubEvent } from '@main/hub/usage-mapper';
import type { MappedHubUsageEvent } from '@main/hub/usage-mapper';
import {
  insertCoordinatorRow,
  memoryDataLayer,
  rawCoordinatorPayload,
  usageEventRowCount,
} from './helpers';

// MappedHubUsageEvent: optional fields present-or-absent (no nulls) — the
// narrow shape both PendingUsageEvent.event and reporter.enqueue accept under
// exactOptionalPropertyTypes.
function wireEvent(id: string, overrides: Partial<MappedHubUsageEvent> = {}): MappedHubUsageEvent {
  return {
    clientEventId: id,
    feature: 'fast-reply',
    model: 'anthropic:claude-sonnet-4-6',
    inputTokens: 10,
    outputTokens: 5,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    isCacheHit: false,
    isRegeneration: false,
    completedAt: '2026-06-11T12:00:00.000Z',
    ...overrides,
  };
}

function pendingOf(id: string, overrides: Partial<PendingUsageEvent> = {}): PendingUsageEvent {
  return { id, event: wireEvent(id), attempts: 0, quarantined: false, ...overrides };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createSqliteUsageEventStore', () => {
  it('save→load round-trips in insertion order and upserts by id', () => {
    const data = memoryDataLayer();
    const store = createSqliteUsageEventStore(data.db);
    store.save([pendingOf('a'), pendingOf('b'), pendingOf('c')]);
    // Upsert: same id again must replace, not duplicate, and keep its slot.
    store.save([pendingOf('a', { attempts: 2 })]);

    const loaded = store.load();
    expect(loaded.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(loaded[0]?.attempts).toBe(2);
    expect(loaded[0]?.event).toEqual(wireEvent('a'));
    expect(usageEventRowCount(data)).toBe(3);
  });

  it('incrementAttempts and markQuarantined persist across reload', () => {
    const data = memoryDataLayer();
    const store = createSqliteUsageEventStore(data.db);
    store.save([pendingOf('a'), pendingOf('b')]);
    store.incrementAttempts(['a']);
    store.incrementAttempts(['a']);
    store.markQuarantined(['b']);

    // Fresh store instance over the same db = restart.
    const reloaded = createSqliteUsageEventStore(data.db).load();
    expect(reloaded.find((p) => p.id === 'a')?.attempts).toBe(2);
    expect(reloaded.find((p) => p.id === 'a')?.quarantined).toBe(false);
    expect(reloaded.find((p) => p.id === 'b')?.quarantined).toBe(true);
    // The quarantined row's event still parses clean (flag stripped).
    const b = reloaded.find((p) => p.id === 'b');
    expect(hubUsageEventSchema.safeParse(b?.event).success).toBe(true);
  });

  // B2: "export diagnostics first" must preserve the WHOLE spool — pending
  // and dead-letter rows included, not just the quarantined slice.
  it('summarizeUsageSpool reports every undelivered row with its state', () => {
    const data = memoryDataLayer();
    const store = createSqliteUsageEventStore(data.db);
    store.save([
      pendingOf('hot'),
      pendingOf('parked', { attempts: 3 }),
      pendingOf('poisoned'),
    ]);
    store.markQuarantined(['poisoned']);

    const rows = data.db
      .prepare('SELECT client_event_id AS id, payload, attempts FROM usage_events ORDER BY rowid ASC')
      .all() as Array<{ id?: unknown; payload?: unknown; attempts?: unknown }>;
    const spool = summarizeUsageSpool(rows);

    expect(spool.counts).toEqual({ pending: 1, deadLetter: 1, quarantined: 1, invalid: 0 });
    expect(spool.events.map((event) => [event.id, event.state])).toEqual([
      ['hot', 'pending'],
      ['parked', 'deadLetter'],
      ['poisoned', 'quarantined'],
    ]);
    // Payloads ride along — nothing exports as a bare count.
    for (const event of spool.events) {
      expect(event.payload).toMatchObject({ clientEventId: event.id });
    }
  });

  it('preserves malformed and invalid-shape rows as raw purge-insurance facts', () => {
    const rows = [
      { id: 'broken-json', payload: '{"clientEventId":', attempts: 1 },
      { id: 'primitive-json', payload: '42', attempts: 2 },
      { id: 'array-json', payload: '[]', attempts: 2 },
      { id: 'broken-storage-shape', payload: null, attempts: 3 },
    ];

    const spool = summarizeUsageSpool(rows);

    expect(spool.counts).toEqual({ pending: 0, deadLetter: 0, quarantined: 0, invalid: 4 });
    expect(spool.events).toEqual([
      {
        id: 'broken-json',
        attempts: 1,
        state: 'invalid',
        payload: '{"clientEventId":',
        invalidReason: 'malformed-json',
      },
      {
        id: 'primitive-json',
        attempts: 2,
        state: 'invalid',
        payload: '42',
        invalidReason: 'non-object-json',
      },
      {
        id: 'array-json',
        attempts: 2,
        state: 'invalid',
        payload: '[]',
        invalidReason: 'non-object-json',
      },
      {
        id: 'broken-storage-shape',
        attempts: 3,
        state: 'invalid',
        payload: null,
        invalidReason: 'non-string-payload',
      },
    ]);
  });

  it('loads coordinator-parked raw rows mapped to the wire shape', () => {
    const data = memoryDataLayer();
    insertCoordinatorRow(data, rawCoordinatorPayload({ clientEventId: 'op-raw' }));
    const loaded = createSqliteUsageEventStore(data.db).load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.id).toBe('op-raw');
    expect(loaded[0]?.event).toEqual(
      mapUsagePayloadToHubEvent(rawCoordinatorPayload({ clientEventId: 'op-raw' })),
    );
    expect(loaded[0]?.quarantined).toBe(false);
  });

  it('acceptance metadata json_set by cmd:ai.feedback never enters the wire event', () => {
    const data = memoryDataLayer();
    insertCoordinatorRow(data, rawCoordinatorPayload({ clientEventId: 'op-fb' }));
    data.db
      .prepare(
        "UPDATE usage_events SET payload = json_set(payload, '$.accepted', 1, '$.acceptedPart', 2) " +
          'WHERE client_event_id = @id',
      )
      .run({ id: 'op-fb' });
    const loaded = createSqliteUsageEventStore(data.db).load();
    const keys = Object.keys(loaded[0]?.event ?? {});
    expect(keys).not.toContain('accepted');
    expect(keys).not.toContain('acceptedPart');
    expect(hubUsageEventSchema.safeParse(loaded[0]?.event).success).toBe(true);
  });

  it('surfaces malformed rows so the reporter deletes them at load', () => {
    const data = memoryDataLayer();
    insertCoordinatorRow(data, { clientEventId: 'op-bad', nonsense: true, completedAt: 'x' });
    const store = createSqliteUsageEventStore(data.db);
    const loaded = store.load();
    expect(loaded).toHaveLength(1);
    expect(hubUsageEventSchema.safeParse(loaded[0]?.event).success).toBe(false);

    // The shared reporter's documented job: invalid persisted rows are removed.
    const reporter = createUsageReporter({
      client: { postUsageBatch: vi.fn(), getServerTimeOffsetMs: () => null },
      store,
    });
    expect(usageEventRowCount(data)).toBe(0);
    reporter.dispose();
  });
});

describe('reporter over the sqlite store (integration)', () => {
  it('HTTP-400 quarantine survives a reload and is never resent', async () => {
    const data = memoryDataLayer();
    const store = createSqliteUsageEventStore(data.db);
    const postUsageBatch = vi
      .fn()
      .mockRejectedValue(new HubError('bad-request', { message: 'core 400' }));
    const reporter = createUsageReporter({
      client: { postUsageBatch, getServerTimeOffsetMs: () => null },
      store,
    });
    reporter.enqueue(wireEvent('q-1'));
    await reporter.flushNow();
    expect(reporter.getQuarantined().map((p) => p.id)).toEqual(['q-1']);
    reporter.dispose();

    // Restart: the quarantined row is restored as quarantined, not pending.
    const postAfterRestart = vi.fn();
    const restarted = createUsageReporter({
      client: { postUsageBatch: postAfterRestart, getServerTimeOffsetMs: () => null },
      store: createSqliteUsageEventStore(data.db),
    });
    expect(restarted.getPendingCount()).toBe(0);
    expect(restarted.getQuarantined().map((p) => p.id)).toEqual(['q-1']);
    await restarted.flushNow();
    expect(postAfterRestart).not.toHaveBeenCalled();
    expect(usageEventRowCount(data)).toBe(1); // kept for inspection, never resent
    restarted.dispose();
  });

  it('attempts persist across restarts and the row survives the 3rd failure in the dead-letter tier (Stage 4)', async () => {
    const data = memoryDataLayer();
    const failing = {
      postUsageBatch: vi.fn().mockRejectedValue(new HubError('http', { message: '503' })),
      getServerTimeOffsetMs: () => null,
    };
    const first = createUsageReporter({ client: failing, store: createSqliteUsageEventStore(data.db) });
    first.enqueue(wireEvent('d-1'));
    await first.flushNow(); // attempt 1
    first.dispose();
    expect(createSqliteUsageEventStore(data.db).load()[0]?.attempts).toBe(1);

    const second = createUsageReporter({ client: failing, store: createSqliteUsageEventStore(data.db) });
    expect(second.getPendingCount()).toBe(1);
    await second.flushNow(); // attempt 2
    await second.flushNow(); // attempt 3 → dead-letter, NEVER deleted
    expect(second.getPendingCount()).toBe(1);
    expect(second.getDeadLetterCount()).toBe(1);
    expect(usageEventRowCount(data)).toBe(1);
    expect(createSqliteUsageEventStore(data.db).load()[0]?.attempts).toBe(3);
    second.dispose();

    // A restart puts the dead-letter row back into the hot queue; a working
    // hub then drains it exactly once.
    const recovered = {
      postUsageBatch: vi.fn().mockResolvedValue({
        receivedCount: 1,
        insertedCount: 1,
        invalidCount: 0,
        dedupedCount: 0,
      }),
      getServerTimeOffsetMs: () => null,
    };
    const third = createUsageReporter({ client: recovered, store: createSqliteUsageEventStore(data.db) });
    expect(third.getPendingCount()).toBe(1);
    await third.flushNow();
    expect(recovered.postUsageBatch).toHaveBeenCalledTimes(1);
    expect(third.getPendingCount()).toBe(0);
    expect(usageEventRowCount(data)).toBe(0);
    third.dispose();
  });

  it('a successful flush posts mapped coordinator rows and clears the table', async () => {
    const data = memoryDataLayer();
    insertCoordinatorRow(data, rawCoordinatorPayload({ clientEventId: 'op-ok' }));
    const batches: HubUsageEvent[][] = [];
    const reporter = createUsageReporter({
      client: {
        postUsageBatch: vi.fn(({ events }: { events: HubUsageEvent[] }) => {
          batches.push(events);
          return Promise.resolve({
            receivedCount: events.length,
            insertedCount: events.length,
            invalidCount: 0,
            dedupedCount: 0,
          });
        }),
        getServerTimeOffsetMs: () => null,
      },
      store: createSqliteUsageEventStore(data.db),
    });
    await reporter.flushNow();
    expect(batches).toHaveLength(1);
    expect(batches[0]?.[0]?.clientEventId).toBe('op-ok');
    expect(batches[0]?.[0]?.cacheWriteTokens).toBe(300); // mapped field name
    expect(usageEventRowCount(data)).toBe(0);
    reporter.dispose();
  });
});
