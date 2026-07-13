import { describe, expect, it, vi } from 'vitest';
import { HubError, type HubAiPersonaState } from '@chatgoose/shared/hub/index';
import type { Personality } from '@chatgoose/shared/types';
import {
  createPendingPersonaUpsert,
  legacyRecoveredPersona,
  loadPendingPersonaIntents,
  personaAccountMappingsKey,
  personaCacheKey,
  personaLegacyRecoveryKey,
  personaStorageScopeForHub,
  storePendingPersonaIntent,
  storePersonaAccountMappings,
  type PersonaSettingsQueries,
} from '@main/personas/pending';
import { reconcilePersonaUpsertConflict } from '@main/personas/reconcile';

const SCOPE = personaStorageScopeForHub('https://hub.example.com');

function memorySettings(): PersonaSettingsQueries & { values: Map<string, unknown> } {
  const values = new Map<string, unknown>();
  return {
    values,
    get: (key) => values.get(key),
    set: (key, value) => {
      values.set(key, value);
    },
    remove: (key) => {
      values.delete(key);
    },
  };
}

function localPersona(overrides: Partial<Personality> = {}): Personality {
  return {
    id: 'custom:shared',
    name: 'Shared',
    content: 'stale offline edit',
    updatedAt: 2,
    remoteVersion: 1,
    ...overrides,
  };
}

describe('persona CAS conflict reconciliation', () => {
  it('keeps a newer active row authoritative and copies the stale edit once', async () => {
    const settings = memorySettings();
    const stale = localPersona();
    const intent = createPendingPersonaUpsert(stale, 1);
    settings.set(personaCacheKey(SCOPE), [stale]);
    storePendingPersonaIntent(settings, SCOPE, intent);

    const current = {
      state: 'active' as const,
      key: stale.id,
      displayName: 'Newer remote',
      systemBlock: 'device B won',
      updatedAt: '2026-07-13T12:00:00.000Z',
      version: 2,
    };
    const recoveryArgs = legacyRecoveredPersona(stale);
    const createOnly = vi.fn(async () => ({
      ...recoveryArgs,
      updatedAt: '2026-07-13T12:01:00.000Z',
      version: 1,
    }));

    await expect(reconcilePersonaUpsertConflict({
      settings,
      scope: SCOPE,
      intent,
      remote: {
        listStates: async () => [current],
        upsertCreateOnly: createOnly,
        upsertExpectedVersion: async () => {
          throw new Error('foreign conflicts must not rebase');
        },
      },
    })).resolves.toMatchObject({ kind: 'recovered', original: current });

    expect(createOnly).toHaveBeenCalledExactlyOnceWith(recoveryArgs);
    expect(settings.get(personaCacheKey(SCOPE))).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: stale.id, content: current.systemBlock, remoteVersion: 2 }),
      expect.objectContaining({ id: recoveryArgs.key, content: stale.content, remoteVersion: 1 }),
    ]));
    expect(loadPendingPersonaIntents(settings, SCOPE)).toEqual([]);
  });

  it('prunes an archived mapping before cache projection and repairs a crash', async () => {
    const settings = memorySettings();
    const stale = localPersona({ id: 'custom:archived' });
    const intent = createPendingPersonaUpsert(stale, 1);
    settings.set(personaCacheKey(SCOPE), [stale]);
    storePersonaAccountMappings(settings, SCOPE, { acct_one: stale.id });
    storePendingPersonaIntent(settings, SCOPE, intent);

    const originalSet = settings.set.bind(settings);
    let failCacheProjection = true;
    settings.set = (key, value) => {
      if (failCacheProjection && key === personaCacheKey(SCOPE)) {
        failCacheProjection = false;
        throw new Error('simulated crash before cache projection');
      }
      originalSet(key, value);
    };
    const remote = {
      listStates: async (): Promise<HubAiPersonaState[]> => [{
        state: 'archived',
        key: stale.id,
        version: 2,
      }],
      upsertCreateOnly: vi.fn(async () => {
        throw new Error('archived conflicts must not create');
      }),
      upsertExpectedVersion: vi.fn(async () => {
        throw new Error('archived conflicts must not rebase');
      }),
    };

    await expect(reconcilePersonaUpsertConflict({
      settings,
      scope: SCOPE,
      intent,
      remote,
    })).rejects.toThrow('simulated crash');

    expect(settings.get(personaAccountMappingsKey(SCOPE))).toEqual({});
    expect(settings.get(personaCacheKey(SCOPE))).toEqual([stale]);
    expect(loadPendingPersonaIntents(settings, SCOPE)).toEqual([intent]);

    await expect(reconcilePersonaUpsertConflict({
      settings,
      scope: SCOPE,
      intent,
      remote,
    })).resolves.toEqual({ kind: 'archived', originalKey: stale.id });

    expect(settings.get(personaCacheKey(SCOPE))).toEqual([]);
    expect(loadPendingPersonaIntents(settings, SCOPE)).toEqual([]);
    expect(remote.upsertCreateOnly).not.toHaveBeenCalled();
    expect(settings.get(personaLegacyRecoveryKey(SCOPE))).toMatchObject({
      entries: [{ sourceKey: stale.id, reason: 'remote-archived', remoteVersion: 2 }],
    });
  });

  it('converges after a crash following recovered-copy creation without duplicating it', async () => {
    const settings = memorySettings();
    const stale = localPersona({ id: 'custom:crash' });
    const intent = createPendingPersonaUpsert(stale, 1);
    settings.set(personaCacheKey(SCOPE), [stale]);
    storePendingPersonaIntent(settings, SCOPE, intent);

    const current = {
      state: 'active' as const,
      key: stale.id,
      displayName: 'Newer remote',
      systemBlock: 'device B won',
      updatedAt: '2026-07-13T12:00:00.000Z',
      version: 2,
    };
    const recoveryArgs = legacyRecoveredPersona(stale);
    const states: HubAiPersonaState[] = [current];
    const originalSet = settings.set.bind(settings);
    let failCacheProjection = false;
    settings.set = (key, value) => {
      if (failCacheProjection && key === personaCacheKey(SCOPE)) {
        failCacheProjection = false;
        throw new Error('simulated crash after Core create');
      }
      originalSet(key, value);
    };
    const createOnly = vi.fn(async () => {
      const recovered = {
        ...recoveryArgs,
        updatedAt: '2026-07-13T12:01:00.000Z',
        version: 1,
      };
      states.push({ state: 'active', ...recovered });
      failCacheProjection = true;
      return recovered;
    });
    const remote = {
      listStates: async () => states,
      upsertCreateOnly: createOnly,
      upsertExpectedVersion: async () => {
        throw new Error('foreign conflicts must not rebase');
      },
    };

    await expect(reconcilePersonaUpsertConflict({
      settings,
      scope: SCOPE,
      intent,
      remote,
    })).rejects.toThrow('simulated crash after Core create');
    expect(loadPendingPersonaIntents(settings, SCOPE)).toEqual([intent]);

    await expect(reconcilePersonaUpsertConflict({
      settings,
      scope: SCOPE,
      intent,
      remote,
    })).resolves.toMatchObject({ kind: 'recovered' });

    expect(createOnly).toHaveBeenCalledTimes(1);
    expect(settings.get(personaCacheKey(SCOPE))).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: stale.id, content: current.systemBlock }),
      expect.objectContaining({ id: recoveryArgs.key, content: stale.content }),
    ]));
    expect(loadPendingPersonaIntents(settings, SCOPE)).toEqual([]);
  });

  it('CAS-applies the latest successor when Core matches any accepted predecessor in a chain', async () => {
    const settings = memorySettings();
    const base = localPersona({ content: 'version one', remoteVersion: 1 });
    const p2 = createPendingPersonaUpsert({ ...base, content: 'version two' }, 1);
    const p3 = createPendingPersonaUpsert({ ...base, content: 'version three' }, 1, p2);
    const p4 = createPendingPersonaUpsert({ ...base, content: 'version four' }, 1, p3);
    settings.set(personaCacheKey(SCOPE), [p4.personality]);
    storePendingPersonaIntent(settings, SCOPE, p4);

    const current = {
      state: 'active' as const,
      key: base.id,
      displayName: base.name,
      systemBlock: p2.personality.content,
      updatedAt: '2026-07-13T12:00:00.000Z',
      version: 2,
    };
    const update = vi.fn(async (args: {
      key: string;
      displayName: string;
      systemBlock: string;
      expectedVersion: number;
    }) => ({
      key: args.key,
      displayName: args.displayName,
      systemBlock: args.systemBlock,
      updatedAt: '2026-07-13T12:01:00.000Z',
      version: 3,
    }));
    const createOnly = vi.fn(async () => {
      throw new Error('same-lineage successor must not become a recovered copy');
    });

    await expect(reconcilePersonaUpsertConflict({
      settings,
      scope: SCOPE,
      intent: p4,
      remote: {
        listStates: async () => [current],
        upsertCreateOnly: createOnly,
        upsertExpectedVersion: update,
      },
    })).resolves.toMatchObject({
      kind: 'confirmed',
      persona: { key: base.id, systemBlock: 'version four', version: 3 },
    });

    expect(update).toHaveBeenCalledExactlyOnceWith({
      key: base.id,
      displayName: base.name,
      systemBlock: 'version four',
      expectedVersion: 2,
    });
    expect(createOnly).not.toHaveBeenCalled();
    expect(loadPendingPersonaIntents(settings, SCOPE)).toEqual([]);
    expect(settings.get(personaCacheKey(SCOPE))).toEqual([
      expect.objectContaining({ id: base.id, content: 'version four', remoteVersion: 3 }),
    ]);
  });

  it('retains older lineage when a rebased successor times out before Core accepts it', async () => {
    const settings = memorySettings();
    const base = localPersona({ content: 'version one', remoteVersion: 1 });
    const p2 = createPendingPersonaUpsert({ ...base, content: 'version two' }, 1);
    const p3 = createPendingPersonaUpsert({ ...base, content: 'version three' }, 1, p2);
    settings.set(personaCacheKey(SCOPE), [p3.personality]);
    storePendingPersonaIntent(settings, SCOPE, p3);

    const currentP2 = {
      state: 'active' as const,
      key: base.id,
      displayName: base.name,
      systemBlock: p2.personality.content,
      updatedAt: '2026-07-13T12:00:00.000Z',
      version: 2,
    };
    const timedOutP3 = vi.fn(async () => {
      // Deterministically model failure before Core sees the rebased P3 request.
      throw new HubError('timeout', { message: 'request never reached Core' });
    });
    const remote = {
      listStates: async (): Promise<HubAiPersonaState[]> => [currentP2],
      upsertCreateOnly: vi.fn(async () => {
        throw new Error('same-lineage successor must not become a recovered copy');
      }),
      upsertExpectedVersion: timedOutP3,
    };

    await expect(reconcilePersonaUpsertConflict({
      settings,
      scope: SCOPE,
      intent: p3,
      remote,
    })).rejects.toMatchObject({ reason: 'timeout' });

    const rebasedP3 = loadPendingPersonaIntents(settings, SCOPE)[0];
    expect(rebasedP3).toMatchObject({
      kind: 'upsert',
      expectedVersion: 2,
      personality: { content: 'version three', remoteVersion: 2 },
    });
    if (rebasedP3?.kind !== 'upsert') {
      throw new Error('expected rebased P3 intent');
    }
    expect(rebasedP3.predecessors).toEqual(p3.predecessors);

    // P4 replaces the indeterminate P3. Core is still at accepted P2@v2; the
    // inherited ancestor must remain sufficient proof to apply P4 in place.
    const p4 = createPendingPersonaUpsert(
      { ...base, content: 'version four', remoteVersion: 2 },
      2,
      rebasedP3,
    );
    storePendingPersonaIntent(settings, SCOPE, p4);
    const updateP4 = vi.fn(async (args: {
      key: string;
      displayName: string;
      systemBlock: string;
      expectedVersion: number;
    }) => ({
      key: args.key,
      displayName: args.displayName,
      systemBlock: args.systemBlock,
      updatedAt: '2026-07-13T12:02:00.000Z',
      version: 3,
    }));

    await expect(reconcilePersonaUpsertConflict({
      settings,
      scope: SCOPE,
      intent: p4,
      remote: { ...remote, upsertExpectedVersion: updateP4 },
    })).resolves.toMatchObject({ kind: 'confirmed', persona: { systemBlock: 'version four' } });
    expect(updateP4).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: 2 }));
    expect(remote.upsertCreateOnly).not.toHaveBeenCalled();
  });

  it('refreshes once after a predecessor-proven CAS race and then reconciles the real winner', async () => {
    const settings = memorySettings();
    const base = localPersona({ content: 'version one', remoteVersion: 1 });
    const p2 = createPendingPersonaUpsert({ ...base, content: 'version two' }, 1);
    const p3 = createPendingPersonaUpsert({ ...base, content: 'version three' }, 1, p2);
    settings.set(personaCacheKey(SCOPE), [p3.personality]);
    storePendingPersonaIntent(settings, SCOPE, p3);

    const predecessor = {
      state: 'active' as const,
      key: base.id,
      displayName: base.name,
      systemBlock: p2.personality.content,
      updatedAt: '2026-07-13T12:00:00.000Z',
      version: 2,
    };
    const winner = {
      state: 'active' as const,
      key: base.id,
      displayName: 'Device B',
      systemBlock: 'concurrent version three',
      updatedAt: '2026-07-13T12:01:00.000Z',
      version: 3,
    };
    const listStates = vi.fn()
      .mockResolvedValueOnce([predecessor])
      .mockResolvedValueOnce([winner]);
    const update = vi.fn(async () => {
      throw new HubError('http', { detail: { status: 409 } });
    });
    const recoveryArgs = legacyRecoveredPersona(p3.personality);
    const createOnly = vi.fn(async () => ({
      ...recoveryArgs,
      updatedAt: '2026-07-13T12:02:00.000Z',
      version: 1,
    }));

    await expect(reconcilePersonaUpsertConflict({
      settings,
      scope: SCOPE,
      intent: p3,
      remote: {
        listStates,
        upsertCreateOnly: createOnly,
        upsertExpectedVersion: update,
      },
    })).resolves.toMatchObject({ kind: 'recovered', original: winner });
    expect(listStates).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledTimes(1);
    expect(createOnly).toHaveBeenCalledExactlyOnceWith(recoveryArgs);
    expect(loadPendingPersonaIntents(settings, SCOPE)).toEqual([]);
  });
});
