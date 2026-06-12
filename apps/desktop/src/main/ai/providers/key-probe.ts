// Cheap "is this key valid" probes for the LLM providers (Settings → API keys →
// Test). Both endpoints are free: Anthropic GET /v1/models and OpenRouter
// GET /api/v1/key only authenticate the bearer. Main-process only (SPEC §15.1).

import {
  CgError,
  classifyAnthropicHttpError,
  classifyOpenRouterHttpError,
} from '@chatgoose/shared/errors/index';
import { ANTHROPIC_VERSION } from './anthropic';
import { parseRetryAfterMs, readProviderErrorInfo } from './transport';

export const ANTHROPIC_MODELS_URL = 'https://api.anthropic.com/v1/models';
export const OPENROUTER_KEY_URL = 'https://openrouter.ai/api/v1/key';

const PROBE_TIMEOUT_MS = 10_000;

/** GET-shaped fetch seam (the streaming transport's FetchImpl is POST-pinned). */
export type ProbeFetch = (
  url: string,
  init: { method: 'GET'; headers: Record<string, string>; signal?: AbortSignal },
) => Promise<Response>;

function mapProbeNetworkError(error: unknown, url: string): CgError {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return new CgError('CG-NET-02', { message: `Key probe timed out: ${url}` });
  }
  return new CgError('CG-NET-01', { message: `Key probe failed: ${url}` });
}

async function probe(
  url: string,
  headers: Record<string, string>,
  classify: (status: number, info: Awaited<ReturnType<typeof readProviderErrorInfo>>, retryAfterMs?: number) => CgError,
  fetchImpl: ProbeFetch,
): Promise<void> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  } catch (error) {
    throw mapProbeNetworkError(error, url);
  }
  if (!response.ok) {
    const info = await readProviderErrorInfo(response);
    throw classify(response.status, info, parseRetryAfterMs(response.headers.get('retry-after')));
  }
}

/** Resolves on a valid key; throws CgError (CG-AUTH-02 on 401/403, CG-NET-* offline). */
export function probeAnthropicKey(apiKey: string, fetchImpl: ProbeFetch = fetch): Promise<void> {
  return probe(
    ANTHROPIC_MODELS_URL,
    { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION, accept: 'application/json' },
    classifyAnthropicHttpError,
    fetchImpl,
  );
}

/** Resolves on a valid key; throws CgError (CG-AUTH-02 on 401/403, CG-NET-* offline). */
export function probeOpenRouterKey(apiKey: string, fetchImpl: ProbeFetch = fetch): Promise<void> {
  return probe(
    OPENROUTER_KEY_URL,
    { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
    classifyOpenRouterHttpError,
    fetchImpl,
  );
}
