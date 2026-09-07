import { z } from "zod";
export declare const ofapiSocialButtonTypes: readonly ["instagram", "x", "facebook", "youtube", "tiktok", "snapchat", "amazon", "twitch", "discord", "patreon", "pinterest", "etsy", "bereal", "kick", "depop", "poshmark", "vsco", "threads", "throne", "shopltk", "oftv", "bluesky"];
/** Owner actions are closed definitions; callers cannot supply a vendor account, URL or HTTP method. */
export declare const ofapiAccountActionOptions: readonly [z.ZodObject<{
    action: z.ZodLiteral<"bank_payout_details_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"bank_legal_form_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"bank_legal_tax_status_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"bank_dac7_form_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"bank_account_country_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"bank_countries_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"bank_payout_systems_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"payout_eligibility_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"payout_frequency_update">;
    pageId: z.ZodNumber;
    frequency: z.ZodEnum<{
        monthly: "monthly";
        manual: "manual";
        weekly: "weekly";
    }>;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"payout_withdrawal_request">;
    pageId: z.ZodNumber;
    amountCents: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    limit: z.ZodDefault<z.ZodNumber>;
    offset: z.ZodDefault<z.ZodNumber>;
    action: z.ZodLiteral<"saved_messages_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"saved_message_settings_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"saved_message_autosend_update">;
    pageId: z.ZodNumber;
    period: z.ZodUnion<readonly [z.ZodLiteral<6>, z.ZodLiteral<12>, z.ZodLiteral<24>, z.ZodLiteral<48>]>;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"saved_message_autosend_disable">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    limit: z.ZodDefault<z.ZodNumber>;
    offset: z.ZodDefault<z.ZodNumber>;
    action: z.ZodLiteral<"saved_posts_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"saved_post_settings_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"saved_post_autopost_update">;
    pageId: z.ZodNumber;
    period: z.ZodUnion<readonly [z.ZodLiteral<6>, z.ZodLiteral<12>, z.ZodLiteral<24>, z.ZodLiteral<48>]>;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"saved_post_autopost_disable">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"account_settings_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"account_profile_update">;
    pageId: z.ZodNumber;
    username: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    avatar: z.ZodOptional<z.ZodString>;
    header: z.ZodOptional<z.ZodString>;
    about: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    location: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    website: z.ZodOptional<z.ZodNullable<z.ZodURL>>;
    wishlist: z.ZodOptional<z.ZodNullable<z.ZodURL>>;
    clearFields: z.ZodOptional<z.ZodArray<z.ZodEnum<{
        name: "name";
        about: "about";
        location: "location";
        website: "website";
        wishlist: "wishlist";
    }>>>;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"subscription_price_update">;
    pageId: z.ZodNumber;
    priceCents: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"blocked_countries_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"blocked_countries_update">;
    pageId: z.ZodNumber;
    blockedCountries: z.ZodNullable<z.ZodArray<z.ZodString>>;
    blockedStates: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"welcome_message_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"welcome_message_enabled_update">;
    pageId: z.ZodNumber;
    enabled: z.ZodBoolean;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"welcome_message_update">;
    pageId: z.ZodNumber;
    text: z.ZodDefault<z.ZodString>;
    lockedText: z.ZodDefault<z.ZodBoolean>;
    priceCents: z.ZodNumber;
    mediaFiles: z.ZodDefault<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodString]>>>;
    previews: z.ZodDefault<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodString]>>>;
    rfTag: z.ZodDefault<z.ZodArray<z.ZodString>>;
    rfGuest: z.ZodDefault<z.ZodArray<z.ZodString>>;
    rfPartner: z.ZodDefault<z.ZodArray<z.ZodString>>;
    isForward: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"account_drm_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"account_drm_update">;
    pageId: z.ZodNumber;
    enabled: z.ZodBoolean;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"username_availability_read">;
    pageId: z.ZodNumber;
    username: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"social_buttons_reorder">;
    pageId: z.ZodNumber;
    buttonIds: z.ZodArray<z.ZodString>;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"social_buttons_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"social_button_create">;
    pageId: z.ZodNumber;
    label: z.ZodString;
    type: z.ZodEnum<{
        snapchat: "snapchat";
        tiktok: "tiktok";
        instagram: "instagram";
        x: "x";
        facebook: "facebook";
        youtube: "youtube";
        amazon: "amazon";
        twitch: "twitch";
        discord: "discord";
        patreon: "patreon";
        pinterest: "pinterest";
        etsy: "etsy";
        bereal: "bereal";
        kick: "kick";
        depop: "depop";
        poshmark: "poshmark";
        vsco: "vsco";
        threads: "threads";
        throne: "throne";
        shopltk: "shopltk";
        oftv: "oftv";
        bluesky: "bluesky";
    }>;
    value: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"social_button_update">;
    pageId: z.ZodNumber;
    buttonId: z.ZodString;
    label: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"social_button_delete">;
    pageId: z.ZodNumber;
    buttonId: z.ZodString;
}, z.core.$strict>];
export declare const ofapiAccountActionSchema: z.ZodUnion<readonly [z.ZodObject<{
    action: z.ZodLiteral<"bank_payout_details_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"bank_legal_form_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"bank_legal_tax_status_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"bank_dac7_form_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"bank_account_country_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"bank_countries_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"bank_payout_systems_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"payout_eligibility_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"payout_frequency_update">;
    pageId: z.ZodNumber;
    frequency: z.ZodEnum<{
        monthly: "monthly";
        manual: "manual";
        weekly: "weekly";
    }>;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"payout_withdrawal_request">;
    pageId: z.ZodNumber;
    amountCents: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    limit: z.ZodDefault<z.ZodNumber>;
    offset: z.ZodDefault<z.ZodNumber>;
    action: z.ZodLiteral<"saved_messages_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"saved_message_settings_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"saved_message_autosend_update">;
    pageId: z.ZodNumber;
    period: z.ZodUnion<readonly [z.ZodLiteral<6>, z.ZodLiteral<12>, z.ZodLiteral<24>, z.ZodLiteral<48>]>;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"saved_message_autosend_disable">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    limit: z.ZodDefault<z.ZodNumber>;
    offset: z.ZodDefault<z.ZodNumber>;
    action: z.ZodLiteral<"saved_posts_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"saved_post_settings_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"saved_post_autopost_update">;
    pageId: z.ZodNumber;
    period: z.ZodUnion<readonly [z.ZodLiteral<6>, z.ZodLiteral<12>, z.ZodLiteral<24>, z.ZodLiteral<48>]>;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"saved_post_autopost_disable">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"account_settings_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"account_profile_update">;
    pageId: z.ZodNumber;
    username: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    avatar: z.ZodOptional<z.ZodString>;
    header: z.ZodOptional<z.ZodString>;
    about: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    location: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    website: z.ZodOptional<z.ZodNullable<z.ZodURL>>;
    wishlist: z.ZodOptional<z.ZodNullable<z.ZodURL>>;
    clearFields: z.ZodOptional<z.ZodArray<z.ZodEnum<{
        name: "name";
        about: "about";
        location: "location";
        website: "website";
        wishlist: "wishlist";
    }>>>;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"subscription_price_update">;
    pageId: z.ZodNumber;
    priceCents: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"blocked_countries_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"blocked_countries_update">;
    pageId: z.ZodNumber;
    blockedCountries: z.ZodNullable<z.ZodArray<z.ZodString>>;
    blockedStates: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"welcome_message_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"welcome_message_enabled_update">;
    pageId: z.ZodNumber;
    enabled: z.ZodBoolean;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"welcome_message_update">;
    pageId: z.ZodNumber;
    text: z.ZodDefault<z.ZodString>;
    lockedText: z.ZodDefault<z.ZodBoolean>;
    priceCents: z.ZodNumber;
    mediaFiles: z.ZodDefault<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodString]>>>;
    previews: z.ZodDefault<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodString]>>>;
    rfTag: z.ZodDefault<z.ZodArray<z.ZodString>>;
    rfGuest: z.ZodDefault<z.ZodArray<z.ZodString>>;
    rfPartner: z.ZodDefault<z.ZodArray<z.ZodString>>;
    isForward: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"account_drm_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"account_drm_update">;
    pageId: z.ZodNumber;
    enabled: z.ZodBoolean;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"username_availability_read">;
    pageId: z.ZodNumber;
    username: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"social_buttons_reorder">;
    pageId: z.ZodNumber;
    buttonIds: z.ZodArray<z.ZodString>;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"social_buttons_read">;
    pageId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"social_button_create">;
    pageId: z.ZodNumber;
    label: z.ZodString;
    type: z.ZodEnum<{
        snapchat: "snapchat";
        tiktok: "tiktok";
        instagram: "instagram";
        x: "x";
        facebook: "facebook";
        youtube: "youtube";
        amazon: "amazon";
        twitch: "twitch";
        discord: "discord";
        patreon: "patreon";
        pinterest: "pinterest";
        etsy: "etsy";
        bereal: "bereal";
        kick: "kick";
        depop: "depop";
        poshmark: "poshmark";
        vsco: "vsco";
        threads: "threads";
        throne: "throne";
        shopltk: "shopltk";
        oftv: "oftv";
        bluesky: "bluesky";
    }>;
    value: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"social_button_update">;
    pageId: z.ZodNumber;
    buttonId: z.ZodString;
    label: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"social_button_delete">;
    pageId: z.ZodNumber;
    buttonId: z.ZodString;
}, z.core.$strict>]>;
export type OfapiAccountAction = z.infer<typeof ofapiAccountActionSchema>;
