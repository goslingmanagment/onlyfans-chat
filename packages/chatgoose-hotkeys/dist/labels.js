import { hotkeyDef } from "./scheme";
/** Modifier prefixes as printed, per platform and level. */
export const HOTKEY_MODIFIER_LABELS = {
    mac: { text: "⌘", panel: "⌘⇧" },
    win: { text: "Ctrl+", panel: "Ctrl+Alt+" },
};
/** The full combo: "⌘E", "⌘⇧H", "Ctrl+E", "Ctrl+Alt+H". */
export function hotkeyLabel(action, platform) {
    const def = hotkeyDef(action);
    return `${HOTKEY_MODIFIER_LABELS[platform][def.level]}${def.key}`;
}
/** The compact chip for a toolbar button: the bare key for the text level
 * (every text combo shares one modifier), "⇧H" / "Alt+H" for the panel level. */
export function hotkeyChip(action, platform) {
    const def = hotkeyDef(action);
    if (def.level === "text")
        return def.key;
    return platform === "mac" ? `⇧${def.key}` : `Alt+${def.key}`;
}
/** The value for the aria-keyshortcuts attribute (WAI-ARIA key names). */
export function hotkeyAriaShortcut(action, platform) {
    const def = hotkeyDef(action);
    const modifiers = platform === "mac"
        ? (def.level === "text" ? ["Meta"] : ["Meta", "Shift"])
        : (def.level === "text" ? ["Control"] : ["Control", "Alt"]);
    return [...modifiers, def.key].join("+");
}
