import type { PingSegment } from '../types';
import type { TranscriptMessage, TranscriptSender } from './normalize';

/** Fan activity within this window blocks pings (legacy constant: 5 days). */
export const PING_ACTIVE_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;

/** Minimum fan text messages for segment-a (had history, went silent). */
export const PING_MIN_FAN_MESSAGES = 3;

export interface PingSegmentAnalysis {
  segment: PingSegment;
  fanTextMessageCount: number;
  latestFanTextAtMs: number | null;
  latestOverallTextSender: TranscriptSender | null;
  latestOverallTextAtMs: number | null;
}

/** Text message = non-empty text after HTML stripping (label-only messages don't count). */
function isTextMessage(message: TranscriptMessage): boolean {
  return message.text.trim().length > 0;
}

/**
 * Exact legacy algorithm (research §6.6). `messages` must be ascending
 * (normalizeTranscriptMessages output) — "latest" is the last array element.
 * Window check is inclusive: a fan text exactly PING_ACTIVE_WINDOW_MS old is active.
 */
export function analyzePingSegment(
  messages: readonly TranscriptMessage[],
  nowMs: number,
): PingSegmentAnalysis {
  const textMessages = messages.filter(isTextMessage);
  const fanTextMessages = textMessages.filter((message) => message.sender === 'Fan');
  const latestOverallText = textMessages[textMessages.length - 1] ?? null;
  const latestFanText = fanTextMessages[fanTextMessages.length - 1] ?? null;

  let segment: PingSegment = 'segment-b';
  if (latestFanText) {
    if (latestFanText.createdAtMs >= nowMs - PING_ACTIVE_WINDOW_MS) {
      segment = 'active';
    } else if (fanTextMessages.length >= PING_MIN_FAN_MESSAGES) {
      segment = 'segment-a';
    }
  }

  return {
    segment,
    fanTextMessageCount: fanTextMessages.length,
    latestFanTextAtMs: latestFanText ? latestFanText.createdAtMs : null,
    latestOverallTextSender: latestOverallText ? latestOverallText.sender : null,
    latestOverallTextAtMs: latestOverallText ? latestOverallText.createdAtMs : null,
  };
}

export function resolvePingSegment(
  messages: readonly TranscriptMessage[],
  nowMs: number,
): PingSegment {
  return analyzePingSegment(messages, nowMs).segment;
}
