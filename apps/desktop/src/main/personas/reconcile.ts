import type { HubAiPersona, HubAiPersonaState } from '@chatgoose/shared/hub/index';
import type { Personality } from '@chatgoose/shared/types';
import {
  clearPendingPersonaIntent,
  isCurrentPendingPersonaIntent,
  legacyRecoveredPersona,
  loadPersonaAccountMappings,
  personaCacheKey,
  personaMutationStatus,
  personaPayloadDigest,
  rebasePendingPersonaUpsert,
  storeLegacyPersonaRecovery,
  storePersonaAccountMappings,
  storedPersonalitiesSchema,
  type PendingPersonaIntent,
  type PersonaSettingsQueries,
  type PersonaStorageScope,
} from './pending';

export type PersonaConflictResolution =
  | { kind: 'confirmed'; persona: HubAiPersona }
  | { kind: 'archived'; originalKey: string }
  | { kind: 'recovered'; original: HubAiPersona; recovered: HubAiPersona }
  | { kind: 'quarantined'; originalKey: string; reason: string }
  | { kind: 'superseded'; originalKey: string };

export interface PersonaConflictRemote {
  listStates(): Promise<HubAiPersonaState[]>;
  upsertCreateOnly(args: {
    key: string;
    displayName: string;
    systemBlock: string;
  }): Promise<HubAiPersona>;
  upsertExpectedVersion(args: {
    key: string;
    displayName: string;
    systemBlock: string;
    expectedVersion: number;
  }): Promise<HubAiPersona>;
}

function remoteToLocal(persona: HubAiPersona): Personality {
  const updatedAt = Date.parse(persona.updatedAt);
  return {
    id: persona.key,
    name: persona.displayName,
    content: persona.systemBlock,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
    remoteVersion: persona.version,
    ...(persona.key === 'builtin:lora' ? { builtin: true } : {}),
  };
}

function loadCache(
  settings: PersonaSettingsQueries,
  scope: PersonaStorageScope,
): Personality[] {
  const raw = settings.get(personaCacheKey(scope));
  return raw === undefined
    ? []
    : storedPersonalitiesSchema.parse(raw) as Personality[];
}

function replacePersonality(list: Personality[], personality: Personality): Personality[] {
  return list.some((candidate) => candidate.id === personality.id)
    ? list.map((candidate) => candidate.id === personality.id ? personality : candidate)
    : [...list, personality];
}

function projectActive(
  settings: PersonaSettingsQueries,
  scope: PersonaStorageScope,
  intent: Extract<PendingPersonaIntent, { kind: 'upsert' }>,
  personas: HubAiPersona[],
): boolean {
  if (!isCurrentPendingPersonaIntent(settings, scope, intent)) {
    return false;
  }
  let cache = loadCache(settings, scope);
  for (const persona of personas) {
    cache = replacePersonality(cache, remoteToLocal(persona));
  }
  settings.set(personaCacheKey(scope), cache);
  return clearPendingPersonaIntent(settings, scope, intent);
}

function projectArchived(
  settings: PersonaSettingsQueries,
  scope: PersonaStorageScope,
  intent: Extract<PendingPersonaIntent, { kind: 'upsert' }>,
): boolean {
  if (!isCurrentPendingPersonaIntent(settings, scope, intent)) {
    return false;
  }
  // Disable the mapping before hiding the cached row. If the process dies
  // between the two durable writes, AI is safely disabled for the archived
  // key and the still-present intent repairs the cache on the next replay.
  const mappings = Object.fromEntries(
    Object.entries(loadPersonaAccountMappings(settings, scope))
      .filter(([, personaId]) => personaId !== intent.key),
  );
  storePersonaAccountMappings(settings, scope, mappings);
  settings.set(
    personaCacheKey(scope),
    loadCache(settings, scope).filter((persona) => persona.id !== intent.key),
  );
  return clearPendingPersonaIntent(settings, scope, intent);
}

function samePayload(
  remote: Extract<HubAiPersonaState, { state: 'active' }>,
  desired: { displayName: string; systemBlock: string },
): boolean {
  return remote.displayName === desired.displayName && remote.systemBlock === desired.systemBlock;
}

/**
 * Finite reconciliation for a Core 409. The stale write is never retried as an
 * omitted-version/LWW mutation. A tombstone quarantines the local payload; a
 * divergent active row remains authoritative while the local payload is copied
 * to a deterministic create-only recovery key. Recovery metadata is persisted
 * before any projection, and the pending intent is cleared only after the
 * converged cache/mapping state is durable.
 */
export async function reconcilePersonaUpsertConflict(input: {
  settings: PersonaSettingsQueries;
  scope: PersonaStorageScope;
  intent: Extract<PendingPersonaIntent, { kind: 'upsert' }>;
  remote: PersonaConflictRemote;
  /** Internal recursion fence: one predecessor-proven CAS per reconciliation. */
  lineageCasAttempted?: boolean;
}): Promise<PersonaConflictResolution> {
  const { settings, scope, intent, remote } = input;
  if (!isCurrentPendingPersonaIntent(settings, scope, intent)) {
    return { kind: 'superseded', originalKey: intent.key };
  }

  let stateByKey = new Map(
    (await remote.listStates()).map((state) => [state.key, state] as const),
  );
  let current = stateByKey.get(intent.key);
  if (current === undefined) {
    // Close a 409 -> state-list race once. A second absence is quarantined
    // rather than becoming an unbounded retry or an unsafe create/LWW guess.
    stateByKey = new Map(
      (await remote.listStates()).map((state) => [state.key, state] as const),
    );
    current = stateByKey.get(intent.key);
  }

  if (current?.state === 'archived') {
    storeLegacyPersonaRecovery(settings, scope, {
      personality: intent.personality,
      reason: 'remote-archived',
      remoteVersion: current.version,
    });
    if (!projectArchived(settings, scope, intent)) {
      return { kind: 'superseded', originalKey: intent.key };
    }
    return { kind: 'archived', originalKey: intent.key };
  }

  if (current === undefined) {
    storeLegacyPersonaRecovery(settings, scope, {
      personality: intent.personality,
      reason: 'active-conflict',
      remoteVersion: null,
    });
    if (!projectArchived(settings, scope, intent)) {
      return { kind: 'superseded', originalKey: intent.key };
    }
    return {
      kind: 'quarantined',
      originalKey: intent.key,
      reason: 'Core returned 409 but lifecycle state stayed absent after a bounded refresh',
    };
  }

  if (samePayload(current, {
    displayName: intent.personality.name,
    systemBlock: intent.personality.content,
  })) {
    if (!projectActive(settings, scope, intent, [current])) {
      return { kind: 'superseded', originalKey: intent.key };
    }
    return { kind: 'confirmed', persona: current };
  }

  const currentDigest = personaPayloadDigest({
    name: current.displayName,
    content: current.systemBlock,
  });
  const isIndeterminatePredecessor = intent.predecessors.some((predecessor) =>
    predecessor.committedVersion === current.version
    && predecessor.payloadDigest === currentDigest);
  if (isIndeterminatePredecessor && input.lineageCasAttempted !== true) {
    // The exact payload+revision proves that Core is at one of this same-key
    // successor's earlier indeterminate writes. Move the durable journal base
    // before retrying so both a process crash and a lost retry response replay
    // against this observed revision. The recursive 409 path is bounded by the
    // explicit attempt fence while retaining older ancestors for later saves.
    const rebased = rebasePendingPersonaUpsert(settings, scope, intent, current.version);
    if (rebased === null) {
      return { kind: 'superseded', originalKey: intent.key };
    }
    try {
      const updated = await remote.upsertExpectedVersion({
        key: rebased.key,
        displayName: rebased.personality.name,
        systemBlock: rebased.personality.content,
        expectedVersion: current.version,
      });
      if (!projectActive(settings, scope, rebased, [updated])) {
        return { kind: 'superseded', originalKey: intent.key };
      }
      return { kind: 'confirmed', persona: updated };
    } catch (error) {
      if (personaMutationStatus(error) !== 409) {
        throw error;
      }
      return reconcilePersonaUpsertConflict({
        ...input,
        intent: rebased,
        lineageCasAttempted: true,
      });
    }
  }

  storeLegacyPersonaRecovery(settings, scope, {
    personality: intent.personality,
    reason: 'active-conflict',
    remoteVersion: current.version,
  });
  const recoveryArgs = legacyRecoveredPersona(intent.personality);

  const evaluateRecoveryState = (
    state: HubAiPersonaState | undefined,
  ): { kind: 'usable'; persona: HubAiPersona } | { kind: 'collision'; reason: string } | null => {
    if (state === undefined) {
      return null;
    }
    if (state.state === 'archived') {
      storeLegacyPersonaRecovery(settings, scope, {
        personality: intent.personality,
        reason: 'recovery-key-archived',
        remoteVersion: state.version,
      });
      return { kind: 'collision', reason: 'deterministic recovery key is archived' };
    }
    if (samePayload(state, recoveryArgs)) {
      return { kind: 'usable', persona: state };
    }
    storeLegacyPersonaRecovery(settings, scope, {
      personality: intent.personality,
      reason: 'recovery-key-conflict',
      remoteVersion: state.version,
    });
    return { kind: 'collision', reason: 'deterministic recovery key contains different content' };
  };

  let recovery = evaluateRecoveryState(stateByKey.get(recoveryArgs.key));
  if (recovery === null) {
    try {
      const created = await remote.upsertCreateOnly(recoveryArgs);
      recovery = { kind: 'usable', persona: created };
    } catch (error) {
      if (personaMutationStatus(error) !== 409) {
        throw error;
      }
      // Another device won the deterministic create. Refresh once and either
      // converge on the identical payload or quarantine a real collision.
      stateByKey = new Map(
        (await remote.listStates()).map((state) => [state.key, state] as const),
      );
      recovery = evaluateRecoveryState(stateByKey.get(recoveryArgs.key)) ?? {
        kind: 'collision',
        reason: 'deterministic recovery key remained absent after create conflict',
      };
    }
  }

  if (recovery.kind === 'usable') {
    if (!projectActive(settings, scope, intent, [current, recovery.persona])) {
      return { kind: 'superseded', originalKey: intent.key };
    }
    return { kind: 'recovered', original: current, recovered: recovery.persona };
  }

  // The original Core row is still authoritative. Store it locally so the
  // unpushable stale payload cannot keep masquerading as active; the complete
  // local payload remains in the encrypted recovery record written above.
  if (!projectActive(settings, scope, intent, [current])) {
    return { kind: 'superseded', originalKey: intent.key };
  }
  return { kind: 'quarantined', originalKey: intent.key, reason: recovery.reason };
}
