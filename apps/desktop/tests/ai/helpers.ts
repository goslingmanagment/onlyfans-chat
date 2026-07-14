// Shared scaffolding for the AI coordinator/context-loader tests: real
// in-memory data layer (same discipline as tests/sync), literal stubs for the
// settings store / keychain / gateway, and a frame collector.

import { vi } from 'vitest';
import {
  DEFAULT_AGENCY_HUB_BASE_URL,
  DEFAULT_FEATURE_MODELS,
  DEFAULT_FEATURE_REASONING,
} from '@chatgoose/shared/constants';
import { BUILTIN_MESSAGE_GUARD_POLICY } from '@chatgoose/shared/message-guard/index';
import type { OperationEvent } from '@chatgoose/shared/protocol/index';
import { createChangeBus, createDataLayer } from '@main/db/index';
import type { DataLayer, MessageUpsert } from '@main/db/index';
import type { OfApiClient } from '@main/ofapi/client';
import type { OfApiMessage, OfApiTransaction, OfApiUser } from '@main/ofapi/schemas';
import type { SettingsStore } from '@main/settings/store';
import type { Keychain } from '@main/secrets/keychain';
import type { AiFeatureGateway, AiFeatureGatewayRequest, AiGatewayCallbacks } from '@main/ai/gateway';
import { storePersonaCatalog } from '@main/personas/catalog';
import {
  personaStorageScopeForHub,
  storePersonaAccountMapping,
} from '@main/personas/pending';
import type { AiStartRequest, SettingsVM } from '../../src/preload/contract';

export const ACCT = 'acct_test';
export const CHAT = '4242';
export const TEST_DRIVER = 'bsqlite3-mc-node';
export const TEST_PERSONA_DEFINITION_ID = 'v1:test-persona-definition';

export function testPersonaDefinitionId(key: string, version = 1): string {
  return `${TEST_PERSONA_DEFINITION_ID}:${key}:${String(version)}`;
}

export function memoryDataLayer(): DataLayer {
  return createDataLayer({
    driverPath: TEST_DRIVER,
    filePath: ':memory:',
    encryptionKey: null,
    bus: createChangeBus(0),
  });
}

// ─── settings ─────────────────────────────────────────────────────────────

export function makeSettingsVM(overrides: Partial<SettingsVM> = {}): SettingsVM {
  return {
    hasHubKey: true,
    hubApiKeyBindingState: 'bound',
    hasHubDeviceToken: false,
    hubDeviceTokenBindingState: 'none',
    hubDeviceTokenTransition: null,
    hubBaseUrl: DEFAULT_AGENCY_HUB_BASE_URL,
    ofapiReadTransport: 'hub',
    ofapiWriteTransport: 'hub',
    aiGatewayTransport: 'feature',
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
      hub: { last4: 'core', setAt: 0 },
    },
    featureModels: { ...DEFAULT_FEATURE_MODELS },
    featureReasoning: { ...DEFAULT_FEATURE_REASONING },
    quickMessageCount: 5,
    pingMessageCount: 100,
    improveMessageCount: 5,
    deepMessageCount: 1500,
    promptCachingEnabled: true,
    debugMode: false,
    notificationsEnabled: true,
    soundEnabled: true,
    markAsReadOnOpen: false,
    // AI coordinator tests rely on fetch-through (coordinator passes
    // allowFetchThrough: settings.autoReadChats); default ON here so the deep
    // features exercise the legacy fetch path. No AI test asserts the OFF/no-fetch
    // behavior, so a true default is safe (override per-test if one ever does).
    autoReadChats: true,
    defaultReplyTone: 'casual',
    creditBudgetPerShift: null,
    accountMappings: { [ACCT]: 'builtin:lora' },
    accountOrder: [],
    accountPageLabels: {},
    ...overrides,
  };
}

export function makeSettingsStore(vm: SettingsVM): SettingsStore {
  const hubApiKey = vm.hasHubKey ? 'agency_hub_core_test' : null;
  const deviceToken = vm.hasHubDeviceToken ? 'agency_hub_device_test' : null;
  return {
    get: () => Promise.resolve(vm),
    getHubConnection: () => Promise.resolve({
      settings: vm,
      hubBaseUrl: vm.hubBaseUrl,
      bearer: deviceToken ?? hubApiKey,
      deviceToken,
      hubApiKey,
      deviceTokenTransition: null,
    }),
    update: () => Promise.resolve(vm),
    runCredentialMutation: (task) => task(),
  };
}

/**
 * The production coordinator consumes the server metadata catalog, not just
 * the local account mapping. Keep tests honest by seeding active metadata for
 * every persona key their fixture maps.
 */
export function seedActivePersonaCatalog(
  data: DataLayer,
  settings: SettingsVM,
  versions: Readonly<Record<string, number>> = {},
): void {
  if (settings.hubBaseUrl === null) return;
  data.settings.set('hubBaseUrl', settings.hubBaseUrl);
  const scope = personaStorageScopeForHub(settings.hubBaseUrl);
  const keys = [...new Set(Object.values(settings.accountMappings).filter((key) => key !== ''))];
  for (const [accountId, personaKey] of Object.entries(settings.accountMappings)) {
    storePersonaAccountMapping(data.settings, scope, accountId, personaKey || null);
  }
  storePersonaCatalog(
    data.settings,
    scope,
    keys.map((key) => ({
      key,
      displayName: key,
      version: versions[key] ?? 1,
      status: 'active' as const,
      definitionId: testPersonaDefinitionId(key, versions[key] ?? 1),
    })),
  );
}

// ─── keychain ─────────────────────────────────────────────────────────────

export function makeKeychain(secrets: Record<string, string>): Keychain {
  const store = new Map(Object.entries(secrets));
  return {
    getSecret: (name) => Promise.resolve(store.get(name) ?? null),
    setSecret: (name, value) => {
      store.set(name, value);
      return Promise.resolve();
    },
    deleteSecret: (name) => {
      store.delete(name);
      return Promise.resolve();
    },
    hasSecret: (name) => Promise.resolve(store.has(name)),
    getOrCreateGeneratedKey: (name) => {
      const existing = store.get(name);
      if (existing !== undefined) {
        return Promise.resolve(existing);
      }
      store.set(name, 'generated-key');
      return Promise.resolve('generated-key');
    },
    deleteDecommissionedSecrets: () => Promise.resolve(),
  };
}

// ─── OFAPI client stub ────────────────────────────────────────────────────

export interface MessagesPage {
  messages: OfApiMessage[];
  nextPageUrl: string | null;
}

export interface TransactionsPage {
  transactions: OfApiTransaction[];
  hasMore: boolean;
  nextMarker: number | null;
  nextPageUrl: string | null;
}

export interface StubClient {
  client: OfApiClient;
  listMessagesCalls: Array<{ firstId?: string; lastId?: string; order?: string; limit?: number }>;
  getUsersByIdsCalls: number;
  getUserByUsernameCalls: string[];
  listTransactionsCalls: Array<{ marker?: number }>;
  /** Consumed in order; the last page repeats when the queue is empty. */
  setMessagePages(pages: MessagesPage[]): void;
  /** listMessages never resolves (deep-prep timeout tests). */
  setMessagesHang(): void;
  setUser(user: OfApiUser | null): void;
  setUserError(error: Error | null): void;
  /** getUserByUsername result; null (the default) rejects like a failed lookup. */
  setUserByUsername(user: OfApiUser | null): void;
  setTransactionPages(pages: TransactionsPage[]): void;
}

export function makeStubClient(): StubClient {
  let messagePages: MessagesPage[] = [{ messages: [], nextPageUrl: null }];
  let messagePageIndex = 0;
  let messagesHang = false;
  let user: OfApiUser | null = null;
  let userError: Error | null = null;
  let userByUsername: OfApiUser | null = null;
  let transactionPages: TransactionsPage[] = [
    { transactions: [], hasMore: false, nextMarker: null, nextPageUrl: null },
  ];
  let transactionPageIndex = 0;

  const state = {
    listMessagesCalls: [] as StubClient['listMessagesCalls'],
    getUsersByIdsCalls: 0,
    getUserByUsernameCalls: [] as string[],
    listTransactionsCalls: [] as StubClient['listTransactionsCalls'],
  };

  const clientShape = {
    listMessages: vi.fn(
      (params: { firstId?: string; lastId?: string; order?: string; limit?: number }) => {
        state.listMessagesCalls.push({
          ...(params.firstId !== undefined ? { firstId: params.firstId } : {}),
          ...(params.lastId !== undefined ? { lastId: params.lastId } : {}),
          ...(params.order !== undefined ? { order: params.order } : {}),
          ...(params.limit !== undefined ? { limit: params.limit } : {}),
        });
        if (messagesHang) {
          return new Promise<MessagesPage>(() => {});
        }
        const page = messagePages[Math.min(messagePageIndex, messagePages.length - 1)];
        messagePageIndex += 1;
        return Promise.resolve(page ?? { messages: [], nextPageUrl: null });
      },
    ),
    getUserByUsername: vi.fn((params: { username: string }) => {
      state.getUserByUsernameCalls.push(params.username);
      if (userByUsername === null) {
        return Promise.reject(new Error('user lookup failed'));
      }
      return Promise.resolve(userByUsername);
    }),
    getUsersByIds: vi.fn((params: { ids: ReadonlyArray<string | number> }) => {
      state.getUsersByIdsCalls += 1;
      if (userError !== null) {
        return Promise.reject(userError);
      }
      const record: Record<string, OfApiUser> = {};
      const first = params.ids[0];
      if (user !== null && first !== undefined) {
        record[String(first)] = user;
      }
      return Promise.resolve(record);
    }),
    listTransactions: vi.fn((params: { marker?: number }) => {
      state.listTransactionsCalls.push(
        params.marker !== undefined ? { marker: params.marker } : {},
      );
      const page = transactionPages[Math.min(transactionPageIndex, transactionPages.length - 1)];
      transactionPageIndex += 1;
      return Promise.resolve(
        page ?? { transactions: [], hasMore: false, nextMarker: null, nextPageUrl: null },
      );
    }),
  };

  return {
    // Test-only widening: the coordinator/loader use exactly these four methods.
    client: clientShape as unknown as OfApiClient,
    get listMessagesCalls() {
      return state.listMessagesCalls;
    },
    get getUsersByIdsCalls() {
      return state.getUsersByIdsCalls;
    },
    get getUserByUsernameCalls() {
      return state.getUserByUsernameCalls;
    },
    get listTransactionsCalls() {
      return state.listTransactionsCalls;
    },
    setMessagePages(pages) {
      messagePages = pages;
      messagePageIndex = 0;
    },
    setMessagesHang() {
      messagesHang = true;
    },
    setUser(next) {
      user = next;
    },
    setUserError(error) {
      userError = error;
    },
    setUserByUsername(next) {
      userByUsername = next;
    },
    setTransactionPages(pages) {
      transactionPages = pages;
      transactionPageIndex = 0;
    },
  };
}

// ─── feature-gateway stub (Stage 31: the only generation lane) ───────────

export interface StubFeatureGateway {
  gateway: AiFeatureGateway;
  calls: AiFeatureGatewayRequest[];
  cb: AiGatewayCallbacks | null;
  cancelCount: number;
}

export function makeStubFeatureGateway(): StubFeatureGateway {
  const state: StubFeatureGateway = {
    calls: [],
    cb: null,
    cancelCount: 0,
    gateway: {
      stream(req, cb) {
        state.calls.push(req);
        state.cb = cb;
        return () => {
          state.cancelCount += 1;
        };
      },
    },
  };
  return state;
}

// ─── misc ─────────────────────────────────────────────────────────────────

export function sampleUser(overrides: Partial<OfApiUser> = {}): OfApiUser {
  return {
    id: Number(CHAT),
    name: 'Brad',
    username: 'brad99',
    subscribedOn: true,
    subscribedOnData: {
      totalSumm: 120,
      subscribesSumm: 20,
      tipsSumm: 60,
      messagesSumm: 40,
      subscribeAt: '2026-01-01T00:00:00+00:00',
      subscribePrice: 10,
      subscribes: [{ isCurrent: true, cancelDate: null }],
    },
    ...overrides,
  };
}

/** seedMessages timeline anchor; messages land one minute apart from here. */
export const SEED_BASE_MS = Date.parse('2026-06-10T12:00:00.000Z');

export function seedMessages(data: DataLayer, count: number, startId = 1): void {
  const rows: MessageUpsert[] = [];
  for (let offset = 0; offset < count; offset += 1) {
    const i = startId + offset;
    rows.push({
      accountId: ACCT,
      chatId: CHAT,
      messageId: String(i),
      createdAt: new Date(SEED_BASE_MS + i * 60_000).toISOString(),
      isSentByMe: i % 2 === 0,
      textHtml: `<p>message ${i}</p>`,
      textPlain: `message ${i}`,
      price: 0,
      isOpened: null,
      isNew: false,
      isTip: false,
      tipAmount: null,
      tipText: null,
      replyTo: null,
      media: [],
      deleted: false,
      raw: { id: i },
    });
  }
  data.messages.upsertMany(rows);
}

export function startRequest(overrides: Partial<AiStartRequest> = {}): AiStartRequest {
  return {
    operationId: 'op-1',
    feature: 'fast-reply',
    accountId: ACCT,
    chatId: CHAT,
    params: {},
    ...overrides,
  };
}

export function framesOfType<T extends OperationEvent['type']>(
  frames: OperationEvent[],
  type: T,
): Array<Extract<OperationEvent, { type: T }>> {
  const matched: Array<Extract<OperationEvent, { type: T }>> = [];
  for (const frame of frames) {
    if (frame.type === type) {
      // Discriminated-union narrowing through the generic needs the indexed form.
      matched.push(frame as Extract<OperationEvent, { type: T }>);
    }
  }
  return matched;
}

/** Drains chained microtasks (the pipeline awaits resolve through stub promises). */
export async function flushAsync(rounds = 40): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await Promise.resolve();
  }
}
