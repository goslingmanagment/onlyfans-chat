import { describe, expect, it } from 'vitest';
import { customNameOf, mapChat, mapFan, mapFanTransaction } from '../../src/main/sync/mappers';
import type { OfApiChat, OfApiTransaction, OfApiUser } from '../../src/main/ofapi/schemas';

const toMediaUrl = (remoteUrl: string) => `media://cache?src=${encodeURIComponent(remoteUrl)}`;

function makeChat(fan: Record<string, unknown>): OfApiChat {
  return {
    unreadMessagesCount: 0,
    hasUnreadTips: false,
    canSendMessage: true,
    lastReadMessageId: null,
    lastMessage: null,
    fan,
  } as OfApiChat;
}

function makeUser(overrides: Record<string, unknown>): OfApiUser {
  return { id: 438953032, username: 'u438953032', name: 'Brad', ...overrides } as OfApiUser;
}

describe('customNameOf', () => {
  it('returns the creator-set displayName', () => {
    expect(customNameOf(makeUser({ displayName: 'Brad/Australia/52' }))).toBe('Brad/Australia/52');
  });

  it("treats '' as unset (live shape for fans without a custom name)", () => {
    expect(customNameOf(makeUser({ displayName: '' }))).toBeNull();
    expect(customNameOf(makeUser({ displayName: '   ' }))).toBeNull();
    expect(customNameOf(makeUser({ displayName: null }))).toBeNull();
    expect(customNameOf(makeUser({}))).toBeNull();
    expect(customNameOf(null)).toBeNull();
  });
});

describe('mapChat fan name', () => {
  it('prefers the custom name over the fan-chosen name', () => {
    const chat = makeChat({
      id: 438953032,
      name: 'Brad',
      username: 'u438953032',
      displayName: 'Brad/Australia/52',
    });
    expect(mapChat('acct_test', chat, toMediaUrl)?.fanName).toBe('Brad/Australia/52');
  });

  it('falls back to name → username → id when no custom name is set', () => {
    expect(
      mapChat('acct_test', makeChat({ id: 1, name: 'Brad', username: 'u1', displayName: '' }), toMediaUrl)
        ?.fanName,
    ).toBe('Brad');
    expect(mapChat('acct_test', makeChat({ id: 1, username: 'u1' }), toMediaUrl)?.fanName).toBe('u1');
    expect(mapChat('acct_test', makeChat({ id: 1 }), toMediaUrl)?.fanName).toBe('1');
  });
});

describe('mapFan custom name', () => {
  it('stores the custom name alongside the original name', () => {
    const fan = mapFan(
      'acct_test',
      makeUser({ displayName: 'Brad/Australia/52' }),
      toMediaUrl,
      '2026-06-11T00:00:00.000Z',
    );
    expect(fan.customName).toBe('Brad/Australia/52');
    expect(fan.name).toBe('Brad');
  });

  it('keeps customName null when unset', () => {
    const fan = mapFan('acct_test', makeUser({ displayName: '' }), toMediaUrl, '2026-06-11T00:00:00.000Z');
    expect(fan.customName).toBeNull();
  });
});

describe('mapFanTransaction', () => {
  const base = {
    id: 'tx1',
    amount: 19.99,
    type: 'tips',
    createdAt: '2026-06-10T12:00:00+00:00',
    user: { id: 438953032 },
  };

  it('maps a fan payment, normalizing created_at to ISO-UTC', () => {
    expect(mapFanTransaction('acct_test', base as OfApiTransaction)).toEqual({
      accountId: 'acct_test',
      txId: 'tx1',
      fanId: '438953032',
      amount: 19.99,
      type: 'tips',
      createdAt: '2026-06-10T12:00:00.000Z',
    });
  });

  it('stringifies numeric tx ids and tolerates a missing type', () => {
    const row = mapFanTransaction('acct_test', { ...base, id: 77, type: null } as OfApiTransaction);
    expect(row?.txId).toBe('77');
    expect(row?.type).toBeNull();
  });

  it('drops rows that cannot feed the per-fan aggregate', () => {
    const cases: Record<string, unknown>[] = [
      { ...base, user: null }, // payout fees etc. — no fan
      { ...base, user: {} }, // fan object without id
      { ...base, amount: null },
      { ...base, amount: 0 }, // non-positive never counts toward spend
      { ...base, amount: -5 },
      { ...base, createdAt: null },
      { ...base, createdAt: 'not a date' },
    ];
    for (const tx of cases) {
      expect(mapFanTransaction('acct_test', tx as OfApiTransaction)).toBeNull();
    }
  });
});
