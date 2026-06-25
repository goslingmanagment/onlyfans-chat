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
});

export const tipReceivedEventSchema = z.object({
  type: z.literal('tipReceived'),
  accountId: idSchema,
  chatId: idSchema,
  messageId: idSchema.optional(),
  // OFAPI amounts are dollars; absent when upstream omits it (never fabricate).
  amountUsd: z.number().nonnegative().optional(),
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
