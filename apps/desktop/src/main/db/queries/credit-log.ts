// credit_log(day, purpose, used, requests) — per-day per-purpose OFAPI credit
// counters (SPEC §10/§12; PLAN item 9 Activity ledger). Pre-v7 rows live under
// the 'untagged' purpose. No DbChangedEvent scope exists for credits; the
// renderer refreshes via sync:event creditBalance frames instead.

import { z } from 'zod';
import type { CreditLedgerEntry } from '@chatgoose/shared/activity/index';
import type { ChatGooseDb } from '../database';

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const usedRowSchema = z.object({ used: z.number().nullable() });
const purposeRowSchema = z.object({
  purpose: z.string(),
  used: z.number(),
  requests: z.number(),
});
const dayTotalRowSchema = z.object({ day: z.string(), used: z.number() });

export interface CreditLogQueries {
  /** Adds credits/requests to the (day, purpose) counters (UTC day key). */
  add(day: string, purpose: string, credits: number, requests: number): void;
  /** Total credits across all purposes that day. */
  usedOn(day: string): number;
  /** Per-purpose counters for one day (ledger rows; unordered). */
  byPurposeOn(day: string): CreditLedgerEntry[];
  /** Daily totals for day >= sinceDay (pace estimate window). */
  totalsSince(sinceDay: string): { day: string; used: number }[];
}

function assertDay(day: string): void {
  if (!DAY_PATTERN.test(day)) {
    throw new Error(`credit_log day must be YYYY-MM-DD, got "${day}"`);
  }
}

export function createCreditLogQueries(db: ChatGooseDb): CreditLogQueries {
  return {
    add(day, purpose, credits, requests) {
      assertDay(day);
      if (purpose.trim() === '') {
        throw new Error('credit_log purpose must be non-empty');
      }
      if (!Number.isFinite(credits) || credits < 0) {
        throw new Error(`credit_log credits must be a non-negative number, got ${credits}`);
      }
      if (!Number.isFinite(requests) || requests < 0) {
        throw new Error(`credit_log requests must be a non-negative number, got ${requests}`);
      }
      db.prepare(
        'INSERT INTO credit_log (day, purpose, used, requests) ' +
          'VALUES (@day, @purpose, @used, @requests) ' +
          'ON CONFLICT (day, purpose) DO UPDATE SET ' +
          'used = used + excluded.used, requests = requests + excluded.requests',
      ).run({ day, purpose, used: credits, requests });
    },

    usedOn(day) {
      assertDay(day);
      const row: unknown = db
        .prepare('SELECT SUM(used) AS used FROM credit_log WHERE day = @day')
        .get({ day });
      return row === undefined ? 0 : (usedRowSchema.parse(row).used ?? 0);
    },

    byPurposeOn(day) {
      assertDay(day);
      const rows = db
        .prepare('SELECT purpose, used, requests FROM credit_log WHERE day = @day')
        .all({ day });
      return rows.map((raw) => {
        const row = purposeRowSchema.parse(raw);
        return { purpose: row.purpose, requests: row.requests, credits: row.used };
      });
    },

    totalsSince(sinceDay) {
      assertDay(sinceDay);
      const rows = db
        .prepare(
          'SELECT day, SUM(used) AS used FROM credit_log WHERE day >= @since GROUP BY day ORDER BY day',
        )
        .all({ since: sinceDay });
      return rows.map((raw) => dayTotalRowSchema.parse(raw));
    },
  };
}
