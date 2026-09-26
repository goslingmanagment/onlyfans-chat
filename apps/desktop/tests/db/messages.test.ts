import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataLayer, DbChangedEvent, MessageUpsert } from '@main/db/index';
import { MESSAGE_RETENTION_DEFAULT } from '@main/db/queries/messages';
import { SQL_IN_CHUNK } from '@main/db/queries/fans';
import { memoryDataLayer, sampleChat, sampleMessage } from './helpers';

// Re-exported type sanity: DbChangedEvent comes from the pinned preload contract.
type Events = readonly DbChangedEvent[];

let layer: DataLayer;
let flushed: DbChangedEvent[];

beforeEach(() => {
  layer = memoryDataLayer();
  flushed = [];
  layer.bus.subscribe((events: Events) => flushed.push(...events));
});

afterEach(() => {
  layer.close();
});

function at(minute: number): string {
  return `2026-06-01T10:${String(minute).padStart(2, '0')}:00.000Z`;
}

function seed(count: number, overrides: Partial<MessageUpsert> = {}): void {
  const rows = Array.from({ length: count }, (_, index) =>
    sampleMessage({
      messageId: `m${String(index + 1).padStart(3, '0')}`,
      createdAt: at(index + 1),
      textPlain: `text ${index + 1}`,
      ...overrides,
    }),
  );
  layer.messages.upsertMany(rows);
}

describe('messages upsert', () => {
  it('dedupes by (account, chat, message) and applies the latest version', () => {
    layer.messages.upsertMany([sampleMessage({ textPlain: 'first' })]);
    layer.messages.upsertMany([sampleMessage({ textPlain: 'edited', isNew: true })]);
    expect(layer.messages.count('acct_1', '101')).toBe(1);
    const row = layer.messages.get('acct_1', '101', 'm1');
    expect(row?.textPlain).toBe('edited');
    expect(row?.isNew).toBe(true);
  });

  it('keeps the same message id distinct across chats and accounts', () => {
    layer.messages.upsertMany([
      sampleMessage(),
      sampleMessage({ chatId: '202' }),
      sampleMessage({ accountId: 'acct_2' }),
    ]);
    expect(layer.messages.count('acct_1', '101')).toBe(1);
    expect(layer.messages.count('acct_1', '202')).toBe(1);
    expect(layer.messages.count('acct_2', '101')).toBe(1);
  });

  it('round-trips media, replyTo, tip and PPV fields through JSON columns', () => {
    const message = sampleMessage({
      price: 25,
      isOpened: true,
      isTip: true,
      tipAmount: 5,
      tipText: 'for you',
      replyTo: { sender: 'fan', textPreview: 'earlier' },
      media: [
        {
          id: 'media1',
          type: 'video',
          thumbUrl: 'media://thumb1',
          fullUrl: null,
          isReady: false,
          locked: true,
          durationSeconds: 42,
        },
      ],
    });
    layer.messages.upsertMany([message]);
    const row = layer.messages.get('acct_1', '101', 'm1');
    expect(row).toMatchObject({
      price: 25,
      isOpened: true,
      isTip: true,
      tipAmount: 5,
      tipText: 'for you',
      replyTo: { sender: 'fan', textPreview: 'earlier' },
    });
    expect(row?.media).toEqual(message.media);
  });

  it('rejects corrupt stored media JSON on read (zod at the storage boundary)', () => {
    layer.messages.upsertMany([sampleMessage()]);
    layer.db
      .prepare("UPDATE messages SET media = '\"not-an-array\"' WHERE message_id = 'm1'")
      .run();
    expect(() => layer.messages.get('acct_1', '101', 'm1')).toThrow();
  });

  it('publishes one deduped messages event per (account, chat)', () => {
    layer.messages.upsertMany([
      sampleMessage({ messageId: 'a' }),
      sampleMessage({ messageId: 'b' }),
      sampleMessage({ messageId: 'c', chatId: '202' }),
    ]);
    layer.bus.flushNow();
    expect(flushed).toEqual([
      { scope: 'messages', accountId: 'acct_1', chatId: '101' },
      { scope: 'messages', accountId: 'acct_1', chatId: '202' },
    ]);
  });

  it('inserts stubs only when absent and never downgrades an existing row', () => {
    layer.messages.upsertMany([
      sampleMessage({
        messageId: 'm1',
        textPlain: 'authoritative body',
        price: 25,
        isOpened: true,
        media: [
          {
            id: 'media1',
            type: 'photo',
            thumbUrl: 'media://thumb1',
            fullUrl: null,
            isReady: true,
            locked: true,
            durationSeconds: null,
          },
        ],
        raw: { source: 'hub-sse' },
      }),
    ]);
    layer.bus.flushNow();
    flushed = [];

    const inserted = layer.messages.insertManyIfAbsent([
      sampleMessage({
        messageId: 'm1',
        textPlain: 'stub',
        price: 0,
        isOpened: null,
        media: [],
        raw: { source: 'hub-command' },
      }),
      sampleMessage({
        messageId: 'm2',
        textPlain: 'new stub',
        raw: { source: 'hub-command' },
      }),
    ]);

    expect(inserted).toBe(1);
    expect(layer.messages.get('acct_1', '101', 'm1')).toMatchObject({
      textPlain: 'authoritative body',
      price: 25,
      isOpened: true,
      media: [
        expect.objectContaining({
          id: 'media1',
          locked: true,
        }),
      ],
    });
    expect(layer.messages.get('acct_1', '101', 'm2')).toMatchObject({
      textPlain: 'new stub',
    });
    layer.bus.flushNow();
    expect(flushed).toEqual([{ scope: 'messages', accountId: 'acct_1', chatId: '101' }]);
  });

  it('keeps a durable PPV unlock monotonic across stale message upserts', () => {
    layer.messages.upsertMany([sampleMessage({ price: 25, isOpened: false })]);

    // D39: the old markOpened is a recorded purchase fact now.
    layer.messageFacts.recordPpvUnlock({
      accountId: 'acct_1',
      chatId: '101',
      messageId: 'm1',
      hubAccountId: 9,
      accountSeq: 1,
      amountUsd: 25,
      provenance: 'live',
      occurredAt: '2026-06-01T10:00:00.000Z',
      source: 'stream',
    }, '2026-06-01T10:00:01.000Z');
    expect(layer.messages.get('acct_1', '101', 'm1')?.isOpened).toBe(true);

    layer.messages.upsertMany([sampleMessage({ price: 25, isOpened: false })]);
    expect(layer.messages.get('acct_1', '101', 'm1')?.isOpened).toBe(true);

    layer.messages.upsertMany([sampleMessage({ price: 25, isOpened: null })]);
    expect(layer.messages.get('acct_1', '101', 'm1')?.isOpened).toBe(true);
  });
});

describe('messages tombstone', () => {
  it('flags rows deleted but keeps them readable', () => {
    seed(3);
    layer.messages.markDeleted('acct_1', '101', ['m002']);
    expect(layer.messages.count('acct_1', '101')).toBe(3);
    expect(layer.messages.get('acct_1', '101', 'm002')?.deleted).toBe(true);
    expect(layer.messages.get('acct_1', '101', 'm001')?.deleted).toBe(false);
    const page = layer.messages.page({ accountId: 'acct_1', chatId: '101' });
    expect(page.items.map((item) => item.deleted)).toEqual([false, true, false]);
  });

  it('keeps tombstones monotonic across later upserts', () => {
    layer.messages.upsertMany([sampleMessage({ messageId: 'm002', deleted: false })]);
    layer.messages.markDeleted('acct_1', '101', ['m002']);
    layer.messages.upsertMany([sampleMessage({ messageId: 'm002', textPlain: 'resynced', deleted: false })]);
    expect(layer.messages.get('acct_1', '101', 'm002')).toMatchObject({
      textPlain: 'resynced',
      deleted: true,
    });

    layer.messages.upsertMany([sampleMessage({ messageId: 'm003', deleted: true })]);
    expect(layer.messages.get('acct_1', '101', 'm003')?.deleted).toBe(true);
  });

  it('is a no-op (and publishes nothing) for unknown ids', () => {
    seed(1);
    layer.bus.flushNow();
    flushed = [];
    layer.messages.markDeleted('acct_1', '101', ['nope']);
    layer.bus.flushNow();
    expect(flushed).toEqual([]);
  });
});

describe('batched contact history', () => {
  it('returns the newest row with its own author, timestamp and media, resolving numeric id ties', () => {
    const media = [{
      id: 'photo-1', type: 'photo' as const, thumbUrl: null, fullUrl: null,
      isReady: true, locked: false, durationSeconds: null,
    }];
    layer.messages.upsertMany([
      sampleMessage({ messageId: '2', createdAt: at(2), textPlain: 'fan text' }),
      sampleMessage({ messageId: '10', createdAt: at(2), isSentByMe: true, textPlain: '', media }),
      sampleMessage({ messageId: '20', createdAt: at(3), deleted: true }),
      sampleMessage({ messageId: '30', createdAt: 'invalid-date' }),
      sampleMessage({ accountId: 'acct_2', messageId: '40', createdAt: at(4) }),
      sampleMessage({ chatId: '202', messageId: '50', createdAt: at(5) }),
    ]);

    const newest = layer.messages.newestPerChat('acct_1', ['101', 'missing']);
    expect([...newest.keys()]).toEqual(['101']);
    expect(newest.get('101')).toMatchObject({
      messageId: '10', createdAt: at(2), isSentByMe: true, textPlain: '', media, deleted: false,
    });
  });

  it('compares actual instants across offsets and returns valid ISO dates for each sender', () => {
    layer.messages.upsertMany([
      sampleMessage({ messageId: '1', createdAt: '2026-06-01T14:00:00+03:00', isSentByMe: false }),
      sampleMessage({ messageId: '2', createdAt: '2026-06-01T12:00:00.000Z', isSentByMe: false, isTip: true, tipAmount: 5, textPlain: '' }),
      sampleMessage({ messageId: '3', createdAt: '2026-06-01T12:30:00.000Z', isSentByMe: true }),
      sampleMessage({ messageId: '4', createdAt: '2026-06-01T13:00:00.000Z', isSentByMe: true, deleted: true }),
      sampleMessage({ messageId: '5', createdAt: 'invalid-date', isSentByMe: true }),
      sampleMessage({ chatId: '202', createdAt: 'invalid-date', isSentByMe: true }),
      sampleMessage({ accountId: 'acct_2', createdAt: at(59), isSentByMe: true }),
    ]);

    expect(layer.messages.latestBySender('acct_1', ['101', '202', 'missing'])).toEqual(new Map([
      ['101', { lastFanAt: '2026-06-01T12:00:00.000Z', lastModelAt: '2026-06-01T12:30:00.000Z' }],
      ['202', { lastFanAt: null, lastModelAt: null }],
    ]));
    expect(layer.messages.newestPerChat('acct_1', ['101', '202']).get('101')?.messageId).toBe('3');
    expect(layer.messages.newestPerChat('acct_1', ['202'])).toEqual(new Map());

    layer.messages.markDeleted('acct_1', '101', ['3']);
    expect(layer.messages.newestPerChat('acct_1', ['101']).get('101')).toMatchObject({
      messageId: '2', isSentByMe: false, isTip: true, tipAmount: 5,
    });
  });

  it('only rejects a chat-list head whose exact account/chat/message has a tombstone', () => {
    layer.chats.upsertMany([
      sampleChat({ chatId: '101', lastMessageId: '1' }),
      sampleChat({ chatId: '202', lastMessageId: '2' }),
      sampleChat({ chatId: '303', lastMessageId: '3' }),
      sampleChat({ chatId: '404', lastMessageId: '4' }),
      sampleChat({ accountId: 'acct_2', chatId: '101', lastMessageId: '1' }),
    ]);
    layer.messages.upsertMany([
      sampleMessage({ chatId: '101', messageId: '1', deleted: true }),
      sampleMessage({ chatId: '202', messageId: '2' }),
      sampleMessage({ chatId: '202', messageId: '3', deleted: true }),
      sampleMessage({ accountId: 'acct_2', chatId: '404', messageId: '4', deleted: true }),
      sampleMessage({ accountId: 'acct_2', chatId: '101', messageId: '1' }),
    ]);

    expect(layer.messages.deletedChatHeadIds('acct_1', ['101', '202', '303', '404', 'missing']))
      .toEqual(new Set(['101']));
    expect(layer.messages.deletedChatHeadIds('acct_2', ['101'])).toEqual(new Set());
  });

  it('keeps local query count bounded by SQL chunks for a large roster', () => {
    const ids = Array.from({ length: SQL_IN_CHUNK + 1 }, (_, index) => String(index + 1));
    layer.messages.upsertMany(ids.map((chatId) => sampleMessage({ chatId })));
    const prepare = vi.spyOn(layer.db, 'prepare');

    expect(layer.messages.newestPerChat('acct_1', ids).size).toBe(ids.length);
    expect(prepare).toHaveBeenCalledTimes(2);
    prepare.mockClear();
    expect(layer.messages.latestBySender('acct_1', ids).size).toBe(ids.length);
    expect(prepare).toHaveBeenCalledTimes(2);
    prepare.mockClear();
    expect(layer.messages.deletedChatHeadIds('acct_1', ids)).toEqual(new Set());
    expect(prepare).toHaveBeenCalledTimes(2);
    prepare.mockRestore();
  });
});

describe('messages retention pruning', () => {
  it('keeps the newest N rows per chat and reports deletions', () => {
    seed(12);
    seed(4, { chatId: '202' });
    const removed = layer.messages.prune('acct_1', '101', 5);
    expect(removed).toBe(7);
    expect(layer.messages.count('acct_1', '101')).toBe(5);
    // The other chat is untouched.
    expect(layer.messages.count('acct_1', '202')).toBe(4);
    const page = layer.messages.page({ accountId: 'acct_1', chatId: '101' });
    expect(page.items.map((item) => item.messageId)).toEqual([
      'm008',
      'm009',
      'm010',
      'm011',
      'm012',
    ]);
  });

  it('returns 0 when under the limit', () => {
    seed(3);
    expect(layer.messages.prune('acct_1', '101', 5000)).toBe(0);
  });

  it('keeps 50,000 messages per chat by default (Stage 4 stop-loss: ~10× the legacy cap)', () => {
    expect(MESSAGE_RETENTION_DEFAULT).toBe(50000);
  });

  it('rejects a negative keep value', () => {
    expect(() => layer.messages.prune('acct_1', '101', -1)).toThrow(/non-negative/);
  });
});

describe('messages paging', () => {
  it('returns the newest page in ascending order with hasMore', () => {
    seed(10);
    const page = layer.messages.page({ accountId: 'acct_1', chatId: '101', limit: 4 });
    expect(page.hasMore).toBe(true);
    expect(page.items.map((item) => item.messageId)).toEqual(['m007', 'm008', 'm009', 'm010']);
  });

  it('pages backwards through history via beforeId until exhausted', () => {
    seed(5);
    const first = layer.messages.page({ accountId: 'acct_1', chatId: '101', limit: 2 });
    expect(first.items.map((item) => item.messageId)).toEqual(['m004', 'm005']);
    const second = layer.messages.page({
      accountId: 'acct_1',
      chatId: '101',
      limit: 2,
      beforeId: 'm004',
    });
    expect(second.items.map((item) => item.messageId)).toEqual(['m002', 'm003']);
    expect(second.hasMore).toBe(true);
    const third = layer.messages.page({
      accountId: 'acct_1',
      chatId: '101',
      limit: 2,
      beforeId: 'm002',
    });
    expect(third.items.map((item) => item.messageId)).toEqual(['m001']);
    expect(third.hasMore).toBe(false);
  });

  it('breaks created_at ties deterministically by message_id', () => {
    layer.messages.upsertMany([
      sampleMessage({ messageId: 'b', createdAt: at(1) }),
      sampleMessage({ messageId: 'a', createdAt: at(1) }),
      sampleMessage({ messageId: 'c', createdAt: at(1) }),
    ]);
    const page = layer.messages.page({ accountId: 'acct_1', chatId: '101', limit: 2 });
    expect(page.items.map((item) => item.messageId)).toEqual(['b', 'c']);
    const older = layer.messages.page({
      accountId: 'acct_1',
      chatId: '101',
      limit: 2,
      beforeId: 'b',
    });
    expect(older.items.map((item) => item.messageId)).toEqual(['a']);
  });

  it('orders numeric platform message ids numerically within created_at ties', () => {
    layer.messages.upsertMany([
      sampleMessage({ messageId: '2', createdAt: at(1) }),
      sampleMessage({ messageId: '10', createdAt: at(1) }),
      sampleMessage({ messageId: '1', createdAt: at(1) }),
    ]);
    const page = layer.messages.page({ accountId: 'acct_1', chatId: '101', limit: 2 });
    expect(page.items.map((item) => item.messageId)).toEqual(['2', '10']);
    const older = layer.messages.page({
      accountId: 'acct_1',
      chatId: '101',
      limit: 2,
      beforeId: '2',
    });
    expect(older.items.map((item) => item.messageId)).toEqual(['1']);
  });

  it('returns an empty page for an unknown beforeId', () => {
    seed(3);
    const page = layer.messages.page({
      accountId: 'acct_1',
      chatId: '101',
      beforeId: 'missing',
    });
    expect(page).toEqual({ items: [], hasMore: false });
  });
});
