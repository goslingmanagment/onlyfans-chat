import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { NormalizedSyncMessage, SyncEvent } from '@chatgoose/shared/protocol/index';
import { createDataLayer, type DataLayer } from '../../src/main/db/index';
import { createPollingSync } from '../../src/main/sync/polling-sync';
import { createBudgetGuard } from '../../src/main/sync/budget-guard';
import type { OfApiClient } from '../../src/main/ofapi/client';
import type { OfApiChat, OfApiMessage, OfApiTransaction } from '../../src/main/ofapi/schemas';

const TEST_DRIVER = 'bsqlite3-mc-node';
const ACCT = 'acct_test';

function makeChat(overrides: {
  fanId: number;
  lastMessageId?: number;
  unread?: number;
  hasUnreadTips?: boolean;
  fromFan?: boolean;
  name?: string;
}): OfApiChat {
  return {
    unreadMessagesCount: overrides.unread ?? 0,
    hasUnreadTips: overrides.hasUnreadTips ?? false,
    canSendMessage: true,
    lastReadMessageId: null,
    lastMessage:
      overrides.lastMessageId != null
        ? {
            id: overrides.lastMessageId,
            text: '<p>hey</p>',
            createdAt: '2026-06-10T12:00:00+00:00',
            fromUser: { id: overrides.fromFan === false ? 999 : overrides.fanId },
          }
        : null,
    fan: {
      id: overrides.fanId,
      name: overrides.name ?? `Fan${overrides.fanId}`,
      username: `fan${overrides.fanId}`,
    },
  } as OfApiChat;
}

function makeChats(count: number, startId = 1000): OfApiChat[] {
  return Array.from({ length: count }, (_, i) => makeChat({ fanId: startId + i }));
}

function makeMessage(overrides: {
  id: number;
  fromMe?: boolean;
  text?: string;
  isNew?: boolean;
  isTip?: boolean;
  tipAmount?: number;
  createdAt?: string;
}): OfApiMessage {
  return {
    id: overrides.id,
    text: overrides.text ?? `<p>msg ${overrides.id}</p>`,
    isSentByMe: overrides.fromMe ?? false,
    createdAt: overrides.createdAt ?? '2026-06-10T12:00:00+00:00',
    isNew: overrides.isNew ?? false,
    isTip: overrides.isTip ?? false,
    ...(overrides.tipAmount != null ? { tipAmount: overrides.tipAmount } : {}),
  } as OfApiMessage;
}

function makeHubMessage(overrides: Partial<NormalizedSyncMessage> = {}): NormalizedSyncMessage {
  return {
    id: '6',
    text: '<p>hub body</p>',
    createdAt: '2026-06-10T12:01:00+00:00',
    isSentByMe: false,
    price: 0,
    isOpened: false,
    isNew: true,
    isTip: false,
    ...overrides,
  };
}

function makeTransaction(overrides: {
  id: number;
  fanId?: number;
  amount?: number;
  createdAt?: string;
}): OfApiTransaction {
  return {
    id: overrides.id,
    amount: overrides.amount ?? 25,
    net: overrides.amount != null ? Math.round(overrides.amount * 80) / 100 : 20,
    createdAt: overrides.createdAt ?? '2026-06-10T12:00:00+00:00',
    type: 'tip',
    user: { id: overrides.fanId ?? 101 },
  } as OfApiTransaction;
}

interface StubClient {
  client: OfApiClient;
  listChatsCalls: number;
  listChatsParams: {
    limit?: number;
    offset?: number;
    filter?: string;
    query?: string;
    order?: string;
    skipUsers?: string;
    purpose?: string;
  }[];
  listMessagesCalls: {
    firstId?: string;
    lastId?: string;
    order?: string;
    limit?: number;
    purpose?: string;
    priority?: string;
  }[];
  listTransactionsCalls: { limit?: number; purpose?: string; startDate?: string }[];
  setChats(chats: OfApiChat[]): void;
  setMessages(messages: OfApiMessage[]): void;
  setTransactions(transactions: OfApiTransaction[]): void;
  onListChats(fn: ((params: { filter?: string; purpose?: string }) => void) | null): void;
}

/**
 * Models the live offset cursor exactly: a flat recency-ordered list sliced by
 * (offset, limit≤10), nextPageUrl present while deeper chats remain. The walker
 * advances by the number of chats actually returned (server-chosen page sizes).
 */
function makeStubClient(): StubClient {
  let all: OfApiChat[] = [];
  let messages: OfApiMessage[] = [];
  let transactions: OfApiTransaction[] = [];
  let onListChats: ((params: { filter?: string; purpose?: string }) => void) | null = null;
  const state: StubClient = {
    listChatsCalls: 0,
    listChatsParams: [],
    listMessagesCalls: [],
    listTransactionsCalls: [],
    setChats: (next) => {
      all = next;
    },
    setMessages: (next) => {
      messages = next;
    },
    setTransactions: (next) => {
      transactions = next;
    },
    onListChats: (fn) => {
      onListChats = fn;
    },
    client: {
      listChats: vi.fn(
        async (params: {
          limit?: number;
          offset?: number;
          filter?: string;
          query?: string;
          order?: string;
          skipUsers?: string;
          purpose?: string;
        }) => {
        onListChats?.({
          ...(params.filter !== undefined ? { filter: params.filter } : {}),
          ...(params.purpose !== undefined ? { purpose: params.purpose } : {}),
        });
        state.listChatsCalls += 1;
        state.listChatsParams.push({
          ...(params.limit != null ? { limit: params.limit } : {}),
          ...(params.offset != null ? { offset: params.offset } : {}),
          ...(params.filter != null ? { filter: params.filter } : {}),
          ...(params.query != null ? { query: params.query } : {}),
          ...(params.order != null ? { order: params.order } : {}),
          ...(params.skipUsers != null ? { skipUsers: params.skipUsers } : {}),
          ...(params.purpose != null ? { purpose: params.purpose } : {}),
        });
        const offset = params.offset ?? 0;
        const limit = Math.min(params.limit ?? 10, 10);
        const queried =
          params.query == null || params.query.trim().length === 0
            ? all
            : all.filter((chat) => {
                const q = params.query?.trim().toLowerCase() ?? '';
                return (
                  chat.fan?.username?.toLowerCase().includes(q) === true ||
                  chat.fan?.name?.toLowerCase().includes(q) === true
                );
              });
        const source =
          params.filter === 'unread'
            ? queried.filter((chat) => (chat.unreadMessagesCount ?? 0) > 0)
            : params.filter === 'unread_with_tips'
              ? queried.filter((chat) => chat.hasUnreadTips === true)
            : queried;
        const chats = source.slice(offset, offset + limit);
        return {
          chats,
          nextPageUrl:
            offset + chats.length < source.length ? `https://stub/chats?offset=${offset + chats.length}` : null,
        };
      },
      ),
      listMessages: vi.fn(
        async (params: {
          firstId?: string;
          lastId?: string;
          order?: string;
          limit?: number;
          purpose?: string;
          priority?: string;
        }) => {
          state.listMessagesCalls.push({
            ...(params.firstId != null ? { firstId: params.firstId } : {}),
            ...(params.lastId != null ? { lastId: params.lastId } : {}),
            ...(params.order != null ? { order: params.order } : {}),
            ...(params.limit != null ? { limit: params.limit } : {}),
            ...(params.purpose != null ? { purpose: params.purpose } : {}),
            ...(params.priority != null ? { priority: params.priority } : {}),
          });
          return { messages, nextPageUrl: null };
        },
      ),
      getMessage: vi.fn(async () => messages[0]),
      listTransactions: vi.fn(
        async (params: { limit?: number; purpose?: string; startDate?: string }) => {
          state.listTransactionsCalls.push({
            ...(params.limit != null ? { limit: params.limit } : {}),
            ...(params.purpose != null ? { purpose: params.purpose } : {}),
            ...(params.startDate != null ? { startDate: params.startDate } : {}),
          });
          return { transactions, hasMore: false, nextMarker: null };
        },
      ),
      getUserByUsername: vi.fn(async () => {
        throw new Error('404');
      }),
    } as unknown as OfApiClient,
  };
  return state;
}

const hydrationSchema = z.object({
  nextOffset: z.number(),
  pagesWalked: z.number(),
  done: z.boolean(),
});

describe('PollingSync', () => {
  let data: DataLayer;
  let stub: StubClient;
  let events: SyncEvent[];
  let sleeps: number[];

  beforeEach(() => {
    vi.useFakeTimers();
    data = createDataLayer({
      driverPath: TEST_DRIVER,
      filePath: ':memory:',
      encryptionKey: null,
    });
    stub = makeStubClient();
    events = [];
    sleeps = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    data.close();
  });

  /**
   * Completes an in-flight poll (all stubs resolve in microtasks) WITHOUT firing
   * the rescheduled tick — runOnlyPendingTimersAsync would run one extra poll.
   */
  async function drainPoll(): Promise<void> {
    for (let i = 0; i < 5000; i += 1) {
      await Promise.resolve();
    }
  }

  function makeSync(
    budgetExhausted = (): boolean => false,
    unreadReconcileSettings?: () => {
      focusedIntervalMs?: number;
      focusedMaxPages?: number;
      hiddenEnabled?: boolean;
      focusDebounceMs?: number;
    },
  ) {
    const sync = createPollingSync({
      client: stub.client,
      data,
      toMediaUrl: (url) => `media://${Buffer.from(url).toString('base64url')}`,
      isBudgetExhausted: budgetExhausted,
      // Auto-read ON so the existing tests keep exercising the legacy auto-read
      // paths (poll-delta tail fetch, read-state sweep, media polling). The
      // default-OFF gate is covered by its own describe block below.
      autoReadEnabled: () => true,
      ...(unreadReconcileSettings === undefined ? {} : { unreadReconcileSettings }),
      // No-op sleep so multi-page walks resolve under fake timers; pacing asserted via `sleeps`.
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    sync.subscribe((event) => events.push(event));
    return sync;
  }

  function hydrationState(): z.infer<typeof hydrationSchema> | null {
    return data.settings.getParsed(`sync.chatHydration.${ACCT}`, hydrationSchema) ?? null;
  }

  function upsertLocalChat({
    chatId = '101',
    unread = 1,
    lastMessageId = '5',
    hasUnreadTips = false,
  }: {
    chatId?: string;
    unread?: number;
    lastMessageId?: string | null;
    hasUnreadTips?: boolean;
  } = {}): void {
    data.chats.upsert({
      accountId: ACCT,
      chatId,
      fanName: `Fan${chatId}`,
      avatar: null,
      unreadCount: unread,
      hasUnreadTips,
      lastMessageAt: '2026-06-10T12:00:00.000Z',
      lastMessagePreview: 'hey',
      lastMessageIsSentByMe: false,
      lastMessageId,
      lastReadMessageId: null,
      pinned: false,
      canSendMessage: true,
      canNotSendReason: null,
      raw: {},
    });
  }

  it('ensureChat is a no-op when the chat row already exists', async () => {
    data.chats.upsert({
      accountId: ACCT,
      chatId: '101',
      fanName: 'Cached',
      avatar: null,
      unreadCount: 0,
      hasUnreadTips: false,
      lastMessageAt: null,
      lastMessagePreview: '',
      lastMessageIsSentByMe: false,
      lastMessageId: null,
      lastReadMessageId: null,
      pinned: false,
      canSendMessage: true,
      canNotSendReason: null,
      raw: {},
    });

    const sync = makeSync();

    await expect(sync.ensureChat(ACCT, '101', { username: 'fan101' })).resolves.toBe(true);
    expect(stub.listChatsCalls).toBe(0);
  });

  it('ensureChat resolves a missing Spenders chat by username search and exact fan id', async () => {
    stub.setChats([
      makeChat({ fanId: 202, name: 'Merritt' }),
      makeChat({ fanId: 101, name: 'Merritt' }),
    ]);
    const sync = makeSync();

    await expect(sync.ensureChat(ACCT, '101', { username: 'Merritt' })).resolves.toBe(true);

    expect(stub.listChatsParams).toEqual([
      {
        limit: 10,
        query: 'Merritt',
        order: 'recent',
        skipUsers: 'none',
        purpose: 'spenders',
      },
    ]);
    expect(data.chats.get(ACCT, '101')?.fanName).toBe('Merritt');
    expect(data.chats.get(ACCT, '202')).toBeNull();
    expect(data.fans.get(ACCT, '101')?.username).toBe('fan101');
  });

  it('ensureChat does not synthesize a row when username is absent or search misses the fan id', async () => {
    const sync = makeSync();

    await expect(sync.ensureChat(ACCT, '101')).resolves.toBe(false);
    expect(stub.listChatsCalls).toBe(0);

    stub.setChats([makeChat({ fanId: 202, name: 'Merritt' })]);
    await expect(sync.ensureChat(ACCT, '101', { username: 'Merritt' })).resolves.toBe(false);
    expect(stub.listChatsCalls).toBe(1);
    expect(data.chats.get(ACCT, '101')).toBeNull();
  });

  it('initial poll hydrates chat + fan rows LIST-ONLY; history loads on conversation open', async () => {
    stub.setChats([makeChat({ fanId: 101, lastMessageId: 5, unread: 2 })]);
    stub.setMessages([makeMessage({ id: 4 }), makeMessage({ id: 5, fromMe: true })]);

    const sync = makeSync();
    sync.start([ACCT]);
    await vi.runOnlyPendingTimersAsync();

    expect(data.chats.get(ACCT, '101')?.unreadCount).toBe(2);
    expect(data.fans.get(ACCT, '101')?.username).toBe('fan101');
    // The cost rule at 900+ chats: hydration never tail-fetches message bodies.
    expect(stub.listMessagesCalls).toHaveLength(0);
    expect(data.messages.count(ACCT, '101')).toBe(0);
    expect(events.some((e) => e.type === 'chatListUpdated')).toBe(true);
    // Baseline poll: history is not news — no message-level events.
    expect(events.filter((e) => e.type === 'messageReceived')).toHaveLength(0);
    expect(events.filter((e) => e.type === 'messageSent')).toHaveLength(0);

    await sync.openConversation(ACCT, '101');
    expect(stub.listMessagesCalls.at(-1)).toEqual({
      order: 'desc',
      limit: 30,
      purpose: 'message-tail',
      priority: 'user',
    });
    expect(data.messages.count(ACCT, '101')).toBe(2);
    sync.stop();
  });

  it('loadOlderMessagesForUserOpen fetches one older first_id page from the local oldest row', async () => {
    stub.setChats([makeChat({ fanId: 101, lastMessageId: 11 })]);
    stub.setMessages([makeMessage({ id: 10 }), makeMessage({ id: 11 })]);

    const sync = makeSync();
    sync.start([ACCT]);
    await vi.runOnlyPendingTimersAsync();
    await sync.openConversation(ACCT, '101');
    expect(data.messages.count(ACCT, '101')).toBe(2);

    stub.setMessages([makeMessage({ id: 9 }), makeMessage({ id: 10 })]);
    await expect(sync.loadOlderMessagesForUserOpen(ACCT, '101')).resolves.toEqual({
      returned: 2,
      fresh: 1,
      hasOlder: false,
    });

    expect(stub.listMessagesCalls.at(-1)).toEqual({
      firstId: '10',
      order: 'desc',
      limit: 30,
      purpose: 'message-tail',
      priority: 'user',
    });
    expect(data.messages.count(ACCT, '101')).toBe(3);
    sync.stop();
  });

  it('openConversation reloads the recent desc window when only a tiny local cache exists', async () => {
    stub.setChats([makeChat({ fanId: 101, lastMessageId: 30 })]);
    stub.setMessages(
      Array.from({ length: 30 }, (_, index) =>
        makeMessage({
          id: index + 1,
          createdAt: `2026-06-11T10:${String(index).padStart(2, '0')}:00+00:00`,
        }),
      ),
    );

    const sync = makeSync();
    sync.start([ACCT]);
    await vi.runOnlyPendingTimersAsync();
    data.messages.upsertMany([
      {
        accountId: ACCT,
        chatId: '101',
        messageId: '30',
        createdAt: '2026-06-11T10:29:00.000Z',
        isSentByMe: false,
        textHtml: '<p>cached</p>',
        textPlain: 'cached',
        price: 0,
        isOpened: null,
        isNew: false,
        isTip: false,
        tipAmount: null,
        tipText: null,
        replyTo: null,
        media: [],
        deleted: false,
        raw: {},
      },
    ]);

    const before = stub.listMessagesCalls.length;
    await sync.openConversation(ACCT, '101');

    expect(stub.listMessagesCalls.slice(before)).toEqual([
      { order: 'desc', limit: 30, purpose: 'message-tail', priority: 'user' },
    ]);
    expect(data.messages.count(ACCT, '101')).toBe(30);
    sync.stop();
  });

  it('no delta → no message fetch on subsequent polls (cost rule)', async () => {
    stub.setChats([makeChat({ fanId: 101, lastMessageId: 5 })]);
    stub.setMessages([makeMessage({ id: 5 })]);
    const sync = makeSync();
    sync.start([ACCT]);
    await vi.runOnlyPendingTimersAsync();
    const callsAfterFirst = stub.listMessagesCalls.length;

    await vi.advanceTimersByTimeAsync(60_000); // next unfocused poll
    expect(stub.listChatsCalls).toBeGreaterThanOrEqual(2);
    expect(stub.listMessagesCalls.length).toBe(callsAfterFirst);
    sync.stop();
  });

  it('delta → ascending tail fetch from the cached boundary with dedupe', async () => {
    stub.setChats([makeChat({ fanId: 101, lastMessageId: 5 })]);
    stub.setMessages([makeMessage({ id: 5 })]);
    const sync = makeSync();
    sync.start([ACCT]);
    await vi.runOnlyPendingTimersAsync();
    await sync.openConversation(ACCT, '101'); // establishes the cached boundary
    events = [];

    // new message arrives; boundary-inclusive asc tail returns [5, 6]
    stub.setChats([makeChat({ fanId: 101, lastMessageId: 6, unread: 1 })]);
    stub.setMessages([makeMessage({ id: 5 }), makeMessage({ id: 6 })]);
    await vi.advanceTimersByTimeAsync(60_000);

    const tailCall = stub.listMessagesCalls.at(-1);
    expect(tailCall).toEqual({ lastId: '5', order: 'asc', limit: 100, purpose: 'message-tail' });
    expect(data.messages.count(ACCT, '101')).toBe(2);
    // only the genuinely new message emits (boundary dedupe)
    expect(events.filter((e) => e.type === 'messageReceived')).toHaveLength(1);
    sync.stop();
  });

  it('changed chat WITHOUT a cached boundary emits only messages newer than the previous poll', async () => {
    stub.setChats([makeChat({ fanId: 101, lastMessageId: 5 })]);
    stub.setMessages([]);
    const sync = makeSync();
    sync.start([ACCT]);
    await vi.runOnlyPendingTimersAsync(); // baseline: row cached, no messages
    events = [];
    const baselineMs = Date.now();

    // fan sends a new message; the chat was never opened, so the tail fetch
    // returns the whole history page — backlog must not toast.
    stub.setChats([makeChat({ fanId: 101, lastMessageId: 7, unread: 1 })]);
    stub.setMessages([
      makeMessage({ id: 5, createdAt: new Date(baselineMs - 86_400_000).toISOString() }),
      makeMessage({ id: 7, createdAt: new Date(baselineMs + 30_000).toISOString() }),
    ]);
    await vi.advanceTimersByTimeAsync(60_000);

    const received = events.filter((e) => e.type === 'messageReceived');
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ chatId: '101', messageId: '7' });
    expect(data.messages.count(ACCT, '101')).toBe(2); // backlog still hydrated
    sync.stop();
  });

  it('tip messages arriving post-baseline emit tipReceived with the dollar amount', async () => {
    stub.setChats([makeChat({ fanId: 101, lastMessageId: 5 })]);
    stub.setMessages([makeMessage({ id: 5 })]);
    const sync = makeSync();
    sync.start([ACCT]);
    await vi.runOnlyPendingTimersAsync();
    await sync.openConversation(ACCT, '101');
    events = [];

    stub.setChats([makeChat({ fanId: 101, lastMessageId: 7 })]);
    stub.setMessages([makeMessage({ id: 5 }), makeMessage({ id: 7, isTip: true, tipAmount: 5 })]);
    await vi.advanceTimersByTimeAsync(60_000);

    const tip = events.find((e) => e.type === 'tipReceived');
    expect(tip).toMatchObject({ chatId: '101', amountUsd: 5 });
    sync.stop();
  });

  it('hot poll requests page 1 only with explicit limit 10 (OnlyFans dictates page size)', async () => {
    stub.setChats([makeChat({ fanId: 101, lastMessageId: 5 })]);
    stub.setMessages([makeMessage({ id: 5 })]);
    const sync = makeSync();
    sync.start([ACCT]);
    await vi.runOnlyPendingTimersAsync();

    await vi.advanceTimersByTimeAsync(60_000); // post-hydration hot tick
    expect(stub.listChatsParams.at(-1)).toEqual({
      limit: 10,
      offset: 0,
      order: 'recent',
      skipUsers: 'none',
      purpose: 'hot-poll',
    });
    expect(stub.listChatsParams.every((p) => p.limit === 10)).toBe(true);
    sync.stop();
  });

  it('initial hydration walks list pages in one tick with 300ms pacing, silently', async () => {
    stub.setChats(makeChats(25)); // 3 pages: head 0-9, chunk 10-19 + 20-24
    const sync = makeSync();
    sync.start([ACCT]);
    await drainPoll();

    expect(stub.listChatsParams.map((p) => p.offset)).toEqual([0, 10, 20]);
    expect(sleeps).toEqual([300, 300]);
    expect(data.chats.get(ACCT, '1000')).not.toBeNull();
    expect(data.chats.get(ACCT, '1012')).not.toBeNull();
    expect(data.chats.get(ACCT, '1024')).not.toBeNull();
    expect(stub.listMessagesCalls).toHaveLength(0); // list-only
    expect(
      events.filter((e) => e.type === 'messageReceived' || e.type === 'messageSent'),
    ).toHaveLength(0);
    expect(hydrationState()).toMatchObject({ done: true });
    sync.stop();
  });

  it('hydration of a large inbox is chunked across ticks and resumes after restart', async () => {
    stub.setChats(makeChats(250)); // 25 pages — too many for one tick
    const first = makeSync();
    first.start([ACCT]);
    await drainPoll();

    // tick 1: head page (offset 0) + a 10-page chunk → progress persisted, not done
    const afterTick1 = hydrationState();
    expect(afterTick1).toMatchObject({ done: false });
    expect(afterTick1?.nextOffset).toBe(110);
    expect(data.chats.get(ACCT, `${1000 + 109}`)).not.toBeNull();
    expect(data.chats.get(ACCT, `${1000 + 110}`)).toBeNull();
    first.stop();

    // restart: hydration resumes from the persisted offset, never from 0
    const firstSessionCalls = stub.listChatsParams.length;
    const second = makeSync();
    second.start([ACCT]);
    await drainPoll();
    const offsetsAfterRestart = stub.listChatsParams.slice(firstSessionCalls).map((p) => p.offset);
    expect(offsetsAfterRestart[0]).toBe(0); // head detector page
    expect(offsetsAfterRestart[1]).toBe(110); // chunk continues, not rewalks
    expect(hydrationState()).toMatchObject({ done: false, nextOffset: 210 });

    // one more tick exhausts the remaining pages
    await vi.advanceTimersByTimeAsync(60_000);
    expect(hydrationState()).toMatchObject({ done: true });
    expect(data.chats.get(ACCT, `${1000 + 249}`)).not.toBeNull();
    second.stop();
  });

  it('deep sweep walks 5 pages every 5 minutes after hydration; hot ticks stay on page 1', async () => {
    stub.setChats(makeChats(70)); // 7 pages
    const sync = makeSync();
    sync.start([ACCT]);
    await drainPoll(); // tick 1: head + chunk exhausts all 7 pages → hydration done
    expect(hydrationState()).toMatchObject({ done: true });
    const afterHydration = stub.listChatsParams.length;

    // first post-hydration tick is deep (lastDeepSweepAt unset), then hot ticks,
    // then 5 minutes after that first sweep (60s + 300s = 360s) deep again
    await vi.advanceTimersByTimeAsync(360_000);
    const offsets = stub.listChatsParams.slice(afterHydration).map((p) => p.offset);
    expect(offsets.slice(0, 5)).toEqual([0, 10, 20, 30, 40]); // 60s: deep sweep
    expect(offsets.slice(5, 9)).toEqual([0, 0, 0, 0]); // hot ticks at 120..300s
    expect(offsets.slice(9)).toEqual([0, 10, 20, 30, 40]); // 360s: deep again
    sync.stop();
  });

  it('forceRefresh performs a deep sweep, not just page 1', async () => {
    stub.setChats(makeChats(70));
    const sync = makeSync();
    sync.start([ACCT]);
    await drainPoll();
    await vi.advanceTimersByTimeAsync(60_000); // post-hydration deep tick passes
    const before = stub.listChatsParams.length;

    await sync.forceRefresh(ACCT);
    expect(stub.listChatsParams.slice(before).map((p) => p.offset)).toEqual([0, 10, 20, 30, 40]);
    sync.stop();
  });

  it('chat discovered post-baseline emits only messages newer than the previous poll', async () => {
    stub.setChats([makeChat({ fanId: 101, lastMessageId: 5 })]);
    stub.setMessages([makeMessage({ id: 5 })]);
    const sync = makeSync();
    sync.start([ACCT]);
    await vi.runOnlyPendingTimersAsync(); // baseline at t0
    events = [];
    const baselineMs = Date.now();

    // fan 202 enters the window: day-old backlog + one fresh message
    stub.setChats([
      makeChat({ fanId: 202, lastMessageId: 301 }),
      makeChat({ fanId: 101, lastMessageId: 5 }),
    ]);
    stub.setMessages([
      makeMessage({ id: 300, createdAt: new Date(baselineMs - 86_400_000).toISOString() }),
      makeMessage({ id: 301, createdAt: new Date(baselineMs + 30_000).toISOString() }),
    ]);
    await vi.advanceTimersByTimeAsync(60_000);

    const received = events.filter((e) => e.type === 'messageReceived');
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ chatId: '202', messageId: '301' });
    expect(data.messages.count(ACCT, '202')).toBe(2); // backlog still hydrated
    sync.stop();
  });

  it('restart with warm cache silently catches up the downtime backlog (no replay burst)', async () => {
    stub.setChats([makeChat({ fanId: 101, lastMessageId: 5 })]);
    stub.setMessages([makeMessage({ id: 5 })]);
    const first = makeSync();
    first.start([ACCT]);
    await vi.runOnlyPendingTimersAsync();
    await first.openConversation(ACCT, '101'); // history loaded during the session
    first.stop();

    // two messages land while the app is down
    stub.setChats([makeChat({ fanId: 101, lastMessageId: 7, unread: 2 })]);
    stub.setMessages([makeMessage({ id: 5 }), makeMessage({ id: 6 }), makeMessage({ id: 7 })]);
    events = [];
    const second = makeSync(); // same DataLayer = warm cache
    second.start([ACCT]);
    await vi.runOnlyPendingTimersAsync();

    // cached chat changed at baseline → tail-fetched silently
    expect(data.messages.count(ACCT, '101')).toBe(3);
    expect(
      events.filter((e) => e.type === 'messageReceived' || e.type === 'messageSent'),
    ).toHaveLength(0);
    expect(events.some((e) => e.type === 'chatListUpdated')).toBe(true);
    second.stop();
  });

  it('never overlaps polls of one account (Phase-0 latency reality)', async () => {
    let resolveFirst: (() => void) | undefined;
    stub.setChats([]);
    (stub.client.listChats as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = () => resolve({ chats: [], nextPageUrl: null });
        }),
    );
    const sync = makeSync();
    sync.start([ACCT]);
    await Promise.resolve();

    await sync.forceRefresh(ACCT); // in-flight → skipped
    expect(stub.listChatsCalls).toBe(0); // mocked-once call doesn't bump the counter
    resolveFirst?.();
    await vi.runOnlyPendingTimersAsync();
    sync.stop();
  });

  it('focused account polls at 20s, others at 60s; hidden window ×4 keeps running', async () => {
    stub.setChats([]);
    const sync = makeSync();
    sync.start([ACCT]);
    await vi.runOnlyPendingTimersAsync();
    const base = stub.listChatsCalls;

    sync.setFocusedAccount(ACCT);
    await vi.runOnlyPendingTimersAsync(); // focus burst
    const afterFocus = stub.listChatsCalls;
    expect(afterFocus).toBeGreaterThan(base);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(stub.listChatsCalls).toBe(afterFocus + 1);

    sync.setWindowVisible(false);
    // the already-pending 20s timer fires once more, then reschedules at ×4
    await vi.advanceTimersByTimeAsync(20_000);
    const beforeHiddenTick = stub.listChatsCalls;
    await vi.advanceTimersByTimeAsync(20_000 * 4 - 2);
    expect(stub.listChatsCalls).toBe(beforeHiddenTick);
    await vi.advanceTimersByTimeAsync(4);
    expect(stub.listChatsCalls).toBe(beforeHiddenTick + 1); // ×4 but still polling
    sync.stop();
  });

  it('hub live suspends the hydrated poll loop but read-state sweeps stay FULL-RATE (SPEC §6.2)', async () => {
    stub.setChats([makeChat({ fanId: 101, lastMessageId: 9 })]);
    const recentIso = new Date(Date.now() - 60_000).toISOString();
    stub.setMessages([makeMessage({ id: 9, fromMe: true, isNew: true, createdAt: recentIso })]);
    const sync = makeSync();
    sync.start([ACCT]);
    await vi.runOnlyPendingTimersAsync();
    expect(hydrationState()?.done).toBe(true);
    await sync.openConversation(ACCT, '101'); // arms the read-state sweep

    sync.setHubPollingSuspended(true);
    expect(sync.status().pollIntervalsMs?.[ACCT]).toBeNull();
    await vi.advanceTimersByTimeAsync(60_000);
    const base = stub.listChatsCalls;
    const sweepsBefore = stub.listMessagesCalls.length;

    await vi.advanceTimersByTimeAsync(60_000 * 6);
    expect(stub.listChatsCalls).toBe(base); // poll loop suspended
    // sweeps keep their 30s cadence through the entire suspended window
    expect(stub.listMessagesCalls.length - sweepsBefore).toBeGreaterThanOrEqual(10);

    // restore reschedules at the full cadence
    sync.setHubPollingSuspended(false);
    expect(sync.status().pollIntervalsMs?.[ACCT]).toBe(60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(stub.listChatsCalls).toBe(base + 1);
    sync.stop();
  });

  it('hub live keeps polling an account until initial hydration is done', async () => {
    stub.setChats(makeChats(130));
    const sync = makeSync();
    sync.start([ACCT]);
    await drainPoll();
    expect(hydrationState()?.done).toBe(false);
    const before = stub.listChatsCalls;

    sync.setHubPollingSuspended(true);
    expect(sync.status().pollIntervalsMs?.[ACCT]).toBe(60_000);

    await vi.advanceTimersByTimeAsync(60_000);
    await drainPoll();
    expect(stub.listChatsCalls).toBeGreaterThan(before);
    sync.stop();
  });

  it('hub live does not suspend the independent fan-spend sweep', async () => {
    stub.setChats([]);
    stub.setTransactions([makeTransaction({ id: 1, fanId: 101, amount: 50 })]);
    const sync = makeSync();
    sync.start([ACCT]);
    await vi.runOnlyPendingTimersAsync();
    expect(hydrationState()?.done).toBe(true);
    expect(stub.listTransactionsCalls.length).toBeGreaterThan(0);
    const spendCalls = stub.listTransactionsCalls.length;

    sync.setHubPollingSuspended(true);
    expect(sync.status().pollIntervalsMs?.[ACCT]).toBeNull();
    const listCalls = stub.listChatsCalls;

    await vi.advanceTimersByTimeAsync(60_000);
    expect(stub.listChatsCalls).toBe(listCalls);
    await vi.advanceTimersByTimeAsync(60 * 60_000 - 60_000);
    expect(stub.listTransactionsCalls.length).toBeGreaterThan(spendCalls);
    sync.stop();
  });

  it('unread reconcile clears externally-read local unread with list-only filter=unread', async () => {
    stub.setChats([]);
    const sync = makeSync();
    sync.start([ACCT]);
    await vi.runOnlyPendingTimersAsync();
    upsertLocalChat({ chatId: '101', unread: 1, lastMessageId: '5' });
    const listMessagesBefore = stub.listMessagesCalls.length;

    await sync.reconcileUnread(ACCT, 'manual');

    expect(data.chats.get(ACCT, '101')?.unreadCount).toBe(0);
    expect(stub.listMessagesCalls.length).toBe(listMessagesBefore);
    expect(stub.listChatsParams.at(-1)).toEqual({
      limit: 10,
      offset: 0,
      filter: 'unread',
      order: 'recent',
      skipUsers: 'none',
      purpose: 'unread-reconcile',
    });
    sync.stop();
  });

  it('unread reconcile preserves unread tip state when it only proves messages were read', async () => {
    stub.setChats([]);
    const sync = makeSync();
    sync.start([ACCT]);
    await vi.runOnlyPendingTimersAsync();
    upsertLocalChat({ chatId: '101', unread: 1, lastMessageId: '5', hasUnreadTips: true });

    await sync.reconcileUnread(ACCT, 'manual');

    expect(data.chats.get(ACCT, '101')).toMatchObject({
      unreadCount: 0,
      hasUnreadTips: true,
    });
    sync.stop();
  });

  it('unread reconcile partial scan upserts the head but does not clear missing local unread', async () => {
    stub.setChats([]);
    const sync = makeSync();
    sync.start([ACCT]);
    await vi.runOnlyPendingTimersAsync();
    upsertLocalChat({ chatId: '101', unread: 1, lastMessageId: '5' });
    stub.setChats(makeChats(40, 1000).map((chat) => ({ ...chat, unreadMessagesCount: 1 })));

    await sync.reconcileUnread(ACCT, 'manual');

    expect(data.chats.get(ACCT, '101')?.unreadCount).toBe(1);
    expect(data.chats.get(ACCT, '1000')?.unreadCount).toBe(1);
    expect(stub.listChatsParams.slice(-3).map((params) => params.filter)).toEqual([
      'unread',
      'unread',
      'unread',
    ]);
    sync.stop();
  });

  it('unread reconcile does not regress a locally newer hub head from a stale returned unread row', async () => {
    stub.setChats([]);
    const sync = makeSync();
    sync.start([ACCT]);
    await vi.runOnlyPendingTimersAsync();
    upsertLocalChat({ chatId: '101', unread: 2, lastMessageId: '6' });
    stub.setChats([makeChat({ fanId: 101, lastMessageId: 5, unread: 1 })]);

    await sync.reconcileUnread(ACCT, 'manual');

    expect(data.chats.get(ACCT, '101')).toMatchObject({
      unreadCount: 2,
      lastMessageId: '6',
    });
    sync.stop();
  });

  it('unread reconcile head-fence keeps a chat unread if SSE advances it during the scan', async () => {
    stub.setChats([]);
    const sync = makeSync();
    sync.start([ACCT]);
    await vi.runOnlyPendingTimersAsync();
    upsertLocalChat({ chatId: '101', unread: 1, lastMessageId: '5' });
    stub.onListChats((params) => {
      if (params.purpose === 'unread-reconcile') {
        upsertLocalChat({ chatId: '101', unread: 1, lastMessageId: '6' });
      }
    });

    await sync.reconcileUnread(ACCT, 'manual');

    expect(data.chats.get(ACCT, '101')).toMatchObject({
      unreadCount: 1,
      lastMessageId: '6',
    });
    sync.stop();
  });

  it('unread reconcile timer is armed without resetting on frequent hub messages', async () => {
    stub.setChats([]);
    const sync = makeSync(() => false, () => ({
      focusedIntervalMs: 1_000,
      focusedMaxPages: 1,
      focusDebounceMs: 0,
    }));
    sync.start([ACCT]);
    await vi.runOnlyPendingTimersAsync();
    upsertLocalChat({ chatId: '101', unread: 1, lastMessageId: '5' });
    sync.setFocusedAccount(ACCT);
    sync.setHubPollingSuspended(true);
    const unreadCallsBefore = stub.listChatsParams.filter((p) => p.purpose === 'unread-reconcile').length;

    await vi.advanceTimersByTimeAsync(400);
    await sync.ingestHubMessage(ACCT, '101', makeHubMessage({ id: '6' }));
    await vi.advanceTimersByTimeAsync(400);
    await sync.ingestHubMessage(ACCT, '101', makeHubMessage({ id: '7' }));
    await vi.advanceTimersByTimeAsync(201);

    expect(stub.listChatsParams.filter((p) => p.purpose === 'unread-reconcile')).toHaveLength(
      unreadCallsBefore + 1,
    );
    sync.stop();
  });

  it('unread reconcile event triggers do not spend while normal polling is active', async () => {
    stub.setChats([]);
    const sync = makeSync();
    sync.start([ACCT]);
    await vi.runOnlyPendingTimersAsync();
    upsertLocalChat({ chatId: '101', unread: 1, lastMessageId: '5' });
    const unreadCallsBefore = stub.listChatsParams.filter((p) => p.purpose === 'unread-reconcile').length;

    await sync.reconcileUnread(ACCT, 'unread-tab');

    expect(stub.listChatsParams.filter((p) => p.purpose === 'unread-reconcile')).toHaveLength(
      unreadCallsBefore,
    );
    expect(data.chats.get(ACCT, '101')?.unreadCount).toBe(1);
    sync.stop();
  });

  it('transient unread reconcile failures do not poison the main sync status counter', async () => {
    stub.setChats([]);
    const sync = makeSync();
    sync.start([ACCT]);
    await vi.runOnlyPendingTimersAsync();
    upsertLocalChat({ chatId: '101', unread: 1, lastMessageId: '5' });
    vi.mocked(stub.client.listChats).mockRejectedValueOnce(new Error('5xx'));

    await sync.reconcileUnread(ACCT, 'manual');

    expect(sync.status().state).toBe('live');
    sync.stop();
  });

  it('budget exhaustion defers the independent fan-spend sweep', async () => {
    let exhausted = true;
    stub.setChats([]);
    stub.setTransactions([makeTransaction({ id: 1, fanId: 101, amount: 50 })]);
    const sync = makeSync(() => exhausted);
    sync.start([ACCT]);
    await vi.runOnlyPendingTimersAsync();
    expect(hydrationState()?.done).toBe(true);
    expect(stub.listTransactionsCalls).toHaveLength(0);

    exhausted = false;
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(stub.listTransactionsCalls.length).toBeGreaterThan(0);
    sync.stop();
  });

  it('budget exhaustion slows polling ×4 (never stops)', async () => {
    stub.setChats([]);
    const sync = makeSync(() => true);
    sync.start([ACCT]);
    await vi.runOnlyPendingTimersAsync();
    const base = stub.listChatsCalls;

    await vi.advanceTimersByTimeAsync(60_000 * 4 - 1);
    expect(stub.listChatsCalls).toBe(base);
    await vi.advanceTimersByTimeAsync(2);
    expect(stub.listChatsCalls).toBe(base + 1);
    sync.stop();
  });

  it('read-state sweep flips isNew and emits readStateChanged, then auto-stops when idle', async () => {
    stub.setChats([makeChat({ fanId: 101, lastMessageId: 9 })]);
    const recentIso = new Date(Date.now() - 60_000).toISOString();
    stub.setMessages([makeMessage({ id: 9, fromMe: true, isNew: true, createdAt: recentIso })]);
    const sync = makeSync();
    sync.start([ACCT]);
    await vi.runOnlyPendingTimersAsync();
    await sync.openConversation(ACCT, '101');
    events = [];

    // fan reads the message → isNew flips false upstream
    stub.setMessages([makeMessage({ id: 9, fromMe: true, isNew: false, createdAt: recentIso })]);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(events.some((e) => e.type === 'readStateChanged')).toBe(true);
    expect(data.messages.get(ACCT, '101', '9')?.isNew).toBe(false);

    // nothing left unread → sweep no longer calls listMessages
    const calls = stub.listMessagesCalls.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(stub.listMessagesCalls.length).toBe(calls);
    sync.stop();
  });

  it('sweep does not run when window hidden', async () => {
    stub.setChats([makeChat({ fanId: 101, lastMessageId: 9 })]);
    const recentIso = new Date(Date.now() - 60_000).toISOString();
    stub.setMessages([makeMessage({ id: 9, fromMe: true, isNew: true, createdAt: recentIso })]);
    const sync = makeSync();
    sync.start([ACCT]);
    await vi.runOnlyPendingTimersAsync();
    await sync.openConversation(ACCT, '101');
    sync.setWindowVisible(false);

    const calls = stub.listMessagesCalls.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(stub.listMessagesCalls.length).toBe(calls);
    sync.stop();
  });

  // ── Per-fan thread-fetch stamps (PLAN item 13: spenders freshness) ──────
  // Every tail-fetch path writes thread_fetch_log — including EMPTY threads,
  // so the hydrate/refresh TTL skip never re-spends on fans who never wrote.

  describe('thread-fetch freshness stamps', () => {
    it('conversation open stamps the fan — even when the thread is empty', async () => {
      stub.setChats([makeChat({ fanId: 101, lastMessageId: null as unknown as number })]);
      stub.setMessages([]); // fan never wrote, model never wrote
      const sync = makeSync();
      sync.start([ACCT]);
      await vi.runOnlyPendingTimersAsync();
      expect(data.threadFetchLog.get(ACCT, '101')).toBeNull();

      await sync.openConversation(ACCT, '101');
      expect(data.messages.count(ACCT, '101')).toBe(0);
      expect(data.threadFetchLog.get(ACCT, '101')).toBe(new Date(Date.now()).toISOString());
      sync.stop();
    });

    it('poll-delta tail fetch stamps the fan', async () => {
      stub.setChats([makeChat({ fanId: 101, lastMessageId: 5 })]);
      stub.setMessages([makeMessage({ id: 5 })]);
      const sync = makeSync();
      sync.start([ACCT]);
      await vi.runOnlyPendingTimersAsync();
      expect(data.threadFetchLog.get(ACCT, '101')).toBeNull(); // hydration is list-only

      stub.setChats([makeChat({ fanId: 101, lastMessageId: 6, unread: 1 })]);
      stub.setMessages([makeMessage({ id: 6 })]);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(data.threadFetchLog.get(ACCT, '101')).not.toBeNull();
      sync.stop();
    });

    it('refreshChat (automatic path) stamps and defaults to the message-tail purpose', async () => {
      stub.setChats([makeChat({ fanId: 101, lastMessageId: 5 })]);
      stub.setMessages([makeMessage({ id: 5 })]);
      const sync = makeSync();
      sync.start([ACCT]);
      await vi.runOnlyPendingTimersAsync();

      await sync.refreshChat(ACCT, '101');
      expect(data.threadFetchLog.get(ACCT, '101')).not.toBeNull();
      expect(stub.listMessagesCalls.at(-1)?.purpose).toBe('message-tail');
      sync.stop();
    });

    it('refreshChat with an explicit purpose (refresh queue) is ONE page of limit 100', async () => {
      stub.setChats([makeChat({ fanId: 101, lastMessageId: 5 })]);
      stub.setMessages([makeMessage({ id: 5 })]);
      const sync = makeSync();
      sync.start([ACCT]);
      await vi.runOnlyPendingTimersAsync();
      const callsBefore = stub.listMessagesCalls.length;

      await sync.refreshChat(ACCT, '101', 'spenders-refresh');
      // never paginate deeper — a side absent from the newest 100 renders «—»
      expect(stub.listMessagesCalls.length).toBe(callsBefore + 1);
      expect(stub.listMessagesCalls.at(-1)).toEqual({
        order: 'desc',
        limit: 100,
        purpose: 'spenders-refresh',
      });
      expect(data.threadFetchLog.get(ACCT, '101')).not.toBeNull();
      sync.stop();
    });

    it('a later fetch overwrites the stamp (latest fetch wins)', async () => {
      stub.setChats([makeChat({ fanId: 101, lastMessageId: 5 })]);
      stub.setMessages([makeMessage({ id: 5 })]);
      const sync = makeSync();
      sync.start([ACCT]);
      await vi.runOnlyPendingTimersAsync();

      await sync.refreshChat(ACCT, '101');
      const first = data.threadFetchLog.get(ACCT, '101');
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      await sync.refreshChat(ACCT, '101');
      const second = data.threadFetchLog.get(ACCT, '101');
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(Date.parse(second ?? '')).toBeGreaterThan(Date.parse(first ?? ''));
      sync.stop();
    });

    it('readChatTailForUserOpen writes the first visible tail rows with a small priority GET', async () => {
      stub.setChats([makeChat({ fanId: 101, lastMessageId: null as unknown as number })]);
      stub.setMessages([makeMessage({ id: 5 }), makeMessage({ id: 6 })]);
      const sync = makeSync();
      sync.start([ACCT]);
      await vi.runOnlyPendingTimersAsync();
      expect(data.messages.count(ACCT, '101')).toBe(0); // hydration is list-only
      const callsBefore = stub.listMessagesCalls.length;

      await sync.readChatTailForUserOpen(ACCT, '101');
      expect(stub.listMessagesCalls.length).toBe(callsBefore + 1);
      expect(stub.listMessagesCalls.at(-1)).toEqual({
        order: 'desc',
        limit: 30,
        purpose: 'message-tail',
        priority: 'user',
      });
      expect(data.messages.count(ACCT, '101')).toBe(2); // rows landed → history appears
      expect(data.threadFetchLog.get(ACCT, '101')).not.toBeNull();
      sync.stop();
    });

    it('readChatTailForUserOpen reloads the recent desc window when only a tiny local cache exists', async () => {
      stub.setChats([makeChat({ fanId: 101, lastMessageId: 30 })]);
      stub.setMessages(
        Array.from({ length: 30 }, (_, index) =>
          makeMessage({
            id: index + 1,
            createdAt: `2026-06-11T10:${String(index).padStart(2, '0')}:00+00:00`,
          }),
        ),
      );
      const sync = makeSync();
      sync.start([ACCT]);
      await vi.runOnlyPendingTimersAsync();
      data.messages.upsertMany([
        {
          accountId: ACCT,
          chatId: '101',
          messageId: '30',
          createdAt: '2026-06-11T10:29:00.000Z',
          isSentByMe: false,
          textHtml: '<p>cached</p>',
          textPlain: 'cached',
          price: 0,
          isOpened: null,
          isNew: false,
          isTip: false,
          tipAmount: null,
          tipText: null,
          replyTo: null,
          media: [],
          deleted: false,
          raw: {},
        },
      ]);

      const before = stub.listMessagesCalls.length;
      await sync.readChatTailForUserOpen(ACCT, '101', 'chat-refresh');

      expect(stub.listMessagesCalls.slice(before)).toEqual([
        { order: 'desc', limit: 30, purpose: 'chat-refresh', priority: 'user' },
      ]);
      expect(data.messages.count(ACCT, '101')).toBe(30);
      sync.stop();
    });

    it('readChatTailForUserOpen on an empty page stamps but writes no rows', async () => {
      stub.setChats([makeChat({ fanId: 101, lastMessageId: null as unknown as number })]);
      stub.setMessages([]);
      const sync = makeSync();
      sync.start([ACCT]);
      await vi.runOnlyPendingTimersAsync();

      await sync.readChatTailForUserOpen(ACCT, '101');
      expect(data.messages.count(ACCT, '101')).toBe(0);
      expect(data.threadFetchLog.get(ACCT, '101')).toBe(new Date(Date.now()).toISOString());
      sync.stop();
    });

    it('readChatTailForUserOpen that throws leaves NO stamp (stamps only on success)', async () => {
      stub.setChats([makeChat({ fanId: 101, lastMessageId: null as unknown as number })]);
      stub.setMessages([]);
      const sync = makeSync();
      sync.start([ACCT]);
      await vi.runOnlyPendingTimersAsync();
      expect(data.threadFetchLog.get(ACCT, '101')).toBeNull();

      vi.mocked(stub.client.listMessages).mockRejectedValueOnce(new Error('5xx'));
      await expect(sync.readChatTailForUserOpen(ACCT, '101')).rejects.toThrow();
      expect(data.threadFetchLog.get(ACCT, '101')).toBeNull(); // failure must not stamp
      expect(data.messages.count(ACCT, '101')).toBe(0);
      sync.stop();
    });
  });

  // ── auto-read OFF (default) ───────────────────────────────────────────────
  // With autoReadChats off the app does ZERO automatic message-body reads: a
  // poll delta and refreshChat must NOT call listMessages (no thread_fetch_log
  // stamp). The chat list still updates via listChats. openConversation is the
  // one sanctioned read and STILL fetches.
  describe('auto-read OFF (default)', () => {
    function makeSyncOff() {
      const sync = createPollingSync({
        client: stub.client,
        data,
        toMediaUrl: (url) => `media://${Buffer.from(url).toString('base64url')}`,
        isBudgetExhausted: () => false,
        autoReadEnabled: () => false,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      });
      sync.subscribe((event) => events.push(event));
      return sync;
    }

    it('a poll delta does NOT tail-fetch (no listMessages, no stamp); the list still updates', async () => {
      stub.setChats([makeChat({ fanId: 101, lastMessageId: 5 })]);
      stub.setMessages([makeMessage({ id: 5 })]);
      const sync = makeSyncOff();
      sync.start([ACCT]);
      await vi.runOnlyPendingTimersAsync();
      const callsAfterBaseline = stub.listMessagesCalls.length;
      events = [];

      // a new message lands — normally this tail-fetches; OFF it must not
      stub.setChats([makeChat({ fanId: 101, lastMessageId: 6, unread: 1 })]);
      stub.setMessages([makeMessage({ id: 5 }), makeMessage({ id: 6 })]);
      await vi.advanceTimersByTimeAsync(60_000);

      expect(stub.listMessagesCalls.length).toBe(callsAfterBaseline);
      expect(data.threadFetchLog.get(ACCT, '101')).toBeNull();
      expect(data.messages.count(ACCT, '101')).toBe(0); // no bodies read
      // the listChats-driven list still repaints, with the fresh unread count
      expect(events.some((e) => e.type === 'chatListUpdated')).toBe(true);
      expect(data.chats.get(ACCT, '101')?.unreadCount).toBe(1);
      // no live message/tip events without a body read
      expect(
        events.filter((e) => e.type === 'messageReceived' || e.type === 'messageSent'),
      ).toHaveLength(0);
      sync.stop();
    });

    it('refreshChat does NOT call listMessages; it debounces a list-only head refresh', async () => {
      stub.setChats([makeChat({ fanId: 101, lastMessageId: 5 })]);
      stub.setMessages([makeMessage({ id: 5 })]);
      const sync = makeSyncOff();
      sync.start([ACCT]);
      await vi.runOnlyPendingTimersAsync();
      const callsBefore = stub.listMessagesCalls.length;
      const listCallsBefore = stub.listChatsCalls;
      events = [];

      stub.setChats([makeChat({ fanId: 101, lastMessageId: 6, unread: 2 })]);
      const first = sync.refreshChat(ACCT, '101', 'spenders-refresh');
      const second = sync.refreshChat(ACCT, '101', 'spenders-refresh');
      await vi.advanceTimersByTimeAsync(1_999);
      expect(stub.listChatsCalls).toBe(listCallsBefore);
      await vi.advanceTimersByTimeAsync(1);
      await Promise.all([first, second]);

      expect(stub.listMessagesCalls.length).toBe(callsBefore);
      expect(stub.listChatsCalls).toBe(listCallsBefore + 1);
      expect(data.threadFetchLog.get(ACCT, '101')).toBeNull();
      expect(events.some((e) => e.type === 'chatListUpdated')).toBe(true);
      expect(data.chats.get(ACCT, '101')?.unreadCount).toBe(2);
      sync.stop();
    });

    it('readChatTailForUserOpen STILL reads and stamps with auto-read OFF', async () => {
      stub.setChats([makeChat({ fanId: 101, lastMessageId: 5 })]);
      stub.setMessages([makeMessage({ id: 5 }), makeMessage({ id: 6, fromMe: true })]);
      const sync = makeSyncOff();
      sync.start([ACCT]);
      await vi.runOnlyPendingTimersAsync();
      const callsBefore = stub.listMessagesCalls.length;
      events = [];

      await sync.readChatTailForUserOpen(ACCT, '101');
      expect(stub.listMessagesCalls.length).toBe(callsBefore + 1);
      expect(stub.listMessagesCalls.at(-1)).toEqual({
        order: 'desc',
        limit: 30,
        purpose: 'message-tail',
        priority: 'user',
      });
      expect(data.messages.count(ACCT, '101')).toBe(2);
      expect(data.threadFetchLog.get(ACCT, '101')).not.toBeNull();
      expect(events.some((e) => e.type === 'chatListUpdated')).toBe(true);
      sync.stop();
    });

    it('openConversation STILL reads (the one sanctioned read) and stamps the fan', async () => {
      stub.setChats([makeChat({ fanId: 101, lastMessageId: 5, unread: 2 })]);
      stub.setMessages([makeMessage({ id: 4 }), makeMessage({ id: 5, fromMe: true })]);
      const sync = makeSyncOff();
      sync.start([ACCT]);
      await vi.runOnlyPendingTimersAsync();
      const callsBefore = stub.listMessagesCalls.length;

      await sync.openConversation(ACCT, '101');
      expect(stub.listMessagesCalls.length).toBe(callsBefore + 1);
      expect(data.messages.count(ACCT, '101')).toBe(2);
      expect(data.threadFetchLog.get(ACCT, '101')).not.toBeNull();
      sync.stop();
    });

    it('ingestHubMessage writes a text body and updates the chat preview without body reads', async () => {
      stub.setChats([makeChat({ fanId: 101, lastMessageId: 5 })]);
      const sync = makeSyncOff();
      sync.start([ACCT]);
      await vi.runOnlyPendingTimersAsync();
      const listMessagesBefore = stub.listMessagesCalls.length;

      await expect(sync.ingestHubMessage(ACCT, '101', makeHubMessage())).resolves.toBe(true);

      const message = data.messages.get(ACCT, '101', '6');
      expect(message).toMatchObject({
        messageId: '6',
        textHtml: '<p>hub body</p>',
        textPlain: 'hub body',
        isSentByMe: false,
      });
      expect(data.chats.get(ACCT, '101')).toMatchObject({
        lastMessageId: '6',
        lastMessagePreview: 'hub body',
        lastMessageIsSentByMe: false,
        unreadCount: 1,
      });
      expect(stub.listMessagesCalls.length).toBe(listMessagesBefore);
      expect(vi.mocked(stub.client.getMessage)).not.toHaveBeenCalled();
      sync.stop();
    });

    it('duplicate/replayed hub messages do not double-increment unread', async () => {
      stub.setChats([makeChat({ fanId: 101, lastMessageId: 5 })]);
      const sync = makeSyncOff();
      sync.start([ACCT]);
      await vi.runOnlyPendingTimersAsync();

      await sync.ingestHubMessage(ACCT, '101', makeHubMessage({ id: '6' }));
      await sync.ingestHubMessage(ACCT, '101', makeHubMessage({ id: '6' }));

      expect(data.messages.count(ACCT, '101')).toBe(1);
      expect(data.chats.get(ACCT, '101')?.unreadCount).toBe(1);
      expect(stub.listMessagesCalls).toHaveLength(0);
      sync.stop();
    });

    it('late hub message bodies do not resurrect a local tombstone', async () => {
      stub.setChats([makeChat({ fanId: 101, lastMessageId: 5 })]);
      const sync = makeSyncOff();
      sync.start([ACCT]);
      await vi.runOnlyPendingTimersAsync();

      data.messages.upsertMany([
        {
          accountId: ACCT,
          chatId: '101',
          messageId: '6',
          createdAt: '2026-06-10T12:01:00.000Z',
          isSentByMe: true,
          textHtml: '<p>deleted local body</p>',
          textPlain: 'deleted local body',
          price: 0,
          isOpened: null,
          isNew: false,
          isTip: false,
          tipAmount: null,
          tipText: null,
          replyTo: null,
          media: [],
          deleted: false,
          raw: {},
        },
      ]);
      data.messages.markDeleted(ACCT, '101', ['6']);

      await sync.ingestHubMessage(
        ACCT,
        '101',
        makeHubMessage({ id: '6', text: '<p>late hub body</p>', isSentByMe: true, isNew: false }),
      );

      expect(data.messages.get(ACCT, '101', '6')).toMatchObject({
        deleted: true,
        textPlain: 'deleted local body',
      });
      expect(data.chats.get(ACCT, '101')).toMatchObject({
        lastMessageId: '5',
        lastMessagePreview: 'hey',
      });
      expect(stub.listMessagesCalls).toHaveLength(0);
      sync.stop();
    });

    it('sent hub messages advance the preview and clear unread without incrementing', async () => {
      stub.setChats([makeChat({ fanId: 101, lastMessageId: 5, unread: 2 })]);
      const sync = makeSyncOff();
      sync.start([ACCT]);
      await vi.runOnlyPendingTimersAsync();

      await sync.ingestHubMessage(
        ACCT,
        '101',
        makeHubMessage({ id: '7', text: '<p>model reply</p>', isSentByMe: true, isNew: false }),
      );

      expect(data.chats.get(ACCT, '101')).toMatchObject({
        lastMessageId: '7',
        lastMessagePreview: 'model reply',
        lastMessageIsSentByMe: true,
        unreadCount: 0,
      });
      expect(stub.listMessagesCalls).toHaveLength(0);
      sync.stop();
    });

    it('hub media metadata stores no URLs and does not trigger getMessage while auto-read is off', async () => {
      stub.setChats([makeChat({ fanId: 101, lastMessageId: 5 })]);
      const sync = makeSyncOff();
      sync.start([ACCT]);
      await vi.runOnlyPendingTimersAsync();

      await sync.ingestHubMessage(
        ACCT,
        '101',
        makeHubMessage({
          id: '8',
          text: '',
          mediaCount: 1,
          media: [{
            id: 'media_1',
            type: 'video',
            isReady: false,
            locked: true,
            durationSeconds: 42,
          }],
        }),
      );

      expect(data.messages.get(ACCT, '101', '8')?.media).toEqual([{
        id: 'media_1',
        type: 'video',
        thumbUrl: null,
        fullUrl: null,
        isReady: false,
        locked: true,
        durationSeconds: 42,
      }]);
      expect(data.chats.get(ACCT, '101')?.lastMessagePreview).toBe('Media');
      expect(vi.mocked(stub.client.getMessage)).not.toHaveBeenCalled();
      expect(stub.listMessagesCalls).toHaveLength(0);
      sync.stop();
    });
  });
});

describe('budget guard', () => {
  it('warns once at 80%, exhausted at 100%', () => {
    let used = 0;
    const warnings: number[] = [];
    const guard = createBudgetGuard({
      getBudget: () => 1000,
      getUsedToday: () => used,
      onWarning: (u) => warnings.push(u),
    });

    used = 799;
    guard.check();
    expect(warnings).toHaveLength(0);
    expect(guard.isExhausted()).toBe(false);

    used = 801;
    guard.check();
    guard.check();
    expect(warnings).toEqual([801]);
    expect(guard.isExhausted()).toBe(false);

    used = 1000;
    expect(guard.isExhausted()).toBe(true);
  });

  it('no budget configured → never warns or throttles', () => {
    const guard = createBudgetGuard({ getBudget: () => null, getUsedToday: () => 1e9 });
    guard.check();
    expect(guard.isExhausted()).toBe(false);
  });
});
