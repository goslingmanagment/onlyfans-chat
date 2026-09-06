import { z } from "zod";
import { errorResponseSchema } from "./primitives";
const errors = {
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
    404: errorResponseSchema,
    409: errorResponseSchema,
    503: errorResponseSchema,
};
export const ofapiMediaSourceSchema = z
    .object({
    pageId: z.number().int().positive(),
    filename: z.string().min(1).max(200),
    expectedSha256: z.string().regex(/^[0-9a-f]{64}$/),
    fileBase64: z.string().max(133333336),
})
    .strict();
const source = z.object({
    id: z.uuid(),
    pageId: z.number(),
    filename: z.string(),
    mimeType: z.string(),
    bytes: z.number(),
    sha256: z.string(),
});
export const ofapiMediaUploadSchema = z
    .object({
    pageId: z.number().int().positive(),
    sourceId: z.uuid(),
    destination: z.enum(["vault", "cdn"]),
    requestId: z.uuid(),
    expectedPolicyRevision: z.number().int().nonnegative(),
    maxCredits: z.number().int().min(1).max(300),
    dryRun: z.boolean().default(true),
})
    .strict();
const upload = z.object({
    id: z.uuid(),
    sourceId: z.uuid(),
    destination: z.enum(["vault", "cdn"]),
    state: z.string(),
    rowVersion: z.number(),
    reason: z.string().nullable(),
    uploadId: z.string().nullable(),
    mediaRef: z.string().nullable(),
    uploadStatus: z.string().nullable(),
    isReady: z.boolean().nullable(),
    spentCredits: z.number(),
    actualCredits: z.number().nullable(),
    collectionJobId: z.string(),
    createdAt: z.string(),
});
const media = z.object({
    mediaRef: z.string(),
    materialKind: z.enum(["vault", "cdn"]),
    uploadJobId: z.string().nullable(),
    sourceId: z.string().nullable(),
    isReady: z.boolean().nullable(),
    uploadStatus: z.string().nullable(),
    providerType: z.string().nullable(),
    hasError: z.boolean().nullable(),
    canView: z.boolean().nullable(),
    filename: z.string().nullable(),
    bytes: z.number().nullable(),
    duration: z.number().nullable(),
    width: z.number().nullable(),
    height: z.number().nullable(),
    releaseForms: z.array(z.object({
        id: z.string(),
        name: z.string().nullable(),
        status: z.string().nullable(),
    })),
    observedAt: z.string(),
    observationId: z.number(),
});
export const ofapiMediaRouteSchemas = {
    ofapiMediaUploadResume: {
        auth: { kind: "owner-session" },
        tags: ["ops"],
        summary: "Resume an admission-paused upload without new allowance or repeating uncertain dispatch",
        params: z.object({ jobId: z.uuid() }),
        body: z
            .object({
            expectedRowVersion: z.number().int().nonnegative(),
            expectedPolicyRevision: z.number().int().nonnegative(),
            reason: z.string().min(1).max(500),
        })
            .strict(),
        response: {
            200: z.object({
                jobId: z.string(),
                rowVersion: z.number(),
                state: z.literal("ready"),
            }),
            ...errors,
        },
    },
    ofapiMediaHandoff: {
        auth: { kind: "owner-session" },
        tags: ["ops"],
        summary: "Explicit owner handoff of verified reusable vault or unreserved one-use CDN material",
        body: z
            .object({
            pageId: z.number().int().positive(),
            jobId: z.uuid().optional(),
            mediaRef: z.string().regex(/^\d+$/).optional(),
            expectedRowVersion: z.number().int().nonnegative().optional(),
            expectedObservationId: z.number().int().positive().optional(),
            reason: z.string().min(1).max(500),
        })
            .strict()
            .refine((value) => Boolean(value.jobId) !== Boolean(value.mediaRef), "Choose one material source"),
        response: {
            200: z.object({
                materialId: z.string(),
                materialKind: z.enum(["vault", "cdn"]),
                isReady: z.boolean().nullable(),
                note: z.string(),
            }),
            ...errors,
        },
    },
    ofapiMediaGet: {
        auth: { kind: "session" },
        tags: ["ops"],
        summary: "Read local OFAPI sources, uploads and vault metadata without paid hydration",
        querystring: z.object({
            pageId: z.coerce.number().int().positive(),
            offset: z.coerce.number().int().min(0).max(100000).default(0),
            limit: z.coerce.number().int().min(1).max(100).default(50),
        }),
        response: {
            200: z.object({
                pageId: z.number(),
                sources: z.array(source),
                uploads: z.array(upload),
                media: z.array(media),
                totalMedia: z.number(),
                inventory: z.object({
                    state: z.enum(["never", "partial", "complete"]),
                    completedAt: z.string().nullable(),
                    jobId: z.string().nullable(),
                    note: z.string(),
                }),
            }),
            ...errors,
        },
    },
    ofapiMediaSourceCreate: {
        auth: { kind: "owner-session" },
        tags: ["ops"],
        summary: "Capture an owned file and verify immutable page custody, SHA256, MIME and byte bounds",
        body: ofapiMediaSourceSchema,
        response: { 200: source, ...errors },
    },
    ofapiMediaUploadCreate: {
        auth: { kind: "owner-session" },
        tags: ["ops"],
        summary: "Preview or approve one bounded asynchronous upload to vault or one-use CDN material",
        body: ofapiMediaUploadSchema,
        response: {
            200: z.object({
                dryRun: z.boolean(),
                jobId: z.string().nullable(),
                sourceId: z.string(),
                sha256: z.string(),
                bytes: z.number(),
                destination: z.enum(["vault", "cdn"]),
                estimatedCredits: z.number(),
                maxCredits: z.number(),
                state: z.string(),
            }),
            ...errors,
        },
    },
};
