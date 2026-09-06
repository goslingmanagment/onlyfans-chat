export const OFAPI_TYPED_EXPORT_PROFILES = ["profile_visitors", "fans", "tracking_links", "trial_links", "smart_links"];
export function isOfapiTypedExportProfile(value) {
    return OFAPI_TYPED_EXPORT_PROFILES.some(profile => profile === value);
}
/** Explicit columns verified against the live vendor field reference on 2026-09-06. */
export const OFAPI_TYPED_EXPORT_COLUMNS = {
    profile_visitors: ["account_id", "date", "total_visitors", "guest_visitors", "user_visitors", "subscriber_visitors", "avg_view_duration"],
    fans: ["account_id", "onlyfans_id", "username", "name", "can_chat", "rebill_on", "subscribe_at", "expired_at", "renewed_at", "total_summ"],
    tracking_links: ["account_id", "onlyfans_id", "campaign_code", "campaign_name", "onlyfans_url", "spenders_count", "count_subscribers", "count_transitions", "revenue", "tags"],
    trial_links: ["account_id", "onlyfans_id", "name", "url", "spenders_count", "claim_counts", "clicks_counts", "subscribe_counts", "is_finished", "revenue", "tags"],
    smart_links: ["account_id", "link_name", "link_url", "offer_type", "gross_clicks", "unique_clicks", "subscribers", "spenders", "revenue", "cost", "cost_input_mode", "cost_input_value"],
};
export function ofapiTypedExportCategory(profile) {
    return profile === "profile_visitors" ? "visitors" : profile === "fans" ? "profile_notifications" : profile === "smart_links" ? "smart_links" : "tracking_links";
}
