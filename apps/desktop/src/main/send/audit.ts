// Outbox journal audit (P3 gate: "≥500 real sends with zero lost/duplicated
// messages — outbox journal audited"). Read-only over outbox + messages; run
// from the debug surface during the pilot and before declaring the gate.
//
// What each finding means:
// - doubleClaims: two rows resolved to the same server message id — an
//   invariant violation (the verifier's cross-claim guard exists to make this
//   impossible); any hit is a release blocker.
// - suspectDuplicates: two SENT rows in one chat with identical normalized
//   text within a short window and DIFFERENT server ids, not linked via
//   retry_of — the classic double-send incident shape. Human review required
//   (chatters legitimately re-send "ok" etc., hence the window + normalization).
// - staleUnconfirmed: indeterminate sends never resolved by the verifier —
//   each one is a potential silent loss or silent delivery; must be manually
//   reconciled (the UI offers Check now / Dismiss).
// - sentMissingFromMessages: rows claiming 'sent' whose message id is absent
//   from the local messages table. Usually benign (retention pruning, unsend
//   tombstone clearing later than the row), listed for completeness.

import type { DataLayer } from '../db/index';
import { decodeOutboxRow, type OutboxRow } from '../db/queries/outbox';

export const SUSPECT_DUPLICATE_WINDOW_MS = 120_000;
export const STALE_UNCONFIRMED_AFTER_MS = 10 * 60_000;

export interface OutboxAuditReport {
  accountId: string | null;
  totals: Record<OutboxRow['state'], number>;
  doubleClaims: { messageId: string; localIds: string[] }[];
  suspectDuplicates: {
    chatId: string;
    text: string;
    localIds: string[];
    messageIds: string[];
  }[];
  staleUnconfirmed: { localId: string; chatId: string; ageMs: number }[];
  sentMissingFromMessages: { localId: string; chatId: string; messageId: string }[];
  /** Gate headline: sent rows with exactly one claim and no duplicate suspicion. */
  cleanSends: number;
}

function normalizeText(text: string): string {
  return text.trim().replaceAll(/\s+/g, ' ');
}

export function auditOutbox(
  data: DataLayer,
  options: { accountId?: string; now?: () => number } = {},
): OutboxAuditReport {
  const now = options.now ?? Date.now;
  const where = options.accountId ? 'WHERE account_id = @account_id' : '';
  const rows = data.db
    .prepare(
      `SELECT local_id, account_id, chat_id, text, state, sequence_id, part_index, message_id,
              error_code, error_message, text_highlights, attempts, retry_of, created_at, updated_at
       FROM outbox ${where} ORDER BY created_at, rowid`,
    )
    .all(options.accountId ? { account_id: options.accountId } : {})
    .map(decodeOutboxRow);

  const totals: OutboxAuditReport['totals'] = {
    queued: 0,
    sending: 0,
    sent: 0,
    failed: 0,
    unconfirmed: 0,
    cancelled: 0,
  };
  for (const row of rows) {
    totals[row.state] += 1;
  }

  // Double claims: one server id, many rows.
  const byMessageId = new Map<string, OutboxRow[]>();
  for (const row of rows) {
    if (row.messageId !== null) {
      const list = byMessageId.get(row.messageId) ?? [];
      list.push(row);
      byMessageId.set(row.messageId, list);
    }
  }
  const doubleClaims = [...byMessageId.entries()]
    .filter(([, claimed]) => claimed.length > 1)
    .map(([messageId, claimed]) => ({
      messageId,
      localIds: claimed.map((row) => row.localId),
    }));

  // Suspect duplicates: same chat + same normalized text + distinct ids,
  // close in time, not an explicit retry chain.
  const sent = rows.filter((row) => row.state === 'sent');
  const byChatText = new Map<string, OutboxRow[]>();
  for (const row of sent) {
    const key = `${row.accountId}|${row.chatId}|${normalizeText(row.text)}`;
    const list = byChatText.get(key) ?? [];
    list.push(row);
    byChatText.set(key, list);
  }
  const suspectDuplicates: OutboxAuditReport['suspectDuplicates'] = [];
  for (const group of byChatText.values()) {
    if (group.length < 2) continue;
    const retryLinked = new Set(
      group.flatMap((row) => (row.retryOf !== null ? [row.localId, row.retryOf] : [])),
    );
    for (let i = 1; i < group.length; i += 1) {
      const a = group[i - 1];
      const b = group[i];
      if (a === undefined || b === undefined) continue;
      const close =
        Math.abs(Date.parse(b.createdAt) - Date.parse(a.createdAt)) <= SUSPECT_DUPLICATE_WINDOW_MS;
      const linked = retryLinked.has(a.localId) && retryLinked.has(b.localId);
      const distinctIds = a.messageId !== null && b.messageId !== null && a.messageId !== b.messageId;
      if (close && distinctIds && !linked) {
        suspectDuplicates.push({
          chatId: a.chatId,
          text: normalizeText(a.text),
          localIds: [a.localId, b.localId],
          messageIds: [a.messageId ?? '', b.messageId ?? ''],
        });
      }
    }
  }

  const staleUnconfirmed = rows
    .filter(
      (row) =>
        row.state === 'unconfirmed' && now() - Date.parse(row.updatedAt) >= STALE_UNCONFIRMED_AFTER_MS,
    )
    .map((row) => ({
      localId: row.localId,
      chatId: row.chatId,
      ageMs: now() - Date.parse(row.updatedAt),
    }));

  const sentMissingFromMessages = sent
    .filter(
      (row) =>
        row.messageId !== null &&
        data.messages.get(row.accountId, row.chatId, row.messageId) === null,
    )
    .map((row) => ({ localId: row.localId, chatId: row.chatId, messageId: row.messageId ?? '' }));

  const flagged = new Set<string>([
    ...doubleClaims.flatMap((finding) => finding.localIds),
    ...suspectDuplicates.flatMap((finding) => finding.localIds),
  ]);
  const cleanSends = sent.filter((row) => !flagged.has(row.localId)).length;

  return {
    accountId: options.accountId ?? null,
    totals,
    doubleClaims,
    suspectDuplicates,
    staleUnconfirmed,
    sentMissingFromMessages,
    cleanSends,
  };
}
