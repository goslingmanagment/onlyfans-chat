import { memo } from 'react';
import type { ChatListItemVM, SettingsVM } from '../../../../preload/contract';
import { Avatar } from '../../design/Avatar';
import { cx } from '../../lib/cx';
import { formatWholeDollars } from '../../lib/money';
import { formatListTime } from '../../lib/time';

/** Memoized 64px chat row per mockup .row — virtualized parent positions it.
 *  Fan value per DESIGN §1: lifetime beside the name (figure or chip per the
 *  spendStyle setting), 30-day net inflow bottom-right in green — the row's
 *  single colour accent; both figures share the creator-net basis. $0/unknown
 *  renders nothing; the unread badge is always clay (no tip pill — tips read
 *  via the Tips filter and the preview line). */
export const ChatRow = memo(function ChatRow({
  chat,
  selected,
  online,
  spendStyle,
  onSelect,
}: {
  chat: ChatListItemVM;
  selected: boolean;
  online: boolean;
  spendStyle: SettingsVM['spendStyle'];
  onSelect: (chatId: string) => void;
}): React.JSX.Element {
  const lifetime =
    chat.lifetimeSpend !== null && Math.round(chat.lifetimeSpend) > 0
      ? formatWholeDollars(chat.lifetimeSpend)
      : null;
  const flow30d =
    chat.spend30d !== null && Math.round(chat.spend30d) > 0
      ? `+${formatWholeDollars(chat.spend30d)}`
      : null;
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
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate font-serif text-[14px] font-semibold">
            {chat.fanName}
          </span>
          {chat.fanWaiting && (
            <span title="Fan waiting" className="h-[7px] w-[7px] flex-none rounded-full bg-clay" />
          )}
          {lifetime !== null && (
            <span
              title="Lifetime spend (net)"
              className={cx(
                'num flex-none text-ink-mid',
                spendStyle === 'chip'
                  ? 'rounded-full border border-line-strong bg-bg2 px-[7px] text-[9.5px] leading-[15px]'
                  : 'text-[10.5px]',
              )}
            >
              {lifetime}
            </span>
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
        <span className="flex items-center gap-1.5">
          {flow30d !== null && (
            <span title="Spent in the last 30 days (net)" className="num text-[10px] font-semibold text-green">
              {flow30d}
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
