// Hub module composition: inert when unconfigured (today's behavior), live
// usage pipeline when configured (coordinator payload → mapper → reporter →
// batch over the injected client), persisted-backlog flush on reconfigure,
// and clean teardown when the config is removed.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHubModule } from '@main/hub/index';
import type { UsageEventRecord } from '@main/ai/index';
import type { Keychain } from '@main/secrets/keychain';
import {
  insertCoordinatorRow,
  makeFakeHubClient,
  makeSettingsStore,
  makeSettingsVM,
  memoryDataLayer,
  rawCoordinatorPayload,
  usageEventRowCount,
  FAN,
} from './helpers';

function makeKeychain(hubApiKey: string | null): Pick<Keychain, 'getSecret'> {
  return { getSecret: (name) => Promise.resolve(name === 'hubApiKey' ? hubApiKey : null) };
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
      settingsStore: makeSettingsStore(makeSettingsVM()), // hubBaseUrl null
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
      settingsStore: makeSettingsStore(makeSettingsVM()),
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
      settingsStore: makeSettingsStore(makeSettingsVM()),
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
      settingsStore: {
        get: () => Promise.resolve(current),
        update: () => Promise.resolve(current),
      },
      keychain: makeKeychain('agency_hub_core_x'),
      createClient: () => client,
    });
    await module.reconfigure();

    current = makeSettingsVM(); // hub config removed
    await module.reconfigure();

    module.onUsageEvent(usagePayload({ clientEventId: 'op-parked' }));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(client.batches).toHaveLength(0);
    module.dispose();
  });
});
