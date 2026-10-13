const page = { limit: "int:1:50", offset: "int:0:1000000" };
const dates = { start_date: "date", end_date: "date" };
const camelDates = { startDate: "date", endDate: "date" };
const text = "text";
const definitions = [];
function read(id, path, category, shape, pagination, query = {}, options = {}) {
    definitions.push({
        id,
        path,
        category,
        shape,
        pagination,
        query,
        detail: path.includes(":"),
        defaultCollect: false,
        granularity: "entity",
        ...options,
    });
}
read("user_lists", "user-lists", "profile_notifications", "array", "offset", {
    limit: "int:10:50",
    offset: "int:0:1000000",
    view: "enum:queue",
});
read("user_list", "user-lists/:list", "profile_notifications", "object", "none");
read("user_list_users", "user-lists/:list/users", "profile_notifications", "list", "offset", { limit: "int:1:100", offset: "int:0:1000000" });
read("user_list_pinned_users", "user-lists/:list/users/pinned", "profile_notifications", "list", "offset", { limit: "int:1:100", offset: "int:0:1000000" });
read("profile_visitors", "statistics/reach/profile-visitors", "visitors", "object", "none", { ...dates, type: "enum:total|users|guests", filter: "enum:chart" }, { required: ["start_date", "end_date"], granularity: "window" });
read("me", "me", "profile_notifications", "object", "none", {}, { defaultCollect: true });
for (const kind of ["blocked", "restricted"])
    read(`users_${kind}`, `users/${kind}`, "profile_notifications", "list", "offset", { ...page, query: text });
read("fans_expired", "fans/expired", "profile_notifications", "list", "offset", {
    ...page,
    limit: "int:1:20",
    type: "enum:active|expired|all",
    query: text,
    "filter[online]": "enum:0|1",
    "filter[total_spent]": text,
    "filter[tips]": text,
    "filter[duration]": text,
    "filter[max_total_spent]": "int:0:1000000000",
}, { defaultCollect: true });
read("fans_latest", "fans/latest", "core_audience", "users", "offset", {
    ...page,
    ...dates,
    type: "enum:total|renew|new",
});
read("fans_top", "fans/top", "profile_notifications", "users", "none", { ...dates, by: "enum:total|subscribes|tips|messages|post|streams" }, { granularity: "ranking" });
read("subscriptions_history", "fans/:id/subscriptions-history", "profile_notifications", "list", "none");
for (const kind of ["all", "active", "expired"])
    read(`following_${kind}`, `following/${kind}`, "profile_notifications", "list", "offset", {
        ...page,
        query: text,
        "filter[online]": "enum:0|1",
        "filter[paid]": "enum:0|1",
    });
read("notifications", "notifications", "profile_notifications", "list", "from_id", {
    limit: "int:1:50",
    type: "enum:all|subscriptions|onlyfans|purchases|tips|tags|comments|mentions|likes|promotions",
    from_id: "id",
    skip_users: "enum:all|none",
}, { defaultCollect: true });
read("notification_counts", "notifications/counts", "profile_notifications", "object", "none", {}, { defaultCollect: true, granularity: "snapshot" });
read("notification_tabs", "notifications/tabs-order", "profile_notifications", "strings", "none");
read("notification_search", "notifications/search-users", "profile_notifications", "array", "none", { query: text }, { required: ["query"] });
read("giphy_trending", "giphy/trending", "profile_notifications", "array", "none", page, { granularity: "ranking" });
read("giphy_search", "giphy/search", "profile_notifications", "array", "none", { ...page, q: text }, { required: ["q"], granularity: "ranking" });
read("posts", "posts", "posts_comments", "list", "offset", {
    ...page,
    query: text,
    order: "enum:publish_date|favorites_count|tips_summ",
    sort: "enum:asc|desc",
    pinned: "bool",
    counters: "bool",
    minimumPublishDate: "date",
}, { defaultCollect: true });
// Out of the scheduled selection, still an explicit selector. OFAPI documents
// this read, but OnlyFans answered every request Hub made with its own
// 404 "Route not found." (three, the first on 2026-09-07), so a scheduled
// posts_comments run read all posts and then ended on this step.
read("post_labels", "posts/labels", "posts_comments", "list", "offset", page);
read("post", "posts/:id", "posts_comments", "object", "none");
read("post_stats", "posts/:id/stats", "posts_comments", "object", "none", { with_historical_data: "bool" }, { granularity: "snapshot" });
read("post_comments", "posts/:id/comments", "posts_comments", "list", "offset", { ...page, sort: "enum:asc|desc" });
read("stories", "stories", "content_history", "array", "none", {}, { defaultCollect: true });
read("stories_archive", "stories/archive", "content_history", "list", "marker", { limit: "int:1:50", marker: text }, { defaultCollect: true });
read("highlights", "stories/highlights", "content_history", "list", "offset", page, { defaultCollect: true });
read("highlight", "stories/highlights/:id", "content_history", "object", "none");
read("story", "stories/:id", "content_history", "object", "none");
read("story_stats", "stories/:id/stats", "content_history", "object", "none", {}, { granularity: "snapshot" });
read("story_viewers", "stories/:id/viewers", "content_history", "list", "offset", page);
read("mass_queue", "mass-messaging", "content_history", "array", "none", {}, { defaultCollect: true });
read("mass_overview", "mass-messaging/overview", "content_history", "items", "date", { ...camelDates, limit: "int:1:50", query: text });
read("mass_item", "mass-messaging/:id", "content_history", "object", "none");
for (const [id, path] of [
    ["mass", "mass-messages"],
    ["direct", "direct-messages"],
]) {
    read(`engagement_${id}`, `engagement/messages/${path}`, "content_history", "items", id === "mass" ? "date" : "offset", { ...camelDates, ...page, query: text });
    read(`engagement_${id}_chart`, `engagement/messages/${path}/chart`, "content_history", "object", "none", { ...camelDates, withTotal: "bool" }, { granularity: "window" });
}
read("engagement_top", "engagement/messages/top-message", "content_history", "object", "none", camelDates, { granularity: "ranking" });
read("message_buyers", "engagement/messages/:id/buyers", "content_history", "list", "offset", { ...page, skip_users_dups: "enum:0|1", skip_users: text });
read("payout_balances", "payouts/balances", "balances", "object", "none", {}, { defaultCollect: true, granularity: "snapshot" });
// Scheduled with balances: one newest page per run (offset 0, the planner's
// limit 50). OnlyFans keeps the full history, so older pages are a bounded
// one-off job (`payout_requests?offset=50`), never a scheduled walk.
read("payout_requests", "payouts/payout-requests", "balances", "list", "offset", page, { defaultCollect: true });
read("payout_earnings", "payouts/earning-statistics", "balances", "list", "none", camelDates, { granularity: "window" });
read("statistics_overview", "statistics/overview", "balances", "object", "none", { ...dates, type: "enum:fans|visitors|posts|messages" }, { defaultCollect: true, granularity: "window" });
read("subscriber_statistics", "subscribers/statistics", "balances", "object", "none", { ...dates, type: "enum:total|renew|new" }, { defaultCollect: true, granularity: "window" });
// The page's automatic welcome template: one 1-credit snapshot per scheduled
// run (the chat extension's "New" panel reads the newest). Collection-only, so
// the desktop's gateway read of this path keeps its capture-first
// `ofapi_gateway_welcome_message` operation and admission. Not the owner action
// `welcome_message_read`: its cluster-wide action lock would turn a background
// read into a 409 for the owner's own action.
read("welcome_message", "settings/welcome-message", "account_settings", "object", "none", {}, { defaultCollect: true, granularity: "snapshot", collectionOnly: true });
const smartPage = { limit: "int:1:1000", offset: "int:0:1000000" };
const smartDates = { date_start: "date", date_end: "date" };
function smartRead(id, path, shape, pagination, query = {}, options = {}) {
    read(id, path, "smart_links", shape, pagination, query, { scope: "smart_link", idKind: "ulid", reservedCredits: 0, ...options });
}
// Smart Links are frozen (traffic plan §2.9): no read of them is scheduled, so
// a scheduled run of `smart_links` would have nothing to read and the
// scheduler creates none. Every read stays an explicit one-off.
smartRead("smart_links", "smart-links", "array", "offset", { ...smartPage, account_ids: "text", name: "text", pixel_ids: "text", "filter[tags][]": "text" }, { required: ["account_ids"] });
smartRead("smart_link", "smart-links/:id", "object", "none");
smartRead("smart_link_pixels", "smart-links/:id/pixels", "array", "none");
smartRead("smart_link_tags", "smart-links/:id/tags", "strings", "none");
smartRead("smart_link_stats", "smart-links/:id/stats", "object", "none", smartDates, { granularity: "window" });
smartRead("smart_link_cohort_arps", "smart-links/:id/cohort-arps", "object", "none", { acquisition_start: "date", acquisition_end: "date", revenue_basis: "enum:net|gross" }, { granularity: "window", reservedCredits: 1 });
smartRead("smart_link_spenders", "smart-links/:id/spenders", "array", "offset", { ...smartPage, minSpend: "decimal" });
smartRead("smart_link_fans", "smart-links/:id/fans", "object", "offset", { ...smartPage, sort: "enum:revenue_net|-revenue_net|tips_net|-tips_net|messages_sent_by_fan|-messages_sent_by_fan|converted_at|-converted_at", has_messages: "bool", min_messages_sent_by_fan: "int:0:1000000", min_revenue_net: "decimal", min_tips_net: "decimal", previously_subscribed: "bool", subscribed_using_promo: "bool" });
for (const kind of ["clicks", "conversions"])
    smartRead(`smart_link_${kind}`, `smart-links/:id/${kind}`, "object", "offset", { ...smartPage, ...smartDates, include_bots: "bool", include_duplicates: "bool", ...(kind === "conversions" ? { conversion_type: "enum:new_subscriber|new_transaction|message_received|fan_sent_1_message|fan_sent_3_messages", onlyfans_user_id: "id" } : {}) });
// The stored link lists are read four times a day by the link series
// (`page_link_stat_*`, ofapi-link-stats-sync.ts), which the «Ссылки OnlyFans»
// screen shows; scheduling them here as well only duplicated that poll
// (traffic plan §2.9). They stay explicit one-off reads. With them the
// `tracking_links` category has no scheduled read, but its policy must stay
// scheduled: the paid fan sweep is admitted under it (plan amendment П9.4).
for (const kind of ["tracking", "trial"])
    read(`stored_${kind}_links`, `stored/${kind}-links`, "tracking_links", "list", "offset", { ...page, "filter[include_smart_links]": "bool", "filter[search]": "text", "filter[tags][]": "text" }, { reservedCredits: 0 });
for (const kind of ["tracking", "trial"]) {
    read(`stored_shared_${kind}_links`, `stored/shared-${kind}-links`, "tracking_links", "list", "offset", { ...smartPage, "filter[search]": "text", "filter[tags][]": "text" }, { reservedCredits: 0 });
    read(`shared_${kind}_links`, `shared-${kind}-links`, "tracking_links", "list", "offset", page);
    read(`${kind}_link`, `${kind}-links/:id`, "tracking_links", "object", "none");
    read(`${kind}_link_tags`, `${kind}-links/:id/tags`, "tracking_links", "strings", "none", {}, { reservedCredits: 0 });
    read(`${kind}_link_subscribers`, `${kind}-links/:id/subscribers`, "tracking_links", "list", "offset", page);
    read(`${kind}_link_spenders`, `${kind}-links/:id/spenders`, "tracking_links", "array", "offset", { ...page, minSpend: "decimal" });
    read(`${kind}_link_stats`, `${kind}-links/:id/stats`, "tracking_links", "object", "none", smartDates, { granularity: "window" });
    read(`${kind}_link_cohort_arps`, `${kind}-links/:id/cohort-arps`, "tracking_links", "object", "none", { acquisition_start: "date", acquisition_end: "date", revenue_basis: "enum:net|gross" }, { granularity: "window" });
}
// S6/S7 reference reads are explicit, paid lookups; no background default.
read("vault_inventory", "media/vault", "vault_catalog", "list", "offset", { ...page, limit: "int:10:100", query: text, field: "enum:recent|most-liked|highest-tips", type: "enum:photo|gif|video|audio", list: text, sort: "enum:asc|desc" }, { defaultCollect: true, collectionOnly: true });
read("vault_lists", "media/vault/lists", "vault_catalog", "list", "offset", { ...page, query: text, lightweight: "enum:true|false" }, { defaultCollect: true, collectionOnly: true });
read("vault_item", "media/vault/:id", "vault_catalog", "object", "none", {}, { collectionOnly: true });
read("vault_list", "media/vault/lists/:id", "vault_catalog", "object", "none");
const releaseFormQuery = { ...page, filter: "enum:all|pending", sort: "enum:date|name", sortDirection: "enum:desc|asc", name: text };
read("release_forms", "release-forms", "vault_catalog", "items", "offset", releaseFormQuery);
read("taggable_users", "release-forms/taggable-users", "vault_catalog", "items", "offset", releaseFormQuery);
/** A closed GET catalog. No arbitrary vendor path or persistent following sort is accepted. */
export const OFAPI_READ_CATALOG = definitions.map((row) => ({ ...row, operation: `ofapi_read_${row.id}` }));
/**
 * Transport reads of the desktop media resolve service (docs/runbooks/ofapi-media.md),
 * registered for admission and pricing but deliberately OUTSIDE the closed GET
 * catalog: no gateway path, collector plan or one-off job can reach them. The
 * probe (HEAD, or the GET of a file OFAPI already caches) is a free read and
 * reserves nothing; the download reserves its byte price at admission.
 */
export const OFAPI_MEDIA_TRANSPORT_READS = [
    { id: "media_probe", operation: "ofapi_media_probe", path: "media/download/:cdnUrl", category: "media_previews",
        shape: "object", pagination: "none", query: {}, detail: false, defaultCollect: false, granularity: "entity",
        reservedCredits: 0, collectionOnly: true },
    { id: "media_download", operation: "ofapi_media_download", path: "media/download/:cdnUrl", category: "media_previews",
        shape: "object", pagination: "none", query: {}, detail: false, defaultCollect: false, granularity: "entity",
        collectionOnly: true },
];
export function findOfapiReadDefinition(operation) {
    return OFAPI_READ_CATALOG.find((row) => row.operation === operation)
        ?? OFAPI_MEDIA_TRANSPORT_READS.find((row) => row.operation === operation);
}
export function validateOfapiReadQuery(def, raw) {
    const result = {};
    for (const [name, value] of Object.entries(raw)) {
        if ((typeof value !== "string" &&
            typeof value !== "number" &&
            typeof value !== "boolean") ||
            !def.query[name])
            throw new Error(`Unsupported query ${name}`);
        const v = String(value), rule = def.query[name];
        if (rule.startsWith("int:")) {
            const [, min, max] = rule.split(":");
            if (!/^\d+$/.test(v) ||
                !Number.isSafeInteger(Number(v)) ||
                Number(v) < Number(min) ||
                Number(v) > Number(max))
                throw new Error(`Invalid integer ${name}`);
        }
        if (rule.startsWith("enum:") && !rule.slice(5).split("|").includes(v))
            throw new Error(`Invalid value ${name}`);
        if (rule === "bool" && !["true", "false", "1", "0"].includes(v))
            throw new Error(`Invalid boolean ${name}`);
        if (rule === "date" &&
            (!/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(v) || !Number.isFinite(Date.parse(v))))
            throw new Error(`Invalid date ${name}`);
        if (rule === "id" && !/^\d+$/.test(v))
            throw new Error(`Invalid id ${name}`);
        if (rule === "decimal" && (!/^\d+(\.\d+)?$/.test(v) || !Number.isFinite(Number(v))))
            throw new Error(`Invalid decimal ${name}`);
        if (v.length < 1 || v.length > 500)
            throw new Error(`Invalid length ${name}`);
        result[name] = v;
    }
    for (const key of def.required ?? [])
        if (!result[key])
            throw new Error(`Missing ${key}`);
    for (const [start, end] of [
        ["start_date", "end_date"],
        ["startDate", "endDate"],
        ["date_start", "date_end"],
        ["acquisition_start", "acquisition_end"],
    ])
        if (Boolean(result[start]) !== Boolean(result[end]) ||
            (result[start] &&
                Date.parse(result[start]) >= Date.parse(result[end])))
            throw new Error("Invalid paired date window");
    if (result["filter[max_total_spent]"] && result["filter[online]"])
        throw new Error("Spend index and online filters cannot be combined");
    return result;
}
export function resolveOfapiCatalogPath(path, raw, scopeAccountId) {
    const segments = path.replace(/^\/+|\/+$/g, "").split("/");
    const global = segments[0] === "smart-links";
    const accountId = global ? scopeAccountId : segments.shift();
    if (!accountId || !/^acct_[A-Za-z0-9]+$/.test(accountId))
        return null;
    // Literal paths win over ids (archive/highlights/overview/labels).
    for (const def of [...OFAPI_READ_CATALOG].sort((a, b) => Number(a.detail) - Number(b.detail))) {
        if ((def.scope === "smart_link") !== global)
            continue;
        const pieces = def.path.split("/");
        if (pieces.length !== segments.length ||
            !pieces.every((v, i) => v === ":id" ? (def.idKind === "ulid" ? /^[0-9A-HJKMNP-TV-Z]{26}$/ : /^\d+$/).test(segments[i]) : v === ":list" ? isOfapiUserListRef(segments[i]) : v === segments[i]))
            continue;
        const query = validateOfapiReadQuery(def, raw);
        if (global && !def.detail && query.account_ids !== accountId)
            throw new Error("Smart Link inventory must match the frozen page account scope");
        return {
            definition: def,
            accountId,
            pathname: global ? `/${segments.join("/")}` : `/${accountId}/${segments.join("/")}`,
            query,
        };
    }
    return null;
}
/** List identifiers include vendor system names such as friends/tagged, never URL syntax. */
export function isOfapiUserListRef(value) {
    return /^(?:[0-9]{1,30}|[A-Za-z][A-Za-z0-9_]{0,63})$/.test(value);
}
