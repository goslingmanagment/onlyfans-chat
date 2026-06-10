// Thinking/reasoning capability map and per-request tuning (research doc §4.3–§4.5
// is normative). Base MAX_TOKENS / FEATURE_TEMPERATURES tables live in src/constants.ts.

import type { FeatureType, ReasoningEffort } from '../types';
import type { OperationFeature } from '../features';
import { COMPARE_TEMPERATURE, FEATURE_TEMPERATURES, MAX_TOKENS } from '../constants';
import { getModelEntry } from './model-registry';

// 'compare' runs the fast-reply pipeline per personality card (legacy compare-operations).
function toOperationFeature(feature: FeatureType): OperationFeature {
  return feature === 'compare' ? 'fast-reply' : feature;
}

export function getFeatureMaxTokens(feature: FeatureType): number {
  return MAX_TOKENS[toOperationFeature(feature)];
}

/** Compare uses its own temperature (0.35); every other feature reads the table. */
export function getFeatureTemperature(feature: FeatureType): number {
  return feature === 'compare' ? COMPARE_TEMPERATURE : FEATURE_TEMPERATURES[feature];
}

// ─── Anthropic adaptive thinking ─────────────────────────────────────────

const ANTHROPIC_ADAPTIVE_THINKING_MODELS = new Set([
  'claude-sonnet-4-6',
  'claude-opus-4-6',
  'claude-opus-4-8',
]);

// Opus 4.7+ removed temperature/top_p/top_k from the API (400 if sent) and made
// adaptive the only thinking mode. Registry addition 2026-06-10; legacy models
// keep the legacy temperature behavior.
const SAMPLING_PARAMS_REMOVED_MODELS = new Set(['claude-opus-4-8']);

export function anthropicSamplingParamsRemoved(providerModelId: string): boolean {
  return SAMPLING_PARAMS_REMOVED_MODELS.has(providerModelId);
}

const ANTHROPIC_ADAPTIVE_THINKING_MAX_TOKENS: Record<OperationFeature, number> = {
  'fast-reply': 8000,
  'improve-draft': 8000,
  'help-me': 16000,
  'fan-summary': 24000,
  'chat-review': 16000,
  'ping': 8000,
  'hi-greeting': 8000,
};

export function supportsAnthropicAdaptiveThinking(providerModelId: string): boolean {
  return ANTHROPIC_ADAPTIVE_THINKING_MODELS.has(providerModelId);
}

export function getAnthropicAdaptiveThinkingMaxTokens(feature: FeatureType): number {
  return ANTHROPIC_ADAPTIVE_THINKING_MAX_TOKENS[toOperationFeature(feature)];
}

// ─── OpenRouter Gemini thinking ──────────────────────────────────────────

// Short-form features only; deep features keep base MAX_TOKENS with no thinking
// config. help-me at 2000 is a legacy-code fact (research doc lists it as unsupported).
const GEMINI_THINKING_MAX_TOKENS: Partial<Record<OperationFeature, number>> = {
  'fast-reply': 1600,
  'improve-draft': 1600,
  'hi-greeting': 1600,
  'ping': 1600,
  'help-me': 2000,
};

export function isOpenRouterGeminiModel(providerModelId: string): boolean {
  return providerModelId.startsWith('google/gemini-');
}

export function getGeminiThinkingMaxTokens(feature: FeatureType): number | undefined {
  return GEMINI_THINKING_MAX_TOKENS[toOperationFeature(feature)];
}

export function supportsGeminiThinking(providerModelId: string, feature: FeatureType): boolean {
  return Boolean(
    isOpenRouterGeminiModel(providerModelId) && getGeminiThinkingMaxTokens(feature) !== undefined,
  );
}

/** Whether the reasoning-effort setting has any effect for this model+feature pair. */
export function supportsModelReasoningConfig(
  modelId: string | null | undefined,
  feature: FeatureType,
): boolean {
  const model = getModelEntry(modelId);
  if (!model) {
    return false;
  }
  if (model.provider === 'anthropic') {
    return supportsAnthropicAdaptiveThinking(model.providerModelId);
  }
  return supportsGeminiThinking(model.providerModelId, feature);
}

// ─── Per-request tuning ──────────────────────────────────────────────────

export type AnthropicThinkingEffort = Exclude<ReasoningEffort, 'off'>;
export type GeminiThinkingEffort = Exclude<ReasoningEffort, 'off' | 'max'>;

export interface AnthropicRequestTuning {
  maxTokens: number;
  /** Never set alongside `thinking` — Anthropic rejects the combination (legacy 1.3.6 production incident). */
  temperature?: number;
  thinking?: { type: 'adaptive'; display: 'summarized' };
  outputConfig?: { effort: AnthropicThinkingEffort };
}

export interface OpenRouterRequestTuning {
  maxTokens: number;
  /** OpenRouter always receives temperature, with or without thinking (legacy behavior). */
  temperature: number;
  thinking?: { type: 'adaptive'; display: 'omitted' };
  outputConfig?: { effort: GeminiThinkingEffort };
}

/**
 * Max-tokens cap follows model capability, not the effort setting: adaptive-capable
 * models keep the raised cap even with reasoning 'off'. Effort passes through
 * unchanged for Anthropic ('max' stays 'max').
 */
export function resolveAnthropicRequestTuning(
  providerModelId: string,
  feature: FeatureType,
  temperature: number,
  reasoningEffort: ReasoningEffort,
): AnthropicRequestTuning {
  const adaptive = supportsAnthropicAdaptiveThinking(providerModelId);
  const maxTokens = adaptive
    ? getAnthropicAdaptiveThinkingMaxTokens(feature)
    : getFeatureMaxTokens(feature);
  if (!adaptive || reasoningEffort === 'off') {
    if (anthropicSamplingParamsRemoved(providerModelId)) {
      return { maxTokens };
    }
    return { maxTokens, temperature };
  }
  return {
    maxTokens,
    thinking: { type: 'adaptive', display: 'summarized' },
    outputConfig: { effort: reasoningEffort },
  };
}

/** Gemini caps apply whenever the model is Gemini and the feature has a cap; 'max' maps to 'high'. */
export function resolveOpenRouterRequestTuning(
  providerModelId: string,
  feature: FeatureType,
  temperature: number,
  reasoningEffort: ReasoningEffort,
): OpenRouterRequestTuning {
  const maxTokens = isOpenRouterGeminiModel(providerModelId)
    ? getGeminiThinkingMaxTokens(feature) ?? getFeatureMaxTokens(feature)
    : getFeatureMaxTokens(feature);
  if (!supportsGeminiThinking(providerModelId, feature) || reasoningEffort === 'off') {
    return { maxTokens, temperature };
  }
  return {
    maxTokens,
    temperature,
    thinking: { type: 'adaptive', display: 'omitted' },
    outputConfig: { effort: reasoningEffort === 'max' ? 'high' : reasoningEffort },
  };
}
