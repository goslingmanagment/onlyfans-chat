import { MessageActions } from './ConversationActions';
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
import { useLocale, useT } from '../../lib/i18n';
import { useUiStore } from '../../state/uiStore';

export const DayDivider = memo(function DayDivider({ label }: { label: string }): React.JSX.Element {
  return (
    <div className="my-[var(--cv-day-my)] flex items-center gap-3 py-2">
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
  const t = useT();
  return (
    <div className="my-[10px] flex justify-center">
      <div className="flex max-w-[80%] items-center gap-2.5 rounded-full border border-green-line bg-green-bg px-[14px] py-[5px]">
        <span className="num text-[13px] font-semibold text-green">
          {formatLedgerAmount(message.tipAmount ?? 0)}
        </span>
        <span className="text-[12px] text-ink-mid">{t('conv.tipFrom', { name: fanName })}</span>
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
  const t = useT();
  const locale = useLocale();
  // two-step inline confirm for unsend — no modal in the shift loop (DESIGN §4)
  const [confirmUnsend, setConfirmUnsend] = useState(false);
  const me = message.isSentByMe;
  const state = sendState(message);
  const chip = ppvChip(message, t);
  const isPpv = chip !== null;
  const hasMedia = message.media.length > 0;
  const unsendable = canUnsend(message, new Date());

  function unsend(): void {
    setConfirmUnsend(false);
    void getBridge()
      .invoke('cmd:message.unsend', {
        accountId,
        chatId: message.chatId,
        messageId: message.id,
      })
      .catch((error: unknown) => {
        useUiStore.getState().pushToast({
          title: t('conv.unsendFailed'),
          body:
            error instanceof Error && error.message.trim() !== ''
              ? error.message
              : t('conv.unsendTryAgain'),
          accountId,
          chatId: message.chatId,
        });
      });
  }

  return (
    <div className={cx('group flex py-[var(--cv-row-py)]', me ? 'justify-end' : 'justify-start')}>
      <div className={cx('max-w-[68%]', me && 'flex flex-col items-end')}>
        <div
          className={cx(
            // max-w-full: a long nowrap reply-quote must not inflate the bubble past its wrapper
            'max-w-full rounded-bubble border text-[length:var(--cv-bubble-fs)]',
            me
              ? 'rounded-br-flat border-bubble-me-line bg-bubble-me'
              : 'rounded-bl-flat border-line bg-bg1',
            isPpv
              ? 'w-[312px] overflow-hidden p-0'
              : 'px-[var(--cv-bubble-px)] py-[var(--cv-bubble-py)]',
          )}
        >
          {message.deleted ? (
            <span className="text-[13px] text-ink-low italic">{t('conv.messageDeleted')}</span>
          ) : (
            <>
              <div className={cx(isPpv && 'px-[var(--cv-bubble-px)] py-[var(--cv-bubble-py)]')}>
                {message.replyTo !== null && (
                  <div className="mb-1.5 flex items-baseline gap-1.5 border-l-2 border-clay-line pl-2 text-[12px] text-ink-low">
                    <span className="cap">{message.replyTo.sender}</span>
                    <span className="min-w-0 truncate">{message.replyTo.textPreview}</span>
                  </div>
                )}
                {hasMedia && (
                  <div
                    className={cx(
                      'flex w-fit max-w-full items-center rounded-chip border border-line bg-bg2 px-2.5 py-1',
                      message.text !== '' && 'mb-2',
                    )}
                    aria-label={mediaCountLabel(message.media, locale)}
                  >
                    <span className="num truncate text-micro tracking-[0.08em] text-ink-mid">
                      {mediaCountLabel(message.media, locale)}
                    </span>
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
            'num mt-[var(--cv-meta-mt)] flex items-baseline gap-2 text-micro tracking-[0.07em] text-ink-low',
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
          {!message.deleted&&<MessageActions accountId={accountId} chatId={message.chatId} messageId={message.id}/>}
          {unsendable &&
            (confirmUnsend ? (
              <span className="flex items-baseline gap-1.5">
                <span className="text-bad">UNSEND?</span>
                <button
                  type="button"
                  onClick={unsend}
                  className="cursor-pointer font-semibold text-bad hover:underline"
                >
                  {t('conv.unsendYes')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmUnsend(false)}
                  className="cursor-pointer hover:text-ink-mid"
                >
                  {t('conv.unsendKeep')}
                </button>
              </span>
            ) : (
              <button
                type="button"
                title={t('conv.unsendTooltip')}
                onClick={() => setConfirmUnsend(true)}
                className="cursor-pointer opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:text-bad"
              >
                {t('conv.unsend')}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
});
