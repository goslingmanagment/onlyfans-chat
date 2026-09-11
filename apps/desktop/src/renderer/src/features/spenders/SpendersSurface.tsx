// Spenders PAGE (owner v2 2026-06-13; experiments/spenders-page-2.html): a
// separate page — the workspace chat list is NOT shown, ESC/← returns to it.
// The board owns the screen with a compact stats column right; S/⤢ expands
// stats to a full grid and squeezes the roster to 400px. Row anatomy stays
// per D29 and docs/mockups/spenders-contact-columns.html. A viewing board: NO AI
// automation — the human decides; AI runs only on explicit click/hotkey
// inside the quick-look preview.

import { useEffect, useMemo, useRef } from 'react';
import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { SpenderListVM, SpenderRowVM } from '../../../../preload/contract';
import { getBridge } from '../../bridge/bridge';
import {
  qk,
  useAccounts,
  useSettings,
  useSpenderLists,
  useSpendersFreshness,
  useSpenderStats,
  useSpenderUntiered,
} from '../../bridge/queries';
import { useUiStore } from '../../state/uiStore';
import { useT } from '../../lib/i18n';
import { Kbd } from '../../design/Kbd';
import { EmptyState } from '../../design/EmptyState';
import { SkeletonRows } from '../../design/Skeleton';
import { cx } from '../../lib/cx';
import { shelfPresentation, splitTierLabel } from '@chatgoose/shared';
import { buildAllView, buildFlatView, UNTIERED_ID, type BoardItem, type ShelfData } from './boardModel';
import { useSpendersStore } from './spendersStore';
import { SpenderRowItem } from './SpenderRowItem';
import { StatsPanel } from './StatsPanel';
import { QuickLook } from './QuickLook';
import type { ContactSide } from './contactAge';
import { useContactClock } from './useContactClock';
import { EMPTY_BOARD_FILTERS, hasBoardFilters, validBoardChip } from './boardFilters';
import { SearchFilters } from './SearchFilters';
import { QueryFeedback } from './QueryFeedback';
import { RefreshControls } from './RefreshControls';

const CLOSED_SHELVES: Record<string, true> = {};
type RosterResult = { rows: SpenderRowVM[]; truncated: boolean; fetchedAt: string };
function combineRosters(queries: UseQueryResult<RosterResult>[]) {
  return queries.map(({ data, isError, isFetching, refetch }) => ({ data, isError, isFetching, refetch }));
}

function estimateItem(item: BoardItem | undefined): number {
  if (item === undefined) return 64;
  if (item.kind === 'row') return 64;
  if (item.kind === 'tier') return 38;
  return 44;
}

export function SpendersSurface(): React.JSX.Element {
  const accountId = useUiStore((s) => s.selectedAccountId);
  const setView = useUiStore((s) => s.setView);
  const t = useT();
  const now = useContactClock();

  const accounts = useAccounts();
  const settings = useSettings();
  const lists = useSpenderLists(accountId, true);

  const savedChip = useSpendersStore((s) => s.chip);
  const storedAccountId = useSpendersStore((s) => s.accountId);
  const savedFilters = useSpendersStore((s) => s.filters);
  const enterAccount = useSpendersStore((s) => s.enterAccount);
  const clearFilters = useSpendersStore((s) => s.clearFilters);
  const contactSort = useSpendersStore((s) => s.contactSort);
  const sortContact = useSpendersStore((s) => s.sortContact);
  const savedExpanded = useSpendersStore((s) => s.expanded);
  const savedUntieredOpen = useSpendersStore((s) => s.untieredOpen);
  const cursorFanId = useSpendersStore((s) => s.cursorFanId);
  const previewFanId = useSpendersStore((s) => s.previewFanId);
  const setChip = useSpendersStore((s) => s.setChip);
  const expandList = useSpendersStore((s) => s.expandList);
  const setUntieredOpen = useSpendersStore((s) => s.setUntieredOpen);
  const openPreview = useSpendersStore((s) => s.openPreview);
  const setVisibleRows = useSpendersStore((s) => s.setVisibleRows);
  const statsExpanded = useSpendersStore((s) => s.statsExpanded);
  const statsRows = useSpendersStore((s) => s.statsRows);
  const resetTransient = useSpendersStore((s) => s.resetTransient);

  const stats = useSpenderStats(accountId, true);
  const freshness = useSpendersFreshness(accountId, true);
  const storeRefresh = useSpendersStore((s) => s.refresh);

  // Account switches can stay on the board surface; drop cursor/preview instead
  // of carrying a fan id from the previous page/account.
  useEffect(() => {
    enterAccount(accountId);
  }, [accountId, enterAccount]);

  useEffect(() => () => resetTransient(), [resetTransient]);

  const mapping = useMemo(
    () => (accountId !== null ? (settings.data?.spendersListMappings[accountId] ?? []) : []),
    [settings.data, accountId],
  );
  const shelves: SpenderListVM[] = useMemo(() => {
    const byId = new Map((lists.data?.lists ?? []).map((list) => [list.id, list]));
    return mapping.map((id) => byId.get(id)).filter((list): list is SpenderListVM => list !== undefined);
  }, [lists.data, mapping]);
  const sameAccount = storedAccountId === accountId;
  const expanded = sameAccount ? savedExpanded : CLOSED_SHELVES;
  const untieredOpen = sameAccount && savedUntieredOpen;
  const chip = sameAccount && settings.data !== undefined && lists.data !== undefined
    ? validBoardChip(savedChip, shelves.map((list) => list.id)) : 'all';
  const filters = sameAccount ? savedFilters : EMPTY_BOARD_FILTERS;
  const filtering = hasBoardFilters(filters);
  useEffect(() => {
    if (sameAccount && settings.data !== undefined && lists.data !== undefined && chip !== savedChip) setChip(chip);
  }, [sameAccount, settings.data, lists.data, chip, savedChip, setChip]);

  // A shelf's roster loads when it is on screen with rows: «Все»-preview
  // shelves immediately, collapsed big tiers only after «показать» (lazy
  // roster loading — owner decision), a tier chip loads just that list.
  const rosterQueries = useQueries({
    combine: combineRosters,
    queries: shelves.map((list, index) => {
      const wantsRows =
        chip === list.id ||
        (chip === 'all' &&
          (expanded[list.id] === true || shelfPresentation(index, list.usersCount).kind === 'preview'));
      return {
        queryKey: accountId === null ? ['spenders-roster', 'none', list.id] : qk.spendersRoster(accountId, list.id),
        queryFn: () =>
          getBridge().invoke('query:spenders.roster', { accountId: accountId ?? '', listId: list.id }),
        enabled: accountId !== null && sameAccount && wantsRows,
        retry: false,
      };
    }),
  });
  const untiered = useSpenderUntiered(accountId, sameAccount && chip === 'all' && untieredOpen && mapping.length > 0);

  const model = useMemo(() => {
    const shelfData: ShelfData[] = shelves.map((list, index) => ({
      list,
      rows: rosterQueries[index]?.data?.rows,
      truncated: rosterQueries[index]?.data?.truncated === true,
      error: rosterQueries[index]?.isError === true,
      fetching: rosterQueries[index]?.isFetching === true,
    }));
    if (chip !== 'all') {
      const index = shelves.findIndex((list) => list.id === chip);
      return buildFlatView(index === -1 ? null : (shelfData[index] ?? null), contactSort, filters);
    }
    return buildAllView({
      shelves: shelfData,
      expanded,
      sort: contactSort,
      filters,
      untiered: { open: untieredOpen, rows: untiered.data?.rows, loading: untiered.isPending && untieredOpen, error: untiered.isError, fetching: untiered.isFetching },
    });
  }, [shelves, chip, expanded, contactSort, filters, untieredOpen, untiered.data, untiered.isPending, untiered.isError, untiered.isFetching, rosterQueries]);

  // publish the flat row pool for the global keymap (J/K/SPACE/O)
  useEffect(() => {
    setVisibleRows(model.fanRows, model.loadedRows);
  }, [model.fanRows, model.loadedRows, setVisibleRows]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: model.items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => estimateItem(model.items[i]),
    overscan: 10,
    getItemKey: (i) => model.items[i]?.key ?? i,
  });

  // keep the keyboard cursor on screen
  useEffect(() => {
    if (cursorFanId === null) return;
    const index = model.items.findIndex((item) => item.kind === 'row' && item.row.fanId === cursorFanId);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: 'auto' });
  }, [cursorFanId, model.items, virtualizer]);

  const account = accounts.data?.find((a) => a.id === accountId) ?? null;
  const allCount = shelves.reduce((sum, list) => sum + list.usersCount, 0);
  // In-flight refresh queue: live frames (store) win; the freshness query
  // covers a mount mid-run before the first frame arrives.
  const activeRefresh =
    storeRefresh !== null && storeRefresh.accountId === accountId
      ? storeRefresh
      : freshness.data?.active != null && accountId !== null
        ? { accountId, ...freshness.data.active }
        : null;
  // Board rows first, stats queues second — a preview opened from «ждут
  // ответа» must resolve even when its shelf isn't loaded on the board.
  const previewRowVM =
    previewFanId !== null
      ? (model.loadedRows.find((row) => row.fanId === previewFanId) ??
        statsRows.find((row) => row.fanId === previewFanId) ??
        null)
      : null;

  function renderItem(item: BoardItem): React.JSX.Element | null {
    switch (item.kind) {
      case 'tier':
        return (
          <div className="flex items-baseline gap-[9px] bg-bg1 px-4 pt-[13px] pb-[7px]">
            <span className="text-[12px] font-semibold text-ink-mid">
              {item.listId === UNTIERED_ID ? t('sp.untiered') : item.title}
            </span>
            {item.band !== null && <span className="num text-[9.5px] text-ink-low">{item.band}</span>}
            <span className="h-px flex-1 self-center bg-line" />
            <span className="num text-[9.5px] text-ink-low">{item.matches !== undefined ? `${item.matches} / ` : ''}{item.count}</span>
          </div>
        );
      case 'row':
        return (
          <SpenderRowItem
            row={item.row}
            now={now}
            active={item.row.fanId === (previewFanId ?? cursorFanId)}
            t={t}
            onOpen={openPreview}
          />
        );
      case 'more':
        return (
          <button
            type="button"
            onClick={() => expandList(item.listId)}
            className="flex w-full cursor-pointer items-center gap-2.5 border-t border-line bg-bg1 px-4 py-[11px] text-left text-[12.5px] text-ink-mid hover:bg-bg2"
          >
            <span>{t('sp.moreInTier', { n: item.hidden, tier: item.tierTitle })}</span>
            <span className="num ml-auto text-[9.5px] text-ink-low">{t('sp.show')}</span>
          </button>
        );
      case 'collapsed':
        return (
          <button
            type="button"
            onClick={() =>
              item.listId === UNTIERED_ID ? setUntieredOpen(true) : expandList(item.listId)
            }
            className="flex w-full cursor-pointer items-center gap-2.5 border-t border-line bg-bg1 px-4 py-[11px] text-left text-[12.5px] text-ink-mid hover:bg-bg2"
          >
            <span>{item.listId === UNTIERED_ID ? t('sp.untiered') : item.title}</span>
            {item.band !== null && <span className="num text-[9.5px] text-ink-low">{item.band}</span>}
            <span className="num ml-auto text-[9.5px] text-ink-low">
              {item.count !== null ? `${item.count} · ` : ''}
              {t(filtering ? 'sp.loadToSearch' : 'sp.show')}
            </span>
          </button>
        );
      case 'loading':
        return (
          <div className="num px-4 py-3 text-center text-micro tracking-[0.1em] text-ink-low">
            {t('sp.loading')}
          </div>
        );
      case 'error':
        return <QueryFeedback label={t('sp.rosterFailed')} stale={item.stale} fetching={item.fetching} t={t} onRetry={() => {
          if (item.listId === UNTIERED_ID) void untiered.refetch();
          else void rosterQueries[shelves.findIndex((list) => list.id === item.listId)]?.refetch();
        }} />;
      case 'truncated':
        return (
          <div className="num px-4 py-2 text-center text-micro tracking-[0.06em] text-warn">
            {t('sp.truncated')}
          </div>
        );
      default:
        return null;
    }
  }

  const initialError = settings.data === undefined && settings.isError ? 'settings' : lists.data === undefined && lists.isError ? 'lists' : null;
  const pending = settings.data === undefined || lists.data === undefined;
  const empty = !pending && mapping.length === 0;
  const emptyNotice = !pending && !empty && model.fanRows.length === 0 && !model.items.some((item) =>
    item.kind === 'loading' || item.kind === 'error' || (!filtering && (item.kind === 'collapsed' || item.kind === 'truncated')),
  );

  return (
    <section className="relative flex min-h-0 min-w-0 flex-1 bg-bg0">
      <div
        className={cx(
          'spender-board flex min-h-0 flex-col bg-bg1',
          statsExpanded ? 'w-[400px] flex-none border-r border-line' : 'min-w-0 flex-1',
        )}
      >
        <div className="flex flex-none flex-wrap items-baseline gap-x-[11px] gap-y-1 border-b border-line px-[18px] py-[13px]">
          <h3 className="font-serif text-[16.5px] font-semibold">{t('sp.title')}</h3>
          {!statsExpanded && (
            <span className="text-[11px] text-ink-low" aria-live="polite">
              {account !== null ? `${account.displayName} · ` : ''}
              {t('sp.sortNote', { side: t(contactSort.side === 'model' ? 'sp.modelWrote' : 'sp.fanWrote'), arrow: contactSort.direction === 'desc' ? '↓' : '↑' })}
            </span>
          )}
          <button
            type="button"
            onClick={() => setView('workspace')}
            className="num ml-auto cursor-pointer text-[10px] text-ink-low hover:text-ink-mid"
          >
            {t('sp.backToChat')}
          </button>
        </div>
        <div className="flex flex-none flex-wrap items-center gap-[5px] border-b border-line px-4 py-[11px]">
          <ChipButton selected={chip === 'all'} onClick={() => setChip('all')}>
            {t('sp.all')}
            {!pending && <span className="num ml-1 text-[10.5px] opacity-70">{allCount}</span>}
          </ChipButton>
          {shelves.map((list) => (
            <ChipButton key={list.id} selected={chip === list.id} onClick={() => setChip(list.id)}>
              {splitTierLabel(list.name).title}
              <span className="num ml-1 text-[10.5px] opacity-70">{list.usersCount}</span>
            </ChipButton>
          ))}
          {!pending && !empty && (
            <RefreshControls
              accountId={accountId}
              chip={chip}
              chipTitle={
                chip === 'all'
                  ? t('sp.all')
                  : splitTierLabel(shelves.find((l) => l.id === chip)?.name ?? chip).title
              }
              scopeCount={
                chip === 'all' ? allCount : (shelves.find((l) => l.id === chip)?.usersCount ?? 0)
              }
              active={activeRefresh}
              stampIso={freshness.data?.scopes[chip] ?? null}
              lastRun={freshness.data?.lastRuns[chip] ?? null}
              failed={freshness.isError}
              fetching={freshness.isFetching}
              onRetry={() => { void freshness.refetch(); }}
              t={t}
            />
          )}
        </div>
        {!pending && !empty && <SearchFilters key={accountId} t={t} />}
        {settings.data !== undefined && settings.isError && <QueryFeedback label={t('sp.settingsFailed')} stale fetching={settings.isFetching} onRetry={() => { void settings.refetch(); }} t={t} />}
        {lists.data !== undefined && lists.isError && <QueryFeedback label={t('sp.listsFailed')} stale fetching={lists.isFetching} onRetry={() => { void lists.refetch(); }} t={t} />}
        {filtering && !pending && !empty && <div role="status" className="flex flex-none items-center gap-2 border-b border-line px-4 py-1.5 text-[11px] text-ink-low">
          <span className="flex-1">{t('sp.searchScope', { matched: new Set(model.fanRows.map((row) => row.fanId)).size, loaded: new Set(model.loadedRows.map((row) => row.fanId)).size })}</span>
          <button type="button" onClick={clearFilters} className="cursor-pointer text-ink-mid hover:underline">{t('sp.clearFilters')}</button>
        </div>}
        {activeRefresh !== null && (
          // 2px hairline progress under the chips (binding freshness mockup §3)
          <div className="h-[2px] flex-none bg-bg3">
            <i
              className="block h-full bg-clay transition-[width] duration-200"
              style={{
                width: `${activeRefresh.total > 0 ? Math.round((activeRefresh.done / activeRefresh.total) * 100) : 0}%`,
              }}
            />
          </div>
        )}
        {!pending && !empty && (
          <div className="spender-columns spender-column-head flex-none items-center border-b border-line bg-bg1 text-[12px] text-ink-mid" role="group" aria-label={t('sp.columns')}>
            <span>{t('sp.latestMessageColumn')}</span>
            <span className="text-right">{t('sp.spend30dColumn')}</span>
            {(['model', 'fan'] as const).map((side: ContactSide) => {
              const selected = contactSort.side === side;
              const label = t(side === 'model' ? 'sp.modelWrote' : 'sp.fanWrote');
              const nextDirection = selected && contactSort.direction === 'desc' ? 'sp.sortNewest' : 'sp.sortOldest';
              return (
                <button
                  key={side}
                  type="button"
                  data-contact-sort={side}
                  aria-pressed={selected}
                  aria-label={`${label}: ${t(nextDirection)}`}
                  title={t(nextDirection)}
                  onClick={() => sortContact(side)}
                  className={cx('flex min-h-[44px] cursor-pointer items-center justify-center gap-1 py-2 text-center hover:text-ink', selected && 'font-medium text-ink')}
                >
                  <span>{label}</span>
                  <span className="w-2 flex-none" aria-hidden="true">{selected ? (contactSort.direction === 'desc' ? '↓' : '↑') : ''}</span>
                </button>
              );
            })}
          </div>
        )}
        {emptyNotice && <div className="flex-none px-4 py-5 text-center text-[12px] text-ink-mid">{t(filtering ? 'sp.noMatches' : 'sp.emptyRoster')}</div>}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          {initialError !== null ? <QueryFeedback label={t(initialError === 'settings' ? 'sp.settingsFailed' : 'sp.listsFailed')} fetching={initialError === 'settings' ? settings.isFetching : lists.isFetching} onRetry={() => { void (initialError === 'settings' ? settings.refetch() : lists.refetch()); }} t={t} /> : pending ? <SkeletonRows /> : empty ? (
            <EmptyState
              glyph="◫"
              title={t('sp.notConfigured')}
              hint={
                <button
                  type="button"
                  onClick={() => setView('settings')}
                  className="cursor-pointer font-semibold text-clay-deep underline decoration-dotted underline-offset-2"
                >
                  {t('sp.openSettings')}
                </button>
              }
            />
          ) : (
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((vi) => {
                const item = model.items[vi.index];
                if (item === undefined) return null;
                return (
                  <div
                    key={vi.key}
                    data-index={vi.index}
                    ref={virtualizer.measureElement}
                    className="absolute top-0 left-0 w-full"
                    style={{ transform: `translateY(${vi.start}px)` }}
                  >
                    {renderItem(item)}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex flex-none flex-wrap items-center gap-x-2 gap-y-1 border-t border-line bg-bg1 px-4 py-2 text-[11px] text-ink-low">
          <Kbd>J</Kbd>
          <Kbd>K</Kbd> {t('sp.footNav')} · <Kbd>SPACE</Kbd> {t('sp.footPreview')} · <Kbd>O</Kbd>{' '}
          {t('sp.footChat')}
          <span className="flex-1" />
          {model.fanRows.length > 0 && <span title={t('sp.contactUnknown')}>{t('sp.contactCoverage', {
            known: model.fanRows.filter((row) => row.lastModelMessageAt !== null && row.lastFanMessageAt !== null).length,
            total: model.fanRows.length,
          })}</span>}
        </div>
      </div>
      <StatsPanel stats={sameAccount ? stats.data : undefined} expanded={statsExpanded} loading={stats.isFetching} error={stats.error} onRetry={() => { void stats.refetch(); }} />
      {sameAccount && accountId !== null && previewFanId !== null && (
        <QuickLook accountId={accountId} fanId={previewFanId} row={previewRowVM} store={useSpendersStore} />
      )}
    </section>
  );
}

function ChipButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'cursor-pointer rounded-full border border-transparent px-3 py-1 text-[12.5px] font-medium whitespace-nowrap transition-colors ' +
        (selected ? 'bg-ink text-bg1' : 'text-ink-mid hover:bg-bg2')
      }
    >
      {children}
    </button>
  );
}
