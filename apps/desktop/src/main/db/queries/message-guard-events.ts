import { z } from 'zod';
import type { GuardAuditEvent, GuardCategory } from '@chatgoose/shared/message-guard/index';
import type { ChatGooseDb } from '../database';
import type { DbChangeBus } from '../change-bus';

export interface MessageGuardRecentEvent {
  id: string;
  occurredAt: string;
  accountId: string;
  chatId: string;
  surface: string;
  transport: string | null;
  decision: 'blocked' | 'warned' | 'sent_after_warning';
  policyVersion: string;
  category: GuardCategory;
  ruleId: string;
  ruleLabel: string;
  messageHash: string;
  mediaCount: number;
  price: number;
}

export interface MessageGuardBlocksReport {
  total: number;
  byDecision: Record<string, number>;
  byCategory: Record<string, number>;
  byRule: Record<string, number>;
  recent: MessageGuardRecentEvent[];
}

export interface MessageGuardEventsQueries {
  insert(event: GuardAuditEvent): void;
  pruneOlderThan(cutoffIso: string): number;
  count(): number;
  report(args?: { accountId?: string; limit?: number }): MessageGuardBlocksReport;
}

const countRowSchema = z.object({ n: z.number().int().nonnegative() });
const bucketRowSchema = z.object({ key: z.string(), n: z.number().int().nonnegative() });
const recentRowSchema = z.object({
  id: z.string(),
  occurred_at: z.string(),
  account_id: z.string(),
  chat_id: z.string(),
  surface: z.string(),
  transport: z.string().nullable(),
  decision: z.enum(['blocked', 'warned', 'sent_after_warning']),
  policy_version: z.string(),
  category: z.enum(['off_platform', 'red', 'yellow', 'custom']),
  rule_id: z.string(),
  rule_label: z.string(),
  message_hash: z.string(),
  media_count: z.number().int(),
  price: z.number(),
});

function bucket(rows: unknown[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const raw of rows) {
    const row = bucketRowSchema.parse(raw);
    out[row.key] = row.n;
  }
  return out;
}

function scopeClause(accountId: string | undefined): string {
  return accountId === undefined ? '' : 'WHERE account_id = @account_id';
}

export function createMessageGuardEventsQueries(
  db: ChatGooseDb,
  bus: DbChangeBus,
): MessageGuardEventsQueries {
  return {
    insert(event) {
      db.prepare(
        `INSERT INTO message_guard_events (
          id, occurred_at, actor_user_id, actor_label, account_id, chat_id,
          surface, transport, decision, policy_version, category, rule_id,
          rule_label, matched_original, matched_normalized, span_start, span_end,
          message_text, message_hash, media_count, price
        ) VALUES (
          @id, @occurred_at, @actor_user_id, @actor_label, @account_id, @chat_id,
          @surface, @transport, @decision, @policy_version, @category, @rule_id,
          @rule_label, @matched_original, @matched_normalized, @span_start, @span_end,
          @message_text, @message_hash, @media_count, @price
        )`,
      ).run({
        id: event.id,
        occurred_at: event.occurredAt,
        actor_user_id: event.actorUserId,
        actor_label: event.actorLabel,
        account_id: event.accountId,
        chat_id: event.chatId,
        surface: event.surface,
        transport: event.transport,
        decision: event.decision,
        policy_version: event.policyVersion,
        category: event.category,
        rule_id: event.ruleId,
        rule_label: event.ruleLabel,
        matched_original: event.matchedOriginal,
        matched_normalized: event.matchedNormalized,
        span_start: event.spanStart,
        span_end: event.spanEnd,
        message_text: event.messageText,
        message_hash: event.messageHash,
        media_count: event.mediaCount,
        price: event.price,
      });
      bus.publish({ scope: 'guard', accountId: event.accountId, chatId: event.chatId });
    },

    pruneOlderThan(cutoffIso) {
      const { changes } = db
        .prepare('DELETE FROM message_guard_events WHERE occurred_at < @cutoff')
        .run({ cutoff: cutoffIso });
      if (changes > 0) {
        bus.publish({ scope: 'guard' });
      }
      return changes;
    },

    count() {
      const row = db.prepare('SELECT COUNT(*) AS n FROM message_guard_events').get();
      return countRowSchema.parse(row).n;
    },

    report(args = {}) {
      const limit = Math.max(1, Math.min(args.limit ?? 50, 200));
      const params = {
        account_id: args.accountId ?? null,
        limit,
      };
      const where = scopeClause(args.accountId);
      const total = countRowSchema.parse(
        db.prepare(`SELECT COUNT(*) AS n FROM message_guard_events ${where}`).get(params),
      ).n;
      const byDecision = bucket(
        db
          .prepare(
            `SELECT decision AS key, COUNT(*) AS n
             FROM message_guard_events ${where}
             GROUP BY decision ORDER BY n DESC`,
          )
          .all(params),
      );
      const byCategory = bucket(
        db
          .prepare(
            `SELECT category AS key, COUNT(*) AS n
             FROM message_guard_events ${where}
             GROUP BY category ORDER BY n DESC`,
          )
          .all(params),
      );
      const byRule = bucket(
        db
          .prepare(
            `SELECT rule_id AS key, COUNT(*) AS n
             FROM message_guard_events ${where}
             GROUP BY rule_id ORDER BY n DESC`,
          )
          .all(params),
      );
      const recent = db
        .prepare(
          `SELECT id, occurred_at, account_id, chat_id, surface, transport, decision,
                  policy_version, category, rule_id, rule_label, message_hash,
                  media_count, price
           FROM message_guard_events ${where}
           ORDER BY occurred_at DESC
           LIMIT @limit`,
        )
        .all(params)
        .map((raw) => {
          const row = recentRowSchema.parse(raw);
          return {
            id: row.id,
            occurredAt: row.occurred_at,
            accountId: row.account_id,
            chatId: row.chat_id,
            surface: row.surface,
            transport: row.transport,
            decision: row.decision,
            policyVersion: row.policy_version,
            category: row.category,
            ruleId: row.rule_id,
            ruleLabel: row.rule_label,
            messageHash: row.message_hash,
            mediaCount: row.media_count,
            price: row.price,
          };
        });
      return { total, byDecision, byCategory, byRule, recent };
    },
  };
}
