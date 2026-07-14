// DESIGN §3.3: DB-change notifications batched, at most one flush per 50 ms.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChangeBus, DB_CHANGE_FLUSH_MS } from '@main/db/index';
import type { DbChangedEvent } from '@main/db/index';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const chats = (accountId: string): DbChangedEvent => ({ scope: 'chats', accountId });
const messages = (accountId: string, chatId: string): DbChangedEvent => ({
  scope: 'messages',
  accountId,
  chatId,
});

describe('change bus batching', () => {
  it('coalesces publishes within the window into a single deduped flush', () => {
    const bus = createChangeBus();
    const batches: DbChangedEvent[][] = [];
    bus.subscribe((events) => batches.push([...events]));

    bus.publish(chats('acct_1'));
    bus.publish(chats('acct_1'));
    bus.publish(messages('acct_1', '101'));
    bus.publish(messages('acct_1', '101'));
    bus.publish(messages('acct_1', '202'));

    expect(batches).toEqual([]); // nothing before the window elapses
    vi.advanceTimersByTime(DB_CHANGE_FLUSH_MS);
    expect(batches).toEqual([
      [chats('acct_1'), messages('acct_1', '101'), messages('acct_1', '202')],
    ]);
    bus.dispose();
  });

  it('unions changed settings keys while coalescing a settings batch', () => {
    const bus = createChangeBus();
    const batches: DbChangedEvent[][] = [];
    bus.subscribe((events) => batches.push([...events]));

    bus.publish({ scope: 'settings', settingsKeys: ['hubBaseUrl'] });
    bus.publish({ scope: 'settings', settingsKeys: ['accountPageLabels', 'hubBaseUrl'] });
    vi.advanceTimersByTime(DB_CHANGE_FLUSH_MS);

    expect(batches).toEqual([[
      {
        scope: 'settings',
        settingsKeys: ['hubBaseUrl', 'accountPageLabels'],
      },
    ]]);
    bus.dispose();
  });

  it('preserves account coordinates while coalescing account-scoped settings', () => {
    const bus = createChangeBus();
    const batches: DbChangedEvent[][] = [];
    bus.subscribe((events) => batches.push([...events]));

    bus.publish({
      scope: 'settings',
      accountId: 'acct_1',
      settingsKeys: ['personalities.accountMappings.v2.scope'],
    });
    bus.publish({
      scope: 'settings',
      accountId: 'acct_1',
      settingsKeys: ['personalities.accountMappings.v2.scope'],
    });
    vi.advanceTimersByTime(DB_CHANGE_FLUSH_MS);

    expect(batches).toEqual([[
      {
        scope: 'settings',
        accountId: 'acct_1',
        settingsKeys: ['personalities.accountMappings.v2.scope'],
      },
    ]]);
    bus.dispose();
  });

  it('flushes at most once per window across sustained writes', () => {
    const bus = createChangeBus();
    let flushes = 0;
    bus.subscribe(() => {
      flushes += 1;
    });

    // Publish every 10 ms for 200 ms → 4 windows → 4 flushes.
    for (let tick = 0; tick < 20; tick += 1) {
      bus.publish(messages('acct_1', String(tick)));
      vi.advanceTimersByTime(10);
    }
    expect(flushes).toBe(4);
    bus.dispose();
  });

  it('starts a fresh batch after each flush', () => {
    const bus = createChangeBus();
    const batches: DbChangedEvent[][] = [];
    bus.subscribe((events) => batches.push([...events]));

    bus.publish(chats('acct_1'));
    vi.advanceTimersByTime(DB_CHANGE_FLUSH_MS);
    bus.publish(chats('acct_2'));
    vi.advanceTimersByTime(DB_CHANGE_FLUSH_MS);

    expect(batches).toEqual([[chats('acct_1')], [chats('acct_2')]]);
    bus.dispose();
  });

  it('flushNow drains immediately and cancels the pending timer', () => {
    const bus = createChangeBus();
    const batches: DbChangedEvent[][] = [];
    bus.subscribe((events) => batches.push([...events]));

    bus.publish(chats('acct_1'));
    bus.flushNow();
    expect(batches).toEqual([[chats('acct_1')]]);

    vi.advanceTimersByTime(DB_CHANGE_FLUSH_MS * 2);
    expect(batches).toHaveLength(1); // no double flush
    bus.flushNow();
    expect(batches).toHaveLength(1); // empty flush is a no-op
    bus.dispose();
  });

  it('unsubscribe stops delivery; other listeners survive a throwing one', () => {
    const bus = createChangeBus();
    const seen: DbChangedEvent[] = [];
    const unsubscribe = bus.subscribe(() => {
      throw new Error('faulty subscriber');
    });
    bus.subscribe((events) => seen.push(...events));

    bus.publish(chats('acct_1'));
    vi.advanceTimersByTime(DB_CHANGE_FLUSH_MS);
    expect(seen).toEqual([chats('acct_1')]);

    unsubscribe();
    bus.publish(chats('acct_2'));
    vi.advanceTimersByTime(DB_CHANGE_FLUSH_MS);
    expect(seen).toEqual([chats('acct_1'), chats('acct_2')]);
    bus.dispose();
  });

  it('dispose drops pending events and ignores later publishes', () => {
    const bus = createChangeBus();
    const batches: DbChangedEvent[][] = [];
    bus.subscribe((events) => batches.push([...events]));

    bus.publish(chats('acct_1'));
    bus.dispose();
    vi.advanceTimersByTime(DB_CHANGE_FLUSH_MS * 2);
    bus.publish(chats('acct_2'));
    vi.advanceTimersByTime(DB_CHANGE_FLUSH_MS * 2);
    expect(batches).toEqual([]);
  });
});
