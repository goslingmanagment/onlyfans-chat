// Pure send-pipeline logic for the renderer (SPEC §7) — no DOM, no store, no
// IPC (tested in tests/renderer/send-logic.test.ts). Covers the [NEXT] draft
// split, the typing-out throttle, CG-OF-05 restricted-word highlighting,
// outbox-row → label/action derivation, thread merge ordering, and the
// multi-part sequence chip.

import type { OutboxItemVM } from '../../../../preload/contract';
import type { ThreadRow } from '../../lib/messages';

// ─── Draft → parts ───────────────────────────────────────────────────────

/** [NEXT] splits a draft into a send sequence; parts are trimmed, empties dropped. */
export function splitDraftParts(draft: string): string[] {
  return draft
    .split('[NEXT]')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

// ─── Typing-out throttle (SPEC §7.8) ─────────────────────────────────────

export const TYPING_INTERVAL_MS = 3_000;
export const TYPING_IDLE_MS = 4_000;

export interface TypingThrottle {
  /** Report a keystroke; true ⇒ the caller should fire cmd:chat.typingActive now. */
  activity(nowMs: number): boolean;
  /** Conversation switch — the next keystroke starts a fresh session. */
  reset(): void;
}

/**
 * ≤1 fire per `intervalMs` within a typing session; a pause ≥ `idleMs` ends
 * the session, so the next keystroke announces typing immediately. With the
 * default idleMs > intervalMs the ≤1/3 s bound holds unconditionally.
 */
export function createTypingThrottle(
  intervalMs: number = TYPING_INTERVAL_MS,
  idleMs: number = TYPING_IDLE_MS,
): TypingThrottle {
  let lastFireMs: number | null = null;
  let lastActivityMs: number | null = null;
  return {
    activity(nowMs) {
      if (lastActivityMs !== null && nowMs - lastActivityMs >= idleMs) lastFireMs = null;
      lastActivityMs = nowMs;
      if (lastFireMs === null || nowMs - lastFireMs >= intervalMs) {
        lastFireMs = nowMs;
        return true;
      }
      return false;
    },
    reset() {
      lastFireMs = null;
      lastActivityMs = null;
    },
  };
}

// ─── CG-OF-05 restricted-word highlighting ───────────────────────────────

export interface RestrictedSegment {
  text: string;
  restricted: boolean;
}

/**
 * Word-level highlight only when an entry is a PROPER substring of the text —
 * live capture (SPEC §7 callout ③) shows `textHighLight` may be the full
 * message text, in which case the banner alone carries the reason.
 */
export function restrictedSegments(
  text: string,
  highlights: readonly string[],
): RestrictedSegment[] {
  const markers = highlights.filter((h) => h.length > 0 && h.length < text.length && text.includes(h));
  if (markers.length === 0) return [{ text, restricted: false }];
  const segments: RestrictedSegment[] = [];
  let pos = 0;
  while (pos < text.length) {
    let matchAt = -1;
    let matchLen = 0;
    for (const marker of markers) {
      const at = text.indexOf(marker, pos);
      if (at === -1) continue;
      // earliest match wins; at a tie, the longest marker
      if (matchAt === -1 || at < matchAt || (at === matchAt && marker.length > matchLen)) {
        matchAt = at;
        matchLen = marker.length;
      }
    }
    if (matchAt === -1) {
      segments.push({ text: text.slice(pos), restricted: false });
      break;
    }
    if (matchAt > pos) segments.push({ text: text.slice(pos, matchAt), restricted: false });
    segments.push({ text: text.slice(matchAt, matchAt + matchLen), restricted: true });
    pos = matchAt + matchLen;
  }
  return segments;
}

// ─── Outbox row → label / actions ────────────────────────────────────────

export type OutboxAction = 'edit' | 'retry' | 'dismiss' | 'verify';

export interface OutboxRowView {
  label: 'QUEUED' | 'SENDING' | 'FAILED' | 'UNCONF';
  tone: 'low' | 'bad' | 'warn';
  pulse: boolean;
  /** CG-OF-05: show the platform banner and keep the text (SPEC §7.4). */
  restrictedWords: boolean;
  /**
   * Reason CODE for the explainer line; the component resolves it to localized
   * copy. `'unconfirmed'` → conv.unconfirmedExplainer; null ⇒ either no
   * explainer, or (for an uncoded FAILED) fall back to `explainerMessage`
   * which carries the raw wire message verbatim (registry/provider wording).
   */
  explainerCode: 'unconfirmed' | null;
  /** Verbatim wire message for an uncoded FAILED row (not authored English). */
  explainerMessage: string | null;
  actions: readonly OutboxAction[];
}

/**
 * Null ⇒ the row renders no optimistic bubble: sent rows reconcile into the
 * real thread, cancelled rows are acknowledged audit history. Unconfirmed
 * rows get verify/dismiss and NEVER a resend (SPEC §7.5 — resend is a manual
 * new send only after checking).
 */
export function deriveOutboxRow(
  item: Pick<OutboxItemVM, 'state' | 'errorCode' | 'errorMessage'>,
): OutboxRowView | null {
  switch (item.state) {
    case 'queued':
      return { label: 'QUEUED', tone: 'low', pulse: false, restrictedWords: false, explainerCode: null, explainerMessage: null, actions: [] };
    case 'sending':
      return { label: 'SENDING', tone: 'low', pulse: true, restrictedWords: false, explainerCode: null, explainerMessage: null, actions: [] };
    case 'failed': {
      const restricted = item.errorCode === 'CG-OF-05';
      return {
        label: 'FAILED',
        tone: 'bad',
        pulse: false,
        restrictedWords: restricted,
        explainerCode: null,
        explainerMessage: restricted ? null : item.errorMessage,
        actions: ['edit', 'retry', 'dismiss'],
      };
    }
    case 'unconfirmed':
      return {
        label: 'UNCONF',
        tone: 'warn',
        pulse: false,
        restrictedWords: false,
        explainerCode: 'unconfirmed',
        explainerMessage: null,
        actions: ['verify', 'dismiss'],
      };
    case 'sent':
    case 'cancelled':
      return null;
  }
}

// ─── Thread merge ────────────────────────────────────────────────────────

/** Rows that still need a bubble, in chronological send order. */
export function visibleOutboxItems(items: readonly OutboxItemVM[]): OutboxItemVM[] {
  return items
    .filter((item) => item.state !== 'sent' && item.state !== 'cancelled')
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) ||
        a.partIndex - b.partIndex ||
        a.localId.localeCompare(b.localId),
    );
}

/** Optimistic bubbles always render below the real thread (SPEC §7.1). */
export function mergeOutboxRows(
  rows: readonly ThreadRow[],
  items: readonly OutboxItemVM[],
): readonly ThreadRow[] {
  const visible = visibleOutboxItems(items);
  if (visible.length === 0) return rows;
  return [
    ...rows,
    ...visible.map((item) => ({ kind: 'outbox' as const, key: `outbox:${item.localId}`, item })),
  ];
}

// ─── Multi-part sequence chip ────────────────────────────────────────────

export interface ActiveSequence {
  sequenceId: string;
  totalParts: number;
  remainingParts: number;
}

/** The cancel chip shows while any part of a [NEXT] sequence is queued/sending. */
export function activeSequence(items: readonly OutboxItemVM[]): ActiveSequence | null {
  const groups = new Map<string, OutboxItemVM[]>();
  for (const item of items) {
    if (item.sequenceId === null) continue;
    const list = groups.get(item.sequenceId);
    if (list === undefined) groups.set(item.sequenceId, [item]);
    else list.push(item);
  }
  let found: ActiveSequence | null = null;
  let foundStartedAt = '';
  for (const [sequenceId, parts] of groups) {
    const remaining = parts.filter((p) => p.state === 'queued' || p.state === 'sending').length;
    if (remaining === 0) continue;
    const startedAt = parts[0]?.createdAt ?? '';
    if (found === null || startedAt > foundStartedAt) {
      found = { sequenceId, totalParts: parts.length, remainingParts: remaining };
      foundStartedAt = startedAt;
    }
  }
  return found;
}
