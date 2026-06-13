// Reply split-menu (DESIGN §1, variant C): the ▾ caret on the Reply pill opens
// this upward-popover tone picker. Picking a tone IMMEDIATELY starts a toned
// fast-reply (one click = one generation, no wasted "normal" run) — the parent
// wires onSelectTone to aiStore.activateToneFromMenu. Pure view: open/close
// state and the active tone live in aiStore; this only renders + reports clicks.
// Esc + outside-click close (the parent owns the ref boundary so the caret
// toggle is inside it). Opens upward because the pill row sits near the window
// bottom. Animation is transform/opacity only and motion-safe (DESIGN §3.8).

import { useEffect } from 'react';
import { cx } from '../../lib/cx';
import { buildToneMenuItems, type DockTone } from './dockLogic';

export function TonePopover({
  isOpen,
  activeTone,
  onSelectTone,
  onClose,
}: {
  isOpen: boolean;
  activeTone: DockTone;
  /** Picks the tone AND starts a fast-reply in it; the parent also closes the menu. */
  onSelectTone: (tone: DockTone) => void;
  onClose: () => void;
}): React.JSX.Element | null {
  // Esc closes the menu only (the global Esc → dismissDock path stays separate;
  // both are idempotent, so an open dock + open menu close cleanly either way).
  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  const items = buildToneMenuItems(activeTone);
  return (
    <div
      role="menu"
      aria-label="Reply tone"
      className={cx(
        'absolute bottom-[calc(100%+8px)] left-0 z-40 w-[148px] rounded-menu border border-line-strong bg-bg1 p-1.5 shadow-pop',
        'origin-bottom motion-safe:animate-[tone-pop_120ms_ease-out]',
      )}
    >
      <div className="cap px-2 pt-0.5 pb-1 font-sans text-ink-low">Tone</div>
      {items.map((item) => (
        <button
          key={item.tone}
          type="button"
          role="menuitemradio"
          aria-checked={item.active}
          // Tone names are product terms — stay English in both locales
          // (CLAUDE.md §32). Do not localize.
          onClick={() => onSelectTone(item.tone)}
          className={cx(
            'flex w-full cursor-pointer items-center gap-2 rounded-chip px-2.5 py-[7px] text-left text-[13px] font-medium transition-colors duration-150',
            item.active ? 'text-clay-deep' : 'text-ink-mid hover:bg-clay-bg hover:text-clay-deep',
          )}
        >
          <span className={cx('w-3 flex-none text-center text-[11px]', item.active ? 'text-clay' : 'text-transparent')}>
            ✓
          </span>
          {item.tone}
        </button>
      ))}
    </div>
  );
}
