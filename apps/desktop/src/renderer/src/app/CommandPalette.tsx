// ⌘K palette: jump to chat (bridge search) / account / run actions — the only
// search surface (no list search box, per DESIGN §1).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUiStore } from '../state/uiStore';
import { useAccounts, useChatSearch, useChats, useForceRefresh } from '../bridge/queries';
import { startAiFromGlobal } from '../features/ai/globalStart';
import { fuzzyFilter } from '../lib/fuzzy';
import { Avatar } from '../design/Avatar';
import { ListRow } from '../design/ListRow';
import { Kbd } from '../design/Kbd';

interface PaletteEntry {
  id: string;
  section: 'Chats' | 'Accounts' | 'Actions';
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
  run: () => void;
}

export function CommandPalette(): React.JSX.Element | null {
  const open = useUiStore((s) => s.paletteOpen);
  return open ? <PaletteBody /> : null;
}

function PaletteBody(): React.JSX.Element {
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
  const selectAccount = useUiStore((s) => s.selectAccount);
  const selectChat = useUiStore((s) => s.selectChat);
  const togglePanel = useUiStore((s) => s.togglePanel);
  const toggleList = useUiStore((s) => s.toggleList);
  const setView = useUiStore((s) => s.setView);
  const setCheatsheetOpen = useUiStore((s) => s.setCheatsheetOpen);
  const accountId = useUiStore((s) => s.selectedAccountId);

  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const accounts = useAccounts();
  const loadedChats = useChats(accountId, 'all');
  const search = useChatSearch(accountId, query);
  const forceRefresh = useForceRefresh();
  const queryClient = useQueryClient();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const entries = useMemo<PaletteEntry[]>(() => {
    const close = (): void => setPaletteOpen(false);
    const out: PaletteEntry[] = [];

    const chatPool = query.trim().length > 0 ? (search.data ?? []) : (loadedChats.data?.items ?? []);
    const chats = query.trim().length > 0 ? chatPool : chatPool.slice(0, 6);
    for (const chat of chats) {
      out.push({
        id: `chat:${chat.chatId}`,
        section: 'Chats',
        title: chat.fanName,
        subtitle: chat.lastMessagePreview,
        leading: <Avatar name={chat.fanName} url={chat.avatarUrl} size={28} radius={8} />,
        run: () => {
          if (accountId !== null) selectChat(accountId, chat.chatId);
          close();
        },
      });
    }

    const accountEntries = fuzzyFilter(accounts.data ?? [], query, (a) => `${a.displayName} ${a.username}`, 4);
    for (const account of accountEntries) {
      out.push({
        id: `account:${account.id}`,
        section: 'Accounts',
        title: account.displayName,
        subtitle: `@${account.username}${account.isAuthenticated ? '' : ' · re-auth needed'}`,
        leading: <Avatar name={account.displayName} url={account.avatarUrl} size={28} radius={8} />,
        run: () => {
          selectAccount(account.id);
          close();
        },
      });
    }

    // AI starts go through the shared gated entry point — same gates as the
    // pill row and ✳ menu; gated/contextless invocations are silent no-ops.
    // 'compare' stays out of the palette (P4-stretch, hidden while gated).
    const actions: Array<{ id: string; title: string; run: () => void }> = [
      { id: 'act:ai-reply', title: 'AI: Fast Reply (⌘R)', run: () => startAiFromGlobal('fast-reply', queryClient) },
      { id: 'act:ai-improve', title: 'AI: Improve draft (⌘I)', run: () => startAiFromGlobal('improve-draft', queryClient) },
      { id: 'act:ai-help', title: 'AI: Help me — coaching (⌘H)', run: () => startAiFromGlobal('help-me', queryClient) },
      { id: 'act:ai-ping', title: 'AI: Ping — reactivation message (⌘P)', run: () => startAiFromGlobal('ping', queryClient) },
      { id: 'act:ai-hi', title: 'AI: Hi greeting — opener variants (⌘G)', run: () => startAiFromGlobal('hi-greeting', queryClient) },
      { id: 'act:ai-scan', title: 'AI: Scan — deep fan profile (⌘S)', run: () => startAiFromGlobal('fan-summary', queryClient) },
      { id: 'act:ai-review', title: 'AI: Chat review — rate this conversation (⌘E)', run: () => startAiFromGlobal('chat-review', queryClient) },
      // Entry point for the Supporters board (PLAN item 12; recorded in DESIGN §1)
      { id: 'act:supporters', title: 'Supporters — board of top spenders', run: () => setView('supporters') },
      { id: 'act:settings', title: 'Open settings', run: () => setView('settings') },
      { id: 'act:refresh', title: 'Force refresh', run: () => forceRefresh.mutate(undefined) },
      { id: 'act:panel', title: 'Toggle fan panel', run: togglePanel },
      { id: 'act:list', title: 'Toggle chat list', run: toggleList },
      { id: 'act:keys', title: 'Show keyboard shortcuts', run: () => setCheatsheetOpen(true) },
    ];
    for (const action of fuzzyFilter(actions, query, (a) => a.title, 8)) {
      out.push({
        id: action.id,
        section: 'Actions',
        title: action.title,
        leading: <span className="w-7 text-center text-[13px] text-clay">✳</span>,
        run: () => {
          close();
          action.run();
        },
      });
    }
    return out;
  }, [
    query,
    search.data,
    loadedChats.data,
    accounts.data,
    accountId,
    selectAccount,
    selectChat,
    setPaletteOpen,
    setView,
    togglePanel,
    toggleList,
    setCheatsheetOpen,
    forceRefresh,
    queryClient,
  ]);

  const clampedCursor = Math.min(cursor, Math.max(0, entries.length - 1));

  function onKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(entries.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      entries[clampedCursor]?.run();
    }
  }

  let lastSection: string | null = null;

  return (
    <div
      className="absolute inset-0 z-50 flex justify-center bg-ink/20 pt-[110px]"
      onMouseDown={() => setPaletteOpen(false)}
    >
      <div
        className="flex h-fit max-h-[460px] w-[560px] flex-col overflow-hidden rounded-menu border border-line-strong bg-bg1 shadow-pop"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <span className="text-ink-low">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Jump to chat, fan or action…"
            className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-low"
          />
          <Kbd>esc</Kbd>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {entries.length === 0 && (
            <div className="px-4 py-6 text-center text-[12.5px] text-ink-low">Nothing matches</div>
          )}
          {entries.map((entry, i) => {
            const header = entry.section !== lastSection ? entry.section : null;
            lastSection = entry.section;
            return (
              <div key={entry.id}>
                {header !== null && (
                  <div className="cap bg-bg1 px-4 pt-3 pb-1 text-ink-low">{header}</div>
                )}
                <ListRow
                  selected={i === clampedCursor}
                  onClick={entry.run}
                  {...(entry.leading !== undefined ? { leading: entry.leading } : {})}
                  title={<span className="font-serif">{entry.title}</span>}
                  {...(entry.subtitle !== undefined ? { subtitle: entry.subtitle } : {})}
                  trailing={i === clampedCursor ? <Kbd>↵</Kbd> : <span />}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
