import { describe, expect, it } from 'vitest';
import { fuzzyFilter, fuzzyScore } from '../../src/renderer/src/lib/fuzzy';

describe('fuzzyScore', () => {
  it('returns null when the query is not a subsequence', () => {
    expect(fuzzyScore('xyz', 'Marcus K.')).toBeNull();
  });

  it('matches an empty query at score 0', () => {
    expect(fuzzyScore('', 'anything')).toBe(0);
    expect(fuzzyScore('   ', 'anything')).toBe(0);
  });

  it('is case-insensitive', () => {
    expect(fuzzyScore('MARC', 'marcus')).not.toBeNull();
    expect(fuzzyScore('marc', 'MARCUS')).not.toBeNull();
  });

  it('scores prefix matches above scattered matches', () => {
    const prefix = fuzzyScore('mar', 'marcus');
    const scattered = fuzzyScore('mar', 'mike arnold ray');
    expect(prefix).not.toBeNull();
    expect(scattered).not.toBeNull();
    expect(prefix ?? 0).toBeGreaterThan(scattered ?? 0);
  });

  it('rewards word-start matches', () => {
    const wordStart = fuzzyScore('k', 'marcus k.');
    const midWord = fuzzyScore('k', 'banker');
    expect(wordStart ?? 0).toBeGreaterThan(midWord ?? 0);
  });

  it('rewards consecutive runs', () => {
    const run = fuzzyScore('jake', 'jake_777');
    const spread = fuzzyScore('jake', 'j a k e zzz');
    expect(run ?? 0).toBeGreaterThan(spread ?? 0);
  });
});

describe('fuzzyFilter', () => {
  const names = ['Marcus K.', 'Daniel', 'jake_777', 'Tom H.', 'Mateo', 'mike_zero'];

  it('keeps original order for an empty query', () => {
    expect(fuzzyFilter(names, '', (n) => n)).toEqual(names);
  });

  it('filters out non-matches', () => {
    const out = fuzzyFilter(names, 'jake', (n) => n);
    expect(out).toEqual(['jake_777']);
  });

  it('ranks better matches first', () => {
    const out = fuzzyFilter(names, 'ma', (n) => n);
    expect(out).toContain('Marcus K.');
    expect(out).toContain('Mateo');
    const exact = fuzzyFilter(names, 'marc', (n) => n);
    expect(exact[0]).toBe('Marcus K.');
  });

  it('respects the limit', () => {
    const out = fuzzyFilter(names, '', (n) => n, 2);
    expect(out).toHaveLength(2);
  });
});
