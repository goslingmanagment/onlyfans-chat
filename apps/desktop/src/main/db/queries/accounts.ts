import { z } from 'zod';
import type { ChatGooseDb } from '../database';
import type { DbChangeBus } from '../change-bus';
import { decodeAccountRow, toJson } from '../rows';
import type { AccountAuthState, AccountRow, AccountUpsert } from '../rows';

const COLUMNS = 'id, username, display_name, avatar, auth_state, grant_state, updated_at';

const UPSERT_SQL = `
INSERT INTO accounts (id, username, display_name, avatar, auth_state, grant_state, raw, updated_at)
VALUES (@id, @username, @display_name, @avatar, @auth_state, 'granted', @raw, @updated_at)
ON CONFLICT (id) DO UPDATE SET
  username = excluded.username,
  display_name = CASE
    WHEN trim(excluded.display_name) = '' THEN accounts.display_name
    WHEN excluded.display_name = excluded.username
      AND trim(accounts.display_name) <> ''
      AND accounts.display_name <> accounts.username
      THEN accounts.display_name
    ELSE excluded.display_name
  END,
  avatar = COALESCE(excluded.avatar, accounts.avatar),
  auth_state = excluded.auth_state,
  grant_state = 'granted',
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
  /** Replace the authoritative Hub grant set while preserving revoked cache. */
  reconcileGrants(accounts: readonly AccountUpsert[]): void;
  get(id: string): AccountRow | null;
  list(): AccountListRow[];
  listGranted(): AccountListRow[];
  setAuthState(id: string, authState: AccountAuthState): void;
  revokeGrant(id: string): void;
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

  function listRows(grantedOnly: boolean): AccountListRow[] {
    const rows = db
      .prepare(
        `SELECT ${COLUMNS},
           COALESCE((SELECT SUM(c.unread_count) FROM chats c WHERE c.account_id = accounts.id), 0)
             AS unread_total
         FROM accounts
         ${grantedOnly ? "WHERE grant_state = 'granted'" : ''}
         ORDER BY username ASC`,
      )
      .all();
    return rows.map((row) => ({
      ...decodeAccountRow(row),
      unreadTotal: unreadTotalSchema.parse(row).unread_total,
    }));
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

    reconcileGrants(accounts) {
      const grantedIds = new Set(accounts.map((account) => account.id));
      const revokedIds = listRows(false)
        .filter((row) => row.grantState === 'granted' && !grantedIds.has(row.id))
        .map((row) => row.id);
      const updatedAt = new Date().toISOString();
      db.transaction(() => {
        for (const account of accounts) {
          writeOne(account);
        }
        for (const id of revokedIds) {
          db.prepare(
            `UPDATE accounts
             SET grant_state = 'revoked', auth_state = 'unauthenticated', updated_at = @updated_at
             WHERE id = @id`,
          ).run({ id, updated_at: updatedAt });
        }
      });
      for (const id of new Set([...accounts.map((account) => account.id), ...revokedIds])) {
        bus.publish({ scope: 'accounts', accountId: id });
      }
    },

    get(id) {
      const row: unknown = db
        .prepare(`SELECT ${COLUMNS} FROM accounts WHERE id = @id`)
        .get({ id });
      return row === undefined ? null : decodeAccountRow(row);
    },

    list() {
      return listRows(false);
    },

    listGranted() {
      return listRows(true);
    },

    setAuthState(id, authState) {
      const { changes } = db
        .prepare(
          `UPDATE accounts SET auth_state = @auth_state, updated_at = @updated_at
           WHERE id = @id AND grant_state = 'granted'`,
        )
        .run({ id, auth_state: authState, updated_at: new Date().toISOString() });
      if (changes > 0) {
        bus.publish({ scope: 'accounts', accountId: id });
      }
    },

    revokeGrant(id) {
      const { changes } = db
        .prepare(
          `UPDATE accounts
           SET grant_state = 'revoked', auth_state = 'unauthenticated', updated_at = @updated_at
           WHERE id = @id AND (grant_state != 'revoked' OR auth_state != 'unauthenticated')`,
        )
        .run({ id, updated_at: new Date().toISOString() });
      if (changes > 0) {
        bus.publish({ scope: 'accounts', accountId: id });
      }
    },
  };
}
