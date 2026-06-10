// Pure AI-dock logic — no DOM, no store, no IPC (tested in tests/renderer-ai/).
// Covers tone cycling, copy payload selection, frame correlation, result→view
// derivation (xml fallback), prompt-snapshot extraction, and the streaming
// chunk batcher/splitter that powers the imperative DOM append path
// (DESIGN §3.4: ≤1 flush / 50 ms, no React re-render per chunk).

import { z } from 'zod';
import type { ReplyTone } from '@chatgoose/shared/types';
import type { OperationFeature } from '@chatgoose/shared/features';
import type {
  FeatureResultPayload,
  OperationEvent,
  UserFacingErrorPayload,
} from '@chatgoose/shared/protocol/index';
import { parseHelpMeXml } from '@chatgoose/shared/output/xml';
import {
  normalizeProvidedReplyParts,
  normalizeReplyParts,
  normalizeSingleReplyPart,
  normalizeVariantReplyParts,
} from '@chatgoose/shared/output/reply-output';

// ─── Tones ───────────────────────────────────────────────────────────────

export const DOCK_TONES = ['casual', 'flirty', 'upsell', 'spicy'] as const satisfies readonly ReplyTone[];

/** ⌘T order: none → casual → flirty → upsell → spicy → none (deselect closes the loop). */
export function cycleTone(current: ReplyTone): ReplyTone {
  const idx = DOCK_TONES.findIndex((tone) => tone === current);
  if (idx === -1) return DOCK_TONES[0];
  return DOCK_TONES[idx + 1] ?? 'none';
}

/** Pill click: clicking the active tone deselects to none (legacy selectTone behavior). */
export function toggleTone(current: ReplyTone, clicked: ReplyTone): ReplyTone {
  return current === clicked ? 'none' : clicked;
}

// ─── Copy payload selection (companion mode: COPY is the primary action) ──

/**
 * `partIndex` 0 = all parts (blank-line separated — pasted as one block into
 * OnlyMonster), 1..N = part N. Null = nothing to copy at that index.
 */
export function copyPayload(parts: readonly string[], partIndex: number): string | null {
  if (parts.length === 0 || partIndex < 0) return null;
  if (partIndex === 0) return parts.join('\n\n');
  return parts[partIndex - 1] ?? null;
}

export function copyChipLabel(partNumber: number): string {
  return partNumber >= 1 && partNumber <= 9 ? `COPY ⌘${partNumber}` : 'COPY';
}

// ─── Operation correlation ───────────────────────────────────────────────

/** Frames for any other operation are ignored — stale streams must never paint. */
export function isFrameForOperation(
  activeOperationId: string | null,
  frame: Pick<OperationEvent, 'operationId'>,
): boolean {
  return activeOperationId !== null && frame.operationId === activeOperationId;
}

// ─── Result → dock view derivation ───────────────────────────────────────

export type DockView =
  /** True reply drafts — serif bubbles with the copy affordance. */
  | { kind: 'drafts'; parts: string[] }
  /** Help Me: read-only coaching card + engaging/flirty as copyable drafts. */
  | { kind: 'help'; coaching: string; parts: string[] }
  /** Parse/sanitize fallback — read-only raw text, no copy chips. */
  | { kind: 'raw'; text: string };

export function deriveDockView(feature: OperationFeature, result: FeatureResultPayload): DockView {
  if (feature === 'help-me') {
    const parsed = parseHelpMeXml(result.rawText);
    if (parsed.valid && parsed.coaching !== null) {
      const parts = normalizeProvidedReplyParts([parsed.engaging ?? '', parsed.flirty ?? '']);
      return { kind: 'help', coaching: parsed.coaching, parts };
    }
    return { kind: 'raw', text: result.rawText };
  }
  if (feature === 'chat-review' || feature === 'fan-summary') {
    // Analysis surfaces (P4) — read-only if they ever land in the dock.
    return { kind: 'raw', text: result.rawText };
  }
  const parts =
    result.parts !== undefined && result.parts.length > 0
      ? normalizeProvidedReplyParts(result.parts)
      : feature === 'improve-draft'
        ? normalizeSingleReplyPart(result.rawText)
        : feature === 'hi-greeting'
          ? normalizeVariantReplyParts(result.rawText)
          : normalizeReplyParts(result.rawText);
  if (parts.length === 0) return { kind: 'raw', text: result.rawText };
  return { kind: 'drafts', parts };
}

/** Parts the copy hotkeys (⌘0..⌘9) operate on; raw fallback is never copyable. */
export function copyablePartsOf(view: DockView | null): string[] {
  if (view === null || view.kind === 'raw') return [];
  return view.parts;
}

// ─── Errors ──────────────────────────────────────────────────────────────

/** Recovery hint: protocol `description`, else the error module's `recovery`. */
export function errorHint(error: UserFacingErrorPayload): string | null {
  if (typeof error.description === 'string' && error.description.length > 0) {
    return error.description;
  }
  const recovery: unknown = error['recovery'];
  return typeof recovery === 'string' && recovery.length > 0 ? recovery : null;
}

// ─── Gating (composer pill row) ──────────────────────────────────────────

export interface AiGateInput {
  mapped: boolean;
  hasLlmKey: boolean;
}

export type AiGate =
  | { ok: true }
  | { ok: false; reason: 'unmapped' | 'no-key'; message: string };

export function evaluateAiGate(input: AiGateInput): AiGate {
  if (!input.mapped) {
    return { ok: false, reason: 'unmapped', message: 'Map a personality in Settings' };
  }
  if (!input.hasLlmKey) {
    return { ok: false, reason: 'no-key', message: 'Add an Anthropic or OpenRouter key in Settings' };
  }
  return { ok: true };
}

// ─── Labels ──────────────────────────────────────────────────────────────

export const DOCK_FEATURE_LABELS: Record<OperationFeature, string> = {
  'fast-reply': 'Fast Reply',
  'improve-draft': 'Improve Draft',
  'help-me': 'Help Me',
  'fan-summary': 'Scan',
  'chat-review': 'Chat Review',
  ping: 'Ping',
  'hi-greeting': 'Hi Greeting',
};

export function formatOpCost(totalUsd: number): string {
  return `$${totalUsd.toFixed(3)}`;
}

// ─── Debug prompt snapshot (operation:debugPrompt frame) ─────────────────

const promptBlockSchema = z.object({ text: z.string(), cache: z.string() });
const promptSnapshotSchema = z.looseObject({
  systemBlocks: z.array(promptBlockSchema).optional(),
  userBlocks: z.array(promptBlockSchema).optional(),
});

export interface PromptInspectorBlock {
  role: 'system' | 'user';
  text: string;
  cache: string;
}

/** Null = unknown snapshot shape; the inspector falls back to raw JSON. */
export function extractPromptBlocks(snapshot: unknown): PromptInspectorBlock[] | null {
  const parsed = promptSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) return null;
  const blocks: PromptInspectorBlock[] = [];
  for (const block of parsed.data.systemBlocks ?? []) blocks.push({ role: 'system', ...block });
  for (const block of parsed.data.userBlocks ?? []) blocks.push({ role: 'user', ...block });
  return blocks.length > 0 ? blocks : null;
}

// ─── Chunk batching (DESIGN §3.4: ≤1 flush / 50 ms) ──────────────────────

export const STREAM_FLUSH_MS = 50;

export interface ChunkBatcher {
  push(text: string): void;
  /** Emit anything pending immediately (completion / teardown). */
  flush(): void;
  dispose(): void;
}

export interface SchedulerLike<H> {
  set(fn: () => void, ms: number): H;
  clear(handle: H): void;
}

export function createChunkBatcherWith<H>(
  scheduler: SchedulerLike<H>,
  emit: (text: string) => void,
  intervalMs: number = STREAM_FLUSH_MS,
): ChunkBatcher {
  let buffer = '';
  let pending: H | null = null;
  let disposed = false;

  function emitBuffer(): void {
    if (buffer.length === 0) return;
    const text = buffer;
    buffer = '';
    emit(text);
  }

  return {
    push(text) {
      if (disposed || text.length === 0) return;
      buffer += text;
      if (pending === null) {
        pending = scheduler.set(() => {
          pending = null;
          emitBuffer();
        }, intervalMs);
      }
    },
    flush() {
      if (disposed) return;
      if (pending !== null) {
        scheduler.clear(pending);
        pending = null;
      }
      emitBuffer();
    },
    dispose() {
      if (pending !== null) scheduler.clear(pending);
      pending = null;
      buffer = '';
      disposed = true;
    },
  };
}

export function createChunkBatcher(
  emit: (text: string) => void,
  intervalMs: number = STREAM_FLUSH_MS,
): ChunkBatcher {
  return createChunkBatcherWith(
    { set: (fn, ms) => setTimeout(fn, ms), clear: (handle) => clearTimeout(handle) },
    emit,
    intervalMs,
  );
}

// ─── Streaming [NEXT] splitter ───────────────────────────────────────────
// Live visual split only; the authoritative parts come from the complete frame
// (splitting never runs on partial text for the final result — SPEC §8).

export type StreamRenderOp = { kind: 'append'; text: string } | { kind: 'break' };

export interface StreamSplitter {
  feed(text: string): StreamRenderOp[];
  /** Release any withheld marker-prefix tail as plain text. */
  finish(): StreamRenderOp[];
}

export function createStreamSplitter(marker = '[NEXT]'): StreamSplitter {
  let carry = '';
  let atPartStart = true;

  function markerPrefixSuffixLength(text: string): number {
    const max = Math.min(text.length, marker.length - 1);
    for (let len = max; len > 0; len--) {
      if (text.endsWith(marker.slice(0, len))) return len;
    }
    return 0;
  }

  function emitText(out: StreamRenderOp[], text: string): void {
    const trimmed = atPartStart ? text.replace(/^\s+/, '') : text;
    if (trimmed.length === 0) return;
    out.push({ kind: 'append', text: trimmed });
    atPartStart = false;
  }

  return {
    feed(text) {
      const out: StreamRenderOp[] = [];
      let pendingText = carry + text;
      carry = '';
      let idx = pendingText.indexOf(marker);
      while (idx !== -1) {
        emitText(out, pendingText.slice(0, idx));
        if (!atPartStart) {
          out.push({ kind: 'break' });
          atPartStart = true;
        }
        pendingText = pendingText.slice(idx + marker.length);
        idx = pendingText.indexOf(marker);
      }
      const hold = markerPrefixSuffixLength(pendingText);
      if (hold > 0) {
        carry = pendingText.slice(pendingText.length - hold);
        pendingText = pendingText.slice(0, pendingText.length - hold);
      }
      emitText(out, pendingText);
      return out;
    },
    finish() {
      const out: StreamRenderOp[] = [];
      emitText(out, carry);
      carry = '';
      return out;
    },
  };
}
