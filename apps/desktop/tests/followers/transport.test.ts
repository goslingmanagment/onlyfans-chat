import { describe, expect, it, vi } from "vitest";
import { createOfApiClient } from "@main/ofapi/client";
import { jsonResponse, stubFetch, instantSleep } from "../ofapi/helpers";
const accountId = "acct_1";
const params = {
  accountId,
  chatId: "1",
  purpose: "followers" as const,
  retry: "none" as const,
  strict: true,
};
function setup(body: unknown) {
  const { fetchImpl, requests } = stubFetch([() => jsonResponse(body)]);
  return {
    client: createOfApiClient({
      apiKey: "fixture",
      fetchImpl,
      sleep: instantSleep,
    }),
    requests,
  };
}
describe("strict follower evidence transport", () => {
  it("rejects a malformed message rather than dropping it into a ready empty history", async () => {
    const { client } = setup({
      data: [
        {
          id: 1,
          text: "already contacted",
          isSentByMe: true,
          createdAt: "invalid",
        },
      ],
      _pagination: { next_page: null },
    });
    await expect(client.listMessages(params)).rejects.toThrow("validation");
  });
  it("requires explicit terminal pagination and safe numeric message identity", async () => {
    await expect(
      setup({ data: [] }).client.listMessages(params),
    ).rejects.toThrow("validation");
    await expect(
      setup({
        data: [
          {
            id: Number.MAX_SAFE_INTEGER + 1,
            isSentByMe: true,
            createdAt: new Date().toISOString(),
          },
        ],
        _pagination: { next_page: null },
      }).client.listMessages(params),
    ).rejects.toThrow("validation");
    await expect(
      setup({ data: [], _pagination: { next_page: null } }).client.listMessages(
        params,
      ),
    ).resolves.toMatchObject({ messages: [], nextPageUrl: null });
  });
  it("does not silently turn a fans response without hasMore into complete", async () => {
    await expect(
      setup({ data: { list: [] } }).client.listFansAll({
        accountId,
        purpose: "followers",
        strict: true,
      }),
    ).rejects.toThrow("hasMore");
  });
  it("never dispatches after cancellation while waiting in the ordinary limiter", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ data: [], _pagination: { next_page: null } }),
    );
    const controller = new AbortController();
    const client = createOfApiClient({
      apiKey: "fixture",
      fetchImpl,
      rateLimiter: {
        run: async (_account, task) => {
          await gate;
          return task();
        },
      },
    });
    const result = client.listMessages({
      ...params,
      signal: controller.signal,
    });
    const rejected = expect(result).rejects.toThrow();
    controller.abort();
    release();
    await rejected;
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("performs one physical 429 attempt; the followers scheduler owns retry", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        { message: "slow" },
        { status: 429, headers: { "retry-after": "180" } },
      ),
    );
    const client = createOfApiClient({
      apiKey: "fixture",
      fetchImpl,
      sleep: instantSleep,
    });
    await expect(client.listMessages(params)).rejects.toMatchObject({
      detail: { status: 429, retryAfterMs: 180_000 },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
