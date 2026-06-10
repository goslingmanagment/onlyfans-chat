import { forwardRef } from 'react';
import { cx } from '../../lib/cx';

export interface DraftTextareaProps {
  id?: string;
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minHeight?: number;
}

/**
 * The composer draft input. Disabled in P1 (companion mode); the AI dock
 * inserts into this same component once P2 lands — keep its API stable.
 */
export const DraftTextarea = forwardRef<HTMLTextAreaElement, DraftTextareaProps>(
  function DraftTextarea(
    { id, value, onChange, placeholder, disabled = false, minHeight = 44 },
    ref,
  ): React.JSX.Element {
    return (
      <textarea
        ref={ref}
        {...(id !== undefined ? { id } : {})}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        {...(placeholder !== undefined ? { placeholder } : {})}
        disabled={disabled}
        rows={2}
        className={cx(
          'w-full resize-none border-0 bg-transparent text-msg text-ink outline-none placeholder:text-ink-low',
          disabled && 'cursor-not-allowed opacity-70',
        )}
        style={{ minHeight }}
      />
    );
  },
);
