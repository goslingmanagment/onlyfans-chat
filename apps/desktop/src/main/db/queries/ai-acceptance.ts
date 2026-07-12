// Durable correlation and one-shot accounting for AI acceptance feedback.
// The renderer never chooses the metric feature: authoritative metadata is
// remembered from the coordinator's shown event (or its live completed-op
// context), then accepted by operation id in the same transaction that bumps
// ai_spend_log.inserted.

import { z } from 'zod';
import type { ChatGooseDb } from '../database';
import type { AiSpendLogQueries } from './ai-spend';

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const rowSchema = z.object({
  operation_id: z.string().min(1),
  feature: z.string().min(1),
  day: z.string().regex(DAY_PATTERN),
  request_id: z.string().nullable(),
  account_id: z.string().nullable(),
  conversation_id: z.string().nullable(),
  parts: z.string(),
  known_at: z.string().min(1),
  accepted_at: z.string().nullable(),
});

const partsSchema = z.array(z.string());

export interface AiAcceptanceKnownOperation {
  operationId: string;
  feature: string;
  day: string;
  requestId: string | null;
  accountId: string | null;
  conversationId: string | null;
  parts: readonly string[];
  knownAt: string;
}

export interface AiAcceptanceOperation extends Omit<AiAcceptanceKnownOperation, 'parts'> {
  parts: string[];
  acceptedAt: string | null;
}

export type AiAcceptanceResult =
  | { status: 'accepted' | 'duplicate'; operation: AiAcceptanceOperation }
  | { status: 'unknown' };

export interface AiAcceptanceQueries {
  /** Remember authoritative operation metadata without letting a duplicate id rewrite it. */
  remember(operation: AiAcceptanceKnownOperation): void;
  get(operationId: string): AiAcceptanceOperation | null;
  /** Atomically claim operationId and increment ai_spend_log.inserted once. */
  acceptOnce(operationId: string, acceptedAt: string): AiAcceptanceResult;
}

function decode(raw: unknown): AiAcceptanceOperation | null {
  if (raw === undefined) {
    return null;
  }
  const row = rowSchema.parse(raw);
  return {
    operationId: row.operation_id,
    feature: row.feature,
    day: row.day,
    requestId: row.request_id,
    accountId: row.account_id,
    conversationId: row.conversation_id,
    parts: partsSchema.parse(JSON.parse(row.parts)),
    knownAt: row.known_at,
    acceptedAt: row.accepted_at,
  };
}

function assertKnown(operation: AiAcceptanceKnownOperation): void {
  if (!DAY_PATTERN.test(operation.day)) {
    throw new Error(`ai_acceptance_ops day must be YYYY-MM-DD, got "${operation.day}"`);
  }
  if (operation.operationId.length === 0 || operation.feature.length === 0 || operation.knownAt.length === 0) {
    throw new Error('ai_acceptance_ops requires operationId, feature, and knownAt');
  }
}

export function createAiAcceptanceQueries(
  db: ChatGooseDb,
  aiSpendLog: Pick<AiSpendLogQueries, 'markInserted'>,
): AiAcceptanceQueries {
  const get = (operationId: string): AiAcceptanceOperation | null =>
    decode(
      db
        .prepare('SELECT * FROM ai_acceptance_ops WHERE operation_id = @operation_id')
        .get({ operation_id: operationId }),
    );

  return {
    remember(operation) {
      assertKnown(operation);
      db.prepare(
        `INSERT INTO ai_acceptance_ops (
           operation_id, feature, day, request_id, account_id,
           conversation_id, parts, known_at, accepted_at
         ) VALUES (
           @operation_id, @feature, @day, @request_id, @account_id,
           @conversation_id, @parts, @known_at, NULL
         )
         ON CONFLICT (operation_id) DO UPDATE SET
           request_id = COALESCE(ai_acceptance_ops.request_id, excluded.request_id),
           account_id = COALESCE(ai_acceptance_ops.account_id, excluded.account_id),
           conversation_id = COALESCE(ai_acceptance_ops.conversation_id, excluded.conversation_id),
           parts = CASE
             WHEN ai_acceptance_ops.accepted_at IS NULL
                  AND json_array_length(excluded.parts) > 0 THEN excluded.parts
             ELSE ai_acceptance_ops.parts
           END`,
      ).run({
        operation_id: operation.operationId,
        feature: operation.feature,
        day: operation.day,
        request_id: operation.requestId,
        account_id: operation.accountId,
        conversation_id: operation.conversationId,
        parts: JSON.stringify(operation.parts),
        known_at: operation.knownAt,
      });
    },

    get,

    acceptOnce(operationId, acceptedAt) {
      return db.transaction((): AiAcceptanceResult => {
        const operation = get(operationId);
        if (operation === null) {
          return { status: 'unknown' };
        }
        const claimed = db
          .prepare(
            `UPDATE ai_acceptance_ops
             SET accepted_at = @accepted_at,
                 parts = '[]'
             WHERE operation_id = @operation_id AND accepted_at IS NULL`,
          )
          .run({ operation_id: operationId, accepted_at: acceptedAt });
        if (claimed.changes === 0) {
          return { status: 'duplicate', operation };
        }
        // `operation` was decoded before the claim, so the caller can still
        // report which part was accepted. The durable row no longer needs to
        // retain generated reply text once correlation has been consumed.
        aiSpendLog.markInserted(operation.day, operation.feature);
        return { status: 'accepted', operation: { ...operation, acceptedAt } };
      });
    },
  };
}
