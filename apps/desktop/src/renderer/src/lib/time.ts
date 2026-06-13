// Pure time/date formatting (local time). All functions take explicit Date/now
// arguments so they are deterministic under test. Functions that render a
// human label take an injected translator (i18n stage 2) — kept pure: no hook,
// no store, the caller passes the locale-bound translator.

import type { UiTranslator } from '@chatgoose/shared/i18n/index';

const MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** '19:04' — 24h clock, local time. */
export function formatClock(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysBetween(a: Date, b: Date): number {
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * Chat-list timestamp (mono micro): today → '19:04', within last 6 days →
 * weekday 'MON', same year → 'JUN 3', else "JUN 3 '25".
 */
export function formatListTime(date: Date, now: Date): string {
  const days = daysBetween(date, now);
  if (days <= 0) return formatClock(date);
  if (days < 7) return WEEKDAYS[date.getDay()] ?? '';
  const monthDay = `${MONTHS[date.getMonth()] ?? ''} ${date.getDate()}`;
  if (date.getFullYear() === now.getFullYear()) return monthDay;
  return `${monthDay} '${String(date.getFullYear() % 100).padStart(2, '0')}`;
}

/** Day-separator label: 'TODAY', 'YESTERDAY', 'JUN 3', "JUN 3 '25" (month-day codes stay English). */
export function formatDayLabel(date: Date, now: Date, t: UiTranslator): string {
  const days = daysBetween(date, now);
  if (days === 0) return t('sp.today');
  if (days === 1) return t('sp.yesterdayCap');
  const monthDay = `${MONTHS[date.getMonth()] ?? ''} ${date.getDate()}`;
  if (date.getFullYear() === now.getFullYear()) return monthDay;
  return `${monthDay} '${String(date.getFullYear() % 100).padStart(2, '0')}`;
}

/** Stable key for grouping messages into days: '2026-06-10' (local). */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Compact age: '12s', '3m', '2h', '5d' (floors; <1s → '0s'). */
export function formatAgeShort(ageMs: number): string {
  const s = Math.max(0, Math.floor(ageMs / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** 'online now' within 5 min, else 'last seen 2h ago'; null → 'last seen unknown' (age token stays English). */
export function formatLastSeen(lastSeenIso: string | null, now: Date, t: UiTranslator): string {
  if (lastSeenIso === null) return t('conv.lastSeenUnknown');
  const age = now.getTime() - new Date(lastSeenIso).getTime();
  if (age < 5 * 60_000) return t('conv.onlineNow');
  return t('conv.lastSeenAgo', { age: formatAgeShort(age) });
}

export function isOnline(lastSeenIso: string | null, now: Date): boolean {
  if (lastSeenIso === null) return false;
  return now.getTime() - new Date(lastSeenIso).getTime() < 5 * 60_000;
}
