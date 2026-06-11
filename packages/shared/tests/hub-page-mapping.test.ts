import { describe, expect, it } from 'vitest';
import {
  matchAccountToPage,
  matchPageLabelForUsername,
  normalizeHubUsername,
  type PageMatchCandidate,
} from '../src/hub/page-mapping';

function page(overrides: Partial<PageMatchCandidate> & { label: string }): PageMatchCandidate {
  return { platform: 'onlyfans', modelSlug: null, username: null, ...overrides };
}

describe('normalizeHubUsername', () => {
  it('trims, strips leading @s, and lowercases (legacy rule)', () => {
    expect(normalizeHubUsername('  @StellaSky ')).toBe('stellasky');
    expect(normalizeHubUsername('@@double')).toBe('double');
    expect(normalizeHubUsername('Plain')).toBe('plain');
  });

  it('returns null for empty input', () => {
    expect(normalizeHubUsername('')).toBeNull();
    expect(normalizeHubUsername('@')).toBeNull();
    expect(normalizeHubUsername(null)).toBeNull();
    expect(normalizeHubUsername(undefined)).toBeNull();
  });
});

describe('matchPageLabelForUsername', () => {
  it('matches a single onlyfans page by username, case- and @-insensitive', () => {
    const pages = [
      page({ label: 'stella-of', username: '@StellaSky' }),
      page({ label: 'other-of', username: 'someoneelse' }),
    ];
    expect(matchPageLabelForUsername('stellasky', pages)).toBe('stella-of');
  });

  it('ignores pages on other platforms even when the username matches', () => {
    const pages = [page({ label: 'stella-fansly', platform: 'fansly', username: 'stellasky' })];
    expect(matchPageLabelForUsername('stellasky', pages)).toBeNull();
  });

  it('returns null when nothing matches', () => {
    const pages = [page({ label: 'a', username: 'x' }), page({ label: 'b', username: 'y' })];
    expect(matchPageLabelForUsername('stellasky', pages)).toBeNull();
  });

  it('returns null on ambiguity instead of guessing', () => {
    const pages = [
      page({ label: 'main', username: 'stellasky' }),
      page({ label: 'backup', username: '@STELLASKY' }),
    ];
    expect(matchPageLabelForUsername('stellasky', pages)).toBeNull();
  });

  it('falls back to modelSlug, then label, when usernames are missing', () => {
    const slugPages = [page({ label: 'page-1', modelSlug: 'StellaSky' }), page({ label: 'page-2', modelSlug: 'other' })];
    expect(matchPageLabelForUsername('stellasky', slugPages)).toBe('page-1');

    const labelPages = [page({ label: 'stellasky' }), page({ label: 'other' })];
    expect(matchPageLabelForUsername('stellasky', labelPages)).toBe('stellasky');
  });

  it('prefers a username match over a weaker-field match on another page', () => {
    const pages = [
      page({ label: 'real', username: 'stellasky' }),
      // A different page whose label happens to collide must not cause ambiguity.
      page({ label: 'stellasky', username: 'someoneelse' }),
    ];
    expect(matchPageLabelForUsername('stellasky', pages)).toBe('real');
  });

  it('does not fall through to weaker tiers when the strongest matching tier is ambiguous', () => {
    const pages = [
      page({ label: 'a', username: 'stellasky' }),
      page({ label: 'b', username: 'stellasky' }),
      page({ label: 'stellasky' }),
    ];
    expect(matchPageLabelForUsername('stellasky', pages)).toBeNull();
  });

  it('never matches on modelName/displayName-style fields or empty usernames', () => {
    const pages = [page({ label: 'a', username: '' }), page({ label: 'b', username: null })];
    expect(matchPageLabelForUsername('a', pages)).toBe('a');
  });
});

describe('matchAccountToPage', () => {
  it('maps each account id to its matched label or null', () => {
    const pages = [
      page({ label: 'stella-of', username: 'stellasky' }),
      page({ label: 'luna-of', username: 'lunamoon' }),
      page({ label: 'dup-1', username: 'twice' }),
      page({ label: 'dup-2', username: 'twice' }),
    ];
    const accounts = [
      { id: 'acct_1', username: '@StellaSky' },
      { id: 'acct_2', username: 'lunamoon' },
      { id: 'acct_3', username: 'twice' },
      { id: 'acct_4', username: 'unknown' },
    ];

    const result = matchAccountToPage(accounts, pages);

    expect(result.get('acct_1')).toBe('stella-of');
    expect(result.get('acct_2')).toBe('luna-of');
    expect(result.get('acct_3')).toBeNull();
    expect(result.get('acct_4')).toBeNull();
  });
});
