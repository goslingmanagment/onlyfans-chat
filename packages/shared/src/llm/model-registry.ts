// Model catalog ported verbatim from the legacy registry (research doc §4.1 is
// normative). Default model ids are anchored in src/constants.ts (settings
// module); they must always resolve against this catalog.

export type LlmProvider = 'anthropic' | 'openrouter';

export interface ModelPricing {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  cacheWrite5mUsdPerMillion?: number;
  cacheWrite1hUsdPerMillion?: number;
  cacheReadUsdPerMillion?: number;
}

export interface ModelEntry {
  /** Namespaced id (`provider:providerModelId`) — the canonical stored form. */
  id: string;
  provider: LlmProvider;
  /** Model id as sent to the provider API. */
  providerModelId: string;
  providerLabel: string;
  label: string;
  description: string;
  pricing: ModelPricing;
  supportsPromptCache: boolean;
  costApproximate?: boolean;
  pricingNote?: string;
}

export const MODEL_REGISTRY: readonly ModelEntry[] = [
  {
    id: 'anthropic:claude-sonnet-4-6',
    provider: 'anthropic',
    providerModelId: 'claude-sonnet-4-6',
    providerLabel: 'Anthropic Direct',
    label: 'Claude Sonnet 4.6',
    description: 'Recommended',
    supportsPromptCache: true,
    pricing: {
      inputUsdPerMillion: 3,
      cacheWrite5mUsdPerMillion: 3.75,
      cacheWrite1hUsdPerMillion: 6,
      cacheReadUsdPerMillion: 0.3,
      outputUsdPerMillion: 15,
    },
  },
  {
    id: 'anthropic:claude-sonnet-4-5',
    provider: 'anthropic',
    providerModelId: 'claude-sonnet-4-5',
    providerLabel: 'Anthropic Direct',
    label: 'Claude Sonnet 4.5',
    description: 'Balanced',
    supportsPromptCache: true,
    pricing: {
      inputUsdPerMillion: 3,
      cacheWrite5mUsdPerMillion: 3.75,
      cacheWrite1hUsdPerMillion: 6,
      cacheReadUsdPerMillion: 0.3,
      outputUsdPerMillion: 15,
    },
  },
  {
    // Added 2026-06-10 (PRD F6 "refresh model list at implementation time" — not a
    // legacy entry). Current Opus tier; sampling params are removed on this model
    // (see SAMPLING_PARAMS_REMOVED_MODELS in capabilities.ts).
    id: 'anthropic:claude-opus-4-8',
    provider: 'anthropic',
    providerModelId: 'claude-opus-4-8',
    providerLabel: 'Anthropic Direct',
    label: 'Claude Opus 4.8',
    description: 'Best quality (newest)',
    supportsPromptCache: true,
    pricing: {
      inputUsdPerMillion: 5,
      cacheWrite5mUsdPerMillion: 6.25,
      cacheWrite1hUsdPerMillion: 10,
      cacheReadUsdPerMillion: 0.5,
      outputUsdPerMillion: 25,
    },
  },
  {
    id: 'anthropic:claude-opus-4-6',
    provider: 'anthropic',
    providerModelId: 'claude-opus-4-6',
    providerLabel: 'Anthropic Direct',
    label: 'Claude Opus 4.6',
    description: 'Best quality',
    supportsPromptCache: true,
    pricing: {
      inputUsdPerMillion: 5,
      cacheWrite5mUsdPerMillion: 6.25,
      cacheWrite1hUsdPerMillion: 10,
      cacheReadUsdPerMillion: 0.5,
      outputUsdPerMillion: 25,
    },
  },
  {
    id: 'anthropic:claude-opus-4-5',
    provider: 'anthropic',
    providerModelId: 'claude-opus-4-5',
    providerLabel: 'Anthropic Direct',
    label: 'Claude Opus 4.5',
    description: 'Best quality (older)',
    supportsPromptCache: true,
    pricing: {
      inputUsdPerMillion: 5,
      cacheWrite5mUsdPerMillion: 6.25,
      cacheWrite1hUsdPerMillion: 10,
      cacheReadUsdPerMillion: 0.5,
      outputUsdPerMillion: 25,
    },
  },
  {
    id: 'anthropic:claude-haiku-4-5',
    provider: 'anthropic',
    providerModelId: 'claude-haiku-4-5',
    providerLabel: 'Anthropic Direct',
    label: 'Claude Haiku 4.5',
    description: 'Fastest & cheapest',
    supportsPromptCache: true,
    pricing: {
      inputUsdPerMillion: 1,
      cacheWrite5mUsdPerMillion: 1.25,
      cacheWrite1hUsdPerMillion: 2,
      cacheReadUsdPerMillion: 0.1,
      outputUsdPerMillion: 5,
    },
  },
  {
    id: 'openrouter:google/gemini-3.1-pro-preview',
    provider: 'openrouter',
    providerModelId: 'google/gemini-3.1-pro-preview',
    providerLabel: 'OpenRouter',
    label: 'Gemini 3.1 Pro Preview',
    description: 'OpenRouter',
    supportsPromptCache: false,
    pricing: {
      inputUsdPerMillion: 2,
      outputUsdPerMillion: 12,
    },
  },
  {
    id: 'openrouter:x-ai/grok-4.20',
    provider: 'openrouter',
    providerModelId: 'x-ai/grok-4.20',
    providerLabel: 'OpenRouter',
    label: 'Grok 4.20',
    description: 'OpenRouter',
    supportsPromptCache: false,
    costApproximate: true,
    pricingNote:
      'OpenRouter Grok cache-read pricing is approximate/unconfirmed for this registry entry; do not treat the placeholder USD rate as source-confirmed model pricing.',
    pricing: {
      inputUsdPerMillion: 1.25,
      cacheReadUsdPerMillion: 0.2,
      outputUsdPerMillion: 2.5,
    },
  },
  {
    id: 'openrouter:x-ai/grok-4.3',
    provider: 'openrouter',
    providerModelId: 'x-ai/grok-4.3',
    providerLabel: 'OpenRouter',
    label: 'Grok 4.3',
    description: 'OpenRouter',
    supportsPromptCache: false,
    costApproximate: true,
    pricingNote:
      'Base-tier pricing; requests above 200k total tokens may cost more. OpenRouter Grok cache-read pricing is approximate/unconfirmed for this registry entry; do not treat the placeholder USD rate as source-confirmed model pricing.',
    pricing: {
      inputUsdPerMillion: 1.25,
      cacheReadUsdPerMillion: 0.2,
      outputUsdPerMillion: 2.5,
    },
  },
];

export interface ModelGroup {
  provider: LlmProvider;
  label: string;
  models: ModelEntry[];
}

/** Registry-order grouping for model pickers (Anthropic Direct first, then OpenRouter). */
export const MODEL_GROUPS: readonly ModelGroup[] = [
  {
    provider: 'anthropic',
    label: 'Anthropic Direct',
    models: MODEL_REGISTRY.filter((model) => model.provider === 'anthropic'),
  },
  {
    provider: 'openrouter',
    label: 'OpenRouter',
    models: MODEL_REGISTRY.filter((model) => model.provider === 'openrouter'),
  },
];

const ENTRIES_BY_ID = new Map(MODEL_REGISTRY.map((model) => [model.id, model]));

// Pre-provider-prefix legacy settings stored bare Anthropic provider ids; they
// still normalize to the namespaced form. OpenRouter ids were never stored bare.
const BARE_ANTHROPIC_ALIASES = new Map(
  MODEL_REGISTRY.filter((model) => model.provider === 'anthropic').map((model) => [
    model.providerModelId,
    model,
  ]),
);

export function normalizeModelId(modelId: string | null | undefined): string | null {
  const candidate = modelId?.trim();
  if (!candidate) {
    return null;
  }
  if (ENTRIES_BY_ID.has(candidate)) {
    return candidate;
  }
  return BARE_ANTHROPIC_ALIASES.get(candidate)?.id ?? null;
}

export function getModelEntry(modelId: string | null | undefined): ModelEntry | null {
  const normalized = normalizeModelId(modelId);
  return normalized ? ENTRIES_BY_ID.get(normalized) ?? null : null;
}

export function getModelDisplayName(
  modelId: string | null | undefined,
  fallback = 'AI model',
): string {
  return getModelEntry(modelId)?.label ?? fallback;
}

export function isSupportedModelSelection(modelId: string | null | undefined): boolean {
  return normalizeModelId(modelId) !== null;
}

export function isAnthropicModelSelection(modelId: string | null | undefined): boolean {
  return getModelEntry(modelId)?.provider === 'anthropic';
}

export function isOpenRouterModelSelection(modelId: string | null | undefined): boolean {
  return getModelEntry(modelId)?.provider === 'openrouter';
}

/** True when both selections normalize to the same catalog entry. */
export function modelSelectionsEquivalent(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const normalizedLeft = normalizeModelId(left);
  const normalizedRight = normalizeModelId(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

/** Id to send to the provider API; unknown selections pass through unchanged. */
export function getProviderModelId(modelId: string): string {
  return getModelEntry(modelId)?.providerModelId ?? modelId;
}

/** Id reported to Agency Hub usage events: bare id for Anthropic, namespaced for OpenRouter. */
export function getHubReportingModelId(modelId: string): string {
  const entry = getModelEntry(modelId);
  if (!entry) {
    return modelId;
  }
  return entry.provider === 'anthropic' ? entry.providerModelId : entry.id;
}
