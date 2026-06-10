// The single hotkey table (DESIGN §2). P2+ entries appear in the cheatsheet
// as upcoming but are not registered here.

import type { KeyBinding } from '../lib/keymap';

export type KeyAction =
  | 'palette'
  | 'next-chat'
  | 'prev-chat'
  | 'next-unread'
  | 'focus-composer'
  | 'dismiss'
  | 'toggle-panel'
  | 'toggle-list'
  | 'cheatsheet';

export const KEY_BINDINGS: KeyBinding<KeyAction>[] = [
  { action: 'palette', combo: 'mod+k', label: '⌘K', description: 'Command palette — jump to chat, fan or action' },
  { action: 'next-unread', combo: 'mod+u', label: '⌘U', description: 'Next unread chat' },
  { action: 'next-chat', combo: 'j', label: 'J', description: 'Next chat' },
  { action: 'prev-chat', combo: 'k', label: 'K', description: 'Previous chat' },
  { action: 'focus-composer', combo: 'enter', label: '↵', description: 'Focus composer' },
  { action: 'dismiss', combo: 'escape', label: 'Esc', description: 'Blur / dismiss overlay' },
  { action: 'toggle-panel', combo: ']', label: ']', description: 'Toggle fan panel' },
  { action: 'toggle-list', combo: '[', label: '[', description: 'Toggle chat list' },
  { action: 'cheatsheet', combo: '?', label: '?', description: 'Hotkey cheatsheet' },
];

/** Shown dimmed in the cheatsheet — wired by later phases. */
export const UPCOMING_BINDINGS: ReadonlyArray<{ label: string; description: string; phase: string }> = [
  { label: '⌘R / ⌘I / ⌘H', description: 'Fast Reply / Improve Draft / Help Me', phase: 'P2' },
  { label: '⌘P / ⌘G', description: 'Ping / Hi greeting', phase: 'P4' },
  { label: '⌘E / ⌘S', description: 'Chat review / Scan (fan summary)', phase: 'P4' },
  { label: '⌘1…9 / ⌘0', description: 'Insert AI part N / insert all parts', phase: 'P2' },
  { label: '⌘T', description: 'Cycle tone (casual / flirty / upsell / spicy)', phase: 'P2' },
  { label: '⌘.', description: 'Cancel running AI operation', phase: 'P2' },
  { label: '⌘↵', description: 'Send', phase: 'P3' },
];
