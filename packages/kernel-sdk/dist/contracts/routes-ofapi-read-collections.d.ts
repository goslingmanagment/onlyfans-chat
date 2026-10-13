import { z } from "zod";
export declare const ofapiReadCollectionsRouteSchemas: {
    readonly ofapiContentEventsGet: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["ops"];
        readonly summary: "Read retained queue progress and post-like evidence without vendor egress";
        readonly querystring: z.ZodObject<{
            pageId: z.ZodCoercedNumber<unknown>;
            limit: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                pageId: z.ZodNumber;
                source: z.ZodLiteral<"onlyfansapi">;
                coverage: z.ZodLiteral<"observed_events_only">;
                queues: z.ZodArray<z.ZodObject<{
                    queueId: z.ZodString;
                    phase: z.ZodEnum<{
                        updated: "updated";
                        finished: "finished";
                    }>;
                    queueDate: z.ZodNullable<z.ZodString>;
                    state: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                    observedAt: z.ZodString;
                    sourceEventId: z.ZodString;
                    sourceObservationId: z.ZodString;
                    timeBasis: z.ZodLiteral<"receipt">;
                }, z.core.$strip>>;
                likes: z.ZodArray<z.ZodObject<{
                    postRef: z.ZodString;
                    fanRef: z.ZodString;
                    state: z.ZodEnum<{
                        active: "active";
                        undone: "undone";
                    }>;
                    sourceAt: z.ZodString;
                    observedAt: z.ZodString;
                    sourceEventId: z.ZodString;
                    sourceObservationId: z.ZodString;
                    timeBasis: z.ZodLiteral<"provider">;
                }, z.core.$strip>>;
                unattributedLikes: z.ZodNumber;
                queuesHasMore: z.ZodBoolean;
                likesHasMore: z.ZodBoolean;
            }, z.core.$strip>;
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
        };
    };
    readonly ofapiReadCollectionsGet: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["ops"];
        readonly summary: "Read stored OFAPI CRM, content and monetary snapshots without vendor egress";
        readonly querystring: z.ZodObject<{
            pageId: z.ZodCoercedNumber<unknown>;
            operation: z.ZodOptional<z.ZodString>;
            limit: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
        }, z.core.$strip>;
        readonly response: {
            readonly 200: z.ZodObject<{
                pageId: z.ZodNumber;
                catalog: z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    operation: z.ZodString;
                    path: z.ZodString;
                    category: z.ZodString;
                    detail: z.ZodBoolean;
                    defaultCollect: z.ZodBoolean;
                    granularity: z.ZodString;
                    query: z.ZodRecord<z.ZodString, z.ZodString>;
                }, z.core.$strip>>;
                snapshots: z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    source: z.ZodLiteral<"onlyfansapi">;
                    operation: z.ZodString;
                    category: z.ZodString;
                    pathname: z.ZodString;
                    query: z.ZodRecord<z.ZodString, z.ZodString>;
                    window: z.ZodObject<{
                        from: z.ZodNullable<z.ZodString>;
                        to: z.ZodNullable<z.ZodString>;
                    }, z.core.$strip>;
                    observedAt: z.ZodString;
                    ageSeconds: z.ZodNumber;
                    observationId: z.ZodString;
                    granularity: z.ZodString;
                    coverage: z.ZodObject<{
                        state: z.ZodEnum<{
                            unknown: "unknown";
                            complete: "complete";
                            partial: "partial";
                        }>;
                        reason: z.ZodNullable<z.ZodString>;
                        indexComplete: z.ZodNullable<z.ZodBoolean>;
                        omitted: z.ZodNullable<z.ZodNumber>;
                        nextQuery: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodString>>;
                    }, z.core.$strip>;
                    items: z.ZodArray<z.ZodUnknown>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
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
        };
    };
};
