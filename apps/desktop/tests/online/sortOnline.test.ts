import { describe, expect, it } from 'vitest';
import { sortOnlineRows } from '../../src/renderer/src/features/online/onlineModel';
import type { OnlineRowVM } from '../../src/preload/contract';

function row(fanId: string, lifetimeSpend: number | null, lastSeen: string | null): OnlineRowVM {
  return {
    fanId, name: fanId, username: null, avatarUrl: null, lifetimeSpend, spend30d: null,
    lastMessagePreview: '', lastMessageIsSentByMe: false, fanWaiting: false,
    modelDays: null, fanDays: null, silence: 'none', canSendMessage: true,
    lastModelMessageAt: null, lastFanMessageAt: null,
    canNotSendReason: null, hasChat: true, lastSeen,
  };
}

describe('sortOnlineRows', () => {
  it("'spend' = lifetime desc; nulls last; does not mutate input", () => {
    const input = [row('a', 100, null), row('b', 5000, null), row('c', null, null)];
    const out = sortOnlineRows(input, 'spend');
    expect(out.map((r) => r.fanId)).toEqual(['b', 'a', 'c']);
    expect(input.map((r) => r.fanId)).toEqual(['a', 'b', 'c']); // input untouched
  });
  it("'recent' = last-seen desc; null last-seen last", () => {
    const out = sortOnlineRows([
      row('a', 0, '2026-06-10T19:00:00Z'),
      row('b', 0, '2026-06-10T19:25:00Z'),
      row('c', 0, null),
    ], 'recent');
    expect(out.map((r) => r.fanId)).toEqual(['b', 'a', 'c']);
  });
});
