// Orchestrates the Settings "Test" button: reads the stored hub key, probes
// the hub identity endpoint, and maps any failure through the CG-* registry
// so the renderer can localize by code. Never returns key material.
//
// Stage 31: the anthropic/openrouter probes died with the direct provider
// lane — 'hub' is the only provider left (KeyTestProvider is now a literal).

import { toUserFacing } from '@chatgoose/shared/errors/index';
import type { KeyTestProvider, KeyTestResultVM } from '../../preload/contract';
import type { SecretName } from '../secrets/keychain';
import type { SettingsStore } from '../settings/store';
import { probeHubConnection, type HubProbeFetch } from '../hub/test-connection';

export interface KeyTestDeps {
  keychain: { getSecret(name: SecretName): Promise<string | null> };
  settingsStore: SettingsStore;
  /** GET-fetch seam for the hub probe (tests). */
  fetchImpl?: HubProbeFetch;
}

export async function runKeyTest(
  _provider: KeyTestProvider, // 'hub' — kept so the IPC shape stays stable
  deps: KeyTestDeps,
): Promise<KeyTestResultVM> {
  try {
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
  } catch (error) {
    const facing = toUserFacing(error);
    return { ok: false, code: facing.code, message: facing.message };
  }
}
