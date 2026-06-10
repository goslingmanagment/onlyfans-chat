// LLM provider streaming transport types — the P2 DirectGateway seam (SPEC §8.6).
// Behavioral port of the legacy LlmStreamArgs callback contract (research §4.6);
// main-process only (SPEC §15.1: secrets/network never reach the renderer).

import type { FeatureType, ReasoningEffort } from '@chatgoose/shared/types';
import type { PromptBlock } from '@chatgoose/shared/prompts/builder';
import type { LlmReasoningSignal, LlmUsageMetrics } from '@chatgoose/shared/llm/sse';
import type { CgError } from '@chatgoose/shared/errors/index';

export interface LlmStreamRequest {
  feature: FeatureType;
  /** Registry id (`provider:model`) or bare provider model id; resolved via the model registry. */
  modelId: string;
  /** Prompt-builder output: blocks carry structural cache TTL hints ('1h' | '5m' | 'none'). */
  systemBlocks: PromptBlock[];
  userBlocks: PromptBlock[];
  /** Defaults to the per-feature temperature table when omitted. */
  temperature?: number;
  reasoningEffort: ReasoningEffort;
  /** Overrides the tuning-resolved per-feature cap when set. */
  maxTokens?: number;
}

export interface StreamCallbacks {
  onText: (text: string) => void;
  onUsage?: (usage: LlmUsageMetrics) => void;
  onProgress?: () => void;
  onReasoningObserved?: (signal: LlmReasoningSignal) => void;
  /** Reasoning text deltas (legacy debug-profiling channel). */
  onReasoningDelta?: (text: string) => void;
  onStopReason?: (stopReason: string | null) => void;
  /** Fired exactly once with the terminal classified error. Aborts reject without firing it. */
  onError?: (error: CgError) => void;
}

export type CancelFn = () => void;

/**
 * Minimal structural fetch surface so tests inject scripted responses and the
 * composition root passes the global `fetch` (which satisfies this type).
 */
export interface ProviderRequestInit {
  method: 'POST';
  headers: Record<string, string>;
  body: string;
  signal?: AbortSignal;
}

export type FetchImpl = (url: string, init: ProviderRequestInit) => Promise<Response>;

export interface ProviderStreamOptions {
  apiKey: string;
  fetchImpl?: FetchImpl;
  signal?: AbortSignal;
}

export interface ProviderKeys {
  anthropicApiKey?: string;
  openRouterApiKey?: string;
}

export interface RouteStreamOptions {
  keys: ProviderKeys;
  fetchImpl?: FetchImpl;
  signal?: AbortSignal;
}
