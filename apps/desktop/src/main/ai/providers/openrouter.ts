// OpenRouter streaming client (P2 DirectGateway transport) against the
// Anthropic-Messages-compatible endpoint. Legacy quirks carried: temperature is
// always sent (with or without thinking), cache_control is stripped from blocks,
// OpenAI-shaped usage payloads and reasoning_delta signals are handled by the
// shared parser's 'openrouter' dialect, Gemini thinking config via shared tuning.

import { CgError, classifyOpenRouterHttpError } from '@chatgoose/shared/errors/index';
import { getFeatureTemperature, resolveOpenRouterRequestTuning } from '@chatgoose/shared/llm/capabilities';
import { getProviderModelId } from '@chatgoose/shared/llm/model-registry';
import {
  fetchProvider,
  parseRetryAfterMs,
  pumpSseStream,
  readProviderErrorInfo,
  runWithLegacyRetry,
  toPlainTextBlocks,
  toProviderErrorInfo,
} from './transport';
import type { LlmStreamRequest, ProviderStreamOptions, StreamCallbacks } from './types';

export const OPENROUTER_MESSAGES_URL = 'https://openrouter.ai/api/v1/messages';

export async function streamOpenRouter(
  req: LlmStreamRequest,
  cb: StreamCallbacks,
  options: ProviderStreamOptions,
): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const providerModelId = getProviderModelId(req.modelId);
  const temperature = req.temperature ?? getFeatureTemperature(req.feature);
  const tuning = resolveOpenRouterRequestTuning(
    providerModelId,
    req.feature,
    temperature,
    req.reasoningEffort,
  );

  const requestBody = {
    model: providerModelId,
    temperature: tuning.temperature,
    stream: true,
    max_tokens: req.maxTokens ?? tuning.maxTokens,
    ...(tuning.thinking ? { thinking: tuning.thinking } : {}),
    ...(tuning.outputConfig ? { output_config: tuning.outputConfig } : {}),
    system: toPlainTextBlocks(req.systemBlocks),
    messages: [{ role: 'user', content: toPlainTextBlocks(req.userBlocks) }],
  };
  const body = JSON.stringify(requestBody);

  return runWithLegacyRetry(cb, options.signal, async (attemptCb) => {
    options.signal?.throwIfAborted();
    const response = await fetchProvider(
      fetchImpl,
      OPENROUTER_MESSAGES_URL,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          'content-type': 'application/json',
          'x-openrouter-title': 'ChatGoose',
        },
        body,
        ...(options.signal ? { signal: options.signal } : {}),
      },
      'openrouter',
    );

    if (!response.ok) {
      const info = await readProviderErrorInfo(response);
      const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
      throw classifyOpenRouterHttpError(response.status, info, retryAfterMs);
    }
    if (!response.body) {
      throw new CgError('CG-NET-01', { detail: { provider: 'openrouter' } });
    }

    return pumpSseStream({
      body: response.body,
      dialect: 'openrouter',
      cb: attemptCb,
      signal: options.signal,
      classifyStreamError: (error) => classifyOpenRouterHttpError(0, toProviderErrorInfo(error)),
      classifyUnsupportedChunk: (message) =>
        new CgError('CG-APP-01', { detail: { provider: 'openrouter', providerMessage: message } }),
    });
  });
}
