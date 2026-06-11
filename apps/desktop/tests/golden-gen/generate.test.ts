// Golden reference-output generator (PLAN P2: "minimal golden set … reviewed
// reference outputs"). NOT a regular test: runs only with GOLDEN_GEN=1 and an
// ANTHROPIC_API_KEY, costs real LLM calls, and writes
// tests/fixtures/golden/<case>/reference-<feature>.md for human review.
//
// Runs through the app's own pipeline: golden fixture → shared transcript
// normalizer (tipText substitution as in the context loader) → shared
// formatters (same construction the locked context-blocks.txt artifacts use)
// → shared buildPrompt → the real provider streaming client → shared
// sanitizer/split/xml. Reproducible against the committed fixtures.
//
//   GOLDEN_GEN=1 ANTHROPIC_API_KEY=… npx vitest run tests/golden-gen
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  normalizeTranscriptMessages,
  formatTranscript,
  ofapiChatMessageSchema,
  type OfapiChatMessage,
} from '@chatgoose/shared/transcript/index';
import { formatFanSpendingData } from '@chatgoose/shared/context/spending';
import { formatFanSubscriptionData } from '@chatgoose/shared/context/subscription';
import { buildPrompt } from '@chatgoose/shared/prompts/builder';
import { createBundledPersonalities } from '@chatgoose/shared/prompts/personalities';
import { FEATURE_TEMPERATURES } from '@chatgoose/shared/constants';
import type { FeatureType, ReplyTone } from '@chatgoose/shared/types';
import { streamAnthropic } from '../../src/main/ai/providers/anthropic';
import { buildFeatureResult } from '../../src/main/ai/index';

const goldenRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../tests/fixtures/golden');
const MODEL_ID = 'claude-sonnet-4-6'; // production default (registry: anthropic:claude-sonnet-4-6)
const NOW = Date.parse('2026-06-10T12:00:00Z'); // matches golden-context.test.ts

const apiKey = process.env['ANTHROPIC_API_KEY'];
const enabled = process.env['GOLDEN_GEN'] === '1' && Boolean(apiKey);

const fixtureSchema = z.looseObject({
  messages: z.array(z.unknown()),
  fan: z.looseObject({
    id: z.number(),
    name: z.string().nullish(),
    username: z.string().nullish(),
    subscribedOn: z.boolean().nullish(),
    subscribedOnExpiredNow: z.boolean().nullish(),
    subscribedOnData: z.looseObject({}).nullish(),
  }),
});

interface GoldenRun {
  caseName: string;
  feature: Extract<FeatureType, 'fast-reply' | 'improve-draft' | 'help-me'>;
  tone?: ReplyTone;
  draftText?: string;
}

const RUNS: GoldenRun[] = [
  { caseName: 'rich-spender', feature: 'fast-reply', tone: 'casual' },
  { caseName: 'tipper', feature: 'fast-reply', tone: 'casual' },
  { caseName: 'short-convo', feature: 'fast-reply', tone: 'casual' },
  {
    caseName: 'rich-spender',
    feature: 'improve-draft',
    draftText: 'приветик) скучала по тебе. у меня есть кое-что новенькое, хочешь покажу? только для тебя',
  },
  {
    caseName: 'short-convo',
    feature: 'improve-draft',
    draftText: 'спасибо за подписку! как у тебя дела? чем занимаешься',
  },
  { caseName: 'rich-spender', feature: 'help-me' },
  { caseName: 'tipper', feature: 'help-me' },
];

function buildContext(caseName: string) {
  const raw: unknown = JSON.parse(readFileSync(join(goldenRoot, caseName, 'input.json'), 'utf8'));
  const fixture = fixtureSchema.parse(raw);
  const messages = fixture.messages.map((m) => ofapiChatMessageSchema.parse(m));
  // Context-loader rule (SPEC §8.2): on tip messages the platform boilerplate
  // `text` is replaced by the fan's tipText.
  const withTips: OfapiChatMessage[] = messages.map((message) => {
    const tipText = (message as Record<string, unknown>)['tipText'];
    return message.isTip && typeof tipText === 'string'
      ? { ...message, text: tipText }
      : message;
  });
  const transcript = formatTranscript(normalizeTranscriptMessages(withTips));
  const spending = formatFanSpendingData({
    fanId: String(fixture.fan.id),
    sums: (fixture.fan.subscribedOnData ?? null) as never,
  });
  const subscription = formatFanSubscriptionData(
    {
      subscribedOn: fixture.fan.subscribedOn ?? null,
      subscribedOnExpiredNow: fixture.fan.subscribedOnExpiredNow ?? null,
      subscribedOnData: (fixture.fan.subscribedOnData ?? null) as never,
    },
    NOW,
  );
  const fanDisplayName = fixture.fan.name ?? fixture.fan.username ?? String(fixture.fan.id);
  return { transcript, spending, subscription, fanDisplayName };
}

async function generate(run: GoldenRun): Promise<string> {
  const context = buildContext(run.caseName);
  const personality = createBundledPersonalities(0)[0];
  if (!personality) {
    throw new Error('bundled Lora personality missing');
  }
  const prompt = buildPrompt({
    feature: run.feature,
    personality,
    transcript: context.transcript,
    fanSpendingData: context.spending,
    fanSubscriptionData: context.subscription,
    fanDisplayName: context.fanDisplayName,
    ...(run.draftText !== undefined ? { draftText: run.draftText } : {}),
    ...(run.tone !== undefined ? { replyTone: run.tone } : {}),
  });

  let raw = '';
  await streamAnthropic(
    {
      feature: run.feature,
      modelId: MODEL_ID,
      systemBlocks: prompt.systemBlocks,
      userBlocks: prompt.userBlocks,
      temperature: FEATURE_TEMPERATURES[run.feature],
      reasoningEffort: 'medium',
    },
    {
      onText: (text) => {
        raw += text;
      },
    },
    { apiKey: apiKey ?? '' },
  );

  const result = buildFeatureResult(run.feature, raw, {
    ...(run.draftText !== undefined ? { draftText: run.draftText } : {}),
  });

  const lines: string[] = [
    `# Golden reference — ${run.feature} / ${run.caseName}`,
    '',
    `- model: ${MODEL_ID} · reasoning: medium (adaptive) · tone: ${run.tone ?? 'n/a'}`,
    `- generated: ${new Date().toISOString()} · personality: builtin:lora`,
    run.draftText ? `- draft (RU, chatter-written): ${run.draftText}` : '',
    '',
    '## Raw model output',
    '',
    '```',
    raw,
    '```',
    '',
    '## Sanitized result (what the dock offers to copy)',
    '',
  ].filter((line) => line !== '');
  if ('parts' in result && Array.isArray(result.parts)) {
    result.parts.forEach((part: string, index: number) => {
      lines.push(`### Part ${index + 1}`, '', '```', part, '```', '');
    });
  }
  if ('xml' in result && result.xml) {
    lines.push('### Parsed XML', '', '```json', JSON.stringify(result.xml, null, 2), '```', '');
  }
  lines.push(
    '## Review (anti-AI-slop rubric — research doc §11.3)',
    '',
    '- [ ] short, reaction-first, no recap/therapy-speak',
    '- [ ] no banned formulas ("not gonna lie", "hits different", validate→elaborate→question)',
    '- [ ] respects PPV state from transcript labels',
    '- [ ] in-character (Lora voice: lowercase, short bursts)',
    '',
    '> NOTE: inputs are the anonymized committed fixtures — transcript text reads',
    '> "Anonymized message N", so judge structure/voice/length, not topical relevance.',
    '> True topical quality is reviewed live in the app on real conversations.',
    '',
  );
  return lines.join('\n');
}

describe.skipIf(!enabled)('golden reference output generation (GOLDEN_GEN=1)', () => {
  for (const run of RUNS) {
    it(`${run.feature} / ${run.caseName}`, { timeout: 120_000 }, async () => {
      const out = await generate(run);
      const path = join(goldenRoot, run.caseName, `reference-${run.feature}.md`);
      writeFileSync(path, out);
      expect(existsSync(path)).toBe(true);
      expect(out.length).toBeGreaterThan(200);
    });
  }
});

describe.skipIf(enabled)('golden-gen placeholder', () => {
  it('skipped — set GOLDEN_GEN=1 and ANTHROPIC_API_KEY to generate', () => {
    expect(enabled).toBe(false);
  });
});
