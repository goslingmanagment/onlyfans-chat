import type { SyncEvent } from '@chatgoose/shared/protocol/index';

export const SYNC_ACTIVITY_INVALIDATION_KEYS = [
  ['sync-status'],
  ['activity'],
] as const;

export function syncStatusInvalidationKeysForEvent(
  _event: Pick<SyncEvent, 'type'>,
): typeof SYNC_ACTIVITY_INVALIDATION_KEYS {
  return SYNC_ACTIVITY_INVALIDATION_KEYS;
}
