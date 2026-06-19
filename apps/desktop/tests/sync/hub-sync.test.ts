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
  SseFrameParser,
  HUB_WATCHDOG_MS,
  type HubSseBody,
  type HubSseFetch,
  type HubSyncStatus,
  type SseFrame,
} from '../../src/main/sync/hub-sync';
import { createHubAwareSync, type HubFactoryCallbacks } from '../../src/main/sync/hub-provider';
import type { HubSync } from '../../src/main/sync/hub-sync';
import type { SyncProvider } from '../../src/main/sync/provider';
import { mapHubMessage } from '../../src/main/sync/mappers';
import { createDataLayer, type DataLayer } from '../../src/main/db/index';
import type { MessageUpsert } from '../../src/main/db/index';

const TEST_DRIVER = 'bsqlite3-mc-node';
const ACCT = 'acct_hub_test';

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
  }

  function makeSync(
    responses: Array<{ status: number; stream: FakeStream | null; json?: unknown }>,
    options: { initialLastEventId?: number | null; onEventDelay?: boolean } = {},
  ): SyncHarness {
    const { fetchImpl, calls } = makeHarness(responses);
    const statuses: HubSyncStatus[] = [];
    const log: string[] = [];
    const sleeps: number[] = [];
    let lastEventId: number | null = options.initialLastEventId ?? null;
    const sync = createHubSync({
      baseUrl: 'https://hub.test/',
      apiKey: 'agency_hub_core_k1',
      fetchImpl,
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
      onEvent: async (event) => {
        if (options.onEventDelay === true) {
          await Promise.resolve(); // async handling must still precede persist
        }
        log.push(`event:${event.type}`);
      },
      accountIds: [ACCT],
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
    return { sync, calls, statuses, log, sleeps, lastEventId: () => lastEventId };
  }

  it('happy stream: bearer auth, events in order, lastEventId persisted AFTER handling', async () => {
    const stream = makeStream();
    const h = makeSync([{ status: 200, stream }], { onEventDelay: true });
    h.sync.start();
    await drainMicrotasks();

    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]?.url).toBe('https://hub.test/api/v1/events/stream'); // no resume param yet
    expect(h.calls[0]?.headers['authorization']).toBe('Bearer agency_hub_core_k1');
    expect(h.calls[0]?.headers['accept']).toBe('text/event-stream');

    stream.send('retry: 3000\n\n');
    stream.send(syncFrame(41, TYPING_DATA('1')));
    stream.send(syncFrame(42, TYPING_DATA('2')));
    await drainMicrotasks();

    expect(h.log).toEqual(['event:typing', 'persist:41', 'event:typing', 'persist:42']);
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
      { initialLastEventId: 7 },
    );

    h.sync.start();
    await drainMicrotasks();

    expect(h.calls.map((call) => call.url)).toEqual([
      'https://hub.test/api/v1/events/stream?lastEventId=7',
      'https://hub.test/api/v1/events/snapshot?accountId=acct_hub_test&afterSeq=7&pageCursor=0&limit=50',
      'https://hub.test/api/v1/events/snapshot?accountId=acct_hub_test&afterSeq=7&pageCursor=5&limit=50&snapshotCursor=22',
      'https://hub.test/api/v1/events/stream?lastEventId=22',
    ]);
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

  it('refuses to checkpoint a partial snapshot', async () => {
    let call = 0;
    let lastEventId = 7;
    const sync = createHubSync({
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

interface FakePolling extends SyncProvider {
  pollAccount(accountId: string): Promise<void>;
  setHubPollingSuspended(suspended: boolean): void;
  suspensions: boolean[];
  forceRefreshCalls: number;
  refreshCalls: Array<{ accountId: string; chatId: string }>;
  accountRefreshCalls: string[];
  ingestCalls: Array<{ accountId: string; chatId: string; messageId: string }>;
  ingestResult: boolean;
  refreshAccountHead(accountId: string): Promise<void>;
  ingestHubMessage(accountId: string, chatId: string, message: NormalizedSyncMessage): Promise<boolean>;
  emit(event: SyncEvent): void;
}

function makeFakePolling(): FakePolling {
  const listeners = new Set<(event: SyncEvent) => void>();
  const polling: FakePolling = {
    suspensions: [],
    forceRefreshCalls: 0,
    refreshCalls: [],
    accountRefreshCalls: [],
    ingestCalls: [],
    ingestResult: true,
    emit: (event) => {
      for (const listener of listeners) listener(event);
    },
    start: () => undefined,
    stop: () => undefined,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refreshChat: (accountId, chatId) => {
      polling.refreshCalls.push({ accountId, chatId });
      // mirrors the real provider: refreshChat re-announces the list
      polling.emit({ type: 'chatListUpdated', accountId });
      return Promise.resolve();
    },
    refreshAccountHead: (accountId) => {
      polling.accountRefreshCalls.push(accountId);
      polling.emit({ type: 'chatListUpdated', accountId });
      return Promise.resolve();
    },
    ingestHubMessage: (accountId, chatId, message) => {
      polling.ingestCalls.push({ accountId, chatId, messageId: message.id });
      return Promise.resolve(polling.ingestResult);
    },
    readChatTailForUserOpen: () => Promise.resolve(),
    ensureChat: () => Promise.resolve(true),
    openConversation: () => Promise.resolve(),
    closeConversation: () => undefined,
    setFocusedAccount: () => undefined,
    setWindowVisible: () => undefined,
    forceRefresh: () => {
      polling.forceRefreshCalls += 1;
      return Promise.resolve();
    },
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

  function build(): {
    provider: ReturnType<typeof createHubAwareSync>;
    polling: FakePolling;
    hub: FakeHub;
    callbacks: () => HubFactoryCallbacks;
    events: SyncEvent[];
    logs: Array<{ level: string; message: string; fields?: Record<string, unknown> | undefined }>;
  } {
    const polling = makeFakePolling();
    const hub = makeFakeHub();
    let captured: HubFactoryCallbacks | null = null;
    const logs: Array<{ level: string; message: string; fields?: Record<string, unknown> | undefined }> = [];
    const provider = createHubAwareSync({
      polling,
      data,
      createHub: (callbacks) => {
        captured = callbacks;
        return Promise.resolve(hub);
      },
      onLog: (level, message, fields) => logs.push({ level, message, fields }),
    });
    const events: SyncEvent[] = [];
    provider.subscribe((event) => events.push(event));
    return {
      provider,
      polling,
      hub,
      events,
      logs,
      callbacks: () => {
        if (!captured) throw new Error('hub not created yet');
        return captured;
      },
    };
  }

  function seedMessage(messageId: string, chatId: string): void {
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
    };
    data.messages.upsertMany([upsert]);
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

  it('start() starts polling AND the hub when settings are configured', async () => {
    const { provider, hub } = build();
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();
    expect(hub.startCalls).toBe(1);
    provider.stop();
    expect(hub.stopCalls).toBe(1);
  });

  it('hub live suspends polling; degraded restores it and runs ONE reconciliation sweep', async () => {
    const { provider, polling, callbacks, logs } = build();
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    callbacks().onStatusChange('live');
    expect(polling.suspensions).toEqual([true]);
    expect(polling.forceRefreshCalls).toBe(0);

    callbacks().onStatusChange('live'); // no re-suspension churn
    expect(polling.suspensions).toEqual([true]);

    callbacks().onStatusChange('degraded');
    expect(polling.suspensions).toEqual([true, false]);
    expect(polling.forceRefreshCalls).toBe(1);

    callbacks().onStatusChange('degraded'); // still down: no extra sweeps
    expect(polling.forceRefreshCalls).toBe(1);
    expect(logs.map((log) => log.message)).toContain('SSE live; polling suspended');
    expect(logs.map((log) => log.message)).toContain('SSE not live; polling resumed');
    provider.stop();
  });

  it('enriched messageReceived ingests locally and skips refreshChat', async () => {
    const { provider, polling, callbacks, events } = build();
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    const frame: SyncEvent = {
      type: 'messageReceived',
      accountId: ACCT,
      chatId: '101',
      messageId: '9001',
      message: hubMessage(),
    };
    await callbacks().onEvent(frame);

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
      lastMessageId: 'new',
      lastMessagePreview: 'new body',
    });
    expect(events.filter((event) => event.type === 'chatListUpdated')).toHaveLength(2);
    expect(provider.hubActivity().lastFallbackReason).toBe('hub-replay-gap-snapshot');
    provider.stop();
  });

  it('id-only messageReceived preserves the refreshChat fallback before re-emitting', async () => {
    const { provider, polling, callbacks, events, logs } = build();
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    const frame: SyncEvent = {
      type: 'messageReceived',
      accountId: ACCT,
      chatId: '101',
      messageId: '9001',
    };
    await callbacks().onEvent(frame);

    expect(polling.ingestCalls).toEqual([]);
    expect(polling.refreshCalls).toEqual([{ accountId: ACCT, chatId: '101' }]);
    expect(events).toEqual([{ type: 'chatListUpdated', accountId: ACCT }, frame]);
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

  it('mismatched enriched message falls back to refreshChat', async () => {
    const { provider, polling, callbacks, events } = build();
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    const frame: SyncEvent = {
      type: 'messageReceived',
      accountId: ACCT,
      chatId: '101',
      messageId: '9001',
      message: hubMessage({ id: 'other-message' }),
    };
    await callbacks().onEvent(frame);

    expect(polling.ingestCalls).toEqual([]);
    expect(polling.refreshCalls).toEqual([{ accountId: ACCT, chatId: '101' }]);
    expect(events).toEqual([{ type: 'chatListUpdated', accountId: ACCT }, frame]);
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

    await callbacks().onEvent(frame);

    expect(polling.ingestCalls).toEqual([]);
    expect(polling.refreshCalls).toEqual([{ accountId: ACCT, chatId: '101' }]);
    expect(events).toEqual([{ type: 'chatListUpdated', accountId: ACCT }, frame]);
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

  it('tipReceived and ppvUnlocked also refresh the chat tail before re-emitting', async () => {
    const { provider, polling, callbacks, events } = build();
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    await callbacks().onEvent({
      type: 'tipReceived',
      accountId: ACCT,
      chatId: '5',
      messageId: '1',
      amountUsd: 5,
    });
    await callbacks().onEvent({ type: 'ppvUnlocked', accountId: ACCT, chatId: '5', messageId: '2' });
    expect(polling.refreshCalls).toHaveLength(2);
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

  it('typing/presence/accountAuthChanged re-emit directly without any fetch', async () => {
    const { provider, polling, callbacks, events } = build();
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    await callbacks().onEvent({ type: 'typing', accountId: ACCT, chatId: '7' });
    await callbacks().onEvent({ type: 'presence', accountId: ACCT, chatId: '7', online: true });
    await callbacks().onEvent({ type: 'accountAuthChanged', accountId: ACCT, authenticated: false });

    expect(polling.refreshCalls).toHaveLength(0);
    expect(events.map((e) => e.type)).toEqual(['typing', 'presence', 'accountAuthChanged']);
    provider.stop();
  });

  it('messageDeleted without chatId tombstones via DB lookup and re-emits enriched', async () => {
    const { provider, polling, callbacks, events } = build();
    seedMessage('1000001', '4471102');
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    await callbacks().onEvent({ type: 'messageDeleted', accountId: ACCT, messageId: '1000001' });

    expect(data.messages.get(ACCT, '4471102', '1000001')?.deleted).toBe(true);
    expect(polling.accountRefreshCalls).toEqual([ACCT]);
    expect(events).toEqual([
      { type: 'chatListUpdated', accountId: ACCT },
      { type: 'messageDeleted', accountId: ACCT, messageId: '1000001', chatId: '4471102' },
    ]);
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

    await callbacks().onEvent({ type: 'messageDeleted', accountId: ACCT, messageId: '1000002' });
    data.bus.flushNow();
    expect(scopes).toContainEqual({ scope: 'messages', chatId: '4471102' });
    provider.stop();
  });

  it('messageDeleted for an unknown message still refreshes the account head', async () => {
    const { provider, polling, callbacks, events } = build();
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    await callbacks().onEvent({ type: 'messageDeleted', accountId: ACCT, messageId: 'nope' });
    expect(polling.accountRefreshCalls).toEqual([ACCT]);
    expect(events).toEqual([{ type: 'chatListUpdated', accountId: ACCT }]);
    expect(provider.hubActivity()).toMatchObject({
      eventsToday: 1,
      appliedEventsToday: 0,
      fallbackEventsToday: 1,
      droppedEventsToday: 1,
      eventsByTypeToday: { messageDeleted: 1 },
      fallbackByTypeToday: { messageDeleted: 1 },
      droppedByTypeToday: { messageDeleted: 1 },
      fallbackByReasonToday: { 'unknown-delete-head-refresh': 1 },
      lifetime: {
        received: { total: 1, byType: { messageDeleted: 1 } },
        fallback: { total: 1, byType: { messageDeleted: 1 } },
        dropped: { total: 1, byType: { messageDeleted: 1 } },
        fallbackByReason: { 'unknown-delete-head-refresh': 1 },
      },
      lastFallbackReason: 'unknown-delete-head-refresh',
    });
    provider.stop();
  });

  it('messageDeleted with chatId already present skips the lookup and still tombstones', async () => {
    const { provider, callbacks, events } = build();
    seedMessage('1000003', '555');
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    await callbacks().onEvent({
      type: 'messageDeleted',
      accountId: ACCT,
      messageId: '1000003',
      chatId: '555',
    });
    expect(data.messages.get(ACCT, '555', '1000003')?.deleted).toBe(true);
    expect(events).toEqual([
      { type: 'chatListUpdated', accountId: ACCT },
      { type: 'messageDeleted', accountId: ACCT, messageId: '1000003', chatId: '555' },
    ]);
    provider.stop();
  });

  it('chatListUpdated refreshes the account head and avoids duplicate list events', async () => {
    const { provider, polling, callbacks, events } = build();
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    await callbacks().onEvent({ type: 'chatListUpdated', accountId: ACCT });

    expect(polling.accountRefreshCalls).toEqual([ACCT]);
    expect(events).toEqual([{ type: 'chatListUpdated', accountId: ACCT }]);
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
    await callbacks().onEvent({ type: 'messageSent', accountId: ACCT, chatId: '1', messageId: 'm2' });

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

    await callbacks().onEvent({ type: 'typing', accountId: ACCT, chatId: '7' });
    tick(3_000);
    await callbacks().onEvent({ type: 'chatListUpdated', accountId: ACCT });

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

    await callbacks().onEvent({ type: 'typing', accountId: ACCT, chatId: '7' });
    expect(provider.hubActivity().eventsToday).toBe(1);

    tick(24 * 60 * 60_000);
    expect(provider.hubActivity().eventsToday).toBe(0);
    expect(provider.hubActivity().eventsByTypeToday).toEqual({});
    expect(provider.hubActivity().lifetime.received.total).toBe(1);
    await callbacks().onEvent({ type: 'typing', accountId: ACCT, chatId: '7' });
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
