// Composition-root activation seams (index.ts is not unit-testable — it pulls
// in Electron). These small pure helpers carry the ordering/failure invariants
// index.ts wires: 4b non-fatal boot activation.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSettingsStore } from '@main/settings/store';
import type { SettingsVM } from '../../src/preload/contract';
import { drain, memoryDataLayer } from '../send/helpers';
import {
  activateRuntimeNonFatal,
  activateStoredCredentialWithRetry,
  createBoundedRetry,
  createRuntimeMutationQueue,
  probeHubReadCredential,
  replaceRuntimeSecurityFirst,
  stopRuntimeServices,
  subscribeSettingsScope,
  validateThenReconcileOnBoot,
} from '@main/runtime-activation';

afterEach(() => {
  vi.useRealTimers();
});

describe('activateRuntimeNonFatal (4b)', () => {
  it('resolves false and reports the error WITHOUT throwing when activation rejects', async () => {
    const error = new Error('CG-HUB-01: hub unreachable at launch');
    const onFailure = vi.fn();

    // The key guarantee: a failed boot activation must not reject — boot()
    // continues to loadWindowContent instead of dying behind a blank window.
    await expect(
      activateRuntimeNonFatal(() => Promise.reject(error), onFailure),
    ).resolves.toBe(false);
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledWith(error);
  });

  it('resolves true and does not report failure when activation succeeds', async () => {
    const onFailure = vi.fn();
    await expect(
      activateRuntimeNonFatal(() => Promise.resolve(), onFailure),
    ).resolves.toBe(true);
    expect(onFailure).not.toHaveBeenCalled();
  });
});

describe('probeHubReadCredential', () => {
  it('validates only through listAccounts and propagates rejection', async () => {
    const listAccounts = vi.fn(async () => [{ id: 'acct_candidate' }]);
    await expect(probeHubReadCredential({ listAccounts })).resolves.toBeUndefined();
    expect(listAccounts).toHaveBeenCalledWith({ purpose: 'hydration' });

    const error = new Error('CG-HUB-01 rejected');
    await expect(
      probeHubReadCredential({ listAccounts: () => Promise.reject(error) }),
    ).rejects.toBe(error);
  });
});

describe('createBoundedRetry', () => {
  it('retries on the configured schedule and stops after success', async () => {
    vi.useFakeTimers();
    const task = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce();
    const onAttemptFailure = vi.fn();
    const onSuccess = vi.fn();
    const retry = createBoundedRetry({
      task,
      delaysMs: [100, 200, 300],
      onAttemptFailure,
      onSuccess,
    });

    retry.start();
    expect(retry.pending()).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(task).toHaveBeenCalledTimes(1);
    expect(onAttemptFailure).toHaveBeenCalledWith(expect.any(Error), 1);
    await vi.advanceTimersByTimeAsync(200);
    expect(task).toHaveBeenCalledTimes(2);
    expect(onSuccess).toHaveBeenCalledWith(2);
    expect(retry.pending()).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('is bounded and cancel invalidates a pending series', async () => {
    vi.useFakeTimers();
    const error = new Error('still offline');
    const task = vi.fn(() => Promise.reject(error));
    const onExhausted = vi.fn();
    const retry = createBoundedRetry({ task, delaysMs: [10, 20], onExhausted });

    retry.start();
    await vi.advanceTimersByTimeAsync(30);
    expect(task).toHaveBeenCalledTimes(2);
    expect(onExhausted).toHaveBeenCalledWith(error);

    retry.start();
    retry.cancel();
    await vi.advanceTimersByTimeAsync(100);
    expect(task).toHaveBeenCalledTimes(2);
  });
});

describe('createRuntimeMutationQueue', () => {
  it('serializes sign-out behind an older activation and survives rejection', async () => {
    const queue = createRuntimeMutationQueue();
    const order: string[] = [];
    let releaseActivation: (() => void) | undefined;
    const activation = queue.run(
      () => new Promise<void>((resolve) => {
        order.push('activation:start');
        releaseActivation = resolve;
      }),
    );
    const signOut = queue.run(async () => {
      order.push('sign-out');
    });

    await Promise.resolve();
    expect(order).toEqual(['activation:start']);
    releaseActivation?.();
    await Promise.all([activation, signOut]);
    expect(order).toEqual(['activation:start', 'sign-out']);

    await expect(queue.run(() => Promise.reject(new Error('candidate rejected'))))
      .rejects.toThrow(/candidate rejected/);
    await expect(queue.run(async () => order.push('after-failure'))).resolves.toBe(3);
    expect(order.at(-1)).toBe('after-failure');
  });
});

describe('stopRuntimeServices', () => {
  it('stops every service and awaits send quiescence before dispose', async () => {
    const order: string[] = [];
    let releaseQuiesce: (() => void) | undefined;
    const stopped = stopRuntimeServices({
      disposeEventForwarding: () => order.push('events'),
      disposeSettingsWatcher: () => order.push('settings'),
      disposeCreditMeter: () => order.push('credits'),
      sync: { stop: () => order.push('sync') },
      spendersRefresh: { dispose: () => order.push('spenders') },
      sendEngine: {
        quiesce: () => new Promise<void>((resolve) => {
          order.push('send:quiesce');
          releaseQuiesce = resolve;
        }),
        dispose: () => order.push('send:dispose'),
      },
      coordinator: { dispose: () => order.push('coordinator') },
      hub: { dispose: () => order.push('hub') },
    });

    await Promise.resolve();
    expect(order).toEqual(['events', 'settings', 'credits', 'sync', 'spenders', 'send:quiesce']);
    releaseQuiesce?.();
    await stopped;
    expect(order).toEqual([
      'events',
      'settings',
      'credits',
      'sync',
      'spenders',
      'send:quiesce',
      'send:dispose',
      'coordinator',
      'hub',
    ]);
  });

  it('still disposes the runtime when send quiescence rejects', async () => {
    const order: string[] = [];
    await expect(
      stopRuntimeServices({
        sendEngine: {
          quiesce: () => Promise.reject(new Error('quiesce failed')),
          dispose: () => order.push('send'),
        },
        coordinator: { dispose: () => order.push('coordinator') },
        hub: { dispose: () => order.push('hub') },
      }),
    ).rejects.toThrow(/quiesce failed/);
    expect(order).toEqual(['send', 'coordinator', 'hub']);
  });
});

describe('replaceRuntimeSecurityFirst', () => {
  it('unpublishes first and leaves runtime deactivated when fallback validation fails', async () => {
    const order: string[] = [];
    await expect(
      replaceRuntimeSecurityFirst({
        deactivate: async () => {
          order.push('deactivate');
        },
        activateFallback: async () => {
          order.push('fallback');
          throw new Error('fallback rejected');
        },
      }),
    ).rejects.toThrow(/fallback rejected/);
    expect(order).toEqual(['deactivate', 'fallback', 'deactivate']);
  });

  it('publishes a valid fallback only after deactivation', async () => {
    const order: string[] = [];
    await replaceRuntimeSecurityFirst({
      deactivate: async () => {
        order.push('deactivate');
      },
      activateFallback: async () => {
        order.push('fallback');
      },
    });
    expect(order).toEqual(['deactivate', 'fallback']);
  });
});

describe('activateStoredCredentialWithRetry', () => {
  it('rejects visibly and schedules recovery while leaving credential custody to the caller', async () => {
    const cause = new Error('hub offline');
    const scheduleRetry = vi.fn();
    const onFailure = vi.fn();

    await expect(
      activateStoredCredentialWithRetry({
        activate: () => Promise.reject(cause),
        scheduleRetry,
        onFailure,
      }),
    ).rejects.toThrow(/token is stored and retrying automatically/i);
    expect(onFailure).toHaveBeenCalledWith(cause);
    expect(scheduleRetry).toHaveBeenCalledTimes(1);
  });

  it('returns success without scheduling when activation succeeds', async () => {
    const scheduleRetry = vi.fn();
    await expect(
      activateStoredCredentialWithRetry({
        activate: () => Promise.resolve(),
        scheduleRetry,
      }),
    ).resolves.toBeUndefined();
    expect(scheduleRetry).not.toHaveBeenCalled();
  });
});

describe('validateThenReconcileOnBoot (4c)', () => {
  it('settings rebuild (isBoot=false): validates BEFORE reconciling, returns the ids', async () => {
    const order: string[] = [];
    const accountIds = await validateThenReconcileOnBoot({
      syncAccounts: async () => {
        order.push('sync');
        return ['acct_a', 'acct_b'];
      },
      reconcile: async (isBoot) => {
        order.push(`reconcile:${isBoot}`);
      },
      isBoot: false,
    });
    expect(order).toEqual(['sync', 'reconcile:false']);
    expect(accountIds).toEqual(['acct_a', 'acct_b']);
  });

  it('settings rebuild (isBoot=false): does NOT reconcile when validation fails', async () => {
    const reconcile = vi.fn(async () => undefined);
    await expect(
      validateThenReconcileOnBoot({
        syncAccounts: () => Promise.reject(new Error('CG-HUB-01 account bootstrap failed')),
        reconcile,
        isBoot: false,
      }),
    ).rejects.toThrow(/CG-HUB-01/);
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('boot (isBoot=true): reconciles FIRST, then validates, returns the ids', async () => {
    // Boot keeps the ORIGINAL order: the destructive rewrites are local DB ops
    // that must not depend on hub reachability.
    const order: string[] = [];
    const accountIds = await validateThenReconcileOnBoot({
      syncAccounts: async () => {
        order.push('sync');
        return ['acct_a'];
      },
      reconcile: async (isBoot) => {
        order.push(`reconcile:${isBoot}`);
      },
      isBoot: true,
    });
    expect(order).toEqual(['reconcile:true', 'sync']);
    expect(accountIds).toEqual(['acct_a']);
  });

  it('boot (isBoot=true): reconcile STILL runs when validation fails; the error propagates', async () => {
    // Hub-unreachable boot (the path 4b made non-fatal): stale queued rows must
    // still be cancelled and sending rows parked — otherwise a later pump kick
    // would resurrect a prior-session queued message (SPEC §15.5).
    const reconcile = vi.fn(async () => undefined);
    await expect(
      validateThenReconcileOnBoot({
        syncAccounts: () => Promise.reject(new Error('CG-HUB-01 account bootstrap failed')),
        reconcile,
        isBoot: true,
      }),
    ).rejects.toThrow(/CG-HUB-01/);
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenCalledWith(true);
  });
});

describe('subscribeSettingsScope (4d)', () => {
  function fakeBus(): {
    subscribe: (listener: (events: readonly { readonly scope: string }[]) => void) => () => void;
    emit: (events: readonly { readonly scope: string }[]) => void;
  } {
    const listeners = new Set<(events: readonly { readonly scope: string }[]) => void>();
    return {
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      emit(events) {
        for (const listener of listeners) {
          listener(events);
        }
      },
    };
  }

  it('fires onSettingsChanged only for batches that touch the settings scope', () => {
    const bus = fakeBus();
    const onSettingsChanged = vi.fn();
    const dispose = subscribeSettingsScope(bus, onSettingsChanged);

    bus.emit([{ scope: 'chats' }, { scope: 'messages' }]);
    expect(onSettingsChanged).not.toHaveBeenCalled();

    bus.emit([{ scope: 'chats' }, { scope: 'settings' }]);
    expect(onSettingsChanged).toHaveBeenCalledTimes(1);

    // A settings write DURING the (still-attached) bootstrap is observed — the
    // 4d guarantee: the candidate does not miss it until the next write.
    bus.emit([{ scope: 'settings' }]);
    expect(onSettingsChanged).toHaveBeenCalledTimes(2);

    dispose();
    bus.emit([{ scope: 'settings' }]);
    expect(onSettingsChanged).toHaveBeenCalledTimes(2); // unsubscribed
  });

  it('4d race: a settings write during a slow bootstrap is seen by the activated gate', async () => {
    // The brief's integration race, over the REAL settings store + REAL DB bus,
    // wired exactly like index.ts's candidate: snapshot settingsCache, attach
    // the watcher at CANDIDATE creation, THEN run the (slow) validation.
    // Verified covering: re-attaching the watcher only AFTER activation (the
    // pre-4d post-swap wiring) makes this test fail — the gate stays stale.
    const data = memoryDataLayer();
    const secrets = {
      hasSecret: async () => false,
      setSecret: async () => undefined,
      deleteSecret: async () => undefined,
    };
    const settingsStore = createSettingsStore({ queries: data.settings, secrets });

    // Candidate creation (index.ts order): snapshot, then attach the watcher.
    let settingsCache: SettingsVM | null = await settingsStore.get();
    const dispose = subscribeSettingsScope(data.bus, () => {
      void settingsStore.get().then((vm) => {
        settingsCache = vm;
      });
    });
    // The polling module's gate shape (index.ts autoReadEnabled).
    const autoReadGate = (): boolean => settingsCache?.autoReadChats ?? false;
    expect(autoReadGate()).toBe(false);

    // Slow account bootstrap: resolved manually so the race is deterministic.
    let releaseValidation: ((ids: string[]) => void) | undefined;
    const activation = validateThenReconcileOnBoot({
      syncAccounts: () =>
        new Promise<string[]>((resolve) => {
          releaseValidation = resolve;
        }),
      reconcile: async () => undefined,
      isBoot: false,
    });

    // Mid-flight settings write (a scoped, non-rebuild-triggering key).
    await settingsStore.update({ autoReadChats: true });
    data.bus.flushNow(); // the change bus batches; deliver the settings event now
    await drain(); // let the watcher's async settingsStore.get() land

    releaseValidation?.(['acct_a']);
    await expect(activation).resolves.toEqual(['acct_a']);

    // After activation the gate observes the new value with NO further write.
    // (Before 4d the watcher attached only after the swap, so this was stale.)
    expect(autoReadGate()).toBe(true);
    dispose();
    data.close();
  });
});
