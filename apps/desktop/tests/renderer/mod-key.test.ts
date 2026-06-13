// Hotkey-label platform seam (PLAN item 11): labels render ⌘ on darwin and
// Ctrl+ everywhere else; combos/matching stay identical. Tests pin BOTH
// renderings by injecting the platform — never by weakening the mac pins.

import { describe, expect, it } from 'vitest';
import { appPlatform, modCombo, modKeyLabel } from '../../src/renderer/src/lib/modKey';
import {
  buildCheatsheetExtras,
  buildKeyBindings,
  KEY_BINDINGS,
} from '../../src/renderer/src/app/keymapBindings';

describe('modKey seam', () => {
  it('node test env (no window/navigator) defaults to darwin — the historical pins', () => {
    expect(appPlatform()).toBe('darwin');
    expect(modKeyLabel()).toBe('⌘');
  });

  it('renders the mod key per platform', () => {
    expect(modKeyLabel('darwin')).toBe('⌘');
    expect(modKeyLabel('win32')).toBe('Ctrl');
    expect(modKeyLabel('linux')).toBe('Ctrl');
  });

  it('renders full combos per platform', () => {
    expect(modCombo('K', 'darwin')).toBe('⌘K');
    expect(modCombo('K', 'win32')).toBe('Ctrl+K');
    expect(modCombo('↵', 'win32')).toBe('Ctrl+↵');
    expect(modCombo(',', 'win32')).toBe('Ctrl+,');
  });
});

describe('buildKeyBindings per platform', () => {
  it('darwin build matches the exported default in the node test env', () => {
    expect(buildKeyBindings('darwin')).toEqual(KEY_BINDINGS);
  });

  it('win32 build has no ⌘ anywhere and labels every mod combo with Ctrl+', () => {
    const bindings = buildKeyBindings('win32');
    for (const binding of bindings) {
      expect(binding.label).not.toContain('⌘');
      if (binding.combo.startsWith('mod+')) {
        expect(binding.label.startsWith('Ctrl+')).toBe(true);
      }
    }
  });

  it('only the labels differ between platforms — combos, actions, order identical', () => {
    const mac = buildKeyBindings('darwin');
    const win = buildKeyBindings('win32');
    expect(win.map((b) => b.action)).toEqual(mac.map((b) => b.action));
    expect(win.map((b) => b.combo)).toEqual(mac.map((b) => b.combo));
    expect(win.map((b) => b.description)).toEqual(mac.map((b) => b.description));
  });

  it('non-mod labels are platform-independent', () => {
    const win = new Map(buildKeyBindings('win32').map((b) => [b.action, b.label]));
    expect(win.get('next-chat')).toBe('J');
    expect(win.get('focus-composer')).toBe('↵');
    expect(win.get('dismiss')).toBe('Esc');
    expect(win.get('board-preview')).toBe('SPACE');
  });

  it('cheatsheet extras follow the platform', () => {
    expect(buildCheatsheetExtras('darwin')[0]?.label).toBe('⌘1…9');
    expect(buildCheatsheetExtras('win32')[0]?.label).toBe('Ctrl+1…9');
  });
});
