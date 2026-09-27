// media:// protocol (SPEC §4): the renderer references media only as
// media://<sha256-hex-of-stable-media-URL> — an opaque token, non-reversible by
// construction. Minting registers the newest signed URL in media_urls; the request
// handler resolves only registered tokens (unknown → 404, never fetched)
// through the encrypted disk cache, falling back to the injected fetchRemote
// (direct signed-URL fetch first — 0 credits — then OFAPI download endpoint;
// composition wires that policy). Only https OnlyFans media hosts mint, and
// the allowlist is re-checked before any fetch (defense in depth) — the
// scheme must never become an SSRF path out of main.

import { createMediaCache, hashOfapiMediaKey, hashRemoteUrl, MEDIA_CACHE_MAX_BYTES } from './cache';
import type { MediaBlob, MediaCacheQueries } from './cache';
import type { MediaSurfaceVM, MediaStateVM, MediaTriggerVM } from '../../preload/contract';

export const MEDIA_SCHEME = 'media';

// NOTE for the composition root: keep the scheme non-`standard` in
// registerSchemesAsPrivileged — nothing here needs standard-scheme URL
// semantics (tokens are plain lowercase hex).
export const MEDIA_SCHEME_PRIVILEGES = {
  scheme: MEDIA_SCHEME,
  privileges: { supportFetchAPI: true, stream: true },
} as const;

// ─── Host allowlist (https + OF/FansAPI media hosts only) ────────────────

function isHostOrSubdomain(hostname: string, base: string): boolean {
  return hostname === base || hostname.endsWith(`.${base}`);
}

export function isAllowedMediaUrl(remoteUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(remoteUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  return isHostOrSubdomain(url.hostname, 'onlyfans.com') ||
    isHostOrSubdomain(url.hostname, 'fansapi.com');
}

// ─── Token mapping ────────────────────────────────────────────────────────

export type MediaVariant = 'thumb' | 'full';

/** One registered token's source (D42 adds the OFAPI id kind). */
export type MediaUrlEntry =
  | { kind: 'url'; url: string }
  | { kind: 'ofapi'; accountId: string; mediaId: string; variant: MediaVariant };

/** url_hash → source registry (db module: media_urls table). */
export interface MediaUrlRegistry {
  /** Latest signed URL wins for a stable media hash. */
  register(urlHash: string, url: string): void;
  /** D42: an OFAPI file's id token (idempotent). */
  registerOfapi(urlHash: string, entry: { accountId: string; mediaId: string; variant: MediaVariant }): void;
  lookup(urlHash: string): string | undefined;
  lookupEntry(urlHash: string): MediaUrlEntry | undefined;
  delete(urlHash: string): void;
  clear(): void;
}

const OFAPI_ACCOUNT_PATTERN = /^acct_[A-Za-z0-9]+$/;
const OFAPI_MEDIA_ID_PATTERN = /^\d{1,30}$/;

/** D42: mints the media:// id token of an OFAPI file; null for a malformed ref. */
export type OfapiMediaMinter = (accountId: string, mediaId: string, variant: MediaVariant) => string | null;

/**
 * Message, gallery and vault files are named by (account, media id, variant)
 * — never by a URL: Core decides at fetch time how the file is obtained. The
 * token is sha256('ofapi|acct|mediaId|variant'); minting (re)registers it, so
 * a registry cleared together with the blob cache heals on the next mint.
 */
export function createOfapiMediaMinter(
  registry: Pick<MediaUrlRegistry, 'registerOfapi'>,
): OfapiMediaMinter {
  return (accountId, mediaId, variant) => {
    if (!OFAPI_ACCOUNT_PATTERN.test(accountId) || !OFAPI_MEDIA_ID_PATTERN.test(mediaId)) return null;
    const token = hashOfapiMediaKey(accountId, mediaId, variant);
    registry.registerOfapi(token, { accountId, mediaId, variant });
    return `${MEDIA_SCHEME}://${token}`;
  };
}

/**
 * Remote URL → opaque media:// token; minting registers the URL so the
 * protocol handler can resolve the token later. Non-allowlisted input mints
 * nothing (null) and is never registered — such URLs must never become
 * renderer-fetchable. The token equals the media_cache url_hash (one sha256).
 */
export function createToMediaUrl(
  registry: Pick<MediaUrlRegistry, 'register'> & Partial<Pick<MediaUrlRegistry, 'registerOfapi'>>,
): ((remoteUrl: string) => string | null) & { ofapiMedia?: OfapiMediaMinter } {
  const toMediaUrl = (remoteUrl: string): string | null => {
    if (!isAllowedMediaUrl(remoteUrl)) return null;
    const urlHash = hashRemoteUrl(remoteUrl);
    registry.register(urlHash, remoteUrl);
    return `${MEDIA_SCHEME}://${urlHash}`;
  };
  // D42: the same seam also mints id tokens when the registry supports them.
  const registerOfapi = registry.registerOfapi?.bind(registry);
  return registerOfapi === undefined
    ? toMediaUrl
    : Object.assign(toMediaUrl, { ofapiMedia: createOfapiMediaMinter({ registerOfapi }) });
}

const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

/** D42: the surface a renderer tagged on the URL (`?s=gallery`), for Core's log. */
export function parseMediaSurface(requestUrl: string): MediaSurfaceVM | null {
  const match = /[?&]s=(thread|gallery|vault|lightbox)(?:&|#|$)/.exec(requestUrl);
  return match ? (match[1] as MediaSurfaceVM) : null;
}

/**
 * D42: the cell a renderer tagged on the URL (`&c=c1f`). Two cells showing one
 * file share its load; one cell leaving drops only its own interest.
 */
export function parseMediaRequester(requestUrl: string): string | null {
  const match = /[?&]c=([A-Za-z0-9_-]{1,32})(?:&|#|$)/.exec(requestUrl);
  return match ? match[1]! : null;
}

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
  getByKey(urlHash: string): Promise<MediaBlob | null>;
  putByKey(urlHash: string, data: Uint8Array, contentType: string | null): Promise<void>;
}

/** D42: what an OFAPI id-token load produced (bytes are already cached). */
export type OfapiMediaLoadResult =
  | { kind: 'bytes'; data: Uint8Array; contentType: string | null }
  | { kind: 'state'; state: MediaStateVM };

/** D42: the id-token source — Core resolve + desktop download (media/resolver.ts). */
export interface OfapiMediaSource {
  /** Only an account granted to the current identity is served (D35 rule 5). */
  canServe(accountId: string): boolean;
  load(
    token: string,
    entry: Extract<MediaUrlEntry, { kind: 'ofapi' }>,
    options: {
      trigger: MediaTriggerVM;
      surface: MediaSurfaceVM;
      /** D5: the asking cell (`c=` on the URL); an unstarted load goes when every cell left. */
      requester?: string | undefined;
      /** D5: this request's abort signal leaves its cell, like `cmd:media.cancel`. */
      signal?: AbortSignal | undefined;
    },
  ): Promise<OfapiMediaLoadResult>;
  state(token: string): MediaStateVM;
}

export interface MediaRequestHandlerDeps {
  registry: Pick<MediaUrlRegistry, 'lookup'> & Partial<Pick<MediaUrlRegistry, 'lookupEntry'>>;
  cache: MediaCacheLike;
  fetchRemote: FetchRemote;
  ofapi?: OfapiMediaSource | null;
}

/** HTTP status a non-image state maps to; `x-chatgoose-media` names it. */
const STATE_STATUS: Record<MediaStateVM['state'], number> = {
  ready: 200,
  idle: 503,
  loading: 503,
  load: 402,
  unavailable: 404,
  processing: 409,
  wait: 503,
};

function stateHeader(state: MediaStateVM): string {
  if (state.state === 'load') return `load:${state.reason}`;
  if (state.state === 'wait') return `wait:${state.retryAfterMs}`;
  if (state.state === 'processing' && state.refresh === true) return 'processing:refresh';
  return state.state;
}

function stateResponse(state: MediaStateVM): Response {
  return new Response(null, {
    status: STATE_STATUS[state.state],
    headers: { 'x-chatgoose-media': stateHeader(state) },
  });
}

/** Electron hands the handler a fetch Request; its signal (when present) aborts with the <img>. */
export type MediaRequestHandler = (request: { url: string; signal?: AbortSignal | undefined }) => Promise<Response>;

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

    const entry = registry.lookupEntry?.(token);
    if (entry?.kind === 'ofapi') {
      const source = deps.ofapi ?? null;
      // An account this identity is not granted never reaches cache or network.
      if (source === null || !source.canServe(entry.accountId)) {
        return new Response('unknown media', { status: 404 });
      }
      const cachedBlob = await cache.getByKey(token);
      if (cachedBlob !== null) return blobResponse(cachedBlob.data, cachedBlob.contentType, 'hit');
      // Full size is fetched only by an explicit click (cmd:media.load).
      if (entry.variant === 'full') return stateResponse({ state: 'load', reason: 'click' });
      let result: OfapiMediaLoadResult;
      try {
        result = await source.load(token, entry, {
          trigger: 'auto',
          surface: parseMediaSurface(request.url) ?? 'thread',
          requester: parseMediaRequester(request.url) ?? undefined,
          signal: request.signal,
        });
      } catch {
        return stateResponse({ state: 'load', reason: 'failed' });
      }
      return result.kind === 'bytes'
        ? blobResponse(result.data, result.contentType, 'miss')
        : stateResponse(result.state);
    }

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
  registry: Pick<MediaUrlRegistry, 'lookup' | 'clear'> & Partial<Pick<MediaUrlRegistry, 'lookupEntry'>>;
  fetchRemote: FetchRemote;
  /** D42: late-bound, because the source needs the cache this call creates. */
  ofapi?: () => OfapiMediaSource | null;
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
    // Blob-cache eviction is not source-registry GC. Persisted messages retain
    // only their opaque media:// token, so deleting the resolver here would make
    // an ordinary LRU eviction (or corrupt-file self-heal) a permanent 404.
    onClear: () => options.registry.clear(),
  });
  const ofapi = options.ofapi;
  const handler = createMediaRequestHandler({
    registry: options.registry,
    cache,
    fetchRemote: options.fetchRemote,
    ...(ofapi !== undefined
      ? {
          get ofapi() {
            return ofapi();
          },
        }
      : {}),
  });
  options.session.protocol.handle(MEDIA_SCHEME, handler);
  return { cache, handler };
}
