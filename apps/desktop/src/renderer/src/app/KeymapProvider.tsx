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
import type { ChatListItemVM } from '../../../preload/contract';

export const COMPOSER_TEXTAREA_ID = 'composer-draft';

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
        case 'dismiss': {
          if (ui.paletteOpen) ui.setPaletteOpen(false);
          else if (ui.cheatsheetOpen) ui.setCheatsheetOpen(false);
          else if (ui.view === 'settings') ui.setView('workspace');
          else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          return;
        }
        default:
          break;
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
        default:
          return;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [keymap, queryClient]);

  return <>{children}</>;
}
