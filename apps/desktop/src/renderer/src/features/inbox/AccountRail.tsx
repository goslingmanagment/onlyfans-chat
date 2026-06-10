import { memo } from 'react';
import type { AccountVM } from '../../../../preload/contract';
import { useAccounts } from '../../bridge/queries';
import { useUiStore } from '../../state/uiStore';
import { initialsOf } from '../../lib/messages';
import { cx } from '../../lib/cx';
import { Skeleton } from '../../design/Skeleton';

export function AccountRail(): React.JSX.Element {
  const accounts = useAccounts();
  const selectedAccountId = useUiStore((s) => s.selectedAccountId);
  const selectAccount = useUiStore((s) => s.selectAccount);
  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);

  return (
    <nav className="flex w-16 flex-none flex-col items-center gap-2.5 border-r border-line bg-bg1 py-3">
      {accounts.data === undefined && (
        <>
          <Skeleton className="h-9 w-9 rounded-[10px]" />
          <Skeleton className="h-9 w-9 rounded-[10px]" />
        </>
      )}
      {accounts.data?.map((account) => (
        <AccountTile
          key={account.id}
          account={account}
          active={view === 'workspace' && account.id === selectedAccountId}
          onSelect={selectAccount}
        />
      ))}
      <button
        type="button"
        title="Accounts are connected by your admin in the OFAPI console"
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] border-[1.5px] border-dashed border-line-strong text-[16px] text-ink-low"
      >
        +
      </button>
      <div className="flex-1" />
      <button
        type="button"
        title="Settings"
        onClick={() => setView(view === 'settings' ? 'workspace' : 'settings')}
        className={cx(
          'cursor-pointer p-1.5 text-[16px]',
          view === 'settings' ? 'text-clay' : 'text-ink-low hover:text-ink-mid',
        )}
      >
        ⚙
      </button>
    </nav>
  );
}

const AccountTile = memo(function AccountTile({
  account,
  active,
  onSelect,
}: {
  account: AccountVM;
  active: boolean;
  onSelect: (id: string) => void;
}): React.JSX.Element {
  return (
    <div className="relative flex w-full justify-center">
      {active && (
        <span className="absolute top-1 bottom-1 left-0 w-[3px] rounded-r-[3px] bg-clay" />
      )}
      <button
        type="button"
        onClick={() => onSelect(account.id)}
        title={`${account.displayName} (@${account.username})${account.isAuthenticated ? '' : ' — re-auth needed, ping admin'}`}
        className={cx(
          'relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] text-[12.5px] font-bold',
          active ? 'bg-clay text-white' : 'bg-bg3 text-ink-mid hover:bg-bg2',
        )}
      >
        {account.avatarUrl !== null ? (
          <img
            src={account.avatarUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full rounded-[10px] object-cover"
          />
        ) : (
          initialsOf(account.displayName)
        )}
        {account.unreadCount > 0 && (
          <span className="num absolute -top-[5px] -right-[6px] flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-bg1 bg-ink px-1 text-micro font-semibold text-bg1">
            {account.unreadCount > 99 ? '99' : account.unreadCount}
          </span>
        )}
        {/* auth-state dot */}
        <span
          className={cx(
            'absolute -right-[3px] -bottom-[3px] h-[10px] w-[10px] rounded-full border-[2.5px] border-bg1',
            account.isAuthenticated ? 'bg-online' : 'bg-bad',
          )}
        />
      </button>
    </div>
  );
});
