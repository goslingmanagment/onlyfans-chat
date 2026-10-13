// The desktop's use of the family hotkey scheme (vendored @chatgoose/hotkeys):
// how one keydown resolves before KeymapProvider dispatches it — the scheme's
// engine first, the navigation table second — plus the printed labels.

import { describe, expect, it } from 'vitest';
import { HOTKEYS, type HotkeyEngine } from '@chatgoose/hotkeys';
import {
  SCHEME_KEY_ACTION,
  createDesktopHotkeyEngine,
  resolveDesktopKey,
  schemeAria,
  schemeLabel,
  schemePlatform,
} from '../../src/renderer/src/lib/hotkeyScheme';
import { createKeymap, type KeyEventLike } from '../../src/renderer/src/lib/keymap';
import { KEY_BINDINGS } from '../../src/renderer/src/app/keymapBindings';

const navKeymap = createKeymap(KEY_BINDINGS);

interface Ev {
  code: string;
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
}

function ev(code: string, key: string, mods: Partial<Ev> = {}): Ev {
  return { code, key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods };
}

function asNav(e: Ev): KeyEventLike {
  return { key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: e.shiftKey, inEditable: true };
}

/** Press the platform's command key fresh, then resolve `e` as KeymapProvider does. */
function pressOn(engine: HotkeyEngine, platform: 'darwin' | 'win32', e: Ev) {
  engine.keydown(platform === 'darwin' ? ev('MetaLeft', 'Meta', { metaKey: true }) : ev('ControlLeft', 'Control', { ctrlKey: true }));
  if (e.shiftKey) engine.keydown(ev('ShiftLeft', 'Shift', { metaKey: e.metaKey, ctrlKey: e.ctrlKey, shiftKey: true }));
  return resolveDesktopKey(engine.keydown(e), navKeymap, asNav(e));
}

function press(platform: 'darwin' | 'win32', e: Ev) {
  return pressOn(createDesktopHotkeyEngine(platform), platform, e);
}

describe('scheme → desktop dispatch ids', () => {
  it('maps every scheme action the desktop has; Coach and Notes are reserved', () => {
    for (const def of HOTKEYS) {
      if (def.clients.includes('desktop')) expect(SCHEME_KEY_ACTION[def.action], def.action).not.toBeNull();
    }
    expect(SCHEME_KEY_ACTION.coach).toBeNull();
    expect(SCHEME_KEY_ACTION.notes).toBeNull();
    expect(SCHEME_KEY_ACTION.fix).toBe('ai-improve');
    expect(SCHEME_KEY_ACTION.recap).toBe('ai-scan');
  });
});

describe('keydown resolution', () => {
  it('⌘E / Ctrl+E is Reply — on the Russian layout too (key у, code KeyE)', () => {
    for (const key of ['e', 'у']) {
      expect(press('darwin', ev('KeyE', key, { metaKey: true }))).toEqual({ kind: 'scheme', action: 'ai-reply' });
      expect(press('win32', ev('KeyE', key, { ctrlKey: true }))).toEqual({ kind: 'scheme', action: 'ai-reply' });
    }
  });

  it('text actions sit on the bare command key, panels on ⌘⇧ / Ctrl+Alt', () => {
    expect(press('darwin', ev('KeyI', 'ш', { metaKey: true }))).toEqual({ kind: 'scheme', action: 'ai-improve' });
    expect(press('darwin', ev('KeyP', 'p', { metaKey: true }))).toEqual({ kind: 'scheme', action: 'ai-ping' });
    expect(press('darwin', ev('Period', '.', { metaKey: true }))).toEqual({ kind: 'scheme', action: 'ai-cancel' });
    expect(press('darwin', ev('KeyH', 'h', { metaKey: true, shiftKey: true }))).toEqual({ kind: 'scheme', action: 'ai-help' });
    expect(press('darwin', ev('KeyB', 'b', { metaKey: true, shiftKey: true }))).toEqual({ kind: 'scheme', action: 'ai-review' });
    expect(press('darwin', ev('KeyL', 'l', { metaKey: true, shiftKey: true }))).toEqual({ kind: 'scheme', action: 'ai-split' });
    expect(press('darwin', ev('KeyM', 'm', { metaKey: true, shiftKey: true }))).toEqual({ kind: 'scheme', action: 'spenders' });
    expect(press('win32', ev('KeyS', 's', { ctrlKey: true, altKey: true }))).toEqual({ kind: 'scheme', action: 'ai-scan' });
    expect(press('win32', ev('KeyO', 'o', { ctrlKey: true, altKey: true }))).toEqual({ kind: 'scheme', action: 'ai-tone' });
  });

  it('the old desktop AI combos no longer run anything', () => {
    for (const [code, key] of [['KeyR', 'r'], ['KeyH', 'h'], ['KeyS', 's'], ['KeyT', 't']] as const) {
      expect(press('darwin', ev(code, key, { metaKey: true }))).toEqual({ kind: 'none' });
      expect(press('win32', ev(code, key, { ctrlKey: true }))).toEqual({ kind: 'none' });
    }
    // ⌘E used to be Chat review; it is Reply now, never Review.
    expect(press('darwin', ev('KeyE', 'e', { metaKey: true }))).not.toEqual({ kind: 'scheme', action: 'ai-review' });
  });

  it('auto-repeat is swallowed, never dispatched again', () => {
    const engine = createDesktopHotkeyEngine('darwin');
    expect(pressOn(engine, 'darwin', ev('KeyE', 'e', { metaKey: true }))).toEqual({ kind: 'scheme', action: 'ai-reply' });
    expect(resolveDesktopKey(engine.keydown(ev('KeyE', 'e', { metaKey: true, repeat: true })), navKeymap, asNav(ev('KeyE', 'e', { metaKey: true }))))
      .toEqual({ kind: 'swallow' });
  });

  it('a Windows Ctrl+Shift language switch rolled into E is swallowed, not a Reply', () => {
    const engine = createDesktopHotkeyEngine('win32');
    engine.keydown(ev('ControlLeft', 'Control', { ctrlKey: true }));
    engine.keydown(ev('ShiftLeft', 'Shift', { ctrlKey: true, shiftKey: true }));
    engine.keyup(ev('ShiftLeft', 'Shift', { ctrlKey: true }));
    const e = ev('KeyE', 'у', { ctrlKey: true });
    expect(resolveDesktopKey(engine.keydown(e), navKeymap, asNav(e))).toEqual({ kind: 'swallow' });
  });

  it('reserved Coach and Notes and the macOS legacy ⌘⇧D / ⌘⇧F are swallowed', () => {
    expect(press('darwin', ev('KeyC', 'c', { metaKey: true, shiftKey: true }))).toEqual({ kind: 'swallow' });
    // ⌘⇧K is the Fansly extension's Notes; ⌘K (palette) stays navigation.
    expect(press('darwin', ev('KeyK', 'k', { metaKey: true, shiftKey: true }))).toEqual({ kind: 'swallow' });
    expect(press('win32', ev('KeyK', 'k', { ctrlKey: true, altKey: true }))).toEqual({ kind: 'swallow' });
    expect(press('darwin', ev('KeyD', 'd', { metaKey: true, shiftKey: true }))).toEqual({ kind: 'swallow' });
    expect(press('darwin', ev('KeyF', 'f', { metaKey: true, shiftKey: true }))).toEqual({ kind: 'swallow' });
  });

  it('navigation still resolves through the table', () => {
    expect(press('darwin', ev('KeyK', 'k', { metaKey: true }))).toEqual({ kind: 'nav', action: 'palette' });
    expect(press('darwin', ev('Digit3', '3', { metaKey: true }))).toEqual({ kind: 'nav', action: 'chat-jump-3' });
    expect(press('win32', ev('KeyU', 'u', { ctrlKey: true }))).toEqual({ kind: 'nav', action: 'next-unread' });
  });
});

describe('labels', () => {
  it('maps process.platform onto the scheme platform', () => {
    expect(schemePlatform('darwin')).toBe('mac');
    expect(schemePlatform('win32')).toBe('win');
    expect(schemePlatform('linux')).toBe('win');
  });

  it('prints ⌘ only on macOS', () => {
    expect(schemeLabel('reply', 'darwin')).toBe('⌘E');
    expect(schemeLabel('help', 'darwin')).toBe('⌘⇧H');
    expect(schemeLabel('reply', 'win32')).toBe('Ctrl+E');
    expect(schemeLabel('help', 'win32')).toBe('Ctrl+Alt+H');
    for (const def of HOTKEYS) expect(schemeLabel(def.action, 'win32')).not.toContain('⌘');
    expect(schemeAria('spenders', 'darwin')).toBe('Meta+Shift+M');
    expect(schemeAria('split', 'win32')).toBe('Control+Alt+L');
  });
});
