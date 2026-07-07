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
 * 4c: on a read-runtime (re)build, run account-bootstrap validation FIRST, then
 * engine reconciliation — both BEFORE the new engine is swapped in. If
 * validation (syncAccounts) throws, `reconcile` never runs, so a rejected
 * rebuild never touches the live outbox (no createOfapiCommand, no state churn).
 * `isBoot` is forwarded to `reconcile` (true from boot, false from a settings
 * rebuild — see engine.reconcileOnBoot, which gates its destructive transitions
 * on it). Returns the validated account ids for the caller to start sync with.
 */
export async function validateThenReconcileOnBoot(params: {
  syncAccounts: () => Promise<readonly string[]>;
  reconcile: (isBoot: boolean) => Promise<void>;
  isBoot: boolean;
}): Promise<readonly string[]> {
  const accountIds = await params.syncAccounts();
  await params.reconcile(params.isBoot);
  return accountIds;
}
