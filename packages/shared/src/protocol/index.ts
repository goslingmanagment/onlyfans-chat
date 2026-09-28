// Operation lifecycle + sync event wire schemas (SPEC §6, §8.3).
// Reused over Electron IPC today and hub SSE later — every frame is zod-validated
// at the trust boundary (SPEC §15). Loose objects let owning modules extend
// payloads (parsed results, profiling detail) without protocol churn.
//
// Ids are strings on the wire (SPEC §10: ids TEXT). Two namespaces — OFAPI
// `acct_…` account ids vs raw OnlyFans numeric ids (`chat_id === fan.id`,
// serialized as strings). Never mix.

import { z } from 'zod';
import type { ReplyMode, ReplyTone } from '../types';
import { OPERATION_FEATURES } from '../features';

// ─── Enums ──────────────────────────────────────────────────────────────

export const operationFeatureSchema = z.enum(OPERATION_FEATURES);

export const OPERATION_PHASES = [
  'idle',
  'loading-messages',
  'loading-earnings',
  'generating',
  'completed',
  'cancelled',
  'error',
] as const;
export const operationPhaseSchema = z.enum(OPERATION_PHASES);
export type OperationPhase = z.infer<typeof operationPhaseSchema>;

const REPLY_MODES = ['default', 'preferSplit'] as const satisfies readonly ReplyMode[];
export const replyModeSchema = z.enum(REPLY_MODES);

const REPLY_TONES = ['none', 'casual', 'flirty', 'upsell', 'spicy'] as const satisfies readonly ReplyTone[];
export const replyToneSchema = z.enum(REPLY_TONES);

export const OPERATION_DISCARD_REASONS = ['chat_changed', 'cancelled', 'superseded'] as const;
export const operationDiscardReasonSchema = z.enum(OPERATION_DISCARD_REASONS);
export type OperationDiscardReason = z.infer<typeof operationDiscardReasonSchema>;

// ─── Shared payload fragments ───────────────────────────────────────────

const idSchema = z.string().min(1);

/** CG-* taxonomy error as shown to the user (error module owns the registry). */
export const userFacingErrorSchema = z.looseObject({
  key: z.string().min(1),
  code: z.string().min(1),
  message: z.string(),
  description: z.string().optional(),
  /** A6/A17 (W4.4): the thrown error's own text, under the registry headline. */
  detailText: z.string().optional(),
  settingsLink: z.boolean().optional(),
  retryAtMs: z.number().optional(),
  retryAfterMs: z.number().optional(),
});
export type UserFacingErrorPayload = z.infer<typeof userFacingErrorSchema>;

export const featureResultSchema = z.looseObject({
  rawText: z.string(),
  parts: z.array(z.string()).optional(),
  splitModeRequested: z.boolean().optional(),
});
export type FeatureResultPayload = z.infer<typeof featureResultSchema>;

export const llmSpendSummarySchema = z.looseObject({
  totalTokens: z.number(),
  inputTokens: z.number(),
  cacheWriteTokens: z.number(),
  cacheReadTokens: z.number(),
  outputTokens: z.number(),
  totalUsd: z.number(),
  uncachedUsd: z.number(),
  cacheEffectUsd: z.number(),
  cacheEffectKind: z.enum(['saved', 'overhead', 'neutral']),
  cacheWriteUsd: z.number(),
  cacheReadUsd: z.number(),
  approximate: z.boolean(),
});
export type LlmSpendSummaryPayload = z.infer<typeof llmSpendSummarySchema>;

export const profilingStageSchema = z.looseObject({
  key: z.string().min(1),
  label: z.string(),
  status: z.enum(['running', 'completed', 'failed', 'skipped']),
  startedElapsedMs: z.number(),
  endedElapsedMs: z.number().optional(),
  durationMs: z.number().optional(),
  detail: z.string().optional(),
});

export const profilingSnapshotSchema = z.looseObject({
  elapsedMs: z.number(),
  activeLabel: z.string().nullable(),
  logEntries: z.array(z.object({ elapsedMs: z.number(), message: z.string() })),
  stages: z.array(profilingStageSchema),
});
export type ProfilingSnapshotPayload = z.infer<typeof profilingSnapshotSchema>;

export const operationParamsSchema = z.object({
  replyTone: replyToneSchema.optional(),
  replyMode: replyModeSchema.optional(),
  draftText: z.string().optional(),
  forceRegenerate: z.boolean().optional(),
});
export type OperationParams = z.infer<typeof operationParamsSchema>;

// ─── Operation commands (renderer → main) ───────────────────────────────

export const operationStartSchema = z.object({
  type: z.literal('operation:start'),
  operationId: idSchema,
  feature: operationFeatureSchema,
  accountId: idSchema,
  chatId: idSchema,
  params: operationParamsSchema.optional(),
});
export type OperationStart = z.infer<typeof operationStartSchema>;

export const operationCancelSchema = z.object({
  type: z.literal('operation:cancel'),
  operationId: idSchema,
});
export type OperationCancel = z.infer<typeof operationCancelSchema>;

export const operationCommandSchema = z.discriminatedUnion('type', [
  operationStartSchema,
  operationCancelSchema,
]);
export type OperationCommand = z.infer<typeof operationCommandSchema>;

// ─── Operation events (main → renderer) ─────────────────────────────────

export const operationProgressSchema = z.object({
  type: z.literal('operation:progress'),
  operationId: idSchema,
  feature: operationFeatureSchema,
  phase: operationPhaseSchema,
  currentPage: z.number().int().nonnegative().optional(),
  targetPages: z.number().int().nonnegative().optional(),
  message: z.string().optional(),
  statusCode: z.string().optional(),
  retryAtMs: z.number().optional(),
  llmSpend: llmSpendSummarySchema.optional(),
  profiling: profilingSnapshotSchema.optional(),
});
export type OperationProgress = z.infer<typeof operationProgressSchema>;

export const operationChunkSchema = z.object({
  type: z.literal('operation:chunk'),
  operationId: idSchema,
  text: z.string(),
});
export type OperationChunk = z.infer<typeof operationChunkSchema>;

export const operationCompleteSchema = z.object({
  type: z.literal('operation:complete'),
  operationId: idSchema,
  feature: operationFeatureSchema,
  result: featureResultSchema,
  llmSpend: llmSpendSummarySchema.optional(),
  profiling: profilingSnapshotSchema.optional(),
  /** Remaining daily AI gateway requests for the page (#120) — the dock
   * pre-warns when this runs low instead of surprising with CG-HUB-03. */
  quotaRemainingRequests: z.number().int().nonnegative().optional(),
});
export type OperationComplete = z.infer<typeof operationCompleteSchema>;

export const operationErrorSchema = z.object({
  type: z.literal('operation:error'),
  operationId: idSchema,
  error: userFacingErrorSchema,
  profiling: profilingSnapshotSchema.optional(),
});
export type OperationError = z.infer<typeof operationErrorSchema>;

export const operationDiscardedSchema = z.object({
  type: z.literal('operation:discarded'),
  operationId: idSchema,
  reason: operationDiscardReasonSchema,
  error: userFacingErrorSchema.optional(),
  profiling: profilingSnapshotSchema.optional(),
});
export type OperationDiscarded = z.infer<typeof operationDiscardedSchema>;

/** Debug mode only: exact prompt snapshot emitted before the LLM call (SPEC §12). */
export const operationDebugPromptSchema = z.object({
  type: z.literal('operation:debugPrompt'),
  operationId: idSchema,
  feature: operationFeatureSchema,
  snapshot: z.record(z.string(), z.unknown()),
});
export type OperationDebugPrompt = z.infer<typeof operationDebugPromptSchema>;

export const operationEventSchema = z.discriminatedUnion('type', [
  operationProgressSchema,
  operationChunkSchema,
  operationCompleteSchema,
  operationErrorSchema,
  operationDiscardedSchema,
  operationDebugPromptSchema,
]);
export type OperationEvent = z.infer<typeof operationEventSchema>;

// ─── Sync events (SPEC §6; same union over IPC and hub SSE) ─────────────

export const chatListUpdatedEventSchema = z.object({
  type: z.literal('chatListUpdated'),
  accountId: idSchema,
});

export const normalizedSyncMessageMediaSchema = z.object({
  id: idSchema,
  type: z.enum(['photo', 'video', 'audio', 'gif', 'other']),
  isReady: z.boolean(),
  locked: z.boolean(),
  durationSeconds: z.number().nonnegative().nullable().optional(),
});

export const normalizedSyncMessageReplyToSchema = z.object({
  messageId: idSchema.optional(),
  sender: z.enum(['fan', 'model']).optional(),
  textPreview: z.string(),
});

export const normalizedSyncMessageSchema = z.object({
  id: idSchema,
  text: z.string(),
  createdAt: z.string(),
  isSentByMe: z.boolean(),
  price: z.number().nonnegative(),
  isOpened: z.boolean().nullable().optional(),
  isNew: z.boolean().optional(),
  isTip: z.boolean().optional(),
  tipAmountUsd: z.number().nonnegative().nullable().optional(),
  tipText: z.string().nullable().optional(),
  mediaCount: z.number().int().nonnegative().optional(),
  media: z.array(normalizedSyncMessageMediaSchema).optional(),
  replyTo: normalizedSyncMessageReplyToSchema.nullable().optional(),
});
export type NormalizedSyncMessage = z.infer<typeof normalizedSyncMessageSchema>;

const tolerantNormalizedSyncMessageSchema = normalizedSyncMessageSchema.optional().catch(undefined);

export const messageReceivedEventSchema = z.object({
  type: z.literal('messageReceived'),
  accountId: idSchema,
  chatId: idSchema,
  messageId: idSchema,
  message: tolerantNormalizedSyncMessageSchema,
  /** v2 journal time of the event; catch-up/live gating input (absent on v1). */
  occurredAt: z.string().optional(),
  /** false = replayed catch-up: apply state, but suppress toast/sound/OS-notif. */
  live: z.boolean().optional(),
  /** D38: the fan's display name when the chat row does not exist yet (first
   * message of a new chat) but the local fans cache knows the fan. */
  fanName: z.string().min(1).optional(),
  /** D38: the chat is not in the local list yet and no name is known locally. */
  newChat: z.boolean().optional(),
});

export const messageSentEventSchema = z.object({
  type: z.literal('messageSent'),
  accountId: idSchema,
  chatId: idSchema,
  messageId: idSchema,
  message: tolerantNormalizedSyncMessageSchema,
});

export const ppvUnlockedEventSchema = z.object({
  type: z.literal('ppvUnlocked'),
  accountId: idSchema,
  chatId: idSchema,
  messageId: idSchema.optional(),
  /** D39: the PPV price in dollars (Core's `amountUsd`, else the strictly
   * parsed `amountText`); absent when unknown — never fabricated. */
  amountUsd: z.number().nonnegative().optional(),
  /** D39: the fan's label for the quiet purchase alert, resolved in main. */
  fanName: z.string().min(1).optional(),
  /** D39: true only when main decided this purchase is news (a quiet alert);
   * absent or false = state only. Deliberately opposite to messageReceived's
   * `live`, whose absence means "alert": a purchase alerts only on an
   * explicit yes. */
  live: z.boolean().optional(),
});

export const tipReceivedEventSchema = z.object({
  type: z.literal('tipReceived'),
  accountId: idSchema,
  chatId: idSchema,
  messageId: idSchema.optional(),
  // OFAPI amounts are dollars; absent when upstream omits it (never fabricate).
  amountUsd: z.number().nonnegative().optional(),
  /** D39: see ppvUnlocked. */
  fanName: z.string().min(1).optional(),
  /** D39: see ppvUnlocked — only an explicit true alerts. */
  live: z.boolean().optional(),
});

/**
 * D39: one posted OnlyFans transaction (Core `transaction.posted`). Applied in
 * main straight into fan_transactions keyed by the transaction id — the same
 * id OFAPI's transactions list returns, so the hourly sweep never counts it
 * twice. Never forwarded as an alert.
 */
export const transactionPostedEventSchema = z.object({
  type: z.literal('transactionPosted'),
  accountId: idSchema,
  /** The paying fan (raw OnlyFans user id = chat id). */
  fanId: idSchema,
  transactionId: idSchema,
  /** Gross amount in dollars (never mills). */
  amountUsd: z.number().positive(),
  netUsd: z.number().nonnegative().optional(),
  transactionType: z.string().min(1).optional(),
  createdAt: z.string(),
});

/**
 * D44: a new subscriber (Core `subscription.started`). Main applies it like a
 * chat-list nudge and stamps `live` only on its explicit yes (live v2 frame,
 * after replay, inside the age gate, once) — the renderer rings on true only.
 */
export const subscriberStartedEventSchema = z.object({
  type: z.literal('subscriberStarted'),
  accountId: idSchema,
  /** The new subscriber (raw OnlyFans user id = chat id), when Core names one. */
  fanId: idSchema.optional(),
  live: z.boolean().optional(),
});

export const presenceEventSchema = z.object({
  type: z.literal('presence'),
  accountId: idSchema,
  chatId: idSchema,
  online: z.boolean(),
  lastSeenAt: z.number().optional(),
});

export const typingEventSchema = z.object({
  type: z.literal('typing'),
  accountId: idSchema,
  chatId: idSchema,
});

export const accountAuthChangedEventSchema = z.object({
  type: z.literal('accountAuthChanged'),
  accountId: idSchema,
  authenticated: z.boolean(),
});

export const messageDeletedEventSchema = z.object({
  type: z.literal('messageDeleted'),
  accountId: idSchema,
  messageId: idSchema,
  // Upstream OFAPI messages.deleted carries no chat id — chatId is optional so
  // main can enrich via local (accountId, messageId) lookup before re-emitting.
  chatId: idSchema.optional(),
});
export type MessageDeletedEvent = z.infer<typeof messageDeletedEventSchema>;

export const readStateChangedEventSchema = z.object({
  type: z.literal('readStateChanged'),
  accountId: idSchema,
  chatId: idSchema,
  lastReadMessageId: idSchema.optional(),
});

export const syncEventSchema = z.discriminatedUnion('type', [
  chatListUpdatedEventSchema,
  messageReceivedEventSchema,
  messageSentEventSchema,
  ppvUnlockedEventSchema,
  tipReceivedEventSchema,
  transactionPostedEventSchema,
  subscriberStartedEventSchema,
  presenceEventSchema,
  typingEventSchema,
  accountAuthChangedEventSchema,
  readStateChangedEventSchema,
  messageDeletedEventSchema,
]);
export type SyncEvent = z.infer<typeof syncEventSchema>;

export const syncSnapshotRequiredSchema = z.object({
  error: z.literal('sync_snapshot_required'),
  message: z.string(),
  statusCode: z.literal(409),
  version: z.literal(1),
  requestedSeq: z.number().int().nonnegative(),
  oldestAvailableSeq: z.number().int().nonnegative().nullable(),
  currentSeq: z.number().int().nonnegative(),
  snapshotPath: z.literal('/api/v1/events/snapshot'),
});
export type SyncSnapshotRequired = z.infer<typeof syncSnapshotRequiredSchema>;

export const syncSnapshotRestartRequiredSchema = z.object({
  error: z.literal('sync_snapshot_restart_required'),
  message: z.string(),
  statusCode: z.literal(409),
  replayFloor: z.number().int().nonnegative(),
  snapshotPath: z.literal('/api/v1/events/snapshot'),
});
export type SyncSnapshotRestartRequired = z.infer<typeof syncSnapshotRestartRequiredSchema>;

const syncSnapshotTimestampSchema = z.string().refine(
  (value) => Number.isFinite(Date.parse(value)),
  'Expected an ISO timestamp',
);

export const syncSnapshotMessageSchema = z.object({
  chatId: idSchema,
  messageId: idSchema,
  message: normalizedSyncMessageSchema.nullable(),
  deletedAt: syncSnapshotTimestampSchema.nullable(),
  sourceUpdatedAt: syncSnapshotTimestampSchema,
  sourceFanoutSeq: z.number().int().nonnegative().nullable(),
});
export type SyncSnapshotMessage = z.infer<typeof syncSnapshotMessageSchema>;

export const syncSnapshotThreadSchema = z.object({
  chatId: idSchema,
  fanName: z.string(),
  unreadCount: z.number().int().nonnegative(),
  hasUnreadTips: z.boolean().optional(),
  lastMessageId: idSchema.nullable(),
  lastMessageAt: syncSnapshotTimestampSchema.nullable(),
  lastMessageIsSentByMe: z.boolean(),
  lastMessagePreview: z.string(),
  visible: z.boolean(),
  sourceUpdatedAt: syncSnapshotTimestampSchema,
  messages: z.array(syncSnapshotMessageSchema),
});
export type SyncSnapshotThread = z.infer<typeof syncSnapshotThreadSchema>;

export const syncSnapshotResponseSchema = z.object({
  version: z.literal(1),
  requestedAfterSeq: z.number().int().nonnegative(),
  snapshotCursor: z.number().int().nonnegative(),
  stateAt: syncSnapshotTimestampSchema,
  resumeAllowed: z.boolean(),
  page: z.object({
    pageId: z.number().int().positive(),
    label: z.string(),
    accountId: idSchema,
    username: z.string().nullable(),
    authStatus: z.string().nullable(),
    authenticated: z.boolean().nullable(),
    authChangedAt: syncSnapshotTimestampSchema.nullable(),
  }),
  coverage: z.object({
    durableDomains: z.array(
      z.enum(['chat_heads', 'hot_messages', 'message_tombstones', 'account_auth']),
    ),
    omittedDomains: z.array(z.object({ domain: z.string(), reason: z.string() })),
    messageWindow: z.literal('hot_projection_plus_archive_delta'),
  }),
  threads: z.array(syncSnapshotThreadSchema),
  unresolvedTombstones: z.array(
    z.object({
      messageId: idSchema,
      deletedAt: syncSnapshotTimestampSchema,
      sourceUpdatedAt: syncSnapshotTimestampSchema,
      sourceFanoutSeq: z.number().int().nonnegative(),
    }),
  ),
  nextPageCursor: z.number().int().nonnegative().nullable(),
  /** Present (including terminal null) only when Core accepted the additive
   * bounded_v1 protocol. Absent means an old/legacy Core response. */
  nextStateCursor: z.string().min(1).max(2_048).nullable().optional(),
});
export type SyncSnapshotResponse = z.infer<typeof syncSnapshotResponseSchema>;

// ─── Boundary parse helpers (null = reject, mirroring legacy guards) ────

export function parseOperationCommand(value: unknown): OperationCommand | null {
  const parsed = operationCommandSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseOperationEvent(value: unknown): OperationEvent | null {
  const parsed = operationEventSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseSyncEvent(value: unknown): SyncEvent | null {
  const parsed = syncEventSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

// ─── Kernel event stream v2 (Stage 24) ─────────────────────────────────────
// The desktop consumes `/api/v1/events/v2/stream`: ledger-ordered domain
// frames (opaque per-account cursor in the SSE id line) plus serve-time-only
// `event: ephemeral` frames (typing — never ledgered, never checkpointed).
// mapDomainFrame translates the canonical vocabulary onto the existing local
// SyncEvent union so handleHubEvent and everything below it stay untouched.

export const domainEventFrameSchema = z.object({
  accountId: z.number().int(),
  accountSeq: z.number().int(),
  // Canonical vocabulary — deliberately open: unknown types are ignored by
  // contract (the v1 union's forward-compat rule, now explicit).
  type: z.string().min(1),
  occurredAt: z.string(),
  data: z.unknown(),
  // Stage 24 serve-time fields (optional on the wire).
  fanRef: z.string().nullable().optional(),
  conversationRef: z.string().nullable().optional(),
  messageRef: z.string().nullable().optional(),
  /** The page's OFAPI account ref; null = not an OFAPI-mapped page (dropped here). */
  accountRef: z.string().nullable().optional(),
  /** Normalized message payload on message.received/sent (same shape as v1). */
  payload: z.unknown().optional(),
  // H3 serve-time fields (core #265). Every one of them is advisory, so a
  // malformed value degrades to "absent" instead of rejecting the durable
  // frame: a rejected frame freezes the cursor and trips the poison breaker.
  /** Ledger transaction ref on transaction.posted (money facts, D2). */
  transactionRef: z.string().nullable().optional().catch(undefined),
  /** Closed enum on the wire (`live | redelivery | repair`), deliberately
   * parsed open here: an unknown value must mean "not live", never a
   * frame_validation_failed. Read it through {@link frameProvenance}. */
  provenance: z.unknown().optional(),
  /** Fan labels on money-fact frames whose conversation Core knows. */
  thread: z.object({
    fanName: z.string().nullable(),
    username: z.string().nullable(),
  }).optional().catch(undefined),
});
export type DomainEventFrame = z.infer<typeof domainEventFrameSchema>;

/**
 * What Core knows about how a durable frame's fact reached its ledger (H3).
 * `live` means "not a KNOWN redelivery or repair" — it is not a freshness
 * signal (replayed backlog is labelled `live` too). A missing or unrecognised
 * value is `unknown`, which every consumer must treat as not live.
 */
export const HUB_FRAME_PROVENANCES = ['live', 'redelivery', 'repair', 'unknown'] as const;
export type HubFrameProvenance = (typeof HUB_FRAME_PROVENANCES)[number];

export function frameProvenance(frame: Pick<DomainEventFrame, 'provenance'>): HubFrameProvenance {
  const value = frame.provenance;
  return value === 'live' || value === 'redelivery' || value === 'repair' ? value : 'unknown';
}

/**
 * Client-side platform filter for the v2 stream. The desktop asks Core for
 * `platform=onlyfans`, but an older Core silently ignores the parameter on a
 * cursorless request and would replay every granted platform. OFAPI names
 * OnlyFans accounts `acct_…` (Fansly accounts are `fansly_acct_…`); a frame
 * whose page has no OnlyFans OFAPI ref is not this client's to apply.
 */
export function isOnlyFansAccountRef(ref: string | null | undefined): ref is string {
  return typeof ref === 'string' && /^acct_[A-Za-z0-9_-]+$/.test(ref);
}

export const domainSnapshotRequiredSchema = z.object({
  error: z.literal('sync_snapshot_required'),
  statusCode: z.literal(409),
  version: z.literal(2),
  accounts: z.array(z.object({
    accountId: z.number().int(),
    requestedSeq: z.number().int().nonnegative(),
    oldestAvailableSeq: z.number().int().nullable(),
    currentSeq: z.number().int().nonnegative(),
  })),
  snapshotPath: z.string(),
});
export type DomainSnapshotRequired = z.infer<typeof domainSnapshotRequiredSchema>;

export const domainSnapshotResponseSchema = z.object({
  /** Opaque replay cursor bound to the exact numeric grant snapshot represented
   * by accounts. The cursor may remain behind a state-recovery barrier. */
  cursor: z.string().min(1),
  accounts: z.array(z.object({
    accountId: z.number().int(),
    /** Platform-native OFAPI id used to walk the matching durable state. Null
     * for granted pages outside the OFAPI-backed Desktop lane. */
    accountRef: z.string().min(1).nullable(),
    currentSeq: z.number().int().nonnegative(),
  })),
});
export type DomainSnapshotResponse = z.infer<typeof domainSnapshotResponseSchema>;

/** H3: the money facts `GET /api/v1/events/v2/facts` serves (D39 catch-up). */
export const DOMAIN_EVENT_FACT_TYPES = [
  'message.ppv_unlocked',
  'tip.received',
  'transaction.posted',
] as const;

/**
 * One `GET /api/v1/events/v2/facts` page. `facts` stays `unknown[]` here and
 * each row is read with {@link parseDomainEventFrame}: the SDK's own schema
 * has a CLOSED provenance enum, so one unknown value (or one malformed row)
 * would fail the whole page and wedge the catch-up forever.
 */
export const domainEventFactsPageSchema = z.object({
  accountId: z.number().int(),
  throughSeq: z.number().int().nonnegative(),
  facts: z.array(z.unknown()),
  nextAfterSeq: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});
export type DomainEventFactsPage = z.infer<typeof domainEventFactsPageSchema>;

const AUTH_OK_STATUSES = new Set(['connected', 'reconnected', 'session_expired']);

function nonNegativeNumberOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function positiveNumberOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * `{AMOUNT}` of an OFAPI PPV notification ("$45.00") as dollars — Core's
 * `parseOfapiPpvAmountUsd` rule verbatim: a dollar sign, whole dollars,
 * optional two-digit cents, nothing else; anything else is null (an honest
 * unknown beats a plausible guess on a money field). Integer cents first, so
 * "$13.99" is 13.99 and not a float sum. PPV events written before Core added
 * the numeric `amountUsd` (H2) carry only this text.
 */
export function parsePpvAmountText(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null;
  }
  const match = /^\$(0|[1-9][0-9]{0,5})(?:\.([0-9]{2}))?$/.exec(value);
  if (!match) {
    return null;
  }
  const cents = Number(match[1]) * 100 + Number(match[2] ?? '0');
  return cents / 100;
}

function ppvAmountUsdOf(data: Record<string, unknown>): number | undefined {
  const direct = nonNegativeNumberOf(data.amountUsd);
  if (direct !== undefined) {
    return direct;
  }
  return parsePpvAmountText(data.amountText) ?? undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function frameDataRecord(frame: DomainEventFrame): Record<string, unknown> {
  return typeof frame.data === 'object' && frame.data !== null
    ? (frame.data as Record<string, unknown>)
    : {};
}

/**
 * Canonical v2 frame → local SyncEvent. Null = not consumable here (unknown
 * type, non-OFAPI account, or a ref the mapping requires is missing) — the
 * caller still checkpoints the cursor past it (forward-compat rule).
 * The 10 v1-era members: messageReceived/messageSent/messageDeleted/
 * ppvUnlocked/tipReceived/presence/chatListUpdated/accountAuthChanged map
 * here; typing rides the ephemeral lane; readStateChanged was always
 * synthesized locally (the server never sent it). D39 adds
 * transactionPosted (transaction.posted), which has no v1 twin.
 */
export function mapDomainFrame(frame: DomainEventFrame): SyncEvent | null {
  const accountId = frame.accountRef ?? null;
  if (accountId === null) {
    return null; // not an OFAPI-mapped page — nothing local to apply
  }
  const data = frameDataRecord(frame);
  switch (frame.type) {
    case 'message.received':
    case 'message.sent': {
      const chatId = frame.conversationRef ?? null;
      const messageId = frame.messageRef ?? null;
      if (chatId === null || messageId === null) {
        return null;
      }
      const message = tolerantNormalizedSyncMessageSchema.parse(frame.payload);
      return {
        type: frame.type === 'message.received' ? 'messageReceived' : 'messageSent',
        accountId,
        chatId,
        messageId,
        ...(frame.type === 'message.received' ? { occurredAt: frame.occurredAt } : {}),
        ...(message !== undefined ? { message } : {}),
      };
    }
    case 'message.deleted': {
      const messageId = frame.messageRef ?? null;
      return messageId === null ? null : { type: 'messageDeleted', accountId, messageId };
    }
    case 'message.ppv_unlocked': {
      const chatId = frame.conversationRef ?? null;
      const amountUsd = ppvAmountUsdOf(data);
      return chatId === null
        ? null
        : {
            type: 'ppvUnlocked',
            accountId,
            chatId,
            ...(frame.messageRef ? { messageId: frame.messageRef } : {}),
            ...(amountUsd !== undefined ? { amountUsd } : {}),
          };
    }
    case 'transaction.posted': {
      // D39: the money itself (tips, PPV, subscriptions). Core keys it by the
      // OFAPI transaction id (`transactionRef`) and names the payer in fanRef;
      // there is no conversation ref on this kind. OnlyFans amounts are
      // dollars (A46's `amountUnit`, absent on events written before it): a
      // declared other unit is refused rather than mis-scaled.
      const fanId = nonEmptyString(frame.fanRef);
      const transactionId = nonEmptyString(frame.transactionRef);
      const amountUsd = positiveNumberOf(data.amount);
      const unit = data.amountUnit;
      if (
        fanId === undefined
        || transactionId === undefined
        || amountUsd === undefined
        || (unit !== undefined && unit !== null && unit !== 'dollars')
        || !Number.isFinite(Date.parse(frame.occurredAt))
      ) {
        return null;
      }
      const netUsd = nonNegativeNumberOf(data.netAmount);
      const transactionType = nonEmptyString(data.transactionType);
      return {
        type: 'transactionPosted',
        accountId,
        fanId,
        transactionId,
        amountUsd,
        ...(netUsd !== undefined ? { netUsd } : {}),
        ...(transactionType !== undefined ? { transactionType } : {}),
        createdAt: frame.occurredAt,
      };
    }
    case 'tip.received': {
      const chatId = frame.conversationRef ?? null;
      const amountUsd = nonNegativeNumberOf(data.amountGross);
      return chatId === null
        ? null
        : {
            type: 'tipReceived',
            accountId,
            chatId,
            ...(amountUsd !== undefined ? { amountUsd } : {}),
          };
    }
    case 'presence.online':
    case 'presence.offline': {
      const chatId = frame.fanRef ?? null;
      if (chatId === null) {
        return null;
      }
      const lastSeenRaw = typeof data.lastSeenOnlineAt === 'string' ? Date.parse(data.lastSeenOnlineAt) : Number.NaN;
      return {
        type: 'presence',
        accountId,
        chatId,
        online: frame.type === 'presence.online',
        ...(Number.isFinite(lastSeenRaw) ? { lastSeenAt: lastSeenRaw } : {}),
      };
    }
    case 'subscription.started': {
      // D44: its own event so a new subscriber can ring; main still applies it
      // as the chat-list nudge it used to be.
      const fanId = nonEmptyString(frame.fanRef);
      return { type: 'subscriberStarted', accountId, ...(fanId !== undefined ? { fanId } : {}) };
    }
    case 'subscription.renewed':
      return { type: 'chatListUpdated', accountId };
    case 'account.auth_changed': {
      const status = typeof data.status === 'string' ? data.status : null;
      return status === null
        ? null
        : { type: 'accountAuthChanged', accountId, authenticated: AUTH_OK_STATUSES.has(status) };
    }
    default:
      return null;
  }
}

export function parseDomainEventFrame(value: unknown): DomainEventFrame | null {
  const parsed = domainEventFrameSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
