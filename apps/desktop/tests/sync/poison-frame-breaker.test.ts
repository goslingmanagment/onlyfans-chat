// Poison-frame breaker (incident 2026-07-15): a v2 frame whose handler
// rejects DETERMINISTICALLY must not replay forever. After
// HUB_POISON_FRAME_MAX_REJECTIONS consecutive rejections of the same frame
// the loop escalates: snapshot-covered types rebaseline through the v2
// fresh-cursor + durable-state recovery (skips the frame, keeps its state);
// anything else parks SSE for HUB_POISON_BACKOFF_MS with a loud warning
// instead of skipping state silently.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncSnapshotResponse } from '@chatgoose/shared/protocol/index';
import {
  createHubSync,
  HUB_POISON_BACKOFF_MS,
  HUB_POISON_FRAME_MAX_REJECTIONS,
  HUB_SNAPSHOT_PATH,
  HUB_V2_SNAPSHOT_PATH,
  HUB_V2_SSE_PATH,
  type HubSseFetch,
  type HubSyncStatus,
} from '../../src/main/sync/hub-sync';

const ACCT = 'acct_poison_test';

interface FakeStream {
  send(text: string): void;
  close(): void;
  body: { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }>; cancel(): Promise<void> } };
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
        cancel: () => {
          deliver({ done: true });
          return Promise.resolve();
        },
      }),
    },
  };
}

function makeHarness(
  responses: Array<{ status: number; stream: FakeStream | null; json?: unknown }>,
): { fetchImpl: HubSseFetch; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl: HubSseFetch = (url) => {
    calls.push(url);
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

function domainFrame(cursor: string, frame: Record<string, unknown>): string {
  return `id: ${cursor}\nevent: domain\ndata: ${JSON.stringify(frame)}\n\n`;
}

/** The same poisoned frame the server would replay on every reconnect. */
function poisonMessageFrame(): string {
  return domainFrame('CUR_POISON', {
    accountId: 7,
    accountSeq: 41,
    type: 'message.received',
    occurredAt: '2026-07-15T00:38:00.000Z',
    data: { text: 'poison', price: 0 },
    fanRef: '777',
    conversationRef: '777',
    messageRef: '9001',
    accountRef: ACCT,
  });
}

function poisonPresenceFrame(): string {
  return domainFrame('CUR_POISON', {
    accountId: 7,
    accountSeq: 55,
    type: 'presence.online',
    occurredAt: '2026-07-15T00:38:00.000Z',
    data: { lastSeenOnlineAt: '2026-07-15T00:38:00.000Z' },
    fanRef: '777',
    accountRef: ACCT,
  });
}

function statePage(): SyncSnapshotResponse {
  return {
    version: 1,
    requestedAfterSeq: 0,
    snapshotCursor: 22,
    stateAt: '2026-07-15T06:00:00.000Z',
    resumeAllowed: true,
    page: {
      pageId: 7,
      label: 'lora-of',
      accountId: ACCT,
      username: 'lora',
      authStatus: 'connected',
      authenticated: true,
      authChangedAt: '2026-07-15T05:59:00.000Z',
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

async function drainMicrotasks(): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    await Promise.resolve();
  }
}

interface BreakerHarness {
  sync: ReturnType<typeof createHubSync>;
  calls: string[];
  warns: string[];
  statuses: HubSyncStatus[];
  sleeps: number[];
  cursor: () => string | null;
}

function makeBreakerSync(
  responses: Array<{ status: number; stream: FakeStream | null; json?: unknown }>,
  options: { rejectType: string },
): BreakerHarness {
  const { fetchImpl, calls } = makeHarness(responses);
  const warns: string[] = [];
  const statuses: HubSyncStatus[] = [];
  const sleeps: number[] = [];
  let cursor: string | null = 'CUR_STALE';
  const sync = createHubSync({
    protocol: 'v2',
    baseUrl: 'https://hub.test',
    apiKey: 'k',
    fetchImpl,
    // The stand-down pause must PARK the loop (a resolved sleep would spin it
    // through the scripted responses forever); everything shorter resolves.
    sleep: (ms) => {
      sleeps.push(ms);
      return ms >= HUB_POISON_BACKOFF_MS ? new Promise(() => undefined) : Promise.resolve();
    },
    accountIds: [ACCT],
    onEvent: (event) => {
      if (event.type === options.rejectType) {
        throw new Error('deterministic handler failure');
      }
    },
    onWarn: (message) => {
      warns.push(message);
    },
    onV2GapRecovered: () => Promise.resolve([ACCT]),
    onSnapshot: () => undefined,
    onStatusChange: (status) => statuses.push(status),
    getLastEventId: () => null,
    setLastEventId: () => undefined,
    getV2Cursor: () => cursor,
    setV2Cursor: (next) => {
      cursor = next;
    },
    clearV2Cursor: () => {
      cursor = null;
    },
  });
  return { sync, calls, warns, statuses, sleeps, cursor: () => cursor };
}

describe('hub-sync poison-frame breaker (v2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rebaselines a snapshot-covered poison via v2 state recovery after 3 rejections', async () => {
    const streams = [makeStream(), makeStream(), makeStream(), makeStream()];
    const h = makeBreakerSync([
      { status: 200, stream: streams[0]! },
      { status: 200, stream: streams[1]! },
      { status: 200, stream: streams[2]! },
      {
        status: 200,
        stream: null,
        json: { cursor: 'CUR_FRESH', accounts: [{ accountId: 7, accountRef: ACCT, currentSeq: 41 }] },
      },
      { status: 200, stream: null, json: statePage() },
      { status: 200, stream: streams[3]! },
    ], { rejectType: 'messageReceived' });

    h.sync.start();
    await drainMicrotasks();
    for (let cycle = 0; cycle < HUB_POISON_FRAME_MAX_REJECTIONS; cycle += 1) {
      streams[cycle]!.send(poisonMessageFrame()); // the server replays the same frame
      await drainMicrotasks();
    }
    await drainMicrotasks();

    // Three SSE attempts with the frozen cursor, then escalation — never a
    // fourth blind replay.
    expect(h.calls[0]).toContain(`${HUB_V2_SSE_PATH}?cursor=CUR_STALE`);
    expect(h.calls[1]).toContain(`${HUB_V2_SSE_PATH}?cursor=CUR_STALE`);
    expect(h.calls[2]).toContain(`${HUB_V2_SSE_PATH}?cursor=CUR_STALE`);
    expect(h.calls[3]).toContain(HUB_V2_SNAPSHOT_PATH);
    expect(h.calls[4]).toContain(HUB_SNAPSHOT_PATH);
    expect(h.calls[5]).toContain(`${HUB_V2_SSE_PATH}?cursor=CUR_FRESH`);
    expect(h.cursor()).toBe('CUR_FRESH');
    expect(h.warns).toContain('hub poison frame; rebaselining via v2 state recovery');
    h.sync.stop();
  });

  it('parks SSE loudly when the poison is outside snapshot coverage', async () => {
    const streams = [makeStream(), makeStream(), makeStream()];
    const h = makeBreakerSync([
      { status: 200, stream: streams[0]! },
      { status: 200, stream: streams[1]! },
      { status: 200, stream: streams[2]! },
    ], { rejectType: 'presence' });

    h.sync.start();
    await drainMicrotasks();
    for (let cycle = 0; cycle < HUB_POISON_FRAME_MAX_REJECTIONS; cycle += 1) {
      streams[cycle]!.send(poisonPresenceFrame());
      await drainMicrotasks();
    }
    await drainMicrotasks();

    // Presence state is not snapshot-guaranteed: no recovery fetch, no fourth
    // reconnect — the loop parks for the poison backoff with a loud warning
    // and polling covers the surface meanwhile (status degraded).
    expect(h.calls).toHaveLength(HUB_POISON_FRAME_MAX_REJECTIONS);
    expect(h.calls.every((url) => url.includes(HUB_V2_SSE_PATH))).toBe(true);
    expect(h.warns).toContain('hub poison frame outside snapshot coverage; SSE standing down');
    expect(h.sleeps).toContain(HUB_POISON_BACKOFF_MS);
    expect(h.statuses.at(-1)).toBe('degraded');
    expect(h.cursor()).toBe('CUR_STALE'); // state never skipped silently
    h.sync.stop();
  });

  it('a transiently failing frame that later applies clears the candidate (no escalation)', async () => {
    const streams = [makeStream(), makeStream()];
    let failuresLeft = 1;
    const { fetchImpl, calls } = makeHarness([
      { status: 200, stream: streams[0]! },
      { status: 200, stream: streams[1]! },
    ]);
    const warns: string[] = [];
    let cursor: string | null = 'CUR_STALE';
    const sync = createHubSync({
      protocol: 'v2',
      baseUrl: 'https://hub.test',
      apiKey: 'k',
      fetchImpl,
      sleep: () => Promise.resolve(),
      accountIds: [ACCT],
      onEvent: () => {
        if (failuresLeft > 0) {
          failuresLeft -= 1;
          throw new Error('transient failure');
        }
      },
      onWarn: (message) => {
        warns.push(message);
      },
      onV2GapRecovered: () => Promise.resolve([ACCT]),
      onSnapshot: () => undefined,
      onStatusChange: () => undefined,
      getLastEventId: () => null,
      setLastEventId: () => undefined,
      getV2Cursor: () => cursor,
      setV2Cursor: (next) => {
        cursor = next;
      },
      clearV2Cursor: () => {
        cursor = null;
      },
    });

    sync.start();
    await drainMicrotasks();
    streams[0]!.send(poisonMessageFrame()); // rejects once (transient)
    await drainMicrotasks();
    streams[1]!.send(poisonMessageFrame()); // replayed frame now applies
    await drainMicrotasks();

    expect(cursor).toBe('CUR_POISON'); // checkpointed normally
    expect(warns.filter((message) => message.includes('poison'))).toEqual([]); // breaker never spoke
    expect(calls.every((url) => url.includes(HUB_V2_SSE_PATH))).toBe(true);
    sync.stop();
  });
});
