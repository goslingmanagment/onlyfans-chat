import { errorResponseSchema } from "./primitives";
import { ofapiUsageWindowSchema, ofapiVendorUsageResponseSchema, ofapiKeyScopeSchema, ofapiKeyScopeApplySchema } from "./ofapi-vendor-usage";
const errors = { 400: errorResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema, 409: errorResponseSchema, 503: errorResponseSchema };
export const ofapiVendorRouteSchemas = {
    ofapiVendorUsageRefresh: { auth: { kind: "owner-session" }, tags: ["admin"], summary: "Capture a free bounded vendor usage report and compare retained local accounting", body: ofapiUsageWindowSchema, response: { 200: ofapiVendorUsageResponseSchema, ...errors } },
    ofapiKeyScopeGet: { auth: { kind: "owner-session" }, tags: ["admin"], summary: "Read declared and observed server key readiness", response: { 200: ofapiKeyScopeSchema, ...errors } },
    ofapiKeyScopeApply: { auth: { kind: "owner-session" }, tags: ["admin"], summary: "Record versioned owner-declared restrictions of the current API key", body: ofapiKeyScopeApplySchema, response: { 200: ofapiKeyScopeSchema, ...errors } },
};
