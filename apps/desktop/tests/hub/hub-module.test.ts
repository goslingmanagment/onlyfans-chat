// Hub module composition: inert when explicitly unconfigured, live
// usage pipeline when configured (coordinator payload → mapper → reporter →
// batch over the injected client), persisted-backlog flush on reconfigure,
// and clean teardown when the config is removed.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHubModule } from '@main/hub/index';
import type { SettingsStore } from '@main/settings/store';
import type { UsageEventRecord } from '@main/ai/index';
import type { Keychain } from '@main/secrets/keychain';
import {
  createPendingPersonaArchive,
  createPendingPersonaUpsert,
  ensurePersonaStorageScope,
  legacyRecoveredPersona,
  loadPendingPersonaIntents,
  personaAccountMappingsKey,
  personaCacheKey,
  personaLegacyRecoveryKey,
  personaStorageScopeForHub,
  storePendingPersonaIntent,
} from '@main/personas/pending';
import { HubError } from '@chatgoose/shared/hub/index';
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

interface PersonaUpsertArgs {
  key: string;
  displayName: string;
  systemBlock: string;
  expectedVersion?: number | null;
}

function personaResponse(args: PersonaUpsertArgs, version = 1) {
  return {
    key: args.key,
    displayName: args.displayName,
    systemBlock: args.systemBlock,
    updatedAt: new Date().toISOString(),
    version,
  };
}

function makeKeychain(hubApiKey: string | null): Pick<Keychain, 'getSecret'> {
  return { getSecret: (name) => Promise.resolve(name === 'hubApiKey' ? hubApiKey : null) };
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
      const hubApiKey = settings.hasHubKey ? 'agency_hub_core_x' : null;
      return {
        settings,
        hubBaseUrl: settings.hubBaseUrl,
        bearer: deviceToken ?? hubApiKey,
        deviceToken,
        hubApiKey,
        deviceTokenTransition: null,
      };
    },
    runCredentialMutation: (task) => task(),
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
          hasHubKey: false,
          keyMeta: { hub: null },
        }),
      ),
      keychain: makeKeychain('agency_hub_core_x'),
      createClient: () => client,
    });
    await module.reconfigure();

    await expect(
      module.summaryHub.prefetchSummary?.({ accountId: 'acct_hub', fanId: FAN }),
    ).resolves.toBeNull();
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
        makeSettingsVM({ hubBaseUrl: 'https://hub.example.com', hasHubKey: true }),
      ),
      keychain: makeKeychain('agency_hub_core_x'),
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

  it('flushes the persisted backlog from a previous session on reconfigure', async () => {
    vi.useFakeTimers();
    const data = memoryDataLayer();
    insertCoordinatorRow(data, rawCoordinatorPayload({ clientEventId: 'op-backlog' }));
    const client = makeFakeHubClient();
    const module = createHubModule({
      data,
      settingsStore: makeSettingsStore(
        makeSettingsVM({ hubBaseUrl: 'https://hub.example.com', hasHubKey: true }),
      ),
      keychain: makeKeychain('agency_hub_core_x'),
      createClient: () => client,
    });
    await module.reconfigure();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(client.batches.flat().map((event) => event.clientEventId)).toEqual(['op-backlog']);
    expect(usageEventRowCount(data)).toBe(0);
    module.dispose();
  });

  it('shares quiescence and waits for the retiring usage reporter exactly once', async () => {
    vi.useFakeTimers();
    const data = memoryDataLayer();
    insertCoordinatorRow(data, rawCoordinatorPayload({ clientEventId: 'op-quiesce' }));
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
        makeSettingsVM({ hubBaseUrl: 'https://hub.example.com', hasHubKey: true }),
      ),
      keychain: makeKeychain('agency_hub_core_x'),
      createClient: () => client,
    });
    await module.reconfigure();
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
    insertCoordinatorRow(data, rawCoordinatorPayload({ clientEventId: 'op-retire' }));
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
        makeSettingsVM({ hubBaseUrl: 'https://hub.example.com', hasHubKey: true }),
      ),
      keychain: makeKeychain('agency_hub_core_x'),
      createClient,
    });
    await module.reconfigure();
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
        makeSettingsVM({ hubBaseUrl: 'https://hub.example.com', hasHubKey: true }),
      );
    });
    const createClient = vi.fn(() => makeFakeHubClient());
    const module = createHubModule({
      data,
      settingsStore: makeDynamicSettingsStore(() => settingsPending),
      keychain: makeKeychain('agency_hub_core_x'),
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

  it('does not start another persona upsert after reconfigure retires the client', async () => {
    const data = memoryDataLayer();
    data.settings.set('personalities', [
      { id: 'custom:first', name: 'First', content: 'First prompt' },
      { id: 'custom:second', name: 'Second', content: 'Second prompt' },
    ]);
    let releaseFirst!: () => void;
    const firstInFlight = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const client = makeFakeHubClient();
    const upsertAiPersona = vi.fn(async (args: PersonaUpsertArgs) => {
      if (args.key === 'custom:first') {
        await firstInFlight;
      }
      return personaResponse(args);
    });
    client.upsertAiPersona = upsertAiPersona;
    let current = makeSettingsVM({ hubBaseUrl: 'https://hub.example.com', hasHubKey: true });
    const module = createHubModule({
      data,
      settingsStore: makeDynamicSettingsStore(() => current),
      keychain: makeKeychain('agency_hub_core_x'),
      createClient: () => client,
    });

    await module.reconfigure();
    await vi.waitFor(() => expect(upsertAiPersona).toHaveBeenCalledTimes(1));

    current = makeSettingsVM({
      hubBaseUrl: null,
      hasHubKey: false,
      keyMeta: { hub: null },
    });
    const retiring = module.reconfigure();
    await Promise.resolve();
    releaseFirst();
    await retiring;

    expect(upsertAiPersona).toHaveBeenCalledTimes(1);
    module.dispose();
  });

  it.each(['upsert', 'archive'] as const)(
    'replays a durable pending persona %s before legacy bootstrap after restart',
    async (action) => {
      const data = memoryDataLayer();
      const pendingPersona = {
        id: 'custom:pending',
        name: 'Pending',
        content: 'new durable prompt',
        updatedAt: 2,
      };
      data.settings.set('personalities', [
        // This is deliberately stale for the upsert case and deliberately
        // still present for the archive case, matching the two crash windows
        // between journal persistence, network completion and cache update.
        { ...pendingPersona, content: 'stale cached prompt', updatedAt: 1 },
        { id: 'custom:sentinel', name: 'Sentinel', content: 'bootstrap complete', updatedAt: 1 },
      ]);
      storePendingPersonaIntent(
        data.settings,
        null,
        action === 'upsert'
          ? createPendingPersonaUpsert(pendingPersona)
          : createPendingPersonaArchive(pendingPersona.id),
      );

      const client = makeFakeHubClient();
      const upsertAiPersona = vi.fn(
        (args: PersonaUpsertArgs) => Promise.resolve(personaResponse(args)),
      );
      const archiveAiPersona = vi.fn(() => Promise.resolve({ archived: true, version: 2 }));
      client.upsertAiPersona = upsertAiPersona;
      client.archiveAiPersona = archiveAiPersona;
      const module = createHubModule({
        data,
        settingsStore: makeSettingsStore(
          makeSettingsVM({ hubBaseUrl: 'https://hub.example.com', hasHubKey: true }),
        ),
        keychain: makeKeychain('agency_hub_core_x'),
        createClient: () => client,
      });

      await module.reconfigure();
      await vi.waitFor(() => {
        expect(loadPendingPersonaIntents(data.settings, TEST_PERSONA_SCOPE)).toEqual([]);
        expect(upsertAiPersona).toHaveBeenCalledWith(expect.objectContaining({
          key: 'custom:sentinel',
        }));
      });

      const pendingUpserts = upsertAiPersona.mock.calls
        .map(([args]) => args)
        .filter((args) => args.key === pendingPersona.id);
      const cachedAfterReplay = data.settings.get(personaCacheKey(TEST_PERSONA_SCOPE)) as Array<{
        id: string;
        content: string;
        remoteVersion?: number;
      }>;
      expect(cachedAfterReplay.find((persona) => persona.id === 'custom:sentinel')?.remoteVersion)
        .toBe(1);
      if (action === 'upsert') {
        expect(pendingUpserts).toEqual([{
          key: pendingPersona.id,
          displayName: pendingPersona.name,
          systemBlock: pendingPersona.content,
          expectedVersion: null,
        }]);
        expect(cachedAfterReplay.find((persona) => persona.id === pendingPersona.id)?.content)
          .toBe(pendingPersona.content);
        expect(archiveAiPersona).not.toHaveBeenCalled();
      } else {
        expect(pendingUpserts).toEqual([]);
        expect(cachedAfterReplay.some((persona) => persona.id === pendingPersona.id)).toBe(false);
        expect(archiveAiPersona).toHaveBeenCalledExactlyOnceWith({
          key: pendingPersona.id,
          expectedVersion: null,
        });
      }
      module.dispose();
    },
  );

  it('stops restart replay after the first transport failure and retains later intents', async () => {
    const data = memoryDataLayer();
    const first = { id: 'custom:first', name: 'First', content: 'first prompt', updatedAt: 1 };
    const second = { id: 'custom:second', name: 'Second', content: 'second prompt', updatedAt: 1 };
    data.settings.set('personalities', [first, second]);
    storePendingPersonaIntent(data.settings, null, createPendingPersonaUpsert(first));
    storePendingPersonaIntent(data.settings, null, createPendingPersonaUpsert(second));
    const client = makeFakeHubClient();
    const upsertAiPersona = vi.fn(async () => {
      throw new Error('offline');
    });
    client.upsertAiPersona = upsertAiPersona;
    const onWarn = vi.fn();
    const module = createHubModule({
      data,
      settingsStore: makeSettingsStore(
        makeSettingsVM({ hubBaseUrl: 'https://hub.example.com', hasHubKey: true }),
      ),
      keychain: makeKeychain('agency_hub_core_x'),
      createClient: () => client,
      onWarn,
    });

    await module.reconfigure();
    await vi.waitFor(() => expect(onWarn).toHaveBeenCalledWith(
      '[hub] pending persona replay deferred',
      expect.objectContaining({ personaKey: first.id, failure: 'retryable' }),
    ));

    expect(upsertAiPersona).toHaveBeenCalledTimes(1);
    expect(loadPendingPersonaIntents(data.settings, TEST_PERSONA_SCOPE)).toHaveLength(2);
    module.dispose();
  });

  it('preserves an offline stale edit as a recovered copy instead of overwriting a newer device', async () => {
    const data = memoryDataLayer();
    const base = {
      id: 'custom:shared',
      name: 'Shared',
      content: 'version one',
      updatedAt: 1,
      remoteVersion: 1,
    };
    const offlineEdit = { ...base, content: 'A offline edit', updatedAt: 2 };
    data.settings.set('personalities', [base]);
    storePendingPersonaIntent(
      data.settings,
      null,
      createPendingPersonaUpsert(offlineEdit, 1),
    );

    const newerRemote = {
      state: 'active' as const,
      key: base.id,
      displayName: base.name,
      systemBlock: 'B newer edit',
      updatedAt: '2026-07-13T12:00:00.000Z',
      version: 2,
    };
    const states = [newerRemote];
    const recoveredArgs = legacyRecoveredPersona(offlineEdit);
    const client = makeFakeHubClient();
    client.listAiPersonaStates = vi.fn(async () => states);
    const upsertAiPersona = vi.fn(async (args: PersonaUpsertArgs) => {
      if (args.key === base.id) {
        expect(args.expectedVersion).toBe(1);
        throw new HubError('http', { detail: { status: 409 } });
      }
      expect(args).toEqual({ ...recoveredArgs, expectedVersion: null });
      const recovered = personaResponse(args, 1);
      states.push({ state: 'active', ...recovered });
      return recovered;
    });
    client.upsertAiPersona = upsertAiPersona;
    const module = createHubModule({
      data,
      settingsStore: makeSettingsStore(
        makeSettingsVM({ hubBaseUrl: TEST_PERSONA_SCOPE.origin, hasHubKey: true }),
      ),
      keychain: makeKeychain('agency_hub_core_x'),
      createClient: () => client,
    });

    await module.reconfigure();
    await vi.waitFor(() => {
      expect(loadPendingPersonaIntents(data.settings, TEST_PERSONA_SCOPE)).toEqual([]);
    });

    const cached = data.settings.get(personaCacheKey(TEST_PERSONA_SCOPE)) as Array<{
      id: string;
      content: string;
      remoteVersion?: number;
    }>;
    expect(cached).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: base.id, content: 'B newer edit', remoteVersion: 2 }),
      expect.objectContaining({
        id: recoveredArgs.key,
        content: offlineEdit.content,
        remoteVersion: 1,
      }),
    ]));
    expect(upsertAiPersona).toHaveBeenCalledTimes(2);
    expect(upsertAiPersona.mock.calls.every(([args]) => 'expectedVersion' in args)).toBe(true);
    module.dispose();
  });

  it('rejects a stale archive after another device edits and restores the newer active row', async () => {
    const data = memoryDataLayer();
    const staleBase = {
      id: 'custom:stale-archive',
      name: 'Shared',
      content: 'version one',
      updatedAt: 1,
      remoteVersion: 1,
    };
    data.settings.set(personaCacheKey(TEST_PERSONA_SCOPE), [staleBase]);
    storePendingPersonaIntent(
      data.settings,
      TEST_PERSONA_SCOPE,
      createPendingPersonaArchive(staleBase.id, 1, staleBase),
    );

    const newer = {
      state: 'active' as const,
      key: staleBase.id,
      displayName: 'Device B',
      systemBlock: 'version two',
      updatedAt: '2026-07-13T12:00:00.000Z',
      version: 2,
    };
    const client = makeFakeHubClient();
    client.listAiPersonaStates = vi.fn(async () => [newer]);
    const archiveAiPersona = vi.fn(async () => {
      throw new HubError('http', { detail: { status: 409 } });
    });
    client.archiveAiPersona = archiveAiPersona;
    const module = createHubModule({
      data,
      settingsStore: makeSettingsStore(
        makeSettingsVM({ hubBaseUrl: TEST_PERSONA_SCOPE.origin, hasHubKey: true }),
      ),
      keychain: makeKeychain('agency_hub_core_x'),
      createClient: () => client,
    });

    await module.reconfigure();
    await vi.waitFor(() => {
      expect(loadPendingPersonaIntents(data.settings, TEST_PERSONA_SCOPE)).toEqual([]);
    });

    expect(archiveAiPersona).toHaveBeenCalledExactlyOnceWith({
      key: staleBase.id,
      expectedVersion: 1,
    });
    expect(data.settings.get(personaCacheKey(TEST_PERSONA_SCOPE))).toEqual([
      expect.objectContaining({
        id: staleBase.id,
        name: newer.displayName,
        content: newer.systemBlock,
        remoteVersion: 2,
      }),
    ]);
    module.dispose();
  });

  it('archives a create whose success response was lost only after an exact payload match', async () => {
    const data = memoryDataLayer();
    const unconfirmed = {
      id: 'custom:create-timeout',
      name: 'Create timeout',
      content: 'exact local payload',
      updatedAt: 1,
      remoteVersion: null,
    };
    data.settings.set(personaCacheKey(TEST_PERSONA_SCOPE), [unconfirmed]);
    storePendingPersonaIntent(
      data.settings,
      TEST_PERSONA_SCOPE,
      createPendingPersonaArchive(unconfirmed.id, null, unconfirmed),
    );

    const active = {
      state: 'active' as const,
      key: unconfirmed.id,
      displayName: unconfirmed.name,
      systemBlock: unconfirmed.content,
      updatedAt: '2026-07-13T12:00:00.000Z',
      version: 1,
    };
    const client = makeFakeHubClient();
    client.listAiPersonaStates = vi.fn(async () => [active]);
    const archiveAiPersona = vi.fn(async (args: { expectedVersion: number | null }) => {
      if (args.expectedVersion === null) {
        throw new HubError('http', { detail: { status: 409 } });
      }
      return { archived: true, version: 2 };
    });
    client.archiveAiPersona = archiveAiPersona;
    const module = createHubModule({
      data,
      settingsStore: makeSettingsStore(
        makeSettingsVM({ hubBaseUrl: TEST_PERSONA_SCOPE.origin, hasHubKey: true }),
      ),
      keychain: makeKeychain('agency_hub_core_x'),
      createClient: () => client,
    });

    await module.reconfigure();
    await vi.waitFor(() => {
      expect(loadPendingPersonaIntents(data.settings, TEST_PERSONA_SCOPE)).toEqual([]);
    });

    expect(archiveAiPersona).toHaveBeenCalledExactlyOnceWith({
      key: unconfirmed.id,
      expectedVersion: 1,
    });
    expect(data.settings.get(personaCacheKey(TEST_PERSONA_SCOPE))).toEqual([]);
    module.dispose();
  });

  it('does not send DELETE when an old Core lacks the persona-state CAS preflight', async () => {
    const data = memoryDataLayer();
    const base = {
      id: 'custom:old-core-delete',
      name: 'Old Core guard',
      content: 'must not be deleted unconditionally',
      updatedAt: 1,
      remoteVersion: 3,
    };
    data.settings.set(personaCacheKey(TEST_PERSONA_SCOPE), [base]);
    storePendingPersonaIntent(
      data.settings,
      TEST_PERSONA_SCOPE,
      createPendingPersonaArchive(base.id, 3, base),
    );
    const client = makeFakeHubClient();
    client.listAiPersonaStates = vi.fn(async () => {
      throw new HubError('http', { detail: { status: 404 } });
    });
    const archiveAiPersona = vi.fn(async () => ({ archived: true, version: 4 }));
    client.archiveAiPersona = archiveAiPersona;
    const onWarn = vi.fn();
    const module = createHubModule({
      data,
      settingsStore: makeSettingsStore(
        makeSettingsVM({ hubBaseUrl: TEST_PERSONA_SCOPE.origin, hasHubKey: true }),
      ),
      keychain: makeKeychain('agency_hub_core_x'),
      createClient: () => client,
      onWarn,
    });

    await module.reconfigure();
    await vi.waitFor(() => expect(onWarn).toHaveBeenCalledWith(
      '[hub] pending persona replay deferred',
      expect.objectContaining({ personaKey: base.id }),
    ));

    expect(archiveAiPersona).not.toHaveBeenCalled();
    expect(loadPendingPersonaIntents(data.settings, TEST_PERSONA_SCOPE)).toHaveLength(1);
    module.dispose();
  });

  it('quarantines a stale save against a remote tombstone and never retries the 409', async () => {
    const data = memoryDataLayer();
    const stale = {
      id: 'custom:archived-remotely',
      name: 'Archived remotely',
      content: 'A stale edit',
      updatedAt: 2,
      remoteVersion: 1,
    };
    data.settings.set('personalities', [stale]);
    data.settings.set('accountMappings', { acct_one: stale.id });
    storePendingPersonaIntent(data.settings, null, createPendingPersonaUpsert(stale, 1));

    const client = makeFakeHubClient();
    client.listAiPersonaStates = vi.fn(async () => [{
      state: 'archived' as const,
      key: stale.id,
      version: 2,
    }]);
    const upsertAiPersona = vi.fn(async (args: PersonaUpsertArgs) => {
      expect(args).toEqual({
        key: stale.id,
        displayName: stale.name,
        systemBlock: stale.content,
        expectedVersion: 1,
      });
      throw new HubError('http', { detail: { status: 409 } });
    });
    client.upsertAiPersona = upsertAiPersona;
    const settingsStore = makeSettingsStore(
      makeSettingsVM({ hubBaseUrl: TEST_PERSONA_SCOPE.origin, hasHubKey: true }),
    );
    const module = createHubModule({
      data,
      settingsStore,
      keychain: makeKeychain('agency_hub_core_x'),
      createClient: () => client,
    });

    await module.reconfigure();
    await vi.waitFor(() => {
      expect(loadPendingPersonaIntents(data.settings, TEST_PERSONA_SCOPE)).toEqual([]);
    });
    expect(data.settings.get(personaCacheKey(TEST_PERSONA_SCOPE))).toEqual([]);
    expect(data.settings.get(personaLegacyRecoveryKey(TEST_PERSONA_SCOPE))).toMatchObject({
      entries: [{
        sourceKey: stale.id,
        reason: 'remote-archived',
        remoteVersion: 2,
        personality: stale,
      }],
    });
    expect(data.settings.get(personaAccountMappingsKey(TEST_PERSONA_SCOPE))).toEqual({});

    await module.reconfigure();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(upsertAiPersona).toHaveBeenCalledTimes(1);
    module.dispose();
  });

  it('replays safely after a crash window following recovered-copy creation', async () => {
    const data = memoryDataLayer();
    const base = {
      id: 'custom:crash-conflict',
      name: 'Crash conflict',
      content: 'old',
      updatedAt: 1,
      remoteVersion: 1,
    };
    const offlineEdit = { ...base, content: 'durable local', updatedAt: 2 };
    data.settings.set('personalities', [base]);
    storePendingPersonaIntent(data.settings, null, createPendingPersonaUpsert(offlineEdit, 1));

    const newerRemote = {
      state: 'active' as const,
      key: base.id,
      displayName: base.name,
      systemBlock: 'newer remote',
      updatedAt: '2026-07-13T12:00:00.000Z',
      version: 2,
    };
    const states = [newerRemote];
    const recoveredArgs = legacyRecoveredPersona(offlineEdit);
    const client = makeFakeHubClient();
    client.listAiPersonaStates = vi.fn(async () => states);
    let recoveredCreates = 0;
    let failNextProjection = false;
    client.upsertAiPersona = vi.fn(async (args: PersonaUpsertArgs) => {
      if (args.key === base.id) {
        throw new HubError('http', { detail: { status: 409 } });
      }
      recoveredCreates += 1;
      const recovered = personaResponse(args, 1);
      states.push({ state: 'active', ...recovered });
      failNextProjection = true;
      return recovered;
    });
    const originalSet = data.settings.set.bind(data.settings);
    data.settings.set = (key, value) => {
      if (failNextProjection && key === personaCacheKey(TEST_PERSONA_SCOPE)) {
        failNextProjection = false;
        throw new Error('simulated crash before local conflict projection');
      }
      originalSet(key, value);
    };
    const onWarn = vi.fn();
    const module = createHubModule({
      data,
      settingsStore: makeSettingsStore(
        makeSettingsVM({ hubBaseUrl: TEST_PERSONA_SCOPE.origin, hasHubKey: true }),
      ),
      keychain: makeKeychain('agency_hub_core_x'),
      createClient: () => client,
      onWarn,
    });

    await module.reconfigure();
    await vi.waitFor(() => expect(onWarn).toHaveBeenCalledWith(
      '[hub] pending persona replay deferred',
      expect.objectContaining({ personaKey: base.id }),
    ));
    expect(loadPendingPersonaIntents(data.settings, TEST_PERSONA_SCOPE)).toHaveLength(1);

    await module.reconfigure();
    await vi.waitFor(() => {
      expect(loadPendingPersonaIntents(data.settings, TEST_PERSONA_SCOPE)).toEqual([]);
    });
    const cached = data.settings.get(personaCacheKey(TEST_PERSONA_SCOPE)) as Array<{
      id: string;
      content: string;
    }>;
    expect(cached).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: base.id, content: 'newer remote' }),
      expect.objectContaining({ id: recoveredArgs.key, content: offlineEdit.content }),
    ]));
    expect(recoveredCreates).toBe(1);
    module.dispose();
  });

  it.each(['save', 'archive'] as const)(
    'serializes an interactive persona %s behind an in-flight bootstrap upsert',
    async (action) => {
      const data = memoryDataLayer();
      data.settings.set('personalities', [
        { id: 'custom:race', name: 'Cached', content: 'stale cached prompt' },
      ]);
      let releaseBootstrap!: () => void;
      const bootstrapInFlight = new Promise<void>((resolve) => {
        releaseBootstrap = resolve;
      });
      let remotePersona: { displayName: string; systemBlock: string } | null = null;
      const client = makeFakeHubClient();
      const upsertAiPersona = vi.fn(async (args: PersonaUpsertArgs) => {
        if (upsertAiPersona.mock.calls.length === 1) {
          await bootstrapInFlight;
        }
        remotePersona = { displayName: args.displayName, systemBlock: args.systemBlock };
        return personaResponse(args);
      });
      const archiveAiPersona = vi.fn(async () => {
        remotePersona = null;
        return { archived: true, version: 2 };
      });
      client.upsertAiPersona = upsertAiPersona;
      client.archiveAiPersona = archiveAiPersona;
      const module = createHubModule({
        data,
        settingsStore: makeSettingsStore(
          makeSettingsVM({ hubBaseUrl: 'https://hub.example.com', hasHubKey: true }),
        ),
        keychain: makeKeychain('agency_hub_core_x'),
        createClient: () => client,
      });

      await module.reconfigure();
      await vi.waitFor(() => expect(upsertAiPersona).toHaveBeenCalledTimes(1));

      const interactive = action === 'save'
        ? module.personas.upsert({
            key: 'custom:race',
            displayName: 'New',
            systemBlock: 'new prompt',
            expectedVersion: null,
          })
        : module.personas.archive({ key: 'custom:race', expectedVersion: null });
      await Promise.resolve();
      await Promise.resolve();

      // The stale bootstrap write must settle before the newer user intent is
      // allowed onto the wire. Otherwise its late response can overwrite the
      // save or resurrect the archive in Core's last-write-wins repository.
      expect(upsertAiPersona).toHaveBeenCalledTimes(1);
      expect(archiveAiPersona).not.toHaveBeenCalled();

      releaseBootstrap();
      await interactive;

      if (action === 'save') {
        expect(remotePersona).toEqual({ displayName: 'New', systemBlock: 'new prompt' });
        expect(upsertAiPersona).toHaveBeenCalledTimes(2);
      } else {
        expect(remotePersona).toBeNull();
        expect(archiveAiPersona).toHaveBeenCalledTimes(1);
      }
      module.dispose();
    },
  );

  it.each(['save', 'archive'] as const)(
    'does not enqueue stale cached data for a later persona after an interactive %s',
    async (action) => {
      const data = memoryDataLayer();
      data.settings.set('personalities', [
        { id: 'custom:blocker', name: 'Blocker', content: 'block bootstrap' },
        { id: 'custom:race', name: 'Cached', content: 'stale cached prompt' },
        { id: 'custom:sentinel', name: 'Sentinel', content: 'bootstrap complete' },
      ]);
      let releaseBlocker!: () => void;
      const blocked = new Promise<void>((resolve) => {
        releaseBlocker = resolve;
      });
      const client = makeFakeHubClient();
      const upsertAiPersona = vi.fn(async (args: PersonaUpsertArgs) => {
        if (args.key === 'custom:blocker') {
          await blocked;
        }
        return personaResponse(args);
      });
      const archiveAiPersona = vi.fn(async () => ({ archived: true, version: 2 }));
      client.upsertAiPersona = upsertAiPersona;
      client.archiveAiPersona = archiveAiPersona;
      const module = createHubModule({
        data,
        settingsStore: makeSettingsStore(
          makeSettingsVM({ hubBaseUrl: 'https://hub.example.com', hasHubKey: true }),
        ),
        keychain: makeKeychain('agency_hub_core_x'),
        createClient: () => client,
      });

      await module.reconfigure();
      await vi.waitFor(() => expect(upsertAiPersona).toHaveBeenCalledTimes(1));
      if (action === 'save') {
        await module.personas.upsert({
          key: 'custom:race',
          displayName: 'New',
          systemBlock: 'new prompt',
          expectedVersion: null,
        });
      } else {
        await module.personas.archive({ key: 'custom:race', expectedVersion: null });
      }

      releaseBlocker();
      if (action === 'save') {
        await vi.waitFor(() => expect(upsertAiPersona).toHaveBeenCalledTimes(3));
        expect(
          upsertAiPersona.mock.calls
            .map(([args]) => args)
            .filter((args) => args.key === 'custom:race'),
        ).toEqual([
          {
            key: 'custom:race',
            displayName: 'New',
            systemBlock: 'new prompt',
            expectedVersion: null,
          },
        ]);
      } else {
        await vi.waitFor(() => expect(upsertAiPersona).toHaveBeenCalledTimes(2));
        expect(upsertAiPersona).not.toHaveBeenCalledWith(expect.objectContaining({
          key: 'custom:race',
        }));
        expect(archiveAiPersona).toHaveBeenCalledTimes(1);
      }
      module.dispose();
    },
  );

  it('runs legacy bootstrap once and treats identical active Core content as migrated', async () => {
    const data = memoryDataLayer();
    data.settings.set('personalities', [
      { id: 'custom:shared', name: 'Same', content: 'same prompt', updatedAt: 1 },
    ]);
    const client = makeFakeHubClient();
    const listAiPersonaStates = vi.fn(async () => [{
      state: 'active' as const,
      key: 'custom:shared',
      displayName: 'Same',
      systemBlock: 'same prompt',
      updatedAt: '2026-07-13T00:00:00.000Z',
      version: 7,
    }]);
    const upsertAiPersona = vi.fn(async (args: PersonaUpsertArgs) => personaResponse(args));
    client.listAiPersonaStates = listAiPersonaStates;
    client.upsertAiPersona = upsertAiPersona;
    const module = createHubModule({
      data,
      settingsStore: makeSettingsStore(
        makeSettingsVM({ hubBaseUrl: 'https://hub.example.com', hasHubKey: true }),
      ),
      keychain: makeKeychain('agency_hub_core_x'),
      createClient: () => client,
    });

    await module.reconfigure();
    await vi.waitFor(() => expect(listAiPersonaStates).toHaveBeenCalledTimes(1));
    expect(data.settings.get(personaCacheKey(TEST_PERSONA_SCOPE))).toEqual([
      expect.objectContaining({
        id: 'custom:shared',
        content: 'same prompt',
        remoteVersion: 7,
      }),
    ]);
    // Retirement drains the first migration before starting the second
    // generation. Its completion marker makes this reconfigure a no-op.
    await module.reconfigure();

    expect(listAiPersonaStates).toHaveBeenCalledTimes(1);
    expect(upsertAiPersona).not.toHaveBeenCalled();
    module.dispose();
  });

  it('never overwrites an active Core row from a future-dated legacy cache and creates one recovered copy', async () => {
    const data = memoryDataLayer();
    const local = {
      id: 'custom:offline',
      name: 'Offline edit',
      content: 'ambiguous unsynced local prompt',
      // A broken/future client clock must have no conflict-resolution power.
      updatedAt: Date.parse('2035-07-14T00:00:00.000Z'),
    };
    data.settings.set('personalities', [local]);
    const client = makeFakeHubClient();
    client.listAiPersonaStates = vi.fn(async () => [{
      state: 'active' as const,
      key: local.id,
      displayName: 'Remote winner',
      systemBlock: 'authoritative Core prompt',
      updatedAt: '2026-07-13T00:00:00.000Z',
      version: 7,
    }]);
    const upsertAiPersona = vi.fn(async (args: PersonaUpsertArgs) => personaResponse(args));
    client.upsertAiPersona = upsertAiPersona;
    const module = createHubModule({
      data,
      settingsStore: makeSettingsStore(
        makeSettingsVM({ hubBaseUrl: 'https://hub.example.com', hasHubKey: true }),
      ),
      keychain: makeKeychain('agency_hub_core_x'),
      createClient: () => client,
    });

    await module.reconfigure();
    const recovered = legacyRecoveredPersona(local);
    await vi.waitFor(() => expect(upsertAiPersona).toHaveBeenCalledExactlyOnceWith({
      ...recovered,
      expectedVersion: null,
    }));
    expect(upsertAiPersona).not.toHaveBeenCalledWith(expect.objectContaining({ key: local.id }));
    expect(data.settings.get(personaLegacyRecoveryKey(TEST_PERSONA_SCOPE))).toMatchObject({
      version: 1,
      entries: [{
        sourceKey: local.id,
        reason: 'active-conflict',
        personality: local,
        remoteVersion: 7,
      }],
    });
    await module.reconfigure();
    expect(upsertAiPersona).toHaveBeenCalledTimes(1);
    module.dispose();
  });

  it('preserves a remote tombstone and records the legacy cache payload without a PUT', async () => {
    const data = memoryDataLayer();
    const local = {
      id: 'custom:archived-elsewhere',
      name: 'Offline edit',
      content: 'must not resurrect',
      updatedAt: Date.parse('2035-07-14T00:00:00.000Z'),
    };
    data.settings.set('personalities', [local]);
    const client = makeFakeHubClient();
    const listAiPersonaStates = vi.fn(async () => [{
      state: 'archived' as const,
      key: local.id,
      version: 9,
    }]);
    const upsertAiPersona = vi.fn(async (args: PersonaUpsertArgs) => personaResponse(args));
    client.listAiPersonaStates = listAiPersonaStates;
    client.upsertAiPersona = upsertAiPersona;
    const module = createHubModule({
      data,
      settingsStore: makeSettingsStore(
        makeSettingsVM({ hubBaseUrl: 'https://hub.example.com', hasHubKey: true }),
      ),
      keychain: makeKeychain('agency_hub_core_x'),
      createClient: () => client,
    });

    await module.reconfigure();
    await vi.waitFor(() => expect(listAiPersonaStates).toHaveBeenCalledTimes(1));
    expect(upsertAiPersona).not.toHaveBeenCalled();
    expect(data.settings.get(personaLegacyRecoveryKey(TEST_PERSONA_SCOPE))).toMatchObject({
      entries: [{
        sourceKey: local.id,
        reason: 'remote-archived',
        personality: local,
        remoteVersion: 9,
      }],
    });
    await module.reconfigure();
    expect(listAiPersonaStates).toHaveBeenCalledTimes(1);
    expect(upsertAiPersona).not.toHaveBeenCalled();
    module.dispose();
  });

  it('refreshes a list-to-create conflict once and never falls back to an unconditional PUT', async () => {
    const data = memoryDataLayer();
    const local = {
      id: 'custom:create-race',
      name: 'Local',
      content: 'lost create race',
      updatedAt: 1,
    };
    data.settings.set('personalities', [local]);
    const client = makeFakeHubClient();
    const listAiPersonaStates = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        state: 'archived' as const,
        key: local.id,
        version: 2,
      }]);
    const upsertAiPersona = vi.fn(async () => {
      throw new HubError('http', { detail: { status: 409 } });
    });
    client.listAiPersonaStates = listAiPersonaStates;
    client.upsertAiPersona = upsertAiPersona;
    const module = createHubModule({
      data,
      settingsStore: makeSettingsStore(
        makeSettingsVM({ hubBaseUrl: 'https://hub.example.com', hasHubKey: true }),
      ),
      keychain: makeKeychain('agency_hub_core_x'),
      createClient: () => client,
    });

    await module.reconfigure();
    await vi.waitFor(() => expect(listAiPersonaStates).toHaveBeenCalledTimes(2));
    expect(upsertAiPersona).toHaveBeenCalledExactlyOnceWith({
      key: local.id,
      displayName: local.name,
      systemBlock: local.content,
      expectedVersion: null,
    });
    expect(data.settings.get(personaLegacyRecoveryKey(TEST_PERSONA_SCOPE))).toMatchObject({
      entries: [{ sourceKey: local.id, reason: 'remote-archived', remoteVersion: 2 }],
    });
    await module.reconfigure();
    expect(listAiPersonaStates).toHaveBeenCalledTimes(2);
    expect(upsertAiPersona).toHaveBeenCalledTimes(1);
    module.dispose();
  });

  it('does not reuse a same-key Hub B edit when Hub A legacy bootstrap resumes', async () => {
    const data = memoryDataLayer();
    const hubA = 'https://hub.example.com';
    const hubB = 'http://localhost:3100';
    const localA = {
      id: 'custom:shared',
      name: 'A cached',
      content: 'A-only cached prompt',
      updatedAt: 1,
    };
    data.settings.set('personalities', [localA]);

    let current = makeSettingsVM({ hubBaseUrl: hubA, hasHubKey: true });
    const clientA = makeFakeHubClient();
    const clientB = makeFakeHubClient();
    const listA = vi.fn()
      .mockRejectedValueOnce(new Error('A temporarily unavailable'))
      .mockResolvedValue([]);
    const upsertA = vi.fn(async (args: PersonaUpsertArgs) => personaResponse(args));
    const upsertB = vi.fn(async (args: PersonaUpsertArgs) => personaResponse(args));
    clientA.listAiPersonaStates = listA;
    clientA.upsertAiPersona = upsertA;
    clientB.upsertAiPersona = upsertB;
    const module = createHubModule({
      data,
      settingsStore: makeDynamicSettingsStore(() => current),
      keychain: makeKeychain('agency_hub_core_x'),
      createClient: ({ baseUrl }) => baseUrl === hubA ? clientA : clientB,
    });

    await module.reconfigure();
    await vi.waitFor(() => expect(listA).toHaveBeenCalledTimes(1));

    current = makeSettingsVM({ hubBaseUrl: hubB, hasHubKey: true });
    await module.reconfigure();
    await module.personas.upsert({
      key: localA.id,
      displayName: 'B edit',
      systemBlock: 'B-only prompt',
      expectedVersion: null,
      expectedHubOrigin: hubB,
    });
    expect(upsertB).toHaveBeenCalledExactlyOnceWith({
      key: localA.id,
      displayName: 'B edit',
      systemBlock: 'B-only prompt',
      expectedVersion: null,
    });

    current = makeSettingsVM({ hubBaseUrl: hubA, hasHubKey: true });
    await module.reconfigure();
    await vi.waitFor(() => expect(upsertA).toHaveBeenCalledExactlyOnceWith({
      key: localA.id,
      displayName: localA.name,
      systemBlock: localA.content,
      expectedVersion: null,
    }));
    expect(upsertA).not.toHaveBeenCalledWith(expect.objectContaining({
      displayName: 'B edit',
    }));
    module.dispose();
  });

  it('drains and rejects a persona list response from a retired runtime', async () => {
    const data = memoryDataLayer();
    let releaseList!: () => void;
    const delayed = new Promise<void>((resolve) => {
      releaseList = resolve;
    });
    const client = makeFakeHubClient();
    const listAiPersonas = vi.fn(async () => {
      await delayed;
      return [{
        key: 'custom:old-hub',
        displayName: 'Old Hub',
        systemBlock: 'must not escape retirement',
        updatedAt: '2026-07-13T00:00:00.000Z',
        version: 1,
      }];
    });
    client.listAiPersonas = listAiPersonas;
    const module = createHubModule({
      data,
      settingsStore: makeSettingsStore(
        makeSettingsVM({ hubBaseUrl: 'https://hub.example.com', hasHubKey: true }),
      ),
      keychain: makeKeychain('agency_hub_core_x'),
      createClient: () => client,
    });
    await module.reconfigure();

    const oldList = module.personas.list();
    await vi.waitFor(() => expect(listAiPersonas).toHaveBeenCalledTimes(1));
    const quiescing = module.quiesce();
    releaseList();

    await expect(oldList).rejects.toMatchObject({ reason: 'network' });
    await quiescing;
    module.dispose();
  });

  it('rejects persona operations when IPC expects a different active Hub origin', async () => {
    const data = memoryDataLayer();
    const client = makeFakeHubClient();
    const listAiPersonas = vi.fn(async () => []);
    const upsertAiPersona = vi.fn(async (args: PersonaUpsertArgs) => personaResponse(args));
    const archiveAiPersona = vi.fn(async () => ({ archived: true, version: 2 }));
    client.listAiPersonas = listAiPersonas;
    client.upsertAiPersona = upsertAiPersona;
    client.archiveAiPersona = archiveAiPersona;
    const module = createHubModule({
      data,
      settingsStore: makeSettingsStore(
        makeSettingsVM({ hubBaseUrl: 'https://hub.example.com', hasHubKey: true }),
      ),
      keychain: makeKeychain('agency_hub_core_x'),
      createClient: () => client,
    });
    await module.reconfigure();

    await expect(module.personas.list('http://localhost:3100'))
      .rejects.toMatchObject({ reason: 'network' });
    await expect(module.personas.upsert({
      key: 'custom:b',
      displayName: 'B',
      systemBlock: 'B prompt',
      expectedVersion: null,
      expectedHubOrigin: 'http://localhost:3100',
    })).rejects.toMatchObject({ reason: 'network' });
    await expect(module.personas.archive({
      key: 'custom:b',
      expectedVersion: null,
      expectedHubOrigin: 'http://localhost:3100',
    }))
      .rejects.toMatchObject({ reason: 'network' });

    expect(listAiPersonas).not.toHaveBeenCalled();
    expect(upsertAiPersona).not.toHaveBeenCalled();
    expect(archiveAiPersona).not.toHaveBeenCalled();
    module.dispose();
  });

  it('never replays Hub A pending persona state into Hub B and resumes it on return to A', async () => {
    const data = memoryDataLayer();
    const pendingA = {
      id: 'custom:a',
      name: 'A',
      content: 'A-only prompt',
      updatedAt: 1,
    };
    data.settings.set('personalities', [pendingA]);
    storePendingPersonaIntent(data.settings, null, createPendingPersonaUpsert(pendingA));
    const hubA = 'https://hub.example.com';
    const hubB = 'http://localhost:3100';
    ensurePersonaStorageScope(data.settings, hubA);

    let current = makeSettingsVM({ hubBaseUrl: hubB, hasHubKey: true });
    const clientA = makeFakeHubClient();
    const clientB = makeFakeHubClient();
    const upsertA = vi.fn(async (args: PersonaUpsertArgs) => personaResponse(args));
    const upsertB = vi.fn(async (args: PersonaUpsertArgs) => personaResponse(args));
    clientA.upsertAiPersona = upsertA;
    clientB.upsertAiPersona = upsertB;
    const module = createHubModule({
      data,
      settingsStore: makeDynamicSettingsStore(() => current),
      keychain: makeKeychain('agency_hub_core_x'),
      createClient: ({ baseUrl }) => baseUrl === hubA ? clientA : clientB,
    });

    await module.reconfigure();
    await Promise.resolve();
    expect(upsertB).not.toHaveBeenCalled();

    current = makeSettingsVM({ hubBaseUrl: hubA, hasHubKey: true });
    await module.reconfigure();
    await vi.waitFor(() => {
      expect(loadPendingPersonaIntents(data.settings, TEST_PERSONA_SCOPE)).toEqual([]);
    });
    expect(upsertA).toHaveBeenCalledExactlyOnceWith({
      key: pendingA.id,
      displayName: pendingA.name,
      systemBlock: pendingA.content,
      expectedVersion: null,
    });
    expect(upsertB).not.toHaveBeenCalled();
    module.dispose();
  });

  it('replays a pending summary as soon as Hub configuration becomes active', async () => {
    const data = memoryDataLayer();
    seedAccount(data);
    seedSummary(data, {
      body: 'pending local summary',
      generatedAt: Date.parse('2026-07-12T00:00:00.000Z'),
      hubSyncState: {
        state: 'pending',
        reason: 'delivery-failed',
        at: '2026-07-12T00:00:00.000Z',
      },
    });
    const client = makeFakeHubClient();
    const module = createHubModule({
      data,
      settingsStore: makeSettingsStore(
        makeSettingsVM({ hubBaseUrl: 'https://hub.example.com', hasHubKey: true }),
      ),
      keychain: makeKeychain('agency_hub_core_x'),
      createClient: () => client,
    });

    await module.reconfigure();
    await vi.waitFor(() => expect(client.putFanProfileMock).toHaveBeenCalledTimes(1));

    expect(client.putFanProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({ fanId: FAN, body: 'pending local summary' }),
    );
    expect(data.summaries.get('acct_hub', FAN)?.hubSyncState).toMatchObject({ state: 'synced' });
    module.dispose();
  });

  it('returns the chatter-scoped OFAPI credit summary when configured', async () => {
    const data = memoryDataLayer();
    const client = makeFakeHubClient();
    const module = createHubModule({
      data,
      settingsStore: makeSettingsStore(
        makeSettingsVM({ hubBaseUrl: 'https://hub.example.com', hasHubKey: true }),
      ),
      keychain: makeKeychain('agency_hub_core_x'),
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
          hasHubKey: false,
          keyMeta: { hub: null },
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
        makeSettingsVM({ hubBaseUrl: 'https://hub.example.com', hasHubKey: true }),
      ),
      keychain: makeKeychain('agency_hub_core_x'),
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
          hasHubKey: false,
          keyMeta: { hub: null },
        }),
      ),
      keychain: makeKeychain('agency_hub_core_x'),
      createClient: () => client,
      onWarn: warn,
    });
    await module.reconfigure();

    await expect(module.getOfapiCreditsSummary()).resolves.toBeNull();
    expect(client.getOfapiCreditsSummaryMock).not.toHaveBeenCalled();

    const configured = createHubModule({
      data,
      settingsStore: makeSettingsStore(
        makeSettingsVM({ hubBaseUrl: 'https://hub.example.com', hasHubKey: true }),
      ),
      keychain: makeKeychain('agency_hub_core_x'),
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
    const vmConfigured = makeSettingsVM({ hubBaseUrl: 'https://hub.example.com', hasHubKey: true });
    let current = vmConfigured;
    const module = createHubModule({
      data,
      settingsStore: makeDynamicSettingsStore(() => current),
      keychain: makeKeychain('agency_hub_core_x'),
      createClient: () => client,
    });
    await module.reconfigure();

    current = makeSettingsVM({
      hubBaseUrl: null,
      hasHubKey: false,
      keyMeta: { hub: null },
    });
    await module.reconfigure();

    module.onUsageEvent(usagePayload({ clientEventId: 'op-parked' }));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(client.batches).toHaveLength(0);
    module.dispose();
  });
});
