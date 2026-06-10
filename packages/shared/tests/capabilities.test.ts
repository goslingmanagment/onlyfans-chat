import { describe, expect, it } from 'vitest';
import {
  getAnthropicAdaptiveThinkingMaxTokens,
  getFeatureMaxTokens,
  getFeatureTemperature,
  getGeminiThinkingMaxTokens,
  isOpenRouterGeminiModel,
  resolveAnthropicRequestTuning,
  resolveOpenRouterRequestTuning,
  supportsAnthropicAdaptiveThinking,
  supportsGeminiThinking,
  supportsModelReasoningConfig,
} from '../src/llm/capabilities';
import { COMPARE_TEMPERATURE, FEATURE_TEMPERATURES, MAX_TOKENS } from '../src/constants';

describe('non-reasoning MAX_TOKENS table (legacy values)', () => {
  it('keeps max_tokens for all features unchanged', () => {
    expect(MAX_TOKENS).toEqual({
      'fast-reply': 800,
      'improve-draft': 800,
      'help-me': 1200,
      'fan-summary': 8192,
      'chat-review': 1600,
      'ping': 800,
      'hi-greeting': 800,
    });
  });

  it('uses the raised 8192 cap for fan-summary', () => {
    expect(getFeatureMaxTokens('fan-summary')).toBe(8192);
    expect(getFeatureMaxTokens('fan-summary')).toBe(MAX_TOKENS['fan-summary']);
  });

  it('maps compare onto the fast-reply cap', () => {
    expect(getFeatureMaxTokens('compare')).toBe(800);
  });
});

describe('FEATURE_TEMPERATURES table (legacy values)', () => {
  it('keeps per-feature temperatures unchanged', () => {
    expect(FEATURE_TEMPERATURES).toEqual({
      'fast-reply': 0.65,
      'improve-draft': 0.65,
      'help-me': 0.45,
      'fan-summary': 0.4,
      'chat-review': 0.25,
      'ping': 0.65,
      'hi-greeting': 0.7,
    });
  });

  it('uses 0.35 for compare and the table for everything else', () => {
    expect(COMPARE_TEMPERATURE).toBe(0.35);
    expect(getFeatureTemperature('compare')).toBe(0.35);
    expect(getFeatureTemperature('fast-reply')).toBe(0.65);
    expect(getFeatureTemperature('chat-review')).toBe(0.25);
    expect(getFeatureTemperature('hi-greeting')).toBe(0.7);
  });
});

describe('Anthropic adaptive thinking support', () => {
  it('is limited to claude-sonnet-4-6 and claude-opus-4-6', () => {
    expect(supportsAnthropicAdaptiveThinking('claude-sonnet-4-6')).toBe(true);
    expect(supportsAnthropicAdaptiveThinking('claude-opus-4-6')).toBe(true);
    expect(supportsAnthropicAdaptiveThinking('claude-sonnet-4-5')).toBe(false);
    expect(supportsAnthropicAdaptiveThinking('claude-opus-4-5')).toBe(false);
    expect(supportsAnthropicAdaptiveThinking('claude-haiku-4-5')).toBe(false);
  });

  it('uses the 8000/16000/24000 adaptive caps per feature', () => {
    expect(getAnthropicAdaptiveThinkingMaxTokens('fast-reply')).toBe(8000);
    expect(getAnthropicAdaptiveThinkingMaxTokens('improve-draft')).toBe(8000);
    expect(getAnthropicAdaptiveThinkingMaxTokens('help-me')).toBe(16000);
    expect(getAnthropicAdaptiveThinkingMaxTokens('fan-summary')).toBe(24000);
    expect(getAnthropicAdaptiveThinkingMaxTokens('chat-review')).toBe(16000);
    expect(getAnthropicAdaptiveThinkingMaxTokens('ping')).toBe(8000);
    expect(getAnthropicAdaptiveThinkingMaxTokens('hi-greeting')).toBe(8000);
    expect(getAnthropicAdaptiveThinkingMaxTokens('compare')).toBe(8000);
  });
});

describe('resolveAnthropicRequestTuning', () => {
  it('uses medium summarized adaptive thinking and a large cap for Claude 4.6 reply features by default', () => {
    const tuning = resolveAnthropicRequestTuning('claude-sonnet-4-6', 'fast-reply', 0.65, 'medium');
    expect(tuning).toEqual({
      maxTokens: 8000,
      thinking: { type: 'adaptive', display: 'summarized' },
      outputConfig: { effort: 'medium' },
    });
    // 1.3.6 production incident: temperature must never accompany thinking.
    expect(tuning).not.toHaveProperty('temperature');
  });

  it('omits adaptive thinking config when reasoning is off but keeps the raised cap', () => {
    expect(resolveAnthropicRequestTuning('claude-sonnet-4-6', 'fast-reply', 0.65, 'off')).toEqual({
      maxTokens: 8000,
      temperature: 0.65,
    });
  });

  it.each(['low', 'high', 'max'] as const)(
    'passes %s effort through unchanged (max stays max)',
    (effort) => {
      const tuning = resolveAnthropicRequestTuning('claude-sonnet-4-6', 'fast-reply', 0.65, effort);
      expect(tuning.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
      expect(tuning.outputConfig).toEqual({ effort });
      expect(tuning).not.toHaveProperty('temperature');
    },
  );

  it('keeps adaptive thinking off for Claude models that do not support adaptive mode', () => {
    expect(resolveAnthropicRequestTuning('claude-haiku-4-5', 'fast-reply', 0.65, 'medium')).toEqual({
      maxTokens: MAX_TOKENS['fast-reply'],
      temperature: 0.65,
    });
  });

  it('uses the non-adaptive 8192 fan-summary cap for older Claude models', () => {
    expect(resolveAnthropicRequestTuning('claude-sonnet-4-5', 'fan-summary', 0.4, 'medium')).toEqual({
      maxTokens: 8192,
      temperature: 0.4,
    });
  });

  it('uses the 24000 adaptive cap for Claude 4.6 fan-summary', () => {
    expect(resolveAnthropicRequestTuning('claude-opus-4-6', 'fan-summary', 0.4, 'medium')).toEqual({
      maxTokens: 24000,
      thinking: { type: 'adaptive', display: 'summarized' },
      outputConfig: { effort: 'medium' },
    });
  });

  it('uses the 16000 adaptive cap for Claude 4.6 chat-review', () => {
    expect(resolveAnthropicRequestTuning('claude-sonnet-4-6', 'chat-review', 0.25, 'medium')).toEqual({
      maxTokens: 16000,
      thinking: { type: 'adaptive', display: 'summarized' },
      outputConfig: { effort: 'medium' },
    });
  });
});

describe('OpenRouter Gemini thinking support', () => {
  it('detects Gemini models by provider id prefix', () => {
    expect(isOpenRouterGeminiModel('google/gemini-3.1-pro-preview')).toBe(true);
    expect(isOpenRouterGeminiModel('x-ai/grok-4.3')).toBe(false);
  });

  it('caps short-form features at 1600 and help-me at 2000; deep features have no cap', () => {
    expect(getGeminiThinkingMaxTokens('fast-reply')).toBe(1600);
    expect(getGeminiThinkingMaxTokens('improve-draft')).toBe(1600);
    expect(getGeminiThinkingMaxTokens('hi-greeting')).toBe(1600);
    expect(getGeminiThinkingMaxTokens('ping')).toBe(1600);
    expect(getGeminiThinkingMaxTokens('help-me')).toBe(2000);
    expect(getGeminiThinkingMaxTokens('compare')).toBe(1600);
    expect(getGeminiThinkingMaxTokens('fan-summary')).toBeUndefined();
    expect(getGeminiThinkingMaxTokens('chat-review')).toBeUndefined();
  });

  it('supports thinking only for Gemini models on capped features', () => {
    expect(supportsGeminiThinking('google/gemini-3.1-pro-preview', 'fast-reply')).toBe(true);
    expect(supportsGeminiThinking('google/gemini-3.1-pro-preview', 'fan-summary')).toBe(false);
    expect(supportsGeminiThinking('x-ai/grok-4.3', 'fast-reply')).toBe(false);
  });
});

describe('resolveOpenRouterRequestTuning', () => {
  it('uses medium omitted thinking and the 1600 budget for short Gemini reply features by default', () => {
    expect(
      resolveOpenRouterRequestTuning('google/gemini-3.1-pro-preview', 'fast-reply', 0.65, 'medium'),
    ).toEqual({
      maxTokens: 1600,
      temperature: 0.65,
      thinking: { type: 'adaptive', display: 'omitted' },
      outputConfig: { effort: 'medium' },
    });
  });

  it('omits Gemini thinking config when reasoning is off but keeps the Gemini budget', () => {
    expect(
      resolveOpenRouterRequestTuning('google/gemini-3.1-pro-preview', 'fast-reply', 0.65, 'off'),
    ).toEqual({ maxTokens: 1600, temperature: 0.65 });
  });

  it('maps max Gemini reasoning to high', () => {
    expect(
      resolveOpenRouterRequestTuning('google/gemini-3.1-pro-preview', 'fast-reply', 0.65, 'max'),
    ).toMatchObject({
      thinking: { type: 'adaptive', display: 'omitted' },
      outputConfig: { effort: 'high' },
    });
  });

  it('keeps the default budget and no thinking config for deep Gemini features', () => {
    expect(
      resolveOpenRouterRequestTuning('google/gemini-3.1-pro-preview', 'fan-summary', 0.4, 'medium'),
    ).toEqual({ maxTokens: MAX_TOKENS['fan-summary'], temperature: 0.4 });
  });

  it('sends no thinking config and the base cap for Grok', () => {
    expect(resolveOpenRouterRequestTuning('x-ai/grok-4.3', 'fast-reply', 0.65, 'medium')).toEqual({
      maxTokens: MAX_TOKENS['fast-reply'],
      temperature: 0.65,
    });
  });
});

describe('supportsModelReasoningConfig', () => {
  it('is true for adaptive Anthropic models on any feature', () => {
    expect(supportsModelReasoningConfig('anthropic:claude-sonnet-4-6', 'fast-reply')).toBe(true);
    expect(supportsModelReasoningConfig('anthropic:claude-opus-4-6', 'fan-summary')).toBe(true);
    // Legacy bare ids normalize through the registry.
    expect(supportsModelReasoningConfig('claude-opus-4-6', 'chat-review')).toBe(true);
  });

  it('is false for non-adaptive Anthropic models', () => {
    expect(supportsModelReasoningConfig('anthropic:claude-haiku-4-5', 'fast-reply')).toBe(false);
    expect(supportsModelReasoningConfig('anthropic:claude-sonnet-4-5', 'fast-reply')).toBe(false);
  });

  it('disables unsupported model-feature pairs (gemini deep features, grok everywhere)', () => {
    expect(
      supportsModelReasoningConfig('openrouter:google/gemini-3.1-pro-preview', 'fan-summary'),
    ).toBe(false);
    expect(supportsModelReasoningConfig('openrouter:x-ai/grok-4.3', 'fast-reply')).toBe(false);
    expect(supportsModelReasoningConfig('openrouter:x-ai/grok-4.20', 'ping')).toBe(false);
  });

  it('enables gemini on short-form features (model-change re-enables reasoning)', () => {
    expect(
      supportsModelReasoningConfig('openrouter:google/gemini-3.1-pro-preview', 'fast-reply'),
    ).toBe(true);
  });

  it('is false for unknown models', () => {
    expect(supportsModelReasoningConfig('unknown', 'fast-reply')).toBe(false);
    expect(supportsModelReasoningConfig(null, 'fast-reply')).toBe(false);
  });
});

// claude-opus-4-8 registry addition (2026-06-10): sampling params are removed on
// Opus 4.7+ — temperature must never be sent, even with reasoning off.
import {
  anthropicSamplingParamsRemoved,
  resolveAnthropicRequestTuning as resolveTuningForAddition,
} from '../src/llm/capabilities';

describe('claude-opus-4-8 addition', () => {
  it('flags opus-4-8 as sampling-params-removed; legacy models unaffected', () => {
    expect(anthropicSamplingParamsRemoved('claude-opus-4-8')).toBe(true);
    expect(anthropicSamplingParamsRemoved('claude-opus-4-6')).toBe(false);
    expect(anthropicSamplingParamsRemoved('claude-sonnet-4-6')).toBe(false);
  });

  it('omits temperature for opus-4-8 with reasoning off (adaptive cap retained)', () => {
    const tuning = resolveTuningForAddition('claude-opus-4-8', 'fast-reply', 0.65, 'off');
    expect(tuning).toEqual({ maxTokens: 8000 });
  });

  it('sends adaptive thinking without temperature for opus-4-8 with reasoning on', () => {
    const tuning = resolveTuningForAddition('claude-opus-4-8', 'fan-summary', 0.4, 'max');
    expect(tuning).toEqual({
      maxTokens: 24000,
      thinking: { type: 'adaptive', display: 'summarized' },
      outputConfig: { effort: 'max' },
    });
  });

  it('keeps temperature for legacy non-adaptive models with reasoning off', () => {
    const tuning = resolveTuningForAddition('claude-opus-4-5', 'fast-reply', 0.65, 'off');
    expect(tuning).toEqual({ maxTokens: 800, temperature: 0.65 });
  });
});
