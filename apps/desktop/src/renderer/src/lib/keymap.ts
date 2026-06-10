// Single keymap registry (DESIGN §2: centralized, no scattered listeners).
// Pure matching logic — the React provider feeds real KeyboardEvents through
// `toEventLike` and dispatches the resolved action id.

export interface KeyEventLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  /** Focus is inside an input/textarea/contenteditable. */
  inEditable: boolean;
}

export interface KeyBinding<A extends string = string> {
  action: A;
  /** 'mod+k' | 'j' | '[' | '?' | 'escape' | 'enter' — mod = ⌘ or Ctrl. */
  combo: string;
  /** Display form for the cheatsheet, e.g. '⌘K'. */
  label: string;
  description: string;
  /** Fire even while typing in an input (mod-combos and Escape always do). */
  allowInEditable?: boolean;
  /** Registered but not listed (e.g. ⌘1..⌘9 — shown as one cheatsheet row). */
  hideFromCheatsheet?: boolean;
}

interface ParsedCombo {
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

export function parseCombo(combo: string): ParsedCombo {
  const parts = combo.toLowerCase().split('+');
  const key = parts[parts.length - 1] ?? '';
  return {
    key,
    mod: parts.includes('mod'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
  };
}

const SHIFT_AGNOSTIC = /^[^a-z0-9]$/; // punctuation like '?', '[', ']' — shift is part of the char

export function eventMatchesCombo(ev: KeyEventLike, combo: string): boolean {
  const parsed = parseCombo(combo);
  const evKey = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key.toLowerCase();
  if (evKey !== parsed.key) return false;
  const evMod = ev.metaKey || ev.ctrlKey;
  if (parsed.mod !== evMod) return false;
  if (ev.altKey !== parsed.alt) return false;
  if (!SHIFT_AGNOSTIC.test(parsed.key) && ev.shiftKey !== parsed.shift) return false;
  return true;
}

export interface Keymap<A extends string = string> {
  bindings: readonly KeyBinding<A>[];
  /** First matching binding's action, honoring editable gating; null = no match. */
  resolve(ev: KeyEventLike): A | null;
}

export function createKeymap<A extends string>(bindings: KeyBinding<A>[]): Keymap<A> {
  return {
    bindings,
    resolve(ev) {
      for (const binding of bindings) {
        if (!eventMatchesCombo(ev, binding.combo)) continue;
        if (ev.inEditable) {
          const parsed = parseCombo(binding.combo);
          const allowed = binding.allowInEditable === true || parsed.mod || parsed.key === 'escape';
          if (!allowed) continue;
        }
        return binding.action;
      }
      return null;
    },
  };
}
