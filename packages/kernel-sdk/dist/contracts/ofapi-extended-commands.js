import { z } from "zod";
import { isOfapiFollowerGreetingPayload } from "../shared/index";
const id = z.string().regex(/^[0-9]{1,30}$/);
const mediaId = z.string().regex(/^(?:[0-9]{1,30}|ofapi_media_[A-Za-z0-9_-]{1,128})$/);
const base = { clientCommandId: z.string().uuid(), accountId: z.string().regex(/^acct_[A-Za-z0-9]+$/), conversationId: id };
export const ofapiSendV2PayloadSchema = z.strictObject({
    text: z.string().max(10000), priceCents: z.number().int().min(0).max(20000).refine(n => n === 0 || n >= 300),
    mediaFiles: z.array(mediaId).max(50), previews: z.array(mediaId).max(50), lockedText: z.boolean(),
    replyToMessageId: id.nullable(), giphyId: z.string().min(1).max(200).nullable(),
    rfTag: z.array(id).max(50), rfPartner: z.array(id).max(50), rfGuest: z.array(id).max(50),
    blockBannedWords: z.enum(["strict_ban", "risky", "replace_soften"]).nullable(),
    reuseProviderOperation: z.boolean().default(false),
}).superRefine((value, ctx) => {
    if (!value.text.trim() && !value.mediaFiles.length && !value.giphyId)
        ctx.addIssue({ code: "custom", message: "Choose text or media" });
    if (value.priceCents > 0 && !value.mediaFiles.length)
        ctx.addIssue({ code: "custom", message: "Paid messages require media" });
    if (new Set(value.mediaFiles).size !== value.mediaFiles.length || new Set(value.previews).size !== value.previews.length
        || value.previews.some(item => !value.mediaFiles.includes(item)))
        ctx.addIssue({ code: "custom", message: "Previews must be a unique subset of attached media" });
});
export const ofapiExtendedCommandOptions = [
    z.strictObject({
        ...base, kind: z.literal("send_message_v2"), payload: ofapiSendV2PayloadSchema,
        retryOfCommandId: z.string().uuid().nullable().optional(),
        outreachPurpose: z.literal("new-follower").optional(),
    }).superRefine((value, ctx) => {
        if (value.outreachPurpose && !isOfapiFollowerGreetingPayload(value.payload)) {
            ctx.addIssue({ code: "custom", path: ["payload"], message: "Follower greetings require one immediate free text message" });
        }
    }),
    z.strictObject({ ...base, kind: z.literal("set_fan_custom_name_v1"), payload: z.strictObject({ customName: z.string().max(100) }), retryOfCommandId: z.null().optional() }),
    ...["like_message_v1", "unlike_message_v1", "pin_message_v1", "unpin_message_v1"].map(kind => z.strictObject({ ...base, kind: z.literal(kind), payload: z.strictObject({ messageId: id }), retryOfCommandId: z.null().optional() })),
    ...["mark_chat_unread_v1", "mute_chat_v1", "unmute_chat_v1", "hide_chat_v1"].map(kind => z.strictObject({ ...base, kind: z.literal(kind), payload: z.strictObject({}), retryOfCommandId: z.null().optional() })),
];
