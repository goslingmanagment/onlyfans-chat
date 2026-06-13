// Quick-look helpers shared by the overlay and the global keymap. AI starts
// from the preview pass the SAME gates as the composer pill row (PLAN item 12:
// reuse the existing feature-gate logic); gated invocations are silent no-ops —
// the coordinator's CG-FLOW-* checks stay authoritative.

import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type {
  AccountVM,
  MessageVM,
  PingGateVM,
  SettingsVM,
  SpenderRowVM,
} from '../../../../preload/contract';
import { getBridge } from '../../bridge/bridge';
import { qk } from '../../bridge/queries';
import { useUiStore } from '../../state/uiStore';
import { startAiFeature } from '../ai/aiStore';
import { deriveHiLocked, evaluateAiGate, evaluateHiGate, evaluatePingGate } from '../ai/dockLogic';
import { pingGateKey } from '../ai/pingGate';
import { useSpendersStore } from './spendersStore';

export const PREVIEW_TEXTAREA_ID = 'spenders-preview-composer';

// ── On-open thread hydration (owner request 2026-06-13: counters were
// one-sided for never-opened chats). One read-only tail GET per fan when the
// quick look opens with incomplete local history; the TTL guard keeps J/K
// walking from re-spending on fans already fetched this session.
export const PREVIEW_HYDRATE_TTL_MS = 5 * 60_000;
const hydratedAt = new Map<string, number>();

/** Incomplete local history: no chat row, a one-sided counter, or an empty
 *  cached thread — exactly the cases where the upstream tail has more. */
export function previewNeedsHydration(
  row: SpenderRowVM | null,
  threadEmpty: boolean,
): boolean {
  if (row === null) return threadEmpty;
  return !row.hasChat || row.fanDays === null || row.modelDays === null || threadEmpty;
}

export function hydratePreviewFan(accountId: string, fanId: string): void {
  const key = `${accountId}|${fanId}`;
  const last = hydratedAt.get(key);
  if (last !== undefined && Date.now() - last < PREVIEW_HYDRATE_TTL_MS) return;
  hydratedAt.set(key, Date.now());
  // Fire-and-forget: db:changed events refresh the thread and board queries.
  void getBridge()
    .invoke('cmd:spenders.hydrate', { accountId, chatId: fanId })
    .catch(() => hydratedAt.delete(key)); // transient failure → retry on next open
}

export function focusPreviewComposer(): void {
  const el = document.getElementById(PREVIEW_TEXTAREA_ID);
  if (el instanceof HTMLTextAreaElement && !el.disabled) el.focus();
}

/** The three pill features the preview exposes (mockup: Ping primary, Reply, Hi). */
export type PreviewAiFeature = 'ping' | 'fast-reply' | 'hi-greeting';

export function startAiFromPreview(feature: PreviewAiFeature, queryClient: QueryClient): void {
  const ui = useUiStore.getState();
  const fanId = useSpendersStore.getState().previewFanId;
  if (ui.view !== 'spenders' || ui.selectedAccountId === null || fanId === null) return;
  const accountId = ui.selectedAccountId;

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
