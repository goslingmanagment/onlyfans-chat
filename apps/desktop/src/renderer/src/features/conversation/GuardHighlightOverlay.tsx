import { cx } from '../../lib/cx';
import type { GuardSegment } from './guardLogic';

export function GuardHighlightOverlay({
  segments,
  minHeight,
}: {
  segments: readonly GuardSegment[];
  minHeight: number;
}): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 whitespace-pre-wrap break-words border-0 px-0 py-0 text-msg text-transparent"
      style={{ minHeight }}
    >
      {segments.map((segment, index) => (
        <span
          key={`${segment.start}:${segment.end}:${index}`}
          className={cx(
            segment.span?.category === 'off_platform' && 'rounded-[3px] bg-bad/14 underline decoration-bad decoration-2 underline-offset-2',
            segment.span?.category === 'red' && 'rounded-[3px] bg-bad/16 underline decoration-bad decoration-2 underline-offset-2',
            segment.span?.category === 'yellow' && 'rounded-[3px] bg-warn/16 underline decoration-warn decoration-dotted decoration-2 underline-offset-2',
            segment.span?.category === 'custom' && 'rounded-[3px] bg-clay/16 underline decoration-clay decoration-2 underline-offset-2',
          )}
        >
          {segment.text}
        </span>
      ))}
    </div>
  );
}
