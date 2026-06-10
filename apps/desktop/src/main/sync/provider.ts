// SyncProvider seam (SPEC §6): PollingSync now, HubSync (core SSE) at P3 swaps in
// behind the same surface — renderer code unchanged.

import type { SyncEvent } from '@chatgoose/shared/protocol/index';

export type SyncListener = (event: SyncEvent) => void;

export interface SyncStatusSnapshot {
  /** Per-account ISO timestamp of the last successful chat-list poll. */
  freshness: Record<string, string>;
  state: 'live' | 'degraded' | 'offline';
}

export interface SyncProvider {
  start(accountIds: readonly string[]): void;
  stop(): void;
  subscribe(listener: SyncListener): () => void;
  refreshChat(accountId: string, chatId: string): Promise<void>;
  /** Conversation focus drives the read-state sweep + immediate refresh. */
  openConversation(accountId: string, chatId: string): Promise<void>;
  closeConversation(accountId: string, chatId: string): void;
  setFocusedAccount(accountId: string | null): void;
  setWindowVisible(visible: boolean): void;
  forceRefresh(accountId?: string): Promise<void>;
  status(): SyncStatusSnapshot;
}
