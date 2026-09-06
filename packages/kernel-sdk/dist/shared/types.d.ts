export declare const platforms: readonly ["fansly", "onlyfans"];
/**
 * The values `exportPolicy` may take on the wire (spec 11 staging).
 *
 * Declared ONCE here because three sites need it and they must not drift: the
 * contract enum (`routes.ts`), the config descriptor's `enumValues`, and the env
 * parser. The staging is: widen the wire type first (a code deploy the fleet
 * re-vendors), flip the served VALUE second (a config flip). A single list is
 * what makes "widened but not yet flipped" a checkable state rather than a hope.
 */
export declare const agentExportPolicyValues: readonly ["no_raw_transcript_export_endpoint_yet", "agent_read_plane_v1"];
export type AgentExportPolicyValue = (typeof agentExportPolicyValues)[number];
export type Platform = (typeof platforms)[number];
export declare const transactionTypes: readonly ["subscription", "tip", "message_purchase", "post_purchase", "stream_tip", "chargeback", "refund", "payout_reversal", "other"];
export type TransactionType = (typeof transactionTypes)[number];
export declare const transactionReportingBuckets: readonly ["revenue", "adjustment", "unclassified", "excluded"];
export type TransactionReportingBucket = (typeof transactionReportingBuckets)[number];
export interface TransactionClassificationMetadata {
    bucket: TransactionReportingBucket;
    affectsSpenderAnalytics: boolean;
}
export declare const transactionClassificationByType: {
    readonly subscription: {
        readonly bucket: "revenue";
        readonly affectsSpenderAnalytics: true;
    };
    readonly tip: {
        readonly bucket: "revenue";
        readonly affectsSpenderAnalytics: true;
    };
    readonly message_purchase: {
        readonly bucket: "revenue";
        readonly affectsSpenderAnalytics: true;
    };
    readonly post_purchase: {
        readonly bucket: "revenue";
        readonly affectsSpenderAnalytics: true;
    };
    readonly stream_tip: {
        readonly bucket: "revenue";
        readonly affectsSpenderAnalytics: true;
    };
    readonly chargeback: {
        readonly bucket: "adjustment";
        readonly affectsSpenderAnalytics: true;
    };
    readonly refund: {
        readonly bucket: "adjustment";
        readonly affectsSpenderAnalytics: true;
    };
    readonly other: {
        readonly bucket: "unclassified";
        readonly affectsSpenderAnalytics: true;
    };
    readonly payout_reversal: {
        readonly bucket: "excluded";
        readonly affectsSpenderAnalytics: false;
    };
};
export declare function getTransactionClassification(transactionType: TransactionType): TransactionClassificationMetadata;
export declare const reportableTransactionTypes: ("subscription" | "tip" | "message_purchase" | "post_purchase" | "stream_tip" | "chargeback" | "refund" | "payout_reversal" | "other")[];
export declare const spenderAnalyticsTransactionTypes: ("subscription" | "tip" | "message_purchase" | "post_purchase" | "stream_tip" | "chargeback" | "refund" | "payout_reversal" | "other")[];
export declare const transactionTypesByReportingBucket: Record<TransactionReportingBucket, TransactionType[]>;
export declare const transactionStates: readonly ["pending", "posted", "unknown"];
export type TransactionState = (typeof transactionStates)[number];
export declare const ofapiCaptureJobStates: readonly ["ready", "leased", "awaiting_parse", "retry_wait", "blocked", "complete", "cancelled"];
export type OfapiCaptureJobState = (typeof ofapiCaptureJobStates)[number];
export declare const userRoles: readonly ["owner", "team_lead", "chatter", "content_manager"];
export type UserRole = (typeof userRoles)[number];
export declare const creatableUserRoles: readonly ["owner", "team_lead", "chatter"];
export type CreatableUserRole = (typeof creatableUserRoles)[number];
export declare const fanFlagTypes: readonly ["whale", "vip", "risky"];
export type FanFlagType = (typeof fanFlagTypes)[number];
export declare const aiUsageFeatures: readonly ["fast-reply", "improve-draft", "help-me", "fan-summary", "chat-review", "scan", "ping", "hi-greeting", "workboard-closing", "coach-chat", "voice-script"];
export type AiUsageFeature = (typeof aiUsageFeatures)[number];
export declare const FANSLY_CLIENT_CHECK_ROUTES: readonly ["message", "group", "account", "earnings", "messagingGroups", "subscribers", "media"];
export type FanslyClientCheckRoute = (typeof FANSLY_CLIENT_CHECK_ROUTES)[number];
export interface FanslySessionBundle {
    authorization: string;
    fanslyClientId?: string;
    /** Legacy pasted value. Retained for credential compatibility, never reused
     * across routes by the adapter. */
    fanslyClientCheck?: string;
    fanslySessionId?: string;
    routeChecks?: Partial<Record<FanslyClientCheckRoute, string>>;
}
export interface OnlyMonsterTokenBundle {
    token: string;
}
export type StoredPlatformCredentialBundle = {
    platform: "fansly";
    session: FanslySessionBundle;
} | {
    platform: "onlyfans";
    auth: OnlyMonsterTokenBundle;
};
export interface ProxyConfig {
    url: string;
    username?: string | null;
    password?: string | null;
}
export declare const syncHealthStates: readonly ["healthy", "degraded", "suspicious", "failed"];
export type SyncHealth = (typeof syncHealthStates)[number];
export declare const httpRequestStates: readonly ["started", "success", "retry", "failed"];
export type HttpRequestState = (typeof httpRequestStates)[number];
export declare const httpRequestFailureKinds: readonly ["timeout", "transport", "http", "provider"];
export type HttpRequestFailureKind = (typeof httpRequestFailureKinds)[number];
export declare const syncTelemetryEventSeverities: readonly ["info", "warn", "error"];
export type SyncTelemetryEventSeverity = (typeof syncTelemetryEventSeverities)[number];
export interface HttpRequestPagination {
    offset?: number | null;
    limit?: number | null;
    pageIndex?: number | null;
    cursorPresent?: boolean | null;
}
export interface HttpRequestEventBase {
    requestId: string;
    operation: string;
    endpointTemplate: string;
    method: string;
    attemptNumber: number;
    timestamp: Date;
    pagination?: HttpRequestPagination | null;
    requestMetadata?: Record<string, unknown>;
    rateLimitWaitMs?: number | null;
}
export interface HttpRequestStartedEvent extends HttpRequestEventBase {
    state: "started";
}
export interface HttpRequestSuccessEvent extends HttpRequestEventBase {
    state: "success";
    httpStatus: number;
    durationMs: number;
    responseMetadata?: Record<string, unknown>;
}
export interface HttpRequestRetryEvent extends HttpRequestEventBase {
    state: "retry";
    httpStatus?: number | null;
    failureKind?: HttpRequestFailureKind | null;
    retryDelayMs: number;
    durationMs: number;
    responseMetadata?: Record<string, unknown>;
    errorMessage?: string | null;
}
export interface HttpRequestFailedEvent extends HttpRequestEventBase {
    state: "failed";
    httpStatus?: number | null;
    failureKind?: HttpRequestFailureKind | null;
    durationMs: number;
    responseMetadata?: Record<string, unknown>;
    errorMessage?: string | null;
}
export type HttpRequestEvent = HttpRequestStartedEvent | HttpRequestSuccessEvent | HttpRequestRetryEvent | HttpRequestFailedEvent;
export interface HttpRequestObserver {
    onRequestEvent(event: HttpRequestEvent): Promise<void>;
}
