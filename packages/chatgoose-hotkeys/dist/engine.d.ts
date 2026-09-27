import { type HotkeyAction, type HotkeyClient, type HotkeyPlatform } from "./scheme";
/** The fields of a DOM KeyboardEvent the engine reads. */
export interface HotkeyKeyEvent {
    readonly code: string;
    readonly key: string;
    readonly metaKey: boolean;
    readonly ctrlKey: boolean;
    readonly altKey: boolean;
    readonly shiftKey: boolean;
    readonly repeat?: boolean;
    readonly isComposing?: boolean;
}
/**
 * - "action": run it — unless `repeat` is true, in which case the client
 *   swallows the key (preventDefault) and does NOT run the action again.
 * - "swallow": the combo belongs to ChatGoose but must do nothing now —
 *   a retired habit ("legacy"), a roll-over after an input-language switch
 *   ("rollover"), or a letter reserved in this client ("reserved"). Inside
 *   the ChatGoose context the client calls preventDefault and stops.
 */
export type HotkeyDecision = {
    readonly kind: "action";
    readonly action: HotkeyAction;
    readonly repeat: boolean;
} | {
    readonly kind: "swallow";
    readonly reason: "legacy" | "rollover" | "reserved";
};
export interface HotkeyEngine {
    /** Feed EVERY keydown (modifiers included) in capture order. */
    keydown(event: HotkeyKeyEvent): HotkeyDecision | null;
    /** Feed every keyup. */
    keyup(event: HotkeyKeyEvent): void;
    /** Call on window blur / visibility loss. */
    reset(): void;
}
export interface HotkeyEngineOptions {
    readonly platform: HotkeyPlatform;
    readonly client: HotkeyClient;
}
export declare function createHotkeyEngine(options: HotkeyEngineOptions): HotkeyEngine;
