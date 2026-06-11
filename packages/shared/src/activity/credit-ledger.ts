// Credits ledger aggregation (Activity panel, "OFAPI credits · today").
// Pure: takes persisted per-day per-purpose counters, returns rows in canonical
// display order plus totals and the balance-runway estimate for the footer.

import { OFAPI_PURPOSES, UNTAGGED_PURPOSE } from './purposes';

/** One persisted (day, purpose) counter pair, day already filtered by caller. */
export interface CreditLedgerEntry {
  purpose: string;
  requests: number;
  credits: number;
}

export interface CreditLedgerRow {
  purpose: string;
  requests: number;
  credits: number;
}

export interface CreditLedger {
  /** Canonical-order rows; purposes with zero activity are omitted. */
  rows: CreditLedgerRow[];
  totalRequests: number;
  totalCredits: number;
}

const PURPOSE_ORDER: readonly string[] = [...OFAPI_PURPOSES];

function orderIndex(purpose: string): number {
  const index = PURPOSE_ORDER.indexOf(purpose);
  if (index !== -1) {
    return index;
  }
  // Unknown (forward-compat) purposes sort after the known set; legacy
  // 'untagged' always renders last.
  return purpose === UNTAGGED_PURPOSE ? PURPOSE_ORDER.length + 1 : PURPOSE_ORDER.length;
}

/** Merges duplicate purposes, drops zero rows, sorts into display order. */
export function buildCreditLedger(entries: readonly CreditLedgerEntry[]): CreditLedger {
  const byPurpose = new Map<string, CreditLedgerRow>();
  for (const entry of entries) {
    const existing = byPurpose.get(entry.purpose);
    if (existing) {
      existing.requests += entry.requests;
      existing.credits += entry.credits;
    } else {
      byPurpose.set(entry.purpose, {
        purpose: entry.purpose,
        requests: entry.requests,
        credits: entry.credits,
      });
    }
  }
  const rows = [...byPurpose.values()]
    .filter((row) => row.requests > 0 || row.credits > 0)
    .sort((a, b) => orderIndex(a.purpose) - orderIndex(b.purpose) || a.purpose.localeCompare(b.purpose));
  let totalRequests = 0;
  let totalCredits = 0;
  for (const row of rows) {
    totalRequests += row.requests;
    totalCredits += row.credits;
  }
  return { rows, totalRequests, totalCredits };
}

/**
 * Footer "at this pace ≈ N days": balance over the mean of recent daily totals
 * (caller passes up to the trailing week, today included). Null when there is
 * no balance, no history, or no spend yet — the footer omits the estimate.
 */
export function estimateCreditDaysLeft(
  balance: number | null,
  dailyTotals: readonly number[],
): number | null {
  if (balance === null || balance <= 0) {
    return null;
  }
  const days = dailyTotals.filter((total) => total > 0);
  if (days.length === 0) {
    return null;
  }
  const meanPerDay = days.reduce((sum, total) => sum + total, 0) / days.length;
  return Math.round(balance / meanPerDay);
}
