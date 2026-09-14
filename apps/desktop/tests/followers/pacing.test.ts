import { describe, it, expect, vi } from "vitest";
import { createFollowerPacer } from "@main/followers/pacing";
import { OfApiError } from "@main/ofapi/errors";

describe("follower request lane", () => {
  it("serializes same-account actual tasks with message spacing and honors long Retry-After across invocations", async () => {
    let now = 0;
    const times: number[] = [];
    const waits: number[] = [];
    const pacer = createFollowerPacer({
      now: () => now,
      sleep: async (ms) => {
        waits.push(ms);
        now += ms;
      },
    });
    const signal = new AbortController().signal;
    let calls = 0;
    const task = async () => {
      times.push(now);
      if (calls++ === 0)
        throw new OfApiError("CG-OF-03", {
          detail: { status: 429, retryAfterMs: 125_000 },
        });
      return "ok";
    };
    await Promise.all([
      pacer.read("a", signal, true, task, () => undefined),
      pacer.read("a", signal, true, task, () => undefined),
    ]);
    expect(times).toEqual([0, 125_000, 128_000]);
    expect(waits).toContain(125_000);
  });
  it("cancels a waiting task without sending it, leaving account cooldown intact", async () => {
    vi.useFakeTimers();
    try {
      const pacer = createFollowerPacer();
      const controller = new AbortController();
      const first = vi.fn(async () => {
        throw new OfApiError("CG-OF-03", {
          detail: { status: 429, retryAfterMs: 180_000 },
        });
      });
      const pending = pacer.read(
        "a",
        controller.signal,
        true,
        first,
        () => undefined,
      );
      const caught = pending.catch(() => undefined);
      await vi.advanceTimersByTimeAsync(0);
      controller.abort();
      await caught;
      expect(first).toHaveBeenCalledTimes(1);
      expect(pacer.cooldown("a")).toBeGreaterThan(Date.now());
      const second = vi.fn(async () => "ok");
      const next = pacer.read(
        "a",
        new AbortController().signal,
        true,
        second,
        () => undefined,
      );
      await vi.advanceTimersByTimeAsync(179_999);
      expect(second).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await next;
      expect(second).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
