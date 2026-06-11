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

/** Hub presence frame for one chat; stale entries expire client-side (TTL). */
export interface PresenceEntry {
  online: boolean;
  /** Epoch ms from the presence event; null when upstream omitted it. */
  lastSeenAt: number | null;
  /** Entry is authoritative until this epoch ms; afterwards fall back to fan.lastSeen. */
  expiresAt: number;
}

export function presenceKey(accountId: string, chatId: string): string {
  return `${accountId}:${chatId}`;
}

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
  /** Conversation center pane: thread (default) or the chat media gallery (PRD F7). */
  conversationTab: 'thread' | 'gallery';
  /** chat currently showing a typing indicator (expires client-side). */
  typing: { accountId: string; chatId: string; expiresAt: number } | null;
  /** keyed by presenceKey(accountId, chatId); TTL'd like typing. */
  presence: Record<string, PresenceEntry>;
  toasts: ToastItem[];

  setView: (view: AppView) => void;
  selectAccount: (accountId: string) => void;
  /** Boot-time default selection: never navigates (unlike selectAccount). */
  setDefaultAccount: (accountId: string) => void;
  selectChat: (accountId: string, chatId: string) => void;
  setChatFilter: (filter: ChatFilter) => void;
  toggleList: () => void;
  togglePanel: () => void;
  setPaletteOpen: (open: boolean) => void;
  setCheatsheetOpen: (open: boolean) => void;
  setFanPanelTab: (tab: 'info' | 'scan') => void;
  setConversationTab: (tab: 'thread' | 'gallery') => void;
  setTyping: (typing: UiState['typing']) => void;
  setPresence: (accountId: string, chatId: string, entry: PresenceEntry) => void;
  pushToast: (toast: Omit<ToastItem, 'id'>) => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 0;

/** Boot view: ?view=settings (main's CHATGOOSE_OPEN_VIEW dev hook). */
function initialView(): AppView {
  if (typeof window !== 'undefined' && typeof window.location !== 'undefined') {
    if (new URLSearchParams(window.location.search).get('view') === 'settings') {
      return 'settings';
    }
  }
  return 'workspace';
}

export const useUiStore = create<UiState>((set) => ({
  view: initialView(),
  selectedAccountId: null,
  selectedChatId: null,
  chatFilter: 'all',
  listCollapsed: false,
  panelCollapsed: false,
  paletteOpen: false,
  cheatsheetOpen: false,
  fanPanelTab: 'info',
  conversationTab: 'thread',
  typing: null,
  presence: {},
  toasts: [],

  setView: (view) => set({ view }),
  selectAccount: (accountId) =>
    set((s) =>
      s.selectedAccountId === accountId
        ? s
        : { selectedAccountId: accountId, selectedChatId: null, view: 'workspace' },
    ),
  setDefaultAccount: (accountId) =>
    set((s) => (s.selectedAccountId === null ? { selectedAccountId: accountId } : s)),
  selectChat: (accountId, chatId) =>
    set({
      selectedAccountId: accountId,
      selectedChatId: chatId,
      view: 'workspace',
      fanPanelTab: 'info',
      conversationTab: 'thread',
    }),
  setChatFilter: (filter) => set({ chatFilter: filter }),
  toggleList: () => set((s) => ({ listCollapsed: !s.listCollapsed })),
  togglePanel: () => set((s) => ({ panelCollapsed: !s.panelCollapsed })),
  setPaletteOpen: (open) => set({ paletteOpen: open, cheatsheetOpen: false }),
  setCheatsheetOpen: (open) => set({ cheatsheetOpen: open, paletteOpen: false }),
  setFanPanelTab: (tab) => set({ fanPanelTab: tab }),
  setConversationTab: (tab) => set({ conversationTab: tab }),
  setTyping: (typing) => set({ typing }),
  setPresence: (accountId, chatId, entry) =>
    set((s) => {
      // Sweep expired entries on write so the map never grows unbounded.
      const now = Date.now();
      const presence: Record<string, PresenceEntry> = {};
      for (const [key, existing] of Object.entries(s.presence)) {
        if (existing.expiresAt > now) presence[key] = existing;
      }
      presence[presenceKey(accountId, chatId)] = entry;
      return { presence };
    }),
  pushToast: (toast) =>
    set((s) => {
      toastSeq += 1;
      return { toasts: [...s.toasts.slice(-3), { ...toast, id: toastSeq }] };
    }),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
