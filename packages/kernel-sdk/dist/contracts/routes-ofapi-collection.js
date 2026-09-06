import { z } from "zod";
import { OFAPI_COLLECTION_CATEGORIES } from "../shared/index";
import { errorResponseSchema } from "./primitives";
export const ofapiCollectionCategorySchema = z.enum(OFAPI_COLLECTION_CATEGORIES);
export const ofapiCollectionSettingsSchema = z.object({
    pageId: z.number().int().positive().nullable(), category: ofapiCollectionCategorySchema,
    mode: z.enum(["off", "on_demand", "scheduled"]), intervalMinutes: z.number().int().min(15).max(43200),
    dailyCreditLimit: z.number().int().min(1).max(100000), maxCallsPerRun: z.number().int().min(1).max(1000),
    includeDetails: z.boolean(),
}).strict();
export const ofapiCollectionChangeSchema = z.object({
    expectedRevision: z.number().int().nonnegative(),
    changes: z.array(ofapiCollectionSettingsSchema).max(100), backgroundPaused: z.boolean().optional(),
}).strict();
export const ofapiCollectionJobSchema = z.object({
    pageId: z.number().int().positive(), category: ofapiCollectionCategorySchema,
    expectedRevision: z.number().int().nonnegative(),
    maxCredits: z.number().int().min(1).max(100000), maxCalls: z.number().int().min(1).max(1000),
    maxBytes: z.number().int().min(1).max(10737418240),
    from: z.iso.datetime().nullable(), to: z.iso.datetime().nullable(),
    selection: z.array(z.string().min(1).max(200)).max(100),
}).strict();
const policySchema = ofapiCollectionSettingsSchema.extend({
    revision: z.number().int(), source: z.enum(["page", "default", "legacy_baseline", "default_off"]),
    state: z.enum(["applied", "baseline"]), backgroundPaused: z.boolean(),
    usage: z.object({ callsToday: z.number(), reservedCreditsToday: z.number(), credits30d: z.number(), actualCreditsToday: z.number().nullable() }),
    lastCapturedAt: z.string().nullable(), inFlight: z.number(),
});
export const ofapiCollectionSnapshotSchema = z.object({
    revision: z.number().int(), backgroundPaused: z.boolean(),
    catalog: z.array(z.object({ id: ofapiCollectionCategorySchema, label: z.string(), modes: z.array(z.enum(["off", "on_demand", "scheduled"])), baseline: z.boolean(), consumers: z.array(z.string()), supportsOneOff: z.boolean(), priceUnit: z.enum(["calls_and_bytes", "physical_calls"]), prerequisites: z.array(z.string()), scope: z.literal("page"), legacyOperations: z.array(z.string()) })),
    pages: z.array(z.object({ id: z.number(), label: z.string(), accountId: z.string().nullable() })),
    policies: z.array(policySchema),
    jobs: z.array(z.object({ id: z.string(), pageId: z.number(), category: ofapiCollectionCategorySchema, state: z.string(), maxCredits: z.number(), maxCalls: z.number(), maxBytes: z.number(), usedCredits: z.number(), usedCalls: z.number(), usedBytes: z.number(), createdAt: z.string(), reason: z.string().nullable() })),
    audit: z.array(z.object({ revision: z.number(), actorUserId: z.number(), createdAt: z.string(), changes: z.unknown() })),
    limitDescription: z.string(),
});
export const ofapiCollectionPreviewSchema = z.object({
    revision: z.number(), changes: z.array(ofapiCollectionSettingsSchema), backgroundPaused: z.boolean(),
    cost: z.object({ source: z.literal("unknown"), estimatedCredits: z.null(), maximumNewCreditsPerDay: z.number() }),
    consequences: z.array(z.string()), inFlight: z.number(),
});
const errors = { 400: errorResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema, 409: errorResponseSchema };
export const ofapiCollectionRouteSchemas = {
    ofapiCollectionGet: { auth: { kind: "session" }, tags: ["ops"], summary: "Read effective OFAPI collection policy and retained usage", querystring: z.object({ pageId: z.coerce.number().int().positive().optional() }), response: { 200: ofapiCollectionSnapshotSchema, ...errors } },
    ofapiCollectionPreview: { auth: { kind: "owner-session" }, tags: ["ops"], summary: "Preview collection changes without vendor calls", body: ofapiCollectionChangeSchema, response: { 200: ofapiCollectionPreviewSchema, ...errors } },
    ofapiCollectionApply: { auth: { kind: "owner-session" }, tags: ["ops"], summary: "Apply versioned OFAPI collection policy", body: ofapiCollectionChangeSchema, response: { 200: z.object({ revision: z.number(), state: z.literal("applied") }), ...errors } },
    ofapiCollectionJobCreate: { auth: { kind: "owner-session" }, tags: ["ops"], summary: "Approve one bounded OFAPI collection job", body: ofapiCollectionJobSchema, response: { 200: z.object({ id: z.string(), state: z.literal("queued") }), ...errors } },
    ofapiCollectionJobResume: { auth: { kind: "owner-session" }, tags: ["ops"], summary: "Resume a bounded collection job from its retained checkpoint", params: z.object({ id: z.uuid() }), body: z.object({ expectedRevision: z.number().int().nonnegative() }).strict(), response: { 200: z.object({ id: z.string(), state: z.literal("queued"), revision: z.number() }), ...errors } },
};
