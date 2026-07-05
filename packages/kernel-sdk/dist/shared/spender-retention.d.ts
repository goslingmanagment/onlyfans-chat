export declare const SPENDER_RETENTION_STATUSES: readonly ["all", "active", "cooling", "inactive", "needs_reactivation"];
export type SpenderRetentionStatus = (typeof SPENDER_RETENTION_STATUSES)[number];
export declare const SPENDER_RETENTION_ACTIVE_DAYS = 14;
export declare const SPENDER_RETENTION_INACTIVE_DAYS = 45;
export declare const SPENDER_RETENTION_NEEDS_REACTIVATION_LIFETIME_NET_MILLS = 100000;
export declare function isSpenderRetentionStatus(value: string): value is SpenderRetentionStatus;
export declare function classifyRetention(input: {
    lifetimeLastTransactionAt: Date | string | null;
    lifetimeCreatorNetAmountMills: number;
    now: Date;
}): Exclude<SpenderRetentionStatus, "all">;
