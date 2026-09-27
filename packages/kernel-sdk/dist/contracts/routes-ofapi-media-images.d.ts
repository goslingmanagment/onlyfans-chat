import { z } from "zod";
/**
 * The largest single file the desktop may take (its full-photo guard). A paid
 * hand-out is never priced above it and no transfer report may exceed it.
 */
export declare const OFAPI_MEDIA_MAX_TRANSFER_BYTES = 30000000;
/**
 * Closed outcome set. `free_url` / `ofapi_cache` / `paid` carry a URL; every
 * other outcome carries none. `refused` and `unavailable` render "unavailable"
 * (a click does not bypass them) — except `refused` with reason `not_ready`,
 * which renders "processing" and, when `reread` names where the media
 * appeared, may be refreshed by an explicit click (one media-context re-read,
 * then resolve with `afterReread`). `cap_blocked` (reasons `daily_cap`,
 * `size_unknown`, `click_only` — `full` is never loaded automatically) and
 * `source_expired` wait for an explicit click; `pending` (reasons `in_flight`,
 * `busy`) retries after `retryAfterMs` with a NEW requestId; `error` is a
 * failure with no charge left behind.
 */
export declare const ofapiMediaOutcomeSchema: z.ZodEnum<{
    pending: "pending";
    error: "error";
    free_url: "free_url";
    ofapi_cache: "ofapi_cache";
    paid: "paid";
    cap_blocked: "cap_blocked";
    source_expired: "source_expired";
    unavailable: "unavailable";
    refused: "refused";
}>;
export declare const ofapiMediaResolveRequestSchema: z.ZodObject<{
    requestId: z.ZodUUID;
    accountId: z.ZodString;
    mediaId: z.ZodString;
    variant: z.ZodEnum<{
        thumb: "thumb";
        full: "full";
    }>;
    surface: z.ZodEnum<{
        vault: "vault";
        thread: "thread";
        gallery: "gallery";
        lightbox: "lightbox";
    }>;
    trigger: z.ZodEnum<{
        auto: "auto";
        click: "click";
    }>;
    afterReread: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>;
export declare const ofapiMediaRereadSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"message">;
    chatId: z.ZodString;
    messageId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"vault">;
    mediaId: z.ZodString;
}, z.core.$strip>], "kind">;
export declare const ofapiMediaResolveResponseSchema: z.ZodObject<{
    resolveId: z.ZodUUID;
    outcome: z.ZodEnum<{
        pending: "pending";
        error: "error";
        free_url: "free_url";
        ofapi_cache: "ofapi_cache";
        paid: "paid";
        cap_blocked: "cap_blocked";
        source_expired: "source_expired";
        unavailable: "unavailable";
        refused: "refused";
    }>;
    url: z.ZodNullable<z.ZodString>;
    urlExpiresAt: z.ZodNullable<z.ZodString>;
    contentLength: z.ZodNullable<z.ZodNumber>;
    maxBytes: z.ZodNullable<z.ZodNumber>;
    credits: z.ZodNumber;
    overCap: z.ZodBoolean;
    reason: z.ZodNullable<z.ZodString>;
    retryAfterMs: z.ZodNullable<z.ZodNumber>;
    retryAt: z.ZodNullable<z.ZodString>;
    mediaType: z.ZodNullable<z.ZodString>;
    reread: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"message">;
        chatId: z.ZodString;
        messageId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"vault">;
        mediaId: z.ZodString;
    }, z.core.$strip>], "kind">>;
    replayed: z.ZodBoolean;
}, z.core.$strip>;
export declare const ofapiMediaReportSchema: z.ZodObject<{
    resolveId: z.ZodUUID;
    result: z.ZodEnum<{
        failed: "failed";
        timeout: "timeout";
        ok: "ok";
        aborted_size: "aborted_size";
        http_error: "http_error";
    }>;
    bytesReceived: z.ZodNullable<z.ZodNumber>;
    httpStatus: z.ZodNullable<z.ZodNumber>;
}, z.core.$strict>;
export declare const ofapiMediaReportsRequestSchema: z.ZodObject<{
    reports: z.ZodArray<z.ZodObject<{
        resolveId: z.ZodUUID;
        result: z.ZodEnum<{
            failed: "failed";
            timeout: "timeout";
            ok: "ok";
            aborted_size: "aborted_size";
            http_error: "http_error";
        }>;
        bytesReceived: z.ZodNullable<z.ZodNumber>;
        httpStatus: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const ofapiMediaReportsResponseSchema: z.ZodObject<{
    accepted: z.ZodNumber;
    duplicate: z.ZodNumber;
    unknown: z.ZodNumber;
    rejected: z.ZodNumber;
}, z.core.$strip>;
export declare const ofapiMediaImageRouteSchemas: {
    readonly ofapiMediaResolve: {
        readonly auth: {
            readonly kind: "apiKey";
        };
        readonly tags: readonly ["ofapi"];
        readonly summary: "Decide how the desktop may fetch one media file (free URL, OFAPI cache or a budgeted paid download)";
        readonly description: string;
        readonly body: z.ZodObject<{
            requestId: z.ZodUUID;
            accountId: z.ZodString;
            mediaId: z.ZodString;
            variant: z.ZodEnum<{
                thumb: "thumb";
                full: "full";
            }>;
            surface: z.ZodEnum<{
                vault: "vault";
                thread: "thread";
                gallery: "gallery";
                lightbox: "lightbox";
            }>;
            trigger: z.ZodEnum<{
                auto: "auto";
                click: "click";
            }>;
            afterReread: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strict>;
        readonly response: {
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 429: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 503: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 200: z.ZodObject<{
                resolveId: z.ZodUUID;
                outcome: z.ZodEnum<{
                    pending: "pending";
                    error: "error";
                    free_url: "free_url";
                    ofapi_cache: "ofapi_cache";
                    paid: "paid";
                    cap_blocked: "cap_blocked";
                    source_expired: "source_expired";
                    unavailable: "unavailable";
                    refused: "refused";
                }>;
                url: z.ZodNullable<z.ZodString>;
                urlExpiresAt: z.ZodNullable<z.ZodString>;
                contentLength: z.ZodNullable<z.ZodNumber>;
                maxBytes: z.ZodNullable<z.ZodNumber>;
                credits: z.ZodNumber;
                overCap: z.ZodBoolean;
                reason: z.ZodNullable<z.ZodString>;
                retryAfterMs: z.ZodNullable<z.ZodNumber>;
                retryAt: z.ZodNullable<z.ZodString>;
                mediaType: z.ZodNullable<z.ZodString>;
                reread: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodObject<{
                    kind: z.ZodLiteral<"message">;
                    chatId: z.ZodString;
                    messageId: z.ZodString;
                }, z.core.$strip>, z.ZodObject<{
                    kind: z.ZodLiteral<"vault">;
                    mediaId: z.ZodString;
                }, z.core.$strip>], "kind">>;
                replayed: z.ZodBoolean;
            }, z.core.$strip>;
        };
    };
    readonly ofapiMediaReports: {
        readonly auth: {
            readonly kind: "apiKey";
        };
        readonly tags: readonly ["ofapi"];
        readonly summary: "Report desktop media transfer results (batched, idempotent by resolveId)";
        readonly description: string;
        readonly body: z.ZodObject<{
            reports: z.ZodArray<z.ZodObject<{
                resolveId: z.ZodUUID;
                result: z.ZodEnum<{
                    failed: "failed";
                    timeout: "timeout";
                    ok: "ok";
                    aborted_size: "aborted_size";
                    http_error: "http_error";
                }>;
                bytesReceived: z.ZodNullable<z.ZodNumber>;
                httpStatus: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strict>>;
        }, z.core.$strict>;
        readonly response: {
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 429: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 503: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 200: z.ZodObject<{
                accepted: z.ZodNumber;
                duplicate: z.ZodNumber;
                unknown: z.ZodNumber;
                rejected: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
};
