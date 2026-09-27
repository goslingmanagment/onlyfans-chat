import { z } from "zod";
export declare const ofapiTypedExportCreateSchema: z.ZodObject<{
    pageId: z.ZodNumber;
    profile: z.ZodEnum<{
        tracking_links: "tracking_links";
        smart_links: "smart_links";
        profile_visitors: "profile_visitors";
        fans: "fans";
        trial_links: "trial_links";
    }>;
    startDate: z.ZodISODateTime;
    endDate: z.ZodISODateTime;
    maxRows: z.ZodDefault<z.ZodNumber>;
    maxCredits: z.ZodDefault<z.ZodNumber>;
    maxBytes: z.ZodDefault<z.ZodNumber>;
    expectedPolicyRevision: z.ZodNumber;
    fanType: z.ZodDefault<z.ZodEnum<{
        all: "all";
        active: "active";
        expired: "expired";
        latest: "latest";
    }>>;
    dryRun: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>;
export declare const ofapiTypedExportArtifactSchema: z.ZodObject<{
    expectedRowVersion: z.ZodNumber;
    expectedSha256: z.ZodOptional<z.ZodString>;
    csvBase64: z.ZodOptional<z.ZodString>;
    reason: z.ZodString;
}, z.core.$strict>;
export declare const ofapiProfileVisitorDaySchema: z.ZodObject<{
    date: z.ZodString;
    source: z.ZodEnum<{
        export: "export";
        rest: "rest";
        missing: "missing";
    }>;
    totalVisitors: z.ZodNullable<z.ZodNumber>;
    guestVisitors: z.ZodNullable<z.ZodNumber>;
    userVisitors: z.ZodNullable<z.ZodNumber>;
    subscriberVisitors: z.ZodNullable<z.ZodNumber>;
    avgViewDuration: z.ZodNullable<z.ZodString>;
    chartDuration: z.ZodNullable<z.ZodString>;
    durationUnit: z.ZodLiteral<"vendor_unspecified">;
    availability: z.ZodEnum<{
        complete: "complete";
        partial: "partial";
        unavailable: "unavailable";
        missing: "missing";
        ineligible: "ineligible";
    }>;
    observedAt: z.ZodNullable<z.ZodString>;
    observationId: z.ZodNullable<z.ZodNumber>;
}, z.core.$strip>;
export declare const ofapiExportRouteSchemas: {
    readonly ofapiExportInventoryGet: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["ops"];
        readonly summary: "Read the last captured provider export inventory without vendor access";
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
            readonly 503: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 200: z.ZodObject<{
                rows: z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    type: z.ZodString;
                    status: z.ZodString;
                    totalRows: z.ZodNullable<z.ZodNumber>;
                    deliveredRows: z.ZodNullable<z.ZodNumber>;
                    creditCost: z.ZodNullable<z.ZodNumber>;
                    accounts: z.ZodArray<z.ZodString>;
                }, z.core.$strip>>;
                currentPage: z.ZodNumber;
                lastPage: z.ZodNumber;
                observedAt: z.ZodNullable<z.ZodString>;
                observationId: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strip>;
        };
    };
    readonly ofapiExportInventoryRefresh: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["ops"];
        readonly summary: "Explicitly capture one bounded free provider export inventory page";
        readonly body: z.ZodObject<{
            page: z.ZodDefault<z.ZodNumber>;
            perPage: z.ZodDefault<z.ZodNumber>;
            type: z.ZodEnum<{
                tracking_links: "tracking_links";
                smart_links: "smart_links";
                profile_visitors: "profile_visitors";
                fans: "fans";
                trial_links: "trial_links";
            }>;
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
            readonly 503: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 200: z.ZodObject<{
                rows: z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    type: z.ZodString;
                    status: z.ZodString;
                    totalRows: z.ZodNullable<z.ZodNumber>;
                    deliveredRows: z.ZodNullable<z.ZodNumber>;
                    creditCost: z.ZodNullable<z.ZodNumber>;
                    accounts: z.ZodArray<z.ZodString>;
                }, z.core.$strip>>;
                currentPage: z.ZodNumber;
                lastPage: z.ZodNumber;
                observedAt: z.ZodNullable<z.ZodString>;
                observationId: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strip>;
        };
    };
    readonly ofapiTypedExportControl: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["ops"];
        readonly summary: "Preview or issue one bounded provider cancel or paid auto-start retry";
        readonly params: z.ZodObject<{
            jobId: z.ZodUUID;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{
            action: z.ZodEnum<{
                retry: "retry";
                cancel: "cancel";
            }>;
            expectedRowVersion: z.ZodNumber;
            expectedPolicyRevision: z.ZodNumber;
            approvedMaxCredits: z.ZodDefault<z.ZodNumber>;
            reason: z.ZodString;
            dryRun: z.ZodDefault<z.ZodBoolean>;
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
            readonly 503: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 200: z.ZodObject<{
                dryRun: z.ZodBoolean;
                action: z.ZodEnum<{
                    retry: "retry";
                    cancel: "cancel";
                }>;
                sourceJobId: z.ZodString;
                vendorExportId: z.ZodString;
                profile: z.ZodEnum<{
                    tracking_links: "tracking_links";
                    smart_links: "smart_links";
                    profile_visitors: "profile_visitors";
                    fans: "fans";
                    trial_links: "trial_links";
                }>;
                maximumCredits: z.ZodNumber;
                jobId: z.ZodNullable<z.ZodString>;
                rowVersion: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly ofapiTypedExportCreate: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["ops"];
        readonly summary: "Preview or create a bounded typed export quote with auto_start=false";
        readonly body: z.ZodObject<{
            pageId: z.ZodNumber;
            profile: z.ZodEnum<{
                tracking_links: "tracking_links";
                smart_links: "smart_links";
                profile_visitors: "profile_visitors";
                fans: "fans";
                trial_links: "trial_links";
            }>;
            startDate: z.ZodISODateTime;
            endDate: z.ZodISODateTime;
            maxRows: z.ZodDefault<z.ZodNumber>;
            maxCredits: z.ZodDefault<z.ZodNumber>;
            maxBytes: z.ZodDefault<z.ZodNumber>;
            expectedPolicyRevision: z.ZodNumber;
            fanType: z.ZodDefault<z.ZodEnum<{
                all: "all";
                active: "active";
                expired: "expired";
                latest: "latest";
            }>>;
            dryRun: z.ZodDefault<z.ZodBoolean>;
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
            readonly 503: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 200: z.ZodObject<{
                dryRun: z.ZodBoolean;
                jobId: z.ZodNullable<z.ZodString>;
                profile: z.ZodEnum<{
                    tracking_links: "tracking_links";
                    smart_links: "smart_links";
                    profile_visitors: "profile_visitors";
                    fans: "fans";
                    trial_links: "trial_links";
                }>;
                category: z.ZodString;
                maxRows: z.ZodNumber;
                maximumCredits: z.ZodNumber;
                estimatedCredits: z.ZodNullable<z.ZodNumber>;
                estimateSource: z.ZodEnum<{
                    unknown: "unknown";
                    documented_row_tariff: "documented_row_tariff";
                }>;
                state: z.ZodString;
            }, z.core.$strip>;
        };
    };
    readonly ofapiTypedExportList: {
        readonly auth: {
            readonly kind: "session";
        };
        readonly tags: readonly ["ops"];
        readonly summary: "Read local typed export jobs, import outcomes and credit evidence";
        readonly querystring: z.ZodObject<{
            pageId: z.ZodCoercedNumber<unknown>;
        }, z.core.$strip>;
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
            readonly 503: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 200: z.ZodObject<{
                jobs: z.ZodArray<z.ZodObject<{
                    jobId: z.ZodString;
                    pageId: z.ZodNumber;
                    profile: z.ZodEnum<{
                        tracking_links: "tracking_links";
                        smart_links: "smart_links";
                        profile_visitors: "profile_visitors";
                        fans: "fans";
                        trial_links: "trial_links";
                    }>;
                    state: z.ZodString;
                    rowVersion: z.ZodNumber;
                    reason: z.ZodNullable<z.ZodString>;
                    createdAt: z.ZodString;
                    vendorExportId: z.ZodNullable<z.ZodString>;
                    vendorStatus: z.ZodNullable<z.ZodString>;
                    totalRows: z.ZodNullable<z.ZodNumber>;
                    deliveredRows: z.ZodNullable<z.ZodNumber>;
                    creditCost: z.ZodNullable<z.ZodNumber>;
                    spentCredits: z.ZodNumber;
                    imported: z.ZodBoolean;
                    sha256: z.ZodNullable<z.ZodString>;
                    artifactBytes: z.ZodNullable<z.ZodNumber>;
                    collectionJobId: z.ZodString;
                    controlAction: z.ZodNullable<z.ZodEnum<{
                        retry: "retry";
                        cancel: "cancel";
                    }>>;
                    sourceJobId: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
        };
    };
    readonly ofapiTypedExportResume: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["ops"];
        readonly summary: "Resume admission-paused typed export with unchanged scope and allowances";
        readonly params: z.ZodObject<{
            jobId: z.ZodUUID;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{
            expectedRowVersion: z.ZodNumber;
            expectedPolicyRevision: z.ZodNumber;
            reason: z.ZodString;
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
            readonly 503: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 200: z.ZodObject<{
                jobId: z.ZodString;
                rowVersion: z.ZodNumber;
                state: z.ZodLiteral<"ready">;
            }, z.core.$strip>;
        };
    };
    readonly ofapiTypedExportApprove: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["ops"];
        readonly summary: "Approve one typed export start without changing chat pilot policy";
        readonly params: z.ZodObject<{
            jobId: z.ZodUUID;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{
            expectedRowVersion: z.ZodNumber;
            approvedMaxCredits: z.ZodNumber;
            reason: z.ZodString;
            dryRun: z.ZodDefault<z.ZodBoolean>;
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
            readonly 503: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 200: z.ZodObject<{
                dryRun: z.ZodBoolean;
                jobId: z.ZodString;
                state: z.ZodLiteral<"ready">;
                rowVersion: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
    readonly ofapiTypedExportArtifact: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["ops"];
        readonly summary: "Capture and verify a bounded completed export artifact before projection";
        readonly params: z.ZodObject<{
            jobId: z.ZodUUID;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{
            expectedRowVersion: z.ZodNumber;
            expectedSha256: z.ZodOptional<z.ZodString>;
            csvBase64: z.ZodOptional<z.ZodString>;
            reason: z.ZodString;
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
            readonly 503: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 200: z.ZodObject<{
                jobId: z.ZodString;
                sha256: z.ZodString;
                byteSize: z.ZodNumber;
                rowCount: z.ZodNumber;
                state: z.ZodLiteral<"imported">;
                duplicate: z.ZodBoolean;
            }, z.core.$strip>;
        };
    };
    readonly ofapiTypedExportRows: {
        readonly auth: {
            readonly kind: "session";
        };
        readonly tags: readonly ["ops"];
        readonly summary: "Read source-attributed typed export rows without starting hydration";
        readonly params: z.ZodObject<{
            jobId: z.ZodUUID;
        }, z.core.$strip>;
        readonly querystring: z.ZodObject<{
            offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
        }, z.core.$strip>;
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
            readonly 503: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 200: z.ZodObject<{
                pageId: z.ZodNumber;
                profile: z.ZodEnum<{
                    tracking_links: "tracking_links";
                    smart_links: "smart_links";
                    profile_visitors: "profile_visitors";
                    fans: "fans";
                    trial_links: "trial_links";
                }>;
                coverage: z.ZodLiteral<"item_presence">;
                rows: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodNullable<z.ZodString>>>;
            }, z.core.$strip>;
        };
    };
    readonly ofapiProfileVisitorsGet: {
        readonly auth: {
            readonly kind: "session";
        };
        readonly tags: readonly ["ops"];
        readonly summary: "Read daily profile visitors with missing days and explicit source";
        readonly querystring: z.ZodObject<{
            pageId: z.ZodCoercedNumber<unknown>;
            from: z.ZodISODate;
            to: z.ZodISODate;
            source: z.ZodDefault<z.ZodEnum<{
                export: "export";
                rest: "rest";
            }>>;
            visitorType: z.ZodDefault<z.ZodEnum<{
                users: "users";
                total: "total";
                guests: "guests";
            }>>;
        }, z.core.$strip>;
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
            readonly 503: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 200: z.ZodObject<{
                pageId: z.ZodNumber;
                days: z.ZodArray<z.ZodObject<{
                    date: z.ZodString;
                    source: z.ZodEnum<{
                        export: "export";
                        rest: "rest";
                        missing: "missing";
                    }>;
                    totalVisitors: z.ZodNullable<z.ZodNumber>;
                    guestVisitors: z.ZodNullable<z.ZodNumber>;
                    userVisitors: z.ZodNullable<z.ZodNumber>;
                    subscriberVisitors: z.ZodNullable<z.ZodNumber>;
                    avgViewDuration: z.ZodNullable<z.ZodString>;
                    chartDuration: z.ZodNullable<z.ZodString>;
                    durationUnit: z.ZodLiteral<"vendor_unspecified">;
                    availability: z.ZodEnum<{
                        complete: "complete";
                        partial: "partial";
                        unavailable: "unavailable";
                        missing: "missing";
                        ineligible: "ineligible";
                    }>;
                    observedAt: z.ZodNullable<z.ZodString>;
                    observationId: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strip>>;
                note: z.ZodString;
            }, z.core.$strip>;
        };
    };
};
