export const platforms = ["fansly", "onlyfans"];
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
];
export const syncHealthStates = ["healthy", "degraded", "suspicious", "failed"];
export const httpRequestStates = ["started", "success", "retry", "failed"];
export const httpRequestFailureKinds = ["timeout", "transport", "http", "provider"];
export const syncTelemetryEventSeverities = ["info", "warn", "error"];
