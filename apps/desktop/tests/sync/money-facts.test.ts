// D39: the money-facts catch-up (`GET /api/v1/events/v2/facts`) and the shared
// fact apply. History, never news: state only, no OFAPI credits, no alerts.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HubMoneyFactsResult } from '@chatgoose/shared/hub/index';
import { createDataLayer, type DataLayer } from '../../src/main/db/index';
import {
  applyMoneyFact,
  createMoneyFactsCatchUp,
  moneyFactsStateKey,
  type MoneyFactsCatchUp,
  type MoneyFactsFetch,
} from '../../src/main/sync/money-facts';

const TEST_DRIVER = 'bsqlite3-mc-node';
const ACCT = 'acct_a571';
const PAGE_ID = 9;
const NOW_MS = Date.parse('2026-09-27T10:00:00.000Z');

type Fact = Record<string, unknown> & { accountSeq: number };

function ppvFact(seq: number, overrides: Record<string, unknown> = {}): Fact {
  return {
    accountId: PAGE_ID,
    accountSeq: seq,
    type: 'message.ppv_unlocked',
    occurredAt: '2026-09-26T14:37:00.000Z',
    data: { amountText: '$67.00' },
    fanRef: '15544628',
    conversationRef: '15544628',
    messageRef: `m${seq}`,
    accountRef: ACCT,
    transactionRef: null,
    provenance: 'live',
    thread: { fanName: 'Neil/US', username: 'u15544628' },
    ...overrides,
  };
}

function txFact(seq: number, transactionRef: string, overrides: Record<string, unknown> = {}): Fact {
  return {
    accountId: PAGE_ID,
    accountSeq: seq,
    type: 'transaction.posted',
    occurredAt: '2026-09-26T14:37:10.000Z',
    data: { amount: 67, netAmount: 53.6, amountUnit: 'dollars', transactionType: 'message' },
    fanRef: '15544628',
    conversationRef: null,
    messageRef: null,
    accountRef: ACCT,
    transactionRef,
    provenance: 'live',
    ...overrides,
  };
}

function tipFact(seq: number): Fact {
  return {
    accountId: PAGE_ID,
    accountSeq: seq,
    type: 'tip.received',
    occurredAt: '2026-09-26T14:40:00.000Z',
    data: { amountGross: 5, amountNet: 4 },
    fanRef: '15544628',
    conversationRef: '15544628',
    messageRef: null,
    accountRef: ACCT,
    provenance: 'live',
  };
}

/** Core's facts route over an in-memory ledger (routes eventsV2Facts). */
function makeCore(initial: Fact[] = []) {
  const ledger: Fact[] = [...initial];
  let head = Math.max(0, ...initial.map((fact) => fact.accountSeq));
  const calls: Array<{ hubAccountId: number; afterSeq: number; limit: number }> = [];
  let failWith: Error | null = null;
  let forbidden = false;
  let gate: Promise<void> | null = null;
  const fetchFacts: MoneyFactsFetch = async (args) => {
    calls.push(args);
    // The page is read when the request arrives; a held response only
    // delays its delivery (facts committed meanwhile belong to a later read).
    const result = answer(args);
    if (gate !== null) {
      await gate;
    }
    return result;
  };
  function answer(args: { hubAccountId: number; afterSeq: number; limit: number }): HubMoneyFactsResult {
    if (failWith !== null) {
      throw failWith;
    }
    if (forbidden) {
      return { kind: 'forbidden' };
    }
    if (args.afterSeq > head) {
      return { kind: 'ahead-of-head', message: `afterSeq ${args.afterSeq} is ahead of head ${head}; restart from 0` };
    }
    const rows = ledger
      .filter((fact) => fact.accountSeq > args.afterSeq && fact.accountSeq <= head)
      .sort((left, right) => left.accountSeq - right.accountSeq);
    const hasMore = rows.length > args.limit;
    const page = rows.slice(0, args.limit);
    const result: HubMoneyFactsResult = {
      kind: 'page',
      page: {
        accountId: args.hubAccountId,
        throughSeq: head,
        facts: page,
        nextAfterSeq: hasMore ? page.at(-1)!.accountSeq : head,
        hasMore,
      },
    };
    return result;
  }
  return {
    fetchFacts,
    calls,
    append(...facts: Fact[]) {
      ledger.push(...facts);
      head = Math.max(head, ...facts.map((fact) => fact.accountSeq));
    },
    /** Non-fact ledger rows still move the head. */
    setHead(seq: number) {
      head = seq;
    },
    fail(error: Error | null) {
      failWith = error;
    },
    forbid() {
      forbidden = true;
    },
    hold() {
      let release!: () => void;
      gate = new Promise((resolve) => {
        release = resolve;
      });
      return () => {
        gate = null;
        release();
      };
    },
  };
}

describe('money facts catch-up (D39)', () => {
  let data: DataLayer;
  let logs: Array<{ level: string; message: string; fields?: Record<string, unknown> }>;
  let handled: string[];

  beforeEach(() => {
    data = createDataLayer({ driverPath: TEST_DRIVER, filePath: ':memory:', encryptionKey: null });
    logs = [];
    handled = [ACCT];
  });
  afterEach(() => {
    data.close();
  });

  function build(core: ReturnType<typeof makeCore>, options: { pageLimit?: number; retryDelaysMs?: number[] } = {}): MoneyFactsCatchUp {
    const catchUp = createMoneyFactsCatchUp({
      data,
      fetchFacts: core.fetchFacts,
      accountHandled: (accountId) => handled.includes(accountId),
      now: () => NOW_MS,
      onLog: (level, message, fields) => logs.push({ level, message, ...(fields ? { fields } : {}) }),
      ...(options.pageLimit !== undefined ? { pageLimit: options.pageLimit } : {}),
      ...(options.retryDelaysMs !== undefined ? { retryDelaysMs: options.retryDelaysMs } : {}),
    });
    catchUp.start();
    return catchUp;
  }

  function caughtUpLogs() {
    return logs.filter((entry) => entry.message === 'money facts caught up');
  }

  it('waits for the Core page id, then reads the whole history page by page', async () => {
    const core = makeCore([
      ppvFact(10), txFact(11, 'tx-a'), tipFact(12), ppvFact(13), txFact(14, 'tx-b'),
    ]);
    core.setHead(20); // later non-fact ledger rows
    const catchUp = build(core, { pageLimit: 2 });

    catchUp.request([ACCT], 'session-start');
    await catchUp.whenIdle();
    expect(core.calls).toEqual([]); // the page id arrives with the first frame
    expect(catchUp.notePage(ACCT, PAGE_ID)).toBe(true);
    catchUp.request([ACCT], 'page-mapped');
    await catchUp.whenIdle();

    // hasMore → nextAfterSeq = the page's last seq; the last page → throughSeq.
    expect(core.calls.map((call) => call.afterSeq)).toEqual([0, 11, 13]);
    expect(core.calls.every((call) => call.hubAccountId === PAGE_ID && call.limit === 2)).toBe(true);
    expect(catchUp.state(ACCT)).toMatchObject({ hubAccountId: PAGE_ID, afterSeq: 20 });
    expect(data.messageFacts.countByAccount(ACCT)).toBe(2);
    expect(data.fanTransactions.statsByFanSince(ACCT, '2026-01-01T00:00:00.000Z').get('15544628'))
      .toEqual({ total: 53.6 * 2, count: 2 });
    expect(caughtUpLogs()).toHaveLength(1);
    expect(caughtUpLogs()[0]?.fields).toMatchObject({
      accountId: ACCT,
      hubAccountId: PAGE_ID,
      reason: 'page-mapped',
      fromSeq: 0,
      afterSeq: 20,
      throughSeq: 20,
      pages: 3,
      facts: 5,
      ppvNew: 2,
      txInserted: 2,
      tips: 1,
      localPpvFacts: 2,
    });
  });

  it('resumes from the persisted watermark: a later run reads only newer facts', async () => {
    const core = makeCore([ppvFact(10), ppvFact(11)]);
    const first = build(core);
    first.notePage(ACCT, PAGE_ID);
    first.request([ACCT], 'session-start');
    await first.whenIdle();
    first.stop();

    // Next launch: a fresh worker over the same DB.
    core.append(ppvFact(30), txFact(31, 'tx-new'));
    const second = build(core);
    expect(second.notePage(ACCT, PAGE_ID)).toBe(false); // known page, nothing owed
    second.request([ACCT], 'session-start');
    await second.whenIdle();
    expect(core.calls.map((call) => call.afterSeq)).toEqual([0, 11]);
    expect(caughtUpLogs().at(-1)?.fields).toMatchObject({ fromSeq: 11, facts: 2, ppvNew: 1, localPpvFacts: 3 });
  });

  it('409 (watermark ahead of Core\'s head) restarts once from 0; applies stay idempotent', async () => {
    const core = makeCore([ppvFact(3), ppvFact(4)]);
    data.settings.set(moneyFactsStateKey(ACCT), { hubAccountId: PAGE_ID, afterSeq: 500, updatedAt: 'x' });
    data.messageFacts.recordPpvUnlock({
      accountId: ACCT, chatId: '15544628', messageId: 'm3', hubAccountId: PAGE_ID,
      accountSeq: 3, amountUsd: 67, provenance: 'live', occurredAt: null, source: 'stream',
    }, new Date(NOW_MS).toISOString());
    const catchUp = build(core);
    catchUp.request([ACCT], 'gap');
    await catchUp.whenIdle();

    expect(core.calls.map((call) => call.afterSeq)).toEqual([500, 0]);
    expect(logs.some((entry) => entry.message === 'money facts watermark ahead of Core; restarting from 0')).toBe(true);
    expect(catchUp.state(ACCT)?.afterSeq).toBe(4);
    expect(caughtUpLogs()[0]?.fields).toMatchObject({ ppvNew: 1, localPpvFacts: 2 });
  });

  it('403 (page outside the grants) stops without retrying', async () => {
    const core = makeCore([ppvFact(1)]);
    core.forbid();
    const catchUp = build(core, { retryDelaysMs: [1, 1] });
    catchUp.notePage(ACCT, PAGE_ID);
    catchUp.request([ACCT], 'session-start');
    await catchUp.whenIdle();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await catchUp.whenIdle();
    expect(core.calls).toHaveLength(1);
    expect(logs.some((entry) => entry.message === 'money facts catch-up refused: page outside the grants')).toBe(true);
    expect(catchUp.state(ACCT)?.afterSeq).toBe(0);
  });

  it('a failed run retries with backoff, then gives up until the next trigger', async () => {
    const core = makeCore([ppvFact(1)]);
    core.fail(new Error('hub 503'));
    const catchUp = build(core, { retryDelaysMs: [2, 2] });
    catchUp.notePage(ACCT, PAGE_ID);
    catchUp.request([ACCT], 'session-start');
    for (let i = 0; i < 20 && core.calls.length < 3; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      await catchUp.whenIdle();
    }
    expect(core.calls).toHaveLength(3); // first try + 2 retries
    expect(logs.filter((entry) => entry.message === 'money facts catch-up failed')).toHaveLength(2);
    expect(logs.some((entry) => entry.message === 'money facts catch-up gave up until the next trigger')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(core.calls).toHaveLength(3);

    // The next trigger (a gap recovery) tries again and succeeds.
    core.fail(null);
    catchUp.request([ACCT], 'gap');
    await catchUp.whenIdle();
    expect(data.messageFacts.countByAccount(ACCT)).toBe(1);
  });

  it('a trigger during a run re-runs from the new watermark (a gap recovered mid-run)', async () => {
    const core = makeCore([ppvFact(1)]);
    const catchUp = build(core);
    catchUp.notePage(ACCT, PAGE_ID);
    const release = core.hold();
    catchUp.request([ACCT], 'session-start');
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(core.calls).toHaveLength(1);
    // Facts committed on Core after the running request read its page.
    core.append(ppvFact(2));
    catchUp.request([ACCT], 'gap');
    release();
    await catchUp.whenIdle();
    expect(core.calls.map((call) => call.afterSeq)).toEqual([0, 1]);
    expect(data.messageFacts.countByAccount(ACCT)).toBe(2);
  });

  it('a page and its watermark commit together: a failing apply leaves both untouched', async () => {
    const core = makeCore([ppvFact(1), ppvFact(2)]);
    const catchUp = build(core, { retryDelaysMs: [] });
    catchUp.notePage(ACCT, PAGE_ID);
    const original = data.messageFacts.recordPpvUnlock.bind(data.messageFacts);
    const spy = vi.spyOn(data.messageFacts, 'recordPpvUnlock').mockImplementation((fact, at) => {
      if (fact.messageId === 'm2') {
        throw new Error('disk full');
      }
      return original(fact, at);
    });
    catchUp.request([ACCT], 'session-start');
    await catchUp.whenIdle();
    spy.mockRestore();
    expect(data.messageFacts.countByAccount(ACCT)).toBe(0); // m1 rolled back with the page
    expect(catchUp.state(ACCT)?.afterSeq).toBe(0);
  });

  it('a repair fact from the catch-up replaces the superseded wrong-chat fact', async () => {
    // Before the Repair run: the wrong-ref July fact is still served.
    const core = makeCore([ppvFact(1107, { conversationRef: '514788334', fanRef: '514788334', messageRef: 'm-july' })]);
    const catchUp = build(core);
    catchUp.notePage(ACCT, PAGE_ID);
    catchUp.request([ACCT], 'session-start');
    await catchUp.whenIdle();
    expect(data.messageFacts.has(ACCT, '514788334', 'm-july')).toBe(true);

    // After it: Core excludes the superseded fact and serves the repair.
    core.append(ppvFact(260001, { messageRef: 'm-july', provenance: 'repair', data: { amountText: '$25.00', supersedesEventId: 1 } }));
    catchUp.request([ACCT], 'gap');
    await catchUp.whenIdle();
    expect(data.messageFacts.has(ACCT, '514788334', 'm-july')).toBe(false);
    expect(data.messageFacts.has(ACCT, '15544628', 'm-july')).toBe(true);
    expect(data.messageFacts.countByAccount(ACCT)).toBe(1);
    expect(caughtUpLogs().at(-1)?.fields).toMatchObject({ ppvRepaired: 1 });
  });

  it('transaction.posted: one money change per transaction, whoever wrote it first', async () => {
    data.fanTransactions.upsertMany([{
      accountId: ACCT, txId: 'tx-swept', fanId: '15544628', amount: 67, net: 53.6,
      type: 'message', createdAt: '2026-09-26T14:37:10.000Z',
    }]);
    const core = makeCore([txFact(1, 'tx-swept'), txFact(2, 'tx-new'), txFact(3, 'tx-new-dup-key-check')]);
    const catchUp = build(core);
    catchUp.notePage(ACCT, PAGE_ID);
    catchUp.request([ACCT], 'session-start');
    await catchUp.whenIdle();
    // A second full pass (e.g. after a 409 restart) inserts nothing.
    data.settings.set(moneyFactsStateKey(ACCT), { hubAccountId: PAGE_ID, afterSeq: 0, updatedAt: 'x' });
    catchUp.request([ACCT], 'gap');
    await catchUp.whenIdle();
    expect(data.fanTransactions.statsByFanSince(ACCT, '2026-01-01T00:00:00.000Z').get('15544628'))
      .toEqual({ total: 53.6 * 3, count: 3 });
    expect(caughtUpLogs().map((entry) => entry.fields?.['txInserted'])).toEqual([2, 0]);
  });

  it('skips malformed, foreign and unmapped rows, counting them', async () => {
    const core = makeCore([
      ppvFact(1),
      { accountSeq: 2, garbage: true },
      ppvFact(3, { accountRef: 'acct_other' }),
      ppvFact(4, { conversationRef: null }),
      ppvFact(5, { type: 'message.received' }),
    ]);
    const catchUp = build(core);
    catchUp.notePage(ACCT, PAGE_ID);
    catchUp.request([ACCT], 'session-start');
    await catchUp.whenIdle();
    expect(caughtUpLogs()[0]?.fields).toMatchObject({ ppvNew: 1, malformed: 1, foreign: 1, unmapped: 2 });
    expect(catchUp.state(ACCT)?.afterSeq).toBe(5);
  });

  it('a remapped page restarts its history from 0; a revoked account is never read', async () => {
    const core = makeCore([ppvFact(1)]);
    const catchUp = build(core);
    expect(catchUp.notePage(ACCT, PAGE_ID)).toBe(true);
    expect(catchUp.notePage(ACCT, PAGE_ID)).toBe(false);
    data.settings.set(moneyFactsStateKey(ACCT), { hubAccountId: PAGE_ID, afterSeq: 77, updatedAt: 'x' });
    expect(catchUp.notePage(ACCT, 12)).toBe(true);
    expect(catchUp.state(ACCT)).toMatchObject({ hubAccountId: 12, afterSeq: 0 });

    handled = [];
    catchUp.request([ACCT], 'gap');
    await catchUp.whenIdle();
    expect(core.calls).toEqual([]);
  });

  it('stop() during a page in flight writes nothing afterwards (the DB may be closing)', async () => {
    const core = makeCore([ppvFact(1)]);
    const catchUp = build(core);
    catchUp.notePage(ACCT, PAGE_ID);
    const release = core.hold();
    catchUp.request([ACCT], 'session-start');
    await new Promise((resolve) => setTimeout(resolve, 5));
    catchUp.stop();
    release();
    await catchUp.whenIdle();
    expect(data.messageFacts.countByAccount(ACCT)).toBe(0);
    expect(catchUp.state(ACCT)?.afterSeq).toBe(0);
  });

  it('applyMoneyFact leaves transactions past the retention horizon alone', () => {
    const outcome = applyMoneyFact(
      data,
      {
        type: 'transactionPosted',
        accountId: ACCT,
        fanId: '1',
        transactionId: 'ancient',
        amountUsd: 5,
        createdAt: '2025-01-01T00:00:00.000Z',
      },
      { hubAccountId: PAGE_ID, accountSeq: 1, provenance: 'live', occurredAt: null, source: 'catch-up' },
      NOW_MS,
    );
    expect(outcome).toEqual({ kind: 'transaction', inserted: false, skipped: 'retention' });
  });
});
