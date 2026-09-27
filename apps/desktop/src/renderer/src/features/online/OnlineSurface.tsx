// Online-now PAGE (owner variant C; binding mockup docs/mockups/experiments/
// online-flat.html): a separate FLAT-list page — no workspace chat list, the
// surface owns the screen beside the rail. Radical flatness: no tiers, no stats
// column, ZERO list colour-coding — the green online dot (avatar + nav button)
// is the only semantic accent. Populated ON DEMAND by «Обновить» = ONE read-only
// GET /fans/active (1 credit/page); NO background auto-poll. A viewing board: AI
// runs only on explicit click/hotkey inside the reused quick-look.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { refreshCostUsd } from '@chatgoose/shared';
import type { UiTranslator } from '@chatgoose/shared/i18n/index';
import type { OnlineRowVM } from '../../../../preload/contract';
import { useAccounts, useOnlineSnapshot, useRefreshOnline, useSettings, useUpdateSettings } from '../../bridge/queries';
import { useUiStore } from '../../state/uiStore';
import { useT } from '../../lib/i18n';
import { cx } from '../../lib/cx';
import { schemeLabel } from '../../lib/hotkeyScheme';
import { formatAgeShort, onlineMinutes } from '../../lib/time';
import { Kbd } from '../../design/Kbd';
import { EmptyState } from '../../design/EmptyState';
import { SkeletonRows } from '../../design/Skeleton';
import { SpenderRowItem } from '../spenders/SpenderRowItem';
import { QuickLook } from '../spenders/QuickLook';
import { useOnlineStore } from './onlineStore';
import { sortOnlineRows, type OnlineSort } from './onlineModel';

type OnlineItem =
  | { kind: 'row'; key: string; row: OnlineRowVM }
  | { kind: 'truncated'; key: string };

function estimateItem(item: OnlineItem | undefined): number {
  return item?.kind === 'truncated' ? 36 : 64;
}

export function OnlineSurface(): React.JSX.Element {
  const accountId = useUiStore((s) => s.selectedAccountId);
  const t = useT();

  const settings = useSettings();
  const accounts = useAccounts();
  const { mutate: saveSettings } = useUpdateSettings();
  const spendersOnly = settings.data?.onlineOnlySpenders ?? true;
  const sort: OnlineSort = settings.data?.onlineSort ?? 'spend';
  const account = accounts.data?.find((candidate) => candidate.id === accountId) ?? null;

  const snapshotQuery = useOnlineSnapshot(accountId, spendersOnly);
  const refreshOnline = useRefreshOnline();

  const cursorFanId = useOnlineStore((s) => s.cursorFanId);
  const previewFanId = useOnlineStore((s) => s.previewFanId);
  const openPreview = useOnlineStore((s) => s.openPreview);
  const setVisibleRows = useOnlineStore((s) => s.setVisibleRows);
  const resetTransient = useOnlineStore((s) => s.resetTransient);

  // Account switches can now stay on the board surface; drop cursor/preview
  // instead of carrying a fan id from the previous page/account.
  useEffect(() => {
    resetTransient();
  }, [accountId, resetTransient]);

  // Leaving the surface clears cursor/preview (mirrors SpendersSurface).
  useEffect(() => () => resetTransient(), [resetTransient]);

  const snapshot = snapshotQuery.data;
  const rawRows = snapshot?.rows ?? [];
  // Static "now" per snapshot: «онлайн N мин» is a snapshot value (re-derived on
  // the next refresh), so memoized rows stay stable between refreshes.
  const now = useMemo(() => new Date(), [snapshot?.fetchedAt]);
  const sortedRows = useMemo(() => sortOnlineRows(rawRows, sort), [rawRows, sort]);

  const model = useMemo(() => {
    const items: OnlineItem[] = sortedRows.map((row) => ({
      kind: 'row' as const,
      key: `row:${row.fanId}`,
      row,
    }));
    if (snapshot?.truncated === true) items.push({ kind: 'truncated', key: 'truncated:online' });
    return { items, fanRows: sortedRows };
  }, [sortedRows, snapshot?.truncated]);

  // publish the flat J/K pool for the global keymap
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

  useEffect(() => {
    if (cursorFanId === null) return;
    const index = model.items.findIndex((it) => it.kind === 'row' && it.row.fanId === cursorFanId);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: 'auto' });
  }, [cursorFanId, model.items, virtualizer]);

  const counts = snapshot?.counts ?? { online: 0, spenders: 0, waiting: 0 };
  const previewRowVM = previewFanId !== null
    ? (model.fanRows.find((row) => row.fanId === previewFanId) ?? null)
    : null;

  function onRefresh(): void {
    if (accountId === null || refreshOnline.isPending) return;
    refreshOnline.mutate({ accountId, spendersOnly });
  }

  function rowLabel(row: OnlineRowVM): string {
    const mins = onlineMinutes(row.lastSeen, now);
    return mins === null || mins < 1 ? t('online.justJoined') : t('online.onlineMin', { n: mins });
  }

  const hasRows = model.fanRows.length > 0;

  return (
    <section className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-bg1">
      {/* ── header ── */}
      <div className="flex flex-none items-center gap-[11px] px-[26px] pt-4 pb-[14px]">
        <h1 className="flex items-center gap-2.5 font-serif text-[21px] font-semibold">
          <span className="h-[9px] w-[9px] flex-none rounded-full bg-online shadow-[0_0_0_3px_var(--color-green-bg)]" />
          {t('online.title')}
        </h1>
        <span className="num text-[11px] tracking-[0.04em] text-ink-low">
          {t('online.counts', { spenders: counts.spenders, online: counts.online })}
        </span>
        {account !== null && (
          <span className="num max-w-[220px] truncate rounded-full border border-line-strong bg-bg1 px-[9px] py-[2px] text-micro tracking-[0.08em] text-ink-mid uppercase">
            {account.displayName}
          </span>
        )}
        <span className="flex-1" />
        <UpdatedAgo iso={snapshot?.fetchedAt ?? null} t={t} />
        <button
          type="button"
          onClick={onRefresh}
          disabled={accountId === null || refreshOnline.isPending}
          title={`${t('online.refreshTip')} · ≈ $${refreshCostUsd(1).toFixed(2)}/page`}
          className="flex flex-none cursor-pointer items-center gap-[7px] rounded-full border border-clay-line bg-clay-bg px-[14px] py-[6px] text-[12.5px] font-semibold whitespace-nowrap text-clay-deep hover:border-clay disabled:cursor-default disabled:opacity-60"
        >
          {refreshOnline.isPending ? t('online.refreshing') : t('online.refresh')}
          <span className="num text-[9.5px] font-medium opacity-80">{t('online.cost')}</span>
        </button>
      </div>

      {/* ── controls: «Только спендеры» (default ON) + sort tabs ── */}
      <div className="flex flex-none items-center gap-4 border-b border-line px-[26px] py-[14px]">
        <button
          type="button"
          onClick={() => saveSettings({ onlineOnlySpenders: !spendersOnly })}
          className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-ink-mid"
        >
          <span className={cx('relative h-5 w-[34px] flex-none rounded-full transition-colors', spendersOnly ? 'bg-green' : 'bg-line-strong')}>
            <span className={cx('absolute top-[2px] h-4 w-4 rounded-full bg-white transition-all', spendersOnly ? 'right-[2px]' : 'left-[2px]')} />
          </span>
          {t('online.onlySpenders')}
        </button>
        <span className="flex-1" />
        <div className="flex gap-1">
          <SortTab on={sort === 'spend'} onClick={() => saveSettings({ onlineSort: 'spend' })}>
            {t('online.sortBySpend')}
          </SortTab>
          <SortTab on={sort === 'recent'} onClick={() => saveSettings({ onlineSort: 'recent' })}>
            {t('online.sortByRecent')}
          </SortTab>
        </div>
      </div>

      {/* ── flat list ── */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {refreshOnline.isPending && !hasRows ? (
          <SkeletonRows />
        ) : !hasRows ? (
          <EmptyState
            glyph="◍"
            title={snapshot?.fetchedAt == null ? t('online.emptyFirst') : t('online.empty')}
            hint={
              <button
                type="button"
                onClick={onRefresh}
                className="cursor-pointer font-semibold text-clay-deep underline decoration-dotted underline-offset-2"
              >
                {t('online.emptyHint')}
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
                  {item.kind === 'truncated' ? (
                    <div className="num px-[26px] py-2 text-center text-micro tracking-[0.06em] text-ink-low">
                      {t('online.truncated', { n: model.fanRows.length })}
                    </div>
                  ) : (
                    <SpenderRowItem
                      now={now.getTime()}
                      row={item.row}
                      active={item.row.fanId === (previewFanId ?? cursorFanId)}
                      t={t}
                      onOpen={openPreview}
                      online
                      onlineLabel={rowLabel(item.row)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── foot ── */}
      <div className="flex flex-none items-center gap-2 border-t border-line bg-bg1 px-[26px] py-2 text-[11px] text-ink-low">
        <Kbd>J</Kbd>
        <Kbd>K</Kbd> {t('sp.footNav')} · <Kbd>SPACE</Kbd> {t('sp.footPreview')} · <Kbd>O</Kbd> {t('sp.footChat')} · <Kbd>{schemeLabel('ping')}</Kbd> {t('online.footPing')}
        <span className="flex-1" />
        <span>{t('online.footSnapshot')}</span>
      </div>

      {accountId !== null && previewFanId !== null && (
        <QuickLook accountId={accountId} fanId={previewFanId} row={previewRowVM} store={useOnlineStore} />
      )}
    </section>
  );
}

function SortTab({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'cursor-pointer rounded-full px-[11px] py-1 text-[12px] font-medium whitespace-nowrap',
        on ? 'bg-bg3 text-ink' : 'text-ink-low hover:bg-bg2',
      )}
    >
      {children}
    </button>
  );
}

/** «обновлено N назад» — ticks every 5 s so the age stays honest without
 *  re-rendering the whole surface (mirrors the Spenders RefreshControls clock).
 *  Render-only clock: it never triggers a query/OFAPI call (no-poll invariant). */
function UpdatedAgo({ iso, t }: { iso: string | null; t: UiTranslator }): React.JSX.Element {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);
  if (iso === null) {
    return (
      <span className="num text-[10px] tracking-[0.04em] text-ink-low uppercase">
        {t('online.neverUpdated')}
      </span>
    );
  }
  const ms = Date.parse(iso);
  const when = Number.isFinite(ms) ? formatAgeShort(Math.max(0, nowMs - ms)) : '—';
  return (
    <span className="num text-[10px] tracking-[0.04em] text-ink-low">
      {t('online.updatedAgo', { when })}
    </span>
  );
}
