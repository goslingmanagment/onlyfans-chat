import type { UiTranslator } from '@chatgoose/shared/i18n/index';

export function QueryFeedback({ label, stale = false, fetching, onRetry, t }: {
  label: string;
  stale?: boolean;
  fetching: boolean;
  onRetry: () => void;
  t: UiTranslator;
}): React.JSX.Element {
  return <div role="status" className="flex items-center gap-3 border-b border-line bg-bg1 px-4 py-3 text-[12px] text-ink-mid">
    <span className="min-w-0 flex-1">{label}{stale && <>. {t('sp.cachedData')}</>}</span>
    <button type="button" disabled={fetching} onClick={onRetry} className="flex-none cursor-pointer text-clay-deep underline decoration-dotted underline-offset-2 disabled:cursor-default disabled:opacity-50">{t('sp.retry')}</button>
  </div>;
}
