import { z } from 'zod';
import type { PersonaSettingsQueries, PersonaStorageScope } from './pending';

export const LEGACY_PERSONA_SNAPSHOT_KEY = 'personalities.legacySnapshot.v1';

const legacyPersonaSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  capturedAt: z.string().datetime(),
  hubOrigin: z.string().url().nullable(),
  rows: z.record(z.string(), z.unknown()),
}).strict();

export type LegacyPersonaSnapshot = z.infer<typeof legacyPersonaSnapshotSchema>;

export const personaCatalogEntrySchema = z.object({
  key: z.string().min(1),
  displayName: z.string().min(1),
  version: z.number().int().positive(),
  status: z.enum(['active', 'archived']),
  // Opaque restore-safe identity of the exact server-owned definition bytes.
  // This is required by the vendored contract; an old cached snapshot without
  // it is invalidated and refetched instead of being trusted for generation.
  definitionId: z.string().min(16).max(100),
}).strict();

export type PersonaCatalogEntry = z.infer<typeof personaCatalogEntrySchema>;

const personaCatalogSchema = z.array(personaCatalogEntrySchema);

export interface PersonaCatalogReplacementRegression {
  missingKeys: string[];
  lowerVersions: Array<{ key: string; previous: number; next: number }>;
}

/** Diagnostics only. A numeric version or missing key must never veto the
 * latest-started full snapshot: Core may have been restored to a different
 * catalog incarnation, and per-key max merging would resurrect tombstones. */
export function inspectPersonaCatalogReplacement(
  previous: readonly PersonaCatalogEntry[] | null,
  next: readonly PersonaCatalogEntry[],
): PersonaCatalogReplacementRegression | null {
  if (previous === null) return null;
  const nextByKey = new Map(next.map((entry) => [entry.key, entry] as const));
  const missingKeys: string[] = [];
  const lowerVersions: PersonaCatalogReplacementRegression['lowerVersions'] = [];
  for (const entry of previous) {
    const replacement = nextByKey.get(entry.key);
    if (replacement === undefined) {
      missingKeys.push(entry.key);
    } else if (replacement.version < entry.version) {
      lowerVersions.push({
        key: entry.key,
        previous: entry.version,
        next: replacement.version,
      });
    }
  }
  return missingKeys.length === 0 && lowerVersions.length === 0
    ? null
    : { missingKeys, lowerVersions };
}

export function personaCatalogKey(scope: PersonaStorageScope): string {
  return `personalities.catalog.v1.${scope.digest}`;
}

function isLegacyPersonaRow(key: string): boolean {
  return key !== LEGACY_PERSONA_SNAPSHOT_KEY
    && (
      key === 'accountMappings'
      || /persona|personalit|alias/i.test(key)
    );
}

/**
 * Takes the one immutable, crash-atomic copy of every local persona-related
 * settings row. This function is synchronous on purpose: there is no await
 * window between observing an absent snapshot and committing it.
 */
export function ensureLegacyPersonaSnapshot(
  settings: PersonaSettingsQueries & { all(): Record<string, unknown> },
  hubOrigin: string | null,
  now: () => Date = () => new Date(),
): LegacyPersonaSnapshot {
  const existing = settings.get(LEGACY_PERSONA_SNAPSHOT_KEY);
  if (existing !== undefined) {
    // Never replace a corrupt/partial snapshot: immutability is more important
    // than guessing which version should win. Surface the failure for export
    // and keep every raw source row untouched.
    return legacyPersonaSnapshotSchema.parse(existing);
  }

  const rows = Object.fromEntries(
    Object.entries(settings.all())
      .filter(([key]) => isLegacyPersonaRow(key))
      .map(([key, value]) => [key, structuredClone(value)]),
  );
  const snapshot = legacyPersonaSnapshotSchema.parse({
    schemaVersion: 1,
    capturedAt: now().toISOString(),
    hubOrigin,
    rows,
  });
  settings.batch([{ kind: 'set', key: LEGACY_PERSONA_SNAPSHOT_KEY, value: snapshot }]);
  return snapshot;
}

export function loadLegacyPersonaSnapshot(
  settings: PersonaSettingsQueries,
): LegacyPersonaSnapshot | null {
  const raw = settings.get(LEGACY_PERSONA_SNAPSHOT_KEY);
  if (raw === undefined) return null;
  return legacyPersonaSnapshotSchema.parse(raw);
}

export function loadPersonaCatalog(
  settings: PersonaSettingsQueries,
  scope: PersonaStorageScope,
): PersonaCatalogEntry[] | null {
  const raw = settings.get(personaCatalogKey(scope));
  if (raw === undefined) return null;
  const parsed = personaCatalogSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function storePersonaCatalog(
  settings: PersonaSettingsQueries,
  scope: PersonaStorageScope,
  catalog: readonly PersonaCatalogEntry[],
): PersonaCatalogEntry[] {
  const parsed = personaCatalogSchema.parse(catalog);
  const previous = loadPersonaCatalog(settings, scope);
  if (previous !== null && JSON.stringify(previous) === JSON.stringify(parsed)) {
    return previous;
  }
  // Catalog metadata has its own key. In particular this must never overwrite
  // legacy full-text caches, journals, mappings, recovery blobs or aliases.
  settings.set(personaCatalogKey(scope), parsed);
  return parsed;
}

export function resolvePersonaMapping(
  catalog: readonly PersonaCatalogEntry[] | null,
  personaKey: string | null,
):
  | { state: 'unmapped' | 'unresolved'; version: null; definitionId: null }
  | { state: 'active' | 'archived'; version: number; definitionId: string } {
  if (personaKey === null || personaKey === '') {
    return { state: 'unmapped', version: null, definitionId: null };
  }
  const entry = catalog?.find((candidate) => candidate.key === personaKey);
  if (entry === undefined) {
    return { state: 'unresolved', version: null, definitionId: null };
  }
  return entry.status === 'active'
    ? {
        state: 'active',
        version: entry.version,
        definitionId: entry.definitionId,
      }
    : {
        state: 'archived',
        version: entry.version,
        definitionId: entry.definitionId,
      };
}
