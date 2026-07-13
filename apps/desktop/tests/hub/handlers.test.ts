// IPC surface of the hub wiring: accountPageLabels round-trip through
// cmd:settings.update / query:settings.get, query:sync.status carrying the
// hub stream state, and the onHubConfigChanged hook firing on hub-touching
// patches only (key-only writes publish no settings-table event — the hook is
// main's only reconnect signal).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_AGENCY_HUB_BASE_URL } from '@chatgoose/shared';
import { HubError } from '@chatgoose/shared/hub/index';
import type { DataLayer } from '@main/db/index';
import type { HubSyncStatus } from '@main/sync/hub-sync';
import type { SyncProvider } from '@main/sync/provider';
import { createSettingsStore } from '@main/settings/store';
import { loadPersonalities, registerIpcHandlers } from '@main/ipc/handlers';
import type { IpcDeps } from '@main/ipc/handlers';
import {
  createPendingPersonaArchive,
  createPendingPersonaUpsert,
  loadPendingPersonaIntents,
  personaPayloadDigest,
  personaStorageScopeForHub,
  storePendingPersonaIntent,
} from '@main/personas/pending';
import {
  createRuntimeMutationQueue,
  createSerializedCredentialLifecycle,
  replaceRuntimeSecurityFirst,
} from '@main/runtime-activation';
import type { SecretName } from '@main/secrets/keychain';
import type { SettingsVM, SyncStatusVM } from '../../src/preload/contract';
import { ACCT, memoryDataLayer, seedAccount } from './helpers';

const TEST_PERSONA_SCOPE = personaStorageScopeForHub(DEFAULT_AGENCY_HUB_BASE_URL);
const TEST_PERSONA_SCOPE_B = personaStorageScopeForHub('http://localhost:3100');

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
async function invoke(channel: string, args?: unknown, event: unknown = {}): Promise<unknown> {
  const handler = handlers.get(channel);
  if (!handler) {
    throw new Error(`no handler registered for ${channel}`);
  }
  return handler(event, args);
}

function makeSyncStub(
  hubState: HubSyncStatus | null,
  syncState: 'live' | 'degraded' | 'offline' = 'live',
): IpcDeps['sync'] {
  const provider: SyncProvider = {
    start: () => undefined,
    stop: () => Promise.resolve(),
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
  const secretValues = new Map<SecretName, string>();
  const secrets = {
    getSecret: async (name: SecretName) => secretValues.get(name) ?? null,
    hasSecret: async (name: SecretName) => secretValues.has(name),
    setSecret: async (name: SecretName, value: string) => {
      secretValues.set(name, value);
    },
    deleteSecret: async (name: SecretName) => {
      secretValues.delete(name);
    },
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

  it('routes renderer readiness to the sending WebContents id', async () => {
    const onRendererReady = vi.fn();
    register(data, { onRendererReady });
    await invoke('cmd:app.rendererReady', undefined, { sender: { id: 42 } });
    expect(onRendererReady).toHaveBeenCalledWith(42);
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

  it('skips probe/rebuild for an unchanged hub URL but preserves real URL and key transitions', async () => {
    const probeReadRuntimeForPatch = vi.fn(async () => undefined);
    const { onOfapiRuntimeConfigChanged } = register(data, { probeReadRuntimeForPatch });
    const current = (await invoke('query:settings.get')) as SettingsVM;

    await invoke('cmd:settings.update', {
      hubBaseUrl: current.hubBaseUrl,
      accountPageLabels: { [ACCT]: 'Lora' },
    });
    expect(probeReadRuntimeForPatch).not.toHaveBeenCalled();
    expect(onOfapiRuntimeConfigChanged).not.toHaveBeenCalled();
    expect(((await invoke('query:settings.get')) as SettingsVM).accountPageLabels).toEqual({
      [ACCT]: 'Lora',
    });

    await invoke('cmd:settings.update', { hubBaseUrl: 'http://localhost:4000' });
    await invoke('cmd:settings.update', { hubApiKey: 'agency_hub_core_changed' });
    expect(probeReadRuntimeForPatch).toHaveBeenCalledTimes(2);
    expect(onOfapiRuntimeConfigChanged).toHaveBeenCalledTimes(2);
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
    getSecret: (name: SecretName) => Promise<string | null>;
    hasSecret: (name: SecretName) => Promise<boolean>;
    setSecret: (name: SecretName, value: string) => Promise<void>;
    deleteSecret: (name: SecretName) => Promise<void>;
  } {
    const values = new Map<SecretName, string>(seed.map((name) => [name, `value-${name}`]));
    return {
      getSecret: (name) => Promise.resolve(values.get(name) ?? null),
      hasSecret: (name) => Promise.resolve(values.has(name)),
      setSecret: (name, value) => {
        values.set(name, value);
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

  it('rejects a Hub URL switch with a stored device token before IPC mutates credentials or rebuilds', async () => {
    const values = new Map<SecretName, string>([
      ['hubApiKey', 'agency_hub_core_old'],
      ['hubDeviceToken', 'agency_hub_device_live'],
    ]);
    const setSecret = vi.fn(async (name: SecretName, value: string) => {
      values.set(name, value);
    });
    const deleteSecret = vi.fn(async (name: SecretName) => {
      values.delete(name);
    });
    const settingsStore = createSettingsStore({
      queries: data.settings,
      secrets: {
        getSecret: async (name) => values.get(name) ?? null,
        hasSecret: async (name) => values.has(name),
        setSecret,
        deleteSecret,
      },
    });
    const { onOfapiRuntimeConfigChanged } = register(data, { settingsStore });

    await expect(invoke('cmd:settings.update', {
      hubBaseUrl: 'http://localhost:4000',
      hubApiKey: 'agency_hub_core_new',
    })).rejects.toThrow(/sign out.*device token.*Hub URL/i);

    expect(setSecret).not.toHaveBeenCalled();
    expect(deleteSecret).not.toHaveBeenCalled();
    expect(onOfapiRuntimeConfigChanged).not.toHaveBeenCalled();
    expect(values.get('hubApiKey')).toBe('agency_hub_core_old');
    expect(values.get('hubDeviceToken')).toBe('agency_hub_device_live');
    expect((await settingsStore.get()).hubBaseUrl).toBe('https://gosling-agency.ru');
  });

  it('4a: commits proven-dead-token cleanup before replacement-key promotion', async () => {
    const order: string[] = [];
    const values = new Map<SecretName, string>([['hubDeviceToken', 'device-dead']]);
    const secrets = {
      getSecret: (name: SecretName) => Promise.resolve(values.get(name) ?? null),
      hasSecret: (name: SecretName) => Promise.resolve(values.has(name)),
      setSecret: (name: SecretName, value: string) => {
        order.push(`persist:${name}`);
        values.set(name, value);
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
        deleteDeadDeviceToken: true,
        afterCommit: async () => {
          order.push('commit');
        },
      };
    });
    register(data, { settingsStore, probeReadRuntimeForPatch, onOfapiRuntimeConfigChanged });

    const result = (await invoke('cmd:settings.update', {
      hubApiKey: 'agency_hub_core_replacement',
    })) as SettingsVM;

    expect(order).toEqual([
      'probe',
      'persist:hubApiKeyStaged',
      'cleanup:hubDeviceToken',
      'persist:hubApiKey',
      'cleanup:hubApiKeyStaged',
      'commit',
      'rebuild',
    ]);
    expect(result.hasHubKey).toBe(true);
    expect(result.hasHubDeviceToken).toBe(false);
  });

  it('4a: carries proven-dead-token cleanup inside the durable settings commit', async () => {
    const update = vi.fn(async (_patch: unknown, options?: { deleteDeadHubDeviceToken?: boolean }) => {
      expect(options?.deleteDeadHubDeviceToken).toBe(true);
      throw new Error('must not persist');
    });
    const backingStore = createSettingsStore({ queries: data.settings, secrets: statefulSecrets() });
    const settingsStore: IpcDeps['settingsStore'] = {
      get: () => backingStore.get(),
      getHubConnection: () => backingStore.getHubConnection(),
      update,
      runCredentialMutation: (task) => task(),
    };
    register(data, {
      settingsStore,
      probeReadRuntimeForPatch: async () => ({ deleteDeadDeviceToken: true }),
    });

    await expect(
      invoke('cmd:settings.update', { hubApiKey: 'agency_hub_core_replacement' }),
    ).rejects.toThrow(/must not persist/);
    expect(update).toHaveBeenCalledTimes(1);
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

  it('serializes stale-token cleanup with sign-out and the next sign-in', async () => {
    const queue = createRuntimeMutationQueue();
    const order: string[] = [];
    let storedDeviceToken: string | null = 'device-a';
    let hasHubKey = false;
    let stagedHubApiKey: string | null = null;
    let mintCount = 0;
    let releaseCleanup: (() => void) | undefined;
    let cleanupStarted: (() => void) | undefined;
    const cleanupStartedPromise = new Promise<void>((resolve) => {
      cleanupStarted = resolve;
    });
    const secrets = {
      getSecret: async (name: SecretName) => {
        if (name === 'hubDeviceToken') return storedDeviceToken;
        if (name === 'hubApiKey') return hasHubKey ? 'hub-key' : null;
        if (name === 'hubApiKeyStaged') return stagedHubApiKey;
        return null;
      },
      hasSecret: async (name: SecretName) => {
        if (name === 'hubDeviceToken') return storedDeviceToken !== null;
        if (name === 'hubApiKey') return hasHubKey;
        return name === 'hubApiKeyStaged' && stagedHubApiKey !== null;
      },
      setSecret: async (name: SecretName, value: string) => {
        if (name === 'hubApiKey') {
          hasHubKey = true;
        } else if (name === 'hubApiKeyStaged') {
          stagedHubApiKey = value;
        }
      },
      deleteSecret: async (name: SecretName) => {
        if (name === 'hubDeviceToken') {
          order.push('cleanup:start');
          cleanupStarted?.();
          await new Promise<void>((resolve) => {
            releaseCleanup = () => {
              order.push('cleanup:delete');
              resolve();
            };
          });
          storedDeviceToken = null;
        } else if (name === 'hubApiKeyStaged') {
          stagedHubApiKey = null;
        }
      },
    };
    const settingsStore = createSettingsStore({ queries: data.settings, secrets });
    const lifecycle = createSerializedCredentialLifecycle<string, string>({
      queue,
      readStoredCredential: async () => storedDeviceToken,
      issueAndStore: async (credential) => {
        mintCount += 1;
        order.push(`issue:${credential}`);
        storedDeviceToken = credential;
        return credential;
      },
      activateStoredCredential: async () => {
        order.push('activate:stored');
      },
      signOutTransition: async () => {
        const captured = storedDeviceToken;
        await replaceRuntimeSecurityFirst({
          deactivate: async () => {
            order.push('deactivate');
          },
          ...(captured !== null
            ? {
                revokeCredential: async () => {
                  order.push(`revoke:${captured}`);
                },
              }
            : {}),
          deleteCredential: async () => {
            order.push(`delete:${storedDeviceToken ?? 'none'}`);
            storedDeviceToken = null;
          },
          activateFallback: async () => {
            order.push('activate:fallback');
          },
        });
      },
    });
    register(data, {
      settingsStore,
      runReadRuntimeMutation: (task) => queue.run(task),
      probeReadRuntimeForPatch: async () => ({ deleteDeadDeviceToken: true }),
      onOfapiRuntimeConfigChanged: async () => {
        order.push('rebuild');
      },
    });

    const settingsUpdate = invoke('cmd:settings.update', {
      hubApiKey: 'agency_hub_core_replacement',
    });
    await cleanupStartedPromise;
    const signOut = lifecycle.signOut();
    const nextSignIn = lifecycle.issue('device-b');
    await Promise.resolve();
    expect(mintCount).toBe(0);

    releaseCleanup?.();
    await settingsUpdate;
    await signOut;
    await expect(nextSignIn).resolves.toBe('device-b');
    expect(storedDeviceToken).toBe('device-b');
    expect(mintCount).toBe(1);
    expect(order).toEqual([
      'cleanup:start',
      'cleanup:delete',
      'rebuild',
      'deactivate',
      'delete:none',
      'activate:fallback',
      'issue:device-b',
      'activate:stored',
    ]);
  });
});

describe('persona cache ordering', () => {
  let data: DataLayer;

  beforeEach(() => {
    data = memoryDataLayer();
  });

  it('preserves pre-cutover personas that do not have an updatedAt cache field', () => {
    data.settings.set('personalities', [
      { id: 'custom:legacy', name: 'Legacy', content: 'legacy prompt' },
    ]);

    expect(loadPersonalities(data, null)).toEqual([
      { id: 'custom:legacy', name: 'Legacy', content: 'legacy prompt', updatedAt: 0 },
    ]);
  });

  it('does not publish a settings invalidation for an identical remote list', async () => {
    let remote = [{
      key: 'custom:stable',
      displayName: 'Stable',
      systemBlock: 'version one',
      updatedAt: '2026-07-13T12:00:00.000Z',
      version: 1,
    }];
    const personas: NonNullable<IpcDeps['personas']> = {
      list: vi.fn(async () => remote),
      upsert: vi.fn(async () => undefined),
      archive: vi.fn(async () => undefined),
    };
    const settingsEvents: Array<{ scope: string }> = [];
    data.bus.subscribe((events) => settingsEvents.push(...events));
    register(data, { personas });

    await invoke('query:personalities.list');
    data.bus.flushNow();
    expect(settingsEvents.filter((event) => event.scope === 'settings')).toHaveLength(1);
    settingsEvents.length = 0;

    await invoke('query:personalities.list');
    data.bus.flushNow();
    expect(settingsEvents.filter((event) => event.scope === 'settings')).toEqual([]);

    remote = [{
      ...remote[0]!,
      systemBlock: 'version two',
      updatedAt: '2026-07-13T12:01:00.000Z',
      version: 2,
    }];
    await invoke('query:personalities.list');
    data.bus.flushNow();
    expect(settingsEvents.filter((event) => event.scope === 'settings')).toHaveLength(1);
    expect(loadPersonalities(data, TEST_PERSONA_SCOPE)).toEqual([
      expect.objectContaining({ id: 'custom:stable', content: 'version two', remoteVersion: 2 }),
    ]);
  });

  it('discards a delayed remote list snapshot after a newer save commits', async () => {
    data.settings.set('personalities', [
      { id: 'custom:one', name: 'One', content: 'old prompt', updatedAt: 1 },
    ]);
    let resolveList!: (value: Array<{
      key: string;
      displayName: string;
      systemBlock: string;
      updatedAt: string;
    }>) => void;
    const listResult = new Promise<Array<{
      key: string;
      displayName: string;
      systemBlock: string;
      updatedAt: string;
    }>>((resolve) => {
      resolveList = resolve;
    });
    const personas: NonNullable<IpcDeps['personas']> = {
      list: vi.fn(() => listResult),
      upsert: vi.fn(async () => undefined),
      archive: vi.fn(async () => undefined),
    };
    register(data, { personas });

    const delayedList = invoke('query:personalities.list');
    await vi.waitFor(() => expect(personas.list).toHaveBeenCalledTimes(1));
    await invoke('cmd:personalities.save', {
      id: 'custom:one',
      name: 'One',
      content: 'new prompt',
      updatedAt: 2,
    });
    resolveList([
      {
        key: 'custom:one',
        displayName: 'One',
        systemBlock: 'old prompt',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ]);

    await expect(delayedList).resolves.toEqual([
      { id: 'custom:one', name: 'One', content: 'new prompt', updatedAt: 2 },
    ]);
    expect(loadPersonalities(data, TEST_PERSONA_SCOPE)).toEqual([
      { id: 'custom:one', name: 'One', content: 'new prompt', updatedAt: 2 },
    ]);
  });

  it('does not let an older overlapping list response replace a newer one', async () => {
    const resolvers: Array<(value: Array<{
      key: string;
      displayName: string;
      systemBlock: string;
      updatedAt: string;
    }>) => void> = [];
    const personas: NonNullable<IpcDeps['personas']> = {
      list: vi.fn(() => new Promise<Array<{
        key: string;
        displayName: string;
        systemBlock: string;
        updatedAt: string;
      }>>((resolve) => resolvers.push(resolve))),
      upsert: vi.fn(async () => undefined),
      archive: vi.fn(async () => undefined),
    };
    register(data, { personas });

    const olderRequest = invoke('query:personalities.list');
    const newerRequest = invoke('query:personalities.list');
    await vi.waitFor(() => expect(resolvers).toHaveLength(2));
    resolvers[1]?.([
      {
        key: 'custom:one',
        displayName: 'One',
        systemBlock: 'newer prompt',
        updatedAt: '2026-06-02T00:00:00.000Z',
      },
    ]);
    await newerRequest;
    resolvers[0]?.([
      {
        key: 'custom:one',
        displayName: 'One',
        systemBlock: 'older prompt',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ]);

    await expect(olderRequest).resolves.toEqual([
      {
        id: 'custom:one',
        name: 'One',
        content: 'newer prompt',
        updatedAt: Date.parse('2026-06-02T00:00:00.000Z'),
      },
    ]);
    expect(loadPersonalities(data, TEST_PERSONA_SCOPE)[0]?.content).toBe('newer prompt');
  });

  it('prunes an account mapping when the authoritative Core list no longer contains its persona', async () => {
    seedAccount(data);
    const local = {
      id: 'custom:archived-elsewhere',
      name: 'Archived elsewhere',
      content: 'stale local prompt',
      updatedAt: 1,
    };
    data.settings.set('personalities', [local]);
    const personas: NonNullable<IpcDeps['personas']> = {
      // Core active-list omission is the reachable result of another device
      // archiving this key.
      list: vi.fn(async () => []),
      upsert: vi.fn(async () => undefined),
      archive: vi.fn(async () => undefined),
    };
    register(data, { personas });
    await invoke('cmd:mappings.set', { accountId: ACCT, personalityId: local.id });
    expect((await invoke('query:settings.get') as SettingsVM).accountMappings)
      .toEqual({ [ACCT]: local.id });
    expect(await invoke('query:accounts.list')).toEqual([
      expect.objectContaining({ id: ACCT, personalityId: local.id }),
    ]);

    await expect(invoke('query:personalities.list')).resolves.toEqual([]);

    expect((await invoke('query:settings.get') as SettingsVM).accountMappings).toEqual({});
    expect(await invoke('query:accounts.list')).toEqual([
      expect.objectContaining({ id: ACCT, personalityId: null }),
    ]);
  });

  it('keeps a transient failed upsert over stale lists and clears it only after replay succeeds', async () => {
    let offline = true;
    let remote = [
      {
        key: 'builtin:lora',
        displayName: 'Lora',
        systemBlock: 'builtin prompt',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
      {
        key: 'custom:one',
        displayName: 'One',
        systemBlock: 'old prompt',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ];
    data.settings.set('personalities', [
      { id: 'custom:one', name: 'One', content: 'old prompt', updatedAt: 1 },
    ]);
    const personas: NonNullable<IpcDeps['personas']> = {
      list: vi.fn(async () => remote),
      upsert: vi.fn(async (args) => {
        if (offline) throw new Error('offline');
        remote = remote.map((persona) => persona.key === args.key
          ? {
              key: args.key,
              displayName: args.displayName,
              systemBlock: args.systemBlock,
              updatedAt: '2026-06-02T00:00:00.000Z',
            }
          : persona);
      }),
      archive: vi.fn(async () => undefined),
    };
    register(data, { personas });

    await expect(invoke('cmd:personalities.save', {
      id: 'custom:one',
      name: 'One',
      content: 'new prompt',
      updatedAt: 2,
    })).resolves.toEqual([
      { id: 'custom:one', name: 'One', content: 'new prompt', updatedAt: 2 },
    ]);
    expect(loadPendingPersonaIntents(data.settings, TEST_PERSONA_SCOPE)).toHaveLength(1);

    const staleList = await invoke('query:personalities.list') as Array<{ id: string; content: string }>;
    expect(staleList.find((persona) => persona.id === 'custom:one')?.content).toBe('new prompt');
    expect(loadPersonalities(data, TEST_PERSONA_SCOPE).find((persona) => persona.id === 'custom:one')?.content).toBe('new prompt');
    expect(loadPendingPersonaIntents(data.settings, TEST_PERSONA_SCOPE)).toHaveLength(1);

    offline = false;
    const repaired = await invoke('query:personalities.list') as Array<{ id: string; content: string }>;
    expect(repaired.find((persona) => persona.id === 'custom:one')?.content).toBe('new prompt');
    expect(loadPendingPersonaIntents(data.settings, TEST_PERSONA_SCOPE)).toEqual([]);
    expect(personas.upsert).toHaveBeenCalledTimes(3);
  });

  it('keeps a transient failed archive tombstoned across stale lists until replay succeeds', async () => {
    let offline = true;
    let remote = [
      {
        key: 'builtin:lora',
        displayName: 'Lora',
        systemBlock: 'builtin prompt',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
      {
        key: 'custom:one',
        displayName: 'One',
        systemBlock: 'prompt',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ];
    data.settings.set('personalities', [
      { id: 'builtin:lora', name: 'Lora', content: 'builtin prompt', updatedAt: 1, builtin: true },
      { id: 'custom:one', name: 'One', content: 'prompt', updatedAt: 1 },
    ]);
    const personas: NonNullable<IpcDeps['personas']> = {
      list: vi.fn(async () => remote),
      upsert: vi.fn(async () => undefined),
      archive: vi.fn(async ({ key }) => {
        if (offline) throw new Error('offline');
        remote = remote.filter((persona) => persona.key !== key);
      }),
    };
    register(data, { personas });

    const deleted = await invoke('cmd:personalities.delete', {
      id: 'custom:one',
      name: 'One',
      content: 'prompt',
      updatedAt: 1,
    }) as Array<{ id: string }>;
    expect(deleted.map((persona) => persona.id)).toEqual(['builtin:lora']);
    expect(loadPendingPersonaIntents(data.settings, TEST_PERSONA_SCOPE)).toHaveLength(1);

    const staleList = await invoke('query:personalities.list') as Array<{ id: string }>;
    expect(staleList.map((persona) => persona.id)).toEqual(['builtin:lora']);
    expect(loadPersonalities(data, TEST_PERSONA_SCOPE).map((persona) => persona.id)).toEqual(['builtin:lora']);
    expect(loadPendingPersonaIntents(data.settings, TEST_PERSONA_SCOPE)).toHaveLength(1);

    offline = false;
    const repaired = await invoke('query:personalities.list') as Array<{ id: string }>;
    expect(repaired.map((persona) => persona.id)).toEqual(['builtin:lora']);
    expect(loadPendingPersonaIntents(data.settings, TEST_PERSONA_SCOPE)).toEqual([]);
    expect(personas.archive).toHaveBeenCalledTimes(3);
  });

  it('bounds an offline replay trigger at the first transport failure', async () => {
    const first = { id: 'custom:first', name: 'First', content: 'first prompt', updatedAt: 1 };
    const second = { id: 'custom:second', name: 'Second', content: 'second prompt', updatedAt: 1 };
    data.settings.set('personalities', [first, second]);
    storePendingPersonaIntent(data.settings, null, createPendingPersonaUpsert(first));
    storePendingPersonaIntent(data.settings, null, createPendingPersonaUpsert(second));
    const personas: NonNullable<IpcDeps['personas']> = {
      list: vi.fn(async () => []),
      upsert: vi.fn(async () => {
        throw new HubError('timeout');
      }),
      archive: vi.fn(async () => undefined),
    };
    register(data, { personas });

    await expect(invoke('query:personalities.list')).resolves.toEqual([first, second]);
    expect(personas.upsert).toHaveBeenCalledTimes(1);
    expect(personas.upsert).toHaveBeenCalledWith(expect.objectContaining({ key: first.id }));
    expect(personas.list).not.toHaveBeenCalled();
    expect(loadPendingPersonaIntents(data.settings, TEST_PERSONA_SCOPE)).toHaveLength(2);
  });

  it('projects a confirmed retry before clearing and does not regress it with an immediate stale list', async () => {
    const cached = { id: 'custom:one', name: 'One', content: 'old prompt', updatedAt: 1 };
    const pending = { ...cached, content: 'durable prompt', updatedAt: 2 };
    data.settings.set('personalities', [cached]);
    storePendingPersonaIntent(data.settings, null, createPendingPersonaUpsert(pending));
    const personas: NonNullable<IpcDeps['personas']> = {
      list: vi.fn(async () => [{
        key: cached.id,
        displayName: cached.name,
        systemBlock: cached.content,
        updatedAt: '2026-06-01T00:00:00.000Z',
      }]),
      upsert: vi.fn(async () => undefined),
      archive: vi.fn(async () => undefined),
    };
    register(data, { personas });

    await expect(invoke('query:personalities.list')).resolves.toEqual([pending]);
    expect(personas.list).not.toHaveBeenCalled();
    expect(loadPersonalities(data, TEST_PERSONA_SCOPE)).toEqual([pending]);
    expect(loadPendingPersonaIntents(data.settings, TEST_PERSONA_SCOPE)).toEqual([]);
  });

  it('does not acknowledge a Core 4xx as an offline persona save', async () => {
    data.settings.set('personalities', [
      { id: 'custom:one', name: 'One', content: 'old prompt', updatedAt: 1 },
    ]);
    const personas: NonNullable<IpcDeps['personas']> = {
      list: vi.fn(async () => []),
      upsert: vi.fn(async () => {
        throw new HubError('bad-request', { detail: { status: 400 } });
      }),
      archive: vi.fn(async () => undefined),
    };
    register(data, { personas });

    await expect(invoke('cmd:personalities.save', {
      id: 'custom:one',
      name: 'One',
      content: 'rejected prompt',
      updatedAt: 2,
    })).rejects.toMatchObject({ reason: 'bad-request' });
    expect(loadPersonalities(data, TEST_PERSONA_SCOPE)[0]?.content).toBe('old prompt');
    expect(loadPendingPersonaIntents(data.settings, TEST_PERSONA_SCOPE)).toEqual([]);
  });

  it('sends the cached Core revision and persists the revision returned by a save', async () => {
    const existing = {
      id: 'custom:versioned',
      name: 'Versioned',
      content: 'version three',
      updatedAt: 1,
      remoteVersion: 3,
    };
    data.settings.set('personalities', [existing]);
    const personas: NonNullable<IpcDeps['personas']> = {
      list: vi.fn(async () => []),
      upsert: vi.fn(async (args) => ({
        kind: 'upserted' as const,
        persona: {
          key: args.key,
          displayName: args.displayName,
          systemBlock: args.systemBlock,
          updatedAt: '2026-07-13T12:00:00.000Z',
          version: 4,
        },
      })),
      archive: vi.fn(async () => undefined),
    };
    register(data, { personas });
    const edited = { ...existing, content: 'version four', updatedAt: 2 };

    await expect(invoke('cmd:personalities.save', edited)).resolves.toEqual([
      { ...edited, remoteVersion: 4 },
    ]);
    expect(personas.upsert).toHaveBeenCalledExactlyOnceWith({
      key: edited.id,
      displayName: edited.name,
      systemBlock: edited.content,
      expectedVersion: 3,
      expectedHubOrigin: TEST_PERSONA_SCOPE.origin,
    });
    expect(loadPersonalities(data, TEST_PERSONA_SCOPE)).toEqual([
      { ...edited, remoteVersion: 4 },
    ]);
    expect(loadPendingPersonaIntents(data.settings, TEST_PERSONA_SCOPE)).toEqual([]);
  });

  it('archives with the immutable editor revision instead of reloading a newer cache token', async () => {
    const opened = {
      id: 'custom:archive-versioned',
      name: 'Versioned',
      content: 'version three',
      updatedAt: 1,
      remoteVersion: 3,
    };
    data.settings.set('personalities', [
      { ...opened, content: 'device B version four', updatedAt: 2, remoteVersion: 4 },
    ]);
    const personas: NonNullable<IpcDeps['personas']> = {
      list: vi.fn(async () => []),
      upsert: vi.fn(async () => undefined),
      archive: vi.fn(async () => ({ archived: true, version: 4 })),
    };
    register(data, { personas });

    await expect(invoke('cmd:personalities.delete', opened)).resolves.toEqual([]);
    expect(personas.archive).toHaveBeenCalledExactlyOnceWith({
      key: opened.id,
      expectedVersion: 3,
      expectedHubOrigin: TEST_PERSONA_SCOPE.origin,
    });
  });

  it('restores an older pending edit when a newer same-key save gets a Core 4xx', async () => {
    let rejectDeterministically = false;
    const personas: NonNullable<IpcDeps['personas']> = {
      list: vi.fn(async () => []),
      upsert: vi.fn(async () => {
        if (rejectDeterministically) {
          throw new HubError('bad-request', { detail: { status: 400 } });
        }
        throw new HubError('timeout');
      }),
      archive: vi.fn(async () => undefined),
    };
    register(data, { personas });
    const older = { id: 'custom:one', name: 'One', content: 'pending prompt', updatedAt: 1 };
    await expect(invoke('cmd:personalities.save', older)).resolves.toEqual(
      expect.arrayContaining([older]),
    );

    rejectDeterministically = true;
    await expect(invoke('cmd:personalities.save', {
      ...older,
      content: 'rejected prompt',
      updatedAt: 2,
    })).rejects.toMatchObject({ reason: 'bad-request' });

    expect(loadPersonalities(data, TEST_PERSONA_SCOPE)).toEqual(expect.arrayContaining([older]));
    expect(loadPendingPersonaIntents(data.settings, TEST_PERSONA_SCOPE)).toEqual([
      expect.objectContaining({
        kind: 'upsert',
        key: older.id,
        personality: older,
      }),
    ]);
  });

  it('inherits the prior indeterminate same-key save as durable successor lineage', async () => {
    const personas: NonNullable<IpcDeps['personas']> = {
      list: vi.fn(async () => []),
      upsert: vi.fn(async () => {
        throw new HubError('timeout');
      }),
      archive: vi.fn(async () => undefined),
    };
    register(data, { personas });
    const p2 = {
      id: 'custom:successor',
      name: 'Successor',
      content: 'version two',
      updatedAt: 2,
      remoteVersion: 1,
    };
    const p3 = { ...p2, content: 'version three', updatedAt: 3 };

    await expect(invoke('cmd:personalities.save', p2)).resolves.toEqual(
      expect.arrayContaining([p2]),
    );
    await expect(invoke('cmd:personalities.save', p3)).resolves.toEqual(
      expect.arrayContaining([p3]),
    );

    expect(loadPendingPersonaIntents(data.settings, TEST_PERSONA_SCOPE)).toEqual([
      expect.objectContaining({
        kind: 'upsert',
        key: p3.id,
        personality: p3,
        expectedVersion: 1,
        predecessors: [{
          payloadDigest: personaPayloadDigest(p2),
          committedVersion: 2,
        }],
      }),
    ]);
  });

  it('durably defers an auth-rejected persona archive for replay', async () => {
    const existing = { id: 'custom:one', name: 'One', content: 'old prompt', updatedAt: 1 };
    data.settings.set('personalities', [existing]);
    const personas: NonNullable<IpcDeps['personas']> = {
      list: vi.fn(async () => []),
      upsert: vi.fn(async () => undefined),
      archive: vi.fn(async () => {
        throw new HubError('auth', { detail: { status: 403 } });
      }),
    };
    register(data, { personas });

    await expect(invoke('cmd:personalities.delete', existing)).resolves.toEqual([]);
    expect(loadPersonalities(data, TEST_PERSONA_SCOPE)).toEqual([]);
    expect(loadPendingPersonaIntents(data.settings, TEST_PERSONA_SCOPE)).toEqual([
      expect.objectContaining({ kind: 'archive', key: existing.id }),
    ]);
  });

  it.each([
    new HubError('auth', { detail: { status: 401 } }),
    new HubError('http', { detail: { status: 429 } }),
  ])('durably defers a repairable persona save failure (%s)', async (failure) => {
    const existing = { id: 'custom:one', name: 'One', content: 'old prompt', updatedAt: 1 };
    const edited = { ...existing, content: 'durable prompt', updatedAt: 2 };
    data.settings.set('personalities', [existing]);
    const personas: NonNullable<IpcDeps['personas']> = {
      list: vi.fn(async () => []),
      upsert: vi.fn(async () => {
        throw failure;
      }),
      archive: vi.fn(async () => undefined),
    };
    register(data, { personas });

    await expect(invoke('cmd:personalities.save', edited)).resolves.toEqual([edited]);
    expect(loadPersonalities(data, TEST_PERSONA_SCOPE)).toEqual([edited]);
    expect(loadPendingPersonaIntents(data.settings, TEST_PERSONA_SCOPE)).toEqual([
      expect.objectContaining({ kind: 'upsert', key: edited.id, personality: edited }),
    ]);
  });

  it('treats a replayed archive 404 as confirmed convergence', async () => {
    const builtin = {
      id: 'builtin:lora',
      name: 'Lora',
      content: 'builtin prompt',
      updatedAt: 1,
      builtin: true,
    };
    const archived = { id: 'custom:one', name: 'One', content: 'old prompt', updatedAt: 1 };
    data.settings.set('personalities', [builtin, archived]);
    storePendingPersonaIntent(data.settings, null, createPendingPersonaArchive(archived.id));
    const personas: NonNullable<IpcDeps['personas']> = {
      list: vi.fn(async () => []),
      upsert: vi.fn(async () => undefined),
      archive: vi.fn(async () => {
        throw new HubError('http', { detail: { status: 404 } });
      }),
    };
    register(data, { personas });

    await expect(invoke('query:personalities.list')).resolves.toEqual([builtin]);
    expect(loadPersonalities(data, TEST_PERSONA_SCOPE)).toEqual([builtin]);
    expect(loadPendingPersonaIntents(data.settings, TEST_PERSONA_SCOPE)).toEqual([]);
    expect(personas.list).not.toHaveBeenCalled();
  });

  it('enforces the Core persona content boundaries at the IPC trust boundary', async () => {
    const personas: NonNullable<IpcDeps['personas']> = {
      list: vi.fn(async () => []),
      upsert: vi.fn(async () => undefined),
      archive: vi.fn(async () => undefined),
    };
    register(data, { personas });

    const payload = (content: string) => ({
      id: 'custom:boundary',
      name: 'Boundary',
      content,
      updatedAt: 1,
    });
    await expect(invoke('cmd:personalities.save', payload(''))).rejects.toThrow();
    await expect(invoke('cmd:personalities.save', payload('x'.repeat(50_001)))).rejects.toThrow();
    await expect(invoke('cmd:personalities.save', payload('x'.repeat(50_000)))).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'custom:boundary', content: 'x'.repeat(50_000) }),
      ]),
    );
    expect(personas.upsert).toHaveBeenCalledTimes(1);
    expect(loadPendingPersonaIntents(data.settings, TEST_PERSONA_SCOPE)).toEqual([]);
  });

  it('isolates cached personas, pending edits, and mappings across Hub A -> B -> A', async () => {
    const cachedA = {
      id: 'custom:a',
      name: 'Persona A',
      content: 'cached A prompt',
      updatedAt: 1,
    };
    data.settings.set('personalities', [cachedA]);
    register(data, { personas: null });

    await expect(invoke('query:personalities.list')).resolves.toEqual([cachedA]);
    await invoke('cmd:mappings.set', { accountId: ACCT, personalityId: cachedA.id });
    const pendingA = { ...cachedA, content: 'pending A prompt', updatedAt: 2 };
    await invoke('cmd:personalities.save', pendingA);

    await invoke('cmd:settings.update', { hubBaseUrl: TEST_PERSONA_SCOPE_B.origin });
    const listB = await invoke('query:personalities.list') as Array<{ id: string }>;
    expect(listB.some((persona) => persona.id === cachedA.id)).toBe(false);
    expect((await invoke('query:settings.get') as SettingsVM).accountMappings).toEqual({});

    const pendingB = {
      id: 'custom:b',
      name: 'Persona B',
      content: 'pending B prompt',
      updatedAt: 1,
    };
    await invoke('cmd:personalities.save', pendingB);
    await invoke('cmd:mappings.set', { accountId: ACCT, personalityId: pendingB.id });

    await invoke('cmd:settings.update', { hubBaseUrl: TEST_PERSONA_SCOPE.origin });
    const restoredA = await invoke('query:personalities.list') as Array<{ id: string; content: string }>;
    expect(restoredA).toEqual([pendingA]);
    expect((await invoke('query:settings.get') as SettingsVM).accountMappings)
      .toEqual({ [ACCT]: cachedA.id });
    expect(loadPendingPersonaIntents(data.settings, TEST_PERSONA_SCOPE))
      .toEqual([expect.objectContaining({ kind: 'upsert', personality: pendingA })]);

    await invoke('cmd:settings.update', { hubBaseUrl: TEST_PERSONA_SCOPE_B.origin });
    const restoredB = await invoke('query:personalities.list') as Array<{ id: string }>;
    expect(restoredB.some((persona) => persona.id === pendingB.id)).toBe(true);
    expect(restoredB.some((persona) => persona.id === cachedA.id)).toBe(false);
    expect((await invoke('query:settings.get') as SettingsVM).accountMappings)
      .toEqual({ [ACCT]: pendingB.id });
    expect(loadPendingPersonaIntents(data.settings, TEST_PERSONA_SCOPE_B))
      .toEqual([expect.objectContaining({ kind: 'upsert', personality: pendingB })]);
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
    const secretValues = new Map<SecretName, string>([['hubDeviceToken', 'device-live']]);
    const secrets = {
      getSecret: (name: SecretName) => Promise.resolve(secretValues.get(name) ?? null),
      hasSecret: (name: SecretName) => Promise.resolve(secretValues.has(name)),
      setSecret: (name: SecretName, value: string) => {
        secretValues.set(name, value);
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
