// AI dock state + controller. Per-chunk frames NEVER touch this store — they
// flow through the imperative stream sink into direct DOM text-node appends
// (DESIGN §3.4); only lifecycle frames (progress / complete / error /
// discarded / debugPrompt) update React state. Subscribe with per-field
// selectors only.

import { create } from 'zustand';
import type { ReplyTone } from '@chatgoose/shared/types';
import type {
  LlmSpendSummaryPayload,
  OperationEvent,
  OperationPhase,
  ProfilingSnapshotPayload,
  UserFacingErrorPayload,
} from '@chatgoose/shared/protocol/index';
import type { AiStartRequest } from '../../../../preload/contract';
import { getBridge } from '../../bridge/bridge';
import {
  copyPayload,
  copyablePartsOf,
  createChunkBatcher,
  createStreamSplitter,
  cycleTone,
  deriveDockView,
  isFrameForOperation,
  type ChunkBatcher,
  type DockView,
  type StreamRenderOp,
} from './dockLogic';

/** Live in P2 — Ping/Hi/Scan/Review stay dimmed until P4. */
export type LiveAiFeature = 'fast-reply' | 'improve-draft' | 'help-me';

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
  view: DockView | null;
  error: UserFacingErrorPayload | null;
  spend: LlmSpendSummaryPayload | null;
  profiling: ProfilingSnapshotPayload | null;
  debugPrompt: Record<string, unknown> | null;
  /** null = follow settings.defaultReplyTone. */
  toneOverride: ReplyTone | null;
  preferSplit: boolean;
  /** 'COPIED' feedback: 0 = all, 1..N = part N. */
  copiedIndex: number | null;
  /** Composer draft — feeds Improve Draft (companion mode). */
  draftText: string;
}

const CLEARED = {
  op: null,
  status: 'running',
  phase: 'idle',
  progressMessage: null,
  view: null,
  error: null,
  spend: null,
  profiling: null,
  debugPrompt: null,
  copiedIndex: null,
} satisfies Partial<AiDockState>;

export const useAiStore = create<AiDockState>(() => ({
  ...CLEARED,
  toneOverride: null,
  preferSplit: false,
  draftText: '',
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
let copiedResetTimer: ReturnType<typeof setTimeout> | null = null;
let lastConversationKey: string | null = null;

export function startAiFeature(
  feature: LiveAiFeature,
  ctx: AiStartContext,
  opts: { draftText?: string } = {},
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
  startAiFeature(
    state.op.feature,
    { accountId: state.op.accountId, chatId: state.op.chatId, defaultTone: lastDefaultTone },
    state.op.draftText !== undefined ? { draftText: state.op.draftText } : {},
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

/** Conversation switch dismisses the dock; the discarded frame then confirms. */
export function handleConversationChange(accountId: string | null, chatId: string | null): void {
  const state = useAiStore.getState();
  if (state.op !== null && (state.op.accountId !== accountId || state.op.chatId !== chatId)) {
    dismissDock();
  }
  const key = `${accountId ?? ''}/${chatId ?? ''}`;
  if (lastConversationKey !== key) {
    lastConversationKey = key;
    if (useAiStore.getState().draftText !== '') useAiStore.setState({ draftText: '' });
  }
}

export function setDraftText(text: string): void {
  useAiStore.setState({ draftText: text });
}

export function setDockTone(tone: ReplyTone): void {
  useAiStore.setState({ toneOverride: tone });
}

export function cycleDockTone(defaultTone: ReplyTone): void {
  const state = useAiStore.getState();
  useAiStore.setState({ toneOverride: cycleTone(state.toneOverride ?? defaultTone) });
}

export function togglePreferSplit(): void {
  useAiStore.setState((s) => ({ preferSplit: !s.preferSplit }));
}

/** Copy part N (0 = all) → clipboard + 'COPIED' feedback + acceptance instrumentation. */
export function copyDockPart(partIndex: number): void {
  const state = useAiStore.getState();
  if (state.op === null || state.status !== 'completed') return;
  const payload = copyPayload(copyablePartsOf(state.view), partIndex);
  if (payload === null) return;
  void navigator.clipboard.writeText(payload);
  useAiStore.setState({ copiedIndex: partIndex });
  if (copiedResetTimer !== null) clearTimeout(copiedResetTimer);
  copiedResetTimer = setTimeout(() => {
    copiedResetTimer = null;
    if (useAiStore.getState().copiedIndex === partIndex) {
      useAiStore.setState({ copiedIndex: null });
    }
  }, 1400);
  void getBridge().invoke('cmd:ai.feedback', {
    operationId: state.op.operationId,
    action: 'copied',
    partIndex,
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
        view: deriveDockView(op.feature, event.result),
        spend: event.llmSpend ?? null,
        profiling: event.profiling ?? null,
      });
      return;
    }
    case 'operation:error':
      resetStream();
      useAiStore.setState({
        status: 'error',
        phase: 'error',
        progressMessage: null,
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
