// Message store (SPEC §6.3): upsert keyed by (account, chat, message); deletions
// tombstone via the `deleted` flag (rendered "deleted", never hard-removed by
// sync); retention pruning beyond 50,000/chat (Stage 4 stop-loss ×10, D1;
// configurable). Pages are keyset-paginated on (created_at, message_id) and
// returned in ascending order.

import { z } from 'zod';
import type { ChatGooseDb } from '../database';
import type { DbChangeBus } from '../change-bus';
import { decodeMessageRow, toJson, toSqlBool } from '../rows';
import type { MessageRow, MessageUpsert } from '../rows';
import { chunked } from './fans';

// Stage 4 stop-loss: ~10× the legacy cap — the kernel holds no copy of local
// messages yet (Stages 7/11), so the desktop must stop destroying them.
export const MESSAGE_RETENTION_DEFAULT = 50000;

/**
 * D39: `is_opened` on every write — 1 whenever a purchase fact exists for the
 * row (message_facts), whichever arrived first. A fact recorded before its row
 * existed (a PPV bought in a chat that was never opened) is applied the moment
 * any read inserts the row; a stale read re-writing an opened row keeps it
 * opened (the monotonic merge below).
 */
const IS_OPENED_VALUE_SQL = `CASE WHEN EXISTS (
    SELECT 1 FROM message_facts f
    WHERE f.account_id = @account_id AND f.chat_id = @chat_id AND f.message_id = @message_id
  ) THEN 1 ELSE @is_opened END`;

const COLUMNS =
  'account_id, chat_id, message_id, created_at, is_sent_by_me, text_html, text_plain, ' +
  'price, is_opened, is_new, is_tip, tip_amount, tip_text, reply_to, media, deleted';

const UPSERT_SQL = `
INSERT INTO messages (
  account_id, chat_id, message_id, created_at, is_sent_by_me, text_html, text_plain,
  price, is_opened, is_new, is_tip, tip_amount, tip_text, reply_to, media, deleted, raw
) VALUES (
  @account_id, @chat_id, @message_id, @created_at, @is_sent_by_me, @text_html, @text_plain,
  @price, ${IS_OPENED_VALUE_SQL}, @is_new, @is_tip, @tip_amount, @tip_text, @reply_to, @media, @deleted, @raw
)
ON CONFLICT (account_id, chat_id, message_id) DO UPDATE SET
  created_at = excluded.created_at,
  is_sent_by_me = excluded.is_sent_by_me,
  text_html = excluded.text_html,
  text_plain = excluded.text_plain,
  price = excluded.price,
  is_opened = CASE
    WHEN messages.is_opened = 1 OR excluded.is_opened = 1 THEN 1
    ELSE excluded.is_opened
  END,
  is_new = excluded.is_new,
  is_tip = excluded.is_tip,
  tip_amount = excluded.tip_amount,
  tip_text = excluded.tip_text,
  reply_to = excluded.reply_to,
  media = excluded.media,
  deleted = (messages.deleted OR excluded.deleted),
  raw = excluded.raw`;

const INSERT_IF_ABSENT_SQL = `
INSERT INTO messages (
  account_id, chat_id, message_id, created_at, is_sent_by_me, text_html, text_plain,
  price, is_opened, is_new, is_tip, tip_amount, tip_text, reply_to, media, deleted, raw
) VALUES (
  @account_id, @chat_id, @message_id, @created_at, @is_sent_by_me, @text_html, @text_plain,
  @price, ${IS_OPENED_VALUE_SQL}, @is_new, @is_tip, @tip_amount, @tip_text, @reply_to, @media, @deleted, @raw
)
ON CONFLICT (account_id, chat_id, message_id) DO NOTHING`;

const MESSAGE_ORDER_DESC = 'created_at DESC, CAST(message_id AS INTEGER) DESC, message_id DESC';

export interface MessagePage {
  /** Chronological (oldest → newest) within the page. */
  items: MessageRow[];
  hasMore: boolean;
}

/** Per-chat newest activity timestamps split by sender (Spenders board
 *  «МОДЕЛЬ N Д · ФАН M Д» counters — local DB only, vendor lastReplyAt is null). */
export interface LastBySender {
  /** Newest non-deleted fan message (any kind — tips count as fan contact). */
  lastFanAt: string | null;
  /** Newest non-deleted own message. */
  lastModelAt: string | null;
}

export interface MessagesQueries {
  upsertMany(messages: readonly MessageUpsert[]): void;
  insertManyIfAbsent(messages: readonly MessageUpsert[]): number;
  get(accountId: string, chatId: string, messageId: string): MessageRow | null;
  oldest(accountId: string, chatId: string): MessageRow | null;
  page(args: { accountId: string; chatId: string; beforeId?: string; limit?: number }): MessagePage;
  /** Batched per-chat newest valid ISO timestamp split by is_sent_by_me;
   *  deleted/invalid dates excluded. Chats with no local history are absent. */
  latestBySender(accountId: string, chatIds: readonly string[]): Map<string, LastBySender>;
  /** Batched newest dated, non-deleted message per chat, with its own author
   *  and media/tip fields so a preview never joins facts from different rows. */
  newestPerChat(
    accountId: string,
    chatIds: readonly string[],
  ): Map<string, MessageRow>;
  /** Chat-list heads whose exact message has a durable local tombstone. */
  deletedChatHeadIds(accountId: string, chatIds: readonly string[]): Set<string>;
  /** Tombstone: keeps the rows, flags them deleted (SPEC §6.3). */
  markDeleted(accountId: string, chatId: string, messageIds: readonly string[]): void;
  /** Deletes rows beyond the newest `keep` for the chat; returns rows removed. */
  prune(accountId: string, chatId: string, keep?: number): number;
  count(accountId: string, chatId: string): number;
}

export function createMessagesQueries(db: ChatGooseDb, bus: DbChangeBus): MessagesQueries {
  function getOne(accountId: string, chatId: string, messageId: string): MessageRow | null {
    const row: unknown = db
      .prepare(
        `SELECT ${COLUMNS} FROM messages
         WHERE account_id = @account_id AND chat_id = @chat_id AND message_id = @message_id`,
      )
      .get({ account_id: accountId, chat_id: chatId, message_id: messageId });
    return row === undefined ? null : decodeMessageRow(row);
  }

  function publishChats(keys: Iterable<{ accountId: string; chatId: string }>): void {
    const seen = new Set<string>();
    for (const { accountId, chatId } of keys) {
      const key = `${accountId}|${chatId}`;
      if (!seen.has(key)) {
        seen.add(key);
        bus.publish({ scope: 'messages', accountId, chatId });
      }
    }
  }

  return {
    upsertMany(messages) {
      if (messages.length === 0) {
        return;
      }
      db.transaction(() => {
        for (const message of messages) {
          db.prepare(UPSERT_SQL).run({
            account_id: message.accountId,
            chat_id: message.chatId,
            message_id: message.messageId,
            created_at: message.createdAt,
            is_sent_by_me: toSqlBool(message.isSentByMe),
            text_html: message.textHtml,
            text_plain: message.textPlain,
            price: message.price,
            is_opened: message.isOpened === null ? null : toSqlBool(message.isOpened),
            is_new: toSqlBool(message.isNew),
            is_tip: toSqlBool(message.isTip),
            tip_amount: message.tipAmount,
            tip_text: message.tipText,
            reply_to: message.replyTo === null ? null : toJson(message.replyTo),
            media: toJson(message.media),
            deleted: toSqlBool(message.deleted),
            raw: toJson(message.raw),
          });
        }
      });
      publishChats(messages);
    },

    insertManyIfAbsent(messages) {
      if (messages.length === 0) {
        return 0;
      }
      const inserted: MessageUpsert[] = [];
      db.transaction(() => {
        for (const message of messages) {
          const result = db.prepare(INSERT_IF_ABSENT_SQL).run({
            account_id: message.accountId,
            chat_id: message.chatId,
            message_id: message.messageId,
            created_at: message.createdAt,
            is_sent_by_me: toSqlBool(message.isSentByMe),
            text_html: message.textHtml,
            text_plain: message.textPlain,
            price: message.price,
            is_opened: message.isOpened === null ? null : toSqlBool(message.isOpened),
            is_new: toSqlBool(message.isNew),
            is_tip: toSqlBool(message.isTip),
            tip_amount: message.tipAmount,
            tip_text: message.tipText,
            reply_to: message.replyTo === null ? null : toJson(message.replyTo),
            media: toJson(message.media),
            deleted: toSqlBool(message.deleted),
            raw: toJson(message.raw),
          });
          if (result.changes > 0) {
            inserted.push(message);
          }
        }
      });
      publishChats(inserted);
      return inserted.length;
    },

    get: getOne,

    oldest(accountId, chatId) {
      const row: unknown = db
        .prepare(
          `SELECT ${COLUMNS} FROM messages
           WHERE account_id = @account_id AND chat_id = @chat_id
           ORDER BY created_at ASC, message_id ASC LIMIT 1`,
        )
        .get({ account_id: accountId, chat_id: chatId });
      return row === undefined ? null : decodeMessageRow(row);
    },

    page({ accountId, chatId, beforeId, limit = 100 }) {
      const base = { account_id: accountId, chat_id: chatId };
      let rows: unknown[];
      if (beforeId === undefined) {
        rows = db
          .prepare(
            `SELECT ${COLUMNS} FROM messages
             WHERE account_id = @account_id AND chat_id = @chat_id
             ORDER BY ${MESSAGE_ORDER_DESC} LIMIT @limit`,
          )
          .all({ ...base, limit: limit + 1 });
      } else {
        const anchor = getOne(accountId, chatId, beforeId);
        if (anchor === null) {
          return { items: [], hasMore: false };
        }
        rows = db
          .prepare(
            `SELECT ${COLUMNS} FROM messages
             WHERE account_id = @account_id AND chat_id = @chat_id
               AND (created_at < @before_at
                 OR (created_at = @before_at AND (
                   CAST(message_id AS INTEGER) < CAST(@before_id AS INTEGER)
                   OR (
                     CAST(message_id AS INTEGER) = CAST(@before_id AS INTEGER)
                     AND message_id < @before_id
                   )
                 )))
             ORDER BY ${MESSAGE_ORDER_DESC} LIMIT @limit`,
          )
          .all({ ...base, before_at: anchor.createdAt, before_id: beforeId, limit: limit + 1 });
      }
      const hasMore = rows.length > limit;
      return {
        items: rows.slice(0, limit).map(decodeMessageRow).reverse(),
        hasMore,
      };
    },

    latestBySender(accountId, chatIds) {
      const out = new Map<string, LastBySender>();
      const rowSchema = z.object({
        chat_id: z.string(),
        last_fan_at: z.string().nullable(),
        last_model_at: z.string().nullable(),
      });
      for (const chunk of chunked(chatIds)) {
        const placeholders = chunk.map((_, i) => `@id${i}`).join(', ');
        const params: Record<string, string> = { account_id: accountId };
        chunk.forEach((id, i) => {
          params[`id${i}`] = id;
        });
        const rows: unknown[] = db
          .prepare(
            `SELECT chat_id,
               MAX(CASE WHEN is_sent_by_me = 0 THEN strftime('%Y-%m-%dT%H:%M:%fZ', created_at) END) AS last_fan_at,
               MAX(CASE WHEN is_sent_by_me = 1 THEN strftime('%Y-%m-%dT%H:%M:%fZ', created_at) END) AS last_model_at
             FROM messages
             WHERE account_id = @account_id AND deleted = 0 AND chat_id IN (${placeholders})
             GROUP BY chat_id`,
          )
          .all(params);
        for (const raw of rows) {
          const row = rowSchema.parse(raw);
          out.set(row.chat_id, { lastFanAt: row.last_fan_at, lastModelAt: row.last_model_at });
        }
      }
      return out;
    },

    newestPerChat(accountId, chatIds) {
      const out = new Map<string, MessageRow>();
      for (const chunk of chunked(chatIds)) {
        const placeholders = chunk.map((_, i) => `@id${i}`).join(', ');
        const params: Record<string, string> = { account_id: accountId };
        chunk.forEach((id, i) => {
          params[`id${i}`] = id;
        });
        // Rank row identities before loading their bodies/media. Timestamp
        // ties use the same numeric-id ordering as message paging; a bare
        // MAX row would be arbitrary on ties.
        const rows: unknown[] = db
          .prepare(
            `SELECT ${COLUMNS} FROM messages WHERE rowid IN (
               SELECT message_rowid FROM (
                 SELECT rowid AS message_rowid, ROW_NUMBER() OVER (
                   PARTITION BY chat_id
                   ORDER BY julianday(created_at) DESC, CAST(message_id AS INTEGER) DESC, message_id DESC
                 ) AS message_rank
                 FROM messages
                 WHERE account_id = @account_id AND deleted = 0
                   AND julianday(created_at) IS NOT NULL AND chat_id IN (${placeholders})
               ) WHERE message_rank = 1
             )`,
          )
          .all(params);
        for (const raw of rows) {
          const row = decodeMessageRow(raw);
          out.set(row.chatId, row);
        }
      }
      return out;
    },

    deletedChatHeadIds(accountId, chatIds) {
      const out = new Set<string>();
      const rowSchema = z.object({ chat_id: z.string() });
      for (const chunk of chunked(chatIds)) {
        const placeholders = chunk.map((_, i) => `@id${i}`).join(', ');
        const params: Record<string, string> = { account_id: accountId };
        chunk.forEach((id, i) => {
          params[`id${i}`] = id;
        });
        const rows: unknown[] = db
          .prepare(
            `SELECT c.chat_id FROM chats c
             JOIN messages m ON m.account_id = c.account_id AND m.chat_id = c.chat_id
               AND m.message_id = c.last_message_id
             WHERE c.account_id = @account_id AND m.deleted = 1
               AND c.chat_id IN (${placeholders})`,
          )
          .all(params);
        for (const raw of rows) {
          out.add(rowSchema.parse(raw).chat_id);
        }
      }
      return out;
    },

    markDeleted(accountId, chatId, messageIds) {
      if (messageIds.length === 0) {
        return;
      }
      const placeholders = messageIds.map((_, index) => `@id${index}`).join(', ');
      const params: Record<string, string> = { account_id: accountId, chat_id: chatId };
      messageIds.forEach((id, index) => {
        params[`id${index}`] = id;
      });
      const { changes } = db
        .prepare(
          `UPDATE messages SET deleted = 1
           WHERE account_id = @account_id AND chat_id = @chat_id AND message_id IN (${placeholders})`,
        )
        .run(params);
      if (changes > 0) {
        bus.publish({ scope: 'messages', accountId, chatId });
      }
    },

    prune(accountId, chatId, keep = MESSAGE_RETENTION_DEFAULT) {
      if (!Number.isInteger(keep) || keep < 0) {
        throw new Error(`prune keep must be a non-negative integer, got ${keep}`);
      }
      const { changes } = db
        .prepare(
          `DELETE FROM messages
           WHERE account_id = @account_id AND chat_id = @chat_id AND message_id NOT IN (
             SELECT message_id FROM messages
             WHERE account_id = @account_id AND chat_id = @chat_id
             ORDER BY created_at DESC, message_id DESC LIMIT @keep
           )`,
        )
        .run({ account_id: accountId, chat_id: chatId, keep });
      if (changes > 0) {
        bus.publish({ scope: 'messages', accountId, chatId });
      }
      return changes;
    },

    count(accountId, chatId) {
      const row: unknown = db
        .prepare(
          'SELECT COUNT(*) AS n FROM messages WHERE account_id = @account_id AND chat_id = @chat_id',
        )
        .get({ account_id: accountId, chat_id: chatId });
      if (typeof row === 'object' && row !== null && 'n' in row && typeof row.n === 'number') {
        return row.n;
      }
      return 0;
    },
  };
}
