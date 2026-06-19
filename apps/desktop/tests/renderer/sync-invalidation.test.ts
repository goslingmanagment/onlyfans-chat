import { describe, expect, it } from 'vitest';
import { syncStatusInvalidationKeysForEvent } from '../../src/renderer/src/bridge/syncInvalidation';

describe('syncStatusInvalidationKeysForEvent', () => {
  it.each(['messageReceived', 'messageSent'] as const)(
    '%s invalidates sync status and activity',
    (type) => {
      expect(syncStatusInvalidationKeysForEvent({ type })).toEqual([['sync-status'], ['activity']]);
    },
  );
});
