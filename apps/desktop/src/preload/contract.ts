// The renderer↔main contract: channel names + narrow view models (DESIGN §3.3 —
// the renderer never sees raw OFAPI JSON). Imported by main (handlers), preload
// (bridge), and renderer (types only). Operation/sync event payloads come from
// @chatgoose/shared/protocol.

import type {
  FeatureType,
  ModelSelectableFeature,
  PingSegment,
  ReasoningEffort,
  ReplyMode,
  ReplyTone,
  Personality,
} from '@chatgoose/shared/types';
import type { OperationEvent, SyncEvent } from '@chatgoose/shared/protocol/index';

// ─── View models ─────────────────────────────────────────────────────────

export interface AccountVM {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null; // media:// URL
  isAuthenticated: boolean;
  unreadCount: number;
  personalityId: string | null;
}

export type ChatFilter = 'all' | 'unread' | 'with_tips';

export interface ChatListItemVM {
  chatId: string; // raw OF numeric id as string (=== fanId)
  fanId: string;
  fanName: string;
  avatarUrl: string | null;
  lastMessageAt: string | null; // ISO
  lastMessagePreview: string;
  lastMessageIsSentByMe: boolean;
  unreadCount: number;
  hasUnreadTips: boolean;
  /** PRD F2: fan waiting = last message from fan + unread > 0. */
  fanWaiting: boolean;
  canSendMessage: boolean;
  /** Platform-provided reason when canSendMessage=false (SPEC §7.0 composer state). */
  canNotSendReason: string | null;
}

export interface MessageMediaVM {
  id: string;
  type: 'photo' | 'video' | 'audio' | 'gif' | 'other';
  thumbUrl: string | null; // media:// URL
  fullUrl: string | null; // media:// URL
  isReady: boolean;
  /** Locked behind PPV and not viewable. */
  locked: boolean;
  durationSeconds: number | null;
}

export type PpvStateVM = 'purchased' | 'not_purchased' | 'unknown';

export interface MessageVM {
  id: string;
  chatId: string;
  createdAt: string; // ISO
  isSentByMe: boolean;
  /** Plain text with newlines (OF HTML already stripped in main). */
  text: string;
  media: MessageMediaVM[];
  price: number; // dollars; 0 = not PPV
  ppvState: PpvStateVM | null; // null when price === 0
  isTip: boolean;
  tipAmount: number | null;
  /** Fan's note accompanying a tip (plain text). */
  tipText: string | null;
  /** For our sent messages: false once the fan has seen it. */
  isNew: boolean;
  replyTo: { sender: 'model' | 'fan'; textPreview: string } | null;
  deleted: boolean;
}

export interface FanPanelVM {
  fanId: string;
  name: string;
  customName: string | null;
  username: string;
  avatarUrl: string | null;
  lastSeen: string | null; // ISO
  about: string | null;
  spending: {
    total: number;
    subscriptions: number;
    tips: number;
    messages: number;
    posts: number;
    streams: number;
  } | null;
  subscription: {
    status: 'active' | 'expired' | 'none';
    priceUsd: number | null;
    subscribedAt: string | null;
    renewsAt: string | null;
    /** true ⇒ churn-risk badge (auto-renew off). */
    autoRenewOff: boolean;
    durationLabel: string | null;
  } | null;
  summary: { body: string; generatedAt: string; modelLabel: string } | null;
}

export interface SyncStatusVM {
  creditsBalance: number | null;
  creditsUsedToday: number;
  rpmRemaining: number | null;
  /** Per-account ISO timestamp of last successful chat-list poll. */
  freshness: Record<string, string>;
  state: 'live' | 'degraded' | 'offline';
}

export interface SettingsVM {
  hasOfapiKey: boolean;
  hasAnthropicKey: boolean;
  hasOpenRouterKey: boolean;
  featureModels: Record<ModelSelectableFeature, string>;
  featureReasoning: Record<ModelSelectableFeature, ReasoningEffort>;
  quickMessageCount: number;
  pingMessageCount: number;
  improveMessageCount: number;
  deepMessageCount: number;
  promptCachingEnabled: boolean;
  debugMode: boolean;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  markAsReadOnOpen: boolean;
  defaultReplyTone: ReplyTone;
  creditBudgetPerShift: number | null;
  accountMappings: Record<string, string>;
}

export type SettingsPatch = Partial<
  Omit<SettingsVM, 'hasOfapiKey' | 'hasAnthropicKey' | 'hasOpenRouterKey'>
> & {
  ofapiKey?: string;
  anthropicKey?: string;
  openRouterKey?: string;
};

export interface AiStartRequest {
  operationId: string;
  feature: FeatureType;
  accountId: string;
  chatId: string;
  params: {
    tone?: ReplyTone;
    mode?: ReplyMode;
    draftText?: string;
    forceRegenerate?: boolean;
  };
}

/**
 * P2 acceptance instrumentation (PRD §3): every copy of an AI draft.
 * `partIndex` 0 = all parts, 1..N = part N.
 */
export interface AiFeedbackRequest {
  operationId: string;
  action: 'copied';
  partIndex: number;
}

export interface DbChangedEvent {
  scope: 'accounts' | 'chats' | 'messages' | 'fans' | 'summaries' | 'settings';
  accountId?: string;
  chatId?: string;
}

export interface PingGateVM {
  segment: PingSegment;
  blocked: boolean;
}

// ─── Channel map ─────────────────────────────────────────────────────────

export interface InvokeChannels {
  'query:accounts.list': { args: void; result: AccountVM[] };
  'query:chats.list': {
    args: { accountId: string; filter: ChatFilter; limit?: number; offset?: number };
    result: { items: ChatListItemVM[]; hasMore: boolean };
  };
  'query:chats.search': {
    args: { accountId: string; query: string };
    result: ChatListItemVM[];
  };
  'query:messages.page': {
    args: { accountId: string; chatId: string; beforeId?: string; limit?: number };
    result: { items: MessageVM[]; hasMore: boolean };
  };
  'query:fan.get': { args: { accountId: string; fanId: string }; result: FanPanelVM | null };
  'query:settings.get': { args: void; result: SettingsVM };
  'query:personalities.list': { args: void; result: Personality[] };
  'query:sync.status': { args: void; result: SyncStatusVM };
  'query:ai.pingGate': { args: { accountId: string; chatId: string }; result: PingGateVM };
  'cmd:conversation.open': {
    args: { accountId: string; chatId: string };
    result: void;
  };
  'cmd:conversation.close': { args: { accountId: string; chatId: string }; result: void };
  'cmd:sync.forceRefresh': { args: { accountId?: string }; result: void };
  'cmd:settings.update': { args: SettingsPatch; result: SettingsVM };
  'cmd:personalities.save': { args: Personality; result: Personality[] };
  'cmd:personalities.delete': { args: { id: string }; result: Personality[] };
  'cmd:mappings.set': {
    args: { accountId: string; personalityId: string | null };
    result: void;
  };
  'cmd:data.purge': { args: void; result: void };
  'ai:start': { args: AiStartRequest; result: void };
  'ai:cancel': { args: { operationId: string }; result: void };
  'cmd:ai.feedback': { args: AiFeedbackRequest; result: void };
}

/**
 * Additive status frame on the sync:event channel (SPEC §4 "sync:* — …, credit
 * balance"). Not part of the shared SyncEvent union; renderers that only run
 * frames through parseSyncEvent drop it harmlessly.
 */
export interface CreditBalanceEvent {
  type: 'creditBalance';
  balance: number | null;
  usedToday: number;
  rpmRemaining: number | null;
}

export interface EventChannels {
  'sync:event': SyncEvent | CreditBalanceEvent;
  'ai:event': OperationEvent;
  'db:changed': DbChangedEvent;
}

export type InvokeChannelName = keyof InvokeChannels;
export type EventChannelName = keyof EventChannels;

export interface ChatGooseBridge {
  invoke<C extends InvokeChannelName>(
    channel: C,
    args: InvokeChannels[C]['args'],
  ): Promise<InvokeChannels[C]['result']>;
  on<C extends EventChannelName>(
    channel: C,
    listener: (payload: EventChannels[C]) => void,
  ): () => void;
}

// ─── Runtime invoke-channel registry ─────────────────────────────────────
// Preload's runtime allowlist (SPEC §15.1: a compromised renderer must not
// reach handlers by arbitrary channel string). Record<InvokeChannelName, true>
// keeps it exhaustive both ways at compile time: a channel added to
// InvokeChannels but missing here — or listed here without an InvokeChannels
// entry — is a type error.
const INVOKE_CHANNEL_REGISTRY: Record<InvokeChannelName, true> = {
  'query:accounts.list': true,
  'query:chats.list': true,
  'query:chats.search': true,
  'query:messages.page': true,
  'query:fan.get': true,
  'query:settings.get': true,
  'query:personalities.list': true,
  'query:sync.status': true,
  'query:ai.pingGate': true,
  'cmd:conversation.open': true,
  'cmd:conversation.close': true,
  'cmd:sync.forceRefresh': true,
  'cmd:settings.update': true,
  'cmd:personalities.save': true,
  'cmd:personalities.delete': true,
  'cmd:mappings.set': true,
  'cmd:data.purge': true,
  'ai:start': true,
  'ai:cancel': true,
  'cmd:ai.feedback': true,
};

export const INVOKE_CHANNEL_NAMES = Object.keys(INVOKE_CHANNEL_REGISTRY) as InvokeChannelName[];
