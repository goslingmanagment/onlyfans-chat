import { useUiStore } from '../state/uiStore';
import { useAccounts } from '../bridge/queries';
import { Kbd } from '../design/Kbd';

export function Titlebar(): React.JSX.Element {
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
  const selectedAccountId = useUiStore((s) => s.selectedAccountId);
  const accounts = useAccounts();
  const account = accounts.data?.find((a) => a.id === selectedAccountId) ?? null;

  return (
    <header className="flex h-[46px] flex-none items-center gap-3.5 border-b border-line bg-bg1 px-4">
      <div className="font-serif text-[17px] font-semibold tracking-[-0.01em]">
        Chat<span className="text-clay">Goose</span>
      </div>
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="ml-[18px] flex h-[30px] w-[400px] flex-none cursor-pointer items-center gap-2 rounded-full border border-line-strong bg-bg1 px-3 text-[13px] text-ink-low hover:border-clay-line"
      >
        ⌕<span className="flex-1 text-left">Jump to chat, fan or action…</span>
        <Kbd>⌘K</Kbd>
      </button>
      <div className="ml-auto flex items-center gap-3">
        {account !== null && (
          <span className="num rounded-full border border-line-strong bg-bg1 px-[10px] py-[3px] text-micro tracking-[0.1em] text-ink-mid uppercase">
            {account.displayName}
            {!account.isAuthenticated && <span className="ml-1.5 text-bad">· RE-AUTH</span>}
          </span>
        )}
        <span className="cap text-ink-low">companion mode</span>
      </div>
    </header>
  );
}
