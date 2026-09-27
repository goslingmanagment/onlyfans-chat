// D42 × D35 rule 5: a media id token is served only for an OFAPI account
// granted to the identity that is signed in NOW. The grant cache is stamped
// with the identity that produced it (db/grant-owner.ts); a provably different
// identity gets nothing — not from the network, not from the local cache.

import { grantsBelongToCurrentIdentity, readGrantOwner, type GrantOwnerSettings } from '../db/grant-owner';
import { readHubDeviceIdentity, type CredentialJournalQueries } from '../hub/credential-journal';

export interface MediaServePolicyData {
  settings: Pick<GrantOwnerSettings, 'get'> & Pick<CredentialJournalQueries, 'get'>;
  accounts: { listGranted(): ReadonlyArray<{ id: string }> };
}

/** `accountId` → may this signed-in identity see its media? Read live on every call. */
export function createMediaServePolicy(data: MediaServePolicyData): (accountId: string) => boolean {
  return (accountId) => {
    const owner = readGrantOwner(data.settings);
    const username = readHubDeviceIdentity(data.settings)?.username ?? null;
    if (!grantsBelongToCurrentIdentity(owner, username)) return false;
    return data.accounts.listGranted().some((row) => row.id === accountId);
  };
}
