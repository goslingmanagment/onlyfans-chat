import { describe, expect, it } from 'vitest';
import { fanToVM } from '@main/ipc/viewmodels';
import type { FanRow } from '@main/db/rows';

function fanRow(fetchedAt: string): FanRow {
  return {
    accountId: 'acct_1', fanId: '7', name: 'Fan', customName: null, username: 'fan7',
    avatar: null, about: null, lastSeen: null, spending: null, subscription: null, fetchedAt,
  };
}

describe('fan source freshness VM', () => {
  it('preserves the source snapshot time instead of the time the renderer reads it', () => {
    const source = fanRow('2026-06-01T15:00:00+03:00');
    expect(fanToVM(source, null, null).fetchedAt).toBe('2026-06-01T12:00:00.000Z');
  });

  it.each(['', 'not-a-date'])('leaves an unknown/corrupt source time unknown: %j', (fetchedAt) => {
    expect(fanToVM(fanRow(fetchedAt), null, null).fetchedAt).toBeNull();
  });
});
