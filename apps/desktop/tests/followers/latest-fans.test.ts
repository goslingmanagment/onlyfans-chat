import { describe, expect, it } from "vitest";
import { createOfApiClient } from "@main/ofapi/client";
import { createOfApiTransportClient } from "@main/ofapi/transport";
import { instantSleep, jsonResponse, stubFetch } from "../ofapi/helpers";

const params = {
  accountId: "acct_fixture",
  purpose: "followers" as const,
  retry: "none" as const,
  startDate: "2026-09-10",
  endDate: "2026-09-16",
  type: "new" as const,
  limit: 20,
  offset: 0,
};
const providerPath = "https://app.onlyfansapi.com/api/acct_fixture/fans/latest";
const page = (next: string | null, patch: Record<string, unknown> = {}) => ({
  data: { users: [{ id: 1 }], hasMore: next !== null, ...patch },
  _pagination: { next_page: next },
});
function fixture(body: unknown) {
  const { fetchImpl, requests } = stubFetch([() => jsonResponse(body)]);
  const client = createOfApiTransportClient(
    createOfApiClient({
      apiKey: "fixture",
      baseUrl: "https://hub.test/api/v1/ofapi/read",
      fetchImpl,
      sleep: instantSleep,
    }),
  );
  return { client, requests };
}

describe("date-bounded follower roster", () => {
  it("reads users through Hub with the fixed dates/type and only extracts the provider offset", async () => {
    const { client, requests } = fixture(
      page(
        `${providerPath}?offset=20&limit=20&type=new&start_date=2026-09-10&end_date=2026-09-16`,
      ),
    );
    const result = await client.listFansLatest(params);
    expect(result).toEqual({
      fans: [{ id: 1 }],
      hasMore: true,
      nextOffset: 20,
    });
    const url = new URL(requests[0]!.url);
    expect(url.origin + url.pathname).toBe(
      "https://hub.test/api/v1/ofapi/read/acct_fixture/fans/latest",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      start_date: params.startDate,
      end_date: params.endDate,
      type: "new",
      limit: "20",
      offset: "0",
    });
  });
  it("accepts an empty intermediate page with a safe advancing cursor", async () => {
    await expect(
      fixture(
        page(`${providerPath}?offset=40`, { users: [] }),
      ).client.listFansLatest(params),
    ).resolves.toMatchObject({ fans: [], hasMore: true, nextOffset: 40 });
  });
  it("requires explicit exhaustion for an empty result", async () => {
    await expect(
      fixture(page(null, { users: [] })).client.listFansLatest(params),
    ).resolves.toEqual({ fans: [], hasMore: false, nextOffset: null });
  });
  it.each([
    `${providerPath}?offset=0`,
    `${providerPath}?offset=-1`,
    `${providerPath}?offset=1.5`,
    `${providerPath}?offset=9007199254740992`,
    `${providerPath}?offset=20&offset=40`,
    `${providerPath}?offset=20&limit=50`,
    `${providerPath}?offset=20&type=total`,
    `${providerPath}?offset=20&start_date=2025-01-01`,
    `${providerPath}?offset=20&end_date=2027-01-01`,
    `${providerPath}?offset=20&unknown=1`,
    `${providerPath}?limit=20`,
    `${providerPath}?offset=20#x`,
    "https://foreign.test/api/acct_fixture/fans/latest?offset=20",
    "http://app.onlyfansapi.com/api/acct_fixture/fans/latest?offset=20",
    "https://secret@app.onlyfansapi.com/api/acct_fixture/fans/latest?offset=20",
    "https://app.onlyfansapi.com/api/acct_other/fans/latest?offset=20",
    "https://app.onlyfansapi.com/api/acct_fixture/fans/all?offset=20",
  ])("refuses unsafe or selection-changing continuation %s", async (next) => {
    const { client, requests } = fixture(page(next));
    await expect(client.listFansLatest(params)).rejects.toMatchObject({
      code: "CG-APP-01",
    });
    expect(requests).toHaveLength(1);
  });
  it.each([
    { data: { users: [], hasMore: false } },
    { data: { users: [] }, _pagination: { next_page: null } },
    page(null, { hasMore: true }),
    page(`${providerPath}?offset=20`, { hasMore: false }),
    page(null, { users: undefined, list: [] }),
    page(null, { users: [{ id: "1" }] }),
    page(null, { users: [{ id: Number.MAX_SAFE_INTEGER + 1 }] }),
    page(null, {
      users: Array.from({ length: 21 }, (_, id) => ({ id: id + 1 })),
    }),
    page(null, { isAvailable: false }),
    page(null, { hasStats: false }),
    page(null, { _source: { is_complete: false } }),
    page(null, { _source: { omitted_from_page: 1 } }),
    { ...page(null), _source: { is_complete: false } },
    { ...page(null), _source: { omitted_from_page: 1 } },
  ])(
    "does not convert unavailable, partial or malformed evidence into an empty complete result %#",
    async (body) => {
      await expect(
        fixture(body).client.listFansLatest(params),
      ).rejects.toMatchObject({ code: "CG-APP-01" });
    },
  );
  it.each([
    { limit: 0 },
    { limit: 51 },
    { offset: -1 },
    { offset: 0.1 },
    { startDate: "invalid" },
    { endDate: params.startDate },
    { endDate: "2020-01-01" },
  ])("validates the request before dispatch %#", async (patch) => {
    const { client, requests } = fixture(page(null));
    await expect(
      client.listFansLatest({ ...params, ...patch }),
    ).rejects.toThrow();
    expect(requests).toHaveLength(0);
  });
});
