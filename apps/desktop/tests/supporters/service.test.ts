// Supporters service tests (PLAN item 12 DoD: board IPC queries fixture-tested).
// The OFAPI side is a stub client fed from the user-lists fixtures' shapes; the
// join side runs against the real in-memory SQLite layer.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createSupportersService, SUPPORTERS_TTL_MS } from '@main/supporters/service';
import type { SupportersService } from '@main/supporters/service';
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

function makeService(client: OfApiClient): SupportersService {
  return createSupportersService({
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
    expect(SUPPORTERS_TTL_MS).toBe(5 * 60_000);
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
