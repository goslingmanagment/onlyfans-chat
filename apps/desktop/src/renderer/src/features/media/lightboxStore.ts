// D42: the one media lightbox (full-size photos on click; video/GIF preview
// frames). Opened from a thread tile, the «+N» tile (all attachments of the
// message) or a gallery cell.

import { create } from 'zustand';
import type { MediaSurfaceVM, MessageMediaVM } from '../../../../preload/contract';

export type LightboxItem = Pick<
  MessageMediaVM,
  'id' | 'type' | 'thumbUrl' | 'fullUrl' | 'isReady' | 'locked' | 'durationSeconds'
>;

interface LightboxState {
  items: LightboxItem[];
  index: number;
  /** Where the lightbox was opened from (thumb loads keep that surface). */
  origin: MediaSurfaceVM;
  open: boolean;
  /**
   * False on the frame the opening click showed; true after the first step —
   * a frame reached by navigation loads its full photo as `auto` (D42).
   */
  navigated: boolean;
  /**
   * Bumped on every open, step and close. A «Загрузить» press belongs to one
   * visit of one frame: coming back to a frame later is a new visit, and its
   * full photo is asked for as `auto` again — never as a click nobody made.
   */
  visit: number;
  /** «Загрузить» presses on this visit; each press is one explicit click. */
  presses: number;
  show: (items: LightboxItem[], index: number, origin: MediaSurfaceVM) => void;
  step: (delta: number) => void;
  /** «Загрузить» under the frame on screen. */
  press: () => void;
  close: () => void;
}

export const useLightboxStore = create<LightboxState>((set) => ({
  items: [],
  index: 0,
  origin: 'thread',
  open: false,
  navigated: false,
  visit: 0,
  presses: 0,
  show: (items, index, origin) =>
    set((state) => (items.length === 0
      ? { open: false }
      : {
          items, index: Math.min(Math.max(0, index), items.length - 1), origin, open: true,
          navigated: false, visit: state.visit + 1, presses: 0,
        })),
  step: (delta) =>
    set((state) => {
      if (state.items.length < 2) return state;
      const next = (state.index + delta + state.items.length) % state.items.length;
      return { index: next, navigated: true, visit: state.visit + 1, presses: 0 };
    }),
  press: () => set((state) => (state.open ? { presses: state.presses + 1 } : state)),
  close: () => set((state) => ({ open: false, items: [], index: 0, navigated: false, visit: state.visit + 1, presses: 0 })),
}));
