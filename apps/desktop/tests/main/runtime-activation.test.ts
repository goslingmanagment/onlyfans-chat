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
  createBeforeQuitBarrier,
  createBoundedRetry,
  createRuntimeMutationQueue,
  createSerializedCredentialLifecycle,
  drainRuntimeThenFinishCustody,
  exitAfterFatalBoot,
  exposeUiBeforeRuntimeActivation,
  finishPurgeCustody,
  hubCredentialNeedsAttention,
  probeHubReadCredential,
  requireSettledDeviceCredentialCustody,
  replaceRuntimeSecurityFirst,
  runFailClosedTerminalPurge,
  sealRuntimeForTerminalOperation,
  settleDeviceCredentialBeforePurge,
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

describe('hubCredentialNeedsAttention', () => {
  const bound = {
    hasHubKey: true,
    hubApiKeyBindingState: 'bound' as const,
    hasHubDeviceToken: false,
    hubDeviceTokenBindingState: 'none' as const,
    hubDeviceTokenTransition: null,
  };

  it('surfaces a surviving lifecycle journal even when every custody file is missing', () => {
    expect(hubCredentialNeedsAttention({
      ...bound,
      hasHubKey: false,
      hubApiKeyBindingState: 'none',
      hubDeviceTokenTransition: 'revocation',
    })).toBe(true);
  });

  it('does not flag an exact bound credential with no lifecycle journal', () => {
    expect(hubCredentialNeedsAttention(bound)).toBe(false);
  });
});

describe('exposeUiBeforeRuntimeActivation', () => {
  it('registers IPC and finishes cached UI load before starting remote activation', async () => {
    const order: string[] = [];
    let releaseActivation: (() => void) | undefined;
    const settled: boolean[] = [];

    await exposeUiBeforeRuntimeActivation({
      registerIpc: () => order.push('ipc'),
      loadUi: async () => {
        order.push('ui');
      },
      activate: () => new Promise<void>((resolve) => {
        order.push('activate');
        releaseActivation = resolve;
      }),
      onActivationFailure: () => order.push('failure'),
      onActivationSettled: (activated) => settled.push(activated),
    });

    expect(order).toEqual(['ipc', 'ui', 'activate']);
    expect(settled).toEqual([]);
    releaseActivation?.();
    await vi.waitFor(() => expect(settled).toEqual([true]));
  });

  it('keeps an offline activation non-fatal and forwards its settled status', async () => {
    const error = new Error('offline');
    const onFailure = vi.fn();
    const onSettled = vi.fn();
    await exposeUiBeforeRuntimeActivation({
      registerIpc: () => undefined,
      loadUi: async () => undefined,
      activate: () => Promise.reject(error),
      onActivationFailure: onFailure,
      onActivationSettled: onSettled,
    });
    await vi.waitFor(() => expect(onSettled).toHaveBeenCalledWith(false));
    expect(onFailure).toHaveBeenCalledWith(error);
  });
});

describe('exitAfterFatalBoot', () => {
  it('shows the error, flushes diagnostics, then exits', async () => {
    const order: string[] = [];
    await exitAfterFatalBoot({
      showError: () => order.push('show'),
      flush: async () => {
        order.push('flush');
      },
      exit: (code) => order.push(`exit:${String(code)}`),
    });
    expect(order).toEqual(['show', 'flush', 'exit:1']);
  });

  it('still exits when diagnostics flushing rejects', async () => {
    const exit = vi.fn();
    await expect(exitAfterFatalBoot({
      showError: () => undefined,
      flush: () => Promise.reject(new Error('disk failed')),
      exit,
    })).rejects.toThrow(/disk failed/i);
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe('createBeforeQuitBarrier', () => {
  it('blocks repeated quit attempts until one drain completes, then allows the reissued quit', async () => {
    let releaseDrain: (() => void) | undefined;
    const drain = vi.fn(() => new Promise<void>((resolve) => {
      releaseDrain = resolve;
    }));
    const quit = vi.fn();
    const barrier = createBeforeQuitBarrier({ drain, quit });
    const first = { preventDefault: vi.fn() };
    const repeated = { preventDefault: vi.fn() };

    barrier(first);
    barrier(repeated);
    expect(first.preventDefault).toHaveBeenCalledOnce();
    expect(repeated.preventDefault).toHaveBeenCalledOnce();
    expect(drain).toHaveBeenCalledOnce();
    expect(quit).not.toHaveBeenCalled();

    releaseDrain?.();
    await vi.waitFor(() => expect(quit).toHaveBeenCalledOnce());

    const reissued = { preventDefault: vi.fn() };
    barrier(reissued);
    expect(reissued.preventDefault).not.toHaveBeenCalled();
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

  it('re-arms a durable retry obligation after each bounded series exhausts', async () => {
    vi.useFakeTimers();
    const error = new Error('hub still offline');
    const task = vi.fn(() => Promise.reject(error));
    const onExhausted = vi.fn();
    const retry = createBoundedRetry({
      task,
      delaysMs: [10, 20],
      repeatAfterExhaustionMs: 100,
      onExhausted,
    });

    retry.start();
    await vi.advanceTimersByTimeAsync(30);
    expect(task).toHaveBeenCalledTimes(2);
    expect(onExhausted).toHaveBeenCalledTimes(1);
    expect(retry.pending()).toBe(true);

    // The repetition pause starts a fresh bounded series; its normal first
    // delay still applies, so no tight loop is possible after exhaustion.
    await vi.advanceTimersByTimeAsync(109);
    expect(task).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(3);

    retry.cancel();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(task).toHaveBeenCalledTimes(3);
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

  it('seals future producers while a final drain waits behind accepted work', async () => {
    const queue = createRuntimeMutationQueue();
    const order: string[] = [];
    let releaseActivation: (() => void) | undefined;
    const activation = queue.run(
      () => new Promise<void>((resolve) => {
        order.push('activation');
        releaseActivation = resolve;
      }),
    );
    const drain = queue.sealAndRun(async () => {
      order.push('drain');
    });

    await expect(queue.run(async () => order.push('late-rebuild')))
      .rejects.toThrow(/sealed for shutdown/i);
    expect(order).toEqual(['activation']);

    releaseActivation?.();
    await Promise.all([activation, drain]);
    expect(order).toEqual(['activation', 'drain']);
  });

  it('prevents a late settings rebuild from starting behind a terminal purge drain', async () => {
    const queue = createRuntimeMutationQueue();
    let releaseProbe: (() => void) | undefined;
    const order: string[] = [];
    const probe = queue.run(
      () => new Promise<void>((resolve) => {
        order.push('probe');
        releaseProbe = resolve;
      }),
    );
    const purgeDrain = sealRuntimeForTerminalOperation(queue, async () => {
      order.push('deactivate-before-delete');
    });

    await expect(queue.run(async () => order.push('late-runtime-rebuild')))
      .rejects.toThrow(/sealed for shutdown/i);
    releaseProbe?.();
    await Promise.all([probe, purgeDrain]);

    expect(order).toEqual(['probe', 'deactivate-before-delete']);
  });

  it('makes a racing quit await the in-progress purge terminal operation', async () => {
    const queue = createRuntimeMutationQueue();
    let finishDelete: (() => void) | undefined;
    const order: string[] = [];
    const purge = sealRuntimeForTerminalOperation(
      queue,
      async () => {
        order.push('purge:deactivate');
        await new Promise<void>((resolve) => {
          order.push('purge:delete');
          finishDelete = () => {
            order.push('purge:relaunch');
            resolve();
          };
        });
      },
    );
    const quit = sealRuntimeForTerminalOperation(queue, async () => {
      order.push('quit:second-drain');
    });

    await Promise.resolve();
    expect(order).toEqual(['purge:deactivate', 'purge:delete']);
    finishDelete?.();
    await Promise.all([purge, quit]);
    expect(order).toEqual(['purge:deactivate', 'purge:delete', 'purge:relaunch']);
  });
});

describe('createSerializedCredentialLifecycle', () => {
  it('finishes sign-out deletion before a concurrently requested sign-in can issue or store', async () => {
    const queue = createRuntimeMutationQueue();
    const order: string[] = [];
    let storedCredential: string | null = 'device-a';
    let releaseRevoke: (() => void) | undefined;
    let revokeStarted: (() => void) | undefined;
    const revokeStartedPromise = new Promise<void>((resolve) => {
      revokeStarted = resolve;
    });

    const lifecycle = createSerializedCredentialLifecycle<string, string>({
      queue,
      readStoredCredential: async () => storedCredential,
      issueAndStore: async (nextCredential) => {
        order.push(`issue:${nextCredential}`);
        storedCredential = nextCredential;
        return nextCredential;
      },
      activateStoredCredential: async () => {
        order.push('activate:stored');
      },
      signOutTransition: async () => {
        const credential = storedCredential;
        await replaceRuntimeSecurityFirst({
          deactivate: async () => {
            order.push('deactivate');
          },
          revokeCredential: () => new Promise<void>((resolve) => {
            order.push(`revoke:${credential ?? 'none'}`);
            releaseRevoke = resolve;
            revokeStarted?.();
          }),
          deleteCredential: async () => {
            order.push(`delete:${storedCredential ?? 'none'}`);
            storedCredential = null;
          },
          activateFallback: async () => {
            order.push('activate:fallback');
          },
        });
      },
    });

    const signOut = lifecycle.signOut();
    await revokeStartedPromise;
    const signIn = lifecycle.issue('device-b');
    await Promise.resolve();
    expect(order).toEqual(['deactivate', 'revoke:device-a']);

    releaseRevoke?.();
    await signOut;
    await expect(signIn).resolves.toBe('device-b');
    expect(storedCredential).toBe('device-b');
    expect(order).toEqual([
      'deactivate',
      'revoke:device-a',
      'delete:device-a',
      'activate:fallback',
      'issue:device-b',
      'activate:stored',
    ]);
  });

  it('allows at most one mint across concurrent and repeated sign-ins', async () => {
    const queue = createRuntimeMutationQueue();
    let storedCredential: string | null = null;
    let mintCount = 0;
    let releaseFirstMint: (() => void) | undefined;
    let firstMintStarted: (() => void) | undefined;
    const firstMintStartedPromise = new Promise<void>((resolve) => {
      firstMintStarted = resolve;
    });
    const lifecycle = createSerializedCredentialLifecycle<string, string>({
      queue,
      readStoredCredential: async () => storedCredential,
      issueAndStore: (credential) => new Promise<string>((resolve) => {
        mintCount += 1;
        firstMintStarted?.();
        releaseFirstMint = () => {
          storedCredential = credential;
          resolve(credential);
        };
      }),
      activateStoredCredential: async () => undefined,
      signOutTransition: async () => undefined,
    });

    const first = lifecycle.issue('device-a');
    await firstMintStartedPromise;
    const concurrent = lifecycle.issue('device-b');
    await Promise.resolve();
    expect(mintCount).toBe(1);

    releaseFirstMint?.();
    await expect(first).resolves.toBe('device-a');
    await expect(concurrent).rejects.toThrow(/sign out before signing in again/i);
    await expect(lifecycle.issue('device-c')).rejects.toThrow(/sign out before signing in again/i);
    expect(storedCredential).toBe('device-a');
    expect(mintCount).toBe(1);
  });
});

describe('runFailClosedTerminalPurge', () => {
  it('stops producers before reconciling custody that was already dirty at purge entry', async () => {
    const order: string[] = [];
    let producersStopped = false;

    await drainRuntimeThenFinishCustody({
      deactivateRuntime: async () => {
        order.push('deactivate');
        producersStopped = true;
      },
      finishCustody: async () => {
        expect(producersStopped).toBe(true);
        order.push('harvest-delta');
      },
    });

    expect(order).toEqual(['deactivate', 'harvest-delta']);
  });

  it('finishes the final harvest before revoking the only device bearer', async () => {
    const order: string[] = [];
    await finishPurgeCustody({
      settlePendingCredential: async () => { order.push('settle-pending'); },
      finishHarvest: async () => { order.push('harvest-with-live-bearer'); },
      settleActiveDeviceCredential: async () => { order.push('revoke-device'); },
    });
    expect(order).toEqual([
      'settle-pending',
      'harvest-with-live-bearer',
      'revoke-device',
    ]);
  });

  it('keeps the database and relaunches when final custody upload fails', async () => {
    const order: string[] = [];
    const failure = new Error('final harvest delta failed');

    await expect(
      runFailClosedTerminalPurge({
        finishCustody: async () => {
          order.push('custody');
          throw failure;
        },
        closeDatabase: () => order.push('close-db'),
        clearMedia: async () => {
          order.push('clear-media');
        },
        deleteLocalData: async () => {
          order.push('delete-data');
        },
        onFailure: (error) => order.push(`surface:${(error as Error).message}`),
        relaunch: () => order.push('relaunch'),
        exit: (code) => order.push(`exit:${code}`),
      }),
    ).rejects.toBe(failure);

    expect(order).toEqual([
      'custody',
      'surface:final harvest delta failed',
      'relaunch',
      'exit:1',
    ]);
  });

  it('refuses destructive purge while exact device-token settlement is deferred', async () => {
    const recover = vi.fn(async () => true);

    await expect(requireSettledDeviceCredentialCustody({ recover }))
      .rejects.toThrow(/cannot be purged.*device-token.*pending/i);
    expect(recover).toHaveBeenCalledTimes(1);

    await expect(requireSettledDeviceCredentialCustody({
      recover: async () => false,
    })).resolves.toBeUndefined();
  });

  it('revokes a bound active device token before its DB origin binding can be purged', async () => {
    const order: string[] = [];
    const recover = vi.fn(async () => {
      order.push('recover');
      return false;
    });
    const revoke = vi.fn(async () => {
      order.push('revoke');
    });

    await settleDeviceCredentialBeforePurge({
      recover,
      read: async () => ({
        hasDeviceTokenCustody: true,
        bindingState: 'bound',
        hubBaseUrl: 'https://hub.test',
        deviceToken: 'agency_hub_device_exact',
      }),
      revoke,
    });

    expect(order).toEqual(['recover', 'revoke', 'recover']);
    expect(revoke).toHaveBeenCalledWith({
      hubBaseUrl: 'https://hub.test',
      deviceToken: 'agency_hub_device_exact',
    });
  });

  it('preserves the DB when device-token custody has no provable origin', async () => {
    const revoke = vi.fn();
    await expect(settleDeviceCredentialBeforePurge({
      recover: async () => false,
      read: async () => ({
        hasDeviceTokenCustody: true,
        bindingState: 'unbound',
        hubBaseUrl: 'https://gosling-agency.ru',
        deviceToken: null,
      }),
      revoke,
    })).rejects.toThrow(/cannot be purged.*no provable Hub origin/i);
    expect(revoke).not.toHaveBeenCalled();
  });

  it('does not contact the Hub when no device-token custody survives', async () => {
    const revoke = vi.fn();
    await expect(settleDeviceCredentialBeforePurge({
      recover: async () => false,
      read: async () => ({
        hasDeviceTokenCustody: false,
        bindingState: 'none',
        hubBaseUrl: 'https://gosling-agency.ru',
        deviceToken: null,
      }),
      revoke,
    })).resolves.toBeUndefined();
    expect(revoke).not.toHaveBeenCalled();
  });

  it('deletes only after custody completes and then relaunches cleanly', async () => {
    const order: string[] = [];
    await runFailClosedTerminalPurge({
      finishCustody: async () => {
        order.push('custody');
      },
      closeDatabase: () => order.push('close-db'),
      clearMedia: async () => {
        order.push('clear-media');
      },
      deleteLocalData: async () => {
        order.push('delete-data');
      },
      onFailure: () => order.push('surface'),
      relaunch: () => order.push('relaunch'),
      exit: (code) => order.push(`exit:${code}`),
    });

    expect(order).toEqual([
      'custody',
      'close-db',
      'clear-media',
      'delete-data',
      'relaunch',
      'exit:0',
    ]);
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
      sync: {
        stop: () => {
          order.push('sync');
        },
      },
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
    expect(order).toEqual(['settings', 'credits', 'spenders', 'sync', 'send:quiesce']);
    releaseQuiesce?.();
    await stopped;
    expect(order).toEqual([
      'settings',
      'credits',
      'spenders',
      'sync',
      'send:quiesce',
      'send:dispose',
      'coordinator',
      'events',
      'hub',
    ]);
  });

  it('does not dispose DB-owning services until async sync shutdown is quiescent', async () => {
    const order: string[] = [];
    let releaseSync: (() => void) | undefined;
    const stopped = stopRuntimeServices({
      sync: {
        stop: () => new Promise<void>((resolve) => {
          order.push('sync:drain');
          releaseSync = resolve;
        }),
      },
      coordinator: { dispose: () => order.push('coordinator') },
      hub: { dispose: () => order.push('hub') },
    });

    await Promise.resolve();
    expect(order).toEqual(['sync:drain']);
    releaseSync?.();
    await stopped;
    expect(order).toEqual(['sync:drain', 'coordinator', 'hub']);
  });

  it('awaits Hub reporter quiescence before releasing DB-owning services', async () => {
    const order: string[] = [];
    let releaseHub: (() => void) | undefined;
    const stopped = stopRuntimeServices({
      coordinator: { dispose: () => order.push('coordinator') },
      disposeEventForwarding: () => order.push('events'),
      hub: {
        quiesce: () => new Promise<void>((resolve) => {
          order.push('hub:quiesce');
          releaseHub = resolve;
        }),
        dispose: () => order.push('hub:dispose'),
      },
    });

    await Promise.resolve();
    expect(order).toEqual(['coordinator', 'events', 'hub:quiesce']);
    releaseHub?.();
    await stopped;
    expect(order).toEqual(['coordinator', 'events', 'hub:quiesce', 'hub:dispose']);
  });

  it('keeps forwarding alive for the coordinator discarded frame during disposal', async () => {
    let forwarding = true;
    const seen: string[] = [];
    await stopRuntimeServices({
      coordinator: {
        dispose: () => {
          if (forwarding) seen.push('operation:discarded');
        },
      },
      disposeEventForwarding: () => {
        forwarding = false;
      },
    });
    expect(seen).toEqual(['operation:discarded']);
    expect(forwarding).toBe(false);
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

  it('revokes the remote credential before deleting its local copy and activating fallback', async () => {
    const order: string[] = [];
    await replaceRuntimeSecurityFirst({
      deactivate: async () => {
        order.push('deactivate');
      },
      revokeCredential: async () => {
        order.push('revoke');
      },
      deleteCredential: async () => {
        order.push('delete');
      },
      activateFallback: async () => {
        order.push('fallback');
      },
    });
    expect(order).toEqual(['deactivate', 'revoke', 'delete', 'fallback']);
  });

  it('keeps the local credential and fallback untouched when remote revocation fails', async () => {
    const order: string[] = [];
    await expect(
      replaceRuntimeSecurityFirst({
        deactivate: async () => {
          order.push('deactivate');
        },
        revokeCredential: async () => {
          order.push('revoke');
          throw new Error('revoke unavailable');
        },
        deleteCredential: async () => {
          order.push('delete');
        },
        activateFallback: async () => {
          order.push('fallback');
        },
      }),
    ).rejects.toThrow(/revoke unavailable/);
    expect(order).toEqual(['deactivate', 'revoke', 'deactivate']);
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

  it('does not schedule an automatic retry for a permanently rejected credential', async () => {
    const cause = new Error('HTTP 401');
    const scheduleRetry = vi.fn();

    await expect(activateStoredCredentialWithRetry({
      activate: () => Promise.reject(cause),
      scheduleRetry,
      shouldRetry: () => false,
    })).rejects.toThrow(/credential was rejected/i);

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
      getSecret: async () => null,
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
