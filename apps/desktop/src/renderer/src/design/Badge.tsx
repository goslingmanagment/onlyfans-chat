import { cx } from '../lib/cx';

export type BadgeTone = 'neutral' | 'green' | 'green-filled' | 'amber' | 'bad' | 'clay' | 'seen';

const TONES: Record<BadgeTone, string> = {
  neutral: 'text-ink-mid border-line bg-bg2',
  green: 'text-green border-green-line bg-green-bg',
  'green-filled': 'text-white border-green bg-green',
  amber: 'text-amber border-amber-line bg-amber-bg',
  bad: 'text-bad border-bad/35 bg-bad/8',
  clay: 'text-clay-deep border-clay-line bg-clay-bg',
  seen: 'text-seen border-seen/30 bg-seen/8',
};

/** Pill badge; `mono` for money/state figures (PPV chips, tip pills). */
export function Badge({
  tone = 'neutral',
  mono = false,
  title,
  children,
  className,
}: {
  tone?: BadgeTone;
  mono?: boolean;
  title?: string;
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <span
      {...(title !== undefined ? { title } : {})}
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-[9px] py-[2px] text-[11px] font-medium',
        mono && 'num font-semibold',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
