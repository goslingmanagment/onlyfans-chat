import { z } from "zod";
import { OFAPI_COLLECTION_CATEGORIES, OFAPI_COLLECTION_JOB_STATE_FILTERS } from "../shared/index";
import { errorResponseSchema, isoDateTime } from "./primitives";
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
    from: isoDateTime().nullable(), to: isoDateTime().nullable(),
    selection: z.array(z.string().min(1).max(200)).max(100),
}).strict();
/** Which of a run's own ceilings ended it (admission says only `job_limit`). */
export const ofapiCollectionExhaustedCapSchema = z.enum(["calls", "credits", "bytes"]);
/** One scheduled (background) run of a page and category. */
export const ofapiCollectionRunSummarySchema = z.object({
    id: z.string(), state: z.string(), reason: z.string().nullable(),
    /** The limit that ended the run (`job_limit` = the run's own ceilings, `daily_limit`, `interval_limit`), parsed from `reason`. */
    exhaustedLimit: z.string().nullable(),
    /** For `job_limit`: the one ceiling of the run that is spent; null when its counters do not single one out. */
    exhaustedCap: ofapiCollectionExhaustedCapSchema.nullable(),
    usedCalls: z.number(), maxCalls: z.number(), usedCredits: z.number(), maxCredits: z.number(), usedBytes: z.number(), maxBytes: z.number(),
    /** Steps of the run's frozen plan read to the end, and the plan's length; null before the plan was frozen. */
    stepsDone: z.number().nullable(), stepsTotal: z.number().nullable(),
    createdAt: z.string(), updatedAt: z.string(),
});
/** Traffic plan §2.8 п. 3: a scheduled category is stale when none of its runs
 * completed for more than two intervals (counted from the later of its last
 * completed run and the policy's last change). */
export const ofapiCollectionScheduleHealthSchema = z.object({
    /** The policy promises completed runs: scheduled, a read category with planned reads, background not paused. */
    expected: z.boolean(),
    stale: z.boolean(),
    /** When it is, or will be, stale unless a scheduled run completes first. */
    staleAt: z.string().nullable(),
    lastCompletedAt: z.string().nullable(),
    lastRun: ofapiCollectionRunSummarySchema.nullable(),
});
const policySchema = ofapiCollectionSettingsSchema.extend({
    revision: z.number().int(), source: z.enum(["page", "default", "legacy_baseline", "default_off"]),
    state: z.enum(["applied", "baseline"]), backgroundPaused: z.boolean(),
    usage: z.object({ callsToday: z.number(), reservedCreditsToday: z.number(), credits30d: z.number(), actualCreditsToday: z.number().nullable() }),
    lastCapturedAt: z.string().nullable(), inFlight: z.number(),
    scheduleHealth: ofapiCollectionScheduleHealthSchema,
});
/** Job list filter: `unfinished` = queued, running or paused. */
export const ofapiCollectionJobStateFilterSchema = z.enum(OFAPI_COLLECTION_JOB_STATE_FILTERS);
export const ofapiCollectionSnapshotSchema = z.object({
    revision: z.number().int(), backgroundPaused: z.boolean(),
    catalog: z.array(z.object({ id: ofapiCollectionCategorySchema, label: z.string(), modes: z.array(z.enum(["off", "on_demand", "scheduled"])), baseline: z.boolean(), consumers: z.array(z.string()), supportsOneOff: z.boolean(), priceUnit: z.enum(["calls_and_bytes", "physical_calls"]), prerequisites: z.array(z.string()), scope: z.literal("page"), legacyOperations: z.array(z.string()),
        /** A periodic read category whose schedule has nothing to read (Smart Links and the stored link lists since their freeze, traffic plan §2.9): no scheduled run is created and it is never stale; reads are explicit one-off jobs with a selection. Its policy may still admit another background lane — the paid fan sweep runs under `tracking_links`. */
        noScheduledReads: z.boolean() })),
    pages: z.array(z.object({ id: z.number(), label: z.string(), accountId: z.string().nullable() })),
    policies: z.array(policySchema),
    jobs: z.array(z.object({ id: z.string(), pageId: z.number(), category: ofapiCollectionCategorySchema, state: z.string(), maxCredits: z.number(), maxCalls: z.number(), maxBytes: z.number(), usedCredits: z.number(), usedCalls: z.number(), usedBytes: z.number(), createdAt: z.string(), reason: z.string().nullable(), canFinishIncomplete: z.boolean(), exhaustedCap: ofapiCollectionExhaustedCapSchema.nullable(), stepsDone: z.number().nullable(), stepsTotal: z.number().nullable() })),
    /** Jobs matching the page scope and `jobState`; the list holds at most 100 unless the filter is an unfinished state. */
    jobsTotal: z.number().int(),
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
    ofapiCollectionGet: { auth: { kind: "session" }, tags: ["ops"], summary: "Read effective OFAPI collection policy and retained usage", description: "Jobs list paused runs first, then newest, at most 100; `jobState` narrows the list (`unfinished` = queued, running or paused) and an unfinished-state filter returns every match. `jobsTotal` counts all matches.", querystring: z.object({ pageId: z.coerce.number().int().positive().optional(), jobState: ofapiCollectionJobStateFilterSchema.optional() }), response: { 200: ofapiCollectionSnapshotSchema, ...errors } },
    ofapiCollectionPreview: { auth: { kind: "owner-session" }, tags: ["ops"], summary: "Preview collection changes without vendor calls", body: ofapiCollectionChangeSchema, response: { 200: ofapiCollectionPreviewSchema, ...errors } },
    ofapiCollectionApply: { auth: { kind: "owner-session" }, tags: ["ops"], summary: "Apply versioned OFAPI collection policy", body: ofapiCollectionChangeSchema, response: { 200: z.object({ revision: z.number(), state: z.literal("applied") }), ...errors } },
    ofapiCollectionJobCreate: { auth: { kind: "owner-session" }, tags: ["ops"], summary: "Approve one bounded OFAPI collection job", body: ofapiCollectionJobSchema, response: { 200: z.object({ id: z.string(), state: z.literal("queued") }), ...errors } },
    ofapiCollectionJobResume: { auth: { kind: "owner-session" }, tags: ["ops"], summary: "Resume a bounded collection job from its retained checkpoint", params: z.object({ id: z.uuid() }), body: z.object({ expectedRevision: z.number().int().nonnegative() }).strict(), response: { 200: z.object({ id: z.string(), state: z.literal("queued"), revision: z.number() }), ...errors } },
    ofapiCollectionJobFinishIncomplete: { auth: { kind: "owner-session" }, tags: ["ops"], summary: "Finish a paused scheduled read without changing its retained facts, charges or next schedule", params: z.object({ id: z.uuid() }), body: z.object({ pageId: z.number().int().positive(), expectedRevision: z.number().int().nonnegative(), expectedState: z.literal("paused"), reason: z.string().trim().min(1).max(500) }).strict(), response: { 200: z.object({ id: z.string(), state: z.literal("failed"), revision: z.number() }), ...errors } },
};
