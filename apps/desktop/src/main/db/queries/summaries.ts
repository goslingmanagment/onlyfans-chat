// Summary cache rows (SPEC §8.5) — SQLite replacement for browser.storage.
// Validity/staleness logic stays in @chatgoose/shared (summary/validity); this
// module only persists entries keyed by (account, fan_id). Reads pass through
// normalizeSummaryCacheEntry — a corrupt row reads as null (legacy tolerance).

import { normalizeSummaryCacheEntry } from '@chatgoose/shared/summary/validity';
import type { SummaryCacheEntry } from '@chatgoose/shared/summary/validity';
import { z } from 'zod';
import type { ChatGooseDb } from '../database';
import type { DbChangeBus } from '../change-bus';
import { toJson, toSqlBool } from '../rows';

const COLUMNS =
  'account_id, fan_id, body, model_id, personality_id, personality_updated_at, ' +
  'generated_at, spending_verified, subscription_verified, hub_sync_state';

const UPSERT_SQL = `
INSERT INTO summaries (
  account_id, fan_id, body, model_id, personality_id, personality_updated_at,
  generated_at, spending_verified, subscription_verified, hub_sync_state
) VALUES (
  @account_id, @fan_id, @body, @model_id, @personality_id, @personality_updated_at,
  @generated_at, @spending_verified, @subscription_verified, @hub_sync_state
)
ON CONFLICT (account_id, fan_id) DO UPDATE SET
  body = excluded.body,
  model_id = excluded.model_id,
  personality_id = excluded.personality_id,
  personality_updated_at = excluded.personality_updated_at,
  generated_at = excluded.generated_at,
  spending_verified = excluded.spending_verified,
  subscription_verified = excluded.subscription_verified,
  hub_sync_state = excluded.hub_sync_state`;

const sqlBoolOrNull = z.union([z.literal(0), z.literal(1)]).nullable();

const summarySqlSchema = z.object({
  body: z.string(),
  model_id: z.string().nullable(),
  personality_id: z.string(),
  personality_updated_at: z.number(),
  generated_at: z.number(),
  spending_verified: sqlBoolOrNull,
  subscription_verified: sqlBoolOrNull,
  hub_sync_state: z.string().nullable(),
});

const pendingSummarySqlSchema = summarySqlSchema.extend({
  account_id: z.string().min(1),
  fan_id: z.string().min(1),
});

function rowToCandidate(value: unknown): Record<string, unknown> | null {
  const parsed = summarySqlSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  const row = parsed.data;
  const candidate: Record<string, unknown> = {
    body: row.body,
    personalityId: row.personality_id,
    personalityUpdatedAt: row.personality_updated_at,
    generatedAt: row.generated_at,
  };
  if (row.model_id !== null) {
    candidate['modelId'] = row.model_id;
  }
  if (row.spending_verified !== null) {
    candidate['spendingVerified'] = row.spending_verified === 1;
  }
  if (row.subscription_verified !== null) {
    candidate['subscriptionVerified'] = row.subscription_verified === 1;
  }
  if (row.hub_sync_state !== null) {
    try {
      candidate['hubSyncState'] = JSON.parse(row.hub_sync_state);
    } catch {
      // Opaque hub state failed to parse — treat as absent.
    }
  }
  return candidate;
}

export interface SummariesQueries {
  get(accountId: string, fanId: string): SummaryCacheEntry | null;
  put(accountId: string, fanId: string, entry: SummaryCacheEntry): void;
  /** Oldest local summaries whose last Hub delivery is explicitly pending. */
  listHubSyncPending(limit?: number): Array<{
    accountId: string;
    fanId: string;
    entry: SummaryCacheEntry;
  }>;
  /** Refresh = delete + regenerate (SPEC §8.5). */
  remove(accountId: string, fanId: string): void;
}

export function createSummariesQueries(db: ChatGooseDb, bus: DbChangeBus): SummariesQueries {
  return {
    get(accountId, fanId) {
      const row: unknown = db
        .prepare(`SELECT ${COLUMNS} FROM summaries WHERE account_id = @account_id AND fan_id = @fan_id`)
        .get({ account_id: accountId, fan_id: fanId });
      if (row === undefined) {
        return null;
      }
      const candidate = rowToCandidate(row);
      return candidate === null ? null : normalizeSummaryCacheEntry(candidate);
    },

    put(accountId, fanId, entry) {
      db.prepare(UPSERT_SQL).run({
        account_id: accountId,
        fan_id: fanId,
        body: entry.body,
        model_id: entry.modelId ?? null,
        personality_id: entry.personalityId,
        personality_updated_at: entry.personalityUpdatedAt,
        generated_at: entry.generatedAt,
        spending_verified:
          entry.spendingVerified === undefined ? null : toSqlBool(entry.spendingVerified),
        subscription_verified:
          entry.subscriptionVerified === undefined ? null : toSqlBool(entry.subscriptionVerified),
        hub_sync_state: entry.hubSyncState === undefined ? null : toJson(entry.hubSyncState),
      });
      bus.publish({ scope: 'summaries', accountId });
    },

    listHubSyncPending(limit = 100) {
      const boundedLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
      return db
        .prepare(
          `SELECT ${COLUMNS}
           FROM summaries
           WHERE json_extract(hub_sync_state, '$.state') = 'pending'
           ORDER BY generated_at, account_id, fan_id
           LIMIT @limit`,
        )
        .all({ limit: boundedLimit })
        .flatMap((value) => {
          const parsed = pendingSummarySqlSchema.safeParse(value);
          if (!parsed.success) {
            return [];
          }
          const candidate = rowToCandidate(parsed.data);
          const entry = candidate === null ? null : normalizeSummaryCacheEntry(candidate);
          return entry === null
            ? []
            : [{ accountId: parsed.data.account_id, fanId: parsed.data.fan_id, entry }];
        });
    },

    remove(accountId, fanId) {
      const { changes } = db
        .prepare('DELETE FROM summaries WHERE account_id = @account_id AND fan_id = @fan_id')
        .run({ account_id: accountId, fan_id: fanId });
      if (changes > 0) {
        bus.publish({ scope: 'summaries', accountId });
      }
    },
  };
}
