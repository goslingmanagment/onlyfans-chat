// db rows → renderer view models (DESIGN §3.3: the renderer never sees raw
// OFAPI JSON). Pure functions. Media leaves main only as the opaque
// media://<sha256> token minted at sync time (SPEC §4 — OF CDN URLs carry
// expiring signatures and must never reach the renderer, even encoded).

import type { SummaryCacheEntry } from '@chatgoose/shared/summary/validity';
import type { TranscriptMessage } from '@chatgoose/shared/transcript/index';
import type {
  AccountVM,
  ChatListItemVM,
  FanPanelVM,
  MessageMediaVM,
  MessageVM,
  PpvStateVM,
} from '../../preload/contract';
import type { AccountListRow, ChatListRow, ChatRow, FanRow, MessageRow } from '../db/index';
import { parseMediaToken } from '../media/protocol';

/** Stage 31: the model registry died with the kernel cutover — model ids
 * are kernel config; display the raw id. */
function modelDisplayName(modelId: string | null): string {
  return modelId ?? 'kernel';
}

// ─── media:// mapping ─────────────────────────────────────────────────────

/**
 * Stored media reference → renderer-facing media:// token. Rows written by
 * sync already hold opaque tokens; those pass through. Anything else — a raw
 * remote URL, a legacy reversible token, data:/file:/garbage from a poisoned
 * row — maps to null: minting requires registration in media_urls (sync
 * mapping owns that), so this pure layer never hands the renderer a
 * fetchable or reversible URL.
 */
export function toRendererMediaUrl(url: string | null): string | null {
  if (url === null) return null;
  return parseMediaToken(url) !== null ? url : null;
}

export function mediaItemToVM(item: MessageMediaVM): MessageMediaVM {
  return {
    ...item,
    thumbUrl: toRendererMediaUrl(item.thumbUrl),
    fullUrl: toRendererMediaUrl(item.fullUrl),
  };
}

// ─── PPV state (SPEC §8.2: directly on the message) ──────────────────────

/**
 * price>0 ⇒ PPV; only our own sent messages carry purchase semantics:
 * sent + isOpened===true ⇒ purchased, sent + isOpened===false ⇒ not_purchased,
 * anything else stays unknown (never claim purchase state without evidence).
 */
export function derivePpvState(
  price: number,
  isOpened: boolean | null,
  isSentByMe: boolean,
): PpvStateVM | null {
  if (price <= 0) return null;
  if (isSentByMe && isOpened === true) return 'purchased';
  if (isSentByMe && isOpened === false) return 'not_purchased';
  return 'unknown';
}

// ─── Row → VM ─────────────────────────────────────────────────────────────

export function messageToVM(row: MessageRow): MessageVM {
  return {
    id: row.messageId,
    chatId: row.chatId,
    createdAt: row.createdAt,
    isSentByMe: row.isSentByMe,
    text: row.textPlain, // already plain — sync strips OF HTML before persisting
    media: row.media.map(mediaItemToVM),
    price: row.price,
    ppvState: derivePpvState(row.price, row.isOpened, row.isSentByMe),
    isTip: row.isTip,
    tipAmount: row.tipAmount,
    tipText: row.tipText,
    isNew: row.isNew,
    replyTo: row.replyTo,
    deleted: row.deleted,
  };
}

/** PRD F2: fan waiting = last message from fan + unread > 0. */
export function deriveFanWaiting(row: ChatRow): boolean {
  return row.unreadCount > 0 && !row.lastMessageIsSentByMe && row.lastMessageAt !== null;
}

export function chatToVM(row: ChatListRow, avatarUrl: string | null): ChatListItemVM {
  return {
    chatId: row.chatId,
    fanId: row.chatId, // OF invariant: chat_id === fan.id
    fanName: row.fanName,
    avatarUrl,
    lastMessageAt: row.lastMessageAt,
    lastMessageId: row.lastMessageId,
    lastMessagePreview: row.lastMessagePreview,
    lastMessageIsSentByMe: row.lastMessageIsSentByMe,
    unreadCount: row.unreadCount,
    hasUnreadTips: row.hasUnreadTips,
    fanWaiting: deriveFanWaiting(row),
    canSendMessage: row.canSendMessage,
    canNotSendReason: row.canNotSendReason,
    lifetimeSpend: row.lifetimeSpend,
    spend30d: row.spend30d,
  };
}

export function chatRowToVM(row: ChatRow, avatarUrl: string | null): ChatListItemVM {
  return {
    chatId: row.chatId,
    fanId: row.chatId,
    fanName: row.fanName,
    avatarUrl,
    lastMessageAt: row.lastMessageAt,
    lastMessageId: row.lastMessageId,
    lastMessagePreview: row.lastMessagePreview,
    lastMessageIsSentByMe: row.lastMessageIsSentByMe,
    unreadCount: row.unreadCount,
    hasUnreadTips: row.hasUnreadTips,
    fanWaiting: deriveFanWaiting(row),
    canSendMessage: row.canSendMessage,
    canNotSendReason: row.canNotSendReason,
    lifetimeSpend: null,
    spend30d: null,
  };
}

export function accountToVM(
  row: AccountListRow,
  avatarUrl: string | null,
  rawPersonalityId: string | null,
  personalityMappingState: AccountVM['personalityMappingState'],
): AccountVM {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    avatarUrl,
    // SPEC §11: a lone session_expired is informational (OFAPI auto-recovers);
    // only a hard unauthenticated state drives the re-auth banner.
    isAuthenticated: row.authState !== 'unauthenticated',
    unreadCount: row.unreadTotal,
    personalityId: personalityMappingState === 'active' ? rawPersonalityId : null,
    rawPersonalityId,
    personalityMappingState,
  };
}

export function summaryToVM(entry: SummaryCacheEntry): NonNullable<FanPanelVM['summary']> {
  return {
    body: entry.body,
    generatedAt: new Date(entry.generatedAt).toISOString(),
    modelLabel: modelDisplayName(entry.modelId ?? null),
  };
}

export function fanToVM(
  row: FanRow,
  avatarUrl: string | null,
  summary: SummaryCacheEntry | null,
): FanPanelVM {
  return {
    fanId: row.fanId,
    name: row.name,
    customName: row.customName,
    username: row.username,
    avatarUrl,
    lastSeen: row.lastSeen,
    about: row.about,
    spending: row.spending,
    subscription: row.subscription,
    summary: summary === null ? null : summaryToVM(summary),
  };
}

// NOTE: the former avatarFromChatRaw/avatarFromAccountRaw helpers are gone —
// raw-JSON columns hold remote OF URLs, which only the registering sync
// mapping may mint into tokens; avatars render from the rows' avatar columns
// (already tokens).

// ─── Ping-gate transcript shaping (shared analyzer owns the algorithm) ────

export function transcriptForPing(rows: readonly MessageRow[]): TranscriptMessage[] {
  return rows
    .filter((row) => !row.deleted)
    .map((row) => ({
      id: Number(row.messageId) || 0,
      createdAtMs: Date.parse(row.createdAt) || 0,
      sender: row.isSentByMe ? ('Model' as const) : ('Fan' as const),
      text: row.textPlain,
      labels: [],
    }));
}
