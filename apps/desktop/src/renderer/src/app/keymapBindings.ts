// The single hotkey table (DESIGN §2). Later-phase entries appear in the
// cheatsheet as upcoming but are not registered here. Labels are built per
// platform through lib/modKey (⌘K on darwin, Ctrl+K elsewhere); combos and
// matching are identical everywhere.

import type { KeyBinding } from '../lib/keymap';
import { appPlatform, modCombo, type LabelPlatform } from '../lib/modKey';

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

/** The full table for a given platform — exported so tests pin both label sets. */
export function buildKeyBindings(platform: LabelPlatform): KeyBinding<KeyAction>[] {
  const mod = (key: string): string => modCombo(key, platform);
  const aiPartBindings: KeyBinding<KeyAction>[] = AI_PART_ACTIONS.map((action, i) => ({
    action,
    combo: `mod+${i + 1}`,
    label: mod(`${i + 1}`),
    description: `Insert AI draft part ${i + 1}`,
    hideFromCheatsheet: true,
  }));
  return [
    { action: 'palette', combo: 'mod+k', label: mod('K'), description: 'Command palette — jump to chat, fan or action' },
    { action: 'next-unread', combo: 'mod+u', label: mod('U'), description: 'Next unread chat' },
    { action: 'next-chat', combo: 'j', label: 'J', description: 'Next chat' },
    { action: 'prev-chat', combo: 'k', label: 'K', description: 'Previous chat' },
    { action: 'focus-composer', combo: 'enter', label: '↵', description: 'Focus composer' },
    { action: 'send', combo: 'mod+enter', label: mod('↵'), description: 'Send message' },
    { action: 'dismiss', combo: 'escape', label: 'Esc', description: 'Blur / dismiss AI dock or overlay' },
    { action: 'toggle-panel', combo: ']', label: ']', description: 'Toggle fan panel' },
    { action: 'toggle-list', combo: '[', label: '[', description: 'Toggle chat list' },
    { action: 'cheatsheet', combo: '?', label: '?', description: 'Hotkey cheatsheet' },
    { action: 'settings', combo: 'mod+,', label: mod(','), description: 'Open settings' },
    { action: 'ai-reply', combo: 'mod+r', label: mod('R'), description: 'Fast Reply (AI suggestion)' },
    { action: 'ai-improve', combo: 'mod+i', label: mod('I'), description: 'Improve draft (AI)' },
    { action: 'ai-help', combo: 'mod+h', label: mod('H'), description: 'Help me (AI coaching)' },
    { action: 'ai-ping', combo: 'mod+p', label: mod('P'), description: 'Ping — reactivation message (AI, silent fans)' },
    { action: 'ai-hi', combo: 'mod+g', label: mod('G'), description: 'Hi greeting — 3 opener variants (AI, fresh chats)' },
    { action: 'ai-review', combo: 'mod+e', label: mod('E'), description: 'Chat review — rate this conversation (AI)' },
    { action: 'ai-scan', combo: 'mod+s', label: mod('S'), description: 'Scan — deep fan profile → panel (AI)' },
    { action: 'ai-tone', combo: 'mod+t', label: mod('T'), description: 'Cycle tone (casual / flirty / upsell / spicy)' },
    { action: 'ai-cancel', combo: 'mod+.', label: mod('.'), description: 'Cancel running AI operation' },
    { action: 'ai-part-0', combo: 'mod+0', label: mod('0'), description: 'Insert all AI draft parts as a [NEXT] sequence' },
    // Spenders board (PLAN item 12) — active only in the spenders view.
    { action: 'board-preview', combo: ' ', label: 'SPACE', description: 'Spenders: quick-look preview', hideFromCheatsheet: true },
    { action: 'board-open-chat', combo: 'o', label: 'O', description: 'Spenders: open the full chat', hideFromCheatsheet: true },
    { action: 'board-back', combo: 'arrowleft', label: '←', description: 'Spenders: back to chat', hideFromCheatsheet: true },
    { action: 'board-stats', combo: 's', label: 'S', description: 'Spenders: expand/collapse stats', hideFromCheatsheet: true },
    ...aiPartBindings,
  ];
}

export const KEY_BINDINGS: KeyBinding<KeyAction>[] = buildKeyBindings(appPlatform());

/** Collapsed cheatsheet rows for hidden bindings. */
export function buildCheatsheetExtras(
  platform: LabelPlatform,
): ReadonlyArray<{ label: string; description: string }> {
  return [
    { label: modCombo('1…9', platform), description: 'Insert AI draft part N (or click the bubble)' },
    { label: 'SPACE / O / ← / S', description: 'Spenders page: preview / open chat / back / stats' },
  ];
}

export const CHEATSHEET_EXTRAS: ReadonlyArray<{ label: string; description: string }> =
  buildCheatsheetExtras(appPlatform());

/** Shown dimmed in the cheatsheet — wired by later phases (empty = section hidden). */
export const UPCOMING_BINDINGS: ReadonlyArray<{ label: string; description: string; phase: string }> = [];
