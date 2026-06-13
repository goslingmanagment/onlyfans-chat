// Quick-look helpers shared by the overlay and the global keymap. AI starts
// from the preview pass the SAME gates as the composer pill row (PLAN item 12:
// reuse the existing feature-gate logic); gated invocations are silent no-ops —
// the coordinator's CG-FLOW-* checks stay authoritative.

import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type {
  AccountVM,
  MessageVM,
  PingGateVM,
  SpenderRowVM,
  SettingsVM,
} from '../../../../preload/contract';
import { getBridge } from '../../bridge/bridge';
import { qk } from '../../bridge/queries';
import { useUiStore } from '../../state/uiStore';
import { startAiFeature } from '../ai/aiStore';
import { deriveHiLocked, evaluateAiGate, evaluateHiGate, evaluatePingGate } from '../ai/dockLogic';
import { pingGateKey } from '../ai/pingGate';
import { previewRow, useSpendersStore } from './spendersStore';

export const PREVIEW_TEXTAREA_ID = 'spenders-preview-composer';

// ── On-open thread hydration (PLAN item 13: EVERY open hydrates). One
// read-only tail GET per quick-look open — the same fetch a full chat open
// does — so a chatter working the reactivation queue self-refreshes data fan
// by fan. Main owns the spend ceiling: the per-fan thread-fetch stamp (5-min
// TTL, persisted, shared with the refresh queue) makes repeat opens and J/K
// walking free.
export function hydratePreviewFan(accountId: string, fanId: string, username?: string | null): void {
  // Fire-and-forget: db:changed events refresh the thread and board queries.
  void getBridge()
    .invoke('cmd:spenders.hydrate', {
      accountId,
      chatId: fanId,
      ...(username !== undefined ? { username } : {}),
    })
    .catch(() => undefined); // transient failure → the next open retries
}

export async function ensureAndOpenPreviewChat(row: SpenderRowVM): Promise<boolean> {
  const ui = useUiStore.getState();
  if (ui.view !== 'spenders' || ui.selectedAccountId === null) return false;
  const accountId = ui.selectedAccountId;
  const result = await getBridge().invoke('cmd:spenders.hydrate', {
    accountId,
    chatId: row.fanId,
    username: row.username,
  });
  if (!result.hasChat) return false;
  ui.selectChat(accountId, row.fanId);
  return true;
}

export function focusPreviewComposer(): void {
  const el = document.getElementById(PREVIEW_TEXTAREA_ID);
  if (el instanceof HTMLTextAreaElement && !el.disabled) el.focus();
}

/** The three pill features the preview exposes (mockup: Ping primary, Reply, Hi). */
export type PreviewAiFeature = 'ping' | 'fast-reply' | 'hi-greeting';

export function startAiFromPreview(feature: PreviewAiFeature, queryClient: QueryClient): void {
  const ui = useUiStore.getState();
  const row = previewRow(useSpendersStore.getState());
  if (ui.view !== 'spenders' || ui.selectedAccountId === null || row === null) return;
  if (!row.canSendMessage) return;
  const accountId = ui.selectedAccountId;
  const fanId = row.fanId;

  const settings = queryClient.getQueryData<SettingsVM>(qk.settings);
  const account = queryClient
    .getQueryData<AccountVM[]>(qk.accounts)
    ?.find((a) => a.id === accountId);
  if (settings === undefined || account === undefined) return;

  const gate = evaluateAiGate({
    mapped: account.personalityId !== null,
    hasLlmKey: settings.hasAnthropicKey || settings.hasOpenRouterKey,
  });
  if (!gate.ok) return;

  if (feature === 'ping') {
    const pingGate = queryClient.getQueryData<PingGateVM>(pingGateKey(accountId, fanId));
    if (!evaluatePingGate(gate, pingGate?.blocked ?? null).enabled) return;
  }
  if (feature === 'hi-greeting') {
    const pages = queryClient.getQueryData<InfiniteData<{ items: MessageVM[]; hasMore: boolean }>>(
      qk.messages(accountId, fanId),
    )?.pages;
    if (!evaluateHiGate(gate, deriveHiLocked(pages)).enabled) return;
  }

  startAiFeature(feature, { accountId, chatId: fanId, defaultTone: settings.defaultReplyTone });
}
