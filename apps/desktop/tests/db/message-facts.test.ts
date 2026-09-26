// D39 purchase facts (schema v25): a PPV unlock is recorded whichever arrives
// first — the fact or its message row — and every message write consults it.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DataLayer, DbChangedEvent, PpvUnlockFact } from '@main/db/index';
import { memoryDataLayer, sampleMessage } from './helpers';

const CREATOR_ID = '514788334'; // INC-001: the creator's id shipped as the chat

function fact(overrides: Partial<PpvUnlockFact> = {}): PpvUnlockFact {
  return {
    accountId: 'acct_1',
    chatId: '101',
    messageId: 'm1',
    hubAccountId: 9,
    accountSeq: 100,
    amountUsd: 25,
    provenance: 'live',
    occurredAt: '2026-09-26T14:37:00.000Z',
    source: 'stream',
    ...overrides,
  };
}

const RECORDED_AT = '2026-09-26T14:37:02.000Z';

let layer: DataLayer;
let flushed: DbChangedEvent[];

beforeEach(() => {
  layer = memoryDataLayer();
  flushed = [];
  layer.bus.subscribe((events) => flushed.push(...events));
});

afterEach(() => {
  layer.close();
});

describe('message facts (D39)', () => {
  it('row before fact: recording opens the cached PPV and says the fact is new', () => {
    layer.messages.upsertMany([sampleMessage({ isSentByMe: true, price: 25, isOpened: false })]);
    layer.bus.flushNow();
    flushed = [];

    expect(layer.messageFacts.recordPpvUnlock(fact(), RECORDED_AT))
      .toEqual({ newFact: true, rowOpened: true, superseded: 0 });
    expect(layer.messages.get('acct_1', '101', 'm1')?.isOpened).toBe(true);
    layer.bus.flushNow();
    expect(flushed).toEqual([{ scope: 'messages', accountId: 'acct_1', chatId: '101' }]);

    // The same fact again (a replay, the catch-up) is not new and changes nothing.
    flushed = [];
    expect(layer.messageFacts.recordPpvUnlock(fact({ source: 'catch-up' }), RECORDED_AT))
      .toEqual({ newFact: false, rowOpened: false, superseded: 0 });
    layer.bus.flushNow();
    expect(flushed).toEqual([]);
    expect(layer.messageFacts.countByAccount('acct_1')).toBe(1);
  });

  it('fact before row: any later insert of the row lands opened (upsert and insert-if-absent)', () => {
    expect(layer.messageFacts.recordPpvUnlock(fact(), RECORDED_AT))
      .toEqual({ newFact: true, rowOpened: false, superseded: 0 });
    expect(layer.messageFacts.recordPpvUnlock(fact({ messageId: 'm2' }), RECORDED_AT).newFact).toBe(true);

    // A tail read of a chat that was never open: OFAPI still says "not opened".
    layer.messages.upsertMany([sampleMessage({ isSentByMe: true, price: 25, isOpened: false })]);
    expect(layer.messages.get('acct_1', '101', 'm1')?.isOpened).toBe(true);
    // The send engine's / hub command stub path.
    expect(layer.messages.insertManyIfAbsent([
      sampleMessage({ messageId: 'm2', isSentByMe: true, price: 25, isOpened: null }),
    ])).toBe(1);
    expect(layer.messages.get('acct_1', '101', 'm2')?.isOpened).toBe(true);
    // No fact, no change: another message keeps OFAPI's answer.
    layer.messages.upsertMany([sampleMessage({ messageId: 'm3', isSentByMe: true, price: 25, isOpened: false })]);
    expect(layer.messages.get('acct_1', '101', 'm3')?.isOpened).toBe(false);
    // A fact is per (account, chat, message).
    layer.messages.upsertMany([sampleMessage({ chatId: '102', isSentByMe: true, price: 25, isOpened: false })]);
    expect(layer.messages.get('acct_1', '102', 'm1')?.isOpened).toBe(false);
  });

  it('a stale re-read after the fact never un-opens the row', () => {
    layer.messages.upsertMany([sampleMessage({ isSentByMe: true, price: 25, isOpened: false })]);
    layer.messageFacts.recordPpvUnlock(fact(), RECORDED_AT);
    for (const isOpened of [false, null] as const) {
      layer.messages.upsertMany([sampleMessage({ isSentByMe: true, price: 25, isOpened })]);
      expect(layer.messages.get('acct_1', '101', 'm1')?.isOpened).toBe(true);
    }
  });

  it('a repair fact replaces the superseded wrong-chat fact of the same message', () => {
    // The 2026-07 events: the creator's id as the conversation.
    expect(layer.messageFacts.recordPpvUnlock(
      fact({ chatId: CREATOR_ID, source: 'catch-up', accountSeq: 1107 }),
      RECORDED_AT,
    ).newFact).toBe(true);
    layer.messages.upsertMany([
      sampleMessage({ chatId: '15544628', messageId: 'm1', isSentByMe: true, price: 25, isOpened: false }),
    ]);
    expect(layer.messages.get('acct_1', '15544628', 'm1')?.isOpened).toBe(false);

    const repaired = layer.messageFacts.recordPpvUnlock(
      fact({ chatId: '15544628', provenance: 'repair', accountSeq: 260001 }),
      RECORDED_AT,
    );
    expect(repaired).toEqual({ newFact: true, rowOpened: true, superseded: 1 });
    expect(layer.messageFacts.has('acct_1', CREATOR_ID, 'm1')).toBe(false);
    expect(layer.messageFacts.has('acct_1', '15544628', 'm1')).toBe(true);
    // Count stays equal to Core's non-superseded facts: one per purchase.
    expect(layer.messageFacts.countByAccount('acct_1')).toBe(1);

    // A non-repair fact never removes anything.
    layer.messageFacts.recordPpvUnlock(fact({ chatId: CREATOR_ID, messageId: 'm9' }), RECORDED_AT);
    expect(layer.messageFacts.recordPpvUnlock(
      fact({ chatId: '777', messageId: 'm9', provenance: 'live' }),
      RECORDED_AT,
    ).superseded).toBe(0);
    expect(layer.messageFacts.countByAccount('acct_1')).toBe(3);
  });

  it('a later delivery fills what the first one lacked, never overwrites', () => {
    layer.messageFacts.recordPpvUnlock(fact({ amountUsd: null, accountSeq: null }), RECORDED_AT);
    layer.messageFacts.recordPpvUnlock(fact({ amountUsd: 89, accountSeq: 100 }), RECORDED_AT);
    layer.messageFacts.recordPpvUnlock(fact({ amountUsd: 1, accountSeq: 5 }), RECORDED_AT);
    expect(
      layer.db
        .prepare("SELECT amount_usd, account_seq, source FROM message_facts WHERE message_id = 'm1'")
        .get(),
    ).toEqual({ amount_usd: 89, account_seq: 100, source: 'stream' });
  });

  it('counts per account', () => {
    layer.messageFacts.recordPpvUnlock(fact(), RECORDED_AT);
    layer.messageFacts.recordPpvUnlock(fact({ accountId: 'acct_2' }), RECORDED_AT);
    layer.messageFacts.recordPpvUnlock(fact({ accountId: 'acct_2', messageId: 'm2' }), RECORDED_AT);
    expect(layer.messageFacts.countByAccount('acct_1')).toBe(1);
    expect(layer.messageFacts.countByAccount('acct_2')).toBe(2);
    expect(layer.messageFacts.countByAccount('acct_none')).toBe(0);
  });
});
