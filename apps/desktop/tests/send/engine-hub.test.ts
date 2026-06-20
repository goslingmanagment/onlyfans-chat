import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HubOfapiCommand } from '@chatgoose/shared/hub/index';
import { createSendEngine } from '@main/send/engine';
import type { DataLayer } from '@main/db/index';
import {
  ACCT,
  CHAT,
  drain,
  makeStubClient,
  memoryDataLayer,
  seedChat,
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

  it('uses core command intake/status and never calls direct send or GET /messages', async () => {
    const direct = makeStubClient();
    const getOfapiCommand = vi.fn(async ({ commandId }: { commandId: string }) =>
      command('unused', 'confirmed', { commandId }),
    );
    const createOfapiCommand = vi.fn(async ({ command: request }) =>
      command(request.clientCommandId, 'queued'),
    );
    const engine = createSendEngine({
      client: direct.client,
      directClient: direct.client,
      hubCommandClient: { createOfapiCommand, getOfapiCommand },
      getWriteTransport: () => 'hub',
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
      getWriteTransport: () => 'hub',
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
      getWriteTransport: () => 'hub',
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
