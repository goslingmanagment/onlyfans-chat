import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AccountVM } from '../../../../preload/contract';
import { useAccounts, useOnlineSnapshot, useSettings, useUpdateSettings } from '../../bridge/queries';
import { useUiStore } from '../../state/uiStore';
import { initialsOf } from '../../lib/messages';
import { applyOrder, computeReorder } from '../../lib/order';
import { cx } from '../../lib/cx';
import { useT } from '../../lib/i18n';
import { useFollowersCopy } from '../followers/copy';
import { Skeleton } from '../../design/Skeleton';

type DropPos = 'before' | 'after';
interface DropTarget {
  id: string;
  pos: DropPos;
}

function dropPosFromEvent(e: React.DragEvent): DropPos {
  const rect = e.currentTarget.getBoundingClientRect();
  return e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
}

export function AccountRail(): React.JSX.Element {
  const t = useT();
  const { c: followersCopy } = useFollowersCopy();
  const accounts = useAccounts();
  const accountOrder = useSettings().data?.accountOrder;
  const { mutate: saveSettings } = useUpdateSettings();
  const selectedAccountId = useUiStore((s) => s.selectedAccountId);
  const selectAccount = useUiStore((s) => s.selectAccount);
  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);
  // Online-now badge: counts.online of the selected account's cached snapshot
  // (0 credits — reads the in-memory main snapshot). Shares the surface's cache
  // key so a «Обновить» updates the badge instantly.
  const onlineOnlySpenders = useSettings().data?.onlineOnlySpenders ?? true;
  const onlineCount =
    useOnlineSnapshot(selectedAccountId, onlineOnlySpenders).data?.counts.online ?? 0;

  // Owner-chosen order (drag-sorted); unlisted accounts keep alpha order after.
  const ordered = useMemo(
    () => applyOrder(accounts.data ?? [], (a) => a.id, accountOrder ?? []),
    [accounts.data, accountOrder],
  );
  const draggable = ordered.length > 1;

  // Refs let the drag handlers stay stable so AccountTile memoization holds; the
  // mirrored state only drives the drag/drop visuals.
  const dragIdRef = useRef<string | null>(null);
  const orderedRef = useRef<AccountVM[]>(ordered);
  useEffect(() => {
    orderedRef.current = ordered;
  }, [ordered]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const onDragStart = useCallback((id: string, e: React.DragEvent) => {
    dragIdRef.current = id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    setDragId(id);
  }, []);

  const onDragEnd = useCallback(() => {
    dragIdRef.current = null;
    setDragId(null);
    setDropTarget(null);
  }, []);

  const onDragOver = useCallback((id: string, e: React.DragEvent) => {
    if (dragIdRef.current === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const pos = dropPosFromEvent(e);
    setDropTarget((prev) => (prev !== null && prev.id === id && prev.pos === pos ? prev : { id, pos }));
  }, []);

  const onDrop = useCallback(
    (targetId: string, e: React.DragEvent) => {
      e.preventDefault();
      const sourceId = dragIdRef.current;
      dragIdRef.current = null;
      setDragId(null);
      setDropTarget(null);
      if (sourceId === null) return;
      const ids = orderedRef.current.map((a) => a.id);
      const next = computeReorder(ids, sourceId, targetId, dropPosFromEvent(e));
      if (next.length === ids.length && next.every((v, i) => v === ids[i])) return;
      saveSettings({ accountOrder: next });
    },
    [saveSettings],
  );

  return (
    <nav className="flex w-16 flex-none flex-col items-center gap-2.5 border-r border-line bg-bg1 py-3">
      {accounts.data === undefined && (
        <>
          <Skeleton className="h-9 w-9 rounded-[10px]" />
          <Skeleton className="h-9 w-9 rounded-[10px]" />
        </>
      )}
      {ordered.map((account) => (
        <AccountTile
          key={account.id}
          account={account}
          active={account.id === selectedAccountId}
          onSelect={selectAccount}
          draggable={draggable}
          dragging={account.id === dragId}
          dropPos={dropTarget !== null && dropTarget.id === account.id && account.id !== dragId ? dropTarget.pos : null}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragOver={onDragOver}
          onDrop={onDrop}
        />
      ))}
      <button
        type="button"
        title={t('inbox.addAcctTitle')}
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] border-[1.5px] border-dashed border-line-strong text-[16px] text-ink-low"
      >
        +
      </button>
      <div className="flex-1" />
      <button
        type="button"
        title={followersCopy.title}
        aria-label={followersCopy.title}
        onClick={() => setView(view === 'followers' ? 'workspace' : 'followers')}
        className={cx('flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] text-[15px] font-bold', view === 'followers' ? 'bg-clay-bg text-clay' : 'text-ink-low hover:text-ink-mid')}
      >
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M19 7v6m-3-3h6" /></svg>
      </button>
      {/* Online-now page entry (variant C; sibling of Spenders, above it) */}
      <button
        type="button"
        title={t('online.title')}
        onClick={() => setView(view === 'online' ? 'workspace' : 'online')}
        className={cx(
          'relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px]',
          view === 'online' ? 'bg-clay-bg text-clay' : 'text-ink-low hover:text-ink-mid',
        )}
      >
        {/* the ONE allowed semantic accent — the green online dot */}
        <span className="h-3 w-3 rounded-full bg-online" />
        {onlineCount > 0 && (
          <span className="num absolute -top-[5px] -right-[6px] flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-bg1 bg-online px-1 text-micro font-semibold text-white">
            {onlineCount > 99 ? '99' : onlineCount}
          </span>
        )}
      </button>
      {/* Spenders page entry (owner 2026-06-13: a visible button, not just ⌘K) */}
      <button
        type="button"
        title={t('sp.title')}
        onClick={() => setView(view === 'spenders' ? 'workspace' : 'spenders')}
        className={cx(
          'flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] text-[15px] font-bold',
          view === 'spenders' ? 'bg-clay-bg text-clay' : 'text-ink-low hover:text-ink-mid',
        )}
      >
        $
      </button>
      <button
        type="button"
        title={t('settings.title')}
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
  draggable,
  dragging,
  dropPos,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  account: AccountVM;
  active: boolean;
  onSelect: (id: string) => void;
  draggable: boolean;
  dragging: boolean;
  dropPos: DropPos | null;
  onDragStart: (id: string, e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (id: string, e: React.DragEvent) => void;
  onDrop: (id: string, e: React.DragEvent) => void;
}): React.JSX.Element {
  const t = useT();
  return (
    <div
      className="relative flex w-full justify-center"
      onDragOver={(e) => onDragOver(account.id, e)}
      onDrop={(e) => onDrop(account.id, e)}
    >
      {active && <span className="absolute top-1 bottom-1 left-0 w-[3px] rounded-r-[3px] bg-clay" />}
      {/* Drop indicator: clay bar in the gap above/below the hovered tile. */}
      {dropPos === 'before' && (
        <span className="pointer-events-none absolute -top-[6px] right-2 left-2 h-[2.5px] rounded-full bg-clay" />
      )}
      {dropPos === 'after' && (
        <span className="pointer-events-none absolute -bottom-[6px] right-2 left-2 h-[2.5px] rounded-full bg-clay" />
      )}
      <button
        type="button"
        draggable={draggable}
        onDragStart={(e) => onDragStart(account.id, e)}
        onDragEnd={onDragEnd}
        onClick={() => onSelect(account.id)}
        title={`${account.displayName} (@${account.username})${account.isAuthenticated ? '' : t('inbox.acctReauthSuffix')}`}
        className={cx(
          'relative flex h-9 w-9 items-center justify-center rounded-[10px] text-[12.5px] font-bold transition-opacity',
          draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
          dragging && 'opacity-40',
          active ? 'bg-clay text-white' : 'bg-bg3 text-ink-mid hover:bg-bg2',
        )}
      >
        {account.avatarUrl !== null ? (
          <img
            src={account.avatarUrl}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
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
