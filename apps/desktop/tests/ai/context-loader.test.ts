// Context loader behavior (SPEC §8.2): db-first transcript with fetch-through
// pagination, the tip-text ladder, legacy-locked spending/subscription block
// formats, the transactions page cap and the 5-minute on-demand caches.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OFAPI_INTER_PAGE_DELAY_MS, TRANSACTIONS_PAGE_CAP } from '@chatgoose/shared/constants';
import { formatTranscript } from '@chatgoose/shared/transcript/index';
import { createContextLoader } from '@main/ai/context-loader';
import type { ContextLoader } from '@main/ai/context-loader';
import type { DataLayer } from '@main/db/index';
import type { OfApiMessage, OfApiTransaction } from '@main/ofapi/schemas';
import {
  ACCT,
  CHAT,
  makeStubClient,
  memoryDataLayer,
  sampleUser,
  seedMessages,
} from './helpers';
import type { StubClient } from './helpers';

const FETCHED_BASE_MS = Date.parse('2026-06-01T00:00:00Z');

function fetchedMessage(id: number, text = `remote ${id}`): OfApiMessage {
  return {
    id,
    text: `<p>${text}</p>`,
    isSentByMe: false,
    createdAt: new Date(FETCHED_BASE_MS + id * 1000).toISOString(),
  };
}

function tx(overrides: Partial<OfApiTransaction>): OfApiTransaction {
  return {
    id: 'tx',
    amount: 10,
    createdAt: '2026-05-10T00:00:00+00:00',
    type: 'tip',
    user: { id: Number(CHAT) },
    ...overrides,
  };
}

describe('createContextLoader', () => {
  let data: DataLayer;
  let stub: StubClient;
  let loader: ContextLoader;
  let nowMs: number;

  beforeEach(() => {
    data = memoryDataLayer();
    stub = makeStubClient();
    nowMs = Date.parse('2026-06-11T00:00:00Z');
    loader = createContextLoader({
      data,
      client: stub.client,
      now: () => nowMs,
      sleep: () => Promise.resolve(),
    });
  });

  afterEach(() => {
    data.close();
  });

  it('serves the transcript from the db without OFAPI calls when the window is full', async () => {
    seedMessages(data, 5);
    const messages = await loader.loadTranscript({ accountId: ACCT, chatId: CHAT, count: 5 });
    expect(messages).toHaveLength(5);
    expect(stub.listMessagesCalls).toHaveLength(0);
    expect(messages.map((m) => m.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('fetches through with first_id pagination when the db is short', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => fetchedMessage(200 - i));
    const page2 = Array.from({ length: 50 }, (_, i) => fetchedMessage(100 - i));
    stub.setMessagePages([
      { messages: page1, nextPageUrl: 'next' },
      { messages: page2, nextPageUrl: null },
    ]);

    const messages = await loader.loadTranscript({ accountId: ACCT, chatId: CHAT, count: 150 });

    expect(stub.listMessagesCalls).toHaveLength(2);
    expect(stub.listMessagesCalls[0]).toMatchObject({ order: 'desc', limit: 100 });
    expect(stub.listMessagesCalls[0]?.firstId).toBeUndefined();
    // oldest id of page 1 cursors page 2
    expect(stub.listMessagesCalls[1]).toMatchObject({ firstId: '101' });
    expect(messages).toHaveLength(150);
    expect(messages[0]?.id).toBe(51);
    expect(messages[messages.length - 1]?.id).toBe(200);
  });

  it('caps the transcript to the requested count after merging db + fetched', async () => {
    seedMessages(data, 3);
    stub.setMessagePages([
      { messages: [fetchedMessage(900), fetchedMessage(901)], nextPageUrl: null },
    ]);
    const messages = await loader.loadTranscript({ accountId: ACCT, chatId: CHAT, count: 4 });
    expect(messages).toHaveLength(4);
  });

  it('renders tips with the amount ladder and tipText instead of platform boilerplate', async () => {
    data.messages.upsertMany([
      {
        accountId: ACCT,
        chatId: CHAT,
        messageId: '7',
        createdAt: '2026-06-10T08:30:00.000Z',
        isSentByMe: false,
        textHtml: '<p>Ich habe dir einen $5.00 Tipp geschickt</p>',
        textPlain: 'Ich habe dir einen $5.00 Tipp geschickt',
        price: 0,
        isOpened: null,
        isNew: false,
        isTip: true,
        tipAmount: 5,
        tipText: 'thanks babe',
        replyTo: null,
        media: [],
        deleted: false,
        raw: {},
      },
    ]);
    const messages = await loader.loadTranscript({ accountId: ACCT, chatId: CHAT, count: 1 });
    const line = formatTranscript(messages);
    expect(line).toBe('[08:30] Fan: [Tip: $5.00] thanks babe');
  });

  it('excludes tombstoned messages from the transcript', async () => {
    seedMessages(data, 3);
    data.messages.markDeleted(ACCT, CHAT, ['2']);
    stub.setMessagePages([{ messages: [], nextPageUrl: null }]);
    const messages = await loader.loadTranscript({ accountId: ACCT, chatId: CHAT, count: 3 });
    expect(messages.map((m) => m.id)).toEqual([1, 3]);
  });

  it('builds the legacy spending block from subscribedOnData sums + monthly transactions', async () => {
    stub.setUser(sampleUser());
    stub.setTransactionPages([
      {
        transactions: [
          tx({ amount: 15, type: 'tip', createdAt: '2026-05-02T10:00:00+00:00' }),
          tx({ amount: 20, type: 'chat_messages', createdAt: '2026-05-15T10:00:00+00:00' }),
          // другой фан — must be filtered out
          tx({ amount: 99, user: { id: 1 } }),
        ],
        hasMore: false,
        nextMarker: null,
        nextPageUrl: null,
      },
    ]);

    const { block, verified } = await loader.loadSpendingBlock({ accountId: ACCT, chatId: CHAT });
    expect(verified).toBe(true);
    expect(block).toContain('FAN SPENDING DATA:');
    expect(block).toContain(`Fan ID: ${CHAT}`);
    expect(block).toContain('Total gross (all-time): $120.00');
    expect(block).toContain('- Tips: $60.00');
    expect(block).toContain('Monthly totals:');
    expect(block).toContain('- May 2026: $35.00');
    expect(block).toContain('Paid messages $20.00, Tips $15.00');
    expect(block).not.toContain('$99.00');
  });

  it('stops transactions pagination at the shared page cap and flags partial', async () => {
    stub.setUser(sampleUser());
    stub.setTransactionPages([
      {
        transactions: [tx({ amount: 1 })],
        hasMore: true,
        nextMarker: 7,
        nextPageUrl: 'more',
      },
    ]);

    const { block } = await loader.loadSpendingBlock({ accountId: ACCT, chatId: CHAT });
    expect(stub.listTransactionsCalls).toHaveLength(TRANSACTIONS_PAGE_CAP);
    expect(block).toContain('(some months could not be fetched)');
  });

  it('builds the subscription block from the live user (auto-renew on)', async () => {
    stub.setUser(sampleUser());
    const { block, verified } = await loader.loadSubscriptionBlock({ accountId: ACCT, chatId: CHAT });
    expect(verified).toBe(true);
    expect(block).toContain('FAN SUBSCRIPTION DATA:');
    expect(block).toContain('Status: Active');
    expect(block).toContain('Price: $10.00/month');
    expect(block).toContain('Auto-renew: On');
  });

  it('flags churn risk when the current subscribe entry carries a cancelDate', async () => {
    stub.setUser(
      sampleUser({
        subscribedOnData: {
          totalSumm: 50,
          subscribeAt: '2026-01-01T00:00:00+00:00',
          subscribePrice: 10,
          subscribes: [{ isCurrent: true, cancelDate: '2026-06-01T00:00:00+00:00' }],
        },
      }),
    );
    const { block } = await loader.loadSubscriptionBlock({ accountId: ACCT, chatId: CHAT });
    expect(block).toContain('Auto-renew: Off — will NOT renew (churn risk)');
  });

  it('degrades to db fan data when the live fetch fails (optional stage, unverified)', async () => {
    stub.setUserError(new Error('ofapi down'));
    data.fans.upsert({
      accountId: ACCT,
      fanId: CHAT,
      username: 'brad99',
      name: 'Brad',
      customName: 'Whale Brad',
      avatar: null,
      about: null,
      lastSeen: null,
      spending: { total: 200, subscriptions: 50, tips: 100, messages: 50, posts: 0, streams: 0 },
      subscription: {
        status: 'active',
        priceUsd: 12,
        subscribedAt: '2026-01-01T00:00:00+00:00',
        renewsAt: null,
        autoRenewOff: true,
        durationLabel: '5 months',
      },
      fetchedAt: '2026-06-10T00:00:00.000Z',
    });

    const spending = await loader.loadSpendingBlock({ accountId: ACCT, chatId: CHAT });
    expect(spending.block).toContain('Total gross (all-time): $200.00');
    expect(spending.verified).toBe(false);
    const subscription = await loader.loadSubscriptionBlock({ accountId: ACCT, chatId: CHAT });
    expect(subscription.block).toContain('Status: Active');
    expect(subscription.block).toContain('Auto-renew: Off — will NOT renew (churn risk)');
    expect(subscription.verified).toBe(false);
    expect(loader.resolveFanDisplayName(ACCT, CHAT)).toBe('Whale Brad');
  });

  it('returns empty unverified blocks when no data exists anywhere', async () => {
    stub.setUserError(new Error('ofapi down'));
    expect(await loader.loadSpendingBlock({ accountId: ACCT, chatId: CHAT })).toEqual({
      block: '',
      verified: false,
    });
    expect(await loader.loadSubscriptionBlock({ accountId: ACCT, chatId: CHAT })).toEqual({
      block: '',
      verified: false,
    });
    expect(loader.resolveFanDisplayName(ACCT, CHAT)).toBe(CHAT);
  });

  // ── deep path (cache-first gap fetch; SPEC §8.2, research §6.1) ─────────

  it('deep: reuses the db window and fetches only the older gap below the oldest cached row', async () => {
    seedMessages(data, 100, 1000); // db window: ids 1000..1099
    const sleeps: number[] = [];
    const pages: Array<[number, number]> = [];
    const pacedLoader = createContextLoader({
      data,
      client: stub.client,
      now: () => nowMs,
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    });
    const page1 = Array.from({ length: 100 }, (_, i) => fetchedMessage(999 - i));
    const page2 = Array.from({ length: 50 }, (_, i) => fetchedMessage(899 - i));
    stub.setMessagePages([
      { messages: page1, nextPageUrl: 'next' },
      { messages: page2, nextPageUrl: null },
    ]);

    const messages = await pacedLoader.loadTranscript({
      accountId: ACCT,
      chatId: CHAT,
      count: 250,
      deep: true,
      onPage: (currentPage, targetPages) => pages.push([currentPage, targetPages]),
    });

    // gap = 250 - 100 cached → 2 pages, cursored from the oldest cached id
    expect(stub.listMessagesCalls).toHaveLength(2);
    expect(stub.listMessagesCalls[0]).toMatchObject({ firstId: '1000', order: 'desc', limit: 100 });
    expect(stub.listMessagesCalls[1]).toMatchObject({ firstId: '900' });
    expect(pages).toEqual([
      [1, 2],
      [2, 2],
    ]);
    // 300 ms pacing only BETWEEN pages
    expect(sleeps).toEqual([OFAPI_INTER_PAGE_DELAY_MS]);
    expect(messages).toHaveLength(250);
    expect(messages[0]?.id).toBe(850);
    expect(messages[messages.length - 1]?.id).toBe(1099);
  });

  it('deep: a sufficient db cache short-circuits OFAPI entirely', async () => {
    seedMessages(data, 50);
    const messages = await loader.loadTranscript({
      accountId: ACCT,
      chatId: CHAT,
      count: 30,
      deep: true,
    });
    expect(stub.listMessagesCalls).toHaveLength(0);
    expect(messages).toHaveLength(30);
  });

  it('deep: an empty db starts the backward scroll from the top (no cursor)', async () => {
    stub.setMessagePages([
      { messages: Array.from({ length: 100 }, (_, i) => fetchedMessage(200 - i)), nextPageUrl: 'next' },
      { messages: Array.from({ length: 50 }, (_, i) => fetchedMessage(100 - i)), nextPageUrl: null },
    ]);
    const messages = await loader.loadTranscript({
      accountId: ACCT,
      chatId: CHAT,
      count: 150,
      deep: true,
    });
    expect(stub.listMessagesCalls[0]?.firstId).toBeUndefined();
    expect(messages).toHaveLength(150);
  });

  it('deep: a mid-pagination failure fails open onto cached + already-fetched messages', async () => {
    seedMessages(data, 20, 1000);
    const page1 = Array.from({ length: 100 }, (_, i) => fetchedMessage(999 - i));
    const failingClient = {
      listMessages: vi
        .fn()
        .mockResolvedValueOnce({ messages: page1, nextPageUrl: 'next' })
        .mockRejectedValueOnce(new Error('ofapi down')),
      getUserByUsername: vi.fn(),
      getUsersByIds: vi.fn(),
      listTransactions: vi.fn(),
    } as unknown as Parameters<typeof createContextLoader>[0]['client'];
    const failOpenLoader = createContextLoader({
      data,
      client: failingClient,
      sleep: () => Promise.resolve(),
    });

    const messages = await failOpenLoader.loadTranscript({
      accountId: ACCT,
      chatId: CHAT,
      count: 300,
      deep: true,
    });
    expect(messages).toHaveLength(120);
  });

  // ── fan bio (hi-greeting; SPEC §8.2 users/{username} about) ─────────────

  function seedFan(about: string | null): void {
    data.fans.upsert({
      accountId: ACCT,
      fanId: CHAT,
      username: 'brad99',
      name: 'Brad',
      customName: null,
      avatar: null,
      about,
      lastSeen: null,
      spending: null,
      subscription: null,
      fetchedAt: '2026-06-10T00:00:00.000Z',
    });
  }

  it('loads the fan bio from the live user lookup', async () => {
    seedFan(null);
    stub.setUserByUsername(sampleUser({ about: '  gym rat from Texas  ' }));
    expect(await loader.loadFanBio({ accountId: ACCT, chatId: CHAT })).toBe('gym rat from Texas');
    expect(stub.getUserByUsernameCalls).toEqual(['brad99']);
  });

  it('an empty live bio is authoritative — the synced copy is not resurrected', async () => {
    seedFan('stale synced bio');
    stub.setUserByUsername(sampleUser({ about: '' }));
    expect(await loader.loadFanBio({ accountId: ACCT, chatId: CHAT })).toBeUndefined();
  });

  it('falls back to the synced bio when the live lookup fails', async () => {
    seedFan('synced bio');
    expect(await loader.loadFanBio({ accountId: ACCT, chatId: CHAT })).toBe('synced bio');
  });

  it('resolves no bio without an OFAPI call when the fan is unknown', async () => {
    expect(await loader.loadFanBio({ accountId: ACCT, chatId: CHAT })).toBeUndefined();
    expect(stub.getUserByUsernameCalls).toEqual([]);
  });

  it('caches the fan detail and transactions for the 5-minute TTL', async () => {
    stub.setUser(sampleUser());
    await loader.loadSpendingBlock({ accountId: ACCT, chatId: CHAT });
    await loader.loadSubscriptionBlock({ accountId: ACCT, chatId: CHAT });
    await loader.loadSpendingBlock({ accountId: ACCT, chatId: CHAT });
    expect(stub.getUsersByIdsCalls).toBe(1);
    expect(stub.listTransactionsCalls).toHaveLength(1);

    nowMs += 5 * 60 * 1000 + 1;
    await loader.loadSpendingBlock({ accountId: ACCT, chatId: CHAT });
    expect(stub.getUsersByIdsCalls).toBe(2);
    expect(stub.listTransactionsCalls).toHaveLength(2);
  });
});
