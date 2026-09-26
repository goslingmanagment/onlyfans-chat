// D39 purchase facts (schema v25): Core's `message.ppv_unlocked` facts keyed
// by the message they unlock. Recording one is the old `markOpened` made
// durable: the fact survives the absence of its message row, every later
// message write consults it (messages.ts), and the caller learns whether the
// fact was new to this device (alerts and acceptance logs need that).

import { z } from 'zod';
import type { ChatGooseDb } from '../database';
import type { DbChangeBus } from '../change-bus';

export type MessageFactSource = 'stream' | 'catch-up';

export interface PpvUnlockFact {
  accountId: string;
  chatId: string;
  messageId: string;
  /** Core page id of the ledger row (null when the lane did not say). */
  hubAccountId: number | null;
  accountSeq: number | null;
  amountUsd: number | null;
  /** Frame provenance: live | redelivery | repair | unknown. */
  provenance: string;
  occurredAt: string | null;
  source: MessageFactSource;
}

export interface RecordPpvUnlockOutcome {
  /** No fact for this (account, chat, message) existed on this device. */
  newFact: boolean;
  /** A cached message row flipped to opened by this call. */
  rowOpened: boolean;
  /** Older facts for the same message under another chat that a repair
   *  fact replaced (the business key of a PPV fact is account + message). */
  superseded: number;
}

export interface MessageFactsQueries {
  recordPpvUnlock(fact: PpvUnlockFact, recordedAt: string): RecordPpvUnlockOutcome;
  has(accountId: string, chatId: string, messageId: string): boolean;
  /** Acceptance: local facts per account, to compare with Core's
   *  non-superseded `message.ppv_unlocked` rows of the same page. */
  countByAccount(accountId: string): number;
}

const countSchema = z.object({ n: z.number() });

export function createMessageFactsQueries(db: ChatGooseDb, bus: DbChangeBus): MessageFactsQueries {
  function has(accountId: string, chatId: string, messageId: string): boolean {
    const row: unknown = db
      .prepare(
        `SELECT 1 AS present FROM message_facts
         WHERE account_id = @account_id AND chat_id = @chat_id AND message_id = @message_id`,
      )
      .get({ account_id: accountId, chat_id: chatId, message_id: messageId });
    return row !== undefined;
  }

  return {
    recordPpvUnlock(fact, recordedAt) {
      const outcome = db.transaction((): RecordPpvUnlockOutcome => {
        let superseded = 0;
        if (fact.provenance === 'repair') {
          // Core's repair re-states a fact whose refs were wrong (INC-001:
          // the creator's id as the conversation). Its message ref is the
          // same, so the older fact is found by (account, message).
          superseded = db
            .prepare(
              `DELETE FROM message_facts
               WHERE account_id = @account_id AND message_id = @message_id AND chat_id <> @chat_id`,
            )
            .run({
              account_id: fact.accountId,
              chat_id: fact.chatId,
              message_id: fact.messageId,
            }).changes;
        }
        const newFact = !has(fact.accountId, fact.chatId, fact.messageId);
        if (newFact) {
          db.prepare(
            `INSERT INTO message_facts (
               account_id, chat_id, message_id, kind, hub_account_id, account_seq,
               amount_usd, provenance, occurred_at, source, recorded_at
             ) VALUES (
               @account_id, @chat_id, @message_id, 'ppv_unlocked', @hub_account_id, @account_seq,
               @amount_usd, @provenance, @occurred_at, @source, @recorded_at
             )`,
          ).run({
            account_id: fact.accountId,
            chat_id: fact.chatId,
            message_id: fact.messageId,
            hub_account_id: fact.hubAccountId,
            account_seq: fact.accountSeq,
            amount_usd: fact.amountUsd,
            provenance: fact.provenance,
            occurred_at: fact.occurredAt,
            source: fact.source,
            recorded_at: recordedAt,
          });
        } else {
          // A second delivery of a known fact only fills what the first one
          // lacked (an older event without amountUsd, a lane without a seq).
          db.prepare(
            `UPDATE message_facts SET
               hub_account_id = COALESCE(hub_account_id, @hub_account_id),
               account_seq = COALESCE(account_seq, @account_seq),
               amount_usd = COALESCE(amount_usd, @amount_usd)
             WHERE account_id = @account_id AND chat_id = @chat_id AND message_id = @message_id`,
          ).run({
            account_id: fact.accountId,
            chat_id: fact.chatId,
            message_id: fact.messageId,
            hub_account_id: fact.hubAccountId,
            account_seq: fact.accountSeq,
            amount_usd: fact.amountUsd,
          });
        }
        const rowOpened = db
          .prepare(
            `UPDATE messages SET is_opened = 1
             WHERE account_id = @account_id AND chat_id = @chat_id
               AND message_id = @message_id AND is_opened IS NOT 1`,
          )
          .run({
            account_id: fact.accountId,
            chat_id: fact.chatId,
            message_id: fact.messageId,
          }).changes > 0;
        return { newFact, rowOpened, superseded };
      });
      if (outcome.rowOpened) {
        bus.publish({ scope: 'messages', accountId: fact.accountId, chatId: fact.chatId });
      }
      return outcome;
    },

    has,

    countByAccount(accountId) {
      const row: unknown = db
        .prepare('SELECT COUNT(*) AS n FROM message_facts WHERE account_id = @account_id')
        .get({ account_id: accountId });
      return row === undefined ? 0 : countSchema.parse(row).n;
    },
  };
}
