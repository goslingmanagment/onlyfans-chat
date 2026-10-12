/** The one ChatGoose hotkey table, shared by the Fansly extension and the
 * OnlyFans desktop app (vendored into both by scripts/vendor-hotkeys.mjs).
 *
 * Two levels, identical in both clients:
 * - "text": everything that writes into the reply field (Reply, Fix, Hi,
 *   Ping) plus Cancel — Cmd+key on macOS, Ctrl+key on Windows.
 * - "panel": analysis, panels and toggles — Cmd+Shift+key on macOS,
 *   Ctrl+Alt+key on Windows (Ctrl+Shift and Alt+Shift switch the input
 *   language on the team's Windows machines, so neither can carry hotkeys).
 *
 * Keys are matched by KeyboardEvent.code (the physical key), so the scheme
 * works on the Russian layout without switching it. The letter choices and
 * the platform constraints behind them live in README.md. */
export type HotkeyPlatform = "mac" | "win";
/** "extension" rows run in both extensions (Fansly and ChatSpace); "fansly"
 * is the Fansly extension, which runs every "extension" row plus the rows
 * only it has (see `servesClient`). */
export type HotkeyClient = "extension" | "desktop" | "fansly";
export type HotkeyLevel = "text" | "panel";
export type HotkeyAction = "reply" | "fix" | "hi" | "ping" | "cancel" | "help" | "recap" | "tone" | "review" | "split" | "spenders" | "coach" | "notes";
export interface HotkeyDef {
    readonly action: HotkeyAction;
    readonly level: HotkeyLevel;
    /** KeyboardEvent.code of the physical key. */
    readonly code: string;
    /** The Latin keycap, as printed in labels. */
    readonly key: string;
    /** The same physical key on the Russian ЙЦУКЕН layout. */
    readonly ruKey: string;
    readonly clients: readonly HotkeyClient[];
    readonly name: {
        readonly ru: string;
        readonly en: string;
    };
    /** The feature's name in a client that calls it differently. */
    readonly clientName?: Partial<Record<HotkeyClient, string>>;
    /** Subject to the roll-over guard (see engine.ts). Cancel is exempt:
     * "Cmd+E, then . under the same Cmd" must stop the run it started. */
    readonly guarded: boolean;
}
/** Bumped whenever an assignment changes; both clients must ship the same value. */
export declare const HOTKEY_SCHEME_VERSION = 2;
export declare const HOTKEYS: readonly HotkeyDef[];
/** macOS only: the extension's pre-v1 Cmd+Shift habits (both clients honour
 * them, since the desktop users also work in the extension).
 * - Cmd+Shift on a text-level letter that kept its letter means the same
 *   action ("Shift doesn't matter for E, I, G").
 * - Cmd+Shift+X stays Cancel: unbound, Firefox would flip the reply field's
 *   text direction (browser-sets.inc.xhtml key_switchTextDirection).
 * - Cmd+Shift+D (old Ping) and Cmd+Shift+F (old Fix) are swallowed in the
 *   ChatGoose context: an old habit must never start a paid run, nor open
 *   Firefox's bookmark-all-tabs dialog or full screen. */
export declare const MAC_SHIFT_ALIASES: Readonly<Record<string, HotkeyAction>>;
export declare const MAC_SHIFT_SWALLOWED: readonly string[];
/** Codes no assignment may take, with the reason. Pinned by the hub test. */
export declare const FORBIDDEN_CODES: Readonly<Record<HotkeyLevel, Readonly<Record<string, string>>>>;
export declare function hotkeyDef(action: HotkeyAction): HotkeyDef;
/** Whether a row is live in a client. The Fansly extension is also an
 * "extension": it runs those rows too. Elsewhere a row's key is reserved. */
export declare function servesClient(def: HotkeyDef, client: HotkeyClient): boolean;
export declare function hotkeysForClient(client: HotkeyClient): readonly HotkeyDef[];
/** The feature name shown in the given client. */
export declare function hotkeyName(def: HotkeyDef, client: HotkeyClient, locale?: "ru" | "en"): string;
/** True for the macOS key scheme. The parameter is deliberately not called
 * `platform`: the hub's platform-branch ratchet (scripts/check-platform-branches.mjs)
 * counts Fansly/OnlyFans branches by that name, and an OS check is not one. */
export declare function isMacKeys(os: HotkeyPlatform): boolean;
/** "mac" for Apple platforms, "win" for everything else (Ctrl is the command key). */
export declare function detectHotkeyPlatform(platform: string | null | undefined): HotkeyPlatform;
