// usage_events payload → core wire event (SPEC §8.6): field mapping incl. the
// new isCacheHit forwarding, compare→fast-reply, local-only acceptance fields
// never going upstream, and malformed payload rejection (one bad event 400s
// the whole batch at core).

import { describe, expect, it } from 'vitest';
import { HUB_USAGE_FEATURES, hubUsageEventSchema } from '@chatgoose/shared/hub/index';
import { mapUsagePayloadToHubEvent } from '@main/hub/usage-mapper';
import { rawCoordinatorPayload, FAN } from './helpers';

describe('mapUsagePayloadToHubEvent', () => {
  it('maps the coordinator payload to the wire shape', () => {
    const event = mapUsagePayloadToHubEvent(rawCoordinatorPayload());
    expect(event).toEqual({
      clientEventId: 'op-1',
      feature: 'fast-reply',
      model: 'anthropic:claude-sonnet-4-6',
      inputTokens: 1200,
      outputTokens: 250,
      cacheWriteTokens: 300,
      cacheReadTokens: 4000,
      conversationId: FAN,
      durationMs: 4200,
      isCacheHit: false,
      isRegeneration: false,
      completedAt: '2026-06-11T12:00:00.000Z',
    });
    // The result must satisfy core's wire contract verbatim.
    expect(hubUsageEventSchema.safeParse(event).success).toBe(true);
  });

  it('forwards isCacheHit (legacy cached-Scan event) and isRegeneration', () => {
    const event = mapUsagePayloadToHubEvent(
      rawCoordinatorPayload({ isCacheHit: true, isRegeneration: true }),
    );
    expect(event?.isCacheHit).toBe(true);
    expect(event?.isRegeneration).toBe(true);
  });

  it("maps 'compare' to 'fast-reply' — 'compare' never appears on the wire", () => {
    const event = mapUsagePayloadToHubEvent(rawCoordinatorPayload({ feature: 'compare' }));
    expect(event?.feature).toBe('fast-reply');
    // Exhaustive: no reportable feature maps to anything outside core's enum.
    for (const feature of [...HUB_USAGE_FEATURES, 'compare']) {
      const mapped = mapUsagePayloadToHubEvent(rawCoordinatorPayload({ feature }));
      expect(mapped).not.toBeNull();
      expect(mapped?.feature).not.toBe('compare');
      expect(HUB_USAGE_FEATURES).toContain(mapped?.feature);
    }
  });

  it('omits conversationId on pre-hub rows that carry no chatId', () => {
    const payload = rawCoordinatorPayload();
    delete payload['chatId'];
    const event = mapUsagePayloadToHubEvent(payload);
    expect(event).not.toBeNull();
    expect(event && 'conversationId' in event).toBe(false);
  });

  it('drops local-only acceptance metadata (accepted/acceptedPart) and totalTokens', () => {
    const event = mapUsagePayloadToHubEvent(
      rawCoordinatorPayload({ accepted: 1, acceptedPart: 2, quarantined: false }),
    );
    expect(event).not.toBeNull();
    const keys = Object.keys(event ?? {});
    expect(keys).not.toContain('accepted');
    expect(keys).not.toContain('acceptedPart');
    expect(keys).not.toContain('totalTokens');
    expect(keys).not.toContain('quarantined');
  });

  it('rejects malformed payloads instead of letting them poison a batch', () => {
    expect(mapUsagePayloadToHubEvent(null)).toBeNull();
    expect(mapUsagePayloadToHubEvent('not-an-object')).toBeNull();
    expect(mapUsagePayloadToHubEvent({})).toBeNull();
    expect(mapUsagePayloadToHubEvent(rawCoordinatorPayload({ model: '' }))).toBeNull();
    expect(mapUsagePayloadToHubEvent(rawCoordinatorPayload({ feature: 'scanx' }))).toBeNull();
    expect(mapUsagePayloadToHubEvent(rawCoordinatorPayload({ inputTokens: -1 }))).toBeNull();
    expect(mapUsagePayloadToHubEvent(rawCoordinatorPayload({ inputTokens: 1.5 }))).toBeNull();
    expect(mapUsagePayloadToHubEvent(rawCoordinatorPayload({ isCacheHit: 'yes' }))).toBeNull();
    expect(
      mapUsagePayloadToHubEvent(rawCoordinatorPayload({ completedAt: 'not-a-date' })),
    ).toBeNull();
  });
});
