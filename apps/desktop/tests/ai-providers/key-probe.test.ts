import { describe, expect, it } from 'vitest';
import {
  ANTHROPIC_MODELS_URL,
  OPENROUTER_KEY_URL,
  probeAnthropicKey,
  probeOpenRouterKey,
  type ProbeFetch,
} from '../../src/main/ai/providers/key-probe';

type Captured = { url: string; init: Parameters<ProbeFetch>[1] };

function fetchReturning(status: number, body = '{}', headers: Record<string, string> = {}) {
  const calls: Captured[] = [];
  const impl: ProbeFetch = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve(new Response(body, { status, headers }));
  };
  return { impl, calls };
}

describe('probeAnthropicKey', () => {
  it('hits GET /v1/models with x-api-key + anthropic-version and resolves on 200', async () => {
    const { impl, calls } = fetchReturning(200);
    await expect(probeAnthropicKey('sk-ant-test', impl)).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(ANTHROPIC_MODELS_URL);
    expect(calls[0]?.init.method).toBe('GET');
    expect(calls[0]?.init.headers['x-api-key']).toBe('sk-ant-test');
    expect(calls[0]?.init.headers['anthropic-version']).toBe('2023-06-01');
    expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('maps 401 to CG-AUTH-02 with provider detail', async () => {
    const { impl } = fetchReturning(
      401,
      JSON.stringify({ error: { type: 'authentication_error', message: 'invalid x-api-key' } }),
    );
    await expect(probeAnthropicKey('bad', impl)).rejects.toMatchObject({
      code: 'CG-AUTH-02',
      detail: { provider: 'anthropic' },
    });
  });

  it('maps a transport throw to CG-NET-01 and a timeout to CG-NET-02', async () => {
    const network: ProbeFetch = () => Promise.reject(new TypeError('fetch failed'));
    await expect(probeAnthropicKey('k', network)).rejects.toMatchObject({ code: 'CG-NET-01' });

    const timeoutError = new Error('timed out');
    timeoutError.name = 'TimeoutError';
    const timeout: ProbeFetch = () => Promise.reject(timeoutError);
    await expect(probeAnthropicKey('k', timeout)).rejects.toMatchObject({ code: 'CG-NET-02' });
  });
});

describe('probeOpenRouterKey', () => {
  it('hits GET /api/v1/key with a Bearer header and resolves on 200', async () => {
    const { impl, calls } = fetchReturning(200, JSON.stringify({ data: { label: 'k' } }));
    await expect(probeOpenRouterKey('or-test', impl)).resolves.toBeUndefined();
    expect(calls[0]?.url).toBe(OPENROUTER_KEY_URL);
    expect(calls[0]?.init.headers['authorization']).toBe('Bearer or-test');
  });

  it('maps 401 to CG-AUTH-02 and 429 to CG-API-01 honoring retry-after', async () => {
    const unauthorized = fetchReturning(401, JSON.stringify({ error: { code: '401', message: 'bad key' } }));
    await expect(probeOpenRouterKey('bad', unauthorized.impl)).rejects.toMatchObject({
      code: 'CG-AUTH-02',
      detail: { provider: 'openrouter' },
    });

    const limited = fetchReturning(429, '{}', { 'retry-after': '7' });
    await expect(probeOpenRouterKey('k', limited.impl)).rejects.toMatchObject({
      code: 'CG-API-01',
      retryAfterMs: 7_000,
    });
  });
});
