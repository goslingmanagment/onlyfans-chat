// Pure AI-dock logic — no DOM, no store, no IPC (tested in tests/renderer-ai/).
// Covers tone cycling, insert/copy payload selection (insert is primary,
// copy is the SPEC §7.0 degrade), frame correlation, result→view derivation
// (xml fallback), prompt-snapshot extraction, and the streaming chunk
// batcher/splitter that powers the imperative DOM append path
// (DESIGN §3.4: ≤1 flush / 50 ms, no React re-render per chunk).

import { z } from 'zod';
import type { ReplyTone } from '@chatgoose/shared/types';
import type { OperationFeature } from '@chatgoose/shared/features';
import { HI_GREETING_MAX_TRANSCRIPT } from '@chatgoose/shared/constants';
import type {
  FeatureResultPayload,
  OperationEvent,
  OperationPhase,
  UserFacingErrorPayload,
} from '@chatgoose/shared/protocol/index';
import { parseChatReviewXml, parseHelpMeXml } from '@chatgoose/shared/output/xml';
import {
  normalizeProvidedReplyParts,
  normalizeReplyParts,
  normalizeSingleReplyPart,
  normalizeVariantReplyParts,
} from '@chatgoose/shared/output/reply-output';
// ─── Tones ───────────────────────────────────────────────────────────────

export const DOCK_TONES = ['casual', 'flirty', 'upsell', 'spicy'] as const satisfies readonly ReplyTone[];

/** Selectable tone — the Reply split-menu and the dock pills never offer 'none'. */
export type DockTone = (typeof DOCK_TONES)[number];

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

/**
 * Effective tone the Reply body / ⌘R generate in: the override when set,
 * otherwise settings.defaultReplyTone — falling back to the first dock tone
 * when neither resolves to a real tone ('none' is never an active dock tone).
 * The Reply split-menu mark and the dock footer pills both read through this so
 * the two UIs (and ⌘T cycling) stay in sync.
 */
export function effectiveReplyTone(
  override: ReplyTone | null,
  defaultTone: ReplyTone | undefined,
): DockTone {
  const candidate = override ?? defaultTone ?? DOCK_TONES[0];
  return candidate === 'none' ? DOCK_TONES[0] : candidate;
}

export interface ToneMenuItem {
  tone: DockTone;
  active: boolean;
}

/**
 * The Reply split-menu rows: every selectable dock tone, with exactly the
 * effective tone marked active. Pure so the menu list + mark are unit-tested
 * without mounting the popover (DESIGN §1 keeps React components thin).
 */
export function buildToneMenuItems(active: DockTone): ToneMenuItem[] {
  return DOCK_TONES.map((tone) => ({ tone, active: tone === active }));
}

// ─── Copy payload selection (secondary affordance + the §7.0 degrade path) ─

/**
 * `partIndex` 0 = all parts (blank-line separated — pasted as one block into
 * OnlyMonster), 1..N = part N. Null = nothing to copy at that index.
 */
export function copyPayload(parts: readonly string[], partIndex: number): string | null {
  if (parts.length === 0 || partIndex < 0) return null;
  if (partIndex === 0) return parts.join('\n\n');
  return parts[partIndex - 1] ?? null;
}

// ─── Insert payload selection (P3: INSERT is the primary bubble action) ───

export const INSERT_SEQUENCE_JOINER = '\n[NEXT]\n';

/**
 * `partIndex` 0 = all parts joined as a [NEXT] sequence — sending the inserted
 * draft splits back into the same parts; 1..N = part N. Null = nothing there.
 */
export function insertPayload(parts: readonly string[], partIndex: number): string | null {
  if (parts.length === 0 || partIndex < 0) return null;
  if (partIndex === 0) return parts.join(INSERT_SEQUENCE_JOINER);
  return parts[partIndex - 1] ?? null;
}

/** Insert appends below whatever the chatter already typed; blank drafts are replaced. */
export function appendToDraft(draft: string, payload: string): string {
  return draft.trim().length === 0 ? payload : `${draft}\n${payload}`;
}

export type DockPartAction =
  | { mode: 'insert'; payload: string; feedback: 'inserted' }
  | { mode: 'copy'; payload: string; feedback: 'copied' };

/**
 * Primary bubble action wiring: insert when the chat can be messaged, copy
 * otherwise (SPEC §7.0 degrade). The feedback action is what cmd:ai.feedback
 * must report for the acceptance instrumentation.
 */
export function resolveDockPartAction(
  parts: readonly string[],
  partIndex: number,
  canSend: boolean,
): DockPartAction | null {
  if (canSend) {
    const payload = insertPayload(parts, partIndex);
    return payload === null ? null : { mode: 'insert', payload, feedback: 'inserted' };
  }
  const payload = copyPayload(parts, partIndex);
  return payload === null ? null : { mode: 'copy', payload, feedback: 'copied' };
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
  /** Chat Review: read-only analysis card — rating 1–10, evaluation, recommendation list. */
  | { kind: 'review'; rating: number; evaluation: string; recommendations: string[] }
  /** Fan summary (Scan): completion pointer to the panel's Scan tab, never the body. */
  | { kind: 'scan-pointer'; generatedAt: number | null; cached: boolean }
  /** Parse/sanitize fallback — read-only raw text, no copy chips. */
  | { kind: 'raw'; text: string };

/**
 * Recommendation block → list items: one per line, bullet/number markers
 * stripped; an unstructured paragraph stays a single item.
 */
export function splitRecommendationItems(recommendations: string): string[] {
  return recommendations
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-—•*]|\d+[.)])\s*/, '').trim())
    .filter((line) => line.length > 0);
}

/** Coordinator attaches summaryMeta to fan-summary results (cache hits set cached). */
const summaryMetaSchema = z.looseObject({
  generatedAt: z.number(),
  cached: z.boolean().optional(),
});

export function deriveDockView(feature: OperationFeature, result: FeatureResultPayload): DockView {
  if (feature === 'help-me') {
    const parsed = parseHelpMeXml(result.rawText);
    if (parsed.valid && parsed.coaching !== null) {
      const parts = normalizeProvidedReplyParts([parsed.engaging ?? '', parsed.flirty ?? '']);
      return { kind: 'help', coaching: parsed.coaching, parts };
    }
    return { kind: 'raw', text: result.rawText };
  }
  if (feature === 'chat-review') {
    const parsed = parseChatReviewXml(result.rawText);
    if (parsed.valid && parsed.rating !== null && parsed.evaluation !== null) {
      return {
        kind: 'review',
        rating: parsed.rating,
        evaluation: parsed.evaluation,
        recommendations: splitRecommendationItems(parsed.recommendations ?? ''),
      };
    }
    return { kind: 'raw', text: result.rawText };
  }
  if (feature === 'fan-summary') {
    // The body lives in the panel's Scan tab (DESIGN §1); the dock only points there.
    const meta = summaryMetaSchema.safeParse(result['summaryMeta']);
    return {
      kind: 'scan-pointer',
      generatedAt: meta.success ? meta.data.generatedAt : null,
      cached: meta.success && meta.data.cached === true,
    };
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

/**
 * Parts the ⌘0..⌘9 hotkeys (insert/copy) operate on. Analysis views (review,
 * scan-pointer) and the raw fallback never qualify — only true reply drafts
 * are insertable (SPEC §15 / DESIGN §1).
 */
export function copyablePartsOf(view: DockView | null): string[] {
  if (view === null) return [];
  if (view.kind !== 'drafts' && view.kind !== 'help') return [];
  return view.parts;
}

export function shouldAutoInsertCompactDraft(input: {
  feature: OperationFeature;
  viewKind: DockView['kind'] | null;
  canSend: boolean;
  partCount: number;
}): boolean {
  return (
    input.viewKind === 'drafts' &&
    input.feature !== 'hi-greeting' &&
    input.canSend &&
    input.partCount === 1
  );
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

export interface AiTransportSettings {
  hasAnthropicKey: boolean;
  hasOpenRouterKey: boolean;
  hasHubKey: boolean;
  hubBaseUrl: string | null;
  aiGatewayTransport: 'direct' | 'hub' | 'feature';
}

export function hasConfiguredAiTransport(settings: AiTransportSettings): boolean {
  // Stage 31: both kernel lanes (proxy and feature-service) need only the
  // hub connection — vendor keys are the direct lane's concern.
  if (settings.aiGatewayTransport === 'hub' || settings.aiGatewayTransport === 'feature') {
    return settings.hubBaseUrl !== null && settings.hasHubKey;
  }
  return settings.hasAnthropicKey || settings.hasOpenRouterKey;
}

export type AiGate =
  | { ok: true }
  | { ok: false; reason: 'unmapped' | 'no-key'; message: string };

export function evaluateAiGate(input: AiGateInput): AiGate {
  if (!input.mapped) {
    return { ok: false, reason: 'unmapped', message: 'Map a personality in Settings' };
  }
  if (!input.hasLlmKey) {
    return {
      ok: false,
      reason: 'no-key',
      message: 'Add a direct AI key or configure Hub AI in Settings',
    };
  }
  return { ok: true };
}

// ─── Deep-feature gates (Ping / Hi pills, DESIGN §1 tier 1) ──────────────

/**
 * Block-reason CODE for the pill gates — the renderer maps it to localized text
 * via features/ai/gateText (the gate logic stays locale-free). `reason` keeps the
 * English fallback wording (also the behavior fact pinned by the unit tests).
 */
export type PillGateReason = 'loading' | 'unmapped' | 'no-key' | 'ping-blocked' | 'hi-locked';
export type PillGate = { enabled: true } | { enabled: false; reason: string; code: PillGateReason };

export const PING_BLOCKED_REASON = 'Fan is active — use Reply';
export const HI_LOCKED_REASON = `Conversation already has more than ${HI_GREETING_MAX_TRANSCRIPT} messages — use Reply`;

/**
 * Precedence: account-level gate (unmapped → no-key) blocks first; the
 * feature-specific gate applies only on an otherwise-enabled row.
 * `base === null` = accounts/settings still loading; feature gate `null` =
 * unknown (query not loaded) — allowed, the coordinator stays authoritative
 * (CG-FLOW-05 / CG-FLOW-09).
 */
function evaluateDeepPillGate(
  base: AiGate | null,
  feature: { reason: string; code: PillGateReason } | null,
): PillGate {
  if (base === null) return { enabled: false, reason: 'Loading…', code: 'loading' };
  if (!base.ok) return { enabled: false, reason: base.message, code: base.reason };
  if (feature !== null) return { enabled: false, reason: feature.reason, code: feature.code };
  return { enabled: true };
}

/** `blocked === true` = query:ai.pingGate said the fan texted within the ping window. */
export function evaluatePingGate(base: AiGate | null, blocked: boolean | null): PillGate {
  return evaluateDeepPillGate(
    base,
    blocked === true ? { reason: PING_BLOCKED_REASON, code: 'ping-blocked' } : null,
  );
}

/** `locked === true` = conversation already exceeds the hi-greeting message cap. */
export function evaluateHiGate(base: AiGate | null, locked: boolean | null): PillGate {
  return evaluateDeepPillGate(
    base,
    locked === true ? { reason: HI_LOCKED_REASON, code: 'hi-locked' } : null,
  );
}

/**
 * Client-side hi-greeting heuristic over the loaded message pages: locked when
 * more than HI_GREETING_MAX_TRANSCRIPT non-deleted messages are loaded, or any
 * page reports unloaded history (a full page is already far past the cap).
 * Null = pages not loaded yet (unknown). Heuristic only — the coordinator's
 * CG-FLOW-09 check is authoritative for edge counts.
 */
export function deriveHiLocked(
  pages:
    | ReadonlyArray<{ items: ReadonlyArray<{ deleted: boolean }>; hasMore: boolean }>
    | undefined,
): boolean | null {
  if (pages === undefined || pages.length === 0) return null;
  let count = 0;
  for (const page of pages) {
    if (page.hasMore) return true;
    for (const item of page.items) {
      if (!item.deleted) count += 1;
    }
  }
  return count > HI_GREETING_MAX_TRANSCRIPT;
}

// ─── Progress label (deep ops stage through page-counted loading) ────────

const PHASE_LABELS: Partial<Record<OperationPhase, string>> = {
  'idle': 'STARTING',
  'loading-messages': 'LOADING MESSAGES',
  'loading-earnings': 'LOADING EARNINGS',
  'generating': 'GENERATING',
};

/** Deep loads carry currentPage/targetPages (operation:progress) — show the counter. */
export function progressLabel(
  phase: OperationPhase,
  pages: { current: number; target: number } | null = null,
): string {
  const base = PHASE_LABELS[phase] ?? phase.toUpperCase();
  if (phase === 'loading-messages' && pages !== null && pages.target > 0) {
    return `${base} · ${pages.current}/${pages.target} PAGES`;
  }
  return base;
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
