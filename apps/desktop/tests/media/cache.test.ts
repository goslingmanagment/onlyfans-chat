import { randomBytes } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createMediaCache,
  decryptBlob,
  encryptBlob,
  hashRemoteUrl,
  stableRemoteUrlKey,
} from '@main/media/cache';
import { createInMemoryMediaCacheQueries, createTickingClock } from './helpers';

const KEY = randomBytes(32);

describe('blob encryption (AES-256-GCM)', () => {
  it('roundtrips and produces ciphertext different from plaintext', () => {
    const plain = Buffer.from('jpeg-bytes-here-1234567890', 'utf8');
    const encrypted = encryptBlob(KEY, plain);
    expect(encrypted.includes(plain)).toBe(false);
    expect(decryptBlob(KEY, encrypted).equals(plain)).toBe(true);
  });

  it('rejects tampered ciphertext', () => {
    const encrypted = encryptBlob(KEY, Buffer.from('payload'));
    const lastIndex = encrypted.byteLength - 1;
    const lastByte = encrypted[lastIndex];
    if (lastByte === undefined) throw new Error('unreachable');
    encrypted[lastIndex] = lastByte ^ 0xff;
    expect(() => decryptBlob(KEY, encrypted)).toThrow();
  });

  it('rejects the wrong key', () => {
    const encrypted = encryptBlob(KEY, Buffer.from('payload'));
    expect(() => decryptBlob(randomBytes(32), encrypted)).toThrow();
  });

  it('rejects keys that are not 32 bytes', () => {
    expect(() => encryptBlob(randomBytes(16), Buffer.from('x'))).toThrow(/32 bytes/);
    expect(() => decryptBlob(randomBytes(31), Buffer.alloc(64))).toThrow(/32 bytes/);
  });

  it('rejects blobs shorter than iv+tag', () => {
    expect(() => decryptBlob(KEY, Buffer.alloc(10))).toThrow(/too short/);
  });
});

describe('media cache', () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'cg-media-'));
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  function setup(maxBytes?: number) {
    const queries = createInMemoryMediaCacheQueries();
    const cache = createMediaCache({
      cacheDir,
      encryptionKey: KEY,
      queries,
      now: createTickingClock(),
      ...(maxBytes !== undefined ? { maxBytes } : {}),
    });
    return { cache, queries };
  }

  it('put/get roundtrips data and content type', async () => {
    const { cache } = setup();
    const url = 'https://thumbs.onlyfans.com/a/b/thumb.jpg?sig=abc';
    const data = randomBytes(256);
    await cache.put(url, data, 'image/jpeg');
    const hit = await cache.get(url);
    expect(hit).not.toBeNull();
    expect(hit?.data.equals(Buffer.from(data))).toBe(true);
    expect(hit?.contentType).toBe('image/jpeg');
  });

  it('misses for unknown URLs', async () => {
    const { cache } = setup();
    expect(await cache.get('https://example.com/none.jpg')).toBeNull();
  });

  it('keys signed media by stable URL identity', async () => {
    const { cache, queries } = setup();
    const first = 'https://cdn2.onlyfans.com/files/x/full.jpg?sig=old#fragment';
    const rotated = 'https://cdn2.onlyfans.com/files/x/full.jpg?sig=new';
    const data = randomBytes(32);

    expect(stableRemoteUrlKey(first)).toBe('https://cdn2.onlyfans.com/files/x/full.jpg');
    expect(hashRemoteUrl(first)).toBe(hashRemoteUrl(rotated));

    await cache.put(first, data, 'image/jpeg');
    const hit = await cache.get(rotated);
    expect(hit?.data.equals(Buffer.from(data))).toBe(true);
    expect(queries.rows.size).toBe(1);
  });

  it('stores only encrypted bytes on disk (encrypt-at-rest proof)', async () => {
    const { cache, queries } = setup();
    const url = 'https://cdn2.onlyfans.com/files/x/full.jpg';
    const plain = Buffer.from('PLAINTEXT-MEDIA-MARKER-'.repeat(8), 'utf8');
    await cache.put(url, plain, 'image/jpeg');

    const row = queries.rows.get(hashRemoteUrl(url));
    expect(row).toBeDefined();
    if (row === undefined) throw new Error('unreachable');
    const fileBytes = await readFile(join(cacheDir, row.path));
    expect(fileBytes.equals(plain)).toBe(false);
    expect(fileBytes.includes(Buffer.from('PLAINTEXT-MEDIA-MARKER-', 'utf8'))).toBe(false);
    expect(row.bytes).toBe(fileBytes.byteLength);
    // decrypt roundtrip straight from disk
    expect(decryptBlob(KEY, fileBytes).equals(plain)).toBe(true);
  });

  it('evicts least-recently-accessed entries beyond maxBytes', async () => {
    // each entry: 100 plaintext + 28 overhead = 128 encrypted bytes; cap at 3 entries
    const { cache, queries } = setup(128 * 3);
    const urls = ['https://m/1', 'https://m/2', 'https://m/3'] as const;
    for (const url of urls) await cache.put(url, randomBytes(100), 'image/png');
    expect(queries.rows.size).toBe(3);

    await cache.get('https://m/1'); // bump 1 → LRU order now: 2, 3, 1

    await cache.put('https://m/4', randomBytes(100), 'image/png');
    expect(queries.rows.size).toBe(3);
    expect(queries.rows.has(hashRemoteUrl('https://m/2'))).toBe(false); // LRU evicted
    expect(queries.rows.has(hashRemoteUrl('https://m/1'))).toBe(true);
    expect(queries.rows.has(hashRemoteUrl('https://m/3'))).toBe(true);
    expect(queries.rows.has(hashRemoteUrl('https://m/4'))).toBe(true);

    // evicted blob is gone from disk too
    const files = await readdir(cacheDir);
    expect(files).not.toContain(`${hashRemoteUrl('https://m/2')}.bin`);
    expect(files.length).toBe(3);
  });

  it('notifies registry pruning when cache rows are evicted or healed', async () => {
    const queries = createInMemoryMediaCacheQueries();
    const pruned: string[] = [];
    const cache = createMediaCache({
      cacheDir,
      encryptionKey: KEY,
      queries,
      maxBytes: 128 * 2,
      now: createTickingClock(),
      onPruneUrlHash: (urlHash) => pruned.push(urlHash),
    });

    await cache.put('https://m/1', randomBytes(100), 'image/png');
    await cache.put('https://m/2', randomBytes(100), 'image/png');
    await cache.put('https://m/3', randomBytes(100), 'image/png');

    expect(pruned).toEqual([hashRemoteUrl('https://m/1')]);

    const row = queries.rows.get(hashRemoteUrl('https://m/2'));
    if (row === undefined) throw new Error('unreachable');
    await rm(join(cacheDir, row.path));
    expect(await cache.get('https://m/2')).toBeNull();
    expect(pruned).toEqual([hashRemoteUrl('https://m/1'), hashRemoteUrl('https://m/2')]);
  });

  it('never evicts the entry just written, even when oversized', async () => {
    const { cache, queries } = setup(64); // smaller than one encrypted blob
    await cache.put('https://m/big', randomBytes(100), null);
    expect(queries.rows.size).toBe(1);
    expect(await cache.get('https://m/big')).not.toBeNull();
  });

  it('heals a row whose file is missing', async () => {
    const { cache, queries } = setup();
    const url = 'https://m/ghost';
    await cache.put(url, randomBytes(10), null);
    const row = queries.rows.get(hashRemoteUrl(url));
    if (row === undefined) throw new Error('unreachable');
    await rm(join(cacheDir, row.path));
    expect(await cache.get(url)).toBeNull();
    expect(queries.rows.has(hashRemoteUrl(url))).toBe(false);
  });

  it('drops entries that fail decryption (e.g. key rotation)', async () => {
    const queries = createInMemoryMediaCacheQueries();
    const writer = createMediaCache({ cacheDir, encryptionKey: KEY, queries });
    const url = 'https://m/rotated';
    await writer.put(url, randomBytes(10), null);

    const reader = createMediaCache({ cacheDir, encryptionKey: randomBytes(32), queries });
    expect(await reader.get(url)).toBeNull();
    expect(queries.rows.has(hashRemoteUrl(url))).toBe(false);
    expect(await readdir(cacheDir)).toEqual([]);
  });

  it('refuses path-like row paths from storage', async () => {
    const { cache, queries } = setup();
    const url = 'https://m/evil';
    queries.rows.set(hashRemoteUrl(url), {
      urlHash: hashRemoteUrl(url),
      path: '../../etc/passwd',
      contentType: null,
      bytes: 1,
      fetchedAt: '2026-01-01T00:00:00.000Z',
      lastAccessedAt: '2026-01-01T00:00:00.000Z',
    });
    await expect(cache.get(url)).rejects.toThrow(/non-plain path/);
  });

  it('clear() empties rows and removes the cache dir contents', async () => {
    const queries = createInMemoryMediaCacheQueries();
    let cleared = false;
    const cache = createMediaCache({
      cacheDir,
      encryptionKey: KEY,
      queries,
      onClear: () => {
        cleared = true;
      },
    });
    await cache.put('https://m/a', randomBytes(10), null);
    await cache.put('https://m/b', randomBytes(10), null);
    await cache.clear();
    expect(queries.rows.size).toBe(0);
    expect(cleared).toBe(true);
    await expect(readdir(cacheDir)).rejects.toThrow(); // dir removed
  });
});
