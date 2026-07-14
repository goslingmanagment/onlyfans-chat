// Kernel Stage 21: the event-stream v2 resume cursor. Opaque on the wire —
// base64url JSON `{v: 2, w: {<accountId>: <highSeq>, …}}` for legacy/subset
// cursors, `{v: 3, w: {…}, s: "granted"}` for an exact-grant binding, or
// v4 with `r: "snapshot"` while a completed state snapshot is authorizing one
// bounded replay across erased ledger gaps. These v2/v3/v4 cursors are encoded
// Base64URL JSON, not MAC-signed; their topology and server-side epoch are
// validated before use. The recovery marker is removed before the connection
// enters the live lane. Do not confuse them with the bounded OFAPI stateCursor,
// which is separately HMAC-signed by the runtime.
// Shared by the server (modules/events) and the SDK helper so both ends agree
// byte-for-byte; clients never construct or inspect it.
// Isomorphic base64url (no Buffer): this file ships to the browser through
// the SDK (dashboard) as well as to node (server + desktop). btoa/atob are
// global in both since node 16; TextEncoder/TextDecoder carry the UTF-8 leg.
function toBase64Url(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(text) {
    try {
        const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        // Round-trip guard: catches non-canonical input (whitespace, padding
        // variants, trailing bits) the permissive decoder would silently accept.
        if (toBase64Url(decoded) !== text.replace(/=+$/, "")) {
            return null;
        }
        return decoded;
    }
    catch {
        return null;
    }
}
function sortedRecord(values) {
    const record = {};
    for (const accountId of [...values.keys()].sort((a, b) => a - b)) {
        record[String(accountId)] = values.get(accountId);
    }
    return record;
}
export function encodeDomainEventCursor(watermarks, options = {}) {
    // Sorted keys → deterministic encoding (cursor equality is comparable in tests).
    const w = sortedRecord(watermarks);
    const version = options.recovery?.kind === "snapshot"
        ? 4
        : options.scope === undefined ? 2 : 3;
    return toBase64Url(JSON.stringify({
        // A distinct version makes rollback fail closed: old Core rejects a bound
        // cursor instead of ignoring `s` and widening it at a new account's head.
        v: version,
        w,
        ...(options.scope === undefined ? {} : { s: options.scope }),
        ...(options.recovery === undefined
            ? {}
            : {
                r: options.recovery.kind,
                e: options.recovery.erasureEpoch,
                b: sortedRecord(options.recovery.base),
                t: sortedRecord(options.recovery.targets),
                c: sortedRecord(options.recovery.retainedCounts),
            }),
    }));
}
export function decodeDomainEventCursor(text) {
    const json = fromBase64Url(text);
    if (json === null) {
        return { ok: false, reason: "not_base64url" };
    }
    let parsed;
    try {
        parsed = JSON.parse(json);
    }
    catch {
        return { ok: false, reason: "not_json" };
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return { ok: false, reason: "not_object" };
    }
    const candidate = parsed;
    if (candidate.v !== 2 && candidate.v !== 3 && candidate.v !== 4) {
        return { ok: false, reason: "unknown_version" };
    }
    if (typeof candidate.w !== "object" || candidate.w === null || Array.isArray(candidate.w)) {
        return { ok: false, reason: "missing_watermarks" };
    }
    if ((candidate.v === 2 && candidate.s !== undefined)
        || (candidate.v === 3 && candidate.s !== "granted")
        || (candidate.v === 4 && candidate.s !== undefined && candidate.s !== "granted")) {
        return { ok: false, reason: "invalid_scope" };
    }
    if (((candidate.v === 2 || candidate.v === 3)
        && (candidate.r !== undefined
            || candidate.e !== undefined
            || candidate.b !== undefined
            || candidate.t !== undefined
            || candidate.c !== undefined))
        || (candidate.v === 4 && (candidate.r !== "snapshot"
            || typeof candidate.e !== "number"
            || !Number.isInteger(candidate.e)
            || candidate.e < 0
            || typeof candidate.b !== "object"
            || candidate.b === null
            || Array.isArray(candidate.b)
            || typeof candidate.t !== "object"
            || candidate.t === null
            || Array.isArray(candidate.t)
            || typeof candidate.c !== "object"
            || candidate.c === null
            || Array.isArray(candidate.c)))) {
        return { ok: false, reason: "invalid_recovery" };
    }
    const watermarks = new Map();
    for (const [key, value] of Object.entries(candidate.w)) {
        const accountId = Number(key);
        if (!Number.isInteger(accountId) || accountId <= 0) {
            return { ok: false, reason: "invalid_account_id" };
        }
        if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
            return { ok: false, reason: "invalid_watermark" };
        }
        watermarks.set(accountId, value);
    }
    const parseRecoveryMap = (value) => {
        const result = new Map();
        for (const [key, item] of Object.entries(value)) {
            const accountId = Number(key);
            if (!Number.isInteger(accountId) || accountId <= 0)
                return null;
            if (typeof item !== "number" || !Number.isInteger(item) || item < 0)
                return null;
            result.set(accountId, item);
        }
        return result;
    };
    let recovery = null;
    if (candidate.v === 4) {
        const base = parseRecoveryMap(candidate.b);
        const targets = parseRecoveryMap(candidate.t);
        const retainedCounts = parseRecoveryMap(candidate.c);
        if (base === null || targets === null || retainedCounts === null) {
            return { ok: false, reason: "invalid_recovery_topology" };
        }
        const keys = [...watermarks.keys()].sort((left, right) => left - right);
        if (keys.length !== base.size
            || keys.length !== targets.size
            || keys.length !== retainedCounts.size
            || keys.some((accountId) => (!base.has(accountId)
                || !targets.has(accountId)
                || !retainedCounts.has(accountId)
                || base.get(accountId) > watermarks.get(accountId)
                || watermarks.get(accountId) > targets.get(accountId)
                || retainedCounts.get(accountId) > targets.get(accountId) - base.get(accountId)))) {
            return { ok: false, reason: "invalid_recovery_topology" };
        }
        recovery = {
            kind: "snapshot",
            erasureEpoch: candidate.e,
            base,
            targets,
            retainedCounts,
        };
    }
    return {
        ok: true,
        watermarks,
        scope: candidate.s === "granted" ? "granted" : null,
        recovery,
    };
}
