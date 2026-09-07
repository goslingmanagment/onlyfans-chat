export const platforms = ["fansly", "onlyfans"];
/**
 * The values `exportPolicy` may take on the wire (spec 11 staging).
 *
 * Declared ONCE here because three sites need it and they must not drift: the
 * contract enum (`routes.ts`), the config descriptor's `enumValues`, and the env
 * parser. The staging is: widen the wire type first (a code deploy the fleet
 * re-vendors), flip the served VALUE second (a config flip). A single list is
 * what makes "widened but not yet flipped" a checkable state rather than a hope.
 */
export const agentExportPolicyValues = [
    "no_raw_transcript_export_endpoint_yet",
    "agent_read_plane_v1",
];
export const transactionTypes = [
    "subscription",
    "tip",
    "message_purchase",
    "post_purchase",
    "stream_tip",
    "chargeback",
    "refund",
    "payout_reversal",
    "other",
];
export const transactionReportingBuckets = [
    "revenue",
    "adjustment",
    "unclassified",
    "excluded",
];
export const transactionClassificationByType = {
    subscription: {
        bucket: "revenue",
        affectsSpenderAnalytics: true,
    },
    tip: {
        bucket: "revenue",
        affectsSpenderAnalytics: true,
    },
    message_purchase: {
        bucket: "revenue",
        affectsSpenderAnalytics: true,
    },
    post_purchase: {
        bucket: "revenue",
        affectsSpenderAnalytics: true,
    },
    stream_tip: {
        bucket: "revenue",
        affectsSpenderAnalytics: true,
    },
    chargeback: {
        bucket: "adjustment",
        affectsSpenderAnalytics: true,
    },
    refund: {
        bucket: "adjustment",
        affectsSpenderAnalytics: true,
    },
    other: {
        bucket: "unclassified",
        affectsSpenderAnalytics: true,
    },
    payout_reversal: {
        bucket: "excluded",
        affectsSpenderAnalytics: false,
    },
};
function filterTransactionTypes(predicate) {
    return transactionTypes.filter(predicate);
}
export function getTransactionClassification(transactionType) {
    return transactionClassificationByType[transactionType];
}
export const reportableTransactionTypes = filterTransactionTypes((transactionType) => getTransactionClassification(transactionType).bucket !== "excluded");
export const spenderAnalyticsTransactionTypes = filterTransactionTypes((transactionType) => getTransactionClassification(transactionType).affectsSpenderAnalytics);
export const transactionTypesByReportingBucket = Object.fromEntries(transactionReportingBuckets.map((bucket) => [
    bucket,
    filterTransactionTypes((transactionType) => getTransactionClassification(transactionType).bucket === bucket),
]));
export const transactionStates = ["pending", "posted", "unknown"];
export const ofapiCaptureJobStates = [
    "ready",
    "leased",
    "awaiting_parse",
    "retry_wait",
    "blocked",
    "complete",
    "cancelled",
];
export const userRoles = ["owner", "team_lead", "chatter", "content_manager"];
export const creatableUserRoles = ["owner", "team_lead", "chatter"];
export const fanFlagTypes = ["whale", "vip", "risky"];
export const aiUsageFeatures = [
    "fast-reply",
    "improve-draft",
    "help-me",
    "fan-summary",
    "chat-review",
    "scan",
    "ping",
    "hi-greeting",
    // Stage 29: internal gateway lane for the workboard closing classifier.
    "workboard-closing",
    "coach-chat",
    // Voice notes: the ElevenLabs TTS lane's script-generation feature.
    "voice-script",
];
export const FANSLY_CLIENT_CHECK_ROUTES = [
    "message",
    "group",
    "account",
    "earnings",
    "messagingGroups",
    "subscribers",
    "media",
];
export const syncHealthStates = ["healthy", "degraded", "suspicious", "failed"];
export const httpRequestStates = ["started", "success", "retry", "failed"];
export const httpRequestFailureKinds = ["timeout", "transport", "http", "provider", "policy"];
export const syncTelemetryEventSeverities = ["info", "warn", "error"];
