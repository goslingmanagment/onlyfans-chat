// Chat-list read models: filters all/unread/with_tips + fan-name search, shaped
// to feed ChatListItemVM (preload contract). Ordering matches the chat-list
// index: pinned first, then last_message_at DESC (NULLs last). list/search
// join the fan-value figures (DESIGN §1): lifetime from fans.spending JSON,
// 30-day NET sum from fan_transactions with a read-time rolling cutoff —
// both figures share the creator-net basis (OnlyFans reports spending net of
// its 20% cut; owner decision 2026-06-13).

import type { ChatFilter } from '../../../preload/contract';
import type { ChatGooseDb } from '../database';
import type { DbChangeBus } from '../change-bus';
import { decodeChatListRow, decodeChatRow, toJson, toSqlBool } from '../rows';
import type { ChatListRow, ChatRow, ChatUpsert } from '../rows';
import { chunked } from './fans';

const SPEND_WINDOW_MS = 30 * 24 * 60 * 60_000;

const COLUMNS =
  'account_id, chat_id, fan_name, avatar, unread_count, has_unread_tips, last_message_at, ' +
  'last_message_preview, last_message_is_sent_by_me, last_message_id, last_read_message_id, pinned, ' +
  'can_send_message, can_not_send_reason, updated_at';

const LIST_COLUMNS =
  COLUMNS.split(', ')
    .map((column) => `c.${column}`)
    .join(', ') +
  // json_valid guard: json_extract THROWS on malformed JSON (corrupt rows must
  // degrade to null, matching decodeFanRow's legacy tolerance). CAST: extract
  // yields INTEGER for whole-dollar totals, REAL otherwise — normalize so the
  // decoded type is plainly number|null.
  `, CASE WHEN f.spending IS NOT NULL AND json_valid(f.spending)
       THEN CAST(json_extract(f.spending, '$.total') AS REAL) END AS lifetime_spend,
     tx.spend_30d AS spend_30d`;

const LIST_JOINS = `
FROM chats c
LEFT JOIN fans f ON f.account_id = c.account_id AND f.fan_id = c.chat_id
LEFT JOIN (
  SELECT account_id, fan_id, SUM(net) AS spend_30d
  FROM fan_transactions
  WHERE created_at >= @spend_cutoff
  GROUP BY account_id, fan_id
) tx ON tx.account_id = c.account_id AND tx.fan_id = c.chat_id`;

const UPSERT_SQL = `
INSERT INTO chats (
  account_id, chat_id, fan_name, avatar, unread_count, has_unread_tips, last_message_at,
  last_message_preview, last_message_is_sent_by_me, last_message_id, last_read_message_id, pinned,
  can_send_message, can_not_send_reason, raw, updated_at
) VALUES (
  @account_id, @chat_id, @fan_name, @avatar, @unread_count, @has_unread_tips, @last_message_at,
  @last_message_preview, @last_message_is_sent_by_me, @last_message_id, @last_read_message_id, @pinned,
  @can_send_message, @can_not_send_reason, @raw, @updated_at
)
ON CONFLICT (account_id, chat_id) DO UPDATE SET
  fan_name = excluded.fan_name,
  avatar = excluded.avatar,
  unread_count = excluded.unread_count,
  has_unread_tips = excluded.has_unread_tips,
  last_message_at = excluded.last_message_at,
  last_message_preview = excluded.last_message_preview,
  last_message_is_sent_by_me = excluded.last_message_is_sent_by_me,
  last_message_id = excluded.last_message_id,
  last_read_message_id = excluded.last_read_message_id,
  pinned = excluded.pinned,
  can_send_message = excluded.can_send_message,
  can_not_send_reason = excluded.can_not_send_reason,
  raw = excluded.raw,
  updated_at = excluded.updated_at`;

const ORDER = 'ORDER BY c.pinned DESC, c.last_message_at DESC';

const FILTER_WHERE: Record<ChatFilter, string> = {
  all: '',
  unread: 'AND c.unread_count > 0',
  with_tips: 'AND c.has_unread_tips = 1',
};

function spendCutoffIso(): string {
  return new Date(Date.now() - SPEND_WINDOW_MS).toISOString();
}

function escapeLike(query: string): string {
  return query.replaceAll(/[\\%_]/g, (match) => `\\${match}`);
}

export interface ChatListPage {
  items: ChatListRow[];
  hasMore: boolean;
}

export interface ChatsQueries {
  upsert(chat: ChatUpsert): void;
  upsertMany(chats: readonly ChatUpsert[]): void;
  get(accountId: string, chatId: string): ChatRow | null;
  /** Batched lookup (Spenders board row join); missing chats absent from the map. */
  getMany(accountId: string, chatIds: readonly string[]): Map<string, ChatRow>;
  list(args: { accountId: string; filter: ChatFilter; limit?: number; offset?: number }): ChatListPage;
  /** Case-insensitive (ASCII) substring match on fan_name. */
  search(args: { accountId: string; query: string; limit?: number }): ChatListRow[];
}

export function createChatsQueries(db: ChatGooseDb, bus: DbChangeBus): ChatsQueries {
  function writeOne(chat: ChatUpsert): void {
    db.prepare(UPSERT_SQL).run({
      account_id: chat.accountId,
      chat_id: chat.chatId,
      fan_name: chat.fanName,
      avatar: chat.avatar,
      unread_count: chat.unreadCount,
      has_unread_tips: toSqlBool(chat.hasUnreadTips),
      last_message_at: chat.lastMessageAt,
      last_message_preview: chat.lastMessagePreview,
      last_message_is_sent_by_me: toSqlBool(chat.lastMessageIsSentByMe),
      last_message_id: chat.lastMessageId,
      last_read_message_id: chat.lastReadMessageId,
      pinned: toSqlBool(chat.pinned),
      can_send_message: toSqlBool(chat.canSendMessage),
      can_not_send_reason: chat.canNotSendReason,
      raw: toJson(chat.raw),
      updated_at: new Date().toISOString(),
    });
  }

  function publishAccounts(chats: readonly ChatUpsert[]): void {
    for (const accountId of new Set(chats.map((chat) => chat.accountId))) {
      bus.publish({ scope: 'chats', accountId });
    }
  }

  return {
    upsert(chat) {
      writeOne(chat);
      publishAccounts([chat]);
    },

    upsertMany(chats) {
      if (chats.length === 0) {
        return;
      }
      db.transaction(() => {
        for (const chat of chats) {
          writeOne(chat);
        }
      });
      publishAccounts(chats);
    },

    get(accountId, chatId) {
      const row: unknown = db
        .prepare(`SELECT ${COLUMNS} FROM chats WHERE account_id = @account_id AND chat_id = @chat_id`)
        .get({ account_id: accountId, chat_id: chatId });
      return row === undefined ? null : decodeChatRow(row);
    },

    getMany(accountId, chatIds) {
      const out = new Map<string, ChatRow>();
      for (const chunk of chunked(chatIds)) {
        const placeholders = chunk.map((_, i) => `@id${i}`).join(', ');
        const params: Record<string, string> = { account_id: accountId };
        chunk.forEach((id, i) => {
          params[`id${i}`] = id;
        });
        const rows = db
          .prepare(
            `SELECT ${COLUMNS} FROM chats WHERE account_id = @account_id AND chat_id IN (${placeholders})`,
          )
          .all(params);
        for (const raw of rows) {
          const row = decodeChatRow(raw);
          out.set(row.chatId, row);
        }
      }
      return out;
    },

    list({ accountId, filter, limit = 50, offset = 0 }) {
      const rows = db
        .prepare(
          `SELECT ${LIST_COLUMNS} ${LIST_JOINS}
           WHERE c.account_id = @account_id ${FILTER_WHERE[filter]}
           ${ORDER} LIMIT @limit OFFSET @offset`,
        )
        .all({ account_id: accountId, limit: limit + 1, offset, spend_cutoff: spendCutoffIso() });
      const hasMore = rows.length > limit;
      return {
        items: rows.slice(0, limit).map(decodeChatListRow),
        hasMore,
      };
    },

    search({ accountId, query, limit = 50 }) {
      const pattern = `%${escapeLike(query)}%`;
      const rows = db
        .prepare(
          `SELECT ${LIST_COLUMNS} ${LIST_JOINS}
           WHERE c.account_id = @account_id AND c.fan_name LIKE @pattern ESCAPE '\\'
           ${ORDER} LIMIT @limit`,
        )
        .all({ account_id: accountId, pattern, limit, spend_cutoff: spendCutoffIso() });
      return rows.map(decodeChatListRow);
    },
  };
}
