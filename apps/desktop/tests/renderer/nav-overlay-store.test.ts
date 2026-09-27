// The held-modifier flag behind the ⌘1..9 number overlay (NavNumberOverlay)
// and the controller KeymapProvider feeds with raw key events: the badges show
// only after the bare nav modifier is held ALONE for NAV_OVERLAY_DELAY_MS, so
// the frequent ⌘E / ⌘I / ⌘G hotkeys never flash them. Also pins the
// no-op-on-unchanged guard that keeps the overlay from re-render storms.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NAV_OVERLAY_DELAY_MS,
  createNavOverlayController,
  useNavOverlayStore,
  type NavOverlayKey,
} from '../../src/renderer/src/state/navOverlayStore';

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

function key(k: string, code: string, mods: Partial<NavOverlayKey> = {}): NavOverlayKey {
  return { key: k, code, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods };
}
const META_DOWN = key('Meta', 'MetaLeft', { metaKey: true });
const META_UP = key('Meta', 'MetaLeft');
const CTRL_DOWN = key('Control', 'ControlLeft', { ctrlKey: true });

describe('createNavOverlayController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useNavOverlayStore.setState({ modHeld: false });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the badges only after the bare modifier is held for the delay', () => {
    const nav = createNavOverlayController({ platform: 'mac' });
    nav.keydown(META_DOWN);
    vi.advanceTimersByTime(NAV_OVERLAY_DELAY_MS - 1);
    expect(useNavOverlayStore.getState().modHeld).toBe(false);
    vi.advanceTimersByTime(1);
    expect(useNavOverlayStore.getState().modHeld).toBe(true);
    nav.keyup(META_UP);
    expect(useNavOverlayStore.getState().modHeld).toBe(false);
  });

  it('a quick ⌘E never flashes them', () => {
    const nav = createNavOverlayController({ platform: 'mac' });
    nav.keydown(META_DOWN);
    nav.keydown(key('e', 'KeyE', { metaKey: true }));
    vi.advanceTimersByTime(NAV_OVERLAY_DELAY_MS * 3);
    expect(useNavOverlayStore.getState().modHeld).toBe(false);
  });

  it('Shift or Alt under the modifier (panel combos) cancels them', () => {
    const mac = createNavOverlayController({ platform: 'mac' });
    mac.keydown(META_DOWN);
    mac.keydown(key('Shift', 'ShiftLeft', { metaKey: true, shiftKey: true }));
    vi.advanceTimersByTime(NAV_OVERLAY_DELAY_MS * 2);
    expect(useNavOverlayStore.getState().modHeld).toBe(false);

    const win = createNavOverlayController({ platform: 'win' });
    win.keydown(CTRL_DOWN);
    win.keydown(key('Alt', 'AltLeft', { ctrlKey: true, altKey: true }));
    vi.advanceTimersByTime(NAV_OVERLAY_DELAY_MS * 2);
    expect(useNavOverlayStore.getState().modHeld).toBe(false);
  });

  it('keeps them up for the ⌘1..9 jump they advertise, hides on any other key', () => {
    const nav = createNavOverlayController({ platform: 'mac' });
    nav.keydown(META_DOWN);
    vi.advanceTimersByTime(NAV_OVERLAY_DELAY_MS);
    nav.keydown(key('3', 'Digit3', { metaKey: true }));
    expect(useNavOverlayStore.getState().modHeld).toBe(true);
    nav.keydown(key('e', 'KeyE', { metaKey: true }));
    expect(useNavOverlayStore.getState().modHeld).toBe(false);
  });

  it('uses Ctrl on Windows and ignores Meta there', () => {
    const nav = createNavOverlayController({ platform: 'win' });
    nav.keydown(META_DOWN);
    vi.advanceTimersByTime(NAV_OVERLAY_DELAY_MS);
    expect(useNavOverlayStore.getState().modHeld).toBe(false);
    nav.keydown(CTRL_DOWN);
    vi.advanceTimersByTime(NAV_OVERLAY_DELAY_MS);
    expect(useNavOverlayStore.getState().modHeld).toBe(true);
  });

  it('reset (blur / hidden window) cancels and hides', () => {
    const nav = createNavOverlayController({ platform: 'mac' });
    nav.keydown(META_DOWN);
    vi.advanceTimersByTime(NAV_OVERLAY_DELAY_MS);
    nav.reset();
    expect(useNavOverlayStore.getState().modHeld).toBe(false);
    nav.keydown(META_DOWN);
    nav.reset();
    vi.advanceTimersByTime(NAV_OVERLAY_DELAY_MS);
    expect(useNavOverlayStore.getState().modHeld).toBe(false);
  });
});
