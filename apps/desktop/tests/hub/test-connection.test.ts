import { describe, expect, it } from 'vitest';
import { probeHubConnection, type HubProbeFetch } from '../../src/main/hub/test-connection';

const ME_BODY = JSON.stringify({
  authMethod: 'api_key',
  user: {
    id: 7,
    username: 'dasha',
    role: 'chatter',
    assignedPages: [
      { id: 1, label: 'loravie', platform: 'onlyfans', modelSlug: 'lora', modelName: 'Lora' },
      { id: 2, label: 'loravie-vip', platform: 'onlyfans', modelSlug: 'lora', modelName: 'Lora' },
    ],
  },
});

function fetchReturning(status: number, body = ME_BODY) {
  const urls: string[] = [];
  const impl: HubProbeFetch = (url, init) => {
    urls.push(url);
    expect(init.headers['authorization']).toBe('Bearer agency_hub_core_k');
    return Promise.resolve(new Response(body, { status }));
  };
  return { impl, urls };
}

describe('probeHubConnection', () => {
  it('counts ONLY OnlyFans pages — this app cannot open a Fansly one (D35)', async () => {
    const mixed = JSON.stringify({
      authMethod: 'device_token',
      user: {
        id: 17,
        username: 'grisha',
        role: 'chatter',
        assignedPages: [
          { id: 1, label: 'loravie', platform: 'onlyfans', modelSlug: 'lora', modelName: 'Lora' },
          { id: 2, label: 'ari', platform: 'fansly', modelSlug: 'ari', modelName: 'Ari' },
          { id: 3, label: 'lilly', platform: 'fansly', modelSlug: 'lilly', modelName: 'Lilly' },
        ],
      },
    });
    const impl: HubProbeFetch = () => Promise.resolve(new Response(mixed, { status: 200 }));
    await expect(probeHubConnection('https://hub.example.com', 'agency_hub_device_k', impl))
      .resolves.toEqual({ username: 'grisha', role: 'chatter', pages: 1 });
  });

  it('reports zero pages for a chatter with no OnlyFans work at all', async () => {
    const fanslyOnly = JSON.stringify({
      authMethod: 'device_token',
      user: {
        id: 17,
        username: 'grisha',
        role: 'chatter',
        assignedPages: [
          { id: 2, label: 'ari', platform: 'fansly', modelSlug: 'ari', modelName: 'Ari' },
        ],
      },
    });
    const impl: HubProbeFetch = () => Promise.resolve(new Response(fanslyOnly, { status: 200 }));
    await expect(probeHubConnection('https://hub.example.com', 'agency_hub_device_k', impl))
      .resolves.toMatchObject({ pages: 0 });
  });

  it('GETs {base}/api/v1/auth/me (trailing slash trimmed) and returns the principal', async () => {
    const { impl, urls } = fetchReturning(200);
    const result = await probeHubConnection('https://hub.example.com/', 'agency_hub_core_k', impl);
    expect(urls).toEqual(['https://hub.example.com/api/v1/auth/me']);
    expect(result).toEqual({ username: 'dasha', role: 'chatter', pages: 2 });
  });

  it('stamps x-client-version on the probe when a version is supplied (Stage 4 / Proposal 4.1)', async () => {
    const headers: Array<Record<string, string>> = [];
    const impl: HubProbeFetch = (_url, init) => {
      headers.push(init.headers);
      return Promise.resolve(new Response(ME_BODY, { status: 200 }));
    };
    await probeHubConnection('https://hub.example.com', 'agency_hub_core_k', impl, '0.1.29');
    expect(headers[0]?.['x-client-version']).toBe('0.1.29');
  });

  it('omits x-client-version when no version is supplied', async () => {
    const { impl } = fetchReturning(200);
    const headers: Array<Record<string, string>> = [];
    const wrapped: HubProbeFetch = (url, init) => {
      headers.push(init.headers);
      return impl(url, init);
    };
    await probeHubConnection('https://hub.example.com', 'agency_hub_core_k', wrapped);
    expect(headers[0]).not.toHaveProperty('x-client-version');
  });

  it('maps 401/403 to CG-HUB-01 and other failures to CG-HUB-02', async () => {
    await expect(
      probeHubConnection('https://h.x', 'agency_hub_core_k', fetchReturning(401).impl),
    ).rejects.toMatchObject({ code: 'CG-HUB-01' });
    await expect(
      probeHubConnection('https://h.x', 'agency_hub_core_k', fetchReturning(403).impl),
    ).rejects.toMatchObject({ code: 'CG-HUB-01' });
    await expect(
      probeHubConnection('https://h.x', 'agency_hub_core_k', fetchReturning(503).impl),
    ).rejects.toMatchObject({ code: 'CG-HUB-02' });
    await expect(
      probeHubConnection('https://h.x', 'agency_hub_core_k', fetchReturning(200, 'not json').impl),
    ).rejects.toMatchObject({ code: 'CG-HUB-02' });
    await expect(
      probeHubConnection('https://h.x', 'agency_hub_core_k', fetchReturning(200, '{"nope":1}').impl),
    ).rejects.toMatchObject({ code: 'CG-HUB-02' });
  });

  it('maps network failure to CG-HUB-02 and timeout to CG-NET-02', async () => {
    const network: HubProbeFetch = () => Promise.reject(new TypeError('fetch failed'));
    await expect(probeHubConnection('https://h.x', 'k', network)).rejects.toMatchObject({
      code: 'CG-HUB-02',
    });
    const timeoutError = new Error('t');
    timeoutError.name = 'TimeoutError';
    const timeout: HubProbeFetch = () => Promise.reject(timeoutError);
    await expect(probeHubConnection('https://h.x', 'k', timeout)).rejects.toMatchObject({
      code: 'CG-NET-02',
    });
  });
});
