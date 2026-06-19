// Settings → Activity — "how is it running and what did it cost" (PLAN item 9;
// BINDING mockup docs/mockups/experiments/activity-panel.html). Three flat
// ledgers: data flow now → OFAPI credits → AI spend. Read-only except RUN
// OUTBOX AUDIT. Owner taste: mono numbers, no colour-coding, one money
// notation ($ for LLM, bare numbers for credits). Refreshes via event-driven
// invalidation only (DESIGN §3 — no polling loops in the renderer); the
// ticking ages re-render leaf components, never the panel. All copy goes
// through the i18n catalog; status badges (POLLING / HUB LIVE / DIRECT / …)
// and AI feature names are product terms and stay English in both locales.

import { useEffect, useState } from 'react';
import { aiFeatureLabel, purposeLabel } from '@chatgoose/shared/activity/index';
import { formatCompactTokens } from '@chatgoose/shared/llm/cost';
import {
  UI_MESSAGES,
  pluralWord,
  type UiMessageKey,
  type UiTranslator,
} from '@chatgoose/shared/i18n/index';
import type { ActivityVM, OutboxAuditReportVM } from '../../../../../preload/contract';
import { getBridge } from '../../../bridge/bridge';
import { useActivitySummary } from '../../../bridge/queries';
import { Skeleton } from '../../../design/Skeleton';
import { cx } from '../../../lib/cx';
import { useLocale, useT } from '../../../lib/i18n';
import { formatAgeShort } from '../../../lib/time';

// ─── tiny leaf helpers ─────────────────────────────────────────────────────

/** 1 s ticking clock for "polled 8s ago" fragments — re-renders only itself. */
function useNowTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function formatEvery(t: UiTranslator, ms: number | null): string {
  if (ms === null) return '';
  const s = Math.round(ms / 1000);
  if (s < 120) return t('activity.everySec', { n: s });
  return t('activity.everyMin', { n: Math.round(s / 60) });
}

function formatConnectedFor(sinceIso: string | null, now: number): string {
  if (sinceIso === null) return '';
  const mins = Math.max(0, Math.floor((now - Date.parse(sinceIso)) / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h} h ${m} m` : `${m} m`;
}

/** Panel money notation: two decimals like the mockup ($0.38, $4.91). */
function usd(value: number): string {
  if (value > 0 && value < 0.005) return '<$0.01';
  return `$${value.toFixed(2)}`;
}

function shortFeature(feature: string): string {
  const label = aiFeatureLabel(feature);
  const cut = label.indexOf(' (');
  return cut === -1 ? label : label.slice(0, cut);
}

/** Localized purpose label; unknown (forward-compat) purposes fall back to the shared map. */
function localizedPurposeLabel(t: UiTranslator, purpose: string): string {
  const key = `purpose.${purpose}`;
  return key in UI_MESSAGES ? t(key as UiMessageKey) : purposeLabel(purpose);
}

// ─── data flow rows ────────────────────────────────────────────────────────

function Dot({ on, warn }: { on: boolean; warn?: boolean }): React.JSX.Element {
  return (
    <span
      className={cx(
        'mr-1.5 inline-block h-2 w-2 rounded-full align-baseline',
        warn === true ? 'bg-clay' : on ? 'bg-online' : 'bg-ink-low',
      )}
    />
  );
}

function FlowRow({
  label,
  children,
  first,
}: {
  label: string;
  children: React.ReactNode;
  first?: boolean;
}): React.JSX.Element {
  return (
    <div
      className={cx(
        'grid grid-cols-[92px_1fr] items-baseline gap-3.5 py-[7px]',
        first !== true && 'border-t border-line',
      )}
    >
      <div className="num text-[10.5px] tracking-[0.1em] text-ink-mid">{label}</div>
      <div className="text-[13px]">{children}</div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <span className="num text-[10.5px] font-semibold tracking-[0.08em]">{children}</span>
  );
}

function MessagesRow({ vm, t }: { vm: ActivityVM; t: UiTranslator }): React.JSX.Element {
  const now = useNowTick(true);
  const hubLive = vm.mode === 'hub-live';
  const pollNotes = vm.accounts.map((account) => {
    const polled =
      account.lastPolledAt === null
        ? t('activity.notPolledYet')
        : t('activity.polledAgo', { age: formatAgeShort(now - Date.parse(account.lastPolledAt)) });
    const every =
      account.pollIntervalMs !== null ? ` · ${formatEvery(t, account.pollIntervalMs)}` : '';
    return `${account.name} · ${polled}${every}`;
  });
  const sweep =
    vm.deepSweepEveryMs !== null
      ? t('activity.deepSweep', { every: formatEvery(t, vm.deepSweepEveryMs) })
      : null;

  if (hubLive) {
    const lastEvent =
      vm.hub.lastEventAt !== null
        ? `${t('activity.lastEventAgo', { age: formatAgeShort(now - Date.parse(vm.hub.lastEventAt)) })}${
            vm.hub.lastEventType !== null ? ` (${vm.hub.lastEventType})` : ''
          } · `
        : '';
    return (
      <FlowRow label={t('activity.rowMessages')} first>
        <Dot on />
        <Badge>HUB LIVE</Badge> <span className="text-ink-mid">{t('activity.hubPushed')}</span>
        <span className="num mt-0.5 block text-[11.5px] text-ink-low">
          {lastEvent}
          {t('activity.hubEventCounters', {
            received: vm.hub.eventsToday.toLocaleString('en-US'),
            applied: vm.hub.appliedEventsToday.toLocaleString('en-US'),
            fallback: vm.hub.fallbackEventsToday.toLocaleString('en-US'),
            dropped: vm.hub.droppedEventsToday.toLocaleString('en-US'),
          })}
          {vm.hub.lastFallbackReason !== null
            ? ` · ${t('activity.lastFallback', { reason: vm.hub.lastFallbackReason })}`
            : ''}{' '}
          ·{' '}
          {t('activity.pollingSlowed', { notes: pollNotes.join('  ·  ') })}
          {sweep !== null ? `  ·  ${sweep}` : ''}
        </span>
      </FlowRow>
    );
  }
  return (
    <FlowRow label={t('activity.rowMessages')} first>
      <Dot on={vm.syncState !== 'offline'} warn={vm.syncState === 'degraded'} />
      <Badge>{vm.syncState === 'offline' ? 'OFFLINE' : vm.syncState === 'degraded' ? 'DEGRADED' : 'POLLING'}</Badge>{' '}
      <span className="text-ink-mid">{t('activity.askingOfapi')}</span>
      {vm.accounts.length > 0 && (
        <span className="num mt-0.5 block text-[11.5px] text-ink-low">
          {pollNotes.join('  ·  ')}
          {sweep !== null ? `  ·  ${sweep}` : ''}
        </span>
      )}
    </FlowRow>
  );
}

function HubRow({ vm, t }: { vm: ActivityVM; t: UiTranslator }): React.JSX.Element {
  const now = useNowTick(vm.hub.status === 'live');
  const locale = useLocale();
  const { hub } = vm;
  const pending: string[] = [];
  if (hub.pendingUsageEvents > 0) {
    const word = pluralWord(
      locale,
      hub.pendingUsageEvents,
      ['AI-usage event', 'AI-usage events'],
      ['отчёт об ИИ', 'отчёта об ИИ', 'отчётов об ИИ'],
    );
    pending.push(`${hub.pendingUsageEvents} ${word}`);
  }
  if (hub.pendingSummaries > 0) {
    const word = pluralWord(
      locale,
      hub.pendingSummaries,
      ['fan summary', 'fan summaries'],
      ['саммари фана', 'саммари фанов', 'саммари фанов'],
    );
    pending.push(`${hub.pendingSummaries} ${word}`);
  }

  if (hub.status === 'live') {
    return (
      <FlowRow label={t('activity.rowHub')}>
        <Dot on />
        <Badge>LIVE</Badge>{' '}
        <span className="text-ink-mid">
          {t('activity.hubConnectedFor', {
            dur: formatConnectedFor(hub.liveSince, now),
            n: hub.droppedFrames,
          })}
        </span>
        <span className="mt-0.5 block text-[11.5px] text-ink-low">
          {hub.pendingUsageEvents === 0
            ? t('activity.usageQueueEmpty')
            : t('activity.usageQueuePending', { n: hub.pendingUsageEvents })}
          {' · '}
          {t('activity.summariesSynced', { n: hub.syncedSummariesToday })}
          {hub.quarantinedUsageEvents > 0 &&
            ` ${t('activity.quarantined', { n: hub.quarantinedUsageEvents })}`}
        </span>
      </FlowRow>
    );
  }

  const sinceClock =
    hub.statusChangedAt !== null
      ? new Date(hub.statusChangedAt).toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
        })
      : null;
  const stateText =
    hub.status === 'off'
      ? t('activity.hubNotConfigured')
      : hub.status === 'auth-failed'
        ? t('activity.hubKeyRejected')
        : sinceClock !== null
          ? t('activity.hubUnreachableSince', { time: sinceClock })
          : t('activity.hubReconnecting');
  return (
    <FlowRow label={t('activity.rowHub')}>
      <Dot on={false} warn={hub.status === 'auth-failed'} />
      <Badge>{hub.status === 'auth-failed' ? 'AUTH' : 'OFF'}</Badge>{' '}
      <span className="text-ink-mid">{stateText}</span>
      <span className="mt-0.5 block text-[11.5px] text-ink-low">
        {t('activity.instantPaused')}
        {pending.length > 0 && ` ${t('activity.pendingUpload', { list: pending.join(', ') })}`}
      </span>
    </FlowRow>
  );
}

function AiRow({ vm, t }: { vm: ActivityVM; t: UiTranslator }): React.JSX.Element {
  const configured = vm.ai.hasAnthropicKey || vm.ai.hasOpenRouterKey;
  const provider = vm.ai.hasAnthropicKey ? 'Anthropic' : 'OpenRouter';
  return (
    <FlowRow label={t('activity.rowAi')}>
      <Dot on={configured} />
      {configured ? (
        <>
          <Badge>DIRECT</Badge>{' '}
          <span className="text-ink-mid">
            {vm.mode === 'hub-live'
              ? t('activity.aiDirectHubLive', { provider })
              : t('activity.aiDirect', { provider })}
          </span>
        </>
      ) : (
        <>
          <Badge>OFF</Badge> <span className="text-ink-mid">{t('activity.aiOff')}</span>
        </>
      )}
    </FlowRow>
  );
}

// ─── outbox audit ──────────────────────────────────────────────────────────

function AuditReport({
  report,
  t,
}: {
  report: OutboxAuditReportVM;
  t: UiTranslator;
}): React.JSX.Element {
  const anomalies =
    report.doubleClaims.length +
    report.suspectDuplicates.length +
    report.staleUnconfirmed.length +
    report.sentMissingFromMessages.length;
  const stateWord = (state: string): string => {
    const key = `outbox.state.${state}`;
    return key in UI_MESSAGES ? t(key as UiMessageKey) : state;
  };
  const totals = Object.entries(report.totals)
    .filter(([, count]) => count > 0)
    .map(([state, count]) => `${count} ${stateWord(state)}`)
    .join(' · ');
  return (
    <div className="num mt-2 rounded-chip border border-line bg-bg2 px-3 py-2 text-[11.5px] leading-[1.6] text-ink-mid">
      <div>
        {anomalies === 0
          ? t('activity.auditClean', { n: report.cleanSends })
          : t('activity.auditAnomalies', { n: report.cleanSends, a: anomalies })}
      </div>
      <div className="text-ink-low">{totals === '' ? t('activity.outboxEmpty') : totals}</div>
      {report.doubleClaims.length > 0 && (
        <div className="text-bad">
          {t('activity.doubleClaims')}
          {report.doubleClaims.map((claim) => `${claim.messageId}←[${claim.localIds.join(', ')}]`).join('; ')}
        </div>
      )}
      {report.suspectDuplicates.length > 0 && (
        <div className="text-bad">
          {t('activity.suspectDuplicates')}
          {report.suspectDuplicates
            .map((dup) => `${t('activity.chat')} ${dup.chatId} ×${dup.localIds.length}`)
            .join('; ')}
        </div>
      )}
      {report.staleUnconfirmed.length > 0 && (
        <div>
          {t('activity.staleUnconfirmed')}
          {report.staleUnconfirmed
            .map((row) => `${row.localId} (${t('activity.chat')} ${row.chatId}, ${formatAgeShort(row.ageMs)})`)
            .join('; ')}
        </div>
      )}
      {report.sentMissingFromMessages.length > 0 && (
        <div>
          {t('activity.sentMissing')}
          {report.sentMissingFromMessages
            .map((row) => `${row.messageId} (${t('activity.chat')} ${row.chatId})`)
            .join('; ')}
        </div>
      )}
    </div>
  );
}

function SendsRow({ vm, t }: { vm: ActivityVM; t: UiTranslator }): React.JSX.Element {
  const [report, setReport] = useState<OutboxAuditReportVM | null>(null);
  const [running, setRunning] = useState(false);

  function runAudit(): void {
    setRunning(true);
    getBridge()
      .invoke('query:outbox.audit', {})
      .then((result) => setReport(result))
      .catch(() => setReport(null))
      .finally(() => setRunning(false));
  }

  return (
    <FlowRow label={t('activity.rowSends')}>
      <span className="num text-[12px]">
        {t('activity.sendsLine', {
          sent: vm.sends.sent,
          failed: vm.sends.failed,
          unconfirmed: vm.sends.unconfirmed,
        })}
      </span>{' '}
      <span className="text-ink-mid">{t('activity.sendsToday')}</span>
      <button
        type="button"
        onClick={runAudit}
        disabled={running}
        className="num ml-3 cursor-pointer rounded-chip border border-line-strong bg-bg1 px-3 py-1 text-[10.5px] tracking-[0.08em] text-ink-mid hover:border-ink-mid hover:text-ink disabled:cursor-default disabled:opacity-60"
      >
        {running ? t('activity.auditing') : t('activity.auditBtn')}
      </button>
      {report !== null && <AuditReport report={report} t={t} />}
    </FlowRow>
  );
}

// ─── ledgers ───────────────────────────────────────────────────────────────

const TH = 'num border-b border-line pb-1.5 pt-0 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-ink-low';
const TH_NUM = `${TH} text-right`;
const TD = 'border-b border-line py-1.5 text-[13px]';
const TD_NUM = `${TD} num whitespace-nowrap text-right`;

function CoreCreditsLine({ vm, t }: { vm: ActivityVM; t: UiTranslator }): React.JSX.Element | null {
  const core = vm.credits.core;
  if (core === null) {
    return null;
  }
  const body = core.enabled
    ? t('activity.coreCreditsToday', {
      total: core.today.totalEstimatedCredits.toLocaleString('en-US'),
      rest: core.today.restCredits.toLocaleString('en-US'),
      webhook: core.today.webhook.estimatedCredits.toLocaleString('en-US'),
    })
    : t('activity.coreCreditsDisabled');
  const detail = core.enabled
    ? t('activity.coreCreditsEvents', {
      events: core.today.webhook.eventCount.toLocaleString('en-US'),
      sevenDay: core.last7d.totalEstimatedCredits.toLocaleString('en-US'),
    })
    : core.limitations[0] ?? '';

  return (
    <div className="mb-3 border-b border-line pb-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] font-semibold text-ink">{t('activity.coreCreditsTitle')}</span>
        <span className="num text-[11.5px] text-ink-low">
          {t('activity.coreCreditsPages', { n: core.scope.pageCount.toLocaleString('en-US') })}
        </span>
      </div>
      <div className="num mt-1 text-[12.5px] text-ink-mid">{body}</div>
      {detail !== '' && <div className="mt-1 text-[11.5px] text-ink-low">{detail}</div>}
    </div>
  );
}

function CreditsLedger({ vm, t }: { vm: ActivityVM; t: UiTranslator }): React.JSX.Element {
  const { credits } = vm;
  const footer: string[] = [];
  if (credits.balance !== null) {
    footer.push(t('activity.balance', { n: credits.balance.toLocaleString('en-US') }));
  }
  if (credits.estimatedDaysLeft !== null) {
    footer.push(t('activity.pace', { n: credits.estimatedDaysLeft }));
  }
  if (credits.rpmRemaining !== null) {
    footer.push(t('activity.headroom', { n: credits.rpmRemaining.toLocaleString('en-US') }));
  }

  return (
    <div className="border-b border-line px-4 pb-4 pt-3.5">
      <div className="cap mb-2.5 block text-ink-low">{t('activity.capCredits')}</div>
      <CoreCreditsLine vm={vm} t={t} />
      {credits.rows.length === 0 ? (
        <p className="text-[12.5px] text-ink-low">{t('activity.creditsEmpty')}</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={TH}>{t('activity.colWhat')}</th>
              <th className={TH_NUM}>{t('activity.colRequests')}</th>
              <th className={TH_NUM}>{t('activity.colCredits')}</th>
              <th className={TH} style={{ width: 160 }} />
            </tr>
          </thead>
          <tbody>
            {credits.rows.map((row) => (
              <tr key={row.purpose}>
                <td className={cx(TD, 'text-ink-mid')}>{localizedPurposeLabel(t, row.purpose)}</td>
                <td className={TD_NUM}>{row.requests.toLocaleString('en-US')}</td>
                <td className={TD_NUM}>{row.credits.toLocaleString('en-US')}</td>
                <td className={cx(TD, 'pl-4')}>
                  <div className="h-[3px] overflow-hidden rounded-[2px] bg-bg3">
                    <div
                      className="h-full bg-ink-mid"
                      style={{
                        width: `${credits.totalCredits > 0 ? Math.max(2, Math.round((row.credits / credits.totalCredits) * 100)) : 0}%`,
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
            <tr>
              <td className="border-t border-line-strong py-1.5 text-[13px] font-semibold">
                {t('activity.totalToday')}
              </td>
              <td className="num border-t border-line-strong py-1.5 text-right text-[13px] font-semibold">
                {credits.totalRequests.toLocaleString('en-US')}
              </td>
              <td className="num border-t border-line-strong py-1.5 text-right text-[13px] font-semibold">
                {credits.totalCredits.toLocaleString('en-US')}
              </td>
              <td className="border-t border-line-strong" />
            </tr>
          </tbody>
        </table>
      )}
      {footer.length > 0 && (
        <p className="num mt-2 text-[11.5px] text-ink-low">{footer.join(' · ')}</p>
      )}
    </div>
  );
}

function AiSpendLedger({ vm, t }: { vm: ActivityVM; t: UiTranslator }): React.JSX.Element {
  const { aiSpend } = vm;
  const footer: string[] = [];
  if (aiSpend.cacheReadShare !== null) {
    footer.push(t('activity.cacheHits', { n: Math.round(aiSpend.cacheReadShare * 100) }));
  }
  if (aiSpend.topRun !== null) {
    const who = aiSpend.topRun.fanLabel !== null ? `, ${aiSpend.topRun.fanLabel}` : '';
    footer.push(
      t('activity.topRun', {
        usd: usd(aiSpend.topRun.costUsd),
        what: `${shortFeature(aiSpend.topRun.feature)}${who}`,
      }),
    );
  }
  footer.push(t('activity.sevenDayTotal', { usd: usd(aiSpend.sevenDayUsd) }));

  return (
    <div className="px-4 pb-4 pt-3.5">
      <div className="cap mb-2.5 block text-ink-low">{t('activity.capAiSpend')}</div>
      {aiSpend.rows.length === 0 ? (
        <p className="text-[12.5px] text-ink-low">{t('activity.aiEmpty')}</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={TH}>{t('activity.colFeature')}</th>
              <th className={TH_NUM}>{t('activity.colRuns')}</th>
              <th className={TH_NUM}>{t('activity.colInserted')}</th>
              <th className={TH_NUM}>{t('activity.colTokens')}</th>
              <th className={TH_NUM}>{t('activity.colCost')}</th>
            </tr>
          </thead>
          <tbody>
            {aiSpend.rows.map((row) => (
              <tr key={row.feature}>
                <td className={cx(TD, 'text-ink-mid')}>{aiFeatureLabel(row.feature)}</td>
                <td className={TD_NUM}>{row.runs}</td>
                <td className={TD_NUM}>{row.inserted ?? '—'}</td>
                <td className={TD_NUM}>{formatCompactTokens(row.tokens)}</td>
                <td className={TD_NUM}>{usd(row.costUsd)}</td>
              </tr>
            ))}
            <tr>
              <td className="border-t border-line-strong py-1.5 text-[13px] font-semibold">
                {t('activity.totalToday')}
              </td>
              <td className="num border-t border-line-strong py-1.5 text-right text-[13px] font-semibold">
                {aiSpend.totals.runs}
              </td>
              <td className="num border-t border-line-strong py-1.5 text-right text-[13px] font-semibold">
                {aiSpend.totals.inserted} / {aiSpend.totals.insertableRuns}
              </td>
              <td className="num border-t border-line-strong py-1.5 text-right text-[13px] font-semibold">
                {formatCompactTokens(aiSpend.totals.tokens)}
              </td>
              <td className="num border-t border-line-strong py-1.5 text-right text-[13px] font-semibold">
                {usd(aiSpend.totals.costUsd)}
              </td>
            </tr>
          </tbody>
        </table>
      )}
      {footer.length > 0 && (
        <p className="num mt-2 text-[11.5px] text-ink-low">{footer.join(' · ')}</p>
      )}
    </div>
  );
}

// ─── the panel ─────────────────────────────────────────────────────────────

export function ActivitySettings(): React.JSX.Element {
  const activity = useActivitySummary(true);
  const t = useT();
  const vm = activity.data;

  return (
    <section className="overflow-hidden rounded-card border border-line bg-bg1 shadow-soft">
      <header className="border-b border-line px-4 pb-3 pt-4">
        <h2 className="font-serif text-[15px] font-semibold">{t('activity.title')}</h2>
        <p className="mt-0.5 text-[12px] text-ink-mid">{t('activity.subtitle')}</p>
      </header>
      {vm === undefined ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : (
        <>
          <div className="border-b border-line px-4 pb-3.5 pt-3.5">
            <div className="cap mb-2 block text-ink-low">{t('activity.capDataflow')}</div>
            <MessagesRow vm={vm} t={t} />
            <HubRow vm={vm} t={t} />
            <AiRow vm={vm} t={t} />
            <SendsRow vm={vm} t={t} />
          </div>
          <CreditsLedger vm={vm} t={t} />
          <AiSpendLedger vm={vm} t={t} />
        </>
      )}
    </section>
  );
}
