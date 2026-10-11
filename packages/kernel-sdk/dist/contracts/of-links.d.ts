import { z } from "zod";
/** creator_net_after_platform_fee: after the OnlyFans fee, refunds and chargebacks. */
export declare const OF_LINKS_REVENUE_BASIS: "creator_net_after_platform_fee";
/** The rule Hub's own figure is attributed by (PR 13): a transaction belongs to
 * the links whose subscription period holds it, split equally when several do. */
export declare const OF_LINKS_ATTRIBUTION_RULE: "ofapi_subscription_period_equal_split.v1";
export declare const OF_LINKS_BUSINESS_TIME_ZONE: "Europe/Moscow";
export declare const ofLinkKindSchema: z.ZodEnum<{
    tracking: "tracking";
    trial: "trial";
}>;
export declare const ofLinkFansMetricSchema: z.ZodEnum<{
    subscribers: "subscribers";
    claims: "claims";
}>;
/** `expired`: the link's end (trial expiredAt, tracking endDate) has passed;
 * `finished`: OFAPI marks the trial link finished before its end (a claim
 * limit); `active` otherwise. */
export declare const ofLinkStateSchema: z.ZodEnum<{
    active: "active";
    expired: "expired";
    finished: "finished";
}>;
export declare const ofLinkRunStatusSchema: z.ZodEnum<{
    complete: "complete";
    failed: "failed";
    partial: "partial";
    truncated: "truncated";
    skipped: "skipped";
}>;
export declare const ofLinkValidFromBasisSchema: z.ZodEnum<{
    confirmed: "confirmed";
    assumed_link_created: "assumed_link_created";
}>;
/** Flags on a delta (a day of a link, a channel segment, a channel total):
 *   no_baseline              nothing was read before the start and the link
 *                            is not one created inside the stretch (older
 *                            than the series, missed by it, or of unknown
 *                            creation): the whole value it had accumulated
 *                            by the end is counted;
 *   vendor_recalculated      OFAPI lowered the link's net money between two
 *                            snapshots inside the delta — a recalculation,
 *                            not a loss;
 *   binding_changed          the page's OFAPI account changed between two
 *                            snapshots inside the delta;
 *   money_unknown            a snapshot the delta rests on does not know the
 *                            vendor money (still computing or never
 *                            reported): the money figure is null, or a total
 *                            leaves that stretch out — an earlier value never
 *                            stands in for it;
 *   assumed_binding_start    the link's channel binding starts on an assumed
 *                            date (its creation), nobody confirmed it (П9.7);
 *   assumed_contractor_start the channel's contractor term starts on an
 *                            assumed date (П9.7). */
export declare const ofLinkDeltaFlagSchema: z.ZodEnum<{
    no_baseline: "no_baseline";
    vendor_recalculated: "vendor_recalculated";
    binding_changed: "binding_changed";
    money_unknown: "money_unknown";
    assumed_binding_start: "assumed_binding_start";
    assumed_contractor_start: "assumed_contractor_start";
}>;
/** Hub's own figure (PR 13). `no_data` with a reason until it can be given:
 * `not_computed` — Hub money is not computed yet (before PR 13);
 * `no_completed_walk` — no completed walk of the link's fan list, so no floor;
 * `before_floor` — the asked time ends before Hub's figure begins (`floorAt`):
 *   Hub knows nothing of it, which is not zero. */
export declare const ofLinkHubMoneyReasonSchema: z.ZodEnum<{
    not_computed: "not_computed";
    no_completed_walk: "no_completed_walk";
    before_floor: "before_floor";
}>;
export declare const ofLinkHubMoneySchema: z.ZodObject<{
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
export type OfLinkHubMoney = z.infer<typeof ofLinkHubMoneySchema>;
/** Hub's figure over a group of links (a channel, a contractor): `partial`
 * when some links of the group have it and some do not. */
export declare const ofLinkHubMoneyTotalSchema: z.ZodObject<{
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
export type OfLinkHubMoneyTotal = z.infer<typeof ofLinkHubMoneyTotalSchema>;
/** The two money figures side by side (П2), over one stretch [fromAt, toAt):
 * OFAPI's increase between two of its computations (`revenue.calculatedAt`)
 * at or after Hub's floor, against Hub's figure over exactly those two
 * instants; without such a pair, OFAPI's increase from its last snapshot
 * before the floor against Hub's figure from the floor (flag
 * window_mismatch). `state`:
 *   comparable         the same stretch on both sides, Hub's fan walks read to
 *                      the end past it, nothing pending, no flag, a tracking
 *                      link (a trial link waits for a per-fan check, П9.3);
 *   different_history  OFAPI all-time against Hub since its floor (no OFAPI
 *                      snapshot before the floor to start from);
 *   provisional        a figure may still move or the stretches differ: a
 *                      flag, pending money, or a trial link;
 *   incomplete         OFAPI's figure unknown or still computing, OFAPI has
 *                      computed nothing since Hub's floor, or the split is
 *                      not final over the stretch (some link of the page the
 *                      sweep walks has no finished fan walk started at or
 *                      after its end: a fan not read in yet could still take
 *                      part of a share);
 *   null               nothing to compare: Hub's figure is absent. */
export declare const ofLinkComparisonStateSchema: z.ZodEnum<{
    comparable: "comparable";
    different_history: "different_history";
    provisional: "provisional";
    incomplete: "incomplete";
}>;
/** Flags on the comparison:
 *   vendor_recalculated  OFAPI lowered the link's money inside the stretch;
 *   binding_changed      the page's OFAPI account changed inside it;
 *   vendor_lagging       OFAPI's latest figure was computed more than a day
 *                        before Hub read it (the stretch ends at that
 *                        computation, not at the read);
 *   window_mismatch      no OFAPI computation at or after Hub's floor to
 *                        start from: the two figures cover different
 *                        stretches, the difference includes money outside one
 *                        of them;
 *   ledger_gap           the chargebacks reconcile is failing: Hub's ledger
 *                        may lack chargebacks OFAPI already took out. */
export declare const ofLinkComparisonFlagSchema: z.ZodEnum<{
    vendor_recalculated: "vendor_recalculated";
    binding_changed: "binding_changed";
    vendor_lagging: "vendor_lagging";
    window_mismatch: "window_mismatch";
    ledger_gap: "ledger_gap";
}>;
export declare const ofLinkMoneyComparisonSchema: z.ZodObject<{
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
export type OfLinkMoneyComparison = z.infer<typeof ofLinkMoneyComparisonSchema>;
/** OFAPI's money for a link: its latest value, with the latest recalculation
 * (a decrease between two snapshots) the series saw. */
export declare const ofLinkVendorMoneySchema: z.ZodObject<{
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
export declare const ofLinkContractorTermSchema: z.ZodObject<{
    contractorKey: z.ZodString;
    contractorTitle: z.ZodString;
    validFrom: z.ZodString;
    validTo: z.ZodNullable<z.ZodString>;
    validFromBasis: z.ZodEnum<{
        confirmed: "confirmed";
        assumed_link_created: "assumed_link_created";
    }>;
}, z.core.$strip>;
/** The link's channel: the binding open now, else its latest closed one
 * (`validTo` set), with the channel's contractor at that binding's last
 * instant. */
export declare const ofLinkBindingSchema: z.ZodObject<{
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
}, z.core.$strip>;
export declare const ofLinkSchema: z.ZodObject<{
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
}, z.core.$strip>;
export type OfLink = z.infer<typeof ofLinkSchema>;
export declare const ofLinkAttemptSchema: z.ZodObject<{
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
}, z.core.$strip>;
/** The collection state of one (page, link kind) of the series. */
export declare const ofLinksPageKindSchema: z.ZodObject<{
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
}, z.core.$strip>;
export declare const ofLinksPageSchema: z.ZodObject<{
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
}, z.core.$strip>;
export declare const ofLinksResponseSchema: z.ZodObject<{
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
export type OfLinksResponse = z.infer<typeof ofLinksResponseSchema>;
export declare const ofLinkRangeSchema: z.ZodObject<{
    from: z.ZodString;
    to: z.ZodString;
    fromAt: z.ZodString;
    toAt: z.ZodString;
}, z.core.$strip>;
export declare const ofLinkSnapshotSchema: z.ZodObject<{
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
}, z.core.$strip>;
/** Hub's own money of one business day (PR 13); null until computed. */
export declare const ofLinkHubDaySchema: z.ZodObject<{
    netMills: z.ZodNumber;
    pendingMills: z.ZodNumber;
    transactionCount: z.ZodNumber;
    fanCount: z.ZodNumber;
}, z.core.$strip>;
export declare const ofLinkDaySchema: z.ZodObject<{
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
}, z.core.$strip>;
export declare const ofLinkHistoryResponseSchema: z.ZodObject<{
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
export type OfLinkHistoryResponse = z.infer<typeof ofLinkHistoryResponseSchema>;
export declare const ofLinkTotalsSchema: z.ZodObject<{
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
/** One link over one stretch of time: the value at the end minus the value
 * at the start. A channel's segments are cut by the link's bindings only
 * (`contractorKey` null); a contractor's segments are cut by the bindings and
 * the channel's contractor terms. So a channel's total never moves when a
 * contractor term is added or moved. */
export declare const ofLinkSegmentSchema: z.ZodObject<{
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
}, z.core.$strip>;
export declare const ofLinkChannelSchema: z.ZodObject<{
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
}, z.core.$strip>;
export declare const ofLinkContractorSchema: z.ZodObject<{
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
}, z.core.$strip>;
export declare const ofLinkChannelsResponseSchema: z.ZodObject<{
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
export type OfLinkChannelsResponse = z.infer<typeof ofLinkChannelsResponseSchema>;
