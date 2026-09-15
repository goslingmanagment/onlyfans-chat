// SettingsStore (PRD F9, SPEC §10 `settings(key, value JSON)`): non-secret
// settings persist one row per field; API keys route to the OS keychain and
// never appear in the DB or in any returned view model.

import { z } from 'zod';
import {
  DEEP_MAX_MESSAGE_COUNT,
  DEEP_MIN_MESSAGE_COUNT,
  DEFAULT_AGENCY_HUB_BASE_URL,
  DEFAULT_SETTINGS,
  IMPROVE_MAX_MESSAGE_COUNT,
  IMPROVE_MIN_MESSAGE_COUNT,
  PING_MAX_MESSAGE_COUNT,
  PING_MIN_MESSAGE_COUNT,
  QUICK_MAX_MESSAGE_COUNT,
  QUICK_MIN_MESSAGE_COUNT,
} from '@chatgoose/shared';
import {
  BUILTIN_MESSAGE_GUARD_POLICY,
  messageGuardPolicySchema,
} from '@chatgoose/shared/message-guard/index';
import { HUB_MODE_OVERRIDE_SETTINGS } from '@chatgoose/shared/hub/mode';
import type {
  ModelSelectableFeature,
  ReasoningEffort,
  ReplyTone,
} from '@chatgoose/shared/types';
import { UI_LOCALE_SETTINGS } from '@chatgoose/shared/i18n/index';
import { UI_THEME_SETTINGS } from '@chatgoose/shared/theme';
import type {
  HubCredentialBindingState,
  SettingsVM,
} from '../../preload/contract';
import { HUB_DEVICE_TOKEN_HUB_SWITCH_BLOCKED_MESSAGE } from '../hub/device-token';
import {
  ensurePersonaStorageScope,
  loadPersonaAccountMappings,
  personaAccountMappingsKey,
  personaStorageScopeForHub,
} from '../personas/pending';
import type { SecretName } from '../secrets/keychain';
import {
  HUB_DEVICE_IDENTITY_KEY,
  deviceTokenDigest,
  readDeviceTokenActivation,
  readDeviceTokenBinding,
  readDeviceTokenRevocation,
  readHubDeviceIdentity,
  type HubCredentialBinding,
} from '../hub/credential-journal';

// ─── Enums mirrored from shared types (satisfies ties them to the source) ──

const MODEL_SELECTABLE_FEATURES = [
  'fast-reply',
  'help-me',
  'fan-summary',
  'chat-review',
  'ping',
] as const satisfies readonly ModelSelectableFeature[];

const REASONING_EFFORT_VALUES = [
  'off',
  'low',
  'medium',
  'high',
  'max',
] as const satisfies readonly ReasoningEffort[];

const REPLY_TONE_VALUES = [
  'none',
  'casual',
  'flirty',
  'upsell',
  'spicy',
] as const satisfies readonly ReplyTone[];

const LOOPBACK_HUB_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const PROD_HUB_ORIGIN = new URL(DEFAULT_AGENCY_HUB_BASE_URL).origin;

// ─── Persisted state ────────────────────────────────────────────────────

export type PersistedSettings = Omit<
  SettingsVM,
  | 'hasHubDeviceToken'
  | 'hubDeviceTokenBindingState'
  | 'hubDeviceTokenTransition'
  | 'hubDeviceIdentity'
  | 'appVersion'
  | 'machineLabel'
  | 'osPlatform'
  | 'keyMeta'
>;

export const PERSISTED_SETTINGS_KEYS = [
  'featureModels',
  'featureReasoning',
  'quickMessageCount',
  'pingMessageCount',
  'improveMessageCount',
  'deepMessageCount',
  'promptCachingEnabled',
  'debugMode',
  'notificationsEnabled',
  'soundEnabled',
  'markAsReadOnOpen',
  'autoReadChats',
  'defaultReplyTone',
  'creditBudgetPerShift',
  'accountMappings',
  'accountOrder',
  'hubBaseUrl',
  'ofapiReadTransport',
  'ofapiWriteTransport',
  'aiGatewayTransport',
  'hubModeOverride',
  'hubSyncProtocol',
  'spendSweepRollbackToLegacy',
  'unreadReconcile',
  'accountPageLabels',
  'spendStyle',
  'spendersListMappings',
  'onlineOnlySpenders',
  'onlineSort',
  'messageGuardPolicy',
  'guardConfigTransport',
  'uiLocale',
  'uiScale',
  'uiTheme',
] as const satisfies readonly (keyof PersistedSettings)[];

const unreadReconcileSettingsSchema = z.strictObject({
  enabled: z.boolean(),
  triggerOnUnreadTabOpen: z.boolean(),
  triggerOnWindowFocus: z.boolean(),
  triggerOnAccountFocus: z.boolean(),
  focusDebounceMs: z.number().int().min(0).max(10 * 60_000),
  immediateMaxPages: z.number().int().min(1).max(50),
  focusedIntervalMs: z.number().int().min(30_000).max(60 * 60_000),
  focusedMaxPages: z.number().int().min(1).max(50),
  hiddenEnabled: z.boolean(),
  hiddenIntervalMs: z.number().int().min(60_000).max(6 * 60 * 60_000),
  hiddenMaxPages: z.number().int().min(1).max(50),
});

function normalizeHubBaseUrl(rawValue: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawValue.trim());
  } catch {
    return null;
  }
  const isProdHub = parsed.origin === PROD_HUB_ORIGIN;
  const isLoopback = LOOPBACK_HUB_HOSTS.has(parsed.hostname);
  if (!isProdHub && !isLoopback) return null;
  if (isProdHub && parsed.protocol !== 'https:') return null;
  if (isLoopback && parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (parsed.pathname !== '' && parsed.pathname !== '/') return null;
  parsed.pathname = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.origin;
}

const hubBaseUrlSchema = z.string().min(1).transform((value, ctx) => {
  const normalized = normalizeHubBaseUrl(value);
  if (normalized === null) {
    ctx.addIssue({
      code: 'custom',
      message: 'Hub URL must be https://gosling-agency.ru or a loopback dev URL.',
    });
    return z.NEVER;
  }
  return normalized;
}).nullable();

/** Canonical synchronous interpretation of the persisted Hub URL row.
 * Missing/corrupt/legacy values match readField('hubBaseUrl') and fall back to
 * the production default; valid values are normalized by the same schema. */
export function effectivePersistedHubBaseUrl(raw: unknown): string | null {
  if (raw === undefined) return DEFAULT_AGENCY_HUB_BASE_URL;
  const parsed = hubBaseUrlSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_AGENCY_HUB_BASE_URL;
}

const persistedFieldSchemas = {
  featureModels: z.record(z.enum(MODEL_SELECTABLE_FEATURES), z.string().min(1)),
  featureReasoning: z.record(z.enum(MODEL_SELECTABLE_FEATURES), z.enum(REASONING_EFFORT_VALUES)),
  quickMessageCount: z.number().int().min(QUICK_MIN_MESSAGE_COUNT).max(QUICK_MAX_MESSAGE_COUNT),
  pingMessageCount: z.number().int().min(PING_MIN_MESSAGE_COUNT).max(PING_MAX_MESSAGE_COUNT),
  improveMessageCount: z
    .number()
    .int()
    .min(IMPROVE_MIN_MESSAGE_COUNT)
    .max(IMPROVE_MAX_MESSAGE_COUNT),
  deepMessageCount: z.number().int().min(DEEP_MIN_MESSAGE_COUNT).max(DEEP_MAX_MESSAGE_COUNT),
  promptCachingEnabled: z.boolean(),
  debugMode: z.boolean(),
  notificationsEnabled: z.boolean(),
  soundEnabled: z.boolean(),
  markAsReadOnOpen: z.boolean(),
  autoReadChats: z.boolean(),
  defaultReplyTone: z.enum(REPLY_TONE_VALUES),
  creditBudgetPerShift: z.number().positive().nullable(),
  accountMappings: z.record(z.string(), z.string()),
  // Owner-chosen left-rail account order (account ids, top→bottom); drag-sorted.
  accountOrder: z.array(z.string().min(1)).max(200),
  // Agency Hub core base URL (SPEC §6.2/§9); null = hub mode off.
  hubBaseUrl: hubBaseUrlSchema,
  // C6 custody bridge: GETs may be direct or hub.
  // Stage 24 / DP 8: reads are hub-only. Stored 'direct' values fail this
  // literal and coerce to the default on load (readField falls back).
  ofapiReadTransport: z.literal('hub'),
  // C6b+ hard invariant: all app writes go through Hub commands.
  ofapiWriteTransport: z.literal('hub'),
  // Stage 31 cutover: the kernel feature-service lane is the ONLY AI lane.
  // Stored 'direct'/'hub' values fail this literal and coerce to the default
  // on load (readField falls back) — the ofapiReadTransport precedent, third
  // and last application. The field itself is removed next release.
  aiGatewayTransport: z.literal('feature'),
  // Dev/support-only override for D3 diagnostics. Default auto.
  hubModeOverride: z.enum(HUB_MODE_OVERRIDE_SETTINGS),
  // Kernel Stage 24 rollout-window-only fallback: 'v1' re-points the SSE
  // consumer at the legacy stream. NOT surfaced in UI — flip via the settings
  // file per the ops runbook; the field and the v1 path are deleted after
  // fleet confirmation.
  hubSyncProtocol: z.enum(['v2', 'v1']),
  // D6 rollback guard: true forces the old 10-minute fan-spend sweep.
  spendSweepRollbackToLegacy: z.boolean(),
  unreadReconcile: unreadReconcileSettingsSchema,
  // Manual OFAPI accountId → core page-label overrides (SPEC §8.5).
  accountPageLabels: z.record(z.string(), z.string()),
  // Chat-list lifetime-spend style (DESIGN §1): bare figure (default) or chip.
  spendStyle: z.enum(['figure', 'chip']),
  // Spenders board: per-account ordered OM list ids → shelves (PLAN item 12).
  spendersListMappings: z.record(z.string(), z.array(z.string().min(1).max(64)).max(50)),
  // Online surface (variant C): «Только спендеры» default + sort tab.
  onlineOnlySpenders: z.boolean(),
  onlineSort: z.enum(['spend', 'recent']),
  // Message Guard: local-first policy cache. P3 editor/core transport can update this.
  messageGuardPolicy: messageGuardPolicySchema,
  guardConfigTransport: z.enum(['local', 'hub']),
  // Interface language; 'system' resolves from the OS locale at runtime.
  uiLocale: z.enum(UI_LOCALE_SETTINGS),
  // Window zoom factor — fixed steps only, applied via webContents.setZoomFactor.
  uiScale: z.union([z.literal(0.9), z.literal(1), z.literal(1.1), z.literal(1.25)]),
  // Color theme; 'system' follows the OS scheme (nativeTheme + matchMedia).
  uiTheme: z.enum(UI_THEME_SETTINGS),
};

/** Synchronous, schema-equivalent read for network destination fences. */
export function effectivePersistedAccountPageLabels(raw: unknown): Record<string, string> {
  const parsed = persistedFieldSchemas.accountPageLabels.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

interface FieldValidator<T> {
  safeParse(data: unknown): { success: true; data: T } | { success: false; data?: undefined };
}

// Compile-time proof every field schema parses to its SettingsVM field type.
const fieldValidators: {
  [K in keyof PersistedSettings]: FieldValidator<PersistedSettings[K]>;
} = persistedFieldSchemas;

export const PERSISTED_DEFAULTS: PersistedSettings = {
  featureModels: { ...DEFAULT_SETTINGS.featureModels },
  featureReasoning: { ...DEFAULT_SETTINGS.featureReasoning },
  quickMessageCount: DEFAULT_SETTINGS.quickMessageCount,
  pingMessageCount: DEFAULT_SETTINGS.pingMessageCount,
  improveMessageCount: DEFAULT_SETTINGS.improveMessageCount,
  deepMessageCount: DEFAULT_SETTINGS.deepMessageCount,
  promptCachingEnabled: DEFAULT_SETTINGS.promptCachingEnabled,
  debugMode: DEFAULT_SETTINGS.debugMode,
  notificationsEnabled: true,
  soundEnabled: true,
  // P3 is strictly read-only toward OFAPI — mark-as-read stays off by default.
  markAsReadOnOpen: false,
  // Default OFF = no automatic OFAPI message-body reads (every such GET marks
  // the chat read on OnlyFans, which the fan sees instantly).
  autoReadChats: false,
  defaultReplyTone: DEFAULT_SETTINGS.defaultReplyTone,
  creditBudgetPerShift: null,
  accountMappings: {},
  accountOrder: [],
  hubBaseUrl: DEFAULT_AGENCY_HUB_BASE_URL,
  ofapiReadTransport: 'hub',
  ofapiWriteTransport: 'hub',
  aiGatewayTransport: 'feature',
  hubModeOverride: 'auto',
  hubSyncProtocol: 'v2',
  spendSweepRollbackToLegacy: false,
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
  accountPageLabels: {},
  spendStyle: 'figure',
  spendersListMappings: {},
  // Owner: «Только спендеры» ships ON; default sort by lifetime spend.
  onlineOnlySpenders: true,
  onlineSort: 'spend',
  messageGuardPolicy: BUILTIN_MESSAGE_GUARD_POLICY,
  guardConfigTransport: 'local',
  uiLocale: 'system',
  uiScale: 1,
  // Light stays the default (owner decision 2026-06-13: dark is opt-in).
  uiTheme: 'light',
};

// ─── Patch schema (IPC trust boundary for cmd:settings.update) ──────────

export const settingsPatchSchema = z.strictObject({
  featureModels: persistedFieldSchemas.featureModels.optional(),
  featureReasoning: persistedFieldSchemas.featureReasoning.optional(),
  quickMessageCount: persistedFieldSchemas.quickMessageCount.optional(),
  pingMessageCount: persistedFieldSchemas.pingMessageCount.optional(),
  improveMessageCount: persistedFieldSchemas.improveMessageCount.optional(),
  deepMessageCount: persistedFieldSchemas.deepMessageCount.optional(),
  promptCachingEnabled: persistedFieldSchemas.promptCachingEnabled.optional(),
  debugMode: persistedFieldSchemas.debugMode.optional(),
  notificationsEnabled: persistedFieldSchemas.notificationsEnabled.optional(),
  soundEnabled: persistedFieldSchemas.soundEnabled.optional(),
  markAsReadOnOpen: persistedFieldSchemas.markAsReadOnOpen.optional(),
  autoReadChats: persistedFieldSchemas.autoReadChats.optional(),
  defaultReplyTone: persistedFieldSchemas.defaultReplyTone.optional(),
  creditBudgetPerShift: persistedFieldSchemas.creditBudgetPerShift.optional(),
  accountMappings: persistedFieldSchemas.accountMappings.optional(),
  accountOrder: persistedFieldSchemas.accountOrder.optional(),
  hubBaseUrl: persistedFieldSchemas.hubBaseUrl.optional(),
  ofapiReadTransport: persistedFieldSchemas.ofapiReadTransport.optional(),
  ofapiWriteTransport: persistedFieldSchemas.ofapiWriteTransport.optional(),
  aiGatewayTransport: persistedFieldSchemas.aiGatewayTransport.optional(),
  hubModeOverride: persistedFieldSchemas.hubModeOverride.optional(),
  hubSyncProtocol: persistedFieldSchemas.hubSyncProtocol.optional(),
  spendSweepRollbackToLegacy: persistedFieldSchemas.spendSweepRollbackToLegacy.optional(),
  unreadReconcile: persistedFieldSchemas.unreadReconcile.optional(),
  accountPageLabels: persistedFieldSchemas.accountPageLabels.optional(),
  spendStyle: persistedFieldSchemas.spendStyle.optional(),
  spendersListMappings: persistedFieldSchemas.spendersListMappings.optional(),
  onlineOnlySpenders: persistedFieldSchemas.onlineOnlySpenders.optional(),
  onlineSort: persistedFieldSchemas.onlineSort.optional(),
  messageGuardPolicy: persistedFieldSchemas.messageGuardPolicy.optional(),
  guardConfigTransport: persistedFieldSchemas.guardConfigTransport.optional(),
  uiLocale: persistedFieldSchemas.uiLocale.optional(),
  uiScale: persistedFieldSchemas.uiScale.optional(),
  uiTheme: persistedFieldSchemas.uiTheme.optional(),
});

export type ValidatedSettingsPatch = z.infer<typeof settingsPatchSchema>;

// ─── Storage + keychain seams ────────────────────────────────────────────

/**
 * Minimal settings-table access; matches the shape of the db module's
 * SettingsQueries (src/main/db/queries/settings.ts) so it can be passed in
 * directly. Coordinate shape: settings(key TEXT PK, value JSON).
 */
export interface SettingsQueries {
  /** Parsed JSON value, or undefined when unset. May throw on corrupt rows. */
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  remove(key: string): void;
  batch(mutations: readonly SettingsMutation[]): void;
  /** All settings except schema_version (D1-N1: hub-switch cursor wipe). */
  all(): Record<string, unknown>;
}

export type SettingsMutation =
  | { kind: 'set'; key: string; value: unknown }
  | { kind: 'remove'; key: string };

/** Narrow keychain view the settings store depends on (Keychain satisfies it). */
export interface SecretStoreLike {
  getSecret(name: SecretName): Promise<string | null>;
  hasSecret(name: SecretName): Promise<boolean>;
  setSecret(name: SecretName, value: string): Promise<void>;
  deleteSecret(name: SecretName): Promise<void>;
}

export interface SettingsStore {
  get(): Promise<SettingsVM>;
  /** One queue-owned view of the coordinates and selected bearer. */
  getHubConnection(): Promise<HubConnectionSnapshot>;
  /** zod-validates the patch (throws on invalid), persists, returns the full VM. */
  update(patch: unknown): Promise<SettingsVM>;
  /** Device activation/revocation staging uses this same queue so an atomic
   * connection read cannot interleave with secret/journal promotion. */
  runCredentialMutation<Result>(task: () => Promise<Result>): Promise<Result>;
  /** D19: tokens bound BEFORE this build have no identity record — rebuild a
   * minimal one (null username/dates, honest UI fallbacks) so the fleet's
   * connected card is not blank until the next re-sign-in. */
  backfillHubDeviceIdentity(label: string): Promise<boolean>;
}

export interface HubConnectionSnapshot {
  settings: SettingsVM;
  hubBaseUrl: string | null;
  /** The one hub bearer: the bound device token, or null (D35). */
  bearer: string | null;
  deviceToken: string | null;
  deviceTokenTransition: 'activation' | 'revocation' | null;
}

export interface SettingsStoreOptions {
  queries: SettingsQueries;
  secrets: SecretStoreLike;
  /** Shown in Hub diagnostics (SettingsVM.appVersion); app.getVersion() in prod. */
  appVersion?: string;
  /** Machine hostname for the diagnostics row; hostname() in prod. */
  machineLabel?: string;
  /** OS platform tag for the diagnostics row; process.platform in prod. */
  osPlatform?: string;
}

export function createSettingsStore(options: SettingsStoreOptions): SettingsStore {
  const { queries, secrets } = options;
  const appVersion = options.appVersion ?? '0.0.0';
  const machineLabel = options.machineLabel ?? 'device';
  const osPlatform = options.osPlatform ?? 'unknown';

  function readField<K extends keyof PersistedSettings>(key: K): PersistedSettings[K] {
    let json: unknown;
    try {
      json = queries.get(key);
    } catch {
      return structuredClone(PERSISTED_DEFAULTS[key]);
    }
    if (json === undefined) return structuredClone(PERSISTED_DEFAULTS[key]);
    const result = fieldValidators[key].safeParse(json);
    // Corrupt/legacy rows fall back to defaults rather than wedging startup.
    return result.success ? result.data : structuredClone(PERSISTED_DEFAULTS[key]);
  }

  function readPersisted(options: { migratePersonaScope?: boolean } = {}): PersistedSettings {
    // Persona selections are Hub-owned configuration just like the personas
    // themselves. Resolve the effective origin before reading mappings so an
    // A -> B switch cannot hand B an account -> A-persona reference.
    const hubBaseUrl = readField('hubBaseUrl');
    const personaScope = (options.migratePersonaScope ?? true)
      ? ensurePersonaStorageScope(queries, hubBaseUrl)
      : hubBaseUrl === null
        ? null
        : personaStorageScopeForHub(hubBaseUrl);
    return {
      featureModels: readField('featureModels'),
      featureReasoning: readField('featureReasoning'),
      quickMessageCount: readField('quickMessageCount'),
      pingMessageCount: readField('pingMessageCount'),
      improveMessageCount: readField('improveMessageCount'),
      deepMessageCount: readField('deepMessageCount'),
      promptCachingEnabled: readField('promptCachingEnabled'),
      debugMode: readField('debugMode'),
      notificationsEnabled: readField('notificationsEnabled'),
      soundEnabled: readField('soundEnabled'),
      markAsReadOnOpen: readField('markAsReadOnOpen'),
      autoReadChats: readField('autoReadChats'),
      defaultReplyTone: readField('defaultReplyTone'),
      creditBudgetPerShift: readField('creditBudgetPerShift'),
      accountMappings: loadPersonaAccountMappings(queries, personaScope),
      accountOrder: readField('accountOrder'),
      hubBaseUrl,
      ofapiReadTransport: readField('ofapiReadTransport'),
      ofapiWriteTransport: readField('ofapiWriteTransport'),
      aiGatewayTransport: readField('aiGatewayTransport'),
      hubModeOverride: readField('hubModeOverride'),
      hubSyncProtocol: readField('hubSyncProtocol'),
      spendSweepRollbackToLegacy: readField('spendSweepRollbackToLegacy'),
      unreadReconcile: readField('unreadReconcile'),
      accountPageLabels: readField('accountPageLabels'),
      spendStyle: readField('spendStyle'),
      spendersListMappings: readField('spendersListMappings'),
      onlineOnlySpenders: readField('onlineOnlySpenders'),
      onlineSort: readField('onlineSort'),
      messageGuardPolicy: readField('messageGuardPolicy'),
      guardConfigTransport: readField('guardConfigTransport'),
      uiLocale: readField('uiLocale'),
      uiScale: readField('uiScale'),
      uiTheme: readField('uiTheme'),
    };
  }

  async function buildVm(): Promise<SettingsVM> {
    const persisted = readPersisted();
    const bindingState = async (
      name: 'hubDeviceToken',
      readBinding: () => HubCredentialBinding | null,
      digest: (value: string) => string,
    ): Promise<HubCredentialBindingState> => {
      let value: string | null;
      try {
        value = await secrets.getSecret(name);
      } catch {
        // Settings/UI must remain reachable so the user can replace or
        // explicitly abandon an unreadable encrypted credential. Connection
        // resolution still uses getSecret and therefore remains fail-closed.
        return 'unreadable';
      }
      if (value === null) return 'none';
      let binding: HubCredentialBinding | null;
      try {
        binding = readBinding();
      } catch {
        // A read/parse failure is not evidence that the persisted binding
        // belongs to another credential. Keep custody fail-closed and preserve
        // it for explicit recovery instead of letting cleanup treat it as a
        // proven mismatch.
        return 'unreadable';
      }
      if (binding === null) return 'unbound';
      if (
        persisted.hubBaseUrl === null
        || binding.hubBaseUrl !== persisted.hubBaseUrl
        || binding.tokenDigest !== digest(value)
      ) return 'mismatch';
      return 'bound';
    };
    const hubDeviceTokenBindingState = await bindingState(
      'hubDeviceToken',
      () => readDeviceTokenBinding(queries),
      deviceTokenDigest,
    );
    const activation = readDeviceTokenActivation(queries);
    const revocation = readDeviceTokenRevocation(queries);
    if (activation !== null && revocation !== null) {
      throw new Error('Conflicting Hub device-token lifecycle journals; refusing credentials.');
    }
    // D19: display metadata only renders while some device custody exists — a
    // record surviving an external secret wipe must not fake a connected card.
    const identity = readHubDeviceIdentity(queries);
    const hubDeviceIdentity = identity !== null
      && (hubDeviceTokenBindingState !== 'none' || activation !== null || revocation !== null)
      ? {
          username: identity.username,
          label: identity.label,
          tokenLast4: identity.tokenLast4,
          issuedAt: identity.issuedAt,
          expiresAt: identity.expiresAt,
        }
      : null;
    return {
      hasHubDeviceToken: hubDeviceTokenBindingState !== 'none',
      hubDeviceTokenBindingState,
      hubDeviceTokenTransition: activation !== null
        ? 'activation'
        : revocation !== null
          ? 'revocation'
          : null,
      hubDeviceIdentity,
      appVersion,
      machineLabel,
      osPlatform,
      ...persisted,
    };
  }

  async function buildHubConnection(): Promise<HubConnectionSnapshot> {
    const settings = await buildVm();
    let deviceCustody: { value: string | null; unreadable: boolean };
    try {
      deviceCustody = { value: await secrets.getSecret('hubDeviceToken'), unreadable: false };
    } catch {
      deviceCustody = { value: null, unreadable: true };
    }
    const activeDeviceToken = deviceCustody.value;
    const activation = readDeviceTokenActivation(queries);
    const revocation = readDeviceTokenRevocation(queries);
    if (activation !== null && revocation !== null) {
      throw new Error('Conflicting Hub device-token lifecycle journals; refusing credentials.');
    }

    const exactBindingState = ((): HubCredentialBindingState => {
      if (deviceCustody.unreadable) return 'unreadable';
      const value = deviceCustody.value;
      if (value === null) return 'none';
      let binding: HubCredentialBinding | null;
      try {
        binding = readDeviceTokenBinding(queries);
      } catch {
        return 'mismatch';
      }
      if (binding === null) return 'unbound';
      return settings.hubBaseUrl !== null
        && binding.hubBaseUrl === settings.hubBaseUrl
        && binding.tokenDigest === deviceTokenDigest(value)
        ? 'bound'
        : 'mismatch';
    })();
    const connectionSettings: SettingsVM = {
      ...settings,
      hasHubDeviceToken: exactBindingState !== 'none',
      hubDeviceTokenBindingState: exactBindingState,
    };
    let deviceToken = exactBindingState === 'bound' ? activeDeviceToken : null;
    if (activation !== null) {
      // Even if promotion completed just before a process crash, the active
      // file is quarantined until idempotent activation replay clears the
      // journal. D35: there is no fallback bearer behind it — the app simply
      // runs from local cache until the transition settles.
      deviceToken = null;
    }
    if (revocation !== null) {
      deviceToken = null;
    }

    return {
      settings: connectionSettings,
      hubBaseUrl: connectionSettings.hubBaseUrl,
      bearer: deviceToken,
      deviceToken,
      deviceTokenTransition: activation !== null
        ? 'activation'
        : revocation !== null
          ? 'revocation'
          : null,
    };
  }

  function oldHubSyncStateRemovals(): SettingsMutation[] {
    return Object.keys(queries.all())
      .filter((key) => (
        key === 'hubSync.lastEventId'
        || key.startsWith('hubSync.v2Cursor')
        || key.startsWith('hubSync.snapshotProgress.')
      ))
      .map((key) => ({ kind: 'remove' as const, key }));
  }

  function patchMutations(
    patch: ValidatedSettingsPatch,
    personaMappingsKey: string | null,
  ): SettingsMutation[] {
    const mutations: SettingsMutation[] = [];
    for (const key of PERSISTED_SETTINGS_KEYS) {
      const value = patch[key];
      if (value === undefined) continue;
      if (key === 'accountMappings') {
        if (personaMappingsKey === null) {
          throw new Error('Settings patch lost its persona-mapping target.');
        }
        mutations.push({ kind: 'set', key: personaMappingsKey, value });
      } else {
        mutations.push({ kind: 'set', key, value });
      }
    }
    return mutations;
  }

  let mutationTail: Promise<void> = Promise.resolve();

  function enqueueMutation<Result>(task: () => Promise<Result>): Promise<Result> {
    const result = mutationTail.then(task, task);
    mutationTail = result.then(() => undefined, () => undefined);
    return result;
  }

  async function updateInsideQueue(patch: unknown): Promise<SettingsVM> {
    const parsed = settingsPatchSchema.parse(patch);
    // Validation failures must be side-effect free: do not run the persona-scope
    // claim before the patch is known to be applicable.
    const before = readPersisted({ migratePersonaScope: false });
    const hubSwitched =
      parsed.hubBaseUrl !== undefined && parsed.hubBaseUrl !== before.hubBaseUrl;
    // Device-token invalidation is a remote security operation, not a local
    // settings cleanup. Reject before ANY keychain/DB mutation so the caller
    // must use the serialized sign-out path, which revokes the exact bearer
    // against the old Hub before deleting its only local copy.
    if (hubSwitched) {
      const [hasActiveToken, hasActivationCustody, hasRevocationCustody] = await Promise.all([
        secrets.hasSecret('hubDeviceToken'),
        secrets.hasSecret('hubDeviceTokenStaged'),
        secrets.hasSecret('hubDeviceTokenRevoking'),
      ]);
      const activation = readDeviceTokenActivation(queries);
      const revocation = readDeviceTokenRevocation(queries);
      if (
        hasActiveToken
        || hasActivationCustody
        || hasRevocationCustody
        || activation !== null
        || revocation !== null
      ) {
        throw new Error(HUB_DEVICE_TOKEN_HUB_SWITCH_BLOCKED_MESSAGE);
      }
    }

    // D35: with the legacy key gone this patch carries no secret material at
    // all, so the two-store commit protocol it needed is gone with it — one
    // SQLite batch is already atomic. A hub switch still clears the old
    // origin's sync cursors in that same batch.
    const targetHubBaseUrl = parsed.hubBaseUrl !== undefined
      ? parsed.hubBaseUrl
      : before.hubBaseUrl;
    const personaMappingsKey = parsed.accountMappings === undefined
      ? null
      : personaAccountMappingsKey(
          targetHubBaseUrl === null ? null : personaStorageScopeForHub(targetHubBaseUrl),
        );
    queries.batch([
      ...patchMutations(parsed, personaMappingsKey),
      ...(hubSwitched ? oldHubSyncStateRemovals() : []),
    ]);

    return buildVm();
  }

  return {
    get: () => enqueueMutation(() => buildVm()),

    getHubConnection: () => enqueueMutation(() => buildHubConnection()),

    runCredentialMutation: (task) => enqueueMutation(task),

    backfillHubDeviceIdentity: (label) => enqueueMutation(async () => {
      try {
        if (readHubDeviceIdentity(queries) !== null) return false;
        if (readDeviceTokenActivation(queries) !== null) return false;
        if (readDeviceTokenRevocation(queries) !== null) return false;
        const vm = await buildVm();
        if (vm.hubDeviceTokenBindingState !== 'bound') return false;
        const token = await secrets.getSecret('hubDeviceToken');
        if (token === null || token.length < 4) return false;
        // Pre-D19 token: username and the issue/expiry moments were never
        // recorded locally — write only what is provable (the UI renders
        // titleAnon + the short token line for exactly this shape). label is
        // hostname() by construction: that is what issuance always sent.
        queries.set(HUB_DEVICE_IDENTITY_KEY, {
          version: 1,
          username: null,
          label: label.trim().length > 0 ? label.trim().slice(0, 120) : 'device',
          tokenLast4: token.slice(-4),
          issuedAt: null,
          expiresAt: null,
        });
        return true;
      } catch {
        return false; // display metadata only — never blocks boot
      }
    }),

    async update(patch: unknown): Promise<SettingsVM> {
      return enqueueMutation(() => updateInsideQueue(patch));
    },
  };
}
