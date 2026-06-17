import { useEffect } from 'react';
import { useAccounts, useChat, useFan } from '../../bridge/queries';
import { getBridge } from '../../bridge/bridge';
import { useUiStore } from '../../state/uiStore';
import { modCombo } from '../../lib/modKey';
import { EmptyState } from '../../design/EmptyState';
import { Kbd } from '../../design/Kbd';
import { ConversationHeader } from './ConversationHeader';
import { ConversationView } from './ConversationView';
import { FULL_CHAT_FEATURES } from './conversationFeatures';
import { handleConversationChange } from '../ai/aiStore';
import { resetVaultForConversation } from '../vault/vaultStore';
import { useT } from '../../lib/i18n';

export function ConversationPane(): React.JSX.Element {
  const t = useT();
  const accountId = useUiStore((s) => s.selectedAccountId);
  const chatId = useUiStore((s) => s.selectedChatId);
  const typing = useUiStore((s) => s.typing);
  const setTyping = useUiStore((s) => s.setTyping);
  const setView = useUiStore((s) => s.setView);

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
  const selectedChat = useChat(accountId, chatId);
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
  const chat = selectedChat.data ?? null;

  if (accountId !== null && chatId !== null && selectedChat.isPending) {
    return (
      <section className="flex min-w-0 flex-1 flex-col bg-bg0">
        <EmptyState glyph="✉" title={t('conv.loadingTitle')} />
      </section>
    );
  }

  if (accountId === null || chatId === null || chat === null) {
    return (
      <section className="flex min-w-0 flex-1 flex-col bg-bg0">
        <EmptyState
          glyph="✉"
          title={t('conv.selectPrompt')}
          hint={
            <span>
              <Kbd>J</Kbd> <Kbd>K</Kbd> {t('conv.navHintNavigate')} · <Kbd>{modCombo('U')}</Kbd>{' '}
              {t('conv.navHintNextUnread')} · <Kbd>{modCombo('K')}</Kbd> {t('conv.navHintJump')}
            </span>
          }
        />
      </section>
    );
  }

  const unmapped = account !== null && account.personalityId === null;
  // expiry is handled by the effect above clearing the store

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg0">
      <ConversationHeader accountId={accountId} chat={chat} fan={fan.data ?? null} />
      {unmapped && (
        <div className="flex flex-none items-center gap-3 border-b border-amber-line bg-amber-bg px-[18px] py-2 text-[12.5px] text-amber">
          <span className="font-semibold">{t('conv.gateMapTitle')}</span>
          <span className="text-amber/80">{t('conv.gateMapBody')}</span>
          <button
            type="button"
            onClick={() => setView('settings')}
            className="ml-auto cursor-pointer font-semibold underline decoration-dotted underline-offset-2"
          >
            {t('sp.openSettings')}
          </button>
        </div>
      )}
      <ConversationView
        accountId={accountId}
        chatId={chatId}
        features={FULL_CHAT_FEATURES}
        density="comfortable"
        scrollMode="stick"
      />
    </section>
  );
}
