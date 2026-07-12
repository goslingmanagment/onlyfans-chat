// Pagination adapter contracts (SPEC §5, research §6) over synthetic multi-page
// fixtures: count/until wants, hard page caps, inter-page delay, and the
// first_id/last_id boundary-inclusion + dedupe rules verified live (SPEC §6.1).

import { describe, expect, it } from 'vitest';
import {
  paginateFirstLastId,
  paginateLimitOffset,
  paginateMarker,
  paginateNextPageUrl,
} from '@main/ofapi/pagination';

interface Item {
  id: number;
}

const items = (ids: number[]): Item[] => ids.map((id) => ({ id }));

function sleepSpy(): { sleep: (ms: number) => Promise<void>; calls: number[] } {
  const calls: number[] = [];
  return {
    calls,
    sleep: (ms: number) => {
      calls.push(ms);
      return Promise.resolve();
    },
  };
}

describe('paginateNextPageUrl', () => {
  const pages: Record<string, { items: Item[]; nextPageUrl: string | null }> = {
    first: { items: items([1, 2, 3]), nextPageUrl: 'p2' },
    p2: { items: items([4, 5, 6]), nextPageUrl: 'p3' },
    p3: { items: items([7, 8]), nextPageUrl: null },
  };
  const fetchPage = (url: string | null) => Promise.resolve(pages[url ?? 'first'] ?? pages['first']!);

  it('walks next_page cursors until the count is satisfied', async () => {
    const { sleep } = sleepSpy();
    const result = await paginateNextPageUrl<Item>({
      fetchPage,
      want: { kind: 'count', count: 5 },
      maxPages: 10,
      sleep,
    });
    expect(result.items.map((i) => i.id)).toEqual([1, 2, 3, 4, 5]);
    expect(result.pages).toBe(2);
    expect(result.satisfied).toBe(true);
  });

  it('stops at exhaustion when count is not reached', async () => {
    const { sleep } = sleepSpy();
    const result = await paginateNextPageUrl<Item>({
      fetchPage,
      want: { kind: 'count', count: 100 },
      maxPages: 10,
      sleep,
    });
    expect(result.items).toHaveLength(8);
    expect(result.exhausted).toBe(true);
    expect(result.satisfied).toBe(false);
  });

  it('enforces the hard page cap', async () => {
    const { sleep } = sleepSpy();
    const result = await paginateNextPageUrl<Item>({
      fetchPage,
      want: { kind: 'count', count: 100 },
      maxPages: 2,
      sleep,
    });
    expect(result.pages).toBe(2);
    expect(result.items).toHaveLength(6);
    expect(result.satisfied).toBe(false);
    expect(result.exhausted).toBe(false);
  });

  it('applies the inter-page delay between pages (default 300 ms)', async () => {
    const { sleep, calls } = sleepSpy();
    await paginateNextPageUrl<Item>({
      fetchPage,
      want: { kind: 'count', count: 100 },
      maxPages: 10,
      sleep,
    });
    expect(calls).toEqual([300, 300]);
  });

  it("'until' stops fetching once the predicate hits", async () => {
    const { sleep, calls } = sleepSpy();
    const result = await paginateNextPageUrl<Item>({
      fetchPage,
      want: { kind: 'until', predicate: (item) => item.id === 4 },
      maxPages: 10,
      sleep,
    });
    // the page containing the match is kept whole; no further pages fetched
    expect(result.items.map((i) => i.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.pages).toBe(2);
    expect(result.satisfied).toBe(true);
    expect(calls).toEqual([300]);
  });
});

describe('paginateLimitOffset', () => {
  it('advances offsets by pageSize and honors hasMore', async () => {
    const offsets: number[] = [];
    const result = await paginateLimitOffset<Item>({
      fetchPage: (offset) => {
        offsets.push(offset);
        if (offset >= 4) return Promise.resolve({ items: items([offset + 1]), hasMore: false });
        return Promise.resolve({ items: items([offset + 1, offset + 2]), hasMore: true });
      },
      pageSize: 2,
      want: { kind: 'count', count: 100 },
      maxPages: 10,
      sleep: sleepSpy().sleep,
    });
    expect(offsets).toEqual([0, 2, 4]);
    expect(result.items.map((i) => i.id)).toEqual([1, 2, 3, 4, 5]);
    expect(result.exhausted).toBe(true);
  });

  it('infers hasMore from a full page when the flag is absent', async () => {
    let callCount = 0;
    const result = await paginateLimitOffset<Item>({
      fetchPage: (offset) => {
        callCount += 1;
        return Promise.resolve({ items: callCount <= 2 ? items([offset + 1, offset + 2]) : [] });
      },
      pageSize: 2,
      want: { kind: 'count', count: 100 },
      maxPages: 10,
      sleep: sleepSpy().sleep,
    });
    expect(result.items).toHaveLength(4);
    expect(callCount).toBe(3);
  });
});

describe('paginateMarker', () => {
  it('chains nextMarker until hasMore=false', async () => {
    const markers: Array<number | null> = [];
    const pages = new Map<number | null, { items: Item[]; nextMarker: number | null; hasMore: boolean }>([
      [null, { items: items([1, 2]), nextMarker: 900, hasMore: true }],
      [900, { items: items([3, 4]), nextMarker: 800, hasMore: true }],
      [800, { items: items([5]), nextMarker: null, hasMore: false }],
    ]);
    const result = await paginateMarker<Item>({
      fetchPage: (marker) => {
        markers.push(marker);
        const page = pages.get(marker);
        if (!page) throw new Error(`unexpected marker ${String(marker)}`);
        return Promise.resolve(page);
      },
      want: { kind: 'count', count: 100 },
      maxPages: 5,
      sleep: sleepSpy().sleep,
    });
    expect(markers).toEqual([null, 900, 800]);
    expect(result.items.map((i) => i.id)).toEqual([1, 2, 3, 4, 5]);
    expect(result.exhausted).toBe(true);
  });

  it('resumes from a persisted marker after an earlier hard cap', async () => {
    const markers: Array<number | null> = [];
    const result = await paginateMarker<Item>({
      startMarker: 800,
      fetchPage: (marker) => {
        markers.push(marker);
        return Promise.resolve({ items: items([5]), nextMarker: null, hasMore: false });
      },
      want: { kind: 'count', count: 100 },
      maxPages: 5,
      sleep: sleepSpy().sleep,
    });
    expect(markers).toEqual([800]);
    expect(result.items.map((item) => item.id)).toEqual([5]);
    expect(result.exhausted).toBe(true);
  });

  it('rejects a has-more response that omits its continuation marker', async () => {
    await expect(paginateMarker<Item>({
      fetchPage: () => Promise.resolve({ items: items([1]), nextMarker: null, hasMore: true }),
      want: { kind: 'count', count: 100 },
      maxPages: 5,
      sleep: sleepSpy().sleep,
    })).rejects.toThrow(/without a continuation marker/i);
  });
});

describe('paginateFirstLastId', () => {
  it('backward (first_id, order=desc): boundary-inclusive pages are deduped by id', async () => {
    const cursors: Array<string | null> = [];
    // desc pages; the next page STARTS AT the previous page's oldest id (inclusive)
    const pages = new Map<string | null, Item[]>([
      [null, items([100, 99, 98])],
      ['98', items([98, 97, 96])],
      ['96', items([96])], // caught up: boundary only
    ]);
    const result = await paginateFirstLastId<Item>({
      direction: 'backward',
      fetchPage: (cursor) => {
        cursors.push(cursor);
        return Promise.resolve({ items: pages.get(cursor) ?? [] });
      },
      idOf: (item) => item.id,
      want: { kind: 'count', count: 100 },
      maxPages: 10,
      sleep: sleepSpy().sleep,
    });
    expect(cursors).toEqual([null, '98', '96']);
    expect(result.items.map((i) => i.id)).toEqual([100, 99, 98, 97, 96]);
    expect(result.exhausted).toBe(true);
  });

  it('forward (last_id, order=asc): ascending boundary-inclusive tail, deduped', async () => {
    const cursors: Array<string | null> = [];
    const pages = new Map<string | null, Item[]>([
      ['50', items([50, 51, 52])], // last_id=50 returns the boundary id itself first (live-verified)
      ['52', items([52])],
    ]);
    const result = await paginateFirstLastId<Item>({
      direction: 'forward',
      startId: '50',
      fetchPage: (cursor) => {
        cursors.push(cursor);
        return Promise.resolve({ items: pages.get(cursor) ?? [] });
      },
      idOf: (item) => item.id,
      want: { kind: 'count', count: 100 },
      maxPages: 10,
      sleep: sleepSpy().sleep,
    });
    expect(cursors).toEqual(['50', '52']);
    expect(result.items.map((i) => i.id)).toEqual([50, 51, 52]);
    expect(result.exhausted).toBe(true);
  });

  it("'until' supports the §6.1 delta rule (stop at a cached boundary)", async () => {
    const result = await paginateFirstLastId<Item>({
      direction: 'backward',
      fetchPage: (cursor) =>
        Promise.resolve({ items: cursor === null ? items([10, 9, 8]) : items([8, 7, 6]) }),
      idOf: (item) => item.id,
      want: { kind: 'until', predicate: (item) => item.id <= 7 },
      maxPages: 10,
      sleep: sleepSpy().sleep,
    });
    expect(result.satisfied).toBe(true);
    expect(result.pages).toBe(2);
    expect(result.items.map((i) => i.id)).toEqual([10, 9, 8, 7, 6]);
  });

  it('hard page cap bounds an endless history', async () => {
    let next = 1000;
    const result = await paginateFirstLastId<Item>({
      direction: 'backward',
      fetchPage: () => {
        const page = items([next, next - 1]);
        next -= 2;
        return Promise.resolve({ items: page });
      },
      idOf: (item) => item.id,
      want: { kind: 'count', count: 10_000 },
      maxPages: 3,
      sleep: sleepSpy().sleep,
    });
    expect(result.pages).toBe(3);
    expect(result.items).toHaveLength(6);
    expect(result.satisfied).toBe(false);
  });
});
