// Media resolver (D42). A message, gallery or vault file is a media:// id
// token (account, media id, variant); on a cache miss the desktop asks Core
// how to fetch it (POST /api/v1/ofapi/media/resolve) and downloads the bytes
// itself — Core never relays them. Core decides free (webhook URL, OFAPI
// cache) versus paid (a budgeted OFAPI download) and logs every decision; this
// module enforces the client half of that contract:
//   • a URL is fetched only on an allowlisted https host, every redirect hop
//     re-checked; a transfer stops past the priced size (unknown size: a 5 MB
//     memory guard, which protects memory, not money); only image/* bytes are
//     kept and cached; 30 s timeout; at most four downloads at once, clicks
//     first; an automatic load that has not started yet can be cancelled;
//   • a paid transfer is never retried automatically: after any failed paid
//     transfer (or a paid answer without a URL) the token waits for an
//     explicit click or the next UTC midnight;
//   • `cap_blocked` latches the token for automatic loads (daily budget until
//     Core's retryAt, full size until midnight — it is click-only); an
//     explicit click still asks;
//   • quiet answers are remembered for automatic loads (refused, unavailable,
//     link expired, size unknown, exhausted pending: 12 min; still processing:
//     1 min); a Core without the media routes is remembered per account for
//     the session; a rate-limited device waits Core's Retry-After, quietly;
//   • `pending` waits Core's retryAfter (capped) and asks again, at most 3×,
//     each time with a new requestId (a pending answer is final for its id);
//     a timeout or transport error is retried once with the SAME requestId
//     (Core joins or replays it, never charges twice);
//   • failed automatic attempts back off after 3 per hour per token;
//   • every hand-out is reported (batched, durable, idempotent by resolveId);
//     a report that never arrives stays "unknown" at Core, never "free";
//   • an explicit click on `source_expired`, or on a file Core still calls
//     processing, re-reads the named message or vault item once (read intent
//     media-context-v1) and asks again. Never automatically.

import { randomUUID } from 'node:crypto';
import {
  HubError,
  type HubMediaReport,
  type HubMediaResolveRequest,
  type HubMediaResolveResponse,
  type HubMediaResolveResult,
} from '@chatgoose/shared/hub/index';
import type { MediaStateVM, MediaSurfaceVM, MediaTriggerVM } from '../../preload/contract';
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
/** D4: automatic loads reuse a quiet "no" this long without asking Core. */
export const MEDIA_NEGATIVE_TTL_MS = 12 * 60_000;
/** D4: a file OnlyFans still processes may be ready soon — a short pause only. */
export const MEDIA_NOT_READY_TTL_MS = 60_000;
/** D4: Core rate-limited this device without a Retry-After. */
export const MEDIA_THROTTLE_DEFAULT_MS = 60_000;
/** D4: Core's media transport was busy after every pending retry. */
export const MEDIA_BUSY_WAIT_MS = 30_000;
const MEDIA_WAIT_MIN_MS = 1_000;
const MEDIA_WAIT_MAX_MS = 15 * 60_000;
/** D6: a report Core has refused this many times is dropped (Core keeps its charge "unknown"). */
export const MEDIA_REPORT_MAX_ATTEMPTS = 30;
const MEDIA_REDIRECT_HOPS = 2;
const REPORT_BATCH = 100;
const REPORT_ROUNDS = 10;
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
  reports: Pick<MediaFetchReportsQueries, 'enqueue' | 'next' | 'remove' | 'noteAttempt' | 'dropExhausted'>;
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
  /** D5: drop the token's automatic load if it has not started yet. */
  cancel(token: string): boolean;
  /** Send queued transfer reports (after downloads, and once at startup). */
  flushReports(): Promise<void>;
  dispose(): void;
}

type OfapiEntry = Extract<MediaUrlEntry, { kind: 'ofapi' }>;

interface SlotWaiter {
  priority: MediaTriggerVM;
  settled: boolean;
  resolve(granted: boolean): void;
}

interface TokenMemo {
  state: MediaStateVM;
  /** Until when a `wait` state lasts (its retryAfterMs is recomputed on read). */
  waitUntil: number | null;
  /**
   * Automatic loads get this answer without asking Core until `until`: a
   * cap_blocked latch, a failed paid transfer (D1), or a quiet "no" (D4).
   * An explicit click clears it.
   */
  autoBlock: { until: number; state: MediaStateVM } | null;
  failures: number[];
  inflight: Promise<OfapiMediaLoadResult> | null;
  /** D5: the automatic run still waiting for a download slot. */
  queued: SlotWaiter | null;
}

type DownloadOutcome =
  | { ok: true; data: Uint8Array; contentType: string; status: number }
  | { ok: false; result: MediaFetchReport['result']; status: number | null; bytes: number; gone: boolean };

export function nextUtcMidnight(nowMs: number): number {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

/** H2: Core settles an unknown-size paid transfer by the bytes it moved. */
export function settledUnknownSizeCredits(bytes: number): number {
  return Math.max(1, Math.ceil((3 * Math.max(0, bytes)) / 1_000_000));
}

/** D8: only image bytes are ever kept (an HTML error page with a 200 is not). */
export function isImageContentType(value: string | null): value is string {
  if (value === null) return false;
  const type = value.split(';')[0]?.trim().toLowerCase() ?? '';
  return /^image\/[a-z0-9.+-]+$/.test(type) && type !== 'image/svg+xml';
}

function stateResult(state: MediaStateVM): OfapiMediaLoadResult {
  return { kind: 'state', state };
}

function clampWait(ms: number): number {
  return Math.min(MEDIA_WAIT_MAX_MS, Math.max(MEDIA_WAIT_MIN_MS, Math.round(ms)));
}

/** D3: a lost answer (timeout, dropped connection) — safe to ask again with the same id. */
function isTransportFailure(error: unknown): boolean {
  return error instanceof HubError && (error.reason === 'timeout' || error.reason === 'network');
}

/**
 * At most `limit` downloads at once. Clicks are served before automatic
 * loads; a waiter is re-checked right before it gets its slot, and a
 * cancelled one leaves the queue at once.
 */
function createSlots(limit: number) {
  let active = 0;
  const waiting: Record<MediaTriggerVM, SlotWaiter[]> = { click: [], auto: [] };
  function pump(): void {
    while (active < limit) {
      const next = waiting.click.shift() ?? waiting.auto.shift();
      if (next === undefined) return;
      if (next.settled) continue;
      next.settled = true;
      active += 1;
      next.resolve(true);
    }
  }
  return {
    waiter(priority: MediaTriggerVM): { waiter: SlotWaiter; granted: Promise<boolean> } {
      let resolve: (granted: boolean) => void = () => undefined;
      const granted = new Promise<boolean>((done) => {
        resolve = done;
      });
      const waiter: SlotWaiter = { priority, settled: false, resolve };
      waiting[priority].push(waiter);
      pump();
      return { waiter, granted };
    },
    /** True when the waiter had not started (it resolves `false`). */
    cancel(waiter: SlotWaiter): boolean {
      if (waiter.settled) return false;
      waiter.settled = true;
      const queue = waiting[waiter.priority];
      const index = queue.indexOf(waiter);
      if (index >= 0) queue.splice(index, 1);
      waiter.resolve(false);
      return true;
    },
    release(): void {
      active -= 1;
      pump();
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
  /** D4: accounts whose Core answered 404/405 — a missing route, or no grant. */
  const unsupportedAccounts = new Set<string>();
  /** D4: Core rate-limited this device (the limit is per device, not per file). */
  let throttledUntil = 0;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let flushDueAt = Number.POSITIVE_INFINITY;
  let flushing: Promise<void> | null = null;
  let disposed = false;

  function memoFor(token: string): TokenMemo {
    let memo = memos.get(token);
    if (memo === undefined) {
      memo = { state: { state: 'idle' }, waitUntil: null, autoBlock: null, failures: [], inflight: null, queued: null };
      memos.set(token, memo);
    }
    return memo;
  }

  function noteFailure(memo: TokenMemo): void {
    memo.failures.push(now());
  }

  /** Remember `state` for automatic loads until `until`, and answer it. */
  function blockAuto(memo: TokenMemo, until: number, state: MediaStateVM): OfapiMediaLoadResult {
    memo.autoBlock = { until, state };
    return stateResult(state);
  }

  /** D1: a paid hand-out that did not end as a cached image — never again automatically today. */
  function latchPaid(memo: TokenMemo, state: MediaStateVM = { state: 'load', reason: 'failed' }): OfapiMediaLoadResult {
    return blockAuto(memo, nextUtcMidnight(now()), state);
  }

  function waitState(until: number): MediaStateVM {
    return { state: 'wait', retryAfterMs: clampWait(until - now()) };
  }

  /** What an automatic load answers without Core, or null to go ahead. */
  function autoAnswer(memo: TokenMemo): MediaStateVM | null {
    const t = now();
    if (t < throttledUntil) return waitState(throttledUntil);
    const block = memo.autoBlock;
    if (block !== null) {
      if (t < block.until) return block.state.state === 'wait' ? waitState(block.until) : block.state;
      memo.autoBlock = null;
    }
    memo.failures = memo.failures.filter((at) => t - at < 3_600_000);
    if (memo.failures.length >= MEDIA_AUTO_FAILURES_PER_HOUR) return { state: 'load', reason: 'failed' };
    return null;
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
        const contentType = response.headers.get('content-type');
        if (!isImageContentType(contentType)) {
          // An error page served with 200 must never become a cached "image".
          await response.body?.getReader().cancel().catch(() => undefined);
          return { ok: false, result: 'failed', status: response.status, bytes: 0, gone: false };
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
        return { ok: true, data, contentType, status: response.status };
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

  // ─── Reports (D6) ───────────────────────────────────────────────────────

  /** An earlier flush always wins: a pending 60 s retry never delays new reports' 2 s flush. */
  function scheduleFlush(delayMs: number): void {
    if (disposed) return;
    const due = Date.now() + delayMs;
    if (flushTimer !== null) {
      if (flushDueAt <= due) return;
      clearTimeout(flushTimer);
    }
    flushDueAt = due;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushDueAt = Number.POSITIVE_INFINITY;
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
      if (hub === null) {
        // Signed out or not configured yet (e.g. at startup): try again later.
        if (deps.reports.next(1).length > 0) scheduleFlush(REPORT_RETRY_DELAY_MS);
        return;
      }
      for (let round = 0; round < REPORT_ROUNDS; round += 1) {
        const batch = deps.reports.next(REPORT_BATCH);
        if (batch.length === 0) return;
        const ids = batch.map((report) => report.resolveId);
        try {
          // `null` = this Core has no media routes: nothing can take them.
          await hub.reportMediaFetches({ reports: batch });
          deps.reports.remove(ids);
        } catch {
          deps.reports.noteAttempt(ids);
          // A batch Core keeps refusing must not wedge the queue: Core already
          // counts a report that never arrives as "unknown", never "free".
          const dropped = deps.reports.dropExhausted(MEDIA_REPORT_MAX_ATTEMPTS);
          if (dropped > 0) {
            deps.onLog?.('warn', 'media reports dropped after repeated refusals', { dropped, attempts: MEDIA_REPORT_MAX_ATTEMPTS });
          }
          scheduleFlush(REPORT_RETRY_DELAY_MS);
          return;
        }
      }
      scheduleFlush(REPORT_FLUSH_DELAY_MS);
    })().finally(() => {
      flushing = null;
    });
    return flushing;
  }

  // ─── Resolve ────────────────────────────────────────────────────────────

  /** D3: one retry with the SAME requestId after a lost answer. */
  async function askCore(hub: MediaHubClient, request: HubMediaResolveRequest): Promise<HubMediaResolveResult> {
    try {
      return await hub.resolveMedia({ request });
    } catch (error) {
      if (!isTransportFailure(error)) throw error;
      return hub.resolveMedia({ request });
    }
  }

  async function resolveAndFetch(
    token: string,
    entry: OfapiEntry,
    trigger: MediaTriggerVM,
    surface: MediaSurfaceVM,
    memo: TokenMemo,
  ): Promise<OfapiMediaLoadResult> {
    const hub = await deps.hub().catch(() => null);
    if (hub === null) return stateResult({ state: 'unavailable' });
    let pendingLeft = MEDIA_PENDING_RETRIES;
    let rereadDone = false;
    let afterReread = false;

    /** One media-context re-read of what Core named, on an explicit click only. */
    const rereadOnce = async (target: HubMediaResolveResponse['reread']): Promise<boolean> => {
      if (trigger !== 'click' || rereadDone || target === null || deps.reread === undefined) return false;
      rereadDone = true;
      return deps.reread(entry.accountId, target).catch(() => false);
    };

    while (true) {
      let answer: HubMediaResolveResult;
      try {
        answer = await askCore(hub, {
          requestId: newRequestId(),
          accountId: entry.accountId,
          mediaId: entry.mediaId,
          variant: entry.variant,
          surface,
          trigger,
          ...(afterReread ? { afterReread: true } : {}),
        });
      } catch (error) {
        // A rejected credential is the sign-in flow's business: quiet here.
        if (error instanceof HubError && error.reason === 'auth') return stateResult({ state: 'unavailable' });
        noteFailure(memo);
        return stateResult({ state: 'load', reason: 'failed' });
      }
      // No media routes (an older Core, a rollback) or no grant: quietly unavailable, all session.
      if (answer.kind === 'unsupported') {
        unsupportedAccounts.add(entry.accountId);
        return stateResult({ state: 'unavailable' });
      }
      if (answer.kind === 'throttled') {
        throttledUntil = Math.max(throttledUntil, now() + clampWait(answer.retryAfterMs ?? MEDIA_THROTTLE_DEFAULT_MS));
        memo.waitUntil = throttledUntil;
        return stateResult(waitState(throttledUntil));
      }
      const response = answer.response;
      const paidUnknownSize = response.outcome === 'paid' && response.contentLength === null;
      if (response.credits > 0 && !paidUnknownSize) deps.recordCredits?.(response.resolveId, response.credits);
      switch (response.outcome) {
        case 'free_url':
        case 'ofapi_cache':
        case 'paid': {
          const paid = response.outcome === 'paid';
          if (response.url === null) {
            // A replayed answer whose hand-out Core no longer holds.
            if (paid) return latchPaid(memo);
            noteFailure(memo);
            return stateResult({ state: 'load', reason: 'failed' });
          }
          const maxBytes = response.maxBytes
            ?? (paid ? MEDIA_UNKNOWN_SIZE_GUARD_BYTES
              : entry.variant === 'full' ? MEDIA_FULL_GUARD_BYTES : MEDIA_THUMB_GUARD_BYTES);
          const fetched = await download(response.url, maxBytes);
          const bytesReceived = fetched.ok ? fetched.data.byteLength : fetched.bytes;
          // H2: Core reserved the guard price and settles by the bytes moved.
          if (paidUnknownSize) deps.recordCredits?.(response.resolveId, settledUnknownSizeCredits(bytesReceived));
          enqueueReport({
            resolveId: response.resolveId,
            result: fetched.ok ? 'ok' : fetched.result,
            bytesReceived,
            httpStatus: fetched.status,
          });
          if (fetched.ok) {
            memo.failures = [];
            memo.autoBlock = null;
            try {
              await deps.cache.putByKey(token, fetched.data, fetched.contentType);
            } catch {
              // Serving beats caching.
            }
            return { kind: 'bytes', data: fetched.data, contentType: fetched.contentType };
          }
          if (paid) {
            // D1: a paid transfer is never retried automatically — the next attempt is a click.
            return latchPaid(memo, fetched.gone ? { state: 'unavailable' } : { state: 'load', reason: 'failed' });
          }
          noteFailure(memo);
          if (fetched.gone) return blockAuto(memo, now() + MEDIA_NEGATIVE_TTL_MS, { state: 'unavailable' });
          return stateResult({ state: 'load', reason: 'failed' });
        }
        case 'cap_blocked': {
          if (response.reason === 'size_unknown') {
            return blockAuto(memo, now() + MEDIA_NEGATIVE_TTL_MS, { state: 'load', reason: 'size' });
          }
          if (response.reason === 'click_only') {
            // H7: full size is click-only at Core — no automatic ask today.
            return blockAuto(memo, nextUtcMidnight(now()), { state: 'load', reason: 'click' });
          }
          const retryAt = response.retryAt !== null ? Date.parse(response.retryAt) : Number.NaN;
          return blockAuto(memo, Number.isFinite(retryAt) ? retryAt : nextUtcMidnight(now()), { state: 'load', reason: 'budget' });
        }
        case 'source_expired': {
          if (await rereadOnce(response.reread)) {
            afterReread = true;
            continue;
          }
          return blockAuto(memo, now() + MEDIA_NEGATIVE_TTL_MS, { state: 'load', reason: 'expired' });
        }
        case 'pending': {
          if (pendingLeft > 0) {
            pendingLeft -= 1;
            await sleep(Math.min(Math.max(response.retryAfterMs ?? 1_000, 250), MEDIA_PENDING_WAIT_CAP_MS));
            continue;
          }
          if (response.reason === 'busy') {
            // Core's media transport is saturated: try again later, quietly.
            const until = now() + clampWait(Math.max(response.retryAfterMs ?? 0, MEDIA_BUSY_WAIT_MS));
            memo.waitUntil = until;
            return blockAuto(memo, until, waitState(until));
          }
          return blockAuto(memo, now() + MEDIA_NEGATIVE_TTL_MS, { state: 'load', reason: 'failed' });
        }
        case 'refused': {
          if (response.reason === 'not_ready') {
            // H3: an explicit click may re-read what Core named and ask again.
            if (await rereadOnce(response.reread)) {
              afterReread = true;
              continue;
            }
            return blockAuto(memo, now() + MEDIA_NOT_READY_TTL_MS, { state: 'processing', refresh: response.reread !== null });
          }
          return blockAuto(memo, now() + MEDIA_NEGATIVE_TTL_MS, { state: 'unavailable' });
        }
        case 'unavailable':
          return blockAuto(memo, now() + MEDIA_NEGATIVE_TTL_MS, { state: 'unavailable' });
        default:
          noteFailure(memo);
          return stateResult({ state: 'load', reason: 'failed' });
      }
    }
  }

  function cancelQueued(memo: TokenMemo): boolean {
    const waiter = memo.queued;
    if (waiter === null) return false;
    memo.queued = null;
    return slots.cancel(waiter);
  }

  return {
    canServe: (accountId) => deps.canServe(accountId),

    state(token) {
      const memo = memos.get(token);
      if (memo === undefined) return { state: 'idle' };
      if (memo.state.state === 'wait') return waitState(Math.max(memo.waitUntil ?? 0, throttledUntil));
      return memo.state;
    },

    cancel(token) {
      const memo = memos.get(token);
      return memo === undefined ? false : cancelQueued(memo);
    },

    async load(token, entry, options) {
      if (!deps.canServe(entry.accountId)) return stateResult({ state: 'unavailable' });
      const memo = memoFor(token);
      // An explicit click never waits behind this token's unstarted automatic load.
      if (options.trigger === 'click') cancelQueued(memo);
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
        if (unsupportedAccounts.has(entry.accountId)) return stateResult({ state: 'unavailable' });
        if (options.trigger === 'auto') {
          const answer = autoAnswer(memo);
          if (answer !== null) return stateResult(answer);
        } else {
          // The explicit click is what every automatic latch waits for.
          memo.autoBlock = null;
        }
        const { waiter, granted } = slots.waiter(options.trigger);
        const signal = options.signal;
        const onAbort = (): void => {
          if (memo.queued === waiter) cancelQueued(memo);
        };
        if (options.trigger === 'auto') {
          memo.queued = waiter;
          if (signal?.aborted === true) onAbort();
          else signal?.addEventListener('abort', onAbort, { once: true });
        }
        let started: boolean;
        try {
          started = await granted;
        } finally {
          if (memo.queued === waiter) memo.queued = null;
          signal?.removeEventListener('abort', onAbort);
        }
        // Cancelled before it started (the cell left the viewport): nothing asked, nothing spent.
        if (!started) return stateResult({ state: 'idle' });
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
