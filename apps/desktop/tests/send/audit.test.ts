import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DataLayer } from '@main/db/index';
import { auditOutbox, STALE_UNCONFIRMED_AFTER_MS } from '@main/send/audit';
import { ACCT, memoryDataLayer } from './helpers';

/** Audit fixtures need arbitrary states/timestamps — raw inserts on purpose
 *  (the guarded state machine is covered in outbox-queries.test.ts). */
function insertRow(
  data: DataLayer,
  row: {
    localId: string;
    chatId: string;
    text: string;
    state: string;
    messageId?: string | null;
    retryOf?: string | null;
    createdAt?: string;
    updatedAt?: string;
  },
): void {
  data.db
    .prepare(
      `INSERT INTO outbox (local_id, account_id, chat_id, text, state, sequence_id, part_index,
         message_id, error_code, error_message, text_highlights, attempts, retry_of, created_at, updated_at)
       VALUES (@local_id, @account_id, @chat_id, @text, @state, NULL, 0,
         @message_id, NULL, NULL, '[]', 1, @retry_of, @created_at, @updated_at)`,
    )
    .run({
      local_id: row.localId,
      account_id: ACCT,
      chat_id: row.chatId,
      text: row.text,
      state: row.state,
      message_id: row.messageId ?? null,
      retry_of: row.retryOf ?? null,
      created_at: row.createdAt ?? '2026-06-11T10:00:00.000Z',
      updated_at: row.updatedAt ?? row.createdAt ?? '2026-06-11T10:00:00.000Z',
    });
}

function insertMessage(data: DataLayer, chatId: string, messageId: string): void {
  data.messages.upsertMany([
    {
      accountId: ACCT,
      chatId,
      messageId,
      createdAt: '2026-06-11T10:00:01.000Z',
      isSentByMe: true,
      textHtml: '<p>x</p>',
      textPlain: 'x',
      price: 0,
      isOpened: null,
      isNew: true,
      isTip: false,
      tipAmount: null,
      tipText: null,
      replyTo: null,
      media: [],
      deleted: false,
      raw: {},
    },
  ]);
}

describe('outbox audit (P3 gate tooling)', () => {
  let data: DataLayer;
  const NOW = Date.parse('2026-06-11T12:00:00.000Z');

  beforeEach(() => {
    data = memoryDataLayer();
  });
  afterEach(() => data.close());

  it('clean journal: totals + cleanSends, no findings', () => {
    insertRow(data, { localId: 'a', chatId: '101', text: 'hey', state: 'sent', messageId: 'm1' });
    insertRow(data, { localId: 'b', chatId: '101', text: 'you there?', state: 'sent', messageId: 'm2' });
    insertRow(data, { localId: 'c', chatId: '102', text: 'nope', state: 'failed' });
    insertMessage(data, '101', 'm1');
    insertMessage(data, '101', 'm2');

    const report = auditOutbox(data, { now: () => NOW });
    expect(report.totals.sent).toBe(2);
    expect(report.totals.failed).toBe(1);
    expect(report.cleanSends).toBe(2);
    expect(report.doubleClaims).toHaveLength(0);
    expect(report.suspectDuplicates).toHaveLength(0);
    expect(report.staleUnconfirmed).toHaveLength(0);
    expect(report.sentMissingFromMessages).toHaveLength(0);
  });

  it('flags two rows claiming one server message id (invariant violation)', () => {
    insertRow(data, { localId: 'a', chatId: '101', text: 'hi', state: 'sent', messageId: 'm1' });
    insertRow(data, { localId: 'b', chatId: '101', text: 'hi', state: 'unconfirmed', messageId: 'm1' });

    const report = auditOutbox(data, { now: () => NOW });
    expect(report.doubleClaims).toEqual([{ messageId: 'm1', localIds: ['a', 'b'] }]);
  });

  it('flags same-text close-in-time distinct-id sends as suspect duplicates (double-send shape)', () => {
    insertRow(data, {
      localId: 'a', chatId: '101', text: 'hey  you', state: 'sent', messageId: 'm1',
      createdAt: '2026-06-11T10:00:00.000Z',
    });
    insertRow(data, {
      localId: 'b', chatId: '101', text: 'hey you', state: 'sent', messageId: 'm2',
      createdAt: '2026-06-11T10:01:30.000Z',
    });
    insertMessage(data, '101', 'm1');
    insertMessage(data, '101', 'm2');

    const report = auditOutbox(data, { now: () => NOW });
    expect(report.suspectDuplicates).toHaveLength(1);
    expect(report.suspectDuplicates[0]).toMatchObject({ chatId: '101', localIds: ['a', 'b'] });
    expect(report.cleanSends).toBe(0); // both flagged for human review
  });

  it('does not flag retry chains or far-apart repeats', () => {
    insertRow(data, {
      localId: 'a', chatId: '101', text: 'ok', state: 'sent', messageId: 'm1',
      createdAt: '2026-06-11T10:00:00.000Z',
    });
    // legitimate retry of a failed row — linked via retry_of
    insertRow(data, {
      localId: 'b', chatId: '101', text: 'ok', state: 'sent', messageId: 'm2', retryOf: 'a',
      createdAt: '2026-06-11T10:00:30.000Z',
    });
    // same text hours later — normal chat behavior
    insertRow(data, {
      localId: 'c', chatId: '101', text: 'ok', state: 'sent', messageId: 'm3',
      createdAt: '2026-06-11T14:00:00.000Z',
    });

    const report = auditOutbox(data, { now: () => NOW });
    expect(report.suspectDuplicates).toHaveLength(0);
  });

  it('lists unconfirmed rows older than the verifier auto-stop as stale', () => {
    insertRow(data, {
      localId: 'old', chatId: '101', text: 'x', state: 'unconfirmed',
      updatedAt: new Date(NOW - STALE_UNCONFIRMED_AFTER_MS - 1000).toISOString(),
    });
    insertRow(data, {
      localId: 'fresh', chatId: '101', text: 'y', state: 'unconfirmed',
      updatedAt: new Date(NOW - 5_000).toISOString(),
    });

    const report = auditOutbox(data, { now: () => NOW });
    expect(report.staleUnconfirmed.map((r) => r.localId)).toEqual(['old']);
  });

  it('reports sent rows whose message vanished from the local table (informational)', () => {
    insertRow(data, { localId: 'a', chatId: '101', text: 'hey', state: 'sent', messageId: 'm404' });

    const report = auditOutbox(data, { now: () => NOW });
    expect(report.sentMissingFromMessages).toEqual([
      { localId: 'a', chatId: '101', messageId: 'm404' },
    ]);
  });

  it('scopes by account when asked', () => {
    insertRow(data, { localId: 'a', chatId: '101', text: 'hey', state: 'sent', messageId: 'm1' });
    insertMessage(data, '101', 'm1');
    const report = auditOutbox(data, { accountId: 'acct_other', now: () => NOW });
    expect(report.totals.sent).toBe(0);
  });
});
