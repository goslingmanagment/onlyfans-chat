// IPC surface of the hub wiring: accountPageLabels round-trip through
// cmd:settings.update / query:settings.get, query:sync.status carrying the
// hub stream state, and the onHubConfigChanged hook firing on hub-touching
// patches only (key-only writes publish no settings-table event — the hook is
// main's only reconnect signal).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataLayer } from '@main/db/index';
import type { HubSyncStatus } from '@main/sync/hub-sync';
import type { SyncProvider } from '@main/sync/provider';
import { createSettingsStore } from '@main/settings/store';
import { registerIpcHandlers } from '@main/ipc/handlers';
import type { IpcDeps } from '@main/ipc/handlers';
import type { SettingsVM, SyncStatusVM } from '../../src/preload/contract';
import { ACCT, memoryDataLayer } from './helpers';

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

function makeSyncStub(hubState: HubSyncStatus | null): IpcDeps['sync'] {
  const provider: SyncProvider = {
    start: () => undefined,
    stop: () => undefined,
    subscribe: () => () => undefined,
    refreshChat: async () => undefined,
    ensureChat: async () => true,
    openConversation: async () => undefined,
    closeConversation: () => undefined,
    setFocusedAccount: () => undefined,
    setWindowVisible: () => undefined,
    forceRefresh: async () => undefined,
    status: () => ({ freshness: {}, state: 'live' as const }),
  };
  return { ...provider, hubStatus: () => hubState };
}

function register(data: DataLayer, overrides: Partial<IpcDeps> = {}): { onHubConfigChanged: ReturnType<typeof vi.fn> } {
  handlers.clear();
  const onHubConfigChanged = vi.fn();
  const secrets = {
    hasSecret: async () => false,
    setSecret: async () => undefined,
    deleteSecret: async () => undefined,
  };
  registerIpcHandlers({
    data,
    settingsStore: createSettingsStore({ queries: data.settings, secrets }),
    sync: null,
    creditMeter: null,
    coordinator: null,
    send: null,
    purge: async () => undefined,
    onHubConfigChanged,
    ...overrides,
  });
  return { onHubConfigChanged };
}

describe('hub IPC wiring', () => {
  let data: DataLayer;

  beforeEach(() => {
    data = memoryDataLayer();
  });

  it('accountPageLabels round-trips through settings.update and settings.get', async () => {
    register(data);
    const updated = (await invoke('cmd:settings.update', {
      accountPageLabels: { [ACCT]: 'Lora' },
    })) as SettingsVM;
    expect(updated.accountPageLabels).toEqual({ [ACCT]: 'Lora' });

    const read = (await invoke('query:settings.get')) as SettingsVM;
    expect(read.accountPageLabels).toEqual({ [ACCT]: 'Lora' });
  });

  it('accountPageLabels defaults to {} and rejects non-string values', async () => {
    register(data);
    const vm = (await invoke('query:settings.get')) as SettingsVM;
    expect(vm.accountPageLabels).toEqual({});
    await expect(
      invoke('cmd:settings.update', { accountPageLabels: { [ACCT]: 7 } }),
    ).rejects.toThrow();
  });

  it('query:sync.status carries the hub stream state', async () => {
    register(data, { sync: makeSyncStub('live') });
    const status = (await invoke('query:sync.status')) as SyncStatusVM;
    expect(status.hub).toBe('live');

    register(data, { sync: makeSyncStub('auth-failed') });
    expect(((await invoke('query:sync.status')) as SyncStatusVM).hub).toBe('auth-failed');
  });

  it("reports hub 'off' when sync is absent, hub-unaware, or unconfigured", async () => {
    register(data); // sync: null
    expect(((await invoke('query:sync.status')) as SyncStatusVM).hub).toBe('off');

    // hubStatus() === null = hub mode off in HubAwareSync.
    register(data, { sync: makeSyncStub(null) });
    expect(((await invoke('query:sync.status')) as SyncStatusVM).hub).toBe('off');
  });

  it('onHubConfigChanged fires on key-only, URL-only, and combined hub patches', async () => {
    const { onHubConfigChanged } = register(data);
    await invoke('cmd:settings.update', { hubApiKey: 'agency_hub_core_x' });
    expect(onHubConfigChanged).toHaveBeenCalledTimes(1);
    await invoke('cmd:settings.update', { hubBaseUrl: 'https://hub.example.com' });
    expect(onHubConfigChanged).toHaveBeenCalledTimes(2);
    await invoke('cmd:settings.update', {
      hubBaseUrl: 'https://hub2.example.com',
      hubApiKey: 'agency_hub_core_y',
    });
    expect(onHubConfigChanged).toHaveBeenCalledTimes(3);
  });

  it('onHubConfigChanged stays silent on unrelated or invalid patches', async () => {
    const { onHubConfigChanged } = register(data);
    await invoke('cmd:settings.update', { debugMode: true });
    expect(onHubConfigChanged).not.toHaveBeenCalled();
    // Validation failure must not trigger a reconnect.
    await expect(
      invoke('cmd:settings.update', { hubBaseUrl: '', hubApiKey: 'k' }),
    ).rejects.toThrow();
    expect(onHubConfigChanged).not.toHaveBeenCalled();
  });
});
