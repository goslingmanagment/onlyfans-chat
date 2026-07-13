// Durable persona mutation journal. Persona content is user-authored data, so a
// transient Hub failure must never turn a later authoritative GET into a local
// rollback. One latest intent per key is retained until Core confirms the
// desired state; compare-and-swap clears prevent an older request from deleting
// a newer intent for the same persona.

import { createHash, randomUUID } from 'node:crypto';
import { routeSchemas } from '@kernel/sdk';
import { HubError } from '@chatgoose/shared/hub/index';
import type { Personality } from '@chatgoose/shared/types';
import { z } from 'zod';

export interface PersonaSettingsQueries {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  remove(key: string): void;
}

export const LEGACY_PERSONALITIES_KEY = 'personalities';
export const PENDING_PERSONA_INTENTS_KEY = 'personalities.pendingIntents.v1';
export const LEGACY_PERSONA_SCOPE_CLAIM_KEY = 'personalities.legacyScopeClaim.v2';
export const MAX_PENDING_PERSONA_INTENTS = 128;
export const MAX_PENDING_PERSONA_PREDECESSORS = 128;

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

const personaBootstrapCompleteSchema = z.object({
  version: z.literal(1),
  origin: z.string().min(1),
}).strict();

const accountMappingsSchema = z.record(z.string(), z.string());

export function personaStorageScopeForHub(hubBaseUrl: string): PersonaStorageScope {
  const origin = new URL(hubBaseUrl.trim()).origin;
  return {
    origin,
    digest: createHash('sha256').update(origin).digest('hex'),
  };
}

export function samePersonaStorageScope(
  left: PersonaStorageScope | null,
  right: PersonaStorageScope | null,
): boolean {
  return left?.origin === right?.origin;
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

function personaBootstrapCompleteKey(scope: PersonaStorageScope): string {
  return `personalities.legacyBootstrapComplete.v2.${scope.digest}`;
}

export function personaLegacyRecoveryKey(scope: PersonaStorageScope): string {
  return `personalities.legacyRecovery.v1.${scope.digest}`;
}

function readLegacyScopeClaim(
  settings: PersonaSettingsQueries,
): { kind: 'none' } | { kind: 'invalid' } | { kind: 'valid'; claim: LegacyPersonaScopeClaim } {
  const raw = settings.get(LEGACY_PERSONA_SCOPE_CLAIM_KEY);
  if (raw === undefined) {
    return { kind: 'none' };
  }
  const parsed = legacyPersonaScopeClaimSchema.safeParse(raw);
  return parsed.success
    ? { kind: 'valid', claim: parsed.data }
    : { kind: 'invalid' };
}

function resumeLegacyPersonaScopeClaim(
  settings: PersonaSettingsQueries,
  claim: LegacyPersonaScopeClaim,
): void {
  if (claim.phase === 'complete') {
    return;
  }
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
    if (!copy.present || settings.get(copy.scopedKey) !== undefined) {
      continue;
    }
    const legacy = settings.get(copy.legacyKey);
    if (legacy !== undefined) {
      settings.set(copy.scopedKey, legacy);
    }
  }
  settings.set(LEGACY_PERSONA_SCOPE_CLAIM_KEY, { ...claim, phase: 'complete' });
}

/**
 * Claims pre-scope persona state to exactly one persisted Hub origin. The claim
 * is written before any copy. A crash can therefore leave work incomplete, but
 * a later boot (even while configured for a different Hub) can only resume the
 * copy into the originally claimed origin.
 */
export function ensurePersonaStorageScope(
  settings: PersonaSettingsQueries,
  hubBaseUrl: string | null,
): PersonaStorageScope | null {
  const currentScope = hubBaseUrl === null ? null : personaStorageScopeForHub(hubBaseUrl);
  const existing = readLegacyScopeClaim(settings);
  if (existing.kind === 'invalid') {
    // Fail closed on a corrupt ownership marker. New scoped state remains safe
    // to use, but legacy rows are never guessed into the current Hub.
    return currentScope;
  }
  if (existing.kind === 'none') {
    if (currentScope === null) {
      return null;
    }
    const claim: LegacyPersonaScopeClaim = {
      version: 1,
      origin: currentScope.origin,
      phase: 'claimed',
      legacyCachePresent: settings.get(LEGACY_PERSONALITIES_KEY) !== undefined,
      legacyPendingPresent: settings.get(PENDING_PERSONA_INTENTS_KEY) !== undefined,
      legacyMappingsPresent: settings.get('accountMappings') !== undefined,
    };
    // This ownership write MUST precede every scoped data copy.
    settings.set(LEGACY_PERSONA_SCOPE_CLAIM_KEY, claim);
    resumeLegacyPersonaScopeClaim(settings, claim);
    return currentScope;
  }
  resumeLegacyPersonaScopeClaim(settings, existing.claim);
  if (currentScope !== null) {
    return currentScope;
  }
  // While disconnected, keep edits attached to the last owned Hub instead of
  // putting them back into an unowned global bucket that a future Hub could see.
  return personaStorageScopeForHub(existing.claim.origin);
}

export function isLegacyPersonaBootstrapRequired(
  settings: PersonaSettingsQueries,
  scope: PersonaStorageScope,
): boolean {
  const claim = readLegacyScopeClaim(settings);
  if (
    claim.kind !== 'valid'
    || claim.claim.phase !== 'complete'
    || claim.claim.origin !== scope.origin
    || !claim.claim.legacyCachePresent
  ) {
    return false;
  }
  const completed = personaBootstrapCompleteSchema.safeParse(
    settings.get(personaBootstrapCompleteKey(scope)),
  );
  return !completed.success || completed.data.origin !== scope.origin;
}

export function markLegacyPersonaBootstrapComplete(
  settings: PersonaSettingsQueries,
  scope: PersonaStorageScope,
): void {
  settings.set(personaBootstrapCompleteKey(scope), { version: 1, origin: scope.origin });
}

export function loadPersonaAccountMappings(
  settings: PersonaSettingsQueries,
  scope: PersonaStorageScope | null,
): Record<string, string> {
  const parsed = accountMappingsSchema.safeParse(settings.get(personaAccountMappingsKey(scope)));
  return parsed.success ? parsed.data : {};
}

export function storePersonaAccountMappings(
  settings: PersonaSettingsQueries,
  scope: PersonaStorageScope | null,
  mappings: Record<string, string>,
): void {
  settings.set(personaAccountMappingsKey(scope), accountMappingsSchema.parse(mappings));
}

const personaKeySchema = routeSchemas.aiPersonaUpsert.params.shape.key;
const personaDisplayNameSchema = routeSchemas.aiPersonaUpsert.body.shape.displayName;
const personaSystemBlockSchema = routeSchemas.aiPersonaUpsert.body.shape.systemBlock;

/** Renderer command boundary, derived from the vendored Core contract. */
export const writablePersonalitySchema = z.object({
  id: personaKeySchema,
  name: personaDisplayNameSchema,
  content: personaSystemBlockSchema,
  updatedAt: z.number(),
  remoteVersion: z.number().int().positive().nullable().optional(),
  builtin: z.boolean().optional(),
  builtinVersion: z.number().optional(),
});

/**
 * Older Desktop builds accepted empty and 100k-character content. Continue to
 * read those rows so upgrading cannot erase them; they remain local and
 * editable, but cannot be written to Core until the user brings them inside the
 * current contract.
 */
export const storedPersonalitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  content: z.string().max(100_000),
  // Rows written before the kernel-persona cutover did not carry this cache
  // timestamp. Default it instead of treating the whole array as corrupt and
  // replacing every user persona with the builtin fallback on upgrade.
  updatedAt: z.number().default(0),
  // Added after the kernel-persona cutover. Undefined is deliberately retained
  // for v0.1.41 cache rows; it is treated as create-only, never legacy LWW.
  remoteVersion: z.number().int().positive().nullable().optional(),
  builtin: z.boolean().optional(),
  builtinVersion: z.number().optional(),
});

export const storedPersonalitiesSchema = z.array(storedPersonalitySchema);

/** Legacy bootstrap fixtures/rows predate the UI's updatedAt cache field. */
export const bootstrapPersonalitiesSchema = z.array(
  storedPersonalitySchema,
);

const legacyPersonaRecoveryEntrySchema = z.object({
  sourceKey: z.string().min(1),
  reason: z.enum([
    'remote-archived',
    'active-conflict',
    'recovery-key-archived',
    'recovery-key-conflict',
    'outside-core-contract',
  ]),
  personality: storedPersonalitySchema,
  remoteVersion: z.number().int().positive().nullable(),
}).strict();

const legacyPersonaRecoverySchema = z.object({
  version: z.literal(1),
  entries: z.array(legacyPersonaRecoveryEntrySchema).max(512),
}).strict();

export type LegacyPersonaRecoveryReason = z.infer<
  typeof legacyPersonaRecoveryEntrySchema
>['reason'];

/**
 * Preserve an ambiguous legacy payload before choosing the remote lifecycle
 * state. Entries are idempotent by source key + payload, so a crash/restart
 * cannot grow the recovery record without bound.
 */
export function storeLegacyPersonaRecovery(
  settings: PersonaSettingsQueries,
  scope: PersonaStorageScope,
  input: {
    personality: Personality;
    reason: LegacyPersonaRecoveryReason;
    remoteVersion: number | null;
  },
): void {
  const key = personaLegacyRecoveryKey(scope);
  const raw = settings.get(key);
  const existing = raw === undefined
    ? { version: 1 as const, entries: [] }
    : legacyPersonaRecoverySchema.parse(raw);
  const nextEntry = legacyPersonaRecoveryEntrySchema.parse({
    sourceKey: input.personality.id,
    reason: input.reason,
    personality: input.personality,
    remoteVersion: input.remoteVersion,
  });
  const samePayload = (entry: z.infer<typeof legacyPersonaRecoveryEntrySchema>): boolean =>
    entry.sourceKey === nextEntry.sourceKey
    && entry.personality.name === nextEntry.personality.name
    && entry.personality.content === nextEntry.personality.content;
  const index = existing.entries.findIndex(samePayload);
  const entries = [...existing.entries];
  if (index === -1) {
    if (entries.length >= 512) {
      throw new Error('legacy persona recovery record is full (512 entries)');
    }
    entries.push(nextEntry);
  } else {
    entries[index] = nextEntry;
  }
  settings.set(key, { version: 1, entries });
}

export function legacyRecoveredPersona(personality: Personality): {
  key: string;
  displayName: string;
  systemBlock: string;
} {
  const digest = createHash('sha256')
    .update(JSON.stringify([personality.id, personality.name, personality.content]))
    .digest('hex');
  const prefix = 'Recovered — ';
  return {
    key: `recovered:legacy:v1:${digest}`,
    displayName: `${prefix}${personality.name}`.slice(0, 120),
    systemBlock: personality.content,
  };
}

const pendingBaseSchema = z.object({
  operationId: z.uuid(),
  key: personaKeySchema,
  createdAt: z.number().int().nonnegative(),
});

const pendingPersonaPredecessorSchema = z.object({
  // A digest is sufficient to prove that Core's exact name/content pair is one
  // of this local successor's indeterminate predecessors without copying up to
  // 50k of prompt text into the journal for every offline edit in a chain.
  payloadDigest: z.string().regex(/^[0-9a-f]{64}$/),
  // A predecessor accepted from `null` creates revision 1; a numeric CAS
  // advances exactly once. Matching the revision as well as the digest prevents
  // an old payload that later reappears from being mistaken for our lost reply.
  committedVersion: z.number().int().positive(),
}).strict();

export interface PendingPersonaPredecessor {
  payloadDigest: string;
  committedVersion: number;
}

export function personaPayloadDigest(input: { name: string; content: string }): string {
  return createHash('sha256')
    .update(JSON.stringify([input.name, input.content]))
    .digest('hex');
}

function committedVersionFor(expectedVersion: number | null): number {
  return expectedVersion === null ? 1 : expectedVersion + 1;
}

const pendingPersonaIntentSchema = z.discriminatedUnion('kind', [
  pendingBaseSchema.extend({
    kind: z.literal('upsert'),
    personality: writablePersonalitySchema,
    // The Core revision of the exact base payload shown to the editor. Legacy
    // journals have no token and therefore migrate to create-only/null.
    expectedVersion: z.number().int().positive().nullable().default(null),
    // Every superseded indeterminate same-key PUT can be the row currently in
    // Core. The bounded digest+revision set lets a newer local save continue
    // that lineage without treating it as a foreign multi-device conflict.
    predecessors: z.array(pendingPersonaPredecessorSchema)
      .max(MAX_PENDING_PERSONA_PREDECESSORS)
      .default([]),
  }).strict(),
  pendingBaseSchema.extend({
    kind: z.literal('archive'),
    expectedVersion: z.number().int().positive().nullable().default(null),
    // Exact payload shown when delete was requested. It lets a replay
    // distinguish an accepted create whose response was lost from an unrelated
    // active row at the same legacy key. Older journals default to null and
    // therefore remain fail-closed.
    basePersonality: storedPersonalitySchema.nullable().default(null),
  }).strict(),
]).superRefine((intent, context) => {
  if (intent.kind === 'upsert' && intent.key !== intent.personality.id) {
    context.addIssue({
      code: 'custom',
      message: 'pending persona key must match personality.id',
      path: ['personality', 'id'],
    });
  }
});

const pendingPersonaJournalSchema = z.object({
  version: z.literal(1),
  intents: z.array(pendingPersonaIntentSchema).max(MAX_PENDING_PERSONA_INTENTS),
}).strict();

export type PendingPersonaIntent =
  | {
      kind: 'upsert';
      operationId: string;
      key: string;
      createdAt: number;
      personality: Personality;
      expectedVersion: number | null;
      predecessors: PendingPersonaPredecessor[];
    }
  | {
      kind: 'archive';
      operationId: string;
      key: string;
      createdAt: number;
      expectedVersion: number | null;
      basePersonality: Personality | null;
    };

function writeJournal(
  settings: PersonaSettingsQueries,
  scope: PersonaStorageScope | null,
  intents: PendingPersonaIntent[],
): void {
  const key = personaPendingIntentsKey(scope);
  if (intents.length === 0) {
    settings.remove(key);
    return;
  }
  settings.set(key, { version: 1, intents });
}

export function loadPendingPersonaIntents(
  settings: PersonaSettingsQueries,
  scope: PersonaStorageScope | null,
): PendingPersonaIntent[] {
  const raw = settings.get(personaPendingIntentsKey(scope));
  if (raw === undefined) {
    return [];
  }
  const parsed = pendingPersonaJournalSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`pending persona journal is invalid: ${parsed.error.message}`);
  }
  // JSON cannot preserve explicit `undefined` optional properties, so the Zod
  // output satisfies Personality's exact-optional shape at this boundary.
  return parsed.data.intents as PendingPersonaIntent[];
}

export function createPendingPersonaUpsert(
  personality: Personality,
  expectedVersion: number | null = personality.remoteVersion ?? null,
  previous: Extract<PendingPersonaIntent, { kind: 'upsert' }> | null = null,
): Extract<PendingPersonaIntent, { kind: 'upsert' }> {
  const predecessors = previous === null
    ? []
    : [
        ...previous.predecessors,
        {
          payloadDigest: personaPayloadDigest(previous.personality),
          committedVersion: committedVersionFor(previous.expectedVersion),
        },
      ].filter((candidate, index, all) => all.findIndex((entry) =>
        entry.payloadDigest === candidate.payloadDigest
        && entry.committedVersion === candidate.committedVersion) === index);
  if (predecessors.length > MAX_PENDING_PERSONA_PREDECESSORS) {
    throw new Error(
      `pending persona predecessor lineage is full (${MAX_PENDING_PERSONA_PREDECESSORS} entries)`,
    );
  }
  return pendingPersonaIntentSchema.parse({
    kind: 'upsert',
    operationId: randomUUID(),
    key: personality.id,
    createdAt: Date.now(),
    personality,
    expectedVersion,
    predecessors,
  }) as Extract<PendingPersonaIntent, { kind: 'upsert' }>;
}

/**
 * Rebase one exact pending successor after Core proves that an indeterminate
 * predecessor committed. The journal moves before wire I/O, so a crash or lost
 * retry response replays against the newly observed revision instead of
 * rebuilding an ambiguous predecessor chain.
 */
export function rebasePendingPersonaUpsert(
  settings: PersonaSettingsQueries,
  scope: PersonaStorageScope | null,
  intent: Extract<PendingPersonaIntent, { kind: 'upsert' }>,
  expectedVersion: number,
): Extract<PendingPersonaIntent, { kind: 'upsert' }> | null {
  const intents = loadPendingPersonaIntents(settings, scope);
  const index = intents.findIndex((candidate) =>
    candidate.key === intent.key && candidate.operationId === intent.operationId);
  if (index === -1) {
    return null;
  }
  const rebased = pendingPersonaIntentSchema.parse({
    ...intent,
    personality: { ...intent.personality, remoteVersion: expectedVersion },
    expectedVersion,
    // Keep every earlier indeterminate ancestor. The rebased CAS itself may
    // fail before Core sees it; a later local successor must still recognize
    // an older accepted write (for example P2@v2 when P3@v3 never committed).
    predecessors: intent.predecessors,
  }) as Extract<PendingPersonaIntent, { kind: 'upsert' }>;
  const next = [...intents];
  next[index] = rebased;
  writeJournal(settings, scope, next);
  return rebased;
}

export function createPendingPersonaArchive(
  key: string,
  expectedVersion: number | null = null,
  basePersonality: Personality | null = null,
): Extract<PendingPersonaIntent, { kind: 'archive' }> {
  return pendingPersonaIntentSchema.parse({
    kind: 'archive',
    operationId: randomUUID(),
    key,
    createdAt: Date.now(),
    expectedVersion,
    basePersonality,
  }) as Extract<PendingPersonaIntent, { kind: 'archive' }>;
}

/** Replaces the older intent for this key, returning it for 4xx rollback. */
export function storePendingPersonaIntent(
  settings: PersonaSettingsQueries,
  scope: PersonaStorageScope | null,
  intent: PendingPersonaIntent,
): PendingPersonaIntent | null {
  const intents = loadPendingPersonaIntents(settings, scope);
  const index = intents.findIndex((candidate) => candidate.key === intent.key);
  const previous = index === -1 ? null : intents[index] ?? null;
  if (index === -1) {
    if (intents.length >= MAX_PENDING_PERSONA_INTENTS) {
      throw new Error(`pending persona journal is full (${MAX_PENDING_PERSONA_INTENTS} intents)`);
    }
    writeJournal(settings, scope, [...intents, intent]);
  } else {
    const next = [...intents];
    next[index] = intent;
    writeJournal(settings, scope, next);
  }
  return previous;
}

export function isCurrentPendingPersonaIntent(
  settings: PersonaSettingsQueries,
  scope: PersonaStorageScope | null,
  intent: PendingPersonaIntent,
): boolean {
  return loadPendingPersonaIntents(settings, scope).some(
    (candidate) => candidate.key === intent.key && candidate.operationId === intent.operationId,
  );
}

/** Clears only this exact acknowledged mutation; a newer same-key intent wins. */
export function clearPendingPersonaIntent(
  settings: PersonaSettingsQueries,
  scope: PersonaStorageScope | null,
  intent: PendingPersonaIntent,
): boolean {
  const intents = loadPendingPersonaIntents(settings, scope);
  const current = intents.find(
    (candidate) => candidate.key === intent.key && candidate.operationId === intent.operationId,
  );
  if (current === undefined) {
    return false;
  }
  writeJournal(
    settings,
    scope,
    intents.filter((candidate) => candidate.operationId !== intent.operationId),
  );
  return true;
}

/**
 * A client-side 4xx was not accepted as an offline edit. Restore the intent it
 * temporarily superseded, but only while no newer same-key mutation exists.
 */
export function restorePendingPersonaIntent(
  settings: PersonaSettingsQueries,
  scope: PersonaStorageScope | null,
  rejected: PendingPersonaIntent,
  previous: PendingPersonaIntent | null,
): void {
  const intents = loadPendingPersonaIntents(settings, scope);
  const index = intents.findIndex(
    (candidate) => candidate.key === rejected.key && candidate.operationId === rejected.operationId,
  );
  if (index === -1) {
    return;
  }
  const next = [...intents];
  if (previous === null) {
    next.splice(index, 1);
  } else {
    next[index] = previous;
  }
  writeJournal(settings, scope, next);
}

export function isWritablePersonality(personality: {
  id: string;
  name: string;
  content: string;
  updatedAt: number;
  builtin?: boolean | undefined;
  builtinVersion?: number | undefined;
}): boolean {
  return writablePersonalitySchema.safeParse(personality).success;
}

function replacePersonality(list: Personality[], personality: Personality): Personality[] {
  return list.some((candidate) => candidate.id === personality.id)
    ? list.map((candidate) => (candidate.id === personality.id ? personality : candidate))
    : [...list, personality];
}

export function applyPendingPersonaIntents(
  list: Personality[],
  intents: readonly PendingPersonaIntent[],
): Personality[] {
  let merged = list;
  for (const intent of intents) {
    merged = intent.kind === 'archive'
      ? merged.filter((personality) => personality.id !== intent.key)
      : replacePersonality(merged, intent.personality);
  }
  return merged;
}

/**
 * Remote rows are authoritative except for durable unacknowledged intents and
 * legacy local rows that Core's current contract cannot represent.
 */
export function mergeRemotePersonas(
  remote: Personality[],
  cached: Personality[],
  intents: readonly PendingPersonaIntent[],
): Personality[] {
  let merged = remote;
  for (const local of cached) {
    if (!isWritablePersonality(local)) {
      merged = replacePersonality(merged, local);
    }
  }
  return applyPendingPersonaIntents(merged, intents);
}

export function personaMutationStatus(error: unknown): number | null {
  if (error === null || typeof error !== 'object') {
    return null;
  }
  const record = error as Record<string, unknown>;
  if (typeof record['status'] === 'number') {
    return record['status'];
  }
  const detail = record['detail'];
  if (detail !== null && typeof detail === 'object') {
    const status = (detail as Record<string, unknown>)['status'];
    return typeof status === 'number' ? status : null;
  }
  return null;
}

export type PersonaMutationFailure = 'already-archived' | 'client-rejected' | 'retryable';

export function classifyPersonaMutationFailure(
  error: unknown,
  mutation: PendingPersonaIntent['kind'],
): PersonaMutationFailure {
  const status = personaMutationStatus(error);
  if (mutation === 'archive' && status === 404) {
    // DELETE is replayed after crash/timeout. An absent row is the requested
    // terminal state, so a 404 confirms convergence rather than an offline edit.
    return 'already-archived';
  }
  // Payload/contract validation and an unreconciled CAS conflict are
  // deterministic rejections of this request. The production HubModule
  // consumes 409 through finite state reconciliation first; classifying a 409
  // that escapes prevents an accidental infinite local-success replay loop.
  // Auth can be repaired, generic 404/405 can be a Core rollout skew,
  // and 429/quota expires; all of those must retain the durable intent instead
  // of losing it when the editor or process closes.
  if (
    status === 400
    || status === 409
    || status === 422
    || (error instanceof HubError && error.reason === 'bad-request')
  ) {
    return 'client-rejected';
  }
  return 'retryable';
}
