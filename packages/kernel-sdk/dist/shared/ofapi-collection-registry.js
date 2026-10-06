/** Collection capability is distinct from permission to start collecting. */
export const OFAPI_COLLECTION_CATEGORIES = [
    "core_messages", "core_payments", "core_audience", "posts_comments", "visitors",
    "tracking_links", "smart_links", "vault_catalog", "vault_files", "balances",
    "profile_notifications", "content_history", "media_previews", "account_settings",
];
/** Closed periodic GET executors; uploads, exports and baseline sync use other lifecycles. */
export const OFAPI_SCHEDULED_READ_COLLECTION_CATEGORIES = [
    "posts_comments", "visitors", "tracking_links", "smart_links", "vault_catalog",
    "balances", "profile_notifications", "content_history", "account_settings",
];
export const OFAPI_COLLECTION_CAP_REASONS = ["daily_limit", "interval_limit"];
export function ofapiCollectionRefusalDisposition(reason) {
    if (OFAPI_COLLECTION_CAP_REASONS.some(cap => cap === reason))
        return "cap";
    if (reason === "background_paused")
        return "pause";
    return "policy";
}
/** Existing callers may use their old config only until this category receives a policy. */
export const OFAPI_COLLECTION_LEGACY_OPERATIONS = [
    "ofapi_chats", "ofapi_chat_messages", "ofapi_transactions", "ofapi_chargebacks", "ofapi_fans_active",
    // The desktop's fan roster (`/:acct/fans/all`) shipped with the gateway from
    // day one; it was missing here, so admission refused it as collection_off
    // while its `active` sibling worked (review #136).
    "ofapi_gateway_fans_all", "ofapi_gateway_fans_active",
    "ofapi_tracking_links", "ofapi_trial_links", "ofapi_trial_link_subscribers",
    "ofapi_capture_chat_messages", "ofapi_capture_posts", "ofapi_export_quote_create", "ofapi_export_quote_status", "ofapi_export_start",
    "ofapi_gateway_chats", "ofapi_gateway_chat_messages", "ofapi_gateway_chat_search", "ofapi_gateway_chat_message", "ofapi_gateway_chat_media",
    "ofapi_gateway_users_list", "ofapi_gateway_user", "ofapi_gateway_transactions", "ofapi_gateway_user_lists", "ofapi_gateway_user_list_users",
    "ofapi_gateway_vault_media", "ofapi_gateway_vault_lists", "ofapi_gateway_vault_media_item",
];
export const OFAPI_COLLECTION_REGISTRY = OFAPI_COLLECTION_CATEGORIES.map(id => ({
    id,
    label: ({ core_messages: "Messages", core_payments: "Payments", core_audience: "Audience",
        posts_comments: "Posts and comments", visitors: "Profile visitors", tracking_links: "Tracking links",
        smart_links: "Smart links", vault_catalog: "Vault catalog", vault_files: "Owned media uploads",
        balances: "Balances and payouts", profile_notifications: "Profile and notifications",
        content_history: "Stories, highlights and queue history",
        media_previews: "Desktop media previews",
        account_settings: "Account settings: welcome message" })[id],
    // media_previews has no background executor: on_demand admits only explicit
    // interactive desktop resolves (docs/runbooks/ofapi-media.md).
    modes: id === "vault_files" ? ["off"] : id === "media_previews" ? ["off", "on_demand"] : ["off", "on_demand", "scheduled"],
    baseline: ["core_messages", "core_payments", "core_audience"].includes(id),
    // account_settings: only the owner's stored-read report reads the
    // welcome-template snapshot so far, and no Agent Read dataset covers it.
    // "chatters" joins when the chat extension's "New" panel (H-7c) reads it.
    consumers: id === "core_messages" ? ["chatters", "Agent Read"] : id === "media_previews" ? ["chatters"]
        : id === "account_settings" ? ["dashboard"] : ["dashboard", "Agent Read"],
    supportsOneOff: !["core_messages", "core_payments", "core_audience", "media_previews"].includes(id),
    priceUnit: id === "vault_files" || id === "media_previews" ? "calls_and_bytes" : "physical_calls",
    prerequisites: id === "vault_files" ? ["owned source and explicit upload approval"] : ["active OFAPI page binding"],
    scope: "page",
    legacyOperations: OFAPI_COLLECTION_LEGACY_OPERATIONS.filter(operation => classifyOfapiCollectionOperation(operation) === id),
}));
/** Fixed migration baseline. Unknown operations fail closed at the collection boundary. */
export function classifyOfapiCollectionOperation(operation) {
    if (operation === "ofapi_export_cancel")
        return "command";
    if (operation === "ofapi_export_inventory")
        return "diagnostic";
    if (["ofapi_upload_vault", "ofapi_upload_cdn", "ofapi_upload_status"].includes(operation))
        return "vault_files";
    // Desktop media previews: the free redirect probe and the paid download.
    if (["ofapi_media_probe", "ofapi_media_download"].includes(operation))
        return "media_previews";
    if (/^ofapi_command_/.test(operation))
        return "command";
    // The catalog's welcome-template read, not a chat message: named before the
    // `message` pattern below claims it for core_messages. The desktop's gateway
    // read of the same path (`ofapi_gateway_welcome_message`) keeps its class.
    if (operation === "ofapi_read_welcome_message")
        return "account_settings";
    if (["ofapi_balance_ping", "ofapi_credential_preflight", "ofapi_admin_accounts", "ofapi_webhook_crud", "ofapi_webhook_inventory", "ofapi_webhook_event_catalog",
        "ofapi_stored_tracking_links", "ofapi_stored_trial_links"].includes(operation))
        return "diagnostic";
    if (/chat|message/.test(operation) && !/export/.test(operation))
        return "core_messages";
    if (/transaction|chargeback/.test(operation))
        return "core_payments";
    if (operation === "ofapi_read_fans_latest")
        return "core_audience";
    if (/fans_active|fans_all|subscriber|fan_profile|user_detail|users_get/.test(operation) && !/link/.test(operation))
        return "core_audience";
    if (["ofapi_gateway_user", "ofapi_gateway_users_list", "ofapi_gateway_user_lists", "ofapi_gateway_user_list_users"].includes(operation))
        return "core_audience";
    if (["ofapi_gateway_upload_status", "ofapi_export_quote_status"].includes(operation))
        return "diagnostic";
    if (/visitor/.test(operation))
        return "visitors";
    if (/smart_link/.test(operation))
        return "smart_links";
    if (/tracking|trial_link/.test(operation))
        return "tracking_links";
    if (/vault.*download|vault.*file/.test(operation))
        return "vault_files";
    if (/vault/.test(operation))
        return "vault_catalog";
    if (/post|comment/.test(operation))
        return "posts_comments";
    if (/balance|payout/.test(operation))
        return "balances";
    if (/story|stories|highlight|queue/.test(operation))
        return "content_history";
    if (/fans_|following|notification|users_|profile|_me$/.test(operation))
        return "profile_notifications";
    if (/export/.test(operation))
        return "core_messages";
    return null;
}
