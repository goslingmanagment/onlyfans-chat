// usage_events payload → core wire event (SPEC §8.6). The coordinator
// persists raw LLM-metric field names (cacheCreationInputTokens…,
// src/main/ai/coordinator.ts recordUsageEvent); core's closed feature enum and
// wire field names live in @chatgoose/shared/hub. Local-only acceptance
// metadata (accepted/acceptedPart, json_set by cmd:ai.feedback) is dropped
// here — unknown fields never go upstream.

import { z } from 'zod';
import { HUB_USAGE_FEATURES, hubUsageEventSchema } from '@chatgoose/shared/hub/index';
import type { HubUsageEvent } from '@chatgoose/shared/hub/index';

// 'compare' is reportable but has no core enum entry — each card reports as
// 'fast-reply' (PLAN P4 decision, mirrored by the shared reporter's enqueue).
const REPORTABLE_FEATURES = [...HUB_USAGE_FEATURES, 'compare'] as const;

const tokenCount = z.number().int().min(0);

/**
 * Shape recordUsageEvent writes. `chatId` is absent on rows persisted before
 * the hub wiring landed — those report without a conversationId. Unknown keys
 * (totalTokens, accepted, acceptedPart, quarantined) are intentionally not
 * modeled: z.object strips them.
 */
export const usageEventPayloadSchema = z.object({
  clientEventId: z.string().min(1),
  feature: z.enum(REPORTABLE_FEATURES),
  model: z.string().min(1),
  inputTokens: tokenCount,
  cacheCreationInputTokens: tokenCount,
  cacheReadInputTokens: tokenCount,
  outputTokens: tokenCount,
  durationMs: z.number().int().min(0),
  isCacheHit: z.boolean(),
  isRegeneration: z.boolean(),
  completedAt: z.string().min(1),
  chatId: z.string().min(1).optional(),
});

/**
 * HubUsageEvent narrowed for exactOptionalPropertyTypes call sites: optional
 * fields are present-or-absent, never null — assignable to both the wire type
 * and the reporter's UsageReporterEventInput.
 */
export type MappedHubUsageEvent = Omit<HubUsageEvent, 'conversationId' | 'durationMs'> & {
  conversationId?: string;
  durationMs?: number;
};

/**
 * Null on any payload that does not satisfy the persisted shape or the wire
 * contract — a malformed row must never reach the wire (core 400s the whole
 * batch on one bad event; SPEC §8.6).
 */
export function mapUsagePayloadToHubEvent(value: unknown): MappedHubUsageEvent | null {
  const payload = usageEventPayloadSchema.safeParse(value);
  if (!payload.success) {
    return null;
  }
  const raw = payload.data;
  const candidate: MappedHubUsageEvent = {
    clientEventId: raw.clientEventId,
    feature: raw.feature === 'compare' ? 'fast-reply' : raw.feature,
    model: raw.model,
    inputTokens: raw.inputTokens,
    outputTokens: raw.outputTokens,
    cacheWriteTokens: raw.cacheCreationInputTokens,
    cacheReadTokens: raw.cacheReadInputTokens,
    ...(raw.chatId !== undefined ? { conversationId: raw.chatId } : {}),
    durationMs: raw.durationMs,
    isCacheHit: raw.isCacheHit,
    isRegeneration: raw.isRegeneration,
    completedAt: raw.completedAt,
  };
  // Final gate against the wire schema (length caps, parseable completedAt).
  return hubUsageEventSchema.safeParse(candidate).success ? candidate : null;
}
