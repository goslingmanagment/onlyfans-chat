import { describe, expect, it } from 'vitest';
import {
  buildAiSpendLedger,
  buildCreditLedger,
  estimateCreditDaysLeft,
  isInsertableFeature,
  OFAPI_PURPOSES,
  OFAPI_PURPOSE_LABELS,
  purposeLabel,
  aiFeatureLabel,
  UNTAGGED_PURPOSE,
  type AiSpendDayRow,
} from '../src/activity/index';

// ─── credit ledger ─────────────────────────────────────────────────────────

function entry(purpose: string, requests: number, credits: number) {
  return { purpose, requests, credits };
}

describe('buildCreditLedger', () => {
  it('orders rows canonically (poll purposes first, untagged last)', () => {
    const ledger = buildCreditLedger([
      entry(UNTAGGED_PURPOSE, 0, 12),
      entry('send', 4, 4),
      entry('hot-poll', 612, 612),
      entry('deep-sweep', 36, 180),
    ]);
    expect(ledger.rows.map((row) => row.purpose)).toEqual([
      'hot-poll',
      'deep-sweep',
      'send',
      UNTAGGED_PURPOSE,
    ]);
  });

  it('sums totals across rows', () => {
    const ledger = buildCreditLedger([
      entry('hot-poll', 612, 612),
      entry('deep-sweep', 36, 180),
      entry('message-tail', 64, 64),
      entry('media', 31, 31),
      entry('scan-deep-fetch', 2, 13),
    ]);
    expect(ledger.totalRequests).toBe(745);
    expect(ledger.totalCredits).toBe(900);
  });

  it('merges duplicate purposes', () => {
    const ledger = buildCreditLedger([entry('media', 10, 10), entry('media', 5, 5)]);
    expect(ledger.rows).toEqual([{ purpose: 'media', requests: 15, credits: 15 }]);
  });

  it('drops all-zero rows', () => {
    const ledger = buildCreditLedger([entry('vault', 0, 0), entry('hot-poll', 1, 1)]);
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0]?.purpose).toBe('hot-poll');
  });

  it('keeps zero-credit rows with requests (typing & free endpoints still count)', () => {
    const ledger = buildCreditLedger([entry('send', 9, 0)]);
    expect(ledger.rows).toEqual([{ purpose: 'send', requests: 9, credits: 0 }]);
  });

  it('keeps legacy untagged rows with credits but no request count', () => {
    const ledger = buildCreditLedger([entry(UNTAGGED_PURPOSE, 0, 480)]);
    expect(ledger.rows).toEqual([{ purpose: UNTAGGED_PURPOSE, requests: 0, credits: 480 }]);
  });

  it('returns an empty ledger for no entries', () => {
    expect(buildCreditLedger([])).toEqual({ rows: [], totalRequests: 0, totalCredits: 0 });
  });

  it('places unknown (forward-compat) purposes before untagged, alphabetically', () => {
    const ledger = buildCreditLedger([
      entry(UNTAGGED_PURPOSE, 0, 1),
      entry('zz-future', 1, 1),
      entry('aa-future', 1, 1),
    ]);
    expect(ledger.rows.map((row) => row.purpose)).toEqual([
      'aa-future',
      'zz-future',
      UNTAGGED_PURPOSE,
    ]);
  });
});

describe('estimateCreditDaysLeft', () => {
  it('divides balance by the mean of non-zero days', () => {
    // mean of (900, 700, 800) = 800 → 96,000 / 800 = 120 days
    expect(estimateCreditDaysLeft(96_000, [900, 700, 800])).toBe(120);
  });

  it('ignores zero days (app not running ≠ cheaper pace)', () => {
    expect(estimateCreditDaysLeft(1_000, [0, 100, 0])).toBe(10);
  });

  it('rounds to whole days', () => {
    expect(estimateCreditDaysLeft(1_000, [300])).toBe(3);
  });

  it('returns null without a balance', () => {
    expect(estimateCreditDaysLeft(null, [900])).toBeNull();
  });

  it('returns null with no spend history', () => {
    expect(estimateCreditDaysLeft(96_000, [])).toBeNull();
    expect(estimateCreditDaysLeft(96_000, [0, 0])).toBeNull();
  });

  it('returns null for a non-positive balance', () => {
    expect(estimateCreditDaysLeft(0, [900])).toBeNull();
  });
});

// ─── purpose labels ────────────────────────────────────────────────────────

describe('purpose labels', () => {
  it('labels every known purpose', () => {
    for (const purpose of OFAPI_PURPOSES) {
      expect(OFAPI_PURPOSE_LABELS[purpose]).toBeTruthy();
    }
    expect(OFAPI_PURPOSE_LABELS[UNTAGGED_PURPOSE]).toBeTruthy();
  });

  it('falls back to the raw purpose string', () => {
    expect(purposeLabel('mystery')).toBe('mystery');
    expect(purposeLabel('hot-poll')).toBe('Hot polls (new-message detector)');
  });
});

// ─── AI spend ledger ───────────────────────────────────────────────────────

const TODAY = '2026-06-11';

function dayRow(overrides: Partial<AiSpendDayRow> & { feature: string }): AiSpendDayRow {
  return {
    day: TODAY,
    runs: 1,
    cacheHitRuns: 0,
    inserted: 0,
    inputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    outputTokens: 0,
    costMicroUsd: 0,
    topRunMicroUsd: 0,
    topRunChatId: null,
    ...overrides,
  };
}

describe('isInsertableFeature', () => {
  it('marks ai-dock reply features insertable', () => {
    expect(isInsertableFeature('fast-reply')).toBe(true);
    expect(isInsertableFeature('improve-draft')).toBe(true);
    expect(isInsertableFeature('ping')).toBe(true);
    expect(isInsertableFeature('hi-greeting')).toBe(true);
    expect(isInsertableFeature('compare')).toBe(true);
  });

  it('marks analysis surfaces non-insertable (em dash cells)', () => {
    expect(isInsertableFeature('help-me')).toBe(false);
    expect(isInsertableFeature('fan-summary')).toBe(false);
    expect(isInsertableFeature('chat-review')).toBe(false);
    expect(isInsertableFeature('unknown-thing')).toBe(false);
  });
});

describe('buildAiSpendLedger', () => {
  it('builds the mockup-shaped table: per-feature rows in canonical order', () => {
    const ledger = buildAiSpendLedger(
      [
        dayRow({ feature: 'fan-summary', runs: 2, inputTokens: 187_000, costMicroUsd: 210_000 }),
        dayRow({ feature: 'fast-reply', runs: 34, inserted: 29, inputTokens: 412_000, costMicroUsd: 380_000 }),
        dayRow({ feature: 'ping', runs: 4, inserted: 3, inputTokens: 44_000, costMicroUsd: 50_000 }),
      ],
      TODAY,
    );
    expect(ledger.rows.map((row) => row.feature)).toEqual(['fast-reply', 'ping', 'fan-summary']);
  });

  it('nulls the inserted cell for non-insertable features and excludes their runs from the denominator', () => {
    const ledger = buildAiSpendLedger(
      [
        dayRow({ feature: 'fast-reply', runs: 34, inserted: 29 }),
        dayRow({ feature: 'improve-draft', runs: 12, inserted: 11 }),
        dayRow({ feature: 'help-me', runs: 6 }),
        dayRow({ feature: 'ping', runs: 4, inserted: 3 }),
        dayRow({ feature: 'hi-greeting', runs: 2, inserted: 2 }),
        dayRow({ feature: 'fan-summary', runs: 2 }),
      ],
      TODAY,
    );
    const helpMe = ledger.rows.find((row) => row.feature === 'help-me');
    expect(helpMe?.inserted).toBeNull();
    // The mockup's "45 / 52" total: inserted across insertable features / their runs.
    expect(ledger.totals.inserted).toBe(45);
    expect(ledger.totals.insertableRuns).toBe(52);
    expect(ledger.totals.runs).toBe(60);
  });

  it('sums tokens across all four token kinds', () => {
    const ledger = buildAiSpendLedger(
      [
        dayRow({
          feature: 'fast-reply',
          inputTokens: 100,
          cacheWriteTokens: 200,
          cacheReadTokens: 300,
          outputTokens: 400,
        }),
      ],
      TODAY,
    );
    expect(ledger.rows[0]?.tokens).toBe(1_000);
    expect(ledger.totals.tokens).toBe(1_000);
  });

  it('converts micro-USD without float drift', () => {
    const rows = Array.from({ length: 10 }, () =>
      dayRow({ feature: 'fast-reply', costMicroUsd: 110_000 }),
    );
    const ledger = buildAiSpendLedger(rows, TODAY);
    expect(ledger.totals.costUsd).toBe(1.1);
  });

  it('computes the prompt-cache read share from prompt tokens only', () => {
    const ledger = buildAiSpendLedger(
      [
        dayRow({
          feature: 'fast-reply',
          inputTokens: 100,
          cacheWriteTokens: 100,
          cacheReadTokens: 800,
          outputTokens: 9_999,
        }),
      ],
      TODAY,
    );
    expect(ledger.cacheReadShare).toBeCloseTo(0.8);
  });

  it('returns null cache share when no prompt tokens ran today', () => {
    expect(buildAiSpendLedger([], TODAY).cacheReadShare).toBeNull();
  });

  it('picks the most expensive single run across features', () => {
    const ledger = buildAiSpendLedger(
      [
        dayRow({ feature: 'fast-reply', topRunMicroUsd: 40_000, topRunChatId: '1' }),
        dayRow({ feature: 'fan-summary', topRunMicroUsd: 110_000, topRunChatId: '777' }),
      ],
      TODAY,
    );
    expect(ledger.topRun).toEqual({ feature: 'fan-summary', costUsd: 0.11, chatId: '777' });
  });

  it('reports null topRun when nothing cost anything', () => {
    expect(buildAiSpendLedger([dayRow({ feature: 'fast-reply' })], TODAY).topRun).toBeNull();
  });

  it('keeps only today in the table but sums the whole window into sevenDayUsd', () => {
    const ledger = buildAiSpendLedger(
      [
        dayRow({ feature: 'fast-reply', runs: 3, costMicroUsd: 860_000 }),
        dayRow({ feature: 'fast-reply', day: '2026-06-10', runs: 9, costMicroUsd: 4_050_000 }),
      ],
      TODAY,
    );
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.totals.costUsd).toBe(0.86);
    expect(ledger.sevenDayUsd).toBeCloseTo(4.91);
  });

  it('merges duplicate (day, feature) rows defensively', () => {
    const ledger = buildAiSpendLedger(
      [
        dayRow({ feature: 'ping', runs: 1, topRunMicroUsd: 10, topRunChatId: 'a' }),
        dayRow({ feature: 'ping', runs: 2, topRunMicroUsd: 20, topRunChatId: 'b' }),
      ],
      TODAY,
    );
    expect(ledger.rows[0]?.runs).toBe(3);
    expect(ledger.topRun?.chatId).toBe('b');
  });

  it('omits zero-run features from the table', () => {
    const ledger = buildAiSpendLedger([dayRow({ feature: 'ping', runs: 0, inserted: 1 })], TODAY);
    expect(ledger.rows).toHaveLength(0);
  });

  it('labels features for display, falling back to the raw id', () => {
    expect(aiFeatureLabel('fan-summary')).toBe('Scan (fan summary)');
    expect(aiFeatureLabel('weird')).toBe('weird');
  });
});
