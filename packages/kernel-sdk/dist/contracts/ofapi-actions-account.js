import { z } from "zod";
const pageId = z.number().int().positive();
const id = z.string().regex(/^[0-9]{1,30}$/);
const uploadId = z.string().regex(/^ofapi_media_[A-Za-z0-9_-]{1,128}$/);
const mediaId = z.union([id, uploadId]);
const uniqueIds = z.array(id).max(100).refine(values => new Set(values).size === values.length, "IDs must be unique");
const period = z.union([z.literal(6), z.literal(12), z.literal(24), z.literal(48)]);
const pagination = { limit: z.number().int().min(1).max(100).default(10), offset: z.number().int().min(0).max(1_000_000).default(0) };
const httpUrl = z.url().max(2048).refine(value => ["http:", "https:"].includes(new URL(value).protocol), "Use an HTTP(S) URL");
const nullableProfileFields = ["name", "about", "location", "website", "wishlist"];
export const ofapiSocialButtonTypes = ["instagram", "x", "facebook", "youtube", "tiktok", "snapchat", "amazon", "twitch", "discord", "patreon", "pinterest", "etsy", "bereal", "kick", "depop", "poshmark", "vsco", "threads", "throne", "shopltk", "oftv", "bluesky"];
/** Owner actions are closed definitions; callers cannot supply a vendor account, URL or HTTP method. */
export const ofapiAccountActionOptions = [
    z.strictObject({ action: z.literal("bank_payout_details_read"), pageId }),
    z.strictObject({ action: z.literal("bank_legal_form_read"), pageId }),
    z.strictObject({ action: z.literal("bank_legal_tax_status_read"), pageId }),
    z.strictObject({ action: z.literal("bank_dac7_form_read"), pageId }),
    z.strictObject({ action: z.literal("bank_account_country_read"), pageId }),
    z.strictObject({ action: z.literal("bank_countries_read"), pageId }),
    z.strictObject({ action: z.literal("bank_payout_systems_read"), pageId }),
    z.strictObject({ action: z.literal("payout_eligibility_read"), pageId }),
    z.strictObject({ action: z.literal("payout_frequency_update"), pageId, frequency: z.enum(["manual", "weekly", "monthly"]) }),
    // The documented withdrawal wire amount is an integer number of USD, not cents.
    z.strictObject({ action: z.literal("payout_withdrawal_request"), pageId, amountCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).multipleOf(100) }),
    z.strictObject({ action: z.literal("saved_messages_read"), pageId, ...pagination }),
    z.strictObject({ action: z.literal("saved_message_settings_read"), pageId }),
    z.strictObject({ action: z.literal("saved_message_autosend_update"), pageId, period }),
    z.strictObject({ action: z.literal("saved_message_autosend_disable"), pageId }),
    z.strictObject({ action: z.literal("saved_posts_read"), pageId, ...pagination }),
    z.strictObject({ action: z.literal("saved_post_settings_read"), pageId }),
    z.strictObject({ action: z.literal("saved_post_autopost_update"), pageId, period }),
    z.strictObject({ action: z.literal("saved_post_autopost_disable"), pageId }),
    z.strictObject({ action: z.literal("account_settings_read"), pageId }),
    z.strictObject({
        action: z.literal("account_profile_update"), pageId,
        username: z.string().min(1).max(100).optional(), name: z.string().max(100).nullable().optional(),
        avatar: uploadId.optional(), header: uploadId.optional(), about: z.string().max(10_000).nullable().optional(),
        location: z.string().max(255).nullable().optional(), website: httpUrl.nullable().optional(), wishlist: httpUrl.nullable().optional(),
        clearFields: z.array(z.enum(nullableProfileFields)).max(5).refine(values => new Set(values).size === values.length, "Fields must be unique").optional(),
    }).superRefine((value, ctx) => {
        if (!["username", "avatar", "header", ...nullableProfileFields].some(key => value[key] !== undefined) && !value.clearFields?.length)
            ctx.addIssue({ code: "custom", message: "Select at least one profile field to change" });
        for (const key of value.clearFields ?? [])
            if (value[key] !== undefined && value[key] !== null)
                ctx.addIssue({ code: "custom", path: [key], message: "A field cannot be changed and cleared together" });
    }),
    z.strictObject({ action: z.literal("subscription_price_update"), pageId, priceCents: z.number().int().min(0).max(20_000).refine(value => value === 0 || value >= 499, "Use free or USD 4.99–200") }),
    z.strictObject({ action: z.literal("blocked_countries_read"), pageId }),
    z.strictObject({ action: z.literal("blocked_countries_update"), pageId,
        blockedCountries: z.array(z.string().regex(/^[A-Z]{2}$/)).max(250).refine(values => new Set(values).size === values.length, "Countries must be unique").nullable(),
        blockedStates: z.array(z.string().min(1).max(100)).max(500).default([]),
    }),
    z.strictObject({ action: z.literal("welcome_message_read"), pageId }),
    z.strictObject({ action: z.literal("welcome_message_enabled_update"), pageId, enabled: z.boolean() }),
    z.strictObject({ action: z.literal("welcome_message_update"), pageId,
        text: z.string().max(10_000).default(""), lockedText: z.boolean().default(false),
        priceCents: z.number().int().min(0).max(20_000).multipleOf(100).refine(value => value === 0 || value >= 300, "Use free or USD 3–200"),
        mediaFiles: z.array(mediaId).max(50).default([]), previews: z.array(mediaId).max(50).default([]),
        rfTag: uniqueIds.default([]), rfGuest: uniqueIds.default([]), rfPartner: uniqueIds.default([]), isForward: z.boolean().optional(),
    }).superRefine((value, ctx) => {
        if (!value.text.trim() && !value.mediaFiles.length)
            ctx.addIssue({ code: "custom", message: "Choose welcome text or media" });
        if (value.priceCents > 0 && !value.mediaFiles.length)
            ctx.addIssue({ code: "custom", path: ["mediaFiles"], message: "Paid welcome content requires media" });
        if (new Set(value.mediaFiles).size !== value.mediaFiles.length || new Set(value.previews).size !== value.previews.length || value.previews.some(item => !value.mediaFiles.includes(item)))
            ctx.addIssue({ code: "custom", path: ["previews"], message: "Previews must be a unique subset of attached media" });
    }),
    z.strictObject({ action: z.literal("account_drm_read"), pageId }),
    z.strictObject({ action: z.literal("account_drm_update"), pageId, enabled: z.boolean() }),
    z.strictObject({ action: z.literal("username_availability_read"), pageId, username: z.string().min(1).max(100) }),
    z.strictObject({ action: z.literal("social_buttons_reorder"), pageId, buttonIds: uniqueIds.min(1) }),
    z.strictObject({ action: z.literal("social_buttons_read"), pageId }),
    z.strictObject({ action: z.literal("social_button_create"), pageId, label: z.string().min(1).max(255), type: z.enum(ofapiSocialButtonTypes), value: z.string().min(1).max(2048) }),
    z.strictObject({ action: z.literal("social_button_update"), pageId, buttonId: id, label: z.string().min(1).max(255) }),
    z.strictObject({ action: z.literal("social_button_delete"), pageId, buttonId: id }),
];
export const ofapiAccountActionSchema = z.union(ofapiAccountActionOptions);
