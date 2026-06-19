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
    readChatTailForUserOpen: async () => undefined,
    ensureChat: async () => true,
    openConversation: async () => undefined,
    closeConversation: () => undefined,
    setFocusedAccount: () => undefined,
    setWindowVisible: () => undefined,
    forceRefresh: async () => undefined,
    status: () => ({ freshness: {}, state: 'live' as const }),
  };
  return {
    ...provider,
    hubStatus: () => hubState,
    hubMode: () => (hubState === 'live' ? 'live' : hubState === null || hubState === 'stopped' ? 'off' : 'degraded'),
    hubActivity: () => ({
      lastEventAt: Date.parse('2026-06-11T12:00:00Z'),
      lastEventType: 'messageReceived',
      eventsToday: 7,
      appliedEventsToday: 6,
      fallbackEventsToday: 1,
      droppedEventsToday: 0,
      eventsByTypeToday: { messageReceived: 7 },
      appliedByTypeToday: { messageReceived: 6 },
      fallbackByTypeToday: { messageReceived: 1 },
      droppedByTypeToday: {},
      fallbackByReasonToday: { 'hub-id-only-fallback': 1 },
      lifetime: {
        received: { total: 70, byType: { messageReceived: 70 } },
        applied: { total: 63, byType: { messageReceived: 63 } },
        fallback: { total: 7, byType: { messageReceived: 7 } },
        dropped: { total: 0, byType: {} },
        fallbackByReason: { 'hub-id-only-fallback': 7 },
      },
      lastFallbackReason: 'hub-id-only-fallback',
      liveSinceMs: Date.parse('2026-06-11T11:00:00Z'),
      statusChangedAtMs: Date.parse('2026-06-11T11:00:00Z'),
      droppedFrames: 2,
    }),
  };
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
    expect(status.hubMode).toBe('live');
    expect(status.hubModeOverride).toBe('auto');
    expect(status.hubLastEventAt).toBe('2026-06-11T12:00:00.000Z');
    expect(status.hubEventsToday).toBe(7);
    expect(status.hubAppliedEventsToday).toBe(6);
    expect(status.hubFallbackEventsToday).toBe(1);
    expect(status.hubDroppedEventsToday).toBe(2);
    expect(status.hubEventsByTypeToday).toEqual({ messageReceived: 7 });
    expect(status.hubAppliedByTypeToday).toEqual({ messageReceived: 6 });
    expect(status.hubFallbackByTypeToday).toEqual({ messageReceived: 1 });
    expect(status.hubFallbackByReasonToday).toEqual({ 'hub-id-only-fallback': 1 });
    expect(status.hubLifetime).toMatchObject({
      received: { total: 70, byType: { messageReceived: 70 } },
      applied: { total: 63, byType: { messageReceived: 63 } },
      fallback: { total: 7, byType: { messageReceived: 7 } },
      dropped: { total: 0, byType: {} },
      fallbackByReason: { 'hub-id-only-fallback': 7 },
    });
    expect(status.hubLastFallbackReason).toBe('hub-id-only-fallback');

    register(data, { sync: makeSyncStub('auth-failed') });
    const failed = (await invoke('query:sync.status')) as SyncStatusVM;
    expect(failed.hub).toBe('auth-failed');
    expect(failed.hubMode).toBe('degraded');
  });

  it("reports hub 'off' when sync is absent, hub-unaware, or unconfigured", async () => {
    register(data); // sync: null
    expect(((await invoke('query:sync.status')) as SyncStatusVM).hub).toBe('off');

    // hubStatus() === null = hub mode off in HubAwareSync.
    register(data, { sync: makeSyncStub(null) });
    expect(((await invoke('query:sync.status')) as SyncStatusVM).hub).toBe('off');
  });

  it('onHubConfigChanged fires on key, URL, read transport, override, and combined patches', async () => {
    const { onHubConfigChanged } = register(data);
    await invoke('cmd:settings.update', { hubApiKey: 'agency_hub_core_x' });
    expect(onHubConfigChanged).toHaveBeenCalledTimes(1);
    await invoke('cmd:settings.update', { hubBaseUrl: 'https://hub.example.com' });
    expect(onHubConfigChanged).toHaveBeenCalledTimes(2);
    await invoke('cmd:settings.update', { ofapiReadTransport: 'hub' });
    expect(onHubConfigChanged).toHaveBeenCalledTimes(3);
    await invoke('cmd:settings.update', { hubModeOverride: 'polling' });
    expect(onHubConfigChanged).toHaveBeenCalledTimes(4);
    await invoke('cmd:settings.update', {
      hubBaseUrl: 'https://hub2.example.com',
      hubApiKey: 'agency_hub_core_y',
    });
    expect(onHubConfigChanged).toHaveBeenCalledTimes(5);
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
