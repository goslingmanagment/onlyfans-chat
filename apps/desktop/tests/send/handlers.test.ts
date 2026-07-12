// IPC trust boundary for the SPEC §7 channels: zod rejection of malformed
// args, clean degradation when no engine exists (no write transport), VM mapping
// for query:outbox.list, and the settings-table draft store.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataLayer } from '@main/db/index';
import type { SendEngine } from '@main/send/engine';
import { createSettingsStore } from '@main/settings/store';
import { registerIpcHandlers } from '@main/ipc/handlers';
import type { AiCoordinatorLike, IpcDeps } from '@main/ipc/handlers';
import { utcDayOf } from '@main/ipc/activity';
import {
  ACCEPTANCE_SPOOL_SETTINGS_KEY,
  enqueueAcceptanceEvent,
} from '@main/hub/acceptance-reporter';
import { ACCT, CHAT, memoryDataLayer } from './helpers';

type Handler = (event: unknown, args?: unknown) => unknown;
const handlers = vi.hoisted(() => new Map<string, Handler>());

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: Handler) => {
      handlers.set(channel, fn);
    },
  },
}));

// async wrapper: ipcMain.handle converts sync handler throws into rejections.
async function invoke(channel: string, args?: unknown): Promise<unknown> {
  const handler = handlers.get(channel);
  if (!handler) {
    throw new Error(`no handler registered for ${channel}`);
  }
  return handler({}, args);
}

function makeEngineStub(): SendEngine {
  return {
    sendParts: vi.fn(() => ({ localIds: ['local-1'], sequenceId: null })),
    sendPpv: vi.fn(() => ({ localId: 'local-ppv-1' })),
    retry: vi.fn(() => ({ localId: 'local-2' })),
    dismiss: vi.fn(),
    cancelSequence: vi.fn(),
    verifyChat: vi.fn(async () => undefined),
    handleSyncEvent: vi.fn(),
    reconcileOnBoot: vi.fn(async () => undefined),
    quiesce: vi.fn(async () => undefined),
    typingActive: vi.fn(),
    markRead: vi.fn(async () => undefined),
    unsend: vi.fn(async () => undefined),
    dispose: vi.fn(),
  };
}

function register(
  data: DataLayer,
  send: SendEngine | null,
  coordinator: IpcDeps['coordinator'] = null,
  overrides: Partial<IpcDeps> = {},
): void {
  handlers.clear();
  const secrets = {
    hasSecret: async () => false,
    setSecret: async () => undefined,
    deleteSecret: async () => undefined,
  };
  const deps: IpcDeps = {
    data,
    settingsStore: createSettingsStore({ queries: data.settings, secrets }),
    sync: null,
    creditMeter: null,
    coordinator,
    send,
    acceptance: {
      enqueue: vi.fn(),
      trackInserted: vi.fn(),
      consumeForSend: vi.fn(() => null),
    },
    purge: async () => undefined,
    ...overrides,
  };
  registerIpcHandlers(deps);
}

interface FakeCoordinatorContext {
  feature: string;
  requestId?: string | null;
  accountId?: string;
  chatId?: string;
  parts?: string[];
}

/** Minimal AiCoordinatorLike double: a preloaded completed-op registry (C5)
 * plus an observable markOperationAccepted so tests can assert the dedup. */
function makeFakeCoordinator(
  contexts: Record<string, FakeCoordinatorContext> = {},
): AiCoordinatorLike & { acceptedCalls: string[] } {
  const accepted = new Set<string>();
  const acceptedCalls: string[] = [];
  return {
    start: vi.fn(),
    cancel: vi.fn(),
    conversationOpened: vi.fn(),
    conversationClosed: vi.fn(),
    getOperationContext: (operationId) => {
      const ctx = contexts[operationId];
      if (ctx === undefined) {
        return null;
      }
      return {
        operationId,
        requestId: ctx.requestId ?? null,
        feature: ctx.feature,
        accountId: ctx.accountId ?? ACCT,
        chatId: ctx.chatId ?? CHAT,
        parts: ctx.parts ?? [],
      };
    },
    markOperationAccepted: (operationId) => {
      acceptedCalls.push(operationId);
      if (accepted.has(operationId)) {
        return false;
      }
      accepted.add(operationId);
      return true;
    },
    acceptedCalls,
  };
}

describe('send-channel IPC handlers', () => {
  let data: DataLayer;
  let engine: SendEngine;

  beforeEach(() => {
    data = memoryDataLayer();
    engine = makeEngineStub();
    register(data, engine);
  });

  it('cmd:send.message rejects malformed args before touching the engine', async () => {
    await expect(invoke('cmd:send.message', { accountId: ACCT, chatId: CHAT })).rejects.toThrow();
    await expect(
      invoke('cmd:send.message', { accountId: ACCT, chatId: CHAT, parts: 'not-an-array' }),
    ).rejects.toThrow();
    await expect(
      invoke('cmd:send.message', { accountId: ACCT, chatId: CHAT, parts: [] }),
    ).rejects.toThrow();
    await expect(
      invoke('cmd:send.message', { accountId: ACCT, chatId: CHAT, parts: [''] }),
    ).rejects.toThrow();
    await expect(invoke('cmd:send.message', null)).rejects.toThrow();
    expect(engine.sendParts).not.toHaveBeenCalled();
  });

  it('cmd:send.message passes validated args through and returns the engine result', async () => {
    const result = await invoke('cmd:send.message', {
      accountId: ACCT,
      chatId: CHAT,
      parts: ['hello', 'world'],
    });
    expect(engine.sendParts).toHaveBeenCalledWith({
      accountId: ACCT,
      chatId: CHAT,
      parts: ['hello', 'world'],
    });
    expect(result).toEqual({ localIds: ['local-1'], sequenceId: null });
  });

  it('send commands fail cleanly when no engine exists (no write transport)', async () => {
    register(data, null);
    await expect(
      invoke('cmd:send.message', { accountId: ACCT, chatId: CHAT, parts: ['hi'] }),
    ).rejects.toThrow(/Agency Hub/);
    await expect(
      invoke('cmd:send.retry', { accountId: ACCT, localId: 'L1', text: 'hi' }),
    ).rejects.toThrow(/Agency Hub/);
    // Advisory channels no-op silently (no write transport ⇒ composer is not live anyway).
    await expect(
      invoke('cmd:chat.typingActive', { accountId: ACCT, chatId: CHAT }),
    ).resolves.toBeUndefined();
    await expect(
      invoke('cmd:chat.markRead', { accountId: ACCT, chatId: CHAT }),
    ).resolves.toBeUndefined();
  });

  it('query:outbox.list maps rows to OutboxItemVM', async () => {
    data.outbox.insertMany([
      {
        localId: 'L1',
        accountId: ACCT,
        chatId: CHAT,
        text: 'hello',
        sequenceId: 'seq-1',
        partIndex: 1,
        retryOf: null,
        createdAt: '2026-06-11T12:00:00.000Z',
      },
    ]);
    const result = await invoke('query:outbox.list', { accountId: ACCT, chatId: CHAT });
    expect(result).toEqual([
      {
        localId: 'L1',
        chatId: CHAT,
        text: 'hello',
        transport: 'hub',
        state: 'queued',
        messageId: null,
        sequenceId: 'seq-1',
        partIndex: 1,
        errorCode: null,
        errorMessage: null,
        textHighlights: [],
        price: 0,
        mediaCount: 0,
        createdAt: '2026-06-11T12:00:00.000Z',
        updatedAt: '2026-06-11T12:00:00.000Z',
      },
    ]);
    await expect(invoke('query:outbox.list', { accountId: ACCT })).rejects.toThrow();
  });

  it('cmd:send.ppv validates args at the boundary and delegates to the engine', async () => {
    const result = await invoke('cmd:send.ppv', {
      accountId: ACCT,
      chatId: CHAT,
      text: 'caption',
      price: 25,
      mediaFiles: ['3866342509', 'ofapi_media_abc'],
      previews: ['3866342509'],
    });
    expect(engine.sendPpv).toHaveBeenCalledWith({
      accountId: ACCT,
      chatId: CHAT,
      text: 'caption',
      price: 25,
      mediaFiles: ['3866342509', 'ofapi_media_abc'],
      previews: ['3866342509'],
    });
    expect(result).toEqual({ localId: 'local-ppv-1' });

    // boundary rejections: empty mediaFiles, out-of-range price, missing fields
    await expect(
      invoke('cmd:send.ppv', { accountId: ACCT, chatId: CHAT, text: '', price: 25, mediaFiles: [], previews: [] }),
    ).rejects.toThrow();
    await expect(
      invoke('cmd:send.ppv', { accountId: ACCT, chatId: CHAT, text: '', price: 201, mediaFiles: ['1'], previews: [] }),
    ).rejects.toThrow();
    await expect(
      invoke('cmd:send.ppv', { accountId: ACCT, chatId: CHAT, text: '', price: -1, mediaFiles: ['1'], previews: [] }),
    ).rejects.toThrow();
    await expect(invoke('cmd:send.ppv', { accountId: ACCT, chatId: CHAT })).rejects.toThrow();
    expect(engine.sendPpv).toHaveBeenCalledTimes(1);
  });

  it('cmd:send.retry/dismiss/cancelSequence/verifyNow/unsend validate and delegate', async () => {
    await invoke('cmd:send.retry', { accountId: ACCT, localId: 'L1', text: 'edited' });
    expect(engine.retry).toHaveBeenCalledWith({ accountId: ACCT, localId: 'L1', text: 'edited' });
    await expect(invoke('cmd:send.retry', { accountId: ACCT, localId: 'L1', text: '' })).rejects.toThrow();

    await invoke('cmd:send.dismiss', { accountId: ACCT, localId: 'L1' });
    expect(engine.dismiss).toHaveBeenCalledWith({ accountId: ACCT, localId: 'L1' });

    await invoke('cmd:send.cancelSequence', { accountId: ACCT, sequenceId: 'seq-1' });
    expect(engine.cancelSequence).toHaveBeenCalledWith({ accountId: ACCT, sequenceId: 'seq-1' });

    await invoke('cmd:send.verifyNow', { accountId: ACCT, chatId: CHAT });
    expect(engine.verifyChat).toHaveBeenCalledWith(ACCT, CHAT);

    await invoke('cmd:message.unsend', { accountId: ACCT, chatId: CHAT, messageId: 'm1' });
    expect(engine.unsend).toHaveBeenCalledWith(ACCT, CHAT, 'm1');
    await expect(invoke('cmd:message.unsend', { accountId: ACCT, chatId: CHAT })).rejects.toThrow();
  });

  it('drafts: settings-table persistence under draft.<accountId>.<chatId>; empty text deletes', async () => {
    await expect(invoke('query:draft.get', { accountId: ACCT, chatId: CHAT })).resolves.toEqual({
      text: '',
    });

    await invoke('cmd:draft.set', { accountId: ACCT, chatId: CHAT, text: 'wip reply' });
    expect(data.settings.get(`draft.${ACCT}.${CHAT}`)).toBe('wip reply');
    await expect(invoke('query:draft.get', { accountId: ACCT, chatId: CHAT })).resolves.toEqual({
      text: 'wip reply',
    });

    await invoke('cmd:draft.set', { accountId: ACCT, chatId: CHAT, text: '' });
    expect(data.settings.get(`draft.${ACCT}.${CHAT}`)).toBeUndefined();
    await expect(invoke('query:draft.get', { accountId: ACCT, chatId: CHAT })).resolves.toEqual({
      text: '',
    });

    await expect(
      invoke('cmd:draft.set', { accountId: ACCT, chatId: CHAT, text: 42 }),
    ).rejects.toThrow();
  });

  it('cmd:ai.feedback counts one accepted operation using persisted payload state', async () => {
    const operationId = '00000000-0000-4000-8000-000000000012';
    data.aiSpendLog.recordRun({
      day: '2026-06-11',
      feature: 'fast-reply',
      isCacheHit: false,
      inputTokens: 100,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      outputTokens: 20,
      costMicroUsd: 1_000,
      chatId: CHAT,
    });
    data.db
      .prepare(
        `INSERT INTO usage_events (client_event_id, payload, created_at, attempts)
         VALUES (@id, @payload, @created_at, 0)`,
      )
      .run({
        id: operationId,
        payload: JSON.stringify({
          clientEventId: operationId,
          feature: 'fast-reply',
          model: 'test-model',
          inputTokens: 100,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          outputTokens: 20,
          totalTokens: 120,
          chatId: CHAT,
          durationMs: 500,
          isCacheHit: false,
          isRegeneration: false,
          completedAt: '2026-06-11T12:00:00.000Z',
        }),
        created_at: '2026-06-11T12:00:00.000Z',
      });

    await invoke('cmd:ai.feedback', {
      operationId,
      action: 'inserted',
      partIndex: 0,
      feature: 'ping',
    });
    register(data, engine); // restart/re-register: no in-memory accepted set survives
    await invoke('cmd:ai.feedback', {
      operationId,
      action: 'inserted',
      partIndex: 1,
      feature: 'ping',
    });

    expect(data.aiSpendLog.rowsSince('2026-06-11')[0]?.inserted).toBe(1);
    const row = data.db
      .prepare('SELECT payload FROM usage_events WHERE client_event_id = @id')
      .get({ id: operationId }) as { payload: string } | undefined;
    expect(row).toBeDefined();
    expect(JSON.parse(row?.payload ?? '{}')).toMatchObject({ accepted: 1, acceptedPart: 1 });
  });

  it('cmd:ai.feedback persists authoritative context and counts a kernel operation once', async () => {
    const operationId = '00000000-0000-4000-8000-000000000099';
    const coordinator = makeFakeCoordinator({
      [operationId]: { feature: 'fan-summary' },
    });
    register(data, engine, coordinator);
    const today = utcDayOf(Date.now());

    await invoke('cmd:ai.feedback', { operationId, action: 'inserted', partIndex: 0 });

    expect(data.aiSpendLog.rowsSince(today)).toMatchObject([{ feature: 'fan-summary', inserted: 1 }]);
    // No usage_events row exists for this op — the legacy UPDATE is a
    // harmless no-op (0 rows matched), not an error.
    const row = data.db
      .prepare('SELECT payload FROM usage_events WHERE client_event_id = @id')
      .get({ id: operationId });
    expect(row).toBeUndefined();

    // Second identical feedback for the same operation must not double-count
    // (mirrors the legacy usage_events row's `accepted` flag dedup).
    await invoke('cmd:ai.feedback', { operationId, action: 'inserted', partIndex: 0 });
    const rows = data.aiSpendLog.rowsSince(today);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.inserted).toBe(1);
    expect(data.aiAcceptance.get(operationId)).toMatchObject({
      operationId,
      feature: 'fan-summary',
      acceptedAt: expect.any(String),
    });
    // The coordinator's memory-only accepted bit is no longer the dedup source.
    expect(coordinator.acceptedCalls).toEqual([]);
  });

  it('uses durable operation metadata after coordinator replacement and ignores renderer feature', async () => {
    const operationId = '00000000-0000-4000-8000-0000000000aa';
    data.aiAcceptance.remember({
      operationId,
      requestId: 'req-durable',
      feature: 'fan-summary',
      accountId: ACCT,
      conversationId: CHAT,
      parts: ['durable answer'],
      day: utcDayOf(Date.now()),
      knownAt: new Date().toISOString(),
    });
    const today = utcDayOf(Date.now());
    const enqueue = vi.fn();
    const trackInserted = vi.fn();
    // The replacement coordinator has an empty in-memory registry; reporting
    // must be reconstructed from the durable authoritative record above.
    register(data, engine, makeFakeCoordinator(), {
      acceptance: {
        enqueue,
        trackInserted,
        consumeForSend: vi.fn(() => null),
      },
    });

    await invoke('cmd:ai.feedback', { operationId, action: 'inserted', partIndex: 0, feature: 'chat-review' });
    await invoke('cmd:ai.feedback', { operationId, action: 'inserted', partIndex: 0, feature: 'ping' });

    expect(data.aiSpendLog.rowsSince(today)).toMatchObject([{ feature: 'fan-summary', inserted: 1 }]);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
      operationId,
      requestId: 'req-durable',
      feature: 'fan-summary',
      accountId: ACCT,
      conversationId: CHAT,
      action: 'inserted',
    }));
    expect(trackInserted).toHaveBeenCalledTimes(1);
    expect(trackInserted).toHaveBeenCalledWith(ACCT, CHAT, expect.objectContaining({
      operationId,
      feature: 'fan-summary',
      text: 'durable answer',
    }));
  });

  it('does not consume durable feedback when no acceptance spool seam is available', async () => {
    const operationId = '00000000-0000-4000-8000-0000000000ad';
    data.aiAcceptance.remember({
      operationId,
      requestId: 'req-offline',
      feature: 'fast-reply',
      accountId: ACCT,
      conversationId: CHAT,
      parts: ['keep until durable enqueue'],
      day: utcDayOf(Date.now()),
      knownAt: new Date().toISOString(),
    });
    register(data, engine, makeFakeCoordinator(), { acceptance: null });

    await expect(
      invoke('cmd:ai.feedback', { operationId, action: 'inserted', partIndex: 0 }),
    ).rejects.toThrow(/temporarily unavailable/i);

    expect(data.aiAcceptance.get(operationId)).toMatchObject({
      acceptedAt: null,
      parts: ['keep until durable enqueue'],
    });
    expect(data.aiSpendLog.rowsSince(utcDayOf(Date.now()))).toEqual([]);
  });

  it('atomically rolls back the acceptance claim when durable spool enqueue fails', async () => {
    const operationId = '00000000-0000-4000-8000-0000000000ae';
    data.aiAcceptance.remember({
      operationId,
      requestId: 'req-atomic',
      feature: 'fast-reply',
      accountId: ACCT,
      conversationId: CHAT,
      parts: ['must remain retryable'],
      day: utcDayOf(Date.now()),
      knownAt: new Date().toISOString(),
    });
    register(data, engine, makeFakeCoordinator(), {
      acceptance: {
        enqueue: (acceptanceEvent) => {
          enqueueAcceptanceEvent(data, acceptanceEvent);
          throw new Error('simulated spool failure after write');
        },
        trackInserted: vi.fn(),
        consumeForSend: vi.fn(() => null),
      },
    });

    await expect(
      invoke('cmd:ai.feedback', { operationId, action: 'inserted', partIndex: 0 }),
    ).rejects.toThrow(/simulated spool failure/i);

    expect(data.aiAcceptance.get(operationId)).toMatchObject({
      acceptedAt: null,
      parts: ['must remain retryable'],
    });
    expect(data.settings.get(ACCEPTANCE_SPOOL_SETTINGS_KEY)).toBeUndefined();
    expect(data.aiSpendLog.rowsSince(utcDayOf(Date.now()))).toEqual([]);
  });

  it('rejects unknown kernel operations instead of trusting renderer-supplied feature', async () => {
    const operationId = '00000000-0000-4000-8000-0000000000ab';
    register(data, engine, makeFakeCoordinator());
    const today = utcDayOf(Date.now());

    await expect(
      invoke('cmd:ai.feedback', { operationId, action: 'copied', partIndex: 0, feature: 'chat-review' }),
    ).rejects.toThrow(/unknown or expired AI operation/i);
    expect(data.aiSpendLog.rowsSince(today)).toEqual([]);
  });

  it('preserves acceptance reporting when live coordinator context exists', async () => {
    const operationId = '00000000-0000-4000-8000-0000000000ac';
    const coordinator = makeFakeCoordinator({
      [operationId]: { feature: 'fast-reply', parts: ['hello'] },
    });
    const enqueue = vi.fn();
    const trackInserted = vi.fn();
    register(data, engine, coordinator, {
      acceptance: {
        enqueue,
        trackInserted,
        consumeForSend: vi.fn(() => null),
      },
    });

    await invoke('cmd:ai.feedback', { operationId, action: 'inserted', partIndex: 0 });
    await invoke('cmd:ai.feedback', { operationId, action: 'inserted', partIndex: 0 });

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
      operationId,
      feature: 'fast-reply',
      action: 'inserted',
    }));
    expect(trackInserted).toHaveBeenCalledWith(ACCT, CHAT, expect.objectContaining({
      operationId,
      text: 'hello',
    }));
    expect(trackInserted).toHaveBeenCalledTimes(1);
  });
});
