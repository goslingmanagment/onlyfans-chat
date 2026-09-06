// P3 composer: the real send surface (SPEC §7). ⌘↵ / the terracotta button
// split the draft on [NEXT] into a send sequence; a live multi-part sequence
// shows an inline cancel chip; when the platform blocks messaging the whole
// composer is disabled with the platform's reason (SPEC §7.0).

import { useEffect, useMemo, useRef, useState } from 'react';
import { ComposerOptions } from './ComposerOptions';
import { pendingComposerRows, useComposerStore } from './composerStore';
import type { ChatListItemVM } from '../../../../preload/contract';
import type { GuardCategory, GuardVerdict } from '@chatgoose/shared/message-guard/index';
import { Button } from '../../design/Button';
import { Kbd } from '../../design/Kbd';
import { modCombo } from '../../lib/modKey';
import { getBridge } from '../../bridge/bridge';
import { useGuardConfig, useOutbox } from '../../bridge/queries';
import { DraftTextarea } from './DraftTextarea';
import { COMPOSER_TEXTAREA_ID } from './composerDom';
import { useAiStore, setDraftText } from '../ai/aiStore';
import { useVaultStore } from '../vault/vaultStore';
import { sendCurrentDraft } from './sendController';
import { activeSequence, createTypingThrottle } from './sendLogic';
import {
  compileRendererGuardPolicy,
  scanDraftForDisplay,
  setCurrentGuardState,
  verdictBlocks,
  verdictCategories,
  verdictToSegments,
} from './guardLogic';
import { useLocale, useT } from '../../lib/i18n';
import { pluralWord } from '@chatgoose/shared/i18n/index';

export function ComposerBar({
  accountId,
  chat,
  personaName,
  showVault = true,
}: {
  accountId: string;
  chat: ChatListItemVM;
  personaName: string;
  showVault?: boolean;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const draft = useAiStore((s) => s.draftText);
  const outbox = useOutbox(accountId, chat.chatId);
  const guardConfig = useGuardConfig();
  const [guardVerdict, setGuardVerdict] = useState<GuardVerdict | null>(null);
  const guardState = useMemo(
    () => compileRendererGuardPolicy(guardConfig.data ?? null),
    [guardConfig.data],
  );
  const outboxItems = outbox.data;
  useEffect(()=>{
    for(const row of outboxItems??[]){
      if(!pendingComposerRows.has(row.localId)||!['sent','failed','cancelled'].includes(row.state))continue;
      pendingComposerRows.delete(row.localId);
      if(row.state==='failed' && row.composer && !useAiStore.getState().draftText){
        setDraftText(row.text);useComposerStore.getState().set(row.composer);
        if(row.mediaCount)useVaultStore.setState({selection:{ids:(row.mediaFiles??[]).map(String),previews:(row.previews??[]).map(String)},priceInput:(row.composer.priceCents/100).toFixed(2),open:true});
      }
    }
  },[outboxItems]);
  const sequence = useMemo(() => activeSequence(outboxItems ?? []), [outboxItems]);
  const vaultOpen = useVaultStore((s) => s.open);
  const setVaultOpen = useVaultStore((s) => s.setOpen);
  const attachedCount = useVaultStore((s) => s.selection.ids.length);

  const canSend = chat.canSendMessage;
  const composer=useComposerStore(s=>s.options);
  const composerError=useComposerStore(s=>s.error);
  const blank = draft.trim().length === 0 && !composer.giphyId;
  // With vault media attached, the draft IS the PPV caption — plain send is
  // parked so the caption can't accidentally go out as a bare text message;
  // the PPV summary strip owns the explicit confirm (PRD F7 misprice guard).
  const ppvComposeActive = attachedCount > 0;
  const cannotReason = chat.canNotSendReason ?? t('conv.cannotSendFallback');
  const guardReady = guardState.kind === 'ready';
  const guardBlocked = !guardReady || verdictBlocks(guardVerdict);
  const guardSegments = useMemo(
    () => verdictToSegments(draft, guardVerdict),
    [draft, guardVerdict],
  );
  const guardCategories = verdictCategories(guardVerdict);

  function guardChipLabel(category: GuardCategory): string {
    switch (category) {
      case 'off_platform':
        return t('guard.chip.off_platform');
      case 'red':
        return t('guard.chip.red');
      case 'yellow':
        return t('guard.chip.yellow');
      case 'custom':
        return t('guard.chip.custom');
    }
  }

  useEffect(() => {
    setCurrentGuardState(guardState);
  }, [guardState]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setGuardVerdict(
        draft.length === 0 || guardState.kind !== 'ready'
          ? null
          : scanDraftForDisplay(guardState, draft),
      );
    }, draft.length === 0 || guardState.kind !== 'ready' ? 0 : 140);
    return () => clearTimeout(timer);
  }, [draft, guardState]);

  // typing-out beacon: ≤1 cmd:chat.typingActive / 3 s, session ends after 4 s idle (SPEC §7.8)
  const throttleRef = useRef(createTypingThrottle());
  useEffect(() => {
    throttleRef.current.reset();
  }, [accountId, chat.chatId]);

  function onDraftChange(text: string): void {
    setDraftText(text);
    if (canSend && throttleRef.current.activity(Date.now())) {
      void getBridge().invoke('cmd:chat.typingActive', { accountId, chatId: chat.chatId });
    }
  }

  function onSend(): void {
    sendCurrentDraft({ accountId, chatId: chat.chatId, canSend });
  }

  function cancelSequence(): void {
    if (sequence === null) return;
    void getBridge().invoke('cmd:send.cancelSequence', {
      accountId,
      sequenceId: sequence.sequenceId,
    });
  }

  return (
    <div className="mx-[18px] mt-[9px] mb-[14px] flex-none rounded-card border border-line-strong bg-bg1 px-[14px] pt-3 pb-[10px] shadow-soft">
      <ComposerOptions accountId={accountId} draft={draft}/>
      <DraftTextarea
        id={COMPOSER_TEXTAREA_ID}
        value={draft}
        onChange={onDraftChange}
        disabled={!canSend}
        guardSegments={guardSegments}
        placeholder={
          canSend
            ? t('conv.composerPlaceholder', { persona: personaName, r: modCombo('R'), i: modCombo('I') })
            : cannotReason
        }
      />
      <div className="mt-[7px] flex items-center gap-[11px]">
        {showVault && (
          <button
            type="button"
            onClick={() => setVaultOpen(!vaultOpen)}
            disabled={!canSend}
            title={canSend ? t('conv.attachVault') : cannotReason}
            className={
              'flex shrink-0 cursor-pointer items-center gap-1 rounded-chip border px-2 py-0.5 text-[12.5px] transition-colors disabled:cursor-default disabled:opacity-45 ' +
              (vaultOpen || attachedCount > 0
                ? 'border-clay-line bg-clay-bg text-clay-deep'
                : 'border-line bg-bg2 text-ink-mid hover:border-clay-line hover:text-clay-deep')
            }
          >
            📎{attachedCount > 0 && <span className="num font-bold">{attachedCount}</span>}
          </button>
        )}
        {!canSend ? (
          <span className="num min-w-0 truncate text-micro tracking-[0.08em] text-warn">{cannotReason}</span>
        ) : !guardReady && !guardConfig.isPending ? (
          <span className="num min-w-0 truncate text-micro tracking-[0.08em] text-bad">
            {t('guard.policyUnavailable')}
          </span>
        ) : guardVerdict?.decision === 'block' ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate text-[12.5px] text-bad">{t('guard.blockedBanner')}</span>
            {guardCategories.map((category) => (
              <span
                key={category}
                className="num rounded-full border border-bad/30 bg-bad/10 px-2 py-0.5 text-micro font-semibold text-bad"
              >
                {guardChipLabel(category)}
              </span>
            ))}
          </span>
        ) : ppvComposeActive ? (
          <span className="num min-w-0 truncate text-micro tracking-[0.08em] text-ink-mid">
            {t('conv.ppvComposeHint')}
          </span>
        ) : sequence !== null ? (
          <span className="num flex min-w-0 items-baseline gap-2 text-micro tracking-[0.08em] text-ink-mid">
            {t('conv.sequenceSending', {
              n: sequence.totalParts,
              word: pluralWord(locale, sequence.totalParts, ['part', 'parts'], ['часть', 'части', 'частей']),
            })}
            <button
              type="button"
              onClick={cancelSequence}
              className="cursor-pointer font-semibold text-bad underline decoration-dotted underline-offset-2"
            >
              {t('common.cancel')}
            </button>
          </span>
        ) : null}
        <span className="ml-auto" />
        <Button
          variant="primary"
          className="shrink-0"
          disabled={!canSend || blank || ppvComposeActive || guardBlocked || !!composerError}
          title={
            !canSend
              ? cannotReason
              : guardBlocked
                ? t('guard.sendBlockedTooltip')
              : ppvComposeActive
                ? t('conv.ppvUseConfirmBtn')
                : t('conv.sendTooltip', { combo: modCombo('↵') })
          }
          onClick={onSend}
        >
          {t('conv.send')} <Kbd>{modCombo('↵')}</Kbd>
        </Button>
      </div>
    </div>
  );
}
