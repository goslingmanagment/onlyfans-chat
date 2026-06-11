// Vault panel UI slice (PRD F7): open/closed state, album + search filters,
// the ordered multi-select with its preview subset, the price input, and the
// upload flow state. Per-conversation: switching chats resets everything (the
// selection is part of an in-progress compose for THAT fan).

import { create } from 'zustand';
import type { VaultPickedFileVM } from '../../../../preload/contract';
import { EMPTY_SELECTION, toggleSelect, togglePreview, type VaultSelection } from './vaultLogic';

export type VaultUploadPhase =
  | { phase: 'idle' }
  /** Preflight chip shown (size + credit estimate); awaiting explicit confirm. */
  | { phase: 'picked'; file: VaultPickedFileVM }
  | { phase: 'uploading'; file: VaultPickedFileVM }
  | { phase: 'error'; message: string };

interface VaultState {
  open: boolean;
  albumId: string | null;
  search: string;
  selection: VaultSelection;
  priceInput: string;
  upload: VaultUploadPhase;

  setOpen: (open: boolean) => void;
  setAlbum: (albumId: string | null) => void;
  setSearch: (search: string) => void;
  toggleItem: (id: string) => void;
  togglePreviewItem: (id: string) => void;
  setPriceInput: (priceInput: string) => void;
  setUpload: (upload: VaultUploadPhase) => void;
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
  upload: { phase: 'idle' } as VaultUploadPhase,
};

export const useVaultStore = create<VaultState>((set) => ({
  ...INITIAL,

  setOpen: (open) => set({ open }),
  setAlbum: (albumId) => set({ albumId }),
  setSearch: (search) => set({ search }),
  toggleItem: (id) => set((s) => ({ selection: toggleSelect(s.selection, id) })),
  togglePreviewItem: (id) => set((s) => ({ selection: togglePreview(s.selection, id) })),
  setPriceInput: (priceInput) => set({ priceInput }),
  setUpload: (upload) => set({ upload }),
  clearSelection: () => set({ selection: EMPTY_SELECTION, priceInput: '' }),
  reset: () => set({ ...INITIAL }),
}));

/** Called on conversation change (ConversationPane effect). */
export function resetVaultForConversation(): void {
  useVaultStore.getState().reset();
}
