// Client-side throttling for OFAPI (SPEC §5): token bucket well under plan RPM
// (default 300 RPM, burst 20), per-account concurrency 4, global 12. Retry policy
// is EXPLICIT and REQUIRED per request: 'idempotent' (GETs) gets 429 backoff
// honoring retry-after (1/2/4/8 s) and ≤3 retries on 5xx; 'none' (non-idempotent
// writes, SPEC §7 — OFAPI has no idempotency keys, a retried send can
// double-message a fan) gets EXACTLY ONE attempt: 429/5xx/timeouts surface
// immediately and the outbox decides what is safe.

import { parseRetryAfterMs } from './errors';

export type SleepFn = (ms: number) => Promise<void>;

const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const DEFAULT_RPM = 300;
export const DEFAULT_BURST = 20;
export const DEFAULT_PER_ACCOUNT_CONCURRENCY = 4;
export const DEFAULT_GLOBAL_CONCURRENCY = 12;
export const RATE_LIMIT_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000] as const;
export const SERVER_ERROR_RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;

export interface RateLimiterOptions {
  rpm?: number;
  burst?: number;
  perAccountConcurrency?: number;
  globalConcurrency?: number;
  now?: () => number;
  sleep?: SleepFn;
}

export interface RateLimiter {
  run<T>(accountKey: string, task: () => Promise<T>): Promise<T>;
}

interface Semaphore {
  acquire(): Promise<void>;
  release(): void;
}

function createSemaphore(limit: number): Semaphore {
  let active = 0;
  const waiters: Array<() => void> = [];
  return {
    acquire(): Promise<void> {
      if (active < limit) {
        active += 1;
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        waiters.push(resolve);
      });
    },
    release(): void {
      const next = waiters.shift();
      if (next) {
        // Hand the slot directly to the next waiter; `active` stays constant.
        next();
      } else {
        active -= 1;
      }
    },
  };
}

export function createRateLimiter(options: RateLimiterOptions = {}): RateLimiter {
  const rpm = options.rpm ?? DEFAULT_RPM;
  const burst = options.burst ?? DEFAULT_BURST;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const globalGate = createSemaphore(options.globalConcurrency ?? DEFAULT_GLOBAL_CONCURRENCY);
  const perAccountLimit = options.perAccountConcurrency ?? DEFAULT_PER_ACCOUNT_CONCURRENCY;
  const accountGates = new Map<string, Semaphore>();

  let tokens = burst;
  let lastRefillAt = now();

  // Reserves one token; negative balance queues subsequent callers behind each other.
  function reserveDelayMs(): number {
    const t = now();
    tokens = Math.min(burst, tokens + ((t - lastRefillAt) * rpm) / 60_000);
    lastRefillAt = t;
    tokens -= 1;
    if (tokens >= 0) return 0;
    return Math.ceil((-tokens * 60_000) / rpm);
  }

  function accountGate(accountKey: string): Semaphore {
    let gate = accountGates.get(accountKey);
    if (!gate) {
      gate = createSemaphore(perAccountLimit);
      accountGates.set(accountKey, gate);
    }
    return gate;
  }

  return {
    async run<T>(accountKey: string, task: () => Promise<T>): Promise<T> {
      await globalGate.acquire();
      try {
        const gate = accountGate(accountKey);
        await gate.acquire();
        try {
          const waitMs = reserveDelayMs();
          if (waitMs > 0) await sleep(waitMs);
          return await task();
        } finally {
          gate.release();
        }
      } finally {
        globalGate.release();
      }
    },
  };
}

/** Structural subset of `Response` the retry policy needs. */
export interface RetryableResponse {
  status: number;
  headers: { get(name: string): string | null };
}

/** 'idempotent': 429 backoff + 5xx ≤3. 'none': exactly one attempt, no retry of any kind. */
export type RetryPolicy = 'idempotent' | 'none';

export interface ExecuteOptions {
  retry: RetryPolicy;
}

export interface RequestExecutor {
  execute<R extends RetryableResponse>(
    accountKey: string,
    doFetch: () => Promise<R>,
    options: ExecuteOptions,
  ): Promise<R>;
}

export function createRequestExecutor(input: {
  limiter: RateLimiter;
  sleep?: SleepFn;
}): RequestExecutor {
  const sleep = input.sleep ?? defaultSleep;
  return {
    async execute<R extends RetryableResponse>(
      accountKey: string,
      doFetch: () => Promise<R>,
      options: ExecuteOptions,
    ): Promise<R> {
      if (options.retry === 'none') {
        return input.limiter.run(accountKey, doFetch);
      }
      let rateLimitRetries = 0;
      let serverErrorRetries = 0;
      for (;;) {
        const response = await input.limiter.run(accountKey, doFetch);
        if (response.status === 429 && rateLimitRetries < RATE_LIMIT_BACKOFF_MS.length) {
          const backoffMs = RATE_LIMIT_BACKOFF_MS[rateLimitRetries] ?? 8_000;
          const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
          rateLimitRetries += 1;
          await sleep(Math.max(backoffMs, retryAfterMs ?? 0));
          continue;
        }
        if (response.status >= 500 && serverErrorRetries < SERVER_ERROR_RETRY_DELAYS_MS.length) {
          const delayMs = SERVER_ERROR_RETRY_DELAYS_MS[serverErrorRetries] ?? 4_000;
          serverErrorRetries += 1;
          await sleep(delayMs);
          continue;
        }
        return response;
      }
    },
  };
}
