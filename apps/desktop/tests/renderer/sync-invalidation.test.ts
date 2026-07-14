import { describe, expect, it } from 'vitest';
import { syncStatusInvalidationKeysForEvent } from '../../src/renderer/src/bridge/syncInvalidation';
import {
  dbChangedInvalidationKeysForEvent,
  settingsKeysInvalidateAiContext,
} from '../../src/renderer/src/bridge/dbInvalidation';

describe('syncStatusInvalidationKeysForEvent', () => {
  it.each(['messageReceived', 'messageSent'] as const)(
    '%s invalidates sync status and activity',
    (type) => {
      expect(syncStatusInvalidationKeysForEvent({ type })).toEqual([['sync-status'], ['activity']]);
    },
  );
});

describe('dbChangedInvalidationKeysForEvent', () => {
  it('refreshes persona and account views when catalog metadata changes', () => {
    expect(dbChangedInvalidationKeysForEvent({
      scope: 'settings',
      settingsKeys: ['personalities.catalog.v1.scope'],
    })).toEqual([
      ['settings'],
      ['personalities'],
      ['accounts'],
      ['fan'],
    ]);
  });

  it('limits account mapping invalidation to the affected account when supplied', () => {
    expect(dbChangedInvalidationKeysForEvent({
      scope: 'settings',
      accountId: 'acct_1',
      settingsKeys: ['personalities.accountMappings.v2.scope'],
    })).toEqual([
      ['settings'],
      ['accounts'],
      ['fan', 'acct_1'],
    ]);
    expect(dbChangedInvalidationKeysForEvent({
      scope: 'settings',
      settingsKeys: ['personalities.accountMappings.v2.scope'],
    })).toEqual([
      ['settings'],
      ['accounts'],
    ]);
  });

  it('keeps unrelated and legacy keyless settings events settings-only', () => {
    expect(dbChangedInvalidationKeysForEvent({
      scope: 'settings',
      settingsKeys: ['soundEnabled'],
    })).toEqual([['settings']]);
    expect(dbChangedInvalidationKeysForEvent({ scope: 'settings' })).toEqual([['settings']]);
  });

  it.each([
    [
      { scope: 'chats' as const, accountId: 'acct_1', chatId: '101' },
      [
        ['chats', 'acct_1'],
        ['chats-paged', 'acct_1'],
        ['chat', 'acct_1', '101'],
        ['accounts'],
        ['spenders-roster', 'acct_1'],
        ['spenders-untiered', 'acct_1'],
        ['spenders-stats', 'acct_1'],
        ['online', 'acct_1'],
      ],
    ],
    [
      { scope: 'messages' as const, accountId: 'acct_1', chatId: '101' },
      [
        ['messages', 'acct_1', '101'],
        ['spenders-roster', 'acct_1'],
        ['spenders-untiered', 'acct_1'],
        ['spenders-stats', 'acct_1'],
        ['online', 'acct_1'],
      ],
    ],
    [
      { scope: 'fans' as const, accountId: 'acct_1', chatId: '101' },
      [
        ['fan', 'acct_1', '101'],
        ['spenders-roster', 'acct_1'],
        ['spenders-untiered', 'acct_1'],
        ['spenders-stats', 'acct_1'],
        ['online', 'acct_1'],
      ],
    ],
  ])('%s invalidates account-scoped read models', (event, expected) => {
    expect(dbChangedInvalidationKeysForEvent(event)).toEqual(expected);
  });
});

describe('settingsKeysInvalidateAiContext', () => {
  it('recognizes only main\'s committed runtime identity event', () => {
    expect(settingsKeysInvalidateAiContext(['runtime.aiContext'])).toBe(true);
  });

  it('does not reset AI for patches, catalog, mappings, or legacy keyless events', () => {
    expect(settingsKeysInvalidateAiContext([
      'hubBaseUrl',
      'accountPageLabels',
      'accountMappings',
      'personalities.catalog.v1.scope-digest',
      'personalities.accountMappings.v2.scope-digest',
    ])).toBe(false);
    expect(settingsKeysInvalidateAiContext(undefined)).toBe(false);
  });
});
