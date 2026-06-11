// P3 composer: the real send surface (SPEC §7). ⌘↵ / the terracotta button
// split the draft on [NEXT] into a send sequence; a live multi-part sequence
// shows an inline cancel chip; when the platform blocks messaging the whole
// composer is disabled with the platform's reason (SPEC §7.0).

import { useEffect, useMemo, useRef } from 'react';
import type { ChatListItemVM } from '../../../../preload/contract';
import { Button } from '../../design/Button';
import { Kbd } from '../../design/Kbd';
import { getBridge } from '../../bridge/bridge';
import { useOutbox } from '../../bridge/queries';
import { DraftTextarea } from './DraftTextarea';
import { COMPOSER_TEXTAREA_ID } from './composerDom';
import { useAiStore, setDraftText } from '../ai/aiStore';
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

  const canSend = chat.canSendMessage;
  const blank = draft.trim().length === 0;
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
            ? `Reply as ${personaName}… (⌘R fast reply · ⌘I improve draft · [NEXT] splits parts)`
            : cannotReason
        }
      />
      <div className="mt-[7px] flex items-center gap-[11px]">
        {!canSend ? (
          <span className="num text-micro tracking-[0.08em] text-warn">{cannotReason}</span>
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
          disabled={!canSend || blank}
          title={canSend ? 'Send (⌘↵) — [NEXT] splits into separate messages' : cannotReason}
          onClick={onSend}
        >
          Send <Kbd>⌘↵</Kbd>
        </Button>
      </div>
    </div>
  );
}
