// D42 × D35 rule 5 (review D11): a media id token is served only for an OFAPI
// account granted to the identity that is signed in now. The grant cache is
// stamped with the identity that produced it; a provably different identity
// gets nothing. Unknown (pre-D19) identities are not treated as foreign.

import { describe, expect, it } from 'vitest';
import { ACCOUNT_GRANTS_OWNER_KEY } from '@main/db/grant-owner';
import { HUB_DEVICE_IDENTITY_KEY } from '@main/hub/credential-journal';
import { createMediaServePolicy } from '@main/media/serve-policy';

function setup(owner: string | null | undefined, signedIn: string | null | undefined, granted: string[]) {
  const settings = new Map<string, unknown>();
  if (owner !== undefined) settings.set(ACCOUNT_GRANTS_OWNER_KEY, { version: 1, username: owner });
  if (signedIn !== undefined) {
    settings.set(HUB_DEVICE_IDENTITY_KEY, {
      version: 1, username: signedIn, label: 'Device', tokenLast4: 'abcd', issuedAt: null, expiresAt: null,
    });
  }
  const rows = granted.map((id) => ({ id }));
  const canServe = createMediaServePolicy({
    settings: { get: (key) => settings.get(key) },
    accounts: { listGranted: () => rows },
  });
  return { canServe, settings, rows };
}

describe('media serve policy (D35 rule 5)', () => {
  it('serves a granted account to the identity that owns the grants', () => {
    const { canServe } = setup('maxim', 'maxim', ['acct_1']);
    expect(canServe('acct_1')).toBe(true);
    expect(canServe('acct_2')).toBe(false);
  });

  it('serves nothing to a provably different identity, not even a granted account', () => {
    const { canServe } = setup('maxim', 'olga', ['acct_1']);
    expect(canServe('acct_1')).toBe(false);
  });

  it('treats an unknown identity (no stamp, no username) as not foreign', () => {
    expect(setup(undefined, 'olga', ['acct_1']).canServe('acct_1')).toBe(true);
    expect(setup('maxim', undefined, ['acct_1']).canServe('acct_1')).toBe(true);
    expect(setup(null, 'olga', ['acct_1']).canServe('acct_1')).toBe(true);
  });

  it('reads grants and identity live on every call (a sign-out/sign-in switches at once)', () => {
    const { canServe, settings, rows } = setup('maxim', 'maxim', ['acct_1']);
    expect(canServe('acct_1')).toBe(true);
    settings.set(HUB_DEVICE_IDENTITY_KEY, {
      version: 1, username: 'olga', label: 'Device', tokenLast4: 'abcd', issuedAt: null, expiresAt: null,
    });
    expect(canServe('acct_1')).toBe(false);
    settings.set(ACCOUNT_GRANTS_OWNER_KEY, { version: 1, username: 'olga' });
    rows.length = 0;
    expect(canServe('acct_1')).toBe(false);
  });

  it('a corrupt identity record serves nothing foreign and never throws', () => {
    const { canServe, settings } = setup('maxim', 'maxim', ['acct_1']);
    settings.set(HUB_DEVICE_IDENTITY_KEY, { garbage: true });
    expect(() => canServe('acct_1')).not.toThrow();
  });
});
