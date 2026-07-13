// Orchestrates the Settings "Test" button: resolves the ACTUAL hub bearer
// (device token preferred, legacy chatter key fallback — the same
// resolveHubCredential every runtime hub call uses), probes the hub identity
// endpoint, and maps any failure through the CG-* registry so the renderer
// can localize by code. Never returns key material.
//
// Stage 31: the anthropic/openrouter probes died with the direct provider
// lane — 'hub' is the only provider left (KeyTestProvider is now a literal).

import { toUserFacing } from '@chatgoose/shared/errors/index';
import type { KeyTestProvider, KeyTestResultVM } from '../../preload/contract';
import type { SettingsStore } from '../settings/store';
import { probeHubConnection, type HubProbeFetch } from '../hub/test-connection';

export interface KeyTestDeps {
  settingsStore: Pick<SettingsStore, 'getHubConnection'>;
  /** GET-fetch seam for the hub probe (tests). */
  fetchImpl?: HubProbeFetch;
  /** Stage 4 / Proposal 4.1: stamped on the probe as `x-client-version`. */
  clientVersion?: string;
}

export async function runKeyTest(
  _provider: KeyTestProvider, // 'hub' — kept so the IPC shape stays stable
  deps: KeyTestDeps,
): Promise<KeyTestResultVM> {
  try {
    const connection = await deps.settingsStore.getHubConnection();
    if (
      connection.hubBaseUrl === null
      || connection.bearer === null
      || connection.bearer.length === 0
    ) {
      return { ok: false, code: 'HUB_NOT_CONFIGURED', message: 'Hub base URL or credential missing — sign in or paste a chatter key.' };
    }
    const me = await probeHubConnection(
      connection.hubBaseUrl,
      connection.bearer,
      deps.fetchImpl ?? fetch,
      deps.clientVersion,
    );
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
