import { describe, expect, it } from 'vitest';
import {
  MODEL_GROUPS,
  MODEL_REGISTRY,
  getHubReportingModelId,
  getModelDisplayName,
  getModelEntry,
  getProviderModelId,
  isAnthropicModelSelection,
  isOpenRouterModelSelection,
  isSupportedModelSelection,
  modelSelectionsEquivalent,
  normalizeModelId,
} from '../src/llm/model-registry';
import {
  DEFAULT_FAN_SUMMARY_MODEL_ID,
  DEFAULT_FEATURE_MODELS,
  DEFAULT_MODEL_ID,
} from '../src/constants';

describe('model catalog (verbatim legacy port)', () => {
  // 8 legacy entries verbatim + claude-opus-4-8 added 2026-06-10 (PRD F6 model refresh).
  it('contains the 8 legacy entries in registry order plus the opus-4-8 addition', () => {
    expect(MODEL_REGISTRY.map((model) => model.id)).toEqual([
      'anthropic:claude-sonnet-4-6',
      'anthropic:claude-sonnet-4-5',
      'anthropic:claude-opus-4-8',
      'anthropic:claude-opus-4-6',
      'anthropic:claude-opus-4-5',
      'anthropic:claude-haiku-4-5',
      'openrouter:google/gemini-3.1-pro-preview',
      'openrouter:x-ai/grok-4.20',
      'openrouter:x-ai/grok-4.3',
    ]);
  });

  it('carries Sonnet pricing verbatim ($3/$15, 5m $3.75, 1h $6, read $0.30)', () => {
    for (const id of ['anthropic:claude-sonnet-4-6', 'anthropic:claude-sonnet-4-5']) {
      const entry = getModelEntry(id);
      expect(entry?.pricing).toEqual({
        inputUsdPerMillion: 3,
        cacheWrite5mUsdPerMillion: 3.75,
        cacheWrite1hUsdPerMillion: 6,
        cacheReadUsdPerMillion: 0.3,
        outputUsdPerMillion: 15,
      });
      expect(entry?.supportsPromptCache).toBe(true);
    }
  });

  it('carries Opus pricing verbatim ($5/$25, 5m $6.25, 1h $10, read $0.50)', () => {
    for (const id of ['anthropic:claude-opus-4-6', 'anthropic:claude-opus-4-5']) {
      const entry = getModelEntry(id);
      expect(entry?.pricing).toEqual({
        inputUsdPerMillion: 5,
        cacheWrite5mUsdPerMillion: 6.25,
        cacheWrite1hUsdPerMillion: 10,
        cacheReadUsdPerMillion: 0.5,
        outputUsdPerMillion: 25,
      });
      expect(entry?.supportsPromptCache).toBe(true);
    }
  });

  it('carries Haiku pricing verbatim ($1/$5, 5m $1.25, 1h $2, read $0.10)', () => {
    expect(getModelEntry('anthropic:claude-haiku-4-5')?.pricing).toEqual({
      inputUsdPerMillion: 1,
      cacheWrite5mUsdPerMillion: 1.25,
      cacheWrite1hUsdPerMillion: 2,
      cacheReadUsdPerMillion: 0.1,
      outputUsdPerMillion: 5,
    });
  });

  it('carries Gemini pricing verbatim ($2/$12, no prompt cache, exact cost)', () => {
    const entry = getModelEntry('openrouter:google/gemini-3.1-pro-preview');
    expect(entry?.pricing).toEqual({ inputUsdPerMillion: 2, outputUsdPerMillion: 12 });
    expect(entry?.supportsPromptCache).toBe(false);
    expect(entry?.costApproximate).toBeUndefined();
  });

  it('marks both Grok entries approximate with $1.25/$2.50 and $0.20 cache read', () => {
    for (const id of ['openrouter:x-ai/grok-4.20', 'openrouter:x-ai/grok-4.3']) {
      const entry = getModelEntry(id);
      expect(entry?.pricing).toEqual({
        inputUsdPerMillion: 1.25,
        cacheReadUsdPerMillion: 0.2,
        outputUsdPerMillion: 2.5,
      });
      expect(entry?.supportsPromptCache).toBe(false);
      expect(entry?.costApproximate).toBe(true);
      expect(entry?.pricingNote).toBeTruthy();
    }
  });

  it('keeps labels and provider labels verbatim', () => {
    expect(MODEL_REGISTRY.map((model) => model.label)).toEqual([
      'Claude Sonnet 4.6',
      'Claude Sonnet 4.5',
      'Claude Opus 4.8',
      'Claude Opus 4.6',
      'Claude Opus 4.5',
      'Claude Haiku 4.5',
      'Gemini 3.1 Pro Preview',
      'Grok 4.20',
      'Grok 4.3',
    ]);
    expect(new Set(MODEL_REGISTRY.map((model) => model.providerLabel))).toEqual(
      new Set(['Anthropic Direct', 'OpenRouter']),
    );
  });

  it('derives providerModelId consistently from the namespaced id', () => {
    for (const model of MODEL_REGISTRY) {
      expect(model.id).toBe(`${model.provider}:${model.providerModelId}`);
    }
  });
});

describe('defaults (anchored in constants)', () => {
  it('defaults every feature to Sonnet 4.6 except fan-summary on Opus 4.6', () => {
    expect(DEFAULT_MODEL_ID).toBe('anthropic:claude-sonnet-4-6');
    expect(DEFAULT_FAN_SUMMARY_MODEL_ID).toBe('anthropic:claude-opus-4-6');
    expect(DEFAULT_FEATURE_MODELS).toEqual({
      'fast-reply': 'anthropic:claude-sonnet-4-6',
      'help-me': 'anthropic:claude-sonnet-4-6',
      'fan-summary': 'anthropic:claude-opus-4-6',
      'chat-review': 'anthropic:claude-sonnet-4-6',
      'ping': 'anthropic:claude-sonnet-4-6',
    });
  });

  it('resolves every default model id against the catalog', () => {
    for (const id of Object.values(DEFAULT_FEATURE_MODELS)) {
      expect(isSupportedModelSelection(id)).toBe(true);
    }
  });
});

describe('MODEL_GROUPS', () => {
  it('groups models by provider in registry order: Anthropic Direct, then OpenRouter', () => {
    expect(MODEL_GROUPS.map((group) => group.label)).toEqual(['Anthropic Direct', 'OpenRouter']);
    expect(MODEL_GROUPS[0]?.models.map((model) => model.id)).toEqual([
      'anthropic:claude-sonnet-4-6',
      'anthropic:claude-sonnet-4-5',
      'anthropic:claude-opus-4-8',
      'anthropic:claude-opus-4-6',
      'anthropic:claude-opus-4-5',
      'anthropic:claude-haiku-4-5',
    ]);
    expect(MODEL_GROUPS[1]?.models.map((model) => model.id)).toEqual([
      'openrouter:google/gemini-3.1-pro-preview',
      'openrouter:x-ai/grok-4.20',
      'openrouter:x-ai/grok-4.3',
    ]);
    expect(MODEL_GROUPS.flatMap((group) => group.models)).toHaveLength(MODEL_REGISTRY.length);
  });
});

describe('normalizeModelId', () => {
  it('passes namespaced ids through unchanged', () => {
    expect(normalizeModelId('anthropic:claude-sonnet-4-6')).toBe('anthropic:claude-sonnet-4-6');
    expect(normalizeModelId('openrouter:x-ai/grok-4.3')).toBe('openrouter:x-ai/grok-4.3');
  });

  it('normalizes legacy bare Anthropic ids to namespaced ids', () => {
    expect(normalizeModelId('claude-opus-4-6')).toBe('anthropic:claude-opus-4-6');
    expect(normalizeModelId('claude-haiku-4-5')).toBe('anthropic:claude-haiku-4-5');
  });

  it('does not normalize bare OpenRouter provider ids', () => {
    expect(normalizeModelId('x-ai/grok-4.3')).toBeNull();
    expect(normalizeModelId('google/gemini-3.1-pro-preview')).toBeNull();
  });

  it('trims whitespace before matching', () => {
    expect(normalizeModelId('  claude-sonnet-4-6  ')).toBe('anthropic:claude-sonnet-4-6');
  });

  it('returns null for null, undefined, empty, and unknown ids', () => {
    expect(normalizeModelId(null)).toBeNull();
    expect(normalizeModelId(undefined)).toBeNull();
    expect(normalizeModelId('')).toBeNull();
    expect(normalizeModelId('   ')).toBeNull();
    expect(normalizeModelId('anthropic:claude-2')).toBeNull();
  });
});

describe('modelSelectionsEquivalent', () => {
  it('treats a legacy bare id and its namespaced form as the same selection', () => {
    expect(modelSelectionsEquivalent('claude-sonnet-4-6', 'anthropic:claude-sonnet-4-6')).toBe(true);
  });

  it('treats different models as different', () => {
    expect(
      modelSelectionsEquivalent('anthropic:claude-sonnet-4-6', 'anthropic:claude-sonnet-4-5'),
    ).toBe(false);
  });

  it('never matches unknown or empty selections — even identical ones', () => {
    expect(modelSelectionsEquivalent('mystery-model', 'mystery-model')).toBe(false);
    expect(modelSelectionsEquivalent(null, null)).toBe(false);
    expect(modelSelectionsEquivalent('', '')).toBe(false);
    expect(modelSelectionsEquivalent('claude-sonnet-4-6', null)).toBe(false);
  });
});

describe('lookups', () => {
  it('getModelEntry resolves legacy bare ids to the catalog entry', () => {
    expect(getModelEntry('claude-opus-4-6')?.id).toBe('anthropic:claude-opus-4-6');
    expect(getModelEntry('nope')).toBeNull();
  });

  it('getModelDisplayName falls back to "AI model"', () => {
    expect(getModelDisplayName('anthropic:claude-sonnet-4-6')).toBe('Claude Sonnet 4.6');
    expect(getModelDisplayName('unknown')).toBe('AI model');
    expect(getModelDisplayName(null, 'custom')).toBe('custom');
  });

  it('provider predicates classify selections', () => {
    expect(isAnthropicModelSelection('claude-sonnet-4-6')).toBe(true);
    expect(isAnthropicModelSelection('openrouter:x-ai/grok-4.3')).toBe(false);
    expect(isOpenRouterModelSelection('openrouter:google/gemini-3.1-pro-preview')).toBe(true);
    expect(isOpenRouterModelSelection('claude-sonnet-4-6')).toBe(false);
    expect(isAnthropicModelSelection('unknown')).toBe(false);
    expect(isOpenRouterModelSelection('unknown')).toBe(false);
  });

  it('getProviderModelId strips the namespace and passes unknown ids through', () => {
    expect(getProviderModelId('anthropic:claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
    expect(getProviderModelId('openrouter:x-ai/grok-4.20')).toBe('x-ai/grok-4.20');
    expect(getProviderModelId('weird-id')).toBe('weird-id');
  });

  it('getHubReportingModelId reports bare ids for Anthropic and namespaced ids for OpenRouter', () => {
    expect(getHubReportingModelId(DEFAULT_MODEL_ID)).toBe('claude-sonnet-4-6');
    expect(getHubReportingModelId('claude-opus-4-6')).toBe('claude-opus-4-6');
    expect(getHubReportingModelId('openrouter:x-ai/grok-4.20')).toBe('openrouter:x-ai/grok-4.20');
    expect(getHubReportingModelId('unknown-model')).toBe('unknown-model');
  });
});
