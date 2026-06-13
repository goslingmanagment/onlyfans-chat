// Row renderers for the virtualized thread: day dividers, tip ledger rows,
// message bubbles (asymmetric corners, PPV chips, media, reply-to, tombstones,
// send-state mono labels per DESIGN §4, hover unsend with inline confirm).

import { memo, useState } from 'react';
import type { MessageVM } from '../../../../preload/contract';
import { cx } from '../../lib/cx';
import { formatClock } from '../../lib/time';
import { formatLedgerAmount } from '../../lib/money';
import { canUnsend, mediaCountLabel, ppvChip, sendState } from '../../lib/messages';
import { Badge } from '../../design/Badge';
import { getBridge } from '../../bridge/bridge';
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
  accountId,
}: {
  message: MessageVM;
  accountId: string;
}): React.JSX.Element {
  // two-step inline confirm for unsend — no modal in the shift loop (DESIGN §4)
  const [confirmUnsend, setConfirmUnsend] = useState(false);
  const me = message.isSentByMe;
  const state = sendState(message);
  const chip = ppvChip(message);
  const isPpv = chip !== null;
  const lockedMedia = message.media.filter((m) => m.locked);
  const visibleMedia = message.media.filter((m) => !m.locked);
  const unsendable = canUnsend(message, new Date());

  function unsend(): void {
    setConfirmUnsend(false);
    void getBridge().invoke('cmd:message.unsend', {
      accountId,
      chatId: message.chatId,
      messageId: message.id,
    });
  }

  return (
    <div className={cx('group flex py-1', me ? 'justify-end' : 'justify-start')}>
      <div className={cx('max-w-[68%]', me && 'flex flex-col items-end')}>
        <div
          className={cx(
            // max-w-full: a long nowrap reply-quote must not inflate the bubble past its wrapper
            'max-w-full rounded-bubble border text-msg',
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
                <div className="media-stripes relative flex h-[124px] items-center justify-center border-b border-line">
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
                  <div className="mb-1.5 flex items-baseline gap-1.5 border-l-2 border-clay-line pl-2 text-[12px] text-ink-low">
                    <span className="cap">{message.replyTo.sender}</span>
                    <span className="min-w-0 truncate">{message.replyTo.textPreview}</span>
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
          {/* the SEEN label carries the clock (DESIGN §4: 'SEEN 18:42') — no duplicate time */}
          {(state === null || state.kind !== 'seen') && (
            <span>{formatClock(new Date(message.createdAt))}</span>
          )}
          {state !== null && (
            <span className={state.kind === 'seen' ? 'text-seen' : 'text-ink-low'}>{state.label}</span>
          )}
          {unsendable &&
            (confirmUnsend ? (
              <span className="flex items-baseline gap-1.5">
                <span className="text-bad">UNSEND?</span>
                <button
                  type="button"
                  onClick={unsend}
                  className="cursor-pointer font-semibold text-bad hover:underline"
                >
                  yes
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmUnsend(false)}
                  className="cursor-pointer hover:text-ink-mid"
                >
                  keep
                </button>
              </span>
            ) : (
              <button
                type="button"
                title="Unsend (removes the message for the fan — works for 24 h)"
                onClick={() => setConfirmUnsend(true)}
                className="cursor-pointer opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:text-bad"
              >
                unsend
              </button>
            ))}
        </div>
      </div>
    </div>
  );
});
