// Synthesized notification sounds — no audio assets, no network (D44: eight
// tones, a volume, a message and a new-subscriber sound).

import {
  MESSAGE_SOUND_MIN_INTERVAL_MS,
  SUBSCRIBER_SOUND_MIN_INTERVAL_MS,
  scheduleTone,
  volumeToGain,
  type AudioContextLike,
  type SoundTone,
} from '@chatgoose/shared/sound/index';

export type NotificationSoundKind = 'message' | 'subscriber' | 'preview';

let ctx: AudioContext | null = null;
let lastMessageAtMs = Number.NEGATIVE_INFINITY;
let lastSubscriberAtMs = Number.NEGATIVE_INFINITY;

export function __resetBlipThrottleForTests(): void {
  lastMessageAtMs = Number.NEGATIVE_INFINITY;
  lastSubscriberAtMs = Number.NEGATIVE_INFINITY;
}

/**
 * A message answers only to the last message sound — a subscriber sound never
 * takes a message's ring. A subscriber waits out a recent message and its own
 * longer pause. A preview (the settings button) plays whenever it is pressed.
 * Returns whether a sound was started.
 */
export function playNotificationSound(
  kind: NotificationSoundKind,
  tone: SoundTone,
  volume: number,
  nowMs: number = Date.now(),
): boolean {
  if (kind === 'message' && nowMs - lastMessageAtMs < MESSAGE_SOUND_MIN_INTERVAL_MS) return false;
  if (
    kind === 'subscriber' &&
    (nowMs - lastMessageAtMs < MESSAGE_SOUND_MIN_INTERVAL_MS ||
      nowMs - lastSubscriberAtMs < SUBSCRIBER_SOUND_MIN_INTERVAL_MS)
  ) {
    return false;
  }
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    scheduleTone(ctx as unknown as AudioContextLike, tone, volumeToGain(volume));
  } catch {
    return false; // audio unavailable — stay silent
  }
  if (kind === 'message') lastMessageAtMs = nowMs;
  else if (kind === 'subscriber') lastSubscriberAtMs = nowMs;
  return true;
}
