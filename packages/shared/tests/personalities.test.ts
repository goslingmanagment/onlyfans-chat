import { describe, expect, it } from 'vitest';
import {
  BUNDLED_LORA_PERSONALITY_ID,
  BUNDLED_LORA_PERSONALITY_VERSION,
  createBundledPersonalities,
  normalizeSavedPersonality,
  reconcileBundledPersonalities,
} from '../src/prompts/personalities';
import type { Personality } from '../src/types';

function bundledLora(): Personality {
  const [lora] = createBundledPersonalities();
  if (!lora) {
    throw new Error('Expected bundled Lora personality');
  }
  return lora;
}

describe('createBundledPersonalities', () => {
  it('bundles Lora with the builtin id and version', () => {
    const lora = bundledLora();
    expect(lora.id).toBe(BUNDLED_LORA_PERSONALITY_ID);
    expect(lora.id).toBe('builtin:lora');
    expect(lora.name).toBe('Lora');
    expect(lora.builtin).toBe(true);
    expect(lora.builtinVersion).toBe(BUNDLED_LORA_PERSONALITY_VERSION);
    expect(lora.builtinVersion).toBe(2);
  });

  it('defaults updatedAt to 0 and honors the provided build timestamp', () => {
    expect(bundledLora().updatedAt).toBe(0);
    const [lora] = createBundledPersonalities(1750000000000);
    expect(lora?.updatedAt).toBe(1750000000000);
  });

  it('carries the platform rename (no Fansly mentions)', () => {
    const lora = bundledLora();
    expect(lora.content).not.toMatch(/fansly/i);
    expect(lora.content).toContain("You're on OnlyFans because honestly?");
  });

  // Legacy behavior fact: bundled content must answer pricing questions
  // without fabricating numbers — no leftover TODO placeholders.
  it('does not leak TODO pricing placeholders from bundled personalities', () => {
    const bundledContent = createBundledPersonalities()
      .map((personality) => personality.content)
      .join('\n');

    expect(bundledContent).not.toContain('[TODO: fill in actual prices]');
    expect(bundledContent).not.toContain('Prices: [TODO');
    expect(bundledContent).toContain('without making up numbers');
  });

  it('returns fresh objects on every call (callers may mutate safely)', () => {
    const first = bundledLora();
    first.name = 'mutated';
    expect(bundledLora().name).toBe('Lora');
  });
});

describe('reconcileBundledPersonalities', () => {
  it('seeds bundled Lora when the list is empty', () => {
    const result = reconcileBundledPersonalities([]);
    expect(result.changed).toBe(true);
    expect(result.personalities).toEqual([bundledLora()]);
  });

  it('preserves modified bundled personalities until the bundled version changes', () => {
    const saved: Personality[] = [
      { ...bundledLora(), content: 'customized by user', updatedAt: 123 },
    ];
    const result = reconcileBundledPersonalities(saved);

    expect(result.changed).toBe(false);
    expect(result.personalities).toBe(saved);
    expect(result.personalities[0]).toMatchObject({
      id: BUNDLED_LORA_PERSONALITY_ID,
      builtin: true,
      builtinVersion: BUNDLED_LORA_PERSONALITY_VERSION,
      content: 'customized by user',
    });
  });

  it('re-adds bundled Lora when other personalities exist but the bundled entry is missing', () => {
    const custom: Personality = { id: 'custom-1', name: 'Custom', content: 'custom', updatedAt: 1000 };
    const saved = [custom];
    const result = reconcileBundledPersonalities(saved);

    expect(result.changed).toBe(true);
    expect(result.personalities).toEqual([custom, bundledLora()]);
    // The input array is not mutated.
    expect(saved).toEqual([custom]);
  });

  it('overwrites modified bundled personalities when the bundled version changes', () => {
    const lora = bundledLora();
    const result = reconcileBundledPersonalities([
      {
        ...lora,
        name: 'User Edited Lora',
        content: 'customized by user',
        updatedAt: 123,
        builtinVersion: (lora.builtinVersion ?? 0) - 1,
      },
    ]);

    expect(result.changed).toBe(true);
    expect(result.personalities).toEqual([lora]);
  });

  it('overwrites saved copies missing the builtin flag', () => {
    const lora = bundledLora();
    const stale: Personality = {
      id: lora.id,
      name: lora.name,
      content: 'old copy',
      updatedAt: 50,
    };
    const result = reconcileBundledPersonalities([stale]);
    expect(result.changed).toBe(true);
    expect(result.personalities).toEqual([lora]);
  });

  it('stamps re-seeded bundled entries with the provided build timestamp', () => {
    const result = reconcileBundledPersonalities([], 42);
    expect(result.personalities[0]?.updatedAt).toBe(42);
  });
});

describe('normalizeSavedPersonality', () => {
  it('trims names and defaults blank names to Unnamed', () => {
    const base: Personality = { id: 'p1', name: '  ', content: 'test', updatedAt: 1000 };
    expect(normalizeSavedPersonality(base).name).toBe('Unnamed');
    expect(normalizeSavedPersonality({ ...base, name: '  Trimmed  ' }).name).toBe('Trimmed');
  });

  it('keeps a valid updatedAt and repairs a missing/invalid one', () => {
    const valid = normalizeSavedPersonality({ id: 'p', name: 'P', content: 'c', updatedAt: 555 });
    expect(valid.updatedAt).toBe(555);

    const before = Date.now();
    const repaired = normalizeSavedPersonality({ id: 'p', name: 'P', content: 'c', updatedAt: 0 });
    expect(repaired.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('keeps builtin marker and finite builtinVersion on builtin personalities', () => {
    const normalized = normalizeSavedPersonality({
      id: 'builtin:lora',
      name: 'Lora',
      content: 'c',
      updatedAt: 10,
      builtin: true,
      builtinVersion: 2,
    });
    expect(normalized.builtin).toBe(true);
    expect(normalized.builtinVersion).toBe(2);
  });
});
