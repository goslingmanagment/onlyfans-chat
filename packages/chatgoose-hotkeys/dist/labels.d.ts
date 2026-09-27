import { type HotkeyAction, type HotkeyLevel, type HotkeyPlatform } from "./scheme";
/** Modifier prefixes as printed, per platform and level. */
export declare const HOTKEY_MODIFIER_LABELS: Readonly<Record<HotkeyPlatform, Readonly<Record<HotkeyLevel, string>>>>;
/** The full combo: "⌘E", "⌘⇧H", "Ctrl+E", "Ctrl+Alt+H". */
export declare function hotkeyLabel(action: HotkeyAction, platform: HotkeyPlatform): string;
/** The compact chip for a toolbar button: the bare key for the text level
 * (every text combo shares one modifier), "⇧H" / "Alt+H" for the panel level. */
export declare function hotkeyChip(action: HotkeyAction, platform: HotkeyPlatform): string;
/** The value for the aria-keyshortcuts attribute (WAI-ARIA key names). */
export declare function hotkeyAriaShortcut(action: HotkeyAction, platform: HotkeyPlatform): string;
