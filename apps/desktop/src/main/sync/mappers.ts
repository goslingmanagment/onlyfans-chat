// OFAPI objects → normalized db upsert rows. The only place chat/message/fan
// raw shapes are interpreted for storage (SPEC §6.3: everything renders from
// SQLite). Remote media URLs become media:// URLs here — the renderer never
// sees OF CDN URLs (SPEC §4).

import { z } from 'zod';
import { htmlToPlainText } from '@chatgoose/shared/transcript/index';
import type {
  AccountUpsert,
  ChatUpsert,
  FanTransactionUpsert,
  FanUpsert,
  MessageMediaItem,
  MessageUpsert,
} from '../db/rows';
import type {
  OfApiAccount,
  OfApiChat,
  OfApiMessage,
  OfApiTransaction,
  OfApiUser,
} from '../ofapi/schemas';

/** Mints an opaque media:// token; null when the remote URL is not an
 *  allowlisted OF media URL (such URLs must never reach the renderer). */
export type ToMediaUrl = (remoteUrl: string) => string | null;

// media[].files.{full,thumb,preview}.url — live-verified shape (tmp/golden probes).
const mediaFilesSchema = z.looseObject({
  full: z.looseObject({ url: z.string().nullish() }).nullish(),
  thumb: z.looseObject({ url: z.string().nullish() }).nullish(),
  preview: z.looseObject({ url: z.string().nullish() }).nullish(),
  squarePreview: z.looseObject({ url: z.string().nullish() }).nullish(),
});

const richMediaSchema = z.looseObject({
  id: z.union([z.number(), z.string()]).nullish(),
  type: z.string().nullish(),
  canView: z.boolean().nullish(),
  isReady: z.boolean().nullish(),
  duration: z.number().nullish(),
  files: mediaFilesSchema.nullish(),
});

const MEDIA_TYPES = new Set(['photo', 'video', 'audio', 'gif']);

/** Message-media item → VM-ready shape (also reused by the chat gallery). */
export function mapMediaItem(raw: unknown, toMediaUrl: ToMediaUrl): MessageMediaItem | null {
  const parsed = richMediaSchema.safeParse(raw);
  if (!parsed.success || parsed.data.id == null) {
    return null;
  }
  const media = parsed.data;
  const files = media.files ?? null;
  const thumbRemote = files?.thumb?.url ?? files?.squarePreview?.url ?? files?.preview?.url ?? null;
  const fullRemote = files?.full?.url ?? files?.preview?.url ?? null;
  const type = media.type != null && MEDIA_TYPES.has(media.type) ? media.type : 'other';
  return {
    id: String(media.id),
    type: type as MessageMediaItem['type'],
    thumbUrl: thumbRemote ? toMediaUrl(thumbRemote) : null,
    fullUrl: fullRemote ? toMediaUrl(fullRemote) : null,
    isReady: media.isReady !== false,
    locked: media.canView === false,
    durationSeconds: media.duration != null && media.duration > 0 ? media.duration : null,
  };
}

export function mapAccount(account: OfApiAccount, toMediaUrl?: ToMediaUrl): AccountUpsert {
  const avatarRemote = account.onlyfans_user_data?.avatar ?? null;
  return {
    id: account.id,
    avatar: avatarRemote && toMediaUrl ? toMediaUrl(avatarRemote) : null,
    username: account.onlyfans_username ?? '',
    displayName: account.display_name ?? account.onlyfans_user_data?.name ?? account.onlyfans_username ?? account.id,
    authState: account.is_authenticated === false ? 'unauthenticated' : 'authenticated',
    raw: account,
  };
}

function previewOf(chat: OfApiChat): string {
  const last = chat.lastMessage;
  if (!last) {
    return '';
  }
  const text = htmlToPlainText(last.text ?? '').split('\n')[0]?.trim() ?? '';
  if (text.length > 0) {
    return text;
  }
  if (last.isTip) {
    return 'Tip';
  }
  if ((last.mediaCount ?? 0) > 0) {
    return 'Media';
  }
  return '';
}

/** Creator-set custom name — OFAPI returns it as `displayName` on both chat
 *  fans and user details (live-verified 2026-06-11); unset arrives as ''. */
export function customNameOf(user: Pick<OfApiUser, 'displayName'> | null | undefined): string | null {
  const trimmed = user?.displayName?.trim();
  return trimmed != null && trimmed.length > 0 ? trimmed : null;
}

/** chat_id === fan.id (two-namespace rule); chats without a fan are dropped. */
export function mapChat(
  accountId: string,
  chat: OfApiChat,
  toMediaUrl: ToMediaUrl,
): ChatUpsert | null {
  const fanId = chat.fan?.id;
  if (fanId == null) {
    return null;
  }
  const last = chat.lastMessage ?? null;
  const lastFromFan = last?.fromUser?.id != null && last.fromUser.id === fanId;
  return {
    accountId,
    chatId: String(fanId),
    fanName: customNameOf(chat.fan) ?? chat.fan?.name ?? chat.fan?.username ?? String(fanId),
    avatar: chat.fan ? avatarMediaUrl(chat.fan, toMediaUrl) : null,
    unreadCount: chat.unreadMessagesCount ?? 0,
    hasUnreadTips: chat.hasUnreadTips ?? false,
    lastMessageAt: last?.createdAt ?? null,
    lastMessagePreview: previewOf(chat),
    lastMessageIsSentByMe: last != null && !lastFromFan,
    lastMessageId: last?.id != null ? String(last.id) : null,
    lastReadMessageId: chat.lastReadMessageId != null ? String(chat.lastReadMessageId) : null,
    pinned: false, // no flag source exists (Phase-0 verdict, PRD F2)
    canSendMessage: chat.canSendMessage ?? true,
    canNotSendReason:
      typeof chat.canNotSendReason === 'string' && chat.canNotSendReason.length > 0
        ? chat.canNotSendReason
        : null,
    raw: chat,
  };
}

export function mapMessage(
  accountId: string,
  chatId: string,
  message: OfApiMessage,
  toMediaUrl: ToMediaUrl,
): MessageUpsert {
  const replyRaw = message.replyToMessage;
  let replyTo: MessageUpsert['replyTo'] = null;
  const replyParsed = z
    .looseObject({ text: z.string().nullish(), isSentByMe: z.boolean().nullish() })
    .safeParse(replyRaw);
  if (replyRaw != null && replyParsed.success && replyParsed.data.text != null) {
    replyTo = {
      sender: replyParsed.data.isSentByMe === true ? 'model' : 'fan',
      textPreview: htmlToPlainText(replyParsed.data.text).slice(0, 120),
    };
  }
  return {
    accountId,
    chatId,
    messageId: String(message.id),
    createdAt: message.createdAt,
    isSentByMe: message.isSentByMe,
    textHtml: message.text ?? '',
    textPlain: htmlToPlainText(message.text ?? ''),
    price: message.price ?? 0,
    isOpened: message.isOpened ?? null,
    isNew: message.isNew ?? false,
    isTip: message.isTip ?? false,
    tipAmount: message.tipAmount ?? null,
    tipText: message.tipText != null ? htmlToPlainText(message.tipText) : null,
    replyTo,
    media: (message.media ?? [])
      .map((item) => mapMediaItem(item, toMediaUrl))
      .filter((item): item is MessageMediaItem => item !== null),
    deleted: false,
    raw: message,
  };
}

// subscribes[] current entry's cancelDate drives auto-renew (no boolean flag
// exists on OnlyFans fan objects — see shared context/subscription.ts).
const subscribesSchema = z.array(
  z.looseObject({ isCurrent: z.boolean().nullish(), cancelDate: z.string().nullish() }),
);

export function mapFan(
  accountId: string,
  user: OfApiUser,
  toMediaUrl: ToMediaUrl,
  fetchedAtIso: string,
): FanUpsert {
  const sub = user.subscribedOnData ?? null;
  const subscribesRaw = (sub as Record<string, unknown> | null)?.['subscribes'];
  const subscribesParsed = subscribesSchema.safeParse(subscribesRaw ?? []);
  const current = subscribesParsed.success
    ? subscribesParsed.data.find((entry) => entry.isCurrent === true)
    : undefined;
  const autoRenewOff = current != null && current.cancelDate != null;

  const expiredMs = sub?.expiredAt != null ? Date.parse(sub.expiredAt) : Number.NaN;
  const status: 'active' | 'expired' | 'none' =
    user.subscribedOn === true
      ? Number.isNaN(expiredMs) || expiredMs > Date.now()
        ? 'active'
        : 'expired'
      : sub != null
        ? 'expired'
        : 'none';

  return {
    accountId,
    fanId: String(user.id),
    username: user.username ?? '',
    name: user.name ?? user.username ?? String(user.id),
    customName: customNameOf(user),
    avatar: avatarMediaUrl(user, toMediaUrl),
    about: user.about != null && user.about.length > 0 ? htmlToPlainText(user.about) : null,
    lastSeen: user.lastSeen ?? null,
    spending:
      sub?.totalSumm != null
        ? {
            total: sub.totalSumm,
            subscriptions: sub.subscribesSumm ?? 0,
            tips: sub.tipsSumm ?? 0,
            messages: sub.messagesSumm ?? 0,
            posts: sub.postsSumm ?? 0,
            streams: sub.streamsSumm ?? 0,
          }
        : null,
    subscription:
      sub != null
        ? {
            status,
            priceUsd: sub.subscribePrice ?? sub.price ?? null,
            subscribedAt: sub.subscribeAt ?? null,
            renewsAt: sub.renewedAt ?? null,
            autoRenewOff,
            durationLabel: sub.duration ?? null,
          }
        : null,
    fetchedAt: fetchedAtIso,
  };
}

/** Avatar remote URL → media:// (smallest thumb preferred for rail/list). */
export function avatarMediaUrl(user: OfApiUser, toMediaUrl: ToMediaUrl): string | null {
  const remote = user.avatarThumbs?.c144 ?? user.avatarThumbs?.c50 ?? user.avatar ?? null;
  return remote ? toMediaUrl(remote) : null;
}

/** Transaction → fan_transactions row (DESIGN §1 30-day spend). Null when the
 *  row can't feed the per-fan aggregate: no fan id (payout fees etc.), no
 *  parseable date, or a non-positive amount. created_at normalizes to ISO-UTC
 *  so string comparisons against cutoffs are sound (OFAPI mixes offsets).
 *  net = creator earnings (tx.net); missing/implausible net falls back to
 *  0.8 × amount — OnlyFans' universal 20% platform cut. */
export function mapFanTransaction(
  accountId: string,
  tx: OfApiTransaction,
): FanTransactionUpsert | null {
  const fanId = tx.user?.id;
  if (fanId == null || typeof tx.amount !== 'number' || tx.amount <= 0 || tx.createdAt == null) {
    return null;
  }
  const createdMs = Date.parse(tx.createdAt);
  if (Number.isNaN(createdMs)) {
    return null;
  }
  const net =
    typeof tx.net === 'number' && tx.net > 0 && tx.net <= tx.amount
      ? tx.net
      : Math.round(tx.amount * 80) / 100;
  return {
    accountId,
    txId: String(tx.id),
    fanId: String(fanId),
    amount: tx.amount,
    net,
    type: tx.type ?? null,
    createdAt: new Date(createdMs).toISOString(),
  };
}
