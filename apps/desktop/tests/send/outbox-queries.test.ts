// Outbox query module (SPEC §7 / §10): guarded forward-only transitions, the
// atomic claim (the structural one-POST-per-row guarantee), FIFO ordering, and
// change-bus publication on every mutation.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DataLayer, DbChangedEvent, OutboxInsert } from '@main/db/index';
import { DEFAULT_COMPOSER_OPTIONS } from '@chatgoose/shared/composer';
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
      composer:null, outreachPurpose: null, localId: 'L1',
      accountId: ACCT,
      chatId: CHAT,
      text: 'text L1',
      transport: 'hub',
      state: 'queued',
      sequenceId: 'seq',
      partIndex: 2,
      messageId: null,
      errorCode: null,
      errorMessage: null,
      textHighlights: [],
      attempts: 0,
      retryOf: 'L0',
      coreCommandId: null,
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

  it('records a core command id once and keeps the original value', () => {
    insert(data, { localId: 'L1' });
    expect(data.outbox.setCoreCommandId('L1', 'cmd-1')).toBe(true);
    expect(data.outbox.get('L1')).toMatchObject({ coreCommandId: 'cmd-1' });

    expect(data.outbox.setCoreCommandId('L1', 'cmd-2')).toBe(true);
    expect(data.outbox.get('L1')).toMatchObject({ coreCommandId: 'cmd-1' });
    expect(data.outbox.setCoreCommandId('missing', 'cmd-3')).toBe(false);
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

  it('revertRecoveryChild atomically parks the child and returns the superseded original to unconfirmed', () => {
    const reuse = { ...DEFAULT_COMPOSER_OPTIONS, priceCents: 0, reuseProviderOperation: true };
    insert(data, { localId: 'O1', composer: { ...reuse, reuseProviderOperation: false } });
    data.outbox.claimNextQueued(ACCT, CHAT);
    data.outbox.setCoreCommandId('O1', 'cmd-1');
    data.outbox.transition({ localId: 'O1', from: ['sending'], to: 'unconfirmed', errorCode: 'CG-OF-06' });
    expect(
      data.outbox.replaceFailedWithRetry(
        'O1',
        { localId: 'C1', accountId: ACCT, chatId: CHAT, text: 'text O1', sequenceId: null, partIndex: 0, retryOf: 'O1', createdAt: '2026-06-11T12:00:01.000Z', composer: reuse },
        true,
      ),
    ).toBe(true);
    data.outbox.claimNextQueued(ACCT, CHAT);
    expect(data.outbox.get('O1')?.state).toBe('cancelled');
    expect(data.outbox.get('C1')?.state).toBe('sending');

    // Guards: the child must reference the original, and both rows must still be in place.
    expect(
      data.outbox.revertRecoveryChild({ childLocalId: 'C1', originalLocalId: 'O9', errorCode: 'CG-OF-09', errorMessage: 'x' }),
    ).toBe(false);
    expect(
      data.outbox.revertRecoveryChild({ childLocalId: 'missing', originalLocalId: 'O1', errorCode: 'CG-OF-09', errorMessage: 'x' }),
    ).toBe(false);
    expect(data.outbox.get('C1')?.state).toBe('sending');
    expect(data.outbox.get('O1')?.state).toBe('cancelled');

    expect(
      data.outbox.revertRecoveryChild({
        childLocalId: 'C1',
        originalLocalId: 'O1',
        errorCode: 'CG-OF-09',
        errorMessage: 'provider_replay_unavailable',
      }),
    ).toBe(true);
    expect(data.outbox.get('C1')).toMatchObject({
      state: 'cancelled',
      errorCode: 'CG-OF-09',
      errorMessage: 'provider_replay_unavailable',
      retryOf: 'O1',
    });
    expect(data.outbox.get('O1')).toMatchObject({
      state: 'unconfirmed',
      errorCode: 'CG-OF-09',
      errorMessage: 'provider_replay_unavailable',
      coreCommandId: 'cmd-1',
      text: 'text O1',
    });
    // Nothing became claimable: 'unconfirmed' is a status-read state, never a resend.
    expect(data.outbox.claimNextQueued(ACCT, CHAT)).toBeNull();
    // Idempotent: a second revert finds no cancelled original / live child.
    expect(
      data.outbox.revertRecoveryChild({ childLocalId: 'C1', originalLocalId: 'O1', errorCode: 'CG-OF-09', errorMessage: 'x' }),
    ).toBe(false);
    expect(data.outbox.get('O1')?.errorMessage).toBe('provider_replay_unavailable');
  });

  it('revertRecoveryChild rolls back the child write when the original is no longer superseded', () => {
    const reuse = { ...DEFAULT_COMPOSER_OPTIONS, priceCents: 0, reuseProviderOperation: true };
    insert(data, { localId: 'O2' });
    data.outbox.claimNextQueued(ACCT, CHAT);
    data.outbox.transition({ localId: 'O2', from: ['sending'], to: 'failed' });
    data.outbox.replaceFailedWithRetry(
      'O2',
      { localId: 'C2', accountId: ACCT, chatId: CHAT, text: 'text O2', sequenceId: null, partIndex: 0, retryOf: 'O2', createdAt: '2026-06-11T12:00:01.000Z', composer: reuse },
    );
    data.outbox.claimNextQueued(ACCT, CHAT);
    // Simulate the original having been moved by another path: the guard must
    // refuse and the child must keep its state (single transaction).
    data.outbox.transition({ localId: 'O2', from: ['cancelled'], to: 'failed' });
    expect(
      data.outbox.revertRecoveryChild({ childLocalId: 'C2', originalLocalId: 'O2', errorCode: 'CG-OF-09', errorMessage: 'x' }),
    ).toBe(false);
    expect(data.outbox.get('C2')).toMatchObject({ state: 'sending', errorCode: null });
    expect(data.outbox.get('O2')?.state).toBe('failed');
  });

  it('claimedMessageIds collects confirmed ids for the cross-claim guard', () => {
    insert(data, { localId: 'L1' });
    insert(data, { localId: 'L2' });
    data.outbox.claimNextQueued(ACCT, CHAT);
    data.outbox.transition({ localId: 'L1', from: ['sending'], to: 'sent', messageId: '900' });
    expect(data.outbox.claimedMessageIds(ACCT, CHAT)).toEqual(new Set(['900']));
  });
});
