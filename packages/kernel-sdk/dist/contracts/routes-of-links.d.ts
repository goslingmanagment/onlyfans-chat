import { z } from "zod";
export declare const ofLinksRouteSchemas: {
    readonly ofLinksGet: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Read every OnlyFans link with its latest snapshot, both money figures, its channel and the series' collection state";
        readonly querystring: z.ZodObject<{
            pageId: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
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
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 200: z.ZodObject<{
                staleAfterHours: z.ZodNumber;
                pages: z.ZodArray<z.ZodObject<{
                    pageId: z.ZodNumber;
                    pageLabel: z.ZodString;
                    ofapiMapped: z.ZodBoolean;
                    ofapiAuthStatus: z.ZodNullable<z.ZodString>;
                    kinds: z.ZodArray<z.ZodObject<{
                        linkKind: z.ZodEnum<{
                            tracking: "tracking";
                            trial: "trial";
                        }>;
                        lastUsableAt: z.ZodNullable<z.ZodString>;
                        lastUsableRunRef: z.ZodNullable<z.ZodString>;
                        linkCount: z.ZodNumber;
                        lastAttempt: z.ZodNullable<z.ZodObject<{
                            runRef: z.ZodString;
                            observedAt: z.ZodString;
                            businessDate: z.ZodString;
                            windowAt: z.ZodNullable<z.ZodString>;
                            attempt: z.ZodNumber;
                            status: z.ZodEnum<{
                                complete: "complete";
                                failed: "failed";
                                partial: "partial";
                                truncated: "truncated";
                                skipped: "skipped";
                            }>;
                            reason: z.ZodNullable<z.ZodString>;
                            usable: z.ZodBoolean;
                        }, z.core.$strip>>;
                        stale: z.ZodBoolean;
                        staleSince: z.ZodNullable<z.ZodString>;
                    }, z.core.$strip>>;
                }, z.core.$strip>>;
                links: z.ZodArray<z.ZodObject<{
                    pageId: z.ZodNumber;
                    linkKind: z.ZodEnum<{
                        tracking: "tracking";
                        trial: "trial";
                    }>;
                    linkRef: z.ZodString;
                    name: z.ZodNullable<z.ZodString>;
                    url: z.ZodNullable<z.ZodString>;
                    linkCreatedAt: z.ZodNullable<z.ZodString>;
                    linkEndsAt: z.ZodNullable<z.ZodString>;
                    isFinished: z.ZodNullable<z.ZodBoolean>;
                    state: z.ZodEnum<{
                        active: "active";
                        expired: "expired";
                        finished: "finished";
                    }>;
                    trialDays: z.ZodNullable<z.ZodNumber>;
                    tags: z.ZodNullable<z.ZodArray<z.ZodString>>;
                    observedAt: z.ZodString;
                    businessDate: z.ZodString;
                    runRef: z.ZodString;
                    inLatestRun: z.ZodBoolean;
                    clicks: z.ZodNumber;
                    claims: z.ZodNullable<z.ZodNumber>;
                    subscribers: z.ZodNumber;
                    spenders: z.ZodNullable<z.ZodNumber>;
                    fans: z.ZodNullable<z.ZodNumber>;
                    fansMetric: z.ZodEnum<{
                        subscribers: "subscribers";
                        claims: "claims";
                    }>;
                    vendorMoney: z.ZodObject<{
                        revenueBasis: z.ZodLiteral<"creator_net_after_platform_fee">;
                        netMills: z.ZodNullable<z.ZodNumber>;
                        chargebacksMills: z.ZodNullable<z.ZodNumber>;
                        calculatedAt: z.ZodNullable<z.ZodString>;
                        isLoading: z.ZodNullable<z.ZodBoolean>;
                        lastRecalculation: z.ZodNullable<z.ZodObject<{
                            observedAt: z.ZodString;
                            previousObservedAt: z.ZodString;
                            fromMills: z.ZodNumber;
                            toMills: z.ZodNumber;
                            bindingChanged: z.ZodBoolean;
                            accountChangedAt: z.ZodNullable<z.ZodString>;
                        }, z.core.$strip>>;
                    }, z.core.$strip>;
                    hubMoney: z.ZodObject<{
                        state: z.ZodEnum<{
                            no_data: "no_data";
                            available: "available";
                        }>;
                        reason: z.ZodNullable<z.ZodEnum<{
                            not_computed: "not_computed";
                            no_completed_walk: "no_completed_walk";
                            before_floor: "before_floor";
                        }>>;
                        revenueBasis: z.ZodLiteral<"creator_net_after_platform_fee">;
                        attributionRule: z.ZodLiteral<"ofapi_subscription_period_equal_split.v1">;
                        floorAt: z.ZodNullable<z.ZodString>;
                        netMills: z.ZodNullable<z.ZodNumber>;
                        pendingMills: z.ZodNullable<z.ZodNumber>;
                        transactionCount: z.ZodNullable<z.ZodNumber>;
                        fanCount: z.ZodNullable<z.ZodNumber>;
                    }, z.core.$strip>;
                    comparison: z.ZodObject<{
                        state: z.ZodNullable<z.ZodEnum<{
                            comparable: "comparable";
                            different_history: "different_history";
                            provisional: "provisional";
                            incomplete: "incomplete";
                        }>>;
                        flags: z.ZodArray<z.ZodEnum<{
                            vendor_recalculated: "vendor_recalculated";
                            binding_changed: "binding_changed";
                            vendor_lagging: "vendor_lagging";
                            window_mismatch: "window_mismatch";
                            ledger_gap: "ledger_gap";
                        }>>;
                        fromAt: z.ZodNullable<z.ZodString>;
                        toAt: z.ZodNullable<z.ZodString>;
                        vendorDeltaMills: z.ZodNullable<z.ZodNumber>;
                        hubNetMills: z.ZodNullable<z.ZodNumber>;
                        differenceMills: z.ZodNullable<z.ZodNumber>;
                    }, z.core.$strip>;
                    binding: z.ZodNullable<z.ZodObject<{
                        channelKey: z.ZodString;
                        channelTitle: z.ZodString;
                        validFrom: z.ZodString;
                        validTo: z.ZodNullable<z.ZodString>;
                        validFromBasis: z.ZodEnum<{
                            confirmed: "confirmed";
                            assumed_link_created: "assumed_link_created";
                        }>;
                        contractor: z.ZodNullable<z.ZodObject<{
                            contractorKey: z.ZodString;
                            contractorTitle: z.ZodString;
                            validFrom: z.ZodString;
                            validTo: z.ZodNullable<z.ZodString>;
                            validFromBasis: z.ZodEnum<{
                                confirmed: "confirmed";
                                assumed_link_created: "assumed_link_created";
                            }>;
                        }, z.core.$strip>>;
                    }, z.core.$strip>>;
                }, z.core.$strip>>;
                generatedAt: z.ZodString;
                businessTimeZone: z.ZodLiteral<"Europe/Moscow">;
                revenueBasis: z.ZodLiteral<"creator_net_after_platform_fee">;
                seriesFloorAt: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>;
        };
    };
    readonly ofLinksHistoryGet: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Read one OnlyFans link's snapshots, its list's collection attempts and its business-day deltas over a range of Moscow days";
        readonly querystring: z.ZodObject<{
            pageId: z.ZodCoercedNumber<unknown>;
            linkKind: z.ZodEnum<{
                tracking: "tracking";
                trial: "trial";
            }>;
            linkRef: z.ZodString;
            from: z.ZodOptional<z.ZodString>;
            to: z.ZodOptional<z.ZodString>;
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
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 200: z.ZodObject<{
                pageId: z.ZodNumber;
                pageLabel: z.ZodString;
                linkKind: z.ZodEnum<{
                    tracking: "tracking";
                    trial: "trial";
                }>;
                linkRef: z.ZodString;
                name: z.ZodNullable<z.ZodString>;
                linkCreatedAt: z.ZodNullable<z.ZodString>;
                fansMetric: z.ZodEnum<{
                    subscribers: "subscribers";
                    claims: "claims";
                }>;
                range: z.ZodObject<{
                    from: z.ZodString;
                    to: z.ZodString;
                    fromAt: z.ZodString;
                    toAt: z.ZodString;
                }, z.core.$strip>;
                snapshots: z.ZodArray<z.ZodObject<{
                    runRef: z.ZodString;
                    observedAt: z.ZodString;
                    businessDate: z.ZodString;
                    windowAt: z.ZodNullable<z.ZodString>;
                    runStatus: z.ZodEnum<{
                        complete: "complete";
                        failed: "failed";
                        partial: "partial";
                        truncated: "truncated";
                        skipped: "skipped";
                    }>;
                    runReason: z.ZodNullable<z.ZodString>;
                    clicks: z.ZodNumber;
                    claims: z.ZodNullable<z.ZodNumber>;
                    subscribers: z.ZodNumber;
                    spenders: z.ZodNullable<z.ZodNumber>;
                    fans: z.ZodNullable<z.ZodNumber>;
                    vendorNetMills: z.ZodNullable<z.ZodNumber>;
                    vendorChargebacksMills: z.ZodNullable<z.ZodNumber>;
                    vendorCalculatedAt: z.ZodNullable<z.ZodString>;
                    vendorIsLoading: z.ZodNullable<z.ZodBoolean>;
                    isFinished: z.ZodNullable<z.ZodBoolean>;
                    linkEndsAt: z.ZodNullable<z.ZodString>;
                    bindingChanged: z.ZodBoolean;
                    vendorRecalculated: z.ZodBoolean;
                }, z.core.$strip>>;
                attempts: z.ZodArray<z.ZodObject<{
                    runRef: z.ZodString;
                    observedAt: z.ZodString;
                    businessDate: z.ZodString;
                    windowAt: z.ZodNullable<z.ZodString>;
                    attempt: z.ZodNumber;
                    status: z.ZodEnum<{
                        complete: "complete";
                        failed: "failed";
                        partial: "partial";
                        truncated: "truncated";
                        skipped: "skipped";
                    }>;
                    reason: z.ZodNullable<z.ZodString>;
                    usable: z.ZodBoolean;
                }, z.core.$strip>>;
                days: z.ZodArray<z.ZodObject<{
                    businessDate: z.ZodString;
                    dayStartAt: z.ZodString;
                    dayEndAt: z.ZodString;
                    startObservedAt: z.ZodNullable<z.ZodString>;
                    endObservedAt: z.ZodNullable<z.ZodString>;
                    clicks: z.ZodNullable<z.ZodNumber>;
                    claims: z.ZodNullable<z.ZodNumber>;
                    subscribers: z.ZodNullable<z.ZodNumber>;
                    fans: z.ZodNullable<z.ZodNumber>;
                    vendorNetMills: z.ZodNullable<z.ZodNumber>;
                    missedWindows: z.ZodNullable<z.ZodNumber>;
                    flags: z.ZodArray<z.ZodEnum<{
                        no_baseline: "no_baseline";
                        vendor_recalculated: "vendor_recalculated";
                        binding_changed: "binding_changed";
                        money_unknown: "money_unknown";
                        assumed_binding_start: "assumed_binding_start";
                        assumed_contractor_start: "assumed_contractor_start";
                    }>>;
                    hub: z.ZodNullable<z.ZodObject<{
                        netMills: z.ZodNumber;
                        pendingMills: z.ZodNumber;
                        transactionCount: z.ZodNumber;
                        fanCount: z.ZodNumber;
                    }, z.core.$strip>>;
                }, z.core.$strip>>;
                hubMoney: z.ZodObject<{
                    state: z.ZodEnum<{
                        no_data: "no_data";
                        available: "available";
                    }>;
                    reason: z.ZodNullable<z.ZodEnum<{
                        not_computed: "not_computed";
                        no_completed_walk: "no_completed_walk";
                        before_floor: "before_floor";
                    }>>;
                    revenueBasis: z.ZodLiteral<"creator_net_after_platform_fee">;
                    attributionRule: z.ZodLiteral<"ofapi_subscription_period_equal_split.v1">;
                    floorAt: z.ZodNullable<z.ZodString>;
                    netMills: z.ZodNullable<z.ZodNumber>;
                    pendingMills: z.ZodNullable<z.ZodNumber>;
                    transactionCount: z.ZodNullable<z.ZodNumber>;
                    fanCount: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strip>;
                generatedAt: z.ZodString;
                businessTimeZone: z.ZodLiteral<"Europe/Moscow">;
                revenueBasis: z.ZodLiteral<"creator_net_after_platform_fee">;
                seriesFloorAt: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>;
        };
    };
    readonly ofLinksChannelsGet: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Read OnlyFans link totals by channel and contractor over a range of Moscow days, links without a channel in their own row";
        readonly querystring: z.ZodObject<{
            from: z.ZodOptional<z.ZodString>;
            to: z.ZodOptional<z.ZodString>;
            pageId: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
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
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 200: z.ZodObject<{
                range: z.ZodObject<{
                    from: z.ZodString;
                    to: z.ZodString;
                    fromAt: z.ZodString;
                    toAt: z.ZodString;
                }, z.core.$strip>;
                channels: z.ZodArray<z.ZodObject<{
                    channelKey: z.ZodNullable<z.ZodString>;
                    channelTitle: z.ZodNullable<z.ZodString>;
                    contractors: z.ZodArray<z.ZodObject<{
                        contractorKey: z.ZodString;
                        contractorTitle: z.ZodString;
                        validFrom: z.ZodString;
                        validTo: z.ZodNullable<z.ZodString>;
                        validFromBasis: z.ZodEnum<{
                            confirmed: "confirmed";
                            assumed_link_created: "assumed_link_created";
                        }>;
                    }, z.core.$strip>>;
                    totals: z.ZodObject<{
                        linkCount: z.ZodNumber;
                        clicks: z.ZodNumber;
                        claims: z.ZodNumber;
                        subscribers: z.ZodNumber;
                        fans: z.ZodNumber;
                        vendorNetMills: z.ZodNumber;
                        hubMoney: z.ZodObject<{
                            state: z.ZodEnum<{
                                partial: "partial";
                                no_data: "no_data";
                                available: "available";
                            }>;
                            reason: z.ZodNullable<z.ZodEnum<{
                                not_computed: "not_computed";
                                no_completed_walk: "no_completed_walk";
                                before_floor: "before_floor";
                            }>>;
                            revenueBasis: z.ZodLiteral<"creator_net_after_platform_fee">;
                            attributionRule: z.ZodLiteral<"ofapi_subscription_period_equal_split.v1">;
                            netMills: z.ZodNullable<z.ZodNumber>;
                            pendingMills: z.ZodNullable<z.ZodNumber>;
                        }, z.core.$strip>;
                    }, z.core.$strip>;
                    flags: z.ZodArray<z.ZodEnum<{
                        no_baseline: "no_baseline";
                        vendor_recalculated: "vendor_recalculated";
                        binding_changed: "binding_changed";
                        money_unknown: "money_unknown";
                        assumed_binding_start: "assumed_binding_start";
                        assumed_contractor_start: "assumed_contractor_start";
                    }>>;
                    segments: z.ZodArray<z.ZodObject<{
                        pageId: z.ZodNumber;
                        pageLabel: z.ZodString;
                        linkKind: z.ZodEnum<{
                            tracking: "tracking";
                            trial: "trial";
                        }>;
                        linkRef: z.ZodString;
                        name: z.ZodNullable<z.ZodString>;
                        channelKey: z.ZodNullable<z.ZodString>;
                        contractorKey: z.ZodNullable<z.ZodString>;
                        startAt: z.ZodString;
                        endAt: z.ZodString;
                        startObservedAt: z.ZodNullable<z.ZodString>;
                        endObservedAt: z.ZodString;
                        clicks: z.ZodNumber;
                        claims: z.ZodNullable<z.ZodNumber>;
                        subscribers: z.ZodNumber;
                        fans: z.ZodNullable<z.ZodNumber>;
                        vendorNetMills: z.ZodNullable<z.ZodNumber>;
                        flags: z.ZodArray<z.ZodEnum<{
                            no_baseline: "no_baseline";
                            vendor_recalculated: "vendor_recalculated";
                            binding_changed: "binding_changed";
                            money_unknown: "money_unknown";
                            assumed_binding_start: "assumed_binding_start";
                            assumed_contractor_start: "assumed_contractor_start";
                        }>>;
                    }, z.core.$strip>>;
                }, z.core.$strip>>;
                contractors: z.ZodArray<z.ZodObject<{
                    contractorKey: z.ZodNullable<z.ZodString>;
                    contractorTitle: z.ZodNullable<z.ZodString>;
                    channelKeys: z.ZodArray<z.ZodString>;
                    totals: z.ZodObject<{
                        linkCount: z.ZodNumber;
                        clicks: z.ZodNumber;
                        claims: z.ZodNumber;
                        subscribers: z.ZodNumber;
                        fans: z.ZodNumber;
                        vendorNetMills: z.ZodNumber;
                        hubMoney: z.ZodObject<{
                            state: z.ZodEnum<{
                                partial: "partial";
                                no_data: "no_data";
                                available: "available";
                            }>;
                            reason: z.ZodNullable<z.ZodEnum<{
                                not_computed: "not_computed";
                                no_completed_walk: "no_completed_walk";
                                before_floor: "before_floor";
                            }>>;
                            revenueBasis: z.ZodLiteral<"creator_net_after_platform_fee">;
                            attributionRule: z.ZodLiteral<"ofapi_subscription_period_equal_split.v1">;
                            netMills: z.ZodNullable<z.ZodNumber>;
                            pendingMills: z.ZodNullable<z.ZodNumber>;
                        }, z.core.$strip>;
                    }, z.core.$strip>;
                    flags: z.ZodArray<z.ZodEnum<{
                        no_baseline: "no_baseline";
                        vendor_recalculated: "vendor_recalculated";
                        binding_changed: "binding_changed";
                        money_unknown: "money_unknown";
                        assumed_binding_start: "assumed_binding_start";
                        assumed_contractor_start: "assumed_contractor_start";
                    }>>;
                    segments: z.ZodArray<z.ZodObject<{
                        pageId: z.ZodNumber;
                        pageLabel: z.ZodString;
                        linkKind: z.ZodEnum<{
                            tracking: "tracking";
                            trial: "trial";
                        }>;
                        linkRef: z.ZodString;
                        name: z.ZodNullable<z.ZodString>;
                        channelKey: z.ZodNullable<z.ZodString>;
                        contractorKey: z.ZodNullable<z.ZodString>;
                        startAt: z.ZodString;
                        endAt: z.ZodString;
                        startObservedAt: z.ZodNullable<z.ZodString>;
                        endObservedAt: z.ZodString;
                        clicks: z.ZodNumber;
                        claims: z.ZodNullable<z.ZodNumber>;
                        subscribers: z.ZodNumber;
                        fans: z.ZodNullable<z.ZodNumber>;
                        vendorNetMills: z.ZodNullable<z.ZodNumber>;
                        flags: z.ZodArray<z.ZodEnum<{
                            no_baseline: "no_baseline";
                            vendor_recalculated: "vendor_recalculated";
                            binding_changed: "binding_changed";
                            money_unknown: "money_unknown";
                            assumed_binding_start: "assumed_binding_start";
                            assumed_contractor_start: "assumed_contractor_start";
                        }>>;
                    }, z.core.$strip>>;
                }, z.core.$strip>>;
                generatedAt: z.ZodString;
                businessTimeZone: z.ZodLiteral<"Europe/Moscow">;
                revenueBasis: z.ZodLiteral<"creator_net_after_platform_fee">;
                seriesFloorAt: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>;
        };
    };
};
