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
// zod 4.3's own ISO date-time pattern parts (core/regexes.ts): a leap-year-aware
// date, then hh:mm with the seconds optional.
const ISO_DATE_SOURCE = "(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29"
    + "|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))";
const ISO_TIME_SECONDS_OPTIONAL = "(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?";
const ISO_OFFSET = "([+-](?:[01]\\d|2[0-3]):[0-5]\\d)";
const ISO_DATE_TIME_UTC = new RegExp(`^${ISO_DATE_SOURCE}T(?:${ISO_TIME_SECONDS_OPTIONAL}(?:Z))$`);
const ISO_DATE_TIME_UTC_OR_OFFSET = new RegExp(`^${ISO_DATE_SOURCE}T(?:${ISO_TIME_SECONDS_OPTIONAL}(?:Z|${ISO_OFFSET}))$`);
/**
 * An ISO 8601 date-time ending in `Z` (with `offset`, also `±hh:mm`), seconds
 * optional: what every date-time field of this API has accepted. zod 4.5 made
 * `z.iso.datetime()` require seconds (RFC 3339), so `2026-10-10T12:00Z`, valid
 * here until then, would have become a 400. The pattern is zod 4.3's, so the
 * published OpenAPI pattern is unchanged as well.
 *
 * zod's public params omit `pattern`, but its ISO date-time takes a given one
 * (`def.pattern ??= …`); tests/contracts-iso-date-time.test.ts pins both the
 * acceptance and the emitted pattern, so an upgrade that drops this fails there.
 */
export function isoDateTime(options = {}) {
    return options.offset === true
        ? z.iso.datetime({ offset: true, pattern: ISO_DATE_TIME_UTC_OR_OFFSET })
        : z.iso.datetime({ pattern: ISO_DATE_TIME_UTC });
}
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
    // Documented structured extension (docs/error-handling.md §3):
    // `fansly_sync_work_queued` carries the status link of the Fansly Sync
    // Engine work the request is still waiting in.
    statusUrl: z.string().optional(),
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
