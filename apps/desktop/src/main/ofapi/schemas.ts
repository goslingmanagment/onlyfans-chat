// zod trust-boundary schemas for the OFAPI responses this app consumes (SPEC §5).
// All loose: validate the narrow shape used downstream, tolerate everything else.
// Field shapes verified against docs/vendor/onlyfansapi/openapi.json and the live
// Phase-0 probes (tmp/probe-*.json) — sanitized copies in tests/fixtures/ofapi/.

import { z } from 'zod';
import { ofapiChatMessageSchema } from '@chatgoose/shared';

// ─── Envelope (NOT universal — per-operation; SPEC §5) ───────────────────

export const ofapiPaginationSchema = z.looseObject({
  next_page: z.string().nullish(),
});

export const ofapiEnvelopeSchema = z.looseObject({
  data: z.unknown(),
  _meta: z.unknown().optional(),
  _pagination: ofapiPaginationSchema.nullish(),
});

export type OfApiEnvelope = z.infer<typeof ofapiEnvelopeSchema>;

// ─── Team-level (bare shapes, no envelope — verified live 2026-06-10) ────

export const ofapiAccountSchema = z.looseObject({
  id: z.string().min(1),
  is_authenticated: z.boolean().nullish(),
  authentication_progress: z.string().nullish(),
  display_name: z.string().nullish(),
  onlyfans_id: z.union([z.number(), z.string()]).nullish(),
  onlyfans_username: z.string().nullish(),
  onlyfans_user_data: z
    .looseObject({
      id: z.union([z.number(), z.string()]).nullish(),
      name: z.string().nullish(),
      username: z.string().nullish(),
      avatar: z.string().nullish(),
    })
    .nullish(),
});

export type OfApiAccount = z.infer<typeof ofapiAccountSchema>;

/** Re-auth needed (CG-OF-02 surface); a lone session_expired event is informational. */
export function accountNeedsReauth(account: OfApiAccount): boolean {
  return account.is_authenticated === false;
}

export const ofapiWhoamiSchema = z.looseObject({
  api_key: z
    .looseObject({
      name: z.string().nullish(),
      last_used_at: z.string().nullish(),
      created_at: z.string().nullish(),
    })
    .nullish(),
  team: z
    .looseObject({
      name: z.string().nullish(),
      slug: z.string().nullish(),
    })
    .nullish(),
});

export type OfApiWhoami = z.infer<typeof ofapiWhoamiSchema>;

// ─── Users / fans ────────────────────────────────────────────────────────

const avatarThumbsSchema = z.looseObject({
  c50: z.string().nullish(),
  c144: z.string().nullish(),
});

export const ofapiSubscribedOnDataSchema = z.looseObject({
  totalSumm: z.number().nullish(),
  subscribesSumm: z.number().nullish(),
  tipsSumm: z.number().nullish(),
  messagesSumm: z.number().nullish(),
  postsSumm: z.number().nullish(),
  streamsSumm: z.number().nullish(),
  subscribeAt: z.string().nullish(),
  expiredAt: z.string().nullish(),
  renewedAt: z.string().nullish(),
  duration: z.string().nullish(),
  discountPercent: z.number().nullish(),
  hasActivePaidSubscriptions: z.boolean().nullish(),
  unsubscribeReason: z.string().nullish(),
  price: z.number().nullish(),
  subscribePrice: z.number().nullish(),
});

export type OfApiSubscribedOnData = z.infer<typeof ofapiSubscribedOnDataSchema>;

export const ofapiUserSchema = z.looseObject({
  id: z.number(),
  name: z.string().nullish(),
  username: z.string().nullish(),
  displayName: z.string().nullish(),
  avatar: z.string().nullish(),
  avatarThumbs: avatarThumbsSchema.nullish(),
  about: z.string().nullish(),
  lastSeen: z.string().nullish(),
  joinDate: z.string().nullish(),
  isVerified: z.boolean().nullish(),
  isBlocked: z.boolean().nullish(),
  isRestricted: z.boolean().nullish(),
  canReceiveChatMessage: z.boolean().nullish(),
  subscribedOn: z.boolean().nullish(),
  subscribedBy: z.boolean().nullish(),
  subscribedOnData: ofapiSubscribedOnDataSchema.nullish(),
});

export type OfApiUser = z.infer<typeof ofapiUserSchema>;

/** `GET /{account}/users/list?ids=…` data: record keyed by user id string. */
export const ofapiUsersByIdSchema = z.record(z.string(), ofapiUserSchema);

export const ofapiFansDataSchema = z.looseObject({
  list: z.array(ofapiUserSchema),
  hasMore: z.boolean().nullish(),
});

// ─── Chats ───────────────────────────────────────────────────────────────

export const ofapiChatLastMessageSchema = z.looseObject({
  id: z.number(),
  text: z.string().nullish(),
  createdAt: z.string().nullish(),
  isOpened: z.boolean().nullish(),
  isFree: z.boolean().nullish(),
  isTip: z.boolean().nullish(),
  mediaCount: z.number().nullish(),
  fromUser: z.looseObject({ id: z.number().nullish() }).nullish(),
});

export const ofapiChatSchema = z.looseObject({
  unreadMessagesCount: z.number().nullish(),
  hasUnreadTips: z.boolean().nullish(),
  isMutedNotifications: z.boolean().nullish(),
  canSendMessage: z.boolean().nullish(),
  canNotSendReason: z.unknown().optional(),
  lastMessage: ofapiChatLastMessageSchema.nullish(),
  /** Live divergence (probe 2026-06-10): arrives as number OR numeric string. */
  lastReadMessageId: z.union([z.number(), z.string()]).nullish(),
  countPinnedMessages: z.number().nullish(),
  /** Full profile with skip_users=none; may be compact/absent with skip_users=all. */
  fan: ofapiUserSchema.nullish(),
});

export type OfApiChat = z.infer<typeof ofapiChatSchema>;

// ─── Messages (shared schema owns the transcript subset; add client extras) ───

export const ofapiMessageSchema = ofapiChatMessageSchema.extend({
  /** Fan's note accompanying a tip — OF HTML (SPEC §8.2 tip ladder, live-verified). */
  tipText: z.string().nullish(),
  fromUser: z.looseObject({ id: z.number().nullish() }).nullish(),
});

export type OfApiMessage = z.infer<typeof ofapiMessageSchema>;

// ─── Transactions ────────────────────────────────────────────────────────

export const ofapiTransactionSchema = z.looseObject({
  id: z.union([z.string(), z.number()]),
  /** Dollars (OFAPI is USD-denominated; never mills). */
  amount: z.number().nullish(),
  net: z.number().nullish(),
  fee: z.number().nullish(),
  vatAmount: z.number().nullish(),
  taxAmount: z.number().nullish(),
  createdAt: z.string().nullish(),
  currency: z.string().nullish(),
  description: z.string().nullish(),
  status: z.string().nullish(),
  type: z.string().nullish(),
  user: z
    .looseObject({
      id: z.number().nullish(),
      name: z.string().nullish(),
      username: z.string().nullish(),
    })
    .nullish(),
});

export type OfApiTransaction = z.infer<typeof ofapiTransactionSchema>;

export const ofapiTransactionsDataSchema = z.looseObject({
  list: z.array(ofapiTransactionSchema),
  hasMore: z.boolean().nullish(),
  marker: z.number().nullish(),
  nextMarker: z.number().nullish(),
});
