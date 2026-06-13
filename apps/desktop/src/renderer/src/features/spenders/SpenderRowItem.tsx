// One spender row — chat-row anatomy per the binding mockup .lrow: lifetime
// (mono 10.5) right after the nick, 30-day green +$N top-right (only when >0),
// author-prefixed preview, staleness dot before the «МОДЕЛЬ N Д · ФАН M Д»
// counters. The dot tracks FAN silence (warm 8–21 d, hot >21 d).

import { memo } from 'react';
import type { SpenderRowVM } from '../../../../preload/contract';
import { Avatar } from '../../design/Avatar';
import { cx } from '../../lib/cx';
import { formatWholeDollars } from '../../lib/money';
import type { UiTranslator } from '@chatgoose/shared/i18n/index';

export function dayCounter(t: UiTranslator, days: number | null): string {
  if (days === null) return '—';
  if (days === 0) return t('sp.today');
  return `${days} ${t('sp.dayShort')}`;
}

export const SpenderRowItem = memo(function SpenderRowItem({
  row,
  active,
  t,
  onOpen,
}: {
  row: SpenderRowVM;
  /** Cursor row or open-preview row — bg + clay left bar (.lrow.open). */
  active: boolean;
  t: UiTranslator;
  onOpen: (fanId: string) => void;
}): React.JSX.Element {
  const lifetime =
    row.lifetimeSpend !== null && Math.round(row.lifetimeSpend) > 0
      ? formatWholeDollars(row.lifetimeSpend)
      : null;
  const flow30d =
    row.spend30d !== null && Math.round(row.spend30d) > 0
      ? `+${formatWholeDollars(row.spend30d)}`
      : null;
  return (
    <button
      type="button"
      onClick={() => onOpen(row.fanId)}
      className={cx(
        'relative grid w-full cursor-pointer grid-cols-[40px_1fr_auto] items-center gap-[11px] border-b border-line px-4 py-[11px] text-left',
        active ? 'bg-bg2' : 'bg-bg1 hover:bg-bg2',
      )}
    >
      {active && <span className="absolute top-0 bottom-0 left-0 w-[3px] bg-clay" />}
      <Avatar name={row.name} url={row.avatarUrl} />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate text-[14px] font-semibold">{row.name}</span>
          {row.fanWaiting && (
            <span title="Fan waiting" className="h-[7px] w-[7px] flex-none rounded-full bg-clay" />
          )}
          {lifetime !== null && (
            <span title="Lifetime spend (net)" className="num flex-none text-[10.5px] text-ink-mid">
              {lifetime}
            </span>
          )}
        </div>
        <div className="mt-[2px] truncate text-[13px] text-ink-mid">
          {row.lastMessagePreview === '' ? (
            // thread never fetched: honest italic hint, cured by the first
            // refresh / quick-look open (freshness mockup — no per-row marks)
            <span className="text-ink-low italic">{t('sp.noThreadYet')}</span>
          ) : (
            <>
              {row.lastMessageIsSentByMe && <span className="text-ink-low">{t('sp.you')} </span>}
              {row.lastMessagePreview}
            </>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 whitespace-nowrap">
        <span className="num min-h-[13px] text-[10px] font-semibold text-green">{flow30d ?? ''}</span>
        <span className="num flex items-center gap-[5px] text-[9.5px] tracking-[0.06em] text-ink-low">
          {row.silence !== 'none' && (
            <span
              className={cx(
                'h-[7px] w-[7px] flex-none rounded-full',
                row.silence === 'warm' ? 'bg-amber' : 'bg-clay-deep',
              )}
            />
          )}
          {t('sp.model')} <b className="font-semibold text-ink-mid">{dayCounter(t, row.modelDays)}</b>
          {' · '}
          {t('sp.fan')} <b className="font-semibold text-ink-mid">{dayCounter(t, row.fanDays)}</b>
        </span>
      </div>
    </button>
  );
});
