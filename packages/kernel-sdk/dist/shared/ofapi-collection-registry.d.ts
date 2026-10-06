/** Collection capability is distinct from permission to start collecting. */
export declare const OFAPI_COLLECTION_CATEGORIES: readonly ["core_messages", "core_payments", "core_audience", "posts_comments", "visitors", "tracking_links", "smart_links", "vault_catalog", "vault_files", "balances", "profile_notifications", "content_history", "media_previews", "account_settings"];
export type OfapiCollectionCategory = typeof OFAPI_COLLECTION_CATEGORIES[number];
/** Closed periodic GET executors; uploads, exports and baseline sync use other lifecycles. */
export declare const OFAPI_SCHEDULED_READ_COLLECTION_CATEGORIES: readonly OfapiCollectionCategory[];
export type OfapiCollectionMode = "off" | "on_demand" | "scheduled";
export type OfapiCollectionPurpose = "background" | "interactive" | "one_off";
export interface OfapiCollectionContext {
    category: OfapiCollectionCategory;
    purpose: OfapiCollectionPurpose;
    jobId?: string;
    detail?: boolean;
    reservedCredits?: number;
}
export interface OfapiCollectionSettings {
    pageId: number | null;
    category: OfapiCollectionCategory;
    mode: OfapiCollectionMode;
    intervalMinutes: number;
    dailyCreditLimit: number;
    maxCallsPerRun: number;
    includeDetails: boolean;
}
/**
 * How a collection-policy refusal clears, which decides both the HTTP answer
 * and what a scheduler does with it:
 * - `cap`: time clears it (the UTC day rolls over, the interval window
 *   reopens) — HTTP 429 with the reset time; a sync stream sleeps until then.
 * - `pause`: the owner's temporary background brake — HTTP 409; a sync stream
 *   re-checks on a short cadence so Resume heals it without operator work.
 * - `policy`: a durable owner decision or a misconfiguration that no clock
 *   fixes — HTTP 409; a sync stream parks until the owner acts.
 * Every reason is a local decision the console already shows; none is a vendor
 * outage, so none opens a sync incident.
 */
export type OfapiCollectionRefusalDisposition = "cap" | "pause" | "policy";
export declare const OFAPI_COLLECTION_CAP_REASONS: readonly ["daily_limit", "interval_limit"];
export declare function ofapiCollectionRefusalDisposition(reason: string): OfapiCollectionRefusalDisposition;
/** Existing callers may use their old config only until this category receives a policy. */
export declare const OFAPI_COLLECTION_LEGACY_OPERATIONS: readonly ["ofapi_chats", "ofapi_chat_messages", "ofapi_transactions", "ofapi_chargebacks", "ofapi_fans_active", "ofapi_gateway_fans_all", "ofapi_gateway_fans_active", "ofapi_tracking_links", "ofapi_trial_links", "ofapi_trial_link_subscribers", "ofapi_capture_chat_messages", "ofapi_capture_posts", "ofapi_export_quote_create", "ofapi_export_quote_status", "ofapi_export_start", "ofapi_gateway_chats", "ofapi_gateway_chat_messages", "ofapi_gateway_chat_search", "ofapi_gateway_chat_message", "ofapi_gateway_chat_media", "ofapi_gateway_users_list", "ofapi_gateway_user", "ofapi_gateway_transactions", "ofapi_gateway_user_lists", "ofapi_gateway_user_list_users", "ofapi_gateway_vault_media", "ofapi_gateway_vault_lists", "ofapi_gateway_vault_media_item"];
export declare const OFAPI_COLLECTION_REGISTRY: {
    id: "core_messages" | "core_payments" | "core_audience" | "posts_comments" | "visitors" | "tracking_links" | "smart_links" | "vault_catalog" | "vault_files" | "balances" | "profile_notifications" | "content_history" | "media_previews" | "account_settings";
    label: string;
    modes: readonly ["off"] | readonly ["off", "on_demand"] | readonly ["off", "on_demand", "scheduled"];
    baseline: boolean;
    consumers: string[];
    supportsOneOff: boolean;
    priceUnit: "calls_and_bytes" | "physical_calls";
    prerequisites: string[];
    scope: "page";
    legacyOperations: ("ofapi_chats" | "ofapi_chat_messages" | "ofapi_transactions" | "ofapi_chargebacks" | "ofapi_fans_active" | "ofapi_gateway_fans_all" | "ofapi_gateway_fans_active" | "ofapi_tracking_links" | "ofapi_trial_links" | "ofapi_trial_link_subscribers" | "ofapi_capture_chat_messages" | "ofapi_capture_posts" | "ofapi_export_quote_create" | "ofapi_export_quote_status" | "ofapi_export_start" | "ofapi_gateway_chats" | "ofapi_gateway_chat_messages" | "ofapi_gateway_chat_search" | "ofapi_gateway_chat_message" | "ofapi_gateway_chat_media" | "ofapi_gateway_users_list" | "ofapi_gateway_user" | "ofapi_gateway_transactions" | "ofapi_gateway_user_lists" | "ofapi_gateway_user_list_users" | "ofapi_gateway_vault_media" | "ofapi_gateway_vault_lists" | "ofapi_gateway_vault_media_item")[];
}[];
/** Fixed migration baseline. Unknown operations fail closed at the collection boundary. */
export declare function classifyOfapiCollectionOperation(operation: string): OfapiCollectionCategory | "diagnostic" | "command" | null;
