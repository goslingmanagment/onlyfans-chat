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
 * Credential validation must stay read-only: list the candidate credential's
 * accounts through the throwaway client, but do not feed them into syncAccounts
 * (which upserts the live accounts table). The real runtime bootstrap performs
 * that write only after settings/keychain persistence commits.
 */
export async function probeHubReadCredential(client: {
  listAccounts(args: { purpose: 'hydration' }): Promise<readonly unknown[]>;
}): Promise<void> {
  await client.listAccounts({ purpose: 'hydration' });
}

export interface BoundedRetryController {
  /** Replace any prior retry series and schedule attempt one. */
  start(): void;
  cancel(): void;
  pending(): boolean;
}

export interface RuntimeMutationQueue {
  run<Result>(task: () => Promise<Result>): Promise<Result>;
}

/** FIFO promise mutex for activation/deactivation transitions. A rejected task
 * is returned to its caller but does not poison the next queued mutation. */
export function createRuntimeMutationQueue(): RuntimeMutationQueue {
  let tail: Promise<void> = Promise.resolve();
  return {
    run<Result>(task: () => Promise<Result>): Promise<Result> {
      const result = tail.then(task, task);
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
}

/**
 * Small testable retry scheduler for post-sign-in runtime activation. The
 * initial activation already failed; delaysMs describes the bounded automatic
 * follow-up attempts. Starting or cancelling invalidates callbacks from an
 * older series, including callbacks whose async task is still settling.
 */
export function createBoundedRetry(options: {
  task: () => Promise<void>;
  delaysMs: readonly number[];
  onAttemptFailure?: (error: unknown, attempt: number) => void;
  onExhausted?: (lastError: unknown) => void;
  onSuccess?: (attempt: number) => void;
}): BoundedRetryController {
  for (const delay of options.delaysMs) {
    if (!Number.isFinite(delay) || delay < 0) {
      throw new Error(`Retry delay must be a non-negative finite number, got ${String(delay)}`);
    }
  }

  let generation = 0;
  let nextAttempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearPendingTimer = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const scheduleNext = (series: number, lastError: unknown = undefined): void => {
    if (series !== generation) {
      return;
    }
    const delay = options.delaysMs[nextAttempt];
    if (delay === undefined) {
      options.onExhausted?.(lastError);
      return;
    }
    const attempt = nextAttempt + 1;
    nextAttempt = attempt;
    timer = setTimeout(() => {
      timer = null;
      void options.task().then(
        () => {
          if (series !== generation) {
            return;
          }
          generation += 1;
          nextAttempt = 0;
          options.onSuccess?.(attempt);
        },
        (error: unknown) => {
          if (series !== generation) {
            return;
          }
          options.onAttemptFailure?.(error, attempt);
          scheduleNext(series, error);
        },
      );
    }, delay);
  };

  return {
    start() {
      clearPendingTimer();
      generation += 1;
      nextAttempt = 0;
      scheduleNext(generation);
    },
    cancel() {
      generation += 1;
      nextAttempt = 0;
      clearPendingTimer();
    },
    pending() {
      return timer !== null;
    },
  };
}

/** Credential-bound service teardown, kept injected so sign-out/replacement
 * ordering is regression-testable without importing Electron's composition root. */
export async function stopRuntimeServices(services: {
  disposeEventForwarding?: (() => void) | null;
  disposeSettingsWatcher?: (() => void) | null;
  disposeCreditMeter?: (() => void) | null;
  sync?: { stop(): void } | null;
  spendersRefresh?: { dispose(): void } | null;
  sendEngine?: { quiesce(): Promise<void>; dispose(): void } | null;
  coordinator?: { dispose(): void } | null;
  hub?: { dispose(): void } | null;
}): Promise<void> {
  services.disposeEventForwarding?.();
  services.disposeSettingsWatcher?.();
  services.disposeCreditMeter?.();
  services.sync?.stop();
  services.spendersRefresh?.dispose();
  let quiesceFailed = false;
  let quiesceError: unknown;
  if (services.sendEngine != null) {
    try {
      await services.sendEngine.quiesce();
    } catch (error) {
      quiesceFailed = true;
      quiesceError = error;
    } finally {
      services.sendEngine.dispose();
    }
  }
  services.coordinator?.dispose();
  services.hub?.dispose();
  if (quiesceFailed) {
    throw quiesceError;
  }
}

/**
 * Security-first credential transition used by device sign-out: the outgoing
 * token-bearing runtime is gone before fallback validation starts. If fallback
 * activation fails after partially publishing anything, a second deactivation
 * restores the fail-closed null-runtime state before the error escapes.
 */
export async function replaceRuntimeSecurityFirst(options: {
  deactivate: () => Promise<void>;
  activateFallback: () => Promise<void>;
}): Promise<void> {
  await options.deactivate();
  try {
    await options.activateFallback();
  } catch (error) {
    await options.deactivate();
    throw error;
  }
}

/**
 * A freshly issued device token is already durable when runtime activation
 * begins. Preserve that token, surface activation failure to the IPC caller,
 * and arm bounded background recovery instead of returning a false success.
 */
export async function activateStoredCredentialWithRetry(options: {
  activate: () => Promise<void>;
  scheduleRetry: () => void;
  onFailure?: (error: unknown) => void;
}): Promise<void> {
  try {
    await options.activate();
  } catch (error) {
    options.onFailure?.(error);
    options.scheduleRetry();
    throw new Error(
      'Device sign-in succeeded, but ChatGoose could not activate the runtime. The token is stored and retrying automatically.',
      { cause: error },
    );
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
