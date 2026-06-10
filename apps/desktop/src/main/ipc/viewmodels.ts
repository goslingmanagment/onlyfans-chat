// db rows → renderer view models (DESIGN §3.3: the renderer never sees raw
// OFAPI JSON). Pure functions; the only Node dependency is Buffer via the
// media URL codec. Remote media URLs leave main only as media:// references
// (SPEC §4 — OF CDN URLs carry expiring signatures).

import { z } from 'zod';
import { getModelDisplayName } from '@chatgoose/shared/llm/model-registry';
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
import type { AccountListRow, ChatRow, FanRow, MessageRow } from '../db/index';
import { MEDIA_SCHEME, toMediaUrl } from '../media/protocol';

// ─── media:// mapping ─────────────────────────────────────────────────────

const MEDIA_PREFIX = `${MEDIA_SCHEME}://`;

/**
 * Remote http(s) URL → media:// reference. Idempotent (already-mapped URLs
 * pass through); anything else (data:, file:, garbage) maps to null so a
 * poisoned row can never hand the renderer a fetchable non-OF URL scheme.
 */
export function toRendererMediaUrl(url: string | null): string | null {
  if (url === null) return null;
  if (url.startsWith(MEDIA_PREFIX)) return url;
  if (!/^https?:\/\//.test(url)) return null;
  return toMediaUrl(url);
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

export function chatToVM(row: ChatRow, avatarUrl: string | null): ChatListItemVM {
  return {
    chatId: row.chatId,
    fanId: row.chatId, // OF invariant: chat_id === fan.id
    fanName: row.fanName,
    avatarUrl,
    lastMessageAt: row.lastMessageAt,
    lastMessagePreview: row.lastMessagePreview,
    lastMessageIsSentByMe: row.lastMessageIsSentByMe,
    unreadCount: row.unreadCount,
    hasUnreadTips: row.hasUnreadTips,
    fanWaiting: deriveFanWaiting(row),
    canSendMessage: row.canSendMessage,
  };
}

export function accountToVM(
  row: AccountListRow,
  avatarUrl: string | null,
  personalityId: string | null,
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
    personalityId,
  };
}

export function summaryToVM(entry: SummaryCacheEntry): NonNullable<FanPanelVM['summary']> {
  return {
    body: entry.body,
    generatedAt: new Date(entry.generatedAt).toISOString(),
    modelLabel: getModelDisplayName(entry.modelId ?? null),
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

// ─── Avatars from raw columns (storage trust boundary → zod, tolerant) ────

const chatRawSchema = z.looseObject({
  fan: z
    .looseObject({
      avatar: z.string().nullish(),
      avatarThumbs: z
        .looseObject({ c50: z.string().nullish(), c144: z.string().nullish() })
        .nullish(),
    })
    .nullish(),
});

const accountRawSchema = z.looseObject({
  onlyfans_user_data: z.looseObject({ avatar: z.string().nullish() }).nullish(),
});

function parseRawJson(rawJson: string): unknown {
  try {
    const parsed: unknown = JSON.parse(rawJson);
    return parsed;
  } catch {
    return null;
  }
}

/** Thumb preferred (cached on OF CDN after first fetch); returns a media:// URL. */
export function avatarFromChatRaw(rawJson: string): string | null {
  const parsed = chatRawSchema.safeParse(parseRawJson(rawJson));
  if (!parsed.success) return null;
  const fan = parsed.data.fan;
  return toRendererMediaUrl(fan?.avatarThumbs?.c144 ?? fan?.avatar ?? null);
}

export function avatarFromAccountRaw(rawJson: string): string | null {
  const parsed = accountRawSchema.safeParse(parseRawJson(rawJson));
  if (!parsed.success) return null;
  return toRendererMediaUrl(parsed.data.onlyfans_user_data?.avatar ?? null);
}

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
