// SettingsStore (PRD F9, SPEC §10 `settings(key, value JSON)`): non-secret
// settings persist one row per field; API keys route to the OS keychain and
// never appear in the DB or in any returned view model.

import { z } from 'zod';
import {
  DEEP_MAX_MESSAGE_COUNT,
  DEEP_MIN_MESSAGE_COUNT,
  DEFAULT_SETTINGS,
  IMPROVE_MAX_MESSAGE_COUNT,
  IMPROVE_MIN_MESSAGE_COUNT,
  PING_MAX_MESSAGE_COUNT,
  PING_MIN_MESSAGE_COUNT,
  QUICK_MAX_MESSAGE_COUNT,
  QUICK_MIN_MESSAGE_COUNT,
} from '@chatgoose/shared';
import type {
  ModelSelectableFeature,
  ReasoningEffort,
  ReplyTone,
} from '@chatgoose/shared/types';
import { UI_LOCALE_SETTINGS } from '@chatgoose/shared/i18n/index';
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
  'defaultReplyTone',
  'creditBudgetPerShift',
  'accountMappings',
  'hubBaseUrl',
  'accountPageLabels',
  'spendStyle',
  'supportersListMappings',
  'uiLocale',
  'uiScale',
] as const satisfies readonly (keyof PersistedSettings)[];

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
  defaultReplyTone: z.enum(REPLY_TONE_VALUES),
  creditBudgetPerShift: z.number().positive().nullable(),
  accountMappings: z.record(z.string(), z.string()),
  // Agency Hub core base URL (SPEC §6.2/§9); null = hub mode off.
  hubBaseUrl: z.string().min(1).nullable(),
  // Manual OFAPI accountId → core page-label overrides (SPEC §8.5).
  accountPageLabels: z.record(z.string(), z.string()),
  // Chat-list lifetime-spend style (DESIGN §1): bare figure (default) or chip.
  spendStyle: z.enum(['figure', 'chip']),
  // Supporters board: per-account ordered OM list ids → shelves (PLAN item 12).
  supportersListMappings: z.record(z.string(), z.array(z.string().min(1).max(64)).max(50)),
  // Interface language; 'system' resolves from the OS locale at runtime.
  uiLocale: z.enum(UI_LOCALE_SETTINGS),
  // Window zoom factor — fixed steps only, applied via webContents.setZoomFactor.
  uiScale: z.union([z.literal(0.9), z.literal(1), z.literal(1.1), z.literal(1.25)]),
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
  defaultReplyTone: DEFAULT_SETTINGS.defaultReplyTone,
  creditBudgetPerShift: null,
  accountMappings: {},
  hubBaseUrl: null,
  accountPageLabels: {},
  spendStyle: 'figure',
  supportersListMappings: {},
  uiLocale: 'system',
  uiScale: 1,
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
  defaultReplyTone: persistedFieldSchemas.defaultReplyTone.optional(),
  creditBudgetPerShift: persistedFieldSchemas.creditBudgetPerShift.optional(),
  accountMappings: persistedFieldSchemas.accountMappings.optional(),
  hubBaseUrl: persistedFieldSchemas.hubBaseUrl.optional(),
  accountPageLabels: persistedFieldSchemas.accountPageLabels.optional(),
  spendStyle: persistedFieldSchemas.spendStyle.optional(),
  supportersListMappings: persistedFieldSchemas.supportersListMappings.optional(),
  uiLocale: persistedFieldSchemas.uiLocale.optional(),
  uiScale: persistedFieldSchemas.uiScale.optional(),
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
      defaultReplyTone: readField('defaultReplyTone'),
      creditBudgetPerShift: readField('creditBudgetPerShift'),
      accountMappings: readField('accountMappings'),
      hubBaseUrl: readField('hubBaseUrl'),
      accountPageLabels: readField('accountPageLabels'),
      spendStyle: readField('spendStyle'),
      supportersListMappings: readField('supportersListMappings'),
      uiLocale: readField('uiLocale'),
      uiScale: readField('uiScale'),
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

      if (parsed.ofapiKey !== undefined) await applySecret('ofapiKey', parsed.ofapiKey);
      if (parsed.anthropicKey !== undefined) await applySecret('anthropicKey', parsed.anthropicKey);
      if (parsed.openRouterKey !== undefined) {
        await applySecret('openRouterKey', parsed.openRouterKey);
      }
      if (parsed.hubApiKey !== undefined) await applySecret('hubApiKey', parsed.hubApiKey);

      for (const key of PERSISTED_SETTINGS_KEYS) {
        const value = parsed[key];
        if (value === undefined) continue;
        queries.set(key, value);
      }

      return buildVm();
    },
  };
}
