// HubSync: SSE frame parser, the stream consumer's reconnect/resume/watchdog
// state machine, and the hub-aware provider composition (SPEC §6.2).
// Wire facts live-verified 2026-06-11 against core commit de37911: frames
// `id/event:sync/data`, `retry: 3000` on connect, `: keep-alive` every 30 s,
// 15-min max stream lifetime (clean close = normal path).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSyncEvent } from '@chatgoose/shared/protocol/index';
import type {
  NormalizedSyncMessage,
  SyncEvent,
  SyncSnapshotResponse,
} from '@chatgoose/shared/protocol/index';
import {
  createHubSync,
  HUB_SNAPSHOT_PATH,
  HUB_V2_SNAPSHOT_PATH,
  HUB_V2_SSE_PATH,
  SseFrameParser,
  HUB_WATCHDOG_MS,
  type HubFrameMeta,
  type HubSseBody,
  type HubSseFetch,
  type HubSyncStatus,
  type SseFrame,
} from '../../src/main/sync/hub-sync';
import {
  createHubAwareSync,
  NOTIFICATION_MAX_AGE_MS,
  REVERIFY_MIN_INTERVAL_MS,
  type HubFactoryCallbacks,
} from '../../src/main/sync/hub-provider';
import type {
  HubMessageApplyOutcome,
  ListReadOutcome,
  ListReadTrigger,
  ListVerificationReason,
} from '../../src/main/sync/polling-sync';
import type { HubSync } from '../../src/main/sync/hub-sync';
import type { SyncProvider } from '../../src/main/sync/provider';
import { mapHubMessage } from '../../src/main/sync/mappers';
import { createDataLayer, type DataLayer } from '../../src/main/db/index';
import type { ChatUpsert, MessageUpsert } from '../../src/main/db/index';

const TEST_DRIVER = 'bsqlite3-mc-node';
const ACCT = 'acct_hub_test';
const NEW_ACCT = 'acct_hub_new';
const PROVIDER_NOW_MS = Date.parse('2026-06-11T12:00:00.000Z');

// ─── SSE frame parser ──────────────────────────────────────────────────────

describe('SseFrameParser', () => {
  function pushAll(parser: SseFrameParser, chunks: string[]): SseFrame[] {
    const frames: SseFrame[] = [];
    for (const chunk of chunks) {
      frames.push(...parser.push(chunk));
    }
    return frames;
  }

  it('parses the exact frame shape core emits (id, event, data)', () => {
    const frames = new SseFrameParser().push(
      'id: 41\nevent: sync\ndata: {"type":"typing","accountId":"a","chatId":"1"}\n\n',
    );
    expect(frames).toEqual([
      { event: 'sync', data: '{"type":"typing","accountId":"a","chatId":"1"}', id: '41' },
    ]);
  });

  it('reassembles frames split across arbitrary chunk boundaries', () => {
    const wire = 'id: 7\nev' + 'ent: sync\nda' + 'ta: {"x":1}\n' + '\nid: 8\nevent: sync\ndata: {"y":2}\n\n';
    // split into 3-char chunks — every line boundary lands mid-chunk somewhere
    const chunks: string[] = [];
    for (let i = 0; i < wire.length; i += 3) {
      chunks.push(wire.slice(i, i + 3));
    }
    const frames = pushAll(new SseFrameParser(), chunks);
    expect(frames).toEqual([
      { event: 'sync', data: '{"x":1}', id: '7' },
      { event: 'sync', data: '{"y":2}', id: '8' },
    ]);
  });

  it('handles multi-byte UTF-8 split across chunk boundaries', () => {
    const bytes = new TextEncoder().encode('data: {"t":"héllo🦆"}\n\n');
    const parser = new SseFrameParser();
    const frames: SseFrame[] = [];
    // cut inside the multi-byte sequences
    frames.push(...parser.push(bytes.slice(0, 12)));
    frames.push(...parser.push(bytes.slice(12, 13)));
    frames.push(...parser.push(bytes.slice(13)));
    expect(frames).toEqual([{ event: 'message', data: '{"t":"héllo🦆"}', id: null }]);
  });

  it('ignores keep-alive comments and unknown fields', () => {
    const frames = new SseFrameParser().push(
      ': keep-alive\n\n: keep-alive\nignored-field: x\ndata: 1\n\n',
    );
    expect(frames).toEqual([{ event: 'message', data: '1', id: null }]);
  });

  it('surfaces retry: as a callback and never as a frame', () => {
    const retries: number[] = [];
    const frames = new SseFrameParser().push('retry: 3000\n\nretry: nope\n\ndata: 1\n\n', (ms) =>
      retries.push(ms),
    );
    expect(retries).toEqual([3000]); // non-numeric retry dropped per spec
    expect(frames).toEqual([{ event: 'message', data: '1', id: null }]);
  });

  it('accepts id after data (any field order within the block)', () => {
    const frames = new SseFrameParser().push('data: {"a":1}\nevent: sync\nid: 9\n\n');
    expect(frames).toEqual([{ event: 'sync', data: '{"a":1}', id: '9' }]);
  });

  it('keeps the last event id sticky across frames (SSE spec)', () => {
    const frames = new SseFrameParser().push('id: 5\ndata: a\n\ndata: b\n\n');
    expect(frames.map((f) => f.id)).toEqual(['5', '5']);
  });

  it('joins multi-line data with newlines and drops data-less blocks', () => {
    const frames = new SseFrameParser().push('event: sync\n\ndata: line1\ndata: line2\n\n');
    expect(frames).toEqual([{ event: 'message', data: 'line1\nline2', id: null }]);
  });

  it('tolerates CRLF line endings, including a \\r\\n split across chunks', () => {
    const frames = pushAll(new SseFrameParser(), ['id: 3\r', '\ndata: x\r\n\r\n']);
    expect(frames).toEqual([{ event: 'message', data: 'x', id: '3' }]);
  });
});

// ─── stream helpers ────────────────────────────────────────────────────────

interface FakeStream {
  body: HubSseBody;
  /** Push raw SSE text to a (possibly pending) reader. */
  send(text: string): void;
  /** End the stream cleanly (server 15-min lifetime close). */
  close(): void;
}

function makeStream(): FakeStream {
  const encoder = new TextEncoder();
  const queue: Array<{ done: boolean; value?: Uint8Array }> = [];
  let pending: ((result: { done: boolean; value?: Uint8Array }) => void) | null = null;

  function deliver(result: { done: boolean; value?: Uint8Array }): void {
    if (pending) {
      const resolve = pending;
      pending = null;
      resolve(result);
    } else {
      queue.push(result);
    }
  }

  return {
    send: (text) => deliver({ done: false, value: encoder.encode(text) }),
    close: () => deliver({ done: true }),
    body: {
      getReader: () => ({
        read: () => {
          const queued = queue.shift();
          if (queued) {
            return Promise.resolve(queued);
          }
          return new Promise((resolve) => {
            pending = resolve;
          });
        },
        // cancel unblocks a pending read with done (watchdog/stop path)
        cancel: () => {
          deliver({ done: true });
          return Promise.resolve();
        },
      }),
    },
  };
}

interface FetchCall {
  url: string;
  headers: Record<string, string>;
}

function makeHarness(
  responses: Array<{ status: number; stream: FakeStream | null; json?: unknown }>,
): { fetchImpl: HubSseFetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchImpl: HubSseFetch = (url, init) => {
    calls.push({ url, headers: init.headers });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (!next) {
      throw new Error('no scripted response');
    }
    return Promise.resolve({
      status: next.status,
      body: next.stream?.body ?? null,
      ...(next.json === undefined ? {} : { json: () => Promise.resolve(next.json) }),
    });
  };
  return { fetchImpl, calls };
}

const TYPING_DATA = (chatId: string): string =>
  JSON.stringify({ type: 'typing', accountId: ACCT, chatId });

function syncFrame(id: number, data: string): string {
  return `id: ${id}\nevent: sync\ndata: ${data}\n\n`;
}

/** Flush the async runLoop chain without advancing timers. */
async function drainMicrotasks(): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    await Promise.resolve();
  }
}

// ─── hub-sync consumer ─────────────────────────────────────────────────────

describe('createHubSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  interface SyncHarness {
    sync: ReturnType<typeof createHubSync>;
    calls: FetchCall[];
    statuses: HubSyncStatus[];
    /** Interleaved log of onEvent + setLastEventId calls (order matters). */
    log: string[];
    sleeps: number[];
    lastEventId: () => number | null;
    transactions: () => number;
  }

  function makeSync(
    responses: Array<{ status: number; stream: FakeStream | null; json?: unknown }>,
    options: {
      initialLastEventId?: number | null;
      clientVersion?: string;
      accountIds?: readonly string[];
    } = {},
  ): SyncHarness {
    const { fetchImpl, calls } = makeHarness(responses);
    let transactions = 0;
    const statuses: HubSyncStatus[] = [];
    const log: string[] = [];
    const sleeps: number[] = [];
    let lastEventId: number | null = options.initialLastEventId ?? null;
    const sync = createHubSync({
      protocol: 'v1',
      baseUrl: 'https://hub.test/',
      apiKey: 'agency_hub_core_k1',
      fetchImpl,
      ...(options.clientVersion !== undefined ? { clientVersion: options.clientVersion } : {}),
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
      // D38: handling is synchronous and shares one transaction with the
      // checkpoint; the log still proves handle-then-persist order.
      onEvent: (event) => {
        log.push(`event:${event.type}`);
      },
      runInTransaction: (fn) => {
        transactions += 1;
        return fn();
      },
      accountIds: options.accountIds ?? [ACCT],
      onSnapshot: (snapshot) => {
        log.push(`snapshot:${snapshot.page.accountId}:${snapshot.nextPageCursor ?? 'done'}`);
      },
      onSnapshotRequired: (requirement) => {
        log.push(`gap:${requirement.requestedSeq}`);
      },
      onStatusChange: (status) => statuses.push(status),
      getLastEventId: () => lastEventId,
      setLastEventId: (id) => {
        lastEventId = id;
        log.push(`persist:${id}`);
      },
    });
    return {
      sync,
      calls,
      statuses,
      log,
      sleeps,
      lastEventId: () => lastEventId,
      transactions: () => transactions,
    };
  }

  it('happy stream: bearer auth, events in order, lastEventId persisted AFTER handling', async () => {
    const stream = makeStream();
    const h = makeSync([{ status: 200, stream }], { clientVersion: '0.1.29' });
    h.sync.start();
    await drainMicrotasks();

    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]?.url).toBe('https://hub.test/api/v1/events/stream'); // no resume param yet
    expect(h.calls[0]?.headers['authorization']).toBe('Bearer agency_hub_core_k1');
    expect(h.calls[0]?.headers['accept']).toBe('text/event-stream');
    // Stage 4 / Proposal 4.1: fleet-adoption gate reads this off every hub request.
    expect(h.calls[0]?.headers['x-client-version']).toBe('0.1.29');

    stream.send('retry: 3000\n\n');
    stream.send(syncFrame(41, TYPING_DATA('1')));
    stream.send(syncFrame(42, TYPING_DATA('2')));
    await drainMicrotasks();

    expect(h.log).toEqual(['event:typing', 'persist:41', 'event:typing', 'persist:42']);
    // D38: each frame's handling and its checkpoint share ONE transaction.
    expect(h.transactions()).toBe(2);
    expect(h.statuses).toEqual(['connecting', 'live']);
    expect(h.sync.status()).toBe('live');
    h.sync.stop();
  });

  it('15-min server close is the NORMAL path: silent reconnect with ?lastEventId resume', async () => {
    const first = makeStream();
    const second = makeStream();
    const h = makeSync([
      { status: 200, stream: first },
      { status: 200, stream: second },
    ]);
    h.sync.start();
    await drainMicrotasks();
    first.send('retry: 3000\n\n');
    first.send(syncFrame(7, TYPING_DATA('1')));
    await drainMicrotasks();

    first.close(); // server max-lifetime close
    await drainMicrotasks();

    expect(h.calls).toHaveLength(2);
    expect(h.calls[1]?.url).toBe('https://hub.test/api/v1/events/stream?lastEventId=7');
    // silent: never degraded, no churn through connecting
    expect(h.statuses).toEqual(['connecting', 'live']);
    expect(h.sleeps).toEqual([3000]); // reconnect delay honors the server retry
    second.send(syncFrame(8, TYPING_DATA('2')));
    await drainMicrotasks();
    expect(h.lastEventId()).toBe(8);
    h.sync.stop();
  });

  it('resumes from a persisted lastEventId on the very first connect', async () => {
    const stream = makeStream();
    const h = makeSync([{ status: 200, stream }], { initialLastEventId: 612 });
    h.sync.start();
    await drainMicrotasks();
    expect(h.calls[0]?.url).toBe('https://hub.test/api/v1/events/stream?lastEventId=612');
    h.sync.stop();
  });

  it('409 replay gap applies every snapshot page before checkpointing and reconnecting', async () => {
    const resumed = makeStream();
    const requirement = {
      error: 'sync_snapshot_required',
      message: 'cursor expired',
      statusCode: 409,
      version: 1,
      requestedSeq: 7,
      oldestAvailableSeq: 12,
      currentSeq: 20,
      snapshotPath: '/api/v1/events/snapshot',
    };
    const snapshot = (nextPageCursor: number | null): SyncSnapshotResponse => ({
      version: 1,
      requestedAfterSeq: 7,
      snapshotCursor: 22,
      stateAt: '2026-06-19T18:00:00.000Z',
      resumeAllowed: true,
      page: {
        pageId: 1,
        label: 'lora-of',
        accountId: ACCT,
        username: 'lora',
        authStatus: 'connected',
        authenticated: true,
        authChangedAt: '2026-06-19T17:00:00.000Z',
      },
      coverage: {
        durableDomains: ['chat_heads', 'hot_messages', 'message_tombstones', 'account_auth'],
        omittedDomains: [
          { domain: 'presence', reason: 'ephemeral_not_snapshotted' },
          { domain: 'typing', reason: 'ephemeral_not_snapshotted' },
        ],
        messageWindow: 'hot_projection_plus_archive_delta',
      },
      threads: [],
      unresolvedTombstones: [],
      nextPageCursor,
    });
    const h = makeSync(
      [
        { status: 409, stream: null, json: requirement },
        { status: 200, stream: null, json: snapshot(5) },
        { status: 200, stream: null, json: snapshot(null) },
        { status: 200, stream: resumed },
      ],
      { initialLastEventId: 7, clientVersion: '0.1.29' },
    );

    h.sync.start();
    await drainMicrotasks();

    expect(h.calls.map((call) => call.url)).toEqual([
      'https://hub.test/api/v1/events/stream?lastEventId=7',
      'https://hub.test/api/v1/events/snapshot?accountId=acct_hub_test&afterSeq=7&pageCursor=0&limit=1&pageMode=bounded_v1&messageLimit=100',
      'https://hub.test/api/v1/events/snapshot?accountId=acct_hub_test&afterSeq=7&pageCursor=5&limit=1&snapshotCursor=22',
      'https://hub.test/api/v1/events/stream?lastEventId=22',
    ]);
    // v1 snapshot recovery requests carry the header too, not just the SSE connect.
    expect(h.calls[1]?.headers['x-client-version']).toBe('0.1.29');
    expect(h.calls[2]?.headers['x-client-version']).toBe('0.1.29');
    expect(h.log).toEqual([
      'gap:7',
      `snapshot:${ACCT}:5`,
      `snapshot:${ACCT}:done`,
      'persist:22',
    ]);
    expect(h.statuses).toEqual(['connecting', 'degraded', 'connecting']);

    resumed.send(syncFrame(23, TYPING_DATA('9')));
    await drainMicrotasks();
    expect(h.log.at(-2)).toBe('event:typing');
    expect(h.log.at(-1)).toBe('persist:23');
    expect(h.sync.status()).toBe('live');
    h.sync.stop();
  });

  it('checkpoints the authenticated empty v1 baseline without requesting impossible account pages', async () => {
    const resumed = makeStream();
    const requirement = {
      error: 'sync_snapshot_required',
      message: 'cursor expired',
      statusCode: 409,
      version: 1,
      requestedSeq: 7,
      oldestAvailableSeq: 12,
      currentSeq: 20,
      snapshotPath: '/api/v1/events/snapshot',
    };
    const h = makeSync([
      { status: 409, stream: null, json: requirement },
      { status: 200, stream: resumed },
    ], { initialLastEventId: 7, accountIds: [] });

    h.sync.start();
    await drainMicrotasks();

    expect(h.calls.map((call) => call.url)).toEqual([
      'https://hub.test/api/v1/events/stream?lastEventId=7',
      'https://hub.test/api/v1/events/stream?lastEventId=20',
    ]);
    expect(h.log).toEqual(['gap:7', 'persist:20']);
    expect(h.lastEventId()).toBe(20);
    h.sync.stop();
  });

  it('follows bounded state subpages and checkpoints only after terminal nextStateCursor', async () => {
    const resumed = makeStream();
    const requirement = {
      error: 'sync_snapshot_required',
      message: 'cursor expired',
      statusCode: 409,
      version: 1,
      requestedSeq: 7,
      oldestAvailableSeq: 12,
      currentSeq: 20,
      snapshotPath: '/api/v1/events/snapshot',
    };
    const snapshot = (
      nextStateCursor: string | null,
    ): SyncSnapshotResponse & { nextStateCursor: string | null } => ({
      version: 1,
      requestedAfterSeq: 7,
      snapshotCursor: 22,
      stateAt: '2026-06-19T18:00:00.000Z',
      resumeAllowed: true,
      page: {
        pageId: 1,
        label: 'lora-of',
        accountId: ACCT,
        username: 'lora',
        authStatus: 'connected',
        authenticated: true,
        authChangedAt: '2026-06-19T17:00:00.000Z',
      },
      coverage: {
        durableDomains: ['chat_heads', 'hot_messages', 'message_tombstones', 'account_auth'],
        omittedDomains: [
          { domain: 'presence', reason: 'ephemeral_not_snapshotted' },
          { domain: 'typing', reason: 'ephemeral_not_snapshotted' },
        ],
        messageWindow: 'hot_projection_plus_archive_delta',
      },
      threads: [],
      unresolvedTombstones: [],
      nextPageCursor: null,
      nextStateCursor,
    });
    const h = makeSync([
      { status: 409, stream: null, json: requirement },
      { status: 200, stream: null, json: snapshot('STATE_A') },
      { status: 200, stream: null, json: snapshot(null) },
      { status: 200, stream: resumed },
    ], { initialLastEventId: 7 });

    h.sync.start();
    await drainMicrotasks();

    expect(h.calls.map((call) => call.url)).toEqual([
      'https://hub.test/api/v1/events/stream?lastEventId=7',
      'https://hub.test/api/v1/events/snapshot?accountId=acct_hub_test&afterSeq=7&pageCursor=0&limit=1&pageMode=bounded_v1&messageLimit=100',
      'https://hub.test/api/v1/events/snapshot?accountId=acct_hub_test&afterSeq=7&pageCursor=0&limit=1&snapshotCursor=22&pageMode=bounded_v1&messageLimit=100&stateCursor=STATE_A',
      'https://hub.test/api/v1/events/stream?lastEventId=22',
    ]);
    expect(h.log).toEqual([
      'gap:7',
      `snapshot:${ACCT}:done`,
      `snapshot:${ACCT}:done`,
      'persist:22',
    ]);
    h.sync.stop();
  });

  it('refuses to checkpoint a partial snapshot', async () => {
    let call = 0;
    let lastEventId = 7;
    const sync = createHubSync({
      protocol: 'v1',
      baseUrl: 'https://hub.test',
      apiKey: 'k',
      accountIds: [ACCT],
      fetchImpl: () => {
        call += 1;
        if (call === 1) {
          return Promise.resolve({
            status: 409,
            body: null,
            json: () => Promise.resolve({
              error: 'sync_snapshot_required',
              message: 'cursor expired',
              statusCode: 409,
              version: 1,
              requestedSeq: 7,
              oldestAvailableSeq: 12,
              currentSeq: 20,
              snapshotPath: '/api/v1/events/snapshot',
            }),
          });
        }
        return Promise.resolve({
          status: 200,
          body: null,
          json: () => Promise.resolve({
            version: 1,
            requestedAfterSeq: 7,
            snapshotCursor: 20,
            stateAt: '2026-06-19T18:00:00.000Z',
            resumeAllowed: false,
            page: {
              pageId: 1,
              label: 'lora-of',
              accountId: ACCT,
              username: null,
              authStatus: null,
              authenticated: null,
              authChangedAt: null,
            },
            coverage: {
              durableDomains: ['account_auth'],
              omittedDomains: [
                { domain: 'message_tombstones', reason: 'dm_cold_archive_disabled' },
              ],
              messageWindow: 'hot_projection_plus_archive_delta',
            },
            threads: [],
            unresolvedTombstones: [],
            nextPageCursor: null,
          }),
        });
      },
      sleep: () => new Promise(() => undefined),
      onEvent: () => undefined,
      onSnapshot: () => undefined,
      getLastEventId: () => lastEventId,
      setLastEventId: (id) => {
        lastEventId = id;
      },
    });

    sync.start();
    await drainMicrotasks();

    expect(call).toBe(2);
    expect(lastEventId).toBe(7);
    expect(sync.status()).toBe('degraded');
    sync.stop();
  });

  it('does not advance the cursor when no account produces a snapshot', async () => {
    let call = 0;
    let lastEventId = 7;
    const warnings: string[] = [];
    const sync = createHubSync({
      protocol: 'v1',
      baseUrl: 'https://hub.test',
      apiKey: 'k',
      accountIds: [ACCT],
      fetchImpl: () => {
        call += 1;
        if (call === 1) {
          return Promise.resolve({
            status: 409,
            body: null,
            json: () => Promise.resolve({
              error: 'sync_snapshot_required',
              message: 'cursor expired',
              statusCode: 409,
              version: 1,
              requestedSeq: 7,
              oldestAvailableSeq: 12,
              currentSeq: 20,
              snapshotPath: '/api/v1/events/snapshot',
            }),
          });
        }
        if (call === 2) {
          return Promise.resolve({ status: 404, body: null });
        }
        return new Promise(() => undefined);
      },
      sleep: () => new Promise(() => undefined),
      onEvent: () => undefined,
      onSnapshot: () => undefined,
      getLastEventId: () => lastEventId,
      setLastEventId: (id) => {
        lastEventId = id;
      },
      onWarn: (message) => warnings.push(message),
    });

    sync.start();
    await drainMicrotasks();

    expect(call).toBeGreaterThanOrEqual(2);
    expect(lastEventId).toBe(7);
    expect(sync.status()).toBe('degraded');
    expect(warnings).toContain('hub snapshot recovery failed');
    sync.stop();
  });

  it('watchdog: >45 s without any bytes kills the connection and reconnects degraded', async () => {
    const first = makeStream();
    const second = makeStream();
    const h = makeSync([
      { status: 200, stream: first },
      { status: 200, stream: second },
    ]);
    h.sync.start();
    await drainMicrotasks();
    first.send(syncFrame(1, TYPING_DATA('1'))); // healthy, then silence
    await drainMicrotasks();
    expect(h.sync.status()).toBe('live');

    await vi.advanceTimersByTimeAsync(HUB_WATCHDOG_MS - 1);
    expect(h.calls).toHaveLength(1); // not yet

    await vi.advanceTimersByTimeAsync(2);
    await drainMicrotasks();
    expect(h.statuses).toContain('degraded');
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1]?.url).toContain('lastEventId=1');

    // heartbeat comments alone feed the watchdog on the new connection
    second.send(': keep-alive\n\n');
    await drainMicrotasks();
    expect(h.sync.status()).toBe('live');
    h.sync.stop();
  });

  it('backoff honors the server retry floor and caps at 30 s', async () => {
    // all connects fail at the transport
    const calls: FetchCall[] = [];
    const sleeps: number[] = [];
    let failures = 0;
    const sync = createHubSync({
      protocol: 'v1',
      baseUrl: 'https://hub.test',
      apiKey: 'k',
      fetchImpl: (url, init) => {
        calls.push({ url, headers: init.headers });
        failures += 1;
        if (failures > 6) {
          return new Promise(() => undefined); // park after the ladder
        }
        return Promise.reject(new Error('connect refused'));
      },
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
      onEvent: () => undefined,
      getLastEventId: () => null,
      setLastEventId: () => undefined,
    });
    sync.start();
    await drainMicrotasks();
    expect(sleeps).toEqual([3000, 6000, 12000, 24000, 30000, 30000]);
    sync.stop();
  });

  it('a healthy connection resets the backoff ladder', async () => {
    const stream = makeStream();
    let phase = 0;
    const sleeps: number[] = [];
    const sync = createHubSync({
      protocol: 'v1',
      baseUrl: 'https://hub.test',
      apiKey: 'k',
      fetchImpl: () => {
        phase += 1;
        if (phase <= 2) {
          return Promise.reject(new Error('down')); // two failures: 3000, 6000
        }
        if (phase === 3) {
          return Promise.resolve({ status: 200, body: stream.body });
        }
        return new Promise(() => undefined);
      },
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
      onEvent: () => undefined,
      getLastEventId: () => null,
      setLastEventId: () => undefined,
    });
    sync.start();
    await drainMicrotasks();
    stream.send(syncFrame(1, TYPING_DATA('1'))); // bytes reset the ladder
    await drainMicrotasks();
    stream.close(); // clean close → floor delay, then park
    await drainMicrotasks();
    expect(sleeps).toEqual([3000, 6000, 3000]);
    sync.stop();
  });

  it('401 and 403 are permanent: auth-failed, no reconnect attempts', async () => {
    for (const status of [401, 403]) {
      const h = makeSync([{ status, stream: null }]);
      h.sync.start();
      await drainMicrotasks();
      expect(h.sync.status()).toBe('auth-failed');
      await vi.advanceTimersByTimeAsync(120_000);
      await drainMicrotasks();
      expect(h.calls).toHaveLength(1); // permanently stopped
      expect(h.statuses).toEqual(['connecting', 'auth-failed']);
    }
  });

  it('invalid frames are dropped and counted without killing the stream', async () => {
    const stream = makeStream();
    const h = makeSync([{ status: 200, stream }]);
    h.sync.start();
    await drainMicrotasks();

    stream.send(syncFrame(1, 'not-json{'));
    stream.send(syncFrame(2, JSON.stringify({ type: 'somethingUnknown' })));
    stream.send('id: 3\nevent: other-channel\ndata: {"ignored":true}\n\n');
    stream.send(syncFrame(4, TYPING_DATA('9')));
    await drainMicrotasks();

    expect(h.sync.droppedFrameCount()).toBe(2); // bad JSON + failed parseSyncEvent
    expect(h.log).toEqual(['event:typing', 'persist:4']); // invalid ids never persisted
    expect(h.sync.status()).toBe('live');
    expect(h.calls).toHaveLength(1); // stream survived
    h.sync.stop();
  });

  it('drops an event outside the local account set without advancing the cursor', async () => {
    const stream = makeStream();
    const h = makeSync([{ status: 200, stream }]);
    h.sync.start();
    await drainMicrotasks();

    stream.send(
      syncFrame(
        1,
        JSON.stringify({ type: 'typing', accountId: 'acct_not_local', chatId: '9' }),
      ),
    );
    stream.send(syncFrame(2, TYPING_DATA('9')));
    await drainMicrotasks();

    expect(h.sync.droppedFrameCount()).toBe(1);
    expect(h.log).toEqual(['event:typing', 'persist:2']);
    h.sync.stop();
  });

  it('stop() ends the loop without reconnecting', async () => {
    const stream = makeStream();
    const h = makeSync([{ status: 200, stream }]);
    h.sync.start();
    await drainMicrotasks();
    stream.send(syncFrame(1, TYPING_DATA('1')));
    await drainMicrotasks();

    h.sync.stop();
    await drainMicrotasks();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(h.sync.status()).toBe('stopped');
    expect(h.calls).toHaveLength(1);
  });

  it('accepts the messageDeleted union member from the wire (chatId absent)', async () => {
    const stream = makeStream();
    const events: SyncEvent[] = [];
    const { fetchImpl } = makeHarness([{ status: 200, stream }]);
    const sync = createHubSync({
      protocol: 'v1',
      baseUrl: 'https://hub.test',
      apiKey: 'k',
      fetchImpl,
      sleep: () => Promise.resolve(),
      onEvent: (event) => {
        events.push(event);
      },
      getLastEventId: () => null,
      setLastEventId: () => undefined,
    });
    sync.start();
    await drainMicrotasks();
    stream.send(
      syncFrame(5, JSON.stringify({ type: 'messageDeleted', accountId: ACCT, messageId: '1000001' })),
    );
    await drainMicrotasks();
    expect(events).toEqual([{ type: 'messageDeleted', accountId: ACCT, messageId: '1000001' }]);
    sync.stop();
  });

  it('accepts ppv/tip notification frames without messageId', () => {
    expect(parseSyncEvent({ type: 'ppvUnlocked', accountId: ACCT, chatId: '5' })).toEqual({
      type: 'ppvUnlocked',
      accountId: ACCT,
      chatId: '5',
    });
    expect(parseSyncEvent({ type: 'tipReceived', accountId: ACCT, chatId: '5', amountUsd: 5 })).toEqual({
      type: 'tipReceived',
      accountId: ACCT,
      chatId: '5',
      amountUsd: 5,
    });
  });

  it('keeps the id-only envelope when an enriched message body drifts out of schema', () => {
    const parsed = parseSyncEvent({
      type: 'messageReceived',
      accountId: ACCT,
      chatId: '5',
      messageId: '9001',
      message: {
        id: '9001',
        text: '<p>hello</p>',
        createdAt: '2026-06-11T12:00:00+00:00',
        isSentByMe: false,
        price: 0,
        media: [{ id: 'm1', type: 'new-upstream-type', isReady: true, locked: false }],
      },
    });

    expect(parsed).toMatchObject({
      type: 'messageReceived',
      accountId: ACCT,
      chatId: '5',
      messageId: '9001',
    });
    expect(parsed?.type === 'messageReceived' ? parsed.message : null).toBeUndefined();
  });
});

// ─── provider composition ──────────────────────────────────────────────────

/**
 * What HubSync does with a frame (D38): apply synchronously inside the frame
 * transaction, then run the returned post-commit effect. Async so a throwing
 * handler surfaces as a rejection, like a rejected frame.
 */
async function runEvent(
  callbacks: HubFactoryCallbacks,
  event: SyncEvent,
  meta?: HubFrameMeta,
): Promise<void> {
  const afterCommit = callbacks.onEvent(event, meta);
  if (typeof afterCommit === 'function') {
    afterCommit();
  }
}

interface FakePolling extends SyncProvider {
  pollAccount(accountId: string): Promise<void>;
  setHubPollingSuspended(suspended: boolean): void;
  suspensions: boolean[];
  forceRefreshCalls: number;
  refreshCalls: Array<{ accountId: string; chatId: string; expectedMessageId?: string }>;
  refreshError: Error | null;
  accountRefreshCalls: string[];
  /** Retained PollingSync surface; durable v2 recovery must not use it. */
  reconcileCalls: string[];
  reconcileError: Error | null;
  grantRefreshCalls: number;
  grantAccountIds: string[];
  ingestCalls: Array<{ accountId: string; chatId: string; messageId: string }>;
  ingestResult: boolean;
  /** D38: applyHubMessage outcome override ('chat-missing' etc.). */
  applyOutcome: HubMessageApplyOutcome | null;
  /** D38: intent/verify/safety page-1 reads. */
  headReads: Array<{ accountId: string; trigger: string; preserveLocalHead: boolean; bodyDeltas: boolean }>;
  headReadOutcome: ListReadOutcome;
  chatTailReads: Array<{ accountId: string; chatId: string }>;
  chatTailOutcome: ListReadOutcome;
  verifyCalls: Array<{ accountIds: string[]; reason: string }>;
  resumeCalls: number;
  /** Test-side hook standing in for PollingSync's onListRead wiring. */
  onListRead: ((accountId: string, startedAtMs: number) => void) | null;
  /** List-only head proof used by intents (defaults to "never reached"). */
  headReached: (accountId: string, chatId: string, messageId: string) => boolean;
  refreshAccountHead(accountId: string): Promise<void>;
  reconcileAccountHeadNow(accountId: string): Promise<void>;
  refreshAccountGrants(): Promise<string[]>;
  ingestHubMessage(accountId: string, chatId: string, message: NormalizedSyncMessage): Promise<boolean>;
  applyHubMessage(accountId: string, chatId: string, message: NormalizedSyncMessage): HubMessageApplyOutcome;
  readAccountHead(
    accountId: string,
    trigger: ListReadTrigger,
    options?: { preserveLocalHead?: boolean; bodyDeltas?: boolean },
  ): Promise<ListReadOutcome>;
  readChatTailForIntent(accountId: string, chatId: string): Promise<ListReadOutcome>;
  verifyAccounts(accountIds: readonly string[], reason: ListVerificationReason): void;
  noteSystemResume(): void;
  listHeadReached(accountId: string, chatId: string, messageId: string): boolean;
  emit(event: SyncEvent): void;
}

function makeFakePolling(): FakePolling {
  const listeners = new Set<(event: SyncEvent) => void>();
  const polling: FakePolling = {
    suspensions: [],
    forceRefreshCalls: 0,
    refreshCalls: [],
    refreshError: null,
    accountRefreshCalls: [],
    reconcileCalls: [],
    reconcileError: null,
    grantRefreshCalls: 0,
    grantAccountIds: [ACCT],
    ingestCalls: [],
    ingestResult: true,
    applyOutcome: null,
    headReads: [],
    headReadOutcome: 'ok',
    chatTailReads: [],
    chatTailOutcome: 'ok',
    verifyCalls: [],
    resumeCalls: 0,
    onListRead: null,
    headReached: () => false,
    emit: (event) => {
      for (const listener of listeners) listener(event);
    },
    start: () => undefined,
    stop: () => Promise.resolve(),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refreshChat: (accountId, chatId, _purpose, expectedMessageId) => {
      polling.refreshCalls.push({
        accountId,
        chatId,
        ...(expectedMessageId === undefined ? {} : { expectedMessageId }),
      });
      if (polling.refreshError !== null) {
        return Promise.reject(polling.refreshError);
      }
      // mirrors the real provider: refreshChat re-announces the list
      polling.emit({ type: 'chatListUpdated', accountId });
      return Promise.resolve();
    },
    refreshAccountHead: (accountId) => {
      polling.accountRefreshCalls.push(accountId);
      polling.emit({ type: 'chatListUpdated', accountId });
      return Promise.resolve();
    },
    reconcileAccountHeadNow: (accountId) => {
      polling.reconcileCalls.push(accountId);
      if (polling.reconcileError !== null) {
        return Promise.reject(polling.reconcileError);
      }
      polling.emit({ type: 'chatListUpdated', accountId });
      return Promise.resolve();
    },
    refreshAccountGrants: () => {
      polling.grantRefreshCalls += 1;
      return Promise.resolve([...polling.grantAccountIds]);
    },
    ingestHubMessage: (accountId, chatId, message) => {
      polling.ingestCalls.push({ accountId, chatId, messageId: message.id });
      return Promise.resolve(polling.ingestResult);
    },
    applyHubMessage: (accountId, chatId, message) => {
      polling.ingestCalls.push({ accountId, chatId, messageId: message.id });
      if (polling.applyOutcome !== null) {
        return polling.applyOutcome;
      }
      return polling.ingestResult ? 'applied' : 'unmapped';
    },
    readAccountHead: (accountId, trigger, options = {}) => {
      polling.headReads.push({
        accountId,
        trigger,
        preserveLocalHead: options.preserveLocalHead === true,
        bodyDeltas: options.bodyDeltas === true,
      });
      const startedAtMs = Date.now();
      if (polling.headReadOutcome === 'ok') {
        polling.onListRead?.(accountId, startedAtMs);
        polling.emit({ type: 'chatListUpdated', accountId });
      }
      return Promise.resolve(polling.headReadOutcome);
    },
    readChatTailForIntent: (accountId, chatId) => {
      polling.chatTailReads.push({ accountId, chatId });
      return Promise.resolve(polling.chatTailOutcome);
    },
    verifyAccounts: (accountIds, reason) => {
      polling.verifyCalls.push({ accountIds: [...accountIds], reason });
    },
    noteSystemResume: () => {
      polling.resumeCalls += 1;
    },
    listHeadReached: (accountId, chatId, messageId) =>
      polling.headReached(accountId, chatId, messageId),
    readChatTailForUserOpen: () => Promise.resolve(),
    loadOlderMessagesForUserOpen: () =>
      Promise.resolve({ returned: 0, fresh: 0, hasOlder: false }),
    ensureChat: () => Promise.resolve(true),
    openConversation: () => Promise.resolve(),
    closeConversation: () => undefined,
    setFocusedAccount: () => undefined,
    setWindowVisible: () => undefined,
    forceRefresh: () => {
      polling.forceRefreshCalls += 1;
      return Promise.resolve();
    },
    reconcileUnread: () => Promise.resolve(),
    status: () => ({ freshness: {}, state: 'live' }),
    pollAccount: () => Promise.resolve(),
    setHubPollingSuspended: (suspended) => {
      polling.suspensions.push(suspended);
    },
  };
  return polling;
}

interface FakeHub extends HubSync {
  startCalls: number;
  stopCalls: number;
}

function makeFakeHub(): FakeHub {
  const hub: FakeHub = {
    startCalls: 0,
    stopCalls: 0,
    start: () => {
      hub.startCalls += 1;
    },
    stop: () => {
      hub.stopCalls += 1;
    },
    status: () => 'live',
    droppedFrameCount: () => 0,
  };
  return hub;
}

describe('createHubAwareSync (provider composition)', () => {
  let data: DataLayer;

  beforeEach(() => {
    data = createDataLayer({ driverPath: TEST_DRIVER, filePath: ':memory:', encryptionKey: null });
  });
  afterEach(() => {
    data.close();
  });

  function build(buildOptions: { autoRead?: boolean } = {}): {
    provider: ReturnType<typeof createHubAwareSync>;
    polling: FakePolling;
    hub: FakeHub;
    callbacks: () => HubFactoryCallbacks;
    events: SyncEvent[];
    logs: Array<{ level: string; message: string; fields?: Record<string, unknown> | undefined }>;
    setNow: (ms: number) => void;
    now: () => number;
    /** Report a successful page-1 read of each account (settles verification). */
    listRead: (...accountIds: string[]) => void;
  } {
    const polling = makeFakePolling();
    const hub = makeFakeHub();
    let captured: HubFactoryCallbacks | null = null;
    let nowMs = PROVIDER_NOW_MS;
    const logs: Array<{ level: string; message: string; fields?: Record<string, unknown> | undefined }> = [];
    const provider = createHubAwareSync({
      polling,
      data,
      now: () => nowMs,
      autoReadEnabled: () => buildOptions.autoRead === true,
      createHub: (callbacks) => {
        captured = callbacks;
        return Promise.resolve(hub);
      },
      onLog: (level, message, fields) => logs.push({ level, message, fields }),
    });
    // Stands in for PollingSync's onListRead → provider wiring (index.ts).
    polling.onListRead = (accountId) =>
      provider.handleListRead({
        accountId,
        startedAtMs: nowMs,
        completedAtMs: nowMs,
        trigger: 'intent',
      });
    const events: SyncEvent[] = [];
    provider.subscribe((event) => events.push(event));
    return {
      provider,
      polling,
      hub,
      events,
      logs,
      setNow: (ms: number) => {
        nowMs = ms;
      },
      now: () => nowMs,
      listRead: (...accountIds: string[]) => {
        for (const accountId of accountIds) {
          provider.handleListRead({
            accountId,
            startedAtMs: nowMs,
            completedAtMs: nowMs,
            trigger: 'startup',
          });
        }
      },
      callbacks: () => {
        if (!captured) throw new Error('hub not created yet');
        return captured;
      },
    };
  }

  function seedMessage(
    messageId: string,
    chatId: string,
    overrides: Partial<MessageUpsert> = {},
  ): void {
    const upsert: MessageUpsert = {
      accountId: ACCT,
      chatId,
      messageId,
      createdAt: '2026-06-11T10:00:00.000Z',
      isSentByMe: false,
      textHtml: '<p>hi</p>',
      textPlain: 'hi',
      price: 0,
      isOpened: null,
      isNew: true,
      isTip: false,
      tipAmount: null,
      tipText: null,
      replyTo: null,
      media: [],
      deleted: false,
      raw: {},
      ...overrides,
    };
    data.messages.upsertMany([upsert]);
  }

  /** The chat these frames target already exists locally. */
  function knownChat(chatId = '101'): void {
    seedChat(chatId, 'older-head', '2026-06-11T09:00:00.000Z');
  }

  function seedChat(
    chatId: string,
    lastMessageId: string,
    lastMessageAt: string,
    overrides: Partial<ChatUpsert> = {},
  ): void {
    data.chats.upsert({
      accountId: ACCT,
      chatId,
      fanName: `Fan ${chatId}`,
      avatar: null,
      unreadCount: 1,
      hasUnreadTips: false,
      lastMessageAt,
      lastMessagePreview: `message ${lastMessageId}`,
      lastMessageIsSentByMe: false,
      lastMessageId,
      lastReadMessageId: null,
      pinned: false,
      canSendMessage: true,
      canNotSendReason: null,
      raw: {},
      ...overrides,
    });
  }

  function hubMessage(overrides: Partial<NormalizedSyncMessage> = {}): NormalizedSyncMessage {
    return {
      id: '9001',
      text: '<p>hello from hub</p>',
      createdAt: '2026-06-11T12:00:00+00:00',
      isSentByMe: false,
      price: 0,
      isOpened: false,
      isNew: true,
      isTip: false,
      ...overrides,
    };
  }

  function emptySnapshot(accountId: string): SyncSnapshotResponse {
    return {
      version: 1,
      requestedAfterSeq: 0,
      snapshotCursor: 1,
      stateAt: '2026-07-12T18:00:00.000Z',
      resumeAllowed: true,
      page: {
        pageId: 1,
        label: 'snapshot-page',
        accountId,
        username: accountId,
        authStatus: 'connected',
        authenticated: true,
        authChangedAt: '2026-07-12T17:59:00.000Z',
      },
      coverage: {
        durableDomains: ['chat_heads', 'hot_messages', 'message_tombstones', 'account_auth'],
        omittedDomains: [
          { domain: 'presence', reason: 'ephemeral_not_snapshotted' },
          { domain: 'typing', reason: 'ephemeral_not_snapshotted' },
        ],
        messageWindow: 'hot_projection_plus_archive_delta',
      },
      threads: [],
      unresolvedTombstones: [],
      nextPageCursor: null,
    };
  }

  it('start() starts polling AND the hub when settings are configured', async () => {
    const { provider, hub } = build();
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();
    expect(hub.startCalls).toBe(1);
    provider.stop();
    expect(hub.stopCalls).toBe(1);
  });

  // ── D38: SYNCING, verification epochs, attention gate, push clock ──────

  function liveMeta(overrides: Partial<HubFrameMeta> = {}): HubFrameMeta {
    return {
      lane: 'durable',
      provenance: 'live',
      occurredAt: new Date(PROVIDER_NOW_MS).toISOString(),
      deliveredLive: true,
      accountSeq: 1,
      transactionRef: null,
      thread: null,
      ...overrides,
    };
  }

  it('startup: SYNCING from the first moment, polling and the hub replay start together', async () => {
    const { provider, hub, polling } = build();
    let pollingStarted = false;
    polling.start = () => {
      pollingStarted = true;
    };
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();
    // Neither waits for the other: the page-1 reads run in parallel with replay.
    expect(pollingStarted).toBe(true);
    expect(hub.startCalls).toBe(1);
    expect(provider.listSync()).toEqual({
      syncing: true,
      syncingSinceMs: PROVIDER_NOW_MS,
      epochStartedAtMs: PROVIDER_NOW_MS,
      epochReason: 'session-start',
    });
    provider.stop();
  });

  it('SYNCING ends only after replay_completed AND the page-1 verification of every account', async () => {
    const ctx = build();
    const { provider, callbacks, logs } = ctx;
    provider.start([ACCT, NEW_ACCT]);
    await Promise.resolve();
    await Promise.resolve();
    callbacks().onStatusChange('live');

    callbacks().onCaughtUp({ frames: 3, framesByAccount: { '8': 2, '9': 1 }, offPlatformFrames: 0, ms: 900 });
    expect(provider.listSync().syncing).toBe(true); // replay alone is not enough
    expect(logs).toContainEqual(expect.objectContaining({
      message: 'hub replay completed',
      fields: expect.objectContaining({ framesByAccount: { '8': 2, '9': 1 } }),
    }));
    ctx.listRead(ACCT);
    expect(provider.listSync().syncing).toBe(true); // one account still unverified
    ctx.listRead(NEW_ACCT);
    expect(provider.listSync()).toMatchObject({ syncing: false, syncingSinceMs: null });
    expect(logs).toContainEqual(expect.objectContaining({
      message: 'list sync complete',
      fields: expect.objectContaining({ reason: 'session-start', verified: 2, failed: [] }),
    }));
    provider.stop();
  });

  it('an exhausted verification ends SYNCING (the banner and safety read take over)', async () => {
    const ctx = build();
    const { provider, callbacks } = ctx;
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();
    callbacks().onCaughtUp();
    provider.handleListVerificationFailed(ACCT, 'session-start');
    expect(provider.listSync().syncing).toBe(false);
    provider.stop();
  });

  it('only an outage longer than 60 s (or a replay gap) re-verifies the list', async () => {
    const ctx = build();
    const { provider, polling, callbacks } = ctx;
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();
    callbacks().onStatusChange('live');
    callbacks().onCaughtUp();
    ctx.listRead(ACCT);
    expect(provider.listSync().syncing).toBe(false);
    ctx.setNow(ctx.now() + REVERIFY_MIN_INTERVAL_MS); // outside the coalescing window

    // A 30 s blip: stays LIVE, no reads.
    callbacks().onStatusChange('degraded');
    ctx.setNow(ctx.now() + 30_000);
    callbacks().onStatusChange('live');
    expect(provider.listSync().syncing).toBe(false);
    expect(polling.verifyCalls).toEqual([]);

    // The planned 15-min reconnect never leaves 'live': a new marker changes nothing.
    callbacks().onCaughtUp();
    expect(provider.listSync().syncing).toBe(false);

    // 61 s down: SYNCING again, every account re-verified — and the polling
    // cadence is suspended again exactly as after any return to live.
    callbacks().onStatusChange('degraded');
    ctx.setNow(ctx.now() + 61_000);
    const suspensionsBefore = polling.suspensions.length;
    callbacks().onStatusChange('live');
    expect(provider.listSync()).toMatchObject({ syncing: true, epochReason: 'reconnect' });
    expect(polling.verifyCalls).toEqual([{ accountIds: [ACCT], reason: 'reconnect' }]);
    expect(polling.suspensions.slice(suspensionsBefore)).toEqual([true]);
    callbacks().onCaughtUp();
    ctx.listRead(ACCT);
    expect(provider.listSync().syncing).toBe(false);

    // A 409 right after: coalesced — never more than one paid re-verification
    // per 5 minutes, however often the stream drops or Core answers 409.
    await callbacks().onV2GapRecovered();
    expect(polling.verifyCalls).toHaveLength(1);
    expect(provider.listSync().syncing).toBe(false);

    // Later, a 409 / grant rebaseline re-verifies.
    ctx.setNow(ctx.now() + REVERIFY_MIN_INTERVAL_MS);
    await callbacks().onV2GapRecovered();
    expect(polling.verifyCalls.at(-1)).toEqual({ accountIds: [ACCT], reason: 'gap' });
    expect(provider.listSync()).toMatchObject({ syncing: true, epochReason: 'gap' });
    provider.stop();
  });

  it('a grant refresh that revokes a pending account does not pin SYNCING', async () => {
    const ctx = build();
    const { provider, polling, callbacks } = ctx;
    provider.start([ACCT, NEW_ACCT]);
    await Promise.resolve();
    await Promise.resolve();
    callbacks().onCaughtUp();
    ctx.listRead(ACCT);
    expect(provider.listSync().syncing).toBe(true); // NEW_ACCT pending

    polling.grantAccountIds = [ACCT]; // NEW_ACCT revoked; re-verification coalesced
    await callbacks().onV2GapRecovered();
    expect(polling.verifyCalls).toEqual([]);
    expect(provider.listSync().syncing).toBe(false);
    provider.stop();
  });

  it('a read that started before the epoch cannot verify it', async () => {
    const ctx = build();
    const { provider, callbacks } = ctx;
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();
    callbacks().onCaughtUp();
    provider.handleListRead({
      accountId: ACCT,
      startedAtMs: PROVIDER_NOW_MS - 1,
      completedAtMs: PROVIDER_NOW_MS,
      trigger: 'safety',
    });
    expect(provider.listSync().syncing).toBe(true);
    provider.stop();
  });

  it('toast age gate: live provenance and a fresh fact are both required after the marker', async () => {
    const { provider, callbacks, events } = build();
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();
    callbacks().onCaughtUp();

    const frame = (messageId: string): SyncEvent => ({
      type: 'messageReceived',
      accountId: ACCT,
      chatId: '101',
      messageId,
      message: hubMessage({ id: messageId }),
    });
    await runEvent(callbacks(), frame('fresh'), liveMeta());
    await runEvent(callbacks(), frame('redelivered'), liveMeta({ provenance: 'redelivery' }));
    await runEvent(callbacks(), frame('repaired'), liveMeta({ provenance: 'repair' }));
    await runEvent(callbacks(), frame('unknown'), liveMeta({ provenance: 'unknown' }));
    await runEvent(
      callbacks(),
      frame('old-live'),
      liveMeta({ occurredAt: new Date(PROVIDER_NOW_MS - NOTIFICATION_MAX_AGE_MS - 1_000).toISOString() }),
    );
    await runEvent(
      callbacks(),
      frame('recent-live'),
      liveMeta({ occurredAt: new Date(PROVIDER_NOW_MS - NOTIFICATION_MAX_AGE_MS + 1_000).toISOString() }),
    );

    const liveness = events
      .filter((event): event is Extract<SyncEvent, { type: 'messageReceived' }> => event.type === 'messageReceived')
      .map((event) => [event.messageId, event.live !== false]);
    expect(liveness).toEqual([
      ['fresh', true],
      ['redelivered', false],
      ['repaired', false],
      ['unknown', false],
      ['old-live', false],
      ['recent-live', true],
    ]);
    provider.stop();
  });

  it('keeps the replay_completed rule: a fresh live frame before the marker stays quiet when old', async () => {
    const { provider, callbacks, events } = build();
    provider.start([ACCT]);
    knownChat(); // an existing chat: no new-chat hint on the event
    await Promise.resolve();
    await Promise.resolve();
    const oldMessage: SyncEvent = {
      type: 'messageReceived',
      accountId: ACCT,
      chatId: '101',
      messageId: 'replayed',
      message: hubMessage({ id: 'replayed', createdAt: '2026-06-11T09:00:00.000Z' }),
    };
    await runEvent(callbacks(), oldMessage, liveMeta({
      deliveredLive: false,
      occurredAt: new Date(PROVIDER_NOW_MS - 1_000).toISOString(),
    }));
    expect(events).toEqual([{ ...oldMessage, live: false }]);
    provider.stop();
  });

  it('«последний пуш» counts only live frames (not the replayed backlog)', async () => {
    const ctx = build();
    const { provider, callbacks } = ctx;
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    await runEvent(callbacks(), { type: 'chatListUpdated', accountId: ACCT }, liveMeta({ deliveredLive: false }));
    expect(provider.hubActivity()).toMatchObject({ eventsToday: 1, lastEventAt: null });
    await runEvent(callbacks(), { type: 'chatListUpdated', accountId: ACCT }, liveMeta({ provenance: 'redelivery' }));
    expect(provider.hubActivity().lastEventAt).toBeNull();

    ctx.setNow(PROVIDER_NOW_MS + 5_000);
    await runEvent(callbacks(), { type: 'chatListUpdated', accountId: ACCT }, liveMeta());
    expect(provider.hubActivity()).toMatchObject({
      eventsToday: 3,
      lastEventAt: PROVIDER_NOW_MS + 5_000,
      lastEventType: 'chatListUpdated',
    });
    provider.stop();
  });

  it('a replayed frame is proven by the startup read; a live one needs a later read', async () => {
    const ctx = build();
    const { provider, callbacks } = ctx;
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    // Replayed subscription from an hour ago: T = its occurredAt.
    await runEvent(callbacks(), { type: 'chatListUpdated', accountId: ACCT }, liveMeta({
      deliveredLive: false,
      occurredAt: new Date(PROVIDER_NOW_MS - 60 * 60_000).toISOString(),
    }));
    expect(provider.syncIntents().openIntents()).toEqual([
      expect.objectContaining({ notBeforeMs: PROVIDER_NOW_MS - 60 * 60_000 }),
    ]);
    ctx.listRead(ACCT); // the session's page-1 read, started now
    expect(provider.syncIntents().openIntents()).toEqual([]);

    // Live: T = local receipt, so only a read 2 s later qualifies.
    await runEvent(callbacks(), { type: 'chatListUpdated', accountId: ACCT }, liveMeta());
    ctx.listRead(ACCT);
    expect(provider.syncIntents().openIntents()).toHaveLength(1);
    provider.stop();
  });

  it('an enriched message for an unknown chat opens an account intent; the message arrival closes a thin intent', async () => {
    const ctx = build();
    const { provider, polling, callbacks } = ctx;
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    await runEvent(callbacks(), { type: 'messageReceived', accountId: ACCT, chatId: '101', messageId: '9001' });
    expect(provider.syncIntents().openIntents()).toEqual([
      expect.objectContaining({ kind: 'chat_message', messageId: '9001' }),
    ]);
    polling.applyOutcome = 'chat-missing';
    await runEvent(callbacks(), {
      type: 'messageReceived',
      accountId: ACCT,
      chatId: '101',
      messageId: '9001',
      message: hubMessage({ id: '9001' }),
    });
    expect(provider.syncIntents().openIntents()).toEqual([
      expect.objectContaining({ kind: 'account_list', reason: 'unknown-chat' }),
    ]);
    provider.stop();
  });

  it('a live message delivered 3-9 min late still alerts (OFAPI delay episodes, review #36)', async () => {
    const { provider, callbacks, events } = build();
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();
    knownChat();
    callbacks().onCaughtUp();
    // Production 2026-09-25 04:18–04:54 UTC: ordinary incoming messages on
    // page 9 arrived 181–277 s after their createdAt; 0.1.56 notified them.
    for (const [messageId, lateMs] of [['late-181', 181_000], ['late-277', 277_000], ['late-8m', 8 * 60_000]] as const) {
      await runEvent(
        callbacks(),
        {
          type: 'messageReceived',
          accountId: ACCT,
          chatId: '101',
          messageId,
          message: hubMessage({ id: messageId }),
        },
        liveMeta({ occurredAt: new Date(PROVIDER_NOW_MS - lateMs).toISOString() }),
      );
    }
    expect(events.map((event) => (event.type === 'messageReceived' ? event.live !== false : null)))
      .toEqual([true, true, true]);
    expect(NOTIFICATION_MAX_AGE_MS).toBe(9 * 60_000); // below the hub's 10-min redelivery quiet period
    provider.stop();
  });

  describe('age gate on the hub clock (PC clock skew ±5 min)', () => {
    const FIVE_MIN = 5 * 60_000;

    async function liveness(localSkewMs: number, trueAgeMs: number): Promise<boolean> {
      const ctx = build();
      const { provider, callbacks, events } = ctx;
      // The PC clock reads true time + skew; the hub's Date header is true time.
      const trueNowMs = PROVIDER_NOW_MS;
      ctx.setNow(trueNowMs + localSkewMs);
      provider.start([ACCT]);
      await Promise.resolve();
      await Promise.resolve();
      knownChat();
      callbacks().onServerDate(trueNowMs - 500, trueNowMs + localSkewMs); // whole-second Date header
      callbacks().onCaughtUp();
      await runEvent(
        callbacks(),
        {
          type: 'messageReceived',
          accountId: ACCT,
          chatId: '101',
          messageId: `skew-${localSkewMs}-${trueAgeMs}`,
          message: hubMessage({ id: `skew-${localSkewMs}-${trueAgeMs}` }),
        },
        liveMeta({ occurredAt: new Date(trueNowMs - trueAgeMs).toISOString() }),
      );
      provider.stop();
      const event = events.at(-1);
      return event?.type === 'messageReceived' && event.live !== false;
    }

    it('PC clock 5 min fast: a 6-min-old live message still alerts', async () => {
      await expect(liveness(+FIVE_MIN, 6 * 60_000)).resolves.toBe(true);
      await expect(liveness(+FIVE_MIN, 0)).resolves.toBe(true);
    });

    it('PC clock 5 min slow: a 12-min-old fact stays quiet', async () => {
      await expect(liveness(-FIVE_MIN, 12 * 60_000)).resolves.toBe(false);
      await expect(liveness(-FIVE_MIN, 30_000)).resolves.toBe(true);
    });

    it('without a hub Date sample the local clock is the fallback', async () => {
      const { provider, callbacks, events } = build();
      provider.start([ACCT]);
      await Promise.resolve();
      await Promise.resolve();
      knownChat();
      callbacks().onCaughtUp();
      await runEvent(
        callbacks(),
        { type: 'messageReceived', accountId: ACCT, chatId: '101', messageId: 'x', message: hubMessage({ id: 'x' }) },
        liveMeta({ occurredAt: new Date(PROVIDER_NOW_MS - NOTIFICATION_MAX_AGE_MS - 1_000).toISOString() }),
      );
      expect(events.at(-1)).toMatchObject({ live: false });
      provider.stop();
    });

    it('logs a large skew once', async () => {
      const { provider, callbacks, logs } = build();
      provider.start([ACCT]);
      callbacks().onServerDate(PROVIDER_NOW_MS - FIVE_MIN, PROVIDER_NOW_MS);
      callbacks().onServerDate(PROVIDER_NOW_MS - FIVE_MIN, PROVIDER_NOW_MS);
      expect(logs.filter((log) => log.message.startsWith('local clock differs from the hub'))).toHaveLength(1);
      provider.stop();
    });
  });

  it('first message of a chat not listed yet: the fan name from the local cache, else «new chat»', async () => {
    const { provider, callbacks, events } = build();
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();
    callbacks().onCaughtUp();
    data.fans.upsert({
      accountId: ACCT,
      fanId: '777',
      username: 'kevin_k',
      name: 'Kevin',
      customName: null,
      avatar: null,
      about: null,
      lastSeen: null,
      spending: null,
      subscription: null,
      fetchedAt: '2026-06-11T11:00:00.000Z',
    });

    await runEvent(
      callbacks(),
      { type: 'messageReceived', accountId: ACCT, chatId: '777', messageId: 'k1', message: hubMessage({ id: 'k1' }) },
      liveMeta(),
    );
    await runEvent(
      callbacks(),
      { type: 'messageReceived', accountId: ACCT, chatId: '888', messageId: 'n1', message: hubMessage({ id: 'n1' }) },
      liveMeta(),
    );
    // Thin frames too, and still alerting — the notification is kept.
    await runEvent(
      callbacks(),
      { type: 'messageReceived', accountId: ACCT, chatId: '999', messageId: 't1' },
      liveMeta(),
    );
    expect(events).toEqual([
      expect.objectContaining({ chatId: '777', fanName: 'Kevin' }),
      expect.objectContaining({ chatId: '888', newChat: true }),
      expect.objectContaining({ chatId: '999', newChat: true }),
    ]);
    expect(events.every((event) => event.type === 'messageReceived' && event.live !== false)).toBe(true);
    // An existing chat carries no hint.
    knownChat();
    await runEvent(
      callbacks(),
      { type: 'messageReceived', accountId: ACCT, chatId: '101', messageId: 'e1', message: hubMessage({ id: 'e1' }) },
      liveMeta(),
    );
    expect(events.at(-1)).not.toHaveProperty('newChat');
    expect(events.at(-1)).not.toHaveProperty('fanName');
    provider.stop();
  });

  it('start() closes intents persisted for accounts this runtime no longer handles', async () => {
    const past = PROVIDER_NOW_MS - 60_000;
    for (const accountId of ['acct_revoked', ACCT]) {
      data.syncIntents.open({
        kind: 'chat_message',
        accountId,
        chatId: '42',
        messageId: '1001',
        notBeforeMs: past,
        reason: 'thin-frame',
        nextAttemptMs: past,
        nowMs: past,
      });
    }
    const { provider } = build();
    provider.start([ACCT]);
    expect(provider.syncIntents().openIntents().map((row) => row.accountId)).toEqual([ACCT]);
    provider.stop();
  });

  it('a grant shrink closes the revoked account\'s intents', async () => {
    const ctx = build();
    const { provider, polling, callbacks } = ctx;
    provider.start([ACCT, NEW_ACCT]);
    await Promise.resolve();
    await Promise.resolve();
    await runEvent(callbacks(), { type: 'chatListUpdated', accountId: NEW_ACCT }, liveMeta());
    expect(provider.syncIntents().openIntents().map((row) => row.accountId)).toEqual([NEW_ACCT]);
    polling.grantAccountIds = [ACCT];
    await callbacks().onV2GapRecovered();
    expect(provider.syncIntents().openIntents()).toEqual([]);
    provider.stop();
  });

  it('resume forwards one safety check to polling', () => {
    const { provider, polling } = build();
    provider.start([ACCT]);
    provider.noteSystemResume();
    expect(polling.resumeCalls).toBe(1);
    provider.stop();
  });

  it('hub live suspends polling; degraded restores the scheduler and NEVER force-sweeps', async () => {
    const { provider, polling, callbacks, logs } = build();
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    callbacks().onStatusChange('live');
    expect(polling.suspensions).toEqual([true]);
    expect(polling.forceRefreshCalls).toBe(0);

    callbacks().onStatusChange('live'); // no re-suspension churn
    expect(polling.suspensions).toEqual([true]);

    // Incident 2026-07-15: SSE transitions change the scheduler mode only.
    // The old unconditional forceRefresh here (5-page deep sweep × every
    // account per flap, uncapped) let a poisoned reconnect loop burn ~14k
    // paid reads in one night. Gap coverage belongs to the resumed loop's
    // own deepDue cap.
    callbacks().onStatusChange('degraded');
    expect(polling.suspensions).toEqual([true, false]);
    expect(polling.forceRefreshCalls).toBe(0);

    // A flap storm must stay free of paid work no matter how many cycles.
    for (let i = 0; i < 100; i += 1) {
      callbacks().onStatusChange('live');
      callbacks().onStatusChange('degraded');
    }
    expect(polling.forceRefreshCalls).toBe(0);
    expect(logs.map((log) => log.message)).toContain('SSE live; polling suspended');
    expect(logs.map((log) => log.message)).toContain('SSE not live; polling resumed');
    provider.stop();
  });

  it('v2 recovery completion records telemetry without a weaker OFAPI head refresh', async () => {
    const { provider, polling, callbacks, logs } = build();
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    await callbacks().onV2GapRecovered();
    expect(polling.grantRefreshCalls).toBe(1);
    expect(polling.reconcileCalls).toEqual([]);
    expect(polling.accountRefreshCalls).toEqual([]);
    expect(provider.hubActivity().lastFallbackReason).toBe('hub-v2-gap-cursor-rebaseline');
    expect(logs).toContainEqual({
      level: 'info',
      message: 'v2 account grants refreshed for durable reconciliation',
      fields: { accountsBefore: 1, accountsAfter: 1 },
    });
    provider.stop();
  });

  it('v2 grant refresh replaces the provider snapshot allowlist', async () => {
    const { provider, polling, callbacks } = build();
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();
    polling.grantAccountIds = [NEW_ACCT];

    await expect(callbacks().onV2GapRecovered()).resolves.toEqual([NEW_ACCT]);
    await expect(callbacks().onSnapshot(emptySnapshot(ACCT))).rejects.toThrow(
      `Snapshot account ${ACCT} is not handled locally`,
    );
    await expect(callbacks().onSnapshot(emptySnapshot(NEW_ACCT))).resolves.toBeUndefined();
    provider.stop();
  });

  it('v2 multi-page recovery applies messages, tips, and deletes before cursor persistence', async () => {
    const { provider, polling, callbacks } = build();
    polling.ingestHubMessage = (accountId, chatId, message) => {
      const mapped = mapHubMessage(accountId, chatId, message);
      if (mapped === null) {
        return Promise.resolve(false);
      }
      polling.ingestCalls.push({ accountId, chatId, messageId: message.id });
      data.messages.upsertMany([mapped]);
      return Promise.resolve(true);
    };
    seedMessage('gone', '202');
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    const snapshotPage = (
      thread: SyncSnapshotResponse['threads'][number],
      nextPageCursor: number | null,
    ): SyncSnapshotResponse => ({
      version: 1,
      requestedAfterSeq: 0,
      snapshotCursor: 77,
      stateAt: '2026-07-12T18:00:00.000Z',
      resumeAllowed: true,
      page: {
        pageId: 1,
        label: 'lora-of',
        accountId: ACCT,
        username: 'lora',
        authStatus: 'connected',
        authenticated: true,
        authChangedAt: '2026-07-12T17:59:00.000Z',
      },
      coverage: {
        durableDomains: ['chat_heads', 'hot_messages', 'message_tombstones', 'account_auth'],
        omittedDomains: [
          { domain: 'presence', reason: 'ephemeral_not_snapshotted' },
          { domain: 'typing', reason: 'ephemeral_not_snapshotted' },
        ],
        messageWindow: 'hot_projection_plus_archive_delta',
      },
      threads: [thread],
      unresolvedTombstones: [],
      nextPageCursor,
    });
    const tipMessage = hubMessage({
      id: 'tip-1',
      text: '<p>thank you</p>',
      createdAt: '2026-07-12T17:58:00.000Z',
      isTip: true,
      tipAmountUsd: 12.5,
    });
    const firstPage = snapshotPage({
      chatId: '101',
      fanName: 'Tip fan',
      unreadCount: 1,
      hasUnreadTips: true,
      lastMessageId: 'tip-1',
      lastMessageAt: tipMessage.createdAt,
      lastMessageIsSentByMe: false,
      lastMessagePreview: 'thank you',
      visible: true,
      sourceUpdatedAt: '2026-07-12T18:00:00.000Z',
      messages: [{
        chatId: '101',
        messageId: 'tip-1',
        message: tipMessage,
        deletedAt: null,
        sourceUpdatedAt: '2026-07-12T18:00:00.000Z',
        sourceFanoutSeq: 76,
      }],
    }, 5);
    const secondPage = snapshotPage({
      chatId: '202',
      fanName: 'Deleted fan',
      unreadCount: 0,
      hasUnreadTips: false,
      lastMessageId: null,
      lastMessageAt: null,
      lastMessageIsSentByMe: false,
      lastMessagePreview: '',
      visible: true,
      sourceUpdatedAt: '2026-07-12T18:00:00.000Z',
      messages: [{
        chatId: '202',
        messageId: 'gone',
        message: null,
        deletedAt: '2026-07-12T17:59:00.000Z',
        sourceUpdatedAt: '2026-07-12T18:00:00.000Z',
        sourceFanoutSeq: 77,
      }],
    }, null);

    const resumed = makeStream();
    const { fetchImpl, calls } = makeHarness([
      {
        status: 409,
        stream: null,
        json: {
          error: 'sync_snapshot_required',
          message: 'cursor gap',
          statusCode: 409,
          version: 2,
          accounts: [{ accountId: 1, requestedSeq: 50, oldestAvailableSeq: 60, currentSeq: 80 }],
          snapshotPath: HUB_V2_SNAPSHOT_PATH,
        },
      },
      { status: 200, stream: null, json: { cursor: 'CUR_FRESH', accounts: [{ accountId: 1, accountRef: ACCT, currentSeq: 80 }] } },
      { status: 200, stream: null, json: firstPage },
      { status: 200, stream: null, json: secondPage },
      { status: 200, stream: resumed },
    ]);
    let cursor = 'CUR_STALE';
    const order: string[] = [];
    const recoveringHub = createHubSync({
      protocol: 'v2',
      baseUrl: 'https://hub.test',
      apiKey: 'k',
      accountIds: [ACCT],
      fetchImpl,
      sleep: () => Promise.resolve(),
      onEvent: () => undefined,
      onSnapshot: async (snapshot) => {
        order.push(`apply:${snapshot.threads[0]?.chatId}`);
        await callbacks().onSnapshot(snapshot);
      },
      onV2GapRecovered: async () => {
        order.push('reconciled');
        return callbacks().onV2GapRecovered();
      },
      getLastEventId: () => null,
      setLastEventId: () => undefined,
      getV2Cursor: () => cursor,
      setV2Cursor: (next) => {
        order.push(`persist:${next}`);
        cursor = next;
      },
    });

    recoveringHub.start();
    await drainMicrotasks();

    expect(calls.map((call) => call.url)).toEqual([
      `https://hub.test${HUB_V2_SSE_PATH}?cursor=CUR_STALE&platform=onlyfans`,
      (() => {
        const url = new URL(`https://hub.test${HUB_V2_SNAPSHOT_PATH}`);
        url.searchParams.set('sourceCursor', 'CUR_STALE');
        url.searchParams.set('platform', 'onlyfans');
        return url.toString();
      })(),
      `https://hub.test${HUB_SNAPSHOT_PATH}?accountId=${ACCT}&afterSeq=0&pageCursor=0&limit=1&pageMode=bounded_v1&messageLimit=100`,
      `https://hub.test${HUB_SNAPSHOT_PATH}?accountId=${ACCT}&afterSeq=0&pageCursor=5&limit=1&snapshotCursor=77`,
      `https://hub.test${HUB_V2_SSE_PATH}?cursor=CUR_FRESH&platform=onlyfans`,
    ]);
    expect(order).toEqual(['reconciled', 'apply:101', 'apply:202', 'persist:CUR_FRESH']);
    expect(data.messages.get(ACCT, '101', 'tip-1')).toMatchObject({
      textPlain: 'thank you',
      isTip: true,
      tipAmount: 12.5,
    });
    expect(data.messages.get(ACCT, '202', 'gone')?.deleted).toBe(true);
    expect(cursor).toBe('CUR_FRESH');
    expect(polling.reconcileCalls).toEqual([]);

    recoveringHub.stop();
    provider.stop();
  });

  it('enriched messageReceived ingests locally and skips refreshChat', async () => {
    const { provider, polling, callbacks, events } = build();
    provider.start([ACCT]);
    knownChat(); // an existing chat: no new-chat hint on the event
    await Promise.resolve();
    await Promise.resolve();

    const frame: SyncEvent = {
      type: 'messageReceived',
      accountId: ACCT,
      chatId: '101',
      messageId: '9001',
      message: hubMessage(),
    };
    await runEvent(callbacks(), frame);

    expect(polling.ingestCalls).toEqual([{ accountId: ACCT, chatId: '101', messageId: '9001' }]);
    expect(polling.refreshCalls).toEqual([]);
    expect(events).toEqual([frame]);
    expect(provider.hubActivity()).toMatchObject({
      eventsToday: 1,
      appliedEventsToday: 1,
      fallbackEventsToday: 0,
      droppedEventsToday: 0,
      eventsByTypeToday: { messageReceived: 1 },
      appliedByTypeToday: { messageReceived: 1 },
      fallbackByTypeToday: {},
      droppedByTypeToday: {},
      fallbackByReasonToday: {},
      lifetime: {
        received: { total: 1, byType: { messageReceived: 1 } },
        applied: { total: 1, byType: { messageReceived: 1 } },
        fallback: { total: 0, byType: {} },
        dropped: { total: 0, byType: {} },
        fallbackByReason: {},
      },
      lastFallbackReason: null,
    });
    provider.stop();
  });

  it('stamps an old enriched messageReceived as replay before the marker', async () => {
    const { provider, callbacks, events } = build();
    provider.start([ACCT]);
    knownChat(); // an existing chat: no new-chat hint on the event
    await Promise.resolve();
    await Promise.resolve();

    const frame: SyncEvent = {
      type: 'messageReceived',
      accountId: ACCT,
      chatId: '101',
      messageId: 'old-9001',
      message: hubMessage({
        id: 'old-9001',
        createdAt: '2026-06-11T10:00:00.000Z',
      }),
    };
    await runEvent(callbacks(), frame);

    expect(events).toEqual([{ ...frame, live: false }]);
    provider.stop();
  });

  it('uses occurredAt for a fresh id-only frame when the marker is unavailable', async () => {
    const { provider, callbacks, events } = build();
    provider.start([ACCT]);
    knownChat(); // an existing chat: no new-chat hint on the event
    await Promise.resolve();
    await Promise.resolve();

    const frame: SyncEvent = {
      type: 'messageReceived',
      accountId: ACCT,
      chatId: '101',
      messageId: 'fresh-thin-9001',
      occurredAt: '2026-06-11T12:00:00.000Z',
    };
    await runEvent(callbacks(), frame);

    expect(events).toEqual([frame]);
    expect(events[0]).not.toHaveProperty('live');
    provider.stop();
  });

  it('treats post-marker messages as live even when their timestamps are old', async () => {
    const { provider, callbacks, events } = build();
    provider.start([ACCT]);
    knownChat(); // an existing chat: no new-chat hint on the event
    await Promise.resolve();
    await Promise.resolve();
    callbacks().onCaughtUp();

    const frame: SyncEvent = {
      type: 'messageReceived',
      accountId: ACCT,
      chatId: '101',
      messageId: 'post-marker-9001',
      message: hubMessage({
        id: 'post-marker-9001',
        createdAt: '2026-06-11T10:00:00.000Z',
      }),
    };
    await runEvent(callbacks(), frame);

    expect(events).toEqual([frame]);
    expect(events[0]).not.toHaveProperty('live');
    provider.stop();
  });

  it('suppresses a duplicate eligible message id after its first alert', async () => {
    const { provider, callbacks, events } = build();
    provider.start([ACCT]);
    knownChat(); // an existing chat: no new-chat hint on the event
    await Promise.resolve();
    await Promise.resolve();

    const frame: SyncEvent = {
      type: 'messageReceived',
      accountId: ACCT,
      chatId: '101',
      messageId: 'duplicate-9001',
      message: hubMessage({ id: 'duplicate-9001' }),
    };
    await runEvent(callbacks(), frame);
    await runEvent(callbacks(), frame);

    expect(events).toEqual([frame, { ...frame, live: false }]);
    provider.stop();
  });

  it('dedups a hub replay of a message polling already alerted', async () => {
    const { provider, polling, callbacks, events } = build();
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    // Polling passed its own backlog gate, so its emission is news — and it
    // must claim the id in the shared alert registry.
    polling.emit({
      type: 'messageReceived',
      accountId: ACCT,
      chatId: '101',
      messageId: 'shared-9001',
    });
    expect(events).toEqual([{
      type: 'messageReceived',
      accountId: ACCT,
      chatId: '101',
      messageId: 'shared-9001',
    }]);

    // SSE recovers and replays the same id post-marker: without the shared
    // registry this would alert a second time.
    callbacks().onCaughtUp();
    const frame: SyncEvent = {
      type: 'messageReceived',
      accountId: ACCT,
      chatId: '101',
      messageId: 'shared-9001',
      message: hubMessage({ id: 'shared-9001' }),
    };
    await runEvent(callbacks(), frame);

    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ messageId: 'shared-9001', live: false });
    provider.stop();
  });

  it('stamps a polling duplicate of a hub-alerted id as replay', async () => {
    const { provider, callbacks, polling, events } = build();
    provider.start([ACCT]);
    knownChat(); // an existing chat: no new-chat hint on the event
    await Promise.resolve();
    await Promise.resolve();
    callbacks().onCaughtUp();

    const frame: SyncEvent = {
      type: 'messageReceived',
      accountId: ACCT,
      chatId: '101',
      messageId: 'hub-first-9001',
      message: hubMessage({ id: 'hub-first-9001' }),
    };
    await runEvent(callbacks(), frame);
    expect(events).toEqual([frame]);

    polling.emit({
      type: 'messageReceived',
      accountId: ACCT,
      chatId: '101',
      messageId: 'hub-first-9001',
    });
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ messageId: 'hub-first-9001', live: false });
    provider.stop();
  });

  it('re-arms the gate when the sleep-tick detector observes a suspend', async () => {
    vi.useFakeTimers();
    try {
      const { provider, callbacks, events, setNow } = build();
      provider.start([ACCT]);
      await Promise.resolve();
      await Promise.resolve();
      callbacks().onCaughtUp();

      // Lid closed for 8 hours: interval ticks stop, the wall clock jumps.
      // The first tick after wake sees the gap and re-arms — the session was
      // not watching, so the resume replay must run silently.
      const wakeMs = PROVIDER_NOW_MS + 8 * 3_600_000;
      setNow(wakeMs);
      await vi.advanceTimersByTimeAsync(30_000);

      const overnight: SyncEvent = {
        type: 'messageReceived',
        accountId: ACCT,
        chatId: '101',
        messageId: 'overnight-9001',
        message: hubMessage({
          id: 'overnight-9001',
          createdAt: new Date(PROVIDER_NOW_MS + 4 * 3_600_000).toISOString(),
        }),
      };
      await runEvent(callbacks(), overnight);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ messageId: 'overnight-9001', live: false });

      // The reconnected stream finishes its replay: the next marker restores
      // live mode and a fresh message alerts exactly once.
      callbacks().onCaughtUp();
      const fresh: SyncEvent = {
        type: 'messageReceived',
        accountId: ACCT,
        chatId: '101',
        messageId: 'morning-9001',
        message: hubMessage({
          id: 'morning-9001',
          createdAt: new Date(wakeMs).toISOString(),
        }),
      };
      await runEvent(callbacks(), fresh);
      expect(events).toHaveLength(2);
      expect(events[1]).not.toHaveProperty('live');
      await provider.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('suppresses the wake replay even when frames beat the first post-resume tick', async () => {
    const { provider, callbacks, events, setNow } = build();
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();
    callbacks().onCaughtUp();

    // No timer advancement at all: the SSE resume delivers its replay before
    // the sleep interval ever fires after wake. The gate itself must notice
    // the wall-clock gap inline.
    setNow(PROVIDER_NOW_MS + 8 * 3_600_000);
    await runEvent(callbacks(), {
      type: 'messageReceived',
      accountId: ACCT,
      chatId: '101',
      messageId: 'race-9001',
      message: hubMessage({
        id: 'race-9001',
        createdAt: new Date(PROVIDER_NOW_MS + 4 * 3_600_000).toISOString(),
      }),
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ messageId: 'race-9001', live: false });
    await provider.stop();
  });

  it('lets a timestamp-less hub frame alert after the bounded settle window', async () => {
    const { provider, callbacks, events, setNow } = build();
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    // v1 shape: id-only, no occurredAt, auto-read off wrote no row. Within
    // the settle window it stays quiet (boot replay), past it the same shape
    // is a live message without a body and must still alert.
    const idOnly = (messageId: string): SyncEvent => ({
      type: 'messageReceived',
      accountId: ACCT,
      chatId: '101',
      messageId,
    });
    setNow(PROVIDER_NOW_MS + 2 * 60_000);
    await runEvent(callbacks(), idOnly('v1-early-9001'));
    setNow(PROVIDER_NOW_MS + 6 * 60_000);
    await runEvent(callbacks(), idOnly('v1-late-9001'));

    const received = events.filter((event) => event.type === 'messageReceived');
    expect(received).toHaveLength(2);
    expect(received[0]).toMatchObject({ messageId: 'v1-early-9001', live: false });
    expect(received[1]).toMatchObject({ messageId: 'v1-late-9001' });
    expect(received[1]).not.toHaveProperty('live');
    await provider.stop();
  });

  it('keeps live mode through a quiet mid-session SSE outage (awake = still news)', async () => {
    vi.useFakeTimers();
    try {
      const { provider, callbacks, events, setNow } = build();
      provider.start([ACCT]);
      await Promise.resolve();
      await Promise.resolve();
      callbacks().onCaughtUp();

      // Ten quiet minutes with the app awake: ticks keep arriving on
      // schedule, so no re-arm — an SSE outage or an idle chat must never be
      // mistaken for a suspend.
      for (let step = 1; step <= 20; step += 1) {
        setNow(PROVIDER_NOW_MS + step * 30_000);
        await vi.advanceTimersByTimeAsync(30_000);
      }

      // Reconnect replays the two messages missed during the outage; their
      // createdAt predates the reconnect by minutes. They are still news —
      // the session was watching the whole time.
      for (const [index, minutesAgo] of [8, 5].entries()) {
        const createdMs = PROVIDER_NOW_MS + 20 * 30_000 - minutesAgo * 60_000;
        await runEvent(callbacks(), {
          type: 'messageReceived',
          accountId: ACCT,
          chatId: '101',
          messageId: `outage-${index}`,
          message: hubMessage({
            id: `outage-${index}`,
            createdAt: new Date(createdMs).toISOString(),
          }),
        });
      }
      expect(events).toHaveLength(2);
      for (const event of events) {
        expect(event).not.toHaveProperty('live');
      }
      await provider.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('suppresses the polling wake-backlog through the shared epoch gate', async () => {
    vi.useFakeTimers();
    try {
      const { provider, polling, callbacks, events, setNow } = build();
      provider.start([ACCT]);
      await Promise.resolve();
      await Promise.resolve();

      // Suspend re-arm, then polling's auto-read sweep re-emits the night
      // backlog as fresh-by-id rows. The row timestamps predate the epoch —
      // the shared gate must swallow them exactly like hub replay.
      seedMessage('night-9001', '101', {
        createdAt: new Date(PROVIDER_NOW_MS + 4 * 3_600_000).toISOString(),
      });
      const wakeMs = PROVIDER_NOW_MS + 8 * 3_600_000;
      setNow(wakeMs);
      await vi.advanceTimersByTimeAsync(30_000);

      polling.emit({
        type: 'messageReceived',
        accountId: ACCT,
        chatId: '101',
        messageId: 'night-9001',
      });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ messageId: 'night-9001', live: false });

      // The reconnected stream finishes its replay and restores live mode —
      // but the marker vouches for the HUB lane only: a slow poll emitting
      // another night row after it must still be suppressed by the epoch.
      callbacks().onCaughtUp();
      seedMessage('night-9002', '101', {
        createdAt: new Date(PROVIDER_NOW_MS + 5 * 3_600_000).toISOString(),
      });
      polling.emit({
        type: 'messageReceived',
        accountId: ACCT,
        chatId: '101',
        messageId: 'night-9002',
      });
      expect(events).toHaveLength(2);
      expect(events[1]).toMatchObject({ messageId: 'night-9002', live: false });

      // A genuinely fresh message discovered by the same sweep still alerts.
      seedMessage('fresh-9001', '101', {
        createdAt: new Date(wakeMs).toISOString(),
      });
      polling.emit({
        type: 'messageReceived',
        accountId: ACCT,
        chatId: '101',
        messageId: 'fresh-9001',
      });
      expect(events).toHaveLength(3);
      expect(events[2]).not.toHaveProperty('live');
      await provider.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('never stamps messageSent frames with attention metadata', async () => {
    const { provider, callbacks, events } = build();
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    const frame: SyncEvent = {
      type: 'messageSent',
      accountId: ACCT,
      chatId: '101',
      messageId: 'sent-9001',
      message: hubMessage({ id: 'sent-9001', isSentByMe: true }),
    };
    await runEvent(callbacks(), frame);

    expect(events).toEqual([frame]);
    expect(events[0]).not.toHaveProperty('live');
    provider.stop();
  });

  it('snapshot apply is idempotent, preserves local tombstones, and applies unresolved deletes', async () => {
    const { provider, polling, callbacks, events } = build();
    polling.ingestHubMessage = (accountId, chatId, message) => {
      const mapped = mapHubMessage(accountId, chatId, message);
      if (mapped === null) {
        return Promise.resolve(false);
      }
      polling.ingestCalls.push({ accountId, chatId, messageId: message.id });
      data.messages.upsertMany([mapped]);
      return Promise.resolve(true);
    };
    data.chats.upsert({
      accountId: ACCT,
      chatId: '101',
      fanName: 'Existing fan',
      avatar: null,
      unreadCount: 9,
      hasUnreadTips: true,
      lastMessageAt: '2026-06-19T17:00:00.000Z',
      lastMessagePreview: 'old',
      lastMessageIsSentByMe: false,
      lastMessageId: 'old',
      lastReadMessageId: null,
      pinned: false,
      canSendMessage: true,
      canNotSendReason: null,
      raw: {},
    });
    seedMessage('tombstoned', '101');
    data.messages.markDeleted(ACCT, '101', ['tombstoned']);
    seedMessage('delete-by-lookup', '101');
    seedMessage('corrected', '101');
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();
    callbacks().onSnapshotRequired({
      requestedSeq: 5,
      oldestAvailableSeq: 10,
      currentSeq: 20,
    });

    const snapshot: SyncSnapshotResponse = {
      version: 1,
      requestedAfterSeq: 5,
      snapshotCursor: 20,
      stateAt: '2026-06-19T18:00:00.000Z',
      resumeAllowed: true,
      page: {
        pageId: 1,
        label: 'lora-of',
        accountId: ACCT,
        username: 'lora',
        authStatus: 'connected',
        authenticated: true,
        authChangedAt: '2026-06-19T17:59:00.000Z',
      },
      coverage: {
        durableDomains: ['chat_heads', 'hot_messages', 'message_tombstones', 'account_auth'],
        omittedDomains: [
          { domain: 'presence', reason: 'ephemeral_not_snapshotted' },
          { domain: 'typing', reason: 'ephemeral_not_snapshotted' },
        ],
        messageWindow: 'hot_projection_plus_archive_delta',
      },
      threads: [
        {
          chatId: '101',
          fanName: 'Snapshot fan',
          unreadCount: 2,
          hasUnreadTips: false,
          lastMessageId: 'new',
          lastMessageAt: '2026-06-19T18:00:00.000Z',
          lastMessageIsSentByMe: false,
          lastMessagePreview: 'new body',
          visible: true,
          sourceUpdatedAt: '2026-06-19T18:00:01.000Z',
          messages: [
            {
              chatId: '101',
              messageId: 'new',
              message: hubMessage({
                id: 'new',
                text: '<p>new body</p>',
                createdAt: '2026-06-19T18:00:00.000Z',
              }),
              deletedAt: null,
              sourceUpdatedAt: '2026-06-19T18:00:01.000Z',
              sourceFanoutSeq: 19,
            },
            {
              chatId: '101',
              messageId: 'tombstoned',
              message: hubMessage({
                id: 'tombstoned',
                text: '<p>must not resurrect</p>',
              }),
              deletedAt: null,
              sourceUpdatedAt: '2026-06-19T18:00:01.000Z',
              sourceFanoutSeq: 18,
            },
            {
              chatId: '101',
              messageId: 'corrected',
              message: hubMessage({
                id: 'corrected',
                text: '<p>snapshot must not overwrite local body</p>',
                isOpened: true,
                isTip: true,
                tipAmountUsd: 5,
              }),
              deletedAt: null,
              sourceUpdatedAt: '2026-06-19T18:00:01.000Z',
              sourceFanoutSeq: 18,
            },
          ],
        },
      ],
      unresolvedTombstones: [
        {
          messageId: 'delete-by-lookup',
          deletedAt: '2026-06-19T18:00:02.000Z',
          sourceUpdatedAt: '2026-06-19T18:00:02.000Z',
          sourceFanoutSeq: 20,
        },
      ],
      nextPageCursor: null,
    };

    await callbacks().onSnapshot(snapshot);
    await callbacks().onSnapshot(snapshot);

    expect(data.messages.get(ACCT, '101', 'new')?.textPlain).toBe('new body');
    expect(data.messages.get(ACCT, '101', 'tombstoned')?.deleted).toBe(true);
    expect(data.messages.get(ACCT, '101', 'delete-by-lookup')?.deleted).toBe(true);
    expect(data.messages.get(ACCT, '101', 'corrected')).toMatchObject({
      textPlain: 'hi',
      isOpened: true,
      isTip: true,
      tipAmount: 5,
    });
    expect(data.chats.get(ACCT, '101')).toMatchObject({
      unreadCount: 2,
      hasUnreadTips: false,
      lastMessageId: 'new',
      lastMessagePreview: 'new body',
    });
    expect(events.filter((event) => event.type === 'chatListUpdated')).toHaveLength(2);
    expect(provider.hubActivity().lastFallbackReason).toBe('hub-replay-gap-snapshot');
    provider.stop();
  });

  it('snapshot repairs a tombstoned head backward or to null without regressing a newer REST head', async () => {
    const { provider, callbacks } = build();
    seedChat('101', 'deleted-new', '2026-06-19T18:00:00.000Z');
    seedMessage('deleted-new', '101');
    seedChat('202', 'deleted-only', '2026-06-19T18:00:00.000Z');
    seedMessage('deleted-only', '202');
    // The tombstone may have arrived in an earlier cursor page; a later head
    // snapshot still has to trust the durable local deleted bit.
    data.messages.markDeleted(ACCT, '202', ['deleted-only']);
    seedChat('303', 'rest-new', '2026-06-19T19:00:00.000Z');
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    const snapshot = emptySnapshot(ACCT);
    snapshot.threads = [
      {
        chatId: '101',
        fanName: 'Fan 101',
        unreadCount: 0,
        hasUnreadTips: false,
        lastMessageId: 'surviving-old',
        lastMessageAt: '2026-06-19T17:00:00.000Z',
        lastMessageIsSentByMe: false,
        lastMessagePreview: 'surviving old body',
        visible: true,
        sourceUpdatedAt: '2026-06-19T18:01:00.000Z',
        messages: [{
          chatId: '101',
          messageId: 'deleted-new',
          message: null,
          deletedAt: '2026-06-19T18:01:00.000Z',
          sourceUpdatedAt: '2026-06-19T18:01:00.000Z',
          sourceFanoutSeq: 1,
        }],
      },
      {
        chatId: '202',
        fanName: 'Fan 202',
        unreadCount: 0,
        hasUnreadTips: false,
        lastMessageId: null,
        lastMessageAt: null,
        lastMessageIsSentByMe: false,
        lastMessagePreview: '',
        visible: true,
        sourceUpdatedAt: '2026-06-19T18:01:00.000Z',
        messages: [],
      },
      {
        chatId: '303',
        fanName: 'Fan 303',
        unreadCount: 0,
        hasUnreadTips: false,
        lastMessageId: 'snapshot-old',
        lastMessageAt: '2026-06-19T17:00:00.000Z',
        lastMessageIsSentByMe: false,
        lastMessagePreview: 'snapshot old body',
        visible: true,
        sourceUpdatedAt: '2026-06-19T18:01:00.000Z',
        messages: [],
      },
    ];

    await callbacks().onSnapshot(snapshot);

    expect(data.messages.get(ACCT, '101', 'deleted-new')?.deleted).toBe(true);
    expect(data.chats.get(ACCT, '101')).toMatchObject({
      lastMessageId: 'surviving-old',
      lastMessageAt: '2026-06-19T17:00:00.000Z',
      lastMessagePreview: 'surviving old body',
    });
    expect(data.messages.get(ACCT, '202', 'deleted-only')?.deleted).toBe(true);
    expect(data.chats.get(ACCT, '202')).toMatchObject({
      lastMessageId: null,
      lastMessageAt: null,
      lastMessagePreview: '',
    });
    expect(data.chats.get(ACCT, '303')).toMatchObject({
      lastMessageId: 'rest-new',
      lastMessageAt: '2026-06-19T19:00:00.000Z',
    });
    provider.stop();
  });

  it('snapshot preserves a newer numeric head when message timestamps tie', async () => {
    const { provider, callbacks } = build();
    const tiedAt = '2026-06-19T18:00:00.000Z';
    seedChat('404', '6', tiedAt);
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    const snapshot = emptySnapshot(ACCT);
    snapshot.threads = [{
      chatId: '404',
      fanName: 'Fan 404',
      unreadCount: 0,
      hasUnreadTips: false,
      lastMessageId: '5',
      lastMessageAt: tiedAt,
      lastMessageIsSentByMe: false,
      lastMessagePreview: 'stale snapshot head',
      visible: true,
      sourceUpdatedAt: '2026-06-19T18:01:00.000Z',
      messages: [],
    }];

    await callbacks().onSnapshot(snapshot);

    expect(data.chats.get(ACCT, '404')).toMatchObject({
      lastMessageId: '6',
      lastMessageAt: tiedAt,
      lastMessagePreview: 'message 6',
      unreadCount: 1,
    });
    provider.stop();
  });

  it('reconciles an unresolved preview-only delete before snapshot acknowledgement', async () => {
    const { provider, polling, callbacks } = build();
    seedChat('505', '6', '2026-06-19T18:00:00.000Z');
    expect(data.messages.get(ACCT, '505', '6')).toBeNull();
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    const snapshot = emptySnapshot(ACCT);
    snapshot.unresolvedTombstones = [{
      messageId: '6',
      deletedAt: '2026-06-19T18:01:00.000Z',
      sourceUpdatedAt: '2026-06-19T18:01:00.000Z',
      sourceFanoutSeq: 1,
    }];

    await callbacks().onSnapshot(snapshot);

    expect(polling.reconcileCalls).toEqual([ACCT]);
    expect(data.chats.get(ACCT, '505')).toMatchObject({
      lastMessageId: null,
      lastMessageAt: null,
      lastMessagePreview: '',
      unreadCount: 0,
    });
    provider.stop();
  });

  it('id-only messageReceived opens a durable chat intent instead of awaiting a read (D38)', async () => {
    const { provider, polling, callbacks, events, logs } = build();
    provider.start([ACCT]);
    knownChat(); // an existing chat: no new-chat hint on the event
    await Promise.resolve();
    await Promise.resolve();

    const frame: SyncEvent = {
      type: 'messageReceived',
      accountId: ACCT,
      chatId: '101',
      messageId: '9001',
    };
    await runEvent(callbacks(), frame);

    expect(polling.ingestCalls).toEqual([]);
    // The frame no longer awaits the network: the fallback read is a durable
    // obligation committed with the frame.
    expect(polling.refreshCalls).toEqual([]);
    expect(provider.syncIntents().openIntents()).toEqual([
      expect.objectContaining({
        kind: 'chat_message',
        accountId: ACCT,
        chatId: '101',
        messageId: '9001',
        reason: 'thin-frame',
      }),
    ]);
    expect(events).toEqual([{ ...frame, live: false }]);
    expect(provider.hubActivity()).toMatchObject({
      eventsToday: 1,
      appliedEventsToday: 1,
      fallbackEventsToday: 1,
      droppedEventsToday: 0,
      eventsByTypeToday: { messageReceived: 1 },
      appliedByTypeToday: { messageReceived: 1 },
      fallbackByTypeToday: { messageReceived: 1 },
      fallbackByReasonToday: { 'hub-id-only-fallback': 1 },
      lifetime: {
        received: { total: 1, byType: { messageReceived: 1 } },
        applied: { total: 1, byType: { messageReceived: 1 } },
        fallback: { total: 1, byType: { messageReceived: 1 } },
        dropped: { total: 0, byType: {} },
        fallbackByReason: { 'hub-id-only-fallback': 1 },
      },
      lastFallbackReason: 'hub-id-only-fallback',
    });
    expect(logs.some((log) => log.message === 'hub fallback: hub-id-only-fallback')).toBe(true);
    provider.stop();
  });

  it('a thin Hub event never depends on a network read (D38: no await, no rejection)', async () => {
    const { provider, polling, callbacks, events } = build();
    polling.refreshChat = async () => {
      throw new Error('fallback read failed');
    };
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    await expect(runEvent(callbacks(), {
      type: 'messageReceived',
      accountId: ACCT,
      chatId: '101',
      messageId: '9001',
    })).resolves.toBeUndefined();

    expect(events).toHaveLength(1);
    expect(provider.hubActivity().appliedEventsToday).toBe(1);
    expect(provider.syncIntents().openIntents()).toHaveLength(1);
    provider.stop();
  });

  it('mismatched enriched message falls back to refreshChat', async () => {
    const { provider, polling, callbacks, events } = build();
    provider.start([ACCT]);
    knownChat(); // an existing chat: no new-chat hint on the event
    await Promise.resolve();
    await Promise.resolve();

    const frame: SyncEvent = {
      type: 'messageReceived',
      accountId: ACCT,
      chatId: '101',
      messageId: '9001',
      message: hubMessage({ id: 'other-message' }),
    };
    await runEvent(callbacks(), frame);

    expect(polling.ingestCalls).toEqual([]);
    expect(polling.refreshCalls).toEqual([]);
    expect(provider.syncIntents().openIntents()).toEqual([
      expect.objectContaining({ kind: 'chat_message', chatId: '101', messageId: '9001' }),
    ]);
    expect(events).toEqual([frame]);
    expect(provider.hubActivity()).toMatchObject({
      fallbackByTypeToday: { messageReceived: 1 },
      fallbackByReasonToday: { 'hub-mismatched-message-fallback': 1 },
      lifetime: {
        fallback: { total: 1, byType: { messageReceived: 1 } },
        fallbackByReason: { 'hub-mismatched-message-fallback': 1 },
      },
    });
    provider.stop();
  });

  it('bad enriched message bodies degrade to id-only fallback instead of dropping the frame', async () => {
    const { provider, polling, callbacks, events } = build();
    provider.start([ACCT]);
    knownChat(); // an existing chat: no new-chat hint on the event
    await Promise.resolve();
    await Promise.resolve();

    const frame = parseSyncEvent({
      type: 'messageReceived',
      accountId: ACCT,
      chatId: '101',
      messageId: '9001',
      message: {
        id: '9001',
        text: '<p>hello</p>',
        createdAt: '2026-06-11T12:00:00+00:00',
        isSentByMe: false,
        price: 0,
        media: [{ id: 'm1', type: 'new-upstream-type', isReady: true, locked: false }],
      },
    });
    if (frame === null) {
      throw new Error('Expected invalid message body to preserve the event envelope');
    }

    await runEvent(callbacks(), frame);

    expect(polling.ingestCalls).toEqual([]);
    expect(polling.refreshCalls).toEqual([]);
    expect(provider.syncIntents().openIntents()).toEqual([
      expect.objectContaining({ kind: 'chat_message', chatId: '101', messageId: '9001' }),
    ]);
    expect(events).toEqual([{ ...frame, live: false }]);
    expect(provider.hubActivity()).toMatchObject({
      fallbackByTypeToday: { messageReceived: 1 },
      fallbackByReasonToday: { 'hub-id-only-fallback': 1 },
      lifetime: {
        received: { total: 1, byType: { messageReceived: 1 } },
        applied: { total: 1, byType: { messageReceived: 1 } },
        fallback: { total: 1, byType: { messageReceived: 1 } },
        fallbackByReason: { 'hub-id-only-fallback': 1 },
      },
    });
    provider.stop();
  });

  it('tipReceived and ppvUnlocked refresh best-effort without demanding the message locally', async () => {
    const { provider, polling, callbacks, events } = build();
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    await runEvent(callbacks(), {
      type: 'tipReceived',
      accountId: ACCT,
      chatId: '5',
      messageId: '1',
      amountUsd: 5,
    });
    await runEvent(callbacks(), { type: 'ppvUnlocked', accountId: ACCT, chatId: '5', messageId: '2' });
    // No expectedMessageId: notification-shaped events reference historical
    // messages that are legitimately absent from the cached window; demanding
    // them locally is what wedged the stream (incident 2026-07-15).
    expect(polling.refreshCalls).toEqual([
      { accountId: ACCT, chatId: '5' },
      { accountId: ACCT, chatId: '5' },
    ]);
    expect(events.filter((e) => e.type === 'tipReceived' || e.type === 'ppvUnlocked')).toHaveLength(2);
    expect(provider.hubActivity()).toMatchObject({
      eventsByTypeToday: { tipReceived: 1, ppvUnlocked: 1 },
      appliedByTypeToday: { tipReceived: 1, ppvUnlocked: 1 },
      fallbackByTypeToday: { tipReceived: 1, ppvUnlocked: 1 },
      fallbackByReasonToday: { 'hub-notification-fallback': 2 },
      lifetime: {
        received: { total: 2, byType: { tipReceived: 1, ppvUnlocked: 1 } },
        applied: { total: 2, byType: { tipReceived: 1, ppvUnlocked: 1 } },
        fallback: { total: 2, byType: { tipReceived: 1, ppvUnlocked: 1 } },
        fallbackByReason: { 'hub-notification-fallback': 2 },
      },
    });
    provider.stop();
  });

  it('durably unlocks an older cached PPV without demanding it from the refresh', async () => {
    const { provider, polling, callbacks } = build();
    seedMessage('2', '5', {
      createdAt: '2026-06-11T10:00:00.000Z',
      isSentByMe: true,
      price: 25,
      isOpened: false,
    });
    seedMessage('3', '5', {
      createdAt: '2026-06-11T11:00:00.000Z',
    });
    seedChat('5', '3', '2026-06-11T11:00:00.000Z');
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    // The unlock fact applies through the monotonic markOpened merge before
    // any refresh; the refresh itself is best-effort preview upkeep and never
    // carries an expectedMessageId (incident 2026-07-15).
    await runEvent(callbacks(), {
      type: 'ppvUnlocked',
      accountId: ACCT,
      chatId: '5',
      messageId: '2',
    });

    expect(polling.refreshCalls).toEqual([{
      accountId: ACCT,
      chatId: '5',
    }]);
    expect(data.chats.get(ACCT, '5')?.lastMessageId).toBe('3');
    expect(data.messages.get(ACCT, '5', '2')?.isOpened).toBe(true);

    // A failing best-effort refresh must not reject the handler — a rejected
    // onEvent freezes the stream cursor, and a deterministic failure then
    // replays the same frame forever (incident 2026-07-15). The failure is
    // still visible in telemetry.
    polling.refreshError = new Error('refresh permanently failing');
    await expect(runEvent(callbacks(), {
      type: 'ppvUnlocked',
      accountId: ACCT,
      chatId: '5',
      messageId: '2',
    })).resolves.toBeUndefined();
    await Promise.resolve();
    await Promise.resolve();
    expect(provider.hubActivity().fallbackByReasonToday['hub-notification-refresh-failed']).toBe(1);

    // A later stale body/list reconciliation cannot undo the unlock fact.
    seedMessage('2', '5', {
      createdAt: '2026-06-11T10:00:00.000Z',
      isSentByMe: true,
      price: 25,
      isOpened: false,
    });
    seedMessage('2', '5', {
      createdAt: '2026-06-11T10:00:00.000Z',
      isSentByMe: true,
      price: 25,
      isOpened: null,
    });
    expect(data.messages.get(ACCT, '5', '2')?.isOpened).toBe(true);
    provider.stop();
  });

  it('typing/presence/accountAuthChanged re-emit directly without any fetch', async () => {
    const { provider, polling, callbacks, events } = build();
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    await runEvent(callbacks(), { type: 'typing', accountId: ACCT, chatId: '7' });
    await runEvent(callbacks(), { type: 'presence', accountId: ACCT, chatId: '7', online: true });
    await runEvent(callbacks(), { type: 'accountAuthChanged', accountId: ACCT, authenticated: false });

    expect(polling.refreshCalls).toHaveLength(0);
    expect(events.map((e) => e.type)).toEqual(['typing', 'presence', 'accountAuthChanged']);
    provider.stop();
  });

  /** Let the intent worker run: past the 2 s list lag, then one evaluation. */
  async function runIntents(ctx: { provider: ReturnType<typeof createHubAwareSync>; setNow: (ms: number) => void; now: () => number }, advanceMs = 2_000): Promise<void> {
    ctx.setNow(ctx.now() + advanceMs);
    ctx.provider.syncIntents().kick();
    await drainMicrotasks();
  }

  it('messageDeleted without chatId tombstones via DB lookup and re-emits enriched', async () => {
    const ctx = build();
    const { provider, polling, callbacks, events } = ctx;
    seedMessage('1000001', '4471102');
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();
    ctx.listRead(ACCT);

    await runEvent(callbacks(), { type: 'messageDeleted', accountId: ACCT, messageId: '1000001' });

    expect(data.messages.get(ACCT, '4471102', '1000001')?.deleted).toBe(true);
    // D38: no awaited reconcile inside the frame — a durable obligation.
    expect(polling.reconcileCalls).toEqual([]);
    expect(events).toEqual([
      { type: 'messageDeleted', accountId: ACCT, messageId: '1000001', chatId: '4471102' },
    ]);
    expect(provider.syncIntents().openIntents()).toEqual([
      expect.objectContaining({ kind: 'delete_head', accountId: ACCT, messageId: '1000001' }),
    ]);

    await runIntents(ctx);
    // A deletion needs an AUTHORITATIVE read (the survivor head moves back).
    expect(polling.headReads).toEqual([
      { accountId: ACCT, trigger: 'intent', preserveLocalHead: false, bodyDeltas: false },
    ]);
    expect(provider.syncIntents().openIntents()).toEqual([]);
    expect(events.at(-1)).toEqual({ type: 'chatListUpdated', accountId: ACCT });
    provider.stop();
  });

  it('messageDeleted publishes a messages bus change for the resolved chat (tombstone visibility)', async () => {
    const { provider, callbacks } = build();
    seedMessage('1000002', '4471102');
    const scopes: Array<{ scope: string; chatId?: string | undefined }> = [];
    data.bus.subscribe((changes) => {
      for (const change of changes) {
        scopes.push({ scope: change.scope, chatId: change.chatId });
      }
    });
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    await runEvent(callbacks(), { type: 'messageDeleted', accountId: ACCT, messageId: '1000002' });
    data.bus.flushNow();
    expect(scopes).toContainEqual({ scope: 'messages', chatId: '4471102' });
    provider.stop();
  });

  it('messageDeleted for an unknown message still refreshes the account head', async () => {
    const ctx = build();
    const { provider, polling, callbacks, events } = ctx;
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();
    ctx.listRead(ACCT);

    await runEvent(callbacks(), { type: 'messageDeleted', accountId: ACCT, messageId: 'nope' });
    expect(events).toEqual([]);
    await runIntents(ctx);
    expect(polling.headReads).toEqual([
      { accountId: ACCT, trigger: 'intent', preserveLocalHead: false, bodyDeltas: false },
    ]);
    expect(events).toEqual([{ type: 'chatListUpdated', accountId: ACCT }]);
    expect(provider.hubActivity()).toMatchObject({
      eventsToday: 1,
      appliedEventsToday: 0,
      fallbackEventsToday: 1,
      droppedEventsToday: 0,
      eventsByTypeToday: { messageDeleted: 1 },
      fallbackByTypeToday: { messageDeleted: 1 },
      droppedByTypeToday: {},
      fallbackByReasonToday: { 'unknown-delete-head-refresh': 1 },
      lifetime: {
        received: { total: 1, byType: { messageDeleted: 1 } },
        fallback: { total: 1, byType: { messageDeleted: 1 } },
        dropped: { total: 0, byType: {} },
        fallbackByReason: { 'unknown-delete-head-refresh': 1 },
      },
      lastFallbackReason: 'unknown-delete-head-refresh',
    });
    provider.stop();
  });

  it('clears a stale deleted outgoing head without consuming older unread tip state', async () => {
    const ctx = build();
    const { provider, polling, callbacks } = ctx;
    seedChat('outgoing-head-chat', 'outgoing-head', '2026-06-11T12:00:00.000Z', {
      unreadCount: 1,
      hasUnreadTips: true,
      lastMessageIsSentByMe: true,
    });
    // There is deliberately no local message row. The account-head reconcile
    // fake leaves the cached head unchanged, modeling a lagging Core list read.
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    ctx.listRead(ACCT);
    await runEvent(callbacks(), {
      type: 'messageDeleted',
      accountId: ACCT,
      messageId: 'outgoing-head',
    });
    await runIntents(ctx);

    expect(polling.headReads).toHaveLength(1);
    expect(data.chats.get(ACCT, 'outgoing-head-chat')).toMatchObject({
      lastMessageId: null,
      lastMessagePreview: '',
      unreadCount: 1,
      hasUnreadTips: true,
    });
    provider.stop();
  });

  it('messageDeleted with chatId already present skips the lookup and still tombstones', async () => {
    const { provider, callbacks, events } = build();
    seedMessage('1000003', '555');
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    await runEvent(callbacks(), {
      type: 'messageDeleted',
      accountId: ACCT,
      messageId: '1000003',
      chatId: '555',
    });
    expect(data.messages.get(ACCT, '555', '1000003')?.deleted).toBe(true);
    expect(events).toEqual([
      { type: 'messageDeleted', accountId: ACCT, messageId: '1000003', chatId: '555' },
    ]);
    provider.stop();
  });

  it('chatListUpdated opens a lag-safe account intent and avoids duplicate list events', async () => {
    const ctx = build();
    const { provider, polling, callbacks, events } = ctx;
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();
    ctx.listRead(ACCT);

    await runEvent(callbacks(), { type: 'chatListUpdated', accountId: ACCT });
    expect(events).toEqual([]);
    expect(provider.syncIntents().openIntents()).toEqual([
      expect.objectContaining({ kind: 'account_list', accountId: ACCT, reason: 'list-nudge' }),
    ]);

    await runIntents(ctx);
    expect(polling.accountRefreshCalls).toEqual([]);
    expect(polling.headReads).toEqual([
      { accountId: ACCT, trigger: 'intent', preserveLocalHead: true, bodyDeltas: false },
    ]);
    expect(events).toEqual([{ type: 'chatListUpdated', accountId: ACCT }]);
    expect(provider.syncIntents().openIntents()).toEqual([]);
    provider.stop();
  });

  it('messageSent reaches a send-engine-style listener from BOTH providers via one subscription', async () => {
    const { provider, polling, callbacks } = build();
    const engineSeen: SyncEvent[] = [];
    provider.subscribe((event) => {
      if (event.type === 'messageSent') engineSeen.push(event);
    });
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    // polling-origin messageSent (P1 path)
    polling.emit({ type: 'messageSent', accountId: ACCT, chatId: '1', messageId: 'm1' });
    // hub-origin messageSent (SSE path)
    await runEvent(callbacks(), { type: 'messageSent', accountId: ACCT, chatId: '1', messageId: 'm2' });

    expect(engineSeen.map((e) => (e.type === 'messageSent' ? e.messageId : null))).toEqual([
      'm1',
      'm2',
    ]);
    provider.stop();
  });

  it('createHub resolving null (hub unconfigured) leaves pure polling mode intact', async () => {
    const polling = makeFakePolling();
    const logs: Array<{ level: string; message: string }> = [];
    const provider = createHubAwareSync({
      polling,
      data,
      createHub: () => Promise.resolve(null),
      onLog: (level, message) => logs.push({ level, message }),
    });
    const events: SyncEvent[] = [];
    provider.subscribe((event) => events.push(event));
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    expect(provider.hubStatus()).toBeNull();
    expect(provider.hubMode()).toBe('off');
    expect(logs).toContainEqual({ level: 'info', message: 'hub not configured; using polling only' });
    polling.emit({ type: 'chatListUpdated', accountId: ACCT });
    expect(events).toHaveLength(1);
    expect(polling.suspensions).toEqual([]);
    provider.stop();
  });

  it('force-polling skips hub creation and leaves polling events flowing', async () => {
    const polling = makeFakePolling();
    const createHub = vi.fn(() => Promise.resolve(makeFakeHub()));
    const logs: Array<{ level: string; message: string }> = [];
    const provider = createHubAwareSync({
      polling,
      data,
      createHub,
      hubModeOverride: () => 'polling',
      onLog: (level, message) => logs.push({ level, message }),
    });
    const events: SyncEvent[] = [];
    provider.subscribe((event) => events.push(event));
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    expect(createHub).not.toHaveBeenCalled();
    expect(provider.hubModeOverride()).toBe('polling');
    expect(provider.hubStatus()).toBeNull();
    expect(polling.suspensions).toEqual([]);
    expect(logs).toContainEqual({
      level: 'warn',
      message: 'hub forced to polling; SSE connection skipped',
    });

    polling.emit({ type: 'chatListUpdated', accountId: ACCT });
    expect(events).toEqual([{ type: 'chatListUpdated', accountId: ACCT }]);
    provider.stop();
  });

  it('force-hub suspends polling while configured hub connects and does not resume on degrade', async () => {
    const polling = makeFakePolling();
    const hub = makeFakeHub();
    let captured: HubFactoryCallbacks | null = null;
    const logs: Array<{ level: string; message: string }> = [];
    const provider = createHubAwareSync({
      polling,
      data,
      createHub: (callbacks) => {
        captured = callbacks;
        return Promise.resolve(hub);
      },
      hubModeOverride: () => 'hub',
      onLog: (level, message) => logs.push({ level, message }),
    });
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();
    const callbacks = (): HubFactoryCallbacks => {
      if (captured === null) throw new Error('hub not created');
      return captured;
    };

    expect(provider.hubModeOverride()).toBe('hub');
    expect(hub.startCalls).toBe(1);
    expect(polling.suspensions).toEqual([true]);
    expect(logs).toContainEqual({
      level: 'warn',
      message: 'hub forced; polling fallback suspended while SSE connects',
    });

    callbacks().onStatusChange('degraded');
    expect(polling.suspensions).toEqual([true]);
    expect(polling.forceRefreshCalls).toBe(0);
    expect(logs.map((log) => log.message)).toContain('SSE degraded');

    callbacks().onStatusChange('live');
    callbacks().onStatusChange('auth-failed');
    expect(polling.suspensions).toEqual([true]);
    expect(polling.forceRefreshCalls).toBe(0);
    expect(logs.map((log) => log.message)).toContain(
      'SSE not live; force-hub keeps polling suspended',
    );

    provider.stop();
    expect(polling.suspensions).toEqual([true, false]);
  });

  it('reconfigureHub stops the old hub, restores cadence, and starts a fresh one', async () => {
    const polling = makeFakePolling();
    const hubs = [makeFakeHub(), makeFakeHub()];
    let created = 0;
    let captured: HubFactoryCallbacks | null = null;
    const provider = createHubAwareSync({
      polling,
      data,
      createHub: (callbacks) => {
        captured = callbacks;
        const hub = hubs[created];
        created += 1;
        return Promise.resolve(hub ?? null);
      },
    });
    const cb = (): HubFactoryCallbacks => {
      if (!captured) throw new Error('hub not created');
      return captured;
    };
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();
    cb().onStatusChange('live');
    expect(polling.suspensions).toEqual([true]);

    await provider.reconfigureHub();
    expect(hubs[0]?.stopCalls).toBe(1);
    expect(hubs[1]?.startCalls).toBe(1);
    // suspension released on teardown; the new hub suspends when it goes live
    expect(polling.suspensions).toEqual([true, false]);
    provider.stop();
  });

  // ── hubActivity (Activity panel liveness, PLAN item 9) ──────────────────

  function buildWithClock(): {
    provider: ReturnType<typeof createHubAwareSync>;
    callbacks: () => HubFactoryCallbacks;
    tick: (ms: number) => void;
  } {
    let nowMs = Date.parse('2026-06-11T12:00:00Z');
    const polling = makeFakePolling();
    let captured: HubFactoryCallbacks | null = null;
    const provider = createHubAwareSync({
      polling,
      data,
      now: () => nowMs,
      createHub: (callbacks) => {
        captured = callbacks;
        return Promise.resolve(makeFakeHub());
      },
    });
    return {
      provider,
      tick: (ms) => {
        nowMs += ms;
      },
      callbacks: () => {
        if (!captured) throw new Error('hub not created yet');
        return captured;
      },
    };
  }

  it('hubActivity counts events, tracks the last event, and persists across rebuilds', async () => {
    const { provider, callbacks, tick } = buildWithClock();
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    expect(provider.hubActivity()).toMatchObject({ eventsToday: 0, lastEventAt: null });

    await runEvent(callbacks(), { type: 'typing', accountId: ACCT, chatId: '7' });
    tick(3_000);
    await runEvent(callbacks(), { type: 'chatListUpdated', accountId: ACCT });

    const activity = provider.hubActivity();
    expect(activity.eventsToday).toBe(2);
    expect(activity.lastEventType).toBe('chatListUpdated');
    expect(activity.lastEventAt).toBe(Date.parse('2026-06-11T12:00:03Z'));
    expect(activity.eventsByTypeToday).toEqual({ typing: 1, chatListUpdated: 1 });
    expect(activity.appliedByTypeToday).toEqual({ typing: 1, chatListUpdated: 1 });
    expect(activity.lifetime).toMatchObject({
      received: { total: 2, byType: { typing: 1, chatListUpdated: 1 } },
      applied: { total: 2, byType: { typing: 1, chatListUpdated: 1 } },
      fallback: { total: 0, byType: {} },
      dropped: { total: 0, byType: {} },
      fallbackByReason: {},
    });
    provider.stop();

    // The counter survives a provider rebuild (persisted in the settings KV).
    const { provider: rebuilt } = buildWithClock();
    expect(rebuilt.hubActivity().eventsToday).toBe(2);
    expect(rebuilt.hubActivity().lifetime.received.total).toBe(2);
    expect(rebuilt.hubActivity().lifetime.received.byType).toEqual({
      typing: 1,
      chatListUpdated: 1,
    });
  });

  it('hubActivity resets the daily counter on UTC day flip', async () => {
    const { provider, callbacks, tick } = buildWithClock();
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    await runEvent(callbacks(), { type: 'typing', accountId: ACCT, chatId: '7' });
    expect(provider.hubActivity().eventsToday).toBe(1);

    tick(24 * 60 * 60_000);
    expect(provider.hubActivity().eventsToday).toBe(0);
    expect(provider.hubActivity().eventsByTypeToday).toEqual({});
    expect(provider.hubActivity().lifetime.received.total).toBe(1);
    await runEvent(callbacks(), { type: 'typing', accountId: ACCT, chatId: '7' });
    expect(provider.hubActivity().eventsToday).toBe(1);
    expect(provider.hubActivity().lifetime.received.total).toBe(2);
    provider.stop();
  });

  it('hubActivity tracks liveSince and the last status transition', async () => {
    const { provider, callbacks, tick } = buildWithClock();
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    expect(provider.hubActivity().liveSinceMs).toBeNull();
    callbacks().onStatusChange('live');
    const liveAt = provider.hubActivity().liveSinceMs;
    expect(liveAt).toBe(Date.parse('2026-06-11T12:00:00Z'));

    tick(60_000);
    callbacks().onStatusChange('live'); // staying live must not reset the clock
    expect(provider.hubActivity().liveSinceMs).toBe(liveAt);

    tick(60_000);
    callbacks().onStatusChange('degraded');
    const after = provider.hubActivity();
    expect(after.liveSinceMs).toBeNull();
    expect(after.statusChangedAtMs).toBe(Date.parse('2026-06-11T12:02:00Z'));
    provider.stop();
  });
});
