import { describe, expect, it } from 'vitest';
import { createHubAiGateway } from '@main/hub/ai-gateway';
import { makeFakeHubClient } from './helpers';
import { baseRequest } from '../ai-providers/helpers';
import type { AiGatewayRequest } from '@main/ai/gateway';

function request(overrides: Partial<AiGatewayRequest> = {}): AiGatewayRequest {
  return {
    ...baseRequest(),
    clientRequestId: '11111111-1111-4111-8111-111111111111',
    accountId: 'acct_hub',
    chatId: '90001',
    isRegeneration: true,
    transport: 'hub',
    ...overrides,
  };
}

describe('createHubAiGateway', () => {
  it('maps desktop prompt metadata into the core AI gateway request', async () => {
    const client = makeFakeHubClient();
    const gateway = createHubAiGateway({
      client,
      resolvePageLabel: () => Promise.resolve('Lora'),
    });
    const texts: string[] = [];
    const usage: unknown[] = [];
    const completed: string[] = [];

    gateway.stream(request(), {
      onText: (text) => texts.push(text),
      onUsage: (u) => usage.push(u),
      onError: (error) => {
        throw error;
      },
      onComplete: (rawText) => completed.push(rawText),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(client.aiGatewayRequests).toHaveLength(1);
    expect(client.aiGatewayRequests[0]).toMatchObject({
      clientRequestId: '11111111-1111-4111-8111-111111111111',
      feature: 'fast-reply',
      pageLabel: 'Lora',
      platform: 'onlyfans',
      platformUserId: '90001',
      conversationId: '90001',
      model: 'anthropic:claude-sonnet-4-5',
      isRegeneration: true,
    });
    expect(client.aiGatewayRequests[0]?.prompt.systemBlocks).toEqual(request().systemBlocks);
    expect(texts).toEqual(['hub reply']);
    expect(usage).toHaveLength(1);
    expect(completed).toEqual(['hub reply']);
  });

  it('fails without calling core when the account cannot resolve to a page label', async () => {
    const client = makeFakeHubClient();
    const gateway = createHubAiGateway({
      client,
      resolvePageLabel: () => Promise.resolve(null),
    });
    const errors: string[] = [];

    gateway.stream(request(), {
      onText: () => {},
      onError: (error) => errors.push(error.code),
      onComplete: () => {},
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(errors).toEqual(['CG-HUB-02']);
    expect(client.streamAiGatewayMock).not.toHaveBeenCalled();
  });
});
