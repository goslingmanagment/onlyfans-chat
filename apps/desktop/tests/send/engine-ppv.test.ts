// PPV send path (PRD F7, SPEC §7): pre-enqueue validation (an invalid PPV
// never creates an outbox row), the single-row guarantee (sequences never
// apply), the PPV POST body (price/mediaFiles/previews/lockedText), the
// failure semantics shared with text sends, and the caption-less verifier
// match (price + media count + window — designed and pinned here).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataLayer } from '@main/db/index';
import {
  createSendEngine,
  isValidPpvPrice,
  PPV_PRICE_MAX,
  PPV_PRICE_MIN,
  VERIFY_WINDOW_AFTER_MS,
} from '@main/send/engine';
import type { SendEngine, SendEngineOptions } from '@main/send/engine';
import { mapOfApiHttpError, mapOfApiNetworkError } from '@main/ofapi/errors';
import type { OfApiError } from '@main/ofapi/errors';
import {
  ACCT,
  CHAT,
  drain,
  loadFixture,
  makeSentMessage,
  makeStubClient,
  makeTailMessage,
  memoryDataLayer,
  seedChat,
  toMediaUrl,
} from './helpers';
import type { StubSendClient } from './helpers';

const SEND_URL = `https://app.onlyfansapi.com/api/${ACCT}/chats/${CHAT}/messages`;
const MEDIA = ['3866342509', 'ofapi_media_abc123'] as const;

function restrictedWordsError(): OfApiError {
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

describe('send engine — PPV path (PRD F7)', () => {
  let data: DataLayer;
  let stub: StubSendClient;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-11T12:00:00.000Z'));
    data = memoryDataLayer();
    stub = makeStubClient();
    seedChat(data);
  });

  afterEach(() => {
    vi.useRealTimers();
    data.close();
  });

  function makeEngine(overrides: Partial<SendEngineOptions> = {}): SendEngine {
    return createSendEngine({
      client: stub.client,
      data,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: true }),
      sleep: () => Promise.resolve(),
      random: () => 0.5,
      ...overrides,
    });
  }

  function ppvArgs(overrides: Partial<Parameters<SendEngine['sendPpv']>[0]> = {}) {
    return {
      accountId: ACCT,
      chatId: CHAT,
      text: 'just for you 🖤',
      price: 25,
      mediaFiles: [...MEDIA],
      previews: [MEDIA[0]],
      ...overrides,
    };
  }

  // ── Validation BEFORE enqueue ────────────────────────────────────────────

  it('isValidPpvPrice pins the openapi bounds: 0 or integer 3–200', () => {
    expect(isValidPpvPrice(0)).toBe(true);
    expect(isValidPpvPrice(PPV_PRICE_MIN)).toBe(true);
    expect(isValidPpvPrice(PPV_PRICE_MAX)).toBe(true);
    expect(isValidPpvPrice(1)).toBe(false);
    expect(isValidPpvPrice(2.99)).toBe(false);
    expect(isValidPpvPrice(3.5)).toBe(false); // whole dollars (openapi: integer)
    expect(isValidPpvPrice(201)).toBe(false);
    expect(isValidPpvPrice(-3)).toBe(false);
    expect(isValidPpvPrice(Number.NaN)).toBe(false);
  });

  it('rejects invalid PPVs without inserting a row or touching the client', async () => {
    const engine = makeEngine();
    const cases: Array<Partial<Parameters<SendEngine['sendPpv']>[0]>> = [
      { mediaFiles: [], previews: [] }, // no media
      { price: 2 }, // below min
      { price: 201 }, // above max
      { price: 25.5 }, // not whole dollars
      { previews: ['999'] }, // previews ⊄ mediaFiles
      { mediaFiles: ['1', '1'], previews: [] }, // duplicate attach
    ];
    for (const broken of cases) {
      expect(() => engine.sendPpv(ppvArgs(broken))).toThrow();
    }
    await drain();
    expect(data.outbox.listForChat(ACCT, CHAT)).toHaveLength(0);
    expect(stub.sendCalls).toHaveLength(0);
  });

  it('previews ⊆ mediaFiles compares across string/number forms of the same id', () => {
    const engine = makeEngine();
    // numeric-string preview of a numeric-string attach: fine
    expect(() =>
      engine.sendPpv(ppvArgs({ mediaFiles: ['123'], previews: ['123'] })),
    ).not.toThrow();
  });

  it('gates on canSendMessage like text sends', () => {
    seedChat(data, { canSendMessage: false, canNotSendReason: 'Rejected by user' });
    const engine = makeEngine();
    expect(() => engine.sendPpv(ppvArgs())).toThrow(/Rejected by user/);
    expect(data.outbox.listForChat(ACCT, CHAT)).toHaveLength(0);
  });

  // ── Happy path ───────────────────────────────────────────────────────────

  it('persists ONE row (no sequence) with the PPV payload BEFORE the POST, then sends the PPV body', async () => {
    let duringPost: ReturnType<DataLayer['outbox']['listForChat']>[number] | undefined;
    stub.onSend((call) => {
      duringPost = data.outbox.listForChat(ACCT, CHAT)[0];
      return Promise.resolve(
        makeSentMessage({ id: 9_100_000_001, text: call.text, price: 25, mediaIds: [51, 52] }),
      );
    });

    const engine = makeEngine();
    const { localId } = engine.sendPpv(ppvArgs());
    await drain();

    // row persisted (state sending, payload intact) before any network I/O
    expect(duringPost).toMatchObject({
      state: 'sending',
      attempts: 1,
      price: 25,
      mediaFiles: [...MEDIA],
      previews: [MEDIA[0]],
      sequenceId: null, // sequences never apply to PPV
      partIndex: 0,
    });

    // exactly one POST carrying the PPV body; vault ids go as numbers
    expect(stub.sendCalls).toHaveLength(1);
    expect(stub.sendCalls[0]).toEqual({
      accountId: ACCT,
      chatId: CHAT,
      text: 'just for you 🖤',
      price: 25,
      mediaFiles: [3866342509, 'ofapi_media_abc123'],
      previews: [3866342509],
      lockedText: true, // priced + captioned ⇒ locked-text caption (PRD F7)
    });

    const row = data.outbox.get(localId);
    expect(row).toMatchObject({ state: 'sent', messageId: '9100000001' });
    const message = data.messages.get(ACCT, CHAT, '9100000001');
    expect(message).toMatchObject({ isSentByMe: true, price: 25 });
    expect(message?.media).toHaveLength(2);
  });

  it('price 0 = free media message: no lockedText, previews omitted when empty', async () => {
    const engine = makeEngine();
    engine.sendPpv(ppvArgs({ price: 0, previews: [] }));
    await drain();
    expect(stub.sendCalls[0]).toEqual({
      accountId: ACCT,
      chatId: CHAT,
      text: 'just for you 🖤',
      price: 0,
      mediaFiles: [3866342509, 'ofapi_media_abc123'],
    });
  });

  it('caption-less PPV sends an empty text and no lockedText', async () => {
    const engine = makeEngine();
    engine.sendPpv(ppvArgs({ text: '' }));
    await drain();
    expect(stub.sendCalls[0]).toMatchObject({ text: '', price: 25 });
    expect(stub.sendCalls[0]?.lockedText).toBeUndefined();
  });

  // ── Failure semantics (identical to text sends) ──────────────────────────

  it('restricted-word 400 on a captioned PPV → failed + textHighlights (CG-OF-05)', async () => {
    stub.onSend(() => Promise.reject(restrictedWordsError()));
    const engine = makeEngine();
    const { localId } = engine.sendPpv(ppvArgs());
    await drain();
    const row = data.outbox.get(localId);
    expect(row).toMatchObject({ state: 'failed', errorCode: 'CG-OF-05' });
    expect(row?.textHighlights.length).toBeGreaterThan(0);
    expect(stub.sendCalls).toHaveLength(1);
  });

  it('indeterminate outcome → unconfirmed, NEVER auto-retried (SPEC §15.5)', async () => {
    stub.onSend(() => Promise.reject(timeoutError()));
    const engine = makeEngine();
    const { localId } = engine.sendPpv(ppvArgs());
    await drain();
    expect(data.outbox.get(localId)).toMatchObject({ state: 'unconfirmed', errorCode: 'CG-OF-06' });
    // the scheduled verifier pass reads the tail; it must never re-POST
    stub.setTail([]);
    await vi.advanceTimersByTimeAsync(VERIFY_WINDOW_AFTER_MS);
    await drain();
    expect(stub.sendCalls).toHaveLength(1);
    expect(data.outbox.get(localId)?.state).toBe('unconfirmed');
    engine.dispose();
  });

  it('retry of a failed PPV row carries the payload over (caption editable)', async () => {
    stub.onSend(() => Promise.reject(restrictedWordsError()));
    const engine = makeEngine();
    const { localId } = engine.sendPpv(ppvArgs());
    await drain();

    stub.onSend((call) =>
      Promise.resolve(makeSentMessage({ id: 9_100_000_009, text: call.text, price: 25, mediaIds: [51, 52] })),
    );
    const { localId: retryId } = engine.retry({ accountId: ACCT, localId, text: 'softer caption' });
    await drain();

    expect(data.outbox.get(localId)?.state).toBe('cancelled'); // superseded
    expect(data.outbox.get(retryId)).toMatchObject({
      state: 'sent',
      price: 25,
      mediaFiles: [...MEDIA],
      previews: [MEDIA[0]],
      retryOf: localId,
    });
    expect(stub.sendCalls[1]).toMatchObject({ text: 'softer caption', price: 25 });
  });

  // ── Verifier: caption-less matching (designed here, PRD F7) ─────────────

  async function unconfirmedPpvRow(
    engine: SendEngine,
    overrides: Partial<Parameters<SendEngine['sendPpv']>[0]> = {},
  ): Promise<string> {
    stub.onSend(() => Promise.reject(timeoutError()));
    const { localId } = engine.sendPpv(ppvArgs(overrides));
    await drain();
    expect(data.outbox.get(localId)?.state).toBe('unconfirmed');
    return localId;
  }

  it('caption-less row matches an own empty-text message with the same price + media count in the window', async () => {
    const engine = makeEngine();
    const localId = await unconfirmedPpvRow(engine, { text: '' });

    stub.setTail([
      // decoys: same price wrong count; same count wrong price; a text message
      makeTailMessage({ id: 801, text: '', price: 25, mediaIds: [1] }),
      makeTailMessage({ id: 802, text: '', price: 10, mediaIds: [1, 2] }),
      makeTailMessage({ id: 803, text: '<p>hello there</p>' }),
      // the real delivery: empty text, price 25, two media
      makeTailMessage({ id: 804, text: '', price: 25, mediaIds: [51, 52] }),
    ]);
    await engine.verifyChat(ACCT, CHAT);

    expect(data.outbox.get(localId)).toMatchObject({ state: 'sent', messageId: '804' });
    engine.dispose();
  });

  it('caption-less row stays unconfirmed when only mismatching candidates exist', async () => {
    const engine = makeEngine();
    const localId = await unconfirmedPpvRow(engine, { text: '' });
    stub.setTail([
      makeTailMessage({ id: 811, text: '', price: 25, mediaIds: [1] }), // wrong count
      makeTailMessage({ id: 812, text: '', price: 30, mediaIds: [1, 2] }), // wrong price
      makeTailMessage({ id: 813, text: '', price: 25, mediaIds: [1, 2], fromMe: false }), // not ours
    ]);
    await engine.verifyChat(ACCT, CHAT);
    expect(data.outbox.get(localId)?.state).toBe('unconfirmed');
    engine.dispose();
  });

  it('caption-less row honors the time window like text rows', async () => {
    const engine = makeEngine();
    const localId = await unconfirmedPpvRow(engine, { text: '' });
    const tooLate = new Date(Date.now() + VERIFY_WINDOW_AFTER_MS + 60_000).toISOString();
    stub.setTail([makeTailMessage({ id: 821, text: '', price: 25, mediaIds: [51, 52], createdAt: tooLate })]);
    await engine.verifyChat(ACCT, CHAT);
    expect(data.outbox.get(localId)?.state).toBe('unconfirmed');
    engine.dispose();
  });

  it('captioned PPV row matches by caption AND pins price/media count (no cross-claim of a text twin)', async () => {
    const engine = makeEngine();
    const localId = await unconfirmedPpvRow(engine); // caption 'just for you 🖤', $25, 2 media
    stub.setTail([
      // a plain TEXT message with the identical wording must not be claimed
      makeTailMessage({ id: 831, text: '<p>just for you 🖤</p>' }),
      makeTailMessage({ id: 832, text: '<p>just for you 🖤</p>', price: 25, mediaIds: [51, 52] }),
    ]);
    await engine.verifyChat(ACCT, CHAT);
    expect(data.outbox.get(localId)).toMatchObject({ state: 'sent', messageId: '832' });
    engine.dispose();
  });

  it('two caption-less twins claim distinct messages (no double-claim)', async () => {
    const engine = makeEngine();
    const first = await unconfirmedPpvRow(engine, { text: '' });
    const second = await unconfirmedPpvRow(engine, { text: '' });
    stub.setTail([
      makeTailMessage({ id: 841, text: '', price: 25, mediaIds: [51, 52] }),
      makeTailMessage({ id: 842, text: '', price: 25, mediaIds: [51, 52] }),
    ]);
    await engine.verifyChat(ACCT, CHAT);
    const ids = [data.outbox.get(first)?.messageId, data.outbox.get(second)?.messageId];
    expect(new Set(ids).size).toBe(2);
    expect(ids).toContain('841');
    expect(ids).toContain('842');
    engine.dispose();
  });

  it('plain text rows are unaffected by the PPV discriminators (price-0 candidates still match)', async () => {
    stub.onSend(() => Promise.reject(timeoutError()));
    const engine = makeEngine();
    const { localIds } = engine.sendParts({ accountId: ACCT, chatId: CHAT, parts: ['hey you'] });
    await drain();
    stub.setTail([makeTailMessage({ id: 851, text: '<p>hey you</p>' })]);
    await engine.verifyChat(ACCT, CHAT);
    expect(data.outbox.get(localIds[0] ?? '')).toMatchObject({ state: 'sent', messageId: '851' });
    engine.dispose();
  });
});
