// Vault panel UI slice (PRD F7): open/closed state, album + search filters,
// the ordered multi-select with its preview subset, and the price input.
// Per-conversation: switching chats resets everything (the selection is part
// of an in-progress compose for THAT fan).

import { create } from 'zustand';
import { EMPTY_SELECTION, toggleSelect, togglePreview, type VaultSelection } from './vaultLogic';

interface VaultState {
  open: boolean;
  albumId: string | null;
  search: string;
  selection: VaultSelection;
  priceInput: string;

  setOpen: (open: boolean) => void;
  setAlbum: (albumId: string | null) => void;
  setSearch: (search: string) => void;
  toggleItem: (id: string) => void;
  togglePreviewItem: (id: string) => void;
  setPriceInput: (priceInput: string) => void;
  clearSelection: () => void;
  /** Conversation switch / successful send: full reset. */
  reset: () => void;
}

const INITIAL = {
  open: false,
  albumId: null,
  search: '',
  selection: EMPTY_SELECTION,
  priceInput: '',
};

export const useVaultStore = create<VaultState>((set) => ({
  ...INITIAL,

  setOpen: (open) => set({ open }),
  setAlbum: (albumId) => set({ albumId }),
  setSearch: (search) => set({ search }),
  toggleItem: (id) => set((s) => ({ selection: toggleSelect(s.selection, id) })),
  togglePreviewItem: (id) => set((s) => ({ selection: togglePreview(s.selection, id) })),
  setPriceInput: (priceInput) => set({ priceInput }),
  clearSelection: () => set({ selection: EMPTY_SELECTION, priceInput: '' }),
  reset: () => set({ ...INITIAL }),
}));

/** Called on conversation change (ConversationPane effect). */
export function resetVaultForConversation(): void {
  useVaultStore.getState().reset();
}
