// Anthropic Messages streaming client (P2 DirectGateway transport). Raw fetch +
// the shared SSE parser per SPEC §8.6 / research §4.6 — no SDK. Request tuning
// (thinking/temperature exclusivity, opus-4-8 sampling-params removal, adaptive
// max_tokens caps) comes from shared resolveAnthropicRequestTuning.

import { CgError, classifyAnthropicHttpError } from '@chatgoose/shared/errors/index';
import { getFeatureTemperature, resolveAnthropicRequestTuning } from '@chatgoose/shared/llm/capabilities';
import { getProviderModelId } from '@chatgoose/shared/llm/model-registry';
import {
  fetchProvider,
  parseRetryAfterMs,
  pumpSseStream,
  readProviderErrorInfo,
  runWithLegacyRetry,
  toCacheControlBlocks,
  toProviderErrorInfo,
} from './transport';
import type { LlmStreamRequest, ProviderStreamOptions, StreamCallbacks } from './types';

export const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Streams one Messages request; resolves with the full raw text. Cache TTL
 * hints map to cache_control: '1h' → {type:'ephemeral', ttl:'1h'}, '5m' →
 * {type:'ephemeral'} (provider-default 5-minute TTL), 'none' → no marker.
 */
export async function streamAnthropic(
  req: LlmStreamRequest,
  cb: StreamCallbacks,
  options: ProviderStreamOptions,
): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const providerModelId = getProviderModelId(req.modelId);
  const temperature = req.temperature ?? getFeatureTemperature(req.feature);
  const tuning = resolveAnthropicRequestTuning(
    providerModelId,
    req.feature,
    temperature,
    req.reasoningEffort,
  );

  // Tuning invariant (legacy 1.3.6 incident): temperature and thinking are
  // mutually exclusive, and sampling-params-removed models get neither.
  const requestBody = {
    model: providerModelId,
    stream: true,
    max_tokens: req.maxTokens ?? tuning.maxTokens,
    ...(tuning.thinking ? { thinking: tuning.thinking } : {}),
    ...(tuning.outputConfig ? { output_config: tuning.outputConfig } : {}),
    system: toCacheControlBlocks(req.systemBlocks),
    messages: [{ role: 'user', content: toCacheControlBlocks(req.userBlocks) }],
    ...(tuning.temperature !== undefined ? { temperature: tuning.temperature } : {}),
  };
  const body = JSON.stringify(requestBody);

  return runWithLegacyRetry(cb, options.signal, async (attemptCb) => {
    options.signal?.throwIfAborted();
    const response = await fetchProvider(
      fetchImpl,
      ANTHROPIC_MESSAGES_URL,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': options.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body,
        ...(options.signal ? { signal: options.signal } : {}),
      },
      'anthropic',
    );

    if (!response.ok) {
      const info = await readProviderErrorInfo(response);
      const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
      throw classifyAnthropicHttpError(response.status, info, retryAfterMs);
    }
    if (!response.body) {
      throw new CgError('CG-NET-01', { detail: { provider: 'anthropic' } });
    }

    return pumpSseStream({
      body: response.body,
      dialect: 'anthropic',
      cb: attemptCb,
      signal: options.signal,
      // Mid-stream error events carry no HTTP status (legacy passed 0).
      classifyStreamError: (error) => classifyAnthropicHttpError(0, toProviderErrorInfo(error)),
      classifyUnsupportedChunk: (message) =>
        new CgError('CG-APP-01', { detail: { provider: 'anthropic', providerMessage: message } }),
    });
  });
}
