// P2 composer: typing is enabled — the draft feeds Improve Draft (⌘I) and the
// chatter pastes into OnlyMonster (companion mode). NO send path exists in this
// phase — Send stays disabled with an explicit reason (PRD §7.3 honesty).

import { Button } from '../../design/Button';
import { Kbd } from '../../design/Kbd';
import { DraftTextarea } from './DraftTextarea';
import { COMPOSER_TEXTAREA_ID } from '../../app/KeymapProvider';
import { useAiStore, setDraftText } from '../ai/aiStore';

export function ComposerBar({ personaName }: { personaName: string }): React.JSX.Element {
  const draft = useAiStore((s) => s.draftText);

  return (
    <div className="mx-[18px] mt-[9px] mb-[14px] flex-none rounded-card border border-line-strong bg-bg1 px-[14px] pt-3 pb-[10px] shadow-soft">
      <DraftTextarea
        id={COMPOSER_TEXTAREA_ID}
        value={draft}
        onChange={setDraftText}
        placeholder={`Reply as ${personaName}… (⌘R fast reply · ⌘I improve draft · ⌘H help me)`}
      />
      <div className="mt-[7px] flex items-center gap-[11px]">
        <span className="num text-micro tracking-[0.08em] text-ink-low">
          SENDING ARRIVES IN P3 — COMPANION MODE · COPY DRAFTS INTO ONLYMONSTER
        </span>
        <span className="ml-auto" />
        <Button variant="primary" disabled title="Sending arrives in P3 — companion mode">
          Send <Kbd>⌘↵</Kbd>
        </Button>
      </div>
    </div>
  );
}
