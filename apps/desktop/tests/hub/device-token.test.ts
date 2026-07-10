// Stage 24: one-time device-token issuance + credential fallback. The main
// process has no cookie jar — the login session cookie is captured off the
// raw response and carried explicitly on the issue/logout calls.

import { describe, expect, it, vi } from 'vitest';
import {
  effectiveHubBearerAfterPatch,
  issueHubDeviceToken,
  probeRetryKeyAfterAuthFailure,
  resolveHubCredential,
} from '../../src/main/hub/device-token';

const ISSUED = {
  token: 'agency_hub_device_secret123',
  id: 5,
  label: 'test-machine',
  keyPrefix: 'agency_hub_device_secr',
  expiresAt: '2026-10-04T00:00:00.000Z',
};

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('issueHubDeviceToken', () => {
  it('logs in, issues the token with the session cookie, stores it, and logs out', async () => {
    const calls: Array<{ url: string; cookie: string | null; body: string | null }> = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url, cookie: headers.cookie ?? null, body: (init?.body as string | undefined) ?? null });
      if (url.endsWith('/api/v1/auth/login')) {
        return jsonResponse(200, { authMethod: 'session', user: { username: 'anton' } }, {
          'set-cookie': 'agency_hub_session=tok123; Path=/; HttpOnly',
        });
      }
      if (url.endsWith('/api/v1/auth/device-tokens')) {
        return jsonResponse(200, ISSUED);
      }
      if (url.endsWith('/api/v1/auth/logout')) {
        return jsonResponse(200, { ok: true });
      }
      throw new Error(`unexpected url ${url}`);
    });
    const stored: Array<{ name: string; value: string }> = [];
    const keychain = { setSecret: async (name: string, value: string) => void stored.push({ name, value }) };

    const result = await issueHubDeviceToken({
      baseUrl: 'https://hub.test/',
      username: ' anton ',
      password: 'pw',
      label: 'test-machine',
      keychain: keychain as never,
      fetchImpl: fetchImpl as never,
    });

    expect(result).toEqual({ keyPrefix: ISSUED.keyPrefix, label: 'test-machine', expiresAt: ISSUED.expiresAt });
    expect(stored).toEqual([{ name: 'hubDeviceToken', value: ISSUED.token }]);
    expect(calls[0]!.url).toBe('https://hub.test/api/v1/auth/login');
    expect(JSON.parse(calls[0]!.body!)).toEqual({ username: 'anton', password: 'pw' });
    expect(calls[1]!.url).toBe('https://hub.test/api/v1/auth/device-tokens');
    expect(calls[1]!.cookie).toBe('agency_hub_session=tok123');
    expect(calls[2]!.url).toBe('https://hub.test/api/v1/auth/logout');
    expect(calls[2]!.cookie).toBe('agency_hub_session=tok123');
  });

  it('stamps x-client-version on the sign-in POST and the SDK static-headers seam (Stage 4 / Proposal 4.1 / N5)', async () => {
    const calls: Array<{ url: string; xClientVersion: string | null }> = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url, xClientVersion: headers['x-client-version'] ?? null });
      if (url.endsWith('/api/v1/auth/login')) {
        return jsonResponse(200, { authMethod: 'session', user: { username: 'anton' } }, {
          'set-cookie': 'agency_hub_session=tok123; Path=/; HttpOnly',
        });
      }
      if (url.endsWith('/api/v1/auth/device-tokens')) {
        return jsonResponse(200, ISSUED);
      }
      if (url.endsWith('/api/v1/auth/logout')) {
        return jsonResponse(200, { ok: true });
      }
      throw new Error(`unexpected url ${url}`);
    });

    await issueHubDeviceToken({
      baseUrl: 'https://hub.test',
      username: 'anton',
      password: 'pw',
      label: 'test-machine',
      keychain: { setSecret: async () => undefined } as never,
      fetchImpl: fetchImpl as never,
      clientVersion: '0.1.29',
    });

    expect(calls[0]!.url).toBe('https://hub.test/api/v1/auth/login');
    expect(calls[0]!.xClientVersion).toBe('0.1.29'); // raw sign-in fetch (N5)
    expect(calls[1]!.url).toBe('https://hub.test/api/v1/auth/device-tokens');
    expect(calls[1]!.xClientVersion).toBe('0.1.29'); // SDK static-headers seam
    expect(calls[2]!.url).toBe('https://hub.test/api/v1/auth/logout');
    expect(calls[2]!.xClientVersion).toBe('0.1.29');
  });

  it('maps bad credentials to a clear error and stores nothing', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401, { error: 'unauthorized' }));
    const setSecret = vi.fn();

    await expect(issueHubDeviceToken({
      baseUrl: 'https://hub.test',
      username: 'anton',
      password: 'wrong',
      label: 'm',
      keychain: { setSecret } as never,
      fetchImpl: fetchImpl as never,
    })).rejects.toThrow(/Invalid username or password/);
    expect(setSecret).not.toHaveBeenCalled();
  });

  it('fails loudly when login returns no session cookie', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { ok: true }));
    await expect(issueHubDeviceToken({
      baseUrl: 'https://hub.test',
      username: 'anton',
      password: 'pw',
      label: 'm',
      keychain: { setSecret: vi.fn() } as never,
      fetchImpl: fetchImpl as never,
    })).rejects.toThrow(/no session cookie/);
  });
});

describe('resolveHubCredential', () => {
  function keychainWith(secrets: Record<string, string | null>) {
    return { getSecret: async (name: string) => secrets[name] ?? null } as never;
  }

  it('prefers the device token, falls back to the chatter key, and reports absence', async () => {
    await expect(resolveHubCredential(keychainWith({
      hubDeviceToken: 'agency_hub_device_x',
      hubApiKey: 'agency_hub_core_y',
    }))).resolves.toBe('agency_hub_device_x');

    await expect(resolveHubCredential(keychainWith({
      hubDeviceToken: null,
      hubApiKey: 'agency_hub_core_y',
    }))).resolves.toBe('agency_hub_core_y');

    await expect(resolveHubCredential(keychainWith({
      hubDeviceToken: '  ',
      hubApiKey: 'agency_hub_core_y',
    }))).resolves.toBe('agency_hub_core_y');

    await expect(resolveHubCredential(keychainWith({}))).resolves.toBeNull();
  });
});

// 4a: the pre-persist validation probe (index.ts) must test EXACTLY the bearer
// that settingsStore.update(patch) would leave active — this mirrors store.ts
// update()'s device-token/chatter-key wipe rules so a good save is never
// falsely rejected and a bad one never slips through.
describe('effectiveHubBearerAfterPatch', () => {
  it('returns the new chatter key when no device token is present (the common save)', () => {
    expect(
      effectiveHubBearerAfterPatch({
        patchHubApiKey: 'agency_hub_core_new',
        patchHubBaseUrl: undefined,
        currentHubBaseUrl: 'https://gosling-agency.ru',
        currentDeviceToken: null,
        currentHubApiKey: null,
      }),
    ).toBe('agency_hub_core_new');
  });

  it('keeps the device token when a chatter key is patched without a hub switch (token shadows)', () => {
    // resolveHubCredential prefers the device token unconditionally; a chatter
    // key write that does not switch hubs leaves it in place, so THAT is what
    // will actually authenticate — validate it, not the shadowed new key.
    expect(
      effectiveHubBearerAfterPatch({
        patchHubApiKey: 'agency_hub_core_new',
        patchHubBaseUrl: undefined,
        currentHubBaseUrl: 'https://gosling-agency.ru',
        currentDeviceToken: 'agency_hub_device_live',
        currentHubApiKey: 'agency_hub_core_old',
      }),
    ).toBe('agency_hub_device_live');
  });

  it('drops the device token on a hub switch and uses the same-patch replacement key', () => {
    expect(
      effectiveHubBearerAfterPatch({
        patchHubApiKey: 'agency_hub_core_forNewHub',
        patchHubBaseUrl: 'http://localhost:4000',
        currentHubBaseUrl: 'https://gosling-agency.ru',
        currentDeviceToken: 'agency_hub_device_live',
        currentHubApiKey: 'agency_hub_core_old',
      }),
    ).toBe('agency_hub_core_forNewHub');
  });

  it('returns null on a hub switch with no replacement key (both credentials wiped)', () => {
    expect(
      effectiveHubBearerAfterPatch({
        patchHubApiKey: undefined,
        patchHubBaseUrl: 'http://localhost:4000',
        currentHubBaseUrl: 'https://gosling-agency.ru',
        currentDeviceToken: 'agency_hub_device_live',
        currentHubApiKey: 'agency_hub_core_old',
      }),
    ).toBeNull();
  });

  it('treats an empty/whitespace patched key as a clear (null)', () => {
    expect(
      effectiveHubBearerAfterPatch({
        patchHubApiKey: '   ',
        patchHubBaseUrl: undefined,
        currentHubBaseUrl: 'https://gosling-agency.ru',
        currentDeviceToken: null,
        currentHubApiKey: 'agency_hub_core_old',
      }),
    ).toBeNull();
  });

  it('preserves the current chatter key when the patch does not touch credentials', () => {
    expect(
      effectiveHubBearerAfterPatch({
        patchHubApiKey: undefined,
        patchHubBaseUrl: undefined,
        currentHubBaseUrl: 'https://gosling-agency.ru',
        currentDeviceToken: null,
        currentHubApiKey: 'agency_hub_core_old',
      }),
    ).toBe('agency_hub_core_old');
  });
});

// I116-2 (W4.1): the paste-a-key recovery on a dead device token — the probe
// fallback matrix. The retry key is returned ONLY for the exact silent-failure
// shape: stored token was the probed bearer, it failed AUTH, and the patch
// carries a different non-empty key.
describe('probeRetryKeyAfterAuthFailure', () => {
  const base = {
    usedCredential: 'agency_hub_device_dead',
    currentDeviceToken: 'agency_hub_device_dead',
    patchHubApiKey: 'agency_hub_core_fresh',
    hubSwitched: false,
    authFailure: true,
  };

  it('returns the pasted key when the stored token shadowed it and failed auth', () => {
    expect(probeRetryKeyAfterAuthFailure(base)).toBe('agency_hub_core_fresh');
  });

  it('trims the pasted key', () => {
    expect(probeRetryKeyAfterAuthFailure({ ...base, patchHubApiKey: '  agency_hub_core_fresh  ' })).toBe(
      'agency_hub_core_fresh',
    );
  });

  it('does not retry on non-auth probe failures (network, 5xx)', () => {
    expect(probeRetryKeyAfterAuthFailure({ ...base, authFailure: false })).toBeNull();
  });

  it('does not retry on a hub switch (the pasted key was already the probed bearer)', () => {
    expect(probeRetryKeyAfterAuthFailure({ ...base, hubSwitched: true })).toBeNull();
  });

  it('does not retry when no device token exists (the pasted key itself was rejected)', () => {
    expect(
      probeRetryKeyAfterAuthFailure({
        ...base,
        currentDeviceToken: null,
        usedCredential: 'agency_hub_core_fresh',
      }),
    ).toBeNull();
  });

  it('does not retry when the probe already used the pasted key', () => {
    expect(
      probeRetryKeyAfterAuthFailure({
        ...base,
        usedCredential: 'agency_hub_core_fresh',
      }),
    ).toBeNull();
  });

  it('does not retry when the patch carries no key or an empty key', () => {
    expect(probeRetryKeyAfterAuthFailure({ ...base, patchHubApiKey: undefined })).toBeNull();
    expect(probeRetryKeyAfterAuthFailure({ ...base, patchHubApiKey: '   ' })).toBeNull();
  });
});
