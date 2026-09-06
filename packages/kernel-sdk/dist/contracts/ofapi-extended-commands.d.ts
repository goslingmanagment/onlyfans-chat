import { z } from "zod";
export declare const ofapiSendV2PayloadSchema: z.ZodObject<{
    text: z.ZodString;
    priceCents: z.ZodNumber;
    mediaFiles: z.ZodArray<z.ZodString>;
    previews: z.ZodArray<z.ZodString>;
    lockedText: z.ZodBoolean;
    replyToMessageId: z.ZodNullable<z.ZodString>;
    giphyId: z.ZodNullable<z.ZodString>;
    rfTag: z.ZodArray<z.ZodString>;
    rfPartner: z.ZodArray<z.ZodString>;
    rfGuest: z.ZodArray<z.ZodString>;
    blockBannedWords: z.ZodNullable<z.ZodEnum<{
        risky: "risky";
        strict_ban: "strict_ban";
        replace_soften: "replace_soften";
    }>>;
    reuseProviderOperation: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>;
export declare const ofapiExtendedCommandOptions: readonly [z.ZodObject<{
    kind: z.ZodLiteral<"send_message_v2">;
    payload: z.ZodObject<{
        text: z.ZodString;
        priceCents: z.ZodNumber;
        mediaFiles: z.ZodArray<z.ZodString>;
        previews: z.ZodArray<z.ZodString>;
        lockedText: z.ZodBoolean;
        replyToMessageId: z.ZodNullable<z.ZodString>;
        giphyId: z.ZodNullable<z.ZodString>;
        rfTag: z.ZodArray<z.ZodString>;
        rfPartner: z.ZodArray<z.ZodString>;
        rfGuest: z.ZodArray<z.ZodString>;
        blockBannedWords: z.ZodNullable<z.ZodEnum<{
            risky: "risky";
            strict_ban: "strict_ban";
            replace_soften: "replace_soften";
        }>>;
        reuseProviderOperation: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>;
    retryOfCommandId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    clientCommandId: z.ZodString;
    accountId: z.ZodString;
    conversationId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"set_fan_custom_name_v1">;
    payload: z.ZodObject<{
        customName: z.ZodString;
    }, z.core.$strict>;
    retryOfCommandId: z.ZodOptional<z.ZodNull>;
    clientCommandId: z.ZodString;
    accountId: z.ZodString;
    conversationId: z.ZodString;
}, z.core.$strict>, ...(z.ZodObject<{
    kind: z.ZodLiteral<"like_message_v1" | "unlike_message_v1" | "pin_message_v1" | "unpin_message_v1">;
    payload: z.ZodObject<{
        messageId: z.ZodString;
    }, z.core.$strict>;
    retryOfCommandId: z.ZodOptional<z.ZodNull>;
    clientCommandId: z.ZodString;
    accountId: z.ZodString;
    conversationId: z.ZodString;
}, z.core.$strict> | z.ZodObject<{
    kind: z.ZodLiteral<"mark_chat_unread_v1" | "mute_chat_v1" | "unmute_chat_v1" | "hide_chat_v1">;
    payload: z.ZodObject<{}, z.core.$strict>;
    retryOfCommandId: z.ZodOptional<z.ZodNull>;
    clientCommandId: z.ZodString;
    accountId: z.ZodString;
    conversationId: z.ZodString;
}, z.core.$strict>)[]];
