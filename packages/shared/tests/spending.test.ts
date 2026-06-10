// Legacy earnings.test.ts cases re-expressed against OFAPI dollar inputs
// (mills-conversion-specific assertions adapted to dollars; see module deviations).

import { describe, expect, it } from 'vitest';
import {
  deriveMonthlyBreakdowns,
  deriveMonthlyTotals,
  formatFanSpendingData,
  formatUsd,
  monthWindowMs,
  type FanSpendingData,
  type FanTransactionRow,
  type SpendingSums,
} from '../src/context/spending';

const FAN_ID = '518588958';

function makeSums(overrides: Partial<SpendingSums> = {}): SpendingSums {
  return {
    totalSumm: 0,
    subscribesSumm: 0,
    tipsSumm: 0,
    messagesSumm: 0,
    postsSumm: 0,
    streamsSumm: 0,
    ...overrides,
  };
}

function makeData(overrides: Partial<FanSpendingData> = {}): FanSpendingData {
  return { fanId: FAN_ID, sums: makeSums(), ...overrides };
}

function row(type: string, amount: number, date: string): FanTransactionRow {
  return { type, amount, date };
}

describe('formatUsd', () => {
  // Adapted from legacy millsToUsd cases (10000/500/1500/0 mills) — inputs are dollars now.
  it('formats 10 as $10.00', () => {
    expect(formatUsd(10)).toBe('$10.00');
  });

  it('formats 0.5 as $0.50', () => {
    expect(formatUsd(0.5)).toBe('$0.50');
  });

  it('formats 1.5 as $1.50', () => {
    expect(formatUsd(1.5)).toBe('$1.50');
  });

  it('formats 0 as $0.00', () => {
    expect(formatUsd(0)).toBe('$0.00');
  });

  it('formats a real probe total (88.8) as $88.80', () => {
    expect(formatUsd(88.8)).toBe('$88.80');
  });
});

describe('formatFanSpendingData', () => {
  it('returns empty string when sums are unavailable', () => {
    expect(formatFanSpendingData({ fanId: FAN_ID, sums: null })).toBe('');
  });

  it('formats header and zero total for all-zero sums, omitting the breakdown', () => {
    const result = formatFanSpendingData(makeData());
    expect(result).toContain('FAN SPENDING DATA:');
    expect(result).toContain(`Fan ID: ${FAN_ID}`);
    expect(result).toContain('Total gross (all-time): $0.00');
    expect(result).not.toContain('Type breakdown');
  });

  it('formats breakdown lines with labels and amounts', () => {
    const result = formatFanSpendingData(
      makeData({ sums: makeSums({ totalSumm: 60, tipsSumm: 50, subscribesSumm: 10 }) }),
    );
    expect(result).toContain('Total gross (all-time): $60.00');
    expect(result).toContain('- Tips: $50.00');
    expect(result).toContain('- Subscriptions: $10.00');
  });

  it('sorts the type breakdown descending by amount', () => {
    const result = formatFanSpendingData(
      makeData({
        sums: makeSums({ totalSumm: 65, subscribesSumm: 10, tipsSumm: 50, messagesSumm: 5 }),
      }),
    );
    const tips = result.indexOf('- Tips:');
    const subs = result.indexOf('- Subscriptions:');
    const messages = result.indexOf('- Paid messages:');
    expect(tips).toBeGreaterThan(-1);
    expect(tips).toBeLessThan(subs);
    expect(subs).toBeLessThan(messages);
  });

  it('omits zero-amount categories from the breakdown', () => {
    const result = formatFanSpendingData(
      makeData({ sums: makeSums({ totalSumm: 88.8, messagesSumm: 64, postsSumm: 24.8 }) }),
    );
    expect(result).toContain('- Paid messages: $64.00');
    expect(result).toContain('- Paid posts: $24.80');
    expect(result).not.toContain('Tips');
    expect(result).not.toContain('Subscriptions');
    expect(result).not.toContain('Streams');
  });

  it('falls back to summing categories when totalSumm is absent', () => {
    const result = formatFanSpendingData(
      makeData({ sums: { tipsSumm: 12.5, messagesSumm: 7.5 } }),
    );
    expect(result).toContain('Total gross (all-time): $20.00');
  });

  it('includes monthly totals when present, newest first', () => {
    const result = formatFanSpendingData(
      makeData({
        monthlyTotals: [
          { year: 2026, month: 2, total: 195 },
          { year: 2026, month: 1, total: 400 },
        ],
      }),
    );
    expect(result).toContain('Monthly totals:');
    expect(result).toContain('- Feb 2026: $195.00');
    expect(result).toContain('- Jan 2026: $400.00');
  });

  it('includes monthly breakdowns for deep features', () => {
    const result = formatFanSpendingData(
      makeData({
        monthlyBreakdowns: [
          {
            year: 2026,
            month: 2,
            breakdown: [
              { label: 'Tips', amount: 150 },
              { label: 'Subscriptions', amount: 45 },
            ],
          },
        ],
      }),
    );
    expect(result).toContain('Monthly breakdown by type:');
    expect(result).toContain('- Feb 2026: Tips $150.00, Subscriptions $45.00');
  });

  it('skips months whose breakdown is empty', () => {
    const result = formatFanSpendingData(
      makeData({
        monthlyBreakdowns: [
          { year: 2026, month: 3, breakdown: [] },
          { year: 2026, month: 2, breakdown: [{ label: 'Tips', amount: 5 }] },
        ],
      }),
    );
    expect(result).not.toContain('Mar 2026');
    expect(result).toContain('- Feb 2026: Tips $5.00');
  });

  it('shows partial note when monthlyBreakdownsPartial is set', () => {
    const result = formatFanSpendingData(
      makeData({
        monthlyBreakdowns: [{ year: 2026, month: 2, breakdown: [{ label: 'Subscriptions', amount: 45 }] }],
        monthlyBreakdownsPartial: true,
      }),
    );
    expect(result).toContain('(some months could not be fetched)');
  });

  it('shows partial note even when all per-month breakdowns failed', () => {
    const result = formatFanSpendingData(
      makeData({ monthlyBreakdowns: [], monthlyBreakdownsPartial: true }),
    );
    expect(result).not.toContain('Monthly breakdown by type:');
    expect(result).toContain('(some months could not be fetched)');
  });

  it('omits monthly sections when not provided', () => {
    const result = formatFanSpendingData(makeData({ sums: makeSums({ totalSumm: 10, tipsSumm: 10 }) }));
    expect(result).not.toContain('Monthly totals:');
    expect(result).not.toContain('Monthly breakdown by type:');
  });

  it('renders the full block in the legacy line order', () => {
    const result = formatFanSpendingData({
      fanId: FAN_ID,
      sums: makeSums({ totalSumm: 88.8, messagesSumm: 64, postsSumm: 24.8 }),
      monthlyTotals: [{ year: 2026, month: 5, total: 88.8 }],
      monthlyBreakdowns: [
        {
          year: 2026,
          month: 5,
          breakdown: [
            { label: 'Paid messages', amount: 64 },
            { label: 'Paid posts', amount: 24.8 },
          ],
        },
      ],
      monthlyBreakdownsPartial: true,
    });
    expect(result).toBe(
      [
        'FAN SPENDING DATA:',
        `Fan ID: ${FAN_ID}`,
        'Total gross (all-time): $88.80',
        'Type breakdown (all-time):',
        '- Paid messages: $64.00',
        '- Paid posts: $24.80',
        'Monthly totals:',
        '- May 2026: $88.80',
        'Monthly breakdown by type:',
        '- May 2026: Paid messages $64.00, Paid posts $24.80',
        '(some months could not be fetched)',
      ].join('\n'),
    );
  });
});

describe('deriveMonthlyTotals', () => {
  it('returns empty array for empty input', () => {
    expect(deriveMonthlyTotals([])).toEqual([]);
  });

  it('aggregates multiple rows in the same month', () => {
    const result = deriveMonthlyTotals([
      row('message', 10, '2026-02-03T10:00:00+00:00'),
      row('tip', 15, '2026-02-20T10:00:00+00:00'),
    ]);
    expect(result).toEqual([{ year: 2026, month: 2, total: 25 }]);
  });

  it('sorts by year/month descending', () => {
    const result = deriveMonthlyTotals([
      row('tip', 100, '2025-06-15T00:00:00+00:00'),
      row('tip', 200, '2026-02-15T00:00:00+00:00'),
      row('tip', 300, '2026-01-15T00:00:00+00:00'),
    ]);
    expect(result).toEqual([
      { year: 2026, month: 2, total: 200 },
      { year: 2026, month: 1, total: 300 },
      { year: 2025, month: 6, total: 100 },
    ]);
  });

  it('groups by UTC month, not local time', () => {
    const result = deriveMonthlyTotals([row('tip', 5, '2026-02-01T00:30:00+02:00')]);
    expect(result).toEqual([{ year: 2026, month: 1, total: 5 }]);
  });

  it('skips rows with unparseable dates', () => {
    const result = deriveMonthlyTotals([
      row('tip', 5, 'not-a-date'),
      row('tip', 7, '2026-02-15T00:00:00+00:00'),
    ]);
    expect(result).toEqual([{ year: 2026, month: 2, total: 7 }]);
  });
});

describe('deriveMonthlyBreakdowns', () => {
  it('returns empty array for empty input', () => {
    expect(deriveMonthlyBreakdowns([])).toEqual([]);
  });

  it('aggregates rows of the same type within a month', () => {
    const result = deriveMonthlyBreakdowns([
      row('message', 10, '2026-02-03T10:00:00+00:00'),
      row('message', 15, '2026-02-20T10:00:00+00:00'),
    ]);
    expect(result).toEqual([
      { year: 2026, month: 2, breakdown: [{ label: 'Paid messages', amount: 25 }] },
    ]);
  });

  it('sorts each month breakdown descending by amount', () => {
    const result = deriveMonthlyBreakdowns([
      row('subscribe', 10, '2026-02-03T10:00:00+00:00'),
      row('tip', 50, '2026-02-04T10:00:00+00:00'),
      row('message', 5, '2026-02-05T10:00:00+00:00'),
    ]);
    expect(result[0]?.breakdown.map((entry) => entry.label)).toEqual([
      'Tips',
      'Subscriptions',
      'Paid messages',
    ]);
  });

  it('uses known labels for known transaction types', () => {
    const result = deriveMonthlyBreakdowns([
      row('subscribe', 1, '2026-02-01T00:00:00+00:00'),
      row('tip', 2, '2026-02-01T00:00:00+00:00'),
      row('message', 3, '2026-02-01T00:00:00+00:00'),
      row('post', 4, '2026-02-01T00:00:00+00:00'),
      row('stream', 5, '2026-02-01T00:00:00+00:00'),
    ]);
    const labels = result[0]?.breakdown.map((entry) => entry.label);
    expect(labels).toEqual(['Streams', 'Paid posts', 'Paid messages', 'Tips', 'Subscriptions']);
  });

  it('uses "Unknown (type XXX)" for unknown transaction types', () => {
    const result = deriveMonthlyBreakdowns([row('mystery_thing', 9, '2026-02-01T00:00:00+00:00')]);
    expect(result[0]?.breakdown[0]?.label).toBe('Unknown (type mystery_thing)');
  });

  it('sorts months descending across years', () => {
    const result = deriveMonthlyBreakdowns([
      row('tip', 1, '2025-06-15T00:00:00+00:00'),
      row('tip', 2, '2026-02-15T00:00:00+00:00'),
      row('tip', 3, '2026-01-15T00:00:00+00:00'),
    ]);
    expect(result.map((m) => [m.year, m.month])).toEqual([
      [2026, 2],
      [2026, 1],
      [2025, 6],
    ]);
  });
});

describe('monthWindowMs', () => {
  it('returns correct UTC boundaries for a month', () => {
    const { start, end } = monthWindowMs(2026, 2);
    expect(start).toBe(Date.UTC(2026, 1, 1));
    expect(end).toBe(Date.UTC(2026, 2, 1));
  });

  it('handles December → January boundary', () => {
    const { start, end } = monthWindowMs(2025, 12);
    expect(start).toBe(Date.UTC(2025, 11, 1));
    expect(end).toBe(Date.UTC(2026, 0, 1));
  });
});
