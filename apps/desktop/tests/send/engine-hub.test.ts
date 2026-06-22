import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HubError, type HubOfapiCommand } from '@chatgoose/shared/hub/index';
import { createSendEngine } from '@main/send/engine';
import type { DataLayer } from '@main/db/index';
import {
  ACCT,
  CHAT,
  drain,
  makeStubClient,
  memoryDataLayer,
  seedChat,
  seedMessage,
  toMediaUrl,
} from './helpers';

function command(
  clientCommandId: string,
  state: HubOfapiCommand['state'],
  overrides: Partial<HubOfapiCommand> = {},
): HubOfapiCommand {
  return {
    commandId: overrides.commandId ?? '11111111-1111-4111-8111-111111111111',
    clientCommandId,
    kind: 'send_text_message_v1',
    accountId: ACCT,
    conversationId: CHAT,
    state,
    payloadHash: '0'.repeat(64),
    retryOfCommandId: null,
    attemptCount: state === 'queued' ? 0 : 1,
    lastErrorCode: null,
    lastErrorClass: null,
    verifierResult: null,
    platformMessageId: state === 'confirmed' ? '9001' : null,
    attemptStartedAt: state === 'queued' ? null : '2026-06-20T00:00:00.000Z',
    attemptFinishedAt: state === 'confirmed' ? '2026-06-20T00:00:01.000Z' : null,
    createdAt: '2026-06-20T00:00:00.000Z',
    updatedAt: '2026-06-20T00:00:01.000Z',
    deduplicated: false,
    ...overrides,
  };
}

describe('send engine hub command transport', () => {
  let data: DataLayer;

  beforeEach(() => {
    vi.useFakeTimers();
    data = memoryDataLayer();
    seedChat(data);
  });

  afterEach(() => {
    vi.useRealTimers();
    data.close();
  });

  it('uses core command intake/status without a Direct client or GET /messages', async () => {
    const direct = makeStubClient();
    const getOfapiCommand = vi.fn(async ({ commandId }: { commandId: string }) =>
      command('unused', 'confirmed', { commandId }),
    );
    const createOfapiCommand = vi.fn(async ({ command: request }) =>
      command(request.clientCommandId, 'queued'),
    );
    const engine = createSendEngine({
      client: direct.client,
      hubCommandClient: { createOfapiCommand, getOfapiCommand },
      data,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: false }),
      sleep: () => Promise.resolve(),
      hubCommandPollIntervalMs: 0,
      hubCommandPollLimit: 2,
    });

    const { localIds } = engine.sendParts({ accountId: ACCT, chatId: CHAT, parts: ['hello'] });
    await drain();

    expect(createOfapiCommand).toHaveBeenCalledWith({
      command: {
        clientCommandId: localIds[0],
        kind: 'send_text_message_v1',
        accountId: ACCT,
        conversationId: CHAT,
        payload: { text: 'hello' },
        retryOfCommandId: null,
      },
    });
    expect(getOfapiCommand).toHaveBeenCalledTimes(1);
    expect(direct.sendCalls).toHaveLength(0);
    expect(direct.listMessagesCalls).toBe(0);
    expect(data.outbox.get(localIds[0] ?? '')).toMatchObject({
      transport: 'hub',
      state: 'sent',
      messageId: '9001',
    });
    expect(data.messages.get(ACCT, CHAT, '9001')).toMatchObject({
      textPlain: 'hello',
      isSentByMe: true,
    });
    engine.dispose();
  });

  it('routes media sends through core command intake without a Direct client', async () => {
    const direct = makeStubClient();
    const getOfapiCommand = vi.fn(async ({ commandId }: { commandId: string }) =>
      command('unused', 'confirmed', {
        commandId,
        kind: 'send_media_message_v1',
        platformMessageId: '9002',
      }),
    );
    const createOfapiCommand = vi.fn(async ({ command: request }) =>
      command(request.clientCommandId, 'queued', { kind: 'send_media_message_v1' }),
    );
    const engine = createSendEngine({
      client: direct.client,
      hubCommandClient: { createOfapiCommand, getOfapiCommand },
      data,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: false }),
      sleep: () => Promise.resolve(),
      hubCommandPollIntervalMs: 0,
      hubCommandPollLimit: 2,
    });

    const { localId } = engine.sendPpv({
      accountId: ACCT,
      chatId: CHAT,
      text: 'media caption',
      price: 25,
      mediaFiles: ['3866342509', 'ofapi_media_abc123'],
      previews: ['3866342509'],
    });
    await drain();

    expect(createOfapiCommand).toHaveBeenCalledWith({
      command: {
        clientCommandId: localId,
        kind: 'send_media_message_v1',
        accountId: ACCT,
        conversationId: CHAT,
        payload: {
          text: 'media caption',
          price: 25,
          mediaFiles: ['3866342509', 'ofapi_media_abc123'],
          previews: ['3866342509'],
        },
        retryOfCommandId: null,
      },
    });
    expect(getOfapiCommand).toHaveBeenCalledTimes(1);
    expect(direct.sendCalls).toHaveLength(0);
    expect(direct.listMessagesCalls).toBe(0);
    expect(data.outbox.get(localId)).toMatchObject({
      transport: 'hub',
      state: 'sent',
      messageId: '9002',
    });
    expect(data.messages.get(ACCT, CHAT, '9002')).toMatchObject({
      textPlain: 'media caption',
      price: 25,
      isSentByMe: true,
    });
    engine.dispose();
  });

  it('routes typing beacons through hub command intake without a Direct client', async () => {
    const direct = makeStubClient();
    const createOfapiCommand = vi.fn(async ({ command: request }) =>
      command(request.clientCommandId, 'confirmed', {
        kind: 'typing_active_v1',
        platformMessageId: null,
      }),
    );
    const engine = createSendEngine({
      client: direct.client,
      hubCommandClient: {
        createOfapiCommand,
        getOfapiCommand: vi.fn(),
      },
      data,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: false }),
      sleep: () => Promise.resolve(),
    });

    engine.typingActive(ACCT, CHAT);
    engine.typingActive(ACCT, CHAT);
    await drain();

    expect(createOfapiCommand).toHaveBeenCalledTimes(1);
    expect(createOfapiCommand).toHaveBeenCalledWith({
      command: {
        clientCommandId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        ),
        kind: 'typing_active_v1',
        accountId: ACCT,
        conversationId: CHAT,
        payload: {},
      },
    });
    expect(direct.typingCalls).toBe(0);

    await vi.advanceTimersByTimeAsync(2500);
    engine.typingActive(ACCT, CHAT);
    await drain();

    expect(createOfapiCommand).toHaveBeenCalledTimes(2);
    expect(direct.typingCalls).toBe(0);
    engine.dispose();
  });

  it('routes debounced mark-read through hub command intake and zeroes unread only after confirmation', async () => {
    seedChat(data, { unreadCount: 3 });
    const direct = makeStubClient();
    const createOfapiCommand = vi.fn(async ({ command: request }) =>
      command(request.clientCommandId, 'confirmed', {
        kind: 'mark_chat_read_v1',
        platformMessageId: null,
      }),
    );
    const engine = createSendEngine({
      client: direct.client,
      hubCommandClient: {
        createOfapiCommand,
        getOfapiCommand: vi.fn(),
      },
      data,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: true }),
      sleep: () => Promise.resolve(),
      hubCommandPollIntervalMs: 0,
      hubCommandPollLimit: 1,
    });

    await engine.markRead(ACCT, CHAT);
    await vi.advanceTimersByTimeAsync(1000);
    await engine.markRead(ACCT, CHAT);
    await vi.advanceTimersByTimeAsync(1499);
    await drain();

    expect(createOfapiCommand).not.toHaveBeenCalled();
    expect(data.chats.get(ACCT, CHAT)?.unreadCount).toBe(3);

    await vi.advanceTimersByTimeAsync(1);
    await drain();

    expect(createOfapiCommand).toHaveBeenCalledTimes(1);
    expect(createOfapiCommand).toHaveBeenCalledWith({
      command: {
        clientCommandId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        ),
        kind: 'mark_chat_read_v1',
        accountId: ACCT,
        conversationId: CHAT,
        payload: {},
      },
    });
    expect(direct.markReadCalls).toBe(0);
    expect(data.chats.get(ACCT, CHAT)?.unreadCount).toBe(0);
    engine.dispose();
  });

  it('routes unsend through hub command intake without a Direct client and tombstones only after confirmation', async () => {
    seedMessage(data, { messageId: '9001', deleted: false });
    const direct = makeStubClient();
    const createOfapiCommand = vi.fn(async ({ command: request }) =>
      command(request.clientCommandId, 'confirmed', {
        kind: 'unsend_message_v1',
        platformMessageId: '9001',
      }),
    );
    const engine = createSendEngine({
      client: direct.client,
      hubCommandClient: {
        createOfapiCommand,
        getOfapiCommand: vi.fn(),
      },
      data,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: false }),
      sleep: () => Promise.resolve(),
    });

    await engine.unsend(ACCT, CHAT, '9001');

    expect(createOfapiCommand).toHaveBeenCalledWith({
      command: {
        clientCommandId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        ),
        kind: 'unsend_message_v1',
        accountId: ACCT,
        conversationId: CHAT,
        payload: { messageId: '9001' },
      },
    });
    expect(direct.deleteCalls).toHaveLength(0);
    expect(data.messages.get(ACCT, CHAT, '9001')).toMatchObject({ deleted: true });
    engine.dispose();
  });

  it('collapses duplicate pending hub unsend clicks and leaves the message visible while pending', async () => {
    seedMessage(data, { messageId: '9001', deleted: false });
    const direct = makeStubClient();
    let resolveCreate: ((value: HubOfapiCommand) => void) | undefined;
    const createOfapiCommand = vi.fn(({ command: request }) =>
      new Promise<HubOfapiCommand>((resolve) => {
        resolveCreate = resolve;
      }).then(() => command(request.clientCommandId, 'queued', {
        kind: 'unsend_message_v1',
        platformMessageId: null,
      })),
    );
    const engine = createSendEngine({
      client: direct.client,
      hubCommandClient: {
        createOfapiCommand,
        getOfapiCommand: vi.fn(async ({ commandId }: { commandId: string }) =>
          command('unused', 'queued', { commandId, kind: 'unsend_message_v1' }),
        ),
      },
      data,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: false }),
      sleep: () => Promise.resolve(),
      hubCommandPollIntervalMs: 0,
      hubCommandPollLimit: 1,
    });

    const first = engine.unsend(ACCT, CHAT, '9001');
    const second = engine.unsend(ACCT, CHAT, '9001');
    await drain();
    expect(createOfapiCommand).toHaveBeenCalledTimes(1);

    resolveCreate?.(command('unused', 'queued', { kind: 'unsend_message_v1' }));
    await Promise.all([first, second]);

    expect(direct.deleteCalls).toHaveLength(0);
    expect(data.messages.get(ACCT, CHAT, '9001')).toMatchObject({ deleted: false });
    engine.dispose();
  });

  it('recovers an ambiguous intake by repeating the same client id without a body read', async () => {
    const direct = makeStubClient();
    let failIntake = true;
    const createOfapiCommand = vi.fn(async ({ command: request }) => {
      if (failIntake) {
        throw new Error('connection reset');
      }
      return command(request.clientCommandId, 'confirmed', { deduplicated: true });
    });
    const engine = createSendEngine({
      client: direct.client,
      hubCommandClient: {
        createOfapiCommand,
        getOfapiCommand: vi.fn(),
      },
      data,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: false }),
      sleep: () => Promise.resolve(),
    });

    const { localIds } = engine.sendParts({ accountId: ACCT, chatId: CHAT, parts: ['hello'] });
    await drain();
    const localId = localIds[0] ?? '';
    expect(data.outbox.get(localId)?.state).toBe('unconfirmed');

    failIntake = false;
    await engine.verifyChat(ACCT, CHAT);

    expect(createOfapiCommand.mock.calls.map(([arg]) => arg.command.clientCommandId)).toEqual([
      localId,
      localId,
    ]);
    expect(data.outbox.get(localId)?.state).toBe('sent');
    expect(direct.listMessagesCalls).toBe(0);
    engine.dispose();
  });

  it('fails closed when Hub command transport is not configured', async () => {
    const direct = makeStubClient();
    const createOfapiCommand = vi.fn(async () => {
      throw new HubError('bad-request', {
        message: 'Hub command transport is not configured',
      });
    });
    const engine = createSendEngine({
      client: direct.client,
      hubCommandClient: {
        createOfapiCommand,
        getOfapiCommand: vi.fn(),
      },
      data,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: false }),
      sleep: () => Promise.resolve(),
    });

    const { localIds } = engine.sendParts({ accountId: ACCT, chatId: CHAT, parts: ['hello'] });
    await drain();

    expect(data.outbox.get(localIds[0] ?? '')).toMatchObject({
      state: 'failed',
      errorCode: 'CG-HUB-02',
      errorMessage: 'Hub command transport is not configured',
    });
    expect(direct.sendCalls).toHaveLength(0);
    expect(direct.listMessagesCalls).toBe(0);
    engine.dispose();
  });

  it('preserves core retry lineage with a new local/client command id', async () => {
    const direct = makeStubClient();
    const originalCoreId = '22222222-2222-4222-8222-222222222222';
    const createOfapiCommand = vi.fn(async ({ command: request }) => {
      if (request.retryOfCommandId === null) {
        return command(request.clientCommandId, 'failed_retryable', {
          commandId: originalCoreId,
          lastErrorCode: 'ofapi_rate_limited',
          lastErrorClass: 'retryable',
        });
      }
      return command(request.clientCommandId, 'confirmed', {
        commandId: '33333333-3333-4333-8333-333333333333',
        retryOfCommandId: originalCoreId,
        platformMessageId: '9002',
      });
    });
    const engine = createSendEngine({
      client: direct.client,
      hubCommandClient: {
        createOfapiCommand,
        getOfapiCommand: vi.fn(),
      },
      data,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: false }),
      sleep: () => Promise.resolve(),
    });

    const first = engine.sendParts({ accountId: ACCT, chatId: CHAT, parts: ['hello'] }).localIds[0]!;
    await drain();
    expect(data.outbox.get(first)?.state).toBe('failed');

    const retry = engine.retry({ accountId: ACCT, localId: first, text: 'hello again' }).localId;
    await drain();

    expect(data.outbox.get(retry)).toMatchObject({ state: 'sent', transport: 'hub' });
    expect(createOfapiCommand).toHaveBeenLastCalledWith({
      command: expect.objectContaining({
        clientCommandId: retry,
        retryOfCommandId: originalCoreId,
      }),
    });
    expect(direct.sendCalls).toHaveLength(0);
    engine.dispose();
  });
});
