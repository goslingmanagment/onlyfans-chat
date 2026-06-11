// IPC trust boundary for the SPEC §7 channels: zod rejection of malformed
// args, clean degradation when no engine exists (no OFAPI key), VM mapping
// for query:outbox.list, and the settings-table draft store.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataLayer } from '@main/db/index';
import type { SendEngine } from '@main/send/engine';
import { createSettingsStore } from '@main/settings/store';
import { registerIpcHandlers } from '@main/ipc/handlers';
import type { IpcDeps } from '@main/ipc/handlers';
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
    retry: vi.fn(() => ({ localId: 'local-2' })),
    dismiss: vi.fn(),
    cancelSequence: vi.fn(),
    verifyChat: vi.fn(async () => undefined),
    handleSyncEvent: vi.fn(),
    reconcileOnBoot: vi.fn(async () => undefined),
    typingActive: vi.fn(),
    markRead: vi.fn(async () => undefined),
    unsend: vi.fn(async () => undefined),
    dispose: vi.fn(),
  };
}

function register(data: DataLayer, send: SendEngine | null): void {
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
    coordinator: null,
    send,
    purge: async () => undefined,
  };
  registerIpcHandlers(deps);
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

  it('send commands fail cleanly when no engine exists (no OFAPI key)', async () => {
    register(data, null);
    await expect(
      invoke('cmd:send.message', { accountId: ACCT, chatId: CHAT, parts: ['hi'] }),
    ).rejects.toThrow(/OFAPI key/);
    await expect(
      invoke('cmd:send.retry', { accountId: ACCT, localId: 'L1', text: 'hi' }),
    ).rejects.toThrow(/OFAPI key/);
    // Advisory channels no-op silently (no key ⇒ composer is not live anyway).
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
        state: 'queued',
        messageId: null,
        sequenceId: 'seq-1',
        partIndex: 1,
        errorCode: null,
        errorMessage: null,
        textHighlights: [],
        createdAt: '2026-06-11T12:00:00.000Z',
        updatedAt: '2026-06-11T12:00:00.000Z',
      },
    ]);
    await expect(invoke('query:outbox.list', { accountId: ACCT })).rejects.toThrow();
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
});
