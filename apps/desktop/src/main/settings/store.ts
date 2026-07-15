// SettingsStore (PRD F9, SPEC §10 `settings(key, value JSON)`): non-secret
// settings persist one row per field; API keys route to the OS keychain and
// never appear in the DB or in any returned view model.

import { createHash, randomUUID } from 'node:crypto';
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
  KeyMetaVM,
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
  HUB_API_KEY_BINDING_KEY,
  HUB_DEVICE_IDENTITY_KEY,
  HUB_DEVICE_TOKEN_BINDING_KEY,
  deviceTokenDigest,
  readDeviceTokenActivation,
  readDeviceTokenBinding,
  readDeviceTokenRevocation,
  readHubApiKeyBinding,
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
  | 'hasHubKey'
  | 'hubApiKeyBindingState'
  | 'hasHubDeviceToken'
  | 'hubDeviceTokenBindingState'
  | 'hubDeviceTokenTransition'
  | 'hubDeviceIdentity'
  | 'appVersion'
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
  // Secret material: routed to the keychain, never stored in the settings
  // table. Stage 31: vendor keys (anthropicKey/openRouterKey) are gone — the
  // kernel gateway holds provider credentials; the strict schema rejects any
  // patch still carrying them (renderer and main ship in lockstep).
  hubApiKey: z.string().optional(),
});

export type ValidatedSettingsPatch = z.infer<typeof settingsPatchSchema>;
const nonSecretSettingsPatchSchema = settingsPatchSchema.omit({ hubApiKey: true });

// ─── Key metadata (non-secret fingerprints, settings-table reserved key) ──

/** Reserved settings-table key — outside the per-field VM machinery (like 'personalities'). */
const KEY_META_KEY = 'keyMeta';

const keyMetaEntrySchema = z.object({
  last4: z.string(),
  setAt: z.number().int().nonnegative(),
});

// Stage 31: hub only — persisted rows may still carry stale anthropic/
// openRouter entries; zod's default strip mode drops them on read.
const keyMetaSchema = z.object({
  hub: keyMetaEntrySchema.nullable(),
});

const EMPTY_KEY_META: KeyMetaVM = { hub: null };

/**
 * Durable, non-secret half of the Hub credential commit protocol. The new key
 * itself lives only in the safeStorage-encrypted `hubApiKeyStaged` slot.
 */
export const HUB_CREDENTIAL_TRANSITION_KEY = 'hubCredentialTransition.v1';

const legacyHubCredentialTransitionSchema = z.strictObject({
  version: z.literal(1),
  id: z.string().uuid(),
  targetHubBaseUrl: hubBaseUrlSchema,
  targetKeyMeta: keyMetaEntrySchema.nullable(),
  keyAction: z.enum(['promote-staged', 'delete']),
  deleteDeadDeviceToken: z.boolean(),
  clearHubSyncState: z.boolean(),
  nonSecretPatch: nonSecretSettingsPatchSchema,
  personaMappingsKey: z.string().min(1).nullable(),
});

const settingsMutationSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('set'), key: z.string().min(1), value: z.unknown() }),
  z.strictObject({ kind: z.literal('remove'), key: z.string().min(1) }),
]);

const recoverableHubCredentialTransitionSchema = legacyHubCredentialTransitionSchema.extend({
  version: z.literal(2),
  /** Non-secret proof of the pre-transition active key (null = none existed). */
  sourceKeyDigest: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  /** The source file existed but could not be decrypted. A replacement may
   * overwrite it, but a lost target can never roll back to it as usable. */
  sourceKeyUnreadable: z.boolean().optional().default(false),
  /** Non-secret proof that an already-promoted active file is the target key. */
  targetKeyDigest: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  /** Exact inverse of every SQLite coordinate write in this transition. */
  rollbackMutations: z.array(settingsMutationSchema),
});

const hubCredentialTransitionSchema = z.discriminatedUnion('version', [
  legacyHubCredentialTransitionSchema,
  recoverableHubCredentialTransitionSchema,
]);

type HubCredentialTransition = z.infer<typeof hubCredentialTransitionSchema>;
type RecoverableHubCredentialTransition = z.infer<typeof recoverableHubCredentialTransitionSchema>;

const stagedHubApiKeySchema = z.strictObject({
  version: z.literal(1),
  transitionId: z.string().uuid(),
  value: z.string().min(1),
});

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
  update(patch: unknown, options?: SettingsUpdateOptions): Promise<SettingsVM>;
  /**
   * Replays an interrupted Hub URL/key transition and deletes pre-intent
   * staging orphans. Boot calls this before any runtime/redactor reads a Hub
   * credential; get/update also serialize behind it for in-process safety.
   */
  recoverHubCredentialTransition?(): Promise<void>;
  /** Device activation/revocation staging uses this same queue so an atomic
   * connection read cannot interleave with secret/journal promotion. */
  runCredentialMutation<Result>(task: () => Promise<Result>): Promise<Result>;
  /** D19: deletes a NON-bound legacy chatter key once a bound device token
   * exists (boot + post-activation). Returns true when custody was removed. */
  decommissionQuarantinedHubKey(): Promise<boolean>;
}

export interface HubConnectionSnapshot {
  settings: SettingsVM;
  hubBaseUrl: string | null;
  bearer: string | null;
  deviceToken: string | null;
  hubApiKey: string | null;
  deviceTokenTransition: 'activation' | 'revocation' | null;
}

export interface SettingsUpdateOptions {
  /** Probe-authenticated token cleanup, committed by the same durable intent. */
  deleteDeadHubDeviceToken?: boolean;
}

export interface SettingsStoreOptions {
  queries: SettingsQueries;
  secrets: SecretStoreLike;
  /** Clock seam for keyMeta.setAt (tests). */
  now?: () => number;
  /** Shown in Hub diagnostics (SettingsVM.appVersion); app.getVersion() in prod. */
  appVersion?: string;
}

export function createSettingsStore(options: SettingsStoreOptions): SettingsStore {
  const { queries, secrets } = options;
  const now = options.now ?? Date.now;
  const appVersion = options.appVersion ?? '0.0.0';

  function hubApiKeyDigest(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  function credentialBinding(
    hubBaseUrl: string | null,
    tokenDigest: string,
  ): HubCredentialBinding | null {
    return hubBaseUrl === null
      ? null
      : { version: 1, hubBaseUrl, tokenDigest };
  }

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

  function readKeyMeta(): KeyMetaVM {
    let json: unknown;
    try {
      json = queries.get(KEY_META_KEY);
    } catch {
      return { ...EMPTY_KEY_META };
    }
    const result = keyMetaSchema.safeParse(json);
    return result.success ? result.data : { ...EMPTY_KEY_META };
  }

  async function buildVm(): Promise<SettingsVM> {
    const persisted = readPersisted();
    const bindingState = async (
      name: 'hubApiKey' | 'hubDeviceToken',
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
        return 'mismatch';
      }
      if (binding === null) return 'unbound';
      if (
        persisted.hubBaseUrl === null
        || binding.hubBaseUrl !== persisted.hubBaseUrl
        || binding.tokenDigest !== digest(value)
      ) return 'mismatch';
      return 'bound';
    };
    const [hubApiKeyBindingState, hubDeviceTokenBindingState] = await Promise.all([
      bindingState('hubApiKey', () => readHubApiKeyBinding(queries), hubApiKeyDigest),
      bindingState('hubDeviceToken', () => readDeviceTokenBinding(queries), deviceTokenDigest),
    ]);
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
      hasHubKey: hubApiKeyBindingState !== 'none',
      hubApiKeyBindingState,
      hasHubDeviceToken: hubDeviceTokenBindingState !== 'none',
      hubDeviceTokenBindingState,
      hubDeviceTokenTransition: activation !== null
        ? 'activation'
        : revocation !== null
          ? 'revocation'
          : null,
      hubDeviceIdentity,
      appVersion,
      keyMeta: readKeyMeta(),
      ...persisted,
    };
  }

  async function buildHubConnection(): Promise<HubConnectionSnapshot> {
    const settings = await buildVm();
    const readConnectionSecret = async (
      name: 'hubDeviceToken' | 'hubApiKey',
    ): Promise<{ value: string | null; unreadable: boolean }> => {
      try {
        return { value: await secrets.getSecret(name), unreadable: false };
      } catch {
        return { value: null, unreadable: true };
      }
    };
    const [deviceCustody, apiKeyCustody] = await Promise.all([
      readConnectionSecret('hubDeviceToken'),
      readConnectionSecret('hubApiKey'),
    ]);
    const activeDeviceToken = deviceCustody.value;
    const hubApiKey = apiKeyCustody.value;
    const activation = readDeviceTokenActivation(queries);
    const revocation = readDeviceTokenRevocation(queries);
    if (activation !== null && revocation !== null) {
      throw new Error('Conflicting Hub device-token lifecycle journals; refusing credentials.');
    }

    const exactBindingState = (
      custody: { value: string | null; unreadable: boolean },
      readBinding: () => HubCredentialBinding | null,
      digest: (candidate: string) => string,
    ): HubCredentialBindingState => {
      if (custody.unreadable) return 'unreadable';
      const value = custody.value;
      if (value === null) return 'none';
      let binding: HubCredentialBinding | null;
      try {
        binding = readBinding();
      } catch {
        return 'mismatch';
      }
      if (binding === null) return 'unbound';
      return settings.hubBaseUrl !== null
        && binding.hubBaseUrl === settings.hubBaseUrl
        && binding.tokenDigest === digest(value)
        ? 'bound'
        : 'mismatch';
    };
    const exactDeviceBindingState = exactBindingState(
      deviceCustody,
      () => readDeviceTokenBinding(queries),
      deviceTokenDigest,
    );
    const exactApiKeyBindingState = exactBindingState(
      apiKeyCustody,
      () => readHubApiKeyBinding(queries),
      hubApiKeyDigest,
    );
    const connectionSettings: SettingsVM = {
      ...settings,
      hasHubDeviceToken: exactDeviceBindingState !== 'none',
      hubDeviceTokenBindingState: exactDeviceBindingState,
      hasHubKey: exactApiKeyBindingState !== 'none',
      hubApiKeyBindingState: exactApiKeyBindingState,
    };
    let deviceToken = exactDeviceBindingState === 'bound' ? activeDeviceToken : null;
    if (activation !== null) {
      // Even if promotion completed just before a process crash, the active
      // file is quarantined until idempotent activation replay clears the
      // journal. The legacy chatter key remains a safe offline fallback.
      deviceToken = null;
    }
    if (revocation !== null) {
      deviceToken = null;
    }

    const normalizedKey = exactApiKeyBindingState === 'bound' ? hubApiKey : null;
    return {
      settings: connectionSettings,
      hubBaseUrl: connectionSettings.hubBaseUrl,
      bearer: deviceToken ?? normalizedKey,
      deviceToken,
      hubApiKey: normalizedKey,
      deviceTokenTransition: activation !== null
        ? 'activation'
        : revocation !== null
          ? 'revocation'
          : null,
    };
  }

  function readHubCredentialTransition(): HubCredentialTransition | null {
    let raw: unknown;
    try {
      raw = queries.get(HUB_CREDENTIAL_TRANSITION_KEY);
    } catch (error) {
      throw new Error('Hub credential transition journal is unreadable; refusing to use credentials.', {
        cause: error,
      });
    }
    if (raw === undefined) return null;
    const parsed = hubCredentialTransitionSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error('Hub credential transition journal is corrupt; refusing to use credentials.');
    }
    return parsed.data;
  }

  class InvalidStagedHubApiKeyError extends Error {}
  let stagedOrphanSweepPending = true;

  async function cleanupStagedHubApiKeyBestEffort(): Promise<void> {
    try {
      await secrets.deleteSecret('hubApiKeyStaged');
      stagedOrphanSweepPending = false;
    } catch {
      // Retry on the next serialized settings operation. Never fail boot after
      // the durable journal has already committed or when only an orphan exists.
      stagedOrphanSweepPending = true;
    }
  }

  async function readStagedHubApiKey(transition: HubCredentialTransition): Promise<string> {
    let raw: string | null;
    try {
      raw = await secrets.getSecret('hubApiKeyStaged');
    } catch (error) {
      throw new InvalidStagedHubApiKeyError(
        'Hub credential encrypted staging record cannot be read or decrypted.',
        { cause: error },
      );
    }
    if (raw === null) {
      throw new InvalidStagedHubApiKeyError(
        'Hub credential transition is missing its encrypted staged key.',
      );
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new InvalidStagedHubApiKeyError('Hub credential encrypted staging record is corrupt.');
    }
    const parsed = stagedHubApiKeySchema.safeParse(json);
    if (!parsed.success || parsed.data.transitionId !== transition.id) {
      throw new InvalidStagedHubApiKeyError(
        'Hub credential encrypted staging record does not match its durable intent.',
      );
    }
    return parsed.data.value;
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

  function transitionRollbackMutations(
    patch: z.infer<typeof nonSecretSettingsPatchSchema>,
    personaMappingsKey: string | null,
    clearHubSyncState: boolean,
  ): SettingsMutation[] {
    const keys = new Set<string>(['hubBaseUrl', KEY_META_KEY]);
    for (const key of PERSISTED_SETTINGS_KEYS) {
      if (patch[key] === undefined) continue;
      if (key === 'accountMappings') {
        if (personaMappingsKey === null) {
          throw new Error('Credential transition lost its persona-mapping rollback target.');
        }
        keys.add(personaMappingsKey);
      } else {
        keys.add(key);
      }
    }
    if (clearHubSyncState) {
      for (const mutation of oldHubSyncStateRemovals()) keys.add(mutation.key);
    }
    return [...keys].map((key): SettingsMutation => {
      const value = queries.get(key);
      return value === undefined
        ? { kind: 'remove', key }
        : { kind: 'set', key, value };
    });
  }

  function patchMutations(
    patch: z.infer<typeof nonSecretSettingsPatchSchema>,
    personaMappingsKey: string | null,
  ): SettingsMutation[] {
    const mutations: SettingsMutation[] = [];
    for (const key of PERSISTED_SETTINGS_KEYS) {
      const value = patch[key];
      if (value === undefined) continue;
      if (key === 'accountMappings') {
        if (personaMappingsKey === null) {
          throw new Error('Credential transition lost its persona-mapping target.');
        }
        mutations.push({ kind: 'set', key: personaMappingsKey, value });
      } else {
        mutations.push({ kind: 'set', key, value });
      }
    }
    return mutations;
  }

  async function finishHubCredentialTransition(
    transition: HubCredentialTransition,
  ): Promise<void> {
    // Resolve and authenticate the encrypted staging record BEFORE changing any
    // non-secret coordinate. In every reachable crash window the staged copy
    // remains until the journal is removed, so this operation is idempotent.
    const stagedValue = transition.keyAction === 'promote-staged'
      ? await readStagedHubApiKey(transition)
      : null;

    queries.batch([
      ...patchMutations(transition.nonSecretPatch, transition.personaMappingsKey),
      { kind: 'set', key: 'hubBaseUrl', value: transition.targetHubBaseUrl },
      { kind: 'set', key: KEY_META_KEY, value: { hub: transition.targetKeyMeta } },
      ...(transition.clearHubSyncState ? oldHubSyncStateRemovals() : []),
    ]);
    if (transition.deleteDeadDeviceToken) {
      await secrets.deleteSecret('hubDeviceToken');
    }

    // Promotion is deliberately last: until the SQLite coordinates are
    // durable, the old active key remains untouched. setSecret itself uses an
    // fsync + atomic rename, so a crash observes either the old or new file.
    if (stagedValue === null) {
      await secrets.deleteSecret('hubApiKey');
    } else {
      await secrets.setSecret('hubApiKey', stagedValue);
    }

    // Journal removal is the commit point. A crash before it replays the whole
    // idempotent transition; a crash after it sees a committed active pair and
    // treats the remaining encrypted staging file as an orphan.
    const targetKeyDigest = stagedValue === null ? null : hubApiKeyDigest(stagedValue);
    const apiBinding = targetKeyDigest === null
      ? null
      : credentialBinding(transition.targetHubBaseUrl, targetKeyDigest);
    queries.batch([
      ...(apiBinding === null
        ? [{ kind: 'remove' as const, key: HUB_API_KEY_BINDING_KEY }]
        : [{ kind: 'set' as const, key: HUB_API_KEY_BINDING_KEY, value: apiBinding }]),
      ...(transition.deleteDeadDeviceToken
        ? [
            { kind: 'remove' as const, key: HUB_DEVICE_TOKEN_BINDING_KEY },
            { kind: 'remove' as const, key: HUB_DEVICE_IDENTITY_KEY },
          ]
        : []),
      { kind: 'remove', key: HUB_CREDENTIAL_TRANSITION_KEY },
    ]);
    await cleanupStagedHubApiKeyBestEffort();
  }

  async function finishHubCredentialTransitionWithRetry(
    expected: HubCredentialTransition,
  ): Promise<void> {
    try {
      await finishHubCredentialTransition(expected);
      return;
    } catch (firstError) {
      const persisted = readHubCredentialTransition();
      // A remove() implementation can report an error after committing. In
      // that case the target pair is already authoritative; only orphan
      // staging cleanup remains.
      if (persisted === null) {
        await cleanupStagedHubApiKeyBestEffort();
        return;
      }
      if (persisted.id !== expected.id) {
        throw new Error('Hub credential transition was superseded unexpectedly.', {
          cause: firstError,
        });
      }
      // Ordinary I/O failures can be transient without being process crashes.
      // One immediate idempotent retry prevents a half-applied live process;
      // a persistent failure leaves the durable intent for boot recovery.
      await finishHubCredentialTransition(persisted);
    }
  }

  async function recoverInvalidStagedHubApiKey(
    transition: HubCredentialTransition,
  ): Promise<void> {
    if (transition.version === 1) {
      // v1 (briefly present on unreleased builds) had neither a target digest
      // nor inverse coordinates. There is no sound way to pair its surviving
      // active key with possibly-applied target settings. Disable the Hub and
      // discard the ambiguous key instead of preserving a fatal boot loop or
      // ever presenting a key to the wrong origin.
      await secrets.deleteSecret('hubApiKey');
      await cleanupStagedHubApiKeyBestEffort();
      queries.batch([
        { kind: 'set', key: 'hubBaseUrl', value: null },
        { kind: 'set', key: KEY_META_KEY, value: { hub: null } },
        ...oldHubSyncStateRemovals(),
        { kind: 'remove', key: HUB_API_KEY_BINDING_KEY },
        { kind: 'remove', key: HUB_CREDENTIAL_TRANSITION_KEY },
      ]);
      return;
    }

    let active: string | null = null;
    let activeReadFailed = false;
    try {
      active = await secrets.getSecret('hubApiKey');
    } catch {
      // A journal paired with an unreadable active key has neither a provable
      // source nor target. Route it through the foreign/ambiguous fail-closed
      // branch, which removes the unreadable file without decrypting it.
      activeReadFailed = true;
    }
    const targetIsAlreadyActive = active !== null
      && !activeReadFailed
      && transition.targetKeyDigest !== null
      && hubApiKeyDigest(active) === transition.targetKeyDigest;
    const sourceIsStillActive = !activeReadFailed && (
      active === null
        ? !transition.sourceKeyUnreadable && transition.sourceKeyDigest === null
        : transition.sourceKeyDigest !== null
          && hubApiKeyDigest(active) === transition.sourceKeyDigest
    );
    if (targetIsAlreadyActive) {
      // Promotion completed before the staged copy disappeared. Re-apply the
      // target coordinates and commit the journal without requiring that copy.
      queries.batch([
        ...patchMutations(transition.nonSecretPatch, transition.personaMappingsKey),
        { kind: 'set', key: 'hubBaseUrl', value: transition.targetHubBaseUrl },
        { kind: 'set', key: KEY_META_KEY, value: { hub: transition.targetKeyMeta } },
        ...(transition.clearHubSyncState ? oldHubSyncStateRemovals() : []),
      ]);
      if (transition.deleteDeadDeviceToken) {
        await secrets.deleteSecret('hubDeviceToken');
      }
      const targetBinding = credentialBinding(
        transition.targetHubBaseUrl,
        hubApiKeyDigest(active!),
      );
      if (targetBinding === null) {
        throw new Error('Promoted Hub key has no usable target origin binding.');
      }
      queries.batch([
        { kind: 'set', key: HUB_API_KEY_BINDING_KEY, value: targetBinding },
        ...(transition.deleteDeadDeviceToken
          ? [
              { kind: 'remove' as const, key: HUB_DEVICE_TOKEN_BINDING_KEY },
              { kind: 'remove' as const, key: HUB_DEVICE_IDENTITY_KEY },
            ]
          : []),
        { kind: 'remove', key: HUB_CREDENTIAL_TRANSITION_KEY },
      ]);
    } else if (sourceIsStillActive) {
      // The active file is still the pre-transition key (or is absent). Restore
      // its exact SQLite coordinates before dropping the irrecoverable intent.
      queries.batch([
        ...transition.rollbackMutations,
        { kind: 'remove', key: HUB_CREDENTIAL_TRANSITION_KEY },
      ]);
    } else {
      // A third key appeared through external restore/manual replacement. It
      // matches neither side of this intent, so pairing it with either origin
      // would be credential disclosure. Restore unrelated settings, disable
      // Hub coordinates, and discard the ambiguous secret fail-visibly.
      await secrets.deleteSecret('hubApiKey');
      queries.batch([
        ...transition.rollbackMutations,
        { kind: 'set', key: 'hubBaseUrl', value: null },
        { kind: 'set', key: KEY_META_KEY, value: { hub: null } },
        ...oldHubSyncStateRemovals(),
        { kind: 'remove', key: HUB_API_KEY_BINDING_KEY },
        { kind: 'remove', key: HUB_CREDENTIAL_TRANSITION_KEY },
      ]);
    }
    // With no durable journal an encrypted candidate is inert. Cleanup is
    // best-effort so AV/keychain cleanup failure cannot recreate a boot loop.
    await cleanupStagedHubApiKeyBestEffort();
  }

  async function recoverHubCredentialTransitionInsideQueue(
    options: { sweepOrphan?: boolean } = {},
  ): Promise<void> {
    const pending = readHubCredentialTransition();
    if (pending !== null) {
      try {
        await finishHubCredentialTransitionWithRetry(pending);
      } catch (error) {
        if (!(error instanceof InvalidStagedHubApiKeyError)) throw error;
        await recoverInvalidStagedHubApiKey(pending);
      }
      return;
    }
    // Crash after encrypted staging but before durable intent, or after commit
    // but before cleanup: the active pair is already self-consistent and the
    // unreferenced candidate must never be promoted. Delete unconditionally —
    // hasSecret/getSecret decrypts the file and would turn a corrupt orphan into
    // a fatal boot loop even though deletion itself remains possible.
    // The composition root explicitly invokes recovery once before any IPC or
    // runtime reads. Keep the no-journal filesystem sweep on that boot path;
    // ordinary rejected settings operations must remain side-effect free.
    if (options.sweepOrphan === true && stagedOrphanSweepPending) {
      await cleanupStagedHubApiKeyBestEffort();
    }
  }

  async function beginHubCredentialTransition(
    nonSecretPatch: z.infer<typeof nonSecretSettingsPatchSchema>,
    before: PersistedSettings,
    rawHubApiKey: string | undefined,
    hubSwitched: boolean,
    deleteDeadDeviceToken: boolean,
  ): Promise<void> {
    const targetHubBaseUrl = nonSecretPatch.hubBaseUrl !== undefined
      ? nonSecretPatch.hubBaseUrl
      : before.hubBaseUrl;
    const value = rawHubApiKey?.trim() ?? '';
    const promoteStaged = rawHubApiKey !== undefined && value.length > 0;
    let sourceKeyDigest: string | null = null;
    let sourceKeyUnreadable = false;
    try {
      const sourceHubApiKey = await secrets.getSecret('hubApiKey');
      sourceKeyDigest = sourceHubApiKey === null ? null : hubApiKeyDigest(sourceHubApiKey);
    } catch {
      // A user-supplied replacement is the recovery path for an unreadable
      // DPAPI/keychain file. Preserve an independently durable digest only when
      // its origin exactly matches the pre-transition coordinates. A transient
      // decrypt failure must not turn the still-bound old key into foreign
      // custody if candidate staging is then lost before promotion.
      sourceKeyUnreadable = true;
      try {
        const binding = readHubApiKeyBinding(queries);
        if (binding !== null && binding.hubBaseUrl === before.hubBaseUrl) {
          sourceKeyDigest = binding.tokenDigest;
        }
      } catch {
        // Corrupt/missing binding provides no rollback proof. Recovery will
        // keep the unreadable source fail-closed instead of guessing.
      }
    }
    const personaMappingsKey = nonSecretPatch.accountMappings === undefined
      ? null
      : personaAccountMappingsKey(
          targetHubBaseUrl === null ? null : personaStorageScopeForHub(targetHubBaseUrl),
        );
    const transition: RecoverableHubCredentialTransition = {
      version: 2,
      id: randomUUID(),
      targetHubBaseUrl,
      targetKeyMeta: promoteStaged ? { last4: value.slice(-4), setAt: now() } : null,
      sourceKeyDigest,
      sourceKeyUnreadable,
      targetKeyDigest: promoteStaged ? hubApiKeyDigest(value) : null,
      keyAction: promoteStaged ? 'promote-staged' : 'delete',
      deleteDeadDeviceToken,
      clearHubSyncState: hubSwitched,
      nonSecretPatch,
      personaMappingsKey,
      rollbackMutations: transitionRollbackMutations(
        nonSecretPatch,
        personaMappingsKey,
        hubSwitched,
      ),
    };

    if (promoteStaged) {
      await secrets.setSecret('hubApiKeyStaged', JSON.stringify({
        version: 1,
        transitionId: transition.id,
        value,
      }));
      stagedOrphanSweepPending = true;
    } else {
      await secrets.deleteSecret('hubApiKeyStaged');
      stagedOrphanSweepPending = false;
    }

    try {
      queries.batch([{ kind: 'set', key: HUB_CREDENTIAL_TRANSITION_KEY, value: transition }]);
    } catch (error) {
      // queries.set can fail after SQLite committed (for example, a downstream
      // bus subscriber throws). Inspect the journal before deciding the intent
      // was never durable; only the no-intent branch may discard staging.
      const persisted = readHubCredentialTransition();
      if (persisted?.id !== transition.id) {
        await cleanupStagedHubApiKeyBestEffort();
        throw error;
      }
    }
    await finishHubCredentialTransitionWithRetry(transition);
  }

  let mutationTail: Promise<void> = Promise.resolve();

  function enqueueMutation<Result>(task: () => Promise<Result>): Promise<Result> {
    const result = mutationTail.then(task, task);
    mutationTail = result.then(() => undefined, () => undefined);
    return result;
  }

  async function updateInsideQueue(
    patch: unknown,
    updateOptions: SettingsUpdateOptions,
  ): Promise<SettingsVM> {
    await recoverHubCredentialTransitionInsideQueue();
    const parsed = settingsPatchSchema.parse(patch);
    // Validation/staging failures must be side-effect free. In particular, do
    // not run the legacy persona-scope claim while deciding a credential
    // transition; the complete mapping target is journaled and applied later.
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

    const hasHubCredentialTransition = parsed.hubApiKey !== undefined || hubSwitched;
    if (
      updateOptions.deleteDeadHubDeviceToken === true
      && (parsed.hubApiKey?.trim() ?? '').length === 0
    ) {
      throw new Error('A proven-dead device token may only be replaced by a non-empty Hub key.');
    }

    // `omit()` remains strict in Zod 4, so parse a value that physically does
    // not contain secret material.  This also prevents the journal serializer
    // from ever seeing the raw key even transiently.
    const { hubApiKey: _hubApiKey, ...rawNonSecretPatch } = parsed;
    const nonSecretPatch = nonSecretSettingsPatchSchema.parse(rawNonSecretPatch);

    if (hasHubCredentialTransition) {
      await beginHubCredentialTransition(
        nonSecretPatch,
        before,
        parsed.hubApiKey,
        hubSwitched,
        updateOptions.deleteDeadHubDeviceToken === true,
      );
    } else {
      const targetHubBaseUrl = nonSecretPatch.hubBaseUrl !== undefined
        ? nonSecretPatch.hubBaseUrl
        : before.hubBaseUrl;
      const personaMappingsKey = nonSecretPatch.accountMappings === undefined
        ? null
        : personaAccountMappingsKey(
            targetHubBaseUrl === null ? null : personaStorageScopeForHub(targetHubBaseUrl),
          );
      queries.batch(patchMutations(nonSecretPatch, personaMappingsKey));
    }

    return buildVm();
  }

  return {
    get: () => enqueueMutation(async () => {
      await recoverHubCredentialTransitionInsideQueue();
      return buildVm();
    }),

    getHubConnection: () => enqueueMutation(async () => {
      await recoverHubCredentialTransitionInsideQueue();
      return buildHubConnection();
    }),

    recoverHubCredentialTransition: () => enqueueMutation(
      () => recoverHubCredentialTransitionInsideQueue({ sweepOrphan: true }),
    ),

    runCredentialMutation: (task) => enqueueMutation(async () => {
      await recoverHubCredentialTransitionInsideQueue();
      return task();
    }),

    decommissionQuarantinedHubKey: () => enqueueMutation(async () => {
      let vm: SettingsVM;
      try {
        if (readHubCredentialTransition() !== null) return false;
        if (readDeviceTokenActivation(queries) !== null) return false;
        if (readDeviceTokenRevocation(queries) !== null) return false;
        vm = await buildVm();
      } catch {
        // Corrupt/conflicting journals are owned by their fail-closed recovery
        // paths; this display-hygiene pass must never block or race them.
        return false;
      }
      if (vm.hubDeviceTokenBindingState !== 'bound') return false;
      if (vm.hubApiKeyBindingState === 'none' || vm.hubApiKeyBindingState === 'bound') {
        return false;
      }
      // D19: with a provably bound device token a NON-bound legacy key is dead
      // weight by construction — connection resolution selects bound
      // credentials only. Deletion needs no decryption.
      await secrets.deleteSecret('hubApiKey');
      queries.batch([
        { kind: 'remove', key: HUB_API_KEY_BINDING_KEY },
        { kind: 'set', key: KEY_META_KEY, value: { hub: null } },
      ]);
      return true;
    }),

    async update(patch: unknown, updateOptions: SettingsUpdateOptions = {}): Promise<SettingsVM> {
      return enqueueMutation(() => updateInsideQueue(patch, updateOptions));
    },
  };
}
