// Scoped local persona custody. Global persona definitions are read-only in
// Desktop; this module owns only legacy-row scoping and account mappings.

import { createHash } from 'node:crypto';
import { z } from 'zod';

export interface PersonaSettingsQueries {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  remove(key: string): void;
  /** Crash-atomic settings transition (backed by one SQLite transaction). */
  batch(mutations: readonly PersonaSettingsMutation[]): void;
}

export type PersonaSettingsMutation =
  | { kind: 'set'; key: string; value: unknown }
  | { kind: 'remove'; key: string };

export const LEGACY_PERSONALITIES_KEY = 'personalities';
export const PENDING_PERSONA_INTENTS_KEY = 'personalities.pendingIntents.v1';
export const LEGACY_PERSONA_SCOPE_CLAIM_KEY = 'personalities.legacyScopeClaim.v2';

export interface PersonaStorageScope {
  origin: string;
  digest: string;
}

const legacyPersonaScopeClaimSchema = z.object({
  version: z.literal(1),
  origin: z.string().min(1),
  phase: z.enum(['claimed', 'complete']),
  legacyCachePresent: z.boolean(),
  legacyPendingPresent: z.boolean(),
  legacyMappingsPresent: z.boolean(),
}).strict();

type LegacyPersonaScopeClaim = z.infer<typeof legacyPersonaScopeClaimSchema>;
const accountMappingsSchema = z.record(z.string(), z.string());

export function personaStorageScopeForHub(hubBaseUrl: string): PersonaStorageScope {
  const origin = new URL(hubBaseUrl.trim()).origin;
  return {
    origin,
    digest: createHash('sha256').update(origin).digest('hex'),
  };
}

/** Cache-only persona identity. The raw key alone is not globally unique:
 * two Hub origins can publish the same key/version with different
 * server-owned system content. */
export function personaSummaryCacheIdentity(
  scope: PersonaStorageScope,
  personaKey: string,
  definitionId: string,
): string {
  return `persona-summary:v2:${scope.digest}:${personaKey.length}:${personaKey}`
    + `:${definitionId.length}:${definitionId}`;
}

export function personaCacheKey(scope: PersonaStorageScope | null): string {
  return scope === null
    ? LEGACY_PERSONALITIES_KEY
    : `personalities.cache.v2.${scope.digest}`;
}

export function personaPendingIntentsKey(scope: PersonaStorageScope | null): string {
  return scope === null
    ? PENDING_PERSONA_INTENTS_KEY
    : `personalities.pendingIntents.v2.${scope.digest}`;
}

export function personaAccountMappingsKey(scope: PersonaStorageScope | null): string {
  return scope === null
    ? 'accountMappings'
    : `personalities.accountMappings.v2.${scope.digest}`;
}

function readLegacyScopeClaim(
  settings: PersonaSettingsQueries,
): { kind: 'none' } | { kind: 'invalid' } | { kind: 'valid'; claim: LegacyPersonaScopeClaim } {
  const raw = settings.get(LEGACY_PERSONA_SCOPE_CLAIM_KEY);
  if (raw === undefined) return { kind: 'none' };
  const parsed = legacyPersonaScopeClaimSchema.safeParse(raw);
  return parsed.success
    ? { kind: 'valid', claim: parsed.data }
    : { kind: 'invalid' };
}

function resumeLegacyPersonaScopeClaim(
  settings: PersonaSettingsQueries,
  claim: LegacyPersonaScopeClaim,
): void {
  if (claim.phase === 'complete') return;
  const claimedScope = personaStorageScopeForHub(claim.origin);
  const copies: Array<{ present: boolean; legacyKey: string; scopedKey: string }> = [
    {
      present: claim.legacyCachePresent,
      legacyKey: LEGACY_PERSONALITIES_KEY,
      scopedKey: personaCacheKey(claimedScope),
    },
    {
      present: claim.legacyPendingPresent,
      legacyKey: PENDING_PERSONA_INTENTS_KEY,
      scopedKey: personaPendingIntentsKey(claimedScope),
    },
    {
      present: claim.legacyMappingsPresent,
      legacyKey: 'accountMappings',
      scopedKey: personaAccountMappingsKey(claimedScope),
    },
  ];
  for (const copy of copies) {
    if (!copy.present || settings.get(copy.scopedKey) !== undefined) continue;
    const legacy = settings.get(copy.legacyKey);
    if (legacy !== undefined) settings.set(copy.scopedKey, legacy);
  }
  settings.set(LEGACY_PERSONA_SCOPE_CLAIM_KEY, { ...claim, phase: 'complete' });
}

/**
 * Claims pre-scope persona state to exactly one persisted Hub origin. The raw
 * global rows remain untouched; the scoped copies let mappings follow the Hub
 * without ever offering legacy definitions back to the network.
 */
export function ensurePersonaStorageScope(
  settings: PersonaSettingsQueries,
  hubBaseUrl: string | null,
): PersonaStorageScope | null {
  const currentScope = hubBaseUrl === null ? null : personaStorageScopeForHub(hubBaseUrl);
  const existing = readLegacyScopeClaim(settings);
  if (existing.kind === 'invalid') return currentScope;
  if (existing.kind === 'none') {
    if (currentScope === null) return null;
    const claim: LegacyPersonaScopeClaim = {
      version: 1,
      origin: currentScope.origin,
      phase: 'claimed',
      legacyCachePresent: settings.get(LEGACY_PERSONALITIES_KEY) !== undefined,
      legacyPendingPresent: settings.get(PENDING_PERSONA_INTENTS_KEY) !== undefined,
      legacyMappingsPresent: settings.get('accountMappings') !== undefined,
    };
    settings.set(LEGACY_PERSONA_SCOPE_CLAIM_KEY, claim);
    resumeLegacyPersonaScopeClaim(settings, claim);
    return currentScope;
  }
  resumeLegacyPersonaScopeClaim(settings, existing.claim);
  if (currentScope !== null) return currentScope;
  // While disconnected, keep mappings attached to their last proven Hub.
  return personaStorageScopeForHub(existing.claim.origin);
}

export function loadPersonaAccountMappings(
  settings: PersonaSettingsQueries,
  scope: PersonaStorageScope | null,
): Record<string, string> {
  const parsed = accountMappingsSchema.safeParse(settings.get(personaAccountMappingsKey(scope)));
  return parsed.success ? parsed.data : {};
}

export function storePersonaAccountMapping(
  settings: PersonaSettingsQueries,
  scope: PersonaStorageScope | null,
  accountId: string,
  personalityId: string | null,
): void {
  const mappings = { ...loadPersonaAccountMappings(settings, scope) };
  if (personalityId === null) delete mappings[accountId];
  else mappings[accountId] = personalityId;
  settings.set(personaAccountMappingsKey(scope), accountMappingsSchema.parse(mappings));
}
