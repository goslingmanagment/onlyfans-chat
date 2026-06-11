// AI-spend ledger aggregation (Activity panel, "AI spend · today"). Pure over
// the persisted ai_spend_log daily counters — usage_events is a hub upload
// QUEUE that drains when core is live, so the panel never aggregates it
// directly. Costs are stored as integer micro-USD (no float accumulation).

import { FEATURE_POLICIES } from '../features';

/** One persisted ai_spend_log row (per UTC day, per feature). */
export interface AiSpendDayRow {
  day: string;
  feature: string;
  runs: number;
  /** Runs settled from the summary cache (legacy isCacheHit) — zero spend. */
  cacheHitRuns: number;
  /** Drafts the chatter inserted/copied (cmd:ai.feedback). */
  inserted: number;
  inputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  costMicroUsd: number;
  /** Most expensive single run that day for this feature. */
  topRunMicroUsd: number;
  topRunChatId: string | null;
}

export interface AiSpendLedgerRow {
  feature: string;
  runs: number;
  /** Null for features without an insert affordance (panel-tab surfaces). */
  inserted: number | null;
  tokens: number;
  costUsd: number;
}

export interface AiSpendTopRun {
  feature: string;
  costUsd: number;
  chatId: string | null;
}

export interface AiSpendLedger {
  /** Today's canonical-order rows; features with zero runs are omitted. */
  rows: AiSpendLedgerRow[];
  totals: {
    runs: number;
    inserted: number;
    /** Runs of insertable features — the denominator of "45 / 52". */
    insertableRuns: number;
    tokens: number;
    costUsd: number;
  };
  /** Prompt-cache read share of today's prompt tokens (0..1); null = no tokens. */
  cacheReadShare: number | null;
  /** Most expensive single run today across features. */
  topRun: AiSpendTopRun | null;
  /** Trailing total across every row passed in (today included). */
  sevenDayUsd: number;
}

/** Display labels — "Scan" is the team name for fan-summary (DESIGN §1). */
export const AI_FEATURE_LABELS: Readonly<Record<string, string>> = {
  'fast-reply': 'Fast Reply',
  'improve-draft': 'Improve Draft',
  'help-me': 'Help Me',
  'ping': 'Ping',
  'hi-greeting': 'Hi Greeting',
  'fan-summary': 'Scan (fan summary)',
  'chat-review': 'Chat review',
  'compare': 'Compare',
};

export function aiFeatureLabel(feature: string): string {
  return AI_FEATURE_LABELS[feature] ?? feature;
}

const FEATURE_ORDER: readonly string[] = [
  'fast-reply',
  'improve-draft',
  'help-me',
  'ping',
  'hi-greeting',
  'fan-summary',
  'chat-review',
  'compare',
];

function orderIndex(feature: string): number {
  const index = FEATURE_ORDER.indexOf(feature);
  return index === -1 ? FEATURE_ORDER.length : index;
}

/**
 * Insert affordance exists only for ai-dock reply surfaces (DESIGN §1) —
 * analysis outputs (Help Me, Scan, Chat review) render read-only, so their
 * "inserted" cell is an em dash, not a zero. 'compare' composes fast-reply
 * cards with per-card insert, so it counts as insertable.
 */
export function isInsertableFeature(feature: string): boolean {
  if (feature === 'compare') {
    return true;
  }
  const policy = (FEATURE_POLICIES as Record<string, { surface: string } | undefined>)[feature];
  return policy !== undefined && policy.surface === 'ai-dock';
}

function microToUsd(micro: number): number {
  return Math.round(micro) / 1_000_000;
}

/**
 * Builds the panel's AI ledger from up to 7 days of ai_spend_log rows.
 * `today` (UTC YYYY-MM-DD) selects the rows for the table; every row passed in
 * contributes to `sevenDayUsd`.
 */
export function buildAiSpendLedger(
  rows: readonly AiSpendDayRow[],
  today: string,
): AiSpendLedger {
  const byFeature = new Map<string, AiSpendDayRow>();
  let sevenDayMicro = 0;
  for (const row of rows) {
    sevenDayMicro += row.costMicroUsd;
    if (row.day !== today) {
      continue;
    }
    const existing = byFeature.get(row.feature);
    if (existing) {
      existing.runs += row.runs;
      existing.cacheHitRuns += row.cacheHitRuns;
      existing.inserted += row.inserted;
      existing.inputTokens += row.inputTokens;
      existing.cacheWriteTokens += row.cacheWriteTokens;
      existing.cacheReadTokens += row.cacheReadTokens;
      existing.outputTokens += row.outputTokens;
      existing.costMicroUsd += row.costMicroUsd;
      if (row.topRunMicroUsd > existing.topRunMicroUsd) {
        existing.topRunMicroUsd = row.topRunMicroUsd;
        existing.topRunChatId = row.topRunChatId;
      }
    } else {
      byFeature.set(row.feature, { ...row });
    }
  }

  const todayRows = [...byFeature.values()]
    .filter((row) => row.runs > 0)
    .sort((a, b) => orderIndex(a.feature) - orderIndex(b.feature) || a.feature.localeCompare(b.feature));

  const ledgerRows: AiSpendLedgerRow[] = [];
  const totals = { runs: 0, inserted: 0, insertableRuns: 0, tokens: 0, costUsd: 0 };
  let totalMicro = 0;
  let promptTokens = 0;
  let cacheReadTokens = 0;
  let topRun: AiSpendTopRun | null = null;

  for (const row of todayRows) {
    const insertable = isInsertableFeature(row.feature);
    const tokens =
      row.inputTokens + row.cacheWriteTokens + row.cacheReadTokens + row.outputTokens;
    ledgerRows.push({
      feature: row.feature,
      runs: row.runs,
      inserted: insertable ? row.inserted : null,
      tokens,
      costUsd: microToUsd(row.costMicroUsd),
    });
    totals.runs += row.runs;
    totals.tokens += tokens;
    totalMicro += row.costMicroUsd;
    if (insertable) {
      totals.inserted += row.inserted;
      totals.insertableRuns += row.runs;
    }
    promptTokens += row.inputTokens + row.cacheWriteTokens + row.cacheReadTokens;
    cacheReadTokens += row.cacheReadTokens;
    if (row.topRunMicroUsd > 0 && (topRun === null || microToUsd(row.topRunMicroUsd) > topRun.costUsd)) {
      topRun = {
        feature: row.feature,
        costUsd: microToUsd(row.topRunMicroUsd),
        chatId: row.topRunChatId,
      };
    }
  }
  totals.costUsd = microToUsd(totalMicro);

  return {
    rows: ledgerRows,
    totals,
    cacheReadShare: promptTokens > 0 ? cacheReadTokens / promptTokens : null,
    topRun,
    sevenDayUsd: microToUsd(sevenDayMicro),
  };
}
