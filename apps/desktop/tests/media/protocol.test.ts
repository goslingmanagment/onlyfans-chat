import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMediaRequestHandler,
  createToMediaUrl,
  isAllowedMediaUrl,
  MEDIA_SCHEME,
  parseMediaToken,
  registerMediaProtocol,
  parseMediaRequester,
} from '@main/media/protocol';
import { hashRemoteUrl } from '@main/media/cache';
import type { MediaRequestHandler, OfapiMediaLoadResult } from '@main/media/protocol';
import { createInMemoryMediaCacheQueries, createInMemoryMediaUrlRegistry } from './helpers';

const ALLOWED_URLS = [
  'https://thumbs.onlyfans.com/abc/thumb.jpg?Expires=123&Signature=x~y_z-9',
  'https://cdn2.onlyfans.com/files/v/video.mp4?ses=1&sig=a%2Fb',
  'https://public.onlyfans.com/files/avatar.jpg',
  'https://onlyfans.com/files/bare-host.jpg',
  'https://cdn.fansapi.com/files/cached-thumb.jpg',
  'https://dl.fansapi.com/files/proxy-stream.mp4',
  'https://cdn2.fansapi.com/files/mixed-cache.jpg',
];

// Every shape the legacy reversible scheme would have happily round-tripped.
const REJECTED_URLS = [
  'https://x.test/?q=1',
  'http://localhost:8080/x',
  'http://127.0.0.1/x',
  'http://10.0.0.1/x',
  'http://thumbs.onlyfans.com/no-https.jpg', // https only, even on an OF host
  'http://cdn.fansapi.com/no-https.jpg',
  'https://evilonlyfans.com/x.jpg', // suffix must match a label boundary
  'https://onlyfans.com.evil.test/x.jpg',
  'https://evilfansapi.com/x.jpg',
  'https://fansapi.com.evil.test/x.jpg',
  'data:text/html,<script>alert(1)</script>',
  'file:///etc/passwd',
  'ftp://h/x',
  'not a url',
];

const TOKEN_RE = /^[0-9a-f]{64}$/;

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

describe('host allowlist', () => {
  it('accepts only https OnlyFans hosts', () => {
    for (const url of ALLOWED_URLS) expect(isAllowedMediaUrl(url)).toBe(true);
    for (const url of REJECTED_URLS) expect(isAllowedMediaUrl(url)).toBe(false);
  });
});

describe('media:// token minting', () => {
  it('mints opaque stable tokens and registers the signed URL', () => {
    const registry = createInMemoryMediaUrlRegistry();
    const toMediaUrl = createToMediaUrl(registry);
    for (const url of ALLOWED_URLS) {
      const mediaUrl = toMediaUrl(url);
      expect(mediaUrl).toBe(`${MEDIA_SCHEME}://${hashRemoteUrl(url)}`);
      const token = (mediaUrl ?? '').slice(`${MEDIA_SCHEME}://`.length);
      expect(token).toMatch(TOKEN_RE);
      // non-reversible: the token carries no URL bytes in any encoding
      expect(mediaUrl).not.toContain('onlyfans');
      expect(mediaUrl).not.toContain(Buffer.from(url, 'utf8').toString('base64url'));
      expect(registry.lookup(token)).toBe(url);
    }
    expect(registry.rows.size).toBe(ALLOWED_URLS.length);
  });

  it('mints NOTHING for non-allowlisted URLs and never registers them', () => {
    const registry = createInMemoryMediaUrlRegistry();
    const register = vi.spyOn(registry, 'register');
    const toMediaUrl = createToMediaUrl(registry);
    for (const url of REJECTED_URLS) {
      expect(toMediaUrl(url)).toBeNull();
    }
    expect(register).not.toHaveBeenCalled();
    expect(registry.rows.size).toBe(0);
  });

  it('keeps one stable token and refreshes rotated signed URLs', () => {
    const registry = createInMemoryMediaUrlRegistry();
    const toMediaUrl = createToMediaUrl(registry);
    const first = 'https://thumbs.onlyfans.com/a/thumb.jpg?sig=old';
    const rotated = 'https://thumbs.onlyfans.com/a/thumb.jpg?sig=new';
    const firstMedia = toMediaUrl(first);
    expect(toMediaUrl(rotated)).toBe(firstMedia);
    expect(registry.rows.size).toBe(1);
    expect(registry.lookup(hashRemoteUrl(first))).toBe(rotated);
  });
});

describe('parseMediaToken', () => {
  const TOKEN = sha256Hex('https://thumbs.onlyfans.com/a.jpg?sig=Q');

  it('accepts minted tokens, tolerating appended slash/query/fragment', () => {
    expect(parseMediaToken(`media://${TOKEN}`)).toBe(TOKEN);
    expect(parseMediaToken(`media://${TOKEN}/`)).toBe(TOKEN);
    expect(parseMediaToken(`media://${TOKEN}?x=1`)).toBe(TOKEN);
    expect(parseMediaToken(`media://${TOKEN}#frag`)).toBe(TOKEN);
  });

  it('rejects anything that is not a lowercase 64-hex token', () => {
    expect(parseMediaToken('media://')).toBeNull();
    expect(parseMediaToken(`media://${TOKEN.toUpperCase()}`)).toBeNull();
    expect(parseMediaToken(`media://${TOKEN.slice(0, 63)}`)).toBeNull();
    expect(parseMediaToken(`media://${TOKEN}0`)).toBeNull();
    expect(parseMediaToken(`https://${TOKEN}`)).toBeNull(); // wrong scheme
    expect(parseMediaToken('media://not+hex!')).toBeNull();
  });

  it('rejects legacy reversible base64url-of-URL payloads', () => {
    for (const url of [...ALLOWED_URLS, ...REJECTED_URLS]) {
      expect(parseMediaToken(`media://${Buffer.from(url, 'utf8').toString('base64url')}`)).toBeNull();
    }
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
    getByKey: (key: string) => Promise.resolve(entries.get(key) ?? null),
    putByKey: (key: string, data: Uint8Array, contentType: string | null) => {
      entries.set(key, { data: Buffer.from(data), contentType });
      return Promise.resolve();
    },
  };
}

describe('media request handler', () => {
  const REMOTE = 'https://thumbs.onlyfans.com/t.jpg?sig=S';

  function setup() {
    const registry = createInMemoryMediaUrlRegistry();
    const mediaUrl = createToMediaUrl(registry)(REMOTE);
    if (mediaUrl === null) throw new Error('unreachable');
    return { registry, mediaUrl };
  }

  it('serves a registered token from cache without touching the network', async () => {
    const { registry, mediaUrl } = setup();
    const cache = createFakeCache();
    cache.entries.set(REMOTE, { data: Buffer.from('cached-bytes'), contentType: 'image/jpeg' });
    const fetchRemote = vi.fn();
    const handler = createMediaRequestHandler({ registry, cache, fetchRemote });

    const res = await handler({ url: mediaUrl });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('x-chatgoose-cache')).toBe('hit');
    expect(Buffer.from(await res.arrayBuffer()).toString('utf8')).toBe('cached-bytes');
    expect(fetchRemote).not.toHaveBeenCalled();
  });

  it('fetches on miss, caches, and serves from cache afterwards', async () => {
    const { registry, mediaUrl } = setup();
    const cache = createFakeCache();
    const fetchRemote = vi
      .fn<(url: string) => Promise<{ data: Uint8Array; contentType: string | null } | null>>()
      .mockResolvedValue({ data: Buffer.from('fresh-bytes'), contentType: 'image/png' });
    const handler = createMediaRequestHandler({ registry, cache, fetchRemote });

    const first = await handler({ url: mediaUrl });
    expect(first.status).toBe(200);
    expect(first.headers.get('x-chatgoose-cache')).toBe('miss');
    expect(Buffer.from(await first.arrayBuffer()).toString('utf8')).toBe('fresh-bytes');
    expect(fetchRemote).toHaveBeenCalledExactlyOnceWith(REMOTE);

    const second = await handler({ url: mediaUrl });
    expect(second.headers.get('x-chatgoose-cache')).toBe('hit');
    expect(fetchRemote).toHaveBeenCalledTimes(1);
  });

  it('fetches the latest signed URL registered for a stable token', async () => {
    const registry = createInMemoryMediaUrlRegistry();
    const first = 'https://thumbs.onlyfans.com/t.jpg?sig=old';
    const rotated = 'https://thumbs.onlyfans.com/t.jpg?sig=new';
    const mediaUrl = createToMediaUrl(registry)(first);
    expect(createToMediaUrl(registry)(rotated)).toBe(mediaUrl);
    if (mediaUrl === null) throw new Error('unreachable');

    const fetchRemote = vi
      .fn<(url: string) => Promise<{ data: Uint8Array; contentType: string | null } | null>>()
      .mockResolvedValue({ data: Buffer.from('fresh-bytes'), contentType: 'image/png' });
    const handler = createMediaRequestHandler({
      registry,
      cache: createFakeCache(),
      fetchRemote,
    });

    const res = await handler({ url: mediaUrl });
    expect(res.status).toBe(200);
    expect(fetchRemote).toHaveBeenCalledExactlyOnceWith(rotated);
  });

  it('responds 404 to an unknown (unregistered) token and never fetches', async () => {
    const { registry } = setup();
    const fetchRemote = vi.fn();
    const handler = createMediaRequestHandler({ registry, cache: createFakeCache(), fetchRemote });

    // well-formed token whose URL was never registered — e.g. a renderer
    // hashing a URL it wants main to fetch
    const res = await handler({ url: `media://${sha256Hex('https://x.test/loot')}` });
    expect(res.status).toBe(404);
    expect(fetchRemote).not.toHaveBeenCalled();
  });

  it('responds 400 to legacy reversible tokens and malformed URLs, never fetching', async () => {
    const fetchRemote = vi.fn();
    const handler = createMediaRequestHandler({
      registry: createInMemoryMediaUrlRegistry(),
      cache: createFakeCache(),
      fetchRemote,
    });
    for (const url of ['https://x.test/a', 'http://127.0.0.1/x', 'file:///etc/passwd']) {
      const legacy = `media://${Buffer.from(url, 'utf8').toString('base64url')}`;
      expect((await handler({ url: legacy })).status).toBe(400);
    }
    expect((await handler({ url: 'media://!!!' })).status).toBe(400);
    expect((await handler({ url: 'https://nope' })).status).toBe(400);
    expect(fetchRemote).not.toHaveBeenCalled();
  });

  it('refuses to fetch a poisoned registry row pointing off-allowlist (defense in depth)', async () => {
    const registry = createInMemoryMediaUrlRegistry();
    const fetchRemote = vi.fn();
    const handler = createMediaRequestHandler({ registry, cache: createFakeCache(), fetchRemote });
    for (const bad of ['http://127.0.0.1:9000/admin', 'https://x.test/a', 'file:///etc/passwd']) {
      const token = sha256Hex(bad);
      registry.rows.set(token, bad); // bypasses minting on purpose
      expect((await handler({ url: `media://${token}` })).status).toBe(404);
    }
    expect(fetchRemote).not.toHaveBeenCalled();
  });

  it('defaults the content type when unknown', async () => {
    const { registry, mediaUrl } = setup();
    const fetchRemote = vi.fn().mockResolvedValue({ data: Buffer.from('x'), contentType: null });
    const handler = createMediaRequestHandler({ registry, cache: createFakeCache(), fetchRemote });
    const res = await handler({ url: mediaUrl });
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
  });

  it('responds 404 when the remote reports the media unavailable', async () => {
    const { registry, mediaUrl } = setup();
    const fetchRemote = vi.fn().mockResolvedValue(null);
    const handler = createMediaRequestHandler({ registry, cache: createFakeCache(), fetchRemote });
    expect((await handler({ url: mediaUrl })).status).toBe(404);
  });

  it('responds 502 when the remote fetch throws', async () => {
    const { registry, mediaUrl } = setup();
    const fetchRemote = vi.fn().mockRejectedValue(new Error('network down'));
    const handler = createMediaRequestHandler({ registry, cache: createFakeCache(), fetchRemote });
    expect((await handler({ url: mediaUrl })).status).toBe(502);
  });

  it('still serves the blob when the cache write fails', async () => {
    const { registry, mediaUrl } = setup();
    const cache = createFakeCache();
    cache.put = () => Promise.reject(new Error('disk full'));
    const fetchRemote = vi.fn().mockResolvedValue({ data: Buffer.from('ok'), contentType: null });
    const handler = createMediaRequestHandler({ registry, cache, fetchRemote });
    const res = await handler({ url: mediaUrl });
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

  it('registers the handler on the session and serves minted tokens through the encrypted cache', async () => {
    const registered: Array<{ scheme: string; handler: MediaRequestHandler }> = [];
    const session = {
      protocol: {
        handle: (scheme: string, handler: MediaRequestHandler) => {
          registered.push({ scheme, handler });
        },
      },
    };
    const registry = createInMemoryMediaUrlRegistry();
    const queries = createInMemoryMediaCacheQueries();
    const fetchRemote = vi
      .fn()
      .mockResolvedValue({ data: Buffer.from('proto-bytes'), contentType: 'image/webp' });

    registerMediaProtocol({
      session,
      cacheDir,
      encryptionKey: randomBytes(32),
      queries,
      registry,
      fetchRemote,
    });

    expect(registered).toHaveLength(1);
    const first = registered[0];
    if (first === undefined) throw new Error('unreachable');
    expect(first.scheme).toBe(MEDIA_SCHEME);

    const remote = 'https://cdn2.onlyfans.com/x.webp?sig=1';
    const mediaUrl = createToMediaUrl(registry)(remote);
    if (mediaUrl === null) throw new Error('unreachable');
    const res = await first.handler({ url: mediaUrl });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(Buffer.from(await res.arrayBuffer()).toString('utf8')).toBe('proto-bytes');

    // disk cache is keyed by the same sha256 the token carries
    const token = mediaUrl.slice('media://'.length);
    expect(queries.rows.has(token)).toBe(true);

    // second request comes from the encrypted disk cache
    const res2 = await first.handler({ url: mediaUrl });
    expect(res2.headers.get('x-chatgoose-cache')).toBe('hit');
    expect(Buffer.from(await res2.arrayBuffer()).toString('utf8')).toBe('proto-bytes');
    expect(fetchRemote).toHaveBeenCalledTimes(1);
  });

  it('retains resolver rows so an evicted token can refetch', async () => {
    const registered: Array<{ scheme: string; handler: MediaRequestHandler }> = [];
    const session = {
      protocol: {
        handle: (scheme: string, handler: MediaRequestHandler) => {
          registered.push({ scheme, handler });
        },
      },
    };
    const registry = createInMemoryMediaUrlRegistry();
    const fetchRemote = vi.fn().mockResolvedValue({
      data: Buffer.alloc(100, 7),
      contentType: 'image/jpeg',
    });
    registerMediaProtocol({
      session,
      cacheDir,
      encryptionKey: randomBytes(32),
      queries: createInMemoryMediaCacheQueries(),
      registry,
      fetchRemote,
      maxCacheBytes: 128,
    });
    const handler = registered[0]?.handler;
    if (handler === undefined) throw new Error('unreachable');

    const urls = [
      'https://thumbs.onlyfans.com/a/1.jpg?sig=1',
      'https://thumbs.onlyfans.com/a/2.jpg?sig=2',
      'https://thumbs.onlyfans.com/a/3.jpg?sig=3',
    ] as const;
    const toMediaUrl = createToMediaUrl(registry);
    const tokens = urls.map((url) => {
      const mediaUrl = toMediaUrl(url);
      if (mediaUrl === null) throw new Error('unreachable');
      return mediaUrl.slice('media://'.length);
    });
    for (const token of tokens) {
      const res = await handler({ url: `media://${token}` });
      expect(res.status).toBe(200);
    }

    expect(registry.lookup(tokens[0] ?? '')).toBe(urls[0]);
    expect(registry.lookup(tokens[1] ?? '')).toBe(urls[1]);
    expect(registry.lookup(tokens[2] ?? '')).toBe(urls[2]);

    const refetched = await handler({ url: `media://${tokens[0]}` });
    expect(refetched.status).toBe(200);
    expect(refetched.headers.get('x-chatgoose-cache')).toBe('miss');
    const hit = await handler({ url: `media://${tokens[0]}` });
    expect(hit.headers.get('x-chatgoose-cache')).toBe('hit');
    expect(fetchRemote).toHaveBeenCalledTimes(4);
  });

  it('retains resolver rows across corrupt-file self-heal and the next request', async () => {
    const registered: Array<{ scheme: string; handler: MediaRequestHandler }> = [];
    const registry = createInMemoryMediaUrlRegistry();
    const queries = createInMemoryMediaCacheQueries();
    const fetchRemote = vi.fn().mockResolvedValue({
      data: Buffer.from('fresh-image'),
      contentType: 'image/jpeg',
    });
    registerMediaProtocol({
      session: {
        protocol: {
          handle: (scheme, handler) => registered.push({ scheme, handler }),
        },
      },
      cacheDir,
      encryptionKey: randomBytes(32),
      queries,
      registry,
      fetchRemote,
    });
    const handler = registered[0]?.handler;
    if (handler === undefined) throw new Error('unreachable');
    const remote = 'https://thumbs.onlyfans.com/a/corrupt.jpg?sig=1';
    const mediaUrl = createToMediaUrl(registry)(remote);
    if (mediaUrl === null) throw new Error('unreachable');
    const token = mediaUrl.slice('media://'.length);

    expect((await handler({ url: mediaUrl })).status).toBe(200);
    await writeFile(join(cacheDir, `${token}.bin`), Buffer.from('corrupt'));

    const healed = await handler({ url: mediaUrl });
    expect(healed.status).toBe(200);
    expect(healed.headers.get('x-chatgoose-cache')).toBe('miss');
    expect(registry.lookup(token)).toBe(remote);
    expect((await handler({ url: mediaUrl })).headers.get('x-chatgoose-cache')).toBe('hit');
  });

  it('never serves or fetches non-allowlisted URLs end-to-end', async () => {
    const registered: Array<{ scheme: string; handler: MediaRequestHandler }> = [];
    const session = {
      protocol: {
        handle: (scheme: string, handler: MediaRequestHandler) => {
          registered.push({ scheme, handler });
        },
      },
    };
    const registry = createInMemoryMediaUrlRegistry();
    const fetchRemote = vi.fn();
    registerMediaProtocol({
      session,
      cacheDir,
      encryptionKey: randomBytes(32),
      queries: createInMemoryMediaCacheQueries(),
      registry,
      fetchRemote,
    });
    const handler = registered[0]?.handler;
    if (handler === undefined) throw new Error('unreachable');

    const toMediaUrl = createToMediaUrl(registry);
    for (const url of REJECTED_URLS) {
      expect(toMediaUrl(url)).toBeNull(); // rejected at registration…
      const guessed = await handler({ url: `media://${sha256Hex(url)}` });
      expect(guessed.status).toBe(404); // …and at fetch, even if the token is guessed
    }
    expect(fetchRemote).not.toHaveBeenCalled();
    expect(registry.rows.size).toBe(0);
  });
});

describe('media request handler — OFAPI id tokens (D42)', () => {
  const ACCT = 'acct_05000000000000000000000000000000';

  function setupOfapi(options: { canServe?: boolean; loadResult?: OfapiMediaLoadResult } = {}) {
    const registry = createInMemoryMediaUrlRegistry();
    const mint = createToMediaUrl(registry).ofapiMedia;
    if (mint === undefined) throw new Error('unreachable');
    const thumb = mint(ACCT, '3000001', 'thumb') ?? '';
    const full = mint(ACCT, '3000001', 'full') ?? '';
    const cache = createFakeCache();
    const load = vi.fn(async () => options.loadResult ?? { kind: 'bytes' as const, data: Buffer.from('jpeg'), contentType: 'image/jpeg' });
    const fetchRemote = vi.fn();
    const handler = createMediaRequestHandler({
      registry,
      cache,
      fetchRemote,
      ofapi: { canServe: () => options.canServe ?? true, load, state: () => ({ state: 'idle' }) },
    });
    return { thumb, full, cache, load, fetchRemote, handler };
  }

  it('refuses an account the signed-in identity is not granted, before cache or network', async () => {
    const { thumb, load, fetchRemote, handler } = setupOfapi({ canServe: false });
    expect((await handler({ url: thumb })).status).toBe(404);
    expect(load).not.toHaveBeenCalled();
    expect(fetchRemote).not.toHaveBeenCalled();
  });

  it('serves the id-keyed cache first, then an automatic load with the tagged surface', async () => {
    const { thumb, cache, load, handler } = setupOfapi();
    const token = parseMediaToken(thumb) ?? '';
    cache.entries.set(token, { data: Buffer.from('cached'), contentType: 'image/jpeg' });
    expect((await handler({ url: thumb })).headers.get('x-chatgoose-cache')).toBe('hit');
    expect(load).not.toHaveBeenCalled();
    cache.entries.clear();
    const res = await handler({ url: `${thumb}?s=gallery` });
    expect(res.status).toBe(200);
    expect(load).toHaveBeenCalledWith(token, expect.objectContaining({ kind: 'ofapi', mediaId: '3000001', variant: 'thumb' }), { trigger: 'auto', surface: 'gallery', signal: undefined });
  });

  it('never loads a full-size file automatically (only an explicit click does)', async () => {
    const { full, load, handler } = setupOfapi();
    const res = await handler({ url: full });
    expect(res.status).toBe(402);
    expect(res.headers.get('x-chatgoose-media')).toBe('load:click');
    expect(load).not.toHaveBeenCalled();
  });

  it('hands the <img> request\'s abort signal to the automatic load (D5)', async () => {
    const { thumb, load, handler } = setupOfapi();
    const controller = new AbortController();
    await handler({ url: thumb, signal: controller.signal });
    expect(load).toHaveBeenCalledWith(expect.any(String), expect.anything(), expect.objectContaining({ signal: controller.signal }));
  });

  it('names the asking cell (N3: one cell leaving drops only its own interest)', async () => {
    const { thumb, load, handler } = setupOfapi();
    await handler({ url: `${thumb}?s=vault&r=2&c=c1f` });
    expect(load).toHaveBeenCalledWith(expect.any(String), expect.anything(), expect.objectContaining({ surface: 'vault', requester: 'c1f' }));
    expect(parseMediaRequester(`${thumb}?c=c9&s=thread`)).toBe('c9');
    expect(parseMediaRequester(thumb)).toBeNull();
    expect(parseMediaRequester(`${thumb}?c=${'x'.repeat(40)}`)).toBeNull(); // bounded
    expect(parseMediaRequester(`${thumb}?c=a%20b`)).toBeNull();
  });

  it.each([
    [{ state: 'load', reason: 'budget' }, 402, 'load:budget'],
    [{ state: 'unavailable' }, 404, 'unavailable'],
    [{ state: 'processing' }, 409, 'processing'],
    [{ state: 'processing', refresh: true }, 409, 'processing:refresh'],
    [{ state: 'loading' }, 503, 'loading'],
    [{ state: 'wait', retryAfterMs: 42_000 }, 503, 'wait:42000'],
  ] as const)('answers %o with %i and names the state', async (state, status, header) => {
    const { thumb, handler } = setupOfapi({ loadResult: { kind: 'state', state } });
    const res = await handler({ url: thumb });
    expect(res.status).toBe(status);
    expect(res.headers.get('x-chatgoose-media')).toBe(header);
  });
});
