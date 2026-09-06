import { z } from "zod";
import { OFAPI_TYPED_EXPORT_PROFILES } from "../shared/index";
import { errorResponseSchema } from "./primitives";
const profile = z.enum(OFAPI_TYPED_EXPORT_PROFILES);
const errors = { 400: errorResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema, 503: errorResponseSchema };
export const ofapiTypedExportCreateSchema = z.object({
    pageId: z.number().int().positive(), profile, startDate: z.iso.datetime(), endDate: z.iso.datetime(),
    maxRows: z.number().int().min(1).max(1000).default(1000), maxCredits: z.number().int().min(2).max(50).default(10),
    maxBytes: z.number().int().min(1024).max(16 * 1024 * 1024).default(4 * 1024 * 1024),
    expectedPolicyRevision: z.number().int().nonnegative(), fanType: z.enum(["all", "active", "expired", "latest"]).default("all"),
    dryRun: z.boolean().default(true),
}).strict();
export const ofapiTypedExportArtifactSchema = z.object({
    expectedRowVersion: z.number().int().nonnegative(), expectedSha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    csvBase64: z.string().max(23_000_000).optional(), reason: z.string().min(1).max(500),
}).strict();
const params = z.object({ jobId: z.uuid() });
const inventory = z.object({ rows: z.array(z.object({ id: z.string(), type: z.string(), status: z.string(), totalRows: z.number().nullable(), deliveredRows: z.number().nullable(), creditCost: z.number().nullable(), accounts: z.array(z.string()) })), currentPage: z.number(), lastPage: z.number(), observedAt: z.string().nullable(), observationId: z.number().nullable() });
const receipt = z.object({ jobId: z.string(), pageId: z.number(), profile, state: z.string(), rowVersion: z.number(), reason: z.string().nullable(),
    createdAt: z.string(), vendorExportId: z.string().nullable(), vendorStatus: z.string().nullable(), totalRows: z.number().nullable(), deliveredRows: z.number().nullable(),
    creditCost: z.number().nullable(), spentCredits: z.number(), imported: z.boolean(), sha256: z.string().nullable(), artifactBytes: z.number().nullable(), collectionJobId: z.string(), controlAction: z.enum(["cancel", "retry"]).nullable(), sourceJobId: z.string().nullable() });
export const ofapiProfileVisitorDaySchema = z.object({ date: z.string(), source: z.enum(["export", "rest", "missing"]),
    totalVisitors: z.number().nullable(), guestVisitors: z.number().nullable(), userVisitors: z.number().nullable(), subscriberVisitors: z.number().nullable(),
    avgViewDuration: z.string().nullable(), chartDuration: z.string().nullable(), durationUnit: z.literal("vendor_unspecified"),
    availability: z.enum(["complete", "partial", "missing", "unavailable", "ineligible"]), observedAt: z.string().nullable(), observationId: z.number().nullable() });
export const ofapiExportRouteSchemas = {
    ofapiExportInventoryGet: { auth: { kind: "owner-session" }, tags: ["ops"], summary: "Read the last captured provider export inventory without vendor access", response: { 200: inventory, ...errors } },
    ofapiExportInventoryRefresh: { auth: { kind: "owner-session" }, tags: ["ops"], summary: "Explicitly capture one bounded free provider export inventory page", body: z.object({ page: z.number().int().min(1).max(1000).default(1), perPage: z.number().int().min(1).max(100).default(25), type: profile }).strict(), response: { 200: inventory, ...errors } },
    ofapiTypedExportControl: { auth: { kind: "owner-session" }, tags: ["ops"], summary: "Preview or issue one bounded provider cancel or paid auto-start retry", params, body: z.object({ action: z.enum(["cancel", "retry"]), expectedRowVersion: z.number().int().nonnegative(), expectedPolicyRevision: z.number().int().nonnegative(), approvedMaxCredits: z.number().int().min(1).max(50).default(1), reason: z.string().min(1).max(500), dryRun: z.boolean().default(true) }).strict(), response: { 200: z.object({ dryRun: z.boolean(), action: z.enum(["cancel", "retry"]), sourceJobId: z.string(), vendorExportId: z.string(), profile, maximumCredits: z.number(), jobId: z.string().nullable(), rowVersion: z.number() }), ...errors } },
    ofapiTypedExportCreate: { auth: { kind: "owner-session" }, tags: ["ops"], summary: "Preview or create a bounded typed export quote with auto_start=false", body: ofapiTypedExportCreateSchema,
        response: { 200: z.object({ dryRun: z.boolean(), jobId: z.string().nullable(), profile, category: z.string(), maxRows: z.number(), maximumCredits: z.number(), estimatedCredits: z.number().nullable(), estimateSource: z.enum(["documented_row_tariff", "unknown"]), state: z.string() }), ...errors } },
    ofapiTypedExportList: { auth: { kind: "session" }, tags: ["ops"], summary: "Read local typed export jobs, import outcomes and credit evidence", querystring: z.object({ pageId: z.coerce.number().int().positive() }), response: { 200: z.object({ jobs: z.array(receipt) }), ...errors } },
    ofapiTypedExportResume: { auth: { kind: "owner-session" }, tags: ["ops"], summary: "Resume admission-paused typed export with unchanged scope and allowances", params, body: z.object({ expectedRowVersion: z.number().int().nonnegative(), expectedPolicyRevision: z.number().int().nonnegative(), reason: z.string().min(1).max(500) }).strict(), response: { 200: z.object({ jobId: z.string(), rowVersion: z.number().int().nonnegative(), state: z.literal("ready") }), ...errors } },
    ofapiTypedExportApprove: { auth: { kind: "owner-session" }, tags: ["ops"], summary: "Approve one typed export start without changing chat pilot policy", params, body: z.object({ expectedRowVersion: z.number().int().nonnegative(), approvedMaxCredits: z.number().int().min(1).max(50), reason: z.string().min(1).max(500), dryRun: z.boolean().default(true) }).strict(), response: { 200: z.object({ dryRun: z.boolean(), jobId: z.string(), state: z.literal("ready"), rowVersion: z.number() }), ...errors } },
    ofapiTypedExportArtifact: { auth: { kind: "owner-session" }, tags: ["ops"], summary: "Capture and verify a bounded completed export artifact before projection", params, body: ofapiTypedExportArtifactSchema,
        response: { 200: z.object({ jobId: z.string(), sha256: z.string(), byteSize: z.number(), rowCount: z.number(), state: z.literal("imported"), duplicate: z.boolean() }), ...errors } },
    ofapiTypedExportRows: { auth: { kind: "session" }, tags: ["ops"], summary: "Read source-attributed typed export rows without starting hydration", params, querystring: z.object({ offset: z.coerce.number().int().min(0).max(1000).default(0), limit: z.coerce.number().int().min(1).max(100).default(100) }), response: { 200: z.object({ pageId: z.number(), profile, coverage: z.literal("item_presence"), rows: z.array(z.record(z.string(), z.string().nullable())) }), ...errors } },
    ofapiProfileVisitorsGet: { auth: { kind: "session" }, tags: ["ops"], summary: "Read daily profile visitors with missing days and explicit source", querystring: z.object({ pageId: z.coerce.number().int().positive(), from: z.iso.date(), to: z.iso.date(), source: z.enum(["export", "rest"]).default("export"), visitorType: z.enum(["total", "users", "guests"]).default("total") }), response: { 200: z.object({ pageId: z.number(), days: z.array(ofapiProfileVisitorDaySchema), note: z.string() }), ...errors } },
};
