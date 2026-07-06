import { z } from 'zod';

/** Legacy `SUMMARY_EVICTION_COUNT`: at most this many entries are evicted per quota retry. */
export const SUMMARY_EVICTION_BATCH = 10;

/**
 * One cached fan summary (SPEC §8.5). Keyed externally by `(account, fan_id)` —
 * the SQLite layer owns storage; this module owns validity + eviction ordering.
 */
export interface SummaryCacheEntry {
  body: string;
  personalityId: string;
  /** Unix ms of the personality at generation time; any later edit makes the entry stale. */
  personalityUpdatedAt: number;
  generatedAt: number;
  spendingVerified?: boolean;
  subscriptionVerified?: boolean;
  modelId?: string;
  /** Owned by the hub module; carried opaquely with the row. */
  hubSyncState?: Record<string, unknown>;
}

// Wrong-typed optional fields are dropped, not treated as corrupt (legacy tolerance:
// an entry missing a verification flag is stale, but still a well-formed cache row).
const rawEntrySchema = z.looseObject({
  body: z.string(),
  personalityId: z.string(),
  personalityUpdatedAt: z.number().finite(),
  generatedAt: z.number().finite(),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeSummaryCacheEntry(value: unknown): SummaryCacheEntry | null {
  const parsed = rawEntrySchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }

  const raw = parsed.data;
  const entry: SummaryCacheEntry = {
    body: raw.body,
    personalityId: raw.personalityId,
    personalityUpdatedAt: raw.personalityUpdatedAt,
    generatedAt: raw.generatedAt,
  };

  if (typeof raw['spendingVerified'] === 'boolean') {
    entry.spendingVerified = raw['spendingVerified'];
  }
  if (typeof raw['subscriptionVerified'] === 'boolean') {
    entry.subscriptionVerified = raw['subscriptionVerified'];
  }
  if (typeof raw['modelId'] === 'string') {
    entry.modelId = raw['modelId'];
  }
  if (isRecord(raw['hubSyncState'])) {
    entry.hubSyncState = raw['hubSyncState'];
  }

  return entry;
}

/**
 * Legacy staleness matrix — stale (regenerate) unless ALL hold:
 * same personality, personality unedited since generation, equivalent model
 * selection (legacy bare Claude ids normalize to canonical `anthropic:` ids),
 * and both data-verification flags strictly true.
 */
export function isValidSummaryCacheEntry(
  entry: SummaryCacheEntry | null | undefined,
  personalityId: string,
  personalityUpdatedAt: number,
  modelId: string,
): entry is SummaryCacheEntry {
  return Boolean(
    entry &&
      entry.personalityId === personalityId &&
      entry.personalityUpdatedAt === personalityUpdatedAt &&
      // Stage 31: model ids are kernel config ('kernel' sentinel locally);
      // legacy entries carrying real registry ids go stale once and refresh.
      (entry.modelId ?? null) === (modelId ?? null) &&
      entry.spendingVerified === true &&
      entry.subscriptionVerified === true,
  );
}

export type SummaryRow<K> = readonly [key: K, value: unknown];

/** Normalized entries, dropping corrupt rows; input order preserved. */
export function collectSummaryCacheEntries<K>(
  rows: Iterable<SummaryRow<K>>,
): Map<K, SummaryCacheEntry> {
  const entries = new Map<K, SummaryCacheEntry>();
  for (const [key, value] of rows) {
    const normalized = normalizeSummaryCacheEntry(value);
    if (normalized) {
      entries.set(key, normalized);
    }
  }
  return entries;
}

/** Keys of corrupt rows (fail normalization), in input order. */
export function invalidSummaryCacheKeys<K>(rows: Iterable<SummaryRow<K>>): K[] {
  const keys: K[] = [];
  for (const [key, value] of rows) {
    if (!normalizeSummaryCacheEntry(value)) {
      keys.push(key);
    }
  }
  return keys;
}

/** Keys of the `count` oldest well-formed rows by `generatedAt` ascending. */
export function oldestSummaryCacheKeys<K>(rows: Iterable<SummaryRow<K>>, count: number): K[] {
  return [...collectSummaryCacheEntries(rows)]
    .sort((left, right) => left[1].generatedAt - right[1].generatedAt)
    .slice(0, count)
    .map(([key]) => key);
}

/** Eviction order: corrupt rows first, then oldest by `generatedAt`, capped at `count`. */
export function selectSummaryEvictionKeys<K>(
  rows: Iterable<SummaryRow<K>>,
  count: number = SUMMARY_EVICTION_BATCH,
): K[] {
  if (count <= 0) {
    return [];
  }

  const materialized = [...rows];
  return [
    ...invalidSummaryCacheKeys(materialized),
    ...oldestSummaryCacheKeys(materialized, count),
  ].slice(0, count);
}
