// Composition-root activation seams (index.ts is not unit-testable — it pulls
// in Electron). These small pure helpers carry the ordering/failure invariants
// index.ts wires: 4b non-fatal boot activation.

import { describe, expect, it, vi } from 'vitest';
import { createSettingsStore } from '@main/settings/store';
import type { SettingsVM } from '../../src/preload/contract';
import { drain, memoryDataLayer } from '../send/helpers';
import {
  activateRuntimeNonFatal,
  subscribeSettingsScope,
  validateThenReconcileOnBoot,
} from '@main/runtime-activation';

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
