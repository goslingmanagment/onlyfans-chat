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

/** D35: the only bearer an install can hold is its bound device credential. */
function makeDeps(secrets: { hubDeviceToken?: string | null }, clientVersion?: string) {
  const bearers: string[] = [];
  const versions: Array<string | undefined> = [];
  const fetchImpl: HubProbeFetch = (_url, init) => {
    bearers.push(init.headers['authorization'] ?? '');
    versions.push(init.headers['x-client-version']);
    return Promise.resolve(new Response(ME_BODY, { status: 200 }));
  };
  const deps = {
    settingsStore: {
      getHubConnection: () => Promise.resolve({
        settings: {} as never,
        hubBaseUrl: 'https://hub.example.com',
        bearer: secrets.hubDeviceToken ?? null,
        deviceToken: secrets.hubDeviceToken ?? null,
        deviceTokenTransition: null,
      }),
    },
    fetchImpl,
    ...(clientVersion !== undefined ? { clientVersion } : {}),
  } as unknown as KeyTestDeps;
  return { deps, bearers, versions };
}

describe('runKeyTest credential resolution', () => {
  it('probes with the stored device credential — the actual runtime bearer', async () => {
    const { deps, bearers } = makeDeps({ hubDeviceToken: 'agency_hub_device_t' });
    const result = await runKeyTest('hub', deps);
    expect(result.ok).toBe(true);
    expect(bearers).toEqual(['Bearer agency_hub_device_t']);
  });

  it('has no other bearer to fall back to (D35 retired the chatter key)', async () => {
    const { deps, bearers } = makeDeps({ hubDeviceToken: null });
    const result = await runKeyTest('hub', deps);
    expect(result).toMatchObject({ ok: false, code: 'HUB_NOT_CONFIGURED' });
    expect(bearers).toEqual([]);
  });

  it('reports HUB_NOT_CONFIGURED when nothing is stored', async () => {
    const { deps, bearers } = makeDeps({});
    const result = await runKeyTest('hub', deps);
    expect(result).toMatchObject({ ok: false, code: 'HUB_NOT_CONFIGURED' });
    expect(bearers).toEqual([]);
  });

  it('passes the caller-supplied clientVersion through to the probe (Stage 4 / Proposal 4.1)', async () => {
    const { deps, versions } = makeDeps({ hubDeviceToken: 'agency_hub_device_t' }, '0.1.29');
    const result = await runKeyTest('hub', deps);
    expect(result.ok).toBe(true);
    expect(versions).toEqual(['0.1.29']);
  });
});
