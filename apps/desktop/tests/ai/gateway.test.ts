// DirectGateway (SPEC §8.6): provider routing over routeStream with keys read
// from the keychain at call time; completion/error/cancel callback contract.

import { describe, expect, it } from 'vitest';
import type { CgError } from '@chatgoose/shared/errors/index';
import type { LlmUsageMetrics } from '@chatgoose/shared/llm/sse';
import { createDirectGateway } from '@main/ai/gateway';
import type { AiGatewayCallbacks } from '@main/ai/gateway';
import { baseRequest, HAPPY_STREAM, recordingFetch, sseResponse } from '../ai-providers/helpers';
import { makeKeychain } from './helpers';

interface Collected {
  cb: AiGatewayCallbacks;
  texts: string[];
  errors: CgError[];
  completed: string[];
  usage: LlmUsageMetrics[];
  done: Promise<void>;
}

function collector(): Collected {
  const texts: string[] = [];
  const errors: CgError[] = [];
  const completed: string[] = [];
  const usage: LlmUsageMetrics[] = [];
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  return {
    texts,
    errors,
    completed,
    usage,
    done,
    cb: {
      onText: (text) => texts.push(text),
      onUsage: (u) => usage.push(u),
      onError: (error) => {
        errors.push(error);
        resolveDone();
      },
      onComplete: (rawText) => {
        completed.push(rawText);
        resolveDone();
      },
    },
  };
}

describe('createDirectGateway', () => {
  it('streams via the provider with the keychain key and completes with the raw text', async () => {
    const { fetchImpl, calls } = recordingFetch([() => sseResponse(HAPPY_STREAM)]);
    const gateway = createDirectGateway({
      keychain: makeKeychain({ anthropicKey: 'sk-ant-test' }),
      fetchImpl,
    });
    const collected = collector();

    gateway.stream(baseRequest(), collected.cb);
    await collected.done;

    expect(collected.completed).toEqual(['Hello there']);
    expect(collected.texts.join('')).toBe('Hello there');
    expect(collected.errors).toHaveLength(0);
    expect(collected.usage.length).toBeGreaterThan(0);
    expect(calls[0]?.init.headers['x-api-key']).toBe('sk-ant-test');
  });

  it('fails with CG-AUTH-01 when the provider key is missing (no fetch issued)', async () => {
    const { fetchImpl, calls } = recordingFetch([]);
    const gateway = createDirectGateway({ keychain: makeKeychain({}), fetchImpl });
    const collected = collector();

    gateway.stream(baseRequest(), collected.cb);
    await collected.done;

    expect(collected.errors).toHaveLength(1);
    expect(collected.errors[0]?.code).toBe('CG-AUTH-01');
    expect(collected.completed).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it('cancellation suppresses both completion and error callbacks', async () => {
    const { fetchImpl } = recordingFetch([() => sseResponse(HAPPY_STREAM)]);
    const gateway = createDirectGateway({
      keychain: makeKeychain({ anthropicKey: 'sk-ant-test' }),
      fetchImpl,
    });
    const collected = collector();

    const cancel = gateway.stream(baseRequest(), collected.cb);
    cancel();
    // allow the async pipeline to wind down
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(collected.completed).toHaveLength(0);
    expect(collected.errors).toHaveLength(0);
  });
});
