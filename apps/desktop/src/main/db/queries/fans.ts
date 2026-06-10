import type { ChatGooseDb } from '../database';
import type { DbChangeBus } from '../change-bus';
import { decodeFanRow, toJson } from '../rows';
import type { FanRow, FanUpsert } from '../rows';

const COLUMNS =
  'account_id, fan_id, username, name, custom_name, about, last_seen, spending, subscription, fetched_at';

const UPSERT_SQL = `
INSERT INTO fans (
  account_id, fan_id, username, name, custom_name, about, last_seen, spending, subscription, fetched_at
) VALUES (
  @account_id, @fan_id, @username, @name, @custom_name, @about, @last_seen, @spending, @subscription, @fetched_at
)
ON CONFLICT (account_id, fan_id) DO UPDATE SET
  username = excluded.username,
  name = excluded.name,
  custom_name = excluded.custom_name,
  about = excluded.about,
  last_seen = excluded.last_seen,
  spending = excluded.spending,
  subscription = excluded.subscription,
  fetched_at = excluded.fetched_at`;

export interface FansQueries {
  upsert(fan: FanUpsert): void;
  get(accountId: string, fanId: string): FanRow | null;
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
  };
}
