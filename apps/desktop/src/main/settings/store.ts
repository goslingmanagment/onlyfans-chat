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
import { OFAPI_READ_TRANSPORTS } from '../ofapi/transport';
import type {
  ModelSelectableFeature,
  ReasoningEffort,
  ReplyTone,
} from '@chatgoose/shared/types';
import { UI_LOCALE_SETTINGS } from '@chatgoose/shared/i18n/index';
import { UI_THEME_SETTINGS } from '@chatgoose/shared/theme';
import type { KeyMetaVM, SettingsVM } from '../../preload/contract';
import type { SecretName } from '../secrets/keychain';

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
  'hasOfapiKey' | 'hasAnthropicKey' | 'hasOpenRouterKey' | 'hasHubKey' | 'keyMeta'
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
  ofapiReadTransport: z.enum(OFAPI_READ_TRANSPORTS),
  // C6b+ hard invariant: all app writes go through Hub commands.
  ofapiWriteTransport: z.literal('hub'),
  // C6c AI custody bridge: provider calls stay direct unless hub is selected explicitly.
  aiGatewayTransport: z.enum(['direct', 'hub']),
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
  aiGatewayTransport: 'direct',
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
  // Secret material: routed to the keychain, never stored in the settings table.
  ofapiKey: z.string().optional(),
  anthropicKey: z.string().optional(),
  openRouterKey: z.string().optional(),
  hubApiKey: z.string().optional(),
});

export type ValidatedSettingsPatch = z.infer<typeof settingsPatchSchema>;

// ─── Key metadata (non-secret fingerprints, settings-table reserved key) ──

/** Reserved settings-table key — outside the per-field VM machinery (like 'personalities'). */
const KEY_META_KEY = 'keyMeta';

const keyMetaEntrySchema = z.object({
  last4: z.string(),
  setAt: z.number().int().nonnegative(),
});

const keyMetaSchema = z.object({
  ofapi: keyMetaEntrySchema.nullable(),
  anthropic: keyMetaEntrySchema.nullable(),
  openRouter: keyMetaEntrySchema.nullable(),
  hub: keyMetaEntrySchema.nullable(),
});

const EMPTY_KEY_META: KeyMetaVM = { ofapi: null, anthropic: null, openRouter: null, hub: null };

const SECRET_META_KEYS: Partial<Record<SecretName, keyof KeyMetaVM>> = {
  ofapiKey: 'ofapi',
  anthropicKey: 'anthropic',
  openRouterKey: 'openRouter',
  hubApiKey: 'hub',
};

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
}

/** Narrow keychain view the settings store depends on (Keychain satisfies it). */
export interface SecretStoreLike {
  hasSecret(name: SecretName): Promise<boolean>;
  setSecret(name: SecretName, value: string): Promise<void>;
  deleteSecret(name: SecretName): Promise<void>;
}

export interface SettingsStore {
  get(): Promise<SettingsVM>;
  /** zod-validates the patch (throws on invalid), persists, returns the full VM. */
  update(patch: unknown): Promise<SettingsVM>;
}

export interface SettingsStoreOptions {
  queries: SettingsQueries;
  secrets: SecretStoreLike;
  /** Clock seam for keyMeta.setAt (tests). */
  now?: () => number;
}

export function createSettingsStore(options: SettingsStoreOptions): SettingsStore {
  const { queries, secrets } = options;
  const now = options.now ?? Date.now;

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

  function readPersisted(): PersistedSettings {
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
      accountMappings: readField('accountMappings'),
      accountOrder: readField('accountOrder'),
      hubBaseUrl: readField('hubBaseUrl'),
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

  function recordKeyMeta(name: SecretName, trimmedValue: string): void {
    const metaKey = SECRET_META_KEYS[name];
    if (metaKey === undefined) return;
    const meta = readKeyMeta();
    meta[metaKey] =
      trimmedValue.length === 0 ? null : { last4: trimmedValue.slice(-4), setAt: now() };
    queries.set(KEY_META_KEY, meta);
  }

  async function buildVm(): Promise<SettingsVM> {
    const [hasOfapiKey, hasAnthropicKey, hasOpenRouterKey, hasHubKey] = await Promise.all([
      secrets.hasSecret('ofapiKey'),
      secrets.hasSecret('anthropicKey'),
      secrets.hasSecret('openRouterKey'),
      secrets.hasSecret('hubApiKey'),
    ]);
    return {
      hasOfapiKey,
      hasAnthropicKey,
      hasOpenRouterKey,
      hasHubKey,
      keyMeta: readKeyMeta(),
      ...readPersisted(),
    };
  }

  async function applySecret(name: SecretName, rawValue: string): Promise<void> {
    const value = rawValue.trim();
    if (value.length === 0) {
      await secrets.deleteSecret(name);
    } else {
      await secrets.setSecret(name, value);
    }
    // Non-secret fingerprint (last4 + date) so the UI can show WHICH key is set.
    // Riding on queries.set also publishes the settings bus event the bare
    // keychain write lacks.
    recordKeyMeta(name, value);
  }

  return {
    get: buildVm,

    async update(patch: unknown): Promise<SettingsVM> {
      const parsed = settingsPatchSchema.parse(patch);
      const before = readPersisted();

      if (parsed.ofapiKey !== undefined) await applySecret('ofapiKey', parsed.ofapiKey);
      if (parsed.anthropicKey !== undefined) await applySecret('anthropicKey', parsed.anthropicKey);
      if (parsed.openRouterKey !== undefined) {
        await applySecret('openRouterKey', parsed.openRouterKey);
      }
      if (parsed.hubApiKey !== undefined) await applySecret('hubApiKey', parsed.hubApiKey);
      if (
        parsed.hubBaseUrl !== undefined &&
        parsed.hubBaseUrl !== before.hubBaseUrl &&
        parsed.hubApiKey === undefined
      ) {
        await applySecret('hubApiKey', '');
      }

      for (const key of PERSISTED_SETTINGS_KEYS) {
        const value = parsed[key];
        if (value === undefined) continue;
        queries.set(key, value);
      }

      return buildVm();
    },
  };
}
