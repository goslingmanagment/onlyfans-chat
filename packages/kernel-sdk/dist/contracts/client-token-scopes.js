import { routeSchemas } from "./routes";
/**
 * Narrow device-token profiles (chat-extension hub-pr-plan H-3, §4.10.4).
 *
 * A client may ask, at password sign-in, for a device token bound to a
 * profile. The token stores the profile's NAME (`device_tokens.client_profile`,
 * immutable), never a list of operations: a route the profile gains later
 * reaches tokens already issued, with no re-issue.
 *
 * The API server refuses every route outside `operations` with a reason-less
 * 403, in both `AUTH_POLICY_ENFORCEMENT` modes; routes that take no principal
 * (`public`, `hmac`, `pending-device-token`) are not subject to it. The capture
 * lane accepts only `ingestKinds` from such a token, under the profile's own
 * producer.
 *
 * Never on a list: `/ofapi/*`, the event streams, the full persona texts and
 * their writes, the raw AI gateway, the Fansly outreach route, the top-spenders
 * read, and any cookie-session route.
 *
 * The boundary is honest about what it is: it keeps a leaked or misbehaving
 * extension inside its own surface. The person behind it can still sign in
 * with the same password and take a full token.
 */
export const CLIENT_TOKEN_PROFILES = {
    "chat-extension": {
        operations: [
            "authRevokeCurrentDeviceToken",
            "me",
            "clientBootstrap",
            "aiPersonaCatalog",
            "aiFeatureStream",
            "aiRecapStatus",
            "pageConversationProfile",
            "pageFanProfile",
            "spenders",
            "spenderDetail",
            "spenderBatch",
            "pageSpenderAutoLists",
            "ingestObservations",
            "clientConversationRecaps",
            "clientFanProfileFromGeneration",
            // Every later client route joins here in its own PR:
            // clientConversationFeed, clientSpenderStats, clientSpenderAwaitingReply,
            // clientFanClaim, clientFanClaimStatus, clientAudienceNew.
            "clientAiUsageDaily",
        ],
        // `client_health` (H-11b) is never journaled: the capture lane folds it
        // into hourly rollups that hold no user.
        ingestKinds: ["ai_acceptance", "client_health"],
    },
};
/** The profile names, as the sign-in body and the database CHECK spell them. */
export const CLIENT_TOKEN_PROFILE_NAMES = Object.keys(CLIENT_TOKEN_PROFILES);
export function isClientTokenProfile(value) {
    return typeof value === "string" && Object.hasOwn(CLIENT_TOKEN_PROFILES, value);
}
/** Route kinds that take no principal (sign-in, webhooks, a reservation's
 *  activation): a narrow token's list does not apply to them. */
const UNGUARDED_ROUTE_KINDS = new Set(["public", "hmac", "pending-device-token"]);
/** Whether a narrow token's list is checked on a route of this kind. */
export function clientTokenAllowlistApplies(auth) {
    return !UNGUARDED_ROUTE_KINDS.has(auth.kind);
}
/** Whether a token of this profile may call the route with this key. */
export function clientTokenProfileAllows(profile, operationKey) {
    return CLIENT_TOKEN_PROFILES[profile].operations.includes(operationKey);
}
/**
 * The operations a client SDK calls that a token of this profile is refused:
 * empty when each is on the profile's list or takes no principal (the
 * password sign-in, health). A key no route has counts as refused. For the
 * frozen-SDK registry (hub-pr-plan H-1a, critic 2): a chat-extension SDK row
 * must call nothing its narrow token cannot reach, or the gap shows up only in
 * prod.
 */
export function operationsOutsideClientTokenProfile(profile, operations) {
    const schemas = routeSchemas;
    return operations.filter((key) => {
        const auth = schemas[key]?.auth;
        return (auth === undefined || clientTokenAllowlistApplies(auth)) && !clientTokenProfileAllows(profile, key);
    });
}
