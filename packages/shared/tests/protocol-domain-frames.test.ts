// Kernel Stage 24: the canonical-vocabulary → local SyncEvent mapping. The
// conformance rule from the stage spec: every v1-era event kind the desktop
// consumed has a v2 source, and unknown types are tolerated (mapped to null,
// cursor still advances — asserted in the hub-sync v2 suite).
//   messageReceived/messageSent ← message.received/sent (+payload)
//   messageDeleted              ← message.deleted
//   ppvUnlocked                 ← message.ppv_unlocked
//   tipReceived                 ← tip.received (amountGross → amountUsd)
//   presence                    ← presence.online/offline
//   chatListUpdated             ← subscription.started
//   accountAuthChanged          ← account.auth_changed (status grouping)
//   typing                      ← the ephemeral serve-time lane (not mapped here)
//   readStateChanged            ← local-only synthesis (the server never sent it)

import { describe, expect, it } from 'vitest';
import { mapDomainFrame, type DomainEventFrame } from '../src/protocol/index';

const ACCT = 'acct_map_test';

function frame(overrides: Partial<DomainEventFrame>): DomainEventFrame {
  return {
    accountId: 7,
    accountSeq: 1,
    type: 'message.received',
    occurredAt: '2026-07-06T10:00:00.000Z',
    data: {},
    fanRef: '777',
    conversationRef: '777',
    messageRef: '9001',
    accountRef: ACCT,
    ...overrides,
  };
}

describe('mapDomainFrame', () => {
  it('maps message.received/sent with the normalized payload riding through', () => {
    const received = mapDomainFrame(frame({
      type: 'message.received',
      payload: { id: '9001', text: 'hi', createdAt: '2026-07-06T10:00:00.000Z', isSentByMe: false, price: 0 },
    }));
    expect(received).toMatchObject({
      type: 'messageReceived',
      accountId: ACCT,
      chatId: '777',
      messageId: '9001',
      message: { id: '9001', text: 'hi' },
    });

    const sent = mapDomainFrame(frame({ type: 'message.sent', payload: undefined }));
    expect(sent).toMatchObject({ type: 'messageSent', accountId: ACCT, chatId: '777', messageId: '9001' });
    expect(sent).not.toHaveProperty('message');
  });

  it('tolerates a malformed payload (id-only event, the existing fallback path)', () => {
    const mapped = mapDomainFrame(frame({ payload: { garbage: true } }));
    expect(mapped).toMatchObject({ type: 'messageReceived', messageId: '9001' });
    expect(mapped).not.toHaveProperty('message');
  });

  it('maps message.deleted without a chat id (enriched locally downstream)', () => {
    expect(mapDomainFrame(frame({ type: 'message.deleted', conversationRef: null })))
      .toEqual({ type: 'messageDeleted', accountId: ACCT, messageId: '9001' });
  });

  it('maps ppv_unlocked and tip.received notification events', () => {
    expect(mapDomainFrame(frame({ type: 'message.ppv_unlocked' })))
      .toEqual({ type: 'ppvUnlocked', accountId: ACCT, chatId: '777', messageId: '9001' });

    expect(mapDomainFrame(frame({
      type: 'tip.received',
      messageRef: null,
      data: { amountGross: 25, amountNet: 20 },
    }))).toEqual({ type: 'tipReceived', accountId: ACCT, chatId: '777', amountUsd: 25 });

    // Absent amount is never fabricated.
    expect(mapDomainFrame(frame({ type: 'tip.received', messageRef: null, data: {} })))
      .toEqual({ type: 'tipReceived', accountId: ACCT, chatId: '777' });
  });

  it('maps presence.online/offline with the last-seen instant when parseable', () => {
    expect(mapDomainFrame(frame({
      type: 'presence.online',
      data: { lastSeenOnlineAt: '2026-07-06T09:59:00.000Z' },
    }))).toEqual({
      type: 'presence',
      accountId: ACCT,
      chatId: '777',
      online: true,
      lastSeenAt: Date.parse('2026-07-06T09:59:00.000Z'),
    });

    expect(mapDomainFrame(frame({ type: 'presence.offline', data: {} })))
      .toEqual({ type: 'presence', accountId: ACCT, chatId: '777', online: false });
  });

  it('maps subscription.started to the chat-list nudge', () => {
    expect(mapDomainFrame(frame({ type: 'subscription.started' })))
      .toEqual({ type: 'chatListUpdated', accountId: ACCT });
  });

  it('groups account.auth_changed statuses like the v1 fanout did', () => {
    for (const status of ['connected', 'reconnected', 'session_expired']) {
      expect(mapDomainFrame(frame({ type: 'account.auth_changed', data: { status } })))
        .toEqual({ type: 'accountAuthChanged', accountId: ACCT, authenticated: true });
    }
    for (const status of ['authentication_failed', 'otp_code_required', 'face_otp_required']) {
      expect(mapDomainFrame(frame({ type: 'account.auth_changed', data: { status } })))
        .toEqual({ type: 'accountAuthChanged', accountId: ACCT, authenticated: false });
    }
  });

  it('returns null for unknown types, non-OFAPI accounts, and missing required refs', () => {
    expect(mapDomainFrame(frame({ type: 'transaction.posted' }))).toBeNull();
    expect(mapDomainFrame(frame({ type: 'fan.earnings_observed' }))).toBeNull();
    expect(mapDomainFrame(frame({ accountRef: null }))).toBeNull();
    expect(mapDomainFrame(frame({ accountRef: undefined }))).toBeNull();
    expect(mapDomainFrame(frame({ conversationRef: null }))).toBeNull();
    expect(mapDomainFrame(frame({ type: 'message.deleted', messageRef: null }))).toBeNull();
    expect(mapDomainFrame(frame({ type: 'presence.online', fanRef: null }))).toBeNull();
    expect(mapDomainFrame(frame({ type: 'account.auth_changed', data: {} }))).toBeNull();
  });
});
