import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { SummaryCacheEntry } from '@chatgoose/shared/summary/validity';
import type { DataLayer } from '@main/db/index';
import { SCHEMA_VERSION } from '@main/db/migrations';
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
    expect(layer.settings.all()).toEqual({
      a: 1,
      b: 'two',
      ofapiReadTransport: 'hub',
      ofapiWriteTransport: 'hub',
      spendSweepRollbackToLegacy: false,
    });
  });

  it('refuses to touch schema_version (owned by migrations)', () => {
    expect(() => layer.settings.set('schema_version', 99)).toThrow(/migration/);
    expect(() => layer.settings.remove('schema_version')).toThrow(/migration/);
    expect(layer.db.schemaVersion()).toBe(SCHEMA_VERSION);
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

describe('credit_log(day, purpose, used, requests)', () => {
  it('accumulates usage per day across purposes', () => {
    layer.creditLog.add('2026-06-10', 'hot-poll', 3, 3);
    layer.creditLog.add('2026-06-10', 'hot-poll', 2, 2);
    layer.creditLog.add('2026-06-10', 'media', 4, 1);
    layer.creditLog.add('2026-06-11', 'hot-poll', 1, 1);
    expect(layer.creditLog.usedOn('2026-06-10')).toBe(9);
    expect(layer.creditLog.usedOn('2026-06-11')).toBe(1);
    expect(layer.creditLog.usedOn('2026-06-12')).toBe(0);
  });

  it('returns per-purpose ledger rows for one day', () => {
    layer.creditLog.add('2026-06-10', 'hot-poll', 5, 5);
    layer.creditLog.add('2026-06-10', 'send', 0, 2);
    layer.creditLog.add('2026-06-11', 'hot-poll', 1, 1);
    expect(layer.creditLog.byPurposeOn('2026-06-10').sort((a, b) => a.purpose.localeCompare(b.purpose))).toEqual([
      { purpose: 'hot-poll', requests: 5, credits: 5 },
      { purpose: 'send', requests: 2, credits: 0 },
    ]);
    expect(layer.creditLog.byPurposeOn('2026-06-12')).toEqual([]);
  });

  it('returns daily totals since a day (pace window)', () => {
    layer.creditLog.add('2026-06-08', 'hot-poll', 100, 100);
    layer.creditLog.add('2026-06-10', 'hot-poll', 5, 5);
    layer.creditLog.add('2026-06-10', 'media', 4, 1);
    layer.creditLog.add('2026-06-11', 'hot-poll', 1, 1);
    expect(layer.creditLog.totalsSince('2026-06-10')).toEqual([
      { day: '2026-06-10', used: 9 },
      { day: '2026-06-11', used: 1 },
    ]);
  });

  it('rejects malformed day keys, empty purposes and negative counters', () => {
    expect(() => layer.creditLog.add('06/10/2026', 'hot-poll', 1, 1)).toThrow(/YYYY-MM-DD/);
    expect(() => layer.creditLog.add('2026-06-10', '', 1, 1)).toThrow(/purpose/);
    expect(() => layer.creditLog.add('2026-06-10', 'hot-poll', -1, 0)).toThrow(/non-negative/);
    expect(() => layer.creditLog.add('2026-06-10', 'hot-poll', Number.NaN, 0)).toThrow(/non-negative/);
    expect(() => layer.creditLog.add('2026-06-10', 'hot-poll', 1, -1)).toThrow(/non-negative/);
  });
});

describe('ai_spend_log(day, feature)', () => {
  it('folds runs into per-day per-feature counters', () => {
    layer.aiSpendLog.recordRun({
      day: '2026-06-11',
      feature: 'fast-reply',
      isCacheHit: false,
      inputTokens: 100,
      cacheWriteTokens: 200,
      cacheReadTokens: 300,
      outputTokens: 50,
      costMicroUsd: 12_000,
      chatId: '101',
    });
    layer.aiSpendLog.recordRun({
      day: '2026-06-11',
      feature: 'fast-reply',
      isCacheHit: true,
      inputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      outputTokens: 0,
      costMicroUsd: 0,
      chatId: '102',
    });
    const rows = layer.aiSpendLog.rowsSince('2026-06-11');
    expect(rows).toEqual([
      {
        day: '2026-06-11',
        feature: 'fast-reply',
        runs: 2,
        cacheHitRuns: 1,
        inserted: 0,
        inputTokens: 100,
        cacheWriteTokens: 200,
        cacheReadTokens: 300,
        outputTokens: 50,
        costMicroUsd: 12_000,
        topRunMicroUsd: 12_000,
        topRunChatId: '101',
      },
    ]);
  });

  it('tracks the most expensive run with its chat', () => {
    const base = {
      day: '2026-06-11',
      feature: 'fan-summary',
      isCacheHit: false,
      inputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      outputTokens: 0,
    };
    layer.aiSpendLog.recordRun({ ...base, costMicroUsd: 50_000, chatId: 'a' });
    layer.aiSpendLog.recordRun({ ...base, costMicroUsd: 110_000, chatId: 'b' });
    layer.aiSpendLog.recordRun({ ...base, costMicroUsd: 70_000, chatId: 'c' });
    const row = layer.aiSpendLog.rowsSince('2026-06-11')[0];
    expect(row?.topRunMicroUsd).toBe(110_000);
    expect(row?.topRunChatId).toBe('b');
    expect(row?.costMicroUsd).toBe(230_000);
  });

  it('markInserted increments, creating the row when missing (day-flip race)', () => {
    layer.aiSpendLog.markInserted('2026-06-11', 'ping');
    layer.aiSpendLog.markInserted('2026-06-11', 'ping');
    const row = layer.aiSpendLog.rowsSince('2026-06-11')[0];
    expect(row?.inserted).toBe(2);
    expect(row?.runs).toBe(0);
  });

  it('rowsSince filters by day', () => {
    layer.aiSpendLog.markInserted('2026-06-04', 'ping');
    layer.aiSpendLog.markInserted('2026-06-11', 'ping');
    expect(layer.aiSpendLog.rowsSince('2026-06-05')).toHaveLength(1);
    expect(layer.aiSpendLog.rowsSince('2026-06-01')).toHaveLength(2);
  });

  it('rejects malformed day keys', () => {
    expect(() => layer.aiSpendLog.markInserted('nope', 'ping')).toThrow(/YYYY-MM-DD/);
    expect(() => layer.aiSpendLog.rowsSince('06/2026')).toThrow(/YYYY-MM-DD/);
  });
});
