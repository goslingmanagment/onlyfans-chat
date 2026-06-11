import type { ChatListItemVM, FanPanelVM } from '../../../../preload/contract';
import { Avatar } from '../../design/Avatar';
import { Kbd } from '../../design/Kbd';
import { AiHeaderMenu } from '../ai/AiHeaderMenu';
import { formatDollars } from '../../lib/money';
import { formatLastSeen, isOnline } from '../../lib/time';
import { cx } from '../../lib/cx';
import { presenceKey, useUiStore } from '../../state/uiStore';

function ValueChip({
  cap,
  value,
  money = false,
  warn = false,
}: {
  cap: string;
  value: string;
  money?: boolean;
  warn?: boolean;
}): React.JSX.Element {
  return (
    <div
      className={cx(
        'flex items-baseline gap-1.5 rounded-full border px-3 py-1',
        money ? 'border-green-line bg-green-bg' : warn ? 'border-amber-line bg-amber-bg' : 'border-line bg-bg1',
      )}
    >
      <span className="cap text-[9.5px] text-ink-low">{cap}</span>
      <span className={cx('num text-[13px] font-semibold', money && 'text-green', warn && 'text-amber')}>
        {value}
      </span>
    </div>
  );
}

export function ConversationHeader({
  chat,
  fan,
}: {
  chat: ChatListItemVM;
  fan: FanPanelVM | null;
}): React.JSX.Element {
  const now = new Date();
  const lastSeen = fan?.lastSeen ?? null;
  // Live presence (hub SSE) wins while fresh; the cached fan.lastSeen heuristic
  // covers polling-only mode and expired entries. Dot color: bg-online (#3f9e54,
  // DESIGN §4).
  const presence = useUiStore((s) =>
    s.selectedAccountId === null
      ? undefined
      : s.presence[presenceKey(s.selectedAccountId, chat.chatId)],
  );
  const presenceFresh = presence !== undefined && presence.expiresAt > now.getTime();
  const online = presenceFresh ? presence.online : isOnline(lastSeen, now);
  const lastSeenLabel =
    presenceFresh && presence.online ? 'online now' : formatLastSeen(lastSeen, now);
  const sub = fan?.subscription ?? null;

  return (
    <header className="flex h-[60px] flex-none items-center gap-3 border-b border-line bg-bg1 px-[18px]">
      <div className="flex min-w-0 items-center gap-[11px]">
        <Avatar name={chat.fanName} url={fan?.avatarUrl ?? chat.avatarUrl} online={online} size={38} />
        <div className="min-w-0">
          <div className="truncate font-serif text-[17px] font-semibold">{chat.fanName}</div>
          <div
            className={cx(
              'flex items-center gap-[5px] text-[12px]',
              online ? 'text-green' : 'text-ink-low',
            )}
          >
            {online && <span className="h-[7px] w-[7px] rounded-full bg-online" />}
            {lastSeenLabel}
          </div>
        </div>
      </div>
      <div className="ml-3.5 flex gap-[7px]">
        {fan?.spending != null && (
          <ValueChip cap="lifetime" value={formatDollars(fan.spending.total)} money />
        )}
        {sub !== null && sub.status === 'active' && !sub.autoRenewOff && sub.renewsAt !== null && (
          <ValueChip cap="sub" value={`renews ${formatRenewDays(sub.renewsAt, now)}`} />
        )}
        {sub !== null && sub.status === 'active' && sub.autoRenewOff && (
          <ValueChip cap="sub" value="auto-renew OFF" warn />
        )}
        {sub !== null && sub.status === 'expired' && <ValueChip cap="sub" value="expired" />}
        {sub?.durationLabel != null && (
          <ValueChip cap="fan for" value={sub.durationLabel.replace(' months', ' mo')} />
        )}
      </div>
      <div className="ml-auto flex items-center gap-2.5 text-ink-low">
        <AiHeaderMenu />
        <Kbd>]</Kbd>
      </div>
    </header>
  );
}

function formatRenewDays(renewsAtIso: string, now: Date): string {
  const days = Math.max(0, Math.ceil((Date.parse(renewsAtIso) - now.getTime()) / 86_400_000));
  return `${days}d`;
}
