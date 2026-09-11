import { describe, expect, it } from 'vitest';
import { makeTranslator } from '@chatgoose/shared/i18n/index';
import type { SpendersRefreshRunVM } from '../../src/preload/contract';
import { historyStatusText } from '../../src/renderer/src/features/spenders/refreshStatus';

const t = makeTranslator('ru');
const now = Date.parse('2026-09-11T12:00:00Z');
const run: SpendersRefreshRunVM = { state: 'done', completedAt: new Date(now).toISOString(), done: 3, total: 3, fetched: 0, ttlSkipped: 3, policySkipped: 0, failed: 0 };

describe('source freshness wording', () => {
  it('uses the source stamp after a TTL-only run, not the time the user clicked', () => {
    const source = '2026-09-10T10:00:00Z';
    expect(historyStatusText(source, run, now, t)).toBe(historyStatusText(source, null, now, t));
    expect(historyStatusText(source, run, now, t)).not.toBe(historyStatusText(run.completedAt, run, now, t));
  });
  it('does not invent freshness when no trustworthy source date exists', () => {
    expect(historyStatusText(null, run, now, t)).toBe('История ещё не проверена');
    expect(historyStatusText('bad', null, now, t)).toBe('История ещё не проверена');
  });
  it('explains policy skips and partial work without a full-refresh claim', () => {
    expect(historyStatusText(null, { ...run, state: 'partial', scopeChanged: true }, now, t)).toBe('Списки изменились · проверка неполная');
    expect(historyStatusText(null, { ...run, state: 'skipped', ttlSkipped: 0, policySkipped: 3 }, now, t)).toContain('авточтение выключено');
    expect(historyStatusText(null, { ...run, state: 'partial', fetched: 1, ttlSkipped: 1, failed: 1 }, now, t)).toBe('История проверена: 2 из 3');
    expect(historyStatusText(null, { ...run, state: 'stopped', done: 1, ttlSkipped: 1 }, now, t)).toBe('Остановлено · проверено 1 из 3');
  });
});
