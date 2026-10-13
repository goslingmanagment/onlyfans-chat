import { z } from "zod";
export declare const ofapiCollectionCategorySchema: z.ZodEnum<{
    core_messages: "core_messages";
    core_payments: "core_payments";
    core_audience: "core_audience";
    posts_comments: "posts_comments";
    visitors: "visitors";
    tracking_links: "tracking_links";
    smart_links: "smart_links";
    vault_catalog: "vault_catalog";
    vault_files: "vault_files";
    balances: "balances";
    profile_notifications: "profile_notifications";
    content_history: "content_history";
    media_previews: "media_previews";
    account_settings: "account_settings";
}>;
export declare const ofapiCollectionSettingsSchema: z.ZodObject<{
    pageId: z.ZodNullable<z.ZodNumber>;
    category: z.ZodEnum<{
        core_messages: "core_messages";
        core_payments: "core_payments";
        core_audience: "core_audience";
        posts_comments: "posts_comments";
        visitors: "visitors";
        tracking_links: "tracking_links";
        smart_links: "smart_links";
        vault_catalog: "vault_catalog";
        vault_files: "vault_files";
        balances: "balances";
        profile_notifications: "profile_notifications";
        content_history: "content_history";
        media_previews: "media_previews";
        account_settings: "account_settings";
    }>;
    mode: z.ZodEnum<{
        off: "off";
        on_demand: "on_demand";
        scheduled: "scheduled";
    }>;
    intervalMinutes: z.ZodNumber;
    dailyCreditLimit: z.ZodNumber;
    maxCallsPerRun: z.ZodNumber;
    includeDetails: z.ZodBoolean;
}, z.core.$strict>;
export declare const ofapiCollectionChangeSchema: z.ZodObject<{
    expectedRevision: z.ZodNumber;
    changes: z.ZodArray<z.ZodObject<{
        pageId: z.ZodNullable<z.ZodNumber>;
        category: z.ZodEnum<{
            core_messages: "core_messages";
            core_payments: "core_payments";
            core_audience: "core_audience";
            posts_comments: "posts_comments";
            visitors: "visitors";
            tracking_links: "tracking_links";
            smart_links: "smart_links";
            vault_catalog: "vault_catalog";
            vault_files: "vault_files";
            balances: "balances";
            profile_notifications: "profile_notifications";
            content_history: "content_history";
            media_previews: "media_previews";
            account_settings: "account_settings";
        }>;
        mode: z.ZodEnum<{
            off: "off";
            on_demand: "on_demand";
            scheduled: "scheduled";
        }>;
        intervalMinutes: z.ZodNumber;
        dailyCreditLimit: z.ZodNumber;
        maxCallsPerRun: z.ZodNumber;
        includeDetails: z.ZodBoolean;
    }, z.core.$strict>>;
    backgroundPaused: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>;
export declare const ofapiCollectionJobSchema: z.ZodObject<{
    pageId: z.ZodNumber;
    category: z.ZodEnum<{
        core_messages: "core_messages";
        core_payments: "core_payments";
        core_audience: "core_audience";
        posts_comments: "posts_comments";
        visitors: "visitors";
        tracking_links: "tracking_links";
        smart_links: "smart_links";
        vault_catalog: "vault_catalog";
        vault_files: "vault_files";
        balances: "balances";
        profile_notifications: "profile_notifications";
        content_history: "content_history";
        media_previews: "media_previews";
        account_settings: "account_settings";
    }>;
    expectedRevision: z.ZodNumber;
    maxCredits: z.ZodNumber;
    maxCalls: z.ZodNumber;
    maxBytes: z.ZodNumber;
    from: z.ZodNullable<z.ZodISODateTime>;
    to: z.ZodNullable<z.ZodISODateTime>;
    selection: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
/** Which of a run's own ceilings ended it (admission says only `job_limit`). */
export declare const ofapiCollectionExhaustedCapSchema: z.ZodEnum<{
    bytes: "bytes";
    credits: "credits";
    calls: "calls";
}>;
/** One scheduled (background) run of a page and category. */
export declare const ofapiCollectionRunSummarySchema: z.ZodObject<{
    id: z.ZodString;
    state: z.ZodString;
    reason: z.ZodNullable<z.ZodString>;
    exhaustedLimit: z.ZodNullable<z.ZodString>;
    exhaustedCap: z.ZodNullable<z.ZodEnum<{
        bytes: "bytes";
        credits: "credits";
        calls: "calls";
    }>>;
    usedCalls: z.ZodNumber;
    maxCalls: z.ZodNumber;
    usedCredits: z.ZodNumber;
    maxCredits: z.ZodNumber;
    usedBytes: z.ZodNumber;
    maxBytes: z.ZodNumber;
    stepsDone: z.ZodNullable<z.ZodNumber>;
    stepsTotal: z.ZodNullable<z.ZodNumber>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, z.core.$strip>;
/** Traffic plan §2.8 п. 3: a scheduled category is stale when none of its runs
 * completed for more than two intervals (counted from the later of its last
 * completed run and the policy's last change). */
export declare const ofapiCollectionScheduleHealthSchema: z.ZodObject<{
    expected: z.ZodBoolean;
    stale: z.ZodBoolean;
    staleAt: z.ZodNullable<z.ZodString>;
    lastCompletedAt: z.ZodNullable<z.ZodString>;
    lastRun: z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        state: z.ZodString;
        reason: z.ZodNullable<z.ZodString>;
        exhaustedLimit: z.ZodNullable<z.ZodString>;
        exhaustedCap: z.ZodNullable<z.ZodEnum<{
            bytes: "bytes";
            credits: "credits";
            calls: "calls";
        }>>;
        usedCalls: z.ZodNumber;
        maxCalls: z.ZodNumber;
        usedCredits: z.ZodNumber;
        maxCredits: z.ZodNumber;
        usedBytes: z.ZodNumber;
        maxBytes: z.ZodNumber;
        stepsDone: z.ZodNullable<z.ZodNumber>;
        stepsTotal: z.ZodNullable<z.ZodNumber>;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
/** Job list filter: `unfinished` = queued, running or paused. */
export declare const ofapiCollectionJobStateFilterSchema: z.ZodEnum<{
    failed: "failed";
    unfinished: "unfinished";
    queued: "queued";
    running: "running";
    paused: "paused";
    completed: "completed";
}>;
export declare const ofapiCollectionSnapshotSchema: z.ZodObject<{
    revision: z.ZodNumber;
    backgroundPaused: z.ZodBoolean;
    catalog: z.ZodArray<z.ZodObject<{
        id: z.ZodEnum<{
            core_messages: "core_messages";
            core_payments: "core_payments";
            core_audience: "core_audience";
            posts_comments: "posts_comments";
            visitors: "visitors";
            tracking_links: "tracking_links";
            smart_links: "smart_links";
            vault_catalog: "vault_catalog";
            vault_files: "vault_files";
            balances: "balances";
            profile_notifications: "profile_notifications";
            content_history: "content_history";
            media_previews: "media_previews";
            account_settings: "account_settings";
        }>;
        label: z.ZodString;
        modes: z.ZodArray<z.ZodEnum<{
            off: "off";
            on_demand: "on_demand";
            scheduled: "scheduled";
        }>>;
        baseline: z.ZodBoolean;
        consumers: z.ZodArray<z.ZodString>;
        supportsOneOff: z.ZodBoolean;
        priceUnit: z.ZodEnum<{
            calls_and_bytes: "calls_and_bytes";
            physical_calls: "physical_calls";
        }>;
        prerequisites: z.ZodArray<z.ZodString>;
        scope: z.ZodLiteral<"page">;
        legacyOperations: z.ZodArray<z.ZodString>;
        noScheduledReads: z.ZodBoolean;
    }, z.core.$strip>>;
    pages: z.ZodArray<z.ZodObject<{
        id: z.ZodNumber;
        label: z.ZodString;
        accountId: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    policies: z.ZodArray<z.ZodObject<{
        pageId: z.ZodNullable<z.ZodNumber>;
        category: z.ZodEnum<{
            core_messages: "core_messages";
            core_payments: "core_payments";
            core_audience: "core_audience";
            posts_comments: "posts_comments";
            visitors: "visitors";
            tracking_links: "tracking_links";
            smart_links: "smart_links";
            vault_catalog: "vault_catalog";
            vault_files: "vault_files";
            balances: "balances";
            profile_notifications: "profile_notifications";
            content_history: "content_history";
            media_previews: "media_previews";
            account_settings: "account_settings";
        }>;
        mode: z.ZodEnum<{
            off: "off";
            on_demand: "on_demand";
            scheduled: "scheduled";
        }>;
        intervalMinutes: z.ZodNumber;
        dailyCreditLimit: z.ZodNumber;
        maxCallsPerRun: z.ZodNumber;
        includeDetails: z.ZodBoolean;
        revision: z.ZodNumber;
        source: z.ZodEnum<{
            page: "page";
            default: "default";
            legacy_baseline: "legacy_baseline";
            default_off: "default_off";
        }>;
        state: z.ZodEnum<{
            applied: "applied";
            baseline: "baseline";
        }>;
        backgroundPaused: z.ZodBoolean;
        usage: z.ZodObject<{
            callsToday: z.ZodNumber;
            reservedCreditsToday: z.ZodNumber;
            credits30d: z.ZodNumber;
            actualCreditsToday: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strip>;
        lastCapturedAt: z.ZodNullable<z.ZodString>;
        inFlight: z.ZodNumber;
        scheduleHealth: z.ZodObject<{
            expected: z.ZodBoolean;
            stale: z.ZodBoolean;
            staleAt: z.ZodNullable<z.ZodString>;
            lastCompletedAt: z.ZodNullable<z.ZodString>;
            lastRun: z.ZodNullable<z.ZodObject<{
                id: z.ZodString;
                state: z.ZodString;
                reason: z.ZodNullable<z.ZodString>;
                exhaustedLimit: z.ZodNullable<z.ZodString>;
                exhaustedCap: z.ZodNullable<z.ZodEnum<{
                    bytes: "bytes";
                    credits: "credits";
                    calls: "calls";
                }>>;
                usedCalls: z.ZodNumber;
                maxCalls: z.ZodNumber;
                usedCredits: z.ZodNumber;
                maxCredits: z.ZodNumber;
                usedBytes: z.ZodNumber;
                maxBytes: z.ZodNumber;
                stepsDone: z.ZodNullable<z.ZodNumber>;
                stepsTotal: z.ZodNullable<z.ZodNumber>;
                createdAt: z.ZodString;
                updatedAt: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
    }, z.core.$strict>>;
    jobs: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        pageId: z.ZodNumber;
        category: z.ZodEnum<{
            core_messages: "core_messages";
            core_payments: "core_payments";
            core_audience: "core_audience";
            posts_comments: "posts_comments";
            visitors: "visitors";
            tracking_links: "tracking_links";
            smart_links: "smart_links";
            vault_catalog: "vault_catalog";
            vault_files: "vault_files";
            balances: "balances";
            profile_notifications: "profile_notifications";
            content_history: "content_history";
            media_previews: "media_previews";
            account_settings: "account_settings";
        }>;
        state: z.ZodString;
        maxCredits: z.ZodNumber;
        maxCalls: z.ZodNumber;
        maxBytes: z.ZodNumber;
        usedCredits: z.ZodNumber;
        usedCalls: z.ZodNumber;
        usedBytes: z.ZodNumber;
        createdAt: z.ZodString;
        reason: z.ZodNullable<z.ZodString>;
        canFinishIncomplete: z.ZodBoolean;
        exhaustedCap: z.ZodNullable<z.ZodEnum<{
            bytes: "bytes";
            credits: "credits";
            calls: "calls";
        }>>;
        stepsDone: z.ZodNullable<z.ZodNumber>;
        stepsTotal: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>;
    jobsTotal: z.ZodNumber;
    audit: z.ZodArray<z.ZodObject<{
        revision: z.ZodNumber;
        actorUserId: z.ZodNumber;
        createdAt: z.ZodString;
        changes: z.ZodUnknown;
    }, z.core.$strip>>;
    limitDescription: z.ZodString;
}, z.core.$strip>;
export declare const ofapiCollectionPreviewSchema: z.ZodObject<{
    revision: z.ZodNumber;
    changes: z.ZodArray<z.ZodObject<{
        pageId: z.ZodNullable<z.ZodNumber>;
        category: z.ZodEnum<{
            core_messages: "core_messages";
            core_payments: "core_payments";
            core_audience: "core_audience";
            posts_comments: "posts_comments";
            visitors: "visitors";
            tracking_links: "tracking_links";
            smart_links: "smart_links";
            vault_catalog: "vault_catalog";
            vault_files: "vault_files";
            balances: "balances";
            profile_notifications: "profile_notifications";
            content_history: "content_history";
            media_previews: "media_previews";
            account_settings: "account_settings";
        }>;
        mode: z.ZodEnum<{
            off: "off";
            on_demand: "on_demand";
            scheduled: "scheduled";
        }>;
        intervalMinutes: z.ZodNumber;
        dailyCreditLimit: z.ZodNumber;
        maxCallsPerRun: z.ZodNumber;
        includeDetails: z.ZodBoolean;
    }, z.core.$strict>>;
    backgroundPaused: z.ZodBoolean;
    cost: z.ZodObject<{
        source: z.ZodLiteral<"unknown">;
        estimatedCredits: z.ZodNull;
        maximumNewCreditsPerDay: z.ZodNumber;
    }, z.core.$strip>;
    consequences: z.ZodArray<z.ZodString>;
    inFlight: z.ZodNumber;
}, z.core.$strip>;
export declare const ofapiCollectionRouteSchemas: {
    readonly ofapiCollectionGet: {
        readonly auth: {
            readonly kind: "session";
        };
        readonly tags: readonly ["ops"];
        readonly summary: "Read effective OFAPI collection policy and retained usage";
        readonly description: "Jobs list paused runs first, then newest, at most 100; `jobState` narrows the list (`unfinished` = queued, running or paused) and an unfinished-state filter returns every match. `jobsTotal` counts all matches.";
        readonly querystring: z.ZodObject<{
            pageId: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
            jobState: z.ZodOptional<z.ZodEnum<{
                failed: "failed";
                unfinished: "unfinished";
                queued: "queued";
                running: "running";
                paused: "paused";
                completed: "completed";
            }>>;
        }, z.core.$strip>;
        readonly response: {
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
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 200: z.ZodObject<{
                revision: z.ZodNumber;
                backgroundPaused: z.ZodBoolean;
                catalog: z.ZodArray<z.ZodObject<{
                    id: z.ZodEnum<{
                        core_messages: "core_messages";
                        core_payments: "core_payments";
                        core_audience: "core_audience";
                        posts_comments: "posts_comments";
                        visitors: "visitors";
                        tracking_links: "tracking_links";
                        smart_links: "smart_links";
                        vault_catalog: "vault_catalog";
                        vault_files: "vault_files";
                        balances: "balances";
                        profile_notifications: "profile_notifications";
                        content_history: "content_history";
                        media_previews: "media_previews";
                        account_settings: "account_settings";
                    }>;
                    label: z.ZodString;
                    modes: z.ZodArray<z.ZodEnum<{
                        off: "off";
                        on_demand: "on_demand";
                        scheduled: "scheduled";
                    }>>;
                    baseline: z.ZodBoolean;
                    consumers: z.ZodArray<z.ZodString>;
                    supportsOneOff: z.ZodBoolean;
                    priceUnit: z.ZodEnum<{
                        calls_and_bytes: "calls_and_bytes";
                        physical_calls: "physical_calls";
                    }>;
                    prerequisites: z.ZodArray<z.ZodString>;
                    scope: z.ZodLiteral<"page">;
                    legacyOperations: z.ZodArray<z.ZodString>;
                    noScheduledReads: z.ZodBoolean;
                }, z.core.$strip>>;
                pages: z.ZodArray<z.ZodObject<{
                    id: z.ZodNumber;
                    label: z.ZodString;
                    accountId: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>>;
                policies: z.ZodArray<z.ZodObject<{
                    pageId: z.ZodNullable<z.ZodNumber>;
                    category: z.ZodEnum<{
                        core_messages: "core_messages";
                        core_payments: "core_payments";
                        core_audience: "core_audience";
                        posts_comments: "posts_comments";
                        visitors: "visitors";
                        tracking_links: "tracking_links";
                        smart_links: "smart_links";
                        vault_catalog: "vault_catalog";
                        vault_files: "vault_files";
                        balances: "balances";
                        profile_notifications: "profile_notifications";
                        content_history: "content_history";
                        media_previews: "media_previews";
                        account_settings: "account_settings";
                    }>;
                    mode: z.ZodEnum<{
                        off: "off";
                        on_demand: "on_demand";
                        scheduled: "scheduled";
                    }>;
                    intervalMinutes: z.ZodNumber;
                    dailyCreditLimit: z.ZodNumber;
                    maxCallsPerRun: z.ZodNumber;
                    includeDetails: z.ZodBoolean;
                    revision: z.ZodNumber;
                    source: z.ZodEnum<{
                        page: "page";
                        default: "default";
                        legacy_baseline: "legacy_baseline";
                        default_off: "default_off";
                    }>;
                    state: z.ZodEnum<{
                        applied: "applied";
                        baseline: "baseline";
                    }>;
                    backgroundPaused: z.ZodBoolean;
                    usage: z.ZodObject<{
                        callsToday: z.ZodNumber;
                        reservedCreditsToday: z.ZodNumber;
                        credits30d: z.ZodNumber;
                        actualCreditsToday: z.ZodNullable<z.ZodNumber>;
                    }, z.core.$strip>;
                    lastCapturedAt: z.ZodNullable<z.ZodString>;
                    inFlight: z.ZodNumber;
                    scheduleHealth: z.ZodObject<{
                        expected: z.ZodBoolean;
                        stale: z.ZodBoolean;
                        staleAt: z.ZodNullable<z.ZodString>;
                        lastCompletedAt: z.ZodNullable<z.ZodString>;
                        lastRun: z.ZodNullable<z.ZodObject<{
                            id: z.ZodString;
                            state: z.ZodString;
                            reason: z.ZodNullable<z.ZodString>;
                            exhaustedLimit: z.ZodNullable<z.ZodString>;
                            exhaustedCap: z.ZodNullable<z.ZodEnum<{
                                bytes: "bytes";
                                credits: "credits";
                                calls: "calls";
                            }>>;
                            usedCalls: z.ZodNumber;
                            maxCalls: z.ZodNumber;
                            usedCredits: z.ZodNumber;
                            maxCredits: z.ZodNumber;
                            usedBytes: z.ZodNumber;
                            maxBytes: z.ZodNumber;
                            stepsDone: z.ZodNullable<z.ZodNumber>;
                            stepsTotal: z.ZodNullable<z.ZodNumber>;
                            createdAt: z.ZodString;
                            updatedAt: z.ZodString;
                        }, z.core.$strip>>;
                    }, z.core.$strip>;
                }, z.core.$strict>>;
                jobs: z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    pageId: z.ZodNumber;
                    category: z.ZodEnum<{
                        core_messages: "core_messages";
                        core_payments: "core_payments";
                        core_audience: "core_audience";
                        posts_comments: "posts_comments";
                        visitors: "visitors";
                        tracking_links: "tracking_links";
                        smart_links: "smart_links";
                        vault_catalog: "vault_catalog";
                        vault_files: "vault_files";
                        balances: "balances";
                        profile_notifications: "profile_notifications";
                        content_history: "content_history";
                        media_previews: "media_previews";
                        account_settings: "account_settings";
                    }>;
                    state: z.ZodString;
                    maxCredits: z.ZodNumber;
                    maxCalls: z.ZodNumber;
                    maxBytes: z.ZodNumber;
                    usedCredits: z.ZodNumber;
                    usedCalls: z.ZodNumber;
                    usedBytes: z.ZodNumber;
                    createdAt: z.ZodString;
                    reason: z.ZodNullable<z.ZodString>;
                    canFinishIncomplete: z.ZodBoolean;
                    exhaustedCap: z.ZodNullable<z.ZodEnum<{
                        bytes: "bytes";
                        credits: "credits";
                        calls: "calls";
                    }>>;
                    stepsDone: z.ZodNullable<z.ZodNumber>;
                    stepsTotal: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strip>>;
                jobsTotal: z.ZodNumber;
                audit: z.ZodArray<z.ZodObject<{
                    revision: z.ZodNumber;
                    actorUserId: z.ZodNumber;
                    createdAt: z.ZodString;
                    changes: z.ZodUnknown;
                }, z.core.$strip>>;
                limitDescription: z.ZodString;
            }, z.core.$strip>;
        };
    };
    readonly ofapiCollectionPreview: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["ops"];
        readonly summary: "Preview collection changes without vendor calls";
        readonly body: z.ZodObject<{
            expectedRevision: z.ZodNumber;
            changes: z.ZodArray<z.ZodObject<{
                pageId: z.ZodNullable<z.ZodNumber>;
                category: z.ZodEnum<{
                    core_messages: "core_messages";
                    core_payments: "core_payments";
                    core_audience: "core_audience";
                    posts_comments: "posts_comments";
                    visitors: "visitors";
                    tracking_links: "tracking_links";
                    smart_links: "smart_links";
                    vault_catalog: "vault_catalog";
                    vault_files: "vault_files";
                    balances: "balances";
                    profile_notifications: "profile_notifications";
                    content_history: "content_history";
                    media_previews: "media_previews";
                    account_settings: "account_settings";
                }>;
                mode: z.ZodEnum<{
                    off: "off";
                    on_demand: "on_demand";
                    scheduled: "scheduled";
                }>;
                intervalMinutes: z.ZodNumber;
                dailyCreditLimit: z.ZodNumber;
                maxCallsPerRun: z.ZodNumber;
                includeDetails: z.ZodBoolean;
            }, z.core.$strict>>;
            backgroundPaused: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strict>;
        readonly response: {
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
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 200: z.ZodObject<{
                revision: z.ZodNumber;
                changes: z.ZodArray<z.ZodObject<{
                    pageId: z.ZodNullable<z.ZodNumber>;
                    category: z.ZodEnum<{
                        core_messages: "core_messages";
                        core_payments: "core_payments";
                        core_audience: "core_audience";
                        posts_comments: "posts_comments";
                        visitors: "visitors";
                        tracking_links: "tracking_links";
                        smart_links: "smart_links";
                        vault_catalog: "vault_catalog";
                        vault_files: "vault_files";
                        balances: "balances";
                        profile_notifications: "profile_notifications";
                        content_history: "content_history";
                        media_previews: "media_previews";
                        account_settings: "account_settings";
                    }>;
                    mode: z.ZodEnum<{
                        off: "off";
                        on_demand: "on_demand";
                        scheduled: "scheduled";
                    }>;
                    intervalMinutes: z.ZodNumber;
                    dailyCreditLimit: z.ZodNumber;
                    maxCallsPerRun: z.ZodNumber;
                    includeDetails: z.ZodBoolean;
                }, z.core.$strict>>;
                backgroundPaused: z.ZodBoolean;
                cost: z.ZodObject<{
                    source: z.ZodLiteral<"unknown">;
                    estimatedCredits: z.ZodNull;
                    maximumNewCreditsPerDay: z.ZodNumber;
                }, z.core.$strip>;
                consequences: z.ZodArray<z.ZodString>;
                inFlight: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly ofapiCollectionApply: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["ops"];
        readonly summary: "Apply versioned OFAPI collection policy";
        readonly body: z.ZodObject<{
            expectedRevision: z.ZodNumber;
            changes: z.ZodArray<z.ZodObject<{
                pageId: z.ZodNullable<z.ZodNumber>;
                category: z.ZodEnum<{
                    core_messages: "core_messages";
                    core_payments: "core_payments";
                    core_audience: "core_audience";
                    posts_comments: "posts_comments";
                    visitors: "visitors";
                    tracking_links: "tracking_links";
                    smart_links: "smart_links";
                    vault_catalog: "vault_catalog";
                    vault_files: "vault_files";
                    balances: "balances";
                    profile_notifications: "profile_notifications";
                    content_history: "content_history";
                    media_previews: "media_previews";
                    account_settings: "account_settings";
                }>;
                mode: z.ZodEnum<{
                    off: "off";
                    on_demand: "on_demand";
                    scheduled: "scheduled";
                }>;
                intervalMinutes: z.ZodNumber;
                dailyCreditLimit: z.ZodNumber;
                maxCallsPerRun: z.ZodNumber;
                includeDetails: z.ZodBoolean;
            }, z.core.$strict>>;
            backgroundPaused: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strict>;
        readonly response: {
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
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 200: z.ZodObject<{
                revision: z.ZodNumber;
                state: z.ZodLiteral<"applied">;
            }, z.core.$strip>;
        };
    };
    readonly ofapiCollectionJobCreate: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["ops"];
        readonly summary: "Approve one bounded OFAPI collection job";
        readonly body: z.ZodObject<{
            pageId: z.ZodNumber;
            category: z.ZodEnum<{
                core_messages: "core_messages";
                core_payments: "core_payments";
                core_audience: "core_audience";
                posts_comments: "posts_comments";
                visitors: "visitors";
                tracking_links: "tracking_links";
                smart_links: "smart_links";
                vault_catalog: "vault_catalog";
                vault_files: "vault_files";
                balances: "balances";
                profile_notifications: "profile_notifications";
                content_history: "content_history";
                media_previews: "media_previews";
                account_settings: "account_settings";
            }>;
            expectedRevision: z.ZodNumber;
            maxCredits: z.ZodNumber;
            maxCalls: z.ZodNumber;
            maxBytes: z.ZodNumber;
            from: z.ZodNullable<z.ZodISODateTime>;
            to: z.ZodNullable<z.ZodISODateTime>;
            selection: z.ZodArray<z.ZodString>;
        }, z.core.$strict>;
        readonly response: {
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
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 200: z.ZodObject<{
                id: z.ZodString;
                state: z.ZodLiteral<"queued">;
            }, z.core.$strip>;
        };
    };
    readonly ofapiCollectionJobResume: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["ops"];
        readonly summary: "Resume a bounded collection job from its retained checkpoint";
        readonly params: z.ZodObject<{
            id: z.ZodUUID;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{
            expectedRevision: z.ZodNumber;
        }, z.core.$strict>;
        readonly response: {
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
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 200: z.ZodObject<{
                id: z.ZodString;
                state: z.ZodLiteral<"queued">;
                revision: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly ofapiCollectionJobFinishIncomplete: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["ops"];
        readonly summary: "Finish a paused scheduled read without changing its retained facts, charges or next schedule";
        readonly params: z.ZodObject<{
            id: z.ZodUUID;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{
            pageId: z.ZodNumber;
            expectedRevision: z.ZodNumber;
            expectedState: z.ZodLiteral<"paused">;
            reason: z.ZodString;
        }, z.core.$strict>;
        readonly response: {
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
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 200: z.ZodObject<{
                id: z.ZodString;
                state: z.ZodLiteral<"failed">;
                revision: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
};
