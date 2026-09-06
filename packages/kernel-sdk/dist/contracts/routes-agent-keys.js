/**
 * Agent Read Plane — owner administration of the KEYS themselves.
 *
 * WHY THIS IS NOT IN `routes-agent.ts`: that module is the read plane, and its
 * pins say so — eleven operations, exactly one of them owner-session, an envelope
 * on every 200. Issuing a key is none of those things: it is the owner minting a
 * machine principal, it has no `capture`/`conclusion` to carry, and folding it in
 * would have meant loosening the very pins that make the read plane checkable.
 *
 * WHY IT IS STILL UNDER `/api/v1/agent/`: the plane's `Cache-Control: no-store`
 * hook keys on that prefix, and a response that carries a freshly minted bearer
 * token is the LAST one that may sit in an intermediary. The routes are therefore
 * also registered by the agent-read registrar, after the hook exists.
 *
 * THE ONE RULE THAT SHAPES EVERY SCHEMA HERE: **the raw token is returned once
 * and the digest is never returned at all.** `agentKeyItemSchema` is what a
 * listing may say about a key; there is no code path that widens it.
 *
 * Two validations are DELIBERATELY not restated here:
 *  - the closed capability matrix is derived from `AGENT_CAPABILITIES`, so an
 *    unknown capability is a 400 from the schema and the table CHECK is the
 *    backstop, not a second copy of the rule;
 *  - the 365-day lifetime ceiling is NOT a `.max()` on `expiresInDays`. It lives
 *    in `insertAgentKey` and in the table CHECK; an over-long request travels all
 *    the way there and comes back as that ONE enforcement point's 400. A ceiling
 *    written twice is a ceiling that drifts.
 */
import { z } from "zod";
import { AGENT_CAPABILITIES } from "./agent-read-capabilities";
import { errorResponseSchema, intId } from "./primitives";
import { agentIsoTimestamp } from "./routes-agent";
/** Derived, never hand-listed: the enum IS the closed matrix (spec §8). */
export const agentKeyCapabilityEnum = z.enum(AGENT_CAPABILITIES);
/**
 * Defaults chosen at plan time (§9 OPEN item 25) and editable per key at
 * issuance. They are generous on purpose: the budget exists to bound a runaway
 * loop, not to ration honest work.
 */
export const AGENT_KEY_DEFAULT_DAILY_REQUEST_BUDGET = 5_000;
export const AGENT_KEY_DEFAULT_DAILY_ROW_BUDGET = 500_000;
/** The sliding default; the hard ceiling lives with the repository. */
export const AGENT_KEY_DEFAULT_LIFETIME_DAYS = 90;
/**
 * Everything a listing may say about a key. `keyDigest` is absent BY DESIGN:
 * `keyPrefix` identifies a key to a human, the digest would let a leaked listing
 * be checked against a guessed token offline.
 */
export const agentKeyItemSchema = z.object({
    id: intId,
    name: z.string(),
    /** The displayable head of the token, api-key precedent. Not a secret. */
    keyPrefix: z.string(),
    capabilities: z.array(agentKeyCapabilityEnum),
    /** The EXPLICIT grant, resolved back to labels. No wildcard exists: a page
     *  created after issuance is not granted by anything. */
    pageLabels: z.array(z.string()),
    dailyRequestBudget: z.number().int().nonnegative(),
    dailyRowBudget: z.number().int().nonnegative(),
    expiresAt: agentIsoTimestamp,
    createdAt: agentIsoTimestamp,
    revokedAt: agentIsoTimestamp.nullable(),
    lastUsedAt: agentIsoTimestamp.nullable(),
    /** Neither revoked nor past its expiry, evaluated when the list was read. */
    isActive: z.boolean(),
}).strict();
export const agentKeyCreateBodySchema = z.object({
    name: z.string().min(1).max(200),
    capabilities: z.array(agentKeyCapabilityEnum).min(1).max(AGENT_CAPABILITIES.length),
    /** At least one: a key granted no page can read nothing, and issuing one would
     *  only produce a credential that fails confusingly at every call. */
    pageLabels: z.array(z.string().min(1).max(200)).min(1).max(200),
    dailyRequestBudget: z.number().int().min(1).max(1_000_000)
        .default(AGENT_KEY_DEFAULT_DAILY_REQUEST_BUDGET),
    dailyRowBudget: z.number().int().min(1).max(100_000_000)
        .default(AGENT_KEY_DEFAULT_DAILY_ROW_BUDGET),
    /** Days from issuance. The upper bound here is a sanity rail on the INPUT, far
     *  above the real ceiling; the ceiling itself is enforced once, in the
     *  repository, and reported as a 400 (see the file header). */
    expiresInDays: z.number().int().min(1).max(10_000)
        .default(AGENT_KEY_DEFAULT_LIFETIME_DAYS),
}).strict();
export const agentKeyCreateResponseSchema = z.object({
    /**
     * THE ONLY TIME THIS VALUE EXISTS OUTSIDE THE CALLER'S PROCESS. The hub stores
     * `sha256(token)`; there is no re-read route, and a lost token is re-issued,
     * never recovered.
     */
    token: z.string(),
    key: agentKeyItemSchema,
}).strict();
export const agentKeyParamsSchema = z.object({
    id: z.coerce.number().int().min(1),
}).strict();
export const agentKeyRevokeResponseSchema = z.object({
    id: intId,
    /** False when the key was ALREADY revoked. Idempotent by construction: the
     *  second call does not move the original revocation timestamp. */
    revoked: z.boolean(),
    revokedAt: agentIsoTimestamp.nullable(),
}).strict();
export const agentKeyAdminRouteSchemas = {
    agentKeyCreate: {
        auth: { kind: "owner-session" },
        tags: ["agent"],
        summary: "Issue an agent read-plane key (returns the raw token exactly once)",
        body: agentKeyCreateBodySchema,
        response: {
            200: agentKeyCreateResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
        },
    },
    agentKeyList: {
        auth: { kind: "owner-session" },
        tags: ["agent"],
        summary: "List agent read-plane keys (digests are never returned)",
        response: {
            200: z.array(agentKeyItemSchema),
            401: errorResponseSchema,
            403: errorResponseSchema,
        },
    },
    agentKeyRevoke: {
        auth: { kind: "owner-session" },
        tags: ["agent"],
        summary: "Revoke an agent read-plane key (idempotent)",
        params: agentKeyParamsSchema,
        response: {
            200: agentKeyRevokeResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
        },
    },
};
