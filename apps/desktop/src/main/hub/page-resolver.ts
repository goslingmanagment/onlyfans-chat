// OFAPI account → core page-label resolution (SPEC §8.5): the manual override
// (settings.accountPageLabels) wins; otherwise the shared single-match
// heuristic runs over a cached GET /api/v1/pages (TTL ~5 min). Unknown or
// ambiguous resolves null — hub callers skip silently rather than guess.

import { matchPageLabelForUsername } from '@chatgoose/shared/hub/index';
import type { HubPage } from '@chatgoose/shared/hub/index';

export const PAGE_LIST_CACHE_TTL_MS = 5 * 60_000;

export interface PageLabelResolverOptions {
  listPages: () => Promise<HubPage[]>;
  /** OnlyFans username of the local account row, or null when unknown. */
  getAccountUsername: (accountId: string) => string | null;
  /** Current settings.accountPageLabels map; synchronous routing fence. */
  getOverrides: () => Record<string, string>;
  now?: () => number;
}

export interface PageLabelResolver {
  resolve(accountId: string): Promise<string | null>;
  /** Current label from synchronous overrides/account identity + cached pages.
   * undefined means the page list has not been resolved yet. */
  current(accountId: string): string | null | undefined;
}

export function createPageLabelResolver(options: PageLabelResolverOptions): PageLabelResolver {
  const now = options.now ?? (() => Date.now());

  let cache: { pages: HubPage[]; fetchedAt: number } | null = null;
  let inFlight: Promise<HubPage[]> | null = null;

  async function getPages(): Promise<HubPage[] | null> {
    if (cache !== null && now() - cache.fetchedAt < PAGE_LIST_CACHE_TTL_MS) {
      return cache.pages;
    }
    if (inFlight === null) {
      // Concurrent resolves share one request; the slot frees on settle.
      inFlight = options.listPages().then(
        (pages) => {
          cache = { pages, fetchedAt: now() };
          inFlight = null;
          return pages;
        },
        (error: unknown) => {
          inFlight = null;
          throw error;
        },
      );
    }
    try {
      return await inFlight;
    } catch {
      // Fetch failure: an expired cache beats guessing nothing at all.
      return cache?.pages ?? null;
    }
  }

  function current(accountId: string): string | null | undefined {
    const overrides = options.getOverrides();
    const override = overrides[accountId]?.trim();
    if (override !== undefined && override !== '') {
      return override;
    }
    const username = options.getAccountUsername(accountId);
    if (username === null || username.trim() === '') {
      return null;
    }
    if (cache === null) {
      return undefined;
    }
    return matchPageLabelForUsername(username, cache.pages);
  }

  return {
    async resolve(accountId) {
      const override = options.getOverrides()[accountId]?.trim();
      if (override !== undefined && override !== '') {
        return override;
      }
      const username = options.getAccountUsername(accountId);
      if (username === null || username.trim() === '') {
        return null;
      }
      const pages = await getPages();
      if (pages === null) {
        return null;
      }
      // Re-read the synchronous override/account coordinates after the await.
      return current(accountId) ?? null;
    },
    current,
  };
}
