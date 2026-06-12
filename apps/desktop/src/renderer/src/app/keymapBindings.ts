// The single hotkey table (DESIGN §2). Later-phase entries appear in the
// cheatsheet as upcoming but are not registered here.

import type { KeyBinding } from '../lib/keymap';

/** ⌘0..⌘9 — primary dock-part action: insert (copy when sending unavailable, SPEC §7.0). */
export type AiPartAction =
  | 'ai-part-0'
  | 'ai-part-1'
  | 'ai-part-2'
  | 'ai-part-3'
  | 'ai-part-4'
  | 'ai-part-5'
  | 'ai-part-6'
  | 'ai-part-7'
  | 'ai-part-8'
  | 'ai-part-9';

export type KeyAction =
  | 'palette'
  | 'next-chat'
  | 'prev-chat'
  | 'next-unread'
  | 'focus-composer'
  | 'dismiss'
  | 'send'
  | 'toggle-panel'
  | 'toggle-list'
  | 'cheatsheet'
  | 'ai-reply'
  | 'ai-improve'
  | 'ai-help'
  | 'ai-ping'
  | 'ai-hi'
  | 'ai-review'
  | 'ai-scan'
  | 'ai-tone'
  | 'ai-cancel'
  | 'settings'
  | 'board-preview'
  | 'board-open-chat'
  | 'board-back'
  | 'board-stats'
  | AiPartAction;

const AI_PART_ACTIONS = [
  'ai-part-1',
  'ai-part-2',
  'ai-part-3',
  'ai-part-4',
  'ai-part-5',
  'ai-part-6',
  'ai-part-7',
  'ai-part-8',
  'ai-part-9',
] as const satisfies readonly AiPartAction[];

const AI_PART_BINDINGS: KeyBinding<KeyAction>[] = AI_PART_ACTIONS.map((action, i) => ({
  action,
  combo: `mod+${i + 1}`,
  label: `⌘${i + 1}`,
  description: `Insert AI draft part ${i + 1}`,
  hideFromCheatsheet: true,
}));

export const KEY_BINDINGS: KeyBinding<KeyAction>[] = [
  { action: 'palette', combo: 'mod+k', label: '⌘K', description: 'Command palette — jump to chat, fan or action' },
  { action: 'next-unread', combo: 'mod+u', label: '⌘U', description: 'Next unread chat' },
  { action: 'next-chat', combo: 'j', label: 'J', description: 'Next chat' },
  { action: 'prev-chat', combo: 'k', label: 'K', description: 'Previous chat' },
  { action: 'focus-composer', combo: 'enter', label: '↵', description: 'Focus composer' },
  { action: 'send', combo: 'mod+enter', label: '⌘↵', description: 'Send message' },
  { action: 'dismiss', combo: 'escape', label: 'Esc', description: 'Blur / dismiss AI dock or overlay' },
  { action: 'toggle-panel', combo: ']', label: ']', description: 'Toggle fan panel' },
  { action: 'toggle-list', combo: '[', label: '[', description: 'Toggle chat list' },
  { action: 'cheatsheet', combo: '?', label: '?', description: 'Hotkey cheatsheet' },
  { action: 'settings', combo: 'mod+,', label: '⌘,', description: 'Open settings' },
  { action: 'ai-reply', combo: 'mod+r', label: '⌘R', description: 'Fast Reply (AI suggestion)' },
  { action: 'ai-improve', combo: 'mod+i', label: '⌘I', description: 'Improve draft (AI)' },
  { action: 'ai-help', combo: 'mod+h', label: '⌘H', description: 'Help me (AI coaching)' },
  { action: 'ai-ping', combo: 'mod+p', label: '⌘P', description: 'Ping — reactivation message (AI, silent fans)' },
  { action: 'ai-hi', combo: 'mod+g', label: '⌘G', description: 'Hi greeting — 3 opener variants (AI, fresh chats)' },
  { action: 'ai-review', combo: 'mod+e', label: '⌘E', description: 'Chat review — rate this conversation (AI)' },
  { action: 'ai-scan', combo: 'mod+s', label: '⌘S', description: 'Scan — deep fan profile → panel (AI)' },
  { action: 'ai-tone', combo: 'mod+t', label: '⌘T', description: 'Cycle tone (casual / flirty / upsell / spicy)' },
  { action: 'ai-cancel', combo: 'mod+.', label: '⌘.', description: 'Cancel running AI operation' },
  { action: 'ai-part-0', combo: 'mod+0', label: '⌘0', description: 'Insert all AI draft parts as a [NEXT] sequence' },
  // Spenders board (PLAN item 12) — active only in the spenders view.
  { action: 'board-preview', combo: ' ', label: 'SPACE', description: 'Spenders: quick-look preview', hideFromCheatsheet: true },
  { action: 'board-open-chat', combo: 'o', label: 'O', description: 'Spenders: open the full chat', hideFromCheatsheet: true },
  { action: 'board-back', combo: 'arrowleft', label: '←', description: 'Spenders: back to chat', hideFromCheatsheet: true },
  { action: 'board-stats', combo: 's', label: 'S', description: 'Spenders: expand/collapse stats', hideFromCheatsheet: true },
  ...AI_PART_BINDINGS,
];

/** Collapsed cheatsheet rows for hidden bindings. */
export const CHEATSHEET_EXTRAS: ReadonlyArray<{ label: string; description: string }> = [
  { label: '⌘1…9', description: 'Insert AI draft part N (or click the bubble)' },
  { label: 'SPACE / O / ← / S', description: 'Spenders page: preview / open chat / back / stats' },
];

/** Shown dimmed in the cheatsheet — wired by later phases (empty = section hidden). */
export const UPCOMING_BINDINGS: ReadonlyArray<{ label: string; description: string; phase: string }> = [];
