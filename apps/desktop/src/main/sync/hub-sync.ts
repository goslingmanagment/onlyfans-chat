// HubSync (SPEC §6.2; PRD F8): fetch-streaming SSE consumer of core's
// real-time fanout (`GET /api/v1/events/stream`, bearer chatter key).
// Contract live-verified 2026-06-11 against core commit de37911:
//   - frames `id: <fanout_seq>\nevent: sync\ndata: <SyncEvent JSON>\n\n`;
//   - `retry: 3000` on connect; `: keep-alive` comment every 30 s;
//   - server CLOSES every stream at the 15-min max lifetime — reconnect with
//     `?lastEventId=` resume is the NORMAL path, not an error path;
//   - cursor-less 401/403 = bad / non-chatter key → permanent stop;
//   - v2 cursor-bearing 401/403 may instead mean grant drift, so the client
//     authenticates through the fresh-cursor endpoint and state-reconciles
//     before replacing the cursor (snapshot auth failure is still terminal).
// The shared MessagesSseParser is LLM-shaped (no id/retry fields), so frame
// parsing is a small dedicated SSE-spec parser below, unit-tested directly.

import {
  domainSnapshotRequiredSchema,
  domainSnapshotResponseSchema,
  mapDomainFrame,
  parseDomainEventFrame,
  parseSyncEvent,
  syncSnapshotRequiredSchema,
  syncSnapshotRestartRequiredSchema,
  syncSnapshotResponseSchema,
  type SyncEvent,
  type SyncSnapshotRequired,
  type SyncSnapshotResponse,
} from '@chatgoose/shared/protocol/index';
import { z } from 'zod';
import type { SleepFn } from '../ofapi/rate-limiter';

export const HUB_SSE_PATH = '/api/v1/events/stream';
export const HUB_SNAPSHOT_PATH = '/api/v1/events/snapshot';
/** Kernel Stage 24: domain-event stream v2 (opaque per-account cursor). */
export const HUB_V2_SSE_PATH = '/api/v1/events/v2/stream';
export const HUB_V2_SNAPSHOT_PATH = '/api/v1/events/v2/snapshot';
export type HubSyncProtocol = 'v2' | 'v1';
export type HubSnapshotPageMode = 'probe' | 'bounded' | 'legacy';
export const HUB_SNAPSHOT_MESSAGE_LIMIT = 100;
export const HUB_SNAPSHOT_CURSOR_CONTRACT = 'bounded_v1';

/**
 * Durable "next request" for a replay-gap state walk. The record is written
 * only after onSnapshot has applied the preceding page, so resuming it can
 * skip already-committed pages without ever advancing the stream checkpoint.
 * v2 also pins the fresh target cursor minted for that exact state walk: using
 * a newer fresh cursor with an older persisted state cursor would skip the
 * events between the two baselines.
 */
export interface HubSnapshotRecoveryProgress {
  version: 2;
  scope: string;
  protocol: HubSyncProtocol;
  cursorContract: typeof HUB_SNAPSHOT_CURSOR_CONTRACT;
  messageLimit: number;
  afterSeq: number;
  accountIds: string[];
  accountIndex: number;
  snapshotCursor: number;
  pageMode: HubSnapshotPageMode;
  pageCursor: number;
  stateCursor: string | null;
  boundedStateAt: string | null;
  sourceV2Cursor: string | null;
  targetV2Cursor: string | null;
}
/** Server announces `retry: 3000` on connect; floor until it does. */
export const HUB_DEFAULT_RETRY_MS = 3_000;
export const HUB_RECONNECT_CAP_MS = 30_000;
/** Heartbeat is every 30 s — 45 s of total byte silence means a dead pipe. */
export const HUB_WATCHDOG_MS = 45_000;
const HUB_SNAPSHOT_RESTART_LIMIT = 3;

const hubBadRequestResponseSchema = z.discriminatedUnion('error', [
  // Service-level BadRequestError from Core's AppError handler.
  z.object({
    error: z.literal('bad_request'),
    message: z.string().min(1),
    statusCode: z.literal(400),
  }).strict(),
  // Fastify/Zod query validation fails before the route service runs.
  z.object({
    error: z.literal('Bad Request'),
    message: z.string().min(1),
    statusCode: z.literal(400),
  }).strict(),
]);

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
  /**
   * Stream protocol (Stage 24). Default 'v2'; 'v1' is the rollout-window-only
   * fallback, flippable per machine via the settings file — the v1 path (and
   * this flag) are deleted after fleet confirmation.
   */
  protocol?: HubSyncProtocol;
  /**
   * Stage 4 / Proposal 4.1: stamped on every hub request as `x-client-version`
   * so an idle-but-connected install (SSE + background reads only) still
   * shows up in the fleet-adoption release gate. Blank/absent omits the header.
   */
  clientVersion?: string;
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
  /** v2 opaque cursor (persisted under its OWN key — hubSync.lastEventId is
   *  retained untouched for the v1 fallback window). */
  getV2Cursor?: () => string | null;
  setV2Cursor?: (cursor: string) => void;
  /** Retained for runtime-wiring compatibility. Recovery must never clear a
   * cursor and reconnect cursor-less: core interprets no cursor as "start now". */
  clearV2Cursor?: () => void;
  /**
   * Durable replay-gap page progress. Production wiring scopes both the key
   * and this embedded value to the normalized Hub origin + bearer hash. Omit
   * the complete group only in isolated tests that do not exercise restart.
   */
  snapshotProgressScope?: string;
  getSnapshotProgress?: () => HubSnapshotRecoveryProgress | null;
  setSnapshotProgress?: (progress: HubSnapshotRecoveryProgress) => void;
  clearSnapshotProgress?: () => void;
  /**
   * Authenticated v2 rebaseline hook: refreshes the read-gateway account grant
   * set and returns the current OFAPI account ids. HubSync replaces its event
   * allowlist with this set before applying durable state pages.
   */
  onV2GapRecovered?: () => readonly string[] | Promise<readonly string[]>;
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
  | { kind: 'snapshot'; requirement: SyncSnapshotRequired }
  | { kind: 'snapshot-v2' };

class HubSnapshotAuthError extends Error {
  constructor(path: string, status: number) {
    super(`${path} authorization failed (${status})`);
    this.name = 'HubSnapshotAuthError';
  }
}

class HubSnapshotRestartRequiredError extends Error {
  constructor(
    readonly replayFloor: number,
    readonly persistedProgress: HubSnapshotRecoveryProgress | null,
  ) {
    super(`hub snapshot continuation is below replay floor ${replayFloor}`);
    this.name = 'HubSnapshotRestartRequiredError';
  }
}

class HubSnapshotPersistedCursorRejectedError extends Error {
  constructor(
    message: string,
    readonly persistedProgress: HubSnapshotRecoveryProgress,
  ) {
    super(`Core rejected persisted snapshot continuation: ${message}`);
    this.name = 'HubSnapshotPersistedCursorRejectedError';
  }
}

function isSnapshotAuthError(error: unknown): error is HubSnapshotAuthError {
  return error instanceof HubSnapshotAuthError;
}

export function createHubSync(options: HubSyncOptions): HubSync {
  const baseUrl = options.baseUrl.trim().replace(/\/+$/, '');
  const apiKey = options.apiKey.trim();
  const clientVersion = options.clientVersion?.trim();
  const versionHeaders: Record<string, string> =
    clientVersion !== undefined && clientVersion.length > 0
      ? { 'x-client-version': clientVersion }
      : {};
  const fetchImpl: HubSseFetch = options.fetchImpl ?? ((url, init) => fetch(url, init));
  const sleep: SleepFn =
    options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  const protocol: HubSyncProtocol = options.protocol ?? 'v2';
  if (protocol === 'v2' && (options.getV2Cursor === undefined || options.setV2Cursor === undefined)) {
    throw new Error('createHubSync: protocol v2 requires getV2Cursor/setV2Cursor');
  }
  const snapshotProgressParts = [
    options.snapshotProgressScope,
    options.getSnapshotProgress,
    options.setSnapshotProgress,
    options.clearSnapshotProgress,
  ];
  const hasAnySnapshotProgressPart = snapshotProgressParts.some((part) => part !== undefined);
  const hasSnapshotProgressStore = snapshotProgressParts.every((part) => part !== undefined);
  if (hasAnySnapshotProgressPart && !hasSnapshotProgressStore) {
    throw new Error('createHubSync: durable snapshot progress requires scope/get/set/clear');
  }
  if (hasSnapshotProgressStore && options.snapshotProgressScope!.trim().length === 0) {
    throw new Error('createHubSync: snapshot progress scope must not be blank');
  }

  let running = false;
  let status: HubSyncStatus = 'stopped';
  let dropped = 0;
  let abort: AbortController | null = null;
  /** Consecutive failed connections since the last byte received. */
  let failures = 0;
  let retryFloorMs = HUB_DEFAULT_RETRY_MS;
  let allowedAccountIds = options.accountIds === undefined
    ? null
    : new Set(options.accountIds);

  function orderedAccountIds(): string[] {
    if (allowedAccountIds === null) {
      return [];
    }
    return [...allowedAccountIds];
  }

  function sameAccountSet(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  function sameUniqueUnorderedAccountSet(
    left: readonly string[],
    right: readonly string[],
  ): boolean {
    const leftSet = new Set(left);
    const rightSet = new Set(right);
    if (leftSet.size !== left.length || rightSet.size !== right.length) {
      return false;
    }
    if (leftSet.size !== rightSet.size) {
      return false;
    }
    for (const value of leftSet) {
      if (!rightSet.has(value)) {
        return false;
      }
    }
    return true;
  }

  function sameSnapshotProgress(
    left: HubSnapshotRecoveryProgress,
    right: HubSnapshotRecoveryProgress,
  ): boolean {
    return left.version === right.version
      && left.scope === right.scope
      && left.protocol === right.protocol
      && left.cursorContract === right.cursorContract
      && left.messageLimit === right.messageLimit
      && left.afterSeq === right.afterSeq
      && sameAccountSet(left.accountIds, right.accountIds)
      && left.accountIndex === right.accountIndex
      && left.snapshotCursor === right.snapshotCursor
      && left.pageMode === right.pageMode
      && left.pageCursor === right.pageCursor
      && left.stateCursor === right.stateCursor
      && left.boundedStateAt === right.boundedStateAt
      && left.sourceV2Cursor === right.sourceV2Cursor
      && left.targetV2Cursor === right.targetV2Cursor;
  }

  function clearStoredSnapshotProgress(
    expected?: HubSnapshotRecoveryProgress,
  ): boolean {
    if (!hasSnapshotProgressStore) {
      return expected === undefined;
    }
    if (expected !== undefined) {
      // Synchronous settings reads/writes run without an await boundary in the
      // sole Electron main process. Compare immediately before remove so a
      // restart can never erase a newer recovery record.
      const current = options.getSnapshotProgress!();
      if (current === null || !sameSnapshotProgress(current, expected)) {
        return false;
      }
    }
    try {
      options.clearSnapshotProgress!();
      return true;
    } catch (error) {
      // A failed cleanup cannot invalidate an already-written stream
      // checkpoint. Any later gap rejects this stale record by afterSeq/source.
      options.onWarn?.('hub snapshot progress cleanup failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  function validProgressShape(progress: HubSnapshotRecoveryProgress): boolean {
    if (
      progress.version !== 2
      || progress.scope !== options.snapshotProgressScope
      || progress.cursorContract !== HUB_SNAPSHOT_CURSOR_CONTRACT
      || progress.messageLimit !== HUB_SNAPSHOT_MESSAGE_LIMIT
      || !Number.isSafeInteger(progress.afterSeq)
      || progress.afterSeq < 0
      || !Number.isSafeInteger(progress.accountIndex)
      || progress.accountIndex < 0
      || progress.accountIndex > progress.accountIds.length
      || !Number.isSafeInteger(progress.snapshotCursor)
      || progress.snapshotCursor < 0
      || !Number.isSafeInteger(progress.pageCursor)
      || progress.pageCursor < 0
    ) {
      return false;
    }
    if (progress.accountIndex === progress.accountIds.length) {
      return progress.pageMode === 'probe'
        && progress.pageCursor === 0
        && progress.stateCursor === null
        && progress.boundedStateAt === null;
    }
    if (progress.pageMode === 'bounded') {
      return progress.pageCursor === 0
        && progress.stateCursor !== null
        && progress.stateCursor.length > 0
        && progress.boundedStateAt !== null
        && progress.boundedStateAt.length > 0;
    }
    if (progress.pageMode === 'legacy') {
      return progress.stateCursor === null && progress.boundedStateAt === null;
    }
    return progress.pageMode === 'probe'
      && progress.accountIndex > 0
      && progress.pageCursor === 0
      && progress.stateCursor === null
      && progress.boundedStateAt === null;
  }

  function readReusableSnapshotProgress(
    afterSeq: number,
    accountIds: readonly string[],
    sourceV2Cursor: string | null,
  ): HubSnapshotRecoveryProgress | null {
    if (!hasSnapshotProgressStore) {
      return null;
    }
    const progress = options.getSnapshotProgress!();
    if (progress === null) {
      return null;
    }
    const cursorBindingMatches = protocol === 'v2'
      ? sourceV2Cursor !== null
        && progress.sourceV2Cursor === sourceV2Cursor
        && progress.targetV2Cursor !== null
        && progress.targetV2Cursor.length > 0
      : progress.sourceV2Cursor === null && progress.targetV2Cursor === null;
    if (
      !validProgressShape(progress)
      || progress.protocol !== protocol
      || progress.afterSeq !== afterSeq
      || !sameAccountSet(progress.accountIds, accountIds)
      || !cursorBindingMatches
    ) {
      clearStoredSnapshotProgress();
      return null;
    }
    return progress;
  }

  function persistSnapshotProgress(progress: HubSnapshotRecoveryProgress): void {
    if (hasSnapshotProgressStore) {
      options.setSnapshotProgress!(progress);
    }
  }

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
    if (protocol === 'v2') {
      const cursor = options.getV2Cursor!();
      const resume = cursor !== null ? `?cursor=${encodeURIComponent(cursor)}` : '';
      return `${baseUrl}${HUB_V2_SSE_PATH}${resume}`;
    }
    const lastEventId = options.getLastEventId();
    const resume = lastEventId !== null ? `?lastEventId=${encodeURIComponent(lastEventId)}` : '';
    return `${baseUrl}${HUB_SSE_PATH}${resume}`;
  }

  async function handleFrame(frame: SseFrame): Promise<void> {
    if (protocol === 'v2') {
      return handleV2Frame(frame);
    }
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

  async function handleV2Frame(frame: SseFrame): Promise<void> {
    if (frame.event === 'ephemeral') {
      // Serve-time-only lane (typing) — apply, never checkpoint.
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
      return;
    }
    if (frame.event !== 'domain') {
      return; // unknown event names are forward-compat noise, not errors
    }
    let json: unknown;
    try {
      json = JSON.parse(frame.data);
    } catch {
      dropped += 1;
      return;
    }
    const domainFrame = parseDomainEventFrame(json);
    if (domainFrame === null) {
      dropped += 1;
      return;
    }
    const event = mapDomainFrame(domainFrame);
    if (event !== null && (allowedAccountIds === null || allowedAccountIds.has(event.accountId))) {
      await options.onEvent(event);
    }
    // Checkpoint AFTER handling so a crash mid-handle replays, never skips.
    // Unmapped/unknown types checkpoint too — that is the forward-compat
    // contract (the cursor must advance past events this client ignores).
    if (frame.id !== null && frame.id.length > 0) {
      options.setV2Cursor!(frame.id);
    }
  }

  /** v2 recovery obtains one cursor plus its atomically bound account refs,
   * verifies that an independent read-gateway refresh still names exactly that
   * set, then snapshots only those response-bound refs. A resumed page walk
   * keeps the OLD fresh target stored with that walk; pairing its state cursor
   * with a newly minted target would create an event-loss interval between the
   * two baselines. */
  async function recoverV2Cursor(): Promise<void> {
    const sourceV2Cursor = options.getV2Cursor!();
    if (sourceV2Cursor === null) {
      throw new Error('hub v2 recovery requires the rejected source cursor');
    }
    const snapshotAbort = new AbortController();
    abort = snapshotAbort;
    let response: Awaited<ReturnType<HubSseFetch>>;
    try {
      const snapshotUrl = new URL(`${baseUrl}${HUB_V2_SNAPSHOT_PATH}`);
      // Core uses the rejected, already-durable cursor as the lower bound for
      // its safe recovery watermark. Without it, old replay-only event classes
      // pin the new cursor near genesis and an erased account-sequence hole can
      // send this client through the same 409 -> snapshot loop forever.
      snapshotUrl.searchParams.set('sourceCursor', sourceV2Cursor);
      response = await fetchImpl(snapshotUrl.toString(), {
        method: 'GET',
        headers: {
          authorization: `Bearer ${apiKey}`,
          accept: 'application/json',
          ...versionHeaders,
        },
        signal: snapshotAbort.signal,
      });
    } finally {
      if (abort === snapshotAbort) {
        abort = null;
      }
    }
    if (response.status === 401 || response.status === 403) {
      throw new HubSnapshotAuthError('hub v2 snapshot', response.status);
    }
    if (response.status !== 200 || response.json === undefined) {
      throw new Error(`hub v2 snapshot request failed (${response.status})`);
    }
    const parsed = domainSnapshotResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error('hub v2 snapshot response failed validation');
    }
    if (!running) {
      throw new Error('hub v2 snapshot recovery stopped');
    }
    const newlyMintedCursor = parsed.data.cursor;
    const boundAccountIds = parsed.data.accounts.flatMap((account) =>
      account.accountRef === null ? [] : [account.accountRef]);
    if (options.onV2GapRecovered === undefined) {
      throw new Error('hub v2 account grant refresh is not configured');
    }
    const refreshedAccountIds = await options.onV2GapRecovered();
    if (!running) {
      throw new Error('hub v2 snapshot recovery stopped after grant refresh');
    }
    if (!sameUniqueUnorderedAccountSet(boundAccountIds, refreshedAccountIds)) {
      throw new Error('hub v2 snapshot grant scope changed while minting recovery cursor');
    }
    // Preserve Core's numeric-account order. It is part of the cursor response
    // binding and makes durable page progress stable across restarts.
    const accountIds = boundAccountIds;
    allowedAccountIds = new Set(accountIds);
    const reusableProgress = readReusableSnapshotProgress(0, accountIds, sourceV2Cursor);
    const targetV2Cursor = reusableProgress?.targetV2Cursor ?? newlyMintedCursor;
    const cursorBinding = { sourceV2Cursor, targetV2Cursor };
    // Shrink-to-zero is a valid authenticated grant state. There is no account
    // state to page, but the empty fresh cursor must still replace the stale
    // cursor so the client does not loop forever on the revoked grant.
    if (accountIds.length > 0) {
      await recoverStateSnapshots(0, accountIds, cursorBinding, reusableProgress);
    } else {
      clearStoredSnapshotProgress();
    }
    if (!running) {
      throw new Error('hub v2 snapshot recovery stopped');
    }
    // Checkpoint first. A crash before cleanup leaves a harmless record whose
    // source no longer matches getV2Cursor; the next gap refuses to reuse it.
    options.setV2Cursor!(targetV2Cursor);
    clearStoredSnapshotProgress();
  }

  /** Applies a complete, sticky-cursor state snapshot without advancing either
   * SSE cursor. The caller owns the final protocol-specific checkpoint. */
  async function recoverStateSnapshotsOnce(
    afterSeq: number,
    accountIds: readonly string[],
    cursorBinding: { sourceV2Cursor: string; targetV2Cursor: string } | null,
    reusableProgress: HubSnapshotRecoveryProgress | null,
  ): Promise<number> {
    if (allowedAccountIds === null || options.onSnapshot === undefined) {
      throw new Error('hub snapshot recovery is not configured');
    }
    let snapshotCursor: number | null = reusableProgress?.snapshotCursor ?? null;
    let lastPersistedProgress = reusableProgress;
    let accountIndex = reusableProgress?.accountIndex ?? 0;
    if (accountIndex === accountIds.length && snapshotCursor !== null) {
      return snapshotCursor;
    }
    for (; accountIndex < accountIds.length; accountIndex += 1) {
      const accountId = accountIds[accountIndex]!;
      const resumesThisAccount = reusableProgress?.accountIndex === accountIndex;
      let pageCursor = resumesThisAccount ? reusableProgress.pageCursor : 0;
      let stateCursor = resumesThisAccount ? reusableProgress.stateCursor : null;
      let boundedStateAt = resumesThisAccount ? reusableProgress.boundedStateAt : null;
      let pageMode: HubSnapshotPageMode = resumesThisAccount
        ? reusableProgress.pageMode
        : 'probe';
      for (;;) {
        if (!running) {
          throw new Error('hub snapshot recovery stopped');
        }
        const url = new URL(`${baseUrl}${HUB_SNAPSHOT_PATH}`);
        url.searchParams.set('accountId', accountId);
        url.searchParams.set('afterSeq', String(afterSeq));
        // `limit=1` is also the old-Core fallback bound: an older server strips
        // bounded_v1's additive fields, but will then return at most one
        // (complete) thread before the client continues legacy pagination.
        url.searchParams.set('pageCursor', String(pageMode === 'legacy' ? pageCursor : 0));
        url.searchParams.set('limit', '1');
        if (snapshotCursor !== null) {
          url.searchParams.set('snapshotCursor', String(snapshotCursor));
        }
        if (pageMode !== 'legacy') {
          url.searchParams.set('pageMode', 'bounded_v1');
          url.searchParams.set('messageLimit', String(HUB_SNAPSHOT_MESSAGE_LIMIT));
          if (stateCursor !== null) {
            url.searchParams.set('stateCursor', stateCursor);
          }
        }
        // Only the exact continuation loaded at recovery start gets the
        // compatibility restart. A 400 on a fresh request, or on a cursor
        // minted during this run, is a real contract failure and must surface.
        const resumesPersistedStateCursor = reusableProgress !== null
          && lastPersistedProgress === reusableProgress
          && accountIndex === reusableProgress.accountIndex
          && snapshotCursor === reusableProgress.snapshotCursor
          && pageMode === reusableProgress.pageMode
          && pageCursor === reusableProgress.pageCursor
          && stateCursor !== null
          && stateCursor === reusableProgress.stateCursor;
        const snapshotAbort = new AbortController();
        abort = snapshotAbort;
        let response: Awaited<ReturnType<HubSseFetch>>;
        try {
          response = await fetchImpl(url.toString(), {
            method: 'GET',
            headers: {
              authorization: `Bearer ${apiKey}`,
              accept: 'application/json',
              ...versionHeaders,
            },
            signal: snapshotAbort.signal,
          });
        } finally {
          if (abort === snapshotAbort) {
            abort = null;
          }
        }
        if (response.status === 409 && response.json !== undefined) {
          const restart = syncSnapshotRestartRequiredSchema.safeParse(await response.json());
          if (restart.success) {
            throw new HubSnapshotRestartRequiredError(
              restart.data.replayFloor,
              lastPersistedProgress,
            );
          }
        }
        if (response.status === 400 && response.json !== undefined) {
          const badRequest = hubBadRequestResponseSchema.safeParse(await response.json());
          if (badRequest.success && resumesPersistedStateCursor) {
            throw new HubSnapshotPersistedCursorRejectedError(
              badRequest.data.message,
              reusableProgress,
            );
          }
        }
        if (response.status === 404) {
          options.onWarn?.('hub snapshot account not assigned; refusing partial recovery', {
            accountId,
          });
          throw new Error(`hub snapshot account ${accountId} is not assigned`);
        }
        if (response.status === 401 || response.status === 403) {
          throw new HubSnapshotAuthError('hub snapshot', response.status);
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
          || snapshot.requestedAfterSeq !== afterSeq
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
        let nextAccountIndex = accountIndex;
        let nextPageMode: HubSnapshotPageMode;
        let nextPageCursor: number;
        let nextStateCursor: string | null;
        let nextBoundedStateAt: string | null;
        if (snapshot.nextStateCursor !== undefined) {
          if (snapshot.nextPageCursor !== null) {
            throw new Error('hub bounded snapshot returned an ambiguous legacy page cursor');
          }
          const stateAt = boundedStateAt ?? snapshot.stateAt;
          if (snapshot.stateAt !== stateAt) {
            throw new Error('hub bounded snapshot state timestamp changed during recovery');
          }
          if (snapshot.nextStateCursor === null) {
            nextAccountIndex = accountIndex + 1;
            nextPageMode = 'probe';
            nextPageCursor = 0;
            nextStateCursor = null;
            nextBoundedStateAt = null;
          } else {
            if (snapshot.nextStateCursor === stateCursor) {
              throw new Error('hub bounded snapshot cursor did not advance');
            }
            nextPageMode = 'bounded';
            nextPageCursor = 0;
            nextStateCursor = snapshot.nextStateCursor;
            nextBoundedStateAt = stateAt;
          }
        } else if (snapshot.nextPageCursor === null) {
          // Old Core terminal page.
          nextAccountIndex = accountIndex + 1;
          nextPageMode = 'probe';
          nextPageCursor = 0;
          nextStateCursor = null;
          nextBoundedStateAt = null;
        } else {
          // Old Core (or a Core rollback during a bounded walk) strips the
          // additive fields. The current page is idempotent; persist its
          // returned thread cursor and continue one complete thread at a time.
          nextPageMode = 'legacy';
          nextPageCursor = snapshot.nextPageCursor;
          nextStateCursor = null;
          nextBoundedStateAt = null;
        }

        if (!running) {
          throw new Error('hub snapshot recovery stopped');
        }
        await options.onSnapshot(snapshot);
        // A controlled runtime retirement may close the DB as soon as stop()
        // returns. Do not introduce a new post-stop settings write; repeating
        // this idempotent page after the next activation is the safe fallback.
        if (!running) {
          throw new Error('hub snapshot recovery stopped after page apply');
        }
        // Store the NEXT request only after the current page is durably and
        // idempotently applied. A persistence failure leaves the stream cursor
        // stale, so repeating this page is safe and cannot skip state.
        const nextProgress: HubSnapshotRecoveryProgress = {
          version: 2,
          scope: options.snapshotProgressScope ?? '',
          protocol,
          cursorContract: HUB_SNAPSHOT_CURSOR_CONTRACT,
          messageLimit: HUB_SNAPSHOT_MESSAGE_LIMIT,
          afterSeq,
          accountIds: [...accountIds],
          accountIndex: nextAccountIndex,
          snapshotCursor,
          pageMode: nextPageMode,
          pageCursor: nextPageCursor,
          stateCursor: nextStateCursor,
          boundedStateAt: nextBoundedStateAt,
          sourceV2Cursor: cursorBinding?.sourceV2Cursor ?? null,
          targetV2Cursor: cursorBinding?.targetV2Cursor ?? null,
        };
        persistSnapshotProgress(nextProgress);
        lastPersistedProgress = nextProgress;

        if (nextAccountIndex !== accountIndex) {
          break;
        }
        pageMode = nextPageMode;
        pageCursor = nextPageCursor;
        stateCursor = nextStateCursor;
        boundedStateAt = nextBoundedStateAt;
      }
    }
    if (snapshotCursor === null) {
      throw new Error('hub snapshot recovery produced no snapshot pages');
    }
    return snapshotCursor;
  }

  async function recoverStateSnapshots(
    afterSeq: number,
    accountIds: readonly string[],
    cursorBinding: { sourceV2Cursor: string; targetV2Cursor: string } | null,
    reusableProgress: HubSnapshotRecoveryProgress | null,
  ): Promise<number> {
    let progress = reusableProgress;
    let floorRestartCount = 0;
    let persistedCursorRestarted = false;
    for (;;) {
      try {
        return await recoverStateSnapshotsOnce(
          afterSeq,
          accountIds,
          cursorBinding,
          progress,
        );
      } catch (error) {
        if (error instanceof HubSnapshotPersistedCursorRejectedError) {
          if (persistedCursorRestarted) {
            throw error;
          }
          if (!clearStoredSnapshotProgress(error.persistedProgress)) {
            throw new Error(
              'hub snapshot progress changed during persisted-cursor restart',
              { cause: error },
            );
          }
          options.onWarn?.('hub persisted snapshot cursor rejected; restarting once fresh', {
            error: error.message,
          });
          persistedCursorRestarted = true;
          progress = null;
          continue;
        }
        if (!(error instanceof HubSnapshotRestartRequiredError)) {
          throw error;
        }
        if (
          error.persistedProgress !== null
          && !clearStoredSnapshotProgress(error.persistedProgress)
        ) {
          throw new Error('hub snapshot progress changed during floor restart', { cause: error });
        }
        if (floorRestartCount >= HUB_SNAPSHOT_RESTART_LIMIT) {
          throw new Error(
            `hub snapshot replay floor kept moving after ${HUB_SNAPSHOT_RESTART_LIMIT + 1} attempts`,
            { cause: error },
          );
        }
        options.onWarn?.('hub snapshot floor advanced; restarting state walk', {
          replayFloor: error.replayFloor,
          restartAttempt: floorRestartCount + 1,
        });
        floorRestartCount += 1;
        progress = null;
      }
    }
  }

  async function recoverSnapshots(requirement: SyncSnapshotRequired): Promise<void> {
    if (allowedAccountIds === null) {
      throw new Error('hub snapshot recovery account allowlist is not configured');
    }
    const accountIds = orderedAccountIds();
    // v1 has one global fanout sequence. An authenticated bootstrap with no
    // locally assigned accounts has no durable account projection to page; the
    // server's advertised current sequence is therefore the complete empty
    // baseline. Without this terminal case the client would retry the same 409
    // forever. A later grant rebuilds the runtime and performs normal account
    // bootstrap before starting its stream.
    if (accountIds.length === 0) {
      if (requirement.currentSeq < requirement.requestedSeq) {
        throw new Error('hub empty snapshot baseline moved backwards');
      }
      if (running) {
        options.setLastEventId(requirement.currentSeq);
        clearStoredSnapshotProgress();
      }
      return;
    }
    const reusableProgress = readReusableSnapshotProgress(
      requirement.requestedSeq,
      accountIds,
      null,
    );
    const snapshotCursor = await recoverStateSnapshots(
      requirement.requestedSeq,
      accountIds,
      null,
      reusableProgress,
    );
    if (running) {
      options.setLastEventId(snapshotCursor);
      clearStoredSnapshotProgress();
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
          ...versionHeaders,
        },
        signal,
      });
      if (response.status === 401 || response.status === 403) {
        return { kind: 'auth' };
      }
      if (response.status === 409 && response.json !== undefined) {
        if (protocol === 'v2') {
          const parsed = domainSnapshotRequiredSchema.safeParse(await response.json());
          if (parsed.success) {
            options.onWarn?.('hub v2 cursor cannot be replayed; requesting fresh cursor', {
              accounts: parsed.data.accounts,
            });
            return { kind: 'snapshot-v2' };
          }
          return { kind: 'error' };
        }
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
        // A cursor-bearing v2 403 can be grant drift rather than dead auth.
        // Never clear and reconnect cursor-less: core baselines that at "now"
        // and the lost interval becomes unrecoverable. Instead authenticate via
        // the fresh-cursor endpoint, apply durable state pages, then persist.
        if (protocol === 'v2' && options.getV2Cursor!() !== null) {
          options.onWarn?.('hub v2 auth failure with a cursor; authenticating rebaseline', {});
          setStatus('degraded');
          try {
            await recoverV2Cursor();
            failures = 0;
            continue;
          } catch (error) {
            if (isSnapshotAuthError(error)) {
              setStatus('auth-failed');
              running = false;
              break;
            }
            options.onWarn?.('hub v2 authenticated rebaseline failed', {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        } else {
          setStatus('auth-failed');
          running = false;
          break;
        }
      }
      if (outcome.kind === 'clean-close') {
        // Silent reconnect+resume; status stays 'live' so polling never churns
        // through a restore/demote cycle every 15 minutes.
        await sleep(retryFloorMs);
        continue;
      }
      if (outcome.kind === 'snapshot-v2') {
        setStatus('degraded');
        try {
          await recoverV2Cursor();
          failures = 0;
          continue;
        } catch (error) {
          if (isSnapshotAuthError(error)) {
            setStatus('auth-failed');
            running = false;
            break;
          }
          options.onWarn?.('hub v2 cursor recovery failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
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
          if (isSnapshotAuthError(error)) {
            setStatus('auth-failed');
            running = false;
            break;
          }
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
