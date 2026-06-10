import { cx } from '../lib/cx';

export function Skeleton({ className }: { className?: string }): React.JSX.Element {
  return <div className={cx('animate-pulse rounded-chip bg-bg3', className)} />;
}

/** Chat-list loading placeholder — mirrors row geometry to avoid layout shift. */
export function SkeletonRows({ count = 8 }: { count?: number }): React.JSX.Element {
  return (
    <div>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-[11px] border-b border-line px-[14px] py-3">
          <Skeleton className="h-10 w-10 rounded-ava" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-44" />
          </div>
          <Skeleton className="h-3 w-8" />
        </div>
      ))}
    </div>
  );
}

/** Conversation loading placeholder — alternating bubble ghosts. */
export function SkeletonThread(): React.JSX.Element {
  const widths = ['w-2/5', 'w-1/2', 'w-1/3', 'w-3/5', 'w-2/5', 'w-1/2'];
  return (
    <div className="flex flex-1 flex-col justify-end gap-3 px-6 py-5">
      {widths.map((w, i) => (
        <Skeleton
          key={i}
          className={cx('h-12 rounded-bubble', w, i % 2 === 0 ? 'self-start' : 'self-end')}
        />
      ))}
    </div>
  );
}
