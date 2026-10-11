import { z } from "zod";
import { isoDateTime } from "./primitives";
const linkId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
const pixelId = z.number().int().positive();
const optionalName = z.string().max(100).nullable().optional();
const eventNames = {
    event_click: optionalName, event_new_subscriber: optionalName, event_first_transaction: optionalName,
    event_new_transaction: optionalName, event_message_received_from_fan: optionalName,
    event_fan_sent_1_message: optionalName, event_fan_sent_3_messages: optionalName,
};
const pixelFields = {
    label: optionalName, pixel_id: z.string().max(255).optional(),
    pixel_access_token: z.string().min(1).max(16000).optional(),
    event_source_url: z.string().url().max(2048).nullable().optional(), ...eventNames,
};
const postbackFields = {
    url: z.string().min(1).max(4000), http_method: z.enum(["GET", "POST"]).optional(),
    body: z.string().max(16000).optional(),
    headers: z.array(z.object({ name: z.string().regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,100}$/), value: z.string().max(8000).refine(v => !/[\r\n]/.test(v)) }).strict()).max(30).optional(),
    smart_link_scope: z.enum(["global", "campaign_specific"]),
    conversion_types: z.array(z.enum(["new_subscriber", "new_transaction", "message_received", "fan_sent_1_message", "fan_sent_3_messages"])).min(1).max(5),
    smart_link_ids: z.array(linkId).max(100).optional(),
};
export const ofapiMarketingActionSchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("smart_link_create"), pageId: z.number().int().positive(), name: z.string().min(1).max(255), link_type: z.enum(["free_trial", "tracking_link"]), free_trial_days: z.number().int().min(1).max(360).optional() }).strict(),
    z.object({ action: z.literal("smart_link_delete"), pageId: z.number().int().positive(), linkId }).strict(),
    z.object({ action: z.literal("tags_add"), pageId: z.number().int().positive(), linkId, tags: z.array(z.string().min(1).max(50)).min(1).max(50) }).strict(),
    z.object({ action: z.literal("tags_remove"), pageId: z.number().int().positive(), linkId, tags: z.array(z.string().min(1).max(50)).min(1).max(50) }).strict(),
    z.object({ action: z.literal("pixel_create"), pageId: z.number().int().positive(), linkId, platform: z.enum(["meta", "snapchat", "tiktok", "creatortraffic"]), ...pixelFields, pixel_id: z.string().max(255), pixel_access_token: z.string().min(1).max(16000) }).strict(),
    z.object({ action: z.literal("pixel_update"), pageId: z.number().int().positive(), linkId, pixelId, ...pixelFields }).strict(),
    z.object({ action: z.literal("pixel_disconnect"), pageId: z.number().int().positive(), linkId, pixelId }).strict(),
    z.object({ action: z.literal("pixel_test"), pageId: z.number().int().positive(), linkId, pixelId, test_event_code: z.string().max(100).optional(), event_type: z.enum(["event_click", "event_new_subscriber_free", "event_new_subscriber_paid", "event_first_transaction", "event_new_transaction", "event_message_received_from_fan", "event_fan_sent_1_message", "event_fan_sent_3_messages"]) }).strict(),
    z.object({ action: z.literal("postback_create"), ...postbackFields }).strict(),
    z.object({ action: z.literal("postback_update"), postbackId: pixelId, ...postbackFields }).strict(),
    z.object({ action: z.literal("postback_delete"), postbackId: pixelId }).strict(),
]).superRefine((value, ctx) => {
    if (value.action === "pixel_create" && value.platform !== "creatortraffic" && !value.pixel_id)
        ctx.addIssue({ code: "custom", path: ["pixel_id"], message: "This platform requires a pixel ID" });
    if (value.action === "smart_link_create" && value.link_type === "free_trial" && !value.free_trial_days)
        ctx.addIssue({ code: "custom", path: ["free_trial_days"], message: "Free trials require a day count" });
    if ((value.action === "postback_create" || value.action === "postback_update") && value.smart_link_scope === "campaign_specific" && !value.smart_link_ids?.length)
        ctx.addIssue({ code: "custom", path: ["smart_link_ids"], message: "Select at least one Smart Link" });
});
export const ofapiMarketingResourceSchema = z.object({
    pageId: z.number().int().positive().nullable(), nativeAccountRef: z.string().nullable(), kind: z.enum(["smart_link", "pixel", "postback", "tracking", "trial"]),
    id: z.string(), shared: z.boolean(), parentId: z.string().nullable(), name: z.string().nullable(), observedAt: isoDateTime(),
    linkType: z.string().nullable(), platform: z.string().nullable(), platformPixelId: z.string().nullable(),
    publicUrl: z.string().nullable(), httpMethod: z.enum(["GET", "POST"]).nullable(), status: z.string().nullable(), destination: z.string().nullable(),
    clicks: z.number().nullable(), conversions: z.number().nullable(), subscribers: z.number().nullable(), spenders: z.number().nullable(),
    revenueMills: z.string().nullable(), revenueBasis: z.enum(["net", "gross", "unspecified"]),
    cost: z.object({ inputMode: z.string().nullable(), inputValue: z.string().nullable(), currency: z.string().nullable(), unit: z.string(), source: z.literal("provider_campaign_configuration") }).nullable(),
    tags: z.array(z.string()), eventNames: z.record(z.string(), z.string().nullable()),
    conversionTypes: z.array(z.string()), scope: z.string().nullable(), linkIds: z.array(z.string()),
    templateVariables: z.array(z.string()), headerNames: z.array(z.string()), hasBodyTemplate: z.boolean(),
});
export const ofapiMarketingPreviewValueSchema = z.object({
    field: z.enum(["name", "link_type", "free_trial_days", "tags", "label", "platform", "pixel_id", "event_click", "event_new_subscriber", "event_first_transaction", "event_new_transaction", "event_message_received_from_fan", "event_fan_sent_1_message", "event_fan_sent_3_messages", "event_type", "http_method", "body_change", "headers_change", "pixel_token_change", "test_event_code_change", "event_source_url_change"]),
    value: z.union([z.string(), z.number(), z.array(z.string()), z.null()]),
});
export const ofapiMarketingIntentSchema = z.object({
    id: z.string().uuid(), action: z.string(), state: z.string(), errorCode: z.string().nullable(),
    remoteId: z.string().nullable(), accountingState: z.enum(["pending", "complete"]), projectionState: z.enum(["pending", "complete"]),
    createdAt: isoDateTime(), responseObservationId: z.number().nullable(),
    preview: z.object({ pageId: z.number().int().positive().nullable(), pageLabel: z.string().nullable(), accountId: z.string().nullable(), values: z.array(ofapiMarketingPreviewValueSchema),
        destination: z.string().nullable(), templateVariables: z.array(z.string()), headerNames: z.array(z.string()),
        targetId: z.string().nullable(), changedFields: z.array(z.string()), conversionTypes: z.array(z.string()), scope: z.string().nullable(),
        affectedLinkIds: z.array(z.string()), affectedLinksComplete: z.boolean(), effect: z.string(), externalTest: z.boolean(), estimatedCredits: z.number() }),
});
export const ofapiMarketingMetricSchema = z.object({
    nativeId: z.string().nullable().optional(), period: z.enum(["summary", "daily", "monthly", "row", "cohort"]).optional(),
    timestamp: z.string().nullable().optional(), occurredAt: z.string().nullable().optional(),
    fanId: z.string().nullable().optional(), username: z.string().nullable().optional(),
    conversionType: z.string().nullable().optional(), country: z.string().nullable().optional(),
    isBot: z.boolean().nullable().optional(), isDuplicate: z.boolean().nullable().optional(), organic: z.boolean().nullable().optional(),
    previouslySubscribed: z.boolean().nullable().optional(), subscribedUsingPromo: z.boolean().nullable().optional(),
    currentSubscriptionFromSmartLink: z.boolean().nullable().optional(),
    clicks: z.number().nullable().optional(), subscribers: z.number().nullable().optional(), spenders: z.number().nullable().optional(), messagesSentByFan: z.number().nullable().optional(),
    revenueMills: z.string().nullable().optional(), tipsNetMills: z.string().nullable().optional(), amountGrossMills: z.string().nullable().optional(), amountNetMills: z.string().nullable().optional(),
    revenueBasis: z.enum(["net", "gross", "unspecified"]).optional(),
    metricPath: z.string().optional(), providerValue: z.string().optional(),
    attributionOnly: z.literal(true),
});
export const ofapiMarketingAnalyticsSchema = z.object({ pageId: z.number().int().positive(), operation: z.string(), linkId: z.string(), observedAt: isoDateTime(),
    window: z.object({ from: z.string().nullable(), to: z.string().nullable() }), requestedRevenueBasis: z.enum(["net", "gross"]).nullable(),
    coverage: z.object({ state: z.enum(["complete", "partial", "unknown"]), reason: z.string().nullable() }), rows: z.array(ofapiMarketingMetricSchema) });
export const ofapiMarketingDashboardSchema = z.object({
    resources: z.array(ofapiMarketingResourceSchema), analytics: z.array(ofapiMarketingAnalyticsSchema), intents: z.array(ofapiMarketingIntentSchema),
    attributionWindowHours: z.literal(6), revenueIsAdditive: z.literal(false),
});
