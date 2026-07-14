import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountVM, SettingsVM, SpenderRowVM } from '../../src/preload/contract';

const invoke = vi.hoisted(() =>
  vi.fn<(channel: string, args: unknown) => Promise<unknown>>(() => Promise.resolve({ text: '' })),
);
vi.mock('../../src/renderer/src/bridge/bridge', () => ({
  getBridge: () => ({ invoke }),
}));

import { qk } from '../../src/renderer/src/bridge/queries';
import { useAiStore } from '../../src/renderer/src/features/ai/aiStore';
import { pingGateKey } from '../../src/renderer/src/features/ai/pingGate';
import { startAiFromPreview } from '../../src/renderer/src/features/spenders/previewActions';
import { useSpendersStore } from '../../src/renderer/src/features/spenders/spendersStore';
import { useUiStore } from '../../src/renderer/src/state/uiStore';

const ACCOUNT_ID = 'acct_1';
const FAN_ID = 'fan_1';

function resetAiStore(): void {
  useAiStore.setState({
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
    visibleConversationKey: `${ACCOUNT_ID}/${FAN_ID}`,
    toneOverride: null,
    toneMenuOpen: false,
    preferSplit: false,
    partFeedback: null,
    draftText: '',
    scanFlashSeq: 0,
  });
}

function makeQueryClient(): QueryClient {
  const queryClient = new QueryClient();
  queryClient.setQueryData(qk.settings, {
    // Stage 31: a hub connection IS the AI configuration.
    hasHubKey: true,
    hubApiKeyBindingState: 'bound',
    hasHubDeviceToken: false,
    hubDeviceTokenBindingState: 'none',
    hubBaseUrl: 'https://hub.example.com',
    defaultReplyTone: 'casual',
  } as SettingsVM);
  queryClient.setQueryData(qk.accounts, [
    { id: ACCOUNT_ID, personalityId: 'builtin:lora' } as AccountVM,
  ]);
  queryClient.setQueryData(pingGateKey(ACCOUNT_ID, FAN_ID), { segment: 'segment-b', blocked: false });
  return queryClient;
}

function seedLoadedMessages(queryClient: QueryClient): void {
  queryClient.setQueryData(qk.messages(ACCOUNT_ID, FAN_ID), {
    pages: [{ items: [], hasMore: false }],
    pageParams: [null],
  });
}

function openPreview(blocked: boolean): void {
  const row = { fanId: FAN_ID } as SpenderRowVM;
  useUiStore.setState({ view: 'spenders', selectedAccountId: ACCOUNT_ID, selectedChatId: null });
  useSpendersStore.setState({
    previewFanId: FAN_ID,
    cursorFanId: FAN_ID,
    visibleRows: [row],
    statsRows: [],
    previewAiBlocked: blocked ? { fanId: FAN_ID, reason: 'Loading history' } : null,
  });
}

beforeEach(() => {
  invoke.mockClear();
  resetAiStore();
  useSpendersStore.setState({
    previewFanId: null,
    cursorFanId: null,
    visibleRows: [],
    statsRows: [],
    previewAiBlocked: null,
  });
  useUiStore.setState({ view: 'workspace', selectedAccountId: null, selectedChatId: null });
});

describe('startAiFromPreview hydrate gate', () => {
  it('does not start preview AI while hydrate blocks the current fan', () => {
    const queryClient = makeQueryClient();
    seedLoadedMessages(queryClient);
    openPreview(true);

    startAiFromPreview('ping', queryClient);

    expect(useAiStore.getState().op).toBeNull();
    expect(invoke.mock.calls.some((call) => call[0] === 'ai:start')).toBe(false);
  });

  it('does not start preview AI before messages are loaded', () => {
    const queryClient = makeQueryClient();
    openPreview(false);

    startAiFromPreview('ping', queryClient);

    expect(useAiStore.getState().op).toBeNull();
    expect(invoke.mock.calls.some((call) => call[0] === 'ai:start')).toBe(false);
  });

  it('starts preview AI once the current fan is not hydrate-blocked', () => {
    const queryClient = makeQueryClient();
    seedLoadedMessages(queryClient);
    openPreview(false);

    startAiFromPreview('ping', queryClient);

    expect(useAiStore.getState().op).toMatchObject({ feature: 'ping', chatId: FAN_ID });
    expect(invoke.mock.calls.some((call) => call[0] === 'ai:start')).toBe(true);
  });
});
