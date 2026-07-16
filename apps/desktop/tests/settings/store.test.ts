import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_FEATURE_MODELS,
  DEFAULT_FEATURE_REASONING,
  DEFAULT_AGENCY_HUB_BASE_URL,
  DEFAULT_SETTINGS,
} from '@chatgoose/shared';
import {
  HUB_CREDENTIAL_TRANSITION_KEY,
  createSettingsStore,
} from '@main/settings/store';
import {
  HUB_API_KEY_BINDING_KEY,
  HUB_DEVICE_IDENTITY_KEY,
  HUB_DEVICE_TOKEN_BINDING_KEY,
  HUB_DEVICE_TOKEN_ACTIVATION_KEY,
  HUB_DEVICE_TOKEN_REVOCATION_KEY,
  deviceTokenDigest,
} from '@main/hub/credential-journal';
import { abandonHubDeviceTokenCustody } from '@main/hub/device-token';
import type { SecretStoreLike, SettingsQueries } from '@main/settings/store';
import {
  LEGACY_PERSONA_SCOPE_CLAIM_KEY,
  ensurePersonaStorageScope,
  personaAccountMappingsKey,
  personaCacheKey,
  personaPendingIntentsKey,
  personaStorageScopeForHub,
} from '@main/personas/pending';
import type { SecretName } from '@main/secrets/keychain';

// Mirrors the db module's SettingsQueries: rows hold JSON text, get() parses
// (and therefore throws on corrupt rows), set() serializes.
interface FakeQueries extends SettingsQueries {
  rows: Map<string, string>;
}

function createFakeQueries(): FakeQueries {
  const rows = new Map<string, string>();
  const queries: FakeQueries = {
    rows,
    get: (key) => {
      const raw = rows.get(key);
      if (raw === undefined) return undefined;
      const parsed: unknown = JSON.parse(raw);
      return parsed;
    },
    set: (key, value) => {
      rows.set(key, JSON.stringify(value));
    },
    remove: (key) => {
      rows.delete(key);
    },
    batch: (mutations) => {
      const before = new Map(rows);
      try {
        for (const mutation of mutations) {
          if (mutation.kind === 'set') {
            queries.set(mutation.key, mutation.value);
          } else {
            queries.remove(mutation.key);
          }
        }
      } catch (error) {
        rows.clear();
        for (const [key, value] of before) rows.set(key, value);
        throw error;
      }
    },
    all: () => {
      const out: Record<string, unknown> = {};
      for (const [key, raw] of rows) {
        out[key] = JSON.parse(raw);
      }
      return out;
    },
  };
  return queries;
}

interface FakeSecrets extends SecretStoreLike {
  values: Map<SecretName, string>;
}

function createFakeSecrets(): FakeSecrets {
  const values = new Map<SecretName, string>();
  return {
    values,
    getSecret: (name) => Promise.resolve(values.get(name) ?? null),
    hasSecret: (name) => Promise.resolve(values.has(name)),
    setSecret: (name, value) => {
      values.set(name, value);
      return Promise.resolve();
    },
    deleteSecret: (name) => {
      values.delete(name);
      return Promise.resolve();
    },
  };
}

function createStore() {
  const queries = createFakeQueries();
  const secrets = createFakeSecrets();
  const store = createSettingsStore({ queries, secrets });
  return { store, queries, secrets };
}

function seedActiveHubPair(
  queries: FakeQueries,
  secrets: FakeSecrets,
  hubBaseUrl = DEFAULT_AGENCY_HUB_BASE_URL,
): void {
  queries.set('hubBaseUrl', hubBaseUrl);
  queries.set('keyMeta', { hub: { last4: 'old1', setAt: 1 } });
  secrets.values.set('hubApiKey', 'agency_hub_core_old1');
  queries.set(HUB_API_KEY_BINDING_KEY, {
    version: 1,
    hubBaseUrl,
    tokenDigest: deviceTokenDigest('agency_hub_core_old1'),
  });
}

describe('settings store', () => {
  it('returns shared defaults on an empty table', async () => {
    const { store } = createStore();
    const vm = await store.get();
    expect(vm.quickMessageCount).toBe(DEFAULT_SETTINGS.quickMessageCount);
    expect(vm.pingMessageCount).toBe(DEFAULT_SETTINGS.pingMessageCount);
    expect(vm.improveMessageCount).toBe(DEFAULT_SETTINGS.improveMessageCount);
    expect(vm.deepMessageCount).toBe(DEFAULT_SETTINGS.deepMessageCount);
    expect(vm.defaultReplyTone).toBe(DEFAULT_SETTINGS.defaultReplyTone);
    expect(vm.debugMode).toBe(DEFAULT_SETTINGS.debugMode);
    expect(vm.promptCachingEnabled).toBe(DEFAULT_SETTINGS.promptCachingEnabled);
    expect(vm.featureModels).toEqual(DEFAULT_FEATURE_MODELS);
    expect(vm.featureReasoning).toEqual(DEFAULT_FEATURE_REASONING);
    expect(vm.notificationsEnabled).toBe(true);
    expect(vm.soundEnabled).toBe(true);
    expect(vm.markAsReadOnOpen).toBe(false);
    expect(vm.autoReadChats).toBe(false);
    expect(vm.creditBudgetPerShift).toBeNull();
    expect(vm.accountMappings).toEqual({});
    expect(vm.accountOrder).toEqual([]);
    expect(vm.accountPageLabels).toEqual({});
    expect(vm.hubBaseUrl).toBe(DEFAULT_AGENCY_HUB_BASE_URL);
    expect(vm.ofapiReadTransport).toBe('hub');
    expect(vm.ofapiWriteTransport).toBe('hub');
    expect(vm.aiGatewayTransport).toBe('feature');
    expect(vm.hubModeOverride).toBe('auto');
    expect(vm.spendSweepRollbackToLegacy).toBe(false);
    expect(vm.unreadReconcile).toEqual({
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
    });
    expect(vm.spendStyle).toBe('figure');
    expect(vm.uiLocale).toBe('system');
    expect(vm.uiScale).toBe(1);
    expect(vm.uiTheme).toBe('light');
    expect(vm.keyMeta).toEqual({ hub: null });
    expect(vm.hasHubKey).toBe(false);
  });

  it('persists UI and hub transport settings (round-trip) and zod-rejects bad values', async () => {
    const { store, queries, secrets } = createStore();
    const vm = await store.update({
      uiLocale: 'ru',
      uiScale: 1.25,
      uiTheme: 'dark',
      ofapiReadTransport: 'hub',
      ofapiWriteTransport: 'hub',
      aiGatewayTransport: 'feature',
      hubModeOverride: 'hub',
      spendSweepRollbackToLegacy: false,
      unreadReconcile: {
        enabled: true,
        triggerOnUnreadTabOpen: false,
        triggerOnWindowFocus: true,
        triggerOnAccountFocus: false,
        focusDebounceMs: 10_000,
        immediateMaxPages: 4,
        focusedIntervalMs: 120_000,
        focusedMaxPages: 2,
        hiddenEnabled: false,
        hiddenIntervalMs: 900_000,
        hiddenMaxPages: 1,
      },
    });
    expect(vm.uiLocale).toBe('ru');
    expect(vm.uiScale).toBe(1.25);
    expect(vm.uiTheme).toBe('dark');
    expect(vm.ofapiReadTransport).toBe('hub');
    expect(vm.ofapiWriteTransport).toBe('hub');
    expect(vm.aiGatewayTransport).toBe('feature');
    expect(vm.hubModeOverride).toBe('hub');
    expect(vm.spendSweepRollbackToLegacy).toBe(false);
    expect(vm.unreadReconcile.immediateMaxPages).toBe(4);
    expect(vm.unreadReconcile.triggerOnUnreadTabOpen).toBe(false);

    const reread = createSettingsStore({ queries, secrets });
    const again = await reread.get();
    expect(again.uiLocale).toBe('ru');
    expect(again.uiScale).toBe(1.25);
    expect(again.uiTheme).toBe('dark');
    expect(again.ofapiReadTransport).toBe('hub');
    expect(again.ofapiWriteTransport).toBe('hub');
    expect(again.aiGatewayTransport).toBe('feature');
    expect(again.hubModeOverride).toBe('hub');
    expect(again.spendSweepRollbackToLegacy).toBe(false);
    expect(again.unreadReconcile.focusedIntervalMs).toBe(120_000);

    await expect(store.update({ uiLocale: 'de' })).rejects.toThrow();
    await expect(store.update({ uiScale: 2 })).rejects.toThrow();
    await expect(store.update({ uiScale: 0.95 })).rejects.toThrow();
    await expect(store.update({ uiTheme: 'sepia' })).rejects.toThrow();
    await expect(store.update({ ofapiReadTransport: 'proxy' })).rejects.toThrow();
    await expect(store.update({ ofapiWriteTransport: 'direct' })).rejects.toThrow();
    await expect(store.update({ ofapiWriteTransport: 'proxy' })).rejects.toThrow();
    await expect(store.update({ aiGatewayTransport: 'hub' })).rejects.toThrow();
    await expect(store.update({ hubModeOverride: 'both' })).rejects.toThrow();
    await expect(store.update({ spendSweepRollbackToLegacy: 'yes' })).rejects.toThrow();
    await expect(
      store.update({
        unreadReconcile: { ...vm.unreadReconcile, focusedIntervalMs: 1 },
      }),
    ).rejects.toThrow();
  });

  it('records non-secret key metadata (last4 + setAt) on save and clears it on delete', async () => {
    const queries = createFakeQueries();
    const secrets = createFakeSecrets();
    const store = createSettingsStore({ queries, secrets, now: () => 1_750_000_000_000 });

    const vm = await store.update({ hubApiKey: 'agency_hub_core_a4f2' });
    expect(vm.keyMeta.hub).toEqual({ last4: 'a4f2', setAt: 1_750_000_000_000 });
    expect(vm.hubApiKeyBindingState).toBe('bound');

    // last4 is the only key-derived material allowed in the table.
    const tableDump = JSON.stringify([...queries.rows.entries()]);
    expect(tableDump).not.toContain('agency_hub_core_a4f2');
    expect(tableDump).toContain('a4f2');

    const cleared = await store.update({ hubApiKey: '' });
    expect(cleared.keyMeta.hub).toBeNull();
    expect(cleared.hubApiKeyBindingState).toBe('none');
  });

  it.each(['hubBaseUrl', 'keyMeta'] as const)(
    'recovers after restart when SQLite fails persistently at %s after durable intent',
    async (failureKey) => {
      const baseQueries = createFakeQueries();
      const secrets = createFakeSecrets();
      seedActiveHubPair(baseQueries, secrets);
      let fail = true;
      const queries: FakeQueries = {
        ...baseQueries,
        batch: (mutations) => {
          if (fail && mutations.some((mutation) => mutation.key === failureKey)) {
            throw new Error(`simulated ${failureKey} crash`);
          }
          baseQueries.batch(mutations);
        },
      };
      const store = createSettingsStore({ queries, secrets, now: () => 2 });
      const replacement = 'agency_hub_core_replacement_7788';

      await expect(store.update({
        hubBaseUrl: 'http://localhost:4000',
        hubApiKey: replacement,
        debugMode: true,
        uiTheme: 'dark',
        accountPageLabels: { acct_b: 'Page B' },
        accountMappings: { acct_b: 'custom:b' },
      })).rejects.toThrow(`simulated ${failureKey} crash`);

      // Promotion is last, so the old active credential survives every DB
      // failure window. SQLite contains only the non-secret intent + last4.
      expect(secrets.values.get('hubApiKey')).toBe('agency_hub_core_old1');
      expect(baseQueries.get(HUB_CREDENTIAL_TRANSITION_KEY)).toBeDefined();
      expect(JSON.stringify([...baseQueries.rows.entries()])).not.toContain(replacement);

      fail = false;
      const restarted = createSettingsStore({ queries, secrets, now: () => 2 });
      await restarted.recoverHubCredentialTransition?.();

      expect(secrets.values.get('hubApiKey')).toBe(replacement);
      expect(secrets.values.has('hubApiKeyStaged')).toBe(false);
      expect(baseQueries.get(HUB_CREDENTIAL_TRANSITION_KEY)).toBeUndefined();
      expect((await restarted.get()).hubBaseUrl).toBe('http://localhost:4000');
      expect((await restarted.get()).keyMeta.hub).toEqual({ last4: '7788', setAt: 2 });
      expect((await restarted.get()).debugMode).toBe(true);
      expect((await restarted.get()).uiTheme).toBe('dark');
      expect((await restarted.get()).accountPageLabels).toEqual({ acct_b: 'Page B' });
      expect((await restarted.get()).accountMappings).toEqual({ acct_b: 'custom:b' });
    },
  );

  it('recovers after restart when atomic keychain promotion fails after DB coordinates commit', async () => {
    const queries = createFakeQueries();
    const baseSecrets = createFakeSecrets();
    seedActiveHubPair(queries, baseSecrets);
    let failPromotion = true;
    const secrets: FakeSecrets = {
      ...baseSecrets,
      setSecret: (name, value) => {
        if (failPromotion && name === 'hubApiKey') {
          return Promise.reject(new Error('simulated promotion crash'));
        }
        return baseSecrets.setSecret(name, value);
      },
    };
    const store = createSettingsStore({ queries, secrets, now: () => 3 });
    const replacement = 'agency_hub_core_promoted_9911';

    await expect(store.update({
      hubBaseUrl: 'http://localhost:4000',
      hubApiKey: replacement,
    })).rejects.toThrow('simulated promotion crash');

    expect(baseSecrets.values.get('hubApiKey')).toBe('agency_hub_core_old1');
    expect(queries.get('hubBaseUrl')).toBe('http://localhost:4000');
    expect(queries.get(HUB_CREDENTIAL_TRANSITION_KEY)).toBeDefined();

    failPromotion = false;
    const restarted = createSettingsStore({ queries, secrets, now: () => 3 });
    await restarted.recoverHubCredentialTransition?.();

    expect(baseSecrets.values.get('hubApiKey')).toBe(replacement);
    expect(baseSecrets.values.has('hubApiKeyStaged')).toBe(false);
    expect(queries.get(HUB_CREDENTIAL_TRANSITION_KEY)).toBeUndefined();
  });

  it('rolls back to the old Hub pair when the staged key disappears before promotion', async () => {
    const baseQueries = createFakeQueries();
    const baseSecrets = createFakeSecrets();
    seedActiveHubPair(baseQueries, baseSecrets);
    baseQueries.set('debugMode', false);
    baseQueries.set('hubSync.v2Cursor.acct_old', { cursor: 'old-cursor' });
    let failPromotion = true;
    const secrets: FakeSecrets = {
      ...baseSecrets,
      setSecret: (name, value) => {
        if (failPromotion && name === 'hubApiKey') {
          return Promise.reject(new Error('simulated promotion crash'));
        }
        return baseSecrets.setSecret(name, value);
      },
    };
    const replacement = 'agency_hub_core_missing_stage_1122';
    const store = createSettingsStore({ queries: baseQueries, secrets, now: () => 4 });

    await expect(store.update({
      hubBaseUrl: 'http://localhost:4000',
      hubApiKey: replacement,
      debugMode: true,
    })).rejects.toThrow('simulated promotion crash');
    expect(baseQueries.get('hubBaseUrl')).toBe('http://localhost:4000');
    expect(baseQueries.get('hubSync.v2Cursor.acct_old')).toBeUndefined();
    baseSecrets.values.delete('hubApiKeyStaged');

    failPromotion = false;
    const restarted = createSettingsStore({ queries: baseQueries, secrets, now: () => 4 });
    await expect(restarted.recoverHubCredentialTransition?.()).resolves.toBeUndefined();

    expect(baseSecrets.values.get('hubApiKey')).toBe('agency_hub_core_old1');
    expect(baseQueries.get('hubBaseUrl')).toBe(DEFAULT_AGENCY_HUB_BASE_URL);
    expect(baseQueries.get('debugMode')).toBe(false);
    expect(baseQueries.get('hubSync.v2Cursor.acct_old')).toEqual({ cursor: 'old-cursor' });
    expect(baseQueries.get(HUB_CREDENTIAL_TRANSITION_KEY)).toBeUndefined();
  });

  it('uses the exact old binding to survive a transient source decrypt failure and lost staging', async () => {
    const queries = createFakeQueries();
    const baseSecrets = createFakeSecrets();
    seedActiveHubPair(queries, baseSecrets);
    let failSourceRead = true;
    let failPromotion = true;
    const secrets: FakeSecrets = {
      ...baseSecrets,
      getSecret: (name) => {
        if (name === 'hubApiKey' && failSourceRead) {
          failSourceRead = false;
          return Promise.reject(new Error('transient DPAPI read failure'));
        }
        return baseSecrets.getSecret(name);
      },
      setSecret: (name, value) => {
        if (name === 'hubApiKey' && failPromotion) {
          return Promise.reject(new Error('simulated promotion crash'));
        }
        return baseSecrets.setSecret(name, value);
      },
    };
    const store = createSettingsStore({ queries, secrets, now: () => 4 });

    await expect(store.update({
      hubBaseUrl: 'http://localhost:4000',
      hubApiKey: 'agency_hub_core_candidate_lost_7711',
      debugMode: true,
    })).rejects.toThrow('simulated promotion crash');
    expect(queries.get(HUB_CREDENTIAL_TRANSITION_KEY)).toMatchObject({
      sourceKeyUnreadable: true,
      sourceKeyDigest: deviceTokenDigest('agency_hub_core_old1'),
    });
    baseSecrets.values.delete('hubApiKeyStaged');
    failPromotion = false;

    const restarted = createSettingsStore({ queries, secrets, now: () => 4 });
    await expect(restarted.recoverHubCredentialTransition?.()).resolves.toBeUndefined();

    expect(baseSecrets.values.get('hubApiKey')).toBe('agency_hub_core_old1');
    expect(queries.get('hubBaseUrl')).toBe(DEFAULT_AGENCY_HUB_BASE_URL);
    expect(queries.get('debugMode')).toBeUndefined();
    expect(queries.get(HUB_API_KEY_BINDING_KEY)).toMatchObject({
      hubBaseUrl: DEFAULT_AGENCY_HUB_BASE_URL,
      tokenDigest: deviceTokenDigest('agency_hub_core_old1'),
    });
    expect(queries.get(HUB_CREDENTIAL_TRANSITION_KEY)).toBeUndefined();
  });

  it('rolls back instead of boot-looping on a mismatched encrypted staging record', async () => {
    const queries = createFakeQueries();
    const baseSecrets = createFakeSecrets();
    seedActiveHubPair(queries, baseSecrets);
    let failPromotion = true;
    const secrets: FakeSecrets = {
      ...baseSecrets,
      setSecret: (name, value) => {
        if (failPromotion && name === 'hubApiKey') {
          return Promise.reject(new Error('simulated promotion crash'));
        }
        return baseSecrets.setSecret(name, value);
      },
    };
    const store = createSettingsStore({ queries, secrets, now: () => 5 });
    await expect(store.update({
      hubBaseUrl: 'http://localhost:4000',
      hubApiKey: 'agency_hub_core_target_2233',
    })).rejects.toThrow('simulated promotion crash');
    baseSecrets.values.set('hubApiKeyStaged', JSON.stringify({
      version: 1,
      transitionId: '00000000-0000-4000-8000-000000000099',
      value: 'agency_hub_core_foreign',
    }));

    failPromotion = false;
    const restarted = createSettingsStore({ queries, secrets, now: () => 5 });
    await expect(restarted.recoverHubCredentialTransition?.()).resolves.toBeUndefined();

    expect(baseSecrets.values.get('hubApiKey')).toBe('agency_hub_core_old1');
    expect(baseSecrets.values.has('hubApiKeyStaged')).toBe(false);
    expect(queries.get('hubBaseUrl')).toBe(DEFAULT_AGENCY_HUB_BASE_URL);
    expect(queries.get(HUB_CREDENTIAL_TRANSITION_KEY)).toBeUndefined();
  });

  it('rolls back instead of boot-looping when encrypted staging cannot be decrypted', async () => {
    const queries = createFakeQueries();
    const baseSecrets = createFakeSecrets();
    seedActiveHubPair(queries, baseSecrets);
    let failPromotion = true;
    const writingSecrets: FakeSecrets = {
      ...baseSecrets,
      setSecret: (name, value) => {
        if (failPromotion && name === 'hubApiKey') {
          return Promise.reject(new Error('simulated promotion crash'));
        }
        return baseSecrets.setSecret(name, value);
      },
    };
    const store = createSettingsStore({ queries, secrets: writingSecrets, now: () => 5 });
    await expect(store.update({
      hubBaseUrl: 'http://localhost:4000',
      hubApiKey: 'agency_hub_core_target_6677',
      debugMode: true,
    })).rejects.toThrow('simulated promotion crash');

    failPromotion = false;
    const unreadableSecrets: FakeSecrets = {
      ...baseSecrets,
      getSecret: (name) => name === 'hubApiKeyStaged'
        ? Promise.reject(new Error('DPAPI decrypt failed'))
        : baseSecrets.getSecret(name),
    };
    const restarted = createSettingsStore({ queries, secrets: unreadableSecrets, now: () => 5 });
    await expect(restarted.recoverHubCredentialTransition?.()).resolves.toBeUndefined();

    expect(baseSecrets.values.get('hubApiKey')).toBe('agency_hub_core_old1');
    expect(baseSecrets.values.has('hubApiKeyStaged')).toBe(false);
    expect(queries.get('hubBaseUrl')).toBe(DEFAULT_AGENCY_HUB_BASE_URL);
    expect(queries.get('debugMode')).toBeUndefined();
    expect(queries.get(HUB_CREDENTIAL_TRANSITION_KEY)).toBeUndefined();
  });

  it('disables Hub instead of pairing a foreign active key with rollback coordinates', async () => {
    const queries = createFakeQueries();
    const baseSecrets = createFakeSecrets();
    seedActiveHubPair(queries, baseSecrets);
    queries.set('debugMode', false);
    let failPromotion = true;
    const secrets: FakeSecrets = {
      ...baseSecrets,
      setSecret: (name, value) => {
        if (failPromotion && name === 'hubApiKey') {
          return Promise.reject(new Error('simulated promotion crash'));
        }
        return baseSecrets.setSecret(name, value);
      },
    };
    const store = createSettingsStore({ queries, secrets, now: () => 5 });
    await expect(store.update({
      hubBaseUrl: 'http://localhost:4000',
      hubApiKey: 'agency_hub_core_target_4455',
      debugMode: true,
    })).rejects.toThrow('simulated promotion crash');
    baseSecrets.values.set('hubApiKey', 'agency_hub_core_foreign_restore');
    baseSecrets.values.delete('hubApiKeyStaged');

    failPromotion = false;
    const restarted = createSettingsStore({ queries, secrets, now: () => 5 });
    await expect(restarted.recoverHubCredentialTransition?.()).resolves.toBeUndefined();

    expect(baseSecrets.values.has('hubApiKey')).toBe(false);
    expect(queries.get('hubBaseUrl')).toBeNull();
    expect(queries.get('keyMeta')).toEqual({ hub: null });
    expect(queries.get('debugMode')).toBe(false);
    expect(queries.get(HUB_CREDENTIAL_TRANSITION_KEY)).toBeUndefined();
  });

  it('finishes forward when the target key was promoted before its staged copy disappeared', async () => {
    const baseQueries = createFakeQueries();
    const secrets = createFakeSecrets();
    seedActiveHubPair(baseQueries, secrets);
    let failJournalRemoval = true;
    const queries: FakeQueries = {
      ...baseQueries,
      batch: (mutations) => {
        if (
          failJournalRemoval
          && mutations.some((mutation) => (
            mutation.kind === 'remove' && mutation.key === HUB_CREDENTIAL_TRANSITION_KEY
          ))
        ) {
          throw new Error('simulated crash before journal commit');
        }
        baseQueries.batch(mutations);
      },
    };
    const replacement = 'agency_hub_core_already_promoted_3344';
    const store = createSettingsStore({ queries, secrets, now: () => 6 });

    await expect(store.update({
      hubBaseUrl: 'http://localhost:4000',
      hubApiKey: replacement,
    })).rejects.toThrow('simulated crash before journal commit');
    expect(secrets.values.get('hubApiKey')).toBe(replacement);
    secrets.values.delete('hubApiKeyStaged');

    failJournalRemoval = false;
    const restarted = createSettingsStore({ queries, secrets, now: () => 6 });
    await expect(restarted.recoverHubCredentialTransition?.()).resolves.toBeUndefined();

    expect(secrets.values.get('hubApiKey')).toBe(replacement);
    expect(baseQueries.get('hubBaseUrl')).toBe('http://localhost:4000');
    expect(baseQueries.get(HUB_CREDENTIAL_TRANSITION_KEY)).toBeUndefined();
  });

  it('fails visible for an unrecoverable legacy v1 transition with no source proof', async () => {
    const queries = createFakeQueries();
    const secrets = createFakeSecrets();
    seedActiveHubPair(queries, secrets);
    queries.set('hubBaseUrl', 'http://localhost:4000');
    queries.set(HUB_CREDENTIAL_TRANSITION_KEY, {
      version: 1,
      id: '00000000-0000-4000-8000-000000000088',
      targetHubBaseUrl: 'http://localhost:4000',
      targetKeyMeta: { last4: '7788', setAt: 7 },
      keyAction: 'promote-staged',
      deleteDeadDeviceToken: false,
      clearHubSyncState: true,
      nonSecretPatch: {},
      personaMappingsKey: null,
    });

    const restarted = createSettingsStore({ queries, secrets });
    await expect(restarted.recoverHubCredentialTransition?.()).resolves.toBeUndefined();

    expect(secrets.values.has('hubApiKey')).toBe(false);
    expect(queries.get('hubBaseUrl')).toBeNull();
    expect(queries.get('keyMeta')).toEqual({ hub: null });
    expect(queries.get(HUB_CREDENTIAL_TRANSITION_KEY)).toBeUndefined();
  });

  it('replays proven-dead device-token cleanup from the same durable replacement intent', async () => {
    const queries = createFakeQueries();
    const baseSecrets = createFakeSecrets();
    seedActiveHubPair(queries, baseSecrets);
    baseSecrets.values.set('hubDeviceToken', 'agency_hub_device_dead');
    queries.set(HUB_DEVICE_IDENTITY_KEY, {
      version: 1,
      username: 'Maxim',
      label: 'Kevin',
      tokenLast4: 'dead',
      issuedAt: '2026-07-15T21:42:15.000Z',
      expiresAt: '2026-10-13T21:42:15.000Z',
    });
    let failCleanup = true;
    const secrets: FakeSecrets = {
      ...baseSecrets,
      deleteSecret: (name) => {
        if (failCleanup && name === 'hubDeviceToken') {
          return Promise.reject(new Error('simulated token cleanup crash'));
        }
        return baseSecrets.deleteSecret(name);
      },
    };
    const replacement = 'agency_hub_core_after_dead_token';
    const store = createSettingsStore({ queries, secrets });

    await expect(store.update(
      { hubApiKey: replacement },
      { deleteDeadHubDeviceToken: true },
    )).rejects.toThrow('simulated token cleanup crash');

    expect(baseSecrets.values.get('hubApiKey')).toBe('agency_hub_core_old1');
    expect(baseSecrets.values.get('hubDeviceToken')).toBe('agency_hub_device_dead');
    expect(queries.get(HUB_CREDENTIAL_TRANSITION_KEY)).toBeDefined();

    failCleanup = false;
    const restarted = createSettingsStore({ queries, secrets });
    await restarted.recoverHubCredentialTransition?.();

    expect(baseSecrets.values.get('hubApiKey')).toBe(replacement);
    expect(baseSecrets.values.has('hubDeviceToken')).toBe(false);
    expect(queries.get(HUB_CREDENTIAL_TRANSITION_KEY)).toBeUndefined();
    // D19: identity never outlives device custody.
    expect(queries.get(HUB_DEVICE_IDENTITY_KEY)).toBeUndefined();
  });

  it('deletes an encrypted staging orphan without promoting it when no durable intent exists', async () => {
    const queries = createFakeQueries();
    const secrets = createFakeSecrets();
    seedActiveHubPair(queries, secrets);
    secrets.values.set('hubApiKeyStaged', JSON.stringify({
      version: 1,
      transitionId: '00000000-0000-4000-8000-000000000000',
      value: 'agency_hub_core_must_not_activate',
    }));

    const restarted = createSettingsStore({ queries, secrets });
    await restarted.recoverHubCredentialTransition?.();

    expect(secrets.values.get('hubApiKey')).toBe('agency_hub_core_old1');
    expect(secrets.values.has('hubApiKeyStaged')).toBe(false);
    expect((await restarted.get()).hubBaseUrl).toBe(DEFAULT_AGENCY_HUB_BASE_URL);
  });

  it('deletes a journal-less unreadable staging orphan without trying to decrypt it', async () => {
    const queries = createFakeQueries();
    const baseSecrets = createFakeSecrets();
    seedActiveHubPair(queries, baseSecrets);
    baseSecrets.values.set('hubApiKeyStaged', 'corrupt-dpapi-blob');
    const stagedReads = vi.fn();
    const unreadableSecrets: FakeSecrets = {
      ...baseSecrets,
      getSecret: (name) => {
        if (name === 'hubApiKeyStaged') {
          stagedReads();
          return Promise.reject(new Error('DPAPI decrypt failed'));
        }
        return baseSecrets.getSecret(name);
      },
      hasSecret: (name) => name === 'hubApiKeyStaged'
        ? Promise.reject(new Error('DPAPI decrypt failed'))
        : baseSecrets.hasSecret(name),
    };

    const restarted = createSettingsStore({ queries, secrets: unreadableSecrets });
    await expect(restarted.recoverHubCredentialTransition?.()).resolves.toBeUndefined();

    expect(stagedReads).not.toHaveBeenCalled();
    expect(baseSecrets.values.has('hubApiKeyStaged')).toBe(false);
    expect(baseSecrets.values.get('hubApiKey')).toBe('agency_hub_core_old1');
  });

  it('keeps a bound API fallback usable when the device token cannot be decrypted', async () => {
    const queries = createFakeQueries();
    const baseSecrets = createFakeSecrets();
    seedActiveHubPair(queries, baseSecrets);
    baseSecrets.values.set('hubDeviceToken', 'unreadable-encrypted-blob');
    const unreadableSecrets: FakeSecrets = {
      ...baseSecrets,
      getSecret: (name) => name === 'hubDeviceToken'
        ? Promise.reject(new Error('DPAPI decrypt failed'))
        : baseSecrets.getSecret(name),
      hasSecret: (name) => name === 'hubDeviceToken'
        ? Promise.reject(new Error('DPAPI decrypt failed'))
        : baseSecrets.hasSecret(name),
    };
    const store = createSettingsStore({ queries, secrets: unreadableSecrets });

    await expect(store.get()).resolves.toMatchObject({
      hasHubDeviceToken: true,
      hubDeviceTokenBindingState: 'unreadable',
    });
    await expect(store.getHubConnection()).resolves.toMatchObject({
      bearer: 'agency_hub_core_old1',
      deviceToken: null,
      hubApiKey: 'agency_hub_core_old1',
      settings: { hubDeviceTokenBindingState: 'unreadable' },
    });
    await expect(abandonHubDeviceTokenCustody({
      keychain: unreadableSecrets,
      settings: queries,
    })).resolves.toBeUndefined();
    expect(baseSecrets.values.has('hubDeviceToken')).toBe(false);
  });

  it('keeps a bound device credential usable when the API key cannot be decrypted', async () => {
    const queries = createFakeQueries();
    const baseSecrets = createFakeSecrets();
    seedActiveHubPair(queries, baseSecrets);
    const deviceToken = 'agency_hub_device_independent_fallback';
    baseSecrets.values.set('hubDeviceToken', deviceToken);
    queries.set(HUB_DEVICE_TOKEN_BINDING_KEY, {
      version: 1,
      hubBaseUrl: DEFAULT_AGENCY_HUB_BASE_URL,
      tokenDigest: deviceTokenDigest(deviceToken),
    });
    const unreadableSecrets: FakeSecrets = {
      ...baseSecrets,
      getSecret: (name) => name === 'hubApiKey'
        ? Promise.reject(new Error('DPAPI decrypt failed'))
        : baseSecrets.getSecret(name),
      hasSecret: (name) => name === 'hubApiKey'
        ? Promise.reject(new Error('DPAPI decrypt failed'))
        : baseSecrets.hasSecret(name),
    };
    const store = createSettingsStore({ queries, secrets: unreadableSecrets });

    await expect(store.getHubConnection()).resolves.toMatchObject({
      bearer: deviceToken,
      deviceToken,
      hubApiKey: null,
      settings: { hubApiKeyBindingState: 'unreadable' },
    });
  });

  it('replaces an unreadable active Hub API key without decrypting the old file', async () => {
    const queries = createFakeQueries();
    const baseSecrets = createFakeSecrets();
    seedActiveHubPair(queries, baseSecrets);
    const unreadableValue = baseSecrets.values.get('hubApiKey');
    const recoveringSecrets: FakeSecrets = {
      ...baseSecrets,
      getSecret: (name) => name === 'hubApiKey'
        && baseSecrets.values.get(name) === unreadableValue
        ? Promise.reject(new Error('DPAPI decrypt failed'))
        : baseSecrets.getSecret(name),
      hasSecret: (name) => name === 'hubApiKey'
        && baseSecrets.values.get(name) === unreadableValue
        ? Promise.reject(new Error('DPAPI decrypt failed'))
        : baseSecrets.hasSecret(name),
    };
    const store = createSettingsStore({ queries, secrets: recoveringSecrets, now: () => 8 });

    await expect(store.get()).resolves.toMatchObject({ hasHubKey: true });
    const result = await store.update({ hubApiKey: 'agency_hub_core_recovered_8899' });

    expect(result.hasHubKey).toBe(true);
    expect(result.hubApiKeyBindingState).toBe('bound');
    expect(result.keyMeta.hub).toEqual({ last4: '8899', setAt: 8 });
    expect(baseSecrets.values.get('hubApiKey')).toBe('agency_hub_core_recovered_8899');
    expect(queries.get(HUB_CREDENTIAL_TRANSITION_KEY)).toBeUndefined();
  });

  it('keeps the old pair and removes staging when durable intent publication fails', async () => {
    const baseQueries = createFakeQueries();
    const secrets = createFakeSecrets();
    seedActiveHubPair(baseQueries, secrets);
    const queries: FakeQueries = {
      ...baseQueries,
      batch: (mutations) => {
        if (mutations.some((mutation) => mutation.key === HUB_CREDENTIAL_TRANSITION_KEY)) {
          throw new Error('simulated pre-intent crash');
        }
        baseQueries.batch(mutations);
      },
    };
    const store = createSettingsStore({ queries, secrets });

    await expect(store.update({
      hubBaseUrl: 'http://localhost:4000',
      hubApiKey: 'agency_hub_core_never_committed',
    })).rejects.toThrow('simulated pre-intent crash');

    expect(secrets.values.get('hubApiKey')).toBe('agency_hub_core_old1');
    expect(secrets.values.has('hubApiKeyStaged')).toBe(false);
    expect(baseQueries.get('hubBaseUrl')).toBe(DEFAULT_AGENCY_HUB_BASE_URL);
    expect(baseQueries.get(HUB_CREDENTIAL_TRANSITION_KEY)).toBeUndefined();
  });

  it('leaves the entire validated patch unchanged when encrypted staging fails', async () => {
    const queries = createFakeQueries();
    const baseSecrets = createFakeSecrets();
    seedActiveHubPair(queries, baseSecrets);
    const currentScope = personaStorageScopeForHub(DEFAULT_AGENCY_HUB_BASE_URL);
    queries.set('debugMode', false);
    queries.set('uiTheme', 'light');
    queries.set('accountPageLabels', { acct_old: 'Old page' });
    queries.set(personaAccountMappingsKey(currentScope), { acct_old: 'custom:old' });
    const rowsBefore = new Map(queries.rows);
    const secrets: FakeSecrets = {
      ...baseSecrets,
      setSecret: (name, value) => name === 'hubApiKeyStaged'
        ? Promise.reject(new Error('safeStorage staging failed'))
        : baseSecrets.setSecret(name, value),
    };
    const store = createSettingsStore({ queries, secrets });

    await expect(store.update({
      hubApiKey: 'agency_hub_core_new_secret',
      debugMode: true,
      uiTheme: 'dark',
      accountPageLabels: { acct_new: 'New page' },
      accountMappings: { acct_new: 'custom:new' },
    })).rejects.toThrow('safeStorage staging failed');

    expect(queries.rows).toEqual(rowsBefore);
    expect(baseSecrets.values.get('hubApiKey')).toBe('agency_hub_core_old1');
    expect(baseSecrets.values.has('hubApiKeyStaged')).toBe(false);
    expect(queries.get(HUB_CREDENTIAL_TRANSITION_KEY)).toBeUndefined();
  });

  it('rolls back every non-secret field when one atomic batch mutation fails', async () => {
    const queries = createFakeQueries();
    queries.set('debugMode', false);
    queries.set('uiTheme', 'light');
    const rowsBefore = new Map(queries.rows);
    const originalSet = queries.set;
    queries.set = (key, value) => {
      if (key === 'uiTheme') throw new Error('simulated batch write failure');
      originalSet(key, value);
    };
    const store = createSettingsStore({ queries, secrets: createFakeSecrets() });

    await expect(store.update({ debugMode: true, uiTheme: 'dark' }))
      .rejects.toThrow('simulated batch write failure');
    expect(queries.rows).toEqual(rowsBefore);
  });

  it('keyMeta is read-only: a patch attempting to set it is rejected', async () => {
    const { store } = createStore();
    await expect(
      store.update({ keyMeta: { ofapi: { last4: 'beef', setAt: 1 } } }),
    ).rejects.toThrow();
  });

  it('applies and persists a patch (visible to a fresh store instance)', async () => {
    const { store, queries, secrets } = createStore();
    const vm = await store.update({
      quickMessageCount: 50,
      debugMode: true,
      defaultReplyTone: 'flirty',
      accountMappings: { acct_1: 'personality-a' },
      accountOrder: ['acct_2', 'acct_1'],
      creditBudgetPerShift: 1500,
      spendStyle: 'chip',
    });
    expect(vm.quickMessageCount).toBe(50);
    expect(vm.debugMode).toBe(true);
    expect(vm.defaultReplyTone).toBe('flirty');
    expect(vm.accountMappings).toEqual({ acct_1: 'personality-a' });
    expect(vm.accountOrder).toEqual(['acct_2', 'acct_1']);
    expect(vm.creditBudgetPerShift).toBe(1500);
    expect(vm.spendStyle).toBe('chip');
    // untouched fields keep defaults
    expect(vm.deepMessageCount).toBe(DEFAULT_SETTINGS.deepMessageCount);

    const reread = createSettingsStore({ queries, secrets });
    expect((await reread.get()).quickMessageCount).toBe(50);
  });

  it('keeps account mappings isolated and restores them across Hub A -> B -> A', async () => {
    const { store, queries } = createStore();
    const hubA = DEFAULT_AGENCY_HUB_BASE_URL;
    const hubB = 'http://localhost:3100';
    // Pre-scope installations stored this field globally. The first effective
    // Hub claims it before later origins get their own empty mapping set.
    queries.set('accountMappings', { acct_a: 'persona-a' });

    expect((await store.get()).accountMappings).toEqual({ acct_a: 'persona-a' });
    expect((await store.update({ hubBaseUrl: hubB })).accountMappings).toEqual({});
    expect((await store.update({ accountMappings: { acct_b: 'persona-b' } })).accountMappings)
      .toEqual({ acct_b: 'persona-b' });
    expect((await store.update({ hubBaseUrl: hubA })).accountMappings)
      .toEqual({ acct_a: 'persona-a' });
    expect((await store.update({ hubBaseUrl: hubB })).accountMappings)
      .toEqual({ acct_b: 'persona-b' });
  });

  it('claims legacy persona state before copying and resumes only into the claimed Hub', () => {
    const queries = createFakeQueries();
    const hubA = personaStorageScopeForHub(DEFAULT_AGENCY_HUB_BASE_URL);
    const hubB = personaStorageScopeForHub('http://localhost:3100');
    const legacyCache = [{ id: 'custom:a', name: 'A', content: 'A prompt', updatedAt: 1 }];
    const legacyPending = { version: 1, intents: [{ opaque: 'preserve verbatim' }] };
    const legacyMappings = { acct_a: 'custom:a' };
    queries.set('personalities', legacyCache);
    queries.set('personalities.pendingIntents.v1', legacyPending);
    queries.set('accountMappings', legacyMappings);

    const originalSet = queries.set;
    let crashOnce = true;
    queries.set = (key, value) => {
      if (crashOnce && key === personaPendingIntentsKey(hubA)) {
        crashOnce = false;
        throw new Error('simulated crash between scoped copies');
      }
      originalSet(key, value);
    };

    expect(() => ensurePersonaStorageScope(queries, hubA.origin)).toThrow('simulated crash');
    expect(queries.get(LEGACY_PERSONA_SCOPE_CLAIM_KEY)).toMatchObject({
      origin: hubA.origin,
      phase: 'claimed',
    });
    expect(queries.get(personaCacheKey(hubA))).toEqual(legacyCache);

    // Restarted with B configured: completion still belongs to A. Nothing from
    // the legacy global bucket may be guessed into B.
    expect(ensurePersonaStorageScope(queries, hubB.origin)).toEqual(hubB);
    expect(queries.get(personaPendingIntentsKey(hubA))).toEqual(legacyPending);
    expect(queries.get(personaAccountMappingsKey(hubA))).toEqual(legacyMappings);
    expect(queries.get(personaCacheKey(hubB))).toBeUndefined();
    expect(queries.get(personaPendingIntentsKey(hubB))).toBeUndefined();
    expect(queries.get(personaAccountMappingsKey(hubB))).toBeUndefined();
    expect(queries.get(LEGACY_PERSONA_SCOPE_CLAIM_KEY)).toMatchObject({
      origin: hubA.origin,
      phase: 'complete',
    });
  });

  it('zod-rejects out-of-range and malformed patches', async () => {
    const { store } = createStore();
    await expect(store.update({ quickMessageCount: 4 })).rejects.toThrow(); // below min 5
    await expect(store.update({ quickMessageCount: 201 })).rejects.toThrow(); // above max 200
    await expect(store.update({ deepMessageCount: 3001 })).rejects.toThrow();
    await expect(store.update({ quickMessageCount: 50.5 })).rejects.toThrow();
    await expect(store.update({ defaultReplyTone: 'angry' })).rejects.toThrow();
    await expect(store.update({ debugMode: 'yes' })).rejects.toThrow();
    await expect(store.update({ spendStyle: 'badge' })).rejects.toThrow();
    await expect(store.update({ ofapiReadTransport: 'fallback' })).rejects.toThrow();
    await expect(store.update({ hubModeOverride: 'fallback' })).rejects.toThrow();
    await expect(store.update({ nonsense: 1 })).rejects.toThrow(); // unknown key
    await expect(store.update('not-an-object')).rejects.toThrow();
    // partial feature record is rejected (enum-keyed records are exhaustive)
    await expect(store.update({ featureModels: { 'fast-reply': 'x' } })).rejects.toThrow();
  });

  it("coerces a persisted 'direct' read transport to 'hub' on load (Stage 24 / DP 8)", async () => {
    const { store, queries } = createStore();
    // A machine that had flipped the (now removed) toggle before upgrading.
    queries.set('ofapiReadTransport', 'direct');
    const vm = await store.get();
    expect(vm.ofapiReadTransport).toBe('hub');
  });

  it('a rejected patch persists nothing', async () => {
    const { store, queries } = createStore();
    await expect(
      store.update({ debugMode: true, quickMessageCount: 9999 }),
    ).rejects.toThrow();
    expect(queries.rows.size).toBe(0);
  });

  it('routes API keys to the keychain, never to the settings table', async () => {
    const { store, queries } = createStore();
    const vm = await store.update({ hubApiKey: 'agency_hub_core_secret9' });
    expect(vm.hasHubKey).toBe(true);
    expect(vm.hubApiKeyBindingState).toBe('bound');

    const tableDump = JSON.stringify([...queries.rows.entries()]);
    expect(tableDump).not.toContain('agency_hub_core_secret9');

    // VM never carries key material
    const vmDump = JSON.stringify(vm);
    expect(vmDump).not.toContain('agency_hub_core_secret9');
    expect(Object.keys(vm)).not.toContain('hubApiKey');
  });

  it('quarantines readable legacy secrets when a fresh or purged DB has no origin bindings', async () => {
    const queries = createFakeQueries();
    const secrets = createFakeSecrets();
    secrets.values.set('hubApiKey', 'agency_hub_core_loopback_old');
    secrets.values.set('hubDeviceToken', 'agency_hub_device_loopback_old');
    const store = createSettingsStore({ queries, secrets });

    await expect(store.get()).resolves.toMatchObject({
      hubBaseUrl: DEFAULT_AGENCY_HUB_BASE_URL,
      hasHubKey: true,
      hubApiKeyBindingState: 'unbound',
      hasHubDeviceToken: true,
      hubDeviceTokenBindingState: 'unbound',
    });
    await expect(store.getHubConnection()).resolves.toMatchObject({
      hubBaseUrl: DEFAULT_AGENCY_HUB_BASE_URL,
      bearer: null,
      hubApiKey: null,
      deviceToken: null,
    });
  });

  it('clears a key when the patch value is empty/whitespace', async () => {
    const { store } = createStore();
    await store.update({ hubApiKey: 'agency_hub_core_x' });
    expect((await store.get()).hasHubKey).toBe(true);
    const vm = await store.update({ hubApiKey: '   ' });
    expect(vm.hasHubKey).toBe(false);
  });

  it('trims key material before storing', async () => {
    const { store, secrets } = createStore();
    await store.update({ hubApiKey: '  sk-padded  ' });
    expect(secrets.values.get('hubApiKey')).toBe('sk-padded');
  });

  it('Stage 31: a patch carrying retired vendor keys is rejected outright', async () => {
    const { store, secrets } = createStore();
    await expect(
      store.update({ anthropicKey: 'sk-ant-legacy', openRouterKey: 'or-legacy' } as never),
    ).rejects.toThrow(/anthropicKey/);
    expect(secrets.values.size).toBe(0);
  });

  it('routes the hub chatter key to the keychain and persists hubBaseUrl (round-trip)', async () => {
    const { store, queries, secrets } = createStore();
    const vm = await store.update({
      hubBaseUrl: 'http://localhost:4000',
      hubApiKey: 'agency_hub_core_secret',
    });
    expect(vm.hubBaseUrl).toBe('http://localhost:4000');
    expect(vm.hasHubKey).toBe(true);
    expect(secrets.values.get('hubApiKey')).toBe('agency_hub_core_secret');

    // key material never lands in the settings table or the VM
    const tableDump = JSON.stringify([...queries.rows.entries()]);
    expect(tableDump).not.toContain('agency_hub_core_secret');
    expect(JSON.stringify(vm)).not.toContain('agency_hub_core_secret');
    expect(Object.keys(vm)).not.toContain('hubApiKey');

    const reread = createSettingsStore({ queries, secrets });
    const again = await reread.get();
    expect(again.hubBaseUrl).toBe('http://localhost:4000');
    expect(again.hasHubKey).toBe(true);
  });

  it('hubBaseUrl defaults to production Hub, clears to null, and rejects the empty string', async () => {
    const { store } = createStore();
    const initial = await store.get();
    expect(initial.hubBaseUrl).toBe(DEFAULT_AGENCY_HUB_BASE_URL);
    expect(initial.hasHubKey).toBe(false);

    await store.update({ hubBaseUrl: 'http://localhost:4000/' });
    expect((await store.get()).hubBaseUrl).toBe('http://localhost:4000');
    const cleared = await store.update({ hubBaseUrl: null });
    expect(cleared.hubBaseUrl).toBeNull();
    await expect(store.update({ hubBaseUrl: '' })).rejects.toThrow();
  });

  it('rejects non-allowlisted Hub URLs before they can receive the hub key', async () => {
    const { store, secrets } = createStore();
    await expect(
      store.update({ hubBaseUrl: 'https://evil.example.com', hubApiKey: 'agency_hub_core_secret' }),
    ).rejects.toThrow();
    await expect(store.update({ hubBaseUrl: 'http://gosling-agency.ru' })).rejects.toThrow();
    await expect(store.update({ hubBaseUrl: 'https://gosling-agency.ru.evil.test' })).rejects.toThrow();
    expect(secrets.values.has('hubApiKey')).toBe(false);
  });

  it('clears the hub key when the Hub host changes without a replacement key', async () => {
    const { store, secrets } = createStore();
    await store.update({
      hubBaseUrl: DEFAULT_AGENCY_HUB_BASE_URL,
      hubApiKey: 'agency_hub_core_secret',
    });
    expect((await store.get()).hasHubKey).toBe(true);

    const vm = await store.update({ hubBaseUrl: 'http://127.0.0.1:4000' });
    expect(vm.hubBaseUrl).toBe('http://127.0.0.1:4000');
    expect(vm.hasHubKey).toBe(false);
    expect(secrets.values.has('hubApiKey')).toBe(false);
  });

  it('rejects a Hub host change before any mutation while a device token exists', async () => {
    const { store, secrets } = createStore();
    await store.update({
      hubBaseUrl: DEFAULT_AGENCY_HUB_BASE_URL,
      hubApiKey: 'agency_hub_core_secret',
    });
    await secrets.setSecret('hubDeviceToken', 'agency_hub_device_secret');
    expect((await store.get()).hasHubDeviceToken).toBe(true);

    await expect(store.update({ hubBaseUrl: 'http://127.0.0.1:4000' }))
      .rejects.toThrow(/sign out.*device token.*Hub URL/i);

    const vm = await store.get();
    expect(vm.hubBaseUrl).toBe(DEFAULT_AGENCY_HUB_BASE_URL);
    expect(vm.hasHubKey).toBe(true);
    expect(vm.hasHubDeviceToken).toBe(true);
    expect(secrets.values.get('hubApiKey')).toBe('agency_hub_core_secret');
    expect(secrets.values.get('hubDeviceToken')).toBe('agency_hub_device_secret');
  });

  it('rejects a Hub switch while deferred activation custody targets the old origin', async () => {
    const { store, queries, secrets } = createStore();
    const token = 'agency_hub_pending_device_old_origin';
    const id = '00000000-0000-4000-8000-000000000010';
    secrets.values.set('hubDeviceTokenStaged', JSON.stringify({ version: 1, journalId: id, token }));
    queries.set(HUB_DEVICE_TOKEN_ACTIVATION_KEY, {
      version: 1,
      id,
      hubBaseUrl: DEFAULT_AGENCY_HUB_BASE_URL,
      tokenDigest: deviceTokenDigest(token),
      reservationId: 10,
      label: 'desktop',
      keyPrefix: 'agency_hub_pending_device_old_',
      reservationExpiresAt: '2026-07-13T17:10:00.000Z',
    });
    await expect(store.get()).resolves.toMatchObject({
      hasHubDeviceToken: false,
      hubDeviceTokenTransition: 'activation',
    });
    const rowsBefore = new Map(queries.rows);

    await expect(store.update({ hubBaseUrl: 'http://localhost:4000' }))
      .rejects.toThrow(/sign out.*device token.*Hub URL/i);
    expect(queries.rows).toEqual(rowsBefore);
    expect(secrets.values.has('hubDeviceTokenStaged')).toBe(true);

    // Once recovery proves the reservation terminal-invalid and removes both
    // pieces, the same switch is permitted.
    queries.remove(HUB_DEVICE_TOKEN_ACTIVATION_KEY);
    secrets.values.delete('hubDeviceTokenStaged');
    await expect(store.update({ hubBaseUrl: 'http://localhost:4000' }))
      .resolves.toMatchObject({ hubBaseUrl: 'http://localhost:4000' });
  });

  it('permits an origin migration after explicit local abandonment of unavailable-old-Hub custody', async () => {
    const { store, queries, secrets } = createStore();
    const token = 'agency_hub_device_old_origin';
    const id = '00000000-0000-4000-8000-000000000011';
    secrets.values.set('hubDeviceToken', token);
    secrets.values.set('hubDeviceTokenRevoking', JSON.stringify({
      version: 1, journalId: id, token,
    }));
    queries.set(HUB_DEVICE_TOKEN_REVOCATION_KEY, {
      version: 1,
      id,
      hubBaseUrl: DEFAULT_AGENCY_HUB_BASE_URL,
      tokenDigest: deviceTokenDigest(token),
    });

    await expect(store.update({
      hubBaseUrl: 'http://localhost:4000',
      hubApiKey: 'agency_hub_core_new_origin',
    })).rejects.toThrow(/sign out.*device token.*Hub URL/i);

    await abandonHubDeviceTokenCustody({ keychain: secrets, settings: queries });
    await expect(store.update({
      hubBaseUrl: 'http://localhost:4000',
      hubApiKey: 'agency_hub_core_new_origin',
    })).resolves.toMatchObject({
      hubBaseUrl: 'http://localhost:4000',
      hasHubDeviceToken: false,
      hasHubKey: true,
    });
    expect(secrets.values.has('hubDeviceToken')).toBe(false);
    expect(queries.get(HUB_DEVICE_TOKEN_REVOCATION_KEY)).toBeUndefined();
  });

  it('keeps the hub key when the Hub host changes with a replacement key', async () => {
    const { store, secrets } = createStore();
    await store.update({
      hubBaseUrl: DEFAULT_AGENCY_HUB_BASE_URL,
      hubApiKey: 'agency_hub_core_old',
    });

    const vm = await store.update({
      hubBaseUrl: 'http://localhost:4000',
      hubApiKey: 'agency_hub_core_new',
    });
    expect(vm.hasHubKey).toBe(true);
    expect(secrets.values.get('hubApiKey')).toBe('agency_hub_core_new');
  });

  it('rejects a combined URL/replacement-key save before overwriting either old credential', async () => {
    const { store, secrets } = createStore();
    await store.update({
      hubBaseUrl: DEFAULT_AGENCY_HUB_BASE_URL,
      hubApiKey: 'agency_hub_core_old',
    });
    await secrets.setSecret('hubDeviceToken', 'agency_hub_device_old');
    expect((await store.get()).hasHubDeviceToken).toBe(true);

    await expect(store.update({
      hubBaseUrl: 'http://127.0.0.1:4000',
      hubApiKey: 'agency_hub_core_new',
    })).rejects.toThrow(/sign out.*device token.*Hub URL/i);

    const vm = await store.get();
    expect(vm.hubBaseUrl).toBe(DEFAULT_AGENCY_HUB_BASE_URL);
    expect(vm.hasHubKey).toBe(true);
    expect(vm.hasHubDeviceToken).toBe(true);
    expect(secrets.values.get('hubApiKey')).toBe('agency_hub_core_old');
    expect(secrets.values.get('hubDeviceToken')).toBe('agency_hub_device_old');
  });

  it('does not false-positive on a normalized same-origin URL while a device token exists', async () => {
    const { store, secrets } = createStore();
    await secrets.setSecret('hubDeviceToken', 'agency_hub_device_live');

    const vm = await store.update({ hubBaseUrl: `${DEFAULT_AGENCY_HUB_BASE_URL}/` });

    expect(vm.hubBaseUrl).toBe(DEFAULT_AGENCY_HUB_BASE_URL);
    expect(vm.hasHubDeviceToken).toBe(true);
    expect(secrets.values.get('hubDeviceToken')).toBe('agency_hub_device_live');
  });

  it('a hub switch clears stream cursors and durable snapshot progress from the old origin', async () => {
    const { store, queries } = createStore();
    queries.set('hubSync.lastEventId', 41);
    queries.set('hubSync.v2Cursor.deadbeef', 'CUR_OLD');
    queries.set('hubSync.snapshotProgress.old-scope', { version: 1 });
    queries.set('unrelated.runtime.row', { keep: true });

    await store.update({ hubBaseUrl: 'http://127.0.0.1:4000' });

    expect(queries.get('hubSync.lastEventId')).toBeUndefined();
    expect(queries.get('hubSync.v2Cursor.deadbeef')).toBeUndefined();
    expect(queries.get('hubSync.snapshotProgress.old-scope')).toBeUndefined();
    expect(queries.get('unrelated.runtime.row')).toEqual({ keep: true });
  });

  it('persists accountPageLabels overrides (round-trip) and rejects bad shapes', async () => {
    const { store, queries, secrets } = createStore();
    const vm = await store.update({ accountPageLabels: { acct_1: 'Lora', acct_2: 'Lexi' } });
    expect(vm.accountPageLabels).toEqual({ acct_1: 'Lora', acct_2: 'Lexi' });

    const reread = createSettingsStore({ queries, secrets });
    expect((await reread.get()).accountPageLabels).toEqual({ acct_1: 'Lora', acct_2: 'Lexi' });

    // Clearing = writing the whole record without the key.
    const cleared = await store.update({ accountPageLabels: {} });
    expect(cleared.accountPageLabels).toEqual({});

    await expect(store.update({ accountPageLabels: { acct_1: 3 } })).rejects.toThrow();
    await expect(store.update({ accountPageLabels: 'Lora' })).rejects.toThrow();
  });

  it('clears the hub key when the patch value is whitespace', async () => {
    const { store } = createStore();
    await store.update({ hubApiKey: 'hub-key' });
    expect((await store.get()).hasHubKey).toBe(true);
    const vm = await store.update({ hubApiKey: '   ' });
    expect(vm.hasHubKey).toBe(false);
  });

  it('falls back to defaults on corrupt or invalid stored rows', async () => {
    const { store, queries } = createStore();
    queries.rows.set('quickMessageCount', 'not-json{');
    queries.rows.set('debugMode', JSON.stringify('yes'));
    queries.rows.set('defaultReplyTone', JSON.stringify('angry'));
    queries.rows.set('hubModeOverride', JSON.stringify('fallback'));
    const vm = await store.get();
    expect(vm.quickMessageCount).toBe(DEFAULT_SETTINGS.quickMessageCount);
    expect(vm.debugMode).toBe(DEFAULT_SETTINGS.debugMode);
    expect(vm.defaultReplyTone).toBe(DEFAULT_SETTINGS.defaultReplyTone);
    expect(vm.hubModeOverride).toBe('auto');
  });

  it('returns fresh default objects (no shared mutable state across reads)', async () => {
    const { store } = createStore();
    const a = await store.get();
    a.featureModels['fast-reply'] = 'mutated';
    const b = await store.get();
    expect(b.featureModels['fast-reply']).toBe(DEFAULT_FEATURE_MODELS['fast-reply']);
  });

  it('updates featureModels and featureReasoning as whole records', async () => {
    const { store } = createStore();
    const vm = await store.update({
      featureReasoning: {
        'fast-reply': 'high',
        'help-me': 'medium',
        'fan-summary': 'max',
        'chat-review': 'low',
        'ping': 'off',
      },
    });
    expect(vm.featureReasoning['fan-summary']).toBe('max');
    expect(vm.featureReasoning['ping']).toBe('off');
  });

  it('serializes an atomic Hub connection read behind credential mutation', async () => {
    const { store, queries, secrets } = createStore();
    seedActiveHubPair(queries, secrets);
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
    const mutation = store.runCredentialMutation(async () => {
      queries.set('hubBaseUrl', 'http://localhost:4000');
      entered();
      await blocked;
      await secrets.setSecret('hubApiKey', 'agency_hub_core_new2');
      queries.set(HUB_API_KEY_BINDING_KEY, {
        version: 1,
        hubBaseUrl: 'http://localhost:4000',
        tokenDigest: deviceTokenDigest('agency_hub_core_new2'),
      });
    });
    await enteredPromise;

    let readSettled = false;
    const connectionRead = store.getHubConnection().then((value) => {
      readSettled = true;
      return value;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(readSettled).toBe(false);

    release();
    await mutation;
    await expect(connectionRead).resolves.toMatchObject({
      hubBaseUrl: 'http://localhost:4000',
      bearer: 'agency_hub_core_new2',
    });
  });

  it('never trusts a stale API-key binding when the secret changes between VM and connection reads', async () => {
    const queries = createFakeQueries();
    const baseSecrets = createFakeSecrets();
    seedActiveHubPair(queries, baseSecrets);
    let apiReads = 0;
    const secrets: FakeSecrets = {
      ...baseSecrets,
      getSecret: (name) => {
        if (name === 'hubApiKey') {
          apiReads += 1;
          return Promise.resolve(apiReads === 1
            ? 'agency_hub_core_old1'
            : 'agency_hub_core_foreign_restore');
        }
        return baseSecrets.getSecret(name);
      },
    };
    const store = createSettingsStore({ queries, secrets });

    await expect(store.getHubConnection()).resolves.toMatchObject({
      bearer: null,
      hubApiKey: null,
    });
    expect(apiReads).toBe(2);
  });

  it('never trusts a stale device binding when the secret changes between VM and connection reads', async () => {
    const queries = createFakeQueries();
    const baseSecrets = createFakeSecrets();
    const token = 'agency_hub_device_bound_original';
    queries.set('hubBaseUrl', DEFAULT_AGENCY_HUB_BASE_URL);
    queries.set(HUB_DEVICE_TOKEN_BINDING_KEY, {
      version: 1,
      hubBaseUrl: DEFAULT_AGENCY_HUB_BASE_URL,
      tokenDigest: deviceTokenDigest(token),
    });
    baseSecrets.values.set('hubDeviceToken', token);
    let deviceReads = 0;
    const secrets: FakeSecrets = {
      ...baseSecrets,
      getSecret: (name) => {
        if (name === 'hubDeviceToken') {
          deviceReads += 1;
          return Promise.resolve(deviceReads === 1
            ? token
            : 'agency_hub_device_foreign_restore');
        }
        return baseSecrets.getSecret(name);
      },
    };
    const store = createSettingsStore({ queries, secrets });

    await expect(store.getHubConnection()).resolves.toMatchObject({
      bearer: null,
      deviceToken: null,
    });
    expect(deviceReads).toBe(2);
  });

  it.each([
    { kind: 'activation' as const, journalKey: HUB_DEVICE_TOKEN_ACTIVATION_KEY, stagedName: 'hubDeviceTokenStaged' as const },
    { kind: 'revocation' as const, journalKey: HUB_DEVICE_TOKEN_REVOCATION_KEY, stagedName: 'hubDeviceTokenRevoking' as const },
  ])('quarantines an active token during $kind and falls back to the chatter key', async ({
    kind, journalKey, stagedName,
  }) => {
    const { store, queries, secrets } = createStore();
    const token = 'agency_hub_pending_device_quarantined';
    const id = kind === 'activation'
      ? '00000000-0000-4000-8000-000000000001'
      : '00000000-0000-4000-8000-000000000002';
    secrets.values.set('hubDeviceToken', token);
    secrets.values.set('hubApiKey', 'agency_hub_core_fallback');
    queries.set(HUB_API_KEY_BINDING_KEY, {
      version: 1,
      hubBaseUrl: DEFAULT_AGENCY_HUB_BASE_URL,
      tokenDigest: deviceTokenDigest('agency_hub_core_fallback'),
    });
    queries.set(HUB_DEVICE_TOKEN_BINDING_KEY, {
      version: 1,
      hubBaseUrl: DEFAULT_AGENCY_HUB_BASE_URL,
      tokenDigest: deviceTokenDigest(token),
    });
    secrets.values.set(stagedName, JSON.stringify({ version: 1, journalId: id, token }));
    queries.set(journalKey, {
      version: 1,
      id,
      hubBaseUrl: DEFAULT_AGENCY_HUB_BASE_URL,
      tokenDigest: deviceTokenDigest(token),
      ...(kind === 'activation' ? {
        reservationId: 7,
        label: 'desktop',
        keyPrefix: 'agency_hub_pending_device_quar',
        reservationExpiresAt: '2026-07-13T17:10:00.000Z',
      } : {}),
    });

    await expect(store.getHubConnection()).resolves.toMatchObject({
      bearer: 'agency_hub_core_fallback',
      deviceToken: null,
      hubApiKey: 'agency_hub_core_fallback',
      deviceTokenTransition: kind,
    });
  });

  it('quarantines device custody when activation recovery has not reconciled it yet', async () => {
    const { store, queries, secrets } = createStore();
    const stagedToken = 'agency_hub_pending_device_staged';
    const id = '00000000-0000-4000-8000-000000000003';
    secrets.values.set('hubDeviceToken', 'agency_hub_device_unrelated');
    secrets.values.set('hubDeviceTokenStaged', JSON.stringify({
      version: 1, journalId: id, token: stagedToken,
    }));
    queries.set(HUB_DEVICE_TOKEN_ACTIVATION_KEY, {
      version: 1,
      id,
      hubBaseUrl: DEFAULT_AGENCY_HUB_BASE_URL,
      tokenDigest: deviceTokenDigest(stagedToken),
      reservationId: 8,
      label: 'desktop',
      keyPrefix: 'agency_hub_pending_device_stag',
      reservationExpiresAt: '2026-07-13T17:10:00.000Z',
    });

    await expect(store.getHubConnection()).resolves.toMatchObject({
      bearer: null,
      deviceToken: null,
      deviceTokenTransition: 'activation',
    });
  });
});

// ─── D19: device identity exposure + quarantined legacy-key decommission ───

const D19_DEVICE_TOKEN = 'agency_hub_pending_device_tok1';

function seedBoundDeviceToken(
  queries: FakeQueries,
  secrets: FakeSecrets,
  hubBaseUrl = DEFAULT_AGENCY_HUB_BASE_URL,
): void {
  queries.set('hubBaseUrl', hubBaseUrl);
  secrets.values.set('hubDeviceToken', D19_DEVICE_TOKEN);
  queries.set(HUB_DEVICE_TOKEN_BINDING_KEY, {
    version: 1,
    hubBaseUrl,
    tokenDigest: deviceTokenDigest(D19_DEVICE_TOKEN),
  });
}

const D19_IDENTITY = {
  version: 1,
  username: 'Maxim',
  label: 'Kevin',
  tokenLast4: 'tok1',
  issuedAt: '2026-07-15T21:42:15.000Z',
  expiresAt: '2026-10-13T21:42:15.000Z',
};

describe('device identity in the settings VM (D19)', () => {
  it('exposes identity and appVersion while device custody exists', async () => {
    const queries = createFakeQueries();
    const secrets = createFakeSecrets();
    const store = createSettingsStore({ queries, secrets, appVersion: '1.2.3' });
    seedBoundDeviceToken(queries, secrets);
    queries.set(HUB_DEVICE_IDENTITY_KEY, D19_IDENTITY);
    const vm = await store.get();
    expect(vm.hubDeviceIdentity).toMatchObject({ username: 'Maxim', label: 'Kevin', tokenLast4: 'tok1' });
    expect(vm.appVersion).toBe('1.2.3');
  });

  it('hides a stale identity once device custody is gone', async () => {
    const { store, queries } = createStore();
    queries.set(HUB_DEVICE_IDENTITY_KEY, D19_IDENTITY);
    const vm = await store.get();
    expect(vm.hubDeviceIdentity).toBeNull();
  });
});

describe('decommissionQuarantinedHubKey (D19)', () => {
  it('deletes an unbound key when the device token is bound', async () => {
    const { store, queries, secrets } = createStore();
    seedBoundDeviceToken(queries, secrets);
    secrets.values.set('hubApiKey', 'agency_hub_core_old1');
    queries.set('keyMeta', { hub: { last4: 'old1', setAt: 1 } });
    await expect(store.decommissionQuarantinedHubKey()).resolves.toBe(true);
    expect(secrets.values.has('hubApiKey')).toBe(false);
    expect(queries.get(HUB_API_KEY_BINDING_KEY)).toBeUndefined();
    expect(queries.get('keyMeta')).toEqual({ hub: null });
    const vm = await store.get();
    expect(vm.hasHubKey).toBe(false);
    expect(vm.hubDeviceTokenBindingState).toBe('bound');
  });

  it('deletes a mismatched key when the device token is bound', async () => {
    const { store, queries, secrets } = createStore();
    seedBoundDeviceToken(queries, secrets);
    secrets.values.set('hubApiKey', 'agency_hub_core_old1');
    queries.set(HUB_API_KEY_BINDING_KEY, {
      version: 1,
      hubBaseUrl: DEFAULT_AGENCY_HUB_BASE_URL,
      tokenDigest: deviceTokenDigest('agency_hub_core_DIFFERENT'),
    });
    await expect(store.decommissionQuarantinedHubKey()).resolves.toBe(true);
    expect(secrets.values.has('hubApiKey')).toBe(false);
  });

  it('leaves an unreadable key alone — a transient read failure is not proof of non-binding', async () => {
    const queries = createFakeQueries();
    const secrets = createFakeSecrets();
    const rawGet = secrets.getSecret.bind(secrets);
    secrets.getSecret = (name) =>
      name === 'hubApiKey' ? Promise.reject(new Error('DPAPI failure')) : rawGet(name);
    secrets.values.set('hubApiKey', 'ciphertext');
    const store = createSettingsStore({ queries, secrets });
    seedBoundDeviceToken(queries, secrets);
    await expect(store.decommissionQuarantinedHubKey()).resolves.toBe(false);
    expect(secrets.values.has('hubApiKey')).toBe(true);
  });

  it('keeps a BOUND key (working fallback until D116(c))', async () => {
    const { store, queries, secrets } = createStore();
    seedBoundDeviceToken(queries, secrets);
    seedActiveHubPair(queries, secrets);
    await expect(store.decommissionQuarantinedHubKey()).resolves.toBe(false);
    expect(secrets.values.get('hubApiKey')).toBe('agency_hub_core_old1');
    expect(queries.get(HUB_API_KEY_BINDING_KEY)).toBeDefined();
  });

  it('does nothing without a bound device token', async () => {
    const { store, queries, secrets } = createStore();
    queries.set('hubBaseUrl', DEFAULT_AGENCY_HUB_BASE_URL);
    secrets.values.set('hubApiKey', 'agency_hub_core_old1');
    await expect(store.decommissionQuarantinedHubKey()).resolves.toBe(false);
    expect(secrets.values.get('hubApiKey')).toBe('agency_hub_core_old1');
  });

  it('does nothing while a VALID transition journal exists', async () => {
    const { store, queries, secrets } = createStore();
    seedBoundDeviceToken(queries, secrets);
    secrets.values.set('hubApiKey', 'agency_hub_core_old1');
    queries.set(HUB_CREDENTIAL_TRANSITION_KEY, {
      version: 2,
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      targetHubBaseUrl: DEFAULT_AGENCY_HUB_BASE_URL,
      targetKeyMeta: { last4: 'new1', setAt: 5 },
      keyAction: 'promote-staged',
      deleteDeadDeviceToken: false,
      clearHubSyncState: false,
      nonSecretPatch: {},
      personaMappingsKey: null,
      sourceKeyDigest: null,
      sourceKeyUnreadable: false,
      targetKeyDigest: deviceTokenDigest('agency_hub_core_new1'),
      rollbackMutations: [],
    });
    await expect(store.decommissionQuarantinedHubKey()).resolves.toBe(false);
    expect(secrets.values.get('hubApiKey')).toBe('agency_hub_core_old1');
    expect(queries.get(HUB_CREDENTIAL_TRANSITION_KEY)).toBeDefined();
  });

  it('fails safe on a corrupt transition journal', async () => {
    const { store, queries, secrets } = createStore();
    seedBoundDeviceToken(queries, secrets);
    secrets.values.set('hubApiKey', 'agency_hub_core_old1');
    queries.set(HUB_CREDENTIAL_TRANSITION_KEY, { corrupt: true });
    await expect(store.decommissionQuarantinedHubKey()).resolves.toBe(false);
    expect(secrets.values.get('hubApiKey')).toBe('agency_hub_core_old1');
  });

  it('is idempotent', async () => {
    const { store, queries, secrets } = createStore();
    seedBoundDeviceToken(queries, secrets);
    secrets.values.set('hubApiKey', 'agency_hub_core_old1');
    await expect(store.decommissionQuarantinedHubKey()).resolves.toBe(true);
    await expect(store.decommissionQuarantinedHubKey()).resolves.toBe(false);
  });
});

describe('backfillHubDeviceIdentity (D19, pre-D19 fleet)', () => {
  it('writes a minimal identity for a bound token with no record', async () => {
    const { store, queries, secrets } = createStore();
    seedBoundDeviceToken(queries, secrets);
    await expect(store.backfillHubDeviceIdentity('Kevin')).resolves.toBe(true);
    expect(queries.get(HUB_DEVICE_IDENTITY_KEY)).toEqual({
      version: 1,
      username: null,
      label: 'Kevin',
      tokenLast4: D19_DEVICE_TOKEN.slice(-4),
      issuedAt: null,
      expiresAt: null,
    });
    const vm = await store.get();
    expect(vm.hubDeviceIdentity).toMatchObject({ username: null, label: 'Kevin' });
  });

  it('never overwrites an existing identity', async () => {
    const { store, queries, secrets } = createStore();
    seedBoundDeviceToken(queries, secrets);
    queries.set(HUB_DEVICE_IDENTITY_KEY, D19_IDENTITY);
    await expect(store.backfillHubDeviceIdentity('other')).resolves.toBe(false);
    expect(queries.get(HUB_DEVICE_IDENTITY_KEY)).toEqual(D19_IDENTITY);
  });

  it('does nothing without a bound device token', async () => {
    const { store, queries } = createStore();
    queries.set('hubBaseUrl', DEFAULT_AGENCY_HUB_BASE_URL);
    await expect(store.backfillHubDeviceIdentity('Kevin')).resolves.toBe(false);
    expect(queries.get(HUB_DEVICE_IDENTITY_KEY)).toBeUndefined();
  });

  it('fails safe during a credential transition', async () => {
    const { store, queries, secrets } = createStore();
    seedBoundDeviceToken(queries, secrets);
    queries.set(HUB_CREDENTIAL_TRANSITION_KEY, { corrupt: true });
    await expect(store.backfillHubDeviceIdentity('Kevin')).resolves.toBe(false);
    expect(queries.get(HUB_DEVICE_IDENTITY_KEY)).toBeUndefined();
  });
});
