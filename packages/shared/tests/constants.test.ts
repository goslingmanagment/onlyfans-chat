import { describe, expect, it } from 'vitest';
import {
  AGENCY_HUB_AI_USAGE_BATCH_MAX_EVENTS,
  AGENCY_HUB_AI_USAGE_REPORT_DEBOUNCE_MS,
  AGENCY_HUB_AI_USAGE_REPORT_MAX_ATTEMPTS,
  AGENCY_HUB_AI_USAGE_REPORT_RETRY_DELAYS_MS,
  AGENCY_HUB_AI_USAGE_REPORT_TIMEOUT_MS,
  AGENCY_HUB_PREFETCH_TIMEOUT_MS,
  AGENCY_HUB_PROFILE_MAX_BYTES,
  AGENCY_HUB_SYNC_TIMEOUT_MS,
  AUTO_RETRY_RATE_LIMIT_MAX_MS,
  AUTO_RETRY_SERVICE_UNAVAILABLE_MS,
  COMPARE_TEMPERATURE,
  DEEP_DEFAULT_MESSAGE_COUNT,
  DEEP_FETCH_MAX_PAGES,
  DEEP_MAX_MESSAGE_COUNT,
  DEEP_MIN_MESSAGE_COUNT,
  DEEP_OPERATION_LLM_IDLE_TIMEOUT_MS,
  DEEP_OPERATION_LLM_MAX_STREAM_TIMEOUT_MS,
  DEEP_OPERATION_LLM_TTFB_TIMEOUT_MS,
  DEEP_OPERATION_PREP_TIMEOUT_MS,
  DEFAULT_FAN_SUMMARY_MODEL_ID,
  DEFAULT_FEATURE_MODELS,
  DEFAULT_FEATURE_REASONING,
  DEFAULT_MODEL_ID,
  DEFAULT_SETTINGS,
  FAN_DATA_CACHE_TTL_MS,
  FEATURE_TEMPERATURES,
  HI_GREETING_MAX_TRANSCRIPT,
  HI_GREETING_MESSAGE_COUNT,
  IMPROVE_DEFAULT_MESSAGE_COUNT,
  IMPROVE_MAX_MESSAGE_COUNT,
  IMPROVE_MIN_MESSAGE_COUNT,
  MAX_TOKENS,
  MESSAGES_PAGE_LIMIT,
  MIN_MESSAGES_FOR_DEEP,
  OFAPI_INTER_PAGE_DELAY_MS,
  OFAPI_REQUEST_TIMEOUT_MS,
  OFAPI_RETRY_DELAYS_MS,
  OFAPI_RETRY_MAX_BACKOFF_MS,
  PING_ACTIVE_WINDOW_MS,
  PING_DEFAULT_MESSAGE_COUNT,
  PING_MAX_MESSAGE_COUNT,
  PING_MIN_FAN_MESSAGES,
  PING_MIN_MESSAGE_COUNT,
  QUICK_DEFAULT_MESSAGE_COUNT,
  QUICK_MAX_MESSAGE_COUNT,
  QUICK_MIN_MESSAGE_COUNT,
  QUICK_OPERATION_TIMEOUT_MS,
  REASONING_EFFORTS,
  STREAM_CHUNK_FLUSH_MS,
  SUMMARY_EVICTION_COUNT,
  TRANSACTIONS_PAGE_CAP,
} from '../src/constants';

describe('staged operation timeouts (research §8.5)', () => {
  it('keeps legacy-exact values', () => {
    expect(QUICK_OPERATION_TIMEOUT_MS).toBe(60_000);
    expect(DEEP_OPERATION_PREP_TIMEOUT_MS).toBe(180_000);
    expect(DEEP_OPERATION_LLM_TTFB_TIMEOUT_MS).toBe(45_000);
    expect(DEEP_OPERATION_LLM_IDLE_TIMEOUT_MS).toBe(45_000);
    expect(DEEP_OPERATION_LLM_MAX_STREAM_TIMEOUT_MS).toBe(300_000);
  });

  it('keeps legacy auto-retry thresholds (429 cap 60s, 503 +5s)', () => {
    expect(AUTO_RETRY_RATE_LIMIT_MAX_MS).toBe(60_000);
    expect(AUTO_RETRY_SERVICE_UNAVAILABLE_MS).toBe(5_000);
  });
});

describe('message counts (research §5.1)', () => {
  it('quick: default 100, range 5–200', () => {
    expect(QUICK_DEFAULT_MESSAGE_COUNT).toBe(100);
    expect(QUICK_MIN_MESSAGE_COUNT).toBe(5);
    expect(QUICK_MAX_MESSAGE_COUNT).toBe(200);
  });

  it('ping: default 100, range 5–200', () => {
    expect(PING_DEFAULT_MESSAGE_COUNT).toBe(100);
    expect(PING_MIN_MESSAGE_COUNT).toBe(5);
    expect(PING_MAX_MESSAGE_COUNT).toBe(200);
  });

  it('improve: default 25, range 5–200', () => {
    expect(IMPROVE_DEFAULT_MESSAGE_COUNT).toBe(25);
    expect(IMPROVE_MIN_MESSAGE_COUNT).toBe(5);
    expect(IMPROVE_MAX_MESSAGE_COUNT).toBe(200);
  });

  it('deep: default 1500, range 100–3000', () => {
    expect(DEEP_DEFAULT_MESSAGE_COUNT).toBe(1500);
    expect(DEEP_MIN_MESSAGE_COUNT).toBe(100);
    expect(DEEP_MAX_MESSAGE_COUNT).toBe(3000);
  });

  it('hi-greeting: fixed 25, no user setting', () => {
    expect(HI_GREETING_MESSAGE_COUNT).toBe(25);
  });
});

describe('feature thresholds (research §1)', () => {
  it('keeps legacy-exact gates', () => {
    expect(MIN_MESSAGES_FOR_DEEP).toBe(30);
    expect(HI_GREETING_MAX_TRANSCRIPT).toBe(10);
    expect(PING_ACTIVE_WINDOW_MS).toBe(5 * 24 * 60 * 60 * 1000);
    expect(PING_ACTIVE_WINDOW_MS).toBe(432_000_000);
    expect(PING_MIN_FAN_MESSAGES).toBe(3);
  });
});

describe('streaming and context fetch pacing', () => {
  it('flushes stream chunks on the legacy cadence', () => {
    expect(STREAM_CHUNK_FLUSH_MS).toBe(50);
  });

  it('keeps legacy fetch pacing on OFAPI names', () => {
    expect(MESSAGES_PAGE_LIMIT).toBe(100);
    expect(OFAPI_INTER_PAGE_DELAY_MS).toBe(300);
    expect(OFAPI_REQUEST_TIMEOUT_MS).toBe(30_000);
    expect(OFAPI_RETRY_DELAYS_MS).toEqual([1000, 2000, 4000]);
    expect(OFAPI_RETRY_MAX_BACKOFF_MS).toBe(5_000);
  });

  it('caps deep fetches at DEEP_MAX_MESSAGE_COUNT worth of pages', () => {
    expect(DEEP_FETCH_MAX_PAGES).toBe(30);
    expect(DEEP_FETCH_MAX_PAGES * MESSAGES_PAGE_LIMIT).toBe(DEEP_MAX_MESSAGE_COUNT);
    expect(TRANSACTIONS_PAGE_CAP).toBe(5);
    expect(FAN_DATA_CACHE_TTL_MS).toBe(5 * 60 * 1000);
  });
});

describe('summary cache + Agency Hub constants (research §1.3/§7)', () => {
  it('keeps legacy-exact values', () => {
    expect(SUMMARY_EVICTION_COUNT).toBe(10);
    expect(AGENCY_HUB_PREFETCH_TIMEOUT_MS).toBe(5_000);
    expect(AGENCY_HUB_SYNC_TIMEOUT_MS).toBe(10_000);
    expect(AGENCY_HUB_AI_USAGE_BATCH_MAX_EVENTS).toBe(100);
    expect(AGENCY_HUB_AI_USAGE_REPORT_DEBOUNCE_MS).toBe(1_000);
    expect(AGENCY_HUB_AI_USAGE_REPORT_TIMEOUT_MS).toBe(5_000);
    expect(AGENCY_HUB_AI_USAGE_REPORT_MAX_ATTEMPTS).toBe(3);
    expect(AGENCY_HUB_AI_USAGE_REPORT_RETRY_DELAYS_MS).toEqual([5_000, 15_000]);
    expect(AGENCY_HUB_PROFILE_MAX_BYTES).toBe(50_000);
  });
});

describe('LLM per-feature parameters (research §4.4/§4.5)', () => {
  it('keeps legacy-exact max tokens', () => {
    expect(MAX_TOKENS).toEqual({
      'fast-reply': 800,
      'improve-draft': 800,
      'help-me': 1200,
      'fan-summary': 8192,
      'chat-review': 1600,
      'ping': 800,
      'hi-greeting': 800,
    });
  });

  it('keeps legacy-exact temperatures', () => {
    expect(FEATURE_TEMPERATURES).toEqual({
      'fast-reply': 0.65,
      'improve-draft': 0.65,
      'help-me': 0.45,
      'fan-summary': 0.4,
      'chat-review': 0.25,
      'ping': 0.65,
      'hi-greeting': 0.7,
    });
    expect(COMPARE_TEMPERATURE).toBe(0.35);
  });

  it('keeps reasoning effort scale and per-feature defaults', () => {
    expect(REASONING_EFFORTS).toEqual(['off', 'low', 'medium', 'high', 'max']);
    expect(DEFAULT_FEATURE_REASONING).toEqual({
      'fast-reply': 'medium',
      'help-me': 'medium',
      'fan-summary': 'medium',
      'chat-review': 'medium',
      'ping': 'medium',
    });
  });

  it('keeps default model anchors (sonnet everywhere, opus for fan-summary)', () => {
    expect(DEFAULT_MODEL_ID).toBe('anthropic:claude-sonnet-4-6');
    expect(DEFAULT_FAN_SUMMARY_MODEL_ID).toBe('anthropic:claude-opus-4-6');
    expect(DEFAULT_FEATURE_MODELS).toEqual({
      'fast-reply': DEFAULT_MODEL_ID,
      'help-me': DEFAULT_MODEL_ID,
      'fan-summary': DEFAULT_FAN_SUMMARY_MODEL_ID,
      'chat-review': DEFAULT_MODEL_ID,
      'ping': DEFAULT_MODEL_ID,
    });
  });
});

describe('DEFAULT_SETTINGS (legacy §5.1 shape, desktop keys)', () => {
  it('matches the legacy defaults with desktop adaptations', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      ofapiApiKey: '',
      claudeApiKey: '',
      openRouterApiKey: '',
      agencyHubBaseUrl: '',
      agencyHubApiKey: '',
      quickMessageCount: 100,
      pingMessageCount: 100,
      improveMessageCount: 25,
      deepMessageCount: 1500,
      defaultReplyTone: 'casual',
      debugMode: false,
      promptCachingEnabled: true,
      featureModels: DEFAULT_FEATURE_MODELS,
      featureReasoning: DEFAULT_FEATURE_REASONING,
    });
  });

  it('default reply tone is casual (owner-decided change from legacy none)', () => {
    expect(DEFAULT_SETTINGS.defaultReplyTone).toBe('casual');
  });

  it('does not share the feature-model/reasoning record instances', () => {
    expect(DEFAULT_SETTINGS.featureModels).not.toBe(DEFAULT_FEATURE_MODELS);
    expect(DEFAULT_SETTINGS.featureReasoning).not.toBe(DEFAULT_FEATURE_REASONING);
  });
});
