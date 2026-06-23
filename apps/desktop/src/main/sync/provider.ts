// SyncProvider seam (SPEC §6): PollingSync now, HubSync (core SSE) at P3 swaps in
// behind the same surface — renderer code unchanged.

import type { OfApiPurpose } from '@chatgoose/shared';
import type { SyncEvent } from '@chatgoose/shared/protocol/index';

export type SyncListener = (event: SyncEvent) => void;

export type UnreadReconcileTrigger =
  | 'manual'
  | 'unread-tab'
  | 'window-focus'
  | 'account-focus'
  | 'timer';

export interface SyncStatusSnapshot {
  /** Per-account ISO timestamp of the last successful chat-list poll. */
  freshness: Record<string, string>;
  /** Same clock as `freshness`, named for hub-mode UI where push age is primary. */
  listVerifiedAt?: Record<string, string>;
  state: 'live' | 'degraded' | 'offline';
  /** Effective per-account poll cadence (ms); null means automatic polling is paused. */
  pollIntervalsMs?: Record<string, number | null>;
  deepSweepEveryMs?: number;
}

export interface SyncProvider {
  start(accountIds: readonly string[]): void;
  stop(): void;
  subscribe(listener: SyncListener): () => void;
  /** Automatic/background tail fetch (limit=100, ONE page). Gated by
   *  settings.autoReadChats because the OFAPI body read marks the chat read. */
  refreshChat(accountId: string, chatId: string, purpose?: OfApiPurpose): Promise<void>;
  /** Deliberate single-chat user read (QuickLook/open-like). Bypasses the
   *  automatic auto-read gate but does NOT set openConversation or arm sweeps. */
  readChatTailForUserOpen(
    accountId: string,
    chatId: string,
    purpose?: OfApiPurpose,
  ): Promise<void>;
  /** Deliberate user scrollback read: fetch older history before the oldest
   *  local row using first_id+desc. Returns counts only; no message bodies. */
  loadOlderMessagesForUserOpen(
    accountId: string,
    chatId: string,
  ): Promise<{ returned: number; fresh: number; hasOlder: boolean }>;
  /** Lazily resolve the chat-list metadata row (canSendMessage, lastMessage)
   *  for deep Spenders rows that are outside the initial inbox hydration. */
  ensureChat(accountId: string, chatId: string, hint?: { username?: string | null }): Promise<boolean>;
  /** Conversation focus drives the read-state sweep + immediate refresh. */
  openConversation(accountId: string, chatId: string): Promise<void>;
  closeConversation(accountId: string, chatId: string): void;
  setFocusedAccount(accountId: string | null): void;
  setWindowVisible(visible: boolean): void;
  forceRefresh(accountId?: string): Promise<void>;
  reconcileUnread(accountId?: string, trigger?: UnreadReconcileTrigger): Promise<void>;
  status(): SyncStatusSnapshot;
}
