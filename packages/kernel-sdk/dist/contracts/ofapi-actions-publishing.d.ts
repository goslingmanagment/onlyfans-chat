import { z } from "zod";
/** Closed schemas are also the form and SDK contract; no provider path/body passthrough. */
export declare const ofapiPublishingActionOptions: readonly [z.ZodObject<{
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
}, z.core.$strict>];
export declare const ofapiPublishingActionSchema: z.ZodUnion<readonly [z.ZodObject<{
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
}, z.core.$strict>]>;
export type OfapiPublishingAction = z.infer<typeof ofapiPublishingActionSchema>;
/** Time changes must not invalidate idempotent retrieval of a previously accepted intent. */
export declare function ofapiPublishingAdmissionIssue(command: OfapiPublishingAction, now: Date): string | null;
