// Stage 24 device-token issuance, reworked by D35: ONE public password call
// (`authIssueDeviceTokenWithPassword`, mode `pending`) replaces the
// login → set-cookie → reserve → logout ceremony. Everything downstream of the
// reservation — staging, journal, activation, recovery — is unchanged, so the
// whole matrix below moves through this one fixture.

import { describe, expect, it, vi } from 'vitest';
import {
  abandonHubDeviceTokenCustody,
  beginHubDeviceTokenRevocation,
  HUB_DEVICE_TOKEN_REQUEST_TIMEOUT_MS,
  issueHubDeviceToken,
  recoverHubDeviceTokenLifecycle,
  requestHubDeviceTokenActivationCancellation,
  revokeHubDeviceToken,
} from '../../src/main/hub/device-token';
import {
  HUB_DEVICE_TOKEN_BINDING_KEY,
  HUB_DEVICE_TOKEN_ACTIVATION_KEY,
  HUB_DEVICE_TOKEN_REVOCATION_KEY,
  deviceTokenDigest,
  readHubDeviceIdentity,
} from '../../src/main/hub/credential-journal';
import { createRuntimeMutationQueue } from '../../src/main/runtime-activation';

const PENDING = {
  token: 'agency_hub_pending_device_secret123',
  reservationId: 5,
  label: 'test-machine',
  keyPrefix: 'agency_hub_pending_device_secr',
  reservationExpiresAt: '2026-07-13T10:10:00.000Z',
};

const ACTIVATED = {
  id: PENDING.reservationId,
  label: PENDING.label,
  keyPrefix: PENDING.keyPrefix,
  expiresAt: '2026-10-04T00:00:00.000Z',
};

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function lifecycleStorage(initialSecrets: Record<string, string> = {}) {
  const secrets = new Map(Object.entries(initialSecrets));
  const journals = new Map<string, unknown>();
  const initialDeviceToken = initialSecrets['hubDeviceToken'];
  if (initialDeviceToken !== undefined) {
    journals.set(HUB_DEVICE_TOKEN_BINDING_KEY, {
      version: 1,
      hubBaseUrl: 'https://hub.test',
      tokenDigest: deviceTokenDigest(initialDeviceToken),
    });
  }
  const keychain = {
    getSecret: vi.fn(async (name: string) => secrets.get(name) ?? null),
    setSecret: vi.fn(async (name: string, value: string) => {
      secrets.set(name, value);
    }),
    deleteSecret: vi.fn(async (name: string) => {
      secrets.delete(name);
    }),
  };
  const settings = {
    get: vi.fn((key: string) => journals.get(key)),
    set: vi.fn((key: string, value: unknown) => {
      journals.set(key, value);
    }),
    remove: vi.fn((key: string) => {
      journals.delete(key);
    }),
    batch: vi.fn((mutations: readonly (
      | { kind: 'set'; key: string; value: unknown }
      | { kind: 'remove'; key: string }
    )[]) => {
      const before = new Map(journals);
      try {
        for (const mutation of mutations) {
          if (mutation.kind === 'set') journals.set(mutation.key, mutation.value);
          else journals.delete(mutation.key);
        }
      } catch (error) {
        journals.clear();
        for (const [key, value] of before) journals.set(key, value);
        throw error;
      }
    }),
  };
  return { secrets, journals, keychain, settings };
}

function requestHeaders(input: string | URL | Request, init?: RequestInit): Headers {
  return new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
}

function successfulLifecycleFetch(
  onActivate?: (state: { authorization: string | null }) => void,
) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/api/v1/auth/device-tokens/password')) {
      return jsonResponse(200, { ...PENDING, mode: 'pending' });
    }
    if (url.endsWith('/api/v1/auth/device-tokens/activate')) {
      onActivate?.({ authorization: requestHeaders(input, init).get('authorization') });
      return jsonResponse(200, ACTIVATED);
    }
    throw new Error(`unexpected url ${url}`);
  });
}

describe('issueHubDeviceToken', () => {
  it('stages encrypted custody and a non-secret journal before activation, then promotes', async () => {
    const storage = lifecycleStorage();
    const calls: string[] = [];
    const fetchImpl = successfulLifecycleFetch(({ authorization }) => {
      calls.push('activate');
      expect(authorization).toBe(`Bearer ${PENDING.token}`);
      expect(storage.secrets.has('hubDeviceToken')).toBe(false);
      expect(storage.secrets.has('hubDeviceTokenStaged')).toBe(true);
      expect(storage.journals.has(HUB_DEVICE_TOKEN_ACTIVATION_KEY)).toBe(true);
      expect(JSON.stringify([...storage.journals.entries()])).not.toContain(PENDING.token);
    });

    const result = await issueHubDeviceToken({
      baseUrl: 'https://hub.test/',
      username: ' anton ',
      password: 'pw',
      label: 'test-machine',
      keychain: storage.keychain,
      settings: storage.settings,
      fetchImpl,
    });

    expect(result).toEqual({ keyPrefix: ACTIVATED.keyPrefix, label: 'test-machine', expiresAt: ACTIVATED.expiresAt });
    expect(calls).toEqual(['activate']);
    expect(storage.secrets.get('hubDeviceToken')).toBe(PENDING.token);
    expect(storage.secrets.has('hubDeviceTokenStaged')).toBe(false);
    expect(storage.journals.has(HUB_DEVICE_TOKEN_ACTIVATION_KEY)).toBe(false);
    expect(storage.journals.get(HUB_DEVICE_TOKEN_BINDING_KEY)).toEqual({
      version: 1,
      hubBaseUrl: 'https://hub.test',
      tokenDigest: deviceTokenDigest(PENDING.token),
    });
    // D35: the identity is no longer display-only — it stamps the grant cache
    // (grant-owner.ts), so an activation that forgot to write it would let the
    // next person inherit this one's workspace.
    expect(readHubDeviceIdentity(storage.settings)).toEqual({
      version: 1,
      username: 'anton',
      label: 'test-machine',
      tokenLast4: PENDING.token.slice(-4),
      issuedAt: expect.any(String),
      expiresAt: ACTIVATED.expiresAt,
    });
  });

  it('stamps x-client-version on the password sign-in and the activation', async () => {
    const calls: Array<{ url: string; xClientVersion: string | null }> = [];
    const baseFetch = successfulLifecycleFetch();
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, xClientVersion: requestHeaders(input, init).get('x-client-version') });
      return baseFetch(input, init);
    });
    const storage = lifecycleStorage();

    await issueHubDeviceToken({
      baseUrl: 'https://hub.test',
      username: 'anton',
      password: 'pw',
      label: 'test-machine',
      keychain: storage.keychain,
      settings: storage.settings,
      fetchImpl,
      clientVersion: '0.1.29',
    });

    expect(calls.map((call) => call.url)).toEqual([
      'https://hub.test/api/v1/auth/device-tokens/password',
      'https://hub.test/api/v1/auth/device-tokens/activate',
    ]);
    expect(calls.every((call) => call.xClientVersion === '0.1.29')).toBe(true);
  });

  it('signs in with one password call and no cookie', async () => {
    const seen: Array<{ url: string; body: unknown; cookie: string | null }> = [];
    const base = successfulLifecycleFetch();
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      seen.push({
        url: String(input),
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
        cookie: requestHeaders(input, init).get('cookie'),
      });
      return base(input, init);
    });
    const storage = lifecycleStorage();

    await issueHubDeviceToken({
      baseUrl: 'https://hub.test',
      username: ' anton ',
      password: 'pw',
      label: 'Desktop · test-machine',
      keychain: storage.keychain,
      settings: storage.settings,
      fetchImpl,
    });

    expect(seen[0]).toMatchObject({
      url: 'https://hub.test/api/v1/auth/device-tokens/password',
      body: { username: 'anton', password: 'pw', label: 'Desktop · test-machine', mode: 'pending' },
    });
    expect(seen.every((call) => call.cookie === null)).toBe(true);
    expect(seen.map((call) => call.url)).not.toContain('https://hub.test/api/v1/auth/login');
    expect(seen.map((call) => call.url)).not.toContain('https://hub.test/api/v1/auth/logout');
  });

  it.each([
    ['wrong login or password', 401, { error: 'unauthorized', message: 'no', statusCode: 401 }, 'CG-HUB-20'],
    ['a password the owner must reset', 403, {
      error: 'forbidden', message: 'no', statusCode: 403, reason: 'password_change_required',
    }, 'CG-HUB-23'],
    ['an unexplained refusal', 403, { error: 'forbidden', message: 'no', statusCode: 403 }, 'CG-HUB-22'],
    ['a hub that is down', 503, { error: 'unavailable', message: 'no', statusCode: 503 }, 'CG-HUB-21'],
    ['too many attempts', 429, { error: 'rate_limit', message: 'no', statusCode: 429 }, 'CG-HUB-22'],
    // A kernel without the sign-in route (rolled back, or not deployed yet):
    // the server has to change, so "try again in a minute" would be a lie.
    ['a server without password sign-in', 404, {
      error: 'not_found', message: 'Route not found', statusCode: 404,
    }, 'CG-HUB-21'],
  ])('maps %s to %s without storing anything', async (_label, status, body, code) => {
    const fetchImpl = vi.fn(async () => jsonResponse(status, body));
    const setSecret = vi.fn();
    const storage = lifecycleStorage();
    storage.keychain.setSecret = setSecret;

    await expect(issueHubDeviceToken({
      baseUrl: 'https://hub.test',
      username: 'anton',
      password: 'wrong',
      label: 'm',
      keychain: storage.keychain,
      settings: storage.settings,
      fetchImpl,
    })).rejects.toMatchObject({ code });
    expect(setSecret).not.toHaveBeenCalled();
    expect(storage.journals.size).toBe(0);
  });

  it('reports an unreachable hub as CG-HUB-21', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const storage = lifecycleStorage();
    await expect(issueHubDeviceToken({
      baseUrl: 'https://hub.test',
      username: 'anton',
      password: 'pw',
      label: 'm',
      keychain: storage.keychain,
      settings: storage.settings,
      fetchImpl,
    })).rejects.toMatchObject({ code: 'CG-HUB-21' });
    expect(storage.secrets.size).toBe(0);
  });

  it('refuses an active bearer when it asked for a reservation', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      mode: 'active',
      token: 'agency_hub_device_live',
      id: 7,
      label: 'm',
      keyPrefix: 'agency_hub_device_live',
      expiresAt: ACTIVATED.expiresAt,
    }));
    const storage = lifecycleStorage();
    await expect(issueHubDeviceToken({
      baseUrl: 'https://hub.test',
      username: 'anton',
      password: 'pw',
      label: 'm',
      keychain: storage.keychain,
      settings: storage.settings,
      fetchImpl,
    })).rejects.toMatchObject({ code: 'CG-HUB-22' });
    expect(storage.secrets.size).toBe(0);
    expect(storage.journals.size).toBe(0);
  });

  it('times out an unresponsive sign-in without publishing recoverable custody', async () => {
    vi.useFakeTimers();
    try {
      const storage = lifecycleStorage();
      const onActivationDeferred = vi.fn();
      let observedSignal: AbortSignal | undefined;
      let markStarted: (() => void) | undefined;
      const started = new Promise<void>((resolve) => {
        markStarted = resolve;
      });
      const fetchImpl = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
        observedSignal = init?.signal ?? undefined;
        markStarted?.();
        return new Promise<Response>(() => undefined);
      });

      const issuance = issueHubDeviceToken({
        baseUrl: 'https://hub.test', username: 'anton', password: 'pw', label: 'test-machine',
        keychain: storage.keychain, settings: storage.settings, fetchImpl, onActivationDeferred,
      });
      const settled = issuance.then(
        () => ({ ok: true as const, error: undefined }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      await started;
      await vi.advanceTimersByTimeAsync(HUB_DEVICE_TOKEN_REQUEST_TIMEOUT_MS);

      const result = await settled;
      expect(result.ok).toBe(false);
      expect(result.error).toMatchObject({
        code: 'CG-HUB-21',
        detail: { kernelCode: 'timeout' },
      });
      expect(observedSignal).toMatchObject({ aborted: true });
      expect(storage.journals.size).toBe(0);
      expect(storage.secrets.size).toBe(0);
      expect(onActivationDeferred).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the pending token quarantined when the activation route is unavailable', async () => {
    const storage = lifecycleStorage();
    const baseFetch = successfulLifecycleFetch();
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith('/api/v1/auth/device-tokens/activate')) {
        return jsonResponse(404, { error: 'not_found', message: 'Route not found', statusCode: 404 });
      }
      return baseFetch(input, init);
    });

    await expect(issueHubDeviceToken({
      baseUrl: 'https://hub.test', username: 'anton', password: 'pw', label: 'test-machine',
      keychain: storage.keychain, settings: storage.settings, fetchImpl,
    })).rejects.toMatchObject({ code: 'CG-HUB-22', detail: { status: 404 } });
    expect(storage.secrets.has('hubDeviceToken')).toBe(false);
    expect(storage.secrets.has('hubDeviceTokenStaged')).toBe(true);
    expect(storage.journals.has(HUB_DEVICE_TOKEN_ACTIVATION_KEY)).toBe(true);
  });

  it('clears an expired/terminal 401 activation so future sign-in is not wedged', async () => {
    const storage = lifecycleStorage();
    const baseFetch = successfulLifecycleFetch();
    const unavailable = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith('/api/v1/auth/device-tokens/activate')) {
        return jsonResponse(503, { error: 'unavailable', message: 'offline', statusCode: 503 });
      }
      return baseFetch(input, init);
    });
    await expect(issueHubDeviceToken({
      baseUrl: 'https://hub.test', username: 'anton', password: 'pw', label: 'test-machine',
      keychain: storage.keychain, settings: storage.settings, fetchImpl: unavailable,
    })).rejects.toMatchObject({ code: 'CG-HUB-22', detail: { status: 503 } });
    // Covers the crash-after-local-promotion shape too: only the exact
    // journal-bound active copy may be removed on terminal invalidation.
    storage.secrets.set('hubDeviceToken', PENDING.token);
    const onDeferred = vi.fn();

    await recoverHubDeviceTokenLifecycle({
      keychain: storage.keychain,
      settings: storage.settings,
      fetchImpl: vi.fn(async () => jsonResponse(401, {
        error: 'unauthorized', message: 'reservation expired', statusCode: 401,
      })),
      onDeferred,
    });

    expect(onDeferred).not.toHaveBeenCalled();
    expect(storage.secrets.has('hubDeviceToken')).toBe(false);
    expect(storage.secrets.has('hubDeviceTokenStaged')).toBe(false);
    expect(storage.journals.has(HUB_DEVICE_TOKEN_ACTIVATION_KEY)).toBe(false);
  });

  it('clears only a terminal-dead activation while preserving unrelated active custody', async () => {
    const storage = lifecycleStorage();
    const baseFetch = successfulLifecycleFetch();
    const offline = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith('/api/v1/auth/device-tokens/activate')) {
        return jsonResponse(503, { error: 'unavailable', message: 'offline', statusCode: 503 });
      }
      return baseFetch(input, init);
    });
    await expect(issueHubDeviceToken({
      baseUrl: 'https://hub.test', username: 'anton', password: 'pw', label: 'test-machine',
      keychain: storage.keychain, settings: storage.settings, fetchImpl: offline,
    })).rejects.toMatchObject({ code: 'CG-HUB-22', detail: { status: 503 } });
    const replacement = 'agency_hub_device_unrelated_live';
    storage.secrets.set('hubDeviceToken', replacement);
    storage.journals.set(HUB_DEVICE_TOKEN_BINDING_KEY, {
      version: 1,
      hubBaseUrl: 'https://hub.test',
      tokenDigest: deviceTokenDigest(replacement),
    });
    const onDeferred = vi.fn();

    await expect(recoverHubDeviceTokenLifecycle({
      keychain: storage.keychain,
      settings: storage.settings,
      fetchImpl: vi.fn(async () => jsonResponse(401, {
        error: 'unauthorized', message: 'reservation expired', statusCode: 401,
      })),
      onDeferred,
    })).resolves.toBe(false);

    expect(onDeferred).not.toHaveBeenCalled();
    expect(storage.secrets.get('hubDeviceToken')).toBe(replacement);
    expect(storage.journals.has(HUB_DEVICE_TOKEN_ACTIVATION_KEY)).toBe(false);
    expect(storage.secrets.has('hubDeviceTokenStaged')).toBe(false);
    expect(storage.journals.get(HUB_DEVICE_TOKEN_BINDING_KEY)).toMatchObject({
      tokenDigest: deviceTokenDigest(replacement),
    });
  });

  it('recovers a lost activation response without ever exposing the pending bearer', async () => {
    const storage = lifecycleStorage();
    const baseFetch = successfulLifecycleFetch();
    let activationCalls = 0;
    const onActivationDeferred = vi.fn();
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith('/api/v1/auth/device-tokens/activate') && ++activationCalls === 1) {
        throw new Error('connection reset after Core commit');
      }
      return baseFetch(input, init);
    });

    await expect(issueHubDeviceToken({
      baseUrl: 'https://hub.test', username: 'anton', password: 'pw', label: 'test-machine',
      keychain: storage.keychain, settings: storage.settings, fetchImpl, onActivationDeferred,
    })).rejects.toThrow(/connection reset/);
    expect(storage.secrets.has('hubDeviceToken')).toBe(false);
    expect(storage.secrets.has('hubDeviceTokenStaged')).toBe(true);
    expect(onActivationDeferred).toHaveBeenCalledTimes(1);

    await recoverHubDeviceTokenLifecycle({
      keychain: storage.keychain,
      settings: storage.settings,
      fetchImpl,
    });
    expect(activationCalls).toBe(2);
    expect(storage.secrets.get('hubDeviceToken')).toBe(PENDING.token);
    expect(storage.secrets.has('hubDeviceTokenStaged')).toBe(false);
    expect(storage.journals.has(HUB_DEVICE_TOKEN_ACTIVATION_KEY)).toBe(false);
  });

  it('preserves an unrecoverable activation warning until explicit abandonment', async () => {
    const storage = lifecycleStorage();
    const baseFetch = successfulLifecycleFetch();
    const unavailable = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith('/api/v1/auth/device-tokens/activate')) {
        return jsonResponse(503, { error: 'unavailable', message: 'offline', statusCode: 503 });
      }
      return baseFetch(input, init);
    });
    await expect(issueHubDeviceToken({
      baseUrl: 'https://hub.test', username: 'anton', password: 'pw', label: 'test-machine',
      keychain: storage.keychain, settings: storage.settings, fetchImpl: unavailable,
    })).rejects.toMatchObject({ code: 'CG-HUB-22', detail: { status: 503 } });
    storage.secrets.delete('hubDeviceTokenStaged');
    const onCustodyRecovery = vi.fn();
    const recoveryFetch = vi.fn();

    const pending = await recoverHubDeviceTokenLifecycle({
      keychain: storage.keychain,
      settings: storage.settings,
      fetchImpl: recoveryFetch,
      onCustodyRecovery,
    });

    expect(pending).toBe(true);
    expect(recoveryFetch).not.toHaveBeenCalled();
    expect(storage.journals.has(HUB_DEVICE_TOKEN_ACTIVATION_KEY)).toBe(true);
    expect(onCustodyRecovery).toHaveBeenCalledWith(
      'activation',
      'unrecoverable-activation-requires-abandonment',
    );
  });

  it('accepts a hash-matched promoted token when activation staging is missing', async () => {
    const storage = lifecycleStorage();
    const baseFetch = successfulLifecycleFetch();
    const unavailable = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith('/api/v1/auth/device-tokens/activate')) {
        return jsonResponse(503, { error: 'unavailable', message: 'offline', statusCode: 503 });
      }
      return baseFetch(input, init);
    });
    await expect(issueHubDeviceToken({
      baseUrl: 'https://hub.test', username: 'anton', password: 'pw', label: 'test-machine',
      keychain: storage.keychain, settings: storage.settings, fetchImpl: unavailable,
    })).rejects.toMatchObject({ code: 'CG-HUB-22', detail: { status: 503 } });
    storage.secrets.set('hubDeviceToken', PENDING.token);
    storage.secrets.delete('hubDeviceTokenStaged');
    const onCustodyRecovery = vi.fn();

    await recoverHubDeviceTokenLifecycle({
      keychain: storage.keychain,
      settings: storage.settings,
      fetchImpl: vi.fn(),
      onCustodyRecovery,
    });

    expect(storage.secrets.get('hubDeviceToken')).toBe(PENDING.token);
    expect(storage.journals.has(HUB_DEVICE_TOKEN_ACTIVATION_KEY)).toBe(false);
    expect(onCustodyRecovery).toHaveBeenCalledWith(
      'activation',
      'accepted-promoted-active',
    );
    // D19: recovery rebuilds the display identity but never invents dates —
    // the true issue/expiry moments are unknowable in this branch.
    expect(readHubDeviceIdentity(storage.settings)).toEqual({
      version: 1,
      username: 'anton',
      label: PENDING.label,
      tokenLast4: PENDING.token.slice(-4),
      issuedAt: null,
      expiresAt: null,
    });
  });

  it('revokes a staged activation but keeps a latch for unrelated active custody', async () => {
    const storage = lifecycleStorage();
    const baseFetch = successfulLifecycleFetch();
    const unavailable = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith('/api/v1/auth/device-tokens/activate')) {
        return jsonResponse(503, { error: 'unavailable', message: 'offline', statusCode: 503 });
      }
      return baseFetch(input, init);
    });
    await expect(issueHubDeviceToken({
      baseUrl: 'https://hub.test', username: 'anton', password: 'pw', label: 'test-machine',
      keychain: storage.keychain, settings: storage.settings, fetchImpl: unavailable,
    })).rejects.toMatchObject({ code: 'CG-HUB-22', detail: { status: 503 } });
    const replacement = 'agency_hub_device_unrelated_replacement';
    storage.secrets.set('hubDeviceToken', replacement);
    const recoveryFetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/api/v1/auth/device-tokens/activate')) {
        return jsonResponse(200, ACTIVATED);
      }
      if (url.endsWith('/api/v1/auth/device-tokens/current')) {
        return jsonResponse(200, { revoked: true });
      }
      throw new Error(`unexpected recovery url ${url}`);
    });
    const onCustodyRecovery = vi.fn();

    const pending = await recoverHubDeviceTokenLifecycle({
      keychain: storage.keychain,
      settings: storage.settings,
      fetchImpl: recoveryFetch,
      onCustodyRecovery,
    });

    expect(pending).toBe(true);
    expect(recoveryFetch).toHaveBeenCalledTimes(2);
    expect(storage.secrets.get('hubDeviceToken')).toBe(replacement);
    expect(storage.secrets.has('hubDeviceTokenStaged')).toBe(false);
    expect(storage.secrets.has('hubDeviceTokenRevoking')).toBe(true);
    expect(storage.journals.has(HUB_DEVICE_TOKEN_ACTIVATION_KEY)).toBe(false);
    expect(storage.settings.get(HUB_DEVICE_TOKEN_REVOCATION_KEY)).toMatchObject({
      remoteSettled: true,
    });
    expect(onCustodyRecovery).toHaveBeenCalledWith(
      'revocation',
      'unrecoverable-revocation-requires-abandonment',
    );
  });

  it('settles a staged token against its proven old origin without promoting it into the restored Hub', async () => {
    const storage = lifecycleStorage();
    const baseFetch = successfulLifecycleFetch();
    const unavailable = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith('/api/v1/auth/device-tokens/activate')) {
        return jsonResponse(503, { error: 'unavailable', message: 'offline', statusCode: 503 });
      }
      return baseFetch(input, init);
    });
    await expect(issueHubDeviceToken({
      baseUrl: 'https://hub.test', username: 'anton', password: 'pw', label: 'test-machine',
      keychain: storage.keychain, settings: storage.settings, fetchImpl: unavailable,
    })).rejects.toMatchObject({ code: 'CG-HUB-22', detail: { status: 503 } });
    const recoveryFetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/api/v1/auth/device-tokens/activate')) {
        return jsonResponse(200, ACTIVATED);
      }
      if (url.endsWith('/api/v1/auth/device-tokens/current')) {
        return jsonResponse(200, { revoked: true });
      }
      throw new Error(`unexpected recovery url ${url}`);
    });
    const onCustodyRecovery = vi.fn();

    const pending = await recoverHubDeviceTokenLifecycle({
      keychain: storage.keychain,
      settings: storage.settings,
      currentHubBaseUrl: 'https://other-hub.test/',
      fetchImpl: recoveryFetch,
      onCustodyRecovery,
    });

    expect(pending).toBe(false);
    expect(recoveryFetch.mock.calls.map(([input]) => String(input))).toEqual([
      'https://hub.test/api/v1/auth/device-tokens/activate',
      'https://hub.test/api/v1/auth/device-tokens/current',
    ]);
    expect(storage.secrets.has('hubDeviceToken')).toBe(false);
    expect(storage.secrets.has('hubDeviceTokenStaged')).toBe(false);
    expect(storage.journals.has(HUB_DEVICE_TOKEN_ACTIVATION_KEY)).toBe(false);
    expect(storage.journals.has(HUB_DEVICE_TOKEN_REVOCATION_KEY)).toBe(false);
    expect(onCustodyRecovery).not.toHaveBeenCalled();
  });

  it('does not overwrite active custody restored while activation is in flight', async () => {
    const storage = lifecycleStorage();
    const baseFetch = successfulLifecycleFetch();
    const unavailable = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith('/api/v1/auth/device-tokens/activate')) {
        return jsonResponse(503, { error: 'unavailable', message: 'offline', statusCode: 503 });
      }
      return baseFetch(input, init);
    });
    await expect(issueHubDeviceToken({
      baseUrl: 'https://hub.test', username: 'anton', password: 'pw', label: 'test-machine',
      keychain: storage.keychain, settings: storage.settings, fetchImpl: unavailable,
    })).rejects.toMatchObject({ code: 'CG-HUB-22', detail: { status: 503 } });
    const replacement = 'agency_hub_device_restored_during_activate';
    const onCustodyRecovery = vi.fn();
    const recoveryFetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/api/v1/auth/device-tokens/activate')) {
        storage.secrets.set('hubDeviceToken', replacement);
        return jsonResponse(200, ACTIVATED);
      }
      if (url.endsWith('/api/v1/auth/device-tokens/current')) {
        return jsonResponse(200, { revoked: true });
      }
      throw new Error(`unexpected recovery url ${url}`);
    });

    const pending = await recoverHubDeviceTokenLifecycle({
      keychain: storage.keychain,
      settings: storage.settings,
      currentHubBaseUrl: 'https://hub.test',
      fetchImpl: recoveryFetch,
      onCustodyRecovery,
    });

    expect(pending).toBe(true);
    expect(storage.secrets.get('hubDeviceToken')).toBe(replacement);
    expect(storage.journals.has(HUB_DEVICE_TOKEN_ACTIVATION_KEY)).toBe(false);
    expect(storage.journals.has(HUB_DEVICE_TOKEN_REVOCATION_KEY)).toBe(true);
    expect(storage.secrets.has('hubDeviceTokenRevoking')).toBe(true);
    expect(storage.settings.get(HUB_DEVICE_TOKEN_REVOCATION_KEY)).toMatchObject({
      remoteSettled: true,
    });
    expect(onCustodyRecovery).toHaveBeenCalledWith(
      'revocation',
      'unrecoverable-revocation-requires-abandonment',
    );
  });

  it('durably converts sign-out during deferred activation into exact revocation across restart', async () => {
    const storage = lifecycleStorage({ hubApiKey: 'agency_hub_core_fallback' });
    const baseFetch = successfulLifecycleFetch();
    const firstProcessFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith('/api/v1/auth/device-tokens/activate')) {
        throw new Error('offline during activation');
      }
      return baseFetch(input, init);
    });
    await expect(issueHubDeviceToken({
      baseUrl: 'https://hub.test', username: 'anton', password: 'pw', label: 'test-machine',
      keychain: storage.keychain, settings: storage.settings, fetchImpl: firstProcessFetch,
    })).rejects.toThrow(/offline during activation/);

    expect(requestHubDeviceTokenActivationCancellation(storage.settings)).toBe(true);
    expect(storage.settings.get(HUB_DEVICE_TOKEN_ACTIVATION_KEY)).toMatchObject({
      cancelRequested: true,
    });
    expect(storage.secrets.has('hubDeviceToken')).toBe(false);

    const secondProcessCalls: string[] = [];
    const secondProcessFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      secondProcessCalls.push(url);
      if (url.endsWith('/api/v1/auth/device-tokens/activate')) {
        expect(requestHeaders(input, init).get('authorization')).toBe(`Bearer ${PENDING.token}`);
        return jsonResponse(200, ACTIVATED);
      }
      if (url.endsWith('/api/v1/auth/device-tokens/current')) {
        expect(requestHeaders(input, init).get('authorization')).toBe(`Bearer ${PENDING.token}`);
        expect(storage.journals.has(HUB_DEVICE_TOKEN_ACTIVATION_KEY)).toBe(false);
        expect(storage.journals.has(HUB_DEVICE_TOKEN_REVOCATION_KEY)).toBe(true);
        expect(storage.secrets.has('hubDeviceTokenRevoking')).toBe(true);
        expect(storage.secrets.has('hubDeviceToken')).toBe(false);
        return jsonResponse(503, { error: 'unavailable', message: 'revoke offline', statusCode: 503 });
      }
      throw new Error(`unexpected url ${url}`);
    });
    const deferred = vi.fn();
    await recoverHubDeviceTokenLifecycle({
      keychain: storage.keychain,
      settings: storage.settings,
      fetchImpl: secondProcessFetch,
      onDeferred: deferred,
    });
    expect(deferred).toHaveBeenCalledTimes(1);
    expect(storage.journals.has(HUB_DEVICE_TOKEN_ACTIVATION_KEY)).toBe(false);
    expect(storage.journals.has(HUB_DEVICE_TOKEN_REVOCATION_KEY)).toBe(true);
    expect(storage.secrets.has('hubDeviceToken')).toBe(false);

    await recoverHubDeviceTokenLifecycle({
      keychain: storage.keychain,
      settings: storage.settings,
      fetchImpl: vi.fn(async () => jsonResponse(401, {
        error: 'unauthorized', message: 'already revoked', statusCode: 401,
      })),
    });
    expect(secondProcessCalls).toEqual([
      'https://hub.test/api/v1/auth/device-tokens/activate',
      'https://hub.test/api/v1/auth/device-tokens/current',
    ]);
    expect(storage.journals.has(HUB_DEVICE_TOKEN_REVOCATION_KEY)).toBe(false);
    expect(storage.secrets.has('hubDeviceTokenRevoking')).toBe(false);
    expect(storage.secrets.has('hubDeviceToken')).toBe(false);
  });

  it('cleans activation staging after a crash immediately following the activation-to-revocation batch', async () => {
    const storage = lifecycleStorage({ hubApiKey: 'agency_hub_core_fallback' });
    const baseFetch = successfulLifecycleFetch();
    const offlineActivation = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith('/api/v1/auth/device-tokens/activate')) {
        throw new Error('offline during activation');
      }
      return baseFetch(input, init);
    });
    await expect(issueHubDeviceToken({
      baseUrl: 'https://hub.test', username: 'anton', password: 'pw', label: 'test-machine',
      keychain: storage.keychain, settings: storage.settings, fetchImpl: offlineActivation,
    })).rejects.toThrow(/offline during activation/);
    requestHubDeviceTokenActivationCancellation(storage.settings);

    const originalDelete = storage.keychain.deleteSecret.getMockImplementation()!;
    let crashAtOldStagingCleanup = true;
    storage.keychain.deleteSecret.mockImplementation(async (name) => {
      if (name === 'hubDeviceTokenStaged' && crashAtOldStagingCleanup) {
        crashAtOldStagingCleanup = false;
        throw new Error('process died after journal handoff');
      }
      await originalDelete(name);
    });

    await recoverHubDeviceTokenLifecycle({
      keychain: storage.keychain,
      settings: storage.settings,
      fetchImpl: vi.fn(async () => jsonResponse(200, ACTIVATED)),
      onDeferred: vi.fn(),
    });

    expect(storage.journals.has(HUB_DEVICE_TOKEN_ACTIVATION_KEY)).toBe(false);
    expect(storage.journals.has(HUB_DEVICE_TOKEN_REVOCATION_KEY)).toBe(true);
    expect(storage.secrets.has('hubDeviceTokenStaged')).toBe(false);
    expect(storage.secrets.has('hubDeviceTokenRevoking')).toBe(true);

    await recoverHubDeviceTokenLifecycle({
      keychain: storage.keychain,
      settings: storage.settings,
      fetchImpl: vi.fn(async () => jsonResponse(401, {
        error: 'unauthorized', message: 'already revoked', statusCode: 401,
      })),
    });
    expect(storage.journals.has(HUB_DEVICE_TOKEN_REVOCATION_KEY)).toBe(false);
    expect(storage.secrets.has('hubDeviceTokenRevoking')).toBe(false);
  });

  it('replays idempotent activation after a crash before local promotion', async () => {
    const storage = lifecycleStorage();
    const originalSet = storage.keychain.setSecret.getMockImplementation()!;
    let failPromotion = true;
    storage.keychain.setSecret.mockImplementation(async (name, value) => {
      if (name === 'hubDeviceToken' && failPromotion) {
        failPromotion = false;
        throw new Error('process died before promotion');
      }
      await originalSet(name, value);
    });
    const fetchImpl = successfulLifecycleFetch();

    await expect(issueHubDeviceToken({
      baseUrl: 'https://hub.test', username: 'anton', password: 'pw', label: 'test-machine',
      keychain: storage.keychain, settings: storage.settings, fetchImpl,
    })).rejects.toThrow(/before promotion/);
    expect(storage.secrets.has('hubDeviceToken')).toBe(false);
    expect(storage.journals.has(HUB_DEVICE_TOKEN_ACTIVATION_KEY)).toBe(true);

    await recoverHubDeviceTokenLifecycle({ keychain: storage.keychain, settings: storage.settings, fetchImpl });
    expect(storage.secrets.get('hubDeviceToken')).toBe(PENDING.token);
    expect(fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/activate'))).toHaveLength(2);
  });

  it('returns committed activation and schedules cleanup when only the obsolete staging delete fails', async () => {
    const storage = lifecycleStorage();
    const originalDelete = storage.keychain.deleteSecret.getMockImplementation()!;
    let failStagingDelete = true;
    storage.keychain.deleteSecret.mockImplementation(async (name) => {
      if (name === 'hubDeviceTokenStaged' && failStagingDelete) {
        failStagingDelete = false;
        throw new Error('staging cleanup failed');
      }
      await originalDelete(name);
    });
    const onActivationDeferred = vi.fn();

    await expect(issueHubDeviceToken({
      baseUrl: 'https://hub.test', username: 'anton', password: 'pw', label: 'test-machine',
      keychain: storage.keychain,
      settings: storage.settings,
      fetchImpl: successfulLifecycleFetch(),
      onActivationDeferred,
    })).resolves.toEqual({
      keyPrefix: ACTIVATED.keyPrefix,
      label: ACTIVATED.label,
      expiresAt: ACTIVATED.expiresAt,
    });
    expect(storage.secrets.get('hubDeviceToken')).toBe(PENDING.token);
    expect(storage.journals.has(HUB_DEVICE_TOKEN_ACTIVATION_KEY)).toBe(false);
    expect(storage.secrets.has('hubDeviceTokenStaged')).toBe(true);
    expect(onActivationDeferred).toHaveBeenCalledTimes(1);

    await recoverHubDeviceTokenLifecycle({
      keychain: storage.keychain,
      settings: storage.settings,
      fetchImpl: vi.fn(async () => {
        throw new Error('journal-less cleanup must not call Core');
      }),
    });
    expect(storage.secrets.has('hubDeviceTokenStaged')).toBe(false);
  });

  it.each(['hubDeviceTokenStaged', 'hubDeviceTokenRevoking'] as const)(
    'deletes unreadable journal-less %s custody without decrypting it',
    async (orphanName) => {
      const storage = lifecycleStorage({ [orphanName]: 'corrupt-dpapi-blob' });
      const originalGet = storage.keychain.getSecret.getMockImplementation()!;
      storage.keychain.getSecret.mockImplementation(async (name) => {
        if (name === orphanName) throw new Error('DPAPI decrypt failed');
        return originalGet(name);
      });
      const onDeferred = vi.fn();

      const pending = await recoverHubDeviceTokenLifecycle({
        keychain: storage.keychain,
        settings: storage.settings,
        fetchImpl: vi.fn(),
        onDeferred,
      });

      expect(pending).toBe(false);
      expect(storage.secrets.has(orphanName)).toBe(false);
      expect(onDeferred).not.toHaveBeenCalled();
    },
  );

  it('does not publish a journal or bearer when encrypted staging fails', async () => {
    const storage = lifecycleStorage();
    storage.keychain.setSecret.mockRejectedValueOnce(new Error('safeStorage write failed'));

    await expect(issueHubDeviceToken({
      baseUrl: 'https://hub.test', username: 'anton', password: 'pw', label: 'test-machine',
      keychain: storage.keychain, settings: storage.settings, fetchImpl: successfulLifecycleFetch(),
    })).rejects.toThrow(/safeStorage write failed/);
    expect(storage.secrets.has('hubDeviceToken')).toBe(false);
    expect(storage.journals.size).toBe(0);
  });

  it('accepts an exact promoted active token when activation staging cannot be decrypted', async () => {
    const storage = lifecycleStorage();
    const baseFetch = successfulLifecycleFetch();
    const offline = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith('/api/v1/auth/device-tokens/activate')) {
        return jsonResponse(503, { error: 'unavailable', message: 'offline', statusCode: 503 });
      }
      return baseFetch(input, init);
    });
    await expect(issueHubDeviceToken({
      baseUrl: 'https://hub.test', username: 'anton', password: 'pw', label: 'test-machine',
      keychain: storage.keychain, settings: storage.settings, fetchImpl: offline,
    })).rejects.toMatchObject({ code: 'CG-HUB-22', detail: { status: 503 } });
    storage.secrets.set('hubDeviceToken', PENDING.token);
    const originalGet = storage.keychain.getSecret.getMockImplementation()!;
    storage.keychain.getSecret.mockImplementation(async (name) => {
      if (name === 'hubDeviceTokenStaged') throw new Error('DPAPI staged decrypt failed');
      return originalGet(name);
    });
    const fetchImpl = vi.fn();

    await expect(recoverHubDeviceTokenLifecycle({
      keychain: storage.keychain,
      settings: storage.settings,
      fetchImpl,
    })).resolves.toBe(false);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(storage.secrets.get('hubDeviceToken')).toBe(PENDING.token);
    expect(storage.journals.has(HUB_DEVICE_TOKEN_ACTIVATION_KEY)).toBe(false);
    expect(storage.journals.get(HUB_DEVICE_TOKEN_BINDING_KEY)).toEqual({
      version: 1,
      hubBaseUrl: 'https://hub.test',
      tokenDigest: deviceTokenDigest(PENDING.token),
    });
  });

  it('settles exact activation custody but keeps attention when active custody cannot be decrypted', async () => {
    const storage = lifecycleStorage();
    const baseFetch = successfulLifecycleFetch();
    const offline = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith('/api/v1/auth/device-tokens/activate')) {
        return jsonResponse(503, { error: 'unavailable', message: 'offline', statusCode: 503 });
      }
      return baseFetch(input, init);
    });
    await expect(issueHubDeviceToken({
      baseUrl: 'https://hub.test', username: 'anton', password: 'pw', label: 'test-machine',
      keychain: storage.keychain, settings: storage.settings, fetchImpl: offline,
    })).rejects.toMatchObject({ code: 'CG-HUB-22', detail: { status: 503 } });
    const originalGet = storage.keychain.getSecret.getMockImplementation()!;
    storage.keychain.getSecret.mockImplementation(async (name) => {
      if (name === 'hubDeviceToken') throw new Error('DPAPI active decrypt failed');
      return originalGet(name);
    });
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      return url.endsWith('/activate')
        ? jsonResponse(200, ACTIVATED)
        : jsonResponse(200, { revoked: true });
    });
    const onCustodyRecovery = vi.fn();

    await expect(recoverHubDeviceTokenLifecycle({
      keychain: storage.keychain,
      settings: storage.settings,
      fetchImpl,
      onCustodyRecovery,
    })).resolves.toBe(true);

    expect(urls).toEqual([
      'https://hub.test/api/v1/auth/device-tokens/activate',
      'https://hub.test/api/v1/auth/device-tokens/current',
    ]);
    expect(storage.settings.get(HUB_DEVICE_TOKEN_REVOCATION_KEY)).toMatchObject({
      remoteSettled: true,
    });
    expect(onCustodyRecovery).toHaveBeenCalledWith(
      'revocation',
      'unrecoverable-revocation-requires-abandonment',
    );
  });
});

describe('revokeHubDeviceToken', () => {
  it('revokes the exact bearer with the generated Core operation', async () => {
    const calls: Array<{ url: string; method: string; authorization: string | null; version: string | null }> = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      calls.push({
        url: String(input),
        method: init?.method ?? 'GET',
        authorization: headers.get('authorization'),
        version: headers.get('x-client-version'),
      });
      return jsonResponse(200, { revoked: true });
    });

    await expect(revokeHubDeviceToken({
      baseUrl: 'https://hub.test/',
      token: PENDING.token,
      clientVersion: '0.1.42',
      fetchImpl,
    })).resolves.toBe('revoked');
    expect(calls).toEqual([{
      url: 'https://hub.test/api/v1/auth/device-tokens/current',
      method: 'DELETE',
      authorization: `Bearer ${PENDING.token}`,
      version: '0.1.42',
    }]);
  });

  it('treats an already-invalid bearer as safely revoked but propagates other failures', async () => {
    const alreadyInvalid = vi.fn(async () => jsonResponse(401, {
      error: 'unauthorized',
      message: 'Invalid device token',
      statusCode: 401,
    }));
    await expect(revokeHubDeviceToken({
      baseUrl: 'https://hub.test',
      token: PENDING.token,
      fetchImpl: alreadyInvalid,
    })).resolves.toBe('already-invalid');

    const oldCore = vi.fn(async () => jsonResponse(404, {
      error: 'not_found',
      message: 'Route not found',
      statusCode: 404,
    }));
    await expect(revokeHubDeviceToken({
      baseUrl: 'https://hub.test',
      token: PENDING.token,
      fetchImpl: oldCore,
    })).rejects.toMatchObject({ status: 404 });
  });
});

describe('durable device-token revocation', () => {
  it('publishes encrypted custody and journal before the remote revoke, then removes custody', async () => {
    const storage = lifecycleStorage({ hubDeviceToken: PENDING.token, hubApiKey: 'agency_hub_core_fallback' });
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe('https://hub.test/api/v1/auth/device-tokens/current');
      expect(requestHeaders(input, init).get('authorization')).toBe(`Bearer ${PENDING.token}`);
      expect(storage.secrets.get('hubDeviceToken')).toBe(PENDING.token);
      expect(storage.secrets.has('hubDeviceTokenRevoking')).toBe(true);
      expect(storage.journals.has(HUB_DEVICE_TOKEN_REVOCATION_KEY)).toBe(true);
      return jsonResponse(200, { revoked: true });
    });

    await expect(beginHubDeviceTokenRevocation({
      baseUrl: 'https://hub.test/', token: PENDING.token,
      keychain: storage.keychain, settings: storage.settings, fetchImpl,
    })).resolves.toBe('revoked');
    expect(storage.secrets.has('hubDeviceToken')).toBe(false);
    expect(storage.secrets.has('hubDeviceTokenRevoking')).toBe(false);
    expect(storage.journals.has(HUB_DEVICE_TOKEN_REVOCATION_KEY)).toBe(false);
    // Sign-out takes the identity with it: a surviving record would stamp the
    // next person's reconcile with the previous person's username.
    expect(readHubDeviceIdentity(storage.settings)).toBeNull();
    expect(storage.journals.has(HUB_DEVICE_TOKEN_BINDING_KEY)).toBe(false);
  });

  it('keeps exact custody and journal quarantined while offline', async () => {
    const storage = lifecycleStorage({ hubDeviceToken: PENDING.token });
    const fetchImpl = vi.fn(async () => jsonResponse(503, {
      error: 'unavailable', message: 'offline', statusCode: 503,
    }));

    await expect(beginHubDeviceTokenRevocation({
      baseUrl: 'https://hub.test', token: PENDING.token,
      keychain: storage.keychain, settings: storage.settings, fetchImpl,
    })).rejects.toMatchObject({ status: 503 });
    expect(storage.secrets.get('hubDeviceToken')).toBe(PENDING.token);
    expect(storage.secrets.has('hubDeviceTokenRevoking')).toBe(true);
    expect(storage.journals.has(HUB_DEVICE_TOKEN_REVOCATION_KEY)).toBe(true);
  });

  it('bounds a hung sign-out so a queued purge can proceed while revocation custody remains durable', async () => {
    vi.useFakeTimers();
    try {
      const storage = lifecycleStorage({ hubDeviceToken: PENDING.token });
      const queue = createRuntimeMutationQueue();
      let observedSignal: AbortSignal | undefined;
      let markStarted: (() => void) | undefined;
      const started = new Promise<void>((resolve) => {
        markStarted = resolve;
      });
      const fetchImpl = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
        observedSignal = init?.signal ?? undefined;
        markStarted?.();
        // Deliberately violates fetch's AbortSignal contract. The lifecycle's
        // Promise.race must still release the global mutation queue.
        return new Promise<Response>(() => undefined);
      });
      const signOut = queue.run(() => beginHubDeviceTokenRevocation({
        baseUrl: 'https://hub.test', token: PENDING.token,
        keychain: storage.keychain, settings: storage.settings, fetchImpl,
      }));
      const signOutSettled = signOut.then(
        () => ({ ok: true as const, error: undefined }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      let purgeStarted = false;
      const purge = queue.run(async () => {
        purgeStarted = true;
        return 'purge-proceeded';
      });

      await started;
      await vi.advanceTimersByTimeAsync(HUB_DEVICE_TOKEN_REQUEST_TIMEOUT_MS - 1);
      expect(purgeStarted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);

      const result = await signOutSettled;
      expect(result.ok).toBe(false);
      expect(result.error).toMatchObject({ name: 'KernelApiError' });
      await expect(purge).resolves.toBe('purge-proceeded');
      expect(observedSignal).toMatchObject({ aborted: true });
      expect(observedSignal?.reason).toMatchObject({ name: 'TimeoutError' });
      expect(storage.secrets.get('hubDeviceToken')).toBe(PENDING.token);
      expect(storage.secrets.has('hubDeviceTokenRevoking')).toBe(true);
      expect(storage.journals.has(HUB_DEVICE_TOKEN_REVOCATION_KEY)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('recovers a crash after remote revoke and treats 401 as idempotent success', async () => {
    const storage = lifecycleStorage({ hubDeviceToken: PENDING.token });
    const originalDelete = storage.keychain.deleteSecret.getMockImplementation()!;
    let failActiveDelete = true;
    storage.keychain.deleteSecret.mockImplementation(async (name) => {
      if (name === 'hubDeviceToken' && failActiveDelete) {
        failActiveDelete = false;
        throw new Error('process died after revoke response');
      }
      await originalDelete(name);
    });
    let revokeCalls = 0;
    const fetchImpl = vi.fn(async () => {
      revokeCalls += 1;
      return revokeCalls === 1
        ? jsonResponse(200, { revoked: true })
        : jsonResponse(401, { error: 'unauthorized', message: 'already revoked', statusCode: 401 });
    });

    await expect(beginHubDeviceTokenRevocation({
      baseUrl: 'https://hub.test', token: PENDING.token,
      keychain: storage.keychain, settings: storage.settings, fetchImpl,
    })).rejects.toThrow(/after revoke response/);
    expect(storage.secrets.get('hubDeviceToken')).toBe(PENDING.token);
    expect(storage.journals.has(HUB_DEVICE_TOKEN_REVOCATION_KEY)).toBe(true);

    await recoverHubDeviceTokenLifecycle({ keychain: storage.keychain, settings: storage.settings, fetchImpl });
    expect(revokeCalls).toBe(2);
    expect(storage.secrets.has('hubDeviceToken')).toBe(false);
    expect(storage.secrets.has('hubDeviceTokenRevoking')).toBe(false);
    expect(storage.journals.has(HUB_DEVICE_TOKEN_REVOCATION_KEY)).toBe(false);
  });

  it('rebuilds missing revocation custody from the hash-matched active token', async () => {
    const storage = lifecycleStorage({ hubDeviceToken: PENDING.token });
    const offline = vi.fn(async () => jsonResponse(503, {
      error: 'unavailable', message: 'offline', statusCode: 503,
    }));
    await expect(beginHubDeviceTokenRevocation({
      baseUrl: 'https://hub.test', token: PENDING.token,
      keychain: storage.keychain, settings: storage.settings, fetchImpl: offline,
    })).rejects.toMatchObject({ status: 503 });
    storage.secrets.delete('hubDeviceTokenRevoking');
    const onCustodyRecovery = vi.fn();
    const recoveredFetch = vi.fn(async () => jsonResponse(200, { revoked: true }));

    await recoverHubDeviceTokenLifecycle({
      keychain: storage.keychain,
      settings: storage.settings,
      fetchImpl: recoveredFetch,
      onCustodyRecovery,
    });

    expect(recoveredFetch).toHaveBeenCalledTimes(1);
    expect(onCustodyRecovery).toHaveBeenCalledWith('revocation', 'rebuilt-revocation-custody');
    expect(storage.secrets.has('hubDeviceToken')).toBe(false);
    expect(storage.secrets.has('hubDeviceTokenRevoking')).toBe(false);
    expect(storage.journals.has(HUB_DEVICE_TOKEN_REVOCATION_KEY)).toBe(false);
  });

  it('preserves an unrecoverable revocation warning until explicit abandonment', async () => {
    const storage = lifecycleStorage({ hubDeviceToken: PENDING.token });
    await expect(beginHubDeviceTokenRevocation({
      baseUrl: 'https://hub.test', token: PENDING.token,
      keychain: storage.keychain, settings: storage.settings,
      fetchImpl: vi.fn(async () => jsonResponse(503, {
        error: 'unavailable', message: 'offline', statusCode: 503,
      })),
    })).rejects.toMatchObject({ status: 503 });
    storage.secrets.delete('hubDeviceToken');
    storage.secrets.delete('hubDeviceTokenRevoking');
    const onCustodyRecovery = vi.fn();

    const pending = await recoverHubDeviceTokenLifecycle({
      keychain: storage.keychain,
      settings: storage.settings,
      fetchImpl: vi.fn(),
      onCustodyRecovery,
    });

    expect(pending).toBe(true);
    expect(storage.journals.has(HUB_DEVICE_TOKEN_REVOCATION_KEY)).toBe(true);
    expect(onCustodyRecovery).toHaveBeenCalledWith(
      'revocation',
      'unrecoverable-revocation-requires-abandonment',
    );
  });

  it('keeps a revocation latch when unrelated active custody has unknown origin', async () => {
    const storage = lifecycleStorage({ hubDeviceToken: PENDING.token });
    const offline = vi.fn(async () => jsonResponse(503, {
      error: 'unavailable', message: 'offline', statusCode: 503,
    }));
    await expect(beginHubDeviceTokenRevocation({
      baseUrl: 'https://hub.test', token: PENDING.token,
      keychain: storage.keychain, settings: storage.settings, fetchImpl: offline,
    })).rejects.toMatchObject({ status: 503 });
    storage.secrets.set('hubDeviceToken', 'agency_hub_device_replacement');

    const recoveryFetch = vi.fn(async (_input: string | URL | Request) => (
      jsonResponse(200, { revoked: true })
    ));
    const onCustodyRecovery = vi.fn();
    const pending = await recoverHubDeviceTokenLifecycle({
      keychain: storage.keychain,
      settings: storage.settings,
      fetchImpl: recoveryFetch,
      onCustodyRecovery,
    });

    expect(pending).toBe(true);
    expect(recoveryFetch).toHaveBeenCalledTimes(1);
    expect(storage.secrets.get('hubDeviceToken')).toBe('agency_hub_device_replacement');
    expect(storage.secrets.has('hubDeviceTokenRevoking')).toBe(true);
    expect(storage.settings.get(HUB_DEVICE_TOKEN_REVOCATION_KEY)).toMatchObject({
      remoteSettled: true,
    });
    expect(onCustodyRecovery).toHaveBeenCalledWith(
      'revocation',
      'unrecoverable-revocation-requires-abandonment',
    );

    // Once the unknown active file is removed, local cleanup consumes the
    // settled latch without sending another DELETE.
    storage.secrets.delete('hubDeviceToken');
    const secondFetch = vi.fn();
    await expect(recoverHubDeviceTokenLifecycle({
      keychain: storage.keychain,
      settings: storage.settings,
      fetchImpl: secondFetch,
    })).resolves.toBe(false);
    expect(secondFetch).not.toHaveBeenCalled();
    expect(storage.secrets.has('hubDeviceTokenRevoking')).toBe(false);
    expect(storage.journals.has(HUB_DEVICE_TOKEN_REVOCATION_KEY)).toBe(false);
  });

  it('revokes exact journal custody against its proven old origin after settings restore', async () => {
    const storage = lifecycleStorage({ hubDeviceToken: PENDING.token });
    const offline = vi.fn(async () => jsonResponse(503, {
      error: 'unavailable', message: 'offline', statusCode: 503,
    }));
    await expect(beginHubDeviceTokenRevocation({
      baseUrl: 'https://hub.test', token: PENDING.token,
      keychain: storage.keychain, settings: storage.settings, fetchImpl: offline,
    })).rejects.toMatchObject({ status: 503 });
    const recoveryFetch = vi.fn(async (_input: string | URL | Request) => (
      jsonResponse(200, { revoked: true })
    ));
    const onCustodyRecovery = vi.fn();

    const pending = await recoverHubDeviceTokenLifecycle({
      keychain: storage.keychain,
      settings: storage.settings,
      currentHubBaseUrl: 'https://other-hub.test',
      fetchImpl: recoveryFetch,
      onCustodyRecovery,
    });

    expect(pending).toBe(false);
    expect(recoveryFetch).toHaveBeenCalledTimes(1);
    expect(String(recoveryFetch.mock.calls[0]![0])).toBe(
      'https://hub.test/api/v1/auth/device-tokens/current',
    );
    expect(storage.secrets.has('hubDeviceToken')).toBe(false);
    expect(storage.secrets.has('hubDeviceTokenRevoking')).toBe(false);
    expect(storage.journals.has(HUB_DEVICE_TOKEN_REVOCATION_KEY)).toBe(false);
    expect(onCustodyRecovery).not.toHaveBeenCalled();
  });

  it('keeps the revocation latch if active custody changes during the remote revoke', async () => {
    const storage = lifecycleStorage({ hubDeviceToken: PENDING.token });
    const offline = vi.fn(async () => jsonResponse(503, {
      error: 'unavailable', message: 'offline', statusCode: 503,
    }));
    await expect(beginHubDeviceTokenRevocation({
      baseUrl: 'https://hub.test', token: PENDING.token,
      keychain: storage.keychain, settings: storage.settings, fetchImpl: offline,
    })).rejects.toMatchObject({ status: 503 });
    const replacement = 'agency_hub_device_external_restore';
    const onCustodyRecovery = vi.fn();
    const recoveryFetch = vi.fn(async () => {
      storage.secrets.set('hubDeviceToken', replacement);
      return jsonResponse(200, { revoked: true });
    });

    const pending = await recoverHubDeviceTokenLifecycle({
      keychain: storage.keychain,
      settings: storage.settings,
      fetchImpl: recoveryFetch,
      onCustodyRecovery,
    });

    expect(pending).toBe(true);
    expect(recoveryFetch).toHaveBeenCalledTimes(1);
    expect(onCustodyRecovery).toHaveBeenCalledWith(
      'revocation',
      'unrecoverable-revocation-requires-abandonment',
    );
    expect(storage.secrets.get('hubDeviceToken')).toBe(replacement);
    expect(storage.secrets.has('hubDeviceTokenRevoking')).toBe(true);
    expect(storage.settings.get(HUB_DEVICE_TOKEN_REVOCATION_KEY)).toMatchObject({
      remoteSettled: true,
    });
  });

  it('rebuilds exact revocation custody when its staged file cannot be decrypted', async () => {
    const storage = lifecycleStorage({ hubDeviceToken: PENDING.token });
    await expect(beginHubDeviceTokenRevocation({
      baseUrl: 'https://hub.test', token: PENDING.token,
      keychain: storage.keychain,
      settings: storage.settings,
      fetchImpl: vi.fn(async () => jsonResponse(503, {
        error: 'unavailable', message: 'offline', statusCode: 503,
      })),
    })).rejects.toMatchObject({ status: 503 });
    const originalGet = storage.keychain.getSecret.getMockImplementation()!;
    let failStagedRead = true;
    storage.keychain.getSecret.mockImplementation(async (name) => {
      if (name === 'hubDeviceTokenRevoking' && failStagedRead) {
        failStagedRead = false;
        throw new Error('DPAPI staged decrypt failed');
      }
      return originalGet(name);
    });
    const onCustodyRecovery = vi.fn();
    const fetchImpl = vi.fn(async () => jsonResponse(200, { revoked: true }));

    await expect(recoverHubDeviceTokenLifecycle({
      keychain: storage.keychain,
      settings: storage.settings,
      fetchImpl,
      onCustodyRecovery,
    })).resolves.toBe(false);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(onCustodyRecovery).toHaveBeenCalledWith(
      'revocation',
      'rebuilt-revocation-custody',
    );
    expect(storage.secrets.has('hubDeviceToken')).toBe(false);
    expect(storage.journals.has(HUB_DEVICE_TOKEN_REVOCATION_KEY)).toBe(false);
  });

  it('revokes exact staged custody but keeps attention when active custody cannot be decrypted', async () => {
    const storage = lifecycleStorage({ hubDeviceToken: PENDING.token });
    await expect(beginHubDeviceTokenRevocation({
      baseUrl: 'https://hub.test', token: PENDING.token,
      keychain: storage.keychain,
      settings: storage.settings,
      fetchImpl: vi.fn(async () => jsonResponse(503, {
        error: 'unavailable', message: 'offline', statusCode: 503,
      })),
    })).rejects.toMatchObject({ status: 503 });
    const originalGet = storage.keychain.getSecret.getMockImplementation()!;
    storage.keychain.getSecret.mockImplementation(async (name) => {
      if (name === 'hubDeviceToken') throw new Error('DPAPI active decrypt failed');
      return originalGet(name);
    });
    const onCustodyRecovery = vi.fn();
    const fetchImpl = vi.fn(async () => jsonResponse(200, { revoked: true }));

    await expect(recoverHubDeviceTokenLifecycle({
      keychain: storage.keychain,
      settings: storage.settings,
      fetchImpl,
      onCustodyRecovery,
    })).resolves.toBe(true);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(storage.settings.get(HUB_DEVICE_TOKEN_REVOCATION_KEY)).toMatchObject({
      remoteSettled: true,
    });
    expect(onCustodyRecovery).toHaveBeenCalledWith(
      'revocation',
      'unrecoverable-revocation-requires-abandonment',
    );
  });

  it('explicitly abandons every local device-token custody slot without network I/O', async () => {
    const storage = lifecycleStorage({
      hubDeviceToken: PENDING.token,
      hubDeviceTokenStaged: 'staged-envelope',
      hubDeviceTokenRevoking: 'revoking-envelope',
    });
    storage.journals.set(HUB_DEVICE_TOKEN_ACTIVATION_KEY, { opaque: 'activation' });
    storage.journals.set(HUB_DEVICE_TOKEN_REVOCATION_KEY, { opaque: 'revocation' });

    await abandonHubDeviceTokenCustody({
      keychain: storage.keychain,
      settings: storage.settings,
    });

    expect(storage.secrets.has('hubDeviceToken')).toBe(false);
    expect(storage.secrets.has('hubDeviceTokenStaged')).toBe(false);
    expect(storage.secrets.has('hubDeviceTokenRevoking')).toBe(false);
    expect(storage.journals.has(HUB_DEVICE_TOKEN_ACTIVATION_KEY)).toBe(false);
    expect(storage.journals.has(HUB_DEVICE_TOKEN_REVOCATION_KEY)).toBe(false);
    expect(readHubDeviceIdentity(storage.settings)).toBeNull();
    expect(storage.journals.has(HUB_DEVICE_TOKEN_BINDING_KEY)).toBe(false);
  });
});
