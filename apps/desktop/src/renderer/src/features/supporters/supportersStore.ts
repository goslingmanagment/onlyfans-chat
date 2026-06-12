// Supporters board state (PLAN item 12). Per-field selectors only (DESIGN
// §3.6). The surface publishes its flat visible-row list here so the global
// keymap can drive J/K/SPACE/O without re-deriving the board's view model.

import { create } from 'zustand';
import type { SupporterRowVM } from '../../../../preload/contract';

export type SupportersChip = 'all' | string;

interface SupportersState {
  /** «Все» = tier-section view; a list id = flat single-tier view. */
  chip: SupportersChip;
  /** Shelves expanded past their «Все»-view preview (incl. collapsed tiers). */
  expanded: Record<string, true>;
  untieredOpen: boolean;
  /** Keyboard cursor (J/K); also the click-highlighted row. */
  cursorFanId: string | null;
  /** Quick-look overlay target; J/K retargets it without closing. */
  previewFanId: string | null;
  /** Flat ordered fan rows currently visible (published by the surface). */
  visibleRows: SupporterRowVM[];

  setChip: (chip: SupportersChip) => void;
  expandList: (listId: string) => void;
  setUntieredOpen: (open: boolean) => void;
  setCursor: (fanId: string | null) => void;
  moveCursor: (delta: 1 | -1) => void;
  openPreview: (fanId: string) => void;
  closePreview: () => void;
  setVisibleRows: (rows: SupporterRowVM[]) => void;
  /** Leaving the board resets transient state (cursor/preview), keeps the chip. */
  resetTransient: () => void;
}

export const useSupportersStore = create<SupportersState>((set) => ({
  chip: 'all',
  expanded: {},
  untieredOpen: false,
  cursorFanId: null,
  previewFanId: null,
  visibleRows: [],

  setChip: (chip) => set({ chip, cursorFanId: null, previewFanId: null }),
  expandList: (listId) => set((s) => ({ expanded: { ...s.expanded, [listId]: true } })),
  setUntieredOpen: (open) => set({ untieredOpen: open }),
  setCursor: (fanId) => set({ cursorFanId: fanId }),
  moveCursor: (delta) =>
    set((s) => {
      if (s.visibleRows.length === 0) return s;
      const index = s.visibleRows.findIndex((row) => row.fanId === s.cursorFanId);
      const next =
        index === -1
          ? delta === 1
            ? 0
            : s.visibleRows.length - 1
          : Math.min(Math.max(index + delta, 0), s.visibleRows.length - 1);
      const fanId = s.visibleRows[next]?.fanId ?? null;
      // While the quick look is open, J/K walks fans WITHOUT closing it.
      return {
        cursorFanId: fanId,
        ...(s.previewFanId !== null && fanId !== null ? { previewFanId: fanId } : {}),
      };
    }),
  openPreview: (fanId) => set({ previewFanId: fanId, cursorFanId: fanId }),
  closePreview: () => set({ previewFanId: null }),
  setVisibleRows: (rows) =>
    set((s) => {
      // keep cursor valid as data refreshes; drop it if the fan left the view
      // (the preview deliberately survives refreshes — it holds its own fanId)
      const cursorOk = s.cursorFanId !== null && rows.some((r) => r.fanId === s.cursorFanId);
      return { visibleRows: rows, ...(cursorOk ? {} : { cursorFanId: null }) };
    }),
  resetTransient: () => set({ cursorFanId: null, previewFanId: null }),
}));

/** Row VM of the open preview (from the published visible rows). */
export function previewRow(state: SupportersState): SupporterRowVM | null {
  if (state.previewFanId === null) return null;
  return state.visibleRows.find((row) => row.fanId === state.previewFanId) ?? null;
}
