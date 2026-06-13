// thread_fetch_log (schema v10; PLAN item 13) — per-fan thread-fetch stamps.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DataLayer } from '@main/db/index';
import { memoryDataLayer } from './helpers';

const ACCT = 'acct_1';

describe('threadFetchLog', () => {
  let data: DataLayer;

  beforeEach(() => {
    data = memoryDataLayer();
  });

  afterEach(() => {
    data.close();
  });

  it('returns null / empty map for never-fetched chats', () => {
    expect(data.threadFetchLog.get(ACCT, '101')).toBeNull();
    expect(data.threadFetchLog.getMany(ACCT, ['101', '102']).size).toBe(0);
  });

  it('stamp + get round-trips and a re-stamp overwrites (latest fetch wins)', () => {
    data.threadFetchLog.stamp(ACCT, '101', '2026-06-13T10:00:00.000Z');
    expect(data.threadFetchLog.get(ACCT, '101')).toBe('2026-06-13T10:00:00.000Z');
    data.threadFetchLog.stamp(ACCT, '101', '2026-06-13T12:00:00.000Z');
    expect(data.threadFetchLog.get(ACCT, '101')).toBe('2026-06-13T12:00:00.000Z');
  });

  it('stamps are account-scoped', () => {
    data.threadFetchLog.stamp(ACCT, '101', '2026-06-13T10:00:00.000Z');
    expect(data.threadFetchLog.get('acct_other', '101')).toBeNull();
  });

  it('getMany returns only stamped chats from the requested set', () => {
    data.threadFetchLog.stamp(ACCT, '101', '2026-06-13T10:00:00.000Z');
    data.threadFetchLog.stamp(ACCT, '103', '2026-06-13T11:00:00.000Z');
    data.threadFetchLog.stamp(ACCT, '999', '2026-06-13T11:30:00.000Z'); // not requested
    const map = data.threadFetchLog.getMany(ACCT, ['101', '102', '103']);
    expect(map.size).toBe(2);
    expect(map.get('101')).toBe('2026-06-13T10:00:00.000Z');
    expect(map.get('103')).toBe('2026-06-13T11:00:00.000Z');
  });

  it('getMany handles large id sets (chunked IN clauses)', () => {
    const ids = Array.from({ length: 1200 }, (_, i) => String(i + 1));
    for (const id of ids) {
      data.threadFetchLog.stamp(ACCT, id, '2026-06-13T10:00:00.000Z');
    }
    expect(data.threadFetchLog.getMany(ACCT, ids).size).toBe(1200);
  });
});
