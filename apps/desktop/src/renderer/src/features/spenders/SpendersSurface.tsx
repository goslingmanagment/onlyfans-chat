// Spenders PAGE (owner v2 2026-06-13; experiments/spenders-page-2.html): a
// separate page — the workspace chat list is NOT shown, ESC/← returns to it.
// The board owns the screen with a compact stats column right; S/⤢ expands
// stats to a full grid and squeezes the roster to 400px. Row anatomy stays
// per the binding mockup docs/mockups/supporters.html. A viewing board: NO AI
// automation — the human decides; AI runs only on explicit click/hotkey
// inside the quick-look preview.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
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
import { refreshCostUsd, shelfPresentation, splitTierLabel, splitUpdateStamp } from '@chatgoose/shared';
import type { UiTranslator } from '@chatgoose/shared/i18n/index';
import { buildAllView, buildFlatView, UNTIERED_ID, type BoardItem, type ShelfData } from './boardModel';
import { useSpendersStore } from './spendersStore';
import { SpenderRowItem } from './SpenderRowItem';
import { StatsPanel } from './StatsPanel';
import { QuickLook } from './QuickLook';

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

  const accounts = useAccounts();
  const settings = useSettings();
  const lists = useSpenderLists(accountId, true);

  const chip = useSpendersStore((s) => s.chip);
  const expanded = useSpendersStore((s) => s.expanded);
  const untieredOpen = useSpendersStore((s) => s.untieredOpen);
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

  useEffect(() => () => resetTransient(), [resetTransient]);

  const mapping = useMemo(
    () => (accountId !== null ? (settings.data?.spendersListMappings[accountId] ?? []) : []),
    [settings.data, accountId],
  );
  const shelves: SpenderListVM[] = useMemo(() => {
    const byId = new Map((lists.data?.lists ?? []).map((list) => [list.id, list]));
    return mapping.map((id) => byId.get(id)).filter((list): list is SpenderListVM => list !== undefined);
  }, [lists.data, mapping]);

  // A shelf's roster loads when it is on screen with rows: «Все»-preview
  // shelves immediately, collapsed big tiers only after «показать» (lazy
  // roster loading — owner decision), a tier chip loads just that list.
  const rosterQueries = useQueries({
    queries: shelves.map((list, index) => {
      const wantsRows =
        chip === list.id ||
        (chip === 'all' &&
          (expanded[list.id] === true || shelfPresentation(index, list.usersCount).kind === 'preview'));
      return {
        queryKey: accountId === null ? ['spenders-roster', 'none', list.id] : qk.spendersRoster(accountId, list.id),
        queryFn: () =>
          getBridge().invoke('query:spenders.roster', { accountId: accountId ?? '', listId: list.id }),
        enabled: accountId !== null && wantsRows,
      };
    }),
  });
  const untiered = useSpenderUntiered(accountId, chip === 'all' && untieredOpen && mapping.length > 0);

  const model = useMemo(() => {
    const shelfData: ShelfData[] = shelves.map((list, index) => ({
      list,
      rows: (rosterQueries[index]?.data as { rows: SpenderRowVM[] } | undefined)?.rows,
      truncated:
        (rosterQueries[index]?.data as { truncated?: boolean } | undefined)?.truncated === true,
    }));
    if (chip !== 'all') {
      const index = shelves.findIndex((list) => list.id === chip);
      return buildFlatView(index === -1 ? null : (shelfData[index] ?? null));
    }
    return buildAllView({
      shelves: shelfData,
      expanded,
      untiered: { open: untieredOpen, rows: untiered.data?.rows, loading: untiered.isPending && untieredOpen },
    });
    // rosterQueries is a new array each render but its data refs are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelves, chip, expanded, untieredOpen, untiered.data, untiered.isPending, ...rosterQueries.map((q) => q.data)]);

  // publish the flat row pool for the global keymap (J/K/SPACE/O)
  useEffect(() => {
    setVisibleRows(model.fanRows);
  }, [model.fanRows, setVisibleRows]);

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
      ? (model.fanRows.find((row) => row.fanId === previewFanId) ??
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
            <span className="num text-[9.5px] text-ink-low">{item.count}</span>
          </div>
        );
      case 'row':
        return (
          <SpenderRowItem
            row={item.row}
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
              {t('sp.show')}
            </span>
          </button>
        );
      case 'loading':
        return (
          <div className="num px-4 py-3 text-center text-micro tracking-[0.1em] text-ink-low">
            {t('sp.loading')}
          </div>
        );
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

  const empty = mapping.length === 0;

  return (
    <section className="relative flex min-h-0 min-w-0 flex-1 bg-bg0">
      <div
        className={cx(
          'flex min-h-0 flex-col bg-bg1',
          statsExpanded ? 'w-[400px] flex-none border-r border-line' : 'min-w-0 flex-1',
        )}
      >
        <div className="flex flex-none items-baseline gap-[11px] border-b border-line px-[18px] py-[13px]">
          <h3 className="font-serif text-[16.5px] font-semibold">{t('sp.title')}</h3>
          {!statsExpanded && (
            <span className="num text-[10px] tracking-[0.05em] text-ink-low uppercase">
              {account !== null ? `${account.displayName} · ` : ''}
              {t('sp.sortNote')}
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
        <div className="flex flex-none items-center gap-[5px] overflow-x-auto border-b border-line px-4 py-[11px]">
          <ChipButton selected={chip === 'all'} onClick={() => setChip('all')}>
            {t('sp.all')}
            <span className="num ml-1 text-[10.5px] opacity-70">{allCount}</span>
          </ChipButton>
          {shelves.map((list) => (
            <ChipButton key={list.id} selected={chip === list.id} onClick={() => setChip(list.id)}>
              {splitTierLabel(list.name).title}
              <span className="num ml-1 text-[10.5px] opacity-70">{list.usersCount}</span>
            </ChipButton>
          ))}
          {!empty && (
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
              t={t}
            />
          )}
        </div>
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
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          {empty ? (
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
          ) : lists.isPending ? (
            <SkeletonRows />
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
        <div className="flex flex-none items-center gap-2 border-t border-line bg-bg1 px-4 py-2 text-[11px] text-ink-low">
          <Kbd>J</Kbd>
          <Kbd>K</Kbd> {t('sp.footNav')} · <Kbd>SPACE</Kbd> {t('sp.footPreview')} · <Kbd>O</Kbd>{' '}
          {t('sp.footChat')}
          <span className="flex-1" />
          {!statsExpanded && <span>{t('sp.footReadOnly')}</span>}
        </div>
      </div>
      <StatsPanel stats={stats.data} expanded={statsExpanded} />
      {accountId !== null && previewFanId !== null && (
        <QuickLook accountId={accountId} fanId={previewFanId} row={previewRowVM} />
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

/**
 * Scoped refresh + per-scope freshness line (PLAN item 13; binding experiment
 * page mockups/experiments/spenders-freshness.html): the cost is on the button
 * BEFORE the click («ВСЕ 104 · ~104 КР» — «~» because TTL-fresh fans are
 * skipped), the age summary is ONE line per scope («последний апдейт — вчера
 * 18:40» / «апдейта ещё не было»), busy state = «⟳ Обновление 34/104 · СТОП».
 * NO per-row age marks (owner-rejected variant).
 */
function RefreshControls({
  accountId,
  chip,
  chipTitle,
  scopeCount,
  active,
  stampIso,
  t,
}: {
  accountId: string | null;
  chip: string;
  chipTitle: string;
  scopeCount: number;
  active: { scope: string; state: 'running' | 'paused'; done: number; total: number } | null;
  stampIso: string | null;
  t: UiTranslator;
}): React.JSX.Element {
  const busy = active !== null;
  // 30 s tick keeps «сегодня/вчера» honest across midnight (DataAge pattern).
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  function ageLine(): string {
    if (active !== null) {
      return active.state === 'paused'
        ? t('sp.refreshPaused')
        : t('sp.rowsLeft', { n: Math.max(0, active.total - active.done) });
    }
    if (stampIso === null) return t('sp.neverUpdated');
    const stampMs = Date.parse(stampIso);
    if (!Number.isFinite(stampMs)) return t('sp.neverUpdated');
    const parts = splitUpdateStamp(stampMs, nowMs);
    const when =
      parts.kind === 'today'
        ? `${t('sp.today')} ${parts.time}`
        : parts.kind === 'yesterday'
          ? `${t('sp.yesterdayCap')} ${parts.time}`
          : `${parts.date} ${parts.time}`;
    return t('sp.lastUpdate', { when });
  }

  function onClick(): void {
    if (accountId === null) return;
    if (busy) {
      void getBridge().invoke('cmd:spenders.refreshStop', { accountId });
    } else {
      void getBridge().invoke('cmd:spenders.refreshScope', { accountId, scope: chip });
    }
  }

  const approx = chip === 'all' ? '~' : '';
  const usd = refreshCostUsd(scopeCount);

  return (
    <>
      <span className="flex-1" />
      <span className="num text-[9px] tracking-[0.05em] whitespace-nowrap text-ink-low uppercase">
        {ageLine()}
      </span>
      <button
        type="button"
        onClick={onClick}
        disabled={accountId === null || (!busy && scopeCount === 0)}
        title={
          busy
            ? t('sp.stop')
            : `${t('sp.refreshTip')} · ≈ $${usd.toFixed(2)}`
        }
        className={cx(
          'flex flex-none cursor-pointer items-center gap-[7px] rounded-full border px-3 py-[3px] text-[12px] font-semibold whitespace-nowrap',
          busy
            ? 'border-line text-ink-low'
            : 'border-line-strong bg-bg1 text-ink-mid hover:border-ink-mid hover:text-ink',
        )}
      >
        {busy ? (
          <>
            {t('sp.refreshing')}
            <span className="num text-[9px] tracking-[0.04em] text-ink-low">
              {active.done}/{active.total}
            </span>
            <span className="num text-[9px] tracking-[0.04em] text-ink-low">· {t('sp.stop')}</span>
          </>
        ) : (
          <>
            {t('sp.refresh')}
            <span className="num text-[9px] tracking-[0.04em] text-ink-low uppercase">
              {chipTitle} {scopeCount} · {approx}
              {scopeCount} {t('sp.creditsShort')}
            </span>
          </>
        )}
      </button>
    </>
  );
}
