/**
 * Fansly Sync Engine — the owner's routes (design §7.4).
 *
 * WHY A SEPARATE MODULE: these are owner-session routes with no agent envelope
 * (`delivery`/`capture`/`conclusion`), and the read plane's pins say every 200
 * of `agentRouteSchemas` carries one. The owner's history requests mirror the
 * agent operations in `routes-agent.ts` and share their wire shapes, so an
 * owner and an agent read the same request the same way (plan §4.1: agents and
 * the owner are equal requesters). The page status and the work rows ("why
 * waiting") share theirs with `agentSyncStatus` / `agentSyncWhy` the same way.
 *
 * `routes.ts` spreads `syncRouteSchemas` into `routeSchemas`; the dashboard and
 * the owner console reach them through the generated SDK with a cookie.
 */
import { z } from "zod";
/** The agent create body without the agent-plane claim. */
export declare const syncHistoryRequestCreateBodySchema: z.ZodObject<{
    fans: z.ZodArray<z.ZodUnion<readonly [z.ZodObject<{
        kind: z.ZodLiteral<"fan">;
        platformUserId: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"conversation">;
        conversationRef: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"chat_url">;
        url: z.ZodString;
    }, z.core.$strict>]>>;
    depth: z.ZodUnion<readonly [z.ZodObject<{
        kind: z.ZodLiteral<"all">;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"latest">;
        count: z.ZodNumber;
    }, z.core.$strict>]>;
    reason: z.ZodString;
    idempotencyKey: z.ZodString;
}, z.core.$strict>;
export declare const syncHistoryRequestCreateResponseSchema: z.ZodObject<{
    disposition: z.ZodEnum<{
        created: "created";
        coalesced: "coalesced";
    }>;
    request: z.ZodObject<{
        ref: z.ZodString;
        pageLabel: z.ZodNullable<z.ZodString>;
        state: z.ZodEnum<{
            cancelled: "cancelled";
            open: "open";
            done: "done";
        }>;
        depth: z.ZodObject<{
            kind: z.ZodEnum<{
                all: "all";
                latest: "latest";
                before_boundary: "before_boundary";
            }>;
            count: z.ZodOptional<z.ZodNumber>;
            boundaryAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            boundaryMessageRef: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        }, z.core.$strict>;
        requesterKind: z.ZodEnum<{
            agent_key: "agent_key";
            owner_session: "owner_session";
            owner_cli: "owner_cli";
            legacy_hydration_wrapper: "legacy_hydration_wrapper";
            switch_migration: "switch_migration";
        }>;
        createdAt: z.ZodString;
        doneAt: z.ZodNullable<z.ZodString>;
        cancelledAt: z.ZodNullable<z.ZodString>;
        counts: z.ZodObject<{
            total: z.ZodNumber;
            ready: z.ZodNumber;
            queued: z.ZodNumber;
            loading: z.ZodNumber;
            blocked: z.ZodNumber;
            refused: z.ZodNumber;
            cancelled: z.ZodNumber;
        }, z.core.$strict>;
        reads: z.ZodObject<{
            done: z.ZodNumber;
            remainingMin: z.ZodNumber;
            remainingEstimate: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>;
        eta: z.ZodObject<{
            lowerBoundSeconds: z.ZodNumber;
            estimateSeconds: z.ZodNullable<z.ZodNumber>;
            basis: z.ZodLiteral<"estimate">;
            ratePerHour: z.ZodNumber;
            sharePercent: z.ZodNumber;
            limitedBy: z.ZodEnum<{
                page: "page";
                family: "family";
                route: "route";
            }>;
            slowdown: z.ZodNullable<z.ZodObject<{
                route: z.ZodString;
                effectivePerMin: z.ZodNumber;
                currentPerMin: z.ZodNumber;
            }, z.core.$strict>>;
            hold: z.ZodNullable<z.ZodObject<{
                scope: z.ZodEnum<{
                    page: "page";
                    route: "route";
                }>;
                until: z.ZodNullable<z.ZodString>;
            }, z.core.$strict>>;
        }, z.core.$strict>;
        queuePosition: z.ZodNullable<z.ZodNumber>;
        waitingReason: z.ZodNullable<z.ZodEnum<{
            running: "running";
            paused: "paused";
            quarantined: "quarantined";
            not_due: "not_due";
            pacer: "pacer";
            class_share: "class_share";
            page_hold: "page_hold";
            route_budget: "route_budget";
            route_hold: "route_hold";
            resource_hold: "resource_hold";
            subject_breaker: "subject_breaker";
            blocked_by_vendor: "blocked_by_vendor";
            dependency: "dependency";
            ownership_unconfirmed: "ownership_unconfirmed";
        }>>;
        waitingUntil: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>;
    items: z.ZodArray<z.ZodObject<{
        ordinal: z.ZodNumber;
        input: z.ZodObject<{
            kind: z.ZodEnum<{
                fan: "fan";
                conversation: "conversation";
                chat_url: "chat_url";
            }>;
            ref: z.ZodString;
        }, z.core.$strict>;
        fanPlatformUserId: z.ZodNullable<z.ZodString>;
        conversationRef: z.ZodNullable<z.ZodString>;
        state: z.ZodEnum<{
            ready: "ready";
            blocked: "blocked";
            cancelled: "cancelled";
            queued: "queued";
            refused: "refused";
            loading: "loading";
        }>;
        refusal: z.ZodNullable<z.ZodEnum<{
            excluded: "excluded";
            duplicate: "duplicate";
            not_found: "not_found";
            page_erased: "page_erased";
        }>>;
        excludedReason: z.ZodNullable<z.ZodString>;
        probeAt: z.ZodNullable<z.ZodString>;
        waitingReason: z.ZodNullable<z.ZodEnum<{
            running: "running";
            paused: "paused";
            quarantined: "quarantined";
            not_due: "not_due";
            pacer: "pacer";
            class_share: "class_share";
            page_hold: "page_hold";
            route_budget: "route_budget";
            route_hold: "route_hold";
            resource_hold: "resource_hold";
            subject_breaker: "subject_breaker";
            blocked_by_vendor: "blocked_by_vendor";
            dependency: "dependency";
            ownership_unconfirmed: "ownership_unconfirmed";
        }>>;
        waitingUntil: z.ZodNullable<z.ZodString>;
        loadedMessages: z.ZodNumber;
        oldestLoadedAt: z.ZodNullable<z.ZodString>;
        readsSpent: z.ZodNumber;
        historyState: z.ZodEnum<{
            complete: "complete";
            none: "none";
            partial: "partial";
            unverified: "unverified";
        }>;
        historyProof: z.ZodNullable<z.ZodEnum<{
            empty_page: "empty_page";
        }>>;
        anchorMessageRef: z.ZodNullable<z.ZodString>;
        satisfiedAt: z.ZodNullable<z.ZodString>;
        satisfiedBy: z.ZodNullable<z.ZodEnum<{
            empty_page: "empty_page";
            latest_n: "latest_n";
            boundary: "boundary";
            already_satisfied: "already_satisfied";
        }>>;
        estimate: z.ZodObject<{
            readsMin: z.ZodNumber;
            readsEstimate: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>;
    }, z.core.$strict>>;
    nextAfterOrdinal: z.ZodNullable<z.ZodNumber>;
}, z.core.$strict>;
export declare const syncHistoryRequestGetQuerySchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    afterOrdinal: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    state: z.ZodOptional<z.ZodEnum<{
        ready: "ready";
        blocked: "blocked";
        cancelled: "cancelled";
        queued: "queued";
        refused: "refused";
        loading: "loading";
    }>>;
}, z.core.$strict>;
export declare const syncHistoryRequestGetResponseSchema: z.ZodObject<{
    request: z.ZodObject<{
        ref: z.ZodString;
        pageLabel: z.ZodNullable<z.ZodString>;
        state: z.ZodEnum<{
            cancelled: "cancelled";
            open: "open";
            done: "done";
        }>;
        depth: z.ZodObject<{
            kind: z.ZodEnum<{
                all: "all";
                latest: "latest";
                before_boundary: "before_boundary";
            }>;
            count: z.ZodOptional<z.ZodNumber>;
            boundaryAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            boundaryMessageRef: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        }, z.core.$strict>;
        requesterKind: z.ZodEnum<{
            agent_key: "agent_key";
            owner_session: "owner_session";
            owner_cli: "owner_cli";
            legacy_hydration_wrapper: "legacy_hydration_wrapper";
            switch_migration: "switch_migration";
        }>;
        createdAt: z.ZodString;
        doneAt: z.ZodNullable<z.ZodString>;
        cancelledAt: z.ZodNullable<z.ZodString>;
        counts: z.ZodObject<{
            total: z.ZodNumber;
            ready: z.ZodNumber;
            queued: z.ZodNumber;
            loading: z.ZodNumber;
            blocked: z.ZodNumber;
            refused: z.ZodNumber;
            cancelled: z.ZodNumber;
        }, z.core.$strict>;
        reads: z.ZodObject<{
            done: z.ZodNumber;
            remainingMin: z.ZodNumber;
            remainingEstimate: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>;
        eta: z.ZodObject<{
            lowerBoundSeconds: z.ZodNumber;
            estimateSeconds: z.ZodNullable<z.ZodNumber>;
            basis: z.ZodLiteral<"estimate">;
            ratePerHour: z.ZodNumber;
            sharePercent: z.ZodNumber;
            limitedBy: z.ZodEnum<{
                page: "page";
                family: "family";
                route: "route";
            }>;
            slowdown: z.ZodNullable<z.ZodObject<{
                route: z.ZodString;
                effectivePerMin: z.ZodNumber;
                currentPerMin: z.ZodNumber;
            }, z.core.$strict>>;
            hold: z.ZodNullable<z.ZodObject<{
                scope: z.ZodEnum<{
                    page: "page";
                    route: "route";
                }>;
                until: z.ZodNullable<z.ZodString>;
            }, z.core.$strict>>;
        }, z.core.$strict>;
        queuePosition: z.ZodNullable<z.ZodNumber>;
        waitingReason: z.ZodNullable<z.ZodEnum<{
            running: "running";
            paused: "paused";
            quarantined: "quarantined";
            not_due: "not_due";
            pacer: "pacer";
            class_share: "class_share";
            page_hold: "page_hold";
            route_budget: "route_budget";
            route_hold: "route_hold";
            resource_hold: "resource_hold";
            subject_breaker: "subject_breaker";
            blocked_by_vendor: "blocked_by_vendor";
            dependency: "dependency";
            ownership_unconfirmed: "ownership_unconfirmed";
        }>>;
        waitingUntil: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>;
    items: z.ZodArray<z.ZodObject<{
        ordinal: z.ZodNumber;
        input: z.ZodObject<{
            kind: z.ZodEnum<{
                fan: "fan";
                conversation: "conversation";
                chat_url: "chat_url";
            }>;
            ref: z.ZodString;
        }, z.core.$strict>;
        fanPlatformUserId: z.ZodNullable<z.ZodString>;
        conversationRef: z.ZodNullable<z.ZodString>;
        state: z.ZodEnum<{
            ready: "ready";
            blocked: "blocked";
            cancelled: "cancelled";
            queued: "queued";
            refused: "refused";
            loading: "loading";
        }>;
        refusal: z.ZodNullable<z.ZodEnum<{
            excluded: "excluded";
            duplicate: "duplicate";
            not_found: "not_found";
            page_erased: "page_erased";
        }>>;
        excludedReason: z.ZodNullable<z.ZodString>;
        probeAt: z.ZodNullable<z.ZodString>;
        waitingReason: z.ZodNullable<z.ZodEnum<{
            running: "running";
            paused: "paused";
            quarantined: "quarantined";
            not_due: "not_due";
            pacer: "pacer";
            class_share: "class_share";
            page_hold: "page_hold";
            route_budget: "route_budget";
            route_hold: "route_hold";
            resource_hold: "resource_hold";
            subject_breaker: "subject_breaker";
            blocked_by_vendor: "blocked_by_vendor";
            dependency: "dependency";
            ownership_unconfirmed: "ownership_unconfirmed";
        }>>;
        waitingUntil: z.ZodNullable<z.ZodString>;
        loadedMessages: z.ZodNumber;
        oldestLoadedAt: z.ZodNullable<z.ZodString>;
        readsSpent: z.ZodNumber;
        historyState: z.ZodEnum<{
            complete: "complete";
            none: "none";
            partial: "partial";
            unverified: "unverified";
        }>;
        historyProof: z.ZodNullable<z.ZodEnum<{
            empty_page: "empty_page";
        }>>;
        anchorMessageRef: z.ZodNullable<z.ZodString>;
        satisfiedAt: z.ZodNullable<z.ZodString>;
        satisfiedBy: z.ZodNullable<z.ZodEnum<{
            empty_page: "empty_page";
            latest_n: "latest_n";
            boundary: "boundary";
            already_satisfied: "already_satisfied";
        }>>;
        estimate: z.ZodObject<{
            readsMin: z.ZodNumber;
            readsEstimate: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>;
    }, z.core.$strict>>;
    nextAfterOrdinal: z.ZodNullable<z.ZodNumber>;
}, z.core.$strict>;
export declare const syncHistoryRequestCancelBodySchema: z.ZodObject<{
    reason: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const syncHistoryRequestCancelResponseSchema: z.ZodObject<{
    disposition: z.ZodEnum<{
        cancelled: "cancelled";
        already_cancelled: "already_cancelled";
        already_done: "already_done";
    }>;
    request: z.ZodObject<{
        ref: z.ZodString;
        pageLabel: z.ZodNullable<z.ZodString>;
        state: z.ZodEnum<{
            cancelled: "cancelled";
            open: "open";
            done: "done";
        }>;
        depth: z.ZodObject<{
            kind: z.ZodEnum<{
                all: "all";
                latest: "latest";
                before_boundary: "before_boundary";
            }>;
            count: z.ZodOptional<z.ZodNumber>;
            boundaryAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            boundaryMessageRef: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        }, z.core.$strict>;
        requesterKind: z.ZodEnum<{
            agent_key: "agent_key";
            owner_session: "owner_session";
            owner_cli: "owner_cli";
            legacy_hydration_wrapper: "legacy_hydration_wrapper";
            switch_migration: "switch_migration";
        }>;
        createdAt: z.ZodString;
        doneAt: z.ZodNullable<z.ZodString>;
        cancelledAt: z.ZodNullable<z.ZodString>;
        counts: z.ZodObject<{
            total: z.ZodNumber;
            ready: z.ZodNumber;
            queued: z.ZodNumber;
            loading: z.ZodNumber;
            blocked: z.ZodNumber;
            refused: z.ZodNumber;
            cancelled: z.ZodNumber;
        }, z.core.$strict>;
        reads: z.ZodObject<{
            done: z.ZodNumber;
            remainingMin: z.ZodNumber;
            remainingEstimate: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>;
        eta: z.ZodObject<{
            lowerBoundSeconds: z.ZodNumber;
            estimateSeconds: z.ZodNullable<z.ZodNumber>;
            basis: z.ZodLiteral<"estimate">;
            ratePerHour: z.ZodNumber;
            sharePercent: z.ZodNumber;
            limitedBy: z.ZodEnum<{
                page: "page";
                family: "family";
                route: "route";
            }>;
            slowdown: z.ZodNullable<z.ZodObject<{
                route: z.ZodString;
                effectivePerMin: z.ZodNumber;
                currentPerMin: z.ZodNumber;
            }, z.core.$strict>>;
            hold: z.ZodNullable<z.ZodObject<{
                scope: z.ZodEnum<{
                    page: "page";
                    route: "route";
                }>;
                until: z.ZodNullable<z.ZodString>;
            }, z.core.$strict>>;
        }, z.core.$strict>;
        queuePosition: z.ZodNullable<z.ZodNumber>;
        waitingReason: z.ZodNullable<z.ZodEnum<{
            running: "running";
            paused: "paused";
            quarantined: "quarantined";
            not_due: "not_due";
            pacer: "pacer";
            class_share: "class_share";
            page_hold: "page_hold";
            route_budget: "route_budget";
            route_hold: "route_hold";
            resource_hold: "resource_hold";
            subject_breaker: "subject_breaker";
            blocked_by_vendor: "blocked_by_vendor";
            dependency: "dependency";
            ownership_unconfirmed: "ownership_unconfirmed";
        }>>;
        waitingUntil: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>;
}, z.core.$strict>;
export declare const syncHistoryRequestsQuerySchema: z.ZodObject<{
    pageLabel: z.ZodOptional<z.ZodString>;
    state: z.ZodOptional<z.ZodEnum<{
        cancelled: "cancelled";
        open: "open";
        done: "done";
    }>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strict>;
export declare const syncHistoryRequestsResponseSchema: z.ZodObject<{
    requests: z.ZodArray<z.ZodObject<{
        ref: z.ZodString;
        pageLabel: z.ZodNullable<z.ZodString>;
        state: z.ZodEnum<{
            cancelled: "cancelled";
            open: "open";
            done: "done";
        }>;
        depth: z.ZodObject<{
            kind: z.ZodEnum<{
                all: "all";
                latest: "latest";
                before_boundary: "before_boundary";
            }>;
            count: z.ZodOptional<z.ZodNumber>;
            boundaryAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            boundaryMessageRef: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        }, z.core.$strict>;
        requesterKind: z.ZodEnum<{
            agent_key: "agent_key";
            owner_session: "owner_session";
            owner_cli: "owner_cli";
            legacy_hydration_wrapper: "legacy_hydration_wrapper";
            switch_migration: "switch_migration";
        }>;
        createdAt: z.ZodString;
        doneAt: z.ZodNullable<z.ZodString>;
        cancelledAt: z.ZodNullable<z.ZodString>;
        counts: z.ZodObject<{
            total: z.ZodNumber;
            ready: z.ZodNumber;
            queued: z.ZodNumber;
            loading: z.ZodNumber;
            blocked: z.ZodNumber;
            refused: z.ZodNumber;
            cancelled: z.ZodNumber;
        }, z.core.$strict>;
        reads: z.ZodObject<{
            done: z.ZodNumber;
            remainingMin: z.ZodNumber;
            remainingEstimate: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>;
        eta: z.ZodObject<{
            lowerBoundSeconds: z.ZodNumber;
            estimateSeconds: z.ZodNullable<z.ZodNumber>;
            basis: z.ZodLiteral<"estimate">;
            ratePerHour: z.ZodNumber;
            sharePercent: z.ZodNumber;
            limitedBy: z.ZodEnum<{
                page: "page";
                family: "family";
                route: "route";
            }>;
            slowdown: z.ZodNullable<z.ZodObject<{
                route: z.ZodString;
                effectivePerMin: z.ZodNumber;
                currentPerMin: z.ZodNumber;
            }, z.core.$strict>>;
            hold: z.ZodNullable<z.ZodObject<{
                scope: z.ZodEnum<{
                    page: "page";
                    route: "route";
                }>;
                until: z.ZodNullable<z.ZodString>;
            }, z.core.$strict>>;
        }, z.core.$strict>;
        queuePosition: z.ZodNullable<z.ZodNumber>;
        waitingReason: z.ZodNullable<z.ZodEnum<{
            running: "running";
            paused: "paused";
            quarantined: "quarantined";
            not_due: "not_due";
            pacer: "pacer";
            class_share: "class_share";
            page_hold: "page_hold";
            route_budget: "route_budget";
            route_hold: "route_hold";
            resource_hold: "resource_hold";
            subject_breaker: "subject_breaker";
            blocked_by_vendor: "blocked_by_vendor";
            dependency: "dependency";
            ownership_unconfirmed: "ownership_unconfirmed";
        }>>;
        waitingUntil: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>>;
}, z.core.$strict>;
/** The registry's resource files (the part of a key before the dot). Pinned
 *  equal to `ResourceFile` of the registry by `tests/sync-status-contracts.test.ts`. */
export declare const syncResourceFileEnum: z.ZodEnum<{
    account: "account";
    subscribers: "subscribers";
    notifications: "notifications";
    posts: "posts";
    catalog: "catalog";
    transactions: "transactions";
    payouts: "payouts";
    followers: "followers";
    repair: "repair";
    ws: "ws";
    "dm-conversations": "dm-conversations";
    "dm-messages": "dm-messages";
    "dm-live": "dm-live";
    "top-spenders": "top-spenders";
    "fan-earnings": "fan-earnings";
    purchases: "purchases";
    "fan-profiles": "fan-profiles";
    "post-replies": "post-replies";
    "media-stats": "media-stats";
    stats: "stats";
    "media-download": "media-download";
    probe: "probe";
}>;
export declare const syncPagesResponseSchema: z.ZodObject<{
    pages: z.ZodArray<z.ZodObject<{
        pageLabel: z.ZodNullable<z.ZodString>;
        mode: z.ZodEnum<{
            off: "off";
            shadow: "shadow";
            handover: "handover";
            live: "live";
        }>;
        owner: z.ZodObject<{
            generation: z.ZodString;
            host: z.ZodNullable<z.ZodString>;
            acquiredAt: z.ZodNullable<z.ZodString>;
            heartbeatAt: z.ZodNullable<z.ZodString>;
            running: z.ZodBoolean;
        }, z.core.$strict>;
        pause: z.ZodObject<{
            settingMs: z.ZodNumber;
            lastSendAt: z.ZodNullable<z.ZodString>;
            minGapLastHourMs: z.ZodNullable<z.ZodNumber>;
            violationsLastDay: z.ZodNumber;
        }, z.core.$strict>;
        sendsLastHour: z.ZodObject<{
            urgent: z.ZodNumber;
            requests: z.ZodNumber;
            planned: z.ZodNumber;
            byResource: z.ZodRecord<z.ZodString, z.ZodNumber>;
        }, z.core.$strict>;
        queue: z.ZodObject<{
            urgent: z.ZodObject<{
                runnable: z.ZodNumber;
                waitingByReason: z.ZodRecord<z.ZodEnum<{
                    running: "running";
                    paused: "paused";
                    quarantined: "quarantined";
                    not_due: "not_due";
                    pacer: "pacer";
                    class_share: "class_share";
                    page_hold: "page_hold";
                    route_budget: "route_budget";
                    route_hold: "route_hold";
                    resource_hold: "resource_hold";
                    subject_breaker: "subject_breaker";
                    blocked_by_vendor: "blocked_by_vendor";
                    dependency: "dependency";
                    ownership_unconfirmed: "ownership_unconfirmed";
                }> & z.core.$partial, z.ZodNumber>;
            }, z.core.$strict>;
            requests: z.ZodObject<{
                runnable: z.ZodNumber;
                waitingByReason: z.ZodRecord<z.ZodEnum<{
                    running: "running";
                    paused: "paused";
                    quarantined: "quarantined";
                    not_due: "not_due";
                    pacer: "pacer";
                    class_share: "class_share";
                    page_hold: "page_hold";
                    route_budget: "route_budget";
                    route_hold: "route_hold";
                    resource_hold: "resource_hold";
                    subject_breaker: "subject_breaker";
                    blocked_by_vendor: "blocked_by_vendor";
                    dependency: "dependency";
                    ownership_unconfirmed: "ownership_unconfirmed";
                }> & z.core.$partial, z.ZodNumber>;
            }, z.core.$strict>;
            planned: z.ZodObject<{
                runnable: z.ZodNumber;
                waitingByReason: z.ZodRecord<z.ZodEnum<{
                    running: "running";
                    paused: "paused";
                    quarantined: "quarantined";
                    not_due: "not_due";
                    pacer: "pacer";
                    class_share: "class_share";
                    page_hold: "page_hold";
                    route_budget: "route_budget";
                    route_hold: "route_hold";
                    resource_hold: "resource_hold";
                    subject_breaker: "subject_breaker";
                    blocked_by_vendor: "blocked_by_vendor";
                    dependency: "dependency";
                    ownership_unconfirmed: "ownership_unconfirmed";
                }> & z.core.$partial, z.ZodNumber>;
            }, z.core.$strict>;
        }, z.core.$strict>;
        holds: z.ZodObject<{
            page: z.ZodNullable<z.ZodObject<{
                kind: z.ZodEnum<{
                    auth: "auth";
                    identity_mismatch: "identity_mismatch";
                    network: "network";
                }>;
                until: z.ZodUnion<readonly [z.ZodString, z.ZodLiteral<"infinity">]>;
                since: z.ZodNullable<z.ZodString>;
            }, z.core.$strict>>;
            resources: z.ZodArray<z.ZodObject<{
                file: z.ZodString;
                until: z.ZodString;
                step: z.ZodNumber;
                kind: z.ZodEnum<{
                    breaker: "breaker";
                }>;
            }, z.core.$strict>>;
        }, z.core.$strict>;
        breakers: z.ZodObject<{
            open: z.ZodNumber;
            blockedByVendor: z.ZodNumber;
        }, z.core.$strict>;
        quarantined: z.ZodNumber;
        requests: z.ZodArray<z.ZodObject<{
            ref: z.ZodString;
            itemsReady: z.ZodNumber;
            itemsTotal: z.ZodNumber;
            readsDone: z.ZodNumber;
            readsRemainingMin: z.ZodNumber;
            etaEstimateSeconds: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>>;
        ws: z.ZodNullable<z.ZodObject<{
            connected: z.ZodBoolean;
            since: z.ZodNullable<z.ZodString>;
            gapSince: z.ZodNullable<z.ZodString>;
            decodeDebt: z.ZodNumber;
        }, z.core.$strict>>;
        shadow: z.ZodNullable<z.ZodObject<{
            attemptsLastHour: z.ZodNumber;
            demandVsEstimate: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const syncPageWorkQuerySchema: z.ZodObject<{
    resource: z.ZodOptional<z.ZodEnum<{
        "account.poll": "account.poll";
        "account.verify": "account.verify";
        "account.identity": "account.identity";
        "ws.connect": "ws.connect";
        "dm-live.deletions": "dm-live.deletions";
        "dm-conversations.head": "dm-conversations.head";
        "dm-conversations.full": "dm-conversations.full";
        "dm-conversations.find": "dm-conversations.find";
        "dm-conversations.detail": "dm-conversations.detail";
        "dm-conversations.ws-down": "dm-conversations.ws-down";
        "dm-messages.head": "dm-messages.head";
        "dm-messages.catchup": "dm-messages.catchup";
        "dm-messages.history": "dm-messages.history";
        "transactions.head": "transactions.head";
        "transactions.insurance": "transactions.insurance";
        "transactions.rescan": "transactions.rescan";
        "transactions.backfill": "transactions.backfill";
        "top-spenders.window": "top-spenders.window";
        "top-spenders.bootstrap": "top-spenders.bootstrap";
        "fan-earnings.roster": "fan-earnings.roster";
        "purchases.targets": "purchases.targets";
        "payouts.daily": "payouts.daily";
        "payouts.walk": "payouts.walk";
        "subscribers.poll": "subscribers.poll";
        "subscribers.history": "subscribers.history";
        "followers.head": "followers.head";
        "followers.reconcile": "followers.reconcile";
        "fan-profiles.lookup": "fan-profiles.lookup";
        "fan-profiles.probe": "fan-profiles.probe";
        "fan-profiles.alias-backfill": "fan-profiles.alias-backfill";
        "notifications.forward": "notifications.forward";
        "notifications.backfill": "notifications.backfill";
        "posts.refresh": "posts.refresh";
        "posts.backfill": "posts.backfill";
        "posts.engagement": "posts.engagement";
        "post-replies.walk": "post-replies.walk";
        "post-replies.authors": "post-replies.authors";
        "catalog.fixed": "catalog.fixed";
        "catalog.vault": "catalog.vault";
        "catalog.hydrate": "catalog.hydrate";
        "media-stats.walk": "media-stats.walk";
        "stats.daily": "stats.daily";
        "stats.hourly": "stats.hourly";
        "stats.backfill": "stats.backfill";
        "media-download.fetch": "media-download.fetch";
        "repair.ws-gap": "repair.ws-gap";
        "probe.manual": "probe.manual";
        "probe.excluded-chat": "probe.excluded-chat";
    }>>;
    subject: z.ZodOptional<z.ZodString>;
    state: z.ZodOptional<z.ZodEnum<{
        cancelled: "cancelled";
        running: "running";
        quarantined: "quarantined";
        open: "open";
        done: "done";
        superseded: "superseded";
    }>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strict>;
export declare const syncPageWorkResponseSchema: z.ZodObject<{
    work: z.ZodArray<z.ZodObject<{
        id: z.ZodNumber;
        resource: z.ZodString;
        subject: z.ZodString;
        shadow: z.ZodBoolean;
        kind: z.ZodEnum<{
            trigger: "trigger";
            poll: "poll";
            goal: "goal";
            repair: "repair";
        }>;
        class: z.ZodEnum<{
            requests: "requests";
            planned: "planned";
            urgent: "urgent";
        }>;
        state: z.ZodEnum<{
            cancelled: "cancelled";
            running: "running";
            quarantined: "quarantined";
            open: "open";
            done: "done";
            superseded: "superseded";
        }>;
        waitingReason: z.ZodNullable<z.ZodEnum<{
            running: "running";
            paused: "paused";
            quarantined: "quarantined";
            not_due: "not_due";
            pacer: "pacer";
            class_share: "class_share";
            page_hold: "page_hold";
            route_budget: "route_budget";
            route_hold: "route_hold";
            resource_hold: "resource_hold";
            subject_breaker: "subject_breaker";
            blocked_by_vendor: "blocked_by_vendor";
            dependency: "dependency";
            ownership_unconfirmed: "ownership_unconfirmed";
        }>>;
        waitingUntil: z.ZodNullable<z.ZodString>;
        dueAt: z.ZodString;
        demandRevision: z.ZodNumber;
        appliedRevision: z.ZodNumber;
        failureCount: z.ZodNumber;
        breakerUntil: z.ZodNullable<z.ZodString>;
        blockedByVendorAt: z.ZodNullable<z.ZodString>;
        lastAttempt: z.ZodNullable<z.ZodObject<{
            admittedAt: z.ZodString;
            sentAt: z.ZodNullable<z.ZodString>;
            outcome: z.ZodEnum<{
                unknown: "unknown";
                timeout: "timeout";
                shadow: "shadow";
                admitted: "admitted";
                sent: "sent";
                response: "response";
                transport_error: "transport_error";
                aborted_before_send: "aborted_before_send";
            }>;
            httpStatus: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>>;
        closedAt: z.ZodNullable<z.ZodString>;
        closeReason: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const syncPageWorkParamsSchema: z.ZodObject<{
    workId: z.ZodCoercedNumber<unknown>;
    pageLabel: z.ZodString;
}, z.core.$strict>;
export declare const syncPageWorkGetResponseSchema: z.ZodObject<{
    work: z.ZodObject<{
        id: z.ZodNumber;
        resource: z.ZodString;
        subject: z.ZodString;
        shadow: z.ZodBoolean;
        kind: z.ZodEnum<{
            trigger: "trigger";
            poll: "poll";
            goal: "goal";
            repair: "repair";
        }>;
        class: z.ZodEnum<{
            requests: "requests";
            planned: "planned";
            urgent: "urgent";
        }>;
        state: z.ZodEnum<{
            cancelled: "cancelled";
            running: "running";
            quarantined: "quarantined";
            open: "open";
            done: "done";
            superseded: "superseded";
        }>;
        waitingReason: z.ZodNullable<z.ZodEnum<{
            running: "running";
            paused: "paused";
            quarantined: "quarantined";
            not_due: "not_due";
            pacer: "pacer";
            class_share: "class_share";
            page_hold: "page_hold";
            route_budget: "route_budget";
            route_hold: "route_hold";
            resource_hold: "resource_hold";
            subject_breaker: "subject_breaker";
            blocked_by_vendor: "blocked_by_vendor";
            dependency: "dependency";
            ownership_unconfirmed: "ownership_unconfirmed";
        }>>;
        waitingUntil: z.ZodNullable<z.ZodString>;
        dueAt: z.ZodString;
        demandRevision: z.ZodNumber;
        appliedRevision: z.ZodNumber;
        failureCount: z.ZodNumber;
        breakerUntil: z.ZodNullable<z.ZodString>;
        blockedByVendorAt: z.ZodNullable<z.ZodString>;
        lastAttempt: z.ZodNullable<z.ZodObject<{
            admittedAt: z.ZodString;
            sentAt: z.ZodNullable<z.ZodString>;
            outcome: z.ZodEnum<{
                unknown: "unknown";
                timeout: "timeout";
                shadow: "shadow";
                admitted: "admitted";
                sent: "sent";
                response: "response";
                transport_error: "transport_error";
                aborted_before_send: "aborted_before_send";
            }>;
            httpStatus: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>>;
        closedAt: z.ZodNullable<z.ZodString>;
        closeReason: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>;
}, z.core.$strict>;
export declare const syncPageRefreshBodySchema: z.ZodObject<{
    resources: z.ZodOptional<z.ZodArray<z.ZodEnum<{
        account: "account";
        subscribers: "subscribers";
        notifications: "notifications";
        posts: "posts";
        catalog: "catalog";
        transactions: "transactions";
        payouts: "payouts";
        followers: "followers";
        repair: "repair";
        ws: "ws";
        "dm-conversations": "dm-conversations";
        "dm-messages": "dm-messages";
        "dm-live": "dm-live";
        "top-spenders": "top-spenders";
        "fan-earnings": "fan-earnings";
        purchases: "purchases";
        "fan-profiles": "fan-profiles";
        "post-replies": "post-replies";
        "media-stats": "media-stats";
        stats: "stats";
        "media-download": "media-download";
        probe: "probe";
    }>>>;
}, z.core.$strict>;
export declare const syncPageRefreshResponseSchema: z.ZodObject<{
    bumped: z.ZodNumber;
    shadow: z.ZodBoolean;
}, z.core.$strict>;
export declare const syncRouteSchemas: {
    readonly syncPages: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: string;
        readonly response: {
            readonly 200: z.ZodObject<{
                pages: z.ZodArray<z.ZodObject<{
                    pageLabel: z.ZodNullable<z.ZodString>;
                    mode: z.ZodEnum<{
                        off: "off";
                        shadow: "shadow";
                        handover: "handover";
                        live: "live";
                    }>;
                    owner: z.ZodObject<{
                        generation: z.ZodString;
                        host: z.ZodNullable<z.ZodString>;
                        acquiredAt: z.ZodNullable<z.ZodString>;
                        heartbeatAt: z.ZodNullable<z.ZodString>;
                        running: z.ZodBoolean;
                    }, z.core.$strict>;
                    pause: z.ZodObject<{
                        settingMs: z.ZodNumber;
                        lastSendAt: z.ZodNullable<z.ZodString>;
                        minGapLastHourMs: z.ZodNullable<z.ZodNumber>;
                        violationsLastDay: z.ZodNumber;
                    }, z.core.$strict>;
                    sendsLastHour: z.ZodObject<{
                        urgent: z.ZodNumber;
                        requests: z.ZodNumber;
                        planned: z.ZodNumber;
                        byResource: z.ZodRecord<z.ZodString, z.ZodNumber>;
                    }, z.core.$strict>;
                    queue: z.ZodObject<{
                        urgent: z.ZodObject<{
                            runnable: z.ZodNumber;
                            waitingByReason: z.ZodRecord<z.ZodEnum<{
                                running: "running";
                                paused: "paused";
                                quarantined: "quarantined";
                                not_due: "not_due";
                                pacer: "pacer";
                                class_share: "class_share";
                                page_hold: "page_hold";
                                route_budget: "route_budget";
                                route_hold: "route_hold";
                                resource_hold: "resource_hold";
                                subject_breaker: "subject_breaker";
                                blocked_by_vendor: "blocked_by_vendor";
                                dependency: "dependency";
                                ownership_unconfirmed: "ownership_unconfirmed";
                            }> & z.core.$partial, z.ZodNumber>;
                        }, z.core.$strict>;
                        requests: z.ZodObject<{
                            runnable: z.ZodNumber;
                            waitingByReason: z.ZodRecord<z.ZodEnum<{
                                running: "running";
                                paused: "paused";
                                quarantined: "quarantined";
                                not_due: "not_due";
                                pacer: "pacer";
                                class_share: "class_share";
                                page_hold: "page_hold";
                                route_budget: "route_budget";
                                route_hold: "route_hold";
                                resource_hold: "resource_hold";
                                subject_breaker: "subject_breaker";
                                blocked_by_vendor: "blocked_by_vendor";
                                dependency: "dependency";
                                ownership_unconfirmed: "ownership_unconfirmed";
                            }> & z.core.$partial, z.ZodNumber>;
                        }, z.core.$strict>;
                        planned: z.ZodObject<{
                            runnable: z.ZodNumber;
                            waitingByReason: z.ZodRecord<z.ZodEnum<{
                                running: "running";
                                paused: "paused";
                                quarantined: "quarantined";
                                not_due: "not_due";
                                pacer: "pacer";
                                class_share: "class_share";
                                page_hold: "page_hold";
                                route_budget: "route_budget";
                                route_hold: "route_hold";
                                resource_hold: "resource_hold";
                                subject_breaker: "subject_breaker";
                                blocked_by_vendor: "blocked_by_vendor";
                                dependency: "dependency";
                                ownership_unconfirmed: "ownership_unconfirmed";
                            }> & z.core.$partial, z.ZodNumber>;
                        }, z.core.$strict>;
                    }, z.core.$strict>;
                    holds: z.ZodObject<{
                        page: z.ZodNullable<z.ZodObject<{
                            kind: z.ZodEnum<{
                                auth: "auth";
                                identity_mismatch: "identity_mismatch";
                                network: "network";
                            }>;
                            until: z.ZodUnion<readonly [z.ZodString, z.ZodLiteral<"infinity">]>;
                            since: z.ZodNullable<z.ZodString>;
                        }, z.core.$strict>>;
                        resources: z.ZodArray<z.ZodObject<{
                            file: z.ZodString;
                            until: z.ZodString;
                            step: z.ZodNumber;
                            kind: z.ZodEnum<{
                                breaker: "breaker";
                            }>;
                        }, z.core.$strict>>;
                    }, z.core.$strict>;
                    breakers: z.ZodObject<{
                        open: z.ZodNumber;
                        blockedByVendor: z.ZodNumber;
                    }, z.core.$strict>;
                    quarantined: z.ZodNumber;
                    requests: z.ZodArray<z.ZodObject<{
                        ref: z.ZodString;
                        itemsReady: z.ZodNumber;
                        itemsTotal: z.ZodNumber;
                        readsDone: z.ZodNumber;
                        readsRemainingMin: z.ZodNumber;
                        etaEstimateSeconds: z.ZodNullable<z.ZodNumber>;
                    }, z.core.$strict>>;
                    ws: z.ZodNullable<z.ZodObject<{
                        connected: z.ZodBoolean;
                        since: z.ZodNullable<z.ZodString>;
                        gapSince: z.ZodNullable<z.ZodString>;
                        decodeDebt: z.ZodNumber;
                    }, z.core.$strict>>;
                    shadow: z.ZodNullable<z.ZodObject<{
                        attemptsLastHour: z.ZodNumber;
                        demandVsEstimate: z.ZodNullable<z.ZodNumber>;
                    }, z.core.$strict>>;
                }, z.core.$strict>>;
            }, z.core.$strict>;
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
    readonly syncPageWork: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "A page's work rows, newest first, each with why it waits (Fansly Sync Engine)";
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strict>;
        readonly querystring: z.ZodObject<{
            resource: z.ZodOptional<z.ZodEnum<{
                "account.poll": "account.poll";
                "account.verify": "account.verify";
                "account.identity": "account.identity";
                "ws.connect": "ws.connect";
                "dm-live.deletions": "dm-live.deletions";
                "dm-conversations.head": "dm-conversations.head";
                "dm-conversations.full": "dm-conversations.full";
                "dm-conversations.find": "dm-conversations.find";
                "dm-conversations.detail": "dm-conversations.detail";
                "dm-conversations.ws-down": "dm-conversations.ws-down";
                "dm-messages.head": "dm-messages.head";
                "dm-messages.catchup": "dm-messages.catchup";
                "dm-messages.history": "dm-messages.history";
                "transactions.head": "transactions.head";
                "transactions.insurance": "transactions.insurance";
                "transactions.rescan": "transactions.rescan";
                "transactions.backfill": "transactions.backfill";
                "top-spenders.window": "top-spenders.window";
                "top-spenders.bootstrap": "top-spenders.bootstrap";
                "fan-earnings.roster": "fan-earnings.roster";
                "purchases.targets": "purchases.targets";
                "payouts.daily": "payouts.daily";
                "payouts.walk": "payouts.walk";
                "subscribers.poll": "subscribers.poll";
                "subscribers.history": "subscribers.history";
                "followers.head": "followers.head";
                "followers.reconcile": "followers.reconcile";
                "fan-profiles.lookup": "fan-profiles.lookup";
                "fan-profiles.probe": "fan-profiles.probe";
                "fan-profiles.alias-backfill": "fan-profiles.alias-backfill";
                "notifications.forward": "notifications.forward";
                "notifications.backfill": "notifications.backfill";
                "posts.refresh": "posts.refresh";
                "posts.backfill": "posts.backfill";
                "posts.engagement": "posts.engagement";
                "post-replies.walk": "post-replies.walk";
                "post-replies.authors": "post-replies.authors";
                "catalog.fixed": "catalog.fixed";
                "catalog.vault": "catalog.vault";
                "catalog.hydrate": "catalog.hydrate";
                "media-stats.walk": "media-stats.walk";
                "stats.daily": "stats.daily";
                "stats.hourly": "stats.hourly";
                "stats.backfill": "stats.backfill";
                "media-download.fetch": "media-download.fetch";
                "repair.ws-gap": "repair.ws-gap";
                "probe.manual": "probe.manual";
                "probe.excluded-chat": "probe.excluded-chat";
            }>>;
            subject: z.ZodOptional<z.ZodString>;
            state: z.ZodOptional<z.ZodEnum<{
                cancelled: "cancelled";
                running: "running";
                quarantined: "quarantined";
                open: "open";
                done: "done";
                superseded: "superseded";
            }>>;
            limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
        }, z.core.$strict>;
        readonly response: {
            readonly 200: z.ZodObject<{
                work: z.ZodArray<z.ZodObject<{
                    id: z.ZodNumber;
                    resource: z.ZodString;
                    subject: z.ZodString;
                    shadow: z.ZodBoolean;
                    kind: z.ZodEnum<{
                        trigger: "trigger";
                        poll: "poll";
                        goal: "goal";
                        repair: "repair";
                    }>;
                    class: z.ZodEnum<{
                        requests: "requests";
                        planned: "planned";
                        urgent: "urgent";
                    }>;
                    state: z.ZodEnum<{
                        cancelled: "cancelled";
                        running: "running";
                        quarantined: "quarantined";
                        open: "open";
                        done: "done";
                        superseded: "superseded";
                    }>;
                    waitingReason: z.ZodNullable<z.ZodEnum<{
                        running: "running";
                        paused: "paused";
                        quarantined: "quarantined";
                        not_due: "not_due";
                        pacer: "pacer";
                        class_share: "class_share";
                        page_hold: "page_hold";
                        route_budget: "route_budget";
                        route_hold: "route_hold";
                        resource_hold: "resource_hold";
                        subject_breaker: "subject_breaker";
                        blocked_by_vendor: "blocked_by_vendor";
                        dependency: "dependency";
                        ownership_unconfirmed: "ownership_unconfirmed";
                    }>>;
                    waitingUntil: z.ZodNullable<z.ZodString>;
                    dueAt: z.ZodString;
                    demandRevision: z.ZodNumber;
                    appliedRevision: z.ZodNumber;
                    failureCount: z.ZodNumber;
                    breakerUntil: z.ZodNullable<z.ZodString>;
                    blockedByVendorAt: z.ZodNullable<z.ZodString>;
                    lastAttempt: z.ZodNullable<z.ZodObject<{
                        admittedAt: z.ZodString;
                        sentAt: z.ZodNullable<z.ZodString>;
                        outcome: z.ZodEnum<{
                            unknown: "unknown";
                            timeout: "timeout";
                            shadow: "shadow";
                            admitted: "admitted";
                            sent: "sent";
                            response: "response";
                            transport_error: "transport_error";
                            aborted_before_send: "aborted_before_send";
                        }>;
                        httpStatus: z.ZodNullable<z.ZodNumber>;
                    }, z.core.$strict>>;
                    closedAt: z.ZodNullable<z.ZodString>;
                    closeReason: z.ZodNullable<z.ZodString>;
                }, z.core.$strict>>;
            }, z.core.$strict>;
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
    readonly syncPageWorkGet: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "One work row of a page and why it waits: the status link a queued \"enqueue and wait\" call answers with";
        readonly params: z.ZodObject<{
            workId: z.ZodCoercedNumber<unknown>;
            pageLabel: z.ZodString;
        }, z.core.$strict>;
        readonly response: {
            readonly 200: z.ZodObject<{
                work: z.ZodObject<{
                    id: z.ZodNumber;
                    resource: z.ZodString;
                    subject: z.ZodString;
                    shadow: z.ZodBoolean;
                    kind: z.ZodEnum<{
                        trigger: "trigger";
                        poll: "poll";
                        goal: "goal";
                        repair: "repair";
                    }>;
                    class: z.ZodEnum<{
                        requests: "requests";
                        planned: "planned";
                        urgent: "urgent";
                    }>;
                    state: z.ZodEnum<{
                        cancelled: "cancelled";
                        running: "running";
                        quarantined: "quarantined";
                        open: "open";
                        done: "done";
                        superseded: "superseded";
                    }>;
                    waitingReason: z.ZodNullable<z.ZodEnum<{
                        running: "running";
                        paused: "paused";
                        quarantined: "quarantined";
                        not_due: "not_due";
                        pacer: "pacer";
                        class_share: "class_share";
                        page_hold: "page_hold";
                        route_budget: "route_budget";
                        route_hold: "route_hold";
                        resource_hold: "resource_hold";
                        subject_breaker: "subject_breaker";
                        blocked_by_vendor: "blocked_by_vendor";
                        dependency: "dependency";
                        ownership_unconfirmed: "ownership_unconfirmed";
                    }>>;
                    waitingUntil: z.ZodNullable<z.ZodString>;
                    dueAt: z.ZodString;
                    demandRevision: z.ZodNumber;
                    appliedRevision: z.ZodNumber;
                    failureCount: z.ZodNumber;
                    breakerUntil: z.ZodNullable<z.ZodString>;
                    blockedByVendorAt: z.ZodNullable<z.ZodString>;
                    lastAttempt: z.ZodNullable<z.ZodObject<{
                        admittedAt: z.ZodString;
                        sentAt: z.ZodNullable<z.ZodString>;
                        outcome: z.ZodEnum<{
                            unknown: "unknown";
                            timeout: "timeout";
                            shadow: "shadow";
                            admitted: "admitted";
                            sent: "sent";
                            response: "response";
                            transport_error: "transport_error";
                            aborted_before_send: "aborted_before_send";
                        }>;
                        httpStatus: z.ZodNullable<z.ZodNumber>;
                    }, z.core.$strict>>;
                    closedAt: z.ZodNullable<z.ZodString>;
                    closeReason: z.ZodNullable<z.ZodString>;
                }, z.core.$strict>;
            }, z.core.$strict>;
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
    readonly syncPageRefresh: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: string;
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strict>;
        readonly body: z.ZodObject<{
            resources: z.ZodOptional<z.ZodArray<z.ZodEnum<{
                account: "account";
                subscribers: "subscribers";
                notifications: "notifications";
                posts: "posts";
                catalog: "catalog";
                transactions: "transactions";
                payouts: "payouts";
                followers: "followers";
                repair: "repair";
                ws: "ws";
                "dm-conversations": "dm-conversations";
                "dm-messages": "dm-messages";
                "dm-live": "dm-live";
                "top-spenders": "top-spenders";
                "fan-earnings": "fan-earnings";
                purchases: "purchases";
                "fan-profiles": "fan-profiles";
                "post-replies": "post-replies";
                "media-stats": "media-stats";
                stats: "stats";
                "media-download": "media-download";
                probe: "probe";
            }>>>;
        }, z.core.$strict>;
        readonly response: {
            readonly 202: z.ZodObject<{
                bumped: z.ZodNumber;
                shadow: z.ZodBoolean;
            }, z.core.$strict>;
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
    readonly syncHistoryRequests: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "History requests of every requester, newest first (Fansly Sync Engine)";
        readonly querystring: z.ZodObject<{
            pageLabel: z.ZodOptional<z.ZodString>;
            state: z.ZodOptional<z.ZodEnum<{
                cancelled: "cancelled";
                open: "open";
                done: "done";
            }>>;
            limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
        }, z.core.$strict>;
        readonly response: {
            readonly 200: z.ZodObject<{
                requests: z.ZodArray<z.ZodObject<{
                    ref: z.ZodString;
                    pageLabel: z.ZodNullable<z.ZodString>;
                    state: z.ZodEnum<{
                        cancelled: "cancelled";
                        open: "open";
                        done: "done";
                    }>;
                    depth: z.ZodObject<{
                        kind: z.ZodEnum<{
                            all: "all";
                            latest: "latest";
                            before_boundary: "before_boundary";
                        }>;
                        count: z.ZodOptional<z.ZodNumber>;
                        boundaryAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                        boundaryMessageRef: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                    }, z.core.$strict>;
                    requesterKind: z.ZodEnum<{
                        agent_key: "agent_key";
                        owner_session: "owner_session";
                        owner_cli: "owner_cli";
                        legacy_hydration_wrapper: "legacy_hydration_wrapper";
                        switch_migration: "switch_migration";
                    }>;
                    createdAt: z.ZodString;
                    doneAt: z.ZodNullable<z.ZodString>;
                    cancelledAt: z.ZodNullable<z.ZodString>;
                    counts: z.ZodObject<{
                        total: z.ZodNumber;
                        ready: z.ZodNumber;
                        queued: z.ZodNumber;
                        loading: z.ZodNumber;
                        blocked: z.ZodNumber;
                        refused: z.ZodNumber;
                        cancelled: z.ZodNumber;
                    }, z.core.$strict>;
                    reads: z.ZodObject<{
                        done: z.ZodNumber;
                        remainingMin: z.ZodNumber;
                        remainingEstimate: z.ZodNullable<z.ZodNumber>;
                    }, z.core.$strict>;
                    eta: z.ZodObject<{
                        lowerBoundSeconds: z.ZodNumber;
                        estimateSeconds: z.ZodNullable<z.ZodNumber>;
                        basis: z.ZodLiteral<"estimate">;
                        ratePerHour: z.ZodNumber;
                        sharePercent: z.ZodNumber;
                        limitedBy: z.ZodEnum<{
                            page: "page";
                            family: "family";
                            route: "route";
                        }>;
                        slowdown: z.ZodNullable<z.ZodObject<{
                            route: z.ZodString;
                            effectivePerMin: z.ZodNumber;
                            currentPerMin: z.ZodNumber;
                        }, z.core.$strict>>;
                        hold: z.ZodNullable<z.ZodObject<{
                            scope: z.ZodEnum<{
                                page: "page";
                                route: "route";
                            }>;
                            until: z.ZodNullable<z.ZodString>;
                        }, z.core.$strict>>;
                    }, z.core.$strict>;
                    queuePosition: z.ZodNullable<z.ZodNumber>;
                    waitingReason: z.ZodNullable<z.ZodEnum<{
                        running: "running";
                        paused: "paused";
                        quarantined: "quarantined";
                        not_due: "not_due";
                        pacer: "pacer";
                        class_share: "class_share";
                        page_hold: "page_hold";
                        route_budget: "route_budget";
                        route_hold: "route_hold";
                        resource_hold: "resource_hold";
                        subject_breaker: "subject_breaker";
                        blocked_by_vendor: "blocked_by_vendor";
                        dependency: "dependency";
                        ownership_unconfirmed: "ownership_unconfirmed";
                    }>>;
                    waitingUntil: z.ZodNullable<z.ZodString>;
                }, z.core.$strict>>;
            }, z.core.$strict>;
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
    readonly syncHistoryRequestCreate: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: string;
        readonly params: z.ZodObject<{
            pageLabel: z.ZodString;
        }, z.core.$strict>;
        readonly body: z.ZodObject<{
            fans: z.ZodArray<z.ZodUnion<readonly [z.ZodObject<{
                kind: z.ZodLiteral<"fan">;
                platformUserId: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"conversation">;
                conversationRef: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"chat_url">;
                url: z.ZodString;
            }, z.core.$strict>]>>;
            depth: z.ZodUnion<readonly [z.ZodObject<{
                kind: z.ZodLiteral<"all">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"latest">;
                count: z.ZodNumber;
            }, z.core.$strict>]>;
            reason: z.ZodString;
            idempotencyKey: z.ZodString;
        }, z.core.$strict>;
        readonly response: {
            readonly 200: z.ZodObject<{
                disposition: z.ZodEnum<{
                    created: "created";
                    coalesced: "coalesced";
                }>;
                request: z.ZodObject<{
                    ref: z.ZodString;
                    pageLabel: z.ZodNullable<z.ZodString>;
                    state: z.ZodEnum<{
                        cancelled: "cancelled";
                        open: "open";
                        done: "done";
                    }>;
                    depth: z.ZodObject<{
                        kind: z.ZodEnum<{
                            all: "all";
                            latest: "latest";
                            before_boundary: "before_boundary";
                        }>;
                        count: z.ZodOptional<z.ZodNumber>;
                        boundaryAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                        boundaryMessageRef: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                    }, z.core.$strict>;
                    requesterKind: z.ZodEnum<{
                        agent_key: "agent_key";
                        owner_session: "owner_session";
                        owner_cli: "owner_cli";
                        legacy_hydration_wrapper: "legacy_hydration_wrapper";
                        switch_migration: "switch_migration";
                    }>;
                    createdAt: z.ZodString;
                    doneAt: z.ZodNullable<z.ZodString>;
                    cancelledAt: z.ZodNullable<z.ZodString>;
                    counts: z.ZodObject<{
                        total: z.ZodNumber;
                        ready: z.ZodNumber;
                        queued: z.ZodNumber;
                        loading: z.ZodNumber;
                        blocked: z.ZodNumber;
                        refused: z.ZodNumber;
                        cancelled: z.ZodNumber;
                    }, z.core.$strict>;
                    reads: z.ZodObject<{
                        done: z.ZodNumber;
                        remainingMin: z.ZodNumber;
                        remainingEstimate: z.ZodNullable<z.ZodNumber>;
                    }, z.core.$strict>;
                    eta: z.ZodObject<{
                        lowerBoundSeconds: z.ZodNumber;
                        estimateSeconds: z.ZodNullable<z.ZodNumber>;
                        basis: z.ZodLiteral<"estimate">;
                        ratePerHour: z.ZodNumber;
                        sharePercent: z.ZodNumber;
                        limitedBy: z.ZodEnum<{
                            page: "page";
                            family: "family";
                            route: "route";
                        }>;
                        slowdown: z.ZodNullable<z.ZodObject<{
                            route: z.ZodString;
                            effectivePerMin: z.ZodNumber;
                            currentPerMin: z.ZodNumber;
                        }, z.core.$strict>>;
                        hold: z.ZodNullable<z.ZodObject<{
                            scope: z.ZodEnum<{
                                page: "page";
                                route: "route";
                            }>;
                            until: z.ZodNullable<z.ZodString>;
                        }, z.core.$strict>>;
                    }, z.core.$strict>;
                    queuePosition: z.ZodNullable<z.ZodNumber>;
                    waitingReason: z.ZodNullable<z.ZodEnum<{
                        running: "running";
                        paused: "paused";
                        quarantined: "quarantined";
                        not_due: "not_due";
                        pacer: "pacer";
                        class_share: "class_share";
                        page_hold: "page_hold";
                        route_budget: "route_budget";
                        route_hold: "route_hold";
                        resource_hold: "resource_hold";
                        subject_breaker: "subject_breaker";
                        blocked_by_vendor: "blocked_by_vendor";
                        dependency: "dependency";
                        ownership_unconfirmed: "ownership_unconfirmed";
                    }>>;
                    waitingUntil: z.ZodNullable<z.ZodString>;
                }, z.core.$strict>;
                items: z.ZodArray<z.ZodObject<{
                    ordinal: z.ZodNumber;
                    input: z.ZodObject<{
                        kind: z.ZodEnum<{
                            fan: "fan";
                            conversation: "conversation";
                            chat_url: "chat_url";
                        }>;
                        ref: z.ZodString;
                    }, z.core.$strict>;
                    fanPlatformUserId: z.ZodNullable<z.ZodString>;
                    conversationRef: z.ZodNullable<z.ZodString>;
                    state: z.ZodEnum<{
                        ready: "ready";
                        blocked: "blocked";
                        cancelled: "cancelled";
                        queued: "queued";
                        refused: "refused";
                        loading: "loading";
                    }>;
                    refusal: z.ZodNullable<z.ZodEnum<{
                        excluded: "excluded";
                        duplicate: "duplicate";
                        not_found: "not_found";
                        page_erased: "page_erased";
                    }>>;
                    excludedReason: z.ZodNullable<z.ZodString>;
                    probeAt: z.ZodNullable<z.ZodString>;
                    waitingReason: z.ZodNullable<z.ZodEnum<{
                        running: "running";
                        paused: "paused";
                        quarantined: "quarantined";
                        not_due: "not_due";
                        pacer: "pacer";
                        class_share: "class_share";
                        page_hold: "page_hold";
                        route_budget: "route_budget";
                        route_hold: "route_hold";
                        resource_hold: "resource_hold";
                        subject_breaker: "subject_breaker";
                        blocked_by_vendor: "blocked_by_vendor";
                        dependency: "dependency";
                        ownership_unconfirmed: "ownership_unconfirmed";
                    }>>;
                    waitingUntil: z.ZodNullable<z.ZodString>;
                    loadedMessages: z.ZodNumber;
                    oldestLoadedAt: z.ZodNullable<z.ZodString>;
                    readsSpent: z.ZodNumber;
                    historyState: z.ZodEnum<{
                        complete: "complete";
                        none: "none";
                        partial: "partial";
                        unverified: "unverified";
                    }>;
                    historyProof: z.ZodNullable<z.ZodEnum<{
                        empty_page: "empty_page";
                    }>>;
                    anchorMessageRef: z.ZodNullable<z.ZodString>;
                    satisfiedAt: z.ZodNullable<z.ZodString>;
                    satisfiedBy: z.ZodNullable<z.ZodEnum<{
                        empty_page: "empty_page";
                        latest_n: "latest_n";
                        boundary: "boundary";
                        already_satisfied: "already_satisfied";
                    }>>;
                    estimate: z.ZodObject<{
                        readsMin: z.ZodNumber;
                        readsEstimate: z.ZodNullable<z.ZodNumber>;
                    }, z.core.$strict>;
                }, z.core.$strict>>;
                nextAfterOrdinal: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strict>;
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
    readonly syncHistoryRequestGet: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "One history request: counts, reads, ETA, why it waits, and a page of its fans";
        readonly params: z.ZodObject<{
            requestRef: z.ZodString;
        }, z.core.$strict>;
        readonly querystring: z.ZodObject<{
            limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            afterOrdinal: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
            state: z.ZodOptional<z.ZodEnum<{
                ready: "ready";
                blocked: "blocked";
                cancelled: "cancelled";
                queued: "queued";
                refused: "refused";
                loading: "loading";
            }>>;
        }, z.core.$strict>;
        readonly response: {
            readonly 200: z.ZodObject<{
                request: z.ZodObject<{
                    ref: z.ZodString;
                    pageLabel: z.ZodNullable<z.ZodString>;
                    state: z.ZodEnum<{
                        cancelled: "cancelled";
                        open: "open";
                        done: "done";
                    }>;
                    depth: z.ZodObject<{
                        kind: z.ZodEnum<{
                            all: "all";
                            latest: "latest";
                            before_boundary: "before_boundary";
                        }>;
                        count: z.ZodOptional<z.ZodNumber>;
                        boundaryAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                        boundaryMessageRef: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                    }, z.core.$strict>;
                    requesterKind: z.ZodEnum<{
                        agent_key: "agent_key";
                        owner_session: "owner_session";
                        owner_cli: "owner_cli";
                        legacy_hydration_wrapper: "legacy_hydration_wrapper";
                        switch_migration: "switch_migration";
                    }>;
                    createdAt: z.ZodString;
                    doneAt: z.ZodNullable<z.ZodString>;
                    cancelledAt: z.ZodNullable<z.ZodString>;
                    counts: z.ZodObject<{
                        total: z.ZodNumber;
                        ready: z.ZodNumber;
                        queued: z.ZodNumber;
                        loading: z.ZodNumber;
                        blocked: z.ZodNumber;
                        refused: z.ZodNumber;
                        cancelled: z.ZodNumber;
                    }, z.core.$strict>;
                    reads: z.ZodObject<{
                        done: z.ZodNumber;
                        remainingMin: z.ZodNumber;
                        remainingEstimate: z.ZodNullable<z.ZodNumber>;
                    }, z.core.$strict>;
                    eta: z.ZodObject<{
                        lowerBoundSeconds: z.ZodNumber;
                        estimateSeconds: z.ZodNullable<z.ZodNumber>;
                        basis: z.ZodLiteral<"estimate">;
                        ratePerHour: z.ZodNumber;
                        sharePercent: z.ZodNumber;
                        limitedBy: z.ZodEnum<{
                            page: "page";
                            family: "family";
                            route: "route";
                        }>;
                        slowdown: z.ZodNullable<z.ZodObject<{
                            route: z.ZodString;
                            effectivePerMin: z.ZodNumber;
                            currentPerMin: z.ZodNumber;
                        }, z.core.$strict>>;
                        hold: z.ZodNullable<z.ZodObject<{
                            scope: z.ZodEnum<{
                                page: "page";
                                route: "route";
                            }>;
                            until: z.ZodNullable<z.ZodString>;
                        }, z.core.$strict>>;
                    }, z.core.$strict>;
                    queuePosition: z.ZodNullable<z.ZodNumber>;
                    waitingReason: z.ZodNullable<z.ZodEnum<{
                        running: "running";
                        paused: "paused";
                        quarantined: "quarantined";
                        not_due: "not_due";
                        pacer: "pacer";
                        class_share: "class_share";
                        page_hold: "page_hold";
                        route_budget: "route_budget";
                        route_hold: "route_hold";
                        resource_hold: "resource_hold";
                        subject_breaker: "subject_breaker";
                        blocked_by_vendor: "blocked_by_vendor";
                        dependency: "dependency";
                        ownership_unconfirmed: "ownership_unconfirmed";
                    }>>;
                    waitingUntil: z.ZodNullable<z.ZodString>;
                }, z.core.$strict>;
                items: z.ZodArray<z.ZodObject<{
                    ordinal: z.ZodNumber;
                    input: z.ZodObject<{
                        kind: z.ZodEnum<{
                            fan: "fan";
                            conversation: "conversation";
                            chat_url: "chat_url";
                        }>;
                        ref: z.ZodString;
                    }, z.core.$strict>;
                    fanPlatformUserId: z.ZodNullable<z.ZodString>;
                    conversationRef: z.ZodNullable<z.ZodString>;
                    state: z.ZodEnum<{
                        ready: "ready";
                        blocked: "blocked";
                        cancelled: "cancelled";
                        queued: "queued";
                        refused: "refused";
                        loading: "loading";
                    }>;
                    refusal: z.ZodNullable<z.ZodEnum<{
                        excluded: "excluded";
                        duplicate: "duplicate";
                        not_found: "not_found";
                        page_erased: "page_erased";
                    }>>;
                    excludedReason: z.ZodNullable<z.ZodString>;
                    probeAt: z.ZodNullable<z.ZodString>;
                    waitingReason: z.ZodNullable<z.ZodEnum<{
                        running: "running";
                        paused: "paused";
                        quarantined: "quarantined";
                        not_due: "not_due";
                        pacer: "pacer";
                        class_share: "class_share";
                        page_hold: "page_hold";
                        route_budget: "route_budget";
                        route_hold: "route_hold";
                        resource_hold: "resource_hold";
                        subject_breaker: "subject_breaker";
                        blocked_by_vendor: "blocked_by_vendor";
                        dependency: "dependency";
                        ownership_unconfirmed: "ownership_unconfirmed";
                    }>>;
                    waitingUntil: z.ZodNullable<z.ZodString>;
                    loadedMessages: z.ZodNumber;
                    oldestLoadedAt: z.ZodNullable<z.ZodString>;
                    readsSpent: z.ZodNumber;
                    historyState: z.ZodEnum<{
                        complete: "complete";
                        none: "none";
                        partial: "partial";
                        unverified: "unverified";
                    }>;
                    historyProof: z.ZodNullable<z.ZodEnum<{
                        empty_page: "empty_page";
                    }>>;
                    anchorMessageRef: z.ZodNullable<z.ZodString>;
                    satisfiedAt: z.ZodNullable<z.ZodString>;
                    satisfiedBy: z.ZodNullable<z.ZodEnum<{
                        empty_page: "empty_page";
                        latest_n: "latest_n";
                        boundary: "boundary";
                        already_satisfied: "already_satisfied";
                    }>>;
                    estimate: z.ZodObject<{
                        readsMin: z.ZodNumber;
                        readsEstimate: z.ZodNullable<z.ZodNumber>;
                    }, z.core.$strict>;
                }, z.core.$strict>>;
                nextAfterOrdinal: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strict>;
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
    readonly syncHistoryRequestCancel: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Cancel a history request: its fans stop being read; loaded messages and chains stay";
        readonly params: z.ZodObject<{
            requestRef: z.ZodString;
        }, z.core.$strict>;
        readonly body: z.ZodObject<{
            reason: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>;
        readonly response: {
            readonly 200: z.ZodObject<{
                disposition: z.ZodEnum<{
                    cancelled: "cancelled";
                    already_cancelled: "already_cancelled";
                    already_done: "already_done";
                }>;
                request: z.ZodObject<{
                    ref: z.ZodString;
                    pageLabel: z.ZodNullable<z.ZodString>;
                    state: z.ZodEnum<{
                        cancelled: "cancelled";
                        open: "open";
                        done: "done";
                    }>;
                    depth: z.ZodObject<{
                        kind: z.ZodEnum<{
                            all: "all";
                            latest: "latest";
                            before_boundary: "before_boundary";
                        }>;
                        count: z.ZodOptional<z.ZodNumber>;
                        boundaryAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                        boundaryMessageRef: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                    }, z.core.$strict>;
                    requesterKind: z.ZodEnum<{
                        agent_key: "agent_key";
                        owner_session: "owner_session";
                        owner_cli: "owner_cli";
                        legacy_hydration_wrapper: "legacy_hydration_wrapper";
                        switch_migration: "switch_migration";
                    }>;
                    createdAt: z.ZodString;
                    doneAt: z.ZodNullable<z.ZodString>;
                    cancelledAt: z.ZodNullable<z.ZodString>;
                    counts: z.ZodObject<{
                        total: z.ZodNumber;
                        ready: z.ZodNumber;
                        queued: z.ZodNumber;
                        loading: z.ZodNumber;
                        blocked: z.ZodNumber;
                        refused: z.ZodNumber;
                        cancelled: z.ZodNumber;
                    }, z.core.$strict>;
                    reads: z.ZodObject<{
                        done: z.ZodNumber;
                        remainingMin: z.ZodNumber;
                        remainingEstimate: z.ZodNullable<z.ZodNumber>;
                    }, z.core.$strict>;
                    eta: z.ZodObject<{
                        lowerBoundSeconds: z.ZodNumber;
                        estimateSeconds: z.ZodNullable<z.ZodNumber>;
                        basis: z.ZodLiteral<"estimate">;
                        ratePerHour: z.ZodNumber;
                        sharePercent: z.ZodNumber;
                        limitedBy: z.ZodEnum<{
                            page: "page";
                            family: "family";
                            route: "route";
                        }>;
                        slowdown: z.ZodNullable<z.ZodObject<{
                            route: z.ZodString;
                            effectivePerMin: z.ZodNumber;
                            currentPerMin: z.ZodNumber;
                        }, z.core.$strict>>;
                        hold: z.ZodNullable<z.ZodObject<{
                            scope: z.ZodEnum<{
                                page: "page";
                                route: "route";
                            }>;
                            until: z.ZodNullable<z.ZodString>;
                        }, z.core.$strict>>;
                    }, z.core.$strict>;
                    queuePosition: z.ZodNullable<z.ZodNumber>;
                    waitingReason: z.ZodNullable<z.ZodEnum<{
                        running: "running";
                        paused: "paused";
                        quarantined: "quarantined";
                        not_due: "not_due";
                        pacer: "pacer";
                        class_share: "class_share";
                        page_hold: "page_hold";
                        route_budget: "route_budget";
                        route_hold: "route_hold";
                        resource_hold: "resource_hold";
                        subject_breaker: "subject_breaker";
                        blocked_by_vendor: "blocked_by_vendor";
                        dependency: "dependency";
                        ownership_unconfirmed: "ownership_unconfirmed";
                    }>>;
                    waitingUntil: z.ZodNullable<z.ZodString>;
                }, z.core.$strict>;
            }, z.core.$strict>;
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
};
export type SyncHistoryRequestCreateBody = z.infer<typeof syncHistoryRequestCreateBodySchema>;
export type SyncHistoryRequestCreateResponse = z.infer<typeof syncHistoryRequestCreateResponseSchema>;
export type SyncHistoryRequestGetQuery = z.infer<typeof syncHistoryRequestGetQuerySchema>;
export type SyncHistoryRequestGetResponse = z.infer<typeof syncHistoryRequestGetResponseSchema>;
export type SyncHistoryRequestCancelBody = z.infer<typeof syncHistoryRequestCancelBodySchema>;
export type SyncHistoryRequestCancelResponse = z.infer<typeof syncHistoryRequestCancelResponseSchema>;
export type SyncHistoryRequestsQuery = z.infer<typeof syncHistoryRequestsQuerySchema>;
export type SyncHistoryRequestsResponse = z.infer<typeof syncHistoryRequestsResponseSchema>;
export type SyncResourceFile = z.infer<typeof syncResourceFileEnum>;
export type SyncPagesResponse = z.infer<typeof syncPagesResponseSchema>;
export type SyncPageWorkQuery = z.infer<typeof syncPageWorkQuerySchema>;
export type SyncPageWorkResponse = z.infer<typeof syncPageWorkResponseSchema>;
export type SyncPageWorkGetResponse = z.infer<typeof syncPageWorkGetResponseSchema>;
export type SyncPageRefreshBody = z.infer<typeof syncPageRefreshBodySchema>;
export type SyncPageRefreshResponse = z.infer<typeof syncPageRefreshResponseSchema>;
