// Chat-list filter + keyboard navigation selectors (pure; also reused by the
// dev mock bridge so dev filtering matches the real main-process semantics).

import type { ChatFilter, ChatListItemVM } from '../../../preload/contract';

export function chatMatchesFilter(chat: ChatListItemVM, filter: ChatFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'unread':
      return chat.unreadCount > 0;
    case 'with_tips':
      return chat.hasUnreadTips;
  }
}

export function applyChatFilter(
  chats: readonly ChatListItemVM[],
  filter: ChatFilter,
): ChatListItemVM[] {
  return chats.filter((c) => chatMatchesFilter(c, filter));
}

export interface ChatFilterCounts {
  all: number;
  unread: number;
  with_tips: number;
}

export function chatFilterCounts(chats: readonly ChatListItemVM[]): ChatFilterCounts {
  let unread = 0;
  let withTips = 0;
  for (const c of chats) {
    if (c.unreadCount > 0) unread += 1;
    if (c.hasUnreadTips) withTips += 1;
  }
  return { all: chats.length, unread, with_tips: withTips };
}

/** Sort by recency (newest lastMessageAt first; null timestamps sink). */
export function sortChatsByRecency(chats: readonly ChatListItemVM[]): ChatListItemVM[] {
  return [...chats].sort((a, b) => {
    const ta = a.lastMessageAt === null ? 0 : Date.parse(a.lastMessageAt);
    const tb = b.lastMessageAt === null ? 0 : Date.parse(b.lastMessageAt);
    return tb - ta;
  });
}

/** J/K step within the visible list; clamps at the edges (no wrap). */
export function nextChatId(
  orderedIds: readonly string[],
  currentId: string | null,
  direction: 1 | -1,
): string | null {
  if (orderedIds.length === 0) return null;
  if (currentId === null) return orderedIds[0] ?? null;
  const idx = orderedIds.indexOf(currentId);
  if (idx === -1) return orderedIds[0] ?? null;
  const next = Math.min(orderedIds.length - 1, Math.max(0, idx + direction));
  return orderedIds[next] ?? null;
}

/**
 * ⌘1..⌘9 jump: the Nth chat (1-based) in the current visible/filtered order.
 * Out of range (n < 1, n > length) → null = no-op. The overlay shows badges
 * only for the same first nine indices, so affordance matches capability.
 */
export function nthChatId(orderedIds: readonly string[], n: number): string | null {
  if (!Number.isInteger(n) || n < 1 || n > orderedIds.length) return null;
  return orderedIds[n - 1] ?? null;
}

/** ⌘U: next chat with unread, scanning forward from current and wrapping. */
export function nextUnreadChatId(
  chats: readonly ChatListItemVM[],
  currentId: string | null,
): string | null {
  if (chats.length === 0) return null;
  const start = currentId === null ? -1 : chats.findIndex((c) => c.chatId === currentId);
  for (let step = 1; step <= chats.length; step++) {
    const candidate = chats[(start + step + chats.length) % chats.length];
    if (candidate !== undefined && candidate.unreadCount > 0 && candidate.chatId !== currentId) {
      return candidate.chatId;
    }
  }
  return null;
}
