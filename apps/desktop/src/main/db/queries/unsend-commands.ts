// Durable lineage for Hub unsend commands. A single nonterminal row per
// platform message survives runtime replacement/restart and carries both the
// stable client id used for idempotent intake and Core's accepted command id.

import { z } from 'zod';
import type { ChatGooseDb } from '../database';

const rowSchema = z.object({
  account_id: z.string().min(1),
  chat_id: z.string().min(1),
  message_id: z.string().min(1),
  client_command_id: z.string().min(1),
  core_command_id: z.string().nullable(),
  created_at: z.string().min(1),
});

export interface UnsendCommandRow {
  accountId: string;
  chatId: string;
  messageId: string;
  clientCommandId: string;
  coreCommandId: string | null;
  createdAt: string;
}

export interface UnsendCommandInsert {
  accountId: string;
  chatId: string;
  messageId: string;
  clientCommandId: string;
  createdAt: string;
}

export interface UnsendCommandQueries {
  get(accountId: string, chatId: string, messageId: string): UnsendCommandRow | null;
  ensure(input: UnsendCommandInsert): UnsendCommandRow;
  setCoreCommandId(accountId: string, chatId: string, messageId: string, coreCommandId: string): void;
  listPending(): UnsendCommandRow[];
  remove(accountId: string, chatId: string, messageId: string): void;
}

function decode(value: unknown): UnsendCommandRow | null {
  if (value === undefined) {
    return null;
  }
  const row = rowSchema.parse(value);
  return {
    accountId: row.account_id,
    chatId: row.chat_id,
    messageId: row.message_id,
    clientCommandId: row.client_command_id,
    coreCommandId: row.core_command_id,
    createdAt: row.created_at,
  };
}

export function createUnsendCommandQueries(db: ChatGooseDb): UnsendCommandQueries {
  const get = (accountId: string, chatId: string, messageId: string): UnsendCommandRow | null =>
    decode(
      db
        .prepare(
          `SELECT * FROM unsend_commands
           WHERE account_id = @account_id AND chat_id = @chat_id AND message_id = @message_id`,
        )
        .get({ account_id: accountId, chat_id: chatId, message_id: messageId }),
    );

  return {
    get,

    ensure(input) {
      db.prepare(
        `INSERT INTO unsend_commands (
           account_id, chat_id, message_id, client_command_id, core_command_id, created_at
         ) VALUES (
           @account_id, @chat_id, @message_id, @client_command_id, NULL, @created_at
         )
         ON CONFLICT (account_id, chat_id, message_id) DO NOTHING`,
      ).run({
        account_id: input.accountId,
        chat_id: input.chatId,
        message_id: input.messageId,
        client_command_id: input.clientCommandId,
        created_at: input.createdAt,
      });
      const row = get(input.accountId, input.chatId, input.messageId);
      if (row === null) {
        throw new Error('Failed to persist unsend command lineage');
      }
      return row;
    },

    setCoreCommandId(accountId, chatId, messageId, coreCommandId) {
      db.prepare(
        `UPDATE unsend_commands
         SET core_command_id = COALESCE(core_command_id, @core_command_id)
         WHERE account_id = @account_id AND chat_id = @chat_id AND message_id = @message_id`,
      ).run({
        account_id: accountId,
        chat_id: chatId,
        message_id: messageId,
        core_command_id: coreCommandId,
      });
    },

    listPending() {
      return db
        .prepare('SELECT * FROM unsend_commands ORDER BY created_at, account_id, chat_id, message_id')
        .all()
        .map((value) => decode(value))
        .filter((row): row is UnsendCommandRow => row !== null);
    },

    remove(accountId, chatId, messageId) {
      db.prepare(
        `DELETE FROM unsend_commands
         WHERE account_id = @account_id AND chat_id = @chat_id AND message_id = @message_id`,
      ).run({ account_id: accountId, chat_id: chatId, message_id: messageId });
    },
  };
}
