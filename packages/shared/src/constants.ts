// Product constants ported from legacy ChatGoose (values are normative — research doc §1/§4/§5/§8).
// Legacy Fansly transport constants are re-homed onto OFAPI names where the subsystem moved.

import type { ModelSelectableFeature, ReasoningEffort, ReplyTone } from './types';
import type { OperationFeature } from './features';

// ─── Operation timeouts (staged; research §8.5) ─────────────────────────

export const QUICK_OPERATION_TIMEOUT_MS = 60_000;
export const DEEP_OPERATION_PREP_TIMEOUT_MS = 180_000;
export const DEEP_OPERATION_LLM_TTFB_TIMEOUT_MS = 45_000;
export const DEEP_OPERATION_LLM_IDLE_TIMEOUT_MS = 45_000;
export const DEEP_OPERATION_LLM_MAX_STREAM_TIMEOUT_MS = 300_000;

// ─── LLM auto-retry (research §8.5) ─────────────────────────────────────

/** 429 is auto-retried only when Retry-After is at or under this cap. */
export const AUTO_RETRY_RATE_LIMIT_MAX_MS = 60_000;
/** 503/service-unavailable auto-retry delay. */
export const AUTO_RETRY_SERVICE_UNAVAILABLE_MS = 5_000;

// ─── Message counts (research §5.1) ─────────────────────────────────────

export const QUICK_DEFAULT_MESSAGE_COUNT = 100;
export const QUICK_MIN_MESSAGE_COUNT = 5;
export const QUICK_MAX_MESSAGE_COUNT = 200;
export const PING_DEFAULT_MESSAGE_COUNT = QUICK_DEFAULT_MESSAGE_COUNT;
export const PING_MIN_MESSAGE_COUNT = QUICK_MIN_MESSAGE_COUNT;
export const PING_MAX_MESSAGE_COUNT = QUICK_MAX_MESSAGE_COUNT;
export const IMPROVE_DEFAULT_MESSAGE_COUNT = 25;
export const IMPROVE_MIN_MESSAGE_COUNT = QUICK_MIN_MESSAGE_COUNT;
export const IMPROVE_MAX_MESSAGE_COUNT = QUICK_MAX_MESSAGE_COUNT;
export const DEEP_DEFAULT_MESSAGE_COUNT = 1500;
export const DEEP_MIN_MESSAGE_COUNT = 100;
export const DEEP_MAX_MESSAGE_COUNT = 3000;
/** Fixed for hi-greeting; not a user setting (legacy: one API page). */
export const HI_GREETING_MESSAGE_COUNT = 25;

// ─── Feature thresholds (research §1) ───────────────────────────────────

export const MIN_MESSAGES_FOR_DEEP = 30;
/** hi-greeting is locked unless the conversation has at most this many messages. */
export const HI_GREETING_MAX_TRANSCRIPT = 10;
export const PING_ACTIVE_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;
export const PING_MIN_FAN_MESSAGES = 3;

// ─── Streaming ──────────────────────────────────────────────────────────

export const STREAM_CHUNK_FLUSH_MS = 50;

// ─── Context fetch pacing (OFAPI; legacy values carried, page size adapted) ──

/** OFAPI messages page size (legacy Fansly used 25). */
export const MESSAGES_PAGE_LIMIT = 100;
export const OFAPI_INTER_PAGE_DELAY_MS = 300;
export const OFAPI_REQUEST_TIMEOUT_MS = 30_000;
export const OFAPI_RETRY_DELAYS_MS = [1000, 2000, 4000];
/** Cap on a Retry-After-driven wait for a single context-fetch retry. */
export const OFAPI_RETRY_MAX_BACKOFF_MS = 5_000;
/** Deep fetch page cap = DEEP_MAX_MESSAGE_COUNT / MESSAGES_PAGE_LIMIT. */
export const DEEP_FETCH_MAX_PAGES = 30;
/** Transactions (monthly spending breakdown) marker-pagination cap (SPEC §8.2). */
export const TRANSACTIONS_PAGE_CAP = 5;
/** Fan detail / transactions on-demand cache TTL (SPEC §6.1, matches legacy in-memory caches). */
export const FAN_DATA_CACHE_TTL_MS = 5 * 60 * 1000;

// ─── Summary cache ──────────────────────────────────────────────────────

export const SUMMARY_EVICTION_COUNT = 10;

// ─── Agency Hub ("core") ────────────────────────────────────────────────

export const AGENCY_HUB_PREFETCH_TIMEOUT_MS = 5_000;
export const AGENCY_HUB_SYNC_TIMEOUT_MS = 10_000;
export const AGENCY_HUB_AI_USAGE_BATCH_MAX_EVENTS = 100;
export const AGENCY_HUB_AI_USAGE_REPORT_DEBOUNCE_MS = 1_000;
export const AGENCY_HUB_AI_USAGE_REPORT_TIMEOUT_MS = 5_000;
export const AGENCY_HUB_AI_USAGE_REPORT_MAX_ATTEMPTS = 3;
export const AGENCY_HUB_AI_USAGE_REPORT_RETRY_DELAYS_MS = [5_000, 15_000];
export const AGENCY_HUB_PROFILE_MAX_BYTES = 50_000;

// ─── LLM per-feature parameters (research §4.4/§4.5) ────────────────────

export const MAX_TOKENS: Record<OperationFeature, number> = {
  'fast-reply': 800,
  'improve-draft': 800,
  'help-me': 1200,
  'fan-summary': 8192,
  'chat-review': 1600,
  'ping': 800,
  'hi-greeting': 800,
};

export const FEATURE_TEMPERATURES: Record<OperationFeature, number> = {
  'fast-reply': 0.65,
  'improve-draft': 0.65,
  'help-me': 0.45,
  'fan-summary': 0.4,
  'chat-review': 0.25,
  'ping': 0.65,
  'hi-greeting': 0.7,
};

export const COMPARE_TEMPERATURE = 0.35;

export const REASONING_EFFORTS: ReasoningEffort[] = ['off', 'low', 'medium', 'high', 'max'];

// Model registry module owns the full catalog; defaults are anchored here for settings.
export const DEFAULT_MODEL_ID = 'anthropic:claude-sonnet-4-6';
export const DEFAULT_FAN_SUMMARY_MODEL_ID = 'anthropic:claude-opus-4-6';

export const DEFAULT_FEATURE_MODELS: Record<ModelSelectableFeature, string> = {
  'fast-reply': DEFAULT_MODEL_ID,
  'help-me': DEFAULT_MODEL_ID,
  'fan-summary': DEFAULT_FAN_SUMMARY_MODEL_ID,
  'chat-review': DEFAULT_MODEL_ID,
  'ping': DEFAULT_MODEL_ID,
};

export const DEFAULT_FEATURE_REASONING: Record<ModelSelectableFeature, ReasoningEffort> = {
  'fast-reply': 'medium',
  'help-me': 'medium',
  'fan-summary': 'medium',
  'chat-review': 'medium',
  'ping': 'medium',
};

// ─── Settings (legacy §5.1 shape, adapted to desktop) ───────────────────

export interface Settings {
  ofapiApiKey: string;
  claudeApiKey: string;
  openRouterApiKey: string;
  agencyHubBaseUrl: string;
  agencyHubApiKey: string;
  quickMessageCount: number;
  pingMessageCount: number;
  improveMessageCount: number;
  deepMessageCount: number;
  defaultReplyTone: ReplyTone;
  debugMode: boolean;
  promptCachingEnabled: boolean;
  featureModels: Record<ModelSelectableFeature, string>;
  featureReasoning: Record<ModelSelectableFeature, ReasoningEffort>;
}

export const DEFAULT_SETTINGS: Settings = {
  ofapiApiKey: '',
  claudeApiKey: '',
  openRouterApiKey: '',
  agencyHubBaseUrl: '',
  agencyHubApiKey: '',
  quickMessageCount: QUICK_DEFAULT_MESSAGE_COUNT,
  pingMessageCount: PING_DEFAULT_MESSAGE_COUNT,
  improveMessageCount: IMPROVE_DEFAULT_MESSAGE_COUNT,
  deepMessageCount: DEEP_DEFAULT_MESSAGE_COUNT,
  // Legacy shipped 'none'; 'casual' is an owner-decided default change (2026-06-10, SPEC §8.4).
  defaultReplyTone: 'casual',
  debugMode: false,
  promptCachingEnabled: true,
  featureModels: { ...DEFAULT_FEATURE_MODELS },
  featureReasoning: { ...DEFAULT_FEATURE_REASONING },
};
