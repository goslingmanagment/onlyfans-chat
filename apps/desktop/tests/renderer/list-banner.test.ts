// D38: the one banner above the chat list («Список от чт 16:07, обновляется…»).
// Three owner-approved conditions (plan 2026-09-26 §2 / D1): at launch the list
// was verified more than 5 minutes ago; SYNCING lasts longer than 10 s; live but
// unverified for more than 12 minutes.

import { describe, expect, it } from 'vitest';
import { uiMessage } from '@chatgoose/shared/i18n/index';
import type { SyncStatusVM } from '../../src/preload/contract';
import {
  BANNER_LIVE_UNVERIFIED_MS,
  BANNER_SLOW_SYNC_MS,
  BANNER_STALE_AT_START_MS,
  formatListMoment,
  listBannerState,
} from '../../src/renderer/src/features/inbox/listBanner';

const ACCT = 'acct_1';
const NOW = Date.parse('2026-09-26T16:07:30.000Z');
const iso = (ms: number): string => new Date(ms).toISOString();

type BannerInput = Pick<
  SyncStatusVM,
  'listVerifiedAt' | 'listSyncing' | 'listSyncingSince' | 'listEpochStartedAt' | 'hubMode'
>;

function status(overrides: Partial<BannerInput> = {}): BannerInput {
  return {
    listVerifiedAt: { [ACCT]: iso(NOW - 60_000) },
    listSyncing: false,
    listSyncingSince: null,
    listEpochStartedAt: iso(NOW - 120_000),
    hubMode: 'live',
    ...overrides,
  };
}

describe('listBannerState', () => {
  it('launch with a list older than 5 minutes: shown until this account is verified', () => {
    const verifiedAt = NOW - BANNER_STALE_AT_START_MS - 1_000;
    const syncing = status({
      listVerifiedAt: { [ACCT]: iso(verifiedAt) },
      listSyncing: true,
      listSyncingSince: iso(NOW - 2_000),
      listEpochStartedAt: iso(NOW - 2_000),
    });
    expect(listBannerState(syncing, ACCT, NOW)).toEqual({ visible: true, verifiedAtMs: verifiedAt });

    // Verified in this epoch → gone, even while other accounts keep SYNCING.
    const verified = { ...syncing, listVerifiedAt: { [ACCT]: iso(NOW - 1_000) } };
    expect(listBannerState(verified, ACCT, NOW).visible).toBe(false);
  });

  it('a recent list at launch stays quiet for the first 10 s of SYNCING', () => {
    const verifiedAt = NOW - 2 * 60_000; // 2 minutes old: fresh enough
    const quick = status({
      listVerifiedAt: { [ACCT]: iso(verifiedAt) },
      listSyncing: true,
      listSyncingSince: iso(NOW - BANNER_SLOW_SYNC_MS + 1_000),
      listEpochStartedAt: iso(NOW - BANNER_SLOW_SYNC_MS + 1_000),
    });
    expect(listBannerState(quick, ACCT, NOW).visible).toBe(false);

    const slow = {
      ...quick,
      listSyncingSince: iso(NOW - BANNER_SLOW_SYNC_MS - 1_000),
      listEpochStartedAt: iso(NOW - BANNER_SLOW_SYNC_MS - 1_000),
    };
    expect(listBannerState(slow, ACCT, NOW)).toEqual({ visible: true, verifiedAtMs: verifiedAt });
  });

  it('live but unverified for more than 12 minutes', () => {
    // The session epoch began long ago and this account was verified in it:
    // only the live-staleness rule is in play.
    const epoch = { listEpochStartedAt: iso(NOW - 60 * 60_000) };
    const fresh = status({ ...epoch, listVerifiedAt: { [ACCT]: iso(NOW - BANNER_LIVE_UNVERIFIED_MS + 1_000) } });
    expect(listBannerState(fresh, ACCT, NOW).visible).toBe(false);

    const stale = status({ ...epoch, listVerifiedAt: { [ACCT]: iso(NOW - BANNER_LIVE_UNVERIFIED_MS - 1_000) } });
    expect(listBannerState(stale, ACCT, NOW).visible).toBe(true);
    // Not while the stream is down — the status bar already says so.
    expect(listBannerState({ ...stale, hubMode: 'degraded' }, ACCT, NOW).visible).toBe(false);
  });

  it('a never-verified account shows the time-less variant', () => {
    const never = status({
      listVerifiedAt: {},
      listSyncing: true,
      listSyncingSince: iso(NOW - 1_000),
      listEpochStartedAt: iso(NOW - 1_000),
    });
    expect(listBannerState(never, ACCT, NOW)).toEqual({ visible: true, verifiedAtMs: null });
  });

  it('pure polling (no hub) and no selection never show it', () => {
    const polling = status({
      hubMode: 'off',
      listVerifiedAt: { [ACCT]: iso(NOW - 60 * 60_000) },
    });
    expect(listBannerState(polling, ACCT, NOW).visible).toBe(false);
    expect(listBannerState(status(), null, NOW).visible).toBe(false);
    expect(listBannerState(null, ACCT, NOW).visible).toBe(false);
  });
});

describe('formatListMoment', () => {
  it('uses the short weekday within the week, a date beyond it', () => {
    // Local-time formatting: build the instant from local components.
    const thursday = new Date(2026, 8, 24, 16, 7).getTime(); // Thu 24 Sep 2026
    const now = new Date(2026, 8, 26, 12, 0).getTime();
    expect(formatListMoment(thursday, now, 'ru')).toBe('чт 16:07');
    expect(formatListMoment(thursday, now, 'en')).toBe('Thu 16:07');
    const older = new Date(2026, 8, 12, 9, 5).getTime();
    expect(formatListMoment(older, now, 'ru')).toBe('12.09 09:05');
  });

  it('renders the approved copy', () => {
    const thursday = new Date(2026, 8, 24, 16, 7).getTime();
    const now = new Date(2026, 8, 26, 12, 0).getTime();
    expect(
      uiMessage('ru', 'inbox.listStaleBanner', { when: formatListMoment(thursday, now, 'ru') }),
    ).toBe('Список от чт 16:07, обновляется…');
  });
});
