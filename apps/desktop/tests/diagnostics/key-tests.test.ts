import { describe, expect, it } from 'vitest';
import { runKeyTest, type KeyTestDeps } from '../../src/main/diagnostics/key-tests';
import type { HubProbeFetch } from '../../src/main/hub/test-connection';

const ME_BODY = JSON.stringify({
  authMethod: 'device_token',
  user: {
    id: 7,
    username: 'dasha',
    role: 'chatter',
    assignedPages: [{ id: 1, label: 'loravie', platform: 'onlyfans', modelSlug: 'lora', modelName: 'Lora' }],
  },
});

function makeDeps(secrets: Record<string, string | null>, clientVersion?: string) {
  const bearers: string[] = [];
  const versions: Array<string | undefined> = [];
  const fetchImpl: HubProbeFetch = (_url, init) => {
    bearers.push(init.headers['authorization'] ?? '');
    versions.push(init.headers['x-client-version']);
    return Promise.resolve(new Response(ME_BODY, { status: 200 }));
  };
  const deps = {
    keychain: { getSecret: (name: string) => Promise.resolve(secrets[name] ?? null) },
    settingsStore: { get: () => Promise.resolve({ hubBaseUrl: 'https://hub.example.com' }) },
    fetchImpl,
    ...(clientVersion !== undefined ? { clientVersion } : {}),
  } as unknown as KeyTestDeps;
  return { deps, bearers, versions };
}

describe('runKeyTest credential resolution', () => {
  it('probes with the device token when one is stored (the actual runtime bearer)', async () => {
    const { deps, bearers } = makeDeps({
      hubDeviceToken: 'agency_hub_device_t',
      hubApiKey: 'agency_hub_core_k',
    });
    const result = await runKeyTest('hub', deps);
    expect(result.ok).toBe(true);
    expect(bearers).toEqual(['Bearer agency_hub_device_t']);
  });

  it('falls back to the legacy chatter key when no device token exists', async () => {
    const { deps, bearers } = makeDeps({ hubApiKey: 'agency_hub_core_k' });
    const result = await runKeyTest('hub', deps);
    expect(result.ok).toBe(true);
    expect(bearers).toEqual(['Bearer agency_hub_core_k']);
  });

  it('reports HUB_NOT_CONFIGURED when neither credential is stored', async () => {
    const { deps, bearers } = makeDeps({});
    const result = await runKeyTest('hub', deps);
    expect(result).toMatchObject({ ok: false, code: 'HUB_NOT_CONFIGURED' });
    expect(bearers).toEqual([]);
  });

  it('passes the caller-supplied clientVersion through to the probe (Stage 4 / Proposal 4.1)', async () => {
    const { deps, versions } = makeDeps({ hubApiKey: 'agency_hub_core_k' }, '0.1.29');
    const result = await runKeyTest('hub', deps);
    expect(result.ok).toBe(true);
    expect(versions).toEqual(['0.1.29']);
  });
});
