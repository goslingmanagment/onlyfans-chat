import { describe, expect, it } from 'vitest';
import {
  createKeymap,
  eventMatchesCombo,
  parseCombo,
  type KeyBinding,
  type KeyEventLike,
} from '../../src/renderer/src/lib/keymap';

function ev(overrides: Partial<KeyEventLike>): KeyEventLike {
  return {
    key: '',
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    inEditable: false,
    ...overrides,
  };
}

describe('parseCombo', () => {
  it('parses a bare key', () => {
    expect(parseCombo('j')).toEqual({ key: 'j', mod: false, shift: false, alt: false });
  });

  it('parses mod combos', () => {
    expect(parseCombo('mod+k')).toEqual({ key: 'k', mod: true, shift: false, alt: false });
  });

  it('parses shift combos', () => {
    expect(parseCombo('shift+x')).toEqual({ key: 'x', mod: false, shift: true, alt: false });
  });
});

describe('eventMatchesCombo', () => {
  it('matches mod+k with meta (mac)', () => {
    expect(eventMatchesCombo(ev({ key: 'k', metaKey: true }), 'mod+k')).toBe(true);
  });

  it('matches mod+k with ctrl (win/linux)', () => {
    expect(eventMatchesCombo(ev({ key: 'k', ctrlKey: true }), 'mod+k')).toBe(true);
  });

  it('rejects mod+k without a modifier', () => {
    expect(eventMatchesCombo(ev({ key: 'k' }), 'mod+k')).toBe(false);
  });

  it('rejects a bare key when a modifier is held', () => {
    expect(eventMatchesCombo(ev({ key: 'j', metaKey: true }), 'j')).toBe(false);
  });

  it('is case-insensitive on the key', () => {
    expect(eventMatchesCombo(ev({ key: 'K', metaKey: true }), 'mod+k')).toBe(true);
  });

  it('ignores shift for punctuation keys like ?', () => {
    expect(eventMatchesCombo(ev({ key: '?', shiftKey: true }), '?')).toBe(true);
  });

  it('matches bracket keys', () => {
    expect(eventMatchesCombo(ev({ key: ']' }), ']')).toBe(true);
    expect(eventMatchesCombo(ev({ key: '[' }), '[')).toBe(true);
  });

  it('requires shift to be absent for letters unless declared', () => {
    expect(eventMatchesCombo(ev({ key: 'j', shiftKey: true }), 'j')).toBe(false);
  });

  it('rejects alt unless declared', () => {
    expect(eventMatchesCombo(ev({ key: 'j', altKey: true }), 'j')).toBe(false);
  });

  it('matches named keys', () => {
    expect(eventMatchesCombo(ev({ key: 'Escape' }), 'escape')).toBe(true);
    expect(eventMatchesCombo(ev({ key: 'Enter' }), 'enter')).toBe(true);
  });
});

describe('createKeymap', () => {
  const bindings: KeyBinding<'palette' | 'next' | 'dismiss' | 'sheet'>[] = [
    { action: 'palette', combo: 'mod+k', label: '⌘K', description: 'palette' },
    { action: 'next', combo: 'j', label: 'J', description: 'next chat' },
    { action: 'dismiss', combo: 'escape', label: 'Esc', description: 'dismiss' },
    { action: 'sheet', combo: '?', label: '?', description: 'cheatsheet' },
  ];
  const keymap = createKeymap(bindings);

  it('resolves a matching binding', () => {
    expect(keymap.resolve(ev({ key: 'j' }))).toBe('next');
  });

  it('returns null when nothing matches', () => {
    expect(keymap.resolve(ev({ key: 'x' }))).toBeNull();
  });

  it('blocks bare keys while typing in an input', () => {
    expect(keymap.resolve(ev({ key: 'j', inEditable: true }))).toBeNull();
    expect(keymap.resolve(ev({ key: '?', shiftKey: true, inEditable: true }))).toBeNull();
  });

  it('allows mod combos while typing', () => {
    expect(keymap.resolve(ev({ key: 'k', metaKey: true, inEditable: true }))).toBe('palette');
  });

  it('allows escape while typing', () => {
    expect(keymap.resolve(ev({ key: 'Escape', inEditable: true }))).toBe('dismiss');
  });

  it('honors allowInEditable overrides', () => {
    const km = createKeymap([
      { action: 'next', combo: 'j', label: 'J', description: '', allowInEditable: true },
    ]);
    expect(km.resolve(ev({ key: 'j', inEditable: true }))).toBe('next');
  });

  it('returns the first matching binding', () => {
    const km = createKeymap([
      { action: 'first', combo: 'j', label: 'J', description: '' },
      { action: 'second', combo: 'j', label: 'J', description: '' },
    ]);
    expect(km.resolve(ev({ key: 'j' }))).toBe('first');
  });
});
