import { describe, expect, it } from 'vitest';
import {
  LEGACY_PERSONA_SNAPSHOT_KEY,
  ensureLegacyPersonaSnapshot,
  inspectPersonaCatalogReplacement,
  loadPersonaCatalog,
  resolvePersonaMapping,
  storePersonaCatalog,
} from '@main/personas/catalog';
import {
  personaStorageScopeForHub,
  personaSummaryCacheIdentity,
} from '@main/personas/pending';

class MemorySettings {
  readonly values = new Map<string, unknown>();
  failBeforeCommit = false;
  failAfterCommit = false;

  get(key: string): unknown {
    return this.values.get(key);
  }

  set(key: string, value: unknown): void {
    this.batch([{ kind: 'set', key, value }]);
  }

  remove(key: string): void {
    this.batch([{ kind: 'remove', key }]);
  }

  batch(mutations: ReadonlyArray<
    { kind: 'set'; key: string; value: unknown } | { kind: 'remove'; key: string }
  >): void {
    if (this.failBeforeCommit) {
      this.failBeforeCommit = false;
      throw new Error('before commit');
    }
    for (const mutation of mutations) {
      if (mutation.kind === 'set') this.values.set(mutation.key, structuredClone(mutation.value));
      else this.values.delete(mutation.key);
    }
    if (this.failAfterCommit) {
      this.failAfterCommit = false;
      throw new Error('reported after commit');
    }
  }

  all(): Record<string, unknown> {
    return Object.fromEntries(this.values);
  }
}

const SCOPE = personaStorageScopeForHub('https://hub.example.com');

describe('legacy persona snapshot', () => {
  it('retries cleanly after a pre-commit failure and never mutates raw rows', () => {
    const settings = new MemorySettings();
    const personas = [{ id: 'custom:one', content: 'full text' }];
    settings.set('personalities', personas);
    settings.set('personalities.aliases.v1', { old: 'custom:one' });
    settings.set('accountMappings', { acct_1: 'custom:one' });
    settings.failBeforeCommit = true;

    expect(() => ensureLegacyPersonaSnapshot(
      settings,
      SCOPE.origin,
      () => new Date('2026-07-13T10:00:00.000Z'),
    )).toThrow('before commit');
    expect(settings.get(LEGACY_PERSONA_SNAPSHOT_KEY)).toBeUndefined();

    const snapshot = ensureLegacyPersonaSnapshot(
      settings,
      SCOPE.origin,
      () => new Date('2026-07-13T10:01:00.000Z'),
    );
    expect(snapshot.rows).toEqual({
      personalities: personas,
      'personalities.aliases.v1': { old: 'custom:one' },
      accountMappings: { acct_1: 'custom:one' },
    });
    expect(settings.get('personalities')).toEqual(personas);
  });

  it('recognizes a committed snapshot after a reported crash and keeps it immutable', () => {
    const settings = new MemorySettings();
    settings.set('personalities', [{ id: 'custom:first', content: 'first' }]);
    settings.failAfterCommit = true;

    expect(() => ensureLegacyPersonaSnapshot(
      settings,
      SCOPE.origin,
      () => new Date('2026-07-13T11:00:00.000Z'),
    )).toThrow('reported after commit');
    settings.set('personalities', [{ id: 'custom:second', content: 'second' }]);

    const resumed = ensureLegacyPersonaSnapshot(
      settings,
      SCOPE.origin,
      () => new Date('2026-07-13T12:00:00.000Z'),
    );
    expect(resumed.capturedAt).toBe('2026-07-13T11:00:00.000Z');
    expect(resumed.rows['personalities']).toEqual([{ id: 'custom:first', content: 'first' }]);
    expect(settings.get('personalities')).toEqual([{ id: 'custom:second', content: 'second' }]);
  });
});

describe('persona metadata catalog', () => {
  it('uses a separate key and accepts a latest full replacement across Core restore', () => {
    const settings = new MemorySettings();
    settings.set('personalities', [{ id: 'legacy', content: 'never replace' }]);
    const previous = [
      {
        key: 'custom:one',
        displayName: 'One',
        version: 2,
        status: 'archived' as const,
        definitionId: 'v1:test-definition-before-one',
      },
      {
        key: 'custom:removed',
        displayName: 'Removed',
        version: 4,
        status: 'archived' as const,
        definitionId: 'v1:test-definition-before-removed',
      },
    ];
    storePersonaCatalog(settings, SCOPE, previous);
    const restored = [{
      key: 'custom:one',
      displayName: 'One restored',
      version: 1,
      status: 'active' as const,
      definitionId: 'v1:test-definition-restored-one',
    }];
    expect(inspectPersonaCatalogReplacement(previous, restored)).toEqual({
      missingKeys: ['custom:removed'],
      lowerVersions: [{ key: 'custom:one', previous: 2, next: 1 }],
    });
    storePersonaCatalog(settings, SCOPE, restored);

    expect(loadPersonaCatalog(settings, SCOPE)).toEqual(restored);
    expect(settings.get('personalities')).toEqual([{ id: 'legacy', content: 'never replace' }]);
  });

  it('invalidates a transitional cached catalog that lacks definitionId', () => {
    const settings = new MemorySettings();
    settings.set(`personalities.catalog.v1.${SCOPE.digest}`, [{
      key: 'custom:old',
      displayName: 'Old cache',
      version: 9,
      status: 'active',
    }]);

    expect(loadPersonaCatalog(settings, SCOPE)).toBeNull();
    expect(resolvePersonaMapping(loadPersonaCatalog(settings, SCOPE), 'custom:old'))
      .toEqual({ state: 'unresolved', version: null, definitionId: null });
  });

  it('requires opaque definitionId in the current cache identity', () => {
    const settings = new MemorySettings();
    storePersonaCatalog(settings, SCOPE, [{
      key: 'custom:one',
      displayName: 'One',
      version: 1,
      status: 'active',
      definitionId: 'v1:opaque-definition-hash',
    }]);

    const resolution = resolvePersonaMapping(loadPersonaCatalog(settings, SCOPE), 'custom:one');
    if (resolution.state !== 'active') throw new Error('expected active persona');
    expect(resolution.definitionId).toBe('v1:opaque-definition-hash');
    expect(personaSummaryCacheIdentity(
      SCOPE,
      'custom:one',
      resolution.definitionId,
    )).toContain('persona-summary:v2:');
  });
});
