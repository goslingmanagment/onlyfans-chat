// Orchestrates the Settings "Test connection" button: resolves the ACTUAL hub
// bearer (D35: the bound device credential of this machine), probes the hub
// identity endpoint, and maps any failure through the CG-* registry so the
// renderer can localize by code. Never returns credential material.
//
// D35 §9 п.4: the probe is the third hub transport, so an auth rejection here
// reports into the same self-healing funnel as the other two — a chatter who
// presses "Test connection" on a revoked sign-in is told to sign in again
// instead of being left with a red line.
//
// Stage 31: the anthropic/openrouter probes died with the direct provider
// lane — 'hub' is the only provider left (KeyTestProvider is now a literal).

import { toUserFacing } from '@chatgoose/shared/errors/index';
import type { KeyTestProvider, KeyTestResultVM } from '../../preload/contract';
import type { SettingsStore } from '../settings/store';
import { probeHubConnection, type HubProbeFetch } from '../hub/test-connection';
import { deviceTokenDigest } from '../hub/credential-journal';

export interface KeyTestDeps {
  settingsStore: Pick<SettingsStore, 'getHubConnection'>;
  /** D35: main's one self-healing funnel, bound to the bearer that was used. */
  onAuthFailure?: (error: unknown, bearerDigest: string) => void;
  /** GET-fetch seam for the hub probe (tests). */
  fetchImpl?: HubProbeFetch;
  /** Stage 4 / Proposal 4.1: stamped on the probe as `x-client-version`. */
  clientVersion?: string;
}

export async function runKeyTest(
  _provider: KeyTestProvider, // 'hub' — kept so the IPC shape stays stable
  deps: KeyTestDeps,
): Promise<KeyTestResultVM> {
  let bearer: string | null = null;
  try {
    const connection = await deps.settingsStore.getHubConnection();
    if (
      connection.hubBaseUrl === null
      || connection.bearer === null
      || connection.bearer.length === 0
    ) {
      return { ok: false, code: 'HUB_NOT_CONFIGURED', message: 'Hub base URL or credential missing — sign in with the device.' };
    }
    bearer = connection.bearer;
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
    if (bearer !== null) {
      try {
        deps.onAuthFailure?.(error, deviceTokenDigest(bearer));
      } catch {
        // Reporting must never replace the probe's own result.
      }
    }
    const facing = toUserFacing(error);
    return { ok: false, code: facing.code, message: facing.message };
  }
}
