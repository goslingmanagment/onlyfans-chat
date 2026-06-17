// AI operation coordinator — behavioral port of the legacy lifecycle (SPEC §8.3,
// research §8): one operation per conversation with synchronous reservation
// (CG-FLOW-04 on concurrent start), operationId correlation with stale-event
// discard, discard on conversation switch, staged timeouts, 50 ms chunk
// batching, sanitizer/XML result pipeline, CG-coded errors, debug profiling.
//
// P4 scope: all seven operation features (quick fast-reply / improve-draft /
// help-me plus deep fan-summary / chat-review and gated ping / hi-greeting).
// 'compare' stays gated off until its orchestration lands (PLAN allows the
// deferral). LLM auto-retry (429 Retry-After ≤ 60 s, 503 + 5 s) lives INSIDE
// the providers (runWithLegacyRetry, pre-first-chunk only) — the coordinator
// must not add a second retry layer on top.

import { z } from 'zod';
import {
  DEFAULT_FEATURE_MODELS,
  DEFAULT_FEATURE_REASONING,
  HI_GREETING_MAX_TRANSCRIPT,
  HI_GREETING_MESSAGE_COUNT,
  STREAM_CHUNK_FLUSH_MS,
} from '@chatgoose/shared/constants';
import {
  getFeaturePolicy,
  isDeepFeature,
  resolveFeatureModelFeature,
} from '@chatgoose/shared/features';
import type { OperationFeature } from '@chatgoose/shared/features';
import { CgError, toUserFacing } from '@chatgoose/shared/errors/index';
import type { UserFacingError } from '@chatgoose/shared/errors/index';
import { getModelEntry } from '@chatgoose/shared/llm/model-registry';
import { buildLlmSpendSummary } from '@chatgoose/shared/llm/cost';
import type { LlmUsageMetrics } from '@chatgoose/shared/llm/sse';
import { buildPrompt, stripPromptCache } from '@chatgoose/shared/prompts/builder';
import type { PromptBlock } from '@chatgoose/shared/prompts/builder';
import { createBundledPersonalities } from '@chatgoose/shared/prompts/personalities';
import {
  normalizeReplyParts,
  normalizeSingleReplyPart,
  normalizeVariantReplyParts,
} from '@chatgoose/shared/output/reply-output';
import { parseChatReviewXml, parseHelpMeXml } from '@chatgoose/shared/output/xml';
import { isValidSummaryCacheEntry } from '@chatgoose/shared/summary/validity';
import type { SummaryCacheEntry } from '@chatgoose/shared/summary/validity';
import { analyzePingSegment, formatTranscript } from '@chatgoose/shared/transcript/index';
import type { FeatureType, Personality, PingSegment, ReplyMode, ReplyTone } from '@chatgoose/shared/types';
import {
  replyModeSchema,
  replyToneSchema,
} from '@chatgoose/shared/protocol/index';
import type {
  FeatureResultPayload,
  OperationDiscardReason,
  OperationEvent,
  OperationPhase,
  UserFacingErrorPayload,
} from '@chatgoose/shared/protocol/index';
import type { AiStartRequest, SettingsVM } from '../../preload/contract';
import type { DataLayer } from '../db/index';
import type { OfApiClient } from '../ofapi/client';
import type { SettingsStore } from '../settings/store';
import type { Keychain, SecretName } from '../secrets/keychain';
import { createDirectGateway } from './gateway';
import type { AiGateway, CancelFn } from './gateway';
import { createContextLoader } from './context-loader';
import type { ContextLoader } from './context-loader';
import { createOperationProfiler, NO_OP_PROFILER } from './profiler';
import type { OperationProfiler, ProfilerStageHandle } from './profiler';
import { createStagedTimeouts } from './timeouts';
import type { StagedTimeouts } from './timeouts';

// ─── Pinned export surface ────────────────────────────────────────────────

/**
 * P4 hub wiring seam for fan-summary sync (SPEC §8.5). Both hooks are
 * optional and absent today; the hub module will attach adapters over
 * HubClient.getFanProfile / putFanProfile — `accountId` maps to the core
 * `pageLabel` there and `fanId` is the raw OnlyFans id (`chat_id === fan.id`).
 */
export interface SummaryHubHooks {
  /**
   * Pre-generation prefetch (5 s budget owned by the hook). A non-null result
   * is adopted as the cached summary — zero LLM calls. Must reject/resolve
   * null on failure; the coordinator treats any throw as "no hub profile".
   */
  prefetchSummary?: (args: {
    accountId: string;
    fanId: string;
  }) => Promise<{ body: string; generatedAt: number } | null>;
  /** Fire-and-forget post-generation push (10 s budget owned by the hook). */
  pushSummary?: (args: {
    accountId: string;
    fanId: string;
    body: string;
    generatedAt: number;
  }) => Promise<void>;
}

/**
 * Raw usage payload — exactly what recordUsageEvent persists to usage_events
 * and hands to the optional onUsageEvent hook. Field names follow the LLM
 * usage metrics (cacheCreationInputTokens…), not core's wire contract; the hub
 * module owns the mapping (src/main/hub/usage-mapper.ts). `chatId` is the raw
 * OnlyFans id (`chat_id === fan.id`) backing core's conversationId.
 */
export interface UsageEventRecord {
  clientEventId: string;
  feature: FeatureType;
  model: string;
  inputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  chatId: string;
  durationMs: number;
  isCacheHit: boolean;
  isRegeneration: boolean;
  completedAt: string;
}

export interface AiCoordinatorDeps {
  data: DataLayer;
  client: OfApiClient;
  settingsStore: SettingsStore;
  keychain: Keychain;
  gateway?: AiGateway;
  summaryHub?: SummaryHubHooks;
  /**
   * P4 hub wiring seam (SPEC §8.6): fired after the usage_events row is
   * written so fresh events reach the hub usage reporter immediately. The
   * table write stays the persistence — this hook is delivery only.
   */
  onUsageEvent?: (event: UsageEventRecord) => void;
}

export interface AiCoordinator {
  start(req: AiStartRequest): void;
  cancel(operationId: string): void;
  conversationOpened(accountId: string, chatId: string): void;
  conversationClosed(accountId: string, chatId: string): void;
  subscribe(listener: (event: OperationEvent) => void): () => void;
  dispose(): void;
}

// ─── Trust-boundary schema (IPC args may be anything at runtime) ─────────

const FEATURE_TYPES = [
  'fast-reply',
  'improve-draft',
  'help-me',
  'fan-summary',
  'chat-review',
  'ping',
  'hi-greeting',
  'compare',
] as const satisfies readonly FeatureType[];

const aiStartRequestSchema = z.object({
  operationId: z.string().min(1),
  feature: z.enum(FEATURE_TYPES),
  accountId: z.string().min(1),
  chatId: z.string().min(1),
  params: z.object({
    tone: replyToneSchema.optional(),
    mode: replyModeSchema.optional(),
    draftText: z.string().optional(),
    forceRegenerate: z.boolean().optional(),
  }),
});

const operationIdOnlySchema = z.object({ operationId: z.string().min(1) });

/**
 * Where the personalities IPC module persists the saved list (db settings
 * table). The coordinator only reads; an absent row falls back to the bundled
 * set so a fresh install can run with the default Lora mapping.
 */
export const PERSONALITIES_SETTINGS_KEY = 'personalities';

const personalityListSchema = z.array(
  z.object({
    id: z.string().min(1),
    name: z.string(),
    content: z.string().min(1),
    updatedAt: z.number(),
    builtin: z.boolean().optional(),
    builtinVersion: z.number().optional(),
  }),
);

// ─── Internal operation state ─────────────────────────────────────────────

interface ParsedParams {
  tone?: ReplyTone | undefined;
  mode?: ReplyMode | undefined;
  draftText?: string | undefined;
  forceRegenerate?: boolean | undefined;
}

/**
 * fan-summary cache-write inputs collected along the pipeline. The entry is
 * persisted at completion only when BOTH verification flags are true (legacy
 * rule: a summary built from degraded context must not be cached).
 */
interface SummaryCacheSeed {
  personalityId: string;
  personalityUpdatedAt: number;
  spendingVerified: boolean;
  subscriptionVerified: boolean;
}

interface OperationState {
  operationId: string;
  feature: OperationFeature;
  accountId: string;
  chatId: string;
  conversationKey: string;
  params: ParsedParams;
  abort: AbortController;
  cancelStream: CancelFn | null;
  timeouts: StagedTimeouts;
  profiler: OperationProfiler;
  ttfbStage: ProfilerStageHandle | null;
  streamStage: ProfilerStageHandle | null;
  settled: boolean;
  modelId: string;
  usage: LlmUsageMetrics | null;
  sawFirstChunk: boolean;
  chunkBuffer: string;
  chunkTimer: ReturnType<typeof setTimeout> | null;
  startedAtMs: number;
  /** Set only on a fan-summary cache miss; null for every other feature. */
  summarySeed: SummaryCacheSeed | null;
}

function conversationKeyOf(accountId: string, chatId: string): string {
  return `${accountId}|${chatId}`;
}

/** errors-registry shape → protocol wire shape (`key` correlates with the code). */
function toWireError(error: UserFacingError): UserFacingErrorPayload {
  return {
    key: error.code,
    code: error.code,
    message: error.message,
    description: error.recovery,
    ...(error.settingsLink ? { settingsLink: true } : {}),
    ...(error.retryAtMs !== undefined ? { retryAtMs: error.retryAtMs } : {}),
    ...(error.retryAfterMs !== undefined ? { retryAfterMs: error.retryAfterMs } : {}),
  };
}

/**
 * 'compare' orchestration is deferred (PLAN: lowest priority). CG-FLOW family
 * frame; the code is outside the ported registry on purpose — it disappears
 * when compare lands, so it never enters the shared registry.
 */
function compareDeferredError(feature: FeatureType): UserFacingErrorPayload {
  return {
    key: 'CG-FLOW-P4',
    code: 'CG-FLOW-P4',
    message: `${feature} arrives in P4.`,
    description: 'This feature is not available yet in this build.',
  };
}

function resolveMessageCount(feature: OperationFeature, settings: SettingsVM): number {
  switch (getFeaturePolicy(feature).messageCountBucket) {
    case 'deep':
      return settings.deepMessageCount;
    case 'ping':
      return settings.pingMessageCount;
    case 'improve':
      return settings.improveMessageCount;
    case 'hi':
      // Fixed at one API page; deliberately not a user setting (research §1.1).
      return HI_GREETING_MESSAGE_COUNT;
    case 'quick':
      return settings.quickMessageCount;
  }
}

/** Sanitizer/XML result pipeline (runs only on the complete raw text — never on partials). */
export function buildFeatureResult(
  feature: OperationFeature,
  rawText: string,
  params: ParsedParams,
): FeatureResultPayload {
  const policy = getFeaturePolicy(feature);
  switch (policy.resultKind) {
    case 'reply': {
      // hi-greeting returns 3 standalone greeting alternatives split by
      // [VARIANT]; every other reply feature splits sequential parts by [NEXT].
      const parts =
        feature === 'hi-greeting'
          ? normalizeVariantReplyParts(rawText)
          : normalizeReplyParts(rawText);
      if (parts.length === 0) {
        throw new CgError('CG-API-06');
      }
      return { rawText, parts, splitModeRequested: params.mode === 'preferSplit' };
    }
    case 'single-reply': {
      const parts = normalizeSingleReplyPart(rawText);
      if (parts.length === 0) {
        throw new CgError('CG-API-06');
      }
      return { rawText, parts };
    }
    case 'xml': {
      if (rawText.trim() === '') {
        throw new CgError('CG-API-06');
      }
      // Invalid XML is NOT an error: the frame carries the parse with
      // valid:false and the renderer falls back to rawText.
      const xml = feature === 'chat-review' ? parseChatReviewXml(rawText) : parseHelpMeXml(rawText);
      return { rawText, xml };
    }
  }
}

// ─── Coordinator ──────────────────────────────────────────────────────────

export function createAiCoordinator(deps: AiCoordinatorDeps): AiCoordinator {
  const gateway = deps.gateway ?? createDirectGateway({ keychain: deps.keychain });
  const loader: ContextLoader = createContextLoader({ data: deps.data, client: deps.client });

  const listeners = new Set<(event: OperationEvent) => void>();
  const byConversation = new Map<string, OperationState>();
  const byId = new Map<string, OperationState>();
  let disposed = false;

  function emit(event: OperationEvent): void {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // A faulty subscriber must not break the operation pipeline.
      }
    }
  }

  function emitErrorFrame(
    operationId: string,
    error: UserFacingErrorPayload,
    profiler?: OperationProfiler,
  ): void {
    const profiling = profiler?.snapshot();
    emit({
      type: 'operation:error',
      operationId,
      error,
      ...(profiling !== undefined ? { profiling } : {}),
    });
  }

  function emitProgress(
    op: OperationState,
    phase: OperationPhase,
    extra: { currentPage?: number; targetPages?: number; message?: string } = {},
  ): void {
    if (op.settled) {
      return;
    }
    emit({
      type: 'operation:progress',
      operationId: op.operationId,
      feature: op.feature,
      phase,
      ...(extra.currentPage !== undefined ? { currentPage: extra.currentPage } : {}),
      ...(extra.targetPages !== undefined ? { targetPages: extra.targetPages } : {}),
      ...(extra.message !== undefined ? { message: extra.message } : {}),
    });
  }

  // ── chunk batching (50 ms relay buffer, legacy streaming behavior) ──────

  function flushChunks(op: OperationState): void {
    if (op.chunkTimer !== null) {
      clearTimeout(op.chunkTimer);
      op.chunkTimer = null;
    }
    if (op.chunkBuffer.length === 0) {
      return;
    }
    const text = op.chunkBuffer;
    op.chunkBuffer = '';
    emit({ type: 'operation:chunk', operationId: op.operationId, text });
  }

  function bufferChunk(op: OperationState, text: string): void {
    op.chunkBuffer += text;
    if (op.chunkTimer === null) {
      op.chunkTimer = setTimeout(() => {
        op.chunkTimer = null;
        if (!op.settled) {
          flushChunks(op);
        }
      }, STREAM_CHUNK_FLUSH_MS);
    }
  }

  // ── settle paths ─────────────────────────────────────────────────────────

  /** Marks terminal state and tears down timers/registry; returns false when already settled (stale event). */
  function beginSettle(op: OperationState): boolean {
    if (op.settled) {
      return false;
    }
    op.settled = true;
    op.timeouts.clearAll();
    if (byConversation.get(op.conversationKey) === op) {
      byConversation.delete(op.conversationKey);
    }
    byId.delete(op.operationId);
    return true;
  }

  function stopStream(op: OperationState): void {
    op.abort.abort();
    if (op.cancelStream !== null) {
      try {
        op.cancelStream();
      } catch {
        // cancellation is best-effort
      }
      op.cancelStream = null;
    }
  }

  function settleComplete(op: OperationState, rawText: string): void {
    if (!beginSettle(op)) {
      return;
    }
    flushChunks(op);
    op.streamStage?.complete();

    let result: FeatureResultPayload;
    try {
      result = buildFeatureResult(op.feature, rawText, op.params);
    } catch (error) {
      op.profiler.failActive('unusable output');
      emitErrorFrame(op.operationId, toWireError(toUserFacing(error)), op.profiler);
      return;
    }

    if (op.feature === 'fan-summary') {
      const generatedAt = Date.now();
      result['summaryMeta'] = { generatedAt, cached: false };
      persistFanSummary(op, rawText, generatedAt);
      pushFanSummary(op, rawText, generatedAt);
    }

    const spend = op.usage !== null ? trySpendSummary(op.modelId, op.usage) : undefined;
    recordUsageEvent(op, spend);

    const profiling = op.profiler.snapshot();
    emit({
      type: 'operation:complete',
      operationId: op.operationId,
      feature: op.feature,
      result,
      ...(spend !== undefined ? { llmSpend: { ...spend } } : {}),
      ...(profiling !== undefined ? { profiling } : {}),
    });
  }

  /**
   * SPEC §8.5 cache write (fan-summary only; chat-review is NEVER cached).
   * Skipped when either context verification flag is false — the next Scan
   * regenerates instead of trusting a summary built on degraded data.
   */
  function persistFanSummary(op: OperationState, rawText: string, generatedAt: number): void {
    const seed = op.summarySeed;
    if (seed === null || !seed.spendingVerified || !seed.subscriptionVerified) {
      return;
    }
    const entry: SummaryCacheEntry = {
      body: rawText,
      personalityId: seed.personalityId,
      personalityUpdatedAt: seed.personalityUpdatedAt,
      generatedAt,
      spendingVerified: true,
      subscriptionVerified: true,
      modelId: op.modelId,
    };
    try {
      // summaries.put publishes the 'summaries' bus event → fan panel refresh.
      deps.data.summaries.put(op.accountId, op.chatId, entry);
    } catch {
      // Cache bookkeeping must never fail a completed operation.
    }
  }

  /** Fire-and-forget hub push (no-op until the P4 hub module attaches the hook). */
  function pushFanSummary(op: OperationState, rawText: string, generatedAt: number): void {
    const push = deps.summaryHub?.pushSummary;
    if (push === undefined) {
      return;
    }
    try {
      void push({
        accountId: op.accountId,
        fanId: op.chatId,
        body: rawText,
        generatedAt,
      }).catch(() => {
        // Push failures never surface into the completed operation.
      });
    } catch {
      // Same guarantee for a synchronously-throwing hook.
    }
  }

  /** Cache/prefetch hit: terminal complete frame with zero LLM spend (legacy isCacheHit usage event). */
  function settleCachedSummary(op: OperationState, entry: SummaryCacheEntry): void {
    if (!beginSettle(op)) {
      return;
    }
    recordUsageEvent(op, undefined, { isCacheHit: true });
    const profiling = op.profiler.snapshot();
    emit({
      type: 'operation:complete',
      operationId: op.operationId,
      feature: op.feature,
      result: {
        rawText: entry.body,
        summaryMeta: { generatedAt: entry.generatedAt, cached: true },
      },
      ...(profiling !== undefined ? { profiling } : {}),
    });
  }

  function settleError(op: OperationState, error: unknown): void {
    if (!beginSettle(op)) {
      return;
    }
    if (op.chunkTimer !== null) {
      clearTimeout(op.chunkTimer);
      op.chunkTimer = null;
    }
    op.chunkBuffer = '';
    stopStream(op);
    op.profiler.failActive(error instanceof Error ? error.message : undefined);
    emitErrorFrame(op.operationId, toWireError(toUserFacing(error)), op.profiler);
  }

  function discard(op: OperationState, reason: OperationDiscardReason): void {
    if (!beginSettle(op)) {
      return;
    }
    if (op.chunkTimer !== null) {
      clearTimeout(op.chunkTimer);
      op.chunkTimer = null;
    }
    op.chunkBuffer = '';
    stopStream(op);
    op.profiler.failActive(`discarded: ${reason}`);
    const profiling = op.profiler.snapshot();
    emit({
      type: 'operation:discarded',
      operationId: op.operationId,
      reason,
      ...(profiling !== undefined ? { profiling } : {}),
    });
  }

  function trySpendSummary(
    modelId: string,
    usage: LlmUsageMetrics,
  ): ReturnType<typeof buildLlmSpendSummary> | undefined {
    try {
      return buildLlmSpendSummary(modelId, usage);
    } catch {
      return undefined; // unknown model pricing — spend stays absent, never fatal
    }
  }

  /**
   * usage_events row, pending the P4 hub flush (dedupe key = clientEventId =
   * operationId) — PLUS the durable ai_spend_log daily counters the Activity
   * panel aggregates (usage_events drains once the hub is configured).
   */
  function recordUsageEvent(
    op: OperationState,
    spend: { totalTokens: number; totalUsd: number } | undefined,
    flags: { isCacheHit?: boolean } = {},
  ): void {
    const usage = op.usage;
    const payload: UsageEventRecord = {
      clientEventId: op.operationId,
      // Feature ids are wire-stable ('fan-summary', never 'scan' — SPEC §8.6).
      feature: op.feature,
      model: op.modelId,
      inputTokens: usage?.input_tokens ?? 0,
      cacheCreationInputTokens: usage?.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: usage?.cache_read_input_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0,
      totalTokens: spend?.totalTokens ?? 0,
      chatId: op.chatId,
      durationMs: Math.max(0, Date.now() - op.startedAtMs),
      isCacheHit: flags.isCacheHit === true,
      isRegeneration: op.params.forceRegenerate === true,
      completedAt: new Date().toISOString(),
    };
    try {
      deps.data.db
        .prepare(
          'INSERT INTO usage_events (client_event_id, payload, created_at, attempts) ' +
            'VALUES (@client_event_id, @payload, @created_at, 0) ' +
            'ON CONFLICT (client_event_id) DO NOTHING',
        )
        .run({
          client_event_id: op.operationId,
          payload: JSON.stringify(payload),
          created_at: payload.completedAt,
        });
    } catch {
      // Usage bookkeeping must never fail a completed operation.
    }
    try {
      deps.data.aiSpendLog.recordRun({
        day: payload.completedAt.slice(0, 10),
        feature: payload.feature,
        isCacheHit: payload.isCacheHit,
        inputTokens: payload.inputTokens,
        cacheWriteTokens: payload.cacheCreationInputTokens,
        cacheReadTokens: payload.cacheReadInputTokens,
        outputTokens: payload.outputTokens,
        costMicroUsd: Math.round((spend?.totalUsd ?? 0) * 1_000_000),
        chatId: payload.chatId,
      });
    } catch {
      // Ledger bookkeeping must never fail a completed operation.
    }
    try {
      deps.onUsageEvent?.(payload);
    } catch {
      // Same guarantee for a throwing hook.
    }
  }

  // ── personality / model / key gates ──────────────────────────────────────

  function resolvePersonality(settings: SettingsVM, accountId: string): Personality {
    const stored = deps.data.settings.getParsed(PERSONALITIES_SETTINGS_KEY, personalityListSchema);
    const list: Personality[] =
      stored === undefined
        ? createBundledPersonalities()
        : stored.map((entry) => ({
            id: entry.id,
            name: entry.name,
            content: entry.content,
            updatedAt: entry.updatedAt,
            ...(entry.builtin !== undefined ? { builtin: entry.builtin } : {}),
            ...(entry.builtinVersion !== undefined
              ? { builtinVersion: entry.builtinVersion }
              : {}),
          }));
    if (list.length === 0) {
      throw new CgError('CG-FLOW-01');
    }
    const mappedId = settings.accountMappings[accountId];
    if (mappedId === undefined || mappedId === '') {
      throw new CgError('CG-FLOW-02');
    }
    const personality = list.find((entry) => entry.id === mappedId);
    if (personality === undefined) {
      throw new CgError('CG-FLOW-02');
    }
    return personality;
  }

  async function checkProviderKey(modelId: string): Promise<void> {
    const entry = getModelEntry(modelId);
    if (entry === null) {
      throw new CgError('CG-API-03');
    }
    const secretName: SecretName =
      entry.provider === 'anthropic' ? 'anthropicKey' : 'openRouterKey';
    const hasKey = await deps.keychain.hasSecret(secretName);
    if (!hasKey) {
      throw new CgError('CG-AUTH-01', { detail: { provider: entry.provider } });
    }
  }

  /** Best-effort hub prefetch — any hook failure means "no hub profile". */
  async function tryPrefetchSummary(
    op: OperationState,
  ): Promise<{ body: string; generatedAt: number } | null> {
    const prefetch = deps.summaryHub?.prefetchSummary;
    if (prefetch === undefined) {
      return null;
    }
    try {
      return await prefetch({ accountId: op.accountId, fanId: op.chatId });
    } catch {
      return null;
    }
  }

  // ── pipeline ─────────────────────────────────────────────────────────────

  async function runPipeline(op: OperationState): Promise<void> {
    const settings = await deps.settingsStore.get();
    if (op.settled) {
      return;
    }
    if (settings.debugMode) {
      op.profiler = createOperationProfiler();
    }

    const identityStage = op.profiler.stage('resolve-identity');
    const personality = resolvePersonality(settings, op.accountId);
    const policy = getFeaturePolicy(op.feature);
    const modelFeature = resolveFeatureModelFeature(op.feature);
    const modelId = settings.featureModels[modelFeature] ?? DEFAULT_FEATURE_MODELS[modelFeature];
    const reasoningEffort =
      settings.featureReasoning[modelFeature] ?? DEFAULT_FEATURE_REASONING[modelFeature];
    op.modelId = modelId;
    await checkProviderKey(modelId);
    if (op.settled) {
      return;
    }
    identityStage.complete();

    if (policy.requiresDraft && (op.params.draftText ?? '').trim() === '') {
      throw new CgError('CG-APP-01', { message: 'Draft text is required for this feature' });
    }

    // fan-summary consults the cache BEFORE any context loading (legacy order:
    // a valid cached summary short-circuits even a too-short conversation).
    if (op.feature === 'fan-summary') {
      const cacheStage = op.profiler.stage('summary-cache-check');
      if (op.params.forceRegenerate === true) {
        // Refresh = delete + regenerate (SPEC §8.5).
        deps.data.summaries.remove(op.accountId, op.chatId);
      } else {
        const entry = deps.data.summaries.get(op.accountId, op.chatId);
        if (isValidSummaryCacheEntry(entry, personality.id, personality.updatedAt, modelId)) {
          cacheStage.complete('cache hit');
          settleCachedSummary(op, entry);
          return;
        }
        const prefetched = await tryPrefetchSummary(op);
        if (op.settled) {
          return;
        }
        if (prefetched !== null) {
          const entry: SummaryCacheEntry = {
            body: prefetched.body,
            personalityId: personality.id,
            personalityUpdatedAt: personality.updatedAt,
            generatedAt: prefetched.generatedAt,
            // A hub-adopted profile counts as verified (legacy prefetch rule).
            spendingVerified: true,
            subscriptionVerified: true,
            modelId,
          };
          deps.data.summaries.put(op.accountId, op.chatId, entry);
          cacheStage.complete('hub hit');
          settleCachedSummary(op, entry);
          return;
        }
      }
      cacheStage.complete(op.params.forceRegenerate === true ? 'forced refresh' : 'cache miss');
      op.summarySeed = {
        personalityId: personality.id,
        personalityUpdatedAt: personality.updatedAt,
        spendingVerified: false,
        subscriptionVerified: false,
      };
    }

    // Context: transcript (db, fetch-through when short; deep = gap-only)…
    const deep = isDeepFeature(op.feature);
    emitProgress(op, 'loading-messages');
    const loadStage = op.profiler.stage('load-messages');
    const transcriptMessages = await loader.loadTranscript({
      accountId: op.accountId,
      chatId: op.chatId,
      count: resolveMessageCount(op.feature, settings),
      deep,
      signal: op.abort.signal,
      // Auto-read OFF ⇒ AI works from cached transcript only (never marks a fan read).
      allowFetchThrough: settings.autoReadChats,
      onPage: (currentPage, targetPages) =>
        emitProgress(op, 'loading-messages', {
          currentPage,
          targetPages,
          // Deep loads surface page progress in the panel (legacy wording).
          ...(deep ? { message: `Loading messages… ${currentPage}/${targetPages} pages` } : {}),
        }),
    });
    if (op.settled) {
      return;
    }
    loadStage.complete(`${transcriptMessages.length} messages`);

    if (policy.minMessages > 0 && transcriptMessages.length < policy.minMessages) {
      throw new CgError('CG-FLOW-03');
    }
    if (op.feature === 'hi-greeting' && transcriptMessages.length > HI_GREETING_MAX_TRANSCRIPT) {
      throw new CgError('CG-FLOW-09');
    }

    let pingSegment: PingSegment | undefined;
    if (policy.usesPingSegment) {
      const pingStage = op.profiler.stage('ping-analysis');
      const analysis = analyzePingSegment(transcriptMessages, Date.now());
      if (analysis.segment === 'active') {
        pingStage.complete('active — blocked');
        throw new CgError('CG-FLOW-05');
      }
      pingSegment = analysis.segment;
      pingStage.complete(analysis.segment);
    }

    const transcript = formatTranscript(transcriptMessages);
    const transcriptPreview =
      transcript.length > 2000 ? `${transcript.slice(0, 2000)}\n...` : transcript;
    const fanDisplayName = loader.resolveFanDisplayName(op.accountId, op.chatId);

    let fanBio: string | undefined;
    if (op.feature === 'hi-greeting') {
      const bioStage = op.profiler.stage('account-name-lookup');
      fanBio = await loader.loadFanBio({
        accountId: op.accountId,
        chatId: op.chatId,
        signal: op.abort.signal,
      });
      if (op.settled) {
        return;
      }
      bioStage.complete(fanBio !== undefined ? 'bio found' : 'no bio');
    }

    // …then spending/subscription blocks (optional stages — loader degrades).
    let fanSpendingData = '';
    let fanSubscriptionData = '';
    if (policy.includesEarnings) {
      emitProgress(op, 'loading-earnings');
      const earningsStage = op.profiler.stage('earnings');
      const spending = await loader.loadSpendingBlock({
        accountId: op.accountId,
        chatId: op.chatId,
        deep,
        signal: op.abort.signal,
      });
      if (op.settled) {
        return;
      }
      fanSpendingData = spending.block;
      earningsStage.complete(spending.verified ? 'verified' : 'unverified');
      const subscriptionStage = op.profiler.stage('subscription-lookup');
      const subscription = await loader.loadSubscriptionBlock({
        accountId: op.accountId,
        chatId: op.chatId,
        deep,
        signal: op.abort.signal,
      });
      if (op.settled) {
        return;
      }
      fanSubscriptionData = subscription.block;
      subscriptionStage.complete(subscription.verified ? 'verified' : 'unverified');
      if (op.summarySeed !== null) {
        op.summarySeed.spendingVerified = spending.verified;
        op.summarySeed.subscriptionVerified = subscription.verified;
      }
    }

    emitProgress(op, 'generating');
    const promptStage = op.profiler.stage('prompt-build');
    const replyTone = policy.supportsReplyTone
      ? (op.params.tone ?? settings.defaultReplyTone)
      : undefined;
    const replyMode = policy.supportsReplyMode ? op.params.mode : undefined;
    const prompt = buildPrompt({
      feature: op.feature,
      personality,
      transcript,
      fanSpendingData,
      fanSubscriptionData,
      fanDisplayName,
      fanBio,
      draftText: op.params.draftText,
      pingSegment,
      replyMode,
      replyTone,
    });
    let systemBlocks: PromptBlock[] = prompt.systemBlocks;
    let userBlocks: PromptBlock[] = prompt.userBlocks;
    if (!settings.promptCachingEnabled) {
      systemBlocks = stripPromptCache(systemBlocks);
      userBlocks = stripPromptCache(userBlocks);
    }
    promptStage.complete();

    if (settings.debugMode) {
      // Prompt inspector (SPEC §12): the exact blocks + cache flags, pre-call.
      emit({
        type: 'operation:debugPrompt',
        operationId: op.operationId,
        feature: op.feature,
        snapshot: {
          modelId,
          reasoningEffort,
          promptCachingEnabled: settings.promptCachingEnabled,
          transcript: {
            messageCount: transcriptMessages.length,
            charCount: transcript.length,
            preview: transcriptPreview,
          },
          systemBlocks,
          userBlocks,
        },
      });
    }
    if (op.settled) {
      return;
    }

    op.timeouts.llmRequestStarted();
    op.ttfbStage = op.profiler.stage('llm-ttfb');
    op.cancelStream = gateway.stream(
      { feature: op.feature, modelId, systemBlocks, userBlocks, reasoningEffort },
      {
        onProgress: () => {
          if (!op.settled) {
            op.timeouts.providerActivity();
          }
        },
        onReasoningObserved: () => {
          if (!op.settled) {
            op.timeouts.providerActivity();
          }
        },
        onText: (text) => {
          if (op.settled) {
            return;
          }
          if (!op.sawFirstChunk) {
            op.sawFirstChunk = true;
            op.ttfbStage?.complete();
            op.ttfbStage = null;
            op.streamStage = op.profiler.stage('llm-stream');
            op.timeouts.firstChunk();
          } else {
            op.timeouts.chunk();
          }
          bufferChunk(op, text);
        },
        onUsage: (usage) => {
          if (!op.settled) {
            op.usage = usage;
          }
        },
        onError: (error) => {
          settleError(op, error);
        },
        onComplete: (rawText) => {
          settleComplete(op, rawText);
        },
      },
    );
  }

  // ── public surface ───────────────────────────────────────────────────────

  return {
    start(req) {
      if (disposed) {
        return;
      }
      const parsed = aiStartRequestSchema.safeParse(req);
      if (!parsed.success) {
        const idOnly = operationIdOnlySchema.safeParse(req);
        if (idOnly.success) {
          emitErrorFrame(idOnly.data.operationId, toWireError(toUserFacing(new CgError('CG-APP-01'))));
        }
        return;
      }
      const { operationId, feature, accountId, chatId, params } = parsed.data;

      if (byId.has(operationId)) {
        return; // duplicate start frame — already running
      }
      // Narrows feature to OperationFeature for the rest of the pipeline.
      if (feature === 'compare') {
        emitErrorFrame(operationId, compareDeferredError(feature));
        return;
      }

      const conversationKey = conversationKeyOf(accountId, chatId);
      if (byConversation.has(conversationKey)) {
        emitErrorFrame(operationId, toWireError(toUserFacing(new CgError('CG-FLOW-04'))));
        return;
      }

      const op: OperationState = {
        operationId,
        feature,
        accountId,
        chatId,
        conversationKey,
        params,
        abort: new AbortController(),
        cancelStream: null,
        timeouts: createStagedTimeouts({
          bucket: getFeaturePolicy(feature).timeoutBucket,
          onTimeout: (key) =>
            settleError(op, new CgError('CG-NET-02', { detail: { providerMessage: key } })),
        }),
        profiler: NO_OP_PROFILER,
        ttfbStage: null,
        streamStage: null,
        settled: false,
        modelId: DEFAULT_FEATURE_MODELS[resolveFeatureModelFeature(feature)],
        usage: null,
        sawFirstChunk: false,
        chunkBuffer: '',
        chunkTimer: null,
        startedAtMs: Date.now(),
        summarySeed: null,
      };

      // Synchronous reservation BEFORE the first await (legacy TOCTOU guard).
      byConversation.set(conversationKey, op);
      byId.set(operationId, op);
      op.timeouts.start();

      runPipeline(op).catch((error: unknown) => {
        if (!op.settled) {
          settleError(op, error);
        }
      });
    },

    cancel(operationId) {
      const op = byId.get(operationId);
      if (op !== undefined) {
        discard(op, 'cancelled');
      }
    },

    conversationOpened(accountId, chatId) {
      // Route change semantics (legacy tab:routeChanged): anything in flight
      // for a different conversation is discarded — its result would land in
      // the wrong UI context.
      for (const op of [...byId.values()]) {
        if (op.accountId !== accountId || op.chatId !== chatId) {
          discard(op, 'chat_changed');
        }
      }
    },

    conversationClosed(accountId, chatId) {
      const op = byConversation.get(conversationKeyOf(accountId, chatId));
      if (op !== undefined) {
        discard(op, 'chat_changed');
      }
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    dispose() {
      disposed = true;
      for (const op of [...byId.values()]) {
        discard(op, 'cancelled');
      }
      listeners.clear();
    },
  };
}
