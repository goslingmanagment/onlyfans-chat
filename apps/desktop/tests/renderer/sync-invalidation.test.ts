import { describe, expect, it } from 'vitest';
import { syncStatusInvalidationKeysForEvent } from '../../src/renderer/src/bridge/syncInvalidation';
import { dbChangedInvalidationKeysForEvent } from '../../src/renderer/src/bridge/dbInvalidation';

describe('syncStatusInvalidationKeysForEvent', () => {
  it.each(['messageReceived', 'messageSent'] as const)(
    '%s invalidates sync status and activity',
    (type) => {
      expect(syncStatusInvalidationKeysForEvent({ type })).toEqual([['sync-status'], ['activity']]);
    },
  );
});

describe('dbChangedInvalidationKeysForEvent', () => {
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
      ],
    ],
    [
      { scope: 'messages' as const, accountId: 'acct_1', chatId: '101' },
      [
        ['messages', 'acct_1', '101'],
        ['spenders-roster', 'acct_1'],
        ['spenders-untiered', 'acct_1'],
        ['spenders-stats', 'acct_1'],
      ],
    ],
    [
      { scope: 'fans' as const, accountId: 'acct_1', chatId: '101' },
      [
        ['fan', 'acct_1', '101'],
        ['spenders-roster', 'acct_1'],
        ['spenders-untiered', 'acct_1'],
        ['spenders-stats', 'acct_1'],
      ],
    ],
  ])('%s invalidates account-scoped read models', (event, expected) => {
    expect(dbChangedInvalidationKeysForEvent(event)).toEqual(expected);
  });
});
