import { useEffect, useState } from 'react';
import { cx } from '../lib/cx';
import { formatAgeShort } from '../lib/time';

/**
 * Honest data-age indicator (PRD §7.3): 'UPDATED 12S AGO', ticking. Mono
 * micro-label; the 1 s tick re-renders only this leaf component.
 */
export function DataAge({
  at,
  prefix = 'UPDATED',
  className,
}: {
  /** ISO string or epoch ms; null/undefined renders an em dash. */
  at: string | number | null | undefined;
  prefix?: string;
  className?: string;
}): React.JSX.Element {
  const [now, setNow] = useState(() => Date.now());
  const active = at !== null && at !== undefined;

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [active]);

  let text = `${prefix} —`;
  if (active) {
    const ts = typeof at === 'number' ? at : Date.parse(at);
    text = `${prefix} ${formatAgeShort(now - ts).toUpperCase()} AGO`;
  }
  return <span className={cx('num text-micro tracking-[0.05em] text-ink-low', className)}>{text}</span>;
}
