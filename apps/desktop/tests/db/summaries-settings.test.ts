import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { SummaryCacheEntry } from '@chatgoose/shared/summary/validity';
import type { DataLayer } from '@main/db/index';
import { memoryDataLayer } from './helpers';

let layer: DataLayer;

beforeEach(() => {
  layer = memoryDataLayer();
});

afterEach(() => {
  layer.close();
});

describe('summaries cache (SPEC §8.5)', () => {
  const full: SummaryCacheEntry = {
    body: 'Fan summary text',
    personalityId: 'pers-1',
    personalityUpdatedAt: 1717000000000,
    generatedAt: 1717100000000,
    spendingVerified: true,
    subscriptionVerified: false,
    modelId: 'anthropic:claude-sonnet-4-5',
    hubSyncState: { pushedAt: 123 },
  };

  it('round-trips a full entry keyed by (account, fan)', () => {
    layer.summaries.put('acct_1', '101', full);
    expect(layer.summaries.get('acct_1', '101')).toEqual(full);
    expect(layer.summaries.get('acct_1', '999')).toBeNull();
    expect(layer.summaries.get('acct_2', '101')).toBeNull();
  });

  it('round-trips a minimal entry without optional fields', () => {
    const minimal: SummaryCacheEntry = {
      body: 'minimal',
      personalityId: 'pers-2',
      personalityUpdatedAt: 1,
      generatedAt: 2,
    };
    layer.summaries.put('acct_1', '102', minimal);
    expect(layer.summaries.get('acct_1', '102')).toEqual(minimal);
  });

  it('replaces on put (refresh = delete + regenerate)', () => {
    layer.summaries.put('acct_1', '101', full);
    layer.summaries.remove('acct_1', '101');
    expect(layer.summaries.get('acct_1', '101')).toBeNull();
    layer.summaries.put('acct_1', '101', { ...full, body: 'regenerated' });
    expect(layer.summaries.get('acct_1', '101')?.body).toBe('regenerated');
  });

  it('reads a corrupt row as null (shared normalizer at the storage boundary)', () => {
    layer.summaries.put('acct_1', '101', full);
    layer.db.prepare("UPDATE summaries SET personality_updated_at = 'garbage'").run();
    expect(layer.summaries.get('acct_1', '101')).toBeNull();
  });
});

describe('settings(key, value JSON)', () => {
  it('stores and returns arbitrary JSON values', () => {
    layer.settings.set('notificationsEnabled', true);
    layer.settings.set('featureModels', { 'fast-reply': 'anthropic:claude-sonnet-4-5' });
    expect(layer.settings.get('notificationsEnabled')).toBe(true);
    expect(layer.settings.get('featureModels')).toEqual({
      'fast-reply': 'anthropic:claude-sonnet-4-5',
    });
    expect(layer.settings.get('missing')).toBeUndefined();
  });

  it('validates reads through a caller schema', () => {
    layer.settings.set('quickMessageCount', 100);
    expect(layer.settings.getParsed('quickMessageCount', z.number().int())).toBe(100);
    expect(layer.settings.getParsed('quickMessageCount', z.string())).toBeUndefined();
    expect(layer.settings.getParsed('missing', z.number())).toBeUndefined();
  });

  it('overwrites and removes keys', () => {
    layer.settings.set('debugMode', false);
    layer.settings.set('debugMode', true);
    expect(layer.settings.get('debugMode')).toBe(true);
    layer.settings.remove('debugMode');
    expect(layer.settings.get('debugMode')).toBeUndefined();
  });

  it('lists all settings excluding schema_version', () => {
    layer.settings.set('a', 1);
    layer.settings.set('b', 'two');
    expect(layer.settings.all()).toEqual({ a: 1, b: 'two' });
  });

  it('refuses to touch schema_version (owned by migrations)', () => {
    expect(() => layer.settings.set('schema_version', 99)).toThrow(/migration/);
    expect(() => layer.settings.remove('schema_version')).toThrow(/migration/);
    expect(layer.db.schemaVersion()).toBe(1);
  });

  it('rejects non-JSON-serializable values', () => {
    expect(() => layer.settings.set('bad', undefined)).toThrow(/serializable/);
  });

  it('publishes settings change events', () => {
    const flushed: unknown[] = [];
    layer.bus.subscribe((events) => flushed.push(...events));
    layer.settings.set('soundEnabled', true);
    layer.bus.flushNow();
    expect(flushed).toEqual([{ scope: 'settings' }]);
  });
});

describe('credit_log(day, used)', () => {
  it('accumulates usage per day', () => {
    layer.creditLog.add('2026-06-10', 3);
    layer.creditLog.add('2026-06-10', 2);
    layer.creditLog.add('2026-06-11', 1);
    expect(layer.creditLog.usedOn('2026-06-10')).toBe(5);
    expect(layer.creditLog.usedOn('2026-06-11')).toBe(1);
    expect(layer.creditLog.usedOn('2026-06-12')).toBe(0);
  });

  it('rejects malformed day keys and negative credits', () => {
    expect(() => layer.creditLog.add('06/10/2026', 1)).toThrow(/YYYY-MM-DD/);
    expect(() => layer.creditLog.add('2026-06-10', -1)).toThrow(/non-negative/);
    expect(() => layer.creditLog.add('2026-06-10', Number.NaN)).toThrow(/non-negative/);
  });
});
