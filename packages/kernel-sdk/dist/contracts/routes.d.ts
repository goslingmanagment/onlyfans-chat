import { z } from "zod";
export declare const errorResponseSchema: z.ZodObject<{
    error: z.ZodString;
    message: z.ZodString;
    statusCode: z.ZodNumber;
}, z.core.$strip>;
export declare const pageRefSchema: z.ZodObject<{
    id: z.ZodNumber;
    label: z.ZodString;
    platform: z.ZodEnum<{
        fansly: "fansly";
        onlyfans: "onlyfans";
    }>;
    modelSlug: z.ZodString;
    modelName: z.ZodString;
}, z.core.$strip>;
export declare const authUserSchema: z.ZodObject<{
    id: z.ZodNumber;
    username: z.ZodString;
    role: z.ZodEnum<{
        owner: "owner";
        team_lead: "team_lead";
        chatter: "chatter";
        content_manager: "content_manager";
    }>;
    mustChangePassword: z.ZodBoolean;
    assignedPages: z.ZodArray<z.ZodObject<{
        id: z.ZodNumber;
        label: z.ZodString;
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        modelSlug: z.ZodString;
        modelName: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const changePasswordBodySchema: z.ZodObject<{
    currentPassword: z.ZodString;
    newPassword: z.ZodString;
}, z.core.$strip>;
export declare const deviceTokenLabelBodySchema: z.ZodObject<{
    label: z.ZodString;
}, z.core.$strip>;
export declare const issuedDeviceTokenResponseSchema: z.ZodObject<{
    token: z.ZodString;
    id: z.ZodNumber;
    label: z.ZodString;
    keyPrefix: z.ZodString;
    expiresAt: z.ZodString;
}, z.core.$strip>;
export declare const reservedDeviceTokenResponseSchema: z.ZodObject<{
    token: z.ZodString;
    reservationId: z.ZodNumber;
    label: z.ZodString;
    keyPrefix: z.ZodString;
    reservationExpiresAt: z.ZodString;
}, z.core.$strip>;
export declare const activatedDeviceTokenResponseSchema: z.ZodObject<{
    id: z.ZodNumber;
    label: z.ZodString;
    expiresAt: z.ZodString;
    keyPrefix: z.ZodString;
}, z.core.$strip>;
export declare const deviceTokenItemSchema: z.ZodObject<{
    id: z.ZodNumber;
    label: z.ZodString;
    keyPrefix: z.ZodString;
    harvestMachineId: z.ZodNullable<z.ZodString>;
    isActive: z.ZodBoolean;
    expiresAt: z.ZodString;
    lastUsedAt: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
    revokedAt: z.ZodNullable<z.ZodString>;
    revokedReason: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const deviceTokenHarvestCapabilityBodySchema: z.ZodObject<{
    machineId: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const deviceTokenAdoptionRowSchema: z.ZodObject<{
    username: z.ZodString;
    hasFreshDeviceToken: z.ZodBoolean;
    deviceTokenLastUsedAt: z.ZodNullable<z.ZodString>;
    deviceTokenExpiresAt: z.ZodNullable<z.ZodString>;
    activeApiKeys: z.ZodNumber;
    apiKeyLastUsedAt: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const deviceTokenAdoptionReportSchema: z.ZodObject<{
    generatedAt: z.ZodString;
    freshWindowDays: z.ZodNumber;
    chatters: z.ZodArray<z.ZodObject<{
        username: z.ZodString;
        hasFreshDeviceToken: z.ZodBoolean;
        deviceTokenLastUsedAt: z.ZodNullable<z.ZodString>;
        deviceTokenExpiresAt: z.ZodNullable<z.ZodString>;
        activeApiKeys: z.ZodNumber;
        apiKeyLastUsedAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    summary: z.ZodObject<{
        activeChatters: z.ZodNumber;
        onFreshTokens: z.ZodNumber;
        withActiveApiKeys: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const accessGrantItemSchema: z.ZodObject<{
    id: z.ZodNumber;
    scopeType: z.ZodEnum<{
        page: "page";
        model: "model";
        org: "org";
    }>;
    scopeId: z.ZodNumber;
    scopeLabel: z.ZodNullable<z.ZodString>;
    grantedBy: z.ZodNullable<z.ZodNumber>;
    grantedAt: z.ZodString;
    revokedBy: z.ZodNullable<z.ZodNumber>;
    revokedAt: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const adminUserApiKeyStatusSchema: z.ZodObject<{
    activeKeyPrefix: z.ZodNullable<z.ZodString>;
    activeKeyCount: z.ZodNumber;
    activeKeyCreatedAt: z.ZodNullable<z.ZodString>;
    activeKeyLastUsedAt: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const adminUserSchema: z.ZodObject<{
    id: z.ZodNumber;
    username: z.ZodString;
    role: z.ZodEnum<{
        owner: "owner";
        team_lead: "team_lead";
        chatter: "chatter";
        content_manager: "content_manager";
    }>;
    mustChangePassword: z.ZodBoolean;
    assignedPages: z.ZodArray<z.ZodObject<{
        id: z.ZodNumber;
        label: z.ZodString;
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        modelSlug: z.ZodString;
        modelName: z.ZodString;
    }, z.core.$strip>>;
    apiKeyStatus: z.ZodNullable<z.ZodObject<{
        activeKeyPrefix: z.ZodNullable<z.ZodString>;
        activeKeyCount: z.ZodNumber;
        activeKeyCreatedAt: z.ZodNullable<z.ZodString>;
        activeKeyLastUsedAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    disabledAt: z.ZodNullable<z.ZodString>;
    lastActiveAt: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const authStateSchema: z.ZodObject<{
    authMethod: z.ZodEnum<{
        session: "session";
        api_key: "api_key";
        device_token: "device_token";
    }>;
    user: z.ZodObject<{
        id: z.ZodNumber;
        username: z.ZodString;
        role: z.ZodEnum<{
            owner: "owner";
            team_lead: "team_lead";
            chatter: "chatter";
            content_manager: "content_manager";
        }>;
        mustChangePassword: z.ZodBoolean;
        assignedPages: z.ZodArray<z.ZodObject<{
            id: z.ZodNumber;
            label: z.ZodString;
            platform: z.ZodEnum<{
                fansly: "fansly";
                onlyfans: "onlyfans";
            }>;
            modelSlug: z.ZodString;
            modelName: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const syncUxSummarySchema: z.ZodObject<{
    state: z.ZodEnum<{
        healthy: "healthy";
        syncing: "syncing";
        catching_up: "catching_up";
        retrying: "retrying";
        attention: "attention";
        setup: "setup";
        off: "off";
    }>;
    label: z.ZodString;
    headline: z.ZodString;
    detail: z.ZodNullable<z.ZodString>;
    progressLabel: z.ZodNullable<z.ZodString>;
    nextRetryAt: z.ZodNullable<z.ZodString>;
    updatedAt: z.ZodNullable<z.ZodString>;
    requiresAction: z.ZodBoolean;
}, z.core.$strip>;
export declare const systemCheckSchema: z.ZodObject<{
    status: z.ZodEnum<{
        error: "error";
        ok: "ok";
    }>;
    latencyMs: z.ZodNullable<z.ZodNumber>;
    error: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const healthResponseSchema: z.ZodObject<{
    status: z.ZodEnum<{
        degraded: "degraded";
        ok: "ok";
    }>;
    timestamp: z.ZodString;
    contractHash: z.ZodString;
    capabilities: z.ZodArray<z.ZodLiteral<"desktop-lifecycle-v2">>;
    checks: z.ZodObject<{
        api: z.ZodObject<{
            status: z.ZodLiteral<"ok">;
        }, z.core.$strip>;
        database: z.ZodObject<{
            status: z.ZodEnum<{
                error: "error";
                ok: "ok";
            }>;
            latencyMs: z.ZodNullable<z.ZodNumber>;
            error: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const syncHealthPageSchema: z.ZodObject<{
    pageId: z.ZodNumber;
    pageLabel: z.ZodString;
    platform: z.ZodEnum<{
        fansly: "fansly";
        onlyfans: "onlyfans";
    }>;
    modelSlug: z.ZodString;
    modelName: z.ZodString;
    status: z.ZodEnum<{
        degraded: "degraded";
        ok: "ok";
    }>;
    connectionStatus: z.ZodEnum<{
        error: "error";
        active: "active";
        stale: "stale";
        expired: "expired";
        never_synced: "never_synced";
        unverified: "unverified";
    }>;
    lastLightSyncAt: z.ZodNullable<z.ZodString>;
    lightAgeMinutes: z.ZodNullable<z.ZodNumber>;
    lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
    followerAgeMinutes: z.ZodNullable<z.ZodNumber>;
    failedStreams: z.ZodNumber;
    stalledStreams: z.ZodNumber;
    pendingStreams: z.ZodNumber;
    lastErrorSummary: z.ZodNullable<z.ZodString>;
    issues: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export declare const syncHealthResponseSchema: z.ZodObject<{
    status: z.ZodEnum<{
        degraded: "degraded";
        ok: "ok";
    }>;
    timestamp: z.ZodString;
    thresholds: z.ZodObject<{
        lightMaxAgeMinutes: z.ZodNumber;
        followerMaxAgeMinutes: z.ZodNumber;
    }, z.core.$strip>;
    overall: z.ZodObject<{
        pageCount: z.ZodNumber;
        unhealthyPageCount: z.ZodNumber;
        runningStreams: z.ZodNumber;
        failedStreams: z.ZodNumber;
        stalledStreams: z.ZodNumber;
        pendingStreams: z.ZodNumber;
        recentFailedRuns: z.ZodNumber;
        recent429s: z.ZodNumber;
        recent5xxs: z.ZodNumber;
    }, z.core.$strip>;
    pages: z.ZodArray<z.ZodObject<{
        pageId: z.ZodNumber;
        pageLabel: z.ZodString;
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        modelSlug: z.ZodString;
        modelName: z.ZodString;
        status: z.ZodEnum<{
            degraded: "degraded";
            ok: "ok";
        }>;
        connectionStatus: z.ZodEnum<{
            error: "error";
            active: "active";
            stale: "stale";
            expired: "expired";
            never_synced: "never_synced";
            unverified: "unverified";
        }>;
        lastLightSyncAt: z.ZodNullable<z.ZodString>;
        lightAgeMinutes: z.ZodNullable<z.ZodNumber>;
        lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
        followerAgeMinutes: z.ZodNullable<z.ZodNumber>;
        failedStreams: z.ZodNumber;
        stalledStreams: z.ZodNumber;
        pendingStreams: z.ZodNumber;
        lastErrorSummary: z.ZodNullable<z.ZodString>;
        issues: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const loginBodySchema: z.ZodObject<{
    username: z.ZodString;
    password: z.ZodString;
}, z.core.$strip>;
export declare const paginationQuerySchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export declare const pageParamsSchema: z.ZodObject<{
    pageLabel: z.ZodString;
}, z.core.$strip>;
export declare const pageSpenderAutoListParamsSchema: z.ZodObject<{
    pageLabel: z.ZodString;
    bucketKey: z.ZodEnum<{
        "0-25": "0-25";
        "25-50": "25-50";
        "50-150": "50-150";
        "150-350": "150-350";
        "350-600": "350-600";
        "600-plus": "600-plus";
    }>;
}, z.core.$strip>;
export declare const modelParamsSchema: z.ZodObject<{
    modelSlug: z.ZodString;
}, z.core.$strip>;
export declare const fanLookupParamsSchema: z.ZodObject<{
    platform: z.ZodEnum<{
        fansly: "fansly";
        onlyfans: "onlyfans";
    }>;
    platformUserId: z.ZodString;
}, z.core.$strip>;
export declare const pageFanParamsSchema: z.ZodObject<{
    pageLabel: z.ZodString;
    platformUserId: z.ZodString;
}, z.core.$strip>;
export declare const fanProfileVersionParamsSchema: z.ZodObject<{
    pageLabel: z.ZodString;
    platformUserId: z.ZodString;
    version: z.ZodCoercedNumber<unknown>;
}, z.core.$strip>;
export declare const pageConversationProfileParamsSchema: z.ZodObject<{
    pageLabel: z.ZodString;
    conversationId: z.ZodString;
}, z.core.$strip>;
export declare const revenueQuerySchema: z.ZodUnion<readonly [z.ZodObject<{
    period: z.ZodEnum<{
        today: "today";
        "7d": "7d";
        "30d": "30d";
        all: "all";
    }>;
    from: z.ZodOptional<z.ZodString>;
    to: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    period: z.ZodLiteral<"custom">;
    from: z.ZodString;
    to: z.ZodString;
}, z.core.$strip>]>;
export declare const transactionListQuerySchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    type: z.ZodOptional<z.ZodEnum<{
        subscription: "subscription";
        tip: "tip";
        message_purchase: "message_purchase";
        post_purchase: "post_purchase";
        stream_tip: "stream_tip";
        chargeback: "chargeback";
        refund: "refund";
        payout_reversal: "payout_reversal";
        other: "other";
    }>>;
    state: z.ZodOptional<z.ZodEnum<{
        pending: "pending";
        posted: "posted";
        unknown: "unknown";
    }>>;
}, z.core.$strip>;
export declare const fanListQuerySchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    query: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const subscriberListQuerySchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    query: z.ZodOptional<z.ZodString>;
    expiringWithinDays: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    startedWithinHours: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    autoRenew: z.ZodOptional<z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodBoolean>>;
}, z.core.$strip>;
export declare const followerListQuerySchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    query: z.ZodOptional<z.ZodString>;
    followedWithinHours: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    subscriber: z.ZodOptional<z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodBoolean>>;
    dmStatus: z.ZodOptional<z.ZodEnum<{
        none: "none";
        has_dm: "has_dm";
    }>>;
    activeWithinMinutes: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export declare const spenderListQuerySchema: z.ZodObject<{
    scope: z.ZodEnum<{
        page: "page";
        model: "model";
        agency: "agency";
    }>;
    pageLabel: z.ZodOptional<z.ZodString>;
    modelSlug: z.ZodOptional<z.ZodString>;
    platform: z.ZodOptional<z.ZodEnum<{
        fansly: "fansly";
        onlyfans: "onlyfans";
    }>>;
    period: z.ZodEnum<{
        today: "today";
        "7d": "7d";
        "30d": "30d";
        custom: "custom";
        "90d": "90d";
        "180d": "180d";
        mtd: "mtd";
        lifetime: "lifetime";
    }>;
    from: z.ZodOptional<z.ZodString>;
    to: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    query: z.ZodOptional<z.ZodString>;
    sortBy: z.ZodOptional<z.ZodEnum<{
        grossAmountMills: "grossAmountMills";
        creatorNetAmountMills: "creatorNetAmountMills";
        postedGrossAmountMills: "postedGrossAmountMills";
        pendingGrossAmountMills: "pendingGrossAmountMills";
        postedCreatorNetAmountMills: "postedCreatorNetAmountMills";
        pendingCreatorNetAmountMills: "pendingCreatorNetAmountMills";
        lifetimeGrossAmountMills: "lifetimeGrossAmountMills";
        lifetimeCreatorNetAmountMills: "lifetimeCreatorNetAmountMills";
        lastTransactionAt: "lastTransactionAt";
        platformUserId: "platformUserId";
        username: "username";
        displayName: "displayName";
    }>>;
    sortDir: z.ZodOptional<z.ZodEnum<{
        asc: "asc";
        desc: "desc";
    }>>;
    retentionStatus: z.ZodOptional<z.ZodEnum<{
        all: "all";
        active: "active";
        cooling: "cooling";
        inactive: "inactive";
        needs_reactivation: "needs_reactivation";
    }>>;
}, z.core.$strip>;
export declare const spenderDetailQuerySchema: z.ZodObject<{
    scope: z.ZodEnum<{
        page: "page";
        model: "model";
        agency: "agency";
    }>;
    pageLabel: z.ZodOptional<z.ZodString>;
    modelSlug: z.ZodOptional<z.ZodString>;
    platform: z.ZodOptional<z.ZodEnum<{
        fansly: "fansly";
        onlyfans: "onlyfans";
    }>>;
    period: z.ZodEnum<{
        today: "today";
        "7d": "7d";
        "30d": "30d";
        custom: "custom";
        "90d": "90d";
        "180d": "180d";
        mtd: "mtd";
        lifetime: "lifetime";
    }>;
    from: z.ZodOptional<z.ZodString>;
    to: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const spenderSeriesQuerySchema: z.ZodObject<{
    scope: z.ZodEnum<{
        page: "page";
        model: "model";
        agency: "agency";
    }>;
    pageLabel: z.ZodOptional<z.ZodString>;
    modelSlug: z.ZodOptional<z.ZodString>;
    platform: z.ZodOptional<z.ZodEnum<{
        fansly: "fansly";
        onlyfans: "onlyfans";
    }>>;
    period: z.ZodEnum<{
        today: "today";
        "7d": "7d";
        "30d": "30d";
        custom: "custom";
        "90d": "90d";
        "180d": "180d";
        mtd: "mtd";
        lifetime: "lifetime";
    }>;
    from: z.ZodOptional<z.ZodString>;
    to: z.ZodOptional<z.ZodString>;
    granularity: z.ZodDefault<z.ZodEnum<{
        day: "day";
        week: "week";
        month: "month";
        auto: "auto";
    }>>;
}, z.core.$strip>;
export declare const spenderBatchBodySchema: z.ZodObject<{
    scope: z.ZodEnum<{
        page: "page";
        model: "model";
        agency: "agency";
    }>;
    pageLabel: z.ZodOptional<z.ZodString>;
    modelSlug: z.ZodOptional<z.ZodString>;
    platform: z.ZodOptional<z.ZodEnum<{
        fansly: "fansly";
        onlyfans: "onlyfans";
    }>>;
    period: z.ZodOptional<z.ZodEnum<{
        today: "today";
        "7d": "7d";
        "30d": "30d";
        custom: "custom";
        "90d": "90d";
        "180d": "180d";
        mtd: "mtd";
        lifetime: "lifetime";
    }>>;
    from: z.ZodOptional<z.ZodString>;
    to: z.ZodOptional<z.ZodString>;
    fans: z.ZodArray<z.ZodObject<{
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        platformUserId: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const pageSpenderAutoListsQuerySchema: z.ZodObject<{
    period: z.ZodOptional<z.ZodEnum<{
        today: "today";
        "7d": "7d";
        "30d": "30d";
        custom: "custom";
        "90d": "90d";
        "180d": "180d";
        mtd: "mtd";
        lifetime: "lifetime";
    }>>;
    from: z.ZodOptional<z.ZodString>;
    to: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const pageSpenderAutoListQuerySchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    query: z.ZodOptional<z.ZodString>;
    period: z.ZodOptional<z.ZodEnum<{
        today: "today";
        "7d": "7d";
        "30d": "30d";
        custom: "custom";
        "90d": "90d";
        "180d": "180d";
        mtd: "mtd";
        lifetime: "lifetime";
    }>>;
    from: z.ZodOptional<z.ZodString>;
    to: z.ZodOptional<z.ZodString>;
    excludeNonFollowers: z.ZodOptional<z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodBoolean>>;
}, z.core.$strip>;
export declare const fansSearchQuerySchema: z.ZodObject<{
    scope: z.ZodEnum<{
        page: "page";
        model: "model";
        agency: "agency";
    }>;
    pageLabel: z.ZodOptional<z.ZodString>;
    modelSlug: z.ZodOptional<z.ZodString>;
    platform: z.ZodOptional<z.ZodEnum<{
        fansly: "fansly";
        onlyfans: "onlyfans";
    }>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    query: z.ZodOptional<z.ZodString>;
    q: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const pageConversationPreviewParamsSchema: z.ZodObject<{
    pageLabel: z.ZodString;
    platformConversationId: z.ZodString;
}, z.core.$strip>;
export declare const pageConversationPreviewQuerySchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export declare const pageConversationMessagesParamsSchema: z.ZodObject<{
    pageLabel: z.ZodString;
    conversationId: z.ZodString;
}, z.core.$strip>;
export declare const pageConversationMessagesQuerySchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export declare const assignedPageSchema: z.ZodObject<{
    id: z.ZodNumber;
    label: z.ZodString;
    platform: z.ZodEnum<{
        fansly: "fansly";
        onlyfans: "onlyfans";
    }>;
    modelSlug: z.ZodString;
    modelName: z.ZodString;
    username: z.ZodNullable<z.ZodString>;
    displayName: z.ZodNullable<z.ZodString>;
    followerCount: z.ZodObject<{
        value: z.ZodNullable<z.ZodNumber>;
        available: z.ZodBoolean;
    }, z.core.$strip>;
    subscriberCount: z.ZodObject<{
        value: z.ZodNullable<z.ZodNumber>;
        available: z.ZodBoolean;
    }, z.core.$strip>;
    lastLightSyncAt: z.ZodNullable<z.ZodString>;
    lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const modelListItemSchema: z.ZodObject<{
    id: z.ZodNumber;
    slug: z.ZodString;
    name: z.ZodString;
    pageCount: z.ZodNumber;
}, z.core.$strip>;
export declare const adminModelListItemSchema: z.ZodObject<{
    id: z.ZodNumber;
    slug: z.ZodString;
    name: z.ZodString;
    pageCount: z.ZodNumber;
    sortOrder: z.ZodNumber;
}, z.core.$strip>;
export declare const revenueBreakdownItemSchema: z.ZodObject<{
    canonicalType: z.ZodEnum<{
        subscription: "subscription";
        tip: "tip";
        message_purchase: "message_purchase";
        post_purchase: "post_purchase";
        stream_tip: "stream_tip";
        chargeback: "chargeback";
        refund: "refund";
        payout_reversal: "payout_reversal";
        other: "other";
    }>;
    bucket: z.ZodEnum<{
        revenue: "revenue";
        adjustment: "adjustment";
        unclassified: "unclassified";
        excluded: "excluded";
    }>;
    netAmountMills: z.ZodNumber;
}, z.core.$strip>;
export declare const platformRevenueWindowSchema: z.ZodObject<{
    platform: z.ZodEnum<{
        fansly: "fansly";
        onlyfans: "onlyfans";
    }>;
    from: z.ZodNullable<z.ZodString>;
    to: z.ZodNullable<z.ZodString>;
    comparisonFrom: z.ZodNullable<z.ZodString>;
    comparisonTo: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const revenueComparisonSchema: z.ZodObject<{
    from: z.ZodString;
    to: z.ZodString;
    netEarningsMills: z.ZodNumber;
    totalNetMills: z.ZodNumber;
    deltaNetMills: z.ZodNumber;
    deltaPct: z.ZodNullable<z.ZodNumber>;
}, z.core.$strip>;
export declare const revenueWindowSchema: z.ZodObject<{
    revenueMills: z.ZodNumber;
    adjustmentMills: z.ZodNumber;
    unclassifiedMills: z.ZodNumber;
    netEarningsMills: z.ZodNumber;
    totalNetMills: z.ZodNumber;
    period: z.ZodEnum<{
        today: "today";
        "7d": "7d";
        "30d": "30d";
        all: "all";
        custom: "custom";
    }>;
    from: z.ZodNullable<z.ZodString>;
    to: z.ZodNullable<z.ZodString>;
    currency: z.ZodLiteral<"USD">;
    breakdown: z.ZodArray<z.ZodObject<{
        canonicalType: z.ZodEnum<{
            subscription: "subscription";
            tip: "tip";
            message_purchase: "message_purchase";
            post_purchase: "post_purchase";
            stream_tip: "stream_tip";
            chargeback: "chargeback";
            refund: "refund";
            payout_reversal: "payout_reversal";
            other: "other";
        }>;
        bucket: z.ZodEnum<{
            revenue: "revenue";
            adjustment: "adjustment";
            unclassified: "unclassified";
            excluded: "excluded";
        }>;
        netAmountMills: z.ZodNumber;
    }, z.core.$strip>>;
    comparison: z.ZodNullable<z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
        netEarningsMills: z.ZodNumber;
        totalNetMills: z.ZodNumber;
        deltaNetMills: z.ZodNumber;
        deltaPct: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>;
    platformWindows: z.ZodArray<z.ZodObject<{
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        from: z.ZodNullable<z.ZodString>;
        to: z.ZodNullable<z.ZodString>;
        comparisonFrom: z.ZodNullable<z.ZodString>;
        comparisonTo: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const pageRevenueItemSchema: z.ZodObject<{
    pageId: z.ZodNumber;
    pageLabel: z.ZodString;
    modelSlug: z.ZodString;
    modelName: z.ZodString;
    netEarningsMills: z.ZodNumber;
    totalNetMills: z.ZodNumber;
    status: z.ZodOptional<z.ZodEnum<{
        active: "active";
        deleted: "deleted";
    }>>;
}, z.core.$strip>;
export declare const modelRevenueItemSchema: z.ZodObject<{
    modelId: z.ZodNumber;
    modelSlug: z.ZodString;
    modelName: z.ZodString;
    pageCount: z.ZodNumber;
    netEarningsMills: z.ZodNumber;
    totalNetMills: z.ZodNumber;
    status: z.ZodOptional<z.ZodEnum<{
        active: "active";
        retired: "retired";
    }>>;
}, z.core.$strip>;
export declare const overviewRevenueResponseSchema: z.ZodObject<{
    revenueMills: z.ZodNumber;
    adjustmentMills: z.ZodNumber;
    unclassifiedMills: z.ZodNumber;
    netEarningsMills: z.ZodNumber;
    totalNetMills: z.ZodNumber;
    period: z.ZodEnum<{
        today: "today";
        "7d": "7d";
        "30d": "30d";
        all: "all";
        custom: "custom";
    }>;
    from: z.ZodNullable<z.ZodString>;
    to: z.ZodNullable<z.ZodString>;
    currency: z.ZodLiteral<"USD">;
    breakdown: z.ZodArray<z.ZodObject<{
        canonicalType: z.ZodEnum<{
            subscription: "subscription";
            tip: "tip";
            message_purchase: "message_purchase";
            post_purchase: "post_purchase";
            stream_tip: "stream_tip";
            chargeback: "chargeback";
            refund: "refund";
            payout_reversal: "payout_reversal";
            other: "other";
        }>;
        bucket: z.ZodEnum<{
            revenue: "revenue";
            adjustment: "adjustment";
            unclassified: "unclassified";
            excluded: "excluded";
        }>;
        netAmountMills: z.ZodNumber;
    }, z.core.$strip>>;
    comparison: z.ZodNullable<z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
        netEarningsMills: z.ZodNumber;
        totalNetMills: z.ZodNumber;
        deltaNetMills: z.ZodNumber;
        deltaPct: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>;
    platformWindows: z.ZodArray<z.ZodObject<{
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        from: z.ZodNullable<z.ZodString>;
        to: z.ZodNullable<z.ZodString>;
        comparisonFrom: z.ZodNullable<z.ZodString>;
        comparisonTo: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    models: z.ZodArray<z.ZodObject<{
        modelId: z.ZodNumber;
        modelSlug: z.ZodString;
        modelName: z.ZodString;
        pageCount: z.ZodNumber;
        netEarningsMills: z.ZodNumber;
        totalNetMills: z.ZodNumber;
        status: z.ZodOptional<z.ZodEnum<{
            active: "active";
            retired: "retired";
        }>>;
    }, z.core.$strip>>;
    pages: z.ZodArray<z.ZodObject<{
        pageId: z.ZodNumber;
        pageLabel: z.ZodString;
        modelSlug: z.ZodString;
        modelName: z.ZodString;
        netEarningsMills: z.ZodNumber;
        totalNetMills: z.ZodNumber;
        status: z.ZodOptional<z.ZodEnum<{
            active: "active";
            deleted: "deleted";
        }>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const overviewGrowthResponseSchema: z.ZodObject<{
    pages: z.ZodArray<z.ZodObject<{
        pageId: z.ZodNumber;
        newFollowers: z.ZodNumber;
        newSubscribers: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const modelRevenueResponseSchema: z.ZodObject<{
    revenueMills: z.ZodNumber;
    adjustmentMills: z.ZodNumber;
    unclassifiedMills: z.ZodNumber;
    netEarningsMills: z.ZodNumber;
    totalNetMills: z.ZodNumber;
    period: z.ZodEnum<{
        today: "today";
        "7d": "7d";
        "30d": "30d";
        all: "all";
        custom: "custom";
    }>;
    from: z.ZodNullable<z.ZodString>;
    to: z.ZodNullable<z.ZodString>;
    currency: z.ZodLiteral<"USD">;
    breakdown: z.ZodArray<z.ZodObject<{
        canonicalType: z.ZodEnum<{
            subscription: "subscription";
            tip: "tip";
            message_purchase: "message_purchase";
            post_purchase: "post_purchase";
            stream_tip: "stream_tip";
            chargeback: "chargeback";
            refund: "refund";
            payout_reversal: "payout_reversal";
            other: "other";
        }>;
        bucket: z.ZodEnum<{
            revenue: "revenue";
            adjustment: "adjustment";
            unclassified: "unclassified";
            excluded: "excluded";
        }>;
        netAmountMills: z.ZodNumber;
    }, z.core.$strip>>;
    comparison: z.ZodNullable<z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
        netEarningsMills: z.ZodNumber;
        totalNetMills: z.ZodNumber;
        deltaNetMills: z.ZodNumber;
        deltaPct: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>;
    platformWindows: z.ZodArray<z.ZodObject<{
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        from: z.ZodNullable<z.ZodString>;
        to: z.ZodNullable<z.ZodString>;
        comparisonFrom: z.ZodNullable<z.ZodString>;
        comparisonTo: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    model: z.ZodObject<{
        id: z.ZodNumber;
        slug: z.ZodString;
        name: z.ZodString;
        pageCount: z.ZodNumber;
    }, z.core.$strip>;
    pages: z.ZodArray<z.ZodObject<{
        pageId: z.ZodNumber;
        pageLabel: z.ZodString;
        modelSlug: z.ZodString;
        modelName: z.ZodString;
        netEarningsMills: z.ZodNumber;
        totalNetMills: z.ZodNumber;
        status: z.ZodOptional<z.ZodEnum<{
            active: "active";
            deleted: "deleted";
        }>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const pageRevenueResponseSchema: z.ZodObject<{
    revenueMills: z.ZodNumber;
    adjustmentMills: z.ZodNumber;
    unclassifiedMills: z.ZodNumber;
    netEarningsMills: z.ZodNumber;
    totalNetMills: z.ZodNumber;
    period: z.ZodEnum<{
        today: "today";
        "7d": "7d";
        "30d": "30d";
        all: "all";
        custom: "custom";
    }>;
    from: z.ZodNullable<z.ZodString>;
    to: z.ZodNullable<z.ZodString>;
    currency: z.ZodLiteral<"USD">;
    breakdown: z.ZodArray<z.ZodObject<{
        canonicalType: z.ZodEnum<{
            subscription: "subscription";
            tip: "tip";
            message_purchase: "message_purchase";
            post_purchase: "post_purchase";
            stream_tip: "stream_tip";
            chargeback: "chargeback";
            refund: "refund";
            payout_reversal: "payout_reversal";
            other: "other";
        }>;
        bucket: z.ZodEnum<{
            revenue: "revenue";
            adjustment: "adjustment";
            unclassified: "unclassified";
            excluded: "excluded";
        }>;
        netAmountMills: z.ZodNumber;
    }, z.core.$strip>>;
    comparison: z.ZodNullable<z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
        netEarningsMills: z.ZodNumber;
        totalNetMills: z.ZodNumber;
        deltaNetMills: z.ZodNumber;
        deltaPct: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>;
    platformWindows: z.ZodArray<z.ZodObject<{
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        from: z.ZodNullable<z.ZodString>;
        to: z.ZodNullable<z.ZodString>;
        comparisonFrom: z.ZodNullable<z.ZodString>;
        comparisonTo: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    page: z.ZodObject<{
        id: z.ZodNumber;
        label: z.ZodString;
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        modelSlug: z.ZodString;
        modelName: z.ZodString;
        username: z.ZodNullable<z.ZodString>;
        displayName: z.ZodNullable<z.ZodString>;
        followerCount: z.ZodObject<{
            value: z.ZodNullable<z.ZodNumber>;
            available: z.ZodBoolean;
        }, z.core.$strip>;
        subscriberCount: z.ZodObject<{
            value: z.ZodNullable<z.ZodNumber>;
            available: z.ZodBoolean;
        }, z.core.$strip>;
        lastLightSyncAt: z.ZodNullable<z.ZodString>;
        lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const transactionFanSchema: z.ZodNullable<z.ZodObject<{
    platformUserId: z.ZodString;
    username: z.ZodNullable<z.ZodString>;
    displayName: z.ZodNullable<z.ZodString>;
}, z.core.$strip>>;
export declare const transactionItemSchema: z.ZodObject<{
    transactionId: z.ZodString;
    rawType: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
    canonicalType: z.ZodEnum<{
        subscription: "subscription";
        tip: "tip";
        message_purchase: "message_purchase";
        post_purchase: "post_purchase";
        stream_tip: "stream_tip";
        chargeback: "chargeback";
        refund: "refund";
        payout_reversal: "payout_reversal";
        other: "other";
    }>;
    transactionState: z.ZodEnum<{
        pending: "pending";
        posted: "posted";
        unknown: "unknown";
    }>;
    amountMills: z.ZodNumber;
    destinationAmountMills: z.ZodNumber;
    netAmountMills: z.ZodNumber;
    walletId: z.ZodNullable<z.ZodString>;
    correlationId: z.ZodNullable<z.ZodString>;
    correlationAccountId: z.ZodNullable<z.ZodString>;
    occurredAt: z.ZodString;
    sourceUpdatedAt: z.ZodNullable<z.ZodString>;
    fan: z.ZodNullable<z.ZodObject<{
        platformUserId: z.ZodString;
        pageAlias: z.ZodNullable<z.ZodString>;
        username: z.ZodNullable<z.ZodString>;
        displayName: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const transactionListResponseSchema: z.ZodObject<{
    page: z.ZodObject<{
        id: z.ZodNumber;
        label: z.ZodString;
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        modelSlug: z.ZodString;
        modelName: z.ZodString;
        username: z.ZodNullable<z.ZodString>;
        displayName: z.ZodNullable<z.ZodString>;
        followerCount: z.ZodObject<{
            value: z.ZodNullable<z.ZodNumber>;
            available: z.ZodBoolean;
        }, z.core.$strip>;
        subscriberCount: z.ZodObject<{
            value: z.ZodNullable<z.ZodNumber>;
            available: z.ZodBoolean;
        }, z.core.$strip>;
        lastLightSyncAt: z.ZodNullable<z.ZodString>;
        lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    items: z.ZodArray<z.ZodObject<{
        transactionId: z.ZodString;
        rawType: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
        canonicalType: z.ZodEnum<{
            subscription: "subscription";
            tip: "tip";
            message_purchase: "message_purchase";
            post_purchase: "post_purchase";
            stream_tip: "stream_tip";
            chargeback: "chargeback";
            refund: "refund";
            payout_reversal: "payout_reversal";
            other: "other";
        }>;
        transactionState: z.ZodEnum<{
            pending: "pending";
            posted: "posted";
            unknown: "unknown";
        }>;
        amountMills: z.ZodNumber;
        destinationAmountMills: z.ZodNumber;
        netAmountMills: z.ZodNumber;
        walletId: z.ZodNullable<z.ZodString>;
        correlationId: z.ZodNullable<z.ZodString>;
        correlationAccountId: z.ZodNullable<z.ZodString>;
        occurredAt: z.ZodString;
        sourceUpdatedAt: z.ZodNullable<z.ZodString>;
        fan: z.ZodNullable<z.ZodObject<{
            platformUserId: z.ZodString;
            pageAlias: z.ZodNullable<z.ZodString>;
            username: z.ZodNullable<z.ZodString>;
            displayName: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    limit: z.ZodNumber;
    offset: z.ZodNumber;
    total: z.ZodNumber;
}, z.core.$strip>;
export declare const subscriberItemSchema: z.ZodObject<{
    platformSubscriptionId: z.ZodString;
    platformUserId: z.ZodString;
    pageAlias: z.ZodNullable<z.ZodString>;
    username: z.ZodNullable<z.ZodString>;
    displayName: z.ZodNullable<z.ZodString>;
    endsAt: z.ZodNullable<z.ZodString>;
    autoRenew: z.ZodNullable<z.ZodBoolean>;
    autoRenewOffDetectedAt: z.ZodNullable<z.ZodString>;
    subscriptionTierName: z.ZodNullable<z.ZodString>;
    startedAt: z.ZodNullable<z.ZodString>;
    totalSpentCents: z.ZodNumber;
    lastTransactionAt: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const subscriberDailyItemSchema: z.ZodObject<{
    businessDate: z.ZodString;
    newSubscribers: z.ZodNumber;
    activeSubscribers: z.ZodNumber;
}, z.core.$strip>;
export declare const subscriberListResponseSchema: z.ZodObject<{
    page: z.ZodObject<{
        id: z.ZodNumber;
        label: z.ZodString;
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        modelSlug: z.ZodString;
        modelName: z.ZodString;
        username: z.ZodNullable<z.ZodString>;
        displayName: z.ZodNullable<z.ZodString>;
        followerCount: z.ZodObject<{
            value: z.ZodNullable<z.ZodNumber>;
            available: z.ZodBoolean;
        }, z.core.$strip>;
        subscriberCount: z.ZodObject<{
            value: z.ZodNullable<z.ZodNumber>;
            available: z.ZodBoolean;
        }, z.core.$strip>;
        lastLightSyncAt: z.ZodNullable<z.ZodString>;
        lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    items: z.ZodArray<z.ZodObject<{
        platformSubscriptionId: z.ZodString;
        platformUserId: z.ZodString;
        pageAlias: z.ZodNullable<z.ZodString>;
        username: z.ZodNullable<z.ZodString>;
        displayName: z.ZodNullable<z.ZodString>;
        endsAt: z.ZodNullable<z.ZodString>;
        autoRenew: z.ZodNullable<z.ZodBoolean>;
        autoRenewOffDetectedAt: z.ZodNullable<z.ZodString>;
        subscriptionTierName: z.ZodNullable<z.ZodString>;
        startedAt: z.ZodNullable<z.ZodString>;
        totalSpentCents: z.ZodNumber;
        lastTransactionAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    limit: z.ZodNumber;
    offset: z.ZodNumber;
    total: z.ZodNumber;
}, z.core.$strip>;
export declare const subscriberDailyResponseSchema: z.ZodObject<{
    page: z.ZodObject<{
        id: z.ZodNumber;
        label: z.ZodString;
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        modelSlug: z.ZodString;
        modelName: z.ZodString;
        username: z.ZodNullable<z.ZodString>;
        displayName: z.ZodNullable<z.ZodString>;
        followerCount: z.ZodObject<{
            value: z.ZodNullable<z.ZodNumber>;
            available: z.ZodBoolean;
        }, z.core.$strip>;
        subscriberCount: z.ZodObject<{
            value: z.ZodNullable<z.ZodNumber>;
            available: z.ZodBoolean;
        }, z.core.$strip>;
        lastLightSyncAt: z.ZodNullable<z.ZodString>;
        lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    items: z.ZodArray<z.ZodObject<{
        businessDate: z.ZodString;
        newSubscribers: z.ZodNumber;
        activeSubscribers: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const followerItemSchema: z.ZodObject<{
    platformUserId: z.ZodString;
    pageAlias: z.ZodNullable<z.ZodString>;
    username: z.ZodNullable<z.ZodString>;
    displayName: z.ZodNullable<z.ZodString>;
    followedAt: z.ZodString;
    isSubscriber: z.ZodBoolean;
    subscriberSince: z.ZodNullable<z.ZodString>;
    subscriptionExpiresAt: z.ZodNullable<z.ZodString>;
    autoRenew: z.ZodNullable<z.ZodBoolean>;
    autoRenewOffDetectedAt: z.ZodNullable<z.ZodString>;
    totalSpentCents: z.ZodNumber;
    lastTransactionAt: z.ZodNullable<z.ZodString>;
    dm: z.ZodObject<{
        hasConversation: z.ZodBoolean;
        platformConversationId: z.ZodNullable<z.ZodString>;
        unreadCount: z.ZodNumber;
        lastMessageAt: z.ZodNullable<z.ZodString>;
        lastFanMessageAt: z.ZodNullable<z.ZodString>;
        lastModelMessageAt: z.ZodNullable<z.ZodString>;
        lastMessagePreview: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    presence: z.ZodObject<{
        status: z.ZodEnum<{
            active_now: "active_now";
            recently_active: "recently_active";
            offline: "offline";
        }>;
        lastSeenAt: z.ZodNullable<z.ZodString>;
        observedAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const followerDailyItemSchema: z.ZodObject<{
    businessDate: z.ZodString;
    newFollowers: z.ZodNumber;
    knownTotalFollowers: z.ZodNullable<z.ZodNumber>;
}, z.core.$strip>;
export declare const followerListResponseSchema: z.ZodObject<{
    page: z.ZodObject<{
        id: z.ZodNumber;
        label: z.ZodString;
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        modelSlug: z.ZodString;
        modelName: z.ZodString;
        username: z.ZodNullable<z.ZodString>;
        displayName: z.ZodNullable<z.ZodString>;
        followerCount: z.ZodObject<{
            value: z.ZodNullable<z.ZodNumber>;
            available: z.ZodBoolean;
        }, z.core.$strip>;
        subscriberCount: z.ZodObject<{
            value: z.ZodNullable<z.ZodNumber>;
            available: z.ZodBoolean;
        }, z.core.$strip>;
        lastLightSyncAt: z.ZodNullable<z.ZodString>;
        lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    items: z.ZodArray<z.ZodObject<{
        platformUserId: z.ZodString;
        pageAlias: z.ZodNullable<z.ZodString>;
        username: z.ZodNullable<z.ZodString>;
        displayName: z.ZodNullable<z.ZodString>;
        followedAt: z.ZodString;
        isSubscriber: z.ZodBoolean;
        subscriberSince: z.ZodNullable<z.ZodString>;
        subscriptionExpiresAt: z.ZodNullable<z.ZodString>;
        autoRenew: z.ZodNullable<z.ZodBoolean>;
        autoRenewOffDetectedAt: z.ZodNullable<z.ZodString>;
        totalSpentCents: z.ZodNumber;
        lastTransactionAt: z.ZodNullable<z.ZodString>;
        dm: z.ZodObject<{
            hasConversation: z.ZodBoolean;
            platformConversationId: z.ZodNullable<z.ZodString>;
            unreadCount: z.ZodNumber;
            lastMessageAt: z.ZodNullable<z.ZodString>;
            lastFanMessageAt: z.ZodNullable<z.ZodString>;
            lastModelMessageAt: z.ZodNullable<z.ZodString>;
            lastMessagePreview: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
        presence: z.ZodObject<{
            status: z.ZodEnum<{
                active_now: "active_now";
                recently_active: "recently_active";
                offline: "offline";
            }>;
            lastSeenAt: z.ZodNullable<z.ZodString>;
            observedAt: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
    }, z.core.$strip>>;
    limit: z.ZodNumber;
    offset: z.ZodNumber;
    total: z.ZodNumber;
}, z.core.$strip>;
export declare const followerDailyResponseSchema: z.ZodObject<{
    page: z.ZodObject<{
        id: z.ZodNumber;
        label: z.ZodString;
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        modelSlug: z.ZodString;
        modelName: z.ZodString;
        username: z.ZodNullable<z.ZodString>;
        displayName: z.ZodNullable<z.ZodString>;
        followerCount: z.ZodObject<{
            value: z.ZodNullable<z.ZodNumber>;
            available: z.ZodBoolean;
        }, z.core.$strip>;
        subscriberCount: z.ZodObject<{
            value: z.ZodNullable<z.ZodNumber>;
            available: z.ZodBoolean;
        }, z.core.$strip>;
        lastLightSyncAt: z.ZodNullable<z.ZodString>;
        lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    items: z.ZodArray<z.ZodObject<{
        businessDate: z.ZodString;
        newFollowers: z.ZodNumber;
        knownTotalFollowers: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const fanListItemSchema: z.ZodObject<{
    platformUserId: z.ZodString;
    pageAlias: z.ZodNullable<z.ZodString>;
    username: z.ZodNullable<z.ZodString>;
    displayName: z.ZodNullable<z.ZodString>;
    totalCreatorNetMills: z.ZodNumber;
    currency: z.ZodLiteral<"USD">;
    isFollower: z.ZodBoolean;
    followerSince: z.ZodNullable<z.ZodString>;
    isSubscriber: z.ZodBoolean;
    subscriberSince: z.ZodNullable<z.ZodString>;
    subscriptionExpiresAt: z.ZodNullable<z.ZodString>;
    autoRenew: z.ZodNullable<z.ZodBoolean>;
    autoRenewOffDetectedAt: z.ZodNullable<z.ZodString>;
    lastTransactionAt: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const fanListResponseSchema: z.ZodObject<{
    page: z.ZodObject<{
        id: z.ZodNumber;
        label: z.ZodString;
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        modelSlug: z.ZodString;
        modelName: z.ZodString;
        username: z.ZodNullable<z.ZodString>;
        displayName: z.ZodNullable<z.ZodString>;
        followerCount: z.ZodObject<{
            value: z.ZodNullable<z.ZodNumber>;
            available: z.ZodBoolean;
        }, z.core.$strip>;
        subscriberCount: z.ZodObject<{
            value: z.ZodNullable<z.ZodNumber>;
            available: z.ZodBoolean;
        }, z.core.$strip>;
        lastLightSyncAt: z.ZodNullable<z.ZodString>;
        lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    items: z.ZodArray<z.ZodObject<{
        platformUserId: z.ZodString;
        pageAlias: z.ZodNullable<z.ZodString>;
        username: z.ZodNullable<z.ZodString>;
        displayName: z.ZodNullable<z.ZodString>;
        totalCreatorNetMills: z.ZodNumber;
        currency: z.ZodLiteral<"USD">;
        isFollower: z.ZodBoolean;
        followerSince: z.ZodNullable<z.ZodString>;
        isSubscriber: z.ZodBoolean;
        subscriberSince: z.ZodNullable<z.ZodString>;
        subscriptionExpiresAt: z.ZodNullable<z.ZodString>;
        autoRenew: z.ZodNullable<z.ZodBoolean>;
        autoRenewOffDetectedAt: z.ZodNullable<z.ZodString>;
        lastTransactionAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    limit: z.ZodNumber;
    offset: z.ZodNumber;
    total: z.ZodNumber;
}, z.core.$strip>;
export declare const pageDeletedFansResponseSchema: z.ZodObject<{
    page: z.ZodObject<{
        id: z.ZodNumber;
        label: z.ZodString;
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        modelSlug: z.ZodString;
        modelName: z.ZodString;
        username: z.ZodNullable<z.ZodString>;
        displayName: z.ZodNullable<z.ZodString>;
        followerCount: z.ZodObject<{
            value: z.ZodNullable<z.ZodNumber>;
            available: z.ZodBoolean;
        }, z.core.$strip>;
        subscriberCount: z.ZodObject<{
            value: z.ZodNullable<z.ZodNumber>;
            available: z.ZodBoolean;
        }, z.core.$strip>;
        lastLightSyncAt: z.ZodNullable<z.ZodString>;
        lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    items: z.ZodArray<z.ZodObject<{
        platformUserId: z.ZodString;
        latestKnownLabel: z.ZodNullable<z.ZodString>;
        pageAlias: z.ZodNullable<z.ZodString>;
        username: z.ZodNullable<z.ZodString>;
        displayName: z.ZodNullable<z.ZodString>;
        latestHistoricalPageAlias: z.ZodNullable<z.ZodString>;
        latestHistoricalUsername: z.ZodNullable<z.ZodString>;
        deletedDetectedAt: z.ZodString;
        deletedLastDetectedAt: z.ZodNullable<z.ZodString>;
        lastSeenAt: z.ZodString;
    }, z.core.$strip>>;
    limit: z.ZodNumber;
    offset: z.ZodNumber;
    total: z.ZodNumber;
}, z.core.$strip>;
export declare const pageFanDetailResponseSchema: z.ZodObject<{
    fan: z.ZodObject<{
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        platformUserId: z.ZodString;
        username: z.ZodNullable<z.ZodString>;
        displayName: z.ZodNullable<z.ZodString>;
        createdAtExternal: z.ZodNullable<z.ZodString>;
        pageAlias: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    platformTotalSpendMills: z.ZodNumber;
    page: z.ZodObject<{
        pageId: z.ZodNumber;
        pageLabel: z.ZodString;
        modelSlug: z.ZodString;
        modelName: z.ZodString;
        totalCreatorNetMills: z.ZodNumber;
        currency: z.ZodLiteral<"USD">;
        isFollower: z.ZodBoolean;
        followerSince: z.ZodNullable<z.ZodString>;
        isSubscriber: z.ZodBoolean;
        subscriberSince: z.ZodNullable<z.ZodString>;
        subscriptionExpiresAt: z.ZodNullable<z.ZodString>;
        autoRenew: z.ZodNullable<z.ZodBoolean>;
        autoRenewOffDetectedAt: z.ZodNullable<z.ZodString>;
        lastTransactionAt: z.ZodNullable<z.ZodString>;
        notes: z.ZodArray<z.ZodObject<{
            id: z.ZodNumber;
            authorUserId: z.ZodNullable<z.ZodNumber>;
            body: z.ZodString;
            createdAt: z.ZodString;
        }, z.core.$strip>>;
        summaries: z.ZodArray<z.ZodObject<{
            id: z.ZodNumber;
            authorUserId: z.ZodNullable<z.ZodNumber>;
            body: z.ZodString;
            createdAt: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    flags: z.ZodArray<z.ZodObject<{
        flag: z.ZodEnum<{
            whale: "whale";
            vip: "vip";
            risky: "risky";
        }>;
        createdAt: z.ZodString;
        createdByUserId: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const crossPageFanDetailResponseSchema: z.ZodObject<{
    fan: z.ZodObject<{
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        platformUserId: z.ZodString;
        username: z.ZodNullable<z.ZodString>;
        displayName: z.ZodNullable<z.ZodString>;
        createdAtExternal: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    platformTotalSpendMills: z.ZodNumber;
    pages: z.ZodArray<z.ZodObject<{
        pageId: z.ZodNumber;
        pageLabel: z.ZodString;
        modelSlug: z.ZodString;
        modelName: z.ZodString;
        totalCreatorNetMills: z.ZodNumber;
        currency: z.ZodLiteral<"USD">;
        isFollower: z.ZodBoolean;
        followerSince: z.ZodNullable<z.ZodString>;
        isSubscriber: z.ZodBoolean;
        subscriberSince: z.ZodNullable<z.ZodString>;
        subscriptionExpiresAt: z.ZodNullable<z.ZodString>;
        autoRenew: z.ZodNullable<z.ZodBoolean>;
        autoRenewOffDetectedAt: z.ZodNullable<z.ZodString>;
        lastTransactionAt: z.ZodNullable<z.ZodString>;
        notes: z.ZodArray<z.ZodObject<{
            id: z.ZodNumber;
            authorUserId: z.ZodNullable<z.ZodNumber>;
            body: z.ZodString;
            createdAt: z.ZodString;
        }, z.core.$strip>>;
        summaries: z.ZodArray<z.ZodObject<{
            id: z.ZodNumber;
            authorUserId: z.ZodNullable<z.ZodNumber>;
            body: z.ZodString;
            createdAt: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    flags: z.ZodArray<z.ZodObject<{
        flag: z.ZodEnum<{
            whale: "whale";
            vip: "vip";
            risky: "risky";
        }>;
        createdAt: z.ZodString;
        createdByUserId: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const spenderListResponseSchema: z.ZodObject<{
    scope: z.ZodObject<{
        kind: z.ZodEnum<{
            page: "page";
            model: "model";
            agency: "agency";
        }>;
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        pageCount: z.ZodNumber;
        page: z.ZodNullable<z.ZodObject<{
            id: z.ZodNumber;
            label: z.ZodString;
            platform: z.ZodEnum<{
                fansly: "fansly";
                onlyfans: "onlyfans";
            }>;
            modelSlug: z.ZodString;
            modelName: z.ZodString;
        }, z.core.$strip>>;
        model: z.ZodNullable<z.ZodObject<{
            slug: z.ZodString;
            name: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    period: z.ZodObject<{
        timeZone: z.ZodString;
        fromBusinessDate: z.ZodNullable<z.ZodString>;
        toBusinessDateInclusive: z.ZodNullable<z.ZodString>;
        asOf: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    diagnostics: z.ZodObject<{
        totalGrossAmountMills: z.ZodNumber;
        totalCreatorNetAmountMills: z.ZodNumber;
        attributedGrossAmountMills: z.ZodNumber;
        attributedCreatorNetAmountMills: z.ZodNumber;
        unattributedGrossAmountMills: z.ZodNumber;
        unattributedCreatorNetAmountMills: z.ZodNumber;
    }, z.core.$strip>;
    items: z.ZodArray<z.ZodObject<{
        fan: z.ZodObject<{
            platform: z.ZodEnum<{
                fansly: "fansly";
                onlyfans: "onlyfans";
            }>;
            platformUserId: z.ZodString;
            username: z.ZodNullable<z.ZodString>;
            displayName: z.ZodNullable<z.ZodString>;
            createdAtExternal: z.ZodNullable<z.ZodString>;
            pageAlias: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
        metrics: z.ZodObject<{
            window: z.ZodNullable<z.ZodObject<{
                grossAmountMills: z.ZodNumber;
                creatorNetAmountMills: z.ZodNumber;
                postedGrossAmountMills: z.ZodNumber;
                pendingGrossAmountMills: z.ZodNumber;
                unknownGrossAmountMills: z.ZodNumber;
                postedCreatorNetAmountMills: z.ZodNumber;
                pendingCreatorNetAmountMills: z.ZodNumber;
                unknownCreatorNetAmountMills: z.ZodNumber;
                transactionCount: z.ZodNumber;
                lastTransactionAt: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>>;
            lifetime: z.ZodObject<{
                scopeGrossAmountMills: z.ZodNumber;
                scopeCreatorNetAmountMills: z.ZodNumber;
                platformGrossAmountMills: z.ZodNumber;
                platformCreatorNetAmountMills: z.ZodNumber;
            }, z.core.$strip>;
            comparison: z.ZodNullable<z.ZodObject<{
                previousGrossAmountMills: z.ZodNumber;
                previousCreatorNetAmountMills: z.ZodNumber;
                deltaGrossAmountMills: z.ZodNumber;
                deltaCreatorNetAmountMills: z.ZodNumber;
                deltaPct: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        lifetimeLastTransactionAt: z.ZodNullable<z.ZodString>;
        lastFanMessageAt: z.ZodNullable<z.ZodString>;
        conversation: z.ZodObject<{
            platformConversationId: z.ZodNullable<z.ZodString>;
            unreadCount: z.ZodNumber;
            lastMessageAt: z.ZodNullable<z.ZodString>;
            lastFanMessageAt: z.ZodNullable<z.ZodString>;
            lastModelMessageAt: z.ZodNullable<z.ZodString>;
            lastMessagePreview: z.ZodNullable<z.ZodString>;
            storedMessageCount: z.ZodNumber;
            messageCoverageStatus: z.ZodEnum<{
                pending_backfill: "pending_backfill";
                partial_window: "partial_window";
                complete: "complete";
            }>;
            messageBackfillComplete: z.ZodBoolean;
        }, z.core.$strip>;
        lastTransaction: z.ZodNullable<z.ZodObject<{
            canonicalType: z.ZodEnum<{
                subscription: "subscription";
                tip: "tip";
                message_purchase: "message_purchase";
                post_purchase: "post_purchase";
                stream_tip: "stream_tip";
                chargeback: "chargeback";
                refund: "refund";
                payout_reversal: "payout_reversal";
                other: "other";
            }>;
            transactionState: z.ZodEnum<{
                pending: "pending";
                posted: "posted";
                unknown: "unknown";
            }>;
            grossAmountMills: z.ZodNumber;
            creatorNetAmountMills: z.ZodNumber;
            occurredAt: z.ZodString;
        }, z.core.$strip>>;
        retentionStatus: z.ZodEnum<{
            active: "active";
            cooling: "cooling";
            inactive: "inactive";
            needs_reactivation: "needs_reactivation";
        }>;
    }, z.core.$strip>>;
    limit: z.ZodNumber;
    offset: z.ZodNumber;
    total: z.ZodNumber;
}, z.core.$strip>;
export declare const pageSpenderAutoListsResponseSchema: z.ZodObject<{
    page: z.ZodObject<{
        id: z.ZodNumber;
        label: z.ZodString;
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        modelSlug: z.ZodString;
        modelName: z.ZodString;
    }, z.core.$strip>;
    currency: z.ZodLiteral<"USD">;
    metric: z.ZodEnum<{
        grossAmountMills: "grossAmountMills";
        lifetimeGrossAmountMills: "lifetimeGrossAmountMills";
    }>;
    period: z.ZodObject<{
        timeZone: z.ZodString;
        fromBusinessDate: z.ZodNullable<z.ZodString>;
        toBusinessDateInclusive: z.ZodNullable<z.ZodString>;
        asOf: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    asOf: z.ZodNullable<z.ZodString>;
    totalEntries: z.ZodNumber;
    lists: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        minAmountMills: z.ZodNumber;
        maxAmountMillsExclusive: z.ZodNullable<z.ZodNumber>;
        entryCount: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const pageSpenderAutoListDetailResponseSchema: z.ZodObject<{
    page: z.ZodObject<{
        id: z.ZodNumber;
        label: z.ZodString;
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        modelSlug: z.ZodString;
        modelName: z.ZodString;
    }, z.core.$strip>;
    currency: z.ZodLiteral<"USD">;
    metric: z.ZodEnum<{
        grossAmountMills: "grossAmountMills";
        lifetimeGrossAmountMills: "lifetimeGrossAmountMills";
    }>;
    period: z.ZodObject<{
        timeZone: z.ZodString;
        fromBusinessDate: z.ZodNullable<z.ZodString>;
        toBusinessDateInclusive: z.ZodNullable<z.ZodString>;
        asOf: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    bucket: z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        minAmountMills: z.ZodNumber;
        maxAmountMillsExclusive: z.ZodNullable<z.ZodNumber>;
        entryCount: z.ZodNumber;
    }, z.core.$strip>;
    items: z.ZodArray<z.ZodObject<{
        fan: z.ZodObject<{
            platform: z.ZodEnum<{
                fansly: "fansly";
                onlyfans: "onlyfans";
            }>;
            platformUserId: z.ZodString;
            username: z.ZodNullable<z.ZodString>;
            displayName: z.ZodNullable<z.ZodString>;
            createdAtExternal: z.ZodNullable<z.ZodString>;
            pageAlias: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
        isFollower: z.ZodBoolean;
        isSubscriber: z.ZodBoolean;
        subscriptionStatus: z.ZodEnum<{
            active: "active";
            never: "never";
            expired: "expired";
        }>;
        subscriptionExpiresAt: z.ZodNullable<z.ZodString>;
        lastSubscriptionEndedAt: z.ZodNullable<z.ZodString>;
        grossAmountMills: z.ZodNumber;
        creatorNetAmountMills: z.ZodNumber;
        lifetimeGrossAmountMills: z.ZodNumber;
        lifetimeCreatorNetAmountMills: z.ZodNumber;
        lastTransactionAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    limit: z.ZodNumber;
    offset: z.ZodNumber;
    total: z.ZodNumber;
}, z.core.$strip>;
export declare const spenderDetailResponseSchema: z.ZodObject<{
    scope: z.ZodObject<{
        kind: z.ZodEnum<{
            page: "page";
            model: "model";
            agency: "agency";
        }>;
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        pageCount: z.ZodNumber;
        page: z.ZodNullable<z.ZodObject<{
            id: z.ZodNumber;
            label: z.ZodString;
            platform: z.ZodEnum<{
                fansly: "fansly";
                onlyfans: "onlyfans";
            }>;
            modelSlug: z.ZodString;
            modelName: z.ZodString;
        }, z.core.$strip>>;
        model: z.ZodNullable<z.ZodObject<{
            slug: z.ZodString;
            name: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    fan: z.ZodObject<{
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        platformUserId: z.ZodString;
        username: z.ZodNullable<z.ZodString>;
        displayName: z.ZodNullable<z.ZodString>;
        createdAtExternal: z.ZodNullable<z.ZodString>;
        pageAlias: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    period: z.ZodObject<{
        timeZone: z.ZodString;
        fromBusinessDate: z.ZodNullable<z.ZodString>;
        toBusinessDateInclusive: z.ZodNullable<z.ZodString>;
        asOf: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    metrics: z.ZodObject<{
        window: z.ZodNullable<z.ZodObject<{
            grossAmountMills: z.ZodNumber;
            creatorNetAmountMills: z.ZodNumber;
            postedGrossAmountMills: z.ZodNumber;
            pendingGrossAmountMills: z.ZodNumber;
            unknownGrossAmountMills: z.ZodNumber;
            postedCreatorNetAmountMills: z.ZodNumber;
            pendingCreatorNetAmountMills: z.ZodNumber;
            unknownCreatorNetAmountMills: z.ZodNumber;
            transactionCount: z.ZodNumber;
            lastTransactionAt: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
        lifetime: z.ZodObject<{
            scopeGrossAmountMills: z.ZodNumber;
            scopeCreatorNetAmountMills: z.ZodNumber;
            platformGrossAmountMills: z.ZodNumber;
            platformCreatorNetAmountMills: z.ZodNumber;
        }, z.core.$strip>;
        comparison: z.ZodNullable<z.ZodObject<{
            previousGrossAmountMills: z.ZodNumber;
            previousCreatorNetAmountMills: z.ZodNumber;
            deltaGrossAmountMills: z.ZodNumber;
            deltaCreatorNetAmountMills: z.ZodNumber;
            deltaPct: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    typeBreakdown: z.ZodArray<z.ZodObject<{
        canonicalType: z.ZodEnum<{
            subscription: "subscription";
            tip: "tip";
            message_purchase: "message_purchase";
            post_purchase: "post_purchase";
            stream_tip: "stream_tip";
            chargeback: "chargeback";
            refund: "refund";
            payout_reversal: "payout_reversal";
            other: "other";
        }>;
        grossAmountMills: z.ZodNumber;
        creatorNetAmountMills: z.ZodNumber;
        transactionCount: z.ZodNumber;
    }, z.core.$strip>>;
    pages: z.ZodArray<z.ZodObject<{
        pageId: z.ZodNumber;
        pageLabel: z.ZodString;
        modelSlug: z.ZodString;
        modelName: z.ZodString;
        inScope: z.ZodBoolean;
        grossAmountMills: z.ZodNumber;
        creatorNetAmountMills: z.ZodNumber;
        lastTransactionAt: z.ZodNullable<z.ZodString>;
        isFollower: z.ZodBoolean;
        followerSince: z.ZodNullable<z.ZodString>;
        isSubscriber: z.ZodBoolean;
        subscriberSince: z.ZodNullable<z.ZodString>;
        subscriptionExpiresAt: z.ZodNullable<z.ZodString>;
        autoRenew: z.ZodNullable<z.ZodBoolean>;
        autoRenewOffDetectedAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const spenderSeriesBucketSchema: z.ZodObject<{
    fromBusinessDate: z.ZodString;
    toBusinessDateInclusive: z.ZodString;
    metrics: z.ZodObject<{
        grossAmountMills: z.ZodNumber;
        creatorNetAmountMills: z.ZodNumber;
        postedGrossAmountMills: z.ZodNumber;
        pendingGrossAmountMills: z.ZodNumber;
        unknownGrossAmountMills: z.ZodNumber;
        postedCreatorNetAmountMills: z.ZodNumber;
        pendingCreatorNetAmountMills: z.ZodNumber;
        unknownCreatorNetAmountMills: z.ZodNumber;
        transactionCount: z.ZodNumber;
        lastTransactionAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const spenderSeriesResponseSchema: z.ZodObject<{
    scope: z.ZodObject<{
        kind: z.ZodEnum<{
            page: "page";
            model: "model";
            agency: "agency";
        }>;
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        pageCount: z.ZodNumber;
        page: z.ZodNullable<z.ZodObject<{
            id: z.ZodNumber;
            label: z.ZodString;
            platform: z.ZodEnum<{
                fansly: "fansly";
                onlyfans: "onlyfans";
            }>;
            modelSlug: z.ZodString;
            modelName: z.ZodString;
        }, z.core.$strip>>;
        model: z.ZodNullable<z.ZodObject<{
            slug: z.ZodString;
            name: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    fan: z.ZodObject<{
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        platformUserId: z.ZodString;
        username: z.ZodNullable<z.ZodString>;
        displayName: z.ZodNullable<z.ZodString>;
        createdAtExternal: z.ZodNullable<z.ZodString>;
        pageAlias: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    period: z.ZodObject<{
        timeZone: z.ZodString;
        fromBusinessDate: z.ZodNullable<z.ZodString>;
        toBusinessDateInclusive: z.ZodNullable<z.ZodString>;
        asOf: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    granularity: z.ZodEnum<{
        day: "day";
        week: "week";
        month: "month";
    }>;
    items: z.ZodArray<z.ZodObject<{
        fromBusinessDate: z.ZodString;
        toBusinessDateInclusive: z.ZodString;
        metrics: z.ZodObject<{
            grossAmountMills: z.ZodNumber;
            creatorNetAmountMills: z.ZodNumber;
            postedGrossAmountMills: z.ZodNumber;
            pendingGrossAmountMills: z.ZodNumber;
            unknownGrossAmountMills: z.ZodNumber;
            postedCreatorNetAmountMills: z.ZodNumber;
            pendingCreatorNetAmountMills: z.ZodNumber;
            unknownCreatorNetAmountMills: z.ZodNumber;
            transactionCount: z.ZodNumber;
            lastTransactionAt: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const spenderBatchItemSchema: z.ZodObject<{
    requestedFan: z.ZodObject<{
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        platformUserId: z.ZodString;
    }, z.core.$strip>;
    found: z.ZodBoolean;
    fan: z.ZodNullable<z.ZodObject<{
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        platformUserId: z.ZodString;
        username: z.ZodNullable<z.ZodString>;
        displayName: z.ZodNullable<z.ZodString>;
        createdAtExternal: z.ZodNullable<z.ZodString>;
        pageAlias: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    metrics: z.ZodNullable<z.ZodObject<{
        window: z.ZodNullable<z.ZodObject<{
            grossAmountMills: z.ZodNumber;
            creatorNetAmountMills: z.ZodNumber;
            postedGrossAmountMills: z.ZodNumber;
            pendingGrossAmountMills: z.ZodNumber;
            unknownGrossAmountMills: z.ZodNumber;
            postedCreatorNetAmountMills: z.ZodNumber;
            pendingCreatorNetAmountMills: z.ZodNumber;
            unknownCreatorNetAmountMills: z.ZodNumber;
            transactionCount: z.ZodNumber;
            lastTransactionAt: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
        lifetime: z.ZodObject<{
            scopeGrossAmountMills: z.ZodNumber;
            scopeCreatorNetAmountMills: z.ZodNumber;
            platformGrossAmountMills: z.ZodNumber;
            platformCreatorNetAmountMills: z.ZodNumber;
        }, z.core.$strip>;
        comparison: z.ZodNullable<z.ZodObject<{
            previousGrossAmountMills: z.ZodNumber;
            previousCreatorNetAmountMills: z.ZodNumber;
            deltaGrossAmountMills: z.ZodNumber;
            deltaCreatorNetAmountMills: z.ZodNumber;
            deltaPct: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    typeBreakdown: z.ZodNullable<z.ZodArray<z.ZodObject<{
        canonicalType: z.ZodEnum<{
            subscription: "subscription";
            tip: "tip";
            message_purchase: "message_purchase";
            post_purchase: "post_purchase";
            stream_tip: "stream_tip";
            chargeback: "chargeback";
            refund: "refund";
            payout_reversal: "payout_reversal";
            other: "other";
        }>;
        grossAmountMills: z.ZodNumber;
        creatorNetAmountMills: z.ZodNumber;
        transactionCount: z.ZodNumber;
    }, z.core.$strip>>>;
    lifetimeLastTransactionAt: z.ZodNullable<z.ZodString>;
    subscription: z.ZodNullable<z.ZodObject<{
        status: z.ZodEnum<{
            active: "active";
            never: "never";
            expired: "expired";
        }>;
        expiresAt: z.ZodNullable<z.ZodString>;
        autoRenew: z.ZodNullable<z.ZodBoolean>;
        autoRenewOffDetectedAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const spenderBatchResponseSchema: z.ZodObject<{
    scope: z.ZodObject<{
        kind: z.ZodEnum<{
            page: "page";
            model: "model";
            agency: "agency";
        }>;
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        pageCount: z.ZodNumber;
        page: z.ZodNullable<z.ZodObject<{
            id: z.ZodNumber;
            label: z.ZodString;
            platform: z.ZodEnum<{
                fansly: "fansly";
                onlyfans: "onlyfans";
            }>;
            modelSlug: z.ZodString;
            modelName: z.ZodString;
        }, z.core.$strip>>;
        model: z.ZodNullable<z.ZodObject<{
            slug: z.ZodString;
            name: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    period: z.ZodObject<{
        timeZone: z.ZodString;
        fromBusinessDate: z.ZodNullable<z.ZodString>;
        toBusinessDateInclusive: z.ZodNullable<z.ZodString>;
        asOf: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    items: z.ZodArray<z.ZodObject<{
        requestedFan: z.ZodObject<{
            platform: z.ZodEnum<{
                fansly: "fansly";
                onlyfans: "onlyfans";
            }>;
            platformUserId: z.ZodString;
        }, z.core.$strip>;
        found: z.ZodBoolean;
        fan: z.ZodNullable<z.ZodObject<{
            platform: z.ZodEnum<{
                fansly: "fansly";
                onlyfans: "onlyfans";
            }>;
            platformUserId: z.ZodString;
            username: z.ZodNullable<z.ZodString>;
            displayName: z.ZodNullable<z.ZodString>;
            createdAtExternal: z.ZodNullable<z.ZodString>;
            pageAlias: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
        metrics: z.ZodNullable<z.ZodObject<{
            window: z.ZodNullable<z.ZodObject<{
                grossAmountMills: z.ZodNumber;
                creatorNetAmountMills: z.ZodNumber;
                postedGrossAmountMills: z.ZodNumber;
                pendingGrossAmountMills: z.ZodNumber;
                unknownGrossAmountMills: z.ZodNumber;
                postedCreatorNetAmountMills: z.ZodNumber;
                pendingCreatorNetAmountMills: z.ZodNumber;
                unknownCreatorNetAmountMills: z.ZodNumber;
                transactionCount: z.ZodNumber;
                lastTransactionAt: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>>;
            lifetime: z.ZodObject<{
                scopeGrossAmountMills: z.ZodNumber;
                scopeCreatorNetAmountMills: z.ZodNumber;
                platformGrossAmountMills: z.ZodNumber;
                platformCreatorNetAmountMills: z.ZodNumber;
            }, z.core.$strip>;
            comparison: z.ZodNullable<z.ZodObject<{
                previousGrossAmountMills: z.ZodNumber;
                previousCreatorNetAmountMills: z.ZodNumber;
                deltaGrossAmountMills: z.ZodNumber;
                deltaCreatorNetAmountMills: z.ZodNumber;
                deltaPct: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
        typeBreakdown: z.ZodNullable<z.ZodArray<z.ZodObject<{
            canonicalType: z.ZodEnum<{
                subscription: "subscription";
                tip: "tip";
                message_purchase: "message_purchase";
                post_purchase: "post_purchase";
                stream_tip: "stream_tip";
                chargeback: "chargeback";
                refund: "refund";
                payout_reversal: "payout_reversal";
                other: "other";
            }>;
            grossAmountMills: z.ZodNumber;
            creatorNetAmountMills: z.ZodNumber;
            transactionCount: z.ZodNumber;
        }, z.core.$strip>>>;
        lifetimeLastTransactionAt: z.ZodNullable<z.ZodString>;
        subscription: z.ZodNullable<z.ZodObject<{
            status: z.ZodEnum<{
                active: "active";
                never: "never";
                expired: "expired";
            }>;
            expiresAt: z.ZodNullable<z.ZodString>;
            autoRenew: z.ZodNullable<z.ZodBoolean>;
            autoRenewOffDetectedAt: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const fansSearchItemSchema: z.ZodObject<{
    fan: z.ZodObject<{
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        platformUserId: z.ZodString;
        username: z.ZodNullable<z.ZodString>;
        displayName: z.ZodNullable<z.ZodString>;
        createdAtExternal: z.ZodNullable<z.ZodString>;
        pageAlias: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    matchKind: z.ZodEnum<{
        platformUserId: "platformUserId";
        username: "username";
        displayName: "displayName";
        alias: "alias";
    }>;
    matchedValue: z.ZodNullable<z.ZodString>;
    pages: z.ZodArray<z.ZodObject<{
        pageId: z.ZodNumber;
        pageLabel: z.ZodString;
        modelSlug: z.ZodString;
        modelName: z.ZodString;
        isFollower: z.ZodBoolean;
        followerSince: z.ZodNullable<z.ZodString>;
        isSubscriber: z.ZodBoolean;
        subscriberSince: z.ZodNullable<z.ZodString>;
        subscriptionExpiresAt: z.ZodNullable<z.ZodString>;
        autoRenew: z.ZodNullable<z.ZodBoolean>;
        autoRenewOffDetectedAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const fansSearchResponseSchema: z.ZodObject<{
    scope: z.ZodObject<{
        kind: z.ZodEnum<{
            page: "page";
            model: "model";
            agency: "agency";
        }>;
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        pageCount: z.ZodNumber;
        page: z.ZodNullable<z.ZodObject<{
            id: z.ZodNumber;
            label: z.ZodString;
            platform: z.ZodEnum<{
                fansly: "fansly";
                onlyfans: "onlyfans";
            }>;
            modelSlug: z.ZodString;
            modelName: z.ZodString;
        }, z.core.$strip>>;
        model: z.ZodNullable<z.ZodObject<{
            slug: z.ZodString;
            name: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    items: z.ZodArray<z.ZodObject<{
        fan: z.ZodObject<{
            platform: z.ZodEnum<{
                fansly: "fansly";
                onlyfans: "onlyfans";
            }>;
            platformUserId: z.ZodString;
            username: z.ZodNullable<z.ZodString>;
            displayName: z.ZodNullable<z.ZodString>;
            createdAtExternal: z.ZodNullable<z.ZodString>;
            pageAlias: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
        matchKind: z.ZodEnum<{
            platformUserId: "platformUserId";
            username: "username";
            displayName: "displayName";
            alias: "alias";
        }>;
        matchedValue: z.ZodNullable<z.ZodString>;
        pages: z.ZodArray<z.ZodObject<{
            pageId: z.ZodNumber;
            pageLabel: z.ZodString;
            modelSlug: z.ZodString;
            modelName: z.ZodString;
            isFollower: z.ZodBoolean;
            followerSince: z.ZodNullable<z.ZodString>;
            isSubscriber: z.ZodBoolean;
            subscriberSince: z.ZodNullable<z.ZodString>;
            subscriptionExpiresAt: z.ZodNullable<z.ZodString>;
            autoRenew: z.ZodNullable<z.ZodBoolean>;
            autoRenewOffDetectedAt: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    limit: z.ZodNumber;
    offset: z.ZodNumber;
    total: z.ZodNumber;
}, z.core.$strip>;
export declare const pageConversationPreviewResponseSchema: z.ZodObject<{
    page: z.ZodObject<{
        id: z.ZodNumber;
        label: z.ZodString;
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        modelSlug: z.ZodString;
        modelName: z.ZodString;
        username: z.ZodNullable<z.ZodString>;
        displayName: z.ZodNullable<z.ZodString>;
        followerCount: z.ZodObject<{
            value: z.ZodNullable<z.ZodNumber>;
            available: z.ZodBoolean;
        }, z.core.$strip>;
        subscriberCount: z.ZodObject<{
            value: z.ZodNullable<z.ZodNumber>;
            available: z.ZodBoolean;
        }, z.core.$strip>;
        lastLightSyncAt: z.ZodNullable<z.ZodString>;
        lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    fan: z.ZodNullable<z.ZodObject<{
        fanId: z.ZodNumber;
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        platformUserId: z.ZodString;
        pageAlias: z.ZodNullable<z.ZodString>;
        username: z.ZodNullable<z.ZodString>;
        displayName: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    conversation: z.ZodObject<{
        platformConversationId: z.ZodString;
        storedMessageCount: z.ZodNumber;
        messageCoverageStatus: z.ZodEnum<{
            pending_backfill: "pending_backfill";
            partial_window: "partial_window";
            complete: "complete";
        }>;
        messageBackfillComplete: z.ZodBoolean;
        messageSyncEligibility: z.ZodEnum<{
            excluded: "excluded";
            eligible: "eligible";
            unresolved_identity: "unresolved_identity";
        }>;
        messageSyncExcludedReason: z.ZodNullable<z.ZodString>;
        lastMessageSyncAt: z.ZodNullable<z.ZodString>;
        unreadCount: z.ZodNumber;
        lastMessageAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    messageSyncUx: z.ZodObject<{
        state: z.ZodEnum<{
            healthy: "healthy";
            syncing: "syncing";
            catching_up: "catching_up";
            retrying: "retrying";
            attention: "attention";
            setup: "setup";
            off: "off";
        }>;
        label: z.ZodString;
        headline: z.ZodString;
        detail: z.ZodNullable<z.ZodString>;
        progressLabel: z.ZodNullable<z.ZodString>;
        nextRetryAt: z.ZodNullable<z.ZodString>;
        updatedAt: z.ZodNullable<z.ZodString>;
        requiresAction: z.ZodBoolean;
    }, z.core.$strip>;
    messages: z.ZodArray<z.ZodObject<{
        platformMessageId: z.ZodString;
        senderPlatformUserId: z.ZodNullable<z.ZodString>;
        senderRole: z.ZodEnum<{
            unknown: "unknown";
            model: "model";
            fan: "fan";
            system: "system";
        }>;
        createdAt: z.ZodString;
        content: z.ZodString;
        totalTipAmountCents: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const workboardV2QuerySchema: z.ZodObject<{
    tab: z.ZodEnum<{
        subscribers: "subscribers";
        spenders: "spenders";
        fresh_mass: "fresh_mass";
        old_mass: "old_mass";
        service: "service";
    }>;
    status: z.ZodPipe<z.ZodOptional<z.ZodString>, z.ZodTransform<string[] | undefined, string | undefined>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export declare const workboardV2ItemSchema: z.ZodObject<{
    fanId: z.ZodNumber;
    fan: z.ZodObject<{
        platformUserId: z.ZodNullable<z.ZodString>;
        pageAlias: z.ZodNullable<z.ZodString>;
        username: z.ZodNullable<z.ZodString>;
        displayName: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    tab: z.ZodEnum<{
        subscribers: "subscribers";
        spenders: "spenders";
        fresh_mass: "fresh_mass";
        old_mass: "old_mass";
        service: "service";
    }>;
    massSubstate: z.ZodNullable<z.ZodEnum<{
        active: "active";
        fresh: "fresh";
        gray: "gray";
        dead: "dead";
        archived: "archived";
    }>>;
    value: z.ZodObject<{
        score: z.ZodNumber;
        tier: z.ZodEnum<{
            whale: "whale";
            vip: "vip";
            payer: "payer";
            new: "new";
        }>;
        confidence: z.ZodEnum<{
            high: "high";
            low: "low";
        }>;
    }, z.core.$strip>;
    urgency: z.ZodObject<{
        score: z.ZodNumber;
        severity: z.ZodEnum<{
            high: "high";
            critical: "critical";
            medium: "medium";
            normal: "normal";
            muted: "muted";
        }>;
    }, z.core.$strip>;
    rankScore: z.ZodNumber;
    secondaryStatus: z.ZodEnum<{
        recent_purchase: "recent_purchase";
        need_reply: "need_reply";
        due_now: "due_now";
        later: "later";
        dont_touch_today: "dont_touch_today";
    }>;
    needsReply: z.ZodBoolean;
    needsHumanTriage: z.ZodBoolean;
    isPurchaseFollowup: z.ZodBoolean;
    whyNow: z.ZodObject<{
        code: z.ZodNullable<z.ZodString>;
        value: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>;
    reasonChips: z.ZodArray<z.ZodString>;
    quality: z.ZodObject<{
        qScore: z.ZodNullable<z.ZodNumber>;
        qConfidence: z.ZodEnum<{
            high: "high";
            low: "low";
            medium: "medium";
        }>;
    }, z.core.$strip>;
    closingVerdict: z.ZodNullable<z.ZodObject<{
        layer: z.ZodEnum<{
            unknown: "unknown";
            unverified: "unverified";
            fresh: "fresh";
            l1: "l1";
            l2: "l2";
            model_last: "model_last";
        }>;
        needsReply: z.ZodBoolean;
        state: z.ZodNullable<z.ZodEnum<{
            question: "question";
            buy_signal: "buy_signal";
            smalltalk: "smalltalk";
            closing: "closing";
            cold: "cold";
            complaint: "complaint";
        }>>;
        reason: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    online: z.ZodBoolean;
    ltv: z.ZodObject<{
        creatorNetAmountMills: z.ZodNumber;
    }, z.core.$strip>;
    subscription: z.ZodObject<{
        expiresAt: z.ZodNullable<z.ZodString>;
        autoRenew: z.ZodNullable<z.ZodBoolean>;
    }, z.core.$strip>;
    conversation: z.ZodObject<{
        lastFanMessageAt: z.ZodNullable<z.ZodString>;
        lastModelMessageAt: z.ZodNullable<z.ZodString>;
        preview: z.ZodNullable<z.ZodString>;
        coverageStatus: z.ZodEnum<{
            pending_backfill: "pending_backfill";
            partial_window: "partial_window";
            complete: "complete";
        }>;
        platformConversationId: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    serviceReason: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const workboardV2CountSchema: z.ZodObject<{
    tab: z.ZodEnum<{
        subscribers: "subscribers";
        spenders: "spenders";
        fresh_mass: "fresh_mass";
        old_mass: "old_mass";
        service: "service";
    }>;
    secondaryStatus: z.ZodEnum<{
        recent_purchase: "recent_purchase";
        need_reply: "need_reply";
        due_now: "due_now";
        later: "later";
        dont_touch_today: "dont_touch_today";
    }>;
    count: z.ZodNumber;
}, z.core.$strip>;
export declare const workboardV2OldMassBudgetSchema: z.ZodObject<{
    used: z.ZodNumber;
    total: z.ZodNumber;
    resetsAt: z.ZodString;
}, z.core.$strip>;
export declare const workboardClaimLeaseSchema: z.ZodObject<{
    fanId: z.ZodNumber;
    claimedByUserId: z.ZodNumber;
    claimedByUsername: z.ZodString;
    expiresAt: z.ZodString;
}, z.core.$strip>;
export declare const workboardV2ResponseSchema: z.ZodObject<{
    tab: z.ZodEnum<{
        subscribers: "subscribers";
        spenders: "spenders";
        fresh_mass: "fresh_mass";
        old_mass: "old_mass";
        service: "service";
    }>;
    total: z.ZodNumber;
    limit: z.ZodNumber;
    offset: z.ZodNumber;
    items: z.ZodArray<z.ZodObject<{
        fanId: z.ZodNumber;
        fan: z.ZodObject<{
            platformUserId: z.ZodNullable<z.ZodString>;
            pageAlias: z.ZodNullable<z.ZodString>;
            username: z.ZodNullable<z.ZodString>;
            displayName: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
        tab: z.ZodEnum<{
            subscribers: "subscribers";
            spenders: "spenders";
            fresh_mass: "fresh_mass";
            old_mass: "old_mass";
            service: "service";
        }>;
        massSubstate: z.ZodNullable<z.ZodEnum<{
            active: "active";
            fresh: "fresh";
            gray: "gray";
            dead: "dead";
            archived: "archived";
        }>>;
        value: z.ZodObject<{
            score: z.ZodNumber;
            tier: z.ZodEnum<{
                whale: "whale";
                vip: "vip";
                payer: "payer";
                new: "new";
            }>;
            confidence: z.ZodEnum<{
                high: "high";
                low: "low";
            }>;
        }, z.core.$strip>;
        urgency: z.ZodObject<{
            score: z.ZodNumber;
            severity: z.ZodEnum<{
                high: "high";
                critical: "critical";
                medium: "medium";
                normal: "normal";
                muted: "muted";
            }>;
        }, z.core.$strip>;
        rankScore: z.ZodNumber;
        secondaryStatus: z.ZodEnum<{
            recent_purchase: "recent_purchase";
            need_reply: "need_reply";
            due_now: "due_now";
            later: "later";
            dont_touch_today: "dont_touch_today";
        }>;
        needsReply: z.ZodBoolean;
        needsHumanTriage: z.ZodBoolean;
        isPurchaseFollowup: z.ZodBoolean;
        whyNow: z.ZodObject<{
            code: z.ZodNullable<z.ZodString>;
            value: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strip>;
        reasonChips: z.ZodArray<z.ZodString>;
        quality: z.ZodObject<{
            qScore: z.ZodNullable<z.ZodNumber>;
            qConfidence: z.ZodEnum<{
                high: "high";
                low: "low";
                medium: "medium";
            }>;
        }, z.core.$strip>;
        closingVerdict: z.ZodNullable<z.ZodObject<{
            layer: z.ZodEnum<{
                unknown: "unknown";
                unverified: "unverified";
                fresh: "fresh";
                l1: "l1";
                l2: "l2";
                model_last: "model_last";
            }>;
            needsReply: z.ZodBoolean;
            state: z.ZodNullable<z.ZodEnum<{
                question: "question";
                buy_signal: "buy_signal";
                smalltalk: "smalltalk";
                closing: "closing";
                cold: "cold";
                complaint: "complaint";
            }>>;
            reason: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
        online: z.ZodBoolean;
        ltv: z.ZodObject<{
            creatorNetAmountMills: z.ZodNumber;
        }, z.core.$strip>;
        subscription: z.ZodObject<{
            expiresAt: z.ZodNullable<z.ZodString>;
            autoRenew: z.ZodNullable<z.ZodBoolean>;
        }, z.core.$strip>;
        conversation: z.ZodObject<{
            lastFanMessageAt: z.ZodNullable<z.ZodString>;
            lastModelMessageAt: z.ZodNullable<z.ZodString>;
            preview: z.ZodNullable<z.ZodString>;
            coverageStatus: z.ZodEnum<{
                pending_backfill: "pending_backfill";
                partial_window: "partial_window";
                complete: "complete";
            }>;
            platformConversationId: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
        serviceReason: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    claims: z.ZodArray<z.ZodObject<{
        fanId: z.ZodNumber;
        claimedByUserId: z.ZodNumber;
        claimedByUsername: z.ZodString;
        expiresAt: z.ZodString;
    }, z.core.$strip>>;
    counts: z.ZodArray<z.ZodObject<{
        tab: z.ZodEnum<{
            subscribers: "subscribers";
            spenders: "spenders";
            fresh_mass: "fresh_mass";
            old_mass: "old_mass";
            service: "service";
        }>;
        secondaryStatus: z.ZodEnum<{
            recent_purchase: "recent_purchase";
            need_reply: "need_reply";
            due_now: "due_now";
            later: "later";
            dont_touch_today: "dont_touch_today";
        }>;
        count: z.ZodNumber;
    }, z.core.$strip>>;
    oldMassBudget: z.ZodNullable<z.ZodObject<{
        used: z.ZodNumber;
        total: z.ZodNumber;
        resetsAt: z.ZodString;
    }, z.core.$strip>>;
    aiCoverage: z.ZodObject<{
        enabled: z.ZodBoolean;
        classified: z.ZodNumber;
        closingsFound: z.ZodNumber;
        callsToday: z.ZodNumber;
        spenderTotal: z.ZodNumber;
        spenderDiagnosed: z.ZodNumber;
        spenderPending: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const workboardV2ListsBandSchema: z.ZodObject<{
    key: z.ZodString;
    label: z.ZodString;
    count: z.ZodNumber;
    items: z.ZodArray<z.ZodObject<{
        fanId: z.ZodNumber;
        fan: z.ZodObject<{
            platformUserId: z.ZodNullable<z.ZodString>;
            pageAlias: z.ZodNullable<z.ZodString>;
            username: z.ZodNullable<z.ZodString>;
            displayName: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
        tab: z.ZodEnum<{
            subscribers: "subscribers";
            spenders: "spenders";
            fresh_mass: "fresh_mass";
            old_mass: "old_mass";
            service: "service";
        }>;
        massSubstate: z.ZodNullable<z.ZodEnum<{
            active: "active";
            fresh: "fresh";
            gray: "gray";
            dead: "dead";
            archived: "archived";
        }>>;
        value: z.ZodObject<{
            score: z.ZodNumber;
            tier: z.ZodEnum<{
                whale: "whale";
                vip: "vip";
                payer: "payer";
                new: "new";
            }>;
            confidence: z.ZodEnum<{
                high: "high";
                low: "low";
            }>;
        }, z.core.$strip>;
        urgency: z.ZodObject<{
            score: z.ZodNumber;
            severity: z.ZodEnum<{
                high: "high";
                critical: "critical";
                medium: "medium";
                normal: "normal";
                muted: "muted";
            }>;
        }, z.core.$strip>;
        rankScore: z.ZodNumber;
        secondaryStatus: z.ZodEnum<{
            recent_purchase: "recent_purchase";
            need_reply: "need_reply";
            due_now: "due_now";
            later: "later";
            dont_touch_today: "dont_touch_today";
        }>;
        needsReply: z.ZodBoolean;
        needsHumanTriage: z.ZodBoolean;
        isPurchaseFollowup: z.ZodBoolean;
        whyNow: z.ZodObject<{
            code: z.ZodNullable<z.ZodString>;
            value: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strip>;
        reasonChips: z.ZodArray<z.ZodString>;
        quality: z.ZodObject<{
            qScore: z.ZodNullable<z.ZodNumber>;
            qConfidence: z.ZodEnum<{
                high: "high";
                low: "low";
                medium: "medium";
            }>;
        }, z.core.$strip>;
        closingVerdict: z.ZodNullable<z.ZodObject<{
            layer: z.ZodEnum<{
                unknown: "unknown";
                unverified: "unverified";
                fresh: "fresh";
                l1: "l1";
                l2: "l2";
                model_last: "model_last";
            }>;
            needsReply: z.ZodBoolean;
            state: z.ZodNullable<z.ZodEnum<{
                question: "question";
                buy_signal: "buy_signal";
                smalltalk: "smalltalk";
                closing: "closing";
                cold: "cold";
                complaint: "complaint";
            }>>;
            reason: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
        online: z.ZodBoolean;
        ltv: z.ZodObject<{
            creatorNetAmountMills: z.ZodNumber;
        }, z.core.$strip>;
        subscription: z.ZodObject<{
            expiresAt: z.ZodNullable<z.ZodString>;
            autoRenew: z.ZodNullable<z.ZodBoolean>;
        }, z.core.$strip>;
        conversation: z.ZodObject<{
            lastFanMessageAt: z.ZodNullable<z.ZodString>;
            lastModelMessageAt: z.ZodNullable<z.ZodString>;
            preview: z.ZodNullable<z.ZodString>;
            coverageStatus: z.ZodEnum<{
                pending_backfill: "pending_backfill";
                partial_window: "partial_window";
                complete: "complete";
            }>;
            platformConversationId: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
        serviceReason: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const workboardV2ListsResponseSchema: z.ZodObject<{
    bands: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        count: z.ZodNumber;
        items: z.ZodArray<z.ZodObject<{
            fanId: z.ZodNumber;
            fan: z.ZodObject<{
                platformUserId: z.ZodNullable<z.ZodString>;
                pageAlias: z.ZodNullable<z.ZodString>;
                username: z.ZodNullable<z.ZodString>;
                displayName: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>;
            tab: z.ZodEnum<{
                subscribers: "subscribers";
                spenders: "spenders";
                fresh_mass: "fresh_mass";
                old_mass: "old_mass";
                service: "service";
            }>;
            massSubstate: z.ZodNullable<z.ZodEnum<{
                active: "active";
                fresh: "fresh";
                gray: "gray";
                dead: "dead";
                archived: "archived";
            }>>;
            value: z.ZodObject<{
                score: z.ZodNumber;
                tier: z.ZodEnum<{
                    whale: "whale";
                    vip: "vip";
                    payer: "payer";
                    new: "new";
                }>;
                confidence: z.ZodEnum<{
                    high: "high";
                    low: "low";
                }>;
            }, z.core.$strip>;
            urgency: z.ZodObject<{
                score: z.ZodNumber;
                severity: z.ZodEnum<{
                    high: "high";
                    critical: "critical";
                    medium: "medium";
                    normal: "normal";
                    muted: "muted";
                }>;
            }, z.core.$strip>;
            rankScore: z.ZodNumber;
            secondaryStatus: z.ZodEnum<{
                recent_purchase: "recent_purchase";
                need_reply: "need_reply";
                due_now: "due_now";
                later: "later";
                dont_touch_today: "dont_touch_today";
            }>;
            needsReply: z.ZodBoolean;
            needsHumanTriage: z.ZodBoolean;
            isPurchaseFollowup: z.ZodBoolean;
            whyNow: z.ZodObject<{
                code: z.ZodNullable<z.ZodString>;
                value: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strip>;
            reasonChips: z.ZodArray<z.ZodString>;
            quality: z.ZodObject<{
                qScore: z.ZodNullable<z.ZodNumber>;
                qConfidence: z.ZodEnum<{
                    high: "high";
                    low: "low";
                    medium: "medium";
                }>;
            }, z.core.$strip>;
            closingVerdict: z.ZodNullable<z.ZodObject<{
                layer: z.ZodEnum<{
                    unknown: "unknown";
                    unverified: "unverified";
                    fresh: "fresh";
                    l1: "l1";
                    l2: "l2";
                    model_last: "model_last";
                }>;
                needsReply: z.ZodBoolean;
                state: z.ZodNullable<z.ZodEnum<{
                    question: "question";
                    buy_signal: "buy_signal";
                    smalltalk: "smalltalk";
                    closing: "closing";
                    cold: "cold";
                    complaint: "complaint";
                }>>;
                reason: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>>;
            online: z.ZodBoolean;
            ltv: z.ZodObject<{
                creatorNetAmountMills: z.ZodNumber;
            }, z.core.$strip>;
            subscription: z.ZodObject<{
                expiresAt: z.ZodNullable<z.ZodString>;
                autoRenew: z.ZodNullable<z.ZodBoolean>;
            }, z.core.$strip>;
            conversation: z.ZodObject<{
                lastFanMessageAt: z.ZodNullable<z.ZodString>;
                lastModelMessageAt: z.ZodNullable<z.ZodString>;
                preview: z.ZodNullable<z.ZodString>;
                coverageStatus: z.ZodEnum<{
                    pending_backfill: "pending_backfill";
                    partial_window: "partial_window";
                    complete: "complete";
                }>;
                platformConversationId: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>;
            serviceReason: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    total: z.ZodNumber;
    truncated: z.ZodBoolean;
}, z.core.$strip>;
export declare const workboardV2ContactBodySchema: z.ZodObject<{
    fanId: z.ZodNumber;
    action: z.ZodDefault<z.ZodEnum<{
        opened: "opened";
        handled: "handled";
        snoozed: "snoozed";
    }>>;
    wasProductive: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export declare const workboardV2ContactResponseSchema: z.ZodObject<{
    ok: z.ZodLiteral<true>;
    fanId: z.ZodNumber;
}, z.core.$strip>;
export declare const workboardV2RecomputeResponseSchema: z.ZodObject<{
    ok: z.ZodLiteral<true>;
    evaluated: z.ZodNumber;
}, z.core.$strip>;
export declare const workboardV2SnoozeBodySchema: z.ZodObject<{
    fanId: z.ZodNumber;
    days: z.ZodNumber;
}, z.core.$strip>;
export declare const workboardV2SnoozeResponseSchema: z.ZodObject<{
    ok: z.ZodLiteral<true>;
    fanId: z.ZodNumber;
    snoozedUntil: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const workboardV2FanParamsSchema: z.ZodObject<{
    pageLabel: z.ZodString;
    fanId: z.ZodCoercedNumber<unknown>;
}, z.core.$strip>;
export declare const workboardV2OkResponseSchema: z.ZodObject<{
    ok: z.ZodLiteral<true>;
    fanId: z.ZodNumber;
}, z.core.$strip>;
export declare const workboardV2AiSettingsSchema: z.ZodObject<{
    enabled: z.ZodBoolean;
    hasApiKey: z.ZodBoolean;
    model: z.ZodString;
    dailyCapMin: z.ZodNumber;
    dailyCapMax: z.ZodNumber;
    envEnabled: z.ZodBoolean;
    source: z.ZodObject<{
        enabled: z.ZodEnum<{
            override: "override";
            env: "env";
        }>;
        dailyCapMax: z.ZodEnum<{
            override: "override";
            env: "env";
        }>;
        model: z.ZodEnum<{
            override: "override";
            env: "env";
        }>;
    }, z.core.$strip>;
    override: z.ZodObject<{
        enabled: z.ZodNullable<z.ZodBoolean>;
        dailyCapMax: z.ZodNullable<z.ZodNumber>;
        model: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const workboardV2AiReportSchema: z.ZodObject<{
    settings: z.ZodObject<{
        enabled: z.ZodBoolean;
        hasApiKey: z.ZodBoolean;
        model: z.ZodString;
        dailyCapMin: z.ZodNumber;
        dailyCapMax: z.ZodNumber;
        envEnabled: z.ZodBoolean;
        source: z.ZodObject<{
            enabled: z.ZodEnum<{
                override: "override";
                env: "env";
            }>;
            dailyCapMax: z.ZodEnum<{
                override: "override";
                env: "env";
            }>;
            model: z.ZodEnum<{
                override: "override";
                env: "env";
            }>;
        }, z.core.$strip>;
        override: z.ZodObject<{
            enabled: z.ZodNullable<z.ZodBoolean>;
            dailyCapMax: z.ZodNullable<z.ZodNumber>;
            model: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    usage: z.ZodObject<{
        today: z.ZodObject<{
            calls: z.ZodNumber;
            inputTokens: z.ZodNumber;
            outputTokens: z.ZodNumber;
            costUsd: z.ZodNumber;
        }, z.core.$strip>;
        last30d: z.ZodObject<{
            calls: z.ZodNumber;
            inputTokens: z.ZodNumber;
            outputTokens: z.ZodNumber;
            costUsd: z.ZodNumber;
        }, z.core.$strip>;
        daily: z.ZodArray<z.ZodObject<{
            calls: z.ZodNumber;
            inputTokens: z.ZodNumber;
            outputTokens: z.ZodNumber;
            costUsd: z.ZodNumber;
            date: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    coverage: z.ZodObject<{
        tails: z.ZodNumber;
        classified: z.ZodNumber;
        closings: z.ZodNumber;
        pending: z.ZodNumber;
        spenders: z.ZodNumber;
        spenderDiagnosed: z.ZodNumber;
        spenderPending: z.ZodNumber;
        spenderL2Classified: z.ZodNumber;
        spenderClosings: z.ZodNumber;
        spenderNoVisibleDialog: z.ZodNumber;
        spenderModelLast: z.ZodNumber;
        spenderFanLast: z.ZodNumber;
        spenderUnknownLast: z.ZodNumber;
    }, z.core.$strip>;
    states: z.ZodArray<z.ZodObject<{
        state: z.ZodString;
        count: z.ZodNumber;
    }, z.core.$strip>>;
    recent: z.ZodArray<z.ZodObject<{
        messageId: z.ZodString;
        tail: z.ZodString;
        state: z.ZodNullable<z.ZodEnum<{
            question: "question";
            buy_signal: "buy_signal";
            smalltalk: "smalltalk";
            closing: "closing";
            cold: "cold";
            complaint: "complaint";
        }>>;
        needsReply: z.ZodBoolean;
        reason: z.ZodNullable<z.ZodString>;
        model: z.ZodNullable<z.ZodString>;
        classifiedAt: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const workboardV2AiSettingsBodySchema: z.ZodObject<{
    enabled: z.ZodNullable<z.ZodBoolean>;
    dailyCapMax: z.ZodNullable<z.ZodNumber>;
    model: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const workboardV2AiClassifyBodySchema: z.ZodObject<{
    reclassify: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export declare const workboardV2AiClassifyResponseSchema: z.ZodObject<{
    ok: z.ZodLiteral<true>;
    runId: z.ZodNumber;
    status: z.ZodString;
    alreadyRunning: z.ZodBoolean;
}, z.core.$strip>;
export declare const workboardV2AiRunSchema: z.ZodObject<{
    id: z.ZodNumber;
    pageLabel: z.ZodNullable<z.ZodString>;
    trigger: z.ZodEnum<{
        reclassify: "reclassify";
        cron: "cron";
        manual: "manual";
    }>;
    model: z.ZodNullable<z.ZodString>;
    classified: z.ZodNumber;
    calls: z.ZodNumber;
    inputTokens: z.ZodNumber;
    outputTokens: z.ZodNumber;
    deferred: z.ZodNumber;
    cleared: z.ZodNumber;
    costUsd: z.ZodNumber;
    status: z.ZodString;
    error: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
}, z.core.$strip>;
export declare const workboardV2AiRunsResponseSchema: z.ZodObject<{
    runs: z.ZodArray<z.ZodObject<{
        id: z.ZodNumber;
        pageLabel: z.ZodNullable<z.ZodString>;
        trigger: z.ZodEnum<{
            reclassify: "reclassify";
            cron: "cron";
            manual: "manual";
        }>;
        model: z.ZodNullable<z.ZodString>;
        classified: z.ZodNumber;
        calls: z.ZodNumber;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        deferred: z.ZodNumber;
        cleared: z.ZodNumber;
        costUsd: z.ZodNumber;
        status: z.ZodString;
        error: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const pageConversationMessageItemSchema: z.ZodObject<{
    messageId: z.ZodString;
    senderRole: z.ZodEnum<{
        unknown: "unknown";
        model: "model";
        fan: "fan";
        system: "system";
    }>;
    content: z.ZodString;
    createdAt: z.ZodString;
    tipAmountCents: z.ZodNumber;
}, z.core.$strip>;
export declare const pageConversationMessagesResponseSchema: z.ZodObject<{
    page: z.ZodObject<{
        id: z.ZodNumber;
        label: z.ZodString;
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        modelSlug: z.ZodString;
        modelName: z.ZodString;
        username: z.ZodNullable<z.ZodString>;
        displayName: z.ZodNullable<z.ZodString>;
        followerCount: z.ZodObject<{
            value: z.ZodNullable<z.ZodNumber>;
            available: z.ZodBoolean;
        }, z.core.$strip>;
        subscriberCount: z.ZodObject<{
            value: z.ZodNullable<z.ZodNumber>;
            available: z.ZodBoolean;
        }, z.core.$strip>;
        lastLightSyncAt: z.ZodNullable<z.ZodString>;
        lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    conversationId: z.ZodString;
    conversation: z.ZodObject<{
        platformConversationId: z.ZodString;
        storedMessageCount: z.ZodNumber;
        messageCoverageStatus: z.ZodEnum<{
            pending_backfill: "pending_backfill";
            partial_window: "partial_window";
            complete: "complete";
        }>;
        messageBackfillComplete: z.ZodBoolean;
        messageSyncEligibility: z.ZodEnum<{
            excluded: "excluded";
            eligible: "eligible";
            unresolved_identity: "unresolved_identity";
        }>;
        messageSyncExcludedReason: z.ZodNullable<z.ZodString>;
        lastMessageSyncAt: z.ZodNullable<z.ZodString>;
        unreadCount: z.ZodNumber;
        lastMessageAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    messages: z.ZodArray<z.ZodObject<{
        messageId: z.ZodString;
        senderRole: z.ZodEnum<{
            unknown: "unknown";
            model: "model";
            fan: "fan";
            system: "system";
        }>;
        content: z.ZodString;
        createdAt: z.ZodString;
        tipAmountCents: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const fanProfileDocumentSchema: z.ZodObject<{
    version: z.ZodNumber;
    body: z.ZodString;
    source: z.ZodEnum<{
        chatmuse: "chatmuse";
    }>;
    createdAt: z.ZodString;
    sourceGeneratedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdByUserId: z.ZodNullable<z.ZodNumber>;
}, z.core.$strip>;
export declare const fanProfileResponseSchema: z.ZodObject<{
    fan: z.ZodObject<{
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        platformUserId: z.ZodString;
        username: z.ZodNullable<z.ZodString>;
        displayName: z.ZodNullable<z.ZodString>;
        createdAtExternal: z.ZodNullable<z.ZodString>;
        pageAlias: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    profile: z.ZodNullable<z.ZodObject<{
        version: z.ZodNumber;
        body: z.ZodString;
        source: z.ZodEnum<{
            chatmuse: "chatmuse";
        }>;
        createdAt: z.ZodString;
        sourceGeneratedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        createdByUserId: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const fanProfileVersionListItemSchema: z.ZodObject<{
    version: z.ZodNumber;
    createdAt: z.ZodString;
    isCurrent: z.ZodBoolean;
}, z.core.$strip>;
export declare const fanProfileVersionListResponseSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        version: z.ZodNumber;
        createdAt: z.ZodString;
        isCurrent: z.ZodBoolean;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const connectionItemSchema: z.ZodObject<{
    id: z.ZodNumber;
    label: z.ZodString;
    platform: z.ZodEnum<{
        fansly: "fansly";
        onlyfans: "onlyfans";
    }>;
    modelSlug: z.ZodString;
    modelName: z.ZodString;
    username: z.ZodNullable<z.ZodString>;
    displayName: z.ZodNullable<z.ZodString>;
    connectionStatus: z.ZodEnum<{
        error: "error";
        active: "active";
        stale: "stale";
        expired: "expired";
        never_synced: "never_synced";
        unverified: "unverified";
    }>;
    lastLightSyncAt: z.ZodNullable<z.ZodString>;
    lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
    lastSyncError: z.ZodNullable<z.ZodString>;
    subscriberCount: z.ZodObject<{
        value: z.ZodNullable<z.ZodNumber>;
        available: z.ZodBoolean;
    }, z.core.$strip>;
    followerCount: z.ZodObject<{
        value: z.ZodNullable<z.ZodNumber>;
        available: z.ZodBoolean;
    }, z.core.$strip>;
    proxyUrl: z.ZodNullable<z.ZodString>;
    proxyHasAuth: z.ZodBoolean;
    syncUx: z.ZodObject<{
        state: z.ZodEnum<{
            healthy: "healthy";
            syncing: "syncing";
            catching_up: "catching_up";
            retrying: "retrying";
            attention: "attention";
            setup: "setup";
            off: "off";
        }>;
        label: z.ZodString;
        headline: z.ZodString;
        detail: z.ZodNullable<z.ZodString>;
        progressLabel: z.ZodNullable<z.ZodString>;
        nextRetryAt: z.ZodNullable<z.ZodString>;
        updatedAt: z.ZodNullable<z.ZodString>;
        requiresAction: z.ZodBoolean;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const overviewResponseSchema: z.ZodObject<{
    counts: z.ZodObject<{
        models: z.ZodNumber;
        pages: z.ZodNumber;
        fans: z.ZodNumber;
    }, z.core.$strip>;
    revenue: z.ZodObject<{
        "7d": z.ZodObject<{
            revenueMills: z.ZodNumber;
            adjustmentMills: z.ZodNumber;
            unclassifiedMills: z.ZodNumber;
            netEarningsMills: z.ZodNumber;
            previousNetEarningsMills: z.ZodNumber;
            deltaPct: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strip>;
        "30d": z.ZodObject<{
            revenueMills: z.ZodNumber;
            adjustmentMills: z.ZodNumber;
            unclassifiedMills: z.ZodNumber;
            netEarningsMills: z.ZodNumber;
            previousNetEarningsMills: z.ZodNumber;
            deltaPct: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    overall: z.ZodObject<{
        syncUx: z.ZodObject<{
            state: z.ZodEnum<{
                healthy: "healthy";
                syncing: "syncing";
                catching_up: "catching_up";
                retrying: "retrying";
                attention: "attention";
                setup: "setup";
                off: "off";
            }>;
            label: z.ZodString;
            headline: z.ZodString;
            detail: z.ZodNullable<z.ZodString>;
            progressLabel: z.ZodNullable<z.ZodString>;
            nextRetryAt: z.ZodNullable<z.ZodString>;
            updatedAt: z.ZodNullable<z.ZodString>;
            requiresAction: z.ZodBoolean;
        }, z.core.$strip>;
    }, z.core.$strip>;
    pages: z.ZodArray<z.ZodObject<{
        id: z.ZodNumber;
        label: z.ZodString;
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        modelSlug: z.ZodString;
        modelName: z.ZodString;
        username: z.ZodNullable<z.ZodString>;
        subscriberCount: z.ZodObject<{
            value: z.ZodNullable<z.ZodNumber>;
            available: z.ZodBoolean;
        }, z.core.$strip>;
        followerCount: z.ZodObject<{
            value: z.ZodNullable<z.ZodNumber>;
            available: z.ZodBoolean;
        }, z.core.$strip>;
        revenueTodayMills: z.ZodNumber;
        revenue7dMills: z.ZodNumber;
        revenue30dMills: z.ZodNumber;
        newSubscribersToday: z.ZodNumber;
        newFollowersToday: z.ZodNumber;
        connectionStatus: z.ZodEnum<{
            error: "error";
            active: "active";
            stale: "stale";
            expired: "expired";
            never_synced: "never_synced";
            unverified: "unverified";
        }>;
        lastLightSyncAt: z.ZodNullable<z.ZodString>;
        lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
        lastSyncError: z.ZodNullable<z.ZodString>;
        syncUx: z.ZodObject<{
            state: z.ZodEnum<{
                healthy: "healthy";
                syncing: "syncing";
                catching_up: "catching_up";
                retrying: "retrying";
                attention: "attention";
                setup: "setup";
                off: "off";
            }>;
            label: z.ZodString;
            headline: z.ZodString;
            detail: z.ZodNullable<z.ZodString>;
            progressLabel: z.ZodNullable<z.ZodString>;
            nextRetryAt: z.ZodNullable<z.ZodString>;
            updatedAt: z.ZodNullable<z.ZodString>;
            requiresAction: z.ZodBoolean;
        }, z.core.$strip>;
    }, z.core.$strip>>;
    setup: z.ZodObject<{
        hasPages: z.ZodBoolean;
        hasFanslyPages: z.ZodBoolean;
        hasOnlyFansPages: z.ZodBoolean;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const revenueDailyQuerySchema: z.ZodObject<{
    period: z.ZodDefault<z.ZodEnum<{
        today: "today";
        "7d": "7d";
        "30d": "30d";
        all: "all";
        custom: "custom";
    }>>;
    from: z.ZodOptional<z.ZodString>;
    to: z.ZodOptional<z.ZodString>;
    groupByType: z.ZodDefault<z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodBoolean>>;
}, z.core.$strip>;
export declare const revenueDailyItemSchema: z.ZodObject<{
    businessDate: z.ZodString;
    netAmountMills: z.ZodNumber;
    transactionCount: z.ZodNumber;
}, z.core.$strip>;
export declare const revenueDailyTypedItemSchema: z.ZodObject<{
    businessDate: z.ZodString;
    canonicalType: z.ZodEnum<{
        subscription: "subscription";
        tip: "tip";
        message_purchase: "message_purchase";
        post_purchase: "post_purchase";
        stream_tip: "stream_tip";
        chargeback: "chargeback";
        refund: "refund";
        payout_reversal: "payout_reversal";
        other: "other";
    }>;
    netAmountMills: z.ZodNumber;
    transactionCount: z.ZodNumber;
}, z.core.$strip>;
export declare const revenueDailyResponseSchema: z.ZodObject<{
    series: z.ZodArray<z.ZodObject<{
        businessDate: z.ZodString;
        netAmountMills: z.ZodNumber;
        transactionCount: z.ZodNumber;
        canonicalType: z.ZodOptional<z.ZodEnum<{
            subscription: "subscription";
            tip: "tip";
            message_purchase: "message_purchase";
            post_purchase: "post_purchase";
            stream_tip: "stream_tip";
            chargeback: "chargeback";
            refund: "refund";
            payout_reversal: "payout_reversal";
            other: "other";
        }>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const revenueByModelQuerySchema: z.ZodObject<{
    period: z.ZodDefault<z.ZodEnum<{
        today: "today";
        "7d": "7d";
        "30d": "30d";
        all: "all";
        custom: "custom";
    }>>;
    from: z.ZodOptional<z.ZodString>;
    to: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const revenueByModelItemSchema: z.ZodObject<{
    modelSlug: z.ZodString;
    modelName: z.ZodString;
    pageCount: z.ZodNumber;
    totalNetAmountMills: z.ZodNumber;
    transactionCount: z.ZodNumber;
    series: z.ZodArray<z.ZodObject<{
        businessDate: z.ZodString;
        netAmountMills: z.ZodNumber;
        transactionCount: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const revenueByModelResponseSchema: z.ZodObject<{
    models: z.ZodArray<z.ZodObject<{
        modelSlug: z.ZodString;
        modelName: z.ZodString;
        pageCount: z.ZodNumber;
        totalNetAmountMills: z.ZodNumber;
        transactionCount: z.ZodNumber;
        series: z.ZodArray<z.ZodObject<{
            businessDate: z.ZodString;
            netAmountMills: z.ZodNumber;
            transactionCount: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const crossPageTransactionItemSchema: z.ZodObject<{
    transactionId: z.ZodString;
    rawType: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
    canonicalType: z.ZodEnum<{
        subscription: "subscription";
        tip: "tip";
        message_purchase: "message_purchase";
        post_purchase: "post_purchase";
        stream_tip: "stream_tip";
        chargeback: "chargeback";
        refund: "refund";
        payout_reversal: "payout_reversal";
        other: "other";
    }>;
    transactionState: z.ZodEnum<{
        pending: "pending";
        posted: "posted";
        unknown: "unknown";
    }>;
    amountMills: z.ZodNumber;
    destinationAmountMills: z.ZodNumber;
    netAmountMills: z.ZodNumber;
    occurredAt: z.ZodString;
    sourceUpdatedAt: z.ZodNullable<z.ZodString>;
    fan: z.ZodNullable<z.ZodObject<{
        platformUserId: z.ZodString;
        username: z.ZodNullable<z.ZodString>;
        displayName: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    pageLabel: z.ZodString;
    platform: z.ZodEnum<{
        fansly: "fansly";
        onlyfans: "onlyfans";
    }>;
}, z.core.$strip>;
export declare const crossPageTransactionListQuerySchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    pageLabel: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodEnum<{
        subscription: "subscription";
        tip: "tip";
        message_purchase: "message_purchase";
        post_purchase: "post_purchase";
        stream_tip: "stream_tip";
        chargeback: "chargeback";
        refund: "refund";
        payout_reversal: "payout_reversal";
        other: "other";
    }>>;
    state: z.ZodOptional<z.ZodEnum<{
        pending: "pending";
        posted: "posted";
        unknown: "unknown";
    }>>;
    sortBy: z.ZodDefault<z.ZodEnum<{
        grossAmountMills: "grossAmountMills";
        netAmountMills: "netAmountMills";
        occurredAt: "occurredAt";
    }>>;
    sortDir: z.ZodDefault<z.ZodEnum<{
        asc: "asc";
        desc: "desc";
    }>>;
}, z.core.$strip>;
export declare const crossPageTransactionListResponseSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        transactionId: z.ZodString;
        rawType: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
        canonicalType: z.ZodEnum<{
            subscription: "subscription";
            tip: "tip";
            message_purchase: "message_purchase";
            post_purchase: "post_purchase";
            stream_tip: "stream_tip";
            chargeback: "chargeback";
            refund: "refund";
            payout_reversal: "payout_reversal";
            other: "other";
        }>;
        transactionState: z.ZodEnum<{
            pending: "pending";
            posted: "posted";
            unknown: "unknown";
        }>;
        amountMills: z.ZodNumber;
        destinationAmountMills: z.ZodNumber;
        netAmountMills: z.ZodNumber;
        occurredAt: z.ZodString;
        sourceUpdatedAt: z.ZodNullable<z.ZodString>;
        fan: z.ZodNullable<z.ZodObject<{
            platformUserId: z.ZodString;
            username: z.ZodNullable<z.ZodString>;
            displayName: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
        pageLabel: z.ZodString;
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
    }, z.core.$strip>>;
    limit: z.ZodNumber;
    offset: z.ZodNumber;
    total: z.ZodNumber;
}, z.core.$strip>;
export declare const fanTransactionItemSchema: z.ZodObject<{
    transactionId: z.ZodString;
    rawType: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
    canonicalType: z.ZodEnum<{
        subscription: "subscription";
        tip: "tip";
        message_purchase: "message_purchase";
        post_purchase: "post_purchase";
        stream_tip: "stream_tip";
        chargeback: "chargeback";
        refund: "refund";
        payout_reversal: "payout_reversal";
        other: "other";
    }>;
    transactionState: z.ZodEnum<{
        pending: "pending";
        posted: "posted";
        unknown: "unknown";
    }>;
    amountMills: z.ZodNumber;
    destinationAmountMills: z.ZodNumber;
    netAmountMills: z.ZodNumber;
    occurredAt: z.ZodString;
    sourceUpdatedAt: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const fanTransactionListResponseSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        transactionId: z.ZodString;
        rawType: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
        canonicalType: z.ZodEnum<{
            subscription: "subscription";
            tip: "tip";
            message_purchase: "message_purchase";
            post_purchase: "post_purchase";
            stream_tip: "stream_tip";
            chargeback: "chargeback";
            refund: "refund";
            payout_reversal: "payout_reversal";
            other: "other";
        }>;
        transactionState: z.ZodEnum<{
            pending: "pending";
            posted: "posted";
            unknown: "unknown";
        }>;
        amountMills: z.ZodNumber;
        destinationAmountMills: z.ZodNumber;
        netAmountMills: z.ZodNumber;
        occurredAt: z.ZodString;
        sourceUpdatedAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    limit: z.ZodNumber;
    offset: z.ZodNumber;
    total: z.ZodNumber;
}, z.core.$strip>;
export declare const crossPageFanTransactionItemSchema: z.ZodObject<{
    transactionId: z.ZodString;
    rawType: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
    canonicalType: z.ZodEnum<{
        subscription: "subscription";
        tip: "tip";
        message_purchase: "message_purchase";
        post_purchase: "post_purchase";
        stream_tip: "stream_tip";
        chargeback: "chargeback";
        refund: "refund";
        payout_reversal: "payout_reversal";
        other: "other";
    }>;
    transactionState: z.ZodEnum<{
        pending: "pending";
        posted: "posted";
        unknown: "unknown";
    }>;
    amountMills: z.ZodNumber;
    destinationAmountMills: z.ZodNumber;
    netAmountMills: z.ZodNumber;
    occurredAt: z.ZodString;
    sourceUpdatedAt: z.ZodNullable<z.ZodString>;
    pageLabel: z.ZodString;
    platform: z.ZodEnum<{
        fansly: "fansly";
        onlyfans: "onlyfans";
    }>;
}, z.core.$strip>;
export declare const crossPageFanTransactionListResponseSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        transactionId: z.ZodString;
        rawType: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
        canonicalType: z.ZodEnum<{
            subscription: "subscription";
            tip: "tip";
            message_purchase: "message_purchase";
            post_purchase: "post_purchase";
            stream_tip: "stream_tip";
            chargeback: "chargeback";
            refund: "refund";
            payout_reversal: "payout_reversal";
            other: "other";
        }>;
        transactionState: z.ZodEnum<{
            pending: "pending";
            posted: "posted";
            unknown: "unknown";
        }>;
        amountMills: z.ZodNumber;
        destinationAmountMills: z.ZodNumber;
        netAmountMills: z.ZodNumber;
        occurredAt: z.ZodString;
        sourceUpdatedAt: z.ZodNullable<z.ZodString>;
        pageLabel: z.ZodString;
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
    }, z.core.$strip>>;
    limit: z.ZodNumber;
    offset: z.ZodNumber;
    total: z.ZodNumber;
}, z.core.$strip>;
export declare const upsertFanProfileBodySchema: z.ZodObject<{
    body: z.ZodString;
    generatedAtMs: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const createFanNoteBodySchema: z.ZodObject<{
    body: z.ZodString;
}, z.core.$strip>;
export declare const fanNoteResponseSchema: z.ZodObject<{
    id: z.ZodNumber;
    fanId: z.ZodNumber;
    platformAccountId: z.ZodNumber;
    authorUserId: z.ZodNumber;
    body: z.ZodString;
    createdAt: z.ZodString;
}, z.core.$strip>;
export declare const setFanFlagsBodySchema: z.ZodObject<{
    flags: z.ZodArray<z.ZodEnum<{
        whale: "whale";
        vip: "vip";
        risky: "risky";
    }>>;
}, z.core.$strip>;
export declare const fanFlagsResponseSchema: z.ZodObject<{
    flags: z.ZodArray<z.ZodObject<{
        flag: z.ZodEnum<{
            whale: "whale";
            vip: "vip";
            risky: "risky";
        }>;
        createdAt: z.ZodString;
        createdByUserId: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const aiUsageEventInputSchema: z.ZodObject<{
    clientEventId: z.ZodString;
    feature: z.ZodEnum<{
        "fast-reply": "fast-reply";
        "improve-draft": "improve-draft";
        "help-me": "help-me";
        "fan-summary": "fan-summary";
        "chat-review": "chat-review";
        scan: "scan";
        ping: "ping";
        "hi-greeting": "hi-greeting";
        "workboard-closing": "workboard-closing";
    }>;
    model: z.ZodString;
    inputTokens: z.ZodNumber;
    outputTokens: z.ZodNumber;
    cacheWriteTokens: z.ZodNumber;
    cacheReadTokens: z.ZodNumber;
    conversationId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    durationMs: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    isCacheHit: z.ZodBoolean;
    isRegeneration: z.ZodBoolean;
    completedAt: z.ZodString;
}, z.core.$strip>;
export declare const aiUsageBatchBodySchema: z.ZodObject<{
    events: z.ZodArray<z.ZodObject<{
        clientEventId: z.ZodString;
        feature: z.ZodEnum<{
            "fast-reply": "fast-reply";
            "improve-draft": "improve-draft";
            "help-me": "help-me";
            "fan-summary": "fan-summary";
            "chat-review": "chat-review";
            scan: "scan";
            ping: "ping";
            "hi-greeting": "hi-greeting";
            "workboard-closing": "workboard-closing";
        }>;
        model: z.ZodString;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cacheWriteTokens: z.ZodNumber;
        cacheReadTokens: z.ZodNumber;
        conversationId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        durationMs: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        isCacheHit: z.ZodBoolean;
        isRegeneration: z.ZodBoolean;
        completedAt: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const aiUsageBatchResponseSchema: z.ZodObject<{
    receivedCount: z.ZodNumber;
    insertedCount: z.ZodNumber;
    invalidCount: z.ZodNumber;
    dedupedCount: z.ZodNumber;
}, z.core.$strip>;
export declare const ingestObservationEventSchema: z.ZodObject<{
    clientEventId: z.ZodString;
    kind: z.ZodString;
    observedAt: z.ZodString;
    payload: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    pageLabel: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const ingestObservationsBodySchema: z.ZodObject<{
    events: z.ZodArray<z.ZodObject<{
        clientEventId: z.ZodString;
        kind: z.ZodString;
        observedAt: z.ZodString;
        payload: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        pageLabel: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const ingestObservationsResponseSchema: z.ZodObject<{
    accepted: z.ZodNumber;
    duplicates: z.ZodNumber;
}, z.core.$strip>;
export declare const aiGatewayPromptCacheTtlSchema: z.ZodEnum<{
    none: "none";
    "1h": "1h";
    "5m": "5m";
}>;
export declare const aiGatewayReasoningEffortSchema: z.ZodEnum<{
    off: "off";
    high: "high";
    low: "low";
    medium: "medium";
    max: "max";
}>;
export declare const aiGatewayPromptBlockSchema: z.ZodObject<{
    text: z.ZodString;
    cache: z.ZodEnum<{
        none: "none";
        "1h": "1h";
        "5m": "5m";
    }>;
}, z.core.$strict>;
export declare const AI_FEATURE_DEBUG_PROMPT_BLOCK_MAX_CHARS = 2500000;
export declare const aiFeatureDebugPromptBlockSchema: z.ZodObject<{
    text: z.ZodString;
    cache: z.ZodEnum<{
        none: "none";
        "1h": "1h";
        "5m": "5m";
    }>;
}, z.core.$strict>;
export declare const aiFeatureDebugInputFrameSchema: z.ZodObject<{
    type: z.ZodLiteral<"debug_input_v1">;
    systemBlocks: z.ZodArray<z.ZodObject<{
        text: z.ZodString;
        cache: z.ZodEnum<{
            none: "none";
            "1h": "1h";
            "5m": "5m";
        }>;
    }, z.core.$strict>>;
    userBlocks: z.ZodArray<z.ZodObject<{
        text: z.ZodString;
        cache: z.ZodEnum<{
            none: "none";
            "1h": "1h";
            "5m": "5m";
        }>;
    }, z.core.$strict>>;
    contextManifest: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strict>;
export declare const aiGatewayStreamBodySchema: z.ZodObject<{
    clientRequestId: z.ZodString;
    feature: z.ZodEnum<{
        "fast-reply": "fast-reply";
        "improve-draft": "improve-draft";
        "help-me": "help-me";
        "fan-summary": "fan-summary";
        "chat-review": "chat-review";
        scan: "scan";
        ping: "ping";
        "hi-greeting": "hi-greeting";
        "workboard-closing": "workboard-closing";
    }>;
    pageLabel: z.ZodString;
    platform: z.ZodEnum<{
        fansly: "fansly";
        onlyfans: "onlyfans";
    }>;
    platformUserId: z.ZodString;
    conversationId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    model: z.ZodString;
    reasoningEffort: z.ZodEnum<{
        off: "off";
        high: "high";
        low: "low";
        medium: "medium";
        max: "max";
    }>;
    temperature: z.ZodOptional<z.ZodNumber>;
    maxTokens: z.ZodOptional<z.ZodNumber>;
    isRegeneration: z.ZodBoolean;
    prompt: z.ZodObject<{
        systemBlocks: z.ZodArray<z.ZodObject<{
            text: z.ZodString;
            cache: z.ZodEnum<{
                none: "none";
                "1h": "1h";
                "5m": "5m";
            }>;
        }, z.core.$strict>>;
        userBlocks: z.ZodArray<z.ZodObject<{
            text: z.ZodString;
            cache: z.ZodEnum<{
                none: "none";
                "1h": "1h";
                "5m": "5m";
            }>;
        }, z.core.$strict>>;
    }, z.core.$strict>;
}, z.core.$strict>;
export declare const aiGatewayUsageSchema: z.ZodObject<{
    inputTokens: z.ZodNumber;
    outputTokens: z.ZodNumber;
    cacheWriteTokens: z.ZodNumber;
    cacheReadTokens: z.ZodNumber;
    costMicroUsd: z.ZodNumber;
    costApproximate: z.ZodBoolean;
}, z.core.$strip>;
export declare const aiGatewayQuotaSchema: z.ZodObject<{
    accepted: z.ZodBoolean;
    remainingRequestsToday: z.ZodNullable<z.ZodNumber>;
    remainingMicroUsdToday: z.ZodNullable<z.ZodNumber>;
}, z.core.$strip>;
export declare const aiGatewayStreamFrameSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"meta">;
    requestId: z.ZodString;
    clientRequestId: z.ZodString;
    feature: z.ZodEnum<{
        "fast-reply": "fast-reply";
        "improve-draft": "improve-draft";
        "help-me": "help-me";
        "fan-summary": "fan-summary";
        "chat-review": "chat-review";
        scan: "scan";
        ping: "ping";
        "hi-greeting": "hi-greeting";
        "workboard-closing": "workboard-closing";
    }>;
    pageLabel: z.ZodString;
    model: z.ZodString;
    provider: z.ZodEnum<{
        anthropic: "anthropic";
        openrouter: "openrouter";
    }>;
    providerResponseId: z.ZodNullable<z.ZodString>;
    personaDefinitionId: z.ZodOptional<z.ZodString>;
    quota: z.ZodObject<{
        accepted: z.ZodBoolean;
        remainingRequestsToday: z.ZodNullable<z.ZodNumber>;
        remainingMicroUsdToday: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"content_delta">;
    text: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"reasoning_delta">;
    text: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"usage">;
    usage: z.ZodObject<{
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cacheWriteTokens: z.ZodNumber;
        cacheReadTokens: z.ZodNumber;
        costMicroUsd: z.ZodNumber;
        costApproximate: z.ZodBoolean;
    }, z.core.$strip>;
    providerResponseId: z.ZodNullable<z.ZodString>;
    cacheHit: z.ZodBoolean;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"error">;
    code: z.ZodString;
    message: z.ZodString;
    retryAfterMs: z.ZodNullable<z.ZodNumber>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"done">;
    stopReason: z.ZodNullable<z.ZodString>;
}, z.core.$strict>], "type">;
export declare const aiFeatureStreamFrameSchema: z.ZodUnion<readonly [z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"meta">;
    requestId: z.ZodString;
    clientRequestId: z.ZodString;
    feature: z.ZodEnum<{
        "fast-reply": "fast-reply";
        "improve-draft": "improve-draft";
        "help-me": "help-me";
        "fan-summary": "fan-summary";
        "chat-review": "chat-review";
        scan: "scan";
        ping: "ping";
        "hi-greeting": "hi-greeting";
        "workboard-closing": "workboard-closing";
    }>;
    pageLabel: z.ZodString;
    model: z.ZodString;
    provider: z.ZodEnum<{
        anthropic: "anthropic";
        openrouter: "openrouter";
    }>;
    providerResponseId: z.ZodNullable<z.ZodString>;
    personaDefinitionId: z.ZodOptional<z.ZodString>;
    quota: z.ZodObject<{
        accepted: z.ZodBoolean;
        remainingRequestsToday: z.ZodNullable<z.ZodNumber>;
        remainingMicroUsdToday: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"content_delta">;
    text: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"reasoning_delta">;
    text: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"usage">;
    usage: z.ZodObject<{
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cacheWriteTokens: z.ZodNumber;
        cacheReadTokens: z.ZodNumber;
        costMicroUsd: z.ZodNumber;
        costApproximate: z.ZodBoolean;
    }, z.core.$strip>;
    providerResponseId: z.ZodNullable<z.ZodString>;
    cacheHit: z.ZodBoolean;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"error">;
    code: z.ZodString;
    message: z.ZodString;
    retryAfterMs: z.ZodNullable<z.ZodNumber>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"done">;
    stopReason: z.ZodNullable<z.ZodString>;
}, z.core.$strict>], "type">, z.ZodObject<{
    type: z.ZodLiteral<"debug_input_v1">;
    systemBlocks: z.ZodArray<z.ZodObject<{
        text: z.ZodString;
        cache: z.ZodEnum<{
            none: "none";
            "1h": "1h";
            "5m": "5m";
        }>;
    }, z.core.$strict>>;
    userBlocks: z.ZodArray<z.ZodObject<{
        text: z.ZodString;
        cache: z.ZodEnum<{
            none: "none";
            "1h": "1h";
            "5m": "5m";
        }>;
    }, z.core.$strict>>;
    contextManifest: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strict>]>;
export declare const aiPersonaSchema: z.ZodObject<{
    key: z.ZodString;
    displayName: z.ZodString;
    systemBlock: z.ZodString;
    updatedAt: z.ZodString;
    version: z.ZodNumber;
}, z.core.$strip>;
export declare const aiPersonasResponseSchema: z.ZodObject<{
    personas: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        displayName: z.ZodString;
        systemBlock: z.ZodString;
        updatedAt: z.ZodString;
        version: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const aiPersonaUpsertParamsSchema: z.ZodObject<{
    key: z.ZodString;
}, z.core.$strip>;
export declare const aiPersonaUpsertBodySchema: z.ZodObject<{
    displayName: z.ZodString;
    systemBlock: z.ZodString;
    expectedVersion: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, z.core.$strict>;
export declare const aiPersonaArchiveQuerySchema: z.ZodObject<{
    expectedVersion: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
}, z.core.$strict>;
export declare const aiPersonaCatalogItemSchema: z.ZodObject<{
    key: z.ZodString;
    displayName: z.ZodString;
    version: z.ZodNumber;
    definitionId: z.ZodString;
    status: z.ZodEnum<{
        active: "active";
        archived: "archived";
    }>;
}, z.core.$strip>;
export declare const aiPersonaCatalogResponseSchema: z.ZodObject<{
    personas: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        displayName: z.ZodString;
        version: z.ZodNumber;
        definitionId: z.ZodString;
        status: z.ZodEnum<{
            active: "active";
            archived: "archived";
        }>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const adminAiPersonaSchema: z.ZodObject<{
    key: z.ZodString;
    displayName: z.ZodString;
    systemBlock: z.ZodString;
    updatedAt: z.ZodString;
    version: z.ZodNumber;
    status: z.ZodEnum<{
        active: "active";
        archived: "archived";
    }>;
}, z.core.$strip>;
export declare const adminAiPersonasResponseSchema: z.ZodObject<{
    personas: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        displayName: z.ZodString;
        systemBlock: z.ZodString;
        updatedAt: z.ZodString;
        version: z.ZodNumber;
        status: z.ZodEnum<{
            active: "active";
            archived: "archived";
        }>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const adminAiPersonaCreateBodySchema: z.ZodObject<{
    key: z.ZodString;
    displayName: z.ZodString;
    systemBlock: z.ZodString;
}, z.core.$strict>;
export declare const adminAiPersonaParamsSchema: z.ZodObject<{
    key: z.ZodString;
}, z.core.$strip>;
export declare const adminAiPersonaUpdateBodySchema: z.ZodObject<{
    displayName: z.ZodString;
    systemBlock: z.ZodString;
    expectedVersion: z.ZodNumber;
}, z.core.$strict>;
export declare const adminAiPersonaArchiveQuerySchema: z.ZodObject<{
    expectedVersion: z.ZodCoercedNumber<unknown>;
}, z.core.$strict>;
export declare const aiFeatureStreamParamsSchema: z.ZodObject<{
    feature: z.ZodString;
}, z.core.$strip>;
export declare const aiFeatureStreamBodySchema: z.ZodObject<{
    clientRequestId: z.ZodString;
    pageLabel: z.ZodString;
    platform: z.ZodEnum<{
        fansly: "fansly";
        onlyfans: "onlyfans";
    }>;
    conversationRef: z.ZodString;
    fanRef: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    personaKey: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    expectedPersonaDefinitionId: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
    reasoningEffort: z.ZodOptional<z.ZodEnum<{
        off: "off";
        high: "high";
        low: "low";
        medium: "medium";
        max: "max";
    }>>;
    replyTone: z.ZodOptional<z.ZodEnum<{
        none: "none";
        casual: "casual";
        flirty: "flirty";
        upsell: "upsell";
        spicy: "spicy";
    }>>;
    replyMode: z.ZodOptional<z.ZodEnum<{
        default: "default";
        preferSplit: "preferSplit";
    }>>;
    messageCount: z.ZodOptional<z.ZodNumber>;
    draftText: z.ZodOptional<z.ZodString>;
    isRegeneration: z.ZodOptional<z.ZodBoolean>;
    clientContext: z.ZodOptional<z.ZodObject<{
        transcript: z.ZodString;
        messageCount: z.ZodNumber;
        fanDisplayName: z.ZodString;
        fanSpendingData: z.ZodDefault<z.ZodString>;
        fanSubscriptionData: z.ZodDefault<z.ZodString>;
        fanBio: z.ZodOptional<z.ZodString>;
        pingSegment: z.ZodOptional<z.ZodEnum<{
            active: "active";
            "segment-a": "segment-a";
            "segment-b": "segment-b";
        }>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const aiRestrictedGenerationSchema: z.ZodObject<{
    generationRef: z.ZodString;
    feature: z.ZodString;
    model: z.ZodString;
    provider: z.ZodString;
    userId: z.ZodNullable<z.ZodNumber>;
    pageId: z.ZodNullable<z.ZodNumber>;
    conversationRef: z.ZodNullable<z.ZodString>;
    promptBlocks: z.ZodArray<z.ZodUnknown>;
    completion: z.ZodString;
    params: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    createdAt: z.ZodString;
}, z.core.$strip>;
export declare const aiRestrictedGenerationsQuerySchema: z.ZodObject<{
    feature: z.ZodOptional<z.ZodString>;
    pageId: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    limit: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export declare const aiRestrictedGenerationsResponseSchema: z.ZodObject<{
    generations: z.ZodArray<z.ZodObject<{
        generationRef: z.ZodString;
        feature: z.ZodString;
        model: z.ZodString;
        provider: z.ZodString;
        userId: z.ZodNullable<z.ZodNumber>;
        pageId: z.ZodNullable<z.ZodNumber>;
        conversationRef: z.ZodNullable<z.ZodString>;
        promptBlocks: z.ZodArray<z.ZodUnknown>;
        completion: z.ZodString;
        params: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        createdAt: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const aiRestrictedAcceptanceEventSchema: z.ZodObject<{
    lifecycle: z.ZodEnum<{
        shown: "shown";
        copied: "copied";
        inserted: "inserted";
        edited: "edited";
        sent: "sent";
    }>;
    userId: z.ZodNullable<z.ZodNumber>;
    occurredAt: z.ZodString;
}, z.core.$strip>;
export declare const aiRestrictedGenerationParamsSchema: z.ZodObject<{
    generationRef: z.ZodString;
}, z.core.$strip>;
export declare const aiRestrictedGenerationDetailResponseSchema: z.ZodObject<{
    generation: z.ZodObject<{
        generationRef: z.ZodString;
        feature: z.ZodString;
        model: z.ZodString;
        provider: z.ZodString;
        userId: z.ZodNullable<z.ZodNumber>;
        pageId: z.ZodNullable<z.ZodNumber>;
        conversationRef: z.ZodNullable<z.ZodString>;
        promptBlocks: z.ZodArray<z.ZodUnknown>;
        completion: z.ZodString;
        params: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        createdAt: z.ZodString;
    }, z.core.$strip>;
    acceptance: z.ZodArray<z.ZodObject<{
        lifecycle: z.ZodEnum<{
            shown: "shown";
            copied: "copied";
            inserted: "inserted";
            edited: "edited";
            sent: "sent";
        }>;
        userId: z.ZodNullable<z.ZodNumber>;
        occurredAt: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const adminChatterUsageQuerySchema: z.ZodObject<{
    from: z.ZodOptional<z.ZodString>;
    to: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const aiUsageTokenCountsSchema: z.ZodObject<{
    input: z.ZodNumber;
    output: z.ZodNumber;
    cacheWrite: z.ZodNumber;
    cacheRead: z.ZodNumber;
    cacheTotal: z.ZodNumber;
}, z.core.$strip>;
export declare const aiUsageTopFeatureSchema: z.ZodObject<{
    feature: z.ZodEnum<{
        "fast-reply": "fast-reply";
        "improve-draft": "improve-draft";
        "help-me": "help-me";
        "fan-summary": "fan-summary";
        "chat-review": "chat-review";
        scan: "scan";
        ping: "ping";
        "hi-greeting": "hi-greeting";
        "workboard-closing": "workboard-closing";
    }>;
    requestCount: z.ZodNumber;
    sharePct: z.ZodNumber;
}, z.core.$strip>;
export declare const aiUsageFeatureBreakdownSchema: z.ZodObject<{
    feature: z.ZodEnum<{
        "fast-reply": "fast-reply";
        "improve-draft": "improve-draft";
        "help-me": "help-me";
        "fan-summary": "fan-summary";
        "chat-review": "chat-review";
        scan: "scan";
        ping: "ping";
        "hi-greeting": "hi-greeting";
        "workboard-closing": "workboard-closing";
    }>;
    requestCount: z.ZodNumber;
    sharePct: z.ZodNumber;
    tokenCounts: z.ZodObject<{
        input: z.ZodNumber;
        output: z.ZodNumber;
        cacheWrite: z.ZodNumber;
        cacheRead: z.ZodNumber;
        cacheTotal: z.ZodNumber;
    }, z.core.$strip>;
    costMicroUsd: z.ZodNumber;
    costApproximate: z.ZodBoolean;
    regenerateRatePct: z.ZodNumber;
}, z.core.$strip>;
export declare const aiUsageCostSummarySchema: z.ZodObject<{
    microUsd: z.ZodNumber;
    approximate: z.ZodBoolean;
}, z.core.$strip>;
export declare const aiUsageGatewaySummarySchema: z.ZodObject<{
    requestCount: z.ZodNumber;
    completedCount: z.ZodNumber;
    failedCount: z.ZodNumber;
    cancelledCount: z.ZodNumber;
    quotaDeniedCount: z.ZodNumber;
    openReservationCount: z.ZodNumber;
    providerBreakdown: z.ZodArray<z.ZodObject<{
        provider: z.ZodEnum<{
            anthropic: "anthropic";
            openrouter: "openrouter";
        }>;
        requestCount: z.ZodNumber;
        costMicroUsd: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const adminChatterUsageRowSchema: z.ZodObject<{
    userId: z.ZodNumber;
    username: z.ZodString;
    totalGenerations: z.ZodNumber;
    tokenCounts: z.ZodObject<{
        input: z.ZodNumber;
        output: z.ZodNumber;
        cacheWrite: z.ZodNumber;
        cacheRead: z.ZodNumber;
        cacheTotal: z.ZodNumber;
    }, z.core.$strip>;
    cost: z.ZodObject<{
        microUsd: z.ZodNumber;
        approximate: z.ZodBoolean;
    }, z.core.$strip>;
    gateway: z.ZodObject<{
        requestCount: z.ZodNumber;
        completedCount: z.ZodNumber;
        failedCount: z.ZodNumber;
        cancelledCount: z.ZodNumber;
        quotaDeniedCount: z.ZodNumber;
        openReservationCount: z.ZodNumber;
        providerBreakdown: z.ZodArray<z.ZodObject<{
            provider: z.ZodEnum<{
                anthropic: "anthropic";
                openrouter: "openrouter";
            }>;
            requestCount: z.ZodNumber;
            costMicroUsd: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    topFeature: z.ZodNullable<z.ZodObject<{
        feature: z.ZodEnum<{
            "fast-reply": "fast-reply";
            "improve-draft": "improve-draft";
            "help-me": "help-me";
            "fan-summary": "fan-summary";
            "chat-review": "chat-review";
            scan: "scan";
            ping: "ping";
            "hi-greeting": "hi-greeting";
            "workboard-closing": "workboard-closing";
        }>;
        requestCount: z.ZodNumber;
        sharePct: z.ZodNumber;
    }, z.core.$strip>>;
    featureBreakdown: z.ZodArray<z.ZodObject<{
        feature: z.ZodEnum<{
            "fast-reply": "fast-reply";
            "improve-draft": "improve-draft";
            "help-me": "help-me";
            "fan-summary": "fan-summary";
            "chat-review": "chat-review";
            scan: "scan";
            ping: "ping";
            "hi-greeting": "hi-greeting";
            "workboard-closing": "workboard-closing";
        }>;
        requestCount: z.ZodNumber;
        sharePct: z.ZodNumber;
        tokenCounts: z.ZodObject<{
            input: z.ZodNumber;
            output: z.ZodNumber;
            cacheWrite: z.ZodNumber;
            cacheRead: z.ZodNumber;
            cacheTotal: z.ZodNumber;
        }, z.core.$strip>;
        costMicroUsd: z.ZodNumber;
        costApproximate: z.ZodBoolean;
        regenerateRatePct: z.ZodNumber;
    }, z.core.$strip>>;
    regenerateRatePct: z.ZodNumber;
    warning: z.ZodBoolean;
}, z.core.$strip>;
export declare const adminChatterUsageResponseSchema: z.ZodObject<{
    range: z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
        timeZone: z.ZodString;
    }, z.core.$strip>;
    rows: z.ZodArray<z.ZodObject<{
        userId: z.ZodNumber;
        username: z.ZodString;
        totalGenerations: z.ZodNumber;
        tokenCounts: z.ZodObject<{
            input: z.ZodNumber;
            output: z.ZodNumber;
            cacheWrite: z.ZodNumber;
            cacheRead: z.ZodNumber;
            cacheTotal: z.ZodNumber;
        }, z.core.$strip>;
        cost: z.ZodObject<{
            microUsd: z.ZodNumber;
            approximate: z.ZodBoolean;
        }, z.core.$strip>;
        gateway: z.ZodObject<{
            requestCount: z.ZodNumber;
            completedCount: z.ZodNumber;
            failedCount: z.ZodNumber;
            cancelledCount: z.ZodNumber;
            quotaDeniedCount: z.ZodNumber;
            openReservationCount: z.ZodNumber;
            providerBreakdown: z.ZodArray<z.ZodObject<{
                provider: z.ZodEnum<{
                    anthropic: "anthropic";
                    openrouter: "openrouter";
                }>;
                requestCount: z.ZodNumber;
                costMicroUsd: z.ZodNumber;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        topFeature: z.ZodNullable<z.ZodObject<{
            feature: z.ZodEnum<{
                "fast-reply": "fast-reply";
                "improve-draft": "improve-draft";
                "help-me": "help-me";
                "fan-summary": "fan-summary";
                "chat-review": "chat-review";
                scan: "scan";
                ping: "ping";
                "hi-greeting": "hi-greeting";
                "workboard-closing": "workboard-closing";
            }>;
            requestCount: z.ZodNumber;
            sharePct: z.ZodNumber;
        }, z.core.$strip>>;
        featureBreakdown: z.ZodArray<z.ZodObject<{
            feature: z.ZodEnum<{
                "fast-reply": "fast-reply";
                "improve-draft": "improve-draft";
                "help-me": "help-me";
                "fan-summary": "fan-summary";
                "chat-review": "chat-review";
                scan: "scan";
                ping: "ping";
                "hi-greeting": "hi-greeting";
                "workboard-closing": "workboard-closing";
            }>;
            requestCount: z.ZodNumber;
            sharePct: z.ZodNumber;
            tokenCounts: z.ZodObject<{
                input: z.ZodNumber;
                output: z.ZodNumber;
                cacheWrite: z.ZodNumber;
                cacheRead: z.ZodNumber;
                cacheTotal: z.ZodNumber;
            }, z.core.$strip>;
            costMicroUsd: z.ZodNumber;
            costApproximate: z.ZodBoolean;
            regenerateRatePct: z.ZodNumber;
        }, z.core.$strip>>;
        regenerateRatePct: z.ZodNumber;
        warning: z.ZodBoolean;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const adminCreateUserBodySchema: z.ZodObject<{
    username: z.ZodString;
    role: z.ZodEnum<{
        owner: "owner";
        team_lead: "team_lead";
        chatter: "chatter";
    }>;
    password: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const adminSetPasswordBodySchema: z.ZodObject<{
    password: z.ZodString;
    mustChangePassword: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export declare const adminAssignPageBodySchema: z.ZodObject<{
    pageLabel: z.ZodString;
}, z.core.$strip>;
export declare const adminIssueApiKeyBodySchema: z.ZodObject<{
    pageLabel: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const apiKeyItemSchema: z.ZodObject<{
    id: z.ZodNumber;
    keyPrefix: z.ZodString;
    userId: z.ZodNumber;
    isActive: z.ZodBoolean;
    revokedAt: z.ZodNullable<z.ZodString>;
    revokedReason: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
    lastUsedAt: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const issuedApiKeyResponseSchema: z.ZodObject<{
    key: z.ZodString;
    keyPrefix: z.ZodString;
    assignedPages: z.ZodArray<z.ZodObject<{
        id: z.ZodNumber;
        label: z.ZodString;
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        modelSlug: z.ZodString;
        modelName: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const syncRunItemSchema: z.ZodObject<{
    runId: z.ZodNumber;
    platformAccountId: z.ZodNumber;
    pageLabel: z.ZodString;
    platform: z.ZodEnum<{
        fansly: "fansly";
        onlyfans: "onlyfans";
    }>;
    stream: z.ZodString;
    trigger: z.ZodString;
    status: z.ZodString;
    startedAt: z.ZodString;
    finishedAt: z.ZodNullable<z.ZodString>;
    errorSummary: z.ZodNullable<z.ZodString>;
    stats: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, z.core.$strip>;
export declare const syncRunDetailResponseSchema: z.ZodObject<{
    run: z.ZodObject<{
        runId: z.ZodNumber;
        platformAccountId: z.ZodNumber;
        pageLabel: z.ZodString;
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        stream: z.ZodString;
        trigger: z.ZodString;
        status: z.ZodString;
        startedAt: z.ZodString;
        finishedAt: z.ZodNullable<z.ZodString>;
        errorSummary: z.ZodNullable<z.ZodString>;
        stats: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, z.core.$strip>;
    events: z.ZodArray<z.ZodObject<{
        id: z.ZodNumber;
        runId: z.ZodNumber;
        platformAccountId: z.ZodNumber;
        pageLabel: z.ZodString;
        provider: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        stream: z.ZodString;
        eventType: z.ZodString;
        severity: z.ZodString;
        message: z.ZodString;
        details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        emittedAt: z.ZodString;
    }, z.core.$strip>>;
    attempts: z.ZodArray<z.ZodObject<{
        attemptId: z.ZodNumber;
        runId: z.ZodNumber;
        platformAccountId: z.ZodNumber;
        pageLabel: z.ZodString;
        provider: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        stream: z.ZodString;
        operation: z.ZodString;
        logicalRequestId: z.ZodString;
        attemptNumber: z.ZodNumber;
        state: z.ZodString;
        failureKind: z.ZodNullable<z.ZodString>;
        httpStatus: z.ZodNullable<z.ZodNumber>;
        retryDelayMs: z.ZodNullable<z.ZodNumber>;
        durationMs: z.ZodNullable<z.ZodNumber>;
        requestShape: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        responseShape: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        errorMessage: z.ZodNullable<z.ZodString>;
        startedAt: z.ZodString;
        finishedAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const syncMonitorProgressSchema: z.ZodObject<{
    label: z.ZodString;
    current: z.ZodNumber;
    total: z.ZodNullable<z.ZodNumber>;
    unit: z.ZodString;
    percent: z.ZodNullable<z.ZodNumber>;
}, z.core.$strip>;
export declare const syncMonitorRateHealthSchema: z.ZodObject<{
    state: z.ZodEnum<{
        healthy: "healthy";
        warning: "warning";
        limited: "limited";
    }>;
    last429At: z.ZodNullable<z.ZodString>;
    nextAvailableAt: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const syncMonitorRecentRunsSchema: z.ZodObject<{
    running: z.ZodNumber;
    success: z.ZodNumber;
    partial: z.ZodNumber;
    failed: z.ZodNumber;
    skipped: z.ZodNumber;
}, z.core.$strip>;
export declare const syncMonitorRecentErrorsSchema: z.ZodObject<{
    total429s: z.ZodNumber;
    total5xxs: z.ZodNumber;
    failedRuns: z.ZodNumber;
    failedAttempts: z.ZodNumber;
    retryAttempts: z.ZodNumber;
    last429At: z.ZodNullable<z.ZodString>;
    last5xxAt: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const syncMonitorLastCompletionSchema: z.ZodObject<{
    runId: z.ZodNumber;
    trigger: z.ZodString;
    status: z.ZodEnum<{
        failed: "failed";
        success: "success";
        partial: "partial";
        skipped: "skipped";
    }>;
    startedAt: z.ZodString;
    finishedAt: z.ZodString;
    durationMs: z.ZodNullable<z.ZodNumber>;
    errorSummary: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const syncMonitorActiveRunSchema: z.ZodObject<{
    runId: z.ZodNumber;
    trigger: z.ZodString;
    startedAt: z.ZodString;
    lastActivityAt: z.ZodString;
}, z.core.$strip>;
export declare const syncMonitorDeepBackfillSchema: z.ZodObject<{
    pendingConversations: z.ZodNumber;
    pendingPagesEstimate: z.ZodNumber;
    spenderPendingConversations: z.ZodNumber;
    spenderPendingPagesEstimate: z.ZodNumber;
    regularPendingConversations: z.ZodNumber;
    regularPendingPagesEstimate: z.ZodNumber;
    recentRequests: z.ZodNumber;
    lastCompletedAt: z.ZodNullable<z.ZodString>;
    liveRequestsSinceDeepBackfill: z.ZodNumber;
    active: z.ZodBoolean;
    stalled: z.ZodBoolean;
    stallReason: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const syncMonitorStreamItemSchema: z.ZodObject<{
    stream: z.ZodEnum<{
        subscribers: "subscribers";
        light: "light";
        followers: "followers";
        fan_identities: "fan_identities";
        transactions: "transactions";
        top_spenders: "top_spenders";
        dm_conversations: "dm_conversations";
        dm_messages: "dm_messages";
        followers_reconcile: "followers_reconcile";
        fan_earnings: "fan_earnings";
        purchase_history: "purchase_history";
    }>;
    status: z.ZodEnum<{
        pending: "pending";
        retrying: "retrying";
        idle: "idle";
        running: "running";
        blocked: "blocked";
        paused: "paused";
    }>;
    stalled: z.ZodBoolean;
    pending: z.ZodBoolean;
    retryAt: z.ZodNullable<z.ZodString>;
    progress: z.ZodNullable<z.ZodObject<{
        label: z.ZodString;
        current: z.ZodNumber;
        total: z.ZodNullable<z.ZodNumber>;
        unit: z.ZodString;
        percent: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>;
    deepBackfill: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        pendingConversations: z.ZodNumber;
        pendingPagesEstimate: z.ZodNumber;
        spenderPendingConversations: z.ZodNumber;
        spenderPendingPagesEstimate: z.ZodNumber;
        regularPendingConversations: z.ZodNumber;
        regularPendingPagesEstimate: z.ZodNumber;
        recentRequests: z.ZodNumber;
        lastCompletedAt: z.ZodNullable<z.ZodString>;
        liveRequestsSinceDeepBackfill: z.ZodNumber;
        active: z.ZodBoolean;
        stalled: z.ZodBoolean;
        stallReason: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>>;
    recentRuns: z.ZodObject<{
        running: z.ZodNumber;
        success: z.ZodNumber;
        partial: z.ZodNumber;
        failed: z.ZodNumber;
        skipped: z.ZodNumber;
    }, z.core.$strip>;
    recentErrors: z.ZodObject<{
        total429s: z.ZodNumber;
        total5xxs: z.ZodNumber;
        failedRuns: z.ZodNumber;
        failedAttempts: z.ZodNumber;
        retryAttempts: z.ZodNumber;
        last429At: z.ZodNullable<z.ZodString>;
        last5xxAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    rateHealth: z.ZodObject<{
        state: z.ZodEnum<{
            healthy: "healthy";
            warning: "warning";
            limited: "limited";
        }>;
        last429At: z.ZodNullable<z.ZodString>;
        nextAvailableAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    activeRun: z.ZodNullable<z.ZodObject<{
        runId: z.ZodNumber;
        trigger: z.ZodString;
        startedAt: z.ZodString;
        lastActivityAt: z.ZodString;
    }, z.core.$strip>>;
    lastCompletion: z.ZodNullable<z.ZodObject<{
        runId: z.ZodNumber;
        trigger: z.ZodString;
        status: z.ZodEnum<{
            failed: "failed";
            success: "success";
            partial: "partial";
            skipped: "skipped";
        }>;
        startedAt: z.ZodString;
        finishedAt: z.ZodString;
        durationMs: z.ZodNullable<z.ZodNumber>;
        errorSummary: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    succeededAt: z.ZodNullable<z.ZodString>;
    failedAt: z.ZodNullable<z.ZodString>;
    lastErrorSummary: z.ZodNullable<z.ZodString>;
    consecutiveFailures: z.ZodNumber;
    syncUx: z.ZodObject<{
        state: z.ZodEnum<{
            healthy: "healthy";
            syncing: "syncing";
            catching_up: "catching_up";
            retrying: "retrying";
            attention: "attention";
            setup: "setup";
            off: "off";
        }>;
        label: z.ZodString;
        headline: z.ZodString;
        detail: z.ZodNullable<z.ZodString>;
        progressLabel: z.ZodNullable<z.ZodString>;
        nextRetryAt: z.ZodNullable<z.ZodString>;
        updatedAt: z.ZodNullable<z.ZodString>;
        requiresAction: z.ZodBoolean;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const syncMonitorPageCountsSchema: z.ZodObject<{
    fans: z.ZodNumber;
    followers: z.ZodNumber;
    subscribers: z.ZodNumber;
    transactions: z.ZodNumber;
    conversations: z.ZodNumber;
    messages: z.ZodNumber;
}, z.core.$strip>;
export declare const syncMonitorPageSummarySchema: z.ZodObject<{
    runningStreams: z.ZodNumber;
    blockedStreams: z.ZodNumber;
    stalledStreams: z.ZodNumber;
    pendingStreams: z.ZodNumber;
    retryingStreams: z.ZodNumber;
}, z.core.$strip>;
export declare const syncMonitorPageItemSchema: z.ZodObject<{
    pageId: z.ZodNumber;
    pageLabel: z.ZodString;
    platform: z.ZodEnum<{
        fansly: "fansly";
        onlyfans: "onlyfans";
    }>;
    modelSlug: z.ZodString;
    modelName: z.ZodString;
    username: z.ZodNullable<z.ZodString>;
    displayName: z.ZodNullable<z.ZodString>;
    counts: z.ZodObject<{
        fans: z.ZodNumber;
        followers: z.ZodNumber;
        subscribers: z.ZodNumber;
        transactions: z.ZodNumber;
        conversations: z.ZodNumber;
        messages: z.ZodNumber;
    }, z.core.$strip>;
    summary: z.ZodObject<{
        runningStreams: z.ZodNumber;
        blockedStreams: z.ZodNumber;
        stalledStreams: z.ZodNumber;
        pendingStreams: z.ZodNumber;
        retryingStreams: z.ZodNumber;
    }, z.core.$strip>;
    streams: z.ZodArray<z.ZodObject<{
        stream: z.ZodEnum<{
            subscribers: "subscribers";
            light: "light";
            followers: "followers";
            fan_identities: "fan_identities";
            transactions: "transactions";
            top_spenders: "top_spenders";
            dm_conversations: "dm_conversations";
            dm_messages: "dm_messages";
            followers_reconcile: "followers_reconcile";
            fan_earnings: "fan_earnings";
            purchase_history: "purchase_history";
        }>;
        status: z.ZodEnum<{
            pending: "pending";
            retrying: "retrying";
            idle: "idle";
            running: "running";
            blocked: "blocked";
            paused: "paused";
        }>;
        stalled: z.ZodBoolean;
        pending: z.ZodBoolean;
        retryAt: z.ZodNullable<z.ZodString>;
        progress: z.ZodNullable<z.ZodObject<{
            label: z.ZodString;
            current: z.ZodNumber;
            total: z.ZodNullable<z.ZodNumber>;
            unit: z.ZodString;
            percent: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strip>>;
        deepBackfill: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            pendingConversations: z.ZodNumber;
            pendingPagesEstimate: z.ZodNumber;
            spenderPendingConversations: z.ZodNumber;
            spenderPendingPagesEstimate: z.ZodNumber;
            regularPendingConversations: z.ZodNumber;
            regularPendingPagesEstimate: z.ZodNumber;
            recentRequests: z.ZodNumber;
            lastCompletedAt: z.ZodNullable<z.ZodString>;
            liveRequestsSinceDeepBackfill: z.ZodNumber;
            active: z.ZodBoolean;
            stalled: z.ZodBoolean;
            stallReason: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>>;
        recentRuns: z.ZodObject<{
            running: z.ZodNumber;
            success: z.ZodNumber;
            partial: z.ZodNumber;
            failed: z.ZodNumber;
            skipped: z.ZodNumber;
        }, z.core.$strip>;
        recentErrors: z.ZodObject<{
            total429s: z.ZodNumber;
            total5xxs: z.ZodNumber;
            failedRuns: z.ZodNumber;
            failedAttempts: z.ZodNumber;
            retryAttempts: z.ZodNumber;
            last429At: z.ZodNullable<z.ZodString>;
            last5xxAt: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
        rateHealth: z.ZodObject<{
            state: z.ZodEnum<{
                healthy: "healthy";
                warning: "warning";
                limited: "limited";
            }>;
            last429At: z.ZodNullable<z.ZodString>;
            nextAvailableAt: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
        activeRun: z.ZodNullable<z.ZodObject<{
            runId: z.ZodNumber;
            trigger: z.ZodString;
            startedAt: z.ZodString;
            lastActivityAt: z.ZodString;
        }, z.core.$strip>>;
        lastCompletion: z.ZodNullable<z.ZodObject<{
            runId: z.ZodNumber;
            trigger: z.ZodString;
            status: z.ZodEnum<{
                failed: "failed";
                success: "success";
                partial: "partial";
                skipped: "skipped";
            }>;
            startedAt: z.ZodString;
            finishedAt: z.ZodString;
            durationMs: z.ZodNullable<z.ZodNumber>;
            errorSummary: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
        succeededAt: z.ZodNullable<z.ZodString>;
        failedAt: z.ZodNullable<z.ZodString>;
        lastErrorSummary: z.ZodNullable<z.ZodString>;
        consecutiveFailures: z.ZodNumber;
        syncUx: z.ZodObject<{
            state: z.ZodEnum<{
                healthy: "healthy";
                syncing: "syncing";
                catching_up: "catching_up";
                retrying: "retrying";
                attention: "attention";
                setup: "setup";
                off: "off";
            }>;
            label: z.ZodString;
            headline: z.ZodString;
            detail: z.ZodNullable<z.ZodString>;
            progressLabel: z.ZodNullable<z.ZodString>;
            nextRetryAt: z.ZodNullable<z.ZodString>;
            updatedAt: z.ZodNullable<z.ZodString>;
            requiresAction: z.ZodBoolean;
        }, z.core.$strip>;
    }, z.core.$strip>>;
    syncUx: z.ZodObject<{
        state: z.ZodEnum<{
            healthy: "healthy";
            syncing: "syncing";
            catching_up: "catching_up";
            retrying: "retrying";
            attention: "attention";
            setup: "setup";
            off: "off";
        }>;
        label: z.ZodString;
        headline: z.ZodString;
        detail: z.ZodNullable<z.ZodString>;
        progressLabel: z.ZodNullable<z.ZodString>;
        nextRetryAt: z.ZodNullable<z.ZodString>;
        updatedAt: z.ZodNullable<z.ZodString>;
        requiresAction: z.ZodBoolean;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const syncMonitorProviderSummarySchema: z.ZodObject<{
    platform: z.ZodEnum<{
        fansly: "fansly";
        onlyfans: "onlyfans";
    }>;
    rateHealth: z.ZodObject<{
        state: z.ZodEnum<{
            healthy: "healthy";
            warning: "warning";
            limited: "limited";
        }>;
        last429At: z.ZodNullable<z.ZodString>;
        nextAvailableAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    recent429s: z.ZodNumber;
    recent5xxs: z.ZodNumber;
}, z.core.$strip>;
export declare const syncMonitorOverallSchema: z.ZodObject<{
    pages: z.ZodNumber;
    streams: z.ZodNumber;
    runningStreams: z.ZodNumber;
    blockedStreams: z.ZodNumber;
    stalledStreams: z.ZodNumber;
    pendingStreams: z.ZodNumber;
    retryingStreams: z.ZodNumber;
    counts: z.ZodObject<{
        fans: z.ZodNumber;
        followers: z.ZodNumber;
        subscribers: z.ZodNumber;
        transactions: z.ZodNumber;
        conversations: z.ZodNumber;
        messages: z.ZodNumber;
    }, z.core.$strip>;
    recentRuns: z.ZodObject<{
        running: z.ZodNumber;
        success: z.ZodNumber;
        partial: z.ZodNumber;
        failed: z.ZodNumber;
        skipped: z.ZodNumber;
    }, z.core.$strip>;
    recentErrors: z.ZodObject<{
        total429s: z.ZodNumber;
        total5xxs: z.ZodNumber;
        failedRuns: z.ZodNumber;
        failedAttempts: z.ZodNumber;
        retryAttempts: z.ZodNumber;
        last429At: z.ZodNullable<z.ZodString>;
        last5xxAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    providers: z.ZodArray<z.ZodObject<{
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        rateHealth: z.ZodObject<{
            state: z.ZodEnum<{
                healthy: "healthy";
                warning: "warning";
                limited: "limited";
            }>;
            last429At: z.ZodNullable<z.ZodString>;
            nextAvailableAt: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
        recent429s: z.ZodNumber;
        recent5xxs: z.ZodNumber;
    }, z.core.$strip>>;
    syncUx: z.ZodObject<{
        state: z.ZodEnum<{
            healthy: "healthy";
            syncing: "syncing";
            catching_up: "catching_up";
            retrying: "retrying";
            attention: "attention";
            setup: "setup";
            off: "off";
        }>;
        label: z.ZodString;
        headline: z.ZodString;
        detail: z.ZodNullable<z.ZodString>;
        progressLabel: z.ZodNullable<z.ZodString>;
        nextRetryAt: z.ZodNullable<z.ZodString>;
        updatedAt: z.ZodNullable<z.ZodString>;
        requiresAction: z.ZodBoolean;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const syncMonitorRecentEventSchema: z.ZodObject<{
    id: z.ZodNumber;
    runId: z.ZodNumber;
    pageId: z.ZodNumber;
    pageLabel: z.ZodString;
    platform: z.ZodEnum<{
        fansly: "fansly";
        onlyfans: "onlyfans";
    }>;
    stream: z.ZodEnum<{
        subscribers: "subscribers";
        light: "light";
        followers: "followers";
        fan_identities: "fan_identities";
        transactions: "transactions";
        top_spenders: "top_spenders";
        dm_conversations: "dm_conversations";
        dm_messages: "dm_messages";
        followers_reconcile: "followers_reconcile";
        fan_earnings: "fan_earnings";
        purchase_history: "purchase_history";
    }>;
    eventType: z.ZodString;
    severity: z.ZodEnum<{
        info: "info";
        warn: "warn";
        error: "error";
    }>;
    message: z.ZodString;
    details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    emittedAt: z.ZodString;
}, z.core.$strip>;
export declare const syncStatusQuerySchema: z.ZodObject<{
    pageLabel: z.ZodOptional<z.ZodString>;
    windowHours: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    eventLimit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export declare const syncStatusResponseSchema: z.ZodObject<{
    generatedAt: z.ZodString;
    window: z.ZodObject<{
        hours: z.ZodNumber;
        startedAt: z.ZodString;
    }, z.core.$strip>;
    overall: z.ZodObject<{
        pages: z.ZodNumber;
        streams: z.ZodNumber;
        runningStreams: z.ZodNumber;
        blockedStreams: z.ZodNumber;
        stalledStreams: z.ZodNumber;
        pendingStreams: z.ZodNumber;
        retryingStreams: z.ZodNumber;
        counts: z.ZodObject<{
            fans: z.ZodNumber;
            followers: z.ZodNumber;
            subscribers: z.ZodNumber;
            transactions: z.ZodNumber;
            conversations: z.ZodNumber;
            messages: z.ZodNumber;
        }, z.core.$strip>;
        recentRuns: z.ZodObject<{
            running: z.ZodNumber;
            success: z.ZodNumber;
            partial: z.ZodNumber;
            failed: z.ZodNumber;
            skipped: z.ZodNumber;
        }, z.core.$strip>;
        recentErrors: z.ZodObject<{
            total429s: z.ZodNumber;
            total5xxs: z.ZodNumber;
            failedRuns: z.ZodNumber;
            failedAttempts: z.ZodNumber;
            retryAttempts: z.ZodNumber;
            last429At: z.ZodNullable<z.ZodString>;
            last5xxAt: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
        providers: z.ZodArray<z.ZodObject<{
            platform: z.ZodEnum<{
                fansly: "fansly";
                onlyfans: "onlyfans";
            }>;
            rateHealth: z.ZodObject<{
                state: z.ZodEnum<{
                    healthy: "healthy";
                    warning: "warning";
                    limited: "limited";
                }>;
                last429At: z.ZodNullable<z.ZodString>;
                nextAvailableAt: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>;
            recent429s: z.ZodNumber;
            recent5xxs: z.ZodNumber;
        }, z.core.$strip>>;
        syncUx: z.ZodObject<{
            state: z.ZodEnum<{
                healthy: "healthy";
                syncing: "syncing";
                catching_up: "catching_up";
                retrying: "retrying";
                attention: "attention";
                setup: "setup";
                off: "off";
            }>;
            label: z.ZodString;
            headline: z.ZodString;
            detail: z.ZodNullable<z.ZodString>;
            progressLabel: z.ZodNullable<z.ZodString>;
            nextRetryAt: z.ZodNullable<z.ZodString>;
            updatedAt: z.ZodNullable<z.ZodString>;
            requiresAction: z.ZodBoolean;
        }, z.core.$strip>;
    }, z.core.$strip>;
    pages: z.ZodArray<z.ZodObject<{
        pageId: z.ZodNumber;
        pageLabel: z.ZodString;
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        modelSlug: z.ZodString;
        modelName: z.ZodString;
        username: z.ZodNullable<z.ZodString>;
        displayName: z.ZodNullable<z.ZodString>;
        counts: z.ZodObject<{
            fans: z.ZodNumber;
            followers: z.ZodNumber;
            subscribers: z.ZodNumber;
            transactions: z.ZodNumber;
            conversations: z.ZodNumber;
            messages: z.ZodNumber;
        }, z.core.$strip>;
        summary: z.ZodObject<{
            runningStreams: z.ZodNumber;
            blockedStreams: z.ZodNumber;
            stalledStreams: z.ZodNumber;
            pendingStreams: z.ZodNumber;
            retryingStreams: z.ZodNumber;
        }, z.core.$strip>;
        streams: z.ZodArray<z.ZodObject<{
            stream: z.ZodEnum<{
                subscribers: "subscribers";
                light: "light";
                followers: "followers";
                fan_identities: "fan_identities";
                transactions: "transactions";
                top_spenders: "top_spenders";
                dm_conversations: "dm_conversations";
                dm_messages: "dm_messages";
                followers_reconcile: "followers_reconcile";
                fan_earnings: "fan_earnings";
                purchase_history: "purchase_history";
            }>;
            status: z.ZodEnum<{
                pending: "pending";
                retrying: "retrying";
                idle: "idle";
                running: "running";
                blocked: "blocked";
                paused: "paused";
            }>;
            stalled: z.ZodBoolean;
            pending: z.ZodBoolean;
            retryAt: z.ZodNullable<z.ZodString>;
            progress: z.ZodNullable<z.ZodObject<{
                label: z.ZodString;
                current: z.ZodNumber;
                total: z.ZodNullable<z.ZodNumber>;
                unit: z.ZodString;
                percent: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strip>>;
            deepBackfill: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pendingConversations: z.ZodNumber;
                pendingPagesEstimate: z.ZodNumber;
                spenderPendingConversations: z.ZodNumber;
                spenderPendingPagesEstimate: z.ZodNumber;
                regularPendingConversations: z.ZodNumber;
                regularPendingPagesEstimate: z.ZodNumber;
                recentRequests: z.ZodNumber;
                lastCompletedAt: z.ZodNullable<z.ZodString>;
                liveRequestsSinceDeepBackfill: z.ZodNumber;
                active: z.ZodBoolean;
                stalled: z.ZodBoolean;
                stallReason: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>>>;
            recentRuns: z.ZodObject<{
                running: z.ZodNumber;
                success: z.ZodNumber;
                partial: z.ZodNumber;
                failed: z.ZodNumber;
                skipped: z.ZodNumber;
            }, z.core.$strip>;
            recentErrors: z.ZodObject<{
                total429s: z.ZodNumber;
                total5xxs: z.ZodNumber;
                failedRuns: z.ZodNumber;
                failedAttempts: z.ZodNumber;
                retryAttempts: z.ZodNumber;
                last429At: z.ZodNullable<z.ZodString>;
                last5xxAt: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>;
            rateHealth: z.ZodObject<{
                state: z.ZodEnum<{
                    healthy: "healthy";
                    warning: "warning";
                    limited: "limited";
                }>;
                last429At: z.ZodNullable<z.ZodString>;
                nextAvailableAt: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>;
            activeRun: z.ZodNullable<z.ZodObject<{
                runId: z.ZodNumber;
                trigger: z.ZodString;
                startedAt: z.ZodString;
                lastActivityAt: z.ZodString;
            }, z.core.$strip>>;
            lastCompletion: z.ZodNullable<z.ZodObject<{
                runId: z.ZodNumber;
                trigger: z.ZodString;
                status: z.ZodEnum<{
                    failed: "failed";
                    success: "success";
                    partial: "partial";
                    skipped: "skipped";
                }>;
                startedAt: z.ZodString;
                finishedAt: z.ZodString;
                durationMs: z.ZodNullable<z.ZodNumber>;
                errorSummary: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>>;
            succeededAt: z.ZodNullable<z.ZodString>;
            failedAt: z.ZodNullable<z.ZodString>;
            lastErrorSummary: z.ZodNullable<z.ZodString>;
            consecutiveFailures: z.ZodNumber;
            syncUx: z.ZodObject<{
                state: z.ZodEnum<{
                    healthy: "healthy";
                    syncing: "syncing";
                    catching_up: "catching_up";
                    retrying: "retrying";
                    attention: "attention";
                    setup: "setup";
                    off: "off";
                }>;
                label: z.ZodString;
                headline: z.ZodString;
                detail: z.ZodNullable<z.ZodString>;
                progressLabel: z.ZodNullable<z.ZodString>;
                nextRetryAt: z.ZodNullable<z.ZodString>;
                updatedAt: z.ZodNullable<z.ZodString>;
                requiresAction: z.ZodBoolean;
            }, z.core.$strip>;
        }, z.core.$strip>>;
        syncUx: z.ZodObject<{
            state: z.ZodEnum<{
                healthy: "healthy";
                syncing: "syncing";
                catching_up: "catching_up";
                retrying: "retrying";
                attention: "attention";
                setup: "setup";
                off: "off";
            }>;
            label: z.ZodString;
            headline: z.ZodString;
            detail: z.ZodNullable<z.ZodString>;
            progressLabel: z.ZodNullable<z.ZodString>;
            nextRetryAt: z.ZodNullable<z.ZodString>;
            updatedAt: z.ZodNullable<z.ZodString>;
            requiresAction: z.ZodBoolean;
        }, z.core.$strip>;
    }, z.core.$strip>>;
    recentEvents: z.ZodArray<z.ZodObject<{
        id: z.ZodNumber;
        runId: z.ZodNumber;
        pageId: z.ZodNumber;
        pageLabel: z.ZodString;
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        stream: z.ZodEnum<{
            subscribers: "subscribers";
            light: "light";
            followers: "followers";
            fan_identities: "fan_identities";
            transactions: "transactions";
            top_spenders: "top_spenders";
            dm_conversations: "dm_conversations";
            dm_messages: "dm_messages";
            followers_reconcile: "followers_reconcile";
            fan_earnings: "fan_earnings";
            purchase_history: "purchase_history";
        }>;
        eventType: z.ZodString;
        severity: z.ZodEnum<{
            info: "info";
            warn: "warn";
            error: "error";
        }>;
        message: z.ZodString;
        details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        emittedAt: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const syncRequestsQuerySchema: z.ZodObject<{
    since: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export declare const syncRequestItemSchema: z.ZodObject<{
    timestamp: z.ZodString;
    pageLabel: z.ZodString;
    platform: z.ZodEnum<{
        fansly: "fansly";
        onlyfans: "onlyfans";
    }>;
    stream: z.ZodEnum<{
        subscribers: "subscribers";
        light: "light";
        followers: "followers";
        fan_identities: "fan_identities";
        transactions: "transactions";
        top_spenders: "top_spenders";
        dm_conversations: "dm_conversations";
        dm_messages: "dm_messages";
        followers_reconcile: "followers_reconcile";
        fan_earnings: "fan_earnings";
        purchase_history: "purchase_history";
    }>;
    operation: z.ZodString;
    endpoint: z.ZodString;
    method: z.ZodString;
    attemptNumber: z.ZodNumber;
    status: z.ZodEnum<{
        failed: "failed";
        started: "started";
        success: "success";
        retry: "retry";
    }>;
    httpStatusCode: z.ZodNullable<z.ZodNumber>;
    durationMs: z.ZodNullable<z.ZodNumber>;
    rateLimitWaitMs: z.ZodNullable<z.ZodNumber>;
    groupId: z.ZodNullable<z.ZodString>;
    partnerUsername: z.ZodNullable<z.ZodString>;
    returnedItems: z.ZodNullable<z.ZodNumber>;
    syncDone: z.ZodNullable<z.ZodBoolean>;
    proxyGapMs: z.ZodNullable<z.ZodNumber>;
}, z.core.$strip>;
export declare const syncRequestsResponseSchema: z.ZodArray<z.ZodObject<{
    timestamp: z.ZodString;
    pageLabel: z.ZodString;
    platform: z.ZodEnum<{
        fansly: "fansly";
        onlyfans: "onlyfans";
    }>;
    stream: z.ZodEnum<{
        subscribers: "subscribers";
        light: "light";
        followers: "followers";
        fan_identities: "fan_identities";
        transactions: "transactions";
        top_spenders: "top_spenders";
        dm_conversations: "dm_conversations";
        dm_messages: "dm_messages";
        followers_reconcile: "followers_reconcile";
        fan_earnings: "fan_earnings";
        purchase_history: "purchase_history";
    }>;
    operation: z.ZodString;
    endpoint: z.ZodString;
    method: z.ZodString;
    attemptNumber: z.ZodNumber;
    status: z.ZodEnum<{
        failed: "failed";
        started: "started";
        success: "success";
        retry: "retry";
    }>;
    httpStatusCode: z.ZodNullable<z.ZodNumber>;
    durationMs: z.ZodNullable<z.ZodNumber>;
    rateLimitWaitMs: z.ZodNullable<z.ZodNumber>;
    groupId: z.ZodNullable<z.ZodString>;
    partnerUsername: z.ZodNullable<z.ZodString>;
    returnedItems: z.ZodNullable<z.ZodNumber>;
    syncDone: z.ZodNullable<z.ZodBoolean>;
    proxyGapMs: z.ZodNullable<z.ZodNumber>;
}, z.core.$strip>>;
export declare const syncBlockProgressSchema: z.ZodObject<{
    label: z.ZodString;
    current: z.ZodNumber;
    total: z.ZodNullable<z.ZodNumber>;
    unit: z.ZodString;
    percent: z.ZodNullable<z.ZodNumber>;
    details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, z.core.$strip>;
export declare const syncBlockErrorSchema: z.ZodObject<{
    stream: z.ZodNullable<z.ZodString>;
    code: z.ZodNullable<z.ZodString>;
    summary: z.ZodNullable<z.ZodString>;
    failedAt: z.ZodNullable<z.ZodString>;
    consecutiveFailures: z.ZodNumber;
}, z.core.$strip>;
export declare const syncStatusReasonSchema: z.ZodObject<{
    code: z.ZodNullable<z.ZodString>;
    summary: z.ZodNullable<z.ZodString>;
    waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export declare const syncBlockIntervalSchema: z.ZodObject<{
    stream: z.ZodEnum<{
        subscribers: "subscribers";
        light: "light";
        followers: "followers";
        fan_identities: "fan_identities";
        transactions: "transactions";
        top_spenders: "top_spenders";
        dm_conversations: "dm_conversations";
        dm_messages: "dm_messages";
        followers_reconcile: "followers_reconcile";
        fan_earnings: "fan_earnings";
        purchase_history: "purchase_history";
    }>;
    cadenceSeconds: z.ZodNumber;
}, z.core.$strip>;
export declare const syncBlockSubstreamSchema: z.ZodObject<{
    stream: z.ZodEnum<{
        subscribers: "subscribers";
        light: "light";
        followers: "followers";
        fan_identities: "fan_identities";
        transactions: "transactions";
        top_spenders: "top_spenders";
        dm_conversations: "dm_conversations";
        dm_messages: "dm_messages";
        followers_reconcile: "followers_reconcile";
        fan_earnings: "fan_earnings";
        purchase_history: "purchase_history";
    }>;
    role: z.ZodEnum<{
        primary: "primary";
        supporting: "supporting";
    }>;
    state: z.ZodEnum<{
        failed: "failed";
        syncing: "syncing";
        retrying: "retrying";
        paused: "paused";
        not_started: "not_started";
        scheduled: "scheduled";
        backfilling: "backfilling";
        up_to_date: "up_to_date";
        delayed: "delayed";
    }>;
    succeededAt: z.ZodNullable<z.ZodString>;
    nextDueAt: z.ZodNullable<z.ZodString>;
    nextRetryAt: z.ZodNullable<z.ZodString>;
    cadenceSeconds: z.ZodNumber;
    isFresh: z.ZodBoolean;
    needsAttention: z.ZodBoolean;
    statusReason: z.ZodNullable<z.ZodObject<{
        code: z.ZodNullable<z.ZodString>;
        summary: z.ZodNullable<z.ZodString>;
        waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    error: z.ZodNullable<z.ZodObject<{
        stream: z.ZodNullable<z.ZodString>;
        code: z.ZodNullable<z.ZodString>;
        summary: z.ZodNullable<z.ZodString>;
        failedAt: z.ZodNullable<z.ZodString>;
        consecutiveFailures: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const syncBlockStatusSchema: z.ZodObject<{
    block: z.ZodEnum<{
        connection: "connection";
        financials: "financials";
        audience: "audience";
        messages_live: "messages_live";
        messages_history: "messages_history";
    }>;
    state: z.ZodEnum<{
        failed: "failed";
        syncing: "syncing";
        retrying: "retrying";
        paused: "paused";
        not_started: "not_started";
        scheduled: "scheduled";
        backfilling: "backfilling";
        up_to_date: "up_to_date";
        delayed: "delayed";
        not_available: "not_available";
    }>;
    succeededAt: z.ZodNullable<z.ZodString>;
    progress: z.ZodNullable<z.ZodObject<{
        label: z.ZodString;
        current: z.ZodNumber;
        total: z.ZodNullable<z.ZodNumber>;
        unit: z.ZodString;
        percent: z.ZodNullable<z.ZodNumber>;
        details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, z.core.$strip>>;
    progressStream: z.ZodNullable<z.ZodString>;
    progressRole: z.ZodNullable<z.ZodEnum<{
        primary: "primary";
        supporting: "supporting";
    }>>;
    error: z.ZodNullable<z.ZodObject<{
        stream: z.ZodNullable<z.ZodString>;
        code: z.ZodNullable<z.ZodString>;
        summary: z.ZodNullable<z.ZodString>;
        failedAt: z.ZodNullable<z.ZodString>;
        consecutiveFailures: z.ZodNumber;
    }, z.core.$strip>>;
    statusReason: z.ZodNullable<z.ZodObject<{
        code: z.ZodNullable<z.ZodString>;
        summary: z.ZodNullable<z.ZodString>;
        waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    primaryFresh: z.ZodBoolean;
    needsAttention: z.ZodBoolean;
    nextDueAt: z.ZodNullable<z.ZodString>;
    nextRetryAt: z.ZodNullable<z.ZodString>;
    intervals: z.ZodArray<z.ZodObject<{
        stream: z.ZodEnum<{
            subscribers: "subscribers";
            light: "light";
            followers: "followers";
            fan_identities: "fan_identities";
            transactions: "transactions";
            top_spenders: "top_spenders";
            dm_conversations: "dm_conversations";
            dm_messages: "dm_messages";
            followers_reconcile: "followers_reconcile";
            fan_earnings: "fan_earnings";
            purchase_history: "purchase_history";
        }>;
        cadenceSeconds: z.ZodNumber;
    }, z.core.$strip>>;
    metrics: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    connectionStatus: z.ZodNullable<z.ZodEnum<{
        error: "error";
        connected: "connected";
        not_connected: "not_connected";
    }>>;
    substreams: z.ZodArray<z.ZodObject<{
        stream: z.ZodEnum<{
            subscribers: "subscribers";
            light: "light";
            followers: "followers";
            fan_identities: "fan_identities";
            transactions: "transactions";
            top_spenders: "top_spenders";
            dm_conversations: "dm_conversations";
            dm_messages: "dm_messages";
            followers_reconcile: "followers_reconcile";
            fan_earnings: "fan_earnings";
            purchase_history: "purchase_history";
        }>;
        role: z.ZodEnum<{
            primary: "primary";
            supporting: "supporting";
        }>;
        state: z.ZodEnum<{
            failed: "failed";
            syncing: "syncing";
            retrying: "retrying";
            paused: "paused";
            not_started: "not_started";
            scheduled: "scheduled";
            backfilling: "backfilling";
            up_to_date: "up_to_date";
            delayed: "delayed";
        }>;
        succeededAt: z.ZodNullable<z.ZodString>;
        nextDueAt: z.ZodNullable<z.ZodString>;
        nextRetryAt: z.ZodNullable<z.ZodString>;
        cadenceSeconds: z.ZodNumber;
        isFresh: z.ZodBoolean;
        needsAttention: z.ZodBoolean;
        statusReason: z.ZodNullable<z.ZodObject<{
            code: z.ZodNullable<z.ZodString>;
            summary: z.ZodNullable<z.ZodString>;
            waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>;
        error: z.ZodNullable<z.ZodObject<{
            stream: z.ZodNullable<z.ZodString>;
            code: z.ZodNullable<z.ZodString>;
            summary: z.ZodNullable<z.ZodString>;
            failedAt: z.ZodNullable<z.ZodString>;
            consecutiveFailures: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const syncDiagnosisSchema: z.ZodObject<{
    code: z.ZodEnum<{
        worker_offline: "worker_offline";
        stalled_run: "stalled_run";
        auth_blocked: "auth_blocked";
    }>;
    severity: z.ZodEnum<{
        error: "error";
        warning: "warning";
    }>;
    headline: z.ZodString;
    detail: z.ZodString;
    actionKind: z.ZodNullable<z.ZodEnum<{
        worker: "worker";
        credentials: "credentials";
        sync_settings: "sync_settings";
    }>>;
}, z.core.$strip>;
export declare const syncBlocksPageSchema: z.ZodObject<{
    pageId: z.ZodNumber;
    pageLabel: z.ZodString;
    platform: z.ZodEnum<{
        fansly: "fansly";
        onlyfans: "onlyfans";
    }>;
    modelSlug: z.ZodString;
    modelName: z.ZodString;
    username: z.ZodNullable<z.ZodString>;
    displayName: z.ZodNullable<z.ZodString>;
    diagnosis: z.ZodNullable<z.ZodObject<{
        code: z.ZodEnum<{
            worker_offline: "worker_offline";
            stalled_run: "stalled_run";
            auth_blocked: "auth_blocked";
        }>;
        severity: z.ZodEnum<{
            error: "error";
            warning: "warning";
        }>;
        headline: z.ZodString;
        detail: z.ZodString;
        actionKind: z.ZodNullable<z.ZodEnum<{
            worker: "worker";
            credentials: "credentials";
            sync_settings: "sync_settings";
        }>>;
    }, z.core.$strip>>;
    blocks: z.ZodObject<{
        connection: z.ZodObject<{
            block: z.ZodEnum<{
                connection: "connection";
                financials: "financials";
                audience: "audience";
                messages_live: "messages_live";
                messages_history: "messages_history";
            }>;
            state: z.ZodEnum<{
                failed: "failed";
                syncing: "syncing";
                retrying: "retrying";
                paused: "paused";
                not_started: "not_started";
                scheduled: "scheduled";
                backfilling: "backfilling";
                up_to_date: "up_to_date";
                delayed: "delayed";
                not_available: "not_available";
            }>;
            succeededAt: z.ZodNullable<z.ZodString>;
            progress: z.ZodNullable<z.ZodObject<{
                label: z.ZodString;
                current: z.ZodNumber;
                total: z.ZodNullable<z.ZodNumber>;
                unit: z.ZodString;
                percent: z.ZodNullable<z.ZodNumber>;
                details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
            }, z.core.$strip>>;
            progressStream: z.ZodNullable<z.ZodString>;
            progressRole: z.ZodNullable<z.ZodEnum<{
                primary: "primary";
                supporting: "supporting";
            }>>;
            error: z.ZodNullable<z.ZodObject<{
                stream: z.ZodNullable<z.ZodString>;
                code: z.ZodNullable<z.ZodString>;
                summary: z.ZodNullable<z.ZodString>;
                failedAt: z.ZodNullable<z.ZodString>;
                consecutiveFailures: z.ZodNumber;
            }, z.core.$strip>>;
            statusReason: z.ZodNullable<z.ZodObject<{
                code: z.ZodNullable<z.ZodString>;
                summary: z.ZodNullable<z.ZodString>;
                waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
            }, z.core.$strip>>;
            primaryFresh: z.ZodBoolean;
            needsAttention: z.ZodBoolean;
            nextDueAt: z.ZodNullable<z.ZodString>;
            nextRetryAt: z.ZodNullable<z.ZodString>;
            intervals: z.ZodArray<z.ZodObject<{
                stream: z.ZodEnum<{
                    subscribers: "subscribers";
                    light: "light";
                    followers: "followers";
                    fan_identities: "fan_identities";
                    transactions: "transactions";
                    top_spenders: "top_spenders";
                    dm_conversations: "dm_conversations";
                    dm_messages: "dm_messages";
                    followers_reconcile: "followers_reconcile";
                    fan_earnings: "fan_earnings";
                    purchase_history: "purchase_history";
                }>;
                cadenceSeconds: z.ZodNumber;
            }, z.core.$strip>>;
            metrics: z.ZodRecord<z.ZodString, z.ZodUnknown>;
            connectionStatus: z.ZodNullable<z.ZodEnum<{
                error: "error";
                connected: "connected";
                not_connected: "not_connected";
            }>>;
            substreams: z.ZodArray<z.ZodObject<{
                stream: z.ZodEnum<{
                    subscribers: "subscribers";
                    light: "light";
                    followers: "followers";
                    fan_identities: "fan_identities";
                    transactions: "transactions";
                    top_spenders: "top_spenders";
                    dm_conversations: "dm_conversations";
                    dm_messages: "dm_messages";
                    followers_reconcile: "followers_reconcile";
                    fan_earnings: "fan_earnings";
                    purchase_history: "purchase_history";
                }>;
                role: z.ZodEnum<{
                    primary: "primary";
                    supporting: "supporting";
                }>;
                state: z.ZodEnum<{
                    failed: "failed";
                    syncing: "syncing";
                    retrying: "retrying";
                    paused: "paused";
                    not_started: "not_started";
                    scheduled: "scheduled";
                    backfilling: "backfilling";
                    up_to_date: "up_to_date";
                    delayed: "delayed";
                }>;
                succeededAt: z.ZodNullable<z.ZodString>;
                nextDueAt: z.ZodNullable<z.ZodString>;
                nextRetryAt: z.ZodNullable<z.ZodString>;
                cadenceSeconds: z.ZodNumber;
                isFresh: z.ZodBoolean;
                needsAttention: z.ZodBoolean;
                statusReason: z.ZodNullable<z.ZodObject<{
                    code: z.ZodNullable<z.ZodString>;
                    summary: z.ZodNullable<z.ZodString>;
                    waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                }, z.core.$strip>>;
                error: z.ZodNullable<z.ZodObject<{
                    stream: z.ZodNullable<z.ZodString>;
                    code: z.ZodNullable<z.ZodString>;
                    summary: z.ZodNullable<z.ZodString>;
                    failedAt: z.ZodNullable<z.ZodString>;
                    consecutiveFailures: z.ZodNumber;
                }, z.core.$strip>>;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        financials: z.ZodObject<{
            block: z.ZodEnum<{
                connection: "connection";
                financials: "financials";
                audience: "audience";
                messages_live: "messages_live";
                messages_history: "messages_history";
            }>;
            state: z.ZodEnum<{
                failed: "failed";
                syncing: "syncing";
                retrying: "retrying";
                paused: "paused";
                not_started: "not_started";
                scheduled: "scheduled";
                backfilling: "backfilling";
                up_to_date: "up_to_date";
                delayed: "delayed";
                not_available: "not_available";
            }>;
            succeededAt: z.ZodNullable<z.ZodString>;
            progress: z.ZodNullable<z.ZodObject<{
                label: z.ZodString;
                current: z.ZodNumber;
                total: z.ZodNullable<z.ZodNumber>;
                unit: z.ZodString;
                percent: z.ZodNullable<z.ZodNumber>;
                details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
            }, z.core.$strip>>;
            progressStream: z.ZodNullable<z.ZodString>;
            progressRole: z.ZodNullable<z.ZodEnum<{
                primary: "primary";
                supporting: "supporting";
            }>>;
            error: z.ZodNullable<z.ZodObject<{
                stream: z.ZodNullable<z.ZodString>;
                code: z.ZodNullable<z.ZodString>;
                summary: z.ZodNullable<z.ZodString>;
                failedAt: z.ZodNullable<z.ZodString>;
                consecutiveFailures: z.ZodNumber;
            }, z.core.$strip>>;
            statusReason: z.ZodNullable<z.ZodObject<{
                code: z.ZodNullable<z.ZodString>;
                summary: z.ZodNullable<z.ZodString>;
                waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
            }, z.core.$strip>>;
            primaryFresh: z.ZodBoolean;
            needsAttention: z.ZodBoolean;
            nextDueAt: z.ZodNullable<z.ZodString>;
            nextRetryAt: z.ZodNullable<z.ZodString>;
            intervals: z.ZodArray<z.ZodObject<{
                stream: z.ZodEnum<{
                    subscribers: "subscribers";
                    light: "light";
                    followers: "followers";
                    fan_identities: "fan_identities";
                    transactions: "transactions";
                    top_spenders: "top_spenders";
                    dm_conversations: "dm_conversations";
                    dm_messages: "dm_messages";
                    followers_reconcile: "followers_reconcile";
                    fan_earnings: "fan_earnings";
                    purchase_history: "purchase_history";
                }>;
                cadenceSeconds: z.ZodNumber;
            }, z.core.$strip>>;
            metrics: z.ZodRecord<z.ZodString, z.ZodUnknown>;
            connectionStatus: z.ZodNullable<z.ZodEnum<{
                error: "error";
                connected: "connected";
                not_connected: "not_connected";
            }>>;
            substreams: z.ZodArray<z.ZodObject<{
                stream: z.ZodEnum<{
                    subscribers: "subscribers";
                    light: "light";
                    followers: "followers";
                    fan_identities: "fan_identities";
                    transactions: "transactions";
                    top_spenders: "top_spenders";
                    dm_conversations: "dm_conversations";
                    dm_messages: "dm_messages";
                    followers_reconcile: "followers_reconcile";
                    fan_earnings: "fan_earnings";
                    purchase_history: "purchase_history";
                }>;
                role: z.ZodEnum<{
                    primary: "primary";
                    supporting: "supporting";
                }>;
                state: z.ZodEnum<{
                    failed: "failed";
                    syncing: "syncing";
                    retrying: "retrying";
                    paused: "paused";
                    not_started: "not_started";
                    scheduled: "scheduled";
                    backfilling: "backfilling";
                    up_to_date: "up_to_date";
                    delayed: "delayed";
                }>;
                succeededAt: z.ZodNullable<z.ZodString>;
                nextDueAt: z.ZodNullable<z.ZodString>;
                nextRetryAt: z.ZodNullable<z.ZodString>;
                cadenceSeconds: z.ZodNumber;
                isFresh: z.ZodBoolean;
                needsAttention: z.ZodBoolean;
                statusReason: z.ZodNullable<z.ZodObject<{
                    code: z.ZodNullable<z.ZodString>;
                    summary: z.ZodNullable<z.ZodString>;
                    waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                }, z.core.$strip>>;
                error: z.ZodNullable<z.ZodObject<{
                    stream: z.ZodNullable<z.ZodString>;
                    code: z.ZodNullable<z.ZodString>;
                    summary: z.ZodNullable<z.ZodString>;
                    failedAt: z.ZodNullable<z.ZodString>;
                    consecutiveFailures: z.ZodNumber;
                }, z.core.$strip>>;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        audience: z.ZodObject<{
            block: z.ZodEnum<{
                connection: "connection";
                financials: "financials";
                audience: "audience";
                messages_live: "messages_live";
                messages_history: "messages_history";
            }>;
            state: z.ZodEnum<{
                failed: "failed";
                syncing: "syncing";
                retrying: "retrying";
                paused: "paused";
                not_started: "not_started";
                scheduled: "scheduled";
                backfilling: "backfilling";
                up_to_date: "up_to_date";
                delayed: "delayed";
                not_available: "not_available";
            }>;
            succeededAt: z.ZodNullable<z.ZodString>;
            progress: z.ZodNullable<z.ZodObject<{
                label: z.ZodString;
                current: z.ZodNumber;
                total: z.ZodNullable<z.ZodNumber>;
                unit: z.ZodString;
                percent: z.ZodNullable<z.ZodNumber>;
                details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
            }, z.core.$strip>>;
            progressStream: z.ZodNullable<z.ZodString>;
            progressRole: z.ZodNullable<z.ZodEnum<{
                primary: "primary";
                supporting: "supporting";
            }>>;
            error: z.ZodNullable<z.ZodObject<{
                stream: z.ZodNullable<z.ZodString>;
                code: z.ZodNullable<z.ZodString>;
                summary: z.ZodNullable<z.ZodString>;
                failedAt: z.ZodNullable<z.ZodString>;
                consecutiveFailures: z.ZodNumber;
            }, z.core.$strip>>;
            statusReason: z.ZodNullable<z.ZodObject<{
                code: z.ZodNullable<z.ZodString>;
                summary: z.ZodNullable<z.ZodString>;
                waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
            }, z.core.$strip>>;
            primaryFresh: z.ZodBoolean;
            needsAttention: z.ZodBoolean;
            nextDueAt: z.ZodNullable<z.ZodString>;
            nextRetryAt: z.ZodNullable<z.ZodString>;
            intervals: z.ZodArray<z.ZodObject<{
                stream: z.ZodEnum<{
                    subscribers: "subscribers";
                    light: "light";
                    followers: "followers";
                    fan_identities: "fan_identities";
                    transactions: "transactions";
                    top_spenders: "top_spenders";
                    dm_conversations: "dm_conversations";
                    dm_messages: "dm_messages";
                    followers_reconcile: "followers_reconcile";
                    fan_earnings: "fan_earnings";
                    purchase_history: "purchase_history";
                }>;
                cadenceSeconds: z.ZodNumber;
            }, z.core.$strip>>;
            metrics: z.ZodRecord<z.ZodString, z.ZodUnknown>;
            connectionStatus: z.ZodNullable<z.ZodEnum<{
                error: "error";
                connected: "connected";
                not_connected: "not_connected";
            }>>;
            substreams: z.ZodArray<z.ZodObject<{
                stream: z.ZodEnum<{
                    subscribers: "subscribers";
                    light: "light";
                    followers: "followers";
                    fan_identities: "fan_identities";
                    transactions: "transactions";
                    top_spenders: "top_spenders";
                    dm_conversations: "dm_conversations";
                    dm_messages: "dm_messages";
                    followers_reconcile: "followers_reconcile";
                    fan_earnings: "fan_earnings";
                    purchase_history: "purchase_history";
                }>;
                role: z.ZodEnum<{
                    primary: "primary";
                    supporting: "supporting";
                }>;
                state: z.ZodEnum<{
                    failed: "failed";
                    syncing: "syncing";
                    retrying: "retrying";
                    paused: "paused";
                    not_started: "not_started";
                    scheduled: "scheduled";
                    backfilling: "backfilling";
                    up_to_date: "up_to_date";
                    delayed: "delayed";
                }>;
                succeededAt: z.ZodNullable<z.ZodString>;
                nextDueAt: z.ZodNullable<z.ZodString>;
                nextRetryAt: z.ZodNullable<z.ZodString>;
                cadenceSeconds: z.ZodNumber;
                isFresh: z.ZodBoolean;
                needsAttention: z.ZodBoolean;
                statusReason: z.ZodNullable<z.ZodObject<{
                    code: z.ZodNullable<z.ZodString>;
                    summary: z.ZodNullable<z.ZodString>;
                    waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                }, z.core.$strip>>;
                error: z.ZodNullable<z.ZodObject<{
                    stream: z.ZodNullable<z.ZodString>;
                    code: z.ZodNullable<z.ZodString>;
                    summary: z.ZodNullable<z.ZodString>;
                    failedAt: z.ZodNullable<z.ZodString>;
                    consecutiveFailures: z.ZodNumber;
                }, z.core.$strip>>;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        messages_live: z.ZodObject<{
            block: z.ZodEnum<{
                connection: "connection";
                financials: "financials";
                audience: "audience";
                messages_live: "messages_live";
                messages_history: "messages_history";
            }>;
            state: z.ZodEnum<{
                failed: "failed";
                syncing: "syncing";
                retrying: "retrying";
                paused: "paused";
                not_started: "not_started";
                scheduled: "scheduled";
                backfilling: "backfilling";
                up_to_date: "up_to_date";
                delayed: "delayed";
                not_available: "not_available";
            }>;
            succeededAt: z.ZodNullable<z.ZodString>;
            progress: z.ZodNullable<z.ZodObject<{
                label: z.ZodString;
                current: z.ZodNumber;
                total: z.ZodNullable<z.ZodNumber>;
                unit: z.ZodString;
                percent: z.ZodNullable<z.ZodNumber>;
                details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
            }, z.core.$strip>>;
            progressStream: z.ZodNullable<z.ZodString>;
            progressRole: z.ZodNullable<z.ZodEnum<{
                primary: "primary";
                supporting: "supporting";
            }>>;
            error: z.ZodNullable<z.ZodObject<{
                stream: z.ZodNullable<z.ZodString>;
                code: z.ZodNullable<z.ZodString>;
                summary: z.ZodNullable<z.ZodString>;
                failedAt: z.ZodNullable<z.ZodString>;
                consecutiveFailures: z.ZodNumber;
            }, z.core.$strip>>;
            statusReason: z.ZodNullable<z.ZodObject<{
                code: z.ZodNullable<z.ZodString>;
                summary: z.ZodNullable<z.ZodString>;
                waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
            }, z.core.$strip>>;
            primaryFresh: z.ZodBoolean;
            needsAttention: z.ZodBoolean;
            nextDueAt: z.ZodNullable<z.ZodString>;
            nextRetryAt: z.ZodNullable<z.ZodString>;
            intervals: z.ZodArray<z.ZodObject<{
                stream: z.ZodEnum<{
                    subscribers: "subscribers";
                    light: "light";
                    followers: "followers";
                    fan_identities: "fan_identities";
                    transactions: "transactions";
                    top_spenders: "top_spenders";
                    dm_conversations: "dm_conversations";
                    dm_messages: "dm_messages";
                    followers_reconcile: "followers_reconcile";
                    fan_earnings: "fan_earnings";
                    purchase_history: "purchase_history";
                }>;
                cadenceSeconds: z.ZodNumber;
            }, z.core.$strip>>;
            metrics: z.ZodRecord<z.ZodString, z.ZodUnknown>;
            connectionStatus: z.ZodNullable<z.ZodEnum<{
                error: "error";
                connected: "connected";
                not_connected: "not_connected";
            }>>;
            substreams: z.ZodArray<z.ZodObject<{
                stream: z.ZodEnum<{
                    subscribers: "subscribers";
                    light: "light";
                    followers: "followers";
                    fan_identities: "fan_identities";
                    transactions: "transactions";
                    top_spenders: "top_spenders";
                    dm_conversations: "dm_conversations";
                    dm_messages: "dm_messages";
                    followers_reconcile: "followers_reconcile";
                    fan_earnings: "fan_earnings";
                    purchase_history: "purchase_history";
                }>;
                role: z.ZodEnum<{
                    primary: "primary";
                    supporting: "supporting";
                }>;
                state: z.ZodEnum<{
                    failed: "failed";
                    syncing: "syncing";
                    retrying: "retrying";
                    paused: "paused";
                    not_started: "not_started";
                    scheduled: "scheduled";
                    backfilling: "backfilling";
                    up_to_date: "up_to_date";
                    delayed: "delayed";
                }>;
                succeededAt: z.ZodNullable<z.ZodString>;
                nextDueAt: z.ZodNullable<z.ZodString>;
                nextRetryAt: z.ZodNullable<z.ZodString>;
                cadenceSeconds: z.ZodNumber;
                isFresh: z.ZodBoolean;
                needsAttention: z.ZodBoolean;
                statusReason: z.ZodNullable<z.ZodObject<{
                    code: z.ZodNullable<z.ZodString>;
                    summary: z.ZodNullable<z.ZodString>;
                    waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                }, z.core.$strip>>;
                error: z.ZodNullable<z.ZodObject<{
                    stream: z.ZodNullable<z.ZodString>;
                    code: z.ZodNullable<z.ZodString>;
                    summary: z.ZodNullable<z.ZodString>;
                    failedAt: z.ZodNullable<z.ZodString>;
                    consecutiveFailures: z.ZodNumber;
                }, z.core.$strip>>;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        messages_history: z.ZodObject<{
            block: z.ZodEnum<{
                connection: "connection";
                financials: "financials";
                audience: "audience";
                messages_live: "messages_live";
                messages_history: "messages_history";
            }>;
            state: z.ZodEnum<{
                failed: "failed";
                syncing: "syncing";
                retrying: "retrying";
                paused: "paused";
                not_started: "not_started";
                scheduled: "scheduled";
                backfilling: "backfilling";
                up_to_date: "up_to_date";
                delayed: "delayed";
                not_available: "not_available";
            }>;
            succeededAt: z.ZodNullable<z.ZodString>;
            progress: z.ZodNullable<z.ZodObject<{
                label: z.ZodString;
                current: z.ZodNumber;
                total: z.ZodNullable<z.ZodNumber>;
                unit: z.ZodString;
                percent: z.ZodNullable<z.ZodNumber>;
                details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
            }, z.core.$strip>>;
            progressStream: z.ZodNullable<z.ZodString>;
            progressRole: z.ZodNullable<z.ZodEnum<{
                primary: "primary";
                supporting: "supporting";
            }>>;
            error: z.ZodNullable<z.ZodObject<{
                stream: z.ZodNullable<z.ZodString>;
                code: z.ZodNullable<z.ZodString>;
                summary: z.ZodNullable<z.ZodString>;
                failedAt: z.ZodNullable<z.ZodString>;
                consecutiveFailures: z.ZodNumber;
            }, z.core.$strip>>;
            statusReason: z.ZodNullable<z.ZodObject<{
                code: z.ZodNullable<z.ZodString>;
                summary: z.ZodNullable<z.ZodString>;
                waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
            }, z.core.$strip>>;
            primaryFresh: z.ZodBoolean;
            needsAttention: z.ZodBoolean;
            nextDueAt: z.ZodNullable<z.ZodString>;
            nextRetryAt: z.ZodNullable<z.ZodString>;
            intervals: z.ZodArray<z.ZodObject<{
                stream: z.ZodEnum<{
                    subscribers: "subscribers";
                    light: "light";
                    followers: "followers";
                    fan_identities: "fan_identities";
                    transactions: "transactions";
                    top_spenders: "top_spenders";
                    dm_conversations: "dm_conversations";
                    dm_messages: "dm_messages";
                    followers_reconcile: "followers_reconcile";
                    fan_earnings: "fan_earnings";
                    purchase_history: "purchase_history";
                }>;
                cadenceSeconds: z.ZodNumber;
            }, z.core.$strip>>;
            metrics: z.ZodRecord<z.ZodString, z.ZodUnknown>;
            connectionStatus: z.ZodNullable<z.ZodEnum<{
                error: "error";
                connected: "connected";
                not_connected: "not_connected";
            }>>;
            substreams: z.ZodArray<z.ZodObject<{
                stream: z.ZodEnum<{
                    subscribers: "subscribers";
                    light: "light";
                    followers: "followers";
                    fan_identities: "fan_identities";
                    transactions: "transactions";
                    top_spenders: "top_spenders";
                    dm_conversations: "dm_conversations";
                    dm_messages: "dm_messages";
                    followers_reconcile: "followers_reconcile";
                    fan_earnings: "fan_earnings";
                    purchase_history: "purchase_history";
                }>;
                role: z.ZodEnum<{
                    primary: "primary";
                    supporting: "supporting";
                }>;
                state: z.ZodEnum<{
                    failed: "failed";
                    syncing: "syncing";
                    retrying: "retrying";
                    paused: "paused";
                    not_started: "not_started";
                    scheduled: "scheduled";
                    backfilling: "backfilling";
                    up_to_date: "up_to_date";
                    delayed: "delayed";
                }>;
                succeededAt: z.ZodNullable<z.ZodString>;
                nextDueAt: z.ZodNullable<z.ZodString>;
                nextRetryAt: z.ZodNullable<z.ZodString>;
                cadenceSeconds: z.ZodNumber;
                isFresh: z.ZodBoolean;
                needsAttention: z.ZodBoolean;
                statusReason: z.ZodNullable<z.ZodObject<{
                    code: z.ZodNullable<z.ZodString>;
                    summary: z.ZodNullable<z.ZodString>;
                    waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                }, z.core.$strip>>;
                error: z.ZodNullable<z.ZodObject<{
                    stream: z.ZodNullable<z.ZodString>;
                    code: z.ZodNullable<z.ZodString>;
                    summary: z.ZodNullable<z.ZodString>;
                    failedAt: z.ZodNullable<z.ZodString>;
                    consecutiveFailures: z.ZodNumber;
                }, z.core.$strip>>;
            }, z.core.$strip>>;
        }, z.core.$strip>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const syncOverviewResponseSchema: z.ZodObject<{
    generatedAt: z.ZodString;
    diagnosis: z.ZodNullable<z.ZodObject<{
        code: z.ZodEnum<{
            worker_offline: "worker_offline";
            stalled_run: "stalled_run";
            auth_blocked: "auth_blocked";
        }>;
        severity: z.ZodEnum<{
            error: "error";
            warning: "warning";
        }>;
        headline: z.ZodString;
        detail: z.ZodString;
        actionKind: z.ZodNullable<z.ZodEnum<{
            worker: "worker";
            credentials: "credentials";
            sync_settings: "sync_settings";
        }>>;
    }, z.core.$strip>>;
    pages: z.ZodArray<z.ZodObject<{
        pageId: z.ZodNumber;
        pageLabel: z.ZodString;
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        modelSlug: z.ZodString;
        modelName: z.ZodString;
        username: z.ZodNullable<z.ZodString>;
        displayName: z.ZodNullable<z.ZodString>;
        diagnosis: z.ZodNullable<z.ZodObject<{
            code: z.ZodEnum<{
                worker_offline: "worker_offline";
                stalled_run: "stalled_run";
                auth_blocked: "auth_blocked";
            }>;
            severity: z.ZodEnum<{
                error: "error";
                warning: "warning";
            }>;
            headline: z.ZodString;
            detail: z.ZodString;
            actionKind: z.ZodNullable<z.ZodEnum<{
                worker: "worker";
                credentials: "credentials";
                sync_settings: "sync_settings";
            }>>;
        }, z.core.$strip>>;
        blocks: z.ZodObject<{
            connection: z.ZodObject<{
                block: z.ZodEnum<{
                    connection: "connection";
                    financials: "financials";
                    audience: "audience";
                    messages_live: "messages_live";
                    messages_history: "messages_history";
                }>;
                state: z.ZodEnum<{
                    failed: "failed";
                    syncing: "syncing";
                    retrying: "retrying";
                    paused: "paused";
                    not_started: "not_started";
                    scheduled: "scheduled";
                    backfilling: "backfilling";
                    up_to_date: "up_to_date";
                    delayed: "delayed";
                    not_available: "not_available";
                }>;
                succeededAt: z.ZodNullable<z.ZodString>;
                progress: z.ZodNullable<z.ZodObject<{
                    label: z.ZodString;
                    current: z.ZodNumber;
                    total: z.ZodNullable<z.ZodNumber>;
                    unit: z.ZodString;
                    percent: z.ZodNullable<z.ZodNumber>;
                    details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                }, z.core.$strip>>;
                progressStream: z.ZodNullable<z.ZodString>;
                progressRole: z.ZodNullable<z.ZodEnum<{
                    primary: "primary";
                    supporting: "supporting";
                }>>;
                error: z.ZodNullable<z.ZodObject<{
                    stream: z.ZodNullable<z.ZodString>;
                    code: z.ZodNullable<z.ZodString>;
                    summary: z.ZodNullable<z.ZodString>;
                    failedAt: z.ZodNullable<z.ZodString>;
                    consecutiveFailures: z.ZodNumber;
                }, z.core.$strip>>;
                statusReason: z.ZodNullable<z.ZodObject<{
                    code: z.ZodNullable<z.ZodString>;
                    summary: z.ZodNullable<z.ZodString>;
                    waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                }, z.core.$strip>>;
                primaryFresh: z.ZodBoolean;
                needsAttention: z.ZodBoolean;
                nextDueAt: z.ZodNullable<z.ZodString>;
                nextRetryAt: z.ZodNullable<z.ZodString>;
                intervals: z.ZodArray<z.ZodObject<{
                    stream: z.ZodEnum<{
                        subscribers: "subscribers";
                        light: "light";
                        followers: "followers";
                        fan_identities: "fan_identities";
                        transactions: "transactions";
                        top_spenders: "top_spenders";
                        dm_conversations: "dm_conversations";
                        dm_messages: "dm_messages";
                        followers_reconcile: "followers_reconcile";
                        fan_earnings: "fan_earnings";
                        purchase_history: "purchase_history";
                    }>;
                    cadenceSeconds: z.ZodNumber;
                }, z.core.$strip>>;
                metrics: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                connectionStatus: z.ZodNullable<z.ZodEnum<{
                    error: "error";
                    connected: "connected";
                    not_connected: "not_connected";
                }>>;
                substreams: z.ZodArray<z.ZodObject<{
                    stream: z.ZodEnum<{
                        subscribers: "subscribers";
                        light: "light";
                        followers: "followers";
                        fan_identities: "fan_identities";
                        transactions: "transactions";
                        top_spenders: "top_spenders";
                        dm_conversations: "dm_conversations";
                        dm_messages: "dm_messages";
                        followers_reconcile: "followers_reconcile";
                        fan_earnings: "fan_earnings";
                        purchase_history: "purchase_history";
                    }>;
                    role: z.ZodEnum<{
                        primary: "primary";
                        supporting: "supporting";
                    }>;
                    state: z.ZodEnum<{
                        failed: "failed";
                        syncing: "syncing";
                        retrying: "retrying";
                        paused: "paused";
                        not_started: "not_started";
                        scheduled: "scheduled";
                        backfilling: "backfilling";
                        up_to_date: "up_to_date";
                        delayed: "delayed";
                    }>;
                    succeededAt: z.ZodNullable<z.ZodString>;
                    nextDueAt: z.ZodNullable<z.ZodString>;
                    nextRetryAt: z.ZodNullable<z.ZodString>;
                    cadenceSeconds: z.ZodNumber;
                    isFresh: z.ZodBoolean;
                    needsAttention: z.ZodBoolean;
                    statusReason: z.ZodNullable<z.ZodObject<{
                        code: z.ZodNullable<z.ZodString>;
                        summary: z.ZodNullable<z.ZodString>;
                        waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                    }, z.core.$strip>>;
                    error: z.ZodNullable<z.ZodObject<{
                        stream: z.ZodNullable<z.ZodString>;
                        code: z.ZodNullable<z.ZodString>;
                        summary: z.ZodNullable<z.ZodString>;
                        failedAt: z.ZodNullable<z.ZodString>;
                        consecutiveFailures: z.ZodNumber;
                    }, z.core.$strip>>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            financials: z.ZodObject<{
                block: z.ZodEnum<{
                    connection: "connection";
                    financials: "financials";
                    audience: "audience";
                    messages_live: "messages_live";
                    messages_history: "messages_history";
                }>;
                state: z.ZodEnum<{
                    failed: "failed";
                    syncing: "syncing";
                    retrying: "retrying";
                    paused: "paused";
                    not_started: "not_started";
                    scheduled: "scheduled";
                    backfilling: "backfilling";
                    up_to_date: "up_to_date";
                    delayed: "delayed";
                    not_available: "not_available";
                }>;
                succeededAt: z.ZodNullable<z.ZodString>;
                progress: z.ZodNullable<z.ZodObject<{
                    label: z.ZodString;
                    current: z.ZodNumber;
                    total: z.ZodNullable<z.ZodNumber>;
                    unit: z.ZodString;
                    percent: z.ZodNullable<z.ZodNumber>;
                    details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                }, z.core.$strip>>;
                progressStream: z.ZodNullable<z.ZodString>;
                progressRole: z.ZodNullable<z.ZodEnum<{
                    primary: "primary";
                    supporting: "supporting";
                }>>;
                error: z.ZodNullable<z.ZodObject<{
                    stream: z.ZodNullable<z.ZodString>;
                    code: z.ZodNullable<z.ZodString>;
                    summary: z.ZodNullable<z.ZodString>;
                    failedAt: z.ZodNullable<z.ZodString>;
                    consecutiveFailures: z.ZodNumber;
                }, z.core.$strip>>;
                statusReason: z.ZodNullable<z.ZodObject<{
                    code: z.ZodNullable<z.ZodString>;
                    summary: z.ZodNullable<z.ZodString>;
                    waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                }, z.core.$strip>>;
                primaryFresh: z.ZodBoolean;
                needsAttention: z.ZodBoolean;
                nextDueAt: z.ZodNullable<z.ZodString>;
                nextRetryAt: z.ZodNullable<z.ZodString>;
                intervals: z.ZodArray<z.ZodObject<{
                    stream: z.ZodEnum<{
                        subscribers: "subscribers";
                        light: "light";
                        followers: "followers";
                        fan_identities: "fan_identities";
                        transactions: "transactions";
                        top_spenders: "top_spenders";
                        dm_conversations: "dm_conversations";
                        dm_messages: "dm_messages";
                        followers_reconcile: "followers_reconcile";
                        fan_earnings: "fan_earnings";
                        purchase_history: "purchase_history";
                    }>;
                    cadenceSeconds: z.ZodNumber;
                }, z.core.$strip>>;
                metrics: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                connectionStatus: z.ZodNullable<z.ZodEnum<{
                    error: "error";
                    connected: "connected";
                    not_connected: "not_connected";
                }>>;
                substreams: z.ZodArray<z.ZodObject<{
                    stream: z.ZodEnum<{
                        subscribers: "subscribers";
                        light: "light";
                        followers: "followers";
                        fan_identities: "fan_identities";
                        transactions: "transactions";
                        top_spenders: "top_spenders";
                        dm_conversations: "dm_conversations";
                        dm_messages: "dm_messages";
                        followers_reconcile: "followers_reconcile";
                        fan_earnings: "fan_earnings";
                        purchase_history: "purchase_history";
                    }>;
                    role: z.ZodEnum<{
                        primary: "primary";
                        supporting: "supporting";
                    }>;
                    state: z.ZodEnum<{
                        failed: "failed";
                        syncing: "syncing";
                        retrying: "retrying";
                        paused: "paused";
                        not_started: "not_started";
                        scheduled: "scheduled";
                        backfilling: "backfilling";
                        up_to_date: "up_to_date";
                        delayed: "delayed";
                    }>;
                    succeededAt: z.ZodNullable<z.ZodString>;
                    nextDueAt: z.ZodNullable<z.ZodString>;
                    nextRetryAt: z.ZodNullable<z.ZodString>;
                    cadenceSeconds: z.ZodNumber;
                    isFresh: z.ZodBoolean;
                    needsAttention: z.ZodBoolean;
                    statusReason: z.ZodNullable<z.ZodObject<{
                        code: z.ZodNullable<z.ZodString>;
                        summary: z.ZodNullable<z.ZodString>;
                        waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                    }, z.core.$strip>>;
                    error: z.ZodNullable<z.ZodObject<{
                        stream: z.ZodNullable<z.ZodString>;
                        code: z.ZodNullable<z.ZodString>;
                        summary: z.ZodNullable<z.ZodString>;
                        failedAt: z.ZodNullable<z.ZodString>;
                        consecutiveFailures: z.ZodNumber;
                    }, z.core.$strip>>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            audience: z.ZodObject<{
                block: z.ZodEnum<{
                    connection: "connection";
                    financials: "financials";
                    audience: "audience";
                    messages_live: "messages_live";
                    messages_history: "messages_history";
                }>;
                state: z.ZodEnum<{
                    failed: "failed";
                    syncing: "syncing";
                    retrying: "retrying";
                    paused: "paused";
                    not_started: "not_started";
                    scheduled: "scheduled";
                    backfilling: "backfilling";
                    up_to_date: "up_to_date";
                    delayed: "delayed";
                    not_available: "not_available";
                }>;
                succeededAt: z.ZodNullable<z.ZodString>;
                progress: z.ZodNullable<z.ZodObject<{
                    label: z.ZodString;
                    current: z.ZodNumber;
                    total: z.ZodNullable<z.ZodNumber>;
                    unit: z.ZodString;
                    percent: z.ZodNullable<z.ZodNumber>;
                    details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                }, z.core.$strip>>;
                progressStream: z.ZodNullable<z.ZodString>;
                progressRole: z.ZodNullable<z.ZodEnum<{
                    primary: "primary";
                    supporting: "supporting";
                }>>;
                error: z.ZodNullable<z.ZodObject<{
                    stream: z.ZodNullable<z.ZodString>;
                    code: z.ZodNullable<z.ZodString>;
                    summary: z.ZodNullable<z.ZodString>;
                    failedAt: z.ZodNullable<z.ZodString>;
                    consecutiveFailures: z.ZodNumber;
                }, z.core.$strip>>;
                statusReason: z.ZodNullable<z.ZodObject<{
                    code: z.ZodNullable<z.ZodString>;
                    summary: z.ZodNullable<z.ZodString>;
                    waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                }, z.core.$strip>>;
                primaryFresh: z.ZodBoolean;
                needsAttention: z.ZodBoolean;
                nextDueAt: z.ZodNullable<z.ZodString>;
                nextRetryAt: z.ZodNullable<z.ZodString>;
                intervals: z.ZodArray<z.ZodObject<{
                    stream: z.ZodEnum<{
                        subscribers: "subscribers";
                        light: "light";
                        followers: "followers";
                        fan_identities: "fan_identities";
                        transactions: "transactions";
                        top_spenders: "top_spenders";
                        dm_conversations: "dm_conversations";
                        dm_messages: "dm_messages";
                        followers_reconcile: "followers_reconcile";
                        fan_earnings: "fan_earnings";
                        purchase_history: "purchase_history";
                    }>;
                    cadenceSeconds: z.ZodNumber;
                }, z.core.$strip>>;
                metrics: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                connectionStatus: z.ZodNullable<z.ZodEnum<{
                    error: "error";
                    connected: "connected";
                    not_connected: "not_connected";
                }>>;
                substreams: z.ZodArray<z.ZodObject<{
                    stream: z.ZodEnum<{
                        subscribers: "subscribers";
                        light: "light";
                        followers: "followers";
                        fan_identities: "fan_identities";
                        transactions: "transactions";
                        top_spenders: "top_spenders";
                        dm_conversations: "dm_conversations";
                        dm_messages: "dm_messages";
                        followers_reconcile: "followers_reconcile";
                        fan_earnings: "fan_earnings";
                        purchase_history: "purchase_history";
                    }>;
                    role: z.ZodEnum<{
                        primary: "primary";
                        supporting: "supporting";
                    }>;
                    state: z.ZodEnum<{
                        failed: "failed";
                        syncing: "syncing";
                        retrying: "retrying";
                        paused: "paused";
                        not_started: "not_started";
                        scheduled: "scheduled";
                        backfilling: "backfilling";
                        up_to_date: "up_to_date";
                        delayed: "delayed";
                    }>;
                    succeededAt: z.ZodNullable<z.ZodString>;
                    nextDueAt: z.ZodNullable<z.ZodString>;
                    nextRetryAt: z.ZodNullable<z.ZodString>;
                    cadenceSeconds: z.ZodNumber;
                    isFresh: z.ZodBoolean;
                    needsAttention: z.ZodBoolean;
                    statusReason: z.ZodNullable<z.ZodObject<{
                        code: z.ZodNullable<z.ZodString>;
                        summary: z.ZodNullable<z.ZodString>;
                        waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                    }, z.core.$strip>>;
                    error: z.ZodNullable<z.ZodObject<{
                        stream: z.ZodNullable<z.ZodString>;
                        code: z.ZodNullable<z.ZodString>;
                        summary: z.ZodNullable<z.ZodString>;
                        failedAt: z.ZodNullable<z.ZodString>;
                        consecutiveFailures: z.ZodNumber;
                    }, z.core.$strip>>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            messages_live: z.ZodObject<{
                block: z.ZodEnum<{
                    connection: "connection";
                    financials: "financials";
                    audience: "audience";
                    messages_live: "messages_live";
                    messages_history: "messages_history";
                }>;
                state: z.ZodEnum<{
                    failed: "failed";
                    syncing: "syncing";
                    retrying: "retrying";
                    paused: "paused";
                    not_started: "not_started";
                    scheduled: "scheduled";
                    backfilling: "backfilling";
                    up_to_date: "up_to_date";
                    delayed: "delayed";
                    not_available: "not_available";
                }>;
                succeededAt: z.ZodNullable<z.ZodString>;
                progress: z.ZodNullable<z.ZodObject<{
                    label: z.ZodString;
                    current: z.ZodNumber;
                    total: z.ZodNullable<z.ZodNumber>;
                    unit: z.ZodString;
                    percent: z.ZodNullable<z.ZodNumber>;
                    details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                }, z.core.$strip>>;
                progressStream: z.ZodNullable<z.ZodString>;
                progressRole: z.ZodNullable<z.ZodEnum<{
                    primary: "primary";
                    supporting: "supporting";
                }>>;
                error: z.ZodNullable<z.ZodObject<{
                    stream: z.ZodNullable<z.ZodString>;
                    code: z.ZodNullable<z.ZodString>;
                    summary: z.ZodNullable<z.ZodString>;
                    failedAt: z.ZodNullable<z.ZodString>;
                    consecutiveFailures: z.ZodNumber;
                }, z.core.$strip>>;
                statusReason: z.ZodNullable<z.ZodObject<{
                    code: z.ZodNullable<z.ZodString>;
                    summary: z.ZodNullable<z.ZodString>;
                    waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                }, z.core.$strip>>;
                primaryFresh: z.ZodBoolean;
                needsAttention: z.ZodBoolean;
                nextDueAt: z.ZodNullable<z.ZodString>;
                nextRetryAt: z.ZodNullable<z.ZodString>;
                intervals: z.ZodArray<z.ZodObject<{
                    stream: z.ZodEnum<{
                        subscribers: "subscribers";
                        light: "light";
                        followers: "followers";
                        fan_identities: "fan_identities";
                        transactions: "transactions";
                        top_spenders: "top_spenders";
                        dm_conversations: "dm_conversations";
                        dm_messages: "dm_messages";
                        followers_reconcile: "followers_reconcile";
                        fan_earnings: "fan_earnings";
                        purchase_history: "purchase_history";
                    }>;
                    cadenceSeconds: z.ZodNumber;
                }, z.core.$strip>>;
                metrics: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                connectionStatus: z.ZodNullable<z.ZodEnum<{
                    error: "error";
                    connected: "connected";
                    not_connected: "not_connected";
                }>>;
                substreams: z.ZodArray<z.ZodObject<{
                    stream: z.ZodEnum<{
                        subscribers: "subscribers";
                        light: "light";
                        followers: "followers";
                        fan_identities: "fan_identities";
                        transactions: "transactions";
                        top_spenders: "top_spenders";
                        dm_conversations: "dm_conversations";
                        dm_messages: "dm_messages";
                        followers_reconcile: "followers_reconcile";
                        fan_earnings: "fan_earnings";
                        purchase_history: "purchase_history";
                    }>;
                    role: z.ZodEnum<{
                        primary: "primary";
                        supporting: "supporting";
                    }>;
                    state: z.ZodEnum<{
                        failed: "failed";
                        syncing: "syncing";
                        retrying: "retrying";
                        paused: "paused";
                        not_started: "not_started";
                        scheduled: "scheduled";
                        backfilling: "backfilling";
                        up_to_date: "up_to_date";
                        delayed: "delayed";
                    }>;
                    succeededAt: z.ZodNullable<z.ZodString>;
                    nextDueAt: z.ZodNullable<z.ZodString>;
                    nextRetryAt: z.ZodNullable<z.ZodString>;
                    cadenceSeconds: z.ZodNumber;
                    isFresh: z.ZodBoolean;
                    needsAttention: z.ZodBoolean;
                    statusReason: z.ZodNullable<z.ZodObject<{
                        code: z.ZodNullable<z.ZodString>;
                        summary: z.ZodNullable<z.ZodString>;
                        waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                    }, z.core.$strip>>;
                    error: z.ZodNullable<z.ZodObject<{
                        stream: z.ZodNullable<z.ZodString>;
                        code: z.ZodNullable<z.ZodString>;
                        summary: z.ZodNullable<z.ZodString>;
                        failedAt: z.ZodNullable<z.ZodString>;
                        consecutiveFailures: z.ZodNumber;
                    }, z.core.$strip>>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            messages_history: z.ZodObject<{
                block: z.ZodEnum<{
                    connection: "connection";
                    financials: "financials";
                    audience: "audience";
                    messages_live: "messages_live";
                    messages_history: "messages_history";
                }>;
                state: z.ZodEnum<{
                    failed: "failed";
                    syncing: "syncing";
                    retrying: "retrying";
                    paused: "paused";
                    not_started: "not_started";
                    scheduled: "scheduled";
                    backfilling: "backfilling";
                    up_to_date: "up_to_date";
                    delayed: "delayed";
                    not_available: "not_available";
                }>;
                succeededAt: z.ZodNullable<z.ZodString>;
                progress: z.ZodNullable<z.ZodObject<{
                    label: z.ZodString;
                    current: z.ZodNumber;
                    total: z.ZodNullable<z.ZodNumber>;
                    unit: z.ZodString;
                    percent: z.ZodNullable<z.ZodNumber>;
                    details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                }, z.core.$strip>>;
                progressStream: z.ZodNullable<z.ZodString>;
                progressRole: z.ZodNullable<z.ZodEnum<{
                    primary: "primary";
                    supporting: "supporting";
                }>>;
                error: z.ZodNullable<z.ZodObject<{
                    stream: z.ZodNullable<z.ZodString>;
                    code: z.ZodNullable<z.ZodString>;
                    summary: z.ZodNullable<z.ZodString>;
                    failedAt: z.ZodNullable<z.ZodString>;
                    consecutiveFailures: z.ZodNumber;
                }, z.core.$strip>>;
                statusReason: z.ZodNullable<z.ZodObject<{
                    code: z.ZodNullable<z.ZodString>;
                    summary: z.ZodNullable<z.ZodString>;
                    waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                }, z.core.$strip>>;
                primaryFresh: z.ZodBoolean;
                needsAttention: z.ZodBoolean;
                nextDueAt: z.ZodNullable<z.ZodString>;
                nextRetryAt: z.ZodNullable<z.ZodString>;
                intervals: z.ZodArray<z.ZodObject<{
                    stream: z.ZodEnum<{
                        subscribers: "subscribers";
                        light: "light";
                        followers: "followers";
                        fan_identities: "fan_identities";
                        transactions: "transactions";
                        top_spenders: "top_spenders";
                        dm_conversations: "dm_conversations";
                        dm_messages: "dm_messages";
                        followers_reconcile: "followers_reconcile";
                        fan_earnings: "fan_earnings";
                        purchase_history: "purchase_history";
                    }>;
                    cadenceSeconds: z.ZodNumber;
                }, z.core.$strip>>;
                metrics: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                connectionStatus: z.ZodNullable<z.ZodEnum<{
                    error: "error";
                    connected: "connected";
                    not_connected: "not_connected";
                }>>;
                substreams: z.ZodArray<z.ZodObject<{
                    stream: z.ZodEnum<{
                        subscribers: "subscribers";
                        light: "light";
                        followers: "followers";
                        fan_identities: "fan_identities";
                        transactions: "transactions";
                        top_spenders: "top_spenders";
                        dm_conversations: "dm_conversations";
                        dm_messages: "dm_messages";
                        followers_reconcile: "followers_reconcile";
                        fan_earnings: "fan_earnings";
                        purchase_history: "purchase_history";
                    }>;
                    role: z.ZodEnum<{
                        primary: "primary";
                        supporting: "supporting";
                    }>;
                    state: z.ZodEnum<{
                        failed: "failed";
                        syncing: "syncing";
                        retrying: "retrying";
                        paused: "paused";
                        not_started: "not_started";
                        scheduled: "scheduled";
                        backfilling: "backfilling";
                        up_to_date: "up_to_date";
                        delayed: "delayed";
                    }>;
                    succeededAt: z.ZodNullable<z.ZodString>;
                    nextDueAt: z.ZodNullable<z.ZodString>;
                    nextRetryAt: z.ZodNullable<z.ZodString>;
                    cadenceSeconds: z.ZodNumber;
                    isFresh: z.ZodBoolean;
                    needsAttention: z.ZodBoolean;
                    statusReason: z.ZodNullable<z.ZodObject<{
                        code: z.ZodNullable<z.ZodString>;
                        summary: z.ZodNullable<z.ZodString>;
                        waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                    }, z.core.$strip>>;
                    error: z.ZodNullable<z.ZodObject<{
                        stream: z.ZodNullable<z.ZodString>;
                        code: z.ZodNullable<z.ZodString>;
                        summary: z.ZodNullable<z.ZodString>;
                        failedAt: z.ZodNullable<z.ZodString>;
                        consecutiveFailures: z.ZodNumber;
                    }, z.core.$strip>>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
        }, z.core.$strip>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const pageSyncBlocksParamsSchema: z.ZodObject<{
    pageLabel: z.ZodString;
}, z.core.$strip>;
export declare const pageSyncBlocksResponseSchema: z.ZodObject<{
    generatedAt: z.ZodString;
    page: z.ZodObject<{
        pageId: z.ZodNumber;
        pageLabel: z.ZodString;
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        modelSlug: z.ZodString;
        modelName: z.ZodString;
        username: z.ZodNullable<z.ZodString>;
        displayName: z.ZodNullable<z.ZodString>;
        diagnosis: z.ZodNullable<z.ZodObject<{
            code: z.ZodEnum<{
                worker_offline: "worker_offline";
                stalled_run: "stalled_run";
                auth_blocked: "auth_blocked";
            }>;
            severity: z.ZodEnum<{
                error: "error";
                warning: "warning";
            }>;
            headline: z.ZodString;
            detail: z.ZodString;
            actionKind: z.ZodNullable<z.ZodEnum<{
                worker: "worker";
                credentials: "credentials";
                sync_settings: "sync_settings";
            }>>;
        }, z.core.$strip>>;
        blocks: z.ZodObject<{
            connection: z.ZodObject<{
                block: z.ZodEnum<{
                    connection: "connection";
                    financials: "financials";
                    audience: "audience";
                    messages_live: "messages_live";
                    messages_history: "messages_history";
                }>;
                state: z.ZodEnum<{
                    failed: "failed";
                    syncing: "syncing";
                    retrying: "retrying";
                    paused: "paused";
                    not_started: "not_started";
                    scheduled: "scheduled";
                    backfilling: "backfilling";
                    up_to_date: "up_to_date";
                    delayed: "delayed";
                    not_available: "not_available";
                }>;
                succeededAt: z.ZodNullable<z.ZodString>;
                progress: z.ZodNullable<z.ZodObject<{
                    label: z.ZodString;
                    current: z.ZodNumber;
                    total: z.ZodNullable<z.ZodNumber>;
                    unit: z.ZodString;
                    percent: z.ZodNullable<z.ZodNumber>;
                    details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                }, z.core.$strip>>;
                progressStream: z.ZodNullable<z.ZodString>;
                progressRole: z.ZodNullable<z.ZodEnum<{
                    primary: "primary";
                    supporting: "supporting";
                }>>;
                error: z.ZodNullable<z.ZodObject<{
                    stream: z.ZodNullable<z.ZodString>;
                    code: z.ZodNullable<z.ZodString>;
                    summary: z.ZodNullable<z.ZodString>;
                    failedAt: z.ZodNullable<z.ZodString>;
                    consecutiveFailures: z.ZodNumber;
                }, z.core.$strip>>;
                statusReason: z.ZodNullable<z.ZodObject<{
                    code: z.ZodNullable<z.ZodString>;
                    summary: z.ZodNullable<z.ZodString>;
                    waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                }, z.core.$strip>>;
                primaryFresh: z.ZodBoolean;
                needsAttention: z.ZodBoolean;
                nextDueAt: z.ZodNullable<z.ZodString>;
                nextRetryAt: z.ZodNullable<z.ZodString>;
                intervals: z.ZodArray<z.ZodObject<{
                    stream: z.ZodEnum<{
                        subscribers: "subscribers";
                        light: "light";
                        followers: "followers";
                        fan_identities: "fan_identities";
                        transactions: "transactions";
                        top_spenders: "top_spenders";
                        dm_conversations: "dm_conversations";
                        dm_messages: "dm_messages";
                        followers_reconcile: "followers_reconcile";
                        fan_earnings: "fan_earnings";
                        purchase_history: "purchase_history";
                    }>;
                    cadenceSeconds: z.ZodNumber;
                }, z.core.$strip>>;
                metrics: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                connectionStatus: z.ZodNullable<z.ZodEnum<{
                    error: "error";
                    connected: "connected";
                    not_connected: "not_connected";
                }>>;
                substreams: z.ZodArray<z.ZodObject<{
                    stream: z.ZodEnum<{
                        subscribers: "subscribers";
                        light: "light";
                        followers: "followers";
                        fan_identities: "fan_identities";
                        transactions: "transactions";
                        top_spenders: "top_spenders";
                        dm_conversations: "dm_conversations";
                        dm_messages: "dm_messages";
                        followers_reconcile: "followers_reconcile";
                        fan_earnings: "fan_earnings";
                        purchase_history: "purchase_history";
                    }>;
                    role: z.ZodEnum<{
                        primary: "primary";
                        supporting: "supporting";
                    }>;
                    state: z.ZodEnum<{
                        failed: "failed";
                        syncing: "syncing";
                        retrying: "retrying";
                        paused: "paused";
                        not_started: "not_started";
                        scheduled: "scheduled";
                        backfilling: "backfilling";
                        up_to_date: "up_to_date";
                        delayed: "delayed";
                    }>;
                    succeededAt: z.ZodNullable<z.ZodString>;
                    nextDueAt: z.ZodNullable<z.ZodString>;
                    nextRetryAt: z.ZodNullable<z.ZodString>;
                    cadenceSeconds: z.ZodNumber;
                    isFresh: z.ZodBoolean;
                    needsAttention: z.ZodBoolean;
                    statusReason: z.ZodNullable<z.ZodObject<{
                        code: z.ZodNullable<z.ZodString>;
                        summary: z.ZodNullable<z.ZodString>;
                        waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                    }, z.core.$strip>>;
                    error: z.ZodNullable<z.ZodObject<{
                        stream: z.ZodNullable<z.ZodString>;
                        code: z.ZodNullable<z.ZodString>;
                        summary: z.ZodNullable<z.ZodString>;
                        failedAt: z.ZodNullable<z.ZodString>;
                        consecutiveFailures: z.ZodNumber;
                    }, z.core.$strip>>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            financials: z.ZodObject<{
                block: z.ZodEnum<{
                    connection: "connection";
                    financials: "financials";
                    audience: "audience";
                    messages_live: "messages_live";
                    messages_history: "messages_history";
                }>;
                state: z.ZodEnum<{
                    failed: "failed";
                    syncing: "syncing";
                    retrying: "retrying";
                    paused: "paused";
                    not_started: "not_started";
                    scheduled: "scheduled";
                    backfilling: "backfilling";
                    up_to_date: "up_to_date";
                    delayed: "delayed";
                    not_available: "not_available";
                }>;
                succeededAt: z.ZodNullable<z.ZodString>;
                progress: z.ZodNullable<z.ZodObject<{
                    label: z.ZodString;
                    current: z.ZodNumber;
                    total: z.ZodNullable<z.ZodNumber>;
                    unit: z.ZodString;
                    percent: z.ZodNullable<z.ZodNumber>;
                    details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                }, z.core.$strip>>;
                progressStream: z.ZodNullable<z.ZodString>;
                progressRole: z.ZodNullable<z.ZodEnum<{
                    primary: "primary";
                    supporting: "supporting";
                }>>;
                error: z.ZodNullable<z.ZodObject<{
                    stream: z.ZodNullable<z.ZodString>;
                    code: z.ZodNullable<z.ZodString>;
                    summary: z.ZodNullable<z.ZodString>;
                    failedAt: z.ZodNullable<z.ZodString>;
                    consecutiveFailures: z.ZodNumber;
                }, z.core.$strip>>;
                statusReason: z.ZodNullable<z.ZodObject<{
                    code: z.ZodNullable<z.ZodString>;
                    summary: z.ZodNullable<z.ZodString>;
                    waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                }, z.core.$strip>>;
                primaryFresh: z.ZodBoolean;
                needsAttention: z.ZodBoolean;
                nextDueAt: z.ZodNullable<z.ZodString>;
                nextRetryAt: z.ZodNullable<z.ZodString>;
                intervals: z.ZodArray<z.ZodObject<{
                    stream: z.ZodEnum<{
                        subscribers: "subscribers";
                        light: "light";
                        followers: "followers";
                        fan_identities: "fan_identities";
                        transactions: "transactions";
                        top_spenders: "top_spenders";
                        dm_conversations: "dm_conversations";
                        dm_messages: "dm_messages";
                        followers_reconcile: "followers_reconcile";
                        fan_earnings: "fan_earnings";
                        purchase_history: "purchase_history";
                    }>;
                    cadenceSeconds: z.ZodNumber;
                }, z.core.$strip>>;
                metrics: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                connectionStatus: z.ZodNullable<z.ZodEnum<{
                    error: "error";
                    connected: "connected";
                    not_connected: "not_connected";
                }>>;
                substreams: z.ZodArray<z.ZodObject<{
                    stream: z.ZodEnum<{
                        subscribers: "subscribers";
                        light: "light";
                        followers: "followers";
                        fan_identities: "fan_identities";
                        transactions: "transactions";
                        top_spenders: "top_spenders";
                        dm_conversations: "dm_conversations";
                        dm_messages: "dm_messages";
                        followers_reconcile: "followers_reconcile";
                        fan_earnings: "fan_earnings";
                        purchase_history: "purchase_history";
                    }>;
                    role: z.ZodEnum<{
                        primary: "primary";
                        supporting: "supporting";
                    }>;
                    state: z.ZodEnum<{
                        failed: "failed";
                        syncing: "syncing";
                        retrying: "retrying";
                        paused: "paused";
                        not_started: "not_started";
                        scheduled: "scheduled";
                        backfilling: "backfilling";
                        up_to_date: "up_to_date";
                        delayed: "delayed";
                    }>;
                    succeededAt: z.ZodNullable<z.ZodString>;
                    nextDueAt: z.ZodNullable<z.ZodString>;
                    nextRetryAt: z.ZodNullable<z.ZodString>;
                    cadenceSeconds: z.ZodNumber;
                    isFresh: z.ZodBoolean;
                    needsAttention: z.ZodBoolean;
                    statusReason: z.ZodNullable<z.ZodObject<{
                        code: z.ZodNullable<z.ZodString>;
                        summary: z.ZodNullable<z.ZodString>;
                        waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                    }, z.core.$strip>>;
                    error: z.ZodNullable<z.ZodObject<{
                        stream: z.ZodNullable<z.ZodString>;
                        code: z.ZodNullable<z.ZodString>;
                        summary: z.ZodNullable<z.ZodString>;
                        failedAt: z.ZodNullable<z.ZodString>;
                        consecutiveFailures: z.ZodNumber;
                    }, z.core.$strip>>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            audience: z.ZodObject<{
                block: z.ZodEnum<{
                    connection: "connection";
                    financials: "financials";
                    audience: "audience";
                    messages_live: "messages_live";
                    messages_history: "messages_history";
                }>;
                state: z.ZodEnum<{
                    failed: "failed";
                    syncing: "syncing";
                    retrying: "retrying";
                    paused: "paused";
                    not_started: "not_started";
                    scheduled: "scheduled";
                    backfilling: "backfilling";
                    up_to_date: "up_to_date";
                    delayed: "delayed";
                    not_available: "not_available";
                }>;
                succeededAt: z.ZodNullable<z.ZodString>;
                progress: z.ZodNullable<z.ZodObject<{
                    label: z.ZodString;
                    current: z.ZodNumber;
                    total: z.ZodNullable<z.ZodNumber>;
                    unit: z.ZodString;
                    percent: z.ZodNullable<z.ZodNumber>;
                    details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                }, z.core.$strip>>;
                progressStream: z.ZodNullable<z.ZodString>;
                progressRole: z.ZodNullable<z.ZodEnum<{
                    primary: "primary";
                    supporting: "supporting";
                }>>;
                error: z.ZodNullable<z.ZodObject<{
                    stream: z.ZodNullable<z.ZodString>;
                    code: z.ZodNullable<z.ZodString>;
                    summary: z.ZodNullable<z.ZodString>;
                    failedAt: z.ZodNullable<z.ZodString>;
                    consecutiveFailures: z.ZodNumber;
                }, z.core.$strip>>;
                statusReason: z.ZodNullable<z.ZodObject<{
                    code: z.ZodNullable<z.ZodString>;
                    summary: z.ZodNullable<z.ZodString>;
                    waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                }, z.core.$strip>>;
                primaryFresh: z.ZodBoolean;
                needsAttention: z.ZodBoolean;
                nextDueAt: z.ZodNullable<z.ZodString>;
                nextRetryAt: z.ZodNullable<z.ZodString>;
                intervals: z.ZodArray<z.ZodObject<{
                    stream: z.ZodEnum<{
                        subscribers: "subscribers";
                        light: "light";
                        followers: "followers";
                        fan_identities: "fan_identities";
                        transactions: "transactions";
                        top_spenders: "top_spenders";
                        dm_conversations: "dm_conversations";
                        dm_messages: "dm_messages";
                        followers_reconcile: "followers_reconcile";
                        fan_earnings: "fan_earnings";
                        purchase_history: "purchase_history";
                    }>;
                    cadenceSeconds: z.ZodNumber;
                }, z.core.$strip>>;
                metrics: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                connectionStatus: z.ZodNullable<z.ZodEnum<{
                    error: "error";
                    connected: "connected";
                    not_connected: "not_connected";
                }>>;
                substreams: z.ZodArray<z.ZodObject<{
                    stream: z.ZodEnum<{
                        subscribers: "subscribers";
                        light: "light";
                        followers: "followers";
                        fan_identities: "fan_identities";
                        transactions: "transactions";
                        top_spenders: "top_spenders";
                        dm_conversations: "dm_conversations";
                        dm_messages: "dm_messages";
                        followers_reconcile: "followers_reconcile";
                        fan_earnings: "fan_earnings";
                        purchase_history: "purchase_history";
                    }>;
                    role: z.ZodEnum<{
                        primary: "primary";
                        supporting: "supporting";
                    }>;
                    state: z.ZodEnum<{
                        failed: "failed";
                        syncing: "syncing";
                        retrying: "retrying";
                        paused: "paused";
                        not_started: "not_started";
                        scheduled: "scheduled";
                        backfilling: "backfilling";
                        up_to_date: "up_to_date";
                        delayed: "delayed";
                    }>;
                    succeededAt: z.ZodNullable<z.ZodString>;
                    nextDueAt: z.ZodNullable<z.ZodString>;
                    nextRetryAt: z.ZodNullable<z.ZodString>;
                    cadenceSeconds: z.ZodNumber;
                    isFresh: z.ZodBoolean;
                    needsAttention: z.ZodBoolean;
                    statusReason: z.ZodNullable<z.ZodObject<{
                        code: z.ZodNullable<z.ZodString>;
                        summary: z.ZodNullable<z.ZodString>;
                        waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                    }, z.core.$strip>>;
                    error: z.ZodNullable<z.ZodObject<{
                        stream: z.ZodNullable<z.ZodString>;
                        code: z.ZodNullable<z.ZodString>;
                        summary: z.ZodNullable<z.ZodString>;
                        failedAt: z.ZodNullable<z.ZodString>;
                        consecutiveFailures: z.ZodNumber;
                    }, z.core.$strip>>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            messages_live: z.ZodObject<{
                block: z.ZodEnum<{
                    connection: "connection";
                    financials: "financials";
                    audience: "audience";
                    messages_live: "messages_live";
                    messages_history: "messages_history";
                }>;
                state: z.ZodEnum<{
                    failed: "failed";
                    syncing: "syncing";
                    retrying: "retrying";
                    paused: "paused";
                    not_started: "not_started";
                    scheduled: "scheduled";
                    backfilling: "backfilling";
                    up_to_date: "up_to_date";
                    delayed: "delayed";
                    not_available: "not_available";
                }>;
                succeededAt: z.ZodNullable<z.ZodString>;
                progress: z.ZodNullable<z.ZodObject<{
                    label: z.ZodString;
                    current: z.ZodNumber;
                    total: z.ZodNullable<z.ZodNumber>;
                    unit: z.ZodString;
                    percent: z.ZodNullable<z.ZodNumber>;
                    details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                }, z.core.$strip>>;
                progressStream: z.ZodNullable<z.ZodString>;
                progressRole: z.ZodNullable<z.ZodEnum<{
                    primary: "primary";
                    supporting: "supporting";
                }>>;
                error: z.ZodNullable<z.ZodObject<{
                    stream: z.ZodNullable<z.ZodString>;
                    code: z.ZodNullable<z.ZodString>;
                    summary: z.ZodNullable<z.ZodString>;
                    failedAt: z.ZodNullable<z.ZodString>;
                    consecutiveFailures: z.ZodNumber;
                }, z.core.$strip>>;
                statusReason: z.ZodNullable<z.ZodObject<{
                    code: z.ZodNullable<z.ZodString>;
                    summary: z.ZodNullable<z.ZodString>;
                    waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                }, z.core.$strip>>;
                primaryFresh: z.ZodBoolean;
                needsAttention: z.ZodBoolean;
                nextDueAt: z.ZodNullable<z.ZodString>;
                nextRetryAt: z.ZodNullable<z.ZodString>;
                intervals: z.ZodArray<z.ZodObject<{
                    stream: z.ZodEnum<{
                        subscribers: "subscribers";
                        light: "light";
                        followers: "followers";
                        fan_identities: "fan_identities";
                        transactions: "transactions";
                        top_spenders: "top_spenders";
                        dm_conversations: "dm_conversations";
                        dm_messages: "dm_messages";
                        followers_reconcile: "followers_reconcile";
                        fan_earnings: "fan_earnings";
                        purchase_history: "purchase_history";
                    }>;
                    cadenceSeconds: z.ZodNumber;
                }, z.core.$strip>>;
                metrics: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                connectionStatus: z.ZodNullable<z.ZodEnum<{
                    error: "error";
                    connected: "connected";
                    not_connected: "not_connected";
                }>>;
                substreams: z.ZodArray<z.ZodObject<{
                    stream: z.ZodEnum<{
                        subscribers: "subscribers";
                        light: "light";
                        followers: "followers";
                        fan_identities: "fan_identities";
                        transactions: "transactions";
                        top_spenders: "top_spenders";
                        dm_conversations: "dm_conversations";
                        dm_messages: "dm_messages";
                        followers_reconcile: "followers_reconcile";
                        fan_earnings: "fan_earnings";
                        purchase_history: "purchase_history";
                    }>;
                    role: z.ZodEnum<{
                        primary: "primary";
                        supporting: "supporting";
                    }>;
                    state: z.ZodEnum<{
                        failed: "failed";
                        syncing: "syncing";
                        retrying: "retrying";
                        paused: "paused";
                        not_started: "not_started";
                        scheduled: "scheduled";
                        backfilling: "backfilling";
                        up_to_date: "up_to_date";
                        delayed: "delayed";
                    }>;
                    succeededAt: z.ZodNullable<z.ZodString>;
                    nextDueAt: z.ZodNullable<z.ZodString>;
                    nextRetryAt: z.ZodNullable<z.ZodString>;
                    cadenceSeconds: z.ZodNumber;
                    isFresh: z.ZodBoolean;
                    needsAttention: z.ZodBoolean;
                    statusReason: z.ZodNullable<z.ZodObject<{
                        code: z.ZodNullable<z.ZodString>;
                        summary: z.ZodNullable<z.ZodString>;
                        waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                    }, z.core.$strip>>;
                    error: z.ZodNullable<z.ZodObject<{
                        stream: z.ZodNullable<z.ZodString>;
                        code: z.ZodNullable<z.ZodString>;
                        summary: z.ZodNullable<z.ZodString>;
                        failedAt: z.ZodNullable<z.ZodString>;
                        consecutiveFailures: z.ZodNumber;
                    }, z.core.$strip>>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            messages_history: z.ZodObject<{
                block: z.ZodEnum<{
                    connection: "connection";
                    financials: "financials";
                    audience: "audience";
                    messages_live: "messages_live";
                    messages_history: "messages_history";
                }>;
                state: z.ZodEnum<{
                    failed: "failed";
                    syncing: "syncing";
                    retrying: "retrying";
                    paused: "paused";
                    not_started: "not_started";
                    scheduled: "scheduled";
                    backfilling: "backfilling";
                    up_to_date: "up_to_date";
                    delayed: "delayed";
                    not_available: "not_available";
                }>;
                succeededAt: z.ZodNullable<z.ZodString>;
                progress: z.ZodNullable<z.ZodObject<{
                    label: z.ZodString;
                    current: z.ZodNumber;
                    total: z.ZodNullable<z.ZodNumber>;
                    unit: z.ZodString;
                    percent: z.ZodNullable<z.ZodNumber>;
                    details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                }, z.core.$strip>>;
                progressStream: z.ZodNullable<z.ZodString>;
                progressRole: z.ZodNullable<z.ZodEnum<{
                    primary: "primary";
                    supporting: "supporting";
                }>>;
                error: z.ZodNullable<z.ZodObject<{
                    stream: z.ZodNullable<z.ZodString>;
                    code: z.ZodNullable<z.ZodString>;
                    summary: z.ZodNullable<z.ZodString>;
                    failedAt: z.ZodNullable<z.ZodString>;
                    consecutiveFailures: z.ZodNumber;
                }, z.core.$strip>>;
                statusReason: z.ZodNullable<z.ZodObject<{
                    code: z.ZodNullable<z.ZodString>;
                    summary: z.ZodNullable<z.ZodString>;
                    waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                }, z.core.$strip>>;
                primaryFresh: z.ZodBoolean;
                needsAttention: z.ZodBoolean;
                nextDueAt: z.ZodNullable<z.ZodString>;
                nextRetryAt: z.ZodNullable<z.ZodString>;
                intervals: z.ZodArray<z.ZodObject<{
                    stream: z.ZodEnum<{
                        subscribers: "subscribers";
                        light: "light";
                        followers: "followers";
                        fan_identities: "fan_identities";
                        transactions: "transactions";
                        top_spenders: "top_spenders";
                        dm_conversations: "dm_conversations";
                        dm_messages: "dm_messages";
                        followers_reconcile: "followers_reconcile";
                        fan_earnings: "fan_earnings";
                        purchase_history: "purchase_history";
                    }>;
                    cadenceSeconds: z.ZodNumber;
                }, z.core.$strip>>;
                metrics: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                connectionStatus: z.ZodNullable<z.ZodEnum<{
                    error: "error";
                    connected: "connected";
                    not_connected: "not_connected";
                }>>;
                substreams: z.ZodArray<z.ZodObject<{
                    stream: z.ZodEnum<{
                        subscribers: "subscribers";
                        light: "light";
                        followers: "followers";
                        fan_identities: "fan_identities";
                        transactions: "transactions";
                        top_spenders: "top_spenders";
                        dm_conversations: "dm_conversations";
                        dm_messages: "dm_messages";
                        followers_reconcile: "followers_reconcile";
                        fan_earnings: "fan_earnings";
                        purchase_history: "purchase_history";
                    }>;
                    role: z.ZodEnum<{
                        primary: "primary";
                        supporting: "supporting";
                    }>;
                    state: z.ZodEnum<{
                        failed: "failed";
                        syncing: "syncing";
                        retrying: "retrying";
                        paused: "paused";
                        not_started: "not_started";
                        scheduled: "scheduled";
                        backfilling: "backfilling";
                        up_to_date: "up_to_date";
                        delayed: "delayed";
                    }>;
                    succeededAt: z.ZodNullable<z.ZodString>;
                    nextDueAt: z.ZodNullable<z.ZodString>;
                    nextRetryAt: z.ZodNullable<z.ZodString>;
                    cadenceSeconds: z.ZodNumber;
                    isFresh: z.ZodBoolean;
                    needsAttention: z.ZodBoolean;
                    statusReason: z.ZodNullable<z.ZodObject<{
                        code: z.ZodNullable<z.ZodString>;
                        summary: z.ZodNullable<z.ZodString>;
                        waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                    }, z.core.$strip>>;
                    error: z.ZodNullable<z.ZodObject<{
                        stream: z.ZodNullable<z.ZodString>;
                        code: z.ZodNullable<z.ZodString>;
                        summary: z.ZodNullable<z.ZodString>;
                        failedAt: z.ZodNullable<z.ZodString>;
                        consecutiveFailures: z.ZodNumber;
                    }, z.core.$strip>>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
        }, z.core.$strip>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const pageMessagesBlockResponseSchema: z.ZodObject<{
    generatedAt: z.ZodString;
    page: z.ZodObject<{
        pageId: z.ZodNumber;
        pageLabel: z.ZodString;
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        modelSlug: z.ZodString;
        modelName: z.ZodString;
        username: z.ZodNullable<z.ZodString>;
        displayName: z.ZodNullable<z.ZodString>;
        diagnosis: z.ZodNullable<z.ZodObject<{
            code: z.ZodEnum<{
                worker_offline: "worker_offline";
                stalled_run: "stalled_run";
                auth_blocked: "auth_blocked";
            }>;
            severity: z.ZodEnum<{
                error: "error";
                warning: "warning";
            }>;
            headline: z.ZodString;
            detail: z.ZodString;
            actionKind: z.ZodNullable<z.ZodEnum<{
                worker: "worker";
                credentials: "credentials";
                sync_settings: "sync_settings";
            }>>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    block: z.ZodObject<{
        block: z.ZodEnum<{
            connection: "connection";
            financials: "financials";
            audience: "audience";
            messages_live: "messages_live";
            messages_history: "messages_history";
        }>;
        state: z.ZodEnum<{
            failed: "failed";
            syncing: "syncing";
            retrying: "retrying";
            paused: "paused";
            not_started: "not_started";
            scheduled: "scheduled";
            backfilling: "backfilling";
            up_to_date: "up_to_date";
            delayed: "delayed";
            not_available: "not_available";
        }>;
        succeededAt: z.ZodNullable<z.ZodString>;
        progress: z.ZodNullable<z.ZodObject<{
            label: z.ZodString;
            current: z.ZodNumber;
            total: z.ZodNullable<z.ZodNumber>;
            unit: z.ZodString;
            percent: z.ZodNullable<z.ZodNumber>;
            details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, z.core.$strip>>;
        progressStream: z.ZodNullable<z.ZodString>;
        progressRole: z.ZodNullable<z.ZodEnum<{
            primary: "primary";
            supporting: "supporting";
        }>>;
        error: z.ZodNullable<z.ZodObject<{
            stream: z.ZodNullable<z.ZodString>;
            code: z.ZodNullable<z.ZodString>;
            summary: z.ZodNullable<z.ZodString>;
            failedAt: z.ZodNullable<z.ZodString>;
            consecutiveFailures: z.ZodNumber;
        }, z.core.$strip>>;
        statusReason: z.ZodNullable<z.ZodObject<{
            code: z.ZodNullable<z.ZodString>;
            summary: z.ZodNullable<z.ZodString>;
            waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>;
        primaryFresh: z.ZodBoolean;
        needsAttention: z.ZodBoolean;
        nextDueAt: z.ZodNullable<z.ZodString>;
        nextRetryAt: z.ZodNullable<z.ZodString>;
        intervals: z.ZodArray<z.ZodObject<{
            stream: z.ZodEnum<{
                subscribers: "subscribers";
                light: "light";
                followers: "followers";
                fan_identities: "fan_identities";
                transactions: "transactions";
                top_spenders: "top_spenders";
                dm_conversations: "dm_conversations";
                dm_messages: "dm_messages";
                followers_reconcile: "followers_reconcile";
                fan_earnings: "fan_earnings";
                purchase_history: "purchase_history";
            }>;
            cadenceSeconds: z.ZodNumber;
        }, z.core.$strip>>;
        metrics: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        connectionStatus: z.ZodNullable<z.ZodEnum<{
            error: "error";
            connected: "connected";
            not_connected: "not_connected";
        }>>;
        substreams: z.ZodArray<z.ZodObject<{
            stream: z.ZodEnum<{
                subscribers: "subscribers";
                light: "light";
                followers: "followers";
                fan_identities: "fan_identities";
                transactions: "transactions";
                top_spenders: "top_spenders";
                dm_conversations: "dm_conversations";
                dm_messages: "dm_messages";
                followers_reconcile: "followers_reconcile";
                fan_earnings: "fan_earnings";
                purchase_history: "purchase_history";
            }>;
            role: z.ZodEnum<{
                primary: "primary";
                supporting: "supporting";
            }>;
            state: z.ZodEnum<{
                failed: "failed";
                syncing: "syncing";
                retrying: "retrying";
                paused: "paused";
                not_started: "not_started";
                scheduled: "scheduled";
                backfilling: "backfilling";
                up_to_date: "up_to_date";
                delayed: "delayed";
            }>;
            succeededAt: z.ZodNullable<z.ZodString>;
            nextDueAt: z.ZodNullable<z.ZodString>;
            nextRetryAt: z.ZodNullable<z.ZodString>;
            cadenceSeconds: z.ZodNumber;
            isFresh: z.ZodBoolean;
            needsAttention: z.ZodBoolean;
            statusReason: z.ZodNullable<z.ZodObject<{
                code: z.ZodNullable<z.ZodString>;
                summary: z.ZodNullable<z.ZodString>;
                waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
            }, z.core.$strip>>;
            error: z.ZodNullable<z.ZodObject<{
                stream: z.ZodNullable<z.ZodString>;
                code: z.ZodNullable<z.ZodString>;
                summary: z.ZodNullable<z.ZodString>;
                failedAt: z.ZodNullable<z.ZodString>;
                consecutiveFailures: z.ZodNumber;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const adminSyncBlockBodySchema: z.ZodObject<{
    pageLabel: z.ZodString;
    block: z.ZodEnum<{
        connection: "connection";
        financials: "financials";
        audience: "audience";
        messages_live: "messages_live";
        messages_history: "messages_history";
    }>;
}, z.core.$strip>;
export declare const adminSyncBlockRequestSchema: z.ZodObject<{
    stream: z.ZodEnum<{
        subscribers: "subscribers";
        light: "light";
        followers: "followers";
        fan_identities: "fan_identities";
        transactions: "transactions";
        top_spenders: "top_spenders";
        dm_conversations: "dm_conversations";
        dm_messages: "dm_messages";
        followers_reconcile: "followers_reconcile";
        fan_earnings: "fan_earnings";
        purchase_history: "purchase_history";
    }>;
    requestedSeq: z.ZodNumber;
}, z.core.$strip>;
export declare const adminSyncBlockResponseSchema: z.ZodObject<{
    accepted: z.ZodLiteral<true>;
    action: z.ZodEnum<{
        trigger: "trigger";
        pause: "pause";
        resume: "resume";
        reset: "reset";
    }>;
    pageLabel: z.ZodString;
    block: z.ZodEnum<{
        connection: "connection";
        financials: "financials";
        audience: "audience";
        messages_live: "messages_live";
        messages_history: "messages_history";
    }>;
    requests: z.ZodOptional<z.ZodArray<z.ZodObject<{
        stream: z.ZodEnum<{
            subscribers: "subscribers";
            light: "light";
            followers: "followers";
            fan_identities: "fan_identities";
            transactions: "transactions";
            top_spenders: "top_spenders";
            dm_conversations: "dm_conversations";
            dm_messages: "dm_messages";
            followers_reconcile: "followers_reconcile";
            fan_earnings: "fan_earnings";
            purchase_history: "purchase_history";
        }>;
        requestedSeq: z.ZodNumber;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export declare const syncTriggerBodySchema: z.ZodObject<{
    pageLabel: z.ZodString;
    scope: z.ZodEnum<{
        all: "all";
        messages: "messages";
        light: "light";
        followers: "followers";
        data: "data";
    }>;
}, z.core.$strip>;
export declare const syncTriggerResponseSchema: z.ZodObject<{
    accepted: z.ZodLiteral<true>;
    pageLabel: z.ZodString;
    scope: z.ZodEnum<{
        all: "all";
        messages: "messages";
        light: "light";
        followers: "followers";
        data: "data";
    }>;
}, z.core.$strip>;
export declare const syncTriggerAllResponseSchema: z.ZodObject<{
    accepted: z.ZodLiteral<true>;
    pagesQueued: z.ZodNumber;
}, z.core.$strip>;
export declare const syncRunsQuerySchema: z.ZodObject<{
    pageLabel: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    since: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const adminLogsQuerySchema: z.ZodObject<{
    severity: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export declare const adminLogItemSchema: z.ZodObject<{
    id: z.ZodNumber;
    syncRunId: z.ZodNumber;
    provider: z.ZodEnum<{
        fansly: "fansly";
        onlyfans: "onlyfans";
    }>;
    stream: z.ZodString;
    eventType: z.ZodString;
    severity: z.ZodString;
    message: z.ZodString;
    details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    emittedAt: z.ZodString;
    pageLabel: z.ZodString;
}, z.core.$strip>;
export declare const adminQueueJobsQuerySchema: z.ZodObject<{
    state: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export declare const adminQueueJobItemSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    state: z.ZodString;
    data: z.ZodNullable<z.ZodUnknown>;
    createdOn: z.ZodString;
    startedOn: z.ZodNullable<z.ZodString>;
    completedOn: z.ZodNullable<z.ZodString>;
    output: z.ZodNullable<z.ZodUnknown>;
    retryLimit: z.ZodNumber;
    retryCount: z.ZodNumber;
}, z.core.$strip>;
export declare const adminDbTableStatSchema: z.ZodObject<{
    schema: z.ZodString;
    table: z.ZodString;
    rowEstimate: z.ZodNumber;
    totalBytes: z.ZodNumber;
    indexBytes: z.ZodNumber;
}, z.core.$strip>;
export declare const adminDbMigrationSchema: z.ZodObject<{
    name: z.ZodString;
    appliedAt: z.ZodString;
}, z.core.$strip>;
export declare const adminDbStatsResponseSchema: z.ZodObject<{
    tables: z.ZodArray<z.ZodObject<{
        schema: z.ZodString;
        table: z.ZodString;
        rowEstimate: z.ZodNumber;
        totalBytes: z.ZodNumber;
        indexBytes: z.ZodNumber;
    }, z.core.$strip>>;
    migrations: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        appliedAt: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const adminIncidentsQuerySchema: z.ZodObject<{
    severity: z.ZodOptional<z.ZodString>;
    code: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export declare const adminIncidentItemSchema: z.ZodObject<{
    id: z.ZodNumber;
    syncRunId: z.ZodNumber;
    provider: z.ZodEnum<{
        fansly: "fansly";
        onlyfans: "onlyfans";
    }>;
    stream: z.ZodString;
    eventType: z.ZodString;
    severity: z.ZodString;
    message: z.ZodString;
    details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    emittedAt: z.ZodString;
    pageLabel: z.ZodString;
}, z.core.$strip>;
export declare const adminIncidentSummaryItemSchema: z.ZodObject<{
    code: z.ZodNullable<z.ZodString>;
    severity: z.ZodString;
    count: z.ZodNumber;
}, z.core.$strip>;
export declare const adminIncidentsResponseSchema: z.ZodObject<{
    summary: z.ZodArray<z.ZodObject<{
        code: z.ZodNullable<z.ZodString>;
        severity: z.ZodString;
        count: z.ZodNumber;
    }, z.core.$strip>>;
    items: z.ZodArray<z.ZodObject<{
        id: z.ZodNumber;
        syncRunId: z.ZodNumber;
        provider: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        stream: z.ZodString;
        eventType: z.ZodString;
        severity: z.ZodString;
        message: z.ZodString;
        details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        emittedAt: z.ZodString;
        pageLabel: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const archiveMessageItemSchema: z.ZodObject<{
    id: z.ZodNumber;
    accountId: z.ZodNumber;
    platform: z.ZodString;
    conversationRef: z.ZodNullable<z.ZodString>;
    messageRef: z.ZodString;
    fanNativeId: z.ZodNullable<z.ZodString>;
    senderRole: z.ZodString;
    isSentByMe: z.ZodBoolean;
    occurredAt: z.ZodNullable<z.ZodString>;
    textPlain: z.ZodString;
    priceMills: z.ZodNullable<z.ZodString>;
    isTip: z.ZodBoolean;
    tipAmountMills: z.ZodString;
    deletedAt: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const notificationsSettingsResponseSchema: z.ZodObject<{
    configured: z.ZodBoolean;
    botTokenSet: z.ZodBoolean;
    chatId: z.ZodNullable<z.ZodString>;
    botTokenSource: z.ZodEnum<{
        none: "none";
        env: "env";
        db: "db";
    }>;
    chatIdSource: z.ZodEnum<{
        none: "none";
        env: "env";
        db: "db";
    }>;
    enabled: z.ZodBoolean;
    dailyReportEnabled: z.ZodBoolean;
    syncFailureAlertsEnabled: z.ZodBoolean;
    reportHourUtc: z.ZodNumber;
    connectionStatus: z.ZodEnum<{
        connected: "connected";
        not_configured: "not_configured";
        untested: "untested";
        last_message_failed: "last_message_failed";
    }>;
    lastMessageAt: z.ZodNullable<z.ZodString>;
    lastMessageError: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const notificationsSettingsUpdateBodySchema: z.ZodObject<{
    enabled: z.ZodOptional<z.ZodBoolean>;
    dailyReportEnabled: z.ZodOptional<z.ZodBoolean>;
    syncFailureAlertsEnabled: z.ZodOptional<z.ZodBoolean>;
    reportHourUtc: z.ZodOptional<z.ZodNumber>;
    botToken: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    chatId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export declare const notificationsTestMessageResponseSchema: z.ZodObject<{
    status: z.ZodString;
    error: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const notificationsDiscoverChatsBodySchema: z.ZodObject<{
    botToken: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const notificationsDiscoverChatsResponseSchema: z.ZodObject<{
    botUsername: z.ZodNullable<z.ZodString>;
    chats: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodString;
        title: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const notificationsIncidentItemSchema: z.ZodObject<{
    id: z.ZodNumber;
    incidentKey: z.ZodString;
    kind: z.ZodEnum<{
        auth_blocked: "auth_blocked";
        proxy_failed: "proxy_failed";
        proxy_missing: "proxy_missing";
        stream_failed_threshold: "stream_failed_threshold";
        ofapi_auth: "ofapi_auth";
        ofapi_low_credit: "ofapi_low_credit";
        ofapi_webhook_silence: "ofapi_webhook_silence";
        ofapi_burn_rate: "ofapi_burn_rate";
        db_disk_usage: "db_disk_usage";
        observations_partitions: "observations_partitions";
        wrong_transactions_writer: "wrong_transactions_writer";
        read_gateway_capture: "read_gateway_capture";
        golden_signal_lag: "golden_signal_lag";
        scheduler_silent: "scheduler_silent";
        ops_sampler_silent: "ops_sampler_silent";
    }>;
    pageLabel: z.ZodNullable<z.ZodString>;
    platform: z.ZodNullable<z.ZodEnum<{
        fansly: "fansly";
        onlyfans: "onlyfans";
    }>>;
    stream: z.ZodNullable<z.ZodString>;
    status: z.ZodEnum<{
        open: "open";
        resolved: "resolved";
    }>;
    openedAt: z.ZodString;
    lastSeenAt: z.ZodString;
    resolvedAt: z.ZodNullable<z.ZodString>;
    errorCode: z.ZodNullable<z.ZodString>;
    errorSummary: z.ZodNullable<z.ZodString>;
    notificationCount: z.ZodNumber;
}, z.core.$strip>;
export declare const notificationsIncidentsQuerySchema: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<{
        open: "open";
        resolved: "resolved";
    }>>;
    kind: z.ZodOptional<z.ZodEnum<{
        auth_blocked: "auth_blocked";
        proxy_failed: "proxy_failed";
        proxy_missing: "proxy_missing";
        stream_failed_threshold: "stream_failed_threshold";
        ofapi_auth: "ofapi_auth";
        ofapi_low_credit: "ofapi_low_credit";
        ofapi_webhook_silence: "ofapi_webhook_silence";
        ofapi_burn_rate: "ofapi_burn_rate";
        db_disk_usage: "db_disk_usage";
        observations_partitions: "observations_partitions";
        wrong_transactions_writer: "wrong_transactions_writer";
        read_gateway_capture: "read_gateway_capture";
        golden_signal_lag: "golden_signal_lag";
        scheduler_silent: "scheduler_silent";
        ops_sampler_silent: "ops_sampler_silent";
    }>>;
    pageLabel: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export declare const notificationsIncidentsResponseSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        id: z.ZodNumber;
        incidentKey: z.ZodString;
        kind: z.ZodEnum<{
            auth_blocked: "auth_blocked";
            proxy_failed: "proxy_failed";
            proxy_missing: "proxy_missing";
            stream_failed_threshold: "stream_failed_threshold";
            ofapi_auth: "ofapi_auth";
            ofapi_low_credit: "ofapi_low_credit";
            ofapi_webhook_silence: "ofapi_webhook_silence";
            ofapi_burn_rate: "ofapi_burn_rate";
            db_disk_usage: "db_disk_usage";
            observations_partitions: "observations_partitions";
            wrong_transactions_writer: "wrong_transactions_writer";
            read_gateway_capture: "read_gateway_capture";
            golden_signal_lag: "golden_signal_lag";
            scheduler_silent: "scheduler_silent";
            ops_sampler_silent: "ops_sampler_silent";
        }>;
        pageLabel: z.ZodNullable<z.ZodString>;
        platform: z.ZodNullable<z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>>;
        stream: z.ZodNullable<z.ZodString>;
        status: z.ZodEnum<{
            open: "open";
            resolved: "resolved";
        }>;
        openedAt: z.ZodString;
        lastSeenAt: z.ZodString;
        resolvedAt: z.ZodNullable<z.ZodString>;
        errorCode: z.ZodNullable<z.ZodString>;
        errorSummary: z.ZodNullable<z.ZodString>;
        notificationCount: z.ZodNumber;
    }, z.core.$strip>>;
    total: z.ZodNumber;
}, z.core.$strip>;
export declare const notificationsResolveIncidentResponseSchema: z.ZodObject<{
    ok: z.ZodLiteral<true>;
}, z.core.$strip>;
export declare const notificationsReportPreviewResponseSchema: z.ZodObject<{
    text: z.ZodString;
    reportDate: z.ZodString;
}, z.core.$strip>;
export declare const notificationsReportSendResponseSchema: z.ZodObject<{
    status: z.ZodString;
    error: z.ZodNullable<z.ZodString>;
    reportDate: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const notificationsDeliveryAttemptItemSchema: z.ZodObject<{
    id: z.ZodNumber;
    kind: z.ZodEnum<{
        test: "test";
        daily_report_scheduled: "daily_report_scheduled";
        daily_report_manual: "daily_report_manual";
        incident_opened: "incident_opened";
        incident_resolved: "incident_resolved";
        incident_manually_resolved: "incident_manually_resolved";
    }>;
    status: z.ZodString;
    reportDate: z.ZodNullable<z.ZodString>;
    error: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
}, z.core.$strip>;
export declare const notificationsReportHistoryResponseSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        id: z.ZodNumber;
        kind: z.ZodEnum<{
            test: "test";
            daily_report_scheduled: "daily_report_scheduled";
            daily_report_manual: "daily_report_manual";
            incident_opened: "incident_opened";
            incident_resolved: "incident_resolved";
            incident_manually_resolved: "incident_manually_resolved";
        }>;
        status: z.ZodString;
        reportDate: z.ZodNullable<z.ZodString>;
        error: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const verifyCredentialsBodySchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    platform: z.ZodLiteral<"fansly">;
    session: z.ZodObject<{
        authorization: z.ZodString;
        fanslyClientId: z.ZodOptional<z.ZodString>;
        fanslyClientCheck: z.ZodOptional<z.ZodString>;
        fanslySessionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    proxy: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        url: z.ZodString;
        username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        password: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>>>;
}, z.core.$strip>, z.ZodObject<{
    platform: z.ZodLiteral<"onlyfans">;
    username: z.ZodString;
}, z.core.$strip>], "platform">;
export declare const verifyCredentialsResponseSchema: z.ZodObject<{
    valid: z.ZodLiteral<true>;
    platform: z.ZodEnum<{
        fansly: "fansly";
        onlyfans: "onlyfans";
    }>;
    username: z.ZodNullable<z.ZodString>;
    displayName: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const createPageBodySchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    platform: z.ZodLiteral<"fansly">;
    session: z.ZodObject<{
        authorization: z.ZodString;
        fanslyClientId: z.ZodOptional<z.ZodString>;
        fanslyClientCheck: z.ZodOptional<z.ZodString>;
        fanslySessionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    proxy: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        url: z.ZodString;
        username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        password: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>>>;
    modelSlug: z.ZodString;
    label: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    platform: z.ZodLiteral<"onlyfans">;
    username: z.ZodString;
    modelSlug: z.ZodString;
    label: z.ZodString;
}, z.core.$strip>], "platform">;
export declare const testProxyBodySchema: z.ZodObject<{
    proxy: z.ZodObject<{
        url: z.ZodString;
        username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        password: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const testProxyResponseSchema: z.ZodObject<{
    ip: z.ZodString;
}, z.core.$strip>;
export declare const createModelBodySchema: z.ZodObject<{
    slug: z.ZodString;
    name: z.ZodString;
}, z.core.$strip>;
export declare const updateModelBodySchema: z.ZodObject<{
    slug: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    sortOrder: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const createModelResponseSchema: z.ZodObject<{
    id: z.ZodNumber;
    slug: z.ZodString;
    name: z.ZodString;
}, z.core.$strip>;
export declare const updatePageBodySchema: z.ZodObject<{
    label: z.ZodOptional<z.ZodString>;
    modelSlug: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const updateCredentialsBodySchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    platform: z.ZodLiteral<"fansly">;
    session: z.ZodOptional<z.ZodObject<{
        authorization: z.ZodString;
        fanslyClientId: z.ZodOptional<z.ZodString>;
        fanslyClientCheck: z.ZodOptional<z.ZodString>;
        fanslySessionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    proxy: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        url: z.ZodString;
        username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        password: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>>>;
}, z.core.$strip>, z.ZodObject<{
    platform: z.ZodLiteral<"onlyfans">;
}, z.core.$strip>], "platform">;
export declare const verifyPageResponseSchema: z.ZodObject<{
    verified: z.ZodBoolean;
    username: z.ZodNullable<z.ZodString>;
    platform: z.ZodEnum<{
        fansly: "fansly";
        onlyfans: "onlyfans";
    }>;
    syncUnblocked: z.ZodBoolean;
}, z.core.$strip>;
export declare const adminCreatePageResponseSchema: z.ZodObject<{
    page: z.ZodObject<{
        id: z.ZodNumber;
        label: z.ZodString;
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        modelSlug: z.ZodString;
        modelName: z.ZodString;
        username: z.ZodNullable<z.ZodString>;
        displayName: z.ZodNullable<z.ZodString>;
        followerCount: z.ZodObject<{
            value: z.ZodNullable<z.ZodNumber>;
            available: z.ZodBoolean;
        }, z.core.$strip>;
        subscriberCount: z.ZodObject<{
            value: z.ZodNullable<z.ZodNumber>;
            available: z.ZodBoolean;
        }, z.core.$strip>;
        lastLightSyncAt: z.ZodNullable<z.ZodString>;
        lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    verified: z.ZodBoolean;
    syncQueued: z.ZodBoolean;
    syncWarning: z.ZodNullable<z.ZodObject<{
        code: z.ZodLiteral<"initial_sync_enqueue_failed">;
        message: z.ZodString;
    }, z.core.$strip>>;
    syncRetry: z.ZodNullable<z.ZodObject<{
        method: z.ZodLiteral<"POST">;
        path: z.ZodLiteral<"/api/v1/admin/sync/trigger">;
        body: z.ZodObject<{
            pageLabel: z.ZodString;
            scope: z.ZodEnum<{
                all: "all";
                messages: "messages";
                light: "light";
                followers: "followers";
                data: "data";
            }>;
        }, z.core.$strip>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const adminUpdatePageResponseSchema: z.ZodObject<{
    page: z.ZodObject<{
        id: z.ZodNumber;
        label: z.ZodString;
        platform: z.ZodEnum<{
            fansly: "fansly";
            onlyfans: "onlyfans";
        }>;
        modelSlug: z.ZodString;
        modelName: z.ZodString;
        username: z.ZodNullable<z.ZodString>;
        displayName: z.ZodNullable<z.ZodString>;
        followerCount: z.ZodObject<{
            value: z.ZodNullable<z.ZodNumber>;
            available: z.ZodBoolean;
        }, z.core.$strip>;
        subscriberCount: z.ZodObject<{
            value: z.ZodNullable<z.ZodNumber>;
            available: z.ZodBoolean;
        }, z.core.$strip>;
        lastLightSyncAt: z.ZodNullable<z.ZodString>;
        lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const updateCredentialsResponseSchema: z.ZodObject<{
    updated: z.ZodBoolean;
    verified: z.ZodBoolean;
    syncUnblocked: z.ZodBoolean;
}, z.core.$strip>;
export declare const deletedResponseSchema: z.ZodObject<{
    deleted: z.ZodLiteral<true>;
}, z.core.$strip>;
export declare const normalizedSyncMessageMediaSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<{
        other: "other";
        photo: "photo";
        video: "video";
        audio: "audio";
        gif: "gif";
    }>;
    isReady: z.ZodBoolean;
    locked: z.ZodBoolean;
    durationSeconds: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, z.core.$strip>;
export declare const normalizedSyncMessageReplyToSchema: z.ZodObject<{
    messageId: z.ZodOptional<z.ZodString>;
    sender: z.ZodOptional<z.ZodEnum<{
        model: "model";
        fan: "fan";
    }>>;
    textPreview: z.ZodString;
}, z.core.$strip>;
export declare const normalizedSyncMessageSchema: z.ZodObject<{
    id: z.ZodString;
    text: z.ZodString;
    createdAt: z.ZodString;
    isSentByMe: z.ZodBoolean;
    price: z.ZodNumber;
    isOpened: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
    isNew: z.ZodOptional<z.ZodBoolean>;
    isTip: z.ZodOptional<z.ZodBoolean>;
    tipAmountUsd: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    tipText: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    mediaCount: z.ZodOptional<z.ZodNumber>;
    media: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<{
            other: "other";
            photo: "photo";
            video: "video";
            audio: "audio";
            gif: "gif";
        }>;
        isReady: z.ZodBoolean;
        locked: z.ZodBoolean;
        durationSeconds: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    }, z.core.$strip>>>;
    replyTo: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        messageId: z.ZodOptional<z.ZodString>;
        sender: z.ZodOptional<z.ZodEnum<{
            model: "model";
            fan: "fan";
        }>>;
        textPreview: z.ZodString;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export declare const chatListUpdatedEventSchema: z.ZodObject<{
    type: z.ZodLiteral<"chatListUpdated">;
    accountId: z.ZodString;
}, z.core.$strip>;
export declare const messageReceivedEventSchema: z.ZodObject<{
    type: z.ZodLiteral<"messageReceived">;
    accountId: z.ZodString;
    chatId: z.ZodString;
    messageId: z.ZodString;
    message: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        text: z.ZodString;
        createdAt: z.ZodString;
        isSentByMe: z.ZodBoolean;
        price: z.ZodNumber;
        isOpened: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
        isNew: z.ZodOptional<z.ZodBoolean>;
        isTip: z.ZodOptional<z.ZodBoolean>;
        tipAmountUsd: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        tipText: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        mediaCount: z.ZodOptional<z.ZodNumber>;
        media: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            type: z.ZodEnum<{
                other: "other";
                photo: "photo";
                video: "video";
                audio: "audio";
                gif: "gif";
            }>;
            isReady: z.ZodBoolean;
            locked: z.ZodBoolean;
            durationSeconds: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        }, z.core.$strip>>>;
        replyTo: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            messageId: z.ZodOptional<z.ZodString>;
            sender: z.ZodOptional<z.ZodEnum<{
                model: "model";
                fan: "fan";
            }>>;
            textPreview: z.ZodString;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const messageSentEventSchema: z.ZodObject<{
    type: z.ZodLiteral<"messageSent">;
    accountId: z.ZodString;
    chatId: z.ZodString;
    messageId: z.ZodString;
    message: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        text: z.ZodString;
        createdAt: z.ZodString;
        isSentByMe: z.ZodBoolean;
        price: z.ZodNumber;
        isOpened: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
        isNew: z.ZodOptional<z.ZodBoolean>;
        isTip: z.ZodOptional<z.ZodBoolean>;
        tipAmountUsd: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        tipText: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        mediaCount: z.ZodOptional<z.ZodNumber>;
        media: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            type: z.ZodEnum<{
                other: "other";
                photo: "photo";
                video: "video";
                audio: "audio";
                gif: "gif";
            }>;
            isReady: z.ZodBoolean;
            locked: z.ZodBoolean;
            durationSeconds: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        }, z.core.$strip>>>;
        replyTo: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            messageId: z.ZodOptional<z.ZodString>;
            sender: z.ZodOptional<z.ZodEnum<{
                model: "model";
                fan: "fan";
            }>>;
            textPreview: z.ZodString;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const messageDeletedEventSchema: z.ZodObject<{
    type: z.ZodLiteral<"messageDeleted">;
    accountId: z.ZodString;
    messageId: z.ZodString;
}, z.core.$strip>;
export declare const ppvUnlockedEventSchema: z.ZodObject<{
    type: z.ZodLiteral<"ppvUnlocked">;
    accountId: z.ZodString;
    chatId: z.ZodString;
    messageId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const tipReceivedEventSchema: z.ZodObject<{
    type: z.ZodLiteral<"tipReceived">;
    accountId: z.ZodString;
    chatId: z.ZodString;
    messageId: z.ZodOptional<z.ZodString>;
    amountUsd: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const presenceEventSchema: z.ZodObject<{
    type: z.ZodLiteral<"presence">;
    accountId: z.ZodString;
    chatId: z.ZodString;
    online: z.ZodBoolean;
    lastSeenAt: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const typingEventSchema: z.ZodObject<{
    type: z.ZodLiteral<"typing">;
    accountId: z.ZodString;
    chatId: z.ZodString;
}, z.core.$strip>;
export declare const accountAuthChangedEventSchema: z.ZodObject<{
    type: z.ZodLiteral<"accountAuthChanged">;
    accountId: z.ZodString;
    authenticated: z.ZodBoolean;
}, z.core.$strip>;
export declare const syncEventSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"chatListUpdated">;
    accountId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"messageReceived">;
    accountId: z.ZodString;
    chatId: z.ZodString;
    messageId: z.ZodString;
    message: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        text: z.ZodString;
        createdAt: z.ZodString;
        isSentByMe: z.ZodBoolean;
        price: z.ZodNumber;
        isOpened: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
        isNew: z.ZodOptional<z.ZodBoolean>;
        isTip: z.ZodOptional<z.ZodBoolean>;
        tipAmountUsd: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        tipText: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        mediaCount: z.ZodOptional<z.ZodNumber>;
        media: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            type: z.ZodEnum<{
                other: "other";
                photo: "photo";
                video: "video";
                audio: "audio";
                gif: "gif";
            }>;
            isReady: z.ZodBoolean;
            locked: z.ZodBoolean;
            durationSeconds: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        }, z.core.$strip>>>;
        replyTo: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            messageId: z.ZodOptional<z.ZodString>;
            sender: z.ZodOptional<z.ZodEnum<{
                model: "model";
                fan: "fan";
            }>>;
            textPreview: z.ZodString;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"messageSent">;
    accountId: z.ZodString;
    chatId: z.ZodString;
    messageId: z.ZodString;
    message: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        text: z.ZodString;
        createdAt: z.ZodString;
        isSentByMe: z.ZodBoolean;
        price: z.ZodNumber;
        isOpened: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
        isNew: z.ZodOptional<z.ZodBoolean>;
        isTip: z.ZodOptional<z.ZodBoolean>;
        tipAmountUsd: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        tipText: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        mediaCount: z.ZodOptional<z.ZodNumber>;
        media: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            type: z.ZodEnum<{
                other: "other";
                photo: "photo";
                video: "video";
                audio: "audio";
                gif: "gif";
            }>;
            isReady: z.ZodBoolean;
            locked: z.ZodBoolean;
            durationSeconds: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        }, z.core.$strip>>>;
        replyTo: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            messageId: z.ZodOptional<z.ZodString>;
            sender: z.ZodOptional<z.ZodEnum<{
                model: "model";
                fan: "fan";
            }>>;
            textPreview: z.ZodString;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"messageDeleted">;
    accountId: z.ZodString;
    messageId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"ppvUnlocked">;
    accountId: z.ZodString;
    chatId: z.ZodString;
    messageId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"tipReceived">;
    accountId: z.ZodString;
    chatId: z.ZodString;
    messageId: z.ZodOptional<z.ZodString>;
    amountUsd: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"presence">;
    accountId: z.ZodString;
    chatId: z.ZodString;
    online: z.ZodBoolean;
    lastSeenAt: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"typing">;
    accountId: z.ZodString;
    chatId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"accountAuthChanged">;
    accountId: z.ZodString;
    authenticated: z.ZodBoolean;
}, z.core.$strip>], "type">;
export declare const syncSnapshotRequiredResponseSchema: z.ZodObject<{
    error: z.ZodLiteral<"sync_snapshot_required">;
    message: z.ZodString;
    statusCode: z.ZodLiteral<409>;
    version: z.ZodLiteral<1>;
    requestedSeq: z.ZodNumber;
    oldestAvailableSeq: z.ZodNullable<z.ZodNumber>;
    currentSeq: z.ZodNumber;
    snapshotPath: z.ZodLiteral<"/api/v1/events/snapshot">;
}, z.core.$strip>;
/** A sticky snapshotCursor/stateCursor became older than cleanup's durable
 * replay floor while a paged recovery was in progress. Clients must discard
 * only that matching progress record and restart the snapshot without either
 * cursor; retrying the same continuation can never succeed. */
export declare const syncSnapshotRestartRequiredResponseSchema: z.ZodObject<{
    error: z.ZodLiteral<"sync_snapshot_restart_required">;
    message: z.ZodString;
    statusCode: z.ZodLiteral<409>;
    replayFloor: z.ZodNumber;
    snapshotPath: z.ZodLiteral<"/api/v1/events/snapshot">;
}, z.core.$strip>;
export declare const domainEventFrameSchema: z.ZodObject<{
    accountId: z.ZodNumber;
    accountSeq: z.ZodNumber;
    type: z.ZodString;
    occurredAt: z.ZodString;
    data: z.ZodUnknown;
    fanRef: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    conversationRef: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    messageRef: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    accountRef: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    payload: z.ZodOptional<z.ZodUnknown>;
}, z.core.$strip>;
export declare const domainEventsSnapshotRequiredAccountSchema: z.ZodObject<{
    accountId: z.ZodNumber;
    requestedSeq: z.ZodNumber;
    oldestAvailableSeq: z.ZodNullable<z.ZodNumber>;
    currentSeq: z.ZodNumber;
}, z.core.$strip>;
export declare const domainEventsSnapshotRequiredResponseSchema: z.ZodObject<{
    error: z.ZodLiteral<"sync_snapshot_required">;
    message: z.ZodString;
    statusCode: z.ZodLiteral<409>;
    version: z.ZodLiteral<2>;
    accounts: z.ZodArray<z.ZodObject<{
        accountId: z.ZodNumber;
        requestedSeq: z.ZodNumber;
        oldestAvailableSeq: z.ZodNullable<z.ZodNumber>;
        currentSeq: z.ZodNumber;
    }, z.core.$strip>>;
    snapshotPath: z.ZodLiteral<"/api/v1/events/v2/snapshot">;
}, z.core.$strip>;
export declare const domainEventsSnapshotResponseSchema: z.ZodObject<{
    cursor: z.ZodString;
    accounts: z.ZodArray<z.ZodObject<{
        accountId: z.ZodNumber;
        accountRef: z.ZodNullable<z.ZodString>;
        currentSeq: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const syncSnapshotQuerySchema: z.ZodObject<{
    accountId: z.ZodString;
    afterSeq: z.ZodCoercedNumber<unknown>;
    snapshotCursor: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    pageCursor: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    pageMode: z.ZodOptional<z.ZodLiteral<"bounded_v1">>;
    stateCursor: z.ZodOptional<z.ZodString>;
    messageLimit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export declare const syncSnapshotMessageSchema: z.ZodObject<{
    chatId: z.ZodString;
    messageId: z.ZodString;
    message: z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        text: z.ZodString;
        createdAt: z.ZodString;
        isSentByMe: z.ZodBoolean;
        price: z.ZodNumber;
        isOpened: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
        isNew: z.ZodOptional<z.ZodBoolean>;
        isTip: z.ZodOptional<z.ZodBoolean>;
        tipAmountUsd: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        tipText: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        mediaCount: z.ZodOptional<z.ZodNumber>;
        media: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            type: z.ZodEnum<{
                other: "other";
                photo: "photo";
                video: "video";
                audio: "audio";
                gif: "gif";
            }>;
            isReady: z.ZodBoolean;
            locked: z.ZodBoolean;
            durationSeconds: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        }, z.core.$strip>>>;
        replyTo: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            messageId: z.ZodOptional<z.ZodString>;
            sender: z.ZodOptional<z.ZodEnum<{
                model: "model";
                fan: "fan";
            }>>;
            textPreview: z.ZodString;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
    deletedAt: z.ZodNullable<z.ZodString>;
    sourceUpdatedAt: z.ZodString;
    sourceFanoutSeq: z.ZodNullable<z.ZodNumber>;
}, z.core.$strip>;
export declare const syncSnapshotThreadSchema: z.ZodObject<{
    chatId: z.ZodString;
    fanName: z.ZodString;
    unreadCount: z.ZodNumber;
    hasUnreadTips: z.ZodBoolean;
    lastMessageId: z.ZodNullable<z.ZodString>;
    lastMessageAt: z.ZodNullable<z.ZodString>;
    lastMessageIsSentByMe: z.ZodBoolean;
    lastMessagePreview: z.ZodString;
    visible: z.ZodBoolean;
    sourceUpdatedAt: z.ZodString;
    messages: z.ZodArray<z.ZodObject<{
        chatId: z.ZodString;
        messageId: z.ZodString;
        message: z.ZodNullable<z.ZodObject<{
            id: z.ZodString;
            text: z.ZodString;
            createdAt: z.ZodString;
            isSentByMe: z.ZodBoolean;
            price: z.ZodNumber;
            isOpened: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
            isNew: z.ZodOptional<z.ZodBoolean>;
            isTip: z.ZodOptional<z.ZodBoolean>;
            tipAmountUsd: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            tipText: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            mediaCount: z.ZodOptional<z.ZodNumber>;
            media: z.ZodOptional<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                type: z.ZodEnum<{
                    other: "other";
                    photo: "photo";
                    video: "video";
                    audio: "audio";
                    gif: "gif";
                }>;
                isReady: z.ZodBoolean;
                locked: z.ZodBoolean;
                durationSeconds: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.core.$strip>>>;
            replyTo: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                messageId: z.ZodOptional<z.ZodString>;
                sender: z.ZodOptional<z.ZodEnum<{
                    model: "model";
                    fan: "fan";
                }>>;
                textPreview: z.ZodString;
            }, z.core.$strip>>>;
        }, z.core.$strip>>;
        deletedAt: z.ZodNullable<z.ZodString>;
        sourceUpdatedAt: z.ZodString;
        sourceFanoutSeq: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const syncSnapshotUnresolvedTombstoneSchema: z.ZodObject<{
    messageId: z.ZodString;
    deletedAt: z.ZodString;
    sourceUpdatedAt: z.ZodString;
    sourceFanoutSeq: z.ZodNumber;
}, z.core.$strip>;
export declare const syncSnapshotResponseSchema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    requestedAfterSeq: z.ZodNumber;
    snapshotCursor: z.ZodNumber;
    stateAt: z.ZodString;
    resumeAllowed: z.ZodBoolean;
    page: z.ZodObject<{
        pageId: z.ZodNumber;
        label: z.ZodString;
        accountId: z.ZodString;
        username: z.ZodNullable<z.ZodString>;
        authStatus: z.ZodNullable<z.ZodString>;
        authenticated: z.ZodNullable<z.ZodBoolean>;
        authChangedAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    coverage: z.ZodObject<{
        durableDomains: z.ZodArray<z.ZodEnum<{
            chat_heads: "chat_heads";
            hot_messages: "hot_messages";
            message_tombstones: "message_tombstones";
            account_auth: "account_auth";
        }>>;
        omittedDomains: z.ZodArray<z.ZodObject<{
            domain: z.ZodString;
            reason: z.ZodString;
        }, z.core.$strip>>;
        messageWindow: z.ZodLiteral<"hot_projection_plus_archive_delta">;
    }, z.core.$strip>;
    threads: z.ZodArray<z.ZodObject<{
        chatId: z.ZodString;
        fanName: z.ZodString;
        unreadCount: z.ZodNumber;
        hasUnreadTips: z.ZodBoolean;
        lastMessageId: z.ZodNullable<z.ZodString>;
        lastMessageAt: z.ZodNullable<z.ZodString>;
        lastMessageIsSentByMe: z.ZodBoolean;
        lastMessagePreview: z.ZodString;
        visible: z.ZodBoolean;
        sourceUpdatedAt: z.ZodString;
        messages: z.ZodArray<z.ZodObject<{
            chatId: z.ZodString;
            messageId: z.ZodString;
            message: z.ZodNullable<z.ZodObject<{
                id: z.ZodString;
                text: z.ZodString;
                createdAt: z.ZodString;
                isSentByMe: z.ZodBoolean;
                price: z.ZodNumber;
                isOpened: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
                isNew: z.ZodOptional<z.ZodBoolean>;
                isTip: z.ZodOptional<z.ZodBoolean>;
                tipAmountUsd: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                tipText: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                mediaCount: z.ZodOptional<z.ZodNumber>;
                media: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    type: z.ZodEnum<{
                        other: "other";
                        photo: "photo";
                        video: "video";
                        audio: "audio";
                        gif: "gif";
                    }>;
                    isReady: z.ZodBoolean;
                    locked: z.ZodBoolean;
                    durationSeconds: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.core.$strip>>>;
                replyTo: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    messageId: z.ZodOptional<z.ZodString>;
                    sender: z.ZodOptional<z.ZodEnum<{
                        model: "model";
                        fan: "fan";
                    }>>;
                    textPreview: z.ZodString;
                }, z.core.$strip>>>;
            }, z.core.$strip>>;
            deletedAt: z.ZodNullable<z.ZodString>;
            sourceUpdatedAt: z.ZodString;
            sourceFanoutSeq: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    unresolvedTombstones: z.ZodArray<z.ZodObject<{
        messageId: z.ZodString;
        deletedAt: z.ZodString;
        sourceUpdatedAt: z.ZodString;
        sourceFanoutSeq: z.ZodNumber;
    }, z.core.$strip>>;
    nextPageCursor: z.ZodNullable<z.ZodNumber>;
    nextStateCursor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export declare const ofapiWebhookAckResponseSchema: z.ZodObject<{
    received: z.ZodLiteral<true>;
    duplicate: z.ZodBoolean;
}, z.core.$strip>;
export declare const ofapiPageMappingSchema: z.ZodObject<{
    pageId: z.ZodNumber;
    label: z.ZodString;
    username: z.ZodNullable<z.ZodString>;
    ofapiAccountId: z.ZodNullable<z.ZodString>;
    ofapiAuthStatus: z.ZodNullable<z.ZodString>;
    ofapiAuthChangedAt: z.ZodNullable<z.ZodString>;
    lastEventAt: z.ZodNullable<z.ZodString>;
    lastEventAgeSeconds: z.ZodNullable<z.ZodNumber>;
}, z.core.$strip>;
export declare const ofapiWebhookRegistrationStateSchema: z.ZodEnum<{
    stable: "stable";
    create_prepared: "create_prepared";
    create_dispatching: "create_dispatching";
    create_indeterminate: "create_indeterminate";
    create_failed: "create_failed";
    update_prepared: "update_prepared";
    update_dispatching: "update_dispatching";
    update_indeterminate: "update_indeterminate";
}>;
export declare const ofapiWebhookPendingRegistrationSchema: z.ZodObject<{
    operationId: z.ZodString;
    operation: z.ZodEnum<{
        create: "create";
        update: "update";
    }>;
    externalWebhookId: z.ZodNullable<z.ZodString>;
    endpointUrl: z.ZodString;
    accountScope: z.ZodLiteral<"global">;
    events: z.ZodArray<z.ZodString>;
    preparedAt: z.ZodString;
}, z.core.$strip>;
export declare const ofapiWebhookStatusResponseSchema: z.ZodObject<{
    configured: z.ZodBoolean;
    registrationState: z.ZodNullable<z.ZodEnum<{
        stable: "stable";
        create_prepared: "create_prepared";
        create_dispatching: "create_dispatching";
        create_indeterminate: "create_indeterminate";
        create_failed: "create_failed";
        update_prepared: "update_prepared";
        update_dispatching: "update_dispatching";
        update_indeterminate: "update_indeterminate";
    }>>;
    registrationError: z.ZodNullable<z.ZodString>;
    pendingRegistration: z.ZodNullable<z.ZodObject<{
        operationId: z.ZodString;
        operation: z.ZodEnum<{
            create: "create";
            update: "update";
        }>;
        externalWebhookId: z.ZodNullable<z.ZodString>;
        endpointUrl: z.ZodString;
        accountScope: z.ZodLiteral<"global">;
        events: z.ZodArray<z.ZodString>;
        preparedAt: z.ZodString;
    }, z.core.$strip>>;
    endpointUrl: z.ZodNullable<z.ZodString>;
    externalWebhookId: z.ZodNullable<z.ZodString>;
    accountScope: z.ZodNullable<z.ZodString>;
    events: z.ZodArray<z.ZodString>;
    signingSecretMask: z.ZodNullable<z.ZodString>;
    updatedAt: z.ZodNullable<z.ZodString>;
    pages: z.ZodArray<z.ZodObject<{
        pageId: z.ZodNumber;
        label: z.ZodString;
        username: z.ZodNullable<z.ZodString>;
        ofapiAccountId: z.ZodNullable<z.ZodString>;
        ofapiAuthStatus: z.ZodNullable<z.ZodString>;
        ofapiAuthChangedAt: z.ZodNullable<z.ZodString>;
        lastEventAt: z.ZodNullable<z.ZodString>;
        lastEventAgeSeconds: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>;
    credit: z.ZodObject<{
        lastBalance: z.ZodNullable<z.ZodNumber>;
        lastBalanceAt: z.ZodNullable<z.ZodString>;
        spentToday: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const ofapiWebhookRegisterBodySchema: z.ZodObject<{
    endpointUrl: z.ZodString;
}, z.core.$strip>;
export declare const ofapiWebhookReconcileBodySchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    action: z.ZodLiteral<"adopt">;
    operationId: z.ZodString;
    externalWebhookId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    action: z.ZodLiteral<"confirm_not_created">;
    operationId: z.ZodString;
    reason: z.ZodString;
}, z.core.$strip>], "action">;
export declare const ofapiCaptureSeedBodySchema: z.ZodObject<{
    dryRun: z.ZodDefault<z.ZodBoolean>;
    goal: z.ZodDefault<z.ZodEnum<{
        connect_to_anchor: "connect_to_anchor";
        history_to_exhaustion: "history_to_exhaustion";
    }>>;
    targets: z.ZodArray<z.ZodObject<{
        pageId: z.ZodNumber;
        chatId: z.ZodString;
        anchorMessageId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const ofapiCaptureSeedResponseSchema: z.ZodObject<{
    dryRun: z.ZodBoolean;
    seedId: z.ZodString;
    limits: z.ZodObject<{
        maxTargets: z.ZodLiteral<20>;
        maxPagesPerJob: z.ZodLiteral<3>;
        maxCallsPerJob: z.ZodLiteral<3>;
        maxCreditsPerJob: z.ZodLiteral<3>;
        maxItemsPerJob: z.ZodLiteral<300>;
    }, z.core.$strip>;
    created: z.ZodNumber;
    coalesced: z.ZodNumber;
    skipped: z.ZodNumber;
    results: z.ZodArray<z.ZodObject<{
        pageId: z.ZodNumber;
        chatId: z.ZodString;
        goal: z.ZodEnum<{
            connect_to_anchor: "connect_to_anchor";
            history_to_exhaustion: "history_to_exhaustion";
        }>;
        frozenHeadId: z.ZodString;
        anchorMessageId: z.ZodNullable<z.ZodString>;
        status: z.ZodEnum<{
            created: "created";
            coalesced: "coalesced";
            would_create: "would_create";
            would_coalesce: "would_coalesce";
            already_covered: "already_covered";
            already_captured: "already_captured";
        }>;
        jobId: z.ZodNullable<z.ZodString>;
        state: z.ZodNullable<z.ZodEnum<{
            complete: "complete";
            blocked: "blocked";
            ready: "ready";
            leased: "leased";
            awaiting_parse: "awaiting_parse";
            retry_wait: "retry_wait";
            cancelled: "cancelled";
        }>>;
        reasonCode: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const ofapiExportQuoteBodySchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    profile: z.ZodLiteral<"pilot_chats">;
    chatIds: z.ZodArray<z.ZodString>;
    dryRun: z.ZodDefault<z.ZodBoolean>;
    pageId: z.ZodNumber;
    startDate: z.ZodString;
    endDate: z.ZodString;
    maxMessages: z.ZodDefault<z.ZodNumber>;
    quoteTtlMinutes: z.ZodDefault<z.ZodNumber>;
}, z.core.$strict>, z.ZodObject<{
    profile: z.ZodLiteral<"fleet_tail">;
    dryRun: z.ZodDefault<z.ZodBoolean>;
    pageId: z.ZodNumber;
    startDate: z.ZodString;
    endDate: z.ZodString;
    maxMessages: z.ZodDefault<z.ZodNumber>;
    quoteTtlMinutes: z.ZodDefault<z.ZodNumber>;
}, z.core.$strict>], "profile">;
export declare const ofapiExportQuoteCreateResponseSchema: z.ZodObject<{
    dryRun: z.ZodBoolean;
    status: z.ZodEnum<{
        created: "created";
        coalesced: "coalesced";
        would_create: "would_create";
        would_coalesce: "would_coalesce";
    }>;
    jobId: z.ZodNullable<z.ZodString>;
    pageId: z.ZodNumber;
    profile: z.ZodEnum<{
        pilot_chats: "pilot_chats";
        fleet_tail: "fleet_tail";
    }>;
    targetHash: z.ZodString;
    state: z.ZodNullable<z.ZodEnum<{
        complete: "complete";
        blocked: "blocked";
        ready: "ready";
        leased: "leased";
        awaiting_parse: "awaiting_parse";
        retry_wait: "retry_wait";
        cancelled: "cancelled";
    }>>;
    reasonCode: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const ofapiExportQuoteParamsSchema: z.ZodObject<{
    jobId: z.ZodString;
}, z.core.$strip>;
export declare const ofapiExportQuoteCancelBodySchema: z.ZodObject<{
    expectedState: z.ZodLiteral<"blocked">;
    reason: z.ZodString;
}, z.core.$strict>;
export declare const ofapiExportQuoteStatusResponseSchema: z.ZodObject<{
    jobId: z.ZodString;
    pageId: z.ZodNumber;
    profile: z.ZodEnum<{
        pilot_chats: "pilot_chats";
        fleet_tail: "fleet_tail";
    }>;
    targetHash: z.ZodString;
    state: z.ZodEnum<{
        complete: "complete";
        blocked: "blocked";
        ready: "ready";
        leased: "leased";
        awaiting_parse: "awaiting_parse";
        retry_wait: "retry_wait";
        cancelled: "cancelled";
    }>;
    reasonCode: z.ZodNullable<z.ZodString>;
    reasonMessage: z.ZodNullable<z.ZodString>;
    attemptCount: z.ZodNumber;
    dispatchCount: z.ZodNumber;
    spentCredits: z.ZodNumber;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    quote: z.ZodNullable<z.ZodObject<{
        vendorExportId: z.ZodString;
        vendorStatus: z.ZodString;
        totalRows: z.ZodNullable<z.ZodNumber>;
        creditCost: z.ZodNullable<z.ZodNumber>;
        pollCount: z.ZodNumber;
        quotedAt: z.ZodNullable<z.ZodString>;
        expiresAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const ofapiCaptureOperatorStatusResponseSchema: z.ZodObject<{
    controls: z.ZodArray<z.ZodObject<{
        controlKey: z.ZodString;
        paused: z.ZodBoolean;
        reason: z.ZodNullable<z.ZodString>;
        version: z.ZodNumber;
        updatedAt: z.ZodString;
    }, z.core.$strip>>;
    jobGroups: z.ZodArray<z.ZodObject<{
        state: z.ZodEnum<{
            complete: "complete";
            blocked: "blocked";
            ready: "ready";
            leased: "leased";
            awaiting_parse: "awaiting_parse";
            retry_wait: "retry_wait";
            cancelled: "cancelled";
        }>;
        reasonCode: z.ZodNullable<z.ZodString>;
        count: z.ZodNumber;
        oldestUpdatedAt: z.ZodString;
    }, z.core.$strip>>;
    jobSamples: z.ZodArray<z.ZodObject<{
        jobId: z.ZodString;
        pageId: z.ZodNumber;
        kind: z.ZodEnum<{
            chat_paginate: "chat_paginate";
            campaign_snapshot: "campaign_snapshot";
            head_repair: "head_repair";
            account_export: "account_export";
            export_import: "export_import";
        }>;
        state: z.ZodEnum<{
            complete: "complete";
            blocked: "blocked";
            ready: "ready";
            leased: "leased";
            awaiting_parse: "awaiting_parse";
            retry_wait: "retry_wait";
            cancelled: "cancelled";
        }>;
        reasonCode: z.ZodNullable<z.ZodString>;
        rowVersion: z.ZodNumber;
        updatedAt: z.ZodString;
    }, z.core.$strip>>;
    indeterminate: z.ZodObject<{
        count: z.ZodNumber;
        oldestAt: z.ZodNullable<z.ZodString>;
        samples: z.ZodArray<z.ZodObject<{
            attemptId: z.ZodString;
            captureJobId: z.ZodNullable<z.ZodString>;
            pageId: z.ZodNumber;
            operation: z.ZodString;
            state: z.ZodEnum<{
                reserved: "reserved";
                released_pre_dispatch: "released_pre_dispatch";
                dispatching: "dispatching";
                response_captured: "response_captured";
                indeterminate: "indeterminate";
            }>;
            creditState: z.ZodEnum<{
                reserved: "reserved";
                indeterminate: "indeterminate";
                settled: "settled";
                released: "released";
            }>;
            reservedCredits: z.ZodNumber;
            settledCredits: z.ZodNullable<z.ZodNumber>;
            certaintyResolution: z.ZodNullable<z.ZodString>;
            dispatchStartedAt: z.ZodNullable<z.ZodString>;
            finishedAt: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    storageHealth: z.ZodNullable<z.ZodObject<{
        healthy: z.ZodBoolean;
        breached: z.ZodBoolean;
        checkedAt: z.ZodString;
        usedBytes: z.ZodNullable<z.ZodNumber>;
        freeBytes: z.ZodNullable<z.ZodNumber>;
        totalBytes: z.ZodNullable<z.ZodNumber>;
        errorPresent: z.ZodBoolean;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const ofapiCaptureControlBodySchema: z.ZodObject<{
    controlKey: z.ZodString;
    paused: z.ZodBoolean;
    expectedVersion: z.ZodNumber;
    reason: z.ZodString;
    dryRun: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>;
export declare const ofapiCaptureControlResponseSchema: z.ZodObject<{
    executed: z.ZodBoolean;
    controlKey: z.ZodString;
    previous: z.ZodObject<{
        paused: z.ZodBoolean;
        reason: z.ZodNullable<z.ZodString>;
        version: z.ZodNumber;
    }, z.core.$strip>;
    next: z.ZodObject<{
        paused: z.ZodBoolean;
        reason: z.ZodString;
        version: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const ofapiCaptureAttemptParamsSchema: z.ZodObject<{
    attemptId: z.ZodString;
}, z.core.$strip>;
export declare const ofapiCaptureAttemptResolveBodySchema: z.ZodObject<{
    expectedState: z.ZodDefault<z.ZodLiteral<"indeterminate">>;
    resolution: z.ZodEnum<{
        confirmed_billed: "confirmed_billed";
        confirmed_not_billed: "confirmed_not_billed";
    }>;
    actualCredits: z.ZodOptional<z.ZodNumber>;
    reason: z.ZodString;
    dryRun: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>;
export declare const ofapiCaptureAttemptResolveResponseSchema: z.ZodObject<{
    dryRun: z.ZodBoolean;
    status: z.ZodEnum<{
        resolved: "resolved";
        would_resolve: "would_resolve";
    }>;
    attempt: z.ZodObject<{
        attemptId: z.ZodString;
        captureJobId: z.ZodNullable<z.ZodString>;
        pageId: z.ZodNumber;
        operation: z.ZodString;
        state: z.ZodEnum<{
            reserved: "reserved";
            released_pre_dispatch: "released_pre_dispatch";
            dispatching: "dispatching";
            response_captured: "response_captured";
            indeterminate: "indeterminate";
        }>;
        creditState: z.ZodEnum<{
            reserved: "reserved";
            indeterminate: "indeterminate";
            settled: "settled";
            released: "released";
        }>;
        reservedCredits: z.ZodNumber;
        settledCredits: z.ZodNullable<z.ZodNumber>;
        certaintyResolution: z.ZodNullable<z.ZodString>;
        dispatchStartedAt: z.ZodNullable<z.ZodString>;
        finishedAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const ofapiCaptureJobParamsSchema: z.ZodObject<{
    jobId: z.ZodString;
}, z.core.$strip>;
export declare const ofapiCaptureJobReplayBodySchema: z.ZodObject<{
    expectedState: z.ZodEnum<{
        blocked: "blocked";
        awaiting_parse: "awaiting_parse";
    }>;
    expectedReasonCode: z.ZodEnum<{
        parser_failed: "parser_failed";
        contract_rejected: "contract_rejected";
        capture_envelope_invalid: "capture_envelope_invalid";
        invalid_json: "invalid_json";
        export_contract_rejected: "export_contract_rejected";
    }>;
    expectedJobRowVersion: z.ZodNumber;
    reason: z.ZodString;
    dryRun: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>;
export declare const ofapiCaptureJobReplayResponseSchema: z.ZodObject<{
    dryRun: z.ZodBoolean;
    status: z.ZodEnum<{
        would_replay: "would_replay";
        replayed: "replayed";
    }>;
    jobId: z.ZodString;
    attemptId: z.ZodString;
    previous: z.ZodObject<{
        state: z.ZodEnum<{
            blocked: "blocked";
            awaiting_parse: "awaiting_parse";
        }>;
        reasonCode: z.ZodNullable<z.ZodString>;
        rowVersion: z.ZodNumber;
    }, z.core.$strip>;
    next: z.ZodObject<{
        state: z.ZodLiteral<"awaiting_parse">;
        reasonCode: z.ZodNull;
        rowVersion: z.ZodNumber;
        observationId: z.ZodNumber;
        observationReceivedAt: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const ofapiCoverageRevokeParamsSchema: z.ZodObject<{
    pageId: z.ZodNumber;
    chatId: z.ZodString;
}, z.core.$strip>;
export declare const ofapiCoverageRevokeBodySchema: z.ZodObject<{
    actionId: z.ZodString;
    expectedSourceAccountSeq: z.ZodNumber;
    reason: z.ZodString;
    dryRun: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>;
export declare const ofapiCoverageRevokeResponseSchema: z.ZodObject<{
    dryRun: z.ZodBoolean;
    status: z.ZodEnum<{
        would_revoke: "would_revoke";
        revoked: "revoked";
        already_reconciled: "already_reconciled";
    }>;
    pageId: z.ZodNumber;
    chatId: z.ZodString;
    sourceAccountSeq: z.ZodNumber;
    revokedAt: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const ofapiExportCreateReconcileBodySchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    action: z.ZodLiteral<"confirm_not_created">;
    attemptId: z.ZodString;
    expectedState: z.ZodDefault<z.ZodLiteral<"blocked">>;
    expectedReasonCode: z.ZodDefault<z.ZodLiteral<"indeterminate">>;
    expectedJobRowVersion: z.ZodNumber;
    reason: z.ZodString;
    dryRun: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"adopt_created">;
    attemptId: z.ZodString;
    expectedState: z.ZodDefault<z.ZodLiteral<"blocked">>;
    expectedReasonCode: z.ZodDefault<z.ZodLiteral<"indeterminate">>;
    expectedJobRowVersion: z.ZodNumber;
    vendorExportId: z.ZodString;
    actualCredits: z.ZodOptional<z.ZodNumber>;
    reason: z.ZodString;
    dryRun: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>], "action">;
export declare const ofapiExportCreateReconcileResponseSchema: z.ZodObject<{
    dryRun: z.ZodBoolean;
    status: z.ZodEnum<{
        would_reconcile: "would_reconcile";
        reconciled: "reconciled";
    }>;
    action: z.ZodEnum<{
        confirm_not_created: "confirm_not_created";
        adopt_created: "adopt_created";
    }>;
    job: z.ZodObject<{
        jobId: z.ZodString;
        state: z.ZodEnum<{
            complete: "complete";
            blocked: "blocked";
            ready: "ready";
            leased: "leased";
            awaiting_parse: "awaiting_parse";
            retry_wait: "retry_wait";
            cancelled: "cancelled";
        }>;
        reasonCode: z.ZodNullable<z.ZodString>;
        rowVersion: z.ZodNumber;
    }, z.core.$strip>;
    attempt: z.ZodObject<{
        attemptId: z.ZodString;
        captureJobId: z.ZodNullable<z.ZodString>;
        pageId: z.ZodNumber;
        operation: z.ZodString;
        state: z.ZodEnum<{
            reserved: "reserved";
            released_pre_dispatch: "released_pre_dispatch";
            dispatching: "dispatching";
            response_captured: "response_captured";
            indeterminate: "indeterminate";
        }>;
        creditState: z.ZodEnum<{
            reserved: "reserved";
            indeterminate: "indeterminate";
            settled: "settled";
            released: "released";
        }>;
        reservedCredits: z.ZodNumber;
        settledCredits: z.ZodNullable<z.ZodNumber>;
        certaintyResolution: z.ZodNullable<z.ZodString>;
        dispatchStartedAt: z.ZodNullable<z.ZodString>;
        finishedAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const ofapiWebhookRegisterResponseSchema: z.ZodObject<{
    externalWebhookId: z.ZodNullable<z.ZodString>;
    endpointUrl: z.ZodString;
    accountScope: z.ZodLiteral<"global">;
    events: z.ZodArray<z.ZodString>;
    signingSecretMask: z.ZodString;
    mapping: z.ZodObject<{
        mapped: z.ZodArray<z.ZodObject<{
            pageId: z.ZodNumber;
            label: z.ZodString;
            ofapiAccountId: z.ZodString;
        }, z.core.$strip>>;
        unmatchedAccounts: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            username: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
        unmappedPages: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const ofapiCreditLedgerSourceEnum: z.ZodEnum<{
    adjustment: "adjustment";
    rest: "rest";
    webhook_accrual: "webhook_accrual";
    external: "external";
    refill: "refill";
}>;
export declare const ofapiCreditsSummaryResponseSchema: z.ZodObject<{
    enabled: z.ZodBoolean;
    balance: z.ZodObject<{
        value: z.ZodNullable<z.ZodNumber>;
        observedAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    today: z.ZodObject<{
        day: z.ZodString;
        total: z.ZodNumber;
        bySource: z.ZodObject<{
            rest: z.ZodNumber;
            webhookAccrual: z.ZodNumber;
            external: z.ZodNumber;
            adjustment: z.ZodNumber;
        }, z.core.$strip>;
    }, z.core.$strip>;
    budgets: z.ZodArray<z.ZodObject<{
        stream: z.ZodString;
        spentToday: z.ZodNumber;
        dailyCeiling: z.ZodNumber;
        state: z.ZodEnum<{
            ok: "ok";
            budget_exhausted: "budget_exhausted";
            floor_blocked: "floor_blocked";
        }>;
        retryAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    floor: z.ZodObject<{
        value: z.ZodNumber;
        blocked: z.ZodBoolean;
    }, z.core.$strip>;
    forecast: z.ZodObject<{
        avgDailySpend7d: z.ZodNumber;
        daysLeft: z.ZodNullable<z.ZodNumber>;
        runOutDate: z.ZodNullable<z.ZodString>;
        monthToDateSpend: z.ZodOptional<z.ZodNumber>;
        monthEndProjection: z.ZodOptional<z.ZodNumber>;
        refillRecommendation: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            targetDays: z.ZodNumber;
            credits: z.ZodNumber;
        }, z.core.$strip>>>;
    }, z.core.$strip>;
    incidents: z.ZodArray<z.ZodObject<{
        kind: z.ZodString;
        openedAt: z.ZodString;
        errorSummary: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    reconciliation: z.ZodObject<{
        lastRunAt: z.ZodNullable<z.ZodString>;
        lastDriftCredits: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>;
    accrual: z.ZodObject<{
        lastPostedDay: z.ZodNullable<z.ZodString>;
        pendingToday: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            day: z.ZodString;
            eventCount: z.ZodNumber;
            estimatedCredits: z.ZodNumber;
        }, z.core.$strip>>>;
    }, z.core.$strip>;
    recentBurn: z.ZodOptional<z.ZodObject<{
        windowMinutes: z.ZodNumber;
        total: z.ZodNumber;
        threshold: z.ZodNumber;
        alerting: z.ZodBoolean;
        topOperations: z.ZodArray<z.ZodObject<{
            operation: z.ZodNullable<z.ZodString>;
            requests: z.ZodNumber;
            credits: z.ZodNumber;
        }, z.core.$strip>>;
        topPages: z.ZodArray<z.ZodObject<{
            pageId: z.ZodNumber;
            pageLabel: z.ZodString;
            credits: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    pricing: z.ZodOptional<z.ZodObject<{
        microUsdPerCredit: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const ofapiCreditsChatterSummaryResponseSchema: z.ZodObject<{
    enabled: z.ZodBoolean;
    scope: z.ZodObject<{
        pageIds: z.ZodArray<z.ZodNumber>;
        pageCount: z.ZodNumber;
    }, z.core.$strip>;
    today: z.ZodObject<{
        day: z.ZodString;
        from: z.ZodString;
        to: z.ZodString;
        restCredits: z.ZodNumber;
        webhook: z.ZodObject<{
            eventCount: z.ZodNumber;
            estimatedCredits: z.ZodNumber;
        }, z.core.$strip>;
        totalEstimatedCredits: z.ZodNumber;
    }, z.core.$strip>;
    last7d: z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
        restCredits: z.ZodNumber;
        webhook: z.ZodObject<{
            eventCount: z.ZodNumber;
            estimatedCredits: z.ZodNumber;
        }, z.core.$strip>;
        totalEstimatedCredits: z.ZodNumber;
    }, z.core.$strip>;
    limitations: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export declare const ofapiCommandStateSchema: z.ZodEnum<{
    cancelled: "cancelled";
    indeterminate: "indeterminate";
    queued: "queued";
    in_flight: "in_flight";
    confirmed: "confirmed";
    failed_retryable: "failed_retryable";
    failed_terminal: "failed_terminal";
}>;
export declare const ofapiCommandKindSchema: z.ZodEnum<{
    send_text_message_v1: "send_text_message_v1";
    send_media_message_v1: "send_media_message_v1";
    typing_active_v1: "typing_active_v1";
    unsend_message_v1: "unsend_message_v1";
    mark_chat_read_v1: "mark_chat_read_v1";
}>;
export declare const createOfapiCommandBodySchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"send_text_message_v1">;
    payload: z.ZodObject<{
        text: z.ZodString;
    }, z.core.$strict>;
    retryOfCommandId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    clientCommandId: z.ZodString;
    accountId: z.ZodString;
    conversationId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"send_media_message_v1">;
    payload: z.ZodObject<{
        text: z.ZodString;
        price: z.ZodNumber;
        mediaFiles: z.ZodArray<z.ZodString>;
        previews: z.ZodArray<z.ZodString>;
    }, z.core.$strict>;
    retryOfCommandId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    clientCommandId: z.ZodString;
    accountId: z.ZodString;
    conversationId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"typing_active_v1">;
    payload: z.ZodObject<{}, z.core.$strict>;
    retryOfCommandId: z.ZodOptional<z.ZodNull>;
    clientCommandId: z.ZodString;
    accountId: z.ZodString;
    conversationId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"unsend_message_v1">;
    payload: z.ZodObject<{
        messageId: z.ZodString;
    }, z.core.$strict>;
    retryOfCommandId: z.ZodOptional<z.ZodNull>;
    clientCommandId: z.ZodString;
    accountId: z.ZodString;
    conversationId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"mark_chat_read_v1">;
    payload: z.ZodObject<{}, z.core.$strict>;
    retryOfCommandId: z.ZodOptional<z.ZodNull>;
    clientCommandId: z.ZodString;
    accountId: z.ZodString;
    conversationId: z.ZodString;
}, z.core.$strict>], "kind">;
export declare const ofapiCommandParamsSchema: z.ZodObject<{
    commandId: z.ZodString;
}, z.core.$strip>;
export declare const ofapiCommandResponseSchema: z.ZodObject<{
    commandId: z.ZodString;
    clientCommandId: z.ZodString;
    kind: z.ZodEnum<{
        send_text_message_v1: "send_text_message_v1";
        send_media_message_v1: "send_media_message_v1";
        typing_active_v1: "typing_active_v1";
        unsend_message_v1: "unsend_message_v1";
        mark_chat_read_v1: "mark_chat_read_v1";
    }>;
    accountId: z.ZodString;
    conversationId: z.ZodString;
    state: z.ZodEnum<{
        cancelled: "cancelled";
        indeterminate: "indeterminate";
        queued: "queued";
        in_flight: "in_flight";
        confirmed: "confirmed";
        failed_retryable: "failed_retryable";
        failed_terminal: "failed_terminal";
    }>;
    payloadHash: z.ZodString;
    retryOfCommandId: z.ZodNullable<z.ZodString>;
    attemptCount: z.ZodNumber;
    lastErrorCode: z.ZodNullable<z.ZodString>;
    lastErrorClass: z.ZodNullable<z.ZodString>;
    verifierResult: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    platformMessageId: z.ZodNullable<z.ZodString>;
    attemptStartedAt: z.ZodNullable<z.ZodString>;
    attemptFinishedAt: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    deduplicated: z.ZodBoolean;
}, z.core.$strip>;
export declare const adminOfapiCreditsDailyQuerySchema: z.ZodObject<{
    days: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export declare const ofapiCreditsDailyResponseSchema: z.ZodObject<{
    days: z.ZodArray<z.ZodObject<{
        day: z.ZodString;
        total: z.ZodNumber;
        bySource: z.ZodObject<{
            rest: z.ZodNumber;
            webhookAccrual: z.ZodNumber;
            external: z.ZodNumber;
            adjustment: z.ZodNumber;
        }, z.core.$strip>;
    }, z.core.$strip>>;
    balance: z.ZodArray<z.ZodObject<{
        at: z.ZodString;
        value: z.ZodNumber;
    }, z.core.$strip>>;
    refills: z.ZodArray<z.ZodObject<{
        at: z.ZodString;
        credits: z.ZodNumber;
    }, z.core.$strip>>;
    byOperation: z.ZodArray<z.ZodObject<{
        operation: z.ZodNullable<z.ZodString>;
        requests: z.ZodNumber;
        credits: z.ZodNumber;
    }, z.core.$strip>>;
    byPage: z.ZodArray<z.ZodObject<{
        pageId: z.ZodNumber;
        pageLabel: z.ZodString;
        credits: z.ZodNumber;
        revenueMills: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const adminOfapiCreditsLedgerQuerySchema: z.ZodObject<{
    offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    source: z.ZodOptional<z.ZodEnum<{
        adjustment: "adjustment";
        rest: "rest";
        webhook_accrual: "webhook_accrual";
        external: "external";
        refill: "refill";
    }>>;
    pageId: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    operation: z.ZodOptional<z.ZodString>;
    from: z.ZodOptional<z.ZodString>;
    to: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const adminOfapiCreditsLedgerCsvQuerySchema: z.ZodObject<{
    source: z.ZodOptional<z.ZodEnum<{
        adjustment: "adjustment";
        rest: "rest";
        webhook_accrual: "webhook_accrual";
        external: "external";
        refill: "refill";
    }>>;
    pageId: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    operation: z.ZodOptional<z.ZodString>;
    from: z.ZodOptional<z.ZodString>;
    to: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const ofapiCreditsLedgerResponseSchema: z.ZodObject<{
    total: z.ZodNumber;
    pageOptions: z.ZodArray<z.ZodObject<{
        pageId: z.ZodNumber;
        pageLabel: z.ZodString;
    }, z.core.$strip>>;
    rows: z.ZodArray<z.ZodObject<{
        id: z.ZodNumber;
        occurredAt: z.ZodString;
        source: z.ZodEnum<{
            adjustment: "adjustment";
            rest: "rest";
            webhook_accrual: "webhook_accrual";
            external: "external";
            refill: "refill";
        }>;
        operation: z.ZodNullable<z.ZodString>;
        pageId: z.ZodNullable<z.ZodNumber>;
        pageLabel: z.ZodNullable<z.ZodString>;
        httpStatus: z.ZodNullable<z.ZodNumber>;
        credits: z.ZodNumber;
        estimated: z.ZodBoolean;
        balanceAfter: z.ZodNullable<z.ZodNumber>;
        requestId: z.ZodNullable<z.ZodString>;
        accrualDay: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const adminOfapiSpendComparisonQuerySchema: z.ZodObject<{
    days: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    sampleLimit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export declare const ofapiSpendComparisonResponseSchema: z.ZodObject<{
    generatedAt: z.ZodString;
    window: z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
        days: z.ZodNumber;
    }, z.core.$strip>;
    summary: z.ZodArray<z.ZodObject<{
        status: z.ZodEnum<{
            other: "other";
            blocked: "blocked";
            skipped: "skipped";
            matched: "matched";
            missing_in_core_truth: "missing_in_core_truth";
            page_mismatch: "page_mismatch";
            amount_mismatch: "amount_mismatch";
            fan_mismatch: "fan_mismatch";
            state_mismatch: "state_mismatch";
            ppv_estimated: "ppv_estimated";
            tips_blocked: "tips_blocked";
            tips_signal: "tips_signal";
        }>;
        count: z.ZodNumber;
        grossAmountMills: z.ZodNumber;
        creatorNetAmountMills: z.ZodNumber;
        coreGrossAmountMills: z.ZodNumber;
        coreCreatorNetAmountMills: z.ZodNumber;
    }, z.core.$strip>>;
    byPage: z.ZodArray<z.ZodObject<{
        status: z.ZodEnum<{
            other: "other";
            blocked: "blocked";
            skipped: "skipped";
            matched: "matched";
            missing_in_core_truth: "missing_in_core_truth";
            page_mismatch: "page_mismatch";
            amount_mismatch: "amount_mismatch";
            fan_mismatch: "fan_mismatch";
            state_mismatch: "state_mismatch";
            ppv_estimated: "ppv_estimated";
            tips_blocked: "tips_blocked";
            tips_signal: "tips_signal";
        }>;
        count: z.ZodNumber;
        grossAmountMills: z.ZodNumber;
        creatorNetAmountMills: z.ZodNumber;
        coreGrossAmountMills: z.ZodNumber;
        coreCreatorNetAmountMills: z.ZodNumber;
        pageId: z.ZodNumber;
        pageLabel: z.ZodString;
    }, z.core.$strip>>;
    samples: z.ZodArray<z.ZodObject<{
        projectionId: z.ZodNumber;
        comparisonStatus: z.ZodEnum<{
            other: "other";
            blocked: "blocked";
            skipped: "skipped";
            matched: "matched";
            missing_in_core_truth: "missing_in_core_truth";
            page_mismatch: "page_mismatch";
            amount_mismatch: "amount_mismatch";
            fan_mismatch: "fan_mismatch";
            state_mismatch: "state_mismatch";
            ppv_estimated: "ppv_estimated";
            tips_blocked: "tips_blocked";
            tips_signal: "tips_signal";
        }>;
        sourceEventType: z.ZodString;
        projectionStatus: z.ZodString;
        eventStatus: z.ZodNullable<z.ZodString>;
        blockedReason: z.ZodNullable<z.ZodString>;
        journalId: z.ZodNumber;
        pageId: z.ZodNumber;
        pageLabel: z.ZodString;
        fanPlatformUserId: z.ZodNullable<z.ZodString>;
        transactionId: z.ZodNullable<z.ZodString>;
        messageId: z.ZodNullable<z.ZodString>;
        occurredAt: z.ZodString;
        grossAmountMills: z.ZodNullable<z.ZodNumber>;
        creatorNetAmountMills: z.ZodNullable<z.ZodNumber>;
        coreTransactionPk: z.ZodNullable<z.ZodNumber>;
        corePageId: z.ZodNullable<z.ZodNumber>;
        coreFanPlatformUserId: z.ZodNullable<z.ZodString>;
        coreTransactionState: z.ZodNullable<z.ZodString>;
        coreOccurredAt: z.ZodNullable<z.ZodString>;
        coreGrossAmountMills: z.ZodNullable<z.ZodNumber>;
        coreCreatorNetAmountMills: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>;
    limitations: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export declare const ofapiDmColdArchiveStatusResponseSchema: z.ZodObject<{
    enabled: z.ZodBoolean;
    retentionDays: z.ZodNumber;
    rowCount: z.ZodNumber;
    tombstoneCount: z.ZodNumber;
    lastArchivedAt: z.ZodNullable<z.ZodString>;
    lastSourceReceivedAt: z.ZodNullable<z.ZodString>;
    nextPurgeAt: z.ZodNullable<z.ZodString>;
    archiveLagMs: z.ZodNullable<z.ZodNumber>;
    acl: z.ZodLiteral<"owner_admin_endpoint_only">;
    audit: z.ZodLiteral<"source_journal_metadata_on_each_row">;
    purgePolicy: z.ZodLiteral<"daily_retention_purge_by_retain_until">;
    exportPolicy: z.ZodLiteral<"no_raw_transcript_export_endpoint_yet">;
    mediaPolicy: z.ZodLiteral<"stable_metadata_only_no_signed_urls">;
}, z.core.$strip>;
export declare const routeAuthPolicySchema: z.ZodObject<{
    kind: z.ZodEnum<{
        any: "any";
        session: "session";
        public: "public";
        hmac: "hmac";
        monitoring: "monitoring";
        "any-session": "any-session";
        "owner-session": "owner-session";
        apiKey: "apiKey";
        "device-token": "device-token";
        "pending-device-token": "pending-device-token";
    }>;
    roles: z.ZodOptional<z.ZodArray<z.ZodEnum<{
        owner: "owner";
        team_lead: "team_lead";
        chatter: "chatter";
        content_manager: "content_manager";
    }>>>;
    scope: z.ZodOptional<z.ZodEnum<{
        page: "page";
        none: "none";
    }>>;
}, z.core.$strict>;
export type RouteAuthPolicy = z.infer<typeof routeAuthPolicySchema>;
export declare function routeSecurityFromAuth(auth: RouteAuthPolicy): Array<Record<string, string[]>> | undefined;
export declare const configRunningValueSchema: z.ZodObject<{
    role: z.ZodString;
    instanceId: z.ZodString;
    value: z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
    masked: z.ZodBoolean;
    state: z.ZodNullable<z.ZodEnum<{
        unknown: "unknown";
        set: "set";
        unset: "unset";
    }>>;
    lastSeenAt: z.ZodString;
}, z.core.$strip>;
export declare const configSkippedOverrideSchema: z.ZodObject<{
    key: z.ZodString;
    reason: z.ZodString;
}, z.core.$strip>;
export declare const configItemSchema: z.ZodObject<{
    key: z.ZodString;
    envName: z.ZodString;
    configField: z.ZodNullable<z.ZodString>;
    kind: z.ZodEnum<{
        string: "string";
        number: "number";
        boolean: "boolean";
        alias: "alias";
        url: "url";
        secret: "secret";
        derived: "derived";
        complex: "complex";
    }>;
    subsystem: z.ZodString;
    label: z.ZodString;
    default: z.ZodString;
    editability: z.ZodEnum<{
        never: "never";
        staged: "staged";
        editable: "editable";
    }>;
    runtimeApply: z.ZodEnum<{
        none: "none";
        live: "live";
        boot: "boot";
    }>;
    comparable: z.ZodBoolean;
    secret: z.ZodBoolean;
    note: z.ZodNullable<z.ZodString>;
    costWarning: z.ZodNullable<z.ZodString>;
    destructive: z.ZodBoolean;
    stagedGroup: z.ZodNullable<z.ZodString>;
    stagedOrder: z.ZodNullable<z.ZodNumber>;
    requires: z.ZodArray<z.ZodString>;
    source: z.ZodEnum<{
        override: "override";
        env: "env";
    }>;
    desired: z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
    runningState: z.ZodEnum<{
        unknown: "unknown";
        off: "off";
        on: "on";
    }>;
    desiredEffective: z.ZodNullable<z.ZodBoolean>;
    overrideVersion: z.ZodNullable<z.ZodNumber>;
    pendingApply: z.ZodBoolean;
    drift: z.ZodBoolean;
    live: z.ZodBoolean;
    running: z.ZodArray<z.ZodObject<{
        role: z.ZodString;
        instanceId: z.ZodString;
        value: z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
        masked: z.ZodBoolean;
        state: z.ZodNullable<z.ZodEnum<{
            unknown: "unknown";
            set: "set";
            unset: "unset";
        }>>;
        lastSeenAt: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const configInstanceSchema: z.ZodObject<{
    role: z.ZodString;
    instanceId: z.ZodString;
    startedAt: z.ZodString;
    lastSeenAt: z.ZodString;
    imageTag: z.ZodNullable<z.ZodString>;
    status: z.ZodEnum<{
        active: "active";
        stale: "stale";
    }>;
    skippedOverrides: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        reason: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const configRoleStatusSchema: z.ZodObject<{
    role: z.ZodString;
    status: z.ZodEnum<{
        active: "active";
        stale: "stale";
        missing: "missing";
    }>;
}, z.core.$strip>;
export declare const configViewResponseSchema: z.ZodObject<{
    generatedAt: z.ZodString;
    roleStatuses: z.ZodArray<z.ZodObject<{
        role: z.ZodString;
        status: z.ZodEnum<{
            active: "active";
            stale: "stale";
            missing: "missing";
        }>;
    }, z.core.$strip>>;
    instances: z.ZodArray<z.ZodObject<{
        role: z.ZodString;
        instanceId: z.ZodString;
        startedAt: z.ZodString;
        lastSeenAt: z.ZodString;
        imageTag: z.ZodNullable<z.ZodString>;
        status: z.ZodEnum<{
            active: "active";
            stale: "stale";
        }>;
        skippedOverrides: z.ZodArray<z.ZodObject<{
            key: z.ZodString;
            reason: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    subsystems: z.ZodArray<z.ZodObject<{
        subsystem: z.ZodString;
        items: z.ZodArray<z.ZodObject<{
            key: z.ZodString;
            envName: z.ZodString;
            configField: z.ZodNullable<z.ZodString>;
            kind: z.ZodEnum<{
                string: "string";
                number: "number";
                boolean: "boolean";
                alias: "alias";
                url: "url";
                secret: "secret";
                derived: "derived";
                complex: "complex";
            }>;
            subsystem: z.ZodString;
            label: z.ZodString;
            default: z.ZodString;
            editability: z.ZodEnum<{
                never: "never";
                staged: "staged";
                editable: "editable";
            }>;
            runtimeApply: z.ZodEnum<{
                none: "none";
                live: "live";
                boot: "boot";
            }>;
            comparable: z.ZodBoolean;
            secret: z.ZodBoolean;
            note: z.ZodNullable<z.ZodString>;
            costWarning: z.ZodNullable<z.ZodString>;
            destructive: z.ZodBoolean;
            stagedGroup: z.ZodNullable<z.ZodString>;
            stagedOrder: z.ZodNullable<z.ZodNumber>;
            requires: z.ZodArray<z.ZodString>;
            source: z.ZodEnum<{
                override: "override";
                env: "env";
            }>;
            desired: z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
            runningState: z.ZodEnum<{
                unknown: "unknown";
                off: "off";
                on: "on";
            }>;
            desiredEffective: z.ZodNullable<z.ZodBoolean>;
            overrideVersion: z.ZodNullable<z.ZodNumber>;
            pendingApply: z.ZodBoolean;
            drift: z.ZodBoolean;
            live: z.ZodBoolean;
            running: z.ZodArray<z.ZodObject<{
                role: z.ZodString;
                instanceId: z.ZodString;
                value: z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
                masked: z.ZodBoolean;
                state: z.ZodNullable<z.ZodEnum<{
                    unknown: "unknown";
                    set: "set";
                    unset: "unset";
                }>>;
                lastSeenAt: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const configUpdateBodySchema: z.ZodObject<{
    patches: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        value: z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>;
        expectedVersion: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    note: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const configUpdateResponseSchema: z.ZodObject<{
    results: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        value: z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>;
        version: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const configClearParamsSchema: z.ZodObject<{
    key: z.ZodString;
}, z.core.$strip>;
export declare const configClearQuerySchema: z.ZodObject<{
    expectedVersion: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    note: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const configClearResponseSchema: z.ZodObject<{
    ok: z.ZodLiteral<true>;
    key: z.ZodString;
}, z.core.$strip>;
export declare const configStagedBodySchema: z.ZodObject<{
    patches: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        desired: z.ZodNullable<z.ZodBoolean>;
        expectedVersion: z.ZodNumber;
    }, z.core.$strip>>;
    note: z.ZodOptional<z.ZodString>;
    ack: z.ZodBoolean;
}, z.core.$strip>;
export declare const configStagedResponseSchema: z.ZodObject<{
    results: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        value: z.ZodNullable<z.ZodBoolean>;
        version: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const opsMetricsResponseSchema: z.ZodObject<{
    samples: z.ZodArray<z.ZodObject<{
        metric: z.ZodString;
        quantile: z.ZodString;
        valueMs: z.ZodNumber;
        sampledAt: z.ZodString;
    }, z.core.$strip>>;
    thresholdsMs: z.ZodRecord<z.ZodString, z.ZodNumber>;
    smoke: z.ZodNullable<z.ZodObject<{
        framesSeen: z.ZodNumber;
        gapCount: z.ZodNumber;
        duplicateCount: z.ZodNumber;
        updatedAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const routeSchemas: {
    readonly health: {
        readonly auth: {
            readonly kind: "public";
        };
        readonly tags: readonly ["system"];
        readonly summary: "Health check";
        readonly response: {
            readonly 200: z.ZodObject<{
                status: z.ZodEnum<{
                    degraded: "degraded";
                    ok: "ok";
                }>;
                timestamp: z.ZodString;
                contractHash: z.ZodString;
                capabilities: z.ZodArray<z.ZodLiteral<"desktop-lifecycle-v2">>;
                checks: z.ZodObject<{
                    api: z.ZodObject<{
                        status: z.ZodLiteral<"ok">;
                    }, z.core.$strip>;
                    database: z.ZodObject<{
                        status: z.ZodEnum<{
                            error: "error";
                            ok: "ok";
                        }>;
                        latencyMs: z.ZodNullable<z.ZodNumber>;
                        error: z.ZodNullable<z.ZodString>;
                    }, z.core.$strip>;
                }, z.core.$strip>;
            }, z.core.$strip>;
            readonly 503: z.ZodObject<{
                status: z.ZodEnum<{
                    degraded: "degraded";
                    ok: "ok";
                }>;
                timestamp: z.ZodString;
                contractHash: z.ZodString;
                capabilities: z.ZodArray<z.ZodLiteral<"desktop-lifecycle-v2">>;
                checks: z.ZodObject<{
                    api: z.ZodObject<{
                        status: z.ZodLiteral<"ok">;
                    }, z.core.$strip>;
                    database: z.ZodObject<{
                        status: z.ZodEnum<{
                            error: "error";
                            ok: "ok";
                        }>;
                        latencyMs: z.ZodNullable<z.ZodNumber>;
                        error: z.ZodNullable<z.ZodString>;
                    }, z.core.$strip>;
                }, z.core.$strip>;
            }, z.core.$strip>;
        };
    };
    readonly opsMetrics: {
        readonly auth: {
            readonly kind: "monitoring";
        };
        readonly tags: readonly ["system"];
        readonly summary: "Golden-signal lag samples (Stage 25 acceptance instrument)";
        readonly response: {
            readonly 200: z.ZodObject<{
                samples: z.ZodArray<z.ZodObject<{
                    metric: z.ZodString;
                    quantile: z.ZodString;
                    valueMs: z.ZodNumber;
                    sampledAt: z.ZodString;
                }, z.core.$strip>>;
                thresholdsMs: z.ZodRecord<z.ZodString, z.ZodNumber>;
                smoke: z.ZodNullable<z.ZodObject<{
                    framesSeen: z.ZodNumber;
                    gapCount: z.ZodNumber;
                    duplicateCount: z.ZodNumber;
                    updatedAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly healthSync: {
        readonly auth: {
            readonly kind: "monitoring";
        };
        readonly tags: readonly ["system"];
        readonly summary: "Detailed sync health";
        readonly response: {
            readonly 200: z.ZodObject<{
                status: z.ZodEnum<{
                    degraded: "degraded";
                    ok: "ok";
                }>;
                timestamp: z.ZodString;
                thresholds: z.ZodObject<{
                    lightMaxAgeMinutes: z.ZodNumber;
                    followerMaxAgeMinutes: z.ZodNumber;
                }, z.core.$strip>;
                overall: z.ZodObject<{
                    pageCount: z.ZodNumber;
                    unhealthyPageCount: z.ZodNumber;
                    runningStreams: z.ZodNumber;
                    failedStreams: z.ZodNumber;
                    stalledStreams: z.ZodNumber;
                    pendingStreams: z.ZodNumber;
                    recentFailedRuns: z.ZodNumber;
                    recent429s: z.ZodNumber;
                    recent5xxs: z.ZodNumber;
                }, z.core.$strip>;
                pages: z.ZodArray<z.ZodObject<{
                    pageId: z.ZodNumber;
                    pageLabel: z.ZodString;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    modelSlug: z.ZodString;
                    modelName: z.ZodString;
                    status: z.ZodEnum<{
                        degraded: "degraded";
                        ok: "ok";
                    }>;
                    connectionStatus: z.ZodEnum<{
                        error: "error";
                        active: "active";
                        stale: "stale";
                        expired: "expired";
                        never_synced: "never_synced";
                        unverified: "unverified";
                    }>;
                    lastLightSyncAt: z.ZodNullable<z.ZodString>;
                    lightAgeMinutes: z.ZodNullable<z.ZodNumber>;
                    lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
                    followerAgeMinutes: z.ZodNullable<z.ZodNumber>;
                    failedStreams: z.ZodNumber;
                    stalledStreams: z.ZodNumber;
                    pendingStreams: z.ZodNumber;
                    lastErrorSummary: z.ZodNullable<z.ZodString>;
                    issues: z.ZodArray<z.ZodString>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 503: z.ZodObject<{
                status: z.ZodEnum<{
                    degraded: "degraded";
                    ok: "ok";
                }>;
                timestamp: z.ZodString;
                thresholds: z.ZodObject<{
                    lightMaxAgeMinutes: z.ZodNumber;
                    followerMaxAgeMinutes: z.ZodNumber;
                }, z.core.$strip>;
                overall: z.ZodObject<{
                    pageCount: z.ZodNumber;
                    unhealthyPageCount: z.ZodNumber;
                    runningStreams: z.ZodNumber;
                    failedStreams: z.ZodNumber;
                    stalledStreams: z.ZodNumber;
                    pendingStreams: z.ZodNumber;
                    recentFailedRuns: z.ZodNumber;
                    recent429s: z.ZodNumber;
                    recent5xxs: z.ZodNumber;
                }, z.core.$strip>;
                pages: z.ZodArray<z.ZodObject<{
                    pageId: z.ZodNumber;
                    pageLabel: z.ZodString;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    modelSlug: z.ZodString;
                    modelName: z.ZodString;
                    status: z.ZodEnum<{
                        degraded: "degraded";
                        ok: "ok";
                    }>;
                    connectionStatus: z.ZodEnum<{
                        error: "error";
                        active: "active";
                        stale: "stale";
                        expired: "expired";
                        never_synced: "never_synced";
                        unverified: "unverified";
                    }>;
                    lastLightSyncAt: z.ZodNullable<z.ZodString>;
                    lightAgeMinutes: z.ZodNullable<z.ZodNumber>;
                    lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
                    followerAgeMinutes: z.ZodNullable<z.ZodNumber>;
                    failedStreams: z.ZodNumber;
                    stalledStreams: z.ZodNumber;
                    pendingStreams: z.ZodNumber;
                    lastErrorSummary: z.ZodNullable<z.ZodString>;
                    issues: z.ZodArray<z.ZodString>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
        };
    };
    readonly login: {
        readonly auth: {
            readonly kind: "public";
        };
        readonly tags: readonly ["auth"];
        readonly summary: "Log in with a dashboard account";
        readonly body: z.ZodObject<{
            username: z.ZodString;
            password: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                authMethod: z.ZodEnum<{
                    session: "session";
                    api_key: "api_key";
                    device_token: "device_token";
                }>;
                user: z.ZodObject<{
                    id: z.ZodNumber;
                    username: z.ZodString;
                    role: z.ZodEnum<{
                        owner: "owner";
                        team_lead: "team_lead";
                        chatter: "chatter";
                        content_manager: "content_manager";
                    }>;
                    mustChangePassword: z.ZodBoolean;
                    assignedPages: z.ZodArray<z.ZodObject<{
                        id: z.ZodNumber;
                        label: z.ZodString;
                        platform: z.ZodEnum<{
                            fansly: "fansly";
                            onlyfans: "onlyfans";
                        }>;
                        modelSlug: z.ZodString;
                        modelName: z.ZodString;
                    }, z.core.$strip>>;
                }, z.core.$strip>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 429: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly logout: {
        readonly auth: {
            readonly kind: "public";
        };
        readonly tags: readonly ["auth"];
        readonly summary: "Clear the current session cookie if one is present";
        readonly response: {
            readonly 200: z.ZodObject<{
                ok: z.ZodLiteral<true>;
            }, z.core.$strip>;
        };
    };
    readonly me: {
        readonly auth: {
            readonly kind: "any";
        };
        readonly tags: readonly ["auth"];
        readonly summary: "Get the current authenticated principal";
        readonly response: {
            readonly 200: z.ZodObject<{
                authMethod: z.ZodEnum<{
                    session: "session";
                    api_key: "api_key";
                    device_token: "device_token";
                }>;
                user: z.ZodObject<{
                    id: z.ZodNumber;
                    username: z.ZodString;
                    role: z.ZodEnum<{
                        owner: "owner";
                        team_lead: "team_lead";
                        chatter: "chatter";
                        content_manager: "content_manager";
                    }>;
                    mustChangePassword: z.ZodBoolean;
                    assignedPages: z.ZodArray<z.ZodObject<{
                        id: z.ZodNumber;
                        label: z.ZodString;
                        platform: z.ZodEnum<{
                            fansly: "fansly";
                            onlyfans: "onlyfans";
                        }>;
                        modelSlug: z.ZodString;
                        modelName: z.ZodString;
                    }, z.core.$strip>>;
                }, z.core.$strip>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly aiUsageBatch: {
        readonly auth: {
            readonly kind: "apiKey";
        };
        readonly tags: readonly ["usage"];
        readonly deprecated: true;
        readonly summary: "Ingest a batch of chatter AI usage events (deprecated: gateway ledger is authoritative)";
        readonly body: z.ZodObject<{
            events: z.ZodArray<z.ZodObject<{
                clientEventId: z.ZodString;
                feature: z.ZodEnum<{
                    "fast-reply": "fast-reply";
                    "improve-draft": "improve-draft";
                    "help-me": "help-me";
                    "fan-summary": "fan-summary";
                    "chat-review": "chat-review";
                    scan: "scan";
                    ping: "ping";
                    "hi-greeting": "hi-greeting";
                    "workboard-closing": "workboard-closing";
                }>;
                model: z.ZodString;
                inputTokens: z.ZodNumber;
                outputTokens: z.ZodNumber;
                cacheWriteTokens: z.ZodNumber;
                cacheReadTokens: z.ZodNumber;
                conversationId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                durationMs: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                isCacheHit: z.ZodBoolean;
                isRegeneration: z.ZodBoolean;
                completedAt: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                receivedCount: z.ZodNumber;
                insertedCount: z.ZodNumber;
                invalidCount: z.ZodNumber;
                dedupedCount: z.ZodNumber;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly ingestObservations: {
        readonly auth: {
            readonly kind: "apiKey";
        };
        readonly tags: readonly ["usage"];
        readonly summary: "Ingest a batch of desktop-captured observations (client-capture lane)";
        readonly body: z.ZodObject<{
            events: z.ZodArray<z.ZodObject<{
                clientEventId: z.ZodString;
                kind: z.ZodString;
                observedAt: z.ZodString;
                payload: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                pageLabel: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                accepted: z.ZodNumber;
                duplicates: z.ZodNumber;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly aiGatewayStream: {
        readonly auth: {
            readonly kind: "apiKey";
        };
        readonly tags: readonly ["usage"];
        readonly summary: "Stream a chatter AI generation through the core gateway";
        readonly description: string;
        readonly body: z.ZodObject<{
            clientRequestId: z.ZodString;
            feature: z.ZodEnum<{
                "fast-reply": "fast-reply";
                "improve-draft": "improve-draft";
                "help-me": "help-me";
                "fan-summary": "fan-summary";
                "chat-review": "chat-review";
                scan: "scan";
                ping: "ping";
                "hi-greeting": "hi-greeting";
                "workboard-closing": "workboard-closing";
            }>;
            pageLabel: z.ZodString;
            platform: z.ZodEnum<{
                fansly: "fansly";
                onlyfans: "onlyfans";
            }>;
            platformUserId: z.ZodString;
            conversationId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            model: z.ZodString;
            reasoningEffort: z.ZodEnum<{
                off: "off";
                high: "high";
                low: "low";
                medium: "medium";
                max: "max";
            }>;
            temperature: z.ZodOptional<z.ZodNumber>;
            maxTokens: z.ZodOptional<z.ZodNumber>;
            isRegeneration: z.ZodBoolean;
            prompt: z.ZodObject<{
                systemBlocks: z.ZodArray<z.ZodObject<{
                    text: z.ZodString;
                    cache: z.ZodEnum<{
                        none: "none";
                        "1h": "1h";
                        "5m": "5m";
                    }>;
                }, z.core.$strict>>;
                userBlocks: z.ZodArray<z.ZodObject<{
                    text: z.ZodString;
                    cache: z.ZodEnum<{
                        none: "none";
                        "1h": "1h";
                        "5m": "5m";
                    }>;
                }, z.core.$strict>>;
            }, z.core.$strict>;
        }, z.core.$strict>;
        readonly response: {
            readonly 200: z.ZodUnknown;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 429: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 503: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly ofapiWebhookReceive: {
        readonly auth: {
            readonly kind: "hmac";
        };
        readonly tags: readonly ["ofapi"];
        readonly summary: "Receive an OFAPI webhook delivery";
        readonly description: string;
        readonly response: {
            readonly 200: z.ZodObject<{
                received: z.ZodLiteral<true>;
                duplicate: z.ZodBoolean;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 503: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly eventsStream: {
        readonly auth: {
            readonly kind: "apiKey";
        };
        readonly tags: readonly ["events"];
        readonly summary: "SSE stream of sync events for the chatter's assigned pages";
        readonly description: string;
        readonly querystring: z.ZodObject<{
            lastEventId: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodString;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodLiteral<"sync_snapshot_required">;
                message: z.ZodString;
                statusCode: z.ZodLiteral<409>;
                version: z.ZodLiteral<1>;
                requestedSeq: z.ZodNumber;
                oldestAvailableSeq: z.ZodNullable<z.ZodNumber>;
                currentSeq: z.ZodNumber;
                snapshotPath: z.ZodLiteral<"/api/v1/events/snapshot">;
            }, z.core.$strip>;
        };
    };
    readonly eventsSnapshot: {
        readonly auth: {
            readonly kind: "apiKey";
        };
        readonly tags: readonly ["events"];
        readonly summary: "Current durable sync state for replay-gap recovery";
        readonly description: string;
        readonly querystring: z.ZodObject<{
            accountId: z.ZodString;
            afterSeq: z.ZodCoercedNumber<unknown>;
            snapshotCursor: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
            pageCursor: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            pageMode: z.ZodOptional<z.ZodLiteral<"bounded_v1">>;
            stateCursor: z.ZodOptional<z.ZodString>;
            messageLimit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                version: z.ZodLiteral<1>;
                requestedAfterSeq: z.ZodNumber;
                snapshotCursor: z.ZodNumber;
                stateAt: z.ZodString;
                resumeAllowed: z.ZodBoolean;
                page: z.ZodObject<{
                    pageId: z.ZodNumber;
                    label: z.ZodString;
                    accountId: z.ZodString;
                    username: z.ZodNullable<z.ZodString>;
                    authStatus: z.ZodNullable<z.ZodString>;
                    authenticated: z.ZodNullable<z.ZodBoolean>;
                    authChangedAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
                coverage: z.ZodObject<{
                    durableDomains: z.ZodArray<z.ZodEnum<{
                        chat_heads: "chat_heads";
                        hot_messages: "hot_messages";
                        message_tombstones: "message_tombstones";
                        account_auth: "account_auth";
                    }>>;
                    omittedDomains: z.ZodArray<z.ZodObject<{
                        domain: z.ZodString;
                        reason: z.ZodString;
                    }, z.core.$strip>>;
                    messageWindow: z.ZodLiteral<"hot_projection_plus_archive_delta">;
                }, z.core.$strip>;
                threads: z.ZodArray<z.ZodObject<{
                    chatId: z.ZodString;
                    fanName: z.ZodString;
                    unreadCount: z.ZodNumber;
                    hasUnreadTips: z.ZodBoolean;
                    lastMessageId: z.ZodNullable<z.ZodString>;
                    lastMessageAt: z.ZodNullable<z.ZodString>;
                    lastMessageIsSentByMe: z.ZodBoolean;
                    lastMessagePreview: z.ZodString;
                    visible: z.ZodBoolean;
                    sourceUpdatedAt: z.ZodString;
                    messages: z.ZodArray<z.ZodObject<{
                        chatId: z.ZodString;
                        messageId: z.ZodString;
                        message: z.ZodNullable<z.ZodObject<{
                            id: z.ZodString;
                            text: z.ZodString;
                            createdAt: z.ZodString;
                            isSentByMe: z.ZodBoolean;
                            price: z.ZodNumber;
                            isOpened: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
                            isNew: z.ZodOptional<z.ZodBoolean>;
                            isTip: z.ZodOptional<z.ZodBoolean>;
                            tipAmountUsd: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                            tipText: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                            mediaCount: z.ZodOptional<z.ZodNumber>;
                            media: z.ZodOptional<z.ZodArray<z.ZodObject<{
                                id: z.ZodString;
                                type: z.ZodEnum<{
                                    other: "other";
                                    photo: "photo";
                                    video: "video";
                                    audio: "audio";
                                    gif: "gif";
                                }>;
                                isReady: z.ZodBoolean;
                                locked: z.ZodBoolean;
                                durationSeconds: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                            }, z.core.$strip>>>;
                            replyTo: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                                messageId: z.ZodOptional<z.ZodString>;
                                sender: z.ZodOptional<z.ZodEnum<{
                                    model: "model";
                                    fan: "fan";
                                }>>;
                                textPreview: z.ZodString;
                            }, z.core.$strip>>>;
                        }, z.core.$strip>>;
                        deletedAt: z.ZodNullable<z.ZodString>;
                        sourceUpdatedAt: z.ZodString;
                        sourceFanoutSeq: z.ZodNullable<z.ZodNumber>;
                    }, z.core.$strip>>;
                }, z.core.$strip>>;
                unresolvedTombstones: z.ZodArray<z.ZodObject<{
                    messageId: z.ZodString;
                    deletedAt: z.ZodString;
                    sourceUpdatedAt: z.ZodString;
                    sourceFanoutSeq: z.ZodNumber;
                }, z.core.$strip>>;
                nextPageCursor: z.ZodNullable<z.ZodNumber>;
                nextStateCursor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodLiteral<"sync_snapshot_restart_required">;
                message: z.ZodString;
                statusCode: z.ZodLiteral<409>;
                replayFloor: z.ZodNumber;
                snapshotPath: z.ZodLiteral<"/api/v1/events/snapshot">;
            }, z.core.$strip>;
        };
    };
    readonly eventsV2Stream: {
        readonly auth: {
            readonly kind: "any";
        };
        readonly tags: readonly ["events"];
        readonly summary: "SSE stream of canonical domain events (v2) for granted accounts";
        readonly description: string;
        readonly querystring: z.ZodObject<{
            cursor: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodString;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodLiteral<"sync_snapshot_required">;
                message: z.ZodString;
                statusCode: z.ZodLiteral<409>;
                version: z.ZodLiteral<2>;
                accounts: z.ZodArray<z.ZodObject<{
                    accountId: z.ZodNumber;
                    requestedSeq: z.ZodNumber;
                    oldestAvailableSeq: z.ZodNullable<z.ZodNumber>;
                    currentSeq: z.ZodNumber;
                }, z.core.$strip>>;
                snapshotPath: z.ZodLiteral<"/api/v1/events/v2/snapshot">;
            }, z.core.$strip>;
        };
    };
    readonly eventsV2Snapshot: {
        readonly auth: {
            readonly kind: "any";
        };
        readonly tags: readonly ["events"];
        readonly summary: "Fresh v2 cursor (and per-account heads) for cold start or gap recovery";
        readonly description: string;
        readonly querystring: z.ZodObject<{
            accounts: z.ZodOptional<z.ZodString>;
            sourceCursor: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                cursor: z.ZodString;
                accounts: z.ZodArray<z.ZodObject<{
                    accountId: z.ZodNumber;
                    accountRef: z.ZodNullable<z.ZodString>;
                    currentSeq: z.ZodNumber;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminOfapiWebhookStatus: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Current OFAPI webhook registration and page mappings";
        readonly response: {
            readonly 200: z.ZodObject<{
                configured: z.ZodBoolean;
                registrationState: z.ZodNullable<z.ZodEnum<{
                    stable: "stable";
                    create_prepared: "create_prepared";
                    create_dispatching: "create_dispatching";
                    create_indeterminate: "create_indeterminate";
                    create_failed: "create_failed";
                    update_prepared: "update_prepared";
                    update_dispatching: "update_dispatching";
                    update_indeterminate: "update_indeterminate";
                }>>;
                registrationError: z.ZodNullable<z.ZodString>;
                pendingRegistration: z.ZodNullable<z.ZodObject<{
                    operationId: z.ZodString;
                    operation: z.ZodEnum<{
                        create: "create";
                        update: "update";
                    }>;
                    externalWebhookId: z.ZodNullable<z.ZodString>;
                    endpointUrl: z.ZodString;
                    accountScope: z.ZodLiteral<"global">;
                    events: z.ZodArray<z.ZodString>;
                    preparedAt: z.ZodString;
                }, z.core.$strip>>;
                endpointUrl: z.ZodNullable<z.ZodString>;
                externalWebhookId: z.ZodNullable<z.ZodString>;
                accountScope: z.ZodNullable<z.ZodString>;
                events: z.ZodArray<z.ZodString>;
                signingSecretMask: z.ZodNullable<z.ZodString>;
                updatedAt: z.ZodNullable<z.ZodString>;
                pages: z.ZodArray<z.ZodObject<{
                    pageId: z.ZodNumber;
                    label: z.ZodString;
                    username: z.ZodNullable<z.ZodString>;
                    ofapiAccountId: z.ZodNullable<z.ZodString>;
                    ofapiAuthStatus: z.ZodNullable<z.ZodString>;
                    ofapiAuthChangedAt: z.ZodNullable<z.ZodString>;
                    lastEventAt: z.ZodNullable<z.ZodString>;
                    lastEventAgeSeconds: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strip>>;
                credit: z.ZodObject<{
                    lastBalance: z.ZodNullable<z.ZodNumber>;
                    lastBalanceAt: z.ZodNullable<z.ZodString>;
                    spentToday: z.ZodNumber;
                }, z.core.$strip>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminOfapiWebhookRegister: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Register (or re-register) the OFAPI webhook and auto-map accounts to pages";
        readonly description: string;
        readonly body: z.ZodObject<{
            endpointUrl: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                externalWebhookId: z.ZodNullable<z.ZodString>;
                endpointUrl: z.ZodString;
                accountScope: z.ZodLiteral<"global">;
                events: z.ZodArray<z.ZodString>;
                signingSecretMask: z.ZodString;
                mapping: z.ZodObject<{
                    mapped: z.ZodArray<z.ZodObject<{
                        pageId: z.ZodNumber;
                        label: z.ZodString;
                        ofapiAccountId: z.ZodString;
                    }, z.core.$strip>>;
                    unmatchedAccounts: z.ZodArray<z.ZodObject<{
                        id: z.ZodString;
                        username: z.ZodNullable<z.ZodString>;
                    }, z.core.$strip>>;
                    unmappedPages: z.ZodArray<z.ZodString>;
                }, z.core.$strip>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 503: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminOfapiWebhookReconcile: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Resolve an indeterminate initial OFAPI webhook creation";
        readonly description: string;
        readonly body: z.ZodDiscriminatedUnion<[z.ZodObject<{
            action: z.ZodLiteral<"adopt">;
            operationId: z.ZodString;
            externalWebhookId: z.ZodString;
        }, z.core.$strip>, z.ZodObject<{
            action: z.ZodLiteral<"confirm_not_created">;
            operationId: z.ZodString;
            reason: z.ZodString;
        }, z.core.$strip>], "action">;
        readonly response: {
            readonly 200: z.ZodObject<{
                configured: z.ZodBoolean;
                registrationState: z.ZodNullable<z.ZodEnum<{
                    stable: "stable";
                    create_prepared: "create_prepared";
                    create_dispatching: "create_dispatching";
                    create_indeterminate: "create_indeterminate";
                    create_failed: "create_failed";
                    update_prepared: "update_prepared";
                    update_dispatching: "update_dispatching";
                    update_indeterminate: "update_indeterminate";
                }>>;
                registrationError: z.ZodNullable<z.ZodString>;
                pendingRegistration: z.ZodNullable<z.ZodObject<{
                    operationId: z.ZodString;
                    operation: z.ZodEnum<{
                        create: "create";
                        update: "update";
                    }>;
                    externalWebhookId: z.ZodNullable<z.ZodString>;
                    endpointUrl: z.ZodString;
                    accountScope: z.ZodLiteral<"global">;
                    events: z.ZodArray<z.ZodString>;
                    preparedAt: z.ZodString;
                }, z.core.$strip>>;
                endpointUrl: z.ZodNullable<z.ZodString>;
                externalWebhookId: z.ZodNullable<z.ZodString>;
                accountScope: z.ZodNullable<z.ZodString>;
                events: z.ZodArray<z.ZodString>;
                signingSecretMask: z.ZodNullable<z.ZodString>;
                updatedAt: z.ZodNullable<z.ZodString>;
                pages: z.ZodArray<z.ZodObject<{
                    pageId: z.ZodNumber;
                    label: z.ZodString;
                    username: z.ZodNullable<z.ZodString>;
                    ofapiAccountId: z.ZodNullable<z.ZodString>;
                    ofapiAuthStatus: z.ZodNullable<z.ZodString>;
                    ofapiAuthChangedAt: z.ZodNullable<z.ZodString>;
                    lastEventAt: z.ZodNullable<z.ZodString>;
                    lastEventAgeSeconds: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strip>>;
                credit: z.ZodObject<{
                    lastBalance: z.ZodNullable<z.ZodNumber>;
                    lastBalanceAt: z.ZodNullable<z.ZodString>;
                    spentToday: z.ZodNumber;
                }, z.core.$strip>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminOfapiCaptureJobsSeed: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Dry-run or seed a bounded explicit OFAPI chat cohort";
        readonly description: string;
        readonly body: z.ZodObject<{
            dryRun: z.ZodDefault<z.ZodBoolean>;
            goal: z.ZodDefault<z.ZodEnum<{
                connect_to_anchor: "connect_to_anchor";
                history_to_exhaustion: "history_to_exhaustion";
            }>>;
            targets: z.ZodArray<z.ZodObject<{
                pageId: z.ZodNumber;
                chatId: z.ZodString;
                anchorMessageId: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                dryRun: z.ZodBoolean;
                seedId: z.ZodString;
                limits: z.ZodObject<{
                    maxTargets: z.ZodLiteral<20>;
                    maxPagesPerJob: z.ZodLiteral<3>;
                    maxCallsPerJob: z.ZodLiteral<3>;
                    maxCreditsPerJob: z.ZodLiteral<3>;
                    maxItemsPerJob: z.ZodLiteral<300>;
                }, z.core.$strip>;
                created: z.ZodNumber;
                coalesced: z.ZodNumber;
                skipped: z.ZodNumber;
                results: z.ZodArray<z.ZodObject<{
                    pageId: z.ZodNumber;
                    chatId: z.ZodString;
                    goal: z.ZodEnum<{
                        connect_to_anchor: "connect_to_anchor";
                        history_to_exhaustion: "history_to_exhaustion";
                    }>;
                    frozenHeadId: z.ZodString;
                    anchorMessageId: z.ZodNullable<z.ZodString>;
                    status: z.ZodEnum<{
                        created: "created";
                        coalesced: "coalesced";
                        would_create: "would_create";
                        would_coalesce: "would_coalesce";
                        already_covered: "already_covered";
                        already_captured: "already_captured";
                    }>;
                    jobId: z.ZodNullable<z.ZodString>;
                    state: z.ZodNullable<z.ZodEnum<{
                        complete: "complete";
                        blocked: "blocked";
                        ready: "ready";
                        leased: "leased";
                        awaiting_parse: "awaiting_parse";
                        retry_wait: "retry_wait";
                        cancelled: "cancelled";
                    }>>;
                    reasonCode: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminOfapiCaptureOperatorStatus: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Inspect bounded OFAPI capture controls and unresolved work";
        readonly description: string;
        readonly response: {
            readonly 200: z.ZodObject<{
                controls: z.ZodArray<z.ZodObject<{
                    controlKey: z.ZodString;
                    paused: z.ZodBoolean;
                    reason: z.ZodNullable<z.ZodString>;
                    version: z.ZodNumber;
                    updatedAt: z.ZodString;
                }, z.core.$strip>>;
                jobGroups: z.ZodArray<z.ZodObject<{
                    state: z.ZodEnum<{
                        complete: "complete";
                        blocked: "blocked";
                        ready: "ready";
                        leased: "leased";
                        awaiting_parse: "awaiting_parse";
                        retry_wait: "retry_wait";
                        cancelled: "cancelled";
                    }>;
                    reasonCode: z.ZodNullable<z.ZodString>;
                    count: z.ZodNumber;
                    oldestUpdatedAt: z.ZodString;
                }, z.core.$strip>>;
                jobSamples: z.ZodArray<z.ZodObject<{
                    jobId: z.ZodString;
                    pageId: z.ZodNumber;
                    kind: z.ZodEnum<{
                        chat_paginate: "chat_paginate";
                        campaign_snapshot: "campaign_snapshot";
                        head_repair: "head_repair";
                        account_export: "account_export";
                        export_import: "export_import";
                    }>;
                    state: z.ZodEnum<{
                        complete: "complete";
                        blocked: "blocked";
                        ready: "ready";
                        leased: "leased";
                        awaiting_parse: "awaiting_parse";
                        retry_wait: "retry_wait";
                        cancelled: "cancelled";
                    }>;
                    reasonCode: z.ZodNullable<z.ZodString>;
                    rowVersion: z.ZodNumber;
                    updatedAt: z.ZodString;
                }, z.core.$strip>>;
                indeterminate: z.ZodObject<{
                    count: z.ZodNumber;
                    oldestAt: z.ZodNullable<z.ZodString>;
                    samples: z.ZodArray<z.ZodObject<{
                        attemptId: z.ZodString;
                        captureJobId: z.ZodNullable<z.ZodString>;
                        pageId: z.ZodNumber;
                        operation: z.ZodString;
                        state: z.ZodEnum<{
                            reserved: "reserved";
                            released_pre_dispatch: "released_pre_dispatch";
                            dispatching: "dispatching";
                            response_captured: "response_captured";
                            indeterminate: "indeterminate";
                        }>;
                        creditState: z.ZodEnum<{
                            reserved: "reserved";
                            indeterminate: "indeterminate";
                            settled: "settled";
                            released: "released";
                        }>;
                        reservedCredits: z.ZodNumber;
                        settledCredits: z.ZodNullable<z.ZodNumber>;
                        certaintyResolution: z.ZodNullable<z.ZodString>;
                        dispatchStartedAt: z.ZodNullable<z.ZodString>;
                        finishedAt: z.ZodNullable<z.ZodString>;
                    }, z.core.$strip>>;
                }, z.core.$strip>;
                storageHealth: z.ZodNullable<z.ZodObject<{
                    healthy: z.ZodBoolean;
                    breached: z.ZodBoolean;
                    checkedAt: z.ZodString;
                    usedBytes: z.ZodNullable<z.ZodNumber>;
                    freeBytes: z.ZodNullable<z.ZodNumber>;
                    totalBytes: z.ZodNullable<z.ZodNumber>;
                    errorPresent: z.ZodBoolean;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminOfapiCaptureControl: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Dry-run or CAS-update one OFAPI capture pause control";
        readonly body: z.ZodObject<{
            controlKey: z.ZodString;
            paused: z.ZodBoolean;
            expectedVersion: z.ZodNumber;
            reason: z.ZodString;
            dryRun: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>;
        readonly response: {
            readonly 200: z.ZodObject<{
                executed: z.ZodBoolean;
                controlKey: z.ZodString;
                previous: z.ZodObject<{
                    paused: z.ZodBoolean;
                    reason: z.ZodNullable<z.ZodString>;
                    version: z.ZodNumber;
                }, z.core.$strip>;
                next: z.ZodObject<{
                    paused: z.ZodBoolean;
                    reason: z.ZodString;
                    version: z.ZodNumber;
                }, z.core.$strip>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminOfapiCaptureAttemptResolve: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Dry-run or resolve one indeterminate OFAPI request certainty";
        readonly description: string;
        readonly params: z.ZodObject<{
            attemptId: z.ZodString;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{
            expectedState: z.ZodDefault<z.ZodLiteral<"indeterminate">>;
            resolution: z.ZodEnum<{
                confirmed_billed: "confirmed_billed";
                confirmed_not_billed: "confirmed_not_billed";
            }>;
            actualCredits: z.ZodOptional<z.ZodNumber>;
            reason: z.ZodString;
            dryRun: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>;
        readonly response: {
            readonly 200: z.ZodObject<{
                dryRun: z.ZodBoolean;
                status: z.ZodEnum<{
                    resolved: "resolved";
                    would_resolve: "would_resolve";
                }>;
                attempt: z.ZodObject<{
                    attemptId: z.ZodString;
                    captureJobId: z.ZodNullable<z.ZodString>;
                    pageId: z.ZodNumber;
                    operation: z.ZodString;
                    state: z.ZodEnum<{
                        reserved: "reserved";
                        released_pre_dispatch: "released_pre_dispatch";
                        dispatching: "dispatching";
                        response_captured: "response_captured";
                        indeterminate: "indeterminate";
                    }>;
                    creditState: z.ZodEnum<{
                        reserved: "reserved";
                        indeterminate: "indeterminate";
                        settled: "settled";
                        released: "released";
                    }>;
                    reservedCredits: z.ZodNumber;
                    settledCredits: z.ZodNullable<z.ZodNumber>;
                    certaintyResolution: z.ZodNullable<z.ZodString>;
                    dispatchStartedAt: z.ZodNullable<z.ZodString>;
                    finishedAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminOfapiCaptureJobReplay: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Dry-run or locally replay one captured OFAPI response";
        readonly description: string;
        readonly params: z.ZodObject<{
            jobId: z.ZodString;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{
            expectedState: z.ZodEnum<{
                blocked: "blocked";
                awaiting_parse: "awaiting_parse";
            }>;
            expectedReasonCode: z.ZodEnum<{
                parser_failed: "parser_failed";
                contract_rejected: "contract_rejected";
                capture_envelope_invalid: "capture_envelope_invalid";
                invalid_json: "invalid_json";
                export_contract_rejected: "export_contract_rejected";
            }>;
            expectedJobRowVersion: z.ZodNumber;
            reason: z.ZodString;
            dryRun: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>;
        readonly response: {
            readonly 200: z.ZodObject<{
                dryRun: z.ZodBoolean;
                status: z.ZodEnum<{
                    would_replay: "would_replay";
                    replayed: "replayed";
                }>;
                jobId: z.ZodString;
                attemptId: z.ZodString;
                previous: z.ZodObject<{
                    state: z.ZodEnum<{
                        blocked: "blocked";
                        awaiting_parse: "awaiting_parse";
                    }>;
                    reasonCode: z.ZodNullable<z.ZodString>;
                    rowVersion: z.ZodNumber;
                }, z.core.$strip>;
                next: z.ZodObject<{
                    state: z.ZodLiteral<"awaiting_parse">;
                    reasonCode: z.ZodNull;
                    rowVersion: z.ZodNumber;
                    observationId: z.ZodNumber;
                    observationReceivedAt: z.ZodString;
                }, z.core.$strip>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminOfapiCoverageRevoke: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Dry-run or revoke one OFAPI history proof";
        readonly description: string;
        readonly params: z.ZodObject<{
            pageId: z.ZodNumber;
            chatId: z.ZodString;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{
            actionId: z.ZodString;
            expectedSourceAccountSeq: z.ZodNumber;
            reason: z.ZodString;
            dryRun: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>;
        readonly response: {
            readonly 200: z.ZodObject<{
                dryRun: z.ZodBoolean;
                status: z.ZodEnum<{
                    would_revoke: "would_revoke";
                    revoked: "revoked";
                    already_reconciled: "already_reconciled";
                }>;
                pageId: z.ZodNumber;
                chatId: z.ZodString;
                sourceAccountSeq: z.ZodNumber;
                revokedAt: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminOfapiExportCreateReconcile: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Reconcile one uncertain quote-only OFAPI export create";
        readonly description: string;
        readonly params: z.ZodObject<{
            jobId: z.ZodString;
        }, z.core.$strip>;
        readonly body: z.ZodDiscriminatedUnion<[z.ZodObject<{
            action: z.ZodLiteral<"confirm_not_created">;
            attemptId: z.ZodString;
            expectedState: z.ZodDefault<z.ZodLiteral<"blocked">>;
            expectedReasonCode: z.ZodDefault<z.ZodLiteral<"indeterminate">>;
            expectedJobRowVersion: z.ZodNumber;
            reason: z.ZodString;
            dryRun: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>, z.ZodObject<{
            action: z.ZodLiteral<"adopt_created">;
            attemptId: z.ZodString;
            expectedState: z.ZodDefault<z.ZodLiteral<"blocked">>;
            expectedReasonCode: z.ZodDefault<z.ZodLiteral<"indeterminate">>;
            expectedJobRowVersion: z.ZodNumber;
            vendorExportId: z.ZodString;
            actualCredits: z.ZodOptional<z.ZodNumber>;
            reason: z.ZodString;
            dryRun: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>], "action">;
        readonly response: {
            readonly 200: z.ZodObject<{
                dryRun: z.ZodBoolean;
                status: z.ZodEnum<{
                    would_reconcile: "would_reconcile";
                    reconciled: "reconciled";
                }>;
                action: z.ZodEnum<{
                    confirm_not_created: "confirm_not_created";
                    adopt_created: "adopt_created";
                }>;
                job: z.ZodObject<{
                    jobId: z.ZodString;
                    state: z.ZodEnum<{
                        complete: "complete";
                        blocked: "blocked";
                        ready: "ready";
                        leased: "leased";
                        awaiting_parse: "awaiting_parse";
                        retry_wait: "retry_wait";
                        cancelled: "cancelled";
                    }>;
                    reasonCode: z.ZodNullable<z.ZodString>;
                    rowVersion: z.ZodNumber;
                }, z.core.$strip>;
                attempt: z.ZodObject<{
                    attemptId: z.ZodString;
                    captureJobId: z.ZodNullable<z.ZodString>;
                    pageId: z.ZodNumber;
                    operation: z.ZodString;
                    state: z.ZodEnum<{
                        reserved: "reserved";
                        released_pre_dispatch: "released_pre_dispatch";
                        dispatching: "dispatching";
                        response_captured: "response_captured";
                        indeterminate: "indeterminate";
                    }>;
                    creditState: z.ZodEnum<{
                        reserved: "reserved";
                        indeterminate: "indeterminate";
                        settled: "settled";
                        released: "released";
                    }>;
                    reservedCredits: z.ZodNumber;
                    settledCredits: z.ZodNullable<z.ZodNumber>;
                    certaintyResolution: z.ZodNullable<z.ZodString>;
                    dispatchStartedAt: z.ZodNullable<z.ZodString>;
                    finishedAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminOfapiExportQuotesCreate: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Dry-run or create a bounded OFAPI chat-export quote";
        readonly description: string;
        readonly body: z.ZodDiscriminatedUnion<[z.ZodObject<{
            profile: z.ZodLiteral<"pilot_chats">;
            chatIds: z.ZodArray<z.ZodString>;
            dryRun: z.ZodDefault<z.ZodBoolean>;
            pageId: z.ZodNumber;
            startDate: z.ZodString;
            endDate: z.ZodString;
            maxMessages: z.ZodDefault<z.ZodNumber>;
            quoteTtlMinutes: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strict>, z.ZodObject<{
            profile: z.ZodLiteral<"fleet_tail">;
            dryRun: z.ZodDefault<z.ZodBoolean>;
            pageId: z.ZodNumber;
            startDate: z.ZodString;
            endDate: z.ZodString;
            maxMessages: z.ZodDefault<z.ZodNumber>;
            quoteTtlMinutes: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strict>], "profile">;
        readonly response: {
            readonly 200: z.ZodObject<{
                dryRun: z.ZodBoolean;
                status: z.ZodEnum<{
                    created: "created";
                    coalesced: "coalesced";
                    would_create: "would_create";
                    would_coalesce: "would_coalesce";
                }>;
                jobId: z.ZodNullable<z.ZodString>;
                pageId: z.ZodNumber;
                profile: z.ZodEnum<{
                    pilot_chats: "pilot_chats";
                    fleet_tail: "fleet_tail";
                }>;
                targetHash: z.ZodString;
                state: z.ZodNullable<z.ZodEnum<{
                    complete: "complete";
                    blocked: "blocked";
                    ready: "ready";
                    leased: "leased";
                    awaiting_parse: "awaiting_parse";
                    retry_wait: "retry_wait";
                    cancelled: "cancelled";
                }>>;
                reasonCode: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminOfapiExportQuoteStatus: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Inspect a durable OFAPI export quote without signed URLs";
        readonly params: z.ZodObject<{
            jobId: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                jobId: z.ZodString;
                pageId: z.ZodNumber;
                profile: z.ZodEnum<{
                    pilot_chats: "pilot_chats";
                    fleet_tail: "fleet_tail";
                }>;
                targetHash: z.ZodString;
                state: z.ZodEnum<{
                    complete: "complete";
                    blocked: "blocked";
                    ready: "ready";
                    leased: "leased";
                    awaiting_parse: "awaiting_parse";
                    retry_wait: "retry_wait";
                    cancelled: "cancelled";
                }>;
                reasonCode: z.ZodNullable<z.ZodString>;
                reasonMessage: z.ZodNullable<z.ZodString>;
                attemptCount: z.ZodNumber;
                dispatchCount: z.ZodNumber;
                spentCredits: z.ZodNumber;
                createdAt: z.ZodString;
                updatedAt: z.ZodString;
                quote: z.ZodNullable<z.ZodObject<{
                    vendorExportId: z.ZodString;
                    vendorStatus: z.ZodString;
                    totalRows: z.ZodNullable<z.ZodNumber>;
                    creditCost: z.ZodNullable<z.ZodNumber>;
                    pollCount: z.ZodNumber;
                    quotedAt: z.ZodNullable<z.ZodString>;
                    expiresAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminOfapiExportQuoteCancel: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Cancel a blocked quote-only OFAPI export intent";
        readonly description: string;
        readonly params: z.ZodObject<{
            jobId: z.ZodString;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{
            expectedState: z.ZodLiteral<"blocked">;
            reason: z.ZodString;
        }, z.core.$strict>;
        readonly response: {
            readonly 200: z.ZodObject<{
                jobId: z.ZodString;
                pageId: z.ZodNumber;
                profile: z.ZodEnum<{
                    pilot_chats: "pilot_chats";
                    fleet_tail: "fleet_tail";
                }>;
                targetHash: z.ZodString;
                state: z.ZodEnum<{
                    complete: "complete";
                    blocked: "blocked";
                    ready: "ready";
                    leased: "leased";
                    awaiting_parse: "awaiting_parse";
                    retry_wait: "retry_wait";
                    cancelled: "cancelled";
                }>;
                reasonCode: z.ZodNullable<z.ZodString>;
                reasonMessage: z.ZodNullable<z.ZodString>;
                attemptCount: z.ZodNumber;
                dispatchCount: z.ZodNumber;
                spentCredits: z.ZodNumber;
                createdAt: z.ZodString;
                updatedAt: z.ZodString;
                quote: z.ZodNullable<z.ZodObject<{
                    vendorExportId: z.ZodString;
                    vendorStatus: z.ZodString;
                    totalRows: z.ZodNullable<z.ZodNumber>;
                    creditCost: z.ZodNullable<z.ZodNumber>;
                    pollCount: z.ZodNumber;
                    quotedAt: z.ZodNullable<z.ZodString>;
                    expiresAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly ofapiCreditsChatterSummary: {
        readonly auth: {
            readonly kind: "apiKey";
        };
        readonly tags: readonly ["ofapi"];
        readonly summary: "Get page-scoped OFAPI credit spend visible to the authenticated chatter";
        readonly description: string;
        readonly response: {
            readonly 200: z.ZodObject<{
                enabled: z.ZodBoolean;
                scope: z.ZodObject<{
                    pageIds: z.ZodArray<z.ZodNumber>;
                    pageCount: z.ZodNumber;
                }, z.core.$strip>;
                today: z.ZodObject<{
                    day: z.ZodString;
                    from: z.ZodString;
                    to: z.ZodString;
                    restCredits: z.ZodNumber;
                    webhook: z.ZodObject<{
                        eventCount: z.ZodNumber;
                        estimatedCredits: z.ZodNumber;
                    }, z.core.$strip>;
                    totalEstimatedCredits: z.ZodNumber;
                }, z.core.$strip>;
                last7d: z.ZodObject<{
                    from: z.ZodString;
                    to: z.ZodString;
                    restCredits: z.ZodNumber;
                    webhook: z.ZodObject<{
                        eventCount: z.ZodNumber;
                        estimatedCredits: z.ZodNumber;
                    }, z.core.$strip>;
                    totalEstimatedCredits: z.ZodNumber;
                }, z.core.$strip>;
                limitations: z.ZodArray<z.ZodString>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly ofapiReadGateway: {
        readonly auth: {
            readonly kind: "apiKey";
        };
        readonly tags: readonly ["ofapi"];
        readonly summary: "Read an allowlisted OFAPI resource through the core custody boundary";
        readonly description: string;
        readonly params: z.ZodObject<{
            "*": z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodUnknown;
            readonly 400: z.ZodUnknown;
            readonly 401: z.ZodUnknown;
            readonly 402: z.ZodUnknown;
            readonly 403: z.ZodUnknown;
            readonly 404: z.ZodUnknown;
            readonly 429: z.ZodUnknown;
            readonly 422: z.ZodUnknown;
            readonly 500: z.ZodUnknown;
            readonly 502: z.ZodUnknown;
            readonly 503: z.ZodUnknown;
            readonly 504: z.ZodUnknown;
        };
    };
    readonly createOfapiCommand: {
        readonly auth: {
            readonly kind: "apiKey";
        };
        readonly tags: readonly ["ofapi"];
        readonly summary: "Create or deduplicate a desktop OFAPI command";
        readonly description: string;
        readonly body: z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"send_text_message_v1">;
            payload: z.ZodObject<{
                text: z.ZodString;
            }, z.core.$strict>;
            retryOfCommandId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            clientCommandId: z.ZodString;
            accountId: z.ZodString;
            conversationId: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"send_media_message_v1">;
            payload: z.ZodObject<{
                text: z.ZodString;
                price: z.ZodNumber;
                mediaFiles: z.ZodArray<z.ZodString>;
                previews: z.ZodArray<z.ZodString>;
            }, z.core.$strict>;
            retryOfCommandId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            clientCommandId: z.ZodString;
            accountId: z.ZodString;
            conversationId: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"typing_active_v1">;
            payload: z.ZodObject<{}, z.core.$strict>;
            retryOfCommandId: z.ZodOptional<z.ZodNull>;
            clientCommandId: z.ZodString;
            accountId: z.ZodString;
            conversationId: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"unsend_message_v1">;
            payload: z.ZodObject<{
                messageId: z.ZodString;
            }, z.core.$strict>;
            retryOfCommandId: z.ZodOptional<z.ZodNull>;
            clientCommandId: z.ZodString;
            accountId: z.ZodString;
            conversationId: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"mark_chat_read_v1">;
            payload: z.ZodObject<{}, z.core.$strict>;
            retryOfCommandId: z.ZodOptional<z.ZodNull>;
            clientCommandId: z.ZodString;
            accountId: z.ZodString;
            conversationId: z.ZodString;
        }, z.core.$strict>], "kind">;
        readonly response: {
            readonly 200: z.ZodObject<{
                commandId: z.ZodString;
                clientCommandId: z.ZodString;
                kind: z.ZodEnum<{
                    send_text_message_v1: "send_text_message_v1";
                    send_media_message_v1: "send_media_message_v1";
                    typing_active_v1: "typing_active_v1";
                    unsend_message_v1: "unsend_message_v1";
                    mark_chat_read_v1: "mark_chat_read_v1";
                }>;
                accountId: z.ZodString;
                conversationId: z.ZodString;
                state: z.ZodEnum<{
                    cancelled: "cancelled";
                    indeterminate: "indeterminate";
                    queued: "queued";
                    in_flight: "in_flight";
                    confirmed: "confirmed";
                    failed_retryable: "failed_retryable";
                    failed_terminal: "failed_terminal";
                }>;
                payloadHash: z.ZodString;
                retryOfCommandId: z.ZodNullable<z.ZodString>;
                attemptCount: z.ZodNumber;
                lastErrorCode: z.ZodNullable<z.ZodString>;
                lastErrorClass: z.ZodNullable<z.ZodString>;
                verifierResult: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                platformMessageId: z.ZodNullable<z.ZodString>;
                attemptStartedAt: z.ZodNullable<z.ZodString>;
                attemptFinishedAt: z.ZodNullable<z.ZodString>;
                createdAt: z.ZodString;
                updatedAt: z.ZodString;
                deduplicated: z.ZodBoolean;
            }, z.core.$strip>;
            readonly 202: z.ZodObject<{
                commandId: z.ZodString;
                clientCommandId: z.ZodString;
                kind: z.ZodEnum<{
                    send_text_message_v1: "send_text_message_v1";
                    send_media_message_v1: "send_media_message_v1";
                    typing_active_v1: "typing_active_v1";
                    unsend_message_v1: "unsend_message_v1";
                    mark_chat_read_v1: "mark_chat_read_v1";
                }>;
                accountId: z.ZodString;
                conversationId: z.ZodString;
                state: z.ZodEnum<{
                    cancelled: "cancelled";
                    indeterminate: "indeterminate";
                    queued: "queued";
                    in_flight: "in_flight";
                    confirmed: "confirmed";
                    failed_retryable: "failed_retryable";
                    failed_terminal: "failed_terminal";
                }>;
                payloadHash: z.ZodString;
                retryOfCommandId: z.ZodNullable<z.ZodString>;
                attemptCount: z.ZodNumber;
                lastErrorCode: z.ZodNullable<z.ZodString>;
                lastErrorClass: z.ZodNullable<z.ZodString>;
                verifierResult: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                platformMessageId: z.ZodNullable<z.ZodString>;
                attemptStartedAt: z.ZodNullable<z.ZodString>;
                attemptFinishedAt: z.ZodNullable<z.ZodString>;
                createdAt: z.ZodString;
                updatedAt: z.ZodString;
                deduplicated: z.ZodBoolean;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 503: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly getOfapiCommand: {
        readonly auth: {
            readonly kind: "apiKey";
        };
        readonly tags: readonly ["ofapi"];
        readonly summary: "Get one owned desktop OFAPI command";
        readonly description: "Returns command state and audit metadata without echoing message text.";
        readonly params: z.ZodObject<{
            commandId: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                commandId: z.ZodString;
                clientCommandId: z.ZodString;
                kind: z.ZodEnum<{
                    send_text_message_v1: "send_text_message_v1";
                    send_media_message_v1: "send_media_message_v1";
                    typing_active_v1: "typing_active_v1";
                    unsend_message_v1: "unsend_message_v1";
                    mark_chat_read_v1: "mark_chat_read_v1";
                }>;
                accountId: z.ZodString;
                conversationId: z.ZodString;
                state: z.ZodEnum<{
                    cancelled: "cancelled";
                    indeterminate: "indeterminate";
                    queued: "queued";
                    in_flight: "in_flight";
                    confirmed: "confirmed";
                    failed_retryable: "failed_retryable";
                    failed_terminal: "failed_terminal";
                }>;
                payloadHash: z.ZodString;
                retryOfCommandId: z.ZodNullable<z.ZodString>;
                attemptCount: z.ZodNumber;
                lastErrorCode: z.ZodNullable<z.ZodString>;
                lastErrorClass: z.ZodNullable<z.ZodString>;
                verifierResult: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                platformMessageId: z.ZodNullable<z.ZodString>;
                attemptStartedAt: z.ZodNullable<z.ZodString>;
                attemptFinishedAt: z.ZodNullable<z.ZodString>;
                createdAt: z.ZodString;
                updatedAt: z.ZodString;
                deduplicated: z.ZodBoolean;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 503: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly cancelOfapiCommand: {
        readonly auth: {
            readonly kind: "apiKey";
        };
        readonly tags: readonly ["ofapi"];
        readonly summary: "Cancel one queued desktop OFAPI command";
        readonly description: string;
        readonly params: z.ZodObject<{
            commandId: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                commandId: z.ZodString;
                clientCommandId: z.ZodString;
                kind: z.ZodEnum<{
                    send_text_message_v1: "send_text_message_v1";
                    send_media_message_v1: "send_media_message_v1";
                    typing_active_v1: "typing_active_v1";
                    unsend_message_v1: "unsend_message_v1";
                    mark_chat_read_v1: "mark_chat_read_v1";
                }>;
                accountId: z.ZodString;
                conversationId: z.ZodString;
                state: z.ZodEnum<{
                    cancelled: "cancelled";
                    indeterminate: "indeterminate";
                    queued: "queued";
                    in_flight: "in_flight";
                    confirmed: "confirmed";
                    failed_retryable: "failed_retryable";
                    failed_terminal: "failed_terminal";
                }>;
                payloadHash: z.ZodString;
                retryOfCommandId: z.ZodNullable<z.ZodString>;
                attemptCount: z.ZodNumber;
                lastErrorCode: z.ZodNullable<z.ZodString>;
                lastErrorClass: z.ZodNullable<z.ZodString>;
                verifierResult: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                platformMessageId: z.ZodNullable<z.ZodString>;
                attemptStartedAt: z.ZodNullable<z.ZodString>;
                attemptFinishedAt: z.ZodNullable<z.ZodString>;
                createdAt: z.ZodString;
                updatedAt: z.ZodString;
                deduplicated: z.ZodBoolean;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 503: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminOfapiCreditsSummary: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Get the OFAPI credit balance, budgets, forecast, and ops state";
        readonly response: {
            readonly 200: z.ZodObject<{
                enabled: z.ZodBoolean;
                balance: z.ZodObject<{
                    value: z.ZodNullable<z.ZodNumber>;
                    observedAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
                today: z.ZodObject<{
                    day: z.ZodString;
                    total: z.ZodNumber;
                    bySource: z.ZodObject<{
                        rest: z.ZodNumber;
                        webhookAccrual: z.ZodNumber;
                        external: z.ZodNumber;
                        adjustment: z.ZodNumber;
                    }, z.core.$strip>;
                }, z.core.$strip>;
                budgets: z.ZodArray<z.ZodObject<{
                    stream: z.ZodString;
                    spentToday: z.ZodNumber;
                    dailyCeiling: z.ZodNumber;
                    state: z.ZodEnum<{
                        ok: "ok";
                        budget_exhausted: "budget_exhausted";
                        floor_blocked: "floor_blocked";
                    }>;
                    retryAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>>;
                floor: z.ZodObject<{
                    value: z.ZodNumber;
                    blocked: z.ZodBoolean;
                }, z.core.$strip>;
                forecast: z.ZodObject<{
                    avgDailySpend7d: z.ZodNumber;
                    daysLeft: z.ZodNullable<z.ZodNumber>;
                    runOutDate: z.ZodNullable<z.ZodString>;
                    monthToDateSpend: z.ZodOptional<z.ZodNumber>;
                    monthEndProjection: z.ZodOptional<z.ZodNumber>;
                    refillRecommendation: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                        targetDays: z.ZodNumber;
                        credits: z.ZodNumber;
                    }, z.core.$strip>>>;
                }, z.core.$strip>;
                incidents: z.ZodArray<z.ZodObject<{
                    kind: z.ZodString;
                    openedAt: z.ZodString;
                    errorSummary: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>>;
                reconciliation: z.ZodObject<{
                    lastRunAt: z.ZodNullable<z.ZodString>;
                    lastDriftCredits: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strip>;
                accrual: z.ZodObject<{
                    lastPostedDay: z.ZodNullable<z.ZodString>;
                    pendingToday: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                        day: z.ZodString;
                        eventCount: z.ZodNumber;
                        estimatedCredits: z.ZodNumber;
                    }, z.core.$strip>>>;
                }, z.core.$strip>;
                recentBurn: z.ZodOptional<z.ZodObject<{
                    windowMinutes: z.ZodNumber;
                    total: z.ZodNumber;
                    threshold: z.ZodNumber;
                    alerting: z.ZodBoolean;
                    topOperations: z.ZodArray<z.ZodObject<{
                        operation: z.ZodNullable<z.ZodString>;
                        requests: z.ZodNumber;
                        credits: z.ZodNumber;
                    }, z.core.$strip>>;
                    topPages: z.ZodArray<z.ZodObject<{
                        pageId: z.ZodNumber;
                        pageLabel: z.ZodString;
                        credits: z.ZodNumber;
                    }, z.core.$strip>>;
                }, z.core.$strip>>;
                pricing: z.ZodOptional<z.ZodObject<{
                    microUsdPerCredit: z.ZodNumber;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminOfapiCreditsDaily: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Get per-day OFAPI credit spend by source plus balance/refill series";
        readonly querystring: z.ZodObject<{
            days: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                days: z.ZodArray<z.ZodObject<{
                    day: z.ZodString;
                    total: z.ZodNumber;
                    bySource: z.ZodObject<{
                        rest: z.ZodNumber;
                        webhookAccrual: z.ZodNumber;
                        external: z.ZodNumber;
                        adjustment: z.ZodNumber;
                    }, z.core.$strip>;
                }, z.core.$strip>>;
                balance: z.ZodArray<z.ZodObject<{
                    at: z.ZodString;
                    value: z.ZodNumber;
                }, z.core.$strip>>;
                refills: z.ZodArray<z.ZodObject<{
                    at: z.ZodString;
                    credits: z.ZodNumber;
                }, z.core.$strip>>;
                byOperation: z.ZodArray<z.ZodObject<{
                    operation: z.ZodNullable<z.ZodString>;
                    requests: z.ZodNumber;
                    credits: z.ZodNumber;
                }, z.core.$strip>>;
                byPage: z.ZodArray<z.ZodObject<{
                    pageId: z.ZodNumber;
                    pageLabel: z.ZodString;
                    credits: z.ZodNumber;
                    revenueMills: z.ZodOptional<z.ZodNumber>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminOfapiCreditsLedger: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "List OFAPI credit ledger rows with filters and pagination";
        readonly querystring: z.ZodObject<{
            offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            source: z.ZodOptional<z.ZodEnum<{
                adjustment: "adjustment";
                rest: "rest";
                webhook_accrual: "webhook_accrual";
                external: "external";
                refill: "refill";
            }>>;
            pageId: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
            operation: z.ZodOptional<z.ZodString>;
            from: z.ZodOptional<z.ZodString>;
            to: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                total: z.ZodNumber;
                pageOptions: z.ZodArray<z.ZodObject<{
                    pageId: z.ZodNumber;
                    pageLabel: z.ZodString;
                }, z.core.$strip>>;
                rows: z.ZodArray<z.ZodObject<{
                    id: z.ZodNumber;
                    occurredAt: z.ZodString;
                    source: z.ZodEnum<{
                        adjustment: "adjustment";
                        rest: "rest";
                        webhook_accrual: "webhook_accrual";
                        external: "external";
                        refill: "refill";
                    }>;
                    operation: z.ZodNullable<z.ZodString>;
                    pageId: z.ZodNullable<z.ZodNumber>;
                    pageLabel: z.ZodNullable<z.ZodString>;
                    httpStatus: z.ZodNullable<z.ZodNumber>;
                    credits: z.ZodNumber;
                    estimated: z.ZodBoolean;
                    balanceAfter: z.ZodNullable<z.ZodNumber>;
                    requestId: z.ZodNullable<z.ZodString>;
                    accrualDay: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminOfapiCreditsLedgerCsv: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Export the filtered OFAPI credit ledger as a CSV accounting extract";
        readonly querystring: z.ZodObject<{
            source: z.ZodOptional<z.ZodEnum<{
                adjustment: "adjustment";
                rest: "rest";
                webhook_accrual: "webhook_accrual";
                external: "external";
                refill: "refill";
            }>>;
            pageId: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
            operation: z.ZodOptional<z.ZodString>;
            from: z.ZodOptional<z.ZodString>;
            to: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodString;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminOfapiSpendComparison: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Compare OFAPI spend shadow projection rows against core transaction truth";
        readonly description: string;
        readonly querystring: z.ZodObject<{
            days: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            sampleLimit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                generatedAt: z.ZodString;
                window: z.ZodObject<{
                    from: z.ZodString;
                    to: z.ZodString;
                    days: z.ZodNumber;
                }, z.core.$strip>;
                summary: z.ZodArray<z.ZodObject<{
                    status: z.ZodEnum<{
                        other: "other";
                        blocked: "blocked";
                        skipped: "skipped";
                        matched: "matched";
                        missing_in_core_truth: "missing_in_core_truth";
                        page_mismatch: "page_mismatch";
                        amount_mismatch: "amount_mismatch";
                        fan_mismatch: "fan_mismatch";
                        state_mismatch: "state_mismatch";
                        ppv_estimated: "ppv_estimated";
                        tips_blocked: "tips_blocked";
                        tips_signal: "tips_signal";
                    }>;
                    count: z.ZodNumber;
                    grossAmountMills: z.ZodNumber;
                    creatorNetAmountMills: z.ZodNumber;
                    coreGrossAmountMills: z.ZodNumber;
                    coreCreatorNetAmountMills: z.ZodNumber;
                }, z.core.$strip>>;
                byPage: z.ZodArray<z.ZodObject<{
                    status: z.ZodEnum<{
                        other: "other";
                        blocked: "blocked";
                        skipped: "skipped";
                        matched: "matched";
                        missing_in_core_truth: "missing_in_core_truth";
                        page_mismatch: "page_mismatch";
                        amount_mismatch: "amount_mismatch";
                        fan_mismatch: "fan_mismatch";
                        state_mismatch: "state_mismatch";
                        ppv_estimated: "ppv_estimated";
                        tips_blocked: "tips_blocked";
                        tips_signal: "tips_signal";
                    }>;
                    count: z.ZodNumber;
                    grossAmountMills: z.ZodNumber;
                    creatorNetAmountMills: z.ZodNumber;
                    coreGrossAmountMills: z.ZodNumber;
                    coreCreatorNetAmountMills: z.ZodNumber;
                    pageId: z.ZodNumber;
                    pageLabel: z.ZodString;
                }, z.core.$strip>>;
                samples: z.ZodArray<z.ZodObject<{
                    projectionId: z.ZodNumber;
                    comparisonStatus: z.ZodEnum<{
                        other: "other";
                        blocked: "blocked";
                        skipped: "skipped";
                        matched: "matched";
                        missing_in_core_truth: "missing_in_core_truth";
                        page_mismatch: "page_mismatch";
                        amount_mismatch: "amount_mismatch";
                        fan_mismatch: "fan_mismatch";
                        state_mismatch: "state_mismatch";
                        ppv_estimated: "ppv_estimated";
                        tips_blocked: "tips_blocked";
                        tips_signal: "tips_signal";
                    }>;
                    sourceEventType: z.ZodString;
                    projectionStatus: z.ZodString;
                    eventStatus: z.ZodNullable<z.ZodString>;
                    blockedReason: z.ZodNullable<z.ZodString>;
                    journalId: z.ZodNumber;
                    pageId: z.ZodNumber;
                    pageLabel: z.ZodString;
                    fanPlatformUserId: z.ZodNullable<z.ZodString>;
                    transactionId: z.ZodNullable<z.ZodString>;
                    messageId: z.ZodNullable<z.ZodString>;
                    occurredAt: z.ZodString;
                    grossAmountMills: z.ZodNullable<z.ZodNumber>;
                    creatorNetAmountMills: z.ZodNullable<z.ZodNumber>;
                    coreTransactionPk: z.ZodNullable<z.ZodNumber>;
                    corePageId: z.ZodNullable<z.ZodNumber>;
                    coreFanPlatformUserId: z.ZodNullable<z.ZodString>;
                    coreTransactionState: z.ZodNullable<z.ZodString>;
                    coreOccurredAt: z.ZodNullable<z.ZodString>;
                    coreGrossAmountMills: z.ZodNullable<z.ZodNumber>;
                    coreCreatorNetAmountMills: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strip>>;
                limitations: z.ZodArray<z.ZodString>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminOfapiDmColdArchiveStatus: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Get OFAPI DM cold archive status and governance policy markers";
        readonly description: string;
        readonly response: {
            readonly 200: z.ZodObject<{
                enabled: z.ZodBoolean;
                retentionDays: z.ZodNumber;
                rowCount: z.ZodNumber;
                tombstoneCount: z.ZodNumber;
                lastArchivedAt: z.ZodNullable<z.ZodString>;
                lastSourceReceivedAt: z.ZodNullable<z.ZodString>;
                nextPurgeAt: z.ZodNullable<z.ZodString>;
                archiveLagMs: z.ZodNullable<z.ZodNumber>;
                acl: z.ZodLiteral<"owner_admin_endpoint_only">;
                audit: z.ZodLiteral<"source_journal_metadata_on_each_row">;
                purgePolicy: z.ZodLiteral<"daily_retention_purge_by_retain_until">;
                exportPolicy: z.ZodLiteral<"no_raw_transcript_export_endpoint_yet">;
                mediaPolicy: z.ZodLiteral<"stable_metadata_only_no_signed_urls">;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly pages: {
        readonly auth: {
            readonly kind: "any";
        };
        readonly tags: readonly ["pages"];
        readonly summary: "List visible pages";
        readonly response: {
            readonly 200: z.ZodArray<z.ZodObject<{
                id: z.ZodNumber;
                label: z.ZodString;
                platform: z.ZodEnum<{
                    fansly: "fansly";
                    onlyfans: "onlyfans";
                }>;
                modelSlug: z.ZodString;
                modelName: z.ZodString;
                username: z.ZodNullable<z.ZodString>;
                displayName: z.ZodNullable<z.ZodString>;
                followerCount: z.ZodObject<{
                    value: z.ZodNullable<z.ZodNumber>;
                    available: z.ZodBoolean;
                }, z.core.$strip>;
                subscriberCount: z.ZodObject<{
                    value: z.ZodNullable<z.ZodNumber>;
                    available: z.ZodBoolean;
                }, z.core.$strip>;
                lastLightSyncAt: z.ZodNullable<z.ZodString>;
                lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly models: {
        readonly auth: {
            readonly kind: "session";
        };
        readonly tags: readonly ["models"];
        readonly summary: "List visible models";
        readonly response: {
            readonly 200: z.ZodArray<z.ZodObject<{
                id: z.ZodNumber;
                slug: z.ZodString;
                name: z.ZodString;
                pageCount: z.ZodNumber;
            }, z.core.$strip>>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly overviewRevenue: {
        readonly auth: {
            readonly kind: "session";
        };
        readonly tags: readonly ["revenue"];
        readonly summary: "Get agency or visible-scope revenue overview";
        readonly querystring: z.ZodUnion<readonly [z.ZodObject<{
            period: z.ZodEnum<{
                today: "today";
                "7d": "7d";
                "30d": "30d";
                all: "all";
            }>;
            from: z.ZodOptional<z.ZodString>;
            to: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>, z.ZodObject<{
            period: z.ZodLiteral<"custom">;
            from: z.ZodString;
            to: z.ZodString;
        }, z.core.$strip>]>;
        readonly response: {
            readonly 200: z.ZodObject<{
                revenueMills: z.ZodNumber;
                adjustmentMills: z.ZodNumber;
                unclassifiedMills: z.ZodNumber;
                netEarningsMills: z.ZodNumber;
                totalNetMills: z.ZodNumber;
                period: z.ZodEnum<{
                    today: "today";
                    "7d": "7d";
                    "30d": "30d";
                    all: "all";
                    custom: "custom";
                }>;
                from: z.ZodNullable<z.ZodString>;
                to: z.ZodNullable<z.ZodString>;
                currency: z.ZodLiteral<"USD">;
                breakdown: z.ZodArray<z.ZodObject<{
                    canonicalType: z.ZodEnum<{
                        subscription: "subscription";
                        tip: "tip";
                        message_purchase: "message_purchase";
                        post_purchase: "post_purchase";
                        stream_tip: "stream_tip";
                        chargeback: "chargeback";
                        refund: "refund";
                        payout_reversal: "payout_reversal";
                        other: "other";
                    }>;
                    bucket: z.ZodEnum<{
                        revenue: "revenue";
                        adjustment: "adjustment";
                        unclassified: "unclassified";
                        excluded: "excluded";
                    }>;
                    netAmountMills: z.ZodNumber;
                }, z.core.$strip>>;
                comparison: z.ZodNullable<z.ZodObject<{
                    from: z.ZodString;
                    to: z.ZodString;
                    netEarningsMills: z.ZodNumber;
                    totalNetMills: z.ZodNumber;
                    deltaNetMills: z.ZodNumber;
                    deltaPct: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strip>>;
                platformWindows: z.ZodArray<z.ZodObject<{
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    from: z.ZodNullable<z.ZodString>;
                    to: z.ZodNullable<z.ZodString>;
                    comparisonFrom: z.ZodNullable<z.ZodString>;
                    comparisonTo: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>>;
                models: z.ZodArray<z.ZodObject<{
                    modelId: z.ZodNumber;
                    modelSlug: z.ZodString;
                    modelName: z.ZodString;
                    pageCount: z.ZodNumber;
                    netEarningsMills: z.ZodNumber;
                    totalNetMills: z.ZodNumber;
                    status: z.ZodOptional<z.ZodEnum<{
                        active: "active";
                        retired: "retired";
                    }>>;
                }, z.core.$strip>>;
                pages: z.ZodArray<z.ZodObject<{
                    pageId: z.ZodNumber;
                    pageLabel: z.ZodString;
                    modelSlug: z.ZodString;
                    modelName: z.ZodString;
                    netEarningsMills: z.ZodNumber;
                    totalNetMills: z.ZodNumber;
                    status: z.ZodOptional<z.ZodEnum<{
                        active: "active";
                        deleted: "deleted";
                    }>>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly overviewGrowth: {
        readonly auth: {
            readonly kind: "session";
        };
        readonly tags: readonly ["dashboard"];
        readonly summary: "Get period-aware follower and subscriber growth";
        readonly querystring: z.ZodUnion<readonly [z.ZodObject<{
            period: z.ZodEnum<{
                today: "today";
                "7d": "7d";
                "30d": "30d";
                all: "all";
            }>;
            from: z.ZodOptional<z.ZodString>;
            to: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>, z.ZodObject<{
            period: z.ZodLiteral<"custom">;
            from: z.ZodString;
            to: z.ZodString;
        }, z.core.$strip>]>;
        readonly response: {
            readonly 200: z.ZodObject<{
                pages: z.ZodArray<z.ZodObject<{
                    pageId: z.ZodNumber;
                    newFollowers: z.ZodNumber;
                    newSubscribers: z.ZodNumber;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly modelRevenue: {
        readonly auth: {
            readonly kind: "session";
        };
        readonly tags: readonly ["revenue"];
        readonly summary: "Get revenue for one model";
        readonly params: z.ZodObject<{
            modelSlug: z.ZodString;
        }, z.core.$strip>;
        readonly querystring: z.ZodUnion<readonly [z.ZodObject<{
            period: z.ZodEnum<{
                today: "today";
                "7d": "7d";
                "30d": "30d";
                all: "all";
            }>;
            from: z.ZodOptional<z.ZodString>;
            to: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>, z.ZodObject<{
            period: z.ZodLiteral<"custom">;
            from: z.ZodString;
            to: z.ZodString;
        }, z.core.$strip>]>;
        readonly response: {
            readonly 200: z.ZodObject<{
                revenueMills: z.ZodNumber;
                adjustmentMills: z.ZodNumber;
                unclassifiedMills: z.ZodNumber;
                netEarningsMills: z.ZodNumber;
                totalNetMills: z.ZodNumber;
                period: z.ZodEnum<{
                    today: "today";
                    "7d": "7d";
                    "30d": "30d";
                    all: "all";
                    custom: "custom";
                }>;
                from: z.ZodNullable<z.ZodString>;
                to: z.ZodNullable<z.ZodString>;
                currency: z.ZodLiteral<"USD">;
                breakdown: z.ZodArray<z.ZodObject<{
                    canonicalType: z.ZodEnum<{
                        subscription: "subscription";
                        tip: "tip";
                        message_purchase: "message_purchase";
                        post_purchase: "post_purchase";
                        stream_tip: "stream_tip";
                        chargeback: "chargeback";
                        refund: "refund";
                        payout_reversal: "payout_reversal";
                        other: "other";
                    }>;
                    bucket: z.ZodEnum<{
                        revenue: "revenue";
                        adjustment: "adjustment";
                        unclassified: "unclassified";
                        excluded: "excluded";
                    }>;
                    netAmountMills: z.ZodNumber;
                }, z.core.$strip>>;
                comparison: z.ZodNullable<z.ZodObject<{
                    from: z.ZodString;
                    to: z.ZodString;
                    netEarningsMills: z.ZodNumber;
                    totalNetMills: z.ZodNumber;
                    deltaNetMills: z.ZodNumber;
                    deltaPct: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strip>>;
                platformWindows: z.ZodArray<z.ZodObject<{
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    from: z.ZodNullable<z.ZodString>;
                    to: z.ZodNullable<z.ZodString>;
                    comparisonFrom: z.ZodNullable<z.ZodString>;
                    comparisonTo: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>>;
                model: z.ZodObject<{
                    id: z.ZodNumber;
                    slug: z.ZodString;
                    name: z.ZodString;
                    pageCount: z.ZodNumber;
                }, z.core.$strip>;
                pages: z.ZodArray<z.ZodObject<{
                    pageId: z.ZodNumber;
                    pageLabel: z.ZodString;
                    modelSlug: z.ZodString;
                    modelName: z.ZodString;
                    netEarningsMills: z.ZodNumber;
                    totalNetMills: z.ZodNumber;
                    status: z.ZodOptional<z.ZodEnum<{
                        active: "active";
                        deleted: "deleted";
                    }>>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly pageRevenue: {
        readonly auth: {
            readonly kind: "session";
            readonly scope: "page";
        };
        readonly tags: readonly ["revenue"];
        readonly summary: "Get revenue for one page";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strip>;
        readonly querystring: z.ZodUnion<readonly [z.ZodObject<{
            period: z.ZodEnum<{
                today: "today";
                "7d": "7d";
                "30d": "30d";
                all: "all";
            }>;
            from: z.ZodOptional<z.ZodString>;
            to: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>, z.ZodObject<{
            period: z.ZodLiteral<"custom">;
            from: z.ZodString;
            to: z.ZodString;
        }, z.core.$strip>]>;
        readonly response: {
            readonly 200: z.ZodObject<{
                revenueMills: z.ZodNumber;
                adjustmentMills: z.ZodNumber;
                unclassifiedMills: z.ZodNumber;
                netEarningsMills: z.ZodNumber;
                totalNetMills: z.ZodNumber;
                period: z.ZodEnum<{
                    today: "today";
                    "7d": "7d";
                    "30d": "30d";
                    all: "all";
                    custom: "custom";
                }>;
                from: z.ZodNullable<z.ZodString>;
                to: z.ZodNullable<z.ZodString>;
                currency: z.ZodLiteral<"USD">;
                breakdown: z.ZodArray<z.ZodObject<{
                    canonicalType: z.ZodEnum<{
                        subscription: "subscription";
                        tip: "tip";
                        message_purchase: "message_purchase";
                        post_purchase: "post_purchase";
                        stream_tip: "stream_tip";
                        chargeback: "chargeback";
                        refund: "refund";
                        payout_reversal: "payout_reversal";
                        other: "other";
                    }>;
                    bucket: z.ZodEnum<{
                        revenue: "revenue";
                        adjustment: "adjustment";
                        unclassified: "unclassified";
                        excluded: "excluded";
                    }>;
                    netAmountMills: z.ZodNumber;
                }, z.core.$strip>>;
                comparison: z.ZodNullable<z.ZodObject<{
                    from: z.ZodString;
                    to: z.ZodString;
                    netEarningsMills: z.ZodNumber;
                    totalNetMills: z.ZodNumber;
                    deltaNetMills: z.ZodNumber;
                    deltaPct: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strip>>;
                platformWindows: z.ZodArray<z.ZodObject<{
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    from: z.ZodNullable<z.ZodString>;
                    to: z.ZodNullable<z.ZodString>;
                    comparisonFrom: z.ZodNullable<z.ZodString>;
                    comparisonTo: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>>;
                page: z.ZodObject<{
                    id: z.ZodNumber;
                    label: z.ZodString;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    modelSlug: z.ZodString;
                    modelName: z.ZodString;
                    username: z.ZodNullable<z.ZodString>;
                    displayName: z.ZodNullable<z.ZodString>;
                    followerCount: z.ZodObject<{
                        value: z.ZodNullable<z.ZodNumber>;
                        available: z.ZodBoolean;
                    }, z.core.$strip>;
                    subscriberCount: z.ZodObject<{
                        value: z.ZodNullable<z.ZodNumber>;
                        available: z.ZodBoolean;
                    }, z.core.$strip>;
                    lastLightSyncAt: z.ZodNullable<z.ZodString>;
                    lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly pageTransactions: {
        readonly auth: {
            readonly kind: "session";
            readonly scope: "page";
        };
        readonly tags: readonly ["transactions"];
        readonly summary: "List transactions for one page";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strip>;
        readonly querystring: z.ZodObject<{
            limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            type: z.ZodOptional<z.ZodEnum<{
                subscription: "subscription";
                tip: "tip";
                message_purchase: "message_purchase";
                post_purchase: "post_purchase";
                stream_tip: "stream_tip";
                chargeback: "chargeback";
                refund: "refund";
                payout_reversal: "payout_reversal";
                other: "other";
            }>>;
            state: z.ZodOptional<z.ZodEnum<{
                pending: "pending";
                posted: "posted";
                unknown: "unknown";
            }>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                page: z.ZodObject<{
                    id: z.ZodNumber;
                    label: z.ZodString;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    modelSlug: z.ZodString;
                    modelName: z.ZodString;
                    username: z.ZodNullable<z.ZodString>;
                    displayName: z.ZodNullable<z.ZodString>;
                    followerCount: z.ZodObject<{
                        value: z.ZodNullable<z.ZodNumber>;
                        available: z.ZodBoolean;
                    }, z.core.$strip>;
                    subscriberCount: z.ZodObject<{
                        value: z.ZodNullable<z.ZodNumber>;
                        available: z.ZodBoolean;
                    }, z.core.$strip>;
                    lastLightSyncAt: z.ZodNullable<z.ZodString>;
                    lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
                items: z.ZodArray<z.ZodObject<{
                    transactionId: z.ZodString;
                    rawType: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
                    canonicalType: z.ZodEnum<{
                        subscription: "subscription";
                        tip: "tip";
                        message_purchase: "message_purchase";
                        post_purchase: "post_purchase";
                        stream_tip: "stream_tip";
                        chargeback: "chargeback";
                        refund: "refund";
                        payout_reversal: "payout_reversal";
                        other: "other";
                    }>;
                    transactionState: z.ZodEnum<{
                        pending: "pending";
                        posted: "posted";
                        unknown: "unknown";
                    }>;
                    amountMills: z.ZodNumber;
                    destinationAmountMills: z.ZodNumber;
                    netAmountMills: z.ZodNumber;
                    walletId: z.ZodNullable<z.ZodString>;
                    correlationId: z.ZodNullable<z.ZodString>;
                    correlationAccountId: z.ZodNullable<z.ZodString>;
                    occurredAt: z.ZodString;
                    sourceUpdatedAt: z.ZodNullable<z.ZodString>;
                    fan: z.ZodNullable<z.ZodObject<{
                        platformUserId: z.ZodString;
                        pageAlias: z.ZodNullable<z.ZodString>;
                        username: z.ZodNullable<z.ZodString>;
                        displayName: z.ZodNullable<z.ZodString>;
                    }, z.core.$strip>>;
                }, z.core.$strip>>;
                limit: z.ZodNumber;
                offset: z.ZodNumber;
                total: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly pageSubscribers: {
        readonly auth: {
            readonly kind: "any";
            readonly scope: "page";
        };
        readonly tags: readonly ["subscribers"];
        readonly summary: "List current subscribers for one page";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strip>;
        readonly querystring: z.ZodObject<{
            limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            query: z.ZodOptional<z.ZodString>;
            expiringWithinDays: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
            startedWithinHours: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
            autoRenew: z.ZodOptional<z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodBoolean>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                page: z.ZodObject<{
                    id: z.ZodNumber;
                    label: z.ZodString;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    modelSlug: z.ZodString;
                    modelName: z.ZodString;
                    username: z.ZodNullable<z.ZodString>;
                    displayName: z.ZodNullable<z.ZodString>;
                    followerCount: z.ZodObject<{
                        value: z.ZodNullable<z.ZodNumber>;
                        available: z.ZodBoolean;
                    }, z.core.$strip>;
                    subscriberCount: z.ZodObject<{
                        value: z.ZodNullable<z.ZodNumber>;
                        available: z.ZodBoolean;
                    }, z.core.$strip>;
                    lastLightSyncAt: z.ZodNullable<z.ZodString>;
                    lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
                items: z.ZodArray<z.ZodObject<{
                    platformSubscriptionId: z.ZodString;
                    platformUserId: z.ZodString;
                    pageAlias: z.ZodNullable<z.ZodString>;
                    username: z.ZodNullable<z.ZodString>;
                    displayName: z.ZodNullable<z.ZodString>;
                    endsAt: z.ZodNullable<z.ZodString>;
                    autoRenew: z.ZodNullable<z.ZodBoolean>;
                    autoRenewOffDetectedAt: z.ZodNullable<z.ZodString>;
                    subscriptionTierName: z.ZodNullable<z.ZodString>;
                    startedAt: z.ZodNullable<z.ZodString>;
                    totalSpentCents: z.ZodNumber;
                    lastTransactionAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>>;
                limit: z.ZodNumber;
                offset: z.ZodNumber;
                total: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly pageSubscribersDaily: {
        readonly auth: {
            readonly kind: "any";
            readonly scope: "page";
        };
        readonly tags: readonly ["subscribers"];
        readonly summary: "List daily subscriber rollups for one page";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strip>;
        readonly querystring: z.ZodUnion<readonly [z.ZodObject<{
            period: z.ZodEnum<{
                today: "today";
                "7d": "7d";
                "30d": "30d";
                all: "all";
            }>;
            from: z.ZodOptional<z.ZodString>;
            to: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>, z.ZodObject<{
            period: z.ZodLiteral<"custom">;
            from: z.ZodString;
            to: z.ZodString;
        }, z.core.$strip>]>;
        readonly response: {
            readonly 200: z.ZodObject<{
                page: z.ZodObject<{
                    id: z.ZodNumber;
                    label: z.ZodString;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    modelSlug: z.ZodString;
                    modelName: z.ZodString;
                    username: z.ZodNullable<z.ZodString>;
                    displayName: z.ZodNullable<z.ZodString>;
                    followerCount: z.ZodObject<{
                        value: z.ZodNullable<z.ZodNumber>;
                        available: z.ZodBoolean;
                    }, z.core.$strip>;
                    subscriberCount: z.ZodObject<{
                        value: z.ZodNullable<z.ZodNumber>;
                        available: z.ZodBoolean;
                    }, z.core.$strip>;
                    lastLightSyncAt: z.ZodNullable<z.ZodString>;
                    lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
                items: z.ZodArray<z.ZodObject<{
                    businessDate: z.ZodString;
                    newSubscribers: z.ZodNumber;
                    activeSubscribers: z.ZodNumber;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly pageFollowers: {
        readonly auth: {
            readonly kind: "any";
            readonly scope: "page";
        };
        readonly tags: readonly ["followers"];
        readonly summary: "List active followers for one page";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strip>;
        readonly querystring: z.ZodObject<{
            limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            query: z.ZodOptional<z.ZodString>;
            followedWithinHours: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
            subscriber: z.ZodOptional<z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodBoolean>>;
            dmStatus: z.ZodOptional<z.ZodEnum<{
                none: "none";
                has_dm: "has_dm";
            }>>;
            activeWithinMinutes: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                page: z.ZodObject<{
                    id: z.ZodNumber;
                    label: z.ZodString;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    modelSlug: z.ZodString;
                    modelName: z.ZodString;
                    username: z.ZodNullable<z.ZodString>;
                    displayName: z.ZodNullable<z.ZodString>;
                    followerCount: z.ZodObject<{
                        value: z.ZodNullable<z.ZodNumber>;
                        available: z.ZodBoolean;
                    }, z.core.$strip>;
                    subscriberCount: z.ZodObject<{
                        value: z.ZodNullable<z.ZodNumber>;
                        available: z.ZodBoolean;
                    }, z.core.$strip>;
                    lastLightSyncAt: z.ZodNullable<z.ZodString>;
                    lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
                items: z.ZodArray<z.ZodObject<{
                    platformUserId: z.ZodString;
                    pageAlias: z.ZodNullable<z.ZodString>;
                    username: z.ZodNullable<z.ZodString>;
                    displayName: z.ZodNullable<z.ZodString>;
                    followedAt: z.ZodString;
                    isSubscriber: z.ZodBoolean;
                    subscriberSince: z.ZodNullable<z.ZodString>;
                    subscriptionExpiresAt: z.ZodNullable<z.ZodString>;
                    autoRenew: z.ZodNullable<z.ZodBoolean>;
                    autoRenewOffDetectedAt: z.ZodNullable<z.ZodString>;
                    totalSpentCents: z.ZodNumber;
                    lastTransactionAt: z.ZodNullable<z.ZodString>;
                    dm: z.ZodObject<{
                        hasConversation: z.ZodBoolean;
                        platformConversationId: z.ZodNullable<z.ZodString>;
                        unreadCount: z.ZodNumber;
                        lastMessageAt: z.ZodNullable<z.ZodString>;
                        lastFanMessageAt: z.ZodNullable<z.ZodString>;
                        lastModelMessageAt: z.ZodNullable<z.ZodString>;
                        lastMessagePreview: z.ZodNullable<z.ZodString>;
                    }, z.core.$strip>;
                    presence: z.ZodObject<{
                        status: z.ZodEnum<{
                            active_now: "active_now";
                            recently_active: "recently_active";
                            offline: "offline";
                        }>;
                        lastSeenAt: z.ZodNullable<z.ZodString>;
                        observedAt: z.ZodNullable<z.ZodString>;
                    }, z.core.$strip>;
                }, z.core.$strip>>;
                limit: z.ZodNumber;
                offset: z.ZodNumber;
                total: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly pageFollowersDaily: {
        readonly auth: {
            readonly kind: "any";
            readonly scope: "page";
        };
        readonly tags: readonly ["followers"];
        readonly summary: "List daily follower rollups for one page";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strip>;
        readonly querystring: z.ZodUnion<readonly [z.ZodObject<{
            period: z.ZodEnum<{
                today: "today";
                "7d": "7d";
                "30d": "30d";
                all: "all";
            }>;
            from: z.ZodOptional<z.ZodString>;
            to: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>, z.ZodObject<{
            period: z.ZodLiteral<"custom">;
            from: z.ZodString;
            to: z.ZodString;
        }, z.core.$strip>]>;
        readonly response: {
            readonly 200: z.ZodObject<{
                page: z.ZodObject<{
                    id: z.ZodNumber;
                    label: z.ZodString;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    modelSlug: z.ZodString;
                    modelName: z.ZodString;
                    username: z.ZodNullable<z.ZodString>;
                    displayName: z.ZodNullable<z.ZodString>;
                    followerCount: z.ZodObject<{
                        value: z.ZodNullable<z.ZodNumber>;
                        available: z.ZodBoolean;
                    }, z.core.$strip>;
                    subscriberCount: z.ZodObject<{
                        value: z.ZodNullable<z.ZodNumber>;
                        available: z.ZodBoolean;
                    }, z.core.$strip>;
                    lastLightSyncAt: z.ZodNullable<z.ZodString>;
                    lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
                items: z.ZodArray<z.ZodObject<{
                    businessDate: z.ZodString;
                    newFollowers: z.ZodNumber;
                    knownTotalFollowers: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly pageFans: {
        readonly auth: {
            readonly kind: "any";
            readonly scope: "page";
        };
        readonly tags: readonly ["fans"];
        readonly summary: "List fans for one page";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strip>;
        readonly querystring: z.ZodObject<{
            limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            query: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                page: z.ZodObject<{
                    id: z.ZodNumber;
                    label: z.ZodString;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    modelSlug: z.ZodString;
                    modelName: z.ZodString;
                    username: z.ZodNullable<z.ZodString>;
                    displayName: z.ZodNullable<z.ZodString>;
                    followerCount: z.ZodObject<{
                        value: z.ZodNullable<z.ZodNumber>;
                        available: z.ZodBoolean;
                    }, z.core.$strip>;
                    subscriberCount: z.ZodObject<{
                        value: z.ZodNullable<z.ZodNumber>;
                        available: z.ZodBoolean;
                    }, z.core.$strip>;
                    lastLightSyncAt: z.ZodNullable<z.ZodString>;
                    lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
                items: z.ZodArray<z.ZodObject<{
                    platformUserId: z.ZodString;
                    pageAlias: z.ZodNullable<z.ZodString>;
                    username: z.ZodNullable<z.ZodString>;
                    displayName: z.ZodNullable<z.ZodString>;
                    totalCreatorNetMills: z.ZodNumber;
                    currency: z.ZodLiteral<"USD">;
                    isFollower: z.ZodBoolean;
                    followerSince: z.ZodNullable<z.ZodString>;
                    isSubscriber: z.ZodBoolean;
                    subscriberSince: z.ZodNullable<z.ZodString>;
                    subscriptionExpiresAt: z.ZodNullable<z.ZodString>;
                    autoRenew: z.ZodNullable<z.ZodBoolean>;
                    autoRenewOffDetectedAt: z.ZodNullable<z.ZodString>;
                    lastTransactionAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>>;
                limit: z.ZodNumber;
                offset: z.ZodNumber;
                total: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly pageTopSpenders: {
        readonly auth: {
            readonly kind: "any";
            readonly scope: "page";
        };
        readonly tags: readonly ["fans"];
        readonly summary: "Top spenders for one page from the fan-earnings projection (Stage 32 board)";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strip>;
        readonly querystring: z.ZodObject<{
            window: z.ZodDefault<z.ZodString>;
            limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                window: z.ZodString;
                builtAt: z.ZodNullable<z.ZodString>;
                fanCount: z.ZodNumber;
                source: z.ZodObject<{
                    streamState: z.ZodEnum<{
                        ramped: "ramped";
                        flag_off: "flag_off";
                        not_allowlisted: "not_allowlisted";
                        unsupported_platform: "unsupported_platform";
                    }>;
                    lastSyncedAt: z.ZodNullable<z.ZodString>;
                    consecutiveFailures: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strip>;
                entries: z.ZodArray<z.ZodObject<{
                    platformUserId: z.ZodString;
                    username: z.ZodNullable<z.ZodString>;
                    displayName: z.ZodNullable<z.ZodString>;
                    grossMills: z.ZodNumber;
                    netMills: z.ZodNullable<z.ZodNumber>;
                    currency: z.ZodString;
                    observedAt: z.ZodString;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly pageDeletedFans: {
        readonly auth: {
            readonly kind: "any";
            readonly scope: "page";
        };
        readonly tags: readonly ["fans"];
        readonly summary: "List deleted fans for one page";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strip>;
        readonly querystring: z.ZodObject<{
            limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                page: z.ZodObject<{
                    id: z.ZodNumber;
                    label: z.ZodString;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    modelSlug: z.ZodString;
                    modelName: z.ZodString;
                    username: z.ZodNullable<z.ZodString>;
                    displayName: z.ZodNullable<z.ZodString>;
                    followerCount: z.ZodObject<{
                        value: z.ZodNullable<z.ZodNumber>;
                        available: z.ZodBoolean;
                    }, z.core.$strip>;
                    subscriberCount: z.ZodObject<{
                        value: z.ZodNullable<z.ZodNumber>;
                        available: z.ZodBoolean;
                    }, z.core.$strip>;
                    lastLightSyncAt: z.ZodNullable<z.ZodString>;
                    lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
                items: z.ZodArray<z.ZodObject<{
                    platformUserId: z.ZodString;
                    latestKnownLabel: z.ZodNullable<z.ZodString>;
                    pageAlias: z.ZodNullable<z.ZodString>;
                    username: z.ZodNullable<z.ZodString>;
                    displayName: z.ZodNullable<z.ZodString>;
                    latestHistoricalPageAlias: z.ZodNullable<z.ZodString>;
                    latestHistoricalUsername: z.ZodNullable<z.ZodString>;
                    deletedDetectedAt: z.ZodString;
                    deletedLastDetectedAt: z.ZodNullable<z.ZodString>;
                    lastSeenAt: z.ZodString;
                }, z.core.$strip>>;
                limit: z.ZodNumber;
                offset: z.ZodNumber;
                total: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly pageSpenderAutoLists: {
        readonly auth: {
            readonly kind: "any";
            readonly scope: "page";
        };
        readonly tags: readonly ["spenders"];
        readonly summary: "List spender auto-list buckets for one page";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strip>;
        readonly querystring: z.ZodObject<{
            period: z.ZodOptional<z.ZodEnum<{
                today: "today";
                "7d": "7d";
                "30d": "30d";
                custom: "custom";
                "90d": "90d";
                "180d": "180d";
                mtd: "mtd";
                lifetime: "lifetime";
            }>>;
            from: z.ZodOptional<z.ZodString>;
            to: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                page: z.ZodObject<{
                    id: z.ZodNumber;
                    label: z.ZodString;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    modelSlug: z.ZodString;
                    modelName: z.ZodString;
                }, z.core.$strip>;
                currency: z.ZodLiteral<"USD">;
                metric: z.ZodEnum<{
                    grossAmountMills: "grossAmountMills";
                    lifetimeGrossAmountMills: "lifetimeGrossAmountMills";
                }>;
                period: z.ZodObject<{
                    timeZone: z.ZodString;
                    fromBusinessDate: z.ZodNullable<z.ZodString>;
                    toBusinessDateInclusive: z.ZodNullable<z.ZodString>;
                    asOf: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
                asOf: z.ZodNullable<z.ZodString>;
                totalEntries: z.ZodNumber;
                lists: z.ZodArray<z.ZodObject<{
                    key: z.ZodString;
                    label: z.ZodString;
                    minAmountMills: z.ZodNumber;
                    maxAmountMillsExclusive: z.ZodNullable<z.ZodNumber>;
                    entryCount: z.ZodNumber;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly pageSpenderAutoListDetail: {
        readonly auth: {
            readonly kind: "any";
            readonly scope: "page";
        };
        readonly tags: readonly ["spenders"];
        readonly summary: "List fans inside one spender auto-list bucket";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
            bucketKey: z.ZodEnum<{
                "0-25": "0-25";
                "25-50": "25-50";
                "50-150": "50-150";
                "150-350": "150-350";
                "350-600": "350-600";
                "600-plus": "600-plus";
            }>;
        }, z.core.$strip>;
        readonly querystring: z.ZodObject<{
            limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            query: z.ZodOptional<z.ZodString>;
            period: z.ZodOptional<z.ZodEnum<{
                today: "today";
                "7d": "7d";
                "30d": "30d";
                custom: "custom";
                "90d": "90d";
                "180d": "180d";
                mtd: "mtd";
                lifetime: "lifetime";
            }>>;
            from: z.ZodOptional<z.ZodString>;
            to: z.ZodOptional<z.ZodString>;
            excludeNonFollowers: z.ZodOptional<z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodBoolean>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                page: z.ZodObject<{
                    id: z.ZodNumber;
                    label: z.ZodString;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    modelSlug: z.ZodString;
                    modelName: z.ZodString;
                }, z.core.$strip>;
                currency: z.ZodLiteral<"USD">;
                metric: z.ZodEnum<{
                    grossAmountMills: "grossAmountMills";
                    lifetimeGrossAmountMills: "lifetimeGrossAmountMills";
                }>;
                period: z.ZodObject<{
                    timeZone: z.ZodString;
                    fromBusinessDate: z.ZodNullable<z.ZodString>;
                    toBusinessDateInclusive: z.ZodNullable<z.ZodString>;
                    asOf: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
                bucket: z.ZodObject<{
                    key: z.ZodString;
                    label: z.ZodString;
                    minAmountMills: z.ZodNumber;
                    maxAmountMillsExclusive: z.ZodNullable<z.ZodNumber>;
                    entryCount: z.ZodNumber;
                }, z.core.$strip>;
                items: z.ZodArray<z.ZodObject<{
                    fan: z.ZodObject<{
                        platform: z.ZodEnum<{
                            fansly: "fansly";
                            onlyfans: "onlyfans";
                        }>;
                        platformUserId: z.ZodString;
                        username: z.ZodNullable<z.ZodString>;
                        displayName: z.ZodNullable<z.ZodString>;
                        createdAtExternal: z.ZodNullable<z.ZodString>;
                        pageAlias: z.ZodNullable<z.ZodString>;
                    }, z.core.$strip>;
                    isFollower: z.ZodBoolean;
                    isSubscriber: z.ZodBoolean;
                    subscriptionStatus: z.ZodEnum<{
                        active: "active";
                        never: "never";
                        expired: "expired";
                    }>;
                    subscriptionExpiresAt: z.ZodNullable<z.ZodString>;
                    lastSubscriptionEndedAt: z.ZodNullable<z.ZodString>;
                    grossAmountMills: z.ZodNumber;
                    creatorNetAmountMills: z.ZodNumber;
                    lifetimeGrossAmountMills: z.ZodNumber;
                    lifetimeCreatorNetAmountMills: z.ZodNumber;
                    lastTransactionAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>>;
                limit: z.ZodNumber;
                offset: z.ZodNumber;
                total: z.ZodNumber;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly pageFanDetail: {
        readonly auth: {
            readonly kind: "any";
            readonly scope: "page";
        };
        readonly tags: readonly ["fans"];
        readonly summary: "Get one fan within one page";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
            platformUserId: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                fan: z.ZodObject<{
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    platformUserId: z.ZodString;
                    username: z.ZodNullable<z.ZodString>;
                    displayName: z.ZodNullable<z.ZodString>;
                    createdAtExternal: z.ZodNullable<z.ZodString>;
                    pageAlias: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
                platformTotalSpendMills: z.ZodNumber;
                page: z.ZodObject<{
                    pageId: z.ZodNumber;
                    pageLabel: z.ZodString;
                    modelSlug: z.ZodString;
                    modelName: z.ZodString;
                    totalCreatorNetMills: z.ZodNumber;
                    currency: z.ZodLiteral<"USD">;
                    isFollower: z.ZodBoolean;
                    followerSince: z.ZodNullable<z.ZodString>;
                    isSubscriber: z.ZodBoolean;
                    subscriberSince: z.ZodNullable<z.ZodString>;
                    subscriptionExpiresAt: z.ZodNullable<z.ZodString>;
                    autoRenew: z.ZodNullable<z.ZodBoolean>;
                    autoRenewOffDetectedAt: z.ZodNullable<z.ZodString>;
                    lastTransactionAt: z.ZodNullable<z.ZodString>;
                    notes: z.ZodArray<z.ZodObject<{
                        id: z.ZodNumber;
                        authorUserId: z.ZodNullable<z.ZodNumber>;
                        body: z.ZodString;
                        createdAt: z.ZodString;
                    }, z.core.$strip>>;
                    summaries: z.ZodArray<z.ZodObject<{
                        id: z.ZodNumber;
                        authorUserId: z.ZodNullable<z.ZodNumber>;
                        body: z.ZodString;
                        createdAt: z.ZodString;
                    }, z.core.$strip>>;
                }, z.core.$strip>;
                flags: z.ZodArray<z.ZodObject<{
                    flag: z.ZodEnum<{
                        whale: "whale";
                        vip: "vip";
                        risky: "risky";
                    }>;
                    createdAt: z.ZodString;
                    createdByUserId: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly pageFanProfile: {
        readonly auth: {
            readonly kind: "any";
            readonly scope: "page";
        };
        readonly tags: readonly ["fans"];
        readonly summary: "Get the latest intelligence profile for one fan on one page";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
            platformUserId: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                fan: z.ZodObject<{
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    platformUserId: z.ZodString;
                    username: z.ZodNullable<z.ZodString>;
                    displayName: z.ZodNullable<z.ZodString>;
                    createdAtExternal: z.ZodNullable<z.ZodString>;
                    pageAlias: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
                profile: z.ZodNullable<z.ZodObject<{
                    version: z.ZodNumber;
                    body: z.ZodString;
                    source: z.ZodEnum<{
                        chatmuse: "chatmuse";
                    }>;
                    createdAt: z.ZodString;
                    sourceGeneratedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                    createdByUserId: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly pageConversationProfile: {
        readonly auth: {
            readonly kind: "any";
            readonly scope: "page";
        };
        readonly tags: readonly ["fans"];
        readonly summary: "Get the latest intelligence profile for the fan mapped to one page conversation";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
            conversationId: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                fan: z.ZodObject<{
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    platformUserId: z.ZodString;
                    username: z.ZodNullable<z.ZodString>;
                    displayName: z.ZodNullable<z.ZodString>;
                    createdAtExternal: z.ZodNullable<z.ZodString>;
                    pageAlias: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
                profile: z.ZodNullable<z.ZodObject<{
                    version: z.ZodNumber;
                    body: z.ZodString;
                    source: z.ZodEnum<{
                        chatmuse: "chatmuse";
                    }>;
                    createdAt: z.ZodString;
                    sourceGeneratedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                    createdByUserId: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly upsertFanProfile: {
        readonly auth: {
            readonly kind: "any";
            readonly scope: "page";
        };
        readonly tags: readonly ["fans"];
        readonly summary: "Append a new intelligence profile version for one fan on one page";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
            platformUserId: z.ZodString;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{
            body: z.ZodString;
            generatedAtMs: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                version: z.ZodNumber;
                body: z.ZodString;
                source: z.ZodEnum<{
                    chatmuse: "chatmuse";
                }>;
                createdAt: z.ZodString;
                sourceGeneratedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                createdByUserId: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly pageFanProfileVersions: {
        readonly auth: {
            readonly kind: "any";
            readonly scope: "page";
        };
        readonly tags: readonly ["fans"];
        readonly summary: "List intelligence profile versions for one fan on one page";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
            platformUserId: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                items: z.ZodArray<z.ZodObject<{
                    version: z.ZodNumber;
                    createdAt: z.ZodString;
                    isCurrent: z.ZodBoolean;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly pageFanProfileVersion: {
        readonly auth: {
            readonly kind: "any";
            readonly scope: "page";
        };
        readonly tags: readonly ["fans"];
        readonly summary: "Get one intelligence profile version for one fan on one page";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
            platformUserId: z.ZodString;
            version: z.ZodCoercedNumber<unknown>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                version: z.ZodNumber;
                body: z.ZodString;
                source: z.ZodEnum<{
                    chatmuse: "chatmuse";
                }>;
                createdAt: z.ZodString;
                sourceGeneratedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                createdByUserId: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly crossPageFanDetail: {
        readonly auth: {
            readonly kind: "session";
        };
        readonly tags: readonly ["fans"];
        readonly summary: "Get one fan across visible pages";
        readonly params: z.ZodObject<{
            platform: z.ZodEnum<{
                fansly: "fansly";
                onlyfans: "onlyfans";
            }>;
            platformUserId: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                fan: z.ZodObject<{
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    platformUserId: z.ZodString;
                    username: z.ZodNullable<z.ZodString>;
                    displayName: z.ZodNullable<z.ZodString>;
                    createdAtExternal: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
                platformTotalSpendMills: z.ZodNumber;
                pages: z.ZodArray<z.ZodObject<{
                    pageId: z.ZodNumber;
                    pageLabel: z.ZodString;
                    modelSlug: z.ZodString;
                    modelName: z.ZodString;
                    totalCreatorNetMills: z.ZodNumber;
                    currency: z.ZodLiteral<"USD">;
                    isFollower: z.ZodBoolean;
                    followerSince: z.ZodNullable<z.ZodString>;
                    isSubscriber: z.ZodBoolean;
                    subscriberSince: z.ZodNullable<z.ZodString>;
                    subscriptionExpiresAt: z.ZodNullable<z.ZodString>;
                    autoRenew: z.ZodNullable<z.ZodBoolean>;
                    autoRenewOffDetectedAt: z.ZodNullable<z.ZodString>;
                    lastTransactionAt: z.ZodNullable<z.ZodString>;
                    notes: z.ZodArray<z.ZodObject<{
                        id: z.ZodNumber;
                        authorUserId: z.ZodNullable<z.ZodNumber>;
                        body: z.ZodString;
                        createdAt: z.ZodString;
                    }, z.core.$strip>>;
                    summaries: z.ZodArray<z.ZodObject<{
                        id: z.ZodNumber;
                        authorUserId: z.ZodNullable<z.ZodNumber>;
                        body: z.ZodString;
                        createdAt: z.ZodString;
                    }, z.core.$strip>>;
                }, z.core.$strip>>;
                flags: z.ZodArray<z.ZodObject<{
                    flag: z.ZodEnum<{
                        whale: "whale";
                        vip: "vip";
                        risky: "risky";
                    }>;
                    createdAt: z.ZodString;
                    createdByUserId: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly spenders: {
        readonly auth: {
            readonly kind: "any";
        };
        readonly tags: readonly ["spenders"];
        readonly summary: "List ranked spenders for a scoped platform view";
        readonly querystring: z.ZodObject<{
            scope: z.ZodEnum<{
                page: "page";
                model: "model";
                agency: "agency";
            }>;
            pageLabel: z.ZodOptional<z.ZodString>;
            modelSlug: z.ZodOptional<z.ZodString>;
            platform: z.ZodOptional<z.ZodEnum<{
                fansly: "fansly";
                onlyfans: "onlyfans";
            }>>;
            period: z.ZodEnum<{
                today: "today";
                "7d": "7d";
                "30d": "30d";
                custom: "custom";
                "90d": "90d";
                "180d": "180d";
                mtd: "mtd";
                lifetime: "lifetime";
            }>;
            from: z.ZodOptional<z.ZodString>;
            to: z.ZodOptional<z.ZodString>;
            limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            query: z.ZodOptional<z.ZodString>;
            sortBy: z.ZodOptional<z.ZodEnum<{
                grossAmountMills: "grossAmountMills";
                creatorNetAmountMills: "creatorNetAmountMills";
                postedGrossAmountMills: "postedGrossAmountMills";
                pendingGrossAmountMills: "pendingGrossAmountMills";
                postedCreatorNetAmountMills: "postedCreatorNetAmountMills";
                pendingCreatorNetAmountMills: "pendingCreatorNetAmountMills";
                lifetimeGrossAmountMills: "lifetimeGrossAmountMills";
                lifetimeCreatorNetAmountMills: "lifetimeCreatorNetAmountMills";
                lastTransactionAt: "lastTransactionAt";
                platformUserId: "platformUserId";
                username: "username";
                displayName: "displayName";
            }>>;
            sortDir: z.ZodOptional<z.ZodEnum<{
                asc: "asc";
                desc: "desc";
            }>>;
            retentionStatus: z.ZodOptional<z.ZodEnum<{
                all: "all";
                active: "active";
                cooling: "cooling";
                inactive: "inactive";
                needs_reactivation: "needs_reactivation";
            }>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                scope: z.ZodObject<{
                    kind: z.ZodEnum<{
                        page: "page";
                        model: "model";
                        agency: "agency";
                    }>;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    pageCount: z.ZodNumber;
                    page: z.ZodNullable<z.ZodObject<{
                        id: z.ZodNumber;
                        label: z.ZodString;
                        platform: z.ZodEnum<{
                            fansly: "fansly";
                            onlyfans: "onlyfans";
                        }>;
                        modelSlug: z.ZodString;
                        modelName: z.ZodString;
                    }, z.core.$strip>>;
                    model: z.ZodNullable<z.ZodObject<{
                        slug: z.ZodString;
                        name: z.ZodString;
                    }, z.core.$strip>>;
                }, z.core.$strip>;
                period: z.ZodObject<{
                    timeZone: z.ZodString;
                    fromBusinessDate: z.ZodNullable<z.ZodString>;
                    toBusinessDateInclusive: z.ZodNullable<z.ZodString>;
                    asOf: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
                diagnostics: z.ZodObject<{
                    totalGrossAmountMills: z.ZodNumber;
                    totalCreatorNetAmountMills: z.ZodNumber;
                    attributedGrossAmountMills: z.ZodNumber;
                    attributedCreatorNetAmountMills: z.ZodNumber;
                    unattributedGrossAmountMills: z.ZodNumber;
                    unattributedCreatorNetAmountMills: z.ZodNumber;
                }, z.core.$strip>;
                items: z.ZodArray<z.ZodObject<{
                    fan: z.ZodObject<{
                        platform: z.ZodEnum<{
                            fansly: "fansly";
                            onlyfans: "onlyfans";
                        }>;
                        platformUserId: z.ZodString;
                        username: z.ZodNullable<z.ZodString>;
                        displayName: z.ZodNullable<z.ZodString>;
                        createdAtExternal: z.ZodNullable<z.ZodString>;
                        pageAlias: z.ZodNullable<z.ZodString>;
                    }, z.core.$strip>;
                    metrics: z.ZodObject<{
                        window: z.ZodNullable<z.ZodObject<{
                            grossAmountMills: z.ZodNumber;
                            creatorNetAmountMills: z.ZodNumber;
                            postedGrossAmountMills: z.ZodNumber;
                            pendingGrossAmountMills: z.ZodNumber;
                            unknownGrossAmountMills: z.ZodNumber;
                            postedCreatorNetAmountMills: z.ZodNumber;
                            pendingCreatorNetAmountMills: z.ZodNumber;
                            unknownCreatorNetAmountMills: z.ZodNumber;
                            transactionCount: z.ZodNumber;
                            lastTransactionAt: z.ZodNullable<z.ZodString>;
                        }, z.core.$strip>>;
                        lifetime: z.ZodObject<{
                            scopeGrossAmountMills: z.ZodNumber;
                            scopeCreatorNetAmountMills: z.ZodNumber;
                            platformGrossAmountMills: z.ZodNumber;
                            platformCreatorNetAmountMills: z.ZodNumber;
                        }, z.core.$strip>;
                        comparison: z.ZodNullable<z.ZodObject<{
                            previousGrossAmountMills: z.ZodNumber;
                            previousCreatorNetAmountMills: z.ZodNumber;
                            deltaGrossAmountMills: z.ZodNumber;
                            deltaCreatorNetAmountMills: z.ZodNumber;
                            deltaPct: z.ZodNullable<z.ZodNumber>;
                        }, z.core.$strip>>;
                    }, z.core.$strip>;
                    lifetimeLastTransactionAt: z.ZodNullable<z.ZodString>;
                    lastFanMessageAt: z.ZodNullable<z.ZodString>;
                    conversation: z.ZodObject<{
                        platformConversationId: z.ZodNullable<z.ZodString>;
                        unreadCount: z.ZodNumber;
                        lastMessageAt: z.ZodNullable<z.ZodString>;
                        lastFanMessageAt: z.ZodNullable<z.ZodString>;
                        lastModelMessageAt: z.ZodNullable<z.ZodString>;
                        lastMessagePreview: z.ZodNullable<z.ZodString>;
                        storedMessageCount: z.ZodNumber;
                        messageCoverageStatus: z.ZodEnum<{
                            pending_backfill: "pending_backfill";
                            partial_window: "partial_window";
                            complete: "complete";
                        }>;
                        messageBackfillComplete: z.ZodBoolean;
                    }, z.core.$strip>;
                    lastTransaction: z.ZodNullable<z.ZodObject<{
                        canonicalType: z.ZodEnum<{
                            subscription: "subscription";
                            tip: "tip";
                            message_purchase: "message_purchase";
                            post_purchase: "post_purchase";
                            stream_tip: "stream_tip";
                            chargeback: "chargeback";
                            refund: "refund";
                            payout_reversal: "payout_reversal";
                            other: "other";
                        }>;
                        transactionState: z.ZodEnum<{
                            pending: "pending";
                            posted: "posted";
                            unknown: "unknown";
                        }>;
                        grossAmountMills: z.ZodNumber;
                        creatorNetAmountMills: z.ZodNumber;
                        occurredAt: z.ZodString;
                    }, z.core.$strip>>;
                    retentionStatus: z.ZodEnum<{
                        active: "active";
                        cooling: "cooling";
                        inactive: "inactive";
                        needs_reactivation: "needs_reactivation";
                    }>;
                }, z.core.$strip>>;
                limit: z.ZodNumber;
                offset: z.ZodNumber;
                total: z.ZodNumber;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly spenderDetail: {
        readonly auth: {
            readonly kind: "any";
        };
        readonly tags: readonly ["spenders"];
        readonly summary: "Get one platform-scoped spender";
        readonly params: z.ZodObject<{
            platform: z.ZodEnum<{
                fansly: "fansly";
                onlyfans: "onlyfans";
            }>;
            platformUserId: z.ZodString;
        }, z.core.$strip>;
        readonly querystring: z.ZodObject<{
            scope: z.ZodEnum<{
                page: "page";
                model: "model";
                agency: "agency";
            }>;
            pageLabel: z.ZodOptional<z.ZodString>;
            modelSlug: z.ZodOptional<z.ZodString>;
            platform: z.ZodOptional<z.ZodEnum<{
                fansly: "fansly";
                onlyfans: "onlyfans";
            }>>;
            period: z.ZodEnum<{
                today: "today";
                "7d": "7d";
                "30d": "30d";
                custom: "custom";
                "90d": "90d";
                "180d": "180d";
                mtd: "mtd";
                lifetime: "lifetime";
            }>;
            from: z.ZodOptional<z.ZodString>;
            to: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                scope: z.ZodObject<{
                    kind: z.ZodEnum<{
                        page: "page";
                        model: "model";
                        agency: "agency";
                    }>;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    pageCount: z.ZodNumber;
                    page: z.ZodNullable<z.ZodObject<{
                        id: z.ZodNumber;
                        label: z.ZodString;
                        platform: z.ZodEnum<{
                            fansly: "fansly";
                            onlyfans: "onlyfans";
                        }>;
                        modelSlug: z.ZodString;
                        modelName: z.ZodString;
                    }, z.core.$strip>>;
                    model: z.ZodNullable<z.ZodObject<{
                        slug: z.ZodString;
                        name: z.ZodString;
                    }, z.core.$strip>>;
                }, z.core.$strip>;
                fan: z.ZodObject<{
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    platformUserId: z.ZodString;
                    username: z.ZodNullable<z.ZodString>;
                    displayName: z.ZodNullable<z.ZodString>;
                    createdAtExternal: z.ZodNullable<z.ZodString>;
                    pageAlias: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
                period: z.ZodObject<{
                    timeZone: z.ZodString;
                    fromBusinessDate: z.ZodNullable<z.ZodString>;
                    toBusinessDateInclusive: z.ZodNullable<z.ZodString>;
                    asOf: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
                metrics: z.ZodObject<{
                    window: z.ZodNullable<z.ZodObject<{
                        grossAmountMills: z.ZodNumber;
                        creatorNetAmountMills: z.ZodNumber;
                        postedGrossAmountMills: z.ZodNumber;
                        pendingGrossAmountMills: z.ZodNumber;
                        unknownGrossAmountMills: z.ZodNumber;
                        postedCreatorNetAmountMills: z.ZodNumber;
                        pendingCreatorNetAmountMills: z.ZodNumber;
                        unknownCreatorNetAmountMills: z.ZodNumber;
                        transactionCount: z.ZodNumber;
                        lastTransactionAt: z.ZodNullable<z.ZodString>;
                    }, z.core.$strip>>;
                    lifetime: z.ZodObject<{
                        scopeGrossAmountMills: z.ZodNumber;
                        scopeCreatorNetAmountMills: z.ZodNumber;
                        platformGrossAmountMills: z.ZodNumber;
                        platformCreatorNetAmountMills: z.ZodNumber;
                    }, z.core.$strip>;
                    comparison: z.ZodNullable<z.ZodObject<{
                        previousGrossAmountMills: z.ZodNumber;
                        previousCreatorNetAmountMills: z.ZodNumber;
                        deltaGrossAmountMills: z.ZodNumber;
                        deltaCreatorNetAmountMills: z.ZodNumber;
                        deltaPct: z.ZodNullable<z.ZodNumber>;
                    }, z.core.$strip>>;
                }, z.core.$strip>;
                typeBreakdown: z.ZodArray<z.ZodObject<{
                    canonicalType: z.ZodEnum<{
                        subscription: "subscription";
                        tip: "tip";
                        message_purchase: "message_purchase";
                        post_purchase: "post_purchase";
                        stream_tip: "stream_tip";
                        chargeback: "chargeback";
                        refund: "refund";
                        payout_reversal: "payout_reversal";
                        other: "other";
                    }>;
                    grossAmountMills: z.ZodNumber;
                    creatorNetAmountMills: z.ZodNumber;
                    transactionCount: z.ZodNumber;
                }, z.core.$strip>>;
                pages: z.ZodArray<z.ZodObject<{
                    pageId: z.ZodNumber;
                    pageLabel: z.ZodString;
                    modelSlug: z.ZodString;
                    modelName: z.ZodString;
                    inScope: z.ZodBoolean;
                    grossAmountMills: z.ZodNumber;
                    creatorNetAmountMills: z.ZodNumber;
                    lastTransactionAt: z.ZodNullable<z.ZodString>;
                    isFollower: z.ZodBoolean;
                    followerSince: z.ZodNullable<z.ZodString>;
                    isSubscriber: z.ZodBoolean;
                    subscriberSince: z.ZodNullable<z.ZodString>;
                    subscriptionExpiresAt: z.ZodNullable<z.ZodString>;
                    autoRenew: z.ZodNullable<z.ZodBoolean>;
                    autoRenewOffDetectedAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly spenderSeries: {
        readonly auth: {
            readonly kind: "session";
        };
        readonly tags: readonly ["spenders"];
        readonly summary: "Get zero-filled spender trend series";
        readonly params: z.ZodObject<{
            platform: z.ZodEnum<{
                fansly: "fansly";
                onlyfans: "onlyfans";
            }>;
            platformUserId: z.ZodString;
        }, z.core.$strip>;
        readonly querystring: z.ZodObject<{
            scope: z.ZodEnum<{
                page: "page";
                model: "model";
                agency: "agency";
            }>;
            pageLabel: z.ZodOptional<z.ZodString>;
            modelSlug: z.ZodOptional<z.ZodString>;
            platform: z.ZodOptional<z.ZodEnum<{
                fansly: "fansly";
                onlyfans: "onlyfans";
            }>>;
            period: z.ZodEnum<{
                today: "today";
                "7d": "7d";
                "30d": "30d";
                custom: "custom";
                "90d": "90d";
                "180d": "180d";
                mtd: "mtd";
                lifetime: "lifetime";
            }>;
            from: z.ZodOptional<z.ZodString>;
            to: z.ZodOptional<z.ZodString>;
            granularity: z.ZodDefault<z.ZodEnum<{
                day: "day";
                week: "week";
                month: "month";
                auto: "auto";
            }>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                scope: z.ZodObject<{
                    kind: z.ZodEnum<{
                        page: "page";
                        model: "model";
                        agency: "agency";
                    }>;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    pageCount: z.ZodNumber;
                    page: z.ZodNullable<z.ZodObject<{
                        id: z.ZodNumber;
                        label: z.ZodString;
                        platform: z.ZodEnum<{
                            fansly: "fansly";
                            onlyfans: "onlyfans";
                        }>;
                        modelSlug: z.ZodString;
                        modelName: z.ZodString;
                    }, z.core.$strip>>;
                    model: z.ZodNullable<z.ZodObject<{
                        slug: z.ZodString;
                        name: z.ZodString;
                    }, z.core.$strip>>;
                }, z.core.$strip>;
                fan: z.ZodObject<{
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    platformUserId: z.ZodString;
                    username: z.ZodNullable<z.ZodString>;
                    displayName: z.ZodNullable<z.ZodString>;
                    createdAtExternal: z.ZodNullable<z.ZodString>;
                    pageAlias: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
                period: z.ZodObject<{
                    timeZone: z.ZodString;
                    fromBusinessDate: z.ZodNullable<z.ZodString>;
                    toBusinessDateInclusive: z.ZodNullable<z.ZodString>;
                    asOf: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
                granularity: z.ZodEnum<{
                    day: "day";
                    week: "week";
                    month: "month";
                }>;
                items: z.ZodArray<z.ZodObject<{
                    fromBusinessDate: z.ZodString;
                    toBusinessDateInclusive: z.ZodString;
                    metrics: z.ZodObject<{
                        grossAmountMills: z.ZodNumber;
                        creatorNetAmountMills: z.ZodNumber;
                        postedGrossAmountMills: z.ZodNumber;
                        pendingGrossAmountMills: z.ZodNumber;
                        unknownGrossAmountMills: z.ZodNumber;
                        postedCreatorNetAmountMills: z.ZodNumber;
                        pendingCreatorNetAmountMills: z.ZodNumber;
                        unknownCreatorNetAmountMills: z.ZodNumber;
                        transactionCount: z.ZodNumber;
                        lastTransactionAt: z.ZodNullable<z.ZodString>;
                    }, z.core.$strip>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly spenderBatch: {
        readonly auth: {
            readonly kind: "any";
        };
        readonly tags: readonly ["spenders"];
        readonly summary: "Batch-resolve spender metrics for platform-scoped fan identities";
        readonly body: z.ZodObject<{
            scope: z.ZodEnum<{
                page: "page";
                model: "model";
                agency: "agency";
            }>;
            pageLabel: z.ZodOptional<z.ZodString>;
            modelSlug: z.ZodOptional<z.ZodString>;
            platform: z.ZodOptional<z.ZodEnum<{
                fansly: "fansly";
                onlyfans: "onlyfans";
            }>>;
            period: z.ZodOptional<z.ZodEnum<{
                today: "today";
                "7d": "7d";
                "30d": "30d";
                custom: "custom";
                "90d": "90d";
                "180d": "180d";
                mtd: "mtd";
                lifetime: "lifetime";
            }>>;
            from: z.ZodOptional<z.ZodString>;
            to: z.ZodOptional<z.ZodString>;
            fans: z.ZodArray<z.ZodObject<{
                platform: z.ZodEnum<{
                    fansly: "fansly";
                    onlyfans: "onlyfans";
                }>;
                platformUserId: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                scope: z.ZodObject<{
                    kind: z.ZodEnum<{
                        page: "page";
                        model: "model";
                        agency: "agency";
                    }>;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    pageCount: z.ZodNumber;
                    page: z.ZodNullable<z.ZodObject<{
                        id: z.ZodNumber;
                        label: z.ZodString;
                        platform: z.ZodEnum<{
                            fansly: "fansly";
                            onlyfans: "onlyfans";
                        }>;
                        modelSlug: z.ZodString;
                        modelName: z.ZodString;
                    }, z.core.$strip>>;
                    model: z.ZodNullable<z.ZodObject<{
                        slug: z.ZodString;
                        name: z.ZodString;
                    }, z.core.$strip>>;
                }, z.core.$strip>;
                period: z.ZodObject<{
                    timeZone: z.ZodString;
                    fromBusinessDate: z.ZodNullable<z.ZodString>;
                    toBusinessDateInclusive: z.ZodNullable<z.ZodString>;
                    asOf: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
                items: z.ZodArray<z.ZodObject<{
                    requestedFan: z.ZodObject<{
                        platform: z.ZodEnum<{
                            fansly: "fansly";
                            onlyfans: "onlyfans";
                        }>;
                        platformUserId: z.ZodString;
                    }, z.core.$strip>;
                    found: z.ZodBoolean;
                    fan: z.ZodNullable<z.ZodObject<{
                        platform: z.ZodEnum<{
                            fansly: "fansly";
                            onlyfans: "onlyfans";
                        }>;
                        platformUserId: z.ZodString;
                        username: z.ZodNullable<z.ZodString>;
                        displayName: z.ZodNullable<z.ZodString>;
                        createdAtExternal: z.ZodNullable<z.ZodString>;
                        pageAlias: z.ZodNullable<z.ZodString>;
                    }, z.core.$strip>>;
                    metrics: z.ZodNullable<z.ZodObject<{
                        window: z.ZodNullable<z.ZodObject<{
                            grossAmountMills: z.ZodNumber;
                            creatorNetAmountMills: z.ZodNumber;
                            postedGrossAmountMills: z.ZodNumber;
                            pendingGrossAmountMills: z.ZodNumber;
                            unknownGrossAmountMills: z.ZodNumber;
                            postedCreatorNetAmountMills: z.ZodNumber;
                            pendingCreatorNetAmountMills: z.ZodNumber;
                            unknownCreatorNetAmountMills: z.ZodNumber;
                            transactionCount: z.ZodNumber;
                            lastTransactionAt: z.ZodNullable<z.ZodString>;
                        }, z.core.$strip>>;
                        lifetime: z.ZodObject<{
                            scopeGrossAmountMills: z.ZodNumber;
                            scopeCreatorNetAmountMills: z.ZodNumber;
                            platformGrossAmountMills: z.ZodNumber;
                            platformCreatorNetAmountMills: z.ZodNumber;
                        }, z.core.$strip>;
                        comparison: z.ZodNullable<z.ZodObject<{
                            previousGrossAmountMills: z.ZodNumber;
                            previousCreatorNetAmountMills: z.ZodNumber;
                            deltaGrossAmountMills: z.ZodNumber;
                            deltaCreatorNetAmountMills: z.ZodNumber;
                            deltaPct: z.ZodNullable<z.ZodNumber>;
                        }, z.core.$strip>>;
                    }, z.core.$strip>>;
                    typeBreakdown: z.ZodNullable<z.ZodArray<z.ZodObject<{
                        canonicalType: z.ZodEnum<{
                            subscription: "subscription";
                            tip: "tip";
                            message_purchase: "message_purchase";
                            post_purchase: "post_purchase";
                            stream_tip: "stream_tip";
                            chargeback: "chargeback";
                            refund: "refund";
                            payout_reversal: "payout_reversal";
                            other: "other";
                        }>;
                        grossAmountMills: z.ZodNumber;
                        creatorNetAmountMills: z.ZodNumber;
                        transactionCount: z.ZodNumber;
                    }, z.core.$strip>>>;
                    lifetimeLastTransactionAt: z.ZodNullable<z.ZodString>;
                    subscription: z.ZodNullable<z.ZodObject<{
                        status: z.ZodEnum<{
                            active: "active";
                            never: "never";
                            expired: "expired";
                        }>;
                        expiresAt: z.ZodNullable<z.ZodString>;
                        autoRenew: z.ZodNullable<z.ZodBoolean>;
                        autoRenewOffDetectedAt: z.ZodNullable<z.ZodString>;
                    }, z.core.$strip>>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly fansSearch: {
        readonly auth: {
            readonly kind: "any";
        };
        readonly tags: readonly ["fans"];
        readonly summary: "Search visible platform-scoped fan identities";
        readonly querystring: z.ZodObject<{
            scope: z.ZodEnum<{
                page: "page";
                model: "model";
                agency: "agency";
            }>;
            pageLabel: z.ZodOptional<z.ZodString>;
            modelSlug: z.ZodOptional<z.ZodString>;
            platform: z.ZodOptional<z.ZodEnum<{
                fansly: "fansly";
                onlyfans: "onlyfans";
            }>>;
            limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            query: z.ZodOptional<z.ZodString>;
            q: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                scope: z.ZodObject<{
                    kind: z.ZodEnum<{
                        page: "page";
                        model: "model";
                        agency: "agency";
                    }>;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    pageCount: z.ZodNumber;
                    page: z.ZodNullable<z.ZodObject<{
                        id: z.ZodNumber;
                        label: z.ZodString;
                        platform: z.ZodEnum<{
                            fansly: "fansly";
                            onlyfans: "onlyfans";
                        }>;
                        modelSlug: z.ZodString;
                        modelName: z.ZodString;
                    }, z.core.$strip>>;
                    model: z.ZodNullable<z.ZodObject<{
                        slug: z.ZodString;
                        name: z.ZodString;
                    }, z.core.$strip>>;
                }, z.core.$strip>;
                items: z.ZodArray<z.ZodObject<{
                    fan: z.ZodObject<{
                        platform: z.ZodEnum<{
                            fansly: "fansly";
                            onlyfans: "onlyfans";
                        }>;
                        platformUserId: z.ZodString;
                        username: z.ZodNullable<z.ZodString>;
                        displayName: z.ZodNullable<z.ZodString>;
                        createdAtExternal: z.ZodNullable<z.ZodString>;
                        pageAlias: z.ZodNullable<z.ZodString>;
                    }, z.core.$strip>;
                    matchKind: z.ZodEnum<{
                        platformUserId: "platformUserId";
                        username: "username";
                        displayName: "displayName";
                        alias: "alias";
                    }>;
                    matchedValue: z.ZodNullable<z.ZodString>;
                    pages: z.ZodArray<z.ZodObject<{
                        pageId: z.ZodNumber;
                        pageLabel: z.ZodString;
                        modelSlug: z.ZodString;
                        modelName: z.ZodString;
                        isFollower: z.ZodBoolean;
                        followerSince: z.ZodNullable<z.ZodString>;
                        isSubscriber: z.ZodBoolean;
                        subscriberSince: z.ZodNullable<z.ZodString>;
                        subscriptionExpiresAt: z.ZodNullable<z.ZodString>;
                        autoRenew: z.ZodNullable<z.ZodBoolean>;
                        autoRenewOffDetectedAt: z.ZodNullable<z.ZodString>;
                    }, z.core.$strip>>;
                }, z.core.$strip>>;
                limit: z.ZodNumber;
                offset: z.ZodNumber;
                total: z.ZodNumber;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly pageConversationPreview: {
        readonly auth: {
            readonly kind: "session";
            readonly scope: "page";
        };
        readonly tags: readonly ["conversations"];
        readonly summary: "Return locally cached DM preview rows for one conversation";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
            platformConversationId: z.ZodString;
        }, z.core.$strip>;
        readonly querystring: z.ZodObject<{
            limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                page: z.ZodObject<{
                    id: z.ZodNumber;
                    label: z.ZodString;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    modelSlug: z.ZodString;
                    modelName: z.ZodString;
                    username: z.ZodNullable<z.ZodString>;
                    displayName: z.ZodNullable<z.ZodString>;
                    followerCount: z.ZodObject<{
                        value: z.ZodNullable<z.ZodNumber>;
                        available: z.ZodBoolean;
                    }, z.core.$strip>;
                    subscriberCount: z.ZodObject<{
                        value: z.ZodNullable<z.ZodNumber>;
                        available: z.ZodBoolean;
                    }, z.core.$strip>;
                    lastLightSyncAt: z.ZodNullable<z.ZodString>;
                    lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
                fan: z.ZodNullable<z.ZodObject<{
                    fanId: z.ZodNumber;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    platformUserId: z.ZodString;
                    pageAlias: z.ZodNullable<z.ZodString>;
                    username: z.ZodNullable<z.ZodString>;
                    displayName: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>>;
                conversation: z.ZodObject<{
                    platformConversationId: z.ZodString;
                    storedMessageCount: z.ZodNumber;
                    messageCoverageStatus: z.ZodEnum<{
                        pending_backfill: "pending_backfill";
                        partial_window: "partial_window";
                        complete: "complete";
                    }>;
                    messageBackfillComplete: z.ZodBoolean;
                    messageSyncEligibility: z.ZodEnum<{
                        excluded: "excluded";
                        eligible: "eligible";
                        unresolved_identity: "unresolved_identity";
                    }>;
                    messageSyncExcludedReason: z.ZodNullable<z.ZodString>;
                    lastMessageSyncAt: z.ZodNullable<z.ZodString>;
                    unreadCount: z.ZodNumber;
                    lastMessageAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
                messageSyncUx: z.ZodObject<{
                    state: z.ZodEnum<{
                        healthy: "healthy";
                        syncing: "syncing";
                        catching_up: "catching_up";
                        retrying: "retrying";
                        attention: "attention";
                        setup: "setup";
                        off: "off";
                    }>;
                    label: z.ZodString;
                    headline: z.ZodString;
                    detail: z.ZodNullable<z.ZodString>;
                    progressLabel: z.ZodNullable<z.ZodString>;
                    nextRetryAt: z.ZodNullable<z.ZodString>;
                    updatedAt: z.ZodNullable<z.ZodString>;
                    requiresAction: z.ZodBoolean;
                }, z.core.$strip>;
                messages: z.ZodArray<z.ZodObject<{
                    platformMessageId: z.ZodString;
                    senderPlatformUserId: z.ZodNullable<z.ZodString>;
                    senderRole: z.ZodEnum<{
                        unknown: "unknown";
                        model: "model";
                        fan: "fan";
                        system: "system";
                    }>;
                    createdAt: z.ZodString;
                    content: z.ZodString;
                    totalTipAmountCents: z.ZodNumber;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly pageConversationMessages: {
        readonly auth: {
            readonly kind: "session";
            readonly scope: "page";
        };
        readonly tags: readonly ["conversations"];
        readonly summary: "Return cached DM messages for one conversation";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
            conversationId: z.ZodString;
        }, z.core.$strip>;
        readonly querystring: z.ZodObject<{
            limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                page: z.ZodObject<{
                    id: z.ZodNumber;
                    label: z.ZodString;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    modelSlug: z.ZodString;
                    modelName: z.ZodString;
                    username: z.ZodNullable<z.ZodString>;
                    displayName: z.ZodNullable<z.ZodString>;
                    followerCount: z.ZodObject<{
                        value: z.ZodNullable<z.ZodNumber>;
                        available: z.ZodBoolean;
                    }, z.core.$strip>;
                    subscriberCount: z.ZodObject<{
                        value: z.ZodNullable<z.ZodNumber>;
                        available: z.ZodBoolean;
                    }, z.core.$strip>;
                    lastLightSyncAt: z.ZodNullable<z.ZodString>;
                    lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
                conversationId: z.ZodString;
                conversation: z.ZodObject<{
                    platformConversationId: z.ZodString;
                    storedMessageCount: z.ZodNumber;
                    messageCoverageStatus: z.ZodEnum<{
                        pending_backfill: "pending_backfill";
                        partial_window: "partial_window";
                        complete: "complete";
                    }>;
                    messageBackfillComplete: z.ZodBoolean;
                    messageSyncEligibility: z.ZodEnum<{
                        excluded: "excluded";
                        eligible: "eligible";
                        unresolved_identity: "unresolved_identity";
                    }>;
                    messageSyncExcludedReason: z.ZodNullable<z.ZodString>;
                    lastMessageSyncAt: z.ZodNullable<z.ZodString>;
                    unreadCount: z.ZodNumber;
                    lastMessageAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
                messages: z.ZodArray<z.ZodObject<{
                    messageId: z.ZodString;
                    senderRole: z.ZodEnum<{
                        unknown: "unknown";
                        model: "model";
                        fan: "fan";
                        system: "system";
                    }>;
                    content: z.ZodString;
                    createdAt: z.ZodString;
                    tipAmountCents: z.ZodNumber;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly workboardV2: {
        readonly auth: {
            readonly kind: "session";
            readonly scope: "page";
        };
        readonly tags: readonly ["workboard"];
        readonly summary: "Get a Workboard v2 tab queue (priority engine) for one page";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strip>;
        readonly querystring: z.ZodObject<{
            tab: z.ZodEnum<{
                subscribers: "subscribers";
                spenders: "spenders";
                fresh_mass: "fresh_mass";
                old_mass: "old_mass";
                service: "service";
            }>;
            status: z.ZodPipe<z.ZodOptional<z.ZodString>, z.ZodTransform<string[] | undefined, string | undefined>>;
            limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                tab: z.ZodEnum<{
                    subscribers: "subscribers";
                    spenders: "spenders";
                    fresh_mass: "fresh_mass";
                    old_mass: "old_mass";
                    service: "service";
                }>;
                total: z.ZodNumber;
                limit: z.ZodNumber;
                offset: z.ZodNumber;
                items: z.ZodArray<z.ZodObject<{
                    fanId: z.ZodNumber;
                    fan: z.ZodObject<{
                        platformUserId: z.ZodNullable<z.ZodString>;
                        pageAlias: z.ZodNullable<z.ZodString>;
                        username: z.ZodNullable<z.ZodString>;
                        displayName: z.ZodNullable<z.ZodString>;
                    }, z.core.$strip>;
                    tab: z.ZodEnum<{
                        subscribers: "subscribers";
                        spenders: "spenders";
                        fresh_mass: "fresh_mass";
                        old_mass: "old_mass";
                        service: "service";
                    }>;
                    massSubstate: z.ZodNullable<z.ZodEnum<{
                        active: "active";
                        fresh: "fresh";
                        gray: "gray";
                        dead: "dead";
                        archived: "archived";
                    }>>;
                    value: z.ZodObject<{
                        score: z.ZodNumber;
                        tier: z.ZodEnum<{
                            whale: "whale";
                            vip: "vip";
                            payer: "payer";
                            new: "new";
                        }>;
                        confidence: z.ZodEnum<{
                            high: "high";
                            low: "low";
                        }>;
                    }, z.core.$strip>;
                    urgency: z.ZodObject<{
                        score: z.ZodNumber;
                        severity: z.ZodEnum<{
                            high: "high";
                            critical: "critical";
                            medium: "medium";
                            normal: "normal";
                            muted: "muted";
                        }>;
                    }, z.core.$strip>;
                    rankScore: z.ZodNumber;
                    secondaryStatus: z.ZodEnum<{
                        recent_purchase: "recent_purchase";
                        need_reply: "need_reply";
                        due_now: "due_now";
                        later: "later";
                        dont_touch_today: "dont_touch_today";
                    }>;
                    needsReply: z.ZodBoolean;
                    needsHumanTriage: z.ZodBoolean;
                    isPurchaseFollowup: z.ZodBoolean;
                    whyNow: z.ZodObject<{
                        code: z.ZodNullable<z.ZodString>;
                        value: z.ZodNullable<z.ZodNumber>;
                    }, z.core.$strip>;
                    reasonChips: z.ZodArray<z.ZodString>;
                    quality: z.ZodObject<{
                        qScore: z.ZodNullable<z.ZodNumber>;
                        qConfidence: z.ZodEnum<{
                            high: "high";
                            low: "low";
                            medium: "medium";
                        }>;
                    }, z.core.$strip>;
                    closingVerdict: z.ZodNullable<z.ZodObject<{
                        layer: z.ZodEnum<{
                            unknown: "unknown";
                            unverified: "unverified";
                            fresh: "fresh";
                            l1: "l1";
                            l2: "l2";
                            model_last: "model_last";
                        }>;
                        needsReply: z.ZodBoolean;
                        state: z.ZodNullable<z.ZodEnum<{
                            question: "question";
                            buy_signal: "buy_signal";
                            smalltalk: "smalltalk";
                            closing: "closing";
                            cold: "cold";
                            complaint: "complaint";
                        }>>;
                        reason: z.ZodNullable<z.ZodString>;
                    }, z.core.$strip>>;
                    online: z.ZodBoolean;
                    ltv: z.ZodObject<{
                        creatorNetAmountMills: z.ZodNumber;
                    }, z.core.$strip>;
                    subscription: z.ZodObject<{
                        expiresAt: z.ZodNullable<z.ZodString>;
                        autoRenew: z.ZodNullable<z.ZodBoolean>;
                    }, z.core.$strip>;
                    conversation: z.ZodObject<{
                        lastFanMessageAt: z.ZodNullable<z.ZodString>;
                        lastModelMessageAt: z.ZodNullable<z.ZodString>;
                        preview: z.ZodNullable<z.ZodString>;
                        coverageStatus: z.ZodEnum<{
                            pending_backfill: "pending_backfill";
                            partial_window: "partial_window";
                            complete: "complete";
                        }>;
                        platformConversationId: z.ZodNullable<z.ZodString>;
                    }, z.core.$strip>;
                    serviceReason: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>>;
                claims: z.ZodArray<z.ZodObject<{
                    fanId: z.ZodNumber;
                    claimedByUserId: z.ZodNumber;
                    claimedByUsername: z.ZodString;
                    expiresAt: z.ZodString;
                }, z.core.$strip>>;
                counts: z.ZodArray<z.ZodObject<{
                    tab: z.ZodEnum<{
                        subscribers: "subscribers";
                        spenders: "spenders";
                        fresh_mass: "fresh_mass";
                        old_mass: "old_mass";
                        service: "service";
                    }>;
                    secondaryStatus: z.ZodEnum<{
                        recent_purchase: "recent_purchase";
                        need_reply: "need_reply";
                        due_now: "due_now";
                        later: "later";
                        dont_touch_today: "dont_touch_today";
                    }>;
                    count: z.ZodNumber;
                }, z.core.$strip>>;
                oldMassBudget: z.ZodNullable<z.ZodObject<{
                    used: z.ZodNumber;
                    total: z.ZodNumber;
                    resetsAt: z.ZodString;
                }, z.core.$strip>>;
                aiCoverage: z.ZodObject<{
                    enabled: z.ZodBoolean;
                    classified: z.ZodNumber;
                    closingsFound: z.ZodNumber;
                    callsToday: z.ZodNumber;
                    spenderTotal: z.ZodNumber;
                    spenderDiagnosed: z.ZodNumber;
                    spenderPending: z.ZodNumber;
                }, z.core.$strip>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly workboardV2Lists: {
        readonly auth: {
            readonly kind: "session";
            readonly scope: "page";
        };
        readonly tags: readonly ["workboard"];
        readonly summary: "Get Workboard v2 spender lists (lifetime gross-spend bands) for one page";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                bands: z.ZodArray<z.ZodObject<{
                    key: z.ZodString;
                    label: z.ZodString;
                    count: z.ZodNumber;
                    items: z.ZodArray<z.ZodObject<{
                        fanId: z.ZodNumber;
                        fan: z.ZodObject<{
                            platformUserId: z.ZodNullable<z.ZodString>;
                            pageAlias: z.ZodNullable<z.ZodString>;
                            username: z.ZodNullable<z.ZodString>;
                            displayName: z.ZodNullable<z.ZodString>;
                        }, z.core.$strip>;
                        tab: z.ZodEnum<{
                            subscribers: "subscribers";
                            spenders: "spenders";
                            fresh_mass: "fresh_mass";
                            old_mass: "old_mass";
                            service: "service";
                        }>;
                        massSubstate: z.ZodNullable<z.ZodEnum<{
                            active: "active";
                            fresh: "fresh";
                            gray: "gray";
                            dead: "dead";
                            archived: "archived";
                        }>>;
                        value: z.ZodObject<{
                            score: z.ZodNumber;
                            tier: z.ZodEnum<{
                                whale: "whale";
                                vip: "vip";
                                payer: "payer";
                                new: "new";
                            }>;
                            confidence: z.ZodEnum<{
                                high: "high";
                                low: "low";
                            }>;
                        }, z.core.$strip>;
                        urgency: z.ZodObject<{
                            score: z.ZodNumber;
                            severity: z.ZodEnum<{
                                high: "high";
                                critical: "critical";
                                medium: "medium";
                                normal: "normal";
                                muted: "muted";
                            }>;
                        }, z.core.$strip>;
                        rankScore: z.ZodNumber;
                        secondaryStatus: z.ZodEnum<{
                            recent_purchase: "recent_purchase";
                            need_reply: "need_reply";
                            due_now: "due_now";
                            later: "later";
                            dont_touch_today: "dont_touch_today";
                        }>;
                        needsReply: z.ZodBoolean;
                        needsHumanTriage: z.ZodBoolean;
                        isPurchaseFollowup: z.ZodBoolean;
                        whyNow: z.ZodObject<{
                            code: z.ZodNullable<z.ZodString>;
                            value: z.ZodNullable<z.ZodNumber>;
                        }, z.core.$strip>;
                        reasonChips: z.ZodArray<z.ZodString>;
                        quality: z.ZodObject<{
                            qScore: z.ZodNullable<z.ZodNumber>;
                            qConfidence: z.ZodEnum<{
                                high: "high";
                                low: "low";
                                medium: "medium";
                            }>;
                        }, z.core.$strip>;
                        closingVerdict: z.ZodNullable<z.ZodObject<{
                            layer: z.ZodEnum<{
                                unknown: "unknown";
                                unverified: "unverified";
                                fresh: "fresh";
                                l1: "l1";
                                l2: "l2";
                                model_last: "model_last";
                            }>;
                            needsReply: z.ZodBoolean;
                            state: z.ZodNullable<z.ZodEnum<{
                                question: "question";
                                buy_signal: "buy_signal";
                                smalltalk: "smalltalk";
                                closing: "closing";
                                cold: "cold";
                                complaint: "complaint";
                            }>>;
                            reason: z.ZodNullable<z.ZodString>;
                        }, z.core.$strip>>;
                        online: z.ZodBoolean;
                        ltv: z.ZodObject<{
                            creatorNetAmountMills: z.ZodNumber;
                        }, z.core.$strip>;
                        subscription: z.ZodObject<{
                            expiresAt: z.ZodNullable<z.ZodString>;
                            autoRenew: z.ZodNullable<z.ZodBoolean>;
                        }, z.core.$strip>;
                        conversation: z.ZodObject<{
                            lastFanMessageAt: z.ZodNullable<z.ZodString>;
                            lastModelMessageAt: z.ZodNullable<z.ZodString>;
                            preview: z.ZodNullable<z.ZodString>;
                            coverageStatus: z.ZodEnum<{
                                pending_backfill: "pending_backfill";
                                partial_window: "partial_window";
                                complete: "complete";
                            }>;
                            platformConversationId: z.ZodNullable<z.ZodString>;
                        }, z.core.$strip>;
                        serviceReason: z.ZodNullable<z.ZodString>;
                    }, z.core.$strip>>;
                }, z.core.$strip>>;
                total: z.ZodNumber;
                truncated: z.ZodBoolean;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly workboardV2Contact: {
        readonly auth: {
            readonly kind: "session";
            readonly scope: "page";
        };
        readonly tags: readonly ["workboard"];
        readonly summary: "Record a chatter touch (Готово) on a Workboard v2 fan";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{
            fanId: z.ZodNumber;
            action: z.ZodDefault<z.ZodEnum<{
                opened: "opened";
                handled: "handled";
                snoozed: "snoozed";
            }>>;
            wasProductive: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                ok: z.ZodLiteral<true>;
                fanId: z.ZodNumber;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly workboardV2Recompute: {
        readonly auth: {
            readonly kind: "session";
            readonly scope: "page";
        };
        readonly tags: readonly ["workboard"];
        readonly summary: "Recompute the Workboard v2 queue for one page (on-demand)";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                ok: z.ZodLiteral<true>;
                evaluated: z.ZodNumber;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly workboardV2Snooze: {
        readonly auth: {
            readonly kind: "session";
            readonly scope: "page";
        };
        readonly tags: readonly ["workboard"];
        readonly summary: "Snooze a fan on Workboard v2 (moves to Service; re-evaluates instantly)";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{
            fanId: z.ZodNumber;
            days: z.ZodNumber;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                ok: z.ZodLiteral<true>;
                fanId: z.ZodNumber;
                snoozedUntil: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly workboardV2Unsnooze: {
        readonly auth: {
            readonly kind: "session";
            readonly scope: "page";
        };
        readonly tags: readonly ["workboard"];
        readonly summary: "Unsnooze a fan on Workboard v2 (re-evaluates instantly)";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
            fanId: z.ZodCoercedNumber<unknown>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                ok: z.ZodLiteral<true>;
                fanId: z.ZodNumber;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly workboardV2UndoContact: {
        readonly auth: {
            readonly kind: "session";
            readonly scope: "page";
        };
        readonly tags: readonly ["workboard"];
        readonly summary: "Undo the last Готово touch for a fan (re-evaluates instantly)";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
            fanId: z.ZodCoercedNumber<unknown>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                ok: z.ZodLiteral<true>;
                fanId: z.ZodNumber;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly workboardV2Claim: {
        readonly auth: {
            readonly kind: "any-session";
            readonly scope: "page";
        };
        readonly tags: readonly ["workboard"];
        readonly summary: "Claim a fan (soft coordination lease, TTL'd, non-blocking)";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{
            fanId: z.ZodNumber;
            ttlMinutes: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                ok: z.ZodLiteral<true>;
                fanId: z.ZodNumber;
                expiresAt: z.ZodString;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly workboardV2Unclaim: {
        readonly auth: {
            readonly kind: "any-session";
            readonly scope: "page";
        };
        readonly tags: readonly ["workboard"];
        readonly summary: "Release a fan claim";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
            fanId: z.ZodCoercedNumber<unknown>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                ok: z.ZodLiteral<true>;
                fanId: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly workboardV2Ai: {
        readonly auth: {
            readonly kind: "owner-session";
            readonly scope: "page";
        };
        readonly tags: readonly ["workboard"];
        readonly summary: "AI (L2 closing classifier) analytics + settings for a page";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                settings: z.ZodObject<{
                    enabled: z.ZodBoolean;
                    hasApiKey: z.ZodBoolean;
                    model: z.ZodString;
                    dailyCapMin: z.ZodNumber;
                    dailyCapMax: z.ZodNumber;
                    envEnabled: z.ZodBoolean;
                    source: z.ZodObject<{
                        enabled: z.ZodEnum<{
                            override: "override";
                            env: "env";
                        }>;
                        dailyCapMax: z.ZodEnum<{
                            override: "override";
                            env: "env";
                        }>;
                        model: z.ZodEnum<{
                            override: "override";
                            env: "env";
                        }>;
                    }, z.core.$strip>;
                    override: z.ZodObject<{
                        enabled: z.ZodNullable<z.ZodBoolean>;
                        dailyCapMax: z.ZodNullable<z.ZodNumber>;
                        model: z.ZodNullable<z.ZodString>;
                    }, z.core.$strip>;
                }, z.core.$strip>;
                usage: z.ZodObject<{
                    today: z.ZodObject<{
                        calls: z.ZodNumber;
                        inputTokens: z.ZodNumber;
                        outputTokens: z.ZodNumber;
                        costUsd: z.ZodNumber;
                    }, z.core.$strip>;
                    last30d: z.ZodObject<{
                        calls: z.ZodNumber;
                        inputTokens: z.ZodNumber;
                        outputTokens: z.ZodNumber;
                        costUsd: z.ZodNumber;
                    }, z.core.$strip>;
                    daily: z.ZodArray<z.ZodObject<{
                        calls: z.ZodNumber;
                        inputTokens: z.ZodNumber;
                        outputTokens: z.ZodNumber;
                        costUsd: z.ZodNumber;
                        date: z.ZodString;
                    }, z.core.$strip>>;
                }, z.core.$strip>;
                coverage: z.ZodObject<{
                    tails: z.ZodNumber;
                    classified: z.ZodNumber;
                    closings: z.ZodNumber;
                    pending: z.ZodNumber;
                    spenders: z.ZodNumber;
                    spenderDiagnosed: z.ZodNumber;
                    spenderPending: z.ZodNumber;
                    spenderL2Classified: z.ZodNumber;
                    spenderClosings: z.ZodNumber;
                    spenderNoVisibleDialog: z.ZodNumber;
                    spenderModelLast: z.ZodNumber;
                    spenderFanLast: z.ZodNumber;
                    spenderUnknownLast: z.ZodNumber;
                }, z.core.$strip>;
                states: z.ZodArray<z.ZodObject<{
                    state: z.ZodString;
                    count: z.ZodNumber;
                }, z.core.$strip>>;
                recent: z.ZodArray<z.ZodObject<{
                    messageId: z.ZodString;
                    tail: z.ZodString;
                    state: z.ZodNullable<z.ZodEnum<{
                        question: "question";
                        buy_signal: "buy_signal";
                        smalltalk: "smalltalk";
                        closing: "closing";
                        cold: "cold";
                        complaint: "complaint";
                    }>>;
                    needsReply: z.ZodBoolean;
                    reason: z.ZodNullable<z.ZodString>;
                    model: z.ZodNullable<z.ZodString>;
                    classifiedAt: z.ZodString;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly workboardV2AiSettings: {
        readonly auth: {
            readonly kind: "owner-session";
            readonly scope: "page";
        };
        readonly tags: readonly ["workboard"];
        readonly summary: "Update per-page AI classifier settings (owner only)";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{
            enabled: z.ZodNullable<z.ZodBoolean>;
            dailyCapMax: z.ZodNullable<z.ZodNumber>;
            model: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                settings: z.ZodObject<{
                    enabled: z.ZodBoolean;
                    hasApiKey: z.ZodBoolean;
                    model: z.ZodString;
                    dailyCapMin: z.ZodNumber;
                    dailyCapMax: z.ZodNumber;
                    envEnabled: z.ZodBoolean;
                    source: z.ZodObject<{
                        enabled: z.ZodEnum<{
                            override: "override";
                            env: "env";
                        }>;
                        dailyCapMax: z.ZodEnum<{
                            override: "override";
                            env: "env";
                        }>;
                        model: z.ZodEnum<{
                            override: "override";
                            env: "env";
                        }>;
                    }, z.core.$strip>;
                    override: z.ZodObject<{
                        enabled: z.ZodNullable<z.ZodBoolean>;
                        dailyCapMax: z.ZodNullable<z.ZodNumber>;
                        model: z.ZodNullable<z.ZodString>;
                    }, z.core.$strip>;
                }, z.core.$strip>;
                usage: z.ZodObject<{
                    today: z.ZodObject<{
                        calls: z.ZodNumber;
                        inputTokens: z.ZodNumber;
                        outputTokens: z.ZodNumber;
                        costUsd: z.ZodNumber;
                    }, z.core.$strip>;
                    last30d: z.ZodObject<{
                        calls: z.ZodNumber;
                        inputTokens: z.ZodNumber;
                        outputTokens: z.ZodNumber;
                        costUsd: z.ZodNumber;
                    }, z.core.$strip>;
                    daily: z.ZodArray<z.ZodObject<{
                        calls: z.ZodNumber;
                        inputTokens: z.ZodNumber;
                        outputTokens: z.ZodNumber;
                        costUsd: z.ZodNumber;
                        date: z.ZodString;
                    }, z.core.$strip>>;
                }, z.core.$strip>;
                coverage: z.ZodObject<{
                    tails: z.ZodNumber;
                    classified: z.ZodNumber;
                    closings: z.ZodNumber;
                    pending: z.ZodNumber;
                    spenders: z.ZodNumber;
                    spenderDiagnosed: z.ZodNumber;
                    spenderPending: z.ZodNumber;
                    spenderL2Classified: z.ZodNumber;
                    spenderClosings: z.ZodNumber;
                    spenderNoVisibleDialog: z.ZodNumber;
                    spenderModelLast: z.ZodNumber;
                    spenderFanLast: z.ZodNumber;
                    spenderUnknownLast: z.ZodNumber;
                }, z.core.$strip>;
                states: z.ZodArray<z.ZodObject<{
                    state: z.ZodString;
                    count: z.ZodNumber;
                }, z.core.$strip>>;
                recent: z.ZodArray<z.ZodObject<{
                    messageId: z.ZodString;
                    tail: z.ZodString;
                    state: z.ZodNullable<z.ZodEnum<{
                        question: "question";
                        buy_signal: "buy_signal";
                        smalltalk: "smalltalk";
                        closing: "closing";
                        cold: "cold";
                        complaint: "complaint";
                    }>>;
                    needsReply: z.ZodBoolean;
                    reason: z.ZodNullable<z.ZodString>;
                    model: z.ZodNullable<z.ZodString>;
                    classifiedAt: z.ZodString;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly workboardV2AiClassify: {
        readonly auth: {
            readonly kind: "owner-session";
            readonly scope: "page";
        };
        readonly tags: readonly ["workboard"];
        readonly summary: "Run (or re-run) the AI classifier for a page now (owner only)";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{
            reclassify: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                ok: z.ZodLiteral<true>;
                runId: z.ZodNumber;
                status: z.ZodString;
                alreadyRunning: z.ZodBoolean;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly workboardV2AiRuns: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["workboard"];
        readonly summary: "Global AI classifier run log (owner only)";
        readonly response: {
            readonly 200: z.ZodObject<{
                runs: z.ZodArray<z.ZodObject<{
                    id: z.ZodNumber;
                    pageLabel: z.ZodNullable<z.ZodString>;
                    trigger: z.ZodEnum<{
                        reclassify: "reclassify";
                        cron: "cron";
                        manual: "manual";
                    }>;
                    model: z.ZodNullable<z.ZodString>;
                    classified: z.ZodNumber;
                    calls: z.ZodNumber;
                    inputTokens: z.ZodNumber;
                    outputTokens: z.ZodNumber;
                    deferred: z.ZodNumber;
                    cleared: z.ZodNumber;
                    costUsd: z.ZodNumber;
                    status: z.ZodString;
                    error: z.ZodNullable<z.ZodString>;
                    createdAt: z.ZodString;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly overview: {
        readonly auth: {
            readonly kind: "session";
        };
        readonly tags: readonly ["dashboard"];
        readonly summary: "Get agency overview dashboard data";
        readonly response: {
            readonly 200: z.ZodObject<{
                counts: z.ZodObject<{
                    models: z.ZodNumber;
                    pages: z.ZodNumber;
                    fans: z.ZodNumber;
                }, z.core.$strip>;
                revenue: z.ZodObject<{
                    "7d": z.ZodObject<{
                        revenueMills: z.ZodNumber;
                        adjustmentMills: z.ZodNumber;
                        unclassifiedMills: z.ZodNumber;
                        netEarningsMills: z.ZodNumber;
                        previousNetEarningsMills: z.ZodNumber;
                        deltaPct: z.ZodNullable<z.ZodNumber>;
                    }, z.core.$strip>;
                    "30d": z.ZodObject<{
                        revenueMills: z.ZodNumber;
                        adjustmentMills: z.ZodNumber;
                        unclassifiedMills: z.ZodNumber;
                        netEarningsMills: z.ZodNumber;
                        previousNetEarningsMills: z.ZodNumber;
                        deltaPct: z.ZodNullable<z.ZodNumber>;
                    }, z.core.$strip>;
                }, z.core.$strip>;
                overall: z.ZodObject<{
                    syncUx: z.ZodObject<{
                        state: z.ZodEnum<{
                            healthy: "healthy";
                            syncing: "syncing";
                            catching_up: "catching_up";
                            retrying: "retrying";
                            attention: "attention";
                            setup: "setup";
                            off: "off";
                        }>;
                        label: z.ZodString;
                        headline: z.ZodString;
                        detail: z.ZodNullable<z.ZodString>;
                        progressLabel: z.ZodNullable<z.ZodString>;
                        nextRetryAt: z.ZodNullable<z.ZodString>;
                        updatedAt: z.ZodNullable<z.ZodString>;
                        requiresAction: z.ZodBoolean;
                    }, z.core.$strip>;
                }, z.core.$strip>;
                pages: z.ZodArray<z.ZodObject<{
                    id: z.ZodNumber;
                    label: z.ZodString;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    modelSlug: z.ZodString;
                    modelName: z.ZodString;
                    username: z.ZodNullable<z.ZodString>;
                    subscriberCount: z.ZodObject<{
                        value: z.ZodNullable<z.ZodNumber>;
                        available: z.ZodBoolean;
                    }, z.core.$strip>;
                    followerCount: z.ZodObject<{
                        value: z.ZodNullable<z.ZodNumber>;
                        available: z.ZodBoolean;
                    }, z.core.$strip>;
                    revenueTodayMills: z.ZodNumber;
                    revenue7dMills: z.ZodNumber;
                    revenue30dMills: z.ZodNumber;
                    newSubscribersToday: z.ZodNumber;
                    newFollowersToday: z.ZodNumber;
                    connectionStatus: z.ZodEnum<{
                        error: "error";
                        active: "active";
                        stale: "stale";
                        expired: "expired";
                        never_synced: "never_synced";
                        unverified: "unverified";
                    }>;
                    lastLightSyncAt: z.ZodNullable<z.ZodString>;
                    lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
                    lastSyncError: z.ZodNullable<z.ZodString>;
                    syncUx: z.ZodObject<{
                        state: z.ZodEnum<{
                            healthy: "healthy";
                            syncing: "syncing";
                            catching_up: "catching_up";
                            retrying: "retrying";
                            attention: "attention";
                            setup: "setup";
                            off: "off";
                        }>;
                        label: z.ZodString;
                        headline: z.ZodString;
                        detail: z.ZodNullable<z.ZodString>;
                        progressLabel: z.ZodNullable<z.ZodString>;
                        nextRetryAt: z.ZodNullable<z.ZodString>;
                        updatedAt: z.ZodNullable<z.ZodString>;
                        requiresAction: z.ZodBoolean;
                    }, z.core.$strip>;
                }, z.core.$strip>>;
                setup: z.ZodObject<{
                    hasPages: z.ZodBoolean;
                    hasFanslyPages: z.ZodBoolean;
                    hasOnlyFansPages: z.ZodBoolean;
                }, z.core.$strip>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly syncStatus: {
        readonly auth: {
            readonly kind: "session";
        };
        readonly tags: readonly ["dashboard"];
        readonly summary: "Get aggregated sync monitor data for visible pages";
        readonly querystring: z.ZodObject<{
            pageLabel: z.ZodOptional<z.ZodString>;
            windowHours: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            eventLimit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                generatedAt: z.ZodString;
                window: z.ZodObject<{
                    hours: z.ZodNumber;
                    startedAt: z.ZodString;
                }, z.core.$strip>;
                overall: z.ZodObject<{
                    pages: z.ZodNumber;
                    streams: z.ZodNumber;
                    runningStreams: z.ZodNumber;
                    blockedStreams: z.ZodNumber;
                    stalledStreams: z.ZodNumber;
                    pendingStreams: z.ZodNumber;
                    retryingStreams: z.ZodNumber;
                    counts: z.ZodObject<{
                        fans: z.ZodNumber;
                        followers: z.ZodNumber;
                        subscribers: z.ZodNumber;
                        transactions: z.ZodNumber;
                        conversations: z.ZodNumber;
                        messages: z.ZodNumber;
                    }, z.core.$strip>;
                    recentRuns: z.ZodObject<{
                        running: z.ZodNumber;
                        success: z.ZodNumber;
                        partial: z.ZodNumber;
                        failed: z.ZodNumber;
                        skipped: z.ZodNumber;
                    }, z.core.$strip>;
                    recentErrors: z.ZodObject<{
                        total429s: z.ZodNumber;
                        total5xxs: z.ZodNumber;
                        failedRuns: z.ZodNumber;
                        failedAttempts: z.ZodNumber;
                        retryAttempts: z.ZodNumber;
                        last429At: z.ZodNullable<z.ZodString>;
                        last5xxAt: z.ZodNullable<z.ZodString>;
                    }, z.core.$strip>;
                    providers: z.ZodArray<z.ZodObject<{
                        platform: z.ZodEnum<{
                            fansly: "fansly";
                            onlyfans: "onlyfans";
                        }>;
                        rateHealth: z.ZodObject<{
                            state: z.ZodEnum<{
                                healthy: "healthy";
                                warning: "warning";
                                limited: "limited";
                            }>;
                            last429At: z.ZodNullable<z.ZodString>;
                            nextAvailableAt: z.ZodNullable<z.ZodString>;
                        }, z.core.$strip>;
                        recent429s: z.ZodNumber;
                        recent5xxs: z.ZodNumber;
                    }, z.core.$strip>>;
                    syncUx: z.ZodObject<{
                        state: z.ZodEnum<{
                            healthy: "healthy";
                            syncing: "syncing";
                            catching_up: "catching_up";
                            retrying: "retrying";
                            attention: "attention";
                            setup: "setup";
                            off: "off";
                        }>;
                        label: z.ZodString;
                        headline: z.ZodString;
                        detail: z.ZodNullable<z.ZodString>;
                        progressLabel: z.ZodNullable<z.ZodString>;
                        nextRetryAt: z.ZodNullable<z.ZodString>;
                        updatedAt: z.ZodNullable<z.ZodString>;
                        requiresAction: z.ZodBoolean;
                    }, z.core.$strip>;
                }, z.core.$strip>;
                pages: z.ZodArray<z.ZodObject<{
                    pageId: z.ZodNumber;
                    pageLabel: z.ZodString;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    modelSlug: z.ZodString;
                    modelName: z.ZodString;
                    username: z.ZodNullable<z.ZodString>;
                    displayName: z.ZodNullable<z.ZodString>;
                    counts: z.ZodObject<{
                        fans: z.ZodNumber;
                        followers: z.ZodNumber;
                        subscribers: z.ZodNumber;
                        transactions: z.ZodNumber;
                        conversations: z.ZodNumber;
                        messages: z.ZodNumber;
                    }, z.core.$strip>;
                    summary: z.ZodObject<{
                        runningStreams: z.ZodNumber;
                        blockedStreams: z.ZodNumber;
                        stalledStreams: z.ZodNumber;
                        pendingStreams: z.ZodNumber;
                        retryingStreams: z.ZodNumber;
                    }, z.core.$strip>;
                    streams: z.ZodArray<z.ZodObject<{
                        stream: z.ZodEnum<{
                            subscribers: "subscribers";
                            light: "light";
                            followers: "followers";
                            fan_identities: "fan_identities";
                            transactions: "transactions";
                            top_spenders: "top_spenders";
                            dm_conversations: "dm_conversations";
                            dm_messages: "dm_messages";
                            followers_reconcile: "followers_reconcile";
                            fan_earnings: "fan_earnings";
                            purchase_history: "purchase_history";
                        }>;
                        status: z.ZodEnum<{
                            pending: "pending";
                            retrying: "retrying";
                            idle: "idle";
                            running: "running";
                            blocked: "blocked";
                            paused: "paused";
                        }>;
                        stalled: z.ZodBoolean;
                        pending: z.ZodBoolean;
                        retryAt: z.ZodNullable<z.ZodString>;
                        progress: z.ZodNullable<z.ZodObject<{
                            label: z.ZodString;
                            current: z.ZodNumber;
                            total: z.ZodNullable<z.ZodNumber>;
                            unit: z.ZodString;
                            percent: z.ZodNullable<z.ZodNumber>;
                        }, z.core.$strip>>;
                        deepBackfill: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                            pendingConversations: z.ZodNumber;
                            pendingPagesEstimate: z.ZodNumber;
                            spenderPendingConversations: z.ZodNumber;
                            spenderPendingPagesEstimate: z.ZodNumber;
                            regularPendingConversations: z.ZodNumber;
                            regularPendingPagesEstimate: z.ZodNumber;
                            recentRequests: z.ZodNumber;
                            lastCompletedAt: z.ZodNullable<z.ZodString>;
                            liveRequestsSinceDeepBackfill: z.ZodNumber;
                            active: z.ZodBoolean;
                            stalled: z.ZodBoolean;
                            stallReason: z.ZodNullable<z.ZodString>;
                        }, z.core.$strip>>>;
                        recentRuns: z.ZodObject<{
                            running: z.ZodNumber;
                            success: z.ZodNumber;
                            partial: z.ZodNumber;
                            failed: z.ZodNumber;
                            skipped: z.ZodNumber;
                        }, z.core.$strip>;
                        recentErrors: z.ZodObject<{
                            total429s: z.ZodNumber;
                            total5xxs: z.ZodNumber;
                            failedRuns: z.ZodNumber;
                            failedAttempts: z.ZodNumber;
                            retryAttempts: z.ZodNumber;
                            last429At: z.ZodNullable<z.ZodString>;
                            last5xxAt: z.ZodNullable<z.ZodString>;
                        }, z.core.$strip>;
                        rateHealth: z.ZodObject<{
                            state: z.ZodEnum<{
                                healthy: "healthy";
                                warning: "warning";
                                limited: "limited";
                            }>;
                            last429At: z.ZodNullable<z.ZodString>;
                            nextAvailableAt: z.ZodNullable<z.ZodString>;
                        }, z.core.$strip>;
                        activeRun: z.ZodNullable<z.ZodObject<{
                            runId: z.ZodNumber;
                            trigger: z.ZodString;
                            startedAt: z.ZodString;
                            lastActivityAt: z.ZodString;
                        }, z.core.$strip>>;
                        lastCompletion: z.ZodNullable<z.ZodObject<{
                            runId: z.ZodNumber;
                            trigger: z.ZodString;
                            status: z.ZodEnum<{
                                failed: "failed";
                                success: "success";
                                partial: "partial";
                                skipped: "skipped";
                            }>;
                            startedAt: z.ZodString;
                            finishedAt: z.ZodString;
                            durationMs: z.ZodNullable<z.ZodNumber>;
                            errorSummary: z.ZodNullable<z.ZodString>;
                        }, z.core.$strip>>;
                        succeededAt: z.ZodNullable<z.ZodString>;
                        failedAt: z.ZodNullable<z.ZodString>;
                        lastErrorSummary: z.ZodNullable<z.ZodString>;
                        consecutiveFailures: z.ZodNumber;
                        syncUx: z.ZodObject<{
                            state: z.ZodEnum<{
                                healthy: "healthy";
                                syncing: "syncing";
                                catching_up: "catching_up";
                                retrying: "retrying";
                                attention: "attention";
                                setup: "setup";
                                off: "off";
                            }>;
                            label: z.ZodString;
                            headline: z.ZodString;
                            detail: z.ZodNullable<z.ZodString>;
                            progressLabel: z.ZodNullable<z.ZodString>;
                            nextRetryAt: z.ZodNullable<z.ZodString>;
                            updatedAt: z.ZodNullable<z.ZodString>;
                            requiresAction: z.ZodBoolean;
                        }, z.core.$strip>;
                    }, z.core.$strip>>;
                    syncUx: z.ZodObject<{
                        state: z.ZodEnum<{
                            healthy: "healthy";
                            syncing: "syncing";
                            catching_up: "catching_up";
                            retrying: "retrying";
                            attention: "attention";
                            setup: "setup";
                            off: "off";
                        }>;
                        label: z.ZodString;
                        headline: z.ZodString;
                        detail: z.ZodNullable<z.ZodString>;
                        progressLabel: z.ZodNullable<z.ZodString>;
                        nextRetryAt: z.ZodNullable<z.ZodString>;
                        updatedAt: z.ZodNullable<z.ZodString>;
                        requiresAction: z.ZodBoolean;
                    }, z.core.$strip>;
                }, z.core.$strip>>;
                recentEvents: z.ZodArray<z.ZodObject<{
                    id: z.ZodNumber;
                    runId: z.ZodNumber;
                    pageId: z.ZodNumber;
                    pageLabel: z.ZodString;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    stream: z.ZodEnum<{
                        subscribers: "subscribers";
                        light: "light";
                        followers: "followers";
                        fan_identities: "fan_identities";
                        transactions: "transactions";
                        top_spenders: "top_spenders";
                        dm_conversations: "dm_conversations";
                        dm_messages: "dm_messages";
                        followers_reconcile: "followers_reconcile";
                        fan_earnings: "fan_earnings";
                        purchase_history: "purchase_history";
                    }>;
                    eventType: z.ZodString;
                    severity: z.ZodEnum<{
                        info: "info";
                        warn: "warn";
                        error: "error";
                    }>;
                    message: z.ZodString;
                    details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                    emittedAt: z.ZodString;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly syncRequests: {
        readonly auth: {
            readonly kind: "session";
        };
        readonly tags: readonly ["dashboard"];
        readonly summary: "Get recent visible sync worker HTTP requests";
        readonly querystring: z.ZodObject<{
            since: z.ZodOptional<z.ZodString>;
            limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodArray<z.ZodObject<{
                timestamp: z.ZodString;
                pageLabel: z.ZodString;
                platform: z.ZodEnum<{
                    fansly: "fansly";
                    onlyfans: "onlyfans";
                }>;
                stream: z.ZodEnum<{
                    subscribers: "subscribers";
                    light: "light";
                    followers: "followers";
                    fan_identities: "fan_identities";
                    transactions: "transactions";
                    top_spenders: "top_spenders";
                    dm_conversations: "dm_conversations";
                    dm_messages: "dm_messages";
                    followers_reconcile: "followers_reconcile";
                    fan_earnings: "fan_earnings";
                    purchase_history: "purchase_history";
                }>;
                operation: z.ZodString;
                endpoint: z.ZodString;
                method: z.ZodString;
                attemptNumber: z.ZodNumber;
                status: z.ZodEnum<{
                    failed: "failed";
                    started: "started";
                    success: "success";
                    retry: "retry";
                }>;
                httpStatusCode: z.ZodNullable<z.ZodNumber>;
                durationMs: z.ZodNullable<z.ZodNumber>;
                rateLimitWaitMs: z.ZodNullable<z.ZodNumber>;
                groupId: z.ZodNullable<z.ZodString>;
                partnerUsername: z.ZodNullable<z.ZodString>;
                returnedItems: z.ZodNullable<z.ZodNumber>;
                syncDone: z.ZodNullable<z.ZodBoolean>;
                proxyGapMs: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strip>>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly syncOverview: {
        readonly auth: {
            readonly kind: "session";
        };
        readonly tags: readonly ["dashboard"];
        readonly summary: "Get the 6-block sync overview for visible pages";
        readonly response: {
            readonly 200: z.ZodObject<{
                generatedAt: z.ZodString;
                diagnosis: z.ZodNullable<z.ZodObject<{
                    code: z.ZodEnum<{
                        worker_offline: "worker_offline";
                        stalled_run: "stalled_run";
                        auth_blocked: "auth_blocked";
                    }>;
                    severity: z.ZodEnum<{
                        error: "error";
                        warning: "warning";
                    }>;
                    headline: z.ZodString;
                    detail: z.ZodString;
                    actionKind: z.ZodNullable<z.ZodEnum<{
                        worker: "worker";
                        credentials: "credentials";
                        sync_settings: "sync_settings";
                    }>>;
                }, z.core.$strip>>;
                pages: z.ZodArray<z.ZodObject<{
                    pageId: z.ZodNumber;
                    pageLabel: z.ZodString;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    modelSlug: z.ZodString;
                    modelName: z.ZodString;
                    username: z.ZodNullable<z.ZodString>;
                    displayName: z.ZodNullable<z.ZodString>;
                    diagnosis: z.ZodNullable<z.ZodObject<{
                        code: z.ZodEnum<{
                            worker_offline: "worker_offline";
                            stalled_run: "stalled_run";
                            auth_blocked: "auth_blocked";
                        }>;
                        severity: z.ZodEnum<{
                            error: "error";
                            warning: "warning";
                        }>;
                        headline: z.ZodString;
                        detail: z.ZodString;
                        actionKind: z.ZodNullable<z.ZodEnum<{
                            worker: "worker";
                            credentials: "credentials";
                            sync_settings: "sync_settings";
                        }>>;
                    }, z.core.$strip>>;
                    blocks: z.ZodObject<{
                        connection: z.ZodObject<{
                            block: z.ZodEnum<{
                                connection: "connection";
                                financials: "financials";
                                audience: "audience";
                                messages_live: "messages_live";
                                messages_history: "messages_history";
                            }>;
                            state: z.ZodEnum<{
                                failed: "failed";
                                syncing: "syncing";
                                retrying: "retrying";
                                paused: "paused";
                                not_started: "not_started";
                                scheduled: "scheduled";
                                backfilling: "backfilling";
                                up_to_date: "up_to_date";
                                delayed: "delayed";
                                not_available: "not_available";
                            }>;
                            succeededAt: z.ZodNullable<z.ZodString>;
                            progress: z.ZodNullable<z.ZodObject<{
                                label: z.ZodString;
                                current: z.ZodNumber;
                                total: z.ZodNullable<z.ZodNumber>;
                                unit: z.ZodString;
                                percent: z.ZodNullable<z.ZodNumber>;
                                details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                            }, z.core.$strip>>;
                            progressStream: z.ZodNullable<z.ZodString>;
                            progressRole: z.ZodNullable<z.ZodEnum<{
                                primary: "primary";
                                supporting: "supporting";
                            }>>;
                            error: z.ZodNullable<z.ZodObject<{
                                stream: z.ZodNullable<z.ZodString>;
                                code: z.ZodNullable<z.ZodString>;
                                summary: z.ZodNullable<z.ZodString>;
                                failedAt: z.ZodNullable<z.ZodString>;
                                consecutiveFailures: z.ZodNumber;
                            }, z.core.$strip>>;
                            statusReason: z.ZodNullable<z.ZodObject<{
                                code: z.ZodNullable<z.ZodString>;
                                summary: z.ZodNullable<z.ZodString>;
                                waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                            }, z.core.$strip>>;
                            primaryFresh: z.ZodBoolean;
                            needsAttention: z.ZodBoolean;
                            nextDueAt: z.ZodNullable<z.ZodString>;
                            nextRetryAt: z.ZodNullable<z.ZodString>;
                            intervals: z.ZodArray<z.ZodObject<{
                                stream: z.ZodEnum<{
                                    subscribers: "subscribers";
                                    light: "light";
                                    followers: "followers";
                                    fan_identities: "fan_identities";
                                    transactions: "transactions";
                                    top_spenders: "top_spenders";
                                    dm_conversations: "dm_conversations";
                                    dm_messages: "dm_messages";
                                    followers_reconcile: "followers_reconcile";
                                    fan_earnings: "fan_earnings";
                                    purchase_history: "purchase_history";
                                }>;
                                cadenceSeconds: z.ZodNumber;
                            }, z.core.$strip>>;
                            metrics: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                            connectionStatus: z.ZodNullable<z.ZodEnum<{
                                error: "error";
                                connected: "connected";
                                not_connected: "not_connected";
                            }>>;
                            substreams: z.ZodArray<z.ZodObject<{
                                stream: z.ZodEnum<{
                                    subscribers: "subscribers";
                                    light: "light";
                                    followers: "followers";
                                    fan_identities: "fan_identities";
                                    transactions: "transactions";
                                    top_spenders: "top_spenders";
                                    dm_conversations: "dm_conversations";
                                    dm_messages: "dm_messages";
                                    followers_reconcile: "followers_reconcile";
                                    fan_earnings: "fan_earnings";
                                    purchase_history: "purchase_history";
                                }>;
                                role: z.ZodEnum<{
                                    primary: "primary";
                                    supporting: "supporting";
                                }>;
                                state: z.ZodEnum<{
                                    failed: "failed";
                                    syncing: "syncing";
                                    retrying: "retrying";
                                    paused: "paused";
                                    not_started: "not_started";
                                    scheduled: "scheduled";
                                    backfilling: "backfilling";
                                    up_to_date: "up_to_date";
                                    delayed: "delayed";
                                }>;
                                succeededAt: z.ZodNullable<z.ZodString>;
                                nextDueAt: z.ZodNullable<z.ZodString>;
                                nextRetryAt: z.ZodNullable<z.ZodString>;
                                cadenceSeconds: z.ZodNumber;
                                isFresh: z.ZodBoolean;
                                needsAttention: z.ZodBoolean;
                                statusReason: z.ZodNullable<z.ZodObject<{
                                    code: z.ZodNullable<z.ZodString>;
                                    summary: z.ZodNullable<z.ZodString>;
                                    waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                                }, z.core.$strip>>;
                                error: z.ZodNullable<z.ZodObject<{
                                    stream: z.ZodNullable<z.ZodString>;
                                    code: z.ZodNullable<z.ZodString>;
                                    summary: z.ZodNullable<z.ZodString>;
                                    failedAt: z.ZodNullable<z.ZodString>;
                                    consecutiveFailures: z.ZodNumber;
                                }, z.core.$strip>>;
                            }, z.core.$strip>>;
                        }, z.core.$strip>;
                        financials: z.ZodObject<{
                            block: z.ZodEnum<{
                                connection: "connection";
                                financials: "financials";
                                audience: "audience";
                                messages_live: "messages_live";
                                messages_history: "messages_history";
                            }>;
                            state: z.ZodEnum<{
                                failed: "failed";
                                syncing: "syncing";
                                retrying: "retrying";
                                paused: "paused";
                                not_started: "not_started";
                                scheduled: "scheduled";
                                backfilling: "backfilling";
                                up_to_date: "up_to_date";
                                delayed: "delayed";
                                not_available: "not_available";
                            }>;
                            succeededAt: z.ZodNullable<z.ZodString>;
                            progress: z.ZodNullable<z.ZodObject<{
                                label: z.ZodString;
                                current: z.ZodNumber;
                                total: z.ZodNullable<z.ZodNumber>;
                                unit: z.ZodString;
                                percent: z.ZodNullable<z.ZodNumber>;
                                details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                            }, z.core.$strip>>;
                            progressStream: z.ZodNullable<z.ZodString>;
                            progressRole: z.ZodNullable<z.ZodEnum<{
                                primary: "primary";
                                supporting: "supporting";
                            }>>;
                            error: z.ZodNullable<z.ZodObject<{
                                stream: z.ZodNullable<z.ZodString>;
                                code: z.ZodNullable<z.ZodString>;
                                summary: z.ZodNullable<z.ZodString>;
                                failedAt: z.ZodNullable<z.ZodString>;
                                consecutiveFailures: z.ZodNumber;
                            }, z.core.$strip>>;
                            statusReason: z.ZodNullable<z.ZodObject<{
                                code: z.ZodNullable<z.ZodString>;
                                summary: z.ZodNullable<z.ZodString>;
                                waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                            }, z.core.$strip>>;
                            primaryFresh: z.ZodBoolean;
                            needsAttention: z.ZodBoolean;
                            nextDueAt: z.ZodNullable<z.ZodString>;
                            nextRetryAt: z.ZodNullable<z.ZodString>;
                            intervals: z.ZodArray<z.ZodObject<{
                                stream: z.ZodEnum<{
                                    subscribers: "subscribers";
                                    light: "light";
                                    followers: "followers";
                                    fan_identities: "fan_identities";
                                    transactions: "transactions";
                                    top_spenders: "top_spenders";
                                    dm_conversations: "dm_conversations";
                                    dm_messages: "dm_messages";
                                    followers_reconcile: "followers_reconcile";
                                    fan_earnings: "fan_earnings";
                                    purchase_history: "purchase_history";
                                }>;
                                cadenceSeconds: z.ZodNumber;
                            }, z.core.$strip>>;
                            metrics: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                            connectionStatus: z.ZodNullable<z.ZodEnum<{
                                error: "error";
                                connected: "connected";
                                not_connected: "not_connected";
                            }>>;
                            substreams: z.ZodArray<z.ZodObject<{
                                stream: z.ZodEnum<{
                                    subscribers: "subscribers";
                                    light: "light";
                                    followers: "followers";
                                    fan_identities: "fan_identities";
                                    transactions: "transactions";
                                    top_spenders: "top_spenders";
                                    dm_conversations: "dm_conversations";
                                    dm_messages: "dm_messages";
                                    followers_reconcile: "followers_reconcile";
                                    fan_earnings: "fan_earnings";
                                    purchase_history: "purchase_history";
                                }>;
                                role: z.ZodEnum<{
                                    primary: "primary";
                                    supporting: "supporting";
                                }>;
                                state: z.ZodEnum<{
                                    failed: "failed";
                                    syncing: "syncing";
                                    retrying: "retrying";
                                    paused: "paused";
                                    not_started: "not_started";
                                    scheduled: "scheduled";
                                    backfilling: "backfilling";
                                    up_to_date: "up_to_date";
                                    delayed: "delayed";
                                }>;
                                succeededAt: z.ZodNullable<z.ZodString>;
                                nextDueAt: z.ZodNullable<z.ZodString>;
                                nextRetryAt: z.ZodNullable<z.ZodString>;
                                cadenceSeconds: z.ZodNumber;
                                isFresh: z.ZodBoolean;
                                needsAttention: z.ZodBoolean;
                                statusReason: z.ZodNullable<z.ZodObject<{
                                    code: z.ZodNullable<z.ZodString>;
                                    summary: z.ZodNullable<z.ZodString>;
                                    waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                                }, z.core.$strip>>;
                                error: z.ZodNullable<z.ZodObject<{
                                    stream: z.ZodNullable<z.ZodString>;
                                    code: z.ZodNullable<z.ZodString>;
                                    summary: z.ZodNullable<z.ZodString>;
                                    failedAt: z.ZodNullable<z.ZodString>;
                                    consecutiveFailures: z.ZodNumber;
                                }, z.core.$strip>>;
                            }, z.core.$strip>>;
                        }, z.core.$strip>;
                        audience: z.ZodObject<{
                            block: z.ZodEnum<{
                                connection: "connection";
                                financials: "financials";
                                audience: "audience";
                                messages_live: "messages_live";
                                messages_history: "messages_history";
                            }>;
                            state: z.ZodEnum<{
                                failed: "failed";
                                syncing: "syncing";
                                retrying: "retrying";
                                paused: "paused";
                                not_started: "not_started";
                                scheduled: "scheduled";
                                backfilling: "backfilling";
                                up_to_date: "up_to_date";
                                delayed: "delayed";
                                not_available: "not_available";
                            }>;
                            succeededAt: z.ZodNullable<z.ZodString>;
                            progress: z.ZodNullable<z.ZodObject<{
                                label: z.ZodString;
                                current: z.ZodNumber;
                                total: z.ZodNullable<z.ZodNumber>;
                                unit: z.ZodString;
                                percent: z.ZodNullable<z.ZodNumber>;
                                details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                            }, z.core.$strip>>;
                            progressStream: z.ZodNullable<z.ZodString>;
                            progressRole: z.ZodNullable<z.ZodEnum<{
                                primary: "primary";
                                supporting: "supporting";
                            }>>;
                            error: z.ZodNullable<z.ZodObject<{
                                stream: z.ZodNullable<z.ZodString>;
                                code: z.ZodNullable<z.ZodString>;
                                summary: z.ZodNullable<z.ZodString>;
                                failedAt: z.ZodNullable<z.ZodString>;
                                consecutiveFailures: z.ZodNumber;
                            }, z.core.$strip>>;
                            statusReason: z.ZodNullable<z.ZodObject<{
                                code: z.ZodNullable<z.ZodString>;
                                summary: z.ZodNullable<z.ZodString>;
                                waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                            }, z.core.$strip>>;
                            primaryFresh: z.ZodBoolean;
                            needsAttention: z.ZodBoolean;
                            nextDueAt: z.ZodNullable<z.ZodString>;
                            nextRetryAt: z.ZodNullable<z.ZodString>;
                            intervals: z.ZodArray<z.ZodObject<{
                                stream: z.ZodEnum<{
                                    subscribers: "subscribers";
                                    light: "light";
                                    followers: "followers";
                                    fan_identities: "fan_identities";
                                    transactions: "transactions";
                                    top_spenders: "top_spenders";
                                    dm_conversations: "dm_conversations";
                                    dm_messages: "dm_messages";
                                    followers_reconcile: "followers_reconcile";
                                    fan_earnings: "fan_earnings";
                                    purchase_history: "purchase_history";
                                }>;
                                cadenceSeconds: z.ZodNumber;
                            }, z.core.$strip>>;
                            metrics: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                            connectionStatus: z.ZodNullable<z.ZodEnum<{
                                error: "error";
                                connected: "connected";
                                not_connected: "not_connected";
                            }>>;
                            substreams: z.ZodArray<z.ZodObject<{
                                stream: z.ZodEnum<{
                                    subscribers: "subscribers";
                                    light: "light";
                                    followers: "followers";
                                    fan_identities: "fan_identities";
                                    transactions: "transactions";
                                    top_spenders: "top_spenders";
                                    dm_conversations: "dm_conversations";
                                    dm_messages: "dm_messages";
                                    followers_reconcile: "followers_reconcile";
                                    fan_earnings: "fan_earnings";
                                    purchase_history: "purchase_history";
                                }>;
                                role: z.ZodEnum<{
                                    primary: "primary";
                                    supporting: "supporting";
                                }>;
                                state: z.ZodEnum<{
                                    failed: "failed";
                                    syncing: "syncing";
                                    retrying: "retrying";
                                    paused: "paused";
                                    not_started: "not_started";
                                    scheduled: "scheduled";
                                    backfilling: "backfilling";
                                    up_to_date: "up_to_date";
                                    delayed: "delayed";
                                }>;
                                succeededAt: z.ZodNullable<z.ZodString>;
                                nextDueAt: z.ZodNullable<z.ZodString>;
                                nextRetryAt: z.ZodNullable<z.ZodString>;
                                cadenceSeconds: z.ZodNumber;
                                isFresh: z.ZodBoolean;
                                needsAttention: z.ZodBoolean;
                                statusReason: z.ZodNullable<z.ZodObject<{
                                    code: z.ZodNullable<z.ZodString>;
                                    summary: z.ZodNullable<z.ZodString>;
                                    waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                                }, z.core.$strip>>;
                                error: z.ZodNullable<z.ZodObject<{
                                    stream: z.ZodNullable<z.ZodString>;
                                    code: z.ZodNullable<z.ZodString>;
                                    summary: z.ZodNullable<z.ZodString>;
                                    failedAt: z.ZodNullable<z.ZodString>;
                                    consecutiveFailures: z.ZodNumber;
                                }, z.core.$strip>>;
                            }, z.core.$strip>>;
                        }, z.core.$strip>;
                        messages_live: z.ZodObject<{
                            block: z.ZodEnum<{
                                connection: "connection";
                                financials: "financials";
                                audience: "audience";
                                messages_live: "messages_live";
                                messages_history: "messages_history";
                            }>;
                            state: z.ZodEnum<{
                                failed: "failed";
                                syncing: "syncing";
                                retrying: "retrying";
                                paused: "paused";
                                not_started: "not_started";
                                scheduled: "scheduled";
                                backfilling: "backfilling";
                                up_to_date: "up_to_date";
                                delayed: "delayed";
                                not_available: "not_available";
                            }>;
                            succeededAt: z.ZodNullable<z.ZodString>;
                            progress: z.ZodNullable<z.ZodObject<{
                                label: z.ZodString;
                                current: z.ZodNumber;
                                total: z.ZodNullable<z.ZodNumber>;
                                unit: z.ZodString;
                                percent: z.ZodNullable<z.ZodNumber>;
                                details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                            }, z.core.$strip>>;
                            progressStream: z.ZodNullable<z.ZodString>;
                            progressRole: z.ZodNullable<z.ZodEnum<{
                                primary: "primary";
                                supporting: "supporting";
                            }>>;
                            error: z.ZodNullable<z.ZodObject<{
                                stream: z.ZodNullable<z.ZodString>;
                                code: z.ZodNullable<z.ZodString>;
                                summary: z.ZodNullable<z.ZodString>;
                                failedAt: z.ZodNullable<z.ZodString>;
                                consecutiveFailures: z.ZodNumber;
                            }, z.core.$strip>>;
                            statusReason: z.ZodNullable<z.ZodObject<{
                                code: z.ZodNullable<z.ZodString>;
                                summary: z.ZodNullable<z.ZodString>;
                                waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                            }, z.core.$strip>>;
                            primaryFresh: z.ZodBoolean;
                            needsAttention: z.ZodBoolean;
                            nextDueAt: z.ZodNullable<z.ZodString>;
                            nextRetryAt: z.ZodNullable<z.ZodString>;
                            intervals: z.ZodArray<z.ZodObject<{
                                stream: z.ZodEnum<{
                                    subscribers: "subscribers";
                                    light: "light";
                                    followers: "followers";
                                    fan_identities: "fan_identities";
                                    transactions: "transactions";
                                    top_spenders: "top_spenders";
                                    dm_conversations: "dm_conversations";
                                    dm_messages: "dm_messages";
                                    followers_reconcile: "followers_reconcile";
                                    fan_earnings: "fan_earnings";
                                    purchase_history: "purchase_history";
                                }>;
                                cadenceSeconds: z.ZodNumber;
                            }, z.core.$strip>>;
                            metrics: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                            connectionStatus: z.ZodNullable<z.ZodEnum<{
                                error: "error";
                                connected: "connected";
                                not_connected: "not_connected";
                            }>>;
                            substreams: z.ZodArray<z.ZodObject<{
                                stream: z.ZodEnum<{
                                    subscribers: "subscribers";
                                    light: "light";
                                    followers: "followers";
                                    fan_identities: "fan_identities";
                                    transactions: "transactions";
                                    top_spenders: "top_spenders";
                                    dm_conversations: "dm_conversations";
                                    dm_messages: "dm_messages";
                                    followers_reconcile: "followers_reconcile";
                                    fan_earnings: "fan_earnings";
                                    purchase_history: "purchase_history";
                                }>;
                                role: z.ZodEnum<{
                                    primary: "primary";
                                    supporting: "supporting";
                                }>;
                                state: z.ZodEnum<{
                                    failed: "failed";
                                    syncing: "syncing";
                                    retrying: "retrying";
                                    paused: "paused";
                                    not_started: "not_started";
                                    scheduled: "scheduled";
                                    backfilling: "backfilling";
                                    up_to_date: "up_to_date";
                                    delayed: "delayed";
                                }>;
                                succeededAt: z.ZodNullable<z.ZodString>;
                                nextDueAt: z.ZodNullable<z.ZodString>;
                                nextRetryAt: z.ZodNullable<z.ZodString>;
                                cadenceSeconds: z.ZodNumber;
                                isFresh: z.ZodBoolean;
                                needsAttention: z.ZodBoolean;
                                statusReason: z.ZodNullable<z.ZodObject<{
                                    code: z.ZodNullable<z.ZodString>;
                                    summary: z.ZodNullable<z.ZodString>;
                                    waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                                }, z.core.$strip>>;
                                error: z.ZodNullable<z.ZodObject<{
                                    stream: z.ZodNullable<z.ZodString>;
                                    code: z.ZodNullable<z.ZodString>;
                                    summary: z.ZodNullable<z.ZodString>;
                                    failedAt: z.ZodNullable<z.ZodString>;
                                    consecutiveFailures: z.ZodNumber;
                                }, z.core.$strip>>;
                            }, z.core.$strip>>;
                        }, z.core.$strip>;
                        messages_history: z.ZodObject<{
                            block: z.ZodEnum<{
                                connection: "connection";
                                financials: "financials";
                                audience: "audience";
                                messages_live: "messages_live";
                                messages_history: "messages_history";
                            }>;
                            state: z.ZodEnum<{
                                failed: "failed";
                                syncing: "syncing";
                                retrying: "retrying";
                                paused: "paused";
                                not_started: "not_started";
                                scheduled: "scheduled";
                                backfilling: "backfilling";
                                up_to_date: "up_to_date";
                                delayed: "delayed";
                                not_available: "not_available";
                            }>;
                            succeededAt: z.ZodNullable<z.ZodString>;
                            progress: z.ZodNullable<z.ZodObject<{
                                label: z.ZodString;
                                current: z.ZodNumber;
                                total: z.ZodNullable<z.ZodNumber>;
                                unit: z.ZodString;
                                percent: z.ZodNullable<z.ZodNumber>;
                                details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                            }, z.core.$strip>>;
                            progressStream: z.ZodNullable<z.ZodString>;
                            progressRole: z.ZodNullable<z.ZodEnum<{
                                primary: "primary";
                                supporting: "supporting";
                            }>>;
                            error: z.ZodNullable<z.ZodObject<{
                                stream: z.ZodNullable<z.ZodString>;
                                code: z.ZodNullable<z.ZodString>;
                                summary: z.ZodNullable<z.ZodString>;
                                failedAt: z.ZodNullable<z.ZodString>;
                                consecutiveFailures: z.ZodNumber;
                            }, z.core.$strip>>;
                            statusReason: z.ZodNullable<z.ZodObject<{
                                code: z.ZodNullable<z.ZodString>;
                                summary: z.ZodNullable<z.ZodString>;
                                waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                            }, z.core.$strip>>;
                            primaryFresh: z.ZodBoolean;
                            needsAttention: z.ZodBoolean;
                            nextDueAt: z.ZodNullable<z.ZodString>;
                            nextRetryAt: z.ZodNullable<z.ZodString>;
                            intervals: z.ZodArray<z.ZodObject<{
                                stream: z.ZodEnum<{
                                    subscribers: "subscribers";
                                    light: "light";
                                    followers: "followers";
                                    fan_identities: "fan_identities";
                                    transactions: "transactions";
                                    top_spenders: "top_spenders";
                                    dm_conversations: "dm_conversations";
                                    dm_messages: "dm_messages";
                                    followers_reconcile: "followers_reconcile";
                                    fan_earnings: "fan_earnings";
                                    purchase_history: "purchase_history";
                                }>;
                                cadenceSeconds: z.ZodNumber;
                            }, z.core.$strip>>;
                            metrics: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                            connectionStatus: z.ZodNullable<z.ZodEnum<{
                                error: "error";
                                connected: "connected";
                                not_connected: "not_connected";
                            }>>;
                            substreams: z.ZodArray<z.ZodObject<{
                                stream: z.ZodEnum<{
                                    subscribers: "subscribers";
                                    light: "light";
                                    followers: "followers";
                                    fan_identities: "fan_identities";
                                    transactions: "transactions";
                                    top_spenders: "top_spenders";
                                    dm_conversations: "dm_conversations";
                                    dm_messages: "dm_messages";
                                    followers_reconcile: "followers_reconcile";
                                    fan_earnings: "fan_earnings";
                                    purchase_history: "purchase_history";
                                }>;
                                role: z.ZodEnum<{
                                    primary: "primary";
                                    supporting: "supporting";
                                }>;
                                state: z.ZodEnum<{
                                    failed: "failed";
                                    syncing: "syncing";
                                    retrying: "retrying";
                                    paused: "paused";
                                    not_started: "not_started";
                                    scheduled: "scheduled";
                                    backfilling: "backfilling";
                                    up_to_date: "up_to_date";
                                    delayed: "delayed";
                                }>;
                                succeededAt: z.ZodNullable<z.ZodString>;
                                nextDueAt: z.ZodNullable<z.ZodString>;
                                nextRetryAt: z.ZodNullable<z.ZodString>;
                                cadenceSeconds: z.ZodNumber;
                                isFresh: z.ZodBoolean;
                                needsAttention: z.ZodBoolean;
                                statusReason: z.ZodNullable<z.ZodObject<{
                                    code: z.ZodNullable<z.ZodString>;
                                    summary: z.ZodNullable<z.ZodString>;
                                    waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                                }, z.core.$strip>>;
                                error: z.ZodNullable<z.ZodObject<{
                                    stream: z.ZodNullable<z.ZodString>;
                                    code: z.ZodNullable<z.ZodString>;
                                    summary: z.ZodNullable<z.ZodString>;
                                    failedAt: z.ZodNullable<z.ZodString>;
                                    consecutiveFailures: z.ZodNumber;
                                }, z.core.$strip>>;
                            }, z.core.$strip>>;
                        }, z.core.$strip>;
                    }, z.core.$strip>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly pageSyncBlocks: {
        readonly auth: {
            readonly kind: "any";
            readonly scope: "page";
        };
        readonly tags: readonly ["dashboard"];
        readonly summary: "Get all sync blocks for one visible page";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                generatedAt: z.ZodString;
                page: z.ZodObject<{
                    pageId: z.ZodNumber;
                    pageLabel: z.ZodString;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    modelSlug: z.ZodString;
                    modelName: z.ZodString;
                    username: z.ZodNullable<z.ZodString>;
                    displayName: z.ZodNullable<z.ZodString>;
                    diagnosis: z.ZodNullable<z.ZodObject<{
                        code: z.ZodEnum<{
                            worker_offline: "worker_offline";
                            stalled_run: "stalled_run";
                            auth_blocked: "auth_blocked";
                        }>;
                        severity: z.ZodEnum<{
                            error: "error";
                            warning: "warning";
                        }>;
                        headline: z.ZodString;
                        detail: z.ZodString;
                        actionKind: z.ZodNullable<z.ZodEnum<{
                            worker: "worker";
                            credentials: "credentials";
                            sync_settings: "sync_settings";
                        }>>;
                    }, z.core.$strip>>;
                    blocks: z.ZodObject<{
                        connection: z.ZodObject<{
                            block: z.ZodEnum<{
                                connection: "connection";
                                financials: "financials";
                                audience: "audience";
                                messages_live: "messages_live";
                                messages_history: "messages_history";
                            }>;
                            state: z.ZodEnum<{
                                failed: "failed";
                                syncing: "syncing";
                                retrying: "retrying";
                                paused: "paused";
                                not_started: "not_started";
                                scheduled: "scheduled";
                                backfilling: "backfilling";
                                up_to_date: "up_to_date";
                                delayed: "delayed";
                                not_available: "not_available";
                            }>;
                            succeededAt: z.ZodNullable<z.ZodString>;
                            progress: z.ZodNullable<z.ZodObject<{
                                label: z.ZodString;
                                current: z.ZodNumber;
                                total: z.ZodNullable<z.ZodNumber>;
                                unit: z.ZodString;
                                percent: z.ZodNullable<z.ZodNumber>;
                                details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                            }, z.core.$strip>>;
                            progressStream: z.ZodNullable<z.ZodString>;
                            progressRole: z.ZodNullable<z.ZodEnum<{
                                primary: "primary";
                                supporting: "supporting";
                            }>>;
                            error: z.ZodNullable<z.ZodObject<{
                                stream: z.ZodNullable<z.ZodString>;
                                code: z.ZodNullable<z.ZodString>;
                                summary: z.ZodNullable<z.ZodString>;
                                failedAt: z.ZodNullable<z.ZodString>;
                                consecutiveFailures: z.ZodNumber;
                            }, z.core.$strip>>;
                            statusReason: z.ZodNullable<z.ZodObject<{
                                code: z.ZodNullable<z.ZodString>;
                                summary: z.ZodNullable<z.ZodString>;
                                waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                            }, z.core.$strip>>;
                            primaryFresh: z.ZodBoolean;
                            needsAttention: z.ZodBoolean;
                            nextDueAt: z.ZodNullable<z.ZodString>;
                            nextRetryAt: z.ZodNullable<z.ZodString>;
                            intervals: z.ZodArray<z.ZodObject<{
                                stream: z.ZodEnum<{
                                    subscribers: "subscribers";
                                    light: "light";
                                    followers: "followers";
                                    fan_identities: "fan_identities";
                                    transactions: "transactions";
                                    top_spenders: "top_spenders";
                                    dm_conversations: "dm_conversations";
                                    dm_messages: "dm_messages";
                                    followers_reconcile: "followers_reconcile";
                                    fan_earnings: "fan_earnings";
                                    purchase_history: "purchase_history";
                                }>;
                                cadenceSeconds: z.ZodNumber;
                            }, z.core.$strip>>;
                            metrics: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                            connectionStatus: z.ZodNullable<z.ZodEnum<{
                                error: "error";
                                connected: "connected";
                                not_connected: "not_connected";
                            }>>;
                            substreams: z.ZodArray<z.ZodObject<{
                                stream: z.ZodEnum<{
                                    subscribers: "subscribers";
                                    light: "light";
                                    followers: "followers";
                                    fan_identities: "fan_identities";
                                    transactions: "transactions";
                                    top_spenders: "top_spenders";
                                    dm_conversations: "dm_conversations";
                                    dm_messages: "dm_messages";
                                    followers_reconcile: "followers_reconcile";
                                    fan_earnings: "fan_earnings";
                                    purchase_history: "purchase_history";
                                }>;
                                role: z.ZodEnum<{
                                    primary: "primary";
                                    supporting: "supporting";
                                }>;
                                state: z.ZodEnum<{
                                    failed: "failed";
                                    syncing: "syncing";
                                    retrying: "retrying";
                                    paused: "paused";
                                    not_started: "not_started";
                                    scheduled: "scheduled";
                                    backfilling: "backfilling";
                                    up_to_date: "up_to_date";
                                    delayed: "delayed";
                                }>;
                                succeededAt: z.ZodNullable<z.ZodString>;
                                nextDueAt: z.ZodNullable<z.ZodString>;
                                nextRetryAt: z.ZodNullable<z.ZodString>;
                                cadenceSeconds: z.ZodNumber;
                                isFresh: z.ZodBoolean;
                                needsAttention: z.ZodBoolean;
                                statusReason: z.ZodNullable<z.ZodObject<{
                                    code: z.ZodNullable<z.ZodString>;
                                    summary: z.ZodNullable<z.ZodString>;
                                    waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                                }, z.core.$strip>>;
                                error: z.ZodNullable<z.ZodObject<{
                                    stream: z.ZodNullable<z.ZodString>;
                                    code: z.ZodNullable<z.ZodString>;
                                    summary: z.ZodNullable<z.ZodString>;
                                    failedAt: z.ZodNullable<z.ZodString>;
                                    consecutiveFailures: z.ZodNumber;
                                }, z.core.$strip>>;
                            }, z.core.$strip>>;
                        }, z.core.$strip>;
                        financials: z.ZodObject<{
                            block: z.ZodEnum<{
                                connection: "connection";
                                financials: "financials";
                                audience: "audience";
                                messages_live: "messages_live";
                                messages_history: "messages_history";
                            }>;
                            state: z.ZodEnum<{
                                failed: "failed";
                                syncing: "syncing";
                                retrying: "retrying";
                                paused: "paused";
                                not_started: "not_started";
                                scheduled: "scheduled";
                                backfilling: "backfilling";
                                up_to_date: "up_to_date";
                                delayed: "delayed";
                                not_available: "not_available";
                            }>;
                            succeededAt: z.ZodNullable<z.ZodString>;
                            progress: z.ZodNullable<z.ZodObject<{
                                label: z.ZodString;
                                current: z.ZodNumber;
                                total: z.ZodNullable<z.ZodNumber>;
                                unit: z.ZodString;
                                percent: z.ZodNullable<z.ZodNumber>;
                                details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                            }, z.core.$strip>>;
                            progressStream: z.ZodNullable<z.ZodString>;
                            progressRole: z.ZodNullable<z.ZodEnum<{
                                primary: "primary";
                                supporting: "supporting";
                            }>>;
                            error: z.ZodNullable<z.ZodObject<{
                                stream: z.ZodNullable<z.ZodString>;
                                code: z.ZodNullable<z.ZodString>;
                                summary: z.ZodNullable<z.ZodString>;
                                failedAt: z.ZodNullable<z.ZodString>;
                                consecutiveFailures: z.ZodNumber;
                            }, z.core.$strip>>;
                            statusReason: z.ZodNullable<z.ZodObject<{
                                code: z.ZodNullable<z.ZodString>;
                                summary: z.ZodNullable<z.ZodString>;
                                waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                            }, z.core.$strip>>;
                            primaryFresh: z.ZodBoolean;
                            needsAttention: z.ZodBoolean;
                            nextDueAt: z.ZodNullable<z.ZodString>;
                            nextRetryAt: z.ZodNullable<z.ZodString>;
                            intervals: z.ZodArray<z.ZodObject<{
                                stream: z.ZodEnum<{
                                    subscribers: "subscribers";
                                    light: "light";
                                    followers: "followers";
                                    fan_identities: "fan_identities";
                                    transactions: "transactions";
                                    top_spenders: "top_spenders";
                                    dm_conversations: "dm_conversations";
                                    dm_messages: "dm_messages";
                                    followers_reconcile: "followers_reconcile";
                                    fan_earnings: "fan_earnings";
                                    purchase_history: "purchase_history";
                                }>;
                                cadenceSeconds: z.ZodNumber;
                            }, z.core.$strip>>;
                            metrics: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                            connectionStatus: z.ZodNullable<z.ZodEnum<{
                                error: "error";
                                connected: "connected";
                                not_connected: "not_connected";
                            }>>;
                            substreams: z.ZodArray<z.ZodObject<{
                                stream: z.ZodEnum<{
                                    subscribers: "subscribers";
                                    light: "light";
                                    followers: "followers";
                                    fan_identities: "fan_identities";
                                    transactions: "transactions";
                                    top_spenders: "top_spenders";
                                    dm_conversations: "dm_conversations";
                                    dm_messages: "dm_messages";
                                    followers_reconcile: "followers_reconcile";
                                    fan_earnings: "fan_earnings";
                                    purchase_history: "purchase_history";
                                }>;
                                role: z.ZodEnum<{
                                    primary: "primary";
                                    supporting: "supporting";
                                }>;
                                state: z.ZodEnum<{
                                    failed: "failed";
                                    syncing: "syncing";
                                    retrying: "retrying";
                                    paused: "paused";
                                    not_started: "not_started";
                                    scheduled: "scheduled";
                                    backfilling: "backfilling";
                                    up_to_date: "up_to_date";
                                    delayed: "delayed";
                                }>;
                                succeededAt: z.ZodNullable<z.ZodString>;
                                nextDueAt: z.ZodNullable<z.ZodString>;
                                nextRetryAt: z.ZodNullable<z.ZodString>;
                                cadenceSeconds: z.ZodNumber;
                                isFresh: z.ZodBoolean;
                                needsAttention: z.ZodBoolean;
                                statusReason: z.ZodNullable<z.ZodObject<{
                                    code: z.ZodNullable<z.ZodString>;
                                    summary: z.ZodNullable<z.ZodString>;
                                    waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                                }, z.core.$strip>>;
                                error: z.ZodNullable<z.ZodObject<{
                                    stream: z.ZodNullable<z.ZodString>;
                                    code: z.ZodNullable<z.ZodString>;
                                    summary: z.ZodNullable<z.ZodString>;
                                    failedAt: z.ZodNullable<z.ZodString>;
                                    consecutiveFailures: z.ZodNumber;
                                }, z.core.$strip>>;
                            }, z.core.$strip>>;
                        }, z.core.$strip>;
                        audience: z.ZodObject<{
                            block: z.ZodEnum<{
                                connection: "connection";
                                financials: "financials";
                                audience: "audience";
                                messages_live: "messages_live";
                                messages_history: "messages_history";
                            }>;
                            state: z.ZodEnum<{
                                failed: "failed";
                                syncing: "syncing";
                                retrying: "retrying";
                                paused: "paused";
                                not_started: "not_started";
                                scheduled: "scheduled";
                                backfilling: "backfilling";
                                up_to_date: "up_to_date";
                                delayed: "delayed";
                                not_available: "not_available";
                            }>;
                            succeededAt: z.ZodNullable<z.ZodString>;
                            progress: z.ZodNullable<z.ZodObject<{
                                label: z.ZodString;
                                current: z.ZodNumber;
                                total: z.ZodNullable<z.ZodNumber>;
                                unit: z.ZodString;
                                percent: z.ZodNullable<z.ZodNumber>;
                                details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                            }, z.core.$strip>>;
                            progressStream: z.ZodNullable<z.ZodString>;
                            progressRole: z.ZodNullable<z.ZodEnum<{
                                primary: "primary";
                                supporting: "supporting";
                            }>>;
                            error: z.ZodNullable<z.ZodObject<{
                                stream: z.ZodNullable<z.ZodString>;
                                code: z.ZodNullable<z.ZodString>;
                                summary: z.ZodNullable<z.ZodString>;
                                failedAt: z.ZodNullable<z.ZodString>;
                                consecutiveFailures: z.ZodNumber;
                            }, z.core.$strip>>;
                            statusReason: z.ZodNullable<z.ZodObject<{
                                code: z.ZodNullable<z.ZodString>;
                                summary: z.ZodNullable<z.ZodString>;
                                waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                            }, z.core.$strip>>;
                            primaryFresh: z.ZodBoolean;
                            needsAttention: z.ZodBoolean;
                            nextDueAt: z.ZodNullable<z.ZodString>;
                            nextRetryAt: z.ZodNullable<z.ZodString>;
                            intervals: z.ZodArray<z.ZodObject<{
                                stream: z.ZodEnum<{
                                    subscribers: "subscribers";
                                    light: "light";
                                    followers: "followers";
                                    fan_identities: "fan_identities";
                                    transactions: "transactions";
                                    top_spenders: "top_spenders";
                                    dm_conversations: "dm_conversations";
                                    dm_messages: "dm_messages";
                                    followers_reconcile: "followers_reconcile";
                                    fan_earnings: "fan_earnings";
                                    purchase_history: "purchase_history";
                                }>;
                                cadenceSeconds: z.ZodNumber;
                            }, z.core.$strip>>;
                            metrics: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                            connectionStatus: z.ZodNullable<z.ZodEnum<{
                                error: "error";
                                connected: "connected";
                                not_connected: "not_connected";
                            }>>;
                            substreams: z.ZodArray<z.ZodObject<{
                                stream: z.ZodEnum<{
                                    subscribers: "subscribers";
                                    light: "light";
                                    followers: "followers";
                                    fan_identities: "fan_identities";
                                    transactions: "transactions";
                                    top_spenders: "top_spenders";
                                    dm_conversations: "dm_conversations";
                                    dm_messages: "dm_messages";
                                    followers_reconcile: "followers_reconcile";
                                    fan_earnings: "fan_earnings";
                                    purchase_history: "purchase_history";
                                }>;
                                role: z.ZodEnum<{
                                    primary: "primary";
                                    supporting: "supporting";
                                }>;
                                state: z.ZodEnum<{
                                    failed: "failed";
                                    syncing: "syncing";
                                    retrying: "retrying";
                                    paused: "paused";
                                    not_started: "not_started";
                                    scheduled: "scheduled";
                                    backfilling: "backfilling";
                                    up_to_date: "up_to_date";
                                    delayed: "delayed";
                                }>;
                                succeededAt: z.ZodNullable<z.ZodString>;
                                nextDueAt: z.ZodNullable<z.ZodString>;
                                nextRetryAt: z.ZodNullable<z.ZodString>;
                                cadenceSeconds: z.ZodNumber;
                                isFresh: z.ZodBoolean;
                                needsAttention: z.ZodBoolean;
                                statusReason: z.ZodNullable<z.ZodObject<{
                                    code: z.ZodNullable<z.ZodString>;
                                    summary: z.ZodNullable<z.ZodString>;
                                    waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                                }, z.core.$strip>>;
                                error: z.ZodNullable<z.ZodObject<{
                                    stream: z.ZodNullable<z.ZodString>;
                                    code: z.ZodNullable<z.ZodString>;
                                    summary: z.ZodNullable<z.ZodString>;
                                    failedAt: z.ZodNullable<z.ZodString>;
                                    consecutiveFailures: z.ZodNumber;
                                }, z.core.$strip>>;
                            }, z.core.$strip>>;
                        }, z.core.$strip>;
                        messages_live: z.ZodObject<{
                            block: z.ZodEnum<{
                                connection: "connection";
                                financials: "financials";
                                audience: "audience";
                                messages_live: "messages_live";
                                messages_history: "messages_history";
                            }>;
                            state: z.ZodEnum<{
                                failed: "failed";
                                syncing: "syncing";
                                retrying: "retrying";
                                paused: "paused";
                                not_started: "not_started";
                                scheduled: "scheduled";
                                backfilling: "backfilling";
                                up_to_date: "up_to_date";
                                delayed: "delayed";
                                not_available: "not_available";
                            }>;
                            succeededAt: z.ZodNullable<z.ZodString>;
                            progress: z.ZodNullable<z.ZodObject<{
                                label: z.ZodString;
                                current: z.ZodNumber;
                                total: z.ZodNullable<z.ZodNumber>;
                                unit: z.ZodString;
                                percent: z.ZodNullable<z.ZodNumber>;
                                details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                            }, z.core.$strip>>;
                            progressStream: z.ZodNullable<z.ZodString>;
                            progressRole: z.ZodNullable<z.ZodEnum<{
                                primary: "primary";
                                supporting: "supporting";
                            }>>;
                            error: z.ZodNullable<z.ZodObject<{
                                stream: z.ZodNullable<z.ZodString>;
                                code: z.ZodNullable<z.ZodString>;
                                summary: z.ZodNullable<z.ZodString>;
                                failedAt: z.ZodNullable<z.ZodString>;
                                consecutiveFailures: z.ZodNumber;
                            }, z.core.$strip>>;
                            statusReason: z.ZodNullable<z.ZodObject<{
                                code: z.ZodNullable<z.ZodString>;
                                summary: z.ZodNullable<z.ZodString>;
                                waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                            }, z.core.$strip>>;
                            primaryFresh: z.ZodBoolean;
                            needsAttention: z.ZodBoolean;
                            nextDueAt: z.ZodNullable<z.ZodString>;
                            nextRetryAt: z.ZodNullable<z.ZodString>;
                            intervals: z.ZodArray<z.ZodObject<{
                                stream: z.ZodEnum<{
                                    subscribers: "subscribers";
                                    light: "light";
                                    followers: "followers";
                                    fan_identities: "fan_identities";
                                    transactions: "transactions";
                                    top_spenders: "top_spenders";
                                    dm_conversations: "dm_conversations";
                                    dm_messages: "dm_messages";
                                    followers_reconcile: "followers_reconcile";
                                    fan_earnings: "fan_earnings";
                                    purchase_history: "purchase_history";
                                }>;
                                cadenceSeconds: z.ZodNumber;
                            }, z.core.$strip>>;
                            metrics: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                            connectionStatus: z.ZodNullable<z.ZodEnum<{
                                error: "error";
                                connected: "connected";
                                not_connected: "not_connected";
                            }>>;
                            substreams: z.ZodArray<z.ZodObject<{
                                stream: z.ZodEnum<{
                                    subscribers: "subscribers";
                                    light: "light";
                                    followers: "followers";
                                    fan_identities: "fan_identities";
                                    transactions: "transactions";
                                    top_spenders: "top_spenders";
                                    dm_conversations: "dm_conversations";
                                    dm_messages: "dm_messages";
                                    followers_reconcile: "followers_reconcile";
                                    fan_earnings: "fan_earnings";
                                    purchase_history: "purchase_history";
                                }>;
                                role: z.ZodEnum<{
                                    primary: "primary";
                                    supporting: "supporting";
                                }>;
                                state: z.ZodEnum<{
                                    failed: "failed";
                                    syncing: "syncing";
                                    retrying: "retrying";
                                    paused: "paused";
                                    not_started: "not_started";
                                    scheduled: "scheduled";
                                    backfilling: "backfilling";
                                    up_to_date: "up_to_date";
                                    delayed: "delayed";
                                }>;
                                succeededAt: z.ZodNullable<z.ZodString>;
                                nextDueAt: z.ZodNullable<z.ZodString>;
                                nextRetryAt: z.ZodNullable<z.ZodString>;
                                cadenceSeconds: z.ZodNumber;
                                isFresh: z.ZodBoolean;
                                needsAttention: z.ZodBoolean;
                                statusReason: z.ZodNullable<z.ZodObject<{
                                    code: z.ZodNullable<z.ZodString>;
                                    summary: z.ZodNullable<z.ZodString>;
                                    waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                                }, z.core.$strip>>;
                                error: z.ZodNullable<z.ZodObject<{
                                    stream: z.ZodNullable<z.ZodString>;
                                    code: z.ZodNullable<z.ZodString>;
                                    summary: z.ZodNullable<z.ZodString>;
                                    failedAt: z.ZodNullable<z.ZodString>;
                                    consecutiveFailures: z.ZodNumber;
                                }, z.core.$strip>>;
                            }, z.core.$strip>>;
                        }, z.core.$strip>;
                        messages_history: z.ZodObject<{
                            block: z.ZodEnum<{
                                connection: "connection";
                                financials: "financials";
                                audience: "audience";
                                messages_live: "messages_live";
                                messages_history: "messages_history";
                            }>;
                            state: z.ZodEnum<{
                                failed: "failed";
                                syncing: "syncing";
                                retrying: "retrying";
                                paused: "paused";
                                not_started: "not_started";
                                scheduled: "scheduled";
                                backfilling: "backfilling";
                                up_to_date: "up_to_date";
                                delayed: "delayed";
                                not_available: "not_available";
                            }>;
                            succeededAt: z.ZodNullable<z.ZodString>;
                            progress: z.ZodNullable<z.ZodObject<{
                                label: z.ZodString;
                                current: z.ZodNumber;
                                total: z.ZodNullable<z.ZodNumber>;
                                unit: z.ZodString;
                                percent: z.ZodNullable<z.ZodNumber>;
                                details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                            }, z.core.$strip>>;
                            progressStream: z.ZodNullable<z.ZodString>;
                            progressRole: z.ZodNullable<z.ZodEnum<{
                                primary: "primary";
                                supporting: "supporting";
                            }>>;
                            error: z.ZodNullable<z.ZodObject<{
                                stream: z.ZodNullable<z.ZodString>;
                                code: z.ZodNullable<z.ZodString>;
                                summary: z.ZodNullable<z.ZodString>;
                                failedAt: z.ZodNullable<z.ZodString>;
                                consecutiveFailures: z.ZodNumber;
                            }, z.core.$strip>>;
                            statusReason: z.ZodNullable<z.ZodObject<{
                                code: z.ZodNullable<z.ZodString>;
                                summary: z.ZodNullable<z.ZodString>;
                                waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                            }, z.core.$strip>>;
                            primaryFresh: z.ZodBoolean;
                            needsAttention: z.ZodBoolean;
                            nextDueAt: z.ZodNullable<z.ZodString>;
                            nextRetryAt: z.ZodNullable<z.ZodString>;
                            intervals: z.ZodArray<z.ZodObject<{
                                stream: z.ZodEnum<{
                                    subscribers: "subscribers";
                                    light: "light";
                                    followers: "followers";
                                    fan_identities: "fan_identities";
                                    transactions: "transactions";
                                    top_spenders: "top_spenders";
                                    dm_conversations: "dm_conversations";
                                    dm_messages: "dm_messages";
                                    followers_reconcile: "followers_reconcile";
                                    fan_earnings: "fan_earnings";
                                    purchase_history: "purchase_history";
                                }>;
                                cadenceSeconds: z.ZodNumber;
                            }, z.core.$strip>>;
                            metrics: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                            connectionStatus: z.ZodNullable<z.ZodEnum<{
                                error: "error";
                                connected: "connected";
                                not_connected: "not_connected";
                            }>>;
                            substreams: z.ZodArray<z.ZodObject<{
                                stream: z.ZodEnum<{
                                    subscribers: "subscribers";
                                    light: "light";
                                    followers: "followers";
                                    fan_identities: "fan_identities";
                                    transactions: "transactions";
                                    top_spenders: "top_spenders";
                                    dm_conversations: "dm_conversations";
                                    dm_messages: "dm_messages";
                                    followers_reconcile: "followers_reconcile";
                                    fan_earnings: "fan_earnings";
                                    purchase_history: "purchase_history";
                                }>;
                                role: z.ZodEnum<{
                                    primary: "primary";
                                    supporting: "supporting";
                                }>;
                                state: z.ZodEnum<{
                                    failed: "failed";
                                    syncing: "syncing";
                                    retrying: "retrying";
                                    paused: "paused";
                                    not_started: "not_started";
                                    scheduled: "scheduled";
                                    backfilling: "backfilling";
                                    up_to_date: "up_to_date";
                                    delayed: "delayed";
                                }>;
                                succeededAt: z.ZodNullable<z.ZodString>;
                                nextDueAt: z.ZodNullable<z.ZodString>;
                                nextRetryAt: z.ZodNullable<z.ZodString>;
                                cadenceSeconds: z.ZodNumber;
                                isFresh: z.ZodBoolean;
                                needsAttention: z.ZodBoolean;
                                statusReason: z.ZodNullable<z.ZodObject<{
                                    code: z.ZodNullable<z.ZodString>;
                                    summary: z.ZodNullable<z.ZodString>;
                                    waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                                }, z.core.$strip>>;
                                error: z.ZodNullable<z.ZodObject<{
                                    stream: z.ZodNullable<z.ZodString>;
                                    code: z.ZodNullable<z.ZodString>;
                                    summary: z.ZodNullable<z.ZodString>;
                                    failedAt: z.ZodNullable<z.ZodString>;
                                    consecutiveFailures: z.ZodNumber;
                                }, z.core.$strip>>;
                            }, z.core.$strip>>;
                        }, z.core.$strip>;
                    }, z.core.$strip>;
                }, z.core.$strip>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly pageMessagesBlock: {
        readonly auth: {
            readonly kind: "any";
            readonly scope: "page";
        };
        readonly tags: readonly ["dashboard"];
        readonly summary: "Get the combined Messages sync block for one visible page";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                generatedAt: z.ZodString;
                page: z.ZodObject<{
                    pageId: z.ZodNumber;
                    pageLabel: z.ZodString;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    modelSlug: z.ZodString;
                    modelName: z.ZodString;
                    username: z.ZodNullable<z.ZodString>;
                    displayName: z.ZodNullable<z.ZodString>;
                    diagnosis: z.ZodNullable<z.ZodObject<{
                        code: z.ZodEnum<{
                            worker_offline: "worker_offline";
                            stalled_run: "stalled_run";
                            auth_blocked: "auth_blocked";
                        }>;
                        severity: z.ZodEnum<{
                            error: "error";
                            warning: "warning";
                        }>;
                        headline: z.ZodString;
                        detail: z.ZodString;
                        actionKind: z.ZodNullable<z.ZodEnum<{
                            worker: "worker";
                            credentials: "credentials";
                            sync_settings: "sync_settings";
                        }>>;
                    }, z.core.$strip>>;
                }, z.core.$strip>;
                block: z.ZodObject<{
                    block: z.ZodEnum<{
                        connection: "connection";
                        financials: "financials";
                        audience: "audience";
                        messages_live: "messages_live";
                        messages_history: "messages_history";
                    }>;
                    state: z.ZodEnum<{
                        failed: "failed";
                        syncing: "syncing";
                        retrying: "retrying";
                        paused: "paused";
                        not_started: "not_started";
                        scheduled: "scheduled";
                        backfilling: "backfilling";
                        up_to_date: "up_to_date";
                        delayed: "delayed";
                        not_available: "not_available";
                    }>;
                    succeededAt: z.ZodNullable<z.ZodString>;
                    progress: z.ZodNullable<z.ZodObject<{
                        label: z.ZodString;
                        current: z.ZodNumber;
                        total: z.ZodNullable<z.ZodNumber>;
                        unit: z.ZodString;
                        percent: z.ZodNullable<z.ZodNumber>;
                        details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                    }, z.core.$strip>>;
                    progressStream: z.ZodNullable<z.ZodString>;
                    progressRole: z.ZodNullable<z.ZodEnum<{
                        primary: "primary";
                        supporting: "supporting";
                    }>>;
                    error: z.ZodNullable<z.ZodObject<{
                        stream: z.ZodNullable<z.ZodString>;
                        code: z.ZodNullable<z.ZodString>;
                        summary: z.ZodNullable<z.ZodString>;
                        failedAt: z.ZodNullable<z.ZodString>;
                        consecutiveFailures: z.ZodNumber;
                    }, z.core.$strip>>;
                    statusReason: z.ZodNullable<z.ZodObject<{
                        code: z.ZodNullable<z.ZodString>;
                        summary: z.ZodNullable<z.ZodString>;
                        waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                    }, z.core.$strip>>;
                    primaryFresh: z.ZodBoolean;
                    needsAttention: z.ZodBoolean;
                    nextDueAt: z.ZodNullable<z.ZodString>;
                    nextRetryAt: z.ZodNullable<z.ZodString>;
                    intervals: z.ZodArray<z.ZodObject<{
                        stream: z.ZodEnum<{
                            subscribers: "subscribers";
                            light: "light";
                            followers: "followers";
                            fan_identities: "fan_identities";
                            transactions: "transactions";
                            top_spenders: "top_spenders";
                            dm_conversations: "dm_conversations";
                            dm_messages: "dm_messages";
                            followers_reconcile: "followers_reconcile";
                            fan_earnings: "fan_earnings";
                            purchase_history: "purchase_history";
                        }>;
                        cadenceSeconds: z.ZodNumber;
                    }, z.core.$strip>>;
                    metrics: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                    connectionStatus: z.ZodNullable<z.ZodEnum<{
                        error: "error";
                        connected: "connected";
                        not_connected: "not_connected";
                    }>>;
                    substreams: z.ZodArray<z.ZodObject<{
                        stream: z.ZodEnum<{
                            subscribers: "subscribers";
                            light: "light";
                            followers: "followers";
                            fan_identities: "fan_identities";
                            transactions: "transactions";
                            top_spenders: "top_spenders";
                            dm_conversations: "dm_conversations";
                            dm_messages: "dm_messages";
                            followers_reconcile: "followers_reconcile";
                            fan_earnings: "fan_earnings";
                            purchase_history: "purchase_history";
                        }>;
                        role: z.ZodEnum<{
                            primary: "primary";
                            supporting: "supporting";
                        }>;
                        state: z.ZodEnum<{
                            failed: "failed";
                            syncing: "syncing";
                            retrying: "retrying";
                            paused: "paused";
                            not_started: "not_started";
                            scheduled: "scheduled";
                            backfilling: "backfilling";
                            up_to_date: "up_to_date";
                            delayed: "delayed";
                        }>;
                        succeededAt: z.ZodNullable<z.ZodString>;
                        nextDueAt: z.ZodNullable<z.ZodString>;
                        nextRetryAt: z.ZodNullable<z.ZodString>;
                        cadenceSeconds: z.ZodNumber;
                        isFresh: z.ZodBoolean;
                        needsAttention: z.ZodBoolean;
                        statusReason: z.ZodNullable<z.ZodObject<{
                            code: z.ZodNullable<z.ZodString>;
                            summary: z.ZodNullable<z.ZodString>;
                            waitingFor: z.ZodNullable<z.ZodArray<z.ZodString>>;
                        }, z.core.$strip>>;
                        error: z.ZodNullable<z.ZodObject<{
                            stream: z.ZodNullable<z.ZodString>;
                            code: z.ZodNullable<z.ZodString>;
                            summary: z.ZodNullable<z.ZodString>;
                            failedAt: z.ZodNullable<z.ZodString>;
                            consecutiveFailures: z.ZodNumber;
                        }, z.core.$strip>>;
                    }, z.core.$strip>>;
                }, z.core.$strip>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly overviewRevenueDaily: {
        readonly auth: {
            readonly kind: "session";
        };
        readonly tags: readonly ["dashboard"];
        readonly summary: "Get agency-wide revenue daily series";
        readonly querystring: z.ZodObject<{
            period: z.ZodDefault<z.ZodEnum<{
                today: "today";
                "7d": "7d";
                "30d": "30d";
                all: "all";
                custom: "custom";
            }>>;
            from: z.ZodOptional<z.ZodString>;
            to: z.ZodOptional<z.ZodString>;
            groupByType: z.ZodDefault<z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodBoolean>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                series: z.ZodArray<z.ZodObject<{
                    businessDate: z.ZodString;
                    netAmountMills: z.ZodNumber;
                    transactionCount: z.ZodNumber;
                    canonicalType: z.ZodOptional<z.ZodEnum<{
                        subscription: "subscription";
                        tip: "tip";
                        message_purchase: "message_purchase";
                        post_purchase: "post_purchase";
                        stream_tip: "stream_tip";
                        chargeback: "chargeback";
                        refund: "refund";
                        payout_reversal: "payout_reversal";
                        other: "other";
                    }>>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly overviewRevenueByModel: {
        readonly auth: {
            readonly kind: "session";
        };
        readonly tags: readonly ["dashboard"];
        readonly summary: "Get per-model revenue totals and daily series";
        readonly querystring: z.ZodObject<{
            period: z.ZodDefault<z.ZodEnum<{
                today: "today";
                "7d": "7d";
                "30d": "30d";
                all: "all";
                custom: "custom";
            }>>;
            from: z.ZodOptional<z.ZodString>;
            to: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                models: z.ZodArray<z.ZodObject<{
                    modelSlug: z.ZodString;
                    modelName: z.ZodString;
                    pageCount: z.ZodNumber;
                    totalNetAmountMills: z.ZodNumber;
                    transactionCount: z.ZodNumber;
                    series: z.ZodArray<z.ZodObject<{
                        businessDate: z.ZodString;
                        netAmountMills: z.ZodNumber;
                        transactionCount: z.ZodNumber;
                    }, z.core.$strip>>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly pageRevenueDaily: {
        readonly auth: {
            readonly kind: "session";
            readonly scope: "page";
        };
        readonly tags: readonly ["dashboard"];
        readonly summary: "Get daily revenue series for one page";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strip>;
        readonly querystring: z.ZodObject<{
            period: z.ZodDefault<z.ZodEnum<{
                today: "today";
                "7d": "7d";
                "30d": "30d";
                all: "all";
                custom: "custom";
            }>>;
            from: z.ZodOptional<z.ZodString>;
            to: z.ZodOptional<z.ZodString>;
            groupByType: z.ZodDefault<z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodBoolean>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                series: z.ZodArray<z.ZodObject<{
                    businessDate: z.ZodString;
                    netAmountMills: z.ZodNumber;
                    transactionCount: z.ZodNumber;
                    canonicalType: z.ZodOptional<z.ZodEnum<{
                        subscription: "subscription";
                        tip: "tip";
                        message_purchase: "message_purchase";
                        post_purchase: "post_purchase";
                        stream_tip: "stream_tip";
                        chargeback: "chargeback";
                        refund: "refund";
                        payout_reversal: "payout_reversal";
                        other: "other";
                    }>>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly modelRevenueDaily: {
        readonly auth: {
            readonly kind: "session";
        };
        readonly tags: readonly ["dashboard"];
        readonly summary: "Get daily revenue series for one model";
        readonly params: z.ZodObject<{
            modelSlug: z.ZodString;
        }, z.core.$strip>;
        readonly querystring: z.ZodObject<{
            period: z.ZodDefault<z.ZodEnum<{
                today: "today";
                "7d": "7d";
                "30d": "30d";
                all: "all";
                custom: "custom";
            }>>;
            from: z.ZodOptional<z.ZodString>;
            to: z.ZodOptional<z.ZodString>;
            groupByType: z.ZodDefault<z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodBoolean>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                series: z.ZodArray<z.ZodObject<{
                    businessDate: z.ZodString;
                    netAmountMills: z.ZodNumber;
                    transactionCount: z.ZodNumber;
                    canonicalType: z.ZodOptional<z.ZodEnum<{
                        subscription: "subscription";
                        tip: "tip";
                        message_purchase: "message_purchase";
                        post_purchase: "post_purchase";
                        stream_tip: "stream_tip";
                        chargeback: "chargeback";
                        refund: "refund";
                        payout_reversal: "payout_reversal";
                        other: "other";
                    }>>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly crossPageTransactions: {
        readonly auth: {
            readonly kind: "session";
        };
        readonly tags: readonly ["transactions"];
        readonly summary: "List transactions across all visible pages";
        readonly querystring: z.ZodObject<{
            limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            pageLabel: z.ZodOptional<z.ZodString>;
            type: z.ZodOptional<z.ZodEnum<{
                subscription: "subscription";
                tip: "tip";
                message_purchase: "message_purchase";
                post_purchase: "post_purchase";
                stream_tip: "stream_tip";
                chargeback: "chargeback";
                refund: "refund";
                payout_reversal: "payout_reversal";
                other: "other";
            }>>;
            state: z.ZodOptional<z.ZodEnum<{
                pending: "pending";
                posted: "posted";
                unknown: "unknown";
            }>>;
            sortBy: z.ZodDefault<z.ZodEnum<{
                grossAmountMills: "grossAmountMills";
                netAmountMills: "netAmountMills";
                occurredAt: "occurredAt";
            }>>;
            sortDir: z.ZodDefault<z.ZodEnum<{
                asc: "asc";
                desc: "desc";
            }>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                items: z.ZodArray<z.ZodObject<{
                    transactionId: z.ZodString;
                    rawType: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
                    canonicalType: z.ZodEnum<{
                        subscription: "subscription";
                        tip: "tip";
                        message_purchase: "message_purchase";
                        post_purchase: "post_purchase";
                        stream_tip: "stream_tip";
                        chargeback: "chargeback";
                        refund: "refund";
                        payout_reversal: "payout_reversal";
                        other: "other";
                    }>;
                    transactionState: z.ZodEnum<{
                        pending: "pending";
                        posted: "posted";
                        unknown: "unknown";
                    }>;
                    amountMills: z.ZodNumber;
                    destinationAmountMills: z.ZodNumber;
                    netAmountMills: z.ZodNumber;
                    occurredAt: z.ZodString;
                    sourceUpdatedAt: z.ZodNullable<z.ZodString>;
                    fan: z.ZodNullable<z.ZodObject<{
                        platformUserId: z.ZodString;
                        username: z.ZodNullable<z.ZodString>;
                        displayName: z.ZodNullable<z.ZodString>;
                    }, z.core.$strip>>;
                    pageLabel: z.ZodString;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                }, z.core.$strip>>;
                limit: z.ZodNumber;
                offset: z.ZodNumber;
                total: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly pageFanTransactions: {
        readonly auth: {
            readonly kind: "session";
            readonly scope: "page";
        };
        readonly tags: readonly ["fans"];
        readonly summary: "Get fan transaction history on a specific page";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
            platformUserId: z.ZodString;
        }, z.core.$strip>;
        readonly querystring: z.ZodObject<{
            limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                items: z.ZodArray<z.ZodObject<{
                    transactionId: z.ZodString;
                    rawType: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
                    canonicalType: z.ZodEnum<{
                        subscription: "subscription";
                        tip: "tip";
                        message_purchase: "message_purchase";
                        post_purchase: "post_purchase";
                        stream_tip: "stream_tip";
                        chargeback: "chargeback";
                        refund: "refund";
                        payout_reversal: "payout_reversal";
                        other: "other";
                    }>;
                    transactionState: z.ZodEnum<{
                        pending: "pending";
                        posted: "posted";
                        unknown: "unknown";
                    }>;
                    amountMills: z.ZodNumber;
                    destinationAmountMills: z.ZodNumber;
                    netAmountMills: z.ZodNumber;
                    occurredAt: z.ZodString;
                    sourceUpdatedAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>>;
                limit: z.ZodNumber;
                offset: z.ZodNumber;
                total: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly crossPageFanTransactions: {
        readonly auth: {
            readonly kind: "session";
        };
        readonly tags: readonly ["fans"];
        readonly summary: "Get cross-page fan transaction history";
        readonly params: z.ZodObject<{
            platform: z.ZodEnum<{
                fansly: "fansly";
                onlyfans: "onlyfans";
            }>;
            platformUserId: z.ZodString;
        }, z.core.$strip>;
        readonly querystring: z.ZodObject<{
            limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                items: z.ZodArray<z.ZodObject<{
                    transactionId: z.ZodString;
                    rawType: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
                    canonicalType: z.ZodEnum<{
                        subscription: "subscription";
                        tip: "tip";
                        message_purchase: "message_purchase";
                        post_purchase: "post_purchase";
                        stream_tip: "stream_tip";
                        chargeback: "chargeback";
                        refund: "refund";
                        payout_reversal: "payout_reversal";
                        other: "other";
                    }>;
                    transactionState: z.ZodEnum<{
                        pending: "pending";
                        posted: "posted";
                        unknown: "unknown";
                    }>;
                    amountMills: z.ZodNumber;
                    destinationAmountMills: z.ZodNumber;
                    netAmountMills: z.ZodNumber;
                    occurredAt: z.ZodString;
                    sourceUpdatedAt: z.ZodNullable<z.ZodString>;
                    pageLabel: z.ZodString;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                }, z.core.$strip>>;
                limit: z.ZodNumber;
                offset: z.ZodNumber;
                total: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly createFanNote: {
        readonly auth: {
            readonly kind: "any";
            readonly scope: "page";
        };
        readonly tags: readonly ["fans"];
        readonly summary: "Create a note on a fan for a specific page";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
            platformUserId: z.ZodString;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{
            body: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                id: z.ZodNumber;
                fanId: z.ZodNumber;
                platformAccountId: z.ZodNumber;
                authorUserId: z.ZodNumber;
                body: z.ZodString;
                createdAt: z.ZodString;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly setFanFlags: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["fans"];
        readonly summary: "Set flags on a fan";
        readonly params: z.ZodObject<{
            platform: z.ZodEnum<{
                fansly: "fansly";
                onlyfans: "onlyfans";
            }>;
            platformUserId: z.ZodString;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{
            flags: z.ZodArray<z.ZodEnum<{
                whale: "whale";
                vip: "vip";
                risky: "risky";
            }>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                flags: z.ZodArray<z.ZodObject<{
                    flag: z.ZodEnum<{
                        whale: "whale";
                        vip: "vip";
                        risky: "risky";
                    }>;
                    createdAt: z.ZodString;
                    createdByUserId: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly openApiJson: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["system"];
        readonly summary: "Get the OpenAPI specification";
        readonly response: {
            readonly 200: z.ZodAny;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminListUsers: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "List all users";
        readonly response: {
            readonly 200: z.ZodArray<z.ZodObject<{
                id: z.ZodNumber;
                username: z.ZodString;
                role: z.ZodEnum<{
                    owner: "owner";
                    team_lead: "team_lead";
                    chatter: "chatter";
                    content_manager: "content_manager";
                }>;
                mustChangePassword: z.ZodBoolean;
                assignedPages: z.ZodArray<z.ZodObject<{
                    id: z.ZodNumber;
                    label: z.ZodString;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    modelSlug: z.ZodString;
                    modelName: z.ZodString;
                }, z.core.$strip>>;
                apiKeyStatus: z.ZodNullable<z.ZodObject<{
                    activeKeyPrefix: z.ZodNullable<z.ZodString>;
                    activeKeyCount: z.ZodNumber;
                    activeKeyCreatedAt: z.ZodNullable<z.ZodString>;
                    activeKeyLastUsedAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>>;
                disabledAt: z.ZodNullable<z.ZodString>;
                lastActiveAt: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly aiPersonasList: {
        readonly auth: {
            readonly kind: "apiKey";
        };
        readonly tags: readonly ["usage"];
        readonly summary: "List kernel AI personas (the desktop picker's source)";
        readonly response: {
            readonly 200: z.ZodObject<{
                personas: z.ZodArray<z.ZodObject<{
                    key: z.ZodString;
                    displayName: z.ZodString;
                    systemBlock: z.ZodString;
                    updatedAt: z.ZodString;
                    version: z.ZodNumber;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly aiPersonaCatalog: {
        readonly auth: {
            readonly kind: "apiKey";
        };
        readonly tags: readonly ["usage"];
        readonly summary: "List AI persona metadata for client pickers";
        readonly response: {
            readonly 200: z.ZodObject<{
                personas: z.ZodArray<z.ZodObject<{
                    key: z.ZodString;
                    displayName: z.ZodString;
                    version: z.ZodNumber;
                    definitionId: z.ZodString;
                    status: z.ZodEnum<{
                        active: "active";
                        archived: "archived";
                    }>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly aiPersonaUpsert: {
        readonly auth: {
            readonly kind: "apiKey";
        };
        readonly tags: readonly ["usage"];
        readonly summary: "Create or update a kernel AI persona";
        readonly params: z.ZodObject<{
            key: z.ZodString;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{
            displayName: z.ZodString;
            systemBlock: z.ZodString;
            expectedVersion: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        }, z.core.$strict>;
        readonly response: {
            readonly 200: z.ZodObject<{
                key: z.ZodString;
                displayName: z.ZodString;
                systemBlock: z.ZodString;
                updatedAt: z.ZodString;
                version: z.ZodNumber;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly aiPersonaArchive: {
        readonly auth: {
            readonly kind: "apiKey";
        };
        readonly tags: readonly ["usage"];
        readonly summary: "Archive a kernel AI persona (soft retire)";
        readonly params: z.ZodObject<{
            key: z.ZodString;
        }, z.core.$strip>;
        readonly querystring: z.ZodObject<{
            expectedVersion: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
        }, z.core.$strict>;
        readonly response: {
            readonly 200: z.ZodObject<{
                archived: z.ZodBoolean;
                version: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminAiPersonasList: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "List full active and archived AI personas for owner administration";
        readonly response: {
            readonly 200: z.ZodObject<{
                personas: z.ZodArray<z.ZodObject<{
                    key: z.ZodString;
                    displayName: z.ZodString;
                    systemBlock: z.ZodString;
                    updatedAt: z.ZodString;
                    version: z.ZodNumber;
                    status: z.ZodEnum<{
                        active: "active";
                        archived: "archived";
                    }>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminAiPersonaCreate: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Create an AI persona";
        readonly body: z.ZodObject<{
            key: z.ZodString;
            displayName: z.ZodString;
            systemBlock: z.ZodString;
        }, z.core.$strict>;
        readonly response: {
            readonly 200: z.ZodObject<{
                key: z.ZodString;
                displayName: z.ZodString;
                systemBlock: z.ZodString;
                updatedAt: z.ZodString;
                version: z.ZodNumber;
                status: z.ZodEnum<{
                    active: "active";
                    archived: "archived";
                }>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminAiPersonaUpdate: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Update an active AI persona with optimistic concurrency";
        readonly params: z.ZodObject<{
            key: z.ZodString;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{
            displayName: z.ZodString;
            systemBlock: z.ZodString;
            expectedVersion: z.ZodNumber;
        }, z.core.$strict>;
        readonly response: {
            readonly 200: z.ZodObject<{
                key: z.ZodString;
                displayName: z.ZodString;
                systemBlock: z.ZodString;
                updatedAt: z.ZodString;
                version: z.ZodNumber;
                status: z.ZodEnum<{
                    active: "active";
                    archived: "archived";
                }>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminAiPersonaArchive: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Archive an active AI persona with optimistic concurrency";
        readonly params: z.ZodObject<{
            key: z.ZodString;
        }, z.core.$strip>;
        readonly querystring: z.ZodObject<{
            expectedVersion: z.ZodCoercedNumber<unknown>;
        }, z.core.$strict>;
        readonly response: {
            readonly 200: z.ZodObject<{
                key: z.ZodString;
                displayName: z.ZodString;
                systemBlock: z.ZodString;
                updatedAt: z.ZodString;
                version: z.ZodNumber;
                status: z.ZodEnum<{
                    active: "active";
                    archived: "archived";
                }>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly aiFeatureStream: {
        readonly auth: {
            readonly kind: "apiKey";
        };
        readonly tags: readonly ["usage"];
        readonly summary: "Stream a kernel-assembled AI feature generation";
        readonly description: string;
        readonly params: z.ZodObject<{
            feature: z.ZodString;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{
            clientRequestId: z.ZodString;
            pageLabel: z.ZodString;
            platform: z.ZodEnum<{
                fansly: "fansly";
                onlyfans: "onlyfans";
            }>;
            conversationRef: z.ZodString;
            fanRef: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            personaKey: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            expectedPersonaDefinitionId: z.ZodOptional<z.ZodString>;
            model: z.ZodOptional<z.ZodString>;
            reasoningEffort: z.ZodOptional<z.ZodEnum<{
                off: "off";
                high: "high";
                low: "low";
                medium: "medium";
                max: "max";
            }>>;
            replyTone: z.ZodOptional<z.ZodEnum<{
                none: "none";
                casual: "casual";
                flirty: "flirty";
                upsell: "upsell";
                spicy: "spicy";
            }>>;
            replyMode: z.ZodOptional<z.ZodEnum<{
                default: "default";
                preferSplit: "preferSplit";
            }>>;
            messageCount: z.ZodOptional<z.ZodNumber>;
            draftText: z.ZodOptional<z.ZodString>;
            isRegeneration: z.ZodOptional<z.ZodBoolean>;
            clientContext: z.ZodOptional<z.ZodObject<{
                transcript: z.ZodString;
                messageCount: z.ZodNumber;
                fanDisplayName: z.ZodString;
                fanSpendingData: z.ZodDefault<z.ZodString>;
                fanSubscriptionData: z.ZodDefault<z.ZodString>;
                fanBio: z.ZodOptional<z.ZodString>;
                pingSegment: z.ZodOptional<z.ZodEnum<{
                    active: "active";
                    "segment-a": "segment-a";
                    "segment-b": "segment-b";
                }>>;
            }, z.core.$strict>>;
        }, z.core.$strict>;
        readonly response: {
            readonly 200: z.ZodUnknown;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 429: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 503: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly aiRestrictedGenerations: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "List restricted AI generation content (owner only)";
        readonly querystring: z.ZodObject<{
            feature: z.ZodOptional<z.ZodString>;
            pageId: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
            limit: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                generations: z.ZodArray<z.ZodObject<{
                    generationRef: z.ZodString;
                    feature: z.ZodString;
                    model: z.ZodString;
                    provider: z.ZodString;
                    userId: z.ZodNullable<z.ZodNumber>;
                    pageId: z.ZodNullable<z.ZodNumber>;
                    conversationRef: z.ZodNullable<z.ZodString>;
                    promptBlocks: z.ZodArray<z.ZodUnknown>;
                    completion: z.ZodString;
                    params: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                    createdAt: z.ZodString;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly aiRestrictedGenerationDetail: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Get one restricted AI generation with its acceptance lifecycle (owner only)";
        readonly params: z.ZodObject<{
            generationRef: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                generation: z.ZodObject<{
                    generationRef: z.ZodString;
                    feature: z.ZodString;
                    model: z.ZodString;
                    provider: z.ZodString;
                    userId: z.ZodNullable<z.ZodNumber>;
                    pageId: z.ZodNullable<z.ZodNumber>;
                    conversationRef: z.ZodNullable<z.ZodString>;
                    promptBlocks: z.ZodArray<z.ZodUnknown>;
                    completion: z.ZodString;
                    params: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                    createdAt: z.ZodString;
                }, z.core.$strip>;
                acceptance: z.ZodArray<z.ZodObject<{
                    lifecycle: z.ZodEnum<{
                        shown: "shown";
                        copied: "copied";
                        inserted: "inserted";
                        edited: "edited";
                        sent: "sent";
                    }>;
                    userId: z.ZodNullable<z.ZodNumber>;
                    occurredAt: z.ZodString;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminChatterUsage: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Get aggregated AI usage per chatter";
        readonly querystring: z.ZodObject<{
            from: z.ZodOptional<z.ZodString>;
            to: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                range: z.ZodObject<{
                    from: z.ZodString;
                    to: z.ZodString;
                    timeZone: z.ZodString;
                }, z.core.$strip>;
                rows: z.ZodArray<z.ZodObject<{
                    userId: z.ZodNumber;
                    username: z.ZodString;
                    totalGenerations: z.ZodNumber;
                    tokenCounts: z.ZodObject<{
                        input: z.ZodNumber;
                        output: z.ZodNumber;
                        cacheWrite: z.ZodNumber;
                        cacheRead: z.ZodNumber;
                        cacheTotal: z.ZodNumber;
                    }, z.core.$strip>;
                    cost: z.ZodObject<{
                        microUsd: z.ZodNumber;
                        approximate: z.ZodBoolean;
                    }, z.core.$strip>;
                    gateway: z.ZodObject<{
                        requestCount: z.ZodNumber;
                        completedCount: z.ZodNumber;
                        failedCount: z.ZodNumber;
                        cancelledCount: z.ZodNumber;
                        quotaDeniedCount: z.ZodNumber;
                        openReservationCount: z.ZodNumber;
                        providerBreakdown: z.ZodArray<z.ZodObject<{
                            provider: z.ZodEnum<{
                                anthropic: "anthropic";
                                openrouter: "openrouter";
                            }>;
                            requestCount: z.ZodNumber;
                            costMicroUsd: z.ZodNumber;
                        }, z.core.$strip>>;
                    }, z.core.$strip>;
                    topFeature: z.ZodNullable<z.ZodObject<{
                        feature: z.ZodEnum<{
                            "fast-reply": "fast-reply";
                            "improve-draft": "improve-draft";
                            "help-me": "help-me";
                            "fan-summary": "fan-summary";
                            "chat-review": "chat-review";
                            scan: "scan";
                            ping: "ping";
                            "hi-greeting": "hi-greeting";
                            "workboard-closing": "workboard-closing";
                        }>;
                        requestCount: z.ZodNumber;
                        sharePct: z.ZodNumber;
                    }, z.core.$strip>>;
                    featureBreakdown: z.ZodArray<z.ZodObject<{
                        feature: z.ZodEnum<{
                            "fast-reply": "fast-reply";
                            "improve-draft": "improve-draft";
                            "help-me": "help-me";
                            "fan-summary": "fan-summary";
                            "chat-review": "chat-review";
                            scan: "scan";
                            ping: "ping";
                            "hi-greeting": "hi-greeting";
                            "workboard-closing": "workboard-closing";
                        }>;
                        requestCount: z.ZodNumber;
                        sharePct: z.ZodNumber;
                        tokenCounts: z.ZodObject<{
                            input: z.ZodNumber;
                            output: z.ZodNumber;
                            cacheWrite: z.ZodNumber;
                            cacheRead: z.ZodNumber;
                            cacheTotal: z.ZodNumber;
                        }, z.core.$strip>;
                        costMicroUsd: z.ZodNumber;
                        costApproximate: z.ZodBoolean;
                        regenerateRatePct: z.ZodNumber;
                    }, z.core.$strip>>;
                    regenerateRatePct: z.ZodNumber;
                    warning: z.ZodBoolean;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminCreateUser: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Create a new user";
        readonly body: z.ZodObject<{
            username: z.ZodString;
            role: z.ZodEnum<{
                owner: "owner";
                team_lead: "team_lead";
                chatter: "chatter";
            }>;
            password: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                id: z.ZodNumber;
                username: z.ZodString;
                role: z.ZodEnum<{
                    owner: "owner";
                    team_lead: "team_lead";
                    chatter: "chatter";
                    content_manager: "content_manager";
                }>;
                mustChangePassword: z.ZodBoolean;
                assignedPages: z.ZodArray<z.ZodObject<{
                    id: z.ZodNumber;
                    label: z.ZodString;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    modelSlug: z.ZodString;
                    modelName: z.ZodString;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminSetPassword: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Set a user password";
        readonly params: z.ZodObject<{
            username: z.ZodString;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{
            password: z.ZodString;
            mustChangePassword: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                ok: z.ZodLiteral<true>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminAssignPage: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Assign a page to a user";
        readonly params: z.ZodObject<{
            username: z.ZodString;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                id: z.ZodNumber;
                username: z.ZodString;
                role: z.ZodEnum<{
                    owner: "owner";
                    team_lead: "team_lead";
                    chatter: "chatter";
                    content_manager: "content_manager";
                }>;
                mustChangePassword: z.ZodBoolean;
                assignedPages: z.ZodArray<z.ZodObject<{
                    id: z.ZodNumber;
                    label: z.ZodString;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    modelSlug: z.ZodString;
                    modelName: z.ZodString;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminUnassignPage: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Unassign a page from a user";
        readonly params: z.ZodObject<{
            username: z.ZodString;
            pageLabel: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                ok: z.ZodLiteral<true>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminListApiKeys: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "List API keys for a user";
        readonly params: z.ZodObject<{
            username: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodArray<z.ZodObject<{
                id: z.ZodNumber;
                keyPrefix: z.ZodString;
                userId: z.ZodNumber;
                isActive: z.ZodBoolean;
                revokedAt: z.ZodNullable<z.ZodString>;
                revokedReason: z.ZodNullable<z.ZodString>;
                createdAt: z.ZodString;
                lastUsedAt: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminIssueApiKey: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Issue an API key for a user";
        readonly params: z.ZodObject<{
            username: z.ZodString;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{
            pageLabel: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                key: z.ZodString;
                keyPrefix: z.ZodString;
                assignedPages: z.ZodArray<z.ZodObject<{
                    id: z.ZodNumber;
                    label: z.ZodString;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    modelSlug: z.ZodString;
                    modelName: z.ZodString;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminRevokeApiKeys: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Revoke all API keys for a user";
        readonly params: z.ZodObject<{
            username: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                revokedCount: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminDeactivateUser: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Deactivate a user (decision #126: soft tombstone, never delete)";
        readonly description: string;
        readonly params: z.ZodObject<{
            username: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                ok: z.ZodLiteral<true>;
                revokedApiKeys: z.ZodNumber;
                revokedDeviceTokens: z.ZodNumber;
                revokedSessions: z.ZodNumber;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminReactivateUser: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Reactivate a deactivated user";
        readonly description: string;
        readonly params: z.ZodObject<{
            username: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                ok: z.ZodLiteral<true>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly authChangePassword: {
        readonly auth: {
            readonly kind: "any-session";
        };
        readonly tags: readonly ["auth"];
        readonly summary: "Change the caller's own password";
        readonly description: string;
        readonly body: z.ZodObject<{
            currentPassword: z.ZodString;
            newPassword: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                ok: z.ZodLiteral<true>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly authIssueDeviceToken: {
        readonly auth: {
            readonly kind: "any-session";
        };
        readonly tags: readonly ["auth"];
        readonly summary: "Issue a device token for the caller (returned once)";
        readonly body: z.ZodObject<{
            label: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                token: z.ZodString;
                id: z.ZodNumber;
                label: z.ZodString;
                keyPrefix: z.ZodString;
                expiresAt: z.ZodString;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly authReserveDeviceToken: {
        readonly auth: {
            readonly kind: "any-session";
        };
        readonly tags: readonly ["auth"];
        readonly summary: "Reserve a crash-safe device token for the caller (returned once)";
        readonly description: string;
        readonly body: z.ZodObject<{
            label: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                token: z.ZodString;
                reservationId: z.ZodNumber;
                label: z.ZodString;
                keyPrefix: z.ZodString;
                reservationExpiresAt: z.ZodString;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly authActivateDeviceToken: {
        readonly auth: {
            readonly kind: "pending-device-token";
        };
        readonly tags: readonly ["auth"];
        readonly summary: "Activate a durably staged pending device token";
        readonly description: string;
        readonly response: {
            readonly 200: z.ZodObject<{
                id: z.ZodNumber;
                label: z.ZodString;
                expiresAt: z.ZodString;
                keyPrefix: z.ZodString;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly authRevokeCurrentDeviceToken: {
        readonly auth: {
            readonly kind: "device-token";
        };
        readonly tags: readonly ["auth"];
        readonly summary: "Revoke the current device-token bearer";
        readonly description: string;
        readonly response: {
            readonly 200: z.ZodObject<{
                revoked: z.ZodLiteral<true>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminListDeviceTokens: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "List a user's device tokens";
        readonly params: z.ZodObject<{
            username: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodArray<z.ZodObject<{
                id: z.ZodNumber;
                label: z.ZodString;
                keyPrefix: z.ZodString;
                harvestMachineId: z.ZodNullable<z.ZodString>;
                isActive: z.ZodBoolean;
                expiresAt: z.ZodString;
                lastUsedAt: z.ZodNullable<z.ZodString>;
                createdAt: z.ZodString;
                revokedAt: z.ZodNullable<z.ZodString>;
                revokedReason: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminIssueDeviceToken: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Issue a device token for a user (returned once)";
        readonly params: z.ZodObject<{
            username: z.ZodString;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{
            label: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                token: z.ZodString;
                id: z.ZodNumber;
                label: z.ZodString;
                keyPrefix: z.ZodString;
                expiresAt: z.ZodString;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminSetDeviceTokenHarvestCapability: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Bind or remove a device token's Desktop harvest capability";
        readonly description: string;
        readonly params: z.ZodObject<{
            username: z.ZodString;
            tokenId: z.ZodCoercedNumber<unknown>;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{
            machineId: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                id: z.ZodNumber;
                label: z.ZodString;
                keyPrefix: z.ZodString;
                harvestMachineId: z.ZodNullable<z.ZodString>;
                isActive: z.ZodBoolean;
                expiresAt: z.ZodString;
                lastUsedAt: z.ZodNullable<z.ZodString>;
                createdAt: z.ZodString;
                revokedAt: z.ZodNullable<z.ZodString>;
                revokedReason: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminRevokeDeviceTokens: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Revoke all of a user's device tokens";
        readonly params: z.ZodObject<{
            username: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                revokedCount: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminDeviceTokenAdoption: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Device-token adoption across active chatters (D116(c) gate report)";
        readonly description: string;
        readonly response: {
            readonly 200: z.ZodObject<{
                generatedAt: z.ZodString;
                freshWindowDays: z.ZodNumber;
                chatters: z.ZodArray<z.ZodObject<{
                    username: z.ZodString;
                    hasFreshDeviceToken: z.ZodBoolean;
                    deviceTokenLastUsedAt: z.ZodNullable<z.ZodString>;
                    deviceTokenExpiresAt: z.ZodNullable<z.ZodString>;
                    activeApiKeys: z.ZodNumber;
                    apiKeyLastUsedAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>>;
                summary: z.ZodObject<{
                    activeChatters: z.ZodNumber;
                    onFreshTokens: z.ZodNumber;
                    withActiveApiKeys: z.ZodNumber;
                }, z.core.$strip>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminGrantModel: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Grant a user model-scope access (present and future pages)";
        readonly params: z.ZodObject<{
            username: z.ZodString;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{
            modelSlug: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                ok: z.ZodLiteral<true>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminRevokeModel: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Revoke a user's model-scope grant";
        readonly params: z.ZodObject<{
            username: z.ZodString;
            modelSlug: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                ok: z.ZodLiteral<true>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminListUserGrants: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Access-grant history for one user (active and revoked)";
        readonly params: z.ZodObject<{
            username: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                grants: z.ZodArray<z.ZodObject<{
                    id: z.ZodNumber;
                    scopeType: z.ZodEnum<{
                        page: "page";
                        model: "model";
                        org: "org";
                    }>;
                    scopeId: z.ZodNumber;
                    scopeLabel: z.ZodNullable<z.ZodString>;
                    grantedBy: z.ZodNullable<z.ZodNumber>;
                    grantedAt: z.ZodString;
                    revokedBy: z.ZodNullable<z.ZodNumber>;
                    revokedAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly archiveConversationMessages: {
        readonly auth: {
            readonly kind: "session";
        };
        readonly tags: readonly ["archive"];
        readonly summary: "List archived messages for one conversation (paged, before-cursor)";
        readonly params: z.ZodObject<{
            ref: z.ZodString;
        }, z.core.$strip>;
        readonly querystring: z.ZodObject<{
            before: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
            limit: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodArray<z.ZodObject<{
                id: z.ZodNumber;
                accountId: z.ZodNumber;
                platform: z.ZodString;
                conversationRef: z.ZodNullable<z.ZodString>;
                messageRef: z.ZodString;
                fanNativeId: z.ZodNullable<z.ZodString>;
                senderRole: z.ZodString;
                isSentByMe: z.ZodBoolean;
                occurredAt: z.ZodNullable<z.ZodString>;
                textPlain: z.ZodString;
                priceMills: z.ZodNullable<z.ZodString>;
                isTip: z.ZodBoolean;
                tipAmountMills: z.ZodString;
                deletedAt: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly archiveSearch: {
        readonly auth: {
            readonly kind: "session";
        };
        readonly tags: readonly ["archive"];
        readonly summary: "Search archived message text (bounded ILIKE)";
        readonly querystring: z.ZodObject<{
            q: z.ZodString;
            fan: z.ZodOptional<z.ZodString>;
            limit: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodArray<z.ZodObject<{
                id: z.ZodNumber;
                accountId: z.ZodNumber;
                platform: z.ZodString;
                conversationRef: z.ZodNullable<z.ZodString>;
                messageRef: z.ZodString;
                fanNativeId: z.ZodNullable<z.ZodString>;
                senderRole: z.ZodString;
                isSentByMe: z.ZodBoolean;
                occurredAt: z.ZodNullable<z.ZodString>;
                textPlain: z.ZodString;
                priceMills: z.ZodNullable<z.ZodString>;
                isTip: z.ZodBoolean;
                tipAmountMills: z.ZodString;
                deletedAt: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminSyncRuns: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "List recent sync runs";
        readonly querystring: z.ZodObject<{
            pageLabel: z.ZodOptional<z.ZodString>;
            limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            since: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodArray<z.ZodObject<{
                runId: z.ZodNumber;
                platformAccountId: z.ZodNumber;
                pageLabel: z.ZodString;
                platform: z.ZodEnum<{
                    fansly: "fansly";
                    onlyfans: "onlyfans";
                }>;
                stream: z.ZodString;
                trigger: z.ZodString;
                status: z.ZodString;
                startedAt: z.ZodString;
                finishedAt: z.ZodNullable<z.ZodString>;
                errorSummary: z.ZodNullable<z.ZodString>;
                stats: z.ZodRecord<z.ZodString, z.ZodUnknown>;
            }, z.core.$strip>>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminSyncRunDetail: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Get sync run detail";
        readonly params: z.ZodObject<{
            runId: z.ZodCoercedNumber<unknown>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                run: z.ZodObject<{
                    runId: z.ZodNumber;
                    platformAccountId: z.ZodNumber;
                    pageLabel: z.ZodString;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    stream: z.ZodString;
                    trigger: z.ZodString;
                    status: z.ZodString;
                    startedAt: z.ZodString;
                    finishedAt: z.ZodNullable<z.ZodString>;
                    errorSummary: z.ZodNullable<z.ZodString>;
                    stats: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                }, z.core.$strip>;
                events: z.ZodArray<z.ZodObject<{
                    id: z.ZodNumber;
                    runId: z.ZodNumber;
                    platformAccountId: z.ZodNumber;
                    pageLabel: z.ZodString;
                    provider: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    stream: z.ZodString;
                    eventType: z.ZodString;
                    severity: z.ZodString;
                    message: z.ZodString;
                    details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                    emittedAt: z.ZodString;
                }, z.core.$strip>>;
                attempts: z.ZodArray<z.ZodObject<{
                    attemptId: z.ZodNumber;
                    runId: z.ZodNumber;
                    platformAccountId: z.ZodNumber;
                    pageLabel: z.ZodString;
                    provider: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    stream: z.ZodString;
                    operation: z.ZodString;
                    logicalRequestId: z.ZodString;
                    attemptNumber: z.ZodNumber;
                    state: z.ZodString;
                    failureKind: z.ZodNullable<z.ZodString>;
                    httpStatus: z.ZodNullable<z.ZodNumber>;
                    retryDelayMs: z.ZodNullable<z.ZodNumber>;
                    durationMs: z.ZodNullable<z.ZodNumber>;
                    requestShape: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                    responseShape: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                    errorMessage: z.ZodNullable<z.ZodString>;
                    startedAt: z.ZodString;
                    finishedAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminSyncTrigger: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Trigger sync for a page";
        readonly body: z.ZodObject<{
            pageLabel: z.ZodString;
            scope: z.ZodEnum<{
                all: "all";
                messages: "messages";
                light: "light";
                followers: "followers";
                data: "data";
            }>;
        }, z.core.$strip>;
        readonly response: {
            readonly 202: z.ZodObject<{
                accepted: z.ZodLiteral<true>;
                pageLabel: z.ZodString;
                scope: z.ZodEnum<{
                    all: "all";
                    messages: "messages";
                    light: "light";
                    followers: "followers";
                    data: "data";
                }>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminSyncBlockTrigger: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Trigger sync for a specific page block";
        readonly body: z.ZodObject<{
            pageLabel: z.ZodString;
            block: z.ZodEnum<{
                connection: "connection";
                financials: "financials";
                audience: "audience";
                messages_live: "messages_live";
                messages_history: "messages_history";
            }>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                accepted: z.ZodLiteral<true>;
                action: z.ZodEnum<{
                    trigger: "trigger";
                    pause: "pause";
                    resume: "resume";
                    reset: "reset";
                }>;
                pageLabel: z.ZodString;
                block: z.ZodEnum<{
                    connection: "connection";
                    financials: "financials";
                    audience: "audience";
                    messages_live: "messages_live";
                    messages_history: "messages_history";
                }>;
                requests: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    stream: z.ZodEnum<{
                        subscribers: "subscribers";
                        light: "light";
                        followers: "followers";
                        fan_identities: "fan_identities";
                        transactions: "transactions";
                        top_spenders: "top_spenders";
                        dm_conversations: "dm_conversations";
                        dm_messages: "dm_messages";
                        followers_reconcile: "followers_reconcile";
                        fan_earnings: "fan_earnings";
                        purchase_history: "purchase_history";
                    }>;
                    requestedSeq: z.ZodNumber;
                }, z.core.$strip>>>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 503: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminSyncBlockPause: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Pause sync for a specific page block";
        readonly body: z.ZodObject<{
            pageLabel: z.ZodString;
            block: z.ZodEnum<{
                connection: "connection";
                financials: "financials";
                audience: "audience";
                messages_live: "messages_live";
                messages_history: "messages_history";
            }>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                accepted: z.ZodLiteral<true>;
                action: z.ZodEnum<{
                    trigger: "trigger";
                    pause: "pause";
                    resume: "resume";
                    reset: "reset";
                }>;
                pageLabel: z.ZodString;
                block: z.ZodEnum<{
                    connection: "connection";
                    financials: "financials";
                    audience: "audience";
                    messages_live: "messages_live";
                    messages_history: "messages_history";
                }>;
                requests: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    stream: z.ZodEnum<{
                        subscribers: "subscribers";
                        light: "light";
                        followers: "followers";
                        fan_identities: "fan_identities";
                        transactions: "transactions";
                        top_spenders: "top_spenders";
                        dm_conversations: "dm_conversations";
                        dm_messages: "dm_messages";
                        followers_reconcile: "followers_reconcile";
                        fan_earnings: "fan_earnings";
                        purchase_history: "purchase_history";
                    }>;
                    requestedSeq: z.ZodNumber;
                }, z.core.$strip>>>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminSyncBlockResume: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Resume sync for a specific page block";
        readonly body: z.ZodObject<{
            pageLabel: z.ZodString;
            block: z.ZodEnum<{
                connection: "connection";
                financials: "financials";
                audience: "audience";
                messages_live: "messages_live";
                messages_history: "messages_history";
            }>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                accepted: z.ZodLiteral<true>;
                action: z.ZodEnum<{
                    trigger: "trigger";
                    pause: "pause";
                    resume: "resume";
                    reset: "reset";
                }>;
                pageLabel: z.ZodString;
                block: z.ZodEnum<{
                    connection: "connection";
                    financials: "financials";
                    audience: "audience";
                    messages_live: "messages_live";
                    messages_history: "messages_history";
                }>;
                requests: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    stream: z.ZodEnum<{
                        subscribers: "subscribers";
                        light: "light";
                        followers: "followers";
                        fan_identities: "fan_identities";
                        transactions: "transactions";
                        top_spenders: "top_spenders";
                        dm_conversations: "dm_conversations";
                        dm_messages: "dm_messages";
                        followers_reconcile: "followers_reconcile";
                        fan_earnings: "fan_earnings";
                        purchase_history: "purchase_history";
                    }>;
                    requestedSeq: z.ZodNumber;
                }, z.core.$strip>>>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminSyncBlockReset: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Reset sync state for a specific page block";
        readonly body: z.ZodObject<{
            pageLabel: z.ZodString;
            block: z.ZodEnum<{
                connection: "connection";
                financials: "financials";
                audience: "audience";
                messages_live: "messages_live";
                messages_history: "messages_history";
            }>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                accepted: z.ZodLiteral<true>;
                action: z.ZodEnum<{
                    trigger: "trigger";
                    pause: "pause";
                    resume: "resume";
                    reset: "reset";
                }>;
                pageLabel: z.ZodString;
                block: z.ZodEnum<{
                    connection: "connection";
                    financials: "financials";
                    audience: "audience";
                    messages_live: "messages_live";
                    messages_history: "messages_history";
                }>;
                requests: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    stream: z.ZodEnum<{
                        subscribers: "subscribers";
                        light: "light";
                        followers: "followers";
                        fan_identities: "fan_identities";
                        transactions: "transactions";
                        top_spenders: "top_spenders";
                        dm_conversations: "dm_conversations";
                        dm_messages: "dm_messages";
                        followers_reconcile: "followers_reconcile";
                        fan_earnings: "fan_earnings";
                        purchase_history: "purchase_history";
                    }>;
                    requestedSeq: z.ZodNumber;
                }, z.core.$strip>>>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 503: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminSyncTriggerAll: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Trigger sync for all pages";
        readonly response: {
            readonly 202: z.ZodObject<{
                accepted: z.ZodLiteral<true>;
                pagesQueued: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminConnections: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "List connection statuses";
        readonly response: {
            readonly 200: z.ZodArray<z.ZodObject<{
                id: z.ZodNumber;
                label: z.ZodString;
                platform: z.ZodEnum<{
                    fansly: "fansly";
                    onlyfans: "onlyfans";
                }>;
                modelSlug: z.ZodString;
                modelName: z.ZodString;
                username: z.ZodNullable<z.ZodString>;
                displayName: z.ZodNullable<z.ZodString>;
                connectionStatus: z.ZodEnum<{
                    error: "error";
                    active: "active";
                    stale: "stale";
                    expired: "expired";
                    never_synced: "never_synced";
                    unverified: "unverified";
                }>;
                lastLightSyncAt: z.ZodNullable<z.ZodString>;
                lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
                lastSyncError: z.ZodNullable<z.ZodString>;
                subscriberCount: z.ZodObject<{
                    value: z.ZodNullable<z.ZodNumber>;
                    available: z.ZodBoolean;
                }, z.core.$strip>;
                followerCount: z.ZodObject<{
                    value: z.ZodNullable<z.ZodNumber>;
                    available: z.ZodBoolean;
                }, z.core.$strip>;
                proxyUrl: z.ZodNullable<z.ZodString>;
                proxyHasAuth: z.ZodBoolean;
                syncUx: z.ZodObject<{
                    state: z.ZodEnum<{
                        healthy: "healthy";
                        syncing: "syncing";
                        catching_up: "catching_up";
                        retrying: "retrying";
                        attention: "attention";
                        setup: "setup";
                        off: "off";
                    }>;
                    label: z.ZodString;
                    headline: z.ZodString;
                    detail: z.ZodNullable<z.ZodString>;
                    progressLabel: z.ZodNullable<z.ZodString>;
                    nextRetryAt: z.ZodNullable<z.ZodString>;
                    updatedAt: z.ZodNullable<z.ZodString>;
                    requiresAction: z.ZodBoolean;
                }, z.core.$strip>;
            }, z.core.$strip>>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminModels: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "List all models for admin management";
        readonly response: {
            readonly 200: z.ZodArray<z.ZodObject<{
                id: z.ZodNumber;
                slug: z.ZodString;
                name: z.ZodString;
                pageCount: z.ZodNumber;
                sortOrder: z.ZodNumber;
            }, z.core.$strip>>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminCreateModel: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Create a model";
        readonly body: z.ZodObject<{
            slug: z.ZodString;
            name: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                id: z.ZodNumber;
                slug: z.ZodString;
                name: z.ZodString;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminUpdateModel: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Update a model";
        readonly params: z.ZodObject<{
            modelSlug: z.ZodString;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{
            slug: z.ZodOptional<z.ZodString>;
            name: z.ZodOptional<z.ZodString>;
            sortOrder: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                id: z.ZodNumber;
                slug: z.ZodString;
                name: z.ZodString;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminDeleteModel: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Delete an empty model";
        readonly params: z.ZodObject<{
            modelSlug: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                deleted: z.ZodLiteral<true>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminPages: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "List all pages for admin management";
        readonly response: {
            readonly 200: z.ZodArray<z.ZodObject<{
                id: z.ZodNumber;
                label: z.ZodString;
                platform: z.ZodEnum<{
                    fansly: "fansly";
                    onlyfans: "onlyfans";
                }>;
                modelSlug: z.ZodString;
                modelName: z.ZodString;
                username: z.ZodNullable<z.ZodString>;
                displayName: z.ZodNullable<z.ZodString>;
                followerCount: z.ZodObject<{
                    value: z.ZodNullable<z.ZodNumber>;
                    available: z.ZodBoolean;
                }, z.core.$strip>;
                subscriberCount: z.ZodObject<{
                    value: z.ZodNullable<z.ZodNumber>;
                    available: z.ZodBoolean;
                }, z.core.$strip>;
                lastLightSyncAt: z.ZodNullable<z.ZodString>;
                lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminCreatePage: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Onboard a new page";
        readonly body: z.ZodDiscriminatedUnion<[z.ZodObject<{
            platform: z.ZodLiteral<"fansly">;
            session: z.ZodObject<{
                authorization: z.ZodString;
                fanslyClientId: z.ZodOptional<z.ZodString>;
                fanslyClientCheck: z.ZodOptional<z.ZodString>;
                fanslySessionId: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            proxy: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                url: z.ZodString;
                username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                password: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            }, z.core.$strip>>>;
            modelSlug: z.ZodString;
            label: z.ZodString;
        }, z.core.$strip>, z.ZodObject<{
            platform: z.ZodLiteral<"onlyfans">;
            username: z.ZodString;
            modelSlug: z.ZodString;
            label: z.ZodString;
        }, z.core.$strip>], "platform">;
        readonly response: {
            readonly 200: z.ZodObject<{
                page: z.ZodObject<{
                    id: z.ZodNumber;
                    label: z.ZodString;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    modelSlug: z.ZodString;
                    modelName: z.ZodString;
                    username: z.ZodNullable<z.ZodString>;
                    displayName: z.ZodNullable<z.ZodString>;
                    followerCount: z.ZodObject<{
                        value: z.ZodNullable<z.ZodNumber>;
                        available: z.ZodBoolean;
                    }, z.core.$strip>;
                    subscriberCount: z.ZodObject<{
                        value: z.ZodNullable<z.ZodNumber>;
                        available: z.ZodBoolean;
                    }, z.core.$strip>;
                    lastLightSyncAt: z.ZodNullable<z.ZodString>;
                    lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
                verified: z.ZodBoolean;
                syncQueued: z.ZodBoolean;
                syncWarning: z.ZodNullable<z.ZodObject<{
                    code: z.ZodLiteral<"initial_sync_enqueue_failed">;
                    message: z.ZodString;
                }, z.core.$strip>>;
                syncRetry: z.ZodNullable<z.ZodObject<{
                    method: z.ZodLiteral<"POST">;
                    path: z.ZodLiteral<"/api/v1/admin/sync/trigger">;
                    body: z.ZodObject<{
                        pageLabel: z.ZodString;
                        scope: z.ZodEnum<{
                            all: "all";
                            messages: "messages";
                            light: "light";
                            followers: "followers";
                            data: "data";
                        }>;
                    }, z.core.$strip>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminUpdatePage: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Update a page";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{
            label: z.ZodOptional<z.ZodString>;
            modelSlug: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                page: z.ZodObject<{
                    id: z.ZodNumber;
                    label: z.ZodString;
                    platform: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    modelSlug: z.ZodString;
                    modelName: z.ZodString;
                    username: z.ZodNullable<z.ZodString>;
                    displayName: z.ZodNullable<z.ZodString>;
                    followerCount: z.ZodObject<{
                        value: z.ZodNullable<z.ZodNumber>;
                        available: z.ZodBoolean;
                    }, z.core.$strip>;
                    subscriberCount: z.ZodObject<{
                        value: z.ZodNullable<z.ZodNumber>;
                        available: z.ZodBoolean;
                    }, z.core.$strip>;
                    lastLightSyncAt: z.ZodNullable<z.ZodString>;
                    lastFollowerSyncAt: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminDeletePage: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Delete a page";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                deleted: z.ZodLiteral<true>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminVerifyCredentials: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Verify credentials without persisting";
        readonly body: z.ZodDiscriminatedUnion<[z.ZodObject<{
            platform: z.ZodLiteral<"fansly">;
            session: z.ZodObject<{
                authorization: z.ZodString;
                fanslyClientId: z.ZodOptional<z.ZodString>;
                fanslyClientCheck: z.ZodOptional<z.ZodString>;
                fanslySessionId: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            proxy: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                url: z.ZodString;
                username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                password: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            }, z.core.$strip>>>;
        }, z.core.$strip>, z.ZodObject<{
            platform: z.ZodLiteral<"onlyfans">;
            username: z.ZodString;
        }, z.core.$strip>], "platform">;
        readonly response: {
            readonly 200: z.ZodObject<{
                valid: z.ZodLiteral<true>;
                platform: z.ZodEnum<{
                    fansly: "fansly";
                    onlyfans: "onlyfans";
                }>;
                username: z.ZodNullable<z.ZodString>;
                displayName: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminTestProxy: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Test a proxy connection and return the exit IP";
        readonly body: z.ZodObject<{
            proxy: z.ZodObject<{
                url: z.ZodString;
                username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                password: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            }, z.core.$strip>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                ip: z.ZodString;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminVerifyPage: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Verify stored credentials for a page";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                verified: z.ZodBoolean;
                username: z.ZodNullable<z.ZodString>;
                platform: z.ZodEnum<{
                    fansly: "fansly";
                    onlyfans: "onlyfans";
                }>;
                syncUnblocked: z.ZodBoolean;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminUpdateCredentials: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Update credentials for an existing page";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strip>;
        readonly body: z.ZodDiscriminatedUnion<[z.ZodObject<{
            platform: z.ZodLiteral<"fansly">;
            session: z.ZodOptional<z.ZodObject<{
                authorization: z.ZodString;
                fanslyClientId: z.ZodOptional<z.ZodString>;
                fanslyClientCheck: z.ZodOptional<z.ZodString>;
                fanslySessionId: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
            proxy: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                url: z.ZodString;
                username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                password: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            }, z.core.$strip>>>;
        }, z.core.$strip>, z.ZodObject<{
            platform: z.ZodLiteral<"onlyfans">;
        }, z.core.$strip>], "platform">;
        readonly response: {
            readonly 200: z.ZodObject<{
                updated: z.ZodBoolean;
                verified: z.ZodBoolean;
                syncUnblocked: z.ZodBoolean;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminLogs: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "List recent sync event logs";
        readonly querystring: z.ZodObject<{
            severity: z.ZodOptional<z.ZodString>;
            limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodArray<z.ZodObject<{
                id: z.ZodNumber;
                syncRunId: z.ZodNumber;
                provider: z.ZodEnum<{
                    fansly: "fansly";
                    onlyfans: "onlyfans";
                }>;
                stream: z.ZodString;
                eventType: z.ZodString;
                severity: z.ZodString;
                message: z.ZodString;
                details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                emittedAt: z.ZodString;
                pageLabel: z.ZodString;
            }, z.core.$strip>>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminQueueJobs: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "List pg-boss jobs";
        readonly querystring: z.ZodObject<{
            state: z.ZodOptional<z.ZodString>;
            name: z.ZodOptional<z.ZodString>;
            limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodString;
                state: z.ZodString;
                data: z.ZodNullable<z.ZodUnknown>;
                createdOn: z.ZodString;
                startedOn: z.ZodNullable<z.ZodString>;
                completedOn: z.ZodNullable<z.ZodString>;
                output: z.ZodNullable<z.ZodUnknown>;
                retryLimit: z.ZodNumber;
                retryCount: z.ZodNumber;
            }, z.core.$strip>>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminDbStats: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "List database table sizes and migrations";
        readonly response: {
            readonly 200: z.ZodObject<{
                tables: z.ZodArray<z.ZodObject<{
                    schema: z.ZodString;
                    table: z.ZodString;
                    rowEstimate: z.ZodNumber;
                    totalBytes: z.ZodNumber;
                    indexBytes: z.ZodNumber;
                }, z.core.$strip>>;
                migrations: z.ZodArray<z.ZodObject<{
                    name: z.ZodString;
                    appliedAt: z.ZodString;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminIncidents: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "List sync incidents and seven-day summary counts";
        readonly querystring: z.ZodObject<{
            severity: z.ZodOptional<z.ZodString>;
            code: z.ZodOptional<z.ZodString>;
            limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                summary: z.ZodArray<z.ZodObject<{
                    code: z.ZodNullable<z.ZodString>;
                    severity: z.ZodString;
                    count: z.ZodNumber;
                }, z.core.$strip>>;
                items: z.ZodArray<z.ZodObject<{
                    id: z.ZodNumber;
                    syncRunId: z.ZodNumber;
                    provider: z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>;
                    stream: z.ZodString;
                    eventType: z.ZodString;
                    severity: z.ZodString;
                    message: z.ZodString;
                    details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                    emittedAt: z.ZodString;
                    pageLabel: z.ZodString;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly notificationsSettings: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["notifications"];
        readonly summary: "Get notification settings and connection status";
        readonly response: {
            readonly 200: z.ZodObject<{
                configured: z.ZodBoolean;
                botTokenSet: z.ZodBoolean;
                chatId: z.ZodNullable<z.ZodString>;
                botTokenSource: z.ZodEnum<{
                    none: "none";
                    env: "env";
                    db: "db";
                }>;
                chatIdSource: z.ZodEnum<{
                    none: "none";
                    env: "env";
                    db: "db";
                }>;
                enabled: z.ZodBoolean;
                dailyReportEnabled: z.ZodBoolean;
                syncFailureAlertsEnabled: z.ZodBoolean;
                reportHourUtc: z.ZodNumber;
                connectionStatus: z.ZodEnum<{
                    connected: "connected";
                    not_configured: "not_configured";
                    untested: "untested";
                    last_message_failed: "last_message_failed";
                }>;
                lastMessageAt: z.ZodNullable<z.ZodString>;
                lastMessageError: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly notificationsSettingsUpdate: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["notifications"];
        readonly summary: "Update notification settings";
        readonly body: z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            dailyReportEnabled: z.ZodOptional<z.ZodBoolean>;
            syncFailureAlertsEnabled: z.ZodOptional<z.ZodBoolean>;
            reportHourUtc: z.ZodOptional<z.ZodNumber>;
            botToken: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            chatId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                configured: z.ZodBoolean;
                botTokenSet: z.ZodBoolean;
                chatId: z.ZodNullable<z.ZodString>;
                botTokenSource: z.ZodEnum<{
                    none: "none";
                    env: "env";
                    db: "db";
                }>;
                chatIdSource: z.ZodEnum<{
                    none: "none";
                    env: "env";
                    db: "db";
                }>;
                enabled: z.ZodBoolean;
                dailyReportEnabled: z.ZodBoolean;
                syncFailureAlertsEnabled: z.ZodBoolean;
                reportHourUtc: z.ZodNumber;
                connectionStatus: z.ZodEnum<{
                    connected: "connected";
                    not_configured: "not_configured";
                    untested: "untested";
                    last_message_failed: "last_message_failed";
                }>;
                lastMessageAt: z.ZodNullable<z.ZodString>;
                lastMessageError: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly notificationsTestMessage: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["notifications"];
        readonly summary: "Send a test Telegram message";
        readonly response: {
            readonly 200: z.ZodObject<{
                status: z.ZodString;
                error: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly notificationsDiscoverChats: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["notifications"];
        readonly summary: "Discover Telegram chats that have messaged the bot";
        readonly body: z.ZodObject<{
            botToken: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                botUsername: z.ZodNullable<z.ZodString>;
                chats: z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    type: z.ZodString;
                    title: z.ZodString;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly notificationsIncidents: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["notifications"];
        readonly summary: "List notification incidents with page context";
        readonly querystring: z.ZodObject<{
            status: z.ZodOptional<z.ZodEnum<{
                open: "open";
                resolved: "resolved";
            }>>;
            kind: z.ZodOptional<z.ZodEnum<{
                auth_blocked: "auth_blocked";
                proxy_failed: "proxy_failed";
                proxy_missing: "proxy_missing";
                stream_failed_threshold: "stream_failed_threshold";
                ofapi_auth: "ofapi_auth";
                ofapi_low_credit: "ofapi_low_credit";
                ofapi_webhook_silence: "ofapi_webhook_silence";
                ofapi_burn_rate: "ofapi_burn_rate";
                db_disk_usage: "db_disk_usage";
                observations_partitions: "observations_partitions";
                wrong_transactions_writer: "wrong_transactions_writer";
                read_gateway_capture: "read_gateway_capture";
                golden_signal_lag: "golden_signal_lag";
                scheduler_silent: "scheduler_silent";
                ops_sampler_silent: "ops_sampler_silent";
            }>>;
            pageLabel: z.ZodOptional<z.ZodString>;
            limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                items: z.ZodArray<z.ZodObject<{
                    id: z.ZodNumber;
                    incidentKey: z.ZodString;
                    kind: z.ZodEnum<{
                        auth_blocked: "auth_blocked";
                        proxy_failed: "proxy_failed";
                        proxy_missing: "proxy_missing";
                        stream_failed_threshold: "stream_failed_threshold";
                        ofapi_auth: "ofapi_auth";
                        ofapi_low_credit: "ofapi_low_credit";
                        ofapi_webhook_silence: "ofapi_webhook_silence";
                        ofapi_burn_rate: "ofapi_burn_rate";
                        db_disk_usage: "db_disk_usage";
                        observations_partitions: "observations_partitions";
                        wrong_transactions_writer: "wrong_transactions_writer";
                        read_gateway_capture: "read_gateway_capture";
                        golden_signal_lag: "golden_signal_lag";
                        scheduler_silent: "scheduler_silent";
                        ops_sampler_silent: "ops_sampler_silent";
                    }>;
                    pageLabel: z.ZodNullable<z.ZodString>;
                    platform: z.ZodNullable<z.ZodEnum<{
                        fansly: "fansly";
                        onlyfans: "onlyfans";
                    }>>;
                    stream: z.ZodNullable<z.ZodString>;
                    status: z.ZodEnum<{
                        open: "open";
                        resolved: "resolved";
                    }>;
                    openedAt: z.ZodString;
                    lastSeenAt: z.ZodString;
                    resolvedAt: z.ZodNullable<z.ZodString>;
                    errorCode: z.ZodNullable<z.ZodString>;
                    errorSummary: z.ZodNullable<z.ZodString>;
                    notificationCount: z.ZodNumber;
                }, z.core.$strip>>;
                total: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly notificationsResolveIncident: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["notifications"];
        readonly summary: "Manually resolve an incident";
        readonly params: z.ZodObject<{
            incidentId: z.ZodCoercedNumber<unknown>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                ok: z.ZodLiteral<true>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly notificationsReportPreview: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["notifications"];
        readonly summary: "Preview the next daily report without sending";
        readonly response: {
            readonly 200: z.ZodObject<{
                text: z.ZodString;
                reportDate: z.ZodString;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly notificationsReportSend: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["notifications"];
        readonly summary: "Manually send a daily report";
        readonly response: {
            readonly 200: z.ZodObject<{
                status: z.ZodString;
                error: z.ZodNullable<z.ZodString>;
                reportDate: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly notificationsReportHistory: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["notifications"];
        readonly summary: "List daily report delivery history";
        readonly response: {
            readonly 200: z.ZodObject<{
                items: z.ZodArray<z.ZodObject<{
                    id: z.ZodNumber;
                    kind: z.ZodEnum<{
                        test: "test";
                        daily_report_scheduled: "daily_report_scheduled";
                        daily_report_manual: "daily_report_manual";
                        incident_opened: "incident_opened";
                        incident_resolved: "incident_resolved";
                        incident_manually_resolved: "incident_manually_resolved";
                    }>;
                    status: z.ZodString;
                    reportDate: z.ZodNullable<z.ZodString>;
                    error: z.ZodNullable<z.ZodString>;
                    createdAt: z.ZodString;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminConfig: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Read effective runtime configuration across processes";
        readonly response: {
            readonly 200: z.ZodObject<{
                generatedAt: z.ZodString;
                roleStatuses: z.ZodArray<z.ZodObject<{
                    role: z.ZodString;
                    status: z.ZodEnum<{
                        active: "active";
                        stale: "stale";
                        missing: "missing";
                    }>;
                }, z.core.$strip>>;
                instances: z.ZodArray<z.ZodObject<{
                    role: z.ZodString;
                    instanceId: z.ZodString;
                    startedAt: z.ZodString;
                    lastSeenAt: z.ZodString;
                    imageTag: z.ZodNullable<z.ZodString>;
                    status: z.ZodEnum<{
                        active: "active";
                        stale: "stale";
                    }>;
                    skippedOverrides: z.ZodArray<z.ZodObject<{
                        key: z.ZodString;
                        reason: z.ZodString;
                    }, z.core.$strip>>;
                }, z.core.$strip>>;
                subsystems: z.ZodArray<z.ZodObject<{
                    subsystem: z.ZodString;
                    items: z.ZodArray<z.ZodObject<{
                        key: z.ZodString;
                        envName: z.ZodString;
                        configField: z.ZodNullable<z.ZodString>;
                        kind: z.ZodEnum<{
                            string: "string";
                            number: "number";
                            boolean: "boolean";
                            alias: "alias";
                            url: "url";
                            secret: "secret";
                            derived: "derived";
                            complex: "complex";
                        }>;
                        subsystem: z.ZodString;
                        label: z.ZodString;
                        default: z.ZodString;
                        editability: z.ZodEnum<{
                            never: "never";
                            staged: "staged";
                            editable: "editable";
                        }>;
                        runtimeApply: z.ZodEnum<{
                            none: "none";
                            live: "live";
                            boot: "boot";
                        }>;
                        comparable: z.ZodBoolean;
                        secret: z.ZodBoolean;
                        note: z.ZodNullable<z.ZodString>;
                        costWarning: z.ZodNullable<z.ZodString>;
                        destructive: z.ZodBoolean;
                        stagedGroup: z.ZodNullable<z.ZodString>;
                        stagedOrder: z.ZodNullable<z.ZodNumber>;
                        requires: z.ZodArray<z.ZodString>;
                        source: z.ZodEnum<{
                            override: "override";
                            env: "env";
                        }>;
                        desired: z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
                        runningState: z.ZodEnum<{
                            unknown: "unknown";
                            off: "off";
                            on: "on";
                        }>;
                        desiredEffective: z.ZodNullable<z.ZodBoolean>;
                        overrideVersion: z.ZodNullable<z.ZodNumber>;
                        pendingApply: z.ZodBoolean;
                        drift: z.ZodBoolean;
                        live: z.ZodBoolean;
                        running: z.ZodArray<z.ZodObject<{
                            role: z.ZodString;
                            instanceId: z.ZodString;
                            value: z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
                            masked: z.ZodBoolean;
                            state: z.ZodNullable<z.ZodEnum<{
                                unknown: "unknown";
                                set: "set";
                                unset: "unset";
                            }>>;
                            lastSeenAt: z.ZodString;
                        }, z.core.$strip>>;
                    }, z.core.$strip>>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminConfigUpdate: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Set runtime config overrides for live (editable, reload) keys";
        readonly body: z.ZodObject<{
            patches: z.ZodArray<z.ZodObject<{
                key: z.ZodString;
                value: z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>;
                expectedVersion: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strip>>;
            note: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                results: z.ZodArray<z.ZodObject<{
                    key: z.ZodString;
                    value: z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>;
                    version: z.ZodNumber;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminConfigClear: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Clear a runtime config override (revert to env)";
        readonly params: z.ZodObject<{
            key: z.ZodString;
        }, z.core.$strip>;
        readonly querystring: z.ZodObject<{
            expectedVersion: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
            note: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                ok: z.ZodLiteral<true>;
                key: z.ZodString;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly adminConfigStaged: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Flip staged-rollout (boot-applied) config flags in the prescribed order";
        readonly body: z.ZodObject<{
            patches: z.ZodArray<z.ZodObject<{
                key: z.ZodString;
                desired: z.ZodNullable<z.ZodBoolean>;
                expectedVersion: z.ZodNumber;
            }, z.core.$strip>>;
            note: z.ZodOptional<z.ZodString>;
            ack: z.ZodBoolean;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                results: z.ZodArray<z.ZodObject<{
                    key: z.ZodString;
                    value: z.ZodNullable<z.ZodBoolean>;
                    version: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
};
export type RouteSchemas = typeof routeSchemas;
export type AuthState = z.infer<typeof authStateSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
export type AdminUser = z.infer<typeof adminUserSchema>;
export type AssignedPage = z.infer<typeof assignedPageSchema>;
export type SyncUxSummary = z.infer<typeof syncUxSummarySchema>;
export type AiUsageEventInput = z.infer<typeof aiUsageEventInputSchema>;
export type AiUsageBatchBody = z.infer<typeof aiUsageBatchBodySchema>;
export type AiUsageBatchResponse = z.infer<typeof aiUsageBatchResponseSchema>;
export type IngestObservationsBody = z.infer<typeof ingestObservationsBodySchema>;
export type IngestObservationsResponse = z.infer<typeof ingestObservationsResponseSchema>;
export type AiGatewayPromptCacheTtl = z.infer<typeof aiGatewayPromptCacheTtlSchema>;
export type AiGatewayReasoningEffort = z.infer<typeof aiGatewayReasoningEffortSchema>;
export type AiGatewayPromptBlock = z.infer<typeof aiGatewayPromptBlockSchema>;
export type AiFeatureDebugPromptBlock = z.infer<typeof aiFeatureDebugPromptBlockSchema>;
export type AiFeatureDebugInputFrame = z.infer<typeof aiFeatureDebugInputFrameSchema>;
export type AiGatewayStreamBody = z.infer<typeof aiGatewayStreamBodySchema>;
export type AiGatewayUsage = z.infer<typeof aiGatewayUsageSchema>;
export type AiGatewayQuota = z.infer<typeof aiGatewayQuotaSchema>;
export type AiGatewayStreamFrame = z.infer<typeof aiGatewayStreamFrameSchema>;
export type AiFeatureStreamFrame = z.infer<typeof aiFeatureStreamFrameSchema>;
export type AiPersonaCatalogItem = z.infer<typeof aiPersonaCatalogItemSchema>;
export type AiPersonaCatalogResponse = z.infer<typeof aiPersonaCatalogResponseSchema>;
export type AdminAiPersona = z.infer<typeof adminAiPersonaSchema>;
export type AdminAiPersonasResponse = z.infer<typeof adminAiPersonasResponseSchema>;
export type AdminAiPersonaCreateBody = z.infer<typeof adminAiPersonaCreateBodySchema>;
export type AdminAiPersonaUpdateBody = z.infer<typeof adminAiPersonaUpdateBodySchema>;
export type SyncEvent = z.infer<typeof syncEventSchema>;
export type NormalizedSyncMessage = z.infer<typeof normalizedSyncMessageSchema>;
export type OfapiWebhookAckResponse = z.infer<typeof ofapiWebhookAckResponseSchema>;
export type OfapiPageMapping = z.infer<typeof ofapiPageMappingSchema>;
export type OfapiWebhookStatusResponse = z.infer<typeof ofapiWebhookStatusResponseSchema>;
export type OfapiWebhookReconcileBody = z.infer<typeof ofapiWebhookReconcileBodySchema>;
export type OfapiCaptureSeedBody = z.infer<typeof ofapiCaptureSeedBodySchema>;
export type OfapiCaptureSeedResponse = z.infer<typeof ofapiCaptureSeedResponseSchema>;
export type OfapiCaptureOperatorStatusResponse = z.infer<typeof ofapiCaptureOperatorStatusResponseSchema>;
export type OfapiCaptureControlBody = z.infer<typeof ofapiCaptureControlBodySchema>;
export type OfapiCaptureControlResponse = z.infer<typeof ofapiCaptureControlResponseSchema>;
export type OfapiCaptureAttemptResolveBody = z.infer<typeof ofapiCaptureAttemptResolveBodySchema>;
export type OfapiCaptureAttemptResolveResponse = z.infer<typeof ofapiCaptureAttemptResolveResponseSchema>;
export type OfapiCaptureJobReplayBody = z.infer<typeof ofapiCaptureJobReplayBodySchema>;
export type OfapiCaptureJobReplayResponse = z.infer<typeof ofapiCaptureJobReplayResponseSchema>;
export type OfapiCoverageRevokeBody = z.infer<typeof ofapiCoverageRevokeBodySchema>;
export type OfapiCoverageRevokeResponse = z.infer<typeof ofapiCoverageRevokeResponseSchema>;
export type OfapiExportCreateReconcileBody = z.infer<typeof ofapiExportCreateReconcileBodySchema>;
export type OfapiExportCreateReconcileResponse = z.infer<typeof ofapiExportCreateReconcileResponseSchema>;
export type OfapiExportQuoteBody = z.infer<typeof ofapiExportQuoteBodySchema>;
export type OfapiExportQuoteCreateResponse = z.infer<typeof ofapiExportQuoteCreateResponseSchema>;
export type OfapiExportQuoteStatusResponse = z.infer<typeof ofapiExportQuoteStatusResponseSchema>;
export type OfapiExportQuoteCancelBody = z.infer<typeof ofapiExportQuoteCancelBodySchema>;
export type OfapiCreditsSummaryResponse = z.infer<typeof ofapiCreditsSummaryResponseSchema>;
export type OfapiCreditsChatterSummaryResponse = z.infer<typeof ofapiCreditsChatterSummaryResponseSchema>;
export type OfapiCreditsDailyResponse = z.infer<typeof ofapiCreditsDailyResponseSchema>;
export type AdminOfapiCreditsLedgerQuery = z.infer<typeof adminOfapiCreditsLedgerQuerySchema>;
export type AdminOfapiCreditsLedgerCsvQuery = z.infer<typeof adminOfapiCreditsLedgerCsvQuerySchema>;
export type OfapiCreditsLedgerResponse = z.infer<typeof ofapiCreditsLedgerResponseSchema>;
export type AdminOfapiSpendComparisonQuery = z.infer<typeof adminOfapiSpendComparisonQuerySchema>;
export type OfapiSpendComparisonResponse = z.infer<typeof ofapiSpendComparisonResponseSchema>;
export type OfapiDmColdArchiveStatusResponse = z.infer<typeof ofapiDmColdArchiveStatusResponseSchema>;
export type OfapiWebhookRegisterBody = z.infer<typeof ofapiWebhookRegisterBodySchema>;
export type OfapiWebhookRegisterResponse = z.infer<typeof ofapiWebhookRegisterResponseSchema>;
export type AdminChatterUsageQuery = z.infer<typeof adminChatterUsageQuerySchema>;
export type AdminChatterUsageResponse = z.infer<typeof adminChatterUsageResponseSchema>;
export type CrossPageFanDetailResponse = z.infer<typeof crossPageFanDetailResponseSchema>;
export type FanListQuery = z.infer<typeof fanListQuerySchema>;
export type FanListResponse = z.infer<typeof fanListResponseSchema>;
export type FanLookupParams = z.infer<typeof fanLookupParamsSchema>;
export type FollowerDailyResponse = z.infer<typeof followerDailyResponseSchema>;
export type FollowerListQuery = z.infer<typeof followerListQuerySchema>;
export type FollowerListResponse = z.infer<typeof followerListResponseSchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type ModelListItem = z.infer<typeof modelListItemSchema>;
export type AdminModelListItem = z.infer<typeof adminModelListItemSchema>;
export type ModelParams = z.infer<typeof modelParamsSchema>;
export type ModelRevenueResponse = z.infer<typeof modelRevenueResponseSchema>;
export type OverviewGrowthResponse = z.infer<typeof overviewGrowthResponseSchema>;
export type OverviewResponse = z.infer<typeof overviewResponseSchema>;
export type OverviewRevenueResponse = z.infer<typeof overviewRevenueResponseSchema>;
export type PageFanDetailResponse = z.infer<typeof pageFanDetailResponseSchema>;
export type FanProfileDocument = z.infer<typeof fanProfileDocumentSchema>;
export type FanProfileResponse = z.infer<typeof fanProfileResponseSchema>;
export type FanProfileVersionListResponse = z.infer<typeof fanProfileVersionListResponseSchema>;
export type PageFanParams = z.infer<typeof pageFanParamsSchema>;
export type FanProfileVersionParams = z.infer<typeof fanProfileVersionParamsSchema>;
export type PageParams = z.infer<typeof pageParamsSchema>;
export type PageConversationProfileParams = z.infer<typeof pageConversationProfileParamsSchema>;
export type PageRevenueResponse = z.infer<typeof pageRevenueResponseSchema>;
export type PlatformRevenueWindow = z.infer<typeof platformRevenueWindowSchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type RevenueQuery = z.infer<typeof revenueQuerySchema>;
export type RevenueDailyQuery = z.infer<typeof revenueDailyQuerySchema>;
export type RevenueDailyItem = z.infer<typeof revenueDailyItemSchema>;
export type RevenueDailyTypedItem = z.infer<typeof revenueDailyTypedItemSchema>;
export type RevenueDailyResponse = z.infer<typeof revenueDailyResponseSchema>;
export type SubscriberDailyResponse = z.infer<typeof subscriberDailyResponseSchema>;
export type SubscriberListQuery = z.infer<typeof subscriberListQuerySchema>;
export type SubscriberListResponse = z.infer<typeof subscriberListResponseSchema>;
export type TransactionListQuery = z.infer<typeof transactionListQuerySchema>;
export type TransactionListResponse = z.infer<typeof transactionListResponseSchema>;
export type CrossPageTransactionItem = z.infer<typeof crossPageTransactionItemSchema>;
export type CrossPageTransactionListQuery = z.infer<typeof crossPageTransactionListQuerySchema>;
export type CrossPageTransactionListResponse = z.infer<typeof crossPageTransactionListResponseSchema>;
export type FanTransactionItem = z.infer<typeof fanTransactionItemSchema>;
export type FanTransactionListResponse = z.infer<typeof fanTransactionListResponseSchema>;
export type CrossPageFanTransactionItem = z.infer<typeof crossPageFanTransactionItemSchema>;
export type CrossPageFanTransactionListResponse = z.infer<typeof crossPageFanTransactionListResponseSchema>;
export type UpsertFanProfileBody = z.infer<typeof upsertFanProfileBodySchema>;
export type CreateFanNoteBody = z.infer<typeof createFanNoteBodySchema>;
export type FanNoteResponse = z.infer<typeof fanNoteResponseSchema>;
export type SetFanFlagsBody = z.infer<typeof setFanFlagsBodySchema>;
export type FanFlagsResponse = z.infer<typeof fanFlagsResponseSchema>;
export type FansSearchQuery = z.infer<typeof fansSearchQuerySchema>;
export type FansSearchResponse = z.infer<typeof fansSearchResponseSchema>;
export type PageDeletedFansResponse = z.infer<typeof pageDeletedFansResponseSchema>;
export type PageConversationPreviewParams = z.infer<typeof pageConversationPreviewParamsSchema>;
export type PageConversationPreviewQuery = z.infer<typeof pageConversationPreviewQuerySchema>;
export type PageConversationPreviewResponse = z.infer<typeof pageConversationPreviewResponseSchema>;
export type PageConversationMessagesParams = z.infer<typeof pageConversationMessagesParamsSchema>;
export type PageConversationMessagesQuery = z.infer<typeof pageConversationMessagesQuerySchema>;
export type PageConversationMessagesResponse = z.infer<typeof pageConversationMessagesResponseSchema>;
export type PageSpenderAutoListParams = z.infer<typeof pageSpenderAutoListParamsSchema>;
export type PageSpenderAutoListDetailResponse = z.infer<typeof pageSpenderAutoListDetailResponseSchema>;
export type PageSpenderAutoListsResponse = z.infer<typeof pageSpenderAutoListsResponseSchema>;
export type SpenderBatchBody = z.infer<typeof spenderBatchBodySchema>;
export type SpenderBatchResponse = z.infer<typeof spenderBatchResponseSchema>;
export type SpenderDetailQuery = z.infer<typeof spenderDetailQuerySchema>;
export type SpenderDetailResponse = z.infer<typeof spenderDetailResponseSchema>;
export type SpenderListQuery = z.infer<typeof spenderListQuerySchema>;
export type SpenderListResponse = z.infer<typeof spenderListResponseSchema>;
export type SpenderSeriesQuery = z.infer<typeof spenderSeriesQuerySchema>;
export type SpenderSeriesResponse = z.infer<typeof spenderSeriesResponseSchema>;
export type AdminCreateUserBody = z.infer<typeof adminCreateUserBodySchema>;
export type AdminSetPasswordBody = z.infer<typeof adminSetPasswordBodySchema>;
export type AdminAssignPageBody = z.infer<typeof adminAssignPageBodySchema>;
export type AdminIssueApiKeyBody = z.infer<typeof adminIssueApiKeyBodySchema>;
export type ApiKeyItem = z.infer<typeof apiKeyItemSchema>;
export type IssuedApiKeyResponse = z.infer<typeof issuedApiKeyResponseSchema>;
export type SyncRunItem = z.infer<typeof syncRunItemSchema>;
export type SyncRunDetailResponse = z.infer<typeof syncRunDetailResponseSchema>;
export type SyncStatusQuery = z.infer<typeof syncStatusQuerySchema>;
export type SyncMonitorResponse = z.infer<typeof syncStatusResponseSchema>;
export type SyncRequestsQuery = z.infer<typeof syncRequestsQuerySchema>;
export type SyncRequestItem = z.infer<typeof syncRequestItemSchema>;
export type SyncRequestsResponse = z.infer<typeof syncRequestsResponseSchema>;
export type SyncDiagnosis = z.infer<typeof syncDiagnosisSchema>;
export type SyncBlockStatus = z.infer<typeof syncBlockStatusSchema>;
export type SyncBlocksPage = z.infer<typeof syncBlocksPageSchema>;
export type SyncOverviewResponse = z.infer<typeof syncOverviewResponseSchema>;
export type PageSyncBlocksResponse = z.infer<typeof pageSyncBlocksResponseSchema>;
export type PageMessagesBlockResponse = z.infer<typeof pageMessagesBlockResponseSchema>;
export type AdminSyncBlockBody = z.infer<typeof adminSyncBlockBodySchema>;
export type AdminSyncBlockResponse = z.infer<typeof adminSyncBlockResponseSchema>;
export type SyncTriggerBody = z.infer<typeof syncTriggerBodySchema>;
export type SyncTriggerResponse = z.infer<typeof syncTriggerResponseSchema>;
export type SyncTriggerAllResponse = z.infer<typeof syncTriggerAllResponseSchema>;
export type SyncRunsQuery = z.infer<typeof syncRunsQuerySchema>;
export type ConnectionItem = z.infer<typeof connectionItemSchema>;
export type VerifyCredentialsBody = z.infer<typeof verifyCredentialsBodySchema>;
export type VerifyCredentialsResponse = z.infer<typeof verifyCredentialsResponseSchema>;
export type TestProxyBody = z.infer<typeof testProxyBodySchema>;
export type TestProxyResponse = z.infer<typeof testProxyResponseSchema>;
export type CreateModelBody = z.infer<typeof createModelBodySchema>;
export type UpdateModelBody = z.infer<typeof updateModelBodySchema>;
export type CreateModelResponse = z.infer<typeof createModelResponseSchema>;
export type CreatePageBody = z.infer<typeof createPageBodySchema>;
export type UpdatePageBody = z.infer<typeof updatePageBodySchema>;
export type AdminCreatePageResponse = z.infer<typeof adminCreatePageResponseSchema>;
export type AdminUpdatePageResponse = z.infer<typeof adminUpdatePageResponseSchema>;
export type UpdateCredentialsBody = z.infer<typeof updateCredentialsBodySchema>;
export type UpdateCredentialsResponse = z.infer<typeof updateCredentialsResponseSchema>;
export type VerifyPageResponse = z.infer<typeof verifyPageResponseSchema>;
export type DeletedResponse = z.infer<typeof deletedResponseSchema>;
export type ConfigViewResponse = z.infer<typeof configViewResponseSchema>;
export type ConfigItem = z.infer<typeof configItemSchema>;
export type ConfigUpdateBody = z.infer<typeof configUpdateBodySchema>;
export type ConfigUpdateResponse = z.infer<typeof configUpdateResponseSchema>;
export type ConfigClearQuery = z.infer<typeof configClearQuerySchema>;
export type ConfigClearResponse = z.infer<typeof configClearResponseSchema>;
export type ConfigStagedBody = z.infer<typeof configStagedBodySchema>;
export type ConfigStagedResponse = z.infer<typeof configStagedResponseSchema>;
export type NotificationsSettingsResponse = z.infer<typeof notificationsSettingsResponseSchema>;
export type NotificationsSettingsUpdateBody = z.infer<typeof notificationsSettingsUpdateBodySchema>;
export type NotificationsTestMessageResponse = z.infer<typeof notificationsTestMessageResponseSchema>;
export type NotificationsDiscoverChatsBody = z.infer<typeof notificationsDiscoverChatsBodySchema>;
export type NotificationsDiscoverChatsResponse = z.infer<typeof notificationsDiscoverChatsResponseSchema>;
export type NotificationsIncidentsQuery = z.infer<typeof notificationsIncidentsQuerySchema>;
export type NotificationsIncidentsResponse = z.infer<typeof notificationsIncidentsResponseSchema>;
export type NotificationsIncidentItem = z.infer<typeof notificationsIncidentItemSchema>;
export type NotificationsReportPreviewResponse = z.infer<typeof notificationsReportPreviewResponseSchema>;
export type NotificationsReportSendResponse = z.infer<typeof notificationsReportSendResponseSchema>;
export type NotificationsDeliveryAttemptItem = z.infer<typeof notificationsDeliveryAttemptItemSchema>;
export type NotificationsReportHistoryResponse = z.infer<typeof notificationsReportHistoryResponseSchema>;
export type WorkboardV2Query = z.infer<typeof workboardV2QuerySchema>;
export type WorkboardV2Item = z.infer<typeof workboardV2ItemSchema>;
export type WorkboardV2Response = z.infer<typeof workboardV2ResponseSchema>;
export type WorkboardV2ListsResponse = z.infer<typeof workboardV2ListsResponseSchema>;
export type WorkboardV2ContactBody = z.infer<typeof workboardV2ContactBodySchema>;
export type WorkboardV2RecomputeResponse = z.infer<typeof workboardV2RecomputeResponseSchema>;
export type WorkboardV2SnoozeBody = z.infer<typeof workboardV2SnoozeBodySchema>;
export type WorkboardV2AiReport = z.infer<typeof workboardV2AiReportSchema>;
export type WorkboardV2AiSettings = z.infer<typeof workboardV2AiSettingsSchema>;
export type WorkboardV2AiSettingsBody = z.infer<typeof workboardV2AiSettingsBodySchema>;
export type WorkboardV2AiClassifyBody = z.infer<typeof workboardV2AiClassifyBodySchema>;
export type WorkboardV2AiClassifyResponse = z.infer<typeof workboardV2AiClassifyResponseSchema>;
export type WorkboardV2AiRun = z.infer<typeof workboardV2AiRunSchema>;
export type WorkboardV2AiRunsResponse = z.infer<typeof workboardV2AiRunsResponseSchema>;
export type DomainEventFrame = z.infer<typeof domainEventFrameSchema>;
export type DomainEventsSnapshotRequired = z.infer<typeof domainEventsSnapshotRequiredResponseSchema>;
export type DomainEventsSnapshotResponse = z.infer<typeof domainEventsSnapshotResponseSchema>;
export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;
export type DeviceTokenItem = z.infer<typeof deviceTokenItemSchema>;
export type IssuedDeviceTokenResponse = z.infer<typeof issuedDeviceTokenResponseSchema>;
export type AccessGrantItem = z.infer<typeof accessGrantItemSchema>;
export type WorkboardClaimLeaseItem = z.infer<typeof workboardClaimLeaseSchema>;
