// D35 §9 п.9: the local grant cache belongs to an IDENTITY, not merely to
// whoever holds custody now.
//
// The failure it closes: A signs out, B signs in on the same machine, B's
// first `listAccounts` fails (offline), and the workspace — `configured`, with
// rows already in SQLite — opens A's accounts for B. Grants only change after
// a successful listAccounts (D23), so nothing else would have corrected it.
//
// The fix is a stamp, not a delete: every authoritative reconcile records whose
// identity produced it, and the account list refuses to hand rows to a
// provably different identity. The DB itself is never wiped (D23 / core #145) —
// the rows come back the moment the same person signs in again.

import { z } from 'zod';

export const ACCOUNT_GRANTS_OWNER_KEY = 'accountGrants.owner.v1';

const grantOwnerSchema = z.strictObject({
  version: z.literal(1),
  /** Null when the reconcile ran under an identity with no recorded username
   *  (a pre-D19 credential whose record was backfilled): unknown, not foreign. */
  username: z.string().min(1).max(120).nullable(),
});

export type GrantOwner = z.infer<typeof grantOwnerSchema>;

export interface GrantOwnerSettings {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

export function readGrantOwner(settings: Pick<GrantOwnerSettings, 'get'>): GrantOwner | null {
  let raw: unknown;
  try {
    raw = settings.get(ACCOUNT_GRANTS_OWNER_KEY);
  } catch {
    return null; // a corrupt row proves nothing about ownership
  }
  if (raw === undefined) return null;
  const parsed = grantOwnerSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function writeGrantOwner(settings: GrantOwnerSettings, username: string | null): void {
  try {
    settings.set(ACCOUNT_GRANTS_OWNER_KEY, { version: 1, username } satisfies GrantOwner);
  } catch {
    // The stamp is a safety label on a cache, never a gate on the reconcile
    // that just succeeded. A failed write only costs the next read its proof.
  }
}

/**
 * May the cached granted rows be shown to the current identity?
 *
 * Hidden ONLY on positive proof of a different person. An install that predates
 * the stamp, and a credential with no recorded username, are unknown — not
 * foreign — and keep their workspace (that install has no second identity to
 * confuse it with).
 */
export function grantsBelongToCurrentIdentity(
  stored: GrantOwner | null,
  currentUsername: string | null,
): boolean {
  if (stored === null || stored.username === null || currentUsername === null) return true;
  return stored.username === currentUsername;
}
