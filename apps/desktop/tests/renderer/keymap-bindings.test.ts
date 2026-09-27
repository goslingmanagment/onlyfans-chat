// The navigation/send/panel hotkey table (DESIGN §2). The AI and panel combos
// left this table for the family scheme (vendored @chatgoose/hotkeys, see
// hotkey-scheme.test.ts): the old bare ⌘R/⌘E/⌘S/⌘T/⌘H rows must be gone so
// nothing here can shadow or duplicate the scheme.

import { describe, expect, it } from 'vitest';
import { createKeymap, parseCombo, type KeyEventLike } from '../../src/renderer/src/lib/keymap';
import { KEY_BINDINGS, UPCOMING_BINDINGS } from '../../src/renderer/src/app/keymapBindings';

const keymap = createKeymap(KEY_BINDINGS);

function mod(key: string, inEditable = false): KeyEventLike {
  return { key, metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, inEditable };
}

describe('AI rows moved to the family scheme', () => {
  it('no AI or scheme action is registered in the navigation table', () => {
    const actions = KEY_BINDINGS.map((b) => b.action as string);
    for (const moved of ['ai-reply', 'ai-improve', 'ai-help', 'ai-ping', 'ai-hi', 'ai-review', 'ai-scan', 'ai-tone', 'ai-cancel', 'ai-split', 'spenders']) {
      expect(actions).not.toContain(moved);
    }
  });

  it.each(['r', 'i', 'h', 'p', 'g', 'e', 's', 't', '.'])('bare ⌘%s resolves to nothing in the navigation table', (key) => {
    expect(keymap.resolve(mod(key))).toBeNull();
  });
});

describe('chat-jump chord (⌘1..⌘9 reclaimed from ai-part-1..9)', () => {
  it.each([
    ['1', 'chat-jump-1'],
    ['5', 'chat-jump-5'],
    ['9', 'chat-jump-9'],
  ] as const)('⌘%s resolves to %s', (key, action) => {
    expect(keymap.resolve(mod(key))).toBe(action);
  });

  it('⌘0 still resolves to ai-part-0 (insert all parts is kept)', () => {
    expect(keymap.resolve(mod('0'))).toBe('ai-part-0');
  });

  it('the old ai-part-1..9 actions are gone from the table', () => {
    const actions = KEY_BINDINGS.map((b) => b.action);
    expect(actions).not.toContain('ai-part-1');
    expect(actions).not.toContain('ai-part-9');
    expect(actions).toContain('ai-part-0');
  });

  it('jumps fire from inside the composer (mod combos pass the editable gate)', () => {
    expect(keymap.resolve(mod('1', true))).toBe('chat-jump-1');
  });
});

describe('navigation stays as it was', () => {
  it.each([
    ['k', 'palette'],
    ['u', 'next-unread'],
    ['enter', 'send'],
    [',', 'settings'],
  ] as const)('⌘%s resolves to %s', (key, action) => {
    expect(keymap.resolve(mod(key === 'enter' ? 'Enter' : key))).toBe(action);
  });
});

describe('binding table hygiene', () => {
  it('no combo is bound twice', () => {
    const combos = KEY_BINDINGS.map((b) => {
      const parsed = parseCombo(b.combo);
      return `${parsed.mod ? 'mod+' : ''}${parsed.alt ? 'alt+' : ''}${parsed.shift ? 'shift+' : ''}${parsed.key}`;
    });
    expect(new Set(combos).size).toBe(combos.length);
  });

  it('nothing is left as upcoming', () => {
    expect(UPCOMING_BINDINGS).toHaveLength(0);
  });
});
