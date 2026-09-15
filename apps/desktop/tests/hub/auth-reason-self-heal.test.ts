// D35 §9 п.4: the reason a hub 401 carries must reach ONE recovery dispatcher
// from all three transports (SDK, read gateway, connection probe), and that
// dispatcher must wipe the local sign-in only under its three predicates.

import { describe, expect, it, vi } from 'vitest';
import { CgError, createUserFacing } from '@chatgoose/shared/errors/index';
import { createHubClient } from '@chatgoose/shared/hub/index';
import {
  hubAuthReasonOf,
  recoverFromHubAuthFailure,
} from '../../src/main/hub/auth-recovery';
import { createOfApiClient } from '../../src/main/ofapi/client';
import { probeHubConnection } from '../../src/main/hub/test-connection';
import { runKeyTest } from '../../src/main/diagnostics/key-tests';
import {
  hubDeviceTokenStatus,
  requiresSignIn,
} from '../../src/renderer/src/features/settings/sections/hubSettingsLogic';
import {
  HUB_DEVICE_IDENTITY_KEY,
  HUB_DEVICE_TOKEN_ACTIVATION_KEY,
  HUB_DEVICE_TOKEN_BINDING_KEY,
  HUB_SIGNED_OUT_KEY,
  deviceTokenDigest,
} from '../../src/main/hub/credential-journal';

const TOKEN = 'agency_hub_device_live';
const HUB = 'https://hub.test';

function unauthorized(reason?: string): Response {
  return new Response(
    JSON.stringify({
      error: 'unauthorized',
      message: 'Unauthorized',
      statusCode: 401,
      ...(reason !== undefined ? { reason } : {}),
    }),
    { status: 401, headers: { 'content-type': 'application/json' } },
  );
}

function custody(initial: { token?: string | null } = {}) {
  const secrets = new Map<string, string>();
  if (initial.token !== null) {
    secrets.set('hubDeviceToken', initial.token ?? TOKEN);
  }
  const journals = new Map<string, unknown>();
  journals.set(HUB_DEVICE_TOKEN_BINDING_KEY, {
    version: 1,
    hubBaseUrl: HUB,
    tokenDigest: deviceTokenDigest(initial.token ?? TOKEN),
  });
  journals.set(HUB_DEVICE_IDENTITY_KEY, {
    version: 1,
    username: 'grisha',
    label: 'Desktop · box',
    tokenLast4: TOKEN.slice(-4),
    issuedAt: null,
    expiresAt: null,
  });
  return {
    secrets,
    journals,
    keychain: {
      getSecret: vi.fn(async (name: string) => secrets.get(name) ?? null),
      setSecret: vi.fn(async (name: string, value: string) => {
        secrets.set(name, value);
      }),
      deleteSecret: vi.fn(async (name: string) => {
        secrets.delete(name);
      }),
    },
    settings: {
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
        for (const mutation of mutations) {
          if (mutation.kind === 'set') journals.set(mutation.key, mutation.value);
          else journals.delete(mutation.key);
        }
      }),
    },
  };
}

const runCredentialMutation = <Result>(task: () => Promise<Result>): Promise<Result> => task();

describe('the reason survives every hub transport', () => {
  it('SDK lane: a revoked credential reaches the funnel with its reason', async () => {
    const seen: unknown[] = [];
    const client = createHubClient({
      baseUrl: HUB,
      apiKey: TOKEN,
      fetchImpl: async () => unauthorized('token_revoked'),
      onAuthFailure: (error) => seen.push(error),
    });

    await expect(client.listPages()).rejects.toMatchObject({ code: 'CG-HUB-01' });
    expect(seen).toHaveLength(1);
    expect(hubAuthReasonOf(seen[0])).toBe('token_revoked');
  });

  it('SDK lane covers the AI streams — the chatter\'s actual work', async () => {
    // The generation lanes are SSE, not typed calls: a catch inside the typed
    // delegate would report `listPages()` and silently miss every Fast Reply.
    const seen: unknown[] = [];
    const client = createHubClient({
      baseUrl: HUB,
      apiKey: TOKEN,
      fetchImpl: async () => unauthorized('token_revoked'),
      onAuthFailure: (error) => seen.push(error),
    });

    await expect(client.streamAiFeature(
      {
        feature: 'fast-reply',
        request: {
          clientRequestId: '00000000-0000-4000-8000-00000000f001',
          pageLabel: 'loravie',
          platform: 'onlyfans',
          conversationRef: 'chat_42',
        },
      },
      { onText: () => undefined },
    )).rejects.toMatchObject({ code: 'CG-HUB-01' });
    expect(hubAuthReasonOf(seen[0])).toBe('token_revoked');

    seen.length = 0;
    await expect(client.streamAiGateway(
      {
        request: {
          clientRequestId: '00000000-0000-4000-8000-00000000f002',
          feature: 'fast-reply',
          pageLabel: 'loravie',
          platform: 'onlyfans',
          platformUserId: '42',
          model: 'anthropic:claude-sonnet-4-6',
          reasoningEffort: 'off',
          isRegeneration: false,
          prompt: {
            systemBlocks: [{ text: 'system', cache: 'none' }],
            userBlocks: [{ text: 'hi', cache: 'none' }],
          },
        },
      },
      { onText: () => undefined },
    )).rejects.toMatchObject({ code: 'CG-HUB-01' });
    expect(hubAuthReasonOf(seen[0])).toBe('token_revoked');
  });

  it('read-gateway lane: a cold start with no SDK request still carries it', async () => {
    const seen: unknown[] = [];
    const client = createOfApiClient({
      apiKey: TOKEN,
      baseUrl: `${HUB}/api/v1/ofapi`,
      authErrorCode: 'CG-HUB-01',
      fetchImpl: async () => unauthorized('token_expired'),
      onError: (error) => seen.push(error),
      sleep: async () => undefined,
    });

    await expect(client.listAccounts()).rejects.toMatchObject({ code: 'CG-HUB-01' });
    expect(hubAuthReasonOf(seen[0])).toBe('token_expired');
  });

  it('connection probe: the third transport carries it too', async () => {
    const error = await probeHubConnection(
      HUB,
      TOKEN,
      async () => unauthorized('token_revoked'),
    ).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(CgError);
    expect(hubAuthReasonOf(error)).toBe('token_revoked');
  });

  it('a reasonless 401 carries nothing to act on (fail closed)', async () => {
    const seen: unknown[] = [];
    const client = createHubClient({
      baseUrl: HUB,
      apiKey: TOKEN,
      fetchImpl: async () => unauthorized(),
      onAuthFailure: (error) => seen.push(error),
    });
    await expect(client.listPages()).rejects.toMatchObject({ code: 'CG-HUB-01' });
    expect(hubAuthReasonOf(seen[0])).toBeNull();

    // An unknown future reason is equally inert until the client learns it.
    expect(hubAuthReasonOf(new CgError('CG-HUB-01', {
      detail: { authReason: 'user_disabled' as never },
    }))).toBeNull();
  });

  it('the probe reports into the funnel with the bearer it used', async () => {
    const reported: Array<{ reason: string | null; bearerDigest: string }> = [];
    const result = await runKeyTest('hub', {
      settingsStore: {
        getHubConnection: async () => ({
          settings: { hubBaseUrl: HUB } as never,
          hubBaseUrl: HUB,
          bearer: TOKEN,
          deviceToken: TOKEN,
          deviceTokenTransition: null,
        }),
      },
      fetchImpl: async () => unauthorized('token_revoked'),
      onAuthFailure: (error, bearerDigest) => {
        reported.push({ reason: hubAuthReasonOf(error), bearerDigest });
      },
    });

    expect(result).toMatchObject({ ok: false, code: 'CG-HUB-01' });
    expect(reported).toEqual([
      { reason: 'token_revoked', bearerDigest: deviceTokenDigest(TOKEN) },
    ]);
  });
});

describe('recoverFromHubAuthFailure', () => {
  const revoked = new CgError('CG-HUB-01', { detail: { authReason: 'token_revoked' } });

  it('wipes the local sign-in and records why', async () => {
    const storage = custody();

    await expect(recoverFromHubAuthFailure({
      error: revoked,
      bearerDigest: deviceTokenDigest(TOKEN),
      keychain: storage.keychain,
      settings: storage.settings,
      runCredentialMutation,
      now: () => new Date('2026-09-15T10:00:00.000Z'),
    })).resolves.toBe('wiped');

    expect(storage.secrets.has('hubDeviceToken')).toBe(false);
    expect(storage.journals.has(HUB_DEVICE_TOKEN_BINDING_KEY)).toBe(false);
    expect(storage.journals.has(HUB_DEVICE_IDENTITY_KEY)).toBe(false);
    expect(storage.journals.get(HUB_SIGNED_OUT_KEY)).toEqual({
      version: 1,
      reason: 'token_revoked',
      at: '2026-09-15T10:00:00.000Z',
    });
  });

  it('never acts on a 401 without a reason', async () => {
    const storage = custody();
    await expect(recoverFromHubAuthFailure({
      error: new CgError('CG-HUB-01', { detail: { status: 401 } }),
      bearerDigest: deviceTokenDigest(TOKEN),
      keychain: storage.keychain,
      settings: storage.settings,
      runCredentialMutation,
    })).resolves.toBe('ignored');
    expect(storage.secrets.get('hubDeviceToken')).toBe(TOKEN);
  });

  it('never deletes a NEWER sign-in than the one that was rejected', async () => {
    const storage = custody({ token: 'agency_hub_device_fresh' });
    await expect(recoverFromHubAuthFailure({
      error: revoked,
      bearerDigest: deviceTokenDigest('agency_hub_device_retired'),
      keychain: storage.keychain,
      settings: storage.settings,
      runCredentialMutation,
    })).resolves.toBe('ignored');
    expect(storage.secrets.get('hubDeviceToken')).toBe('agency_hub_device_fresh');
  });

  it('stands down while a durable transition owns the custody', async () => {
    const storage = custody();
    storage.journals.set(HUB_DEVICE_TOKEN_ACTIVATION_KEY, {
      version: 1,
      id: '00000000-0000-4000-8000-000000000001',
      hubBaseUrl: HUB,
      tokenDigest: deviceTokenDigest(TOKEN),
      reservationId: 4,
      label: 'Desktop · box',
      keyPrefix: 'agency_hub_pending_device_x',
      reservationExpiresAt: '2026-09-15T10:10:00.000Z',
    });

    await expect(recoverFromHubAuthFailure({
      error: revoked,
      bearerDigest: deviceTokenDigest(TOKEN),
      keychain: storage.keychain,
      settings: storage.settings,
      runCredentialMutation,
    })).resolves.toBe('ignored');
    expect(storage.secrets.get('hubDeviceToken')).toBe(TOKEN);
  });

  it('does nothing when there is no custody left to wipe', async () => {
    const storage = custody({ token: null });
    await expect(recoverFromHubAuthFailure({
      error: revoked,
      bearerDigest: deviceTokenDigest(TOKEN),
      keychain: storage.keychain,
      settings: storage.settings,
      runCredentialMutation,
    })).resolves.toBe('ignored');
  });

  it('wipes without contacting the hub (the credential is already dead there)', async () => {
    const storage = custody();
    const fetchImpl = vi.fn();
    await recoverFromHubAuthFailure({
      error: revoked,
      bearerDigest: deviceTokenDigest(TOKEN),
      keychain: storage.keychain,
      settings: storage.settings,
      runCredentialMutation,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    // No revocation journal is left behind: there is nothing to settle —
    // only the non-secret reason the sign-in screen shows.
    expect([...storage.journals.keys()]).toEqual([HUB_SIGNED_OUT_KEY]);
    expect(storage.secrets.size).toBe(0);
  });

  it('cold start with a revoked credential ends on the sign-in screen', async () => {
    // The whole §9 п.4 claim in one chain: the FIRST hub request of a cold
    // start is a read-gateway call (no SDK request has succeeded, or even
    // happened), its 401 carries the reason, the dispatcher wipes, and the
    // renderer gate then has no custody to keep the workspace for.
    const storage = custody();
    const seen: unknown[] = [];
    const client = createOfApiClient({
      apiKey: TOKEN,
      baseUrl: `${HUB}/api/v1/ofapi`,
      authErrorCode: 'CG-HUB-01',
      fetchImpl: async () => unauthorized('token_revoked'),
      onError: (error) => seen.push(error),
      sleep: async () => undefined,
    });

    await expect(client.listAccounts()).rejects.toMatchObject({ code: 'CG-HUB-01' });
    await expect(recoverFromHubAuthFailure({
      error: seen[0],
      bearerDigest: deviceTokenDigest(TOKEN),
      keychain: storage.keychain,
      settings: storage.settings,
      runCredentialMutation,
    })).resolves.toBe('wiped');

    expect(storage.secrets.has('hubDeviceToken')).toBe(false);
    expect(requiresSignIn(hubDeviceTokenStatus({
      hasHubDeviceToken: storage.secrets.has('hubDeviceToken'),
      hubDeviceTokenBindingState: storage.journals.has(HUB_DEVICE_TOKEN_BINDING_KEY)
        ? 'bound'
        : 'none',
      hubDeviceTokenTransition: null,
    }))).toBe(true);
  });

  it('reads the reason off a user-facing copy that crossed IPC', () => {
    // createUserFacing drops detail by design — the dispatcher must then see
    // no reason at all rather than guess one.
    expect(hubAuthReasonOf(createUserFacing('CG-HUB-01'))).toBeNull();
  });
});
