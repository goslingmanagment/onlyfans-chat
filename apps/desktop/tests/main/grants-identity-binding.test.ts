// D35 §9 п.9: the local grant cache is bound to the identity that produced it.
// The incident this closes: A signs out, B signs in, B's first listAccounts
// fails (offline) — and the workspace opens A's accounts for B, because grants
// only change on a SUCCESSFUL listAccounts (D23) and custody says "configured".

import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_GRANTS_OWNER_KEY,
  grantsBelongToCurrentIdentity,
  readGrantOwner,
  writeGrantOwner,
} from '../../src/main/db/grant-owner';
import { applyAccountGrantSnapshot } from '../../src/main/sync/polling-sync';
import { HUB_DEVICE_IDENTITY_KEY } from '../../src/main/hub/credential-journal';
import { memoryDataLayer } from '../db/helpers';
import type { DataLayer } from '../../src/main/db/index';

function signedInAs(data: DataLayer, username: string | null): void {
  data.settings.set(HUB_DEVICE_IDENTITY_KEY, {
    version: 1,
    username,
    label: 'Desktop · box',
    tokenLast4: 'abcd',
    issuedAt: null,
    expiresAt: null,
  });
}

function account(id: string, username: string): Parameters<typeof applyAccountGrantSnapshot>[0][number] {
  return {
    id,
    name: username,
    username,
    is_authenticated: true,
  } as unknown as Parameters<typeof applyAccountGrantSnapshot>[0][number];
}

/** What `query:accounts.list` decides before it reads a single row. */
function visibleTo(data: DataLayer, username: string | null): number {
  return grantsBelongToCurrentIdentity(
    readGrantOwner(data.settings),
    username,
  )
    ? data.accounts.listGranted().length
    : 0;
}

describe('grantsBelongToCurrentIdentity', () => {
  it('shows a cache to the identity that produced it', () => {
    expect(grantsBelongToCurrentIdentity({ version: 1, username: 'grisha' }, 'grisha')).toBe(true);
  });

  it('hides a cache from a provably different identity', () => {
    expect(grantsBelongToCurrentIdentity({ version: 1, username: 'grisha' }, 'nikita')).toBe(false);
  });

  it('treats an unstamped cache as unknown, not foreign (installs before D35)', () => {
    expect(grantsBelongToCurrentIdentity(null, 'grisha')).toBe(true);
  });

  it('treats a null username on either side as unknown, not foreign', () => {
    // A pre-D19 credential's backfilled identity record has no username; it is
    // also the only credential such an install can hold, so there is no second
    // identity to confuse it with.
    expect(grantsBelongToCurrentIdentity({ version: 1, username: null }, 'grisha')).toBe(true);
    expect(grantsBelongToCurrentIdentity({ version: 1, username: 'grisha' }, null)).toBe(true);
    expect(grantsBelongToCurrentIdentity({ version: 1, username: null }, null)).toBe(true);
  });

  it('ignores a corrupt stamp instead of hiding the workspace', () => {
    const data = memoryDataLayer();
    data.settings.set(ACCOUNT_GRANTS_OWNER_KEY, { version: 9, who: 'grisha' });
    expect(readGrantOwner(data.settings)).toBeNull();
    expect(grantsBelongToCurrentIdentity(readGrantOwner(data.settings), 'nikita')).toBe(true);
  });
});

describe('the reconcile stamps whose grants it committed', () => {
  it('records the signed-in username with the authoritative snapshot', () => {
    const data = memoryDataLayer();
    signedInAs(data, 'grisha');

    applyAccountGrantSnapshot([account('acct_1', 'loravie')], data);

    expect(readGrantOwner(data.settings)).toEqual({ version: 1, username: 'grisha' });
    expect(data.accounts.listGranted()).toHaveLength(1);
  });

  it('records a null username for a credential that has none', () => {
    const data = memoryDataLayer();
    signedInAs(data, null);
    applyAccountGrantSnapshot([account('acct_1', 'loravie')], data);
    expect(readGrantOwner(data.settings)).toEqual({ version: 1, username: null });
  });
});

describe('A signed out, B signed in, B is offline', () => {
  it('B sees no accounts of A — and the rows are NOT deleted (D23)', () => {
    const data = memoryDataLayer();
    signedInAs(data, 'grisha');
    applyAccountGrantSnapshot([account('acct_1', 'loravie'), account('acct_2', 'loravip')], data);
    expect(visibleTo(data, 'grisha')).toBe(2);

    // B signs in; their first listAccounts never lands (offline), so nothing
    // re-reconciles. Custody is healthy, so the old code showed A's workspace.
    signedInAs(data, 'nikita');

    expect(visibleTo(data, 'nikita')).toBe(0);
    // The cache itself survives: A gets their workspace back on the next
    // sign-in without re-downloading anything.
    expect(data.accounts.listGranted()).toHaveLength(2);
    expect(visibleTo(data, 'grisha')).toBe(2);
  });

  it("B's first successful reconcile re-stamps and shows only B's pages", () => {
    const data = memoryDataLayer();
    signedInAs(data, 'grisha');
    applyAccountGrantSnapshot([account('acct_1', 'loravie')], data);
    signedInAs(data, 'nikita');
    expect(visibleTo(data, 'nikita')).toBe(0);

    applyAccountGrantSnapshot([account('acct_9', 'arivie')], data);

    expect(readGrantOwner(data.settings)).toEqual({ version: 1, username: 'nikita' });
    expect(visibleTo(data, 'nikita')).toBe(1);
    expect(data.accounts.listGranted().map((row) => row.id)).toEqual(['acct_9']);
    // A's row is revoked by the authoritative snapshot, not deleted.
    expect(data.accounts.get('acct_1')?.grantState).toBe('revoked');
  });

  it('an old install with no stamp keeps its workspace until the next reconcile', () => {
    const data = memoryDataLayer();
    // Rows committed by a build that predates the stamp.
    data.accounts.reconcileGrants([{
      id: 'acct_1',
      username: 'loravie',
      displayName: 'Lora',
      avatar: null,
      authState: 'authenticated',
      raw: {},
    }]);
    signedInAs(data, 'grisha');

    expect(readGrantOwner(data.settings)).toBeNull();
    expect(visibleTo(data, 'grisha')).toBe(1);

    writeGrantOwner(data.settings, 'grisha');
    expect(visibleTo(data, 'grisha')).toBe(1);
    expect(visibleTo(data, 'nikita')).toBe(0);
  });
});
