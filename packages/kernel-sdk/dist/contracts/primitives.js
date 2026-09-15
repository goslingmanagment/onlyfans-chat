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
import { isValidBusinessDateString, platforms, transactionStates, transactionTypes, } from "../shared/index";
import { z } from "zod";
export const intId = z.number().int().positive();
/** Money on the wire is always an INTEGER count of mills (1 mill = $0.001). */
export const mills = z.number().int();
export const isoTimestamp = z.string();
export const businessDate = z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => isValidBusinessDateString(value), "Invalid business date");
export const platformEnum = z.enum(platforms);
export const transactionTypeEnum = z.enum(transactionTypes);
export const transactionStateEnum = z.enum(transactionStates);
export const sortDirEnum = z.enum(["asc", "desc"]);
export const fanSearchMatchKindEnum = z.enum([
    "platformUserId",
    "username",
    "alias",
    "displayName",
]);
/**
 * A boolean that arrives as a query string. Fastify hands the raw `"true"` /
 * `"false"` text through, so the coercion happens here rather than at each use;
 * anything else is left alone and fails the boolean check with a real message.
 */
export const queryBooleanSchema = z.preprocess((value) => {
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true") {
            return true;
        }
        if (normalized === "false") {
            return false;
        }
    }
    return value;
}, z.boolean());
/** The error body is EXACTLY these three fields; there are no structural extensions. */
export const errorResponseSchema = z.object({
    error: z.string(),
    message: z.string(),
    statusCode: z.number().int(),
    // Documented structured extension (docs/error-handling.md §3): a machine
    // reason alongside the code, present only where the registry says so —
    // `unauthorized` for a presented device token that matched a row
    // (token_revoked | token_expired) and `conflict` on account-link redemption
    // (used | expired | revoked). Optional, so every other error stays as it was.
    reason: z.string().optional(),
});
export const paginationQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
});
export const pageParamsSchema = z.object({
    pageLabel: z.string().min(1),
});
export const fanLookupParamsSchema = z.object({
    platform: platformEnum,
    platformUserId: z.string().min(1),
});
