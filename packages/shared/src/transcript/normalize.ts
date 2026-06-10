import type { PpvState } from '../types';
import { htmlToPlainText } from './html';
import type { OfapiChatMessage } from './ofapi-message';

export type TranscriptSender = 'Model' | 'Fan';

/** Legacy-shaped normalized transcript line input; createdAtMs is unix milliseconds (UTC). */
export interface TranscriptMessage {
  id: number;
  createdAtMs: number;
  sender: TranscriptSender;
  text: string;
  labels: string[];
}

export interface NormalizeTranscriptOptions {
  /**
   * Tip amounts in dollars keyed by message id — SPEC §8.2 ladder step 2
   * (caller joins `/transactions` type=tips). Step 1 is `tipAmount` on the
   * message itself; step 3 is a bare '[Tip]'. Amounts are never fabricated.
   */
  tipAmountsByMessageId?: ReadonlyMap<number, number>;
}

const SINGLE_MEDIA_LABELS: Record<string, string> = {
  photo: 'Photo',
  video: 'Video',
  audio: 'Audio',
  gif: 'GIF',
};

function usd(amount: number): string {
  return amount.toFixed(2);
}

function pluralCount(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

/**
 * SPEC §8.2: PPV state read directly off the message. Only the model's own
 * sent messages carry meaningful `isOpened` purchase semantics; anything else
 * stays 'unknown' — never claim purchase state without evidence.
 */
function ppvStateOf(message: OfapiChatMessage): PpvState {
  if (!message.isSentByMe) {
    return 'unknown';
  }
  if (message.isOpened === true) {
    return 'purchased';
  }
  if (message.isOpened === false) {
    return 'not purchased';
  }
  return 'unknown';
}

function ppvSuffix(message: OfapiChatMessage): string {
  const price = message.price ?? 0;
  if (price <= 0) {
    return '';
  }
  return ` — PPV $${usd(price)}, ${ppvStateOf(message)}`;
}

/** Inner media label without brackets/PPV, or null when the message carries no media. */
function mediaLabelBody(message: OfapiChatMessage): string | null {
  const media = message.media ?? [];
  const total = Math.max(media.length, message.mediaCount ?? 0);
  if (total === 0) {
    return null;
  }
  if (total === 1) {
    const item = media[0];
    if (!item) {
      return 'Media';
    }
    return SINGLE_MEDIA_LABELS[item.type ?? ''] ?? 'Media';
  }
  let photos = 0;
  let videos = 0;
  for (const item of media) {
    if (item.type === 'photo') {
      photos += 1;
    } else if (item.type === 'video') {
      videos += 1;
    }
  }
  const parts: string[] = [];
  if (photos > 0) {
    parts.push(pluralCount(photos, 'Photo'));
  }
  if (videos > 0) {
    parts.push(pluralCount(videos, 'Video'));
  }
  return parts.length > 0 ? `Media Bundle: ${parts.join(', ')}` : 'Media Bundle';
}

function resolveTipAmount(
  message: OfapiChatMessage,
  options: NormalizeTranscriptOptions,
): number | null {
  if (typeof message.tipAmount === 'number' && message.tipAmount > 0) {
    return message.tipAmount;
  }
  const joined = options.tipAmountsByMessageId?.get(message.id);
  if (typeof joined === 'number' && joined > 0) {
    return joined;
  }
  return null;
}

function buildLabels(message: OfapiChatMessage, options: NormalizeTranscriptOptions): string[] {
  const labels: string[] = [];
  const body = mediaLabelBody(message);
  const price = message.price ?? 0;

  if (body !== null) {
    labels.push(`[${body}${ppvSuffix(message)}]`);
  } else if (price > 0) {
    // Paid message without resolvable media (e.g. locked text): state still applies.
    labels.push(`[PPV $${usd(price)}, ${ppvStateOf(message)}]`);
  }

  if (body === null && message.giphyId !== null && message.giphyId !== undefined) {
    labels.push('[GIF]');
  }

  if (message.isTip === true) {
    const amount = resolveTipAmount(message, options);
    labels.push(amount !== null ? `[Tip: $${usd(amount)}]` : '[Tip]');
  }

  return labels;
}

/**
 * OFAPI messages (any page order, duplicates allowed) → ascending transcript
 * messages. Dedupe by id, first occurrence wins; sort ascending by createdAt,
 * tiebreak ascending by id.
 */
export function normalizeTranscriptMessages(
  messages: readonly OfapiChatMessage[],
  options: NormalizeTranscriptOptions = {},
): TranscriptMessage[] {
  const byId = new Map<number, TranscriptMessage>();
  for (const message of messages) {
    if (byId.has(message.id)) {
      continue;
    }
    byId.set(message.id, {
      id: message.id,
      createdAtMs: Date.parse(message.createdAt),
      sender: message.isSentByMe ? 'Model' : 'Fan',
      text: htmlToPlainText(message.text ?? ''),
      labels: buildLabels(message, options),
    });
  }
  return [...byId.values()].sort(
    (left, right) => left.createdAtMs - right.createdAtMs || left.id - right.id,
  );
}

/** OFAPI list-messages page size (legacy Fansly was 25/page). */
export const OFAPI_MESSAGES_PAGE_SIZE = 100;

/** Earnings-window fallback when the conversation is empty (legacy constant). */
export const TRANSCRIPT_EMPTY_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

export function estimateTargetPages(requestedCount: number): number {
  return Math.max(1, Math.ceil(requestedCount / OFAPI_MESSAGES_PAGE_SIZE));
}

/** Pages arrive newest-first; the oldest id on a page is the `id` cursor for the next page. */
export function extractOldestMessageId(pageMessages: readonly OfapiChatMessage[]): number | null {
  const last = pageMessages[pageMessages.length - 1];
  return last ? last.id : null;
}

/** Start of the window covered by an ascending transcript; 90 days back when empty. */
export function transcriptWindowStartMs(
  messages: readonly TranscriptMessage[],
  nowMs: number,
): number {
  const first = messages[0];
  return first ? first.createdAtMs : nowMs - TRANSCRIPT_EMPTY_WINDOW_MS;
}
