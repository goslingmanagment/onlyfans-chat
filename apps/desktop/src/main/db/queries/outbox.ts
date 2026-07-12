// Outbox rows (SPEC §7) — the send audit, kept forever (SPEC §10). Rows enter
// as 'queued' and only move forward through guarded transitions; nothing here
// can re-queue a row or claim it twice, which is what makes a second POST for
// the same row structurally impossible (SPEC §15.5). State machine:
// queued → sending → sent | failed | unconfirmed; queued|failed|unconfirmed →
// cancelled. 'sending' is persisted by the claim BEFORE any network I/O.

import { z } from 'zod';
import type { ChatGooseDb } from '../database';
import type { DbChangeBus } from '../change-bus';
import { toJson } from '../rows';

export type OutboxState = 'queued' | 'sending' | 'sent' | 'failed' | 'unconfirmed' | 'cancelled';
export type OutboxTransport = 'direct' | 'hub';

const OUTBOX_STATES = [
  'queued',
  'sending',
  'sent',
  'failed',
  'unconfirmed',
  'cancelled',
] as const satisfies readonly OutboxState[];

/** Vault media id (number) or single-use `ofapi_media_…` id (string). */
export type OutboxMediaId = string | number;

export interface OutboxRow {
  localId: string;
  accountId: string;
  chatId: string;
  text: string;
  transport: OutboxTransport;
  state: OutboxState;
  sequenceId: string | null;
  partIndex: number;
  messageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  /** CG-OF-05 raw textHighLight entries (may be the full message text). */
  textHighlights: string[];
  attempts: number;
  retryOf: string | null;
  /** Server command id returned after Hub accepted this row's clientCommandId. */
  coreCommandId: string | null;
  /** PPV price in dollars; 0 = plain text or free media message (v5). */
  price: number;
  /** Attached media ids; non-empty ⇒ this row is a media/PPV send (v5). */
  mediaFiles: OutboxMediaId[];
  /** Free-preview subset — always ⊆ mediaFiles (engine-enforced, v5). */
  previews: OutboxMediaId[];
  createdAt: string;
  updatedAt: string;
}

/** New rows always enter as 'queued'; only claimNextQueued moves them on. */
export interface OutboxInsert {
  localId: string;
  accountId: string;
  chatId: string;
  text: string;
  transport?: OutboxTransport;
  sequenceId: string | null;
  partIndex: number;
  retryOf: string | null;
  createdAt: string;
  /** PPV payload (v5); omitted ⇒ plain text row (price 0, no media). */
  price?: number;
  mediaFiles?: readonly OutboxMediaId[];
  previews?: readonly OutboxMediaId[];
}

const COLUMNS =
  'local_id, account_id, chat_id, text, transport, state, sequence_id, part_index, message_id, ' +
  'error_code, error_message, text_highlights, attempts, retry_of, core_command_id, price, ' +
  'media_files, previews, created_at, updated_at';

const outboxSqlSchema = z.object({
  local_id: z.string(),
  account_id: z.string(),
  chat_id: z.string(),
  text: z.string(),
  // Audit/export queries created before v11 may omit this additive column.
  transport: z.enum(['direct', 'hub']).default('direct'),
  state: z.enum(OUTBOX_STATES),
  sequence_id: z.string().nullable(),
  part_index: z.number().int(),
  message_id: z.string().nullable(),
  error_code: z.string().nullable(),
  error_message: z.string().nullable(),
  text_highlights: z.string(),
  attempts: z.number().int(),
  retry_of: z.string().nullable(),
  // Audit/export queries created before v16 may omit this additive column.
  core_command_id: z.string().nullable().default(null),
  price: z.number(),
  media_files: z.string(),
  previews: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const highlightsSchema = z.array(z.string());
const mediaIdsSchema = z.array(z.union([z.string(), z.number()]));

export function decodeOutboxRow(value: unknown): OutboxRow {
  const row = outboxSqlSchema.parse(value);
  const highlightsJson: unknown = JSON.parse(row.text_highlights);
  const mediaFilesJson: unknown = JSON.parse(row.media_files);
  const previewsJson: unknown = JSON.parse(row.previews);
  return {
    localId: row.local_id,
    accountId: row.account_id,
    chatId: row.chat_id,
    text: row.text,
    transport: row.transport,
    state: row.state,
    sequenceId: row.sequence_id,
    partIndex: row.part_index,
    messageId: row.message_id,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    textHighlights: highlightsSchema.parse(highlightsJson),
    attempts: row.attempts,
    retryOf: row.retry_of,
    coreCommandId: row.core_command_id,
    price: row.price,
    mediaFiles: mediaIdsSchema.parse(mediaFilesJson),
    previews: mediaIdsSchema.parse(previewsJson),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface OutboxTransitionArgs {
  localId: string;
  /** Guard: the transition applies only when the row is currently in one of these. */
  from: readonly OutboxState[];
  to: OutboxState;
  messageId?: string;
  errorCode?: string;
  errorMessage?: string;
  textHighlights?: readonly string[];
}

export interface OutboxQueries {
  insertMany(rows: readonly OutboxInsert[]): void;
  /** Atomically supersede one failed row with its queued retry. If inserting
   *  the replacement fails, the original row remains failed/retryable. */
  replaceFailedWithRetry(originalLocalId: string, retry: OutboxInsert): boolean;
  get(localId: string): OutboxRow | null;
  /** Guarded transition; false (no write) when the row is missing or not in `from`. */
  transition(args: OutboxTransitionArgs): boolean;
  /** Records the Hub command id once core accepted this row's clientCommandId. */
  setCoreCommandId(localId: string, coreCommandId: string): boolean;
  /** Most recent `limit` rows for the chat, chronological (insertion order) within the page. */
  listForChat(accountId: string, chatId: string, limit?: number): OutboxRow[];
  listByState(state: OutboxState): OutboxRow[];
  /** Insertion-ordered (oldest first) — the verifier's claim order. */
  listByStateForChat(accountId: string, chatId: string, state: OutboxState): OutboxRow[];
  /**
   * Atomically claims the chat's oldest queued row: queued → sending,
   * attempts+1 — persisted BEFORE the caller's POST (SPEC §7.1). The single
   * gateway into 'sending': a row can be claimed at most once.
   */
  claimNextQueued(accountId: string, chatId: string): OutboxRow | null;
  hasQueuedInSequence(accountId: string, sequenceId: string): boolean;
  /** Remaining queued rows of the sequence → cancelled; returns rows changed. */
  cancelQueuedInSequence(accountId: string, sequenceId: string): number;
  /** message_ids already claimed by this chat's rows (verifier cross-claim guard). */
  claimedMessageIds(accountId: string, chatId: string): Set<string>;
  /** Distinct chats having rows in `state` (boot reconcile / periodic verify). */
  chatsWithState(state: OutboxState): { accountId: string; chatId: string }[];
}

const INSERT_SQL = `
INSERT INTO outbox (
  local_id, account_id, chat_id, text, transport, state, sequence_id, part_index,
  message_id, error_code, error_message, text_highlights, attempts, retry_of,
  price, media_files, previews, created_at, updated_at
) VALUES (
  @local_id, @account_id, @chat_id, @text, @transport, 'queued', @sequence_id, @part_index,
  NULL, NULL, NULL, '[]', 0, @retry_of,
  @price, @media_files, @previews, @created_at, @created_at
)`;

export function createOutboxQueries(db: ChatGooseDb, bus: DbChangeBus): OutboxQueries {
  function getOne(localId: string): OutboxRow | null {
    const row: unknown = db
      .prepare(`SELECT ${COLUMNS} FROM outbox WHERE local_id = @local_id`)
      .get({ local_id: localId });
    return row === undefined ? null : decodeOutboxRow(row);
  }

  function publish(accountId: string, chatId: string): void {
    bus.publish({ scope: 'outbox', accountId, chatId });
  }

  function insertRow(row: OutboxInsert): void {
    db.prepare(INSERT_SQL).run({
      local_id: row.localId,
      account_id: row.accountId,
      chat_id: row.chatId,
      text: row.text,
      transport: row.transport ?? 'hub',
      sequence_id: row.sequenceId,
      part_index: row.partIndex,
      retry_of: row.retryOf,
      price: row.price ?? 0,
      media_files: toJson(row.mediaFiles ?? []),
      previews: toJson(row.previews ?? []),
      created_at: row.createdAt,
    });
  }

  return {
    insertMany(rows) {
      if (rows.length === 0) {
        return;
      }
      db.transaction(() => {
        for (const row of rows) {
          insertRow(row);
        }
      });
      const seen = new Set<string>();
      for (const row of rows) {
        const key = `${row.accountId}|${row.chatId}`;
        if (!seen.has(key)) {
          seen.add(key);
          publish(row.accountId, row.chatId);
        }
      }
    },

    replaceFailedWithRetry(originalLocalId, retry) {
      if (retry.retryOf !== originalLocalId) {
        throw new Error('Retry row must reference the failed row it supersedes');
      }
      const replaced = db.transaction(() => {
        const { changes } = db
          .prepare(
            `UPDATE outbox
             SET state = 'cancelled', updated_at = @updated_at
             WHERE local_id = @local_id AND account_id = @account_id
               AND chat_id = @chat_id AND state = 'failed'`,
          )
          .run({
            local_id: originalLocalId,
            account_id: retry.accountId,
            chat_id: retry.chatId,
            updated_at: retry.createdAt,
          });
        if (changes !== 1) {
          return false;
        }
        insertRow(retry);
        return true;
      });
      if (replaced) {
        publish(retry.accountId, retry.chatId);
      }
      return replaced;
    },

    get: getOne,

    transition({ localId, from, to, messageId, errorCode, errorMessage, textHighlights }) {
      const row = getOne(localId);
      if (row === null || !from.includes(row.state)) {
        return false;
      }
      const fromPlaceholders = from.map((_, index) => `@from${index}`).join(', ');
      const params: Record<string, string | number | null> = {
        local_id: localId,
        to,
        message_id: messageId ?? null,
        error_code: errorCode ?? null,
        error_message: errorMessage ?? null,
        text_highlights: textHighlights === undefined ? null : toJson(textHighlights),
        updated_at: new Date().toISOString(),
      };
      from.forEach((state, index) => {
        params[`from${index}`] = state;
      });
      const { changes } = db
        .prepare(
          `UPDATE outbox SET
             state = @to,
             message_id = COALESCE(@message_id, message_id),
             error_code = COALESCE(@error_code, error_code),
             error_message = COALESCE(@error_message, error_message),
             text_highlights = COALESCE(@text_highlights, text_highlights),
             updated_at = @updated_at
           WHERE local_id = @local_id AND state IN (${fromPlaceholders})`,
        )
        .run(params);
      if (changes === 0) {
        return false;
      }
      publish(row.accountId, row.chatId);
      return true;
    },

    setCoreCommandId(localId, coreCommandId) {
      const row = getOne(localId);
      if (row === null) {
        return false;
      }
      const { changes } = db
        .prepare(
          `UPDATE outbox
           SET core_command_id = COALESCE(core_command_id, @core_command_id),
               updated_at = @updated_at
           WHERE local_id = @local_id`,
        )
        .run({
          local_id: localId,
          core_command_id: coreCommandId,
          updated_at: new Date().toISOString(),
        });
      if (changes === 0) {
        return false;
      }
      publish(row.accountId, row.chatId);
      return true;
    },

    listForChat(accountId, chatId, limit = 50) {
      const rows = db
        .prepare(
          `SELECT ${COLUMNS} FROM outbox
           WHERE account_id = @account_id AND chat_id = @chat_id
           ORDER BY rowid DESC LIMIT @limit`,
        )
        .all({ account_id: accountId, chat_id: chatId, limit });
      return rows.map(decodeOutboxRow).reverse();
    },

    listByState(state) {
      const rows = db
        .prepare(`SELECT ${COLUMNS} FROM outbox WHERE state = @state ORDER BY rowid`)
        .all({ state });
      return rows.map(decodeOutboxRow);
    },

    listByStateForChat(accountId, chatId, state) {
      const rows = db
        .prepare(
          `SELECT ${COLUMNS} FROM outbox
           WHERE account_id = @account_id AND chat_id = @chat_id AND state = @state
           ORDER BY rowid`,
        )
        .all({ account_id: accountId, chat_id: chatId, state });
      return rows.map(decodeOutboxRow);
    },

    claimNextQueued(accountId, chatId) {
      // rowid order = insertion order: created_at can collide inside one tick
      // (multi-part inserts, fake timers), part_index alone can't order across
      // sequences — insertion order is the FIFO truth.
      const claimed = db.transaction(() => {
        const candidate: unknown = db
          .prepare(
            `SELECT ${COLUMNS} FROM outbox
             WHERE account_id = @account_id AND chat_id = @chat_id AND state = 'queued'
             ORDER BY rowid LIMIT 1`,
          )
          .get({ account_id: accountId, chat_id: chatId });
        if (candidate === undefined) {
          return null;
        }
        const row = decodeOutboxRow(candidate);
        const { changes } = db
          .prepare(
            `UPDATE outbox
             SET state = 'sending', attempts = attempts + 1, updated_at = @updated_at
             WHERE local_id = @local_id AND state = 'queued'`,
          )
          .run({ local_id: row.localId, updated_at: new Date().toISOString() });
        return changes === 1 ? getOne(row.localId) : null;
      });
      if (claimed !== null) {
        publish(claimed.accountId, claimed.chatId);
      }
      return claimed;
    },

    hasQueuedInSequence(accountId, sequenceId) {
      const row: unknown = db
        .prepare(
          `SELECT 1 AS one FROM outbox
           WHERE account_id = @account_id AND sequence_id = @sequence_id AND state = 'queued'
           LIMIT 1`,
        )
        .get({ account_id: accountId, sequence_id: sequenceId });
      return row !== undefined;
    },

    cancelQueuedInSequence(accountId, sequenceId) {
      const chats = db
        .prepare(
          `SELECT DISTINCT chat_id FROM outbox
           WHERE account_id = @account_id AND sequence_id = @sequence_id AND state = 'queued'`,
        )
        .all({ account_id: accountId, sequence_id: sequenceId })
        .map((raw) => z.object({ chat_id: z.string() }).parse(raw).chat_id);
      const { changes } = db
        .prepare(
          `UPDATE outbox SET state = 'cancelled', updated_at = @updated_at
           WHERE account_id = @account_id AND sequence_id = @sequence_id AND state = 'queued'`,
        )
        .run({
          account_id: accountId,
          sequence_id: sequenceId,
          updated_at: new Date().toISOString(),
        });
      if (changes > 0) {
        for (const chatId of chats) {
          publish(accountId, chatId);
        }
      }
      return changes;
    },

    claimedMessageIds(accountId, chatId) {
      const rows = db
        .prepare(
          `SELECT message_id FROM outbox
           WHERE account_id = @account_id AND chat_id = @chat_id AND message_id IS NOT NULL`,
        )
        .all({ account_id: accountId, chat_id: chatId });
      return new Set(rows.map((raw) => z.object({ message_id: z.string() }).parse(raw).message_id));
    },

    chatsWithState(state) {
      const rows = db
        .prepare(
          'SELECT DISTINCT account_id, chat_id FROM outbox WHERE state = @state ORDER BY account_id, chat_id',
        )
        .all({ state });
      return rows.map((raw) => {
        const parsed = z.object({ account_id: z.string(), chat_id: z.string() }).parse(raw);
        return { accountId: parsed.account_id, chatId: parsed.chat_id };
      });
    },
  };
}
