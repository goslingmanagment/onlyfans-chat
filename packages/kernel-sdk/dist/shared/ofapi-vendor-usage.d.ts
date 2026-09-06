/** Persistence shapes of provider accounting evidence, separate from HTTP validation. */
export interface OfapiUsageWindow {
    from: string;
    to: string;
    groupBy: "day" | "account" | "endpoint";
    accountId: string | null;
    includeToday: boolean;
}
export interface OfapiUsageResult {
    from: string;
    to: string;
    groupBy: "day" | "account" | "endpoint";
    includesToday: boolean;
    totals: {
        credits: number;
        requests: number;
    };
    results: {
        day: string | null;
        accountId: string | null;
        endpoint: string | null;
        creditType: string | null;
        credits: number;
        requests: number;
    }[];
}
export interface OfapiKeyScopeApply {
    credentialFingerprint: string;
    expectedVersion: number;
    capabilities: ("reads" | "commands" | "webhooks" | "exports" | "uploads" | "links")[] | null;
    accountIds: string[] | null;
    visibility: "unknown" | "declared_team" | "declared_restricted";
}
