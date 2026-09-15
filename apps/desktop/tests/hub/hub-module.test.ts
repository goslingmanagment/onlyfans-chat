// Hub module composition: inert when explicitly unconfigured, live
// usage pipeline when configured (coordinator payload → mapper → reporter →
// batch over the injected client), persisted-backlog flush on reconfigure,
// and clean teardown when the config is removed.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { HubError } from '@chatgoose/shared/hub/index';
import { createHubModule, PERSONA_CATALOG_REFRESH_MS } from '@main/hub/index';
import type { SettingsStore } from '@main/settings/store';
import type { UsageEventRecord } from '@main/ai/index';
import type { Keychain } from '@main/secrets/keychain';
import {
  LEGACY_PERSONA_SNAPSHOT_KEY,
  loadPersonaCatalog,
  storePersonaCatalog,
} from '@main/personas/catalog';
import {
  personaStorageScopeForHub,
  personaSummaryCacheIdentity,
  storePersonaAccountMapping,
} from '@main/personas/pending';
import {
  insertCoordinatorRow,
  makeFakeHubClient,
  makeSettingsStore,
  makeSettingsVM,
  memoryDataLayer,
  rawCoordinatorPayload,
  seedAccount,
  seedSummary,
  usageEventRowCount,
  FAN,
} from './helpers';

const TEST_PERSONA_SCOPE = personaStorageScopeForHub('https://hub.example.com');
const TEST_DEFINITION_ID = 'v1:test-persona-definition';

function definitionId(key: string, incarnation = '1'): string {
  return `${TEST_DEFINITION_ID}:${key}:${incarnation}`;
}

function makeKeychain(deviceToken: string | null): Pick<Keychain, 'getSecret'> {
  return {
    getSecret: (name) => Promise.resolve(name === 'hubDeviceToken' ? deviceToken : null),
  };
}

function makeDynamicSettingsStore(
  read: () => ReturnType<typeof makeSettingsVM> | Promise<ReturnType<typeof makeSettingsVM>>,
): SettingsStore {
  const get = async () => read();
  return {
    get,
    update: get,
    getHubConnection: async () => {
      const settings = await get();
      const deviceToken = settings.hasHubDeviceToken ? 'agency_hub_device_test' : null;
      return {
        settings,
        hubBaseUrl: settings.hubBaseUrl,
        bearer: deviceToken,
        deviceToken,
        deviceTokenTransition: null,
      };
    },
    runCredentialMutation: (task) => task(),
    backfillHubDeviceIdentity: () => Promise.resolve(false),
  };
}

function usagePayload(overrides: Partial<UsageEventRecord> = {}): UsageEventRecord {
  return { ...(rawCoordinatorPayload() as unknown as UsageEventRecord), ...overrides };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createHubModule', () => {
  it('stays inert when hub config is absent', async () => {
    const data = memoryDataLayer();
    const client = makeFakeHubClient();
    const module = createHubModule({
      data,
      settingsStore: makeSettingsStore(
        makeSettingsVM({
          hubBaseUrl: null,
        }),
      ),
      keychain: makeKeychain('agency_hub_device_test'),
      createClient: () => client,
    });
    await module.reconfigure();

    expect(module.summaryHub.prefetchSummary).toBeUndefined();
    await expect(
      module.summaryHub.pushSummary?.({ accountId: 'acct_hub', fanId: FAN, body: 'x', generatedAt: 1 }),
    ).resolves.toBeUndefined();
    expect(client.getFanProfileMock).not.toHaveBeenCalled();
    expect(client.putFanProfileMock).not.toHaveBeenCalled();

    // Usage events stay parked in the table for a later configured session.
    insertCoordinatorRow(data, rawCoordinatorPayload());
    module.onUsageEvent(usagePayload());
    expect(usageEventRowCount(data)).toBe(1);
    module.dispose();
  });

  it('reports fresh coordinator events through the mapper once configured', async () => {
    vi.useFakeTimers();
    const data = memoryDataLayer();
    const client = makeFakeHubClient();
    const module = createHubModule({
      data,
      settingsStore: makeSettingsStore(
        makeSettingsVM({ hubBaseUrl: 'https://hub.example.com' }),
      ),
      keychain: makeKeychain('agency_hub_device_test'),
      createClient: () => client,
    });
    await module.reconfigure();

    module.onUsageEvent(usagePayload({ clientEventId: 'op-live', isCacheHit: true }));
    await vi.advanceTimersByTimeAsync(1_000); // legacy 1 s debounce

    expect(client.batches).toHaveLength(1);
    expect(client.batches[0]?.[0]).toMatchObject({
      clientEventId: 'op-live',
      feature: 'fast-reply',
      conversationId: FAN,
      cacheWriteTokens: 300,
      cacheReadTokens: 4000,
      isCacheHit: true,
    });
    expect(usageEventRowCount(data)).toBe(0); // delivered rows leave the table
    module.dispose();
  });

  it('quarantines a provenance-free backlog instead of sending it to the next Hub', async () => {
    vi.useFakeTimers();
    const data = memoryDataLayer();
    insertCoordinatorRow(data, rawCoordinatorPayload({ clientEventId: 'op-backlog' }));
    const client = makeFakeHubClient();
    const module = createHubModule({
      data,
      settingsStore: makeSettingsStore(
        makeSettingsVM({ hubBaseUrl: 'https://hub.example.com' }),
      ),
      keychain: makeKeychain('agency_hub_device_test'),
      createClient: () => client,
    });
    await module.reconfigure();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(client.batches).toHaveLength(0);
    expect(usageEventRowCount(data)).toBe(1);
    const row = data.db.prepare(
      'SELECT payload FROM usage_events WHERE client_event_id = @id',
    ).get({ id: 'op-backlog' }) as { payload: string };
    expect(JSON.parse(row.payload)).toMatchObject({ quarantined: true });
    module.dispose();
  });

  it('shares quiescence and waits for the retiring usage reporter exactly once', async () => {
    vi.useFakeTimers();
    const data = memoryDataLayer();
    let settleBatch!: () => void;
    const postUsageBatch = vi.fn(
      ({ events }: { events: unknown[] }) =>
        new Promise<{
          receivedCount: number;
          insertedCount: number;
          invalidCount: number;
          dedupedCount: number;
        }>((resolve) => {
          settleBatch = () => resolve({
            receivedCount: events.length,
            insertedCount: events.length,
            invalidCount: 0,
            dedupedCount: 0,
          });
        }),
    );
    const client = makeFakeHubClient({ postUsageBatch });
    const module = createHubModule({
      data,
      settingsStore: makeSettingsStore(
        makeSettingsVM({ hubBaseUrl: 'https://hub.example.com' }),
      ),
      keychain: makeKeychain('agency_hub_device_test'),
      createClient: () => client,
    });
    await module.reconfigure();
    module.onUsageEvent(usagePayload({ clientEventId: 'op-quiesce' }));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(postUsageBatch).toHaveBeenCalledTimes(1);

    let firstDone = false;
    let secondDone = false;
    const first = module.quiesce().then(() => {
      firstDone = true;
    });
    const second = module.quiesce().then(() => {
      secondDone = true;
    });
    await Promise.resolve();
    expect(firstDone).toBe(false);
    expect(secondDone).toBe(false);

    settleBatch();
    await Promise.all([first, second]);
    expect(firstDone).toBe(true);
    expect(secondDone).toBe(true);
    module.dispose();
  });

  it('serializes reporter retirement before a concurrent replacement is installed', async () => {
    vi.useFakeTimers();
    const data = memoryDataLayer();
    let settleOld!: () => void;
    const oldPost = vi.fn(
      ({ events }: { events: unknown[] }) =>
        new Promise<{
          receivedCount: number;
          insertedCount: number;
          invalidCount: number;
          dedupedCount: number;
        }>((resolve) => {
          settleOld = () => resolve({
            receivedCount: events.length,
            insertedCount: events.length,
            invalidCount: 0,
            dedupedCount: 0,
          });
        }),
    );
    const oldClient = makeFakeHubClient({ postUsageBatch: oldPost });
    const replacementClient = makeFakeHubClient();
    const createClient = vi.fn()
      .mockReturnValueOnce(oldClient)
      .mockReturnValue(replacementClient);
    const module = createHubModule({
      data,
      settingsStore: makeSettingsStore(
        makeSettingsVM({ hubBaseUrl: 'https://hub.example.com' }),
      ),
      keychain: makeKeychain('agency_hub_device_test'),
      createClient,
    });
    await module.reconfigure();
    module.onUsageEvent(usagePayload({ clientEventId: 'op-retire' }));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(oldPost).toHaveBeenCalledTimes(1);

    const firstReplacement = module.reconfigure();
    await Promise.resolve();
    await Promise.resolve();
    const secondReplacement = module.reconfigure();
    await Promise.resolve();
    expect(createClient).toHaveBeenCalledTimes(1);

    settleOld();
    await Promise.all([firstReplacement, secondReplacement]);
    expect(createClient).toHaveBeenCalledTimes(2);
    expect(usageEventRowCount(data)).toBe(0);
    module.dispose();
  });

  it('quiesce awaits an in-flight reconfigure before database ownership is released', async () => {
    const data = memoryDataLayer();
    let releaseSettings!: () => void;
    const settingsPending = new Promise<ReturnType<typeof makeSettingsVM>>((resolve) => {
      releaseSettings = () => resolve(
        makeSettingsVM({ hubBaseUrl: 'https://hub.example.com' }),
      );
    });
    const createClient = vi.fn(() => makeFakeHubClient());
    const module = createHubModule({
      data,
      settingsStore: makeDynamicSettingsStore(() => settingsPending),
      keychain: makeKeychain('agency_hub_device_test'),
      createClient,
    });
    const configuring = module.reconfigure();
    let stopped = false;
    const quiesced = module.quiesce().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);

    releaseSettings();
    await Promise.all([configuring, quiesced]);
    expect(createClient).not.toHaveBeenCalled();
    module.dispose();
  });

  it('snapshots legacy text before the activation catalog request and never uploads it', async () => {
    const data = memoryDataLayer();
    const legacy = [{ id: 'custom:legacy', name: 'Legacy', content: 'private full text' }];
    data.settings.set('personalities', legacy);
    const listAiPersonaCatalog = vi.fn(async () => {
      expect(data.settings.get(LEGACY_PERSONA_SNAPSHOT_KEY)).toEqual(expect.objectContaining({
        rows: expect.objectContaining({ personalities: legacy }),
      }));
      return [{
        key: 'custom:legacy',
        displayName: 'Legacy',
        version: 5,
        status: 'active' as const,
        definitionId: definitionId('custom:legacy', '5'),
      }];
    });
    const client = makeFakeHubClient({ listAiPersonaCatalog });
    const module = createHubModule({
      data,
      settingsStore: makeSettingsStore(
        makeSettingsVM({ hubBaseUrl: 'https://hub.example.com' }),
      ),
      keychain: makeKeychain('agency_hub_device_test'),
      createClient: () => client,
    });

    await module.reconfigure();
    await vi.waitFor(() => expect(listAiPersonaCatalog).toHaveBeenCalledTimes(1));
    expect(data.settings.get('personalities')).toEqual(legacy);
    expect(loadPersonaCatalog(data.settings, TEST_PERSONA_SCOPE)).toEqual([{
      key: 'custom:legacy',
      displayName: 'Legacy',
      version: 5,
      status: 'active',
      definitionId: definitionId('custom:legacy', '5'),
    }]);
    module.dispose();
  });

  it('accepts and loudly invalidates a restored full catalog on the bounded cadence', async () => {
    vi.useFakeTimers();
    const data = memoryDataLayer();
    const catalogs = [
      [
        {
          key: 'custom:one',
          displayName: 'One',
          version: 2,
          status: 'archived' as const,
          definitionId: definitionId('custom:one', 'before'),
        },
        {
          key: 'custom:removed',
          displayName: 'Removed',
          version: 4,
          status: 'archived' as const,
          definitionId: definitionId('custom:removed', 'before'),
        },
      ],
      [{
        key: 'custom:one',
        displayName: 'One restored',
        version: 1,
        status: 'active' as const,
        definitionId: definitionId('custom:one', 'restored'),
      }],
    ];
    const listAiPersonaCatalog = vi.fn(async () => catalogs.shift() ?? catalogs[0] ?? []);
    const client = makeFakeHubClient({ listAiPersonaCatalog });
    const onWarn = vi.fn();
    const settingsEvents: Array<{ scope: string; settingsKeys?: string[] }> = [];
    data.bus.subscribe((events) => settingsEvents.push(...events));
    const module = createHubModule({
      data,
      settingsStore: makeSettingsStore(
        makeSettingsVM({ hubBaseUrl: 'https://hub.example.com' }),
      ),
      keychain: makeKeychain('agency_hub_device_test'),
      createClient: () => client,
      onWarn,
    });

    await module.reconfigure();
    await vi.advanceTimersByTimeAsync(0);
    expect(listAiPersonaCatalog).toHaveBeenCalledTimes(1);
    data.bus.flushNow();
    settingsEvents.length = 0;

    await vi.advanceTimersByTimeAsync(PERSONA_CATALOG_REFRESH_MS);
    expect(listAiPersonaCatalog).toHaveBeenCalledTimes(2);
    expect(loadPersonaCatalog(data.settings, TEST_PERSONA_SCOPE)?.[0]).toEqual(
      expect.objectContaining({ version: 1, status: 'active' }),
    );
    expect(loadPersonaCatalog(data.settings, TEST_PERSONA_SCOPE)).toHaveLength(1);
    expect(onWarn).toHaveBeenCalledWith(
      '[hub] persona catalog incarnation changed; accepting full replacement',
      expect.objectContaining({
        missingKeys: ['custom:removed'],
        lowerVersions: [{ key: 'custom:one', previous: 2, next: 1 }],
      }),
    );
    data.bus.flushNow();
    expect(settingsEvents).toContainEqual(expect.objectContaining({
      scope: 'settings',
      settingsKeys: expect.arrayContaining([
        expect.stringMatching(/^personalities\.catalog\./),
      ]),
    }));
    module.dispose();
  });

  it('lets the latest-started catalog request win when responses settle out of order', async () => {
    const data = memoryDataLayer();
    let resolveFirst!: (value: Array<{
      key: string;
      displayName: string;
      version: number;
      status: 'active' | 'archived';
      definitionId: string;
    }>) => void;
    let resolveSecond!: typeof resolveFirst;
    const first = new Promise<Parameters<typeof resolveFirst>[0]>((resolve) => {
      resolveFirst = resolve;
    });
    const second = new Promise<Parameters<typeof resolveSecond>[0]>((resolve) => {
      resolveSecond = resolve;
    });
    let request = 0;
    const listAiPersonaCatalog = vi.fn(() => {
      request += 1;
      return request === 1 ? first : second;
    });
    const client = makeFakeHubClient({ listAiPersonaCatalog });
    const module = createHubModule({
      data,
      settingsStore: makeSettingsStore(
        makeSettingsVM({ hubBaseUrl: 'https://hub.example.com' }),
      ),
      keychain: makeKeychain('agency_hub_device_test'),
      createClient: () => client,
    });

    await module.reconfigure();
    expect(listAiPersonaCatalog).toHaveBeenCalledTimes(1);
    const foreground = module.personas.list(TEST_PERSONA_SCOPE.origin);
    expect(listAiPersonaCatalog).toHaveBeenCalledTimes(2);

    const latest = [{
      key: 'custom:one',
      displayName: 'Latest started',
      version: 1,
      status: 'active' as const,
      definitionId: definitionId('custom:one', 'latest'),
    }];
    resolveSecond(latest);
    await expect(foreground).resolves.toEqual(latest);
    resolveFirst([{
      key: 'custom:one',
      displayName: 'Older request',
      version: 99,
      status: 'archived',
      definitionId: definitionId('custom:one', 'older'),
    }]);
    await vi.waitFor(() => {
      expect(loadPersonaCatalog(data.settings, TEST_PERSONA_SCOPE)).toEqual(latest);
    });
    module.dispose();
  });

  it('refreshes the full catalog after a persona generation precondition rejection', async () => {
    const data = memoryDataLayer();
    seedAccount(data);
    const initial = [{
      key: 'builtin:lora',
      displayName: 'Lora',
      version: 1,
      definitionId: definitionId('builtin:lora', 'before-edit'),
      status: 'active' as const,
    }];
    const refreshed = [{
      key: 'builtin:lora',
      displayName: 'Lora edited',
      version: 2,
      definitionId: definitionId('builtin:lora', 'after-edit'),
      status: 'active' as const,
    }];
    const catalogs = [initial, refreshed];
    const listAiPersonaCatalog = vi.fn(async () => catalogs.shift() ?? refreshed);
    const client = makeFakeHubClient({
      listAiPersonaCatalog,
      streamAiFeature: () => Promise.reject(new HubError('http', {
        message: 'definition changed',
        detail: { status: 409, kernelCode: 'persona_definition_changed' },
      })),
    });
    const onWarn = vi.fn();
    const module = createHubModule({
      data,
      settingsStore: makeSettingsStore(
        makeSettingsVM({ hubBaseUrl: 'https://hub.example.com' }),
      ),
      keychain: makeKeychain('agency_hub_device_test'),
      createClient: () => client,
      onWarn,
    });
    await module.reconfigure();
    await vi.waitFor(() => expect(listAiPersonaCatalog).toHaveBeenCalledTimes(1));
    await Promise.resolve();

    const errors: unknown[] = [];
    module.aiFeatureGateway.stream(
      {
        feature: 'fast-reply',
        clientRequestId: '55555555-5555-4555-8555-555555555555',
        accountId: 'acct_hub',
        chatId: FAN,
        personaKey: 'builtin:lora',
        expectedPersonaDefinitionId: initial[0]!.definitionId,
        isRegeneration: false,
      },
      {
        onText: () => undefined,
        onComplete: () => undefined,
        onError: (error) => errors.push(error),
      },
    );

    await vi.waitFor(() => expect(listAiPersonaCatalog).toHaveBeenCalledTimes(2));
    expect(errors).toEqual([expect.objectContaining({ code: 'CG-FLOW-02' })]);
    expect(loadPersonaCatalog(data.settings, TEST_PERSONA_SCOPE)).toEqual(refreshed);
    expect(onWarn).toHaveBeenCalledWith(
      '[hub] persona definition proof rejected; refreshing full catalog',
      expect.objectContaining({
        personaKey: 'builtin:lora',
        reason: 'precondition-rejected',
      }),
    );
    module.dispose();
  });

  it('replays a pending summary as soon as Hub configuration becomes active', async () => {
    const data = memoryDataLayer();
    seedAccount(data);
    storePersonaAccountMapping(data.settings, TEST_PERSONA_SCOPE, 'acct_hub', 'builtin:lora');
    storePersonaCatalog(data.settings, TEST_PERSONA_SCOPE, [{
      key: 'builtin:lora',
      displayName: 'Lora',
      version: 1,
      status: 'active',
      definitionId: definitionId('builtin:lora'),
    }]);
    seedSummary(data, {
      body: 'pending local summary',
      generatedAt: Date.parse('2026-07-12T00:00:00.000Z'),
      personalityId: personaSummaryCacheIdentity(
        TEST_PERSONA_SCOPE,
        'builtin:lora',
        definitionId('builtin:lora'),
      ),
      personalityUpdatedAt: 1,
      modelId: 'kernel',
      hubSyncState: {
        state: 'pending',
        reason: 'delivery-failed',
        at: '2026-07-12T00:00:00.000Z',
      },
    });
    const client = makeFakeHubClient({
      listAiPersonaCatalog: () => Promise.resolve([{
        key: 'builtin:lora',
        displayName: 'Lora',
        version: 1,
        status: 'active',
        definitionId: definitionId('builtin:lora'),
      }]),
    });
    const module = createHubModule({
      data,
      settingsStore: makeSettingsStore(
        makeSettingsVM({ hubBaseUrl: 'https://hub.example.com' }),
      ),
      keychain: makeKeychain('agency_hub_device_test'),
      createClient: () => client,
    });

    await module.reconfigure();
    await vi.waitFor(() => expect(client.putFanProfileMock).toHaveBeenCalledTimes(1));

    expect(client.putFanProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fanId: FAN,
        body: 'pending local summary',
        generatedAtMs: Date.parse('2026-07-12T00:00:00.000Z'),
      }),
    );
    expect(data.summaries.get('acct_hub', FAN)?.hubSyncState).toMatchObject({ state: 'synced' });
    module.dispose();
  });

  it('does not carry a summary completed during an A-to-B retirement into Hub B', async () => {
    const data = memoryDataLayer();
    seedAccount(data);
    let releaseOldCatalog!: () => void;
    const oldCatalog = new Promise<[]>(resolve => {
      releaseOldCatalog = () => resolve([]);
    });
    const oldClient = makeFakeHubClient({
      listAiPersonaCatalog: () => oldCatalog,
    });
    const replacementClient = makeFakeHubClient();
    const createClient = vi.fn()
      .mockReturnValueOnce(oldClient)
      .mockReturnValue(replacementClient);
    let settings = makeSettingsVM({ hubBaseUrl: 'https://hub-a.example.com' });
    const module = createHubModule({
      data,
      settingsStore: makeDynamicSettingsStore(() => settings),
      keychain: makeKeychain('agency_hub_device_test'),
      createClient,
    });
    await module.reconfigure();
    expect(oldClient.listAiPersonaCatalog).toHaveBeenCalledTimes(1);

    settings = makeSettingsVM({ hubBaseUrl: 'https://hub-b.example.com' });
    const replacement = module.reconfigure();
    await vi.waitFor(async () => {
      expect(await module.getOfapiCreditsSummary()).toBeNull();
    });

    const body = 'completed while Hub runtime was null';
    const generatedAt = Date.parse('2026-07-13T22:30:00.000Z');
    seedSummary(data, { body, generatedAt });
    await module.summaryHub.pushSummary?.({
      accountId: 'acct_hub',
      fanId: FAN,
      body,
      generatedAt,
    });

    expect(oldClient.putFanProfileMock).not.toHaveBeenCalled();
    expect(data.summaries.get('acct_hub', FAN)?.hubSyncState).toBeUndefined();

    releaseOldCatalog();
    await replacement;
    await Promise.resolve();
    await Promise.resolve();
    expect(replacementClient.putFanProfileMock).not.toHaveBeenCalled();
    expect(data.summaries.get('acct_hub', FAN)).toMatchObject({ body, generatedAt });
    expect(data.summaries.get('acct_hub', FAN)?.hubSyncState).toBeUndefined();
    module.dispose();
  });

  it('returns the chatter-scoped OFAPI credit summary when configured', async () => {
    const data = memoryDataLayer();
    const client = makeFakeHubClient();
    const module = createHubModule({
      data,
      settingsStore: makeSettingsStore(
        makeSettingsVM({ hubBaseUrl: 'https://hub.example.com' }),
      ),
      keychain: makeKeychain('agency_hub_device_test'),
      createClient: () => client,
    });
    await module.reconfigure();

    const summary = await module.getOfapiCreditsSummary();

    expect(summary?.today).toMatchObject({
      restCredits: 1,
      webhook: { eventCount: 125, estimatedCredits: 2 },
      totalEstimatedCredits: 3,
    });
    expect(client.getOfapiCreditsSummaryMock).toHaveBeenCalledTimes(1);
    module.dispose();
  });

  it('delegates command intake only while hub credentials are configured', async () => {
    const data = memoryDataLayer();
    const client = makeFakeHubClient();
    const off = createHubModule({
      data,
      settingsStore: makeSettingsStore(
        makeSettingsVM({
          hubBaseUrl: null,
        }),
      ),
      keychain: makeKeychain(null),
      createClient: () => client,
    });
    await off.reconfigure();
    await expect(
      off.commandClient.getOfapiCommand({
        commandId: '22222222-2222-4222-8222-222222222222',
      }),
    ).rejects.toThrow('Hub command transport is not configured');

    const configured = createHubModule({
      data,
      settingsStore: makeSettingsStore(
        makeSettingsVM({ hubBaseUrl: 'https://hub.example.com' }),
      ),
      keychain: makeKeychain('agency_hub_device_test'),
      createClient: () => client,
    });
    await configured.reconfigure();
    await expect(
      configured.commandClient.getOfapiCommand({
        commandId: '22222222-2222-4222-8222-222222222222',
      }),
    ).resolves.toMatchObject({ state: 'queued' });
    expect(client.getOfapiCommand).toHaveBeenCalledTimes(1);
    configured.dispose();
    off.dispose();
  });

  it('keeps the OFAPI credit summary inert when hub is off or unavailable', async () => {
    const data = memoryDataLayer();
    const warn = vi.fn();
    const client = makeFakeHubClient({
      getOfapiCreditsSummary: () => Promise.reject(new Error('hub down')),
    });
    const module = createHubModule({
      data,
      settingsStore: makeSettingsStore(
        makeSettingsVM({
          hubBaseUrl: null,
        }),
      ),
      keychain: makeKeychain('agency_hub_device_test'),
      createClient: () => client,
      onWarn: warn,
    });
    await module.reconfigure();

    await expect(module.getOfapiCreditsSummary()).resolves.toBeNull();
    expect(client.getOfapiCreditsSummaryMock).not.toHaveBeenCalled();

    const configured = createHubModule({
      data,
      settingsStore: makeSettingsStore(
        makeSettingsVM({ hubBaseUrl: 'https://hub.example.com' }),
      ),
      keychain: makeKeychain('agency_hub_device_test'),
      createClient: () => client,
      onWarn: warn,
    });
    await configured.reconfigure();
    await expect(configured.getOfapiCreditsSummary()).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(
      '[hub] OFAPI credit summary unavailable',
      expect.objectContaining({ code: undefined, reason: undefined }),
    );
    configured.dispose();
    module.dispose();
  });

  it('reconfiguring to an empty config tears the reporter down (events park again)', async () => {
    vi.useFakeTimers();
    const data = memoryDataLayer();
    const client = makeFakeHubClient();
    const vmConfigured = makeSettingsVM({ hubBaseUrl: 'https://hub.example.com' });
    let current = vmConfigured;
    const module = createHubModule({
      data,
      settingsStore: makeDynamicSettingsStore(() => current),
      keychain: makeKeychain('agency_hub_device_test'),
      createClient: () => client,
    });
    await module.reconfigure();

    current = makeSettingsVM({
      hubBaseUrl: null,
    });
    await module.reconfigure();

    module.onUsageEvent(usagePayload({ clientEventId: 'op-parked' }));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(client.batches).toHaveLength(0);
    module.dispose();
  });
});
