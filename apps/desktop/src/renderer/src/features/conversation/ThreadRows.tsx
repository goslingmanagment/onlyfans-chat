// Row renderers for the virtualized thread: day dividers, tip ledger rows,
// message bubbles (asymmetric corners, PPV chips, media, reply-to, tombstones).

import { memo } from 'react';
import type { MessageVM } from '../../../../preload/contract';
import { cx } from '../../lib/cx';
import { formatClock } from '../../lib/time';
import { formatLedgerAmount } from '../../lib/money';
import { mediaCountLabel, ppvChip, sendState } from '../../lib/messages';
import { Badge } from '../../design/Badge';
import { MediaThumb } from './MediaThumb';

export const DayDivider = memo(function DayDivider({ label }: { label: string }): React.JSX.Element {
  return (
    <div className="my-2 flex items-center gap-3 py-2">
      <span className="h-px flex-1 bg-line-strong" />
      <span className="num text-micro tracking-[0.12em] text-ink-low">{label}</span>
      <span className="h-px flex-1 bg-line-strong" />
    </div>
  );
});

/** Money event as a ledger row (DESIGN §4: money = financial green). */
export const TipLedgerRow = memo(function TipLedgerRow({
  message,
  fanName,
}: {
  message: MessageVM;
  fanName: string;
}): React.JSX.Element {
  return (
    <div className="my-[10px] flex justify-center">
      <div className="flex max-w-[80%] items-center gap-2.5 rounded-full border border-green-line bg-green-bg px-[14px] py-[5px]">
        <span className="num text-[13px] font-semibold text-green">
          {formatLedgerAmount(message.tipAmount ?? 0)}
        </span>
        <span className="text-[12px] text-ink-mid">tip from {fanName}</span>
        {message.tipText !== null && message.tipText !== '' && (
          <span className="truncate text-[12px] text-ink-mid">“{message.tipText}”</span>
        )}
        <span className="num text-micro text-ink-low">{formatClock(new Date(message.createdAt))}</span>
      </div>
    </div>
  );
});

export const MessageRow = memo(function MessageRow({
  message,
}: {
  message: MessageVM;
}): React.JSX.Element {
  const me = message.isSentByMe;
  const state = sendState(message);
  const chip = ppvChip(message);
  const isPpv = chip !== null;
  const lockedMedia = message.media.filter((m) => m.locked);
  const visibleMedia = message.media.filter((m) => !m.locked);

  return (
    <div className={cx('flex py-1', me ? 'justify-end' : 'justify-start')}>
      <div className={cx('max-w-[68%]', me && 'flex flex-col items-end')}>
        <div
          className={cx(
            'rounded-bubble border text-msg',
            me
              ? 'rounded-br-flat border-bubble-me-line bg-bubble-me'
              : 'rounded-bl-flat border-line bg-bg1',
            isPpv ? 'w-[312px] overflow-hidden p-0' : 'px-[14px] py-[10px]',
          )}
        >
          {message.deleted ? (
            <span className="text-[13px] text-ink-low italic">message deleted</span>
          ) : (
            <>
              {/* PPV locked-media strip */}
              {isPpv && lockedMedia.length > 0 && (
                <div className="relative flex h-[124px] items-center justify-center border-b border-line bg-[repeating-linear-gradient(135deg,#eae4d6_0_12px,#e3dccb_12px_24px)]">
                  <span className="text-[17px] opacity-50">
                    {chip.state === 'purchased' ? '🔓' : '🔒'}
                  </span>
                  <span className="num absolute right-[9px] bottom-2 rounded-[5px] border border-line bg-bg1/90 px-[7px] py-[2px] text-micro text-ink-mid">
                    {mediaCountLabel(message.media)}
                  </span>
                </div>
              )}
              <div className={cx(isPpv && 'px-[14px] py-[10px]')}>
                {message.replyTo !== null && (
                  <div className="mb-1.5 border-l-2 border-clay-line pl-2 text-[12px] text-ink-low">
                    <span className="cap mr-1.5">{message.replyTo.sender}</span>
                    <span className="truncate">{message.replyTo.textPreview}</span>
                  </div>
                )}
                {visibleMedia.length > 0 && (
                  <div className={cx('flex flex-wrap gap-1.5', message.text !== '' && 'mb-2')}>
                    {visibleMedia.map((m) => (
                      <MediaThumb key={m.id} media={m} />
                    ))}
                  </div>
                )}
                {message.text !== '' && <span className="break-words whitespace-pre-wrap">{message.text}</span>}
                {/* PPV state — unmissable (PRD F3) */}
                {chip !== null && (
                  <div className="mt-2 flex items-center gap-2">
                    <Badge tone={chip.tone === 'green' ? 'green-filled' : chip.tone === 'amber' ? 'amber' : 'neutral'} mono>
                      {chip.label}
                    </Badge>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <div
          className={cx(
            'num mt-1 flex items-baseline gap-2 text-micro tracking-[0.07em] text-ink-low',
            me && 'justify-end',
          )}
        >
          <span>{formatClock(new Date(message.createdAt))}</span>
          {state !== null && (
            <span className={state.tone === 'seen' ? 'text-seen' : 'text-ink-low'}>{state.label}</span>
          )}
        </div>
      </div>
    </div>
  );
});
