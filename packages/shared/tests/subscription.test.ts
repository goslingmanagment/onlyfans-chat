// Legacy subscriptions.test.ts cases re-expressed against OFAPI subscribedOnData
// (Fansly tier/plan/gift/billing-cycle cases dropped — see module deviations).

import { describe, expect, it } from 'vitest';
import {
  formatFanSubscriptionData,
  resolveAutoRenew,
  type FanSubscriptionInput,
  type SubscribedOnData,
} from '../src/context/subscription';

const NOW = new Date('2025-03-02T00:00:00Z').getTime();
const DAY_MS = 86_400_000;

function iso(daysFromNow: number): string {
  return new Date(NOW + daysFromNow * DAY_MS).toISOString();
}

function makeData(overrides: Partial<SubscribedOnData> = {}): SubscribedOnData {
  return {
    subscribeAt: iso(-47),
    expiredAt: iso(15),
    renewedAt: iso(15),
    duration: '1 month',
    subscribePrice: 10,
    regularPrice: 10,
    price: 0,
    newPrice: 0,
    discountPercent: 0,
    discountPeriod: 1,
    unsubscribeReason: 'No reason given',
    hasActivePaidSubscriptions: true,
    subscribes: [
      {
        isCurrent: true,
        cancelDate: null,
        startDate: iso(-47),
        expireDate: iso(15),
      },
    ],
    ...overrides,
  };
}

function makeInput(
  dataOverrides: Partial<SubscribedOnData> = {},
  inputOverrides: Partial<FanSubscriptionInput> = {},
): FanSubscriptionInput {
  return {
    subscribedOn: true,
    subscribedOnExpiredNow: false,
    subscribedOnData: makeData(dataOverrides),
    ...inputOverrides,
  };
}

describe('formatFanSubscriptionData', () => {
  it('returns empty string when input is null', () => {
    expect(formatFanSubscriptionData(null, NOW)).toBe('');
  });

  it('shows price, status, dates, and auto-renew for an active subscriber', () => {
    const result = formatFanSubscriptionData(makeInput(), NOW);
    expect(result).toContain('FAN SUBSCRIPTION DATA:');
    expect(result).toContain('Price: $10.00/month');
    expect(result).toContain('Status: Active');
    expect(result).toContain('47 days ago');
    expect(result).toContain('in 15 days');
    expect(result).toContain('Auto-renew: On (renews at $10.00/month)');
  });

  it('reports a lapsed period instead of a phantom future end date', () => {
    const result = formatFanSubscriptionData(
      makeInput({ expiredAt: iso(-4), renewedAt: iso(-4) }),
      NOW,
    );
    expect(result).toContain('ended 4 days ago — period lapsed');
    expect(result).not.toContain('in 4 days');
  });

  // --- Churn risk ---

  it('shows churn risk when the current subscribe entry is cancelled', () => {
    const result = formatFanSubscriptionData(
      makeInput({
        subscribes: [{ isCurrent: true, cancelDate: iso(-2), startDate: iso(-47), expireDate: iso(15) }],
      }),
      NOW,
    );
    expect(result).toContain('Auto-renew: Off');
    expect(result).toContain('will NOT renew (churn risk)');
    expect(result).not.toContain('Next renewal:');
  });

  it('omits the auto-renew line when renew state is unknown', () => {
    const result = formatFanSubscriptionData(makeInput({ subscribes: [] }), NOW);
    expect(result).not.toContain('Auto-renew:');
  });

  // --- Promotional price (legacy promo cases via OFAPI discount fields) ---

  it('shows promotional price in the status line when a discount is active', () => {
    const result = formatFanSubscriptionData(
      makeInput({ discountPercent: 22, price: 7.77 }),
      NOW,
    );
    expect(result).toContain('Status: Active (promotional price: $7.77)');
    expect(result).toContain('Promo active: Yes');
    expect(result).toContain('Promo price: $7.77');
    expect(result).toContain('Promo discount: 22%');
    expect(result).toContain('Promo duration: 1 month');
  });

  it('shows discount percent without a promo price when no discounted price is known', () => {
    const result = formatFanSubscriptionData(
      makeInput({ discountPercent: 15, price: 0, newPrice: 0 }),
      NOW,
    );
    expect(result).toContain('Status: Active');
    expect(result).not.toContain('promotional price');
    expect(result).toContain('Promo discount: 15%');
    expect(result).not.toContain('Promo price:');
  });

  // --- Expired subscription ---

  it('shows expired status with end date and computed duration', () => {
    const result = formatFanSubscriptionData(
      makeInput(
        { expiredAt: iso(-15), subscribeAt: iso(-46) },
        { subscribedOnExpiredNow: true },
      ),
      NOW,
    );
    expect(result).toContain('Expired');
    expect(result).toContain('15 days ago');
    expect(result).toContain('Was subscribed for: 31 days');
  });

  it('does not show auto-renew for expired subscriptions', () => {
    const result = formatFanSubscriptionData(
      makeInput({ expiredAt: iso(-10) }, { subscribedOnExpiredNow: true }),
      NOW,
    );
    expect(result).not.toContain('Auto-renew:');
  });

  it('does not show "Current period ends" for expired subscriptions', () => {
    const result = formatFanSubscriptionData(
      makeInput({ expiredAt: iso(-10) }, { subscribedOnExpiredNow: true }),
      NOW,
    );
    expect(result).not.toContain('Current period ends:');
  });

  it('treats a past expiredAt as expired when the expired flag is absent', () => {
    const result = formatFanSubscriptionData(
      { subscribedOnData: makeData({ expiredAt: iso(-10) }) },
      NOW,
    );
    expect(result).toContain('Status: Expired (ended');
    expect(result).not.toContain('period lapsed');
  });

  it('shows the unsubscribe reason only for expired subscriptions', () => {
    const expired = formatFanSubscriptionData(
      makeInput({ expiredAt: iso(-10), unsubscribeReason: 'Too expensive' }, { subscribedOnExpiredNow: true }),
      NOW,
    );
    expect(expired).toContain('Unsubscribe reason: Too expensive');
    const active = formatFanSubscriptionData(makeInput({ unsubscribeReason: 'Too expensive' }), NOW);
    expect(active).not.toContain('Unsubscribe reason:');
  });

  // --- Not subscribed ---

  it('shows "Not subscribed" when the fan has no subscription data', () => {
    const result = formatFanSubscriptionData({ subscribedOn: false }, NOW);
    expect(result).toBe('FAN SUBSCRIPTION DATA:\nStatus: Not subscribed');
  });

  it('shows a minimal active block when only flags are known', () => {
    const result = formatFanSubscriptionData({ subscribedOn: true }, NOW);
    expect(result).toBe('FAN SUBSCRIPTION DATA:\nStatus: Active');
  });

  // --- Price formatting (legacy mills cases adapted to dollars) ---

  it('formats a $5 subscription as $5.00/month', () => {
    const result = formatFanSubscriptionData(
      makeInput({ subscribePrice: 5, regularPrice: 5 }),
      NOW,
    );
    expect(result).toContain('Price: $5.00/month');
    expect(result).toContain('$5.00/month');
  });

  it('renders free pages as "Price: Free" with a bare auto-renew line', () => {
    const result = formatFanSubscriptionData(
      makeInput({ subscribePrice: 0, regularPrice: 0 }),
      NOW,
    );
    expect(result).toContain('Price: Free');
    expect(result).toContain('Auto-renew: On');
    expect(result).not.toContain('renews at');
  });

  // --- New OFAPI fields ---

  it('renders hasActivePaidSubscriptions as Yes/No and omits it when unknown', () => {
    expect(formatFanSubscriptionData(makeInput({ hasActivePaidSubscriptions: true }), NOW)).toContain(
      'Has active paid subscriptions: Yes',
    );
    expect(formatFanSubscriptionData(makeInput({ hasActivePaidSubscriptions: false }), NOW)).toContain(
      'Has active paid subscriptions: No',
    );
    expect(formatFanSubscriptionData(makeInput({ hasActivePaidSubscriptions: null }), NOW)).not.toContain(
      'Has active paid subscriptions:',
    );
  });

  it('prefers newPrice for the renew price when an upcoming price change is set', () => {
    const result = formatFanSubscriptionData(makeInput({ newPrice: 12.5 }), NOW);
    expect(result).toContain('Auto-renew: On (renews at $12.50/month)');
  });

  it('renders the full active block in order', () => {
    const result = formatFanSubscriptionData(makeInput(), NOW);
    expect(result).toBe(
      [
        'FAN SUBSCRIPTION DATA:',
        'Price: $10.00/month',
        'Status: Active',
        'Subscribed since: Jan 14, 2025 (47 days ago)',
        'Subscribed for: 1 month',
        'Current period ends: Mar 17, 2025 (in 15 days)',
        'Auto-renew: On (renews at $10.00/month)',
        'Next renewal: Mar 17, 2025',
        'Has active paid subscriptions: Yes',
      ].join('\n'),
    );
  });

  it('handles a probe-shaped free-page fan (cancelDate null, far-future expiry)', () => {
    const result = formatFanSubscriptionData(
      {
        subscribedOn: true,
        subscribedOnExpiredNow: false,
        subscribedOnData: {
          price: 0,
          newPrice: 0,
          regularPrice: 0,
          subscribePrice: 0,
          discountPercent: 0,
          discountPeriod: 1,
          subscribeAt: '2026-05-20T20:14:58+00:00',
          expiredAt: '2036-05-20T20:14:58+00:00',
          renewedAt: '2036-05-20T00:00:00+00:00',
          unsubscribeReason: 'No reason given',
          duration: '20 days',
          hasActivePaidSubscriptions: false,
          subscribes: [
            {
              isCurrent: true,
              cancelDate: null,
              startDate: '2026-05-20T20:14:58+00:00',
              expireDate: '2036-05-20T20:14:58+00:00',
            },
          ],
        },
      },
      new Date('2026-06-09T20:14:58Z').getTime(),
    );
    expect(result).toContain('Price: Free');
    expect(result).toContain('Status: Active');
    expect(result).toContain('Subscribed since: May 20, 2026 (20 days ago)');
    expect(result).toContain('Subscribed for: 20 days');
    expect(result).toContain('Auto-renew: On');
    expect(result).toContain('Has active paid subscriptions: No');
    expect(result).not.toContain('Unsubscribe reason:');
  });
});

describe('resolveAutoRenew', () => {
  it('is on when the current entry has no cancelDate', () => {
    expect(resolveAutoRenew(makeData())).toBe(true);
  });

  it('is off when the current entry has a cancelDate', () => {
    expect(
      resolveAutoRenew(makeData({ subscribes: [{ isCurrent: true, cancelDate: iso(-1) }] })),
    ).toBe(false);
  });

  it('is unknown when there is no current entry', () => {
    expect(resolveAutoRenew(makeData({ subscribes: [] }))).toBe(null);
    expect(resolveAutoRenew(makeData({ subscribes: null }))).toBe(null);
    expect(
      resolveAutoRenew(makeData({ subscribes: [{ isCurrent: false, cancelDate: null }] })),
    ).toBe(null);
  });
});
