import { describe, expect, it } from 'vitest';
import {
  createHubClient,
  HUB_LIST_PAGES_TIMEOUT_MS,
  HUB_OFAPI_CREDITS_TIMEOUT_MS,
  HUB_PROFILE_GET_TIMEOUT_MS,
  HUB_PROFILE_MAX_CHARS,
  HUB_PROFILE_PUT_TIMEOUT_MS,
  HUB_USAGE_BATCH_TIMEOUT_MS,
  HubError,
  type HubAbortSignalLike,
  type HubFetch,
  type HubRequestInit,
  type HubResponseLike,
  type HubUsageEvent,
} from '../src/hub/client';

const NOW_MS = Date.parse('2026-06-11T12:00:00.000Z');

const PAGE = {
  id: 7,
  label: 'stella-of',
  platform: 'onlyfans',
  modelSlug: 'stella-sky',
  modelName: 'Stella Sky',
  username: 'stellasky',
  displayName: 'Stella',
  followerCount: { value: 120, available: true },
  subscriberCount: { value: 45, available: true },
  lastLightSyncAt: '2026-06-11T11:00:00.000Z',
  lastFollowerSyncAt: null,
};

const PROFILE_VERSION = {
  version: 3,
  body: 'Fan profile body',
  source: 'chatmuse',
  createdAt: '2026-06-11T11:00:00.000Z',
  createdByUserId: 12,
};

const FAN_PROFILE_RESPONSE = {
  fan: {
    platform: 'onlyfans',
    platformUserId: '123456',
    username: 'fan_one',
    displayName: 'Fan One',
    createdAtExternal: null,
    pageAlias: null,
  },
  profile: PROFILE_VERSION,
};

const USAGE_EVENT: HubUsageEvent = {
  clientEventId: 'op-1',
  feature: 'fast-reply',
  model: 'claude-sonnet-4-5',
  inputTokens: 1200,
  outputTokens: 80,
  cacheWriteTokens: 0,
  cacheReadTokens: 900,
  isCacheHit: false,
  isRegeneration: false,
  completedAt: '2026-06-11T11:59:00.000Z',
};

const BATCH_RESPONSE = { receivedCount: 1, insertedCount: 1, invalidCount: 0, dedupedCount: 0 };

const OFAPI_CREDITS_RESPONSE = {
  enabled: true,
  scope: { pageIds: [1, 2], pageCount: 2 },
  today: {
    day: '2026-06-19',
    from: '2026-06-19T00:00:00.000Z',
    to: '2026-06-20T00:00:00.000Z',
    restCredits: 1,
    webhook: { eventCount: 4688, estimatedCredits: 47 },
    totalEstimatedCredits: 48,
  },
  last7d: {
    from: '2026-06-14T00:00:00.000Z',
    to: '2026-06-21T00:00:00.000Z',
    restCredits: 2,
    webhook: { eventCount: 8545, estimatedCredits: 86 },
    totalEstimatedCredits: 88,
  },
  limitations: ['owner-only balance omitted'],
};

interface RecordedCall {
  url: string;
  init: HubRequestInit;
}

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): HubResponseLike {
  const map = new Map(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));
  return {
    status,
    headers: { get: (name) => map.get(name.toLowerCase()) ?? null },
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

function stubFetch(...responses: Array<HubResponseLike | Error>): { calls: RecordedCall[]; fetchImpl: HubFetch } {
  const calls: RecordedCall[] = [];
  const queue = [...responses];
  const fetchImpl: HubFetch = (url, init) => {
    calls.push({ url, init });
    const next = queue.shift();
    if (next === undefined) {
      throw new Error('stubFetch: no response queued');
    }
    if (next instanceof Error) {
      return Promise.reject(next);
    }
    return Promise.resolve(next);
  };
  return { calls, fetchImpl };
}

function makeClient(fetchImpl: HubFetch) {
  const timeouts: number[] = [];
  const signals: HubAbortSignalLike[] = [];
  const client = createHubClient({
    // Trailing slash + padded key exercise normalization.
    baseUrl: 'https://hub.example.com/',
    apiKey: ' agency_hub_core_testkey ',
    fetchImpl,
    now: () => NOW_MS,
    timeoutSignal: (ms) => {
      timeouts.push(ms);
      const signal = { aborted: false };
      signals.push(signal);
      return signal;
    },
  });
  return { client, timeouts, signals };
}

async function captureHubError(promise: Promise<unknown>): Promise<HubError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(HubError);
    return error as HubError;
  }
  throw new Error('expected the call to reject');
}

describe('createHubClient', () => {
  it('rejects empty configuration', () => {
    const { fetchImpl } = stubFetch();
    expect(() => createHubClient({ baseUrl: '  ', apiKey: 'k', fetchImpl })).toThrow();
    expect(() => createHubClient({ baseUrl: 'https://hub.example.com', apiKey: '  ', fetchImpl })).toThrow();
  });

  it('sends x-client-version on every request when the version is injected (Stage 4 / Proposal 4.1)', async () => {
    const { calls, fetchImpl } = stubFetch(jsonResponse(200, [PAGE]));
    const client = createHubClient({
      baseUrl: 'https://hub.example.com',
      apiKey: 'agency_hub_core_testkey',
      clientVersion: '0.1.29',
      fetchImpl,
    });

    await client.listPages();
    expect(calls[0]?.init.headers['x-client-version']).toBe('0.1.29');
  });

  it('omits x-client-version when no version is injected (blank stays off the wire)', async () => {
    const { calls, fetchImpl } = stubFetch(jsonResponse(200, [PAGE]));
    const client = createHubClient({
      baseUrl: 'https://hub.example.com',
      apiKey: 'agency_hub_core_testkey',
      clientVersion: '   ',
      fetchImpl,
    });

    await client.listPages();
    expect(calls[0]?.init.headers).not.toHaveProperty('x-client-version');
  });

  describe('listPages', () => {
    it('issues GET /api/v1/pages with bearer auth and the default timeout', async () => {
      const { calls, fetchImpl } = stubFetch(jsonResponse(200, [PAGE]));
      const { client, timeouts, signals } = makeClient(fetchImpl);

      const pages = await client.listPages();

      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).toBe('https://hub.example.com/api/v1/pages');
      expect(calls[0]?.init.method).toBe('GET');
      expect(calls[0]?.init.headers['authorization']).toBe('Bearer agency_hub_core_testkey');
      expect(calls[0]?.init.headers['accept']).toBe('application/json');
      expect(calls[0]?.init.body).toBeUndefined();
      expect(timeouts).toEqual([HUB_LIST_PAGES_TIMEOUT_MS]);
      expect(calls[0]?.init.signal).toBe(signals[0]);
      expect(pages).toEqual([PAGE]);
    });

    it('tolerates null username/displayName and unknown extra fields', async () => {
      // Pre-SDK the client tolerated ABSENT fields too; the contract schema
      // now requires every declared field (Stage 24) — absence is drift and
      // fails loudly (see the drifted-shape test below). Unknown extras are
      // still stripped, and nullable fields still pass as null.
      const { fetchImpl } = stubFetch(
        jsonResponse(200, [
          { ...PAGE, id: 1, label: 'a', username: null, displayName: null, unknownExtra: 'ignored' },
        ]),
      );
      const { client } = makeClient(fetchImpl);

      const pages = await client.listPages();

      expect(pages.map((page) => page.label)).toEqual(['a']);
      expect(pages[0]?.username).toBeNull();
      expect(pages[0]).not.toHaveProperty('unknownExtra');
    });

    it('rejects a drifted page shape as invalid-response (CG-HUB-02)', async () => {
      const { fetchImpl } = stubFetch(jsonResponse(200, [{ id: 1, platform: 'onlyfans' }]));
      const { client } = makeClient(fetchImpl);

      const error = await captureHubError(client.listPages());
      expect(error.reason).toBe('invalid-response');
      expect(error.code).toBe('CG-HUB-02');
    });

    it('rejects a non-JSON body as invalid-response', async () => {
      const { fetchImpl } = stubFetch(jsonResponse(200, '<html>gateway</html>'));
      const { client } = makeClient(fetchImpl);

      const error = await captureHubError(client.listPages());
      expect(error.reason).toBe('invalid-response');
    });
  });

  describe('getFanProfile', () => {
    it('issues GET on the encoded profile path with the 5 s prefetch timeout', async () => {
      const { calls, fetchImpl } = stubFetch(jsonResponse(200, FAN_PROFILE_RESPONSE));
      const { client, timeouts } = makeClient(fetchImpl);

      const result = await client.getFanProfile({ pageLabel: 'main page', fanId: '123456' });

      expect(calls[0]?.url).toBe('https://hub.example.com/api/v1/pages/main%20page/fans/123456/profile');
      expect(calls[0]?.init.method).toBe('GET');
      expect(timeouts).toEqual([HUB_PROFILE_GET_TIMEOUT_MS]);
      expect(result?.profile?.body).toBe('Fan profile body');
      expect(result?.fan.platformUserId).toBe('123456');
    });

    it('honors a timeoutMs override', async () => {
      const { fetchImpl } = stubFetch(jsonResponse(200, FAN_PROFILE_RESPONSE));
      const { client, timeouts } = makeClient(fetchImpl);

      await client.getFanProfile({ pageLabel: 'p', fanId: '1', timeoutMs: 1234 });

      expect(timeouts).toEqual([1234]);
    });

    it('returns the fan with a null profile when none exists yet', async () => {
      const { fetchImpl } = stubFetch(jsonResponse(200, { ...FAN_PROFILE_RESPONSE, profile: null }));
      const { client } = makeClient(fetchImpl);

      const result = await client.getFanProfile({ pageLabel: 'p', fanId: '1' });
      expect(result).not.toBeNull();
      expect(result?.profile).toBeNull();
    });

    it('returns null on 404 (fan or label unknown to core)', async () => {
      const { fetchImpl } = stubFetch(jsonResponse(404, { error: 'not found' }));
      const { client } = makeClient(fetchImpl);

      await expect(client.getFanProfile({ pageLabel: 'p', fanId: '1' })).resolves.toBeNull();
    });
  });

  describe('putFanProfile', () => {
    it('issues PUT with a JSON body and the 10 s push timeout', async () => {
      const { calls, fetchImpl } = stubFetch(jsonResponse(200, PROFILE_VERSION));
      const { client, timeouts } = makeClient(fetchImpl);

      const version = await client.putFanProfile({
        pageLabel: 'stella-of',
        fanId: '9',
        body: 'New profile',
        generatedAtMs: 1_718_000_000_000,
      });

      expect(calls[0]?.url).toBe('https://hub.example.com/api/v1/pages/stella-of/fans/9/profile');
      expect(calls[0]?.init.method).toBe('PUT');
      expect(calls[0]?.init.headers['content-type']).toBe('application/json');
      expect(calls[0]?.init.body).toBe(JSON.stringify({
        body: 'New profile',
        generatedAtMs: 1_718_000_000_000,
      }));
      expect(timeouts).toEqual([HUB_PROFILE_PUT_TIMEOUT_MS]);
      expect(version).toEqual(PROFILE_VERSION);
    });

    it('rejects an oversized body before the wire', async () => {
      const { calls, fetchImpl } = stubFetch();
      const { client } = makeClient(fetchImpl);

      const error = await captureHubError(
        client.putFanProfile({
          pageLabel: 'p',
          fanId: '1',
          body: 'x'.repeat(HUB_PROFILE_MAX_CHARS + 1),
          generatedAtMs: 1_718_000_000_000,
        }),
      );
      expect(error.reason).toBe('bad-request');
      expect(calls).toHaveLength(0);
    });

    it('rejects an empty body before the wire', async () => {
      const { calls, fetchImpl } = stubFetch();
      const { client } = makeClient(fetchImpl);

      const error = await captureHubError(client.putFanProfile({
        pageLabel: 'p',
        fanId: '1',
        body: '',
        generatedAtMs: 1_718_000_000_000,
      }));
      expect(error.reason).toBe('bad-request');
      expect(calls).toHaveLength(0);
    });

    it('maps 404 (unknown page label) to an http failure carrying the status', async () => {
      const { fetchImpl } = stubFetch(jsonResponse(404, { error: 'not found' }));
      const { client } = makeClient(fetchImpl);

      const error = await captureHubError(client.putFanProfile({
        pageLabel: 'gone',
        fanId: '1',
        body: 'b',
        generatedAtMs: 1_718_000_000_000,
      }));
      expect(error.reason).toBe('http');
      expect(error.detail?.status).toBe(404);
    });
  });

  describe('postUsageBatch', () => {
    it('issues POST /api/v1/ai-usage/batch with the 15 s timeout and exact body', async () => {
      const { calls, fetchImpl } = stubFetch(jsonResponse(200, BATCH_RESPONSE));
      const { client, timeouts } = makeClient(fetchImpl);

      const result = await client.postUsageBatch({ events: [USAGE_EVENT] });

      expect(calls[0]?.url).toBe('https://hub.example.com/api/v1/ai-usage/batch');
      expect(calls[0]?.init.method).toBe('POST');
      expect(JSON.parse(calls[0]?.init.body ?? '')).toEqual({ events: [USAGE_EVENT] });
      expect(timeouts).toEqual([HUB_USAGE_BATCH_TIMEOUT_MS]);
      expect(result).toEqual(BATCH_RESPONSE);
    });

    it('rejects a response missing invalidCount as contract drift (Stage 24: no more pre-patch tolerance)', async () => {
      const { fetchImpl } = stubFetch(jsonResponse(200, { receivedCount: 1, insertedCount: 1, dedupedCount: 0 }));
      const { client } = makeClient(fetchImpl);

      const error = await captureHubError(client.postUsageBatch({ events: [USAGE_EVENT] }));
      expect(error.reason).toBe('invalid-response');
    });

    it('rejects more than 100 events before the wire', async () => {
      const { calls, fetchImpl } = stubFetch();
      const { client } = makeClient(fetchImpl);

      const events = Array.from({ length: 101 }, (_, index) => ({ ...USAGE_EVENT, clientEventId: `op-${index}` }));
      const error = await captureHubError(client.postUsageBatch({ events }));
      expect(error.reason).toBe('bad-request');
      expect(calls).toHaveLength(0);
    });

    it('rejects an event outside the contract before the wire', async () => {
      const { calls, fetchImpl } = stubFetch();
      const { client } = makeClient(fetchImpl);

      const error = await captureHubError(
        client.postUsageBatch({
          events: [{ ...USAGE_EVENT, feature: 'compare' as HubUsageEvent['feature'] }],
        }),
      );
      expect(error.reason).toBe('bad-request');
      expect(calls).toHaveLength(0);
    });
  });

  describe('getOfapiCreditsSummary', () => {
    it('issues GET /api/v1/ofapi/credits/summary with bearer auth and parses the scoped summary', async () => {
      const { calls, fetchImpl } = stubFetch(jsonResponse(200, OFAPI_CREDITS_RESPONSE));
      const { client, timeouts } = makeClient(fetchImpl);

      const result = await client.getOfapiCreditsSummary();

      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).toBe('https://hub.example.com/api/v1/ofapi/credits/summary');
      expect(calls[0]?.init.method).toBe('GET');
      expect(calls[0]?.init.headers['authorization']).toBe('Bearer agency_hub_core_testkey');
      expect(calls[0]?.init.body).toBeUndefined();
      expect(timeouts).toEqual([HUB_OFAPI_CREDITS_TIMEOUT_MS]);
      expect(result.today.totalEstimatedCredits).toBe(48);
      expect(result.last7d.webhook.estimatedCredits).toBe(86);
    });

    it('rejects a drifted summary shape as invalid-response', async () => {
      const { fetchImpl } = stubFetch(jsonResponse(200, { ...OFAPI_CREDITS_RESPONSE, today: {} }));
      const { client } = makeClient(fetchImpl);

      const error = await captureHubError(client.getOfapiCreditsSummary());
      expect(error.reason).toBe('invalid-response');
    });
  });

  describe('AI persona catalog contract', () => {
    it('reads metadata without exposing or sending persona system text', async () => {
      const personas = [
        { key: 'builtin:lora', displayName: 'Lora', version: 3, status: 'active' as const },
        { key: 'custom:old', displayName: 'Old', version: 8, status: 'archived' as const },
      ];
      const { calls, fetchImpl } = stubFetch(jsonResponse(200, { personas }));
      const { client, timeouts } = makeClient(fetchImpl);

      await expect(client.listAiPersonaCatalog()).resolves.toEqual(personas);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).toBe('https://hub.example.com/api/v1/ai/persona-catalog');
      expect(calls[0]?.init.method).toBe('GET');
      expect(calls[0]?.init.body).toBeUndefined();
      expect(timeouts).toEqual([HUB_LIST_PAGES_TIMEOUT_MS]);
    });

    it('rejects a catalog row without a server revision', async () => {
      const { fetchImpl } = stubFetch(jsonResponse(200, {
        personas: [{ key: 'custom:bad', displayName: 'Bad', status: 'active' }],
      }));
      const { client } = makeClient(fetchImpl);

      const error = await captureHubError(client.listAiPersonaCatalog());
      expect(error.reason).toBe('invalid-response');
    });
  });

  describe('error mapping', () => {
    it('maps 401 to CG-HUB-01 auth failure with the status', async () => {
      const { fetchImpl } = stubFetch(jsonResponse(401, { error: 'unauthorized' }));
      const { client } = makeClient(fetchImpl);

      const error = await captureHubError(client.listPages());
      expect(error.code).toBe('CG-HUB-01');
      expect(error.reason).toBe('auth');
      expect(error.detail?.status).toBe(401);
    });

    it('maps 403 to CG-HUB-01 auth failure', async () => {
      const { fetchImpl } = stubFetch(jsonResponse(403, { error: 'forbidden' }));
      const { client } = makeClient(fetchImpl);

      const error = await captureHubError(client.listPages());
      expect(error.code).toBe('CG-HUB-01');
      expect(error.reason).toBe('auth');
    });

    it('maps 400 to bad-request with a response snippet', async () => {
      const { fetchImpl } = stubFetch(jsonResponse(400, { error: 'events/0/completedAt invalid' }));
      const { client } = makeClient(fetchImpl);

      const error = await captureHubError(client.postUsageBatch({ events: [USAGE_EVENT] }));
      expect(error.code).toBe('CG-HUB-02');
      expect(error.reason).toBe('bad-request');
      expect(error.detail?.status).toBe(400);
      expect(error.detail?.responseSnippet).toContain('completedAt');
    });

    it('maps 5xx to an http failure with the status', async () => {
      const { fetchImpl } = stubFetch(jsonResponse(503, { error: 'down' }));
      const { client } = makeClient(fetchImpl);

      const error = await captureHubError(client.listPages());
      expect(error.code).toBe('CG-HUB-02');
      expect(error.reason).toBe('http');
      expect(error.detail?.status).toBe(503);
    });

    it('maps a 429 quota_denied to CG-HUB-03 quota, keeping the kernel message', async () => {
      const { fetchImpl } = stubFetch(
        jsonResponse(429, { error: 'quota_denied', message: 'ChatMuse AI gateway daily quota exceeded', statusCode: 429 }),
      );
      const { client } = makeClient(fetchImpl);

      const error = await captureHubError(client.listPages());
      expect(error.code).toBe('CG-HUB-03');
      expect(error.reason).toBe('quota');
      expect(error.message).toBe('ChatMuse AI gateway daily quota exceeded');
      expect(error.detail?.status).toBe(429);
    });

    it('maps a generic 429 (no quota code) to a plain http failure', async () => {
      const { fetchImpl } = stubFetch(
        jsonResponse(429, { error: 'rate_limit_exceeded', message: 'Too many requests', statusCode: 429 }),
      );
      const { client } = makeClient(fetchImpl);

      const error = await captureHubError(client.listPages());
      expect(error.code).toBe('CG-HUB-02');
      expect(error.reason).toBe('http');
      expect(error.detail?.status).toBe(429);
    });

    it('distinguishes a timeout abort from a network failure', async () => {
      class TimeoutLikeError extends Error {
        override name = 'TimeoutError';
      }
      const timedOut = makeClient(stubFetch(new TimeoutLikeError('aborted')).fetchImpl);
      const timeoutError = await captureHubError(timedOut.client.listPages());
      expect(timeoutError.reason).toBe('timeout');
      expect(timeoutError.code).toBe('CG-HUB-02');

      const offline = makeClient(stubFetch(new TypeError('fetch failed')).fetchImpl);
      const networkError = await captureHubError(offline.client.listPages());
      expect(networkError.reason).toBe('network');
      expect(networkError.code).toBe('CG-HUB-02');
    });
  });

  describe('server time offset', () => {
    it('is null before any response and tracks the latest Date header', async () => {
      const { fetchImpl } = stubFetch(
        jsonResponse(200, [PAGE], { date: 'Thu, 11 Jun 2026 12:10:00 GMT' }),
        jsonResponse(200, [PAGE], { date: 'Thu, 11 Jun 2026 11:58:00 GMT' }),
      );
      const { client } = makeClient(fetchImpl);

      expect(client.getServerTimeOffsetMs()).toBeNull();
      await client.listPages();
      expect(client.getServerTimeOffsetMs()).toBe(10 * 60 * 1000);
      await client.listPages();
      expect(client.getServerTimeOffsetMs()).toBe(-2 * 60 * 1000);
    });

    it('captures the offset from error responses too', async () => {
      const { fetchImpl } = stubFetch(jsonResponse(500, { error: 'down' }, { date: 'Thu, 11 Jun 2026 12:05:00 GMT' }));
      const { client } = makeClient(fetchImpl);

      await captureHubError(client.listPages());
      expect(client.getServerTimeOffsetMs()).toBe(5 * 60 * 1000);
    });

    it('ignores an unparseable Date header', async () => {
      const { fetchImpl } = stubFetch(jsonResponse(200, [PAGE], { date: 'not-a-date' }));
      const { client } = makeClient(fetchImpl);

      await client.listPages();
      expect(client.getServerTimeOffsetMs()).toBeNull();
    });
  });
});
