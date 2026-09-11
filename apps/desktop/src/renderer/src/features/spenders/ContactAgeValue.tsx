import { memo } from 'react';
import type { UiTranslator } from '@chatgoose/shared/i18n/index';
import { localeTag, useLocale } from '../../lib/i18n';
import { contactTimestamp, formatContactAge } from './contactAge';

/** Compact value with the exact local date available by hover/assistive tech. */
export const ContactAge = memo(function ContactAge({
  at,
  now,
  label,
  t,
}: {
  at: string | null;
  now: number;
  label: string;
  t: UiTranslator;
}): React.JSX.Element {
  const locale = useLocale();
  const ms = contactTimestamp(at);
  if (ms === null) {
    return <span className="text-ink-low" title={t('sp.contactUnknown')} aria-label={`${label}: ${t('sp.contactUnknown')}`}>—</span>;
  }
  const exact = new Date(ms).toLocaleString(localeTag(locale), {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const description = `${label}: ${exact}`;
  return (
    <time dateTime={at ?? undefined} title={description} aria-label={description}>
      {formatContactAge(at, now, t)}
    </time>
  );
});
