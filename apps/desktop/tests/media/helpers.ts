import type { MediaCacheQueries, MediaCacheRow } from '@main/media/cache';
import type { MediaUrlRegistry } from '@main/media/protocol';

export interface InMemoryMediaUrlRegistry extends MediaUrlRegistry {
  rows: Map<string, string>;
}

/** INSERT OR IGNORE semantics, like the media_urls table. */
export function createInMemoryMediaUrlRegistry(): InMemoryMediaUrlRegistry {
  const rows = new Map<string, string>();
  return {
    rows,
    register(urlHash, url) {
      if (!rows.has(urlHash)) rows.set(urlHash, url);
    },
    lookup(urlHash) {
      return rows.get(urlHash);
    },
  };
}

export interface InMemoryMediaCacheQueries extends MediaCacheQueries {
  rows: Map<string, MediaCacheRow>;
}

export function createInMemoryMediaCacheQueries(): InMemoryMediaCacheQueries {
  const rows = new Map<string, MediaCacheRow>();
  return {
    rows,
    get(urlHash) {
      const row = rows.get(urlHash);
      return row === undefined ? undefined : { ...row };
    },
    upsert(row) {
      rows.set(row.urlHash, { ...row });
    },
    touch(urlHash, lastAccessedAt) {
      const row = rows.get(urlHash);
      if (row !== undefined) row.lastAccessedAt = lastAccessedAt;
    },
    delete(urlHash) {
      rows.delete(urlHash);
    },
    totalBytes() {
      let total = 0;
      for (const row of rows.values()) total += row.bytes;
      return total;
    },
    evictionCandidates(limit) {
      return [...rows.values()]
        .sort((a, b) =>
          a.lastAccessedAt === b.lastAccessedAt
            ? a.urlHash.localeCompare(b.urlHash)
            : a.lastAccessedAt.localeCompare(b.lastAccessedAt),
        )
        .slice(0, limit)
        .map((row) => ({ ...row }));
    },
    clear() {
      rows.clear();
    },
  };
}

/** Deterministic clock: every call advances by one second. */
export function createTickingClock(startMs = Date.UTC(2026, 0, 1)): () => Date {
  let tick = 0;
  return () => new Date(startMs + ++tick * 1000);
}
