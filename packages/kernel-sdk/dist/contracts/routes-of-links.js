import { z } from "zod";
import { ofLinkChannelsResponseSchema, ofLinkHistoryResponseSchema, ofLinkKindSchema, ofLinksResponseSchema, } from "./of-links";
import { businessDate, errorResponseSchema } from "./primitives";
const errors = { 400: errorResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema };
const pageId = z.coerce.number().int().positive();
// «Ссылки OnlyFans» (traffic sources plan, PR 12). Owner-only local reads of
// the link series, the bindings and the collection state: no vendor egress,
// no writes. Vocabulary and units: ./of-links.ts.
export const ofLinksRouteSchemas = {
    ofLinksGet: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Read every OnlyFans link with its latest snapshot, both money figures, its channel and the series' collection state",
        querystring: z.object({ pageId: pageId.optional() }),
        response: { 200: ofLinksResponseSchema, ...errors },
    },
    ofLinksHistoryGet: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Read one OnlyFans link's snapshots, its list's collection attempts and its business-day deltas over a range of Moscow days",
        querystring: z.object({
            pageId,
            linkKind: ofLinkKindSchema,
            linkRef: z.string().regex(/^[0-9]{1,20}$/),
            /** First Moscow business day, inclusive; default 29 days before `to`. */
            from: businessDate.optional(),
            /** Last Moscow business day, inclusive; default today. */
            to: businessDate.optional(),
        }),
        response: { 200: ofLinkHistoryResponseSchema, ...errors },
    },
    ofLinksChannelsGet: {
        auth: { kind: "owner-session" },
        tags: ["admin"],
        summary: "Read OnlyFans link totals by channel and contractor over a range of Moscow days, links without a channel in their own row",
        querystring: z.object({
            /** First Moscow business day, inclusive; default the series' first day. */
            from: businessDate.optional(),
            /** Last Moscow business day, inclusive; default today. */
            to: businessDate.optional(),
            /** Only this page's links; default all pages. */
            pageId: pageId.optional(),
        }),
        response: { 200: ofLinkChannelsResponseSchema, ...errors },
    },
};
