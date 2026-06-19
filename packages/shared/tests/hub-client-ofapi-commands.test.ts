import { describe, expect, it } from 'vitest';
import { createHubClient } from '../src/hub/client';
import type { HubFetch, HubRequestInit, HubResponseLike } from '../src/hub/client';
import type { HubError, HubOfapiCommand } from '../src/hub/client';

const COMMAND_ID = '22222222-2222-4222-8222-222222222222';
const CLIENT_COMMAND_ID = '11111111-1111-4111-8111-111111111111';

function jsonResponse(body: unknown, status = 200): HubResponseLike {
  return {
    status,
    headers: { get: () => null },
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

function commandResponse(overrides: Partial<HubOfapiCommand> = {}): HubOfapiCommand {
  return {
    commandId: COMMAND_ID,
    clientCommandId: CLIENT_COMMAND_ID,
    kind: 'send_text_message_v1',
    accountId: 'acct_abc123',
    conversationId: '123456',
    state: 'queued',
    payloadHash: 'a'.repeat(64),
    retryOfCommandId: null,
    attemptCount: 0,
    lastErrorCode: null,
    lastErrorClass: null,
    verifierResult: null,
    platformMessageId: null,
    attemptStartedAt: null,
    attemptFinishedAt: null,
    createdAt: '2026-06-19T22:00:00.000Z',
    updatedAt: '2026-06-19T22:00:00.000Z',
    deduplicated: false,
    ...overrides,
  };
}

function makeCommand() {
  return {
    clientCommandId: CLIENT_COMMAND_ID,
    kind: 'send_text_message_v1' as const,
    accountId: 'acct_abc123',
    conversationId: '123456',
    payload: { text: 'harmless test' },
  };
}

describe('HubClient OFAPI command outbox', () => {
  it('creates command rows through the core outbox without accepting payload text in the response', async () => {
    const calls: Array<{ url: string; init: HubRequestInit }> = [];
    const fetchImpl: HubFetch = (url, init) => {
      calls.push({ url, init });
      return Promise.resolve(jsonResponse(commandResponse({ state: 'queued' }), 202));
    };
    const client = createHubClient({ baseUrl: 'https://hub.example.com/', apiKey: 'k', fetchImpl });

    const result = await client.createOfapiCommand({ command: makeCommand() });

    expect(result).toMatchObject({
      commandId: COMMAND_ID,
      state: 'queued',
      payloadHash: 'a'.repeat(64),
      deduplicated: false,
    });
    expect('payload' in result).toBe(false);
    expect(calls[0]?.url).toBe('https://hub.example.com/api/v1/ofapi/commands');
    expect(calls[0]?.init.method).toBe('POST');
    expect(JSON.parse(calls[0]?.init.body ?? '{}')).toEqual(makeCommand());
  });

  it('reads and cancels command state with terminal recovery fields', async () => {
    const calls: Array<{ url: string; init: HubRequestInit }> = [];
    const fetchImpl: HubFetch = (url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/cancel')) {
        return Promise.resolve(jsonResponse(commandResponse({ state: 'cancelled' })));
      }
      return Promise.resolve(jsonResponse(commandResponse({
        state: 'indeterminate',
        attemptCount: 1,
        lastErrorCode: 'CG-OF-06',
        lastErrorClass: 'timeout',
        attemptStartedAt: '2026-06-19T22:00:01.000Z',
        attemptFinishedAt: '2026-06-19T22:00:11.000Z',
      })));
    };
    const client = createHubClient({ baseUrl: 'https://hub.example.com', apiKey: 'k', fetchImpl });

    await expect(client.getOfapiCommand({ commandId: COMMAND_ID })).resolves.toMatchObject({
      state: 'indeterminate',
      attemptCount: 1,
      lastErrorCode: 'CG-OF-06',
    });
    await expect(client.cancelOfapiCommand({ commandId: COMMAND_ID })).resolves.toMatchObject({
      state: 'cancelled',
    });

    expect(calls.map((call) => `${call.init.method} ${call.url}`)).toEqual([
      `GET https://hub.example.com/api/v1/ofapi/commands/${COMMAND_ID}`,
      `POST https://hub.example.com/api/v1/ofapi/commands/${COMMAND_ID}/cancel`,
    ]);
  });

  it('fails before the wire for malformed command requests and command ids', async () => {
    const fetchImpl: HubFetch = () => {
      throw new Error('must not fetch');
    };
    const client = createHubClient({ baseUrl: 'https://hub.example.com', apiKey: 'k', fetchImpl });

    await expect(client.createOfapiCommand({
      command: { ...makeCommand(), payload: { text: '   ' } },
    })).rejects.toMatchObject({
      code: 'CG-HUB-02',
      reason: 'bad-request',
    } satisfies Partial<HubError>);
    await expect(client.getOfapiCommand({ commandId: 'not-a-uuid' })).rejects.toMatchObject({
      code: 'CG-HUB-02',
      reason: 'bad-request',
    } satisfies Partial<HubError>);
  });

  it('fails closed if core ever echoes raw command payload text', async () => {
    const fetchImpl: HubFetch = () => Promise.resolve(jsonResponse({
      ...commandResponse(),
      payload: { text: 'must not reach desktop state' },
    }));
    const client = createHubClient({ baseUrl: 'https://hub.example.com', apiKey: 'k', fetchImpl });

    await expect(client.getOfapiCommand({ commandId: COMMAND_ID })).rejects.toMatchObject({
      code: 'CG-HUB-02',
      reason: 'invalid-response',
    } satisfies Partial<HubError>);
  });
});
