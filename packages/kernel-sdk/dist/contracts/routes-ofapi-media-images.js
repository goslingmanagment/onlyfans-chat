import { z } from "zod";
import { errorResponseSchema } from "./primitives";
// ChatGoose Desktop media images (hub docs/runbooks/ofapi-media.md). The hub
// decides per file how the desktop may fetch it and hands out a URL; the
// desktop downloads the bytes itself and reports the result. No client URL is
// ever accepted: a file is named by (account, media id, variant) only.
const errors = {
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
    404: errorResponseSchema,
    429: errorResponseSchema,
    503: errorResponseSchema,
};
/**
 * Closed outcome set. `free_url` / `ofapi_cache` / `paid` carry a URL; every
 * other outcome carries none. `refused` and `unavailable` render "unavailable"
 * (a click does not bypass them); `cap_blocked` and `source_expired` wait for
 * an explicit click; `pending` retries after `retryAfterMs` with a NEW
 * requestId; `error` is a failure with no charge left behind.
 */
export const ofapiMediaOutcomeSchema = z.enum([
    "free_url", "ofapi_cache", "paid", "cap_blocked", "source_expired",
    "unavailable", "refused", "pending", "error",
]);
export const ofapiMediaResolveRequestSchema = z.object({
    /** Client idempotency key: a repeat returns the recorded answer, never a second charge. */
    requestId: z.uuid(),
    accountId: z.string().regex(/^acct_[A-Za-z0-9]+$/).max(255),
    mediaId: z.string().regex(/^\d{1,30}$/),
    /** `thumb` = thumb → squarePreview → preview; `full` = photos (jpg/jpeg/png/webp) only. */
    variant: z.enum(["thumb", "full"]),
    surface: z.enum(["thread", "gallery", "vault", "lightbox"]),
    /** `auto` = a visible cell; `click` = an explicit user action (may exceed the daily budget). */
    trigger: z.enum(["auto", "click"]),
    /** Set when this resolve follows a media-context re-read (read intent media-context-v1). */
    afterReread: z.boolean().optional(),
}).strict();
export const ofapiMediaRereadSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("message"), chatId: z.string(), messageId: z.string() }),
    z.object({ kind: z.literal("vault"), mediaId: z.string() }),
]);
export const ofapiMediaResolveResponseSchema = z.object({
    resolveId: z.uuid(),
    outcome: ofapiMediaOutcomeSchema,
    /** https on *.onlyfans.com / *.fansapi.com only; fetch without credentials. */
    url: z.string().nullable(),
    urlExpiresAt: z.string().nullable(),
    /** Size the hub priced (paid) — abort a transfer that exceeds it. */
    contentLength: z.number().int().nonnegative().nullable(),
    /** Hard byte ceiling for this transfer (paid: the priced size, or a 5 MB guard when unknown). */
    maxBytes: z.number().int().positive().nullable(),
    /** Estimated credits charged by this resolve; non-zero only for `paid`. */
    credits: z.number().int().nonnegative(),
    overCap: z.boolean(),
    /** Machine reason (e.g. daily_cap, size_unknown, collection_off, locked, not_found, in_flight). */
    reason: z.string().nullable(),
    retryAfterMs: z.number().int().nonnegative().nullable(),
    /** `cap_blocked` by the daily budget: the next UTC midnight. */
    retryAt: z.string().nullable(),
    mediaType: z.string().nullable(),
    /** `source_expired`: what a click-triggered re-read should refresh. */
    reread: ofapiMediaRereadSchema.nullable(),
    /** A repeated requestId; `url` may be null when the hand-out is no longer retained. */
    replayed: z.boolean(),
});
export const ofapiMediaReportSchema = z.object({
    resolveId: z.uuid(),
    result: z.enum(["ok", "failed", "aborted_size", "timeout", "http_error"]),
    bytesReceived: z.number().int().nonnegative().max(1_000_000_000_000).nullable(),
    httpStatus: z.number().int().min(100).max(599).nullable(),
}).strict();
export const ofapiMediaReportsRequestSchema = z.object({
    reports: z.array(ofapiMediaReportSchema).min(1).max(100),
}).strict();
export const ofapiMediaReportsResponseSchema = z.object({
    accepted: z.number().int().nonnegative(),
    duplicate: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
});
export const ofapiMediaImageRouteSchemas = {
    ofapiMediaResolve: {
        auth: { kind: "apiKey" },
        tags: ["ofapi"],
        summary: "Decide how the desktop may fetch one media file (free URL, OFAPI cache or a budgeted paid download)",
        description: "Chatter-key-only, page-scoped like the read gateway. The hub never relays bytes: it returns "
            + "a URL (or none) and a closed outcome. Paid downloads count against the agency's UTC-day budget; "
            + "`auto` passes only within it, `click` always passes and is flagged over_cap. Idempotent by requestId.",
        body: ofapiMediaResolveRequestSchema,
        response: { 200: ofapiMediaResolveResponseSchema, ...errors },
    },
    ofapiMediaReports: {
        auth: { kind: "apiKey" },
        tags: ["ofapi"],
        summary: "Report desktop media transfer results (batched, idempotent by resolveId)",
        description: "At most 100 reports per call. A lost report leaves a paid charge unknown, never zero.",
        body: ofapiMediaReportsRequestSchema,
        response: { 200: ofapiMediaReportsResponseSchema, ...errors },
    },
};
