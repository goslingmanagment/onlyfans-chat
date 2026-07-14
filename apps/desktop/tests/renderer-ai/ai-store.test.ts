// Store-action coverage for the Reply split-menu (variant C) tone plumbing:
// activateToneFromMenu (one click = set tone + close menu + start a toned
// fast-reply), setToneMenuOpen (bare flip), and the handleConversationChange
// tone reset that keeps a "spicy" pick from leaking into the next fan
// (sticky-within-chat / reset-on-switch — the highest-risk path). Pure store +
// bridge mock, mirroring the renderer-ai logic suites; the tone path runs no DOM
// and no real IPC. (aiStore transitively references DOM types, so this file is
// typechecked under tsconfig.test-web.json — the web lib — not the node project.)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReplyTone } from '@chatgoose/shared/types';
import type { AiStartRequest } from '../../src/preload/contract';

// Mock the bridge BEFORE importing the store: getBridge runs at module scope
// inside the controller actions (ai:start / ai:cancel), and in the node test
// env `window` is undefined, so the real getBridge would throw. invoke is a
// resolved-promise stub we assert against.
const invoke = vi.hoisted(() =>
  vi.fn<(channel: string, args: unknown) => Promise<unknown>>(() => Promise.resolve({ text: '' })),
);
vi.mock('../../src/renderer/src/bridge/bridge', () => ({
  getBridge: () => ({ invoke }),
}));

import {
  useAiStore,
  activateToneFromMenu,
  beginAiHubOriginChange,
  endAiHubOriginChange,
  setToneMenuOpen,
  handleConversationChange,
  handleAiOperationEvent,
  resetAiJobsForHubOriginChange,
  startAiFeature,
  type AiStartContext,
} from '../../src/renderer/src/features/ai/aiStore';
import { useUiStore } from '../../src/renderer/src/state/uiStore';

const CTX: AiStartContext = { accountId: 'acct_1', chatId: '555', defaultTone: 'casual' };

// Full initial-state shape — reset between tests so a prior op/draft never
// bleeds across cases (the prior store-test attempt crashed reading draftText
// from a half-initialised store; here every field is seeded).
function resetStore(): void {
  useAiStore.setState(
    {
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
      jobsById: {},
      jobsByConversation: {},
      visibleConversationKey: null,
      toneOverride: null,
      toneMenuOpen: false,
      preferSplit: false,
      partFeedback: null,
      draftText: '',
      scanFlashSeq: 0,
    },
    true,
  );
}

/** The ai:start request the last invoke fired (the controller's only start call). */
function lastAiStart(): AiStartRequest {
  const call = invoke.mock.calls.find((c) => c[0] === 'ai:start');
  if (call === undefined) throw new Error('no ai:start invoke recorded');
  return call[1] as AiStartRequest;
}

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue({ text: '' });
  resetStore();
  useUiStore.setState({ toasts: [] });
  // Module-level lastConversationKey persists across tests; force a visible
  // empty state before selecting the test chat.
  handleConversationChange(null, null);
  handleConversationChange(CTX.accountId, CTX.chatId);
  invoke.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('setToneMenuOpen (bare state flip)', () => {
  it('opens and closes the Reply split-menu', () => {
    expect(useAiStore.getState().toneMenuOpen).toBe(false);
    setToneMenuOpen(true);
    expect(useAiStore.getState().toneMenuOpen).toBe(true);
    setToneMenuOpen(false);
    expect(useAiStore.getState().toneMenuOpen).toBe(false);
  });

  it('does not start a generation on its own', () => {
    setToneMenuOpen(true);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('activateToneFromMenu (one click = set tone + close + toned fast-reply)', () => {
  it('sets the tone override, closes the menu, and starts a fast-reply in that tone', () => {
    setToneMenuOpen(true);
    activateToneFromMenu('spicy', CTX);

    const state = useAiStore.getState();
    expect(state.toneOverride).toBe('spicy');
    expect(state.toneMenuOpen).toBe(false);
    // exactly one start fired — no wasted "normal" run before the toned one
    expect(invoke.mock.calls.filter((c) => c[0] === 'ai:start')).toHaveLength(1);

    const req = lastAiStart();
    expect(req.feature).toBe('fast-reply');
    expect(req.params.tone).toBe<ReplyTone>('spicy');
    expect(req.accountId).toBe(CTX.accountId);
    expect(req.chatId).toBe(CTX.chatId);
    // the op is registered as the running fast-reply for this chat
    expect(state.op).toMatchObject({ feature: 'fast-reply', chatId: CTX.chatId });
  });

  it('cancels an in-flight op before launching the toned generation (single-flight)', () => {
    activateToneFromMenu('flirty', CTX); // first op now running
    invoke.mockClear();
    activateToneFromMenu('upsell', CTX); // should cancel the first, start the second

    expect(invoke.mock.calls.some((c) => c[0] === 'ai:cancel')).toBe(true);
    expect(useAiStore.getState().toneOverride).toBe('upsell');
    expect(lastAiStart().params.tone).toBe<ReplyTone>('upsell');
  });
});

describe('handleConversationChange (sticky-within-chat / reset-on-switch)', () => {
  it('resets toneOverride → null and toneMenuOpen → false on a chat switch', () => {
    // a spicy pick is active and (hypothetically) the menu got reopened
    activateToneFromMenu('spicy', CTX);
    setToneMenuOpen(true);
    expect(useAiStore.getState().toneOverride).toBe('spicy');

    handleConversationChange(CTX.accountId, '999'); // different fan

    const state = useAiStore.getState();
    expect(state.toneOverride).toBeNull();
    expect(state.toneMenuOpen).toBe(false);
  });

  it('does not leak a spicy override into the next fan’s fast-reply default', () => {
    activateToneFromMenu('spicy', CTX);
    handleConversationChange(CTX.accountId, '999');
    // next fan starts from the settings default again (override cleared)
    expect(useAiStore.getState().toneOverride).toBeNull();
  });

  it('keeps a running generation alive while another fan is visible', () => {
    activateToneFromMenu('flirty', CTX);
    const operationId = useAiStore.getState().op?.operationId;
    expect(operationId).toBeTruthy();

    invoke.mockClear();
    handleConversationChange(CTX.accountId, '999');

    expect(invoke.mock.calls.some((c) => c[0] === 'ai:cancel')).toBe(false);
    expect(useAiStore.getState().op).toBeNull();
    expect(useAiStore.getState().jobsById[operationId ?? '']).toMatchObject({
      status: 'running',
      chatId: CTX.chatId,
    });

    handleConversationChange(CTX.accountId, CTX.chatId);
    expect(useAiStore.getState().op?.operationId).toBe(operationId);
  });

  it('drops every old-Hub AI result while preserving the human draft and tone state', () => {
    useAiStore.setState({ draftText: 'human draft', toneOverride: 'flirty', preferSplit: true });
    startAiFeature('fast-reply', CTX);
    const operationId = useAiStore.getState().op?.operationId;
    expect(operationId).toBeTruthy();
    handleAiOperationEvent({
      type: 'operation:complete',
      operationId: operationId!,
      feature: 'fast-reply',
      result: { rawText: 'Hub A result', parts: ['Hub A result'], splitModeRequested: false },
    });
    expect(useAiStore.getState().view).not.toBeNull();

    resetAiJobsForHubOriginChange();

    expect(useAiStore.getState()).toMatchObject({
      jobsById: {},
      jobsByConversation: {},
      op: null,
      view: null,
      debugPrompt: null,
      draftText: 'human draft',
      toneOverride: 'flirty',
      preferSplit: true,
    });
    // A late terminal frame from the retired runtime cannot resurrect A data.
    handleAiOperationEvent({
      type: 'operation:complete',
      operationId: operationId!,
      feature: 'fast-reply',
      result: { rawText: 'late Hub A result', parts: ['late Hub A result'], splitModeRequested: false },
    });
    expect(useAiStore.getState().view).toBeNull();
  });

  it('does not admit a new job while a Hub-origin mutation is in flight', () => {
    beginAiHubOriginChange();
    try {
      startAiFeature('fast-reply', CTX);
      expect(invoke).not.toHaveBeenCalled();
      expect(useAiStore.getState().jobsById).toEqual({});
      expect(useUiStore.getState().toasts.at(-1)).toMatchObject({
        title: 'Hub settings updating',
      });
    } finally {
      endAiHubOriginChange();
    }
  });

  it('blocks the fourth concurrent generation with a visible toast', () => {
    startAiFeature('fast-reply', CTX);
    startAiFeature('fast-reply', { ...CTX, chatId: '556' });
    startAiFeature('fast-reply', { ...CTX, chatId: '557' });
    invoke.mockClear();

    startAiFeature('fast-reply', { ...CTX, chatId: '558' });

    expect(invoke.mock.calls.some((c) => c[0] === 'ai:start')).toBe(false);
    expect(Object.values(useAiStore.getState().jobsById).filter((job) => job.status === 'running')).toHaveLength(3);
    expect(useUiStore.getState().toasts.at(-1)).toMatchObject({
      title: 'AI busy',
      body: '3 generations are already running.',
    });
  });

  it('settles a main-side ai:start rejection and releases its concurrency slot', async () => {
    invoke.mockRejectedValueOnce(new Error('AI runtime is offline'));
    startAiFeature('fast-reply', CTX);
    const rejectedId = useAiStore.getState().jobsByConversation['acct_1/555'];
    expect(rejectedId).toBeTruthy();

    await vi.waitFor(() => {
      expect(useAiStore.getState().jobsById[rejectedId!]).toMatchObject({
        status: 'error',
        phase: 'error',
        error: { code: 'CG-APP-01' },
      });
    });

    startAiFeature('fast-reply', { ...CTX, chatId: '556' });
    startAiFeature('fast-reply', { ...CTX, chatId: '557' });
    startAiFeature('fast-reply', { ...CTX, chatId: '558' });
    expect(Object.values(useAiStore.getState().jobsById).filter((job) => job.status === 'running'))
      .toHaveLength(3);
    expect(useUiStore.getState().toasts.some((toast) => toast.title === 'AI busy')).toBe(false);
  });

  it('retains only the newest large debug prompt across the terminal-job history', () => {
    startAiFeature('fast-reply', CTX);
    startAiFeature('fast-reply', { ...CTX, chatId: '556' });
    const state = useAiStore.getState();
    const firstId = state.jobsByConversation['acct_1/555'];
    const secondId = state.jobsByConversation['acct_1/556'];
    expect(firstId).toBeTruthy();
    expect(secondId).toBeTruthy();

    handleAiOperationEvent({
      type: 'operation:debugPrompt',
      operationId: firstId!,
      feature: 'fast-reply',
      snapshot: { systemBlocks: [{ text: 'first', cache: '1h' }] },
    });
    handleAiOperationEvent({
      type: 'operation:debugPrompt',
      operationId: secondId!,
      feature: 'fast-reply',
      snapshot: { systemBlocks: [{ text: 'second', cache: '1h' }] },
    });

    const retained = useAiStore.getState().jobsById;
    expect(retained[firstId!]?.debugPrompt).toBeNull();
    expect(retained[secondId!]?.debugPrompt).toMatchObject({
      systemBlocks: [{ text: 'second' }],
    });
  });

  it('no-ops when the conversation key is unchanged (override stays put)', () => {
    activateToneFromMenu('spicy', CTX);
    setToneMenuOpen(true);

    // same account+chat as the beforeEach seed → early return, no reset
    handleConversationChange(CTX.accountId, CTX.chatId);

    const state = useAiStore.getState();
    expect(state.toneOverride).toBe('spicy');
    expect(state.toneMenuOpen).toBe(true);
  });
});
