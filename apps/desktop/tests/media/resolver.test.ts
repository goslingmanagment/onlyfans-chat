// D42: the desktop half of the media contract — order of sources (local cache
// → Core resolve → the desktop's own download), the per-token budget latch,
// pending retries with fresh requestIds, the click-only re-read, the priced
// size limit, the host allowlist on every hop, no automatic retry of a paid
// transfer, durable idempotent reports and credits from Core's answer.

import { describe, expect, it, vi } from 'vitest';
import type { HubMediaResolveRequest, HubMediaResolveResponse } from '@chatgoose/shared/hub/index';
import type { MediaFetchReport } from '@main/db/index';
import { createMediaResolver, type MediaFetchLike, type MediaHubClient, type MediaResolverDeps } from '@main/media/resolver';

const ACCT = 'acct_05000000000000000000000000000000';
const ENTRY = { kind: 'ofapi' as const, accountId: ACCT, mediaId: '3000001', variant: 'thumb' as const };
const TOKEN = 'a'.repeat(64);

function answer(overrides: Partial<HubMediaResolveResponse>): HubMediaResolveResponse {
  return {
    resolveId: '00000000-0000-4000-8000-00000000000' + String(Math.floor(Math.random() * 9)),
    outcome: 'free_url', url: 'https://cdn2.onlyfans.com/files/a/aa/syn1/300x300_syn1.jpg?Expires=1&Signature=S',
    urlExpiresAt: null, contentLength: null, maxBytes: null, credits: 0, overCap: false, reason: null,
    retryAfterMs: null, retryAt: null, mediaType: 'photo', reread: null, replayed: false,
    ...overrides,
  } as HubMediaResolveResponse;
}

function bytesResponse(size: number, init: { status?: number; declared?: number | null; contentType?: string } = {}) {
  const chunk = new Uint8Array(size).fill(7);
  let sent = false;
  return {
    status: init.status ?? 200,
    ok: (init.status ?? 200) >= 200 && (init.status ?? 200) < 300,
    headers: {
      get: (name: string) => name === 'content-length'
        ? (init.declared === null ? null : String(init.declared ?? size))
        : name === 'content-type' ? (init.contentType ?? 'image/jpeg') : null,
    },
    body: {
      getReader: () => ({
        read: async () => {
          if (sent) return { done: true };
          sent = true;
          return { done: false, value: chunk };
        },
        cancel: async () => undefined,
      }),
    },
  };
}

function redirectResponse(location: string) {
  return {
    status: 302, ok: false,
    headers: { get: (name: string) => (name === 'location' ? location : null) },
    body: { getReader: () => ({ read: async () => ({ done: true }), cancel: async () => undefined }) },
  };
}

function harness(options: {
  answers?: Array<HubMediaResolveResponse | { unsupported: true } | Error>;
  fetchImpl?: MediaFetchLike;
  canServe?: boolean;
  reread?: MediaResolverDeps['reread'];
  cached?: boolean;
} = {}) {
  const requests: HubMediaResolveRequest[] = [];
  const queue = [...(options.answers ?? [])];
  const reports: MediaFetchReport[] = [];
  const reportBatches: MediaFetchReport[][] = [];
  const cache = new Map<string, { data: Buffer; contentType: string | null }>();
  if (options.cached) cache.set(TOKEN, { data: Buffer.from('cached'), contentType: 'image/jpeg' });
  const credits: Array<[string, number]> = [];
  const hub: MediaHubClient = {
    resolveMedia: vi.fn(async ({ request }) => {
      requests.push(request);
      const next = queue.shift();
      if (next === undefined) throw new Error('no answer queued');
      if (next instanceof Error) throw next;
      if ('unsupported' in next) return { kind: 'unsupported' as const };
      return { kind: 'resolved' as const, response: next };
    }),
    reportMediaFetches: vi.fn(async ({ reports: batch }) => {
      reportBatches.push(batch as MediaFetchReport[]);
      return { accepted: batch.length, duplicate: 0, unknown: 0 };
    }),
  };
  const fetchImpl = vi.fn(options.fetchImpl ?? (async () => bytesResponse(1000)));
  let seq = 0;
  const resolver = createMediaResolver({
    cache: {
      getByKey: async (key) => cache.get(key) ?? null,
      putByKey: async (key, data, contentType) => {
        cache.set(key, { data: Buffer.from(data), contentType });
      },
    },
    hub: async () => hub,
    canServe: () => options.canServe ?? true,
    reports: {
      enqueue: (report) => reports.push(report),
      next: (limit) => reports.slice(0, limit),
      remove: (ids) => {
        for (const id of ids) {
          const index = reports.findIndex((report) => report.resolveId === id);
          if (index >= 0) reports.splice(index, 1);
        }
      },
      noteAttempt: () => undefined,
    },
    ...(options.reread ? { reread: options.reread } : {}),
    recordCredits: (resolveId, amount) => credits.push([resolveId, amount]),
    fetchImpl,
    newRequestId: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
    sleep: async () => undefined,
  });
  return { resolver, hub, requests, reports, reportBatches, cache, credits, fetchImpl };
}

const auto = { trigger: 'auto' as const, surface: 'thread' as const };
const click = { trigger: 'click' as const, surface: 'lightbox' as const };

describe('media resolver — order of sources', () => {
  it('serves the local cache without asking Core', async () => {
    const h = harness({ cached: true });
    const result = await h.resolver.load(TOKEN, ENTRY, auto);
    expect(result.kind).toBe('bytes');
    expect(h.requests).toHaveLength(0);
    expect(h.fetchImpl).not.toHaveBeenCalled();
  });

  it('asks Core with ids only, downloads, caches, reports ok', async () => {
    const h = harness({ answers: [answer({ resolveId: '00000000-0000-4000-8000-0000000000f1' })] });
    const result = await h.resolver.load(TOKEN, ENTRY, auto);
    expect(result.kind).toBe('bytes');
    expect(h.requests[0]).toEqual({
      requestId: '00000000-0000-4000-8000-000000000001', accountId: ACCT, mediaId: '3000001',
      variant: 'thumb', surface: 'thread', trigger: 'auto',
    });
    expect(h.cache.has(TOKEN)).toBe(true);
    await h.resolver.flushReports();
    expect(h.reportBatches[0]).toEqual([
      { resolveId: '00000000-0000-4000-8000-0000000000f1', result: 'ok', bytesReceived: 1000, httpStatus: 200 },
    ]);
    expect(h.reports).toHaveLength(0);
    expect(h.resolver.state(TOKEN)).toEqual({ state: 'ready' });
  });

  it('never serves an account that is not granted to the signed-in identity', async () => {
    const h = harness({ canServe: false, answers: [answer({})] });
    expect(await h.resolver.load(TOKEN, ENTRY, auto)).toEqual({ kind: 'state', state: { state: 'unavailable' } });
    expect(h.requests).toHaveLength(0);
  });

  it('is quietly unavailable when Core has no media routes', async () => {
    const h = harness({ answers: [{ unsupported: true }] });
    expect(await h.resolver.load(TOKEN, ENTRY, auto)).toEqual({ kind: 'state', state: { state: 'unavailable' } });
  });
});

describe('media resolver — budget, pending, re-read', () => {
  it('latches cap_blocked for automatic loads until retryAt, a click still asks', async () => {
    const retryAt = new Date(Date.now() + 3_600_000).toISOString();
    const h = harness({
      answers: [
        answer({ outcome: 'cap_blocked', url: null, reason: 'daily_cap', retryAt }),
        answer({ outcome: 'paid', url: 'https://dl.fansapi.com/d/synthetic/300x300.jpg', credits: 1, maxBytes: 1000, contentLength: 1000, overCap: true, resolveId: '00000000-0000-4000-8000-0000000000c1' }),
      ],
    });
    expect(await h.resolver.load(TOKEN, ENTRY, auto)).toEqual({ kind: 'state', state: { state: 'load', reason: 'budget' } });
    // The latch: no second automatic resolve for this token.
    expect(await h.resolver.load(TOKEN, ENTRY, auto)).toEqual({ kind: 'state', state: { state: 'load', reason: 'budget' } });
    expect(h.requests).toHaveLength(1);
    const clicked = await h.resolver.load(TOKEN, ENTRY, click);
    expect(clicked.kind).toBe('bytes');
    expect(h.requests[1]?.trigger).toBe('click');
    expect(h.credits).toEqual([['00000000-0000-4000-8000-0000000000c1', 1]]);
  });

  it('size_unknown waits for a click without latching the day', async () => {
    const h = harness({ answers: [answer({ outcome: 'cap_blocked', url: null, reason: 'size_unknown' }), answer({ outcome: 'cap_blocked', url: null, reason: 'size_unknown' })] });
    expect(await h.resolver.load(TOKEN, ENTRY, auto)).toEqual({ kind: 'state', state: { state: 'load', reason: 'size' } });
    await h.resolver.load(TOKEN, ENTRY, auto);
    expect(h.requests).toHaveLength(2);
  });

  it('retries pending with a NEW requestId each time, at most three times', async () => {
    const pending = () => answer({ outcome: 'pending', url: null, reason: 'in_flight', retryAfterMs: 120_000 });
    const h = harness({ answers: [pending(), pending(), pending(), pending()] });
    expect(await h.resolver.load(TOKEN, ENTRY, auto)).toEqual({ kind: 'state', state: { state: 'load', reason: 'failed' } });
    expect(h.requests).toHaveLength(4);
    expect(new Set(h.requests.map((request) => request.requestId)).size).toBe(4);
  });

  it('re-reads what Core named once, only on a click, then asks again', async () => {
    const reread = vi.fn(async () => true);
    const expired = () => answer({ outcome: 'source_expired', url: null, reason: 'expired', reread: { kind: 'message', chatId: '1000005', messageId: '2000001' } });
    const h = harness({ reread, answers: [expired(), expired(), answer({})] });
    expect(await h.resolver.load(TOKEN, ENTRY, auto)).toEqual({ kind: 'state', state: { state: 'load', reason: 'expired' } });
    expect(reread).not.toHaveBeenCalled();
    const clicked = await h.resolver.load(TOKEN, ENTRY, click);
    expect(clicked.kind).toBe('bytes');
    expect(reread).toHaveBeenCalledWith(ACCT, { kind: 'message', chatId: '1000005', messageId: '2000001' });
    expect(h.requests.at(-1)).toMatchObject({ trigger: 'click', afterReread: true });
  });

  it('maps refusals to quiet states', async () => {
    const h = harness({ answers: [answer({ outcome: 'refused', url: null, reason: 'collection_off' }), answer({ outcome: 'refused', url: null, reason: 'not_ready' })] });
    expect(await h.resolver.load(TOKEN, ENTRY, auto)).toEqual({ kind: 'state', state: { state: 'unavailable' } });
    expect(await h.resolver.load('b'.repeat(64), ENTRY, auto)).toEqual({ kind: 'state', state: { state: 'processing' } });
  });
});

describe('media resolver — the download', () => {
  it('stops past the priced size (declared or streamed) and reports it', async () => {
    const h = harness({
      answers: [answer({ outcome: 'paid', url: 'https://dl.fansapi.com/d/x/1.jpg', maxBytes: 500, contentLength: 500, credits: 1, resolveId: '00000000-0000-4000-8000-0000000000d1' })],
      fetchImpl: async () => bytesResponse(1000, { declared: null }),
    });
    expect(await h.resolver.load(TOKEN, ENTRY, click)).toEqual({ kind: 'state', state: { state: 'load', reason: 'failed' } });
    expect(h.reports[0]).toMatchObject({ resolveId: '00000000-0000-4000-8000-0000000000d1', result: 'aborted_size' });
    expect(h.cache.has(TOKEN)).toBe(false);

    const declared = harness({
      answers: [answer({ outcome: 'paid', url: 'https://dl.fansapi.com/d/x/2.jpg', maxBytes: 500, contentLength: 500, credits: 1 })],
      fetchImpl: async () => bytesResponse(1000, { declared: 1000 }),
    });
    await declared.resolver.load(TOKEN, ENTRY, click);
    expect(declared.reports[0]).toMatchObject({ result: 'aborted_size', bytesReceived: 0 });
  });

  it('refuses a non-allowlisted URL and re-checks every redirect hop', async () => {
    const h = harness({
      answers: [answer({ url: 'https://evil.example.com/x.jpg' }), answer({ url: 'https://cdn.fansapi.com/of/cdn2/files/a.jpg' })],
      fetchImpl: async () => redirectResponse('http://cdn.fansapi.com/insecure.jpg'),
    });
    expect((await h.resolver.load(TOKEN, ENTRY, click)).kind).toBe('state');
    expect(h.fetchImpl).not.toHaveBeenCalled();
    expect((await h.resolver.load(TOKEN, ENTRY, click)).kind).toBe('state');
    expect(h.fetchImpl).toHaveBeenCalledTimes(1); // the http:// hop was never fetched
  });

  it('never retries a failed paid transfer automatically', async () => {
    const h = harness({
      answers: [answer({ outcome: 'paid', url: 'https://dl.fansapi.com/d/x/3.jpg', maxBytes: 1000, credits: 1 })],
      fetchImpl: async () => bytesResponse(10, { status: 500 }),
    });
    expect(await h.resolver.load(TOKEN, ENTRY, auto)).toEqual({ kind: 'state', state: { state: 'load', reason: 'failed' } });
    expect(h.requests).toHaveLength(1);
    expect(h.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('backs off automatic retries after three failures an hour', async () => {
    const h = harness({ answers: [new Error('down'), new Error('down'), new Error('down'), answer({})] });
    for (let i = 0; i < 3; i += 1) await h.resolver.load(TOKEN, ENTRY, auto);
    expect(await h.resolver.load(TOKEN, ENTRY, auto)).toEqual({ kind: 'state', state: { state: 'load', reason: 'failed' } });
    expect(h.requests).toHaveLength(3);
  });

  it('shares one in-flight load per token and runs at most four downloads at once', async () => {
    let active = 0;
    let peak = 0;
    const release: Array<() => void> = [];
    const answers = Array.from({ length: 6 }, (_, i) => answer({ resolveId: `00000000-0000-4000-8000-00000000010${i}` }));
    const h = harness({
      answers,
      fetchImpl: async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise<void>((resolve) => release.push(resolve));
        active -= 1;
        return bytesResponse(10);
      },
    });
    const tokens = Array.from({ length: 6 }, (_, i) => String(i).repeat(64));
    const loads = tokens.map((token) => h.resolver.load(token, { ...ENTRY, mediaId: `30000${tokens.indexOf(token)}` }, auto));
    const duplicate = h.resolver.load(tokens[0]!, ENTRY, auto);
    for (let round = 0; round < 20 && release.length < 4; round += 1) await Promise.resolve();
    expect(peak).toBeLessThanOrEqual(4);
    while (release.length > 0 || active > 0) {
      release.shift()?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await Promise.all([...loads, duplicate]);
    expect(peak).toBe(4);
    expect(h.requests).toHaveLength(6); // the duplicate shared the first load
  });
});
