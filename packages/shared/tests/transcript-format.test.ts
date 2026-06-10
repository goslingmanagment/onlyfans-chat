import { describe, expect, it } from 'vitest';
import { EMPTY_TRANSCRIPT_TEXT, formatTranscript, formatTranscriptTime } from '../src/transcript/format';
import type { TranscriptMessage } from '../src/transcript/normalize';

function makeT(overrides: Partial<TranscriptMessage> = {}): TranscriptMessage {
  return {
    id: 1,
    createdAtMs: 1700000000000,
    sender: 'Fan',
    text: 'hello',
    labels: [],
    ...overrides,
  };
}

describe('formatTranscript', () => {
  // legacy: 'returns "No conversation history." for empty messages'
  it('returns "No conversation history." for empty messages', () => {
    expect(formatTranscript([])).toBe('No conversation history.');
    expect(EMPTY_TRANSCRIPT_TEXT).toBe('No conversation history.');
  });

  // legacy: 'formats messages with [HH:MM] SenderLabel: text'
  it('formats messages as [HH:MM] Sender: text', () => {
    expect(formatTranscript([makeT({ text: 'hi there' })])).toMatch(
      /^\[\d{2}:\d{2}\] Fan: hi there$/,
    );
  });

  // legacy: 'prepends labels before text'
  it('prepends labels before text', () => {
    const result = formatTranscript([makeT({ labels: ['[Tip: $5.00]'], text: 'love you' })]);
    expect(result).toContain('[Tip: $5.00] love you');
  });

  // legacy: 'joins multiple messages with newlines'
  it('joins multiple messages with newlines', () => {
    const lines = formatTranscript([
      makeT({ id: 1, createdAtMs: 100000, text: 'first' }),
      makeT({ id: 2, createdAtMs: 200000, text: 'second' }),
    ]).split('\n');
    expect(lines).toHaveLength(2);
  });

  // legacy: 'uses Model label for model sender'
  it('uses Model label for model sender', () => {
    expect(formatTranscript([makeT({ sender: 'Model', text: 'hey' })])).toContain('Model: hey');
  });

  it('renders label-only messages without trailing space', () => {
    const result = formatTranscript([makeT({ text: '', labels: ['[Photo]'] })]);
    expect(result).toMatch(/^\[\d{2}:\d{2}\] Fan: \[Photo\]$/);
  });

  // Deliberate change from legacy local-time: UTC always (SPEC §8.2, 2026-06-10).
  it('renders timestamps in UTC regardless of machine timezone', () => {
    const result = formatTranscript([
      makeT({ createdAtMs: Date.parse('2026-06-10T14:56:16+00:00') }),
    ]);
    expect(result.startsWith('[14:56]')).toBe(true);
  });

  it('converts non-UTC ISO offsets to UTC wall-clock', () => {
    expect(formatTranscriptTime(Date.parse('2026-06-10T14:56:16+02:00'))).toBe('12:56');
  });

  it('zero-pads hours and minutes', () => {
    expect(formatTranscriptTime(Date.parse('2026-06-10T05:07:00Z'))).toBe('05:07');
    expect(formatTranscriptTime(Date.parse('2026-06-10T00:00:59Z'))).toBe('00:00');
  });
});
