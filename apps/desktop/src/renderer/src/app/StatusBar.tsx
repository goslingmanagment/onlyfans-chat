// One-line activity summary (activity-panel mockup, owner-approved
// 2026-06-11): mode word matching the panel badge · credits · AI TODAY ·
// sends · freshness. Every segment carries a Russian hover tooltip and clicks
// through to Settings → Activity (the first section). RPM moved into the
// panel's credits-ledger footer (PLAN item 7 cosmetic).

import { useSyncStatus } from '../bridge/queries';
import { useUiStore } from '../state/uiStore';
import { DataAge } from '../design/DataAge';
import { Kbd } from '../design/Kbd';
import { Tooltip } from '../design/Tooltip';
import { cx } from '../lib/cx';
import { statusBarMode, STATUS_BAR_TIPS } from './statusBarTips';

const TONE_DOT = { ok: 'bg-online', warn: 'bg-warn', bad: 'bg-bad' } as const;
const TONE_TEXT = { ok: '', warn: 'text-warn', bad: 'text-bad' } as const;

function Segment({
  tip,
  onClick,
  children,
  className,
}: {
  tip: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <Tooltip tip={tip}>
      <button
        type="button"
        onClick={onClick}
        className={cx('flex cursor-pointer items-center gap-1.5 hover:text-ink', className)}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/** The clickable key word: dotted underline per the mockup strip. */
function Key({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <span className="underline decoration-dotted underline-offset-[3px]">{children}</span>;
}

export function StatusBar(): React.JSX.Element {
  const sync = useSyncStatus();
  const selectedAccountId = useUiStore((s) => s.selectedAccountId);
  const setView = useUiStore((s) => s.setView);
  const setCheatsheetOpen = useUiStore((s) => s.setCheatsheetOpen);

  const status = sync.data ?? null;
  const mode = statusBarMode(status?.state ?? 'offline', status?.hub ?? 'off');
  const freshness =
    selectedAccountId !== null ? (status?.freshness[selectedAccountId] ?? null) : null;
  const openActivity = (): void => setView('settings');

  return (
    <footer className="num flex h-[30px] flex-none items-center gap-[18px] border-t border-line bg-bg1 px-4 text-micro tracking-[0.05em] text-ink-low">
      <Segment tip={mode.tip} onClick={openActivity} className={TONE_TEXT[mode.tone]}>
        <span className={cx('h-[6px] w-[6px] rounded-full', TONE_DOT[mode.tone])} />
        <Key>{mode.word}</Key>
      </Segment>
      {status?.hub === 'auth-failed' && (
        <Segment tip={STATUS_BAR_TIPS.hubAuth} onClick={openActivity} className="text-bad">
          <span className="h-[6px] w-[6px] rounded-full bg-bad" />
          <Key>HUB AUTH</Key>
        </Segment>
      )}
      <Segment tip={STATUS_BAR_TIPS.credits} onClick={openActivity}>
        <span>
          <Key>
            CREDITS TODAY{' '}
            <span className="text-green">
              {status?.creditsUsedToday.toLocaleString('en-US') ?? '—'}
            </span>
          </Key>
          {' · '}BAL {status?.creditsBalance?.toLocaleString('en-US') ?? '—'}
        </span>
      </Segment>
      <Segment tip={STATUS_BAR_TIPS.aiToday} onClick={openActivity}>
        <Key>
          AI TODAY{' '}
          {status === null ? '—' : <span className="text-green">${status.aiTodayUsd.toFixed(2)}</span>}
        </Key>
      </Segment>
      <Segment tip={STATUS_BAR_TIPS.sends} onClick={openActivity}>
        <Key>
          SENDS {status?.sendsToday.sent.toLocaleString('en-US') ?? '—'} ·{' '}
          {status?.sendsToday.unconfirmed ?? '—'} UNCONF
        </Key>
      </Segment>
      <div className="ml-auto flex items-center gap-3.5">
        <Segment tip={STATUS_BAR_TIPS.updated} onClick={openActivity}>
          <DataAge at={freshness} prefix="UPDATED" />
        </Segment>
        <button
          type="button"
          className="flex cursor-pointer items-center gap-1.5 hover:text-ink-mid"
          onClick={() => setCheatsheetOpen(true)}
        >
          <Kbd>?</Kbd> SHORTCUTS
        </button>
      </div>
    </footer>
  );
}
