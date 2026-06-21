// IPC trust boundary for the manual in-chat refresh (cmd:conversation.refresh):
// zod arg validation + delegation to the deliberate single-chat read seam with
// the 'chat-refresh' ledger purpose (never the background message-tail path).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataLayer } from '@main/db/index';
import type { ActivitySync } from '@main/ipc/activity';
import { createSettingsStore } from '@main/settings/store';
import { registerIpcHandlers } from '@main/ipc/handlers';
import type { IpcDeps } from '@main/ipc/handlers';
import { memoryDataLayer } from '../db/helpers';

const ACCT = 'acct_test';
const CHAT = '101';

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
  if (!handler) throw new Error(`no handler registered for ${channel}`);
  return handler({}, args);
}

function makeSyncStub(): ActivitySync {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
    refreshChat: vi.fn(async () => undefined),
    readChatTailForUserOpen: vi.fn(async () => undefined),
    ensureChat: vi.fn(async () => true),
    openConversation: vi.fn(async () => undefined),
    closeConversation: vi.fn(),
    setFocusedAccount: vi.fn(),
    setWindowVisible: vi.fn(),
    forceRefresh: vi.fn(async () => undefined),
    reconcileUnread: vi.fn(async () => undefined),
    status: vi.fn(() => ({ freshness: {}, state: 'live' as const })),
  };
}

describe('cmd:conversation.refresh IPC handler', () => {
  let data: DataLayer;
  let sync: ActivitySync;

  beforeEach(() => {
    handlers.clear();
    data = memoryDataLayer();
    sync = makeSyncStub();
    const secrets = {
      hasSecret: async () => false,
      setSecret: async () => undefined,
      deleteSecret: async () => undefined,
    };
    const deps: IpcDeps = {
      data,
      settingsStore: createSettingsStore({ queries: data.settings, secrets }),
      sync,
      creditMeter: null,
      coordinator: null,
      send: null,
      purge: async () => undefined,
    };
    registerIpcHandlers(deps);
  });

  it('rejects malformed args before touching sync', async () => {
    await expect(invoke('cmd:conversation.refresh', { accountId: ACCT })).rejects.toThrow();
    await expect(invoke('cmd:conversation.refresh', { chatId: CHAT })).rejects.toThrow();
    await expect(invoke('cmd:conversation.refresh', { accountId: '', chatId: CHAT })).rejects.toThrow();
    await expect(invoke('cmd:conversation.refresh', null)).rejects.toThrow();
    expect(sync.readChatTailForUserOpen).not.toHaveBeenCalled();
  });

  it('delegates a validated refresh to readChatTailForUserOpen with the chat-refresh purpose', async () => {
    await invoke('cmd:conversation.refresh', { accountId: ACCT, chatId: CHAT });
    expect(sync.readChatTailForUserOpen).toHaveBeenCalledWith(ACCT, CHAT, 'chat-refresh');
    // Manual refresh must NOT route through openConversation (focus/sweep/AI
    // coordinator side effects) or the account-wide forceRefresh deep sweep.
    expect(sync.openConversation).not.toHaveBeenCalled();
    expect(sync.forceRefresh).not.toHaveBeenCalled();
  });
});
