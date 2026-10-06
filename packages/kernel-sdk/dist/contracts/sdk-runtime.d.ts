import type { z } from "zod";
import { routeSchemas } from "./routes";
export interface KernelOperationDef {
    method: string;
    path: string;
}
type Schemas = typeof routeSchemas;
export type KernelOperationKey = keyof Schemas & string;
/**
 * Operations without a plain request/JSON-response shape. The webhook is
 * HMAC-authenticated server intake; the two streams are SSE (dedicated
 * helpers); the read gateway is a wildcard proxy (passthrough helper); the
 * ledger CSV returns text/csv; the voice-note audio route returns binary
 * audio/mpeg (dedicated `fetchVoiceNoteAudio` helper). All remain reachable via
 * `client.raw(...)`.
 */
export declare const SDK_EXCLUDED_OPERATIONS: readonly ["ofapiWebhookReceive", "eventsStream", "eventsV2Stream", "aiGatewayStream", "ofapiReadGateway", "adminOfapiCreditsLedgerCsv", "voiceNoteAudio"];
export type KernelSdkExcludedKey = (typeof SDK_EXCLUDED_OPERATIONS)[number];
export type KernelSdkMethodKey = Exclude<KernelOperationKey, KernelSdkExcludedKey>;
type InputOf<S> = S extends z.ZodType ? z.input<S> : never;
type OutputOf<S> = S extends z.ZodType ? z.output<S> : never;
type SuccessStatus = 200 | 201 | 202 | 204;
export type KernelOperationRequest<K extends KernelOperationKey> = (Schemas[K] extends {
    params: infer P;
} ? {
    params: InputOf<P>;
} : object) & (Schemas[K] extends {
    querystring: infer Q;
} ? {
    query: InputOf<Q>;
} : object) & (Schemas[K] extends {
    body: infer B;
} ? {
    body: InputOf<B>;
} : object);
export type KernelOperationResponse<K extends KernelOperationKey> = Schemas[K] extends {
    response: infer R;
} ? OutputOf<R[Extract<keyof R, SuccessStatus>]> : never;
type HasRequestFields<K extends KernelOperationKey> = Schemas[K] extends {
    params: unknown;
} ? true : Schemas[K] extends {
    querystring: unknown;
} ? true : Schemas[K] extends {
    body: unknown;
} ? true : false;
export type KernelClient = {
    [K in KernelSdkMethodKey]: HasRequestFields<K> extends true ? (input: KernelOperationRequest<K>) => Promise<KernelOperationResponse<K>> : () => Promise<KernelOperationResponse<K>>;
} & {
    /**
     * Escape hatch: send any operation (including the excluded ones) with the
     * manifest's method/path and the client's auth plumbing, and get the raw
     * Response back — no validation, no JSON assumption.
     */
    raw(key: KernelOperationKey, input?: {
        params?: Record<string, string | number>;
        query?: Record<string, unknown>;
        body?: unknown;
        headers?: Record<string, string>;
    }): Promise<Response>;
};
export type KernelErrorCategory = "auth" | "validation" | "not_found" | "conflict" | "rate_limit" | "server" | "http" | "network" | "contract";
export declare class KernelApiError extends Error {
    readonly category: KernelErrorCategory;
    readonly status: number | null;
    readonly code: string | null;
    readonly body: unknown;
    constructor(message: string, category: KernelErrorCategory, status: number | null, code: string | null, body: unknown);
}
export interface KernelClientOptions {
    baseUrl: string;
    auth?: {
        mode: "cookie";
    } | {
        mode: "bearer";
        token: () => string | Promise<string>;
    };
    /** Extra headers on every request (tests use this to carry a session cookie). */
    headers?: Record<string, string>;
    fetch?: typeof fetch;
    /**
     * Called on every 401/403 before the error is thrown (logout hooks). The
     * second argument names the operation (null for raw/stream calls), so a
     * failed `login` can be told apart from an expired session.
     */
    onAuthError?: (error: KernelApiError, operation: KernelOperationKey | null) => void;
}
export declare function executeKernelRequest(input: {
    def: KernelOperationDef;
    options: KernelClientOptions;
    params?: Record<string, string | number>;
    query?: Record<string, unknown> | undefined;
    body?: unknown;
    headers?: Record<string, string> | undefined;
}): Promise<Response>;
export declare function createKernelClient(operations: Record<KernelOperationKey, KernelOperationDef>, options: KernelClientOptions): KernelClient;
import { syncSnapshotRequiredResponseSchema, type AiFeatureStreamFrame, type AiGatewayStreamFrame, type DomainEventFrame, type DomainEventsSnapshotRequired, type SyncEvent } from "./routes";
import type { z as zod } from "zod";
export interface KernelStreamHandle {
    /** Resolves when the stream ends (server bound, snapshot-required, or close()). */
    done: Promise<void>;
    close: () => void;
}
export type SyncSnapshotRequired = zod.infer<typeof syncSnapshotRequiredResponseSchema>;
/**
 * Subscribe to the v1 sync-event stream (`GET /api/v1/events/stream`).
 * Single connection, no auto-reconnect: the server bounds stream lifetime
 * (~15 min) and v1 clients own their reconnect loop, resuming via
 * `lastEventId`. A 409 becomes `onSnapshotRequired` and ends the stream.
 */
export declare function subscribeSyncEvents(options: KernelClientOptions, input: {
    lastEventId?: number | null;
    onFrame: (frame: {
        id: number;
        event: SyncEvent;
    }) => void;
    onSnapshotRequired?: (details: SyncSnapshotRequired) => void;
    signal?: AbortSignal;
}): KernelStreamHandle;
/**
 * What a client may advertise on the AI feature stream in the
 * `x-kernel-ai-capabilities` header. Each token is compatibility negotiation,
 * not authorization: "this client understands the matching frame or field".
 * The server ignores tokens it does not know (so a hub that does not serve a
 * token yet behaves exactly as without it), and the SDK writes the header in
 * this order.
 */
export declare const AI_STREAM_CAPABILITIES: readonly ["debug-input-v1", "context-v1", "split-all-v1"];
export type AiStreamCapability = (typeof AI_STREAM_CAPABILITIES)[number];
/**
 * Stream one AI generation through the gateway
 * (`POST /api/v1/ai/gateway/stream`, `event: ai` frames).
 */
/** Stage 31: stream a kernel-assembled feature generation (Stage 30 route).
 * Same SSE framing as the raw gateway stream — one helper per entry path.
 * `debugPromptEcho` is kept for existing callers: it equals advertising
 * `debug-input-v1` in `capabilities`. */
export declare function streamAiFeature(options: KernelClientOptions, input: {
    feature: string;
    body: zod.input<(typeof routeSchemas)["aiFeatureStream"]["body"]>;
    onFrame: (frame: AiFeatureStreamFrame) => void;
    debugPromptEcho?: boolean;
    capabilities?: readonly AiStreamCapability[];
    signal?: AbortSignal;
}): KernelStreamHandle;
export declare function streamAiGateway(options: KernelClientOptions, input: {
    body: zod.input<(typeof routeSchemas)["aiGatewayStream"]["body"]>;
    onFrame: (frame: AiGatewayStreamFrame) => void;
    signal?: AbortSignal;
}): KernelStreamHandle;
/**
 * Thin passthrough for the wildcard read gateway (`GET /api/v1/ofapi/read/*`):
 * upstream shapes are proxied verbatim, so no validation — the caller gets the
 * raw Response.
 */
export declare function ofapiRead(options: KernelClientOptions, input: {
    path: string;
    query?: Record<string, unknown> | undefined;
    headers?: Record<string, string> | undefined;
}): Promise<Response>;
/**
 * Fetch a completed voice-note's audio bytes (`GET
 * /api/v1/pages/:pageLabel/voice-notes/:id/audio`, Task 6). The response is
 * binary `audio/mpeg`, so there is no JSON shape to validate — the caller gets
 * the raw Response (200 with the bytes on success). On failure the body carries
 * a structured `{ error, message, statusCode }`; NOTE a 410 `artifact_expired`
 * (the audio was purged) is matched on the body `error` code, NOT a distinct
 * SDK error category — the existing gate-code pattern.
 */
export declare function fetchVoiceNoteAudio(options: KernelClientOptions, input: {
    pageLabel: string;
    id: number;
}): Promise<Response>;
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
export declare function subscribeDomainEvents(options: KernelClientOptions, input: {
    cursor?: string | null;
    platform?: "onlyfans" | "fansly";
    onFrame: (frame: {
        cursor: string;
        event: DomainEventFrame;
    }) => void;
    onSnapshotRequired?: (details: DomainEventsSnapshotRequired) => void;
    signal?: AbortSignal;
}): KernelStreamHandle;
export {};
