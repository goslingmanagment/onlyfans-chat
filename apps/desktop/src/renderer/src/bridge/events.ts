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
import { handleAiOperationEvent } from '../features/ai/aiStore';

const dbChangedSchema = z.object({
  scope: z.enum(['accounts', 'chats', 'messages', 'fans', 'summaries', 'settings', 'outbox']),
  accountId: z.string().optional(),
  chatId: z.string().optional(),
});

const FLUSH_MS = 50;
const TYPING_TTL_MS = 5_000;

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

  function handleDbChanged(event: z.infer<typeof dbChangedSchema>): void {
    switch (event.scope) {
      case 'accounts':
        queueInvalidate(qk.accounts);
        break;
      case 'chats':
        if (event.accountId !== undefined) invalidateChats(event.accountId);
        else queueInvalidate(['chats']);
        break;
      case 'messages':
        if (event.accountId !== undefined && event.chatId !== undefined) {
          queueInvalidate(qk.messages(event.accountId, event.chatId));
        } else {
          queueInvalidate(['messages']);
        }
        break;
      case 'outbox':
        // outbox refetches ONLY on this event — no polling (DESIGN §3)
        if (event.accountId !== undefined && event.chatId !== undefined) {
          queueInvalidate(qk.outbox(event.accountId, event.chatId));
        } else {
          queueInvalidate(['outbox']);
        }
        break;
      case 'fans':
      case 'summaries':
        if (event.accountId !== undefined && event.chatId !== undefined) {
          queueInvalidate(qk.fan(event.accountId, event.chatId));
        } else {
          queueInvalidate(['fan']);
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

  const offSync = bridge.on('sync:event', (payload) => {
    const event = parseSyncEvent(payload);
    if (event === null) return;
    const ui = useUiStore.getState();
    switch (event.type) {
      case 'chatListUpdated':
        invalidateChats(event.accountId);
        queueInvalidate(qk.accounts);
        queueInvalidate(qk.syncStatus);
        break;
      case 'messageReceived': {
        queueInvalidate(qk.messages(event.accountId, event.chatId));
        invalidateChats(event.accountId);
        queueInvalidate(qk.accounts);
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
            ui.pushToast({
              title: chat?.fanName ?? 'New message',
              body: chat?.lastMessagePreview ?? 'sent you a message',
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
      case 'presence':
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
    if (event.type === 'operation:complete' && event.llmSpend !== undefined) {
      useUiStore.getState().setLastLlmCost(event.llmSpend.totalUsd);
    }
  });

  return () => {
    offDb();
    offSync();
    offAi();
    if (flushTimer !== null) clearTimeout(flushTimer);
  };
}
