// Golden reference-output generator (PLAN P2 quick features; PLAN P4 gate:
// "golden transcript fixtures → outputs reviewed against the AI-slop taxonomy",
// review rubric: docs/reviews/ai-slop-rubric.md). Generation is NOT a regular
// test: it runs only with GOLDEN_GEN=1 and an ANTHROPIC_API_KEY, costs real LLM
// calls, and writes tests/fixtures/golden/<case>/reference-<feature>.md for
// human review. Committed reference files are reviewed artifacts — generation
// SKIPS any case whose reference already exists unless UPDATE_GOLDEN=1
// (P2 gate: the owner reviewed the quick-feature outputs; never clobber them).
//
// Runs through the app's own pipeline: golden fixture → shared transcript
// normalizer (tipText substitution as in the context loader) → shared
// formatters (same construction the locked context-blocks.txt artifacts use)
// → shared buildPrompt (deep analysis prompts, earnings blocks per
// FEATURE_POLICIES, ping segment instructions, hi fan bio) → the real provider
// streaming client (per-feature default model/reasoning, shared max_tokens/
// temperature tuning) → shared sanitizer/split/xml via buildFeatureResult.
// Reproducible against the committed fixtures: the ping "now" is derived from
// the fixture's own last fan-message timestamp — never the wall clock.
//
//   GOLDEN_GEN=1 ANTHROPIC_API_KEY=… npx vitest run tests/golden-gen
//
// The structural-check describe at the bottom always runs (CI, no env flag):
// it validates COMMITTED reference outputs where they exist and skips cleanly
// where they don't.
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  analyzePingSegment,
  formatTranscript,
  normalizeTranscriptMessages,
  ofapiChatMessageSchema,
  PING_ACTIVE_WINDOW_MS,
  PING_MIN_FAN_MESSAGES,
  type OfapiChatMessage,
  type TranscriptMessage,
} from '@chatgoose/shared/transcript/index';
import { formatFanSpendingData } from '@chatgoose/shared/context/spending';
import { formatFanSubscriptionData } from '@chatgoose/shared/context/subscription';
import { buildPrompt } from '@chatgoose/shared/prompts/builder';
import { createBundledPersonalities } from '@chatgoose/shared/prompts/personalities';
import {
  DEFAULT_FEATURE_MODELS,
  DEFAULT_FEATURE_REASONING,
  FEATURE_TEMPERATURES,
  HI_GREETING_MAX_TRANSCRIPT,
} from '@chatgoose/shared/constants';
import {
  getFeaturePolicy,
  resolveFeatureModelFeature,
  type OperationFeature,
} from '@chatgoose/shared/features';
import { resolveAnthropicRequestTuning } from '@chatgoose/shared/llm/capabilities';
import { getProviderModelId } from '@chatgoose/shared/llm/model-registry';
import { parseChatReviewXml, parseHelpMeXml } from '@chatgoose/shared/output/xml';
import type { PingSegment, ReplyTone } from '@chatgoose/shared/types';
import { streamAnthropic } from '../../src/main/ai/providers/anthropic';
import { buildFeatureResult } from '../../src/main/ai/index';

const goldenRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../tests/fixtures/golden');
const NOW = Date.parse('2026-06-10T12:00:00Z'); // matches golden-context.test.ts
const ALL_CASES = ['rich-spender', 'tipper', 'short-convo'] as const;
const CYRILLIC_RE = /[Ѐ-ӿ]/;

const apiKey = process.env['ANTHROPIC_API_KEY'];
const enabled = process.env['GOLDEN_GEN'] === '1' && Boolean(apiKey);
const updateGolden = process.env['UPDATE_GOLDEN'] === '1';

const fixtureSchema = z.looseObject({
  messages: z.array(z.unknown()),
  fan: z.looseObject({
    id: z.number(),
    name: z.string().nullish(),
    username: z.string().nullish(),
    about: z.string().nullish(),
    subscribedOn: z.boolean().nullish(),
    subscribedOnExpiredNow: z.boolean().nullish(),
    subscribedOnData: z.looseObject({}).nullish(),
  }),
});

interface GoldenRun {
  caseName: string;
  feature: OperationFeature;
  tone?: ReplyTone;
  draftText?: string;
  /** ping only: fail loudly if fixture drift changes the derived segment. */
  expectedPingSegment?: PingSegment;
}

const RUNS: GoldenRun[] = [
  // ── quick features (P2, references reviewed by the owner) ───────────────
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
  // ── deep features (P4 prompt-regression harness) ─────────────────────────
  // fan-summary: deep analysis prompt mode, earnings blocks, Russian output,
  // per-feature default model (anthropic:claude-opus-4-6).
  { caseName: 'rich-spender', feature: 'fan-summary' },
  { caseName: 'tipper', feature: 'fan-summary' },
  { caseName: 'rich-spender', feature: 'chat-review' },
  // ping: rich-spender qualifies for segment-a under the fixture-derived now
  // (66 fan texts ≥ 3; derived now = last fan text + 5d window + 1h, which is
  // also later than every message in the fixture — no "future" context lines).
  { caseName: 'rich-spender', feature: 'ping', expectedPingSegment: 'segment-a' },
  // ping segment-b: N/A — every committed fixture has ≥11 fan text messages
  // (segment-b needs <3), and synthesizing a transcript would break the
  // "anonymized live transcript" provenance of this fixture set.
  // hi-greeting: N/A — the shortest fixture (short-convo) has 25 messages,
  // above the ≤10 gate (HI_GREETING_MAX_TRANSCRIPT → CG-FLOW-09 in the app).
  // Both N/A facts stay executable in the structural describe below; they need
  // a new thin anonymized live fixture to flip (PLAN P4 follow-up).
];

interface LoadedCase {
  fixture: z.infer<typeof fixtureSchema>;
  /** Normalized ascending transcript messages (tip text substituted). */
  messages: TranscriptMessage[];
}

function loadCase(caseName: string): LoadedCase {
  const raw: unknown = JSON.parse(readFileSync(join(goldenRoot, caseName, 'input.json'), 'utf8'));
  const fixture = fixtureSchema.parse(raw);
  const parsed = fixture.messages.map((m) => ofapiChatMessageSchema.parse(m));
  // Context-loader rule (SPEC §8.2): on tip messages the platform boilerplate
  // `text` is replaced by the fan's tipText.
  const withTips: OfapiChatMessage[] = parsed.map((message) => {
    const tipText = (message as Record<string, unknown>)['tipText'];
    return message.isTip && typeof tipText === 'string'
      ? { ...message, text: tipText }
      : message;
  });
  return { fixture, messages: normalizeTranscriptMessages(withTips) };
}

/** Context blocks at a given clock (subscription phrasing depends on `nowMs`). */
function buildContext(loaded: LoadedCase, nowMs: number) {
  const { fixture, messages } = loaded;
  const transcript = formatTranscript(messages);
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
    nowMs,
  );
  const fanDisplayName = fixture.fan.name ?? fixture.fan.username ?? String(fixture.fan.id);
  const fanBio = fixture.fan.about?.trim() || undefined;
  return { transcript, spending, subscription, fanDisplayName, fanBio };
}

/** 1h past the inclusive 5-day boundary: clearly "gone quiet", still deterministic. */
const PING_NOW_MARGIN_MS = 60 * 60 * 1000;

/**
 * Ping "now" derived from the FIXTURE's own last fan text (+ active window
 * + margin) so the reference output is reproducible. The probe `nowMs` only
 * positions the activity window; the timestamps it reports are independent.
 */
function derivePingNowMs(messages: readonly TranscriptMessage[]): number {
  const probe = analyzePingSegment(messages, Number.MAX_SAFE_INTEGER);
  const anchorMs = probe.latestFanTextAtMs ?? probe.latestOverallTextAtMs ?? NOW;
  return anchorMs + PING_ACTIVE_WINDOW_MS + PING_NOW_MARGIN_MS;
}

function refPath(run: GoldenRun): string {
  return join(goldenRoot, run.caseName, `reference-${run.feature}.md`);
}

/** Owner-review checklist per output class; full rubric: docs/reviews/ai-slop-rubric.md. */
function reviewChecklist(feature: OperationFeature): string[] {
  switch (feature) {
    case 'fan-summary':
      return [
        '- [ ] Russian throughout — no English sentences/paragraphs (loan terms ok)',
        '- [ ] only facts present in the transcript/context blocks — nothing invented',
        '- [ ] empty sections skipped (no "unknown" / "нет данных" filler)',
        '- [ ] financial classification consistent with the spending/subscription blocks',
        '- [ ] plain text with simple headers — no markdown tables, no emoji decoration',
      ];
    case 'chat-review':
      return [
        '- [ ] bare integer rating 1–10, severity consistent with the evaluation text',
        '- [ ] second person to the chatter; cites specific transcript moments (no invented quotes)',
        '- [ ] recommendations are concrete actions, not generic coaching filler',
        '- [ ] nothing outside the <rating>/<evaluation>/<recommendations> tags',
        '- [ ] no PPV/price claims that contradict the transcript labels or spending block',
      ];
    case 'help-me':
      return [
        '- [ ] coaching is specific to this transcript; cites actual moments (no invented quotes)',
        '- [ ] suggestions are fan-ready, in the model voice, with zero coaching bleed',
        '- [ ] suggestions pass the reply-draft rubric (short, no banned formulas, no therapy-speak)',
        '- [ ] nothing outside the <coaching>/<engaging>/<flirty> tags',
      ];
    case 'ping':
      return [
        '- [ ] reads as a personal text, not a blast — specificity over "thinking of you"',
        '- [ ] no banned filler ("just been thinking about you", "you crossed my mind", "hope X gets better")',
        '- [ ] no salesy pivot; energy matches the relationship (no over-escalation)',
        '- [ ] no absolute claims about conversation history; follows the segment strategy',
        '- [ ] in-character (Lora voice: lowercase, short bursts)',
      ];
    case 'hi-greeting':
      return [
        '- [ ] exactly 3 distinct variants, each a different approach',
        '- [ ] addresses the fan via a username-derived name where usable; no "thanks for following"',
        '- [ ] short, personality-forward, with a hook the fan can answer',
        '- [ ] in-character (Lora voice: lowercase, short bursts)',
      ];
    case 'fast-reply':
    case 'improve-draft':
      return [
        '- [ ] short, reaction-first, no recap/therapy-speak',
        '- [ ] no banned formulas ("not gonna lie", "hits different", validate→elaborate→question)',
        '- [ ] respects PPV state from transcript labels',
        '- [ ] in-character (Lora voice: lowercase, short bursts)',
      ];
  }
}

/** Fails generation before writing a reference the app could never surface. */
function assertGeneratedResult(
  feature: OperationFeature,
  result: ReturnType<typeof buildFeatureResult>,
  raw: string,
): void {
  if (feature === 'hi-greeting') {
    if (!Array.isArray(result.parts) || result.parts.length !== 3) {
      throw new Error(
        `hi-greeting must produce exactly 3 [VARIANT] parts, got ${result.parts?.length ?? 0}`,
      );
    }
  }
  if (feature === 'fan-summary') {
    const body = result.parts?.[0] ?? '';
    if (body.trim() === '' || !CYRILLIC_RE.test(body)) {
      throw new Error('fan-summary reference must be a non-empty Russian (Cyrillic) document');
    }
  }
  if (feature === 'chat-review' && !parseChatReviewXml(raw).valid) {
    throw new Error('chat-review reference failed parseChatReviewXml — regenerate');
  }
  if (feature === 'help-me' && !parseHelpMeXml(raw).valid) {
    throw new Error('help-me reference failed parseHelpMeXml — regenerate');
  }
}

/**
 * Everything up to (but excluding) the network call: model/param resolution,
 * fixture gates, derived ping clock, context blocks, prompt build. Split out
 * so CI can verify the wiring without GOLDEN_GEN (and without spending tokens).
 */
function prepareRun(run: GoldenRun) {
  const policy = getFeaturePolicy(run.feature);
  const modelFeature = resolveFeatureModelFeature(run.feature);
  const modelId = DEFAULT_FEATURE_MODELS[modelFeature];
  const providerModelId = getProviderModelId(modelId);
  const reasoningEffort = DEFAULT_FEATURE_REASONING[modelFeature];
  const temperature = FEATURE_TEMPERATURES[run.feature];
  // Same shared tuning the provider client applies (max_tokens cap, thinking vs
  // temperature exclusivity) — recorded in the header for the reviewer.
  const tuning = resolveAnthropicRequestTuning(
    providerModelId,
    run.feature,
    temperature,
    reasoningEffort,
  );

  const loaded = loadCase(run.caseName);

  // Production gates mirrored (coordinator parity) so a fixture swap fails
  // loudly instead of generating a reference the app could never produce.
  if (policy.minMessages > 0 && loaded.messages.length < policy.minMessages) {
    throw new Error(
      `${run.caseName}: ${loaded.messages.length} messages < ${policy.minMessages} required for ${run.feature} (CG-FLOW-03)`,
    );
  }
  if (run.feature === 'hi-greeting' && loaded.messages.length > HI_GREETING_MAX_TRANSCRIPT) {
    throw new Error(
      `${run.caseName}: ${loaded.messages.length} messages > ${HI_GREETING_MAX_TRANSCRIPT} — hi-greeting locked (CG-FLOW-09)`,
    );
  }

  // Reproducibility: ping derives "now" from fixture timestamps, never wall-clock.
  const nowMs = run.feature === 'ping' ? derivePingNowMs(loaded.messages) : NOW;

  let pingSegment: PingSegment | undefined;
  if (policy.usesPingSegment) {
    const analysis = analyzePingSegment(loaded.messages, nowMs);
    if (analysis.segment === 'active') {
      throw new Error('ping blocked: fan still active under derived now (CG-FLOW-05)');
    }
    if (run.expectedPingSegment !== undefined && analysis.segment !== run.expectedPingSegment) {
      throw new Error(
        `${run.caseName}: derived ping segment ${analysis.segment} != expected ${run.expectedPingSegment}`,
      );
    }
    pingSegment = analysis.segment;
  }

  const context = buildContext(loaded, nowMs);
  const personality = createBundledPersonalities(0)[0];
  if (!personality) {
    throw new Error('bundled Lora personality missing');
  }
  const prompt = buildPrompt({
    feature: run.feature,
    personality,
    transcript: context.transcript,
    // Earnings blocks follow FEATURE_POLICIES (hi-greeting: none).
    fanSpendingData: policy.includesEarnings ? context.spending : '',
    fanSubscriptionData: policy.includesEarnings ? context.subscription : '',
    fanDisplayName: context.fanDisplayName,
    ...(run.feature === 'hi-greeting' && context.fanBio !== undefined
      ? { fanBio: context.fanBio }
      : {}),
    ...(run.draftText !== undefined ? { draftText: run.draftText } : {}),
    ...(run.tone !== undefined ? { replyTone: run.tone } : {}),
    ...(pingSegment !== undefined ? { pingSegment } : {}),
  });
  const promptSha = createHash('sha256')
    .update(prompt.system)
    .update(' ')
    .update(prompt.user)
    .digest('hex')
    .slice(0, 16);

  return {
    modelId,
    providerModelId,
    reasoningEffort,
    temperature,
    tuning,
    nowMs,
    pingSegment,
    prompt,
    promptSha,
  };
}

async function generate(run: GoldenRun): Promise<string> {
  const {
    modelId,
    providerModelId,
    reasoningEffort,
    temperature,
    tuning,
    nowMs,
    pingSegment,
    prompt,
    promptSha,
  } = prepareRun(run);

  let raw = '';
  await streamAnthropic(
    {
      feature: run.feature,
      modelId,
      systemBlocks: prompt.systemBlocks,
      userBlocks: prompt.userBlocks,
      temperature,
      reasoningEffort,
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
  assertGeneratedResult(run.feature, result, raw);

  const lines: string[] = [
    `# Golden reference — ${run.feature} / ${run.caseName}`,
    '',
    `- model: ${providerModelId} · reasoning: ${reasoningEffort}${tuning.thinking ? ' (adaptive)' : ''} · tone: ${run.tone ?? 'n/a'}`,
    `- params: temperature ${temperature}${tuning.temperature === undefined ? ' (table value; not sent — adaptive thinking active)' : ''} · max_tokens ${tuning.maxTokens} · prompt sha256:${promptSha}`,
    `- generated: ${new Date().toISOString()} · personality: builtin:lora`,
    run.draftText ? `- draft (RU, chatter-written): ${run.draftText}` : '',
    pingSegment
      ? `- ping: ${pingSegment} · now ${new Date(nowMs).toISOString()} (derived: fixture last fan text + 5d window + 1h)`
      : '',
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
  if (Array.isArray(result.parts)) {
    result.parts.forEach((part: string, index: number) => {
      lines.push(`### Part ${index + 1}`, '', '```', part, '```', '');
    });
  }
  if ('xml' in result && result.xml) {
    lines.push('### Parsed XML', '', '```json', JSON.stringify(result.xml, null, 2), '```', '');
  }
  lines.push(
    '## Review (anti-AI-slop rubric — docs/reviews/ai-slop-rubric.md)',
    '',
    ...reviewChecklist(run.feature),
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
    // Committed references are owner-reviewed artifacts (P2 gate) — never
    // silently regenerate them; UPDATE_GOLDEN=1 is the conscious override.
    const frozen = existsSync(refPath(run)) && !updateGolden;
    const timeout = getFeaturePolicy(run.feature).timeoutBucket === 'deep' ? 360_000 : 120_000;
    it.skipIf(frozen)(`${run.feature} / ${run.caseName}`, { timeout }, async () => {
      const out = await generate(run);
      const path = refPath(run);
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

// ─── Structural checks (always on; CI guards over COMMITTED references) ────
//
// Cheap invariants over the committed reference-*.md artifacts: each must
// still parse through the exact shared post-processing the app uses. A test
// skips cleanly while its reference has not been generated/committed yet.

const RAW_START = '## Raw model output\n```\n';
const RAW_END = '\n```\n## Sanitized result';

function extractRawOutput(md: string): string {
  const start = md.indexOf(RAW_START);
  const end = md.indexOf(RAW_END);
  if (start < 0 || end <= start) {
    throw new Error('reference file is missing the "Raw model output" section');
  }
  return md.slice(start + RAW_START.length, end);
}

function countSanitizedParts(md: string): number {
  return md.match(/^### Part \d+$/gm)?.length ?? 0;
}

describe('golden reference structural checks (committed outputs, no GOLDEN_GEN)', () => {
  for (const run of RUNS) {
    const path = refPath(run);
    it.skipIf(!existsSync(path))(
      `${run.feature} / ${run.caseName}: committed reference is structurally sound`,
      () => {
        const md = readFileSync(path, 'utf8');
        const raw = extractRawOutput(md);
        expect(raw.trim().length).toBeGreaterThan(0);
        switch (run.feature) {
          case 'hi-greeting':
            // Exactly 3 greeting variants survive the sanitizer (template contract).
            expect(countSanitizedParts(md)).toBe(3);
            break;
          case 'fan-summary':
            // Non-empty single document, in Russian.
            expect(countSanitizedParts(md)).toBe(1);
            expect(CYRILLIC_RE.test(raw)).toBe(true);
            break;
          case 'chat-review': {
            const parsed = parseChatReviewXml(raw);
            expect(parsed.valid).toBe(true);
            expect(parsed.rating).not.toBeNull();
            break;
          }
          case 'help-me':
            expect(parseHelpMeXml(raw).valid).toBe(true);
            break;
          case 'improve-draft':
            // single-reply result kind: exactly one sanitized part.
            expect(countSanitizedParts(md)).toBe(1);
            break;
          case 'fast-reply':
          case 'ping':
            expect(countSanitizedParts(md)).toBeGreaterThanOrEqual(1);
            break;
        }
      },
    );
  }

  // Executable fixture-eligibility facts: the derived-ping-now contract and the
  // documented N/A reasons (they fail if fixture drift changes the answer).
  it('ping / rich-spender: fixture-derived now yields segment-a and postdates every message', () => {
    const { messages } = loadCase('rich-spender');
    const nowMs = derivePingNowMs(messages);
    const analysis = analyzePingSegment(messages, nowMs);
    expect(analysis.segment).toBe('segment-a');
    expect(analysis.fanTextMessageCount).toBeGreaterThanOrEqual(PING_MIN_FAN_MESSAGES);
    const newest = messages[messages.length - 1];
    expect(newest).toBeDefined();
    expect(nowMs).toBeGreaterThan(newest?.createdAtMs ?? Number.POSITIVE_INFINITY);
  });

  it('ping segment-b: N/A — no committed fixture is thin enough (needs <3 fan texts)', () => {
    for (const caseName of ALL_CASES) {
      const probe = analyzePingSegment(loadCase(caseName).messages, Number.MAX_SAFE_INTEGER);
      expect(probe.fanTextMessageCount).toBeGreaterThanOrEqual(PING_MIN_FAN_MESSAGES);
    }
  });

  it('hi-greeting: N/A — short-convo exceeds the ≤10-message gate (CG-FLOW-09)', () => {
    expect(loadCase('short-convo').messages.length).toBeGreaterThan(HI_GREETING_MAX_TRANSCRIPT);
  });

  // Pre-network wiring of the deep generation runs: validated for free in CI so
  // a GOLDEN_GEN session never spends tokens on a miswired prompt.
  it('fan-summary wiring: deep analysis prompt, earnings blocks, opus default, raised cap', () => {
    for (const caseName of ['rich-spender', 'tipper']) {
      const prep = prepareRun({ caseName, feature: 'fan-summary' });
      expect(prep.providerModelId).toBe('claude-opus-4-6');
      expect(prep.tuning.maxTokens).toBe(24000); // adaptive-thinking cap (base 8192)
      expect(prep.temperature).toBe(FEATURE_TEMPERATURES['fan-summary']);
      expect(prep.prompt.user).toContain('Write the review in Russian');
      expect(prep.prompt.user).toContain('FAN SPENDING DATA:');
      expect(prep.prompt.user).toContain('FAN SUBSCRIPTION DATA:');
    }
  });

  it('chat-review wiring: XML contract requested with earnings blocks', () => {
    const prep = prepareRun({ caseName: 'rich-spender', feature: 'chat-review' });
    expect(prep.providerModelId).toBe('claude-sonnet-4-6');
    expect(prep.temperature).toBe(FEATURE_TEMPERATURES['chat-review']);
    expect(prep.prompt.user).toContain('<rating>NUMBER</rating>');
    expect(prep.prompt.user).toContain('FAN SPENDING DATA:');
  });

  it('ping wiring: segment-a strategy injected under the fixture-derived now', () => {
    const prep = prepareRun({
      caseName: 'rich-spender',
      feature: 'ping',
      expectedPingSegment: 'segment-a',
    });
    expect(prep.pingSegment).toBe('segment-a');
    expect(prep.nowMs).toBe(derivePingNowMs(loadCase('rich-spender').messages));
    expect(prep.prompt.user).toContain('Segment A — Was active, went silent');
    expect(prep.prompt.user).toContain('FAN SPENDING DATA:');
  });
});
