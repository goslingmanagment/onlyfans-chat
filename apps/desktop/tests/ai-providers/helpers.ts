// Test plumbing for the provider streaming clients: a recording fetch fed by
// scripted Response factories (a Response body is single-use, so retries need
// fresh instances) and SSE body builders.

import type {
  FetchImpl,
  LlmStreamRequest,
  ProviderRequestInit,
} from '@main/ai/providers/index';

export interface RecordedCall {
  url: string;
  init: ProviderRequestInit;
}

export function recordingFetch(responses: Array<() => Response>): {
  fetchImpl: FetchImpl;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const queue = [...responses];
  const fetchImpl: FetchImpl = (url, init) => {
    calls.push({ url, init });
    const next = queue.shift();
    if (!next) {
      return Promise.reject(new Error('Unexpected extra fetch call'));
    }
    return Promise.resolve(next());
  };
  return { fetchImpl, calls };
}

/** Joins SSE event blocks, terminating every block with the required blank line. */
export function sse(...events: string[]): string {
  return events.map((event) => `${event}\n\n`).join('');
}

export function sseResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

export function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

export function parsedBody(call: RecordedCall | undefined): unknown {
  if (!call) {
    throw new Error('Expected a recorded fetch call');
  }
  const body: unknown = JSON.parse(call.init.body);
  return body;
}

export function baseRequest(overrides: Partial<LlmStreamRequest> = {}): LlmStreamRequest {
  return {
    feature: 'fast-reply',
    modelId: 'anthropic:claude-sonnet-4-5',
    systemBlocks: [
      { text: 'system preamble', cache: 'none' },
      { text: 'personality card', cache: '1h' },
    ],
    userBlocks: [
      { text: 'static prefix', cache: '1h' },
      { text: 'transcript', cache: '5m' },
      { text: 'task', cache: 'none' },
    ],
    reasoningEffort: 'medium',
    ...overrides,
  };
}

/** Minimal well-formed stream for request-shape tests; resolves to ''. */
export const MINIMAL_STREAM = sse('event: message_stop\ndata: {"type":"message_stop"}');

export const HAPPY_STREAM = sse(
  'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":120,"cache_creation_input_tokens":40,"cache_read_input_tokens":0,"output_tokens":3,"cache_creation":{"ephemeral_1h_input_tokens":20}}}}',
  'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}',
  'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":" there"}}',
  'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"input_tokens":120,"cache_creation_input_tokens":40,"cache_read_input_tokens":55,"output_tokens":9,"cache_creation":{"ephemeral_5m_input_tokens":20}}}',
  'event: message_stop\ndata: {"type":"message_stop"}',
);

export const OVERLOADED_STREAM = sse(
  'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}',
);

export async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the promise to reject');
}
