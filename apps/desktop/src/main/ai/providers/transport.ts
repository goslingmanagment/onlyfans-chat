// Shared provider transport plumbing: Retry-After parsing, abortable delay, the
// legacy pre-first-chunk auto-retry loop, prompt-block → wire-block mapping, and
// the SSE pump over the shared incremental parser. Internal to ai/providers.

import { z } from 'zod';
import {
  AUTO_RETRY_RATE_LIMIT_MAX_MS,
  AUTO_RETRY_SERVICE_UNAVAILABLE_MS,
} from '@chatgoose/shared/constants';
import { CgError } from '@chatgoose/shared/errors/index';
import type { ProviderErrorInfo } from '@chatgoose/shared/errors/index';
import { MessagesSseParser } from '@chatgoose/shared/llm/sse';
import type { SseDialect, SseStreamError } from '@chatgoose/shared/llm/sse';
import type { PromptBlock, PromptCacheTtl } from '@chatgoose/shared/prompts/builder';
import type { FetchImpl, ProviderRequestInit, StreamCallbacks } from './types';

export type ProviderName = 'anthropic' | 'openrouter';

// ─── Retry-After header ──────────────────────────────────────────────────

/** Numeric seconds or HTTP-date → milliseconds to wait (legacy llm-stream-utils port). */
export function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }
  const timestamp = Date.parse(trimmed);
  if (!Number.isFinite(timestamp)) {
    return undefined;
  }
  return Math.max(0, timestamp - Date.now());
}

// ─── Abort plumbing ──────────────────────────────────────────────────────

function abortReason(signal: AbortSignal | undefined): Error {
  const reason: unknown = signal?.reason;
  return reason instanceof Error ? reason : new Error('Operation aborted');
}

export function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortReason(signal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

// ─── HTTP error body (zod at the provider trust boundary) ────────────────

const providerErrorBodySchema = z.object({
  error: z
    .object({
      type: z.string().optional(),
      code: z.union([z.string(), z.number()]).optional(),
      message: z.string().optional(),
    })
    .nullable()
    .optional(),
});

interface LooseErrorInfo {
  type?: string | undefined;
  code?: string | number | undefined;
  message?: string | undefined;
}

/** Drops absent fields so the shape satisfies the shared classifier input under exactOptionalPropertyTypes. */
export function toProviderErrorInfo(info: LooseErrorInfo | null): ProviderErrorInfo | null {
  if (!info) {
    return null;
  }
  return {
    ...(info.type !== undefined ? { type: info.type } : {}),
    ...(info.code !== undefined ? { code: info.code } : {}),
    ...(info.message !== undefined ? { message: info.message } : {}),
  };
}

export async function readProviderErrorInfo(response: Response): Promise<ProviderErrorInfo | null> {
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    return null;
  }
  const parsed = providerErrorBodySchema.safeParse(raw);
  if (!parsed.success || !parsed.data.error) {
    return null;
  }
  return toProviderErrorInfo(parsed.data.error);
}

// ─── Network errors ──────────────────────────────────────────────────────

/** Wraps transport-level fetch failures as CG-NET-01; aborts propagate untouched. */
export async function fetchProvider(
  fetchImpl: FetchImpl,
  url: string,
  init: ProviderRequestInit,
  provider: ProviderName,
): Promise<Response> {
  try {
    return await fetchImpl(url, init);
  } catch (error) {
    if (init.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
      throw error;
    }
    throw new CgError('CG-NET-01', {
      detail: {
        provider,
        providerMessage: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

// ─── Prompt blocks → wire blocks ─────────────────────────────────────────

export interface ProviderTextBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral'; ttl?: '1h' };
}

function cacheControlFor(ttl: PromptCacheTtl): ProviderTextBlock['cache_control'] | undefined {
  if (ttl === '1h') {
    return { type: 'ephemeral', ttl: '1h' };
  }
  if (ttl === '5m') {
    // Provider-default ephemeral TTL (5 minutes) — no explicit ttl field.
    return { type: 'ephemeral' };
  }
  return undefined;
}

export function toCacheControlBlocks(blocks: readonly PromptBlock[]): ProviderTextBlock[] {
  return blocks.map((block) => {
    const cacheControl = cacheControlFor(block.cache);
    return cacheControl
      ? { type: 'text' as const, text: block.text, cache_control: cacheControl }
      : { type: 'text' as const, text: block.text };
  });
}

/** OpenRouter path: cache hints are dropped entirely (legacy stripCacheControl). */
export function toPlainTextBlocks(blocks: readonly PromptBlock[]): ProviderTextBlock[] {
  return blocks.map((block) => ({ type: 'text' as const, text: block.text }));
}

// ─── SSE pump ────────────────────────────────────────────────────────────

export interface PumpArgs {
  body: ReadableStream<Uint8Array>;
  dialect: SseDialect;
  cb: StreamCallbacks;
  signal?: AbortSignal | undefined;
  classifyStreamError: (error: SseStreamError | null) => CgError;
  classifyUnsupportedChunk: (message: string) => CgError;
}

/**
 * Drains the response body through the shared parser, dispatching semantic
 * events to callbacks. The reader is released on every exit path, including
 * mid-stream error throws and aborts (legacy reader.cancel() discipline).
 */
export async function pumpSseStream(args: PumpArgs): Promise<string> {
  const { body, dialect, cb, signal } = args;
  const parser = new MessagesSseParser(dialect);
  const reader = body.getReader();
  let rawText = '';

  // A consumer abort must unblock a pending read() even when the response body
  // is not wired to the fetch signal (mocked transports); real fetch also
  // rejects the pending read natively.
  const onAbort = (): void => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      for (const event of parser.push(value ?? new Uint8Array())) {
        switch (event.kind) {
          case 'progress':
            cb.onProgress?.();
            break;
          case 'text-delta':
            rawText += event.text;
            cb.onText(event.text);
            break;
          case 'reasoning-observed':
            cb.onReasoningObserved?.(event.signal);
            break;
          case 'reasoning-delta':
            cb.onReasoningDelta?.(event.text);
            break;
          case 'usage':
            cb.onUsage?.(event.usage);
            break;
          case 'stop-reason':
            cb.onStopReason?.(event.stopReason);
            break;
          case 'stream-error':
            throw args.classifyStreamError(event.error);
          case 'unsupported-chunk':
            throw args.classifyUnsupportedChunk(event.message);
        }
      }
      if (done) {
        break;
      }
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
    void reader.cancel().catch(() => {});
  }

  return rawText;
}

// ─── Legacy auto-retry loop ──────────────────────────────────────────────

/**
 * Legacy rule (operations.ts): auto-retry only before the first text chunk and
 * at most once per kind — 429 when Retry-After ≤ 60s (wait Retry-After), 503/
 * service-unavailable after a fixed 5s. Terminal CgErrors fire onError exactly
 * once before rejecting; aborts reject without onError.
 */
export async function runWithLegacyRetry(
  cb: StreamCallbacks,
  signal: AbortSignal | undefined,
  attempt: (cb: StreamCallbacks) => Promise<string>,
): Promise<string> {
  let sawFirstChunk = false;
  const gatedCb: StreamCallbacks = {
    ...cb,
    onText: (text) => {
      sawFirstChunk = true;
      cb.onText(text);
    },
  };
  let rateLimitRetried = false;
  let serviceUnavailableRetried = false;

  while (true) {
    try {
      return await attempt(gatedCb);
    } catch (error) {
      if (!(error instanceof CgError)) {
        throw error;
      }
      if (!sawFirstChunk && !rateLimitRetried && error.code === 'CG-API-01') {
        const retryAfterMs = error.retryAfterMs;
        if (typeof retryAfterMs === 'number' && retryAfterMs <= AUTO_RETRY_RATE_LIMIT_MAX_MS) {
          rateLimitRetried = true;
          await abortableDelay(retryAfterMs, signal);
          continue;
        }
      }
      if (!sawFirstChunk && !serviceUnavailableRetried && error.code === 'CG-API-05') {
        serviceUnavailableRetried = true;
        await abortableDelay(AUTO_RETRY_SERVICE_UNAVAILABLE_MS, signal);
        continue;
      }
      cb.onError?.(error);
      throw error;
    }
  }
}
