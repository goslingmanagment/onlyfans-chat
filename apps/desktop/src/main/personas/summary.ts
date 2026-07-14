import {
  isValidSummaryCacheEntry,
  type SummaryCacheEntry,
} from '@chatgoose/shared/summary/validity';
import {
  loadPersonaAccountMappings,
  personaSummaryCacheIdentity,
  type PersonaSettingsQueries,
  type PersonaStorageScope,
} from './pending';
import { loadPersonaCatalog, resolvePersonaMapping } from './catalog';

export const PERSONA_SUMMARY_MODEL_ID = 'kernel';
/** The opaque definitionId is the restore-safe provenance. This legacy
 * numeric column remains required by the DB shape but is not an identity. */
export const PERSONA_SUMMARY_VERSION_SENTINEL = 0;

export interface CurrentPersonaSummaryIdentity {
  cacheIdentity: string;
}

/** Resolve the active, Hub-scoped persona revision for one account. */
export function currentPersonaSummaryIdentity(
  settings: PersonaSettingsQueries,
  scope: PersonaStorageScope,
  accountId: string,
): CurrentPersonaSummaryIdentity | null {
  const personaKey = loadPersonaAccountMappings(settings, scope)[accountId];
  if (personaKey === undefined || personaKey === '') return null;
  const resolution = resolvePersonaMapping(loadPersonaCatalog(settings, scope), personaKey);
  if (resolution.state !== 'active' || resolution.version === null) return null;
  return {
    cacheIdentity: personaSummaryCacheIdentity(
      scope,
      personaKey,
      resolution.definitionId,
    ),
  };
}

/** Validate all summary provenance except the legacy numeric persona version.
 * `personalityId` already includes Hub origin, key, and opaque definitionId. */
export function isPersonaDefinitionSummary(
  entry: SummaryCacheEntry | null | undefined,
  cacheIdentity: string,
): entry is SummaryCacheEntry {
  return entry !== null && entry !== undefined && isValidSummaryCacheEntry(
    entry,
    cacheIdentity,
    entry.personalityUpdatedAt,
    PERSONA_SUMMARY_MODEL_ID,
  );
}

/** A summary is usable only under the exact Hub origin, key, and definition. */
export function isCurrentPersonaSummary(
  settings: PersonaSettingsQueries,
  scope: PersonaStorageScope,
  accountId: string,
  entry: SummaryCacheEntry | null | undefined,
): entry is SummaryCacheEntry {
  const identity = currentPersonaSummaryIdentity(settings, scope, accountId);
  return identity !== null && isPersonaDefinitionSummary(entry, identity.cacheIdentity);
}
