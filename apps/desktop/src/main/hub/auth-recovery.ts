// D35 §9 п.4: ONE self-healing dispatcher for all three hub transports.
//
// A revoked or expired sign-in must not leave a chatter staring at a red "auth
// failed" line with no way out (the D19 trigger). It also must not let any
// 401 delete a credential: three predicates gate the wipe, and everything else
// stays fail-closed exactly as before.
//
//   (a) the kernel said WHY — `reason` ∈ {token_revoked, token_expired}; a
//       reasonless 401 (unknown digest, a proxy, an outage) changes nothing;
//   (b) the bearer that got the 401 is still the stored one (digest compare),
//       so a late failure from a retired client cannot delete a newer sign-in;
//   (c) the work runs inside the credential FIFO, so it cannot interleave with
//       an issue/sign-out transition — and a durable transition journal makes
//       it stand down entirely, because that journal already owns the custody.
//
// The wipe itself is the "abandon without network" path: the kernel has
// already invalidated this credential, so there is nothing to revoke remotely.

import { isHubAuthReason, type HubAuthReason } from '@chatgoose/shared/errors/index';
import type { Keychain } from '../secrets/keychain';
import {
  HUB_SIGNED_OUT_KEY,
  deviceTokenDigest,
  readDeviceTokenActivation,
  readDeviceTokenRevocation,
  type CredentialJournalQueries,
} from './credential-journal';
import { abandonHubDeviceTokenCustody } from './device-token';

/** The machine reason a hub 401 carries, from any of the three transports. */
export function hubAuthReasonOf(error: unknown): HubAuthReason | null {
  if (typeof error !== 'object' || error === null) return null;
  const detail = (error as { detail?: unknown }).detail;
  if (typeof detail !== 'object' || detail === null) return null;
  const reason = (detail as { authReason?: unknown }).authReason;
  return isHubAuthReason(reason) ? reason : null;
}

export type HubAuthRecoveryOutcome = 'wiped' | 'ignored';

export interface HubAuthRecoveryInput {
  error: unknown;
  /** Digest of the bearer the failing request actually used. */
  bearerDigest: string;
  keychain: Pick<Keychain, 'getSecret' | 'setSecret' | 'deleteSecret'>;
  settings: CredentialJournalQueries;
  /** The credential FIFO; the whole decision runs inside it. */
  runCredentialMutation: <Result>(task: () => Promise<Result>) => Promise<Result>;
  now?: () => Date;
}

/**
 * Wipes the local sign-in of this machine when — and only when — the kernel
 * said this exact credential is gone. Returns what it did, for the caller to
 * log and to rebuild the runtime on.
 */
export async function recoverFromHubAuthFailure(
  input: HubAuthRecoveryInput,
): Promise<HubAuthRecoveryOutcome> {
  const reason = hubAuthReasonOf(input.error);
  if (reason === null) return 'ignored';

  return input.runCredentialMutation(async () => {
    // A durable activation/revocation already owns this custody and has its own
    // idempotent settlement; never race it.
    try {
      if (readDeviceTokenActivation(input.settings) !== null) return 'ignored';
      if (readDeviceTokenRevocation(input.settings) !== null) return 'ignored';
    } catch {
      // A corrupt/unreadable journal is fail-closed by its own recovery path.
      return 'ignored';
    }

    let active: string | null;
    try {
      active = await input.keychain.getSecret('hubDeviceToken');
    } catch {
      // An unreadable secret is not proof that THIS bearer is the stored one.
      return 'ignored';
    }
    if (active === null || deviceTokenDigest(active) !== input.bearerDigest) {
      return 'ignored';
    }

    // Record why before removing custody: the sign-in screen's banner is the
    // only place a chatter learns their session ended rather than broke.
    try {
      input.settings.set(HUB_SIGNED_OUT_KEY, {
        version: 1,
        reason,
        at: (input.now?.() ?? new Date()).toISOString(),
      });
    } catch {
      // Display metadata must never block the wipe itself.
    }
    await abandonHubDeviceTokenCustody({
      keychain: input.keychain,
      settings: input.settings,
    });
    return 'wiped';
  });
}
