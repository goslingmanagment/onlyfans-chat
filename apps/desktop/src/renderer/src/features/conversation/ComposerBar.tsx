// P1 composer: read-only shell with an explicit reason (honesty over fake
// affordances, PRD §7.3). NO send path exists in this phase — the textarea and
// Send stay disabled; the AI dock later reuses DraftTextarea in place.

import { useState } from 'react';
import { Button } from '../../design/Button';
import { Kbd } from '../../design/Kbd';
import { DraftTextarea } from './DraftTextarea';
import { COMPOSER_TEXTAREA_ID } from '../../app/KeymapProvider';

export function ComposerBar({ personaName }: { personaName: string }): React.JSX.Element {
  const [draft, setDraft] = useState('');

  return (
    <div className="mx-[18px] mt-[9px] mb-[14px] flex-none rounded-card border border-line-strong bg-bg1 px-[14px] pt-3 pb-[10px] shadow-soft">
      <DraftTextarea
        id={COMPOSER_TEXTAREA_ID}
        value={draft}
        onChange={setDraft}
        placeholder={`Reply as ${personaName}…`}
        disabled
      />
      <div className="mt-[7px] flex items-center gap-[11px]">
        <span className="num text-micro tracking-[0.08em] text-ink-low">
          SENDING ARRIVES IN P3 — COMPANION MODE
        </span>
        <span className="ml-auto" />
        <Button variant="primary" disabled title="Sending arrives in P3 — companion mode">
          Send <Kbd>⌘↵</Kbd>
        </Button>
      </div>
    </div>
  );
}
