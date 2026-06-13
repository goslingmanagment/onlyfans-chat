// AI dock state + controller. Per-chunk frames NEVER touch this store — they
// flow through the imperative stream sink into direct DOM text-node appends
// (DESIGN §3.4); only lifecycle frames (progress / complete / error /
// discarded / debugPrompt) update React state. Subscribe with per-field
// selectors only.

import { create } from 'zustand';
import type { ReplyTone } from '@chatgoose/shared/types';
import { getFeaturePolicy, type OperationFeature } from '@chatgoose/shared/features';
import type {
  LlmSpendSummaryPayload,
  OperationEvent,
  OperationPhase,
  ProfilingSnapshotPayload,
  UserFacingErrorPayload,
} from '@chatgoose/shared/protocol/index';
import type { AiStartRequest } from '../../../../preload/contract';
import { getBridge } from '../../bridge/bridge';
import { useUiStore } from '../../state/uiStore';
import { focusComposer } from '../conversation/composerDom';
import {
  appendToDraft,
  copyPayload,
  copyablePartsOf,
  createChunkBatcher,
  createStreamSplitter,
  cycleTone,
  deriveDockView,
  isFrameForOperation,
  resolveDockPartAction,
  type ChunkBatcher,
  type DockTone,
  type DockView,
  type StreamRenderOp,
} from './dockLogic';

/** Every coordinator-accepted feature is live (P4) — only 'compare' stays gated. */
export type LiveAiFeature = OperationFeature;

export interface ActiveAiOp {
  operationId: string;
  feature: LiveAiFeature;
  accountId: string;
  chatId: string;
  /** Draft snapshot the op was started with (improve-draft regenerate). */
  draftText?: string;
}

export type DockStatus = 'running' | 'completed' | 'error';

interface AiDockState {
  op: ActiveAiOp | null;
  status: DockStatus;
  phase: OperationPhase;
  progressMessage: string | null;
  /** Deep loads report page counters via operation:progress (currentPage/targetPages). */
  progressPages: { current: number; target: number } | null;
  view: DockView | null;
  error: UserFacingErrorPayload | null;
  spend: LlmSpendSummaryPayload | null;
  profiling: ProfilingSnapshotPayload | null;
  debugPrompt: Record<string, unknown> | null;
  /** null = follow settings.defaultReplyTone. */
  toneOverride: ReplyTone | null;
  /** Reply split-menu (the ▾ tone picker on the pill row) open state. */
  toneMenuOpen: boolean;
  preferSplit: boolean;
  /** Bubble feedback chip ('INSERTED'/'COPIED'): partIndex 0 = all, 1..N = part N. */
  partFeedback: { partIndex: number; kind: 'copied' | 'inserted' } | null;
  /** Composer draft — send source, Improve Draft input, per-chat persisted. */
  draftText: string;
  /** Bumped when a Scan lands in the panel — the fan panel flashes its Scan tab. */
  scanFlashSeq: number;
}

const CLEARED = {
  op: null,
  status: 'running',
  phase: 'idle',
  progressMessage: null,
  progressPages: null,
  view: null,
  error: null,
  spend: null,
  profiling: null,
  debugPrompt: null,
  partFeedback: null,
} satisfies Partial<AiDockState>;

export const useAiStore = create<AiDockState>(() => ({
  ...CLEARED,
  toneOverride: null,
  toneMenuOpen: false,
  preferSplit: false,
  draftText: '',
  scanFlashSeq: 0,
}));

// ─── Imperative stream sink (registered by the streaming bubble) ──────────

type SinkApply = (ops: StreamRenderOp[]) => void;

let sinkApply: SinkApply | null = null;
let sinkBacklog: StreamRenderOp[] = [];

export function registerStreamSink(apply: SinkApply): () => void {
  sinkApply = apply;
  if (sinkBacklog.length > 0) {
    const backlog = sinkBacklog;
    sinkBacklog = [];
    apply(backlog);
  }
  return () => {
    if (sinkApply === apply) sinkApply = null;
  };
}

function pushRenderOps(ops: StreamRenderOp[]): void {
  if (ops.length === 0) return;
  if (sinkApply !== null) sinkApply(ops);
  else sinkBacklog.push(...ops);
}

let batcher: ChunkBatcher | null = null;

function resetStream(): void {
  batcher?.dispose();
  batcher = null;
  sinkBacklog = [];
}

// ─── Controller ───────────────────────────────────────────────────────────

export interface AiStartContext {
  accountId: string;
  chatId: string;
  defaultTone: ReplyTone;
}

let lastDefaultTone: ReplyTone = 'casual';
let feedbackResetTimer: ReturnType<typeof setTimeout> | null = null;
let lastConversationKey: string | null = null;

export function startAiFeature(
  feature: LiveAiFeature,
  ctx: AiStartContext,
  opts: { draftText?: string; forceRegenerate?: boolean } = {},
): void {
  const state = useAiStore.getState();
  if (state.op !== null && state.status === 'running') {
    void getBridge().invoke('ai:cancel', { operationId: state.op.operationId });
  }
  const draft = (opts.draftText ?? state.draftText).trim();
  if (feature === 'improve-draft' && draft.length === 0) return;

  lastDefaultTone = ctx.defaultTone;
  resetStream();
  const splitter = createStreamSplitter();
  batcher = createChunkBatcher((text) => pushRenderOps(splitter.feed(text)));

  const operationId = crypto.randomUUID();
  const params: AiStartRequest['params'] = {};
  if (feature === 'fast-reply') {
    params.tone = state.toneOverride ?? ctx.defaultTone;
    params.mode = state.preferSplit ? 'preferSplit' : 'default';
  }
  if (feature === 'improve-draft') params.draftText = draft;
  if (opts.forceRegenerate === true) params.forceRegenerate = true;

  useAiStore.setState({
    ...CLEARED,
    op: {
      operationId,
      feature,
      accountId: ctx.accountId,
      chatId: ctx.chatId,
      ...(feature === 'improve-draft' ? { draftText: draft } : {}),
    },
  });
  void getBridge().invoke('ai:start', {
    operationId,
    feature,
    accountId: ctx.accountId,
    chatId: ctx.chatId,
    params,
  });
}

export function regenerateActiveOperation(): void {
  const state = useAiStore.getState();
  if (state.op === null || state.status === 'running') return;
  // rerunAction 'refresh' (fan-summary/chat-review) forces past the cache —
  // otherwise a re-run of Scan would short-circuit on the entry it just wrote.
  const refresh = getFeaturePolicy(state.op.feature).rerunAction === 'refresh';
  startAiFeature(
    state.op.feature,
    { accountId: state.op.accountId, chatId: state.op.chatId, defaultTone: lastDefaultTone },
    {
      ...(state.op.draftText !== undefined ? { draftText: state.op.draftText } : {}),
      ...(refresh ? { forceRegenerate: true } : {}),
    },
  );
}

/** ✕ / Esc — also the ⌘. cancel path while streaming (main confirms via discarded). */
export function dismissDock(): void {
  const state = useAiStore.getState();
  if (state.op === null) return;
  if (state.status === 'running') {
    void getBridge().invoke('ai:cancel', { operationId: state.op.operationId });
  }
  resetStream();
  useAiStore.setState(CLEARED);
}

export function cancelActiveOperation(): void {
  const state = useAiStore.getState();
  if (state.op !== null && state.status === 'running') dismissDock();
}

// ─── Per-chat draft persistence (cmd:draft.set / query:draft.get) ─────────

export const DRAFT_SAVE_DEBOUNCE_MS = 500;

let draftConversation: { accountId: string; chatId: string } | null = null;
let draftSaveTimer: ReturnType<typeof setTimeout> | null = null;
let draftDirty = false;
let draftLoadSeq = 0;

/** Persist the current draft to its conversation; immediate on switch, debounced while typing. */
function persistDraftNow(): void {
  if (draftSaveTimer !== null) {
    clearTimeout(draftSaveTimer);
    draftSaveTimer = null;
  }
  if (!draftDirty || draftConversation === null) return;
  const { accountId, chatId } = draftConversation;
  draftDirty = false;
  void getBridge().invoke('cmd:draft.set', {
    accountId,
    chatId,
    text: useAiStore.getState().draftText,
  });
}

function scheduleDraftSave(): void {
  if (draftConversation === null) return;
  const target = draftConversation;
  if (draftSaveTimer !== null) clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(() => {
    draftSaveTimer = null;
    if (draftConversation === target) persistDraftNow();
  }, DRAFT_SAVE_DEBOUNCE_MS);
}

/**
 * Conversation switch dismisses the dock (the discarded frame confirms),
 * saves the outgoing chat's draft and loads the incoming chat's.
 */
export function handleConversationChange(accountId: string | null, chatId: string | null): void {
  const state = useAiStore.getState();
  if (state.op !== null && (state.op.accountId !== accountId || state.op.chatId !== chatId)) {
    dismissDock();
  }
  const key = `${accountId ?? ''}/${chatId ?? ''}`;
  if (lastConversationKey === key) return;
  lastConversationKey = key;
  // Reset the active tone back to default (toneOverride → null) when the active
  // chat changes, so a "spicy" pick does not leak to the next fan (legacy was
  // non-sticky; sticky-within-chat is a deliberate, owner-flagged default). Runs
  // AFTER dismissDock so the outgoing dock's fade-out still reads the old tone;
  // also closes the Reply split-menu so it never lingers across a switch.
  if (useAiStore.getState().toneOverride !== null || useAiStore.getState().toneMenuOpen) {
    useAiStore.setState({ toneOverride: null, toneMenuOpen: false });
  }
  persistDraftNow();
  draftConversation = accountId !== null && chatId !== null ? { accountId, chatId } : null;
  draftDirty = false;
  if (useAiStore.getState().draftText !== '') useAiStore.setState({ draftText: '' });
  draftLoadSeq += 1;
  const seq = draftLoadSeq;
  const target = draftConversation;
  if (target === null) return;
  void getBridge()
    .invoke('query:draft.get', { accountId: target.accountId, chatId: target.chatId })
    .then(({ text }) => {
      // drop stale loads: another switch happened, or the chatter already typed
      if (seq === draftLoadSeq && !draftDirty && text !== '') {
        useAiStore.setState({ draftText: text });
      }
    });
}

export function setDraftText(text: string): void {
  useAiStore.setState({ draftText: text });
  draftDirty = true;
  scheduleDraftSave();
}

export function setDockTone(tone: ReplyTone): void {
  useAiStore.setState({ toneOverride: tone });
}

export function cycleDockTone(defaultTone: ReplyTone): void {
  const state = useAiStore.getState();
  useAiStore.setState({ toneOverride: cycleTone(state.toneOverride ?? defaultTone) });
}

export function setToneMenuOpen(open: boolean): void {
  useAiStore.setState({ toneMenuOpen: open });
}

/**
 * Reply split-menu pick (variant C): set the active tone AND immediately start a
 * fast-reply in it — one click = one toned generation, no wasted "normal" run.
 * Closes the menu first; startAiFeature reads params.tone from toneOverride
 * (line in startAiFeature), so no new tone wiring reaches IPC/main. The single-
 * flight guard inside startAiFeature cancels any in-flight op for this chat.
 */
export function activateToneFromMenu(tone: DockTone, ctx: AiStartContext): void {
  setDockTone(tone);
  setToneMenuOpen(false);
  startAiFeature('fast-reply', ctx);
}

export function togglePreferSplit(): void {
  useAiStore.setState((s) => ({ preferSplit: !s.preferSplit }));
}

/** Reveal + flash the fan panel's Scan tab (scan completion, pointer-card click). */
export function focusScanTab(): void {
  const ui = useUiStore.getState();
  ui.setFanPanelTab('scan');
  if (ui.panelCollapsed) ui.togglePanel();
  useAiStore.setState((s) => ({ scanFlashSeq: s.scanFlashSeq + 1 }));
}

function flashPartFeedback(partIndex: number, kind: 'copied' | 'inserted'): void {
  useAiStore.setState({ partFeedback: { partIndex, kind } });
  if (feedbackResetTimer !== null) clearTimeout(feedbackResetTimer);
  feedbackResetTimer = setTimeout(() => {
    feedbackResetTimer = null;
    if (useAiStore.getState().partFeedback?.partIndex === partIndex) {
      useAiStore.setState({ partFeedback: null });
    }
  }, 1400);
}

/** Secondary copy affordance: part N (0 = all) → clipboard + 'COPIED' + instrumentation. */
export function copyDockPart(partIndex: number): void {
  const state = useAiStore.getState();
  if (state.op === null || state.status !== 'completed') return;
  const payload = copyPayload(copyablePartsOf(state.view), partIndex);
  if (payload === null) return;
  void navigator.clipboard.writeText(payload);
  flashPartFeedback(partIndex, 'copied');
  void getBridge().invoke('cmd:ai.feedback', {
    operationId: state.op.operationId,
    action: 'copied',
    partIndex,
    feature: state.op.feature,
  });
}

/**
 * Primary bubble action (click / ⌘1..9 / ⌘0): insert part N into the composer
 * (0 = all parts as a [NEXT] sequence). Degrades to copy when the chat cannot
 * be messaged (SPEC §7.0). Reports the matching cmd:ai.feedback action.
 */
export function activateDockPart(partIndex: number, ctx: { canSend: boolean }): void {
  const state = useAiStore.getState();
  if (state.op === null || state.status !== 'completed') return;
  const action = resolveDockPartAction(copyablePartsOf(state.view), partIndex, ctx.canSend);
  if (action === null) return;
  if (action.mode === 'insert') {
    setDraftText(appendToDraft(state.draftText, action.payload));
    focusComposer();
  } else {
    void navigator.clipboard.writeText(action.payload);
  }
  flashPartFeedback(partIndex, action.feedback);
  void getBridge().invoke('cmd:ai.feedback', {
    operationId: state.op.operationId,
    action: action.feedback,
    partIndex,
    feature: state.op.feature,
  });
}

// ─── Frame routing (called from bridge/events.ts) ─────────────────────────

export function handleAiOperationEvent(event: OperationEvent): void {
  const state = useAiStore.getState();
  if (!isFrameForOperation(state.op?.operationId ?? null, event)) return;
  switch (event.type) {
    case 'operation:progress':
      useAiStore.setState({
        phase: event.phase,
        progressMessage: event.message ?? null,
        progressPages:
          event.currentPage !== undefined && event.targetPages !== undefined
            ? { current: event.currentPage, target: event.targetPages }
            : null,
      });
      return;
    case 'operation:chunk':
      // Hot path: straight to the DOM sink — zero React updates per chunk.
      batcher?.push(event.text);
      return;
    case 'operation:debugPrompt':
      useAiStore.setState({ debugPrompt: event.snapshot });
      return;
    case 'operation:complete': {
      batcher?.flush();
      resetStream();
      const op = state.op;
      if (op === null) return;
      useAiStore.setState({
        status: 'completed',
        phase: 'completed',
        progressMessage: null,
        progressPages: null,
        view: deriveDockView(op.feature, event.result),
        spend: event.llmSpend ?? null,
        profiling: event.profiling ?? null,
      });
      // Scan body lives in the panel — point the chatter there (DESIGN §1).
      if (op.feature === 'fan-summary') focusScanTab();
      return;
    }
    case 'operation:error':
      resetStream();
      useAiStore.setState({
        status: 'error',
        phase: 'error',
        progressMessage: null,
        progressPages: null,
        error: event.error,
        profiling: event.profiling ?? null,
      });
      return;
    case 'operation:discarded':
      // Authoritative dismissal (chat_changed / cancelled / superseded).
      resetStream();
      useAiStore.setState(CLEARED);
      return;
  }
}
