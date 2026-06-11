import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DataLayer, DbChangedEvent, FanTransactionUpsert } from '@main/db/index';
import { memoryDataLayer, sampleChat } from './helpers';

const DAY_MS = 24 * 60 * 60_000;
// Single anchor: Date.now() drifts between calls, and these tests compare
// exact ISO strings.
const NOW_MS = Date.now();

function isoDaysAgo(days: number): string {
  return new Date(NOW_MS - days * DAY_MS).toISOString();
}

function tx(overrides: Partial<FanTransactionUpsert> = {}): FanTransactionUpsert {
  return {
    accountId: 'acct_1',
    txId: 't1',
    fanId: '101',
    amount: 25,
    type: 'tips',
    createdAt: isoDaysAgo(1),
    ...overrides,
  };
}

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

describe('fanTransactions queries', () => {
  it('upserts idempotently by (account, tx) and tracks the newest created_at', () => {
    layer.fanTransactions.upsertMany([
      tx({ txId: 'a', createdAt: isoDaysAgo(5) }),
      tx({ txId: 'b', createdAt: isoDaysAgo(2) }),
    ]);
    layer.fanTransactions.upsertMany([tx({ txId: 'a', amount: 99, createdAt: isoDaysAgo(5) })]);

    expect(layer.fanTransactions.latestCreatedAt('acct_1')).toBe(isoDaysAgo(2));
    expect(layer.fanTransactions.latestCreatedAt('acct_other')).toBeNull();
  });

  it('publishes a chats-scope change (the visible artifact is the chat list)', () => {
    layer.fanTransactions.upsertMany([tx()]);
    layer.bus.flushNow();
    expect(flushed).toContainEqual({ scope: 'chats', accountId: 'acct_1' });
  });

  it('pruneOlderThan drops only rows past the cutoff, per account', () => {
    layer.fanTransactions.upsertMany([
      tx({ txId: 'old', createdAt: isoDaysAgo(40) }),
      tx({ txId: 'fresh', createdAt: isoDaysAgo(3) }),
      tx({ accountId: 'acct_2', txId: 'other-old', createdAt: isoDaysAgo(40) }),
    ]);
    layer.fanTransactions.pruneOlderThan('acct_1', isoDaysAgo(31));

    expect(layer.fanTransactions.latestCreatedAt('acct_1')).toBe(isoDaysAgo(3));
    expect(layer.fanTransactions.latestCreatedAt('acct_2')).toBe(isoDaysAgo(40));
  });
});

describe('chat list fan-value join (DESIGN §1)', () => {
  beforeEach(() => {
    layer.chats.upsertMany([
      sampleChat({ chatId: '101', fanName: 'Marcus' }),
      sampleChat({ chatId: '102', fanName: 'Sam' }),
    ]);
    layer.fans.upsert({
      accountId: 'acct_1',
      fanId: '101',
      username: 'marcus',
      name: 'Marcus',
      customName: null,
      avatar: null,
      about: null,
      lastSeen: null,
      spending: { total: 1284.4, subscriptions: 84, tips: 310, messages: 890.4, posts: 0, streams: 0 },
      subscription: null,
      fetchedAt: isoDaysAgo(0),
    });
  });

  it('exposes lifetime from fans.spending and a rolling 30-day sum', () => {
    layer.fanTransactions.upsertMany([
      tx({ txId: 'in-window-1', amount: 100, createdAt: isoDaysAgo(2) }),
      tx({ txId: 'in-window-2', amount: 20.5, createdAt: isoDaysAgo(29) }),
      tx({ txId: 'out-of-window', amount: 500, createdAt: isoDaysAgo(31) }),
      tx({ txId: 'other-fan', fanId: '999', amount: 77, createdAt: isoDaysAgo(1) }),
    ]);

    const items = layer.chats.list({ accountId: 'acct_1', filter: 'all' }).items;
    const marcus = items.find((c) => c.chatId === '101');
    expect(marcus?.lifetimeSpend).toBeCloseTo(1284.4);
    expect(marcus?.spend30d).toBeCloseTo(120.5);
  });

  it('renders silence honestly: no fan row / no transactions → nulls', () => {
    const items = layer.chats.list({ accountId: 'acct_1', filter: 'all' }).items;
    const sam = items.find((c) => c.chatId === '102');
    expect(sam?.lifetimeSpend).toBeNull();
    expect(sam?.spend30d).toBeNull();
  });

  it('search carries the same fan-value figures', () => {
    layer.fanTransactions.upsertMany([tx({ txId: 's1', amount: 12 })]);
    const [hit] = layer.chats.search({ accountId: 'acct_1', query: 'marc' });
    expect(hit?.lifetimeSpend).toBeCloseTo(1284.4);
    expect(hit?.spend30d).toBe(12);
  });

  it('corrupt fans.spending JSON degrades to null, not a crash', () => {
    layer.db.prepare("UPDATE fans SET spending = '{not json'").run();
    const items = layer.chats.list({ accountId: 'acct_1', filter: 'all' }).items;
    expect(items.find((c) => c.chatId === '101')?.lifetimeSpend).toBeNull();
  });
});
