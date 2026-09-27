// Media resolver (D42). A message, gallery or vault file is a media:// id
// token (account, media id, variant); on a cache miss the desktop asks Core
// how to fetch it (POST /api/v1/ofapi/media/resolve) and downloads the bytes
// itself — Core never relays them. Core decides free (webhook URL, OFAPI
// cache) versus paid (a budgeted OFAPI download) and logs every decision; this
// module enforces the client half of that contract:
//   • a URL is fetched only on an allowlisted https host, every redirect hop
//     re-checked; a transfer stops past the priced size (unknown size: a 5 MB
//     memory guard, which protects memory, not money); 30 s timeout; at most
//     four downloads at once; a paid transfer is never retried automatically;
//   • `cap_blocked` latches the token until Core's retryAt for automatic
//     loads only (an explicit click still asks); other tokens keep resolving;
//   • `pending` waits Core's retryAfter (capped) and asks again, at most 3×,
//     each time with a new requestId (a pending answer is final for its id);
//   • failed automatic attempts back off after 3 per hour per token;
//   • every hand-out is reported (batched, durable, idempotent by resolveId);
//     a report that never arrives stays "unknown" at Core, never "free";
//   • `source_expired` on an explicit click re-reads the named message or
//     vault item once (read intent media-context-v1) and asks again.

import { randomUUID } from 'node:crypto';
import type {
  HubMediaReport,
  HubMediaResolveRequest,
  HubMediaResolveResult,
} from '@chatgoose/shared/hub/index';
import type { MediaStateVM, MediaSurfaceVM } from '../../preload/contract';
import type { MediaFetchReport, MediaFetchReportsQueries } from '../db/index';
import type { MediaBlob } from './cache';
import { isAllowedMediaUrl, type MediaUrlEntry, type OfapiMediaLoadResult, type OfapiMediaSource } from './protocol';

export const MEDIA_DOWNLOAD_TIMEOUT_MS = 30_000;
export const MEDIA_MAX_CONCURRENT_DOWNLOADS = 4;
/** Unknown size (paid, explicit click): memory guard, not a price. */
export const MEDIA_UNKNOWN_SIZE_GUARD_BYTES = 5_000_000;
/** Free URLs carry no price; these only bound memory. */
export const MEDIA_THUMB_GUARD_BYTES = 5_000_000;
export const MEDIA_FULL_GUARD_BYTES = 30_000_000;
export const MEDIA_PENDING_RETRIES = 3;
export const MEDIA_PENDING_WAIT_CAP_MS = 5_000;
export const MEDIA_AUTO_FAILURES_PER_HOUR = 3;
const MEDIA_REDIRECT_HOPS = 2;
const REPORT_BATCH = 100;
const REPORT_FLUSH_DELAY_MS = 2_000;
const REPORT_RETRY_DELAY_MS = 60_000;

export type MediaReread =
  | { kind: 'message'; chatId: string; messageId: string }
  | { kind: 'vault'; mediaId: string };

export interface MediaHubClient {
  resolveMedia(args: { request: HubMediaResolveRequest }): Promise<HubMediaResolveResult>;
  reportMediaFetches(args: { reports: HubMediaReport[] }): Promise<unknown>;
}

interface ResponseLike {
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null };
  body: { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }>; cancel(): Promise<unknown> } } | null;
}

export type MediaFetchLike = (
  url: string,
  init: { redirect: 'manual'; signal: AbortSignal },
) => Promise<ResponseLike>;

export interface MediaResolverDeps {
  cache: { getByKey(key: string): Promise<MediaBlob | null>; putByKey(key: string, data: Uint8Array, contentType: string | null): Promise<void> };
  /** The signed-in hub, or null (signed out / no hub configured). */
  hub: () => Promise<MediaHubClient | null>;
  /** D35 rule 5: only an account granted to the current identity is served. */
  canServe: (accountId: string) => boolean;
  reports: Pick<MediaFetchReportsQueries, 'enqueue' | 'next' | 'remove' | 'noteAttempt'>;
  /** Explicit-click re-read of what Core named (read intent media-context-v1). */
  reread?: (accountId: string, target: MediaReread) => Promise<boolean>;
  /** Credits Core charged for a hand-out; idempotent by resolveId downstream. */
  recordCredits?: (resolveId: string, credits: number) => void;
  fetchImpl?: MediaFetchLike;
  now?: () => number;
  newRequestId?: () => string;
  sleep?: (ms: number) => Promise<void>;
  onLog?: (level: 'info' | 'warn', message: string, fields?: Record<string, unknown>) => void;
  maxConcurrent?: number;
}

export interface MediaResolver extends OfapiMediaSource {
  /** Send queued transfer reports (after downloads, and once at startup). */
  flushReports(): Promise<void>;
  dispose(): void;
}

type OfapiEntry = Extract<MediaUrlEntry, { kind: 'ofapi' }>;

interface TokenMemo {
  state: MediaStateVM;
  capUntil: number | null;
  failures: number[];
  inflight: Promise<OfapiMediaLoadResult> | null;
}

type DownloadOutcome =
  | { ok: true; data: Uint8Array; contentType: string | null; status: number }
  | { ok: false; result: MediaFetchReport['result']; status: number | null; bytes: number; gone: boolean };

function nextUtcMidnight(nowMs: number): number {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

function stateResult(state: MediaStateVM): OfapiMediaLoadResult {
  return { kind: 'state', state };
}

/** A small FIFO semaphore: at most `limit` downloads at once. */
function createSlots(limit: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return {
    async acquire(): Promise<void> {
      if (active < limit) {
        active += 1;
        return;
      }
      await new Promise<void>((resolve) => waiting.push(resolve));
      active += 1;
    },
    release(): void {
      active -= 1;
      waiting.shift()?.();
    },
  };
}

export function createMediaResolver(deps: MediaResolverDeps): MediaResolver {
  const now = deps.now ?? Date.now;
  const newRequestId = deps.newRequestId ?? randomUUID;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const fetchImpl: MediaFetchLike = deps.fetchImpl ?? ((url, init) => fetch(url, init) as unknown as Promise<ResponseLike>);
  const slots = createSlots(deps.maxConcurrent ?? MEDIA_MAX_CONCURRENT_DOWNLOADS);
  const memos = new Map<string, TokenMemo>();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let flushing: Promise<void> | null = null;
  let disposed = false;

  function memoFor(token: string): TokenMemo {
    let memo = memos.get(token);
    if (memo === undefined) {
      memo = { state: { state: 'idle' }, capUntil: null, failures: [], inflight: null };
      memos.set(token, memo);
    }
    return memo;
  }

  function noteFailure(memo: TokenMemo): void {
    memo.failures.push(now());
  }

  async function download(url: string, maxBytes: number): Promise<DownloadOutcome> {
    let current = url;
    for (let hop = 0; hop <= MEDIA_REDIRECT_HOPS; hop += 1) {
      // Defense in depth: every hop, including Core's own answer.
      if (!isAllowedMediaUrl(current)) return { ok: false, result: 'failed', status: null, bytes: 0, gone: false };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), MEDIA_DOWNLOAD_TIMEOUT_MS);
      let bytes = 0;
      try {
        const response = await fetchImpl(current, { redirect: 'manual', signal: controller.signal });
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          await response.body?.getReader().cancel().catch(() => undefined);
          if (location === null) return { ok: false, result: 'http_error', status: response.status, bytes: 0, gone: false };
          try {
            current = new URL(location, current).toString();
          } catch {
            return { ok: false, result: 'failed', status: response.status, bytes: 0, gone: false };
          }
          continue;
        }
        if (!response.ok) {
          await response.body?.getReader().cancel().catch(() => undefined);
          return {
            ok: false, result: 'http_error', status: response.status, bytes: 0,
            gone: response.status === 404 || response.status === 410,
          };
        }
        const declared = Number(response.headers.get('content-length'));
        if (Number.isFinite(declared) && declared > maxBytes) {
          await response.body?.getReader().cancel().catch(() => undefined);
          return { ok: false, result: 'aborted_size', status: response.status, bytes: 0, gone: false };
        }
        const reader = response.body?.getReader();
        const chunks: Uint8Array[] = [];
        if (reader !== undefined) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value === undefined) continue;
            bytes += value.byteLength;
            if (bytes > maxBytes) {
              // Stop past the priced size: the tariff counts bytes streamed.
              await reader.cancel().catch(() => undefined);
              return { ok: false, result: 'aborted_size', status: response.status, bytes, gone: false };
            }
            chunks.push(value);
          }
        }
        const data = new Uint8Array(bytes);
        let offset = 0;
        for (const chunk of chunks) {
          data.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return { ok: true, data, contentType: response.headers.get('content-type'), status: response.status };
      } catch {
        return {
          ok: false, result: controller.signal.aborted ? 'timeout' : 'failed', status: null, bytes, gone: false,
        };
      } finally {
        clearTimeout(timer);
      }
    }
    return { ok: false, result: 'failed', status: null, bytes: 0, gone: false };
  }

  function scheduleFlush(delayMs: number): void {
    if (disposed || flushTimer !== null) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flushReports();
    }, delayMs);
    (flushTimer as { unref?: () => void }).unref?.();
  }

  function enqueueReport(report: MediaFetchReport): void {
    try {
      deps.reports.enqueue(report);
    } catch (error) {
      deps.onLog?.('warn', 'media report could not be queued', { message: error instanceof Error ? error.message : String(error) });
    }
    scheduleFlush(REPORT_FLUSH_DELAY_MS);
  }

  async function flushReports(): Promise<void> {
    if (flushing !== null) return flushing;
    flushing = (async () => {
      const hub = await deps.hub().catch(() => null);
      if (hub === null) return;
      for (let round = 0; round < 10; round += 1) {
        const batch = deps.reports.next(REPORT_BATCH);
        if (batch.length === 0) return;
        const ids = batch.map((report) => report.resolveId);
        try {
          // `null` = this Core has no media routes: nothing can take them.
          await hub.reportMediaFetches({ reports: batch });
          deps.reports.remove(ids);
        } catch {
          deps.reports.noteAttempt(ids);
          scheduleFlush(REPORT_RETRY_DELAY_MS);
          return;
        }
      }
    })().finally(() => {
      flushing = null;
    });
    return flushing;
  }

  async function resolveAndFetch(
    token: string,
    entry: OfapiEntry,
    trigger: 'auto' | 'click',
    surface: MediaSurfaceVM,
    memo: TokenMemo,
  ): Promise<OfapiMediaLoadResult> {
    const hub = await deps.hub().catch(() => null);
    if (hub === null) return stateResult({ state: 'unavailable' });
    let pendingLeft = MEDIA_PENDING_RETRIES;
    let rereadDone = false;
    let afterReread = false;
    while (true) {
      let answer: HubMediaResolveResult;
      try {
        answer = await hub.resolveMedia({
          request: {
            requestId: newRequestId(),
            accountId: entry.accountId,
            mediaId: entry.mediaId,
            variant: entry.variant,
            surface,
            trigger,
            ...(afterReread ? { afterReread: true } : {}),
          },
        });
      } catch {
        noteFailure(memo);
        return stateResult({ state: 'load', reason: 'failed' });
      }
      // No media routes (an older Core, a rollback) or no grant: quietly unavailable.
      if (answer.kind === 'unsupported') return stateResult({ state: 'unavailable' });
      const response = answer.response;
      if (response.credits > 0) deps.recordCredits?.(response.resolveId, response.credits);
      switch (response.outcome) {
        case 'free_url':
        case 'ofapi_cache':
        case 'paid': {
          if (response.url === null) {
            // A replayed answer whose hand-out is no longer retained.
            return stateResult({ state: 'load', reason: 'failed' });
          }
          const maxBytes = response.maxBytes
            ?? (response.outcome === 'paid' ? MEDIA_UNKNOWN_SIZE_GUARD_BYTES
              : entry.variant === 'full' ? MEDIA_FULL_GUARD_BYTES : MEDIA_THUMB_GUARD_BYTES);
          const fetched = await download(response.url, maxBytes);
          enqueueReport({
            resolveId: response.resolveId,
            result: fetched.ok ? 'ok' : fetched.result,
            bytesReceived: fetched.ok ? fetched.data.byteLength : fetched.bytes,
            httpStatus: fetched.status,
          });
          if (fetched.ok) {
            memo.failures = [];
            try {
              await deps.cache.putByKey(token, fetched.data, fetched.contentType);
            } catch {
              // Serving beats caching.
            }
            return { kind: 'bytes', data: fetched.data, contentType: fetched.contentType };
          }
          // A paid transfer is never retried automatically: the next attempt is a click.
          if (response.outcome !== 'paid') noteFailure(memo);
          return stateResult(fetched.gone ? { state: 'unavailable' } : { state: 'load', reason: 'failed' });
        }
        case 'cap_blocked': {
          if (response.reason === 'size_unknown') return stateResult({ state: 'load', reason: 'size' });
          const retryAt = response.retryAt !== null ? Date.parse(response.retryAt) : Number.NaN;
          memo.capUntil = Number.isFinite(retryAt) ? retryAt : nextUtcMidnight(now());
          return stateResult({ state: 'load', reason: 'budget' });
        }
        case 'source_expired': {
          if (trigger === 'click' && !rereadDone && response.reread !== null && deps.reread !== undefined) {
            rereadDone = true;
            const refreshed = await deps.reread(entry.accountId, response.reread).catch(() => false);
            if (refreshed) {
              afterReread = true;
              continue;
            }
          }
          return stateResult({ state: 'load', reason: 'expired' });
        }
        case 'pending': {
          if (pendingLeft > 0) {
            pendingLeft -= 1;
            await sleep(Math.min(Math.max(response.retryAfterMs ?? 1_000, 250), MEDIA_PENDING_WAIT_CAP_MS));
            continue;
          }
          return stateResult({ state: 'load', reason: 'failed' });
        }
        case 'refused':
          return stateResult(response.reason === 'not_ready' ? { state: 'processing' } : { state: 'unavailable' });
        case 'unavailable':
          return stateResult({ state: 'unavailable' });
        default:
          noteFailure(memo);
          return stateResult({ state: 'load', reason: 'failed' });
      }
    }
  }

  return {
    canServe: (accountId) => deps.canServe(accountId),

    state(token) {
      return memos.get(token)?.state ?? { state: 'idle' };
    },

    async load(token, entry, options) {
      if (!deps.canServe(entry.accountId)) return stateResult({ state: 'unavailable' });
      const memo = memoFor(token);
      const running = memo.inflight;
      if (running !== null) {
        const shared = await running.catch(() => null);
        // An automatic load shares whatever is in flight; a click retries
        // only if that did not produce the file.
        if (shared !== null && (shared.kind === 'bytes' || options.trigger === 'auto')) return shared;
      }
      const run = (async (): Promise<OfapiMediaLoadResult> => {
        const cached = await deps.cache.getByKey(token).catch(() => null);
        if (cached !== null) return { kind: 'bytes', data: cached.data, contentType: cached.contentType };
        if (options.trigger === 'auto') {
          if (memo.capUntil !== null && now() < memo.capUntil) return stateResult({ state: 'load', reason: 'budget' });
          memo.failures = memo.failures.filter((at) => now() - at < 3_600_000);
          if (memo.failures.length >= MEDIA_AUTO_FAILURES_PER_HOUR) return stateResult({ state: 'load', reason: 'failed' });
        }
        await slots.acquire();
        try {
          return await resolveAndFetch(token, entry, options.trigger, options.surface, memo);
        } finally {
          slots.release();
        }
      })();
      memo.state = { state: 'loading' };
      memo.inflight = run;
      try {
        const result = await run;
        memo.state = result.kind === 'bytes' ? { state: 'ready' } : result.state;
        if (result.kind === 'bytes') memo.capUntil = null;
        return result;
      } catch (error) {
        memo.state = { state: 'load', reason: 'failed' };
        throw error;
      } finally {
        if (memo.inflight === run) memo.inflight = null;
      }
    },

    flushReports,

    dispose() {
      disposed = true;
      if (flushTimer !== null) clearTimeout(flushTimer);
      flushTimer = null;
    },
  };
}
