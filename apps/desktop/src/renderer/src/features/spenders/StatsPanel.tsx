// Spenders page stats (owner v2 2026-06-13; experiments/spenders-page-2.html):
// compact 300px column by default — the board owns the screen — expandable to
// a full grid (⤢ / S) that squeezes the roster to 400px. Everything renders
// from ONE local-join query (query:spenders.stats, 0 credits). Flat visuals
// per the owner's taste: neutral chart fills, colour only where the design
// system already has it (money green, silence amber/clay).

import { useEffect, useMemo } from 'react';
import type { SpenderRowVM, SpenderStatsVM } from '../../../../preload/contract';
import { useT, useLocale, localeTag } from '../../lib/i18n';
import { formatWholeDollars } from '../../lib/money';
import { Avatar } from '../../design/Avatar';
import { Kbd } from '../../design/Kbd';
import { cx } from '../../lib/cx';
import { UNTIERED_ID } from './boardModel';
import { useSpendersStore } from './spendersStore';
import { dayCounter } from './SpenderRowItem';

const SILENCE_DOT = { warm: 'bg-amber', hot: 'bg-clay-deep' } as const;

/** '$11.60' — avg check keeps cents (the one stats figure where cents matter). */
function formatCents(amount: number): string {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function axisDay(day: string, tag: string): string {
  const date = new Date(`${day}T00:00:00`);
  return date.toLocaleDateString(tag, { day: 'numeric', month: 'short' }).toUpperCase();
}

export function StatsPanel({
  stats,
  expanded,
}: {
  stats: SpenderStatsVM | undefined;
  expanded: boolean;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const toggle = useSpendersStore((s) => s.toggleStatsExpanded);
  const setChip = useSpendersStore((s) => s.setChip);
  const openPreview = useSpendersStore((s) => s.openPreview);
  const setStatsRows = useSpendersStore((s) => s.setStatsRows);

  // Publish queue rows so a preview opened here resolves its VM (store doc).
  useEffect(() => {
    if (stats === undefined) return;
    setStatsRows([...stats.waiting, ...stats.newSpenders.map((entry) => entry.row)]);
  }, [stats, setStatsRows]);
  useEffect(() => () => setStatsRows([]), [setStatsRows]);

  const tierTitle = (listId: string, title: string): string =>
    listId === UNTIERED_ID ? t('sp.untiered') : title;

  const maxDay = useMemo(
    () => Math.max(1, ...(stats?.days ?? []).map((point) => point.amount)),
    [stats],
  );
  const firstDay = stats?.days[0]?.day;

  const bars =
    stats === undefined ? null : (
      <>
        <div className={cx('flex items-end gap-[2px]', expanded ? 'h-[72px] gap-[3px]' : 'mt-[7px] h-[38px]')}>
          {stats.days.map((point) => (
            <div
              key={point.day}
              title={`${point.day} · ${formatWholeDollars(point.amount)}`}
              className={cx(
                'min-h-[2px] flex-1 rounded-t-[1.5px]',
                point.amount > 0 ? 'bg-line-strong hover:bg-clay' : 'bg-bg3',
              )}
              style={{ height: point.amount > 0 ? `${Math.max(4, (point.amount / maxDay) * 100)}%` : '2px' }}
            />
          ))}
        </div>
        <div className="num mt-1 flex justify-between text-[8px] tracking-[0.07em] text-ink-low">
          <span>{firstDay !== undefined ? axisDay(firstDay, localeTag(locale)) : ''}</span>
          <span>{t('sp.stats.todayAxis')}</span>
        </div>
      </>
    );

  const radarRows = (stats?.radar ?? []).filter((row) => row.warm > 0 || row.hot > 0);
  const maxTier = Math.max(1, ...(stats?.tiers ?? []).map((tier) => tier.revenue));

  if (!expanded) {
    return (
      <aside className="flex min-h-0 w-[300px] flex-none flex-col overflow-y-auto border-l border-line bg-bg1">
        <div className="flex flex-none items-baseline gap-2 border-b border-line px-3.5 py-3">
          <h4 className="font-serif text-[14px] font-semibold">{t('sp.stats.title')}</h4>
          <button
            type="button"
            onClick={toggle}
            className="num ml-auto flex cursor-pointer items-center gap-1.5 text-[9px] tracking-[0.06em] text-ink-low hover:text-ink-mid"
          >
            {t('sp.stats.expand')} <Kbd>S</Kbd>
          </button>
        </div>

        <Section cap={t('sp.stats.revenue')} meta={t('sp.stats.window30Short')}>
          <KV k={t('sp.stats.d30')} v={formatWholeDollars(stats?.revenue30d ?? 0)} big />
          <KV
            k={t('sp.stats.d7')}
            v={formatWholeDollars(stats?.revenue7d ?? 0)}
            delta={stats?.revenue7dPct ?? null}
          />
          <KV k={t('sp.stats.todayCap')} v={formatWholeDollars(stats?.revenueToday ?? 0)} />
          <KV
            k={t('sp.stats.payersAvg')}
            v={`${stats?.payers30d ?? 0} · ${formatCents(stats?.avgCheck30d ?? 0)}`}
            small
          />
          {bars}
        </Section>

        {stats !== undefined && stats.tiers.length > 0 && (
          <Section cap={t('sp.stats.byShelf')} meta={t('sp.stats.window30Short')}>
            {stats.tiers.map((tier) => (
              <button
                key={tier.listId}
                type="button"
                onClick={() => setChip(tier.listId === UNTIERED_ID ? 'all' : tier.listId)}
                className="flex w-full cursor-pointer items-center gap-2 py-[3px] text-left hover:bg-bg2"
              >
                <span className="min-w-0 flex-shrink truncate text-[11.5px] font-semibold text-ink-mid">
                  {tierTitle(tier.listId, tier.title)}
                </span>
                <span className="flex-1" />
                <span className="num text-[11px] font-semibold">{formatWholeDollars(tier.revenue)}</span>
              </button>
            ))}
          </Section>
        )}

        {stats !== undefined && (stats.hotCount > 0 || radarRows.length > 0) && (
          <Section cap={t('sp.stats.reactivation')} meta={t('sp.stats.clickTier')}>
            <HotSummary stats={stats} t={t} compact />
            {radarRows.map((row) => (
              <button
                key={row.listId}
                type="button"
                onClick={() => setChip(row.listId)}
                className="flex w-full cursor-pointer items-center gap-2 py-[3px] text-left hover:bg-bg2"
              >
                <span className="min-w-0 flex-shrink truncate text-[11.5px] font-semibold text-ink-mid">
                  {row.title}
                </span>
                <span className="flex-1" />
                <RadarCounts warm={row.warm} hot={row.hot} />
              </button>
            ))}
          </Section>
        )}

        {stats !== undefined && stats.waiting.length > 0 && (
          <Section cap={t('sp.stats.waiting')} meta={t('sp.stats.clickPreview')}>
            {stats.waiting.slice(0, 4).map((row) => (
              <FanLine key={row.fanId} row={row} onOpen={openPreview}>
                <span className="num text-[10px] text-ink-mid">
                  {row.lifetimeSpend !== null ? formatWholeDollars(row.lifetimeSpend) : '—'}
                </span>
                <span className="num text-[8.5px] tracking-[0.05em] text-ink-low">
                  {dayCounter(t, row.fanDays)}
                </span>
              </FanLine>
            ))}
          </Section>
        )}

        {stats !== undefined && stats.newSpenders.length > 0 && (
          <Section cap={t('sp.stats.new30')} last>
            {stats.newSpenders.slice(0, 4).map((entry) => (
              <FanLine key={entry.row.fanId} row={entry.row} onOpen={openPreview}>
                <span className="num text-[10px] font-semibold text-green">
                  {'+' + formatWholeDollars(entry.row.spend30d ?? 0)}
                </span>
                <span className="num text-[8.5px] text-ink-low">×{entry.txCount}</span>
              </FanLine>
            ))}
          </Section>
        )}

        <div className="num px-3.5 py-2.5 text-[8px] tracking-[0.04em] text-ink-low">
          {t('sp.stats.retentionNote')}
        </div>
      </aside>
    );
  }

  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-[18px]">
      <div className="mx-0.5 mb-3 flex items-baseline gap-2.5">
        <h4 className="font-serif text-[15px] font-semibold">{t('sp.stats.title')}</h4>
        <span className="num text-[9.5px] tracking-[0.05em] text-ink-low">
          {t('sp.stats.localNote')}
        </span>
        <button
          type="button"
          onClick={toggle}
          className="num ml-auto flex cursor-pointer items-center gap-1.5 text-[9px] tracking-[0.06em] text-ink-low hover:text-ink-mid"
        >
          {t('sp.stats.collapse')} <Kbd>S</Kbd>
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Card wide capText={t('sp.stats.revenue')} meta={t('sp.stats.windowNote')}>
          <div className="mb-3 flex items-baseline gap-6">
            <BigStat label={t('sp.stats.d30')} value={formatWholeDollars(stats?.revenue30d ?? 0)} />
            <BigStat
              label={t('sp.stats.d7')}
              value={formatWholeDollars(stats?.revenue7d ?? 0)}
              delta={stats?.revenue7dPct ?? null}
              deltaNote={t('sp.stats.prev7')}
            />
            <BigStat label={t('sp.stats.todayCap')} value={formatWholeDollars(stats?.revenueToday ?? 0)} />
            <BigStat
              label={t('sp.stats.payers')}
              value={String(stats?.payers30d ?? 0)}
              note={t('sp.stats.fansWord')}
            />
            <BigStat label={t('sp.stats.avgCheck')} value={formatCents(stats?.avgCheck30d ?? 0)} />
          </div>
          {bars}
        </Card>

        <Card capText={`${t('sp.stats.byShelf')} · ${t('sp.stats.d30')}`}>
          {stats === undefined || stats.tiers.length === 0 ? (
            <EmptyBlock t={t} />
          ) : (
            stats.tiers.map((tier) => (
              <button
                key={tier.listId}
                type="button"
                onClick={() => setChip(tier.listId === UNTIERED_ID ? 'all' : tier.listId)}
                className="grid w-full cursor-pointer grid-cols-[96px_1fr_64px_44px] items-center gap-2.5 border-t border-bg2 py-1.5 text-left first:border-t-0 hover:bg-bg2"
              >
                <span className="truncate text-[12px] font-semibold text-ink-mid">
                  {tierTitle(tier.listId, tier.title)}
                </span>
                <span className="h-[5px] overflow-hidden rounded-[3px] bg-bg2">
                  <span
                    className="block h-full rounded-[3px] bg-line-strong"
                    style={{ width: `${Math.round((tier.revenue / maxTier) * 100)}%` }}
                  />
                </span>
                <span className="num text-right text-[11px] font-semibold">
                  {formatWholeDollars(tier.revenue)}
                </span>
                <span className="num text-right text-[9px] text-ink-low">
                  {t('sp.stats.paidShort', { n: tier.payers })}
                </span>
              </button>
            ))
          )}
        </Card>

        <Card capText={t('sp.stats.reactivation')} meta={t('sp.stats.clickTier')}>
          {stats === undefined || (stats.hotCount === 0 && radarRows.length === 0) ? (
            <EmptyBlock t={t} />
          ) : (
            <>
              <HotSummary stats={stats} t={t} />
              {radarRows.map((row) => (
                <button
                  key={row.listId}
                  type="button"
                  onClick={() => setChip(row.listId)}
                  className="grid w-full cursor-pointer grid-cols-[96px_1fr_1fr_70px] items-center gap-2.5 border-t border-bg2 py-1.5 text-left first:border-t-0 hover:bg-bg2"
                >
                  <span className="truncate text-[12px] font-semibold text-ink-mid">{row.title}</span>
                  <span className="num flex items-center gap-1.5 text-[10px] text-ink-mid">
                    <span className={cx('h-[7px] w-[7px] rounded-full', SILENCE_DOT.warm)} />
                    <b className="font-semibold text-ink">{row.warm}</b> {t('sp.stats.warmWord')}
                  </span>
                  <span className="num flex items-center gap-1.5 text-[10px] text-ink-mid">
                    <span className={cx('h-[7px] w-[7px] rounded-full', SILENCE_DOT.hot)} />
                    <b className="font-semibold text-ink">{row.hot}</b> {t('sp.stats.hotWord')}
                  </span>
                  <span className="num text-right text-[10px] text-ink-low">
                    {formatWholeDollars(row.silentLifetime)}
                  </span>
                </button>
              ))}
            </>
          )}
        </Card>

        <Card capText={t('sp.stats.waiting')} meta={t('sp.stats.clickPreview')}>
          {stats === undefined || stats.waiting.length === 0 ? (
            <EmptyBlock t={t} />
          ) : (
            stats.waiting.map((row) => (
              <FanLine key={row.fanId} row={row} onOpen={openPreview} bordered>
                <span className="num text-[10px] text-ink-mid">
                  {row.lifetimeSpend !== null ? formatWholeDollars(row.lifetimeSpend) : '—'}
                </span>
                <span className="num flex items-center gap-1.5 text-[9px] tracking-[0.05em] text-ink-low">
                  {row.fanDays !== null && row.fanDays === 0 && (
                    <span className="h-[7px] w-[7px] rounded-full bg-clay" />
                  )}
                  {dayCounter(t, row.fanDays)}
                </span>
              </FanLine>
            ))
          )}
        </Card>

        <Card capText={t('sp.stats.new30')} meta={t('sp.stats.firstBuy')}>
          {stats === undefined || stats.newSpenders.length === 0 ? (
            <EmptyBlock t={t} />
          ) : (
            stats.newSpenders.map((entry) => (
              <FanLine key={entry.row.fanId} row={entry.row} onOpen={openPreview} bordered>
                <span className="num text-[10px] font-semibold text-green">
                  {'+' + formatWholeDollars(entry.row.spend30d ?? 0)}
                </span>
                <span className="num text-[9px] text-ink-low">×{entry.txCount}</span>
              </FanLine>
            ))
          )}
        </Card>
      </div>
      <div className="num mt-3 px-0.5 text-[9px] tracking-[0.04em] text-ink-low">
        {t('sp.stats.retentionNote')}
      </div>
    </div>
  );
}

// ─── building blocks ───────────────────────────────────────────────────────

type Translator = ReturnType<typeof useT>;

function Section({
  cap,
  meta,
  last = false,
  children,
}: {
  cap: string;
  meta?: string;
  last?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className={cx('px-3.5 pt-2.5 pb-3', !last && 'border-b border-line')}>
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="text-micro font-semibold tracking-[0.12em] text-ink-low uppercase">{cap}</span>
        <span className="flex-1" />
        {meta !== undefined && (
          <span className="num text-[8.5px] tracking-[0.05em] text-ink-low">{meta}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function KV({
  k,
  v,
  big = false,
  small = false,
  delta,
}: {
  k: string;
  v: string;
  big?: boolean;
  small?: boolean;
  delta?: number | null;
}): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-2 py-0.5">
      <span className="text-[11px] text-ink-mid">{k}</span>
      <span className="flex-1" />
      {delta !== undefined && delta !== null && <Delta pct={delta} />}
      <span className={cx('num font-semibold', big ? 'text-[16px]' : small ? 'text-[11px]' : 'text-[13px]')}>
        {v}
      </span>
    </div>
  );
}

function Delta({ pct }: { pct: number }): React.JSX.Element {
  return (
    <span className={cx('num text-[9.5px] font-semibold', pct >= 0 ? 'text-green' : 'text-clay-deep')}>
      {pct >= 0 ? '+' : ''}
      {pct}%
    </span>
  );
}

function BigStat({
  label,
  value,
  note,
  delta,
  deltaNote,
}: {
  label: string;
  value: string;
  note?: string;
  delta?: number | null;
  deltaNote?: string;
}): React.JSX.Element {
  return (
    <div>
      <div className="text-[10px] font-semibold tracking-[0.1em] text-ink-low uppercase">{label}</div>
      <div className="num mt-px text-[21px] font-semibold">
        {value}
        {delta !== undefined && delta !== null && (
          <>
            {' '}
            <Delta pct={delta} /> <span className="text-[11px] font-normal text-ink-low">{deltaNote}</span>
          </>
        )}
        {note !== undefined && <span className="text-[11px] font-normal text-ink-low"> {note}</span>}
      </div>
    </div>
  );
}

function Card({
  capText,
  meta,
  wide = false,
  children,
}: {
  capText: string;
  meta?: string;
  wide?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className={cx('overflow-hidden rounded-lg border border-line bg-bg1', wide && 'col-span-2')}>
      <div className="flex items-baseline gap-2 px-3.5 pt-2.5">
        <span className="text-micro font-semibold tracking-[0.12em] text-ink-low uppercase">{capText}</span>
        <span className="flex-1" />
        {meta !== undefined && (
          <span className="num text-[9px] tracking-[0.05em] text-ink-low">{meta}</span>
        )}
      </div>
      <div className="px-3.5 pt-2 pb-3">{children}</div>
    </div>
  );
}

function HotSummary({
  stats,
  t,
  compact = false,
}: {
  stats: SpenderStatsVM;
  t: Translator;
  compact?: boolean;
}): React.JSX.Element {
  return (
    <div
      className={cx(
        'mb-1.5 flex items-baseline gap-2 rounded-md border border-amber-line bg-amber-bg',
        compact ? 'px-2 py-1' : 'px-2.5 py-1.5',
      )}
    >
      <span className={cx('num font-semibold', compact ? 'text-[12px]' : 'text-[13px]')}>
        {stats.hotCount}
      </span>
      <span className={cx('text-ink-mid', compact ? 'text-[10.5px]' : 'text-[11.5px]')}>
        {t('sp.stats.hotSummary', { sum: formatWholeDollars(stats.hotLifetime) })}
      </span>
    </div>
  );
}

function FanLine({
  row,
  onOpen,
  bordered = false,
  children,
}: {
  row: SpenderRowVM;
  onOpen: (fanId: string) => void;
  bordered?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onOpen(row.fanId)}
      className={cx(
        'flex w-full cursor-pointer items-center gap-2 py-[3.5px] text-left hover:bg-bg2',
        bordered && 'border-t border-bg2 py-1.5 first:border-t-0',
      )}
    >
      <Avatar name={row.name} url={row.avatarUrl} size={bordered ? 28 : 24} radius={bordered ? 8 : 7} />
      <span className="min-w-0 flex-shrink truncate text-[12px] font-semibold">{row.name}</span>
      <span className="flex-1" />
      {children}
    </button>
  );
}

function RadarCounts({ warm, hot }: { warm: number; hot: number }): React.JSX.Element {
  return (
    <>
      {warm > 0 && (
        <span className="num flex items-center gap-1 text-[10px] text-ink-mid">
          <span className={cx('h-[7px] w-[7px] rounded-full', SILENCE_DOT.warm)} />
          <b className="font-semibold text-ink">{warm}</b>
        </span>
      )}
      {hot > 0 && (
        <span className="num flex items-center gap-1 text-[10px] text-ink-mid">
          <span className={cx('h-[7px] w-[7px] rounded-full', SILENCE_DOT.hot)} />
          <b className="font-semibold text-ink">{hot}</b>
        </span>
      )}
    </>
  );
}

function EmptyBlock({ t }: { t: Translator }): React.JSX.Element {
  return <div className="num py-2 text-[10px] text-ink-low">{t('sp.stats.emptyBlock')}</div>;
}
