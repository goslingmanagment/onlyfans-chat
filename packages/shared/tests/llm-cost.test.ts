import { describe, expect, it } from 'vitest';
import {
  buildLlmSpendSummary,
  createZeroLlmSpendSummary,
  estimateLlmCost,
  formatCacheEffectInline,
  formatCompactTokens,
  formatLlmCostSummary,
  formatModelCostLog,
  formatModelUsageLog,
  formatSpendPrimary,
  formatSpendSecondary,
  formatUsd,
} from '../src/llm/cost';
import type { LlmSpendSummary } from '../src/llm/cost';

describe('LLM spend summary', () => {
  it('marks cache savings when cached reads reduce total request cost', () => {
    const usage = {
      input_tokens: 100,
      cache_creation_input_tokens: 10,
      cache_read_input_tokens: 5,
      output_tokens: 8,
    };

    const cost = estimateLlmCost('claude-sonnet-4-6', usage);
    const summary = buildLlmSpendSummary('claude-sonnet-4-6', usage, cost);

    expect(summary).toEqual({
      totalTokens: 123,
      inputTokens: 100,
      cacheWriteTokens: 10,
      cacheReadTokens: 5,
      outputTokens: 8,
      totalUsd: 0.00046,
      uncachedUsd: 0.000465,
      cacheEffectUsd: 0.000005,
      cacheEffectKind: 'saved',
      cacheWriteUsd: 0.000038,
      cacheReadUsd: 0.000002,
      approximate: true,
    });
  });

  it('marks cache overhead when write pricing exceeds an uncached baseline', () => {
    const usage = {
      input_tokens: 420,
      cache_creation_input_tokens: 300,
      cache_read_input_tokens: 90,
      output_tokens: 11,
      cache_creation: {
        ephemeral_5m_input_tokens: 120,
        ephemeral_1h_input_tokens: 180,
      },
    };

    const cost = estimateLlmCost('claude-sonnet-4-6', usage);
    const summary = buildLlmSpendSummary('claude-sonnet-4-6', usage, cost);

    expect(summary).toEqual({
      totalTokens: 821,
      inputTokens: 420,
      cacheWriteTokens: 300,
      cacheReadTokens: 90,
      outputTokens: 11,
      totalUsd: 0.002982,
      uncachedUsd: 0.002595,
      cacheEffectUsd: 0.000387,
      cacheEffectKind: 'overhead',
      cacheWriteUsd: 0.00153,
      cacheReadUsd: 0.000027,
      approximate: false,
    });
  });

  it('prices Claude Opus 4.6 using current Opus 4.6 rates', () => {
    const cost = estimateLlmCost('anthropic:claude-opus-4-6', {
      input_tokens: 1_000_000,
      cache_creation_input_tokens: 1_000_000,
      cache_read_input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cache_creation: {
        ephemeral_5m_input_tokens: 500_000,
        ephemeral_1h_input_tokens: 500_000,
      },
    });

    expect(cost).toEqual({
      modelId: 'anthropic:claude-opus-4-6',
      inputUsd: 5,
      cacheWrite5mUsd: 3.125,
      cacheWrite1hUsd: 5,
      cacheReadUsd: 0.5,
      outputUsd: 25,
      totalUsd: 38.625,
      approximate: false,
    });
  });

  it('treats Grok cache-read pricing as approximate rather than source-confirmed truth', () => {
    const usage = {
      input_tokens: 1_000_000,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    };

    const cost = estimateLlmCost('openrouter:x-ai/grok-4.20', usage);
    const summary = buildLlmSpendSummary('openrouter:x-ai/grok-4.20', usage, cost);

    expect(cost).toMatchObject({
      modelId: 'openrouter:x-ai/grok-4.20',
      inputUsd: 1.25,
      outputUsd: 2.5,
      approximate: true,
    });
    expect(cost.cacheReadUsd).toBeGreaterThan(0);
    expect(summary).toMatchObject({
      totalTokens: 3_000_000,
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheWriteTokens: 0,
      cacheReadTokens: 1_000_000,
      cacheEffectKind: 'saved',
      approximate: true,
    });
    expect(summary.cacheReadUsd).toBeGreaterThan(0);
  });

  it('summarizes normalized OpenRouter cached usage without double-counting prompt tokens', () => {
    const usage = {
      input_tokens: 500,
      cache_creation_input_tokens: 200,
      cache_read_input_tokens: 300,
      output_tokens: 100,
    };

    const cost = estimateLlmCost('openrouter:x-ai/grok-4.20', usage);
    const summary = buildLlmSpendSummary('openrouter:x-ai/grok-4.20', usage, cost);

    expect(summary).toMatchObject({
      totalTokens: 1100,
      inputTokens: 500,
      cacheWriteTokens: 200,
      cacheReadTokens: 300,
      outputTokens: 100,
      uncachedUsd: 0.0015,
      approximate: true,
    });
    expect(summary.totalUsd).toBeGreaterThan(cost.inputUsd + cost.outputUsd);
    expect(summary.totalUsd).toBeLessThan(summary.uncachedUsd);
  });

  it('marks costs approximate when a model reports cache reads without cache pricing', () => {
    const cost = estimateLlmCost('openrouter:google/gemini-3.1-pro-preview', {
      input_tokens: 100,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 10,
      output_tokens: 100,
    });

    expect(cost.cacheReadUsd).toBe(0);
    expect(cost.approximate).toBe(true);
  });

  it('marks Grok 4.3 costs approximate because OpenRouter tiering can apply', () => {
    const cost = estimateLlmCost('openrouter:x-ai/grok-4.3', {
      input_tokens: 100,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      output_tokens: 100,
    });

    expect(cost.approximate).toBe(true);
  });

  it('throws for models outside the registry', () => {
    expect(() =>
      estimateLlmCost('mystery-model', {
        input_tokens: 1,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 1,
      }),
    ).toThrowError('Unsupported model for cost estimation: mystery-model');
  });

  it('creates an all-zero neutral spend summary', () => {
    expect(createZeroLlmSpendSummary()).toEqual({
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
    });
  });
});

describe('formatCompactTokens', () => {
  it.each([
    [0, '0'],
    [1, '1'],
    [999, '999'],
    [1000, '1k'],
    [1500, '1.5k'],
    [9999, '10k'],
    [10000, '10k'],
    [99999, '100k'],
    [999999, '1000k'],
    [1000000, '1M'],
    [1500000, '1.5M'],
  ])('formats %d as %s', (input, expected) => {
    expect(formatCompactTokens(input)).toBe(expected);
  });
});

describe('formatUsd', () => {
  it('formats values >= 1 with 2 digits', () => {
    expect(formatUsd(1.5)).toBe('$1.50');
  });

  it('formats values >= 0.01 with 4 digits', () => {
    expect(formatUsd(0.05)).toBe('$0.0500');
  });

  it('formats small values with 6 digits', () => {
    expect(formatUsd(0.002982)).toBe('$0.002982');
  });

  it('prepends ~ when approximate', () => {
    expect(formatUsd(0.05, true)).toBe('~$0.0500');
  });
});

function createSpend(overrides?: Partial<LlmSpendSummary>): LlmSpendSummary {
  return {
    totalTokens: 4500,
    inputTokens: 1200,
    cacheWriteTokens: 350,
    cacheReadTokens: 890,
    outputTokens: 2060,
    totalUsd: 0.0123,
    uncachedUsd: 0.015,
    cacheEffectUsd: 0.0012,
    cacheEffectKind: 'saved',
    cacheWriteUsd: 0.001,
    cacheReadUsd: 0.0002,
    approximate: false,
    ...overrides,
  };
}

describe('formatSpendPrimary', () => {
  it('returns cost and compact tokens', () => {
    expect(formatSpendPrimary(createSpend())).toBe('$0.0123 · 4.5k tokens');
  });
});

describe('formatSpendSecondary', () => {
  it('returns compact token breakdown', () => {
    expect(formatSpendSecondary(createSpend())).toBe('in 1.2k · write 350 · read 890 · out 2.1k');
  });
});

describe('formatCacheEffectInline', () => {
  it('returns saved text with kind', () => {
    expect(formatCacheEffectInline(createSpend())).toEqual({
      text: 'saved $0.001200',
      kind: 'saved',
    });
  });

  it('returns overhead text with kind', () => {
    expect(formatCacheEffectInline(createSpend({ cacheEffectKind: 'overhead' }))).toEqual({
      text: 'overhead $0.001200',
      kind: 'overhead',
    });
  });

  it('returns null for neutral', () => {
    expect(formatCacheEffectInline(createSpend({ cacheEffectKind: 'neutral' }))).toBeNull();
  });

  it('returns null when effect is zero', () => {
    expect(formatCacheEffectInline(createSpend({ cacheEffectUsd: 0 }))).toBeNull();
  });
});

describe('log/debug formatting', () => {
  it('formats a usage log line with the model display name', () => {
    expect(
      formatModelUsageLog('claude-sonnet-4-6', {
        input_tokens: 120,
        cache_creation_input_tokens: 40,
        cache_read_input_tokens: 55,
        output_tokens: 9,
      }),
    ).toBe(
      'Claude Sonnet 4.6 usage: input_tokens=120, cache_creation_input_tokens=40, cache_read_input_tokens=55, output_tokens=9',
    );
  });

  it('formats a cost log line with six-decimal USD fields', () => {
    const cost = estimateLlmCost('claude-sonnet-4-6', {
      input_tokens: 100,
      cache_creation_input_tokens: 10,
      cache_read_input_tokens: 5,
      output_tokens: 8,
    });
    expect(formatModelCostLog(cost)).toBe(
      'Claude Sonnet 4.6 cost: model=anthropic:claude-sonnet-4-6, total_usd=0.000460, input_usd=0.000300, cache_write_5m_usd=0.000038, cache_write_1h_usd=0.000000, cache_read_usd=0.000002, output_usd=0.000120, approximate=true',
    );
  });

  it('formats an inline cost summary string', () => {
    const cost = estimateLlmCost('anthropic:claude-opus-4-6', {
      input_tokens: 1_000_000,
      cache_creation_input_tokens: 1_000_000,
      cache_read_input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cache_creation: {
        ephemeral_5m_input_tokens: 500_000,
        ephemeral_1h_input_tokens: 500_000,
      },
    });
    expect(formatLlmCostSummary(cost)).toBe(
      'total $38.63 • input $5.00 • write $8.13 • read $0.5000 • output $25.00',
    );
  });
});
