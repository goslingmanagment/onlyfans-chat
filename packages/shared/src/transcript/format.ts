import type { TranscriptMessage } from './normalize';

export const EMPTY_TRANSCRIPT_TEXT = 'No conversation history.';

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * [HH:MM] in UTC for everyone (SPEC §8.2 decision 2026-06-10; legacy used the
 * machine-local timezone — deliberate change for byte-stable shared context).
 */
export function formatTranscriptTime(createdAtMs: number): string {
  const date = new Date(createdAtMs);
  return `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;
}

/** Legacy line shape: `[HH:MM] Sender: {labels} {text}`, lines joined with '\n'. */
export function formatTranscript(messages: readonly TranscriptMessage[]): string {
  if (messages.length === 0) {
    return EMPTY_TRANSCRIPT_TEXT;
  }
  return messages
    .map((message) => {
      const labels = message.labels.join(' ').trim();
      const payload = [labels, message.text].filter(Boolean).join(' ').trim();
      return `[${formatTranscriptTime(message.createdAtMs)}] ${message.sender}: ${payload}`;
    })
    .join('\n');
}
