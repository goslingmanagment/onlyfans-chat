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
  it('GETs {base}/api/v1/auth/me (trailing slash trimmed) and returns the principal', async () => {
    const { impl, urls } = fetchReturning(200);
    const result = await probeHubConnection('https://hub.example.com/', 'agency_hub_core_k', impl);
    expect(urls).toEqual(['https://hub.example.com/api/v1/auth/me']);
    expect(result).toEqual({ username: 'dasha', role: 'chatter', pages: 2 });
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
