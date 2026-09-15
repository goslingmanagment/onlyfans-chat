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
/** Derived, never hand-listed: the enum IS the closed matrix (spec §8). */
export declare const agentKeyCapabilityEnum: z.ZodEnum<{
    "read:messages": "read:messages";
    "read:money": "read:money";
    "read:observations_envelope": "read:observations_envelope";
    "read:datasets": "read:datasets";
    "request:hydration": "request:hydration";
}>;
/**
 * Defaults chosen at plan time (§9 OPEN item 25) and editable per key at
 * issuance. They are generous on purpose: the budget exists to bound a runaway
 * loop, not to ration honest work.
 */
export declare const AGENT_KEY_DEFAULT_DAILY_REQUEST_BUDGET = 5000;
export declare const AGENT_KEY_DEFAULT_DAILY_ROW_BUDGET = 500000;
/** The sliding default; the hard ceiling lives with the repository. */
export declare const AGENT_KEY_DEFAULT_LIFETIME_DAYS = 90;
/**
 * Everything a listing may say about a key. `keyDigest` is absent BY DESIGN:
 * `keyPrefix` identifies a key to a human, the digest would let a leaked listing
 * be checked against a guessed token offline.
 */
export declare const agentKeyItemSchema: z.ZodObject<{
    id: z.ZodNumber;
    name: z.ZodString;
    keyPrefix: z.ZodString;
    capabilities: z.ZodArray<z.ZodEnum<{
        "read:messages": "read:messages";
        "read:money": "read:money";
        "read:observations_envelope": "read:observations_envelope";
        "read:datasets": "read:datasets";
        "request:hydration": "request:hydration";
    }>>;
    pageLabels: z.ZodArray<z.ZodString>;
    dailyRequestBudget: z.ZodNumber;
    dailyRowBudget: z.ZodNumber;
    expiresAt: z.ZodString;
    createdAt: z.ZodString;
    revokedAt: z.ZodNullable<z.ZodString>;
    lastUsedAt: z.ZodNullable<z.ZodString>;
    isActive: z.ZodBoolean;
}, z.core.$strict>;
export declare const agentKeyCreateBodySchema: z.ZodObject<{
    name: z.ZodString;
    capabilities: z.ZodArray<z.ZodEnum<{
        "read:messages": "read:messages";
        "read:money": "read:money";
        "read:observations_envelope": "read:observations_envelope";
        "read:datasets": "read:datasets";
        "request:hydration": "request:hydration";
    }>>;
    pageLabels: z.ZodArray<z.ZodString>;
    dailyRequestBudget: z.ZodDefault<z.ZodNumber>;
    dailyRowBudget: z.ZodDefault<z.ZodNumber>;
    expiresInDays: z.ZodDefault<z.ZodNumber>;
}, z.core.$strict>;
export declare const agentKeyCreateResponseSchema: z.ZodObject<{
    token: z.ZodString;
    key: z.ZodObject<{
        id: z.ZodNumber;
        name: z.ZodString;
        keyPrefix: z.ZodString;
        capabilities: z.ZodArray<z.ZodEnum<{
            "read:messages": "read:messages";
            "read:money": "read:money";
            "read:observations_envelope": "read:observations_envelope";
            "read:datasets": "read:datasets";
            "request:hydration": "request:hydration";
        }>>;
        pageLabels: z.ZodArray<z.ZodString>;
        dailyRequestBudget: z.ZodNumber;
        dailyRowBudget: z.ZodNumber;
        expiresAt: z.ZodString;
        createdAt: z.ZodString;
        revokedAt: z.ZodNullable<z.ZodString>;
        lastUsedAt: z.ZodNullable<z.ZodString>;
        isActive: z.ZodBoolean;
    }, z.core.$strict>;
}, z.core.$strict>;
export declare const agentKeyParamsSchema: z.ZodObject<{
    id: z.ZodCoercedNumber<unknown>;
}, z.core.$strict>;
export declare const agentKeyRevokeResponseSchema: z.ZodObject<{
    id: z.ZodNumber;
    revoked: z.ZodBoolean;
    revokedAt: z.ZodNullable<z.ZodString>;
}, z.core.$strict>;
export declare const agentKeyAdminRouteSchemas: {
    readonly agentKeyCreate: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["agent"];
        readonly summary: "Issue an agent read-plane key (returns the raw token exactly once)";
        readonly body: z.ZodObject<{
            name: z.ZodString;
            capabilities: z.ZodArray<z.ZodEnum<{
                "read:messages": "read:messages";
                "read:money": "read:money";
                "read:observations_envelope": "read:observations_envelope";
                "read:datasets": "read:datasets";
                "request:hydration": "request:hydration";
            }>>;
            pageLabels: z.ZodArray<z.ZodString>;
            dailyRequestBudget: z.ZodDefault<z.ZodNumber>;
            dailyRowBudget: z.ZodDefault<z.ZodNumber>;
            expiresInDays: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strict>;
        readonly response: {
            readonly 200: z.ZodObject<{
                token: z.ZodString;
                key: z.ZodObject<{
                    id: z.ZodNumber;
                    name: z.ZodString;
                    keyPrefix: z.ZodString;
                    capabilities: z.ZodArray<z.ZodEnum<{
                        "read:messages": "read:messages";
                        "read:money": "read:money";
                        "read:observations_envelope": "read:observations_envelope";
                        "read:datasets": "read:datasets";
                        "request:hydration": "request:hydration";
                    }>>;
                    pageLabels: z.ZodArray<z.ZodString>;
                    dailyRequestBudget: z.ZodNumber;
                    dailyRowBudget: z.ZodNumber;
                    expiresAt: z.ZodString;
                    createdAt: z.ZodString;
                    revokedAt: z.ZodNullable<z.ZodString>;
                    lastUsedAt: z.ZodNullable<z.ZodString>;
                    isActive: z.ZodBoolean;
                }, z.core.$strict>;
            }, z.core.$strict>;
            readonly 400: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 409: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        };
    };
    readonly agentKeyList: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["agent"];
        readonly summary: "List agent read-plane keys (digests are never returned)";
        readonly response: {
            readonly 200: z.ZodArray<z.ZodObject<{
                id: z.ZodNumber;
                name: z.ZodString;
                keyPrefix: z.ZodString;
                capabilities: z.ZodArray<z.ZodEnum<{
                    "read:messages": "read:messages";
                    "read:money": "read:money";
                    "read:observations_envelope": "read:observations_envelope";
                    "read:datasets": "read:datasets";
                    "request:hydration": "request:hydration";
                }>>;
                pageLabels: z.ZodArray<z.ZodString>;
                dailyRequestBudget: z.ZodNumber;
                dailyRowBudget: z.ZodNumber;
                expiresAt: z.ZodString;
                createdAt: z.ZodString;
                revokedAt: z.ZodNullable<z.ZodString>;
                lastUsedAt: z.ZodNullable<z.ZodString>;
                isActive: z.ZodBoolean;
            }, z.core.$strict>>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        };
    };
    readonly agentKeyRevoke: {
        readonly auth: {
            readonly kind: "owner-session";
        };
        readonly tags: readonly ["agent"];
        readonly summary: "Revoke an agent read-plane key (idempotent)";
        readonly params: z.ZodObject<{
            id: z.ZodCoercedNumber<unknown>;
        }, z.core.$strict>;
        readonly response: {
            readonly 200: z.ZodObject<{
                id: z.ZodNumber;
                revoked: z.ZodBoolean;
                revokedAt: z.ZodNullable<z.ZodString>;
            }, z.core.$strict>;
            readonly 401: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 403: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            readonly 404: z.ZodObject<{
                error: z.ZodString;
                message: z.ZodString;
                statusCode: z.ZodNumber;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        };
    };
};
export type AgentKeyItem = z.infer<typeof agentKeyItemSchema>;
export type AgentKeyCreateBody = z.infer<typeof agentKeyCreateBodySchema>;
export type AgentKeyCreateResponse = z.infer<typeof agentKeyCreateResponseSchema>;
export type AgentKeyRevokeResponse = z.infer<typeof agentKeyRevokeResponseSchema>;
