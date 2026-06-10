// credit_log(day, used) — per-day OFAPI credit usage counter (SPEC §10/§12).
// No DbChangedEvent scope exists for credits; the status bar polls
// query:sync.status instead of subscribing.

import { z } from 'zod';
import type { ChatGooseDb } from '../database';

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const usedRowSchema = z.object({ used: z.number() });

export interface CreditLogQueries {
  /** Adds `credits` to the day's counter (UTC day key, YYYY-MM-DD). */
  add(day: string, credits: number): void;
  usedOn(day: string): number;
}

export function createCreditLogQueries(db: ChatGooseDb): CreditLogQueries {
  return {
    add(day, credits) {
      if (!DAY_PATTERN.test(day)) {
        throw new Error(`credit_log day must be YYYY-MM-DD, got "${day}"`);
      }
      if (!Number.isFinite(credits) || credits < 0) {
        throw new Error(`credit_log credits must be a non-negative number, got ${credits}`);
      }
      db.prepare(
        'INSERT INTO credit_log (day, used) VALUES (@day, @used) ' +
          'ON CONFLICT (day) DO UPDATE SET used = used + excluded.used',
      ).run({ day, used: credits });
    },

    usedOn(day) {
      const row: unknown = db
        .prepare('SELECT used FROM credit_log WHERE day = @day')
        .get({ day });
      return row === undefined ? 0 : usedRowSchema.parse(row).used;
    },
  };
}
