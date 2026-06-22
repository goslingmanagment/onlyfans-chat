// One window-level keydown listener for the whole app (DESIGN §2: single
// registry, no scattered listeners). Overlay-local keys (palette arrows) stay
// inside their components; everything global routes through here.

import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createKeymap, type KeyEventLike } from '../lib/keymap';
import { nextChatId, nextUnreadChatId, nthChatId } from '../lib/filters';
import { KEY_BINDINGS } from './keymapBindings';
import { useUiStore } from '../state/uiStore';
import { useNavOverlayStore } from '../state/navOverlayStore';
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
import { previewRow, useSpendersStore } from '../features/spenders/spendersStore';
import {
  ensureAndOpenPreviewChat,
  focusPreviewComposer,
  startAiFromPreview,
} from '../features/spenders/previewActions';

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

    // P2 number overlay: hold ⌘/Ctrl → badge the chat list (NavNumberOverlay).
    // Driven off the LIVE modifier flags so a missed up/down self-heals on the
    // next key event; keyup/blur/visibility (below) clear it when the modifier
    // or window focus drops — the OS eating a keyup (⌘Tab) never sticks badges.
    function setModHeld(held: boolean): void {
      useNavOverlayStore.getState().setModHeld(held);
    }

    function onKeyDown(e: KeyboardEvent): void {
      setModHeld(e.metaKey || e.ctrlKey);
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
          else if (ui.view === 'spenders' && useSpendersStore.getState().previewFanId !== null) {
            // mockup: ESC closes the quick look; AI keeps running unless explicitly cancelled
            useSpendersStore.getState().closePreview();
          } else if (useAiStore.getState().op !== null) dismissDock();
          else if (ui.view === 'settings') ui.setView('workspace');
          else if (ui.view === 'spenders') ui.setView('workspace');
          else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          return;
        }
        default:
          break;
      }

      // ⌘0 — insert ALL AI draft parts as a [NEXT] sequence; degrades to copy
      // when the chat can't be messaged (SPEC §7.0). Individual parts are
      // click-only now (⌘1..9 jump chats), so this branch only ever sees 0.
      if (action.startsWith('ai-part-')) {
        const aiOp = useAiStore.getState().op;
        if (aiOp === null) return; // let the default through
        e.preventDefault();
        // Resolve canSend from the DB-backed singular chat cache (qk.chat,
        // populated by ConversationView's useChat) — the SAME source the dock
        // chip + composer use — not the chat-LIST cache, which usually lacks the
        // Spenders-preview fan. Keeps ⌘1..0 copy-degrading exactly when the dock
        // chip does for un-messageable fans (SPEC §7.0).
        const chat = queryClient.getQueryData<ChatListItemVM | null>(
          qk.chat(aiOp.accountId, aiOp.chatId),
        );
        // unknown chat defaults to insert — inserting never sends by itself
        activateDockPart(Number(action.slice('ai-part-'.length)), {
          canSend: chat?.canSendMessage ?? true,
        });
        return;
      }

      // ── Spenders board scope (PLAN item 12) ──
      if (ui.view === 'spenders' && ui.selectedAccountId !== null) {
        const accountId = ui.selectedAccountId;
        const spd = useSpendersStore.getState();
        switch (action) {
          case 'next-chat':
          case 'prev-chat':
            e.preventDefault();
            spd.moveCursor(action === 'next-chat' ? 1 : -1);
            return;
          case 'board-preview': {
            e.preventDefault();
            if (spd.previewFanId !== null) spd.closePreview();
            else {
              const fanId = spd.cursorFanId ?? spd.visibleRows[0]?.fanId ?? null;
              if (fanId !== null) spd.openPreview(fanId);
            }
            return;
          }
          case 'board-open-chat': {
            e.preventDefault();
            const row = previewRow(spd) ?? spd.visibleRows.find((item) => item.fanId === spd.cursorFanId);
            if (row !== undefined && row !== null) {
              void ensureAndOpenPreviewChat(row).catch(() => undefined);
            }
            return;
          }
          case 'board-back':
            e.preventDefault();
            if (spd.previewFanId !== null) spd.closePreview();
            else ui.setView('workspace');
            return;
          case 'focus-composer':
            e.preventDefault();
            focusPreviewComposer();
            return;
          case 'send': {
            // One send path: the preview composer goes through the same
            // cmd:send.message engine as the workspace composer (SPEC §7).
            e.preventDefault();
            const row = previewRow(spd);
            if (row !== null) {
              sendCurrentDraft({ accountId, chatId: row.fanId, canSend: row.canSendMessage });
            }
            return;
          }
          // Only the preview's three pills run from keys here — AI strictly on
          // explicit action, gated identically to the pill row.
          case 'ai-ping':
            e.preventDefault();
            startAiFromPreview('ping', queryClient);
            return;
          case 'ai-reply':
            e.preventDefault();
            startAiFromPreview('fast-reply', queryClient);
            return;
          case 'ai-hi':
            e.preventDefault();
            startAiFromPreview('hi-greeting', queryClient);
            return;
          // ⌘I — Improve rewrites the shared composer draft (preview gained the
          // Improve pill); routes through the same gated path as the other pills.
          case 'ai-improve':
            e.preventDefault();
            startAiFromPreview('improve-draft', queryClient);
            return;
          case 'ai-cancel':
            e.preventDefault();
            cancelActiveOperation();
            return;
          case 'board-stats':
            // S — compact stats column ⇄ full grid (owner v2 layout)
            e.preventDefault();
            spd.toggleStatsExpanded();
            return;
          default:
            return;
        }
      }

      if (ui.view !== 'workspace' || ui.selectedAccountId === null) return;
      const accountId = ui.selectedAccountId;

      // ⌘1..9 — jump to the Nth chat in the current filtered list. Workspace
      // only (settings/spenders never reach here). Fires from the composer too
      // (mod combos pass the editable gate); preventDefault ONLY when we
      // actually navigate, so an out-of-range ⌘N just falls through harmlessly.
      if (action.startsWith('chat-jump-')) {
        if (e.isComposing) return; // IME compose: never navigate mid-composition
        const target = nthChatId(
          chatItems(accountId, ui.chatFilter).map((c) => c.chatId),
          Number(action.slice('chat-jump-'.length)),
        );
        if (target !== null) {
          e.preventDefault();
          ui.selectChat(accountId, target);
        }
        return;
      }

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

    function onKeyUp(e: KeyboardEvent): void {
      setModHeld(e.metaKey || e.ctrlKey);
    }
    function onWindowBlur(): void {
      setModHeld(false);
    }
    function onVisibilityChange(): void {
      if (document.hidden) setModHeld(false);
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [keymap, queryClient]);

  return <>{children}</>;
}
