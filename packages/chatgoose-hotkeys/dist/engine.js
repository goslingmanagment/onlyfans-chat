import { HOTKEYS, MAC_SHIFT_ALIASES, MAC_SHIFT_SWALLOWED, isMacKeys } from "./scheme";
const META_CODES = new Set(["MetaLeft", "MetaRight", "OSLeft", "OSRight"]);
const CONTROL_CODES = new Set(["ControlLeft", "ControlRight"]);
const SHIFT_CODES = new Set(["ShiftLeft", "ShiftRight"]);
const ALT_CODES = new Set(["AltLeft", "AltRight"]);
function isMeta(event) {
    return META_CODES.has(event.code) || event.key === "Meta" || event.key === "OS";
}
function isControl(event) {
    return CONTROL_CODES.has(event.code) || event.key === "Control";
}
function isShift(event) {
    return SHIFT_CODES.has(event.code) || event.key === "Shift";
}
function isModifier(event) {
    return isMeta(event) || isControl(event) || isShift(event) || ALT_CODES.has(event.code)
        || event.key === "Alt" || event.key === "AltGraph" || event.key === "CapsLock" || event.key === "Fn";
}
/** Which modifier chord the event carries, strictly (extra modifiers → null). */
function chordOf(event, platform) {
    const { metaKey: meta, ctrlKey: ctrl, altKey: alt, shiftKey: shift } = event;
    if (isMacKeys(platform)) {
        if (!meta || ctrl || alt)
            return null;
        return shift ? "shifted" : "text";
    }
    if (!ctrl || meta || shift)
        return null;
    return alt ? "panel" : "text";
}
/** The fresh-press roll-over guard, as a small state machine.
 *
 * A guarded (text-level) command fires only if, since the primary modifier
 * (Cmd on macOS, Ctrl on Windows) went down, no other non-modifier key was
 * pressed and Shift or Space was not pressed-and-released. A held Shift does
 * not spoil freshness (Cmd+Shift+E must still reply). This rejects:
 * - Windows: Ctrl+Shift (language switch) → release Shift → keep Ctrl → E;
 * - macOS: Cmd+Space (input switch) → E; Cmd+V → e typed before Cmd is up.
 * Consequence, chosen on purpose: a second command under the same held
 * modifier (Cmd+G, then E) needs Cmd pressed again. A modifier already held
 * when the page gained focus is an unknown state and does not fire. */
class FreshPressGuard {
    platform;
    primaryDown = false;
    fresh = false;
    constructor(platform) {
        this.platform = platform;
    }
    isPrimary(event) {
        return isMacKeys(this.platform) ? isMeta(event) : isControl(event);
    }
    primaryFlag(event) {
        return isMacKeys(this.platform) ? event.metaKey : event.ctrlKey;
    }
    /** Update state for a keydown; returns whether a non-modifier key on this
     * event may count as a fresh press (read BEFORE the key spoils freshness). */
    keydown(event) {
        if (!this.primaryFlag(event) && !this.isPrimary(event)) {
            // The modifier is up — a keyup we never saw (blur, OS-level switch).
            this.primaryDown = false;
            this.fresh = false;
            return false;
        }
        if (this.isPrimary(event)) {
            if (!this.primaryDown) {
                this.primaryDown = true;
                this.fresh = true;
            }
            return false;
        }
        if (isModifier(event))
            return false;
        const wasFresh = this.primaryDown && this.fresh;
        if (!event.repeat)
            this.fresh = false;
        return wasFresh;
    }
    keyup(event) {
        if (this.isPrimary(event)) {
            this.primaryDown = false;
            this.fresh = false;
            return;
        }
        if (this.primaryDown && (isShift(event) || event.code === "Space"))
            this.fresh = false;
    }
    reset() {
        this.primaryDown = false;
        this.fresh = false;
    }
}
export function createHotkeyEngine(options) {
    const { platform, client } = options;
    const guard = new FreshPressGuard(platform);
    const byCode = new Map();
    for (const def of HOTKEYS)
        byCode.set(`${def.level}:${def.code}`, def);
    function decide(def, event, fresh) {
        if (!def.clients.includes(client))
            return { kind: "swallow", reason: "reserved" };
        if (event.repeat)
            return { kind: "action", action: def.action, repeat: true };
        if (def.guarded && !fresh)
            return { kind: "swallow", reason: "rollover" };
        return { kind: "action", action: def.action, repeat: false };
    }
    return {
        keydown(event) {
            const fresh = guard.keydown(event);
            if (event.isComposing || isModifier(event))
                return null;
            const chord = chordOf(event, platform);
            if (chord === null)
                return null;
            if (chord === "text") {
                const def = byCode.get(`text:${event.code}`);
                return def ? decide(def, event, fresh) : null;
            }
            if (chord === "panel" || chord === "shifted") {
                const def = byCode.get(`panel:${event.code}`);
                if (def)
                    return decide(def, event, true);
            }
            if (chord === "shifted") {
                const alias = MAC_SHIFT_ALIASES[event.code];
                if (alias) {
                    const def = HOTKEYS.find((candidate) => candidate.action === alias);
                    if (def)
                        return decide(def, event, fresh);
                }
                if (MAC_SHIFT_SWALLOWED.includes(event.code))
                    return { kind: "swallow", reason: "legacy" };
            }
            return null;
        },
        keyup(event) {
            guard.keyup(event);
        },
        reset() {
            guard.reset();
        },
    };
}
