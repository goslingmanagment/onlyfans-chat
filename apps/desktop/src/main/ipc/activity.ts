// query:activity.summary assembly (PLAN item 9; binding mockup
// docs/mockups/experiments/activity-panel.html). Read-only: aggregates the
// per-purpose credit_log, the durable ai_spend_log, outbox transitions, hub
// liveness and the usage/summary upload queues into one view-model. Pure
// aggregation lives in @chatgoose/shared/activity; this module is the SQL +
// composition glue.

import { z } from 'zod';
import {
  buildAiSpendLedger,
  buildCreditLedger,
  estimateCreditDaysLeft,
} from '@chatgoose/shared/activity/index';
import type { DataLayer } from '../db/index';
import type { SyncProvider } from '../sync/provider';
import type { HubSyncStatus } from '../sync/hub-sync';
import type { HubActivitySnapshot } from '../sync/hub-provider';
import type { CreditMeter } from '../ofapi/credit-meter';
import type { ActivityVM, AiFeatureCostsVM, SyncStatusVM } from '../../preload/contract';

/** Trailing window for the AI 7-day total and the credit pace estimate. */
const TRAILING_DAYS = 7;

export type ActivitySync = SyncProvider & {
  hubStatus?: () => HubSyncStatus | null;
  hubMode?: () => 'live' | 'degraded' | 'off';
  hubModeOverride?: () => SyncStatusVM['hubModeOverride'];
  hubActivity?: () => HubActivitySnapshot;
};

export interface ActivityDeps {
  data: DataLayer;
  sync: ActivitySync | null;
  creditMeter: CreditMeter | null;
  coreCredits?: ActivityVM['credits']['core'] | null;
  aiKeys: { hasAnthropicKey: boolean; hasOpenRouterKey: boolean };
  now?: () => number;
}

export function utcDayOf(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

function daysBefore(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - days * 24 * 60 * 60_000)
    .toISOString()
    .slice(0, 10);
}

function toIso(epochMs: number | null | undefined): string | null {
  return epochMs == null ? null : new Date(epochMs).toISOString();
}

const countRowSchema = z.object({ n: z.number() });
const stateCountSchema = z.object({ state: z.string(), n: z.number() });
const fanTopRunLabelRowSchema = z.object({ matches: z.number(), label: z.string().nullable() });

function countOne(data: DataLayer, sql: string, params: Record<string, string>): number {
  const row: unknown = data.db.prepare(sql).get(params);
  return row === undefined ? 0 : countRowSchema.parse(row).n;
}

/** Outbox transitions today (UTC) — sent/failed/unconfirmed by updated_at. */
export function sendsToday(data: DataLayer, day: string): SyncStatusVM['sendsToday'] {
  const rows = data.db
    .prepare(
      `SELECT state, COUNT(*) AS n FROM outbox
       WHERE updated_at >= @since AND state IN ('sent', 'failed', 'unconfirmed')
       GROUP BY state`,
    )
    .all({ since: `${day}T00:00:00.000Z` });
  const out = { sent: 0, failed: 0, unconfirmed: 0 };
  for (const raw of rows) {
    const row = stateCountSchema.parse(raw);
    if (row.state === 'sent' || row.state === 'failed' || row.state === 'unconfirmed') {
      out[row.state] = row.n;
    }
  }
  return out;
}

/** Status-bar "AI TODAY" aggregate (cheap: ≤ features×1 rows). */
export function aiTodayUsd(data: DataLayer, day: string): number {
  let micro = 0;
  for (const row of data.aiSpendLog.rowsSince(day)) {
    if (row.day === day) {
      micro += row.costMicroUsd;
    }
  }
  return Math.round(micro) / 1_000_000;
}

/**
 * Settings → Models cost hints: per-feature trailing-7-day {runs, usd}.
 * Cheap: PK-indexed scan of ≤ 7 days × ~8 features; integer micro-USD until
 * the final division (shared ai-spend convention).
 */
export function buildFeatureCosts(data: DataLayer, nowFn: () => number = Date.now): AiFeatureCostsVM {
  const today = utcDayOf(nowFn());
  const since = daysBefore(today, TRAILING_DAYS - 1);
  const acc = new Map<string, { runs: number; micro: number }>();
  for (const row of data.aiSpendLog.rowsSince(since)) {
    const current = acc.get(row.feature) ?? { runs: 0, micro: 0 };
    current.runs += row.runs;
    current.micro += row.costMicroUsd;
    acc.set(row.feature, current);
  }
  const byFeature: AiFeatureCostsVM['byFeature'] = {};
  for (const [feature, { runs, micro }] of acc) {
    byFeature[feature] = { runs, usd: Math.round(micro) / 1_000_000 };
  }
  return { sinceDay: since, byFeature };
}

export function buildActivitySummary(deps: ActivityDeps): ActivityVM {
  const { data, sync, creditMeter } = deps;
  const now = deps.now ?? Date.now;
  const today = utcDayOf(now());
  const since = daysBefore(today, TRAILING_DAYS - 1);

  // ── data flow ──────────────────────────────────────────────────────────
  const syncStatus = sync?.status() ?? { freshness: {}, state: 'offline' as const };
  const hubStatus = sync?.hubStatus?.() ?? null;
  const syncState = hubStatus === 'live' ? 'live' : syncStatus.state;
  const hubActivity = sync?.hubActivity?.() ?? null;
  const accounts = data.accounts.list().map((account) => ({
    accountId: account.id,
    name: account.displayName.trim() !== '' ? account.displayName : account.username,
    lastPolledAt: syncStatus.freshness[account.id] ?? null,
    pollIntervalMs: syncStatus.pollIntervalsMs?.[account.id] ?? null,
  }));

  const pendingUsageEvents = countOne(
    data,
    `SELECT COUNT(*) AS n FROM usage_events
     WHERE COALESCE(json_extract(payload, '$.quarantined'), 0) != 1`,
    {},
  );
  const quarantinedUsageEvents = countOne(
    data,
    `SELECT COUNT(*) AS n FROM usage_events
     WHERE COALESCE(json_extract(payload, '$.quarantined'), 0) = 1`,
    {},
  );
  const pendingSummaries = countOne(
    data,
    `SELECT COUNT(*) AS n FROM summaries
     WHERE json_extract(hub_sync_state, '$.state') = 'pending'`,
    {},
  );
  const syncedSummariesToday = countOne(
    data,
    `SELECT COUNT(*) AS n FROM summaries
     WHERE json_extract(hub_sync_state, '$.state') = 'synced'
       AND substr(json_extract(hub_sync_state, '$.at'), 1, 10) = @day`,
    { day: today },
  );

  // ── credits ledger ─────────────────────────────────────────────────────
  const meterSnapshot = creditMeter?.snapshot() ?? null;
  const ledger = buildCreditLedger(data.creditLog.byPurposeOn(today));
  const dailyTotals = data.creditLog.totalsSince(since).map((row) => row.used);
  const balance = meterSnapshot?.balance ?? null;

  // ── AI spend ledger ────────────────────────────────────────────────────
  const aiLedger = buildAiSpendLedger(data.aiSpendLog.rowsSince(since), today);
  let topRun: ActivityVM['aiSpend']['topRun'] = null;
  if (aiLedger.topRun !== null) {
    let fanLabel: string | null = null;
    if (aiLedger.topRun.chatId !== null) {
      const row: unknown = data.db
        .prepare(
          `SELECT
             COUNT(*) AS matches,
             MAX(COALESCE(NULLIF(custom_name, ''), NULLIF(name, ''))) AS label
           FROM fans
           WHERE fan_id = @id`,
        )
        .get({ id: aiLedger.topRun.chatId });
      if (row !== undefined) {
        const fan = fanTopRunLabelRowSchema.parse(row);
        fanLabel = fan.matches === 1 ? fan.label : null;
      }
    }
    topRun = { feature: aiLedger.topRun.feature, costUsd: aiLedger.topRun.costUsd, fanLabel };
  }

  return {
    mode: hubStatus === 'live' ? 'hub-live' : 'polling',
    syncState,
    accounts,
    deepSweepEveryMs: syncStatus.deepSweepEveryMs ?? null,
    hub: {
      status: hubStatus ?? 'off',
      lastEventAt: toIso(hubActivity?.lastEventAt),
      lastEventType: hubActivity?.lastEventType ?? null,
      eventsToday: hubActivity?.eventsToday ?? 0,
      liveSince: toIso(hubActivity?.liveSinceMs),
      statusChangedAt: toIso(hubActivity?.statusChangedAtMs),
      droppedFrames: hubActivity?.droppedFrames ?? 0,
      appliedEventsToday: hubActivity?.appliedEventsToday ?? 0,
      fallbackEventsToday: hubActivity?.fallbackEventsToday ?? 0,
      droppedEventsToday:
        (hubActivity?.droppedEventsToday ?? 0) + (hubActivity?.droppedFrames ?? 0),
      eventsByTypeToday: hubActivity?.eventsByTypeToday ?? {},
      appliedByTypeToday: hubActivity?.appliedByTypeToday ?? {},
      fallbackByTypeToday: hubActivity?.fallbackByTypeToday ?? {},
      droppedByTypeToday: hubActivity?.droppedByTypeToday ?? {},
      fallbackByReasonToday: hubActivity?.fallbackByReasonToday ?? {},
      lifetime: hubActivity?.lifetime ?? {
        received: { total: 0, byType: {} },
        applied: { total: 0, byType: {} },
        fallback: { total: 0, byType: {} },
        dropped: { total: 0, byType: {} },
        fallbackByReason: {},
      },
      lastFallbackReason: hubActivity?.lastFallbackReason ?? null,
      pendingUsageEvents,
      quarantinedUsageEvents,
      pendingSummaries,
      syncedSummariesToday,
    },
    ai: deps.aiKeys,
    sends: sendsToday(data, today),
    credits: {
      core: deps.coreCredits ?? null,
      rows: ledger.rows,
      totalRequests: ledger.totalRequests,
      totalCredits: ledger.totalCredits,
      balance,
      estimatedDaysLeft: estimateCreditDaysLeft(balance, dailyTotals),
      rpmRemaining: meterSnapshot?.rpmRemaining ?? null,
    },
    aiSpend: {
      rows: aiLedger.rows,
      totals: aiLedger.totals,
      cacheReadShare: aiLedger.cacheReadShare,
      topRun,
      sevenDayUsd: aiLedger.sevenDayUsd,
    },
  };
}
