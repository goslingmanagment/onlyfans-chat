// One window-level keydown listener for the whole app (DESIGN §2: single
// registry, no scattered listeners). Overlay-local keys (palette arrows) stay
// inside their components; everything global routes through here.

import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createKeymap, type KeyEventLike } from '../lib/keymap';
import { nextChatId, nextUnreadChatId } from '../lib/filters';
import { KEY_BINDINGS } from './keymapBindings';
import { useUiStore } from '../state/uiStore';
import { qk } from '../bridge/queries';
import type { ChatListItemVM, SettingsVM } from '../../../preload/contract';
import {
  useAiStore,
  activateDockPart,
  cancelActiveOperation,
  cycleDockTone,
  dismissDock,
} from '../features/ai/aiStore';
import { startAiFromGlobal } from '../features/ai/globalStart';
import { sendCurrentDraft } from '../features/conversation/sendController';
import { COMPOSER_TEXTAREA_ID } from '../features/conversation/composerDom';

function toEventLike(e: KeyboardEvent): KeyEventLike {
  const target = e.target;
  const inEditable =
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable);
  return {
    key: e.key,
    metaKey: e.metaKey,
    ctrlKey: e.ctrlKey,
    altKey: e.altKey,
    shiftKey: e.shiftKey,
    inEditable,
  };
}

export function KeymapProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const queryClient = useQueryClient();
  const keymap = useMemo(() => createKeymap(KEY_BINDINGS), []);

  useEffect(() => {
    function chatItems(accountId: string, filter: 'all' | 'unread' | 'with_tips'): ChatListItemVM[] {
      const data = queryClient.getQueryData<{ items: ChatListItemVM[] }>(qk.chats(accountId, filter));
      return data?.items ?? [];
    }

    function findChat(accountId: string, chatId: string): ChatListItemVM | undefined {
      return (
        chatItems(accountId, 'all').find((c) => c.chatId === chatId) ??
        chatItems(accountId, useUiStore.getState().chatFilter).find((c) => c.chatId === chatId)
      );
    }

    function onKeyDown(e: KeyboardEvent): void {
      const action = keymap.resolve(toEventLike(e));
      if (action === null) return;
      const ui = useUiStore.getState();
      const overlayOpen = ui.paletteOpen || ui.cheatsheetOpen;

      if (overlayOpen && action !== 'palette' && action !== 'cheatsheet' && action !== 'dismiss') {
        return; // overlays own the rest of the keys
      }

      switch (action) {
        case 'palette':
          e.preventDefault();
          ui.setPaletteOpen(!ui.paletteOpen);
          return;
        case 'cheatsheet':
          e.preventDefault();
          ui.setCheatsheetOpen(!ui.cheatsheetOpen);
          return;
        case 'settings':
          // Before the line-104 workspace guard: ⌘, works from any view.
          e.preventDefault();
          ui.setView('settings');
          return;
        case 'dismiss': {
          if (ui.paletteOpen) ui.setPaletteOpen(false);
          else if (ui.cheatsheetOpen) ui.setCheatsheetOpen(false);
          else if (useAiStore.getState().op !== null) dismissDock();
          else if (ui.view === 'settings') ui.setView('workspace');
          else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          return;
        }
        default:
          break;
      }

      // ⌘1..9 / ⌘0 — insert AI draft part N / all parts; degrades to copy when
      // the chat can't be messaged (SPEC §7.0)
      if (action.startsWith('ai-part-')) {
        const aiOp = useAiStore.getState().op;
        if (aiOp === null) return; // let the default through
        e.preventDefault();
        const chat = findChat(aiOp.accountId, aiOp.chatId);
        // unknown chat defaults to insert — inserting never sends by itself
        activateDockPart(Number(action.slice('ai-part-'.length)), {
          canSend: chat?.canSendMessage ?? true,
        });
        return;
      }

      if (ui.view !== 'workspace' || ui.selectedAccountId === null) return;
      const accountId = ui.selectedAccountId;

      switch (action) {
        case 'next-chat':
        case 'prev-chat': {
          e.preventDefault();
          const items = chatItems(accountId, ui.chatFilter);
          const next = nextChatId(
            items.map((c) => c.chatId),
            ui.selectedChatId,
            action === 'next-chat' ? 1 : -1,
          );
          if (next !== null) ui.selectChat(accountId, next);
          return;
        }
        case 'next-unread': {
          e.preventDefault();
          const all = chatItems(accountId, 'all');
          const pool = all.length > 0 ? all : chatItems(accountId, ui.chatFilter);
          const next = nextUnreadChatId(pool, ui.selectedChatId);
          if (next !== null) ui.selectChat(accountId, next);
          return;
        }
        case 'toggle-panel':
          e.preventDefault();
          ui.togglePanel();
          return;
        case 'toggle-list':
          e.preventDefault();
          ui.toggleList();
          return;
        case 'focus-composer': {
          const textarea = document.getElementById(COMPOSER_TEXTAREA_ID);
          if (textarea instanceof HTMLTextAreaElement && !textarea.disabled) {
            e.preventDefault();
            textarea.focus();
          }
          return;
        }
        case 'send': {
          e.preventDefault();
          if (ui.selectedChatId === null) return;
          const chat = findChat(accountId, ui.selectedChatId);
          if (chat === undefined) return;
          sendCurrentDraft({ accountId, chatId: chat.chatId, canSend: chat.canSendMessage });
          return;
        }
        // startAiFromGlobal applies the same gates as the pill row / AI menu
        // (mapped + key, ping fan-active, hi message cap)
        case 'ai-reply':
          e.preventDefault();
          startAiFromGlobal('fast-reply', queryClient);
          return;
        case 'ai-improve':
          e.preventDefault();
          startAiFromGlobal('improve-draft', queryClient);
          return;
        case 'ai-help':
          e.preventDefault();
          startAiFromGlobal('help-me', queryClient);
          return;
        case 'ai-ping':
          e.preventDefault();
          startAiFromGlobal('ping', queryClient);
          return;
        case 'ai-hi':
          e.preventDefault();
          startAiFromGlobal('hi-greeting', queryClient);
          return;
        case 'ai-review':
          e.preventDefault();
          startAiFromGlobal('chat-review', queryClient);
          return;
        case 'ai-scan':
          e.preventDefault();
          startAiFromGlobal('fan-summary', queryClient);
          return;
        case 'ai-tone': {
          e.preventDefault();
          const settings = queryClient.getQueryData<SettingsVM>(qk.settings);
          cycleDockTone(settings?.defaultReplyTone ?? 'casual');
          return;
        }
        case 'ai-cancel':
          e.preventDefault();
          cancelActiveOperation();
          return;
        default:
          return;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [keymap, queryClient]);

  return <>{children}</>;
}
