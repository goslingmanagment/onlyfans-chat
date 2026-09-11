import { useRef, useState } from 'react';
import { refreshCostUsd } from '@chatgoose/shared';
import type { UiTranslator } from '@chatgoose/shared/i18n/index';
import type { SpendersFreshnessVM, SpendersRefreshRunVM } from '../../../../preload/contract';
import { getBridge } from '../../bridge/bridge';
import { cx } from '../../lib/cx';
import { useContactClock } from './useContactClock';
import { historyStatusText } from './refreshStatus';

/** A run outcome and source freshness are different facts. Skips never claim a new read. */
export function RefreshControls({ accountId, chip, chipTitle, scopeCount, active, stampIso, lastRun, failed, fetching, onRetry, t }: {
  accountId: string | null;
  chip: string;
  chipTitle: string;
  scopeCount: number;
  active: SpendersFreshnessVM['active'];
  stampIso: string | null;
  lastRun: SpendersRefreshRunVM | null;
  failed: boolean;
  fetching: boolean;
  onRetry: () => void;
  t: UiTranslator;
}): React.JSX.Element {
  const now = useContactClock();
  const nextCommandId = useRef(0);
  const [commands, setCommands] = useState<Record<string, { id: number; scope: string; state: 'pending' | 'failed' }>>({});
  const command = accountId === null ? undefined : commands[accountId];
  const relevantCommand = command?.scope === chip ? command : null;
  const pending = command?.state === 'pending';
  const busy = active !== null;
  const counts = active ?? lastRun;
  const detail = counts === null ? undefined : t('sp.refreshDetails', { fetched: counts.fetched, cached: counts.ttlSkipped, skipped: counts.policySkipped, failed: counts.failed });
  const label = relevantCommand?.state === 'failed' ? t('sp.refreshCommandFailed')
    : failed ? t('sp.freshnessFailed')
      : active !== null ? active.state === 'paused' ? t('sp.refreshPaused') : t('sp.rowsLeft', { n: Math.max(0, active.total - active.done) })
        : historyStatusText(stampIso, lastRun, now, t);

  async function runCommand(): Promise<void> {
    if (accountId === null || pending) return;
    const target = { accountId, scope: chip, id: ++nextCommandId.current };
    setCommands((current) => ({ ...current, [accountId]: { ...target, state: 'pending' } }));
    try {
      if (busy) await getBridge().invoke('cmd:spenders.refreshStop', { accountId });
      else await getBridge().invoke('cmd:spenders.refreshScope', { accountId, scope: chip });
      setCommands((current) => {
        if (current[target.accountId]?.id !== target.id) return current;
        const next = { ...current };
        delete next[target.accountId];
        return next;
      });
      onRetry();
    } catch {
      setCommands((current) => current[target.accountId]?.id === target.id
        ? { ...current, [target.accountId]: { ...target, state: 'failed' } } : current);
    }
  }

  return <>
    <span className="flex-1" />
    <span role="status" title={detail} className="num text-[10px] text-ink-low">{label}{failed && <button type="button" disabled={fetching} onClick={onRetry} className="ml-2 cursor-pointer underline decoration-dotted disabled:opacity-50">{t('sp.retry')}</button>}</span>
    <button type="button" onClick={() => { void runCommand(); }} disabled={accountId === null || pending || (!busy && scopeCount === 0)} title={busy ? t('sp.stop') : `${t('sp.refreshTip')} · ≈ $${refreshCostUsd(scopeCount).toFixed(2)}`} className={cx('flex flex-none cursor-pointer items-center gap-[7px] rounded-full border px-3 py-[3px] text-[12px] font-semibold whitespace-nowrap disabled:cursor-default disabled:opacity-50', busy ? 'border-line text-ink-low' : 'border-line-strong bg-bg1 text-ink-mid hover:border-ink-mid hover:text-ink')}>
      {busy ? <>{t('sp.refreshing')}<span className="num text-[9px] text-ink-low">{active.done}/{active.total} · {t('sp.stop')}</span></> : <>{t('sp.refresh')}<span className="num text-[9px] text-ink-low uppercase">{chipTitle} {scopeCount} · ~{scopeCount} {t('sp.creditsShort')}</span></>}
    </button>
  </>;
}
