import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DataLayer, DbChangedEvent } from '@main/db/index';
import { memoryDataLayer, sampleChat } from './helpers';

let layer: DataLayer;
let flushed: DbChangedEvent[];

beforeEach(() => {
  layer = memoryDataLayer();
  flushed = [];
  layer.bus.subscribe((events) => flushed.push(...events));

  layer.chats.upsertMany([
    sampleChat({
      chatId: '1',
      fanName: 'Annabelle',
      unreadCount: 2,
      lastMessageAt: '2026-06-01T12:00:00.000Z',
    }),
    sampleChat({
      chatId: '2',
      fanName: 'Bob 100% Real',
      hasUnreadTips: true,
      unreadCount: 1,
      lastMessageAt: '2026-06-01T11:00:00.000Z',
    }),
    sampleChat({
      chatId: '3',
      fanName: 'carl_underscore',
      lastMessageAt: '2026-06-01T13:00:00.000Z',
    }),
    sampleChat({ chatId: '4', fanName: 'Dora', lastMessageAt: null }),
    sampleChat({
      chatId: '5',
      fanName: 'Pinned Pete',
      pinned: true,
      lastMessageAt: '2026-06-01T01:00:00.000Z',
    }),
    sampleChat({ accountId: 'acct_2', chatId: '9', fanName: 'Annabelle', unreadCount: 7 }),
  ]);
});

afterEach(() => {
  layer.close();
});

function listIds(filter: 'all' | 'unread' | 'with_tips'): string[] {
  return layer.chats.list({ accountId: 'acct_1', filter }).items.map((item) => item.chatId);
}

describe('chat list read models', () => {
  it('scopes to the account and orders pinned first, then recency, NULLs last', () => {
    expect(listIds('all')).toEqual(['5', '3', '1', '2', '4']);
  });

  it('filters unread', () => {
    expect(listIds('unread')).toEqual(['1', '2']);
  });

  it('filters with_tips', () => {
    expect(listIds('with_tips')).toEqual(['2']);
  });

  it('paginates with hasMore', () => {
    const first = layer.chats.list({ accountId: 'acct_1', filter: 'all', limit: 2 });
    expect(first.items.map((item) => item.chatId)).toEqual(['5', '3']);
    expect(first.hasMore).toBe(true);
    const last = layer.chats.list({ accountId: 'acct_1', filter: 'all', limit: 3, offset: 3 });
    expect(last.items.map((item) => item.chatId)).toEqual(['2', '4']);
    expect(last.hasMore).toBe(false);
  });

  it('updates in place on conflicting upsert (keyed by account+chat)', () => {
    layer.chats.upsert(
      sampleChat({ chatId: '1', fanName: 'Annabelle', unreadCount: 0, lastMessagePreview: 'newer' }),
    );
    expect(listIds('unread')).toEqual(['2']);
    expect(layer.chats.get('acct_1', '1')?.lastMessagePreview).toBe('newer');
    expect(layer.chats.list({ accountId: 'acct_1', filter: 'all' }).items).toHaveLength(5);
  });

  it('exposes contract-shaped fields for the view-model mapping', () => {
    const row = layer.chats.get('acct_1', '2');
    expect(row).toMatchObject({
      chatId: '2',
      fanName: 'Bob 100% Real',
      unreadCount: 1,
      hasUnreadTips: true,
      lastMessageIsSentByMe: false,
      canSendMessage: true,
      canNotSendReason: null,
    });
  });

  it('publishes one chats event per account on bulk upsert', () => {
    layer.bus.flushNow();
    expect(flushed).toEqual([
      { scope: 'chats', accountId: 'acct_1' },
      { scope: 'chats', accountId: 'acct_2' },
    ]);
  });
});

describe('chat search by fan name', () => {
  function searchIds(query: string): string[] {
    return layer.chats.search({ accountId: 'acct_1', query }).map((item) => item.chatId);
  }

  it('matches substrings case-insensitively within the account', () => {
    expect(searchIds('ann')).toEqual(['1']);
    expect(searchIds('BELLE')).toEqual(['1']);
  });

  it('treats LIKE wildcards as literals', () => {
    expect(searchIds('100%')).toEqual(['2']);
    expect(searchIds('%')).toEqual(['2']);
    expect(searchIds('_underscore')).toEqual(['3']);
    expect(searchIds('_')).toEqual(['3']);
  });

  it('returns nothing for non-matches', () => {
    expect(searchIds('zzz')).toEqual([]);
  });
});
