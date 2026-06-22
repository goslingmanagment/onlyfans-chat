// The hotkey table itself (DESIGN §2): the P4 deep-AI keys are registered,
// resolve through the central keymap (including from the composer textarea),
// and no combo is double-bound.

import { describe, expect, it } from 'vitest';
import { createKeymap, parseCombo, type KeyEventLike } from '../../src/renderer/src/lib/keymap';
import { KEY_BINDINGS, UPCOMING_BINDINGS } from '../../src/renderer/src/app/keymapBindings';

const keymap = createKeymap(KEY_BINDINGS);

function mod(key: string, inEditable = false): KeyEventLike {
  return { key, metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, inEditable };
}

describe('deep-AI key bindings (⌘P / ⌘G / ⌘E / ⌘S)', () => {
  it.each([
    ['p', 'ai-ping'],
    ['g', 'ai-hi'],
    ['e', 'ai-review'],
    ['s', 'ai-scan'],
  ] as const)('⌘%s resolves to %s', (key, action) => {
    expect(keymap.resolve(mod(key))).toBe(action);
  });

  it('fires from inside the composer (mod combos pass the editable gate)', () => {
    expect(keymap.resolve(mod('p', true))).toBe('ai-ping');
    expect(keymap.resolve(mod('s', true))).toBe('ai-scan');
  });

  it('bare keys do not trigger the AI actions', () => {
    expect(keymap.resolve({ key: 'p', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, inEditable: false })).toBeNull();
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

describe('binding table hygiene', () => {
  it('no combo is bound twice', () => {
    const combos = KEY_BINDINGS.map((b) => {
      const parsed = parseCombo(b.combo);
      return `${parsed.mod ? 'mod+' : ''}${parsed.alt ? 'alt+' : ''}${parsed.shift ? 'shift+' : ''}${parsed.key}`;
    });
    expect(new Set(combos).size).toBe(combos.length);
  });

  it('the former P4 upcoming entries are now live bindings', () => {
    expect(UPCOMING_BINDINGS).toHaveLength(0);
    const actions = KEY_BINDINGS.map((b) => b.action);
    expect(actions).toEqual(
      expect.arrayContaining(['ai-ping', 'ai-hi', 'ai-review', 'ai-scan']),
    );
  });
});
