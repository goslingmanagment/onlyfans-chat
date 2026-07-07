// Composition-root activation seams (index.ts is not unit-testable — it pulls
// in Electron). These small pure helpers carry the ordering/failure invariants
// index.ts wires: 4b non-fatal boot activation.

import { describe, expect, it, vi } from 'vitest';
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
  it('validates BEFORE reconciling and forwards isBoot + the account ids', async () => {
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

  it('does NOT reconcile when validation fails (a rejected rebuild leaves the outbox alone)', async () => {
    const reconcile = vi.fn(async () => undefined);
    await expect(
      validateThenReconcileOnBoot({
        syncAccounts: () => Promise.reject(new Error('CG-HUB-01 account bootstrap failed')),
        reconcile,
        isBoot: true,
      }),
    ).rejects.toThrow(/CG-HUB-01/);
    expect(reconcile).not.toHaveBeenCalled();
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
});
