import { z } from "zod";
import { errorResponseSchema } from "./primitives";
import { ofapiMarketingActionSchema, ofapiMarketingDashboardSchema, ofapiMarketingIntentSchema } from "./ofapi-smart-links";
const errors = { 400: errorResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema, 503: errorResponseSchema };
export const ofapiMarketingRouteSchemas = {
    ofapiMarketingRebuild: { auth: { kind: "owner-session" }, tags: ["admin"], summary: "Rebuild retained marketing state locally without vendor egress", body: z.object({}).strict(), response: { 200: ofapiMarketingDashboardSchema, ...errors } },
    ofapiMarketingGet: { auth: { kind: "owner-session" }, tags: ["admin"], summary: "Read retained Smart Link attribution and safe marketing configuration", response: { 200: ofapiMarketingDashboardSchema, ...errors } },
    ofapiMarketingPrepare: { auth: { kind: "owner-session" }, tags: ["admin"], summary: "Prepare an encrypted marketing command and safe impact preview without vendor egress", body: z.object({ id: z.string().uuid(), command: ofapiMarketingActionSchema }).strict(), response: { 200: ofapiMarketingIntentSchema, ...errors } },
    ofapiMarketingDispatch: { auth: { kind: "owner-session" }, tags: ["admin"], summary: "Dispatch a prepared marketing command once; external test events require separate acknowledgement", params: z.object({ id: z.string().uuid() }), body: z.object({ acknowledgeSharedImpact: z.boolean(), acknowledgeExternalTest: z.boolean() }).strict(), response: { 200: ofapiMarketingIntentSchema, ...errors } },
    ofapiMarketingPostbacksRefresh: { auth: { kind: "owner-session" }, tags: ["admin"], summary: "Capture encrypted vendor postback configuration and expose secret-safe fields", body: z.object({ postbackId: z.number().int().positive().optional() }).strict(), response: { 200: ofapiMarketingDashboardSchema, ...errors } },
};
