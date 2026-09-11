// Spenders board state (PLAN item 12). Per-field selectors only (DESIGN
// §3.6). The surface publishes its flat visible-row list here so the global
// keymap can drive J/K/SPACE/O without re-deriving the board's view model.

import { create } from 'zustand';
import type { SpenderRowVM, SpendersRefreshCountsVM } from '../../../../preload/contract';
import { DEFAULT_CONTACT_SORT, type ContactSide, type ContactSort } from './contactAge';
import { EMPTY_BOARD_FILTERS, type BoardFilters } from './boardFilters';

export type SpendersChip = 'all' | string;

interface SpendersState {
  /** «Все» = tier-section view; a list id = flat single-tier view. */
  chip: SpendersChip;
  filters: BoardFilters;
  /** List ids and filters belong to an account; never carry them to another. */
  accountId: string | null;
  contactSort: ContactSort;
  /** Shelves expanded past their «Все»-view preview (incl. collapsed tiers). */
  expanded: Record<string, true>;
  untieredOpen: boolean;
  /** Keyboard cursor (J/K); also the click-highlighted row. */
  cursorFanId: string | null;
  /** Quick-look overlay target; J/K retargets it without closing. */
  previewFanId: string | null;
  /** Blocks preview AI hotkeys while the selected fan has no local history and
   *  the on-open hydrate is still resolving (or failed). */
  previewAiBlocked: { fanId: string; reason: string } | null;
  /** Flat ordered fan rows currently visible (published by the surface). */
  visibleRows: SpenderRowVM[];
  /** Loaded rows before shelf clipping, for an open preview's identity. */
  loadedRows: SpenderRowVM[];
  /** Stats panel: false = compact 300px column (default — the board owns the
   *  screen), true = full grid with the roster squeezed left (owner v2). */
  statsExpanded: boolean;
  /** Rows referenced by the stats queues (ждут ответа / новые) — a preview
   *  opened from there must resolve its VM even when the board hasn't loaded
   *  that fan's shelf (published by the stats panel). */
  statsRows: SpenderRowVM[];
  /** Live scoped-refresh progress (PLAN item 13), fed by spendersRefresh
   *  frames on sync:event; null when no queue is running. */
  refresh: SpendersRefreshCountsVM & {
    accountId: string;
    scope: string;
    state: 'running' | 'paused';
    done: number;
    total: number;
  } | null;

  setChip: (chip: SpendersChip) => void;
  setFilters: (filters: Partial<BoardFilters>) => void;
  clearFilters: () => void;
  enterAccount: (accountId: string | null) => void;
  sortContact: (side: ContactSide) => void;
  expandList: (listId: string) => void;
  setUntieredOpen: (open: boolean) => void;
  setCursor: (fanId: string | null) => void;
  moveCursor: (delta: 1 | -1) => void;
  openPreview: (fanId: string) => void;
  closePreview: () => void;
  setPreviewAiBlocked: (fanId: string, reason: string) => void;
  clearPreviewAiBlocked: (fanId?: string) => void;
  setVisibleRows: (rows: SpenderRowVM[], loadedRows?: SpenderRowVM[]) => void;
  setStatsRows: (rows: SpenderRowVM[]) => void;
  setRefresh: (refresh: SpendersState['refresh']) => void;
  toggleStatsExpanded: () => void;
  /** Leaving the board resets transient state (cursor/preview), keeps the chip. */
  resetTransient: () => void;
}

export function createBoardStore() {
  return create<SpendersState>((set) => ({
    chip: 'all',
    filters: EMPTY_BOARD_FILTERS,
    accountId: null,
    contactSort: DEFAULT_CONTACT_SORT,
    expanded: {},
    untieredOpen: false,
    cursorFanId: null,
    previewFanId: null,
    previewAiBlocked: null,
    visibleRows: [],
    loadedRows: [],
    statsExpanded: false,
    statsRows: [],
    refresh: null,

    setChip: (chip) => set({ chip, cursorFanId: null, previewFanId: null, previewAiBlocked: null }),
    setFilters: (filters) => set((s) => ({ filters: { ...s.filters, ...filters } })),
    clearFilters: () => set({ filters: EMPTY_BOARD_FILTERS }),
    enterAccount: (accountId) => set((s) => s.accountId === accountId ? s : {
      accountId, chip: 'all', filters: EMPTY_BOARD_FILTERS, expanded: {}, untieredOpen: false,
      cursorFanId: null, previewFanId: null, previewAiBlocked: null,
      visibleRows: [], loadedRows: [], statsRows: [],
    }),
    sortContact: (side) => set((s) => ({
      contactSort: {
        side,
        direction: s.contactSort.side === side && s.contactSort.direction === 'desc' ? 'asc' : 'desc',
      },
    })),
    expandList: (listId) => set((s) => ({ expanded: { ...s.expanded, [listId]: true } })),
    setUntieredOpen: (open) => set({ untieredOpen: open }),
    setCursor: (fanId) => set({ cursorFanId: fanId }),
    moveCursor: (delta) =>
      set((s) => {
        if (s.visibleRows.length === 0) return s;
        const index = s.visibleRows.findIndex((row) => row.fanId === s.cursorFanId);
        // A confirmed message can move the open fan outside a shelf's preview.
        // Walk from its new position to the nearest visible fan, keeping the
        // normal edge clamp instead of jumping to the beginning of the board.
        if (index === -1 && s.cursorFanId !== null) {
          const anchor = s.loadedRows.findIndex((row) => row.fanId === s.cursorFanId);
          if (anchor !== -1) {
            const visibleIds = new Set(s.visibleRows.map((row) => row.fanId));
            for (let i = anchor + delta; i >= 0 && i < s.loadedRows.length; i += delta) {
              const fanId = s.loadedRows[i]?.fanId;
              if (fanId !== undefined && visibleIds.has(fanId)) {
                return { cursorFanId: fanId, ...(s.previewFanId !== null ? { previewFanId: fanId } : {}) };
              }
            }
            return s;
          }
        }
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
    closePreview: () => set((s) => ({
      previewFanId: null,
      previewAiBlocked: null,
      cursorFanId: s.visibleRows.some((row) => row.fanId === s.cursorFanId) ? s.cursorFanId : null,
    })),
    setPreviewAiBlocked: (fanId, reason) => set({ previewAiBlocked: { fanId, reason } }),
    clearPreviewAiBlocked: (fanId) =>
      set((s) =>
        fanId === undefined || s.previewAiBlocked?.fanId === fanId
          ? { previewAiBlocked: null }
          : s,
      ),
    setVisibleRows: (rows, loadedRows = rows) =>
      set((s) => {
        const cursorOk = s.cursorFanId !== null && (
          rows.some((row) => row.fanId === s.cursorFanId) ||
          (s.previewFanId === s.cursorFanId && loadedRows.some((row) => row.fanId === s.cursorFanId))
        );
        return { visibleRows: rows, loadedRows, ...(cursorOk ? {} : { cursorFanId: null }) };
      }),
    setStatsRows: (rows) => set({ statsRows: rows }),
    setRefresh: (refresh) => set({ refresh }),
    toggleStatsExpanded: () => set((s) => ({ statsExpanded: !s.statsExpanded })),
    resetTransient: () => set({ cursorFanId: null, previewFanId: null, previewAiBlocked: null }),
  }));
}

/** The Spenders board is one instance; the Online surface is a second
 *  (features/online/onlineStore). Same shape ⇒ shared QuickLook + keymap. */
export const useSpendersStore = createBoardStore();
export type BoardStore = typeof useSpendersStore;

/** Row VM of the open preview — board rows first, then the stats queues
 *  (a preview opened from «ждут ответа» may target a shelf not loaded yet). */
export function previewRow(state: SpendersState): SpenderRowVM | null {
  if (state.previewFanId === null) return null;
  return (
    state.loadedRows.find((row) => row.fanId === state.previewFanId) ??
    state.visibleRows.find((row) => row.fanId === state.previewFanId) ??
    state.statsRows.find((row) => row.fanId === state.previewFanId) ??
    null
  );
}
