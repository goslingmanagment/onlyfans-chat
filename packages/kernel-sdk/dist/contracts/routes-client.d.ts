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
/**
 * The `reason` beside 400 `bad_request` on a client read that takes a cursor:
 * the cursor is not one this hub issued for this request (forged or cut,
 * issued for something else than the read binds its cursors to, or past the
 * read's lifetime). The answer never says which. Not retried as is: the client
 * reads the first page again. What each read binds a cursor to, and for how
 * long:
 * - the awaiting-reply queue (`clientSpenderAwaitingReply`): the page and the
 *   person; a cursor is good for an hour after the page that carried it.
 * - the archive feed (`clientConversationFeed`): the page, the fan, the person,
 *   the reader and the archive generation; a walk ends a day after its first
 *   page.
 */
export declare const CLIENT_CURSOR_REFUSAL_REASONS: readonly ["cursor_invalid"];
export type ClientCursorRefusalReason = (typeof CLIENT_CURSOR_REFUSAL_REASONS)[number];
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
/** The most rows one page carries; the bootstrap announces it as `limits.feedMax`. */
export declare const CLIENT_FEED_MAX_LIMIT = 100;
export declare const CLIENT_FEED_DEFAULT_LIMIT = 50;
/** The first page's summary reads this many of the newest messages unless the query says otherwise: the Ping window. */
export declare const CLIENT_FEED_SUMMARY_WINDOW_DEFAULT = 100;
export declare const CLIENT_FEED_SUMMARY_WINDOW_MIN = 5;
/** The transcript readers' own cap. The deeper read (3000) is the full Recap's alone: a feed page never makes it. */
export declare const CLIENT_FEED_SUMMARY_WINDOW_MAX = 1500;
/** Known values of the feed's `source`. On the wire an open token. The AI
 *  context frame names the same readers (`AI_CONTEXT_SOURCES` in routes.ts). */
export declare const CLIENT_FEED_SOURCES: readonly ["archive", "union"];
/** Known values of `sender` (a row's and the head's). On the wire an open token. */
export declare const CLIENT_FEED_SENDERS: readonly ["fan", "model", "system", "unknown"];
/**
 * Known values of `summary.pingSegment`. On the wire an open token. This hub
 * answers the segment a Ping generation would be given for the same messages
 * (`active`, `segment-a`, `segment-b`); `unknown` is what a client reads any
 * other value as, and what it shows when `summary` is null.
 */
export declare const CLIENT_FEED_PING_SEGMENTS: readonly ["active", "segment-a", "segment-b", "unknown"];
export type ClientFeedSource = (typeof CLIENT_FEED_SOURCES)[number];
export type ClientFeedSender = (typeof CLIENT_FEED_SENDERS)[number];
export type ClientFeedPingSegment = (typeof CLIENT_FEED_PING_SEGMENTS)[number];
export declare const clientConversationFeedQuerySchema: z.ZodObject<{
    cursor: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    summaryWindow: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
}, z.core.$strict>;
export declare const clientFeedItemSchema: z.ZodObject<{
    messageId: z.ZodString;
    at: z.ZodNullable<z.ZodString>;
    sender: z.ZodString;
    text: z.ZodString;
    automatic: z.ZodNullable<z.ZodBoolean>;
    deleted: z.ZodBoolean;
    tipMills: z.ZodNullable<z.ZodNumber>;
    priceMills: z.ZodNullable<z.ZodNumber>;
    attachmentLabels: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
/** The newest message a generation would read from this reader: live, never a deleted one. */
export declare const clientFeedHeadSchema: z.ZodObject<{
    messageRef: z.ZodString;
    at: z.ZodNullable<z.ZodString>;
    sender: z.ZodString;
}, z.core.$strip>;
export declare const clientFeedSummarySchema: z.ZodObject<{
    pingSegment: z.ZodString;
    fanSilenceDays: z.ZodNullable<z.ZodNumber>;
    window: z.ZodObject<{
        requested: z.ZodNumber;
        served: z.ZodNumber;
    }, z.core.$strip>;
    coverage: z.ZodString;
    asOf: z.ZodString;
}, z.core.$strip>;
export declare const clientConversationFeedResponseSchema: z.ZodObject<{
    target: z.ZodObject<{
        pageLabel: z.ZodString;
        fanRef: z.ZodString;
    }, z.core.$strip>;
    source: z.ZodString;
    snapshotRevision: z.ZodString;
    asOf: z.ZodString;
    coverage: z.ZodString;
    head: z.ZodNullable<z.ZodObject<{
        messageRef: z.ZodString;
        at: z.ZodNullable<z.ZodString>;
        sender: z.ZodString;
    }, z.core.$strip>>;
    newestKnownAt: z.ZodNullable<z.ZodString>;
    nextOlderCursor: z.ZodNullable<z.ZodString>;
    items: z.ZodArray<z.ZodObject<{
        messageId: z.ZodString;
        at: z.ZodNullable<z.ZodString>;
        sender: z.ZodString;
        text: z.ZodString;
        automatic: z.ZodNullable<z.ZodBoolean>;
        deleted: z.ZodBoolean;
        tipMills: z.ZodNullable<z.ZodNumber>;
        priceMills: z.ZodNullable<z.ZodNumber>;
        attachmentLabels: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    summary: z.ZodNullable<z.ZodObject<{
        pingSegment: z.ZodString;
        fanSilenceDays: z.ZodNullable<z.ZodNumber>;
        window: z.ZodObject<{
            requested: z.ZodNumber;
            served: z.ZodNumber;
        }, z.core.$strip>;
        coverage: z.ZodString;
        asOf: z.ZodString;
    }, z.core.$strip>>;
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
/** v1 serves one window length; another one is a new value of `windowDays`. */
export declare const CLIENT_SPENDER_STATS_WINDOW_DAYS = 30;
/**
 * Known values of `coverage.reasons`: why the answer is not `complete`. On the
 * wire open tokens; a client reads one it does not know as "partial".
 * - `no_revenue_history`: the page has no transaction and no spender
 *   projection, so nothing is known (`coverage.state` is `unknown`);
 * - `projection_missing`: the spender projection was never built; tiers,
 *   silence and the queue read it;
 * - `projection_behind`: a transaction is newer than the projection, so tier
 *   membership may lag the window totals;
 * - `history_starts_in_window`: the page's oldest transaction is inside the
 *   window; earlier days may be missing, and a new payer's first purchase is
 *   only the first one observed (`newPayers.firstPurchaseKnown` is false);
 * - `messages_missing`: the page has payers and no message at all, so every
 *   payer's silence is `unknown`.
 */
export declare const CLIENT_SPENDER_STATS_COVERAGE_REASONS: readonly ["no_revenue_history", "projection_missing", "projection_behind", "history_starts_in_window", "messages_missing"];
/**
 * The two `tiers[].key` rows after the hub's spender buckets, both without
 * bounds: `untiered` is window spend by fans in no tier, `unattributed` is
 * window spend whose transaction names no fan. With them the tiers' window
 * gross sums to `totals.d30.grossMills`.
 */
export declare const CLIENT_SPENDER_STATS_REMAINDER_TIER_KEYS: readonly ["untiered", "unattributed"];
/** The `reason` beside this route's 400 `bad_request`. */
export declare const CLIENT_SPENDER_STATS_REFUSAL_REASONS: readonly ["unknown_time_zone"];
export type ClientSpenderStatsCoverageReason = (typeof CLIENT_SPENDER_STATS_COVERAGE_REASONS)[number];
export type ClientSpenderStatsRefusalReason = (typeof CLIENT_SPENDER_STATS_REFUSAL_REASONS)[number];
export declare const clientSpenderStatsQuerySchema: z.ZodObject<{
    windowDays: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    timeZone: z.ZodString;
}, z.core.$strict>;
/** Money of one calendar window. */
export declare const clientSpenderStatsMoneyWindowSchema: z.ZodObject<{
    grossMills: z.ZodNumber;
    purchasesGrossMills: z.ZodNumber;
    adjustmentsMills: z.ZodNumber;
    creatorNetMills: z.ZodNumber;
    purchaseCount: z.ZodNumber;
    payerCount: z.ZodNumber;
}, z.core.$strip>;
export declare const clientSpenderStatsDaySchema: z.ZodObject<{
    date: z.ZodString;
    grossMills: z.ZodNumber;
    purchasesGrossMills: z.ZodNumber;
    adjustmentsMills: z.ZodNumber;
    creatorNetMills: z.ZodNumber;
    purchaseCount: z.ZodNumber;
    byState: z.ZodRecord<z.ZodString, z.ZodNumber>;
}, z.core.$strip>;
export declare const clientSpenderStatsTierSchema: z.ZodObject<{
    key: z.ZodString;
    label: z.ZodString;
    minMills: z.ZodNullable<z.ZodNumber>;
    maxMills: z.ZodNullable<z.ZodNumber>;
    members: z.ZodNumber;
    windowPayers: z.ZodNumber;
    windowGrossMills: z.ZodNumber;
}, z.core.$strip>;
export declare const clientSpenderStatsResponseSchema: z.ZodObject<{
    pageLabel: z.ZodString;
    metricVersion: z.ZodNumber;
    moneyUnit: z.ZodLiteral<"USD-mills">;
    basis: z.ZodLiteral<"gross">;
    timeZone: z.ZodString;
    from: z.ZodString;
    to: z.ZodString;
    asOf: z.ZodString;
    projectionAsOf: z.ZodNullable<z.ZodString>;
    includedStates: z.ZodArray<z.ZodString>;
    coverage: z.ZodObject<{
        state: z.ZodString;
        reasons: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    days: z.ZodArray<z.ZodObject<{
        date: z.ZodString;
        grossMills: z.ZodNumber;
        purchasesGrossMills: z.ZodNumber;
        adjustmentsMills: z.ZodNumber;
        creatorNetMills: z.ZodNumber;
        purchaseCount: z.ZodNumber;
        byState: z.ZodRecord<z.ZodString, z.ZodNumber>;
    }, z.core.$strip>>;
    totals: z.ZodObject<{
        today: z.ZodObject<{
            grossMills: z.ZodNumber;
            purchasesGrossMills: z.ZodNumber;
            adjustmentsMills: z.ZodNumber;
            creatorNetMills: z.ZodNumber;
            purchaseCount: z.ZodNumber;
            payerCount: z.ZodNumber;
        }, z.core.$strip>;
        d7: z.ZodObject<{
            grossMills: z.ZodNumber;
            purchasesGrossMills: z.ZodNumber;
            adjustmentsMills: z.ZodNumber;
            creatorNetMills: z.ZodNumber;
            purchaseCount: z.ZodNumber;
            payerCount: z.ZodNumber;
        }, z.core.$strip>;
        prev7: z.ZodObject<{
            grossMills: z.ZodNumber;
            purchasesGrossMills: z.ZodNumber;
            adjustmentsMills: z.ZodNumber;
            creatorNetMills: z.ZodNumber;
            purchaseCount: z.ZodNumber;
            payerCount: z.ZodNumber;
        }, z.core.$strip>;
        d30: z.ZodObject<{
            grossMills: z.ZodNumber;
            purchasesGrossMills: z.ZodNumber;
            adjustmentsMills: z.ZodNumber;
            creatorNetMills: z.ZodNumber;
            purchaseCount: z.ZodNumber;
            payerCount: z.ZodNumber;
        }, z.core.$strip>;
        d7DeltaPct: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>;
    avgCheckMills: z.ZodNullable<z.ZodNumber>;
    tiers: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        minMills: z.ZodNullable<z.ZodNumber>;
        maxMills: z.ZodNullable<z.ZodNumber>;
        members: z.ZodNumber;
        windowPayers: z.ZodNumber;
        windowGrossMills: z.ZodNumber;
    }, z.core.$strip>>;
    silence: z.ZodObject<{
        d8to21: z.ZodObject<{
            fans: z.ZodNumber;
            lifetimeGrossMills: z.ZodNumber;
        }, z.core.$strip>;
        over21: z.ZodObject<{
            fans: z.ZodNumber;
            lifetimeGrossMills: z.ZodNumber;
        }, z.core.$strip>;
        unknown: z.ZodObject<{
            fans: z.ZodNumber;
            lifetimeGrossMills: z.ZodNumber;
        }, z.core.$strip>;
    }, z.core.$strip>;
    newPayers: z.ZodObject<{
        count: z.ZodNumber;
        firstPurchaseKnown: z.ZodBoolean;
    }, z.core.$strip>;
    queueSummary: z.ZodObject<{
        total: z.ZodNumber;
        unknown: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
/** The most rows one page carries. */
export declare const CLIENT_SPENDER_AWAITING_REPLY_MAX_LIMIT = 100;
export declare const CLIENT_SPENDER_AWAITING_REPLY_DEFAULT_LIMIT = 50;
/**
 * Known values of `readState`. On the wire an open token; a client reads one
 * it does not know as `unknown`.
 * - `unread`: the chat has unread fan messages (`unreadCount` says how many);
 * - `read`: nothing is unread and the chat's newest message is the fan's;
 * - `unknown`: the fan wrote after the page's last message, but the hub cannot
 *   tell whether it was read. Its own category, never folded into the other
 *   two; `unreadCount` is null.
 */
export declare const CLIENT_SPENDER_AWAITING_REPLY_READ_STATES: readonly ["unread", "read", "unknown"];
export type ClientSpenderAwaitingReplyReadState = (typeof CLIENT_SPENDER_AWAITING_REPLY_READ_STATES)[number];
export declare const clientSpenderAwaitingReplyQuerySchema: z.ZodObject<{
    cursor: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strict>;
export declare const clientSpenderAwaitingReplyItemSchema: z.ZodObject<{
    fanRef: z.ZodString;
    username: z.ZodNullable<z.ZodString>;
    displayName: z.ZodNullable<z.ZodString>;
    lifetimeGrossMills: z.ZodNumber;
    lastFanMessageAt: z.ZodString;
    lastModelMessageAt: z.ZodNullable<z.ZodString>;
    unreadCount: z.ZodNullable<z.ZodNumber>;
    readState: z.ZodString;
}, z.core.$strip>;
export declare const clientSpenderAwaitingReplyResponseSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        fanRef: z.ZodString;
        username: z.ZodNullable<z.ZodString>;
        displayName: z.ZodNullable<z.ZodString>;
        lifetimeGrossMills: z.ZodNumber;
        lastFanMessageAt: z.ZodString;
        lastModelMessageAt: z.ZodNullable<z.ZodString>;
        unreadCount: z.ZodNullable<z.ZodNumber>;
        readState: z.ZodString;
    }, z.core.$strip>>;
    total: z.ZodNumber;
    loaded: z.ZodNumber;
    unknown: z.ZodNumber;
    nextCursor: z.ZodNullable<z.ZodString>;
    asOf: z.ZodString;
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
export declare const CLIENT_CLAIM_ACTIONS: readonly ["claim", "renew", "release", "dispatch", "sent", "failed", "registerNativeSend"];
export declare const CLIENT_GREETING_STATES: readonly ["none", "confirmed"];
export declare const CLIENT_LEASE_STATES: readonly ["none", "owned", "held", "expired", "released"];
/** The holder of a lease is never named: only whether it is the caller elsewhere. */
export declare const CLIENT_LEASE_HOLDERS: readonly ["you-elsewhere", "someone-else"];
export declare const CLIENT_CUSTODY_STATES: readonly ["dispatching", "sent", "failed", "uncertain-held", "resolved-sent", "resolved-not-sent"];
/**
 * Known values of `greeting.source`; on the wire an open token. `desktop-outbox`:
 * the desktop's new-follower command that OnlyFans confirmed greeted the fan.
 */
export declare const CLIENT_GREETING_SOURCES: readonly ["preview-send", "native-register", "resolve", "desktop-outbox"];
export declare const CLIENT_SEND_PURPOSES: readonly ["greeting", "preview-reply"];
export declare const CLIENT_SEND_FAILURE_REASONS: readonly ["not_enqueued", "native_rejected"];
/** A group has at most this many variants (Hi) and parts. */
export declare const CLIENT_CLAIM_MAX_VARIANTS = 3;
export declare const CLIENT_CLAIM_MAX_PARTS = 10;
export type ClientClaimAction = (typeof CLIENT_CLAIM_ACTIONS)[number];
export type ClientCustodyState = (typeof CLIENT_CUSTODY_STATES)[number];
export type ClientGreetingSource = (typeof CLIENT_GREETING_SOURCES)[number];
export type ClientSendPurpose = (typeof CLIENT_SEND_PURPOSES)[number];
/** The parts of one generation: one group. `variant` is the Hi variant, 0 elsewhere. */
export declare const clientClaimGroupSchema: z.ZodObject<{
    generationRef: z.ZodString;
    variant: z.ZodNumber;
    partCount: z.ZodNumber;
}, z.core.$strict>;
export declare const clientFanClaimBodySchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    action: z.ZodLiteral<"claim">;
    leaseToken: z.ZodString;
    instanceId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"renew">;
    leaseToken: z.ZodString;
    instanceId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"release">;
    leaseToken: z.ZodString;
    instanceId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"dispatch">;
    attemptId: z.ZodString;
    instanceId: z.ZodString;
    purpose: z.ZodEnum<{
        greeting: "greeting";
        "preview-reply": "preview-reply";
    }>;
    group: z.ZodObject<{
        generationRef: z.ZodString;
        variant: z.ZodNumber;
        partCount: z.ZodNumber;
    }, z.core.$strict>;
    partIndex: z.ZodNumber;
    textRevision: z.ZodNumber;
    leaseToken: z.ZodOptional<z.ZodString>;
    flagRevision: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"sent">;
    attemptId: z.ZodString;
    instanceId: z.ZodString;
    platformMessageId: z.ZodString;
    evidence: z.ZodLiteral<"receipt+echo">;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"failed">;
    attemptId: z.ZodString;
    instanceId: z.ZodString;
    reason: z.ZodEnum<{
        not_enqueued: "not_enqueued";
        native_rejected: "native_rejected";
    }>;
    httpStatus: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"registerNativeSend">;
    attemptId: z.ZodString;
    instanceId: z.ZodString;
    purpose: z.ZodEnum<{
        greeting: "greeting";
        "preview-reply": "preview-reply";
    }>;
    group: z.ZodObject<{
        generationRef: z.ZodString;
        variant: z.ZodNumber;
        partCount: z.ZodNumber;
    }, z.core.$strict>;
    partIndex: z.ZodNumber;
    platformMessageId: z.ZodString;
}, z.core.$strict>], "action">;
/** The answer of the claim POST and, never with a ticket, of the status GET. */
export declare const clientFanClaimResponseSchema: z.ZodObject<{
    greeting: z.ZodObject<{
        state: z.ZodEnum<{
            none: "none";
            confirmed: "confirmed";
        }>;
        at: z.ZodNullable<z.ZodString>;
        messageRef: z.ZodNullable<z.ZodString>;
        source: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    lease: z.ZodObject<{
        state: z.ZodEnum<{
            none: "none";
            expired: "expired";
            owned: "owned";
            held: "held";
            released: "released";
        }>;
        leaseToken: z.ZodNullable<z.ZodString>;
        expiresAt: z.ZodNullable<z.ZodString>;
        heldBy: z.ZodNullable<z.ZodEnum<{
            "you-elsewhere": "you-elsewhere";
            "someone-else": "someone-else";
        }>>;
    }, z.core.$strip>;
    group: z.ZodNullable<z.ZodObject<{
        generationRef: z.ZodString;
        variant: z.ZodNumber;
        partCount: z.ZodNumber;
        sentParts: z.ZodArray<z.ZodNumber>;
        heldParts: z.ZodArray<z.ZodNumber>;
    }, z.core.$strip>>;
    custody: z.ZodNullable<z.ZodObject<{
        attemptId: z.ZodString;
        state: z.ZodEnum<{
            failed: "failed";
            dispatching: "dispatching";
            sent: "sent";
            "uncertain-held": "uncertain-held";
            "resolved-sent": "resolved-sent";
            "resolved-not-sent": "resolved-not-sent";
        }>;
        ticket: z.ZodNullable<z.ZodString>;
        ticketExpiresAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    serverNow: z.ZodString;
    flagRevision: z.ZodNumber;
}, z.core.$strip>;
/** 429 `preview_send_rate_limited`: the error body plus when the window frees a slot. */
export declare const clientPreviewSendRateLimitedResponseSchema: z.ZodObject<{
    error: z.ZodString;
    message: z.ZodString;
    statusCode: z.ZodNumber;
    reason: z.ZodOptional<z.ZodString>;
    statusUrl: z.ZodOptional<z.ZodString>;
    retryAfterMs: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const clientSendCustodyParamsSchema: z.ZodObject<{
    pageLabel: z.ZodString;
    attemptId: z.ZodString;
}, z.core.$strip>;
export declare const clientSendCustodyResolveBodySchema: z.ZodObject<{
    outcome: z.ZodEnum<{
        sent: "sent";
        not_sent: "not_sent";
    }>;
    platformMessageId: z.ZodOptional<z.ZodString>;
    note: z.ZodString;
}, z.core.$strict>;
export declare const clientSendCustodyItemSchema: z.ZodObject<{
    attemptId: z.ZodString;
    fanRef: z.ZodString;
    userId: z.ZodNumber;
    purpose: z.ZodString;
    state: z.ZodString;
    generationRef: z.ZodString;
    partIndex: z.ZodNumber;
    partCount: z.ZodNumber;
    createdAt: z.ZodString;
    ticketExpiresAt: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
/**
 * `held`: sends past their ticket that nobody ended (`uncertain-held`), the
 * longest held first. A send still inside its ticket is in flight and is not
 * listed. `resolved`: sends the owner or a team lead ended by hand, the last
 * resolved first, each with who resolved it, when, how and why.
 */
export declare const CLIENT_SEND_CUSTODY_LIST_STATES: readonly ["held", "resolved"];
/** Known values of `resolution.outcome`; on the wire an open token. The resolve body's own. */
export declare const CLIENT_SEND_CUSTODY_RESOLVE_OUTCOMES: readonly ["sent", "not_sent"];
export type ClientSendCustodyListState = (typeof CLIENT_SEND_CUSTODY_LIST_STATES)[number];
export declare const clientSendCustodyListQuerySchema: z.ZodObject<{
    state: z.ZodDefault<z.ZodEnum<{
        held: "held";
        resolved: "resolved";
    }>>;
    pageLabel: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strict>;
export declare const clientSendCustodyListItemSchema: z.ZodObject<{
    attemptId: z.ZodString;
    fanRef: z.ZodString;
    userId: z.ZodNumber;
    purpose: z.ZodString;
    state: z.ZodString;
    generationRef: z.ZodString;
    partIndex: z.ZodNumber;
    partCount: z.ZodNumber;
    createdAt: z.ZodString;
    ticketExpiresAt: z.ZodNullable<z.ZodString>;
    pageLabel: z.ZodString;
    variant: z.ZodNumber;
    username: z.ZodString;
    instanceId: z.ZodString;
    updatedAt: z.ZodString;
    greeting: z.ZodObject<{
        state: z.ZodString;
        at: z.ZodNullable<z.ZodString>;
        source: z.ZodNullable<z.ZodString>;
        firstPartIsThisAttempt: z.ZodBoolean;
    }, z.core.$strip>;
    resolution: z.ZodNullable<z.ZodObject<{
        outcome: z.ZodString;
        at: z.ZodString;
        userId: z.ZodNumber;
        username: z.ZodString;
        note: z.ZodString;
        platformMessageId: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const clientSendCustodyListResponseSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        attemptId: z.ZodString;
        fanRef: z.ZodString;
        userId: z.ZodNumber;
        purpose: z.ZodString;
        state: z.ZodString;
        generationRef: z.ZodString;
        partIndex: z.ZodNumber;
        partCount: z.ZodNumber;
        createdAt: z.ZodString;
        ticketExpiresAt: z.ZodNullable<z.ZodString>;
        pageLabel: z.ZodString;
        variant: z.ZodNumber;
        username: z.ZodString;
        instanceId: z.ZodString;
        updatedAt: z.ZodString;
        greeting: z.ZodObject<{
            state: z.ZodString;
            at: z.ZodNullable<z.ZodString>;
            source: z.ZodNullable<z.ZodString>;
            firstPartIsThisAttempt: z.ZodBoolean;
        }, z.core.$strip>;
        resolution: z.ZodNullable<z.ZodObject<{
            outcome: z.ZodString;
            at: z.ZodString;
            userId: z.ZodNumber;
            username: z.ZodString;
            note: z.ZodString;
            platformMessageId: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    limit: z.ZodNumber;
    offset: z.ZodNumber;
    total: z.ZodNumber;
    serverNow: z.ZodString;
}, z.core.$strip>;
export declare const CLIENT_AUDIENCE_NEW_DEFAULT_WINDOW_HOURS = 48;
/** The widest window; the bootstrap announces it as `limits.audienceWindowHours`. */
export declare const CLIENT_AUDIENCE_NEW_MAX_WINDOW_HOURS = 720;
export declare const CLIENT_AUDIENCE_NEW_DEFAULT_LIMIT = 50;
export declare const CLIENT_AUDIENCE_NEW_MAX_LIMIT = 100;
/**
 * Known values of `kind`. On the wire an open token. `new`: a first
 * subscription (with `trial` when it is a free trial). `returning`: a fan who
 * was subscribed before and came back: OnlyFans says so, or it names the
 * subscription new (a free-trial link taken again reads as a new trial) while
 * the hub holds a subscription of the fan that started earlier. `trial` stays
 * as OnlyFans said it. There is no "renewed": OnlyFans sends no notification
 * when a subscription renews by itself.
 */
export declare const CLIENT_AUDIENCE_NEW_KINDS: readonly ["new", "returning"];
/**
 * Known values of `subscribedAtSource`. On the wire an open token.
 * `notification`: the time of the subscription notification, which OnlyFans
 * gives to the minute. `subscribeAt`: the subscription's own start as a
 * subscriber sweep read it from OnlyFans, used once it names the same
 * subscription as the notification.
 */
export declare const CLIENT_AUDIENCE_NEW_SUBSCRIBED_AT_SOURCES: readonly ["subscribeAt", "notification"];
/** Known values of `status.subscriptionStatus`. On the wire an open token. */
export declare const CLIENT_AUDIENCE_NEW_SUBSCRIPTION_STATUSES: readonly ["active", "expired", "unknown"];
/**
 * Known values of `status.source`: which collector the subscription's state
 * rests on. On the wire an open token. `sweep`: the newest subscriber sweep
 * saw the fan, or a sweep's end retired a subscription it no longer found.
 * `webhook`: a notification wrote the state and no sweep has confirmed it
 * since. `none`: the hub holds no subscription of the fan on the page.
 */
export declare const CLIENT_AUDIENCE_NEW_STATUS_SOURCES: readonly ["sweep", "webhook", "none"];
/**
 * Known values of `coverage.reasons`: why the list may be missing a
 * subscription or a row's `status` may be out of date. On the wire open
 * tokens; the list is append-only.
 * - `delivery_history_off`: the hub does not collect the provider's webhook
 *   delivery history, so nothing would tell it of a notification that never
 *   arrived (`unknown`);
 * - `delivery_history_pending`: the collection is on and has not finished a
 *   first window (`unknown`);
 * - `delivery_history_before_window`: the delivery history is checked only up
 *   to a moment before the window starts (`unknown`);
 * - `delivery_history_behind`: it is checked up to a moment inside the window
 *   that lies further back from the window's end than the collector normally
 *   lags (`partial`);
 * - `subscription_event_pending`: a subscription notification received since
 *   the window started is journaled and not turned into an event yet, so its
 *   row is not in the list (`partial`);
 * - `subscription_projection_pending`, `subscription_projection_failed`: a
 *   subscription notification received since the window started is not applied
 *   to the page's subscriber state yet, or could not be (`partial`);
 * - `audience_sweep_missing`: no subscriber sweep of the page has completed, so
 *   nothing but notifications vouches for any `status` (`partial`);
 * - `audience_sweep_unverified`: the last sweep ended without a result the hub
 *   trusts (`partial`).
 */
export declare const CLIENT_AUDIENCE_NEW_COVERAGE_REASONS: readonly ["delivery_history_off", "delivery_history_pending", "delivery_history_before_window", "delivery_history_behind", "subscription_event_pending", "subscription_projection_pending", "subscription_projection_failed", "audience_sweep_missing", "audience_sweep_unverified"];
/**
 * The `reason` beside this route's 400 `bad_request`. `cursor_invalid`: the
 * cursor is not one this hub issued for this request (forged or cut, issued
 * for another page or person, or older than an hour); the answer never says
 * which. `cursor_window_mismatch`: the cursor is the caller's own, of a walk
 * with another `windowHours`.
 */
export declare const CLIENT_AUDIENCE_NEW_REFUSAL_REASONS: readonly ["cursor_invalid", "cursor_window_mismatch"];
export type ClientAudienceNewKind = (typeof CLIENT_AUDIENCE_NEW_KINDS)[number];
export type ClientAudienceNewSubscribedAtSource = (typeof CLIENT_AUDIENCE_NEW_SUBSCRIBED_AT_SOURCES)[number];
export type ClientAudienceNewSubscriptionStatus = (typeof CLIENT_AUDIENCE_NEW_SUBSCRIPTION_STATUSES)[number];
export type ClientAudienceNewStatusSource = (typeof CLIENT_AUDIENCE_NEW_STATUS_SOURCES)[number];
export type ClientAudienceNewCoverageReason = (typeof CLIENT_AUDIENCE_NEW_COVERAGE_REASONS)[number];
export type ClientAudienceNewRefusalReason = (typeof CLIENT_AUDIENCE_NEW_REFUSAL_REASONS)[number];
export declare const clientAudienceNewQuerySchema: z.ZodObject<{
    windowHours: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    cursor: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strict>;
/**
 * The greeting, lease and custody of one fan as a list row carries them: the
 * states the claim status read (`clientFanClaimStatus`) answers for the same
 * fan and caller, without the tokens and ids. The read names no client
 * install, so the caller's own live lease reads `held` by `you-elsewhere`.
 */
export declare const clientClaimSummarySchema: z.ZodObject<{
    greeting: z.ZodEnum<{
        none: "none";
        confirmed: "confirmed";
    }>;
    lease: z.ZodEnum<{
        none: "none";
        expired: "expired";
        owned: "owned";
        held: "held";
        released: "released";
    }>;
    heldBy: z.ZodNullable<z.ZodEnum<{
        "you-elsewhere": "you-elsewhere";
        "someone-else": "someone-else";
    }>>;
    custody: z.ZodNullable<z.ZodEnum<{
        failed: "failed";
        dispatching: "dispatching";
        sent: "sent";
        "uncertain-held": "uncertain-held";
        "resolved-sent": "resolved-sent";
        "resolved-not-sent": "resolved-not-sent";
    }>>;
}, z.core.$strip>;
export declare const clientAudienceNewItemSchema: z.ZodObject<{
    eventRef: z.ZodString;
    fanRef: z.ZodString;
    username: z.ZodNullable<z.ZodString>;
    displayName: z.ZodNullable<z.ZodString>;
    kind: z.ZodString;
    trial: z.ZodBoolean;
    subscribedAt: z.ZodString;
    subscribedAtSource: z.ZodString;
    status: z.ZodObject<{
        isSubscriber: z.ZodNullable<z.ZodBoolean>;
        subscriptionStatus: z.ZodString;
        endsAt: z.ZodNullable<z.ZodString>;
        asOf: z.ZodNullable<z.ZodString>;
        source: z.ZodString;
    }, z.core.$strip>;
    thread: z.ZodNullable<z.ZodObject<{
        lastMessageAt: z.ZodNullable<z.ZodString>;
        lastFanMessageAt: z.ZodNullable<z.ZodString>;
        lastModelMessageAt: z.ZodNullable<z.ZodString>;
        storedMessageCount: z.ZodNumber;
        coverage: z.ZodString;
        backfillComplete: z.ZodBoolean;
    }, z.core.$strip>>;
    claim: z.ZodObject<{
        greeting: z.ZodEnum<{
            none: "none";
            confirmed: "confirmed";
        }>;
        lease: z.ZodEnum<{
            none: "none";
            expired: "expired";
            owned: "owned";
            held: "held";
            released: "released";
        }>;
        heldBy: z.ZodNullable<z.ZodEnum<{
            "you-elsewhere": "you-elsewhere";
            "someone-else": "someone-else";
        }>>;
        custody: z.ZodNullable<z.ZodEnum<{
            failed: "failed";
            dispatching: "dispatching";
            sent: "sent";
            "uncertain-held": "uncertain-held";
            "resolved-sent": "resolved-sent";
            "resolved-not-sent": "resolved-not-sent";
        }>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const clientAudienceNewResponseSchema: z.ZodObject<{
    pageLabel: z.ZodString;
    window: z.ZodObject<{
        hours: z.ZodNumber;
        from: z.ZodString;
        to: z.ZodString;
        snapshotAt: z.ZodString;
    }, z.core.$strip>;
    serverNow: z.ZodString;
    coverage: z.ZodObject<{
        state: z.ZodString;
        deliveryFrontier: z.ZodNullable<z.ZodString>;
        lastAudienceSweepAt: z.ZodNullable<z.ZodString>;
        reasons: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    unknownCount: z.ZodNumber;
    welcomeTemplate: z.ZodNullable<z.ZodObject<{
        ref: z.ZodString;
        observedAt: z.ZodString;
        enabled: z.ZodNullable<z.ZodBoolean>;
        hasText: z.ZodBoolean;
        hasMedia: z.ZodBoolean;
        priceMills: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>;
    items: z.ZodArray<z.ZodObject<{
        eventRef: z.ZodString;
        fanRef: z.ZodString;
        username: z.ZodNullable<z.ZodString>;
        displayName: z.ZodNullable<z.ZodString>;
        kind: z.ZodString;
        trial: z.ZodBoolean;
        subscribedAt: z.ZodString;
        subscribedAtSource: z.ZodString;
        status: z.ZodObject<{
            isSubscriber: z.ZodNullable<z.ZodBoolean>;
            subscriptionStatus: z.ZodString;
            endsAt: z.ZodNullable<z.ZodString>;
            asOf: z.ZodNullable<z.ZodString>;
            source: z.ZodString;
        }, z.core.$strip>;
        thread: z.ZodNullable<z.ZodObject<{
            lastMessageAt: z.ZodNullable<z.ZodString>;
            lastFanMessageAt: z.ZodNullable<z.ZodString>;
            lastModelMessageAt: z.ZodNullable<z.ZodString>;
            storedMessageCount: z.ZodNumber;
            coverage: z.ZodString;
            backfillComplete: z.ZodBoolean;
        }, z.core.$strip>>;
        claim: z.ZodObject<{
            greeting: z.ZodEnum<{
                none: "none";
                confirmed: "confirmed";
            }>;
            lease: z.ZodEnum<{
                none: "none";
                expired: "expired";
                owned: "owned";
                held: "held";
                released: "released";
            }>;
            heldBy: z.ZodNullable<z.ZodEnum<{
                "you-elsewhere": "you-elsewhere";
                "someone-else": "someone-else";
            }>>;
            custody: z.ZodNullable<z.ZodEnum<{
                failed: "failed";
                dispatching: "dispatching";
                sent: "sent";
                "uncertain-held": "uncertain-held";
                "resolved-sent": "resolved-sent";
                "resolved-not-sent": "resolved-not-sent";
            }>>;
        }, z.core.$strip>;
    }, z.core.$strip>>;
    nextCursor: z.ZodNullable<z.ZodString>;
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
    readonly clientConversationFeed: {
        readonly auth: {
            readonly kind: "apiKey";
            readonly scope: "page";
        };
        readonly tags: readonly ["client"];
        readonly summary: "One conversation's messages from the hub's own stores, newest first, with a Ping summary on the first page";
        readonly description: string;
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
            fanRef: z.ZodString;
        }, z.core.$strip>;
        readonly querystring: z.ZodObject<{
            cursor: z.ZodOptional<z.ZodString>;
            limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            summaryWindow: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
        }, z.core.$strict>;
        readonly response: {
            readonly 200: z.ZodObject<{
                target: z.ZodObject<{
                    pageLabel: z.ZodString;
                    fanRef: z.ZodString;
                }, z.core.$strip>;
                source: z.ZodString;
                snapshotRevision: z.ZodString;
                asOf: z.ZodString;
                coverage: z.ZodString;
                head: z.ZodNullable<z.ZodObject<{
                    messageRef: z.ZodString;
                    at: z.ZodNullable<z.ZodString>;
                    sender: z.ZodString;
                }, z.core.$strip>>;
                newestKnownAt: z.ZodNullable<z.ZodString>;
                nextOlderCursor: z.ZodNullable<z.ZodString>;
                items: z.ZodArray<z.ZodObject<{
                    messageId: z.ZodString;
                    at: z.ZodNullable<z.ZodString>;
                    sender: z.ZodString;
                    text: z.ZodString;
                    automatic: z.ZodNullable<z.ZodBoolean>;
                    deleted: z.ZodBoolean;
                    tipMills: z.ZodNullable<z.ZodNumber>;
                    priceMills: z.ZodNullable<z.ZodNumber>;
                    attachmentLabels: z.ZodArray<z.ZodString>;
                }, z.core.$strip>>;
                summary: z.ZodNullable<z.ZodObject<{
                    pingSegment: z.ZodString;
                    fanSilenceDays: z.ZodNullable<z.ZodNumber>;
                    window: z.ZodObject<{
                        requested: z.ZodNumber;
                        served: z.ZodNumber;
                    }, z.core.$strip>;
                    coverage: z.ZodString;
                    asOf: z.ZodString;
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
    readonly clientSpenderStats: {
        readonly auth: {
            readonly kind: "apiKey";
            readonly scope: "page";
        };
        readonly tags: readonly ["client"];
        readonly summary: "Spenders statistics of one page: 30 local days of money, tiers, silence, new payers, awaiting reply";
        readonly description: string;
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strip>;
        readonly querystring: z.ZodObject<{
            windowDays: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            timeZone: z.ZodString;
        }, z.core.$strict>;
        readonly response: {
            readonly 200: z.ZodObject<{
                pageLabel: z.ZodString;
                metricVersion: z.ZodNumber;
                moneyUnit: z.ZodLiteral<"USD-mills">;
                basis: z.ZodLiteral<"gross">;
                timeZone: z.ZodString;
                from: z.ZodString;
                to: z.ZodString;
                asOf: z.ZodString;
                projectionAsOf: z.ZodNullable<z.ZodString>;
                includedStates: z.ZodArray<z.ZodString>;
                coverage: z.ZodObject<{
                    state: z.ZodString;
                    reasons: z.ZodArray<z.ZodString>;
                }, z.core.$strip>;
                days: z.ZodArray<z.ZodObject<{
                    date: z.ZodString;
                    grossMills: z.ZodNumber;
                    purchasesGrossMills: z.ZodNumber;
                    adjustmentsMills: z.ZodNumber;
                    creatorNetMills: z.ZodNumber;
                    purchaseCount: z.ZodNumber;
                    byState: z.ZodRecord<z.ZodString, z.ZodNumber>;
                }, z.core.$strip>>;
                totals: z.ZodObject<{
                    today: z.ZodObject<{
                        grossMills: z.ZodNumber;
                        purchasesGrossMills: z.ZodNumber;
                        adjustmentsMills: z.ZodNumber;
                        creatorNetMills: z.ZodNumber;
                        purchaseCount: z.ZodNumber;
                        payerCount: z.ZodNumber;
                    }, z.core.$strip>;
                    d7: z.ZodObject<{
                        grossMills: z.ZodNumber;
                        purchasesGrossMills: z.ZodNumber;
                        adjustmentsMills: z.ZodNumber;
                        creatorNetMills: z.ZodNumber;
                        purchaseCount: z.ZodNumber;
                        payerCount: z.ZodNumber;
                    }, z.core.$strip>;
                    prev7: z.ZodObject<{
                        grossMills: z.ZodNumber;
                        purchasesGrossMills: z.ZodNumber;
                        adjustmentsMills: z.ZodNumber;
                        creatorNetMills: z.ZodNumber;
                        purchaseCount: z.ZodNumber;
                        payerCount: z.ZodNumber;
                    }, z.core.$strip>;
                    d30: z.ZodObject<{
                        grossMills: z.ZodNumber;
                        purchasesGrossMills: z.ZodNumber;
                        adjustmentsMills: z.ZodNumber;
                        creatorNetMills: z.ZodNumber;
                        purchaseCount: z.ZodNumber;
                        payerCount: z.ZodNumber;
                    }, z.core.$strip>;
                    d7DeltaPct: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strip>;
                avgCheckMills: z.ZodNullable<z.ZodNumber>;
                tiers: z.ZodArray<z.ZodObject<{
                    key: z.ZodString;
                    label: z.ZodString;
                    minMills: z.ZodNullable<z.ZodNumber>;
                    maxMills: z.ZodNullable<z.ZodNumber>;
                    members: z.ZodNumber;
                    windowPayers: z.ZodNumber;
                    windowGrossMills: z.ZodNumber;
                }, z.core.$strip>>;
                silence: z.ZodObject<{
                    d8to21: z.ZodObject<{
                        fans: z.ZodNumber;
                        lifetimeGrossMills: z.ZodNumber;
                    }, z.core.$strip>;
                    over21: z.ZodObject<{
                        fans: z.ZodNumber;
                        lifetimeGrossMills: z.ZodNumber;
                    }, z.core.$strip>;
                    unknown: z.ZodObject<{
                        fans: z.ZodNumber;
                        lifetimeGrossMills: z.ZodNumber;
                    }, z.core.$strip>;
                }, z.core.$strip>;
                newPayers: z.ZodObject<{
                    count: z.ZodNumber;
                    firstPurchaseKnown: z.ZodBoolean;
                }, z.core.$strip>;
                queueSummary: z.ZodObject<{
                    total: z.ZodNumber;
                    unknown: z.ZodNumber;
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
    readonly clientSpenderAwaitingReply: {
        readonly auth: {
            readonly kind: "apiKey";
            readonly scope: "page";
        };
        readonly tags: readonly ["client"];
        readonly summary: "The payers of one page whose fan waits for a reply, biggest spender first, a page at a time";
        readonly description: string;
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strip>;
        readonly querystring: z.ZodObject<{
            cursor: z.ZodOptional<z.ZodString>;
            limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
        }, z.core.$strict>;
        readonly response: {
            readonly 200: z.ZodObject<{
                items: z.ZodArray<z.ZodObject<{
                    fanRef: z.ZodString;
                    username: z.ZodNullable<z.ZodString>;
                    displayName: z.ZodNullable<z.ZodString>;
                    lifetimeGrossMills: z.ZodNumber;
                    lastFanMessageAt: z.ZodString;
                    lastModelMessageAt: z.ZodNullable<z.ZodString>;
                    unreadCount: z.ZodNullable<z.ZodNumber>;
                    readState: z.ZodString;
                }, z.core.$strip>>;
                total: z.ZodNumber;
                loaded: z.ZodNumber;
                unknown: z.ZodNumber;
                nextCursor: z.ZodNullable<z.ZodString>;
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
    readonly clientFanClaim: {
        readonly auth: {
            readonly kind: "apiKey";
            readonly scope: "page";
        };
        readonly tags: readonly ["client"];
        readonly summary: "The greeting lease and the send custody of one fan: claim, renew, release, dispatch, sent, failed, registerNativeSend";
        readonly description: string;
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
            fanRef: z.ZodString;
        }, z.core.$strip>;
        readonly body: z.ZodDiscriminatedUnion<[z.ZodObject<{
            action: z.ZodLiteral<"claim">;
            leaseToken: z.ZodString;
            instanceId: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            action: z.ZodLiteral<"renew">;
            leaseToken: z.ZodString;
            instanceId: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            action: z.ZodLiteral<"release">;
            leaseToken: z.ZodString;
            instanceId: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            action: z.ZodLiteral<"dispatch">;
            attemptId: z.ZodString;
            instanceId: z.ZodString;
            purpose: z.ZodEnum<{
                greeting: "greeting";
                "preview-reply": "preview-reply";
            }>;
            group: z.ZodObject<{
                generationRef: z.ZodString;
                variant: z.ZodNumber;
                partCount: z.ZodNumber;
            }, z.core.$strict>;
            partIndex: z.ZodNumber;
            textRevision: z.ZodNumber;
            leaseToken: z.ZodOptional<z.ZodString>;
            flagRevision: z.ZodNumber;
        }, z.core.$strict>, z.ZodObject<{
            action: z.ZodLiteral<"sent">;
            attemptId: z.ZodString;
            instanceId: z.ZodString;
            platformMessageId: z.ZodString;
            evidence: z.ZodLiteral<"receipt+echo">;
        }, z.core.$strict>, z.ZodObject<{
            action: z.ZodLiteral<"failed">;
            attemptId: z.ZodString;
            instanceId: z.ZodString;
            reason: z.ZodEnum<{
                not_enqueued: "not_enqueued";
                native_rejected: "native_rejected";
            }>;
            httpStatus: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>, z.ZodObject<{
            action: z.ZodLiteral<"registerNativeSend">;
            attemptId: z.ZodString;
            instanceId: z.ZodString;
            purpose: z.ZodEnum<{
                greeting: "greeting";
                "preview-reply": "preview-reply";
            }>;
            group: z.ZodObject<{
                generationRef: z.ZodString;
                variant: z.ZodNumber;
                partCount: z.ZodNumber;
            }, z.core.$strict>;
            partIndex: z.ZodNumber;
            platformMessageId: z.ZodString;
        }, z.core.$strict>], "action">;
        readonly response: {
            readonly 200: z.ZodObject<{
                greeting: z.ZodObject<{
                    state: z.ZodEnum<{
                        none: "none";
                        confirmed: "confirmed";
                    }>;
                    at: z.ZodNullable<z.ZodString>;
                    messageRef: z.ZodNullable<z.ZodString>;
                    source: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
                lease: z.ZodObject<{
                    state: z.ZodEnum<{
                        none: "none";
                        expired: "expired";
                        owned: "owned";
                        held: "held";
                        released: "released";
                    }>;
                    leaseToken: z.ZodNullable<z.ZodString>;
                    expiresAt: z.ZodNullable<z.ZodString>;
                    heldBy: z.ZodNullable<z.ZodEnum<{
                        "you-elsewhere": "you-elsewhere";
                        "someone-else": "someone-else";
                    }>>;
                }, z.core.$strip>;
                group: z.ZodNullable<z.ZodObject<{
                    generationRef: z.ZodString;
                    variant: z.ZodNumber;
                    partCount: z.ZodNumber;
                    sentParts: z.ZodArray<z.ZodNumber>;
                    heldParts: z.ZodArray<z.ZodNumber>;
                }, z.core.$strip>>;
                custody: z.ZodNullable<z.ZodObject<{
                    attemptId: z.ZodString;
                    state: z.ZodEnum<{
                        failed: "failed";
                        dispatching: "dispatching";
                        sent: "sent";
                        "uncertain-held": "uncertain-held";
                        "resolved-sent": "resolved-sent";
                        "resolved-not-sent": "resolved-not-sent";
                    }>;
                    ticket: z.ZodNullable<z.ZodString>;
                    ticketExpiresAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>>;
                serverNow: z.ZodString;
                flagRevision: z.ZodNumber;
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
            readonly 429: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
                retryAfterMs: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strip>;
        };
    };
    readonly clientFanClaimStatus: {
        readonly auth: {
            readonly kind: "apiKey";
            readonly scope: "page";
        };
        readonly tags: readonly ["client"];
        readonly summary: "The greeting, lease and custody state of one fan, read only";
        readonly description: string;
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
            fanRef: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                greeting: z.ZodObject<{
                    state: z.ZodEnum<{
                        none: "none";
                        confirmed: "confirmed";
                    }>;
                    at: z.ZodNullable<z.ZodString>;
                    messageRef: z.ZodNullable<z.ZodString>;
                    source: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
                lease: z.ZodObject<{
                    state: z.ZodEnum<{
                        none: "none";
                        expired: "expired";
                        owned: "owned";
                        held: "held";
                        released: "released";
                    }>;
                    leaseToken: z.ZodNullable<z.ZodString>;
                    expiresAt: z.ZodNullable<z.ZodString>;
                    heldBy: z.ZodNullable<z.ZodEnum<{
                        "you-elsewhere": "you-elsewhere";
                        "someone-else": "someone-else";
                    }>>;
                }, z.core.$strip>;
                group: z.ZodNullable<z.ZodObject<{
                    generationRef: z.ZodString;
                    variant: z.ZodNumber;
                    partCount: z.ZodNumber;
                    sentParts: z.ZodArray<z.ZodNumber>;
                    heldParts: z.ZodArray<z.ZodNumber>;
                }, z.core.$strip>>;
                custody: z.ZodNullable<z.ZodObject<{
                    attemptId: z.ZodString;
                    state: z.ZodEnum<{
                        failed: "failed";
                        dispatching: "dispatching";
                        sent: "sent";
                        "uncertain-held": "uncertain-held";
                        "resolved-sent": "resolved-sent";
                        "resolved-not-sent": "resolved-not-sent";
                    }>;
                    ticket: z.ZodNullable<z.ZodString>;
                    ticketExpiresAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>>;
                serverNow: z.ZodString;
                flagRevision: z.ZodNumber;
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
    readonly clientAudienceNew: {
        readonly auth: {
            readonly kind: "apiKey";
            readonly scope: "page";
        };
        readonly tags: readonly ["client"];
        readonly summary: "Who subscribed to an OnlyFans page or came back, inside a window of hours, with each fan's greeting state";
        readonly description: string;
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strip>;
        readonly querystring: z.ZodObject<{
            windowHours: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            cursor: z.ZodOptional<z.ZodString>;
            limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
        }, z.core.$strict>;
        readonly response: {
            readonly 200: z.ZodObject<{
                pageLabel: z.ZodString;
                window: z.ZodObject<{
                    hours: z.ZodNumber;
                    from: z.ZodString;
                    to: z.ZodString;
                    snapshotAt: z.ZodString;
                }, z.core.$strip>;
                serverNow: z.ZodString;
                coverage: z.ZodObject<{
                    state: z.ZodString;
                    deliveryFrontier: z.ZodNullable<z.ZodString>;
                    lastAudienceSweepAt: z.ZodNullable<z.ZodString>;
                    reasons: z.ZodArray<z.ZodString>;
                }, z.core.$strip>;
                unknownCount: z.ZodNumber;
                welcomeTemplate: z.ZodNullable<z.ZodObject<{
                    ref: z.ZodString;
                    observedAt: z.ZodString;
                    enabled: z.ZodNullable<z.ZodBoolean>;
                    hasText: z.ZodBoolean;
                    hasMedia: z.ZodBoolean;
                    priceMills: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strip>>;
                items: z.ZodArray<z.ZodObject<{
                    eventRef: z.ZodString;
                    fanRef: z.ZodString;
                    username: z.ZodNullable<z.ZodString>;
                    displayName: z.ZodNullable<z.ZodString>;
                    kind: z.ZodString;
                    trial: z.ZodBoolean;
                    subscribedAt: z.ZodString;
                    subscribedAtSource: z.ZodString;
                    status: z.ZodObject<{
                        isSubscriber: z.ZodNullable<z.ZodBoolean>;
                        subscriptionStatus: z.ZodString;
                        endsAt: z.ZodNullable<z.ZodString>;
                        asOf: z.ZodNullable<z.ZodString>;
                        source: z.ZodString;
                    }, z.core.$strip>;
                    thread: z.ZodNullable<z.ZodObject<{
                        lastMessageAt: z.ZodNullable<z.ZodString>;
                        lastFanMessageAt: z.ZodNullable<z.ZodString>;
                        lastModelMessageAt: z.ZodNullable<z.ZodString>;
                        storedMessageCount: z.ZodNumber;
                        coverage: z.ZodString;
                        backfillComplete: z.ZodBoolean;
                    }, z.core.$strip>>;
                    claim: z.ZodObject<{
                        greeting: z.ZodEnum<{
                            none: "none";
                            confirmed: "confirmed";
                        }>;
                        lease: z.ZodEnum<{
                            none: "none";
                            expired: "expired";
                            owned: "owned";
                            held: "held";
                            released: "released";
                        }>;
                        heldBy: z.ZodNullable<z.ZodEnum<{
                            "you-elsewhere": "you-elsewhere";
                            "someone-else": "someone-else";
                        }>>;
                        custody: z.ZodNullable<z.ZodEnum<{
                            failed: "failed";
                            dispatching: "dispatching";
                            sent: "sent";
                            "uncertain-held": "uncertain-held";
                            "resolved-sent": "resolved-sent";
                            "resolved-not-sent": "resolved-not-sent";
                        }>>;
                    }, z.core.$strip>;
                }, z.core.$strip>>;
                nextCursor: z.ZodNullable<z.ZodString>;
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
    readonly clientSendCustodyResolve: {
        readonly auth: {
            readonly kind: "session";
            readonly scope: "page";
        };
        readonly tags: readonly ["client"];
        readonly summary: "Resolve a held chat-extension send by hand: sent or not sent, with a note";
        readonly description: string;
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
            attemptId: z.ZodString;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{
            outcome: z.ZodEnum<{
                sent: "sent";
                not_sent: "not_sent";
            }>;
            platformMessageId: z.ZodOptional<z.ZodString>;
            note: z.ZodString;
        }, z.core.$strict>;
        readonly response: {
            readonly 200: z.ZodObject<{
                attemptId: z.ZodString;
                fanRef: z.ZodString;
                userId: z.ZodNumber;
                purpose: z.ZodString;
                state: z.ZodString;
                generationRef: z.ZodString;
                partIndex: z.ZodNumber;
                partCount: z.ZodNumber;
                createdAt: z.ZodString;
                ticketExpiresAt: z.ZodNullable<z.ZodString>;
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
    readonly clientSendCustodyList: {
        readonly auth: {
            readonly kind: "session";
        };
        readonly tags: readonly ["client"];
        readonly summary: "Held chat-extension sends of the pages the viewer reaches, and the ones resolved by hand";
        readonly description: string;
        readonly querystring: z.ZodObject<{
            state: z.ZodDefault<z.ZodEnum<{
                held: "held";
                resolved: "resolved";
            }>>;
            pageLabel: z.ZodOptional<z.ZodString>;
            limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
        }, z.core.$strict>;
        readonly response: {
            readonly 200: z.ZodObject<{
                items: z.ZodArray<z.ZodObject<{
                    attemptId: z.ZodString;
                    fanRef: z.ZodString;
                    userId: z.ZodNumber;
                    purpose: z.ZodString;
                    state: z.ZodString;
                    generationRef: z.ZodString;
                    partIndex: z.ZodNumber;
                    partCount: z.ZodNumber;
                    createdAt: z.ZodString;
                    ticketExpiresAt: z.ZodNullable<z.ZodString>;
                    pageLabel: z.ZodString;
                    variant: z.ZodNumber;
                    username: z.ZodString;
                    instanceId: z.ZodString;
                    updatedAt: z.ZodString;
                    greeting: z.ZodObject<{
                        state: z.ZodString;
                        at: z.ZodNullable<z.ZodString>;
                        source: z.ZodNullable<z.ZodString>;
                        firstPartIsThisAttempt: z.ZodBoolean;
                    }, z.core.$strip>;
                    resolution: z.ZodNullable<z.ZodObject<{
                        outcome: z.ZodString;
                        at: z.ZodString;
                        userId: z.ZodNumber;
                        username: z.ZodString;
                        note: z.ZodString;
                        platformMessageId: z.ZodNullable<z.ZodString>;
                    }, z.core.$strip>>;
                }, z.core.$strip>>;
                limit: z.ZodNumber;
                offset: z.ZodNumber;
                total: z.ZodNumber;
                serverNow: z.ZodString;
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
export type ClientConversationFeedQuery = z.infer<typeof clientConversationFeedQuerySchema>;
export type ClientFeedItem = z.infer<typeof clientFeedItemSchema>;
export type ClientFeedHead = z.infer<typeof clientFeedHeadSchema>;
export type ClientFeedSummary = z.infer<typeof clientFeedSummarySchema>;
export type ClientConversationFeedResponse = z.infer<typeof clientConversationFeedResponseSchema>;
export type ClientAiUsageQuery = z.infer<typeof clientAiUsageQuerySchema>;
export type ClientAiUsageTotals = z.infer<typeof clientAiUsageTotalsSchema>;
export type ClientAiUsageDay = z.infer<typeof clientAiUsageDaySchema>;
export type ClientAiUsageResponse = z.infer<typeof clientAiUsageResponseSchema>;
export type ClientSpenderStatsQuery = z.infer<typeof clientSpenderStatsQuerySchema>;
export type ClientSpenderStatsMoneyWindow = z.infer<typeof clientSpenderStatsMoneyWindowSchema>;
export type ClientSpenderStatsResponse = z.infer<typeof clientSpenderStatsResponseSchema>;
export type ClientSpenderAwaitingReplyQuery = z.infer<typeof clientSpenderAwaitingReplyQuerySchema>;
export type ClientSpenderAwaitingReplyItem = z.infer<typeof clientSpenderAwaitingReplyItemSchema>;
export type ClientSpenderAwaitingReplyResponse = z.infer<typeof clientSpenderAwaitingReplyResponseSchema>;
export type ClientClaimGroup = z.infer<typeof clientClaimGroupSchema>;
export type ClientFanClaimBody = z.infer<typeof clientFanClaimBodySchema>;
export type ClientFanClaimResponse = z.infer<typeof clientFanClaimResponseSchema>;
export type ClientSendCustodyResolveBody = z.infer<typeof clientSendCustodyResolveBodySchema>;
export type ClientSendCustodyItem = z.infer<typeof clientSendCustodyItemSchema>;
export type ClientSendCustodyListQuery = z.infer<typeof clientSendCustodyListQuerySchema>;
export type ClientSendCustodyListItem = z.infer<typeof clientSendCustodyListItemSchema>;
export type ClientSendCustodyListResponse = z.infer<typeof clientSendCustodyListResponseSchema>;
export type ClientAudienceNewQuery = z.infer<typeof clientAudienceNewQuerySchema>;
export type ClientClaimSummary = z.infer<typeof clientClaimSummarySchema>;
export type ClientAudienceNewItem = z.infer<typeof clientAudienceNewItemSchema>;
export type ClientAudienceNewResponse = z.infer<typeof clientAudienceNewResponseSchema>;
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
