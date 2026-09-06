/**
 * Agent Read Plane — the closed capability matrix.
 *
 * WHY A SEPARATE CONST (and why it is closed): a key's grant is the only thing
 * standing between a machine principal and the agency's verbatim transcripts and
 * money. An unknown capability at issuance is REJECTED, never ignored — silently
 * dropping a typo would mint a key the owner believes is narrower than it is, and
 * silently accepting one would mint a grant nothing in the code can check.
 *
 * The list is normative in the contract appendix (§17.0.5). It is declared here
 * once so that key issuance, the per-operation requirement table, the `agent_keys`
 * CHECK constraint and the capabilities response all derive from the same literal.
 * Sibling of `agent-read-registry.ts`, which owns the claim/plane vocabulary only.
 *
 * Design reference: `investigations/agent-read-api-design-2026-07-31.md` §8.
 */
/**
 * Exactly five. Adding a sixth is a contract change: it widens what a key can be
 * granted, so it travels with a migration for the `agent_keys` CHECK, an entry in
 * the per-operation requirement table, and a decisions.md line.
 */
export declare const AGENT_CAPABILITIES: readonly ["read:messages", "read:money", "read:observations_envelope", "read:datasets", "request:hydration"];
export type AgentCapability = (typeof AGENT_CAPABILITIES)[number];
/**
 * Boundary check for an UNVALIDATED capability name (it arrives from an issuance
 * request or from a stored row). Typed callers keep the literal union; only this
 * seam widens to `string`.
 */
export declare function isAgentCapability(value: string): value is AgentCapability;
