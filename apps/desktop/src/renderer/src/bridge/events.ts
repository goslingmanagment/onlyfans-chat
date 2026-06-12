// Single event-subscription point: validates incoming frames (zod at the trust
// boundary, SPEC §15), batches query invalidations (≤1 flush / 50 ms — the
// legacy stream-batching lesson), and drives toasts / typing / LLM-cost slots.

import { z } from 'zod';
import type { QueryClient } from '@tanstack/react-query';
import { parseOperationEvent, parseSyncEvent } from '@chatgoose/shared/protocol/index';
import type { ChatListItemVM } from '../../../preload/contract';
import { getBridge } from './bridge';
import { qk } from './queries';
import { useUiStore } from '../state/uiStore';
import { useSettingsCache } from '../state/settingsCache';
import { playNotificationBlip } from '../lib/sound';
import { uiMessage } from '@chatgoose/shared/i18n/index';
import { currentLocale } from '../lib/i18n';
import { handleAiOperationEvent } from '../features/ai/aiStore';

const dbChangedSchema = z.object({
  scope: z.enum(['accounts', 'chats', 'messages', 'fans', 'summaries', 'settings', 'outbox']),
  accountId: z.string().optional(),
  chatId: z.string().optional(),
});

const FLUSH_MS = 50;
const TYPING_TTL_MS = 5_000;
// Presence is authoritative while fresh; a missed users.offline webhook must
// not pin a fan online forever — match the 5-min "online now" window of
// formatLastSeen/isOnline so both signals age out together.
const PRESENCE_TTL_MS = 5 * 60_000;

export function attachBridgeEvents(queryClient: QueryClient): () => void {
  const bridge = getBridge();
  const pending = new Set<string>();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  function queueInvalidate(key: readonly string[]): void {
    pending.add(JSON.stringify(key));
    flushTimer ??= setTimeout(() => {
      flushTimer = null;
      const keys = [...pending];
      pending.clear();
      for (const raw of keys) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          void queryClient.invalidateQueries({ queryKey: parsed });
        }
      }
    }, FLUSH_MS);
  }

  function invalidateChats(accountId: string): void {
    // all filters of this account's list
    queueInvalidate(['chats', accountId]);
  }

  function invalidateSpenders(accountId: string): void {
    // Board row joins (spend / preview / counters) recompute from the local
    // DB; the OM roster ids behind them stay TTL-cached in main (0 credits).
    queueInvalidate(['spenders-roster', accountId]);
    queueInvalidate(['spenders-untiered', accountId]);
    queueInvalidate(['spenders-stats', accountId]);
  }

  function handleDbChanged(event: z.infer<typeof dbChangedSchema>): void {
    switch (event.scope) {
      case 'accounts':
        queueInvalidate(qk.accounts);
        break;
      case 'chats':
        if (event.accountId !== undefined) {
          invalidateChats(event.accountId);
          // also fires on fan_transactions sweeps — the 30-day board figure
          invalidateSpenders(event.accountId);
        } else queueInvalidate(['chats']);
        break;
      case 'messages':
        if (event.accountId !== undefined && event.chatId !== undefined) {
          queueInvalidate(qk.messages(event.accountId, event.chatId));
        } else {
          queueInvalidate(['messages']);
        }
        // spenders rows carry МОДЕЛЬ/ФАН counters from the message DB
        if (event.accountId !== undefined) invalidateSpenders(event.accountId);
        break;
      case 'outbox':
        // outbox refetches ONLY on this event — no polling (DESIGN §3)
        if (event.accountId !== undefined && event.chatId !== undefined) {
          queueInvalidate(qk.outbox(event.accountId, event.chatId));
        } else {
          queueInvalidate(['outbox']);
        }
        // status-bar SENDS + the Activity panel's sends row
        queueInvalidate(qk.syncStatus);
        queueInvalidate(qk.activity);
        break;
      case 'fans':
      case 'summaries':
        if (event.accountId !== undefined && event.chatId !== undefined) {
          queueInvalidate(qk.fan(event.accountId, event.chatId));
        } else {
          queueInvalidate(['fan']);
        }
        if (event.scope === 'fans' && event.accountId !== undefined) {
          invalidateSpenders(event.accountId); // lifetime spend lives on fans
        }
        break;
      case 'settings':
        queueInvalidate(qk.settings);
        queueInvalidate(qk.personalities);
        break;
    }
  }

  const offDb = bridge.on('db:changed', (payload) => {
    const parsed = dbChangedSchema.safeParse(payload);
    if (parsed.success) handleDbChanged(parsed.data);
  });

  const creditBalanceSchema = z.object({ type: z.literal('creditBalance') });

  const offSync = bridge.on('sync:event', (payload) => {
    // Additive status frame (contract.ts CreditBalanceEvent): not part of the
    // shared SyncEvent union — refresh the credit figures and move on.
    if (creditBalanceSchema.safeParse(payload).success) {
      queueInvalidate(qk.syncStatus);
      queueInvalidate(qk.activity);
      return;
    }
    const event = parseSyncEvent(payload);
    if (event === null) return;
    const ui = useUiStore.getState();
    switch (event.type) {
      case 'chatListUpdated':
        invalidateChats(event.accountId);
        queueInvalidate(qk.accounts);
        queueInvalidate(qk.syncStatus);
        queueInvalidate(qk.activity);
        break;
      case 'messageReceived': {
        queueInvalidate(qk.messages(event.accountId, event.chatId));
        invalidateChats(event.accountId);
        queueInvalidate(qk.accounts);
        // a fan message can unblock Ping (5-day rule) — refresh the gate
        queueInvalidate(['ai-ping-gate', event.accountId, event.chatId]);
        const isOpenChat =
          ui.selectedAccountId === event.accountId &&
          ui.selectedChatId === event.chatId &&
          document.hasFocus();
        if (!isOpenChat) {
          const settings = useSettingsCache.getState();
          if (settings.notificationsEnabled) {
            const list = queryClient.getQueryData<{ items: ChatListItemVM[] }>(
              qk.chats(event.accountId, 'all'),
            );
            const chat = list?.items.find((c) => c.chatId === event.chatId);
            const locale = currentLocale();
            ui.pushToast({
              title: chat?.fanName ?? uiMessage(locale, 'toast.newMessage'),
              body: chat?.lastMessagePreview ?? uiMessage(locale, 'toast.sentYou'),
              accountId: event.accountId,
              chatId: event.chatId,
            });
          }
          if (settings.soundEnabled) playNotificationBlip();
        }
        break;
      }
      case 'messageSent':
      case 'ppvUnlocked':
      case 'tipReceived':
        queueInvalidate(qk.messages(event.accountId, event.chatId));
        invalidateChats(event.accountId);
        break;
      case 'readStateChanged':
        queueInvalidate(qk.messages(event.accountId, event.chatId));
        break;
      case 'messageDeleted':
        // Main enriches chatId via local lookup before re-emitting; a frame
        // without it identifies no chat — nothing to invalidate.
        if (event.chatId !== undefined) {
          queueInvalidate(qk.messages(event.accountId, event.chatId));
          invalidateChats(event.accountId);
        }
        break;
      case 'presence':
        ui.setPresence(event.accountId, event.chatId, {
          online: event.online,
          lastSeenAt: event.lastSeenAt ?? null,
          expiresAt: Date.now() + PRESENCE_TTL_MS,
        });
        queueInvalidate(qk.fan(event.accountId, event.chatId));
        break;
      case 'typing':
        ui.setTyping({
          accountId: event.accountId,
          chatId: event.chatId,
          expiresAt: Date.now() + TYPING_TTL_MS,
        });
        break;
      case 'accountAuthChanged':
        queueInvalidate(qk.accounts);
        break;
    }
  });

  const offAi = bridge.on('ai:event', (payload) => {
    const event = parseOperationEvent(payload);
    if (event === null) return;
    // dock first (frame correlation lives there), then the status-bar cost slot
    handleAiOperationEvent(event);
    if (event.type === 'operation:complete') {
      // AI TODAY (status bar) + the Activity panel's AI ledger + Models cost hints
      queueInvalidate(qk.syncStatus);
      queueInvalidate(qk.activity);
      queueInvalidate(qk.aiFeatureCosts);
    }
  });

  return () => {
    offDb();
    offSync();
    offAi();
    if (flushTimer !== null) clearTimeout(flushTimer);
  };
}
