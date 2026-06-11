import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FEATURE_MODELS,
  DEFAULT_FEATURE_REASONING,
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
    expect(vm.creditBudgetPerShift).toBeNull();
    expect(vm.accountMappings).toEqual({});
    expect(vm.hasOfapiKey).toBe(false);
    expect(vm.hasAnthropicKey).toBe(false);
    expect(vm.hasOpenRouterKey).toBe(false);
  });

  it('applies and persists a patch (visible to a fresh store instance)', async () => {
    const { store, queries, secrets } = createStore();
    const vm = await store.update({
      quickMessageCount: 50,
      debugMode: true,
      defaultReplyTone: 'flirty',
      accountMappings: { acct_1: 'personality-a' },
      creditBudgetPerShift: 1500,
    });
    expect(vm.quickMessageCount).toBe(50);
    expect(vm.debugMode).toBe(true);
    expect(vm.defaultReplyTone).toBe('flirty');
    expect(vm.accountMappings).toEqual({ acct_1: 'personality-a' });
    expect(vm.creditBudgetPerShift).toBe(1500);
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
    await expect(store.update({ nonsense: 1 })).rejects.toThrow(); // unknown key
    await expect(store.update('not-an-object')).rejects.toThrow();
    // partial feature record is rejected (enum-keyed records are exhaustive)
    await expect(store.update({ featureModels: { 'fast-reply': 'x' } })).rejects.toThrow();
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
    const vm = await store.update({ ofapiKey: 'sk-ofapi-secret', anthropicKey: 'sk-ant-secret' });
    expect(vm.hasOfapiKey).toBe(true);
    expect(vm.hasAnthropicKey).toBe(true);
    expect(vm.hasOpenRouterKey).toBe(false);

    const tableDump = JSON.stringify([...queries.rows.entries()]);
    expect(tableDump).not.toContain('sk-ofapi-secret');
    expect(tableDump).not.toContain('sk-ant-secret');

    // VM never carries key material
    const vmDump = JSON.stringify(vm);
    expect(vmDump).not.toContain('sk-ofapi-secret');
    expect(vmDump).not.toContain('sk-ant-secret');
    expect(Object.keys(vm)).not.toContain('ofapiKey');
  });

  it('clears a key when the patch value is empty/whitespace', async () => {
    const { store } = createStore();
    await store.update({ openRouterKey: 'or-key' });
    expect((await store.get()).hasOpenRouterKey).toBe(true);
    const vm = await store.update({ openRouterKey: '   ' });
    expect(vm.hasOpenRouterKey).toBe(false);
  });

  it('trims key material before storing', async () => {
    const { store, secrets } = createStore();
    await store.update({ ofapiKey: '  sk-padded  ' });
    expect(secrets.values.get('ofapiKey')).toBe('sk-padded');
  });

  it('routes the hub chatter key to the keychain and persists hubBaseUrl (round-trip)', async () => {
    const { store, queries, secrets } = createStore();
    const vm = await store.update({
      hubBaseUrl: 'https://hub.example.com',
      hubApiKey: 'agency_hub_core_secret',
    });
    expect(vm.hubBaseUrl).toBe('https://hub.example.com');
    expect(vm.hasHubKey).toBe(true);
    expect(secrets.values.get('hubApiKey')).toBe('agency_hub_core_secret');

    // key material never lands in the settings table or the VM
    const tableDump = JSON.stringify([...queries.rows.entries()]);
    expect(tableDump).not.toContain('agency_hub_core_secret');
    expect(JSON.stringify(vm)).not.toContain('agency_hub_core_secret');
    expect(Object.keys(vm)).not.toContain('hubApiKey');

    const reread = createSettingsStore({ queries, secrets });
    const again = await reread.get();
    expect(again.hubBaseUrl).toBe('https://hub.example.com');
    expect(again.hasHubKey).toBe(true);
  });

  it('hubBaseUrl defaults to null, clears to null, and rejects the empty string', async () => {
    const { store } = createStore();
    const initial = await store.get();
    expect(initial.hubBaseUrl).toBeNull();
    expect(initial.hasHubKey).toBe(false);

    await store.update({ hubBaseUrl: 'https://hub.example.com' });
    const cleared = await store.update({ hubBaseUrl: null });
    expect(cleared.hubBaseUrl).toBeNull();
    await expect(store.update({ hubBaseUrl: '' })).rejects.toThrow();
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
    const vm = await store.get();
    expect(vm.quickMessageCount).toBe(DEFAULT_SETTINGS.quickMessageCount);
    expect(vm.debugMode).toBe(DEFAULT_SETTINGS.debugMode);
    expect(vm.defaultReplyTone).toBe(DEFAULT_SETTINGS.defaultReplyTone);
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
