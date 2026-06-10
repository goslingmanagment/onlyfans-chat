import { z } from 'zod';
import type { ChatGooseDb } from '../database';
import type { DbChangeBus } from '../change-bus';
import { decodeAccountRow, toJson } from '../rows';
import type { AccountAuthState, AccountRow, AccountUpsert } from '../rows';

const COLUMNS = 'id, username, display_name, avatar, auth_state, updated_at';

const UPSERT_SQL = `
INSERT INTO accounts (id, username, display_name, avatar, auth_state, raw, updated_at)
VALUES (@id, @username, @display_name, @avatar, @auth_state, @raw, @updated_at)
ON CONFLICT (id) DO UPDATE SET
  username = excluded.username,
  display_name = excluded.display_name,
  avatar = excluded.avatar,
  auth_state = excluded.auth_state,
  raw = excluded.raw,
  updated_at = excluded.updated_at`;

const unreadTotalSchema = z.object({ unread_total: z.number().int() });

export interface AccountListRow extends AccountRow {
  /** SUM of chats.unread_count — feeds AccountVM.unreadCount. */
  unreadTotal: number;
}

export interface AccountsQueries {
  upsert(account: AccountUpsert): void;
  upsertMany(accounts: readonly AccountUpsert[]): void;
  get(id: string): AccountRow | null;
  list(): AccountListRow[];
  setAuthState(id: string, authState: AccountAuthState): void;
}

export function createAccountsQueries(db: ChatGooseDb, bus: DbChangeBus): AccountsQueries {
  function writeOne(account: AccountUpsert): void {
    db.prepare(UPSERT_SQL).run({
      id: account.id,
      username: account.username,
      display_name: account.displayName,
      avatar: account.avatar,
      auth_state: account.authState,
      raw: toJson(account.raw),
      updated_at: new Date().toISOString(),
    });
  }

  return {
    upsert(account) {
      writeOne(account);
      bus.publish({ scope: 'accounts', accountId: account.id });
    },

    upsertMany(accounts) {
      if (accounts.length === 0) {
        return;
      }
      db.transaction(() => {
        for (const account of accounts) {
          writeOne(account);
        }
      });
      for (const account of accounts) {
        bus.publish({ scope: 'accounts', accountId: account.id });
      }
    },

    get(id) {
      const row: unknown = db
        .prepare(`SELECT ${COLUMNS} FROM accounts WHERE id = @id`)
        .get({ id });
      return row === undefined ? null : decodeAccountRow(row);
    },

    list() {
      const rows = db
        .prepare(
          `SELECT ${COLUMNS},
             COALESCE((SELECT SUM(c.unread_count) FROM chats c WHERE c.account_id = accounts.id), 0)
               AS unread_total
           FROM accounts ORDER BY username ASC`,
        )
        .all();
      return rows.map((row) => ({
        ...decodeAccountRow(row),
        unreadTotal: unreadTotalSchema.parse(row).unread_total,
      }));
    },

    setAuthState(id, authState) {
      const { changes } = db
        .prepare('UPDATE accounts SET auth_state = @auth_state, updated_at = @updated_at WHERE id = @id')
        .run({ id, auth_state: authState, updated_at: new Date().toISOString() });
      if (changes > 0) {
        bus.publish({ scope: 'accounts', accountId: id });
      }
    },
  };
}
