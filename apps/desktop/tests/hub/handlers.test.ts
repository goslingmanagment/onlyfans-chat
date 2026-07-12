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
import type { SecretName } from '@main/secrets/keychain';
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

function makeSyncStub(
  hubState: HubSyncStatus | null,
  syncState: 'live' | 'degraded' | 'offline' = 'live',
): IpcDeps['sync'] {
  const provider: SyncProvider = {
    start: () => undefined,
    stop: () => undefined,
    subscribe: () => () => undefined,
    refreshChat: async () => undefined,
    readChatTailForUserOpen: async () => undefined,
    loadOlderMessagesForUserOpen: async () => ({ returned: 0, fresh: 0, hasOlder: false }),
    ensureChat: async () => true,
    openConversation: async () => undefined,
    closeConversation: () => undefined,
    setFocusedAccount: () => undefined,
    setWindowVisible: () => undefined,
    forceRefresh: async () => undefined,
    reconcileUnread: async () => undefined,
    status: () => ({ freshness: {}, state: syncState }),
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

function register(
  data: DataLayer,
  overrides: Partial<IpcDeps> = {},
): {
  onHubConfigChanged: ReturnType<typeof vi.fn>;
  onOfapiRuntimeConfigChanged: ReturnType<typeof vi.fn>;
} {
  handlers.clear();
  const onHubConfigChanged = vi.fn();
  const onOfapiRuntimeConfigChanged = vi.fn();
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
    onOfapiRuntimeConfigChanged,
    onHubConfigChanged,
    ...overrides,
  });
  return { onHubConfigChanged, onOfapiRuntimeConfigChanged };
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
    expect(status.state).toBe('live');
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

  it('keeps hub-live status live when suspended polling has auxiliary failures', async () => {
    register(data, { sync: makeSyncStub('live', 'offline') });
    const status = (await invoke('query:sync.status')) as SyncStatusVM;
    expect(status.hub).toBe('live');
    expect(status.state).toBe('live');
  });

  it("reports hub 'off' when sync is absent, hub-unaware, or unconfigured", async () => {
    register(data); // sync: null
    expect(((await invoke('query:sync.status')) as SyncStatusVM).hub).toBe('off');

    // hubStatus() === null = hub mode off in HubAwareSync.
    register(data, { sync: makeSyncStub(null) });
    expect(((await invoke('query:sync.status')) as SyncStatusVM).hub).toBe('off');
  });

  it("reports hub 'auth-failed' while the boot-auth latch is set and sync is null (I116-2)", async () => {
    // Boot activation failed CG-HUB-01 → no runtime, but the failure must be
    // visible: the auth banner + sign-out UI key off this status.
    register(data, { bootHubAuthFailed: () => true });
    expect(((await invoke('query:sync.status')) as SyncStatusVM).hub).toBe('auth-failed');

    // A live sync wins over the (stale) latch, and a cleared latch reports off.
    register(data, { sync: makeSyncStub('live'), bootHubAuthFailed: () => true });
    expect(((await invoke('query:sync.status')) as SyncStatusVM).hub).toBe('live');
    register(data, { bootHubAuthFailed: () => false });
    expect(((await invoke('query:sync.status')) as SyncStatusVM).hub).toBe('off');
  });

  it('splits read-runtime rebuilds from hub stream override rechecks', async () => {
    const { onHubConfigChanged, onOfapiRuntimeConfigChanged } = register(data);
    await invoke('cmd:settings.update', { hubApiKey: 'agency_hub_core_x' });
    expect(onOfapiRuntimeConfigChanged).toHaveBeenCalledTimes(1);
    expect(onHubConfigChanged).not.toHaveBeenCalled();
    await invoke('cmd:settings.update', { hubBaseUrl: 'http://localhost:4000' });
    expect(onOfapiRuntimeConfigChanged).toHaveBeenCalledTimes(2);
    // Stage 24: ofapiReadTransport is a frozen 'hub' literal — patching it is
    // a no-op and must NOT rebuild the runtime.
    await invoke('cmd:settings.update', { ofapiReadTransport: 'hub' });
    expect(onOfapiRuntimeConfigChanged).toHaveBeenCalledTimes(2);
    await invoke('cmd:settings.update', { hubModeOverride: 'polling' });
    expect(onHubConfigChanged).toHaveBeenCalledTimes(1);
    expect(onOfapiRuntimeConfigChanged).toHaveBeenCalledTimes(2);
    await invoke('cmd:settings.update', {
      hubBaseUrl: 'http://127.0.0.1:4000',
      hubApiKey: 'agency_hub_core_y',
    });
    expect(onOfapiRuntimeConfigChanged).toHaveBeenCalledTimes(3);
    expect(onHubConfigChanged).toHaveBeenCalledTimes(1);
  });

  it('onHubConfigChanged stays silent on unrelated or invalid patches', async () => {
    const { onHubConfigChanged, onOfapiRuntimeConfigChanged } = register(data);
    await invoke('cmd:settings.update', { debugMode: true });
    expect(onHubConfigChanged).not.toHaveBeenCalled();
    expect(onOfapiRuntimeConfigChanged).not.toHaveBeenCalled();
    // Validation failure must not trigger a reconnect.
    await expect(
      invoke('cmd:settings.update', { hubBaseUrl: '', hubApiKey: 'k' }),
    ).rejects.toThrow();
    expect(onHubConfigChanged).not.toHaveBeenCalled();
    expect(onOfapiRuntimeConfigChanged).not.toHaveBeenCalled();
  });

  // ── 4a: validate the hub read runtime BEFORE persisting the credential ──

  function statefulSecrets(seed: SecretName[] = []): {
    hasSecret: (name: SecretName) => Promise<boolean>;
    setSecret: (name: SecretName) => Promise<void>;
    deleteSecret: (name: SecretName) => Promise<void>;
  } {
    const values = new Set<SecretName>(seed);
    return {
      hasSecret: (name) => Promise.resolve(values.has(name)),
      setSecret: (name) => {
        values.add(name);
        return Promise.resolve();
      },
      deleteSecret: (name) => {
        values.delete(name);
        return Promise.resolve();
      },
    };
  }

  it('4a: rejects a hub credential save and persists nothing when validation fails', async () => {
    const settingsStore = createSettingsStore({ queries: data.settings, secrets: statefulSecrets() });
    const updateSpy = vi.spyOn(settingsStore, 'update');
    const probeReadRuntimeForPatch = vi.fn(async () => {
      throw new Error('CG-HUB-01: account bootstrap rejected (401)');
    });
    const { onOfapiRuntimeConfigChanged } = register(data, {
      settingsStore,
      probeReadRuntimeForPatch,
    });

    await expect(
      invoke('cmd:settings.update', { hubApiKey: 'agency_hub_core_bad' }),
    ).rejects.toThrow(/CG-HUB-01/);

    expect(probeReadRuntimeForPatch).toHaveBeenCalledTimes(1);
    // No persist: settingsStore.update never ran (SPEC §15 — no half-applied
    // credential), so keychain + settings table are untouched.
    expect(updateSpy).not.toHaveBeenCalled();
    expect(((await invoke('query:settings.get')) as SettingsVM).hasHubKey).toBe(false);
    expect(onOfapiRuntimeConfigChanged).not.toHaveBeenCalled();
  });

  it('4a: persists and rebuilds once the hub credential validates', async () => {
    const settingsStore = createSettingsStore({ queries: data.settings, secrets: statefulSecrets() });
    const probeReadRuntimeForPatch = vi.fn(async () => undefined);
    const { onOfapiRuntimeConfigChanged } = register(data, {
      settingsStore,
      probeReadRuntimeForPatch,
    });

    await invoke('cmd:settings.update', { hubApiKey: 'agency_hub_core_good' });

    expect(probeReadRuntimeForPatch).toHaveBeenCalledTimes(1);
    expect(onOfapiRuntimeConfigChanged).toHaveBeenCalledTimes(1);
    expect(((await invoke('query:settings.get')) as SettingsVM).hasHubKey).toBe(true);
  });

  it('4a: performs stale-token cleanup only after the replacement key persists', async () => {
    const order: string[] = [];
    const values = new Set<SecretName>(['hubDeviceToken']);
    const secrets = {
      hasSecret: (name: SecretName) => Promise.resolve(values.has(name)),
      setSecret: (name: SecretName) => {
        order.push(`persist:${name}`);
        values.add(name);
        return Promise.resolve();
      },
      deleteSecret: (name: SecretName) => {
        order.push(`cleanup:${name}`);
        values.delete(name);
        return Promise.resolve();
      },
    };
    const settingsStore = createSettingsStore({ queries: data.settings, secrets });
    const onOfapiRuntimeConfigChanged = vi.fn(async () => {
      order.push('rebuild');
    });
    const probeReadRuntimeForPatch = vi.fn(async () => {
      order.push('probe');
      return {
        afterPersist: async () => {
          await secrets.deleteSecret('hubDeviceToken');
        },
      };
    });
    register(data, { settingsStore, probeReadRuntimeForPatch, onOfapiRuntimeConfigChanged });

    const result = (await invoke('cmd:settings.update', {
      hubApiKey: 'agency_hub_core_replacement',
    })) as SettingsVM;

    expect(order).toEqual(['probe', 'persist:hubApiKey', 'cleanup:hubDeviceToken', 'rebuild']);
    expect(result.hasHubKey).toBe(true);
    expect(result.hasHubDeviceToken).toBe(false);
  });

  it('4a: never runs stale-token cleanup when replacement persistence fails', async () => {
    const cleanup = vi.fn(async () => undefined);
    const settingsStore: IpcDeps['settingsStore'] = {
      get: () => createSettingsStore({ queries: data.settings, secrets: statefulSecrets() }).get(),
      update: () => Promise.reject(new Error('keychain write failed')),
    };
    register(data, {
      settingsStore,
      probeReadRuntimeForPatch: async () => ({ afterPersist: cleanup }),
    });

    await expect(
      invoke('cmd:settings.update', { hubApiKey: 'agency_hub_core_replacement' }),
    ).rejects.toThrow(/keychain write failed/);
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('4a: non-hub settings patches skip the read-runtime probe', async () => {
    const probeReadRuntimeForPatch = vi.fn(async () => undefined);
    register(data, { probeReadRuntimeForPatch });

    await invoke('cmd:settings.update', { debugMode: true });

    expect(probeReadRuntimeForPatch).not.toHaveBeenCalled();
  });

  it('surfaces read-runtime activation failures after persisting validated settings', async () => {
    const onOfapiRuntimeConfigChanged = vi.fn(async () => {
      throw new Error('account bootstrap failed');
    });
    register(data, { onOfapiRuntimeConfigChanged });

    await expect(
      invoke('cmd:settings.update', { hubApiKey: 'agency_hub_core_x' }),
    ).rejects.toThrow(/account bootstrap failed/);
    expect(onOfapiRuntimeConfigChanged).toHaveBeenCalledTimes(1);
  });
});

describe('cmd:hub.signOutDevice', () => {
  let data: DataLayer;

  beforeEach(() => {
    data = memoryDataLayer();
  });

  function stubHubAuth(signOutDevice: () => Promise<void>): NonNullable<IpcDeps['hubAuth']> {
    return {
      issueDeviceToken: async () => {
        throw new Error('issueDeviceToken not exercised in this test');
      },
      signOutDevice,
    };
  }

  it('delegates the complete security-first token/runtime transition to hubAuth', async () => {
    // Real settings store + a stateful secrets fake, seeded with a device
    // token — mirrors an installed, signed-in chatter.
    const secretValues = new Set<SecretName>(['hubDeviceToken']);
    const secrets = {
      hasSecret: (name: SecretName) => Promise.resolve(secretValues.has(name)),
      setSecret: (name: SecretName) => {
        secretValues.add(name);
        return Promise.resolve();
      },
      deleteSecret: (name: SecretName) => {
        secretValues.delete(name);
        return Promise.resolve();
      },
    };
    const settingsStore = createSettingsStore({ queries: data.settings, secrets });
    const signOutDevice = vi.fn(() => secrets.deleteSecret('hubDeviceToken'));

    register(data, {
      settingsStore,
      hubAuth: stubHubAuth(signOutDevice),
    });

    expect(((await invoke('query:settings.get')) as SettingsVM).hasHubDeviceToken).toBe(true);

    await invoke('cmd:hub.signOutDevice');

    expect(signOutDevice).toHaveBeenCalledTimes(1);
    // The secret is gone — verified through the same public VM the renderer reads.
    expect(((await invoke('query:settings.get')) as SettingsVM).hasHubDeviceToken).toBe(false);
  });

  it('rejects when hub sign-in is unavailable in this build', async () => {
    register(data); // no hubAuth override -> deps.hubAuth is undefined
    await expect(invoke('cmd:hub.signOutDevice')).rejects.toThrow(/not available/i);
  });

  it('rejects an unexpected payload at the trust boundary', async () => {
    const signOutDevice = vi.fn(() => Promise.resolve());
    register(data, { hubAuth: stubHubAuth(signOutDevice) });

    await expect(invoke('cmd:hub.signOutDevice', { evil: true })).rejects.toThrow();
    expect(signOutDevice).not.toHaveBeenCalled();
  });
});
