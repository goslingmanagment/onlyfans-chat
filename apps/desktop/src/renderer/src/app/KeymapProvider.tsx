// One window-level keydown listener for the whole app (DESIGN §2: single
// registry, no scattered listeners). Overlay-local keys (palette arrows) stay
// inside their components; everything global routes through here. AI and panel
// combos come from the family scheme shared with the Fansly extension
// (lib/hotkeyScheme.ts, vendored @chatgoose/hotkeys); navigation, send and the
// board keys from keymapBindings.ts.

import { useEffect, useMemo } from 'react';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { createKeymap, type KeyEventLike } from '../lib/keymap';
import { nextChatId, nextUnreadChatId, nthChatId } from '../lib/filters';
import { KEY_BINDINGS } from './keymapBindings';
import { useLightboxStore } from '../features/media/lightboxStore';
import { useUiStore } from '../state/uiStore';
import { createNavOverlayController } from '../state/navOverlayStore';
import { createDesktopHotkeyEngine, resolveDesktopKey, schemePlatform } from '../lib/hotkeyScheme';
import { currentLocale } from '../lib/i18n';
import { uiMessage } from '@chatgoose/shared/i18n/index';
import { qk, type ChatListPage } from '../bridge/queries';
import type { ChatListItemVM, SettingsVM } from '../../../preload/contract';
import {
  useAiStore,
  activateDockPart,
  cancelActiveOperation,
  cycleDockTone,
  dismissDock,
  togglePreferSplit,
} from '../features/ai/aiStore';
import { startAiFromGlobal } from '../features/ai/globalStart';
import { sendCurrentDraft } from '../features/conversation/sendController';
import { COMPOSER_TEXTAREA_ID } from '../features/conversation/composerDom';
import { previewRow } from '../features/spenders/spendersStore';
import { boardStoreForView, isBoardView } from '../features/spenders/boardStores';
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

/** Split from the keyboard: the same toggle as the dock's ⫶ pill, disabled
 *  while a run is streaming (the pill is too); the toast is the only feedback
 *  when the dock is closed. */
function toggleSplitFromKeyboard(): void {
  // `status` is the visible dock job's; it can read 'running' with no job on
  // screen (after a cancel), so only a visible running job blocks, like the pill.
  const dock = useAiStore.getState();
  if (dock.op !== null && dock.status === 'running') return;
  togglePreferSplit();
  const locale = currentLocale();
  useUiStore.getState().pushToast({
    title: uiMessage(locale, 'aidock.split'),
    body: uiMessage(locale, useAiStore.getState().preferSplit ? 'toast.splitOn' : 'toast.splitOff'),
  });
}

export function KeymapProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const queryClient = useQueryClient();
  const keymap = useMemo(() => createKeymap(KEY_BINDINGS), []);
  const engine = useMemo(() => createDesktopHotkeyEngine(), []);
  const navOverlay = useMemo(() => createNavOverlayController({ platform: schemePlatform() }), []);

  useEffect(() => {
    function chatItems(accountId: string, filter: 'all' | 'unread' | 'with_tips'): ChatListItemVM[] {
      const paged = queryClient.getQueryData<InfiniteData<ChatListPage>>(
        qk.chatsPaged(accountId, filter),
      );
      const pagedItems = paged?.pages.flatMap((page) => page.items) ?? [];
      if (pagedItems.length > 0) return pagedItems;
      const data = queryClient.getQueryData<{ items: ChatListItemVM[] }>(qk.chats(accountId, filter));
      return data?.items ?? [];
    }

    function findChat(accountId: string, chatId: string): ChatListItemVM | undefined {
      return (
        chatItems(accountId, 'all').find((c) => c.chatId === chatId) ??
        chatItems(accountId, useUiStore.getState().chatFilter).find((c) => c.chatId === chatId)
      );
    }

    // P2 number overlay: hold ⌘/Ctrl ALONE → badge the chat list after a short
    // delay (NavNumberOverlay); any other key cancels it, so ⌘E never flashes
    // the badges. keyup/blur/visibility (below) clear it — the OS eating a
    // keyup (⌘Tab) never sticks badges.
    function onKeyDown(e: KeyboardEvent): void {
      navOverlay.keydown(e);
      const resolved = resolveDesktopKey(engine.keydown(e), keymap, toEventLike(e));
      if (resolved.kind === 'none') return;
      if (resolved.kind === 'swallow') {
        // auto-repeat, a retired habit, a roll-over after a language switch,
        // or reserved Coach: ChatGoose owns the combo but does nothing now
        e.preventDefault();
        return;
      }
      // Scheme combos belong to ChatGoose in every view: swallow them even
      // where the view has nothing to run.
      if (resolved.kind === 'scheme') e.preventDefault();
      const action = resolved.action;
      const ui = useUiStore.getState();
      const lightboxOpen = useLightboxStore.getState().open;
      const overlayOpen = ui.paletteOpen || ui.cheatsheetOpen || lightboxOpen;

      if (overlayOpen && action !== 'palette' && action !== 'cheatsheet' && action !== 'dismiss') {
        return; // overlays own the rest of the keys
      }

      switch (action) {
        case 'palette':
          e.preventDefault();
          // D43: the palette never opens underneath the lightbox — it closes first.
          if (lightboxOpen) useLightboxStore.getState().close();
          ui.setPaletteOpen(!ui.paletteOpen);
          return;
        case 'cheatsheet':
          e.preventDefault();
          if (lightboxOpen) useLightboxStore.getState().close();
          ui.setCheatsheetOpen(!ui.cheatsheetOpen);
          return;
        case 'settings':
          // Before the line-104 workspace guard: ⌘, works from any view.
          e.preventDefault();
          ui.setView('settings');
          return;
        case 'spenders':
          // Same toggle as the rail's $ button, from any view.
          ui.setView(ui.view === 'spenders' ? 'workspace' : 'spenders');
          return;
        case 'ai-split':
          toggleSplitFromKeyboard();
          return;
        case 'dismiss': {
          if (lightboxOpen) useLightboxStore.getState().close();
          else if (ui.paletteOpen) ui.setPaletteOpen(false);
          else if (ui.cheatsheetOpen) ui.setCheatsheetOpen(false);
          else if (isBoardView(ui.view) && (boardStoreForView(ui.view)?.getState().previewFanId ?? null) !== null) {
            // mockup: ESC closes the quick look; AI keeps running unless explicitly cancelled
            boardStoreForView(ui.view)?.getState().closePreview();
          } else if (ui.view === 'followers') ui.setView('workspace');
          else if (useAiStore.getState().op !== null) dismissDock();
          else if (ui.view === 'settings') ui.setView('workspace');
          else if (isBoardView(ui.view)) ui.setView('workspace');
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

      // ── Board scope (Spenders + Online variant C share J/K/SPACE/O/Ping) ──
      const boardStore = boardStoreForView(ui.view);
      if (boardStore !== null && ui.selectedAccountId !== null) {
        const accountId = ui.selectedAccountId;
        const spd = boardStore.getState();
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
          // Fix/Improve rewrites the shared composer draft (preview gained the
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
            // S — Spenders-only: compact stats column ⇄ full grid. Online has
            // no stats panel, so the key is a no-op there.
            e.preventDefault();
            if (ui.view === 'spenders') spd.toggleStatsExpanded();
            return;
          case 'board-search':
            if (ui.view === 'spenders' && spd.previewFanId === null) {
              e.preventDefault();
              document.querySelector<HTMLInputElement>('[data-spenders-search]')?.focus();
            }
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
      navOverlay.keyup(e);
      engine.keyup(e);
    }
    function onWindowBlur(): void {
      navOverlay.reset();
      engine.reset();
    }
    function onVisibilityChange(): void {
      if (document.hidden) {
        navOverlay.reset();
        engine.reset();
      }
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
  }, [engine, keymap, navOverlay, queryClient]);

  return <>{children}</>;
}
