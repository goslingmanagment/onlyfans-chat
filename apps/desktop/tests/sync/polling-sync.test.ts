import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  listChatsParams: { limit?: number; offset?: number }[];
  listMessagesCalls: { lastId?: string; order?: string }[];
  setChats(chats: OfApiChat[]): void;
  /** Pages of 10; nextPageUrl is non-null while deeper pages remain. */
  setChatPages(pages: OfApiChat[][]): void;
  setMessages(messages: OfApiMessage[]): void;
}

function makeStubClient(): StubClient {
  let pages: OfApiChat[][] = [[]];
  let messages: OfApiMessage[] = [];
  const state: StubClient = {
    listChatsCalls: 0,
    listChatsParams: [],
    listMessagesCalls: [],
    setChats: (next) => {
      pages = [next];
    },
    setChatPages: (next) => {
      pages = next;
    },
    setMessages: (next) => {
      messages = next;
    },
    client: {
      listChats: vi.fn(async (params: { limit?: number; offset?: number }) => {
        state.listChatsCalls += 1;
        state.listChatsParams.push({
          ...(params.limit != null ? { limit: params.limit } : {}),
          ...(params.offset != null ? { offset: params.offset } : {}),
        });
        const index = Math.floor((params.offset ?? 0) / 10);
        return {
          chats: pages[index] ?? [],
          nextPageUrl:
            index < pages.length - 1 ? `https://stub/chats?offset=${(index + 1) * 10}` : null,
        };
      }),
      listMessages: vi.fn(async (params: { lastId?: string; order?: string }) => {
        state.listMessagesCalls.push({
          ...(params.lastId != null ? { lastId: params.lastId } : {}),
          ...(params.order != null ? { order: params.order } : {}),
        });
        return { messages, nextPageUrl: null };
      }),
      getMessage: vi.fn(async () => messages[0]),
      getUserByUsername: vi.fn(async () => {
        throw new Error('404');
      }),
    } as unknown as OfApiClient,
  };
  return state;
}

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
      // No-op sleep so multi-page walks resolve under fake timers; pacing asserted via `sleeps`.
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    sync.subscribe((event) => events.push(event));
    return sync;
  }

  it('initial poll hydrates chats + fans + tails but suppresses historical message events', async () => {
    stub.setChats([makeChat({ fanId: 101, lastMessageId: 5, unread: 2 })]);
    stub.setMessages([makeMessage({ id: 4 }), makeMessage({ id: 5, fromMe: true })]);

    const sync = makeSync();
    sync.start([ACCT]);
    await vi.runOnlyPendingTimersAsync();

    expect(data.chats.get(ACCT, '101')?.unreadCount).toBe(2);
    expect(data.fans.get(ACCT, '101')?.username).toBe('fan101');
    expect(data.messages.count(ACCT, '101')).toBe(2);
    expect(events.some((e) => e.type === 'chatListUpdated')).toBe(true);
    // Baseline poll: history is not news — no message-level events.
    expect(events.filter((e) => e.type === 'messageReceived')).toHaveLength(0);
    expect(events.filter((e) => e.type === 'messageSent')).toHaveLength(0);
    expect(events.filter((e) => e.type === 'tipReceived')).toHaveLength(0);
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

  it('delta → ascending tail fetch from cached boundary with dedupe', async () => {
    stub.setChats([makeChat({ fanId: 101, lastMessageId: 5 })]);
    stub.setMessages([makeMessage({ id: 5 })]);
    const sync = makeSync();
    sync.start([ACCT]);
    await vi.runOnlyPendingTimersAsync();
    events = [];

    // new message arrives; boundary-inclusive asc tail returns [5, 6]
    stub.setChats([makeChat({ fanId: 101, lastMessageId: 6, unread: 1 })]);
    stub.setMessages([makeMessage({ id: 5 }), makeMessage({ id: 6 })]);
    await vi.advanceTimersByTimeAsync(60_000);

    const tailCall = stub.listMessagesCalls.at(-1);
    expect(tailCall).toEqual({ lastId: '5', order: 'asc' });
    expect(data.messages.count(ACCT, '101')).toBe(2);
    // only the genuinely new message emits (boundary dedupe)
    expect(events.filter((e) => e.type === 'messageReceived')).toHaveLength(1);
    sync.stop();
  });

  it('tip messages arriving post-baseline emit tipReceived with the dollar amount', async () => {
    stub.setChats([makeChat({ fanId: 101, lastMessageId: 5 })]);
    stub.setMessages([makeMessage({ id: 5 })]);
    const sync = makeSync();
    sync.start([ACCT]);
    await vi.runOnlyPendingTimersAsync();
    events = [];

    stub.setChats([makeChat({ fanId: 101, lastMessageId: 7 })]);
    stub.setMessages([makeMessage({ id: 5 }), makeMessage({ id: 7, isTip: true, tipAmount: 5 })]);
    await vi.advanceTimersByTimeAsync(60_000);

    const tip = events.find((e) => e.type === 'tipReceived');
    expect(tip).toMatchObject({ chatId: '101', amountUsd: 5 });
    sync.stop();
  });

  it('hot poll requests page 1 only with explicit limit 10 (OnlyFans live cap)', async () => {
    stub.setChats([makeChat({ fanId: 101, lastMessageId: 5 })]);
    stub.setMessages([makeMessage({ id: 5 })]);
    const sync = makeSync();
    sync.start([ACCT]);
    await vi.runOnlyPendingTimersAsync();

    await vi.advanceTimersByTimeAsync(60_000); // post-baseline hot tick
    expect(stub.listChatsParams.at(-1)).toEqual({ limit: 10, offset: 0 });
    expect(stub.listChatsParams.every((p) => p.limit === 10)).toBe(true);
    sync.stop();
  });

  it('initial hydration (empty cache) walks pages to exhaustion with 300ms pacing, silently', async () => {
    stub.setChatPages([
      [makeChat({ fanId: 101, lastMessageId: 5 })],
      [makeChat({ fanId: 102, lastMessageId: 6 })],
      [makeChat({ fanId: 103 })],
    ]);
    const sync = makeSync();
    sync.start([ACCT]);
    await drainPoll();

    expect(stub.listChatsParams.map((p) => p.offset)).toEqual([0, 10, 20]);
    expect(sleeps).toEqual([300, 300]);
    expect(data.chats.get(ACCT, '101')).not.toBeNull();
    expect(data.chats.get(ACCT, '102')).not.toBeNull();
    expect(data.chats.get(ACCT, '103')).not.toBeNull();
    expect(
      events.filter((e) => e.type === 'messageReceived' || e.type === 'messageSent'),
    ).toHaveLength(0);
    sync.stop();
  });

  it('initial hydration caps at 30 pages', async () => {
    stub.setChatPages(Array.from({ length: 40 }, (_, i) => [makeChat({ fanId: 1000 + i })]));
    const sync = makeSync();
    sync.start([ACCT]);
    await drainPoll();

    expect(stub.listChatsCalls).toBe(30);
    sync.stop();
  });

  it('deep sweep walks 5 pages every 5 minutes; hot ticks in between stay on page 1', async () => {
    stub.setChatPages(Array.from({ length: 7 }, (_, i) => [makeChat({ fanId: 200 + i })]));
    const sync = makeSync();
    sync.start([ACCT]);
    await drainPoll(); // hydration walks all 7 pages
    const afterHydration = stub.listChatsParams.length;
    expect(afterHydration).toBe(7);

    // unfocused ticks at 60..240s are hot (page 1); the 300s tick is deep due
    await vi.advanceTimersByTimeAsync(300_000);
    const offsets = stub.listChatsParams.slice(afterHydration).map((p) => p.offset);
    expect(offsets).toEqual([0, 0, 0, 0, 0, 10, 20, 30, 40]);
    sync.stop();
  });

  it('forceRefresh performs a deep sweep, not just page 1', async () => {
    stub.setChatPages(Array.from({ length: 7 }, (_, i) => [makeChat({ fanId: 300 + i })]));
    const sync = makeSync();
    sync.start([ACCT]);
    await drainPoll();
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

  it('restart with warm cache replays no burst for messages that arrived while down', async () => {
    stub.setChats([makeChat({ fanId: 101, lastMessageId: 5 })]);
    stub.setMessages([makeMessage({ id: 5 })]);
    const first = makeSync();
    first.start([ACCT]);
    await vi.runOnlyPendingTimersAsync();
    first.stop();

    // two messages land while the app is down
    stub.setChats([makeChat({ fanId: 101, lastMessageId: 7, unread: 2 })]);
    stub.setMessages([makeMessage({ id: 5 }), makeMessage({ id: 6 }), makeMessage({ id: 7 })]);
    events = [];
    const second = makeSync(); // same DataLayer = warm cache
    second.start([ACCT]);
    await vi.runOnlyPendingTimersAsync();

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
