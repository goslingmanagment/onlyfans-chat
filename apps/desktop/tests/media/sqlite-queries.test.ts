// Exercises the better-sqlite3-backed media_cache queries against the real
// node-ABI driver build, including upgrading the db module's base schema
// (which lacks content_type / last_accessed_at) in place. Also covers the
// media_urls registry queries behind the opaque media:// token.

import { describe, expect, it } from 'vitest';
import { loadSqliteDriver } from '@main/db/driver';
import { createMediaUrlsQueries } from '@main/db/index';
import { createSqliteMediaCacheQueries } from '@main/media/cache';
import type { MediaCacheRow } from '@main/media/cache';
import { memoryDataLayer } from '../db/helpers';

function openMemoryDb() {
  const Driver = loadSqliteDriver('bsqlite3-mc-node');
  return new Driver(':memory:');
}

function row(overrides: Partial<MediaCacheRow> & { urlHash: string }): MediaCacheRow {
  return {
    path: `${overrides.urlHash}.bin`,
    contentType: 'image/jpeg',
    bytes: 100,
    fetchedAt: '2026-06-01T00:00:00.000Z',
    lastAccessedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('createSqliteMediaCacheQueries', () => {
  it('creates the table on a fresh db and roundtrips rows', () => {
    const queries = createSqliteMediaCacheQueries(openMemoryDb());
    expect(queries.get('h1')).toBeUndefined();
    expect(queries.totalBytes()).toBe(0);

    queries.upsert(row({ urlHash: 'h1', bytes: 40 }));
    queries.upsert(row({ urlHash: 'h2', bytes: 60, contentType: null }));
    expect(queries.totalBytes()).toBe(100);
    expect(queries.get('h1')).toEqual(row({ urlHash: 'h1', bytes: 40 }));
    expect(queries.get('h2')?.contentType).toBeNull();

    // upsert replaces
    queries.upsert(row({ urlHash: 'h1', bytes: 50, contentType: 'image/png' }));
    expect(queries.get('h1')?.bytes).toBe(50);
    expect(queries.get('h1')?.contentType).toBe('image/png');

    queries.delete('h2');
    expect(queries.get('h2')).toBeUndefined();
    expect(queries.totalBytes()).toBe(50);

    queries.clear();
    expect(queries.totalBytes()).toBe(0);
  });

  it('orders eviction candidates by last access, then touch moves an entry back', () => {
    const queries = createSqliteMediaCacheQueries(openMemoryDb());
    queries.upsert(row({ urlHash: 'a', lastAccessedAt: '2026-06-01T00:00:01.000Z' }));
    queries.upsert(row({ urlHash: 'b', lastAccessedAt: '2026-06-01T00:00:02.000Z' }));
    queries.upsert(row({ urlHash: 'c', lastAccessedAt: '2026-06-01T00:00:03.000Z' }));

    expect(queries.evictionCandidates(2).map((r) => r.urlHash)).toEqual(['a', 'b']);

    queries.touch('a', '2026-06-01T00:00:09.000Z');
    expect(queries.evictionCandidates(3).map((r) => r.urlHash)).toEqual(['b', 'c', 'a']);
  });

  it("upgrades the db module's base media_cache schema in place", () => {
    const db = openMemoryDb();
    // SPEC §10 / src/main/db/schema.ts shape (no content_type, no last_accessed_at)
    db.exec(
      `CREATE TABLE media_cache (
        url_hash TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        bytes INTEGER NOT NULL,
        fetched_at TEXT NOT NULL
      )`,
    );
    db.exec(
      "INSERT INTO media_cache (url_hash, path, bytes, fetched_at) " +
        "VALUES ('old', 'old.bin', 10, '2026-01-01T00:00:00.000Z')",
    );

    const queries = createSqliteMediaCacheQueries(db);
    const legacy = queries.get('old');
    expect(legacy).toBeDefined();
    expect(legacy?.contentType).toBeNull();
    expect(legacy?.lastAccessedAt).toBe('');

    queries.upsert(row({ urlHash: 'new', lastAccessedAt: '2026-06-01T00:00:01.000Z' }));
    // legacy rows ('' last access) are first in LRU order
    expect(queries.evictionCandidates(2).map((r) => r.urlHash)).toEqual(['old', 'new']);

    // running the factory twice is harmless
    const again = createSqliteMediaCacheQueries(db);
    expect(again.get('new')?.bytes).toBe(100);
  });
});

describe('createMediaUrlsQueries', () => {
  it('registers and looks up URL rows, stamping created_at', () => {
    const layer = memoryDataLayer();
    try {
      const queries = createMediaUrlsQueries(layer.db, () => new Date('2026-06-11T12:00:00.000Z'));
      expect(queries.lookup('h1')).toBeUndefined();

      queries.register('h1', 'https://thumbs.onlyfans.com/a.jpg?sig=1');
      expect(queries.lookup('h1')).toBe('https://thumbs.onlyfans.com/a.jpg?sig=1');

      const raw: unknown = layer.db
        .prepare('SELECT created_at FROM media_urls WHERE url_hash = @url_hash')
        .get({ url_hash: 'h1' });
      expect(raw).toEqual({ created_at: '2026-06-11T12:00:00.000Z' });
    } finally {
      layer.close();
    }
  });

  it('refreshes the URL when a stable hash is re-registered', () => {
    const layer = memoryDataLayer();
    try {
      layer.mediaUrls.register('h1', 'https://thumbs.onlyfans.com/a.jpg');
      layer.mediaUrls.register('h1', 'https://thumbs.onlyfans.com/OTHER.jpg');
      expect(layer.mediaUrls.lookup('h1')).toBe('https://thumbs.onlyfans.com/OTHER.jpg');
    } finally {
      layer.close();
    }
  });

  it('deletes and clears registry rows for cache pruning', () => {
    const layer = memoryDataLayer();
    try {
      layer.mediaUrls.register('h1', 'https://thumbs.onlyfans.com/a.jpg');
      layer.mediaUrls.register('h2', 'https://thumbs.onlyfans.com/b.jpg');
      layer.mediaUrls.delete('h1');
      expect(layer.mediaUrls.lookup('h1')).toBeUndefined();
      expect(layer.mediaUrls.lookup('h2')).toBe('https://thumbs.onlyfans.com/b.jpg');
      layer.mediaUrls.clear();
      expect(layer.mediaUrls.lookup('h2')).toBeUndefined();
    } finally {
      layer.close();
    }
  });
});
