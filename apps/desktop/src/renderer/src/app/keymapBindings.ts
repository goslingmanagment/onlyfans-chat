// The single hotkey table (DESIGN §2). Later-phase entries appear in the
// cheatsheet as upcoming but are not registered here.

import type { KeyBinding } from '../lib/keymap';

export type AiCopyAction =
  | 'ai-copy-0'
  | 'ai-copy-1'
  | 'ai-copy-2'
  | 'ai-copy-3'
  | 'ai-copy-4'
  | 'ai-copy-5'
  | 'ai-copy-6'
  | 'ai-copy-7'
  | 'ai-copy-8'
  | 'ai-copy-9';

export type KeyAction =
  | 'palette'
  | 'next-chat'
  | 'prev-chat'
  | 'next-unread'
  | 'focus-composer'
  | 'dismiss'
  | 'toggle-panel'
  | 'toggle-list'
  | 'cheatsheet'
  | 'ai-reply'
  | 'ai-improve'
  | 'ai-help'
  | 'ai-tone'
  | 'ai-cancel'
  | AiCopyAction;

const AI_COPY_PART_ACTIONS = [
  'ai-copy-1',
  'ai-copy-2',
  'ai-copy-3',
  'ai-copy-4',
  'ai-copy-5',
  'ai-copy-6',
  'ai-copy-7',
  'ai-copy-8',
  'ai-copy-9',
] as const satisfies readonly AiCopyAction[];

const AI_COPY_PART_BINDINGS: KeyBinding<KeyAction>[] = AI_COPY_PART_ACTIONS.map((action, i) => ({
  action,
  combo: `mod+${i + 1}`,
  label: `⌘${i + 1}`,
  description: `Copy AI draft part ${i + 1}`,
  hideFromCheatsheet: true,
}));

export const KEY_BINDINGS: KeyBinding<KeyAction>[] = [
  { action: 'palette', combo: 'mod+k', label: '⌘K', description: 'Command palette — jump to chat, fan or action' },
  { action: 'next-unread', combo: 'mod+u', label: '⌘U', description: 'Next unread chat' },
  { action: 'next-chat', combo: 'j', label: 'J', description: 'Next chat' },
  { action: 'prev-chat', combo: 'k', label: 'K', description: 'Previous chat' },
  { action: 'focus-composer', combo: 'enter', label: '↵', description: 'Focus composer' },
  { action: 'dismiss', combo: 'escape', label: 'Esc', description: 'Blur / dismiss AI dock or overlay' },
  { action: 'toggle-panel', combo: ']', label: ']', description: 'Toggle fan panel' },
  { action: 'toggle-list', combo: '[', label: '[', description: 'Toggle chat list' },
  { action: 'cheatsheet', combo: '?', label: '?', description: 'Hotkey cheatsheet' },
  { action: 'ai-reply', combo: 'mod+r', label: '⌘R', description: 'Fast Reply (AI suggestion)' },
  { action: 'ai-improve', combo: 'mod+i', label: '⌘I', description: 'Improve draft (AI)' },
  { action: 'ai-help', combo: 'mod+h', label: '⌘H', description: 'Help me (AI coaching)' },
  { action: 'ai-tone', combo: 'mod+t', label: '⌘T', description: 'Cycle tone (casual / flirty / upsell / spicy)' },
  { action: 'ai-cancel', combo: 'mod+.', label: '⌘.', description: 'Cancel running AI operation' },
  { action: 'ai-copy-0', combo: 'mod+0', label: '⌘0', description: 'Copy all AI draft parts' },
  ...AI_COPY_PART_BINDINGS,
];

/** Collapsed cheatsheet rows for hidden bindings. */
export const CHEATSHEET_EXTRAS: ReadonlyArray<{ label: string; description: string }> = [
  { label: '⌘1…9', description: 'Copy AI draft part N (or click the bubble)' },
];

/** Shown dimmed in the cheatsheet — wired by later phases. */
export const UPCOMING_BINDINGS: ReadonlyArray<{ label: string; description: string; phase: string }> = [
  { label: '⌘P / ⌘G', description: 'Ping / Hi greeting', phase: 'P4' },
  { label: '⌘E / ⌘S', description: 'Chat review / Scan (fan summary)', phase: 'P4' },
  { label: '⌘↵', description: 'Send', phase: 'P3' },
];
