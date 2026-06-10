// FAN SPENDING DATA context block. Text shapes are legacy-locked (research doc
// §2.13, SPEC §8.2/§15.6) — prompts were tuned against them. Inputs are OFAPI:
// all-time sums from `subscribedOnData` and rows from GET /{account}/transactions.
// All amounts are dollars already — never divide by 1000 (legacy Fansly mills rule
// does not apply here).

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** All-time spending sums from OFAPI `subscribedOnData` (dollars). */
export interface SpendingSums {
  totalSumm?: number | null;
  subscribesSumm?: number | null;
  tipsSumm?: number | null;
  messagesSumm?: number | null;
  postsSumm?: number | null;
  streamsSumm?: number | null;
}

/** One GET /{account}/transactions row, reduced to what the block needs. */
export interface FanTransactionRow {
  /** OFAPI transaction type, e.g. `message`, `tip`, `subscribe`, `post`, `stream`. */
  type: string;
  /** Gross dollars (`amount`). */
  amount: number;
  /** ISO timestamp (`createdAt`); rows with unparseable dates are skipped. */
  date: string;
}

export interface MonthlySpendingTotal {
  year: number;
  month: number;
  total: number;
}

export interface SpendingBreakdownEntry {
  label: string;
  amount: number;
}

export interface MonthlySpendingBreakdown {
  year: number;
  month: number;
  breakdown: SpendingBreakdownEntry[];
}

export interface FanSpendingData {
  /** Raw OnlyFans numeric fan id (`chat_id === fan.id`), stringified. */
  fanId: string;
  /** Pass null when subscribedOnData is unavailable — the block is omitted. */
  sums: SpendingSums | null;
  monthlyTotals?: MonthlySpendingTotal[];
  monthlyBreakdowns?: MonthlySpendingBreakdown[];
  /** Some months/pages of transactions could not be fetched. */
  monthlyBreakdownsPartial?: boolean;
}

export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/** UTC boundaries [start, end) of a calendar month; `month` is 1-based. */
export function monthWindowMs(year: number, month: number): { start: number; end: number } {
  return { start: Date.UTC(year, month - 1, 1), end: Date.UTC(year, month, 1) };
}

const SUM_CATEGORIES: ReadonlyArray<{ key: keyof SpendingSums; label: string }> = [
  { key: 'subscribesSumm', label: 'Subscriptions' },
  { key: 'tipsSumm', label: 'Tips' },
  { key: 'messagesSumm', label: 'Paid messages' },
  { key: 'postsSumm', label: 'Paid posts' },
  { key: 'streamsSumm', label: 'Streams' },
];

const TRANSACTION_LABELS: Record<string, string> = {
  subscribe: 'Subscriptions',
  subscribes: 'Subscriptions',
  subscription: 'Subscriptions',
  tip: 'Tips',
  tips: 'Tips',
  message: 'Paid messages',
  chat_message: 'Paid messages',
  chat_messages: 'Paid messages',
  post: 'Paid posts',
  posts: 'Paid posts',
  stream: 'Streams',
  streams: 'Streams',
};

// Legacy fallback shape "Unknown (type XXXX)" carried; type is a string here.
function transactionLabel(type: string): string {
  return TRANSACTION_LABELS[type] ?? `Unknown (type ${type})`;
}

function utcYearMonth(iso: string): { year: number; month: number } | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    return null;
  }
  const date = new Date(ms);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function byMonthDesc(a: { year: number; month: number }, b: { year: number; month: number }): number {
  return b.year - a.year || b.month - a.month;
}

export function deriveMonthlyTotals(rows: FanTransactionRow[]): MonthlySpendingTotal[] {
  const months = new Map<string, MonthlySpendingTotal>();
  for (const row of rows) {
    const ym = utcYearMonth(row.date);
    if (!ym) {
      continue;
    }
    const key = `${ym.year}-${ym.month}`;
    const entry = months.get(key) ?? { year: ym.year, month: ym.month, total: 0 };
    entry.total += row.amount;
    months.set(key, entry);
  }
  return [...months.values()].sort(byMonthDesc);
}

export function deriveMonthlyBreakdowns(rows: FanTransactionRow[]): MonthlySpendingBreakdown[] {
  const months = new Map<string, { year: number; month: number; byLabel: Map<string, number> }>();
  for (const row of rows) {
    const ym = utcYearMonth(row.date);
    if (!ym) {
      continue;
    }
    const key = `${ym.year}-${ym.month}`;
    const entry = months.get(key) ?? { year: ym.year, month: ym.month, byLabel: new Map<string, number>() };
    const label = transactionLabel(row.type);
    entry.byLabel.set(label, (entry.byLabel.get(label) ?? 0) + row.amount);
    months.set(key, entry);
  }
  return [...months.values()].sort(byMonthDesc).map((entry) => ({
    year: entry.year,
    month: entry.month,
    breakdown: [...entry.byLabel.entries()]
      .map(([label, amount]) => ({ label, amount }))
      .sort((left, right) => right.amount - left.amount),
  }));
}

function formatMonthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function formatFanSpendingData(data: FanSpendingData): string {
  if (!data.sums) {
    return '';
  }

  const breakdown = SUM_CATEGORIES
    .map(({ key, label }) => ({ label, amount: data.sums?.[key] ?? 0 }))
    .filter((entry) => entry.amount > 0)
    .sort((left, right) => right.amount - left.amount);
  const total = data.sums.totalSumm ?? breakdown.reduce((sum, entry) => sum + entry.amount, 0);

  const lines: string[] = [
    'FAN SPENDING DATA:',
    `Fan ID: ${data.fanId}`,
    `Total gross (all-time): ${formatUsd(total)}`,
  ];

  if (breakdown.length > 0) {
    lines.push('Type breakdown (all-time):');
    for (const entry of breakdown) {
      lines.push(`- ${entry.label}: ${formatUsd(entry.amount)}`);
    }
  }

  if (data.monthlyTotals && data.monthlyTotals.length > 0) {
    lines.push('Monthly totals:');
    for (const month of data.monthlyTotals) {
      lines.push(`- ${formatMonthLabel(month.year, month.month)}: ${formatUsd(month.total)}`);
    }
  }

  if (data.monthlyBreakdowns && data.monthlyBreakdowns.length > 0) {
    lines.push('Monthly breakdown by type:');
    for (const month of data.monthlyBreakdowns) {
      if (month.breakdown.length > 0) {
        const parts = month.breakdown.map((entry) => `${entry.label} ${formatUsd(entry.amount)}`);
        lines.push(`- ${formatMonthLabel(month.year, month.month)}: ${parts.join(', ')}`);
      }
    }
  }

  if (data.monthlyBreakdownsPartial) {
    lines.push('(some months could not be fetched)');
  }

  return lines.join('\n');
}
