import { cx } from '../lib/cx';

/**
 * CSS-only hover tooltip (activity-panel mockup .sbar [data-tip]): dark ink
 * bubble above the anchor, 270px, sans 12px, left-anchored arrow. Pure
 * hover — no JS, no portals, nothing re-renders (DESIGN §3).
 */
export function Tooltip({
  tip,
  children,
  className,
}: {
  tip: string;
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <span className={cx('group/tip relative', className)}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full left-[-6px] z-50 mb-[9px] block w-[270px] rounded-chip bg-ink px-[11px] py-2 text-left font-sans text-[12px] font-normal normal-case leading-[1.45] tracking-normal text-bg1 shadow-pop group-hover/tip:visible"
      >
        {tip}
        <span className="absolute left-[14px] top-full border-[6px] border-transparent border-t-ink" />
      </span>
    </span>
  );
}
