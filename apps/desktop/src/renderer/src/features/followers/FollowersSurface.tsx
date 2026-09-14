import { memo, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import type {
  FollowerRowVM,
  FollowerStatus,
} from '../../../../preload/followers-contract';
import { getBridge } from '../../bridge/bridge';
import { useAccounts, useSettings } from '../../bridge/queries';
import { useUiStore } from '../../state/uiStore';
import { Button } from '../../design/Button';
import { Avatar } from '../../design/Avatar';
import { cx } from '../../lib/cx';
import { formatFollowerTime, useFollowersCopy } from './copy';
import { followerKey, FOLLOWERS_QUERY_POLICY } from './queries';
import { FollowerDetail } from './FollowerDetail';
import { FollowersTrace } from './FollowersTrace';

const PAGE_SIZE = 100;
const FILTERS = [
  'all',
  'ready',
  'replied',
  'contacted',
  'unknown',
  'blocked',
  'sent',
  'pending',
  'checking',
  'sending',
] as const;
const field =
  'rounded-chip border border-line bg-bg1 px-3 py-1.5 text-[13px] outline-none focus:border-clay';

export function FollowersSurface(): React.JSX.Element {
  const accountId = useUiStore((s) => s.selectedAccountId);
  const { c } = useFollowersCopy();
  return accountId === null ? (
    <div className="flex flex-1 items-center justify-center text-ink-low">
      {c.select}
    </div>
  ) : (
    <AccountFollowers key={accountId} accountId={accountId} />
  );
}

function AccountFollowers({
  accountId,
}: {
  accountId: string;
}): React.JSX.Element {
  const { c, status, locale } = useFollowersCopy();
  const debugMode = useSettings().data?.debugMode;
  const setView = useUiStore((s) => s.setView);
  const account = useAccounts().data?.find((a) => a.id === accountId);
  const [hours, setHours] = useState(24);
  const [acknowledged, setAcknowledged] = useState(false);
  const [filter, setFilter] = useState<FollowerStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [fanId, setFanId] = useState<string | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const client = useQueryClient();
  const snapshotQuery = useQuery({
    ...FOLLOWERS_QUERY_POLICY,
    queryKey: [...followerKey(accountId), 'snapshot', filter, search, offset],
    queryFn: () =>
      getBridge().invoke('query:followers.snapshot', {
        accountId,
        offset,
        limit: PAGE_SIZE,
        filter,
        search,
      }),
  });
  const snapshot = snapshotQuery.data;
  const rows = snapshot?.rows ?? [];
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 94,
    overscan: 8,
    getItemKey: (i) => rows[i]?.fanId ?? i,
  });
  const runId = snapshot?.runId;
  const previousRun = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (runId === undefined) return;
    if (previousRun.current !== undefined && previousRun.current !== runId)
      setFanId(null);
    previousRun.current = runId;
  }, [runId]);
  // Results can shrink as statuses advance; do not strand the queue on a now-empty page.
  useEffect(() => {
    if (snapshot !== undefined && offset > 0 && offset >= snapshot.matching)
      setOffset(
        Math.max(0, Math.ceil(snapshot.matching / PAGE_SIZE) - 1) * PAGE_SIZE,
      );
  }, [snapshot, offset]);
  async function act(action: () => Promise<unknown>): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      await client.invalidateQueries({ queryKey: followerKey(accountId) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const running = snapshot?.state === 'running';
  const paused = snapshot?.state === 'paused' || snapshot?.state === 'error';
  const showStart = !running && !paused;
  const pageCount = Math.max(
    1,
    Math.ceil((snapshot?.matching ?? 0) / PAGE_SIZE),
  );

  return (
    <section
      onKeyDownCapture={(e) => {
        if (e.key === 'Escape' && traceOpen) {
          e.preventDefault();
          e.stopPropagation();
          setTraceOpen(false);
        }
      }}
      className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-bg1"
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-6 py-3">
        <h1 className="font-serif text-[22px] font-semibold">{c.title}</h1>
        <span className="text-[13px] text-ink-low">{account?.displayName}</span>
        <span className="flex-1" />
        {(debugMode ?? snapshot?.debug) === true && (
          <Button size="sm" onClick={() => setTraceOpen(true)}>
            {c.trace}
          </Button>
        )}
        <Button variant="subtle" size="sm" onClick={() => setView('workspace')}>
          {c.back}
        </Button>
      </header>
      <div className="space-y-2 border-b border-line bg-bg2/40 px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[13px] text-ink-mid">
            {c.hours}
            <select
              aria-label={c.hours}
              value={hours}
              disabled={!showStart || busy}
              onChange={(e) => setHours(Number(e.target.value))}
              className={field}
            >
              {[24, 48, 72, 168].map((h) => (
                <option key={h} value={h}>
                  {h} {c.hour}
                </option>
              ))}
            </select>
          </label>
          {showStart && (
            <Button
              size="sm"
              variant="primary"
              disabled={!acknowledged || busy}
              onClick={() => {
                void act(() =>
                  getBridge().invoke('cmd:followers.start', {
                    accountId,
                    hours,
                    acknowledgeRead: true,
                  }),
                );
              }}
            >
              {snapshot?.runId ? c.restart : c.start}
            </Button>
          )}
          {running && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                void act(() =>
                  getBridge().invoke('cmd:followers.pause', { accountId }),
                );
              }}
            >
              {c.pause}
            </Button>
          )}
          {paused && (
            <Button
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={() => {
                void act(() =>
                  getBridge().invoke('cmd:followers.resume', { accountId }),
                );
              }}
            >
              {c.resume}
            </Button>
          )}
          {snapshot !== undefined && snapshot.runId !== null && (
            <span className="num text-[12px] text-ink-mid">
              {c.checked} {snapshot.checked}/{snapshot.total} · {c.requests}{' '}
              {snapshot.requests}
            </span>
          )}
          <span className="text-[13px] text-ink-mid" role="status">
            {snapshot?.stage}
          </span>
        </div>
        {showStart && (snapshot?.runId == null || !acknowledged) && (
          <>
            <label className="flex max-w-[900px] items-start gap-2 text-[12.5px] text-ink-mid">
              <input
                type="checkbox"
                className="mt-0.5 accent-clay"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
              {c.acknowledge}
            </label>
            <p className="max-w-[900px] text-[12px] text-ink-low">{c.cost}</p>
          </>
        )}
        {snapshot?.from && snapshot.to && (
          <p className="num text-[11px] text-ink-low">
            {c.range}: {formatFollowerTime(snapshot.from, locale)} —{' '}
            {formatFollowerTime(snapshot.to, locale)}
          </p>
        )}
        {snapshot?.cooldownUntil !== null &&
          snapshot?.cooldownUntil !== undefined &&
          snapshot.cooldownUntil > Date.now() && (
            <p className="text-[13px] text-amber" role="status">
              {c.cooldown}{' '}
              {formatFollowerTime(
                new Date(snapshot.cooldownUntil).toISOString(),
                locale,
              )}
            </p>
          )}
        {snapshot?.truncated === true && (
          <p className="text-[13px] text-amber">{c.truncated}</p>
        )}
        {(error ?? snapshot?.error ?? snapshotQuery.error?.message) && (
          <p role="alert" className="text-[13px] text-bad">
            {error ?? snapshot?.error ?? snapshotQuery.error?.message}
          </p>
        )}
        {snapshot !== undefined && snapshot.total > 0 && (
          <div
            role="progressbar"
            aria-label={c.checked}
            aria-valuenow={snapshot.checked}
            aria-valuemax={snapshot.total}
            className="h-0.5 w-full bg-line"
          >
            <div
              className="h-full bg-clay"
              style={{
                width: `${Math.min(100, (100 * snapshot.checked) / snapshot.total)}%`,
              }}
            />
          </div>
        )}
      </div>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[340px] min-w-[280px] max-w-[42%] flex-none flex-col border-r border-line">
          <div className="space-y-2 border-b border-line px-4 py-3">
            <input
              type="search"
              aria-label={c.search}
              placeholder={c.search}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
              className={`${field} w-full`}
            />
            <select
              aria-label={c.all}
              className={`${field} w-full`}
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value as FollowerStatus | 'all');
                setOffset(0);
              }}
            >
              {FILTERS.map((f) => (
                <option key={f} value={f}>
                  {f === 'all' ? c.all : status[f]} ·{' '}
                  {f === 'all'
                    ? (snapshot?.total ?? 0)
                    : (snapshot?.counts[f] ?? 0)}
                </option>
              ))}
            </select>
          </div>
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto"
            aria-label={c.title}
          >
            {rows.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] text-ink-low">
                {snapshotQuery.isPending
                  ? c.loading
                  : snapshot?.runId
                    ? c.empty
                    : c.idle}
              </p>
            ) : (
              <div
                style={{
                  height: virtualizer.getTotalSize(),
                  position: 'relative',
                }}
              >
                {virtualizer.getVirtualItems().map((item) => {
                  const row = rows[item.index];
                  return row === undefined ? null : (
                    <div
                      key={item.key}
                      data-index={item.index}
                      ref={virtualizer.measureElement}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${item.start}px)`,
                      }}
                    >
                      <FollowerListRow
                        row={row}
                        selected={row.fanId === fanId}
                        onSelect={setFanId}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <footer className="flex items-center justify-between gap-2 border-t border-line px-3 py-2 text-[11px] text-ink-low">
            <Button
              size="sm"
              variant="subtle"
              title={c.previous}
              disabled={offset === 0 || snapshotQuery.isPending}
              onClick={() => {
                setOffset(Math.max(0, offset - PAGE_SIZE));
                scrollRef.current?.scrollTo(0, 0);
              }}
            >
              ←
            </Button>
            <span className="num">
              {c.page} {Math.floor(offset / PAGE_SIZE) + 1}/{pageCount} ·{' '}
              {snapshot?.matching ?? 0}
            </span>
            <Button
              size="sm"
              variant="subtle"
              title={c.next}
              disabled={
                offset + PAGE_SIZE >= (snapshot?.matching ?? 0) ||
                snapshotQuery.isPending
              }
              onClick={() => {
                setOffset(offset + PAGE_SIZE);
                scrollRef.current?.scrollTo(0, 0);
              }}
            >
              →
            </Button>
          </footer>
        </aside>
        {fanId === null ? (
          <div className="flex flex-1 items-center justify-center text-[14px] text-ink-low">
            {c.select}
          </div>
        ) : (
          <FollowerDetail
            key={`${accountId}/${runId ?? ''}/${fanId}`}
            accountId={accountId}
            fanId={fanId}
            scanRunning={running}
          />
        )}
      </div>
      {traceOpen && (debugMode ?? snapshot?.debug) === true && (
        <FollowersTrace
          accountId={accountId}
          onClose={() => setTraceOpen(false)}
        />
      )}
    </section>
  );
}

const FollowerListRow = memo(function FollowerListRow({
  row,
  selected,
  onSelect,
}: {
  row: FollowerRowVM;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const { c, status, locale } = useFollowersCopy();
  return (
    <button
      type="button"
      onClick={() => onSelect(row.fanId)}
      aria-pressed={selected}
      className={cx(
        'flex w-full items-start gap-3 border-b border-line border-l-[3px] px-4 py-3 text-left',
        selected
          ? 'border-l-clay bg-clay-bg'
          : 'border-l-transparent hover:bg-bg2',
      )}
    >
      <Avatar name={row.name} url={row.avatarUrl} size={34} radius={17} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold">
          {row.name || row.username || row.fanId}
          {row.hasDraft && (
            <span className="ml-2 text-[11px] text-ink-low">✎</span>
          )}
        </p>
        <p className="truncate text-[11px] text-ink-low">
          @{row.username} ·{' '}
          {row.subscribedAt
            ? formatFollowerTime(row.subscribedAt, locale)
            : c.unknownDate}
        </p>
        <p
          className={cx(
            'mt-1 truncate text-[12px]',
            row.status === 'ready' ? 'text-clay-deep' : 'text-ink-mid',
          )}
          title={row.reason}
        >
          {status[row.status]}
        </p>
      </div>
    </button>
  );
});
