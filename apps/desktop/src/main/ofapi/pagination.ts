// The four OFAPI pagination styles (research §6) behind one engine (SPEC §5).
// Hard page caps + inter-page delay are mandatory (legacy deep-fetch discipline).
// first_id pages BACKWARD into history; last_id+order=asc returns a
// boundary-INCLUSIVE ascending tail — both verified live 2026-06-10, which is why
// firstLastId always dedupes by id (SPEC §6.1 delta rule).

import { OFAPI_INTER_PAGE_DELAY_MS } from '@chatgoose/shared';
import type { SleepFn } from './rate-limiter';

const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export type PaginationWant<T> =
  | { kind: 'count'; count: number }
  | { kind: 'until'; predicate: (item: T) => boolean };

export interface PaginateOutcome<T> {
  items: T[];
  pages: number;
  /** Want satisfied (count reached / predicate hit) before cap or exhaustion. */
  satisfied: boolean;
  /** Upstream ran out of pages first. */
  exhausted: boolean;
}

export interface PaginateCommonOptions<T> {
  want: PaginationWant<T>;
  /** Hard cap; the engine never fetches more pages than this. */
  maxPages: number;
  /** Default OFAPI_INTER_PAGE_DELAY_MS (300 ms, legacy constant). */
  interPageDelayMs?: number;
  sleep?: SleepFn;
  /** Dedupe key; optional for offset/marker styles, enforced for firstLastId. */
  idOf?: (item: T) => string | number;
}

interface EngineOptions<T, C> extends PaginateCommonOptions<T> {
  fetchPage: (cursor: C | null) => Promise<{ items: T[]; next: C | null }>;
  /** Optional persisted continuation for a bounded multi-run walk. */
  startCursor?: C;
}

// For 'until': the whole page containing the match is kept (callers dedupe by id
// against their cache anyway); fetching just stops.
async function paginateEngine<T, C>(options: EngineOptions<T, C>): Promise<PaginateOutcome<T>> {
  const interPageDelayMs = options.interPageDelayMs ?? OFAPI_INTER_PAGE_DELAY_MS;
  const sleep = options.sleep ?? defaultSleep;
  const seen = new Set<string | number>();
  const items: T[] = [];
  let cursor: C | null = options.startCursor ?? null;
  let pages = 0;
  let satisfied = false;
  let exhausted = false;

  while (pages < options.maxPages) {
    if (pages > 0 && interPageDelayMs > 0) await sleep(interPageDelayMs);
    const page = await options.fetchPage(cursor);
    pages += 1;

    let appended = 0;
    for (const item of page.items) {
      if (options.idOf) {
        const id = options.idOf(item);
        if (seen.has(id)) continue;
        seen.add(id);
      }
      items.push(item);
      appended += 1;
      if (options.want.kind === 'until' && options.want.predicate(item)) satisfied = true;
    }
    if (options.want.kind === 'count' && items.length >= options.want.count) satisfied = true;
    if (satisfied) break;
    if (page.next === null) {
      exhausted = true;
      break;
    }
    // Boundary-inclusive styles: a page of only already-seen items means caught up.
    if (options.idOf && appended === 0) {
      exhausted = true;
      break;
    }
    cursor = page.next;
  }

  if (options.want.kind === 'count' && items.length > options.want.count) {
    items.length = options.want.count;
  }
  return { items, pages, satisfied, exhausted };
}

// ─── Style 1: `_pagination.next_page` cursor URL (chats, messages, tracking-links) ───

export function paginateNextPageUrl<T>(
  options: PaginateCommonOptions<T> & {
    /** Called with null for the first page, then each `next_page` URL. */
    fetchPage: (pageUrl: string | null) => Promise<{ items: T[]; nextPageUrl: string | null }>;
  },
): Promise<PaginateOutcome<T>> {
  const { fetchPage, ...common } = options;
  return paginateEngine<T, string>({
    ...common,
    fetchPage: async (cursor) => {
      const page = await fetchPage(cursor);
      return { items: page.items, next: page.nextPageUrl };
    },
  });
}

// ─── Style 2: limit/offset (fans, vault, user-lists, comments) ───

export function paginateLimitOffset<T>(
  options: PaginateCommonOptions<T> & {
    fetchPage: (offset: number) => Promise<{ items: T[]; hasMore?: boolean }>;
    pageSize: number;
    startOffset?: number;
  },
): Promise<PaginateOutcome<T>> {
  const { fetchPage, pageSize, startOffset, ...common } = options;
  return paginateEngine<T, number>({
    ...common,
    fetchPage: async (cursor) => {
      const offset = cursor ?? startOffset ?? 0;
      const page = await fetchPage(offset);
      const hasMore = page.hasMore ?? page.items.length >= pageSize;
      return { items: page.items, next: hasMore ? offset + pageSize : null };
    },
  });
}

// ─── Style 3: marker (transactions, story archive, message buyers) ───

export function paginateMarker<T>(
  options: PaginateCommonOptions<T> & {
    fetchPage: (
      marker: number | null,
    ) => Promise<{ items: T[]; nextMarker: number | null; hasMore?: boolean }>;
    /** Persisted marker from an earlier hard-cap termination. */
    startMarker?: number;
    /** Called after each valid page so long walks can durably checkpoint rows
     * and the next marker before a later request fails. */
    onPage?: (page: {
      items: T[];
      nextMarker: number | null;
      hasMore: boolean;
      pageNumber: number;
    }) => void | Promise<void>;
  },
): Promise<PaginateOutcome<T>> {
  const { fetchPage, startMarker, onPage, ...common } = options;
  let pageNumber = 0;
  return paginateEngine<T, number>({
    ...common,
    ...(startMarker !== undefined ? { startCursor: startMarker } : {}),
    fetchPage: async (cursor) => {
      const page = await fetchPage(cursor);
      const more = page.hasMore ?? page.nextMarker !== null;
      if (more && page.nextMarker === null) {
        throw new Error('marker pagination claimed more rows without a continuation marker');
      }
      pageNumber += 1;
      await onPage?.({
        items: page.items,
        nextMarker: page.nextMarker,
        hasMore: more,
        pageNumber,
      });
      return { items: page.items, next: more ? page.nextMarker : null };
    },
  });
}

// ─── Style 4: first_id / last_id (chat messages; direction-dependent) ───

export function paginateFirstLastId<T>(
  options: Omit<PaginateCommonOptions<T>, 'idOf'> & {
    /**
     * 'backward': first_id + order=desc, scrollback into history.
     * 'forward': last_id + order=asc, boundary-inclusive ascending tail (§6.1).
     */
    direction: 'backward' | 'forward';
    /** Receives null for the first page (or `startId` when provided). */
    fetchPage: (cursorId: string | null) => Promise<{ items: T[] }>;
    /** Required: boundary pages repeat the cursor message — dedupe by id. */
    idOf: (item: T) => string | number;
    startId?: string;
  },
): Promise<PaginateOutcome<T>> {
  const { fetchPage, idOf, startId, direction: _direction, ...common } = options;
  return paginateEngine<T, string>({
    ...common,
    idOf,
    fetchPage: async (cursor) => {
      const page = await fetchPage(cursor ?? startId ?? null);
      // Next cursor is the page's last item in both directions:
      // desc → oldest (next first_id), asc → newest (next last_id).
      const anchor = page.items[page.items.length - 1];
      return {
        items: page.items,
        next: anchor === undefined ? null : String(idOf(anchor)),
      };
    },
  });
}
