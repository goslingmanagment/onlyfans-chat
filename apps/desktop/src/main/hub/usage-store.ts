// UsageEventStore seam (packages/shared/src/hub/usage-reporter.ts) over the
// usage_events table (SPEC §10): synchronous better-sqlite3 calls, save
// upserts by client_event_id, load returns rowid (insertion) order. The
// quarantine flag lives INSIDE the payload JSON — no schema migration;
// attempts is a real column (the coordinator inserts rows with attempts 0).
//
// Two payload encodings coexist in the column:
//   1. raw coordinator payloads (recordUsageEvent) — mapped to the wire shape
//      at load through usage-mapper;
//   2. store-encoded rows (this module's save): the wire event itself plus
//      `quarantined`. Acceptance metadata (accepted/acceptedPart, json_set by
//      cmd:ai.feedback) rides in the same JSON and is stripped from the wire
//      event on load — local-only, never sent upstream.

import { z } from 'zod';
import { HUB_USAGE_DEAD_LETTER_AFTER_ATTEMPTS, hubUsageEventSchema } from '@chatgoose/shared/hub/index';
import type { HubUsageEvent, PendingUsageEvent, UsageEventStore } from '@chatgoose/shared/hub/index';
import type { ChatGooseDb } from '../db/index';
import { mapUsagePayloadToHubEvent } from './usage-mapper';

const rowSchema = z.object({
  id: z.string(),
  payload: z.string(),
  attempts: z.number().int().min(0),
});

function decodeEvent(json: unknown): HubUsageEvent {
  // Store encoding first (wire field names) — parsing strips quarantined and
  // any acceptance metadata from the event.
  const wire = hubUsageEventSchema.safeParse(json);
  if (wire.success) {
    return wire.data;
  }
  const mapped = mapUsagePayloadToHubEvent(json);
  if (mapped !== null) {
    return mapped;
  }
  // Neither encoding fits: hand the raw value through. The reporter validates
  // every loaded event against the wire contract and deletes rows that fail —
  // deletion policy stays in one place (the reporter), the store stays dumb.
  return json as HubUsageEvent;
}

function isQuarantinedPayload(json: unknown): boolean {
  return (
    typeof json === 'object' &&
    json !== null &&
    !Array.isArray(json) &&
    (json as Record<string, unknown>)['quarantined'] === true
  );
}

export type UsageSpoolState = 'pending' | 'deadLetter' | 'quarantined' | 'invalid';

export type UsageSpoolInvalidReason =
  | 'non-string-payload'
  | 'malformed-json'
  | 'non-object-json';

export interface UsageSpoolSummary {
  counts: Record<UsageSpoolState, number>;
  events: Array<{
    id: unknown;
    attempts: unknown;
    state: UsageSpoolState;
    payload: unknown;
    invalidReason?: UsageSpoolInvalidReason;
  }>;
}

/**
 * Diagnostics-export view of the spool: EVERY undelivered row with its state
 * (pending / dead-letter / quarantined / invalid raw payload). Stage 4
 * stop-loss means none of them
 * may hide behind a quarantined-only filter — "export diagnostics first"
 * before a purge must actually preserve the whole spool. Dead-letter is not a
 * persisted flag (it's the in-memory ≥3-attempts tier), so it is derived here
 * the same way the reporter derives it.
 */
export function summarizeUsageSpool(
  rows: ReadonlyArray<{ id?: unknown; payload?: unknown; attempts?: unknown }>,
): UsageSpoolSummary {
  const counts: Record<UsageSpoolState, number> = {
    pending: 0,
    deadLetter: 0,
    quarantined: 0,
    invalid: 0,
  };
  const events: UsageSpoolSummary['events'] = [];
  for (const row of rows) {
    if (typeof row.payload !== 'string') {
      counts.invalid += 1;
      events.push({
        id: row.id,
        attempts: row.attempts,
        state: 'invalid',
        payload: row.payload,
        invalidReason: 'non-string-payload',
      });
      continue;
    }
    let json: unknown;
    try {
      json = JSON.parse(row.payload);
    } catch {
      // Preserve the exact raw bytes. A malformed legacy row cannot be sent,
      // but it is still an undelivered accounting fact that purge insurance
      // must not silently erase.
      counts.invalid += 1;
      events.push({
        id: row.id,
        attempts: row.attempts,
        state: 'invalid',
        payload: row.payload,
        invalidReason: 'malformed-json',
      });
      continue;
    }
    if (typeof json !== 'object' || json === null || Array.isArray(json)) {
      counts.invalid += 1;
      events.push({
        id: row.id,
        attempts: row.attempts,
        state: 'invalid',
        payload: row.payload,
        invalidReason: 'non-object-json',
      });
      continue;
    }
    const attempts = typeof row.attempts === 'number' ? row.attempts : 0;
    const state: UsageSpoolState = isQuarantinedPayload(json)
      ? 'quarantined'
      : attempts >= HUB_USAGE_DEAD_LETTER_AFTER_ATTEMPTS
        ? 'deadLetter'
        : 'pending';
    counts[state] += 1;
    events.push({ id: row.id, attempts: row.attempts, state, payload: json });
  }
  return { counts, events };
}

export function createSqliteUsageEventStore(db: ChatGooseDb): UsageEventStore {
  return {
    load() {
      const rows = db
        .prepare('SELECT client_event_id AS id, payload, attempts FROM usage_events ORDER BY rowid ASC')
        .all();
      const pending: PendingUsageEvent[] = [];
      for (const raw of rows) {
        const row = rowSchema.safeParse(raw);
        if (!row.success) {
          continue; // structurally broken row — unreachable with our DDL
        }
        let json: unknown;
        try {
          json = JSON.parse(row.data.payload);
        } catch {
          json = undefined; // corrupt JSON → fails wire validation → reporter deletes
        }
        pending.push({
          id: row.data.id,
          event: decodeEvent(json),
          attempts: row.data.attempts,
          quarantined: isQuarantinedPayload(json),
        });
      }
      return pending;
    },

    save(events) {
      const stmt = db.prepare(
        'INSERT INTO usage_events (client_event_id, payload, created_at, attempts) ' +
          'VALUES (@id, @payload, @created_at, @attempts) ' +
          // Upsert by id; created_at (and therefore rowid/insertion order) is
          // preserved when the coordinator already parked the raw row.
          'ON CONFLICT (client_event_id) DO UPDATE SET payload = excluded.payload, attempts = excluded.attempts',
      );
      for (const pending of events) {
        stmt.run({
          id: pending.id,
          payload: JSON.stringify({ ...pending.event, quarantined: pending.quarantined }),
          created_at: new Date().toISOString(),
          attempts: pending.attempts,
        });
      }
    },

    remove(ids) {
      const stmt = db.prepare('DELETE FROM usage_events WHERE client_event_id = @id');
      for (const id of ids) {
        stmt.run({ id });
      }
    },

    incrementAttempts(ids) {
      const stmt = db.prepare(
        'UPDATE usage_events SET attempts = attempts + 1 WHERE client_event_id = @id',
      );
      for (const id of ids) {
        stmt.run({ id });
      }
    },

    markQuarantined(ids) {
      // json('true') keeps the flag a JSON boolean (json_set with a bare 1
      // would store a number and break the === true read).
      const stmt = db.prepare(
        "UPDATE usage_events SET payload = json_set(payload, '$.quarantined', json('true')) " +
          'WHERE client_event_id = @id',
      );
      for (const id of ids) {
        stmt.run({ id });
      }
    },
  };
}
