// media_fetch_reports (v26, D43) — durable queue of media transfer results
// Core asked for (POST /api/v1/ofapi/media/reports, idempotent by resolve id).
// A row leaves only after Core accepted (or already had) it; a report that
// never arrives stays "unknown" on Core's side, never "free".

import { z } from 'zod';
import type { ChatGooseDb } from '../database';

export interface MediaFetchReport {
  resolveId: string;
  result: 'ok' | 'failed' | 'aborted_size' | 'timeout' | 'http_error';
  bytesReceived: number | null;
  httpStatus: number | null;
}

/** Core's contract ceiling for a reported byte count (30 MB). */
export const MEDIA_REPORT_BYTES_CEILING = 30_000_000;

// Mirrors Core's report contract, so no row written here can fail its
// check before the wire (and a malformed row is dropped, never retried).
const reportSchema: z.ZodType<MediaFetchReport> = z.strictObject({
  resolveId: z.uuid(),
  result: z.enum(['ok', 'failed', 'aborted_size', 'timeout', 'http_error']),
  bytesReceived: z.number().int().nonnegative().max(MEDIA_REPORT_BYTES_CEILING).nullable(),
  httpStatus: z.number().int().min(100).max(599).nullable(),
});

const rowSchema = z.object({ resolve_id: z.string(), payload: z.string() });

export interface MediaFetchReportsQueries {
  enqueue(report: MediaFetchReport): void;
  /** Oldest first. Malformed rows are dropped (poison never blocks the queue). */
  next(limit: number): MediaFetchReport[];
  remove(resolveIds: readonly string[]): void;
  /** Counts one refusal by Core (a 4xx, or the contract check before the wire) — never an outage. */
  noteAttempt(resolveIds: readonly string[]): void;
  /** D6: drops rows Core refused `maxAttempts` times (Core counts a missing report "unknown"). */
  dropExhausted(maxAttempts: number): number;
  count(): number;
}

export function createMediaFetchReportsQueries(
  db: ChatGooseDb,
  now: () => Date = () => new Date(),
): MediaFetchReportsQueries {
  const removeOne = (resolveId: string) =>
    db.prepare('DELETE FROM media_fetch_reports WHERE resolve_id = @resolve_id').run({ resolve_id: resolveId });
  return {
    enqueue(report) {
      const parsed = reportSchema.parse(report);
      db.prepare(
        `INSERT INTO media_fetch_reports (resolve_id, payload, created_at)
         VALUES (@resolve_id, @payload, @created_at)
         ON CONFLICT (resolve_id) DO NOTHING`,
      ).run({ resolve_id: parsed.resolveId, payload: JSON.stringify(parsed), created_at: now().toISOString() });
    },
    next(limit) {
      const rows = db
        .prepare('SELECT resolve_id, payload FROM media_fetch_reports ORDER BY created_at ASC, resolve_id ASC LIMIT @limit')
        .all({ limit })
        .map((raw) => rowSchema.parse(raw));
      const reports: MediaFetchReport[] = [];
      for (const row of rows) {
        let payload: unknown;
        try {
          payload = JSON.parse(row.payload);
        } catch {
          payload = null;
        }
        const parsed = reportSchema.safeParse(payload);
        if (parsed.success) reports.push(parsed.data);
        else removeOne(row.resolve_id);
      }
      return reports;
    },
    remove(resolveIds) {
      for (const resolveId of resolveIds) removeOne(resolveId);
    },
    noteAttempt(resolveIds) {
      for (const resolveId of resolveIds) {
        db.prepare('UPDATE media_fetch_reports SET attempts = attempts + 1 WHERE resolve_id = @resolve_id')
          .run({ resolve_id: resolveId });
      }
    },
    dropExhausted(maxAttempts) {
      return db
        .prepare('DELETE FROM media_fetch_reports WHERE attempts >= @max')
        .run({ max: Math.max(1, Math.trunc(maxAttempts)) }).changes;
    },
    count() {
      const raw: unknown = db.prepare('SELECT COUNT(*) AS n FROM media_fetch_reports').get();
      return z.object({ n: z.number() }).parse(raw).n;
    },
  };
}
