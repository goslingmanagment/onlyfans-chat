// HubSync (SPEC §6.2; PRD F8): fetch-streaming SSE consumer of core's
// real-time fanout (`GET /api/v1/events/stream`, bearer chatter key).
// Contract live-verified 2026-06-11 against core commit de37911:
//   - frames `id: <fanout_seq>\nevent: sync\ndata: <SyncEvent JSON>\n\n`;
//   - `retry: 3000` on connect; `: keep-alive` comment every 30 s;
//   - server CLOSES every stream at the 15-min max lifetime — reconnect with
//     `?lastEventId=` resume is the NORMAL path, not an error path;
//   - 401/403 = bad / non-chatter key → permanent stop (CG-HUB-01 family).
// The shared MessagesSseParser is LLM-shaped (no id/retry fields), so frame
// parsing is a small dedicated SSE-spec parser below, unit-tested directly.

import {
  parseSyncEvent,
  syncSnapshotRequiredSchema,
  syncSnapshotResponseSchema,
  type SyncEvent,
  type SyncSnapshotRequired,
  type SyncSnapshotResponse,
} from '@chatgoose/shared/protocol/index';
import type { SleepFn } from '../ofapi/rate-limiter';

export const HUB_SSE_PATH = '/api/v1/events/stream';
export const HUB_SNAPSHOT_PATH = '/api/v1/events/snapshot';
/** Server announces `retry: 3000` on connect; floor until it does. */
export const HUB_DEFAULT_RETRY_MS = 3_000;
export const HUB_RECONNECT_CAP_MS = 30_000;
/** Heartbeat is every 30 s — 45 s of total byte silence means a dead pipe. */
export const HUB_WATCHDOG_MS = 45_000;

// ─── SSE frame parser (per the WHATWG SSE spec, subset core emits) ────────

export interface SseFrame {
  event: string;
  data: string;
  /** Last `id:` seen at dispatch time (sticky across frames per the spec). */
  id: string | null;
}

export interface SseParserCallbacks {
  onFrame(frame: SseFrame): void | Promise<void>;
  onRetry?(retryMs: number): void;
}

/**
 * Incremental line parser: feed raw chunks, frames dispatch on blank lines.
 * Handles split-across-chunk lines, `:` comments, multi-line data, CRLF, and
 * id/event/data/retry in any order. Data-less blocks are dropped (spec).
 */
export class SseFrameParser {
  private readonly decoder = new TextDecoder();
  private buffer = '';
  private eventType = '';
  private dataLines: string[] = [];
  private lastEventId: string | null = null;

  /** Returns completed frames in arrival order; retry updates via callback. */
  push(chunk: string | Uint8Array, onRetry?: (retryMs: number) => void): SseFrame[] {
    this.buffer +=
      typeof chunk === 'string' ? chunk : this.decoder.decode(chunk, { stream: true });

    const frames: SseFrame[] = [];
    while (true) {
      const match = /\r\n|\n|\r/.exec(this.buffer);
      if (!match) {
        break;
      }
      // A lone trailing \r might be half of a \r\n split across chunks — wait.
      if (match[0] === '\r' && match.index === this.buffer.length - 1) {
        break;
      }
      const line = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      const frame = this.processLine(line, onRetry);
      if (frame) {
        frames.push(frame);
      }
    }
    return frames;
  }

  private processLine(line: string, onRetry?: (retryMs: number) => void): SseFrame | null {
    if (line === '') {
      // Blank line = dispatch. Spec: skip when the data buffer is empty.
      const frame =
        this.dataLines.length > 0
          ? {
              event: this.eventType || 'message',
              data: this.dataLines.join('\n'),
              id: this.lastEventId,
            }
          : null;
      this.eventType = '';
      this.dataLines = [];
      return frame;
    }
    if (line.startsWith(':')) {
      return null; // comment (keep-alive) — bytes alone feed the watchdog
    }
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) {
      value = value.slice(1);
    }
    switch (field) {
      case 'event':
        this.eventType = value;
        break;
      case 'data':
        this.dataLines.push(value);
        break;
      case 'id':
        if (!value.includes('\0')) {
          this.lastEventId = value;
        }
        break;
      case 'retry':
        if (/^\d+$/.test(value)) {
          onRetry?.(Number(value));
        }
        break;
      default:
        break; // unknown fields are ignored per spec
    }
    return null;
  }
}

// ─── Hub SSE consumer ──────────────────────────────────────────────────────

export type HubSyncStatus = 'connecting' | 'live' | 'degraded' | 'auth-failed' | 'stopped';

/** Structural reader subset of ReadableStream (real Response.body satisfies it). */
export interface HubSseBodyReader {
  read(): Promise<{ done: boolean; value?: Uint8Array | undefined }>;
  cancel(): Promise<unknown>;
}

export interface HubSseBody {
  getReader(): HubSseBodyReader;
}

/** Structural fetch subset (injectable; @types/node provides the globals). */
export type HubSseFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    signal: AbortSignal;
  },
) => Promise<{
  status: number;
  body: HubSseBody | null;
  json?: () => Promise<unknown>;
}>;

export interface HubSyncOptions {
  baseUrl: string;
  /** Chatter API key (`agency_hub_core_…`) — bearer token. */
  apiKey: string;
  fetchImpl?: HubSseFetch;
  now?: () => number;
  /** Backoff delays only — the watchdog uses real timers (abortable). */
  sleep?: SleepFn;
  /** Awaited before the frame's id is persisted (handle-then-checkpoint). */
  onEvent: (event: SyncEvent) => void | Promise<void>;
  /** Local OFAPI accounts this client is allowed to apply. Omit only in isolated tests. */
  accountIds?: readonly string[];
  /** Idempotently applies one validated snapshot page before its cursor is persisted. */
  onSnapshot?: (snapshot: SyncSnapshotResponse) => void | Promise<void>;
  onSnapshotRequired?: (requirement: SyncSnapshotRequired) => void;
  onStatusChange?: (status: HubSyncStatus) => void;
  /** Diagnostics sink for connection trouble (degraded / auth-failed); no-op by default. */
  onWarn?: (message: string, fields?: Record<string, unknown>) => void;
  getLastEventId: () => number | null;
  setLastEventId: (id: number) => void;
}

export interface HubSync {
  start(): void;
  stop(): void;
  status(): HubSyncStatus;
  /** Frames that failed parseSyncEvent and were dropped (diagnostics). */
  droppedFrameCount(): number;
}

type ConnectionOutcome =
  | { kind: 'clean-close' }
  | { kind: 'error' }
  | { kind: 'auth' }
  | { kind: 'stopped' }
  | { kind: 'snapshot'; requirement: SyncSnapshotRequired };

export function createHubSync(options: HubSyncOptions): HubSync {
  const baseUrl = options.baseUrl.trim().replace(/\/+$/, '');
  const apiKey = options.apiKey.trim();
  const fetchImpl: HubSseFetch = options.fetchImpl ?? ((url, init) => fetch(url, init));
  const sleep: SleepFn =
    options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  let running = false;
  let status: HubSyncStatus = 'stopped';
  let dropped = 0;
  let abort: AbortController | null = null;
  /** Consecutive failed connections since the last byte received. */
  let failures = 0;
  let retryFloorMs = HUB_DEFAULT_RETRY_MS;
  const allowedAccountIds = options.accountIds === undefined
    ? null
    : new Set(options.accountIds);

  function setStatus(next: HubSyncStatus): void {
    if (status !== next) {
      status = next;
      options.onStatusChange?.(next);
      if (next === 'degraded' || next === 'auth-failed') {
        options.onWarn?.(`hub SSE → ${next}`, { status: next });
      }
    }
  }

  function streamUrl(): string {
    const lastEventId = options.getLastEventId();
    const resume = lastEventId !== null ? `?lastEventId=${encodeURIComponent(lastEventId)}` : '';
    return `${baseUrl}${HUB_SSE_PATH}${resume}`;
  }

  async function handleFrame(frame: SseFrame): Promise<void> {
    if (frame.event !== 'sync') {
      return; // unknown event names are forward-compat noise, not errors
    }
    let json: unknown;
    try {
      json = JSON.parse(frame.data);
    } catch {
      dropped += 1;
      return;
    }
    const event = parseSyncEvent(json);
    if (event === null) {
      dropped += 1;
      return;
    }
    if (allowedAccountIds !== null && !allowedAccountIds.has(event.accountId)) {
      dropped += 1;
      return;
    }
    await options.onEvent(event);
    // Checkpoint AFTER handling so a crash mid-handle replays, never skips.
    if (frame.id !== null && /^\d+$/.test(frame.id)) {
      options.setLastEventId(Number(frame.id));
    }
  }

  async function recoverSnapshots(requirement: SyncSnapshotRequired): Promise<void> {
    if (allowedAccountIds === null || options.onSnapshot === undefined) {
      throw new Error('hub snapshot recovery is not configured');
    }
    let snapshotCursor: number | null = null;
    for (const accountId of allowedAccountIds) {
      let pageCursor = 0;
      for (;;) {
        if (!running) {
          throw new Error('hub snapshot recovery stopped');
        }
        const url = new URL(`${baseUrl}${HUB_SNAPSHOT_PATH}`);
        url.searchParams.set('accountId', accountId);
        url.searchParams.set('afterSeq', String(requirement.requestedSeq));
        url.searchParams.set('pageCursor', String(pageCursor));
        url.searchParams.set('limit', '50');
        if (snapshotCursor !== null) {
          url.searchParams.set('snapshotCursor', String(snapshotCursor));
        }
        const snapshotAbort = new AbortController();
        abort = snapshotAbort;
        let response: Awaited<ReturnType<HubSseFetch>>;
        try {
          response = await fetchImpl(url.toString(), {
            method: 'GET',
            headers: {
              authorization: `Bearer ${apiKey}`,
              accept: 'application/json',
            },
            signal: snapshotAbort.signal,
          });
        } finally {
          if (abort === snapshotAbort) {
            abort = null;
          }
        }
        if (response.status === 404) {
          options.onWarn?.('hub snapshot account not assigned; polling remains authoritative', {
            accountId,
          });
          break;
        }
        if (response.status === 401 || response.status === 403) {
          throw new Error(`hub snapshot authorization failed (${response.status})`);
        }
        if (response.status !== 200 || response.json === undefined) {
          throw new Error(`hub snapshot request failed (${response.status})`);
        }
        const parsed = syncSnapshotResponseSchema.safeParse(await response.json());
        if (!parsed.success) {
          throw new Error('hub snapshot response failed validation');
        }
        const snapshot = parsed.data;
        if (
          snapshot.page.accountId !== accountId
          || snapshot.requestedAfterSeq !== requirement.requestedSeq
        ) {
          throw new Error('hub snapshot response scope mismatch');
        }
        snapshotCursor ??= snapshot.snapshotCursor;
        if (snapshot.snapshotCursor !== snapshotCursor) {
          throw new Error('hub snapshot cursor changed during recovery');
        }
        if (!snapshot.resumeAllowed) {
          throw new Error('hub snapshot is partial; cursor advancement refused');
        }
        if (!running) {
          throw new Error('hub snapshot recovery stopped');
        }
        await options.onSnapshot(snapshot);
        if (snapshot.nextPageCursor === null) {
          break;
        }
        pageCursor = snapshot.nextPageCursor;
      }
    }
    if (running) {
      options.setLastEventId(snapshotCursor ?? requirement.currentSeq);
    }
  }

  async function connectOnce(): Promise<ConnectionOutcome> {
    abort = new AbortController();
    const signal = abort.signal;
    let receivedBytes = false;
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    const armWatchdog = (): void => {
      if (watchdog) {
        clearTimeout(watchdog);
      }
      watchdog = setTimeout(() => abort?.abort(new Error('hub-sse-watchdog')), HUB_WATCHDOG_MS);
    };

    try {
      const response = await fetchImpl(streamUrl(), {
        method: 'GET',
        headers: {
          authorization: `Bearer ${apiKey}`,
          accept: 'text/event-stream',
        },
        signal,
      });
      if (response.status === 401 || response.status === 403) {
        return { kind: 'auth' };
      }
      if (response.status === 409 && response.json !== undefined) {
        const parsed = syncSnapshotRequiredSchema.safeParse(await response.json());
        if (parsed.success) {
          options.onSnapshotRequired?.(parsed.data);
          return { kind: 'snapshot', requirement: parsed.data };
        }
        return { kind: 'error' };
      }
      if (response.status !== 200 || response.body === null) {
        return { kind: 'error' };
      }

      const parser = new SseFrameParser();
      const reader = response.body.getReader();
      // Mocked transports don't wire the body to the fetch signal — cancel the
      // reader on abort so a pending read() unblocks (resolves done).
      const onAbort = (): void => {
        void reader.cancel().catch(() => undefined);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      armWatchdog();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (signal.aborted) {
            return running ? { kind: 'error' } : { kind: 'stopped' }; // watchdog vs stop()
          }
          if (done) {
            break;
          }
          receivedBytes = true;
          failures = 0;
          armWatchdog();
          // Any bytes on an authorized stream mean the pipe works — heartbeats
          // included. Mark live on first data, not on response headers, so a
          // proxy that answers 200 and stalls never demotes polling.
          setStatus('live');
          for (const frame of parser.push(value ?? new Uint8Array(), (retryMs) => {
            retryFloorMs = retryMs;
          })) {
            await handleFrame(frame);
          }
        }
      } finally {
        signal.removeEventListener('abort', onAbort);
        await reader.cancel().catch(() => undefined);
      }
      // Stream ended without error: the 15-min server lifetime close (normal)
      // — but only when it actually carried bytes; an instant empty close is
      // a misbehaving endpoint and takes the backoff path.
      return receivedBytes ? { kind: 'clean-close' } : { kind: 'error' };
    } catch {
      return running ? { kind: 'error' } : { kind: 'stopped' };
    } finally {
      if (watchdog) {
        clearTimeout(watchdog);
      }
      abort = null;
    }
  }

  async function runLoop(): Promise<void> {
    while (running) {
      if (status !== 'live') {
        setStatus('connecting');
      }
      const outcome = await connectOnce();
      if (!running || outcome.kind === 'stopped') {
        break;
      }
      if (outcome.kind === 'auth') {
        setStatus('auth-failed');
        running = false;
        break;
      }
      if (outcome.kind === 'clean-close') {
        // Silent reconnect+resume; status stays 'live' so polling never churns
        // through a restore/demote cycle every 15 minutes.
        await sleep(retryFloorMs);
        continue;
      }
      if (outcome.kind === 'snapshot') {
        setStatus('degraded');
        options.onWarn?.('hub replay gap detected; applying snapshot', {
          requestedSeq: outcome.requirement.requestedSeq,
          oldestAvailableSeq: outcome.requirement.oldestAvailableSeq,
          currentSeq: outcome.requirement.currentSeq,
        });
        try {
          await recoverSnapshots(outcome.requirement);
          failures = 0;
          continue;
        } catch (error) {
          options.onWarn?.('hub snapshot recovery failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      setStatus('degraded');
      const delayMs = Math.min(HUB_RECONNECT_CAP_MS, retryFloorMs * 2 ** failures);
      failures += 1;
      await sleep(delayMs);
    }
    if (status !== 'auth-failed') {
      setStatus('stopped');
    }
  }

  return {
    start() {
      if (running) {
        return;
      }
      running = true;
      void runLoop();
    },
    stop() {
      running = false;
      abort?.abort(new Error('hub-sse-stopped'));
    },
    status: () => status,
    droppedFrameCount: () => dropped,
  };
}
