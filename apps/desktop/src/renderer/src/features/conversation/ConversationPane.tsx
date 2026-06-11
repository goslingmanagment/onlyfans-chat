import { useEffect } from 'react';
import { useAccounts, useChats, useFan } from '../../bridge/queries';
import { getBridge } from '../../bridge/bridge';
import { useUiStore } from '../../state/uiStore';
import { EmptyState } from '../../design/EmptyState';
import { Kbd } from '../../design/Kbd';
import { ConversationHeader } from './ConversationHeader';
import { MessageList } from './MessageList';
import { ComposerBar } from './ComposerBar';
import { AiDockMount } from '../ai/AiDock';
import { AiPillRow } from '../ai/AiPillRow';
import { handleConversationChange } from '../ai/aiStore';
import { GalleryTab } from '../vault/GalleryTab';
import { VaultPanel } from '../vault/VaultPanel';
import { resetVaultForConversation } from '../vault/vaultStore';
import { cx } from '../../lib/cx';

export function ConversationPane(): React.JSX.Element {
  const accountId = useUiStore((s) => s.selectedAccountId);
  const chatId = useUiStore((s) => s.selectedChatId);
  const typing = useUiStore((s) => s.typing);
  const setTyping = useUiStore((s) => s.setTyping);
  const setView = useUiStore((s) => s.setView);
  const conversationTab = useUiStore((s) => s.conversationTab);
  const setConversationTab = useUiStore((s) => s.setConversationTab);

  // expire the typing indicator client-side
  useEffect(() => {
    if (typing === null) return;
    const ms = typing.expiresAt - Date.now();
    if (ms <= 0) {
      setTyping(null);
      return;
    }
    const timer = setTimeout(() => setTyping(null), ms);
    return () => clearTimeout(timer);
  }, [typing, setTyping]);

  const accounts = useAccounts();
  const chats = useChats(accountId, 'all');
  const fan = useFan(accountId, chatId);

  // conversation switch dismisses the AI dock (the discarded frame confirms),
  // resets the per-conversation composer draft, and drops any in-progress
  // vault selection (it belonged to the previous fan's compose)
  useEffect(() => {
    handleConversationChange(accountId, chatId);
    resetVaultForConversation();
  }, [accountId, chatId]);

  // tell main which conversation to poll aggressively
  useEffect(() => {
    if (accountId === null || chatId === null) return;
    void getBridge().invoke('cmd:conversation.open', { accountId, chatId });
    return () => {
      void getBridge().invoke('cmd:conversation.close', { accountId, chatId });
    };
  }, [accountId, chatId]);

  // mark-as-read on open + on window focus regained (main owns debounce/gating, SPEC §7.9)
  useEffect(() => {
    if (accountId === null || chatId === null) return;
    void getBridge().invoke('cmd:chat.markRead', { accountId, chatId });
    const onFocus = (): void => {
      void getBridge().invoke('cmd:chat.markRead', { accountId, chatId });
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [accountId, chatId]);

  const account = accounts.data?.find((a) => a.id === accountId) ?? null;
  const chat = chats.data?.items.find((c) => c.chatId === chatId) ?? null;

  if (accountId === null || chatId === null || chat === null) {
    return (
      <section className="flex min-w-0 flex-1 flex-col bg-bg0">
        <EmptyState
          glyph="✉"
          title="Select a conversation"
          hint={
            <span>
              <Kbd>J</Kbd> <Kbd>K</Kbd> to navigate · <Kbd>⌘U</Kbd> next unread · <Kbd>⌘K</Kbd> to jump
            </span>
          }
        />
      </section>
    );
  }

  const unmapped = account !== null && account.personalityId === null;
  // expiry is handled by the effect above clearing the store
  const typingHere = typing !== null && typing.accountId === accountId && typing.chatId === chatId;

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg0">
      <ConversationHeader chat={chat} fan={fan.data ?? null} />
      {unmapped && (
        <div className="flex flex-none items-center gap-3 border-b border-amber-line bg-amber-bg px-[18px] py-2 text-[12.5px] text-amber">
          <span className="font-semibold">Map a personality to enable AI</span>
          <span className="text-amber/80">— this account has no personality yet.</span>
          <button
            type="button"
            onClick={() => setView('settings')}
            className="ml-auto cursor-pointer font-semibold underline decoration-dotted underline-offset-2"
          >
            Open settings
          </button>
        </div>
      )}
      <div className="flex flex-none items-center gap-1 border-b border-line bg-bg1 px-[18px] py-1">
        {(['thread', 'gallery'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setConversationTab(tab)}
            className={cx(
              'num cursor-pointer rounded-full px-2.5 py-0.5 text-micro font-semibold tracking-[0.08em] transition-colors',
              conversationTab === tab ? 'bg-ink text-bg1' : 'text-ink-low hover:bg-bg2',
            )}
          >
            {tab === 'thread' ? 'THREAD' : 'GALLERY'}
          </button>
        ))}
      </div>
      {conversationTab === 'gallery' ? (
        <GalleryTab accountId={accountId} chatId={chatId} />
      ) : (
        <MessageList accountId={accountId} chatId={chatId} fanName={chat.fanName} />
      )}
      {typingHere && (
        <div className="flex flex-none items-center gap-2 px-6 pb-1 text-[12px] text-ink-low">
          {chat.fanName} is typing
          <span className="inline-flex gap-[3px]">
            <i className="h-1 w-1 animate-pulse rounded-full bg-ink-low" />
            <i className="h-1 w-1 animate-pulse rounded-full bg-ink-low [animation-delay:200ms]" />
            <i className="h-1 w-1 animate-pulse rounded-full bg-ink-low [animation-delay:400ms]" />
          </span>
        </div>
      )}
      <VaultPanel accountId={accountId} chatId={chatId} canSend={chat.canSendMessage} />
      <AiDockMount />
      <AiPillRow accountId={accountId} chatId={chatId} />
      <ComposerBar accountId={accountId} chat={chat} personaName={account?.displayName ?? 'model'} />
    </section>
  );
}
