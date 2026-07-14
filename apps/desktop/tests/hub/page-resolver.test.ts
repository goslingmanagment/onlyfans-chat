// Account → page-label resolution (SPEC §8.5): manual override beats the
// shared auto-match, unknown/ambiguous resolves null (callers skip silently),
// and the pages list is cached with a ~5 min TTL.

import { describe, expect, it, vi } from 'vitest';
import type { HubPage } from '@chatgoose/shared/hub/index';
import { createPageLabelResolver, PAGE_LIST_CACHE_TTL_MS } from '@main/hub/page-resolver';
import { ACCT, hubPage } from './helpers';

function makeResolver(options: {
  pages?: HubPage[];
  overrides?: Record<string, string>;
  username?: string | null;
  listPages?: () => Promise<HubPage[]>;
  now?: () => number;
}) {
  const listPages = vi.fn(options.listPages ?? (() => Promise.resolve(options.pages ?? [hubPage()])));
  const resolver = createPageLabelResolver({
    listPages,
    // 'username' explicitly set to null must pass through (missing account row).
    getAccountUsername: () => ('username' in options ? options.username ?? null : 'loravie'),
    getOverrides: () => options.overrides ?? {},
    ...(options.now !== undefined ? { now: options.now } : {}),
  });
  return { resolver, listPages };
}

describe('createPageLabelResolver', () => {
  it('auto-matches by normalized username', async () => {
    const { resolver } = makeResolver({ pages: [hubPage({ username: '@LoraVie', label: 'Lora' })] });
    await expect(resolver.resolve(ACCT)).resolves.toBe('Lora');
  });

  it('manual override beats the auto-match and skips the pages fetch', async () => {
    const { resolver, listPages } = makeResolver({
      overrides: { [ACCT]: 'CustomLabel' },
      pages: [hubPage({ label: 'Lora' })],
    });
    await expect(resolver.resolve(ACCT)).resolves.toBe('CustomLabel');
    expect(listPages).not.toHaveBeenCalled();
  });

  it('an empty/whitespace override falls back to auto-match', async () => {
    const { resolver } = makeResolver({
      overrides: { [ACCT]: '   ' },
      pages: [hubPage({ label: 'Lora' })],
    });
    await expect(resolver.resolve(ACCT)).resolves.toBe('Lora');
  });

  it('unknown account resolves null — never guesses', async () => {
    const { resolver } = makeResolver({ username: 'nobody_matches' });
    await expect(resolver.resolve(ACCT)).resolves.toBeNull();
  });

  it('missing local account row resolves null without fetching pages', async () => {
    const { resolver, listPages } = makeResolver({ username: null });
    await expect(resolver.resolve(ACCT)).resolves.toBeNull();
    expect(listPages).not.toHaveBeenCalled();
  });

  it('caches the pages list inside the TTL and refetches after expiry', async () => {
    let nowMs = 0;
    let pageLabel = 'Lora';
    const { resolver, listPages } = makeResolver({
      now: () => nowMs,
      listPages: () => Promise.resolve([hubPage({ label: pageLabel })]),
    });
    await expect(resolver.resolve(ACCT)).resolves.toBe('Lora');
    await expect(resolver.resolve(ACCT)).resolves.toBe('Lora');
    expect(listPages).toHaveBeenCalledTimes(1);

    nowMs = PAGE_LIST_CACHE_TTL_MS; // exactly at TTL = expired
    pageLabel = 'Renamed';
    await expect(resolver.resolve(ACCT)).resolves.toBe('Renamed');
    expect(listPages).toHaveBeenCalledTimes(2);
  });

  it('concurrent resolves share one in-flight pages request', async () => {
    const { resolver, listPages } = makeResolver({});
    await Promise.all([resolver.resolve(ACCT), resolver.resolve(ACCT), resolver.resolve(ACCT)]);
    expect(listPages).toHaveBeenCalledTimes(1);
  });

  it('re-reads a manual override after an awaited page-list request', async () => {
    let overrides: Record<string, string> = {};
    let release!: (pages: HubPage[]) => void;
    const resolver = createPageLabelResolver({
      listPages: () => new Promise<HubPage[]>((resolve) => {
        release = resolve;
      }),
      getAccountUsername: () => 'loravie',
      getOverrides: () => overrides,
    });
    const pending = resolver.resolve(ACCT);
    overrides = { [ACCT]: 'NewOverride' };
    release([hubPage({ username: 'loravie', label: 'OldHeuristic' })]);

    await expect(pending).resolves.toBe('NewOverride');
    expect(resolver.current(ACCT)).toBe('NewOverride');
  });

  it('a failed pages fetch resolves null instead of throwing', async () => {
    const { resolver } = makeResolver({ listPages: () => Promise.reject(new Error('hub down')) });
    await expect(resolver.resolve(ACCT)).resolves.toBeNull();
  });

  it('falls back to the stale cache when a refetch fails', async () => {
    let nowMs = 0;
    let fail = false;
    const { resolver } = makeResolver({
      now: () => nowMs,
      listPages: () =>
        fail ? Promise.reject(new Error('hub down')) : Promise.resolve([hubPage({ label: 'Lora' })]),
    });
    await expect(resolver.resolve(ACCT)).resolves.toBe('Lora');
    nowMs = PAGE_LIST_CACHE_TTL_MS + 1;
    fail = true;
    await expect(resolver.resolve(ACCT)).resolves.toBe('Lora');
  });
});
