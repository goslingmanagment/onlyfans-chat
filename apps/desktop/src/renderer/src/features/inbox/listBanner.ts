// D38 (owner-approved UI, plan 2026-09-26 §2): ONE banner above the chat list,
// «Список от чт 16:07, обновляется…», shown only while the list the chatter is
// looking at may be stale and a fresh read is under way. Pure decision +
// formatting so the thresholds are unit-tested without a DOM.

import type { UiLocale } from '@chatgoose/shared/i18n/index';
import type { SyncStatusVM } from '../../../../preload/contract';

/** At launch (or after an outage): a list verified longer ago than this is stale. */
export const BANNER_STALE_AT_START_MS = 5 * 60_000;
/** SYNCING longer than this surfaces the banner even for a recent list. */
export const BANNER_SLOW_SYNC_MS = 10_000;
/** Live but no successful page-1 read for this long (the safety read runs every 5 min). */
export const BANNER_LIVE_UNVERIFIED_MS = 12 * 60_000;

export interface ListBannerState {
  visible: boolean;
  /** The «Список от …» moment; null when this account was never verified. */
  verifiedAtMs: number | null;
}

function parseMs(iso: string | null | undefined): number | null {
  if (iso == null) {
    return null;
  }
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * The banner shows for the SELECTED account when
 *  1. the current verification epoch (launch, a >60 s outage, a replay gap)
 *     has not verified it yet and its list is older than 5 minutes;
 *  2. SYNCING has lasted more than 10 s and this account is still unverified;
 *  3. the stream is live but this account's list is older than 12 minutes.
 */
export function listBannerState(
  status: Pick<SyncStatusVM, 'listVerifiedAt' | 'listSyncing' | 'listSyncingSince' | 'listEpochStartedAt' | 'hubMode'> | null,
  accountId: string | null,
  nowMs: number,
): ListBannerState {
  if (status === null || accountId === null) {
    return { visible: false, verifiedAtMs: null };
  }
  const verifiedAtMs = parseMs(status.listVerifiedAt[accountId]);
  const epochStartedAtMs = parseMs(status.listEpochStartedAt);
  const verifiedThisEpoch =
    verifiedAtMs !== null && epochStartedAtMs !== null && verifiedAtMs >= epochStartedAtMs;
  const ageMs = verifiedAtMs === null ? Number.POSITIVE_INFINITY : nowMs - verifiedAtMs;

  if (epochStartedAtMs !== null && !verifiedThisEpoch && status.hubMode !== 'off') {
    if (ageMs > BANNER_STALE_AT_START_MS) {
      return { visible: true, verifiedAtMs };
    }
    const syncingSinceMs = parseMs(status.listSyncingSince);
    if (status.listSyncing && syncingSinceMs !== null && nowMs - syncingSinceMs > BANNER_SLOW_SYNC_MS) {
      return { visible: true, verifiedAtMs };
    }
  }
  if (status.hubMode === 'live' && !status.listSyncing && ageMs > BANNER_LIVE_UNVERIFIED_MS) {
    return { visible: true, verifiedAtMs };
  }
  return { visible: false, verifiedAtMs };
}

/**
 * «чт 16:07» within the last six days (the weekday is unambiguous), a date
 * («12.09 16:07» / «09/12 16:07») beyond that. Local time, 24-hour clock.
 */
export function formatListMoment(atMs: number, nowMs: number, locale: UiLocale): string {
  const tag = locale === 'ru' ? 'ru-RU' : 'en-US';
  const at = new Date(atMs);
  const time = new Intl.DateTimeFormat(tag, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
  const withinWeek = nowMs - atMs < 6 * 24 * 60 * 60_000;
  const day = withinWeek
    ? new Intl.DateTimeFormat(tag, { weekday: 'short' }).format(at).replace(/\.$/, '')
    : new Intl.DateTimeFormat(tag, { day: '2-digit', month: '2-digit' }).format(at);
  return `${day} ${time}`;
}
