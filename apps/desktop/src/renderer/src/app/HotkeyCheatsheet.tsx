import { useUiStore } from '../state/uiStore';
import { CHEATSHEET_EXTRAS, KEY_BINDINGS, UPCOMING_BINDINGS } from './keymapBindings';
import { Kbd } from '../design/Kbd';

export function HotkeyCheatsheet(): React.JSX.Element | null {
  const open = useUiStore((s) => s.cheatsheetOpen);
  const setOpen = useUiStore((s) => s.setCheatsheetOpen);
  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-ink/20"
      onMouseDown={() => setOpen(false)}
    >
      <div
        className="w-[520px] rounded-menu border border-line-strong bg-bg1 p-5 shadow-pop"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-serif text-[17px] font-semibold">Keyboard shortcuts</h2>
          <span className="text-micro text-ink-low">
            <Kbd>?</Kbd> or <Kbd>esc</Kbd> to close
          </span>
        </div>
        <div className="space-y-1.5">
          {KEY_BINDINGS.filter((b) => b.hideFromCheatsheet !== true).map((b) => (
            <div key={b.action} className="flex items-center justify-between py-[3px] text-[12.5px]">
              <span className="text-ink-mid">{b.description}</span>
              <Kbd>{b.label}</Kbd>
            </div>
          ))}
          {CHEATSHEET_EXTRAS.map((b) => (
            <div key={b.label} className="flex items-center justify-between py-[3px] text-[12.5px]">
              <span className="text-ink-mid">{b.description}</span>
              <Kbd>{b.label}</Kbd>
            </div>
          ))}
        </div>
        {UPCOMING_BINDINGS.length > 0 && (
          <>
            <div className="cap mt-4 mb-1.5 text-ink-low">Coming with later phases</div>
            <div className="space-y-1.5 opacity-50">
              {UPCOMING_BINDINGS.map((b) => (
                <div key={b.label} className="flex items-center justify-between py-[3px] text-[12.5px]">
                  <span className="text-ink-mid">
                    {b.description} <span className="num text-micro text-ink-low">{b.phase}</span>
                  </span>
                  <Kbd>{b.label}</Kbd>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
