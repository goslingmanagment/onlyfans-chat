// Optimistic send bubbles (SPEC §7): own-message styling + terminal mono
// micro-labels QUEUED / SENDING / FAILED / UNCONF (DESIGN §4). Failed rows
// offer Edit / Retry / Dismiss; unconfirmed rows offer Check now / Dismiss and
// NEVER a resend (SPEC §7.5 — resend is a manual new send only after checking).

import { memo, useCallback, useState } from 'react';
import { useComposerStore } from './composerStore';
import { useVaultStore } from '../vault/vaultStore';
import { useLocale } from '../../lib/i18n';
import type { OutboxItemVM } from '../../../../preload/contract';
import { cx } from '../../lib/cx';
import { formatClock } from '../../lib/time';
import { getBridge } from '../../bridge/bridge';
import { setDraftText, useAiStore } from '../ai/aiStore';
import { appendToDraft } from '../ai/dockLogic';
import { focusComposer } from './composerDom';
import {
  deriveOutboxRow,
  formatOutboxPpvPrefix,
  restrictedSegments,
  type OutboxRowView,
} from './sendLogic';
import { useT } from '../../lib/i18n';

const LABEL_TONES: Record<OutboxRowView['tone'], string> = {
  low: 'text-ink-low',
  bad: 'text-bad',
  warn: 'text-warn',
};

function RowAction({
  quiet = false,
  onClick,
  children,
}: {
  quiet?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'cursor-pointer underline decoration-dotted underline-offset-2',
        quiet ? 'text-ink-low hover:text-ink-mid' : 'text-clay-deep hover:text-clay',
      )}
    >
      {children}
    </button>
  );
}

export const OutboxRow = memo(function OutboxRow({
  accountId,
  item,
}: {
  accountId: string;
  item: OutboxItemVM;
}): React.JSX.Element | null {
  const t = useT();
  const ru=useLocale()==='ru';
  const [confirmRecovery,setConfirmRecovery]=useState(false);
  const [recoveryError,setRecoveryError]=useState<string|null>(null);
  const dismiss = useCallback(() => {
    void getBridge().invoke('cmd:send.dismiss', { accountId, localId: item.localId });
  }, [accountId, item.localId]);

  const view = deriveOutboxRow(item);
  if (view === null) return null;
  const segments = view.restrictedWords ? restrictedSegments(item.text, item.textHighlights) : null;
  const explainer = view.restrictedWords
    ? t('conv.restrictedWordsBanner')
    : view.explainerCode === 'unconfirmed'
      ? t('conv.unconfirmedExplainer')
      : view.explainerCode === 'recovery_refused'
        ? t('conv.recoveryRefusedExplainer', { reason: view.explainerMessage ?? 'unknown' })
        : view.explainerMessage;

  function retry(): void {
    void getBridge().invoke('cmd:send.retry', {
      accountId,
      localId: item.localId,
      text: item.text,
    });
  }

  function edit(): void {
    if (item.composer && (useAiStore.getState().draftText.trim() || useVaultStore.getState().selection.ids.length)) {
      setRecoveryError(ru ? 'Сначала сохраните или очистите текущий черновик.' : 'Save or clear the current draft first.');
      return;
    }
    // Restore a rich draft without merging its attachments into another draft.
    setDraftText(appendToDraft(useAiStore.getState().draftText, item.text));
    if(item.composer){useComposerStore.getState().reset();useComposerStore.getState().set(item.composer);
      useVaultStore.setState({selection:{ids:(item.mediaFiles??[]).map(String),previews:(item.previews??[]).map(String)},priceInput:(item.composer.priceCents/100).toFixed(2),open:!!item.mediaCount});}
    focusComposer();
    dismiss();
  }

  function recover():void {
    setConfirmRecovery(false);setRecoveryError(null);
    void getBridge().invoke('cmd:send.retry',{accountId,localId:item.localId,text:item.text,reuseProviderOperation:true})
      .catch(()=>setRecoveryError(ru?'Восстановление отклонено. Проверьте статус в Hub.':'Recovery refused. Check Hub command status.'));
  }
  function verify(): void {
    void getBridge().invoke('cmd:send.verifyNow', { accountId, chatId: item.chatId });
  }

  return (
    <div className="flex justify-end py-1">
      <div className="flex max-w-[68%] flex-col items-end">
        <div
          className={cx(
            'rounded-bubble rounded-br-flat border bg-bubble-me px-[14px] py-[10px] text-msg',
            view.label === 'FAILED'
              ? 'border-bad/40'
              : view.label === 'UNCONF'
                ? 'border-amber-line'
                : 'border-bubble-me-line opacity-80',
          )}
        >
          <span className="break-words whitespace-pre-wrap">
            {segments === null
              ? item.text
              : segments.map((segment, i) =>
                  segment.restricted ? (
                    <mark key={i} className="rounded-[3px] bg-bad/15 px-0.5 font-semibold text-bad">
                      {segment.text}
                    </mark>
                  ) : (
                    <span key={i}>{segment.text}</span>
                  ),
                )}
          </span>
        </div>
        <div className="num mt-1 flex items-baseline gap-2 text-micro tracking-[0.07em] text-ink-low">
          <span>{formatClock(new Date(item.createdAt))}</span>
          {item.mediaCount > 0 && (
            <span className={item.price > 0 ? 'font-semibold text-amber' : undefined}>
              {formatOutboxPpvPrefix(item.price)}
              {t('conv.mediaCount', { n: item.mediaCount })}
            </span>
          )}
          <span className={cx(LABEL_TONES[view.tone], view.pulse && 'animate-pulse')}>
            {view.label}
          </span>
        </div>
        {explainer !== null && (
          <div className={cx('mt-0.5 text-[12px]', view.label === 'FAILED' ? 'text-bad' : 'text-warn')}>
            {explainer}
          </div>
        )}
        {item.composer && (item.state==='failed'||item.state==='unconfirmed') && <div className="mt-1 text-[12px] text-warn">
          {confirmRecovery?<><p>{ru?'Повторить неизменную операцию с исходным ключом? Hub проверит срок и область. Отправка могла уже состояться.':'Recover the unchanged operation with its original key? Hub checks scope and expiry. Delivery may already have happened.'}</p><button type="button" onClick={recover} className="underline">{ru?'Восстановить неизменную':'Recover unchanged'}</button> · <button type="button" onClick={()=>setConfirmRecovery(false)}>{ru?'Отмена':'Cancel'}</button></>:<button type="button" className="underline" onClick={()=>setConfirmRecovery(true)}>{ru?'Восстановление с исходным ключом…':'Recover with original key…'}</button>}
          {recoveryError&&<p role="alert">{recoveryError}</p>}
        </div>}
        {view.actions.length > 0 && (
          <div className="mt-1 flex items-center gap-3 text-[12px] font-semibold">
            {view.actions.includes('edit') && <RowAction onClick={edit}>{t('conv.rowEdit')}</RowAction>}
            {view.actions.includes('retry') && <RowAction onClick={retry}>{t('conv.rowRetry')}</RowAction>}
            {view.actions.includes('verify') && <RowAction onClick={verify}>{t('conv.rowCheckNow')}</RowAction>}
            {view.actions.includes('dismiss') && (
              <RowAction quiet onClick={dismiss}>
                {t('toast.dismiss')}
              </RowAction>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
