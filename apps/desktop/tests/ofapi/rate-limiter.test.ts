// Token-bucket timing (fake timers), concurrency gates, and the explicit retry
// policy (SPEC §5: 'idempotent' = backoff 1/2/4/8 s honoring retry-after, 5xx ≤3
// retries — GETs only; 'none' = exactly one attempt for non-idempotent sends, SPEC §7).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRateLimiter,
  createRequestExecutor,
  RATE_LIMIT_BACKOFF_MS,
  RETRY_AFTER_CAP_MS,
  SERVER_ERROR_RETRY_DELAYS_MS,
} from '@main/ofapi/rate-limiter';
import type { RetryableResponse } from '@main/ofapi/rate-limiter';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function fakeResponse(
  status: number,
  headers: Record<string, string> = {},
  overrides: Partial<RetryableResponse> = {},
): RetryableResponse {
  return {
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    ...overrides,
  };
}

describe('token bucket (fake timers)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('serves the burst immediately, then refills at the RPM rate', async () => {
    const limiter = createRateLimiter({ rpm: 60, burst: 2 }); // 1 token/s
    const completed: number[] = [];
    const start = Date.now();
    const tasks = Promise.all(
      [0, 1, 2, 3].map((i) =>
        limiter.run('acct', async () => {
          completed.push(Date.now() - start);
          return i;
        }),
      ),
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(completed).toHaveLength(2); // burst

    await vi.advanceTimersByTimeAsync(1000);
    expect(completed).toHaveLength(3);

    await vi.advanceTimersByTimeAsync(1000);
    expect(completed).toHaveLength(4);
    await tasks;
    expect(completed[2]).toBeGreaterThanOrEqual(1000);
    expect(completed[3]).toBeGreaterThanOrEqual(2000);
  });

  it('default config: burst 20 under 300 RPM', async () => {
    const limiter = createRateLimiter();
    const completed: number[] = [];
    const all = Promise.all(
      Array.from({ length: 21 }, () => limiter.run('acct', async () => completed.push(1))),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(completed).toHaveLength(20);
    await vi.advanceTimersByTimeAsync(200); // 300 RPM = one token / 200 ms
    expect(completed).toHaveLength(21);
    await all;
  });
});

describe('concurrency gates', () => {
  it('caps in-flight requests per account (default 4)', async () => {
    const limiter = createRateLimiter({ rpm: 1_000_000, burst: 1_000_000 });
    let active = 0;
    let maxActive = 0;
    const gate = deferred();
    const tasks = Array.from({ length: 8 }, () =>
      limiter.run('acct', async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await gate.promise;
        active -= 1;
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(maxActive).toBe(4);
    gate.resolve();
    await Promise.all(tasks);
    expect(maxActive).toBe(4);
  });

  it('caps global in-flight requests across accounts (default 12)', async () => {
    const limiter = createRateLimiter({ rpm: 1_000_000, burst: 1_000_000 });
    let active = 0;
    let maxActive = 0;
    const gate = deferred();
    const tasks = Array.from({ length: 20 }, (_, i) =>
      limiter.run(`acct-${i % 5}`, async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await gate.promise;
        active -= 1;
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(maxActive).toBe(12);
    gate.resolve();
    await Promise.all(tasks);
    expect(maxActive).toBe(12);
  });

  it('releases slots so queued tasks eventually run', async () => {
    const limiter = createRateLimiter({
      rpm: 1_000_000,
      burst: 1_000_000,
      perAccountConcurrency: 1,
      globalConcurrency: 1,
    });
    const order: number[] = [];
    await Promise.all([
      limiter.run('a', async () => {
        order.push(1);
      }),
      limiter.run('a', async () => {
        order.push(2);
      }),
      limiter.run('b', async () => {
        order.push(3);
      }),
    ]);
    expect(order).toEqual([1, 2, 3]);
  });
});

describe('request executor retry policy: idempotent', () => {
  const passthroughLimiter = { run: <T>(_key: string, task: () => Promise<T>) => task() };

  it('429: waits max(backoff, retry-after) and retries until success', async () => {
    const sleeps: number[] = [];
    const executor = createRequestExecutor({
      limiter: passthroughLimiter,
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    });
    const responses = [
      fakeResponse(429, { 'retry-after': '2' }),
      fakeResponse(429),
      fakeResponse(200),
    ];
    let call = 0;
    const result = await executor.execute(
      'acct',
      () => Promise.resolve(responses[call++] ?? fakeResponse(200)),
      { retry: 'idempotent' },
    );
    expect(result.status).toBe(200);
    expect(call).toBe(3);
    // attempt 1: max(1000, 2000) = 2000; attempt 2: max(2000, 0) = 2000
    expect(sleeps).toEqual([2000, 2000]);
  });

  it('429: gives up after the 1/2/4/8 s ladder and returns the 429', async () => {
    const sleeps: number[] = [];
    const executor = createRequestExecutor({
      limiter: passthroughLimiter,
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    });
    let calls = 0;
    const result = await executor.execute(
      'acct',
      () => {
        calls += 1;
        return Promise.resolve(fakeResponse(429));
      },
      { retry: 'idempotent' },
    );
    expect(result.status).toBe(429);
    expect(calls).toBe(1 + RATE_LIMIT_BACKOFF_MS.length);
    expect(sleeps).toEqual([...RATE_LIMIT_BACKOFF_MS]);
  });

  it('429: caps an oversized retry-after header', async () => {
    const sleeps: number[] = [];
    const observedRetryDelays: number[] = [];
    const executor = createRequestExecutor({
      limiter: passthroughLimiter,
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    });
    const responses = [
      fakeResponse(429, { 'retry-after': '3600' }),
      fakeResponse(200),
    ];
    let call = 0;
    const result = await executor.execute(
      'acct',
      () => Promise.resolve(responses[call++] ?? fakeResponse(200)),
      {
        retry: 'idempotent',
        onAttemptResponse: (event) => {
          if (event.retryDelayMs !== undefined) {
            observedRetryDelays.push(event.retryDelayMs);
          }
        },
      },
    );
    expect(result.status).toBe(200);
    expect(sleeps).toEqual([RETRY_AFTER_CAP_MS]);
    expect(observedRetryDelays).toEqual([RETRY_AFTER_CAP_MS]);
  });

  it('drains retry response bodies before the next attempt', async () => {
    const drained: number[] = [];
    const executor = createRequestExecutor({
      limiter: passthroughLimiter,
      sleep: () => Promise.resolve(),
    });
    const responses = [
      fakeResponse(500, {}, { arrayBuffer: async () => {
        drained.push(500);
        return new ArrayBuffer(0);
      } }),
      fakeResponse(429, { 'retry-after': '1' }, { arrayBuffer: async () => {
        drained.push(429);
        return new ArrayBuffer(0);
      } }),
      fakeResponse(200, {}, { arrayBuffer: async () => {
        drained.push(200);
        return new ArrayBuffer(0);
      } }),
    ];
    let call = 0;

    const result = await executor.execute(
      'acct',
      () => Promise.resolve(responses[call++] ?? fakeResponse(200)),
      { retry: 'idempotent' },
    );

    expect(result.status).toBe(200);
    expect(drained).toEqual([500, 429]);
  });

  it('5xx: retries up to 3 times (idempotent GETs) then returns the error', async () => {
    const sleeps: number[] = [];
    const executor = createRequestExecutor({
      limiter: passthroughLimiter,
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    });
    let calls = 0;
    const result = await executor.execute(
      'acct',
      () => {
        calls += 1;
        return Promise.resolve(fakeResponse(502));
      },
      { retry: 'idempotent' },
    );
    expect(result.status).toBe(502);
    expect(calls).toBe(1 + SERVER_ERROR_RETRY_DELAYS_MS.length);
    expect(sleeps).toEqual([...SERVER_ERROR_RETRY_DELAYS_MS]);
  });

  it('5xx then success: stops retrying once a response is good', async () => {
    const executor = createRequestExecutor({ limiter: passthroughLimiter, sleep: () => Promise.resolve() });
    const responses = [fakeResponse(500), fakeResponse(500), fakeResponse(200)];
    let call = 0;
    const result = await executor.execute(
      'acct',
      () => Promise.resolve(responses[call++] ?? fakeResponse(200)),
      { retry: 'idempotent' },
    );
    expect(result.status).toBe(200);
    expect(call).toBe(3);
  });

  it('definitive 4xx responses are returned without retry', async () => {
    const executor = createRequestExecutor({ limiter: passthroughLimiter, sleep: () => Promise.resolve() });
    let calls = 0;
    const result = await executor.execute(
      'acct',
      () => {
        calls += 1;
        return Promise.resolve(fakeResponse(404));
      },
      { retry: 'idempotent' },
    );
    expect(result.status).toBe(404);
    expect(calls).toBe(1);
  });
});

describe("request executor retry policy: none (non-idempotent sends, SPEC §7)", () => {
  const passthroughLimiter = { run: <T>(_key: string, task: () => Promise<T>) => task() };

  function trackingExecutor(): {
    executor: ReturnType<typeof createRequestExecutor>;
    sleeps: number[];
  } {
    const sleeps: number[] = [];
    const executor = createRequestExecutor({
      limiter: passthroughLimiter,
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    });
    return { executor, sleeps };
  }

  it('5xx: exactly one attempt, no sleep, response surfaces as-is', async () => {
    const { executor, sleeps } = trackingExecutor();
    let calls = 0;
    const result = await executor.execute(
      'acct',
      () => {
        calls += 1;
        return Promise.resolve(fakeResponse(500));
      },
      { retry: 'none' },
    );
    expect(result.status).toBe(500);
    expect(calls).toBe(1);
    expect(sleeps).toEqual([]);
  });

  it('429: exactly one attempt even with retry-after present', async () => {
    const { executor, sleeps } = trackingExecutor();
    let calls = 0;
    const result = await executor.execute(
      'acct',
      () => {
        calls += 1;
        return Promise.resolve(fakeResponse(429, { 'retry-after': '1' }));
      },
      { retry: 'none' },
    );
    expect(result.status).toBe(429);
    expect(calls).toBe(1);
    expect(sleeps).toEqual([]);
  });

  it('timeout rejection: exactly one attempt, error propagates', async () => {
    const { executor, sleeps } = trackingExecutor();
    let calls = 0;
    const timeout = new Error('timed out');
    timeout.name = 'TimeoutError';
    await expect(
      executor.execute(
        'acct',
        () => {
          calls += 1;
          return Promise.reject(timeout);
        },
        { retry: 'none' },
      ),
    ).rejects.toBe(timeout);
    expect(calls).toBe(1);
    expect(sleeps).toEqual([]);
  });

  it('still flows through the rate limiter', async () => {
    const ran: string[] = [];
    const limiter = {
      run<T>(key: string, task: () => Promise<T>): Promise<T> {
        ran.push(key);
        return task();
      },
    };
    const executor = createRequestExecutor({ limiter, sleep: () => Promise.resolve() });
    await executor.execute('acct-send', () => Promise.resolve(fakeResponse(200)), {
      retry: 'none',
    });
    expect(ran).toEqual(['acct-send']);
  });
});
