// Scaffolding for the hub-cluster tests: real in-memory DataLayer (same
// discipline as tests/sync), a controllable HubClient fake, settings/keychain
// literal stubs, and the exact raw payload shape the AI coordinator persists
// to usage_events (src/main/ai/coordinator.ts recordUsageEvent).

import { vi } from 'vitest';
import type {
  HubClient,
  HubFanProfile,
  HubOfapiCreditsSummary,
  HubPage,
  HubAiGatewayStreamCallbacks,
  HubAiGatewayStreamRequest,
  HubOfapiCommand,
  HubUsageBatchResult,
  HubUsageEvent,
} from '@chatgoose/shared/hub/index';
import { DEFAULT_AGENCY_HUB_BASE_URL } from '@chatgoose/shared/constants';
import { BUILTIN_MESSAGE_GUARD_POLICY } from '@chatgoose/shared/message-guard/index';
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
    hasAnthropicKey: true,
    hasOpenRouterKey: false,
    hasHubKey: true,
    hasHubDeviceToken: false,
    hubBaseUrl: DEFAULT_AGENCY_HUB_BASE_URL,
    ofapiReadTransport: 'hub',
    ofapiWriteTransport: 'hub',
    aiGatewayTransport: 'direct',
    hubModeOverride: 'auto',
    hubSyncProtocol: 'v2',
    spendSweepRollbackToLegacy: true,
    unreadReconcile: {
      enabled: true,
      triggerOnUnreadTabOpen: true,
      triggerOnWindowFocus: true,
      triggerOnAccountFocus: true,
      focusDebounceMs: 30_000,
      immediateMaxPages: 3,
      focusedIntervalMs: 5 * 60_000,
      focusedMaxPages: 2,
      hiddenEnabled: true,
      hiddenIntervalMs: 15 * 60_000,
      hiddenMaxPages: 1,
    },
    spendStyle: 'figure',
    spendersListMappings: {},
    onlineOnlySpenders: true,
    onlineSort: 'spend',
    messageGuardPolicy: BUILTIN_MESSAGE_GUARD_POLICY,
    guardConfigTransport: 'local',
    uiLocale: 'system',
    uiScale: 1,
    uiTheme: 'light',
    keyMeta: {
      anthropic: null,
      openRouter: null,
      hub: { last4: 'core', setAt: 0 },
    },
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
    followerCount: { value: 0, available: true },
    subscriberCount: { value: 0, available: true },
    lastLightSyncAt: null,
    lastFollowerSyncAt: null,
    ...overrides,
  };
}

export function hubProfile(body: string, createdAt: string): HubFanProfile {
  return {
    fan: {
      platform: 'onlyfans',
      platformUserId: FAN,
      username: null,
      displayName: null,
      createdAtExternal: null,
      pageAlias: null,
    },
    profile: { version: 1, body, source: 'chatmuse', createdAt, createdByUserId: null },
  };
}

export interface FakeHubClient extends HubClient {
  listPagesMock: ReturnType<typeof vi.fn>;
  getFanProfileMock: ReturnType<typeof vi.fn>;
  putFanProfileMock: ReturnType<typeof vi.fn>;
  postUsageBatchMock: ReturnType<typeof vi.fn>;
  getOfapiCreditsSummaryMock: ReturnType<typeof vi.fn>;
  streamAiGatewayMock: ReturnType<typeof vi.fn>;
  streamAiFeatureMock: ReturnType<typeof vi.fn>;
  aiGatewayRequests: HubAiGatewayStreamRequest[];
  aiFeatureRequests: Array<{ feature: string; request: Record<string, unknown> }>;
  batches: HubUsageEvent[][];
}

export function makeFakeHubClient(
  overrides: Partial<{
    listPages: () => Promise<HubPage[]>;
    getFanProfile: (args: { pageLabel: string; fanId: string }) => Promise<HubFanProfile | null>;
    putFanProfile: () => Promise<unknown>;
    postUsageBatch: (args: { events: HubUsageEvent[] }) => Promise<HubUsageBatchResult>;
    getOfapiCreditsSummary: () => Promise<HubOfapiCreditsSummary>;
    streamAiGateway: (
      args: { request: HubAiGatewayStreamRequest },
      callbacks: HubAiGatewayStreamCallbacks,
    ) => Promise<string>;
    streamAiFeature: (
      args: { feature: string; request: Record<string, unknown> },
      callbacks: HubAiGatewayStreamCallbacks,
    ) => Promise<string>;
  }> = {},
): FakeHubClient {
  const batches: HubUsageEvent[][] = [];
  const aiGatewayRequests: HubAiGatewayStreamRequest[] = [];
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
  const getOfapiCreditsSummaryMock = vi.fn(
    overrides.getOfapiCreditsSummary ??
      (() =>
        Promise.resolve({
          enabled: true,
          scope: { pageIds: [1], pageCount: 1 },
          today: {
            day: '2026-06-19',
            from: '2026-06-19T00:00:00.000Z',
            to: '2026-06-20T00:00:00.000Z',
            restCredits: 1,
            webhook: { eventCount: 125, estimatedCredits: 2 },
            totalEstimatedCredits: 3,
          },
          last7d: {
            from: '2026-06-14T00:00:00.000Z',
            to: '2026-06-21T00:00:00.000Z',
            restCredits: 4,
            webhook: { eventCount: 325, estimatedCredits: 4 },
            totalEstimatedCredits: 8,
          },
          limitations: [],
        })),
  );
  const streamAiGatewayMock = vi.fn(
    overrides.streamAiGateway ??
      ((args: { request: HubAiGatewayStreamRequest }, callbacks: HubAiGatewayStreamCallbacks) => {
        aiGatewayRequests.push(args.request);
        callbacks.onText('hub reply');
        callbacks.onUsage?.({
          input_tokens: 10,
          cache_creation_input_tokens: 2,
          cache_read_input_tokens: 3,
          output_tokens: 4,
        });
        callbacks.onStopReason?.('end_turn');
        return Promise.resolve('hub reply');
      }),
  );
  const aiFeatureRequests: Array<{ feature: string; request: Record<string, unknown> }> = [];
  const streamAiFeatureMock = vi.fn(
    overrides.streamAiFeature ??
      ((args: { feature: string; request: Record<string, unknown> },
        callbacks: HubAiGatewayStreamCallbacks) => {
        aiFeatureRequests.push({ feature: args.feature, request: args.request });
        callbacks.onText('kernel ');
        callbacks.onText('reply');
        callbacks.onUsage?.({
          input_tokens: 10,
          cache_creation_input_tokens: 2,
          cache_read_input_tokens: 3,
          output_tokens: 4,
        });
        callbacks.onStopReason?.('end_turn');
        return Promise.resolve('kernel reply');
      }),
  );
  const commandResponse: HubOfapiCommand = {
    commandId: '22222222-2222-4222-8222-222222222222',
    clientCommandId: '11111111-1111-4111-8111-111111111111',
    kind: 'send_text_message_v1',
    accountId: ACCT,
    conversationId: FAN,
    state: 'queued',
    payloadHash: 'a'.repeat(64),
    retryOfCommandId: null,
    attemptCount: 0,
    lastErrorCode: null,
    lastErrorClass: null,
    verifierResult: null,
    platformMessageId: null,
    attemptStartedAt: null,
    attemptFinishedAt: null,
    createdAt: '2026-06-19T22:00:00.000Z',
    updatedAt: '2026-06-19T22:00:00.000Z',
    deduplicated: false,
  };
  const postIngestObservationsMock = vi.fn((args: { events: unknown[] }) =>
    Promise.resolve({ accepted: args.events.length, duplicates: 0 }));
  return {
    listPages: listPagesMock,
    getFanProfile: getFanProfileMock,
    putFanProfile: putFanProfileMock,
    postUsageBatch: postUsageBatchMock,
    postIngestObservations: postIngestObservationsMock,
    getOfapiCreditsSummary: getOfapiCreditsSummaryMock,
    createOfapiCommand: vi.fn(() => Promise.resolve(commandResponse)),
    getOfapiCommand: vi.fn(() => Promise.resolve(commandResponse)),
    cancelOfapiCommand: vi.fn(() => Promise.resolve({ ...commandResponse, state: 'cancelled' })),
    streamAiGateway: streamAiGatewayMock,
    streamAiFeature: streamAiFeatureMock,
    listAiPersonas: vi.fn(() => Promise.resolve([])),
    upsertAiPersona: vi.fn((args: { key: string; displayName: string; systemBlock: string }) =>
      Promise.resolve({ ...args, updatedAt: new Date().toISOString() })),
    getServerTimeOffsetMs: () => null,
    listPagesMock,
    getFanProfileMock,
    putFanProfileMock,
    postUsageBatchMock,
    getOfapiCreditsSummaryMock,
    streamAiGatewayMock,
    streamAiFeatureMock,
    aiGatewayRequests,
    aiFeatureRequests,
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
