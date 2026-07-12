// HubSync v2 (kernel Stage 24): the SSE consumer against core's domain-event
// stream — opaque per-account cursor resume, handle-then-checkpoint on the
// mapped frames, forward-compat checkpointing of unmapped types, the
// ephemeral (typing) lane that never checkpoints, and authenticated v2
// rebaseline through a fresh cursor plus paginated durable state snapshots.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncSnapshotResponse } from '@chatgoose/shared/protocol/index';
import {
  createHubSync,
  HUB_SNAPSHOT_PATH,
  HUB_V2_SNAPSHOT_PATH,
  HUB_V2_SSE_PATH,
  type HubSseFetch,
  type HubSyncStatus,
} from '../../src/main/sync/hub-sync';

const ACCT = 'acct_hub_v2_test';
const NEW_ACCT = 'acct_hub_v2_new';

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

function domainFrame(cursor: string, frame: Record<string, unknown>): string {
  return `id: ${cursor}\nevent: domain\ndata: ${JSON.stringify(frame)}\n\n`;
}

function messageFrame(cursor: string, overrides: Record<string, unknown> = {}): string {
  return domainFrame(cursor, {
    accountId: 7,
    accountSeq: 1,
    type: 'message.received',
    occurredAt: '2026-07-06T10:00:00.000Z',
    data: { text: 'hi', price: 0 },
    fanRef: '777',
    conversationRef: '777',
    messageRef: '9001',
    accountRef: ACCT,
    ...overrides,
  });
}

function stateSnapshot(
  nextPageCursor: number | null,
  options: {
    snapshotCursor?: number;
    accountId?: string;
    chatId?: string;
    messages?: SyncSnapshotResponse['threads'][number]['messages'];
    unresolvedTombstones?: SyncSnapshotResponse['unresolvedTombstones'];
  } = {},
): SyncSnapshotResponse {
  const accountId = options.accountId ?? ACCT;
  const chatId = options.chatId ?? '777';
  return {
    version: 1,
    requestedAfterSeq: 0,
    snapshotCursor: options.snapshotCursor ?? 22,
    stateAt: '2026-07-12T18:00:00.000Z',
    resumeAllowed: true,
    page: {
      pageId: 7,
      label: 'lora-of',
      accountId,
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
    threads: [{
      chatId,
      fanName: `Fan ${chatId}`,
      unreadCount: 0,
      hasUnreadTips: false,
      lastMessageId: options.messages?.at(-1)?.messageId ?? null,
      lastMessageAt: options.messages?.at(-1)?.message?.createdAt ?? null,
      lastMessageIsSentByMe: options.messages?.at(-1)?.message?.isSentByMe ?? false,
      lastMessagePreview: options.messages?.at(-1)?.message?.text ?? '',
      visible: true,
      sourceUpdatedAt: '2026-07-12T18:00:00.000Z',
      messages: options.messages ?? [],
    }],
    unresolvedTombstones: options.unresolvedTombstones ?? [],
    nextPageCursor,
  };
}

async function drainMicrotasks(): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    await Promise.resolve();
  }
}

describe('createHubSync (protocol v2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  interface V2Harness {
    sync: ReturnType<typeof createHubSync>;
    calls: FetchCall[];
    statuses: HubSyncStatus[];
    /** Interleaved onEvent + cursor-persist log (order matters). */
    log: string[];
    cursor: () => string | null;
    gapRecoveries: () => number;
  }

  function makeV2Sync(
    responses: Array<{ status: number; stream: FakeStream | null; json?: unknown }>,
    options: {
      initialCursor?: string | null;
      failEvents?: boolean;
      clientVersion?: string;
      /** Fail the first N durable state page applications. */
      failSnapshotPages?: number;
      /** Fail the first N authenticated grant refreshes. */
      failGapRecoveries?: number;
      /** Account ids returned by the authenticated read-gateway refresh. */
      refreshedAccountIds?: readonly string[];
    } = {},
  ): V2Harness {
    const { fetchImpl, calls } = makeHarness(responses);
    const statuses: HubSyncStatus[] = [];
    const log: string[] = [];
    let cursor: string | null = options.initialCursor ?? null;
    let gapRecoveries = 0;
    let snapshotPages = 0;
    const sync = createHubSync({
      protocol: 'v2',
      baseUrl: 'https://hub.test/',
      apiKey: 'agency_hub_core_k1',
      fetchImpl,
      ...(options.clientVersion !== undefined ? { clientVersion: options.clientVersion } : {}),
      sleep: () => Promise.resolve(),
      accountIds: [ACCT],
      onEvent: (event) => {
        if (options.failEvents === true) {
          throw new Error('handler crashed');
        }
        log.push(`event:${event.type}`);
      },
      onSnapshot: (snapshot) => {
        snapshotPages += 1;
        if (snapshotPages <= (options.failSnapshotPages ?? 0)) {
          log.push('snapshot-failed');
          throw new Error('state snapshot apply failed');
        }
        log.push(`snapshot:${snapshot.threads[0]?.chatId ?? 'empty'}:${snapshot.nextPageCursor ?? 'done'}`);
      },
      onV2GapRecovered: () => {
        gapRecoveries += 1;
        if (gapRecoveries <= (options.failGapRecoveries ?? 0)) {
          log.push('gap-failed');
          throw new Error('reconcile failed');
        }
        log.push('gap-recovered');
        return options.refreshedAccountIds ?? [ACCT];
      },
      onStatusChange: (status) => statuses.push(status),
      getLastEventId: () => null,
      setLastEventId: () => undefined,
      getV2Cursor: () => cursor,
      setV2Cursor: (next) => {
        cursor = next;
        log.push(`persist:${next}`);
      },
      clearV2Cursor: () => {
        cursor = null;
        log.push('clear');
      },
    });
    return { sync, calls, statuses, log, cursor: () => cursor, gapRecoveries: () => gapRecoveries };
  }

  it('connects to the v2 path, resumes with the opaque cursor, and handle-then-checkpoints mapped frames', async () => {
    const stream = makeStream();
    const h = makeV2Sync([{ status: 200, stream }], { initialCursor: 'CUR_START', clientVersion: '0.1.29' });
    h.sync.start();
    await drainMicrotasks();

    expect(h.calls[0]!.url).toBe(`https://hub.test${HUB_V2_SSE_PATH}?cursor=CUR_START`);
    expect(h.calls[0]!.headers.authorization).toBe('Bearer agency_hub_core_k1');
    // Stage 4 / Proposal 4.1: fleet-adoption gate reads this off every hub request.
    expect(h.calls[0]!.headers['x-client-version']).toBe('0.1.29');

    stream.send(messageFrame('CUR_1'));
    await drainMicrotasks();

    // The event is HANDLED before the cursor persists — crash mid-handle
    // replays, never skips.
    expect(h.log).toEqual(['event:messageReceived', 'persist:CUR_1']);
    expect(h.cursor()).toBe('CUR_1');
    h.sync.stop();
  });

  it('surfaces the enriched normalized message payload on the mapped event', async () => {
    const stream = makeStream();
    const events: Array<{ type: string; message?: unknown }> = [];
    const { fetchImpl } = makeHarness([{ status: 200, stream }]);
    const sync = createHubSync({
      protocol: 'v2',
      baseUrl: 'https://hub.test',
      apiKey: 'k',
      fetchImpl,
      sleep: () => Promise.resolve(),
      accountIds: [ACCT],
      onEvent: (event) => {
        events.push(event as typeof events[number]);
      },
      onStatusChange: () => undefined,
      getLastEventId: () => null,
      setLastEventId: () => undefined,
      getV2Cursor: () => null,
      setV2Cursor: () => undefined,
    });
    sync.start();
    await drainMicrotasks();

    stream.send(messageFrame('C1', {
      payload: {
        id: '9001',
        text: 'hi',
        createdAt: '2026-07-06T10:00:00.000Z',
        isSentByMe: false,
        price: 0,
      },
    }));
    await drainMicrotasks();

    expect(events).toHaveLength(1);
    expect(events[0]!.message).toMatchObject({ id: '9001', text: 'hi', isSentByMe: false });
    sync.stop();
  });

  it('does not advance the cursor when the handler crashes (replay, never skip)', async () => {
    const stream = makeStream();
    const h = makeV2Sync([{ status: 200, stream }], { failEvents: true });
    h.sync.start();
    await drainMicrotasks();

    stream.send(messageFrame('CUR_CRASH'));
    await drainMicrotasks();

    expect(h.cursor()).toBeNull();
    h.sync.stop();
  });

  it('checkpoints past unknown types and foreign accounts without emitting (forward-compat)', async () => {
    const stream = makeStream();
    const h = makeV2Sync([{ status: 200, stream }]);
    h.sync.start();
    await drainMicrotasks();

    stream.send(domainFrame('CUR_A', {
      accountId: 7,
      accountSeq: 2,
      type: 'workboard.state_changed',
      occurredAt: '2026-07-06T10:00:00.000Z',
      data: {},
      accountRef: ACCT,
    }));
    stream.send(messageFrame('CUR_B', { accountRef: 'acct_someone_else' }));
    await drainMicrotasks();

    // No events emitted, but the cursor advanced past both frames.
    expect(h.log).toEqual(['persist:CUR_A', 'persist:CUR_B']);
    h.sync.stop();
  });

  it('applies ephemeral typing frames without ever checkpointing them', async () => {
    const stream = makeStream();
    const h = makeV2Sync([{ status: 200, stream }]);
    h.sync.start();
    await drainMicrotasks();

    stream.send(`event: ephemeral\ndata: ${JSON.stringify({ type: 'typing', accountId: ACCT, chatId: '777' })}\n\n`);
    await drainMicrotasks();

    expect(h.log).toEqual(['event:typing']);
    expect(h.cursor()).toBeNull();

    // Foreign-account typing is dropped by the allowlist.
    stream.send(`event: ephemeral\ndata: ${JSON.stringify({ type: 'typing', accountId: 'acct_other', chatId: '1' })}\n\n`);
    await drainMicrotasks();
    expect(h.log).toEqual(['event:typing']);
    expect(h.sync.droppedFrameCount()).toBe(1);
    h.sync.stop();
  });

  it('recovers from a v2 409 only after every durable state page applies', async () => {
    const stream = makeStream();
    const h = makeV2Sync([
      {
        status: 409,
        stream: null,
        json: {
          error: 'sync_snapshot_required',
          message: 'cursor gap',
          statusCode: 409,
          version: 2,
          accounts: [{ accountId: 7, requestedSeq: 900, oldestAvailableSeq: 1, currentSeq: 12 }],
          snapshotPath: HUB_V2_SNAPSHOT_PATH,
        },
      },
      { status: 200, stream: null, json: { cursor: 'CUR_FRESH', accounts: [{ accountId: 7, currentSeq: 12 }] } },
      { status: 200, stream: null, json: stateSnapshot(5, { chatId: 'page-1' }) },
      { status: 200, stream: null, json: stateSnapshot(null, { chatId: 'page-2' }) },
      { status: 200, stream },
    ], { initialCursor: 'CUR_STALE', clientVersion: '0.1.29' });
    h.sync.start();
    await drainMicrotasks();

    expect(h.calls[0]!.url).toContain('cursor=CUR_STALE');
    expect(h.calls[1]!.url).toBe(`https://hub.test${HUB_V2_SNAPSHOT_PATH}`);
    expect(h.calls[2]!.url).toBe(
      `https://hub.test${HUB_SNAPSHOT_PATH}?accountId=${ACCT}&afterSeq=0&pageCursor=0&limit=50`,
    );
    expect(h.calls[3]!.url).toBe(
      `https://hub.test${HUB_SNAPSHOT_PATH}?accountId=${ACCT}&afterSeq=0&pageCursor=5&limit=50&snapshotCursor=22`,
    );
    expect(h.calls[4]!.url).toContain('cursor=CUR_FRESH');
    // v2 snapshot handshake carries the header too, not just the SSE connect.
    expect(h.calls[1]!.headers['x-client-version']).toBe('0.1.29');
    expect(h.log).toEqual([
      'gap-recovered',
      'snapshot:page-1:5',
      'snapshot:page-2:done',
      'persist:CUR_FRESH',
    ]);
    expect(h.gapRecoveries()).toBe(1);
    h.sync.stop();
  });

  it('does not persist the fresh cursor when a durable state page fails; recovery retries', async () => {
    const stream = makeStream();
    const snapshotRequired = {
      error: 'sync_snapshot_required',
      message: 'cursor gap',
      statusCode: 409,
      version: 2,
      accounts: [{ accountId: 7, requestedSeq: 900, oldestAvailableSeq: 1, currentSeq: 12 }],
      snapshotPath: HUB_V2_SNAPSHOT_PATH,
    };
    const h = makeV2Sync([
      { status: 409, stream: null, json: snapshotRequired },
      { status: 200, stream: null, json: { cursor: 'CUR_FRESH', accounts: [{ accountId: 7, currentSeq: 12 }] } },
      { status: 200, stream: null, json: stateSnapshot(null, { chatId: 'first-attempt' }) },
      { status: 409, stream: null, json: snapshotRequired },
      { status: 200, stream: null, json: { cursor: 'CUR_FRESH2', accounts: [{ accountId: 7, currentSeq: 12 }] } },
      { status: 200, stream: null, json: stateSnapshot(null, { chatId: 'second-attempt' }) },
      { status: 200, stream },
    ], { initialCursor: 'CUR_STALE', failSnapshotPages: 1 });
    h.sync.start();
    await drainMicrotasks();

    // First recovery reconcile failed → the fresh cursor was NOT persisted;
    // the reconnect still carries the STALE cursor, 409s again, and the
    // second recovery succeeds end-to-end.
    expect(h.calls[3]!.url).toContain('cursor=CUR_STALE');
    expect(h.log).toEqual([
      'gap-recovered',
      'snapshot-failed',
      'gap-recovered',
      'snapshot:second-attempt:done',
      'persist:CUR_FRESH2',
    ]);
    expect(h.cursor()).toBe('CUR_FRESH2');
    expect(h.calls[6]!.url).toContain('cursor=CUR_FRESH2');
    h.sync.stop();
  });

  it('403-with-cursor authenticates, applies state, then persists without a cursor-less connect', async () => {
    const stream = makeStream();
    const h = makeV2Sync([
      { status: 403, stream: null },
      { status: 200, stream: null, json: { cursor: 'CUR_RESCOPED', accounts: [{ accountId: 7, currentSeq: 12 }] } },
      { status: 200, stream: null, json: stateSnapshot(9, { chatId: 'rescoped-1' }) },
      { status: 200, stream: null, json: stateSnapshot(null, { chatId: 'rescoped-2' }) },
      { status: 200, stream },
    ], { initialCursor: 'CUR_OUT_OF_GRANT' });
    h.sync.start();
    await drainMicrotasks();

    expect(h.calls[0]!.url).toContain('cursor=CUR_OUT_OF_GRANT');
    expect(h.calls[1]!.url).toBe(`https://hub.test${HUB_V2_SNAPSHOT_PATH}`);
    expect(h.calls[2]!.url).toContain(`${HUB_SNAPSHOT_PATH}?accountId=${ACCT}&afterSeq=0&pageCursor=0`);
    expect(h.calls[3]!.url).toContain('pageCursor=9');
    expect(h.calls[4]!.url).toContain('cursor=CUR_RESCOPED');
    expect(h.calls.some((call) => call.url === `https://hub.test${HUB_V2_SSE_PATH}`)).toBe(false);
    expect(h.log).toEqual([
      'gap-recovered',
      'snapshot:rescoped-1:9',
      'snapshot:rescoped-2:done',
      'persist:CUR_RESCOPED',
    ]);

    stream.send(': keep-alive\n\n');
    await drainMicrotasks();
    expect(h.sync.status()).toBe('live');
    expect(h.statuses).not.toContain('auth-failed');
    h.sync.stop();
  });

  it('refreshes a replaced grant set before snapshotting and accepts the newly granted account', async () => {
    const stream = makeStream();
    const h = makeV2Sync([
      { status: 403, stream: null },
      {
        status: 200,
        stream: null,
        json: { cursor: 'CUR_REPLACED', accounts: [{ accountId: 8, currentSeq: 2 }] },
      },
      {
        status: 200,
        stream: null,
        json: stateSnapshot(null, { accountId: NEW_ACCT, chatId: 'new-grant' }),
      },
      { status: 200, stream },
    ], {
      initialCursor: 'CUR_OLD_GRANT',
      refreshedAccountIds: [NEW_ACCT],
    });

    h.sync.start();
    await drainMicrotasks();

    expect(h.calls.map((call) => call.url)).toEqual([
      `https://hub.test${HUB_V2_SSE_PATH}?cursor=CUR_OLD_GRANT`,
      `https://hub.test${HUB_V2_SNAPSHOT_PATH}`,
      `https://hub.test${HUB_SNAPSHOT_PATH}?accountId=${NEW_ACCT}&afterSeq=0&pageCursor=0&limit=50`,
      `https://hub.test${HUB_V2_SSE_PATH}?cursor=CUR_REPLACED`,
    ]);
    expect(h.calls.some((call) => call.url.includes(`accountId=${ACCT}`))).toBe(false);
    expect(h.log).toEqual([
      'gap-recovered',
      'snapshot:new-grant:done',
      'persist:CUR_REPLACED',
    ]);

    stream.send(messageFrame('CUR_NEW_EVENT', { accountRef: NEW_ACCT }));
    await drainMicrotasks();
    expect(h.log).toEqual([
      'gap-recovered',
      'snapshot:new-grant:done',
      'persist:CUR_REPLACED',
      'event:messageReceived',
      'persist:CUR_NEW_EVENT',
    ]);
    h.sync.stop();
  });

  it('persists an authenticated shrink-to-zero cursor without state requests or revoked events', async () => {
    const stream = makeStream();
    const h = makeV2Sync([
      { status: 403, stream: null },
      { status: 200, stream: null, json: { cursor: 'CUR_EMPTY', accounts: [] } },
      { status: 200, stream },
    ], {
      initialCursor: 'CUR_REVOKED',
      refreshedAccountIds: [],
    });

    h.sync.start();
    await drainMicrotasks();

    expect(h.calls.map((call) => call.url)).toEqual([
      `https://hub.test${HUB_V2_SSE_PATH}?cursor=CUR_REVOKED`,
      `https://hub.test${HUB_V2_SNAPSHOT_PATH}`,
      `https://hub.test${HUB_V2_SSE_PATH}?cursor=CUR_EMPTY`,
    ]);
    expect(h.log).toEqual(['gap-recovered', 'persist:CUR_EMPTY']);

    stream.send(messageFrame('CUR_REVOKED_EVENT'));
    await drainMicrotasks();
    expect(h.log).toEqual([
      'gap-recovered',
      'persist:CUR_EMPTY',
      'persist:CUR_REVOKED_EVENT',
    ]);
    h.sync.stop();
  });

  it('refuses the fresh cursor when any refreshed account lacks a state snapshot', async () => {
    const stream = makeStream();
    const h = makeV2Sync([
      {
        status: 409,
        stream: null,
        json: {
          error: 'sync_snapshot_required',
          message: 'cursor gap',
          statusCode: 409,
          version: 2,
          accounts: [{ accountId: 7, requestedSeq: 5, oldestAvailableSeq: 9, currentSeq: 12 }],
          snapshotPath: HUB_V2_SNAPSHOT_PATH,
        },
      },
      {
        status: 200,
        stream: null,
        json: { cursor: 'CUR_PARTIAL', accounts: [{ accountId: 7, currentSeq: 12 }] },
      },
      { status: 200, stream: null, json: stateSnapshot(null, { chatId: 'covered' }) },
      { status: 404, stream: null },
      { status: 200, stream },
    ], {
      initialCursor: 'CUR_STALE',
      refreshedAccountIds: [ACCT, NEW_ACCT],
    });

    h.sync.start();
    await drainMicrotasks();

    expect(h.calls[2]!.url).toContain(`accountId=${ACCT}`);
    expect(h.calls[3]!.url).toContain(`accountId=${NEW_ACCT}`);
    expect(h.calls[4]!.url).toBe(`https://hub.test${HUB_V2_SSE_PATH}?cursor=CUR_STALE`);
    expect(h.cursor()).toBe('CUR_STALE');
    expect(h.log).toEqual(['gap-recovered', 'snapshot:covered:done']);
    h.sync.stop();
  });

  it('treats a cursor-less 401/403 as a real credential failure (D1-N1)', async () => {
    const h = makeV2Sync([{ status: 401, stream: null }], { initialCursor: null });
    h.sync.start();
    await drainMicrotasks();

    expect(h.calls).toHaveLength(1);
    expect(h.sync.status()).toBe('auth-failed');
    expect(h.log).not.toContain('clear');
  });

  it('treats auth failure from the fresh-cursor handshake as terminal without clearing the cursor', async () => {
    const h = makeV2Sync([
      { status: 403, stream: null },
      { status: 403, stream: null },
    ], { initialCursor: 'CUR_DEAD' });
    h.sync.start();
    await drainMicrotasks();

    expect(h.calls).toHaveLength(2);
    expect(h.calls[1]!.url).toBe(`https://hub.test${HUB_V2_SNAPSHOT_PATH}`);
    expect(h.log).toEqual([]);
    expect(h.cursor()).toBe('CUR_DEAD');
    expect(h.sync.status()).toBe('auth-failed');
  });

  it.each([401, 403])(
    'treats durable state-snapshot auth failure (%s) as terminal without persisting',
    async (status) => {
      const h = makeV2Sync([
        {
          status: 409,
          stream: null,
          json: {
            error: 'sync_snapshot_required',
            message: 'cursor gap',
            statusCode: 409,
            version: 2,
            accounts: [{ accountId: 7, requestedSeq: 5, oldestAvailableSeq: 9, currentSeq: 12 }],
            snapshotPath: HUB_V2_SNAPSHOT_PATH,
          },
        },
        { status: 200, stream: null, json: { cursor: 'CUR_NOT_SAFE_YET', accounts: [{ accountId: 7, currentSeq: 12 }] } },
        { status, stream: null },
      ], { initialCursor: 'CUR_STALE' });

      h.sync.start();
      await drainMicrotasks();

      expect(h.calls).toHaveLength(3);
      expect(h.calls[2]!.url).toContain(HUB_SNAPSHOT_PATH);
      expect(h.cursor()).toBe('CUR_STALE');
      expect(h.log).toEqual(['gap-recovered']);
      expect(h.sync.status()).toBe('auth-failed');
    },
  );

  it('requires the v2 cursor seams at construction', () => {
    expect(() => createHubSync({
      protocol: 'v2',
      baseUrl: 'https://hub.test',
      apiKey: 'k',
      onEvent: () => undefined,
      getLastEventId: () => null,
      setLastEventId: () => undefined,
    })).toThrow(/getV2Cursor/);
  });
});
