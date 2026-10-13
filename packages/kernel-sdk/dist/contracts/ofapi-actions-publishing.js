import { z } from "zod";
import { isoDateTime } from "./primitives";
const id = z.string().regex(/^[1-9]\d{0,19}$/, "Use a positive provider ID");
const mediaId = z.string().regex(/^(?:[1-9]\d{0,19}|ofapi_media_[A-Za-z0-9_-]{1,128})$/);
const listId = z.union([id, z.enum(["fans", "recent", "following", "rebill_off", "tagged"])]);
const unique = (item, max) => z.array(item).max(max).refine(values => new Set(values).size === values.length, "Remove duplicate values");
const ids = unique(id, 100);
const media = unique(mediaId, 50);
const base = { pageId: z.number().int().positive() };
const text = z.string().max(16000);
const name = z.string().trim().min(1).max(200);
const utcDateTime = isoDateTime();
const screen = z.enum(["strict_ban", "risky", "replace_soften"]);
const position = z.number().min(0).max(100);
const color = z.string().regex(/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/);
const wholeDollarCents = z.number().int().min(0).max(100_000_000).multipleOf(100);
const publication = {
    text,
    mediaFiles: media.optional(),
    scheduledDate: utcDateTime.optional(),
    saveForLater: z.boolean().optional(),
    blockBannedWords: screen.optional(),
    reuseProviderOperation: z.literal(false).default(false),
};
const post = {
    ...publication,
    labelIds: ids.optional(),
    rfTag: ids.optional(),
    expireDays: z.number().int().min(1).max(30).optional(),
    fundRaisingTargetCents: wholeDollarCents.min(1000).optional(),
    fundRaisingTipsPresetCents: unique(wholeDollarCents.min(100), 10).min(1).optional(),
    votingType: z.enum(["poll", "quiz"]).optional(),
    votingDue: z.union([z.literal(1), z.literal(3), z.literal(7), z.literal(30)]).optional(),
    votingOptions: unique(z.string().trim().min(1).max(500), 10).min(2).optional(),
    votingCorrectIndex: z.number().int().min(0).max(9).optional(),
};
const campaign = {
    ...publication,
    userLists: unique(listId, 50).optional(),
    userIds: unique(id, 1000).optional(),
    lockedText: z.boolean().optional(),
    priceCents: z.number().int().min(0).max(20000).refine(value => value === 0 || value >= 300).optional(),
    previews: media.optional(),
    giphyId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/).optional(),
};
function checkContent(value, ctx) {
    if (!value.text.trim() && !value.mediaFiles?.length && !value.giphyId)
        ctx.addIssue({ code: "custom", path: ["text"], message: "Choose text or media" });
    if (value.scheduledDate && value.saveForLater)
        ctx.addIssue({ code: "custom", path: ["scheduledDate"], message: "Choose scheduling or saved for later" });
}
function checkPost(value, ctx) {
    checkContent(value, ctx);
    if (Boolean(value.fundRaisingTargetCents) !== Boolean(value.fundRaisingTipsPresetCents?.length))
        ctx.addIssue({ code: "custom", path: ["fundRaisingTipsPresetCents"], message: "Provide a fundraising target and at least one tip preset together" });
    if (value.fundRaisingTipsPresetCents?.some(cents => cents > (value.fundRaisingTargetCents ?? 0)))
        ctx.addIssue({ code: "custom", path: ["fundRaisingTipsPresetCents"], message: "Tip presets cannot exceed the fundraising target" });
    if (!value.votingType && (value.votingOptions || value.votingDue || value.votingCorrectIndex !== undefined))
        ctx.addIssue({ code: "custom", path: ["votingType"], message: "Poll and quiz fields require a voting type" });
    if (value.votingType && !value.votingOptions?.length)
        ctx.addIssue({ code: "custom", path: ["votingOptions"], message: "Provide at least two voting choices" });
    if (value.votingType === "quiz" && (value.votingCorrectIndex === undefined || value.votingCorrectIndex >= (value.votingOptions?.length ?? 0)))
        ctx.addIssue({ code: "custom", path: ["votingCorrectIndex"], message: "Choose an existing quiz answer index, starting at zero" });
    if (value.votingType !== "quiz" && value.votingCorrectIndex !== undefined)
        ctx.addIssue({ code: "custom", path: ["votingCorrectIndex"], message: "A correct answer applies only to a quiz" });
}
function checkPreviews(value, ctx) {
    if (value.previews?.some(item => !value.mediaFiles?.includes(item)))
        ctx.addIssue({ code: "custom", path: ["previews"], message: "Previews must be a subset of the attached media" });
}
function checkPrice(value, ctx) {
    if (value.priceCents && !value.mediaFiles?.length)
        ctx.addIssue({ code: "custom", path: ["mediaFiles"], message: "Paid content requires attached media" });
}
function checkCampaign(value, ctx) {
    checkContent(value, ctx);
    checkPreviews(value, ctx);
    checkPrice(value, ctx);
    if (!value.userLists?.length && !value.userIds?.length && !value.subscribedWithinLastDays)
        ctx.addIssue({ code: "custom", path: ["userIds"], message: "Explicitly select recipients or a recent-subscriber window" });
}
const overlay = z.strictObject({
    text: z.string().min(1).max(2000),
    type: z.enum(["text", "mention"]).optional(),
    fontFamily: z.enum(["Roboto", "PTMono", "ShantellSans", "SofiaSans", "YanoneKaffeesatz", "RubikMedium", "RubikBlack"]).optional(),
    fontWeight: z.union([z.literal(400), z.literal(500), z.literal(700)]).optional(),
    fontSize: z.number().min(8).max(100).optional(),
    color: color.optional(), bgColor: color.optional(),
    textAlign: z.enum(["left", "center", "right"]).optional(),
    left: position.optional(), top: position.optional(),
    angle: z.number().min(-360).max(360).optional(),
    scale: z.number().positive().max(100).optional(),
    zIndex: z.number().int().min(0).max(1000).optional(),
    textWidth: z.number().positive().max(16384).optional(),
    textHeight: z.number().positive().max(16384).optional(),
}).superRefine((value, ctx) => {
    if (value.type === "mention") {
        if (!/^@[A-Za-z0-9_.]{1,100}$/.test(value.text))
            ctx.addIssue({ code: "custom", path: ["text"], message: "A mention must be one @username" });
        return; // OF fixes mentions to Roboto 500 regardless of supplied font values.
    }
    const weights = { Roboto: [400, 500, 700], PTMono: [400], ShantellSans: [400], SofiaSans: [400], YanoneKaffeesatz: [700], RubikMedium: [500], RubikBlack: [700] };
    if (value.fontWeight && !weights[value.fontFamily ?? "Roboto"].includes(value.fontWeight))
        ctx.addIssue({ code: "custom", path: ["fontWeight"], message: "The chosen font does not support this weight" });
});
const highlight = { title: name, coverStoryId: id, storyIds: ids.min(1) };
const timezone = z.string().min(1).max(100).refine(value => {
    try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
    }
    catch {
        return false;
    }
}, "Use an IANA timezone");
const queueWindow = { publishDateStart: z.iso.date(), publishDateEnd: z.iso.date(), timezone };
function checkQueueWindow(value, ctx) {
    if (value.publishDateEnd < value.publishDateStart)
        ctx.addIssue({ code: "custom", path: ["publishDateEnd"], message: "The end date must not precede the start date" });
    if (Date.parse(value.publishDateEnd) - Date.parse(value.publishDateStart) > 366 * 86400000)
        ctx.addIssue({ code: "custom", path: ["publishDateEnd"], message: "Choose a queue window of at most 366 days" });
}
/** Closed schemas are also the form and SDK contract; no provider path/body passthrough. */
export const ofapiPublishingActionOptions = [
    z.strictObject({ ...base, action: z.literal("post_create"), ...post, previews: media.optional() }).superRefine((v, ctx) => { checkPost(v, ctx); checkPreviews(v, ctx); }),
    z.strictObject({ ...base, action: z.literal("post_update"), postId: id, ...post, priceCents: wholeDollarCents.max(10000).refine(value => value === 0 || value >= 300).optional() }).superRefine((v, ctx) => { checkPost(v, ctx); checkPrice(v, ctx); }),
    z.strictObject({ ...base, action: z.literal("post_delete"), postId: id }),
    z.strictObject({ ...base, action: z.literal("post_archive"), postId: id }),
    z.strictObject({ ...base, action: z.literal("post_unarchive"), postId: id }),
    z.strictObject({ ...base, action: z.literal("post_toggle_pin"), postId: id }),
    z.strictObject({ ...base, action: z.literal("post_label_create"), name }),
    z.strictObject({ ...base, action: z.literal("post_comment_create"), postId: id, text: text.refine(value => Boolean(value.trim()), "Write comment text"), answerTo: id.optional(), giphyId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/).optional() }),
    z.strictObject({ ...base, action: z.literal("post_comment_delete"), postId: id, commentId: id }),
    z.strictObject({ ...base, action: z.literal("post_comment_pin"), postId: id, commentId: id }),
    z.strictObject({ ...base, action: z.literal("post_comment_unpin"), postId: id, commentId: id }),
    z.strictObject({ ...base, action: z.literal("post_comment_like"), postId: id, commentId: id }),
    z.strictObject({ ...base, action: z.literal("post_comment_unlike"), postId: id, commentId: id }),
    z.strictObject({ ...base, action: z.literal("story_create"), mediaFiles: media.min(1), reuseProviderOperation: z.literal(false).default(false), texts: z.array(overlay).max(20).optional(), questionText: z.string().trim().min(1).max(2000).optional(), questionColor: color.optional(), questionLeft: position.optional(), questionTop: position.optional(), questionWidth: z.number().positive().max(16384).optional(), questionHeight: z.number().positive().max(16384).optional(), canvasWidth: z.number().int().positive().max(16384).optional(), canvasHeight: z.number().int().positive().max(16384).optional() }).superRefine((v, ctx) => {
        if (!v.questionText && [v.questionColor, v.questionLeft, v.questionTop, v.questionWidth, v.questionHeight].some(item => item !== undefined))
            ctx.addIssue({ code: "custom", path: ["questionText"], message: "Sticker styling requires question text" });
    }),
    z.strictObject({ ...base, action: z.literal("story_delete"), storyId: id }),
    z.strictObject({ ...base, action: z.literal("story_mark_watched"), storyId: id }),
    z.strictObject({ ...base, action: z.literal("highlight_create"), ...highlight }),
    z.strictObject({ ...base, action: z.literal("highlight_update"), highlightId: id, ...highlight }),
    z.strictObject({ ...base, action: z.literal("highlight_delete"), highlightId: id }),
    z.strictObject({ ...base, action: z.literal("highlight_add_story"), highlightId: id, storyId: id }),
    z.strictObject({ ...base, action: z.literal("highlight_remove_story"), highlightId: id, storyId: id }),
    z.strictObject({ ...base, action: z.literal("campaign_create"), ...campaign, excludedLists: unique(listId, 50).optional(), subscribedWithinLastDays: z.number().int().min(1).max(30).optional(), rfTag: ids.optional(), rfPartner: ids.optional(), rfGuest: ids.optional() }).superRefine((v, ctx) => {
        checkCampaign(v, ctx);
        if (v.subscribedWithinLastDays && (v.scheduledDate || v.saveForLater))
            ctx.addIssue({ code: "custom", path: ["subscribedWithinLastDays"], message: "Recent-subscriber targeting cannot be scheduled or saved for later" });
        if (v.excludedLists?.some(item => v.userLists?.includes(item)))
            ctx.addIssue({ code: "custom", path: ["excludedLists"], message: "A list cannot be both included and excluded" });
    }),
    z.strictObject({ ...base, action: z.literal("campaign_update"), campaignId: id, ...campaign, saveForLater: z.never().optional() }).superRefine(checkCampaign),
    z.strictObject({ ...base, action: z.literal("campaign_cancel"), campaignId: id }),
    z.strictObject({ ...base, action: z.literal("queue_list"), ...queueWindow, limit: z.number().int().min(1).max(100).optional(), types: unique(z.enum(["chat", "post"]), 2).min(1).optional() }).superRefine(checkQueueWindow),
    z.strictObject({ ...base, action: z.literal("queue_counts"), ...queueWindow }).superRefine(checkQueueWindow),
    z.strictObject({ ...base, action: z.literal("queue_publish"), queueId: id }),
];
export const ofapiPublishingActionSchema = z.union(ofapiPublishingActionOptions);
/** Time changes must not invalidate idempotent retrieval of a previously accepted intent. */
export function ofapiPublishingAdmissionIssue(command, now) {
    if ("scheduledDate" in command && command.scheduledDate && Date.parse(command.scheduledDate) <= now.getTime())
        return "Scheduled publication time must be in the future";
    if (command.action === "queue_list" || command.action === "queue_counts") {
        const parts = new Intl.DateTimeFormat("en", { timeZone: command.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
        const part = (type) => parts.find(p => p.type === type).value;
        if (command.publishDateStart < `${part("year")}-${part("month")}-${part("day")}`)
            return "Queue start must be today or later in the selected timezone";
    }
    return null;
}
