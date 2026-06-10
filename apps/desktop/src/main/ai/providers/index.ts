// Provider barrel + routing for the P2 DirectGateway (SPEC §8.6). routeStream
// picks the provider from the model registry entry and the provider-specific
// key (legacy LlmClient routing: unknown model → CG-API-03, missing key →
// CG-AUTH-01 with provider detail for the per-provider wording overrides).

import { CgError } from '@chatgoose/shared/errors/index';
import { getModelEntry } from '@chatgoose/shared/llm/model-registry';
import { streamAnthropic } from './anthropic';
import { streamOpenRouter } from './openrouter';
import type { LlmStreamRequest, ProviderStreamOptions, RouteStreamOptions, StreamCallbacks } from './types';

export type {
  CancelFn,
  FetchImpl,
  LlmStreamRequest,
  ProviderKeys,
  ProviderRequestInit,
  ProviderStreamOptions,
  RouteStreamOptions,
  StreamCallbacks,
} from './types';
export { ANTHROPIC_MESSAGES_URL, ANTHROPIC_VERSION, streamAnthropic } from './anthropic';
export { OPENROUTER_MESSAGES_URL, streamOpenRouter } from './openrouter';

function fail(cb: StreamCallbacks, error: CgError): never {
  cb.onError?.(error);
  throw error;
}

export async function routeStream(
  req: LlmStreamRequest,
  cb: StreamCallbacks,
  options: RouteStreamOptions,
): Promise<string> {
  const entry = getModelEntry(req.modelId);
  if (!entry) {
    fail(cb, new CgError('CG-API-03'));
  }

  const passThrough: Omit<ProviderStreamOptions, 'apiKey'> = {
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  };

  if (entry.provider === 'anthropic') {
    const apiKey = options.keys.anthropicApiKey;
    if (!apiKey) {
      fail(cb, new CgError('CG-AUTH-01', { detail: { provider: 'anthropic' } }));
    }
    return streamAnthropic(req, cb, { apiKey, ...passThrough });
  }

  const apiKey = options.keys.openRouterApiKey;
  if (!apiKey) {
    fail(cb, new CgError('CG-AUTH-01', { detail: { provider: 'openrouter' } }));
  }
  return streamOpenRouter(req, cb, { apiKey, ...passThrough });
}
