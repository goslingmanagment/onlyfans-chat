import { z } from "zod";
import { OfApiError } from "./errors";
import { ofapiUserSchema } from "./schemas";

// OFAPI emits pagination links on both hosts; requests still go through Hub.
const providerOrigins = new Set([
  "https://app.onlyfansapi.com",
  "https://api.onlyfansapi.com",
]);

/** Only locally authored diagnostics, never provider body text or URLs. */
export class LatestFansPageError extends OfApiError {
  constructor(readonly diagnostic: string) {
    super("CG-APP-01", { message: diagnostic, detail: { provider: "ofapi" } });
  }
}

// Fresh primary docs: /api-reference/fans/list-latest-fans (2026-09-15).
// Unlike /fans/all this endpoint returns data.users, filtered by subscription
// window/type. A short page is not evidence of exhaustion.
const sourceCoverage = z.object({
  is_complete: z.boolean().optional(),
  omitted_from_page: z.number().int().nonnegative().optional(),
});
const latestFansPage = z.object({
  data: z.object({
    users: z.array(
      ofapiUserSchema.extend({ id: z.number().int().safe().positive() }),
    ),
    hasMore: z.boolean(),
    isAvailable: z.boolean().optional(),
    hasStats: z.boolean().optional(),
    _source: sourceCoverage.optional(),
  }),
  _source: sourceCoverage.optional(),
  _pagination: z.object({ next_page: z.string().min(1).nullable() }),
});

export function parseLatestFansPage(
  payload: unknown,
  path: string,
  query: {
    limit: number;
    offset: number;
    type: string;
    start_date: string;
    end_date: string;
  },
) {
  const fail = (reason: string): never => {
    throw new LatestFansPageError(reason);
  };
  const parsed = latestFansPage.safeParse(payload);
  if (!parsed.success)
    return fail("Invalid latest fans page or missing explicit pagination");
  const { data, _pagination } = parsed.data;
  if (data.isAvailable === false || data.hasStats === false)
    return fail("Latest fans data unavailable");
  for (const source of [data._source, parsed.data._source]) {
    if (source?.is_complete === false || (source?.omitted_from_page ?? 0) > 0) {
      return fail("Latest fans source is incomplete");
    }
  }
  if (data.users.length > query.limit)
    return fail("Latest fans page exceeds requested limit");
  if (data.hasMore !== (_pagination.next_page !== null))
    return fail("Contradictory latest fans pagination");
  let nextOffset: number | null = null;
  if (_pagination.next_page !== null) {
    // Never fetch the provider URL. Extract only its cursor and send the next
    // request through the same authenticated Hub gateway and fixed selection.
    let next: URL;
    try {
      next = new URL(_pagination.next_page, "https://app.onlyfansapi.com/api/");
    } catch {
      return fail("Invalid latest fans continuation URL");
    }
    if (
      !providerOrigins.has(next.origin) ||
      next.pathname !== `/api${path}` ||
      next.username ||
      next.password ||
      next.hash
    )
      return fail("Foreign latest fans continuation");
    for (const key of next.searchParams.keys()) {
      if (next.searchParams.getAll(key).length !== 1)
        return fail("Duplicate latest fans continuation parameter");
      if (
        key !== "offset" &&
        (!Object.hasOwn(query, key) ||
          next.searchParams.get(key) !==
            String(query[key as keyof typeof query]))
      ) {
        return fail("Latest fans continuation changed selection");
      }
    }
    const offset = next.searchParams.get("offset") ?? "";
    if (
      !/^\d+$/.test(offset) ||
      !Number.isSafeInteger(Number(offset)) ||
      Number(offset) <= query.offset
    ) {
      return fail("Non-advancing latest fans continuation");
    }
    nextOffset = Number(offset);
  }
  return { fans: data.users, hasMore: data.hasMore, nextOffset };
}
