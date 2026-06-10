// Per-operation LLM cost estimation and spend formatting, ported from legacy
// (llm-cost + spend-format). Pricing comes from the model registry.

import { getModelDisplayName, getModelEntry } from './model-registry';
import type { ModelPricing } from './model-registry';
import type { LlmUsageMetrics } from './sse';

export interface LlmCostEstimate {
  modelId: string;
  inputUsd: number;
  cacheWrite5mUsd: number;
  cacheWrite1hUsd: number;
  cacheReadUsd: number;
  outputUsd: number;
  totalUsd: number;
  approximate: boolean;
}

export type CacheEffectKind = 'saved' | 'overhead' | 'neutral';

export interface LlmSpendSummary {
  totalTokens: number;
  inputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  totalUsd: number;
  uncachedUsd: number;
  cacheEffectUsd: number;
  cacheEffectKind: CacheEffectKind;
  cacheWriteUsd: number;
  cacheReadUsd: number;
  approximate: boolean;
}

const USD_PRECISION = 1_000_000;
const TOKENS_PER_MILLION = 1_000_000;

function roundUsd(value: number): number {
  return Math.round((value + Number.EPSILON) * USD_PRECISION) / USD_PRECISION;
}

function priceTokens(tokens: number, usdPerMillion: number): number {
  return roundUsd((Math.max(0, tokens) * usdPerMillion) / TOKENS_PER_MILLION);
}

function resolvePricing(modelId: string): {
  normalizedModelId: string;
  pricing: ModelPricing;
  approximate: boolean;
} {
  const entry = getModelEntry(modelId);
  if (!entry) {
    throw new Error(`Unsupported model for cost estimation: ${modelId}`);
  }
  return {
    normalizedModelId: entry.id,
    pricing: entry.pricing,
    approximate: Boolean(entry.costApproximate),
  };
}

// Without a 5m/1h breakdown, cache writes are priced at the 5m rate and the
// estimate is flagged approximate; a breakdown that disagrees with the total
// is reconciled toward the reported total.
function resolveCacheWriteTokens(usage: LlmUsageMetrics): {
  cacheWrite5mTokens: number;
  cacheWrite1hTokens: number;
  approximate: boolean;
} {
  const totalCacheWriteTokens = Math.max(0, usage.cache_creation_input_tokens);
  const cacheCreation = usage.cache_creation;
  if (!cacheCreation) {
    return {
      cacheWrite5mTokens: totalCacheWriteTokens,
      cacheWrite1hTokens: 0,
      approximate: totalCacheWriteTokens > 0,
    };
  }

  const raw5mTokens = Math.max(0, cacheCreation.ephemeral_5m_input_tokens ?? 0);
  const raw1hTokens = Math.max(0, cacheCreation.ephemeral_1h_input_tokens ?? 0);
  const accountedTokens = raw5mTokens + raw1hTokens;

  if (accountedTokens === totalCacheWriteTokens) {
    return {
      cacheWrite5mTokens: raw5mTokens,
      cacheWrite1hTokens: raw1hTokens,
      approximate: false,
    };
  }

  if (accountedTokens < totalCacheWriteTokens) {
    return {
      cacheWrite5mTokens: raw5mTokens + (totalCacheWriteTokens - accountedTokens),
      cacheWrite1hTokens: raw1hTokens,
      approximate: true,
    };
  }

  const cacheWrite1hTokens = Math.min(raw1hTokens, totalCacheWriteTokens);
  return {
    cacheWrite5mTokens: Math.max(0, totalCacheWriteTokens - cacheWrite1hTokens),
    cacheWrite1hTokens,
    approximate: true,
  };
}

export function estimateLlmCost(modelId: string, usage: LlmUsageMetrics): LlmCostEstimate {
  const { normalizedModelId, pricing, approximate: modelApproximate } = resolvePricing(modelId);

  const { cacheWrite5mTokens, cacheWrite1hTokens, approximate: cacheApproximate } =
    resolveCacheWriteTokens(usage);
  const unpricedCacheWrite =
    usage.cache_creation_input_tokens > 0 &&
    pricing.cacheWrite5mUsdPerMillion === undefined &&
    pricing.cacheWrite1hUsdPerMillion === undefined;
  const unpricedCacheRead =
    usage.cache_read_input_tokens > 0 && pricing.cacheReadUsdPerMillion === undefined;

  const inputUsd = priceTokens(usage.input_tokens, pricing.inputUsdPerMillion);
  const cacheWrite5mUsd = priceTokens(cacheWrite5mTokens, pricing.cacheWrite5mUsdPerMillion ?? 0);
  const cacheWrite1hUsd = priceTokens(cacheWrite1hTokens, pricing.cacheWrite1hUsdPerMillion ?? 0);
  const cacheReadUsd = priceTokens(
    usage.cache_read_input_tokens,
    pricing.cacheReadUsdPerMillion ?? 0,
  );
  const outputUsd = priceTokens(usage.output_tokens, pricing.outputUsdPerMillion);

  return {
    modelId: normalizedModelId,
    inputUsd,
    cacheWrite5mUsd,
    cacheWrite1hUsd,
    cacheReadUsd,
    outputUsd,
    totalUsd: roundUsd(inputUsd + cacheWrite5mUsd + cacheWrite1hUsd + cacheReadUsd + outputUsd),
    approximate: modelApproximate || cacheApproximate || unpricedCacheWrite || unpricedCacheRead,
  };
}

/** Compares actual cost against an uncached baseline (all prompt tokens at the input rate). */
export function buildLlmSpendSummary(
  modelId: string,
  usage: LlmUsageMetrics,
  cost?: LlmCostEstimate,
): LlmSpendSummary {
  const resolvedCost = cost ?? estimateLlmCost(modelId, usage);
  const { pricing } = resolvePricing(modelId);
  const baselineInputTokens =
    usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens;
  const uncachedInputUsd = priceTokens(baselineInputTokens, pricing.inputUsdPerMillion);
  const uncachedUsd = roundUsd(uncachedInputUsd + resolvedCost.outputUsd);
  const cacheEffectUsd = roundUsd(Math.abs(uncachedUsd - resolvedCost.totalUsd));
  const cacheEffectKind: CacheEffectKind =
    uncachedUsd > resolvedCost.totalUsd
      ? 'saved'
      : uncachedUsd < resolvedCost.totalUsd
        ? 'overhead'
        : 'neutral';

  return {
    totalTokens:
      usage.input_tokens +
      usage.cache_creation_input_tokens +
      usage.cache_read_input_tokens +
      usage.output_tokens,
    inputTokens: usage.input_tokens,
    cacheWriteTokens: usage.cache_creation_input_tokens,
    cacheReadTokens: usage.cache_read_input_tokens,
    outputTokens: usage.output_tokens,
    totalUsd: resolvedCost.totalUsd,
    uncachedUsd,
    cacheEffectUsd,
    cacheEffectKind,
    cacheWriteUsd: roundUsd(resolvedCost.cacheWrite5mUsd + resolvedCost.cacheWrite1hUsd),
    cacheReadUsd: resolvedCost.cacheReadUsd,
    approximate: resolvedCost.approximate,
  };
}

export function createZeroLlmSpendSummary(): LlmSpendSummary {
  return {
    totalTokens: 0,
    inputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    outputTokens: 0,
    totalUsd: 0,
    uncachedUsd: 0,
    cacheEffectUsd: 0,
    cacheEffectKind: 'neutral',
    cacheWriteUsd: 0,
    cacheReadUsd: 0,
    approximate: false,
  };
}

// ─── Formatting (legacy spend-format behavior) ───────────────────────────

export function formatCompactTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) {
    const v = n / 1000;
    return v % 1 === 0 ? `${v}k` : `${v.toFixed(1).replace(/\.0$/, '')}k`;
  }
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  const v = n / 1_000_000;
  return v % 1 === 0 ? `${v}M` : `${v.toFixed(1).replace(/\.0$/, '')}M`;
}

export function formatUsd(value: number, approximate = false): string {
  const digits = value >= 1 ? 2 : value >= 0.01 ? 4 : 6;
  return `${approximate ? '~' : ''}$${value.toFixed(digits)}`;
}

export function formatSpendPrimary(spend: LlmSpendSummary): string {
  return `${formatUsd(spend.totalUsd, spend.approximate)} · ${formatCompactTokens(spend.totalTokens)} tokens`;
}

export function formatSpendSecondary(spend: LlmSpendSummary): string {
  return (
    `in ${formatCompactTokens(spend.inputTokens)} · ` +
    `write ${formatCompactTokens(spend.cacheWriteTokens)} · ` +
    `read ${formatCompactTokens(spend.cacheReadTokens)} · ` +
    `out ${formatCompactTokens(spend.outputTokens)}`
  );
}

export function formatCacheEffectInline(
  spend: LlmSpendSummary,
): { text: string; kind: 'saved' | 'overhead' } | null {
  if (spend.cacheEffectKind === 'neutral' || spend.cacheEffectUsd === 0) {
    return null;
  }
  return {
    text: `${spend.cacheEffectKind} ${formatUsd(spend.cacheEffectUsd, spend.approximate)}`,
    kind: spend.cacheEffectKind,
  };
}

export function formatLlmCostSummary(cost: LlmCostEstimate): string {
  return `total ${formatUsd(cost.totalUsd, cost.approximate)} • input ${formatUsd(
    cost.inputUsd,
    cost.approximate,
  )} • write ${formatUsd(
    cost.cacheWrite5mUsd + cost.cacheWrite1hUsd,
    cost.approximate,
  )} • read ${formatUsd(cost.cacheReadUsd, cost.approximate)} • output ${formatUsd(
    cost.outputUsd,
    cost.approximate,
  )}`;
}

export function formatModelUsageLog(modelId: string, usage: LlmUsageMetrics): string {
  const modelName = getModelDisplayName(modelId);
  return `${modelName} usage: input_tokens=${usage.input_tokens}, cache_creation_input_tokens=${usage.cache_creation_input_tokens}, cache_read_input_tokens=${usage.cache_read_input_tokens}, output_tokens=${usage.output_tokens}`;
}

export function formatModelCostLog(cost: LlmCostEstimate): string {
  const modelName = getModelDisplayName(cost.modelId);
  return `${modelName} cost: model=${cost.modelId}, total_usd=${cost.totalUsd.toFixed(6)}, input_usd=${cost.inputUsd.toFixed(6)}, cache_write_5m_usd=${cost.cacheWrite5mUsd.toFixed(6)}, cache_write_1h_usd=${cost.cacheWrite1hUsd.toFixed(6)}, cache_read_usd=${cost.cacheReadUsd.toFixed(6)}, output_usd=${cost.outputUsd.toFixed(6)}, approximate=${cost.approximate}`;
}
