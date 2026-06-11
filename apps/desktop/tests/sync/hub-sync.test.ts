// HubSync: SSE frame parser, the stream consumer's reconnect/resume/watchdog
// state machine, and the hub-aware provider composition (SPEC §6.2).
// Wire facts live-verified 2026-06-11 against core commit de37911: frames
// `id/event:sync/data`, `retry: 3000` on connect, `: keep-alive` every 30 s,
// 15-min max stream lifetime (clean close = normal path).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncEvent } from '@chatgoose/shared/protocol/index';
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
  responses: Array<{ status: number; stream: FakeStream | null }>,
): { fetchImpl: HubSseFetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchImpl: HubSseFetch = (url, init) => {
    calls.push({ url, headers: init.headers });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (!next) {
      throw new Error('no scripted response');
    }
    return Promise.resolve({ status: next.status, body: next.stream?.body ?? null });
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
    responses: Array<{ status: number; stream: FakeStream | null }>,
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
});

// ─── provider composition ──────────────────────────────────────────────────

interface FakePolling extends SyncProvider {
  pollAccount(accountId: string): Promise<void>;
  setHubDemoted(demoted: boolean): void;
  demotions: boolean[];
  forceRefreshCalls: number;
  refreshCalls: Array<{ accountId: string; chatId: string }>;
  emit(event: SyncEvent): void;
}

function makeFakePolling(): FakePolling {
  const listeners = new Set<(event: SyncEvent) => void>();
  const polling: FakePolling = {
    demotions: [],
    forceRefreshCalls: 0,
    refreshCalls: [],
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
    setHubDemoted: (demoted) => {
      polling.demotions.push(demoted);
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
  } {
    const polling = makeFakePolling();
    const hub = makeFakeHub();
    let captured: HubFactoryCallbacks | null = null;
    const provider = createHubAwareSync({
      polling,
      data,
      createHub: (callbacks) => {
        captured = callbacks;
        return Promise.resolve(hub);
      },
    });
    const events: SyncEvent[] = [];
    provider.subscribe((event) => events.push(event));
    return {
      provider,
      polling,
      hub,
      events,
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

  it('start() starts polling AND the hub when settings are configured', async () => {
    const { provider, hub } = build();
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();
    expect(hub.startCalls).toBe(1);
    provider.stop();
    expect(hub.stopCalls).toBe(1);
  });

  it('hub live demotes polling cadence; degraded restores it and runs ONE reconciliation sweep', async () => {
    const { provider, polling, callbacks } = build();
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    callbacks().onStatusChange('live');
    expect(polling.demotions).toEqual([true]);
    expect(polling.forceRefreshCalls).toBe(0);

    callbacks().onStatusChange('live'); // no re-demotion churn
    expect(polling.demotions).toEqual([true]);

    callbacks().onStatusChange('degraded');
    expect(polling.demotions).toEqual([true, false]);
    expect(polling.forceRefreshCalls).toBe(1);

    callbacks().onStatusChange('degraded'); // still down: no extra sweeps
    expect(polling.forceRefreshCalls).toBe(1);
    provider.stop();
  });

  it('messageReceived triggers exactly one refreshChat (bodies first), then re-emits', async () => {
    const { provider, polling, callbacks, events } = build();
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

    expect(polling.refreshCalls).toEqual([{ accountId: ACCT, chatId: '101' }]);
    // refreshChat's own chatListUpdated arrives BEFORE the id-bearing event
    expect(events).toEqual([{ type: 'chatListUpdated', accountId: ACCT }, frame]);
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
    const { provider, callbacks, events } = build();
    seedMessage('1000001', '4471102');
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    await callbacks().onEvent({ type: 'messageDeleted', accountId: ACCT, messageId: '1000001' });

    expect(data.messages.get(ACCT, '4471102', '1000001')?.deleted).toBe(true);
    expect(events).toEqual([
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

  it('messageDeleted for an unknown message drops silently (no emit, no tombstone)', async () => {
    const { provider, callbacks, events } = build();
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    await callbacks().onEvent({ type: 'messageDeleted', accountId: ACCT, messageId: 'nope' });
    expect(events).toEqual([]);
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
    expect(events).toHaveLength(1);
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
    const provider = createHubAwareSync({
      polling,
      data,
      createHub: () => Promise.resolve(null),
    });
    const events: SyncEvent[] = [];
    provider.subscribe((event) => events.push(event));
    provider.start([ACCT]);
    await Promise.resolve();
    await Promise.resolve();

    expect(provider.hubStatus()).toBeNull();
    polling.emit({ type: 'chatListUpdated', accountId: ACCT });
    expect(events).toHaveLength(1);
    expect(polling.demotions).toEqual([]);
    provider.stop();
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
    expect(polling.demotions).toEqual([true]);

    await provider.reconfigureHub();
    expect(hubs[0]?.stopCalls).toBe(1);
    expect(hubs[1]?.startCalls).toBe(1);
    // demotion released on teardown; the new hub re-demotes when it goes live
    expect(polling.demotions).toEqual([true, false]);
    provider.stop();
  });
});
