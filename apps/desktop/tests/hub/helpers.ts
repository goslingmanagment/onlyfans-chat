// Scaffolding for the hub-cluster tests: real in-memory DataLayer (same
// discipline as tests/sync), a controllable HubClient fake, settings/keychain
// literal stubs, and the exact raw payload shape the AI coordinator persists
// to usage_events (src/main/ai/coordinator.ts recordUsageEvent).

import { vi } from 'vitest';
import type { HubClient, HubFanProfile, HubPage, HubUsageBatchResult, HubUsageEvent } from '@chatgoose/shared/hub/index';
import { createChangeBus, createDataLayer } from '@main/db/index';
import type { DataLayer } from '@main/db/index';
import type { SettingsStore } from '@main/settings/store';
import type { SummaryCacheEntry } from '@chatgoose/shared/summary/validity';
import type { SettingsVM } from '../../src/preload/contract';

export const TEST_DRIVER = 'bsqlite3-mc-node';
export const ACCT = 'acct_hub';
export const FAN = '90001';

export function memoryDataLayer(): DataLayer {
  return createDataLayer({
    driverPath: TEST_DRIVER,
    filePath: ':memory:',
    encryptionKey: null,
    bus: createChangeBus(0),
  });
}

export function seedAccount(data: DataLayer, username = 'loravie', id = ACCT): void {
  data.accounts.upsert({
    id,
    username,
    displayName: 'Lora Vie',
    avatar: null,
    authState: 'authenticated',
    raw: {},
  });
}

export function makeSettingsVM(overrides: Partial<SettingsVM> = {}): SettingsVM {
  return {
    hasOfapiKey: true,
    hasAnthropicKey: true,
    hasOpenRouterKey: false,
    hasHubKey: false,
    hubBaseUrl: null,
    spendStyle: 'figure',
    spendersListMappings: {},
    uiLocale: 'system',
    uiScale: 1,
    uiTheme: 'light',
    keyMeta: { ofapi: null, anthropic: null, openRouter: null, hub: null },
    featureModels: {
      'fast-reply': 'anthropic:claude-sonnet-4-6',
      'help-me': 'anthropic:claude-sonnet-4-6',
      'fan-summary': 'anthropic:claude-sonnet-4-6',
      'chat-review': 'anthropic:claude-sonnet-4-6',
      ping: 'anthropic:claude-sonnet-4-6',
    },
    featureReasoning: {
      'fast-reply': 'off',
      'help-me': 'off',
      'fan-summary': 'off',
      'chat-review': 'off',
      ping: 'off',
    },
    quickMessageCount: 100,
    pingMessageCount: 100,
    improveMessageCount: 25,
    deepMessageCount: 1500,
    promptCachingEnabled: true,
    debugMode: false,
    notificationsEnabled: true,
    soundEnabled: true,
    markAsReadOnOpen: false,
    autoReadChats: false,
    defaultReplyTone: 'casual',
    creditBudgetPerShift: null,
    accountMappings: {},
    accountOrder: [],
    accountPageLabels: {},
    ...overrides,
  };
}

export function makeSettingsStore(vm: SettingsVM): SettingsStore {
  return {
    get: () => Promise.resolve(vm),
    update: () => Promise.resolve(vm),
  };
}

export function hubPage(overrides: Partial<HubPage> = {}): HubPage {
  return {
    id: 1,
    label: 'Lora',
    platform: 'onlyfans',
    modelSlug: 'lora',
    modelName: 'Lora Vie',
    username: 'loravie',
    displayName: 'Lora Vie',
    ...overrides,
  };
}

export function hubProfile(body: string, createdAt: string): HubFanProfile {
  return {
    fan: { platform: 'onlyfans', platformUserId: FAN },
    profile: { version: 1, body, source: 'chatmuse', createdAt },
  };
}

export interface FakeHubClient extends HubClient {
  listPagesMock: ReturnType<typeof vi.fn>;
  getFanProfileMock: ReturnType<typeof vi.fn>;
  putFanProfileMock: ReturnType<typeof vi.fn>;
  postUsageBatchMock: ReturnType<typeof vi.fn>;
  batches: HubUsageEvent[][];
}

export function makeFakeHubClient(
  overrides: Partial<{
    listPages: () => Promise<HubPage[]>;
    getFanProfile: (args: { pageLabel: string; fanId: string }) => Promise<HubFanProfile | null>;
    putFanProfile: () => Promise<unknown>;
    postUsageBatch: (args: { events: HubUsageEvent[] }) => Promise<HubUsageBatchResult>;
  }> = {},
): FakeHubClient {
  const batches: HubUsageEvent[][] = [];
  const listPagesMock = vi.fn(overrides.listPages ?? (() => Promise.resolve([hubPage()])));
  const getFanProfileMock = vi.fn(overrides.getFanProfile ?? (() => Promise.resolve(null)));
  const putFanProfileMock = vi.fn(
    overrides.putFanProfile ??
      (() =>
        Promise.resolve({
          version: 1,
          body: '',
          source: 'chatmuse',
          createdAt: new Date().toISOString(),
        })),
  );
  const postUsageBatchMock = vi.fn(
    overrides.postUsageBatch ??
      ((args: { events: HubUsageEvent[] }) => {
        batches.push(args.events);
        return Promise.resolve({
          receivedCount: args.events.length,
          insertedCount: args.events.length,
          invalidCount: 0,
          dedupedCount: 0,
        });
      }),
  );
  return {
    listPages: listPagesMock,
    getFanProfile: getFanProfileMock,
    putFanProfile: putFanProfileMock,
    postUsageBatch: postUsageBatchMock,
    getServerTimeOffsetMs: () => null,
    listPagesMock,
    getFanProfileMock,
    putFanProfileMock,
    postUsageBatchMock,
    batches,
  } as FakeHubClient;
}

/** Exactly what recordUsageEvent writes into usage_events.payload. */
export function rawCoordinatorPayload(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    clientEventId: 'op-1',
    feature: 'fast-reply',
    model: 'anthropic:claude-sonnet-4-6',
    inputTokens: 1200,
    cacheCreationInputTokens: 300,
    cacheReadInputTokens: 4000,
    outputTokens: 250,
    totalTokens: 5750,
    chatId: FAN,
    durationMs: 4200,
    isCacheHit: false,
    isRegeneration: false,
    completedAt: '2026-06-11T12:00:00.000Z',
    ...overrides,
  };
}

/** Inserts a raw row the way the coordinator does (ON CONFLICT DO NOTHING). */
export function insertCoordinatorRow(data: DataLayer, payload: Record<string, unknown>): void {
  data.db
    .prepare(
      'INSERT INTO usage_events (client_event_id, payload, created_at, attempts) ' +
        'VALUES (@client_event_id, @payload, @created_at, 0) ' +
        'ON CONFLICT (client_event_id) DO NOTHING',
    )
    .run({
      client_event_id: String(payload['clientEventId']),
      payload: JSON.stringify(payload),
      created_at: String(payload['completedAt'] ?? new Date().toISOString()),
    });
}

export function usageEventRowCount(data: DataLayer): number {
  const row = data.db.prepare('SELECT COUNT(*) AS n FROM usage_events').get() as { n: number };
  return row.n;
}

export function seedSummary(
  data: DataLayer,
  entry: Partial<SummaryCacheEntry> & { body: string; generatedAt: number },
): void {
  data.summaries.put(ACCT, FAN, {
    personalityId: 'builtin:lora',
    personalityUpdatedAt: 1,
    spendingVerified: true,
    subscriptionVerified: true,
    modelId: 'anthropic:claude-sonnet-4-6',
    ...entry,
  });
}
