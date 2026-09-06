export declare const ofapiVendorRouteSchemas: {
    readonly ofapiVendorUsageRefresh: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Capture a free bounded vendor usage report and compare retained local accounting";
        readonly body: import("zod").ZodObject<{
            from: import("zod").ZodString;
            to: import("zod").ZodString;
            groupBy: import("zod").ZodDefault<import("zod").ZodEnum<{
                account: "account";
                day: "day";
                endpoint: "endpoint";
            }>>;
            accountId: import("zod").ZodDefault<import("zod").ZodNullable<import("zod").ZodString>>;
            includeToday: import("zod").ZodDefault<import("zod").ZodBoolean>;
        }, import("zod/v4/core").$strict>;
        readonly response: {
            readonly 400: import("zod").ZodObject<{
                error: import("zod").ZodString;
                message: import("zod").ZodString;
                statusCode: import("zod").ZodNumber;
            }, import("zod/v4/core").$strip>;
            readonly 401: import("zod").ZodObject<{
                error: import("zod").ZodString;
                message: import("zod").ZodString;
                statusCode: import("zod").ZodNumber;
            }, import("zod/v4/core").$strip>;
            readonly 403: import("zod").ZodObject<{
                error: import("zod").ZodString;
                message: import("zod").ZodString;
                statusCode: import("zod").ZodNumber;
            }, import("zod/v4/core").$strip>;
            readonly 409: import("zod").ZodObject<{
                error: import("zod").ZodString;
                message: import("zod").ZodString;
                statusCode: import("zod").ZodNumber;
            }, import("zod/v4/core").$strip>;
            readonly 503: import("zod").ZodObject<{
                error: import("zod").ZodString;
                message: import("zod").ZodString;
                statusCode: import("zod").ZodNumber;
            }, import("zod/v4/core").$strip>;
            readonly 200: import("zod").ZodObject<{
                snapshotId: import("zod").ZodNumber;
                observedAt: import("zod").ZodString;
                credentialFingerprint: import("zod").ZodString;
                visibility: import("zod").ZodEnum<{
                    unknown: "unknown";
                    declared_team: "declared_team";
                    declared_restricted: "declared_restricted";
                }>;
                accountId: import("zod").ZodNullable<import("zod").ZodString>;
                vendor: import("zod").ZodObject<{
                    from: import("zod").ZodString;
                    to: import("zod").ZodString;
                    groupBy: import("zod").ZodEnum<{
                        account: "account";
                        day: "day";
                        endpoint: "endpoint";
                    }>;
                    includesToday: import("zod").ZodBoolean;
                    totals: import("zod").ZodObject<{
                        credits: import("zod").ZodNumber;
                        requests: import("zod").ZodNumber;
                    }, import("zod/v4/core").$strip>;
                    results: import("zod").ZodArray<import("zod").ZodObject<{
                        day: import("zod").ZodNullable<import("zod").ZodString>;
                        accountId: import("zod").ZodNullable<import("zod").ZodString>;
                        endpoint: import("zod").ZodNullable<import("zod").ZodString>;
                        creditType: import("zod").ZodNullable<import("zod").ZodString>;
                        credits: import("zod").ZodNumber;
                        requests: import("zod").ZodNumber;
                    }, import("zod/v4/core").$strip>>;
                }, import("zod/v4/core").$strip>;
                local: import("zod").ZodObject<{
                    recordedCredits: import("zod").ZodNumber;
                    estimatedCredits: import("zod").ZodNumber;
                    externalResidualCredits: import("zod").ZodNumber;
                }, import("zod/v4/core").$strip>;
                difference: import("zod").ZodNumber;
                equivalentScope: import("zod").ZodBoolean;
                explanation: import("zod").ZodString;
            }, import("zod/v4/core").$strip>;
        };
    };
    readonly ofapiKeyScopeGet: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Read declared and observed server key readiness";
        readonly response: {
            readonly 400: import("zod").ZodObject<{
                error: import("zod").ZodString;
                message: import("zod").ZodString;
                statusCode: import("zod").ZodNumber;
            }, import("zod/v4/core").$strip>;
            readonly 401: import("zod").ZodObject<{
                error: import("zod").ZodString;
                message: import("zod").ZodString;
                statusCode: import("zod").ZodNumber;
            }, import("zod/v4/core").$strip>;
            readonly 403: import("zod").ZodObject<{
                error: import("zod").ZodString;
                message: import("zod").ZodString;
                statusCode: import("zod").ZodNumber;
            }, import("zod/v4/core").$strip>;
            readonly 409: import("zod").ZodObject<{
                error: import("zod").ZodString;
                message: import("zod").ZodString;
                statusCode: import("zod").ZodNumber;
            }, import("zod/v4/core").$strip>;
            readonly 503: import("zod").ZodObject<{
                error: import("zod").ZodString;
                message: import("zod").ZodString;
                statusCode: import("zod").ZodNumber;
            }, import("zod/v4/core").$strip>;
            readonly 200: import("zod").ZodObject<{
                credentialFingerprint: import("zod").ZodString;
                version: import("zod").ZodNumber;
                capabilities: import("zod").ZodNullable<import("zod").ZodArray<import("zod").ZodEnum<{
                    reads: "reads";
                    commands: "commands";
                    webhooks: "webhooks";
                    exports: "exports";
                    uploads: "uploads";
                    links: "links";
                }>>>;
                accountIds: import("zod").ZodNullable<import("zod").ZodArray<import("zod").ZodString>>;
                visibility: import("zod").ZodEnum<{
                    unknown: "unknown";
                    declared_team: "declared_team";
                    declared_restricted: "declared_restricted";
                }>;
                observedTeam: import("zod").ZodNullable<import("zod").ZodString>;
                preflightStatus: import("zod").ZodEnum<{
                    unknown: "unknown";
                    verified: "verified";
                    mismatch: "mismatch";
                    denied: "denied";
                }>;
                updatedAt: import("zod").ZodNullable<import("zod").ZodString>;
                source: import("zod").ZodLiteral<"owner_declaration_not_vendor_introspection">;
            }, import("zod/v4/core").$strip>;
        };
    };
    readonly ofapiKeyScopeApply: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Record versioned owner-declared restrictions of the current API key";
        readonly body: import("zod").ZodObject<{
            credentialFingerprint: import("zod").ZodString;
            expectedVersion: import("zod").ZodNumber;
            capabilities: import("zod").ZodNullable<import("zod").ZodArray<import("zod").ZodEnum<{
                reads: "reads";
                commands: "commands";
                webhooks: "webhooks";
                exports: "exports";
                uploads: "uploads";
                links: "links";
            }>>>;
            accountIds: import("zod").ZodNullable<import("zod").ZodArray<import("zod").ZodString>>;
            visibility: import("zod").ZodEnum<{
                unknown: "unknown";
                declared_team: "declared_team";
                declared_restricted: "declared_restricted";
            }>;
        }, import("zod/v4/core").$strict>;
        readonly response: {
            readonly 400: import("zod").ZodObject<{
                error: import("zod").ZodString;
                message: import("zod").ZodString;
                statusCode: import("zod").ZodNumber;
            }, import("zod/v4/core").$strip>;
            readonly 401: import("zod").ZodObject<{
                error: import("zod").ZodString;
                message: import("zod").ZodString;
                statusCode: import("zod").ZodNumber;
            }, import("zod/v4/core").$strip>;
            readonly 403: import("zod").ZodObject<{
                error: import("zod").ZodString;
                message: import("zod").ZodString;
                statusCode: import("zod").ZodNumber;
            }, import("zod/v4/core").$strip>;
            readonly 409: import("zod").ZodObject<{
                error: import("zod").ZodString;
                message: import("zod").ZodString;
                statusCode: import("zod").ZodNumber;
            }, import("zod/v4/core").$strip>;
            readonly 503: import("zod").ZodObject<{
                error: import("zod").ZodString;
                message: import("zod").ZodString;
                statusCode: import("zod").ZodNumber;
            }, import("zod/v4/core").$strip>;
            readonly 200: import("zod").ZodObject<{
                credentialFingerprint: import("zod").ZodString;
                version: import("zod").ZodNumber;
                capabilities: import("zod").ZodNullable<import("zod").ZodArray<import("zod").ZodEnum<{
                    reads: "reads";
                    commands: "commands";
                    webhooks: "webhooks";
                    exports: "exports";
                    uploads: "uploads";
                    links: "links";
                }>>>;
                accountIds: import("zod").ZodNullable<import("zod").ZodArray<import("zod").ZodString>>;
                visibility: import("zod").ZodEnum<{
                    unknown: "unknown";
                    declared_team: "declared_team";
                    declared_restricted: "declared_restricted";
                }>;
                observedTeam: import("zod").ZodNullable<import("zod").ZodString>;
                preflightStatus: import("zod").ZodEnum<{
                    unknown: "unknown";
                    verified: "verified";
                    mismatch: "mismatch";
                    denied: "denied";
                }>;
                updatedAt: import("zod").ZodNullable<import("zod").ZodString>;
                source: import("zod").ZodLiteral<"owner_declaration_not_vendor_introspection">;
            }, import("zod/v4/core").$strip>;
        };
    };
};
