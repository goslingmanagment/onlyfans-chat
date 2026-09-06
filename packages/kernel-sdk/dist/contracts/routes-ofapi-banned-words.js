import { z } from "zod";
import { errorResponseSchema } from "./primitives";
export const ofapiBannedWordSchema = z.object({ word: z.string(), riskLevel: z.string(), category: z.string().nullable(), alternatives: z.string().nullable() });
export const ofapiBannedDictionarySchema = z.object({ version: z.string(), observedAt: z.string(), complete: z.boolean(), pages: z.number().int(), entries: z.array(ofapiBannedWordSchema) });
export const ofapiBannedPreviewSchema = z.object({ version: z.string().nullable(), observedAt: z.string().nullable(), complete: z.boolean(), matching: z.literal("literal_case_insensitive"), matches: z.array(ofapiBannedWordSchema.extend({ start: z.number().int(), end: z.number().int() })) });
const errors = { 400: errorResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema, 503: errorResponseSchema };
export const ofapiBannedWordRouteSchemas = {
    ofapiBannedWordsAdminGet: { auth: { kind: "owner-session" }, tags: ["admin"], summary: "Read retained dictionary evidence without a vendor call", response: { 200: ofapiBannedDictionarySchema.nullable(), ...errors } },
    ofapiBannedWordsGet: { auth: { kind: "apiKey" }, tags: ["ingest"], summary: "Read retained vendor banned-word dictionary with coverage", response: { 200: ofapiBannedDictionarySchema.nullable(), ...errors } },
    ofapiBannedWordsPreview: { auth: { kind: "apiKey" }, tags: ["ingest"], summary: "Preview literal banned words locally without altering text", body: z.object({ text: z.string().max(10000) }).strict(), response: { 200: ofapiBannedPreviewSchema, ...errors } },
    ofapiBannedWordsRefresh: { auth: { kind: "owner-session" }, tags: ["admin"], summary: "Explicit bounded dictionary refresh; no background collection", body: z.object({ maxPages: z.number().int().min(1).max(30) }).strict(), response: { 200: ofapiBannedDictionarySchema, ...errors } },
};
