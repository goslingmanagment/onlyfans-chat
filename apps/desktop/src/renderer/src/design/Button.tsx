import { cx } from '../lib/cx';

type Variant = 'primary' | 'ghost' | 'subtle' | 'danger';

const VARIANTS: Record<Variant, string> = {
  // mockup .send
  primary:
    'bg-clay text-white font-bold border border-clay hover:bg-clay-deep hover:border-clay-deep disabled:opacity-40 disabled:hover:bg-clay',
  // mockup .aibtn
  ghost:
    'bg-bg2 text-ink-mid font-semibold border border-line hover:text-clay-deep hover:border-clay-line hover:bg-clay-bg disabled:opacity-45 disabled:hover:text-ink-mid disabled:hover:border-line disabled:hover:bg-bg2',
  subtle: 'text-ink-mid font-medium border border-transparent hover:bg-bg2 disabled:opacity-45',
  danger:
    'text-bad font-semibold border border-bad/40 bg-bg1 hover:bg-bad hover:text-white disabled:opacity-45',
};

export interface ButtonProps {
  variant?: Variant;
  size?: 'sm' | 'md';
  pill?: boolean;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}

export function Button({
  variant = 'ghost',
  size = 'md',
  pill = false,
  disabled = false,
  title,
  onClick,
  children,
  className,
}: ButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      {...(title !== undefined ? { title } : {})}
      {...(onClick !== undefined ? { onClick } : {})}
      className={cx(
        'inline-flex cursor-pointer items-center gap-2 transition-colors duration-150 disabled:cursor-default',
        size === 'md' ? 'px-4 py-2 text-[13.5px]' : 'px-[13px] py-1 text-[12.5px]',
        pill ? 'rounded-full' : 'rounded-chip',
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}
