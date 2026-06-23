// PPV send path (PRD F7, SPEC §7): pre-enqueue validation (an invalid PPV
// never creates an outbox row), the single-row guarantee (sequences never
// apply), the Hub command payload (price/mediaFiles/previews/lockedText), the
// failure semantics shared with text sends, and the caption-less verifier
// match (price + media count + window — designed and pinned here).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CgError } from '@chatgoose/shared';
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
  allowMessageGuard,
  drain,
  loadFixture,
  makeSentMessage,
  makeStubHubCommandClient,
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
  let localSeq: number;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-11T12:00:00.000Z'));
    data = memoryDataLayer();
    stub = makeStubClient();
    localSeq = 0;
    seedChat(data);
  });

  afterEach(() => {
    vi.useRealTimers();
    data.close();
  });

  function makeEngine(overrides: Partial<SendEngineOptions> = {}): SendEngine {
    return createSendEngine({
      client: stub.client,
      hubCommandClient: overrides.hubCommandClient ?? makeStubHubCommandClient(stub),
      data,
      messageGuard: overrides.messageGuard ?? allowMessageGuard,
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

  function insertLegacyDirectUnconfirmed(
    overrides: Partial<Parameters<SendEngine['sendPpv']>[0]> = {},
  ): string {
    const args = ppvArgs(overrides);
    localSeq += 1;
    const localId = `legacy-direct-ppv-${localSeq}`;
    const now = new Date().toISOString();
    data.db
      .prepare(
        `INSERT INTO outbox (
          local_id, account_id, chat_id, text, transport, state, sequence_id, part_index,
          message_id, error_code, error_message, text_highlights, attempts, retry_of,
          price, media_files, previews, created_at, updated_at
        ) VALUES (
          @local_id, @account_id, @chat_id, @text, 'direct', 'unconfirmed', NULL, 0,
          NULL, 'CG-OF-06', 'legacy direct row', '[]', 1, NULL,
          @price, @media_files, @previews, @created_at, @created_at
        )`,
      )
      .run({
        local_id: localId,
        account_id: ACCT,
        chat_id: CHAT,
        text: args.text,
        price: args.price,
        media_files: JSON.stringify(args.mediaFiles),
        previews: JSON.stringify(args.previews),
        created_at: now,
      });
    return localId;
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

  it('message guard blocks the PPV caption before enqueue', () => {
    const guard = {
      assertAllowed: vi.fn(() => {
        throw new CgError('CG-GUARD-01');
      }),
    };
    const engine = makeEngine({ messageGuard: guard });

    expect(() => engine.sendPpv(ppvArgs({ text: 'paypal me' }))).toThrow(/Message Guard/);
    expect(data.outbox.listForChat(ACCT, CHAT)).toHaveLength(0);
    expect(guard.assertAllowed).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: 'engine:sendPpv',
        mediaCount: MEDIA.length,
        price: 25,
      }),
    );
  });

  // ── Happy path ───────────────────────────────────────────────────────────

  it('persists ONE row (no sequence) with the PPV payload BEFORE the command, then sends the PPV body', async () => {
    let duringCommand: ReturnType<DataLayer['outbox']['listForChat']>[number] | undefined;
    stub.onSend((call) => {
      duringCommand = data.outbox.listForChat(ACCT, CHAT)[0];
      return Promise.resolve(
        makeSentMessage({ id: 9_100_000_001, text: call.text, price: 25, mediaIds: [51, 52] }),
      );
    });

    const engine = makeEngine();
    const { localId } = engine.sendPpv(ppvArgs());
    await drain();

    // row persisted (state sending, payload intact) before any network I/O
    expect(duringCommand).toMatchObject({
      state: 'sending',
      attempts: 1,
      price: 25,
      mediaFiles: [...MEDIA],
      previews: [MEDIA[0]],
      sequenceId: null, // sequences never apply to PPV
      partIndex: 0,
    });

    // exactly one Hub command carrying the PPV body; vault ids stay canonical strings
    expect(stub.sendCalls).toHaveLength(1);
    expect(stub.sendCalls[0]).toEqual({
      accountId: ACCT,
      chatId: CHAT,
      text: 'just for you 🖤',
      price: 25,
      mediaFiles: ['3866342509', 'ofapi_media_abc123'],
      previews: ['3866342509'],
    });

    const row = data.outbox.get(localId);
    expect(row).toMatchObject({ state: 'sent', messageId: '9100000001' });
    const message = data.messages.get(ACCT, CHAT, '9100000001');
    expect(message).toMatchObject({ isSentByMe: true, price: 25 });
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
      mediaFiles: ['3866342509', 'ofapi_media_abc123'],
      previews: [],
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
    expect(row?.textHighlights).toEqual([]);
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

  function unconfirmedPpvRow(
    overrides: Partial<Parameters<SendEngine['sendPpv']>[0]> = {},
  ): string {
    const localId = insertLegacyDirectUnconfirmed(overrides);
    expect(data.outbox.get(localId)?.state).toBe('unconfirmed');
    return localId;
  }

  it('caption-less row matches an own empty-text message with the same price + media count in the window', async () => {
    const engine = makeEngine();
    const localId = unconfirmedPpvRow({ text: '' });

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
    const localId = unconfirmedPpvRow({ text: '' });
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
    const localId = unconfirmedPpvRow({ text: '' });
    const tooLate = new Date(Date.now() + VERIFY_WINDOW_AFTER_MS + 60_000).toISOString();
    stub.setTail([makeTailMessage({ id: 821, text: '', price: 25, mediaIds: [51, 52], createdAt: tooLate })]);
    await engine.verifyChat(ACCT, CHAT);
    expect(data.outbox.get(localId)?.state).toBe('unconfirmed');
    engine.dispose();
  });

  it('captioned PPV row matches by caption AND pins price/media count (no cross-claim of a text twin)', async () => {
    const engine = makeEngine();
    const localId = unconfirmedPpvRow(); // caption 'just for you 🖤', $25, 2 media
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
    const first = unconfirmedPpvRow({ text: '' });
    const second = unconfirmedPpvRow({ text: '' });
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
    const engine = makeEngine();
    const localId = insertLegacyDirectUnconfirmed({ text: 'hey you', price: 0, mediaFiles: [], previews: [] });
    stub.setTail([makeTailMessage({ id: 851, text: '<p>hey you</p>' })]);
    await engine.verifyChat(ACCT, CHAT);
    expect(data.outbox.get(localId)).toMatchObject({ state: 'sent', messageId: '851' });
    engine.dispose();
  });
});
