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

export interface CurrentPersonaSummaryIdentity {
  cacheIdentity: string;
  version: number;
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
    cacheIdentity: personaSummaryCacheIdentity(scope, personaKey),
    version: resolution.version,
  };
}

/** A summary is usable only under the exact Hub origin, mapping, and revision. */
export function isCurrentPersonaSummary(
  settings: PersonaSettingsQueries,
  scope: PersonaStorageScope,
  accountId: string,
  entry: SummaryCacheEntry | null | undefined,
): entry is SummaryCacheEntry {
  const identity = currentPersonaSummaryIdentity(settings, scope, accountId);
  return identity !== null && isValidSummaryCacheEntry(
    entry,
    identity.cacheIdentity,
    identity.version,
    PERSONA_SUMMARY_MODEL_ID,
  );
}
