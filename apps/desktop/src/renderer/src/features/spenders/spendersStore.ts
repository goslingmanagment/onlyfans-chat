// Spenders board state (PLAN item 12). Per-field selectors only (DESIGN
// §3.6). The surface publishes its flat visible-row list here so the global
// keymap can drive J/K/SPACE/O without re-deriving the board's view model.

import { create } from 'zustand';
import type { SpenderRowVM } from '../../../../preload/contract';

export type SpendersChip = 'all' | string;

interface SpendersState {
  /** «Все» = tier-section view; a list id = flat single-tier view. */
  chip: SpendersChip;
  /** Shelves expanded past their «Все»-view preview (incl. collapsed tiers). */
  expanded: Record<string, true>;
  untieredOpen: boolean;
  /** Keyboard cursor (J/K); also the click-highlighted row. */
  cursorFanId: string | null;
  /** Quick-look overlay target; J/K retargets it without closing. */
  previewFanId: string | null;
  /** Flat ordered fan rows currently visible (published by the surface). */
  visibleRows: SpenderRowVM[];
  /** Stats panel: false = compact 300px column (default — the board owns the
   *  screen), true = full grid with the roster squeezed left (owner v2). */
  statsExpanded: boolean;
  /** Rows referenced by the stats queues (ждут ответа / новые) — a preview
   *  opened from there must resolve its VM even when the board hasn't loaded
   *  that fan's shelf (published by the stats panel). */
  statsRows: SpenderRowVM[];
  /** Live scoped-refresh progress (PLAN item 13), fed by spendersRefresh
   *  frames on sync:event; null when no queue is running. */
  refresh: {
    accountId: string;
    scope: string;
    state: 'running' | 'paused';
    done: number;
    total: number;
  } | null;

  setChip: (chip: SpendersChip) => void;
  expandList: (listId: string) => void;
  setUntieredOpen: (open: boolean) => void;
  setCursor: (fanId: string | null) => void;
  moveCursor: (delta: 1 | -1) => void;
  openPreview: (fanId: string) => void;
  closePreview: () => void;
  setVisibleRows: (rows: SpenderRowVM[]) => void;
  setStatsRows: (rows: SpenderRowVM[]) => void;
  setRefresh: (refresh: SpendersState['refresh']) => void;
  toggleStatsExpanded: () => void;
  /** Leaving the board resets transient state (cursor/preview), keeps the chip. */
  resetTransient: () => void;
}

export const useSpendersStore = create<SpendersState>((set) => ({
  chip: 'all',
  expanded: {},
  untieredOpen: false,
  cursorFanId: null,
  previewFanId: null,
  visibleRows: [],
  statsExpanded: false,
  statsRows: [],
  refresh: null,

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
  setStatsRows: (rows) => set({ statsRows: rows }),
  setRefresh: (refresh) => set({ refresh }),
  toggleStatsExpanded: () => set((s) => ({ statsExpanded: !s.statsExpanded })),
  resetTransient: () => set({ cursorFanId: null, previewFanId: null }),
}));

/** Row VM of the open preview — board rows first, then the stats queues
 *  (a preview opened from «ждут ответа» may target a shelf not loaded yet). */
export function previewRow(state: SpendersState): SpenderRowVM | null {
  if (state.previewFanId === null) return null;
  return (
    state.visibleRows.find((row) => row.fanId === state.previewFanId) ??
    state.statsRows.find((row) => row.fanId === state.previewFanId) ??
    null
  );
}
