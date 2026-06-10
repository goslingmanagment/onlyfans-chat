import { cx } from '../lib/cx';

/**
 * Flat scannable row (mockup .row): hover wash, selected = bg2 + terracotta
 * left bar. Used by the palette and settings lists; the chat list builds its
 * denser variant on the same visual grammar.
 */
export function ListRow({
  selected = false,
  onClick,
  leading,
  title,
  subtitle,
  trailing,
}: {
  selected?: boolean;
  onClick?: () => void;
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      {...(onClick !== undefined ? { onClick } : {})}
      className={cx(
        'relative flex w-full cursor-pointer items-center gap-[11px] border-b border-line px-[14px] py-[10px] text-left',
        selected ? 'bg-bg2' : 'bg-bg1 hover:bg-bg2',
      )}
    >
      {selected && <span className="absolute top-0 bottom-0 left-0 w-[3px] bg-clay" />}
      {leading !== undefined && <span className="flex-none">{leading}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold">{title}</span>
        {subtitle !== undefined && (
          <span className="mt-[2px] block truncate text-[13px] text-ink-mid">{subtitle}</span>
        )}
      </span>
      {trailing !== undefined && <span className="flex flex-none items-center gap-2">{trailing}</span>}
    </button>
  );
}
