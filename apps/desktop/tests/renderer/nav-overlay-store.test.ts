// The held-modifier flag behind the ⌘1..9 number overlay (NavNumberOverlay).
// The window-event wiring that flips this lives in KeymapProvider (driven off
// live e.metaKey/ctrlKey, cleared on keyup/blur/visibilitychange) and is
// exercised manually / via Playwright; here we pin the pure store contract,
// including the no-op-on-unchanged guard that keeps the overlay from causing a
// re-render storm on every keystroke.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNavOverlayStore } from '../../src/renderer/src/state/navOverlayStore';

describe('navOverlayStore', () => {
  beforeEach(() => {
    useNavOverlayStore.setState({ modHeld: false });
  });

  it('starts cleared and toggles modHeld', () => {
    expect(useNavOverlayStore.getState().modHeld).toBe(false);
    useNavOverlayStore.getState().setModHeld(true);
    expect(useNavOverlayStore.getState().modHeld).toBe(true);
    useNavOverlayStore.getState().setModHeld(false);
    expect(useNavOverlayStore.getState().modHeld).toBe(false);
  });

  it('does not notify subscribers when the value is unchanged (no re-render storm)', () => {
    const spy = vi.fn();
    const unsub = useNavOverlayStore.subscribe(spy);

    useNavOverlayStore.getState().setModHeld(false); // already false → no-op
    expect(spy).not.toHaveBeenCalled();

    useNavOverlayStore.getState().setModHeld(true); // flips → notify once
    expect(spy).toHaveBeenCalledTimes(1);

    useNavOverlayStore.getState().setModHeld(true); // still true → no-op
    expect(spy).toHaveBeenCalledTimes(1);

    unsub();
  });
});
