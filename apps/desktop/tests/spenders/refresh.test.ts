// Spenders scoped refresh queue (PLAN item 13). The tail fetch is a stub that
// mimics the ONE production-relevant side effect of fetchChatTail: writing the
// per-fan thread_fetch_log stamp. Persistence/TTL/budget behavior runs against
// the real in-memory SQLite layer.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataLayer, DbChangedEvent } from '@main/db/index';
import {
  createSpendersRefresh,
  REFRESH_FAILURE_PAUSE_THRESHOLD,
  SPENDERS_REFRESH_PURPOSE,
  type SpendersRefreshFrame,
  type SpendersRefreshService,
} from '@main/spenders/refresh';
import { createPollingSync } from '@main/sync/polling-sync';
import type { OfApiClient } from '@main/ofapi/client';
import type { OfApiChat, OfApiMessage } from '@main/ofapi/schemas';
import { memoryDataLayer, sampleMessage } from '../db/helpers';

const ACCT = 'acct_1';
const TTL_MS = 5 * 60_000;
const REAL_SYNC_NOW = new Date('2026-06-13T12:00:00.000Z').getTime();

interface Harness {
  service: SpendersRefreshService;
  frames: SpendersRefreshFrame[];
  fetched: Array<{ chatId: string; purpose: string }>;
  ensured: Array<{ chatId: string; username: string | null }>;
  sleeps: number[];
  setNow(ms: number): void;
  advance(ms: number): void;
}

let data: DataLayer;

function makeHarness(opts: {
  scopes?: Record<string, string[]>;
  mapped?: string[];
  budgetExhausted?: () => boolean;
  failFor?: Set<string>;
  /** Fans whose tail GET succeeds but returns NO messages (genuinely empty). */
  emptyFor?: Set<string>;
  /** Provider returned without a tail GET/source stamp. */
  noProofFor?: Set<string>;
  autoRead?: () => boolean;
  onFetch?: (chatId: string) => void;
  onSleep?: (ms: number) => void;
} = {}): Harness {
  let nowMs = new Date('2026-06-13T12:00:00.000Z').getTime();
  const frames: SpendersRefreshFrame[] = [];
  const fetched: Array<{ chatId: string; purpose: string }> = [];
  const ensured: Array<{ chatId: string; username: string | null }> = [];
  const sleeps: number[] = [];
  let msgSeq = 0;
  const tailFetch = async (accountId: string, chatId: string, purpose: string): Promise<void> => {
    opts.onFetch?.(chatId);
    if (opts.failFor?.has(chatId)) {
      // A failed GET throws before fetchChatTail's stamp — no rows, no stamp.
      throw new Error('boom');
    }
    if (opts.noProofFor?.has(chatId)) return;
    fetched.push({ chatId, purpose });
    // Mirror fixed-production fetchChatTail: a successful NON-EMPTY tail
    // upserts rows (→ db:changed) AND stamps; a successful EMPTY tail stamps
    // only (the genuinely-empty fan, e.g. tips-only).
    if (!opts.emptyFor?.has(chatId)) {
      msgSeq += 1;
      data.messages.upsertMany([
        sampleMessage({ accountId, chatId, messageId: `${chatId}-${msgSeq}` }),
      ]);
    }
    data.threadFetchLog.stamp(accountId, chatId, new Date(nowMs).toISOString());
  };
  const service = createSpendersRefresh({
    data,
    refreshChat: tailFetch,
    readChatTailForUserOpen: tailFetch,
    ensureChat: async (_accountId, chatId, hint) => {
      ensured.push({ chatId, username: hint?.username ?? null });
      return true;
    },
    scopeChatIds: async (_accountId, scope) => {
      const ids = opts.scopes?.[scope];
      if (ids === undefined) throw new Error(`unknown scope ${scope}`);
      return ids;
    },
    getMappedListIds: async () => opts.mapped ?? ['100', '200'],
    isBudgetExhausted: opts.budgetExhausted ?? ((): boolean => false),
    // Auto-read ON so the queue/hydrate paths still exercise the tail GET; the
    // default-OFF gate is covered by its own describe block below.
    getAutoRead: opts.autoRead ?? ((): boolean => true),
    now: () => nowMs,
    sleep: async (ms) => {
      sleeps.push(ms);
      opts.onSleep?.(ms);
    },
  });
  service.subscribe((frame) => frames.push(frame));
  return {
    service,
    frames,
    fetched,
    ensured,
    sleeps,
    setNow: (ms) => {
      nowMs = ms;
    },
    advance: (ms) => {
      nowMs += ms;
    },
  };
}

/** Background queue settles in microtasks (stub sleep never yields to timers). */
async function until(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 20_000; i += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error('condition never reached');
}

beforeEach(() => {
  data = memoryDataLayer();
});

function realSyncChat(chatId: string, username: string): OfApiChat {
  return {
    unreadMessagesCount: 0,
    hasUnreadTips: false,
    canSendMessage: true,
    lastReadMessageId: null,
    lastMessage: null,
    fan: {
      id: Number(chatId),
      name: username,
      username,
    },
  } as OfApiChat;
}

function realSyncMessage(id: number, text: string, fromMe = false): OfApiMessage {
  return {
    id,
    text,
    isSentByMe: fromMe,
    createdAt: '2026-06-13T11:59:00+00:00',
    isNew: false,
    isTip: false,
  } as OfApiMessage;
}

function makeRealPollingClient(opts: {
  chats?: OfApiChat[];
  messages?: OfApiMessage[];
} = {}): { client: OfApiClient; listMessages: ReturnType<typeof vi.fn>; listChats: ReturnType<typeof vi.fn> } {
  const listMessages = vi.fn(async () => ({
    messages:
      opts.messages ?? [
        realSyncMessage(7001, '<p>hey</p>'),
        realSyncMessage(7002, '<p>reply</p>', true),
      ],
    nextPageUrl: null,
  }));
  const listChats = vi.fn(async () => ({
    chats: opts.chats ?? [realSyncChat('7', 'merritt')],
    nextPageUrl: null,
  }));
  const client = {
    listMessages,
    listChats,
    getMessage: vi.fn(),
    getUserByUsername: vi.fn(),
  } as unknown as OfApiClient;
  return { client, listMessages, listChats };
}

describe('scoped refresh queue', () => {
  it('fetches every scope fan once with the distinct ledger purpose, then stamps the scope', async () => {
    const h = makeHarness({ scopes: { all: ['1', '2', '3'] } });
    await h.service.start(ACCT, 'all');
    await until(() => h.frames.some((f) => f.state === 'done'));

    expect(h.fetched.map((f) => f.chatId)).toEqual(['1', '2', '3']);
    expect(h.fetched.every((f) => f.purpose === SPENDERS_REFRESH_PURPOSE)).toBe(true);
    const done = h.frames.at(-1);
    expect(done).toMatchObject({
      state: 'done', done: 3, total: 3, scope: 'all',
      fetched: 3, ttlSkipped: 0, policySkipped: 0, failed: 0,
    });
    // progress frames count up while rows fill live
    const progress = h.frames.filter((f) => f.state === 'running').map((f) => f.done);
    expect(progress).toEqual([0, 1, 2, 3]);
  });

  it('a completed «Все» run stamps the all-scope AND every mapped chip', async () => {
    const h = makeHarness({ scopes: { all: ['1'] }, mapped: ['100', '200'] });
    await h.service.start(ACCT, 'all');
    await until(() => h.frames.some((f) => f.state === 'done'));

    const stamps = h.service.freshness(ACCT);
    expect(Object.keys(stamps).sort()).toEqual(['100', '200', 'all']);
    expect(stamps['all']).toBe('2026-06-13T12:00:00.000Z');
  });

  it('a fully covered All run supersedes the earlier skipped child attempt', async () => {
    let autoRead = false;
    const h = makeHarness({ scopes: { '100': ['1'], all: ['1', '2'] }, autoRead: () => autoRead });
    await h.service.start(ACCT, '100');
    await until(() => h.frames.some((frame) => frame.state === 'skipped'));
    expect(h.service.lastRuns(ACCT)['100']?.state).toBe('skipped');

    autoRead = true;
    await h.service.start(ACCT, 'all');
    await until(() => h.frames.some((frame) => frame.state === 'done'));
    expect(h.service.freshness(ACCT)['100']).toBe('2026-06-13T12:00:00.000Z');
    expect(h.service.lastRuns(ACCT)['100']).toBeUndefined();
    expect(h.service.lastRuns(ACCT)['all']?.state).toBe('done');
  });

  it('does not stamp a newly mapped shelf or All when mappings change during the run', async () => {
    const mapped = ['100'];
    const h = makeHarness({
      scopes: { all: ['1', '2'] }, mapped,
      onSleep: () => { mapped.push('200'); },
    });
    await h.service.start(ACCT, 'all');
    await until(() => h.frames.some((frame) => frame.state === 'partial'));
    expect(h.fetched.map((fetch) => fetch.chatId)).toEqual(['1', '2']);
    expect(h.service.freshness(ACCT)).toEqual({});
    expect(h.service.lastRuns(ACCT)['all']).toMatchObject({ state: 'partial', fetched: 2, scopeChanged: true });
  });

  it('a tier-scope completion stamps only that chip', async () => {
    const h = makeHarness({ scopes: { '100': ['1', '2'] } });
    await h.service.start(ACCT, '100');
    await until(() => h.frames.some((f) => f.state === 'done'));

    expect(Object.keys(h.service.freshness(ACCT))).toEqual(['100']);
  });

  it('skips fans fetched within the TTL — an explicit click refetches the scope modulo the TTL', async () => {
    const h = makeHarness({ scopes: { all: ['1', '2', '3'] } });
    const nowIso = new Date('2026-06-13T12:00:00.000Z');
    data.threadFetchLog.stamp(ACCT, '2', new Date(nowIso.getTime() - TTL_MS + 60_000).toISOString());
    data.threadFetchLog.stamp(ACCT, '3', new Date(nowIso.getTime() - TTL_MS - 1).toISOString());

    await h.service.start(ACCT, 'all');
    await until(() => h.frames.some((f) => f.state === 'done'));

    // '2' is fresh (skipped, still counted), '3' is past the TTL (fetched)
    expect(h.fetched.map((f) => f.chatId)).toEqual(['1', '3']);
    expect(h.frames.at(-1)).toMatchObject({ state: 'done', done: 3, total: 3, fetched: 2, ttlSkipped: 1 });
    expect(h.service.freshness(ACCT)['all']).toBe('2026-06-13T11:56:00.000Z');
  });

  it('reusing TTL-covered tails does not make the source age younger on a later click', async () => {
    const h = makeHarness({ scopes: { all: ['1', '2'] } });
    data.threadFetchLog.stamp(ACCT, '1', '2026-06-13T11:58:00.000Z');
    data.threadFetchLog.stamp(ACCT, '2', '2026-06-13T11:57:00.000Z');
    await h.service.start(ACCT, 'all');
    await until(() => h.frames.some((frame) => frame.state === 'done'));
    h.advance(60_000);
    await h.service.start(ACCT, 'all');
    await until(() => h.frames.filter((frame) => frame.state === 'done').length === 2);

    expect(h.fetched).toEqual([]);
    expect(h.service.freshness(ACCT)['all']).toBe('2026-06-13T11:57:00.000Z');
    expect(h.service.lastRuns(ACCT)['all']).toMatchObject({
      state: 'done', completedAt: '2026-06-13T12:01:00.000Z', fetched: 0, ttlSkipped: 2,
    });
  });

  it('distinguishes TTL coverage from policy skips and retains the older scope proof', async () => {
    const h = makeHarness({ scopes: { all: ['1', '2'] }, autoRead: () => false });
    data.threadFetchLog.stamp(ACCT, '1', '2026-06-13T11:58:00.000Z');
    data.settings.set(`spenders.historyVerifiedAt.v2.${ACCT}`, { all: '2026-06-12T12:00:00.000Z' });
    await h.service.start(ACCT, 'all');
    await until(() => h.frames.some((frame) => frame.state === 'partial'));

    expect(h.fetched).toEqual([]);
    expect(h.frames.at(-1)).toMatchObject({
      state: 'partial', done: 2, total: 2, fetched: 0, ttlSkipped: 1, policySkipped: 1, failed: 0,
    });
    expect(h.service.freshness(ACCT)['all']).toBe('2026-06-12T12:00:00.000Z');
    expect(makeHarness().service.lastRuns(ACCT)['all']).toMatchObject({ state: 'partial', policySkipped: 1 });
  });

  it('a resolved provider callback without a new source stamp cannot claim a fetched history', async () => {
    const h = makeHarness({ scopes: { all: ['1'] }, noProofFor: new Set(['1']) });
    await h.service.start(ACCT, 'all');
    await until(() => h.frames.some((frame) => frame.state === 'partial'));
    expect(h.frames.at(-1)).toMatchObject({ fetched: 0, failed: 1 });
    expect(h.service.freshness(ACCT)).toEqual({});
  });

  it('a policy change inside the provider call stays unread without a false success', async () => {
    let enabled = true;
    const h = makeHarness({
      scopes: { all: ['1'] }, noProofFor: new Set(['1']),
      autoRead: () => enabled, onFetch: () => { enabled = false; },
    });
    await h.service.start(ACCT, 'all');
    await until(() => h.frames.some((frame) => frame.state === 'skipped'));
    expect(h.frames.at(-1)).toMatchObject({ fetched: 0, policySkipped: 1, failed: 0 });
    expect(h.service.freshness(ACCT)).toEqual({});
  });

  it('an empty scope completes without inventing a history verification timestamp', async () => {
    const h = makeHarness({ scopes: { all: [] } });
    await h.service.start(ACCT, 'all');
    await until(() => h.frames.some((frame) => frame.state === 'done'));
    expect(h.frames.at(-1)).toMatchObject({ done: 0, total: 0, fetched: 0 });
    expect(h.service.freshness(ACCT)).toEqual({});
  });

  it('legacy completion stamps and queues are not evidence and do not resume reads', async () => {
    data.settings.set(`spenders.refreshedAt.${ACCT}`, { all: '2026-06-13T12:00:00.000Z' });
    data.settings.set(`spenders.refreshQueue.${ACCT}`, { scope: 'all', pending: ['2'], total: 2, done: 1 });
    const h = makeHarness({ scopes: { all: ['1', '2'] } });
    h.service.resume([ACCT]);

    expect(h.service.status(ACCT)).toBeNull();
    expect(h.frames).toEqual([]);
    expect(h.fetched).toEqual([]);
    expect(h.service.freshness(ACCT)).toEqual({});
    expect(h.service.lastRuns(ACCT)).toEqual({});
  });

  it('resuming a mid-run checkpoint retries earlier isolated failures before declaring coverage', async () => {
    data.settings.set(`spenders.refreshQueue.v2.${ACCT}`, {
      scope: 'all', pending: ['3'], total: 3, done: 2,
      fetched: 1, ttlSkipped: 0, policySkipped: 0, failedIds: ['1'],
      oldestVerifiedAt: '2026-06-13T11:59:00.000Z',
      mappedListIds: ['100', '200'],
    });
    const h = makeHarness({ scopes: { all: ['1', '2', '3'] }, failFor: new Set(['1']) });
    h.service.resume([ACCT]);
    await until(() => h.frames.some((frame) => frame.state === 'partial'));

    expect(h.fetched.map((fetch) => fetch.chatId)).toEqual(['3']);
    expect(h.frames.at(-1)).toMatchObject({ done: 3, total: 3, fetched: 2, failed: 1 });
    expect(h.service.freshness(ACCT)).toEqual({});
  });

  it('pauses FIRST when the budget guard trips and resumes when it frees', async () => {
    let exhausted = true;
    const h = makeHarness({
      scopes: { all: ['1', '2'] },
      budgetExhausted: () => exhausted,
      onSleep: () => {
        exhausted = false; // budget frees while the paused queue waits
      },
    });
    await h.service.start(ACCT, 'all');
    await until(() => h.frames.some((f) => f.state === 'done'));

    const states = h.frames.map((f) => f.state);
    expect(states[0]).toBe('running'); // launch frame
    expect(states).toContain('paused');
    expect(h.fetched).toHaveLength(2); // nothing spent while paused
    expect(states.indexOf('paused')).toBeLessThan(states.lastIndexOf('running'));
  });

  it('STOP ends the run without scope stamps and clears the persisted queue', async () => {
    let stopAfter = 1;
    const h = makeHarness({ scopes: { all: ['1', '2', '3'] } });
    h.service.subscribe((frame) => {
      if (frame.state === 'running' && frame.done === stopAfter) {
        stopAfter = -1;
        h.service.stop(ACCT);
      }
    });
    await h.service.start(ACCT, 'all');
    await until(() => h.frames.some((f) => f.state === 'stopped'));

    expect(h.fetched.length).toBeLessThan(3);
    expect(h.service.freshness(ACCT)).toEqual({});
    expect(h.service.status(ACCT)).toBeNull();
    expect(data.settings.get(`spenders.refreshQueue.v2.${ACCT}`)).toBeUndefined();
  });

  it('survives a restart: a new service over the same db resumes the remaining fans only', async () => {
    // First process: stop after 1 fan to leave a persisted remainder. Persist
    // granularity is 10, so simulate the crash artifact directly.
    data.settings.set(`spenders.refreshQueue.v2.${ACCT}`, {
      scope: 'all',
      pending: ['2', '3'],
      total: 3,
      done: 1,
      fetched: 1, ttlSkipped: 0, policySkipped: 0, failedIds: [],
      oldestVerifiedAt: '2026-06-13T11:59:00.000Z',
      mappedListIds: ['100', '200'],
    });
    const h = makeHarness({ scopes: { all: ['1', '2', '3'] } });
    h.service.resume([ACCT]);
    await until(() => h.frames.some((f) => f.state === 'done'));

    expect(h.fetched.map((f) => f.chatId)).toEqual(['2', '3']); // '1' not re-spent
    expect(h.frames.at(-1)).toMatchObject({ done: 3, total: 3, scope: 'all' });
    expect(h.service.freshness(ACCT)['all']).toBe('2026-06-13T11:59:00.000Z');
  });

  it('resume with an empty persisted queue just clears the artifact', async () => {
    data.settings.set(`spenders.refreshQueue.v2.${ACCT}`, {
      scope: 'all',
      pending: [],
      total: 3,
      done: 3,
      fetched: 3, ttlSkipped: 0, policySkipped: 0, failedIds: [],
      oldestVerifiedAt: '2026-06-13T11:59:00.000Z',
      mappedListIds: ['100', '200'],
    });
    const h = makeHarness({ scopes: { all: [] } });
    h.service.resume([ACCT]);
    expect(data.settings.get(`spenders.refreshQueue.v2.${ACCT}`)).toBeUndefined();
    expect(h.service.status(ACCT)).toBeNull();
  });

  it('an isolated fetch failure leaves a durable partial queue and cannot stamp the scope fresh', async () => {
    const failFor = new Set(['1']);
    const h = makeHarness({ scopes: { all: ['1', '2'] }, failFor });
    await h.service.start(ACCT, 'all');
    await until(() => h.frames.some((f) => f.state === 'partial'));

    expect(h.fetched.map((f) => f.chatId)).toEqual(['2']);
    expect(data.threadFetchLog.get(ACCT, '1')).toBeNull();
    expect(h.frames.at(-1)).toMatchObject({ state: 'partial', done: 2, total: 2, fetched: 1, failed: 1 });
    expect(h.service.freshness(ACCT)).toEqual({});
    expect(data.settings.get(`spenders.refreshQueue.v2.${ACCT}`)).toEqual({
      scope: 'all',
      pending: ['1'],
      total: 2,
      done: 1,
      fetched: 1, ttlSkipped: 0, policySkipped: 0, failedIds: [],
      oldestVerifiedAt: '2026-06-13T12:00:00.000Z',
      mappedListIds: ['100', '200'],
    });

    // A later explicit retry rebuilds the scope: fan 2 is TTL-skipped, the
    // preserved failure is fetched, and only that complete run earns freshness.
    failFor.clear();
    await h.service.start(ACCT, 'all');
    await until(() => h.frames.some((f) => f.state === 'done'));
    expect(h.fetched.map((f) => f.chatId)).toEqual(['2', '1']);
    expect(h.service.freshness(ACCT)['all']).toBeDefined();
    expect(data.settings.get(`spenders.refreshQueue.v2.${ACCT}`)).toBeUndefined();
  });

  it(`${REFRESH_FAILURE_PAUSE_THRESHOLD} consecutive failures pause (network down) and the same fan retries after`, async () => {
    const failFor = new Set(['1', '2', '3']);
    const h = makeHarness({
      scopes: { all: ['1', '2', '3', '4'] },
      failFor,
      onSleep: (ms) => {
        if (ms === 30_000) failFor.clear(); // network back while paused
      },
    });
    await h.service.start(ACCT, 'all');
    await until(() => h.frames.some((f) => f.state === 'done'));

    expect(h.frames.some((f) => f.state === 'paused')).toBe(true);
    // Once the burst is classified as network-wide, the first two provisional
    // failures are put back too; successful completion really covers all four.
    expect(h.fetched.map((f) => f.chatId)).toEqual(['1', '2', '3', '4']);
    expect(h.frames.at(-1)).toMatchObject({ done: 4, total: 4 });
  });

  it('start on the same scope while running is a no-op; another scope replaces the run', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetched: string[] = [];
    const frames: SpendersRefreshFrame[] = [];
    const service = createSpendersRefresh({
      data,
      refreshChat: async (accountId, chatId) => {
        fetched.push(chatId);
        await gate; // hold the first fetch so the queue stays running
        data.threadFetchLog.stamp(accountId, chatId, new Date().toISOString());
      },
      readChatTailForUserOpen: async () => undefined,
      ensureChat: async () => true,
      scopeChatIds: async (_a, scope) => (scope === 'all' ? ['1', '2'] : ['9']),
      getMappedListIds: async () => ['100'],
      isBudgetExhausted: () => false,
      getAutoRead: () => true,
      sleep: async () => undefined,
    });
    service.subscribe((frame) => frames.push(frame));

    await service.start(ACCT, 'all');
    await service.start(ACCT, 'all'); // same scope → no-op
    expect(service.status(ACCT)).toMatchObject({ scope: 'all', total: 2 });

    const replaced = service.start(ACCT, '100'); // different scope → replaces
    release();
    await replaced;
    await until(() => frames.some((f) => f.state === 'done' && f.scope === '100'));
    expect(frames.some((f) => f.state === 'stopped' && f.scope === 'all')).toBe(true);
    expect(fetched).toContain('9');
  });
});

describe('hydrateIfStale (quick-look on-open)', () => {
  it('ensures the chat row before hydrating and returns the resolved status', async () => {
    const h = makeHarness({ scopes: {} });
    const result = await h.service.hydrateIfStale(ACCT, '7', { username: 'merritt' });

    expect(result).toEqual({ hasChat: true, fetched: true, messageCount: 1, skippedByTtl: false });
    expect(h.ensured).toEqual([{ chatId: '7', username: 'merritt' }]);
    expect(h.fetched).toHaveLength(1);
  });

  it('a fan with history: the tail GET writes rows AND emits a messages db:changed', async () => {
    const h = makeHarness({ scopes: {} });
    const flushed: DbChangedEvent[] = [];
    data.bus.subscribe((events) => flushed.push(...events));

    const result = await h.service.hydrateIfStale(ACCT, '7');
    data.bus.flushNow();

    expect(result).toMatchObject({ fetched: true, messageCount: 1, skippedByTtl: false });
    expect(data.messages.count(ACCT, '7')).toBe(1);
    expect(flushed).toContainEqual({ scope: 'messages', accountId: ACCT, chatId: '7' });
  });

  it('fetches when never stamped; skips within the TTL once history exists; refetches past it', async () => {
    const h = makeHarness({ scopes: {} });
    const first = await h.service.hydrateIfStale(ACCT, '7');
    expect(first).toMatchObject({ fetched: true, messageCount: 1, skippedByTtl: false });
    expect(h.fetched).toHaveLength(1);
    expect(h.fetched[0]).toMatchObject({ chatId: '7', purpose: 'message-tail' });

    const second = await h.service.hydrateIfStale(ACCT, '7'); // fresh stamp + history → skip
    expect(second).toMatchObject({ fetched: false, skippedByTtl: true, messageCount: 1 });
    expect(h.fetched).toHaveLength(1);

    h.advance(TTL_MS + 1);
    await h.service.hydrateIfStale(ACCT, '7');
    expect(h.fetched).toHaveLength(2);
  });

  it('an empty first fetch does not wedge: a reopen probes once while count===0, then bounds to ≤1/TTL', async () => {
    const h = makeHarness({ scopes: {}, emptyFor: new Set(['7']) });

    // 1st open: never stamped → fetch; genuinely empty (stamps, writes no rows).
    const first = await h.service.hydrateIfStale(ACCT, '7');
    expect(first).toMatchObject({ fetched: true, messageCount: 0, skippedByTtl: false });
    expect(h.fetched).toHaveLength(1);
    expect(data.messages.count(ACCT, '7')).toBe(0);

    // 2nd open within the TTL: a fresh stamp over an EMPTY thread is a poisoned
    // stamp → exactly ONE more probe GET (no permanent noHistory wedge).
    const second = await h.service.hydrateIfStale(ACCT, '7');
    expect(second).toMatchObject({ fetched: true, messageCount: 0 });
    expect(h.fetched).toHaveLength(2);

    // 3rd open within the TTL: the probe confirmed empty → bounded (skip).
    const third = await h.service.hydrateIfStale(ACCT, '7');
    expect(third).toMatchObject({ fetched: false, skippedByTtl: true });
    expect(h.fetched).toHaveLength(2); // ≤1 extra GET per TTL window — no loop

    // Past the TTL: a fresh attempt is allowed again (one probe per window).
    h.advance(TTL_MS + 1);
    await h.service.hydrateIfStale(ACCT, '7');
    expect(h.fetched).toHaveLength(3);
  });

  it('a poisoned stamp over a fan that HAS history loads it on the next open (the bug)', async () => {
    // The refresh queue stamped the fan but no rows landed locally (empty/failed
    // write) — the exact production poison-pill. Pre-seed only the stamp.
    data.threadFetchLog.stamp(ACCT, '7', new Date('2026-06-13T12:00:00.000Z').toISOString());
    const h = makeHarness({ scopes: {} });
    expect(data.messages.count(ACCT, '7')).toBe(0);

    const result = await h.service.hydrateIfStale(ACCT, '7');

    expect(result).toMatchObject({ fetched: true, messageCount: 1, skippedByTtl: false });
    expect(h.fetched).toHaveLength(1); // the fresh-but-empty stamp did NOT wedge it
    expect(data.messages.count(ACCT, '7')).toBe(1);
  });

  it('a thrown tail GET leaves no stamp and the next open retries (no wedge)', async () => {
    const h = makeHarness({ scopes: {}, failFor: new Set(['7']) });

    const first = await h.service.hydrateIfStale(ACCT, '7');
    expect(first.fetched).toBe(false);
    expect(first.error).toBeDefined();
    expect(data.threadFetchLog.get(ACCT, '7')).toBeNull(); // fetchChatTail stamps only on success
    expect(data.messages.count(ACCT, '7')).toBe(0);

    // No stamp ⇒ NOT TTL-skipped: the next open re-attempts (errors again here)
    // instead of wedging on a stale error.
    const second = await h.service.hydrateIfStale(ACCT, '7');
    expect(second.error).toBeDefined();
  });

  it('single-flight: concurrent opens of one fan spend one credit', async () => {
    let calls = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const service = createSpendersRefresh({
      data,
      refreshChat: async (accountId, chatId) => {
        calls += 1;
        await gate;
        data.threadFetchLog.stamp(accountId, chatId, new Date().toISOString());
      },
      readChatTailForUserOpen: async (accountId, chatId) => {
        calls += 1;
        await gate;
        data.threadFetchLog.stamp(accountId, chatId, new Date().toISOString());
      },
      ensureChat: async () => true,
      scopeChatIds: async () => [],
      getMappedListIds: async () => [],
      isBudgetExhausted: () => false,
      getAutoRead: () => true,
      sleep: async () => undefined,
    });
    const first = service.hydrateIfStale(ACCT, '7');
    const second = service.hydrateIfStale(ACCT, '7');
    release();
    await Promise.all([first, second]);
    expect(calls).toBe(1);
  });

  it('a fan the REFRESH queue already loaded skips the hydrate (one shared stamp, ceiling preserved)', async () => {
    const h = makeHarness({ scopes: { '100': ['7'] } });
    await h.service.start(ACCT, '100');
    await until(() => h.frames.some((f) => f.state === 'done'));
    expect(h.fetched).toHaveLength(1);
    expect(data.messages.count(ACCT, '7')).toBe(1); // queue loaded history

    const result = await h.service.hydrateIfStale(ACCT, '7');
    expect(result).toMatchObject({ fetched: false, skippedByTtl: true });
    expect(h.fetched).toHaveLength(1); // no second spend
  });
});

// ── auto-read OFF (default) ─────────────────────────────────────────────────
// The per-fan tail GET marks each fan read on OnlyFans, so when autoReadChats
// is off the BACKGROUND scoped-refresh queue drains WITHOUT fetching. But
// hydrateIfStale (opening ONE chat's quick-look) is a deliberate read and still
// tail-fetches regardless of the setting.
describe('auto-read OFF (default)', () => {
  function makeOffHarness(scopes: Record<string, string[]>): Harness {
    let nowMs = new Date('2026-06-13T12:00:00.000Z').getTime();
    const frames: SpendersRefreshFrame[] = [];
    const fetched: Array<{ chatId: string; purpose: string }> = [];
    const ensured: Array<{ chatId: string; username: string | null }> = [];
    const sleeps: number[] = [];
    const service = createSpendersRefresh({
      data,
      refreshChat: async (accountId, chatId, purpose) => {
        fetched.push({ chatId, purpose });
        data.threadFetchLog.stamp(accountId, chatId, new Date(nowMs).toISOString());
      },
      readChatTailForUserOpen: async (accountId, chatId, purpose) => {
        fetched.push({ chatId, purpose });
        data.threadFetchLog.stamp(accountId, chatId, new Date(nowMs).toISOString());
      },
      ensureChat: async (_accountId, chatId, hint) => {
        ensured.push({ chatId, username: hint?.username ?? null });
        return true;
      },
      scopeChatIds: async (_accountId, scope) => {
        const ids = scopes[scope];
        if (ids === undefined) throw new Error(`unknown scope ${scope}`);
        return ids;
      },
      getMappedListIds: async () => ['100', '200'],
      isBudgetExhausted: () => false,
      getAutoRead: () => false,
      now: () => nowMs,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    service.subscribe((frame) => frames.push(frame));
    return {
      service,
      frames,
      fetched,
      ensured,
      sleeps,
      setNow: (ms) => {
        nowMs = ms;
      },
      advance: (ms) => {
        nowMs += ms;
      },
    };
  }

  it('records a policy skip without fetching or stamping the history fresh', async () => {
    const h = makeOffHarness({ all: ['1', '2', '3'] });
    await h.service.start(ACCT, 'all');
    await until(() => h.frames.some((f) => f.state === 'skipped'));

    expect(h.fetched).toHaveLength(0); // no fan read on OnlyFans
    expect(data.threadFetchLog.get(ACCT, '1')).toBeNull();
    expect(h.frames.at(-1)).toMatchObject({
      state: 'skipped', done: 3, total: 3, fetched: 0, ttlSkipped: 0, policySkipped: 3, failed: 0,
    });
    expect(h.service.freshness(ACCT)).toEqual({});
    expect(h.service.lastRuns(ACCT)['all']).toMatchObject({
      state: 'skipped', fetched: 0, policySkipped: 3, completedAt: '2026-06-13T12:00:00.000Z',
    });
  });

  it('hydrateIfStale STILL fetches when auto-read is OFF (a deliberate per-chat open)', async () => {
    const h = makeOffHarness({});
    const result = await h.service.hydrateIfStale(ACCT, '7', { username: 'merritt' });

    // Opening a quick-look is a deliberate read of THIS chat — it always
    // hydrates; auto-read=OFF only suppresses BACKGROUND read-marking.
    expect(result).toMatchObject({ hasChat: true, fetched: true, skippedByTtl: false });
    expect(h.ensured).toEqual([{ chatId: '7', username: 'merritt' }]);
    expect(h.fetched).toHaveLength(1); // the tail GET ran
    expect(data.threadFetchLog.get(ACCT, '7')).not.toBeNull();
  });

  it('hydrateIfStale uses REAL PollingSync to fetch/write/stamp with auto-read OFF', async () => {
    const { client, listMessages, listChats } = makeRealPollingClient();
    const sync = createPollingSync({
      client,
      data,
      toMediaUrl: (url) => `media://${url}`,
      autoReadEnabled: () => false,
      now: () => REAL_SYNC_NOW,
      sleep: async () => undefined,
    });
    const service = createSpendersRefresh({
      data,
      refreshChat: (accountId, chatId, purpose) => sync.refreshChat(accountId, chatId, purpose),
      readChatTailForUserOpen: (accountId, chatId, purpose) =>
        sync.readChatTailForUserOpen(accountId, chatId, purpose),
      ensureChat: (accountId, chatId, hint) => sync.ensureChat(accountId, chatId, hint),
      scopeChatIds: async () => [],
      getMappedListIds: async () => [],
      isBudgetExhausted: () => false,
      getAutoRead: () => false,
      now: () => REAL_SYNC_NOW,
      sleep: async () => undefined,
    });

    const result = await service.hydrateIfStale(ACCT, '7', { username: 'merritt' });

    expect(result).toEqual({ hasChat: true, fetched: true, messageCount: 2, skippedByTtl: false });
    expect(listChats).toHaveBeenCalledTimes(1);
    expect(listMessages).toHaveBeenCalledTimes(1);
    expect(listMessages).toHaveBeenCalledWith({
      accountId: ACCT,
      chatId: '7',
      order: 'desc',
      limit: 30,
      purpose: 'message-tail',
      priority: 'user',
      retry: 'none',
    });
    expect(data.messages.count(ACCT, '7')).toBeGreaterThan(0);
    expect(data.threadFetchLog.get(ACCT, '7')).toBe('2026-06-13T12:00:00.000Z');
  });

  it('scoped queue composed with REAL PollingSync performs ZERO message fetches with auto-read OFF', async () => {
    const { client, listMessages } = makeRealPollingClient({
      chats: [realSyncChat('7', 'merritt'), realSyncChat('8', 'avery')],
    });
    const sync = createPollingSync({
      client,
      data,
      toMediaUrl: (url) => `media://${url}`,
      autoReadEnabled: () => false,
      now: () => REAL_SYNC_NOW,
      sleep: async () => undefined,
    });
    const frames: SpendersRefreshFrame[] = [];
    const service = createSpendersRefresh({
      data,
      refreshChat: (accountId, chatId, purpose) => sync.refreshChat(accountId, chatId, purpose),
      readChatTailForUserOpen: (accountId, chatId, purpose) =>
        sync.readChatTailForUserOpen(accountId, chatId, purpose),
      ensureChat: (accountId, chatId, hint) => sync.ensureChat(accountId, chatId, hint),
      scopeChatIds: async () => ['7', '8'],
      getMappedListIds: async () => [],
      isBudgetExhausted: () => false,
      getAutoRead: () => false,
      now: () => REAL_SYNC_NOW,
      sleep: async () => undefined,
    });
    service.subscribe((frame) => frames.push(frame));

    await service.start(ACCT, 'all');
    await until(() => frames.some((frame) => frame.state === 'skipped'));

    expect(listMessages).not.toHaveBeenCalled();
    expect(data.threadFetchLog.get(ACCT, '7')).toBeNull();
    expect(data.threadFetchLog.get(ACCT, '8')).toBeNull();
    expect(frames.at(-1)).toMatchObject({ state: 'skipped', done: 2, total: 2, policySkipped: 2, fetched: 0 });
    expect(service.freshness(ACCT)).toEqual({});
  });
});
