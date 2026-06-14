import type { ChatListItemVM, FanPanelVM } from '../../../../preload/contract';
import { Avatar } from '../../design/Avatar';
import { Kbd } from '../../design/Kbd';
import { AiHeaderMenu } from '../ai/AiHeaderMenu';
import { formatDollars } from '../../lib/money';
import { formatLastSeen, isOnline } from '../../lib/time';
import { cx } from '../../lib/cx';
import { presenceKey, useUiStore } from '../../state/uiStore';
import { useT } from '../../lib/i18n';

function ValueChip({
  cap,
  value,
  money = false,
  warn = false,
  className,
}: {
  cap: string;
  value: string;
  money?: boolean;
  warn?: boolean;
  /** container-query hide class (e.g. `@max-[520px]:hidden`) — drop priority. */
  className?: string;
}): React.JSX.Element {
  return (
    <div
      className={cx(
        // shrink-0 + whitespace-nowrap keep the chip a single fixed-height line:
        // it can only ever be hidden (via className) or overflow horizontally,
        // never wrap its multi-word RU label vertically past the 60px bar.
        'flex shrink-0 items-baseline gap-1.5 rounded-full border px-3 py-1 whitespace-nowrap',
        money ? 'border-green-line bg-green-bg' : warn ? 'border-amber-line bg-amber-bg' : 'border-line bg-bg1',
        className,
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
  const t = useT();
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
    presenceFresh && presence.online ? t('conv.onlineNow') : formatLastSeen(lastSeen, now, t);
  const sub = fan?.subscription ?? null;

  // Responsive bar (@container = self-width queries): the identity block is the
  // ONLY shrinkable flex item (min-w-0, truncates first); chips and the AI/Kbd
  // actions are shrink-0 so they never compress or wrap. The value chips drop
  // progressively as the bar narrows — priority lifetime > sub > fan-for.
  //   Safe-to-hide invariant: with the FanPanel CLOSED the centre column is
  //   always ≥ ~696px (window minWidth 1100 − rail 64 − list 340), and every
  //   chip breakpoint here is below that, so a chip only ever hides while the
  //   FanPanel is OPEN — where the same lifetime/subscription figures are shown.
  //   Data is never lost, only de-duplicated when space is tight.
  return (
    <header className="@container flex h-[60px] flex-none items-center gap-3 border-b border-line bg-bg1 px-[18px]">
      <div className="flex min-w-0 items-center gap-[11px]">
        <Avatar name={chat.fanName} url={fan?.avatarUrl ?? chat.avatarUrl} online={online} size={38} />
        <div className="min-w-0">
          <div className="truncate font-serif text-[17px] font-semibold">{chat.fanName}</div>
          <div
            className={cx(
              'flex min-w-0 items-center gap-[5px] text-[12px]',
              online ? 'text-green' : 'text-ink-low',
            )}
          >
            {online && <span className="h-[7px] w-[7px] flex-none rounded-full bg-online" />}
            <span className="truncate">{lastSeenLabel}</span>
          </div>
        </div>
      </div>
      <div className="ml-3.5 flex shrink-0 gap-[7px]">
        {fan?.spending != null && (
          <ValueChip
            cap={t('conv.capLifetime')}
            value={formatDollars(fan.spending.total)}
            money
            className="@max-[520px]:hidden"
          />
        )}
        {sub !== null && sub.status === 'active' && !sub.autoRenewOff && sub.renewsAt !== null && (
          <ValueChip
            cap={t('conv.capSub')}
            value={t('conv.subRenews', { days: formatRenewDays(sub.renewsAt, now) })}
            className="@max-[600px]:hidden"
          />
        )}
        {sub !== null && sub.status === 'active' && sub.autoRenewOff && (
          <ValueChip cap={t('conv.capSub')} value={t('conv.subAutoRenewOff')} warn className="@max-[600px]:hidden" />
        )}
        {sub !== null && sub.status === 'expired' && (
          <ValueChip cap={t('conv.capSub')} value={t('conv.subExpired')} className="@max-[600px]:hidden" />
        )}
        {sub?.durationLabel != null && (
          <ValueChip
            cap={t('conv.capFanFor')}
            value={sub.durationLabel.replace(' months', ' mo')}
            className="@max-[680px]:hidden"
          />
        )}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2.5 text-ink-low">
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
