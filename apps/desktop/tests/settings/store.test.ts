import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FEATURE_MODELS,
  DEFAULT_FEATURE_REASONING,
  DEFAULT_AGENCY_HUB_BASE_URL,
  DEFAULT_SETTINGS,
} from '@chatgoose/shared';
import { createSettingsStore } from '@main/settings/store';
import type { SecretStoreLike, SettingsQueries } from '@main/settings/store';
import type { SecretName } from '@main/secrets/keychain';

// Mirrors the db module's SettingsQueries: rows hold JSON text, get() parses
// (and therefore throws on corrupt rows), set() serializes.
interface FakeQueries extends SettingsQueries {
  rows: Map<string, string>;
}

function createFakeQueries(): FakeQueries {
  const rows = new Map<string, string>();
  return {
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
    all: () => {
      const out: Record<string, unknown> = {};
      for (const [key, raw] of rows) {
        out[key] = JSON.parse(raw);
      }
      return out;
    },
  };
}

interface FakeSecrets extends SecretStoreLike {
  values: Map<SecretName, string>;
}

function createFakeSecrets(): FakeSecrets {
  const values = new Map<SecretName, string>();
  return {
    values,
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

    // last4 is the only key-derived material allowed in the table.
    const tableDump = JSON.stringify([...queries.rows.entries()]);
    expect(tableDump).not.toContain('agency_hub_core_a4f2');
    expect(tableDump).toContain('a4f2');

    const cleared = await store.update({ hubApiKey: '' });
    expect(cleared.keyMeta.hub).toBeNull();
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

    const tableDump = JSON.stringify([...queries.rows.entries()]);
    expect(tableDump).not.toContain('agency_hub_core_secret9');

    // VM never carries key material
    const vmDump = JSON.stringify(vm);
    expect(vmDump).not.toContain('agency_hub_core_secret9');
    expect(Object.keys(vm)).not.toContain('hubApiKey');
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

  it('clears the device token too when the Hub host changes without a replacement key', async () => {
    // Stage 24 dual-acceptance: a hub switch must invalidate BOTH credential
    // paths, not just the legacy chatter key — otherwise the device token
    // silently keeps authenticating against the OLD hub while Settings shows
    // the new URL.
    const { store, secrets } = createStore();
    await store.update({
      hubBaseUrl: DEFAULT_AGENCY_HUB_BASE_URL,
      hubApiKey: 'agency_hub_core_secret',
    });
    await secrets.setSecret('hubDeviceToken', 'agency_hub_device_secret');
    expect((await store.get()).hasHubDeviceToken).toBe(true);

    const vm = await store.update({ hubBaseUrl: 'http://127.0.0.1:4000' });
    expect(vm.hubBaseUrl).toBe('http://127.0.0.1:4000');
    expect(vm.hasHubKey).toBe(false);
    expect(vm.hasHubDeviceToken).toBe(false);
    expect(secrets.values.has('hubApiKey')).toBe(false);
    expect(secrets.values.has('hubDeviceToken')).toBe(false);
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

  it('a hub switch WITH a replacement key still clears the device token', async () => {
    // resolveHubCredential prefers the device token unconditionally, so if the
    // old hub's token survived this combined save (new URL + fresh key in ONE
    // patch — exactly what HubSettings save() sends), it would keep shadowing
    // the fresh key against the new hub.
    const { store, secrets } = createStore();
    await store.update({
      hubBaseUrl: DEFAULT_AGENCY_HUB_BASE_URL,
      hubApiKey: 'agency_hub_core_old',
    });
    await secrets.setSecret('hubDeviceToken', 'agency_hub_device_old');
    expect((await store.get()).hasHubDeviceToken).toBe(true);

    const vm = await store.update({
      hubBaseUrl: 'http://127.0.0.1:4000',
      hubApiKey: 'agency_hub_core_new',
    });
    expect(vm.hasHubKey).toBe(true);
    expect(secrets.values.get('hubApiKey')).toBe('agency_hub_core_new');
    expect(vm.hasHubDeviceToken).toBe(false);
    expect(secrets.values.has('hubDeviceToken')).toBe(false);
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
});
