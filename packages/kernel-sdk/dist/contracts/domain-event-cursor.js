// Kernel Stage 21: the event-stream v2 resume cursor. Opaque on the wire —
// base64url JSON `{v: 2, w: {<accountId>: <highSeq>, …}}` for legacy/subset
// cursors or `{v: 3, w: {…}, s: "granted"}` for an exact-grant binding.
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
export function encodeDomainEventCursor(watermarks, options = {}) {
    const w = {};
    // Sorted keys → deterministic encoding (cursor equality is comparable in tests).
    for (const accountId of [...watermarks.keys()].sort((a, b) => a - b)) {
        w[String(accountId)] = watermarks.get(accountId);
    }
    return toBase64Url(JSON.stringify({
        // A distinct version makes rollback fail closed: old Core rejects a bound
        // cursor instead of ignoring `s` and widening it at a new account's head.
        v: options.scope === undefined ? 2 : 3,
        w,
        ...(options.scope === undefined ? {} : { s: options.scope }),
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
    if (candidate.v !== 2 && candidate.v !== 3) {
        return { ok: false, reason: "unknown_version" };
    }
    if (typeof candidate.w !== "object" || candidate.w === null || Array.isArray(candidate.w)) {
        return { ok: false, reason: "missing_watermarks" };
    }
    if ((candidate.v === 2 && candidate.s !== undefined)
        || (candidate.v === 3 && candidate.s !== "granted")) {
        return { ok: false, reason: "invalid_scope" };
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
    return {
        ok: true,
        watermarks,
        scope: candidate.v === 3 ? "granted" : null,
    };
}
