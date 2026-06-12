// Spenders service tests (PLAN item 12 DoD: board IPC queries fixture-tested).
// The OFAPI side is a stub client fed from the user-lists fixtures' shapes; the
// join side runs against the real in-memory SQLite layer.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createSpendersService, SPENDERS_TTL_MS } from '@main/spenders/service';
import type { SpendersService } from '@main/spenders/service';
import type { OfApiClient } from '@main/ofapi/client';
import type { DataLayer } from '@main/db/index';
import { memoryDataLayer, sampleChat, sampleMessage } from '../db/helpers';

const ACCOUNT = 'acct_1';
const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-06-13T12:00:00.000Z').getTime();

const FIXTURES = join(import.meta.dirname, '../../../../tests/fixtures/ofapi');

function loadFixtureData(name: string): unknown {
  return z
    .looseObject({ data: z.unknown() })
    .parse(JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'))).data;
}

interface StubCalls {
  lists: number;
  rosters: Array<{ listId: string; offset: number | undefined }>;
}

/** Roster pages per list id; lists payload mirrors the user-lists fixture. */
function stubClient(args: {
  lists: Array<{ id: string | number; type?: string; name?: string; usersCount?: number }>;
  rosters: Record<string, Array<Array<{ id: number; name?: string; username?: string }>>>;
  calls: StubCalls;
}): OfApiClient {
  return {
    listUserLists: async () => {
      args.calls.lists += 1;
      return { lists: args.lists, hasMore: false };
    },
    listUserListUsers: async (params: { userListId: string; offset?: number; limit?: number }) => {
      args.calls.rosters.push({ listId: params.userListId, offset: params.offset });
      const pages = args.rosters[params.userListId] ?? [[]];
      const offset = params.offset ?? 0;
      const pageIndex = Math.floor(offset / 100);
      const page = pages[pageIndex] ?? [];
      const hasMore = pageIndex < pages.length - 1;
      return {
        users: page,
        hasMore,
        nextOffset: hasMore ? (pageIndex + 1) * 100 : null,
      };
    },
  } as unknown as OfApiClient;
}

function isoDaysAgo(days: number): string {
  return new Date(NOW - days * DAY_MS).toISOString();
}

let data: DataLayer;
let calls: StubCalls;
let mapping: string[];

function makeService(client: OfApiClient): SpendersService {
  return createSpendersService({
    client,
    data,
    toMediaUrl: (url) => `media://stub-${url.length}`,
    getMappedListIds: async (accountId) => (accountId === ACCOUNT ? mapping : []),
    now: () => NOW,
  });
}

function seedFan(fanId: string, total: number): void {
  data.fans.upsert({
    accountId: ACCOUNT,
    fanId,
    username: `user${fanId}`,
    name: `Fan ${fanId}`,
    customName: null,
    avatar: null,
    about: null,
    lastSeen: null,
    spending: { total, subscriptions: 0, tips: total, messages: 0, posts: 0, streams: 0 },
    subscription: null,
    fetchedAt: isoDaysAgo(0),
  });
}

beforeEach(() => {
  data = memoryDataLayer();
  calls = { lists: 0, rosters: [] };
  mapping = ['100', '200'];
});

describe('lists', () => {
  it('parses the live-shape fixture: string ids kept, names entity-decoded', async () => {
    const fixtureLists = z
      .looseObject({
        list: z.array(
          z.looseObject({
            id: z.union([z.string(), z.number()]),
            type: z.string(),
            name: z.string(),
            usersCount: z.number(),
          }),
        ),
      })
      .parse(loadFixtureData('user-lists.json')).list;
    const service = makeService(stubClient({ lists: fixtureLists, rosters: {}, calls }));
    const { lists } = await service.lists(ACCOUNT);
    expect(lists).toHaveLength(6);
    expect(lists[0]).toEqual({ id: '1247248934', name: '🐳 Кит 600+_OM', usersCount: 3, custom: true });
    // HTML entities in live names decode for display ('&lt;' → '<')
    expect(lists[3]?.name).toBe('Freeloaders (< 45 days)');
    expect(lists[4]).toEqual({ id: 'recent', name: 'Recent (last 24 hours)', usersCount: 16, custom: false });
  });

  it('TTL-caches: a second call inside the window costs no request', async () => {
    const service = makeService(stubClient({ lists: [], rosters: {}, calls }));
    await service.lists(ACCOUNT);
    await service.lists(ACCOUNT);
    expect(calls.lists).toBe(1);
  });
});

describe('roster', () => {
  it('rejects unmapped lists (settings own the shelf set)', async () => {
    const service = makeService(stubClient({ lists: [], rosters: {}, calls }));
    await expect(service.roster(ACCOUNT, '999')).rejects.toThrow(/not mapped/);
  });

  it('joins local stores: lifetime, 30-day, preview, counters, silence dot', async () => {
    seedFan('1', 12480);
    data.chats.upsertMany([
      sampleChat({
        chatId: '1',
        fanName: 'Christopher',
        lastMessagePreview: 'enjoy Monaco baby',
        lastMessageIsSentByMe: true,
        // consistent with the seeded thread: our message at 34 d is the newest
        lastMessageAt: isoDaysAgo(34),
        canSendMessage: true,
      }),
    ]);
    data.messages.upsertMany([
      sampleMessage({ chatId: '1', messageId: 'f1', isSentByMe: false, createdAt: isoDaysAgo(36) }),
      sampleMessage({ chatId: '1', messageId: 'm1', isSentByMe: true, createdAt: isoDaysAgo(34) }),
    ]);
    data.fanTransactions.upsertMany([
      { accountId: ACCOUNT, txId: 't1', fanId: '1', amount: 50, type: 'tips', createdAt: isoDaysAgo(2) },
    ]);

    const service = makeService(
      stubClient({ lists: [], rosters: { '100': [[{ id: 1 }]] }, calls }),
    );
    const { rows } = await service.roster(ACCOUNT, '100');
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.name).toBe('Christopher');
    expect(row?.lifetimeSpend).toBe(12480);
    expect(row?.spend30d).toBe(50);
    expect(row?.lastMessagePreview).toBe('enjoy Monaco baby');
    expect(row?.lastMessageIsSentByMe).toBe(true);
    expect(row?.fanDays).toBe(36);
    expect(row?.modelDays).toBe(34);
    expect(row?.silence).toBe('hot');
    expect(row?.canSendMessage).toBe(true);
    expect(row?.hasChat).toBe(true);
  });

  it('counters ignore deleted messages and unknown silence shows no dot', async () => {
    data.messages.upsertMany([
      sampleMessage({ chatId: '2', messageId: 'f1', isSentByMe: false, createdAt: isoDaysAgo(3), deleted: true }),
    ]);
    const service = makeService(
      stubClient({ lists: [], rosters: { '100': [[{ id: 2, name: 'Roster Name', username: 'u2' }]] }, calls }),
    );
    const { rows } = await service.roster(ACCOUNT, '100');
    expect(rows[0]?.fanDays).toBeNull();
    expect(rows[0]?.silence).toBe('none');
    // No chat row: composer must be disabled (send engine rejects unknown chats).
    expect(rows[0]?.canSendMessage).toBe(false);
    expect(rows[0]?.hasChat).toBe(false);
    expect(rows[0]?.name).toBe('Roster Name');
  });

  it('falls back to the chat row last-message stamp when no thread is cached (list-only hydration)', async () => {
    data.chats.upsertMany([
      sampleChat({
        chatId: '3',
        lastMessageAt: isoDaysAgo(12),
        lastMessageIsSentByMe: false, // fan wrote last → exact fan silence
      }),
      sampleChat({
        chatId: '4',
        lastMessageAt: isoDaysAgo(5),
        lastMessageIsSentByMe: true, // we wrote last → model side known, fan unknown
      }),
    ]);
    const service = makeService(
      stubClient({ lists: [], rosters: { '100': [[{ id: 3 }, { id: 4 }]] }, calls }),
    );
    const { rows } = await service.roster(ACCOUNT, '100');
    const fan3 = rows.find((r) => r.fanId === '3');
    const fan4 = rows.find((r) => r.fanId === '4');
    expect(fan3?.fanDays).toBe(12);
    expect(fan3?.silence).toBe('warm');
    expect(fan3?.modelDays).toBeNull();
    expect(fan4?.modelDays).toBe(5);
    expect(fan4?.fanDays).toBeNull();
    expect(fan4?.silence).toBe('none');
  });

  it('the chat stamp only widens message-store counters, never narrows them', async () => {
    data.messages.upsertMany([
      sampleMessage({ chatId: '5', messageId: 'f1', isSentByMe: false, createdAt: isoDaysAgo(20) }),
    ]);
    data.chats.upsertMany([
      sampleChat({ chatId: '5', lastMessageAt: isoDaysAgo(2), lastMessageIsSentByMe: false }),
    ]);
    const service = makeService(stubClient({ lists: [], rosters: { '100': [[{ id: 5 }]] }, calls }));
    const { rows } = await service.roster(ACCOUNT, '100');
    // newest fan signal wins: the chat stamp (2 d) is fresher than the cached thread (20 d)
    expect(rows[0]?.fanDays).toBe(2);
  });

  it('sorts a shelf by fan silence descending, unknown last', async () => {
    for (const [id, fanDays] of [
      ['1', 9],
      ['2', 36],
      ['3', null],
    ] as const) {
      if (fanDays !== null) {
        data.messages.upsertMany([
          sampleMessage({ chatId: id, messageId: `f${id}`, isSentByMe: false, createdAt: isoDaysAgo(fanDays) }),
        ]);
      }
    }
    const service = makeService(
      stubClient({ lists: [], rosters: { '100': [[{ id: 1 }, { id: 2 }, { id: 3 }]] }, calls }),
    );
    const { rows } = await service.roster(ACCOUNT, '100');
    expect(rows.map((row) => row.fanId)).toEqual(['2', '1', '3']);
  });

  it('dedupes a fan already claimed by an earlier (higher) shelf', async () => {
    const service = makeService(
      stubClient(
        { lists: [], rosters: { '100': [[{ id: 7 }]], '200': [[{ id: 7 }, { id: 8 }]] }, calls },
      ),
    );
    const { rows } = await service.roster(ACCOUNT, '200');
    expect(rows.map((row) => row.fanId)).toEqual(['8']);
  });

  it('walks offset pages until hasMore=false', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: i + 1 }));
    const page2 = [{ id: 101 }];
    const service = makeService(
      stubClient({ lists: [], rosters: { '100': [page1, page2] }, calls }),
    );
    const { rows, truncated } = await service.roster(ACCOUNT, '100');
    expect(rows).toHaveLength(101);
    expect(truncated).toBe(false);
    expect(calls.rosters.filter((c) => c.listId === '100')).toHaveLength(2);
  });

  it('TTL-caches rosters per list (constant exported for the activity story)', async () => {
    expect(SPENDERS_TTL_MS).toBe(5 * 60_000);
    const service = makeService(stubClient({ lists: [], rosters: { '100': [[{ id: 1 }]] }, calls }));
    await service.roster(ACCOUNT, '100');
    await service.roster(ACCOUNT, '100');
    expect(calls.rosters).toHaveLength(1);
  });
});

describe('untiered («Без тира»)', () => {
  it('spenders outside every mapped roster, joined and sorted', async () => {
    seedFan('1', 600); // in tier 100
    seedFan('5', 90); // untiered spender
    seedFan('6', 0); // not a spender
    const service = makeService(
      stubClient({ lists: [], rosters: { '100': [[{ id: 1 }]], '200': [[]] }, calls }),
    );
    const { rows } = await service.untiered(ACCOUNT);
    expect(rows.map((row) => row.fanId)).toEqual(['5']);
    expect(rows[0]?.lifetimeSpend).toBe(90);
  });
});

describe('stats (page right panel — local joins, 0 extra credits)', () => {
  function localDay(daysAgo: number): string {
    return new Date(NOW - daysAgo * DAY_MS).toLocaleDateString('sv-SE');
  }

  it('30-day daily series with totals: dense, local days, 7-to-7 delta', async () => {
    seedFan('1', 5000);
    data.fanTransactions.upsertMany([
      { accountId: ACCOUNT, txId: 't0', fanId: '1', amount: 30, type: 'tips', createdAt: isoDaysAgo(0) },
      { accountId: ACCOUNT, txId: 't2', fanId: '1', amount: 50, type: 'tips', createdAt: isoDaysAgo(2) },
      { accountId: ACCOUNT, txId: 't10', fanId: '1', amount: 20, type: 'tips', createdAt: isoDaysAgo(10) },
    ]);
    const service = makeService(stubClient({ lists: [], rosters: { '100': [[]], '200': [[]] }, calls }));
    const stats = await service.stats(ACCOUNT);

    expect(stats.days).toHaveLength(30);
    expect(stats.days.at(-1)).toEqual({ day: localDay(0), amount: 30 });
    expect(stats.days.find((p) => p.day === localDay(2))?.amount).toBe(50);
    expect(stats.days.find((p) => p.day === localDay(10))?.amount).toBe(20);
    expect(stats.days.filter((p) => p.amount === 0)).toHaveLength(27);

    expect(stats.revenue30d).toBe(100);
    expect(stats.revenueToday).toBe(30);
    expect(stats.revenue7d).toBe(80); // 30 (today) + 50 (2 d ago)
    expect(stats.revenue7dPct).toBe(300); // prior 7 days held only the 20
    expect(stats.payers30d).toBe(1);
    expect(stats.txCount30d).toBe(3);
    expect(stats.avgCheck30d).toBeCloseTo(100 / 3, 5);
  });

  it('tier split follows shelf order; unclaimed payers land in «Без тира» even without a fan row', async () => {
    seedFan('1', 600);
    seedFan('2', 300);
    data.fanTransactions.upsertMany([
      { accountId: ACCOUNT, txId: 'a', fanId: '1', amount: 60, type: 'tips', createdAt: isoDaysAgo(1) },
      { accountId: ACCOUNT, txId: 'b', fanId: '2', amount: 25, type: 'tips', createdAt: isoDaysAgo(1) },
      // a window payer with NO fan row and NO roster membership
      { accountId: ACCOUNT, txId: 'c', fanId: '9', amount: 15, type: 'tips', createdAt: isoDaysAgo(1) },
    ]);
    const service = makeService(
      stubClient({
        lists: [
          { id: '100', type: 'custom', name: '🐳 Кит 600+_OM', usersCount: 1 },
          { id: '200', type: 'custom', name: '⭐️ Топ (350-600)_OM', usersCount: 1 },
        ],
        rosters: { '100': [[{ id: 1 }]], '200': [[{ id: 2 }]] },
        calls,
      }),
    );
    const stats = await service.stats(ACCOUNT);
    expect(stats.tiers).toEqual([
      { listId: '100', title: '🐳 Кит', revenue: 60, payers: 1 },
      { listId: '200', title: '⭐️ Топ', revenue: 25, payers: 1 },
      { listId: '__untiered__', title: '', revenue: 15, payers: 1 },
    ]);
  });

  it('radar counts warm/hot per shelf with the silent lifetime at stake', async () => {
    seedFan('1', 2756); // hot
    seedFan('2', 890); // warm
    seedFan('3', 520); // fresh
    for (const [id, fanDays] of [
      ['1', 36],
      ['2', 10],
      ['3', 2],
    ] as const) {
      data.messages.upsertMany([
        sampleMessage({ chatId: id, messageId: `f${id}`, isSentByMe: false, createdAt: isoDaysAgo(fanDays) }),
      ]);
    }
    const service = makeService(
      stubClient({
        lists: [{ id: '100', type: 'custom', name: 'Кит_OM', usersCount: 3 }],
        rosters: { '100': [[{ id: 1 }, { id: 2 }, { id: 3 }]], '200': [[]] },
        calls,
      }),
    );
    const stats = await service.stats(ACCOUNT);
    expect(stats.radar[0]).toEqual({
      listId: '100',
      title: 'Кит',
      warm: 1,
      hot: 1,
      silentLifetime: 2756 + 890,
    });
    expect(stats.hotCount).toBe(1);
    expect(stats.hotLifetime).toBe(2756);
  });

  it('waiting queue: fanWaiting rows by lifetime desc; full row VMs (preview needs them)', async () => {
    seedFan('1', 1310);
    seedFan('2', 95);
    data.chats.upsertMany([
      sampleChat({ chatId: '1', unreadCount: 1, lastMessageIsSentByMe: false, lastMessageAt: isoDaysAgo(0) }),
      sampleChat({ chatId: '2', unreadCount: 2, lastMessageIsSentByMe: false, lastMessageAt: isoDaysAgo(1) }),
      sampleChat({ chatId: '3', unreadCount: 0, lastMessageIsSentByMe: true, lastMessageAt: isoDaysAgo(1) }),
    ]);
    const service = makeService(
      stubClient({ lists: [], rosters: { '100': [[{ id: 1 }, { id: 2 }, { id: 3 }]], '200': [[]] }, calls }),
    );
    const stats = await service.stats(ACCOUNT);
    expect(stats.waiting.map((row) => row.fanId)).toEqual(['1', '2']);
    expect(stats.waiting[0]?.canSendMessage).toBe(true);
    expect(stats.waiting[0]?.hasChat).toBe(true);
  });

  it('new spenders: lifetime ≈ window spend, with purchase counts; whales excluded', async () => {
    seedFan('1', 120); // new: lifetime == window spend
    seedFan('2', 2756); // whale: long history
    data.fanTransactions.upsertMany([
      { accountId: ACCOUNT, txId: 'n1', fanId: '1', amount: 80, type: 'tips', createdAt: isoDaysAgo(3) },
      { accountId: ACCOUNT, txId: 'n2', fanId: '1', amount: 40, type: 'tips', createdAt: isoDaysAgo(1) },
      { accountId: ACCOUNT, txId: 'w1', fanId: '2', amount: 79, type: 'tips', createdAt: isoDaysAgo(2) },
    ]);
    const service = makeService(
      stubClient({ lists: [], rosters: { '100': [[{ id: 1 }, { id: 2 }]], '200': [[]] }, calls }),
    );
    const stats = await service.stats(ACCOUNT);
    expect(stats.newSpenders).toHaveLength(1);
    expect(stats.newSpenders[0]?.row.fanId).toBe('1');
    expect(stats.newSpenders[0]?.txCount).toBe(2);
  });

  it('works with no mapping at all: revenue still fills, tiers fall to «Без тира»', async () => {
    mapping = [];
    seedFan('1', 50);
    data.fanTransactions.upsertMany([
      { accountId: ACCOUNT, txId: 'x', fanId: '1', amount: 50, type: 'tips', createdAt: isoDaysAgo(1) },
    ]);
    const service = makeService(stubClient({ lists: [], rosters: {}, calls }));
    const stats = await service.stats(ACCOUNT);
    expect(stats.revenue30d).toBe(50);
    expect(stats.tiers).toEqual([{ listId: '__untiered__', title: '', revenue: 50, payers: 1 }]);
    expect(stats.radar).toEqual([]);
  });
});
