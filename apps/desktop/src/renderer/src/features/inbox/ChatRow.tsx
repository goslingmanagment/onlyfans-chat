import { memo } from 'react';
import type { ChatListItemVM } from '../../../../preload/contract';
import { Avatar } from '../../design/Avatar';
import { cx } from '../../lib/cx';
import { formatListTime } from '../../lib/time';

/** Memoized 64px chat row per mockup .row — virtualized parent positions it. */
export const ChatRow = memo(function ChatRow({
  chat,
  selected,
  online,
  onSelect,
}: {
  chat: ChatListItemVM;
  selected: boolean;
  online: boolean;
  onSelect: (chatId: string) => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onSelect(chat.chatId)}
      className={cx(
        'relative grid h-16 w-full cursor-pointer grid-cols-[40px_1fr_auto] items-center gap-[11px] border-b border-line px-[14px] text-left',
        selected ? 'bg-bg2' : 'bg-bg1 hover:bg-bg2',
      )}
    >
      {selected && <span className="absolute top-0 bottom-0 left-0 w-[3px] bg-clay" />}
      <Avatar name={chat.fanName} url={chat.avatarUrl} online={online} />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-serif text-[14px] font-semibold">{chat.fanName}</span>
          {chat.fanWaiting && (
            <span title="Fan waiting" className="h-[7px] w-[7px] flex-none rounded-full bg-clay" />
          )}
        </div>
        <div className="mt-[2px] truncate text-[13px] text-ink-mid">
          {chat.lastMessageIsSentByMe && <span className="text-ink-low">you: </span>}
          {chat.lastMessagePreview}
        </div>
      </div>
      <div className="flex flex-col items-end gap-[5px]">
        <span className="num text-micro text-ink-low">
          {chat.lastMessageAt === null ? '' : formatListTime(new Date(chat.lastMessageAt), new Date())}
        </span>
        <span className="flex items-center gap-1">
          {chat.hasUnreadTips && (
            <span className="num rounded-full border border-green-line bg-green-bg px-[7px] py-px text-micro font-semibold text-green">
              tip
            </span>
          )}
          {chat.unreadCount > 0 && (
            <span className="num flex h-[17px] min-w-[18px] items-center justify-center rounded-[9px] bg-clay px-[5px] text-micro font-semibold text-white">
              {chat.unreadCount}
            </span>
          )}
        </span>
      </div>
    </button>
  );
});
