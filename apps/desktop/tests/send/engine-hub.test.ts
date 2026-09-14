import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HubError, type HubOfapiCommand } from '@chatgoose/shared/hub/index';
import {
  createSendEngine,
  MARK_READ_DEBOUNCE_MS,
  UNSEND_RECOVERY_MAX_AGE_MS,
  VERIFY_INTERVAL_MS,
} from '@main/send/engine';
import { createChangeBus, createDataLayer } from '@main/db/index';
import type { DataLayer } from '@main/db/index';
import {
  ACCT,
  CHAT,
  allowMessageGuard,
  drain,
  makeStubClient,
  memoryDataLayer,
  seedChat,
  seedMessage,
  toMediaUrl,
  TEST_DRIVER,
} from './helpers';
import { tempDbFile } from '../db/helpers';

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
  let cleanup: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    cleanup = () => undefined;
    data = memoryDataLayer();
    seedChat(data);
  });

  afterEach(() => {
    vi.useRealTimers();
    data.close();
    cleanup();
  });

  it('persists follower custody outside composer options and submits one protected v1 command', async () => {
    const createOfapiCommand = vi.fn(async ({ command: request }) => command(request.clientCommandId, 'confirmed'));
    const engine = createSendEngine({ client: makeStubClient().client, hubCommandClient: { createOfapiCommand, getOfapiCommand: vi.fn() }, data, messageGuard: allowMessageGuard, toMediaUrl, getSettings: async () => ({ markAsReadOnOpen: false }) });
    const { localIds } = engine.sendParts({ accountId: ACCT, chatId: CHAT, parts: ['hello new fan'], outreachPurpose: 'new-follower' });
    await drain();
    expect(data.outbox.get(localIds[0] ?? '')).toMatchObject({ outreachPurpose: 'new-follower', composer: null, state: 'sent' });
    expect(createOfapiCommand).toHaveBeenCalledTimes(1);
    expect(createOfapiCommand.mock.calls[0]?.[0].command).toMatchObject({ kind: 'send_text_message_v1', outreachPurpose: 'new-follower', payload: { text: 'hello new fan' } });
    engine.dispose();
  });

  it('refuses ordinary inbox retry for follower outreach so fresh eligibility cannot be bypassed', () => {
    data.outbox.insertMany([{ localId: 'follower-failure', accountId: ACCT, chatId: CHAT, text: 'hello', outreachPurpose: 'new-follower', sequenceId: null, partIndex: 0, retryOf: null, createdAt: new Date().toISOString() }]);
    data.outbox.transition({ localId: 'follower-failure', from: ['queued'], to: 'failed' });
    const engine = createSendEngine({ client: makeStubClient().client, data, messageGuard: allowMessageGuard, toMediaUrl, getSettings: async () => ({ markAsReadOnOpen: false }) });
    expect(() => engine.retry({ accountId: ACCT, localId: 'follower-failure', text: 'hello' })).toThrow('Перепроверьте');
    expect(data.outbox.get('follower-failure')?.state).toBe('failed');
    engine.dispose();
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
      messageGuard: allowMessageGuard,
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
      isNew: true,
    });
    engine.dispose();
  });

  it('settles a hub confirmation without downgrading an enriched messageSent row', async () => {
    seedMessage(data, {
      messageId: '9001',
      textHtml: '<p>enriched from hub</p>',
      textPlain: 'enriched from hub',
      price: 30,
      isOpened: true,
      media: [
        {
          id: 'media-1',
          type: 'photo',
          thumbUrl: 'media://thumb-1',
          fullUrl: null,
          isReady: true,
          locked: true,
          durationSeconds: null,
        },
      ],
      raw: { source: 'hub-sse' },
    });
    const direct = makeStubClient();
    const createOfapiCommand = vi.fn(async ({ command: request }) =>
      command(request.clientCommandId, 'confirmed', {
        platformMessageId: '9001',
        attemptFinishedAt: '2026-06-20T00:00:02.000Z',
        updatedAt: '2026-06-20T00:00:02.000Z',
      }),
    );
    const engine = createSendEngine({
      client: direct.client,
      hubCommandClient: {
        createOfapiCommand,
        getOfapiCommand: vi.fn(),
      },
      data,
      messageGuard: allowMessageGuard,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: false }),
      sleep: () => Promise.resolve(),
    });

    const { localIds } = engine.sendParts({ accountId: ACCT, chatId: CHAT, parts: ['stub text'] });
    await drain();

    expect(data.outbox.get(localIds[0] ?? '')).toMatchObject({
      state: 'sent',
      messageId: '9001',
    });
    expect(data.messages.get(ACCT, CHAT, '9001')).toMatchObject({
      textPlain: 'enriched from hub',
      price: 30,
      isOpened: true,
      media: [
        expect.objectContaining({
          id: 'media-1',
          locked: true,
        }),
      ],
    });
    expect(direct.listMessagesCalls).toBe(0);
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
      messageGuard: allowMessageGuard,
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
      isOpened: false,
      isSentByMe: true,
      isNew: true,
      media: [
        {
          id: '3866342509',
          locked: false,
          thumbUrl: null,
          fullUrl: null,
        },
        {
          id: 'ofapi_media_abc123',
          locked: true,
          thumbUrl: null,
          fullUrl: null,
        },
      ],
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
      messageGuard: allowMessageGuard,
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
      messageGuard: allowMessageGuard,
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
      messageGuard: allowMessageGuard,
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
    expect(data.unsendCommands.get(ACCT, CHAT, '9001')).toBeNull();
    engine.dispose();
  });

  it('collapses concurrent unsends and reuses durable lineage while the command remains queued', async () => {
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
      messageGuard: allowMessageGuard,
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
    const concurrent = await Promise.allSettled([first, second]);
    expect(concurrent.map((result) => result.status)).toEqual(['rejected', 'rejected']);
    await expect(engine.unsend(ACCT, CHAT, '9001')).rejects.toThrow(/still pending/i);

    expect(direct.deleteCalls).toHaveLength(0);
    expect(createOfapiCommand).toHaveBeenCalledTimes(1);
    expect(data.unsendCommands.get(ACCT, CHAT, '9001')).toMatchObject({
      coreCommandId: '11111111-1111-4111-8111-111111111111',
    });
    expect(data.messages.get(ACCT, CHAT, '9001')).toMatchObject({ deleted: false });
    engine.dispose();
  });

  it('resumes a queued unsend by persisted core command id after an engine rebuild', async () => {
    seedMessage(data, { messageId: '9001', deleted: false });
    const direct = makeStubClient();
    const createOfapiCommand = vi.fn(async ({ command: request }) =>
      command(request.clientCommandId, 'queued', {
        commandId: '22222222-2222-4222-8222-222222222222',
        kind: 'unsend_message_v1',
      }),
    );
    const first = createSendEngine({
      client: direct.client,
      hubCommandClient: { createOfapiCommand, getOfapiCommand: vi.fn() },
      data,
      messageGuard: allowMessageGuard,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: false }),
      sleep: () => Promise.resolve(),
      hubCommandPollLimit: 0,
    });

    await expect(first.unsend(ACCT, CHAT, '9001')).rejects.toThrow(/still pending/i);
    const persisted = data.unsendCommands.get(ACCT, CHAT, '9001');
    expect(persisted).toMatchObject({
      coreCommandId: '22222222-2222-4222-8222-222222222222',
    });
    first.dispose();

    const getOfapiCommand = vi.fn(async ({ commandId }: { commandId: string }) =>
      command(persisted?.clientCommandId ?? 'missing', 'confirmed', {
        commandId,
        kind: 'unsend_message_v1',
        platformMessageId: '9001',
      }),
    );
    const replacement = createSendEngine({
      client: direct.client,
      hubCommandClient: { createOfapiCommand, getOfapiCommand },
      data,
      messageGuard: allowMessageGuard,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: false }),
      sleep: () => Promise.resolve(),
      hubCommandPollLimit: 0,
    });

    await replacement.reconcileOnBoot(false);

    expect(createOfapiCommand).toHaveBeenCalledTimes(1);
    expect(getOfapiCommand).toHaveBeenCalledWith({
      commandId: '22222222-2222-4222-8222-222222222222',
    });
    expect(data.messages.get(ACCT, CHAT, '9001')).toMatchObject({ deleted: true });
    expect(data.unsendCommands.get(ACCT, CHAT, '9001')).toBeNull();
    replacement.dispose();
  });

  it('retains indeterminate unsend lineage but stops automatic polling and surfaces uncertainty', async () => {
    seedMessage(data, { messageId: '9001', deleted: false });
    const direct = makeStubClient();
    const getOfapiCommand = vi.fn();
    const engine = createSendEngine({
      client: direct.client,
      hubCommandClient: {
        createOfapiCommand: vi.fn(async ({ command: request }) =>
          command(request.clientCommandId, 'indeterminate', {
            commandId: '44444444-4444-4444-8444-444444444444',
            kind: 'unsend_message_v1',
          })),
        getOfapiCommand,
      },
      data,
      messageGuard: allowMessageGuard,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: false }),
      sleep: () => Promise.resolve(),
    });

    await expect(engine.unsend(ACCT, CHAT, '9001')).rejects.toThrow(/could not be confirmed/i);
    expect(data.unsendCommands.get(ACCT, CHAT, '9001')).toMatchObject({
      coreCommandId: '44444444-4444-4444-8444-444444444444',
    });
    expect(data.messages.get(ACCT, CHAT, '9001')).toMatchObject({ deleted: false });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(getOfapiCommand).not.toHaveBeenCalled();
    engine.dispose();
  });

  it('repeats response-lost unsend intake with the same client id after a process restart', async () => {
    const temp = tempDbFile();
    cleanup = temp.cleanup;
    data.close();
    data = createDataLayer({
      driverPath: TEST_DRIVER,
      filePath: temp.file,
      encryptionKey: 'test-unsend-restart-key',
      bus: createChangeBus(0),
    });
    seedChat(data);
    seedMessage(data, { messageId: '9001', deleted: false });
    const direct = makeStubClient();
    let acceptedClientId: string | null = null;
    const lostResponseCreate = vi.fn(async ({ command: request }) => {
      acceptedClientId = request.clientCommandId;
      throw new Error('connection reset after intake');
    });
    const first = createSendEngine({
      client: direct.client,
      hubCommandClient: { createOfapiCommand: lostResponseCreate, getOfapiCommand: vi.fn() },
      data,
      messageGuard: allowMessageGuard,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: false }),
      sleep: () => Promise.resolve(),
      hubCommandPollLimit: 0,
    });

    await expect(first.unsend(ACCT, CHAT, '9001')).rejects.toThrow(/connection reset/);
    const beforeRestart = data.unsendCommands.get(ACCT, CHAT, '9001');
    expect(beforeRestart).toMatchObject({ clientCommandId: acceptedClientId, coreCommandId: null });
    first.dispose();
    data.close();

    data = createDataLayer({
      driverPath: TEST_DRIVER,
      filePath: temp.file,
      encryptionKey: 'test-unsend-restart-key',
      bus: createChangeBus(0),
    });
    const replayCreate = vi.fn(async ({ command: request }) =>
      command(request.clientCommandId, 'confirmed', {
        commandId: '33333333-3333-4333-8333-333333333333',
        kind: 'unsend_message_v1',
        platformMessageId: '9001',
        deduplicated: true,
      }),
    );
    const restarted = createSendEngine({
      client: direct.client,
      hubCommandClient: { createOfapiCommand: replayCreate, getOfapiCommand: vi.fn() },
      data,
      messageGuard: allowMessageGuard,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: false }),
      sleep: () => Promise.resolve(),
      hubCommandPollLimit: 0,
    });

    await restarted.reconcileOnBoot();

    expect(replayCreate).toHaveBeenCalledWith({
      command: expect.objectContaining({ clientCommandId: acceptedClientId }),
    });
    expect(data.messages.get(ACCT, CHAT, '9001')).toMatchObject({ deleted: true });
    expect(data.unsendCommands.get(ACCT, CHAT, '9001')).toBeNull();
    restarted.dispose();
  });

  it('does not auto-intake an expired response-lost unsend during boot recovery', async () => {
    const clock = Date.parse('2026-07-12T12:00:00.000Z');
    seedMessage(data, { messageId: '9001', deleted: false });
    data.unsendCommands.ensure({
      accountId: ACCT,
      chatId: CHAT,
      messageId: '9001',
      clientCommandId: '55555555-5555-4555-8555-555555555555',
      createdAt: new Date(clock - UNSEND_RECOVERY_MAX_AGE_MS - 1).toISOString(),
    });
    const createOfapiCommand = vi.fn(async ({ command: request }) =>
      command(request.clientCommandId, 'confirmed', {
        kind: 'unsend_message_v1',
        platformMessageId: '9001',
      }),
    );
    const getOfapiCommand = vi.fn();
    const engine = createSendEngine({
      client: makeStubClient().client,
      hubCommandClient: { createOfapiCommand, getOfapiCommand },
      data,
      messageGuard: allowMessageGuard,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: false }),
      sleep: () => Promise.resolve(),
      now: () => clock,
    });

    await engine.reconcileOnBoot();

    expect(createOfapiCommand).not.toHaveBeenCalled();
    expect(getOfapiCommand).not.toHaveBeenCalled();
    expect(data.messages.get(ACCT, CHAT, '9001')).toMatchObject({ deleted: false });
    expect(data.unsendCommands.get(ACCT, CHAT, '9001')).not.toBeNull();
    engine.dispose();
  });

  it('still reads terminal status for an expired unsend already accepted by Core', async () => {
    const clock = Date.parse('2026-07-12T12:00:00.000Z');
    seedMessage(data, { messageId: '9001', deleted: false });
    data.unsendCommands.ensure({
      accountId: ACCT,
      chatId: CHAT,
      messageId: '9001',
      clientCommandId: '77777777-7777-4777-8777-777777777777',
      createdAt: new Date(clock - UNSEND_RECOVERY_MAX_AGE_MS - 1).toISOString(),
    });
    data.unsendCommands.setCoreCommandId(
      ACCT,
      CHAT,
      '9001',
      '88888888-8888-4888-8888-888888888888',
    );
    const createOfapiCommand = vi.fn();
    const getOfapiCommand = vi.fn(async () =>
      command('77777777-7777-4777-8777-777777777777', 'confirmed', {
        commandId: '88888888-8888-4888-8888-888888888888',
        kind: 'unsend_message_v1',
        platformMessageId: '9001',
      }),
    );
    const engine = createSendEngine({
      client: makeStubClient().client,
      hubCommandClient: { createOfapiCommand, getOfapiCommand },
      data,
      messageGuard: allowMessageGuard,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: false }),
      sleep: () => Promise.resolve(),
      now: () => clock,
    });

    await engine.reconcileOnBoot();

    expect(createOfapiCommand).not.toHaveBeenCalled();
    expect(getOfapiCommand).toHaveBeenCalledWith({
      commandId: '88888888-8888-4888-8888-888888888888',
    });
    expect(data.messages.get(ACCT, CHAT, '9001')).toMatchObject({ deleted: true });
    expect(data.unsendCommands.get(ACCT, CHAT, '9001')).toBeNull();
    engine.dispose();
  });

  it('does not hot-loop status reads for an expired accepted unsend when Core keeps rejecting', async () => {
    const clock = Date.parse('2026-07-12T12:00:00.000Z');
    seedMessage(data, { messageId: '9001', deleted: false });
    data.unsendCommands.ensure({
      accountId: ACCT,
      chatId: CHAT,
      messageId: '9001',
      clientCommandId: '99999999-9999-4999-8999-999999999999',
      createdAt: new Date(clock - UNSEND_RECOVERY_MAX_AGE_MS - 1).toISOString(),
    });
    data.unsendCommands.setCoreCommandId(
      ACCT,
      CHAT,
      '9001',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    const getOfapiCommand = vi.fn(async () => {
      throw new HubError('http', { message: 'expired command' });
    });
    const engine = createSendEngine({
      client: makeStubClient().client,
      hubCommandClient: { createOfapiCommand: vi.fn(), getOfapiCommand },
      data,
      messageGuard: allowMessageGuard,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: false }),
      sleep: () => Promise.resolve(),
      now: () => clock,
      unsendRecoveryIntervalMs: 5_000,
    });

    await engine.reconcileOnBoot();
    expect(getOfapiCommand).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(getOfapiCommand).toHaveBeenCalledTimes(1);
    expect(data.unsendCommands.get(ACCT, CHAT, '9001')).not.toBeNull();
    engine.dispose();
  });

  it('rechecks the unsend recovery deadline when an already-armed timer fires', async () => {
    let clock = Date.parse('2026-07-12T12:00:00.000Z');
    seedMessage(data, { messageId: '9001', deleted: false });
    data.unsendCommands.ensure({
      accountId: ACCT,
      chatId: CHAT,
      messageId: '9001',
      clientCommandId: '66666666-6666-4666-8666-666666666666',
      createdAt: new Date(clock - UNSEND_RECOVERY_MAX_AGE_MS + 1_000).toISOString(),
    });
    const createOfapiCommand = vi.fn(async () => {
      throw new Error('response lost');
    });
    const engine = createSendEngine({
      client: makeStubClient().client,
      hubCommandClient: { createOfapiCommand, getOfapiCommand: vi.fn() },
      data,
      messageGuard: allowMessageGuard,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: false }),
      sleep: () => Promise.resolve(),
      now: () => clock,
      unsendRecoveryIntervalMs: 5_000,
    });

    await expect(engine.unsend(ACCT, CHAT, '9001')).rejects.toThrow(/response lost/i);
    expect(createOfapiCommand).toHaveBeenCalledTimes(1);

    clock += 5_000;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(createOfapiCommand).toHaveBeenCalledTimes(1);
    expect(data.unsendCommands.get(ACCT, CHAT, '9001')).not.toBeNull();
    engine.dispose();
  });

  it('clears durable unsend lineage on a terminal command failure', async () => {
    seedMessage(data, { messageId: '9001', deleted: false });
    const direct = makeStubClient();
    const engine = createSendEngine({
      client: direct.client,
      hubCommandClient: {
        createOfapiCommand: vi.fn(async ({ command: request }) =>
          command(request.clientCommandId, 'failed_terminal', {
            kind: 'unsend_message_v1',
            lastErrorCode: 'cannot_unsend',
          }),
        ),
        getOfapiCommand: vi.fn(),
      },
      data,
      messageGuard: allowMessageGuard,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: false }),
      sleep: () => Promise.resolve(),
    });

    await expect(engine.unsend(ACCT, CHAT, '9001')).rejects.toThrow('cannot_unsend');
    expect(data.unsendCommands.get(ACCT, CHAT, '9001')).toBeNull();
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
      messageGuard: allowMessageGuard,
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
      messageGuard: allowMessageGuard,
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
      messageGuard: allowMessageGuard,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: false }),
      sleep: () => Promise.resolve(),
    });

    const first = engine.sendParts({ accountId: ACCT, chatId: CHAT, parts: ['hello'] }).localIds[0]!;
    await drain();
    expect(data.outbox.get(first)).toMatchObject({
      state: 'failed',
      coreCommandId: originalCoreId,
    });

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

  it('retries a pre-intake auth failure as fresh lineage without re-posting the original', async () => {
    const direct = makeStubClient();
    const createOfapiCommand = vi
      .fn()
      .mockRejectedValueOnce(new HubError('auth', { message: 'chatter key expired' }))
      .mockImplementationOnce(async ({ command: request }) =>
        command(request.clientCommandId, 'confirmed', {
          commandId: '44444444-4444-4444-8444-444444444444',
          platformMessageId: '9003',
        }),
      );
    const engine = createSendEngine({
      client: direct.client,
      hubCommandClient: {
        createOfapiCommand,
        getOfapiCommand: vi.fn(),
      },
      data,
      messageGuard: allowMessageGuard,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: false }),
      sleep: () => Promise.resolve(),
    });

    const original = engine.sendParts({ accountId: ACCT, chatId: CHAT, parts: ['stale text'] })
      .localIds[0]!;
    await drain();
    expect(data.outbox.get(original)).toMatchObject({
      state: 'failed',
      coreCommandId: null,
      errorCode: 'CG-HUB-01',
    });

    const retry = engine.retry({ accountId: ACCT, localId: original, text: 'edited text' }).localId;
    await drain();

    expect(createOfapiCommand).toHaveBeenCalledTimes(2);
    expect(createOfapiCommand.mock.calls.map(([arg]) => arg.command.clientCommandId)).toEqual([
      original,
      retry,
    ]);
    expect(createOfapiCommand).toHaveBeenLastCalledWith({
      command: expect.objectContaining({
        clientCommandId: retry,
        payload: { text: 'edited text' },
        retryOfCommandId: null,
      }),
    });
    expect(data.outbox.get(original)).toMatchObject({
      state: 'cancelled',
      coreCommandId: null,
    });
    expect(data.outbox.get(retry)).toMatchObject({
      state: 'sent',
      coreCommandId: '44444444-4444-4444-8444-444444444444',
      messageId: '9003',
    });
    expect(direct.sendCalls).toHaveLength(0);
    expect(direct.listMessagesCalls).toBe(0);
    engine.dispose();
  });

  it('keeps the original failed row retryable when inserting its replacement fails', async () => {
    const direct = makeStubClient();
    const createOfapiCommand = vi.fn(async ({ command: request }) =>
      command(request.clientCommandId, 'failed_retryable', {
        lastErrorCode: 'ofapi_rate_limited',
        lastErrorClass: 'retryable',
      }),
    );
    const engine = createSendEngine({
      client: direct.client,
      hubCommandClient: { createOfapiCommand, getOfapiCommand: vi.fn() },
      data,
      messageGuard: allowMessageGuard,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: false }),
      sleep: () => Promise.resolve(),
    });
    const original = engine.sendParts({ accountId: ACCT, chatId: CHAT, parts: ['hello'] })
      .localIds[0]!;
    await drain();
    expect(data.outbox.get(original)).toMatchObject({ state: 'failed' });
    data.db.exec(
      `CREATE TRIGGER fail_retry_insert BEFORE INSERT ON outbox
       WHEN NEW.retry_of IS NOT NULL
       BEGIN SELECT RAISE(ABORT, 'simulated retry insert failure'); END`,
    );

    expect(() => engine.retry({ accountId: ACCT, localId: original, text: 'hello again' }))
      .toThrow(/simulated retry insert failure/i);

    expect(data.outbox.get(original)).toMatchObject({ state: 'failed', retryOf: null });
    expect(data.outbox.listForChat(ACCT, CHAT)).toHaveLength(1);
    engine.dispose();
  });

  // A24 (W4.5): kernel intake raises these typed errors before the command
  // insert (including Fastify's route-level canonical 429). With no
  // coreCommandId on the row, that pair
  // is proof no command exists — park 'failed' (retryable), never
  // 'unconfirmed' (which fed the verifier's first-time intake: the
  // documented hours-late silent stale send).
  it.each([
    ['service_unavailable', 503],
    ['not_found', 404],
    ['rate_limit_exceeded', 429],
  ] as const)('parks a definite pre-intake rejection (%s/%i) as failed with retry', async (kernelCode, status) => {
    const direct = makeStubClient();
    const createOfapiCommand = vi.fn(async () => {
      throw new HubError('http', {
        message: `kernel intake refused: ${kernelCode}`,
        detail: { status, kernelCode },
      });
    });
    const engine = createSendEngine({
      client: direct.client,
      hubCommandClient: { createOfapiCommand, getOfapiCommand: vi.fn() },
      data,
      messageGuard: allowMessageGuard,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: false }),
      sleep: () => Promise.resolve(),
    });

    const { localIds } = engine.sendParts({ accountId: ACCT, chatId: CHAT, parts: ['hello'] });
    await drain();

    expect(data.outbox.get(localIds[0] ?? '')).toMatchObject({
      state: 'failed',
      coreCommandId: null,
      errorCode: 'CG-HUB-02',
      errorMessage: `kernel intake refused: ${kernelCode}`,
    });
    // Out of the verifier pool: a verify pass must not re-intake it.
    await engine.verifyChat(ACCT, CHAT);
    expect(createOfapiCommand).toHaveBeenCalledTimes(1);
    engine.dispose();
  });

  it('keeps conflict/409 indeterminate because an existing mismatched clientCommandId also uses it', async () => {
    const direct = makeStubClient();
    const seenClientIds: string[] = [];
    const createOfapiCommand = vi.fn(async ({ command: request }) => {
      seenClientIds.push(request.clientCommandId);
      throw new HubError('http', {
        message: 'clientCommandId was already used for a different command',
        detail: { status: 409, kernelCode: 'conflict' },
      });
    });
    const engine = createSendEngine({
      client: direct.client,
      hubCommandClient: { createOfapiCommand, getOfapiCommand: vi.fn() },
      data,
      messageGuard: allowMessageGuard,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: false }),
      sleep: () => Promise.resolve(),
    });

    const { localIds } = engine.sendParts({ accountId: ACCT, chatId: CHAT, parts: ['hello'] });
    await drain();
    const localId = localIds[0] ?? '';

    expect(data.outbox.get(localId)).toMatchObject({
      state: 'unconfirmed',
      coreCommandId: null,
    });
    // Verification may repeat the idempotent intake under the SAME id, but the
    // row never gains the fresh-id retry affordance that could duplicate an
    // already-existing server command.
    await engine.verifyChat(ACCT, CHAT);
    expect(seenClientIds).toEqual([localId, localId]);
    expect(data.outbox.get(localId)?.state).toBe('unconfirmed');
    engine.dispose();
  });

  it('never fails a POST-intake row on the same typed codes (one-attempt guard)', async () => {
    const direct = makeStubClient();
    const createOfapiCommand = vi.fn(async ({ command: request }) =>
      command(request.clientCommandId, 'queued'),
    );
    // The status read after a successful intake throws the same typed shape —
    // the command EXISTS, so this must stay indeterminate ('unconfirmed').
    const getOfapiCommand = vi.fn(async () => {
      throw new HubError('http', {
        message: 'kernel status read refused',
        detail: { status: 409, kernelCode: 'conflict' },
      });
    });
    const engine = createSendEngine({
      client: direct.client,
      hubCommandClient: { createOfapiCommand, getOfapiCommand },
      data,
      messageGuard: allowMessageGuard,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: false }),
      sleep: () => Promise.resolve(),
      hubCommandPollIntervalMs: 0,
      hubCommandPollLimit: 2,
    });

    const { localIds } = engine.sendParts({ accountId: ACCT, chatId: CHAT, parts: ['hello'] });
    await drain();

    expect(data.outbox.get(localIds[0] ?? '')).toMatchObject({
      state: 'unconfirmed',
      coreCommandId: '11111111-1111-4111-8111-111111111111',
    });
    engine.dispose();
  });

  it('keeps a POST-intake auth failure verifier-owned without enabling manual retry', async () => {
    const direct = makeStubClient();
    const createOfapiCommand = vi.fn(async ({ command: request }) =>
      command(request.clientCommandId, 'queued'),
    );
    const getOfapiCommand = vi.fn(async () => {
      throw new HubError('auth', { message: 'device token expired during status polling' });
    });
    const engine = createSendEngine({
      client: direct.client,
      hubCommandClient: { createOfapiCommand, getOfapiCommand },
      data,
      messageGuard: allowMessageGuard,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: false }),
      sleep: () => Promise.resolve(),
      hubCommandPollIntervalMs: 0,
      hubCommandPollLimit: 2,
    });

    const localId = engine.sendParts({ accountId: ACCT, chatId: CHAT, parts: ['hello'] }).localIds[0]!;
    await drain();

    expect(data.outbox.get(localId)).toMatchObject({
      state: 'unconfirmed',
      coreCommandId: '11111111-1111-4111-8111-111111111111',
      errorCode: 'CG-HUB-01',
    });
    expect(() => engine.retry({ accountId: ACCT, localId, text: 'hello again' }))
      .toThrow(/unconfirmed.*verify or dismiss/i);
    expect(createOfapiCommand).toHaveBeenCalledTimes(1);
    engine.dispose();
  });

  it('keeps an untyped or status-mismatched intake failure indeterminate', async () => {
    const direct = makeStubClient();
    // kernelCode without its matching serialization status is NOT proof —
    // e.g. a proxy rewrote the status; the create may have landed.
    const createOfapiCommand = vi.fn(async () => {
      throw new HubError('http', {
        message: 'mismatched shape',
        detail: { status: 500, kernelCode: 'conflict' },
      });
    });
    const engine = createSendEngine({
      client: direct.client,
      hubCommandClient: { createOfapiCommand, getOfapiCommand: vi.fn() },
      data,
      messageGuard: allowMessageGuard,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: false }),
      sleep: () => Promise.resolve(),
    });

    const { localIds } = engine.sendParts({ accountId: ACCT, chatId: CHAT, parts: ['hello'] });
    await drain();

    expect(data.outbox.get(localIds[0] ?? '')?.state).toBe('unconfirmed');
    engine.dispose();
  });

  it('quiesces the outgoing pump before same-chat work is exposed through a replacement engine', async () => {
    const direct = makeStubClient();
    const started: string[] = [];
    let active = 0;
    let maxActive = 0;
    let releaseFirst: (() => void) | undefined;
    let messageId = 9_100;

    const recordStart = (text: string): void => {
      started.push(text);
      active += 1;
      maxActive = Math.max(maxActive, active);
    };
    const finishCommand = (clientCommandId: string): HubOfapiCommand => {
      active -= 1;
      messageId += 1;
      return command(clientCommandId, 'confirmed', {
        commandId: `cmd-${clientCommandId}`,
        platformMessageId: String(messageId),
      });
    };

    const oldCreate = vi.fn(async ({ command: request }) => {
      const text = request.kind === 'send_text_message_v1' ? request.payload.text : request.kind;
      recordStart(text);
      if (started.length === 1) {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      }
      return finishCommand(request.clientCommandId);
    });
    const replacementCreate = vi.fn(async ({ command: request }) => {
      const text = request.kind === 'send_text_message_v1' ? request.payload.text : request.kind;
      recordStart(text);
      return finishCommand(request.clientCommandId);
    });
    const common = {
      client: direct.client,
      data,
      messageGuard: allowMessageGuard,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: false }),
      sleep: () => Promise.resolve(),
    };
    const oldEngine = createSendEngine({
      ...common,
      hubCommandClient: { createOfapiCommand: oldCreate, getOfapiCommand: vi.fn() },
    });
    // Runtime construction happens before the swap; this engine is not exposed
    // to IPC until the outgoing engine's quiesce barrier resolves.
    const replacementEngine = createSendEngine({
      ...common,
      hubCommandClient: { createOfapiCommand: replacementCreate, getOfapiCommand: vi.fn() },
    });

    oldEngine.sendParts({ accountId: ACCT, chatId: CHAT, parts: ['old one', 'old two'] });
    await drain();
    expect(started).toEqual(['old one']);

    let quiesced = false;
    const barrier = oldEngine.quiesce().then(() => {
      quiesced = true;
    });
    expect(() =>
      oldEngine.sendParts({ accountId: ACCT, chatId: CHAT, parts: ['must reject'] }),
    ).toThrow(/quiescing/);
    await drain();
    expect(quiesced).toBe(false);

    releaseFirst?.();
    await barrier;
    oldEngine.dispose();

    replacementEngine.sendParts({ accountId: ACCT, chatId: CHAT, parts: ['new runtime'] });
    await drain();

    expect(started).toEqual(['old one', 'old two', 'new runtime']);
    expect(maxActive).toBe(1);
    expect(data.outbox.listForChat(ACCT, CHAT).map((row) => row.text)).toEqual([
      'old one',
      'old two',
      'new runtime',
    ]);
    replacementEngine.dispose();
  });

  it('quiesce drops new auxiliary writes and waits for an already-submitted unsend', async () => {
    const direct = makeStubClient();
    let releaseUnsend: (() => void) | undefined;
    const createOfapiCommand = vi.fn(
      ({ command: request }) =>
        new Promise<HubOfapiCommand>((resolve) => {
          releaseUnsend = () =>
            resolve(
              command(request.clientCommandId, 'confirmed', {
                commandId: `cmd-${request.clientCommandId}`,
                platformMessageId: request.kind === 'unsend_message_v1' ? request.payload.messageId : null,
              }),
            );
        }),
    );
    const engine = createSendEngine({
      client: direct.client,
      hubCommandClient: { createOfapiCommand, getOfapiCommand: vi.fn() },
      data,
      messageGuard: allowMessageGuard,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: true }),
      sleep: () => Promise.resolve(),
    });

    // A deferred mark-read exists before retirement; quiesce must cancel it.
    await engine.markRead(ACCT, CHAT);
    const pendingUnsend = engine.unsend(ACCT, CHAT, '9001');
    await drain();
    expect(createOfapiCommand).toHaveBeenCalledTimes(1);

    let quiesced = false;
    const barrier = engine.quiesce().then(() => {
      quiesced = true;
    });
    engine.typingActive(ACCT, CHAT);
    await engine.markRead(ACCT, CHAT);
    await expect(engine.unsend(ACCT, CHAT, '9002')).rejects.toThrow(/quiescing/);
    await vi.advanceTimersByTimeAsync(2_000);

    expect(createOfapiCommand).toHaveBeenCalledTimes(1);
    expect(quiesced).toBe(false);

    releaseUnsend?.();
    await Promise.all([pendingUnsend, barrier]);
    expect(quiesced).toBe(true);
    engine.dispose();
  });

  it('quiesce waits for an already-started manual verifier to finish its DB transition', async () => {
    const direct = makeStubClient();
    let intakeAttempt = 0;
    let releaseVerify: (() => void) | undefined;
    const createOfapiCommand = vi.fn(({ command: request }) => {
      intakeAttempt += 1;
      if (intakeAttempt === 1) {
        return Promise.reject(new Error('connection reset'));
      }
      return new Promise<HubOfapiCommand>((resolve) => {
        releaseVerify = () => resolve(command(request.clientCommandId, 'confirmed'));
      });
    });
    const engine = createSendEngine({
      client: direct.client,
      hubCommandClient: { createOfapiCommand, getOfapiCommand: vi.fn() },
      data,
      messageGuard: allowMessageGuard,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: false }),
      sleep: () => Promise.resolve(),
    });

    const localId = engine.sendParts({ accountId: ACCT, chatId: CHAT, parts: ['hello'] }).localIds[0]!;
    await drain();
    expect(data.outbox.get(localId)?.state).toBe('unconfirmed');

    const verification = engine.verifyChat(ACCT, CHAT);
    await drain();
    expect(createOfapiCommand).toHaveBeenCalledTimes(2);

    let quiesced = false;
    const barrier = engine.quiesce().then(() => {
      // Purge may close the DB immediately after this resolves, so the final
      // verifier transition must already be durable at the barrier boundary.
      expect(data.outbox.get(localId)?.state).toBe('sent');
      quiesced = true;
    });
    await drain();
    expect(quiesced).toBe(false);
    await engine.verifyChat(ACCT, CHAT); // rejected as new work after quiesce
    expect(createOfapiCommand).toHaveBeenCalledTimes(2);

    releaseVerify?.();
    await Promise.all([verification, barrier]);
    expect(quiesced).toBe(true);
    engine.dispose();
  });

  it('quiesce waits for an already-fired scheduled verifier', async () => {
    const direct = makeStubClient();
    let intakeAttempt = 0;
    let releaseVerify: (() => void) | undefined;
    const createOfapiCommand = vi.fn(({ command: request }) => {
      intakeAttempt += 1;
      if (intakeAttempt === 1) {
        return Promise.reject(new Error('connection reset'));
      }
      return new Promise<HubOfapiCommand>((resolve) => {
        releaseVerify = () => resolve(command(request.clientCommandId, 'confirmed'));
      });
    });
    const engine = createSendEngine({
      client: direct.client,
      hubCommandClient: { createOfapiCommand, getOfapiCommand: vi.fn() },
      data,
      messageGuard: allowMessageGuard,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: false }),
      sleep: () => Promise.resolve(),
    });

    const localId = engine.sendParts({ accountId: ACCT, chatId: CHAT, parts: ['hello'] }).localIds[0]!;
    await drain();
    await vi.advanceTimersByTimeAsync(VERIFY_INTERVAL_MS);
    await drain();
    expect(createOfapiCommand).toHaveBeenCalledTimes(2);

    let quiesced = false;
    const barrier = engine.quiesce().then(() => {
      expect(data.outbox.get(localId)?.state).toBe('sent');
      quiesced = true;
    });
    await drain();
    expect(quiesced).toBe(false);

    releaseVerify?.();
    await barrier;
    expect(quiesced).toBe(true);
    engine.dispose();
  });

  it('quiesce waits for already-started typing and mark-read commands before DB close', async () => {
    seedChat(data, { unreadCount: 4 });
    const direct = makeStubClient();
    let releaseTyping: (() => void) | undefined;
    let releaseMarkRead: (() => void) | undefined;
    const createOfapiCommand = vi.fn(({ command: request }) =>
      new Promise<HubOfapiCommand>((resolve) => {
        const release = () => resolve(command(request.clientCommandId, 'confirmed', {
          kind: request.kind,
          platformMessageId: null,
        }));
        if (request.kind === 'typing_active_v1') {
          releaseTyping = release;
        } else if (request.kind === 'mark_chat_read_v1') {
          releaseMarkRead = release;
        }
      }),
    );
    const engine = createSendEngine({
      client: direct.client,
      hubCommandClient: { createOfapiCommand, getOfapiCommand: vi.fn() },
      data,
      messageGuard: allowMessageGuard,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: true }),
      sleep: () => Promise.resolve(),
      hubCommandPollIntervalMs: 0,
      hubCommandPollLimit: 1,
    });

    engine.typingActive(ACCT, CHAT);
    await engine.markRead(ACCT, CHAT);
    await vi.advanceTimersByTimeAsync(MARK_READ_DEBOUNCE_MS);
    await drain();
    expect(createOfapiCommand).toHaveBeenCalledTimes(2);

    let quiesced = false;
    const barrier = engine.quiesce().then(() => {
      // The confirmed mark-read's local mirror is part of the tracked task.
      expect(data.chats.get(ACCT, CHAT)?.unreadCount).toBe(0);
      quiesced = true;
    });
    await drain();
    expect(quiesced).toBe(false);

    releaseTyping?.();
    await drain();
    expect(quiesced).toBe(false);
    expect(data.chats.get(ACCT, CHAT)?.unreadCount).toBe(4);

    releaseMarkRead?.();
    await barrier;
    expect(quiesced).toBe(true);
    engine.dispose();
  });

  it('never performs FIRST-TIME intake for a stale row in verifyChat (A24 age bound)', async () => {
    const direct = makeStubClient();
    let clock = Date.parse('2026-06-20T00:00:00.000Z');
    let failIntake = true;
    const createOfapiCommand = vi.fn(async ({ command: request }) => {
      if (failIntake) {
        throw new Error('connection reset'); // untyped → unconfirmed, null coreCommandId
      }
      return command(request.clientCommandId, 'confirmed', { deduplicated: true });
    });
    const engine = createSendEngine({
      client: direct.client,
      hubCommandClient: { createOfapiCommand, getOfapiCommand: vi.fn() },
      data,
      messageGuard: allowMessageGuard,
      toMediaUrl,
      getSettings: () => Promise.resolve({ markAsReadOnOpen: false }),
      sleep: () => Promise.resolve(),
      now: () => clock,
    });

    const { localIds } = engine.sendParts({ accountId: ACCT, chatId: CHAT, parts: ['hello'] });
    await drain();
    expect(data.outbox.get(localIds[0] ?? '')).toMatchObject({
      state: 'unconfirmed',
      coreCommandId: null,
    });

    // 11 minutes later (past VERIFY_AUTO_STOP_AGE_MS) the kernel is healthy
    // again — a verify (incl. manual verifyNow) must NOT mint the command:
    // that is the hours-late silent stale send.
    failIntake = false;
    clock += 11 * 60_000;
    await engine.verifyChat(ACCT, CHAT);

    expect(createOfapiCommand).toHaveBeenCalledTimes(1);
    expect(data.outbox.get(localIds[0] ?? '')?.state).toBe('unconfirmed');
    engine.dispose();
  });
});
