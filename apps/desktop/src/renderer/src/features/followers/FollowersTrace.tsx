import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { getBridge } from '../../bridge/bridge';
import { Button } from '../../design/Button';
import { formatFollowerTime, useFollowersCopy } from './copy';
import { followerKey, FOLLOWERS_QUERY_POLICY } from './queries';

export function FollowersTrace({
  accountId,
  onClose,
}: {
  accountId: string;
  onClose: () => void;
}): React.JSX.Element {
  const { c, locale } = useFollowersCopy();
  const [runId, setRunId] = useState('');
  const [fanId, setFanId] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<string | null>(null);
  const query = useQuery({
    ...FOLLOWERS_QUERY_POLICY,
    queryKey: [
      ...followerKey(accountId),
      'trace',
      runId,
      fanId,
      search,
      offset,
    ],
    queryFn: () =>
      getBridge().invoke('query:followers.trace', {
        accountId,
        offset,
        ...(runId ? { runId } : {}),
        ...(fanId ? { fanId } : {}),
        ...(search ? { search } : {}),
      }),
  });
  const events = query.data?.events ?? [];
  const scroll = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 62,
    getItemKey: (i) => events[i]?.seq ?? i,
    overscan: 10,
  });
  const inputClass =
    'min-w-0 rounded-chip border border-line bg-bg1 px-2 py-1.5 text-[12px] outline-none focus:border-clay';
  async function exportTrace(): Promise<void> {
    setExporting(true);
    setExportResult(null);
    try {
      const result = await getBridge().invoke('cmd:followers.export', {
        accountId,
        ...(runId ? { runId } : {}),
      });
      if (result.path !== null)
        setExportResult(`${c.exported}: ${result.path}`);
    } catch (error) {
      setExportResult(error instanceof Error ? error.message : String(error));
    } finally {
      setExporting(false);
    }
  }
  return (
    <section
      aria-label={c.trace}
      className="absolute inset-x-3 bottom-3 z-20 flex h-[62%] min-h-[300px] flex-col rounded-panel border border-line-strong bg-bg1 shadow-lg"
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2">
        <h2 className="font-serif text-[18px] font-semibold">{c.trace}</h2>
        <span className="num text-[11px] text-ink-low">
          {query.data?.total ?? 0}
        </span>
        <span className="flex-1" />
        <Button
          size="sm"
          disabled={exporting || (query.data?.runs.length ?? 0) === 0}
          onClick={() => {
            void exportTrace();
          }}
        >
          {c.export}
        </Button>
        <Button size="sm" variant="subtle" onClick={onClose}>
          {c.close}
        </Button>
      </header>
      <div className="flex flex-wrap gap-2 border-b border-line px-4 py-2">
        <select
          aria-label={c.run}
          value={runId}
          onChange={(e) => {
            setRunId(e.target.value);
            setOffset(0);
          }}
          className={inputClass}
        >
          <option value="">
            {c.run} · {c.latest}
          </option>
          {query.data?.runs.map((run) => (
            <option key={run.id} value={run.id}>
              {formatFollowerTime(run.startedAt, locale)} · {run.id}
            </option>
          ))}
        </select>
        <input
          aria-label={c.fan}
          placeholder={c.fan}
          value={fanId}
          onChange={(e) => {
            setFanId(e.target.value);
            setOffset(0);
          }}
          className={`${inputClass} w-32`}
        />
        <input
          type="search"
          aria-label={c.traceSearch}
          placeholder={c.traceSearch}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
          className={`${inputClass} flex-1`}
        />
      </div>
      {query.error && (
        <p role="alert" className="px-4 py-1 text-[12px] text-bad">
          {query.error.message}
        </p>
      )}
      {exportResult && (
        <p
          role="status"
          className="truncate px-4 py-1 text-[12px] text-ink-mid"
        >
          {exportResult}
        </p>
      )}
      {(query.data?.dropped ?? 0) > 0 && (
        <p className="px-4 py-1 text-[12px] text-amber">
          {c.dropped}: {query.data?.dropped}
        </p>
      )}
      <div ref={scroll} className="min-h-0 flex-1 overflow-auto px-4">
        {events.length === 0 ? (
          <p className="py-6 text-center text-ink-low">
            {query.isPending ? c.loading : c.noEvents}
          </p>
        ) : (
          <div
            style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
          >
            {virtualizer.getVirtualItems().map((item) => {
              const event = events[item.index];
              return event === undefined ? null : (
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
                  className="border-b border-line py-2 font-mono text-[11px]"
                >
                  <p className="flex flex-wrap gap-x-3 text-ink-mid">
                    <span>{event.at}</span>
                    <span>+{event.elapsedMs.toFixed(1)} ms</span>
                    <span>{event.fanId ?? '—'}</span>
                    <strong>{event.event}</strong>
                  </p>
                  <p className="mt-1 break-all text-ink-low">
                    {JSON.stringify(event.detail)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <footer className="flex items-center justify-between border-t border-line px-4 py-2">
        <Button
          size="sm"
          variant="subtle"
          disabled={offset === 0 || query.isPending}
          onClick={() => {
            setOffset(Math.max(0, offset - 1000));
            scroll.current?.scrollTo(0, 0);
          }}
        >
          {c.previous}
        </Button>
        <span className="num text-[11px] text-ink-low">
          {offset + (events.length > 0 ? 1 : 0)}–{offset + events.length} /{' '}
          {query.data?.total ?? 0}
        </span>
        <Button
          size="sm"
          variant="subtle"
          disabled={
            offset + events.length >= (query.data?.total ?? 0) ||
            query.isPending
          }
          onClick={() => {
            setOffset(offset + 1000);
            scroll.current?.scrollTo(0, 0);
          }}
        >
          {c.next}
        </Button>
      </footer>
    </section>
  );
}
