// Chat-list read models: filters all/unread/with_tips + fan-name search, shaped
// to feed ChatListItemVM (preload contract). Ordering matches the chat-list
// index: pinned first, then last_message_at DESC (NULLs last).

import type { ChatFilter } from '../../../preload/contract';
import type { ChatGooseDb } from '../database';
import type { DbChangeBus } from '../change-bus';
import { decodeChatRow, toJson, toSqlBool } from '../rows';
import type { ChatRow, ChatUpsert } from '../rows';

const COLUMNS =
  'account_id, chat_id, fan_name, avatar, unread_count, has_unread_tips, last_message_at, ' +
  'last_message_preview, last_message_is_sent_by_me, last_message_id, last_read_message_id, pinned, ' +
  'can_send_message, can_not_send_reason, updated_at';

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

const ORDER = 'ORDER BY pinned DESC, last_message_at DESC';

const FILTER_WHERE: Record<ChatFilter, string> = {
  all: '',
  unread: 'AND unread_count > 0',
  with_tips: 'AND has_unread_tips = 1',
};

function escapeLike(query: string): string {
  return query.replaceAll(/[\\%_]/g, (match) => `\\${match}`);
}

export interface ChatListPage {
  items: ChatRow[];
  hasMore: boolean;
}

export interface ChatsQueries {
  upsert(chat: ChatUpsert): void;
  upsertMany(chats: readonly ChatUpsert[]): void;
  get(accountId: string, chatId: string): ChatRow | null;
  list(args: { accountId: string; filter: ChatFilter; limit?: number; offset?: number }): ChatListPage;
  /** Case-insensitive (ASCII) substring match on fan_name. */
  search(args: { accountId: string; query: string; limit?: number }): ChatRow[];
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

    list({ accountId, filter, limit = 50, offset = 0 }) {
      const rows = db
        .prepare(
          `SELECT ${COLUMNS} FROM chats
           WHERE account_id = @account_id ${FILTER_WHERE[filter]}
           ${ORDER} LIMIT @limit OFFSET @offset`,
        )
        .all({ account_id: accountId, limit: limit + 1, offset });
      const hasMore = rows.length > limit;
      return {
        items: rows.slice(0, limit).map(decodeChatRow),
        hasMore,
      };
    },

    search({ accountId, query, limit = 50 }) {
      const pattern = `%${escapeLike(query)}%`;
      const rows = db
        .prepare(
          `SELECT ${COLUMNS} FROM chats
           WHERE account_id = @account_id AND fan_name LIKE @pattern ESCAPE '\\'
           ${ORDER} LIMIT @limit`,
        )
        .all({ account_id: accountId, pattern, limit });
      return rows.map(decodeChatRow);
    },
  };
}
