// Settings → Activity — "how is it running and what did it cost" (PLAN item 9;
// BINDING mockup docs/mockups/experiments/activity-panel.html). Three flat
// ledgers: data flow now → OFAPI credits → AI spend. Read-only except RUN
// OUTBOX AUDIT. Owner taste: mono numbers, no colour-coding, one money
// notation ($ for LLM, bare numbers for credits). Refreshes via event-driven
// invalidation only (DESIGN §3 — no polling loops in the renderer); the
// ticking ages re-render leaf components, never the panel.

import { useEffect, useState } from 'react';
import {
  aiFeatureLabel,
  purposeLabel,
} from '@chatgoose/shared/activity/index';
import { formatCompactTokens } from '@chatgoose/shared/llm/cost';
import type { ActivityVM, OutboxAuditReportVM } from '../../../../../preload/contract';
import { getBridge } from '../../../bridge/bridge';
import { useActivitySummary } from '../../../bridge/queries';
import { Skeleton } from '../../../design/Skeleton';
import { cx } from '../../../lib/cx';
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

function formatEvery(ms: number | null): string {
  if (ms === null) return '';
  const s = Math.round(ms / 1000);
  if (s < 120) return `every ${s} s`;
  return `every ${Math.round(s / 60)} min`;
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

function MessagesRow({ vm }: { vm: ActivityVM }): React.JSX.Element {
  const now = useNowTick(true);
  const hubLive = vm.mode === 'hub-live';
  const pollNotes = vm.accounts.map((account) => {
    const polled =
      account.lastPolledAt === null
        ? 'not polled yet'
        : `polled ${formatAgeShort(now - Date.parse(account.lastPolledAt))} ago`;
    const every = account.pollIntervalMs !== null ? ` · ${formatEvery(account.pollIntervalMs)}` : '';
    return `${account.name} · ${polled}${every}`;
  });
  const sweep = vm.deepSweepEveryMs !== null ? `deep sweep ${formatEvery(vm.deepSweepEveryMs)}` : null;

  if (hubLive) {
    const lastEvent =
      vm.hub.lastEventAt !== null
        ? `last event ${formatAgeShort(now - Date.parse(vm.hub.lastEventAt))} ago${
            vm.hub.lastEventType !== null ? ` (${vm.hub.lastEventType})` : ''
          } · `
        : '';
    return (
      <FlowRow label="MESSAGES" first>
        <Dot on />
        <Badge>HUB LIVE</Badge>{' '}
        <span className="text-ink-mid">— pushed from core in seconds; polling relaxed to safety-net</span>
        <span className="num mt-0.5 block text-[11.5px] text-ink-low">
          {lastEvent}
          {vm.hub.eventsToday.toLocaleString('en-US')} events today · polling slowed:{' '}
          {pollNotes.join('  ·  ')}
          {sweep !== null ? `  ·  ${sweep}` : ''}
        </span>
      </FlowRow>
    );
  }
  return (
    <FlowRow label="MESSAGES" first>
      <Dot on={vm.syncState !== 'offline'} warn={vm.syncState === 'degraded'} />
      <Badge>{vm.syncState === 'offline' ? 'OFFLINE' : vm.syncState === 'degraded' ? 'DEGRADED' : 'POLLING'}</Badge>{' '}
      <span className="text-ink-mid">— asking OFAPI directly</span>
      {vm.accounts.length > 0 && (
        <span className="num mt-0.5 block text-[11.5px] text-ink-low">
          {pollNotes.join('  ·  ')}
          {sweep !== null ? `  ·  ${sweep}` : ''}
        </span>
      )}
    </FlowRow>
  );
}

function HubRow({ vm }: { vm: ActivityVM }): React.JSX.Element {
  const now = useNowTick(vm.hub.status === 'live');
  const { hub } = vm;
  const pending: string[] = [];
  if (hub.pendingUsageEvents > 0) pending.push(`${hub.pendingUsageEvents} AI-usage events`);
  if (hub.pendingSummaries > 0) pending.push(`${hub.pendingSummaries} fan summaries`);

  if (hub.status === 'live') {
    return (
      <FlowRow label="HUB (CORE)">
        <Dot on />
        <Badge>LIVE</Badge>{' '}
        <span className="text-ink-mid">
          — connected {formatConnectedFor(hub.liveSince, now)} · {hub.droppedFrames} dropped frames
        </span>
        <span className="mt-0.5 block text-[11.5px] text-ink-low">
          {hub.pendingUsageEvents === 0
            ? 'Usage queue empty'
            : `Usage queue: ${hub.pendingUsageEvents} pending`}
          {' · '}
          {hub.syncedSummariesToday} fan summaries synced today · profile prefetch on.
          {hub.quarantinedUsageEvents > 0 &&
            ` ${hub.quarantinedUsageEvents} usage events quarantined (rejected by core).`}
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
      ? '— not configured (Settings → Agency Hub)'
      : hub.status === 'auth-failed'
        ? '— chatter key rejected, check Settings → Agency Hub'
        : sinceClock !== null
          ? `— unreachable since ${sinceClock}, reconnecting`
          : '— reconnecting';
  return (
    <FlowRow label="HUB (CORE)">
      <Dot on={false} warn={hub.status === 'auth-failed'} />
      <Badge>{hub.status === 'auth-failed' ? 'AUTH' : 'OFF'}</Badge>{' '}
      <span className="text-ink-mid">{stateText}</span>
      <span className="mt-0.5 block text-[11.5px] text-ink-low">
        Instant events (typing, online, PPV unlocked, tips) are paused — everything still arrives
        by polling, just up to 20–60 s late.
        {pending.length > 0 && ` Pending upload for core: ${pending.join(', ')} — will flush on reconnect.`}
      </span>
    </FlowRow>
  );
}

function AiRow({ vm }: { vm: ActivityVM }): React.JSX.Element {
  const configured = vm.ai.hasAnthropicKey || vm.ai.hasOpenRouterKey;
  const provider = vm.ai.hasAnthropicKey ? 'Anthropic' : 'OpenRouter';
  return (
    <FlowRow label="AI">
      <Dot on={configured} />
      {configured ? (
        <>
          <Badge>DIRECT</Badge>{' '}
          <span className="text-ink-mid">
            {vm.mode === 'hub-live'
              ? `— ${provider} from this machine (central gateway = P6, deferred)`
              : `— ${provider} from this machine, key in keychain`}
          </span>
        </>
      ) : (
        <>
          <Badge>OFF</Badge>{' '}
          <span className="text-ink-mid">— no LLM key yet (Settings → API keys)</span>
        </>
      )}
    </FlowRow>
  );
}

// ─── outbox audit ──────────────────────────────────────────────────────────

function AuditReport({ report }: { report: OutboxAuditReportVM }): React.JSX.Element {
  const anomalies =
    report.doubleClaims.length +
    report.suspectDuplicates.length +
    report.staleUnconfirmed.length +
    report.sentMissingFromMessages.length;
  const totals = Object.entries(report.totals)
    .filter(([, count]) => count > 0)
    .map(([state, count]) => `${count} ${state}`)
    .join(' · ');
  return (
    <div className="num mt-2 rounded-chip border border-line bg-bg2 px-3 py-2 text-[11.5px] leading-[1.6] text-ink-mid">
      <div>
        AUDIT — {report.cleanSends} clean sends · {anomalies === 0 ? 'no anomalies' : `${anomalies} anomalies`}
      </div>
      <div className="text-ink-low">{totals === '' ? 'outbox empty' : totals}</div>
      {report.doubleClaims.length > 0 && (
        <div className="text-bad">
          double claims:{' '}
          {report.doubleClaims.map((claim) => `${claim.messageId}←[${claim.localIds.join(', ')}]`).join('; ')}
        </div>
      )}
      {report.suspectDuplicates.length > 0 && (
        <div className="text-bad">
          suspect duplicates:{' '}
          {report.suspectDuplicates.map((dup) => `chat ${dup.chatId} ×${dup.localIds.length}`).join('; ')}
        </div>
      )}
      {report.staleUnconfirmed.length > 0 && (
        <div>
          stale unconfirmed:{' '}
          {report.staleUnconfirmed
            .map((row) => `${row.localId} (chat ${row.chatId}, ${formatAgeShort(row.ageMs)})`)
            .join('; ')}
        </div>
      )}
      {report.sentMissingFromMessages.length > 0 && (
        <div>
          sent but missing locally:{' '}
          {report.sentMissingFromMessages.map((row) => `${row.messageId} (chat ${row.chatId})`).join('; ')}
        </div>
      )}
    </div>
  );
}

function SendsRow({ vm }: { vm: ActivityVM }): React.JSX.Element {
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
    <FlowRow label="SENDS">
      <span className="num text-[12px]">
        {vm.sends.sent} sent · {vm.sends.failed} failed · {vm.sends.unconfirmed} unconfirmed
      </span>{' '}
      <span className="text-ink-mid">today</span>
      <button
        type="button"
        onClick={runAudit}
        disabled={running}
        className="num ml-3 cursor-pointer rounded-chip border border-line-strong bg-bg1 px-3 py-1 text-[10.5px] tracking-[0.08em] text-ink-mid hover:border-ink-mid hover:text-ink disabled:cursor-default disabled:opacity-60"
      >
        {running ? 'AUDITING…' : 'RUN OUTBOX AUDIT'}
      </button>
      {report !== null && <AuditReport report={report} />}
    </FlowRow>
  );
}

// ─── ledgers ───────────────────────────────────────────────────────────────

const TH = 'num border-b border-line pb-1.5 pt-0 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-ink-low';
const TH_NUM = `${TH} text-right`;
const TD = 'border-b border-line py-1.5 text-[13px]';
const TD_NUM = `${TD} num whitespace-nowrap text-right`;

function CreditsLedger({ vm }: { vm: ActivityVM }): React.JSX.Element {
  const { credits } = vm;
  const footer: string[] = [];
  if (credits.balance !== null) footer.push(`Balance ${credits.balance.toLocaleString('en-US')}`);
  if (credits.estimatedDaysLeft !== null) footer.push(`at this pace ≈ ${credits.estimatedDaysLeft} days`);
  if (credits.rpmRemaining !== null)
    footer.push(`rate limit headroom ${credits.rpmRemaining.toLocaleString('en-US')} req/min`);

  return (
    <div className="border-b border-line px-4 pb-4 pt-3.5">
      <div className="cap mb-2.5 block text-ink-low">OFAPI credits · today</div>
      {credits.rows.length === 0 ? (
        <p className="text-[12.5px] text-ink-low">No OFAPI traffic recorded yet today.</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={TH}>what</th>
              <th className={TH_NUM}>requests</th>
              <th className={TH_NUM}>credits</th>
              <th className={TH} style={{ width: 160 }} />
            </tr>
          </thead>
          <tbody>
            {credits.rows.map((row) => (
              <tr key={row.purpose}>
                <td className={cx(TD, 'text-ink-mid')}>{purposeLabel(row.purpose)}</td>
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
              <td className="border-t border-line-strong py-1.5 text-[13px] font-semibold">Total today</td>
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

function AiSpendLedger({ vm }: { vm: ActivityVM }): React.JSX.Element {
  const { aiSpend } = vm;
  const footer: string[] = [];
  if (aiSpend.cacheReadShare !== null) footer.push(`Cache hits ${Math.round(aiSpend.cacheReadShare * 100)}%`);
  if (aiSpend.topRun !== null) {
    const who = aiSpend.topRun.fanLabel !== null ? `, ${aiSpend.topRun.fanLabel}` : '';
    footer.push(
      `most expensive single run today ${usd(aiSpend.topRun.costUsd)} (${shortFeature(aiSpend.topRun.feature)}${who})`,
    );
  }
  footer.push(`7-day total ${usd(aiSpend.sevenDayUsd)}`);

  return (
    <div className="px-4 pb-4 pt-3.5">
      <div className="cap mb-2.5 block text-ink-low">AI spend · today</div>
      {aiSpend.rows.length === 0 ? (
        <p className="text-[12.5px] text-ink-low">No AI runs yet today.</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={TH}>feature</th>
              <th className={TH_NUM}>runs</th>
              <th className={TH_NUM}>inserted</th>
              <th className={TH_NUM}>tokens</th>
              <th className={TH_NUM}>cost</th>
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
              <td className="border-t border-line-strong py-1.5 text-[13px] font-semibold">Total today</td>
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
  const vm = activity.data;

  return (
    <section className="overflow-hidden rounded-card border border-line bg-bg1 shadow-soft">
      <header className="border-b border-line px-4 pb-3 pt-4">
        <h2 className="font-serif text-[15px] font-semibold">Activity</h2>
        <p className="mt-0.5 text-[12px] text-ink-mid">
          Live data flow and today&rsquo;s spend on this machine. Read-only.
        </p>
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
            <div className="cap mb-2 block text-ink-low">Data flow · now</div>
            <MessagesRow vm={vm} />
            <HubRow vm={vm} />
            <AiRow vm={vm} />
            <SendsRow vm={vm} />
          </div>
          <CreditsLedger vm={vm} />
          <AiSpendLedger vm={vm} />
        </>
      )}
    </section>
  );
}
