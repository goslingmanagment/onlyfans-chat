import { describe, expect, it } from 'vitest';
import type { ChatListItemVM } from '../../src/preload/contract';
import {
  applyChatFilter,
  chatFilterCounts,
  chatMatchesFilter,
  nextChatId,
  nextUnreadChatId,
  sortChatsByRecency,
} from '../../src/renderer/src/lib/filters';

function chat(overrides: Partial<ChatListItemVM> & { chatId: string }): ChatListItemVM {
  return {
    fanId: overrides.chatId,
    fanName: `Fan ${overrides.chatId}`,
    avatarUrl: null,
    lastMessageAt: '2026-06-10T12:00:00.000Z',
    lastMessagePreview: 'hey',
    lastMessageIsSentByMe: false,
    unreadCount: 0,
    hasUnreadTips: false,
    fanWaiting: false,
    canSendMessage: true,
    canNotSendReason: null,
    lifetimeSpend: null,
    spend30d: null,
    ...overrides,
  };
}

const CHATS: ChatListItemVM[] = [
  chat({ chatId: '1', unreadCount: 2 }),
  chat({ chatId: '2' }),
  chat({ chatId: '3', hasUnreadTips: true }),
  chat({ chatId: '4', unreadCount: 1, hasUnreadTips: true }),
  chat({ chatId: '5' }),
];

describe('chatMatchesFilter / applyChatFilter', () => {
  it('passes everything through "all"', () => {
    expect(applyChatFilter(CHATS, 'all')).toHaveLength(5);
  });

  it('filters unread', () => {
    expect(applyChatFilter(CHATS, 'unread').map((c) => c.chatId)).toEqual(['1', '4']);
  });

  it('filters with_tips', () => {
    expect(applyChatFilter(CHATS, 'with_tips').map((c) => c.chatId)).toEqual(['3', '4']);
  });

  it('matches a single chat', () => {
    expect(chatMatchesFilter(chat({ chatId: 'x', unreadCount: 2 }), 'unread')).toBe(true);
    expect(chatMatchesFilter(chat({ chatId: 'y' }), 'unread')).toBe(false);
  });
});

describe('chatFilterCounts', () => {
  it('counts each bucket', () => {
    expect(chatFilterCounts(CHATS)).toEqual({ all: 5, unread: 2, with_tips: 2 });
  });

  it('handles empty lists', () => {
    expect(chatFilterCounts([])).toEqual({ all: 0, unread: 0, with_tips: 0 });
  });
});

describe('sortChatsByRecency', () => {
  it('sorts newest first, null timestamps last', () => {
    const list = [
      chat({ chatId: 'a', lastMessageAt: '2026-06-09T10:00:00.000Z' }),
      chat({ chatId: 'b', lastMessageAt: null }),
      chat({ chatId: 'c', lastMessageAt: '2026-06-10T10:00:00.000Z' }),
    ];
    expect(sortChatsByRecency(list).map((c) => c.chatId)).toEqual(['c', 'a', 'b']);
  });
});

describe('nextChatId (J/K)', () => {
  const ids = ['1', '2', '3'];

  it('steps forward and backward', () => {
    expect(nextChatId(ids, '1', 1)).toBe('2');
    expect(nextChatId(ids, '2', -1)).toBe('1');
  });

  it('clamps at the edges', () => {
    expect(nextChatId(ids, '3', 1)).toBe('3');
    expect(nextChatId(ids, '1', -1)).toBe('1');
  });

  it('starts at the first chat when nothing is selected', () => {
    expect(nextChatId(ids, null, 1)).toBe('1');
  });

  it('recovers when the selection vanished from the list', () => {
    expect(nextChatId(ids, 'gone', 1)).toBe('1');
  });

  it('returns null for an empty list', () => {
    expect(nextChatId([], null, 1)).toBeNull();
  });
});

describe('nextUnreadChatId (⌘U)', () => {
  it('finds the next unread after the current chat', () => {
    expect(nextUnreadChatId(CHATS, '1')).toBe('4');
  });

  it('wraps around', () => {
    expect(nextUnreadChatId(CHATS, '4')).toBe('1');
  });

  it('starts from the top with no selection', () => {
    expect(nextUnreadChatId(CHATS, null)).toBe('1');
  });

  it('returns null when nothing is unread', () => {
    const read = CHATS.map((c) => ({ ...c, unreadCount: 0 }));
    expect(nextUnreadChatId(read, '1')).toBeNull();
  });

  it('never returns the current chat', () => {
    const single = [chat({ chatId: '9', unreadCount: 3 })];
    expect(nextUnreadChatId(single, '9')).toBeNull();
  });
});
