// SPEC §7 outbox state machine — the full matrix. The load-bearing invariant
// (SPEC §15.5): one outbox row ⇒ at most one POST, ever; indeterminate
// outcomes are never auto-retried, recovery is verification or a NEW row.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataLayer } from '@main/db/index';
import {
  createSendEngine,
  INTER_PART_DELAY_MAX_MS,
  INTER_PART_DELAY_MIN_MS,
  normalizeForMatch,
  VERIFY_INTERVAL_MS,
} from '@main/send/engine';
import type { SendEngine, SendEngineOptions } from '@main/send/engine';
import { mapOfApiHttpError, mapOfApiNetworkError } from '@main/ofapi/errors';
import type { OfApiError } from '@main/ofapi/errors';
import type { SleepFn } from '@main/ofapi/rate-limiter';
import {
  ACCT,
  CHAT,
  drain,
  loadFixture,
  makeSentMessage,
  makeStubHubCommandClient,
  makeStubClient,
  makeTailMessage,
  memoryDataLayer,
  seedChat,
  seedMessage,
  toMediaUrl,
} from './helpers';
import type { StubSendClient } from './helpers';

const SEND_URL = `https://app.onlyfansapi.com/api/${ACCT}/chats/${CHAT}/messages`;

function restrictedWordsError(): OfApiError {
  // The live-captured wire truth: HTTP 400 wrapping the OnlyFans body.
  return mapOfApiHttpError({
    status: 400,
    url: SEND_URL,
    body: loadFixture('send-message-restricted-400.json'),
  });
}

function timeoutError(): OfApiError {
  const cause = new Error('The operation was aborted due to timeout');
  cause.name = 'TimeoutError';
  return mapOfApiNetworkError(cause, SEND_URL); // CG-NET-02 → indeterminate
}

interface Harness {
  engine: SendEngine;
  sleeps: number[];
}

describe('send engine (SPEC §7)', () => {
  let data: DataLayer;
  let stub: StubSendClient;
  let markAsReadOnOpen: boolean;
  let localSeq: number;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-11T12:00:00.000Z'));
    data = memoryDataLayer();
    stub = makeStubClient();
    markAsReadOnOpen = true;
    localSeq = 0;
    seedChat(data);
  });

  afterEach(() => {
    vi.useRealTimers();
    data.close();
  });

  function makeEngine(
    overrides: Partial<SendEngineOptions> & { stub?: StubSendClient } = {},
  ): Harness {
    const sleeps: number[] = [];
    const sleep: SleepFn =
      overrides.sleep ??
      ((ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      });
    const engine = createSendEngine({
      client: (overrides.stub ?? stub).client,
      hubCommandClient: overrides.hubCommandClient ?? makeStubHubCommandClient(overrides.stub ?? stub),
      data,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen }),
      sleep,
      random: overrides.random ?? ((): number => 0.5),
    });
    return { engine, sleeps };
  }

  function rowState(localId: string): string | undefined {
    return data.outbox.get(localId)?.state;
  }

  function insertLegacyDirectUnconfirmed({
    text,
    createdAt = new Date().toISOString(),
  }: {
    text: string;
    createdAt?: string;
  }): string {
    localSeq += 1;
    const localId = `legacy-direct-${localSeq}`;
    data.db
      .prepare(
        `INSERT INTO outbox (
          local_id, account_id, chat_id, text, transport, state, sequence_id, part_index,
          message_id, error_code, error_message, text_highlights, attempts, retry_of,
          price, media_files, previews, created_at, updated_at
        ) VALUES (
          @local_id, @account_id, @chat_id, @text, 'direct', 'unconfirmed', NULL, 0,
          NULL, 'CG-OF-06', 'legacy direct row', '[]', 1, NULL,
          0, '[]', '[]', @created_at, @created_at
        )`,
      )
      .run({ local_id: localId, account_id: ACCT, chat_id: CHAT, text, created_at: createdAt });
    return localId;
  }

  // ── Happy path ───────────────────────────────────────────────────────────

  it('persists the sending row (attempts=1) BEFORE the POST, then sent + message upsert', async () => {
    let duringPost: { state?: string; attempts?: number } | null = null;
    stub.onSend((call) => {
      const row = data.outbox.listForChat(ACCT, CHAT)[0];
      duringPost = {
        ...(row !== undefined ? { state: row.state, attempts: row.attempts } : {}),
      };
      return Promise.resolve(makeSentMessage({ id: 9_000_000_001, text: call.text }));
    });

    const { engine } = makeEngine();
    const { localIds, sequenceId } = engine.sendParts({
      accountId: ACCT,
      chatId: CHAT,
      parts: ['hey there'],
    });
    await drain();

    expect(sequenceId).toBeNull();
    expect(localIds).toHaveLength(1);
    // outbox row existed in 'sending' while the POST was in flight (SPEC §7.1)
    expect(duringPost).toEqual({ state: 'sending', attempts: 1 });

    const localId = localIds[0] ?? '';
    const row = data.outbox.get(localId);
    expect(row).toMatchObject({ state: 'sent', messageId: '9000000001', attempts: 1 });
    // POST response upserted as OUR message (response lacks isSentByMe)
    const message = data.messages.get(ACCT, CHAT, '9000000001');
    expect(message).toMatchObject({ isSentByMe: true, textPlain: 'hey there' });
    expect(stub.sendCalls).toHaveLength(1);
  });

  it('gates on the chat row canSendMessage and inserts nothing when blocked', () => {
    seedChat(data, { canSendMessage: false, canNotSendReason: 'Rejected by user' });
    const { engine } = makeEngine();
    expect(() => engine.sendParts({ accountId: ACCT, chatId: CHAT, parts: ['hi'] })).toThrow(
      /Rejected by user/,
    );
    expect(() => engine.sendParts({ accountId: ACCT, chatId: '999', parts: ['hi'] })).toThrow(
      /unknown chat/,
    );
    expect(data.outbox.listForChat(ACCT, CHAT)).toHaveLength(0);
    expect(stub.sendCalls).toHaveLength(0);
  });

  // ── Failure classification ───────────────────────────────────────────────

  it('definite failure (live restricted-400 fixture) → failed + CG-OF-05 + textHighlights', async () => {
    stub.onSend(() => Promise.reject(restrictedWordsError()));
    const { engine } = makeEngine();
    const { localIds } = engine.sendParts({
      accountId: ACCT,
      chatId: CHAT,
      parts: ['haha no I do not even have a cashapp'],
    });
    await drain();

    const row = data.outbox.get(localIds[0] ?? '');
    expect(row).toMatchObject({
      state: 'failed',
      errorCode: 'CG-OF-05',
      textHighlights: [],
      attempts: 1,
    });
    expect(row?.errorMessage).toBeTruthy();
    expect(stub.sendCalls).toHaveLength(1);
  });

  it('indeterminate (timeout) → unconfirmed + CG-OF-06 and EXACTLY ONE sendMessage call ever', async () => {
    stub.onSend(() => Promise.reject(timeoutError()));
    const { engine } = makeEngine();
    const { localIds } = engine.sendParts({ accountId: ACCT, chatId: CHAT, parts: ['hello?'] });
    await drain();
    const localId = localIds[0] ?? '';
    expect(data.outbox.get(localId)).toMatchObject({
      state: 'unconfirmed',
      errorCode: 'CG-OF-06',
      attempts: 1,
    });

    // Periodic verifier passes and a manual pass must never produce a second
    // command execution (SPEC §15.5).
    await vi.advanceTimersByTimeAsync(VERIFY_INTERVAL_MS * 4);
    await engine.verifyChat(ACCT, CHAT);

    expect(data.outbox.get(localId)?.state).toBe('unconfirmed');
    expect(stub.sendCalls).toHaveLength(1);
    expect(stub.listMessagesCalls).toBe(0); // Hub status recovery, not body reads
    engine.dispose();
  });

  // ── Verifier ─────────────────────────────────────────────────────────────

  it('verifier promotes on tail match: normalized text equality + time window', async () => {
    const { engine } = makeEngine();
    const localId = insertLegacyDirectUnconfirmed({ text: 'hello   world ' }); // normalization must match

    stub.setTail([makeTailMessage({ id: 555, text: '<p>hello world</p>', fromMe: true })]);
    await engine.verifyChat(ACCT, CHAT);

    expect(data.outbox.get(localId)).toMatchObject({
      state: 'sent',
      messageId: '555',
    });
    expect(stub.sendCalls).toHaveLength(0);
    engine.dispose();
  });

  it('verifier refuses cross-claiming: one candidate promotes one row, oldest first', async () => {
    const { engine } = makeEngine();
    const firstId = insertLegacyDirectUnconfirmed({ text: 'dup' });
    const secondId = insertLegacyDirectUnconfirmed({ text: 'dup' });
    expect(rowState(firstId)).toBe('unconfirmed');
    expect(rowState(secondId)).toBe('unconfirmed');

    // ONE matching own message: only the oldest row may claim it.
    stub.setTail([makeTailMessage({ id: 700, text: 'dup' })]);
    await engine.verifyChat(ACCT, CHAT);
    expect(data.outbox.get(firstId)).toMatchObject({ state: 'sent', messageId: '700' });
    expect(rowState(secondId)).toBe('unconfirmed');

    // A second matching message appears: the second row claims the OTHER id.
    stub.setTail([makeTailMessage({ id: 700, text: 'dup' }), makeTailMessage({ id: 701, text: 'dup' })]);
    await engine.verifyChat(ACCT, CHAT);
    expect(data.outbox.get(secondId)).toMatchObject({ state: 'sent', messageId: '701' });
    engine.dispose();
  });

  it('verifier leaves no-match unconfirmed (wrong text; outside time window)', async () => {
    const { engine } = makeEngine();
    const localId = insertLegacyDirectUnconfirmed({ text: 'exact text' });

    stub.setTail([
      makeTailMessage({ id: 801, text: 'different text' }),
      // right text but 30 min after the row — outside [−2 min, +10 min]
      makeTailMessage({
        id: 802,
        text: 'exact text',
        createdAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      }),
      // right text but from the fan
      makeTailMessage({ id: 803, text: 'exact text', fromMe: false }),
    ]);
    await engine.verifyChat(ACCT, CHAT);
    expect(rowState(localId)).toBe('unconfirmed');
    engine.dispose();
  });

  it('messageSent sync event promotes from the LOCAL table without network', async () => {
    const { engine } = makeEngine();
    const localId = insertLegacyDirectUnconfirmed({ text: 'ping pong' });
    expect(rowState(localId)).toBe('unconfirmed');

    // Sync already upserted the delivered message before emitting the event.
    seedMessage(data, { messageId: '910', textPlain: 'ping pong', isSentByMe: true });
    engine.handleSyncEvent({ type: 'messageSent', accountId: ACCT, chatId: CHAT, messageId: '910' });

    expect(data.outbox.get(localId)).toMatchObject({ state: 'sent', messageId: '910' });
    expect(stub.listMessagesCalls).toBe(0);
    expect(stub.sendCalls).toHaveLength(0);
    engine.dispose();
  });

  it('periodic auto-verify runs every 30 s and stops for rows older than 10 min', async () => {
    const { engine } = makeEngine();
    insertLegacyDirectUnconfirmed({ text: 'lost' });
    await engine.reconcileOnBoot();

    await vi.advanceTimersByTimeAsync(2 * VERIFY_INTERVAL_MS);
    expect(stub.listMessagesCalls).toBeGreaterThanOrEqual(2);

    // Beyond the 10-minute auto window the chain goes quiet…
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    const callsWhenStale = stub.listMessagesCalls;
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(stub.listMessagesCalls).toBe(callsWhenStale);

    // …but manual verifyNow still works and can promote.
    stub.setTail([makeTailMessage({ id: 920, text: 'lost', createdAt: new Date('2026-06-11T12:00:01.000Z').toISOString() })]);
    await engine.verifyChat(ACCT, CHAT);
    const rows = data.outbox.listForChat(ACCT, CHAT);
    expect(rows[0]).toMatchObject({ state: 'sent', messageId: '920' });
    engine.dispose();
  });

  // ── Restart reconciliation ───────────────────────────────────────────────

  it('boot: sending→unconfirmed→verified; queued→cancelled; late success cannot clobber', async () => {
    let releaseSend: ((value: ReturnType<typeof makeSentMessage>) => void) | undefined;
    stub.onSend(
      () =>
        new Promise((resolve) => {
          releaseSend = resolve;
        }),
    );
    const { engine } = makeEngine();
    const { localIds } = engine.sendParts({
      accountId: ACCT,
      chatId: CHAT,
      parts: ['part one', 'part two', 'part three'],
    });
    await drain();
    const [id1, id2, id3] = [localIds[0] ?? '', localIds[1] ?? '', localIds[2] ?? ''];
    expect(rowState(id1)).toBe('sending'); // in flight at "shutdown"
    expect(rowState(id2)).toBe('queued');
    expect(rowState(id3)).toBe('queued');

    // "Restart": fresh engine over the same DB; core status confirms the command.
    const bootStub = makeStubClient();
    const { engine: rebooted } = makeEngine({ stub: bootStub });
    await rebooted.reconcileOnBoot();

    expect(data.outbox.get(id1)).toMatchObject({ state: 'sent', messageId: '9000000001' });
    expect(rowState(id2)).toBe('cancelled'); // restart kills pending sequences
    expect(rowState(id3)).toBe('cancelled');
    expect(bootStub.sendCalls).toHaveLength(1); // idempotent status/intake recovery

    // The pre-restart POST resolving late must not clobber the verified row.
    releaseSend?.(makeSentMessage({ id: 999, text: 'part one' }));
    await drain();
    expect(data.outbox.get(id1)).toMatchObject({ state: 'sent', messageId: '9000000001', attempts: 1 });
    expect(stub.sendCalls).toHaveLength(1);
    rebooted.dispose();
    engine.dispose();
  });

  it('boot: unverifiable sending row stays unconfirmed with CG-OF-06', async () => {
    stub.onSend(() => new Promise(() => undefined)); // in flight forever
    const { engine } = makeEngine();
    const { localIds } = engine.sendParts({ accountId: ACCT, chatId: CHAT, parts: ['vanished'] });
    await drain();

    const bootStub = makeStubClient();
    bootStub.onSend(() => Promise.reject(timeoutError()));
    const { engine: rebooted } = makeEngine({ stub: bootStub });
    await rebooted.reconcileOnBoot();
    expect(data.outbox.get(localIds[0] ?? '')).toMatchObject({
      state: 'unconfirmed',
      errorCode: 'CG-OF-06',
    });
    rebooted.dispose();
    engine.dispose();
  });

  // ── Multi-part sequences ─────────────────────────────────────────────────

  it('3-part sequence: own row per part, FIFO order, randomized 2000–5000 ms inter-part delays', async () => {
    const randoms = [0, 0.999_999];
    const { engine, sleeps } = makeEngine({
      random: () => randoms.shift() ?? 0.5,
    });
    const { localIds, sequenceId } = engine.sendParts({
      accountId: ACCT,
      chatId: CHAT,
      parts: ['a', 'b', 'c'],
    });
    await drain();

    expect(sequenceId).not.toBeNull();
    expect(stub.sendCalls.map((call) => call.text)).toEqual(['a', 'b', 'c']);
    const rows = localIds.map((id) => data.outbox.get(id));
    expect(rows.map((row) => row?.state)).toEqual(['sent', 'sent', 'sent']);
    expect(rows.map((row) => row?.partIndex)).toEqual([0, 1, 2]);
    expect(rows.every((row) => row?.sequenceId === sequenceId)).toBe(true);

    expect(sleeps).toEqual([2000, 5000]); // random()=0 → min, →1 → max
    for (const delay of sleeps) {
      expect(delay).toBeGreaterThanOrEqual(INTER_PART_DELAY_MIN_MS);
      expect(delay).toBeLessThanOrEqual(INTER_PART_DELAY_MAX_MS);
    }
    engine.dispose();
  });

  it('sequence aborts on first failure: later parts cancelled, no further POSTs', async () => {
    stub.onSend((call, index) =>
      index === 1
        ? Promise.reject(restrictedWordsError())
        : Promise.resolve(makeSentMessage({ id: 9_000_000_001 + index, text: call.text })),
    );
    const { engine } = makeEngine();
    const { localIds } = engine.sendParts({
      accountId: ACCT,
      chatId: CHAT,
      parts: ['ok part', 'haha no I do not even have a cashapp', 'never sent'],
    });
    await drain();

    expect(rowState(localIds[0] ?? '')).toBe('sent');
    expect(data.outbox.get(localIds[1] ?? '')).toMatchObject({
      state: 'failed',
      errorCode: 'CG-OF-05',
    });
    expect(rowState(localIds[2] ?? '')).toBe('cancelled');
    expect(stub.sendCalls).toHaveLength(2);
    engine.dispose();
  });

  it('indeterminate part failure also aborts the rest of the sequence', async () => {
    stub.onSend((call, index) =>
      index === 0
        ? Promise.reject(timeoutError())
        : Promise.resolve(makeSentMessage({ id: 9_000_000_001 + index, text: call.text })),
    );
    const { engine } = makeEngine();
    const { localIds } = engine.sendParts({ accountId: ACCT, chatId: CHAT, parts: ['x', 'y'] });
    await drain();
    expect(rowState(localIds[0] ?? '')).toBe('unconfirmed');
    expect(rowState(localIds[1] ?? '')).toBe('cancelled');
    expect(stub.sendCalls).toHaveLength(1);
    engine.dispose();
  });

  it('cancelSequence between parts: queued parts cancelled, in-flight part finishes', async () => {
    let releaseSleep: (() => void) | undefined;
    const { engine } = makeEngine({
      sleep: () =>
        new Promise<void>((resolve) => {
          releaseSleep = resolve;
        }),
    });
    const { localIds, sequenceId } = engine.sendParts({
      accountId: ACCT,
      chatId: CHAT,
      parts: ['one', 'two', 'three'],
    });
    await drain(); // part 1 sent; engine inside the inter-part delay

    expect(rowState(localIds[0] ?? '')).toBe('sent');
    engine.cancelSequence({ accountId: ACCT, sequenceId: sequenceId ?? '' });
    expect(rowState(localIds[1] ?? '')).toBe('cancelled');
    expect(rowState(localIds[2] ?? '')).toBe('cancelled');

    releaseSleep?.();
    await drain();
    expect(stub.sendCalls).toHaveLength(1); // nothing left to claim
    engine.dispose();
  });

  // ── Retry / dismiss ──────────────────────────────────────────────────────

  it('retry from failed: old row cancelled (superseded), new audit row via retry_of', async () => {
    stub.onSend((call, index) =>
      index === 0
        ? Promise.reject(restrictedWordsError())
        : Promise.resolve(makeSentMessage({ id: 9_000_000_005, text: call.text })),
    );
    const { engine } = makeEngine();
    const { localIds } = engine.sendParts({ accountId: ACCT, chatId: CHAT, parts: ['bad word'] });
    await drain();
    const failedId = localIds[0] ?? '';
    expect(rowState(failedId)).toBe('failed');

    const { localId: retryId } = engine.retry({
      accountId: ACCT,
      localId: failedId,
      text: 'edited clean text',
    });
    await drain();

    expect(retryId).not.toBe(failedId);
    expect(rowState(failedId)).toBe('cancelled'); // audit chain kept
    expect(data.outbox.get(retryId)).toMatchObject({
      state: 'sent',
      retryOf: failedId,
      messageId: '9000000005',
      text: 'edited clean text',
    });
    expect(stub.sendCalls.map((call) => call.text)).toEqual(['bad word', 'edited clean text']);
    engine.dispose();
  });

  it('retry of an unconfirmed row is rejected (the verifier owns that path)', async () => {
    stub.onSend(() => Promise.reject(timeoutError()));
    const { engine } = makeEngine();
    const { localIds } = engine.sendParts({ accountId: ACCT, chatId: CHAT, parts: ['maybe sent'] });
    await drain();
    const localId = localIds[0] ?? '';
    expect(rowState(localId)).toBe('unconfirmed');

    expect(() => engine.retry({ accountId: ACCT, localId, text: 'maybe sent' })).toThrow(
      /unconfirmed/,
    );
    expect(rowState(localId)).toBe('unconfirmed');
    expect(stub.sendCalls).toHaveLength(1);
    engine.dispose();
  });

  it('retry of sent/cancelled rows and foreign accounts is rejected', async () => {
    const { engine } = makeEngine();
    const { localIds } = engine.sendParts({ accountId: ACCT, chatId: CHAT, parts: ['fine'] });
    await drain();
    const localId = localIds[0] ?? '';
    expect(rowState(localId)).toBe('sent');
    expect(() => engine.retry({ accountId: ACCT, localId, text: 'again' })).toThrow(/only failed/);
    expect(() => engine.retry({ accountId: 'acct_other', localId, text: 'again' })).toThrow(
      /unknown/,
    );
    engine.dispose();
  });

  it('dismiss: failed and unconfirmed → cancelled; sent rows refuse', async () => {
    stub.onSend((call, index) =>
      index === 0
        ? Promise.reject(restrictedWordsError())
        : index === 1
          ? Promise.reject(timeoutError())
          : Promise.resolve(makeSentMessage({ id: 9_000_000_009, text: call.text })),
    );
    const { engine } = makeEngine();
    const a = engine.sendParts({ accountId: ACCT, chatId: CHAT, parts: ['haha no I do not even have a cashapp'] });
    await drain();
    const b = engine.sendParts({ accountId: ACCT, chatId: CHAT, parts: ['timed out'] });
    await drain();
    const c = engine.sendParts({ accountId: ACCT, chatId: CHAT, parts: ['delivered'] });
    await drain();

    engine.dismiss({ accountId: ACCT, localId: a.localIds[0] ?? '' });
    engine.dismiss({ accountId: ACCT, localId: b.localIds[0] ?? '' });
    expect(rowState(a.localIds[0] ?? '')).toBe('cancelled');
    expect(rowState(b.localIds[0] ?? '')).toBe('cancelled');
    expect(() => engine.dismiss({ accountId: ACCT, localId: c.localIds[0] ?? '' })).toThrow(
      /failed\/unconfirmed/,
    );
    engine.dispose();
  });

  // ── Single-flight per chat ───────────────────────────────────────────────

  it('queues interleaved sends behind the in-flight one (single-flight, FIFO)', async () => {
    let releaseFirst: ((value: ReturnType<typeof makeSentMessage>) => void) | undefined;
    stub.onSend((call, index) =>
      index === 0
        ? new Promise((resolve) => {
            releaseFirst = resolve;
          })
        : Promise.resolve(makeSentMessage({ id: 9_000_000_001 + index, text: call.text })),
    );
    const { engine } = makeEngine();
    const first = engine.sendParts({ accountId: ACCT, chatId: CHAT, parts: ['one'] });
    await drain();
    const second = engine.sendParts({ accountId: ACCT, chatId: CHAT, parts: ['two'] });
    await drain();

    expect(stub.sendCalls).toHaveLength(1); // second waits its turn
    expect(rowState(first.localIds[0] ?? '')).toBe('sending');
    expect(rowState(second.localIds[0] ?? '')).toBe('queued');

    releaseFirst?.(makeSentMessage({ id: 9_000_000_001, text: 'one' }));
    await drain();
    expect(stub.sendCalls.map((call) => call.text)).toEqual(['one', 'two']);
    expect(rowState(first.localIds[0] ?? '')).toBe('sent');
    expect(rowState(second.localIds[0] ?? '')).toBe('sent');
    engine.dispose();
  });

  // ── Typing / mark-read / unsend ──────────────────────────────────────────

  it('typingActive: without Hub command transport it never calls Direct', async () => {
    const engine = createSendEngine({
      client: stub.client,
      data,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen }),
      sleep: () => Promise.resolve(),
      random: () => 0.5,
    });
    engine.typingActive(ACCT, CHAT);
    engine.typingActive(ACCT, CHAT);
    engine.typingActive(ACCT, CHAT);
    await drain();
    expect(stub.typingCalls).toBe(0);

    await vi.advanceTimersByTimeAsync(2500);
    engine.typingActive(ACCT, CHAT);
    await drain();
    expect(stub.typingCalls).toBe(0);
    engine.dispose();
  });

  it('markRead: debounced 1.5 s per chat, zeroes the unread count on success', async () => {
    seedChat(data, { unreadCount: 3 });
    const { engine } = makeEngine();
    await engine.markRead(ACCT, CHAT);
    await vi.advanceTimersByTimeAsync(1000);
    await engine.markRead(ACCT, CHAT); // debounce resets
    await vi.advanceTimersByTimeAsync(1400);
    expect(stub.markReadCalls).toBe(0);

    await vi.advanceTimersByTimeAsync(100); // 1.5 s after the second call
    expect(stub.markReadCalls).toBe(1);
    expect(data.chats.get(ACCT, CHAT)?.unreadCount).toBe(0);
    engine.dispose();
  });

  it('markRead: settings toggle OFF → no call at all', async () => {
    markAsReadOnOpen = false;
    seedChat(data, { unreadCount: 3 });
    const { engine } = makeEngine();
    await engine.markRead(ACCT, CHAT);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(stub.markReadCalls).toBe(0);
    expect(data.chats.get(ACCT, CHAT)?.unreadCount).toBe(3);
    engine.dispose();
  });

  it('unsend: deleteMessage success tombstones the local message row', async () => {
    seedMessage(data, { messageId: 'm9' });
    const { engine } = makeEngine();
    await engine.unsend(ACCT, CHAT, 'm9');
    expect(stub.deleteCalls).toEqual(['m9']);
    expect(data.messages.get(ACCT, CHAT, 'm9')?.deleted).toBe(true);
    engine.dispose();
  });
});

describe('normalizeForMatch', () => {
  it('trims and collapses inner whitespace', () => {
    expect(normalizeForMatch('  hello \n  world\t!  ')).toBe('hello world !');
    expect(normalizeForMatch('same')).toBe('same');
  });
});
