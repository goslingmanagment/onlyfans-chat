// media:// protocol (SPEC §4): the renderer references media only as
// media://<sha256-hex-of-remote-URL> — an opaque token, non-reversible by
// construction. Minting registers the remote URL in media_urls; the request
// handler resolves only registered tokens (unknown → 404, never fetched)
// through the encrypted disk cache, falling back to the injected fetchRemote
// (direct signed-URL fetch first — 0 credits — then OFAPI download endpoint;
// composition wires that policy). Only https OnlyFans media hosts mint, and
// the allowlist is re-checked before any fetch (defense in depth) — the
// scheme must never become an SSRF path out of main.

import { createMediaCache, hashRemoteUrl, MEDIA_CACHE_MAX_BYTES } from './cache';
import type { MediaCacheQueries } from './cache';

export const MEDIA_SCHEME = 'media';

// NOTE for the composition root: keep the scheme non-`standard` in
// registerSchemesAsPrivileged — nothing here needs standard-scheme URL
// semantics (tokens are plain lowercase hex).
export const MEDIA_SCHEME_PRIVILEGES = {
  scheme: MEDIA_SCHEME,
  privileges: { supportFetchAPI: true, stream: true },
} as const;

// ─── Host allowlist (https + OnlyFans hosts only) ────────────────────────

export function isAllowedMediaUrl(remoteUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(remoteUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  return url.hostname === 'onlyfans.com' || url.hostname.endsWith('.onlyfans.com');
}

// ─── Token mapping ────────────────────────────────────────────────────────

/** url_hash → remote URL registry (db module: media_urls table). */
export interface MediaUrlRegistry {
  /** INSERT OR IGNORE semantics: re-registering a known hash is a no-op. */
  register(urlHash: string, url: string): void;
  lookup(urlHash: string): string | undefined;
}

/**
 * Remote URL → opaque media:// token; minting registers the URL so the
 * protocol handler can resolve the token later. Non-allowlisted input mints
 * nothing (null) and is never registered — such URLs must never become
 * renderer-fetchable. The token equals the media_cache url_hash (one sha256).
 */
export function createToMediaUrl(
  registry: Pick<MediaUrlRegistry, 'register'>,
): (remoteUrl: string) => string | null {
  return (remoteUrl) => {
    if (!isAllowedMediaUrl(remoteUrl)) return null;
    const urlHash = hashRemoteUrl(remoteUrl);
    registry.register(urlHash, remoteUrl);
    return `${MEDIA_SCHEME}://${urlHash}`;
  };
}

const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

/**
 * media://<token> → 64-hex sha256 token, or null for anything else. Legacy
 * reversible base64url-of-URL payloads never match (an encoded http(s) URL
 * always contains base64 bytes outside lowercase hex). Renderer-controlled
 * input (trust boundary).
 */
export function parseMediaToken(requestUrl: string): string | null {
  const prefix = `${MEDIA_SCHEME}://`;
  if (!requestUrl.startsWith(prefix)) return null;
  let payload = requestUrl.slice(prefix.length);
  // Chromium may append a trailing slash or query/fragment.
  const end = payload.search(/[/?#]/);
  if (end !== -1) payload = payload.slice(0, end);
  return TOKEN_PATTERN.test(payload) ? payload : null;
}

// ─── Request handler ─────────────────────────────────────────────────────

export interface MediaFetchResult {
  data: Uint8Array;
  contentType: string | null;
}

/**
 * Composition root passes the fetch policy: try the signed URL directly
 * (0 credits), fall back to the OFAPI download endpoint on 403/expired
 * signature. Resolve null when the media is gone/unavailable; throw on
 * transport failure. Must itself re-check the host allowlist before fetching.
 */
export type FetchRemote = (remoteUrl: string) => Promise<MediaFetchResult | null>;

interface MediaCacheLike {
  get(remoteUrl: string): Promise<{ data: Buffer; contentType: string | null } | null>;
  put(remoteUrl: string, data: Uint8Array, contentType: string | null): Promise<void>;
}

export interface MediaRequestHandlerDeps {
  registry: Pick<MediaUrlRegistry, 'lookup'>;
  cache: MediaCacheLike;
  fetchRemote: FetchRemote;
}

export type MediaRequestHandler = (request: { url: string }) => Promise<Response>;

const FALLBACK_CONTENT_TYPE = 'application/octet-stream';

function blobResponse(data: Uint8Array, contentType: string | null, cacheState: string): Response {
  return new Response(data, {
    status: 200,
    headers: {
      'content-type': contentType ?? FALLBACK_CONTENT_TYPE,
      'x-chatgoose-cache': cacheState,
    },
  });
}

export function createMediaRequestHandler(deps: MediaRequestHandlerDeps): MediaRequestHandler {
  const { registry, cache, fetchRemote } = deps;

  return async (request) => {
    const token = parseMediaToken(request.url);
    if (token === null) return new Response('invalid media url', { status: 400 });

    const remoteUrl = registry.lookup(token);
    // Unknown token, or a poisoned registry row pointing off-allowlist:
    // 404 without ever touching the network.
    if (remoteUrl === undefined || !isAllowedMediaUrl(remoteUrl)) {
      return new Response('unknown media', { status: 404 });
    }

    const cached = await cache.get(remoteUrl);
    if (cached !== null) return blobResponse(cached.data, cached.contentType, 'hit');

    let fetched: MediaFetchResult | null;
    try {
      fetched = await fetchRemote(remoteUrl);
    } catch {
      return new Response('media fetch failed', { status: 502 });
    }
    if (fetched === null) return new Response('media unavailable', { status: 404 });

    try {
      await cache.put(remoteUrl, fetched.data, fetched.contentType);
    } catch {
      // Serving beats caching; a failed cache write must not blank the UI.
    }
    return blobResponse(fetched.data, fetched.contentType, 'miss');
  };
}

// ─── Electron registration (structural types: no Electron import needed) ──

export interface ProtocolLike {
  handle(scheme: string, handler: MediaRequestHandler): void;
}

export interface SessionLike {
  protocol: ProtocolLike;
}

export interface RegisterMediaProtocolOptions {
  session: SessionLike;
  cacheDir: string;
  /** 32-byte mediaCacheKey from the keychain. */
  encryptionKey: Buffer;
  queries: MediaCacheQueries;
  registry: Pick<MediaUrlRegistry, 'lookup'>;
  fetchRemote: FetchRemote;
  maxCacheBytes?: number;
}

export interface RegisteredMediaProtocol {
  cache: MediaCacheLike & { clear(): Promise<void> };
  handler: MediaRequestHandler;
}

export function registerMediaProtocol(
  options: RegisterMediaProtocolOptions,
): RegisteredMediaProtocol {
  const cache = createMediaCache({
    cacheDir: options.cacheDir,
    encryptionKey: options.encryptionKey,
    queries: options.queries,
    maxBytes: options.maxCacheBytes ?? MEDIA_CACHE_MAX_BYTES,
  });
  const handler = createMediaRequestHandler({
    registry: options.registry,
    cache,
    fetchRemote: options.fetchRemote,
  });
  options.session.protocol.handle(MEDIA_SCHEME, handler);
  return { cache, handler };
}
