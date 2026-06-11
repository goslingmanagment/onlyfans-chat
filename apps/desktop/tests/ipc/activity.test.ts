// query:activity.summary assembly (PLAN item 9). Covers BOTH panel states of
// the binding mockup: state A (core off — polling only) and state B (hub live)
// — core is off in today's reality, so hub-live is exercised via fixtures here.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccountUpsert, DataLayer } from '@main/db/index';
import { buildActivitySummary, aiTodayUsd, sendsToday } from '@main/ipc/activity';
import type { ActivitySync } from '@main/ipc/activity';
import type { CreditMeter } from '@main/ofapi/credit-meter';
import { memoryDataLayer } from '../db/helpers';

const NOW = Date.parse('2026-06-11T20:00:00Z');
const TODAY = '2026-06-11';

function account(id: string, displayName: string): AccountUpsert {
  return {
    id,
    username: id.replace('acct_', ''),
    displayName,
    avatar: null,
    authState: 'authenticated',
    raw: {},
  };
}

function fakeMeter(balance: number | null, rpmRemaining: number | null): CreditMeter {
  return {
    record: () => undefined,
    hydrate: () => undefined,
    subscribe: () => () => undefined,
    snapshot: () => ({
      balance,
      usedToday: 0,
      rpmRemaining,
      utcDay: TODAY,
      usedTodayByPurpose: {},
    }),
  };
}

function fakeSync(overrides: Partial<ActivitySync> = {}): ActivitySync {
  return {
    start: () => undefined,
    stop: () => undefined,
    subscribe: () => () => undefined,
    refreshChat: () => Promise.resolve(),
    openConversation: () => Promise.resolve(),
    closeConversation: () => undefined,
    setFocusedAccount: () => undefined,
    setWindowVisible: () => undefined,
    forceRefresh: () => Promise.resolve(),
    status: () => ({
      freshness: { acct_free: '2026-06-11T19:59:52.000Z' },
      state: 'live',
      pollIntervalsMs: { acct_free: 20_000, acct_vip: 60_000 },
      deepSweepEveryMs: 300_000,
    }),
    ...overrides,
  };
}

function insertOutboxRow(data: DataLayer, localId: string, state: string, updatedAt: string): void {
  data.db
    .prepare(
      `INSERT INTO outbox (local_id, account_id, chat_id, text, state, created_at, updated_at)
       VALUES (@local_id, 'acct_free', '101', 'hi', @state, @updated_at, @updated_at)`,
    )
    .run({ local_id: localId, state, updated_at: updatedAt });
}

describe('buildActivitySummary', () => {
  let data: DataLayer;

  beforeEach(() => {
    data = memoryDataLayer();
    data.accounts.upsertMany([account('acct_free', 'LoraVie FREE'), account('acct_vip', 'LoraVie VIP')]);
  });
  afterEach(() => data.close());

  it('state A (core off): polling mode, per-purpose credit split, AI ledger, sends', () => {
    // credits: today's split + an older day for the pace estimate
    data.creditLog.add(TODAY, 'hot-poll', 612, 612);
    data.creditLog.add(TODAY, 'deep-sweep', 180, 36);
    data.creditLog.add(TODAY, 'message-tail', 64, 64);
    data.creditLog.add('2026-06-10', 'hot-poll', 856, 856);

    // AI: one fast-reply run, accepted; one scan
    data.aiSpendLog.recordRun({
      day: TODAY,
      feature: 'fast-reply',
      isCacheHit: false,
      inputTokens: 1_000,
      cacheWriteTokens: 0,
      cacheReadTokens: 3_000,
      outputTokens: 200,
      costMicroUsd: 12_000,
      chatId: '101',
    });
    data.aiSpendLog.markInserted(TODAY, 'fast-reply');
    data.aiSpendLog.recordRun({
      day: TODAY,
      feature: 'fan-summary',
      isCacheHit: false,
      inputTokens: 90_000,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      outputTokens: 2_000,
      costMicroUsd: 110_000,
      chatId: '777',
    });
    data.fans.upsert({
      accountId: 'acct_free',
      fanId: '777',
      username: 'charles',
      name: 'Charles',
      customName: null,
      avatar: null,
      about: null,
      lastSeen: null,
      spending: null,
      subscription: null,
      fetchedAt: new Date(NOW).toISOString(),
    });

    // sends today + one stale yesterday row that must not count
    insertOutboxRow(data, 'L1', 'sent', `${TODAY}T10:00:00.000Z`);
    insertOutboxRow(data, 'L2', 'sent', `${TODAY}T11:00:00.000Z`);
    insertOutboxRow(data, 'L3', 'failed', `${TODAY}T12:00:00.000Z`);
    insertOutboxRow(data, 'L4', 'sent', '2026-06-10T10:00:00.000Z');

    // parked usage events (hub off) — one quarantined
    data.db
      .prepare(
        `INSERT INTO usage_events (client_event_id, payload, created_at)
         VALUES ('e1', '{"feature":"fast-reply"}', @t), ('e2', '{"quarantined":true}', @t)`,
      )
      .run({ t: `${TODAY}T10:00:00.000Z` });

    const vm = buildActivitySummary({
      data,
      sync: fakeSync(),
      creditMeter: fakeMeter(96_246, 4_969),
      aiKeys: { hasAnthropicKey: true, hasOpenRouterKey: false },
      now: () => NOW,
    });

    expect(vm.mode).toBe('polling');
    expect(vm.syncState).toBe('live');
    expect(vm.accounts).toEqual([
      {
        accountId: 'acct_free',
        name: 'LoraVie FREE',
        lastPolledAt: '2026-06-11T19:59:52.000Z',
        pollIntervalMs: 20_000,
      },
      { accountId: 'acct_vip', name: 'LoraVie VIP', lastPolledAt: null, pollIntervalMs: 60_000 },
    ]);
    expect(vm.deepSweepEveryMs).toBe(300_000);
    expect(vm.hub.status).toBe('off');
    expect(vm.hub.pendingUsageEvents).toBe(1);
    expect(vm.hub.quarantinedUsageEvents).toBe(1);

    expect(vm.credits.rows).toEqual([
      { purpose: 'hot-poll', requests: 612, credits: 612 },
      { purpose: 'deep-sweep', requests: 36, credits: 180 },
      { purpose: 'message-tail', requests: 64, credits: 64 },
    ]);
    expect(vm.credits.totalCredits).toBe(856);
    expect(vm.credits.totalRequests).toBe(712);
    expect(vm.credits.balance).toBe(96_246);
    expect(vm.credits.rpmRemaining).toBe(4_969);
    // pace: mean(856, 856) = 856 → 96,246 / 856 ≈ 112 days
    expect(vm.credits.estimatedDaysLeft).toBe(112);

    expect(vm.aiSpend.rows).toEqual([
      { feature: 'fast-reply', runs: 1, inserted: 1, tokens: 4_200, costUsd: 0.012 },
      { feature: 'fan-summary', runs: 1, inserted: null, tokens: 92_000, costUsd: 0.11 },
    ]);
    expect(vm.aiSpend.totals).toEqual({
      runs: 2,
      inserted: 1,
      insertableRuns: 1,
      tokens: 96_200,
      costUsd: 0.122,
    });
    expect(vm.aiSpend.topRun).toEqual({ feature: 'fan-summary', costUsd: 0.11, fanLabel: 'Charles' });
    expect(vm.aiSpend.sevenDayUsd).toBe(0.122);

    expect(vm.sends).toEqual({ sent: 2, failed: 1, unconfirmed: 0 });
    expect(vm.ai).toEqual({ hasAnthropicKey: true, hasOpenRouterKey: false });
  });

  it('state B (hub live): hub badge, event counters, queues, synced summaries', () => {
    data.db
      .prepare(
        `INSERT INTO summaries (account_id, fan_id, body, personality_id, personality_updated_at,
           generated_at, hub_sync_state)
         VALUES
           ('acct_free', '1', 'b1', 'p', 0, 0, '{"state":"pending","at":"2026-06-11T10:00:00.000Z"}'),
           ('acct_free', '2', 'b2', 'p', 0, 0, '{"state":"synced","at":"2026-06-11T11:00:00.000Z"}'),
           ('acct_free', '3', 'b3', 'p', 0, 0, '{"state":"synced","at":"2026-06-10T11:00:00.000Z"}'),
           ('acct_free', '4', 'b4', 'p', 0, 0, NULL)`,
      )
      .run({});

    const vm = buildActivitySummary({
      data,
      sync: fakeSync({
        hubStatus: () => 'live',
        hubActivity: () => ({
          lastEventAt: NOW - 3_000,
          lastEventType: 'messageReceived',
          eventsToday: 1_204,
          liveSinceMs: NOW - 6 * 60 * 60_000,
          statusChangedAtMs: NOW - 6 * 60 * 60_000,
          droppedFrames: 0,
        }),
        status: () => ({
          freshness: { acct_free: '2026-06-11T19:58:00.000Z' },
          state: 'live',
          pollIntervalsMs: { acct_free: 120_000 },
          deepSweepEveryMs: 300_000,
        }),
      }),
      creditMeter: fakeMeter(null, null),
      aiKeys: { hasAnthropicKey: true, hasOpenRouterKey: false },
      now: () => NOW,
    });

    expect(vm.mode).toBe('hub-live');
    expect(vm.hub).toEqual({
      status: 'live',
      lastEventAt: new Date(NOW - 3_000).toISOString(),
      lastEventType: 'messageReceived',
      eventsToday: 1_204,
      liveSince: new Date(NOW - 6 * 60 * 60_000).toISOString(),
      statusChangedAt: new Date(NOW - 6 * 60 * 60_000).toISOString(),
      droppedFrames: 0,
      pendingUsageEvents: 0,
      quarantinedUsageEvents: 0,
      pendingSummaries: 1,
      syncedSummariesToday: 1,
    });
    // hub demotion shows through as the relaxed effective cadence
    expect(vm.accounts[0]?.pollIntervalMs).toBe(120_000);
  });

  it('renders empty-but-valid with no sync, no meter, no data (fresh install)', () => {
    const vm = buildActivitySummary({
      data,
      sync: null,
      creditMeter: null,
      aiKeys: { hasAnthropicKey: false, hasOpenRouterKey: false },
      now: () => NOW,
    });
    expect(vm.mode).toBe('polling');
    expect(vm.syncState).toBe('offline');
    expect(vm.credits.rows).toEqual([]);
    expect(vm.credits.estimatedDaysLeft).toBeNull();
    expect(vm.aiSpend.rows).toEqual([]);
    expect(vm.aiSpend.topRun).toBeNull();
    expect(vm.sends).toEqual({ sent: 0, failed: 0, unconfirmed: 0 });
  });
});

describe('status-bar aggregates', () => {
  let data: DataLayer;
  beforeEach(() => {
    data = memoryDataLayer();
  });
  afterEach(() => data.close());

  it('aiTodayUsd sums only today', () => {
    const base = {
      feature: 'fast-reply',
      isCacheHit: false,
      inputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      outputTokens: 0,
      chatId: null,
    };
    data.aiSpendLog.recordRun({ ...base, day: TODAY, costMicroUsd: 860_000 });
    data.aiSpendLog.recordRun({ ...base, day: '2026-06-10', costMicroUsd: 4_050_000 });
    expect(aiTodayUsd(data, TODAY)).toBe(0.86);
  });

  it('sendsToday counts only today transitions', () => {
    insertOutboxRow(data, 'a', 'sent', `${TODAY}T01:00:00.000Z`);
    insertOutboxRow(data, 'b', 'unconfirmed', `${TODAY}T02:00:00.000Z`);
    insertOutboxRow(data, 'c', 'cancelled', `${TODAY}T03:00:00.000Z`);
    insertOutboxRow(data, 'd', 'sent', '2026-06-09T01:00:00.000Z');
    expect(sendsToday(data, TODAY)).toEqual({ sent: 1, failed: 0, unconfirmed: 1 });
  });

  function insertOutboxRow(data2: DataLayer, localId: string, state: string, updatedAt: string): void {
    data2.db
      .prepare(
        `INSERT INTO outbox (local_id, account_id, chat_id, text, state, created_at, updated_at)
         VALUES (@local_id, 'acct_free', '101', 'hi', @state, @updated_at, @updated_at)`,
      )
      .run({ local_id: localId, state, updated_at: updatedAt });
  }
});
