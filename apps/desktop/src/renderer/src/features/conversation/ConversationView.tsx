// The ONE conversation BODY — shared by the full workspace chat
// (ConversationPane) and the compact Spenders quick-look preview (QuickLook).
// Everything that differs between the two surfaces is a single `features` flag
// (conversationFeatures.ts), never an `if (preview)` scattered through JSX;
// visual tightness is the orthogonal `density` axis (--cv-* tokens). The HEADER
// stays shell-owned (full = ConversationHeader; preview = its own compact bar),
// and so does the lifecycle (aggressive poll / mark-read) — this component
// renders body chrome only and runs no conversation-open side effects.

import { useAccounts, useChat } from '../../bridge/queries';
import { useUiStore } from '../../state/uiStore';
import { Thread, type ThreadDensity, type ThreadScrollMode } from './Thread';
import { ComposerBar } from './ComposerBar';
import { AiDockMount } from '../ai/AiDock';
import { AiPillRow } from '../ai/AiPillRow';
import { GalleryTab } from '../vault/GalleryTab';
import { VaultPanel } from '../vault/VaultPanel';
import { cx } from '../../lib/cx';
import { useT } from '../../lib/i18n';
import type { ConversationFeatures } from './conversationFeatures';

export function ConversationView({
  accountId,
  chatId,
  features,
  density = 'comfortable',
  scrollMode = 'stick',
}: {
  accountId: string;
  chatId: string;
  features: ConversationFeatures;
  density?: ThreadDensity;
  scrollMode?: ThreadScrollMode;
}): React.JSX.Element {
  const t = useT();
  const chat = useChat(accountId, chatId).data ?? null;
  const accounts = useAccounts();
  const account = accounts.data?.find((a) => a.id === accountId) ?? null;
  const personaName = account?.displayName ?? 'model';

  const conversationTab = useUiStore((s) => s.conversationTab);
  const setConversationTab = useUiStore((s) => s.setConversationTab);
  const typing = useUiStore((s) => s.typing);

  // The chat row may not be loaded yet (preview opens before the lazy sync
  // lands), or a reactivation-queue fan has no local chat row at all. Still
  // mount the AI dock + pills so a started/running op stays VISIBLE and the
  // footer is never empty; only the live composer + vault need `chat` for
  // sendability/PPV, so show a disabled placeholder (the old "composer
  // disabled" contract) rather than dropping the whole footer.
  if (chat === null) {
    return (
      <>
        <Thread
          accountId={accountId}
          chatId={chatId}
          fanName=""
          density={density}
          scrollMode={scrollMode}
        />
        <div data-density={density} className="flex flex-none flex-col">
          <AiDockMount compact={features.dock === 'compact'} />
          <AiPillRow
            accountId={accountId}
            chatId={chatId}
            pills={features.pills}
            replyTone={features.replyTone}
          />
          <div className="flex-none border-t border-line bg-bg1 px-4 py-3">
            <div className="rounded-[8px] border border-line bg-bg2 px-3 py-2.5 text-[13px] text-ink-low">
              {t('conv.loadingTitle')}
            </div>
          </div>
        </div>
      </>
    );
  }

  const showGallery = features.galleryTab && conversationTab === 'gallery';
  const typingHere =
    features.typingIndicator &&
    typing !== null &&
    typing.accountId === accountId &&
    typing.chatId === chatId;

  return (
    <>
      {features.galleryTab && (
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
      )}
      {showGallery ? (
        <GalleryTab accountId={accountId} chatId={chatId} />
      ) : (
        <Thread
          accountId={accountId}
          chatId={chatId}
          fanName={chat.fanName}
          density={density}
          scrollMode={scrollMode}
        />
      )}
      {typingHere && (
        <div className="flex flex-none items-center gap-2 px-6 pb-1 text-[12px] text-ink-low">
          {t('conv.isTyping', { name: chat.fanName })}
          <span className="inline-flex gap-[3px]">
            <i className="h-1 w-1 animate-pulse rounded-full bg-ink-low" />
            <i className="h-1 w-1 animate-pulse rounded-full bg-ink-low [animation-delay:200ms]" />
            <i className="h-1 w-1 animate-pulse rounded-full bg-ink-low [animation-delay:400ms]" />
          </span>
        </div>
      )}
      {/* Body chrome below the thread. data-density is set for any future
          --cv-*-aware descendants; today only the thread reads the tokens, so
          the composer/pills/dock stay full-size on both surfaces. */}
      <div data-density={density} className="flex flex-none flex-col">
        {features.vault && (
          <VaultPanel accountId={accountId} chatId={chatId} canSend={chat.canSendMessage} />
        )}
        <AiDockMount compact={features.dock === 'compact'} />
        <AiPillRow
          accountId={accountId}
          chatId={chatId}
          pills={features.pills}
          replyTone={features.replyTone}
        />
        <ComposerBar
          accountId={accountId}
          chat={chat}
          personaName={personaName}
          showVault={features.vault}
        />
      </div>
    </>
  );
}
