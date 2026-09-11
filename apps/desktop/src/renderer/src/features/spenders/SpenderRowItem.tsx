// D29: one latest message with its author, visible money, and two aligned
// contact-age columns. Online keeps its existing presence column.

import { memo } from 'react';
import type { SpenderRowVM } from '../../../../preload/contract';
import { Avatar } from '../../design/Avatar';
import { cx } from '../../lib/cx';
import { formatWholeDollars } from '../../lib/money';
import type { UiTranslator } from '@chatgoose/shared/i18n/index';
import { ContactAge } from './ContactAgeValue';

export const SpenderRowItem = memo(function SpenderRowItem({
  row,
  active,
  t,
  now,
  onOpen,
  online = false,
  onlineLabel,
}: {
  row: SpenderRowVM;
  active: boolean;
  t: UiTranslator;
  now: number;
  onOpen: (fanId: string) => void;
  online?: boolean;
  onlineLabel?: string;
}): React.JSX.Element {
  const columns = onlineLabel === undefined;
  const lifetime = row.lifetimeSpend === null ? '—' : formatWholeDollars(row.lifetimeSpend);
  const flow30d = row.spend30d === null
    ? '—'
    : (Math.round(row.spend30d) > 0 ? '+' : '') + formatWholeDollars(row.spend30d);
  const hasMessage = row.lastMessagePreview !== '' || row.lastModelMessageAt !== null || row.lastFanMessageAt !== null;
  return (
    <button
      type="button"
      onClick={() => onOpen(row.fanId)}
      data-spender-fan={row.fanId}
      aria-label={t('sp.openPreviewFor', { name: row.name })}
      className={cx(
        'relative grid w-full cursor-pointer items-center border-b border-line py-[11px] text-left',
        columns ? 'spender-columns' : 'grid-cols-[minmax(0,1fr)_auto] gap-[11px] px-4',
        active ? 'bg-bg2' : 'bg-bg1 hover:bg-bg2',
      )}
    >
      {active && <span className="absolute top-0 bottom-0 left-0 w-[3px] bg-clay" />}
      <span className="flex min-w-0 items-center gap-2.5">
        <Avatar name={row.name} url={row.avatarUrl} online={online} size={columns ? 32 : 40} radius={columns ? 9 : 11} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="min-w-0 truncate text-[14px] font-semibold">{row.name}</span>
            {!columns && row.fanWaiting && (
              <span title={t('sp.stats.waiting')} className="h-[7px] w-[7px] flex-none rounded-full bg-clay" />
            )}
            <span title={t('sp.lifetimeSpend')} className="num flex-none text-[11px] text-ink-mid">
              {lifetime}
            </span>
          </span>
          <span className="mt-[2px] flex min-w-0 items-baseline gap-1 text-[13px]">
            {hasMessage && (
              <span className="flex-none font-medium text-ink-mid">
                {row.lastMessageIsSentByMe ? t('sp.authorUs') : t('sp.authorFan')}
              </span>
            )}
            <span className="min-w-0 truncate text-ink-mid">
              {row.lastMessagePreview || t(hasMessage ? 'sp.messageWithoutText' : 'sp.noThreadYet')}
            </span>
          </span>
        </span>
      </span>
      {columns ? (
        <>
          <span title={t('sp.spend30d')} className={cx('num text-right text-[12px] whitespace-nowrap', row.spend30d !== null && row.spend30d > 0 ? 'font-medium text-green' : 'text-ink-low')}>
            {flow30d}
          </span>
          <span className="spender-age text-center text-[16px] font-medium whitespace-nowrap tabular-nums">
            <ContactAge at={row.lastModelMessageAt} now={now} label={t('sp.modelWrote')} t={t} />
          </span>
          <span className="spender-age text-center text-[16px] font-medium whitespace-nowrap tabular-nums">
            <ContactAge at={row.lastFanMessageAt} now={now} label={t('sp.fanWrote')} t={t} />
          </span>
        </>
      ) : (
        <span className="flex flex-col items-end gap-1 whitespace-nowrap">
          <span className="num min-h-[13px] text-[10px] font-semibold text-green">
            {row.spend30d !== null && row.spend30d > 0 ? flow30d : ''}
          </span>
          <span className="num text-[9.5px] font-semibold tracking-[0.05em] text-online">{onlineLabel}</span>
        </span>
      )}
    </button>
  );
});
