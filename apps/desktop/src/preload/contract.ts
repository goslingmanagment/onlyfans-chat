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
  /** DESIGN §1 fan value: lifetime spend in dollars; null/0 renders nothing. */
  lifetimeSpend: number | null;
  /** Rolling 30-day spend in dollars (local transactions aggregate). */
  spend30d: number | null;
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
  /** Agency Hub SSE stream state (SPEC §6.2/§9); 'off' = hub not configured. */
  hub: 'off' | 'connecting' | 'live' | 'degraded' | 'auth-failed' | 'stopped';
  /** Status bar "AI TODAY" aggregate (UTC day, ai_spend_log total). */
  aiTodayUsd: number;
  /** Status bar "SENDS" aggregate (UTC day, outbox state transitions). */
  sendsToday: { sent: number; failed: number; unconfirmed: number };
}

// ─── Settings → Activity panel (PLAN item 9; binding mockup
//     docs/mockups/experiments/activity-panel.html) ──────────────────────

export interface ActivityAccountFlowVM {
  accountId: string;
  name: string;
  /** ISO of the last successful chat-list poll; null before the first one. */
  lastPolledAt: string | null;
  /** Effective cadence after focus/hidden/budget/hub factors; null = not polling. */
  pollIntervalMs: number | null;
}

export interface ActivityVM {
  /** The status-bar mode word matches this panel badge. */
  mode: 'polling' | 'hub-live';
  syncState: 'live' | 'degraded' | 'offline';
  accounts: ActivityAccountFlowVM[];
  deepSweepEveryMs: number | null;
  hub: {
    status: SyncStatusVM['hub'];
    lastEventAt: string | null;
    lastEventType: string | null;
    eventsToday: number;
    liveSince: string | null;
    statusChangedAt: string | null;
    droppedFrames: number;
    /** usage_events rows awaiting upload to core (parked when hub is off). */
    pendingUsageEvents: number;
    /** HTTP-400 events held back forever (never resent). */
    quarantinedUsageEvents: number;
    pendingSummaries: number;
    syncedSummariesToday: number;
  };
  ai: { hasAnthropicKey: boolean; hasOpenRouterKey: boolean };
  /** Today's outbox transitions (UTC). */
  sends: { sent: number; failed: number; unconfirmed: number };
  credits: {
    rows: { purpose: string; requests: number; credits: number }[];
    totalRequests: number;
    totalCredits: number;
    balance: number | null;
    estimatedDaysLeft: number | null;
    rpmRemaining: number | null;
  };
  aiSpend: {
    rows: {
      feature: string;
      runs: number;
      /** Null = feature has no insert affordance (renders an em dash). */
      inserted: number | null;
      tokens: number;
      costUsd: number;
    }[];
    totals: {
      runs: number;
      inserted: number;
      insertableRuns: number;
      tokens: number;
      costUsd: number;
    };
    cacheReadShare: number | null;
    topRun: { feature: string; costUsd: number; fanLabel: string | null } | null;
    sevenDayUsd: number;
  };
}

/** Mirror of send/audit.ts OutboxAuditReport (contract stays main-import-free). */
export interface OutboxAuditReportVM {
  accountId: string | null;
  totals: Record<OutboxStateVM, number>;
  doubleClaims: { messageId: string; localIds: string[] }[];
  suspectDuplicates: { chatId: string; text: string; localIds: string[]; messageIds: string[] }[];
  staleUnconfirmed: { localId: string; chatId: string; ageMs: number }[];
  sentMissingFromMessages: { localId: string; chatId: string; messageId: string }[];
  cleanSends: number;
}

export interface SettingsVM {
  hasOfapiKey: boolean;
  hasAnthropicKey: boolean;
  hasOpenRouterKey: boolean;
  hasHubKey: boolean;
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
  /** Agency Hub core base URL (SPEC §6.2/§9); null = hub mode off. */
  hubBaseUrl: string | null;
  /**
   * Manual OFAPI accountId → core page-label overrides (SPEC §8.5). Accounts
   * not listed here auto-match by normalized username in main.
   */
  accountPageLabels: Record<string, string>;
  /** Chat-list lifetime-spend style (DESIGN §1): bare figure or bordered chip. */
  spendStyle: 'figure' | 'chip';
}

export type SettingsPatch = Partial<
  Omit<SettingsVM, 'hasOfapiKey' | 'hasAnthropicKey' | 'hasOpenRouterKey' | 'hasHubKey'>
> & {
  ofapiKey?: string;
  anthropicKey?: string;
  openRouterKey?: string;
  /** Chatter key (`agency_hub_core_…`) — write-only into the keychain. */
  hubApiKey?: string;
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
 * Acceptance instrumentation (PRD §3): every copy (P2 companion mode) or
 * insert (P3+) of an AI draft. `partIndex` 0 = all parts, 1..N = part N.
 * `feature` lets main increment the durable ai_spend_log inserted counter
 * even after the usage_events row drained to the hub (Activity panel).
 */
export interface AiFeedbackRequest {
  operationId: string;
  action: 'copied' | 'inserted';
  partIndex: number;
  feature?: FeatureType;
}

export interface DbChangedEvent {
  scope: 'accounts' | 'chats' | 'messages' | 'fans' | 'summaries' | 'settings' | 'outbox';
  accountId?: string;
  chatId?: string;
}

// ─── Send pipeline (SPEC §7) ─────────────────────────────────────────────

export type OutboxStateVM = 'queued' | 'sending' | 'sent' | 'failed' | 'unconfirmed' | 'cancelled';

export interface OutboxItemVM {
  localId: string;
  chatId: string;
  text: string;
  state: OutboxStateVM;
  /** Server message id once confirmed (POST response or verifier match). */
  messageId: string | null;
  /** Multi-part ([NEXT]) sequence grouping; null for single sends. */
  sequenceId: string | null;
  partIndex: number;
  errorCode: string | null;
  errorMessage: string | null;
  /** CG-OF-05 restricted words: raw textHighLight entries (may be the full text). */
  textHighlights: string[];
  /** PPV price in dollars; 0 = plain text or free media message (P5, additive). */
  price: number;
  /** Attached media count; > 0 ⇒ media/PPV send (P5, additive). */
  mediaCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PingGateVM {
  segment: PingSegment;
  blocked: boolean;
}

// ─── Vault & PPV (PRD F7) ────────────────────────────────────────────────

export interface VaultItemVM {
  /** OF vault media id (raw OnlyFans numeric namespace, stringified). */
  id: string;
  type: 'photo' | 'video' | 'audio' | 'gif' | 'other';
  /** media:// URL minted in main — never a raw OF CDN URL (SPEC §4). */
  thumbUrl: string | null;
  /** false ⇒ still transcoding upstream — not attachable yet. */
  isReady: boolean;
  durationSeconds: number | null;
  createdAt: string | null; // ISO
  likesCount: number;
  /** Lifetime tips earned by this media (dollars). */
  tipsTotal: number;
}

export interface VaultAlbumVM {
  /** Vault list id (used as query:vault.list albumId). */
  id: string;
  name: string;
  /** true = user-created album; false = system bucket (Messages/Posts/…). */
  custom: boolean;
  mediaCount: number;
}

/** One chat message carrying media (the gallery lists messages, not files). */
export interface GalleryItemVM {
  messageId: string;
  createdAt: string | null; // ISO
  isSentByMe: boolean;
  /** Dollars; 0 = free media message. */
  price: number;
  /** PPV purchase state (true once the fan unlocked it); null when unknown. */
  isOpened: boolean | null;
  mediaCount: number;
  media: MessageMediaVM[];
}

/** cmd:vault.pickFile result — the renderer never sees the filesystem path. */
export interface VaultPickedFileVM {
  /** Opaque one-shot token minted in main; pass to cmd:vault.upload. */
  token: string;
  name: string;
  bytes: number;
  /** Size preflight at 3 credits per decimal MB (PRD F7). */
  creditEstimate: number;
}

export interface VaultUploadResultVM {
  /** OF vault media id — REUSABLE (unlike single-use ofapi_media_ ids). */
  vaultId: string;
  /** false ⇒ still transcoding; the vault grid shows the processing state. */
  isReady: boolean;
  creditsUsed: number | null;
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
  /** Settings → Activity panel: data flow + credit/AI ledgers (read-only). */
  'query:activity.summary': { args: void; result: ActivityVM };
  /** RUN OUTBOX AUDIT button — read-only sweep over the outbox audit trail. */
  'query:outbox.audit': { args: { accountId?: string }; result: OutboxAuditReportVM };
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
  // ── Send pipeline (SPEC §7) ──
  /** Active + recent rows for the chat's optimistic bubbles and audit strip. */
  'query:outbox.list': {
    args: { accountId: string; chatId: string };
    result: OutboxItemVM[];
  };
  /** parts.length > 1 ⇒ a [NEXT] sequence (own row per part, 2–5 s delays). */
  'cmd:send.message': {
    args: { accountId: string; chatId: string; parts: string[] };
    result: { localIds: string[]; sequenceId: string | null };
  };
  /** Manual retry of a FAILED row (edited text allowed) — a new audit row linked via retry_of. */
  'cmd:send.retry': {
    args: { accountId: string; localId: string; text: string };
    result: { localId: string };
  };
  /** Acknowledge a failed/unconfirmed row (state → cancelled; audit row kept). */
  'cmd:send.dismiss': { args: { accountId: string; localId: string }; result: void };
  'cmd:send.cancelSequence': { args: { accountId: string; sequenceId: string }; result: void };
  /** User-triggered verifier pass for the chat's unconfirmed rows. */
  'cmd:send.verifyNow': { args: { accountId: string; chatId: string }; result: void };
  'cmd:chat.typingActive': { args: { accountId: string; chatId: string }; result: void };
  /** Debounced in main (1.5 s) and gated on settings.markAsReadOnOpen. */
  'cmd:chat.markRead': { args: { accountId: string; chatId: string }; result: void };
  'cmd:message.unsend': {
    args: { accountId: string; chatId: string; messageId: string };
    result: void;
  };
  'query:draft.get': {
    args: { accountId: string; chatId: string };
    result: { text: string };
  };
  'cmd:draft.set': {
    args: { accountId: string; chatId: string; text: string };
    result: void;
  };
  // ── Vault & PPV (PRD F7, P5 — additive) ──
  /** Offset-paginated (OFAPI vault pagination is limit/offset + hasMore). */
  'query:vault.list': {
    args: { accountId: string; albumId?: string; query?: string; offset?: number };
    result: { items: VaultItemVM[]; hasMore: boolean; nextOffset: number | null };
  };
  'query:vault.albums': { args: { accountId: string }; result: VaultAlbumVM[] };
  'query:chat.gallery': {
    args: { accountId: string; chatId: string; offset?: number };
    result: { items: GalleryItemVM[]; hasMore: boolean; nextOffset: number | null };
  };
  /** Main-process file dialog; null when the chatter cancels. */
  'cmd:vault.pickFile': { args: void; result: VaultPickedFileVM | null };
  /** Uploads the picked file into the VAULT (reusable id); token is one-shot. */
  'cmd:vault.upload': {
    args: { accountId: string; fileToken: string; useAsync?: boolean };
    result: VaultUploadResultVM;
  };
  /**
   * PPV / media send: single outbox row (sequences never apply). Price 0 =
   * free media message; otherwise whole dollars 3–200. previews ⊆ mediaFiles.
   * Ids are vault ids (numeric strings) or single-use `ofapi_media_…` ids.
   */
  'cmd:send.ppv': {
    args: {
      accountId: string;
      chatId: string;
      text: string;
      price: number;
      mediaFiles: string[];
      previews: string[];
    };
    result: { localId: string };
  };
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
  'query:activity.summary': true,
  'query:outbox.audit': true,
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
  'query:outbox.list': true,
  'cmd:send.message': true,
  'cmd:send.retry': true,
  'cmd:send.dismiss': true,
  'cmd:send.cancelSequence': true,
  'cmd:send.verifyNow': true,
  'cmd:chat.typingActive': true,
  'cmd:chat.markRead': true,
  'cmd:message.unsend': true,
  'query:draft.get': true,
  'cmd:draft.set': true,
  'query:vault.list': true,
  'query:vault.albums': true,
  'query:chat.gallery': true,
  'cmd:vault.pickFile': true,
  'cmd:vault.upload': true,
  'cmd:send.ppv': true,
};

export const INVOKE_CHANNEL_NAMES = Object.keys(INVOKE_CHANNEL_REGISTRY) as InvokeChannelName[];
