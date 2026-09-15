// IPC surface of the hub wiring: accountPageLabels round-trip through
// cmd:settings.update / query:settings.get, query:sync.status carrying the
// hub stream state, and the onHubConfigChanged hook firing on hub-touching
// patches only (key-only writes publish no settings-table event — the hook is
// main's only reconnect signal).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_AGENCY_HUB_BASE_URL } from '@chatgoose/shared';
import type { DataLayer } from '@main/db/index';
import type { HubSyncStatus } from '@main/sync/hub-sync';
import type { SyncProvider } from '@main/sync/provider';
import { createSettingsStore } from '@main/settings/store';
import { registerIpcHandlers } from '@main/ipc/handlers';
import type { IpcDeps } from '@main/ipc/handlers';
import { LEGACY_PERSONA_SNAPSHOT_KEY, storePersonaCatalog } from '@main/personas/catalog';
import {
  personaAccountMappingsKey,
  personaSummaryCacheIdentity,
  personaStorageScopeForHub,
  storePersonaAccountMapping,
} from '@main/personas/pending';
import {
  createRuntimeMutationQueue,
  createSerializedCredentialLifecycle,
  replaceRuntimeSecurityFirst,
} from '@main/runtime-activation';
import type { SecretName } from '@main/secrets/keychain';
import type { FanPanelVM, SettingsVM, SyncStatusVM } from '../../src/preload/contract';
import { ACCT, FAN, memoryDataLayer, seedAccount } from './helpers';

const TEST_PERSONA_SCOPE = personaStorageScopeForHub(DEFAULT_AGENCY_HUB_BASE_URL);
const TEST_DEFINITION_ID = 'v1:test-persona-definition';

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
async function invokeRaw(channel: string, args?: unknown, event: unknown = {}): Promise<unknown> {
  const handler = handlers.get(channel);
  if (!handler) {
    throw new Error(`no handler registered for ${channel}`);
  }
  return handler(event, args);
}

async function invoke(channel: string, args?: unknown, event: unknown = {}): Promise<unknown> {
  return invokeRaw(channel, args, event);
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

  it('never renders a same-key/version fan summary from another Hub origin', async () => {
    seedAccount(data);
    data.fans.upsert({
      accountId: ACCT,
      fanId: FAN,
      username: 'fan',
      name: 'Fan',
      customName: null,
      avatar: null,
      about: null,
      lastSeen: null,
      spending: null,
      subscription: null,
      fetchedAt: '2026-07-13T00:00:00.000Z',
    });
    storePersonaAccountMapping(data.settings, TEST_PERSONA_SCOPE, ACCT, 'builtin:lora');
    storePersonaCatalog(data.settings, TEST_PERSONA_SCOPE, [{
      key: 'builtin:lora',
      displayName: 'Lora',
      version: 1,
      status: 'active',
      definitionId: `${TEST_DEFINITION_ID}:hub-a`,
    }]);
    data.summaries.put(ACCT, FAN, {
      body: 'Hub A summary',
      personalityId: personaSummaryCacheIdentity(
        TEST_PERSONA_SCOPE,
        'builtin:lora',
        `${TEST_DEFINITION_ID}:hub-a`,
      ),
      personalityUpdatedAt: 1,
      generatedAt: Date.parse('2026-07-13T00:00:00.000Z'),
      spendingVerified: true,
      subscriptionVerified: true,
      modelId: 'kernel',
    });
    register(data);
    expect((await invoke('query:fan.get', { accountId: ACCT, fanId: FAN }) as FanPanelVM).summary)
      .toMatchObject({ body: 'Hub A summary' });

    const scopeB = personaStorageScopeForHub('http://127.0.0.1:4010');
    storePersonaAccountMapping(data.settings, scopeB, ACCT, 'builtin:lora');
    storePersonaCatalog(data.settings, scopeB, [{
      key: 'builtin:lora',
      displayName: 'Different Lora',
      version: 1,
      status: 'active',
      definitionId: `${TEST_DEFINITION_ID}:hub-b`,
    }]);
    await invoke('cmd:settings.update', { hubBaseUrl: 'http://127.0.0.1:4010' });

    expect((await invoke('query:fan.get', { accountId: ACCT, fanId: FAN }) as FanPanelVM).summary)
      .toBeNull();
  });

  it('uses the SettingsStore fallback source for an invalid-but-parseable persisted Hub URL', async () => {
    seedAccount(data);
    data.fans.upsert({
      accountId: ACCT,
      fanId: FAN,
      username: 'fan',
      name: 'Fan',
      customName: null,
      avatar: null,
      about: null,
      lastSeen: null,
      spending: null,
      subscription: null,
      fetchedAt: '2026-07-13T00:00:00.000Z',
    });
    const invalidScope = personaStorageScopeForHub('https://old.example');
    storePersonaAccountMapping(data.settings, invalidScope, ACCT, 'builtin:lora');
    storePersonaCatalog(data.settings, invalidScope, [{
      key: 'builtin:lora',
      displayName: 'Old Lora',
      version: 1,
      status: 'active',
      definitionId: `${TEST_DEFINITION_ID}:old-hub`,
    }]);
    data.summaries.put(ACCT, FAN, {
      body: 'invalid-origin summary',
      personalityId: personaSummaryCacheIdentity(
        invalidScope,
        'builtin:lora',
        `${TEST_DEFINITION_ID}:old-hub`,
      ),
      personalityUpdatedAt: 1,
      generatedAt: Date.parse('2026-07-13T00:00:00.000Z'),
      spendingVerified: true,
      subscriptionVerified: true,
      modelId: 'kernel',
    });
    data.settings.set('hubBaseUrl', 'https://old.example');
    register(data);

    const settings = await invoke('query:settings.get') as SettingsVM;
    expect(settings.hubBaseUrl).toBe(DEFAULT_AGENCY_HUB_BASE_URL);
    expect((await invoke('query:fan.get', { accountId: ACCT, fanId: FAN }) as FanPanelVM).summary)
      .toBeNull();
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

  it('surfaces quarantined credential custody independently of sync/auth status', async () => {
    register(data, { hubCredentialAttention: () => true });
    expect((await invoke('query:sync.status') as SyncStatusVM).hubCredentialAttention).toBe(true);

    register(data, {
      sync: makeSyncStub('live'),
      hubCredentialAttention: () => true,
    });
    const live = await invoke('query:sync.status') as SyncStatusVM;
    expect(live.hub).toBe('live');
    expect(live.hubCredentialAttention).toBe(true);

    register(data, { hubCredentialAttention: () => false });
    expect((await invoke('query:sync.status') as SyncStatusVM).hubCredentialAttention).toBe(false);
  });

  it('splits read-runtime rebuilds from hub stream override rechecks', async () => {
    const { onHubConfigChanged, onOfapiRuntimeConfigChanged } = register(data);
    await invoke('cmd:settings.update', { hubBaseUrl: 'http://localhost:4000' });
    expect(onOfapiRuntimeConfigChanged).toHaveBeenCalledTimes(1);
    expect(onHubConfigChanged).not.toHaveBeenCalled();
    // Stage 24: ofapiReadTransport is a frozen 'hub' literal — patching it is
    // a no-op and must NOT rebuild the runtime.
    await invoke('cmd:settings.update', { ofapiReadTransport: 'hub' });
    expect(onOfapiRuntimeConfigChanged).toHaveBeenCalledTimes(1);
    await invoke('cmd:settings.update', { hubModeOverride: 'polling' });
    expect(onHubConfigChanged).toHaveBeenCalledTimes(1);
    expect(onOfapiRuntimeConfigChanged).toHaveBeenCalledTimes(1);
    await invoke('cmd:settings.update', { hubBaseUrl: 'http://127.0.0.1:4000' });
    expect(onOfapiRuntimeConfigChanged).toHaveBeenCalledTimes(2);
    expect(onHubConfigChanged).toHaveBeenCalledTimes(1);
  });

  it('keeps mode-only rechecks on Sync without retiring the REST/AI Hub module', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../../src/main/index.ts'), 'utf8');
    const start = source.indexOf('const recheckNextHubSyncConfig = async');
    const end = source.indexOf('// Hub-supported writes', start);
    const recheck = source.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(recheck).toContain('await nextSync.reconfigureHub();');
    expect(recheck).not.toContain('nextHub.reconfigure()');
  });

  it('skips probe/rebuild for an unchanged hub URL but preserves real address transitions', async () => {
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
    await invoke('cmd:settings.update', { hubBaseUrl: 'http://127.0.0.1:4000' });
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
      invoke('cmd:settings.update', { hubBaseUrl: '' }),
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

  it('4a: rejects a hub address save and persists nothing when validation fails', async () => {
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
      invoke('cmd:settings.update', { hubBaseUrl: 'http://localhost:4000' }),
    ).rejects.toThrow(/CG-HUB-01/);

    expect(probeReadRuntimeForPatch).toHaveBeenCalledTimes(1);
    // No persist: settingsStore.update never ran (SPEC §15 — no half-applied
    // configuration), so the settings table is untouched.
    expect(updateSpy).not.toHaveBeenCalled();
    expect(((await invoke('query:settings.get')) as SettingsVM).hubBaseUrl)
      .toBe('https://gosling-agency.ru');
    expect(onOfapiRuntimeConfigChanged).not.toHaveBeenCalled();
  });

  it('4a: persists and rebuilds once the hub address validates', async () => {
    const settingsStore = createSettingsStore({ queries: data.settings, secrets: statefulSecrets() });
    const probeReadRuntimeForPatch = vi.fn(async () => undefined);
    const { onOfapiRuntimeConfigChanged } = register(data, {
      settingsStore,
      probeReadRuntimeForPatch,
    });

    await invoke('cmd:settings.update', { hubBaseUrl: 'http://localhost:4000' });

    expect(probeReadRuntimeForPatch).toHaveBeenCalledTimes(1);
    expect(onOfapiRuntimeConfigChanged).toHaveBeenCalledTimes(1);
    expect(((await invoke('query:settings.get')) as SettingsVM).hubBaseUrl)
      .toBe('http://localhost:4000');
  });

  it('rejects a Hub URL switch with a stored device token before IPC mutates credentials or rebuilds', async () => {
    const values = new Map<SecretName, string>([
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
    })).rejects.toThrow(/sign out.*device token.*Hub URL/i);

    expect(setSecret).not.toHaveBeenCalled();
    expect(deleteSecret).not.toHaveBeenCalled();
    expect(onOfapiRuntimeConfigChanged).not.toHaveBeenCalled();
    expect(values.get('hubDeviceToken')).toBe('agency_hub_device_live');
    expect((await settingsStore.get()).hubBaseUrl).toBe('https://gosling-agency.ru');
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
      invoke('cmd:settings.update', { hubBaseUrl: 'http://localhost:4000' }),
    ).rejects.toThrow(/account bootstrap failed/);
    expect(onOfapiRuntimeConfigChanged).toHaveBeenCalledTimes(1);
  });

  it('serializes a slow sign-out with the next sign-in (one credential at a time)', async () => {
    const queue = createRuntimeMutationQueue();
    const order: string[] = [];
    let storedDeviceToken: string | null = 'device-a';
    let mintCount = 0;
    let releaseDelete: (() => void) | undefined;
    let deleteStarted: (() => void) | undefined;
    const deleteStartedPromise = new Promise<void>((resolve) => {
      deleteStarted = resolve;
    });
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
            order.push('delete:start');
            deleteStarted?.();
            await new Promise<void>((resolve) => {
              releaseDelete = () => {
                order.push('delete:done');
                resolve();
              };
            });
            storedDeviceToken = null;
          },
          activateFallback: async () => {
            order.push('activate:fallback');
          },
        });
      },
    });

    const signOut = lifecycle.signOut();
    await deleteStartedPromise;
    const nextSignIn = lifecycle.issue('device-b');
    await Promise.resolve();
    // The sign-in must not mint while sign-out still owns the credential —
    // otherwise sign-out would delete the freshly issued one by name.
    expect(mintCount).toBe(0);

    releaseDelete?.();
    await signOut;
    await expect(nextSignIn).resolves.toBe('device-b');
    expect(storedDeviceToken).toBe('device-b');
    expect(mintCount).toBe(1);
    expect(order).toEqual([
      'deactivate',
      'revoke:device-a',
      'delete:start',
      'delete:done',
      'activate:fallback',
      'issue:device-b',
      'activate:stored',
    ]);
  });
});

describe('read-only persona catalog IPC', () => {
  let data: DataLayer;

  beforeEach(() => {
    data = memoryDataLayer();
    seedAccount(data);
  });

  it('hides revoked grants but keeps a granted account that needs re-authentication', async () => {
    data.accounts.upsert({
      id: 'acct_old',
      username: 'loravie',
      displayName: 'Lora Vie',
      avatar: null,
      authState: 'authenticated',
      raw: {},
    });
    data.accounts.revokeGrant('acct_old');
    data.accounts.setAuthState(ACCT, 'unauthenticated');
    register(data);

    await expect(invokeRaw('query:accounts.list')).resolves.toEqual([
      expect.objectContaining({ id: ACCT, isAuthenticated: false }),
    ]);
  });

  it('commits the immutable full-text snapshot before the first catalog request', async () => {
    const legacy = [{ id: 'custom:legacy', name: 'Legacy', content: 'full private text' }];
    const mappings = { [ACCT]: 'custom:legacy' };
    data.settings.set('personalities', legacy);
    data.settings.set('accountMappings', mappings);
    const list = vi.fn(async () => {
      expect(data.settings.get(LEGACY_PERSONA_SNAPSHOT_KEY)).toEqual(expect.objectContaining({
        schemaVersion: 1,
        rows: expect.objectContaining({
          personalities: legacy,
          accountMappings: mappings,
        }),
      }));
      const catalog = [{
        key: 'custom:legacy',
        displayName: 'Legacy',
        version: 7,
        status: 'active' as const,
        definitionId: `${TEST_DEFINITION_ID}:legacy`,
      }];
      storePersonaCatalog(data.settings, TEST_PERSONA_SCOPE, catalog);
      return catalog;
    });
    register(data, { personas: { list } });

    await expect(invokeRaw('query:personalities.list')).resolves.toEqual({
      scopeOrigin: TEST_PERSONA_SCOPE.origin,
      personas: [{
        key: 'custom:legacy',
        displayName: 'Legacy',
        version: 7,
        status: 'active',
        definitionId: `${TEST_DEFINITION_ID}:legacy`,
      }],
      legacySnapshotAvailable: true,
    });
    expect(list).toHaveBeenCalledTimes(1);
    expect(data.settings.get('personalities')).toEqual(legacy);
    expect(data.settings.get('accountMappings')).toEqual(mappings);
  });

  it.each([
    ['missing', 'custom:missing', 'unresolved'],
    ['archived', 'custom:archived', 'archived'],
  ] as const)('preserves a %s raw mapping while disabling its effective AI mapping', async (
    _label,
    mappedKey,
    expectedState,
  ) => {
    data.settings.set('accountMappings', { [ACCT]: mappedKey });
    register(data, {
      personas: {
        list: async () => {
          const catalog = [{
            key: 'custom:archived',
            displayName: 'Archived',
            version: 4,
            status: 'archived' as const,
            definitionId: `${TEST_DEFINITION_ID}:archived`,
          }];
          storePersonaCatalog(data.settings, TEST_PERSONA_SCOPE, catalog);
          return catalog;
        },
      },
    });

    await invokeRaw('query:personalities.list');
    const accounts = await invokeRaw('query:accounts.list') as Array<Record<string, unknown>>;
    expect(accounts).toEqual([expect.objectContaining({
      id: ACCT,
      personalityId: null,
      rawPersonalityId: mappedKey,
      personalityMappingState: expectedState,
    })]);
    expect(data.settings.get(personaAccountMappingsKey(TEST_PERSONA_SCOPE))).toEqual({
      [ACCT]: mappedKey,
    });
  });

  it('publishes an account-scoped mapping invalidation without resetting unrelated AI', async () => {
    storePersonaCatalog(data.settings, TEST_PERSONA_SCOPE, [{
      key: 'custom:active',
      displayName: 'Active',
      version: 1,
      status: 'active',
      definitionId: `${TEST_DEFINITION_ID}:active`,
    }]);
    data.bus.flushNow();
    const events: Array<{
      scope: string;
      accountId?: string;
      settingsKeys?: string[];
    }> = [];
    data.bus.subscribe((batch) => events.push(...batch));
    register(data);

    await invokeRaw('cmd:mappings.set', {
      accountId: ACCT,
      personalityId: 'custom:active',
    });
    data.bus.flushNow();

    expect(events).toContainEqual({
      scope: 'settings',
      accountId: ACCT,
      settingsKeys: [personaAccountMappingsKey(TEST_PERSONA_SCOPE)],
    });
    expect(data.settings.get(personaAccountMappingsKey(TEST_PERSONA_SCOPE))).toEqual({
      [ACCT]: 'custom:active',
    });
  });

  it('exports the immutable snapshot without exposing persona write handlers', async () => {
    data.settings.set('personalities', [{
      id: 'custom:backup',
      name: 'Backup',
      content: 'must survive',
    }]);
    const exportPersonaSnapshot = vi.fn(async () => ({ path: '/tmp/personas.json' }));
    register(data, {
      localData: {
        stats: async () => ({ dbBytes: 0, mediaBytes: 0, mediaFiles: 0 }),
        openFolder: async () => undefined,
        exportDiagnostics: async () => ({ path: '/tmp/diagnostics.json' }),
        exportPersonaSnapshot,
      },
    });

    await expect(invokeRaw('cmd:personalities.exportLegacySnapshot')).resolves.toEqual({
      path: '/tmp/personas.json',
    });
    expect(exportPersonaSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      rows: expect.objectContaining({
        personalities: [expect.objectContaining({ content: 'must survive' })],
      }),
    }));
    expect(handlers.has('cmd:personalities.save')).toBe(false);
    expect(handlers.has('cmd:personalities.delete')).toBe(false);
  });

  it('prepares harvest identity locally and gates upload start on that preflight', async () => {
    let machineId: string | null = null;
    const prepareIdentity = vi.fn(() => {
      machineId ??= '11111111-2222-4333-8444-555555555555';
      return { machineId };
    });
    const start = vi.fn(async () => ({ manifestPath: null }));
    register(data, {
      harvest: {
        prepareIdentity,
        start,
        pause: () => undefined,
        status: () => ({
          state: 'idle',
          machineId,
          currentTable: null,
          error: null,
          tables: {},
        }),
      },
    });

    await expect(invokeRaw('cmd:harvest.start')).rejects.toThrow(
      'Create and record the harvest device ID',
    );
    expect(start).not.toHaveBeenCalled();

    await expect(invokeRaw('cmd:harvest.prepareIdentity')).resolves.toEqual({
      machineId: '11111111-2222-4333-8444-555555555555',
    });
    await expect(invokeRaw('cmd:harvest.prepareIdentity')).resolves.toEqual({
      machineId: '11111111-2222-4333-8444-555555555555',
    });
    expect(prepareIdentity).toHaveBeenCalledTimes(2);
    expect(start).not.toHaveBeenCalled();

    await expect(invokeRaw('cmd:harvest.start')).resolves.toEqual({ manifestPath: null });
    expect(start).toHaveBeenCalledTimes(1);
  });
});
describe('cmd:hub.signOutDevice', () => {
  let data: DataLayer;

  beforeEach(() => {
    data = memoryDataLayer();
  });

  function stubHubAuth(
    signOutDevice: () => Promise<void>,
    abandonDevice: () => Promise<void> = () => Promise.resolve(),
  ): NonNullable<IpcDeps['hubAuth']> {
    return {
      issueDeviceToken: async () => {
        throw new Error('issueDeviceToken not exercised in this test');
      },
      signOutDevice,
      abandonDevice,
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

  it('delegates explicitly confirmed local-only abandonment separately from sign-out', async () => {
    const signOutDevice = vi.fn(() => Promise.resolve());
    const abandonDevice = vi.fn(() => Promise.resolve());
    register(data, { hubAuth: stubHubAuth(signOutDevice, abandonDevice) });

    await invoke('cmd:hub.abandonDevice');

    expect(abandonDevice).toHaveBeenCalledTimes(1);
    expect(signOutDevice).not.toHaveBeenCalled();
  });

  it('rejects an unexpected abandonment payload at the trust boundary', async () => {
    const abandonDevice = vi.fn(() => Promise.resolve());
    register(data, {
      hubAuth: stubHubAuth(() => Promise.resolve(), abandonDevice),
    });

    await expect(invoke('cmd:hub.abandonDevice', { unconfirmed: true })).rejects.toThrow();
    expect(abandonDevice).not.toHaveBeenCalled();
  });
});
