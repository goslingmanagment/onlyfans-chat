// sync_intents (schema v24, D38): durable follow-up reads that hub frames
// oblige. A row exists only while its obligation is open — closing deletes it.
// Writers call these inside the frame's own transaction (hub-provider), so an
// intent and the v2 cursor that acknowledged its frame commit together.

import { z } from 'zod';
import type { ChatGooseDb } from '../database';

export type SyncIntentKind = 'account_list' | 'chat_message' | 'delete_head';

export interface SyncIntentRow {
  id: number;
  kind: SyncIntentKind;
  accountId: string;
  /** '' for account-level kinds. */
  chatId: string;
  /** '' for account_list. */
  messageId: string;
  /** account_list: the list must reflect everything up to this moment. */
  notBeforeMs: number;
  reason: string;
  /** Failed reads so far (errors, or reads that did not satisfy the intent). */
  attempts: number;
  nextAttemptMs: number;
  createdMs: number;
}

const rowSchema = z.object({
  id: z.number().int(),
  kind: z.enum(['account_list', 'chat_message', 'delete_head']),
  account_id: z.string(),
  chat_id: z.string(),
  message_id: z.string(),
  not_before_ms: z.number().int(),
  reason: z.string(),
  attempts: z.number().int(),
  next_attempt_ms: z.number().int(),
  created_ms: z.number().int(),
});

function decode(value: unknown): SyncIntentRow {
  const row = rowSchema.parse(value);
  return {
    id: row.id,
    kind: row.kind,
    accountId: row.account_id,
    chatId: row.chat_id,
    messageId: row.message_id,
    notBeforeMs: row.not_before_ms,
    reason: row.reason,
    attempts: row.attempts,
    nextAttemptMs: row.next_attempt_ms,
    createdMs: row.created_ms,
  };
}

const COLUMNS =
  'id, kind, account_id, chat_id, message_id, not_before_ms, reason, attempts, next_attempt_ms, created_ms';

export interface OpenSyncIntentArgs {
  kind: SyncIntentKind;
  accountId: string;
  chatId?: string;
  messageId?: string;
  notBeforeMs: number;
  reason: string;
  nextAttemptMs: number;
  nowMs: number;
}

export interface SyncIntentsQueries {
  /**
   * Opens an obligation, or merges into the open one with the same natural
   * key: `not_before_ms` only moves forward (a later frame widens the
   * obligation), `next_attempt_ms` keeps the earlier schedule. Returns the row
   * and whether it was newly created.
   */
  open(args: OpenSyncIntentArgs): { row: SyncIntentRow; created: boolean };
  get(id: number): SyncIntentRow | null;
  listOpen(): SyncIntentRow[];
  listOpenForAccount(accountId: string): SyncIntentRow[];
  findChatMessage(accountId: string, chatId: string, messageId: string): SyncIntentRow | null;
  close(id: number): boolean;
  recordAttempt(id: number, attempts: number, nextAttemptMs: number): void;
  /** Close every open intent of an account (grant revoked). Returns the count. */
  closeAllForAccount(accountId: string): number;
}

export function createSyncIntentsQueries(db: ChatGooseDb): SyncIntentsQueries {
  function findByKey(
    kind: SyncIntentKind,
    accountId: string,
    chatId: string,
    messageId: string,
  ): SyncIntentRow | null {
    const row: unknown = db
      .prepare(
        `SELECT ${COLUMNS} FROM sync_intents
         WHERE kind = @kind AND account_id = @account_id AND chat_id = @chat_id AND message_id = @message_id`,
      )
      .get({ kind, account_id: accountId, chat_id: chatId, message_id: messageId });
    return row === undefined ? null : decode(row);
  }

  function get(id: number): SyncIntentRow | null {
    const row: unknown = db.prepare(`SELECT ${COLUMNS} FROM sync_intents WHERE id = @id`).get({ id });
    return row === undefined ? null : decode(row);
  }

  return {
    open(args) {
      const chatId = args.chatId ?? '';
      const messageId = args.messageId ?? '';
      return db.transaction(() => {
        const existing = findByKey(args.kind, args.accountId, chatId, messageId);
        if (existing !== null) {
          if (args.notBeforeMs > existing.notBeforeMs) {
            db.prepare('UPDATE sync_intents SET not_before_ms = @not_before_ms WHERE id = @id').run({
              id: existing.id,
              not_before_ms: args.notBeforeMs,
            });
          }
          return { row: get(existing.id) ?? existing, created: false };
        }
        db
          .prepare(
            `INSERT INTO sync_intents
               (kind, account_id, chat_id, message_id, not_before_ms, reason, attempts, next_attempt_ms, created_ms)
             VALUES (@kind, @account_id, @chat_id, @message_id, @not_before_ms, @reason, 0, @next_attempt_ms, @created_ms)`,
          )
          .run({
            kind: args.kind,
            account_id: args.accountId,
            chat_id: chatId,
            message_id: messageId,
            not_before_ms: args.notBeforeMs,
            reason: args.reason,
            next_attempt_ms: args.nextAttemptMs,
            created_ms: args.nowMs,
          });
        const inserted = findByKey(args.kind, args.accountId, chatId, messageId);
        if (inserted === null) {
          throw new Error('sync intent insert did not persist');
        }
        return { row: inserted, created: true };
      });
    },
    get,
    listOpen() {
      return db
        .prepare(`SELECT ${COLUMNS} FROM sync_intents ORDER BY id`)
        .all()
        .map(decode);
    },
    listOpenForAccount(accountId) {
      return db
        .prepare(`SELECT ${COLUMNS} FROM sync_intents WHERE account_id = @account_id ORDER BY id`)
        .all({ account_id: accountId })
        .map(decode);
    },
    findChatMessage(accountId, chatId, messageId) {
      return findByKey('chat_message', accountId, chatId, messageId);
    },
    close(id) {
      return db.prepare('DELETE FROM sync_intents WHERE id = @id').run({ id }).changes > 0;
    },
    recordAttempt(id, attempts, nextAttemptMs) {
      db.prepare(
        'UPDATE sync_intents SET attempts = @attempts, next_attempt_ms = @next_attempt_ms WHERE id = @id',
      ).run({ id, attempts, next_attempt_ms: nextAttemptMs });
    },
    closeAllForAccount(accountId) {
      return db.prepare('DELETE FROM sync_intents WHERE account_id = @account_id').run({
        account_id: accountId,
      }).changes;
    },
  };
}
