import { z } from "zod";
import { errorResponseSchema } from "./primitives";
import { ofapiActionIntentSchema, ofapiActionSchema } from "./ofapi-actions";
const errors = { 400: errorResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema, 503: errorResponseSchema };
const auth = { kind: "owner-session" };
const params = z.object({ id: z.string().uuid() });
export const ofapiActionRouteSchemas = {
    ofapiActionPrepare: { auth, tags: ["admin"], summary: "Prepare a typed account action without vendor execution", body: z.strictObject({ id: z.string().uuid(), command: ofapiActionSchema }), response: { 200: ofapiActionIntentSchema, ...errors } },
    ofapiActionDispatch: { auth, tags: ["admin"], summary: "Execute the frozen account action once", params, body: z.strictObject({}), response: { 200: ofapiActionIntentSchema, ...errors } },
    ofapiActionCancel: { auth, tags: ["admin"], summary: "Cancel a prepared account action locally", params, body: z.strictObject({}), response: { 200: ofapiActionIntentSchema, ...errors } },
    ofapiActionGet: { auth, tags: ["admin"], summary: "Read retained action and response evidence locally", params, response: { 200: ofapiActionIntentSchema, ...errors } },
    ofapiActionList: { auth, tags: ["admin"], summary: "List retained actions for the selected page without vendor requests", querystring: z.object({ pageId: z.coerce.number().int().positive() }), response: { 200: z.object({ intents: z.array(ofapiActionIntentSchema) }), ...errors } },
    ofapiActionRepair: { auth, tags: ["admin"], summary: "Reapply retained response evidence without resending the action", params, body: z.strictObject({}), response: { 200: ofapiActionIntentSchema, ...errors } },
};
