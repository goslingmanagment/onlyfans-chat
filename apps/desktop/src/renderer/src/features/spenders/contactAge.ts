import type { UiTranslator } from '@chatgoose/shared/i18n/index';
import type { SpenderRowVM } from '../../../../preload/contract';

export type ContactSide = 'model' | 'fan';
export interface ContactSort {
  side: ContactSide;
  /** Descending AGE means the oldest timestamp comes first. */
  direction: 'asc' | 'desc';
}

export const DEFAULT_CONTACT_SORT: ContactSort = { side: 'fan', direction: 'desc' };

export function contactTimestamp(iso: string | null): number | null {
  if (iso === null) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/** Elapsed time, never calendar-day buckets; unknown is distinct from now. */
export function formatContactAge(iso: string | null, now: number, t: UiTranslator): string {
  const at = contactTimestamp(iso);
  if (at === null || !Number.isFinite(now)) return '—';
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  if (minutes < 1) return t('sp.contactNow');
  if (minutes < 60) return t('sp.contactMinutes', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('sp.contactHours', { n: hours });
  return t('sp.contactDays', { n: Math.floor(hours / 24) });
}

/** Sort a copy before taking shelf previews. Unknown stays last both ways;
 * exact timestamps distinguish two messages inside the same displayed day. */
export function sortRowsByContact(rows: readonly SpenderRowVM[], sort: ContactSort): SpenderRowVM[] {
  const field = sort.side === 'model' ? 'lastModelMessageAt' : 'lastFanMessageAt';
  return [...rows].sort((a, b) => {
    const left = contactTimestamp(a[field]);
    const right = contactTimestamp(b[field]);
    if (left === null && right !== null) return 1;
    if (right === null && left !== null) return -1;
    if (left !== null && right !== null && left !== right) {
      return sort.direction === 'desc' ? left - right : right - left;
    }
    return (b.lifetimeSpend ?? 0) - (a.lifetimeSpend ?? 0) || a.fanId.localeCompare(b.fanId);
  });
}
