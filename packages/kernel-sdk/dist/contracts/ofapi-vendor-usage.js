import { z } from "zod";
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Invalid calendar date");
export const ofapiUsageWindowSchema = z.object({
    from: day, to: day, groupBy: z.enum(["day", "account", "endpoint"]).default("day"),
    accountId: z.string().regex(/^acct_[A-Za-z0-9_-]+$/).max(255).nullable().default(null),
    includeToday: z.boolean().default(false),
}).strict().superRefine((value, ctx) => {
    const days = (Date.parse(value.to) - Date.parse(value.from)) / 86_400_000;
    const today = new Date().toISOString().slice(0, 10);
    if (days < 0 || days >= 366 || value.to > today || (!value.includeToday && value.to === today)) {
        ctx.addIssue({ code: "custom", message: "Choose up to 366 days; today requires includeToday" });
    }
});
export const ofapiUsageResultSchema = z.object({
    from: day, to: day, groupBy: z.enum(["day", "account", "endpoint"]), includesToday: z.boolean(),
    totals: z.object({ credits: z.number().finite().nonnegative(), requests: z.number().int().nonnegative() }),
    results: z.array(z.object({
        day: day.nullable(), accountId: z.string().nullable(), endpoint: z.string().nullable(),
        creditType: z.string().nullable(), credits: z.number().finite().nonnegative(), requests: z.number().int().nonnegative(),
    })),
});
export const ofapiVendorUsageResponseSchema = z.object({
    snapshotId: z.number().int(), observedAt: z.string(), credentialFingerprint: z.string(),
    visibility: z.enum(["unknown", "declared_team", "declared_restricted"]), accountId: z.string().nullable(),
    vendor: ofapiUsageResultSchema,
    local: z.object({ recordedCredits: z.number(), estimatedCredits: z.number(), externalResidualCredits: z.number() }),
    difference: z.number(), equivalentScope: z.boolean(), explanation: z.string(),
});
export const ofapiCapabilitySchema = z.enum(["reads", "commands", "webhooks", "exports", "uploads", "links"]);
export const ofapiKeyScopeSchema = z.object({
    credentialFingerprint: z.string().regex(/^[a-f0-9]{64}$/), version: z.number().int().nonnegative(),
    capabilities: z.array(ofapiCapabilitySchema).nullable(), accountIds: z.array(z.string().regex(/^acct_[A-Za-z0-9_-]+$/)).nullable(),
    visibility: z.enum(["unknown", "declared_team", "declared_restricted"]),
    observedTeam: z.string().nullable(), preflightStatus: z.enum(["verified", "unknown", "mismatch", "denied"]),
    updatedAt: z.string().nullable(), source: z.literal("owner_declaration_not_vendor_introspection"),
});
export const ofapiKeyScopeApplySchema = z.object({
    credentialFingerprint: z.string().regex(/^[a-f0-9]{64}$/), expectedVersion: z.number().int().nonnegative(),
    capabilities: z.array(ofapiCapabilitySchema).max(6).nullable(),
    accountIds: z.array(z.string().regex(/^acct_[A-Za-z0-9_-]+$/)).max(100).nullable(),
    visibility: z.enum(["unknown", "declared_team", "declared_restricted"]),
}).strict().refine(value => value.visibility !== "declared_team" || value.accountIds === null, "A restricted account list cannot declare team-wide visibility");
