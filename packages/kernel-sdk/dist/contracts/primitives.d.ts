/**
 * Contract primitives shared by more than one route module.
 *
 * WHY THIS FILE EXISTS: `routes.ts` grew these as private consts at its top, and
 * every one of them is house vocabulary rather than route-local detail — money is
 * integer mills, a platform is one of two, a boolean query parameter arrives as
 * the string `"true"`. The Agent Read Plane declares its operations in a sibling
 * module (`routes-agent.ts`), and a second copy of `mills` or `platformEnum`
 * there would be exactly the drift that puts two different types for one concept
 * on the wire (see `agent-read-registry.ts`'s header for the same law applied to
 * the claim vocabulary).
 *
 * These declarations were MOVED here verbatim; the extraction commit asserts the
 * generated artifacts (`reference/`, `packages/sdk`) are byte-identical, so the
 * move provably changed no contract.
 */
import { z } from "zod";
export declare const intId: z.ZodNumber;
/** Money on the wire is always an INTEGER count of mills (1 mill = $0.001). */
export declare const mills: z.ZodNumber;
export declare const isoTimestamp: z.ZodString;
export declare const businessDate: z.ZodString;
export declare const platformEnum: z.ZodEnum<{
    fansly: "fansly";
    onlyfans: "onlyfans";
}>;
export declare const transactionTypeEnum: z.ZodEnum<{
    subscription: "subscription";
    tip: "tip";
    message_purchase: "message_purchase";
    post_purchase: "post_purchase";
    stream_tip: "stream_tip";
    chargeback: "chargeback";
    refund: "refund";
    payout_reversal: "payout_reversal";
    other: "other";
}>;
export declare const transactionStateEnum: z.ZodEnum<{
    pending: "pending";
    posted: "posted";
    unknown: "unknown";
}>;
export declare const sortDirEnum: z.ZodEnum<{
    asc: "asc";
    desc: "desc";
}>;
export declare const fanSearchMatchKindEnum: z.ZodEnum<{
    username: "username";
    platformUserId: "platformUserId";
    alias: "alias";
    displayName: "displayName";
}>;
/**
 * A boolean that arrives as a query string. Fastify hands the raw `"true"` /
 * `"false"` text through, so the coercion happens here rather than at each use;
 * anything else is left alone and fails the boolean check with a real message.
 */
export declare const queryBooleanSchema: z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodBoolean>;
/** The error body is EXACTLY these three fields; there are no structural extensions. */
export declare const errorResponseSchema: z.ZodObject<{
    error: z.ZodString;
    message: z.ZodString;
    statusCode: z.ZodNumber;
    reason: z.ZodOptional<z.ZodString>;
    statusUrl: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const paginationQuerySchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export declare const pageParamsSchema: z.ZodObject<{
    pageLabel: z.ZodString;
}, z.core.$strip>;
export declare const fanLookupParamsSchema: z.ZodObject<{
    platform: z.ZodEnum<{
        fansly: "fansly";
        onlyfans: "onlyfans";
    }>;
    platformUserId: z.ZodString;
}, z.core.$strip>;
