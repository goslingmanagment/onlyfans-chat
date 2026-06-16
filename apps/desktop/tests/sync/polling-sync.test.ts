import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { SyncEvent } from '@chatgoose/shared/protocol/index';
import { createDataLayer, type DataLayer } from '../../src/main/db/index';
import { createPollingSync } from '../../src/main/sync/polling-sync';
import { createBudgetGuard } from '../../src/main/sync/budget-guard';
import type { OfApiClient } from '../../src/main/ofapi/client';
import type { OfApiChat, OfApiMessage } from '../../src/main/ofapi/schemas';

const TEST_DRIVER = 'bsqlite3-mc-node';
const ACCT = 'acct_test';

function makeChat(overrides: {
  fanId: number;
  lastMessageId?: number;
  unread?: number;
  fromFan?: boolean;
  name?: string;
}): OfApiChat {
  return {
    unreadMessagesCount: overrides.unread ?? 0,
    hasUnreadTips: false,
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

interface StubClient {
  client: OfApiClient;
  listChatsCalls: number;
  listChatsParams: {
    limit?: number;
    offset?: number;
    query?: string;
    order?: string;
    skipUsers?: string;
    purpose?: string;
  }[];
  listMessagesCalls: { lastId?: string; order?: string; limit?: number; purpose?: string }[];
  setChats(chats: OfApiChat[]): void;
  setMessages(messages: OfApiMessage[]): void;
}

/**
 * Models the live offset cursor exactly: a flat recency-ordered list sliced by
 * (offset, limit≤10), nextPageUrl present while deeper chats remain. The walker
 * advances by the number of chats actually returned (server-chosen page sizes).
 */
function makeStubClient(): StubClient {
  let all: OfApiChat[] = [];
  let messages: OfApiMessage[] = [];
  const state: StubClient = {
    listChatsCalls: 0,
    listChatsParams: [],
    listMessagesCalls: [],
    setChats: (next) => {
      all = next;
    },
    setMessages: (next) => {
      messages = next;
    },
    client: {
      listChats: vi.fn(
        async (params: {
          limit?: number;
          offset?: number;
          query?: string;
          order?: string;
          skipUsers?: string;
          purpose?: string;
        }) => {
        state.listChatsCalls += 1;
        state.listChatsParams.push({
          ...(params.limit != null ? { limit: params.limit } : {}),
          ...(params.offset != null ? { offset: params.offset } : {}),
          ...(params.query != null ? { query: params.query } : {}),
          ...(params.order != null ? { order: params.order } : {}),
          ...(params.skipUsers != null ? { skipUsers: params.skipUsers } : {}),
          ...(params.purpose != null ? { purpose: params.purpose } : {}),
        });
        const offset = params.offset ?? 0;
        const limit = Math.min(params.limit ?? 10, 10);
        const source =
          params.query == null || params.query.trim().length === 0
            ? all
            : all.filter((chat) => {
                const q = params.query?.trim().toLowerCase() ?? '';
                return (
                  chat.fan?.username?.toLowerCase().includes(q) === true ||
                  chat.fan?.name?.toLowerCase().includes(q) === true
                );
              });
        const chats = source.slice(offset, offset + limit);
        return {
          chats,
          nextPageUrl:
            offset + chats.length < source.length ? `https://stub/chats?offset=${offset + chats.length}` : null,
        };
      },
      ),
      listMessages: vi.fn(
        async (params: { lastId?: string; order?: string; limit?: number; purpose?: string }) => {
          state.listMessagesCalls.push({
            ...(params.lastId != null ? { lastId: params.lastId } : {}),
            ...(params.order != null ? { order: params.order } : {}),
            ...(params.limit != null ? { limit: params.limit } : {}),
            ...(params.purpose != null ? { purpose: params.purpose } : {}),
          });
          return { messages, nextPageUrl: null };
        },
      ),
      getMessage: vi.fn(async () => messages[0]),
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

  function makeSync(budgetExhausted = (): boolean => false) {
    const sync = createPollingSync({
      client: stub.client,
      data,
      toMediaUrl: (url) => `media://${Buffer.from(url).toString('base64url')}`,
      isBudgetExhausted: budgetExhausted,
      // Auto-read ON so the existing tests keep exercising the legacy auto-read
      // paths (poll-delta tail fetch, read-state sweep, media polling). The
      // default-OFF gate is covered by its own describe block below.
      autoReadEnabled: () => true,
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
    expect(data.messages.count(ACCT, '101')).toBe(2);
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

  it('hub demotion slows the poll loop ×6 but read-state sweeps stay FULL-RATE (SPEC §6.2)', async () => {
    stub.setChats([makeChat({ fanId: 101, lastMessageId: 9 })]);
    const recentIso = new Date(Date.now() - 60_000).toISOString();
    stub.setMessages([makeMessage({ id: 9, fromMe: true, isNew: true, createdAt: recentIso })]);
    const sync = makeSync();
    sync.start([ACCT]);
    await vi.runOnlyPendingTimersAsync();
    await sync.openConversation(ACCT, '101'); // arms the read-state sweep

    sync.setHubDemoted(true);
    // the already-pending 60s timer fires once more, then reschedules at ×6
    await vi.advanceTimersByTimeAsync(60_000);
    const base = stub.listChatsCalls;
    const sweepsBefore = stub.listMessagesCalls.length;

    await vi.advanceTimersByTimeAsync(60_000 * 6 - 2);
    expect(stub.listChatsCalls).toBe(base); // poll loop demoted
    // sweeps kept their 30s cadence through the entire demoted window
    expect(stub.listMessagesCalls.length - sweepsBefore).toBeGreaterThanOrEqual(10);
    await vi.advanceTimersByTimeAsync(4);
    expect(stub.listChatsCalls).toBe(base + 1); // ×6 but still polling

    // restore reschedules at the full cadence without waiting out the slow timer
    sync.setHubDemoted(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(stub.listChatsCalls).toBe(base + 2);
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

    it('refreshChat (quick-look hydrate path) stamps and defaults to the message-tail purpose', async () => {
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

    it('refreshChat does NOT call listMessages (no stamp); it only nudges the list', async () => {
      stub.setChats([makeChat({ fanId: 101, lastMessageId: 5 })]);
      stub.setMessages([makeMessage({ id: 5 })]);
      const sync = makeSyncOff();
      sync.start([ACCT]);
      await vi.runOnlyPendingTimersAsync();
      const callsBefore = stub.listMessagesCalls.length;
      events = [];

      await sync.refreshChat(ACCT, '101', 'spenders-refresh');
      expect(stub.listMessagesCalls.length).toBe(callsBefore);
      expect(data.threadFetchLog.get(ACCT, '101')).toBeNull();
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
