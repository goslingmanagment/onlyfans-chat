import { z } from "zod";

const id = z.string().regex(/^[0-9]{1,30}$/);
export const composerOptionsSchema = z
  .object({
    lockedText: z.boolean(),
    replyToMessageId: id.nullable(),
    giphyId: z.string().min(1).max(200).nullable(),
    rfTag: z.array(id).max(50),
    rfPartner: z.array(id).max(50),
    rfGuest: z.array(id).max(50),
    blockBannedWords: z
      .enum(["strict_ban", "risky", "replace_soften"])
      .nullable(),
  })
  .strict();
export type ComposerOptions = z.infer<typeof composerOptionsSchema>;
export const DEFAULT_COMPOSER_OPTIONS: ComposerOptions = {
  lockedText: false,
  replyToMessageId: null,
  giphyId: null,
  rfTag: [],
  rfPartner: [],
  rfGuest: [],
  blockBannedWords: null,
};
/**
 * Review #27 fix 3: `send_message_v2` is required only when the chatter
 * actually used a rich option. A plain text with default options keeps the
 * long-exercised v1 `{ text }` command, so a Hub without the v2 kind still
 * accepts everyday sends and the untested plain-text v2 shape is never sent.
 * Every key of DEFAULT_COMPOSER_OPTIONS is compared (arrays by content), so a
 * future option cannot be silently dropped from the decision. Media, previews
 * and price live outside these options: a media/PPV send is always v2.
 */
export function needsComposerV2(options: ComposerOptions): boolean {
  for (const key of Object.keys(DEFAULT_COMPOSER_OPTIONS) as (keyof ComposerOptions)[]) {
    const value = options[key];
    const fallback = DEFAULT_COMPOSER_OPTIONS[key];
    if (Array.isArray(fallback)) {
      if (!Array.isArray(value) || value.length !== fallback.length) return true;
      if (value.some((item, index) => item !== fallback[index])) return true;
    } else if (value !== fallback) {
      return true;
    }
  }
  return false;
}

export const storedComposerSchema = composerOptionsSchema
  .extend({
    priceCents: z
      .number()
      .int()
      .min(0)
      .max(20000)
      .refine((n) => n === 0 || n >= 300),
    reuseProviderOperation: z.boolean().default(false),
  })
  .strict();
export type StoredComposer = z.infer<typeof storedComposerSchema>;

/** Decimal UI input to integer cents: never multiply a binary floating value. */
export function parsePriceCents(input: string): number | null {
  const value = input.trim().replace(/^\$/, "");
  if (value === "" || value.toLowerCase() === "free") return 0;
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  const cents =
    Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return cents === 0 || (cents >= 300 && cents <= 20000) ? cents : null;
}
export function centsToDollars(cents: number): number {
  if (!Number.isInteger(cents) || cents < 0 || cents > 20000)
    throw new Error("Invalid price cents");
  return Number(
    `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, "0")}`,
  );
}
export function releaseReferenceIds(input: string): string[] {
  if (!input.trim()) return [];
  return z
    .array(id)
    .max(50)
    .parse(input.split(/[\s,]+/).filter(Boolean));
}

export const composerActionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("set_fan_custom_name_v1"),
      customName: z.string().max(100),
    })
    .strict(),
  z
    .object({
      kind: z.enum([
        "like_message_v1",
        "unlike_message_v1",
        "pin_message_v1",
        "unpin_message_v1",
      ]),
      messageId: id,
    })
    .strict(),
  z
    .object({
      kind: z.enum([
        "mark_chat_unread_v1",
        "mute_chat_v1",
        "unmute_chat_v1",
        "hide_chat_v1",
      ]),
    })
    .strict(),
]);
export type ComposerAction = z.infer<typeof composerActionSchema>;
