import { describe, expect, it } from 'vitest';
import {
  dayKey,
  formatAgeShort,
  formatClock,
  formatDayLabel,
  formatLastSeen,
  formatListTime,
  isOnline,
  sameDay,
} from '../../src/renderer/src/lib/time';

// local-time constructors keep tests TZ-independent
const NOW = new Date(2026, 5, 10, 19, 30); // Jun 10 2026, 19:30 local

describe('formatClock', () => {
  it('renders 24h zero-padded', () => {
    expect(formatClock(new Date(2026, 5, 10, 9, 4))).toBe('09:04');
    expect(formatClock(new Date(2026, 5, 10, 19, 4))).toBe('19:04');
    expect(formatClock(new Date(2026, 5, 10, 0, 0))).toBe('00:00');
  });
});

describe('sameDay / dayKey', () => {
  it('detects same calendar day', () => {
    expect(sameDay(new Date(2026, 5, 10, 0, 1), new Date(2026, 5, 10, 23, 59))).toBe(true);
    expect(sameDay(new Date(2026, 5, 10, 23, 59), new Date(2026, 5, 11, 0, 1))).toBe(false);
  });

  it('produces stable zero-padded keys', () => {
    expect(dayKey(new Date(2026, 5, 3))).toBe('2026-06-03');
    expect(dayKey(new Date(2026, 11, 25))).toBe('2026-12-25');
  });
});

describe('formatListTime', () => {
  it('shows clock for today', () => {
    expect(formatListTime(new Date(2026, 5, 10, 9, 4), NOW)).toBe('09:04');
  });

  it('shows weekday within the last week', () => {
    // Jun 8 2026 is a Monday
    expect(formatListTime(new Date(2026, 5, 8, 12, 0), NOW)).toBe('MON');
  });

  it('shows month + day within the year', () => {
    expect(formatListTime(new Date(2026, 0, 15), NOW)).toBe('JAN 15');
  });

  it("shows month + day + 'yy for older years", () => {
    expect(formatListTime(new Date(2025, 10, 2), NOW)).toBe("NOV 2 '25");
  });
});

describe('formatDayLabel', () => {
  it('labels today and yesterday', () => {
    expect(formatDayLabel(new Date(2026, 5, 10, 1, 0), NOW)).toBe('TODAY');
    expect(formatDayLabel(new Date(2026, 5, 9, 23, 0), NOW)).toBe('YESTERDAY');
  });

  it('labels older days with month + day', () => {
    expect(formatDayLabel(new Date(2026, 5, 3), NOW)).toBe('JUN 3');
    expect(formatDayLabel(new Date(2025, 5, 3), NOW)).toBe("JUN 3 '25");
  });
});

describe('formatAgeShort', () => {
  it('formats seconds, minutes, hours, days', () => {
    expect(formatAgeShort(12_000)).toBe('12s');
    expect(formatAgeShort(3 * 60_000)).toBe('3m');
    expect(formatAgeShort(2 * 3_600_000)).toBe('2h');
    expect(formatAgeShort(5 * 86_400_000)).toBe('5d');
  });

  it('clamps negative ages to 0s', () => {
    expect(formatAgeShort(-5_000)).toBe('0s');
  });
});

describe('formatLastSeen / isOnline', () => {
  it('reports online within 5 minutes', () => {
    const twoMinAgo = new Date(NOW.getTime() - 2 * 60_000).toISOString();
    expect(formatLastSeen(twoMinAgo, NOW)).toBe('online now');
    expect(isOnline(twoMinAgo, NOW)).toBe(true);
  });

  it('reports age beyond 5 minutes', () => {
    const twoHoursAgo = new Date(NOW.getTime() - 2 * 3_600_000).toISOString();
    expect(formatLastSeen(twoHoursAgo, NOW)).toBe('last seen 2h ago');
    expect(isOnline(twoHoursAgo, NOW)).toBe(false);
  });

  it('handles null honestly', () => {
    expect(formatLastSeen(null, NOW)).toBe('last seen unknown');
    expect(isOnline(null, NOW)).toBe(false);
  });
});
