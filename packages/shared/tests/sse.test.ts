import { describe, expect, it } from 'vitest';
import {
  MessagesSseParser,
  UNSUPPORTED_CHUNK_MESSAGE,
  mergeUsage,
  parseSseEventBlock,
  usageEquals,
} from '../src/llm/sse';
import type { LlmStreamEvent } from '../src/llm/sse';

declare class TextEncoder {
  encode(input?: string): Uint8Array;
}

function sse(lines: string[], separator = '\n'): string {
  return lines.join(separator);
}

function kinds(events: LlmStreamEvent[]): string[] {
  return events.map((event) => event.kind);
}

function textOf(events: LlmStreamEvent[]): string {
  return events
    .filter((event): event is Extract<LlmStreamEvent, { kind: 'text-delta' }> =>
      event.kind === 'text-delta',
    )
    .map((event) => event.text)
    .join('');
}

function usagesOf(events: LlmStreamEvent[]) {
  return events
    .filter((event): event is Extract<LlmStreamEvent, { kind: 'usage' }> => event.kind === 'usage')
    .map((event) => event.usage);
}

function signalsOf(events: LlmStreamEvent[]): string[] {
  return events
    .filter((event): event is Extract<LlmStreamEvent, { kind: 'reasoning-observed' }> =>
      event.kind === 'reasoning-observed',
    )
    .map((event) => event.signal);
}

describe('parseSseEventBlock', () => {
  it('defaults the event name to "message"', () => {
    expect(parseSseEventBlock('data: {"a":1}')).toEqual({ event: 'message', data: '{"a":1}' });
  });

  it('returns null for comment-only blocks', () => {
    expect(parseSseEventBlock(': OPENROUTER PROCESSING')).toBeNull();
    expect(parseSseEventBlock('')).toBeNull();
    expect(parseSseEventBlock('event: ping')).toBeNull();
  });

  it('joins multiple data lines with newlines', () => {
    expect(parseSseEventBlock('event: x\ndata: line1\ndata: line2')).toEqual({
      event: 'x',
      data: 'line1\nline2',
    });
  });

  it('tolerates trailing carriage returns on lines', () => {
    expect(parseSseEventBlock('event: message_start\r\ndata: {}\r')).toEqual({
      event: 'message_start',
      data: '{}',
    });
  });
});

describe('MessagesSseParser — Anthropic dialect', () => {
  it('streams text deltas and reports cumulative usage metrics', () => {
    const parser = new MessagesSseParser('anthropic');
    const events = parser.push(
      sse([
        'event: message_start',
        'data: {"type":"message_start","message":{"usage":{"input_tokens":120,"cache_creation_input_tokens":40,"cache_read_input_tokens":0,"output_tokens":3,"cache_creation":{"ephemeral_1h_input_tokens":20}}}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" there"}}',
        '',
        'event: message_delta',
        'data: {"type":"message_delta","usage":{"input_tokens":120,"cache_creation_input_tokens":40,"cache_read_input_tokens":55,"output_tokens":9,"cache_creation":{"ephemeral_5m_input_tokens":20}}}',
        '',
        'event: message_stop',
        'data: {"type":"message_stop"}',
        '',
      ]),
    );

    expect(textOf(events)).toBe('Hello there');
    // The final message_stop block has no trailing blank line and is discarded
    // (SSE spec; legacy behavior) — 4 delivered blocks, 4 progress events.
    expect(kinds(events).filter((kind) => kind === 'progress')).toHaveLength(4);
    expect(usagesOf(events)).toEqual([
      {
        input_tokens: 120,
        cache_creation_input_tokens: 40,
        cache_read_input_tokens: 0,
        output_tokens: 3,
        cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 20 },
      },
      {
        input_tokens: 120,
        cache_creation_input_tokens: 40,
        cache_read_input_tokens: 55,
        output_tokens: 9,
        cache_creation: { ephemeral_5m_input_tokens: 20, ephemeral_1h_input_tokens: 20 },
      },
    ]);
  });

  it('does not re-emit usage when a later event carries identical numbers', () => {
    const parser = new MessagesSseParser('anthropic');
    const events = parser.push(
      sse([
        'event: message_start',
        'data: {"type":"message_start","message":{"usage":{"input_tokens":10,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":1}}}',
        '',
        'event: message_delta',
        'data: {"type":"message_delta","usage":{"input_tokens":10,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":1}}',
        '',
        '',
      ]),
    );
    expect(usagesOf(events)).toHaveLength(1);
  });

  it('reports observed reasoning blocks from the Anthropic stream', () => {
    const parser = new MessagesSseParser('anthropic');
    const events = parser.push(
      sse([
        'event: content_block_start',
        'data: {"type":"content_block_start","content_block":{"type":"thinking"}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"checking context"}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","delta":{"type":"signature_delta","signature":"sig"}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"ok"}}',
        '',
        '',
      ]),
    );

    expect(signalsOf(events)).toEqual(['thinking_block', 'thinking_delta', 'signature_delta']);
    expect(events).toContainEqual({ kind: 'reasoning-delta', text: 'checking context' });
    expect(textOf(events)).toBe('ok');
  });

  it('flags redacted thinking blocks', () => {
    const parser = new MessagesSseParser('anthropic');
    const events = parser.push(
      'event: content_block_start\ndata: {"type":"content_block_start","content_block":{"type":"redacted_thinking"}}\n\n',
    );
    expect(signalsOf(events)).toEqual(['redacted_thinking_block']);
  });

  it('emits a terminal stream-error for mid-stream error events and ignores further input', () => {
    const parser = new MessagesSseParser('anthropic');
    const events = parser.push(
      'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"overloaded"}}\n\n',
    );

    expect(events).toEqual([
      { kind: 'progress' },
      { kind: 'stream-error', error: { type: 'overloaded_error', message: 'overloaded' } },
    ]);
    expect(
      parser.push(
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"late"}}\n\n',
      ),
    ).toEqual([]);
  });

  it('stops processing blocks that arrive after an error within the same chunk', () => {
    const parser = new MessagesSseParser('anthropic');
    const events = parser.push(
      sse([
        'event: error',
        'data: {"type":"error","error":{"type":"overloaded_error","message":"overloaded"}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"after"}}',
        '',
        '',
      ]),
    );
    expect(textOf(events)).toBe('');
    expect(kinds(events)).toEqual(['progress', 'stream-error']);
  });

  it('ignores data-only blocks: Anthropic events are identified by the event line only', () => {
    const parser = new MessagesSseParser('anthropic');
    const events = parser.push(
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hi"}}\n\n',
    );
    expect(kinds(events)).toEqual(['progress']);
  });

  it('skips [DONE] sentinels and unparseable JSON without emitting progress', () => {
    const parser = new MessagesSseParser('anthropic');
    expect(parser.push('data: [DONE]\n\n')).toEqual([]);
    expect(parser.push('event: message_delta\ndata: {not json\n\n')).toEqual([]);
  });

  it('reports stop reasons from message_delta, including explicit null', () => {
    const parser = new MessagesSseParser('anthropic');
    const events = parser.push(
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null}}\n\n',
    );
    expect(events).toContainEqual({ kind: 'stop-reason', stopReason: 'end_turn' });

    const nullEvents = parser.push(
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":null}}\n\n',
    );
    expect(nullEvents).toContainEqual({ kind: 'stop-reason', stopReason: null });
  });

  it('does not emit a stop reason when message_delta has no stop_reason key', () => {
    const parser = new MessagesSseParser('anthropic');
    const events = parser.push(
      'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":3}}\n\n',
    );
    expect(kinds(events)).not.toContain('stop-reason');
  });
});

describe('MessagesSseParser — OpenRouter dialect', () => {
  it('calls back text for content_block_delta and ignores comment blocks', () => {
    const parser = new MessagesSseParser('openrouter');
    const events = parser.push(
      sse([
        ': OPENROUTER PROCESSING',
        '',
        'event: message_start',
        'data: {"type":"message_start","message":{"usage":{"input_tokens":12,"output_tokens":1}}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hi"}}',
        '',
        'event: message_delta',
        'data: {"type":"message_delta","usage":{"output_tokens":3}}',
        '',
        'event: message_stop',
        'data: {"type":"message_stop"}',
        '',
        '',
      ]),
    );

    expect(textOf(events)).toBe('hi');
    expect(usagesOf(events).at(-1)).toEqual({
      input_tokens: 12,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      output_tokens: 3,
    });
  });

  it('parses events separated by CRLF blank lines', () => {
    const parser = new MessagesSseParser('openrouter');
    const events = parser.push(
      sse(
        [
          'event: message_start',
          'data: {"type":"message_start","message":{"usage":{"input_tokens":5,"output_tokens":1}}}',
          '',
          'event: content_block_delta',
          'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"crlf"}}',
          '',
          'event: message_stop',
          'data: {"type":"message_stop"}',
          '',
          '',
        ],
        '\r\n',
      ),
    );
    expect(textOf(events)).toBe('crlf');
  });

  it('reports Anthropic message stop reasons from the OpenRouter stream', () => {
    const parser = new MessagesSseParser('openrouter');
    const events = parser.push(
      sse([
        'event: message_delta',
        'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens","stop_sequence":null},"usage":{"output_tokens":800}}',
        '',
        '',
      ]),
    );
    expect(events).toContainEqual({ kind: 'stop-reason', stopReason: 'max_tokens' });
  });

  it('handles data-only Anthropic message events by using payload.type', () => {
    const parser = new MessagesSseParser('openrouter');
    const events = parser.push(
      sse([
        'data: {"type":"message_start","message":{"usage":{"input_tokens":8,"output_tokens":1}}}',
        '',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hi"}}',
        '',
        'data: {"type":"message_delta","usage":{"output_tokens":2}}',
        '',
        'data: {"type":"message_stop"}',
        '',
        '',
      ]),
    );

    expect(textOf(events)).toBe('hi');
    expect(usagesOf(events).at(-1)).toEqual({
      input_tokens: 8,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      output_tokens: 2,
    });
  });

  it('preserves Anthropic-shaped cache read and write usage', () => {
    const parser = new MessagesSseParser('openrouter');
    const events = parser.push(
      sse([
        'event: message_start',
        'data: {"type":"message_start","message":{"usage":{"input_tokens":10,"cache_creation_input_tokens":42,"cache_read_input_tokens":7,"output_tokens":1}}}',
        '',
        'event: message_delta',
        'data: {"type":"message_delta","usage":{"cache_read_input_tokens":99,"output_tokens":3}}',
        '',
        '',
      ]),
    );
    expect(usagesOf(events).at(-1)).toEqual({
      input_tokens: 10,
      cache_creation_input_tokens: 42,
      cache_read_input_tokens: 99,
      output_tokens: 3,
    });
  });

  it('maps OpenAI-shaped usage without prompt token details to uncached input', () => {
    const parser = new MessagesSseParser('openrouter');
    const events = parser.push(
      'event: message_delta\ndata: {"type":"message_delta","usage":{"prompt_tokens":1000,"completion_tokens":100}}\n\n',
    );
    expect(usagesOf(events).at(-1)).toEqual({
      input_tokens: 1000,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      output_tokens: 100,
    });
  });

  it('maps OpenAI-shaped usage with prompt token details without double-counting cached tokens', () => {
    const parser = new MessagesSseParser('openrouter');
    const events = parser.push(
      'event: message_delta\ndata: {"type":"message_delta","usage":{"prompt_tokens":1000,"completion_tokens":100,"prompt_tokens_details":{"cached_tokens":300,"cache_write_tokens":200}}}\n\n',
    );
    expect(usagesOf(events).at(-1)).toEqual({
      input_tokens: 500,
      cache_creation_input_tokens: 200,
      cache_read_input_tokens: 300,
      output_tokens: 100,
    });
  });

  it('rejects unsupported OpenAI chat completion chunks on the Messages stream', () => {
    const parser = new MessagesSseParser('openrouter');
    const events = parser.push(
      sse([
        'data: {"object":"chat.completion.chunk","choices":[{"delta":{"content":"hi"}}]}',
        '',
        'data: [DONE]',
        '',
        '',
      ]),
    );
    expect(events).toEqual([
      { kind: 'progress' },
      { kind: 'unsupported-chunk', message: UNSUPPORTED_CHUNK_MESSAGE },
    ]);
    expect(parser.push('data: {"type":"message_stop"}\n\n')).toEqual([]);
  });

  it('classifies data-only stream error payloads before event validation', () => {
    const parser = new MessagesSseParser('openrouter');
    const events = parser.push('data: {"error":{"code":429,"message":"rate limit exceeded"}}\n\n');
    expect(events).toEqual([
      { kind: 'progress' },
      { kind: 'stream-error', error: { code: 429, message: 'rate limit exceeded' } },
    ]);
  });

  it('treats an explicit null error field as a normal chunk (legacy truthiness)', () => {
    const parser = new MessagesSseParser('openrouter');
    const events = parser.push(
      'data: {"type":"content_block_delta","error":null,"delta":{"type":"text_delta","text":"ok"}}\n\n',
    );
    expect(textOf(events)).toBe('ok');
    expect(kinds(events)).not.toContain('stream-error');
  });

  it('silently ignores unknown metadata events without choices', () => {
    const parser = new MessagesSseParser('openrouter');
    const events = parser.push('event: meta\ndata: {"provider":"x"}\n\n');
    expect(kinds(events)).toEqual(['progress']);
    expect(parser.push('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"on"}}\n\n')).toContainEqual({
      kind: 'text-delta',
      text: 'on',
    });
  });

  it.each([
    ['delta', '{"type":"message_delta","choices":[{"delta":{"reasoning":""}}]}'],
    ['message', '{"type":"message_delta","choices":[{"message":{"reasoning":""}}]}'],
  ])('reports empty choices[].%s.reasoning as observed reasoning', (_shape, data) => {
    const parser = new MessagesSseParser('openrouter');
    const events = parser.push(`event: message_delta\ndata: ${data}\n\n`);
    expect(signalsOf(events)).toEqual(['reasoning_delta']);
    // Empty reasoning text is observed but produces no reasoning-delta text event.
    expect(kinds(events)).not.toContain('reasoning-delta');
  });

  it('extracts non-empty choices reasoning text', () => {
    const parser = new MessagesSseParser('openrouter');
    const events = parser.push(
      'event: message_delta\ndata: {"type":"message_delta","choices":[{"delta":{"reasoning":"pondering"}}]}\n\n',
    );
    expect(signalsOf(events)).toEqual(['reasoning_delta']);
    expect(events).toContainEqual({ kind: 'reasoning-delta', text: 'pondering' });
  });

  it('reports observed reasoning blocks from the OpenRouter Messages stream', () => {
    const parser = new MessagesSseParser('openrouter');
    const events = parser.push(
      sse([
        'event: content_block_start',
        'data: {"type":"content_block_start","content_block":{"type":"thinking"}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"checking context"}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","delta":{"type":"signature_delta","signature":"sig"}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"ok"}}',
        '',
        '',
      ]),
    );

    expect(signalsOf(events)).toEqual(['thinking_block', 'thinking_delta', 'signature_delta']);
    expect(events).toContainEqual({ kind: 'reasoning-delta', text: 'checking context' });
    expect(textOf(events)).toBe('ok');
  });
});

describe('MessagesSseParser — incremental delivery', () => {
  it('assembles an event split across pushes', () => {
    const parser = new MessagesSseParser('anthropic');
    const part1 = 'event: content_block_delta\ndata: {"type":"content_block_del';
    const part2 = 'ta","delta":{"type":"text_delta","text":"joined"}}\n\n';
    expect(parser.push(part1)).toEqual([]);
    expect(textOf(parser.push(part2))).toBe('joined');
  });

  it('handles a CRLF boundary split across pushes', () => {
    const parser = new MessagesSseParser('anthropic');
    const block =
      'event: content_block_delta\r\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"x"}}\r\n\r';
    expect(parser.push(block)).toEqual([]);
    expect(textOf(parser.push('\n'))).toBe('x');
  });

  it('decodes byte input split inside a multi-byte UTF-8 character', () => {
    const bytes = new TextEncoder().encode(
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"héllo"}}\n\n',
    );
    const splitAt = bytes.findIndex((byte) => byte === 0xc3) + 1; // split between the two bytes of é
    const parser = new MessagesSseParser('anthropic');
    const events = [
      ...parser.push(bytes.slice(0, splitAt)),
      ...parser.push(bytes.slice(splitAt)),
    ];
    expect(textOf(events)).toBe('héllo');
  });

  it('joins multi-line data blocks before JSON parsing', () => {
    const parser = new MessagesSseParser('anthropic');
    const events = parser.push(
      'event: content_block_delta\ndata: {"type":"content_block_delta",\ndata: "delta":{"type":"text_delta","text":"multi"}}\n\n',
    );
    expect(textOf(events)).toBe('multi');
  });

  it('discards a trailing block that never receives its blank-line terminator', () => {
    const parser = new MessagesSseParser('anthropic');
    expect(
      parser.push(
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"tail"}}',
      ),
    ).toEqual([]);
  });
});

describe('mergeUsage / usageEquals', () => {
  it('keeps prior fields when the next payload omits them', () => {
    const first = mergeUsage(null, { input_tokens: 10, output_tokens: 1 });
    expect(first).toEqual({
      input_tokens: 10,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      output_tokens: 1,
    });
    expect(mergeUsage(first, { output_tokens: 5 })).toEqual({
      input_tokens: 10,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      output_tokens: 5,
    });
  });

  it('merges partial cache_creation breakdowns field by field', () => {
    const first = mergeUsage(null, {
      input_tokens: 1,
      cache_creation: { ephemeral_1h_input_tokens: 20 },
    });
    const second = mergeUsage(first, { cache_creation: { ephemeral_5m_input_tokens: 20 } });
    expect(second?.cache_creation).toEqual({
      ephemeral_5m_input_tokens: 20,
      ephemeral_1h_input_tokens: 20,
    });
  });

  it('returns the current usage unchanged for an absent payload', () => {
    const current = mergeUsage(null, { input_tokens: 1 });
    expect(mergeUsage(current, undefined)).toBe(current);
    expect(mergeUsage(null, undefined)).toBeNull();
  });

  it('compares usage including the cache_creation breakdown', () => {
    const a = mergeUsage(null, { input_tokens: 1, cache_creation: { ephemeral_5m_input_tokens: 2 } });
    const b = mergeUsage(null, { input_tokens: 1, cache_creation: { ephemeral_5m_input_tokens: 2 } });
    const c = mergeUsage(null, { input_tokens: 1, cache_creation: { ephemeral_5m_input_tokens: 3 } });
    expect(usageEquals(a, b)).toBe(true);
    expect(usageEquals(a, c)).toBe(false);
    expect(usageEquals(null, null)).toBe(true);
    expect(usageEquals(a, null)).toBe(false);
    // A missing breakdown equals an all-zero breakdown.
    const d = mergeUsage(null, { input_tokens: 1 });
    const e = mergeUsage(null, {
      input_tokens: 1,
      cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
    });
    expect(usageEquals(d, e)).toBe(true);
  });
});
