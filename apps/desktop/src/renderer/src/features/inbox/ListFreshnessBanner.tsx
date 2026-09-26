// D38: the one banner above the chat list (owner-approved, plan 2026-09-26 §2).
// A thin strip in the app's "pending" amber — the same treatment as the
// conversation pane's pending strip — that names the moment the visible list
// is from while a fresh read is under way. No icon, no dismiss: it leaves on
// its own the moment the list is verified. The 5 s leaf tick re-renders only
// this component (thresholds are 10 s / 5 min / 12 min).

import { useEffect, useState } from 'react';
import { useSyncStatus } from '../../bridge/queries';
import { useLocale, useT } from '../../lib/i18n';
import { formatListMoment, listBannerState } from './listBanner';

const TICK_MS = 5_000;

export function ListFreshnessBanner({
  accountId,
}: {
  accountId: string | null;
}): React.JSX.Element | null {
  const t = useT();
  const locale = useLocale();
  const status = useSyncStatus().data ?? null;
  const [nowMs, setNowMs] = useState(() => Date.now());

  const watching = status !== null && accountId !== null && status.hubMode !== 'off';
  useEffect(() => {
    if (!watching) return;
    const timer = setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [watching]);

  const banner = listBannerState(status, accountId, nowMs);
  if (!banner.visible) {
    return null;
  }
  const text =
    banner.verifiedAtMs === null
      ? t('inbox.listStaleBannerNoTime')
      : t('inbox.listStaleBanner', { when: formatListMoment(banner.verifiedAtMs, nowMs, locale) });
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="list-freshness-banner"
      className="flex flex-none items-center border-b border-amber-line bg-amber-bg px-[14px] py-[7px] text-[12px] leading-[1.4] text-amber"
    >
      {text}
    </div>
  );
}
