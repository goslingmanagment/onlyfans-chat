// Composition-root activation seams (index.ts is not unit-testable — it pulls
// in Electron). These small pure helpers carry the ordering/failure invariants
// index.ts wires: 4b non-fatal boot activation.

import { describe, expect, it, vi } from 'vitest';
import { activateRuntimeNonFatal } from '@main/runtime-activation';

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
