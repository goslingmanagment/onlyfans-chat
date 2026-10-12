// The desktop side of the family hotkey scheme (vendored @chatgoose/hotkeys,
// spec: hub packages/chatgoose-hotkeys/README.md). The package owns the AI and
// panel combos — text actions on Cmd/Ctrl + key, panels on Cmd+Shift /
// Ctrl+Alt + key, matched by physical key — identically to the Fansly
// extension. This module only maps its actions onto the desktop's dispatch
// ids and prints labels; navigation stays in app/keymapBindings.ts.

import {
  createHotkeyEngine,
  detectHotkeyPlatform,
  hotkeyAriaShortcut,
  hotkeyLabel,
  type HotkeyAction,
  type HotkeyDecision,
  type HotkeyEngine,
  type HotkeyPlatform,
} from '@chatgoose/hotkeys';
import { appPlatform, type LabelPlatform } from './modKey';
import type { KeyEventLike, Keymap } from './keymap';

/** Dispatch ids of the scheme's actions (KeymapProvider switches on these). */
export type SchemeKeyAction =
  | 'ai-reply'
  | 'ai-improve'
  | 'ai-help'
  | 'ai-ping'
  | 'ai-hi'
  | 'ai-review'
  | 'ai-scan'
  | 'ai-tone'
  | 'ai-cancel'
  | 'ai-split'
  | 'spenders';

/** The scheme platform for a process.platform value ('darwin' → mac, else win). */
export function schemePlatform(platform: LabelPlatform = appPlatform()): HotkeyPlatform {
  return detectHotkeyPlatform(platform);
}

/** Package action → the desktop's dispatch id. Coach and Notes have no
 * desktop feature: their letters are reserved (the engine swallows them), so
 * they map to null. */
export const SCHEME_KEY_ACTION: Readonly<Record<HotkeyAction, SchemeKeyAction | null>> = {
  reply: 'ai-reply',
  fix: 'ai-improve',
  hi: 'ai-hi',
  ping: 'ai-ping',
  cancel: 'ai-cancel',
  help: 'ai-help',
  recap: 'ai-scan',
  tone: 'ai-tone',
  review: 'ai-review',
  split: 'ai-split',
  spenders: 'spenders',
  coach: null,
  notes: null,
};

/** "⌘E" / "Ctrl+E", "⌘⇧H" / "Ctrl+Alt+H" — every printed AI/panel combo goes
 * through here (never hardcode ⌘; navigation labels use lib/modKey). */
export function schemeLabel(action: HotkeyAction, platform: LabelPlatform = appPlatform()): string {
  return hotkeyLabel(action, schemePlatform(platform));
}

export function schemeAria(action: HotkeyAction, platform: LabelPlatform = appPlatform()): string {
  return hotkeyAriaShortcut(action, schemePlatform(platform));
}

export function createDesktopHotkeyEngine(platform: LabelPlatform = appPlatform()): HotkeyEngine {
  return createHotkeyEngine({ platform: schemePlatform(platform), client: 'desktop' });
}

/** What one keydown resolves to, before any view-specific dispatch:
 * - scheme: a scheme combo mapped to a desktop id (run it);
 * - swallow: a scheme combo that must do nothing now (auto-repeat, legacy
 *   habit, roll-over after a language switch, reserved Coach) — preventDefault;
 * - nav: a navigation/send/panel binding from keymapBindings;
 * - none: not ours. */
export type ResolvedKey<A extends string> =
  | { readonly kind: 'scheme'; readonly action: SchemeKeyAction }
  | { readonly kind: 'swallow' }
  | { readonly kind: 'nav'; readonly action: A }
  | { readonly kind: 'none' };

export function resolveDesktopKey<A extends string>(
  decision: HotkeyDecision | null,
  navKeymap: Keymap<A>,
  event: KeyEventLike,
): ResolvedKey<A> {
  if (decision !== null) {
    if (decision.kind === 'swallow' || decision.repeat) return { kind: 'swallow' };
    const action = SCHEME_KEY_ACTION[decision.action];
    return action === null ? { kind: 'swallow' } : { kind: 'scheme', action };
  }
  const nav = navKeymap.resolve(event);
  return nav === null ? { kind: 'none' } : { kind: 'nav', action: nav };
}

