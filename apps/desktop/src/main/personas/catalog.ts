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
}).strict();

export type PersonaCatalogEntry = z.infer<typeof personaCatalogEntrySchema>;

const personaCatalogSchema = z.array(personaCatalogEntrySchema);

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
  if (previous !== null) {
    const nextByKey = new Map(parsed.map((entry) => [entry.key, entry] as const));
    const isOlderOrIncomplete = previous.some((entry) => {
      const next = nextByKey.get(entry.key);
      return next === undefined || next.version < entry.version;
    });
    if (isOlderOrIncomplete) {
      // Overlapping GETs may settle out of order. Archived rows are durable
      // tombstones in the catalog contract, so losing a key or revision proves
      // this response predates the cached snapshot.
      return previous;
    }
  }
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
): { state: 'unmapped' | 'active' | 'archived' | 'unresolved'; version: number | null } {
  if (personaKey === null || personaKey === '') {
    return { state: 'unmapped', version: null };
  }
  const entry = catalog?.find((candidate) => candidate.key === personaKey);
  if (entry === undefined) {
    return { state: 'unresolved', version: null };
  }
  return entry.status === 'active'
    ? { state: 'active', version: entry.version }
    : { state: 'archived', version: entry.version };
}
