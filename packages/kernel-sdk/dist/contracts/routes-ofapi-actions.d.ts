import { z } from "zod";
export declare const ofapiActionRouteSchemas: {
    readonly ofapiActionPrepare: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Prepare a typed account action without vendor execution";
        readonly body: z.ZodObject<{
            id: z.ZodString;
            command: z.ZodUnion<readonly [z.ZodObject<{
                action: z.ZodLiteral<"user_list_create">;
                pageId: z.ZodNumber;
                name: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"user_list_update">;
                pageId: z.ZodNumber;
                listId: z.ZodString;
                name: z.ZodString;
                isPinnedToFeed: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"user_list_delete">;
                pageId: z.ZodNumber;
                listId: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"user_list_add_users">;
                pageId: z.ZodNumber;
                listId: z.ZodString;
                ids: z.ZodArray<z.ZodString>;
                skip_invalid: z.ZodOptional<z.ZodBoolean>;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"user_list_clear">;
                pageId: z.ZodNumber;
                listId: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"user_list_remove_user">;
                pageId: z.ZodNumber;
                listId: z.ZodString;
                userId: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"user_list_pin_toggle">;
                pageId: z.ZodNumber;
                listId: z.ZodString;
                userId: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"vault_list_create">;
                pageId: z.ZodNumber;
                name: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"vault_list_update">;
                pageId: z.ZodNumber;
                listId: z.ZodString;
                name: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"vault_list_delete">;
                pageId: z.ZodNumber;
                listId: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"vault_list_add_media">;
                pageId: z.ZodNumber;
                listId: z.ZodString;
                mediaIds: z.ZodArray<z.ZodString>;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"vault_list_remove_media">;
                pageId: z.ZodNumber;
                listId: z.ZodString;
                mediaIds: z.ZodArray<z.ZodString>;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"vault_media_delete">;
                pageId: z.ZodNumber;
                mediaIds: z.ZodArray<z.ZodString>;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"user_block">;
                pageId: z.ZodNumber;
                userId: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"user_unblock">;
                pageId: z.ZodNumber;
                userId: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"user_restrict">;
                pageId: z.ZodNumber;
                userId: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"user_unrestrict">;
                pageId: z.ZodNumber;
                userId: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"fan_notes_get">;
                pageId: z.ZodNumber;
                fanId: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"fan_notes_update">;
                pageId: z.ZodNumber;
                fanId: z.ZodString;
                notes: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"fan_notes_clear">;
                pageId: z.ZodNumber;
                fanId: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                previews: z.ZodOptional<z.ZodArray<z.ZodString>>;
                labelIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
                rfTag: z.ZodOptional<z.ZodArray<z.ZodString>>;
                expireDays: z.ZodOptional<z.ZodNumber>;
                fundRaisingTargetCents: z.ZodOptional<z.ZodNumber>;
                fundRaisingTipsPresetCents: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                votingType: z.ZodOptional<z.ZodEnum<{
                    poll: "poll";
                    quiz: "quiz";
                }>>;
                votingDue: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<3>, z.ZodLiteral<7>, z.ZodLiteral<30>]>>;
                votingOptions: z.ZodOptional<z.ZodArray<z.ZodString>>;
                votingCorrectIndex: z.ZodOptional<z.ZodNumber>;
                text: z.ZodString;
                mediaFiles: z.ZodOptional<z.ZodArray<z.ZodString>>;
                scheduledDate: z.ZodOptional<z.ZodISODateTime>;
                saveForLater: z.ZodOptional<z.ZodBoolean>;
                blockBannedWords: z.ZodOptional<z.ZodEnum<{
                    risky: "risky";
                    strict_ban: "strict_ban";
                    replace_soften: "replace_soften";
                }>>;
                reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                action: z.ZodLiteral<"post_create">;
                pageId: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                priceCents: z.ZodOptional<z.ZodNumber>;
                labelIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
                rfTag: z.ZodOptional<z.ZodArray<z.ZodString>>;
                expireDays: z.ZodOptional<z.ZodNumber>;
                fundRaisingTargetCents: z.ZodOptional<z.ZodNumber>;
                fundRaisingTipsPresetCents: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                votingType: z.ZodOptional<z.ZodEnum<{
                    poll: "poll";
                    quiz: "quiz";
                }>>;
                votingDue: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<3>, z.ZodLiteral<7>, z.ZodLiteral<30>]>>;
                votingOptions: z.ZodOptional<z.ZodArray<z.ZodString>>;
                votingCorrectIndex: z.ZodOptional<z.ZodNumber>;
                text: z.ZodString;
                mediaFiles: z.ZodOptional<z.ZodArray<z.ZodString>>;
                scheduledDate: z.ZodOptional<z.ZodISODateTime>;
                saveForLater: z.ZodOptional<z.ZodBoolean>;
                blockBannedWords: z.ZodOptional<z.ZodEnum<{
                    risky: "risky";
                    strict_ban: "strict_ban";
                    replace_soften: "replace_soften";
                }>>;
                reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                action: z.ZodLiteral<"post_update">;
                postId: z.ZodString;
                pageId: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"post_delete">;
                postId: z.ZodString;
                pageId: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"post_archive">;
                postId: z.ZodString;
                pageId: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"post_unarchive">;
                postId: z.ZodString;
                pageId: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"post_toggle_pin">;
                postId: z.ZodString;
                pageId: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"post_label_create">;
                name: z.ZodString;
                pageId: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"post_comment_create">;
                postId: z.ZodString;
                text: z.ZodString;
                answerTo: z.ZodOptional<z.ZodString>;
                giphyId: z.ZodOptional<z.ZodString>;
                pageId: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"post_comment_delete">;
                postId: z.ZodString;
                commentId: z.ZodString;
                pageId: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"post_comment_pin">;
                postId: z.ZodString;
                commentId: z.ZodString;
                pageId: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"post_comment_unpin">;
                postId: z.ZodString;
                commentId: z.ZodString;
                pageId: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"post_comment_like">;
                postId: z.ZodString;
                commentId: z.ZodString;
                pageId: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"post_comment_unlike">;
                postId: z.ZodString;
                commentId: z.ZodString;
                pageId: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"story_create">;
                mediaFiles: z.ZodArray<z.ZodString>;
                reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                texts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    text: z.ZodString;
                    type: z.ZodOptional<z.ZodEnum<{
                        text: "text";
                        mention: "mention";
                    }>>;
                    fontFamily: z.ZodOptional<z.ZodEnum<{
                        Roboto: "Roboto";
                        PTMono: "PTMono";
                        ShantellSans: "ShantellSans";
                        SofiaSans: "SofiaSans";
                        YanoneKaffeesatz: "YanoneKaffeesatz";
                        RubikMedium: "RubikMedium";
                        RubikBlack: "RubikBlack";
                    }>>;
                    fontWeight: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<400>, z.ZodLiteral<500>, z.ZodLiteral<700>]>>;
                    fontSize: z.ZodOptional<z.ZodNumber>;
                    color: z.ZodOptional<z.ZodString>;
                    bgColor: z.ZodOptional<z.ZodString>;
                    textAlign: z.ZodOptional<z.ZodEnum<{
                        left: "left";
                        center: "center";
                        right: "right";
                    }>>;
                    left: z.ZodOptional<z.ZodNumber>;
                    top: z.ZodOptional<z.ZodNumber>;
                    angle: z.ZodOptional<z.ZodNumber>;
                    scale: z.ZodOptional<z.ZodNumber>;
                    zIndex: z.ZodOptional<z.ZodNumber>;
                    textWidth: z.ZodOptional<z.ZodNumber>;
                    textHeight: z.ZodOptional<z.ZodNumber>;
                }, z.core.$strict>>>;
                questionText: z.ZodOptional<z.ZodString>;
                questionColor: z.ZodOptional<z.ZodString>;
                questionLeft: z.ZodOptional<z.ZodNumber>;
                questionTop: z.ZodOptional<z.ZodNumber>;
                questionWidth: z.ZodOptional<z.ZodNumber>;
                questionHeight: z.ZodOptional<z.ZodNumber>;
                canvasWidth: z.ZodOptional<z.ZodNumber>;
                canvasHeight: z.ZodOptional<z.ZodNumber>;
                pageId: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"story_delete">;
                storyId: z.ZodString;
                pageId: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"story_mark_watched">;
                storyId: z.ZodString;
                pageId: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                title: z.ZodString;
                coverStoryId: z.ZodString;
                storyIds: z.ZodArray<z.ZodString>;
                action: z.ZodLiteral<"highlight_create">;
                pageId: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                title: z.ZodString;
                coverStoryId: z.ZodString;
                storyIds: z.ZodArray<z.ZodString>;
                action: z.ZodLiteral<"highlight_update">;
                highlightId: z.ZodString;
                pageId: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"highlight_delete">;
                highlightId: z.ZodString;
                pageId: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"highlight_add_story">;
                highlightId: z.ZodString;
                storyId: z.ZodString;
                pageId: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"highlight_remove_story">;
                highlightId: z.ZodString;
                storyId: z.ZodString;
                pageId: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                excludedLists: z.ZodOptional<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodEnum<{
                    fans: "fans";
                    recent: "recent";
                    following: "following";
                    rebill_off: "rebill_off";
                    tagged: "tagged";
                }>]>>>;
                subscribedWithinLastDays: z.ZodOptional<z.ZodNumber>;
                rfTag: z.ZodOptional<z.ZodArray<z.ZodString>>;
                rfPartner: z.ZodOptional<z.ZodArray<z.ZodString>>;
                rfGuest: z.ZodOptional<z.ZodArray<z.ZodString>>;
                userLists: z.ZodOptional<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodEnum<{
                    fans: "fans";
                    recent: "recent";
                    following: "following";
                    rebill_off: "rebill_off";
                    tagged: "tagged";
                }>]>>>;
                userIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
                lockedText: z.ZodOptional<z.ZodBoolean>;
                priceCents: z.ZodOptional<z.ZodNumber>;
                previews: z.ZodOptional<z.ZodArray<z.ZodString>>;
                giphyId: z.ZodOptional<z.ZodString>;
                text: z.ZodString;
                mediaFiles: z.ZodOptional<z.ZodArray<z.ZodString>>;
                scheduledDate: z.ZodOptional<z.ZodISODateTime>;
                saveForLater: z.ZodOptional<z.ZodBoolean>;
                blockBannedWords: z.ZodOptional<z.ZodEnum<{
                    risky: "risky";
                    strict_ban: "strict_ban";
                    replace_soften: "replace_soften";
                }>>;
                reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                action: z.ZodLiteral<"campaign_create">;
                pageId: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                saveForLater: z.ZodOptional<z.ZodNever>;
                userLists: z.ZodOptional<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodEnum<{
                    fans: "fans";
                    recent: "recent";
                    following: "following";
                    rebill_off: "rebill_off";
                    tagged: "tagged";
                }>]>>>;
                userIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
                lockedText: z.ZodOptional<z.ZodBoolean>;
                priceCents: z.ZodOptional<z.ZodNumber>;
                previews: z.ZodOptional<z.ZodArray<z.ZodString>>;
                giphyId: z.ZodOptional<z.ZodString>;
                text: z.ZodString;
                mediaFiles: z.ZodOptional<z.ZodArray<z.ZodString>>;
                scheduledDate: z.ZodOptional<z.ZodISODateTime>;
                blockBannedWords: z.ZodOptional<z.ZodEnum<{
                    risky: "risky";
                    strict_ban: "strict_ban";
                    replace_soften: "replace_soften";
                }>>;
                reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                action: z.ZodLiteral<"campaign_update">;
                campaignId: z.ZodString;
                pageId: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"campaign_cancel">;
                campaignId: z.ZodString;
                pageId: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                limit: z.ZodOptional<z.ZodNumber>;
                types: z.ZodOptional<z.ZodArray<z.ZodEnum<{
                    post: "post";
                    chat: "chat";
                }>>>;
                publishDateStart: z.ZodISODate;
                publishDateEnd: z.ZodISODate;
                timezone: z.ZodString;
                action: z.ZodLiteral<"queue_list">;
                pageId: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                publishDateStart: z.ZodISODate;
                publishDateEnd: z.ZodISODate;
                timezone: z.ZodString;
                action: z.ZodLiteral<"queue_counts">;
                pageId: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodLiteral<"queue_publish">;
                queueId: z.ZodString;
                pageId: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
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
        }, z.core.$strict>;
        readonly response: {
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 503: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 200: z.ZodObject<{
                id: z.ZodString;
                pageId: z.ZodNumber;
                pageLabel: z.ZodString;
                accountId: z.ZodString;
                action: z.ZodString;
                command: z.ZodUnion<readonly [z.ZodObject<{
                    action: z.ZodLiteral<"user_list_create">;
                    pageId: z.ZodNumber;
                    name: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_list_update">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    name: z.ZodString;
                    isPinnedToFeed: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_list_delete">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_list_add_users">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    ids: z.ZodArray<z.ZodString>;
                    skip_invalid: z.ZodOptional<z.ZodBoolean>;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_list_clear">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_list_remove_user">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    userId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_list_pin_toggle">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    userId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"vault_list_create">;
                    pageId: z.ZodNumber;
                    name: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"vault_list_update">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    name: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"vault_list_delete">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"vault_list_add_media">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    mediaIds: z.ZodArray<z.ZodString>;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"vault_list_remove_media">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    mediaIds: z.ZodArray<z.ZodString>;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"vault_media_delete">;
                    pageId: z.ZodNumber;
                    mediaIds: z.ZodArray<z.ZodString>;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_block">;
                    pageId: z.ZodNumber;
                    userId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_unblock">;
                    pageId: z.ZodNumber;
                    userId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_restrict">;
                    pageId: z.ZodNumber;
                    userId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_unrestrict">;
                    pageId: z.ZodNumber;
                    userId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"fan_notes_get">;
                    pageId: z.ZodNumber;
                    fanId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"fan_notes_update">;
                    pageId: z.ZodNumber;
                    fanId: z.ZodString;
                    notes: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"fan_notes_clear">;
                    pageId: z.ZodNumber;
                    fanId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    previews: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    labelIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    rfTag: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    expireDays: z.ZodOptional<z.ZodNumber>;
                    fundRaisingTargetCents: z.ZodOptional<z.ZodNumber>;
                    fundRaisingTipsPresetCents: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                    votingType: z.ZodOptional<z.ZodEnum<{
                        poll: "poll";
                        quiz: "quiz";
                    }>>;
                    votingDue: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<3>, z.ZodLiteral<7>, z.ZodLiteral<30>]>>;
                    votingOptions: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    votingCorrectIndex: z.ZodOptional<z.ZodNumber>;
                    text: z.ZodString;
                    mediaFiles: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    scheduledDate: z.ZodOptional<z.ZodISODateTime>;
                    saveForLater: z.ZodOptional<z.ZodBoolean>;
                    blockBannedWords: z.ZodOptional<z.ZodEnum<{
                        risky: "risky";
                        strict_ban: "strict_ban";
                        replace_soften: "replace_soften";
                    }>>;
                    reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                    action: z.ZodLiteral<"post_create">;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    priceCents: z.ZodOptional<z.ZodNumber>;
                    labelIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    rfTag: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    expireDays: z.ZodOptional<z.ZodNumber>;
                    fundRaisingTargetCents: z.ZodOptional<z.ZodNumber>;
                    fundRaisingTipsPresetCents: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                    votingType: z.ZodOptional<z.ZodEnum<{
                        poll: "poll";
                        quiz: "quiz";
                    }>>;
                    votingDue: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<3>, z.ZodLiteral<7>, z.ZodLiteral<30>]>>;
                    votingOptions: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    votingCorrectIndex: z.ZodOptional<z.ZodNumber>;
                    text: z.ZodString;
                    mediaFiles: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    scheduledDate: z.ZodOptional<z.ZodISODateTime>;
                    saveForLater: z.ZodOptional<z.ZodBoolean>;
                    blockBannedWords: z.ZodOptional<z.ZodEnum<{
                        risky: "risky";
                        strict_ban: "strict_ban";
                        replace_soften: "replace_soften";
                    }>>;
                    reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                    action: z.ZodLiteral<"post_update">;
                    postId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_delete">;
                    postId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_archive">;
                    postId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_unarchive">;
                    postId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_toggle_pin">;
                    postId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_label_create">;
                    name: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_comment_create">;
                    postId: z.ZodString;
                    text: z.ZodString;
                    answerTo: z.ZodOptional<z.ZodString>;
                    giphyId: z.ZodOptional<z.ZodString>;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_comment_delete">;
                    postId: z.ZodString;
                    commentId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_comment_pin">;
                    postId: z.ZodString;
                    commentId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_comment_unpin">;
                    postId: z.ZodString;
                    commentId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_comment_like">;
                    postId: z.ZodString;
                    commentId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_comment_unlike">;
                    postId: z.ZodString;
                    commentId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"story_create">;
                    mediaFiles: z.ZodArray<z.ZodString>;
                    reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                    texts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                        text: z.ZodString;
                        type: z.ZodOptional<z.ZodEnum<{
                            text: "text";
                            mention: "mention";
                        }>>;
                        fontFamily: z.ZodOptional<z.ZodEnum<{
                            Roboto: "Roboto";
                            PTMono: "PTMono";
                            ShantellSans: "ShantellSans";
                            SofiaSans: "SofiaSans";
                            YanoneKaffeesatz: "YanoneKaffeesatz";
                            RubikMedium: "RubikMedium";
                            RubikBlack: "RubikBlack";
                        }>>;
                        fontWeight: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<400>, z.ZodLiteral<500>, z.ZodLiteral<700>]>>;
                        fontSize: z.ZodOptional<z.ZodNumber>;
                        color: z.ZodOptional<z.ZodString>;
                        bgColor: z.ZodOptional<z.ZodString>;
                        textAlign: z.ZodOptional<z.ZodEnum<{
                            left: "left";
                            center: "center";
                            right: "right";
                        }>>;
                        left: z.ZodOptional<z.ZodNumber>;
                        top: z.ZodOptional<z.ZodNumber>;
                        angle: z.ZodOptional<z.ZodNumber>;
                        scale: z.ZodOptional<z.ZodNumber>;
                        zIndex: z.ZodOptional<z.ZodNumber>;
                        textWidth: z.ZodOptional<z.ZodNumber>;
                        textHeight: z.ZodOptional<z.ZodNumber>;
                    }, z.core.$strict>>>;
                    questionText: z.ZodOptional<z.ZodString>;
                    questionColor: z.ZodOptional<z.ZodString>;
                    questionLeft: z.ZodOptional<z.ZodNumber>;
                    questionTop: z.ZodOptional<z.ZodNumber>;
                    questionWidth: z.ZodOptional<z.ZodNumber>;
                    questionHeight: z.ZodOptional<z.ZodNumber>;
                    canvasWidth: z.ZodOptional<z.ZodNumber>;
                    canvasHeight: z.ZodOptional<z.ZodNumber>;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"story_delete">;
                    storyId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"story_mark_watched">;
                    storyId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    title: z.ZodString;
                    coverStoryId: z.ZodString;
                    storyIds: z.ZodArray<z.ZodString>;
                    action: z.ZodLiteral<"highlight_create">;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    title: z.ZodString;
                    coverStoryId: z.ZodString;
                    storyIds: z.ZodArray<z.ZodString>;
                    action: z.ZodLiteral<"highlight_update">;
                    highlightId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"highlight_delete">;
                    highlightId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"highlight_add_story">;
                    highlightId: z.ZodString;
                    storyId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"highlight_remove_story">;
                    highlightId: z.ZodString;
                    storyId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    excludedLists: z.ZodOptional<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodEnum<{
                        fans: "fans";
                        recent: "recent";
                        following: "following";
                        rebill_off: "rebill_off";
                        tagged: "tagged";
                    }>]>>>;
                    subscribedWithinLastDays: z.ZodOptional<z.ZodNumber>;
                    rfTag: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    rfPartner: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    rfGuest: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    userLists: z.ZodOptional<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodEnum<{
                        fans: "fans";
                        recent: "recent";
                        following: "following";
                        rebill_off: "rebill_off";
                        tagged: "tagged";
                    }>]>>>;
                    userIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    lockedText: z.ZodOptional<z.ZodBoolean>;
                    priceCents: z.ZodOptional<z.ZodNumber>;
                    previews: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    giphyId: z.ZodOptional<z.ZodString>;
                    text: z.ZodString;
                    mediaFiles: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    scheduledDate: z.ZodOptional<z.ZodISODateTime>;
                    saveForLater: z.ZodOptional<z.ZodBoolean>;
                    blockBannedWords: z.ZodOptional<z.ZodEnum<{
                        risky: "risky";
                        strict_ban: "strict_ban";
                        replace_soften: "replace_soften";
                    }>>;
                    reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                    action: z.ZodLiteral<"campaign_create">;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    saveForLater: z.ZodOptional<z.ZodNever>;
                    userLists: z.ZodOptional<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodEnum<{
                        fans: "fans";
                        recent: "recent";
                        following: "following";
                        rebill_off: "rebill_off";
                        tagged: "tagged";
                    }>]>>>;
                    userIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    lockedText: z.ZodOptional<z.ZodBoolean>;
                    priceCents: z.ZodOptional<z.ZodNumber>;
                    previews: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    giphyId: z.ZodOptional<z.ZodString>;
                    text: z.ZodString;
                    mediaFiles: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    scheduledDate: z.ZodOptional<z.ZodISODateTime>;
                    blockBannedWords: z.ZodOptional<z.ZodEnum<{
                        risky: "risky";
                        strict_ban: "strict_ban";
                        replace_soften: "replace_soften";
                    }>>;
                    reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                    action: z.ZodLiteral<"campaign_update">;
                    campaignId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"campaign_cancel">;
                    campaignId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    limit: z.ZodOptional<z.ZodNumber>;
                    types: z.ZodOptional<z.ZodArray<z.ZodEnum<{
                        post: "post";
                        chat: "chat";
                    }>>>;
                    publishDateStart: z.ZodISODate;
                    publishDateEnd: z.ZodISODate;
                    timezone: z.ZodString;
                    action: z.ZodLiteral<"queue_list">;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    publishDateStart: z.ZodISODate;
                    publishDateEnd: z.ZodISODate;
                    timezone: z.ZodString;
                    action: z.ZodLiteral<"queue_counts">;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"queue_publish">;
                    queueId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
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
                state: z.ZodEnum<{
                    cancelled: "cancelled";
                    partial: "partial";
                    rejected: "rejected";
                    prepared: "prepared";
                    dispatching: "dispatching";
                    confirmed: "confirmed";
                    indeterminate: "indeterminate";
                }>;
                estimatedCredits: z.ZodNumber;
                actualCredits: z.ZodNullable<z.ZodNumber>;
                remoteId: z.ZodNullable<z.ZodString>;
                responseData: z.ZodNullable<z.ZodUnknown>;
                responseMeta: z.ZodNullable<z.ZodUnknown>;
                errorCode: z.ZodNullable<z.ZodString>;
                responseObservationId: z.ZodNullable<z.ZodNumber>;
                accountingState: z.ZodEnum<{
                    pending: "pending";
                    complete: "complete";
                }>;
                createdAt: z.ZodString;
            }, z.core.$strip>;
        };
    };
    readonly ofapiActionDispatch: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Execute the frozen account action once";
        readonly params: z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{}, z.core.$strict>;
        readonly response: {
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 503: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 200: z.ZodObject<{
                id: z.ZodString;
                pageId: z.ZodNumber;
                pageLabel: z.ZodString;
                accountId: z.ZodString;
                action: z.ZodString;
                command: z.ZodUnion<readonly [z.ZodObject<{
                    action: z.ZodLiteral<"user_list_create">;
                    pageId: z.ZodNumber;
                    name: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_list_update">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    name: z.ZodString;
                    isPinnedToFeed: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_list_delete">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_list_add_users">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    ids: z.ZodArray<z.ZodString>;
                    skip_invalid: z.ZodOptional<z.ZodBoolean>;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_list_clear">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_list_remove_user">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    userId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_list_pin_toggle">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    userId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"vault_list_create">;
                    pageId: z.ZodNumber;
                    name: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"vault_list_update">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    name: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"vault_list_delete">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"vault_list_add_media">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    mediaIds: z.ZodArray<z.ZodString>;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"vault_list_remove_media">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    mediaIds: z.ZodArray<z.ZodString>;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"vault_media_delete">;
                    pageId: z.ZodNumber;
                    mediaIds: z.ZodArray<z.ZodString>;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_block">;
                    pageId: z.ZodNumber;
                    userId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_unblock">;
                    pageId: z.ZodNumber;
                    userId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_restrict">;
                    pageId: z.ZodNumber;
                    userId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_unrestrict">;
                    pageId: z.ZodNumber;
                    userId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"fan_notes_get">;
                    pageId: z.ZodNumber;
                    fanId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"fan_notes_update">;
                    pageId: z.ZodNumber;
                    fanId: z.ZodString;
                    notes: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"fan_notes_clear">;
                    pageId: z.ZodNumber;
                    fanId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    previews: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    labelIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    rfTag: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    expireDays: z.ZodOptional<z.ZodNumber>;
                    fundRaisingTargetCents: z.ZodOptional<z.ZodNumber>;
                    fundRaisingTipsPresetCents: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                    votingType: z.ZodOptional<z.ZodEnum<{
                        poll: "poll";
                        quiz: "quiz";
                    }>>;
                    votingDue: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<3>, z.ZodLiteral<7>, z.ZodLiteral<30>]>>;
                    votingOptions: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    votingCorrectIndex: z.ZodOptional<z.ZodNumber>;
                    text: z.ZodString;
                    mediaFiles: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    scheduledDate: z.ZodOptional<z.ZodISODateTime>;
                    saveForLater: z.ZodOptional<z.ZodBoolean>;
                    blockBannedWords: z.ZodOptional<z.ZodEnum<{
                        risky: "risky";
                        strict_ban: "strict_ban";
                        replace_soften: "replace_soften";
                    }>>;
                    reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                    action: z.ZodLiteral<"post_create">;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    priceCents: z.ZodOptional<z.ZodNumber>;
                    labelIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    rfTag: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    expireDays: z.ZodOptional<z.ZodNumber>;
                    fundRaisingTargetCents: z.ZodOptional<z.ZodNumber>;
                    fundRaisingTipsPresetCents: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                    votingType: z.ZodOptional<z.ZodEnum<{
                        poll: "poll";
                        quiz: "quiz";
                    }>>;
                    votingDue: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<3>, z.ZodLiteral<7>, z.ZodLiteral<30>]>>;
                    votingOptions: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    votingCorrectIndex: z.ZodOptional<z.ZodNumber>;
                    text: z.ZodString;
                    mediaFiles: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    scheduledDate: z.ZodOptional<z.ZodISODateTime>;
                    saveForLater: z.ZodOptional<z.ZodBoolean>;
                    blockBannedWords: z.ZodOptional<z.ZodEnum<{
                        risky: "risky";
                        strict_ban: "strict_ban";
                        replace_soften: "replace_soften";
                    }>>;
                    reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                    action: z.ZodLiteral<"post_update">;
                    postId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_delete">;
                    postId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_archive">;
                    postId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_unarchive">;
                    postId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_toggle_pin">;
                    postId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_label_create">;
                    name: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_comment_create">;
                    postId: z.ZodString;
                    text: z.ZodString;
                    answerTo: z.ZodOptional<z.ZodString>;
                    giphyId: z.ZodOptional<z.ZodString>;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_comment_delete">;
                    postId: z.ZodString;
                    commentId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_comment_pin">;
                    postId: z.ZodString;
                    commentId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_comment_unpin">;
                    postId: z.ZodString;
                    commentId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_comment_like">;
                    postId: z.ZodString;
                    commentId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_comment_unlike">;
                    postId: z.ZodString;
                    commentId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"story_create">;
                    mediaFiles: z.ZodArray<z.ZodString>;
                    reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                    texts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                        text: z.ZodString;
                        type: z.ZodOptional<z.ZodEnum<{
                            text: "text";
                            mention: "mention";
                        }>>;
                        fontFamily: z.ZodOptional<z.ZodEnum<{
                            Roboto: "Roboto";
                            PTMono: "PTMono";
                            ShantellSans: "ShantellSans";
                            SofiaSans: "SofiaSans";
                            YanoneKaffeesatz: "YanoneKaffeesatz";
                            RubikMedium: "RubikMedium";
                            RubikBlack: "RubikBlack";
                        }>>;
                        fontWeight: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<400>, z.ZodLiteral<500>, z.ZodLiteral<700>]>>;
                        fontSize: z.ZodOptional<z.ZodNumber>;
                        color: z.ZodOptional<z.ZodString>;
                        bgColor: z.ZodOptional<z.ZodString>;
                        textAlign: z.ZodOptional<z.ZodEnum<{
                            left: "left";
                            center: "center";
                            right: "right";
                        }>>;
                        left: z.ZodOptional<z.ZodNumber>;
                        top: z.ZodOptional<z.ZodNumber>;
                        angle: z.ZodOptional<z.ZodNumber>;
                        scale: z.ZodOptional<z.ZodNumber>;
                        zIndex: z.ZodOptional<z.ZodNumber>;
                        textWidth: z.ZodOptional<z.ZodNumber>;
                        textHeight: z.ZodOptional<z.ZodNumber>;
                    }, z.core.$strict>>>;
                    questionText: z.ZodOptional<z.ZodString>;
                    questionColor: z.ZodOptional<z.ZodString>;
                    questionLeft: z.ZodOptional<z.ZodNumber>;
                    questionTop: z.ZodOptional<z.ZodNumber>;
                    questionWidth: z.ZodOptional<z.ZodNumber>;
                    questionHeight: z.ZodOptional<z.ZodNumber>;
                    canvasWidth: z.ZodOptional<z.ZodNumber>;
                    canvasHeight: z.ZodOptional<z.ZodNumber>;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"story_delete">;
                    storyId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"story_mark_watched">;
                    storyId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    title: z.ZodString;
                    coverStoryId: z.ZodString;
                    storyIds: z.ZodArray<z.ZodString>;
                    action: z.ZodLiteral<"highlight_create">;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    title: z.ZodString;
                    coverStoryId: z.ZodString;
                    storyIds: z.ZodArray<z.ZodString>;
                    action: z.ZodLiteral<"highlight_update">;
                    highlightId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"highlight_delete">;
                    highlightId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"highlight_add_story">;
                    highlightId: z.ZodString;
                    storyId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"highlight_remove_story">;
                    highlightId: z.ZodString;
                    storyId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    excludedLists: z.ZodOptional<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodEnum<{
                        fans: "fans";
                        recent: "recent";
                        following: "following";
                        rebill_off: "rebill_off";
                        tagged: "tagged";
                    }>]>>>;
                    subscribedWithinLastDays: z.ZodOptional<z.ZodNumber>;
                    rfTag: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    rfPartner: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    rfGuest: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    userLists: z.ZodOptional<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodEnum<{
                        fans: "fans";
                        recent: "recent";
                        following: "following";
                        rebill_off: "rebill_off";
                        tagged: "tagged";
                    }>]>>>;
                    userIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    lockedText: z.ZodOptional<z.ZodBoolean>;
                    priceCents: z.ZodOptional<z.ZodNumber>;
                    previews: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    giphyId: z.ZodOptional<z.ZodString>;
                    text: z.ZodString;
                    mediaFiles: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    scheduledDate: z.ZodOptional<z.ZodISODateTime>;
                    saveForLater: z.ZodOptional<z.ZodBoolean>;
                    blockBannedWords: z.ZodOptional<z.ZodEnum<{
                        risky: "risky";
                        strict_ban: "strict_ban";
                        replace_soften: "replace_soften";
                    }>>;
                    reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                    action: z.ZodLiteral<"campaign_create">;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    saveForLater: z.ZodOptional<z.ZodNever>;
                    userLists: z.ZodOptional<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodEnum<{
                        fans: "fans";
                        recent: "recent";
                        following: "following";
                        rebill_off: "rebill_off";
                        tagged: "tagged";
                    }>]>>>;
                    userIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    lockedText: z.ZodOptional<z.ZodBoolean>;
                    priceCents: z.ZodOptional<z.ZodNumber>;
                    previews: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    giphyId: z.ZodOptional<z.ZodString>;
                    text: z.ZodString;
                    mediaFiles: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    scheduledDate: z.ZodOptional<z.ZodISODateTime>;
                    blockBannedWords: z.ZodOptional<z.ZodEnum<{
                        risky: "risky";
                        strict_ban: "strict_ban";
                        replace_soften: "replace_soften";
                    }>>;
                    reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                    action: z.ZodLiteral<"campaign_update">;
                    campaignId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"campaign_cancel">;
                    campaignId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    limit: z.ZodOptional<z.ZodNumber>;
                    types: z.ZodOptional<z.ZodArray<z.ZodEnum<{
                        post: "post";
                        chat: "chat";
                    }>>>;
                    publishDateStart: z.ZodISODate;
                    publishDateEnd: z.ZodISODate;
                    timezone: z.ZodString;
                    action: z.ZodLiteral<"queue_list">;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    publishDateStart: z.ZodISODate;
                    publishDateEnd: z.ZodISODate;
                    timezone: z.ZodString;
                    action: z.ZodLiteral<"queue_counts">;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"queue_publish">;
                    queueId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
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
                state: z.ZodEnum<{
                    cancelled: "cancelled";
                    partial: "partial";
                    rejected: "rejected";
                    prepared: "prepared";
                    dispatching: "dispatching";
                    confirmed: "confirmed";
                    indeterminate: "indeterminate";
                }>;
                estimatedCredits: z.ZodNumber;
                actualCredits: z.ZodNullable<z.ZodNumber>;
                remoteId: z.ZodNullable<z.ZodString>;
                responseData: z.ZodNullable<z.ZodUnknown>;
                responseMeta: z.ZodNullable<z.ZodUnknown>;
                errorCode: z.ZodNullable<z.ZodString>;
                responseObservationId: z.ZodNullable<z.ZodNumber>;
                accountingState: z.ZodEnum<{
                    pending: "pending";
                    complete: "complete";
                }>;
                createdAt: z.ZodString;
            }, z.core.$strip>;
        };
    };
    readonly ofapiActionCancel: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Cancel a prepared account action locally";
        readonly params: z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{}, z.core.$strict>;
        readonly response: {
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 503: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 200: z.ZodObject<{
                id: z.ZodString;
                pageId: z.ZodNumber;
                pageLabel: z.ZodString;
                accountId: z.ZodString;
                action: z.ZodString;
                command: z.ZodUnion<readonly [z.ZodObject<{
                    action: z.ZodLiteral<"user_list_create">;
                    pageId: z.ZodNumber;
                    name: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_list_update">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    name: z.ZodString;
                    isPinnedToFeed: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_list_delete">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_list_add_users">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    ids: z.ZodArray<z.ZodString>;
                    skip_invalid: z.ZodOptional<z.ZodBoolean>;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_list_clear">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_list_remove_user">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    userId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_list_pin_toggle">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    userId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"vault_list_create">;
                    pageId: z.ZodNumber;
                    name: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"vault_list_update">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    name: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"vault_list_delete">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"vault_list_add_media">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    mediaIds: z.ZodArray<z.ZodString>;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"vault_list_remove_media">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    mediaIds: z.ZodArray<z.ZodString>;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"vault_media_delete">;
                    pageId: z.ZodNumber;
                    mediaIds: z.ZodArray<z.ZodString>;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_block">;
                    pageId: z.ZodNumber;
                    userId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_unblock">;
                    pageId: z.ZodNumber;
                    userId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_restrict">;
                    pageId: z.ZodNumber;
                    userId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_unrestrict">;
                    pageId: z.ZodNumber;
                    userId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"fan_notes_get">;
                    pageId: z.ZodNumber;
                    fanId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"fan_notes_update">;
                    pageId: z.ZodNumber;
                    fanId: z.ZodString;
                    notes: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"fan_notes_clear">;
                    pageId: z.ZodNumber;
                    fanId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    previews: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    labelIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    rfTag: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    expireDays: z.ZodOptional<z.ZodNumber>;
                    fundRaisingTargetCents: z.ZodOptional<z.ZodNumber>;
                    fundRaisingTipsPresetCents: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                    votingType: z.ZodOptional<z.ZodEnum<{
                        poll: "poll";
                        quiz: "quiz";
                    }>>;
                    votingDue: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<3>, z.ZodLiteral<7>, z.ZodLiteral<30>]>>;
                    votingOptions: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    votingCorrectIndex: z.ZodOptional<z.ZodNumber>;
                    text: z.ZodString;
                    mediaFiles: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    scheduledDate: z.ZodOptional<z.ZodISODateTime>;
                    saveForLater: z.ZodOptional<z.ZodBoolean>;
                    blockBannedWords: z.ZodOptional<z.ZodEnum<{
                        risky: "risky";
                        strict_ban: "strict_ban";
                        replace_soften: "replace_soften";
                    }>>;
                    reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                    action: z.ZodLiteral<"post_create">;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    priceCents: z.ZodOptional<z.ZodNumber>;
                    labelIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    rfTag: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    expireDays: z.ZodOptional<z.ZodNumber>;
                    fundRaisingTargetCents: z.ZodOptional<z.ZodNumber>;
                    fundRaisingTipsPresetCents: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                    votingType: z.ZodOptional<z.ZodEnum<{
                        poll: "poll";
                        quiz: "quiz";
                    }>>;
                    votingDue: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<3>, z.ZodLiteral<7>, z.ZodLiteral<30>]>>;
                    votingOptions: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    votingCorrectIndex: z.ZodOptional<z.ZodNumber>;
                    text: z.ZodString;
                    mediaFiles: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    scheduledDate: z.ZodOptional<z.ZodISODateTime>;
                    saveForLater: z.ZodOptional<z.ZodBoolean>;
                    blockBannedWords: z.ZodOptional<z.ZodEnum<{
                        risky: "risky";
                        strict_ban: "strict_ban";
                        replace_soften: "replace_soften";
                    }>>;
                    reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                    action: z.ZodLiteral<"post_update">;
                    postId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_delete">;
                    postId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_archive">;
                    postId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_unarchive">;
                    postId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_toggle_pin">;
                    postId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_label_create">;
                    name: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_comment_create">;
                    postId: z.ZodString;
                    text: z.ZodString;
                    answerTo: z.ZodOptional<z.ZodString>;
                    giphyId: z.ZodOptional<z.ZodString>;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_comment_delete">;
                    postId: z.ZodString;
                    commentId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_comment_pin">;
                    postId: z.ZodString;
                    commentId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_comment_unpin">;
                    postId: z.ZodString;
                    commentId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_comment_like">;
                    postId: z.ZodString;
                    commentId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_comment_unlike">;
                    postId: z.ZodString;
                    commentId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"story_create">;
                    mediaFiles: z.ZodArray<z.ZodString>;
                    reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                    texts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                        text: z.ZodString;
                        type: z.ZodOptional<z.ZodEnum<{
                            text: "text";
                            mention: "mention";
                        }>>;
                        fontFamily: z.ZodOptional<z.ZodEnum<{
                            Roboto: "Roboto";
                            PTMono: "PTMono";
                            ShantellSans: "ShantellSans";
                            SofiaSans: "SofiaSans";
                            YanoneKaffeesatz: "YanoneKaffeesatz";
                            RubikMedium: "RubikMedium";
                            RubikBlack: "RubikBlack";
                        }>>;
                        fontWeight: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<400>, z.ZodLiteral<500>, z.ZodLiteral<700>]>>;
                        fontSize: z.ZodOptional<z.ZodNumber>;
                        color: z.ZodOptional<z.ZodString>;
                        bgColor: z.ZodOptional<z.ZodString>;
                        textAlign: z.ZodOptional<z.ZodEnum<{
                            left: "left";
                            center: "center";
                            right: "right";
                        }>>;
                        left: z.ZodOptional<z.ZodNumber>;
                        top: z.ZodOptional<z.ZodNumber>;
                        angle: z.ZodOptional<z.ZodNumber>;
                        scale: z.ZodOptional<z.ZodNumber>;
                        zIndex: z.ZodOptional<z.ZodNumber>;
                        textWidth: z.ZodOptional<z.ZodNumber>;
                        textHeight: z.ZodOptional<z.ZodNumber>;
                    }, z.core.$strict>>>;
                    questionText: z.ZodOptional<z.ZodString>;
                    questionColor: z.ZodOptional<z.ZodString>;
                    questionLeft: z.ZodOptional<z.ZodNumber>;
                    questionTop: z.ZodOptional<z.ZodNumber>;
                    questionWidth: z.ZodOptional<z.ZodNumber>;
                    questionHeight: z.ZodOptional<z.ZodNumber>;
                    canvasWidth: z.ZodOptional<z.ZodNumber>;
                    canvasHeight: z.ZodOptional<z.ZodNumber>;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"story_delete">;
                    storyId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"story_mark_watched">;
                    storyId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    title: z.ZodString;
                    coverStoryId: z.ZodString;
                    storyIds: z.ZodArray<z.ZodString>;
                    action: z.ZodLiteral<"highlight_create">;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    title: z.ZodString;
                    coverStoryId: z.ZodString;
                    storyIds: z.ZodArray<z.ZodString>;
                    action: z.ZodLiteral<"highlight_update">;
                    highlightId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"highlight_delete">;
                    highlightId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"highlight_add_story">;
                    highlightId: z.ZodString;
                    storyId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"highlight_remove_story">;
                    highlightId: z.ZodString;
                    storyId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    excludedLists: z.ZodOptional<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodEnum<{
                        fans: "fans";
                        recent: "recent";
                        following: "following";
                        rebill_off: "rebill_off";
                        tagged: "tagged";
                    }>]>>>;
                    subscribedWithinLastDays: z.ZodOptional<z.ZodNumber>;
                    rfTag: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    rfPartner: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    rfGuest: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    userLists: z.ZodOptional<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodEnum<{
                        fans: "fans";
                        recent: "recent";
                        following: "following";
                        rebill_off: "rebill_off";
                        tagged: "tagged";
                    }>]>>>;
                    userIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    lockedText: z.ZodOptional<z.ZodBoolean>;
                    priceCents: z.ZodOptional<z.ZodNumber>;
                    previews: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    giphyId: z.ZodOptional<z.ZodString>;
                    text: z.ZodString;
                    mediaFiles: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    scheduledDate: z.ZodOptional<z.ZodISODateTime>;
                    saveForLater: z.ZodOptional<z.ZodBoolean>;
                    blockBannedWords: z.ZodOptional<z.ZodEnum<{
                        risky: "risky";
                        strict_ban: "strict_ban";
                        replace_soften: "replace_soften";
                    }>>;
                    reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                    action: z.ZodLiteral<"campaign_create">;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    saveForLater: z.ZodOptional<z.ZodNever>;
                    userLists: z.ZodOptional<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodEnum<{
                        fans: "fans";
                        recent: "recent";
                        following: "following";
                        rebill_off: "rebill_off";
                        tagged: "tagged";
                    }>]>>>;
                    userIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    lockedText: z.ZodOptional<z.ZodBoolean>;
                    priceCents: z.ZodOptional<z.ZodNumber>;
                    previews: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    giphyId: z.ZodOptional<z.ZodString>;
                    text: z.ZodString;
                    mediaFiles: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    scheduledDate: z.ZodOptional<z.ZodISODateTime>;
                    blockBannedWords: z.ZodOptional<z.ZodEnum<{
                        risky: "risky";
                        strict_ban: "strict_ban";
                        replace_soften: "replace_soften";
                    }>>;
                    reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                    action: z.ZodLiteral<"campaign_update">;
                    campaignId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"campaign_cancel">;
                    campaignId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    limit: z.ZodOptional<z.ZodNumber>;
                    types: z.ZodOptional<z.ZodArray<z.ZodEnum<{
                        post: "post";
                        chat: "chat";
                    }>>>;
                    publishDateStart: z.ZodISODate;
                    publishDateEnd: z.ZodISODate;
                    timezone: z.ZodString;
                    action: z.ZodLiteral<"queue_list">;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    publishDateStart: z.ZodISODate;
                    publishDateEnd: z.ZodISODate;
                    timezone: z.ZodString;
                    action: z.ZodLiteral<"queue_counts">;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"queue_publish">;
                    queueId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
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
                state: z.ZodEnum<{
                    cancelled: "cancelled";
                    partial: "partial";
                    rejected: "rejected";
                    prepared: "prepared";
                    dispatching: "dispatching";
                    confirmed: "confirmed";
                    indeterminate: "indeterminate";
                }>;
                estimatedCredits: z.ZodNumber;
                actualCredits: z.ZodNullable<z.ZodNumber>;
                remoteId: z.ZodNullable<z.ZodString>;
                responseData: z.ZodNullable<z.ZodUnknown>;
                responseMeta: z.ZodNullable<z.ZodUnknown>;
                errorCode: z.ZodNullable<z.ZodString>;
                responseObservationId: z.ZodNullable<z.ZodNumber>;
                accountingState: z.ZodEnum<{
                    pending: "pending";
                    complete: "complete";
                }>;
                createdAt: z.ZodString;
            }, z.core.$strip>;
        };
    };
    readonly ofapiActionGet: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Read retained action and response evidence locally";
        readonly params: z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strip>;
        readonly response: {
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 503: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 200: z.ZodObject<{
                id: z.ZodString;
                pageId: z.ZodNumber;
                pageLabel: z.ZodString;
                accountId: z.ZodString;
                action: z.ZodString;
                command: z.ZodUnion<readonly [z.ZodObject<{
                    action: z.ZodLiteral<"user_list_create">;
                    pageId: z.ZodNumber;
                    name: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_list_update">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    name: z.ZodString;
                    isPinnedToFeed: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_list_delete">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_list_add_users">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    ids: z.ZodArray<z.ZodString>;
                    skip_invalid: z.ZodOptional<z.ZodBoolean>;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_list_clear">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_list_remove_user">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    userId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_list_pin_toggle">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    userId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"vault_list_create">;
                    pageId: z.ZodNumber;
                    name: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"vault_list_update">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    name: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"vault_list_delete">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"vault_list_add_media">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    mediaIds: z.ZodArray<z.ZodString>;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"vault_list_remove_media">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    mediaIds: z.ZodArray<z.ZodString>;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"vault_media_delete">;
                    pageId: z.ZodNumber;
                    mediaIds: z.ZodArray<z.ZodString>;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_block">;
                    pageId: z.ZodNumber;
                    userId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_unblock">;
                    pageId: z.ZodNumber;
                    userId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_restrict">;
                    pageId: z.ZodNumber;
                    userId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_unrestrict">;
                    pageId: z.ZodNumber;
                    userId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"fan_notes_get">;
                    pageId: z.ZodNumber;
                    fanId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"fan_notes_update">;
                    pageId: z.ZodNumber;
                    fanId: z.ZodString;
                    notes: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"fan_notes_clear">;
                    pageId: z.ZodNumber;
                    fanId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    previews: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    labelIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    rfTag: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    expireDays: z.ZodOptional<z.ZodNumber>;
                    fundRaisingTargetCents: z.ZodOptional<z.ZodNumber>;
                    fundRaisingTipsPresetCents: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                    votingType: z.ZodOptional<z.ZodEnum<{
                        poll: "poll";
                        quiz: "quiz";
                    }>>;
                    votingDue: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<3>, z.ZodLiteral<7>, z.ZodLiteral<30>]>>;
                    votingOptions: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    votingCorrectIndex: z.ZodOptional<z.ZodNumber>;
                    text: z.ZodString;
                    mediaFiles: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    scheduledDate: z.ZodOptional<z.ZodISODateTime>;
                    saveForLater: z.ZodOptional<z.ZodBoolean>;
                    blockBannedWords: z.ZodOptional<z.ZodEnum<{
                        risky: "risky";
                        strict_ban: "strict_ban";
                        replace_soften: "replace_soften";
                    }>>;
                    reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                    action: z.ZodLiteral<"post_create">;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    priceCents: z.ZodOptional<z.ZodNumber>;
                    labelIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    rfTag: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    expireDays: z.ZodOptional<z.ZodNumber>;
                    fundRaisingTargetCents: z.ZodOptional<z.ZodNumber>;
                    fundRaisingTipsPresetCents: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                    votingType: z.ZodOptional<z.ZodEnum<{
                        poll: "poll";
                        quiz: "quiz";
                    }>>;
                    votingDue: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<3>, z.ZodLiteral<7>, z.ZodLiteral<30>]>>;
                    votingOptions: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    votingCorrectIndex: z.ZodOptional<z.ZodNumber>;
                    text: z.ZodString;
                    mediaFiles: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    scheduledDate: z.ZodOptional<z.ZodISODateTime>;
                    saveForLater: z.ZodOptional<z.ZodBoolean>;
                    blockBannedWords: z.ZodOptional<z.ZodEnum<{
                        risky: "risky";
                        strict_ban: "strict_ban";
                        replace_soften: "replace_soften";
                    }>>;
                    reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                    action: z.ZodLiteral<"post_update">;
                    postId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_delete">;
                    postId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_archive">;
                    postId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_unarchive">;
                    postId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_toggle_pin">;
                    postId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_label_create">;
                    name: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_comment_create">;
                    postId: z.ZodString;
                    text: z.ZodString;
                    answerTo: z.ZodOptional<z.ZodString>;
                    giphyId: z.ZodOptional<z.ZodString>;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_comment_delete">;
                    postId: z.ZodString;
                    commentId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_comment_pin">;
                    postId: z.ZodString;
                    commentId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_comment_unpin">;
                    postId: z.ZodString;
                    commentId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_comment_like">;
                    postId: z.ZodString;
                    commentId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_comment_unlike">;
                    postId: z.ZodString;
                    commentId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"story_create">;
                    mediaFiles: z.ZodArray<z.ZodString>;
                    reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                    texts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                        text: z.ZodString;
                        type: z.ZodOptional<z.ZodEnum<{
                            text: "text";
                            mention: "mention";
                        }>>;
                        fontFamily: z.ZodOptional<z.ZodEnum<{
                            Roboto: "Roboto";
                            PTMono: "PTMono";
                            ShantellSans: "ShantellSans";
                            SofiaSans: "SofiaSans";
                            YanoneKaffeesatz: "YanoneKaffeesatz";
                            RubikMedium: "RubikMedium";
                            RubikBlack: "RubikBlack";
                        }>>;
                        fontWeight: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<400>, z.ZodLiteral<500>, z.ZodLiteral<700>]>>;
                        fontSize: z.ZodOptional<z.ZodNumber>;
                        color: z.ZodOptional<z.ZodString>;
                        bgColor: z.ZodOptional<z.ZodString>;
                        textAlign: z.ZodOptional<z.ZodEnum<{
                            left: "left";
                            center: "center";
                            right: "right";
                        }>>;
                        left: z.ZodOptional<z.ZodNumber>;
                        top: z.ZodOptional<z.ZodNumber>;
                        angle: z.ZodOptional<z.ZodNumber>;
                        scale: z.ZodOptional<z.ZodNumber>;
                        zIndex: z.ZodOptional<z.ZodNumber>;
                        textWidth: z.ZodOptional<z.ZodNumber>;
                        textHeight: z.ZodOptional<z.ZodNumber>;
                    }, z.core.$strict>>>;
                    questionText: z.ZodOptional<z.ZodString>;
                    questionColor: z.ZodOptional<z.ZodString>;
                    questionLeft: z.ZodOptional<z.ZodNumber>;
                    questionTop: z.ZodOptional<z.ZodNumber>;
                    questionWidth: z.ZodOptional<z.ZodNumber>;
                    questionHeight: z.ZodOptional<z.ZodNumber>;
                    canvasWidth: z.ZodOptional<z.ZodNumber>;
                    canvasHeight: z.ZodOptional<z.ZodNumber>;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"story_delete">;
                    storyId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"story_mark_watched">;
                    storyId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    title: z.ZodString;
                    coverStoryId: z.ZodString;
                    storyIds: z.ZodArray<z.ZodString>;
                    action: z.ZodLiteral<"highlight_create">;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    title: z.ZodString;
                    coverStoryId: z.ZodString;
                    storyIds: z.ZodArray<z.ZodString>;
                    action: z.ZodLiteral<"highlight_update">;
                    highlightId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"highlight_delete">;
                    highlightId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"highlight_add_story">;
                    highlightId: z.ZodString;
                    storyId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"highlight_remove_story">;
                    highlightId: z.ZodString;
                    storyId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    excludedLists: z.ZodOptional<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodEnum<{
                        fans: "fans";
                        recent: "recent";
                        following: "following";
                        rebill_off: "rebill_off";
                        tagged: "tagged";
                    }>]>>>;
                    subscribedWithinLastDays: z.ZodOptional<z.ZodNumber>;
                    rfTag: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    rfPartner: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    rfGuest: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    userLists: z.ZodOptional<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodEnum<{
                        fans: "fans";
                        recent: "recent";
                        following: "following";
                        rebill_off: "rebill_off";
                        tagged: "tagged";
                    }>]>>>;
                    userIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    lockedText: z.ZodOptional<z.ZodBoolean>;
                    priceCents: z.ZodOptional<z.ZodNumber>;
                    previews: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    giphyId: z.ZodOptional<z.ZodString>;
                    text: z.ZodString;
                    mediaFiles: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    scheduledDate: z.ZodOptional<z.ZodISODateTime>;
                    saveForLater: z.ZodOptional<z.ZodBoolean>;
                    blockBannedWords: z.ZodOptional<z.ZodEnum<{
                        risky: "risky";
                        strict_ban: "strict_ban";
                        replace_soften: "replace_soften";
                    }>>;
                    reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                    action: z.ZodLiteral<"campaign_create">;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    saveForLater: z.ZodOptional<z.ZodNever>;
                    userLists: z.ZodOptional<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodEnum<{
                        fans: "fans";
                        recent: "recent";
                        following: "following";
                        rebill_off: "rebill_off";
                        tagged: "tagged";
                    }>]>>>;
                    userIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    lockedText: z.ZodOptional<z.ZodBoolean>;
                    priceCents: z.ZodOptional<z.ZodNumber>;
                    previews: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    giphyId: z.ZodOptional<z.ZodString>;
                    text: z.ZodString;
                    mediaFiles: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    scheduledDate: z.ZodOptional<z.ZodISODateTime>;
                    blockBannedWords: z.ZodOptional<z.ZodEnum<{
                        risky: "risky";
                        strict_ban: "strict_ban";
                        replace_soften: "replace_soften";
                    }>>;
                    reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                    action: z.ZodLiteral<"campaign_update">;
                    campaignId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"campaign_cancel">;
                    campaignId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    limit: z.ZodOptional<z.ZodNumber>;
                    types: z.ZodOptional<z.ZodArray<z.ZodEnum<{
                        post: "post";
                        chat: "chat";
                    }>>>;
                    publishDateStart: z.ZodISODate;
                    publishDateEnd: z.ZodISODate;
                    timezone: z.ZodString;
                    action: z.ZodLiteral<"queue_list">;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    publishDateStart: z.ZodISODate;
                    publishDateEnd: z.ZodISODate;
                    timezone: z.ZodString;
                    action: z.ZodLiteral<"queue_counts">;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"queue_publish">;
                    queueId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
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
                state: z.ZodEnum<{
                    cancelled: "cancelled";
                    partial: "partial";
                    rejected: "rejected";
                    prepared: "prepared";
                    dispatching: "dispatching";
                    confirmed: "confirmed";
                    indeterminate: "indeterminate";
                }>;
                estimatedCredits: z.ZodNumber;
                actualCredits: z.ZodNullable<z.ZodNumber>;
                remoteId: z.ZodNullable<z.ZodString>;
                responseData: z.ZodNullable<z.ZodUnknown>;
                responseMeta: z.ZodNullable<z.ZodUnknown>;
                errorCode: z.ZodNullable<z.ZodString>;
                responseObservationId: z.ZodNullable<z.ZodNumber>;
                accountingState: z.ZodEnum<{
                    pending: "pending";
                    complete: "complete";
                }>;
                createdAt: z.ZodString;
            }, z.core.$strip>;
        };
    };
    readonly ofapiActionList: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "List retained actions for the selected page without vendor requests";
        readonly querystring: z.ZodObject<{
            pageId: z.ZodCoercedNumber<unknown>;
        }, z.core.$strip>;
        readonly response: {
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 503: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 200: z.ZodObject<{
                intents: z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    pageId: z.ZodNumber;
                    pageLabel: z.ZodString;
                    accountId: z.ZodString;
                    action: z.ZodString;
                    command: z.ZodUnion<readonly [z.ZodObject<{
                        action: z.ZodLiteral<"user_list_create">;
                        pageId: z.ZodNumber;
                        name: z.ZodString;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"user_list_update">;
                        pageId: z.ZodNumber;
                        listId: z.ZodString;
                        name: z.ZodString;
                        isPinnedToFeed: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"user_list_delete">;
                        pageId: z.ZodNumber;
                        listId: z.ZodString;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"user_list_add_users">;
                        pageId: z.ZodNumber;
                        listId: z.ZodString;
                        ids: z.ZodArray<z.ZodString>;
                        skip_invalid: z.ZodOptional<z.ZodBoolean>;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"user_list_clear">;
                        pageId: z.ZodNumber;
                        listId: z.ZodString;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"user_list_remove_user">;
                        pageId: z.ZodNumber;
                        listId: z.ZodString;
                        userId: z.ZodString;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"user_list_pin_toggle">;
                        pageId: z.ZodNumber;
                        listId: z.ZodString;
                        userId: z.ZodString;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"vault_list_create">;
                        pageId: z.ZodNumber;
                        name: z.ZodString;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"vault_list_update">;
                        pageId: z.ZodNumber;
                        listId: z.ZodString;
                        name: z.ZodString;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"vault_list_delete">;
                        pageId: z.ZodNumber;
                        listId: z.ZodString;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"vault_list_add_media">;
                        pageId: z.ZodNumber;
                        listId: z.ZodString;
                        mediaIds: z.ZodArray<z.ZodString>;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"vault_list_remove_media">;
                        pageId: z.ZodNumber;
                        listId: z.ZodString;
                        mediaIds: z.ZodArray<z.ZodString>;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"vault_media_delete">;
                        pageId: z.ZodNumber;
                        mediaIds: z.ZodArray<z.ZodString>;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"user_block">;
                        pageId: z.ZodNumber;
                        userId: z.ZodString;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"user_unblock">;
                        pageId: z.ZodNumber;
                        userId: z.ZodString;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"user_restrict">;
                        pageId: z.ZodNumber;
                        userId: z.ZodString;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"user_unrestrict">;
                        pageId: z.ZodNumber;
                        userId: z.ZodString;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"fan_notes_get">;
                        pageId: z.ZodNumber;
                        fanId: z.ZodString;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"fan_notes_update">;
                        pageId: z.ZodNumber;
                        fanId: z.ZodString;
                        notes: z.ZodString;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"fan_notes_clear">;
                        pageId: z.ZodNumber;
                        fanId: z.ZodString;
                    }, z.core.$strict>, z.ZodObject<{
                        previews: z.ZodOptional<z.ZodArray<z.ZodString>>;
                        labelIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
                        rfTag: z.ZodOptional<z.ZodArray<z.ZodString>>;
                        expireDays: z.ZodOptional<z.ZodNumber>;
                        fundRaisingTargetCents: z.ZodOptional<z.ZodNumber>;
                        fundRaisingTipsPresetCents: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                        votingType: z.ZodOptional<z.ZodEnum<{
                            poll: "poll";
                            quiz: "quiz";
                        }>>;
                        votingDue: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<3>, z.ZodLiteral<7>, z.ZodLiteral<30>]>>;
                        votingOptions: z.ZodOptional<z.ZodArray<z.ZodString>>;
                        votingCorrectIndex: z.ZodOptional<z.ZodNumber>;
                        text: z.ZodString;
                        mediaFiles: z.ZodOptional<z.ZodArray<z.ZodString>>;
                        scheduledDate: z.ZodOptional<z.ZodISODateTime>;
                        saveForLater: z.ZodOptional<z.ZodBoolean>;
                        blockBannedWords: z.ZodOptional<z.ZodEnum<{
                            risky: "risky";
                            strict_ban: "strict_ban";
                            replace_soften: "replace_soften";
                        }>>;
                        reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                        action: z.ZodLiteral<"post_create">;
                        pageId: z.ZodNumber;
                    }, z.core.$strict>, z.ZodObject<{
                        priceCents: z.ZodOptional<z.ZodNumber>;
                        labelIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
                        rfTag: z.ZodOptional<z.ZodArray<z.ZodString>>;
                        expireDays: z.ZodOptional<z.ZodNumber>;
                        fundRaisingTargetCents: z.ZodOptional<z.ZodNumber>;
                        fundRaisingTipsPresetCents: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                        votingType: z.ZodOptional<z.ZodEnum<{
                            poll: "poll";
                            quiz: "quiz";
                        }>>;
                        votingDue: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<3>, z.ZodLiteral<7>, z.ZodLiteral<30>]>>;
                        votingOptions: z.ZodOptional<z.ZodArray<z.ZodString>>;
                        votingCorrectIndex: z.ZodOptional<z.ZodNumber>;
                        text: z.ZodString;
                        mediaFiles: z.ZodOptional<z.ZodArray<z.ZodString>>;
                        scheduledDate: z.ZodOptional<z.ZodISODateTime>;
                        saveForLater: z.ZodOptional<z.ZodBoolean>;
                        blockBannedWords: z.ZodOptional<z.ZodEnum<{
                            risky: "risky";
                            strict_ban: "strict_ban";
                            replace_soften: "replace_soften";
                        }>>;
                        reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                        action: z.ZodLiteral<"post_update">;
                        postId: z.ZodString;
                        pageId: z.ZodNumber;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"post_delete">;
                        postId: z.ZodString;
                        pageId: z.ZodNumber;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"post_archive">;
                        postId: z.ZodString;
                        pageId: z.ZodNumber;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"post_unarchive">;
                        postId: z.ZodString;
                        pageId: z.ZodNumber;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"post_toggle_pin">;
                        postId: z.ZodString;
                        pageId: z.ZodNumber;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"post_label_create">;
                        name: z.ZodString;
                        pageId: z.ZodNumber;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"post_comment_create">;
                        postId: z.ZodString;
                        text: z.ZodString;
                        answerTo: z.ZodOptional<z.ZodString>;
                        giphyId: z.ZodOptional<z.ZodString>;
                        pageId: z.ZodNumber;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"post_comment_delete">;
                        postId: z.ZodString;
                        commentId: z.ZodString;
                        pageId: z.ZodNumber;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"post_comment_pin">;
                        postId: z.ZodString;
                        commentId: z.ZodString;
                        pageId: z.ZodNumber;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"post_comment_unpin">;
                        postId: z.ZodString;
                        commentId: z.ZodString;
                        pageId: z.ZodNumber;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"post_comment_like">;
                        postId: z.ZodString;
                        commentId: z.ZodString;
                        pageId: z.ZodNumber;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"post_comment_unlike">;
                        postId: z.ZodString;
                        commentId: z.ZodString;
                        pageId: z.ZodNumber;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"story_create">;
                        mediaFiles: z.ZodArray<z.ZodString>;
                        reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                        texts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                            text: z.ZodString;
                            type: z.ZodOptional<z.ZodEnum<{
                                text: "text";
                                mention: "mention";
                            }>>;
                            fontFamily: z.ZodOptional<z.ZodEnum<{
                                Roboto: "Roboto";
                                PTMono: "PTMono";
                                ShantellSans: "ShantellSans";
                                SofiaSans: "SofiaSans";
                                YanoneKaffeesatz: "YanoneKaffeesatz";
                                RubikMedium: "RubikMedium";
                                RubikBlack: "RubikBlack";
                            }>>;
                            fontWeight: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<400>, z.ZodLiteral<500>, z.ZodLiteral<700>]>>;
                            fontSize: z.ZodOptional<z.ZodNumber>;
                            color: z.ZodOptional<z.ZodString>;
                            bgColor: z.ZodOptional<z.ZodString>;
                            textAlign: z.ZodOptional<z.ZodEnum<{
                                left: "left";
                                center: "center";
                                right: "right";
                            }>>;
                            left: z.ZodOptional<z.ZodNumber>;
                            top: z.ZodOptional<z.ZodNumber>;
                            angle: z.ZodOptional<z.ZodNumber>;
                            scale: z.ZodOptional<z.ZodNumber>;
                            zIndex: z.ZodOptional<z.ZodNumber>;
                            textWidth: z.ZodOptional<z.ZodNumber>;
                            textHeight: z.ZodOptional<z.ZodNumber>;
                        }, z.core.$strict>>>;
                        questionText: z.ZodOptional<z.ZodString>;
                        questionColor: z.ZodOptional<z.ZodString>;
                        questionLeft: z.ZodOptional<z.ZodNumber>;
                        questionTop: z.ZodOptional<z.ZodNumber>;
                        questionWidth: z.ZodOptional<z.ZodNumber>;
                        questionHeight: z.ZodOptional<z.ZodNumber>;
                        canvasWidth: z.ZodOptional<z.ZodNumber>;
                        canvasHeight: z.ZodOptional<z.ZodNumber>;
                        pageId: z.ZodNumber;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"story_delete">;
                        storyId: z.ZodString;
                        pageId: z.ZodNumber;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"story_mark_watched">;
                        storyId: z.ZodString;
                        pageId: z.ZodNumber;
                    }, z.core.$strict>, z.ZodObject<{
                        title: z.ZodString;
                        coverStoryId: z.ZodString;
                        storyIds: z.ZodArray<z.ZodString>;
                        action: z.ZodLiteral<"highlight_create">;
                        pageId: z.ZodNumber;
                    }, z.core.$strict>, z.ZodObject<{
                        title: z.ZodString;
                        coverStoryId: z.ZodString;
                        storyIds: z.ZodArray<z.ZodString>;
                        action: z.ZodLiteral<"highlight_update">;
                        highlightId: z.ZodString;
                        pageId: z.ZodNumber;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"highlight_delete">;
                        highlightId: z.ZodString;
                        pageId: z.ZodNumber;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"highlight_add_story">;
                        highlightId: z.ZodString;
                        storyId: z.ZodString;
                        pageId: z.ZodNumber;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"highlight_remove_story">;
                        highlightId: z.ZodString;
                        storyId: z.ZodString;
                        pageId: z.ZodNumber;
                    }, z.core.$strict>, z.ZodObject<{
                        excludedLists: z.ZodOptional<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodEnum<{
                            fans: "fans";
                            recent: "recent";
                            following: "following";
                            rebill_off: "rebill_off";
                            tagged: "tagged";
                        }>]>>>;
                        subscribedWithinLastDays: z.ZodOptional<z.ZodNumber>;
                        rfTag: z.ZodOptional<z.ZodArray<z.ZodString>>;
                        rfPartner: z.ZodOptional<z.ZodArray<z.ZodString>>;
                        rfGuest: z.ZodOptional<z.ZodArray<z.ZodString>>;
                        userLists: z.ZodOptional<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodEnum<{
                            fans: "fans";
                            recent: "recent";
                            following: "following";
                            rebill_off: "rebill_off";
                            tagged: "tagged";
                        }>]>>>;
                        userIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
                        lockedText: z.ZodOptional<z.ZodBoolean>;
                        priceCents: z.ZodOptional<z.ZodNumber>;
                        previews: z.ZodOptional<z.ZodArray<z.ZodString>>;
                        giphyId: z.ZodOptional<z.ZodString>;
                        text: z.ZodString;
                        mediaFiles: z.ZodOptional<z.ZodArray<z.ZodString>>;
                        scheduledDate: z.ZodOptional<z.ZodISODateTime>;
                        saveForLater: z.ZodOptional<z.ZodBoolean>;
                        blockBannedWords: z.ZodOptional<z.ZodEnum<{
                            risky: "risky";
                            strict_ban: "strict_ban";
                            replace_soften: "replace_soften";
                        }>>;
                        reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                        action: z.ZodLiteral<"campaign_create">;
                        pageId: z.ZodNumber;
                    }, z.core.$strict>, z.ZodObject<{
                        saveForLater: z.ZodOptional<z.ZodNever>;
                        userLists: z.ZodOptional<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodEnum<{
                            fans: "fans";
                            recent: "recent";
                            following: "following";
                            rebill_off: "rebill_off";
                            tagged: "tagged";
                        }>]>>>;
                        userIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
                        lockedText: z.ZodOptional<z.ZodBoolean>;
                        priceCents: z.ZodOptional<z.ZodNumber>;
                        previews: z.ZodOptional<z.ZodArray<z.ZodString>>;
                        giphyId: z.ZodOptional<z.ZodString>;
                        text: z.ZodString;
                        mediaFiles: z.ZodOptional<z.ZodArray<z.ZodString>>;
                        scheduledDate: z.ZodOptional<z.ZodISODateTime>;
                        blockBannedWords: z.ZodOptional<z.ZodEnum<{
                            risky: "risky";
                            strict_ban: "strict_ban";
                            replace_soften: "replace_soften";
                        }>>;
                        reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                        action: z.ZodLiteral<"campaign_update">;
                        campaignId: z.ZodString;
                        pageId: z.ZodNumber;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"campaign_cancel">;
                        campaignId: z.ZodString;
                        pageId: z.ZodNumber;
                    }, z.core.$strict>, z.ZodObject<{
                        limit: z.ZodOptional<z.ZodNumber>;
                        types: z.ZodOptional<z.ZodArray<z.ZodEnum<{
                            post: "post";
                            chat: "chat";
                        }>>>;
                        publishDateStart: z.ZodISODate;
                        publishDateEnd: z.ZodISODate;
                        timezone: z.ZodString;
                        action: z.ZodLiteral<"queue_list">;
                        pageId: z.ZodNumber;
                    }, z.core.$strict>, z.ZodObject<{
                        publishDateStart: z.ZodISODate;
                        publishDateEnd: z.ZodISODate;
                        timezone: z.ZodString;
                        action: z.ZodLiteral<"queue_counts">;
                        pageId: z.ZodNumber;
                    }, z.core.$strict>, z.ZodObject<{
                        action: z.ZodLiteral<"queue_publish">;
                        queueId: z.ZodString;
                        pageId: z.ZodNumber;
                    }, z.core.$strict>, z.ZodObject<{
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
                    state: z.ZodEnum<{
                        cancelled: "cancelled";
                        partial: "partial";
                        rejected: "rejected";
                        prepared: "prepared";
                        dispatching: "dispatching";
                        confirmed: "confirmed";
                        indeterminate: "indeterminate";
                    }>;
                    estimatedCredits: z.ZodNumber;
                    actualCredits: z.ZodNullable<z.ZodNumber>;
                    remoteId: z.ZodNullable<z.ZodString>;
                    responseData: z.ZodNullable<z.ZodUnknown>;
                    responseMeta: z.ZodNullable<z.ZodUnknown>;
                    errorCode: z.ZodNullable<z.ZodString>;
                    responseObservationId: z.ZodNullable<z.ZodNumber>;
                    accountingState: z.ZodEnum<{
                        pending: "pending";
                        complete: "complete";
                    }>;
                    createdAt: z.ZodString;
                }, z.core.$strip>>;
            }, z.core.$strip>;
        };
    };
    readonly ofapiActionRepair: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["admin"];
        readonly summary: "Reapply retained response evidence without resending the action";
        readonly params: z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strip>;
        readonly body: z.ZodObject<{}, z.core.$strict>;
        readonly response: {
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 503: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 200: z.ZodObject<{
                id: z.ZodString;
                pageId: z.ZodNumber;
                pageLabel: z.ZodString;
                accountId: z.ZodString;
                action: z.ZodString;
                command: z.ZodUnion<readonly [z.ZodObject<{
                    action: z.ZodLiteral<"user_list_create">;
                    pageId: z.ZodNumber;
                    name: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_list_update">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    name: z.ZodString;
                    isPinnedToFeed: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_list_delete">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_list_add_users">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    ids: z.ZodArray<z.ZodString>;
                    skip_invalid: z.ZodOptional<z.ZodBoolean>;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_list_clear">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_list_remove_user">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    userId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_list_pin_toggle">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    userId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"vault_list_create">;
                    pageId: z.ZodNumber;
                    name: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"vault_list_update">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    name: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"vault_list_delete">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"vault_list_add_media">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    mediaIds: z.ZodArray<z.ZodString>;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"vault_list_remove_media">;
                    pageId: z.ZodNumber;
                    listId: z.ZodString;
                    mediaIds: z.ZodArray<z.ZodString>;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"vault_media_delete">;
                    pageId: z.ZodNumber;
                    mediaIds: z.ZodArray<z.ZodString>;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_block">;
                    pageId: z.ZodNumber;
                    userId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_unblock">;
                    pageId: z.ZodNumber;
                    userId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_restrict">;
                    pageId: z.ZodNumber;
                    userId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"user_unrestrict">;
                    pageId: z.ZodNumber;
                    userId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"fan_notes_get">;
                    pageId: z.ZodNumber;
                    fanId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"fan_notes_update">;
                    pageId: z.ZodNumber;
                    fanId: z.ZodString;
                    notes: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"fan_notes_clear">;
                    pageId: z.ZodNumber;
                    fanId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    previews: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    labelIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    rfTag: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    expireDays: z.ZodOptional<z.ZodNumber>;
                    fundRaisingTargetCents: z.ZodOptional<z.ZodNumber>;
                    fundRaisingTipsPresetCents: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                    votingType: z.ZodOptional<z.ZodEnum<{
                        poll: "poll";
                        quiz: "quiz";
                    }>>;
                    votingDue: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<3>, z.ZodLiteral<7>, z.ZodLiteral<30>]>>;
                    votingOptions: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    votingCorrectIndex: z.ZodOptional<z.ZodNumber>;
                    text: z.ZodString;
                    mediaFiles: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    scheduledDate: z.ZodOptional<z.ZodISODateTime>;
                    saveForLater: z.ZodOptional<z.ZodBoolean>;
                    blockBannedWords: z.ZodOptional<z.ZodEnum<{
                        risky: "risky";
                        strict_ban: "strict_ban";
                        replace_soften: "replace_soften";
                    }>>;
                    reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                    action: z.ZodLiteral<"post_create">;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    priceCents: z.ZodOptional<z.ZodNumber>;
                    labelIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    rfTag: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    expireDays: z.ZodOptional<z.ZodNumber>;
                    fundRaisingTargetCents: z.ZodOptional<z.ZodNumber>;
                    fundRaisingTipsPresetCents: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                    votingType: z.ZodOptional<z.ZodEnum<{
                        poll: "poll";
                        quiz: "quiz";
                    }>>;
                    votingDue: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<3>, z.ZodLiteral<7>, z.ZodLiteral<30>]>>;
                    votingOptions: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    votingCorrectIndex: z.ZodOptional<z.ZodNumber>;
                    text: z.ZodString;
                    mediaFiles: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    scheduledDate: z.ZodOptional<z.ZodISODateTime>;
                    saveForLater: z.ZodOptional<z.ZodBoolean>;
                    blockBannedWords: z.ZodOptional<z.ZodEnum<{
                        risky: "risky";
                        strict_ban: "strict_ban";
                        replace_soften: "replace_soften";
                    }>>;
                    reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                    action: z.ZodLiteral<"post_update">;
                    postId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_delete">;
                    postId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_archive">;
                    postId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_unarchive">;
                    postId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_toggle_pin">;
                    postId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_label_create">;
                    name: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_comment_create">;
                    postId: z.ZodString;
                    text: z.ZodString;
                    answerTo: z.ZodOptional<z.ZodString>;
                    giphyId: z.ZodOptional<z.ZodString>;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_comment_delete">;
                    postId: z.ZodString;
                    commentId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_comment_pin">;
                    postId: z.ZodString;
                    commentId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_comment_unpin">;
                    postId: z.ZodString;
                    commentId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_comment_like">;
                    postId: z.ZodString;
                    commentId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"post_comment_unlike">;
                    postId: z.ZodString;
                    commentId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"story_create">;
                    mediaFiles: z.ZodArray<z.ZodString>;
                    reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                    texts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                        text: z.ZodString;
                        type: z.ZodOptional<z.ZodEnum<{
                            text: "text";
                            mention: "mention";
                        }>>;
                        fontFamily: z.ZodOptional<z.ZodEnum<{
                            Roboto: "Roboto";
                            PTMono: "PTMono";
                            ShantellSans: "ShantellSans";
                            SofiaSans: "SofiaSans";
                            YanoneKaffeesatz: "YanoneKaffeesatz";
                            RubikMedium: "RubikMedium";
                            RubikBlack: "RubikBlack";
                        }>>;
                        fontWeight: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<400>, z.ZodLiteral<500>, z.ZodLiteral<700>]>>;
                        fontSize: z.ZodOptional<z.ZodNumber>;
                        color: z.ZodOptional<z.ZodString>;
                        bgColor: z.ZodOptional<z.ZodString>;
                        textAlign: z.ZodOptional<z.ZodEnum<{
                            left: "left";
                            center: "center";
                            right: "right";
                        }>>;
                        left: z.ZodOptional<z.ZodNumber>;
                        top: z.ZodOptional<z.ZodNumber>;
                        angle: z.ZodOptional<z.ZodNumber>;
                        scale: z.ZodOptional<z.ZodNumber>;
                        zIndex: z.ZodOptional<z.ZodNumber>;
                        textWidth: z.ZodOptional<z.ZodNumber>;
                        textHeight: z.ZodOptional<z.ZodNumber>;
                    }, z.core.$strict>>>;
                    questionText: z.ZodOptional<z.ZodString>;
                    questionColor: z.ZodOptional<z.ZodString>;
                    questionLeft: z.ZodOptional<z.ZodNumber>;
                    questionTop: z.ZodOptional<z.ZodNumber>;
                    questionWidth: z.ZodOptional<z.ZodNumber>;
                    questionHeight: z.ZodOptional<z.ZodNumber>;
                    canvasWidth: z.ZodOptional<z.ZodNumber>;
                    canvasHeight: z.ZodOptional<z.ZodNumber>;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"story_delete">;
                    storyId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"story_mark_watched">;
                    storyId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    title: z.ZodString;
                    coverStoryId: z.ZodString;
                    storyIds: z.ZodArray<z.ZodString>;
                    action: z.ZodLiteral<"highlight_create">;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    title: z.ZodString;
                    coverStoryId: z.ZodString;
                    storyIds: z.ZodArray<z.ZodString>;
                    action: z.ZodLiteral<"highlight_update">;
                    highlightId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"highlight_delete">;
                    highlightId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"highlight_add_story">;
                    highlightId: z.ZodString;
                    storyId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"highlight_remove_story">;
                    highlightId: z.ZodString;
                    storyId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    excludedLists: z.ZodOptional<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodEnum<{
                        fans: "fans";
                        recent: "recent";
                        following: "following";
                        rebill_off: "rebill_off";
                        tagged: "tagged";
                    }>]>>>;
                    subscribedWithinLastDays: z.ZodOptional<z.ZodNumber>;
                    rfTag: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    rfPartner: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    rfGuest: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    userLists: z.ZodOptional<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodEnum<{
                        fans: "fans";
                        recent: "recent";
                        following: "following";
                        rebill_off: "rebill_off";
                        tagged: "tagged";
                    }>]>>>;
                    userIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    lockedText: z.ZodOptional<z.ZodBoolean>;
                    priceCents: z.ZodOptional<z.ZodNumber>;
                    previews: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    giphyId: z.ZodOptional<z.ZodString>;
                    text: z.ZodString;
                    mediaFiles: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    scheduledDate: z.ZodOptional<z.ZodISODateTime>;
                    saveForLater: z.ZodOptional<z.ZodBoolean>;
                    blockBannedWords: z.ZodOptional<z.ZodEnum<{
                        risky: "risky";
                        strict_ban: "strict_ban";
                        replace_soften: "replace_soften";
                    }>>;
                    reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                    action: z.ZodLiteral<"campaign_create">;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    saveForLater: z.ZodOptional<z.ZodNever>;
                    userLists: z.ZodOptional<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodEnum<{
                        fans: "fans";
                        recent: "recent";
                        following: "following";
                        rebill_off: "rebill_off";
                        tagged: "tagged";
                    }>]>>>;
                    userIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    lockedText: z.ZodOptional<z.ZodBoolean>;
                    priceCents: z.ZodOptional<z.ZodNumber>;
                    previews: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    giphyId: z.ZodOptional<z.ZodString>;
                    text: z.ZodString;
                    mediaFiles: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    scheduledDate: z.ZodOptional<z.ZodISODateTime>;
                    blockBannedWords: z.ZodOptional<z.ZodEnum<{
                        risky: "risky";
                        strict_ban: "strict_ban";
                        replace_soften: "replace_soften";
                    }>>;
                    reuseProviderOperation: z.ZodDefault<z.ZodLiteral<false>>;
                    action: z.ZodLiteral<"campaign_update">;
                    campaignId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"campaign_cancel">;
                    campaignId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    limit: z.ZodOptional<z.ZodNumber>;
                    types: z.ZodOptional<z.ZodArray<z.ZodEnum<{
                        post: "post";
                        chat: "chat";
                    }>>>;
                    publishDateStart: z.ZodISODate;
                    publishDateEnd: z.ZodISODate;
                    timezone: z.ZodString;
                    action: z.ZodLiteral<"queue_list">;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    publishDateStart: z.ZodISODate;
                    publishDateEnd: z.ZodISODate;
                    timezone: z.ZodString;
                    action: z.ZodLiteral<"queue_counts">;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodLiteral<"queue_publish">;
                    queueId: z.ZodString;
                    pageId: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
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
                state: z.ZodEnum<{
                    cancelled: "cancelled";
                    partial: "partial";
                    rejected: "rejected";
                    prepared: "prepared";
                    dispatching: "dispatching";
                    confirmed: "confirmed";
                    indeterminate: "indeterminate";
                }>;
                estimatedCredits: z.ZodNumber;
                actualCredits: z.ZodNullable<z.ZodNumber>;
                remoteId: z.ZodNullable<z.ZodString>;
                responseData: z.ZodNullable<z.ZodUnknown>;
                responseMeta: z.ZodNullable<z.ZodUnknown>;
                errorCode: z.ZodNullable<z.ZodString>;
                responseObservationId: z.ZodNullable<z.ZodNumber>;
                accountingState: z.ZodEnum<{
                    pending: "pending";
                    complete: "complete";
                }>;
                createdAt: z.ZodString;
            }, z.core.$strip>;
        };
    };
};
