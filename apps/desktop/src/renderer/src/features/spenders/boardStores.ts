// Board-store resolver: lets the shared board machinery (KeymapProvider's
// J/K/SPACE/O/Ping scope, the ESC/dismiss handler, previewActions) drive EITHER
// board surface — Spenders or Online (variant C) — by ui.view, without
// hard-binding to useSpendersStore. Both stores are the SAME shape
// (createBoardStore), so Online reuses the QuickLook overlay, the AI gates and
// the keymap verbatim.

import type { AppView } from '../../state/uiStore';
import { useUiStore } from '../../state/uiStore';
import { useSpendersStore, type BoardStore } from './spendersStore';
import { useOnlineStore } from '../online/onlineStore';

export type BoardView = 'spenders' | 'online';

export function isBoardView(view: AppView): view is BoardView {
  return view === 'spenders' || view === 'online';
}

export function boardStoreForView(view: AppView): BoardStore | null {
  if (view === 'spenders') return useSpendersStore;
  if (view === 'online') return useOnlineStore;
  return null;
}

/** The board store for the CURRENT view, or null when not on a board surface. */
export function activeBoardStore(): BoardStore | null {
  return boardStoreForView(useUiStore.getState().view);
}
