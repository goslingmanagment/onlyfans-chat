import { cx } from '../lib/cx';

/** Quiet filter / tone pill (mockup .fchip): selected = ink-on-ivory inversion. */
export function Chip({
  selected = false,
  onClick,
  children,
  title,
}: {
  selected?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  title?: string;
}): React.JSX.Element {
  return (
    <button
      type="button"
      {...(onClick !== undefined ? { onClick } : {})}
      {...(title !== undefined ? { title } : {})}
      className={cx(
        'cursor-pointer rounded-full border border-transparent px-3 py-1 text-[12.5px] font-medium transition-colors duration-150',
        selected ? 'bg-ink text-bg1' : 'text-ink-mid hover:bg-bg2',
      )}
    >
      {children}
    </button>
  );
}
