// media:// protocol (SPEC §4): the renderer references media only as
// media://<urlsafe-base64-of-remote-URL>; main resolves it via the encrypted
// disk cache, falling back to the injected fetchRemote (direct signed-URL
// fetch first — 0 credits — then OFAPI download endpoint; composition wires
// that policy). The request handler is a pure function, testable sans Electron.

import { createMediaCache, MEDIA_CACHE_MAX_BYTES } from './cache';
import type { MediaCacheQueries } from './cache';

export const MEDIA_SCHEME = 'media';

// NOTE for the composition root: do NOT mark the scheme `standard` in
// registerSchemesAsPrivileged — standard schemes lowercase the host part,
// which would corrupt the case-sensitive base64url payload.
export const MEDIA_SCHEME_PRIVILEGES = {
  scheme: MEDIA_SCHEME,
  privileges: { supportFetchAPI: true, stream: true },
} as const;

// ─── URL mapping ─────────────────────────────────────────────────────────

export function toMediaUrl(remoteUrl: string): string {
  return `${MEDIA_SCHEME}://${Buffer.from(remoteUrl, 'utf8').toString('base64url')}`;
}

/**
 * media://<base64url> → remote http(s) URL, or null for anything malformed.
 * Renderer-controlled input (trust boundary): parses by hand to avoid URL
 * normalization, requires the decoded value to be a well-formed http(s) URL.
 */
export function parseMediaUrl(requestUrl: string): string | null {
  const prefix = `${MEDIA_SCHEME}://`;
  if (!requestUrl.startsWith(prefix)) return null;
  let payload = requestUrl.slice(prefix.length);
  // Chromium may append a trailing slash or query/fragment; the payload itself
  // is pure base64url so the first such character ends it.
  const end = payload.search(/[/?#]/);
  if (end !== -1) payload = payload.slice(0, end);
  if (payload.length === 0 || !/^[A-Za-z0-9_-]+$/.test(payload)) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(payload, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  let url: URL;
  try {
    url = new URL(decoded);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  return decoded;
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
 * transport failure.
 */
export type FetchRemote = (remoteUrl: string) => Promise<MediaFetchResult | null>;

interface MediaCacheLike {
  get(remoteUrl: string): Promise<{ data: Buffer; contentType: string | null } | null>;
  put(remoteUrl: string, data: Uint8Array, contentType: string | null): Promise<void>;
}

export interface MediaRequestHandlerDeps {
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
  const { cache, fetchRemote } = deps;

  return async (request) => {
    const remoteUrl = parseMediaUrl(request.url);
    if (remoteUrl === null) return new Response('invalid media url', { status: 400 });

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
  const handler = createMediaRequestHandler({ cache, fetchRemote: options.fetchRemote });
  options.session.protocol.handle(MEDIA_SCHEME, handler);
  return { cache, handler };
}
