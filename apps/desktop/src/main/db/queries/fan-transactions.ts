// Rolling per-fan transaction store feeding the chat-list 30-day spend figure
// (DESIGN §1). The sync sweep walks GET /{account}/transactions incrementally
// (newest created_at IT read, minus an overlap); since D39 Core's
// transaction.posted also lands here at once (source 'hub'), keyed the same
// way so no transaction is counted twice; reads aggregate at query time
// in chats.list, so the 30-day window rolls without re-fetching. Rows older
// than the retention horizon are pruned by the same sweep. All aggregates sum
// `net` (creator earnings) — the same basis as the fans.spending lifetime
// figures (owner decision 2026-06-13: every money figure shows net).

import { z } from 'zod';
import type { ChatGooseDb } from '../database';
import type { DbChangeBus } from '../change-bus';
import type { FanTransactionUpsert } from '../rows';

// The sweep's own write: OFAPI's list is the reconciling source, so it
// overwrites an instant hub row of the same transaction and claims it
// ('sweep') — the row the sweep has now read counts toward its watermark.
const UPSERT_SQL = `
INSERT INTO fan_transactions (account_id, tx_id, fan_id, amount, net, type, created_at, source)
VALUES (@account_id, @tx_id, @fan_id, @amount, @net, @type, @created_at, 'sweep')
ON CONFLICT (account_id, tx_id) DO UPDATE SET
  fan_id = excluded.fan_id,
  amount = excluded.amount,
  net = excluded.net,
  type = excluded.type,
  created_at = excluded.created_at,
  source = 'sweep'`;

// D39: Core's transaction.posted, applied at once. Same key as the sweep's
// row (Core's transactionRef is OFAPI's transaction id), so a transaction the
// sweep already stored is left alone — one money change per transaction.
const INSERT_FROM_HUB_SQL = `
INSERT INTO fan_transactions (account_id, tx_id, fan_id, amount, net, type, created_at, source)
VALUES (@account_id, @tx_id, @fan_id, @amount, @net, @type, @created_at, 'hub')
ON CONFLICT (account_id, tx_id) DO NOTHING`;

const maxCreatedAtSchema = z.object({ max_created_at: z.string().nullable() });

export interface FanTransactionsQueries {
  /** The sweep's write. Idempotent by (account_id, tx_id); publishes a
   *  chats-scope change (the visible artifact is the chat list's 30-day
   *  figure). */
  upsertMany(rows: readonly FanTransactionUpsert[]): void;
  /** D39: one transaction from Core's transaction.posted. Inserts only when
   *  the transaction is not stored yet (true = inserted); never moves the
   *  sweep's watermark. */
  insertFromHub(row: FanTransactionUpsert): boolean;
  /** Newest created_at among rows the SWEEP read — its incremental cursor.
   *  Instant hub rows are excluded (D39): they must never make the sweep skip
   *  a transaction it has not read itself. */
  sweepWatermark(accountId: string): string | null;
  /** Per-fan SUM(amount) since the cutoff — the Spenders board 30-day green
   *  figure (account-wide GROUP BY; the rolling store is small by design). */
  sumByFanSince(accountId: string, cutoffIso: string): Map<string, number>;
  /** Per-fan SUM + COUNT since the cutoff — Spenders stats (payers, avg check,
   *  new-spender purchase counts). */
  statsByFanSince(
    accountId: string,
    cutoffIso: string,
  ): Map<string, { total: number; count: number }>;
  /** Per-LOCAL-day SUM + COUNT since the cutoff (SQLite 'localtime' — the
   *  owner reads the chart in their own calendar days), ascending, sparse. */
  dailyTotals(
    accountId: string,
    cutoffIso: string,
  ): Array<{ day: string; amount: number; txCount: number }>;
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
            net: row.net,
            type: row.type,
            created_at: row.createdAt,
          });
        }
      });
      for (const accountId of new Set(rows.map((row) => row.accountId))) {
        bus.publish({ scope: 'chats', accountId });
      }
    },

    insertFromHub(row) {
      const { changes } = db.prepare(INSERT_FROM_HUB_SQL).run({
        account_id: row.accountId,
        tx_id: row.txId,
        fan_id: row.fanId,
        amount: row.amount,
        net: row.net,
        type: row.type,
        created_at: row.createdAt,
      });
      if (changes > 0) {
        bus.publish({ scope: 'chats', accountId: row.accountId });
      }
      return changes > 0;
    },

    sweepWatermark(accountId) {
      const row: unknown = db
        .prepare(
          `SELECT MAX(created_at) AS max_created_at FROM fan_transactions
           WHERE account_id = @account_id AND source = 'sweep'`,
        )
        .get({ account_id: accountId });
      return row === undefined ? null : maxCreatedAtSchema.parse(row).max_created_at;
    },

    sumByFanSince(accountId, cutoffIso) {
      const rowSchema = z.object({ fan_id: z.string(), total: z.number() });
      const rows: unknown[] = db
        .prepare(
          `SELECT fan_id, SUM(net) AS total FROM fan_transactions
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

    statsByFanSince(accountId, cutoffIso) {
      const rowSchema = z.object({ fan_id: z.string(), total: z.number(), tx_count: z.number() });
      const rows: unknown[] = db
        .prepare(
          `SELECT fan_id, SUM(net) AS total, COUNT(*) AS tx_count FROM fan_transactions
           WHERE account_id = @account_id AND created_at >= @cutoff
           GROUP BY fan_id`,
        )
        .all({ account_id: accountId, cutoff: cutoffIso });
      const out = new Map<string, { total: number; count: number }>();
      for (const raw of rows) {
        const row = rowSchema.parse(raw);
        out.set(row.fan_id, { total: row.total, count: row.tx_count });
      }
      return out;
    },

    dailyTotals(accountId, cutoffIso) {
      const rowSchema = z.object({ day: z.string(), amount: z.number(), tx_count: z.number() });
      const rows: unknown[] = db
        .prepare(
          `SELECT date(created_at, 'localtime') AS day,
                  SUM(net) AS amount, COUNT(*) AS tx_count
           FROM fan_transactions
           WHERE account_id = @account_id AND created_at >= @cutoff
           GROUP BY day ORDER BY day`,
        )
        .all({ account_id: accountId, cutoff: cutoffIso });
      return rows.map((raw) => {
        const row = rowSchema.parse(raw);
        return { day: row.day, amount: row.amount, txCount: row.tx_count };
      });
    },

    pruneOlderThan(accountId, cutoffIso) {
      db.prepare(
        'DELETE FROM fan_transactions WHERE account_id = @account_id AND created_at < @cutoff',
      ).run({ account_id: accountId, cutoff: cutoffIso });
    },
  };
}
