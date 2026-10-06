/**
 * Fansly Sync Engine — the owner's routes (design §7.4).
 *
 * WHY A SEPARATE MODULE: these are owner-session routes with no agent envelope
 * (`delivery`/`capture`/`conclusion`), and the read plane's pins say every 200
 * of `agentRouteSchemas` carries one. The owner's history requests mirror the
 * agent operations in `routes-agent.ts` and share their wire shapes, so an
 * owner and an agent read the same request the same way (plan §4.1: agents and
 * the owner are equal requesters). The page status and the work rows ("why
 * waiting") share theirs with `agentSyncStatus` / `agentSyncWhy` the same way.
 *
 * `routes.ts` spreads `syncRouteSchemas` into `routeSchemas`; the dashboard and
 * the owner console reach them through the generated SDK with a cookie.
 */
import { z } from "zod";
import { errorResponseSchema } from "./primitives";
import { agentHistoryFanIssues, agentHistoryItemSchema, agentHistoryItemStateEnum, agentHistoryPageParamsSchema, agentHistoryRequestBodyShape, agentHistoryRequestParamsSchema, agentHistoryRequestSchema, agentHistoryRequestStateEnum, agentSyncPageStatusSchema, agentSyncResourceKeyEnum, agentSyncWorkSchema, agentSyncWorkStateEnum, } from "./routes-agent";
/** The agent create body without the agent-plane claim. */
export const syncHistoryRequestCreateBodySchema = z.object({
    ...agentHistoryRequestBodyShape,
}).strict().superRefine((value, ctx) => {
    for (const issue of agentHistoryFanIssues(value)) {
        ctx.addIssue({ code: "custom", ...issue });
    }
});
/** Paging over a request's fans: the ordinal after which the next page starts
 *  (the previous response's `nextAfterOrdinal`). */
const syncHistoryItemsPageShape = {
    limit: z.coerce.number().int().min(1).max(200).default(200),
    afterOrdinal: z.coerce.number().int().min(0).optional(),
};
export const syncHistoryRequestCreateResponseSchema = z.object({
    disposition: z.enum(["created", "coalesced"]),
    request: agentHistoryRequestSchema,
    items: z.array(agentHistoryItemSchema).max(200),
    /** null: every fan is in `items`. */
    nextAfterOrdinal: z.number().int().nonnegative().nullable(),
}).strict();
export const syncHistoryRequestGetQuerySchema = z.object({
    state: agentHistoryItemStateEnum.optional(),
    ...syncHistoryItemsPageShape,
}).strict();
export const syncHistoryRequestGetResponseSchema = z.object({
    request: agentHistoryRequestSchema,
    items: z.array(agentHistoryItemSchema).max(200),
    nextAfterOrdinal: z.number().int().nonnegative().nullable(),
}).strict();
export const syncHistoryRequestCancelBodySchema = z.object({
    /** Stored as a digest only. */
    reason: z.string().min(1).max(1000).optional(),
}).strict();
export const syncHistoryRequestCancelResponseSchema = z.object({
    disposition: z.enum(["cancelled", "already_cancelled", "already_done"]),
    request: agentHistoryRequestSchema,
}).strict();
export const syncHistoryRequestsQuerySchema = z.object({
    pageLabel: z.string().min(1).optional(),
    state: agentHistoryRequestStateEnum.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
}).strict();
export const syncHistoryRequestsResponseSchema = z.object({
    requests: z.array(agentHistoryRequestSchema).max(200),
}).strict();
// ── page status, work, "sync now" ──────────────────────────────────────────
/** The registry's resource files (the part of a key before the dot). Pinned
 *  equal to `ResourceFile` of the registry by `tests/sync-status-contracts.test.ts`. */
export const syncResourceFileEnum = z.enum([
    "account",
    "ws",
    "dm-conversations",
    "dm-messages",
    "dm-live",
    "transactions",
    "top-spenders",
    "fan-earnings",
    "purchases",
    "payouts",
    "subscribers",
    "followers",
    "fan-profiles",
    "notifications",
    "posts",
    "post-replies",
    "catalog",
    "media-stats",
    "stats",
    "media-download",
    "repair",
    "probe",
]);
export const syncPagesResponseSchema = z.object({
    pages: z.array(agentSyncPageStatusSchema).max(200),
}).strict();
export const syncPageWorkQuerySchema = z.object({
    resource: agentSyncResourceKeyEnum.optional(),
    subject: z.string().max(200).optional(),
    state: agentSyncWorkStateEnum.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
}).strict();
export const syncPageWorkResponseSchema = z.object({
    /** Newest first. */
    work: z.array(agentSyncWorkSchema).max(200),
}).strict();
export const syncPageWorkParamsSchema = z.object({
    ...agentHistoryPageParamsSchema.shape,
    workId: z.coerce.number().int().positive(),
}).strict();
export const syncPageWorkGetResponseSchema = z.object({
    work: agentSyncWorkSchema,
}).strict();
export const syncPageRefreshBodySchema = z.object({
    /** Only the polls of these resource files; omitted: every poll of the page. */
    resources: z.array(syncResourceFileEnum).min(1).max(syncResourceFileEnum.options.length).optional(),
}).strict();
export const syncPageRefreshResponseSchema = z.object({
    /** Poll rows made due now. */
    bumped: z.number().int().nonnegative(),
    /** Always false since step 4 (S4-23, shadow mode is gone): a wire-only
     *  constant the released clients' schemas require. */
    shadow: z.boolean(),
}).strict();
export const syncRouteSchemas = {
    syncPages: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Every Fansly page's engine status: owner, pause record, sends by class, queue by why it waits, holds,"
            + " breakers, request progress (Fansly Sync Engine). Off and shadow pages report their shadow journal",
        response: {
            200: syncPagesResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    syncPageWork: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "A page's work rows, newest first, each with why it waits (Fansly Sync Engine)",
        params: agentHistoryPageParamsSchema,
        querystring: syncPageWorkQuerySchema,
        response: {
            200: syncPageWorkResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    syncPageWorkGet: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "One work row of a page and why it waits: the status link a queued \"enqueue and wait\" call answers with",
        params: syncPageWorkParamsSchema,
        response: {
            200: syncPageWorkGetResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    syncPageRefresh: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Sync now: the page's poll rows (or those of the named resource files) become due now; 202 with how many."
            + " 409 sync_page_off on a page no actor runs",
        params: agentHistoryPageParamsSchema,
        body: syncPageRefreshBodySchema,
        response: {
            202: syncPageRefreshResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            // sync_page_off
            409: errorResponseSchema,
        },
    },
    syncHistoryRequests: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "History requests of every requester, newest first (Fansly Sync Engine)",
        querystring: syncHistoryRequestsQuerySchema,
        response: {
            200: syncHistoryRequestsResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    syncHistoryRequestCreate: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "File a history request as the owner: 1..1000 fans of one page and a depth. Database only;"
            + " 409 history_requests_unavailable_on_page on a page not switched to the Fansly Sync Engine",
        params: agentHistoryPageParamsSchema,
        body: syncHistoryRequestCreateBodySchema,
        response: {
            200: syncHistoryRequestCreateResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            // history_requests_unavailable_on_page | idempotency_mismatch
            409: errorResponseSchema,
        },
    },
    syncHistoryRequestGet: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "One history request: counts, reads, ETA, why it waits, and a page of its fans",
        params: agentHistoryRequestParamsSchema,
        querystring: syncHistoryRequestGetQuerySchema,
        response: {
            200: syncHistoryRequestGetResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    syncHistoryRequestCancel: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Cancel a history request: its fans stop being read; loaded messages and chains stay",
        params: agentHistoryRequestParamsSchema,
        body: syncHistoryRequestCancelBodySchema,
        response: {
            200: syncHistoryRequestCancelResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
};
