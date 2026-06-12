// Rolling per-fan transaction store feeding the chat-list 30-day spend figure
// (DESIGN §1). The sync sweep walks GET /{account}/transactions incrementally
// (newest cached created_at minus an overlap); reads aggregate at query time
// in chats.list, so the 30-day window rolls without re-fetching. Rows older
// than the retention horizon are pruned by the same sweep.

import { z } from 'zod';
import type { ChatGooseDb } from '../database';
import type { DbChangeBus } from '../change-bus';
import type { FanTransactionUpsert } from '../rows';

const UPSERT_SQL = `
INSERT INTO fan_transactions (account_id, tx_id, fan_id, amount, type, created_at)
VALUES (@account_id, @tx_id, @fan_id, @amount, @type, @created_at)
ON CONFLICT (account_id, tx_id) DO UPDATE SET
  fan_id = excluded.fan_id,
  amount = excluded.amount,
  type = excluded.type,
  created_at = excluded.created_at`;

const maxCreatedAtSchema = z.object({ max_created_at: z.string().nullable() });

export interface FanTransactionsQueries {
  /** Idempotent by (account_id, tx_id); publishes a chats-scope change (the
   *  visible artifact is the chat list's 30-day figure). */
  upsertMany(rows: readonly FanTransactionUpsert[]): void;
  /** Newest stored created_at for the account — the incremental-sweep cursor. */
  latestCreatedAt(accountId: string): string | null;
  /** Per-fan SUM(amount) since the cutoff — the Spenders board 30-day green
   *  figure (account-wide GROUP BY; the rolling store is small by design). */
  sumByFanSince(accountId: string, cutoffIso: string): Map<string, number>;
  /** Drop rows older than the cutoff (retention; the 30d window is read-time). */
  pruneOlderThan(accountId: string, cutoffIso: string): void;
}

export function createFanTransactionsQueries(
  db: ChatGooseDb,
  bus: DbChangeBus,
): FanTransactionsQueries {
  return {
    upsertMany(rows) {
      if (rows.length === 0) {
        return;
      }
      db.transaction(() => {
        for (const row of rows) {
          db.prepare(UPSERT_SQL).run({
            account_id: row.accountId,
            tx_id: row.txId,
            fan_id: row.fanId,
            amount: row.amount,
            type: row.type,
            created_at: row.createdAt,
          });
        }
      });
      for (const accountId of new Set(rows.map((row) => row.accountId))) {
        bus.publish({ scope: 'chats', accountId });
      }
    },

    latestCreatedAt(accountId) {
      const row: unknown = db
        .prepare(
          'SELECT MAX(created_at) AS max_created_at FROM fan_transactions WHERE account_id = @account_id',
        )
        .get({ account_id: accountId });
      return row === undefined ? null : maxCreatedAtSchema.parse(row).max_created_at;
    },

    sumByFanSince(accountId, cutoffIso) {
      const rowSchema = z.object({ fan_id: z.string(), total: z.number() });
      const rows: unknown[] = db
        .prepare(
          `SELECT fan_id, SUM(amount) AS total FROM fan_transactions
           WHERE account_id = @account_id AND created_at >= @cutoff
           GROUP BY fan_id`,
        )
        .all({ account_id: accountId, cutoff: cutoffIso });
      const out = new Map<string, number>();
      for (const raw of rows) {
        const row = rowSchema.parse(raw);
        out.set(row.fan_id, row.total);
      }
      return out;
    },

    pruneOlderThan(accountId, cutoffIso) {
      db.prepare(
        'DELETE FROM fan_transactions WHERE account_id = @account_id AND created_at < @cutoff',
      ).run({ account_id: accountId, cutoff: cutoffIso });
    },
  };
}
