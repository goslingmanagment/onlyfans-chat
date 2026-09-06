import { z } from "zod";
import { errorResponseSchema } from "./primitives";
export const ofapiReadCollectionsRouteSchemas = {
    ofapiContentEventsGet: {
        auth: { kind: "owner-session" }, tags: ["ops"], summary: "Read retained queue progress and post-like evidence without vendor egress",
        querystring: z.object({ pageId: z.coerce.number().int().positive(), limit: z.coerce.number().int().min(1).max(100).optional() }),
        response: { 200: z.object({ pageId: z.number(), source: z.literal("onlyfansapi"), coverage: z.literal("observed_events_only"),
                queues: z.array(z.object({ queueId: z.string(), phase: z.enum(["updated", "finished"]), queueDate: z.string().nullable(), state: z.record(z.string(), z.unknown()), observedAt: z.string(), sourceEventId: z.string(), sourceObservationId: z.string(), timeBasis: z.literal("receipt") })),
                likes: z.array(z.object({ postRef: z.string(), fanRef: z.string(), state: z.enum(["active", "undone"]), sourceAt: z.string(), observedAt: z.string(), sourceEventId: z.string(), sourceObservationId: z.string(), timeBasis: z.literal("provider") })),
                unattributedLikes: z.number(), queuesHasMore: z.boolean(), likesHasMore: z.boolean() }), 400: errorResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema },
    },
    ofapiReadCollectionsGet: {
        auth: { kind: "owner-session" },
        tags: ["ops"],
        summary: "Read stored OFAPI CRM, content and monetary snapshots without vendor egress",
        querystring: z.object({
            pageId: z.coerce.number().int().positive(),
            operation: z.string().min(1).max(100).optional(),
            limit: z.coerce.number().int().min(1).max(100).optional(),
        }),
        response: {
            200: z.object({
                pageId: z.number(),
                catalog: z.array(z.object({
                    id: z.string(),
                    operation: z.string(),
                    path: z.string(),
                    category: z.string(),
                    detail: z.boolean(),
                    defaultCollect: z.boolean(),
                    granularity: z.string(),
                    query: z.record(z.string(), z.string()),
                })),
                snapshots: z.array(z.object({
                    id: z.string(),
                    source: z.literal("onlyfansapi"),
                    operation: z.string(),
                    category: z.string(),
                    pathname: z.string(),
                    query: z.record(z.string(), z.string()),
                    window: z.object({
                        from: z.string().nullable(),
                        to: z.string().nullable(),
                    }),
                    observedAt: z.string(),
                    ageSeconds: z.number(),
                    observationId: z.string(),
                    granularity: z.string(),
                    coverage: z.object({
                        state: z.enum(["complete", "partial", "unknown"]),
                        reason: z.string().nullable(),
                        indexComplete: z.boolean().nullable(),
                        omitted: z.number().nullable(),
                        nextQuery: z.record(z.string(), z.string()).nullable(),
                    }),
                    items: z.array(z.unknown()),
                })),
            }),
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
};
