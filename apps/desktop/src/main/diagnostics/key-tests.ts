// Orchestrates the Settings "Test" buttons: reads the stored key, runs the
// matching cheap probe, and maps any failure through the CG-* registry so the
// renderer can localize by code. Never returns key material.

import { toUserFacing } from '@chatgoose/shared/errors/index';
import type { KeyTestProvider, KeyTestResultVM } from '../../preload/contract';
import type { SecretName } from '../secrets/keychain';
import type { SettingsStore } from '../settings/store';
import type { OfApiWhoami } from '../ofapi/schemas';
import { createOfApiClient } from '../ofapi/client';
import { probeAnthropicKey, probeOpenRouterKey, type ProbeFetch } from '../ai/providers/key-probe';
import { probeHubConnection } from '../hub/test-connection';

export interface KeyTestDeps {
  keychain: { getSecret(name: SecretName): Promise<string | null> };
  settingsStore: SettingsStore;
  /** GET-fetch seam for the anthropic/openrouter/hub probes (tests). */
  fetchImpl?: ProbeFetch;
  /** OFAPI probe seam; defaults to a throwaway client's /whoami. */
  ofapiProbe?: (apiKey: string) => Promise<OfApiWhoami>;
}

function notConfigured(): KeyTestResultVM {
  return { ok: false, code: 'NOT_CONFIGURED', message: 'No key saved yet.' };
}

async function defaultOfapiProbe(apiKey: string): Promise<OfApiWhoami> {
  // Throwaway client: probes the key exactly as stored, with the client's full
  // CG-OF-* error mapping. /whoami is team-level (no account scope, uncharged).
  const client = createOfApiClient({ apiKey });
  return client.whoami({ purpose: 'hydration' });
}

export async function runKeyTest(
  provider: KeyTestProvider,
  deps: KeyTestDeps,
): Promise<KeyTestResultVM> {
  try {
    switch (provider) {
      case 'ofapi': {
        const key = await deps.keychain.getSecret('ofapiKey');
        if (key === null || key.length === 0) return notConfigured();
        const who = await (deps.ofapiProbe ?? defaultOfapiProbe)(key);
        return { ok: true, code: null, message: '', team: who.team?.name ?? null };
      }
      case 'anthropic': {
        const key = await deps.keychain.getSecret('anthropicKey');
        if (key === null || key.length === 0) return notConfigured();
        await probeAnthropicKey(key, deps.fetchImpl ?? fetch);
        return { ok: true, code: null, message: '' };
      }
      case 'openrouter': {
        const key = await deps.keychain.getSecret('openRouterKey');
        if (key === null || key.length === 0) return notConfigured();
        await probeOpenRouterKey(key, deps.fetchImpl ?? fetch);
        return { ok: true, code: null, message: '' };
      }
      case 'hub': {
        const [vm, key] = await Promise.all([
          deps.settingsStore.get(),
          deps.keychain.getSecret('hubApiKey'),
        ]);
        if (vm.hubBaseUrl === null || key === null || key.length === 0) {
          return { ok: false, code: 'HUB_NOT_CONFIGURED', message: 'Hub base URL or chatter key missing.' };
        }
        const me = await probeHubConnection(vm.hubBaseUrl, key, deps.fetchImpl ?? fetch);
        return {
          ok: true,
          code: null,
          message: '',
          username: me.username,
          role: me.role,
          pages: me.pages,
        };
      }
    }
  } catch (error) {
    const facing = toUserFacing(error);
    return { ok: false, code: facing.code, message: facing.message };
  }
}
