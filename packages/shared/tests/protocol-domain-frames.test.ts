// Kernel Stage 24: the canonical-vocabulary → local SyncEvent mapping. The
// conformance rule from the stage spec: every v1-era event kind the desktop
// consumed has a v2 source, and unknown types are tolerated (mapped to null,
// cursor still advances — asserted in the hub-sync v2 suite).
//   messageReceived/messageSent ← message.received/sent (+payload)
//   messageDeleted              ← message.deleted
//   ppvUnlocked                 ← message.ppv_unlocked
//   tipReceived                 ← tip.received (amountGross → amountUsd)
//   presence                    ← presence.online/offline
//   chatListUpdated             ← subscription.renewed
//   subscriberStarted           ← subscription.started (D44)
//   accountAuthChanged          ← account.auth_changed (status grouping)
//   typing                      ← the ephemeral serve-time lane (not mapped here)
//   readStateChanged            ← local-only synthesis (the server never sent it)

import { describe, expect, it } from 'vitest';
import {
  domainEventFactsPageSchema,
  frameProvenance,
  isOnlyFansAccountRef,
  mapDomainFrame,
  parseDomainEventFrame,
  parsePpvAmountText,
  parseSyncEvent,
  type DomainEventFrame,
} from '../src/protocol/index';

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
      occurredAt: '2026-07-06T10:00:00.000Z',
    });

    const sent = mapDomainFrame(frame({ type: 'message.sent', payload: undefined }));
    expect(sent).toMatchObject({ type: 'messageSent', accountId: ACCT, chatId: '777', messageId: '9001' });
    expect(sent).not.toHaveProperty('message');
    expect(sent).not.toHaveProperty('occurredAt');
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

  it('maps a renewal to the chat-list nudge and a start to its own event (D44)', () => {
    expect(mapDomainFrame(frame({ type: 'subscription.renewed' })))
      .toEqual({ type: 'chatListUpdated', accountId: ACCT });
    expect(mapDomainFrame(frame({ type: 'subscription.started', fanRef: '777' })))
      .toEqual({ type: 'subscriberStarted', accountId: ACCT, fanId: '777' });
    expect(mapDomainFrame(frame({ type: 'subscription.started', fanRef: null })))
      .toEqual({ type: 'subscriberStarted', accountId: ACCT });
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

  it('D39: a PPV unlock carries its price — Core\'s amountUsd, else the strict amountText', () => {
    expect(mapDomainFrame(frame({
      type: 'message.ppv_unlocked',
      data: { amountText: '$89.00', amountUsd: 89, messageLink: '<a>message</a>' },
    }))).toEqual({ type: 'ppvUnlocked', accountId: ACCT, chatId: '777', messageId: '9001', amountUsd: 89 });
    // Events written before H2 carry only the display text (all 526 on pages
    // 8/9 on 2026-09-26).
    expect(mapDomainFrame(frame({
      type: 'message.ppv_unlocked',
      data: { amountText: '$13.99' },
    }))).toMatchObject({ amountUsd: 13.99 });
    // Core's strict parse said null, and the text is not a strict price:
    // unknown stays unknown.
    expect(mapDomainFrame(frame({
      type: 'message.ppv_unlocked',
      data: { amountText: '€10', amountUsd: null },
    }))).not.toHaveProperty('amountUsd');
  });

  it('D39: parses the PPV amount text exactly like Core (parseOfapiPpvAmountUsd)', () => {
    expect(parsePpvAmountText('$67.00')).toBe(67);
    expect(parsePpvAmountText('$5')).toBe(5);
    expect(parsePpvAmountText('$13.99')).toBe(13.99);
    expect(parsePpvAmountText('$0.50')).toBe(0.5);
    for (const bad of ['67', '$1,000.00', '$13.9', '$ 5', 'USD 5', '$05', '', null, 67]) {
      expect(parsePpvAmountText(bad)).toBeNull();
    }
  });

  it('D39: maps transaction.posted to one money change keyed by the OFAPI transaction id', () => {
    const posted = frame({
      type: 'transaction.posted',
      conversationRef: null,
      messageRef: null,
      fanRef: '499106230',
      transactionRef: 'eb118196c33625aa23c4dda8de8e4501',
      occurredAt: '2026-09-26T14:37:10.000Z',
      data: {
        amount: 67,
        netAmount: 53.6,
        feeAmount: 13.4,
        amountUnit: 'dollars',
        transactionType: 'message',
        status: 'loading',
      },
    });
    expect(mapDomainFrame(posted)).toEqual({
      type: 'transactionPosted',
      accountId: ACCT,
      fanId: '499106230',
      transactionId: 'eb118196c33625aa23c4dda8de8e4501',
      amountUsd: 67,
      netUsd: 53.6,
      transactionType: 'message',
      createdAt: '2026-09-26T14:37:10.000Z',
    });
    // Historical events without A46's amountUnit are OnlyFans dollars.
    const legacy = { ...(posted.data as Record<string, unknown>) };
    delete legacy.amountUnit;
    expect(mapDomainFrame({ ...posted, data: legacy })).toMatchObject({ amountUsd: 67 });
    // The wire shape survives the main → renderer schema.
    expect(parseSyncEvent(mapDomainFrame(posted))).toMatchObject({ type: 'transactionPosted' });

    // Never a mis-scaled or unkeyed money change.
    expect(mapDomainFrame({ ...posted, data: { ...legacy, amountUnit: 'mills' } })).toBeNull();
    expect(mapDomainFrame({ ...posted, transactionRef: null })).toBeNull();
    expect(mapDomainFrame({ ...posted, fanRef: null })).toBeNull();
    expect(mapDomainFrame({ ...posted, data: { ...legacy, amount: 0 } })).toBeNull();
    expect(mapDomainFrame({ ...posted, occurredAt: 'not a date' })).toBeNull();
  });

  it('D39: reads a facts page without failing on one malformed row or an unknown provenance', () => {
    const page = domainEventFactsPageSchema.parse({
      accountId: 9,
      throughSeq: 246116,
      facts: [
        { ...frame({ type: 'message.ppv_unlocked' }), provenance: 'teleported' },
        { garbage: true },
      ],
      nextAfterSeq: 246116,
      hasMore: false,
    });
    const first = parseDomainEventFrame(page.facts[0]);
    expect(first).not.toBeNull();
    expect(frameProvenance(first!)).toBe('unknown');
    expect(parseDomainEventFrame(page.facts[1])).toBeNull();
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

describe('parseSyncEvent messageReceived attention metadata', () => {
  const received = {
    type: 'messageReceived',
    accountId: ACCT,
    chatId: '777',
    messageId: '9001',
  } as const;

  it('accepts an explicit replay suppression flag', () => {
    expect(parseSyncEvent({ ...received, live: false })).toEqual({
      ...received,
      live: false,
    });
  });

  it('keeps marker-less and polling-origin payloads backward compatible', () => {
    expect(parseSyncEvent(received)).toEqual(received);
  });
});

// ── H3 serve-time fields (core #265), parsed tolerantly for D38 ─────────────

describe('H3 frame fields', () => {
  const wire = {
    accountId: 8,
    accountSeq: 41,
    type: 'message.received',
    occurredAt: '2026-09-26T16:07:00.000Z',
    data: {},
    conversationRef: '777',
    messageRef: '9001',
    accountRef: 'acct_fe79aa',
  };

  it('reads provenance from the closed enum and maps anything else to unknown', () => {
    for (const value of ['live', 'redelivery', 'repair'] as const) {
      const parsed = parseDomainEventFrame({ ...wire, provenance: value });
      expect(parsed).not.toBeNull();
      expect(frameProvenance(parsed!)).toBe(value);
    }
    // Missing = the lookup failed: unknown, never live.
    expect(frameProvenance(parseDomainEventFrame(wire)!)).toBe('unknown');
    // A value outside the enum (a newer Core) must not reject the durable frame.
    const future = parseDomainEventFrame({ ...wire, provenance: 'backfill' });
    expect(future).not.toBeNull();
    expect(frameProvenance(future!)).toBe('unknown');
    expect(frameProvenance(parseDomainEventFrame({ ...wire, provenance: 7 })!)).toBe('unknown');
  });

  it('keeps transactionRef and thread, and degrades malformed ones to absent', () => {
    const money = parseDomainEventFrame({
      ...wire,
      type: 'transaction.posted',
      transactionRef: 'tx-123',
      thread: { fanName: 'Kevin', username: null },
    });
    expect(money).toMatchObject({ transactionRef: 'tx-123', thread: { fanName: 'Kevin', username: null } });

    const junk = parseDomainEventFrame({ ...wire, transactionRef: 42, thread: { fanName: 1 } });
    expect(junk).not.toBeNull();
    expect(junk!.transactionRef).toBeUndefined();
    expect(junk!.thread).toBeUndefined();
  });

  it('recognises OnlyFans OFAPI account refs only', () => {
    expect(isOnlyFansAccountRef('acct_fe79aa')).toBe(true);
    expect(isOnlyFansAccountRef('fansly_acct_123')).toBe(false);
    expect(isOnlyFansAccountRef('')).toBe(false);
    expect(isOnlyFansAccountRef(null)).toBe(false);
    expect(isOnlyFansAccountRef(undefined)).toBe(false);
  });
});
