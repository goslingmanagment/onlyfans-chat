import { z } from 'zod';

/** Subset of an OFAPI chat-message `media[]` entry consumed for transcript labels. */
export const ofapiMessageMediaSchema = z.looseObject({
  id: z.union([z.number(), z.string()]).nullish(),
  /** Observed values: 'photo' | 'video' | 'audio' | 'gif' (openapi.json); tolerate anything. */
  type: z.string().nullish(),
  canView: z.boolean().nullish(),
});

/**
 * Fields of an OFAPI `GET /{account}/chats/{chat_id}/messages` item consumed by the
 * transcript builder. Loose: OFAPI adds fields freely.
 */
export const ofapiChatMessageSchema = z.looseObject({
  id: z.number(),
  /** OF HTML ('<p>…</p>', '<br>', entities) — stripped to plain text downstream. */
  text: z.string().nullish(),
  giphyId: z.union([z.string(), z.number()]).nullish(),
  lockedText: z.boolean().nullish(),
  isFree: z.boolean().nullish(),
  /** Dollars, never mills. */
  price: z.number().nullish(),
  isOpened: z.boolean().nullish(),
  isNew: z.boolean().nullish(),
  isTip: z.boolean().nullish(),
  isFromQueue: z.boolean().nullish(),
  mediaCount: z.number().nullish(),
  media: z.array(ofapiMessageMediaSchema).nullish(),
  previews: z.array(z.unknown()).nullish(),
  isSentByMe: z.boolean(),
  /** ISO datetime with offset, e.g. '2026-06-10T14:56:16+00:00' (probe-verified). */
  createdAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'createdAt must be a parseable ISO datetime',
  }),
  changedAt: z.string().nullish(),
  /**
   * Not present in current OFAPI shapes (verified against openapi.json + live probe).
   * Step 1 of the SPEC §8.2 tip-amount ladder if OFAPI ever adds it. Dollars.
   */
  tipAmount: z.number().nullish(),
  replyToMessage: z.unknown().optional(),
});

export type OfapiMessageMedia = z.infer<typeof ofapiMessageMediaSchema>;
export type OfapiChatMessage = z.infer<typeof ofapiChatMessageSchema>;

/** Validates a raw OFAPI `data` array at the trust boundary. */
export function parseOfapiChatMessages(raw: unknown): OfapiChatMessage[] {
  return z.array(ofapiChatMessageSchema).parse(raw);
}
