import { z } from "zod";
import { ofapiAccountActionOptions } from "./ofapi-actions-account";
import { ofapiPublishingActionOptions } from "./ofapi-actions-publishing";
import { ofapiCollectionActionOptions } from "./ofapi-actions-collections";
import { isoDateTime } from "./primitives";
/** Each batch contributes an explicit schema; clients never submit HTTP paths. */
export const ofapiActionSchema = z.union([...ofapiCollectionActionOptions, ...ofapiPublishingActionOptions, ...ofapiAccountActionOptions]);
export const ofapiActionIntentSchema = z.object({
    id: z.string().uuid(), pageId: z.number().int().positive(), pageLabel: z.string(), accountId: z.string(),
    action: z.string(), command: ofapiActionSchema,
    state: z.enum(["prepared", "dispatching", "confirmed", "partial", "rejected", "indeterminate", "cancelled"]),
    estimatedCredits: z.number().int().nonnegative(), actualCredits: z.number().int().nonnegative().nullable(),
    remoteId: z.string().nullable(), responseData: z.unknown().nullable(), responseMeta: z.unknown().nullable(),
    errorCode: z.string().nullable(), responseObservationId: z.number().nullable(),
    accountingState: z.enum(["pending", "complete"]), createdAt: isoDateTime(),
});
