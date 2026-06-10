// Thread shaping: day separators, tip ledger rows, PPV chips, send states.
// Pure — unit tested in tests/renderer/messages.test.ts.

import type { MessageVM, PpvStateVM } from '../../../preload/contract';
import { dayKey, formatDayLabel } from './time';
import { formatDollars } from './money';

export type ThreadRow =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'tip'; key: string; message: MessageVM }
  | { kind: 'message'; key: string; message: MessageVM };

/** Input messages must be in ascending chronological order. */
export function buildThreadRows(messages: readonly MessageVM[], now: Date): ThreadRow[] {
  const rows: ThreadRow[] = [];
  let currentDay: string | null = null;
  for (const message of messages) {
    const date = new Date(message.createdAt);
    const day = dayKey(date);
    if (day !== currentDay) {
      currentDay = day;
      rows.push({ kind: 'day', key: `day:${day}`, label: formatDayLabel(date, now) });
    }
    rows.push(
      message.isTip
        ? { kind: 'tip', key: `tip:${message.id}`, message }
        : { kind: 'message', key: `msg:${message.id}`, message },
    );
  }
  return rows;
}

export interface PpvChip {
  tone: 'green' | 'amber' | 'neutral';
  label: string;
  state: PpvStateVM;
}

/** PPV badge per task spec: purchased filled green, not purchased amber outline, unknown neutral. */
export function ppvChip(message: Pick<MessageVM, 'price' | 'ppvState'>): PpvChip | null {
  if (message.price <= 0 || message.ppvState === null) return null;
  const price = formatDollars(message.price);
  switch (message.ppvState) {
    case 'purchased':
      return { tone: 'green', label: `${price} PPV ✓`, state: 'purchased' };
    case 'not_purchased':
      return { tone: 'amber', label: `${price} PPV — not purchased`, state: 'not_purchased' };
    case 'unknown':
      return { tone: 'neutral', label: `${price} PPV`, state: 'unknown' };
  }
}

export interface SendState {
  label: 'SEEN' | 'SENT';
  tone: 'seen' | 'low';
}

/**
 * Read-state for our sent messages, honest: derived from `isNew` only (poll
 * refreshed; we never know *when* the fan saw it — no fabricated timestamps).
 */
export function sendState(message: Pick<MessageVM, 'isSentByMe' | 'isNew'>): SendState | null {
  if (!message.isSentByMe) return null;
  return message.isNew ? { label: 'SENT', tone: 'low' } : { label: 'SEEN', tone: 'seen' };
}

/** '3 photos · 1 video' style media count label. */
export function mediaCountLabel(media: readonly MessageVM['media'][number][]): string {
  const counts = new Map<string, number>();
  for (const m of media) counts.set(m.type, (counts.get(m.type) ?? 0) + 1);
  const parts: string[] = [];
  for (const [type, count] of counts) {
    const noun = type === 'photo' ? 'photo' : type === 'video' ? 'video' : type;
    parts.push(`${count} ${noun}${count === 1 ? '' : 's'}`);
  }
  return parts.join(' · ');
}

/** Initials for avatar tiles: 'Marcus K.' → 'MK', 'jake_777' → 'J7'. */
export function initialsOf(name: string): string {
  const words = name
    .split(/[\s_.-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
  if (words.length === 0) return '?';
  if (words.length === 1) {
    const w = words[0] ?? '';
    return (w.charAt(0) + (w.length > 1 ? w.charAt(w.length - 1) : '')).toUpperCase();
  }
  return ((words[0]?.charAt(0) ?? '') + (words[1]?.charAt(0) ?? '')).toUpperCase();
}
