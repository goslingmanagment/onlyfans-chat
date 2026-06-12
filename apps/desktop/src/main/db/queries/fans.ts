import { z } from 'zod';
import type { ChatGooseDb } from '../database';
import type { DbChangeBus } from '../change-bus';
import { decodeFanRow, toJson } from '../rows';
import type { FanRow, FanUpsert } from '../rows';

const COLUMNS =
  'account_id, fan_id, username, name, custom_name, avatar, about, last_seen, spending, subscription, fetched_at';

const UPSERT_SQL = `
INSERT INTO fans (
  account_id, fan_id, username, name, custom_name, avatar, about, last_seen, spending, subscription, fetched_at
) VALUES (
  @account_id, @fan_id, @username, @name, @custom_name, @avatar, @about, @last_seen, @spending, @subscription, @fetched_at
)
ON CONFLICT (account_id, fan_id) DO UPDATE SET
  username = excluded.username,
  name = excluded.name,
  custom_name = excluded.custom_name,
  avatar = excluded.avatar,
  about = excluded.about,
  last_seen = excluded.last_seen,
  spending = excluded.spending,
  subscription = excluded.subscription,
  fetched_at = excluded.fetched_at`;

export interface FansQueries {
  upsert(fan: FanUpsert): void;
  get(accountId: string, fanId: string): FanRow | null;
  /** Batched lookup (Supporters board row join); chunked under the SQLite
   *  bind-variable cap. Missing ids are simply absent from the result. */
  getMany(accountId: string, fanIds: readonly string[]): Map<string, FanRow>;
  /** Fans with lifetime spend > 0 — the «Без тира» candidate pool (PLAN item 12). */
  listSpenderIds(accountId: string): string[];
}

/** Keep IN() lists comfortably under SQLITE_MAX_VARIABLE_NUMBER (999 legacy). */
export const SQL_IN_CHUNK = 400;

export function chunked<T>(items: readonly T[], size = SQL_IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export function createFansQueries(db: ChatGooseDb, bus: DbChangeBus): FansQueries {
  return {
    upsert(fan) {
      db.prepare(UPSERT_SQL).run({
        account_id: fan.accountId,
        fan_id: fan.fanId,
        username: fan.username,
        name: fan.name,
        custom_name: fan.customName,
        avatar: fan.avatar,
        about: fan.about,
        last_seen: fan.lastSeen,
        spending: fan.spending === null ? null : toJson(fan.spending),
        subscription: fan.subscription === null ? null : toJson(fan.subscription),
        fetched_at: fan.fetchedAt,
      });
      bus.publish({ scope: 'fans', accountId: fan.accountId });
    },

    get(accountId, fanId) {
      const row: unknown = db
        .prepare(`SELECT ${COLUMNS} FROM fans WHERE account_id = @account_id AND fan_id = @fan_id`)
        .get({ account_id: accountId, fan_id: fanId });
      return row === undefined ? null : decodeFanRow(row);
    },

    getMany(accountId, fanIds) {
      const out = new Map<string, FanRow>();
      for (const chunk of chunked(fanIds)) {
        const placeholders = chunk.map((_, i) => `@id${i}`).join(', ');
        const params: Record<string, string> = { account_id: accountId };
        chunk.forEach((id, i) => {
          params[`id${i}`] = id;
        });
        const rows = db
          .prepare(
            `SELECT ${COLUMNS} FROM fans WHERE account_id = @account_id AND fan_id IN (${placeholders})`,
          )
          .all(params);
        for (const raw of rows) {
          const row = decodeFanRow(raw);
          out.set(row.fanId, row);
        }
      }
      return out;
    },

    listSpenderIds(accountId) {
      // json_valid guard mirrors chats.ts: corrupt spending rows degrade to
      // "not a spender" instead of throwing inside json_extract.
      const rows: unknown[] = db
        .prepare(
          `SELECT fan_id FROM fans
           WHERE account_id = @account_id
             AND spending IS NOT NULL AND json_valid(spending)
             AND CAST(json_extract(spending, '$.total') AS REAL) > 0`,
        )
        .all({ account_id: accountId });
      return rows.map((row) => z.object({ fan_id: z.string() }).parse(row).fan_id);
    },
  };
}
