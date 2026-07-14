import { PERIOD_OPTIONS, SPENDER_PERIOD_OPTIONS, SPENDER_RETENTION_STATUSES, SPENDER_SERIES_GRANULARITIES, aiUsageFeatures, creatableUserRoles, fanFlagTypes, isValidBusinessDateString, platforms, transactionReportingBuckets, transactionStates, transactionTypes, userRoles, } from "../shared/index";
import { z } from "zod";
const intId = z.number().int().positive();
const mills = z.number().int();
const isoTimestamp = z.string();
const businessDate = z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => isValidBusinessDateString(value), "Invalid business date");
const periodEnum = z.enum(PERIOD_OPTIONS);
const spenderPeriodEnum = z.enum(SPENDER_PERIOD_OPTIONS);
const spenderSeriesGranularityEnum = z.enum(SPENDER_SERIES_GRANULARITIES);
const nonCustomPeriodEnum = z.enum(["today", "7d", "30d", "all"]);
const platformEnum = z.enum(platforms);
const transactionReportingBucketEnum = z.enum(transactionReportingBuckets);
const transactionTypeEnum = z.enum(transactionTypes);
const transactionStateEnum = z.enum(transactionStates);
const userRoleEnum = z.enum(userRoles);
const creatableUserRoleEnum = z.enum(creatableUserRoles);
const fanFlagEnum = z.enum(fanFlagTypes);
const aiUsageFeatureEnum = z.enum(aiUsageFeatures);
const spenderScopeKindEnum = z.enum(["page", "model", "agency"]);
const sortDirEnum = z.enum(["asc", "desc"]);
const spenderSortByEnum = z.enum([
    "grossAmountMills",
    "creatorNetAmountMills",
    "postedGrossAmountMills",
    "pendingGrossAmountMills",
    "postedCreatorNetAmountMills",
    "pendingCreatorNetAmountMills",
    "lifetimeGrossAmountMills",
    "lifetimeCreatorNetAmountMills",
    "lastTransactionAt",
    "platformUserId",
    "username",
    "displayName",
]);
const spenderRetentionStatusEnum = z.enum(SPENDER_RETENTION_STATUSES);
const fanSearchMatchKindEnum = z.enum(["platformUserId", "username", "alias", "displayName"]);
const pageSpenderAutoListBucketKeyEnum = z.enum([
    "0-25",
    "25-50",
    "50-150",
    "150-350",
    "350-600",
    "600-plus",
]);
const queryBooleanSchema = z.preprocess((value) => {
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true") {
            return true;
        }
        if (normalized === "false") {
            return false;
        }
    }
    return value;
}, z.boolean());
export const errorResponseSchema = z.object({
    error: z.string(),
    message: z.string(),
    statusCode: z.number().int(),
});
export const pageRefSchema = z.object({
    id: intId,
    label: z.string(),
    platform: platformEnum,
    modelSlug: z.string(),
    modelName: z.string(),
});
export const authUserSchema = z.object({
    id: intId,
    username: z.string(),
    role: userRoleEnum,
    // Stage 22: admin-set passwords may force a change on first session login.
    mustChangePassword: z.boolean(),
    assignedPages: z.array(pageRefSchema),
});
// --- Stage 22: device tokens + access grants ---
export const changePasswordBodySchema = z.object({
    currentPassword: z.string().min(1).max(1024),
    newPassword: z.string().min(8).max(256),
});
export const deviceTokenLabelBodySchema = z.object({
    label: z.string().min(1).max(120),
});
export const issuedDeviceTokenResponseSchema = z.object({
    // The raw bearer token — returned exactly once at issuance.
    token: z.string(),
    id: intId,
    label: z.string(),
    keyPrefix: z.string(),
    expiresAt: isoTimestamp,
});
export const reservedDeviceTokenResponseSchema = z.object({
    // Distinct-prefix raw reservation bearer, returned exactly once.  It cannot
    // authenticate ordinary routes until the activation move commits.
    token: z.string(),
    reservationId: intId,
    label: z.string(),
    keyPrefix: z.string(),
    reservationExpiresAt: isoTimestamp,
});
export const activatedDeviceTokenResponseSchema = issuedDeviceTokenResponseSchema.omit({
    token: true,
});
export const deviceTokenItemSchema = z.object({
    id: intId,
    label: z.string(),
    keyPrefix: z.string(),
    harvestMachineId: z.string().uuid().nullable(),
    isActive: z.boolean(),
    expiresAt: isoTimestamp,
    lastUsedAt: isoTimestamp.nullable(),
    createdAt: isoTimestamp,
    revokedAt: isoTimestamp.nullable(),
    revokedReason: z.string().nullable(),
});
export const deviceTokenHarvestCapabilityBodySchema = z.object({
    // null explicitly removes the capability; a UUID binds the token to that
    // one preserved Desktop database identity.
    machineId: z.string().uuid().nullable(),
});
export const accessGrantItemSchema = z.object({
    id: intId,
    scopeType: z.enum(["org", "model", "page"]),
    scopeId: z.number().int(),
    scopeLabel: z.string().nullable(),
    grantedBy: z.number().int().nullable(),
    grantedAt: isoTimestamp,
    revokedBy: z.number().int().nullable(),
    revokedAt: isoTimestamp.nullable(),
});
export const adminUserApiKeyStatusSchema = z.object({
    activeKeyPrefix: z.string().nullable(),
    activeKeyCount: z.number().int().nonnegative(),
    activeKeyCreatedAt: isoTimestamp.nullable(),
    activeKeyLastUsedAt: isoTimestamp.nullable(),
});
export const adminUserSchema = authUserSchema.extend({
    apiKeyStatus: adminUserApiKeyStatusSchema.nullable(),
    // Decision #126: deactivation tombstone (null = active) and the honest
    // activity signal — max(last api-key use, last device-token use), so a
    // password+device-token chatter (#116) no longer reads "Never".
    disabledAt: isoTimestamp.nullable(),
    lastActiveAt: isoTimestamp.nullable(),
});
export const authStateSchema = z.object({
    authMethod: z.enum(["session", "api_key", "device_token"]),
    user: authUserSchema,
});
const serviceHealthStatusEnum = z.enum(["ok", "degraded"]);
const systemCheckStatusEnum = z.enum(["ok", "error"]);
const healthConnectionStatusEnum = z.enum([
    "active",
    "stale",
    "error",
    "expired",
    "never_synced",
    "unverified",
]);
const syncUxStateEnum = z.enum([
    "healthy",
    "syncing",
    "catching_up",
    "retrying",
    "attention",
    "setup",
    "off",
]);
export const syncUxSummarySchema = z.object({
    state: syncUxStateEnum,
    label: z.string(),
    headline: z.string(),
    detail: z.string().nullable(),
    progressLabel: z.string().nullable(),
    nextRetryAt: isoTimestamp.nullable(),
    updatedAt: isoTimestamp.nullable(),
    requiresAction: z.boolean(),
});
export const systemCheckSchema = z.object({
    status: systemCheckStatusEnum,
    latencyMs: z.number().int().nonnegative().nullable(),
    error: z.string().nullable(),
});
export const healthResponseSchema = z.object({
    status: serviceHealthStatusEnum,
    timestamp: isoTimestamp,
    contractHash: z.string().regex(/^[a-f0-9]{64}$/),
    capabilities: z.array(z.literal("desktop-lifecycle-v2")),
    checks: z.object({
        api: z.object({
            status: z.literal("ok"),
        }),
        database: systemCheckSchema,
    }),
});
export const syncHealthPageSchema = z.object({
    pageId: intId,
    pageLabel: z.string(),
    platform: platformEnum,
    modelSlug: z.string(),
    modelName: z.string(),
    status: serviceHealthStatusEnum,
    connectionStatus: healthConnectionStatusEnum,
    lastLightSyncAt: isoTimestamp.nullable(),
    lightAgeMinutes: z.number().int().nonnegative().nullable(),
    lastFollowerSyncAt: isoTimestamp.nullable(),
    followerAgeMinutes: z.number().int().nonnegative().nullable(),
    failedStreams: z.number().int(),
    stalledStreams: z.number().int(),
    pendingStreams: z.number().int(),
    lastErrorSummary: z.string().nullable(),
    issues: z.array(z.string()),
});
export const syncHealthResponseSchema = z.object({
    status: serviceHealthStatusEnum,
    timestamp: isoTimestamp,
    thresholds: z.object({
        lightMaxAgeMinutes: z.number().int().positive(),
        followerMaxAgeMinutes: z.number().int().positive(),
    }),
    overall: z.object({
        pageCount: z.number().int(),
        unhealthyPageCount: z.number().int(),
        runningStreams: z.number().int(),
        failedStreams: z.number().int(),
        stalledStreams: z.number().int(),
        pendingStreams: z.number().int(),
        recentFailedRuns: z.number().int(),
        recent429s: z.number().int(),
        recent5xxs: z.number().int(),
    }),
    pages: z.array(syncHealthPageSchema),
});
// Bounded so a failed attempt cannot persist megabyte-sized usernames into
// the append-only audit_events table (audit P-3).
export const loginBodySchema = z.object({
    username: z.string().min(1).max(254),
    password: z.string().min(1).max(1024),
});
export const paginationQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
});
export const pageParamsSchema = z.object({
    pageLabel: z.string().min(1),
});
export const pageSpenderAutoListParamsSchema = pageParamsSchema.extend({
    bucketKey: pageSpenderAutoListBucketKeyEnum,
});
export const modelParamsSchema = z.object({
    modelSlug: z.string().min(1),
});
export const fanLookupParamsSchema = z.object({
    platform: platformEnum,
    platformUserId: z.string().min(1),
});
export const pageFanParamsSchema = pageParamsSchema.extend({
    platformUserId: z.string().min(1),
});
export const fanProfileVersionParamsSchema = pageFanParamsSchema.extend({
    version: z.coerce.number().int().min(1),
});
export const pageConversationProfileParamsSchema = pageParamsSchema.extend({
    conversationId: z.string().min(1),
});
const standardRevenueQuerySchema = z.object({
    period: nonCustomPeriodEnum,
    from: businessDate.optional(),
    to: businessDate.optional(),
});
const customRevenueQuerySchema = z.object({
    period: z.literal("custom"),
    from: businessDate,
    to: businessDate,
}).refine((value) => value.from <= value.to, {
    message: "`from` must be on or before `to`",
    path: ["to"],
});
export const revenueQuerySchema = z.union([
    standardRevenueQuerySchema,
    customRevenueQuerySchema,
]);
export const transactionListQuerySchema = paginationQuerySchema.extend({
    type: transactionTypeEnum.optional(),
    state: transactionStateEnum.optional(),
});
export const fanListQuerySchema = paginationQuerySchema.extend({
    query: z.string().min(1).optional(),
});
export const subscriberListQuerySchema = paginationQuerySchema.extend({
    query: z.string().min(1).optional(),
    expiringWithinDays: z.coerce.number().int().min(1).max(90).optional(),
    startedWithinHours: z.coerce.number().int().min(1).max(24 * 30).optional(),
    autoRenew: queryBooleanSchema.optional(),
});
export const followerListQuerySchema = paginationQuerySchema.extend({
    query: z.string().min(1).optional(),
    followedWithinHours: z.coerce.number().int().min(1).max(24 * 30).optional(),
    subscriber: queryBooleanSchema.optional(),
    dmStatus: z.enum(["none", "has_dm"]).optional(),
    activeWithinMinutes: z.coerce.number().int().min(1).max(24 * 60).optional(),
});
// Zod 4's `.merge()` (and `.pick()`/`.omit()`/`.partial()`) rebuilds the object
// from raw shapes and silently drops `superRefine` checks (audit B5). The
// spender cross-field rules therefore live in plain helpers that return issue
// lists, the base field schemas stay refinement-free, and every composed schema
// applies the relevant rules in a single `.superRefine()` as its final step.
const spenderScopeFieldsSchema = z.object({
    scope: spenderScopeKindEnum,
    pageLabel: z.string().min(1).optional(),
    modelSlug: z.string().min(1).optional(),
    platform: platformEnum.optional(),
});
const spenderPeriodFieldsSchema = z.object({
    period: spenderPeriodEnum,
    from: businessDate.optional(),
    to: businessDate.optional(),
});
const spenderOptionalPeriodFieldsSchema = z.object({
    period: spenderPeriodEnum.optional(),
    from: businessDate.optional(),
    to: businessDate.optional(),
});
function spenderScopeIssues(value) {
    const issues = [];
    if (value.scope === "page" && !value.pageLabel) {
        issues.push({ path: ["pageLabel"], message: "`pageLabel` is required for page scope" });
    }
    if (value.scope === "model") {
        if (!value.modelSlug) {
            issues.push({ path: ["modelSlug"], message: "`modelSlug` is required for model scope" });
        }
        if (!value.platform) {
            issues.push({ path: ["platform"], message: "`platform` is required for model scope" });
        }
    }
    if (value.scope === "agency" && !value.platform) {
        issues.push({ path: ["platform"], message: "`platform` is required for agency scope" });
    }
    return issues;
}
function spenderPeriodIssues(value) {
    const issues = [];
    if (value.period === "custom") {
        if (!value.from) {
            issues.push({ path: ["from"], message: "`from` is required when `period=custom`" });
        }
        if (!value.to) {
            issues.push({ path: ["to"], message: "`to` is required when `period=custom`" });
        }
        if (value.from && value.to && value.from > value.to) {
            issues.push({ path: ["to"], message: "`from` must be on or before `to`" });
        }
    }
    if (value.period !== "custom" && (value.from || value.to)) {
        issues.push({
            path: ["period"],
            message: "`from` and `to` are only supported when `period=custom`",
        });
    }
    return issues;
}
function addSpenderIssues(issues, context) {
    for (const issue of issues) {
        context.addIssue({ code: z.ZodIssueCode.custom, ...issue });
    }
}
export const spenderListQuerySchema = spenderScopeFieldsSchema
    .extend(spenderPeriodFieldsSchema.shape)
    .extend(paginationQuerySchema.shape)
    .extend({
    query: z.string().min(1).optional(),
    sortBy: spenderSortByEnum.optional(),
    sortDir: sortDirEnum.optional(),
    retentionStatus: spenderRetentionStatusEnum.optional(),
})
    .superRefine((value, context) => {
    addSpenderIssues([...spenderScopeIssues(value), ...spenderPeriodIssues(value)], context);
});
export const spenderDetailQuerySchema = spenderScopeFieldsSchema
    .extend(spenderPeriodFieldsSchema.shape)
    .superRefine((value, context) => {
    addSpenderIssues([...spenderScopeIssues(value), ...spenderPeriodIssues(value)], context);
});
export const spenderSeriesQuerySchema = spenderScopeFieldsSchema
    .extend(spenderPeriodFieldsSchema.shape)
    .extend({
    granularity: spenderSeriesGranularityEnum.default("auto"),
})
    .superRefine((value, context) => {
    addSpenderIssues([...spenderScopeIssues(value), ...spenderPeriodIssues(value)], context);
});
export const spenderBatchBodySchema = spenderScopeFieldsSchema
    .extend(spenderOptionalPeriodFieldsSchema.shape)
    .extend({
    fans: z.array(fanLookupParamsSchema).min(1).max(200),
})
    .superRefine((value, context) => {
    addSpenderIssues([...spenderScopeIssues(value), ...spenderPeriodIssues(value)], context);
});
export const pageSpenderAutoListsQuerySchema = spenderOptionalPeriodFieldsSchema
    .superRefine((value, context) => {
    addSpenderIssues(spenderPeriodIssues(value), context);
});
export const pageSpenderAutoListQuerySchema = fanListQuerySchema
    .extend(spenderOptionalPeriodFieldsSchema.shape)
    .extend({
    excludeNonFollowers: queryBooleanSchema.optional(),
})
    .superRefine((value, context) => {
    addSpenderIssues(spenderPeriodIssues(value), context);
});
export const fansSearchQuerySchema = spenderScopeFieldsSchema
    .extend(paginationQuerySchema.shape)
    .extend({
    query: z.string().min(1).optional(),
    q: z.string().min(1).optional(),
})
    .superRefine((value, context) => {
    addSpenderIssues(spenderScopeIssues(value), context);
    if (!value.query && !value.q) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["query"],
            message: "`query` is required",
        });
    }
});
export const pageConversationPreviewParamsSchema = pageParamsSchema.extend({
    platformConversationId: z.string().min(1),
});
export const pageConversationPreviewQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(25).default(10),
});
export const pageConversationMessagesParamsSchema = pageParamsSchema.extend({
    conversationId: z.string().min(1),
});
export const pageConversationMessagesQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).default(25),
});
const pageMetricSchema = z.object({
    value: z.number().int().nullable(),
    available: z.boolean(),
});
const messageCoverageStatusSchema = z.enum(["pending_backfill", "partial_window", "complete"]);
const messageSyncEligibilitySchema = z.enum(["eligible", "excluded", "unresolved_identity"]);
export const assignedPageSchema = pageRefSchema.extend({
    username: z.string().nullable(),
    displayName: z.string().nullable(),
    followerCount: pageMetricSchema,
    subscriberCount: pageMetricSchema,
    lastLightSyncAt: isoTimestamp.nullable(),
    lastFollowerSyncAt: isoTimestamp.nullable(),
});
export const modelListItemSchema = z.object({
    id: intId,
    slug: z.string(),
    name: z.string(),
    pageCount: z.number().int(),
});
export const adminModelListItemSchema = modelListItemSchema.extend({
    sortOrder: z.number().int(),
});
const revenueSummarySchema = z.object({
    revenueMills: mills,
    adjustmentMills: mills,
    unclassifiedMills: mills,
    netEarningsMills: mills,
    totalNetMills: mills,
});
export const revenueBreakdownItemSchema = z.object({
    canonicalType: transactionTypeEnum,
    bucket: transactionReportingBucketEnum,
    netAmountMills: mills,
});
// Audit B2: OnlyFans trailing windows deliberately run one calendar day longer
// than other platforms (7d spans 8 days, 30d spans 31 — see
// ONLYFANS_REVENUE_TRAILING_PERIOD_OFFSETS in packages/shared/src/time.ts), so
// mixed-platform totals and their comparisons combine different per-platform
// widths. These entries disclose the exact window each platform contributed;
// the top-level from/to stays the union.
export const platformRevenueWindowSchema = z.object({
    platform: platformEnum,
    from: isoTimestamp.nullable(),
    to: isoTimestamp.nullable(),
    comparisonFrom: isoTimestamp.nullable(),
    comparisonTo: isoTimestamp.nullable(),
});
export const revenueComparisonSchema = z.object({
    from: isoTimestamp.describe("Comparison window start. For mixed-platform scopes, this is the earliest included platform-local start."),
    to: isoTimestamp.describe("Comparison window end. For mixed-platform scopes, this is the latest included platform-local end."),
    netEarningsMills: mills,
    totalNetMills: mills,
    deltaNetMills: mills,
    deltaPct: z.number().nullable(),
});
export const revenueWindowSchema = revenueSummarySchema.extend({
    period: periodEnum,
    from: isoTimestamp.nullable().describe("Window start. For mixed-platform scopes, this is the earliest included platform-local start."),
    to: isoTimestamp.nullable().describe("Window end. For mixed-platform scopes, this is the latest included platform-local end."),
    currency: z.literal("USD"),
    breakdown: z.array(revenueBreakdownItemSchema),
    comparison: revenueComparisonSchema.nullable(),
    platformWindows: z.array(platformRevenueWindowSchema).describe("Billing window each included platform contributed to this report (audit B2). Single-platform reports carry one entry; mixed-platform totals span every listed window."),
});
export const pageRevenueItemSchema = z.object({
    pageId: intId,
    pageLabel: z.string(),
    modelSlug: z.string(),
    modelName: z.string(),
    netEarningsMills: mills,
    totalNetMills: mills,
    // W7.2 (A33, decision #131): revenue rollups include tombstoned pages —
    // historical attribution is permanent. Optional (additive).
    status: z.enum(["active", "deleted"]).optional(),
});
export const modelRevenueItemSchema = z.object({
    modelId: intId,
    modelSlug: z.string(),
    modelName: z.string(),
    pageCount: z.number().int(),
    netEarningsMills: mills,
    totalNetMills: mills,
    // W7.2 (A33): 'retired' = every page of the model is tombstoned.
    status: z.enum(["active", "retired"]).optional(),
});
export const overviewRevenueResponseSchema = revenueWindowSchema.extend({
    models: z.array(modelRevenueItemSchema),
    pages: z.array(pageRevenueItemSchema),
});
export const overviewGrowthResponseSchema = z.object({
    pages: z.array(z.object({
        pageId: intId,
        newFollowers: z.number().int(),
        newSubscribers: z.number().int(),
    })),
});
export const modelRevenueResponseSchema = revenueWindowSchema.extend({
    model: modelListItemSchema,
    pages: z.array(pageRevenueItemSchema),
});
export const pageRevenueResponseSchema = revenueWindowSchema.extend({
    page: assignedPageSchema,
});
export const transactionFanSchema = z.object({
    platformUserId: z.string(),
    username: z.string().nullable(),
    displayName: z.string().nullable(),
}).nullable();
const pageTransactionFanSchema = z.object({
    platformUserId: z.string(),
    pageAlias: z.string().nullable(),
    username: z.string().nullable(),
    displayName: z.string().nullable(),
}).nullable();
export const transactionItemSchema = z.object({
    transactionId: z.string(),
    rawType: z.union([z.number().int(), z.string()]),
    canonicalType: transactionTypeEnum,
    transactionState: transactionStateEnum,
    amountMills: mills,
    destinationAmountMills: mills,
    netAmountMills: mills,
    walletId: z.string().nullable(),
    correlationId: z.string().nullable(),
    correlationAccountId: z.string().nullable(),
    occurredAt: isoTimestamp,
    sourceUpdatedAt: isoTimestamp.nullable(),
    fan: pageTransactionFanSchema,
});
export const transactionListResponseSchema = z.object({
    page: assignedPageSchema,
    items: z.array(transactionItemSchema),
    limit: z.number().int(),
    offset: z.number().int(),
    total: z.number().int(),
});
export const subscriberItemSchema = z.object({
    platformSubscriptionId: z.string(),
    platformUserId: z.string(),
    pageAlias: z.string().nullable(),
    username: z.string().nullable(),
    displayName: z.string().nullable(),
    endsAt: isoTimestamp.nullable(),
    autoRenew: z.boolean().nullable(),
    autoRenewOffDetectedAt: isoTimestamp.nullable(),
    subscriptionTierName: z.string().nullable(),
    startedAt: isoTimestamp.nullable(),
    totalSpentCents: z.number().int(),
    lastTransactionAt: isoTimestamp.nullable(),
});
export const subscriberDailyItemSchema = z.object({
    businessDate: businessDate,
    newSubscribers: z.number().int(),
    activeSubscribers: z.number().int(),
});
export const subscriberListResponseSchema = z.object({
    page: assignedPageSchema,
    items: z.array(subscriberItemSchema),
    limit: z.number().int(),
    offset: z.number().int(),
    total: z.number().int(),
});
export const subscriberDailyResponseSchema = z.object({
    page: assignedPageSchema,
    items: z.array(subscriberDailyItemSchema),
});
export const followerItemSchema = z.object({
    platformUserId: z.string(),
    pageAlias: z.string().nullable(),
    username: z.string().nullable(),
    displayName: z.string().nullable(),
    followedAt: isoTimestamp,
    isSubscriber: z.boolean(),
    subscriberSince: isoTimestamp.nullable(),
    subscriptionExpiresAt: isoTimestamp.nullable(),
    autoRenew: z.boolean().nullable(),
    autoRenewOffDetectedAt: isoTimestamp.nullable(),
    totalSpentCents: z.number().int(),
    lastTransactionAt: isoTimestamp.nullable(),
    dm: z.object({
        hasConversation: z.boolean(),
        platformConversationId: z.string().nullable(),
        unreadCount: z.number().int(),
        lastMessageAt: isoTimestamp.nullable(),
        lastFanMessageAt: isoTimestamp.nullable(),
        lastModelMessageAt: isoTimestamp.nullable(),
        lastMessagePreview: z.string().nullable(),
    }),
    presence: z.object({
        status: z.enum(["active_now", "recently_active", "offline"]),
        lastSeenAt: isoTimestamp.nullable(),
        observedAt: isoTimestamp.nullable(),
    }),
});
export const followerDailyItemSchema = z.object({
    businessDate: businessDate,
    newFollowers: z.number().int(),
    knownTotalFollowers: z.number().int().nullable(),
});
export const followerListResponseSchema = z.object({
    page: assignedPageSchema,
    items: z.array(followerItemSchema),
    limit: z.number().int(),
    offset: z.number().int(),
    total: z.number().int(),
});
export const followerDailyResponseSchema = z.object({
    page: assignedPageSchema,
    items: z.array(followerDailyItemSchema),
});
export const fanListItemSchema = z.object({
    platformUserId: z.string(),
    pageAlias: z.string().nullable(),
    username: z.string().nullable(),
    displayName: z.string().nullable(),
    totalCreatorNetMills: mills,
    currency: z.literal("USD"),
    isFollower: z.boolean(),
    followerSince: isoTimestamp.nullable(),
    isSubscriber: z.boolean(),
    subscriberSince: isoTimestamp.nullable(),
    subscriptionExpiresAt: isoTimestamp.nullable(),
    autoRenew: z.boolean().nullable(),
    autoRenewOffDetectedAt: isoTimestamp.nullable(),
    lastTransactionAt: isoTimestamp.nullable(),
});
export const fanListResponseSchema = z.object({
    page: assignedPageSchema,
    items: z.array(fanListItemSchema),
    limit: z.number().int(),
    offset: z.number().int(),
    total: z.number().int(),
});
const deletedFanItemSchema = z.object({
    platformUserId: z.string(),
    latestKnownLabel: z.string().nullable(),
    pageAlias: z.string().nullable(),
    username: z.string().nullable(),
    displayName: z.string().nullable(),
    latestHistoricalPageAlias: z.string().nullable(),
    latestHistoricalUsername: z.string().nullable(),
    deletedDetectedAt: isoTimestamp,
    deletedLastDetectedAt: isoTimestamp.nullable(),
    lastSeenAt: isoTimestamp,
});
export const pageDeletedFansResponseSchema = z.object({
    page: assignedPageSchema,
    items: z.array(deletedFanItemSchema),
    limit: z.number().int(),
    offset: z.number().int(),
    total: z.number().int(),
});
const fanBaseSchema = z.object({
    platform: platformEnum,
    platformUserId: z.string(),
    username: z.string().nullable(),
    displayName: z.string().nullable(),
    createdAtExternal: isoTimestamp.nullable(),
});
const pageScopedFanBaseSchema = fanBaseSchema.extend({
    pageAlias: z.string().nullable(),
});
const fanNoteSchema = z.object({
    id: intId,
    authorUserId: intId.nullable(),
    body: z.string(),
    createdAt: isoTimestamp,
});
const fanSummarySchema = z.object({
    id: intId,
    authorUserId: intId.nullable(),
    body: z.string(),
    createdAt: isoTimestamp,
});
const fanFlagSchema = z.object({
    flag: fanFlagEnum,
    createdAt: isoTimestamp,
    createdByUserId: intId.nullable(),
});
const fanPageContextSchema = z.object({
    pageId: intId,
    pageLabel: z.string(),
    modelSlug: z.string(),
    modelName: z.string(),
    totalCreatorNetMills: mills,
    currency: z.literal("USD"),
    isFollower: z.boolean(),
    followerSince: isoTimestamp.nullable(),
    isSubscriber: z.boolean(),
    subscriberSince: isoTimestamp.nullable(),
    subscriptionExpiresAt: isoTimestamp.nullable(),
    autoRenew: z.boolean().nullable(),
    autoRenewOffDetectedAt: isoTimestamp.nullable(),
    lastTransactionAt: isoTimestamp.nullable(),
    notes: z.array(fanNoteSchema),
    summaries: z.array(fanSummarySchema),
});
export const pageFanDetailResponseSchema = z.object({
    fan: pageScopedFanBaseSchema,
    platformTotalSpendMills: mills,
    page: fanPageContextSchema,
    flags: z.array(fanFlagSchema),
});
export const crossPageFanDetailResponseSchema = z.object({
    fan: fanBaseSchema,
    platformTotalSpendMills: mills,
    pages: z.array(fanPageContextSchema),
    flags: z.array(fanFlagSchema),
});
const spenderFanSchema = fanBaseSchema.extend({
    pageAlias: z.string().nullable(),
});
const spenderPeriodMetadataSchema = z.object({
    timeZone: z.string(),
    fromBusinessDate: businessDate.nullable(),
    toBusinessDateInclusive: businessDate.nullable(),
    asOf: isoTimestamp.nullable(),
});
const spenderWindowMetricsSchema = z.object({
    grossAmountMills: mills,
    creatorNetAmountMills: mills,
    postedGrossAmountMills: mills,
    pendingGrossAmountMills: mills,
    unknownGrossAmountMills: mills,
    postedCreatorNetAmountMills: mills,
    pendingCreatorNetAmountMills: mills,
    unknownCreatorNetAmountMills: mills,
    transactionCount: z.number().int(),
    lastTransactionAt: isoTimestamp.nullable(),
});
const spenderLifetimeMetricsSchema = z.object({
    scopeGrossAmountMills: mills,
    scopeCreatorNetAmountMills: mills,
    platformGrossAmountMills: mills,
    platformCreatorNetAmountMills: mills,
});
const spenderComparisonSchema = z.object({
    previousGrossAmountMills: mills,
    previousCreatorNetAmountMills: mills,
    deltaGrossAmountMills: mills,
    deltaCreatorNetAmountMills: mills,
    deltaPct: z.number().nullable(),
});
const spenderMetricsSchema = z.object({
    window: spenderWindowMetricsSchema.nullable(),
    lifetime: spenderLifetimeMetricsSchema,
    comparison: spenderComparisonSchema.nullable(),
});
const spenderScopeModelSchema = z.object({
    slug: z.string(),
    name: z.string(),
});
const spenderScopeResponseSchema = z.object({
    kind: spenderScopeKindEnum,
    platform: platformEnum,
    pageCount: z.number().int(),
    page: pageRefSchema.nullable(),
    model: spenderScopeModelSchema.nullable(),
});
const spenderDiagnosticsSchema = z.object({
    totalGrossAmountMills: mills,
    totalCreatorNetAmountMills: mills,
    attributedGrossAmountMills: mills,
    attributedCreatorNetAmountMills: mills,
    unattributedGrossAmountMills: mills,
    unattributedCreatorNetAmountMills: mills,
});
const spenderConversationSchema = z.object({
    platformConversationId: z.string().nullable(),
    unreadCount: z.number().int(),
    lastMessageAt: isoTimestamp.nullable(),
    lastFanMessageAt: isoTimestamp.nullable(),
    lastModelMessageAt: isoTimestamp.nullable(),
    lastMessagePreview: z.string().nullable(),
    storedMessageCount: z.number().int(),
    messageCoverageStatus: messageCoverageStatusSchema,
    messageBackfillComplete: z.boolean(),
});
const spenderLastTransactionSchema = z.object({
    canonicalType: transactionTypeEnum,
    transactionState: transactionStateEnum,
    grossAmountMills: mills,
    creatorNetAmountMills: mills,
    occurredAt: isoTimestamp,
}).nullable();
const spenderListItemSchema = z.object({
    fan: spenderFanSchema,
    metrics: spenderMetricsSchema,
    lifetimeLastTransactionAt: isoTimestamp.nullable(),
    lastFanMessageAt: isoTimestamp.nullable(),
    conversation: spenderConversationSchema,
    lastTransaction: spenderLastTransactionSchema,
    retentionStatus: spenderRetentionStatusEnum.exclude(["all"]),
});
export const spenderListResponseSchema = z.object({
    scope: spenderScopeResponseSchema,
    period: spenderPeriodMetadataSchema,
    diagnostics: spenderDiagnosticsSchema,
    items: z.array(spenderListItemSchema),
    limit: z.number().int(),
    offset: z.number().int(),
    total: z.number().int(),
});
const pageSpenderAutoListItemSchema = z.object({
    key: z.string(),
    label: z.string(),
    minAmountMills: mills.nonnegative(),
    maxAmountMillsExclusive: mills.positive().nullable(),
    entryCount: z.number().int().nonnegative(),
});
export const pageSpenderAutoListsResponseSchema = z.object({
    page: pageRefSchema,
    currency: z.literal("USD"),
    metric: z.enum(["grossAmountMills", "lifetimeGrossAmountMills"]),
    period: spenderPeriodMetadataSchema,
    asOf: isoTimestamp.nullable(),
    totalEntries: z.number().int().nonnegative(),
    lists: z.array(pageSpenderAutoListItemSchema),
});
const pageSpenderAutoListFanSchema = z.object({
    fan: spenderFanSchema,
    isFollower: z.boolean(),
    isSubscriber: z.boolean(),
    subscriptionStatus: z.enum(["active", "expired", "never"]),
    subscriptionExpiresAt: isoTimestamp.nullable(),
    lastSubscriptionEndedAt: isoTimestamp.nullable(),
    grossAmountMills: mills,
    creatorNetAmountMills: mills,
    lifetimeGrossAmountMills: mills,
    lifetimeCreatorNetAmountMills: mills,
    lastTransactionAt: isoTimestamp.nullable(),
});
export const pageSpenderAutoListDetailResponseSchema = z.object({
    page: pageRefSchema,
    currency: z.literal("USD"),
    metric: z.enum(["grossAmountMills", "lifetimeGrossAmountMills"]),
    period: spenderPeriodMetadataSchema,
    bucket: pageSpenderAutoListItemSchema,
    items: z.array(pageSpenderAutoListFanSchema),
    limit: z.number().int(),
    offset: z.number().int(),
    total: z.number().int(),
});
const spenderPageBreakdownSchema = z.object({
    pageId: intId,
    pageLabel: z.string(),
    modelSlug: z.string(),
    modelName: z.string(),
    inScope: z.boolean(),
    grossAmountMills: mills,
    creatorNetAmountMills: mills,
    lastTransactionAt: isoTimestamp.nullable(),
    isFollower: z.boolean(),
    followerSince: isoTimestamp.nullable(),
    isSubscriber: z.boolean(),
    subscriberSince: isoTimestamp.nullable(),
    subscriptionExpiresAt: isoTimestamp.nullable(),
    autoRenew: z.boolean().nullable(),
    autoRenewOffDetectedAt: isoTimestamp.nullable(),
});
const spenderTypeBreakdownItemSchema = z.object({
    canonicalType: transactionTypeEnum,
    grossAmountMills: mills,
    creatorNetAmountMills: mills,
    transactionCount: z.number().int(),
});
export const spenderDetailResponseSchema = z.object({
    scope: spenderScopeResponseSchema,
    fan: spenderFanSchema,
    period: spenderPeriodMetadataSchema,
    metrics: spenderMetricsSchema,
    typeBreakdown: z.array(spenderTypeBreakdownItemSchema),
    pages: z.array(spenderPageBreakdownSchema),
});
export const spenderSeriesBucketSchema = z.object({
    fromBusinessDate: businessDate,
    toBusinessDateInclusive: businessDate,
    metrics: spenderWindowMetricsSchema,
});
export const spenderSeriesResponseSchema = z.object({
    scope: spenderScopeResponseSchema,
    fan: spenderFanSchema,
    period: spenderPeriodMetadataSchema,
    granularity: spenderSeriesGranularityEnum.exclude(["auto"]),
    items: z.array(spenderSeriesBucketSchema),
});
const spenderSubscriptionSchema = z.object({
    status: z.enum(["active", "expired", "never"]),
    expiresAt: isoTimestamp.nullable(),
    autoRenew: z.boolean().nullable(),
    autoRenewOffDetectedAt: isoTimestamp.nullable(),
});
export const spenderBatchItemSchema = z.object({
    requestedFan: fanLookupParamsSchema,
    found: z.boolean(),
    fan: spenderFanSchema.nullable(),
    metrics: spenderMetricsSchema.nullable(),
    typeBreakdown: z.array(spenderTypeBreakdownItemSchema).nullable(),
    lifetimeLastTransactionAt: isoTimestamp.nullable(),
    subscription: spenderSubscriptionSchema.nullable(),
});
export const spenderBatchResponseSchema = z.object({
    scope: spenderScopeResponseSchema,
    period: spenderPeriodMetadataSchema,
    items: z.array(spenderBatchItemSchema),
});
const fanSearchPageMembershipSchema = z.object({
    pageId: intId,
    pageLabel: z.string(),
    modelSlug: z.string(),
    modelName: z.string(),
    isFollower: z.boolean(),
    followerSince: isoTimestamp.nullable(),
    isSubscriber: z.boolean(),
    subscriberSince: isoTimestamp.nullable(),
    subscriptionExpiresAt: isoTimestamp.nullable(),
    autoRenew: z.boolean().nullable(),
    autoRenewOffDetectedAt: isoTimestamp.nullable(),
});
export const fansSearchItemSchema = z.object({
    fan: spenderFanSchema,
    matchKind: fanSearchMatchKindEnum,
    matchedValue: z.string().nullable(),
    pages: z.array(fanSearchPageMembershipSchema),
});
export const fansSearchResponseSchema = z.object({
    scope: spenderScopeResponseSchema,
    items: z.array(fansSearchItemSchema),
    limit: z.number().int(),
    offset: z.number().int(),
    total: z.number().int(),
});
const pageConversationFanSchema = z.object({
    fanId: intId,
    platform: platformEnum,
    platformUserId: z.string(),
    pageAlias: z.string().nullable(),
    username: z.string().nullable(),
    displayName: z.string().nullable(),
});
const pageConversationStateSchema = z.object({
    platformConversationId: z.string(),
    storedMessageCount: z.number().int(),
    messageCoverageStatus: messageCoverageStatusSchema,
    messageBackfillComplete: z.boolean(),
    messageSyncEligibility: messageSyncEligibilitySchema,
    messageSyncExcludedReason: z.string().nullable(),
    lastMessageSyncAt: isoTimestamp.nullable(),
    unreadCount: z.number().int(),
    lastMessageAt: isoTimestamp.nullable(),
});
const pageConversationPreviewMessageSchema = z.object({
    platformMessageId: z.string(),
    senderPlatformUserId: z.string().nullable(),
    senderRole: z.enum(["fan", "model", "system", "unknown"]),
    createdAt: isoTimestamp,
    content: z.string(),
    totalTipAmountCents: z.number().int(),
});
export const pageConversationPreviewResponseSchema = z.object({
    page: assignedPageSchema,
    fan: pageConversationFanSchema.nullable(),
    conversation: pageConversationStateSchema,
    messageSyncUx: syncUxSummarySchema,
    messages: z.array(pageConversationPreviewMessageSchema),
});
// --- Workboard v2 schemas ---
const workboardV2TabEnum = z.enum(["subscribers", "spenders", "fresh_mass", "old_mass", "service"]);
const workboardV2SecondaryStatusEnum = z.enum([
    "recent_purchase",
    "need_reply",
    "due_now",
    "later",
    "dont_touch_today",
]);
export const workboardV2QuerySchema = z.object({
    tab: workboardV2TabEnum,
    status: z
        .string()
        .optional()
        .transform((value) => (value ? value.split(",").map((s) => s.trim()).filter(Boolean) : undefined)),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
});
export const workboardV2ItemSchema = z.object({
    fanId: intId,
    fan: z.object({
        platformUserId: z.string().nullable(),
        pageAlias: z.string().nullable(),
        username: z.string().nullable(),
        displayName: z.string().nullable(),
    }),
    tab: workboardV2TabEnum,
    massSubstate: z.enum(["fresh", "gray", "active", "dead", "archived"]).nullable(),
    value: z.object({
        score: z.number(),
        tier: z.enum(["whale", "vip", "payer", "new"]),
        confidence: z.enum(["high", "low"]),
    }),
    urgency: z.object({
        score: z.number(),
        severity: z.enum(["critical", "high", "medium", "normal", "muted"]),
    }),
    rankScore: z.number(),
    secondaryStatus: workboardV2SecondaryStatusEnum,
    needsReply: z.boolean(),
    needsHumanTriage: z.boolean(),
    isPurchaseFollowup: z.boolean(),
    whyNow: z.object({ code: z.string().nullable(), value: z.number().nullable() }),
    reasonChips: z.array(z.string()),
    quality: z.object({
        qScore: z.number().nullable(),
        qConfidence: z.enum(["high", "medium", "low"]),
    }),
    closingVerdict: z
        .object({
        layer: z.enum(["l1", "l2", "fresh", "unverified", "model_last", "unknown"]),
        needsReply: z.boolean(),
        state: z
            .enum(["question", "buy_signal", "smalltalk", "closing", "cold", "complaint"])
            .nullable(),
        reason: z.string().nullable(),
    })
        .nullable(),
    online: z.boolean(),
    ltv: z.object({ creatorNetAmountMills: mills }),
    subscription: z.object({
        expiresAt: isoTimestamp.nullable(),
        autoRenew: z.boolean().nullable(),
    }),
    conversation: z.object({
        lastFanMessageAt: isoTimestamp.nullable(),
        lastModelMessageAt: isoTimestamp.nullable(),
        preview: z.string().nullable(),
        coverageStatus: z.enum(["pending_backfill", "partial_window", "complete"]),
        platformConversationId: z.string().nullable(),
    }),
    serviceReason: z.string().nullable(),
});
export const workboardV2CountSchema = z.object({
    tab: workboardV2TabEnum,
    secondaryStatus: workboardV2SecondaryStatusEnum,
    count: z.number().int(),
});
export const workboardV2OldMassBudgetSchema = z.object({
    used: z.number().int(),
    total: z.number().int(),
    resetsAt: isoTimestamp,
});
export const workboardClaimLeaseSchema = z.object({
    fanId: intId,
    claimedByUserId: intId,
    claimedByUsername: z.string(),
    expiresAt: isoTimestamp,
});
export const workboardV2ResponseSchema = z.object({
    tab: workboardV2TabEnum,
    total: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int(),
    items: z.array(workboardV2ItemSchema),
    // Stage 23: live claim leases — coordination, not access control.
    claims: z.array(workboardClaimLeaseSchema),
    counts: z.array(workboardV2CountSchema),
    oldMassBudget: workboardV2OldMassBudgetSchema.nullable(),
    aiCoverage: z.object({
        enabled: z.boolean(),
        classified: z.number().int(),
        closingsFound: z.number().int(),
        callsToday: z.number().int(),
        spenderTotal: z.number().int(),
        spenderDiagnosed: z.number().int(),
        spenderPending: z.number().int(),
    }),
});
export const workboardV2ListsBandSchema = z.object({
    key: z.string(),
    label: z.string(),
    count: z.number().int(),
    items: z.array(workboardV2ItemSchema),
});
export const workboardV2ListsResponseSchema = z.object({
    bands: z.array(workboardV2ListsBandSchema),
    total: z.number().int(),
    truncated: z.boolean(),
});
export const workboardV2ContactBodySchema = z.object({
    fanId: intId,
    action: z.enum(["opened", "handled", "snoozed"]).default("handled"),
    wasProductive: z.boolean().default(true),
});
export const workboardV2ContactResponseSchema = z.object({
    ok: z.literal(true),
    fanId: intId,
});
export const workboardV2RecomputeResponseSchema = z.object({
    ok: z.literal(true),
    evaluated: z.number().int(),
});
export const workboardV2SnoozeBodySchema = z.object({
    fanId: intId,
    days: z.number().int().min(1).max(120),
});
export const workboardV2SnoozeResponseSchema = z.object({
    ok: z.literal(true),
    fanId: intId,
    snoozedUntil: isoTimestamp.nullable(),
});
export const workboardV2FanParamsSchema = pageParamsSchema.extend({
    fanId: z.coerce.number().int().positive(),
});
export const workboardV2OkResponseSchema = z.object({
    ok: z.literal(true),
    fanId: intId,
});
// ── Workboard v2 AI analytics (L2 closing classifier) panel ───────────────────
const workboardV2ConversationStateEnum = z.enum([
    "question",
    "buy_signal",
    "smalltalk",
    "closing",
    "cold",
    "complaint",
]);
const aiSettingsSourceSchema = z.enum(["override", "env"]);
export const workboardV2AiSettingsSchema = z.object({
    enabled: z.boolean(),
    hasApiKey: z.boolean(),
    model: z.string(),
    dailyCapMin: z.number().int(),
    dailyCapMax: z.number().int(),
    envEnabled: z.boolean(),
    source: z.object({
        enabled: aiSettingsSourceSchema,
        dailyCapMax: aiSettingsSourceSchema,
        model: aiSettingsSourceSchema,
    }),
    override: z.object({
        enabled: z.boolean().nullable(),
        dailyCapMax: z.number().int().nullable(),
        model: z.string().nullable(),
    }),
});
const aiUsageBucketSchema = z.object({
    calls: z.number().int(),
    inputTokens: z.number().int(),
    outputTokens: z.number().int(),
    costUsd: z.number(),
});
export const workboardV2AiReportSchema = z.object({
    settings: workboardV2AiSettingsSchema,
    usage: z.object({
        today: aiUsageBucketSchema,
        last30d: aiUsageBucketSchema,
        daily: z.array(aiUsageBucketSchema.extend({ date: z.string() })),
    }),
    coverage: z.object({
        tails: z.number().int(),
        classified: z.number().int(),
        closings: z.number().int(),
        pending: z.number().int(),
        spenders: z.number().int(),
        spenderDiagnosed: z.number().int(),
        spenderPending: z.number().int(),
        spenderL2Classified: z.number().int(),
        spenderClosings: z.number().int(),
        spenderNoVisibleDialog: z.number().int(),
        spenderModelLast: z.number().int(),
        spenderFanLast: z.number().int(),
        spenderUnknownLast: z.number().int(),
    }),
    states: z.array(z.object({ state: z.string(), count: z.number().int() })),
    recent: z.array(z.object({
        messageId: z.string(),
        tail: z.string(),
        state: workboardV2ConversationStateEnum.nullable(),
        needsReply: z.boolean(),
        reason: z.string().nullable(),
        model: z.string().nullable(),
        classifiedAt: isoTimestamp,
    })),
});
export const workboardV2AiSettingsBodySchema = z.object({
    enabled: z.boolean().nullable(),
    dailyCapMax: z.number().int().min(1).max(5000).nullable(),
    model: z.string().trim().min(1).max(120).nullable(),
});
export const workboardV2AiClassifyBodySchema = z.object({
    reclassify: z.boolean().default(false),
});
export const workboardV2AiClassifyResponseSchema = z.object({
    ok: z.literal(true),
    // The run is async: it returns immediately with a 'running' run-log row id; the
    // dashboard polls the run log for completion. alreadyRunning = a run was in flight.
    runId: z.number().int(),
    status: z.string(),
    alreadyRunning: z.boolean(),
});
export const workboardV2AiRunSchema = z.object({
    id: z.number().int(),
    pageLabel: z.string().nullable(),
    trigger: z.enum(["cron", "manual", "reclassify"]),
    model: z.string().nullable(),
    classified: z.number().int(),
    calls: z.number().int(),
    inputTokens: z.number().int(),
    outputTokens: z.number().int(),
    deferred: z.number().int(),
    cleared: z.number().int(),
    costUsd: z.number(),
    status: z.string(),
    error: z.string().nullable(),
    createdAt: isoTimestamp,
});
export const workboardV2AiRunsResponseSchema = z.object({
    runs: z.array(workboardV2AiRunSchema),
});
export const pageConversationMessageItemSchema = z.object({
    messageId: z.string(),
    senderRole: z.enum(["fan", "model", "system", "unknown"]),
    content: z.string(),
    createdAt: isoTimestamp,
    tipAmountCents: z.number().int(),
});
export const pageConversationMessagesResponseSchema = z.object({
    page: assignedPageSchema,
    conversationId: z.string(),
    conversation: pageConversationStateSchema,
    messages: z.array(pageConversationMessageItemSchema),
});
const fanProfileSourceEnum = z.enum(["chatmuse"]);
export const fanProfileDocumentSchema = z.object({
    version: z.number().int().positive(),
    body: z.string(),
    source: fanProfileSourceEnum,
    createdAt: isoTimestamp,
    /** Scan generation time (#136); null for rows written before the field
     * existed. Optional so a newer SDK tolerates an older kernel. */
    sourceGeneratedAt: isoTimestamp.nullable().optional(),
    createdByUserId: intId.nullable(),
});
export const fanProfileResponseSchema = z.object({
    fan: pageScopedFanBaseSchema,
    profile: fanProfileDocumentSchema.nullable(),
});
export const fanProfileVersionListItemSchema = z.object({
    version: z.number().int().positive(),
    createdAt: isoTimestamp,
    isCurrent: z.boolean(),
});
export const fanProfileVersionListResponseSchema = z.object({
    items: z.array(fanProfileVersionListItemSchema),
});
// --- Phase 4: Dashboard schemas ---
const connectionStatusEnum = z.enum([
    "active", "stale", "error", "expired", "never_synced", "unverified",
]);
const syncTriggerScopeEnum = z.enum(["light", "followers", "all", "data", "messages"]);
const transactionSortByEnum = z.enum(["occurredAt", "grossAmountMills", "netAmountMills"]);
export const connectionItemSchema = z.object({
    id: intId,
    label: z.string(),
    platform: platformEnum,
    modelSlug: z.string(),
    modelName: z.string(),
    username: z.string().nullable(),
    displayName: z.string().nullable(),
    connectionStatus: connectionStatusEnum,
    lastLightSyncAt: isoTimestamp.nullable(),
    lastFollowerSyncAt: isoTimestamp.nullable(),
    lastSyncError: z.string().nullable(),
    subscriberCount: pageMetricSchema,
    followerCount: pageMetricSchema,
    proxyUrl: z.string().nullable(),
    proxyHasAuth: z.boolean(),
    syncUx: syncUxSummarySchema,
});
export const overviewResponseSchema = z.object({
    counts: z.object({
        models: z.number().int(),
        pages: z.number().int(),
        fans: z.number().int(),
    }),
    revenue: z.object({
        "7d": z.object({
            revenueMills: mills,
            adjustmentMills: mills,
            unclassifiedMills: mills,
            netEarningsMills: mills,
            previousNetEarningsMills: mills,
            deltaPct: z.number().nullable(),
        }),
        "30d": z.object({
            revenueMills: mills,
            adjustmentMills: mills,
            unclassifiedMills: mills,
            netEarningsMills: mills,
            previousNetEarningsMills: mills,
            deltaPct: z.number().nullable(),
        }),
    }),
    overall: z.object({
        syncUx: syncUxSummarySchema,
    }),
    pages: z.array(z.object({
        id: intId,
        label: z.string(),
        platform: platformEnum,
        modelSlug: z.string(),
        modelName: z.string(),
        username: z.string().nullable(),
        subscriberCount: pageMetricSchema,
        followerCount: pageMetricSchema,
        revenueTodayMills: mills,
        revenue7dMills: mills,
        revenue30dMills: mills,
        newSubscribersToday: z.number().int(),
        newFollowersToday: z.number().int(),
        connectionStatus: connectionStatusEnum,
        lastLightSyncAt: isoTimestamp.nullable(),
        lastFollowerSyncAt: isoTimestamp.nullable(),
        lastSyncError: z.string().nullable(),
        syncUx: syncUxSummarySchema,
    })),
    setup: z.object({
        hasPages: z.boolean(),
        hasFanslyPages: z.boolean(),
        hasOnlyFansPages: z.boolean(),
    }),
});
export const revenueDailyQuerySchema = z.object({
    period: periodEnum.default("30d"),
    from: businessDate.optional(),
    to: businessDate.optional(),
    groupByType: queryBooleanSchema.default(false),
});
export const revenueDailyItemSchema = z.object({
    businessDate: businessDate,
    netAmountMills: mills,
    transactionCount: z.number().int(),
});
export const revenueDailyTypedItemSchema = z.object({
    businessDate: businessDate,
    canonicalType: transactionTypeEnum,
    netAmountMills: mills,
    transactionCount: z.number().int(),
});
export const revenueDailyResponseSchema = z.object({
    series: z.array(revenueDailyItemSchema.extend({
        canonicalType: transactionTypeEnum.optional(),
    })),
});
// Per-model earnings + trends: every visible model's period total and daily
// series in one call (the dashboard's "By model" comparison view).
export const revenueByModelQuerySchema = z.object({
    period: periodEnum.default("30d"),
    from: businessDate.optional(),
    to: businessDate.optional(),
});
export const revenueByModelItemSchema = z.object({
    modelSlug: z.string(),
    modelName: z.string(),
    pageCount: z.number().int(),
    totalNetAmountMills: mills,
    transactionCount: z.number().int(),
    series: z.array(revenueDailyItemSchema),
});
export const revenueByModelResponseSchema = z.object({
    models: z.array(revenueByModelItemSchema),
});
export const crossPageTransactionItemSchema = z.object({
    transactionId: z.string(),
    rawType: z.union([z.number().int(), z.string()]),
    canonicalType: transactionTypeEnum,
    transactionState: transactionStateEnum,
    amountMills: mills,
    destinationAmountMills: mills,
    netAmountMills: mills,
    occurredAt: isoTimestamp,
    sourceUpdatedAt: isoTimestamp.nullable(),
    fan: transactionFanSchema,
    pageLabel: z.string(),
    platform: platformEnum,
});
export const crossPageTransactionListQuerySchema = paginationQuerySchema.extend({
    pageLabel: z.string().min(1).optional(),
    type: transactionTypeEnum.optional(),
    state: transactionStateEnum.optional(),
    sortBy: transactionSortByEnum.default("occurredAt"),
    sortDir: sortDirEnum.default("desc"),
});
export const crossPageTransactionListResponseSchema = z.object({
    items: z.array(crossPageTransactionItemSchema),
    limit: z.number().int(),
    offset: z.number().int(),
    total: z.number().int(),
});
export const fanTransactionItemSchema = z.object({
    transactionId: z.string(),
    rawType: z.union([z.number().int(), z.string()]),
    canonicalType: transactionTypeEnum,
    transactionState: transactionStateEnum,
    amountMills: mills,
    destinationAmountMills: mills,
    netAmountMills: mills,
    occurredAt: isoTimestamp,
    sourceUpdatedAt: isoTimestamp.nullable(),
});
export const fanTransactionListResponseSchema = z.object({
    items: z.array(fanTransactionItemSchema),
    limit: z.number().int(),
    offset: z.number().int(),
    total: z.number().int(),
});
export const crossPageFanTransactionItemSchema = fanTransactionItemSchema.extend({
    pageLabel: z.string(),
    platform: platformEnum,
});
export const crossPageFanTransactionListResponseSchema = z.object({
    items: z.array(crossPageFanTransactionItemSchema),
    limit: z.number().int(),
    offset: z.number().int(),
    total: z.number().int(),
});
export const upsertFanProfileBodySchema = z.object({
    body: z.string().min(1).max(50_000),
    /** Epoch ms of the client's Scan generation (#136): created_at is only the
     * hub APPEND time and must not stand in for the dossier's age when a
     * client re-pushes an old cached summary. Optional — legacy clients omit.
     * Bounded to 2100-01-01: int().positive() alone admits values past the
     * JS Date range (Invalid Date at insert) and absurd-future stamps that
     * would keep volatile dossier sections "fresh" forever. Small NEAR-future
     * clock skew is clamped server-side, not rejected here. */
    generatedAtMs: z.number().int().positive().max(4_102_444_800_000).optional(),
});
export const createFanNoteBodySchema = z.object({
    body: z.string().min(1).max(10000),
});
export const fanNoteResponseSchema = z.object({
    id: intId,
    fanId: z.number().int(),
    platformAccountId: z.number().int(),
    authorUserId: intId,
    body: z.string(),
    createdAt: isoTimestamp,
});
export const setFanFlagsBodySchema = z.object({
    flags: z.array(fanFlagEnum),
});
export const fanFlagsResponseSchema = z.object({
    flags: z.array(fanFlagSchema),
});
export const aiUsageEventInputSchema = z.object({
    clientEventId: z.string().min(1).max(255),
    feature: aiUsageFeatureEnum,
    model: z.string().min(1).max(100),
    inputTokens: z.number().int().nonnegative().max(100_000_000),
    outputTokens: z.number().int().nonnegative().max(100_000_000),
    cacheWriteTokens: z.number().int().nonnegative().max(100_000_000),
    cacheReadTokens: z.number().int().nonnegative().max(100_000_000),
    conversationId: z.string().min(1).max(255).nullable().optional(),
    durationMs: z.number().int().nonnegative().nullable().optional(),
    isCacheHit: z.boolean(),
    isRegeneration: z.boolean(),
    completedAt: z.string().min(1),
});
export const aiUsageBatchBodySchema = z.object({
    events: z.array(aiUsageEventInputSchema).min(1).max(100),
});
export const aiUsageBatchResponseSchema = z.object({
    receivedCount: z.number().int().nonnegative(),
    insertedCount: z.number().int().nonnegative(),
    // Events dropped for an unparseable or >5min-future completedAt; the rest of
    // the batch is still ingested instead of failing wholesale.
    invalidCount: z.number().int().nonnegative(),
    dedupedCount: z.number().int().nonnegative(),
});
// Stage 11: client-capture lane. The desktop uploads spool-backed batches of
// device-held facts; each event becomes one observation (source
// 'client_capture', dedup on <principal>:<clientEventId> via the Stage 7 key
// protocol). Unknown kinds are journaled, never dropped (capture-first).
export const ingestObservationEventSchema = z.object({
    clientEventId: z.string().uuid(),
    kind: z.string().min(1).max(120),
    observedAt: isoTimestamp,
    payload: z.record(z.string(), z.unknown()),
    pageLabel: z.string().min(1).max(120).optional(),
});
export const ingestObservationsBodySchema = z.object({
    events: z.array(ingestObservationEventSchema).min(1).max(100),
});
export const ingestObservationsResponseSchema = z.object({
    accepted: z.number().int().nonnegative(),
    // Already-journaled clientEventIds; the client may prune its spool on either.
    duplicates: z.number().int().nonnegative(),
});
export const aiGatewayPromptCacheTtlSchema = z.enum(["1h", "5m", "none"]);
export const aiGatewayReasoningEffortSchema = z.enum(["off", "low", "medium", "high", "max"]);
export const aiGatewayPromptBlockSchema = z.object({
    text: z.string().min(1).max(100_000),
    cache: aiGatewayPromptCacheTtlSchema,
}).strict();
// Feature-lane-only debug echo. Deliberately separate from the raw gateway
// prompt-block schema (100k): an assembled block is much larger than the wire
// values it carries. clientContext admits a 300k transcript, the builder places
// the WHOLE transcript in one dynamic block, and escapeForPrompt expands the
// worst case fivefold ("&" → "&amp;"). Bound = (transcript 300k + spending 20k
// + subscription 20k + draft 20k) × 5 + dossier 20k + template framing, rounded
// up. Echo contract only — never accepted in an AI request body.
export const AI_FEATURE_DEBUG_PROMPT_BLOCK_MAX_CHARS = 2_500_000;
export const aiFeatureDebugPromptBlockSchema = z.object({
    text: z.string().min(1).max(AI_FEATURE_DEBUG_PROMPT_BLOCK_MAX_CHARS),
    cache: aiGatewayPromptCacheTtlSchema,
}).strict();
export const aiFeatureDebugInputFrameSchema = z.object({
    type: z.literal("debug_input_v1"),
    systemBlocks: z.array(aiFeatureDebugPromptBlockSchema).min(1).max(64),
    userBlocks: z.array(aiFeatureDebugPromptBlockSchema).min(1).max(64),
    contextManifest: z.record(z.string(), z.unknown()).nullable(),
}).strict();
export const aiGatewayStreamBodySchema = z.object({
    clientRequestId: z.string().uuid(),
    feature: aiUsageFeatureEnum,
    pageLabel: z.string().min(1).max(120),
    platform: platformEnum,
    platformUserId: z.string().min(1).max(255),
    conversationId: z.string().min(1).max(255).nullable().optional(),
    model: z.string().min(1).max(100),
    reasoningEffort: aiGatewayReasoningEffortSchema,
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().max(100_000).optional(),
    isRegeneration: z.boolean(),
    prompt: z.object({
        systemBlocks: z.array(aiGatewayPromptBlockSchema).min(1).max(64),
        userBlocks: z.array(aiGatewayPromptBlockSchema).min(1).max(64),
    }).strict(),
}).strict();
export const aiGatewayUsageSchema = z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cacheWriteTokens: z.number().int().nonnegative(),
    cacheReadTokens: z.number().int().nonnegative(),
    costMicroUsd: z.number().int().nonnegative(),
    costApproximate: z.boolean(),
});
export const aiGatewayQuotaSchema = z.object({
    accepted: z.boolean(),
    remainingRequestsToday: z.number().int().nonnegative().nullable(),
    remainingMicroUsdToday: z.number().int().nonnegative().nullable(),
});
export const aiGatewayStreamFrameSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("meta"),
        requestId: z.string().uuid(),
        clientRequestId: z.string().uuid(),
        feature: aiUsageFeatureEnum,
        pageLabel: z.string(),
        model: z.string(),
        provider: z.enum(["anthropic", "openrouter"]),
        providerResponseId: z.string().nullable(),
        personaDefinitionId: z.string().min(16).max(100).optional(),
        quota: aiGatewayQuotaSchema,
    }).strict(),
    z.object({
        type: z.literal("content_delta"),
        text: z.string(),
    }).strict(),
    z.object({
        type: z.literal("reasoning_delta"),
        text: z.string(),
    }).strict(),
    z.object({
        type: z.literal("usage"),
        usage: aiGatewayUsageSchema,
        providerResponseId: z.string().nullable(),
        cacheHit: z.boolean(),
    }).strict(),
    z.object({
        type: z.literal("error"),
        code: z.string().min(1).max(100),
        message: z.string().min(1).max(500),
        retryAfterMs: z.number().int().nonnegative().nullable(),
    }).strict(),
    z.object({
        type: z.literal("done"),
        stopReason: z.string().nullable(),
    }).strict(),
]);
// Unknown frames remain fatal for the raw gateway. Only streamAiFeature uses
// this additive union, and the server emits debug_input_v1 only when the
// caller advertised the matching capability header.
export const aiFeatureStreamFrameSchema = z.union([
    aiGatewayStreamFrameSchema,
    aiFeatureDebugInputFrameSchema,
]);
// Stage 29 restricted capture class (DP 6-A): owner-only reads.
// Personas are global single-tenant owner content. Legacy full-text client
// routes remain during the read-only-client rollout; new clients consume only
// the metadata catalog and the owner dashboard uses the separate admin CRUD.
export const aiPersonaSchema = z.object({
    key: z.string().min(1).max(120),
    displayName: z.string().min(1).max(120),
    systemBlock: z.string().min(1).max(50_000),
    updatedAt: z.string(),
    version: z.number().int().positive(),
});
export const aiPersonasResponseSchema = z.object({
    personas: z.array(aiPersonaSchema),
});
export const aiPersonaUpsertParamsSchema = z.object({
    key: z.string().min(1).max(120),
});
export const aiPersonaUpsertBodySchema = z.object({
    displayName: z.string().min(1).max(120),
    systemBlock: z.string().min(1).max(50_000),
    // Omitted keeps shipped clients on their transitional last-write-wins lane.
    // null is create-only; a number is an optimistic active-revision update.
    expectedVersion: z.number().int().positive().nullable().optional(),
}).strict();
export const aiPersonaArchiveQuerySchema = z.object({
    // Query strings cannot carry null. Zero is the explicit create-only/absent
    // sentinel; positive values archive exactly that active revision.
    expectedVersion: z.coerce.number().int().nonnegative().optional(),
}).strict();
export const aiPersonaCatalogItemSchema = z.object({
    key: z.string().min(1).max(120),
    displayName: z.string().min(1).max(120),
    version: z.number().int().positive(),
    // Opaque identity of the exact definition bytes. Clients compare it but do
    // not parse it; it is independent of monotonic revision after DB restore.
    definitionId: z.string().min(16).max(100),
    status: z.enum(["active", "archived"]),
});
export const aiPersonaCatalogResponseSchema = z.object({
    personas: z.array(aiPersonaCatalogItemSchema),
});
const adminAiPersonaCreateKeySchema = z.string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[A-Za-z0-9][A-Za-z0-9:_-]*$/, "Use letters, numbers, colon, underscore, or hyphen");
// Existing rows may have been created through the shipped legacy API, whose
// key contract allowed any non-empty 120-character string. Admin path params
// must preserve that exact key so the owner can update/archive every row that
// appears in the admin list. The narrower policy applies only to new keys.
const adminAiPersonaExistingKeySchema = z.string().min(1).max(120);
const adminAiPersonaDisplayNameSchema = z.string().trim().min(1).max(120);
const adminAiPersonaSystemBlockSchema = z.string()
    .min(1)
    .max(50_000)
    .refine((value) => /\S/.test(value), "System prompt must contain non-whitespace text");
export const adminAiPersonaSchema = aiPersonaSchema.extend({
    status: z.enum(["active", "archived"]),
});
export const adminAiPersonasResponseSchema = z.object({
    personas: z.array(adminAiPersonaSchema),
});
export const adminAiPersonaCreateBodySchema = z.object({
    key: adminAiPersonaCreateKeySchema,
    displayName: adminAiPersonaDisplayNameSchema,
    systemBlock: adminAiPersonaSystemBlockSchema,
}).strict();
export const adminAiPersonaParamsSchema = z.object({
    key: adminAiPersonaExistingKeySchema,
});
export const adminAiPersonaUpdateBodySchema = z.object({
    displayName: adminAiPersonaDisplayNameSchema,
    systemBlock: adminAiPersonaSystemBlockSchema,
    expectedVersion: z.number().int().positive(),
}).strict();
export const adminAiPersonaArchiveQuerySchema = z.object({
    expectedVersion: z.coerce.number().int().positive(),
}).strict();
// Stage 30 feature services: kernel-side prompt assembly over the gateway.
export const aiFeatureStreamParamsSchema = z.object({
    feature: z.string().min(1).max(40),
});
export const aiFeatureStreamBodySchema = z.object({
    clientRequestId: z.string().uuid(),
    pageLabel: z.string().min(1).max(120),
    platform: platformEnum,
    conversationRef: z.string().min(1).max(255),
    fanRef: z.string().min(1).max(255).nullable().optional(),
    personaKey: z.string().min(1).max(120).nullable().optional(),
    expectedPersonaDefinitionId: z.string().min(16).max(100).optional(),
    model: z.string().min(1).max(100).optional(),
    reasoningEffort: aiGatewayReasoningEffortSchema.optional(),
    replyTone: z.enum(["none", "casual", "flirty", "upsell", "spicy"]).optional(),
    replyMode: z.enum(["default", "preferSplit"]).optional(),
    messageCount: z.number().int().min(5).max(3000).optional(),
    draftText: z.string().min(1).max(20_000).optional(),
    isRegeneration: z.boolean().optional(),
    // Stage 32: client-loaded context for platforms whose kernel archive is
    // pull-cadenced (Fansly: dm_conversations 30 min / dm_messages 24 h — no
    // webhook lane), where the client reads the conversation live at
    // generation time. Prompt ASSEMBLY stays kernel-side (templates, personas,
    // policies, platform wording); only the context VALUES ride in. The values
    // land verbatim in the assembled prompt and are captured under the
    // Stage 29 restricted class exactly like archive-loaded context.
    clientContext: z.object({
        transcript: z.string().min(1).max(300_000),
        messageCount: z.number().int().min(0).max(5000),
        fanDisplayName: z.string().max(200),
        fanSpendingData: z.string().max(20_000).default(""),
        fanSubscriptionData: z.string().max(20_000).default(""),
        fanBio: z.string().max(5_000).optional(),
        pingSegment: z.enum(["segment-a", "segment-b", "active"]).optional(),
    }).strict().optional(),
}).strict();
export const aiRestrictedGenerationSchema = z.object({
    generationRef: z.string(),
    feature: z.string(),
    model: z.string(),
    provider: z.string(),
    userId: z.number().nullable(),
    pageId: z.number().nullable(),
    conversationRef: z.string().nullable(),
    promptBlocks: z.array(z.unknown()),
    completion: z.string(),
    params: z.record(z.string(), z.unknown()),
    createdAt: z.string(),
});
export const aiRestrictedGenerationsQuerySchema = z.object({
    feature: z.string().optional(),
    pageId: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
});
export const aiRestrictedGenerationsResponseSchema = z.object({
    generations: z.array(aiRestrictedGenerationSchema),
});
export const aiRestrictedAcceptanceEventSchema = z.object({
    lifecycle: z.enum(["shown", "copied", "inserted", "edited", "sent"]),
    userId: z.number().nullable(),
    occurredAt: z.string(),
});
export const aiRestrictedGenerationParamsSchema = z.object({
    generationRef: z.string().min(1),
});
export const aiRestrictedGenerationDetailResponseSchema = z.object({
    generation: aiRestrictedGenerationSchema,
    acceptance: z.array(aiRestrictedAcceptanceEventSchema),
});
export const adminChatterUsageQuerySchema = z.object({
    from: businessDate.optional(),
    to: businessDate.optional(),
}).superRefine((value, ctx) => {
    const hasFrom = value.from !== undefined;
    const hasTo = value.to !== undefined;
    if (hasFrom !== hasTo) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "`from` and `to` must be provided together",
            path: [hasFrom ? "to" : "from"],
        });
    }
    if (value.from && value.to && value.from > value.to) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "`from` must be on or before `to`",
            path: ["to"],
        });
    }
});
export const aiUsageTokenCountsSchema = z.object({
    input: z.number().int().nonnegative(),
    output: z.number().int().nonnegative(),
    cacheWrite: z.number().int().nonnegative(),
    cacheRead: z.number().int().nonnegative(),
    cacheTotal: z.number().int().nonnegative(),
});
export const aiUsageTopFeatureSchema = z.object({
    feature: aiUsageFeatureEnum,
    requestCount: z.number().int().nonnegative(),
    sharePct: z.number().nonnegative(),
});
export const aiUsageFeatureBreakdownSchema = z.object({
    feature: aiUsageFeatureEnum,
    requestCount: z.number().int().nonnegative(),
    sharePct: z.number().nonnegative(),
    tokenCounts: aiUsageTokenCountsSchema,
    costMicroUsd: z.number().int().nonnegative(),
    costApproximate: z.boolean(),
    regenerateRatePct: z.number().nonnegative(),
});
export const aiUsageCostSummarySchema = z.object({
    microUsd: z.number().int().nonnegative(),
    approximate: z.boolean(),
});
export const aiUsageGatewaySummarySchema = z.object({
    requestCount: z.number().int().nonnegative(),
    completedCount: z.number().int().nonnegative(),
    failedCount: z.number().int().nonnegative(),
    cancelledCount: z.number().int().nonnegative(),
    quotaDeniedCount: z.number().int().nonnegative(),
    openReservationCount: z.number().int().nonnegative(),
    providerBreakdown: z.array(z.object({
        provider: z.enum(["anthropic", "openrouter"]),
        requestCount: z.number().int().nonnegative(),
        costMicroUsd: z.number().int().nonnegative(),
    })),
});
export const adminChatterUsageRowSchema = z.object({
    userId: intId,
    username: z.string(),
    totalGenerations: z.number().int().nonnegative(),
    tokenCounts: aiUsageTokenCountsSchema,
    cost: aiUsageCostSummarySchema,
    gateway: aiUsageGatewaySummarySchema,
    topFeature: aiUsageTopFeatureSchema.nullable(),
    featureBreakdown: z.array(aiUsageFeatureBreakdownSchema),
    regenerateRatePct: z.number().nonnegative(),
    warning: z.boolean(),
});
export const adminChatterUsageResponseSchema = z.object({
    range: z.object({
        from: businessDate,
        to: businessDate,
        timeZone: z.string().min(1),
    }),
    rows: z.array(adminChatterUsageRowSchema),
});
// Admin schemas
export const adminCreateUserBodySchema = z.object({
    username: z.string().min(1).max(100),
    role: creatableUserRoleEnum,
    password: z.string().min(8).max(256).optional(),
});
export const adminSetPasswordBodySchema = z.object({
    password: z.string().min(8).max(256),
    // Stage 22: force a change on the first session login (chatter invite flow v1).
    mustChangePassword: z.boolean().optional(),
});
export const adminAssignPageBodySchema = z.object({
    pageLabel: z.string().min(1),
});
export const adminIssueApiKeyBodySchema = z.object({
    pageLabel: z.string().min(1).optional(),
});
export const apiKeyItemSchema = z.object({
    id: intId,
    keyPrefix: z.string(),
    userId: z.number().int(),
    isActive: z.boolean(),
    revokedAt: isoTimestamp.nullable(),
    revokedReason: z.string().nullable(),
    createdAt: isoTimestamp,
    lastUsedAt: isoTimestamp.nullable(),
});
export const issuedApiKeyResponseSchema = z.object({
    key: z.string(),
    keyPrefix: z.string(),
    assignedPages: z.array(pageRefSchema),
});
export const syncRunItemSchema = z.object({
    runId: z.number().int(),
    platformAccountId: z.number().int(),
    pageLabel: z.string(),
    platform: platformEnum,
    stream: z.string(),
    trigger: z.string(),
    status: z.string(),
    startedAt: isoTimestamp,
    finishedAt: isoTimestamp.nullable(),
    errorSummary: z.string().nullable(),
    stats: z.record(z.string(), z.unknown()),
});
export const syncRunDetailResponseSchema = z.object({
    run: syncRunItemSchema,
    events: z.array(z.object({
        id: z.number().int(),
        runId: z.number().int(),
        platformAccountId: z.number().int(),
        pageLabel: z.string(),
        provider: platformEnum,
        stream: z.string(),
        eventType: z.string(),
        severity: z.string(),
        message: z.string(),
        details: z.record(z.string(), z.unknown()),
        emittedAt: isoTimestamp,
    })),
    attempts: z.array(z.object({
        attemptId: z.number().int(),
        runId: z.number().int(),
        platformAccountId: z.number().int(),
        pageLabel: z.string(),
        provider: platformEnum,
        stream: z.string(),
        operation: z.string(),
        logicalRequestId: z.string(),
        attemptNumber: z.number().int(),
        state: z.string(),
        failureKind: z.string().nullable(),
        httpStatus: z.number().int().nullable(),
        retryDelayMs: z.number().int().nullable(),
        durationMs: z.number().int().nullable(),
        requestShape: z.record(z.string(), z.unknown()),
        responseShape: z.record(z.string(), z.unknown()),
        errorMessage: z.string().nullable(),
        startedAt: isoTimestamp,
        finishedAt: isoTimestamp.nullable(),
    })),
});
const syncMonitorStatusEnum = z.enum([
    "idle",
    "pending",
    "running",
    "retrying",
    "blocked",
    "paused",
]);
const syncMonitorRateHealthEnum = z.enum(["healthy", "warning", "limited"]);
export const syncMonitorProgressSchema = z.object({
    label: z.string(),
    current: z.number().int(),
    total: z.number().int().nullable(),
    unit: z.string(),
    percent: z.number().nullable(),
});
export const syncMonitorRateHealthSchema = z.object({
    state: syncMonitorRateHealthEnum,
    last429At: isoTimestamp.nullable(),
    nextAvailableAt: isoTimestamp.nullable(),
});
export const syncMonitorRecentRunsSchema = z.object({
    running: z.number().int(),
    success: z.number().int(),
    partial: z.number().int(),
    failed: z.number().int(),
    skipped: z.number().int(),
});
export const syncMonitorRecentErrorsSchema = z.object({
    total429s: z.number().int(),
    total5xxs: z.number().int(),
    failedRuns: z.number().int(),
    failedAttempts: z.number().int(),
    retryAttempts: z.number().int(),
    last429At: isoTimestamp.nullable(),
    last5xxAt: isoTimestamp.nullable(),
});
export const syncMonitorLastCompletionSchema = z.object({
    runId: z.number().int(),
    trigger: z.string(),
    status: z.enum(["success", "partial", "failed", "skipped"]),
    startedAt: isoTimestamp,
    finishedAt: isoTimestamp,
    durationMs: z.number().int().nullable(),
    errorSummary: z.string().nullable(),
});
export const syncMonitorActiveRunSchema = z.object({
    runId: z.number().int(),
    trigger: z.string(),
    startedAt: isoTimestamp,
    lastActivityAt: isoTimestamp,
});
export const syncMonitorDeepBackfillSchema = z.object({
    pendingConversations: z.number().int(),
    pendingPagesEstimate: z.number().int(),
    spenderPendingConversations: z.number().int(),
    spenderPendingPagesEstimate: z.number().int(),
    regularPendingConversations: z.number().int(),
    regularPendingPagesEstimate: z.number().int(),
    recentRequests: z.number().int(),
    lastCompletedAt: isoTimestamp.nullable(),
    liveRequestsSinceDeepBackfill: z.number().int(),
    active: z.boolean(),
    stalled: z.boolean(),
    stallReason: z.string().nullable(),
});
const extendedSyncStreamEnum = z.enum([
    "light",
    "fan_identities",
    "followers",
    "transactions",
    "top_spenders",
    "subscribers",
    "dm_conversations",
    "dm_messages",
    "followers_reconcile",
    "fan_earnings",
    "purchase_history",
]);
export const syncMonitorStreamItemSchema = z.object({
    stream: extendedSyncStreamEnum,
    status: syncMonitorStatusEnum,
    stalled: z.boolean(),
    pending: z.boolean(),
    retryAt: isoTimestamp.nullable(),
    progress: syncMonitorProgressSchema.nullable(),
    deepBackfill: syncMonitorDeepBackfillSchema.nullable().optional(),
    recentRuns: syncMonitorRecentRunsSchema,
    recentErrors: syncMonitorRecentErrorsSchema,
    rateHealth: syncMonitorRateHealthSchema,
    activeRun: syncMonitorActiveRunSchema.nullable(),
    lastCompletion: syncMonitorLastCompletionSchema.nullable(),
    succeededAt: isoTimestamp.nullable(),
    failedAt: isoTimestamp.nullable(),
    lastErrorSummary: z.string().nullable(),
    consecutiveFailures: z.number().int(),
    syncUx: syncUxSummarySchema,
});
export const syncMonitorPageCountsSchema = z.object({
    fans: z.number().int(),
    followers: z.number().int(),
    subscribers: z.number().int(),
    transactions: z.number().int(),
    conversations: z.number().int(),
    messages: z.number().int(),
});
export const syncMonitorPageSummarySchema = z.object({
    runningStreams: z.number().int(),
    blockedStreams: z.number().int(),
    stalledStreams: z.number().int(),
    pendingStreams: z.number().int(),
    retryingStreams: z.number().int(),
});
export const syncMonitorPageItemSchema = z.object({
    pageId: z.number().int(),
    pageLabel: z.string(),
    platform: platformEnum,
    modelSlug: z.string(),
    modelName: z.string(),
    username: z.string().nullable(),
    displayName: z.string().nullable(),
    counts: syncMonitorPageCountsSchema,
    summary: syncMonitorPageSummarySchema,
    streams: z.array(syncMonitorStreamItemSchema),
    syncUx: syncUxSummarySchema,
});
export const syncMonitorProviderSummarySchema = z.object({
    platform: platformEnum,
    rateHealth: syncMonitorRateHealthSchema,
    recent429s: z.number().int(),
    recent5xxs: z.number().int(),
});
export const syncMonitorOverallSchema = z.object({
    pages: z.number().int(),
    streams: z.number().int(),
    runningStreams: z.number().int(),
    blockedStreams: z.number().int(),
    stalledStreams: z.number().int(),
    pendingStreams: z.number().int(),
    retryingStreams: z.number().int(),
    counts: syncMonitorPageCountsSchema,
    recentRuns: syncMonitorRecentRunsSchema,
    recentErrors: syncMonitorRecentErrorsSchema,
    providers: z.array(syncMonitorProviderSummarySchema),
    syncUx: syncUxSummarySchema,
});
export const syncMonitorRecentEventSchema = z.object({
    id: z.number().int(),
    runId: z.number().int(),
    pageId: z.number().int(),
    pageLabel: z.string(),
    platform: platformEnum,
    stream: extendedSyncStreamEnum,
    eventType: z.string(),
    severity: z.enum(["info", "warn", "error"]),
    message: z.string(),
    details: z.record(z.string(), z.unknown()),
    emittedAt: isoTimestamp,
});
export const syncStatusQuerySchema = z.object({
    pageLabel: z.string().min(1).optional(),
    windowHours: z.coerce.number().int().min(1).max(24 * 14).default(24),
    eventLimit: z.coerce.number().int().min(1).max(200).default(50),
});
export const syncStatusResponseSchema = z.object({
    generatedAt: isoTimestamp,
    window: z.object({
        hours: z.number().int(),
        startedAt: isoTimestamp,
    }),
    overall: syncMonitorOverallSchema,
    pages: z.array(syncMonitorPageItemSchema),
    recentEvents: z.array(syncMonitorRecentEventSchema),
});
export const syncRequestsQuerySchema = z.object({
    since: z.string().optional(),
    limit: z.coerce.number().int().min(1).default(100),
});
export const syncRequestItemSchema = z.object({
    timestamp: isoTimestamp,
    pageLabel: z.string(),
    platform: platformEnum,
    stream: extendedSyncStreamEnum,
    operation: z.string(),
    endpoint: z.string(),
    method: z.string(),
    attemptNumber: z.number().int(),
    status: z.enum(["started", "success", "retry", "failed"]),
    httpStatusCode: z.number().int().nullable(),
    durationMs: z.number().int().nullable(),
    rateLimitWaitMs: z.number().int().nullable(),
    groupId: z.string().nullable(),
    partnerUsername: z.string().nullable(),
    returnedItems: z.number().int().nullable(),
    syncDone: z.boolean().nullable(),
    proxyGapMs: z.number().int().nullable(),
});
export const syncRequestsResponseSchema = z.array(syncRequestItemSchema);
const syncBlockKeyEnum = z.enum([
    "connection",
    "financials",
    "audience",
    "messages_live",
    "messages_history",
]);
const syncBlockStateEnum = z.enum([
    "not_started",
    "scheduled",
    "backfilling",
    "up_to_date",
    "syncing",
    "retrying",
    "delayed",
    "failed",
    "paused",
    "not_available",
]);
const simpleConnectionStatusEnum = z.enum(["connected", "not_connected", "error"]);
export const syncBlockProgressSchema = z.object({
    label: z.string(),
    current: z.number().int(),
    total: z.number().int().nullable(),
    unit: z.string(),
    percent: z.number().nullable(),
    details: z.record(z.string(), z.unknown()),
});
export const syncBlockErrorSchema = z.object({
    stream: z.string().nullable(),
    code: z.string().nullable(),
    summary: z.string().nullable(),
    failedAt: isoTimestamp.nullable(),
    consecutiveFailures: z.number().int(),
});
export const syncStatusReasonSchema = z.object({
    code: z.string().nullable(),
    summary: z.string().nullable(),
    waitingFor: z.array(z.string()).nullable(),
});
const syncStreamRoleEnum = z.enum(["primary", "supporting"]);
export const syncBlockIntervalSchema = z.object({
    stream: extendedSyncStreamEnum,
    cadenceSeconds: z.number().int(),
});
export const syncBlockSubstreamSchema = z.object({
    stream: extendedSyncStreamEnum,
    role: syncStreamRoleEnum,
    state: syncBlockStateEnum.exclude(["not_available"]),
    succeededAt: isoTimestamp.nullable(),
    nextDueAt: isoTimestamp.nullable(),
    nextRetryAt: isoTimestamp.nullable(),
    cadenceSeconds: z.number().int(),
    isFresh: z.boolean(),
    needsAttention: z.boolean(),
    statusReason: syncStatusReasonSchema.nullable(),
    error: syncBlockErrorSchema.nullable(),
});
export const syncBlockStatusSchema = z.object({
    block: syncBlockKeyEnum,
    state: syncBlockStateEnum,
    succeededAt: isoTimestamp.nullable(),
    progress: syncBlockProgressSchema.nullable(),
    progressStream: z.string().nullable(),
    progressRole: syncStreamRoleEnum.nullable(),
    error: syncBlockErrorSchema.nullable(),
    statusReason: syncStatusReasonSchema.nullable(),
    primaryFresh: z.boolean(),
    needsAttention: z.boolean(),
    nextDueAt: isoTimestamp.nullable(),
    nextRetryAt: isoTimestamp.nullable(),
    intervals: z.array(syncBlockIntervalSchema),
    metrics: z.record(z.string(), z.unknown()),
    connectionStatus: simpleConnectionStatusEnum.nullable(),
    substreams: z.array(syncBlockSubstreamSchema),
});
const syncDiagnosisCodeEnum = z.enum([
    "worker_offline",
    "stalled_run",
    "auth_blocked",
]);
const syncDiagnosisSeverityEnum = z.enum(["warning", "error"]);
const syncDiagnosisActionKindEnum = z.enum([
    "worker",
    "credentials",
    "sync_settings",
]);
export const syncDiagnosisSchema = z.object({
    code: syncDiagnosisCodeEnum,
    severity: syncDiagnosisSeverityEnum,
    headline: z.string(),
    detail: z.string(),
    actionKind: syncDiagnosisActionKindEnum.nullable(),
});
export const syncBlocksPageSchema = z.object({
    pageId: z.number().int(),
    pageLabel: z.string(),
    platform: platformEnum,
    modelSlug: z.string(),
    modelName: z.string(),
    username: z.string().nullable(),
    displayName: z.string().nullable(),
    diagnosis: syncDiagnosisSchema.nullable(),
    blocks: z.object({
        connection: syncBlockStatusSchema,
        financials: syncBlockStatusSchema,
        audience: syncBlockStatusSchema,
        messages_live: syncBlockStatusSchema,
        messages_history: syncBlockStatusSchema,
    }),
});
export const syncOverviewResponseSchema = z.object({
    generatedAt: isoTimestamp,
    diagnosis: syncDiagnosisSchema.nullable(),
    pages: z.array(syncBlocksPageSchema),
});
export const pageSyncBlocksParamsSchema = pageParamsSchema;
export const pageSyncBlocksResponseSchema = z.object({
    generatedAt: isoTimestamp,
    page: syncBlocksPageSchema,
});
export const pageMessagesBlockResponseSchema = z.object({
    generatedAt: isoTimestamp,
    page: z.object({
        pageId: z.number().int(),
        pageLabel: z.string(),
        platform: platformEnum,
        modelSlug: z.string(),
        modelName: z.string(),
        username: z.string().nullable(),
        displayName: z.string().nullable(),
        diagnosis: syncDiagnosisSchema.nullable(),
    }),
    block: syncBlockStatusSchema,
});
export const adminSyncBlockBodySchema = z.object({
    pageLabel: z.string().min(1),
    block: syncBlockKeyEnum,
});
export const adminSyncBlockRequestSchema = z.object({
    stream: extendedSyncStreamEnum,
    requestedSeq: z.number().int(),
});
export const adminSyncBlockResponseSchema = z.object({
    accepted: z.literal(true),
    action: z.enum(["trigger", "pause", "resume", "reset"]),
    pageLabel: z.string(),
    block: syncBlockKeyEnum,
    requests: z.array(adminSyncBlockRequestSchema).optional(),
});
export const syncTriggerBodySchema = z.object({
    pageLabel: z.string().min(1),
    scope: syncTriggerScopeEnum,
});
export const syncTriggerResponseSchema = z.object({
    accepted: z.literal(true),
    pageLabel: z.string(),
    scope: syncTriggerScopeEnum,
});
export const syncTriggerAllResponseSchema = z.object({
    accepted: z.literal(true),
    pagesQueued: z.number().int(),
});
export const syncRunsQuerySchema = z.object({
    pageLabel: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(20),
    since: z.string().optional(),
});
export const adminLogsQuerySchema = z.object({
    severity: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
});
export const adminLogItemSchema = z.object({
    id: intId,
    syncRunId: intId,
    provider: platformEnum,
    stream: z.string(),
    eventType: z.string(),
    severity: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()),
    emittedAt: isoTimestamp,
    pageLabel: z.string(),
});
export const adminQueueJobsQuerySchema = z.object({
    state: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
});
export const adminQueueJobItemSchema = z.object({
    id: z.string(),
    name: z.string(),
    state: z.string(),
    data: z.unknown().nullable(),
    createdOn: isoTimestamp,
    startedOn: isoTimestamp.nullable(),
    completedOn: isoTimestamp.nullable(),
    output: z.unknown().nullable(),
    retryLimit: z.number().int(),
    retryCount: z.number().int(),
});
export const adminDbTableStatSchema = z.object({
    schema: z.string(),
    table: z.string(),
    rowEstimate: z.number().int(),
    totalBytes: z.number().int(),
    indexBytes: z.number().int(),
});
export const adminDbMigrationSchema = z.object({
    name: z.string(),
    appliedAt: isoTimestamp,
});
export const adminDbStatsResponseSchema = z.object({
    tables: z.array(adminDbTableStatSchema),
    migrations: z.array(adminDbMigrationSchema),
});
export const adminIncidentsQuerySchema = z.object({
    severity: z.string().min(1).optional(),
    code: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
});
export const adminIncidentItemSchema = adminLogItemSchema;
export const adminIncidentSummaryItemSchema = z.object({
    code: z.string().nullable(),
    severity: z.string(),
    count: z.number().int(),
});
export const adminIncidentsResponseSchema = z.object({
    summary: z.array(adminIncidentSummaryItemSchema),
    items: z.array(adminIncidentItemSchema),
});
// --- Notifications dashboard schemas ---
const notificationConnectionStatusEnum = z.enum([
    "not_configured",
    "untested",
    "connected",
    "last_message_failed",
]);
const notificationCredentialSourceEnum = z.enum(["db", "env", "none"]);
// Telegram bot token: `<bot_id>:<35-char secret>` from @BotFather. The bound is
// lenient (>=30) to tolerate future token-length changes while still rejecting a
// chat id / random text pasted into the token field.
const telegramBotTokenSchema = z
    .string()
    .trim()
    .regex(/^\d{5,}:[A-Za-z0-9_-]{30,}$/, "Expected a Telegram bot token like 7123456789:AA…");
// Chat id: a numeric id (negative / -100… for groups & channels) or an @username.
const telegramChatIdSchema = z
    .string()
    .trim()
    .regex(/^(-?\d+|@[A-Za-z0-9_]{5,32})$/, "Expected a numeric chat id (e.g. 123456789 or -100…) or @username");
// Stage 10: platform-neutral message archive reads (owner/team_lead only).
export const archiveMessageItemSchema = z.object({
    id: intId,
    accountId: intId,
    platform: z.string(),
    conversationRef: z.string().nullable(),
    messageRef: z.string(),
    fanNativeId: z.string().nullable(),
    senderRole: z.string(),
    isSentByMe: z.boolean(),
    occurredAt: isoTimestamp.nullable(),
    textPlain: z.string(),
    priceMills: z.string().nullable(),
    isTip: z.boolean(),
    tipAmountMills: z.string(),
    deletedAt: isoTimestamp.nullable(),
});
const notificationIncidentKindEnum = z.enum([
    "auth_blocked",
    "proxy_failed",
    "proxy_missing",
    "stream_failed_threshold",
    "ofapi_auth",
    "ofapi_low_credit",
    "ofapi_webhook_silence",
    "ofapi_burn_rate",
    "db_disk_usage",
    "observations_partitions",
    "wrong_transactions_writer",
    "read_gateway_capture",
    "golden_signal_lag",
    "scheduler_silent",
    "ops_sampler_silent",
]);
const notificationIncidentStatusEnum = z.enum(["open", "resolved"]);
const deliveryKindEnum = z.enum([
    "test",
    "daily_report_scheduled",
    "daily_report_manual",
    "incident_opened",
    "incident_resolved",
    "incident_manually_resolved",
]);
export const notificationsSettingsResponseSchema = z.object({
    configured: z.boolean(),
    botTokenSet: z.boolean(),
    chatId: z.string().nullable(),
    botTokenSource: notificationCredentialSourceEnum,
    chatIdSource: notificationCredentialSourceEnum,
    enabled: z.boolean(),
    dailyReportEnabled: z.boolean(),
    syncFailureAlertsEnabled: z.boolean(),
    reportHourUtc: z.number().int().min(0).max(23),
    connectionStatus: notificationConnectionStatusEnum,
    lastMessageAt: isoTimestamp.nullable(),
    lastMessageError: z.string().nullable(),
});
export const notificationsSettingsUpdateBodySchema = z.object({
    enabled: z.boolean().optional(),
    dailyReportEnabled: z.boolean().optional(),
    syncFailureAlertsEnabled: z.boolean().optional(),
    reportHourUtc: z.number().int().min(0).max(23).optional(),
    botToken: telegramBotTokenSchema.nullable().optional(),
    chatId: telegramChatIdSchema.nullable().optional(),
});
export const notificationsTestMessageResponseSchema = z.object({
    status: z.string(),
    error: z.string().nullable(),
});
export const notificationsDiscoverChatsBodySchema = z.object({
    // Optional: test a token the operator has typed but not yet saved. When
    // omitted, the stored/env token is used.
    botToken: telegramBotTokenSchema.optional(),
});
export const notificationsDiscoverChatsResponseSchema = z.object({
    botUsername: z.string().nullable(),
    chats: z.array(z.object({
        id: z.string(),
        type: z.string(),
        title: z.string(),
    })),
});
export const notificationsIncidentItemSchema = z.object({
    id: intId,
    incidentKey: z.string(),
    kind: notificationIncidentKindEnum,
    /** Null for global incidents (db_disk_usage, observations_partitions, …). */
    pageLabel: z.string().nullable(),
    platform: platformEnum.nullable(),
    stream: z.string().nullable(),
    status: notificationIncidentStatusEnum,
    openedAt: isoTimestamp,
    lastSeenAt: isoTimestamp,
    resolvedAt: isoTimestamp.nullable(),
    errorCode: z.string().nullable(),
    errorSummary: z.string().nullable(),
    notificationCount: z.number().int(),
});
export const notificationsIncidentsQuerySchema = z.object({
    status: notificationIncidentStatusEnum.optional(),
    kind: notificationIncidentKindEnum.optional(),
    pageLabel: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
});
export const notificationsIncidentsResponseSchema = z.object({
    items: z.array(notificationsIncidentItemSchema),
    total: z.number().int(),
});
export const notificationsResolveIncidentResponseSchema = z.object({
    ok: z.literal(true),
});
export const notificationsReportPreviewResponseSchema = z.object({
    text: z.string(),
    reportDate: z.string(),
});
export const notificationsReportSendResponseSchema = z.object({
    status: z.string(),
    error: z.string().nullable(),
    reportDate: z.string().nullable(),
});
export const notificationsDeliveryAttemptItemSchema = z.object({
    id: intId,
    kind: deliveryKindEnum,
    status: z.string(),
    reportDate: z.string().nullable(),
    error: z.string().nullable(),
    createdAt: isoTimestamp,
});
export const notificationsReportHistoryResponseSchema = z.object({
    items: z.array(notificationsDeliveryAttemptItemSchema),
});
const fanslyCredentialsSchema = z.object({
    platform: z.literal("fansly"),
    session: z.object({
        authorization: z.string().min(1),
        fanslyClientId: z.string().optional(),
        fanslyClientCheck: z.string().optional(),
        fanslySessionId: z.string().optional(),
    }),
    proxy: z.object({
        url: z.string().min(1),
        username: z.string().nullable().optional(),
        password: z.string().nullable().optional(),
    }).nullable().optional(),
});
const onlyfansCredentialsSchema = z.object({
    platform: z.literal("onlyfans"),
    // Stage 18: OnlyMonster retired — OnlyFans pages onboard against the OFAPI
    // vendor by username (the account must already be connected there); no
    // pasted credentials, no per-page proxy (egress is vendor-side).
    username: z.string().min(1),
});
const credentialProxySchema = z.object({
    url: z.string().min(1),
    username: z.string().nullable().optional(),
    password: z.string().nullable().optional(),
}).nullable().optional();
export const verifyCredentialsBodySchema = z.discriminatedUnion("platform", [
    fanslyCredentialsSchema,
    onlyfansCredentialsSchema,
]);
export const verifyCredentialsResponseSchema = z.object({
    valid: z.literal(true),
    platform: platformEnum,
    username: z.string().nullable(),
    displayName: z.string().nullable(),
});
export const createPageBodySchema = z.discriminatedUnion("platform", [
    fanslyCredentialsSchema.extend({
        modelSlug: z.string().min(1),
        label: z.string().min(1),
    }),
    onlyfansCredentialsSchema.extend({
        modelSlug: z.string().min(1),
        label: z.string().min(1),
    }),
]);
export const testProxyBodySchema = z.object({
    proxy: z.object({
        url: z.string().min(1),
        username: z.string().nullable().optional(),
        password: z.string().nullable().optional(),
    }),
});
export const testProxyResponseSchema = z.object({
    ip: z.string(),
});
export const createModelBodySchema = z.object({
    slug: z.string().min(1).max(100),
    name: z.string().min(1).max(200),
});
export const updateModelBodySchema = z.object({
    slug: z.string().min(1).max(100).optional(),
    name: z.string().min(1).max(200).optional(),
    sortOrder: z.number().int().min(0).optional(),
}).refine((value) => value.slug !== undefined || value.name !== undefined || value.sortOrder !== undefined, {
    message: "At least one field is required",
});
export const createModelResponseSchema = z.object({
    id: intId,
    slug: z.string(),
    name: z.string(),
});
export const updatePageBodySchema = z.object({
    label: z.string().min(1).optional(),
    modelSlug: z.string().min(1).optional(),
}).refine((value) => value.label !== undefined || value.modelSlug !== undefined, {
    message: "At least one field is required",
});
export const updateCredentialsBodySchema = z.discriminatedUnion("platform", [
    z.object({
        platform: z.literal("fansly"),
        session: fanslyCredentialsSchema.shape.session.optional(),
        proxy: credentialProxySchema,
    }),
    z.object({
        // Stage 18: OnlyFans pages hold no pasted credentials (OFAPI vendor-side)
        // — the update route rejects this variant with a clear 400.
        platform: z.literal("onlyfans"),
    }),
]);
export const verifyPageResponseSchema = z.object({
    verified: z.boolean(),
    username: z.string().nullable(),
    platform: platformEnum,
    // W3.3 (D4-N1): false = the credentials verified but the auth block could
    // not be cleared — streams stay blocked and the incidents stay open; the
    // dashboard renders a warning instead of an all-clear.
    syncUnblocked: z.boolean(),
});
export const adminCreatePageResponseSchema = z.object({
    page: assignedPageSchema,
    verified: z.boolean(),
    syncQueued: z.boolean(),
    syncWarning: z.object({
        code: z.literal("initial_sync_enqueue_failed"),
        message: z.string(),
    }).nullable(),
    syncRetry: z.object({
        method: z.literal("POST"),
        path: z.literal("/api/v1/admin/sync/trigger"),
        body: syncTriggerBodySchema,
    }).nullable(),
});
export const adminUpdatePageResponseSchema = z.object({
    page: assignedPageSchema,
});
export const updateCredentialsResponseSchema = z.object({
    updated: z.boolean(),
    verified: z.boolean(),
    // W3.3 (D4-N1): see verifyPageResponseSchema.syncUnblocked.
    syncUnblocked: z.boolean(),
});
export const deletedResponseSchema = z.object({
    deleted: z.literal(true),
});
// ─── OFAPI webhook receiver + SSE sync-event fanout (ChatMuse real-time) ───
//
// SyncEvent is core's copy of the ChatGoose desktop protocol union
// (chatgoose_desktop packages/shared/src/protocol — shared conceptually, owned
// here). `accountId` is the OFAPI account id ("acct_…", the desktop's account
// namespace); chatId/messageId are raw OnlyFans numeric ids serialized as strings
// (chat_id === fan.id). Unknown frame types are skipped by consumers, so the
// union can grow without breaking them.
const syncEventIdSchema = z.string().min(1);
export const normalizedSyncMessageMediaSchema = z.object({
    id: syncEventIdSchema,
    type: z.enum(["photo", "video", "audio", "gif", "other"]),
    isReady: z.boolean(),
    locked: z.boolean(),
    durationSeconds: z.number().nonnegative().nullable().optional(),
});
export const normalizedSyncMessageReplyToSchema = z.object({
    messageId: syncEventIdSchema.optional(),
    sender: z.enum(["fan", "model"]).optional(),
    textPreview: z.string(),
});
export const normalizedSyncMessageSchema = z.object({
    id: syncEventIdSchema,
    // OFAPI HTML. Consumers derive their own plain-text preview.
    text: z.string(),
    createdAt: isoTimestamp,
    isSentByMe: z.boolean(),
    price: z.number().nonnegative(),
    isOpened: z.boolean().nullable().optional(),
    isNew: z.boolean().optional(),
    isTip: z.boolean().optional(),
    tipAmountUsd: z.number().nonnegative().nullable().optional(),
    tipText: z.string().nullable().optional(),
    mediaCount: z.number().int().nonnegative().optional(),
    media: z.array(normalizedSyncMessageMediaSchema).optional(),
    replyTo: normalizedSyncMessageReplyToSchema.nullable().optional(),
});
export const chatListUpdatedEventSchema = z.object({
    type: z.literal("chatListUpdated"),
    accountId: syncEventIdSchema,
});
export const messageReceivedEventSchema = z.object({
    type: z.literal("messageReceived"),
    accountId: syncEventIdSchema,
    chatId: syncEventIdSchema,
    messageId: syncEventIdSchema,
    message: normalizedSyncMessageSchema.optional(),
});
export const messageSentEventSchema = z.object({
    type: z.literal("messageSent"),
    accountId: syncEventIdSchema,
    chatId: syncEventIdSchema,
    messageId: syncEventIdSchema,
    message: normalizedSyncMessageSchema.optional(),
});
// Core extension over the desktop union (load-bearing for its message tombstones);
// the upstream messages.deleted payload carries only the message id, no chat id.
export const messageDeletedEventSchema = z.object({
    type: z.literal("messageDeleted"),
    accountId: syncEventIdSchema,
    messageId: syncEventIdSchema,
});
// messages.ppv.unlocked / tips.received payloads are notification-shaped: the fan
// id is present, but the message id is only sometimes recoverable (from the
// notification's message link) — optional, never fabricated.
export const ppvUnlockedEventSchema = z.object({
    type: z.literal("ppvUnlocked"),
    accountId: syncEventIdSchema,
    chatId: syncEventIdSchema,
    messageId: syncEventIdSchema.optional(),
});
export const tipReceivedEventSchema = z.object({
    type: z.literal("tipReceived"),
    accountId: syncEventIdSchema,
    chatId: syncEventIdSchema,
    messageId: syncEventIdSchema.optional(),
    // OFAPI amounts are dollars; absent when upstream omits it.
    amountUsd: z.number().nonnegative().optional(),
});
export const presenceEventSchema = z.object({
    type: z.literal("presence"),
    accountId: syncEventIdSchema,
    chatId: syncEventIdSchema,
    online: z.boolean(),
    // Epoch milliseconds.
    lastSeenAt: z.number().optional(),
});
export const typingEventSchema = z.object({
    type: z.literal("typing"),
    accountId: syncEventIdSchema,
    chatId: syncEventIdSchema,
});
export const accountAuthChangedEventSchema = z.object({
    type: z.literal("accountAuthChanged"),
    accountId: syncEventIdSchema,
    authenticated: z.boolean(),
});
export const syncEventSchema = z.discriminatedUnion("type", [
    chatListUpdatedEventSchema,
    messageReceivedEventSchema,
    messageSentEventSchema,
    messageDeletedEventSchema,
    ppvUnlockedEventSchema,
    tipReceivedEventSchema,
    presenceEventSchema,
    typingEventSchema,
    accountAuthChangedEventSchema,
]);
export const syncSnapshotRequiredResponseSchema = z.object({
    error: z.literal("sync_snapshot_required"),
    message: z.string(),
    statusCode: z.literal(409),
    version: z.literal(1),
    requestedSeq: z.number().int().nonnegative(),
    oldestAvailableSeq: z.number().int().nonnegative().nullable(),
    currentSeq: z.number().int().nonnegative(),
    snapshotPath: z.literal("/api/v1/events/snapshot"),
});
/** A sticky snapshotCursor/stateCursor became older than cleanup's durable
 * replay floor while a paged recovery was in progress. Clients must discard
 * only that matching progress record and restart the snapshot without either
 * cursor; retrying the same continuation can never succeed. */
export const syncSnapshotRestartRequiredResponseSchema = z.object({
    error: z.literal("sync_snapshot_restart_required"),
    message: z.string(),
    statusCode: z.literal(409),
    replayFloor: z.number().int().nonnegative(),
    snapshotPath: z.literal("/api/v1/events/snapshot"),
});
// --- Event stream v2 (kernel Stage 21): domain_events, per-account ordering ---
export const domainEventFrameSchema = z.object({
    accountId: z.number().int().positive(),
    accountSeq: z.number().int().positive(),
    // Canonical vocabulary (target §3.2). Deliberately open: clients MUST
    // tolerate unknown types (the v1 union's forward-compat rule, now explicit).
    type: z.string().min(1),
    occurredAt: isoTimestamp,
    data: z.unknown(),
    // Stage 24 serve-time additions (all optional — pre-Stage-24 frames and the
    // smoke consumer's persisted expectations stay valid):
    // the ledger's platform-native refs, surfaced so clients can route events
    // without re-deriving them from `data`...
    fanRef: z.string().nullable().optional(),
    conversationRef: z.string().nullable().optional(),
    messageRef: z.string().nullable().optional(),
    // ...the page's OFAPI account ref (null for unmapped/Fansly pages), so
    // OFAPI-keyed clients (the desktop) filter without numeric-id translation...
    accountRef: z.string().nullable().optional(),
    // ...and, on message.received/message.sent frames whose source observation
    // is an OFAPI webhook message, the same normalized message payload the v1
    // fanout serves — projection-grade ingest without a read-gateway round
    // trip (decision #92's "payloads ride Stage 24"). Shape-tolerant clients
    // validate it themselves (it is upstream-derived, not a kernel contract).
    payload: z.unknown().optional(),
});
// The v2 stream may interleave `event: ephemeral` frames (no id line — they
// never advance the cursor): serve-time-only events that are deliberately
// NOT ledgered (typing indicators). data = a v1 SyncEvent JSON object.
export const domainEventsSnapshotRequiredAccountSchema = z.object({
    accountId: z.number().int().positive(),
    requestedSeq: z.number().int().nonnegative(),
    oldestAvailableSeq: z.number().int().positive().nullable(),
    currentSeq: z.number().int().nonnegative(),
});
export const domainEventsSnapshotRequiredResponseSchema = z.object({
    error: z.literal("sync_snapshot_required"),
    message: z.string(),
    statusCode: z.literal(409),
    version: z.literal(2),
    accounts: z.array(domainEventsSnapshotRequiredAccountSchema),
    snapshotPath: z.literal("/api/v1/events/v2/snapshot"),
});
export const domainEventsSnapshotResponseSchema = z.object({
    // Opaque replay cursor over the requested accounts. It ordinarily points at
    // current high-waters, but may remain before a retained OFAPI event that is
    // not yet represented by the durable state snapshot. accounts.currentSeq
    // remains the raw committed high-water for diagnostics.
    cursor: z.string(),
    accounts: z.array(z.object({
        accountId: z.number().int().positive(),
        // Platform-native OFAPI id used by Desktop's durable state endpoint. Null
        // for pages that are not backed by OFAPI.
        accountRef: z.string().min(1).nullable(),
        currentSeq: z.number().int().nonnegative(),
    })),
});
export const syncSnapshotQuerySchema = z.object({
    accountId: syncEventIdSchema,
    afterSeq: z.coerce.number().int().nonnegative(),
    snapshotCursor: z.coerce.number().int().nonnegative().optional(),
    pageCursor: z.coerce.number().int().nonnegative().default(0),
    limit: z.coerce.number().int().min(1).max(50).default(25),
    // Additive bounded-v1 protocol. Old servers strip these unknown query
    // fields and return the legacy page shape; upgraded clients detect the
    // absent nextStateCursor and continue with legacy thread pagination.
    pageMode: z.literal("bounded_v1").optional(),
    stateCursor: z.string().min(1).max(2_048).regex(/^[A-Za-z0-9_-]+$/).optional(),
    messageLimit: z.coerce.number().int().min(1).max(200).default(100),
});
export const syncSnapshotMessageSchema = z.object({
    chatId: syncEventIdSchema,
    messageId: syncEventIdSchema,
    message: normalizedSyncMessageSchema.nullable(),
    deletedAt: isoTimestamp.nullable(),
    sourceUpdatedAt: isoTimestamp,
    sourceFanoutSeq: z.number().int().nonnegative().nullable(),
});
export const syncSnapshotThreadSchema = z.object({
    chatId: syncEventIdSchema,
    fanName: z.string(),
    unreadCount: z.number().int().nonnegative(),
    hasUnreadTips: z.boolean(),
    lastMessageId: syncEventIdSchema.nullable(),
    lastMessageAt: isoTimestamp.nullable(),
    lastMessageIsSentByMe: z.boolean(),
    lastMessagePreview: z.string(),
    visible: z.boolean(),
    sourceUpdatedAt: isoTimestamp,
    messages: z.array(syncSnapshotMessageSchema),
});
export const syncSnapshotUnresolvedTombstoneSchema = z.object({
    messageId: syncEventIdSchema,
    deletedAt: isoTimestamp,
    sourceUpdatedAt: isoTimestamp,
    sourceFanoutSeq: z.number().int().nonnegative(),
});
export const syncSnapshotResponseSchema = z.object({
    version: z.literal(1),
    requestedAfterSeq: z.number().int().nonnegative(),
    snapshotCursor: z.number().int().nonnegative(),
    stateAt: isoTimestamp,
    resumeAllowed: z.boolean(),
    page: z.object({
        pageId: intId,
        label: z.string(),
        accountId: syncEventIdSchema,
        username: z.string().nullable(),
        authStatus: z.string().nullable(),
        authenticated: z.boolean().nullable(),
        authChangedAt: isoTimestamp.nullable(),
    }),
    coverage: z.object({
        durableDomains: z.array(z.enum([
            "chat_heads",
            "hot_messages",
            "message_tombstones",
            "account_auth",
        ])),
        omittedDomains: z.array(z.object({
            domain: z.string(),
            reason: z.string(),
        })),
        messageWindow: z.literal("hot_projection_plus_archive_delta"),
    }),
    threads: z.array(syncSnapshotThreadSchema),
    unresolvedTombstones: z.array(syncSnapshotUnresolvedTombstoneSchema),
    nextPageCursor: z.number().int().nonnegative().nullable(),
    // Present (including terminal null) only for bounded_v1 responses. Its
    // absence is the backwards-compatible old-Core/legacy-mode signal.
    nextStateCursor: z.string().min(1).max(2_048).nullable().optional(),
});
export const ofapiWebhookAckResponseSchema = z.object({
    received: z.literal(true),
    duplicate: z.boolean(),
});
export const ofapiPageMappingSchema = z.object({
    pageId: intId,
    label: z.string(),
    username: z.string().nullable(),
    ofapiAccountId: z.string().nullable(),
    // OFAPI account health (decision #49 Phase 3): latest accounts.* state and
    // webhook recency for the mapped account. Null when unmapped / no data yet.
    ofapiAuthStatus: z.string().nullable(),
    ofapiAuthChangedAt: isoTimestamp.nullable(),
    lastEventAt: isoTimestamp.nullable(),
    lastEventAgeSeconds: z.number().int().nullable(),
});
export const ofapiWebhookStatusResponseSchema = z.object({
    configured: z.boolean(),
    endpointUrl: z.string().nullable(),
    externalWebhookId: z.string().nullable(),
    accountScope: z.string().nullable(),
    events: z.array(z.string()),
    signingSecretMask: z.string().nullable(),
    updatedAt: isoTimestamp.nullable(),
    pages: z.array(ofapiPageMappingSchema),
    // Last credit balance observed in OFAPI REST _meta plus today's tracked spend.
    credit: z.object({
        lastBalance: z.number().int().nullable(),
        lastBalanceAt: isoTimestamp.nullable(),
        spentToday: z.number().int(),
    }),
});
export const ofapiWebhookRegisterBodySchema = z.object({
    // Public URL OFAPI should deliver to, e.g. https://hub.example.com/api/v1/ofapi/webhook
    endpointUrl: z.string().url().max(2000),
});
export const ofapiWebhookRegisterResponseSchema = z.object({
    externalWebhookId: z.string().nullable(),
    endpointUrl: z.string(),
    accountScope: z.literal("global"),
    events: z.array(z.string()),
    signingSecretMask: z.string(),
    mapping: z.object({
        mapped: z.array(z.object({
            pageId: intId,
            label: z.string(),
            ofapiAccountId: z.string(),
        })),
        unmatchedAccounts: z.array(z.object({
            id: z.string(),
            username: z.string().nullable(),
        })),
        unmappedPages: z.array(z.string()),
    }),
});
// --- OFAPI credit ledger schemas (docs/ofapi-parity-plan.md Phase 2) ---
export const ofapiCreditLedgerSourceEnum = z.enum([
    "rest",
    "webhook_accrual",
    "external",
    "refill",
    "adjustment",
]);
// Positive spend per ledger source over a window. Refills are negative credit
// movement and never count as spend, so they have no key here.
const ofapiCreditsSpendBySourceSchema = z.object({
    rest: z.number().int(),
    webhookAccrual: z.number().int(),
    external: z.number().int(),
    adjustment: z.number().int(),
});
export const ofapiCreditsSummaryResponseSchema = z.object({
    // OFAPI_CREDIT_LEDGER_ENABLED — with the flag off the page shows a notice and
    // the ledger-derived sections are empty.
    enabled: z.boolean(),
    balance: z.object({
        value: z.number().int().nullable(),
        observedAt: isoTimestamp.nullable(),
    }),
    today: z.object({
        day: businessDate,
        total: z.number().int(),
        bySource: ofapiCreditsSpendBySourceSchema,
    }),
    budgets: z.array(z.object({
        stream: z.string(),
        spentToday: z.number().int(),
        dailyCeiling: z.number().int(),
        state: z.enum(["ok", "budget_exhausted", "floor_blocked"]),
        retryAt: isoTimestamp.nullable(),
    })),
    floor: z.object({
        value: z.number().int(),
        blocked: z.boolean(),
    }),
    forecast: z.object({
        avgDailySpend7d: z.number(),
        daysLeft: z.number().int().nullable(),
        runOutDate: businessDate.nullable(),
        // D5: month-to-date spend and the projected calendar-month total (MTD +
        // avgDailySpend × remaining UTC days). Credits only; the dashboard formats USD
        // from `pricing`. Optional so a dashboard bundle can roll across an API version
        // that predates them.
        monthToDateSpend: z.number().int().min(0).optional(),
        monthEndProjection: z.number().int().min(0).optional(),
        // Credits to refill now to keep the runway at `targetDays` above the floor:
        // max(0, floor + avgDailySpend × targetDays − balance). Null when the balance
        // has not been observed (no meaningful recommendation).
        refillRecommendation: z.object({
            targetDays: z.number().int().min(0),
            credits: z.number().int().min(0),
        }).nullable().optional(),
    }),
    incidents: z.array(z.object({
        kind: z.string(),
        openedAt: isoTimestamp,
        errorSummary: z.string().nullable(),
    })),
    reconciliation: z.object({
        lastRunAt: isoTimestamp.nullable(),
        lastDriftCredits: z.number().int().nullable(),
    }),
    accrual: z.object({
        lastPostedDay: businessDate.nullable(),
        // Optional so a dashboard bundle can roll forward/back across an API version
        // that predates this derived estimate.
        pendingToday: z.object({
            day: businessDate,
            eventCount: z.number().int().min(0),
            estimatedCredits: z.number().int().min(0),
        }).nullable().optional(),
    }),
    // D3: trailing-window (last 60 min) burn drivers mirroring the ofapi_burn_rate
    // monitor. `total` is all-source net (refills excluded, external prorated);
    // topOperations/topPages are REST-only (webhook/external spend has no operation
    // or page attribution). Optional so a dashboard bundle can roll across an API
    // version that predates it.
    recentBurn: z.object({
        windowMinutes: z.number().int().positive(),
        total: z.number().int(),
        threshold: z.number().int(),
        alerting: z.boolean(),
        topOperations: z.array(z.object({
            operation: z.string().nullable(),
            requests: z.number().int(),
            credits: z.number().int(),
        })),
        topPages: z.array(z.object({
            pageId: intId,
            pageLabel: z.string(),
            credits: z.number().int(),
        })),
    }).optional(),
    // Display-only flat credit price for USD cost estimates (OFAPI_CREDIT_MICRO_USD_PRICE).
    // Micro-USD integer per credit; 0 means "unset" and the dashboard hides USD figures.
    // Optional so a dashboard bundle can roll forward/back across an API version that
    // predates the price surface.
    pricing: z.object({
        microUsdPerCredit: z.number().int().min(0),
    }).optional(),
});
const ofapiCreditsChatterWindowSchema = z.object({
    from: isoTimestamp,
    to: isoTimestamp,
    restCredits: z.number().int().min(0),
    webhook: z.object({
        eventCount: z.number().int().min(0),
        estimatedCredits: z.number().int().min(0),
    }),
    totalEstimatedCredits: z.number().int().min(0),
});
export const ofapiCreditsChatterSummaryResponseSchema = z.object({
    enabled: z.boolean(),
    scope: z.object({
        pageIds: z.array(intId),
        pageCount: z.number().int().min(0),
    }),
    today: z.object({
        day: businessDate,
    }).merge(ofapiCreditsChatterWindowSchema),
    last7d: ofapiCreditsChatterWindowSchema,
    limitations: z.array(z.string()),
});
const ofapiReadGatewayParamsSchema = z.object({
    "*": z.string().min(1).max(1000),
});
export const ofapiCommandStateSchema = z.enum([
    "queued",
    "in_flight",
    "confirmed",
    "failed_retryable",
    "failed_terminal",
    "indeterminate",
    "cancelled",
]);
export const ofapiCommandKindSchema = z.enum([
    "send_text_message_v1",
    "send_media_message_v1",
    "typing_active_v1",
    "unsend_message_v1",
    "mark_chat_read_v1",
]);
const ofapiCommandBaseFields = {
    clientCommandId: z.string().uuid(),
    accountId: z.string().regex(/^acct_[A-Za-z0-9]+$/),
    conversationId: z.string().regex(/^[0-9]{1,30}$/),
};
const ofapiCommandMediaIdSchema = z.string().regex(/^(?:[0-9]{1,30}|ofapi_media_[A-Za-z0-9_-]{1,128})$/);
const ofapiCommandPriceSchema = z.number().int().min(0).max(200).refine((price) => price === 0 || price >= 3, { message: "Price must be 0 or an integer from 3 to 200" });
const sendMediaMessagePayloadSchema = z.strictObject({
    text: z.string().max(10_000),
    price: ofapiCommandPriceSchema,
    mediaFiles: z.array(ofapiCommandMediaIdSchema).min(1).max(50),
    previews: z.array(ofapiCommandMediaIdSchema).max(50),
}).superRefine((payload, ctx) => {
    const attached = new Set();
    for (const id of payload.mediaFiles) {
        if (attached.has(id)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["mediaFiles"],
                message: "mediaFiles must not contain duplicates",
            });
            break;
        }
        attached.add(id);
    }
    const previews = new Set();
    for (const id of payload.previews) {
        if (previews.has(id)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["previews"],
                message: "previews must not contain duplicates",
            });
            break;
        }
        previews.add(id);
        if (!attached.has(id)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["previews"],
                message: "previews must be a subset of mediaFiles",
            });
            break;
        }
    }
});
export const createOfapiCommandBodySchema = z.discriminatedUnion("kind", [
    z.strictObject({
        ...ofapiCommandBaseFields,
        kind: z.literal("send_text_message_v1"),
        payload: z.strictObject({
            text: z.string().min(1).max(10_000).refine((text) => text.trim().length > 0, {
                message: "Message text must not be blank",
            }),
        }),
        retryOfCommandId: z.string().uuid().nullable().optional(),
    }),
    z.strictObject({
        ...ofapiCommandBaseFields,
        kind: z.literal("send_media_message_v1"),
        payload: sendMediaMessagePayloadSchema,
        retryOfCommandId: z.string().uuid().nullable().optional(),
    }),
    z.strictObject({
        ...ofapiCommandBaseFields,
        kind: z.literal("typing_active_v1"),
        payload: z.strictObject({}),
        retryOfCommandId: z.null().optional(),
    }),
    z.strictObject({
        ...ofapiCommandBaseFields,
        kind: z.literal("unsend_message_v1"),
        payload: z.strictObject({
            messageId: z.string().regex(/^[0-9]{1,30}$/),
        }),
        retryOfCommandId: z.null().optional(),
    }),
    z.strictObject({
        ...ofapiCommandBaseFields,
        kind: z.literal("mark_chat_read_v1"),
        payload: z.strictObject({}),
        retryOfCommandId: z.null().optional(),
    }),
]);
export const ofapiCommandParamsSchema = z.object({
    commandId: z.string().uuid(),
});
export const ofapiCommandResponseSchema = z.object({
    commandId: z.string().uuid(),
    clientCommandId: z.string().uuid(),
    kind: ofapiCommandKindSchema,
    accountId: z.string(),
    conversationId: z.string(),
    state: ofapiCommandStateSchema,
    payloadHash: z.string().regex(/^[0-9a-f]{64}$/),
    retryOfCommandId: z.string().uuid().nullable(),
    attemptCount: z.number().int().min(0),
    lastErrorCode: z.string().nullable(),
    lastErrorClass: z.string().nullable(),
    verifierResult: z.record(z.string(), z.unknown()).nullable(),
    platformMessageId: z.string().nullable(),
    attemptStartedAt: isoTimestamp.nullable(),
    attemptFinishedAt: isoTimestamp.nullable(),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
    deduplicated: z.boolean(),
});
export const adminOfapiCreditsDailyQuerySchema = z.object({
    days: z.coerce.number().int().min(1).max(90).default(30),
});
export const ofapiCreditsDailyResponseSchema = z.object({
    days: z.array(z.object({
        day: businessDate,
        total: z.number().int(),
        bySource: ofapiCreditsSpendBySourceSchema,
    })),
    balance: z.array(z.object({
        at: isoTimestamp,
        value: z.number().int(),
    })),
    refills: z.array(z.object({
        at: isoTimestamp,
        credits: z.number().int(),
    })),
    byOperation: z.array(z.object({
        operation: z.string().nullable(),
        requests: z.number().int(),
        credits: z.number().int(),
    })),
    byPage: z.array(z.object({
        pageId: intId,
        pageLabel: z.string(),
        credits: z.number().int(),
        // Net creator earnings (mills) for this page over the same window, for
        // per-page cost-vs-revenue / ROI. Optional so a dashboard bundle can roll
        // forward/back across an API version that predates the revenue join.
        revenueMills: z.number().int().optional(),
    })),
});
export const adminOfapiCreditsLedgerQuerySchema = z.object({
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    source: ofapiCreditLedgerSourceEnum.optional(),
    pageId: z.coerce.number().int().positive().optional(),
    operation: z.string().min(1).optional(),
    from: isoTimestamp.optional(),
    to: isoTimestamp.optional(),
});
// CSV export reuses the ledger filters but drops pagination — the handler streams
// every matching row (up to an internal safety cap) as an accounting extract.
export const adminOfapiCreditsLedgerCsvQuerySchema = z.object({
    source: ofapiCreditLedgerSourceEnum.optional(),
    pageId: z.coerce.number().int().positive().optional(),
    operation: z.string().min(1).optional(),
    from: isoTimestamp.optional(),
    to: isoTimestamp.optional(),
});
export const ofapiCreditsLedgerResponseSchema = z.object({
    total: z.number().int(),
    pageOptions: z.array(z.object({
        pageId: intId,
        pageLabel: z.string(),
    })),
    rows: z.array(z.object({
        id: z.number().int(),
        occurredAt: isoTimestamp,
        source: ofapiCreditLedgerSourceEnum,
        operation: z.string().nullable(),
        pageId: intId.nullable(),
        pageLabel: z.string().nullable(),
        httpStatus: z.number().int().nullable(),
        credits: z.number().int(),
        estimated: z.boolean(),
        balanceAfter: z.number().int().nullable(),
        requestId: z.string().nullable(),
        accrualDay: businessDate.nullable(),
    })),
});
export const adminOfapiSpendComparisonQuerySchema = z.object({
    days: z.coerce.number().int().min(1).max(30).default(7),
    sampleLimit: z.coerce.number().int().min(1).max(100).default(25),
});
const ofapiSpendComparisonStatusEnum = z.enum([
    "matched",
    "missing_in_core_truth",
    "page_mismatch",
    "amount_mismatch",
    "fan_mismatch",
    "state_mismatch",
    "ppv_estimated",
    "tips_blocked",
    "tips_signal",
    "blocked",
    "skipped",
    "other",
]);
const ofapiSpendComparisonAggregateSchema = z.object({
    status: ofapiSpendComparisonStatusEnum,
    count: z.number().int().min(0),
    grossAmountMills: mills,
    creatorNetAmountMills: mills,
    coreGrossAmountMills: mills,
    coreCreatorNetAmountMills: mills,
});
export const ofapiSpendComparisonResponseSchema = z.object({
    generatedAt: isoTimestamp,
    window: z.object({
        from: isoTimestamp,
        to: isoTimestamp,
        days: z.number().int().min(1),
    }),
    summary: z.array(ofapiSpendComparisonAggregateSchema),
    byPage: z.array(ofapiSpendComparisonAggregateSchema.extend({
        pageId: intId,
        pageLabel: z.string(),
    })),
    samples: z.array(z.object({
        projectionId: z.number().int(),
        comparisonStatus: ofapiSpendComparisonStatusEnum,
        sourceEventType: z.string(),
        projectionStatus: z.string(),
        eventStatus: z.string().nullable(),
        blockedReason: z.string().nullable(),
        journalId: z.number().int(),
        pageId: intId,
        pageLabel: z.string(),
        fanPlatformUserId: z.string().nullable(),
        transactionId: z.string().nullable(),
        messageId: z.string().nullable(),
        occurredAt: isoTimestamp,
        grossAmountMills: mills.nullable(),
        creatorNetAmountMills: mills.nullable(),
        coreTransactionPk: z.number().int().nullable(),
        corePageId: intId.nullable(),
        coreFanPlatformUserId: z.string().nullable(),
        coreTransactionState: z.string().nullable(),
        coreOccurredAt: isoTimestamp.nullable(),
        coreGrossAmountMills: mills.nullable(),
        coreCreatorNetAmountMills: mills.nullable(),
    })),
    limitations: z.array(z.string()),
});
export const ofapiDmColdArchiveStatusResponseSchema = z.object({
    enabled: z.boolean(),
    retentionDays: z.number().int().min(1),
    rowCount: z.number().int().min(0),
    tombstoneCount: z.number().int().min(0),
    lastArchivedAt: isoTimestamp.nullable(),
    lastSourceReceivedAt: isoTimestamp.nullable(),
    nextPurgeAt: isoTimestamp.nullable(),
    archiveLagMs: z.number().int().min(0).nullable(),
    acl: z.literal("owner_admin_endpoint_only"),
    audit: z.literal("source_journal_metadata_on_each_row"),
    purgePolicy: z.literal("daily_retention_purge_by_retain_until"),
    exportPolicy: z.literal("no_raw_transcript_export_endpoint_yet"),
    mediaPolicy: z.literal("stable_metadata_only_no_signed_urls"),
});
// --- Declarative route authorization (kernel Stage 19) ---
// Every routeSchemas entry carries an `auth` declaration enforced by one API-server
// middleware (AUTH_POLICY_ENFORCEMENT=log|enforce); a contracts unit test fails any
// entry without one. Kinds mirror the verified guard vocabulary:
//   public         no principal required (health, login/logout)
//   hmac           authenticated in-handler by HMAC over the raw body (OFAPI webhook)
//   monitoring     x-monitoring-token OR a dashboard session (sync health)
//   session        cookie-session dashboard roles (owner/team_lead)
//   any-session    any live cookie session, any human role (self-serve auth)
//   owner-session  cookie session with the owner role (admin surface, swagger/openapi)
//   apiKey         bearer API key or device token (desktop/extension lanes)
//   device-token   device-token bearer only (current-device self-service)
//   any            any authenticated principal; finer scoping stays in the service
// scope:"page" = the middleware resolves params.pageLabel and requires canAccessPage
// before any handler runs; page ids derived from query/body stay handler-checked.
// `roles` is reserved for narrowing beyond the kind (unused today; Stage 22 adds
// device tokens additively).
export const routeAuthPolicySchema = z
    .object({
    kind: z.enum(["public", "hmac", "monitoring", "session", "any-session", "owner-session", "apiKey", "device-token", "pending-device-token", "any"]),
    roles: z.array(userRoleEnum).nonempty().optional(),
    scope: z.enum(["page", "none"]).optional(),
})
    .strict();
// OpenAPI `security` is DERIVED from the auth declaration (the swagger transform
// injects it), so the published contract can no longer disagree with what the
// middleware actually enforces. Scheme names match the server's securitySchemes.
export function routeSecurityFromAuth(auth) {
    switch (auth.kind) {
        case "public":
        case "hmac":
            // hmac authenticates by signature over the raw body, which OpenAPI's
            // security schemes cannot express; the webhook documents it in prose.
            return undefined;
        case "monitoring":
            return [{ cookieAuth: [] }, { monitoringTokenAuth: [] }];
        case "session":
        case "any-session":
        case "owner-session":
            return [{ cookieAuth: [] }];
        case "apiKey":
        case "device-token":
        case "pending-device-token":
            return [{ bearerAuth: [] }];
        case "any":
            return [{ cookieAuth: [] }, { bearerAuth: [] }];
    }
}
// --- Configuration surface (Stage A: read-only) ---
const configValueScalar = z.union([z.string(), z.number(), z.boolean()]).nullable();
export const configRunningValueSchema = z.object({
    role: z.string(),
    instanceId: z.string(),
    value: configValueScalar,
    masked: z.boolean(),
    // "unknown" = this instance reported under an older/mismatched snapshot shape, so its
    // value can't be trusted; the row is surfaced (not silently dropped) and counts as
    // not-yet-applied for pendingApply.
    state: z.enum(["set", "unset", "unknown"]).nullable(),
    lastSeenAt: isoTimestamp,
});
// A boot-apply override an instance rejected at start (invalid value / not a boot key /
// would break a merged invariant). Surfaced per instance so an ignored override is
// visible rather than silent.
export const configSkippedOverrideSchema = z.object({
    key: z.string(),
    reason: z.string(),
});
export const configItemSchema = z.object({
    key: z.string(),
    envName: z.string(),
    configField: z.string().nullable(),
    kind: z.enum(["boolean", "number", "string", "url", "secret", "derived", "alias", "complex"]),
    subsystem: z.string(),
    label: z.string(),
    default: z.string(),
    editability: z.enum(["never", "staged", "editable"]),
    // Authoritative wiring class (replaces applyMode): 'live' = wired to the runtime
    // overlay (no restart); 'boot' = applied at process start (needs restart); 'none' =
    // not overridable via the DB (env-only / read-only). Orthogonal to `editability`.
    runtimeApply: z.enum(["live", "boot", "none"]),
    comparable: z.boolean(),
    secret: z.boolean(),
    note: z.string().nullable(),
    costWarning: z.string().nullable(),
    destructive: z.boolean(),
    stagedGroup: z.string().nullable(),
    stagedOrder: z.number().int().nullable(),
    requires: z.array(z.string()),
    // Effective-state fields. In Stage A there is no overlay, so source is always
    // "env", desired is null and pendingApply is false; the running array carries
    // each live process's actual value and drift flags cross-instance disagreement.
    source: z.enum(["env", "override"]),
    desired: configValueScalar,
    // SERVER-computed APPLIED truth (Stage C) — the single source for the staged UI's
    // lock/Enable-Disable decision, so the client never reconstructs it. For a boot key it is
    // getRunningFlagState (role-complete + fail-closed: every expected role must have an active
    // instance and report the key true to read "on", else "off"; "unknown" when it can't be
    // proven, e.g. no fleet / a missing role / a stale snapshot). For a non-boot key it summarizes
    // the active instances' reported values (all-true → "on", any non-true → "off", none → "unknown").
    runningState: z.enum(["on", "off", "unknown"]),
    // SERVER-computed desired baseline (Stage C): the override boolean when one exists, else the
    // env (rawConfig) boolean; null for keys with no boolean meaning (non-boolean / non-overridable).
    // The staged UI's Enable/Disable + dependent locks read THIS, never a client recomputation.
    desiredEffective: z.boolean().nullable(),
    // Current version of the override row (null when env-sourced); the editor sends it
    // back as expectedVersion for optimistic-concurrency.
    overrideVersion: z.number().int().nullable(),
    pendingApply: z.boolean(),
    drift: z.boolean(),
    // True when this editable key is wired to take effect at runtime now (Stage B1).
    // Only `live` editable keys can be PATCHed and actually applied without a restart.
    live: z.boolean(),
    running: z.array(configRunningValueSchema),
});
export const configInstanceSchema = z.object({
    role: z.string(),
    instanceId: z.string(),
    startedAt: isoTimestamp,
    lastSeenAt: isoTimestamp,
    imageTag: z.string().nullable(),
    status: z.enum(["active", "stale"]),
    // Boot-apply overrides this instance rejected at start. Empty for a clean boot, and
    // empty for an instance reporting an older snapshot shape (no skip data available).
    skippedOverrides: z.array(configSkippedOverrideSchema),
});
// Per expected role (plus any unexpected observed role): whether a live process is
// reporting. "stale" = a row exists but is past the heartbeat window; "missing" =
// no row at all. Surfaces a stopped process instead of silently dropping it.
export const configRoleStatusSchema = z.object({
    role: z.string(),
    status: z.enum(["active", "stale", "missing"]),
});
export const configViewResponseSchema = z.object({
    generatedAt: isoTimestamp,
    roleStatuses: z.array(configRoleStatusSchema),
    instances: z.array(configInstanceSchema),
    subsystems: z.array(z.object({
        subsystem: z.string(),
        items: z.array(configItemSchema),
    })),
});
// --- Configuration surface (Stage B1: editable, owner-only) ---
// A single override value is one of the three scalar kinds an editable descriptor
// can hold; the server re-validates and clamps it against the registry.
const configOverrideValueSchema = z.union([z.string(), z.number(), z.boolean()]);
// Audit notes are operator-supplied free text persisted into config_audit_log (append-only,
// one row per key in a patch). Bound them so a write can't persist megabyte-sized notes into
// the audit trail (mirrors the audit P-3 cap on the login fields).
const CONFIG_NOTE_MAX_LEN = 1024;
export const configUpdateBodySchema = z.object({
    patches: z
        .array(z.object({
        key: z.string(),
        value: configOverrideValueSchema,
        // Optimistic concurrency: when present it must match the row's current
        // version (0 for a brand-new key) or the write is a 409 conflict. Intentionally
        // OPTIONAL on the live path (opt-in, last-write-wins for owner-only low-stakes knobs);
        // the staged path makes it MANDATORY since staged flips are higher-stakes.
        expectedVersion: z.number().int().min(0).optional(),
    }))
        .min(1),
    note: z.string().max(CONFIG_NOTE_MAX_LEN).optional(),
});
export const configUpdateResponseSchema = z.object({
    // The CLAMPED, stored value per key so the UI can correct an out-of-range entry.
    results: z.array(z.object({
        key: z.string(),
        value: configOverrideValueSchema,
        version: z.number().int(),
    })),
});
export const configClearParamsSchema = z.object({
    key: z.string(),
});
// Query params (not a body) so DELETE needs no request body — both fields optional.
export const configClearQuerySchema = z.object({
    expectedVersion: z.coerce.number().int().min(0).optional(),
    note: z.string().max(CONFIG_NOTE_MAX_LEN).optional(),
});
export const configClearResponseSchema = z.object({
    ok: z.literal(true),
    key: z.string(),
});
// --- Staged-rollout flips (Stage C: boot-applied flag set, owner-only) ---
// A staged flip writes an explicit boolean override for a `runtimeApply === 'boot'`
// key in the prescribed enable order, OR reverts it to env (`desired: null` → clears the
// override row). Unlike the live PATCH, expectedVersion is MANDATORY (a staged flip is
// always version-checked: 0 means "no row yet"), and an explicit `ack` records the
// operator's acknowledgement that the flag only takes effect after a restart — persisted
// into the audit note, not just the UI.
export const configStagedBodySchema = z.object({
    patches: z
        .array(z.object({
        key: z.string(),
        // boolean = set the desired value; null = revert to env (clear the override). A
        // null patch is validated as the env baseline boolean but applied as a clear.
        desired: z.boolean().nullable(),
        // Required (not optional): staged flips are always version-checked. 0 = the
        // override row is absent; a mismatch is a 409 conflict.
        expectedVersion: z.number().int().min(0),
    }))
        .min(1),
    note: z.string().max(CONFIG_NOTE_MAX_LEN).optional(),
    // Must be true; the handler rejects ack:false (400) and stores it in the audit note.
    ack: z.boolean(),
});
export const configStagedResponseSchema = z.object({
    results: z.array(z.object({
        key: z.string(),
        // boolean for an upsert; null for a cleared key (reverted to env).
        value: z.boolean().nullable(),
        version: z.number().int().nullable(),
    })),
});
export const opsMetricsResponseSchema = z.object({
    samples: z.array(z.object({
        metric: z.string(),
        quantile: z.string(),
        valueMs: z.number().int(),
        sampledAt: isoTimestamp,
    })),
    thresholdsMs: z.record(z.string(), z.number().int()),
    smoke: z.object({
        framesSeen: z.number().int(),
        gapCount: z.number().int(),
        duplicateCount: z.number().int(),
        updatedAt: isoTimestamp.nullable(),
    }).nullable(),
});
export const routeSchemas = {
    health: {
        auth: { kind: "public" },
        tags: ["system"],
        summary: "Health check",
        response: {
            200: healthResponseSchema,
            503: healthResponseSchema,
        },
    },
    opsMetrics: {
        auth: { kind: "monitoring" },
        tags: ["system"],
        summary: "Golden-signal lag samples (Stage 25 acceptance instrument)",
        response: {
            200: opsMetricsResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    healthSync: {
        auth: { kind: "monitoring" },
        tags: ["system"],
        summary: "Detailed sync health",
        response: {
            200: syncHealthResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            503: syncHealthResponseSchema,
        },
    },
    login: {
        auth: { kind: "public" },
        tags: ["auth"],
        summary: "Log in with a dashboard account",
        body: loginBodySchema,
        response: {
            200: authStateSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            429: errorResponseSchema,
        },
    },
    logout: {
        auth: { kind: "public" },
        tags: ["auth"],
        summary: "Clear the current session cookie if one is present",
        response: {
            200: z.object({ ok: z.literal(true) }),
        },
    },
    me: {
        auth: { kind: "any" },
        tags: ["auth"],
        summary: "Get the current authenticated principal",
        response: {
            200: authStateSchema,
            401: errorResponseSchema,
        },
    },
    aiUsageBatch: {
        auth: { kind: "apiKey" },
        tags: ["usage"],
        // Stage 29 (§6.4 policy): the gateway ledger is authoritative — this
        // client-reported lane is deprecated; successor = the gateway's own
        // finalize write (POST /api/v1/ai/gateway/stream). Removal only after
        // Stage 31 confirms the fleet cutover. It keeps serving until then.
        deprecated: true,
        summary: "Ingest a batch of chatter AI usage events (deprecated: gateway ledger is authoritative)",
        body: aiUsageBatchBodySchema,
        response: {
            200: aiUsageBatchResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    ingestObservations: {
        auth: { kind: "apiKey" },
        tags: ["usage"],
        summary: "Ingest a batch of desktop-captured observations (client-capture lane)",
        body: ingestObservationsBodySchema,
        response: {
            200: ingestObservationsResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    aiGatewayStream: {
        auth: { kind: "apiKey" },
        tags: ["usage"],
        summary: "Stream a chatter AI generation through the core gateway",
        description: "Default-off ChatMuse gateway for desktop AI generations. The runtime route "
            + "uses chatter API-key auth, validates the prompt-stream request contract, and must not "
            + "reach provider network while the gateway flag is disabled.",
        body: aiGatewayStreamBodySchema,
        response: {
            200: z.unknown(),
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
            429: errorResponseSchema,
            503: errorResponseSchema,
        },
    },
    ofapiWebhookReceive: {
        auth: { kind: "hmac" },
        tags: ["ofapi"],
        summary: "Receive an OFAPI webhook delivery",
        description: "Called by onlyfansapi.com, not by API clients. Authenticated by "
            + "HMAC-SHA256 of the raw request body (hex, `signature` header) against the "
            + "registered signing secret; deduplicated by the `x-ofapi-idempotency-key` "
            + "header. The body is the OFAPI envelope {event, account_id, payload} and is "
            + "intentionally not schema-validated before signature verification.",
        response: {
            200: ofapiWebhookAckResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            503: errorResponseSchema,
        },
    },
    eventsStream: {
        auth: { kind: "apiKey" },
        tags: ["events"],
        summary: "SSE stream of sync events for the chatter's assigned pages",
        description: "`text/event-stream` of SyncEvent frames (`event: sync`, `data` = "
            + "JSON SyncEvent, `id` = journal event id). Chatter API-key auth only; events "
            + "are filtered to the chatter's assigned pages. Supports `Last-Event-ID` "
            + "header (or `lastEventId` query parameter) replay from the ~7-day journal.",
        querystring: z.object({
            lastEventId: z.coerce.number().int().nonnegative().optional(),
        }),
        response: {
            // The handler hijacks the reply and writes text/event-stream directly;
            // this entry documents the success shape for OpenAPI consumers only.
            200: z.string().describe("text/event-stream — `event: sync` frames whose `data` is a JSON SyncEvent "
                + "(see syncEventSchema) and whose `id` is the journal fanout sequence."),
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            409: syncSnapshotRequiredResponseSchema,
        },
    },
    eventsSnapshot: {
        auth: { kind: "apiKey" },
        tags: ["events"],
        summary: "Current durable sync state for replay-gap recovery",
        description: "Chatter-key scoped snapshot for one assigned OFAPI account. The legacy "
            + "pageCursor mode paginates threads. Additive pageMode=bounded_v1 uses an opaque, "
            + "scope-bound stateCursor to page unresolved tombstones and per-thread messages "
            + "with messageLimit<=200; clients apply every page idempotently and persist "
            + "snapshotCursor only after nextStateCursor=null. No message is truncated and no "
            + "OFAPI request or historical DM backfill is performed.",
        querystring: syncSnapshotQuerySchema,
        response: {
            200: syncSnapshotResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: syncSnapshotRestartRequiredResponseSchema,
        },
    },
    eventsV2Stream: {
        auth: { kind: "any" },
        tags: ["events"],
        summary: "SSE stream of canonical domain events (v2) for granted accounts",
        description: "`text/event-stream` of DomainEventFrame rows (`event: domain`, `data` = "
            + "JSON frame, `id` = the OPAQUE resume cursor — pass it back verbatim via "
            + "`Last-Event-ID` or `cursor`). Per-account gapless ordering; all platforms. "
            + "A cursor below an account's retained floor (or ahead of its head) answers "
            + "409 sync_snapshot_required with the per-account detail.",
        querystring: z.object({
            cursor: z.string().optional(),
        }),
        response: {
            200: z.string().describe("text/event-stream — `event: domain` frames (see domainEventFrameSchema); "
                + "`id` is the opaque v2 cursor."),
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            409: domainEventsSnapshotRequiredResponseSchema,
        },
    },
    eventsV2Snapshot: {
        auth: { kind: "any" },
        tags: ["events"],
        summary: "Fresh v2 cursor (and per-account heads) for cold start or gap recovery",
        description: "Returns the current per-account high-water cursor for the requested "
            + "accounts (comma-separated ids; omitted = every granted account), including "
            + "the platform-native accountRef needed for each durable OFAPI state walk. An "
            + "omitted-accounts cursor is bound to that exact grant keyset: reconnect returns "
            + "409 rather than widening a stale cursor at a newly granted account's head. "
            + "Gap-recovery callers pass the rejected opaque sourceCursor so already-applied "
            + "history is not replayed again; Core also advances past erased sequence holes. "
            + "State payloads ride the consumer stages (24/33) additively — v2's snapshot "
            + "role here is the cursor-reset handshake.",
        querystring: z.object({
            accounts: z.string().regex(/^\d+(,\d+)*$/).optional(),
            // Rejected resume cursor whose already-applied watermarks bound replay
            // after the caller completes the durable per-account state walk.
            sourceCursor: z.string().min(1).optional(),
        }),
        response: {
            200: domainEventsSnapshotResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    adminOfapiWebhookStatus: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Current OFAPI webhook registration and page mappings",
        response: {
            200: ofapiWebhookStatusResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    adminOfapiWebhookRegister: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Register (or re-register) the OFAPI webhook and auto-map accounts to pages",
        description: "Creates/updates the team webhook at onlyfansapi.com with "
            + "account_scope=global and a freshly generated signing secret, stores the "
            + "registration, and maps OFAPI accounts to OnlyFans pages by username.",
        body: ofapiWebhookRegisterBodySchema,
        response: {
            200: ofapiWebhookRegisterResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            503: errorResponseSchema,
        },
    },
    ofapiCreditsChatterSummary: {
        auth: { kind: "apiKey" },
        tags: ["ofapi"],
        summary: "Get page-scoped OFAPI credit spend visible to the authenticated chatter",
        description: "Bearer chatter-key endpoint for desktop clients. It reports REST spend "
            + "attributed to the chatter's assigned pages and a webhook credit estimate derived "
            + "from journaled events for those pages. It intentionally omits owner-only global "
            + "balance, refills, external drift, and adjustments.",
        response: {
            200: ofapiCreditsChatterSummaryResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    ofapiReadGateway: {
        auth: { kind: "apiKey" },
        tags: ["ofapi"],
        summary: "Read an allowlisted OFAPI resource through the core custody boundary",
        description: "Chatter-key-only, page-scoped compatibility gateway mounted at "
            + "`/api/v1/ofapi/read`. It preserves the desktop OFAPI GET paths and JSON "
            + "shapes, but accepts only the documented desktop read allowlist. `/accounts` "
            + "is synthesized from assigned core page mappings and `/whoami` is sanitized. "
            + "No POST, DELETE, send, mark-read, typing, or upload operation is exposed.",
        params: ofapiReadGatewayParamsSchema,
        response: {
            200: z.unknown(),
            400: z.unknown(),
            401: z.unknown(),
            402: z.unknown(),
            403: z.unknown(),
            404: z.unknown(),
            429: z.unknown(),
            422: z.unknown(),
            500: z.unknown(),
            502: z.unknown(),
            503: z.unknown(),
            504: z.unknown(),
        },
    },
    createOfapiCommand: {
        auth: { kind: "apiKey" },
        tags: ["ofapi"],
        summary: "Create or deduplicate a desktop OFAPI command",
        description: "Chatter-key-only C6b command intake. The command boundary accepts "
            + "narrow versioned desktop writes and persists them as queued outbox rows. Exact "
            + "client-id replays return the existing row; payload mismatches return 409.",
        body: createOfapiCommandBodySchema,
        response: {
            200: ofapiCommandResponseSchema,
            202: ofapiCommandResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
            503: errorResponseSchema,
        },
    },
    getOfapiCommand: {
        auth: { kind: "apiKey" },
        tags: ["ofapi"],
        summary: "Get one owned desktop OFAPI command",
        description: "Returns command state and audit metadata without echoing message text.",
        params: ofapiCommandParamsSchema,
        response: {
            200: ofapiCommandResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            503: errorResponseSchema,
        },
    },
    cancelOfapiCommand: {
        auth: { kind: "apiKey" },
        tags: ["ofapi"],
        summary: "Cancel one queued desktop OFAPI command",
        description: "Transitions only queued commands to cancelled. Repeating cancel on an "
            + "already-cancelled command is idempotent; no vendor call is made.",
        params: ofapiCommandParamsSchema,
        response: {
            200: ofapiCommandResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
            503: errorResponseSchema,
        },
    },
    adminOfapiCreditsSummary: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Get the OFAPI credit balance, budgets, forecast, and ops state",
        response: {
            200: ofapiCreditsSummaryResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    adminOfapiCreditsDaily: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Get per-day OFAPI credit spend by source plus balance/refill series",
        querystring: adminOfapiCreditsDailyQuerySchema,
        response: {
            200: ofapiCreditsDailyResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    adminOfapiCreditsLedger: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "List OFAPI credit ledger rows with filters and pagination",
        querystring: adminOfapiCreditsLedgerQuerySchema,
        response: {
            200: ofapiCreditsLedgerResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    adminOfapiCreditsLedgerCsv: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Export the filtered OFAPI credit ledger as a CSV accounting extract",
        querystring: adminOfapiCreditsLedgerCsvQuerySchema,
        response: {
            // The handler sets text/csv + Content-Disposition and writes the body
            // directly; server OpenAPI generation rewrites this success media type to
            // text/csv because the Zod Fastify transformer only accepts Zod schemas here.
            200: z.string().describe("CSV — one row per credit ledger entry matching the filters"),
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    adminOfapiSpendComparison: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Compare OFAPI spend shadow projection rows against core transaction truth",
        description: "Read-only C3/D6 gate endpoint. It does not write transactions or revenue; "
            + "it classifies shadow rows as matched, missing, or mismatched against the current "
            + "core transactions table so production equivalence can be proven before desktop "
            + "spend polling is reduced.",
        querystring: adminOfapiSpendComparisonQuerySchema,
        response: {
            200: ofapiSpendComparisonResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    adminOfapiDmColdArchiveStatus: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Get OFAPI DM cold archive status and governance policy markers",
        description: "Read-only C4 gate endpoint. It exposes the forward-only archive flag, "
            + "retention window, lag/count metrics, and the current ACL/audit/purge/export/media "
            + "policy markers. It does not expose raw transcript text.",
        response: {
            200: ofapiDmColdArchiveStatusResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    pages: {
        auth: { kind: "any" },
        tags: ["pages"],
        summary: "List visible pages",
        response: {
            200: z.array(assignedPageSchema),
            401: errorResponseSchema,
        },
    },
    models: {
        auth: { kind: "session" },
        tags: ["models"],
        summary: "List visible models",
        response: {
            200: z.array(modelListItemSchema),
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    overviewRevenue: {
        auth: { kind: "session" },
        tags: ["revenue"],
        summary: "Get agency or visible-scope revenue overview",
        querystring: revenueQuerySchema,
        response: {
            200: overviewRevenueResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    overviewGrowth: {
        auth: { kind: "session" },
        tags: ["dashboard"],
        summary: "Get period-aware follower and subscriber growth",
        querystring: revenueQuerySchema,
        response: {
            200: overviewGrowthResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    modelRevenue: {
        auth: { kind: "session" },
        tags: ["revenue"],
        summary: "Get revenue for one model",
        params: modelParamsSchema,
        querystring: revenueQuerySchema,
        response: {
            200: modelRevenueResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    pageRevenue: {
        auth: { kind: "session", scope: "page" },
        tags: ["revenue"],
        summary: "Get revenue for one page",
        params: pageParamsSchema,
        querystring: revenueQuerySchema,
        response: {
            200: pageRevenueResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    pageTransactions: {
        auth: { kind: "session", scope: "page" },
        tags: ["transactions"],
        summary: "List transactions for one page",
        params: pageParamsSchema,
        querystring: transactionListQuerySchema,
        response: {
            200: transactionListResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    pageSubscribers: {
        auth: { kind: "any", scope: "page" },
        tags: ["subscribers"],
        summary: "List current subscribers for one page",
        params: pageParamsSchema,
        querystring: subscriberListQuerySchema,
        response: {
            200: subscriberListResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    pageSubscribersDaily: {
        auth: { kind: "any", scope: "page" },
        tags: ["subscribers"],
        summary: "List daily subscriber rollups for one page",
        params: pageParamsSchema,
        querystring: revenueQuerySchema,
        response: {
            200: subscriberDailyResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    pageFollowers: {
        auth: { kind: "any", scope: "page" },
        tags: ["followers"],
        summary: "List active followers for one page",
        params: pageParamsSchema,
        querystring: followerListQuerySchema,
        response: {
            200: followerListResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    pageFollowersDaily: {
        auth: { kind: "any", scope: "page" },
        tags: ["followers"],
        summary: "List daily follower rollups for one page",
        params: pageParamsSchema,
        querystring: revenueQuerySchema,
        response: {
            200: followerDailyResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    pageFans: {
        auth: { kind: "any", scope: "page" },
        tags: ["fans"],
        summary: "List fans for one page",
        params: pageParamsSchema,
        querystring: fanListQuerySchema,
        response: {
            200: fanListResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    pageTopSpenders: {
        auth: { kind: "any", scope: "page" },
        tags: ["fans"],
        summary: "Top spenders for one page from the fan-earnings projection (Stage 32 board)",
        params: pageParamsSchema,
        querystring: z.object({
            // 'lifetime' or a month window ('2026-06') — the projection's window values.
            window: z.string().regex(/^(lifetime|\d{4}-\d{2})$/).default("lifetime"),
            limit: z.coerce.number().int().min(1).max(1000).default(150),
        }),
        response: {
            200: z.object({
                window: z.string(),
                /** Freshest observed_at in the window (null = projection empty for this page). */
                builtAt: z.string().nullable(),
                /** Spenders with gross > 0 in this window (entries may be a bounded subset). */
                fanCount: z.number().int().nonnegative(),
                /** W8.1 (A12/A20): why the projection is (or is not) being fed — a
                 * `builtAt: null` response is no longer ambiguous between "no
                 * spenders" and "stream not ramped for this page". Additive. */
                source: z.object({
                    streamState: z.enum(["ramped", "flag_off", "not_allowlisted", "unsupported_platform"]),
                    /** fan_earnings stream's last successful sync for this page. */
                    lastSyncedAt: z.string().nullable(),
                    /** null = the page has no fan_earnings sync state row yet. */
                    consecutiveFailures: z.number().int().nullable(),
                }),
                entries: z.array(z.object({
                    platformUserId: z.string(),
                    username: z.string().nullable(),
                    displayName: z.string().nullable(),
                    grossMills: z.number().int().nonnegative(),
                    netMills: z.number().int().nullable(),
                    currency: z.string(),
                    observedAt: z.string(),
                })),
            }),
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    pageDeletedFans: {
        auth: { kind: "any", scope: "page" },
        tags: ["fans"],
        summary: "List deleted fans for one page",
        params: pageParamsSchema,
        querystring: paginationQuerySchema,
        response: {
            200: pageDeletedFansResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    pageSpenderAutoLists: {
        auth: { kind: "any", scope: "page" },
        tags: ["spenders"],
        summary: "List spender auto-list buckets for one page",
        params: pageParamsSchema,
        querystring: pageSpenderAutoListsQuerySchema,
        response: {
            200: pageSpenderAutoListsResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    pageSpenderAutoListDetail: {
        auth: { kind: "any", scope: "page" },
        tags: ["spenders"],
        summary: "List fans inside one spender auto-list bucket",
        params: pageSpenderAutoListParamsSchema,
        querystring: pageSpenderAutoListQuerySchema,
        response: {
            200: pageSpenderAutoListDetailResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    pageFanDetail: {
        auth: { kind: "any", scope: "page" },
        tags: ["fans"],
        summary: "Get one fan within one page",
        params: pageFanParamsSchema,
        response: {
            200: pageFanDetailResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    pageFanProfile: {
        auth: { kind: "any", scope: "page" },
        tags: ["fans"],
        summary: "Get the latest intelligence profile for one fan on one page",
        params: pageFanParamsSchema,
        response: {
            200: fanProfileResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    pageConversationProfile: {
        auth: { kind: "any", scope: "page" },
        tags: ["fans"],
        summary: "Get the latest intelligence profile for the fan mapped to one page conversation",
        params: pageConversationProfileParamsSchema,
        response: {
            200: fanProfileResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    upsertFanProfile: {
        auth: { kind: "any", scope: "page" },
        tags: ["fans"],
        summary: "Append a new intelligence profile version for one fan on one page",
        params: pageFanParamsSchema,
        body: upsertFanProfileBodySchema,
        response: {
            200: fanProfileDocumentSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    pageFanProfileVersions: {
        auth: { kind: "any", scope: "page" },
        tags: ["fans"],
        summary: "List intelligence profile versions for one fan on one page",
        params: pageFanParamsSchema,
        response: {
            200: fanProfileVersionListResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    pageFanProfileVersion: {
        auth: { kind: "any", scope: "page" },
        tags: ["fans"],
        summary: "Get one intelligence profile version for one fan on one page",
        params: fanProfileVersionParamsSchema,
        response: {
            200: fanProfileDocumentSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    crossPageFanDetail: {
        auth: { kind: "session" },
        tags: ["fans"],
        summary: "Get one fan across visible pages",
        params: fanLookupParamsSchema,
        response: {
            200: crossPageFanDetailResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    spenders: {
        auth: { kind: "any" },
        tags: ["spenders"],
        summary: "List ranked spenders for a scoped platform view",
        querystring: spenderListQuerySchema,
        response: {
            200: spenderListResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    spenderDetail: {
        auth: { kind: "any" },
        tags: ["spenders"],
        summary: "Get one platform-scoped spender",
        params: fanLookupParamsSchema,
        querystring: spenderDetailQuerySchema,
        response: {
            200: spenderDetailResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    spenderSeries: {
        auth: { kind: "session" },
        tags: ["spenders"],
        summary: "Get zero-filled spender trend series",
        params: fanLookupParamsSchema,
        querystring: spenderSeriesQuerySchema,
        response: {
            200: spenderSeriesResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    spenderBatch: {
        auth: { kind: "any" },
        tags: ["spenders"],
        summary: "Batch-resolve spender metrics for platform-scoped fan identities",
        body: spenderBatchBodySchema,
        response: {
            200: spenderBatchResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    fansSearch: {
        auth: { kind: "any" },
        tags: ["fans"],
        summary: "Search visible platform-scoped fan identities",
        querystring: fansSearchQuerySchema,
        response: {
            200: fansSearchResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    pageConversationPreview: {
        auth: { kind: "session", scope: "page" },
        tags: ["conversations"],
        summary: "Return locally cached DM preview rows for one conversation",
        params: pageConversationPreviewParamsSchema,
        querystring: pageConversationPreviewQuerySchema,
        response: {
            200: pageConversationPreviewResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    pageConversationMessages: {
        auth: { kind: "session", scope: "page" },
        tags: ["conversations"],
        summary: "Return cached DM messages for one conversation",
        params: pageConversationMessagesParamsSchema,
        querystring: pageConversationMessagesQuerySchema,
        response: {
            200: pageConversationMessagesResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    // --- Workboard ---
    workboardV2: {
        auth: { kind: "session", scope: "page" },
        tags: ["workboard"],
        summary: "Get a Workboard v2 tab queue (priority engine) for one page",
        params: pageParamsSchema,
        querystring: workboardV2QuerySchema,
        response: {
            200: workboardV2ResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    workboardV2Lists: {
        auth: { kind: "session", scope: "page" },
        tags: ["workboard"],
        summary: "Get Workboard v2 spender lists (lifetime gross-spend bands) for one page",
        params: pageParamsSchema,
        response: {
            200: workboardV2ListsResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    workboardV2Contact: {
        auth: { kind: "session", scope: "page" },
        tags: ["workboard"],
        summary: "Record a chatter touch (Готово) on a Workboard v2 fan",
        params: pageParamsSchema,
        body: workboardV2ContactBodySchema,
        response: {
            200: workboardV2ContactResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    workboardV2Recompute: {
        auth: { kind: "session", scope: "page" },
        tags: ["workboard"],
        summary: "Recompute the Workboard v2 queue for one page (on-demand)",
        params: pageParamsSchema,
        response: {
            200: workboardV2RecomputeResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    workboardV2Snooze: {
        auth: { kind: "session", scope: "page" },
        tags: ["workboard"],
        summary: "Snooze a fan on Workboard v2 (moves to Service; re-evaluates instantly)",
        params: pageParamsSchema,
        body: workboardV2SnoozeBodySchema,
        response: {
            200: workboardV2SnoozeResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    workboardV2Unsnooze: {
        auth: { kind: "session", scope: "page" },
        tags: ["workboard"],
        summary: "Unsnooze a fan on Workboard v2 (re-evaluates instantly)",
        params: workboardV2FanParamsSchema,
        response: {
            200: workboardV2OkResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    workboardV2UndoContact: {
        auth: { kind: "session", scope: "page" },
        tags: ["workboard"],
        summary: "Undo the last Готово touch for a fan (re-evaluates instantly)",
        params: workboardV2FanParamsSchema,
        response: {
            200: workboardV2OkResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    workboardV2Claim: {
        auth: { kind: "any-session", scope: "page" },
        tags: ["workboard"],
        summary: "Claim a fan (soft coordination lease, TTL'd, non-blocking)",
        params: pageParamsSchema,
        body: z.object({
            fanId: intId,
            ttlMinutes: z.number().int().min(1).max(240).optional(),
        }),
        response: {
            200: z.object({ ok: z.literal(true), fanId: intId, expiresAt: isoTimestamp }),
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    workboardV2Unclaim: {
        auth: { kind: "any-session", scope: "page" },
        tags: ["workboard"],
        summary: "Release a fan claim",
        params: z.object({ pageLabel: z.string().min(1), fanId: z.coerce.number().int().positive() }),
        response: {
            200: z.object({ ok: z.literal(true), fanId: intId }),
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    workboardV2Ai: {
        auth: { kind: "owner-session", scope: "page" },
        tags: ["workboard"],
        summary: "AI (L2 closing classifier) analytics + settings for a page",
        params: pageParamsSchema,
        response: {
            200: workboardV2AiReportSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    workboardV2AiSettings: {
        auth: { kind: "owner-session", scope: "page" },
        tags: ["workboard"],
        summary: "Update per-page AI classifier settings (owner only)",
        params: pageParamsSchema,
        body: workboardV2AiSettingsBodySchema,
        response: {
            200: workboardV2AiReportSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    workboardV2AiClassify: {
        auth: { kind: "owner-session", scope: "page" },
        tags: ["workboard"],
        summary: "Run (or re-run) the AI classifier for a page now (owner only)",
        params: pageParamsSchema,
        body: workboardV2AiClassifyBodySchema,
        response: {
            200: workboardV2AiClassifyResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    workboardV2AiRuns: {
        auth: { kind: "owner-session" },
        tags: ["workboard"],
        summary: "Global AI classifier run log (owner only)",
        response: {
            200: workboardV2AiRunsResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    // --- Phase 4: Dashboard routes ---
    overview: {
        auth: { kind: "session" },
        tags: ["dashboard"],
        summary: "Get agency overview dashboard data",
        response: {
            200: overviewResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    syncStatus: {
        auth: { kind: "session" },
        tags: ["dashboard"],
        summary: "Get aggregated sync monitor data for visible pages",
        querystring: syncStatusQuerySchema,
        response: {
            200: syncStatusResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    syncRequests: {
        auth: { kind: "session" },
        tags: ["dashboard"],
        summary: "Get recent visible sync worker HTTP requests",
        querystring: syncRequestsQuerySchema,
        response: {
            200: syncRequestsResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    syncOverview: {
        auth: { kind: "session" },
        tags: ["dashboard"],
        summary: "Get the 6-block sync overview for visible pages",
        response: {
            200: syncOverviewResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    pageSyncBlocks: {
        auth: { kind: "any", scope: "page" },
        tags: ["dashboard"],
        summary: "Get all sync blocks for one visible page",
        params: pageSyncBlocksParamsSchema,
        response: {
            200: pageSyncBlocksResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    pageMessagesBlock: {
        auth: { kind: "any", scope: "page" },
        tags: ["dashboard"],
        summary: "Get the combined Messages sync block for one visible page",
        params: pageSyncBlocksParamsSchema,
        response: {
            200: pageMessagesBlockResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    overviewRevenueDaily: {
        auth: { kind: "session" },
        tags: ["dashboard"],
        summary: "Get agency-wide revenue daily series",
        querystring: revenueDailyQuerySchema,
        response: {
            200: revenueDailyResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    overviewRevenueByModel: {
        auth: { kind: "session" },
        tags: ["dashboard"],
        summary: "Get per-model revenue totals and daily series",
        querystring: revenueByModelQuerySchema,
        response: {
            200: revenueByModelResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    pageRevenueDaily: {
        auth: { kind: "session", scope: "page" },
        tags: ["dashboard"],
        summary: "Get daily revenue series for one page",
        params: pageParamsSchema,
        querystring: revenueDailyQuerySchema,
        response: {
            200: revenueDailyResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    modelRevenueDaily: {
        auth: { kind: "session" },
        tags: ["dashboard"],
        summary: "Get daily revenue series for one model",
        params: modelParamsSchema,
        querystring: revenueDailyQuerySchema,
        response: {
            200: revenueDailyResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    crossPageTransactions: {
        auth: { kind: "session" },
        tags: ["transactions"],
        summary: "List transactions across all visible pages",
        querystring: crossPageTransactionListQuerySchema,
        response: {
            200: crossPageTransactionListResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    pageFanTransactions: {
        auth: { kind: "session", scope: "page" },
        tags: ["fans"],
        summary: "Get fan transaction history on a specific page",
        params: pageFanParamsSchema,
        querystring: paginationQuerySchema,
        response: {
            200: fanTransactionListResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    crossPageFanTransactions: {
        auth: { kind: "session" },
        tags: ["fans"],
        summary: "Get cross-page fan transaction history",
        params: fanLookupParamsSchema,
        querystring: paginationQuerySchema,
        response: {
            200: crossPageFanTransactionListResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    createFanNote: {
        auth: { kind: "any", scope: "page" },
        tags: ["fans"],
        summary: "Create a note on a fan for a specific page",
        params: pageFanParamsSchema,
        body: createFanNoteBodySchema,
        response: {
            200: fanNoteResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    setFanFlags: {
        auth: { kind: "owner-session" },
        tags: ["fans"],
        summary: "Set flags on a fan",
        params: fanLookupParamsSchema,
        body: setFanFlagsBodySchema,
        response: {
            200: fanFlagsResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    openApiJson: {
        auth: { kind: "owner-session" },
        tags: ["system"],
        summary: "Get the OpenAPI specification",
        response: {
            200: z.any(),
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    // Admin routes
    adminListUsers: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "List all users",
        response: {
            200: z.array(adminUserSchema),
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    aiPersonasList: {
        auth: { kind: "apiKey" },
        tags: ["usage"],
        summary: "List kernel AI personas (the desktop picker's source)",
        response: {
            200: aiPersonasResponseSchema,
            401: errorResponseSchema,
        },
    },
    aiPersonaCatalog: {
        auth: { kind: "apiKey" },
        tags: ["usage"],
        summary: "List AI persona metadata for client pickers",
        response: {
            200: aiPersonaCatalogResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    aiPersonaUpsert: {
        auth: { kind: "apiKey" },
        tags: ["usage"],
        summary: "Create or update a kernel AI persona",
        params: aiPersonaUpsertParamsSchema,
        body: aiPersonaUpsertBodySchema,
        response: {
            200: aiPersonaSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            409: errorResponseSchema,
        },
    },
    aiPersonaArchive: {
        auth: { kind: "apiKey" },
        tags: ["usage"],
        summary: "Archive a kernel AI persona (soft retire)",
        params: aiPersonaUpsertParamsSchema,
        querystring: aiPersonaArchiveQuerySchema,
        response: {
            200: z.object({ archived: z.boolean(), version: z.number().int().positive() }),
            401: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
        },
    },
    adminAiPersonasList: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "List full active and archived AI personas for owner administration",
        response: {
            200: adminAiPersonasResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    adminAiPersonaCreate: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Create an AI persona",
        body: adminAiPersonaCreateBodySchema,
        response: {
            200: adminAiPersonaSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            409: errorResponseSchema,
        },
    },
    adminAiPersonaUpdate: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Update an active AI persona with optimistic concurrency",
        params: adminAiPersonaParamsSchema,
        body: adminAiPersonaUpdateBodySchema,
        response: {
            200: adminAiPersonaSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            409: errorResponseSchema,
        },
    },
    adminAiPersonaArchive: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Archive an active AI persona with optimistic concurrency",
        params: adminAiPersonaParamsSchema,
        querystring: adminAiPersonaArchiveQuerySchema,
        response: {
            200: adminAiPersonaSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
        },
    },
    aiFeatureStream: {
        auth: { kind: "apiKey" },
        tags: ["usage"],
        summary: "Stream a kernel-assembled AI feature generation",
        description: "Stage 30 feature services: context loads kernel-side, the migrated prompt "
            + "builder assembles the request, and the stream rides the gateway (budgets, ledger, "
            + "restricted capture).",
        params: aiFeatureStreamParamsSchema,
        body: aiFeatureStreamBodySchema,
        response: {
            200: z.unknown(),
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
            429: errorResponseSchema,
            503: errorResponseSchema,
        },
    },
    aiRestrictedGenerations: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "List restricted AI generation content (owner only)",
        querystring: aiRestrictedGenerationsQuerySchema,
        response: {
            200: aiRestrictedGenerationsResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    aiRestrictedGenerationDetail: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Get one restricted AI generation with its acceptance lifecycle (owner only)",
        params: aiRestrictedGenerationParamsSchema,
        response: {
            200: aiRestrictedGenerationDetailResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    adminChatterUsage: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Get aggregated AI usage per chatter",
        querystring: adminChatterUsageQuerySchema,
        response: {
            200: adminChatterUsageResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    adminCreateUser: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Create a new user",
        body: adminCreateUserBodySchema,
        response: {
            200: authUserSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    adminSetPassword: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Set a user password",
        params: z.object({ username: z.string().min(1) }),
        body: adminSetPasswordBodySchema,
        response: {
            200: z.object({ ok: z.literal(true) }),
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    adminAssignPage: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Assign a page to a user",
        params: z.object({ username: z.string().min(1) }),
        body: adminAssignPageBodySchema,
        response: {
            200: authUserSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    adminUnassignPage: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Unassign a page from a user",
        params: z.object({ username: z.string().min(1), pageLabel: z.string().min(1) }),
        response: {
            200: z.object({ ok: z.literal(true) }),
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    adminListApiKeys: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "List API keys for a user",
        params: z.object({ username: z.string().min(1) }),
        response: {
            200: z.array(apiKeyItemSchema),
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    adminIssueApiKey: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Issue an API key for a user",
        params: z.object({ username: z.string().min(1) }),
        body: adminIssueApiKeyBodySchema,
        response: {
            200: issuedApiKeyResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    adminRevokeApiKeys: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Revoke all API keys for a user",
        params: z.object({ username: z.string().min(1) }),
        response: {
            200: z.object({ revokedCount: z.number().int() }),
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    adminDeactivateUser: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Deactivate a user (decision #126: soft tombstone, never delete)",
        description: "Sets the disabled_at tombstone and revokes every credential "
            + "(API keys, device tokens, sessions) in one transaction. History and "
            + "attribution are preserved; the row disappears from the default admin "
            + "list. Owners and the calling account itself cannot be deactivated.",
        params: z.object({ username: z.string().min(1) }),
        response: {
            200: z.object({
                ok: z.literal(true),
                revokedApiKeys: z.number().int().nonnegative(),
                revokedDeviceTokens: z.number().int().nonnegative(),
                revokedSessions: z.number().int().nonnegative(),
            }),
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    adminReactivateUser: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Reactivate a deactivated user",
        description: "Clears the disabled_at tombstone. The stored password works "
            + "again immediately; API keys and device tokens stay revoked — issue "
            + "fresh ones.",
        params: z.object({ username: z.string().min(1) }),
        response: {
            200: z.object({ ok: z.literal(true) }),
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    authChangePassword: {
        auth: { kind: "any-session" },
        tags: ["auth"],
        summary: "Change the caller's own password",
        description: "Verifies the current password, sets the new one, clears "
            + "must_change_password, and revokes every session — log in again with the "
            + "new credential.",
        body: changePasswordBodySchema,
        response: {
            200: z.object({ ok: z.literal(true) }),
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    authIssueDeviceToken: {
        auth: { kind: "any-session" },
        tags: ["auth"],
        summary: "Issue a device token for the caller (returned once)",
        body: deviceTokenLabelBodySchema,
        response: {
            200: issuedDeviceTokenResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    authReserveDeviceToken: {
        auth: { kind: "any-session" },
        tags: ["auth"],
        summary: "Reserve a crash-safe device token for the caller (returned once)",
        description: "Creates a short-lived pending credential in a separate table. "
            + "It cannot authenticate ordinary API routes and must be explicitly activated "
            + "after the client has durably staged local custody.",
        body: deviceTokenLabelBodySchema,
        response: {
            200: reservedDeviceTokenResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    authActivateDeviceToken: {
        auth: { kind: "pending-device-token" },
        tags: ["auth"],
        summary: "Activate a durably staged pending device token",
        description: "Accepts only the distinct pending-device-token bearer. Atomically "
            + "moves its digest into active device_tokens and deletes the reservation. "
            + "Retrying after a lost success response is idempotent.",
        response: {
            200: activatedDeviceTokenResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    authRevokeCurrentDeviceToken: {
        auth: { kind: "device-token" },
        tags: ["auth"],
        summary: "Revoke the current device-token bearer",
        description: "Revokes exactly the credential authenticating this request. "
            + "Cookie sessions and API keys are rejected; sibling device tokens are untouched.",
        response: {
            200: z.object({ revoked: z.literal(true) }),
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    adminListDeviceTokens: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "List a user's device tokens",
        params: z.object({ username: z.string().min(1) }),
        response: {
            200: z.array(deviceTokenItemSchema),
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    adminIssueDeviceToken: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Issue a device token for a user (returned once)",
        params: z.object({ username: z.string().min(1) }),
        body: deviceTokenLabelBodySchema,
        response: {
            200: issuedDeviceTokenResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    adminSetDeviceTokenHarvestCapability: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Bind or remove a device token's Desktop harvest capability",
        description: "Owner-only machine binding. Rebinding one machine atomically "
            + "transfers its harvest authority from the previous device token.",
        params: z.object({
            username: z.string().min(1),
            tokenId: z.coerce.number().int().positive(),
        }),
        body: deviceTokenHarvestCapabilityBodySchema,
        response: {
            200: deviceTokenItemSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    adminRevokeDeviceTokens: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Revoke all of a user's device tokens",
        params: z.object({ username: z.string().min(1) }),
        response: {
            200: z.object({ revokedCount: z.number().int().nonnegative() }),
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    adminGrantModel: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Grant a user model-scope access (present and future pages)",
        params: z.object({ username: z.string().min(1) }),
        body: z.object({ modelSlug: z.string().min(1) }),
        response: {
            200: z.object({ ok: z.literal(true) }),
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    adminRevokeModel: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Revoke a user's model-scope grant",
        params: z.object({ username: z.string().min(1), modelSlug: z.string().min(1) }),
        response: {
            200: z.object({ ok: z.literal(true) }),
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    adminListUserGrants: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Access-grant history for one user (active and revoked)",
        params: z.object({ username: z.string().min(1) }),
        response: {
            200: z.object({ grants: z.array(accessGrantItemSchema) }),
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    archiveConversationMessages: {
        auth: { kind: "session" },
        tags: ["archive"],
        summary: "List archived messages for one conversation (paged, before-cursor)",
        params: z.object({ ref: z.string().min(1).max(200) }),
        querystring: z.object({
            before: z.coerce.number().int().positive().optional(),
            limit: z.coerce.number().int().min(1).max(500).optional(),
        }),
        response: {
            200: z.array(archiveMessageItemSchema),
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    archiveSearch: {
        auth: { kind: "session" },
        tags: ["archive"],
        summary: "Search archived message text (bounded ILIKE)",
        querystring: z.object({
            q: z.string().min(2).max(200),
            fan: z.string().max(200).optional(),
            limit: z.coerce.number().int().min(1).max(200).optional(),
        }),
        response: {
            200: z.array(archiveMessageItemSchema),
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    adminSyncRuns: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "List recent sync runs",
        querystring: syncRunsQuerySchema,
        response: {
            200: z.array(syncRunItemSchema),
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    adminSyncRunDetail: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Get sync run detail",
        params: z.object({ runId: z.coerce.number().int().positive() }),
        response: {
            200: syncRunDetailResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    adminSyncTrigger: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Trigger sync for a page",
        body: syncTriggerBodySchema,
        response: {
            202: syncTriggerResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    adminSyncBlockTrigger: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Trigger sync for a specific page block",
        body: adminSyncBlockBodySchema,
        response: {
            200: adminSyncBlockResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            503: errorResponseSchema,
        },
    },
    adminSyncBlockPause: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Pause sync for a specific page block",
        body: adminSyncBlockBodySchema,
        response: {
            200: adminSyncBlockResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    adminSyncBlockResume: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Resume sync for a specific page block",
        body: adminSyncBlockBodySchema,
        response: {
            200: adminSyncBlockResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    adminSyncBlockReset: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Reset sync state for a specific page block",
        body: adminSyncBlockBodySchema,
        response: {
            200: adminSyncBlockResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            503: errorResponseSchema,
        },
    },
    adminSyncTriggerAll: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Trigger sync for all pages",
        response: {
            202: syncTriggerAllResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    adminConnections: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "List connection statuses",
        response: {
            200: z.array(connectionItemSchema),
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    adminModels: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "List all models for admin management",
        response: {
            200: z.array(adminModelListItemSchema),
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    adminCreateModel: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Create a model",
        body: createModelBodySchema,
        response: {
            200: createModelResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            409: errorResponseSchema,
        },
    },
    adminUpdateModel: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Update a model",
        params: modelParamsSchema,
        body: updateModelBodySchema,
        response: {
            200: createModelResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
        },
    },
    adminDeleteModel: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Delete an empty model",
        params: modelParamsSchema,
        response: {
            200: deletedResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
        },
    },
    adminPages: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "List all pages for admin management",
        response: {
            200: z.array(assignedPageSchema),
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    adminCreatePage: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Onboard a new page",
        body: createPageBodySchema,
        response: {
            200: adminCreatePageResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
        },
    },
    adminUpdatePage: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Update a page",
        params: pageParamsSchema,
        body: updatePageBodySchema,
        response: {
            200: adminUpdatePageResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
        },
    },
    adminDeletePage: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Delete a page",
        params: pageParamsSchema,
        response: {
            200: deletedResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    adminVerifyCredentials: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Verify credentials without persisting",
        body: verifyCredentialsBodySchema,
        response: {
            200: verifyCredentialsResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    adminTestProxy: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Test a proxy connection and return the exit IP",
        body: testProxyBodySchema,
        response: {
            200: testProxyResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    adminVerifyPage: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Verify stored credentials for a page",
        params: pageParamsSchema,
        response: {
            200: verifyPageResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    adminUpdateCredentials: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Update credentials for an existing page",
        params: pageParamsSchema,
        body: updateCredentialsBodySchema,
        response: {
            200: updateCredentialsResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    adminLogs: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "List recent sync event logs",
        querystring: adminLogsQuerySchema,
        response: {
            200: z.array(adminLogItemSchema),
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    adminQueueJobs: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "List pg-boss jobs",
        querystring: adminQueueJobsQuerySchema,
        response: {
            200: z.array(adminQueueJobItemSchema),
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    adminDbStats: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "List database table sizes and migrations",
        response: {
            200: adminDbStatsResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    adminIncidents: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "List sync incidents and seven-day summary counts",
        querystring: adminIncidentsQuerySchema,
        response: {
            200: adminIncidentsResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    // --- Notifications dashboard ---
    notificationsSettings: {
        auth: { kind: "owner-session" },
        tags: ["notifications"],
        summary: "Get notification settings and connection status",
        response: {
            200: notificationsSettingsResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    notificationsSettingsUpdate: {
        auth: { kind: "owner-session" },
        tags: ["notifications"],
        summary: "Update notification settings",
        body: notificationsSettingsUpdateBodySchema,
        response: {
            200: notificationsSettingsResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    notificationsTestMessage: {
        auth: { kind: "owner-session" },
        tags: ["notifications"],
        summary: "Send a test Telegram message",
        response: {
            200: notificationsTestMessageResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    notificationsDiscoverChats: {
        auth: { kind: "owner-session" },
        tags: ["notifications"],
        summary: "Discover Telegram chats that have messaged the bot",
        body: notificationsDiscoverChatsBodySchema,
        response: {
            200: notificationsDiscoverChatsResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    notificationsIncidents: {
        auth: { kind: "owner-session" },
        tags: ["notifications"],
        summary: "List notification incidents with page context",
        querystring: notificationsIncidentsQuerySchema,
        response: {
            200: notificationsIncidentsResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    notificationsResolveIncident: {
        auth: { kind: "owner-session" },
        tags: ["notifications"],
        summary: "Manually resolve an incident",
        params: z.object({ incidentId: z.coerce.number().int().positive() }),
        response: {
            200: notificationsResolveIncidentResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
    notificationsReportPreview: {
        auth: { kind: "owner-session" },
        tags: ["notifications"],
        summary: "Preview the next daily report without sending",
        response: {
            200: notificationsReportPreviewResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    notificationsReportSend: {
        auth: { kind: "owner-session" },
        tags: ["notifications"],
        summary: "Manually send a daily report",
        response: {
            200: notificationsReportSendResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    notificationsReportHistory: {
        auth: { kind: "owner-session" },
        tags: ["notifications"],
        summary: "List daily report delivery history",
        response: {
            200: notificationsReportHistoryResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    // --- Configuration (owner-only) ---
    adminConfig: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Read effective runtime configuration across processes",
        response: {
            200: configViewResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    adminConfigUpdate: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Set runtime config overrides for live (editable, reload) keys",
        body: configUpdateBodySchema,
        response: {
            200: configUpdateResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            409: errorResponseSchema,
        },
    },
    adminConfigClear: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Clear a runtime config override (revert to env)",
        params: configClearParamsSchema,
        querystring: configClearQuerySchema,
        response: {
            200: configClearResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            409: errorResponseSchema,
        },
    },
    adminConfigStaged: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Flip staged-rollout (boot-applied) config flags in the prescribed order",
        body: configStagedBodySchema,
        response: {
            200: configStagedResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            409: errorResponseSchema,
        },
    },
};
