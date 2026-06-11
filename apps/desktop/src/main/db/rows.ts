// Normalized row types: the contract between the sync/ofapi mapping layers
// (which produce them) and the query modules (which persist/serve them). Raw
// OFAPI objects ride along in `raw` JSON columns on write; reads are
// zod-validated (storage is a trust boundary) and never re-expose `raw`.

import { z } from 'zod';
import type { FanPanelVM, MessageMediaVM } from '../../preload/contract';

// ─── Scalars ──────────────────────────────────────────────────────────────

const sqlBool = z
  .union([z.literal(0), z.literal(1)])
  .transform((value) => value === 1);

export function toSqlBool(value: boolean): 0 | 1 {
  return value ? 1 : 0;
}

export function toJson(value: unknown): string {
  // JSON.stringify returns undefined at runtime for non-serializable roots.
  const serialized: string | undefined = JSON.stringify(value);
  return serialized ?? 'null';
}

// ─── Accounts ─────────────────────────────────────────────────────────────

export type AccountAuthState = 'authenticated' | 'session_expired' | 'unauthenticated';

export interface AccountRow {
  id: string;
  username: string;
  displayName: string;
  /** media:// URL (pre-mapped by sync). */
  avatar: string | null;
  authState: AccountAuthState;
  updatedAt: string;
}

export interface AccountUpsert extends Omit<AccountRow, 'updatedAt'> {
  raw: unknown;
}

const accountSqlSchema = z.object({
  id: z.string(),
  username: z.string(),
  display_name: z.string(),
  avatar: z.string().nullable(),
  auth_state: z.enum(['authenticated', 'session_expired', 'unauthenticated']),
  updated_at: z.string(),
});

export function decodeAccountRow(value: unknown): AccountRow {
  const row = accountSqlSchema.parse(value);
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatar: row.avatar,
    authState: row.auth_state,
    updatedAt: row.updated_at,
  };
}

// ─── Chats ────────────────────────────────────────────────────────────────

export interface ChatRow {
  accountId: string;
  chatId: string;
  fanName: string;
  /** media:// URL (pre-mapped by sync). */
  avatar: string | null;
  unreadCount: number;
  hasUnreadTips: boolean;
  lastMessageAt: string | null;
  lastMessagePreview: string;
  lastMessageIsSentByMe: boolean;
  /** Newest message id per the list payload — the delta detector's baseline. */
  lastMessageId: string | null;
  lastReadMessageId: string | null;
  pinned: boolean;
  canSendMessage: boolean;
  canNotSendReason: string | null;
  updatedAt: string;
}

export interface ChatUpsert extends Omit<ChatRow, 'updatedAt'> {
  raw: unknown;
}

const chatSqlSchema = z.object({
  account_id: z.string(),
  chat_id: z.string(),
  fan_name: z.string(),
  avatar: z.string().nullable(),
  unread_count: z.number().int(),
  has_unread_tips: sqlBool,
  last_message_at: z.string().nullable(),
  last_message_preview: z.string(),
  last_message_is_sent_by_me: sqlBool,
  last_message_id: z.string().nullable(),
  last_read_message_id: z.string().nullable(),
  pinned: sqlBool,
  can_send_message: sqlBool,
  can_not_send_reason: z.string().nullable(),
  updated_at: z.string(),
});

export function decodeChatRow(value: unknown): ChatRow {
  const row = chatSqlSchema.parse(value);
  return {
    accountId: row.account_id,
    chatId: row.chat_id,
    fanName: row.fan_name,
    avatar: row.avatar,
    unreadCount: row.unread_count,
    hasUnreadTips: row.has_unread_tips,
    lastMessageAt: row.last_message_at,
    lastMessagePreview: row.last_message_preview,
    lastMessageIsSentByMe: row.last_message_is_sent_by_me,
    lastMessageId: row.last_message_id,
    lastReadMessageId: row.last_read_message_id,
    pinned: row.pinned,
    canSendMessage: row.can_send_message,
    canNotSendReason: row.can_not_send_reason,
    updatedAt: row.updated_at,
  };
}

// ─── Messages ─────────────────────────────────────────────────────────────

export type MessageMediaItem = MessageMediaVM;

const mediaItemSchema: z.ZodType<MessageMediaItem> = z.object({
  id: z.string(),
  type: z.enum(['photo', 'video', 'audio', 'gif', 'other']),
  thumbUrl: z.string().nullable(),
  fullUrl: z.string().nullable(),
  isReady: z.boolean(),
  locked: z.boolean(),
  durationSeconds: z.number().nullable(),
});

const mediaListSchema = z.array(mediaItemSchema);

export interface MessageReplyTo {
  sender: 'model' | 'fan';
  textPreview: string;
}

const replyToSchema: z.ZodType<MessageReplyTo> = z.object({
  sender: z.enum(['model', 'fan']),
  textPreview: z.string(),
});

export interface MessageRow {
  accountId: string;
  chatId: string;
  messageId: string;
  createdAt: string;
  isSentByMe: boolean;
  textHtml: string;
  textPlain: string;
  price: number;
  isOpened: boolean | null;
  isNew: boolean;
  isTip: boolean;
  tipAmount: number | null;
  tipText: string | null;
  replyTo: MessageReplyTo | null;
  media: MessageMediaItem[];
  deleted: boolean;
}

export interface MessageUpsert extends MessageRow {
  raw: unknown;
}

const messageSqlSchema = z.object({
  account_id: z.string(),
  chat_id: z.string(),
  message_id: z.string(),
  created_at: z.string(),
  is_sent_by_me: sqlBool,
  text_html: z.string(),
  text_plain: z.string(),
  price: z.number(),
  is_opened: sqlBool.nullable(),
  is_new: sqlBool,
  is_tip: sqlBool,
  tip_amount: z.number().nullable(),
  tip_text: z.string().nullable(),
  reply_to: z.string().nullable(),
  media: z.string(),
  deleted: sqlBool,
});

export function decodeMessageRow(value: unknown): MessageRow {
  const row = messageSqlSchema.parse(value);
  const mediaJson: unknown = JSON.parse(row.media);
  const replyJson: unknown = row.reply_to === null ? null : JSON.parse(row.reply_to);
  return {
    accountId: row.account_id,
    chatId: row.chat_id,
    messageId: row.message_id,
    createdAt: row.created_at,
    isSentByMe: row.is_sent_by_me,
    textHtml: row.text_html,
    textPlain: row.text_plain,
    price: row.price,
    isOpened: row.is_opened,
    isNew: row.is_new,
    isTip: row.is_tip,
    tipAmount: row.tip_amount,
    tipText: row.tip_text,
    replyTo: replyJson === null ? null : replyToSchema.parse(replyJson),
    media: mediaListSchema.parse(mediaJson),
    deleted: row.deleted,
  };
}

// ─── Fans ─────────────────────────────────────────────────────────────────

export type FanSpending = NonNullable<FanPanelVM['spending']>;
export type FanSubscription = NonNullable<FanPanelVM['subscription']>;

const spendingSchema: z.ZodType<FanSpending> = z.object({
  total: z.number(),
  subscriptions: z.number(),
  tips: z.number(),
  messages: z.number(),
  posts: z.number(),
  streams: z.number(),
});

const subscriptionSchema: z.ZodType<FanSubscription> = z.object({
  status: z.enum(['active', 'expired', 'none']),
  priceUsd: z.number().nullable(),
  subscribedAt: z.string().nullable(),
  renewsAt: z.string().nullable(),
  autoRenewOff: z.boolean(),
  durationLabel: z.string().nullable(),
});

export interface FanRow {
  accountId: string;
  fanId: string;
  username: string;
  name: string;
  customName: string | null;
  /** media:// URL (pre-mapped by sync). */
  avatar: string | null;
  about: string | null;
  lastSeen: string | null;
  spending: FanSpending | null;
  subscription: FanSubscription | null;
  fetchedAt: string;
}

export type FanUpsert = FanRow;

const fanSqlSchema = z.object({
  account_id: z.string(),
  fan_id: z.string(),
  username: z.string(),
  name: z.string(),
  custom_name: z.string().nullable(),
  avatar: z.string().nullable(),
  about: z.string().nullable(),
  last_seen: z.string().nullable(),
  spending: z.string().nullable(),
  subscription: z.string().nullable(),
  fetched_at: z.string(),
});

function parseJsonOrNull<T>(text: string | null, schema: z.ZodType<T>): T | null {
  if (text === null) {
    return null;
  }
  try {
    const json: unknown = JSON.parse(text);
    const result = schema.safeParse(json);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function decodeFanRow(value: unknown): FanRow {
  const row = fanSqlSchema.parse(value);
  return {
    accountId: row.account_id,
    fanId: row.fan_id,
    username: row.username,
    name: row.name,
    customName: row.custom_name,
    avatar: row.avatar,
    about: row.about,
    lastSeen: row.last_seen,
    spending: parseJsonOrNull(row.spending, spendingSchema),
    subscription: parseJsonOrNull(row.subscription, subscriptionSchema),
    fetchedAt: row.fetched_at,
  };
}

export { parseJsonOrNull };
