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
import { MOSCOW_TIME_ZONE, diffBusinessDays, isValidBusinessDateString, nextBusinessDate, platforms, userRoles, } from "../shared/index";
import { z } from "zod";
import { businessDate, errorResponseSchema, intId, isoTimestamp, mills } from "./primitives";
/** Open token: the wire form of every growing vocabulary (reason, flag, capability, platform, role…). */
export const clientOpenToken = z.string().min(1).max(64);
/**
 * The ONE shape of a platform numeric id a client sends: an OnlyFans fan id
 * (== chat id) or message id. No leading zero, at most 30 digits. Every client
 * field that carries such an id (fanRef, the feed, fresh text, known message
 * ids) uses this schema, so the hub never holds two spellings of one id.
 */
export const CLIENT_NUMERIC_ID_PATTERN = /^[1-9]\d{0,29}$/;
export const clientNumericIdSchema = z.string().regex(CLIENT_NUMERIC_ID_PATTERN);
/** OnlyFans fan id (== chat_id). */
export const clientFanRefSchema = clientNumericIdSchema;
const pageLabelSchema = z.string().min(1).max(120);
export const clientPageParamsSchema = z.object({ pageLabel: pageLabelSchema });
export const clientPageFanParamsSchema = z.object({ pageLabel: pageLabelSchema, fanRef: clientFanRefSchema });
export const clientCursorSchema = z.string().min(1).max(2048);
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
export const CLIENT_CURSOR_REFUSAL_REASONS = ["cursor_invalid"];
const count = z.number().int().nonnegative();
const positive = z.number().int().positive();
/** Known names: documentation and the client's narrowing. On the wire they are open strings. */
export const CLIENT_FEATURE_FLAG_NAMES = [
    "insertion", "freshText", "newcomers", "spenders", "stats", "preview", "previewSend",
    "previewSendMarkAiGenerated", "fanPanel", "navigation", "wsTap", "sound",
    "coach", "recap", "review", "splitAll",
];
export const CLIENT_HUB_CAPABILITY_NAMES = [
    "context-v1", "live-text-v1", "split-all-v1", "shared-recaps-v1", "recap-profile-v1",
    "archive-feed-v1", "spenders-stats-v1", "awaiting-reply-v1", "audience-new-v1",
    "preview-send-custody-v1", "client-health-perf-v1", "ai-usage-v1",
];
/**
 * Append-only. `client_outdated` (the caller's `x-client-version` is below the
 * owner's minimum, or unreadable) is answered by the server-side check of
 * client routes and AI calls (H-2b/H-3), never by the bootstrap; it is listed
 * from the first vendored SDK on so a client never meets it as unknown.
 */
export const CLIENT_FEATURE_UNAVAILABLE_REASONS = [
    "disabled", "flag_off", "platform_unsupported", "binding_missing", "hub_not_ready", "not_granted",
    "client_outdated",
];
/** The platforms and roles this hub knows today (`pages[].platform`, `identity.role`). */
export const CLIENT_KNOWN_PLATFORMS = platforms;
export const CLIENT_KNOWN_ROLES = userRoles;
/**
 * How much of one conversation's history the hub can vouch for: the `coverage`
 * of the AI `context_v1` frame (routes.ts) and of the client reads built on the
 * same stores. `complete`: a standing proof that the hub holds the chat's whole
 * history up to the proof's head, served by the archive. `partial`: the hub
 * knows its copy has a hole. `unknown`: nothing proves either.
 */
export const CLIENT_COVERAGE_LEVELS = ["complete", "partial", "unknown"];
// ── bootstrap ────────────────────────────────────────────────────────────────
export const clientFeatureAvailabilitySchema = z.object({
    available: z.boolean(),
    /** Why not; absent when available. A known value is in CLIENT_FEATURE_UNAVAILABLE_REASONS. */
    reason: clientOpenToken.optional(),
});
/** An admitted send-path and receipt profile of the client (X8): adapter version
 *  plus module fingerprints. No code and no selectors. */
export const clientReceiptProfileSchema = z.object({
    id: z.string().min(1).max(64),
    adapterVersion: z.string().min(1).max(64),
    /** Module role → fingerprint. */
    modules: z.record(z.string().min(1).max(64), z.string().min(1).max(128)),
});
export const clientBootstrapPageSchema = z.object({
    pageId: intId,
    pageLabel: z.string(),
    /** The page's display name, else its model's name. */
    title: z.string(),
    /** Open token; known values: CLIENT_KNOWN_PLATFORMS. */
    platform: clientOpenToken,
    /** `pages.external_page_id`, the platform's own account id. Null for a page
     *  that has none (Fansly pages often do not). */
    platformAccountId: z.string().nullable(),
    /** Changes when the page is rebound upstream; the client drops what it bound
     *  under an older value. */
    bindingRevision: count,
    /** Flag name → availability on this page. */
    features: z.record(clientOpenToken, clientFeatureAvailabilitySchema),
});
export const clientBootstrapLimitsSchema = z.object({
    freshTextMaxItems: count,
    /** Per item. */
    freshTextMaxChars: count,
    feedMax: positive,
    deepMax: positive,
    audienceWindowHours: positive,
    claimLeaseSec: positive,
    claimRenewSec: positive,
    claimActivityWindowSec: positive,
    previewSendPerMinute: count,
    navInsertTimeoutSec: positive,
    dispatchTicketSec: positive,
    /** Empty: sending from the preview (X8) is off. */
    previewSendReceiptProfiles: z.array(clientReceiptProfileSchema).max(32),
});
export const clientBootstrapResponseSchema = z.object({
    /** The bootstrap protocol; the client checks it itself (a newer one it does not speak = "update the client"). */
    protocol: positive,
    issuedAt: isoTimestamp,
    /** How long the client may serve this bootstrap from its cache. */
    ttlSec: positive,
    /** Grows with every owner change of a setting the bootstrap reflects. */
    configRevision: count,
    /** The lowest client version the hub serves. */
    minVersion: z.string().min(1).max(32),
    identity: z.object({
        userId: intId,
        username: z.string(),
        /** Open token; known values: CLIENT_KNOWN_ROLES. */
        role: clientOpenToken,
        /** "chat-extension" for a narrow token; null = a full device token. */
        tokenClient: clientOpenToken.nullable(),
    }),
    /** The caller's active pages: every page for the owner, the assigned ones otherwise. */
    pages: z.array(clientBootstrapPageSchema),
    /** Explicit owner binding of a host account ("onlymonster:10001") to a page id. */
    bindingsByHost: z.record(z.string().min(1).max(128), intId),
    /** Emergency switches, flag name → on. */
    flags: z.record(clientOpenToken, z.boolean()),
    limits: clientBootstrapLimitsSchema,
    /** What this hub serves to the client; known values: CLIENT_HUB_CAPABILITY_NAMES. */
    capabilities: z.array(clientOpenToken).max(64),
});
// ── shared recaps (H-13) ─────────────────────────────────────────────────────
//
// The freshest usable full and short recap of one fan on one page, WITH their
// text. A recap is shared: every chatter granted the page reads the same one,
// whoever generated it (chat-extension architecture §19, decision 1; there are
// no private recaps). `aiRecapStatus` (routes.ts) answers the same two slots
// as metadata only.
/** Known values of `coverage.transcriptCoverage`. On the wire an open token. */
export const CLIENT_RECAP_TRANSCRIPT_COVERAGES = ["full-history", "window"];
export const clientConversationRecapsQuerySchema = z.object({
    /** The persona's opaque catalog identity (`aiPersonaCatalog.definitionId`).
     *  With it, only that persona's recaps are selected; without it, the freshest
     *  of any persona, as `aiRecapStatus` does. */
    personaDefinitionId: z.string().min(16).max(100).optional(),
}).strict();
export const clientRecapBodySchema = z.object({
    /** The generation's `meta.requestId`: the identity of this shared recap. */
    generationRef: z.string().min(1).max(100),
    generatedAt: isoTimestamp,
    /** The persona the recap was written for; null on a row that predates the field. */
    personaDefinitionId: z.string().nullable(),
    /** What the generation read. Null where the generation did not record it. */
    coverage: z.object({
        /** Open token; known values: CLIENT_RECAP_TRANSCRIPT_COVERAGES. */
        transcriptCoverage: clientOpenToken.nullable(),
        /** The window the request resolved to. */
        requestedCount: z.number().int().nullable(),
        /** The messages the generation actually read. */
        keptCount: z.number().int().nullable(),
    }),
    text: z.string(),
});
export const clientConversationRecapsResponseSchema = z.object({
    full: clientRecapBodySchema.nullable(),
    short: clientRecapBodySchema.nullable(),
    /** The fan's latest dossier on this page has exactly the full recap's text. */
    fullSavedToProfile: z.boolean(),
});
// ── dossier from a generation (H-5) ──────────────────────────────────────────
//
// Saves a finished full recap as the fan's dossier on the page. The client
// names the generation (`generationRef`, the `meta.requestId` of its own
// `fan-summary` request) and the hub copies the text from the record it stored:
// the text never travels back through the client, so the dossier is exactly
// what the model wrote.
/**
 * The client's own request id as it travels: 8-4-4-4-12 hex, any case and any
 * version nibble. Wider than `z.string().uuid()` on purpose: the chat extension
 * froze this form for the ids it mints, and the value is only compared with the
 * request id of an AI request the caller already made. Spelled without a flag,
 * so the OpenAPI document states the same pattern.
 */
export const CLIENT_REQUEST_ID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
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
export const CLIENT_GENERATION_NOT_ELIGIBLE_REASONS = [
    "not_full_summary", "not_completed", "stop_reason_missing", "output_exhausted", "empty",
    "context_scope", "too_long", "superseded",
];
export const clientFanProfileFromGenerationBodySchema = z.object({
    /** The generation's `meta.requestId`. */
    generationRef: z.string().min(1).max(100),
    /** The `clientRequestId` of the AI request that made the generation. With it
     *  the hub tells a generation whose record has not appeared yet (409
     *  `generation_not_ready`) from one it does not know (404). */
    clientRequestId: z.string().regex(CLIENT_REQUEST_ID_PATTERN).optional(),
}).strict();
export const clientFanProfileFromGenerationResponseSchema = z.object({
    /** `created`: a new dossier version was written. `existing`: a version of
     *  the fan's dossier on this page already has exactly this text. */
    outcome: z.enum(["created", "existing"]),
    /** The dossier version that holds the generation's text. */
    profile: z.object({
        version: positive,
        createdAt: isoTimestamp,
        /** When the text was generated; null on a version an older client wrote without it. */
        sourceGeneratedAt: isoTimestamp.nullable(),
    }),
});
// ── archive feed (H-9c) ──────────────────────────────────────────────────────
//
// One conversation as the hub's own message stores hold it: newest first, a
// page at a time, with a Ping summary on the first page. Database only: no
// platform request, no refresh and no queued work, so reading the feed never
// marks the chat read on OnlyFans.
//
// THE READER is the one a generation uses: the owner's
// `aiTranscriptFreshUnionMode` decides between the archive and the archive ∪
// webhook-store union, and `source` says which one served. A message deleted on
// the platform stays in the feed as a row with `deleted: true` and an empty
// `text` (a generation drops it): the row says a message was there and is gone,
// never what it said.
//
// ONE WALK, ONE SNAPSHOT. A request without a cursor starts a walk and freezes
// it: `snapshotRevision`, `asOf`, `coverage`, `head` and `newestKnownAt` are
// read once and every later page of the walk repeats them. A message that
// arrives during the walk is not in it; the next walk from the first page has
// it. `nextOlderCursor` is opaque (its state is sealed: its holder reads
// nothing from it) and signed, and it is valid only for the same page, fan and
// person, on the same reader, until the archive is rebuilt, and for a day after
// the walk's FIRST page (taking a page does not renew a walk): any other use is
// 400 `bad_request` with the reason `cursor_invalid`, and the client reads the
// first page again.
/** The most rows one page carries; the bootstrap announces it as `limits.feedMax`. */
export const CLIENT_FEED_MAX_LIMIT = 100;
export const CLIENT_FEED_DEFAULT_LIMIT = 50;
/** The first page's summary reads this many of the newest messages unless the query says otherwise: the Ping window. */
export const CLIENT_FEED_SUMMARY_WINDOW_DEFAULT = 100;
export const CLIENT_FEED_SUMMARY_WINDOW_MIN = 5;
/** The transcript readers' own cap. The deeper read (3000) is the full Recap's alone: a feed page never makes it. */
export const CLIENT_FEED_SUMMARY_WINDOW_MAX = 1500;
/** Known values of the feed's `source`. On the wire an open token. The AI
 *  context frame names the same readers (`AI_CONTEXT_SOURCES` in routes.ts). */
export const CLIENT_FEED_SOURCES = ["archive", "union"];
/** Known values of `sender` (a row's and the head's). On the wire an open token. */
export const CLIENT_FEED_SENDERS = ["fan", "model", "system", "unknown"];
/**
 * Known values of `summary.pingSegment`. On the wire an open token. This hub
 * answers the segment a Ping generation would be given for the same messages
 * (`active`, `segment-a`, `segment-b`); `unknown` is what a client reads any
 * other value as, and what it shows when `summary` is null.
 */
export const CLIENT_FEED_PING_SEGMENTS = ["active", "segment-a", "segment-b", "unknown"];
export const clientConversationFeedQuerySchema = z.object({
    /** `nextOlderCursor` of the page before; absent starts a new walk at the newest message. */
    cursor: clientCursorSchema.optional(),
    limit: z.coerce.number().int().min(1).max(CLIENT_FEED_MAX_LIMIT).default(CLIENT_FEED_DEFAULT_LIMIT),
    /** How many of the newest messages the first page's summary reads. Not read on a later page, which has no summary. */
    summaryWindow: z.coerce.number().int()
        .min(CLIENT_FEED_SUMMARY_WINDOW_MIN).max(CLIENT_FEED_SUMMARY_WINDOW_MAX).optional(),
}).strict();
export const clientFeedItemSchema = z.object({
    /** The platform's message id. */
    messageId: z.string(),
    /** Null for a message the stores hold without a time; such rows come last. */
    at: isoTimestamp.nullable(),
    /** Open token; known values: CLIENT_FEED_SENDERS. */
    sender: clientOpenToken,
    /** Plain text as stored. Always empty on a deleted message, whatever the store still holds of it. */
    text: z.string(),
    /** Whether the message was sent by an automation. The stores hold no such signal: always null today. */
    automatic: z.boolean().nullable(),
    /** The message was deleted on the platform. */
    deleted: z.boolean(),
    /** The tip the message carries; null when it carries none. */
    tipMills: mills.nullable(),
    /** The price of a paid message; null for a free one. Whether it was bought is not part of the feed. */
    priceMills: mills.nullable(),
    /** Captions of what is attached, as a generation reads them (`[Photo]`); never a media reference. */
    attachmentLabels: z.array(z.string().max(80)).max(50),
});
/** The newest message a generation would read from this reader: live, never a deleted one. */
export const clientFeedHeadSchema = z.object({
    messageRef: z.string(),
    at: isoTimestamp.nullable(),
    /**
     * Open token; known values: CLIENT_FEED_SENDERS. The head reads the sender
     * as a generation does (`servedHead.isFromFan`): `model` for the page's own
     * message and `fan` for every other one, a system line included. The row of
     * the same message in `items` carries its stored role.
     */
    sender: clientOpenToken,
});
export const clientFeedSummarySchema = z.object({
    /** Open token; known values: CLIENT_FEED_PING_SEGMENTS. */
    pingSegment: clientOpenToken,
    /** Whole days since the fan's last text message in the window; null when the window holds none. */
    fanSilenceDays: count.nullable(),
    /** The messages asked for and the messages the summary read. */
    window: z.object({ requested: count, served: count }),
    /** Open token; known values: CLIENT_COVERAGE_LEVELS. */
    coverage: clientOpenToken,
    /** The instant the segment and the silence were counted at. */
    asOf: isoTimestamp,
});
export const clientConversationFeedResponseSchema = z.object({
    target: z.object({ pageLabel: z.string(), fanRef: clientFanRefSchema }),
    /** The reader that served the walk. Open token; known values: CLIENT_FEED_SOURCES. */
    source: clientOpenToken,
    /** Names the walk's snapshot: the same on every page of one walk. Opaque. */
    snapshotRevision: z.string(),
    /** When the walk's snapshot was taken. */
    asOf: isoTimestamp,
    /** How much of the chat's history the hub can vouch for. Open token; known values: CLIENT_COVERAGE_LEVELS. */
    coverage: clientOpenToken,
    /**
     * The reader's newest live message at the snapshot, null when it holds none.
     * It is the `servedHead` the AI `context_v1` frame reports for a generation
     * served by the same reader from the same stored state (a generation that
     * was sent fresh text may read past it; the feed never holds fresh text).
     */
    head: clientFeedHeadSchema.nullable(),
    /**
     * The time of the newest message the hub has heard of in this chat: the
     * head's, or the chat list's last message when that is later than every
     * message the reader holds. Later than `head.at` means the reader has not
     * caught up with the chat yet. A newest message that was deleted does not
     * count as such: the reader holds its row, so nothing is behind and this is
     * the head's time. Null when the hub knows of no message.
     */
    newestKnownAt: isoTimestamp.nullable(),
    /** Continues the walk toward older messages; null at its end. */
    nextOlderCursor: clientCursorSchema.nullable(),
    /** Newest first. */
    items: z.array(clientFeedItemSchema).max(CLIENT_FEED_MAX_LIMIT),
    /** On the first page of a walk only; null on every later page. */
    summary: clientFeedSummarySchema.nullable(),
});
// ── own AI spend (H-15) ──────────────────────────────────────────────────────
//
// What the caller spent on AI on one page, day by day, for the extension's
// debug panel. Always the caller's own ledger rows: an owner too reads only the
// owner's own spend, never a chatter's.
//
// TWO DAY BOUNDARIES, and the answer states both:
// - a report day is a calendar day in `timeZone` (Europe/Moscow unless the
//   caller names another zone, as in the cabinet's reports). Every day carries
//   the two instants it was cut at (`from`, `toExclusive`);
// - the AI quota counts the UTC day (`quota.dayBoundary`). "Left today" is
//   therefore counted over a different window than today's report row, and the
//   two do not add up to the limit.
/** At most this many days in one answer. */
export const CLIENT_AI_USAGE_MAX_DAYS = 7;
/** `date` may lie this many days before today (today in `timeZone`), no further. */
export const CLIENT_AI_USAGE_MAX_AGE_DAYS = 8;
/** Known values of `days[].coverage`. On the wire an open token. */
export const CLIENT_AI_USAGE_COVERAGE = ["complete", "partial"];
/** Known values of `days[].coverageReasons`: why a day's numbers may still change or are not exact. */
export const CLIENT_AI_USAGE_COVERAGE_REASONS = ["day_open", "open_reservations", "approximate_cost"];
/** The `reason` beside this route's 400 `bad_request`. */
export const CLIENT_AI_USAGE_REFUSAL_REASONS = ["unknown_time_zone", "date_in_future", "date_too_old"];
export const clientAiUsageQuerySchema = z.object({
    /** The LAST day of the range: a calendar day in `timeZone`. */
    date: businessDate,
    /** How many days, ending at `date`. */
    days: z.coerce.number().int().min(1).max(CLIENT_AI_USAGE_MAX_DAYS).default(1),
    /** The IANA zone the days are cut in. A zone the hub does not know is refused. */
    timeZone: z.string().min(1).max(64).default(MOSCOW_TIME_ZONE),
}).strict();
export const clientAiUsageTotalsSchema = z.object({
    /** Every ledger row of the window: finished, refused by the quota, or still open. */
    requestCount: count,
    costMicroUsd: count,
    /** At least one row's cost is the hub's estimate, not the provider's count. */
    costApproximate: z.boolean(),
    tokens: z.object({ input: count, output: count, cacheWrite: count, cacheRead: count }),
    completed: count,
    failed: count,
    cancelled: count,
    quotaDenied: count,
    /** Rows with no outcome yet: a generation still running, or one cut off and
     *  not swept yet. Their cost is not in the totals. */
    openReservations: count,
    regenerations: count,
});
export const clientAiUsageDaySchema = z.object({
    /** The calendar day in `timeZone`, YYYY-MM-DD. */
    date: z.string(),
    from: isoTimestamp,
    toExclusive: isoTimestamp,
    /** Open token; known values: CLIENT_AI_USAGE_COVERAGE. */
    coverage: clientOpenToken,
    /** Open tokens, empty when complete; known values: CLIENT_AI_USAGE_COVERAGE_REASONS. */
    coverageReasons: z.array(clientOpenToken),
    totals: clientAiUsageTotalsSchema,
    /** One row per AI feature used that day, by feature name. The feature is an open token. */
    features: z.array(clientAiUsageTotalsSchema.extend({ feature: clientOpenToken })),
});
export const clientAiUsageResponseSchema = z.object({
    /** Whose spend and where: always the caller, on the page of the path. */
    scope: z.object({ pageLabel: z.string(), userId: intId }),
    /** The zone the days were cut in. */
    timeZone: z.string(),
    asOf: isoTimestamp,
    moneyUnit: z.literal("micro-USD"),
    /** Oldest first; the last one is the requested `date`. A day without spend is listed with zeros. */
    days: z.array(clientAiUsageDaySchema),
    /**
     * What the caller may still spend on this page before the quota's day ends,
     * and that day is the UTC day, whatever `timeZone` is. Null when this hub's AI
     * gateway is off: nothing is generated, so there is no quota to report.
     */
    quota: z.object({
        dayBoundary: z.literal("UTC"),
        remainingRequestsToday: count.nullable(),
        remainingMicroUsdToday: count.nullable(),
    }).nullable(),
});
// ── Spenders statistics (H-8b) ───────────────────────────────────────────────
//
// The numbers of one page's Spenders panel: 30 local days of money, tiers,
// silence, new payers and how many payers wait for a reply. The hub counts all
// of it (packages/shared/src/spender-stats.ts holds what each number means);
// the client shows what it is sent and never rebuilds a page total from the
// rows it happens to list.
//
// Money is integer mills, signed (a refund is negative). `null` is "unknown",
// never 0. What the hub cannot vouch for it says in `coverage`.
/** v1 serves one window length; another one is a new value of `windowDays`. */
export const CLIENT_SPENDER_STATS_WINDOW_DAYS = 30;
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
export const CLIENT_SPENDER_STATS_COVERAGE_REASONS = [
    "no_revenue_history", "projection_missing", "projection_behind", "history_starts_in_window", "messages_missing",
];
/**
 * The two `tiers[].key` rows after the hub's spender buckets, both without
 * bounds: `untiered` is window spend by fans in no tier, `unattributed` is
 * window spend whose transaction names no fan. With them the tiers' window
 * gross sums to `totals.d30.grossMills`.
 */
export const CLIENT_SPENDER_STATS_REMAINDER_TIER_KEYS = ["untiered", "unattributed"];
/** The `reason` beside this route's 400 `bad_request`. */
export const CLIENT_SPENDER_STATS_REFUSAL_REASONS = ["unknown_time_zone"];
export const clientSpenderStatsQuerySchema = z.object({
    /** The window, in local dates ending today. v1: 30 only. */
    windowDays: z.coerce.number().int()
        .min(CLIENT_SPENDER_STATS_WINDOW_DAYS).max(CLIENT_SPENDER_STATS_WINDOW_DAYS)
        .default(CLIENT_SPENDER_STATS_WINDOW_DAYS),
    /** The IANA zone the dates are local to. A zone the hub does not know is refused. */
    timeZone: z.string().min(1).max(64),
}).strict();
/** Money of one calendar window. */
export const clientSpenderStatsMoneyWindowSchema = z.object({
    /** What fans paid, refunds and chargebacks already in it: purchases + adjustments. */
    grossMills: mills,
    purchasesGrossMills: mills,
    /** Refunds, chargebacks and every other row that is not a purchase. Zero or negative as a rule. */
    adjustmentsMills: mills,
    creatorNetMills: mills,
    purchaseCount: count,
    /** Distinct fans with a purchase in the window. */
    payerCount: count,
});
export const clientSpenderStatsDaySchema = z.object({
    /** A local date of `timeZone`, YYYY-MM-DD. */
    date: z.string(),
    grossMills: mills,
    purchasesGrossMills: mills,
    adjustmentsMills: mills,
    creatorNetMills: mills,
    purchaseCount: count,
    /** Gross by transaction state (an open token: `posted`, `pending`, `unknown`); the states sum to `grossMills`. */
    byState: z.record(clientOpenToken, mills),
});
export const clientSpenderStatsTierSchema = z.object({
    /** Open token: a hub spender bucket, or one of CLIENT_SPENDER_STATS_REMAINDER_TIER_KEYS. */
    key: clientOpenToken,
    label: z.string(),
    /** Inclusive lower bound of lifetime gross; null for the two remainders. */
    minMills: mills.nullable(),
    /** Exclusive upper bound; null for the top bucket and the two remainders. */
    maxMills: mills.nullable(),
    /** Fans whose lifetime gross is in the band (a remainder: fans with window spend). */
    members: count,
    /** Of the row's fans, those with a purchase in the window. */
    windowPayers: count,
    windowGrossMills: mills,
});
const clientSpenderStatsSilenceBucketSchema = z.object({
    fans: count,
    /** What those fans paid in all: context, not lost revenue and not a forecast. */
    lifetimeGrossMills: mills,
});
export const clientSpenderStatsResponseSchema = z.object({
    pageLabel: z.string(),
    /** Grows when a definition changes what a number means. */
    metricVersion: z.number().int().positive(),
    moneyUnit: z.literal("USD-mills"),
    basis: z.literal("gross"),
    /** The zone the dates are local to, as asked. */
    timeZone: z.string(),
    /** First and last local date of the window, YYYY-MM-DD; `to` is today in `timeZone`. */
    from: z.string(),
    to: z.string(),
    /** The instant the numbers are of; nothing after it is counted. An answer may be up to a minute old. */
    asOf: isoTimestamp,
    /** When the spender projection behind tiers, silence and the queue was last rebuilt; null when never. */
    projectionAsOf: isoTimestamp.nullable(),
    /** The transaction states the money counts (open tokens). */
    includedStates: z.array(clientOpenToken),
    coverage: z.object({
        /** Open token; known values: CLIENT_COVERAGE_LEVELS. */
        state: clientOpenToken,
        /** Open tokens, empty when complete; known values: CLIENT_SPENDER_STATS_COVERAGE_REASONS. */
        reasons: z.array(clientOpenToken),
    }),
    /** One entry per date of the window, oldest first; a date without a transaction is listed with zeros. */
    days: z.array(clientSpenderStatsDaySchema),
    totals: z.object({
        /** Today so far. */
        today: clientSpenderStatsMoneyWindowSchema,
        /** The last 7 dates, today included. */
        d7: clientSpenderStatsMoneyWindowSchema,
        /** The 7 dates before `d7`. */
        prev7: clientSpenderStatsMoneyWindowSchema,
        d30: clientSpenderStatsMoneyWindowSchema,
        /** `(d7 − prev7) / |prev7|` of gross, in percent; null when prev7 is zero. */
        d7DeltaPct: z.number().nullable(),
    }),
    /** Purchases gross over the number of purchases in the window; null without a purchase. */
    avgCheckMills: mills.nullable(),
    /** The hub's spender buckets in their order, then the two remainders. */
    tiers: z.array(clientSpenderStatsTierSchema),
    /**
     * Payers by how long ago the fan last wrote TEXT, in whole days: 8 to 21,
     * more than 21, and `unknown` for a payer with no text message the hub
     * holds. Fewer than 8 days is not silence and is not listed.
     */
    silence: z.object({
        d8to21: clientSpenderStatsSilenceBucketSchema,
        over21: clientSpenderStatsSilenceBucketSchema,
        unknown: clientSpenderStatsSilenceBucketSchema,
    }),
    /**
     * Fans whose first purchase on the page is in the window. With
     * `firstPurchaseKnown` false the page's history starts inside the window,
     * and "first" is only the first purchase the hub observed.
     */
    newPayers: z.object({ count, firstPurchaseKnown: z.boolean() }),
    /** Payers whose fan wrote after the page's last message; `unknown` of them have an unknown read state. */
    queueSummary: z.object({ total: count, unknown: count }),
});
// ── awaiting reply (H-8c) ────────────────────────────────────────────────────
//
// The queue behind the Spenders panel's "awaiting reply": the page's payers
// whose fan wrote after the page's last message, counted and ordered by the hub
// over the whole page, not over the rows a board happens to list. The same
// payers and the same rule as `queueSummary` of the statistics above.
//
// WHO WAITS. A payer (lifetime gross at or above the lowest spender bucket, as
// the statistics count payers) whose fan's last message in the chat is later
// than the page's last message there, or to whom the page never wrote. A fan
// with several chats is judged on the visible one with the newest message.
//
// ORDER. Lifetime gross, largest first; among equals the fan waiting longest
// first; then a fixed tie-breaker. The order is total, so a walk has no ties.
//
// A WALK IS NOT A SNAPSHOT. Every page is read at its own instant (`asOf`), with
// the queue's `total` and `unknown` of that instant: a queue of people waiting
// right now is not frozen for a reader. The cursor holds a position in the
// order, so a fan whose place does not change is served exactly once, and a fan
// answered meanwhile is simply not served. A fan whose place changed during the
// walk (wrote again, paid more) can be met a second time or not at all until
// the next walk; a client keeps the first row of a fan.
//
// `nextCursor` is opaque (its state is sealed: its holder reads nothing from
// it) and signed, valid only for the same page and person, and for an hour
// after the page that carried it. Every page carries a newly issued one, so the
// hour bounds the gap between two pages of a walk, not the walk. Any other use
// is 400 `bad_request` with the reason `cursor_invalid`, and the client reads
// the first page again.
/** The most rows one page carries. */
export const CLIENT_SPENDER_AWAITING_REPLY_MAX_LIMIT = 100;
export const CLIENT_SPENDER_AWAITING_REPLY_DEFAULT_LIMIT = 50;
/**
 * Known values of `readState`. On the wire an open token; a client reads one
 * it does not know as `unknown`.
 * - `unread`: the chat has unread fan messages (`unreadCount` says how many);
 * - `read`: nothing is unread and the chat's newest message is the fan's;
 * - `unknown`: the fan wrote after the page's last message, but the hub cannot
 *   tell whether it was read. Its own category, never folded into the other
 *   two; `unreadCount` is null.
 */
export const CLIENT_SPENDER_AWAITING_REPLY_READ_STATES = ["unread", "read", "unknown"];
export const clientSpenderAwaitingReplyQuerySchema = z.object({
    /** `nextCursor` of the page before; absent starts a new walk at the head of the queue. */
    cursor: clientCursorSchema.optional(),
    limit: z.coerce.number().int()
        .min(1).max(CLIENT_SPENDER_AWAITING_REPLY_MAX_LIMIT).default(CLIENT_SPENDER_AWAITING_REPLY_DEFAULT_LIMIT),
}).strict();
export const clientSpenderAwaitingReplyItemSchema = z.object({
    /** The OnlyFans fan id, which is the chat id. */
    fanRef: clientFanRefSchema,
    username: z.string().nullable(),
    displayName: z.string().nullable(),
    /** What the fan paid on the page in all. */
    lifetimeGrossMills: mills,
    lastFanMessageAt: isoTimestamp,
    /** Null when the page never wrote to the fan. */
    lastModelMessageAt: isoTimestamp.nullable(),
    /** Null when `readState` is `unknown`: an unknown count is never 0. */
    unreadCount: count.nullable(),
    /** Open token; known values: CLIENT_SPENDER_AWAITING_REPLY_READ_STATES. */
    readState: clientOpenToken,
});
export const clientSpenderAwaitingReplyResponseSchema = z.object({
    /** In the queue's order. */
    items: z.array(clientSpenderAwaitingReplyItemSchema),
    /** Payers waiting for a reply on the page at `asOf`. */
    total: count,
    /** Rows the walk has served so far, this page included. The queue moves between pages, so the last page's `loaded` need not equal its `total`. */
    loaded: count,
    /** Of `total`, the payers whose read state is unknown. */
    unknown: count,
    /** Continues the walk; null at its end. */
    nextCursor: clientCursorSchema.nullable(),
    /** The instant this page and its counts were read at. */
    asOf: isoTimestamp,
});
// ── the owner's client-health view (H-11c) ───────────────────────────────────
//
// What the owner reads of the `client_health` rollups (H-11b): figures by client
// version and host build, never by person. The rollups hold no user, page, fan
// or device, so neither does this view, and it has no list of who runs what.
//
// A dashboard route, not a client's: `owner-session`, so no device token reaches
// it and it is on no narrow-token list. It lives in this module because every
// shape of the chat extension does (and `routes.ts` stays untouched).
/** The longest range one read may span, in days. */
export const ADMIN_CLIENT_HEALTH_MAX_RANGE_DAYS = 366;
export const adminClientHealthQuerySchema = z.object({
    /** First and last day of the range, inclusive, in the response's `range.timeZone`. */
    from: businessDate,
    to: businessDate,
    /** Only this client's rollups (`chat-extension`). */
    clientName: clientOpenToken.optional(),
    /** Only this metric among `perf`; the other sections are not narrowed by it. */
    metric: clientOpenToken.optional(),
}).strict().superRefine((query, ctx) => {
    // The field checks above report a malformed date; a range needs two real ones.
    if (!isValidBusinessDateString(query.from) || !isValidBusinessDateString(query.to)) {
        return;
    }
    // The read stops before the first hour of the day after `to`, and the hub has
    // to be able to name that day: 9999-12-31 has none, and the day after one in a
    // year below 1000 comes back from `nextBusinessDate` without its leading zero.
    // Refused here, or resolving the range throws and the route answers 500.
    if (!isValidBusinessDateString(nextBusinessDate(query.to))) {
        ctx.addIssue({ code: "custom", path: ["to"], message: "`to` is outside the days the hub can read" });
        return;
    }
    if (query.from > query.to) {
        ctx.addIssue({ code: "custom", path: ["to"], message: "`from` must be on or before `to`" });
        return;
    }
    if (diffBusinessDays(query.from, query.to) > ADMIN_CLIENT_HEALTH_MAX_RANGE_DAYS) {
        ctx.addIssue({
            code: "custom",
            path: ["to"],
            message: `the range must not be longer than ${ADMIN_CLIENT_HEALTH_MAX_RANGE_DAYS} days`,
        });
    }
});
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
export const adminClientHealthPerfRowSchema = z.object({
    clientName: z.string(),
    /** A code, or `(other)` for a version that is not one. */
    clientVersion: z.string(),
    hostKind: z.string(),
    /** The host build fingerprint; `(other)` for one that is not a code, null when the client could not read it. */
    hostBuild: z.string().nullable(),
    metric: z.string(),
    /** The version of the metric's bounds and meaning; two versions are two rows. */
    schemaVersion: z.number().int(),
    /** Observations in the group. */
    count,
    mean: z.number().nullable(),
    max: z.number().nullable(),
    p50: z.number().nullable(),
    p95: z.number().nullable(),
    suppressed: z.boolean(),
});
/**
 * The host-contract verdicts of one client version on one host build: counts of
 * reports, shown at any size (a build that breaks the contract shows from its
 * first report).
 */
export const adminClientHealthContractRowSchema = z.object({
    clientVersion: z.string(),
    hostBuild: z.string().nullable(),
    /** Reports received from the group. */
    reports: count,
    /** Reports that said the host contract was broken. */
    failedReports: count,
    /** The anchors of the host contract that reports did not find, each with how many reports missed it. */
    missing: z.array(z.object({ anchor: z.string(), reports: count })),
});
/**
 * The client's own footprint by client version: the 95th percentile, over
 * reports, of the size of its caches and logs (KB) and of the largest number of
 * its own DOM nodes in a report's window. Null under `minGroupSize` reports.
 */
export const adminClientHealthFootprintRowSchema = z.object({
    clientVersion: z.string(),
    cachesKBp95: z.number().nullable(),
    logsKBp95: z.number().nullable(),
    domNodesP95: z.number().nullable(),
});
export const adminClientHealthResponseSchema = z.object({
    /** The days read, as asked, and the zone they are days of. */
    range: z.object({ from: z.string(), to: z.string(), timeZone: z.string() }),
    /** The fewest observations a group needs, over the range asked for, to show a mean, a maximum or a percentile. */
    minGroupSize: positive,
    perf: z.array(adminClientHealthPerfRowSchema),
    contract: z.array(adminClientHealthContractRowSchema),
    /**
     * Counters by code, summed over the range: errors, prevented inserts, P1s, and
     * the client's own bookkeeping of what it left out of a report (`perf.capped`
     * and the like), which is not an error count.
     */
    counters: z.array(z.object({ code: z.string(), total: count })),
    footprint: z.array(adminClientHealthFootprintRowSchema),
    asOf: isoTimestamp,
});
// ── greeting lease and send custody (H-7b) ───────────────────────────────────
//
// Three separate facts about one OnlyFans fan of one page (chat-extension
// architecture §6.7.7–§6.7.9; the tables are migration 0241):
// 1. greeting: the fan's first greeting is confirmed, for good;
// 2. lease: who is working on that one greeting now (120 s, renewed while the
//    person works);
// 3. custody: one dispatched part of a send from the preview. It never expires:
//    a dispatch whose ticket ran out reads `uncertain-held` until it is reported
//    sent, failed with evidence, or resolved by the owner or a team lead.
//
// THE CLIENT'S SHAPE. The chat extension froze the body and the answer in its
// contracts (`ClaimBodySchema`, `ClaimStateSchema`,
// packages/contracts/src/hub/newcomers.ts). The hub takes every body that schema
// lets out and answers only what it reads. The states of the three automata are
// closed enums here and there: a new state is a new route version.
/** An id the client mints (lease token, install id, attempt id): its UUID form. */
const clientMintedId = z.string().regex(CLIENT_REQUEST_ID_PATTERN);
export const CLIENT_CLAIM_ACTIONS = [
    "claim", "renew", "release", "dispatch", "sent", "failed", "registerNativeSend",
];
export const CLIENT_GREETING_STATES = ["none", "confirmed"];
export const CLIENT_LEASE_STATES = ["none", "owned", "held", "expired", "released"];
/** The holder of a lease is never named: only whether it is the caller elsewhere. */
export const CLIENT_LEASE_HOLDERS = ["you-elsewhere", "someone-else"];
export const CLIENT_CUSTODY_STATES = [
    "dispatching", "sent", "failed", "uncertain-held", "resolved-sent", "resolved-not-sent",
];
/**
 * Known values of `greeting.source`; on the wire an open token. `desktop-outbox`:
 * the desktop's new-follower command that OnlyFans confirmed greeted the fan.
 */
export const CLIENT_GREETING_SOURCES = ["preview-send", "native-register", "resolve", "desktop-outbox"];
export const CLIENT_SEND_PURPOSES = ["greeting", "preview-reply"];
export const CLIENT_SEND_FAILURE_REASONS = ["not_enqueued", "native_rejected"];
/** A group has at most this many variants (Hi) and parts. */
export const CLIENT_CLAIM_MAX_VARIANTS = 3;
export const CLIENT_CLAIM_MAX_PARTS = 10;
/** `native_rejected` proves a refusal only with a 4xx other than 401: a 401 says nothing about the send. */
function isNativeRefusalStatus(httpStatus) {
    return httpStatus >= 400 && httpStatus <= 499 && httpStatus !== 401;
}
/** The parts of one generation: one group. `variant` is the Hi variant, 0 elsewhere. */
export const clientClaimGroupSchema = z.object({
    /** The generation's `meta.requestId`. */
    generationRef: z.string().min(1).max(100),
    variant: z.number().int().min(0).max(CLIENT_CLAIM_MAX_VARIANTS - 1),
    partCount: z.number().int().min(1).max(CLIENT_CLAIM_MAX_PARTS),
}).strict();
const clientPartIndex = z.number().int().min(0).max(CLIENT_CLAIM_MAX_PARTS - 1);
const clientSendPurpose = z.enum(CLIENT_SEND_PURPOSES);
/** The columns that keep the two revisions are 32-bit. */
const clientRevision = z.number().int().min(0).max(2_147_483_647);
function clientLeaseAction(action) {
    return z.object({ action: z.literal(action), leaseToken: clientMintedId, instanceId: clientMintedId }).strict();
}
export const clientFanClaimBodySchema = z.discriminatedUnion("action", [
    clientLeaseAction("claim"),
    clientLeaseAction("renew"),
    clientLeaseAction("release"),
    z.object({
        action: z.literal("dispatch"),
        attemptId: clientMintedId,
        instanceId: clientMintedId,
        purpose: clientSendPurpose,
        group: clientClaimGroupSchema,
        partIndex: clientPartIndex,
        textRevision: clientRevision,
        /** A greeting needs the caller's live lease until the greeting is confirmed. */
        leaseToken: clientMintedId.optional(),
        /**
         * The bootstrap `configRevision` the client acted on. Recorded with the
         * attempt and never decided by: the owner's switches are read under a lock
         * in the dispatch's own transaction, so an out-of-date revision is not a
         * refusal and an up-to-date one admits nothing.
         */
        flagRevision: clientRevision,
    }).strict(),
    z.object({
        action: z.literal("sent"),
        attemptId: clientMintedId,
        instanceId: clientMintedId,
        platformMessageId: clientNumericIdSchema,
        evidence: z.literal("receipt+echo"),
    }).strict(),
    z.object({
        action: z.literal("failed"),
        attemptId: clientMintedId,
        instanceId: clientMintedId,
        reason: z.enum(CLIENT_SEND_FAILURE_REASONS),
        httpStatus: z.number().int().min(100).max(599).optional(),
    }).strict(),
    z.object({
        action: z.literal("registerNativeSend"),
        attemptId: clientMintedId,
        instanceId: clientMintedId,
        purpose: clientSendPurpose,
        group: clientClaimGroupSchema,
        partIndex: clientPartIndex,
        platformMessageId: clientNumericIdSchema,
    }).strict(),
]).superRefine((body, ctx) => {
    if ((body.action === "dispatch" || body.action === "registerNativeSend") && body.partIndex >= body.group.partCount) {
        ctx.addIssue({ code: "custom", path: ["partIndex"], message: "partIndex must be below group.partCount" });
    }
    if (body.action === "failed") {
        const proven = body.reason === "native_rejected"
            ? body.httpStatus !== undefined && isNativeRefusalStatus(body.httpStatus)
            : body.httpStatus === undefined;
        if (!proven) {
            ctx.addIssue({
                code: "custom",
                path: ["httpStatus"],
                message: "native_rejected needs a 4xx other than 401; not_enqueued carries no status",
            });
        }
    }
});
/** The answer of the claim POST and, never with a ticket, of the status GET. */
export const clientFanClaimResponseSchema = z.object({
    greeting: z.object({
        state: z.enum(CLIENT_GREETING_STATES),
        at: isoTimestamp.nullable(),
        /** The OnlyFans message id of the first confirmed part, when known. */
        messageRef: z.string().nullable(),
        /** Open token; known values: CLIENT_GREETING_SOURCES. */
        source: clientOpenToken.nullable(),
    }),
    lease: z.object({
        state: z.enum(CLIENT_LEASE_STATES),
        /** The caller's own token only. */
        leaseToken: z.string().nullable(),
        expiresAt: isoTimestamp.nullable(),
        heldBy: z.enum(CLIENT_LEASE_HOLDERS).nullable(),
    }),
    group: z.object({
        generationRef: z.string(),
        variant: count,
        partCount: positive,
        sentParts: z.array(count),
        /**
         * Parts whose send nobody can vouch for (`uncertain-held`). A part still
         * inside its ticket is in flight, not held: `custody` says so.
         */
        heldParts: z.array(count),
    }).nullable(),
    custody: z.object({
        attemptId: z.string(),
        state: z.enum(CLIENT_CUSTODY_STATES),
        /** Only in the answer to the dispatch that created the attempt. */
        ticket: z.string().nullable(),
        ticketExpiresAt: isoTimestamp.nullable(),
    }).nullable(),
    serverNow: isoTimestamp,
    /** The bootstrap's `configRevision` as the hub reads it now. */
    flagRevision: count,
});
/** 429 `preview_send_rate_limited`: the error body plus when the window frees a slot. */
export const clientPreviewSendRateLimitedResponseSchema = errorResponseSchema.extend({
    retryAfterMs: count.optional(),
});
// The manual resolve of a held send, for the owner and team leads in the
// cabinet (cookie session). Not a client route: the extension never calls it.
export const clientSendCustodyParamsSchema = z.object({ pageLabel: pageLabelSchema, attemptId: clientMintedId });
export const clientSendCustodyResolveBodySchema = z.object({
    outcome: z.enum(["sent", "not_sent"]),
    /** The OnlyFans message id, when the resolver found the message. Only with `sent`. */
    platformMessageId: clientNumericIdSchema.optional(),
    note: z.string().trim().min(1).max(500),
}).strict().superRefine((body, ctx) => {
    if (body.outcome === "not_sent" && body.platformMessageId !== undefined) {
        ctx.addIssue({
            code: "custom",
            path: ["platformMessageId"],
            message: "a message id is evidence of a send: it cannot come with not_sent",
        });
    }
});
export const clientSendCustodyItemSchema = z.object({
    attemptId: z.string(),
    fanRef: z.string(),
    /** Who dispatched or registered the send. */
    userId: intId,
    /** Open token; known values: CLIENT_SEND_PURPOSES. */
    purpose: clientOpenToken,
    /** Open token; known values: CLIENT_CUSTODY_STATES. */
    state: clientOpenToken,
    generationRef: z.string(),
    partIndex: count,
    partCount: positive,
    createdAt: isoTimestamp,
    ticketExpiresAt: isoTimestamp.nullable(),
});
// The list of held sends, for the same cabinet (H-7e): what the owner and a
// team lead read before they resolve. It carries ids, states and times only.
// The custody tables hold no text and the list serves none: the hub does not
// know which text went out. `generationRef` names the AI generation the text
// came from; that generation's record (prompt and output) is restricted, and
// only the owner reads it, on its own route.
/**
 * `held`: sends past their ticket that nobody ended (`uncertain-held`), the
 * longest held first. A send still inside its ticket is in flight and is not
 * listed. `resolved`: sends the owner or a team lead ended by hand, the last
 * resolved first, each with who resolved it, when, how and why.
 */
export const CLIENT_SEND_CUSTODY_LIST_STATES = ["held", "resolved"];
/** Known values of `resolution.outcome`; on the wire an open token. The resolve body's own. */
export const CLIENT_SEND_CUSTODY_RESOLVE_OUTCOMES = ["sent", "not_sent"];
export const clientSendCustodyListQuerySchema = z.object({
    state: z.enum(CLIENT_SEND_CUSTODY_LIST_STATES).default("held"),
    /** One page. Absent: every page the viewer reaches. */
    pageLabel: pageLabelSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).max(100_000).default(0),
}).strict();
export const clientSendCustodyListItemSchema = clientSendCustodyItemSchema.extend({
    /** The page of the send: the resolve route takes it in its path. */
    pageLabel: z.string(),
    /** With `generationRef`, `partIndex` and `partCount`: which part of which group. */
    variant: count,
    /** The login of `userId`, who dispatched the send. */
    username: z.string(),
    /** The client install that dispatched it. Only that install could report the outcome. */
    instanceId: z.string(),
    /**
     * The last recorded change of the attempt. For a held send it is the dispatch
     * itself: a held send is one whose client never reported, and a late report
     * the hub refuses is not recorded. For a resolved one it is the resolve.
     */
    updatedAt: isoTimestamp,
    /** Whether the fan's first greeting is on record, whoever sent it and however. */
    greeting: z.object({
        /** Open token; known values: CLIENT_GREETING_STATES. */
        state: clientOpenToken,
        at: isoTimestamp.nullable(),
        /** Open token; known values: CLIENT_GREETING_SOURCES. */
        source: clientOpenToken.nullable(),
        /**
         * The greeting names this attempt as its first part. With the source
         * `native-register` on a held send: the person sent this very part by hand
         * from the composer while the send from the preview was held.
         */
        firstPartIsThisAttempt: z.boolean(),
    }),
    /** How the send was ended by hand; null while it is held. */
    resolution: z.object({
        /** Open token; known values: CLIENT_SEND_CUSTODY_RESOLVE_OUTCOMES. */
        outcome: clientOpenToken,
        at: isoTimestamp,
        userId: intId,
        username: z.string(),
        /** The resolver's reason, as they wrote it. */
        note: z.string(),
        /** The OnlyFans message id the resolver recorded with `sent`, if any. */
        platformMessageId: z.string().nullable(),
    }).nullable(),
});
export const clientSendCustodyListResponseSchema = z.object({
    items: z.array(clientSendCustodyListItemSchema),
    limit: positive,
    offset: count,
    /** Sends in the asked state on the asked pages, whatever the page of the list. */
    total: count,
    /** The hub's clock when it read the list: "held for" is counted against it. */
    serverNow: isoTimestamp,
});
// ── the "new subscribers" list (H-7c) ────────────────────────────────────────
//
// Who subscribed to an OnlyFans page, or came back to it, inside a window of
// hours: newest first, one row per subscription notification the hub collected,
// with what the hub holds about the fan right now (the subscription, the chat,
// the greeting). Database only: the hub's own collected events and projections.
//
// THE CLIENT'S SHAPE. The chat extension froze the query and the answer in its
// contracts (`AudienceNewQuerySchema`, `AudienceNewPageSchema`,
// packages/contracts/src/hub/newcomers.ts). The hub takes every query that
// schema lets out and answers only what it reads: `fanRef` is the one numeric
// id shape there, so an event whose fan id is not one is never a row.
//
// ONE WALK, ONE WINDOW. A request without a cursor starts a walk and fixes its
// window: `window.to` and `window.snapshotAt` are the hub's clock at that
// moment, `window.from` is `hours` before, and every later page repeats them. A
// subscription the hub learns of during the walk is not in it; the next walk
// from the first page has it. The cursor is opaque and signed, valid for the
// same page and person, for an hour: anything else is 400 `bad_request` with
// the reason `cursor_invalid`, and a cursor presented with another
// `windowHours` is 400 with `cursor_window_mismatch`. Either way the client
// reads the first page again.
//
// The rows of a walk are fixed; what is said ABOUT each fan (`status`,
// `thread`, `claim`) and the page-level `coverage` and `welcomeTemplate` are
// read when the page is asked for.
export const CLIENT_AUDIENCE_NEW_DEFAULT_WINDOW_HOURS = 48;
/** The widest window; the bootstrap announces it as `limits.audienceWindowHours`. */
export const CLIENT_AUDIENCE_NEW_MAX_WINDOW_HOURS = 720;
export const CLIENT_AUDIENCE_NEW_DEFAULT_LIMIT = 50;
export const CLIENT_AUDIENCE_NEW_MAX_LIMIT = 100;
/**
 * Known values of `kind`. On the wire an open token. `new`: a first
 * subscription (with `trial` when it is a free trial). `returning`: a fan who
 * was subscribed before and came back: OnlyFans says so, or it names the
 * subscription new (a free-trial link taken again reads as a new trial) while
 * the hub holds a subscription of the fan that started earlier. `trial` stays
 * as OnlyFans said it. There is no "renewed": OnlyFans sends no notification
 * when a subscription renews by itself.
 */
export const CLIENT_AUDIENCE_NEW_KINDS = ["new", "returning"];
/**
 * Known values of `subscribedAtSource`. On the wire an open token.
 * `notification`: the time of the subscription notification, which OnlyFans
 * gives to the minute. `subscribeAt`: the subscription's own start as a
 * subscriber sweep read it from OnlyFans, used once it names the same
 * subscription as the notification.
 */
export const CLIENT_AUDIENCE_NEW_SUBSCRIBED_AT_SOURCES = ["subscribeAt", "notification"];
/** Known values of `status.subscriptionStatus`. On the wire an open token. */
export const CLIENT_AUDIENCE_NEW_SUBSCRIPTION_STATUSES = ["active", "expired", "unknown"];
/**
 * Known values of `status.source`: which collector the subscription's state
 * rests on. On the wire an open token. `sweep`: the newest subscriber sweep
 * saw the fan, or a sweep's end retired a subscription it no longer found.
 * `webhook`: a notification wrote the state and no sweep has confirmed it
 * since. `none`: the hub holds no subscription of the fan on the page.
 */
export const CLIENT_AUDIENCE_NEW_STATUS_SOURCES = ["sweep", "webhook", "none"];
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
export const CLIENT_AUDIENCE_NEW_COVERAGE_REASONS = [
    "delivery_history_off", "delivery_history_pending", "delivery_history_before_window", "delivery_history_behind",
    "subscription_event_pending", "subscription_projection_pending", "subscription_projection_failed",
    "audience_sweep_missing", "audience_sweep_unverified",
];
/**
 * The `reason` beside this route's 400 `bad_request`. `cursor_invalid`: the
 * cursor is not one this hub issued for this request (forged or cut, issued
 * for another page or person, or older than an hour); the answer never says
 * which. `cursor_window_mismatch`: the cursor is the caller's own, of a walk
 * with another `windowHours`.
 */
export const CLIENT_AUDIENCE_NEW_REFUSAL_REASONS = ["cursor_invalid", "cursor_window_mismatch"];
export const clientAudienceNewQuerySchema = z.object({
    /** How far back the window reaches from the moment the walk starts. */
    windowHours: z.coerce.number().int().min(1).max(CLIENT_AUDIENCE_NEW_MAX_WINDOW_HOURS)
        .default(CLIENT_AUDIENCE_NEW_DEFAULT_WINDOW_HOURS),
    /** `nextCursor` of the previous page, with the same `windowHours`. */
    cursor: clientCursorSchema.optional(),
    limit: z.coerce.number().int().min(1).max(CLIENT_AUDIENCE_NEW_MAX_LIMIT)
        .default(CLIENT_AUDIENCE_NEW_DEFAULT_LIMIT),
}).strict();
/**
 * The greeting, lease and custody of one fan as a list row carries them: the
 * states the claim status read (`clientFanClaimStatus`) answers for the same
 * fan and caller, without the tokens and ids. The read names no client
 * install, so the caller's own live lease reads `held` by `you-elsewhere`.
 */
export const clientClaimSummarySchema = z.object({
    greeting: z.enum(CLIENT_GREETING_STATES),
    lease: z.enum(CLIENT_LEASE_STATES),
    heldBy: z.enum(CLIENT_LEASE_HOLDERS).nullable(),
    custody: z.enum(CLIENT_CUSTODY_STATES).nullable(),
});
export const clientAudienceNewItemSchema = z.object({
    /** The hub's id of the subscription event: stable, so a client can tell an event it already announced. */
    eventRef: z.string(),
    fanRef: clientFanRefSchema,
    username: z.string().nullable(),
    displayName: z.string().nullable(),
    /** Open token; known values: CLIENT_AUDIENCE_NEW_KINDS. */
    kind: clientOpenToken,
    /** The subscription started as a free trial. */
    trial: z.boolean(),
    subscribedAt: isoTimestamp,
    /** Open token; known values: CLIENT_AUDIENCE_NEW_SUBSCRIBED_AT_SOURCES. */
    subscribedAtSource: clientOpenToken,
    /** The fan's subscription to this page as the hub holds it now. */
    status: z.object({
        /** The page's fan record; null while the hub holds no subscription of the fan. */
        isSubscriber: z.boolean().nullable(),
        /** Open token; known values: CLIENT_AUDIENCE_NEW_SUBSCRIPTION_STATUSES. */
        subscriptionStatus: clientOpenToken,
        /** Null too when the hub holds only the end of the period before the fan came back. */
        endsAt: isoTimestamp.nullable(),
        /** When the subscription's state was last written; null with `source: "none"`. */
        asOf: isoTimestamp.nullable(),
        /** Open token; known values: CLIENT_AUDIENCE_NEW_STATUS_SOURCES. */
        source: clientOpenToken,
    }),
    /** The chat with the fan as the hub stores it; null while it holds no chat with them. */
    thread: z.object({
        lastMessageAt: isoTimestamp.nullable(),
        lastFanMessageAt: isoTimestamp.nullable(),
        lastModelMessageAt: isoTimestamp.nullable(),
        /**
         * Messages of the chat the hub's chat record counts, automatic ones included.
         * NOT the number the Hi gate checks: that gate counts the transcript a
         * generation reads (the message archive), which can run ahead of this record.
         */
        storedMessageCount: count,
        /** Open token; known values: CLIENT_COVERAGE_LEVELS. */
        coverage: clientOpenToken,
        /** The chat's history was read from OnlyFans to its first message. */
        backfillComplete: z.boolean(),
    }).nullable(),
    claim: clientClaimSummarySchema,
});
export const clientAudienceNewResponseSchema = z.object({
    pageLabel: z.string(),
    /** Fixed by the first page of the walk and repeated on every later one. */
    window: z.object({
        hours: positive,
        from: isoTimestamp,
        to: isoTimestamp,
        /** Events the hub recorded after this moment are not in the walk. */
        snapshotAt: isoTimestamp,
    }),
    serverNow: isoTimestamp,
    /** Whether the hub can vouch that the window's list is whole and its rows' `status` current. */
    coverage: z.object({
        /** Open token; known values: CLIENT_COVERAGE_LEVELS. */
        state: clientOpenToken,
        /** Up to when the provider's webhook delivery history is checked. */
        deliveryFrontier: isoTimestamp.nullable(),
        /** When the last subscriber sweep of the page completed. */
        lastAudienceSweepAt: isoTimestamp.nullable(),
        /** Open tokens, empty when complete; known values: CLIENT_AUDIENCE_NEW_COVERAGE_REASONS. */
        reasons: z.array(clientOpenToken),
    }),
    /**
     * Subscription events of the window that are not rows and that the hub
     * cannot account for: one it cannot classify, and one without a usable fan
     * id. Counted over the whole window, not the page. A top-fan award (OnlyFans
     * reports it as a subscription) is left out on purpose and is not counted.
     */
    unknownCount: count,
    /** The page's automatic welcome message as last collected; null until it is collected. */
    welcomeTemplate: z.object({
        /** The provider's id of the template: changes when a new one is saved. */
        ref: z.string(),
        observedAt: isoTimestamp,
        /** Whether OnlyFans sends it; null when the provider did not say. */
        enabled: z.boolean().nullable(),
        hasText: z.boolean(),
        hasMedia: z.boolean(),
        /** Its price; null when the provider gave none the hub can use. */
        priceMills: mills.nullable(),
    }).nullable(),
    items: z.array(clientAudienceNewItemSchema),
    /** Null on the last page of the walk. */
    nextCursor: clientCursorSchema.nullable(),
});
export const clientRouteSchemas = {
    clientBootstrap: {
        auth: { kind: "apiKey" },
        tags: ["client"],
        summary: "Chat-extension bootstrap: who the caller is, their pages, switches, limits and the hub's capabilities",
        description: "Read-only and database-only: no platform request, no queued work. Answers 200 while every "
            + "feature is off; a feature the owner has not switched on reads `available: false` with a reason. "
            + "Flags, features, capabilities, reasons, platforms and roles are open strings: a client treats an "
            + "unknown one as off.",
        response: {
            200: clientBootstrapResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    clientConversationRecaps: {
        auth: { kind: "apiKey", scope: "page" },
        tags: ["client"],
        summary: "The shared full and short recap of one fan on one page, with their text",
        description: "Read-only and database-only: no platform request, no generation, no AI spend. Answers the "
            + "freshest usable full and short `fan-summary` recap of the fan (`fanRef` is the OnlyFans fan id, "
            + "which is the chat id), the same two rows `aiRecapStatus` describes, to every chatter granted the "
            + "page, whoever generated them. A recap generated from context only its caller saw is never "
            + "selected. `personaDefinitionId` narrows both slots to one persona. `fullSavedToProfile` tells "
            + "whether the fan's latest dossier on this page has exactly the full recap's text. Behind the "
            + "chat-extension `recap` switch: 409 `client_feature_disabled` with the reason.",
        params: clientPageFanParamsSchema,
        querystring: clientConversationRecapsQuerySchema,
        response: {
            200: clientConversationRecapsResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
        },
    },
    clientConversationFeed: {
        auth: { kind: "apiKey", scope: "page" },
        tags: ["client"],
        summary: "One conversation's messages from the hub's own stores, newest first, with a Ping summary on the first page",
        description: "Read-only and database-only: no platform request, no refresh, no queued work, so the chat is "
            + "never marked read on the platform. `fanRef` is the OnlyFans fan id, which is the chat id. The reader is "
            + "the one a generation uses (`aiTranscriptFreshUnionMode`): `source` is `archive` or `union`. Rows come "
            + "newest first, `limit` (1 to 100) a page; a message deleted on the platform stays as a row with "
            + "`deleted: true` and an empty `text`. A request without `cursor` starts a walk and freezes it: "
            + "`snapshotRevision`, `asOf`, "
            + "`coverage`, `head` and `newestKnownAt` are the same on every page of the walk, and a message that "
            + "arrives meanwhile is not in it. `head` is the reader's newest live message, the `servedHead` a "
            + "generation's `context_v1` frame reports from the same stored state. `summary` comes on the first page "
            + "only: the Ping segment and the fan's silence, counted by the generation's own rule over the newest "
            + "`summaryWindow` messages (5 to 1500, 100 by default). `nextOlderCursor` is opaque, signed, and valid "
            + "only for the same page, fan and person on the same reader, until the archive is rebuilt, and for a "
            + "day after the walk's first page (taking a page does not renew a walk): "
            + "anything else is 400 `bad_request` with the reason `cursor_invalid`, and the client reads the first "
            + "page again. Behind the chat-extension `preview` switch: 409 `client_feature_disabled` with the reason.",
        params: clientPageFanParamsSchema,
        querystring: clientConversationFeedQuerySchema,
        response: {
            200: clientConversationFeedResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
        },
    },
    clientFanProfileFromGeneration: {
        auth: { kind: "apiKey", scope: "page" },
        tags: ["client"],
        summary: "Save a finished full recap as the fan's dossier, from the generation the hub stored",
        description: "Database-only: no platform request, no generation, no AI spend. The caller names one of its "
            + "own generations by `generationRef` (the `meta.requestId` of the AI request) and the hub writes "
            + "that generation's text as a new dossier version of the fan on the page (`fanRef` is the OnlyFans "
            + "fan id, which is the chat id). Only a generation of the same user, page and fan is found (404 "
            + "otherwise), and only a usable full `fan-summary` is saved: 409 `generation_not_eligible` with a "
            + "`reason` for any other. Idempotent: when a version of the fan's dossier already has exactly this "
            + "text, the answer is `existing` and nothing is written. The generation's record appears shortly "
            + "after the stream's `done` frame; until then, a request that names its `clientRequestId` is "
            + "answered 409 `generation_not_ready` and may be repeated. That answer can stay for good when the "
            + "record was never written, so a client bounds its repeats. Behind the chat-extension `recap` "
            + "switch: 409 `client_feature_disabled` with the reason.",
        params: clientPageFanParamsSchema,
        body: clientFanProfileFromGenerationBodySchema,
        response: {
            200: clientFanProfileFromGenerationResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
        },
    },
    clientAiUsageDaily: {
        auth: { kind: "apiKey", scope: "page" },
        tags: ["client"],
        summary: "The caller's own AI spend on one page, by day",
        description: "Read-only and database-only: no platform request, no queued work. Only the caller's own "
            + "ledger rows on the page of the path; an owner too reads only their own. `date` is the last of "
            + "`days` (1 to 7) calendar days in `timeZone` (Europe/Moscow by default); every day carries the "
            + "instants it was cut at. A day is `partial` while it is not over (`day_open`), while a generation "
            + "of it is still running (`open_reservations`), or when a cost in it is an estimate "
            + "(`approximate_cost`). `quota` is counted over the UTC day, not over `timeZone`. Refused with 400 "
            + "and a `reason`: `unknown_time_zone`, `date_in_future`, `date_too_old` (more than 8 days before "
            + "today in `timeZone`). Behind the chat-extension master switch and minimum version: 409 "
            + "`client_feature_disabled` with the reason (`disabled`, `client_outdated`, `not_granted`).",
        params: clientPageParamsSchema,
        querystring: clientAiUsageQuerySchema,
        response: {
            200: clientAiUsageResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
        },
    },
    clientSpenderStats: {
        auth: { kind: "apiKey", scope: "page" },
        tags: ["client"],
        summary: "Spenders statistics of one page: 30 local days of money, tiers, silence, new payers, awaiting reply",
        description: "Read-only and database-only: no platform request, no queued work. The window is `windowDays` "
            + "(30) local dates of `timeZone`, today included up to `asOf`; money is gross integer mills, every "
            + "transaction state counted (`includedStates`), so with `timeZone=UTC` `totals.d30.grossMills` equals "
            + "the `/api/v2/spenders` `period=30d` total of the page at the same instant. `tiers` are the hub's "
            + "spender buckets by lifetime gross plus the remainders `untiered` and `unattributed`, and their "
            + "window gross sums to the window total. `silence` counts payers by whole days since the fan's last "
            + "text message, among the messages a generation of the page reads. What the hub cannot vouch for it "
            + "says in `coverage` (`complete`, `partial`, `unknown`, with reasons); an unknown number is null, "
            + "never 0. An answer is kept for up to 60 seconds: `asOf` is the instant it was counted at. Refused "
            + "with 400 and the `reason` `unknown_time_zone` for a zone that is not an IANA name the hub knows. "
            + "Behind the chat-extension `stats` switch: 409 `client_feature_disabled` with the reason.",
        params: clientPageParamsSchema,
        querystring: clientSpenderStatsQuerySchema,
        response: {
            200: clientSpenderStatsResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
        },
    },
    clientSpenderAwaitingReply: {
        auth: { kind: "apiKey", scope: "page" },
        tags: ["client"],
        summary: "The payers of one page whose fan waits for a reply, biggest spender first, a page at a time",
        description: "Read-only and database-only: no platform request, no queued work, so no chat is marked read on "
            + "the platform. A payer waits when the last fan message of the chat is later than the page's last "
            + "message there, or the page never wrote; the payers and the rule are those of `queueSummary` in the "
            + "Spenders statistics. Rows come by lifetime gross, largest first, then the fan waiting longest, "
            + "`limit` (1 to 100, 50 by default) a page. `readState` is `unread`, `read` or `unknown`: a fan whose "
            + "read state the hub cannot tell is its own category, with a null `unreadCount`. `total` and "
            + "`unknown` count the whole queue at `asOf`; `loaded` counts the rows the walk has served so far. "
            + "Every page is read at its own instant: a fan whose place in the order does not change is served "
            + "exactly once, a fan answered meanwhile is not served, and a fan whose place changed can be met "
            + "twice. `nextCursor` is opaque, signed, and valid only for the same page and person, for an hour "
            + "after the page that carried it (every page carries a new one, so the hour bounds the gap between "
            + "two pages, not the walk): anything else is 400 `bad_request` with the reason `cursor_invalid`, and "
            + "the client reads the first page again. Behind the chat-extension `stats` switch: 409 "
            + "`client_feature_disabled` with the reason.",
        params: clientPageParamsSchema,
        querystring: clientSpenderAwaitingReplyQuerySchema,
        response: {
            200: clientSpenderAwaitingReplyResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
        },
    },
    clientFanClaim: {
        auth: { kind: "apiKey", scope: "page" },
        tags: ["client"],
        summary: "The greeting lease and the send custody of one fan: claim, renew, release, dispatch, sent, failed, registerNativeSend",
        description: "Database-only: no platform request, no queued work; the hub never sends the message itself. "
            + "`fanRef` is the OnlyFans fan id, which is the chat id. Three facts per fan: the first greeting is "
            + "confirmed; one person and client install holds the lease on working it out (`claim`, `renew`, "
            + "`release`); one attempt holds the custody of a part being sent (`dispatch`, then `sent` or `failed`). "
            + "A lease is refused while another person or install holds the fan (409 `claim_busy`), to everyone "
            + "but the greeting's owner once the fan is greeted (409 `greeting_done`), and to everyone while a "
            + "desktop new-follower command may have greeted the fan (409 `custody_held`). "
            + "`dispatch` decides in one transaction, in this order: a repeat of the same `attemptId` with the same "
            + "body only reads (never a second ticket), another body is 409 `attempt_conflict`; the owner's switches; "
            + "the rate (6 per 60 s per person, 429 `preview_send_rate_limited` with `retryAfterMs`); no unresolved "
            + "send to the fan (409 `custody_held`); for a greeting, no desktop new-follower command that greeted the "
            + "fan (409 `greeting_done`) or may have (409 `custody_held`), then either the confirmed greeting's owner "
            + "and group (409 `greeting_done`, `generation_mismatch`) or the caller's live lease (409 `claim_busy` "
            + "while another person or install holds the fan, `claim_expired` when there is no live lease or this "
            + "install holds the fan under another token than the one named); the part not sent yet (409 "
            + "`part_already_sent`). It answers a one-time `ticket` once. "
            + "The switches of a dispatch are the owner's stored `chatExtensionEnabled` and `chatExtensionFeatures`, "
            + "read under a row lock inside that transaction, so a change of them waits for the dispatch and holds "
            + "from the next one; a value that only the environment sets admits no dispatch. Custody never expires: "
            + "past its ticket an unreported dispatch reads `uncertain-held` and holds the fan until `sent` or a "
            + "manual resolve. `sent` and `failed` come only from the person and install that dispatched (409 "
            + "`custody_not_owned`); `failed` only with proof the native queue never took the part, and only while "
            + "the ticket lasts (409 `custody_held` after it: `uncertain-held` never becomes `failed`). "
            + "`registerNativeSend` records a proven send from the composer, once per page and message, and frees "
            + "nobody's custody: a part whose send from the preview is unresolved stays held (409 `custody_held`). "
            + "A greeting is the exception in what it records, not in what it frees: the proof confirms the fan's "
            + "greeting (200, `greeting.source` `native-register`) while that part's send stays held, so the fan "
            + "never reads as not greeted after it. In the group `heldParts` lists only the parts nobody can vouch "
            + "for (`uncertain-held`); a part inside its ticket is in flight. Switches by action: `claim` and "
            + "`renew` need `newcomers`; `dispatch` needs `previewSend`, and `newcomers` too for a greeting; "
            + "`release`, `sent` and `failed` end what the hub already admitted and need only the page grant; "
            + "`registerNativeSend` reports a send that already happened and needs only the page grant on an "
            + "OnlyFans page: no switch, flag or minimum version refuses it, and it admits no dispatch. A refusal "
            + "by the switches is 409 `client_feature_disabled` with the reason.",
        params: clientPageFanParamsSchema,
        body: clientFanClaimBodySchema,
        response: {
            200: clientFanClaimResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
            429: clientPreviewSendRateLimitedResponseSchema,
        },
    },
    clientFanClaimStatus: {
        auth: { kind: "apiKey", scope: "page" },
        tags: ["client"],
        summary: "The greeting, lease and custody state of one fan, read only",
        description: "Read-only and database-only: one snapshot, no lock, no write, never a ticket. The same answer "
            + "as the claim POST. The request names no client install, so the caller's own live lease reads `held` "
            + "by `you-elsewhere`; an idempotent `claim` with the lease's token answers `owned`. It names no attempt "
            + "either: `custody` is the fan's unresolved send (anyone's, `dispatching` or `uncertain-held`), and "
            + "while there is none, the caller's own last send to the fan dispatched from the preview, in the state "
            + "it ended (`sent`, `failed`, `resolved-sent`, `resolved-not-sent`). That is how a client that lost "
            + "track of its send learns of a manual resolve. Nobody else's finished send is shown. A desktop "
            + "new-follower command that OnlyFans confirmed reads as a confirmed greeting with the source "
            + "`desktop-outbox`. One whose outcome is unknown (queued, in flight, indeterminate, or failed without "
            + "proof it never left) may have greeted the fan and holds it the same way as a send nobody can vouch "
            + "for: while no send of the extension is unresolved, `custody` reads `uncertain-held` under the "
            + "command's id, and the fan never reads as free. Behind the chat-extension master switch and minimum "
            + "version, with no flag of its own: it answers while `previewSend` and `newcomers` are off. 409 "
            + "`client_feature_disabled` with the reason (`not_granted`, `platform_unsupported`, `disabled`, "
            + "`client_outdated`).",
        params: clientPageFanParamsSchema,
        response: {
            200: clientFanClaimResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
        },
    },
    clientAudienceNew: {
        auth: { kind: "apiKey", scope: "page" },
        tags: ["client"],
        summary: "Who subscribed to an OnlyFans page or came back, inside a window of hours, with each fan's greeting state",
        description: "Read-only and database-only: the hub's own collected subscription notifications and "
            + "projections; no platform request, no queued work, and no chat is marked read. One row per "
            + "subscription notification, newest first. `kind` is `new` (with `trial` for a free trial) or "
            + "`returning`; there is no renewal row, because OnlyFans sends no notification when a subscription "
            + "renews by itself. A subscription OnlyFans names new is `returning` when the hub holds an earlier "
            + "subscription of the fan. A notification the hub cannot classify and one without a usable fan id are "
            + "not rows: `unknownCount` counts them over the whole window. A top-fan award is not a row either and "
            + "is not counted. `subscribedAt` is the notification's time (to the minute) until a subscriber sweep "
            + "has read the same subscription's own start (`subscribedAtSource`). "
            + "`status` is the fan's subscription as the hub holds it now, with when "
            + "it was written (`asOf`) and by which collector; `thread` what the hub stores of the chat; `claim` "
            + "the states `clientFanClaimStatus` answers for the same fan and caller, where a greeting the desktop "
            + "sent counts as confirmed and a desktop command that may have greeted reads as custody "
            + "`uncertain-held`. `coverage` says whether the hub can vouch for the list (`complete`, "
            + "`partial`, `unknown`) and why not. `welcomeTemplate` is the page's automatic welcome message as last "
            + "collected, null until the owner switches its collection on. A request without `cursor` starts a "
            + "walk and fixes its window (`window`); a later page repeats the window and never shows a "
            + "subscription the hub learned of after `window.snapshotAt`. `cursor` is valid for the same page and "
            + "person for an hour: otherwise 400 `bad_request` with the reason `cursor_invalid`, and with another "
            + "`windowHours` than its walk's, `cursor_window_mismatch`; the client then reads the first page again. "
            + "Behind the chat-extension `newcomers` switch, on an OnlyFans page: 409 `client_feature_disabled` "
            + "with the reason.",
        params: clientPageParamsSchema,
        querystring: clientAudienceNewQuerySchema,
        response: {
            200: clientAudienceNewResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
        },
    },
    clientSendCustodyResolve: {
        auth: { kind: "session", scope: "page" },
        tags: ["client"],
        summary: "Resolve a held chat-extension send by hand: sent or not sent, with a note",
        description: "A cabinet route for the owner and team leads (cookie session, a page they reach); no device "
            + "token reaches it and it is on no narrow-token list. Ends the custody of one attempt that is still "
            + "`dispatching` or `uncertain-held`, after the resolver looked at the chat: `sent` (optionally with the "
            + "OnlyFans message id; the first part of a greeting then confirms the greeting) or `not_sent` (the part "
            + "may be sent again). `not_sent` waits for the attempt's ticket to run out: inside it the page may still "
            + "send the part (409 `conflict` with the reason `ticket_live`). Audited as "
            + "`client.send_custody_resolved` in the same transaction. Idempotent: the same resolve again answers "
            + "the same and writes nothing. 404 for an attempt that is not of this page; 409 `conflict` with the "
            + "reason `custody_not_held` for one already reported sent or failed; 409 `attempt_conflict` for one "
            + "resolved otherwise, or a message id another send already carries.",
        params: clientSendCustodyParamsSchema,
        body: clientSendCustodyResolveBodySchema,
        response: {
            200: clientSendCustodyItemSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
        },
    },
    clientSendCustodyList: {
        auth: { kind: "session" },
        tags: ["client"],
        summary: "Held chat-extension sends of the pages the viewer reaches, and the ones resolved by hand",
        description: "A cabinet route for the owner and team leads (cookie session); no device token reaches it and it "
            + "is on no narrow-token list. Read-only and database-only: it asks OnlyFans nothing and queues nothing. "
            + "`state=held` (the default) lists the sends past their ticket that nobody ended (`uncertain-held`), the "
            + "longest held first; a send still inside its ticket is in flight and is not listed. `state=resolved` lists "
            + "the sends ended by hand, the last resolved first, each with its resolver, time, outcome and note. The "
            + "owner reads every active page, a team lead the pages assigned to them; `pageLabel` narrows the list to one "
            + "page (404 for a page that does not exist, 403 for one the viewer does not reach). Each item names the "
            + "page, the fan, the purpose, the part of its group, the attempt, who dispatched it and from which client "
            + "install, when, and whether the fan's greeting is on record. No text of any message is served: the "
            + "custody tables hold none, and the hub does not know which text went out. `generationRef` names the AI "
            + "generation the text came from; its record stays the owner's alone, on "
            + "`GET /api/v1/ai/restricted/generations/:generationRef`. `limit` and `offset` page the list; `total` "
            + "counts the whole of it.",
        querystring: clientSendCustodyListQuerySchema,
        response: {
            200: clientSendCustodyListResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    adminClientHealth: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Owner view of the chat extension's health: speed, host contract, counters and footprint by client version",
        description: "Read-only and database-only, over the hourly `client_health` rollups, which hold no user, page, "
            + "fan or device: the view names no person. Reports are filed under the hour the hub received them; the range "
            + "is whole days of `range.timeZone`. Percentiles are read off buckets merged over the range. A group with "
            + "fewer than `minGroupSize` observations in the range asked for shows its size and no mean, maximum or "
            + "percentile. That floor is on the range of one read and no narrower: the mean and the maximum of a few "
            + "observations can be worked out from two reads of larger ranges, so it keeps a thin figure from being read "
            + "as the version's and does not seal a small group off. Contract verdicts and counters are counts of reports "
            + "and events, shown at any size.",
        querystring: adminClientHealthQuerySchema,
        response: {
            200: adminClientHealthResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
};
// ── client_health v1 (H-11a) ─────────────────────────────────────────────────
//
// The chat extension's health report: its version, the host build fingerprint,
// the host-contract verdict, what is switched off, counters by code, perf
// histograms and an estimate of its own storage. No text from a chat and no fan,
// chat, message or operation id.
//
// THE CLIENT'S SHAPE. The chat extension froze this report in its contracts
// v1.0.0 (`ClientHealthV1Schema` in its packages/contracts/src/telemetry.ts; its
// `kind` rides the ingest envelope, the rest is this body). The metric names and
// bounds, the field names and every limit below are the client's, and every
// report the client's schema accepts parses here: a report the hub refused would
// be lost with its P1 counters. The hub adds only checks such a report always
// meets: counts = bounds + 1 and count = Σcounts (the client's own), strictly
// increasing bounds (the client pins every histogram to this registry), an empty
// histogram with sum 0 and max 0, one histogram per metric.
//
// Codes, not free text: host anchors, switched-off features, counter keys, the
// host kind and metric names match CLIENT_HEALTH_CODE_PATTERN, ASCII without
// spaces, so a sentence, a fan's name with a space or a URL does not fit in one.
// Two fields are the client's bounded strings, not codes: the client version
// (its manifest version) and the host build (the hashed name of the host's entry
// module). And a code may name an inherited object property (`constructor`); a
// record drops an own `__proto__` key without a word, as on the client. The
// intake (H-11b) keys its user-free hourly rollups, kept forever, on these
// strings (client version, host kind and build, metric, anchor, counter code),
// so it files a version or build that is not a code under one placeholder, and
// merges codes into a Map, never into a plain object.
//
// No route carries it and nothing on the hub reads it yet, so the contract hash
// does not move: this is the shape the client and the hub agree on. The client
// sends a report as one `ingestObservations` event of kind
// CLIENT_HEALTH_INGEST_KIND, in a batch of its own, and ONLY once the bootstrap
// lists `client-health-perf-v1`; until then it keeps its reports to itself. A
// hub older than the intake (H-11b) journals an unknown kind in `observations`
// (`desktop.unknown:<kind>`) with the user, forever and on into the lake, which
// is exactly what this report must never become. The intake (H-11b) never
// journals the kind, from any token: behind the capability (the owner's
// `chatExtensionHealthIngestEnabled`) it checks a report against this schema
// and the bounds registry and folds it into hourly rollups keyed without the
// user; without it, it accepts the report and keeps nothing.
//
// A client→hub shape, so strict (§4.0): an unknown key is a malformed report,
// and a new field is a new report version. Growing names (metric, host kind)
// stay open, as codes: one the hub does not know it drops, and the rest of the
// report still counts. The checks below are cheap and local (no clock, no
// registry). The intake checks a known metric's bounds against the registry,
// drops a histogram whose max or sum its buckets cannot hold (the runtime's
// `clientHealthHistogramFits`), and files a report under the hour it received
// it, not the client's window.
/** The `ingestObservations` event kind of a health report. */
export const CLIENT_HEALTH_INGEST_KIND = "client_health";
/**
 * A code, never free text (the client's HEALTH_CODE_PATTERN): error and P1
 * codes, contract anchors, switched-off features, metric names, the host kind.
 */
export const CLIENT_HEALTH_CODE_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/;
const healthCode = z.string().regex(CLIENT_HEALTH_CODE_PATTERN);
/** A growing name (metric, host kind): a code within the open-token length. */
const healthName = healthCode.max(64);
/** One counter in one report (the client's cap). */
const healthCounterValue = z.number().int().min(0).max(1_000_000);
/**
 * An instant on the client's clock: ISO 8601 with `Z` or a `±HH:MM` offset,
 * checked by pattern only, as on the client (its IsoTimestampSchema).
 */
const CLIENT_HEALTH_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const healthInstant = z.string().max(40).regex(CLIENT_HEALTH_INSTANT_PATTERN);
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
export const CLIENT_HEALTH_PERF_METRICS = {
    /** Route change → dock updated. */
    routeToDockMs: { unit: "ms", schemaVersion: 1, bounds: [1, 2, 4, 8, 16, 32, 50, 75, 100, 150, 250, 500, 1000] },
    /** Hotkey or click → visible response. */
    panelOpenMs: { unit: "ms", schemaVersion: 1, bounds: [4, 8, 16, 32, 50, 75, 100, 150, 250, 500, 1000, 2500] },
    /** Click → request sent: the client's own overhead. */
    requestOverheadMs: { unit: "ms", schemaVersion: 1, bounds: [1, 2, 4, 8, 16, 32, 50, 100, 250, 500] },
    /** Click → first chunk, end to end (provider latency included). */
    ttfcMs: {
        unit: "ms", schemaVersion: 1,
        bounds: [250, 500, 1000, 1500, 2000, 3000, 4000, 6000, 8000, 12000, 20000, 30000, 60000],
    },
    /** First chunk → painted. */
    firstChunkPaintMs: { unit: "ms", schemaVersion: 1, bounds: [4, 8, 16, 32, 50, 75, 100, 150, 250, 500] },
    /** Guarded insert with verification. */
    insertMs: { unit: "ms", schemaVersion: 1, bounds: [4, 8, 16, 32, 50, 75, 100, 150, 250, 500, 1000] },
    /** Board open from cache. */
    boardOpenMs: { unit: "ms", schemaVersion: 1, bounds: [8, 16, 32, 50, 75, 100, 150, 250, 500, 1000, 2500] },
    /** Search over up to 1000 rows. */
    searchMs: { unit: "ms", schemaVersion: 1, bounds: [1, 2, 4, 8, 16, 32, 50, 100, 250, 500] },
    /** The client's synchronous handlers, sampled 1 in 20. */
    handlerMs: { unit: "ms", schemaVersion: 1, bounds: [0.1, 0.5, 1, 2, 4, 8, 16, 50, 100] },
    /** Event Timing of the client's hotkeys and clicks → next paint. */
    eventLatencyMs: { unit: "ms", schemaVersion: 1, bounds: [8, 16, 24, 32, 50, 75, 100, 150, 250, 500, 1000] },
    /** Input delay in the host's composer with the extension on. */
    composerInputDelayMs: { unit: "ms", schemaVersion: 1, bounds: [1, 2, 4, 8, 16, 32, 50, 100, 250] },
};
/**
 * One perf metric over the report window. Percentiles are the hub's job: it
 * computes them from buckets merged across reports, never from the client's.
 */
export const clientHealthPerfHistogramSchema = z.object({
    /** Open name; known values: the keys of CLIENT_HEALTH_PERF_METRICS. */
    metric: healthName,
    unit: z.literal("ms"),
    schemaVersion: positive,
    bounds: z.array(z.number().nonnegative()).min(1).max(32),
    counts: z.array(count).min(2).max(33),
    count,
    sum: z.number().nonnegative(),
    max: z.number().nonnegative(),
}).strict().superRefine((histogram, ctx) => {
    const { bounds, counts, count: total, sum, max } = histogram;
    if (counts.length !== bounds.length + 1) {
        ctx.addIssue({ code: "custom", path: ["counts"], message: "counts must have one more entry than bounds" });
        return;
    }
    if (counts.reduce((acc, bucket) => acc + bucket, 0) !== total) {
        ctx.addIssue({ code: "custom", path: ["count"], message: "count must equal the sum of counts" });
    }
    for (let index = 1; index < bounds.length; index += 1) {
        if (!(bounds[index] > bounds[index - 1])) {
            ctx.addIssue({ code: "custom", path: ["bounds", index], message: "bounds must strictly increase" });
        }
    }
    if (total === 0 && (sum !== 0 || max !== 0)) {
        ctx.addIssue({ code: "custom", path: ["sum"], message: "an empty histogram has sum 0 and max 0" });
    }
});
export const clientHealthReportV1Schema = z.object({
    v: z.literal(1),
    /** The aggregation window on the client's clock (15 minutes today); neither ordered nor capped, as on the client. */
    window: z.object({ from: healthInstant, to: healthInstant }).strict(),
    client: z.object({
        name: z.literal("chat-extension"),
        /** The add-on's version: the client's bounded string, not a code. */
        version: z.string().min(1).max(32),
        browser: z.literal("firefox"),
        browserMajor: positive,
        os: z.enum(["windows", "macos", "linux", "other"]),
    }).strict(),
    host: z.object({
        /** Open name: the host page the client works over (`chatspace` today). */
        kind: healthName,
        /**
         * The host's build fingerprint (the hashed name of its entry module, such as
         * `index-AbCdEfGh`); null when it could not be read. The client's bounded
         * string, not a code.
         */
        build: z.string().max(80).nullable(),
        /** Whether every anchor of the host contract was found. */
        contractOk: z.boolean(),
        /** Anchors of the host contract that were not found. */
        missing: z.array(healthCode).max(64),
    }).strict(),
    /** Features switched off by the owner's flags or by a broken host contract. */
    disabled: z.array(healthCode).max(64),
    /** At most one histogram per metric: a metric twice in one report would count twice. */
    perf: z.array(clientHealthPerfHistogramSchema).max(16)
        .superRefine((perf, ctx) => {
        const seen = new Set();
        perf.forEach((histogram, index) => {
            if (seen.has(histogram.metric)) {
                ctx.addIssue({ code: "custom", path: [index, "metric"], message: "one histogram per metric" });
            }
            seen.add(histogram.metric);
        });
    }),
    /**
     * Code → occurrences in the window: errors by code, prevented inserts, P1s.
     * One code the client sends here is a level, not a count: `footprint.dom-nodes-max`,
     * the largest number of its own DOM nodes in the window. The intake buckets
     * it, one observation per report, and keeps it out of the counter totals.
     */
    counters: z.record(healthCode, healthCounterValue)
        .refine((counters) => Object.keys(counters).length <= 200, { message: "at most 200 counters" }),
    /** The client's own caches and logs, not the heap (Firefox has no portable heap reading). */
    footprint: z.object({ kind: z.literal("owned-estimate"), cachesKB: count, logsKB: count }).strict(),
}).strict();
