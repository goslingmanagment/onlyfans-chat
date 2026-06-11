// All bridge reads go through TanStack Query; invalidation is event-driven
// (bridge/events.ts) — no polling loops in the renderer (DESIGN §3.3/§3.6).

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseInfiniteQueryResult,
  type InfiniteData,
} from '@tanstack/react-query';
import { useMemo } from 'react';
import type {
  AccountVM,
  ChatFilter,
  ChatListItemVM,
  FanPanelVM,
  GalleryItemVM,
  MessageVM,
  OutboxItemVM,
  SettingsPatch,
  SettingsVM,
  SyncStatusVM,
  VaultAlbumVM,
  VaultItemVM,
} from '../../../preload/contract';
import type { Personality } from '@chatgoose/shared/types';
import { getBridge } from './bridge';

export const qk = {
  accounts: ['accounts'] as const,
  chats: (accountId: string, filter: ChatFilter) => ['chats', accountId, filter] as const,
  chatsSearch: (accountId: string, query: string) => ['chats-search', accountId, query] as const,
  messages: (accountId: string, chatId: string) => ['messages', accountId, chatId] as const,
  outbox: (accountId: string, chatId: string) => ['outbox', accountId, chatId] as const,
  fan: (accountId: string, fanId: string) => ['fan', accountId, fanId] as const,
  settings: ['settings'] as const,
  personalities: ['personalities'] as const,
  syncStatus: ['sync-status'] as const,
  vault: (accountId: string, albumId: string | null, query: string) =>
    ['vault', accountId, albumId ?? 'all', query] as const,
  vaultAlbums: (accountId: string) => ['vault-albums', accountId] as const,
  gallery: (accountId: string, chatId: string) => ['gallery', accountId, chatId] as const,
};

export function useAccounts() {
  return useQuery<AccountVM[]>({
    queryKey: qk.accounts,
    queryFn: () => getBridge().invoke('query:accounts.list', undefined),
  });
}

export function useChats(accountId: string | null, filter: ChatFilter) {
  return useQuery<{ items: ChatListItemVM[]; hasMore: boolean }>({
    queryKey: accountId === null ? ['chats', 'none', filter] : qk.chats(accountId, filter),
    queryFn: () =>
      getBridge().invoke('query:chats.list', {
        accountId: accountId ?? '',
        filter,
        limit: 500,
      }),
    enabled: accountId !== null,
  });
}

export function useChatSearch(accountId: string | null, query: string) {
  return useQuery<ChatListItemVM[]>({
    queryKey: accountId === null ? ['chats-search', 'none', query] : qk.chatsSearch(accountId, query),
    queryFn: () => getBridge().invoke('query:chats.search', { accountId: accountId ?? '', query }),
    enabled: accountId !== null && query.trim().length > 0,
    staleTime: 10_000,
  });
}

interface MessagesPage {
  items: MessageVM[];
  hasMore: boolean;
}

export type MessagesQuery = UseInfiniteQueryResult<InfiniteData<MessagesPage>>;

export function useMessages(accountId: string | null, chatId: string | null): MessagesQuery {
  return useInfiniteQuery<MessagesPage, Error, InfiniteData<MessagesPage>, readonly string[], string | null>({
    queryKey:
      accountId === null || chatId === null
        ? (['messages', 'none', 'none'] as const)
        : qk.messages(accountId, chatId),
    queryFn: ({ pageParam }) =>
      getBridge().invoke('query:messages.page', {
        accountId: accountId ?? '',
        chatId: chatId ?? '',
        ...(pageParam !== null ? { beforeId: pageParam } : {}),
      }),
    initialPageParam: null,
    // pages are ascending within; oldest loaded message id pages further back
    getNextPageParam: (last) => (last.hasMore ? (last.items[0]?.id ?? null) : null),
    enabled: accountId !== null && chatId !== null,
  });
}

/** Flatten infinite pages (newest page first) into one ascending message list. */
export function useFlatMessages(query: MessagesQuery): MessageVM[] {
  const pages = query.data?.pages;
  return useMemo(() => {
    if (pages === undefined) return [];
    const out: MessageVM[] = [];
    for (let i = pages.length - 1; i >= 0; i--) {
      const page = pages[i];
      if (page !== undefined) out.push(...page.items);
    }
    return out;
  }, [pages]);
}

/** Optimistic-send rows for the open chat — refetched only on db:changed scope 'outbox'. */
export function useOutbox(accountId: string | null, chatId: string | null) {
  return useQuery<OutboxItemVM[]>({
    queryKey:
      accountId === null || chatId === null
        ? ['outbox', 'none', 'none']
        : qk.outbox(accountId, chatId),
    queryFn: () =>
      getBridge().invoke('query:outbox.list', { accountId: accountId ?? '', chatId: chatId ?? '' }),
    enabled: accountId !== null && chatId !== null,
  });
}

export interface ChatSendability {
  canSendMessage: boolean;
  canNotSendReason: string | null;
}

/** Narrow per-chat slice of the chat list (AI dock insert-vs-copy degrade, SPEC §7.0). */
export function useChatSendability(accountId: string | null, chatId: string | null) {
  return useQuery<{ items: ChatListItemVM[]; hasMore: boolean }, Error, ChatSendability | null>({
    queryKey: accountId === null ? ['chats', 'none', 'all'] : qk.chats(accountId, 'all'),
    queryFn: () =>
      getBridge().invoke('query:chats.list', { accountId: accountId ?? '', filter: 'all', limit: 500 }),
    enabled: accountId !== null,
    select: (data) => {
      const chat = data.items.find((c) => c.chatId === chatId);
      return chat === undefined
        ? null
        : { canSendMessage: chat.canSendMessage, canNotSendReason: chat.canNotSendReason };
    },
  });
}

export function useFan(accountId: string | null, fanId: string | null) {
  return useQuery<FanPanelVM | null>({
    queryKey:
      accountId === null || fanId === null ? ['fan', 'none', 'none'] : qk.fan(accountId, fanId),
    queryFn: () => getBridge().invoke('query:fan.get', { accountId: accountId ?? '', fanId: fanId ?? '' }),
    enabled: accountId !== null && fanId !== null,
  });
}

export function useSettings() {
  return useQuery<SettingsVM>({
    queryKey: qk.settings,
    queryFn: () => getBridge().invoke('query:settings.get', undefined),
  });
}

export function usePersonalities() {
  return useQuery<Personality[]>({
    queryKey: qk.personalities,
    queryFn: () => getBridge().invoke('query:personalities.list', undefined),
  });
}

export function useSyncStatus() {
  return useQuery<SyncStatusVM>({
    queryKey: qk.syncStatus,
    queryFn: () => getBridge().invoke('query:sync.status', undefined),
  });
}

// ─── vault & gallery (PRD F7) ────────────────────────────────────────────

interface VaultPage {
  items: VaultItemVM[];
  hasMore: boolean;
  nextOffset: number | null;
}

export type VaultMediaQuery = UseInfiniteQueryResult<InfiniteData<VaultPage>>;

export function useVaultMedia(
  accountId: string | null,
  albumId: string | null,
  search: string,
  enabled: boolean,
): VaultMediaQuery {
  return useInfiniteQuery<VaultPage, Error, InfiniteData<VaultPage>, readonly string[], number | null>({
    queryKey:
      accountId === null
        ? (['vault', 'none', 'all', ''] as const)
        : qk.vault(accountId, albumId, search),
    queryFn: ({ pageParam }) =>
      getBridge().invoke('query:vault.list', {
        accountId: accountId ?? '',
        ...(albumId !== null ? { albumId } : {}),
        ...(search.trim() !== '' ? { query: search.trim() } : {}),
        ...(pageParam !== null ? { offset: pageParam } : {}),
      }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextOffset,
    enabled: enabled && accountId !== null,
    staleTime: 30_000, // vault contents change rarely within a shift
  });
}

export function useVaultAlbums(accountId: string | null, enabled: boolean) {
  return useQuery<VaultAlbumVM[]>({
    queryKey: accountId === null ? ['vault-albums', 'none'] : qk.vaultAlbums(accountId),
    queryFn: () => getBridge().invoke('query:vault.albums', { accountId: accountId ?? '' }),
    enabled: enabled && accountId !== null,
    staleTime: 60_000,
  });
}

interface GalleryPage {
  items: GalleryItemVM[];
  hasMore: boolean;
  nextOffset: number | null;
}

export type GalleryQuery = UseInfiniteQueryResult<InfiniteData<GalleryPage>>;

export function useChatGallery(
  accountId: string | null,
  chatId: string | null,
  enabled: boolean,
): GalleryQuery {
  return useInfiniteQuery<GalleryPage, Error, InfiniteData<GalleryPage>, readonly string[], number | null>({
    queryKey:
      accountId === null || chatId === null
        ? (['gallery', 'none', 'none'] as const)
        : qk.gallery(accountId, chatId),
    queryFn: ({ pageParam }) =>
      getBridge().invoke('query:chat.gallery', {
        accountId: accountId ?? '',
        chatId: chatId ?? '',
        ...(pageParam !== null ? { offset: pageParam } : {}),
      }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextOffset,
    enabled: enabled && accountId !== null && chatId !== null,
    staleTime: 15_000,
  });
}

// ─── mutations ───────────────────────────────────────────────────────────

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsPatch) => getBridge().invoke('cmd:settings.update', patch),
    onSuccess: (settings) => {
      queryClient.setQueryData(qk.settings, settings);
    },
  });
}

export function useSavePersonality() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (personality: Personality) =>
      getBridge().invoke('cmd:personalities.save', personality),
    onSuccess: (list) => {
      queryClient.setQueryData(qk.personalities, list);
    },
  });
}

export function useDeletePersonality() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getBridge().invoke('cmd:personalities.delete', { id }),
    onSuccess: (list) => {
      queryClient.setQueryData(qk.personalities, list);
    },
  });
}

export function useSetMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { accountId: string; personalityId: string | null }) =>
      getBridge().invoke('cmd:mappings.set', args),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.accounts });
      void queryClient.invalidateQueries({ queryKey: qk.settings });
    },
  });
}

export function usePurgeData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => getBridge().invoke('cmd:data.purge', undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}

export function useForceRefresh() {
  return useMutation({
    mutationFn: (accountId?: string) =>
      getBridge().invoke('cmd:sync.forceRefresh', accountId === undefined ? {} : { accountId }),
  });
}
