// Stage 24: one-time device-token issuance (kernel Stage 22 adoption). The
// chatter signs in once with username+password; the desktop trades the
// session for a device-bound bearer (`agency_hub_device_…`, sliding 90 d)
// stored in the keychain. The legacy chatter key stays accepted as fallback
// (kernel dual-acceptance) — its retirement is a later, kernel-declared step.
//
// The Electron main process has no cookie jar, so the session cookie from
// login is captured off the raw response and carried explicitly through the
// SDK client's static-headers seam for the issue + logout calls.

import { createClient } from '@kernel/sdk';
import type { Keychain } from '../secrets/keychain';

export interface HubDeviceTokenResult {
  keyPrefix: string;
  label: string;
  expiresAt: string;
}

export interface IssueHubDeviceTokenInput {
  baseUrl: string;
  username: string;
  password: string;
  /** Shown in the owner's device-token admin list (machine name). */
  label: string;
  keychain: Pick<Keychain, 'setSecret'>;
  fetchImpl?: typeof fetch;
  /**
   * Stage 4 / Proposal 4.1 (N5): stamped as `x-client-version` on the sign-in
   * POST and carried through the SDK's static-headers seam for the issue/
   * logout calls — without it, a machine mid-onboarding is invisible to the
   * fleet-adoption release gate.
   */
  clientVersion?: string;
}

export async function issueHubDeviceToken(input: IssueHubDeviceTokenInput): Promise<HubDeviceTokenResult> {
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, '');
  const fetchImpl = input.fetchImpl ?? fetch;
  const clientVersion = input.clientVersion?.trim();
  const versionHeaders: Record<string, string> =
    clientVersion !== undefined && clientVersion.length > 0
      ? { 'x-client-version': clientVersion }
      : {};

  const login = await fetchImpl(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...versionHeaders },
    body: JSON.stringify({ username: input.username.trim(), password: input.password }),
  });
  if (login.status === 401 || login.status === 403) {
    throw new Error('Invalid username or password.');
  }
  if (!login.ok) {
    throw new Error(`Hub login failed (${login.status}).`);
  }
  const setCookie = login.headers.get('set-cookie');
  const sessionCookie = setCookie?.split(';')[0] ?? null;
  if (!sessionCookie) {
    throw new Error('Hub login returned no session cookie.');
  }

  const client = createClient({
    baseUrl,
    headers: { cookie: sessionCookie, ...versionHeaders },
    ...(input.fetchImpl !== undefined ? { fetch: input.fetchImpl } : {}),
  });
  try {
    const issued = await client.authIssueDeviceToken({ body: { label: input.label } });
    await input.keychain.setSecret('hubDeviceToken', issued.token);
    return { keyPrefix: issued.keyPrefix, label: issued.label, expiresAt: issued.expiresAt };
  } finally {
    // One-time session: best-effort hygiene, never fails the issuance.
    await client.logout().catch(() => undefined);
  }
}

/**
 * The hub bearer credential: device token when present, legacy chatter key
 * otherwise (kernel dual-acceptance holds through the rollout window).
 */
export async function resolveHubCredential(
  keychain: Pick<Keychain, 'getSecret'>,
): Promise<string | null> {
  const deviceToken = await keychain.getSecret('hubDeviceToken');
  if (deviceToken !== null && deviceToken.trim().length > 0) {
    return deviceToken;
  }
  return keychain.getSecret('hubApiKey');
}
