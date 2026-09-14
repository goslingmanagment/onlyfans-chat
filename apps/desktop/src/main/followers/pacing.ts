import { OfApiError } from "../ofapi/errors";

export interface PaceEvent {
  event: "wait" | "request" | "response" | "retry";
  delayMs?: number;
  attempt?: number;
  durationMs?: number;
  status?: number;
}
interface Lane {
  tail: Promise<void>;
  nextAt: number;
  cooldownUntil: number;
  strikes: number;
}

/** A FIFO per account, shared by scan, manual history and send preflight.
 * The ordinary OFAPI limiter still admits every actual HTTP request. Aborted
 * work never dispatches after that queue; retry:none prevents hidden bursts. */
export function createFollowerPacer(
  options: {
    now?: () => number;
    sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  } = {},
) {
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ??
    ((ms: number, signal: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
        signal.throwIfAborted();
        const onAbort = (): void => {
          clearTimeout(timer);
          reject(signal.reason);
        };
        const timer = setTimeout(() => {
          signal.removeEventListener("abort", onAbort);
          resolve();
        }, ms);
        signal.addEventListener("abort", onAbort, { once: true });
      }));
  const lanes = new Map<string, Lane>();
  function laneFor(account: string): Lane {
    let lane = lanes.get(account);
    if (!lane) {
      lane = {
        tail: Promise.resolve(),
        nextAt: 0,
        cooldownUntil: 0,
        strikes: 0,
      };
      lanes.set(account, lane);
    }
    return lane;
  }
  return {
    cooldown(account: string): number | null {
      const until = laneFor(account).cooldownUntil;
      return until > now() ? until : null;
    },
    async read<T>(
      account: string,
      signal: AbortSignal,
      messages: boolean,
      task: () => Promise<T>,
      report: (event: PaceEvent) => void,
    ): Promise<T> {
      const lane = laneFor(account);
      const previous = lane.tail;
      let release!: () => void;
      lane.tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      try {
        await previous;
        signal.throwIfAborted();
        for (let attempt = 1; ; attempt += 1) {
          const delay = Math.max(lane.nextAt, lane.cooldownUntil) - now();
          if (delay > 0) {
            report({ event: "wait", delayMs: delay, attempt });
            await sleep(delay, signal);
          }
          signal.throwIfAborted();
          const startedAt = now();
          lane.nextAt =
            startedAt +
            Math.min(8_000, (messages ? 1_500 : 1_000) * 2 ** lane.strikes);
          report({ event: "request", attempt });
          try {
            const result = await task();
            signal.throwIfAborted();
            lane.nextAt = Math.max(
              lane.nextAt,
              now() +
                Math.min(8_000, (messages ? 1_500 : 1_000) * 2 ** lane.strikes),
            );
            report({
              event: "response",
              durationMs: now() - startedAt,
              attempt,
            });
            return result;
          } catch (error) {
            signal.throwIfAborted();
            lane.nextAt = Math.max(
              lane.nextAt,
              now() +
                Math.min(8_000, (messages ? 1_500 : 1_000) * 2 ** lane.strikes),
            );
            const status =
              error instanceof OfApiError
                ? (error.upstreamStatus ?? error.detail?.status)
                : undefined;
            report({
              event: "response",
              durationMs: now() - startedAt,
              attempt,
              ...(typeof status === "number" ? { status } : {}),
            });
            if (status !== 429) throw error;
            lane.strikes = Math.min(lane.strikes + 1, 8);
            const delayMs = Math.max(
              Math.min(300_000, 30_000 * 2 ** Math.min(lane.strikes - 1, 4)),
              error instanceof OfApiError
                ? (error.detail?.retryAfterMs ?? 0)
                : 0,
            );
            lane.cooldownUntil = Math.max(lane.cooldownUntil, now() + delayMs);
            report({ event: "retry", delayMs, attempt, status });
            if (attempt >= 5) throw error;
          }
        }
      } finally {
        release();
      }
    },
  };
}
