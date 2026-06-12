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

// ─── User lists (OnlyMonster tiers — Supporters board, PLAN item 12) ──────
// GET /{account}/user-lists → data = {list, hasMore, order, sort} — LIVE
// DIVERGENCE from the vendored openapi example (which shows a bare array;
// live-verified 2026-06-13, tmp/probe-user-lists.json): custom list ids
// arrive as STRINGS ('1247248934'), built-ins as words ('fans', 'recent');
// names are HTML-entity-encoded ('&lt; 45 days'). STRICTLY READ-ONLY:
// the lists are OnlyMonster's process — this app must never write to them.

export const ofapiUserListSchema = z.looseObject({
  id: z.union([z.string(), z.number()]),
  /** 'custom' = user/OM-created; others are OF built-ins. */
  type: z.string().nullish(),
  name: z.string().nullish(),
  usersCount: z.number().nullish(),
  canManageUsers: z.boolean().nullish(),
});

export type OfApiUserList = z.infer<typeof ofapiUserListSchema>;

export const ofapiUserListsDataSchema = z.looseObject({
  list: z.array(ofapiUserListSchema),
  hasMore: z.boolean().nullish(),
});

/** GET /{account}/user-lists/{userListId}/users → data = {list, hasMore,
 *  nextOffset} (openapi-verified); roster entries are user objects whose
 *  numeric id is the raw OnlyFans id (=== chat id). */
export const ofapiUserListUsersDataSchema = z.looseObject({
  list: z.array(ofapiUserSchema),
  hasMore: z.boolean().nullish(),
  nextOffset: z.number().nullish(),
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

// ─── Write-path responses (send pipeline, SPEC §7) ───────────────────────

/**
 * POST …/messages 200 `data` = the full created message (live-verified
 * 2026-06-11, fixture send-message-success.json). Differs from list rows:
 * no isSentByMe (it is ours by definition) and carries cancelSeconds — the
 * server-computed live unsend countdown (≈24 h).
 */
export const ofapiSentMessageSchema = ofapiMessageSchema.extend({
  isSentByMe: z.boolean().nullish(),
  cancelSeconds: z.number().nullish(),
  queueId: z.union([z.number(), z.string()]).nullish(),
});

export type OfApiSentMessage = z.infer<typeof ofapiSentMessageSchema>;

/** `{success}` data of delete/typing/mark-as-read (openapi.json + live fixture). */
export const ofapiSuccessDataSchema = z.looseObject({
  success: z.boolean(),
});

/** like/unlike `data` (openapi.json: {success, isLiked}). */
export const ofapiLikeDataSchema = z.looseObject({
  success: z.boolean(),
  isLiked: z.boolean().nullish(),
});

export type OfApiLikeResult = z.infer<typeof ofapiLikeDataSchema>;

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

// ─── Media vault (SPEC §5; PRD F7) ────────────────────────────────────────
// Shapes verified against docs/vendor/onlyfansapi/openapi.json:
// GET /{account}/media/vault → {data:{list,hasMore}}; items carry files.{full,
// thumb,preview,squarePreview} (thumb/preview null for audio), isReady, counters.

const ofapiMediaFileVariantSchema = z.looseObject({
  url: z.string().nullish(),
  width: z.number().nullish(),
  height: z.number().nullish(),
  size: z.number().nullish(),
});

export const ofapiVaultFilesSchema = z.looseObject({
  full: ofapiMediaFileVariantSchema.nullish(),
  thumb: ofapiMediaFileVariantSchema.nullish(),
  preview: ofapiMediaFileVariantSchema.nullish(),
  squarePreview: ofapiMediaFileVariantSchema.nullish(),
});

export const ofapiVaultMediaSchema = z.looseObject({
  id: z.number(),
  type: z.string().nullish(),
  canView: z.boolean().nullish(),
  hasError: z.boolean().nullish(),
  createdAt: z.string().nullish(),
  /** false ⇒ still transcoding — poll before attaching (CG-OF-08 surface). */
  isReady: z.boolean().nullish(),
  counters: z
    .looseObject({
      likesCount: z.number().nullish(),
      tipsSumm: z.number().nullish(),
    })
    .nullish(),
  files: ofapiVaultFilesSchema.nullish(),
  duration: z.number().nullish(),
});

export type OfApiVaultMedia = z.infer<typeof ofapiVaultMediaSchema>;

export const ofapiVaultMediaDataSchema = z.looseObject({
  list: z.array(ofapiVaultMediaSchema),
  hasMore: z.boolean().nullish(),
});

/** GET /{account}/media/vault/lists item (openapi: id, type, name, counts). */
export const ofapiVaultListSchema = z.looseObject({
  id: z.union([z.number(), z.string()]),
  /** 'custom' = user album; others are system buckets (posts/messages/…). */
  type: z.string().nullish(),
  name: z.string().nullish(),
  hasMedia: z.boolean().nullish(),
  videosCount: z.number().nullish(),
  photosCount: z.number().nullish(),
  gifsCount: z.number().nullish(),
  audiosCount: z.number().nullish(),
});

export type OfApiVaultList = z.infer<typeof ofapiVaultListSchema>;

export const ofapiVaultListsDataSchema = z.looseObject({
  list: z.array(ofapiVaultListSchema),
  hasMore: z.boolean().nullish(),
});

// GET /{account}/chats/{chat_id}/media → {data:{list,hasMore,nextLastId}};
// list items are MESSAGE objects carrying their media (openapi-verified).
export const ofapiChatMediaMessageSchema = z.looseObject({
  id: z.number(),
  text: z.string().nullish(),
  createdAt: z.string().nullish(),
  price: z.number().nullish(),
  isFree: z.boolean().nullish(),
  isOpened: z.boolean().nullish(),
  lockedText: z.boolean().nullish(),
  mediaCount: z.number().nullish(),
  media: z.array(z.unknown()).nullish(),
  fromUser: z.looseObject({ id: z.number().nullish() }).nullish(),
});

export type OfApiChatMediaMessage = z.infer<typeof ofapiChatMediaMessageSchema>;

export const ofapiChatMediaDataSchema = z.looseObject({
  list: z.array(ofapiChatMediaMessageSchema),
  hasMore: z.boolean().nullish(),
  nextLastId: z.union([z.number(), z.string()]).nullish(),
});

// ─── Vault upload (POST /{account}/media/vault) ──────────────────────────
// 200 (sync) → envelope {data: vault item}; 202 (async=true) → BARE
// {status,prefixed_id,polling_url} (no envelope — openapi-verified).

export const ofapiVaultUploadStartedSchema = z.looseObject({
  status: z.string(),
  prefixed_id: z.string(),
  polling_url: z.string(),
});

export type OfApiVaultUploadStarted = z.infer<typeof ofapiVaultUploadStartedSchema>;

/** GET /{account}/media/uploads/{upload}/status — bare object, free, poll until
 *  completed/failed. `media.id` is the vault id for vault uploads. */
export const ofapiUploadStatusSchema = z.looseObject({
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  prefixed_id: z.string().nullish(),
  error: z.string().nullish(),
  media: z
    .looseObject({
      id: z.number().nullish(),
      prefixed_id: z.string().nullish(),
      type: z.string().nullish(),
      isReady: z.boolean().nullish(),
    })
    .nullish(),
  credits_used: z.number().nullish(),
});

export type OfApiUploadStatus = z.infer<typeof ofapiUploadStatusSchema>;
