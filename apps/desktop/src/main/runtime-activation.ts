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

/** Expose the cached/local UI before beginning any remote runtime activation.
 * Registration and renderer load remain fatal startup work; activation runs in
 * the background and reports its eventual status through the supplied hooks. */
export async function exposeUiBeforeRuntimeActivation(options: {
  registerIpc: () => void;
  loadUi: () => Promise<void>;
  activate: () => Promise<void>;
  onActivationFailure: (error: unknown) => void;
  onActivationSettled?: (activated: boolean) => void;
}): Promise<void> {
  options.registerIpc();
  await options.loadUi();
  void activateRuntimeNonFatal(options.activate, options.onActivationFailure)
    .then((activated) => options.onActivationSettled?.(activated))
    .catch(() => undefined);
}

/** A normal fatal boot must not leave a lock-holding, windowless process. Show
 * the synchronous error box, flush diagnostics, then release custody via exit. */
export async function exitAfterFatalBoot(options: {
  showError: () => void;
  flush: () => Promise<void>;
  exit: (code: number) => void;
}): Promise<void> {
  try {
    options.showError();
  } finally {
    try {
      await options.flush();
    } finally {
      options.exit(1);
    }
  }
}

/** Electron's `quit` event is too late to await service shutdown. This
 * before-quit barrier prevents the first attempt, drains exactly once, then
 * reissues quit; the second pass is allowed through. */
export function createBeforeQuitBarrier(options: {
  drain: () => Promise<void>;
  quit: () => void;
  onError?: (error: unknown) => void;
}): (event: { preventDefault(): void }) => void {
  let state: 'idle' | 'draining' | 'drained' = 'idle';
  const report = (error: unknown): void => {
    try {
      options.onError?.(error);
    } catch {
      // Shutdown reporting must not strand the process behind the barrier.
    }
  };
  const finish = (): void => {
    state = 'drained';
    try {
      options.quit();
    } catch (error) {
      report(error);
    }
  };

  return (event) => {
    if (state === 'drained') {
      return;
    }
    event.preventDefault();
    if (state === 'draining') {
      return;
    }
    state = 'draining';
    void options.drain().then(finish, (error: unknown) => {
      report(error);
      finish();
    });
  };
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
  /** Atomically reject future mutations and run one final task after the
   * already-accepted tail. Used by before-quit shutdown. */
  sealAndRun<Result>(task: () => Promise<Result>): Promise<Result>;
}

/** FIFO promise mutex for activation/deactivation transitions. A rejected task
 * is returned to its caller but does not poison the next queued mutation. */
export function createRuntimeMutationQueue(): RuntimeMutationQueue {
  let tail: Promise<void> = Promise.resolve();
  let sealed = false;
  let terminal: Promise<unknown> | null = null;
  const enqueue = <Result>(task: () => Promise<Result>): Promise<Result> => {
    const result = tail.then(task, task);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  return {
    run<Result>(task: () => Promise<Result>): Promise<Result> {
      if (sealed) {
        return Promise.reject(new Error('Runtime mutation queue is sealed for shutdown'));
      }
      return enqueue(task);
    },
    sealAndRun<Result>(task: () => Promise<Result>): Promise<Result> {
      if (terminal !== null) {
        // Quit can race a terminal purge (including auto-updater quit). Both
        // callers must await the same custody transition; the second terminal
        // task must neither bypass it nor deactivate a second time.
        return terminal as Promise<Result>;
      }
      sealed = true;
      const result = enqueue(task);
      terminal = result;
      return result;
    },
  };
}

/** Terminal custody transition shared by quit and purge. Sealing and enqueueing
 * the final drain are one operation, so a settings probe that completes a
 * moment later cannot publish a replacement runtime against a closing/deleted
 * database. */
export function sealRuntimeForTerminalOperation<Result>(
  queue: RuntimeMutationQueue,
  drain: () => Promise<Result>,
): Promise<Result> {
  return queue.sealAndRun(drain);
}

/** Stop every producer before deciding whether harvested custody is complete.
 * A table may already be dirty when purge starts, so an eager pre-drain guard
 * would make the final delta uploader unreachable and strand local deletion
 * forever on otherwise healthy stores. */
export async function drainRuntimeThenFinishCustody(options: {
  deactivateRuntime(): Promise<void>;
  finishCustody(): Promise<void>;
}): Promise<void> {
  await options.deactivateRuntime();
  await options.finishCustody();
}

/** A destructive DB purge may not erase the only durable journal that binds an
 * encrypted staged token to its remote activation/revocation intent. Recovery
 * returns true while network settlement is still deferred; fail closed and
 * preserve the DB so the next boot can resume the exact credential. */
export async function requireSettledDeviceCredentialCustody(options: {
  recover(): Promise<boolean>;
}): Promise<void> {
  if (await options.recover()) {
    throw new Error(
      'Local data cannot be purged while Hub device-token activation or revocation is still pending. Retry after the Hub is reachable.',
    );
  }
}

/** Destructive purge tail with an explicit recovery path. Once the runtime
 * queue is terminally sealed, a custody failure cannot safely return to the
 * current process. Preserve the DB, surface the error, and relaunch instead. */
export async function runFailClosedTerminalPurge(options: {
  finishCustody(): Promise<void>;
  closeDatabase(): void;
  clearMedia(): Promise<void>;
  deleteLocalData(): Promise<void>;
  onFailure(error: unknown): void;
  relaunch(): void;
  exit(code: number): void;
}): Promise<void> {
  try {
    await options.finishCustody();
    options.closeDatabase();
    await options.clearMedia();
    await options.deleteLocalData();
  } catch (error) {
    options.onFailure(error);
    options.relaunch();
    options.exit(1);
    throw error;
  }
  options.relaunch();
  options.exit(0);
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
  sync?: { stop(): Promise<void> | void } | null;
  spendersRefresh?: { dispose(): void } | null;
  sendEngine?: { quiesce(): Promise<void>; dispose(): void } | null;
  coordinator?: { dispose(): void } | null;
  hub?: { quiesce?(): Promise<void>; dispose(): void } | null;
}): Promise<void> {
  services.disposeSettingsWatcher?.();
  services.disposeCreditMeter?.();
  // Prevent a scoped refresh queue from enrolling another polling read while
  // the provider's quiescence barrier is draining its current one.
  services.spendersRefresh?.dispose();
  // Stop the producer first, then await its DB-continuation barrier before a
  // replacement runtime can publish or the owner can close SQLite.
  await services.sync?.stop();
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
  // Coordinator disposal emits terminal discarded frames. Keep the renderer
  // subscription alive through that emission so jobs cannot remain running.
  services.disposeEventForwarding?.();
  if (services.hub != null) {
    try {
      await services.hub.quiesce?.();
    } catch (error) {
      if (!quiesceFailed) {
        quiesceFailed = true;
        quiesceError = error;
      }
    } finally {
      services.hub.dispose();
    }
  }
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
  /** Server-side invalidation, while the outgoing secret still exists. */
  revokeCredential?: () => Promise<void>;
  /** Local keychain deletion, only after server-side invalidation succeeds. */
  deleteCredential?: () => Promise<void>;
  activateFallback: () => Promise<void>;
}): Promise<void> {
  await options.deactivate();
  try {
    await options.revokeCredential?.();
    await options.deleteCredential?.();
    await options.activateFallback();
  } catch (error) {
    await options.deactivate();
    throw error;
  }
}

export const HUB_DEVICE_TOKEN_ALREADY_STORED_MESSAGE =
  'A Hub device token is already stored. Sign out before signing in again.';

/**
 * One FIFO owner for the complete device-credential lifecycle. Issuance must
 * hold the same queue as sign-out from the pre-mint existence check through
 * keychain persistence and runtime activation; otherwise sign-out can capture
 * token A, then delete a concurrently persisted token B. The activation and
 * sign-out callbacks run inside the queue and therefore must not re-enter it.
 */
export function createSerializedCredentialLifecycle<Input, Result>(options: {
  queue: RuntimeMutationQueue;
  readStoredCredential(): Promise<string | null>;
  issueAndStore(input: Input): Promise<Result>;
  activateStoredCredential(): Promise<void>;
  signOutTransition(): Promise<void>;
}): {
  issue(input: Input): Promise<Result>;
  signOut(): Promise<void>;
} {
  return {
    issue(input) {
      return options.queue.run(async () => {
        const current = await options.readStoredCredential();
        if (current !== null && current.trim().length > 0) {
          throw new Error(HUB_DEVICE_TOKEN_ALREADY_STORED_MESSAGE);
        }
        const issued = await options.issueAndStore(input);
        await options.activateStoredCredential();
        return issued;
      });
    },
    signOut() {
      return options.queue.run(options.signOutTransition);
    },
  };
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
