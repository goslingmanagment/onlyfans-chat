import { z } from "zod";
export declare const ofapiUsageWindowSchema: z.ZodObject<{
    from: z.ZodString;
    to: z.ZodString;
    groupBy: z.ZodDefault<z.ZodEnum<{
        account: "account";
        day: "day";
        endpoint: "endpoint";
    }>>;
    accountId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    includeToday: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>;
export type OfapiUsageWindow = z.infer<typeof ofapiUsageWindowSchema>;
export declare const ofapiUsageResultSchema: z.ZodObject<{
    from: z.ZodString;
    to: z.ZodString;
    groupBy: z.ZodEnum<{
        account: "account";
        day: "day";
        endpoint: "endpoint";
    }>;
    includesToday: z.ZodBoolean;
    totals: z.ZodObject<{
        credits: z.ZodNumber;
        requests: z.ZodNumber;
    }, z.core.$strip>;
    results: z.ZodArray<z.ZodObject<{
        day: z.ZodNullable<z.ZodString>;
        accountId: z.ZodNullable<z.ZodString>;
        endpoint: z.ZodNullable<z.ZodString>;
        creditType: z.ZodNullable<z.ZodString>;
        credits: z.ZodNumber;
        requests: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type OfapiUsageResult = z.infer<typeof ofapiUsageResultSchema>;
export declare const ofapiVendorUsageResponseSchema: z.ZodObject<{
    snapshotId: z.ZodNumber;
    observedAt: z.ZodString;
    credentialFingerprint: z.ZodString;
    visibility: z.ZodEnum<{
        unknown: "unknown";
        declared_team: "declared_team";
        declared_restricted: "declared_restricted";
    }>;
    accountId: z.ZodNullable<z.ZodString>;
    vendor: z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
        groupBy: z.ZodEnum<{
            account: "account";
            day: "day";
            endpoint: "endpoint";
        }>;
        includesToday: z.ZodBoolean;
        totals: z.ZodObject<{
            credits: z.ZodNumber;
            requests: z.ZodNumber;
        }, z.core.$strip>;
        results: z.ZodArray<z.ZodObject<{
            day: z.ZodNullable<z.ZodString>;
            accountId: z.ZodNullable<z.ZodString>;
            endpoint: z.ZodNullable<z.ZodString>;
            creditType: z.ZodNullable<z.ZodString>;
            credits: z.ZodNumber;
            requests: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    local: z.ZodObject<{
        recordedCredits: z.ZodNumber;
        estimatedCredits: z.ZodNumber;
        externalResidualCredits: z.ZodNumber;
    }, z.core.$strip>;
    difference: z.ZodNumber;
    equivalentScope: z.ZodBoolean;
    explanation: z.ZodString;
}, z.core.$strip>;
export declare const ofapiCapabilitySchema: z.ZodEnum<{
    reads: "reads";
    commands: "commands";
    webhooks: "webhooks";
    exports: "exports";
    uploads: "uploads";
    links: "links";
}>;
export type OfapiCapability = z.infer<typeof ofapiCapabilitySchema>;
export declare const ofapiKeyScopeSchema: z.ZodObject<{
    credentialFingerprint: z.ZodString;
    version: z.ZodNumber;
    capabilities: z.ZodNullable<z.ZodArray<z.ZodEnum<{
        reads: "reads";
        commands: "commands";
        webhooks: "webhooks";
        exports: "exports";
        uploads: "uploads";
        links: "links";
    }>>>;
    accountIds: z.ZodNullable<z.ZodArray<z.ZodString>>;
    visibility: z.ZodEnum<{
        unknown: "unknown";
        declared_team: "declared_team";
        declared_restricted: "declared_restricted";
    }>;
    observedTeam: z.ZodNullable<z.ZodString>;
    preflightStatus: z.ZodEnum<{
        unknown: "unknown";
        verified: "verified";
        mismatch: "mismatch";
        denied: "denied";
    }>;
    updatedAt: z.ZodNullable<z.ZodString>;
    source: z.ZodLiteral<"owner_declaration_not_vendor_introspection">;
}, z.core.$strip>;
export declare const ofapiKeyScopeApplySchema: z.ZodObject<{
    credentialFingerprint: z.ZodString;
    expectedVersion: z.ZodNumber;
    capabilities: z.ZodNullable<z.ZodArray<z.ZodEnum<{
        reads: "reads";
        commands: "commands";
        webhooks: "webhooks";
        exports: "exports";
        uploads: "uploads";
        links: "links";
    }>>>;
    accountIds: z.ZodNullable<z.ZodArray<z.ZodString>>;
    visibility: z.ZodEnum<{
        unknown: "unknown";
        declared_team: "declared_team";
        declared_restricted: "declared_restricted";
    }>;
}, z.core.$strict>;
export type OfapiKeyScopeApply = z.infer<typeof ofapiKeyScopeApplySchema>;
