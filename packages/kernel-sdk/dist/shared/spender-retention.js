export const SPENDER_RETENTION_STATUSES = [
    "all",
    "active",
    "cooling",
    "inactive",
    "needs_reactivation",
];
// A supporter is "active" if they transacted within this many days.
export const SPENDER_RETENTION_ACTIVE_DAYS = 14;
// A supporter is "cooling" if their last transaction is older than active but within this many days.
export const SPENDER_RETENTION_INACTIVE_DAYS = 45;
// Lifetime creator-net spend (in mills) at which an inactive supporter is flagged as needing reactivation.
// $100 — matches the existing VIP tier threshold used by the row badge.
export const SPENDER_RETENTION_NEEDS_REACTIVATION_LIFETIME_NET_MILLS = 100_000;
export function isSpenderRetentionStatus(value) {
    return SPENDER_RETENTION_STATUSES.includes(value);
}
export function classifyRetention(input) {
    const last = input.lifetimeLastTransactionAt
        ? new Date(input.lifetimeLastTransactionAt).getTime()
        : null;
    const ageMs = last === null ? Number.POSITIVE_INFINITY : input.now.getTime() - last;
    const activeMs = SPENDER_RETENTION_ACTIVE_DAYS * 24 * 60 * 60 * 1000;
    const inactiveMs = SPENDER_RETENTION_INACTIVE_DAYS * 24 * 60 * 60 * 1000;
    if (ageMs <= activeMs)
        return "active";
    if (ageMs <= inactiveMs)
        return "cooling";
    if (input.lifetimeCreatorNetAmountMills >= SPENDER_RETENTION_NEEDS_REACTIVATION_LIFETIME_NET_MILLS) {
        return "needs_reactivation";
    }
    return "inactive";
}
