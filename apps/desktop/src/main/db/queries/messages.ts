// Message store (SPEC §6.3): upsert keyed by (account, chat, message); deletions
// tombstone via the `deleted` flag (rendered "deleted", never hard-removed by
// sync); retention pruning beyond 5000/chat (configurable). Pages are keyset-
// paginated on (created_at, message_id) and returned in ascending order.

import { z } from 'zod';
import type { ChatGooseDb } from '../database';
import type { DbChangeBus } from '../change-bus';
import { decodeMessageRow, toJson, toSqlBool } from '../rows';
import type { MessageRow, MessageUpsert } from '../rows';
import { chunked } from './fans';

export const MESSAGE_RETENTION_DEFAULT = 5000;

const COLUMNS =
  'account_id, chat_id, message_id, created_at, is_sent_by_me, text_html, text_plain, ' +
  'price, is_opened, is_new, is_tip, tip_amount, tip_text, reply_to, media, deleted';

const UPSERT_SQL = `
INSERT INTO messages (
  account_id, chat_id, message_id, created_at, is_sent_by_me, text_html, text_plain,
  price, is_opened, is_new, is_tip, tip_amount, tip_text, reply_to, media, deleted, raw
) VALUES (
  @account_id, @chat_id, @message_id, @created_at, @is_sent_by_me, @text_html, @text_plain,
  @price, @is_opened, @is_new, @is_tip, @tip_amount, @tip_text, @reply_to, @media, @deleted, @raw
)
ON CONFLICT (account_id, chat_id, message_id) DO UPDATE SET
  created_at = excluded.created_at,
  is_sent_by_me = excluded.is_sent_by_me,
  text_html = excluded.text_html,
  text_plain = excluded.text_plain,
  price = excluded.price,
  is_opened = excluded.is_opened,
  is_new = excluded.is_new,
  is_tip = excluded.is_tip,
  tip_amount = excluded.tip_amount,
  tip_text = excluded.tip_text,
  reply_to = excluded.reply_to,
  media = excluded.media,
  deleted = excluded.deleted,
  raw = excluded.raw`;

export interface MessagePage {
  /** Chronological (oldest → newest) within the page. */
  items: MessageRow[];
  hasMore: boolean;
}

/** Per-chat newest activity timestamps split by sender (Supporters board
 *  «МОДЕЛЬ N Д · ФАН M Д» counters — local DB only, vendor lastReplyAt is null). */
export interface LastBySender {
  /** Newest non-deleted fan message (any kind — tips count as fan contact). */
  lastFanAt: string | null;
  /** Newest non-deleted own message. */
  lastModelAt: string | null;
}

export interface MessagesQueries {
  upsertMany(messages: readonly MessageUpsert[]): void;
  get(accountId: string, chatId: string, messageId: string): MessageRow | null;
  page(args: { accountId: string; chatId: string; beforeId?: string; limit?: number }): MessagePage;
  /** Batched per-chat MAX(created_at) split by is_sent_by_me; deleted excluded.
   *  Chats with no local history are absent from the map. */
  latestBySender(accountId: string, chatIds: readonly string[]): Map<string, LastBySender>;
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

    get: getOne,

    page({ accountId, chatId, beforeId, limit = 100 }) {
      const base = { account_id: accountId, chat_id: chatId };
      let rows: unknown[];
      if (beforeId === undefined) {
        rows = db
          .prepare(
            `SELECT ${COLUMNS} FROM messages
             WHERE account_id = @account_id AND chat_id = @chat_id
             ORDER BY created_at DESC, message_id DESC LIMIT @limit`,
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
                 OR (created_at = @before_at AND message_id < @before_id))
             ORDER BY created_at DESC, message_id DESC LIMIT @limit`,
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
               MAX(CASE WHEN is_sent_by_me = 0 THEN created_at END) AS last_fan_at,
               MAX(CASE WHEN is_sent_by_me = 1 THEN created_at END) AS last_model_at
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
