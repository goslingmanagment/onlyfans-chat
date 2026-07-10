// AI operation coordinator — behavioral port of the legacy lifecycle (SPEC §8.3,
// research §8): one operation per conversation with synchronous reservation
// (CG-FLOW-04 on concurrent start), operationId correlation with stale-event
// discard, navigation-independent operation lifecycle, staged timeouts, 50 ms
// chunk batching, sanitizer/XML result pipeline, CG-coded errors, debug profiling.
//
// P4 scope: all seven operation features (quick fast-reply / improve-draft /
// help-me plus deep fan-summary / chat-review and gated ping / hi-greeting).
// 'compare' stays gated off until its orchestration lands (PLAN allows the
// deferral). LLM auto-retry (429 Retry-After ≤ 60 s, 503 + 5 s) lives INSIDE
// the providers (runWithLegacyRetry, pre-first-chunk only) — the coordinator
// must not add a second retry layer on top.

import { z } from 'zod';
import { STREAM_CHUNK_FLUSH_MS } from '@chatgoose/shared/constants';
import { getFeaturePolicy } from '@chatgoose/shared/features';
import type { OperationFeature } from '@chatgoose/shared/features';
import { CgError, toUserFacing } from '@chatgoose/shared/errors/index';
import type { UserFacingError } from '@chatgoose/shared/errors/index';
import type { LlmUsageMetrics } from '@chatgoose/shared/usage-metrics';
import {
  normalizeReplyParts,
  normalizeSingleReplyPart,
  normalizeVariantReplyParts,
} from '@chatgoose/shared/output/reply-output';
import { parseChatReviewXml, parseHelpMeXml } from '@chatgoose/shared/output/xml';
import { isValidSummaryCacheEntry } from '@chatgoose/shared/summary/validity';
import type { SummaryCacheEntry } from '@chatgoose/shared/summary/validity';
import type { FeatureType, ReplyMode, ReplyTone } from '@chatgoose/shared/types';
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
import type { SettingsStore } from '../settings/store';
import type { AiFeatureGateway, CancelFn } from './gateway';
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
 * Legacy usage_events payload shape (drain era). Stage 31: the coordinator no
 * longer writes these — the type survives so the hub module can keep mapping
 * and flushing rows PARKED by pre-cutover releases (one-release drain; the
 * diagnostics export counts what is left). Field names follow the LLM usage
 * metrics (cacheCreationInputTokens…), not core's wire contract; the hub
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
  settingsStore: SettingsStore;
  /** Stage 31: the kernel feature-service lane — the ONLY generation lane. */
  featureGateway?: AiFeatureGateway;
  summaryHub?: SummaryHubHooks;
  /**
   * P4 hub wiring seam (SPEC §8.6): fired after the usage_events row is
   * written so fresh events reach the hub usage reporter immediately. The
   * table write stays the persistence — this hook is delivery only.
   */
  /** Stage 31: acceptance lifecycle delivery ('shown' fires here; the IPC
   * layer emits copied/inserted/sent through the same reporter). */
  onAcceptanceEvent?: (event: {
    operationId: string;
    requestId: string | null;
    feature: string;
    action: 'shown';
    accountId: string;
    conversationId: string;
    at: string;
  }) => void;
}

export interface CompletedOperationContext {
  operationId: string;
  requestId: string | null;
  feature: OperationFeature;
  accountId: string;
  chatId: string;
  /** Sanitized result parts (reply features) — the sent/edited comparison
   * and feedback correlation read these; empty for analysis features. */
  parts: string[];
  /** C5 dedup: has an ai.feedback insert/copy already counted against the
   * durable ai_spend_log for this operation? Kernel-lane ops write no
   * usage_events row, so this mirrors that row's `accepted` flag — set once
   * by markOperationAccepted, on this registry entry instead. */
  accepted: boolean;
}

export interface AiCoordinator {
  start(req: AiStartRequest): void;
  cancel(operationId: string): void;
  /** Stage 31: bounded registry of recently completed operations — the
   * acceptance IPC path correlates feedback/sends after ops settle. */
  getOperationContext(operationId: string): CompletedOperationContext | null;
  /** C5: marks the registry entry accepted (ai_spend_log insert-counter
   * dedup for kernel-lane ops, which write no usage_events row). Returns
   * true the first time for this operation (caller should count it), false
   * once already marked. An operation absent from the registry (evicted —
   * cap-50 — or never completed) has nothing to dedup against, so this
   * returns true every time; callers accept that as the registry's known
   * in-memory-only limit. */
  markOperationAccepted(operationId: string): boolean;
  conversationOpened(accountId: string, chatId: string): void;
  conversationClosed(accountId: string, chatId: string): void;
  subscribe(listener: (event: OperationEvent) => void): () => void;
  dispose(): void;
}

// ─── Trust-boundary schema (IPC args may be anything at runtime) ─────────

/** Stage 31: summary-cache key sentinels — persona content and model live
 * kernel-side; a persona edit no longer invalidates the local summary cache
 * (refresh regenerates; recorded trade). */
const KERNEL_MODEL_ID = 'kernel';
const KERNEL_PERSONA_UPDATED_AT = 0;

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
  usage: LlmUsageMetrics | null;
  sawFirstChunk: boolean;
  chunkBuffer: string;
  chunkTimer: ReturnType<typeof setTimeout> | null;
  startedAtMs: number;
  /** Gateway generation ref (meta frame requestId). */
  generationRef: string | null;
  /** Remaining daily gateway requests from the meta quota frame (#120). */
  quotaRemainingRequests: number | null;
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

  // Stage 31: bounded registry of completed operations (acceptance
  // correlation after settle). Insertion-ordered Map, oldest evicted.
  const completedOps = new Map<string, CompletedOperationContext>();
  const COMPLETED_OPS_CAP = 50;

  function rememberCompleted(op: OperationState, result: FeatureResultPayload): void {
    const parts = Array.isArray((result as { parts?: unknown }).parts)
      ? ((result as { parts: unknown[] }).parts.filter(
          (part): part is string => typeof part === 'string',
        ))
      : [];
    completedOps.set(op.operationId, {
      operationId: op.operationId,
      requestId: op.generationRef,
      feature: op.feature,
      accountId: op.accountId,
      chatId: op.chatId,
      parts,
      accepted: false,
    });
    while (completedOps.size > COMPLETED_OPS_CAP) {
      const oldest = completedOps.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      completedOps.delete(oldest);
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

    const spend = op.usage !== null ? trySpendSummary(op.usage) : undefined;
    recordUsageEvent(op, spend);
    rememberCompleted(op, result);

    const profiling = op.profiler.snapshot();
    emit({
      type: 'operation:complete',
      operationId: op.operationId,
      feature: op.feature,
      result,
      ...(spend !== undefined ? { llmSpend: { ...spend } } : {}),
      ...(profiling !== undefined ? { profiling } : {}),
      ...(op.quotaRemainingRequests !== null ? { quotaRemainingRequests: op.quotaRemainingRequests } : {}),
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
      modelId: KERNEL_MODEL_ID,
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

  /** Stage 31: spend comes from the gateway usage frame (cost_micro_usd) —
   * the local price tables died with llm/. Absent cost = absent spend. */
  function trySpendSummary(usage: LlmUsageMetrics) {
    if (typeof usage.cost_micro_usd !== 'number') {
      return undefined;
    }
    const totalUsd = usage.cost_micro_usd / 1_000_000;
    return {
      totalTokens:
        usage.input_tokens + usage.cache_creation_input_tokens +
        usage.cache_read_input_tokens + usage.output_tokens,
      inputTokens: usage.input_tokens,
      cacheWriteTokens: usage.cache_creation_input_tokens,
      cacheReadTokens: usage.cache_read_input_tokens,
      outputTokens: usage.output_tokens,
      totalUsd,
      uncachedUsd: totalUsd,
      cacheEffectUsd: 0,
      cacheEffectKind: 'neutral' as const,
      cacheWriteUsd: 0,
      cacheReadUsd: 0,
      approximate: true,
    };
  }

  /** Stage 31: the gateway ledger is authoritative — no local usage_events
   * row, no client-reported delivery. ai_spend_log keeps feeding the local
   * Activity panel from the gateway-reported cost. */
  function recordUsageEvent(
    op: OperationState,
    spend: { totalTokens: number; totalUsd: number } | undefined,
    flags: { isCacheHit?: boolean } = {},
  ): void {
    const usage = op.usage;
    const completedAt = new Date().toISOString();
    try {
      deps.data.aiSpendLog.recordRun({
        day: completedAt.slice(0, 10),
        // Feature ids are wire-stable ('fan-summary', never 'scan' — SPEC §8.6).
        feature: op.feature,
        isCacheHit: flags.isCacheHit === true,
        inputTokens: usage?.input_tokens ?? 0,
        cacheWriteTokens: usage?.cache_creation_input_tokens ?? 0,
        cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
        outputTokens: usage?.output_tokens ?? 0,
        costMicroUsd: Math.round((spend?.totalUsd ?? 0) * 1_000_000),
        chatId: op.chatId,
      });
    } catch {
      // Ledger bookkeeping must never fail a completed operation.
    }
  }

  // ── personality / model / key gates ──────────────────────────────────────

  /** Stage 31: the desktop resolves only the persona MAPPING — persona
   * content is kernel config. CG-FLOW-02 when the account has no mapping. */
  function resolvePersonaKey(settings: SettingsVM, accountId: string): string {
    const mappedId = settings.accountMappings[accountId];
    if (mappedId === undefined || mappedId === '') {
      throw new CgError('CG-FLOW-02');
    }
    return mappedId;
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
    // Stage 31: model choice, provider keys, prompts, and context are kernel
    // config — the desktop resolves only the persona MAPPING for this
    // account (CG-FLOW-02 when unmapped; the key rides the feature call).
    const personaKey = resolvePersonaKey(settings, op.accountId);
    const policy = getFeaturePolicy(op.feature);
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
        if (isValidSummaryCacheEntry(entry, personaKey, KERNEL_PERSONA_UPDATED_AT, KERNEL_MODEL_ID)) {
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
            personalityId: personaKey,
            personalityUpdatedAt: KERNEL_PERSONA_UPDATED_AT,
            generatedAt: prefetched.generatedAt,
            // A hub-adopted profile counts as verified (legacy prefetch rule).
            spendingVerified: true,
            subscriptionVerified: true,
            modelId: KERNEL_MODEL_ID,
          };
          deps.data.summaries.put(op.accountId, op.chatId, entry);
          cacheStage.complete('hub hit');
          settleCachedSummary(op, entry);
          return;
        }
      }
      cacheStage.complete(op.params.forceRegenerate === true ? 'forced refresh' : 'cache miss');
      // Kernel context is ledger-backed (Stage 30) — verified by definition;
      // the legacy degraded-context guard belonged to the local loaders.
      op.summarySeed = {
        personalityId: personaKey,
        personalityUpdatedAt: KERNEL_PERSONA_UPDATED_AT,
        spendingVerified: true,
        subscriptionVerified: true,
      };
    }

    // ── Stage 31: the kernel loads context and assembles the parity-signed
    // prompt — the desktop sends refs and streams. The migrated product
    // gates (CG-FLOW-03/05/09, draft) are enforced kernel-side and mapped
    // back to their CG codes by the adapter. The fan-summary cache above
    // still short-circuits before any kernel call.
    const featureGateway = deps.featureGateway;
    if (featureGateway === undefined) {
      throw new CgError('CG-HUB-02', { message: 'AI feature lane is not wired' });
    }
    emitProgress(op, 'generating');
    op.timeouts.llmRequestStarted();
    op.ttfbStage = op.profiler.stage('llm-ttfb');
    op.cancelStream = featureGateway.stream(
      {
        feature: op.feature,
        clientRequestId: op.operationId,
        accountId: op.accountId,
        chatId: op.chatId,
        tone: policy.supportsReplyTone ? (op.params.tone ?? settings.defaultReplyTone) : undefined,
        mode: policy.supportsReplyMode ? op.params.mode : undefined,
        draftText: op.params.draftText,
        personaKey,
        isRegeneration: op.params.forceRegenerate === true,
      },
      streamCallbacks(op),
    );
  }

  /** Shared stream lifecycle plumbing — identical for every lane. */
  function streamCallbacks(op: OperationState) {
    return {
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
      onGenerationRef: (requestId: string) => {
        if (!op.settled) {
          op.generationRef = requestId;
        }
      },
      onQuotaRemaining: (remainingRequests: number) => {
        if (!op.settled) {
          op.quotaRemainingRequests = remainingRequests;
        }
      },
      onText: (text: string) => {
        if (op.settled) {
          return;
        }
        if (!op.sawFirstChunk) {
          op.sawFirstChunk = true;
          op.ttfbStage?.complete();
          op.ttfbStage = null;
          op.streamStage = op.profiler.stage('llm-stream');
          op.timeouts.firstChunk();
          // Stage 31 acceptance: first token rendered = 'shown'.
          try {
            deps.onAcceptanceEvent?.({
              operationId: op.operationId,
              requestId: op.generationRef,
              feature: op.feature,
              action: 'shown',
              accountId: op.accountId,
              conversationId: op.chatId,
              at: new Date().toISOString(),
            });
          } catch {
            // Telemetry must never break a stream.
          }
        } else {
          op.timeouts.chunk();
        }
        bufferChunk(op, text);
      },
      onUsage: (usage: LlmUsageMetrics) => {
        if (!op.settled) {
          op.usage = usage;
        }
      },
      onError: (error: unknown) => {
        settleError(op, error);
      },
      onComplete: (rawText: string) => {
        settleComplete(op, rawText);
      },
    };
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
        usage: null,
        sawFirstChunk: false,
        chunkBuffer: '',
        chunkTimer: null,
        startedAtMs: Date.now(),
        generationRef: null,
        quotaRemainingRequests: null,
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

    getOperationContext(operationId) {
      return completedOps.get(operationId) ?? null;
    },

    markOperationAccepted(operationId) {
      const context = completedOps.get(operationId);
      if (context === undefined) {
        // Evicted (cap-50) or never completed — no entry to dedup against;
        // count this call (best effort, matching the registry's documented
        // in-memory-only limit).
        return true;
      }
      if (context.accepted) {
        return false;
      }
      context.accepted = true;
      return true;
    },

    conversationOpened(_accountId, _chatId) {
      // Navigation no longer owns AI lifecycle. The renderer routes frames by
      // operationId to a per-conversation job, so background generations keep
      // running while the chatter moves through other fans.
    },

    conversationClosed(_accountId, _chatId) {
      // Closing a view is not cancellation; only explicit ai:cancel/dispose
      // should discard an operation.
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
