import { z } from "zod";
export declare const ofapiMediaSourceSchema: z.ZodObject<{
    pageId: z.ZodNumber;
    filename: z.ZodString;
    expectedSha256: z.ZodString;
    fileBase64: z.ZodString;
}, z.core.$strict>;
export declare const ofapiMediaUploadSchema: z.ZodObject<{
    pageId: z.ZodNumber;
    sourceId: z.ZodUUID;
    destination: z.ZodEnum<{
        vault: "vault";
        cdn: "cdn";
    }>;
    requestId: z.ZodUUID;
    expectedPolicyRevision: z.ZodNumber;
    maxCredits: z.ZodNumber;
    dryRun: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>;
export declare const ofapiMediaRouteSchemas: {
    readonly ofapiMediaUploadResume: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["ops"];
        readonly summary: "Resume an admission-paused upload without new allowance or repeating uncertain dispatch";
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
            readonly 503: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 200: z.ZodObject<{
                jobId: z.ZodString;
                rowVersion: z.ZodNumber;
                state: z.ZodLiteral<"ready">;
            }, z.core.$strip>;
        };
    };
    readonly ofapiMediaHandoff: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["ops"];
        readonly summary: "Explicit owner handoff of verified reusable vault or unreserved one-use CDN material";
        readonly body: z.ZodObject<{
            pageId: z.ZodNumber;
            jobId: z.ZodOptional<z.ZodUUID>;
            mediaRef: z.ZodOptional<z.ZodString>;
            expectedRowVersion: z.ZodOptional<z.ZodNumber>;
            expectedObservationId: z.ZodOptional<z.ZodNumber>;
            reason: z.ZodString;
        }, z.core.$strict>;
        readonly response: {
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
            readonly 503: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 200: z.ZodObject<{
                materialId: z.ZodString;
                materialKind: z.ZodEnum<{
                    vault: "vault";
                    cdn: "cdn";
                }>;
                isReady: z.ZodNullable<z.ZodBoolean>;
                note: z.ZodString;
            }, z.core.$strip>;
        };
    };
    readonly ofapiMediaGet: {
        readonly auth: {
            readonly kind: "session";
        };
        readonly tags: readonly ["ops"];
        readonly summary: "Read local OFAPI sources, uploads and vault metadata without paid hydration";
        readonly querystring: z.ZodObject<{
            pageId: z.ZodCoercedNumber<unknown>;
            offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
            limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
        }, z.core.$strip>;
        readonly response: {
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
            readonly 503: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 200: z.ZodObject<{
                pageId: z.ZodNumber;
                sources: z.ZodArray<z.ZodObject<{
                    id: z.ZodUUID;
                    pageId: z.ZodNumber;
                    filename: z.ZodString;
                    mimeType: z.ZodString;
                    bytes: z.ZodNumber;
                    sha256: z.ZodString;
                }, z.core.$strip>>;
                uploads: z.ZodArray<z.ZodObject<{
                    id: z.ZodUUID;
                    sourceId: z.ZodUUID;
                    destination: z.ZodEnum<{
                        vault: "vault";
                        cdn: "cdn";
                    }>;
                    state: z.ZodString;
                    rowVersion: z.ZodNumber;
                    reason: z.ZodNullable<z.ZodString>;
                    uploadId: z.ZodNullable<z.ZodString>;
                    mediaRef: z.ZodNullable<z.ZodString>;
                    uploadStatus: z.ZodNullable<z.ZodString>;
                    isReady: z.ZodNullable<z.ZodBoolean>;
                    spentCredits: z.ZodNumber;
                    actualCredits: z.ZodNullable<z.ZodNumber>;
                    collectionJobId: z.ZodString;
                    createdAt: z.ZodString;
                }, z.core.$strip>>;
                media: z.ZodArray<z.ZodObject<{
                    mediaRef: z.ZodString;
                    materialKind: z.ZodEnum<{
                        vault: "vault";
                        cdn: "cdn";
                    }>;
                    uploadJobId: z.ZodNullable<z.ZodString>;
                    sourceId: z.ZodNullable<z.ZodString>;
                    isReady: z.ZodNullable<z.ZodBoolean>;
                    uploadStatus: z.ZodNullable<z.ZodString>;
                    providerType: z.ZodNullable<z.ZodString>;
                    hasError: z.ZodNullable<z.ZodBoolean>;
                    canView: z.ZodNullable<z.ZodBoolean>;
                    filename: z.ZodNullable<z.ZodString>;
                    bytes: z.ZodNullable<z.ZodNumber>;
                    duration: z.ZodNullable<z.ZodNumber>;
                    width: z.ZodNullable<z.ZodNumber>;
                    height: z.ZodNullable<z.ZodNumber>;
                    releaseForms: z.ZodArray<z.ZodObject<{
                        id: z.ZodString;
                        name: z.ZodNullable<z.ZodString>;
                        status: z.ZodNullable<z.ZodString>;
                    }, z.core.$strip>>;
                    observedAt: z.ZodString;
                    observationId: z.ZodNumber;
                }, z.core.$strip>>;
                totalMedia: z.ZodNumber;
                inventory: z.ZodObject<{
                    state: z.ZodEnum<{
                        complete: "complete";
                        never: "never";
                        partial: "partial";
                    }>;
                    completedAt: z.ZodNullable<z.ZodString>;
                    jobId: z.ZodNullable<z.ZodString>;
                    note: z.ZodString;
                }, z.core.$strip>;
            }, z.core.$strip>;
        };
    };
    readonly ofapiMediaSourceCreate: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["ops"];
        readonly summary: "Capture an owned file and verify immutable page custody, SHA256, MIME and byte bounds";
        readonly body: z.ZodObject<{
            pageId: z.ZodNumber;
            filename: z.ZodString;
            expectedSha256: z.ZodString;
            fileBase64: z.ZodString;
        }, z.core.$strict>;
        readonly response: {
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
            readonly 503: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 200: z.ZodObject<{
                id: z.ZodUUID;
                pageId: z.ZodNumber;
                filename: z.ZodString;
                mimeType: z.ZodString;
                bytes: z.ZodNumber;
                sha256: z.ZodString;
            }, z.core.$strip>;
        };
    };
    readonly ofapiMediaUploadCreate: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["ops"];
        readonly summary: "Preview or approve one bounded asynchronous upload to vault or one-use CDN material";
        readonly body: z.ZodObject<{
            pageId: z.ZodNumber;
            sourceId: z.ZodUUID;
            destination: z.ZodEnum<{
                vault: "vault";
                cdn: "cdn";
            }>;
            requestId: z.ZodUUID;
            expectedPolicyRevision: z.ZodNumber;
            maxCredits: z.ZodNumber;
            dryRun: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>;
        readonly response: {
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
            readonly 503: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
                statusUrl: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 200: z.ZodObject<{
                dryRun: z.ZodBoolean;
                jobId: z.ZodNullable<z.ZodString>;
                sourceId: z.ZodString;
                sha256: z.ZodString;
                bytes: z.ZodNumber;
                destination: z.ZodEnum<{
                    vault: "vault";
                    cdn: "cdn";
                }>;
                estimatedCredits: z.ZodNumber;
                maxCredits: z.ZodNumber;
                state: z.ZodString;
            }, z.core.$strip>;
        };
    };
};
