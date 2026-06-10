export function EmptyState({
  title,
  hint,
  glyph,
}: {
  title: string;
  hint?: React.ReactNode;
  glyph?: string;
}): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
      {glyph !== undefined && <div className="text-[28px] text-ink-low opacity-60">{glyph}</div>}
      <div className="font-serif text-[16px] font-semibold text-ink-mid">{title}</div>
      {hint !== undefined && <div className="max-w-[340px] text-[12.5px] text-ink-low">{hint}</div>}
    </div>
  );
}
