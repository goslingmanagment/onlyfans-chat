import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn<() => Promise<unknown>>(() => Promise.resolve(undefined)));

vi.mock('../../src/renderer/src/bridge/bridge', () => ({
  getBridge: () => ({ platform: 'darwin', invoke, on: vi.fn() }),
}));

import { setDraftText, useAiStore } from '../../src/renderer/src/features/ai/aiStore';
import { sendCurrentDraft } from '../../src/renderer/src/features/conversation/sendController';
import { MAX_SEND_PARTS } from '../../src/renderer/src/features/conversation/sendLogic';
import { useVaultStore } from '../../src/renderer/src/features/vault/vaultStore';
import { useSettingsCache } from '../../src/renderer/src/state/settingsCache';
import { useUiStore } from '../../src/renderer/src/state/uiStore';

describe('sendCurrentDraft', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { language: 'en-US' });
    invoke.mockClear();
    setDraftText('');
    useUiStore.setState({ toasts: [] });
    useSettingsCache.setState({ uiLocale: 'en' });
    useVaultStore.getState().reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps overlong NEXT sequences local and shows a toast', () => {
    const draft = Array.from({ length: MAX_SEND_PARTS + 1 }, (_, index) => `part ${index + 1}`).join('[NEXT]');
    setDraftText(draft);

    sendCurrentDraft({ accountId: 'acct_1', chatId: '101', canSend: true });

    expect(invoke).not.toHaveBeenCalled();
    expect(useAiStore.getState().draftText).toBe(draft);
    expect(useUiStore.getState().toasts.at(-1)).toMatchObject({
      title: 'Too many message parts',
      body: 'Draft has 11 parts. Keep it to 10 or fewer [NEXT] parts.',
    });
  });
});
