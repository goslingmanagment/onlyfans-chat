// D42: the desktop half of the media contract — order of sources (local cache
// → Core resolve → the desktop's own download), the per-token budget latch,
// pending retries with fresh requestIds, the click-only re-read, the priced
// size limit, the host allowlist on every hop, no automatic retry of a paid
// transfer, durable idempotent reports and credits from Core's answer.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { HubError, type HubMediaResolveRequest, type HubMediaResolveResponse } from '@chatgoose/shared/hub/index';
import type { MediaFetchReport } from '@main/db/index';
import {
  createMediaResolver,
  MEDIA_NEGATIVE_TTL_MS,
  MEDIA_NOT_READY_TTL_MS,
  MEDIA_REPORT_MAX_ATTEMPTS,
  nextUtcMidnight,
  settledUnknownSizeCredits,
  type MediaFetchLike,
  type MediaHubClient,
  type MediaResolverDeps,
} from '@main/media/resolver';

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

type QueuedAnswer =
  | HubMediaResolveResponse
  | { unsupported: true }
  | { throttled: number | null }
  | Error;

function harness(options: {
  answers?: QueuedAnswer[];
  fetchImpl?: MediaFetchLike;
  canServe?: boolean;
  reread?: MediaResolverDeps['reread'];
  cached?: boolean;
  /** Resolve calls wait for this before answering (to keep loads in flight). */
  gate?: Promise<void>;
  hubNull?: boolean;
  reportFails?: boolean;
  maxConcurrent?: number;
} = {}) {
  const requests: HubMediaResolveRequest[] = [];
  const queue = [...(options.answers ?? [])];
  const reports: Array<MediaFetchReport & { attempts: number }> = [];
  const reportBatches: MediaFetchReport[][] = [];
  const cache = new Map<string, { data: Buffer; contentType: string | null }>();
  if (options.cached) cache.set(TOKEN, { data: Buffer.from('cached'), contentType: 'image/jpeg' });
  const credits: Array<[string, number]> = [];
  const logs: string[] = [];
  const clock = { now: Date.parse('2026-09-27T12:00:00Z') };
  const hubState = { available: options.hubNull !== true };
  const hub: MediaHubClient = {
    resolveMedia: vi.fn(async ({ request }) => {
      requests.push(request);
      if (options.gate) await options.gate;
      const next = queue.shift();
      if (next === undefined) throw new Error('no answer queued');
      if (next instanceof Error) throw next;
      if ('unsupported' in next) return { kind: 'unsupported' as const };
      if ('throttled' in next) return { kind: 'throttled' as const, retryAfterMs: next.throttled };
      return { kind: 'resolved' as const, response: next };
    }),
    reportMediaFetches: vi.fn(async ({ reports: batch }) => {
      if (options.reportFails) throw new Error('reports down');
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
    hub: async () => (hubState.available ? hub : null),
    canServe: () => options.canServe ?? true,
    reports: {
      enqueue: (report) => {
        if (!reports.some((row) => row.resolveId === report.resolveId)) reports.push({ ...report, attempts: 0 });
      },
      next: (limit) => reports.slice(0, limit).map(({ attempts: _attempts, ...report }) => report),
      remove: (ids) => {
        for (const id of ids) {
          const index = reports.findIndex((report) => report.resolveId === id);
          if (index >= 0) reports.splice(index, 1);
        }
      },
      noteAttempt: (ids) => {
        for (const row of reports) if (ids.includes(row.resolveId)) row.attempts += 1;
      },
      dropExhausted: (max) => {
        const before = reports.length;
        for (let i = reports.length - 1; i >= 0; i -= 1) if (reports[i]!.attempts >= max) reports.splice(i, 1);
        return before - reports.length;
      },
    },
    ...(options.reread ? { reread: options.reread } : {}),
    recordCredits: (resolveId, amount) => credits.push([resolveId, amount]),
    fetchImpl,
    now: () => clock.now,
    newRequestId: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
    sleep: async () => undefined,
    onLog: (_level, message) => logs.push(message),
    ...(options.maxConcurrent !== undefined ? { maxConcurrent: options.maxConcurrent } : {}),
  });
  return { resolver, hub, hubState, requests, reports, reportBatches, cache, credits, fetchImpl, clock, logs };
}

afterEach(() => {
  vi.useRealTimers();
});

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

  it('size_unknown waits for a click; automatic loads do not ask again for a while (D4)', async () => {
    const h = harness({ answers: [
      answer({ outcome: 'cap_blocked', url: null, reason: 'size_unknown' }),
      answer({ outcome: 'cap_blocked', url: null, reason: 'size_unknown' }),
    ] });
    expect(await h.resolver.load(TOKEN, ENTRY, auto)).toEqual({ kind: 'state', state: { state: 'load', reason: 'size' } });
    expect(await h.resolver.load(TOKEN, ENTRY, auto)).toEqual({ kind: 'state', state: { state: 'load', reason: 'size' } });
    expect(h.requests).toHaveLength(1);
    h.clock.now += MEDIA_NEGATIVE_TTL_MS + 1;
    await h.resolver.load(TOKEN, ENTRY, auto);
    expect(h.requests).toHaveLength(2);
  });

  it('H7: full size answered «click only» latches automatic loads until midnight; a click passes', async () => {
    const full = { ...ENTRY, variant: 'full' as const };
    const h = harness({ answers: [
      answer({ outcome: 'cap_blocked', url: null, reason: 'click_only' }),
      answer({ outcome: 'free_url' }),
    ] });
    expect(await h.resolver.load(TOKEN, full, auto)).toEqual({ kind: 'state', state: { state: 'load', reason: 'click' } });
    h.clock.now += 3_600_000;
    expect(await h.resolver.load(TOKEN, full, auto)).toEqual({ kind: 'state', state: { state: 'load', reason: 'click' } });
    expect(h.requests).toHaveLength(1);
    expect((await h.resolver.load(TOKEN, full, click)).kind).toBe('bytes');
    expect(h.requests[1]).toMatchObject({ trigger: 'click', variant: 'full' });
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
    const h = harness({ answers: [
      answer({ outcome: 'refused', url: null, reason: 'collection_off' }),
      answer({ outcome: 'refused', url: null, reason: 'not_ready' }),
      answer({ outcome: 'refused', url: null, reason: 'not_ready', reread: { kind: 'vault', mediaId: '3000001' } }),
    ] });
    expect(await h.resolver.load(TOKEN, ENTRY, auto)).toEqual({ kind: 'state', state: { state: 'unavailable' } });
    expect(await h.resolver.load('b'.repeat(64), ENTRY, auto)).toEqual({ kind: 'state', state: { state: 'processing', refresh: false } });
    expect(await h.resolver.load('c'.repeat(64), ENTRY, auto)).toEqual({ kind: 'state', state: { state: 'processing', refresh: true } });
  });

  it('H3: a click on a file still processing re-reads what Core named once, then asks again — never automatically', async () => {
    const reread = vi.fn(async () => true);
    const notReady = () => answer({ outcome: 'refused', url: null, reason: 'not_ready', reread: { kind: 'message', chatId: '1000005', messageId: '2000001' } });
    const h = harness({ reread, answers: [notReady(), notReady(), answer({})] });
    expect(await h.resolver.load(TOKEN, ENTRY, auto)).toEqual({ kind: 'state', state: { state: 'processing', refresh: true } });
    expect(reread).not.toHaveBeenCalled();
    const clicked = await h.resolver.load(TOKEN, ENTRY, click);
    expect(clicked.kind).toBe('bytes');
    expect(reread).toHaveBeenCalledTimes(1);
    expect(h.requests.map((request) => [request.trigger, request.afterReread ?? false])).toEqual([
      ['auto', false], ['click', false], ['click', true],
    ]);
  });

  it('H3: still processing after the re-read stays refreshable; automatic loads pause only briefly', async () => {
    const reread = vi.fn(async () => true);
    const notReady = () => answer({ outcome: 'refused', url: null, reason: 'not_ready', reread: { kind: 'message', chatId: '1000005', messageId: '2000001' } });
    const h = harness({ reread, answers: [notReady(), notReady(), notReady()] });
    expect(await h.resolver.load(TOKEN, ENTRY, click)).toEqual({ kind: 'state', state: { state: 'processing', refresh: true } });
    expect(reread).toHaveBeenCalledTimes(1); // one re-read per click, no loop
    expect(await h.resolver.load(TOKEN, ENTRY, auto)).toEqual({ kind: 'state', state: { state: 'processing', refresh: true } });
    expect(h.requests).toHaveLength(2);
    h.clock.now += MEDIA_NOT_READY_TTL_MS + 1;
    await h.resolver.load(TOKEN, ENTRY, auto);
    expect(h.requests).toHaveLength(3);
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

describe('media resolver — review round 1 (D1, D3–D6, D8, H2)', () => {
  const PAID_URL = 'https://dl.fansapi.com/d/synthetic/300x300_paid.jpg';

  it('D1: a failed paid transfer latches automatic loads until the next UTC midnight — exactly one paid resolve', async () => {
    const h = harness({
      answers: [answer({ outcome: 'paid', url: PAID_URL, maxBytes: 1000, contentLength: 1000, credits: 1 }), answer({})],
      fetchImpl: async () => bytesResponse(10, { status: 503 }),
    });
    expect(await h.resolver.load(TOKEN, ENTRY, auto)).toEqual({ kind: 'state', state: { state: 'load', reason: 'failed' } });
    expect(await h.resolver.load(TOKEN, ENTRY, auto)).toEqual({ kind: 'state', state: { state: 'load', reason: 'failed' } });
    expect(h.requests).toHaveLength(1);
    expect(h.requests.filter((request) => request.trigger === 'auto')).toHaveLength(1);
    // Still latched an hour later; the next UTC day asks again.
    h.clock.now += 3_600_000;
    await h.resolver.load(TOKEN, ENTRY, auto);
    expect(h.requests).toHaveLength(1);
    h.clock.now = nextUtcMidnight(h.clock.now) + 1;
    await h.resolver.load(TOKEN, ENTRY, auto);
    expect(h.requests).toHaveLength(2);
  });

  it('D1: a paid answer without a URL (a replay whose hand-out expired) latches too; a click asks again', async () => {
    const h = harness({
      answers: [
        answer({ outcome: 'paid', url: null, credits: 1, contentLength: 1000, maxBytes: 1000, replayed: true }),
        answer({}),
      ],
    });
    expect(await h.resolver.load(TOKEN, ENTRY, auto)).toEqual({ kind: 'state', state: { state: 'load', reason: 'failed' } });
    expect(await h.resolver.load(TOKEN, ENTRY, auto)).toEqual({ kind: 'state', state: { state: 'load', reason: 'failed' } });
    expect(h.requests).toHaveLength(1);
    expect((await h.resolver.load(TOKEN, ENTRY, click)).kind).toBe('bytes');
    expect(h.requests).toHaveLength(2);
  });

  it('D3: a timeout is retried once with the SAME requestId; a second one is a failure', async () => {
    const h = harness({ answers: [new HubError('timeout'), answer({ resolveId: '00000000-0000-4000-8000-0000000000e1' })] });
    expect((await h.resolver.load(TOKEN, ENTRY, auto)).kind).toBe('bytes');
    expect(h.requests).toHaveLength(2);
    expect(h.requests[0]?.requestId).toBe(h.requests[1]?.requestId);

    const twice = harness({ answers: [new HubError('network'), new HubError('timeout')] });
    expect(await twice.resolver.load(TOKEN, ENTRY, auto)).toEqual({ kind: 'state', state: { state: 'load', reason: 'failed' } });
    expect(twice.requests).toHaveLength(2);
    expect(new Set(twice.requests.map((request) => request.requestId)).size).toBe(1);
  });

  it('D3: a refusal that is not transport (HTTP 409 on a mismatched replay) is not retried', async () => {
    const h = harness({ answers: [new HubError('http', { detail: { status: 409 } })] });
    expect(await h.resolver.load(TOKEN, ENTRY, auto)).toEqual({ kind: 'state', state: { state: 'load', reason: 'failed' } });
    expect(h.requests).toHaveLength(1);
  });

  it('D4: quiet answers are remembered for automatic loads; a click bypasses them', async () => {
    const h = harness({ answers: [
      answer({ outcome: 'unavailable', url: null, reason: 'not_found' }),
      answer({ outcome: 'free_url' }),
    ] });
    expect(await h.resolver.load(TOKEN, ENTRY, auto)).toEqual({ kind: 'state', state: { state: 'unavailable' } });
    for (let i = 0; i < 5; i += 1) await h.resolver.load(TOKEN, ENTRY, auto);
    expect(h.requests).toHaveLength(1);
    expect((await h.resolver.load(TOKEN, ENTRY, click)).kind).toBe('bytes');
    expect(h.requests).toHaveLength(2);
  });

  it('D4: source_expired (auto) and exhausted in-flight pending are remembered too', async () => {
    const pending = () => answer({ outcome: 'pending', url: null, reason: 'in_flight', retryAfterMs: 1_000 });
    const h = harness({ answers: [
      answer({ outcome: 'source_expired', url: null, reason: 'expired' }),
      pending(), pending(), pending(), pending(),
    ] });
    expect(await h.resolver.load(TOKEN, ENTRY, auto)).toEqual({ kind: 'state', state: { state: 'load', reason: 'expired' } });
    await h.resolver.load(TOKEN, ENTRY, auto);
    expect(h.requests).toHaveLength(1);
    const other = 'b'.repeat(64);
    expect(await h.resolver.load(other, ENTRY, auto)).toEqual({ kind: 'state', state: { state: 'load', reason: 'failed' } });
    await h.resolver.load(other, ENTRY, auto);
    expect(h.requests).toHaveLength(5);
  });

  it('D4: a Core without the media routes is remembered for the session (per account), clicks included', async () => {
    const h = harness({ answers: [{ unsupported: true }, answer({})] });
    expect(await h.resolver.load(TOKEN, ENTRY, auto)).toEqual({ kind: 'state', state: { state: 'unavailable' } });
    expect(await h.resolver.load('b'.repeat(64), { ...ENTRY, mediaId: '3000002' }, auto)).toEqual({ kind: 'state', state: { state: 'unavailable' } });
    expect(await h.resolver.load(TOKEN, ENTRY, click)).toEqual({ kind: 'state', state: { state: 'unavailable' } });
    h.clock.now += 24 * 3_600_000;
    await h.resolver.load(TOKEN, ENTRY, auto);
    expect(h.requests).toHaveLength(1);
  });

  it('D4: a rate-limited device waits quietly (never «Загрузить») — every token, until Retry-After', async () => {
    const h = harness({ answers: [{ throttled: 42_000 }, answer({})] });
    expect(await h.resolver.load(TOKEN, ENTRY, auto)).toEqual({ kind: 'state', state: { state: 'wait', retryAfterMs: 42_000 } });
    expect(h.resolver.state(TOKEN)).toEqual({ state: 'wait', retryAfterMs: 42_000 });
    h.clock.now += 2_000;
    expect(await h.resolver.load('b'.repeat(64), ENTRY, auto)).toEqual({ kind: 'state', state: { state: 'wait', retryAfterMs: 40_000 } });
    expect(h.resolver.state(TOKEN)).toEqual({ state: 'wait', retryAfterMs: 40_000 });
    expect(h.requests).toHaveLength(1);
    h.clock.now += 40_001;
    expect((await h.resolver.load(TOKEN, ENTRY, auto)).kind).toBe('bytes');
    expect(h.requests).toHaveLength(2);
  });

  it('D4: Core busy after every pending retry is a quiet wait, not a failure', async () => {
    const busy = () => answer({ outcome: 'pending', url: null, reason: 'busy', retryAfterMs: 2_000 });
    const h = harness({ answers: [busy(), busy(), busy(), busy()] });
    const result = await h.resolver.load(TOKEN, ENTRY, auto);
    expect(result).toEqual({ kind: 'state', state: { state: 'wait', retryAfterMs: 30_000 } });
    await h.resolver.load(TOKEN, ENTRY, auto);
    expect(h.requests).toHaveLength(4);
  });

  it('D5: an automatic load waiting for a slot is cancelled before it asks Core; a click jumps the queue', async () => {
    let open: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const h = harness({ gate, maxConcurrent: 1, answers: [answer({ resolveId: '00000000-0000-4000-8000-0000000000a1' }), answer({ resolveId: '00000000-0000-4000-8000-0000000000a2' }), answer({ resolveId: '00000000-0000-4000-8000-0000000000a3' })] });
    const first = h.resolver.load('1'.repeat(64), { ...ENTRY, mediaId: '1' }, auto);
    const queuedAuto = h.resolver.load('2'.repeat(64), { ...ENTRY, mediaId: '2' }, auto);
    const queuedClick = h.resolver.load('3'.repeat(64), { ...ENTRY, mediaId: '3' }, click);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.resolver.cancel('2'.repeat(64))).toBe(true);
    expect(await queuedAuto).toEqual({ kind: 'state', state: { state: 'idle' } });
    expect(h.resolver.cancel('1'.repeat(64))).toBe(false); // already started: it runs to the end
    open();
    await Promise.all([first, queuedClick]);
    expect(h.requests.map((request) => request.mediaId)).toEqual(['1', '3']);
  });

  it('D5: the protocol request abort signal cancels an unstarted automatic load', async () => {
    let open: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const h = harness({ gate, maxConcurrent: 1, answers: [answer({}), answer({})] });
    const first = h.resolver.load('1'.repeat(64), { ...ENTRY, mediaId: '1' }, auto);
    const controller = new AbortController();
    const second = h.resolver.load('2'.repeat(64), { ...ENTRY, mediaId: '2' }, { ...auto, signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    expect(await second).toEqual({ kind: 'state', state: { state: 'idle' } });
    open();
    await first;
    expect(h.requests).toHaveLength(1);
  });

  it('D8: only image bytes are cached — an HTML page with 200 is a failure (and a paid one latches)', async () => {
    const html = harness({
      answers: [answer({ resolveId: '00000000-0000-4000-8000-0000000000b1' })],
      fetchImpl: async () => bytesResponse(500, { contentType: 'text/html; charset=utf-8' }),
    });
    expect(await html.resolver.load(TOKEN, ENTRY, auto)).toEqual({ kind: 'state', state: { state: 'load', reason: 'failed' } });
    expect(html.cache.has(TOKEN)).toBe(false);
    expect(html.reports[0]).toMatchObject({ resolveId: '00000000-0000-4000-8000-0000000000b1', result: 'failed', httpStatus: 200 });

    const paid = harness({
      answers: [answer({ outcome: 'paid', url: PAID_URL, maxBytes: 1000, contentLength: 1000, credits: 1 })],
      fetchImpl: async () => bytesResponse(500, { contentType: 'text/html' }),
    });
    await paid.resolver.load(TOKEN, ENTRY, auto);
    await paid.resolver.load(TOKEN, ENTRY, auto);
    expect(paid.requests).toHaveLength(1);
  });

  it('H2: an unknown-size paid transfer is metered by the bytes it moved; a priced one by Core\'s credits', async () => {
    const unknown = harness({
      answers: [answer({ outcome: 'paid', url: PAID_URL, contentLength: null, maxBytes: 5_000_000, credits: 15, resolveId: '00000000-0000-4000-8000-0000000000c2' })],
      fetchImpl: async () => bytesResponse(1_200_000, { declared: null }),
    });
    expect((await unknown.resolver.load(TOKEN, ENTRY, click)).kind).toBe('bytes');
    expect(unknown.credits).toEqual([['00000000-0000-4000-8000-0000000000c2', settledUnknownSizeCredits(1_200_000)]]);
    expect(settledUnknownSizeCredits(1_200_000)).toBe(4);
    expect(settledUnknownSizeCredits(0)).toBe(1);

    const priced = harness({
      answers: [answer({ outcome: 'paid', url: PAID_URL, contentLength: 1000, maxBytes: 1000, credits: 1, resolveId: '00000000-0000-4000-8000-0000000000c3' })],
    });
    await priced.resolver.load(TOKEN, ENTRY, click);
    expect(priced.credits).toEqual([['00000000-0000-4000-8000-0000000000c3', 1]]);
  });

  it('D6: no hub at startup schedules another flush; the queued reports go out once it is there', async () => {
    vi.useFakeTimers();
    const h = harness({ hubNull: true });
    h.reports.push({ resolveId: '00000000-0000-4000-8000-0000000000d9', result: 'ok', bytesReceived: 1, httpStatus: 200, attempts: 0 });
    await h.resolver.flushReports();
    expect(h.reports).toHaveLength(1);
    h.hubState.available = true; // signed in meanwhile
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.reportBatches).toEqual([[{ resolveId: '00000000-0000-4000-8000-0000000000d9', result: 'ok', bytesReceived: 1, httpStatus: 200 }]]);
    expect(h.reports).toHaveLength(0);
    h.resolver.dispose();
  });

  it('D6: a pending 60 s retry never delays the 2 s flush of new reports; a refused batch is dropped after N attempts', async () => {
    vi.useFakeTimers();
    const h = harness({ reportFails: true, answers: [answer({ resolveId: '00000000-0000-4000-8000-0000000000f7' })] });
    h.reports.push({ resolveId: '00000000-0000-4000-8000-0000000000f6', result: 'ok', bytesReceived: 1, httpStatus: 200, attempts: 0 });
    await h.resolver.flushReports(); // fails → 60 s retry scheduled
    expect(h.hub.reportMediaFetches).toHaveBeenCalledTimes(1);
    await h.resolver.load(TOKEN, ENTRY, auto); // a new report → a 2 s flush
    await vi.advanceTimersByTimeAsync(2_100);
    expect(h.hub.reportMediaFetches).toHaveBeenCalledTimes(2);
    for (let i = 0; i < MEDIA_REPORT_MAX_ATTEMPTS; i += 1) await h.resolver.flushReports();
    expect(h.reports).toHaveLength(0);
    expect(h.logs).toContain('media reports dropped after repeated refusals');
    h.resolver.dispose();
  });
});
