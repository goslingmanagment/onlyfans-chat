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
/** Bumped whenever an assignment changes; both clients must ship the same value. */
export const HOTKEY_SCHEME_VERSION = 2;
const BOTH = ["extension", "desktop"];
export const HOTKEYS = [
    { action: "reply", level: "text", code: "KeyE", key: "E", ruKey: "У", clients: BOTH, name: { ru: "Ответ", en: "Reply" }, guarded: true },
    { action: "fix", level: "text", code: "KeyI", key: "I", ruKey: "Ш", clients: BOTH, name: { ru: "Исправить черновик", en: "Fix" }, clientName: { desktop: "Improve" }, guarded: true },
    { action: "hi", level: "text", code: "KeyG", key: "G", ruKey: "П", clients: BOTH, name: { ru: "Приветствие", en: "Hi" }, guarded: true },
    { action: "ping", level: "text", code: "KeyP", key: "P", ruKey: "З", clients: BOTH, name: { ru: "Пинг", en: "Ping" }, guarded: true },
    { action: "cancel", level: "text", code: "Period", key: ".", ruKey: "Ю", clients: BOTH, name: { ru: "Отменить AI", en: "Cancel AI" }, guarded: false },
    { action: "help", level: "panel", code: "KeyH", key: "H", ruKey: "Р", clients: BOTH, name: { ru: "Разбор ситуации", en: "Help" }, clientName: { desktop: "Help Me" }, guarded: false },
    { action: "recap", level: "panel", code: "KeyS", key: "S", ruKey: "Ы", clients: BOTH, name: { ru: "Сводка по фану", en: "Recap" }, clientName: { desktop: "Scan" }, guarded: false },
    { action: "tone", level: "panel", code: "KeyO", key: "O", ruKey: "Щ", clients: BOTH, name: { ru: "Сменить тон", en: "Tone" }, guarded: false },
    { action: "review", level: "panel", code: "KeyB", key: "B", ruKey: "И", clients: BOTH, name: { ru: "Оценка чата", en: "Review" }, guarded: false },
    { action: "split", level: "panel", code: "KeyL", key: "L", ruKey: "Д", clients: BOTH, name: { ru: "Split — ответ частями", en: "Split" }, guarded: false },
    { action: "spenders", level: "panel", code: "KeyM", key: "M", ruKey: "Ь", clients: BOTH, name: { ru: "Спендеры", en: "Spenders" }, guarded: false },
    { action: "coach", level: "panel", code: "KeyC", key: "C", ruKey: "С", clients: ["extension"], name: { ru: "Coach", en: "Coach" }, guarded: false },
    { action: "notes", level: "panel", code: "KeyK", key: "K", ruKey: "Л", clients: ["fansly"], name: { ru: "Заметки о фане", en: "Notes" }, guarded: false },
];
/** macOS only: the extension's pre-v1 Cmd+Shift habits (both clients honour
 * them, since the desktop users also work in the extension).
 * - Cmd+Shift on a text-level letter that kept its letter means the same
 *   action ("Shift doesn't matter for E, I, G").
 * - Cmd+Shift+X stays Cancel: unbound, Firefox would flip the reply field's
 *   text direction (browser-sets.inc.xhtml key_switchTextDirection).
 * - Cmd+Shift+D (old Ping) and Cmd+Shift+F (old Fix) are swallowed in the
 *   ChatGoose context: an old habit must never start a paid run, nor open
 *   Firefox's bookmark-all-tabs dialog or full screen. */
export const MAC_SHIFT_ALIASES = {
    KeyE: "reply",
    KeyI: "fix",
    KeyG: "hi",
    KeyX: "cancel",
};
export const MAC_SHIFT_SWALLOWED = ["KeyD", "KeyF"];
/** Codes no assignment may take, with the reason. Pinned by the hub test. */
export const FORBIDDEN_CODES = {
    text: {
        KeyN: "Firefox reserves accel+N (new window)",
        KeyT: "Firefox reserves accel+T (new tab)",
        KeyW: "Firefox reserves accel+W (close tab)",
        KeyQ: "quit",
        KeyR: "a missed press reloads Fansly and loses the draft",
        KeyF: "find in page — the chatters use it in Fansly chats",
        KeyH: "macOS hides the app on Cmd+H",
        KeyM: "macOS minimises the window on Cmd+M",
        KeyC: "clipboard",
        KeyV: "clipboard",
        KeyX: "clipboard",
        KeyA: "select all",
        KeyZ: "undo",
        KeyK: "desktop navigation (palette)",
        KeyU: "desktop navigation (next unread)",
        KeyL: "Firefox focuses the address bar",
    },
    panel: {
        KeyP: "Firefox reserves accel+shift+P (private window)",
        KeyW: "Firefox reserves accel+shift+W (close window)",
        KeyQ: "macOS logs out on Cmd+Shift+Q",
        KeyR: "a missed press hard-reloads Fansly and loses the draft",
        KeyT: "Firefox reopens the last closed tab on Cmd+Shift+T",
        KeyF: "Firefox reserves Cmd+Shift+F as exit-fullscreen while in full screen",
        KeyV: "paste as plain text",
        KeyZ: "redo",
        KeyN: "Firefox reopens the last closed window",
        KeyY: "macOS Stickies service on selected text",
        KeyA: "Terminal man-page service on selected text",
    },
};
export function hotkeyDef(action) {
    const def = HOTKEYS.find((candidate) => candidate.action === action);
    if (!def)
        throw new Error(`unknown hotkey action: ${action}`);
    return def;
}
/** Whether a row is live in a client. The Fansly extension is also an
 * "extension": it runs those rows too. Elsewhere a row's key is reserved. */
export function servesClient(def, client) {
    return def.clients.includes(client) || (client === "fansly" && def.clients.includes("extension"));
}
export function hotkeysForClient(client) {
    return HOTKEYS.filter((def) => servesClient(def, client));
}
/** The feature name shown in the given client. */
export function hotkeyName(def, client, locale = "ru") {
    return def.clientName?.[client] ?? def.name[locale];
}
/** True for the macOS key scheme. The parameter is deliberately not called
 * `platform`: the hub's platform-branch ratchet (scripts/check-platform-branches.mjs)
 * counts Fansly/OnlyFans branches by that name, and an OS check is not one. */
export function isMacKeys(os) {
    return os === "mac";
}
/** "mac" for Apple platforms, "win" for everything else (Ctrl is the command key). */
export function detectHotkeyPlatform(platform) {
    return /mac|darwin|iphone|ipad|ipod/i.test(platform ?? "") ? "mac" : "win";
}
