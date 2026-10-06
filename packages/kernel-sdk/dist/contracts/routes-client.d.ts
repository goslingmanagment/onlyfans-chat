/**
 * Routes of the chat extension (`chat-extension`), the hub's third client.
 *
 * WHY A SEPARATE MODULE: every route the new client gets lands here (group
 * `clientRouteSchemas`), so its PRs touch one new file instead of `routes.ts`,
 * which the Sync Engine changes almost daily. `routes.ts` spreads the group into
 * `routeSchemas`, behind its own name in `RouteSchemas` (TS7056, see there).
 *
 * Imports come only from `zod`, `./primitives.ts` and the vendored part of
 * `@agency_hub_core/shared`. Never from `./routes.ts`: it imports this module,
 * so the reverse import is a cycle.
 *
 * Shape law for every client route (chat-extension docs/hub-pr-plan.md §4.0):
 * - bodies and query strings are `.strict()`;
 * - response objects are NOT strict: an SDK frozen in a shipped client strips a
 *   key it does not know instead of failing the whole response, so a new field
 *   is always optional and never breaks an installed client;
 * - a vocabulary that grows (flags, capabilities, reasons, platforms, roles) is
 *   an open string on the wire. `z.enum`, `z.record(z.enum…)` and
 *   `z.array(z.enum…)` refuse an unknown member, so one new platform or flag
 *   would break the parse of the whole bootstrap in every installed client. The
 *   known members are the exported constants below; a client narrows to them
 *   itself and reads an unknown member as "off" / "unknown".
 */
import { z } from "zod";
/** Open token: the wire form of every growing vocabulary (reason, flag, capability, platform, role…). */
export declare const clientOpenToken: z.ZodString;
/**
 * The ONE shape of a platform numeric id a client sends: an OnlyFans fan id
 * (== chat id) or message id. No leading zero, at most 30 digits. Every client
 * field that carries such an id (fanRef, the feed, fresh text, known message
 * ids) uses this schema, so the hub never holds two spellings of one id.
 */
export declare const CLIENT_NUMERIC_ID_PATTERN: RegExp;
export declare const clientNumericIdSchema: z.ZodString;
/** OnlyFans fan id (== chat_id). */
export declare const clientFanRefSchema: z.ZodString;
export declare const clientPageParamsSchema: z.ZodObject<{
    pageLabel: z.ZodString;
}, z.core.$strip>;
export declare const clientPageFanParamsSchema: z.ZodObject<{
    pageLabel: z.ZodString;
    fanRef: z.ZodString;
}, z.core.$strip>;
export declare const clientCursorSchema: z.ZodString;
/** Known names: documentation and the client's narrowing. On the wire they are open strings. */
export declare const CLIENT_FEATURE_FLAG_NAMES: readonly ["insertion", "freshText", "newcomers", "spenders", "stats", "preview", "previewSend", "previewSendMarkAiGenerated", "fanPanel", "navigation", "wsTap", "sound", "coach", "recap", "review", "splitAll"];
export declare const CLIENT_HUB_CAPABILITY_NAMES: readonly ["context-v1", "live-text-v1", "split-all-v1", "shared-recaps-v1", "recap-profile-v1", "archive-feed-v1", "spenders-stats-v1", "awaiting-reply-v1", "audience-new-v1", "preview-send-custody-v1", "client-health-perf-v1", "ai-usage-v1"];
/**
 * Append-only. `client_outdated` (the caller's `x-client-version` is below the
 * owner's minimum, or unreadable) is answered by the server-side check of
 * client routes and AI calls (H-2b/H-3), never by the bootstrap; it is listed
 * from the first vendored SDK on so a client never meets it as unknown.
 */
export declare const CLIENT_FEATURE_UNAVAILABLE_REASONS: readonly ["disabled", "flag_off", "platform_unsupported", "binding_missing", "hub_not_ready", "not_granted", "client_outdated"];
/** The platforms and roles this hub knows today (`pages[].platform`, `identity.role`). */
export declare const CLIENT_KNOWN_PLATFORMS: readonly ["fansly", "onlyfans"];
export declare const CLIENT_KNOWN_ROLES: readonly ["owner", "team_lead", "chatter"];
/**
 * How much of one conversation's history the hub can vouch for: the `coverage`
 * of the AI `context_v1` frame (routes.ts) and of the client reads built on the
 * same stores. `complete`: a standing proof that the hub holds the chat's whole
 * history up to the proof's head, served by the archive. `partial`: the hub
 * knows its copy has a hole. `unknown`: nothing proves either.
 */
export declare const CLIENT_COVERAGE_LEVELS: readonly ["complete", "partial", "unknown"];
export type ClientFeatureFlagName = (typeof CLIENT_FEATURE_FLAG_NAMES)[number];
export type ClientHubCapabilityName = (typeof CLIENT_HUB_CAPABILITY_NAMES)[number];
export type ClientFeatureUnavailableReason = (typeof CLIENT_FEATURE_UNAVAILABLE_REASONS)[number];
export type ClientCoverageLevel = (typeof CLIENT_COVERAGE_LEVELS)[number];
export declare const clientFeatureAvailabilitySchema: z.ZodObject<{
    available: z.ZodBoolean;
    reason: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/** An admitted send-path and receipt profile of the client (X8): adapter version
 *  plus module fingerprints. No code and no selectors. */
export declare const clientReceiptProfileSchema: z.ZodObject<{
    id: z.ZodString;
    adapterVersion: z.ZodString;
    modules: z.ZodRecord<z.ZodString, z.ZodString>;
}, z.core.$strip>;
export declare const clientBootstrapPageSchema: z.ZodObject<{
    pageId: z.ZodNumber;
    pageLabel: z.ZodString;
    title: z.ZodString;
    platform: z.ZodString;
    platformAccountId: z.ZodNullable<z.ZodString>;
    bindingRevision: z.ZodNumber;
    features: z.ZodRecord<z.ZodString, z.ZodObject<{
        available: z.ZodBoolean;
        reason: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const clientBootstrapLimitsSchema: z.ZodObject<{
    freshTextMaxItems: z.ZodNumber;
    freshTextMaxChars: z.ZodNumber;
    feedMax: z.ZodNumber;
    deepMax: z.ZodNumber;
    audienceWindowHours: z.ZodNumber;
    claimLeaseSec: z.ZodNumber;
    claimRenewSec: z.ZodNumber;
    claimActivityWindowSec: z.ZodNumber;
    previewSendPerMinute: z.ZodNumber;
    navInsertTimeoutSec: z.ZodNumber;
    dispatchTicketSec: z.ZodNumber;
    previewSendReceiptProfiles: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        adapterVersion: z.ZodString;
        modules: z.ZodRecord<z.ZodString, z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const clientBootstrapResponseSchema: z.ZodObject<{
    protocol: z.ZodNumber;
    issuedAt: z.ZodString;
    ttlSec: z.ZodNumber;
    configRevision: z.ZodNumber;
    minVersion: z.ZodString;
    identity: z.ZodObject<{
        userId: z.ZodNumber;
        username: z.ZodString;
        role: z.ZodString;
        tokenClient: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    pages: z.ZodArray<z.ZodObject<{
        pageId: z.ZodNumber;
        pageLabel: z.ZodString;
        title: z.ZodString;
        platform: z.ZodString;
        platformAccountId: z.ZodNullable<z.ZodString>;
        bindingRevision: z.ZodNumber;
        features: z.ZodRecord<z.ZodString, z.ZodObject<{
            available: z.ZodBoolean;
            reason: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    bindingsByHost: z.ZodRecord<z.ZodString, z.ZodNumber>;
    flags: z.ZodRecord<z.ZodString, z.ZodBoolean>;
    limits: z.ZodObject<{
        freshTextMaxItems: z.ZodNumber;
        freshTextMaxChars: z.ZodNumber;
        feedMax: z.ZodNumber;
        deepMax: z.ZodNumber;
        audienceWindowHours: z.ZodNumber;
        claimLeaseSec: z.ZodNumber;
        claimRenewSec: z.ZodNumber;
        claimActivityWindowSec: z.ZodNumber;
        previewSendPerMinute: z.ZodNumber;
        navInsertTimeoutSec: z.ZodNumber;
        dispatchTicketSec: z.ZodNumber;
        previewSendReceiptProfiles: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            adapterVersion: z.ZodString;
            modules: z.ZodRecord<z.ZodString, z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    capabilities: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
/** Known values of `coverage.transcriptCoverage`. On the wire an open token. */
export declare const CLIENT_RECAP_TRANSCRIPT_COVERAGES: readonly ["full-history", "window"];
export type ClientRecapTranscriptCoverage = (typeof CLIENT_RECAP_TRANSCRIPT_COVERAGES)[number];
export declare const clientConversationRecapsQuerySchema: z.ZodObject<{
    personaDefinitionId: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const clientRecapBodySchema: z.ZodObject<{
    generationRef: z.ZodString;
    generatedAt: z.ZodString;
    personaDefinitionId: z.ZodNullable<z.ZodString>;
    coverage: z.ZodObject<{
        transcriptCoverage: z.ZodNullable<z.ZodString>;
        requestedCount: z.ZodNullable<z.ZodNumber>;
        keptCount: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>;
    text: z.ZodString;
}, z.core.$strip>;
export declare const clientConversationRecapsResponseSchema: z.ZodObject<{
    full: z.ZodNullable<z.ZodObject<{
        generationRef: z.ZodString;
        generatedAt: z.ZodString;
        personaDefinitionId: z.ZodNullable<z.ZodString>;
        coverage: z.ZodObject<{
            transcriptCoverage: z.ZodNullable<z.ZodString>;
            requestedCount: z.ZodNullable<z.ZodNumber>;
            keptCount: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strip>;
        text: z.ZodString;
    }, z.core.$strip>>;
    short: z.ZodNullable<z.ZodObject<{
        generationRef: z.ZodString;
        generatedAt: z.ZodString;
        personaDefinitionId: z.ZodNullable<z.ZodString>;
        coverage: z.ZodObject<{
            transcriptCoverage: z.ZodNullable<z.ZodString>;
            requestedCount: z.ZodNullable<z.ZodNumber>;
            keptCount: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strip>;
        text: z.ZodString;
    }, z.core.$strip>>;
    fullSavedToProfile: z.ZodBoolean;
}, z.core.$strip>;
/**
 * The client's own request id as it travels: 8-4-4-4-12 hex, any case and any
 * version nibble. Wider than `z.string().uuid()` on purpose: the chat extension
 * froze this form for the ids it mints, and the value is only compared with the
 * request id of an AI request the caller already made. Spelled without a flag,
 * so the OpenAPI document states the same pattern.
 */
export declare const CLIENT_REQUEST_ID_PATTERN: RegExp;
/**
 * Known `reason` values of 409 `generation_not_eligible`: why a stored
 * generation of the caller will never become the dossier. On the wire an open
 * token; append-only.
 * - `not_full_summary`: not a `fan-summary`, or not its full mode;
 * - `not_completed`: the generation failed or was cancelled;
 * - `stop_reason_missing`: it recorded no stop reason, so nothing proves it ended;
 * - `output_exhausted`: its output ran into the limit (`max_tokens`, `length`);
 * - `empty`: it has no text;
 * - `context_scope`: its context held something only its caller saw;
 * - `too_long`: its text is longer than a dossier may be;
 * - `superseded`: the fan's dossier already holds a text that is not older.
 *   The one reason that says nothing against the generation: a client may show
 *   it as information rather than as a failed save.
 */
export declare const CLIENT_GENERATION_NOT_ELIGIBLE_REASONS: readonly ["not_full_summary", "not_completed", "stop_reason_missing", "output_exhausted", "empty", "context_scope", "too_long", "superseded"];
export type ClientGenerationNotEligibleReason = (typeof CLIENT_GENERATION_NOT_ELIGIBLE_REASONS)[number];
export declare const clientFanProfileFromGenerationBodySchema: z.ZodObject<{
    generationRef: z.ZodString;
    clientRequestId: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const clientFanProfileFromGenerationResponseSchema: z.ZodObject<{
    outcome: z.ZodEnum<{
        created: "created";
        existing: "existing";
    }>;
    profile: z.ZodObject<{
        version: z.ZodNumber;
        createdAt: z.ZodString;
        sourceGeneratedAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
/** At most this many days in one answer. */
export declare const CLIENT_AI_USAGE_MAX_DAYS = 7;
/** `date` may lie this many days before today (today in `timeZone`), no further. */
export declare const CLIENT_AI_USAGE_MAX_AGE_DAYS = 8;
/** Known values of `days[].coverage`. On the wire an open token. */
export declare const CLIENT_AI_USAGE_COVERAGE: readonly ["complete", "partial"];
/** Known values of `days[].coverageReasons`: why a day's numbers may still change or are not exact. */
export declare const CLIENT_AI_USAGE_COVERAGE_REASONS: readonly ["day_open", "open_reservations", "approximate_cost"];
/** The `reason` beside this route's 400 `bad_request`. */
export declare const CLIENT_AI_USAGE_REFUSAL_REASONS: readonly ["unknown_time_zone", "date_in_future", "date_too_old"];
export type ClientAiUsageCoverage = (typeof CLIENT_AI_USAGE_COVERAGE)[number];
export type ClientAiUsageCoverageReason = (typeof CLIENT_AI_USAGE_COVERAGE_REASONS)[number];
export type ClientAiUsageRefusalReason = (typeof CLIENT_AI_USAGE_REFUSAL_REASONS)[number];
export declare const clientAiUsageQuerySchema: z.ZodObject<{
    date: z.ZodString;
    days: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    timeZone: z.ZodDefault<z.ZodString>;
}, z.core.$strict>;
export declare const clientAiUsageTotalsSchema: z.ZodObject<{
    requestCount: z.ZodNumber;
    costMicroUsd: z.ZodNumber;
    costApproximate: z.ZodBoolean;
    tokens: z.ZodObject<{
        input: z.ZodNumber;
        output: z.ZodNumber;
        cacheWrite: z.ZodNumber;
        cacheRead: z.ZodNumber;
    }, z.core.$strip>;
    completed: z.ZodNumber;
    failed: z.ZodNumber;
    cancelled: z.ZodNumber;
    quotaDenied: z.ZodNumber;
    openReservations: z.ZodNumber;
    regenerations: z.ZodNumber;
}, z.core.$strip>;
export declare const clientAiUsageDaySchema: z.ZodObject<{
    date: z.ZodString;
    from: z.ZodString;
    toExclusive: z.ZodString;
    coverage: z.ZodString;
    coverageReasons: z.ZodArray<z.ZodString>;
    totals: z.ZodObject<{
        requestCount: z.ZodNumber;
        costMicroUsd: z.ZodNumber;
        costApproximate: z.ZodBoolean;
        tokens: z.ZodObject<{
            input: z.ZodNumber;
            output: z.ZodNumber;
            cacheWrite: z.ZodNumber;
            cacheRead: z.ZodNumber;
        }, z.core.$strip>;
        completed: z.ZodNumber;
        failed: z.ZodNumber;
        cancelled: z.ZodNumber;
        quotaDenied: z.ZodNumber;
        openReservations: z.ZodNumber;
        regenerations: z.ZodNumber;
    }, z.core.$strip>;
    features: z.ZodArray<z.ZodObject<{
        requestCount: z.ZodNumber;
        costMicroUsd: z.ZodNumber;
        costApproximate: z.ZodBoolean;
        tokens: z.ZodObject<{
            input: z.ZodNumber;
            output: z.ZodNumber;
            cacheWrite: z.ZodNumber;
            cacheRead: z.ZodNumber;
        }, z.core.$strip>;
        completed: z.ZodNumber;
        failed: z.ZodNumber;
        cancelled: z.ZodNumber;
        quotaDenied: z.ZodNumber;
        openReservations: z.ZodNumber;
        regenerations: z.ZodNumber;
        feature: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const clientAiUsageResponseSchema: z.ZodObject<{
    scope: z.ZodObject<{
        pageLabel: z.ZodString;
        userId: z.ZodNumber;
    }, z.core.$strip>;
    timeZone: z.ZodString;
    asOf: z.ZodString;
    moneyUnit: z.ZodLiteral<"micro-USD">;
    days: z.ZodArray<z.ZodObject<{
        date: z.ZodString;
        from: z.ZodString;
        toExclusive: z.ZodString;
        coverage: z.ZodString;
        coverageReasons: z.ZodArray<z.ZodString>;
        totals: z.ZodObject<{
            requestCount: z.ZodNumber;
            costMicroUsd: z.ZodNumber;
            costApproximate: z.ZodBoolean;
            tokens: z.ZodObject<{
                input: z.ZodNumber;
                output: z.ZodNumber;
                cacheWrite: z.ZodNumber;
                cacheRead: z.ZodNumber;
            }, z.core.$strip>;
            completed: z.ZodNumber;
            failed: z.ZodNumber;
            cancelled: z.ZodNumber;
            quotaDenied: z.ZodNumber;
            openReservations: z.ZodNumber;
            regenerations: z.ZodNumber;
        }, z.core.$strip>;
        features: z.ZodArray<z.ZodObject<{
            requestCount: z.ZodNumber;
            costMicroUsd: z.ZodNumber;
            costApproximate: z.ZodBoolean;
            tokens: z.ZodObject<{
                input: z.ZodNumber;
                output: z.ZodNumber;
                cacheWrite: z.ZodNumber;
                cacheRead: z.ZodNumber;
            }, z.core.$strip>;
            completed: z.ZodNumber;
            failed: z.ZodNumber;
            cancelled: z.ZodNumber;
            quotaDenied: z.ZodNumber;
            openReservations: z.ZodNumber;
            regenerations: z.ZodNumber;
            feature: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    quota: z.ZodNullable<z.ZodObject<{
        dayBoundary: z.ZodLiteral<"UTC">;
        remainingRequestsToday: z.ZodNullable<z.ZodNumber>;
        remainingMicroUsdToday: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>;
/** The longest range one read may span, in days. */
export declare const ADMIN_CLIENT_HEALTH_MAX_RANGE_DAYS = 366;
export declare const adminClientHealthQuerySchema: z.ZodObject<{
    from: z.ZodString;
    to: z.ZodString;
    clientName: z.ZodOptional<z.ZodString>;
    metric: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
/**
 * One perf metric of one client group over the range, read off the buckets
 * merged across every report and hour of it (a percentile is never averaged
 * from parts). Milliseconds.
 *
 * A group with fewer than `minGroupSize` observations in the range asked for is
 * `suppressed`: it shows how many observations it has and no figure of them
 * (mean, max and both percentiles are null). The floor is on the range of one
 * read and no narrower: see the route's description.
 */
export declare const adminClientHealthPerfRowSchema: z.ZodObject<{
    clientName: z.ZodString;
    clientVersion: z.ZodString;
    hostKind: z.ZodString;
    hostBuild: z.ZodNullable<z.ZodString>;
    metric: z.ZodString;
    schemaVersion: z.ZodNumber;
    count: z.ZodNumber;
    mean: z.ZodNullable<z.ZodNumber>;
    max: z.ZodNullable<z.ZodNumber>;
    p50: z.ZodNullable<z.ZodNumber>;
    p95: z.ZodNullable<z.ZodNumber>;
    suppressed: z.ZodBoolean;
}, z.core.$strip>;
/**
 * The host-contract verdicts of one client version on one host build: counts of
 * reports, shown at any size (a build that breaks the contract shows from its
 * first report).
 */
export declare const adminClientHealthContractRowSchema: z.ZodObject<{
    clientVersion: z.ZodString;
    hostBuild: z.ZodNullable<z.ZodString>;
    reports: z.ZodNumber;
    failedReports: z.ZodNumber;
    missing: z.ZodArray<z.ZodObject<{
        anchor: z.ZodString;
        reports: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
/**
 * The client's own footprint by client version: the 95th percentile, over
 * reports, of the size of its caches and logs (KB) and of the largest number of
 * its own DOM nodes in a report's window. Null under `minGroupSize` reports.
 */
export declare const adminClientHealthFootprintRowSchema: z.ZodObject<{
    clientVersion: z.ZodString;
    cachesKBp95: z.ZodNullable<z.ZodNumber>;
    logsKBp95: z.ZodNullable<z.ZodNumber>;
    domNodesP95: z.ZodNullable<z.ZodNumber>;
}, z.core.$strip>;
export declare const adminClientHealthResponseSchema: z.ZodObject<{
    range: z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
        timeZone: z.ZodString;
    }, z.core.$strip>;
    minGroupSize: z.ZodNumber;
    perf: z.ZodArray<z.ZodObject<{
        clientName: z.ZodString;
        clientVersion: z.ZodString;
        hostKind: z.ZodString;
        hostBuild: z.ZodNullable<z.ZodString>;
        metric: z.ZodString;
        schemaVersion: z.ZodNumber;
        count: z.ZodNumber;
        mean: z.ZodNullable<z.ZodNumber>;
        max: z.ZodNullable<z.ZodNumber>;
        p50: z.ZodNullable<z.ZodNumber>;
        p95: z.ZodNullable<z.ZodNumber>;
        suppressed: z.ZodBoolean;
    }, z.core.$strip>>;
    contract: z.ZodArray<z.ZodObject<{
        clientVersion: z.ZodString;
        hostBuild: z.ZodNullable<z.ZodString>;
        reports: z.ZodNumber;
        failedReports: z.ZodNumber;
        missing: z.ZodArray<z.ZodObject<{
            anchor: z.ZodString;
            reports: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    counters: z.ZodArray<z.ZodObject<{
        code: z.ZodString;
        total: z.ZodNumber;
    }, z.core.$strip>>;
    footprint: z.ZodArray<z.ZodObject<{
        clientVersion: z.ZodString;
        cachesKBp95: z.ZodNullable<z.ZodNumber>;
        logsKBp95: z.ZodNullable<z.ZodNumber>;
        domNodesP95: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>;
    asOf: z.ZodString;
}, z.core.$strip>;
export declare const clientRouteSchemas: {
    readonly clientBootstrap: {
        readonly auth: {
            readonly kind: "apiKey";
        };
        readonly tags: readonly ["client"];
        readonly summary: "Chat-extension bootstrap: who the caller is, their pages, switches, limits and the hub's capabilities";
        readonly description: string;
        readonly response: {
            readonly 200: z.ZodObject<{
                protocol: z.ZodNumber;
                issuedAt: z.ZodString;
                ttlSec: z.ZodNumber;
                configRevision: z.ZodNumber;
                minVersion: z.ZodString;
                identity: z.ZodObject<{
                    userId: z.ZodNumber;
                    username: z.ZodString;
                    role: z.ZodString;
                    tokenClient: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
                pages: z.ZodArray<z.ZodObject<{
                    pageId: z.ZodNumber;
                    pageLabel: z.ZodString;
                    title: z.ZodString;
                    platform: z.ZodString;
                    platformAccountId: z.ZodNullable<z.ZodString>;
                    bindingRevision: z.ZodNumber;
                    features: z.ZodRecord<z.ZodString, z.ZodObject<{
                        available: z.ZodBoolean;
                        reason: z.ZodOptional<z.ZodString>;
                    }, z.core.$strip>>;
                }, z.core.$strip>>;
                bindingsByHost: z.ZodRecord<z.ZodString, z.ZodNumber>;
                flags: z.ZodRecord<z.ZodString, z.ZodBoolean>;
                limits: z.ZodObject<{
                    freshTextMaxItems: z.ZodNumber;
                    freshTextMaxChars: z.ZodNumber;
                    feedMax: z.ZodNumber;
                    deepMax: z.ZodNumber;
                    audienceWindowHours: z.ZodNumber;
                    claimLeaseSec: z.ZodNumber;
                    claimRenewSec: z.ZodNumber;
                    claimActivityWindowSec: z.ZodNumber;
                    previewSendPerMinute: z.ZodNumber;
                    navInsertTimeoutSec: z.ZodNumber;
                    dispatchTicketSec: z.ZodNumber;
                    previewSendReceiptProfiles: z.ZodArray<z.ZodObject<{
                        id: z.ZodString;
                        adapterVersion: z.ZodString;
                        modules: z.ZodRecord<z.ZodString, z.ZodString>;
                    }, z.core.$strip>>;
                }, z.core.$strip>;
                capabilities: z.ZodArray<z.ZodString>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        };
    };
    readonly clientConversationRecaps: {
        readonly auth: {
            readonly kind: "apiKey";
            readonly scope: "page";
        };
        readonly tags: readonly ["client"];
        readonly summary: "The shared full and short recap of one fan on one page, with their text";
        readonly description: string;
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
            fanRef: z.ZodString;
        }, z.core.$strip>;
        readonly querystring: z.ZodObject<{
            personaDefinitionId: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>;
        readonly response: {
            readonly 200: z.ZodObject<{
                full: z.ZodNullable<z.ZodObject<{
                    generationRef: z.ZodString;
                    generatedAt: z.ZodString;
                    personaDefinitionId: z.ZodNullable<z.ZodString>;
                    coverage: z.ZodObject<{
                        transcriptCoverage: z.ZodNullable<z.ZodString>;
                        requestedCount: z.ZodNullable<z.ZodNumber>;
                        keptCount: z.ZodNullable<z.ZodNumber>;
                    }, z.core.$strip>;
                    text: z.ZodString;
                }, z.core.$strip>>;
                short: z.ZodNullable<z.ZodObject<{
                    generationRef: z.ZodString;
                    generatedAt: z.ZodString;
                    personaDefinitionId: z.ZodNullable<z.ZodString>;
                    coverage: z.ZodObject<{
                        transcriptCoverage: z.ZodNullable<z.ZodString>;
                        requestedCount: z.ZodNullable<z.ZodNumber>;
                        keptCount: z.ZodNullable<z.ZodNumber>;
                    }, z.core.$strip>;
                    text: z.ZodString;
                }, z.core.$strip>>;
                fullSavedToProfile: z.ZodBoolean;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        };
    };
    readonly clientFanProfileFromGeneration: {
        readonly auth: {
            readonly kind: "apiKey";
            readonly scope: "page";
        };
        readonly tags: readonly ["client"];
        readonly summary: "Save a finished full recap as the fan's dossier, from the generation the hub stored";
        readonly description: string;
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
            fanRef: z.ZodString;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{
            generationRef: z.ZodString;
            clientRequestId: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>;
        readonly response: {
            readonly 200: z.ZodObject<{
                outcome: z.ZodEnum<{
                    created: "created";
                    existing: "existing";
                }>;
                profile: z.ZodObject<{
                    version: z.ZodNumber;
                    createdAt: z.ZodString;
                    sourceGeneratedAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        };
    };
    readonly clientAiUsageDaily: {
        readonly auth: {
            readonly kind: "apiKey";
            readonly scope: "page";
        };
        readonly tags: readonly ["client"];
        readonly summary: "The caller's own AI spend on one page, by day";
        readonly description: string;
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strip>;
        readonly querystring: z.ZodObject<{
            date: z.ZodString;
            days: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            timeZone: z.ZodDefault<z.ZodString>;
        }, z.core.$strict>;
        readonly response: {
            readonly 200: z.ZodObject<{
                scope: z.ZodObject<{
                    pageLabel: z.ZodString;
                    userId: z.ZodNumber;
                }, z.core.$strip>;
                timeZone: z.ZodString;
                asOf: z.ZodString;
                moneyUnit: z.ZodLiteral<"micro-USD">;
                days: z.ZodArray<z.ZodObject<{
                    date: z.ZodString;
                    from: z.ZodString;
                    toExclusive: z.ZodString;
                    coverage: z.ZodString;
                    coverageReasons: z.ZodArray<z.ZodString>;
                    totals: z.ZodObject<{
                        requestCount: z.ZodNumber;
                        costMicroUsd: z.ZodNumber;
                        costApproximate: z.ZodBoolean;
                        tokens: z.ZodObject<{
                            input: z.ZodNumber;
                            output: z.ZodNumber;
                            cacheWrite: z.ZodNumber;
                            cacheRead: z.ZodNumber;
                        }, z.core.$strip>;
                        completed: z.ZodNumber;
                        failed: z.ZodNumber;
                        cancelled: z.ZodNumber;
                        quotaDenied: z.ZodNumber;
                        openReservations: z.ZodNumber;
                        regenerations: z.ZodNumber;
                    }, z.core.$strip>;
                    features: z.ZodArray<z.ZodObject<{
                        requestCount: z.ZodNumber;
                        costMicroUsd: z.ZodNumber;
                        costApproximate: z.ZodBoolean;
                        tokens: z.ZodObject<{
                            input: z.ZodNumber;
                            output: z.ZodNumber;
                            cacheWrite: z.ZodNumber;
                            cacheRead: z.ZodNumber;
                        }, z.core.$strip>;
                        completed: z.ZodNumber;
                        failed: z.ZodNumber;
                        cancelled: z.ZodNumber;
                        quotaDenied: z.ZodNumber;
                        openReservations: z.ZodNumber;
                        regenerations: z.ZodNumber;
                        feature: z.ZodString;
                    }, z.core.$strip>>;
                }, z.core.$strip>>;
                quota: z.ZodNullable<z.ZodObject<{
                    dayBoundary: z.ZodLiteral<"UTC">;
                    remainingRequestsToday: z.ZodNullable<z.ZodNumber>;
                    remainingMicroUsdToday: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        };
    };
    readonly adminClientHealth: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Owner view of the chat extension's health: speed, host contract, counters and footprint by client version";
        readonly description: string;
        readonly querystring: z.ZodObject<{
            from: z.ZodString;
            to: z.ZodString;
            clientName: z.ZodOptional<z.ZodString>;
            metric: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>;
        readonly response: {
            readonly 200: z.ZodObject<{
                range: z.ZodObject<{
                    from: z.ZodString;
                    to: z.ZodString;
                    timeZone: z.ZodString;
                }, z.core.$strip>;
                minGroupSize: z.ZodNumber;
                perf: z.ZodArray<z.ZodObject<{
                    clientName: z.ZodString;
                    clientVersion: z.ZodString;
                    hostKind: z.ZodString;
                    hostBuild: z.ZodNullable<z.ZodString>;
                    metric: z.ZodString;
                    schemaVersion: z.ZodNumber;
                    count: z.ZodNumber;
                    mean: z.ZodNullable<z.ZodNumber>;
                    max: z.ZodNullable<z.ZodNumber>;
                    p50: z.ZodNullable<z.ZodNumber>;
                    p95: z.ZodNullable<z.ZodNumber>;
                    suppressed: z.ZodBoolean;
                }, z.core.$strip>>;
                contract: z.ZodArray<z.ZodObject<{
                    clientVersion: z.ZodString;
                    hostBuild: z.ZodNullable<z.ZodString>;
                    reports: z.ZodNumber;
                    failedReports: z.ZodNumber;
                    missing: z.ZodArray<z.ZodObject<{
                        anchor: z.ZodString;
                        reports: z.ZodNumber;
                    }, z.core.$strip>>;
                }, z.core.$strip>>;
                counters: z.ZodArray<z.ZodObject<{
                    code: z.ZodString;
                    total: z.ZodNumber;
                }, z.core.$strip>>;
                footprint: z.ZodArray<z.ZodObject<{
                    clientVersion: z.ZodString;
                    cachesKBp95: z.ZodNullable<z.ZodNumber>;
                    logsKBp95: z.ZodNullable<z.ZodNumber>;
                    domNodesP95: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strip>>;
                asOf: z.ZodString;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        };
    };
};
export type ClientFeatureAvailability = z.infer<typeof clientFeatureAvailabilitySchema>;
export type ClientReceiptProfile = z.infer<typeof clientReceiptProfileSchema>;
export type ClientBootstrapPage = z.infer<typeof clientBootstrapPageSchema>;
export type ClientBootstrapLimits = z.infer<typeof clientBootstrapLimitsSchema>;
export type ClientBootstrapResponse = z.infer<typeof clientBootstrapResponseSchema>;
export type ClientConversationRecapsQuery = z.infer<typeof clientConversationRecapsQuerySchema>;
export type ClientRecapBody = z.infer<typeof clientRecapBodySchema>;
export type ClientConversationRecapsResponse = z.infer<typeof clientConversationRecapsResponseSchema>;
export type ClientFanProfileFromGenerationBody = z.infer<typeof clientFanProfileFromGenerationBodySchema>;
export type ClientFanProfileFromGenerationResponse = z.infer<typeof clientFanProfileFromGenerationResponseSchema>;
export type ClientAiUsageQuery = z.infer<typeof clientAiUsageQuerySchema>;
export type ClientAiUsageTotals = z.infer<typeof clientAiUsageTotalsSchema>;
export type ClientAiUsageDay = z.infer<typeof clientAiUsageDaySchema>;
export type ClientAiUsageResponse = z.infer<typeof clientAiUsageResponseSchema>;
export type AdminClientHealthQuery = z.infer<typeof adminClientHealthQuerySchema>;
export type AdminClientHealthResponse = z.infer<typeof adminClientHealthResponseSchema>;
/** The `ingestObservations` event kind of a health report. */
export declare const CLIENT_HEALTH_INGEST_KIND = "client_health";
/**
 * A code, never free text (the client's HEALTH_CODE_PATTERN): error and P1
 * codes, contract anchors, switched-off features, metric names, the host kind.
 */
export declare const CLIENT_HEALTH_CODE_PATTERN: RegExp;
/**
 * The perf metrics and the fixed upper bounds (ms) of their buckets, as the
 * client froze them (`PERF_METRICS`, contracts v1.0.0): the client builds every
 * histogram from these, and the hub checks a histogram against them before it
 * merges one.
 *
 * Buckets: a histogram with n bounds has n + 1 counts. counts[0] holds values
 * ≤ bounds[0]; counts[i] values in (bounds[i-1], bounds[i]]; counts[n] values
 * above bounds[n-1] (that bucket tops out at the histogram's `max`).
 *
 * The bounds and meaning of one (metric, schemaVersion) never change: new
 * bounds or a new meaning are a new schemaVersion, and the registry is
 * append-only.
 */
export declare const CLIENT_HEALTH_PERF_METRICS: {
    /** Route change → dock updated. */
    readonly routeToDockMs: {
        readonly unit: "ms";
        readonly schemaVersion: 1;
        readonly bounds: readonly [1, 2, 4, 8, 16, 32, 50, 75, 100, 150, 250, 500, 1000];
    };
    /** Hotkey or click → visible response. */
    readonly panelOpenMs: {
        readonly unit: "ms";
        readonly schemaVersion: 1;
        readonly bounds: readonly [4, 8, 16, 32, 50, 75, 100, 150, 250, 500, 1000, 2500];
    };
    /** Click → request sent: the client's own overhead. */
    readonly requestOverheadMs: {
        readonly unit: "ms";
        readonly schemaVersion: 1;
        readonly bounds: readonly [1, 2, 4, 8, 16, 32, 50, 100, 250, 500];
    };
    /** Click → first chunk, end to end (provider latency included). */
    readonly ttfcMs: {
        readonly unit: "ms";
        readonly schemaVersion: 1;
        readonly bounds: readonly [250, 500, 1000, 1500, 2000, 3000, 4000, 6000, 8000, 12000, 20000, 30000, 60000];
    };
    /** First chunk → painted. */
    readonly firstChunkPaintMs: {
        readonly unit: "ms";
        readonly schemaVersion: 1;
        readonly bounds: readonly [4, 8, 16, 32, 50, 75, 100, 150, 250, 500];
    };
    /** Guarded insert with verification. */
    readonly insertMs: {
        readonly unit: "ms";
        readonly schemaVersion: 1;
        readonly bounds: readonly [4, 8, 16, 32, 50, 75, 100, 150, 250, 500, 1000];
    };
    /** Board open from cache. */
    readonly boardOpenMs: {
        readonly unit: "ms";
        readonly schemaVersion: 1;
        readonly bounds: readonly [8, 16, 32, 50, 75, 100, 150, 250, 500, 1000, 2500];
    };
    /** Search over up to 1000 rows. */
    readonly searchMs: {
        readonly unit: "ms";
        readonly schemaVersion: 1;
        readonly bounds: readonly [1, 2, 4, 8, 16, 32, 50, 100, 250, 500];
    };
    /** The client's synchronous handlers, sampled 1 in 20. */
    readonly handlerMs: {
        readonly unit: "ms";
        readonly schemaVersion: 1;
        readonly bounds: readonly [0.1, 0.5, 1, 2, 4, 8, 16, 50, 100];
    };
    /** Event Timing of the client's hotkeys and clicks → next paint. */
    readonly eventLatencyMs: {
        readonly unit: "ms";
        readonly schemaVersion: 1;
        readonly bounds: readonly [8, 16, 24, 32, 50, 75, 100, 150, 250, 500, 1000];
    };
    /** Input delay in the host's composer with the extension on. */
    readonly composerInputDelayMs: {
        readonly unit: "ms";
        readonly schemaVersion: 1;
        readonly bounds: readonly [1, 2, 4, 8, 16, 32, 50, 100, 250];
    };
};
export type ClientHealthPerfMetricName = keyof typeof CLIENT_HEALTH_PERF_METRICS;
/**
 * One perf metric over the report window. Percentiles are the hub's job: it
 * computes them from buckets merged across reports, never from the client's.
 */
export declare const clientHealthPerfHistogramSchema: z.ZodObject<{
    metric: z.ZodString;
    unit: z.ZodLiteral<"ms">;
    schemaVersion: z.ZodNumber;
    bounds: z.ZodArray<z.ZodNumber>;
    counts: z.ZodArray<z.ZodNumber>;
    count: z.ZodNumber;
    sum: z.ZodNumber;
    max: z.ZodNumber;
}, z.core.$strict>;
export declare const clientHealthReportV1Schema: z.ZodObject<{
    v: z.ZodLiteral<1>;
    window: z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
    }, z.core.$strict>;
    client: z.ZodObject<{
        name: z.ZodLiteral<"chat-extension">;
        version: z.ZodString;
        browser: z.ZodLiteral<"firefox">;
        browserMajor: z.ZodNumber;
        os: z.ZodEnum<{
            other: "other";
            windows: "windows";
            macos: "macos";
            linux: "linux";
        }>;
    }, z.core.$strict>;
    host: z.ZodObject<{
        kind: z.ZodString;
        build: z.ZodNullable<z.ZodString>;
        contractOk: z.ZodBoolean;
        missing: z.ZodArray<z.ZodString>;
    }, z.core.$strict>;
    disabled: z.ZodArray<z.ZodString>;
    perf: z.ZodArray<z.ZodObject<{
        metric: z.ZodString;
        unit: z.ZodLiteral<"ms">;
        schemaVersion: z.ZodNumber;
        bounds: z.ZodArray<z.ZodNumber>;
        counts: z.ZodArray<z.ZodNumber>;
        count: z.ZodNumber;
        sum: z.ZodNumber;
        max: z.ZodNumber;
    }, z.core.$strict>>;
    counters: z.ZodRecord<z.ZodString, z.ZodNumber>;
    footprint: z.ZodObject<{
        kind: z.ZodLiteral<"owned-estimate">;
        cachesKB: z.ZodNumber;
        logsKB: z.ZodNumber;
    }, z.core.$strict>;
}, z.core.$strict>;
export type ClientHealthPerfHistogram = z.infer<typeof clientHealthPerfHistogramSchema>;
export type ClientHealthReportV1 = z.infer<typeof clientHealthReportV1Schema>;
