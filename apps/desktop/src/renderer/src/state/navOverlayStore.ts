// Held-modifier flag for the chat-list number overlay (NavNumberOverlay, the
// ⌘1..9 jump affordance). Its OWN tiny store so only the overlay layer
// subscribes — holding/releasing the mod key never re-renders ChatRow or any
// other surface (DESIGN §3.6: per-field selectors, no re-render storms).
//
// The listeners that drive `modHeld` live in KeymapProvider's single
// window-level effect (DESIGN §2: one registry, no scattered listeners) and
// feed createNavOverlayController below: the badges appear only when the bare
// nav modifier (⌘ on macOS, Ctrl elsewhere) is held ALONE for a short delay,
// so the frequent ⌘E / ⌘I / ⌘G hotkeys never flash them. Blur /
// visibilitychange reset it so the OS eating a keyup (⌘Tab) never sticks.

import { create } from 'zustand';

interface NavOverlayState {
  /** ⌘ or Ctrl is currently held with the window focused → badges are shown. */
  modHeld: boolean;
  setModHeld: (held: boolean) => void;
}

export const useNavOverlayStore = create<NavOverlayState>((set) => ({
  modHeld: false,
  // No-op when unchanged: returning the SAME state object makes zustand skip
  // notifying subscribers, so the per-keystroke recompute in KeymapProvider is
  // free unless the held state actually flips.
  setModHeld: (held) => set((s) => (s.modHeld === held ? s : { modHeld: held })),
}));

/** How long the bare nav modifier must be held before the badges show. */
export const NAV_OVERLAY_DELAY_MS = 350;

export interface NavOverlayKey {
  key: string;
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export interface NavOverlayController {
  keydown(e: NavOverlayKey): void;
  keyup(e: NavOverlayKey): void;
  /** Window blur / hidden document. */
  reset(): void;
}

/**
 * Drives `modHeld` from raw key events. Pressing the nav modifier alone arms a
 * cancellable timer; any other key (a letter, Shift, Alt, ⌃…) cancels it and
 * hides the badges, except a digit 1–9 while the badges are already up (the
 * ⌘1..9 jump they advertise). Releasing the modifier hides them.
 */
export function createNavOverlayController(options: {
  platform: 'mac' | 'win';
  delayMs?: number;
  setHeld?: (held: boolean) => void;
}): NavOverlayController {
  const delayMs = options.delayMs ?? NAV_OVERLAY_DELAY_MS;
  const setHeld = options.setHeld ?? ((held: boolean) => useNavOverlayStore.getState().setModHeld(held));
  const mac = options.platform === 'mac';
  let timer: ReturnType<typeof setTimeout> | null = null;
  let shown = false;

  const isNavModKey = (e: NavOverlayKey): boolean =>
    mac ? e.key === 'Meta' || e.key === 'OS' : e.key === 'Control';
  const navHeld = (e: NavOverlayKey): boolean => (mac ? e.metaKey : e.ctrlKey);
  const bareNav = (e: NavOverlayKey): boolean =>
    mac
      ? e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey
      : e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;

  function hide(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (shown) {
      shown = false;
      setHeld(false);
    }
  }

  return {
    keydown(e) {
      if (isNavModKey(e) && bareNav(e)) {
        if (!shown && timer === null) {
          timer = setTimeout(() => {
            timer = null;
            shown = true;
            setHeld(true);
          }, delayMs);
        }
        return;
      }
      if (shown && bareNav(e) && /^Digit[1-9]$/.test(e.code)) return;
      hide();
    },
    keyup(e) {
      if (isNavModKey(e) || !navHeld(e)) hide();
    },
    reset() {
      hide();
    },
  };
}
