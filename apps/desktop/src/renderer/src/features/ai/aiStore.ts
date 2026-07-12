// AI dock state + controller. The user-visible dock is still a single surface,
// but the underlying lifecycle is per conversation: a generation keeps running
// when the chatter switches chats, and the dock renders the job for the visible
// conversation only. Per-chunk frames never touch React state; each operation has
// its own imperative stream buffer/splitter and the visible sink replays it.

import { create } from 'zustand';
import type { ReplyTone } from '@chatgoose/shared/types';
import { getFeaturePolicy, type OperationFeature } from '@chatgoose/shared/features';
import { toUserFacing } from '@chatgoose/shared/errors/index';
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
  DOCK_FEATURE_LABELS,
  appendToDraft,
  copyPayload,
  copyablePartsOf,
  createChunkBatcher,
  createStreamSplitter,
  cycleTone,
  deriveDockView,
  resolveDockPartAction,
  type ChunkBatcher,
  type DockTone,
  type DockView,
  type StreamRenderOp,
  type StreamSplitter,
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

export interface AiJob extends ActiveAiOp {
  conversationKey: string;
  status: DockStatus;
  phase: OperationPhase;
  progressMessage: string | null;
  progressPages: { current: number; target: number } | null;
  view: DockView | null;
  error: UserFacingErrorPayload | null;
  spend: LlmSpendSummaryPayload | null;
  profiling: ProfilingSnapshotPayload | null;
  debugPrompt: Record<string, unknown> | null;
  /** Remaining daily AI gateway requests for the page (#120); null = unknown. */
  quotaRemainingRequests: number | null;
  /** True only when completion happened while this job was the visible dock job. */
  completedWhileVisible: boolean;
  startedAt: number;
  updatedAt: number;
}

export interface AiDockState {
  /** Job for the visible conversation, preserved for existing component selectors. */
  op: AiJob | null;
  status: DockStatus;
  phase: OperationPhase;
  progressMessage: string | null;
  progressPages: { current: number; target: number } | null;
  view: DockView | null;
  error: UserFacingErrorPayload | null;
  spend: LlmSpendSummaryPayload | null;
  profiling: ProfilingSnapshotPayload | null;
  debugPrompt: Record<string, unknown> | null;
  jobsById: Record<string, AiJob>;
  jobsByConversation: Record<string, string>;
  visibleConversationKey: string | null;
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

const MAX_RUNNING_JOBS = 3;
const MAX_TERMINAL_JOBS = 24;

function aiStartRejection(error: unknown): UserFacingErrorPayload {
  const normalized = toUserFacing(error);
  return {
    key: normalized.code,
    code: normalized.code,
    message: normalized.message,
    description: normalized.recovery,
    ...(normalized.detailText !== undefined ? { detailText: normalized.detailText } : {}),
    ...(normalized.settingsLink ? { settingsLink: true } : {}),
    ...(normalized.retryAtMs !== undefined ? { retryAtMs: normalized.retryAtMs } : {}),
    ...(normalized.retryAfterMs !== undefined ? { retryAfterMs: normalized.retryAfterMs } : {}),
  };
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

function visibleFields(job: AiJob | null): Partial<AiDockState> {
  if (job === null) return CLEARED;
  return {
    op: job,
    status: job.status,
    phase: job.phase,
    progressMessage: job.progressMessage,
    progressPages: job.progressPages,
    view: job.view,
    error: job.error,
    spend: job.spend,
    profiling: job.profiling,
    debugPrompt: job.debugPrompt,
  };
}

export function conversationKey(accountId: string, chatId: string): string {
  return `${accountId}/${chatId}`;
}

function visibleJobFrom(state: Pick<AiDockState, 'visibleConversationKey' | 'jobsByConversation' | 'jobsById'>): AiJob | null {
  if (state.visibleConversationKey === null) return null;
  const operationId = state.jobsByConversation[state.visibleConversationKey];
  return operationId === undefined ? null : state.jobsById[operationId] ?? null;
}

function withVisibleFields(
  patcher: (state: AiDockState) => Partial<AiDockState>,
): (state: AiDockState) => Partial<AiDockState> {
  return (state) => {
    const patch = patcher(state);
    const next = { ...state, ...patch };
    return { ...patch, ...visibleFields(visibleJobFrom(next)) };
  };
}

export function selectConversationJob(
  state: Pick<AiDockState, 'jobsByConversation' | 'jobsById'>,
  accountId: string,
  chatId: string,
): AiJob | null {
  const operationId = state.jobsByConversation[conversationKey(accountId, chatId)];
  return operationId === undefined ? null : state.jobsById[operationId] ?? null;
}

export const useAiStore = create<AiDockState>(() => ({
  ...CLEARED,
  jobsById: {},
  jobsByConversation: {},
  visibleConversationKey: null,
  toneOverride: null,
  toneMenuOpen: false,
  preferSplit: false,
  draftText: '',
  scanFlashSeq: 0,
}));

// ─── Imperative stream sinks (one per operation) ────────────────────────────

type SinkApply = (ops: StreamRenderOp[]) => void;

interface StreamState {
  splitter: StreamSplitter;
  batcher: ChunkBatcher;
  renderOps: StreamRenderOp[];
  sinkApply: SinkApply | null;
}

const streamsByOperation = new Map<string, StreamState>();

function createOperationStream(operationId: string): void {
  const splitter = createStreamSplitter();
  const stream: StreamState = {
    splitter,
    batcher: createChunkBatcher((text) => pushRenderOps(operationId, splitter.feed(text))),
    renderOps: [],
    sinkApply: null,
  };
  streamsByOperation.set(operationId, stream);
}

function pushRenderOps(operationId: string, ops: StreamRenderOp[]): void {
  if (ops.length === 0) return;
  const stream = streamsByOperation.get(operationId);
  if (stream === undefined) return;
  stream.renderOps.push(...ops);
  stream.sinkApply?.(ops);
}

function completeStream(operationId: string): void {
  const stream = streamsByOperation.get(operationId);
  if (stream === undefined) return;
  stream.batcher.flush();
  pushRenderOps(operationId, stream.splitter.finish());
  stream.batcher.dispose();
  stream.sinkApply = null;
}

function disposeStream(operationId: string): void {
  const stream = streamsByOperation.get(operationId);
  if (stream === undefined) return;
  stream.batcher.dispose();
  stream.sinkApply = null;
  streamsByOperation.delete(operationId);
}

export function registerStreamSink(operationId: string, apply: SinkApply): () => void {
  const stream = streamsByOperation.get(operationId);
  if (stream === undefined) return () => undefined;
  stream.sinkApply = apply;
  if (stream.renderOps.length > 0) apply(stream.renderOps);
  return () => {
    const current = streamsByOperation.get(operationId);
    if (current?.sinkApply === apply) current.sinkApply = null;
  };
}

// ─── Controller ─────────────────────────────────────────────────────────────

export interface AiStartContext {
  accountId: string;
  chatId: string;
  defaultTone: ReplyTone;
}

let lastDefaultTone: ReplyTone = 'casual';
let feedbackResetTimer: ReturnType<typeof setTimeout> | null = null;
let lastConversationKey: string | null = null;

function runningJobCount(state: Pick<AiDockState, 'jobsById'>): number {
  return Object.values(state.jobsById).filter((job) => job.status === 'running').length;
}

function removeJobPatch(
  state: AiDockState,
  operationId: string,
): Pick<AiDockState, 'jobsById' | 'jobsByConversation'> {
  const job = state.jobsById[operationId];
  const jobsById = { ...state.jobsById };
  const jobsByConversation = { ...state.jobsByConversation };
  delete jobsById[operationId];
  if (job !== undefined && jobsByConversation[job.conversationKey] === operationId) {
    delete jobsByConversation[job.conversationKey];
  }
  disposeStream(operationId);
  return { jobsById, jobsByConversation };
}

function evictTerminalJobs(
  jobsById: Record<string, AiJob>,
  jobsByConversation: Record<string, string>,
): { jobsById: Record<string, AiJob>; jobsByConversation: Record<string, string> } {
  const terminal = Object.values(jobsById)
    .filter((job) => job.status !== 'running')
    .sort((a, b) => a.updatedAt - b.updatedAt);
  if (terminal.length <= MAX_TERMINAL_JOBS) return { jobsById, jobsByConversation };

  const nextJobsById = { ...jobsById };
  const nextJobsByConversation = { ...jobsByConversation };
  for (const job of terminal.slice(0, terminal.length - MAX_TERMINAL_JOBS)) {
    delete nextJobsById[job.operationId];
    if (nextJobsByConversation[job.conversationKey] === job.operationId) {
      delete nextJobsByConversation[job.conversationKey];
    }
    disposeStream(job.operationId);
  }
  return { jobsById: nextJobsById, jobsByConversation: nextJobsByConversation };
}

/** Prompt echoes are exceptionally large debug artifacts, not user content.
 * Keep at most the newest one across all running/terminal jobs so the normal
 * 24-job history cannot multiply a multi-hundred-kilobyte snapshot. */
function replaceRetainedDebugPrompt(
  jobsById: Record<string, AiJob>,
  operationId: string,
  snapshot: Record<string, unknown>,
): Record<string, AiJob> {
  const next: Record<string, AiJob> = {};
  for (const [id, job] of Object.entries(jobsById)) {
    if (id === operationId) {
      next[id] = { ...job, debugPrompt: snapshot, updatedAt: Date.now() };
    } else if (job.debugPrompt !== null) {
      next[id] = { ...job, debugPrompt: null };
    } else {
      next[id] = job;
    }
  }
  return next;
}

function pushHiddenCompletionToast(job: AiJob, status: 'completed' | 'error'): void {
  const title = status === 'completed' ? 'AI ready' : 'AI failed';
  const feature = DOCK_FEATURE_LABELS[job.feature];
  useUiStore.getState().pushToast({
    title,
    body: `${feature} · chat ${job.chatId}`,
    accountId: job.accountId,
    chatId: job.chatId,
  });
}

export function startAiFeature(
  feature: LiveAiFeature,
  ctx: AiStartContext,
  opts: { draftText?: string; forceRegenerate?: boolean } = {},
): void {
  const state = useAiStore.getState();
  const key = conversationKey(ctx.accountId, ctx.chatId);
  const existingOperationId = state.jobsByConversation[key];
  const existingJob = existingOperationId === undefined ? null : state.jobsById[existingOperationId] ?? null;
  const replacingRunningSameChat = existingJob?.status === 'running';

  if (!replacingRunningSameChat && runningJobCount(state) >= MAX_RUNNING_JOBS) {
    useUiStore.getState().pushToast({
      title: 'AI busy',
      body: `${MAX_RUNNING_JOBS} generations are already running.`,
      accountId: ctx.accountId,
      chatId: ctx.chatId,
    });
    return;
  }

  const draft = (opts.draftText ?? state.draftText).trim();
  if (feature === 'improve-draft' && draft.length === 0) return;

  if (existingJob !== null) {
    if (existingJob.status === 'running') {
      void getBridge().invoke('ai:cancel', { operationId: existingJob.operationId });
    }
    const removed = removeJobPatch(state, existingJob.operationId);
    useAiStore.setState(withVisibleFields(() => removed));
  }

  lastDefaultTone = ctx.defaultTone;
  const operationId = crypto.randomUUID();
  const params: AiStartRequest['params'] = {};
  if (feature === 'fast-reply') {
    params.tone = state.toneOverride ?? ctx.defaultTone;
    params.mode = state.preferSplit ? 'preferSplit' : 'default';
  }
  if (feature === 'improve-draft') params.draftText = draft;
  if (opts.forceRegenerate === true) params.forceRegenerate = true;

  createOperationStream(operationId);
  const now = Date.now();
  const job: AiJob = {
    operationId,
    feature,
    accountId: ctx.accountId,
    chatId: ctx.chatId,
    conversationKey: key,
    status: 'running',
    phase: 'idle',
    progressMessage: null,
    progressPages: null,
    view: null,
    error: null,
    spend: null,
    profiling: null,
    debugPrompt: null,
    quotaRemainingRequests: null,
    completedWhileVisible: false,
    startedAt: now,
    updatedAt: now,
    ...(feature === 'improve-draft' ? { draftText: draft } : {}),
  };

  useAiStore.setState(
    withVisibleFields((s) => ({
      jobsById: { ...s.jobsById, [operationId]: job },
      jobsByConversation: { ...s.jobsByConversation, [key]: operationId },
    })),
  );
  void getBridge()
    .invoke('ai:start', {
      operationId,
      feature,
      accountId: ctx.accountId,
      chatId: ctx.chatId,
      params,
    })
    .catch((error: unknown) => {
      // Main can reject before the coordinator accepts the operation (for
      // example while the runtime is offline). Without a terminal frame this
      // local reservation stayed "running" forever and consumed a job slot.
      handleAiOperationEvent({
        type: 'operation:error',
        operationId,
        error: aiStartRejection(error),
      });
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
  const removed = removeJobPatch(state, state.op.operationId);
  useAiStore.setState(withVisibleFields(() => removed));
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
 * Conversation switch saves the outgoing chat's draft, loads the incoming chat's
 * draft and changes which AI job the dock renders. It does not cancel AI.
 */
export function handleConversationChange(accountId: string | null, chatId: string | null): void {
  const key = accountId !== null && chatId !== null ? conversationKey(accountId, chatId) : null;
  if (lastConversationKey === key) return;
  lastConversationKey = key;

  // Reset the active tone back to default (toneOverride → null) when the active
  // chat changes, so a "spicy" pick does not leak to the next fan.
  const state = useAiStore.getState();
  useAiStore.setState(
    withVisibleFields(() => ({
      visibleConversationKey: key,
      ...(state.toneOverride !== null || state.toneMenuOpen
        ? { toneOverride: null, toneMenuOpen: false }
        : {}),
    })),
  );

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
  const job = state.jobsById[event.operationId];
  if (job === undefined) return;
  const wasVisible = state.visibleConversationKey === job.conversationKey;
  switch (event.type) {
    case 'operation:progress':
      useAiStore.setState(
        withVisibleFields((s) => {
          const current = s.jobsById[event.operationId];
          if (current === undefined) return {};
          return {
            jobsById: {
              ...s.jobsById,
              [event.operationId]: {
                ...current,
                phase: event.phase,
                progressMessage: event.message ?? null,
                progressPages:
                  event.currentPage !== undefined && event.targetPages !== undefined
                    ? { current: event.currentPage, target: event.targetPages }
                    : null,
                updatedAt: Date.now(),
              },
            },
          };
        }),
      );
      return;
    case 'operation:chunk':
      streamsByOperation.get(event.operationId)?.batcher.push(event.text);
      return;
    case 'operation:debugPrompt':
      useAiStore.setState(
        withVisibleFields((s) => {
          const current = s.jobsById[event.operationId];
          if (current === undefined) return {};
          return {
            jobsById: replaceRetainedDebugPrompt(s.jobsById, event.operationId, event.snapshot),
          };
        }),
      );
      return;
    case 'operation:complete':
      completeStream(event.operationId);
      useAiStore.setState(
        withVisibleFields((s) => {
          const current = s.jobsById[event.operationId];
          if (current === undefined) return {};
          const completed: AiJob = {
            ...current,
            status: 'completed',
            phase: 'completed',
            progressMessage: null,
            progressPages: null,
            view: deriveDockView(current.feature, event.result),
            spend: event.llmSpend ?? null,
            profiling: event.profiling ?? null,
            quotaRemainingRequests: event.quotaRemainingRequests ?? null,
            completedWhileVisible: wasVisible,
            updatedAt: Date.now(),
          };
          const kept = evictTerminalJobs(
            { ...s.jobsById, [event.operationId]: completed },
            s.jobsByConversation,
          );
          return kept;
        }),
      );
      // Scan body lives in the panel — point the chatter there only when it is
      // still the visible chat. Hidden completions get a toast instead.
      if (job.feature === 'fan-summary' && wasVisible) focusScanTab();
      if (!wasVisible) pushHiddenCompletionToast(job, 'completed');
      return;
    case 'operation:error':
      disposeStream(event.operationId);
      useAiStore.setState(
        withVisibleFields((s) => {
          const current = s.jobsById[event.operationId];
          if (current === undefined) return {};
          const failed: AiJob = {
            ...current,
            status: 'error',
            phase: 'error',
            progressMessage: null,
            progressPages: null,
            error: event.error,
            profiling: event.profiling ?? null,
            updatedAt: Date.now(),
          };
          const kept = evictTerminalJobs(
            { ...s.jobsById, [event.operationId]: failed },
            s.jobsByConversation,
          );
          return kept;
        }),
      );
      if (!wasVisible) pushHiddenCompletionToast(job, 'error');
      return;
    case 'operation:discarded':
      useAiStore.setState(
        withVisibleFields((s) => {
          if (s.jobsById[event.operationId] === undefined) return {};
          return removeJobPatch(s, event.operationId);
        }),
      );
      return;
  }
}
