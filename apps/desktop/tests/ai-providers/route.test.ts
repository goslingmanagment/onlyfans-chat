// routeStream — provider routing from the model registry entry (legacy
// LlmClient semantics: unknown model → CG-API-03, missing provider key →
// CG-AUTH-01 with provider detail for per-provider user-facing wording).

import { describe, expect, it, vi } from 'vitest';
import { CgError, toUserFacing } from '@chatgoose/shared/errors/index';
import {
  ANTHROPIC_MESSAGES_URL,
  OPENROUTER_MESSAGES_URL,
  routeStream,
} from '@main/ai/providers/index';
import {
  MINIMAL_STREAM,
  baseRequest,
  recordingFetch,
  rejectionOf,
  sseResponse,
} from './helpers';

const KEYS = { anthropicApiKey: 'sk-ant', openRouterApiKey: 'sk-or' };

describe('routeStream', () => {
  it('routes Anthropic registry ids to the Anthropic endpoint with the Claude key', async () => {
    const { fetchImpl, calls } = recordingFetch([() => sseResponse(MINIMAL_STREAM)]);

    await routeStream(
      baseRequest({ modelId: 'anthropic:claude-sonnet-4-6' }),
      { onText: vi.fn() },
      { keys: KEYS, fetchImpl },
    );

    expect(calls[0]?.url).toBe(ANTHROPIC_MESSAGES_URL);
    expect(calls[0]?.init.headers['x-api-key']).toBe('sk-ant');
  });

  it('accepts bare legacy Anthropic model ids via registry normalization', async () => {
    const { fetchImpl, calls } = recordingFetch([() => sseResponse(MINIMAL_STREAM)]);

    await routeStream(
      baseRequest({ modelId: 'claude-haiku-4-5' }),
      { onText: vi.fn() },
      { keys: KEYS, fetchImpl },
    );

    expect(calls[0]?.url).toBe(ANTHROPIC_MESSAGES_URL);
  });

  it('routes OpenRouter registry ids to the OpenRouter endpoint with the bearer key', async () => {
    const { fetchImpl, calls } = recordingFetch([() => sseResponse(MINIMAL_STREAM)]);

    await routeStream(
      baseRequest({ modelId: 'openrouter:x-ai/grok-4.20' }),
      { onText: vi.fn() },
      { keys: KEYS, fetchImpl },
    );

    expect(calls[0]?.url).toBe(OPENROUTER_MESSAGES_URL);
    expect(calls[0]?.init.headers['authorization']).toBe('Bearer sk-or');
  });

  it('rejects unknown model selections with CG-API-03 before any network call', async () => {
    const { fetchImpl, calls } = recordingFetch([]);
    const onError = vi.fn();

    const error = await rejectionOf(
      routeStream(
        baseRequest({ modelId: 'anthropic:claude-9-ultra' }),
        { onText: vi.fn(), onError },
        { keys: KEYS, fetchImpl },
      ),
    );

    expect(error).toBeInstanceOf(CgError);
    expect(error).toMatchObject({ code: 'CG-API-03' });
    expect(calls).toHaveLength(0);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('rejects with CG-AUTH-01 when the Anthropic key is missing', async () => {
    const { fetchImpl, calls } = recordingFetch([]);

    const error = await rejectionOf(
      routeStream(
        baseRequest({ modelId: 'anthropic:claude-sonnet-4-6' }),
        { onText: vi.fn() },
        { keys: { openRouterApiKey: 'sk-or' }, fetchImpl },
      ),
    );

    expect(error).toMatchObject({ code: 'CG-AUTH-01', detail: { provider: 'anthropic' } });
    expect(calls).toHaveLength(0);
  });

  it('rejects with provider-worded CG-AUTH-01 when the OpenRouter key is missing', async () => {
    const { fetchImpl, calls } = recordingFetch([]);

    const error = await rejectionOf(
      routeStream(
        baseRequest({ modelId: 'openrouter:google/gemini-3.1-pro-preview' }),
        { onText: vi.fn() },
        { keys: { anthropicApiKey: 'sk-ant' }, fetchImpl },
      ),
    );

    expect(error).toMatchObject({ code: 'CG-AUTH-01', detail: { provider: 'openrouter' } });
    // The provider detail drives the per-provider user-facing rewording.
    expect(toUserFacing(error).message).toBe('OpenRouter API key not configured.');
    expect(calls).toHaveLength(0);
  });
});
