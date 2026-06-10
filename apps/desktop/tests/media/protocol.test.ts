import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMediaRequestHandler,
  MEDIA_SCHEME,
  parseMediaUrl,
  registerMediaProtocol,
  toMediaUrl,
} from '@main/media/protocol';
import type { MediaRequestHandler } from '@main/media/protocol';
import { createInMemoryMediaCacheQueries } from './helpers';

describe('media:// URL mapping', () => {
  const SAMPLE_URLS = [
    'https://thumbs.onlyfans.com/abc/thumb.jpg?Expires=123&Signature=x~y_z-9',
    'https://cdn2.onlyfans.com/files/v/video.mp4?ses=1&sig=a%2Fb',
    'https://public.onlyfans.com/files/avatar.jpg',
    // bytes chosen so base64url output exercises '-' and '_'
    'https://x.test/?q=' + encodeURIComponent('ÿþ~~??>>'),
  ];

  it('roundtrips remote URLs through urlsafe base64', () => {
    for (const url of SAMPLE_URLS) {
      const mediaUrl = toMediaUrl(url);
      expect(mediaUrl.startsWith('media://')).toBe(true);
      const payload = mediaUrl.slice('media://'.length);
      expect(payload).toMatch(/^[A-Za-z0-9_-]+$/); // urlsafe alphabet, no padding
      expect(parseMediaUrl(mediaUrl)).toBe(url);
    }
  });

  it('tolerates a trailing slash and query/fragment appended by URL normalization', () => {
    const url = 'https://thumbs.onlyfans.com/a.jpg?sig=Q';
    const mediaUrl = toMediaUrl(url);
    expect(parseMediaUrl(`${mediaUrl}/`)).toBe(url);
    expect(parseMediaUrl(`${mediaUrl}?x=1`)).toBe(url);
    expect(parseMediaUrl(`${mediaUrl}#frag`)).toBe(url);
  });

  it('rejects malformed or non-http(s) inputs', () => {
    expect(parseMediaUrl('https://example.com/x')).toBeNull(); // wrong scheme
    expect(parseMediaUrl('media://')).toBeNull(); // empty payload
    expect(parseMediaUrl('media://not+base64url!')).toBeNull(); // invalid alphabet
    expect(parseMediaUrl(`media://${Buffer.from('not a url').toString('base64url')}`)).toBeNull();
    expect(
      parseMediaUrl(`media://${Buffer.from('file:///etc/passwd').toString('base64url')}`),
    ).toBeNull();
    expect(
      parseMediaUrl(`media://${Buffer.from('ftp://h/x').toString('base64url')}`),
    ).toBeNull();
  });
});

interface FakeCacheEntry {
  data: Buffer;
  contentType: string | null;
}

function createFakeCache() {
  const entries = new Map<string, FakeCacheEntry>();
  return {
    entries,
    get: (remoteUrl: string) => Promise.resolve(entries.get(remoteUrl) ?? null),
    put: (remoteUrl: string, data: Uint8Array, contentType: string | null) => {
      entries.set(remoteUrl, { data: Buffer.from(data), contentType });
      return Promise.resolve();
    },
  };
}

describe('media request handler', () => {
  const REMOTE = 'https://thumbs.onlyfans.com/t.jpg?sig=S';

  it('serves a cache hit without touching the network', async () => {
    const cache = createFakeCache();
    cache.entries.set(REMOTE, { data: Buffer.from('cached-bytes'), contentType: 'image/jpeg' });
    const fetchRemote = vi.fn();
    const handler = createMediaRequestHandler({ cache, fetchRemote });

    const res = await handler({ url: toMediaUrl(REMOTE) });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('x-chatgoose-cache')).toBe('hit');
    expect(Buffer.from(await res.arrayBuffer()).toString('utf8')).toBe('cached-bytes');
    expect(fetchRemote).not.toHaveBeenCalled();
  });

  it('fetches on miss, caches, and serves from cache afterwards', async () => {
    const cache = createFakeCache();
    const fetchRemote = vi
      .fn<(url: string) => Promise<{ data: Uint8Array; contentType: string | null } | null>>()
      .mockResolvedValue({ data: Buffer.from('fresh-bytes'), contentType: 'image/png' });
    const handler = createMediaRequestHandler({ cache, fetchRemote });

    const first = await handler({ url: toMediaUrl(REMOTE) });
    expect(first.status).toBe(200);
    expect(first.headers.get('x-chatgoose-cache')).toBe('miss');
    expect(first.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await first.arrayBuffer()).toString('utf8')).toBe('fresh-bytes');
    expect(fetchRemote).toHaveBeenCalledExactlyOnceWith(REMOTE);

    const second = await handler({ url: toMediaUrl(REMOTE) });
    expect(second.headers.get('x-chatgoose-cache')).toBe('hit');
    expect(fetchRemote).toHaveBeenCalledTimes(1);
  });

  it('defaults the content type when unknown', async () => {
    const cache = createFakeCache();
    const fetchRemote = vi.fn().mockResolvedValue({ data: Buffer.from('x'), contentType: null });
    const handler = createMediaRequestHandler({ cache, fetchRemote });
    const res = await handler({ url: toMediaUrl(REMOTE) });
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
  });

  it('responds 400 to malformed media URLs', async () => {
    const handler = createMediaRequestHandler({ cache: createFakeCache(), fetchRemote: vi.fn() });
    expect((await handler({ url: 'media://!!!' })).status).toBe(400);
    expect((await handler({ url: 'https://nope' })).status).toBe(400);
  });

  it('responds 404 when the remote reports the media unavailable', async () => {
    const fetchRemote = vi.fn().mockResolvedValue(null);
    const handler = createMediaRequestHandler({ cache: createFakeCache(), fetchRemote });
    expect((await handler({ url: toMediaUrl(REMOTE) })).status).toBe(404);
  });

  it('responds 502 when the remote fetch throws', async () => {
    const fetchRemote = vi.fn().mockRejectedValue(new Error('network down'));
    const handler = createMediaRequestHandler({ cache: createFakeCache(), fetchRemote });
    expect((await handler({ url: toMediaUrl(REMOTE) })).status).toBe(502);
  });

  it('still serves the blob when the cache write fails', async () => {
    const cache = createFakeCache();
    cache.put = () => Promise.reject(new Error('disk full'));
    const fetchRemote = vi.fn().mockResolvedValue({ data: Buffer.from('ok'), contentType: null });
    const handler = createMediaRequestHandler({ cache, fetchRemote });
    const res = await handler({ url: toMediaUrl(REMOTE) });
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).toString('utf8')).toBe('ok');
  });
});

describe('registerMediaProtocol (end-to-end with the real encrypted cache)', () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'cg-media-proto-'));
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it('registers the handler on the session and serves through the encrypted cache', async () => {
    const registered: Array<{ scheme: string; handler: MediaRequestHandler }> = [];
    const session = {
      protocol: {
        handle: (scheme: string, handler: MediaRequestHandler) => {
          registered.push({ scheme, handler });
        },
      },
    };
    const queries = createInMemoryMediaCacheQueries();
    const fetchRemote = vi
      .fn()
      .mockResolvedValue({ data: Buffer.from('proto-bytes'), contentType: 'image/webp' });

    registerMediaProtocol({
      session,
      cacheDir,
      encryptionKey: randomBytes(32),
      queries,
      fetchRemote,
    });

    expect(registered).toHaveLength(1);
    const first = registered[0];
    if (first === undefined) throw new Error('unreachable');
    expect(first.scheme).toBe(MEDIA_SCHEME);

    const remote = 'https://cdn2.onlyfans.com/x.webp?sig=1';
    const res = await first.handler({ url: toMediaUrl(remote) });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(Buffer.from(await res.arrayBuffer()).toString('utf8')).toBe('proto-bytes');

    // second request comes from the encrypted disk cache
    const res2 = await first.handler({ url: toMediaUrl(remote) });
    expect(res2.headers.get('x-chatgoose-cache')).toBe('hit');
    expect(Buffer.from(await res2.arrayBuffer()).toString('utf8')).toBe('proto-bytes');
    expect(fetchRemote).toHaveBeenCalledTimes(1);
  });
});
