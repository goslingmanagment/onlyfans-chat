import type { SyncStatusVM } from '../../../preload/contract';

export interface StatusAgeSelection {
  primaryAt: string | null;
  primaryKind: 'push' | 'list';
  listVerifiedAt: string | null;
  showListVerified: boolean;
}

export function selectStatusAge(
  status: SyncStatusVM | null,
  selectedAccountId: string | null,
): StatusAgeSelection {
  const listVerifiedAt =
    selectedAccountId !== null
      ? (status?.listVerifiedAt[selectedAccountId] ??
        status?.freshness[selectedAccountId] ??
        null)
      : null;
  if (status?.hubMode === 'live') {
    return {
      primaryAt: status.hubLastEventAt,
      primaryKind: 'push',
      listVerifiedAt,
      showListVerified: true,
    };
  }
  return {
    primaryAt: listVerifiedAt,
    primaryKind: 'list',
    listVerifiedAt,
    showListVerified: false,
  };
}
