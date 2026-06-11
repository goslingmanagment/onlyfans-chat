// Outbox query module (SPEC §7 / §10): guarded forward-only transitions, the
// atomic claim (the structural one-POST-per-row guarantee), FIFO ordering, and
// change-bus publication on every mutation.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DataLayer, DbChangedEvent, OutboxInsert } from '@main/db/index';
import { ACCT, CHAT, memoryDataLayer } from './helpers';

function insert(data: DataLayer, overrides: Partial<OutboxInsert> & { localId: string }): void {
  data.outbox.insertMany([
    {
      accountId: ACCT,
      chatId: CHAT,
      text: `text ${overrides.localId}`,
      sequenceId: null,
      partIndex: 0,
      retryOf: null,
      createdAt: '2026-06-11T12:00:00.000Z',
      ...overrides,
    },
  ]);
}

describe('outbox queries', () => {
  let data: DataLayer;
  let events: DbChangedEvent[];

  beforeEach(() => {
    data = memoryDataLayer();
    events = [];
    data.bus.subscribe((batch) => events.push(...batch));
  });

  afterEach(() => {
    data.close();
  });

  it('inserts queued rows with defaults and round-trips the codec', () => {
    insert(data, { localId: 'L1', sequenceId: 'seq', partIndex: 2, retryOf: 'L0' });
    const row = data.outbox.get('L1');
    expect(row).toEqual({
      localId: 'L1',
      accountId: ACCT,
      chatId: CHAT,
      text: 'text L1',
      state: 'queued',
      sequenceId: 'seq',
      partIndex: 2,
      messageId: null,
      errorCode: null,
      errorMessage: null,
      textHighlights: [],
      attempts: 0,
      retryOf: 'L0',
      price: 0,
      mediaFiles: [],
      previews: [],
      createdAt: '2026-06-11T12:00:00.000Z',
      updatedAt: '2026-06-11T12:00:00.000Z',
    });
    data.bus.flushNow();
    expect(events).toContainEqual({ scope: 'outbox', accountId: ACCT, chatId: CHAT });
  });

  it('round-trips the v5 PPV payload (price + mixed-form media ids)', () => {
    data.outbox.insertMany([
      {
        localId: 'P1',
        accountId: ACCT,
        chatId: CHAT,
        text: 'ppv caption',
        sequenceId: null,
        partIndex: 0,
        retryOf: null,
        createdAt: '2026-06-11T12:00:00.000Z',
        price: 25,
        mediaFiles: [3866342509, 'ofapi_media_abc'],
        previews: [3866342509],
      },
    ]);
    expect(data.outbox.get('P1')).toMatchObject({
      price: 25,
      mediaFiles: [3866342509, 'ofapi_media_abc'],
      previews: [3866342509],
    });
  });

  it('claimNextQueued claims the OLDEST queued row exactly once (queued→sending, attempts+1)', () => {
    insert(data, { localId: 'L1' });
    insert(data, { localId: 'L2' });

    const first = data.outbox.claimNextQueued(ACCT, CHAT);
    expect(first).toMatchObject({ localId: 'L1', state: 'sending', attempts: 1 });
    // L1 is no longer claimable — the claim is the only gateway into 'sending'.
    const second = data.outbox.claimNextQueued(ACCT, CHAT);
    expect(second?.localId).toBe('L2');
    expect(data.outbox.claimNextQueued(ACCT, CHAT)).toBeNull();
    expect(data.outbox.claimNextQueued(ACCT, 'other-chat')).toBeNull();
  });

  it('transition is guarded: wrong from-state is a no-op returning false', () => {
    insert(data, { localId: 'L1' });
    expect(
      data.outbox.transition({ localId: 'L1', from: ['sending'], to: 'sent', messageId: 'm1' }),
    ).toBe(false);
    expect(data.outbox.get('L1')).toMatchObject({ state: 'queued', messageId: null });
    expect(data.outbox.transition({ localId: 'missing', from: ['queued'], to: 'cancelled' })).toBe(
      false,
    );

    data.outbox.claimNextQueued(ACCT, CHAT);
    expect(
      data.outbox.transition({
        localId: 'L1',
        from: ['sending'],
        to: 'failed',
        errorCode: 'CG-OF-05',
        errorMessage: 'restricted',
        textHighlights: ['bad'],
      }),
    ).toBe(true);
    expect(data.outbox.get('L1')).toMatchObject({
      state: 'failed',
      errorCode: 'CG-OF-05',
      errorMessage: 'restricted',
      textHighlights: ['bad'],
    });
    // A failed row can never be re-sent: 'sending' is reachable only via claim.
    expect(data.outbox.claimNextQueued(ACCT, CHAT)).toBeNull();
  });

  it('cancelQueuedInSequence cancels only the sequence’s queued rows', () => {
    insert(data, { localId: 'P1', sequenceId: 'seq', partIndex: 0 });
    insert(data, { localId: 'P2', sequenceId: 'seq', partIndex: 1 });
    insert(data, { localId: 'X1' }); // unrelated single send
    data.outbox.claimNextQueued(ACCT, CHAT); // P1 → sending

    expect(data.outbox.cancelQueuedInSequence(ACCT, 'seq')).toBe(1);
    expect(data.outbox.get('P1')?.state).toBe('sending'); // in flight, untouched
    expect(data.outbox.get('P2')?.state).toBe('cancelled');
    expect(data.outbox.get('X1')?.state).toBe('queued');
    expect(data.outbox.hasQueuedInSequence(ACCT, 'seq')).toBe(false);
  });

  it('listForChat returns the most recent rows in insertion order; listByState filters', () => {
    for (let i = 0; i < 5; i += 1) {
      insert(data, { localId: `L${i}` });
    }
    expect(data.outbox.listForChat(ACCT, CHAT).map((row) => row.localId)).toEqual([
      'L0',
      'L1',
      'L2',
      'L3',
      'L4',
    ]);
    expect(data.outbox.listForChat(ACCT, CHAT, 2).map((row) => row.localId)).toEqual(['L3', 'L4']);

    data.outbox.claimNextQueued(ACCT, CHAT);
    expect(data.outbox.listByState('sending').map((row) => row.localId)).toEqual(['L0']);
    expect(
      data.outbox.listByStateForChat(ACCT, CHAT, 'queued').map((row) => row.localId),
    ).toEqual(['L1', 'L2', 'L3', 'L4']);
    expect(data.outbox.chatsWithState('sending')).toEqual([{ accountId: ACCT, chatId: CHAT }]);
  });

  it('claimedMessageIds collects confirmed ids for the cross-claim guard', () => {
    insert(data, { localId: 'L1' });
    insert(data, { localId: 'L2' });
    data.outbox.claimNextQueued(ACCT, CHAT);
    data.outbox.transition({ localId: 'L1', from: ['sending'], to: 'sent', messageId: '900' });
    expect(data.outbox.claimedMessageIds(ACCT, CHAT)).toEqual(new Set(['900']));
  });
});
