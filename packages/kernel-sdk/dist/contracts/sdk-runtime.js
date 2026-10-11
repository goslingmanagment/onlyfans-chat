import { routeSchemas } from "./routes";
/**
 * Operations without a plain request/JSON-response shape. The webhook is
 * HMAC-authenticated server intake; the two streams are SSE (dedicated
 * helpers); the read gateway is a wildcard proxy (passthrough helper); the
 * ledger CSV returns text/csv; the voice-note audio route returns binary
 * audio/mpeg (dedicated `fetchVoiceNoteAudio` helper). All remain reachable via
 * `client.raw(...)`.
 */
export const SDK_EXCLUDED_OPERATIONS = [
    "ofapiWebhookReceive",
    "eventsStream",
    "eventsV2Stream",
    "aiGatewayStream",
    "ofapiReadGateway",
    "adminOfapiCreditsLedgerCsv",
    "voiceNoteAudio",
];
export class KernelApiError extends Error {
    category;
    status;
    code;
    body;
    constructor(message, category, status, code, body) {
        super(message);
        this.category = category;
        this.status = status;
        this.code = code;
        this.body = body;
        this.name = "KernelApiError";
    }
}
function categoryForStatus(status) {
    if (status === 400)
        return "validation";
    if (status === 401 || status === 403)
        return "auth";
    if (status === 404)
        return "not_found";
    if (status === 409)
        return "conflict";
    if (status === 429)
        return "rate_limit";
    if (status >= 500)
        return "server";
    return "http";
}
// A param is a whole segment (`/:name`); a colon inside a segment is a
// literal custom method (`/api/v2/spenders:batch`), as the server routes it.
function buildPath(template, params) {
    return template.replace(/(?<=\/):([A-Za-z0-9_]+)/g, (_match, name) => {
        const value = params?.[name];
        if (value === undefined || value === null) {
            throw new KernelApiError(`Missing path param "${name}" for ${template}`, "contract", null, "missing_path_param", null);
        }
        return encodeURIComponent(String(value));
    });
}
function buildQuery(query) {
    if (!query) {
        return "";
    }
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) {
            continue;
        }
        if (Array.isArray(value)) {
            for (const item of value) {
                search.append(key, String(item));
            }
            continue;
        }
        search.append(key, String(value));
    }
    const text = search.toString();
    return text ? `?${text}` : "";
}
export async function executeKernelRequest(input) {
    const { def, options } = input;
    const fetchImpl = options.fetch ?? fetch;
    const url = `${options.baseUrl}${buildPath(def.path, input.params)}${buildQuery(input.query)}`;
    const headers = { ...options.headers, ...input.headers };
    if (options.auth?.mode === "bearer") {
        headers.authorization = `Bearer ${await options.auth.token()}`;
    }
    const requestInit = {
        method: def.method,
        headers,
        ...(options.auth?.mode === "cookie" ? { credentials: "include" } : {}),
    };
    if (input.body !== undefined) {
        headers["content-type"] = "application/json";
        requestInit.body = JSON.stringify(input.body);
    }
    try {
        return await fetchImpl(url, requestInit);
    }
    catch (error) {
        throw new KernelApiError(`Network error calling ${def.method} ${def.path}: ${error instanceof Error ? error.message : "unknown"}`, "network", null, networkErrorCode(error), null);
    }
}
/** Preserve the abort/timeout distinction through the network wrap — clients
 * with retry discipline (the desktop) must not blind-retry what a caller
 * deliberately aborted, and must classify timeouts as such. */
function networkErrorCode(error) {
    const name = error instanceof Error ? error.name : typeof error === "object" && error !== null && "name" in error ? String(error.name) : null;
    if (name === "TimeoutError")
        return "timeout";
    if (name === "AbortError")
        return "aborted";
    return "network_error";
}
async function throwForErrorResponse(def, response, options, operation) {
    let body;
    const text = await response.text();
    try {
        body = text ? JSON.parse(text) : null;
    }
    catch {
        body = text;
    }
    const envelope = (body ?? {});
    const error = new KernelApiError(typeof envelope.message === "string"
        ? envelope.message
        : `${def.method} ${def.path} failed with ${response.status}`, categoryForStatus(response.status), response.status, typeof envelope.error === "string" ? envelope.error : null, body);
    if (error.category === "auth") {
        options.onAuthError?.(error, operation);
    }
    throw error;
}
/** Raw/stream paths carry a null operation (the options doc's contract):
 * fire the logout hook for 401/403s that never pass throwForErrorResponse. */
function notifyAuthError(options, error) {
    if (error.category === "auth") {
        options.onAuthError?.(error, null);
    }
}
/** The error envelope of a non-OK SSE handshake, parsed like the typed path
 * parses it: `body` is the JSON envelope when there is one (so a structured
 * `reason` — Decision 349's token_revoked / token_expired — reaches the
 * client's self-healing), the raw text otherwise, and `code` is its `error`. */
async function sseHandshakeError(label, response) {
    const text = await response.text().catch(() => "");
    let body;
    try {
        body = text ? JSON.parse(text) : null;
    }
    catch {
        body = text;
    }
    const envelope = (body ?? {});
    return new KernelApiError(typeof envelope.message === "string"
        ? envelope.message
        : `${label} failed with ${response.status}`, response.status === 401 || response.status === 403 ? "auth" : "server", response.status, typeof envelope.error === "string" ? envelope.error : null, body);
}
export function createKernelClient(operations, options) {
    const excluded = new Set(SDK_EXCLUDED_OPERATIONS);
    async function call(key, input) {
        const def = operations[key];
        const response = await executeKernelRequest({ def, options, ...input });
        if (!response.ok) {
            await throwForErrorResponse(def, response, options, key);
        }
        const responseSchemas = routeSchemas[key].response;
        const schema = responseSchemas?.[response.status];
        if (!schema) {
            throw new KernelApiError(`${def.method} ${def.path} returned undeclared status ${response.status}`, "contract", response.status, "undeclared_status", null);
        }
        const payload = await response.json();
        const parsed = schema.safeParse(payload);
        if (!parsed.success) {
            throw new KernelApiError(`${def.method} ${def.path} response failed contract validation: ${parsed.error.message}`, "contract", response.status, "response_validation_failed", payload);
        }
        return parsed.data;
    }
    const client = {
        async raw(key, input) {
            const def = operations[key];
            const response = await executeKernelRequest({ def, options, ...input });
            if (response.status === 401 || response.status === 403) {
                notifyAuthError(options, new KernelApiError(`${def.method} ${def.path} failed with ${response.status}`, "auth", response.status, null, null));
            }
            return response;
        },
    };
    for (const key of Object.keys(operations)) {
        if (excluded.has(key)) {
            continue;
        }
        client[key] = (input) => call(key, input ?? {});
    }
    return client;
}
// --- Stream helpers (Stage 20 Task 2) ---
import { aiFeatureStreamFrameSchema, aiGatewayStreamFrameSchema, domainEventFrameSchema, domainEventsSnapshotRequiredResponseSchema, syncEventSchema, syncSnapshotRequiredResponseSchema, } from "./routes";
async function* parseSseStream(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) {
                return;
            }
            buffer += decoder.decode(value, { stream: true });
            let boundary;
            while ((boundary = buffer.indexOf("\n\n")) >= 0) {
                const raw = buffer.slice(0, boundary);
                buffer = buffer.slice(boundary + 2);
                const frame = { id: null, event: null, data: "" };
                for (const line of raw.split("\n")) {
                    if (line.startsWith(":") || line.startsWith("retry:")) {
                        continue; // heartbeat comments and reconnect hints
                    }
                    if (line.startsWith("id: ")) {
                        frame.id = line.slice(4);
                    }
                    else if (line.startsWith("event: ")) {
                        frame.event = line.slice(7);
                    }
                    else if (line.startsWith("data: ")) {
                        frame.data += (frame.data ? "\n" : "") + line.slice(6);
                    }
                }
                if (frame.id !== null || frame.event !== null || frame.data !== "") {
                    yield frame;
                }
            }
        }
    }
    finally {
        reader.releaseLock();
    }
}
async function openSseResponse(input) {
    const { options } = input;
    const fetchImpl = options.fetch ?? fetch;
    const headers = {
        accept: "text/event-stream",
        ...options.headers,
        ...input.headers,
    };
    if (options.auth?.mode === "bearer") {
        headers.authorization = `Bearer ${await options.auth.token()}`;
    }
    const init = {
        method: input.method,
        headers,
        signal: input.signal,
        ...(options.auth?.mode === "cookie" ? { credentials: "include" } : {}),
    };
    if (input.body !== undefined) {
        headers["content-type"] = "application/json";
        init.body = JSON.stringify(input.body);
    }
    try {
        return await fetchImpl(`${options.baseUrl}${input.path}`, init);
    }
    catch (error) {
        throw new KernelApiError(`Network error opening ${input.path}: ${error instanceof Error ? error.message : "unknown"}`, "network", null, "network_error", null);
    }
}
/**
 * Subscribe to the v1 sync-event stream (`GET /api/v1/events/stream`).
 * Single connection, no auto-reconnect: the server bounds stream lifetime
 * (~15 min) and v1 clients own their reconnect loop, resuming via
 * `lastEventId`. A 409 becomes `onSnapshotRequired` and ends the stream.
 */
export function subscribeSyncEvents(options, input) {
    const abort = new AbortController();
    input.signal?.addEventListener("abort", () => abort.abort(), { once: true });
    const done = (async () => {
        const response = await openSseResponse({
            options,
            method: "GET",
            path: "/api/v1/events/stream",
            headers: input.lastEventId != null ? { "last-event-id": String(input.lastEventId) } : undefined,
            signal: abort.signal,
        });
        if (response.status === 409) {
            const body = await response.json();
            const parsed = syncSnapshotRequiredResponseSchema.safeParse(body);
            if (!parsed.success) {
                throw new KernelApiError("events/stream 409 body failed contract validation", "contract", 409, "response_validation_failed", body);
            }
            input.onSnapshotRequired?.(parsed.data);
            return;
        }
        if (!response.ok || !response.body) {
            const error = await sseHandshakeError("events/stream", response);
            notifyAuthError(options, error);
            throw error;
        }
        for await (const frame of parseSseStream(response.body)) {
            if (frame.event !== "sync" || frame.data === "") {
                continue; // retry hints / heartbeats
            }
            const parsed = syncEventSchema.safeParse(JSON.parse(frame.data));
            if (!parsed.success) {
                throw new KernelApiError(`sync frame failed contract validation: ${parsed.error.message}`, "contract", 200, "frame_validation_failed", frame.data);
            }
            input.onFrame({ id: Number(frame.id), event: parsed.data });
        }
    })().catch((error) => {
        if (abort.signal.aborted) {
            return; // close() is not an error
        }
        throw error;
    });
    return { done, close: () => abort.abort() };
}
/**
 * What a client may advertise on the AI feature stream in the
 * `x-kernel-ai-capabilities` header. Each token is compatibility negotiation,
 * not authorization: "this client understands the matching frame or field".
 * The server ignores tokens it does not know (so a hub that does not serve a
 * token yet behaves exactly as without it), and the SDK writes the header in
 * this order.
 */
export const AI_STREAM_CAPABILITIES = ["debug-input-v1", "context-v1", "split-all-v1"];
/** The header value for `streamAiFeature`: the union of `capabilities` and
 * (`debugPromptEcho` → `debug-input-v1`), deduplicated, in the order of
 * AI_STREAM_CAPABILITIES, joined by ", ". Nothing to advertise → no header. */
function aiStreamCapabilitiesHeader(input) {
    const wanted = new Set(input.capabilities ?? []);
    if (input.debugPromptEcho) {
        wanted.add("debug-input-v1");
    }
    const tokens = AI_STREAM_CAPABILITIES.filter((capability) => wanted.has(capability));
    return tokens.length > 0 ? tokens.join(", ") : undefined;
}
/**
 * Stream one AI generation through the gateway
 * (`POST /api/v1/ai/gateway/stream`, `event: ai` frames).
 */
/** Stage 31: stream a kernel-assembled feature generation (Stage 30 route).
 * Same SSE framing as the raw gateway stream — one helper per entry path.
 * `debugPromptEcho` is kept for existing callers: it equals advertising
 * `debug-input-v1` in `capabilities`. */
export function streamAiFeature(options, input) {
    const abort = new AbortController();
    input.signal?.addEventListener("abort", () => abort.abort(), { once: true });
    const capabilitiesHeader = aiStreamCapabilitiesHeader(input);
    const done = (async () => {
        const response = await openSseResponse({
            options,
            method: "POST",
            path: `/api/v1/ai/features/${encodeURIComponent(input.feature)}`,
            headers: capabilitiesHeader !== undefined
                ? { "x-kernel-ai-capabilities": capabilitiesHeader }
                : undefined,
            body: input.body,
            signal: abort.signal,
        });
        if (!response.ok || !response.body) {
            let body;
            const text = await response.text().catch(() => "");
            try {
                body = text ? JSON.parse(text) : null;
            }
            catch {
                body = text;
            }
            const envelope = (body ?? {});
            // categoryForStatus, not an auth/server ternary: a 429 quota denial must
            // reach clients as rate_limit (code "quota_denied"), not "validation".
            const error = new KernelApiError(typeof envelope.message === "string" ? envelope.message : `ai/features/${input.feature} failed with ${response.status}`, categoryForStatus(response.status), response.status, typeof envelope.error === "string" ? envelope.error : null, body);
            notifyAuthError(options, error);
            throw error;
        }
        for await (const frame of parseSseStream(response.body)) {
            if (frame.event !== "ai" || frame.data === "") {
                continue;
            }
            const parsed = aiFeatureStreamFrameSchema.safeParse(JSON.parse(frame.data));
            if (!parsed.success) {
                throw new KernelApiError(`ai frame failed contract validation: ${parsed.error.message}`, "contract", 200, "frame_validation_failed", frame.data);
            }
            input.onFrame(parsed.data);
        }
    })().catch((error) => {
        if (abort.signal.aborted) {
            return;
        }
        throw error;
    });
    return {
        done,
        close: () => abort.abort(),
    };
}
export function streamAiGateway(options, input) {
    const abort = new AbortController();
    input.signal?.addEventListener("abort", () => abort.abort(), { once: true });
    const done = (async () => {
        const response = await openSseResponse({
            options,
            method: "POST",
            path: "/api/v1/ai/gateway/stream",
            body: input.body,
            signal: abort.signal,
        });
        if (!response.ok || !response.body) {
            let body;
            const text = await response.text().catch(() => "");
            try {
                body = text ? JSON.parse(text) : null;
            }
            catch {
                body = text;
            }
            const envelope = (body ?? {});
            const error = new KernelApiError(typeof envelope.message === "string" ? envelope.message : `ai/gateway/stream failed with ${response.status}`, categoryForStatus(response.status), response.status, typeof envelope.error === "string" ? envelope.error : null, body);
            notifyAuthError(options, error);
            throw error;
        }
        for await (const frame of parseSseStream(response.body)) {
            if (frame.event !== "ai" || frame.data === "") {
                continue;
            }
            const parsed = aiGatewayStreamFrameSchema.safeParse(JSON.parse(frame.data));
            if (!parsed.success) {
                throw new KernelApiError(`ai frame failed contract validation: ${parsed.error.message}`, "contract", 200, "frame_validation_failed", frame.data);
            }
            input.onFrame(parsed.data);
        }
    })().catch((error) => {
        if (abort.signal.aborted) {
            return;
        }
        throw error;
    });
    return { done, close: () => abort.abort() };
}
/**
 * Thin passthrough for the wildcard read gateway (`GET /api/v1/ofapi/read/*`):
 * upstream shapes are proxied verbatim, so no validation — the caller gets the
 * raw Response.
 */
export async function ofapiRead(options, input) {
    const cleanPath = input.path.replace(/^\/+/, "");
    return executeKernelRequest({
        def: { method: "GET", path: `/api/v1/ofapi/read/${cleanPath}` },
        options,
        query: input.query,
        headers: input.headers,
    });
}
/**
 * Fetch a completed voice-note's audio bytes (`GET
 * /api/v1/pages/:pageLabel/voice-notes/:id/audio`, Task 6). The response is
 * binary `audio/mpeg`, so there is no JSON shape to validate — the caller gets
 * the raw Response (200 with the bytes on success). On failure the body carries
 * a structured `{ error, message, statusCode }`; NOTE a 410 `artifact_expired`
 * (the audio was purged) is matched on the body `error` code, NOT a distinct
 * SDK error category — the existing gate-code pattern.
 */
export async function fetchVoiceNoteAudio(options, input) {
    const def = { method: "GET", path: "/api/v1/pages/:pageLabel/voice-notes/:id/audio" };
    const response = await executeKernelRequest({
        def,
        options,
        params: { pageLabel: input.pageLabel, id: input.id },
    });
    // Mirror client.raw(): the caller gets the raw Response, so nothing else fires
    // the logout hook. An expired bearer during audio download must still notify
    // onAuthError (operation=null) like every other 401/403.
    if (response.status === 401 || response.status === 403) {
        notifyAuthError(options, new KernelApiError(`${def.method} ${def.path} failed with ${response.status}`, "auth", response.status, null, null));
    }
    return response;
}
/**
 * Subscribe to the v2 domain-event stream (`GET /api/v1/events/v2/stream`,
 * kernel Stage 21). The cursor is OPAQUE — persist the last delivered one and
 * hand it back on reconnect. Single connection, no auto-reconnect (same
 * contract as v1: the server bounds stream lifetime; consumers own the loop).
 * A 409 becomes `onSnapshotRequired` with the per-account detail; recover via
 * `client.eventsV2Snapshot(...)` and resubscribe with the fresh cursor.
 * `platform` narrows the stream to one platform's granted accounts; pass the
 * same value to the snapshot and on every resume (its cursors are bound to it).
 */
export function subscribeDomainEvents(options, input) {
    const abort = new AbortController();
    input.signal?.addEventListener("abort", () => abort.abort(), { once: true });
    const done = (async () => {
        const response = await openSseResponse({
            options,
            method: "GET",
            path: `/api/v1/events/v2/stream${input.platform ? `?platform=${input.platform}` : ""}`,
            headers: input.cursor ? { "last-event-id": input.cursor } : undefined,
            signal: abort.signal,
        });
        if (response.status === 409) {
            const body = await response.json();
            const parsed = domainEventsSnapshotRequiredResponseSchema.safeParse(body);
            if (!parsed.success) {
                throw new KernelApiError("events/v2/stream 409 body failed contract validation", "contract", 409, "response_validation_failed", body);
            }
            input.onSnapshotRequired?.(parsed.data);
            return;
        }
        if (!response.ok || !response.body) {
            const error = await sseHandshakeError("events/v2/stream", response);
            notifyAuthError(options, error);
            throw error;
        }
        for await (const frame of parseSseStream(response.body)) {
            if (frame.event !== "domain" || frame.data === "" || frame.id === null) {
                continue;
            }
            const parsed = domainEventFrameSchema.safeParse(JSON.parse(frame.data));
            if (!parsed.success) {
                throw new KernelApiError(`domain frame failed contract validation: ${parsed.error.message}`, "contract", 200, "frame_validation_failed", frame.data);
            }
            input.onFrame({ cursor: frame.id, event: parsed.data });
        }
    })().catch((error) => {
        if (abort.signal.aborted) {
            return;
        }
        throw error;
    });
    return { done, close: () => abort.abort() };
}
