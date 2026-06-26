// Pure client-side sort for the Online flat list (0 credits — switching the sort
// tab never refetches; it reorders the ≤cap cached snapshot rows). Kept pure for
// tests.

import type { OnlineRowVM } from '../../../../preload/contract';

export type OnlineSort = 'spend' | 'recent';

function lastSeenMs(row: OnlineRowVM): number {
  if (row.lastSeen === null) return 0; // unknown → oldest
  const ms = Date.parse(row.lastSeen);
  return Number.isFinite(ms) ? ms : 0;
}

/** 'spend' = lifetime desc (default «по тратам»); 'recent' = last-seen desc
 *  («кто только зашёл» — most-recently-active first). Stable (V8 sort), nulls
 *  last. Returns a new array — never mutates the query cache. */
export function sortOnlineRows(rows: readonly OnlineRowVM[], sort: OnlineSort): OnlineRowVM[] {
  const copy = rows.slice();
  if (sort === 'recent') {
    copy.sort((a, b) => lastSeenMs(b) - lastSeenMs(a));
  } else {
    copy.sort((a, b) => (b.lifetimeSpend ?? 0) - (a.lifetimeSpend ?? 0));
  }
  return copy;
}
