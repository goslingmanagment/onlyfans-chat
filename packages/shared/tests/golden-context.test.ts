// P2 gate evidence (PLAN P2 / SPEC §14): the context blocks generated from the
// golden transcript fixtures are byte-stable and follow the legacy text shapes.
// The expected files (context-blocks.txt) are committed, human-reviewed
// artifacts — any change to them must be a conscious, reviewed decision
// (invariant SPEC §15.6). Regenerate with UPDATE_GOLDEN=1.
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  normalizeTranscriptMessages,
  formatTranscript,
  ofapiChatMessageSchema,
} from '../src/transcript/index';
import { formatFanSpendingData } from '../src/context/spending';
import { formatFanSubscriptionData } from '../src/context/subscription';

const goldenRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../tests/fixtures/golden',
);

// Fixed clock so subscription "(in N days)" phrasing is deterministic.
const NOW = Date.parse('2026-06-10T12:00:00Z');

const CASES = ['rich-spender', 'tipper', 'short-convo'];

const fixtureSchema = z.looseObject({
  messages: z.array(z.unknown()),
  fan: z.looseObject({
    id: z.number(),
    subscribedOn: z.boolean().nullish(),
    subscribedOnExpiredNow: z.boolean().nullish(),
    subscribedOnData: z.looseObject({}).nullish(),
  }),
});

function buildBlocks(caseName: string): string {
  const raw = JSON.parse(readFileSync(join(goldenRoot, caseName, 'input.json'), 'utf8'));
  const fixture = fixtureSchema.parse(raw);
  const messages = fixture.messages.map((m) => ofapiChatMessageSchema.parse(m));
  const transcript = formatTranscript(normalizeTranscriptMessages(messages));
  const sums = fixture.fan.subscribedOnData ?? null;
  const spending = formatFanSpendingData({
    fanId: String(fixture.fan.id),
    sums: sums as never,
  });
  const subscription = formatFanSubscriptionData(
    {
      subscribedOn: fixture.fan.subscribedOn ?? null,
      subscribedOnExpiredNow: fixture.fan.subscribedOnExpiredNow ?? null,
      subscribedOnData: (fixture.fan.subscribedOnData ?? null) as never,
    },
    NOW,
  );
  return [
    '════ TRANSCRIPT ════',
    transcript,
    '════ FAN SPENDING DATA BLOCK ════',
    spending || '(omitted — no data)',
    '════ FAN SUBSCRIPTION DATA BLOCK ════',
    subscription || '(omitted — no data)',
    '',
  ].join('\n');
}

describe('golden context blocks (byte-stable, legacy shapes)', () => {
  for (const name of CASES) {
    it(`${name}: generated blocks byte-match the reviewed artifact`, () => {
      const blocks = buildBlocks(name);
      const expectedPath = join(goldenRoot, name, 'context-blocks.txt');
      if (!existsSync(expectedPath) || process.env['UPDATE_GOLDEN']) {
        writeFileSync(expectedPath, blocks);
      }
      expect(blocks).toBe(readFileSync(expectedPath, 'utf8'));
    });
  }

  it('transcript shapes follow the legacy line format', () => {
    const blocks = buildBlocks('tipper');
    expect(blocks).toMatch(/\[\d{2}:\d{2}\] (Model|Fan): /);
    expect(blocks).toContain('[Tip: $');
    expect(blocks).toContain('FAN SPENDING DATA:');
    expect(blocks).toContain('FAN SUBSCRIPTION DATA:');
  });
});
