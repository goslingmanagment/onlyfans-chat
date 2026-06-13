// P3 composer: the real send surface (SPEC §7). ⌘↵ / the terracotta button
// split the draft on [NEXT] into a send sequence; a live multi-part sequence
// shows an inline cancel chip; when the platform blocks messaging the whole
// composer is disabled with the platform's reason (SPEC §7.0).

import { useEffect, useMemo, useRef } from 'react';
import type { ChatListItemVM } from '../../../../preload/contract';
import { Button } from '../../design/Button';
import { Kbd } from '../../design/Kbd';
import { modCombo } from '../../lib/modKey';
import { getBridge } from '../../bridge/bridge';
import { useOutbox } from '../../bridge/queries';
import { DraftTextarea } from './DraftTextarea';
import { COMPOSER_TEXTAREA_ID } from './composerDom';
import { useAiStore, setDraftText } from '../ai/aiStore';
import { useVaultStore } from '../vault/vaultStore';
import { sendCurrentDraft } from './sendController';
import { activeSequence, createTypingThrottle, CANNOT_SEND_FALLBACK } from './sendLogic';

export function ComposerBar({
  accountId,
  chat,
  personaName,
}: {
  accountId: string;
  chat: ChatListItemVM;
  personaName: string;
}): React.JSX.Element {
  const draft = useAiStore((s) => s.draftText);
  const outbox = useOutbox(accountId, chat.chatId);
  const outboxItems = outbox.data;
  const sequence = useMemo(() => activeSequence(outboxItems ?? []), [outboxItems]);
  const vaultOpen = useVaultStore((s) => s.open);
  const setVaultOpen = useVaultStore((s) => s.setOpen);
  const attachedCount = useVaultStore((s) => s.selection.ids.length);

  const canSend = chat.canSendMessage;
  const blank = draft.trim().length === 0;
  // With vault media attached, the draft IS the PPV caption — plain send is
  // parked so the caption can't accidentally go out as a bare text message;
  // the PPV summary strip owns the explicit confirm (PRD F7 misprice guard).
  const ppvComposeActive = attachedCount > 0;
  const cannotReason = chat.canNotSendReason ?? CANNOT_SEND_FALLBACK;

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
      <DraftTextarea
        id={COMPOSER_TEXTAREA_ID}
        value={draft}
        onChange={onDraftChange}
        disabled={!canSend}
        placeholder={
          canSend
            ? `Reply as ${personaName}… (${modCombo('R')} fast reply · ${modCombo('I')} improve draft · [NEXT] splits parts)`
            : cannotReason
        }
      />
      <div className="mt-[7px] flex items-center gap-[11px]">
        <button
          type="button"
          onClick={() => setVaultOpen(!vaultOpen)}
          disabled={!canSend}
          title={canSend ? 'Attach vault media (PPV)' : cannotReason}
          className={
            'flex cursor-pointer items-center gap-1 rounded-chip border px-2 py-0.5 text-[12.5px] transition-colors disabled:cursor-default disabled:opacity-45 ' +
            (vaultOpen || attachedCount > 0
              ? 'border-clay-line bg-clay-bg text-clay-deep'
              : 'border-line bg-bg2 text-ink-mid hover:border-clay-line hover:text-clay-deep')
          }
        >
          📎{attachedCount > 0 && <span className="num font-bold">{attachedCount}</span>}
        </button>
        {!canSend ? (
          <span className="num text-micro tracking-[0.08em] text-warn">{cannotReason}</span>
        ) : ppvComposeActive ? (
          <span className="num text-micro tracking-[0.08em] text-ink-mid">
            PPV compose — the draft is the caption · confirm in the vault strip above
          </span>
        ) : sequence !== null ? (
          <span className="num flex items-baseline gap-2 text-micro tracking-[0.08em] text-ink-mid">
            {sequence.totalParts} parts · sending with natural delays ·
            <button
              type="button"
              onClick={cancelSequence}
              className="cursor-pointer font-semibold text-bad underline decoration-dotted underline-offset-2"
            >
              Cancel
            </button>
          </span>
        ) : null}
        <span className="ml-auto" />
        <Button
          variant="primary"
          disabled={!canSend || blank || ppvComposeActive}
          title={
            !canSend
              ? cannotReason
              : ppvComposeActive
                ? 'Vault media attached — use the PPV confirm button in the vault panel'
                : `Send (${modCombo('↵')}) — [NEXT] splits into separate messages`
          }
          onClick={onSend}
        >
          Send <Kbd>{modCombo('↵')}</Kbd>
        </Button>
      </div>
    </div>
  );
}
