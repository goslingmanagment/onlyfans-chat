// Chat list (~340px): one quiet filter row, virtualized 64px rows, footer
// hints. No list title, no search box — search lives in ⌘K (DESIGN §1).

import { useCallback, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { UiMessageKey } from '@chatgoose/shared/i18n/index';
import type { ChatFilter } from '../../../../preload/contract';
import { useChats, useReconcileUnread, useSettings } from '../../bridge/queries';
import { useUiStore } from '../../state/uiStore';
import { chatFilterCounts } from '../../lib/filters';
import { useT } from '../../lib/i18n';
import { modCombo } from '../../lib/modKey';
import { Chip } from '../../design/Chip';
import { Kbd } from '../../design/Kbd';
import { SkeletonRows } from '../../design/Skeleton';
import { EmptyState } from '../../design/EmptyState';
import { ChatRow } from './ChatRow';
import { NavNumberOverlay } from './NavNumberOverlay';

const FILTERS: Array<{ id: ChatFilter; labelKey: UiMessageKey }> = [
  { id: 'all', labelKey: 'sp.all' },
  { id: 'unread', labelKey: 'inbox.filterUnread' },
  { id: 'with_tips', labelKey: 'inbox.filterTips' },
];

/** Fixed chat-row height — matches ChatRow `h-16`; shared by the virtualizer
 *  estimate and the ⌘1..9 number overlay so their geometry can't drift. */
const ROW_HEIGHT = 64;

export function ChatListPane(): React.JSX.Element {
  const t = useT();
  const accountId = useUiStore((s) => s.selectedAccountId);
  const selectedChatId = useUiStore((s) => s.selectedChatId);
  const chatFilter = useUiStore((s) => s.chatFilter);
  const setChatFilter = useUiStore((s) => s.setChatFilter);
  const selectChat = useUiStore((s) => s.selectChat);

  const chats = useChats(accountId, chatFilter);
  const allChats = useChats(accountId, 'all'); // counts for the filter chips
  const counts = chatFilterCounts(allChats.data?.items ?? []);
  const settings = useSettings();
  const spendStyle = settings.data?.spendStyle ?? 'figure';
  const { mutate: reconcileUnread } = useReconcileUnread();

  const items = chats.data?.items ?? [];
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    getItemKey: (i) => items[i]?.chatId ?? i,
  });

  const onSelect = useCallback(
    (chatId: string) => {
      if (accountId !== null) selectChat(accountId, chatId);
    },
    [accountId, selectChat],
  );

  useEffect(() => {
    const unreadReconcile = settings.data?.unreadReconcile;
    if (
      accountId === null ||
      chatFilter !== 'unread' ||
      unreadReconcile?.enabled !== true ||
      unreadReconcile.triggerOnUnreadTabOpen !== true ||
      counts.unread === 0
    ) {
      return;
    }
    reconcileUnread({ accountId, trigger: 'unread-tab' });
  }, [
    accountId,
    chatFilter,
    counts.unread,
    reconcileUnread,
    settings.data?.unreadReconcile,
  ]);

  return (
    <section className="flex min-h-0 w-[340px] flex-none flex-col border-r border-line bg-bg1">
      <div className="flex gap-[5px] border-b border-line px-3 py-[10px]">
        {FILTERS.map((f) => (
          <Chip key={f.id} selected={chatFilter === f.id} onClick={() => setChatFilter(f.id)}>
            {t(f.labelKey)}
            {f.id !== 'all' && counts[f.id] > 0 && (
              <span className="num ml-[3px] text-[10.5px] opacity-70">{counts[f.id]}</span>
            )}
          </Chip>
        ))}
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {chats.isPending && <SkeletonRows />}
        {!chats.isPending && items.length === 0 && (
          <EmptyState
            title={chatFilter === 'all' ? t('inbox.emptyAllTitle') : t('inbox.emptyFilteredTitle')}
            hint={
              chatFilter === 'all'
                ? t('inbox.emptyAllHint')
                : t('inbox.emptyFilteredHint')
            }
          />
        )}
        {items.length > 0 && (
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const chat = items[vi.index];
              if (chat === undefined || accountId === null) return null;
              return (
                <div
                  key={vi.key}
                  className="absolute top-0 left-0 w-full"
                  style={{ height: vi.size, transform: `translateY(${vi.start}px)` }}
                >
                  <ChatRow
                    accountId={accountId}
                    chat={chat}
                    selected={chat.chatId === selectedChatId}
                    online={false}
                    spendStyle={spendStyle}
                    onSelect={onSelect}
                  />
                </div>
              );
            })}
            {/* ⌘1..9 badges — one isolated layer, painted only while the mod key
                is held; shares this scrolled coordinate space with the rows. */}
            <NavNumberOverlay count={items.length} rowHeight={ROW_HEIGHT} />
          </div>
        )}
      </div>
      <div className="flex flex-none flex-wrap items-center gap-x-2 gap-y-1 border-t border-line bg-bg1 px-[14px] py-2 text-[11px] text-ink-low">
        <span className="flex items-center gap-1">
          <Kbd>J</Kbd>
          <Kbd>K</Kbd> {t('inbox.footNavigate')}
        </span>
        · <span className="flex items-center gap-1"><Kbd>{modCombo('U')}</Kbd> {t('inbox.footNextUnread')}</span>
        · <span className="flex items-center gap-1"><Kbd>{modCombo('1–9')}</Kbd> {t('inbox.footJump')}</span>
      </div>
    </section>
  );
}
