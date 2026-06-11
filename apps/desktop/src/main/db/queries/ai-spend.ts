// ai_spend_log(day, feature, …) — durable per-day per-feature AI spend
// counters (PLAN item 9). Written alongside every usage_events row at
// operation completion (usage_events DRAINS to the hub once core is
// configured — this table is what the Activity panel aggregates). Costs are
// integer micro-USD; SQLite UPDATE SET expressions all read the pre-update
// row, so the top-run compare-and-swap below is race-free within a statement.

import { z } from 'zod';
import type { AiSpendDayRow } from '@chatgoose/shared/activity/index';
import type { ChatGooseDb } from '../database';

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const rowSchema = z.object({
  day: z.string(),
  feature: z.string(),
  runs: z.number(),
  cache_hit_runs: z.number(),
  inserted: z.number(),
  input_tokens: z.number(),
  cache_write_tokens: z.number(),
  cache_read_tokens: z.number(),
  output_tokens: z.number(),
  cost_microusd: z.number(),
  top_run_microusd: z.number(),
  top_run_chat_id: z.string().nullable(),
});

export interface AiSpendRunArgs {
  /** UTC day (YYYY-MM-DD) of the operation's completedAt. */
  day: string;
  feature: string;
  isCacheHit: boolean;
  inputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  costMicroUsd: number;
  chatId: string | null;
}

export interface AiSpendLogQueries {
  /** One completed operation → +1 run with its tokens/cost folded in. */
  recordRun(args: AiSpendRunArgs): void;
  /** One accepted draft (cmd:ai.feedback) → +1 inserted. */
  markInserted(day: string, feature: string): void;
  /** Rows for day >= sinceDay (panel: today's table + trailing total). */
  rowsSince(sinceDay: string): AiSpendDayRow[];
}

function assertDay(day: string): void {
  if (!DAY_PATTERN.test(day)) {
    throw new Error(`ai_spend_log day must be YYYY-MM-DD, got "${day}"`);
  }
}

export function createAiSpendLogQueries(db: ChatGooseDb): AiSpendLogQueries {
  return {
    recordRun(args) {
      assertDay(args.day);
      const cost = Math.max(0, Math.round(args.costMicroUsd));
      db.prepare(
        `INSERT INTO ai_spend_log (
           day, feature, runs, cache_hit_runs, inserted,
           input_tokens, cache_write_tokens, cache_read_tokens, output_tokens,
           cost_microusd, top_run_microusd, top_run_chat_id
         ) VALUES (
           @day, @feature, 1, @cache_hit, 0,
           @input, @cache_write, @cache_read, @output,
           @cost, @cost, @chat_id
         )
         ON CONFLICT (day, feature) DO UPDATE SET
           runs = runs + 1,
           cache_hit_runs = cache_hit_runs + excluded.cache_hit_runs,
           input_tokens = input_tokens + excluded.input_tokens,
           cache_write_tokens = cache_write_tokens + excluded.cache_write_tokens,
           cache_read_tokens = cache_read_tokens + excluded.cache_read_tokens,
           output_tokens = output_tokens + excluded.output_tokens,
           cost_microusd = cost_microusd + excluded.cost_microusd,
           top_run_chat_id = CASE
             WHEN excluded.top_run_microusd > top_run_microusd
             THEN excluded.top_run_chat_id ELSE top_run_chat_id END,
           top_run_microusd = MAX(top_run_microusd, excluded.top_run_microusd)`,
      ).run({
        day: args.day,
        feature: args.feature,
        cache_hit: args.isCacheHit ? 1 : 0,
        input: args.inputTokens,
        cache_write: args.cacheWriteTokens,
        cache_read: args.cacheReadTokens,
        output: args.outputTokens,
        cost,
        chat_id: args.chatId,
      });
    },

    markInserted(day, feature) {
      assertDay(day);
      // Upsert: the run row normally exists (recordRun wrote it), but a feedback
      // landing just after a UTC day flip must not throw.
      db.prepare(
        `INSERT INTO ai_spend_log (day, feature, runs, inserted)
         VALUES (@day, @feature, 0, 1)
         ON CONFLICT (day, feature) DO UPDATE SET inserted = inserted + 1`,
      ).run({ day, feature });
    },

    rowsSince(sinceDay) {
      assertDay(sinceDay);
      const rows = db
        .prepare('SELECT * FROM ai_spend_log WHERE day >= @since ORDER BY day, feature')
        .all({ since: sinceDay });
      return rows.map((raw) => {
        const row = rowSchema.parse(raw);
        return {
          day: row.day,
          feature: row.feature,
          runs: row.runs,
          cacheHitRuns: row.cache_hit_runs,
          inserted: row.inserted,
          inputTokens: row.input_tokens,
          cacheWriteTokens: row.cache_write_tokens,
          cacheReadTokens: row.cache_read_tokens,
          outputTokens: row.output_tokens,
          costMicroUsd: row.cost_microusd,
          topRunMicroUsd: row.top_run_microusd,
          topRunChatId: row.top_run_chat_id,
        };
      });
    },
  };
}
