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
  listMessagesCalls: { lastId?: string; order?: string }[];
  setChats(chats: OfApiChat[]): void;
  setMessages(messages: OfApiMessage[]): void;
}

function makeStubClient(): StubClient {
  let chats: OfApiChat[] = [];
  let messages: OfApiMessage[] = [];
  const state: StubClient = {
    listChatsCalls: 0,
    listMessagesCalls: [],
    setChats: (next) => {
      chats = next;
    },
    setMessages: (next) => {
      messages = next;
    },
    client: {
      listChats: vi.fn(async () => {
        state.listChatsCalls += 1;
        return { chats, nextPageUrl: null };
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

  beforeEach(() => {
    vi.useFakeTimers();
    data = createDataLayer({
      driverPath: TEST_DRIVER,
      filePath: ':memory:',
      encryptionKey: null,
    });
    stub = makeStubClient();
    events = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    data.close();
  });

  function makeSync(budgetExhausted = (): boolean => false) {
    const sync = createPollingSync({
      client: stub.client,
      data,
      toMediaUrl: (url) => `media://${Buffer.from(url).toString('base64url')}`,
      isBudgetExhausted: budgetExhausted,
    });
    sync.subscribe((event) => events.push(event));
    return sync;
  }

  it('initial poll upserts chats + fans and fetches tails for new chats', async () => {
    stub.setChats([makeChat({ fanId: 101, lastMessageId: 5, unread: 2 })]);
    stub.setMessages([makeMessage({ id: 4 }), makeMessage({ id: 5, fromMe: true })]);

    const sync = makeSync();
    sync.start([ACCT]);
    await vi.runOnlyPendingTimersAsync();

    expect(data.chats.get(ACCT, '101')?.unreadCount).toBe(2);
    expect(data.fans.get(ACCT, '101')?.username).toBe('fan101');
    expect(data.messages.count(ACCT, '101')).toBe(2);
    expect(events.some((e) => e.type === 'chatListUpdated')).toBe(true);
    expect(events.filter((e) => e.type === 'messageReceived')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'messageSent')).toHaveLength(1);
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

  it('tip messages emit tipReceived with the dollar amount', async () => {
    stub.setChats([makeChat({ fanId: 101, lastMessageId: 7 })]);
    stub.setMessages([makeMessage({ id: 7, isTip: true, tipAmount: 5 })]);
    const sync = makeSync();
    sync.start([ACCT]);
    await vi.runOnlyPendingTimersAsync();

    const tip = events.find((e) => e.type === 'tipReceived');
    expect(tip).toMatchObject({ chatId: '101', amountUsd: 5 });
    sync.stop();
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
