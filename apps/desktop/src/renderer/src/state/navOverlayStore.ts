// Held-modifier flag for the chat-list number overlay (NavNumberOverlay, the
// ⌘1..9 jump affordance). Its OWN tiny store so only the overlay layer
// subscribes — holding/releasing the mod key never re-renders ChatRow or any
// other surface (DESIGN §3.6: per-field selectors, no re-render storms).
//
// The listeners that drive `modHeld` live in KeymapProvider's single
// window-level effect (DESIGN §2: one registry, no scattered listeners): they
// read the live e.metaKey/ctrlKey on keydown/keyup and clear on blur /
// visibilitychange so the OS eating a keyup (⌘Tab, Spotlight) never sticks.

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
