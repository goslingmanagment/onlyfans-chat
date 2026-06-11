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
import { hubUsageEventSchema } from '@chatgoose/shared/hub/index';
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
