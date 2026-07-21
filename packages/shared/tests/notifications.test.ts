import { describe, expect, it } from 'vitest';
import { isAlertEligible } from '../src/notifications/index';

describe('isAlertEligible', () => {
  it('treats only an explicit false flag as suppressed', () => {
    expect(isAlertEligible({})).toBe(true);
    expect(isAlertEligible({ live: true })).toBe(true);
    expect(isAlertEligible({ live: false })).toBe(false);
  });
});
