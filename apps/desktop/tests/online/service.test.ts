// Online-now service tests (variant C): button-refresh /fans/active joined to the
// real in-memory SQLite layer; OFAPI side is a typed stub (NO `any`). Covers VM
// build, server-side spenders filter, counts, lastSeen fallback, pagination +
// truncation, the 0-credit snapshot cache, the persisted stamp across "restart",
// empty-first, and single-flight.

import { beforeEach, describe, expect, it } from 'vitest';
import { createOnlineService, ONLINE_MAX_PAGES } from '@main/online/service';
import type { OfApiClient, ListFansParams } from '@main/ofapi/client';
import type { OfApiUser } from '@main/ofapi/schemas';
import type { DataLayer } from '@main/db/index';
import { memoryDataLayer, sampleChat, sampleMessage } from '../db/helpers';

const ACCOUNT = 'acct_1';
const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-06-13T12:00:00.000Z').getTime();
const isoMinAgo = (m: number): string => new Date(NOW - m * 60_000).toISOString();
const isoDaysAgo = (d: number): string => new Date(NOW - d * DAY_MS).toISOString();

interface StubCall {
  offset: number | undefined;
  online: boolean | undefined;
  minTotalSpent: number | undefined;
}

function activeUser(f: {
  id: number;
  lastSeen?: string | null;
  totalSumm?: number | null;
  displayName?: string;
}): OfApiUser {
  return {
    id: f.id,
    name: `fan ${f.id}`,
    username: `fan${f.id}`,
    displayName: f.displayName ?? null,
    avatar: null,
    avatarThumbs: null,
    lastSeen: f.lastSeen ?? null,
    subscribedOnData: f.totalSumm != null ? { totalSumm: f.totalSumm } : null,
  } as unknown as OfApiUser;
}

function stubClient(args: { pages: OfApiUser[][]; calls: StubCall[] }): OfApiClient {
  return {
    listFansActive: async (params: ListFansParams) => {
      args.calls.push({
        offset: params.offset,
        online: params.online,
        minTotalSpent: params.minTotalSpent,
      });
      const idx = Math.floor((params.offset ?? 0) / 20);
      const page = args.pages[idx] ?? [];
      return { fans: page, hasMore: idx < args.pages.length - 1 };
    },
  } as unknown as OfApiClient;
}

let data: DataLayer;
function makeService(client: OfApiClient): ReturnType<typeof createOnlineService> {
  return createOnlineService({ client, data, toMediaUrl: (u) => `media://stub-${u.length}`, now: () => NOW });
}

function seedFan(fanId: string, total: number, lastSeen: string | null = null): void {
  data.fans.upsert({
    accountId: ACCOUNT,
    fanId,
    username: `user${fanId}`,
    name: `Fan ${fanId}`,
    customName: null,
    avatar: null,
    about: null,
    lastSeen,
    spending: { total, subscriptions: 0, tips: total, messages: 0, posts: 0, streams: 0 },
    subscription: null,
    fetchedAt: isoDaysAgo(0),
  });
}

function fullPage(ids: readonly number[]): OfApiUser[] {
  return ids.map((id) => activeUser({ id, lastSeen: isoMinAgo(1), totalSumm: 100 }));
}

beforeEach(() => {
  data = memoryDataLayer();
});

describe('online service — refresh + VM build', () => {
  it('joins local stores: lifetime, 30-day, preview, sentByMe, lastSeen, hasChat', async () => {
    seedFan('1', 12480);
    data.chats.upsertMany([
      sampleChat({
        chatId: '1',
        fanName: 'Christopher',
        lastMessagePreview: 'enjoy Monaco baby',
        lastMessageIsSentByMe: true,
        lastMessageAt: isoDaysAgo(34),
        canSendMessage: true,
      }),
    ]);
    data.messages.upsertMany([
      sampleMessage({ chatId: '1', messageId: 'f1', isSentByMe: false, createdAt: isoDaysAgo(36) }),
      sampleMessage({ chatId: '1', messageId: 'm1', isSentByMe: true, createdAt: isoDaysAgo(34) }),
    ]);
    data.fanTransactions.upsertMany([
      { accountId: ACCOUNT, txId: 't1', fanId: '1', amount: 62.5, net: 50, type: 'tips', createdAt: isoDaysAgo(2) },
    ]);

    const calls: StubCall[] = [];
    const service = makeService(stubClient({ pages: [[activeUser({ id: 1, lastSeen: isoMinAgo(2) })]], calls }));
    const snap = await service.refresh(ACCOUNT, true);
    expect(snap.rows).toHaveLength(1);
    const row = snap.rows[0];
    expect(row?.name).toBe('Christopher');
    expect(row?.lifetimeSpend).toBe(12480);
    expect(row?.spend30d).toBe(50);
    expect(row?.lastMessagePreview).toBe('enjoy Monaco baby');
    expect(row?.lastMessageIsSentByMe).toBe(true);
    expect(row?.lastModelMessageAt).toBe(isoDaysAgo(34));
    expect(row?.lastFanMessageAt).toBe(isoDaysAgo(36));
    expect(row?.lastSeen).toBe(isoMinAgo(2));
    expect(row?.hasChat).toBe(true);
  });

  it('exposes nullable ISO contact dates from the known local messages and list snapshot', async () => {
    data.chats.upsertMany([
      sampleChat({ chatId: '1', lastMessageAt: isoDaysAgo(1), lastMessageIsSentByMe: false }),
      sampleChat({ chatId: '2', lastMessageAt: 'invalid-date', lastMessageIsSentByMe: true }),
      sampleChat({ chatId: '3', lastMessageAt: isoDaysAgo(0), lastMessageId: '20', lastMessageIsSentByMe: true }),
    ]);
    data.messages.upsertMany([
      sampleMessage({ chatId: '1', createdAt: isoDaysAgo(3), isSentByMe: true }),
      sampleMessage({ chatId: '2', createdAt: 'not-a-date', isSentByMe: true }),
      sampleMessage({ chatId: '2', messageId: 'fan', createdAt: '2026-06-12T15:00:00+03:00', isSentByMe: false }),
      sampleMessage({ chatId: '3', messageId: '20', createdAt: isoDaysAgo(0), isSentByMe: true, deleted: true }),
    ]);
    const service = makeService(stubClient({
      pages: [[1, 2, 3, 4].map((id) => activeUser({ id, totalSumm: 100 }))], calls: [],
    }));
    const { rows } = await service.refresh(ACCOUNT, true);

    expect(rows.find((row) => row.fanId === '1')).toMatchObject({
      lastModelMessageAt: isoDaysAgo(3), lastFanMessageAt: isoDaysAgo(1),
    });
    expect(rows.find((row) => row.fanId === '2')).toMatchObject({
      lastModelMessageAt: null, lastFanMessageAt: '2026-06-12T12:00:00.000Z', modelDays: null,
    });
    for (const fanId of ['3', '4']) {
      expect(rows.find((row) => row.fanId === fanId)).toMatchObject({
        lastModelMessageAt: null, lastFanMessageAt: null, modelDays: null, fanDays: null,
      });
    }
  });

  it('spendersOnly drives the server filter[total_spent] bound (1, never 0)', async () => {
    const calls: StubCall[] = [];
    const service = makeService(stubClient({ pages: [[activeUser({ id: 1, totalSumm: 100 })]], calls }));
    await service.refresh(ACCOUNT, true);
    expect(calls[0]?.online).toBe(true);
    expect(calls[0]?.minTotalSpent).toBe(1);
    await service.refresh(ACCOUNT, false);
    expect(calls[1]?.online).toBe(true);
    expect(calls[1]?.minTotalSpent).toBeUndefined();
  });

  it('counts online / spenders / waiting from the joined rows', async () => {
    // id 1: spender ($100) AND waiting (unread, fan wrote last). id 2: $0, not waiting.
    data.chats.upsertMany([
      sampleChat({ chatId: '1', unreadCount: 1, lastMessageIsSentByMe: false, lastMessageAt: isoDaysAgo(1) }),
    ]);
    const calls: StubCall[] = [];
    const service = makeService(
      stubClient({
        pages: [[activeUser({ id: 1, totalSumm: 100 }), activeUser({ id: 2, totalSumm: 0 })]],
        calls,
      }),
    );
    const snap = await service.refresh(ACCOUNT, false);
    expect(snap.counts.online).toBe(2);
    expect(snap.counts.spenders).toBe(1);
    expect(snap.counts.waiting).toBe(1);
  });

  it('lastSeen falls back to the local fan row when the active payload omits it', async () => {
    seedFan('7', 200, isoMinAgo(9));
    const calls: StubCall[] = [];
    const service = makeService(stubClient({ pages: [[activeUser({ id: 7, lastSeen: null })]], calls }));
    const snap = await service.refresh(ACCOUNT, true);
    expect(snap.rows[0]?.lastSeen).toBe(isoMinAgo(9));
  });

  it('paginates up to ONLINE_MAX_PAGES then flags truncation', async () => {
    const calls: StubCall[] = [];
    const pages = Array.from({ length: 6 }, (_, p) => fullPage(Array.from({ length: 20 }, (_, i) => p * 20 + i + 1)));
    const service = makeService(stubClient({ pages, calls }));
    const snap = await service.refresh(ACCOUNT, false);
    expect(calls).toHaveLength(ONLINE_MAX_PAGES);
    expect(snap.truncated).toBe(true);
    expect(snap.rows).toHaveLength(ONLINE_MAX_PAGES * 20);
  });

  it('stops early (no truncation) when the last page is short', async () => {
    const calls: StubCall[] = [];
    const pages = [fullPage(Array.from({ length: 20 }, (_, i) => i + 1)), fullPage([21])];
    const service = makeService(stubClient({ pages, calls }));
    const snap = await service.refresh(ACCOUNT, false);
    expect(calls).toHaveLength(2);
    expect(snap.truncated).toBe(false);
    expect(snap.rows).toHaveLength(21);
  });
});

describe('online service — snapshot cache + stamp', () => {
  it('snapshot() after a refresh returns the cached rows with 0 extra OFAPI calls', async () => {
    const calls: StubCall[] = [];
    const service = makeService(stubClient({ pages: [[activeUser({ id: 1, totalSumm: 100 })]], calls }));
    const refreshed = await service.refresh(ACCOUNT, true);
    const cached = service.snapshot(ACCOUNT, true);
    expect(cached.rows).toEqual(refreshed.rows);
    expect(cached.fetchedAt).toBe(refreshed.fetchedAt);
    expect(calls).toHaveLength(1);
  });

  it('snapshot() rebuilds local joins without another OFAPI refresh', async () => {
    const calls: StubCall[] = [];
    data.chats.upsertMany([
      sampleChat({
        chatId: '1',
        lastMessagePreview: 'old preview',
        unreadCount: 0,
        lastMessageIsSentByMe: true,
      }),
    ]);
    const service = makeService(stubClient({ pages: [[activeUser({ id: 1, totalSumm: 100 })]], calls }));
    await service.refresh(ACCOUNT, true);

    data.chats.upsertMany([
      sampleChat({
        chatId: '1',
        lastMessagePreview: 'fresh fan reply',
        unreadCount: 1,
        lastMessageIsSentByMe: false,
      }),
    ]);

    const cached = service.snapshot(ACCOUNT, true);
    expect(cached.rows[0]?.lastMessagePreview).toBe('fresh fan reply');
    expect(cached.rows[0]?.fanWaiting).toBe(true);
    expect(cached.counts.waiting).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it('persists the per-(account,filter) stamp across a service restart (rows gone, stamp kept)', async () => {
    const calls: StubCall[] = [];
    const first = makeService(stubClient({ pages: [[activeUser({ id: 1, totalSumm: 100 })]], calls }));
    const refreshed = await first.refresh(ACCOUNT, true);

    const fresh = makeService(stubClient({ pages: [], calls: [] }));
    const reopened = fresh.snapshot(ACCOUNT, true);
    expect(reopened.rows).toEqual([]);
    expect(reopened.fetchedAt).toBe(refreshed.fetchedAt);
    // the other filter state is independently un-stamped
    expect(fresh.snapshot(ACCOUNT, false).fetchedAt).toBeNull();
  });

  it('empty-first: a never-refreshed snapshot is empty with a null stamp', () => {
    const service = makeService(stubClient({ pages: [], calls: [] }));
    expect(service.snapshot(ACCOUNT, true)).toEqual({
      rows: [],
      counts: { online: 0, spenders: 0, waiting: 0 },
      fetchedAt: null,
      truncated: false,
    });
  });

  it('single-flight: two concurrent refreshes spend exactly one fetch', async () => {
    const calls: StubCall[] = [];
    const service = makeService(stubClient({ pages: [[activeUser({ id: 1, totalSumm: 100 })]], calls }));
    const [a, b] = await Promise.all([service.refresh(ACCOUNT, true), service.refresh(ACCOUNT, true)]);
    expect(calls).toHaveLength(1);
    expect(a).toEqual(b);
  });
});
