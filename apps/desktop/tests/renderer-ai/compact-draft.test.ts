import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILTIN_MESSAGE_GUARD_POLICY } from '@chatgoose/shared/message-guard/index';

const { invoke, focusComposer } = vi.hoisted(() => ({
  invoke: vi.fn<(channel: string, args: unknown) => Promise<unknown>>(),
  focusComposer: vi.fn(),
}));
vi.mock('../../src/renderer/src/bridge/bridge', () => ({
  getBridge: () => ({ invoke }),
}));
vi.mock('../../src/renderer/src/features/conversation/composerDom', () => ({ focusComposer }));

import {
  activateDockPart,
  autoInsertCompactDraft,
  handleAiOperationEvent,
  handleConversationChange,
  regenerateActiveOperation,
  resetAiJobsForHubOriginChange,
  selectConversationJob,
  setDraftText,
  startAiFeature,
  useAiStore,
  type AiStartContext,
  type LiveAiFeature,
} from '../../src/renderer/src/features/ai/aiStore';
import { sendCurrentDraft } from '../../src/renderer/src/features/conversation/sendController';
import { pendingComposerRows, useComposerStore } from '../../src/renderer/src/features/conversation/composerStore';
import { setCurrentGuardPolicy } from '../../src/renderer/src/features/conversation/guardLogic';
import { useVaultStore } from '../../src/renderer/src/features/vault/vaultStore';

const CTX: AiStartContext = { accountId: 'acct_1', chatId: '555', defaultTone: 'casual' };
const drafts = new Map<string, string>();

function complete(operationId: string, text = 'AI draft'): void {
  handleAiOperationEvent({
    type: 'operation:complete', operationId,
    feature: useAiStore.getState().jobsById[operationId]!.feature,
    result: { rawText: text, parts: [text], splitModeRequested: false },
  });
}

function startCompleted(ctx = CTX, feature: LiveAiFeature = 'fast-reply', text = 'AI draft'): string {
  startAiFeature(feature, ctx);
  const operationId = selectConversationJob(useAiStore.getState(), ctx.accountId, ctx.chatId)!.operationId;
  complete(operationId, text);
  return operationId;
}

async function reopenPreview(): Promise<void> {
  // QuickLook cleanup/remount uses this lifecycle. Draft persistence is mocked;
  // the retained AI job, its visible projection and the insertion action are real.
  handleConversationChange(null, null);
  handleConversationChange(CTX.accountId, CTX.chatId);
  await Promise.resolve();
}

beforeEach(async () => {
  vi.useFakeTimers();
  invoke.mockImplementation((channel, raw) => {
    const args = raw as { accountId: string; chatId: string; text?: string };
    const key = `${args.accountId}/${args.chatId}`;
    if (channel === 'query:draft.get') return Promise.resolve({ text: drafts.get(key) ?? '' });
    if (channel === 'cmd:draft.set') drafts.set(key, args.text ?? '');
    if (channel === 'cmd:send.message') return Promise.resolve({ localIds: ['mock-send'] });
    return Promise.resolve(undefined);
  });
  handleConversationChange(null, null);
  resetAiJobsForHubOriginChange();
  useAiStore.setState(useAiStore.getInitialState(), true);
  drafts.clear();
  useComposerStore.getState().reset();
  useVaultStore.getState().reset();
  pendingComposerRows.clear();
  setCurrentGuardPolicy(BUILTIN_MESSAGE_GUARD_POLICY);
  handleConversationChange(CTX.accountId, CTX.chatId);
  await Promise.resolve();
  invoke.mockClear();
  focusComposer.mockClear();
});

afterEach(() => {
  handleConversationChange(null, null);
  resetAiJobsForHubOriginChange();
  setCurrentGuardPolicy(null);
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('compact draft insertion receipt', () => {
  it('inserts once across repeated effects and remounts, retaining the receipt on the job', async () => {
    const operationId = startCompleted();
    expect(autoInsertCompactDraft(operationId, { canSend: true })).toBe(true);
    expect(autoInsertCompactDraft(operationId, { canSend: true })).toBe(false);
    await reopenPreview();
    expect(autoInsertCompactDraft(operationId, { canSend: true })).toBe(false);
    expect(useAiStore.getState().draftText).toBe('AI draft');
    expect(useAiStore.getState().jobsById[operationId]?.draftInserted).toBe(true);
    expect(focusComposer).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls.filter(([channel]) => channel === 'cmd:ai.feedback')).toHaveLength(1);
    expect(invoke.mock.calls.some(([channel]) => channel === 'cmd:send.message')).toBe(false);
  });

  it('does not restore an accepted send when the preview reopens', async () => {
    const operationId = startCompleted(CTX, 'fast-reply', 'How was your day?');
    autoInsertCompactDraft(operationId, { canSend: true });
    sendCurrentDraft({ ...CTX, canSend: true });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(useAiStore.getState().draftText).toBe('');
    expect(invoke.mock.calls.filter(([channel]) => channel === 'cmd:send.message')).toHaveLength(1);
    await reopenPreview();
    expect(autoInsertCompactDraft(operationId, { canSend: true })).toBe(false);
    expect(useAiStore.getState().draftText).toBe('');
  });

  it.each(['', 'My edited answer'])('preserves a cleared/edited draft (%j) on reopening', async (edited) => {
    setDraftText('Human introduction');
    const operationId = startCompleted();
    autoInsertCompactDraft(operationId, { canSend: true });
    expect(useAiStore.getState().draftText).toBe('Human introduction\nAI draft');
    setDraftText(edited);
    await reopenPreview();
    expect(autoInsertCompactDraft(operationId, { canSend: true })).toBe(false);
    expect(useAiStore.getState().draftText).toBe(edited);
  });

  it('keeps explicit insertion repeatable, while a full-dock insertion consumes auto-insert', async () => {
    const operationId = startCompleted();
    activateDockPart(1, { canSend: true });
    setDraftText('');
    await reopenPreview();
    expect(autoInsertCompactDraft(operationId, { canSend: true })).toBe(false);
    activateDockPart(1, { canSend: true });
    activateDockPart(1, { canSend: true });
    expect(useAiStore.getState().draftText).toBe('AI draft\nAI draft');
  });

  it('gives a regenerated operation its own receipt and ignores an old effect', () => {
    const originalId = startCompleted();
    autoInsertCompactDraft(originalId, { canSend: true });
    setDraftText('');
    regenerateActiveOperation();
    const nextId = useAiStore.getState().op!.operationId;
    expect(nextId).not.toBe(originalId);
    expect(useAiStore.getState().op?.draftInserted).toBe(false);
    complete(nextId, 'New generation');
    expect(autoInsertCompactDraft(originalId, { canSend: true })).toBe(false);
    expect(autoInsertCompactDraft(nextId, { canSend: true })).toBe(true);
    expect(useAiStore.getState().draftText).toBe('New generation');
  });

  it.each([
    { ...CTX, chatId: '556' },
    { ...CTX, accountId: 'acct_2' },
  ])('rejects an effect from another account/chat: %j', async (other) => {
    const originalId = startCompleted();
    handleConversationChange(other.accountId, other.chatId);
    await Promise.resolve();
    setDraftText('Other conversation draft');
    const otherId = startCompleted(other);
    expect(autoInsertCompactDraft(originalId, { canSend: true })).toBe(false);
    expect(useAiStore.getState().draftText).toBe('Other conversation draft');
    expect(useAiStore.getState().jobsById[originalId]?.draftInserted).toBe(false);
    expect(autoInsertCompactDraft(otherId, { canSend: true })).toBe(true);
    handleConversationChange(CTX.accountId, CTX.chatId);
    await Promise.resolve();
    expect(useAiStore.getState().draftText).toBe('');
    expect(autoInsertCompactDraft(originalId, { canSend: true })).toBe(true);
    expect(useAiStore.getState().draftText).toBe('AI draft');
  });

  it('preserves the manual-only behavior of a job completed while hidden', async () => {
    startAiFeature('fast-reply', CTX);
    const operationId = useAiStore.getState().op!.operationId;
    handleConversationChange(CTX.accountId, '556');
    complete(operationId);
    handleConversationChange(CTX.accountId, CTX.chatId);
    await Promise.resolve();
    expect(autoInsertCompactDraft(operationId, { canSend: true })).toBe(false);
    expect(useAiStore.getState().draftText).toBe('');
    activateDockPart(1, { canSend: true });
    expect(useAiStore.getState().draftText).toBe('AI draft');
  });

  it('does not consume the receipt for a non-insertable or copy-only result', () => {
    const operationId = startCompleted();
    expect(autoInsertCompactDraft(operationId, { canSend: false })).toBe(false);
    expect(useAiStore.getState().op?.draftInserted).toBe(false);
    const variantsId = startCompleted(CTX, 'hi-greeting');
    expect(autoInsertCompactDraft(variantsId, { canSend: true })).toBe(false);
    expect(useAiStore.getState().draftText).toBe('');
    expect(useAiStore.getState().op?.draftInserted).toBe(false);
  });
});
