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
  ActivityVM,
  AiFeatureCostsVM,
  ChatFilter,
  ChatListItemVM,
  FanPanelVM,
  GalleryItemVM,
  KeyTestProvider,
  LocalDataStatsVM,
  MessageGuardBlocksReportVM,
  MessageVM,
  OutboxItemVM,
  PersonalitiesSnapshotVM,
  SettingsPatch,
  SettingsVM,
  SpenderListVM,
  OnlineSnapshotVM,
  SpenderRowVM,
  SpenderStatsVM,
  SpendersFreshnessVM,
  SyncStatusVM,
  UpdateStatusVM,
  VaultAlbumVM,
  VaultItemVM,
} from '../../../preload/contract';
import type { MessageGuardPolicy } from '@chatgoose/shared/message-guard/index';
import { getBridge } from './bridge';
import {
  beginAiHubOriginChange,
  endAiHubOriginChange,
} from '../features/ai/aiStore';

export const qk = {
  accounts: ['accounts'] as const,
  chats: (accountId: string, filter: ChatFilter) => ['chats', accountId, filter] as const,
  chatsPaged: (accountId: string, filter: ChatFilter) =>
    ['chats-paged', accountId, filter] as const,
  chat: (accountId: string, chatId: string) => ['chat', accountId, chatId] as const,
  chatsSearch: (accountId: string, query: string) => ['chats-search', accountId, query] as const,
  messages: (accountId: string, chatId: string) => ['messages', accountId, chatId] as const,
  outbox: (accountId: string, chatId: string) => ['outbox', accountId, chatId] as const,
  fan: (accountId: string, fanId: string) => ['fan', accountId, fanId] as const,
  settings: ['settings'] as const,
  personalities: ['personalities'] as const,
  syncStatus: ['sync-status'] as const,
  activity: ['activity'] as const,
  guardConfig: ['guard-config'] as const,
  guardBlocks: (accountId?: string) => ['guard-blocks', accountId ?? 'all'] as const,
  aiFeatureCosts: ['ai-feature-costs'] as const,
  localDataStats: ['local-data-stats'] as const,
  updateStatus: ['update-status'] as const,
  spendersLists: (accountId: string) => ['spenders-lists', accountId] as const,
  spendersRoster: (accountId: string, listId: string) =>
    ['spenders-roster', accountId, listId] as const,
  spendersUntiered: (accountId: string) => ['spenders-untiered', accountId] as const,
  spendersStats: (accountId: string) => ['spenders-stats', accountId] as const,
  spendersFreshness: (accountId: string) => ['spenders-freshness', accountId] as const,
  online: (accountId: string, spendersOnly: boolean) => ['online', accountId, spendersOnly] as const,
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

const CHAT_LIST_PAGE_SIZE = 500;

export interface ChatListPage {
  items: ChatListItemVM[];
  hasMore: boolean;
}

export function usePagedChats(accountId: string | null, filter: ChatFilter) {
  const query = useInfiniteQuery<
    ChatListPage,
    Error,
    InfiniteData<ChatListPage>,
    readonly string[],
    number
  >({
    queryKey: accountId === null ? ['chats-paged', 'none', filter] : qk.chatsPaged(accountId, filter),
    queryFn: ({ pageParam }) =>
      getBridge().invoke('query:chats.list', {
        accountId: accountId ?? '',
        filter,
        limit: CHAT_LIST_PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      if (!lastPage.hasMore || lastPage.items.length === 0) return undefined;
      return pages.reduce((total, page) => total + page.items.length, 0);
    },
    enabled: accountId !== null,
  });
  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data?.pages],
  );
  return { ...query, items };
}

export function useChat(accountId: string | null, chatId: string | null) {
  return useQuery<ChatListItemVM | null>({
    queryKey:
      accountId === null || chatId === null ? ['chat', 'none', 'none'] : qk.chat(accountId, chatId),
    queryFn: () =>
      getBridge().invoke('query:chats.get', { accountId: accountId ?? '', chatId: chatId ?? '' }),
    enabled: accountId !== null && chatId !== null,
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

export function useLoadOlderMessages(accountId: string, chatId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => getBridge().invoke('cmd:conversation.loadOlder', { accountId, chatId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.messages(accountId, chatId) });
    },
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
  return useQuery<ChatListItemVM | null, Error, ChatSendability | null>({
    queryKey:
      accountId === null || chatId === null ? ['chat', 'none', 'none'] : qk.chat(accountId, chatId),
    queryFn: () =>
      getBridge().invoke('query:chats.get', { accountId: accountId ?? '', chatId: chatId ?? '' }),
    enabled: accountId !== null && chatId !== null,
    select: (chat) =>
      chat === null
        ? null
        : { canSendMessage: chat.canSendMessage, canNotSendReason: chat.canNotSendReason },
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
  return useQuery<PersonalitiesSnapshotVM>({
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

/** Settings → Activity panel; refreshed by sync/AI/outbox events, never polled. */
export function useActivitySummary(enabled: boolean) {
  return useQuery<ActivityVM>({
    queryKey: qk.activity,
    queryFn: () => getBridge().invoke('query:activity.summary', undefined),
    enabled,
  });
}

export function useGuardConfig() {
  return useQuery<MessageGuardPolicy>({
    queryKey: qk.guardConfig,
    queryFn: () => getBridge().invoke('query:guard.config', undefined),
  });
}

export function useGuardBlocks(accountId: string | undefined, enabled: boolean) {
  return useQuery<MessageGuardBlocksReportVM>({
    queryKey: qk.guardBlocks(accountId),
    queryFn: () =>
      getBridge().invoke('query:guard.blocks', {
        ...(accountId !== undefined ? { accountId } : {}),
        limit: 50,
      }),
    enabled,
  });
}

/** Settings → Models cost hints; invalidated on operation:complete. */
export function useAiFeatureCosts(enabled: boolean) {
  return useQuery<AiFeatureCostsVM>({
    queryKey: qk.aiFeatureCosts,
    queryFn: () => getBridge().invoke('query:ai.featureCosts', undefined),
    enabled,
  });
}

/** Danger zone cache footprint; refetched on mount of the settings view. */
export function useLocalDataStats(enabled: boolean) {
  return useQuery<LocalDataStatsVM>({
    queryKey: qk.localDataStats,
    queryFn: () => getBridge().invoke('query:localData.stats', undefined),
    enabled,
    staleTime: 30_000,
  });
}

/** Settings "Test" buttons — one mutation instance per row keeps results separate. */
export function useKeyTest() {
  return useMutation({
    mutationFn: (provider: KeyTestProvider) => getBridge().invoke('cmd:keys.test', { provider }),
  });
}

/** Stage 24: one-time hub sign-in — main trades the credentials for a keychain-held device token. */
export function useHubDeviceTokenIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { username: string; password: string }) =>
      getBridge().invoke('cmd:hub.issueDeviceToken', args),
    onMutate: () => {
      beginAiHubOriginChange();
    },
    // Activation may fail after the token is durably stored. Refresh settings
    // on either outcome so the sign-out/recovery affordance becomes visible
    // alongside the mutation error while the bounded main-process retry runs.
    onSettled: () => {
      // Main publishes runtime.aiContext only if the effective principal
      // actually changed; that committed event owns any global AI reset.
      endAiHubOriginChange();
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}

/** Stage 24 recovery: revokes the exact remote token before deleting its local
 *  copy, so a stale bearer cannot survive sign-out. Invalidate on settle: the
 *  delete may land before fallback activation rejects, while revoke failures
 *  intentionally retain the token and surface the unchanged badge with error. */
export function useHubSignOutDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => getBridge().invoke('cmd:hub.signOutDevice', undefined),
    onMutate: () => {
      beginAiHubOriginChange();
    },
    onSettled: () => {
      endAiHubOriginChange();
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}

/** Last-resort local release when an old Hub origin is permanently gone. The
 * settings surface obtains explicit confirmation before invoking this. */
export function useHubAbandonDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => getBridge().invoke('cmd:hub.abandonDevice', undefined),
    onMutate: () => {
      beginAiHubOriginChange();
    },
    onSettled: () => {
      endAiHubOriginChange();
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}

export function useOpenDataFolder() {
  return useMutation({
    mutationFn: () => getBridge().invoke('cmd:localData.openFolder', undefined),
  });
}

export function useExportDiagnostics() {
  return useMutation({
    mutationFn: () => getBridge().invoke('cmd:localData.exportDiagnostics', undefined),
  });
}

// ─── Stage 12: local-history harvest (Danger Zone) ─────────────────────────
// Self-polls while a run is active; the start command is fire-and-forget on
// the main side, so status is the single source of progress truth.

export function useHarvestStatus() {
  return useQuery({
    queryKey: ['harvest', 'status'],
    queryFn: () => getBridge().invoke('query:harvest.status', undefined),
    refetchInterval: (query) => (query.state.data?.state === 'running' ? 2_000 : false),
  });
}

export function useHarvestPrepareIdentity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => getBridge().invoke('cmd:harvest.prepareIdentity', undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['harvest'] });
    },
  });
}

export function useHarvestStart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => getBridge().invoke('cmd:harvest.start', undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['harvest'] });
    },
  });
}

export function useHarvestPause() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => getBridge().invoke('cmd:harvest.pause', undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['harvest'] });
    },
  });
}

// ─── Settings → Updates (PLAN item 11) ─────────────────────────────────────
// No db:changed signal drives update state, so this query self-polls while a
// check/download is in flight (downloading/checking) and idles otherwise.

const UPDATE_ACTIVE_PHASES = new Set(['checking', 'available', 'downloading']);

export function useUpdateStatus(enabled: boolean) {
  return useQuery<UpdateStatusVM>({
    queryKey: qk.updateStatus,
    queryFn: () => getBridge().invoke('query:updates.status', undefined),
    enabled,
    refetchInterval: (query) =>
      query.state.data && UPDATE_ACTIVE_PHASES.has(query.state.data.phase) ? 1_000 : false,
  });
}

export function useCheckUpdates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => getBridge().invoke('cmd:updates.check', undefined),
    onSuccess: (status) => queryClient.setQueryData(qk.updateStatus, status),
  });
}

export function useInstallUpdate() {
  return useMutation({
    mutationFn: () => getBridge().invoke('cmd:updates.install', undefined),
  });
}

// ─── spenders board (PLAN item 12) ─────────────────────────────────────
// Roster/untiered joins recompute from the local DB on db:changed events; the
// OM roster ids behind them TTL-cache in main (5 min) so invalidations stay
// credit-free. staleTime 0 is deliberate — the join is cheap SQLite work.

export function useSpenderLists(accountId: string | null, enabled: boolean) {
  return useQuery<{ lists: SpenderListVM[]; fetchedAt: string }>({
    queryKey: accountId === null ? ['spenders-lists', 'none'] : qk.spendersLists(accountId),
    queryFn: () => getBridge().invoke('query:spenders.lists', { accountId: accountId ?? '' }),
    enabled: enabled && accountId !== null,
    retry: false,
    staleTime: 5 * 60_000, // matches main's TTL — list metadata moves slowly
  });
}

export function useSpenderRoster(
  accountId: string | null,
  listId: string | null,
  enabled: boolean,
) {
  return useQuery<{ rows: SpenderRowVM[]; truncated: boolean; fetchedAt: string }>({
    queryKey:
      accountId === null || listId === null
        ? ['spenders-roster', 'none', 'none']
        : qk.spendersRoster(accountId, listId),
    queryFn: () =>
      getBridge().invoke('query:spenders.roster', {
        accountId: accountId ?? '',
        listId: listId ?? '',
      }),
    enabled: enabled && accountId !== null && listId !== null,
    retry: false,
  });
}

export function useSpenderUntiered(accountId: string | null, enabled: boolean) {
  return useQuery<{ rows: SpenderRowVM[]; fetchedAt: string }>({
    queryKey: accountId === null ? ['spenders-untiered', 'none'] : qk.spendersUntiered(accountId),
    queryFn: () => getBridge().invoke('query:spenders.untiered', { accountId: accountId ?? '' }),
    enabled: enabled && accountId !== null,
    retry: false,
  });
}

export function useSpenderStats(accountId: string | null, enabled: boolean) {
  return useQuery<SpenderStatsVM>({
    queryKey: accountId === null ? ['spenders-stats', 'none'] : qk.spendersStats(accountId),
    queryFn: () => getBridge().invoke('query:spenders.stats', { accountId: accountId ?? '' }),
    enabled: enabled && accountId !== null,
    retry: false,
  });
}

/** Per-scope «последний апдейт» stamps + the in-flight refresh queue (PLAN
 *  item 13). Refetched on spendersRefresh done/partial/stopped frames (events.ts);
 *  live progress flows through the spenders store, not this query. */
export function useSpendersFreshness(accountId: string | null, enabled: boolean) {
  return useQuery<SpendersFreshnessVM>({
    queryKey: accountId === null ? ['spenders-freshness', 'none'] : qk.spendersFreshness(accountId),
    queryFn: () => getBridge().invoke('query:spenders.freshness', { accountId: accountId ?? '' }),
    enabled: enabled && accountId !== null,
    retry: false,
  });
}

// ─── Online surface (variant C, flat) ───────────────────────────────────────
// Snapshot is an in-memory main cache (0 credits, staleTime ∞ — only changes on
// an explicit refresh). «Обновить» is the only OFAPI call (1 credit/page) and
// writes the fresh snapshot straight into the cache (same idiom as
// useCheckUpdates). No polling, no auto-fetch (owner: «автопарс жрёт кредиты»).

export function useOnlineSnapshot(accountId: string | null, spendersOnly: boolean, enabled = true) {
  return useQuery<OnlineSnapshotVM>({
    queryKey: accountId === null ? ['online', 'none', spendersOnly] : qk.online(accountId, spendersOnly),
    queryFn: () =>
      getBridge().invoke('query:online.snapshot', { accountId: accountId ?? '', spendersOnly }),
    enabled: enabled && accountId !== null,
    staleTime: Infinity,
  });
}

export function useRefreshOnline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { accountId: string; spendersOnly: boolean }) =>
      getBridge().invoke('cmd:online.refresh', vars),
    onSuccess: (snapshot, vars) => {
      queryClient.setQueryData(qk.online(vars.accountId, vars.spendersOnly), snapshot);
    },
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
    onMutate: (patch) => {
      const blocksAi = 'hubBaseUrl' in patch;
      if (blocksAi) beginAiHubOriginChange();
      return { blocksAi };
    },
    onSuccess: (settings, patch) => {
      queryClient.setQueryData(qk.settings, settings);
      void queryClient.invalidateQueries({ queryKey: qk.syncStatus });
      void queryClient.invalidateQueries({ queryKey: qk.activity });
      if ('hubBaseUrl' in patch) {
        // Hub replacement swaps the scoped catalog + mappings. Main's
        // runtime.aiContext event separately resets jobs only when its exact
        // origin/principal fingerprint actually changed.
        void queryClient.invalidateQueries({ queryKey: qk.personalities });
        void queryClient.invalidateQueries({ queryKey: qk.accounts });
        void queryClient.invalidateQueries({ queryKey: ['fan'] });
      } else if ('accountPageLabels' in patch) {
        void queryClient.invalidateQueries({ queryKey: qk.accounts });
      }
    },
    onSettled: (_settings, _error, _patch, mutation) => {
      if (mutation?.blocksAi === true) {
        endAiHubOriginChange();
      }
    },
  });
}

export function useExportLegacyPersonaSnapshot() {
  return useMutation({
    mutationFn: () => getBridge().invoke('cmd:personalities.exportLegacySnapshot', undefined),
  });
}

export function useSetMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { accountId: string; personalityId: string | null }) =>
      getBridge().invoke('cmd:mappings.set', args),
    onSuccess: (_result, args) => {
      void queryClient.invalidateQueries({ queryKey: qk.accounts });
      void queryClient.invalidateQueries({ queryKey: qk.settings });
      void queryClient.invalidateQueries({ queryKey: ['fan', args.accountId] });
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

export function useReconcileUnread() {
  return useMutation({
    mutationFn: (vars: { accountId?: string; trigger?: 'manual' | 'unread-tab' | 'account-focus' }) =>
      getBridge().invoke('cmd:sync.reconcileUnread', vars),
  });
}

/** Manual in-chat ↻: pull this one chat's message tail now. New rows arrive via
 *  the db:changed → qk.messages invalidation path, so no manual cache poke. */
export function useRefreshConversation() {
  return useMutation({
    mutationFn: (vars: { accountId: string; chatId: string }) =>
      getBridge().invoke('cmd:conversation.refresh', vars),
  });
}
