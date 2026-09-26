// D38 head protection, end to end with the real PollingSync + hub provider.
// An authoritative page-1 read keeps a newer head written within
// HEAD_WRITE_PROTECT_MS (the list lags the webhook) — but a head that is known
// to be deleted is never kept: a fan who sends a message and deletes it seconds
// later (production, pages 8/9: ~3/day, median gap 0–1 s) must see the chat
// fall back to the previous message, not a blank preview sunk to the bottom
// (re-review of PR #36).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedSyncMessage, SyncEvent } from '@chatgoose/shared/protocol/index';
import { createDataLayer, type DataLayer } from '../../src/main/db/index';
import { createHubAwareSync, type HubFactoryCallbacks } from '../../src/main/sync/hub-provider';
import type { HubFrameMeta, HubSync } from '../../src/main/sync/hub-sync';
import { createPollingSync, HEAD_WRITE_PROTECT_MS } from '../../src/main/sync/polling-sync';
import type { OfApiClient } from '../../src/main/ofapi/client';
import type { OfApiChat } from '../../src/main/ofapi/schemas';

const ACCT = 'acct_del';
const T0 = Date.parse('2026-09-26T12:00:00Z');

function chat(fanId: number, lastId: number, createdAt: string, unread = 0): OfApiChat {
  return {
    unreadMessagesCount: unread,
    hasUnreadTips: false,
    canSendMessage: true,
    lastReadMessageId: null,
    lastMessage: { id: lastId, text: `<p>m${lastId}</p>`, createdAt, fromUser: { id: fanId } },
    fan: { id: fanId, name: `Fan${fanId}`, username: `fan${fanId}` },
  } as OfApiChat;
}

const BASE_LIST = (): OfApiChat[] => [
  chat(101, 5, '2026-09-26T11:50:00+00:00'),
  chat(202, 9, '2026-09-26T11:55:00+00:00'),
  chat(303, 3, '2026-09-26T11:40:00+00:00'),
];

async function drain(): Promise<void> {
  for (let i = 0; i < 3000; i += 1) {
    await Promise.resolve();
  }
}

function liveMeta(atMs: number, accountSeq: number): HubFrameMeta {
  return {
    lane: 'durable',
    provenance: 'live',
    occurredAt: new Date(atMs).toISOString(),
    deliveredLive: true,
    accountSeq,
    transactionRef: null,
    thread: null,
  };
}

describe('head protection vs fast deletes (D38, re-review of #36)', () => {
  let data: DataLayer;
  let listChats: OfApiChat[];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    data = createDataLayer({ driverPath: 'bsqlite3-mc-node', filePath: ':memory:', encryptionKey: null });
    data.settings.set(`sync.chatHydration.${ACCT}`, { nextOffset: 0, pagesWalked: 7, done: true });
    listChats = BASE_LIST();
  });
  afterEach(() => {
    vi.useRealTimers();
    data.close();
  });

  function client(): OfApiClient {
    return {
      listChats: vi.fn(async () => ({ chats: listChats, nextPageUrl: null })),
      listMessages: vi.fn(async () => ({ messages: [], nextPageUrl: null })),
      listTransactions: vi.fn(async () => ({ transactions: [], nextMarker: null, hasMore: false })),
      listAccounts: vi.fn(async () => []),
    } as unknown as OfApiClient;
  }

  async function runtime() {
    let sink: ReturnType<typeof createHubAwareSync> | null = null;
    const polling = createPollingSync({
      client: client(),
      data,
      toMediaUrl: (url) => url,
      autoReadEnabled: () => false,
      sleep: async () => undefined,
      onListRead: (record) => sink?.handleListRead(record),
      onListVerificationFailed: (accountId, reason) =>
        sink?.handleListVerificationFailed(accountId, reason),
    });
    let callbacks: HubFactoryCallbacks | null = null;
    const hub: HubSync = {
      start: () => undefined,
      stop: () => undefined,
      status: () => 'live',
      droppedFrameCount: () => 0,
    };
    const provider = createHubAwareSync({
      polling,
      data,
      createHub: async (next) => {
        callbacks = next;
        return hub;
      },
    });
    sink = provider;
    provider.start([ACCT]);
    await drain();
    callbacks!.onStatusChange('live');
    callbacks!.onCaughtUp({ frames: 0, framesByAccount: {}, offPlatformFrames: 0, ms: 1 });
    await drain();
    expect(provider.listSync().syncing).toBe(false);
    const run = (event: SyncEvent, meta: HubFrameMeta): void => {
      const afterCommit = callbacks!.onEvent(event, meta);
      if (typeof afterCommit === 'function') afterCommit();
    };
    return { polling, provider, run };
  }

  function message(id: string, atMs: number): NormalizedSyncMessage {
    return { id, text: '<p>oops</p>', createdAt: new Date(atMs).toISOString(), isSentByMe: false, price: 0 };
  }

  function order(): string[] {
    return data.chats.list({ accountId: ACCT, filter: 'all' }).items.map((row) => row.chatId);
  }

  async function sendThenDelete(deleteAfterMs: number) {
    const { polling, provider, run } = await runtime();
    expect(data.chats.get(ACCT, '101')?.lastMessageId).toBe('5');

    // 12:01:00 — fan message 6 (enriched live frame): head 6, unread 1, on top.
    const sentAt = T0 + 60_000;
    vi.setSystemTime(sentAt);
    run(
      { type: 'messageReceived', accountId: ACCT, chatId: '101', messageId: '6', message: message('6', sentAt) },
      liveMeta(sentAt, 1),
    );
    expect(data.chats.get(ACCT, '101')).toMatchObject({ lastMessageId: '6', unreadCount: 1 });
    expect(order()[0]).toBe('101');

    // The fan deletes 6; OnlyFans' list already shows the survivor 5 again.
    vi.setSystemTime(sentAt + deleteAfterMs);
    listChats = BASE_LIST();
    run(
      { type: 'messageDeleted', accountId: ACCT, chatId: '101', messageId: '6' },
      liveMeta(sentAt + deleteAfterMs, 2),
    );
    // The delete_head intent is due 2 s later; the account gate is free.
    await vi.advanceTimersByTimeAsync(2_500);
    await drain();
    const result = {
      row: data.chats.get(ACCT, '101'),
      order: order(),
      openIntents: provider.syncIntents().openIntents().length,
    };
    await provider.stop();
    await polling.stop();
    return result;
  }

  it('a message deleted 4 s after it arrived falls back to the survivor, not a blank bottom row', async () => {
    const { row, order: rows, openIntents } = await sendThenDelete(4_000);
    expect(row).toMatchObject({
      lastMessageId: '5',
      lastMessagePreview: 'm5',
      lastMessageAt: expect.stringContaining('2026-09-26T11:50:00'),
    });
    expect(rows).toEqual(['202', '101', '303']);
    expect(openIntents).toBe(0);
  });

  it('control: deleted 15 s later (outside the protection window) — the same survivor', async () => {
    const { row, order: rows } = await sendThenDelete(15_000);
    expect(row).toMatchObject({ lastMessageId: '5', lastMessagePreview: 'm5' });
    expect(rows).toEqual(['202', '101', '303']);
  });

  it('still protects a live hub head against a lagging safety read 1 s later (fix 3)', async () => {
    const { polling, provider, run } = await runtime();
    const sentAt = T0 + 60_000;
    vi.setSystemTime(sentAt);
    run(
      { type: 'messageReceived', accountId: ACCT, chatId: '101', messageId: '6', message: message('6', sentAt) },
      liveMeta(sentAt, 1),
    );
    vi.setSystemTime(sentAt + 1_000);
    listChats = BASE_LIST(); // lagging: still head 5
    await expect(polling.readAccountHead(ACCT, 'safety', { bodyDeltas: true })).resolves.toBe('ok');
    expect(data.chats.get(ACCT, '101')).toMatchObject({ lastMessageId: '6', unreadCount: 1 });
    expect(order()[0]).toBe('101');
    await provider.stop();
    await polling.stop();
  });

  it('a row-less cached head owed a delete re-check is not protected either', async () => {
    const polling = createPollingSync({
      client: client(),
      data,
      toMediaUrl: (url) => url,
      autoReadEnabled: () => false,
      sleep: async () => undefined,
    });
    polling.start([ACCT]);
    await drain();
    // A list read put head 6 (no message row: list-only mode) 1 s ago…
    vi.setSystemTime(T0 + 60_000);
    listChats = [chat(101, 6, '2026-09-26T12:01:00+00:00', 1), ...BASE_LIST().slice(1)];
    await polling.readAccountHead(ACCT, 'intent', { preserveLocalHead: true });
    expect(data.chats.get(ACCT, '101')?.lastMessageId).toBe('6');
    expect(data.messages.get(ACCT, '101', '6')).toBeNull();

    // …then 6 was deleted: the delete follow-up read names it.
    vi.setSystemTime(T0 + 61_000);
    listChats = BASE_LIST();
    await polling.readAccountHead(ACCT, 'intent', { tombstonedHeadIds: ['6'] });
    expect(data.chats.get(ACCT, '101')?.lastMessageId).toBe('5');

    // Without the tombstone, the same recent head would be kept (fix 3).
    vi.setSystemTime(T0 + 120_000);
    listChats = [chat(101, 7, '2026-09-26T12:02:00+00:00', 1), ...BASE_LIST().slice(1)];
    await polling.readAccountHead(ACCT, 'intent', { preserveLocalHead: true });
    vi.setSystemTime(T0 + 121_000);
    listChats = BASE_LIST();
    await polling.readAccountHead(ACCT, 'safety');
    expect(data.chats.get(ACCT, '101')?.lastMessageId).toBe('7');
    expect(HEAD_WRITE_PROTECT_MS).toBeGreaterThan(1_000);
    await polling.stop();
  });
});
