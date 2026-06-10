// Credit meter (SPEC §5): parses _meta._credits + x-ofapi-credits-* +
// x-rate-limit-remaining-minute whenever present, publishes snapshots, and
// resets the daily counter on UTC day flip.

import { describe, expect, it } from 'vitest';
import { createCreditMeter } from '@main/ofapi/credit-meter';
import type { CreditMeterSnapshot, HeadersLike } from '@main/ofapi/credit-meter';

function headersOf(record: Record<string, string>): HeadersLike {
  return { get: (name) => record[name.toLowerCase()] ?? null };
}

const T0 = Date.parse('2026-06-10T12:00:00Z');

describe('createCreditMeter', () => {
  it('parses _meta._credits and _rate_limits from the body meta', () => {
    const meter = createCreditMeter({ now: () => T0 });
    meter.record({
      meta: {
        _credits: { used: 1, balance: 99193, note: 'Always' },
        _rate_limits: { limit_minute: 5000, remaining_minute: 4999, limit_day: null },
      },
    });
    expect(meter.snapshot()).toEqual({
      balance: 99193,
      usedToday: 1,
      rpmRemaining: 4999,
      utcDay: '2026-06-10',
    });
  });

  it('parses the x-ofapi-credits-* and x-rate-limit headers', () => {
    const meter = createCreditMeter({ now: () => T0 });
    meter.record({
      headers: headersOf({
        'x-ofapi-credits-used': '2',
        'x-ofapi-credits-balance': '500',
        'x-rate-limit-remaining-minute': '59',
      }),
    });
    expect(meter.snapshot()).toMatchObject({ balance: 500, usedToday: 2, rpmRemaining: 59 });
  });

  it('headers win over body meta when both are present', () => {
    const meter = createCreditMeter({ now: () => T0 });
    meter.record({
      headers: headersOf({ 'x-ofapi-credits-balance': '400' }),
      meta: { _credits: { used: 1, balance: 350 } },
    });
    expect(meter.snapshot()).toMatchObject({ balance: 400, usedToday: 1 });
  });

  it('accumulates usedToday across calls', () => {
    const meter = createCreditMeter({ now: () => T0 });
    meter.record({ meta: { _credits: { used: 1, balance: 10 } } });
    meter.record({ meta: { _credits: { used: 3, balance: 7 } } });
    expect(meter.snapshot()).toMatchObject({ usedToday: 4, balance: 7 });
  });

  it('resets usedToday on UTC day flip', () => {
    let nowMs = Date.parse('2026-06-10T23:59:30Z');
    const meter = createCreditMeter({ now: () => nowMs });
    meter.record({ meta: { _credits: { used: 5, balance: 100 } } });
    expect(meter.snapshot().usedToday).toBe(5);

    nowMs = Date.parse('2026-06-11T00:00:30Z');
    expect(meter.snapshot()).toMatchObject({ usedToday: 0, utcDay: '2026-06-11', balance: 100 });
    meter.record({ meta: { _credits: { used: 2, balance: 98 } } });
    expect(meter.snapshot()).toMatchObject({ usedToday: 2, utcDay: '2026-06-11' });
  });

  it('publishes snapshots via onMeta and subscribe; unsubscribe stops events', () => {
    const events: CreditMeterSnapshot[] = [];
    const meter = createCreditMeter({ now: () => T0, onMeta: (s) => events.push(s) });
    const extra: CreditMeterSnapshot[] = [];
    const unsubscribe = meter.subscribe((s) => extra.push(s));

    meter.record({ meta: { _credits: { used: 1, balance: 9 } } });
    expect(events).toHaveLength(1);
    expect(extra).toHaveLength(1);

    unsubscribe();
    meter.record({ meta: { _credits: { used: 1, balance: 8 } } });
    expect(events).toHaveLength(2);
    expect(extra).toHaveLength(1);
  });

  it('ignores responses with no telemetry at all (no event, no reset)', () => {
    const events: CreditMeterSnapshot[] = [];
    const meter = createCreditMeter({ now: () => T0, onMeta: (s) => events.push(s) });
    meter.record({ meta: { something: 'else' } });
    meter.record({ headers: headersOf({}) });
    meter.record({});
    expect(events).toHaveLength(0);
  });

  it('tolerates malformed meta shapes (zod-guarded)', () => {
    const meter = createCreditMeter({ now: () => T0 });
    meter.record({ meta: { _credits: 'garbage' } });
    meter.record({ meta: 42 });
    expect(meter.snapshot()).toMatchObject({ usedToday: 0, balance: null });
  });

  it('hydrate restores a same-day persisted counter and ignores stale days', () => {
    const meter = createCreditMeter({ now: () => T0 });
    meter.hydrate({ utcDay: '2026-06-10', usedToday: 123 });
    expect(meter.snapshot().usedToday).toBe(123);

    const meter2 = createCreditMeter({ now: () => T0 });
    meter2.hydrate({ utcDay: '2026-06-09', usedToday: 999 });
    expect(meter2.snapshot().usedToday).toBe(0);
  });
});
