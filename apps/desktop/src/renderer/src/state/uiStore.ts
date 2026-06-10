// UI slice: selection, collapses, overlays, transient signals. Subscribe with
// per-field selectors only (DESIGN §3.6 — no whole-store subscriptions).

import { create } from 'zustand';
import type { ChatFilter } from '../../../preload/contract';

export interface ToastItem {
  id: number;
  title: string;
  body: string;
  accountId?: string;
  chatId?: string;
}

export type AppView = 'workspace' | 'settings';

interface UiState {
  view: AppView;
  selectedAccountId: string | null;
  selectedChatId: string | null;
  chatFilter: ChatFilter;
  listCollapsed: boolean;
  panelCollapsed: boolean;
  paletteOpen: boolean;
  cheatsheetOpen: boolean;
  fanPanelTab: 'info' | 'scan';
  /** chat currently showing a typing indicator (expires client-side). */
  typing: { accountId: string; chatId: string; expiresAt: number } | null;
  lastLlmCostUsd: number | null;
  toasts: ToastItem[];

  setView: (view: AppView) => void;
  selectAccount: (accountId: string) => void;
  selectChat: (accountId: string, chatId: string) => void;
  setChatFilter: (filter: ChatFilter) => void;
  toggleList: () => void;
  togglePanel: () => void;
  setPaletteOpen: (open: boolean) => void;
  setCheatsheetOpen: (open: boolean) => void;
  setFanPanelTab: (tab: 'info' | 'scan') => void;
  setTyping: (typing: UiState['typing']) => void;
  setLastLlmCost: (usd: number) => void;
  pushToast: (toast: Omit<ToastItem, 'id'>) => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 0;

export const useUiStore = create<UiState>((set) => ({
  view: 'workspace',
  selectedAccountId: null,
  selectedChatId: null,
  chatFilter: 'all',
  listCollapsed: false,
  panelCollapsed: false,
  paletteOpen: false,
  cheatsheetOpen: false,
  fanPanelTab: 'info',
  typing: null,
  lastLlmCostUsd: null,
  toasts: [],

  setView: (view) => set({ view }),
  selectAccount: (accountId) =>
    set((s) =>
      s.selectedAccountId === accountId
        ? s
        : { selectedAccountId: accountId, selectedChatId: null, view: 'workspace' },
    ),
  selectChat: (accountId, chatId) =>
    set({ selectedAccountId: accountId, selectedChatId: chatId, view: 'workspace', fanPanelTab: 'info' }),
  setChatFilter: (filter) => set({ chatFilter: filter }),
  toggleList: () => set((s) => ({ listCollapsed: !s.listCollapsed })),
  togglePanel: () => set((s) => ({ panelCollapsed: !s.panelCollapsed })),
  setPaletteOpen: (open) => set({ paletteOpen: open, cheatsheetOpen: false }),
  setCheatsheetOpen: (open) => set({ cheatsheetOpen: open, paletteOpen: false }),
  setFanPanelTab: (tab) => set({ fanPanelTab: tab }),
  setTyping: (typing) => set({ typing }),
  setLastLlmCost: (usd) => set({ lastLlmCostUsd: usd }),
  pushToast: (toast) =>
    set((s) => {
      toastSeq += 1;
      return { toasts: [...s.toasts.slice(-3), { ...toast, id: toastSeq }] };
    }),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
