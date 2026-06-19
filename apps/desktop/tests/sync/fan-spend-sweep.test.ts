// Fan-spend sweep (DESIGN §1 30-day figure): incremental transactions walk.
// First sweep covers the full -30days window; later sweeps resume from the
// newest cached row minus a 1h overlap. Failure-isolated from the chat poll.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataLayer, type DataLayer } from '../../src/main/db/index';
import { createPollingSync } from '../../src/main/sync/polling-sync';
import type { ListTransactionsParams, OfApiClient } from '../../src/main/ofapi/client';
import type { OfApiChat, OfApiTransaction } from '../../src/main/ofapi/schemas';

const TEST_DRIVER = 'bsqlite3-mc-node';
const ACCT = 'acct_test';
const DAY_MS = 24 * 60 * 60_000;
const SPEND_SWEEP_INTERVAL_MS = 10 * 60_000;

function chatWithFan(fanId: number): OfApiChat {
  return {
    unreadMessagesCount: 0,
    hasUnreadTips: false,
    canSendMessage: true,
    lastReadMessageId: null,
    lastMessage: null,
    fan: {
      id: fanId,
      name: `Fan${fanId}`,
      username: `fan${fanId}`,
      subscribedOnData: { totalSumm: 1284.4 },
    },
  } as OfApiChat;
}

interface TxStub {
  client: OfApiClient;
  txCalls: ListTransactionsParams[];
  setTransactions(txs: OfApiTransaction[]): void;
  failTransactions(fail: boolean): void;
}

/** Marker model mirrors the live endpoint: newest-first list filtered by
 *  startDate; marker = index of the next page into that filtered list. */
function makeTxStub(): TxStub {
  let all: OfApiTransaction[] = [];
  const chats: OfApiChat[] = [chatWithFan(101)];
  let failing = false;
  const state: TxStub = {
    txCalls: [],
    setTransactions: (txs) => {
      all = [...txs].sort((a, b) => Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? ''));
    },
    failTransactions: (fail) => {
      failing = fail;
    },
    client: {
      listChats: vi.fn(async () => ({ chats, nextPageUrl: null })),
      listMessages: vi.fn(async () => ({ messages: [], nextPageUrl: null })),
      listTransactions: vi.fn(async (params: ListTransactionsParams) => {
        if (failing) {
          throw new Error('OFAPI 500');
        }
        state.txCalls.push(params);
        const startMs =
          params.startDate === '-30days' || params.startDate === undefined
            ? Date.now() - 30 * DAY_MS
            : Date.parse(`${params.startDate.replace(' ', 'T')}Z`);
        const filtered = all.filter((tx) => Date.parse(tx.createdAt ?? '') >= startMs);
        const offset = params.marker ?? 0;
        const limit = params.limit ?? 10;
        const page = filtered.slice(offset, offset + limit);
        const more = offset + page.length < filtered.length;
        return {
          transactions: page,
          hasMore: more,
          nextMarker: more ? offset + page.length : null,
          nextPageUrl: null,
        };
      }),
    } as unknown as OfApiClient,
  };
  return state;
}

function tx(id: string, fanId: number, amount: number, daysAgo: number): OfApiTransaction {
  return {
    id,
    amount,
    net: Math.round(amount * 80) / 100, // live payloads carry net (80% after the platform cut)
    type: 'tips',
    createdAt: new Date(Date.now() - daysAgo * DAY_MS).toISOString(),
    user: { id: fanId },
  } as OfApiTransaction;
}

describe('fan-spend sweep', () => {
  let data: DataLayer;
  let stub: TxStub;

  beforeEach(() => {
    vi.useFakeTimers();
    data = createDataLayer({ driverPath: TEST_DRIVER, filePath: ':memory:', encryptionKey: null });
    stub = makeTxStub();
  });

  afterEach(() => {
    vi.useRealTimers();
    data.close();
  });

  function makeSync(options: { spendSweepRollbackToLegacy?: () => boolean } = {}) {
    return createPollingSync({
      client: stub.client,
      data,
      toMediaUrl: () => null,
      sleep: async () => {},
      ...(options.spendSweepRollbackToLegacy === undefined
        ? {}
        : { spendSweepRollbackToLegacy: options.spendSweepRollbackToLegacy }),
    });
  }

  /** Completes the in-flight poll without firing rescheduled timers (same
   *  trick as polling-sync.test.ts drainPoll). */
  async function drainPoll(): Promise<void> {
    for (let i = 0; i < 5000; i += 1) {
      await Promise.resolve();
    }
  }

  /** Poll #1 completes hydration; the independent spend timer then fires. */
  async function bootAndSweep(sync: ReturnType<typeof makeSync>): Promise<void> {
    sync.start([ACCT]); // poll #1 floats
    await drainPoll();
    await vi.advanceTimersByTimeAsync(0); // first spend sweep
    await drainPoll();
  }

  function spendOf(chatId: string): { lifetimeSpend: number | null; spend30d: number | null } {
    const item = data.chats.list({ accountId: ACCT, filter: 'all' }).items.find((c) => c.chatId === chatId);
    if (!item) {
      throw new Error(`chat ${chatId} missing from list`);
    }
    return { lifetimeSpend: item.lifetimeSpend, spend30d: item.spend30d };
  }

  it('first sweep walks the full -30days window with marker pagination and feeds the figures', async () => {
    stub.setTransactions([
      ...Array.from({ length: 12 }, (_, i) => tx(`fill-${i}`, 101, 1, 1)), // forces page 2 at limit 10
      tx('big', 101, 100, 2),
      tx('cents', 101, 20.5, 29),
    ]);

    const sync = makeSync();
    await bootAndSweep(sync);

    expect(stub.txCalls[0]?.startDate).toBe('-30days');
    expect(stub.txCalls[0]?.limit).toBe(10);
    expect(stub.txCalls).toHaveLength(2); // 14 transactions at limit 10 → marker page 2
    expect(stub.txCalls[1]?.marker).toBe(10);

    const marcus = spendOf('101');
    // net sums: 12 × 0.8 + 80 + 16.4 — the figure is creator net, not gross
    expect(marcus.spend30d).toBeCloseTo(9.6 + 80 + 16.4);
    expect(marcus.lifetimeSpend).toBeCloseTo(1284.4); // from the list-poll fan payload
    sync.stop();
  });

  it('incremental sweep resumes from the newest cached row minus the 1h overlap', async () => {
    const t1 = tx('t1', 101, 50, 2);
    stub.setTransactions([t1]);
    const sync = makeSync();
    await bootAndSweep(sync);
    expect(stub.txCalls).toHaveLength(1);

    // a new tip lands; the next sweep becomes due after the 10-minute cadence
    stub.setTransactions([tx('t2', 101, 25, 0), t1]);
    await vi.advanceTimersByTimeAsync(SPEND_SWEEP_INTERVAL_MS);
    await drainPoll();

    expect(stub.txCalls).toHaveLength(2);
    const expectedStart = new Date(Date.parse(t1.createdAt ?? '') - 60 * 60_000)
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ');
    expect(stub.txCalls[1]?.startDate).toBe(expectedStart);
    expect(spendOf('101').spend30d).toBeCloseTo(60); // net of 50 + 25; t1 re-upsert is idempotent
    sync.stop();
  });

  it('a sweep is not re-run before its cadence elapses', async () => {
    stub.setTransactions([tx('t1', 101, 50, 2)]);
    const sync = makeSync();
    await bootAndSweep(sync);
    await vi.advanceTimersByTimeAsync(SPEND_SWEEP_INTERVAL_MS - 1);
    expect(stub.txCalls).toHaveLength(1);
    sync.stop();
  });

  it('the D6 rollback flag preserves the legacy 10-minute spend sweep cadence', async () => {
    stub.setTransactions([tx('t1', 101, 50, 2)]);
    const sync = makeSync({ spendSweepRollbackToLegacy: () => true });
    await bootAndSweep(sync);
    await vi.advanceTimersByTimeAsync(SPEND_SWEEP_INTERVAL_MS - 1);
    expect(stub.txCalls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await drainPoll();
    expect(stub.txCalls).toHaveLength(2);
    sync.stop();
  });

  it('disabling the rollback flag does not reduce spend-sweep cadence before D6 acceptance', async () => {
    stub.setTransactions([tx('t1', 101, 50, 2)]);
    const sync = makeSync({ spendSweepRollbackToLegacy: () => false });
    await bootAndSweep(sync);
    await vi.advanceTimersByTimeAsync(SPEND_SWEEP_INTERVAL_MS - 1);
    expect(stub.txCalls).toHaveLength(1);
    sync.stop();
  });

  it('a transactions failure never degrades the chat poll status', async () => {
    stub.failTransactions(true);
    const sync = makeSync();
    await bootAndSweep(sync);

    expect(sync.status().state).toBe('live');
    expect(data.chats.get(ACCT, '101')).not.toBeNull();
    expect(spendOf('101').spend30d).toBeNull();
    sync.stop();
  });
});
