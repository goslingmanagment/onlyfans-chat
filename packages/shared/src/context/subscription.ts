// FAN SUBSCRIPTION DATA context block. Text shapes are legacy-locked (research
// doc §2.14, SPEC §8.2/§15.6) where OFAPI data allows. Inputs are the fan/user
// object's subscription fields (`subscribedOn*` + `subscribedOnData`); amounts
// are dollars. Dates render in UTC (SPEC §8.2 timezone decision).

import { formatUsd } from './spending';

const MS_PER_DAY = 86_400_000;

export interface SubscribeHistoryEntry {
  isCurrent?: boolean | null;
  /** Non-null when the fan turned auto-renew off; sub stays active until `expireDate`. */
  cancelDate?: string | null;
  expireDate?: string | null;
  startDate?: string | null;
}

export interface SubscribedOnData {
  subscribeAt?: string | null;
  expiredAt?: string | null;
  /** Next scheduled renewal date (future for active renewing subs in live data). */
  renewedAt?: string | null;
  /** Human total like "20 days" / "7 months" — counts only subscribed periods. */
  duration?: string | null;
  subscribePrice?: number | null;
  regularPrice?: number | null;
  /** Price the fan currently pays (discounted when a promo is active). */
  price?: number | null;
  /** Upcoming price after a price change, when set. */
  newPrice?: number | null;
  discountPercent?: number | null;
  /** Discount period in months. */
  discountPeriod?: number | null;
  unsubscribeReason?: string | null;
  hasActivePaidSubscriptions?: boolean | null;
  subscribes?: SubscribeHistoryEntry[] | null;
}

export interface FanSubscriptionInput {
  subscribedOn?: boolean | null;
  subscribedOnExpiredNow?: boolean | null;
  subscribedOnData?: SubscribedOnData | null;
}

/**
 * OnlyFans fan objects expose no boolean auto-renew flag: `subscribedByAutoprolong`
 * describes the account's own subscription TO the fan (null in all probes), and the
 * `autoRenew: 0|1` field in the vendored docs belongs to the Fansly API. The renew
 * state is driven by the current `subscribedOnData.subscribes[]` entry's `cancelDate`:
 * null ⇒ renewal scheduled; set ⇒ fan cancelled (churn risk). Returns null (unknown)
 * when there is no current history entry.
 */
export function resolveAutoRenew(data: SubscribedOnData): boolean | null {
  const current = (data.subscribes ?? []).find((entry) => entry.isCurrent === true);
  if (!current) {
    return null;
  }
  return current.cancelDate == null;
}

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) {
    return null;
  }
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function formatShortDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function daysBetween(from: number, to: number): number {
  return Math.floor(Math.abs(to - from) / MS_PER_DAY);
}

function pickPromoPrice(data: SubscribedOnData): number | null {
  if (data.price != null && data.price > 0) {
    return data.price;
  }
  if (data.newPrice != null && data.newPrice > 0) {
    return data.newPrice;
  }
  return null;
}

/**
 * Format the fan subscription context block for AI prompt inclusion.
 * Does NOT escape — escaping happens in the prompt builder (legacy contract).
 */
export function formatFanSubscriptionData(
  input: FanSubscriptionInput | null | undefined,
  now: number = Date.now(),
): string {
  if (!input) {
    return '';
  }

  const lines: string[] = ['FAN SUBSCRIPTION DATA:'];
  const data = input.subscribedOnData ?? null;

  if (!data) {
    if (input.subscribedOn === true) {
      lines.push(input.subscribedOnExpiredNow === true ? 'Status: Expired' : 'Status: Active');
    } else {
      lines.push('Status: Not subscribed');
    }
    return lines.join('\n');
  }

  const subscribeAtMs = parseMs(data.subscribeAt);
  const expiredAtMs = parseMs(data.expiredAt);
  // `subscribedOnExpiredNow === false` with a past expiredAt is the data-lag case:
  // stay on the active path so the "period lapsed" guard reports it (legacy fact).
  const expired =
    input.subscribedOnExpiredNow === true ||
    input.subscribedOn === false ||
    (input.subscribedOnExpiredNow == null && expiredAtMs !== null && expiredAtMs < now);

  const basePrice = data.subscribePrice ?? data.regularPrice ?? null;
  if (basePrice !== null) {
    lines.push(basePrice > 0 ? `Price: ${formatUsd(basePrice)}/month` : 'Price: Free');
  }

  const discountPercent = data.discountPercent ?? 0;
  const promoActive = !expired && discountPercent > 0;
  const promoPrice = pickPromoPrice(data);

  if (!expired) {
    let status = 'Active';
    if (promoActive && promoPrice !== null) {
      status += ` (promotional price: ${formatUsd(promoPrice)})`;
    }
    lines.push(`Status: ${status}`);
  } else if (expiredAtMs !== null) {
    lines.push(`Status: Expired (ended ${formatShortDate(expiredAtMs)} — ${daysBetween(expiredAtMs, now)} days ago)`);
    if (subscribeAtMs !== null) {
      lines.push(`Was subscribed for: ${daysBetween(subscribeAtMs, expiredAtMs)} days`);
    } else if (data.duration) {
      lines.push(`Was subscribed for: ${data.duration}`);
    }
  } else {
    lines.push('Status: Expired');
    if (data.duration) {
      lines.push(`Was subscribed for: ${data.duration}`);
    }
  }

  if (subscribeAtMs !== null) {
    lines.push(`Subscribed since: ${formatShortDate(subscribeAtMs)} (${daysBetween(subscribeAtMs, now)} days ago)`);
  }

  if (!expired && data.duration) {
    lines.push(`Subscribed for: ${data.duration}`);
  }

  if (!expired && expiredAtMs !== null) {
    if (expiredAtMs >= now) {
      const daysUntilEnd = Math.floor((expiredAtMs - now) / MS_PER_DAY);
      lines.push(`Current period ends: ${formatShortDate(expiredAtMs)} (in ${daysUntilEnd} days)`);
    } else {
      const daysSinceEnd = Math.floor((now - expiredAtMs) / MS_PER_DAY);
      lines.push(`Current period ends: ${formatShortDate(expiredAtMs)} (ended ${daysSinceEnd} days ago — period lapsed)`);
    }
  }

  if (!expired) {
    const autoRenew = resolveAutoRenew(data);
    if (autoRenew === true) {
      const renewPrice = data.newPrice != null && data.newPrice > 0 ? data.newPrice : basePrice;
      lines.push(
        renewPrice !== null && renewPrice > 0
          ? `Auto-renew: On (renews at ${formatUsd(renewPrice)}/month)`
          : 'Auto-renew: On',
      );
      const renewedAtMs = parseMs(data.renewedAt);
      if (renewedAtMs !== null && renewedAtMs >= now) {
        lines.push(`Next renewal: ${formatShortDate(renewedAtMs)}`);
      }
    } else if (autoRenew === false) {
      lines.push('Auto-renew: Off — will NOT renew (churn risk)');
    }
  }

  if (promoActive) {
    lines.push('Promo active: Yes');
    if (promoPrice !== null) {
      lines.push(`Promo price: ${formatUsd(promoPrice)}`);
    }
    lines.push(`Promo discount: ${discountPercent}%`);
    if (data.discountPeriod != null && data.discountPeriod > 0) {
      lines.push(`Promo duration: ${data.discountPeriod} month${data.discountPeriod === 1 ? '' : 's'}`);
    }
  }

  if (expired && data.unsubscribeReason) {
    lines.push(`Unsubscribe reason: ${data.unsubscribeReason}`);
  }

  if (data.hasActivePaidSubscriptions != null) {
    lines.push(`Has active paid subscriptions: ${data.hasActivePaidSubscriptions ? 'Yes' : 'No'}`);
  }

  return lines.join('\n');
}
