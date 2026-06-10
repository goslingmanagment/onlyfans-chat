import { describe, expect, it } from 'vitest';
import { normalizeTranscriptMessages } from '../src/transcript/normalize';
import type { TranscriptMessage } from '../src/transcript/normalize';
import { ofapiChatMessageSchema } from '../src/transcript/ofapi-message';
import {
  analyzePingSegment,
  resolvePingSegment,
  PING_ACTIVE_WINDOW_MS,
  PING_MIN_FAN_MESSAGES,
} from '../src/transcript/ping-segment';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-03-02T00:00:00Z').getTime();

function makeT(overrides: Partial<TranscriptMessage> = {}): TranscriptMessage {
  return {
    id: 1,
    createdAtMs: NOW - 30 * DAY_MS,
    sender: 'Fan',
    text: 'hello',
    labels: [],
    ...overrides,
  };
}

describe('ping constants', () => {
  it('keeps the exact legacy thresholds', () => {
    expect(PING_ACTIVE_WINDOW_MS).toBe(5 * 24 * 60 * 60 * 1000);
    expect(PING_MIN_FAN_MESSAGES).toBe(3);
  });
});

describe('analyzePingSegment', () => {
  // legacy: 'returns segment-b for no fan text messages'
  it('returns segment-b for no fan text messages', () => {
    const result = analyzePingSegment([], NOW);
    expect(result.segment).toBe('segment-b');
    expect(result.fanTextMessageCount).toBe(0);
    expect(result.latestFanTextAtMs).toBeNull();
    expect(result.latestOverallTextSender).toBeNull();
    expect(result.latestOverallTextAtMs).toBeNull();
  });

  // legacy: 'returns active when latest fan text is within 5 days'
  it('returns active when latest fan text is within 5 days', () => {
    const result = analyzePingSegment([makeT({ createdAtMs: NOW - 1 * DAY_MS })], NOW);
    expect(result.segment).toBe('active');
  });

  // legacy: 'returns segment-a when fan has 3+ messages and latest is outside 5-day window'
  it('returns segment-a when fan has 3+ texts and latest is outside the window', () => {
    const messages = [
      makeT({ id: 1, createdAtMs: NOW - 10 * DAY_MS }),
      makeT({ id: 2, createdAtMs: NOW - 9 * DAY_MS }),
      makeT({ id: 3, createdAtMs: NOW - 8 * DAY_MS }),
    ];
    const result = analyzePingSegment(messages, NOW);
    expect(result.segment).toBe('segment-a');
    expect(result.fanTextMessageCount).toBe(3);
    expect(result.latestFanTextAtMs).toBe(NOW - 8 * DAY_MS);
  });

  // legacy: 'returns segment-b when fan has < 3 messages and latest is outside 5-day window'
  it('returns segment-b when fan has fewer than 3 texts outside the window', () => {
    const messages = [
      makeT({ id: 1, createdAtMs: NOW - 10 * DAY_MS }),
      makeT({ id: 2, createdAtMs: NOW - 9 * DAY_MS }),
    ];
    const result = analyzePingSegment(messages, NOW);
    expect(result.segment).toBe('segment-b');
    expect(result.fanTextMessageCount).toBe(2);
  });

  // legacy: 'ignores system messages (type !== 1)' — adapted: OFAPI chat lists carry no
  // system type; the surviving fact is that label-only/empty-text messages never count.
  it('ignores recent label-only messages with empty text', () => {
    const messages = [
      makeT({ id: 1, createdAtMs: NOW - 10 * DAY_MS }),
      makeT({ id: 2, createdAtMs: NOW - 9 * DAY_MS }),
      makeT({ id: 3, createdAtMs: NOW - 1 * DAY_MS, text: '', labels: ['[Photo]'] }),
    ];
    const result = analyzePingSegment(messages, NOW);
    expect(result.segment).toBe('segment-b');
    expect(result.fanTextMessageCount).toBe(2);
  });

  // legacy: 'ignores empty-text messages'
  it('ignores empty-text messages entirely', () => {
    const result = analyzePingSegment([makeT({ createdAtMs: NOW - 1 * DAY_MS, text: '' })], NOW);
    expect(result.segment).toBe('segment-b');
  });

  it('ignores whitespace-only text messages', () => {
    const result = analyzePingSegment([makeT({ createdAtMs: NOW - 1 * DAY_MS, text: '  \n ' })], NOW);
    expect(result.segment).toBe('segment-b');
    expect(result.fanTextMessageCount).toBe(0);
  });

  // legacy: 'tracks latest overall text sender and time'
  it('tracks latest overall text sender and time across senders', () => {
    const messages = [
      makeT({ id: 1, createdAtMs: NOW - 8 * DAY_MS }),
      makeT({ id: 2, createdAtMs: NOW - 7 * DAY_MS }),
      makeT({ id: 3, createdAtMs: NOW - 6 * DAY_MS }),
      makeT({ id: 4, createdAtMs: NOW - 1 * DAY_MS, sender: 'Model' }),
    ];
    const result = analyzePingSegment(messages, NOW);
    expect(result.segment).toBe('segment-a');
    expect(result.latestOverallTextSender).toBe('Model');
    expect(result.latestOverallTextAtMs).toBe(NOW - 1 * DAY_MS);
    expect(result.latestFanTextAtMs).toBe(NOW - 6 * DAY_MS);
  });

  it('treats a fan text exactly PING_ACTIVE_WINDOW_MS old as active (inclusive boundary)', () => {
    const result = analyzePingSegment(
      [makeT({ createdAtMs: NOW - PING_ACTIVE_WINDOW_MS })],
      NOW,
    );
    expect(result.segment).toBe('active');
  });

  it('flips to segment-a exactly 1 ms past the window with 3 fan texts', () => {
    const edge = NOW - PING_ACTIVE_WINDOW_MS - 1;
    const messages = [
      makeT({ id: 1, createdAtMs: edge - 2 }),
      makeT({ id: 2, createdAtMs: edge - 1 }),
      makeT({ id: 3, createdAtMs: edge }),
    ];
    expect(analyzePingSegment(messages, NOW).segment).toBe('segment-a');
  });

  it('flips to segment-b exactly 1 ms past the window with fewer than 3 fan texts', () => {
    const edge = NOW - PING_ACTIVE_WINDOW_MS - 1;
    const messages = [
      makeT({ id: 1, createdAtMs: edge - 1 }),
      makeT({ id: 2, createdAtMs: edge }),
    ];
    expect(analyzePingSegment(messages, NOW).segment).toBe('segment-b');
  });

  it('only model texts present → segment-b with overall sender Model', () => {
    const result = analyzePingSegment(
      [makeT({ createdAtMs: NOW - 1 * DAY_MS, sender: 'Model' })],
      NOW,
    );
    expect(result.segment).toBe('segment-b');
    expect(result.fanTextMessageCount).toBe(0);
    expect(result.latestOverallTextSender).toBe('Model');
  });
});

describe('resolvePingSegment', () => {
  // legacy: 'delegates to analyzePingSegment and returns segment'
  it('delegates to analyzePingSegment and returns the segment', () => {
    expect(resolvePingSegment([makeT({ createdAtMs: NOW - 1 * DAY_MS })], NOW)).toBe('active');
  });
});

describe('ping segment over normalized OFAPI messages (ISO createdAt conversion)', () => {
  function ofapiMsg(id: number, createdAt: string, isSentByMe = false, text = '<p>hey</p>') {
    return ofapiChatMessageSchema.parse({ id, createdAt, isSentByMe, text });
  }

  it('a fan ISO timestamp exactly 5 days old is active', () => {
    const messages = normalizeTranscriptMessages([
      ofapiMsg(1, '2026-02-25T00:00:00+00:00'),
    ]);
    expect(resolvePingSegment(messages, NOW)).toBe('active');
  });

  it('a fan ISO timestamp 5 days + 1 s old is outside the window', () => {
    const messages = normalizeTranscriptMessages([
      ofapiMsg(1, '2026-02-24T23:59:59+00:00'),
    ]);
    expect(resolvePingSegment(messages, NOW)).toBe('segment-b');
  });

  it('non-UTC offsets convert correctly: 02:00+02:00 five days back is exactly on the boundary', () => {
    const messages = normalizeTranscriptMessages([
      ofapiMsg(1, '2026-02-25T02:00:00+02:00'),
    ]);
    expect(resolvePingSegment(messages, NOW)).toBe('active');
  });

  it('media-only OFAPI messages (empty text after stripping) never count as fan texts', () => {
    const messages = normalizeTranscriptMessages([
      ofapiMsg(1, '2026-02-20T00:00:00+00:00'),
      ofapiMsg(2, '2026-02-21T00:00:00+00:00'),
      ofapiChatMessageSchema.parse({
        id: 3,
        createdAt: '2026-03-01T00:00:00+00:00',
        isSentByMe: false,
        text: '<p></p>',
        mediaCount: 1,
        media: [{ id: 1, type: 'photo' }],
      }),
    ]);
    const result = analyzePingSegment(messages, NOW);
    expect(result.segment).toBe('segment-b');
    expect(result.fanTextMessageCount).toBe(2);
  });
});
