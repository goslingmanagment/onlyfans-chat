/** Incoming-message toast card: serif fan name, sans preview, quiet dismiss. */
export function Toast({
  title,
  body,
  onClick,
  onDismiss,
}: {
  title: string;
  body: string;
  onClick?: () => void;
  onDismiss: () => void;
}): React.JSX.Element {
  return (
    <div className="pointer-events-auto flex w-[320px] items-start gap-3 rounded-menu border border-line-strong bg-bg1 p-3 shadow-pop">
      <button
        type="button"
        {...(onClick !== undefined ? { onClick } : {})}
        className="min-w-0 flex-1 cursor-pointer text-left"
      >
        <div className="truncate font-serif text-[14.5px] font-semibold">{title}</div>
        <div className="mt-[2px] line-clamp-2 text-[12.5px] text-ink-mid">{body}</div>
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="cursor-pointer px-1 text-[12px] text-ink-low hover:text-ink"
      >
        ✕
      </button>
    </div>
  );
}
