// ✳ AI menu in the conversation header (DESIGN §1 tier 2): rare/deep actions
// only — Scan / Chat review / Compare. All dimmed in P2 (arrive in P4).

import { useEffect, useRef, useState } from 'react';
import { Kbd } from '../../design/Kbd';

function MenuItem({
  glyph,
  title,
  sub,
  kbd,
}: {
  glyph: string;
  title: string;
  sub: string;
  kbd?: string;
}): React.JSX.Element {
  return (
    <div
      title="Arrives in P4"
      className="flex items-center gap-2.5 rounded-chip px-2.5 py-2 opacity-45"
    >
      <span className="w-4 flex-none text-center text-[12px] text-clay">{glyph}</span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
          {title}
          <span className="num text-micro text-ink-low">P4</span>
        </span>
        <span className="mt-px block text-[10.5px] text-ink-low">{sub}</span>
      </span>
      {kbd !== undefined && (
        <span className="ml-auto">
          <Kbd>{kbd}</Kbd>
        </span>
      )}
    </div>
  );
}

export function AiHeaderMenu(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent): void {
      if (rootRef.current !== null && e.target instanceof Node && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex cursor-pointer items-center gap-[7px] rounded-full border border-line bg-bg2 px-[13px] py-1 text-[12.5px] font-semibold text-ink-mid transition-colors duration-150 hover:border-clay-line hover:bg-clay-bg hover:text-clay-deep"
      >
        <i className="not-italic text-clay">✳</i> AI <span className="text-[10px]">▾</span>
      </button>
      {open && (
        <div className="absolute top-[calc(100%+8px)] right-0 z-40 w-[264px] rounded-menu border border-line-strong bg-bg1 p-1.5 shadow-pop">
          <MenuItem glyph="◎" title="Scan" sub="deep fan profile → panel · Scan tab" kbd="⌘S" />
          <MenuItem glyph="▤" title="Chat review" sub="score this conversation 1–10, find mistakes" kbd="⌘E" />
          <div className="my-1 h-px bg-line" />
          <MenuItem glyph="⇄" title="Compare" sub="one reply, several personas side-by-side" />
        </div>
      )}
    </div>
  );
}
