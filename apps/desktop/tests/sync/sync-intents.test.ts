// D38 sync intents: the durable follow-up reads a hub frame obliges.
// Semantics under test (plan 2026-09-26, «D1»):
//  - account level «list not older than T»: closed by any successful page-1
//    read started at or after T + 2 s; at most one intent-driven read per
//    account per 30 s;
//  - chat level (thin frames): with auto-read the exact row M must exist; in
//    list-only mode a head at or past M is enough; closed when M arrives from
//    any source or is deleted; exponential backoff; closed with a warning after
//    three failed reads;
//  - open intents survive a restart.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataLayer, type DataLayer, type MessageUpsert } from '../../src/main/db/index';
import {
  createSyncIntentWorker,
  INTENT_ACCOUNT_READ_MIN_GAP_MS,
  INTENT_BACKOFF_BASE_MS,
  INTENT_LIST_LAG_MS,
  type SyncIntentWorker,
} from '../../src/main/sync/intents';
import type { ListReadOutcome } from '../../src/main/sync/polling-sync';

const TEST_DRIVER = 'bsqlite3-mc-node';
const ACCT = 'acct_intents';
const T0 = Date.parse('2026-09-26T16:00:00.000Z');

interface Harness {
  worker: SyncIntentWorker;
  accountReads: Array<{ accountId: string; authoritative: boolean; atMs: number }>;
  chatReads: Array<{ accountId: string; chatId: string; atMs: number }>;
  logs: Array<{ level: string; message: string; fields?: Record<string, unknown> | undefined }>;
  cleared: Array<{ accountId: string; messageIds: readonly string[] }>;
  setNow(ms: number): void;
  now(): number;
  setAccountOutcome(outcome: ListReadOutcome): void;
  setChatOutcome(outcome: ListReadOutcome): void;
  setAutoRead(enabled: boolean): void;
  setReady(ready: boolean): void;
  setHeadReached(fn: (accountId: string, chatId: string, messageId: string) => boolean): void;
  /** Called by the fake account read on success, as PollingSync does. */
  onAccountRead: ((accountId: string, startedAtMs: number) => void) | null;
}

function seedMessage(data: DataLayer, chatId: string, messageId: string, deleted = false): void {
  const row: MessageUpsert = {
    accountId: ACCT,
    chatId,
    messageId,
    createdAt: '2026-09-26T15:59:00.000Z',
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
    deleted,
    raw: {},
  };
  data.messages.upsertMany([row]);
}

describe('sync intent worker (D38)', () => {
  let data: DataLayer;

  beforeEach(() => {
    vi.useFakeTimers();
    data = createDataLayer({ driverPath: TEST_DRIVER, filePath: ':memory:', encryptionKey: null });
  });
  afterEach(() => {
    vi.useRealTimers();
    data.close();
  });

  function makeWorker(): Harness {
    let nowMs = T0;
    let accountOutcome: ListReadOutcome = 'ok';
    let chatOutcome: ListReadOutcome = 'ok';
    let autoRead = false;
    let ready = true;
    let headReached: (accountId: string, chatId: string, messageId: string) => boolean = () => false;
    const harness: Harness = {
      worker: null as unknown as SyncIntentWorker,
      accountReads: [],
      chatReads: [],
      logs: [],
      cleared: [],
      setNow: (ms) => {
        nowMs = ms;
      },
      now: () => nowMs,
      setAccountOutcome: (outcome) => {
        accountOutcome = outcome;
      },
      setChatOutcome: (outcome) => {
        chatOutcome = outcome;
      },
      setAutoRead: (enabled) => {
        autoRead = enabled;
      },
      setReady: (value) => {
        ready = value;
      },
      setHeadReached: (fn) => {
        headReached = fn;
      },
      onAccountRead: null,
    };
    harness.worker = createSyncIntentWorker({
      data,
      now: () => nowMs,
      reads: {
        accountHead: (accountId, options) => {
          harness.accountReads.push({ accountId, authoritative: options.authoritative, atMs: nowMs });
          if (accountOutcome === 'ok') {
            harness.onAccountRead?.(accountId, nowMs);
          }
          return Promise.resolve(accountOutcome);
        },
        chatTail: (accountId, chatId) => {
          harness.chatReads.push({ accountId, chatId, atMs: nowMs });
          return Promise.resolve(chatOutcome);
        },
        autoReadEnabled: () => autoRead,
        listHeadReached: (accountId, chatId, messageId) => headReached(accountId, chatId, messageId),
      },
      accountReady: () => ready,
      clearTombstonedHeads: (accountId, messageIds) => {
        harness.cleared.push({ accountId, messageIds });
      },
      onLog: (level, message, fields) => harness.logs.push({ level, message, fields }),
    });
    harness.onAccountRead = (accountId, startedAtMs) =>
      harness.worker.noteListRead(accountId, startedAtMs);
    return harness;
  }

  /** Advance the fake clock (and its timers) and let the worker settle. */
  async function advance(h: Harness, ms: number): Promise<void> {
    h.setNow(h.now() + ms);
    await vi.advanceTimersByTimeAsync(ms);
    for (let i = 0; i < 20; i += 1) {
      await Promise.resolve();
    }
  }

  it('account intent: only a page-1 read started at or after T + 2 s closes it', async () => {
    const h = makeWorker();
    h.worker.start();
    h.worker.openAccountList(ACCT, T0, 'list-nudge');

    // A read that started too early (before T + 2 s) proves nothing.
    h.worker.noteListRead(ACCT, T0 + INTENT_LIST_LAG_MS - 1);
    expect(h.worker.openIntents()).toHaveLength(1);

    h.worker.noteListRead(ACCT, T0 + INTENT_LIST_LAG_MS);
    expect(h.worker.openIntents()).toEqual([]);
    expect(h.logs).toContainEqual(expect.objectContaining({
      message: 'sync intent closed',
      fields: expect.objectContaining({ kind: 'account_list', closeReason: 'satisfied' }),
    }));
    h.worker.stop();
  });

  it('account intent: the worker reads at T + 2 s, and at most once per 30 s per account', async () => {
    const h = makeWorker();
    h.worker.start();
    h.worker.openAccountList(ACCT, T0, 'list-nudge');
    h.worker.kick();
    await advance(h, 0);
    expect(h.accountReads).toEqual([]); // the list endpoint lags the webhook

    await advance(h, INTENT_LIST_LAG_MS);
    expect(h.accountReads).toEqual([{ accountId: ACCT, authoritative: false, atMs: T0 + INTENT_LIST_LAG_MS }]);
    expect(h.worker.openIntents()).toEqual([]);

    // A new frame 1 s later: its read waits for the 30 s limiter.
    h.worker.openAccountList(ACCT, h.now() + 1_000, 'list-nudge');
    h.worker.kick();
    await advance(h, 10_000);
    expect(h.accountReads).toHaveLength(1);
    await advance(h, INTENT_ACCOUNT_READ_MIN_GAP_MS - 10_000);
    expect(h.accountReads).toHaveLength(2);
    expect(h.accountReads[1]!.atMs - h.accountReads[0]!.atMs).toBe(INTENT_ACCOUNT_READ_MIN_GAP_MS);
    expect(h.worker.openIntents()).toEqual([]);
    h.worker.stop();
  });

  it('a later frame widens T; the earlier read does not close the widened obligation', () => {
    const h = makeWorker();
    h.worker.start();
    h.worker.openAccountList(ACCT, T0, 'list-nudge');
    h.worker.openAccountList(ACCT, T0 + 10_000, 'unknown-chat');
    expect(h.worker.openIntents()).toEqual([
      expect.objectContaining({ notBeforeMs: T0 + 10_000, reason: 'list-nudge' }),
    ]);
    h.worker.noteListRead(ACCT, T0 + 5_000);
    expect(h.worker.openIntents()).toHaveLength(1);
    h.worker.stop();
  });

  it('chat intent «head M+1, no body M»: auto-read needs the exact row, list-only accepts the head', async () => {
    const h = makeWorker();
    // The cached list head already moved past M (M+1).
    h.setHeadReached((_accountId, _chatId, messageId) => messageId === 'M');

    // Auto-read ON: the head is not enough — the body of M must exist.
    h.setAutoRead(true);
    h.worker.start();
    expect(h.worker.openChatMessage(ACCT, '101', 'M', T0, 'thin-frame')).toBe(true);
    h.worker.kick();
    await advance(h, 0);
    expect(h.chatReads).toEqual([{ accountId: ACCT, chatId: '101', atMs: T0 }]);
    expect(h.worker.openIntents()).toHaveLength(1); // the read brought M+1 only

    // The body of M arrives (any source) → closed at the next evaluation.
    seedMessage(data, '101', 'M');
    await advance(h, INTENT_BACKOFF_BASE_MS);
    expect(h.worker.openIntents()).toEqual([]);
    expect(h.chatReads).toHaveLength(1);

    // List-only: the same cached head M+1 proves M at once, no read at all.
    h.setAutoRead(false);
    expect(h.worker.openChatMessage(ACCT, '202', 'M', T0, 'thin-frame')).toBe(false);
    expect(h.worker.openIntents()).toEqual([]);
    h.worker.stop();
  });

  it('chat intent (list-only) is proven by a qualifying list read; a deleted M closes it', async () => {
    const h = makeWorker();
    let headAtM = false;
    h.setHeadReached(() => headAtM);
    h.worker.start();
    h.worker.openChatMessage(ACCT, '101', 'M', T0, 'thin-frame');
    h.worker.kick();
    await advance(h, 0);
    expect(h.accountReads).toEqual([]);
    // The list read itself brings the head to M (as PollingSync writes page 1
    // before reporting the read).
    h.onAccountRead = (accountId, startedAtMs) => {
      headAtM = true;
      h.worker.noteListRead(accountId, startedAtMs);
    };
    await advance(h, INTENT_LIST_LAG_MS);
    expect(h.accountReads).toHaveLength(1);
    expect(h.worker.openIntents()).toEqual([]);

    headAtM = false;
    h.worker.openChatMessage(ACCT, '303', 'gone', h.now(), 'thin-frame');
    seedMessage(data, '303', 'gone', true);
    h.worker.kick();
    await advance(h, 0);
    expect(h.worker.openIntents()).toEqual([]);
    expect(h.logs).toContainEqual(expect.objectContaining({
      message: 'sync intent closed',
      fields: expect.objectContaining({ messageId: 'gone', closeReason: 'message-deleted' }),
    }));
    h.worker.stop();
  });

  it('backs off 5 s, 10 s, then closes with a warning after three failed reads', async () => {
    const h = makeWorker();
    h.setAutoRead(true);
    h.setChatOutcome('failed');
    h.worker.start();
    h.worker.openChatMessage(ACCT, '101', 'M', T0, 'thin-frame');
    h.worker.kick();
    await advance(h, 0);
    expect(h.chatReads.map((read) => read.atMs - T0)).toEqual([0]);
    await advance(h, INTENT_BACKOFF_BASE_MS);
    expect(h.chatReads.map((read) => read.atMs - T0)).toEqual([0, 5_000]);
    await advance(h, 2 * INTENT_BACKOFF_BASE_MS);
    expect(h.chatReads.map((read) => read.atMs - T0)).toEqual([0, 5_000, 15_000]);
    expect(h.worker.openIntents()).toEqual([]);
    expect(h.logs).toContainEqual(expect.objectContaining({
      level: 'warn',
      message: 'sync intent gave up; the safety read covers it',
      fields: expect.objectContaining({ kind: 'chat_message', failedReads: 3 }),
    }));
    await advance(h, 60_000);
    expect(h.chatReads).toHaveLength(3);
    h.worker.stop();
  });

  it('a failing account read counts toward giving up', async () => {
    const h = makeWorker();
    h.setAccountOutcome('failed');
    h.worker.start();
    h.worker.openAccountList(ACCT, T0, 'list-nudge');
    h.worker.kick();
    for (let i = 0; i < 4; i += 1) {
      await advance(h, INTENT_ACCOUNT_READ_MIN_GAP_MS);
    }
    expect(h.accountReads).toHaveLength(3);
    expect(h.worker.openIntents()).toEqual([]);
    h.worker.stop();
  });

  it('delete_head asks for an authoritative read, then re-checks the cached head', async () => {
    const h = makeWorker();
    h.worker.start();
    h.worker.openDeleteHead(ACCT, 'dead', T0);
    h.worker.kick();
    await advance(h, INTENT_LIST_LAG_MS);
    expect(h.accountReads).toEqual([{ accountId: ACCT, authoritative: true, atMs: T0 + INTENT_LIST_LAG_MS }]);
    expect(h.cleared).toEqual([{ accountId: ACCT, messageIds: ['dead'] }]);
    expect(h.worker.openIntents()).toEqual([]);
    h.worker.stop();
  });

  it('waits while the account list verification is pending', async () => {
    const h = makeWorker();
    h.setReady(false);
    h.worker.start();
    h.worker.openAccountList(ACCT, T0, 'list-nudge');
    h.worker.kick();
    await advance(h, 60_000);
    expect(h.accountReads).toEqual([]);
    h.setReady(true);
    h.worker.kick();
    await advance(h, 0);
    expect(h.accountReads).toHaveLength(1);
    h.worker.stop();
  });

  it('a restart resumes an open intent from SQLite', async () => {
    const first = makeWorker();
    first.worker.start();
    first.worker.openAccountList(ACCT, T0, 'list-nudge');
    first.worker.stop(); // the app quits before the read ran
    expect(first.accountReads).toEqual([]);

    const second = makeWorker();
    second.setNow(T0 + 60_000);
    second.worker.start();
    await advance(second, 0);
    expect(second.logs).toContainEqual(expect.objectContaining({
      message: 'sync intents resumed',
      fields: { open: 1, byKind: { account_list: 1 } },
    }));
    expect(second.accountReads).toHaveLength(1);
    expect(second.worker.openIntents()).toEqual([]);
    second.worker.stop();
  });

  it('an account that is gone closes its intents', async () => {
    const h = makeWorker();
    h.setAccountOutcome('gone');
    h.worker.start();
    h.worker.openAccountList(ACCT, T0, 'list-nudge');
    h.worker.kick();
    await advance(h, INTENT_LIST_LAG_MS);
    expect(h.worker.openIntents()).toEqual([]);
    h.worker.stop();
  });
});
