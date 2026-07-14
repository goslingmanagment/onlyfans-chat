// Stage 24: one-time device-token issuance (kernel Stage 22 adoption). The
// chatter signs in once with username+password; the desktop trades the
// session for a device-bound bearer (`agency_hub_device_…`, sliding 90 d)
// stored in the keychain. The legacy chatter key stays accepted as fallback
// (kernel dual-acceptance) — its retirement is a later, kernel-declared step.
//
// The Electron main process has no cookie jar, so the session cookie from
// login is captured off the raw response and carried explicitly through the
// SDK client's static-headers seam for the issue + logout calls.

import { randomUUID } from 'node:crypto';
import { createClient, KernelApiError } from '@kernel/sdk';
import type { Keychain } from '../secrets/keychain';
import {
  HUB_DEVICE_TOKEN_BINDING_KEY,
  HUB_DEVICE_TOKEN_ACTIVATION_KEY,
  HUB_DEVICE_TOKEN_REVOCATION_KEY,
  deviceTokenDigest,
  parseStagedDeviceToken,
  readDeviceTokenActivation,
  readDeviceTokenBinding,
  readDeviceTokenRevocation,
  type CredentialJournalQueries,
  type HubDeviceTokenActivation,
  type HubDeviceTokenRevocation,
} from './credential-journal';

export interface HubDeviceTokenResult {
  keyPrefix: string;
  label: string;
  expiresAt: string;
}

export interface IssueHubDeviceTokenInput {
  baseUrl: string;
  username: string;
  password: string;
  /** Shown in the owner's device-token admin list (machine name). */
  label: string;
  keychain: Pick<Keychain, 'getSecret' | 'setSecret' | 'deleteSecret'>;
  settings: CredentialJournalQueries;
  fetchImpl?: typeof fetch;
  /**
   * Stage 4 / Proposal 4.1 (N5): stamped as `x-client-version` on the sign-in
   * POST and carried through the SDK's static-headers seam for the issue/
   * logout calls — without it, a machine mid-onboarding is invisible to the
   * fleet-adoption release gate.
   */
  clientVersion?: string;
  /** Called only after durable activation custody exists and settlement failed. */
  onActivationDeferred?: (error: unknown) => void;
}

export interface RevokeHubDeviceTokenInput {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  clientVersion?: string;
}

export interface DeviceTokenLifecycleStorage {
  keychain: Pick<Keychain, 'getSecret' | 'setSecret' | 'deleteSecret'>;
  settings: CredentialJournalQueries;
}

export type DeviceTokenCustodyRecovery =
  | 'accepted-promoted-active'
  | 'unrecoverable-activation-requires-abandonment'
  | 'rebuilt-revocation-custody'
  | 'unrecoverable-revocation-requires-abandonment';

class UnrelatedActiveDeviceTokenError extends Error {}

function deviceTokenBinding(
  hubBaseUrl: string,
  tokenDigest: string,
) {
  return { version: 1 as const, hubBaseUrl, tokenDigest };
}

function requireMatchingActiveDeviceTokenBinding(
  settings: CredentialJournalQueries,
  hubBaseUrl: string,
  token: string,
): void {
  const binding = readDeviceTokenBinding(settings);
  if (
    binding === null
    || binding.hubBaseUrl !== hubBaseUrl
    || binding.tokenDigest !== deviceTokenDigest(token)
  ) {
    throw new Error(
      'Stored Hub device token is not cryptographically bound to this Hub; re-enrol or explicitly forget it before network use.',
    );
  }
}

export const HUB_DEVICE_TOKEN_HUB_SWITCH_BLOCKED_MESSAGE =
  'Sign out the stored Hub device token before changing the Hub URL.';

/**
 * Credential transitions own the global runtime-mutation queue. A fetch with
 * no deadline can therefore strand sign-out, purge, settings saves, and boot
 * recovery behind one unresponsive Hub forever. Keep the budget per request
 * (rather than per multi-request transition) so a healthy login/reserve does
 * not consume the activation or logout budget.
 */
export const HUB_DEVICE_TOKEN_REQUEST_TIMEOUT_MS = 20_000;

function boundedDeviceTokenFetch(fetchImpl: typeof fetch): typeof fetch {
  return async (input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> => {
    const controller = new AbortController();
    const callerSignals = [
      input instanceof Request ? input.signal : undefined,
      init?.signal ?? undefined,
    ].filter((signal): signal is AbortSignal => signal !== undefined);
    const subscriptions: Array<{ signal: AbortSignal; listener: () => void }> = [];

    for (const signal of new Set(callerSignals)) {
      if (signal.aborted) {
        controller.abort(signal.reason);
        break;
      }
      const listener = (): void => controller.abort(signal.reason);
      signal.addEventListener('abort', listener, { once: true });
      subscriptions.push({ signal, listener });
    }

    const timer = setTimeout(() => {
      controller.abort(new DOMException(
        `Hub device-token request timed out after ${HUB_DEVICE_TOKEN_REQUEST_TIMEOUT_MS} ms.`,
        'TimeoutError',
      ));
    }, HUB_DEVICE_TOKEN_REQUEST_TIMEOUT_MS);

    let rejectOnAbort: (() => void) | undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectOnAbort = (): void => {
        reject(controller.signal.reason ?? new DOMException('Hub device-token request aborted.', 'AbortError'));
      };
      if (controller.signal.aborted) {
        rejectOnAbort();
      } else {
        controller.signal.addEventListener('abort', rejectOnAbort, { once: true });
      }
    });

    // Promise.race is intentional: an injected/test fetch is not trusted to
    // honor AbortSignal. Native fetch still receives the composed signal so it
    // can cancel socket work, while the queue regains liveness at the deadline
    // even if the implementation ignores it.
    const pendingFetch = Promise.resolve().then(
      () => fetchImpl(input, { ...init, signal: controller.signal }),
    );
    try {
      return await Promise.race([pendingFetch, aborted]);
    } finally {
      clearTimeout(timer);
      if (rejectOnAbort !== undefined) {
        controller.signal.removeEventListener('abort', rejectOnAbort);
      }
      for (const { signal, listener } of subscriptions) {
        signal.removeEventListener('abort', listener);
      }
    }
  };
}

export async function issueHubDeviceToken(input: IssueHubDeviceTokenInput): Promise<HubDeviceTokenResult> {
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, '');
  const rawFetchImpl = input.fetchImpl ?? fetch;
  const fetchImpl = boundedDeviceTokenFetch(rawFetchImpl);
  const clientVersion = input.clientVersion?.trim();
  const notifyActivationDeferred = (error: unknown): void => {
    try {
      input.onActivationDeferred?.(error);
    } catch {
      // Scheduling/reporting must never replace the custody result/error.
    }
  };
  const versionHeaders: Record<string, string> =
    clientVersion !== undefined && clientVersion.length > 0
      ? { 'x-client-version': clientVersion }
      : {};

  const login = await fetchImpl(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...versionHeaders },
    body: JSON.stringify({ username: input.username.trim(), password: input.password }),
  });
  if (login.status === 401 || login.status === 403) {
    throw new Error('Invalid username or password.');
  }
  if (!login.ok) {
    throw new Error(`Hub login failed (${login.status}).`);
  }
  const setCookie = login.headers.get('set-cookie');
  const sessionCookie = setCookie?.split(';')[0] ?? null;
  if (!sessionCookie) {
    throw new Error('Hub login returned no session cookie.');
  }

  const client = createClient({
    baseUrl,
    headers: { cookie: sessionCookie, ...versionHeaders },
    fetch: fetchImpl,
  });
  try {
    const reserved = await client.authReserveDeviceToken({ body: { label: input.label } });
    const journal: HubDeviceTokenActivation = {
      version: 1,
      id: randomUUID(),
      hubBaseUrl: baseUrl,
      tokenDigest: deviceTokenDigest(reserved.token),
      reservationId: reserved.reservationId,
      label: reserved.label,
      keyPrefix: reserved.keyPrefix,
      reservationExpiresAt: reserved.reservationExpiresAt,
      cancelRequested: false,
    };
    await input.keychain.setSecret('hubDeviceTokenStaged', JSON.stringify({
      version: 1,
      journalId: journal.id,
      token: reserved.token,
    }));
    try {
      input.settings.set(HUB_DEVICE_TOKEN_ACTIVATION_KEY, journal);
    } catch (error) {
      const persisted = readDeviceTokenActivation(input.settings);
      if (persisted?.id !== journal.id) {
        await input.keychain.deleteSecret('hubDeviceTokenStaged').catch(() => undefined);
        throw error;
      }
    }
    // From here on failure is intentionally recoverable: the encrypted token
    // and hash-bound non-secret journal stay quarantined for boot/retry.  In
    // particular, a 404 from an older Core never turns the reservation into a
    // bearer, because only the new activation route can move its digest.
    try {
      const result = await completeHubDeviceTokenActivation({
        keychain: input.keychain,
        settings: input.settings,
        baseUrl,
        fetchImpl: rawFetchImpl,
        ...(clientVersion !== undefined && clientVersion.length > 0 ? { clientVersion } : {}),
      });
      // Journal removal is the commit point. A failed post-commit staging-file
      // cleanup must not turn a successful activation into a false failure, but
      // it still needs an in-process retry or it can block Hub switching.
      try {
        if (await input.keychain.getSecret('hubDeviceTokenStaged') !== null) {
          notifyActivationDeferred(
            new Error('Hub device-token activation committed; encrypted staging cleanup is pending.'),
          );
        }
      } catch (error) {
        notifyActivationDeferred(error);
      }
      return result;
    } catch (error) {
      // A lost activation response can mean Core already holds a live bearer.
      // The caller must arm recovery in this process, not wait for a restart.
      // Terminal 401 cleanup removes the journal and therefore needs no retry.
      let transitionStillDurable = true;
      try {
        transitionStillDurable = readDeviceTokenActivation(input.settings) !== null
          || await input.keychain.getSecret('hubDeviceTokenStaged') !== null;
      } catch {
        // A corrupt/unreadable journal is also not safe to leave unattended.
      }
      if (transitionStillDurable) {
        notifyActivationDeferred(error);
      }
      throw error;
    }
  } finally {
    // One-time session: best-effort hygiene, never fails the issuance.
    await client.logout().catch(() => undefined);
  }
}

async function completeHubDeviceTokenActivation(
  input: DeviceTokenLifecycleStorage & {
    baseUrl?: string;
    fetchImpl?: typeof fetch;
    clientVersion?: string;
  },
): Promise<HubDeviceTokenResult> {
  const journal = readDeviceTokenActivation(input.settings);
  if (journal === null) {
    throw new Error('No pending Hub device-token activation exists.');
  }
  const rawStaged = await input.keychain.getSecret('hubDeviceTokenStaged');
  if (rawStaged === null) {
    throw new Error('Hub device-token activation journal is missing encrypted custody.');
  }
  const staged = parseStagedDeviceToken(rawStaged, {
    journalId: journal.id,
    tokenDigest: journal.tokenDigest,
  });
  const baseUrl = (input.baseUrl ?? journal.hubBaseUrl).trim().replace(/\/+$/, '');
  if (baseUrl !== journal.hubBaseUrl) {
    throw new Error('Hub device-token activation origin does not match its journal.');
  }
  const clientVersion = input.clientVersion?.trim();
  const fetchImpl = boundedDeviceTokenFetch(input.fetchImpl ?? fetch);
  let activated: Awaited<ReturnType<ReturnType<typeof createClient>['authActivateDeviceToken']>>;
  try {
    activated = await createClient({
      baseUrl,
      auth: { mode: 'bearer', token: () => staged.token },
      ...(clientVersion ? { headers: { 'x-client-version': clientVersion } } : {}),
      fetch: fetchImpl,
    }).authActivateDeviceToken();
  } catch (error) {
    if (error instanceof KernelApiError && error.status === 401) {
      // The activation route accepts both a live reservation and its already-
      // activated digest. A 401 therefore proves Core has neither. Keeping the
      // local transition would permanently block future sign-in; discard only
      // custody bound to this exact hash. A 404/5xx remains deferred for
      // rolling deploys and transient outages.
      let active: string | null = null;
      let activeUnreadable = false;
      try {
        active = await input.keychain.getSecret('hubDeviceToken');
      } catch {
        activeUnreadable = true;
      }
      const activeMatches = active !== null && deviceTokenDigest(active) === journal.tokenDigest;
      if (activeMatches) {
        await input.keychain.deleteSecret('hubDeviceToken');
      }
      let bindingMatchesJournal = false;
      try {
        const binding = readDeviceTokenBinding(input.settings);
        bindingMatchesJournal = binding?.hubBaseUrl === journal.hubBaseUrl
          && binding.tokenDigest === journal.tokenDigest;
      } catch {
        // A corrupt binding is already fail-closed and must not prevent removal
        // of the exact terminal-dead activation journal.
      }
      try {
        input.settings.batch([
          { kind: 'remove', key: HUB_DEVICE_TOKEN_ACTIVATION_KEY },
          ...(!activeUnreadable && (activeMatches || bindingMatchesJournal)
            ? [{ kind: 'remove' as const, key: HUB_DEVICE_TOKEN_BINDING_KEY }]
            : []),
        ]);
      } catch (removeError) {
        if (readDeviceTokenActivation(input.settings) !== null) throw removeError;
      }
      await input.keychain.deleteSecret('hubDeviceTokenStaged').catch(() => undefined);
    }
    throw error;
  }

  // Re-check after the network wait. External profile restore/manual file
  // replacement is outside the in-process queue and can occur while activate
  // is in flight; never overwrite a different, origin-unknown active token.
  let activeBeforePromotion: string | null = null;
  let activeBeforePromotionUnreadable = false;
  try {
    activeBeforePromotion = await input.keychain.getSecret('hubDeviceToken');
  } catch {
    activeBeforePromotionUnreadable = true;
  }
  const unrelatedActive = activeBeforePromotionUnreadable || (
    activeBeforePromotion !== null
    && deviceTokenDigest(activeBeforePromotion) !== journal.tokenDigest
  );

  if (journal.cancelRequested || unrelatedActive) {
    // Sign-out was requested while activation was network-deferred. Convert
    // activation custody into a revoke journal with one atomic SQLite batch
    // before attempting DELETE. Thus a crash can observe activation intent or
    // revocation intent, never an untracked live Core credential.
    const revocation: HubDeviceTokenRevocation = {
      version: 1,
      id: journal.id,
      hubBaseUrl: journal.hubBaseUrl,
      tokenDigest: journal.tokenDigest,
      remoteSettled: false,
    };
    await input.keychain.setSecret('hubDeviceTokenRevoking', JSON.stringify({
      version: 1,
      journalId: revocation.id,
      token: staged.token,
    }));
    try {
      input.settings.batch([
        { kind: 'set', key: HUB_DEVICE_TOKEN_REVOCATION_KEY, value: revocation },
        { kind: 'remove', key: HUB_DEVICE_TOKEN_ACTIVATION_KEY },
      ]);
    } catch (error) {
      const persistedRevocation = readDeviceTokenRevocation(input.settings);
      const persistedActivation = readDeviceTokenActivation(input.settings);
      if (persistedRevocation?.id !== revocation.id || persistedActivation !== null) {
        throw error;
      }
    }
    await input.keychain.deleteSecret('hubDeviceTokenStaged').catch(() => undefined);
    await completeHubDeviceTokenRevocation(input);
    return {
      keyPrefix: activated.keyPrefix,
      label: activated.label,
      expiresAt: activated.expiresAt,
    };
  }

  // Promotion happens only after Core confirms the atomic move.  A process
  // crash after this write but before journal removal simply replays the
  // idempotent activation and writes the same token again.
  await input.keychain.setSecret('hubDeviceToken', staged.token);
  try {
    input.settings.batch([
      {
        kind: 'set',
        key: HUB_DEVICE_TOKEN_BINDING_KEY,
        value: deviceTokenBinding(journal.hubBaseUrl, journal.tokenDigest),
      },
      { kind: 'remove', key: HUB_DEVICE_TOKEN_ACTIVATION_KEY },
    ]);
  } catch (error) {
    const persistedBinding = readDeviceTokenBinding(input.settings);
    if (
      readDeviceTokenActivation(input.settings) !== null
      || persistedBinding?.hubBaseUrl !== journal.hubBaseUrl
      || persistedBinding.tokenDigest !== journal.tokenDigest
    ) throw error;
  }
  await input.keychain.deleteSecret('hubDeviceTokenStaged').catch(() => undefined);
  return {
    keyPrefix: activated.keyPrefix,
    label: activated.label,
    expiresAt: activated.expiresAt,
  };
}

/** Persist sign-out intent before attempting to settle a deferred activation.
 * Recovery will either discard a terminal-invalid reservation or atomically
 * convert the live activation into exact-token revocation. */
export function requestHubDeviceTokenActivationCancellation(
  settings: CredentialJournalQueries,
): boolean {
  const journal = readDeviceTokenActivation(settings);
  if (journal === null) return false;
  if (journal.cancelRequested) return true;
  const updated: HubDeviceTokenActivation = { ...journal, cancelRequested: true };
  try {
    settings.batch([{ kind: 'set', key: HUB_DEVICE_TOKEN_ACTIVATION_KEY, value: updated }]);
  } catch (error) {
    if (readDeviceTokenActivation(settings)?.cancelRequested !== true) throw error;
  }
  return true;
}

export async function beginHubDeviceTokenRevocation(
  input: DeviceTokenLifecycleStorage & RevokeHubDeviceTokenInput,
): Promise<'revoked' | 'already-invalid'> {
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, '');
  const token = input.token.trim();
  if (baseUrl.length === 0 || token.length === 0) {
    throw new Error('Hub base URL and device token are required for sign-out.');
  }
  requireMatchingActiveDeviceTokenBinding(input.settings, baseUrl, token);
  const journal: HubDeviceTokenRevocation = {
    version: 1,
    id: randomUUID(),
    hubBaseUrl: baseUrl,
    tokenDigest: deviceTokenDigest(token),
    remoteSettled: false,
  };
  await input.keychain.setSecret('hubDeviceTokenRevoking', JSON.stringify({
    version: 1,
    journalId: journal.id,
    token,
  }));
  try {
    input.settings.set(HUB_DEVICE_TOKEN_REVOCATION_KEY, journal);
  } catch (error) {
    const persisted = readDeviceTokenRevocation(input.settings);
    if (persisted?.id !== journal.id) {
      await input.keychain.deleteSecret('hubDeviceTokenRevoking').catch(() => undefined);
      throw error;
    }
  }
  return completeHubDeviceTokenRevocation(input);
}

async function completeHubDeviceTokenRevocation(
  input: DeviceTokenLifecycleStorage & {
    fetchImpl?: typeof fetch;
    clientVersion?: string;
  },
): Promise<'revoked' | 'already-invalid'> {
  const journal = readDeviceTokenRevocation(input.settings);
  if (journal === null) {
    throw new Error('No pending Hub device-token revocation exists.');
  }
  if (journal.remoteSettled) {
    let active: string | null;
    try {
      active = await input.keychain.getSecret('hubDeviceToken');
    } catch (error) {
      throw new UnrelatedActiveDeviceTokenError(
        'Hub device-token revocation cannot inspect active custody; explicit local abandonment is required.',
        { cause: error },
      );
    }
    if (active !== null && deviceTokenDigest(active) !== journal.tokenDigest) {
      throw new UnrelatedActiveDeviceTokenError(
        'Hub device-token revocation found unrelated active custody; explicit local abandonment is required.',
      );
    }
    await input.keychain.deleteSecret('hubDeviceToken');
    try {
      input.settings.batch([
        { kind: 'remove', key: HUB_DEVICE_TOKEN_BINDING_KEY },
        { kind: 'remove', key: HUB_DEVICE_TOKEN_REVOCATION_KEY },
      ]);
    } catch (error) {
      if (readDeviceTokenRevocation(input.settings) !== null) throw error;
    }
    await input.keychain.deleteSecret('hubDeviceTokenRevoking').catch(() => undefined);
    return 'revoked';
  }
  const rawStaged = await input.keychain.getSecret('hubDeviceTokenRevoking');
  if (rawStaged === null) {
    throw new Error('Hub device-token revocation journal is missing encrypted custody.');
  }
  const staged = parseStagedDeviceToken(rawStaged, {
    journalId: journal.id,
    tokenDigest: journal.tokenDigest,
  });
  const result = await revokeHubDeviceToken({
    baseUrl: journal.hubBaseUrl,
    token: staged.token,
    ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {}),
    ...(input.clientVersion !== undefined ? { clientVersion: input.clientVersion } : {}),
  });

  let active: string | null = null;
  let activeUnreadable = false;
  try {
    active = await input.keychain.getSecret('hubDeviceToken');
  } catch {
    activeUnreadable = true;
  }
  if (activeUnreadable || (active !== null && deviceTokenDigest(active) !== journal.tokenDigest)) {
    // In-process credential mutations are serialized, so a different active
    // token can only come from an external/partial restore. Its origin is not
    // proven by this journal and it must never be paired with the saved Hub.
    // Keep the journal as a visible fail-closed latch until the user explicitly
    // abandons local custody; the remote DELETE above is idempotent if retried.
    const settledJournal: HubDeviceTokenRevocation = { ...journal, remoteSettled: true };
    try {
      input.settings.set(HUB_DEVICE_TOKEN_REVOCATION_KEY, settledJournal);
    } catch (error) {
      if (readDeviceTokenRevocation(input.settings)?.remoteSettled !== true) throw error;
    }
    throw new UnrelatedActiveDeviceTokenError(
      'Hub device-token revocation found unrelated active custody; explicit local abandonment is required.',
    );
  }
  await input.keychain.deleteSecret('hubDeviceToken');
  try {
    input.settings.batch([
      { kind: 'remove', key: HUB_DEVICE_TOKEN_BINDING_KEY },
      { kind: 'remove', key: HUB_DEVICE_TOKEN_REVOCATION_KEY },
    ]);
  } catch (error) {
    if (readDeviceTokenRevocation(input.settings) !== null) throw error;
  }
  await input.keychain.deleteSecret('hubDeviceTokenRevoking').catch(() => undefined);
  return result;
}

/** Process-crash recovery. Windows sudden-power-loss durability still depends
 * on the filesystem/DPAPI honoring the completed atomic rename; directory
 * write-through is best-effort and is not claimed here. Network failure keeps
 * journal + encrypted custody quarantined for the next retry. */
export async function recoverHubDeviceTokenLifecycle(
  input: DeviceTokenLifecycleStorage & {
    fetchImpl?: typeof fetch;
    clientVersion?: string;
    /** Saved connection coordinate used to prove the journal still belongs to
     * the configured Hub. Omit only in isolated callers/tests that do not own
     * settings coordinates. */
    currentHubBaseUrl?: string | null;
    onDeferred?: (kind: 'activation' | 'revocation', error: unknown) => void;
    onCustodyRecovery?: (
      kind: 'activation' | 'revocation',
      outcome: DeviceTokenCustodyRecovery,
    ) => void;
  },
): Promise<boolean> {
  const readSecretCustody = async (
    name: Parameters<Keychain['getSecret']>[0],
  ): Promise<{ value: string | null; unreadable: boolean }> => {
    try {
      return { value: await input.keychain.getSecret(name), unreadable: false };
    } catch {
      return { value: null, unreadable: true };
    }
  };
  const notifyRecovery = (
    kind: 'activation' | 'revocation',
    outcome: DeviceTokenCustodyRecovery,
  ): void => {
    try {
      input.onCustodyRecovery?.(kind, outcome);
    } catch {
      // Diagnostics must never replace a completed custody repair.
    }
  };
  const journalOriginMismatch = (
    journal: HubDeviceTokenActivation | HubDeviceTokenRevocation,
  ): boolean => {
    if (input.currentHubBaseUrl === undefined) return false;
    const current = input.currentHubBaseUrl === null
      ? null
      : input.currentHubBaseUrl.trim().replace(/\/+$/, '');
    return current !== journal.hubBaseUrl;
  };

  let activation = readDeviceTokenActivation(input.settings);
  let revocation = readDeviceTokenRevocation(input.settings);
  if (activation !== null && revocation !== null) {
    throw new Error('Conflicting Hub device-token activation and revocation journals.');
  }
  let activationRequiresAbandonment = false;
  if (activation !== null) {
    const activationOriginMismatch = journalOriginMismatch(activation);
    {
      const [stagedCustody, activeCustody] = await Promise.all([
        readSecretCustody('hubDeviceTokenStaged'),
        readSecretCustody('hubDeviceToken'),
      ]);
      let stagingValid = false;
      if (!stagedCustody.unreadable && stagedCustody.value !== null) {
        try {
          parseStagedDeviceToken(stagedCustody.value, {
            journalId: activation.id,
            tokenDigest: activation.tokenDigest,
          });
          stagingValid = true;
        } catch {
          // A corrupt or foreign staging record is equivalent to missing custody.
        }
      }
      if (!stagingValid) {
        const activeMatches = !activeCustody.unreadable
          && activeCustody.value !== null
          && deviceTokenDigest(activeCustody.value) === activation.tokenDigest;
        if (activeMatches && (activation.cancelRequested || activationOriginMismatch)) {
          // Sign-out intent still owns this token. Rebuild the encrypted staging
          // envelope from the exact active copy so normal recovery can revoke it.
          if (!activation.cancelRequested) {
            requestHubDeviceTokenActivationCancellation(input.settings);
            activation = readDeviceTokenActivation(input.settings);
          }
          await input.keychain.setSecret('hubDeviceTokenStaged', JSON.stringify({
            version: 1,
            journalId: activation!.id,
            token: activeCustody.value,
          }));
        } else {
          if (activeMatches) {
            try {
              input.settings.batch([
                {
                  kind: 'set',
                  key: HUB_DEVICE_TOKEN_BINDING_KEY,
                  value: deviceTokenBinding(activation.hubBaseUrl, activation.tokenDigest),
                },
                { kind: 'remove', key: HUB_DEVICE_TOKEN_ACTIVATION_KEY },
              ]);
            } catch (error) {
              const binding = readDeviceTokenBinding(input.settings);
              if (
                readDeviceTokenActivation(input.settings) !== null
                || binding?.hubBaseUrl !== activation.hubBaseUrl
                || binding.tokenDigest !== activation.tokenDigest
              ) throw error;
            }
            await input.keychain.deleteSecret('hubDeviceTokenStaged').catch(() => undefined);
            notifyRecovery('activation', 'accepted-promoted-active');
            activation = null;
          } else {
            // A lost activation response can leave a live Core token even though
            // every local copy disappeared. Do not silently orphan it. Keep the
            // journal as an explicit security warning until the user chooses the
            // native-confirmed local-abandonment escape hatch.
            activationRequiresAbandonment = true;
            notifyRecovery('activation', 'unrecoverable-activation-requires-abandonment');
          }
        }
      } else if (
        activationOriginMismatch
        || activeCustody.unreadable
        || (
          activeCustody.value !== null
          && deviceTokenDigest(activeCustody.value) !== activation.tokenDigest
        )
      ) {
        // Settle the exact journal-bound reservation against its proven origin,
        // but retain a revocation latch for the unrelated active file. The
        // remote token is activated only so it can be revoked idempotently.
        requestHubDeviceTokenActivationCancellation(input.settings);
        activation = readDeviceTokenActivation(input.settings);
      }
    }
  }
  if (activation !== null && !activationRequiresAbandonment) {
    try {
      await completeHubDeviceTokenActivation(input);
    } catch (error) {
      const terminalWasCleared = error instanceof KernelApiError
        && error.status === 401
        && readDeviceTokenActivation(input.settings) === null;
      if (error instanceof UnrelatedActiveDeviceTokenError) {
        notifyRecovery('revocation', 'unrecoverable-revocation-requires-abandonment');
      } else if (!terminalWasCleared) {
        input.onDeferred?.('activation', error);
      }
    }
  }

  // A cancel-requested activation can atomically become revocation above.
  // Re-read instead of treating its newly written encrypted custody as an
  // orphan based on the stale pre-activation snapshot.
  revocation = readDeviceTokenRevocation(input.settings);
  if (activation !== null && revocation !== null) {
    // The activation completion already attempted exact revocation and left
    // its durable journal on failure. Let the bounded retry own the next
    // network attempt instead of issuing two DELETEs in one recovery pass.
  } else if (revocation !== null) {
    if (revocation.remoteSettled) {
      await completeHubDeviceTokenRevocation(input).catch((error: unknown) => {
        if (error instanceof UnrelatedActiveDeviceTokenError) {
          notifyRecovery('revocation', 'unrecoverable-revocation-requires-abandonment');
        } else {
          input.onDeferred?.('revocation', error);
        }
      });
    } else {
      const [revokingCustody, activeCustody] = await Promise.all([
        readSecretCustody('hubDeviceTokenRevoking'),
        readSecretCustody('hubDeviceToken'),
      ]);
      let stagingValid = false;
      if (!revokingCustody.unreadable && revokingCustody.value !== null) {
        try {
          parseStagedDeviceToken(revokingCustody.value, {
            journalId: revocation.id,
            tokenDigest: revocation.tokenDigest,
          });
          stagingValid = true;
        } catch {
          // Reconstruct only from a hash-matched active copy below.
        }
      }
      if (
        !stagingValid
        && !activeCustody.unreadable
        && activeCustody.value !== null
        && deviceTokenDigest(activeCustody.value) === revocation.tokenDigest
      ) {
        await input.keychain.setSecret('hubDeviceTokenRevoking', JSON.stringify({
          version: 1,
          journalId: revocation.id,
          token: activeCustody.value,
        }));
        stagingValid = true;
        notifyRecovery('revocation', 'rebuilt-revocation-custody');
      }
      const activeMismatch = activeCustody.unreadable || (
        activeCustody.value !== null
        && deviceTokenDigest(activeCustody.value) !== revocation.tokenDigest
      );
      if (activeMismatch) {
        // Revoke the exact journal token using its proven custody, then retain
        // the journal as a settled latch for the unrelated active file.
        if (stagingValid) {
          await completeHubDeviceTokenRevocation(input).catch((error: unknown) => {
            if (error instanceof UnrelatedActiveDeviceTokenError) {
              notifyRecovery('revocation', 'unrecoverable-revocation-requires-abandonment');
            } else {
              input.onDeferred?.('revocation', error);
            }
          });
        } else {
          notifyRecovery('revocation', 'unrecoverable-revocation-requires-abandonment');
        }
      } else if (!stagingValid) {
        // Even active===null is not proof of remote revoke under external file
        // loss/backup-restore. Preserve the warning journal until the operator
        // explicitly accepts possible remote-token orphaning.
        notifyRecovery('revocation', 'unrecoverable-revocation-requires-abandonment');
      } else {
        await completeHubDeviceTokenRevocation(input).catch((error: unknown) => {
          if (error instanceof UnrelatedActiveDeviceTokenError) {
            notifyRecovery('revocation', 'unrecoverable-revocation-requires-abandonment');
          } else {
            input.onDeferred?.('revocation', error);
          }
        });
      }
    }
  }

  // Re-read after every transition. In particular, a process can die after the
  // atomic activation->revocation SQLite batch but before deleting the old
  // staged file; completing revocation in the next process must not leave that
  // orphan blocking Hub switches forever. Cleanup failures remain retryable.
  const finalActivation = readDeviceTokenActivation(input.settings);
  const finalRevocation = readDeviceTokenRevocation(input.settings);
  const cleanupOrphan = async (
    name: 'hubDeviceTokenStaged' | 'hubDeviceTokenRevoking',
    kind: 'activation' | 'revocation',
    journalExists: boolean,
  ): Promise<void> => {
    if (journalExists) return;
    try {
      // Deletion does not require decryption. Reading first would make a
      // journal-less DPAPI/corrupt orphan impossible to remove and would block
      // Hub switching/purge forever despite there being no remote intent left.
      await input.keychain.deleteSecret(name);
    } catch (error) {
      if (input.onDeferred === undefined) throw error;
      input.onDeferred(kind, error);
    }
  };
  await cleanupOrphan('hubDeviceTokenStaged', 'activation', finalActivation !== null);
  await cleanupOrphan('hubDeviceTokenRevoking', 'revocation', finalRevocation !== null);
  return finalActivation !== null || finalRevocation !== null;
}

/** Explicit last-resort recovery for a permanently unavailable old Hub. The
 * caller must obtain user confirmation: remote revocation is intentionally not
 * claimed, so the old Hub may retain a live token until an admin revokes it. */
export async function abandonHubDeviceTokenCustody(
  input: DeviceTokenLifecycleStorage,
): Promise<void> {
  await input.keychain.deleteSecret('hubDeviceToken');
  await input.keychain.deleteSecret('hubDeviceTokenStaged');
  await input.keychain.deleteSecret('hubDeviceTokenRevoking');
  input.settings.batch([
    { kind: 'remove', key: HUB_DEVICE_TOKEN_BINDING_KEY },
    { kind: 'remove', key: HUB_DEVICE_TOKEN_ACTIVATION_KEY },
    { kind: 'remove', key: HUB_DEVICE_TOKEN_REVOCATION_KEY },
  ]);
}

/**
 * Revoke the exact device-token bearer before its local keychain copy is
 * removed. A 401 is an idempotent success: Core no longer accepts that token,
 * so deleting the local copy cannot leave a live remote credential behind.
 * Every other failure stays visible and the caller must keep the local token.
 */
export async function revokeHubDeviceToken(
  input: RevokeHubDeviceTokenInput,
): Promise<'revoked' | 'already-invalid'> {
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, '');
  const token = input.token.trim();
  if (baseUrl.length === 0 || token.length === 0) {
    throw new Error('Hub base URL and device token are required for sign-out.');
  }
  const clientVersion = input.clientVersion?.trim();
  const fetchImpl = boundedDeviceTokenFetch(input.fetchImpl ?? fetch);
  const headers: Record<string, string> =
    clientVersion !== undefined && clientVersion.length > 0
      ? { 'x-client-version': clientVersion }
      : {};
  const client = createClient({
    baseUrl,
    auth: { mode: 'bearer', token: () => token },
    headers,
    fetch: fetchImpl,
  });
  try {
    await client.authRevokeCurrentDeviceToken();
    return 'revoked';
  } catch (error) {
    if (error instanceof KernelApiError && error.status === 401) {
      return 'already-invalid';
    }
    throw error;
  }
}

/**
 * The hub bearer credential: device token when present, legacy chatter key
 * otherwise (kernel dual-acceptance holds through the rollout window).
 */
export async function resolveHubCredential(
  keychain: Pick<Keychain, 'getSecret'>,
): Promise<string | null> {
  const deviceToken = await keychain.getSecret('hubDeviceToken');
  if (deviceToken !== null && deviceToken.trim().length > 0) {
    return deviceToken;
  }
  return keychain.getSecret('hubApiKey');
}

/**
 * The hub bearer that `resolveHubCredential` WOULD return after
 * `settingsStore.update(patch)` is applied — computed WITHOUT persisting, so a
 * pre-persist validation (4a: index.ts's read-runtime probe) can test exactly
 * the credential that will authenticate.
 *
 * MUST mirror settings/store.ts `update()`'s credential rules (kept in lockstep):
 *   • a hub switch is rejected while a device token exists, because only the
 *     explicit sign-out path can revoke it remotely before deleting local custody;
 *   • once no device token exists, a switch wipes the old chatter key unless the
 *     SAME patch carries a replacement;
 *   • without a switch the device token is preserved and still shadows any
 *     chatter-key write (resolveHubCredential prefers it unconditionally).
 */
/**
 * I116-2 (W4.1): the paste-a-key recovery on a dead device token. The 4a
 * probe validates with the credential the patch WOULD resolve — the stored
 * device token whenever one exists, because it shadows any pasted chatter key
 * (`resolveHubCredential` prefers it unconditionally). When that probe fails
 * AUTH and the patch carries a fresh key, the documented recovery used to
 * fail SILENTLY: the stale token 401'd, the save rejected, nothing surfaced.
 * Returns the pasted key to RE-PROBE with — on its success the stored token
 * is provably dead and must be cleared — or null when the failure is not
 * this exact shape (a real credential rejection stays a rejection).
 */
export function probeRetryKeyAfterAuthFailure(input: {
  /** The bearer the failed probe actually used. */
  usedCredential: string;
  currentDeviceToken: string | null;
  /** parsed patch value; `undefined` = key not in the patch. */
  patchHubApiKey: string | undefined;
  hubSwitched: boolean;
  /** True when the probe failure was an auth rejection (CG-HUB-01). */
  authFailure: boolean;
}): string | null {
  if (!input.authFailure || input.hubSwitched) {
    return null;
  }
  const token = input.currentDeviceToken?.trim() ?? '';
  if (token.length === 0 || input.usedCredential !== input.currentDeviceToken) {
    return null; // the probe already used the pasted key — a real rejection
  }
  const pasted = input.patchHubApiKey?.trim() ?? '';
  if (pasted.length === 0 || pasted === input.usedCredential) {
    return null;
  }
  return pasted;
}

export function effectiveHubBearerAfterPatch(input: {
  /** parsed patch value; `undefined` = key not in the patch, '' = clear. */
  patchHubApiKey: string | undefined;
  /** parsed patch value; `undefined` = URL not in the patch. */
  patchHubBaseUrl: string | null | undefined;
  currentHubBaseUrl: string | null;
  currentDeviceToken: string | null;
  currentHubApiKey: string | null;
}): string | null {
  const hubSwitched =
    input.patchHubBaseUrl !== undefined && input.patchHubBaseUrl !== input.currentHubBaseUrl;

  const currentDeviceToken = input.currentDeviceToken?.trim() ?? '';
  if (hubSwitched && currentDeviceToken.length > 0) {
    // A settings save has no authenticated old-Hub revocation transaction. If
    // it merely deleted local custody, the old bearer would remain live and the
    // app would lose its only handle for revoking it. Force the explicit
    // security-first sign-out lifecycle instead.
    throw new Error(HUB_DEVICE_TOKEN_HUB_SWITCH_BLOCKED_MESSAGE);
  }
  if (currentDeviceToken.length > 0) {
    return input.currentDeviceToken;
  }

  if (input.patchHubApiKey !== undefined) {
    const trimmed = input.patchHubApiKey.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  // Key not in the patch: a switch wiped the old one; otherwise it survives.
  return hubSwitched ? null : input.currentHubApiKey;
}
