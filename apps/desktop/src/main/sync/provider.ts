// SyncProvider seam (SPEC §6): PollingSync now, HubSync (core SSE) at P3 swaps in
// behind the same surface — renderer code unchanged.

import type { OfApiPurpose } from '@chatgoose/shared';
import type { SyncEvent } from '@chatgoose/shared/protocol/index';

export type SyncListener = (event: SyncEvent) => void;

export interface SyncStatusSnapshot {
  /** Per-account ISO timestamp of the last successful chat-list poll. */
  freshness: Record<string, string>;
  state: 'live' | 'degraded' | 'offline';
  /** Effective per-account poll cadence (ms) after focus/hidden/budget/hub factors. */
  pollIntervalsMs?: Record<string, number>;
  deepSweepEveryMs?: number;
}

export interface SyncProvider {
  start(accountIds: readonly string[]): void;
  stop(): void;
  subscribe(listener: SyncListener): () => void;
  /** One read-only tail fetch (limit=100, ONE page). Default ledger purpose is
   *  'message-tail'; the spenders refresh queue passes its own distinct one. */
  refreshChat(accountId: string, chatId: string, purpose?: OfApiPurpose): Promise<void>;
  /** Lazily resolve the chat-list metadata row (canSendMessage, lastMessage)
   *  for deep Spenders rows that are outside the initial inbox hydration. */
  ensureChat(accountId: string, chatId: string, hint?: { username?: string | null }): Promise<boolean>;
  /** Conversation focus drives the read-state sweep + immediate refresh. */
  openConversation(accountId: string, chatId: string): Promise<void>;
  closeConversation(accountId: string, chatId: string): void;
  setFocusedAccount(accountId: string | null): void;
  setWindowVisible(visible: boolean): void;
  forceRefresh(accountId?: string): Promise<void>;
  status(): SyncStatusSnapshot;
}
