import { useSyncStatus } from '../bridge/queries';
import { useUiStore } from '../state/uiStore';
import { DataAge } from '../design/DataAge';
import { Kbd } from '../design/Kbd';
import { cx } from '../lib/cx';

const STATE_LABEL = {
  live: 'LIVE · POLLING',
  degraded: 'DEGRADED',
  offline: 'OFFLINE',
} as const;

// Hub SSE chip (SPEC §6.2/§9; DESIGN §4 tokens): hidden when hub is off,
// online-green when live, amber while connecting/degraded/stopped, amber-red
// on auth failure (CG-HUB-01 — key problem, needs Settings).
const HUB_LABEL = {
  connecting: 'HUB CONNECTING',
  live: 'HUB LIVE',
  degraded: 'HUB DEGRADED',
  'auth-failed': 'HUB AUTH',
  stopped: 'HUB STOPPED',
} as const;

export function StatusBar(): React.JSX.Element {
  const sync = useSyncStatus();
  const selectedAccountId = useUiStore((s) => s.selectedAccountId);
  const lastLlmCostUsd = useUiStore((s) => s.lastLlmCostUsd);
  const setCheatsheetOpen = useUiStore((s) => s.setCheatsheetOpen);

  const status = sync.data ?? null;
  const state = status?.state ?? 'offline';
  const freshness =
    selectedAccountId !== null ? (status?.freshness[selectedAccountId] ?? null) : null;

  return (
    <footer className="num flex h-[30px] flex-none items-center gap-[18px] border-t border-line bg-bg1 px-4 text-micro tracking-[0.05em] text-ink-low">
      <span
        className={cx(
          'flex items-center gap-1.5',
          state === 'live' ? 'text-green' : state === 'degraded' ? 'text-warn' : 'text-bad',
        )}
      >
        <span
          className={cx(
            'h-[6px] w-[6px] rounded-full',
            state === 'live' ? 'bg-online' : state === 'degraded' ? 'bg-warn' : 'bg-bad',
          )}
        />
        {STATE_LABEL[state]}
      </span>
      {status !== null && status.hub !== 'off' && (
        <span
          className={cx(
            'flex items-center gap-1.5',
            status.hub === 'live'
              ? 'text-green'
              : status.hub === 'auth-failed'
                ? 'text-bad'
                : 'text-warn',
          )}
        >
          <span
            className={cx(
              'h-[6px] w-[6px] rounded-full',
              status.hub === 'live'
                ? 'bg-online'
                : status.hub === 'auth-failed'
                  ? 'bg-bad'
                  : 'bg-warn',
            )}
          />
          {HUB_LABEL[status.hub]}
        </span>
      )}
      <span>
        CREDITS TODAY <span className="text-green">{status?.creditsUsedToday.toLocaleString('en-US') ?? '—'}</span>
        {' · '}BAL {status?.creditsBalance?.toLocaleString('en-US') ?? '—'}
      </span>
      <span>
        LLM LAST{' '}
        {lastLlmCostUsd === null ? '—' : <span className="text-green">${lastLlmCostUsd.toFixed(3)}</span>}
      </span>
      {status?.rpmRemaining !== null && status !== null && <span>RPM {status.rpmRemaining}/300</span>}
      <div className="ml-auto flex items-center gap-3.5">
        <DataAge at={freshness} prefix="UPDATED" />
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
