import { useUiStore } from '../state/uiStore';
import { useAccounts } from '../bridge/queries';
import { Kbd } from '../design/Kbd';
import { modCombo } from '../lib/modKey';
import { useT } from '../lib/i18n';

export function Titlebar(): React.JSX.Element {
  const t = useT();
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
  const selectedAccountId = useUiStore((s) => s.selectedAccountId);
  const accounts = useAccounts();
  const account = accounts.data?.find((a) => a.id === selectedAccountId) ?? null;

  return (
    <header className="flex h-[46px] flex-none items-center gap-3.5 border-b border-line bg-bg1 px-4">
      <div className="shrink-0 font-serif text-[17px] font-semibold tracking-[-0.01em]">
        Chat<span className="text-clay">Goose</span>
      </div>
      {/* Search is the elastic member: flex-1 capped at 400px keeps its resting
          size at wide widths but lets it SHRINK (min-w-0 + truncated placeholder)
          under pressure instead of shoving the right-side badges off the edge. */}
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="ml-[18px] flex h-[30px] min-w-0 max-w-[400px] flex-1 cursor-pointer items-center gap-2 rounded-full border border-line-strong bg-bg1 px-3 text-[13px] text-ink-low hover:border-clay-line"
      >
        ⌕<span className="min-w-0 flex-1 truncate text-left">{t('palette.searchPh')}</span>
        <Kbd>{modCombo('K')}</Kbd>
      </button>
      <div className="ml-auto flex shrink-0 items-center gap-3">
        {account !== null && (
          <span className="num shrink-0 rounded-full border border-line-strong bg-bg1 px-[10px] py-[3px] text-micro tracking-[0.1em] whitespace-nowrap text-ink-mid uppercase">
            {account.displayName}
            {!account.isAuthenticated && <span className="ml-1.5 text-bad">· RE-AUTH</span>}
          </span>
        )}
        <span className="cap shrink-0 whitespace-nowrap text-ink-low">{t('titlebar.companionMode')}</span>
      </div>
    </header>
  );
}
