// Composition-root activation seams. index.ts (the composition root) is not
// unit-testable — it pulls in Electron at import — so the ordering/failure
// invariants of the OFAPI read-runtime lifecycle live here as small, injected,
// directly-testable helpers that index.ts wires.

/**
 * 4b: run a boot-time runtime activation so a failure NEVER aborts startup.
 *
 * DB/keychain initialization stays fatal (it runs BEFORE this in boot and keeps
 * its own error box). A failed OFAPI read-runtime activation — a bad/expired hub
 * key, hub unreachable, or offline-at-launch — is instead logged and swallowed:
 * boot continues to load the window with a null runtime (the keyless-boot path
 * tolerates null services via the getter-based IpcDeps), and the hub-status
 * channel/banner surfaces the disconnected state. Returns whether activation
 * succeeded, for callers that want to log or branch on it.
 */
export async function activateRuntimeNonFatal(
  activate: () => Promise<void>,
  onFailure: (error: unknown) => void,
): Promise<boolean> {
  try {
    await activate();
    return true;
  } catch (error) {
    onFailure(error);
    return false;
  }
}

/**
 * 4c: order account-bootstrap validation (syncAccounts) and engine
 * reconciliation per path — both always BEFORE the new engine is swapped in.
 *
 * Boot (isBoot=true): reconcile FIRST, then validate — the original boot order.
 * The destructive rewrites (queued→cancelled, sending→unconfirmed) are LOCAL DB
 * ops that must run even when the hub is unreachable (exactly the boot 4b makes
 * non-fatal): a stale 'queued' row surviving an offline boot would auto-send on
 * the next pump kick, and a stale 'sending' row would never be verified (the
 * verify loop only covers 'unconfirmed') — SPEC §15.5. A validation failure
 * still propagates to the caller (4b handles it non-fatally).
 *
 * Settings rebuild (isBoot=false): validate FIRST; if syncAccounts throws,
 * `reconcile` never runs, so a rejected candidate never touches the live outbox
 * (no createOfapiCommand, no state churn — the outgoing engine may still be
 * pumping those rows).
 *
 * Returns the validated account ids for the caller to start sync with.
 */
export async function validateThenReconcileOnBoot(params: {
  syncAccounts: () => Promise<readonly string[]>;
  reconcile: (isBoot: boolean) => Promise<void>;
  isBoot: boolean;
}): Promise<readonly string[]> {
  if (params.isBoot) {
    await params.reconcile(true);
    return params.syncAccounts();
  }
  const accountIds = await params.syncAccounts();
  await params.reconcile(false);
  return accountIds;
}

/**
 * 4d: subscribe to settings-scope DB changes, invoking `onSettingsChanged` for
 * any batch that touches the settings table. index.ts attaches this at CANDIDATE
 * creation — before the possibly-slow account bootstrap — so a settings write
 * DURING the rebuild is observed by the candidate's live settings cache instead
 * of being missed until the next write (the old attach happened after the swap).
 * Returns the unsubscribe disposer, added to the candidate's cleanup.
 */
export function subscribeSettingsScope(
  bus: {
    subscribe(listener: (events: readonly { readonly scope: string }[]) => void): () => void;
  },
  onSettingsChanged: () => void,
): () => void {
  return bus.subscribe((events) => {
    if (events.some((event) => event.scope === 'settings')) {
      onSettingsChanged();
    }
  });
}
