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
import type { LogLevel } from '@chatgoose/shared/diagnostics/log';
import type { HubModeOverrideSetting } from '@chatgoose/shared/hub/mode';
import type { UiLocaleSetting } from '@chatgoose/shared/i18n/index';
import type { UiThemeSetting } from '@chatgoose/shared/theme';

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
  /** DESIGN §1 fan value: lifetime spend in dollars, creator NET (OnlyFans
   *  reports fan spending net of its 20% cut); null/0 renders nothing. */
  lifetimeSpend: number | null;
  /** Rolling 30-day spend in dollars, creator NET (local transactions
   *  aggregate over tx.net) — same basis as lifetimeSpend. */
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

export interface HubTelemetryCounterVM {
  total: number;
  byType: Record<string, number>;
}

export interface HubTelemetryVM {
  received: HubTelemetryCounterVM;
  applied: HubTelemetryCounterVM;
  fallback: HubTelemetryCounterVM;
  dropped: HubTelemetryCounterVM;
  fallbackByReason: Record<string, number>;
}

export interface SyncStatusVM {
  creditsBalance: number | null;
  creditsUsedToday: number;
  rpmRemaining: number | null;
  /** Per-account ISO timestamp of last successful chat-list poll. */
  freshness: Record<string, string>;
  /** Explicit list-verification clock; same data as `freshness` for older callers. */
  listVerifiedAt: Record<string, string>;
  state: 'live' | 'degraded' | 'offline';
  /** Agency Hub SSE stream state (SPEC §6.2/§9); 'off' = hub not configured. */
  hub: 'off' | 'connecting' | 'live' | 'degraded' | 'auth-failed' | 'stopped';
  /** Coarse operator mode: live push, degraded configured push, or no hub. */
  hubMode: 'live' | 'degraded' | 'off';
  /** Dev/support-only override for comparing polling vs hub behavior. */
  hubModeOverride: HubModeOverrideSetting;
  hubLastEventAt: string | null;
  hubLastEventType: string | null;
  hubEventsToday: number;
  hubAppliedEventsToday: number;
  hubDroppedEventsToday: number;
  hubFallbackEventsToday: number;
  hubEventsByTypeToday: Record<string, number>;
  hubAppliedByTypeToday: Record<string, number>;
  hubFallbackByTypeToday: Record<string, number>;
  hubDroppedByTypeToday: Record<string, number>;
  hubFallbackByReasonToday: Record<string, number>;
  hubLifetime: HubTelemetryVM;
  hubLastFallbackReason: string | null;
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
    appliedEventsToday: number;
    fallbackEventsToday: number;
    droppedEventsToday: number;
    eventsByTypeToday: Record<string, number>;
    appliedByTypeToday: Record<string, number>;
    fallbackByTypeToday: Record<string, number>;
    droppedByTypeToday: Record<string, number>;
    fallbackByReasonToday: Record<string, number>;
    lifetime: HubTelemetryVM;
    lastFallbackReason: string | null;
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
    core: {
      enabled: boolean;
      scope: { pageCount: number };
      today: {
        day: string;
        restCredits: number;
        webhook: { eventCount: number; estimatedCredits: number };
        totalEstimatedCredits: number;
      };
      last7d: {
        restCredits: number;
        webhook: { eventCount: number; estimatedCredits: number };
        totalEstimatedCredits: number;
      };
      limitations: string[];
    } | null;
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
  /**
   * When on, the app may issue automatic OFAPI message-body reads (background
   * poll deltas, read-state sweeps, Spenders/hub refreshes, AI fetch-through) —
   * each such GET marks the chat READ on OnlyFans and the fan instantly sees
   * "read". Off (default): the ONLY message-body read is when the user opens a
   * conversation. The chat list / unread counts / previews come from listChats
   * (which does NOT mark read) and keep working in both modes.
   */
  autoReadChats: boolean;
  defaultReplyTone: ReplyTone;
  creditBudgetPerShift: number | null;
  accountMappings: Record<string, string>;
  /**
   * Owner-chosen left-rail account order (account ids, top→bottom). Accounts not
   * listed here sort alphabetically after the ordered ones; stale ids are
   * ignored. Reordered by drag in the account rail.
   */
  accountOrder: string[];
  /** Agency Hub core base URL (SPEC §6.2/§9); null = hub mode off. */
  hubBaseUrl: string | null;
  /**
   * OFAPI GET transport. `hub` routes reads through core with the chatter key.
   */
  ofapiReadTransport: 'direct' | 'hub';
  /**
   * OFAPI write transport. `hub` submits supported versioned commands to core
   * (text, typing, unsend, mark-read, media/PPV); direct remains the documented
   * rollback. Local file-byte uploads are intentionally not app-supported.
   */
  ofapiWriteTransport: 'direct' | 'hub';
  /**
   * AI generation transport. `direct` uses local provider keys; `hub` streams
   * through core's default-off AI gateway with DirectGateway as the rollback.
   */
  aiGatewayTransport: 'direct' | 'hub';
  /** Dev/support-only sync override. Default 'auto'; non-auto persists across restarts. */
  hubModeOverride: HubModeOverrideSetting;
  /**
   * D6 rollback guard. True forces the legacy 10-minute desktop fan-spend
   * sweep; the accepted production default is hourly reconciliation.
   */
  spendSweepRollbackToLegacy: boolean;
  /**
   * Manual OFAPI accountId → core page-label overrides (SPEC §8.5). Accounts
   * not listed here auto-match by normalized username in main.
   */
  accountPageLabels: Record<string, string>;
  /** Chat-list lifetime-spend style (DESIGN §1): bare figure or bordered chip. */
  spendStyle: 'figure' | 'chip';
  /**
   * Spenders board: per-account OWNER-ORDERED OnlyMonster list ids mapped to
   * board shelves (PLAN item 12). Spenders outside mapped lists → «Без тира».
   */
  spendersListMappings: Record<string, string[]>;
  /** Interface language; 'system' resolves from the OS locale at runtime. */
  uiLocale: UiLocaleSetting;
  /** Window zoom factor (0.9 | 1 | 1.1 | 1.25). */
  uiScale: number;
  /** Color theme; 'system' follows the OS color scheme at runtime. */
  uiTheme: UiThemeSetting;
  /**
   * Non-secret fingerprints of stored keys ({last4, setAt}) recorded when a key
   * is saved — read-only in the VM (not patchable), null when never recorded.
   */
  keyMeta: KeyMetaVM;
}

export interface KeyMetaEntry {
  last4: string;
  /** Epoch ms when the key was last saved. */
  setAt: number;
}

export interface KeyMetaVM {
  ofapi: KeyMetaEntry | null;
  anthropic: KeyMetaEntry | null;
  openRouter: KeyMetaEntry | null;
  hub: KeyMetaEntry | null;
}

export type KeyTestProvider = 'ofapi' | 'anthropic' | 'openrouter' | 'hub';

/** Result of probing a STORED key (cmd:keys.test). Never carries key material. */
export interface KeyTestResultVM {
  ok: boolean;
  /** CG-* code (or NOT_CONFIGURED / HUB_NOT_CONFIGURED) on failure; null on success. */
  code: string | null;
  /** English registry wording; the renderer localizes known codes itself. */
  message: string;
  /** OFAPI success: team name from /whoami. */
  team?: string | null;
  /** Hub success: principal from /api/v1/auth/me. */
  username?: string;
  role?: string;
  pages?: number;
}

/** Danger-zone footprint of the encrypted local cache. */
export interface LocalDataStatsVM {
  dbBytes: number;
  mediaBytes: number;
  mediaFiles: number;
}

/** Auto-update state for Settings → Updates (PLAN item 11; main/platform/updater.ts).
 *  `unsupported` = not a win32 packaged build (macOS / dev), so no feed exists. */
export type UpdatePhaseVM =
  | 'unsupported'
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdateStatusVM {
  phase: UpdatePhaseVM;
  /** Target version (available / downloaded); null otherwise. */
  version: string | null;
  /** Download progress 0–100 while `downloading`; null otherwise. */
  percent: number | null;
  /** Error message while `error`; null otherwise. */
  message: string | null;
  /** The running app version (always present — shown as "current version"). */
  currentVersion: string;
}

/** Per-feature trailing-7-day AI spend (Settings → Models cost hints). */
export interface AiFeatureCostsVM {
  sinceDay: string;
  byFeature: Record<string, { runs: number; usd: number }>;
}

export type SettingsPatch = Partial<
  Omit<SettingsVM, 'hasOfapiKey' | 'hasAnthropicKey' | 'hasOpenRouterKey' | 'hasHubKey' | 'keyMeta'>
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
  transport: 'direct' | 'hub';
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

// ─── Spenders board (PLAN item 12; binding mockup mockups/supporters.html) ──

/** One OnlyMonster user-list as the mapping/settings surface sees it. */
export interface SpenderListVM {
  /** List id as string (built-ins are string ids, custom lists numeric upstream). */
  id: string;
  name: string;
  usersCount: number;
  /** true = custom (OM-managed tier list); built-ins (recent/following/…) false. */
  custom: boolean;
}

/** One board row (chat-row anatomy per the binding mockup). */
export interface SpenderRowVM {
  /** Raw OF numeric id as string — fan id === chat id. */
  fanId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null; // media:// URL
  /** Both in creator-net dollars — same basis as the chat-list figures. */
  lifetimeSpend: number | null;
  spend30d: number | null;
  /** '' when the fan has no local chat history. */
  lastMessagePreview: string;
  lastMessageIsSentByMe: boolean;
  fanWaiting: boolean;
  /** Days since the model's last message (local DB); null = none cached. */
  modelDays: number | null;
  /** Days since the fan's last message (local DB); null = none cached. */
  fanDays: number | null;
  /** Staleness dot (fan silence): ≤7 none · 8–21 warm · >21 hot. */
  silence: 'none' | 'warm' | 'hot';
  /** false also when the fan has no local chat row (send engine would reject). */
  canSendMessage: boolean;
  canNotSendReason: string | null;
  /** No cached chat row — preview thread will be empty, composer disabled. */
  hasChat: boolean;
}

/** Stats panel (page right side; all LOCAL data — 0 credits). The local
 *  transaction store retains 31 days, so 30 days is the longest window and
 *  the trend compares 7-to-7 (a month-to-month would be dishonest). */
export interface SpenderStatsVM {
  /** Dense ascending 30-day series in the user's LOCAL calendar days. */
  days: Array<{ day: string; amount: number }>;
  revenue30d: number;
  revenue7d: number;
  /** Percent vs the prior 7 days; null when the prior window is 0. */
  revenue7dPct: number | null;
  revenueToday: number;
  payers30d: number;
  txCount30d: number;
  /** 0 when there were no transactions in the window. */
  avgCheck30d: number;
  /** Mapped shelves in board order; '__untiered__' (when non-empty) last. */
  tiers: Array<{ listId: string; title: string; revenue: number; payers: number }>;
  /** Fan-silence radar per mapped shelf (warm 8–21 d · hot >21 d);
   *  silentLifetime = lifetime total of that shelf's warm+hot fans. */
  radar: Array<{
    listId: string;
    title: string;
    warm: number;
    hot: number;
    silentLifetime: number;
  }>;
  hotCount: number;
  hotLifetime: number;
  /** Fans with the last word (fanWaiting), highest lifetime first. */
  waiting: SpenderRowVM[];
  /** First purchase inside the window, by window spend. */
  newSpenders: Array<{ row: SpenderRowVM; txCount: number }>;
}

/** Spenders data freshness (PLAN item 13). Per-fan stamps stay internal —
 *  the UI renders ONE per-scope line («последний апдейт — вчера 18:40» /
 *  «апдейта ещё не было») plus the live queue progress. */
export interface SpendersFreshnessVM {
  /** scope ('all' | mapped list id) → ISO stamp of the last COMPLETED refresh
   *  of that scope (a completed «Все» run stamps every chip). */
  scopes: Record<string, string>;
  active: {
    scope: string;
    state: 'running' | 'paused';
    done: number;
    total: number;
  } | null;
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

// ─── Channel map ─────────────────────────────────────────────────────────

export interface InvokeChannels {
  'query:accounts.list': { args: void; result: AccountVM[] };
  'query:chats.list': {
    args: { accountId: string; filter: ChatFilter; limit?: number; offset?: number };
    result: { items: ChatListItemVM[]; hasMore: boolean };
  };
  'query:chats.get': {
    args: { accountId: string; chatId: string };
    result: ChatListItemVM | null;
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
  /** Settings → Models cost hints: per-feature trailing-7-day runs + USD. */
  'query:ai.featureCosts': { args: void; result: AiFeatureCostsVM };
  /** Settings "Test" buttons — probes the STORED key/connection (no args carry keys). */
  'cmd:keys.test': { args: { provider: KeyTestProvider }; result: KeyTestResultVM };
  /** Danger zone: encrypted local cache footprint. */
  'query:localData.stats': { args: void; result: LocalDataStatsVM };
  'cmd:localData.openFolder': { args: void; result: void };
  /** Writes a secrets-free JSON report (incl. the recent log) under userData and reveals it. */
  'cmd:localData.exportDiagnostics': { args: void; result: { path: string } };
  /** Renderer → main log feed (errors, error-boundary, query/mutation failures)
   *  so renderer-side problems land in the SAME exported log file. */
  'cmd:diag.logClient': {
    args: { level: LogLevel; scope: string; message: string; fields?: Record<string, unknown> };
    result: void;
  };
  /** Settings → Updates (PLAN item 11): manual auto-update control. */
  'query:updates.status': { args: void; result: UpdateStatusVM };
  /** Kicks a check; if a newer build exists it downloads in the background. */
  'cmd:updates.check': { args: void; result: UpdateStatusVM };
  /** Quit and install a downloaded update now. */
  'cmd:updates.install': { args: void; result: void };
  'query:ai.pingGate': { args: { accountId: string; chatId: string }; result: PingGateVM };
  'cmd:conversation.open': {
    args: { accountId: string; chatId: string };
    result: void;
  };
  'cmd:conversation.close': { args: { accountId: string; chatId: string }; result: void };
  /** Manual single-chat refresh (in-chat ↻ button): deliberate user read of the
   *  open chat's message tail. Maps to SyncProvider.readChatTailForUserOpen. */
  'cmd:conversation.refresh': { args: { accountId: string; chatId: string }; result: void };
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
  // ── Spenders board (PLAN item 12) ──
  /** All OM user-lists on the account (TTL-cached fetch-through; 1 credit). */
  'query:spenders.lists': {
    args: { accountId: string };
    result: { lists: SpenderListVM[]; fetchedAt: string };
  };
  /**
   * Joined rows of one MAPPED list, sorted by fan silence; fans already on a
   * higher (earlier-mapped) shelf are deduped out. Loads the roster (and any
   * earlier shelves' rosters) lazily; roster ids TTL-cache in main.
   */
  'query:spenders.roster': {
    args: { accountId: string; listId: string };
    result: { rows: SpenderRowVM[]; truncated: boolean; fetchedAt: string };
  };
  /** Spenders outside every mapped roster («Без тира»); loads all mapped rosters. */
  'query:spenders.untiered': {
    args: { accountId: string };
    result: { rows: SpenderRowVM[]; fetchedAt: string };
  };
  /** Stats panel aggregates (loads all mapped rosters; local joins, 0 credits). */
  'query:spenders.stats': {
    args: { accountId: string };
    result: SpenderStatsVM;
  };
  /**
   * Tail-fetch the newest thread page into the local DB (ONE read-only GET).
   * Fired on EVERY quick-look open (PLAN item 13) — fills both МОДЕЛЬ/ФАН
   * counters and the preview thread; works without a cached chat row (there is
   * no single-chat GET upstream — live 405). Main TTL-guards via the per-fan
   * thread-fetch stamp (5 min), so J/K walking never re-spends.
   */
  'cmd:spenders.hydrate': {
    args: { accountId: string; chatId: string; username?: string | null };
    /** Discriminated status (mirrors SpendersHydrateResult in main): the
     *  renderer tells a genuinely-empty fan from a transient fetch error
     *  (quiet, retriable) instead of swallowing both. */
    result: {
      hasChat: boolean;
      fetched: boolean;
      messageCount: number;
      skippedByTtl: boolean;
      error?: string;
    };
  };
  /** Per-scope «последний апдейт» stamps + the in-flight refresh queue, if any. */
  'query:spenders.freshness': {
    args: { accountId: string };
    result: SpendersFreshnessVM;
  };
  /**
   * Start the scoped refresh queue (PLAN item 13): one read-only tail GET per
   * roster fan of the scope ('all' | mapped list id), skipping fans fetched
   * within the 5-min TTL. Lowest-priority OFAPI consumer — pauses first when
   * the budget guard trips; survives restarts; progress arrives as
   * spendersRefresh frames on sync:event; credits land under the distinct
   * 'spenders-refresh' ledger purpose.
   */
  'cmd:spenders.refreshScope': { args: { accountId: string; scope: string }; result: void };
  'cmd:spenders.refreshStop': { args: { accountId: string }; result: void };
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

/**
 * Additive status frame on the sync:event channel (same contract as
 * CreditBalanceEvent): live progress of the spenders refresh queue — rows fill
 * via db:changed as each tail lands; this frame drives the button counter,
 * the hairline progress bar and the «последний апдейт» refetch on completion.
 */
export interface SpendersRefreshEvent {
  type: 'spendersRefresh';
  accountId: string;
  scope: string;
  state: 'running' | 'paused' | 'done' | 'stopped';
  done: number;
  total: number;
}

export interface EventChannels {
  'sync:event': SyncEvent | CreditBalanceEvent | SpendersRefreshEvent;
  'ai:event': OperationEvent;
  'db:changed': DbChangedEvent;
}

export type InvokeChannelName = keyof InvokeChannels;
export type EventChannelName = keyof EventChannels;

export interface ChatGooseBridge {
  /**
   * `process.platform` of the Electron process ('darwin' | 'win32' | …).
   * Drives hotkey LABELS only (renderer lib/modKey.ts) — key matching is
   * already platform-agnostic (lib/keymap.ts 'mod' = metaKey || ctrlKey).
   */
  platform: string;
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
  'query:chats.get': true,
  'query:chats.search': true,
  'query:messages.page': true,
  'query:fan.get': true,
  'query:settings.get': true,
  'query:personalities.list': true,
  'query:sync.status': true,
  'query:activity.summary': true,
  'query:outbox.audit': true,
  'query:ai.featureCosts': true,
  'cmd:keys.test': true,
  'query:localData.stats': true,
  'cmd:localData.openFolder': true,
  'cmd:localData.exportDiagnostics': true,
  'cmd:diag.logClient': true,
  'query:updates.status': true,
  'cmd:updates.check': true,
  'cmd:updates.install': true,
  'query:ai.pingGate': true,
  'cmd:conversation.open': true,
  'cmd:conversation.close': true,
  'cmd:conversation.refresh': true,
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
  'query:spenders.lists': true,
  'query:spenders.roster': true,
  'query:spenders.untiered': true,
  'query:spenders.stats': true,
  'cmd:spenders.hydrate': true,
  'query:spenders.freshness': true,
  'cmd:spenders.refreshScope': true,
  'cmd:spenders.refreshStop': true,
  'query:vault.list': true,
  'query:vault.albums': true,
  'query:chat.gallery': true,
  'cmd:send.ppv': true,
};

export const INVOKE_CHANNEL_NAMES = Object.keys(INVOKE_CHANNEL_REGISTRY) as InvokeChannelName[];
