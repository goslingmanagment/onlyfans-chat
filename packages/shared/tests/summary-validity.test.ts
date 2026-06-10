import { describe, expect, it, vi } from 'vitest';

// Fallback double for the llm module's modelSelectionsEquivalent (legacy semantics:
// trim, canonical ids pass through, bare Anthropic provider ids map to canonical
// `anthropic:` ids, unknown ids normalize to null and never match).
vi.mock('../src/llm/model-registry', () => {
  const canonicalIds = new Set([
    'anthropic:claude-opus-4-6',
    'anthropic:claude-sonnet-4-6',
    'openrouter:x-ai/grok-4.3',
  ]);
  const bareAnthropicAliases = new Map([
    ['claude-opus-4-6', 'anthropic:claude-opus-4-6'],
    ['claude-sonnet-4-6', 'anthropic:claude-sonnet-4-6'],
  ]);
  const normalize = (id: string | null | undefined): string | null => {
    const candidate = id?.trim();
    if (!candidate) {
      return null;
    }
    if (canonicalIds.has(candidate)) {
      return candidate;
    }
    return bareAnthropicAliases.get(candidate) ?? null;
  };
  return {
    modelSelectionsEquivalent: (
      left: string | null | undefined,
      right: string | null | undefined,
    ): boolean => {
      const normalizedLeft = normalize(left);
      const normalizedRight = normalize(right);
      return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
    },
  };
});

import {
  SUMMARY_EVICTION_BATCH,
  collectSummaryCacheEntries,
  invalidSummaryCacheKeys,
  isValidSummaryCacheEntry,
  normalizeSummaryCacheEntry,
  oldestSummaryCacheKeys,
  selectSummaryEvictionKeys,
} from '../src/summary/validity';
import type { SummaryCacheEntry, SummaryRow } from '../src/summary/validity';

const validEntry: SummaryCacheEntry = {
  body: 'Cached',
  personalityId: 'p1',
  personalityUpdatedAt: 123,
  generatedAt: 456,
  spendingVerified: true,
  subscriptionVerified: true,
  modelId: 'anthropic:claude-opus-4-6',
};

describe('summary cache staleness matrix', () => {
  it('accepts an entry matching on every dimension', () => {
    expect(isValidSummaryCacheEntry(validEntry, 'p1', 123, 'anthropic:claude-opus-4-6')).toBe(true);
  });

  it('treats legacy bare Claude ids as equivalent to canonical Anthropic selections', () => {
    expect(
      isValidSummaryCacheEntry(
        { ...validEntry, modelId: 'claude-opus-4-6' },
        'p1',
        123,
        'anthropic:claude-opus-4-6',
      ),
    ).toBe(true);
  });

  it('matches when both sides hold the same legacy bare id', () => {
    expect(
      isValidSummaryCacheEntry({ ...validEntry, modelId: 'claude-opus-4-6' }, 'p1', 123, 'claude-opus-4-6'),
    ).toBe(true);
  });

  it('rejects a missing entry', () => {
    expect(isValidSummaryCacheEntry(null, 'p1', 123, 'anthropic:claude-opus-4-6')).toBe(false);
    expect(isValidSummaryCacheEntry(undefined, 'p1', 123, 'anthropic:claude-opus-4-6')).toBe(false);
  });

  it('rejects when the personality differs', () => {
    expect(isValidSummaryCacheEntry(validEntry, 'p2', 123, 'anthropic:claude-opus-4-6')).toBe(false);
  });

  it('rejects when the personality was edited after generation', () => {
    expect(isValidSummaryCacheEntry(validEntry, 'p1', 124, 'anthropic:claude-opus-4-6')).toBe(false);
  });

  it('rejects when the selected model differs', () => {
    expect(isValidSummaryCacheEntry(validEntry, 'p1', 123, 'anthropic:claude-sonnet-4-6')).toBe(false);
  });

  it('rejects when the entry recorded no model', () => {
    const { modelId: _modelId, ...withoutModel } = validEntry;
    expect(isValidSummaryCacheEntry(withoutModel, 'p1', 123, 'anthropic:claude-opus-4-6')).toBe(false);
  });

  it('rejects when the recorded model is unknown to the registry', () => {
    expect(
      isValidSummaryCacheEntry(
        { ...validEntry, modelId: 'mystery-model' },
        'p1',
        123,
        'anthropic:claude-opus-4-6',
      ),
    ).toBe(false);
  });

  it('rejects unless spending data was verified', () => {
    expect(
      isValidSummaryCacheEntry(
        { ...validEntry, spendingVerified: false },
        'p1',
        123,
        'anthropic:claude-opus-4-6',
      ),
    ).toBe(false);

    const { spendingVerified: _spending, ...withoutFlag } = validEntry;
    expect(isValidSummaryCacheEntry(withoutFlag, 'p1', 123, 'anthropic:claude-opus-4-6')).toBe(false);
  });

  it('rejects unless the subscription lookup was verified', () => {
    expect(
      isValidSummaryCacheEntry(
        { ...validEntry, subscriptionVerified: false },
        'p1',
        123,
        'anthropic:claude-opus-4-6',
      ),
    ).toBe(false);

    const { subscriptionVerified: _subscription, ...withoutFlag } = validEntry;
    expect(isValidSummaryCacheEntry(withoutFlag, 'p1', 123, 'anthropic:claude-opus-4-6')).toBe(false);
  });
});

describe('summary cache boundaries', () => {
  it('normalizes valid entries and drops corrupt summary cache values', () => {
    expect(normalizeSummaryCacheEntry(validEntry)).toEqual(validEntry);
    expect(normalizeSummaryCacheEntry({ body: 'missing metadata' })).toBeNull();

    const entries = collectSummaryCacheEntries([
      ['group-1', validEntry],
      ['group-2', { body: 'missing metadata' }],
    ]);

    expect(entries).toEqual(new Map([['group-1', validEntry]]));
    expect(entries.get('group-2')).toBeUndefined();
  });

  it('rejects non-object and missing values', () => {
    expect(normalizeSummaryCacheEntry(null)).toBeNull();
    expect(normalizeSummaryCacheEntry(undefined)).toBeNull();
    expect(normalizeSummaryCacheEntry('Cached')).toBeNull();
    expect(normalizeSummaryCacheEntry({ ...validEntry, generatedAt: Number.NaN })).toBeNull();
  });

  it('drops wrong-typed optional fields without treating the entry as corrupt', () => {
    expect(
      normalizeSummaryCacheEntry({
        ...validEntry,
        spendingVerified: 'yes',
        subscriptionVerified: 1,
        modelId: 42,
        hubSyncState: 'synced',
      }),
    ).toEqual({
      body: 'Cached',
      personalityId: 'p1',
      personalityUpdatedAt: 123,
      generatedAt: 456,
    });
  });

  it('carries hub sync state through normalization opaquely', () => {
    const hubSyncState = { state: 'synced', syncedAt: 789 };
    expect(normalizeSummaryCacheEntry({ ...validEntry, hubSyncState })).toEqual({
      ...validEntry,
      hubSyncState,
    });
  });

  it('lists corrupt raw entries separately from normalized cache entries', () => {
    expect(
      invalidSummaryCacheKeys([
        ['group-1', validEntry],
        ['group-2', { body: 'missing metadata', personalityId: 'p1' }],
      ]),
    ).toEqual(['group-2']);
  });
});

describe('summary cache eviction ordering', () => {
  it('selects the oldest valid entries for quota eviction', () => {
    expect(
      oldestSummaryCacheKeys(
        [
          ['new', { ...validEntry, generatedAt: 300 }],
          ['old', { ...validEntry, generatedAt: 100 }],
          ['corrupt', { body: 'bad' }],
          ['middle', { ...validEntry, generatedAt: 200 }],
        ],
        2,
      ),
    ).toEqual(['old', 'middle']);
  });

  it('prefers invalid raw entries before valid entries when selecting eviction keys', () => {
    expect(
      selectSummaryEvictionKeys(
        [
          ['new', { ...validEntry, generatedAt: 300 }],
          ['old', { ...validEntry, generatedAt: 100 }],
          ['corrupt', { body: 'bad' }],
        ],
        2,
      ),
    ).toEqual(['corrupt', 'old']);
  });

  it('evicts the oldest entry when one slot is needed', () => {
    expect(
      selectSummaryEvictionKeys(
        [
          ['old', { ...validEntry, generatedAt: 100 }],
          ['new', { ...validEntry, generatedAt: 200 }],
        ],
        1,
      ),
    ).toEqual(['old']);
  });

  it('evicts raw corrupt entries when not enough valid summaries exist', () => {
    expect(selectSummaryEvictionKeys([['corrupt', { body: 'bad', personalityId: 'p1' }]], 1)).toEqual([
      'corrupt',
    ]);
  });

  it('returns nothing for a non-positive batch size', () => {
    const rows: Array<SummaryRow<string>> = [['old', { ...validEntry, generatedAt: 100 }]];
    expect(selectSummaryEvictionKeys(rows, 0)).toEqual([]);
    expect(selectSummaryEvictionKeys(rows, -1)).toEqual([]);
  });

  it('defaults to a batch of 10', () => {
    expect(SUMMARY_EVICTION_BATCH).toBe(10);

    const rows: Array<SummaryRow<string>> = Array.from({ length: 12 }, (_, index) => [
      `g${index}`,
      { ...validEntry, generatedAt: 1000 - index },
    ]);

    expect(selectSummaryEvictionKeys(rows)).toEqual([
      'g11', 'g10', 'g9', 'g8', 'g7', 'g6', 'g5', 'g4', 'g3', 'g2',
    ]);
  });
});
