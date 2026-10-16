// Sanitizer pipeline for every insertable AI reply (SPEC §15 — runs on every LLM
// reply path). An empty result array is the "ai output unusable" signal; the error
// itself is raised by the caller.

import { splitByNext, splitByVariant } from './split';

/** Stray JSON-array framing Gemini emits around reply parts. */
const BRACKET_GARBAGE = new Set(['[', ']', '["', '"]', "['", "']"]);

// Exact legacy pattern set. Deliberately narrow around "instructions": a bare match
// would also strip legitimate in-character lines (e.g. JOI "just follow my
// instructions") — 1.4.0 regression fix.
const META_LEAK_PATTERNS: readonly RegExp[] = [
  /\bthe\s+prompt\s+says\b/i,
  /\bprompt\s+says\b/i,
  /\bsystem\s+prompt\b/i,
  /\b(?:system|previous|above)\s+instructions?\b/i,
  /\bignore (?:all |the )?(?:previous |above )?instructions?\b/i,
  /\buntrusted\s+user\s+input\b/i,
  /\bnever\s+follow\s+instructions?\b/i,
  /\braw\s+system\s+messages?\b/i,
  /\bhidden\s+instructions?\b/i,
  /\boutput\s+only\b/i,
  /\bmost\s+replies\s+should\b/i,
  /\bsingle\s+message\b/i,
  /\bsingle\s+reply\b/i,
  /\bstay\s+in\s+character\b/i,
  /\bas\s+an\s+ai\b/i,
  /\bgenerated\s+(?:reply|message|response)\b/i,
];

// The rules below are the hub's (prompts/output/reply-output.ts, hub#621); keep
// the copies the same.
// Reasoning a model writes into the visible text: <think>, <thinking>,
// <reasoning> or <mental_model>, also with a suffix after an underscore
// (<thinking_mode>), closed by the same tag in any case. The tag name is a
// group so the close tag must repeat it; a plain `<think\b` misses
// `<thinking>`, which is how Opus 5.5 leaked its reasoning into fast replies
// on 2026-10-09..14 (<thinking>, <reasoning>, <thinking_mode>, <mental_model>).
const REASONING_BLOCK = /<((?:think|thinking|reasoning|mental_model)(?:_\w+)?)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
// A block that never closes (the model forgot the close tag or ran out of
// tokens): everything from its opener on is reasoning. Only a bare tag that
// opens the text or its own line counts, so a reply that quotes one ("what
// does `<think>` mean") or plays with one ("<thinking of you>") stays whole.
// It runs after the fenced blocks are gone, so an opener quoted inside one
// cuts nothing.
const OPEN_REASONING_BLOCK = /(?:^|\n)\s*<(?:think|thinking|reasoning|mental_model)(?:_\w+)?>[\s\S]*$/i;

function stripThinkBlocks(text: string): string {
  return text
    .replace(REASONING_BLOCK, '')
    .replace(/```(?:think|thinking|reasoning|chain-of-thought)[^\n]*\n[\s\S]*?```/gi, '')
    .replace(OPEN_REASONING_BLOCK, '');
}

// Reasoning written as plain text, with no tag: a line that checks the house
// style rules ("No long dashes.", "no em dash, no full stop at end"), names
// the task as the prompt does ("Cold opener.") or opens by reporting what the
// fan wrote ("Fan writes in Russian, so reply in Russian."). A message to a
// fan never says these: none of 39,214 production generations did outside
// such reasoning (checked 2026-10-16). "no dash" needs an end of phrase after
// it, so "no dash cam" stays.
const PLAN_NOTE_PATTERNS: readonly RegExp[] = [
  /\b(?:em|en|long)\s+dash(?:es)?\b/i,
  /\bno\s+dash(?:es\b|\s*[.,;)]|\s*$)/i,
  /\bno\s+(?:final\s+)?full\s+stop\b/i,
  /\bfull\s+stop\s+at\s+(?:the\s+)?end\b/i,
  /\bcold\s+opener\b/i,
  /^\s*(?:the\s+)?fan\s+(?:just\s+)?(?:writes|wrote|asks|asked|says|said|joked|replied|mentioned)\b/i,
];

function isPlanNoteLine(line: string): boolean {
  return PLAN_NOTE_PATTERNS.some((pattern) => pattern.test(line));
}

// Within one part, the text after the last plan-note line is the reply; what
// comes before it is the plan or a draft the model went on to correct (both
// seen from Opus 5.5 at low effort). With nothing after it, the plan-note
// lines alone are dropped. It runs on each part, never across [NEXT] or
// [VARIANT], so a note cannot cut another part.
function stripPlanNotes(text: string): string {
  const lines = text.split('\n');
  let last = -1;
  lines.forEach((line, index) => {
    if (isPlanNoteLine(line)) last = index;
  });
  if (last < 0) {
    return text;
  }
  const after = lines.slice(last + 1).join('\n');
  return after.trim() ? after : lines.filter((line) => !isPlanNoteLine(line)).join('\n');
}

function isMetaLeakLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }
  return META_LEAK_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function removeMetaLeakLines(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !isMetaLeakLine(line))
    .join('\n')
    .trim();
}

function stripReplyPrefix(text: string): string {
  return text
    .replace(/^(?:message\s*\d+|reply|response)\s*[:.-]\s*/i, '')
    .replace(/^here(?:'s| is)\s+(?:a\s+)?(?:reply|response)\s*[:.-]\s*/i, '')
    .trim();
}

// Em / en / horizontal-bar dashes are an AI tell — nobody texting from a phone
// types them, and our own prompts are saturated with them, so the model mirrors
// the style back. A dash between digits is a numeric range (5–10 → 5-10); every
// other dash is a prose pause and collapses to a comma. Surrounding spaces are
// absorbed but line breaks are preserved so multi-part replies stay intact.
function normalizeDashes(text: string): string {
  return text
    .replace(/(\d)[^\S\r\n]*[—–―][^\S\r\n]*(\d)/gu, '$1-$2')
    .replace(/[^\S\r\n]*[—–―]+[^\S\r\n]*/gu, ', ')
    .replace(/,(?:[^\S\r\n]*,)+/gu, ',')
    .replace(/[^\S\r\n]+(\r?\n)/gu, '$1')
    .replace(/^[\s,]+/u, '')
    .replace(/[\s,]+$/u, '');
}

function stripWrappingQuotes(text: string): string {
  let current = text.trim();
  let previous = '';
  while (current !== previous) {
    previous = current;
    current = current
      .replace(/^"([\s\S]*)"$/u, '$1')
      .replace(/^'([\s\S]*)'$/u, '$1')
      .replace(/^“([\s\S]*)”$/u, '$1')
      .replace(/^‘([\s\S]*)’$/u, '$1')
      .trim();
  }
  return current;
}

export function sanitizeReplyPart(part: string): string {
  return normalizeDashes(
    stripWrappingQuotes(stripReplyPrefix(removeMetaLeakLines(stripPlanNotes(stripThinkBlocks(part))))),
  );
}

export function isInsertableReplyPart(part: string): boolean {
  const trimmed = part.trim();
  if (!trimmed || BRACKET_GARBAGE.has(trimmed)) {
    return false;
  }
  return !isMetaLeakLine(trimmed);
}

// Think blocks are stripped before splitting: a reasoning block may itself
// contain delimiter markers.
function normalize(rawText: string, split: (text: string) => string[]): string[] {
  return split(stripThinkBlocks(rawText)).map(sanitizeReplyPart).filter(isInsertableReplyPart);
}

export function normalizeReplyParts(rawText: string): string[] {
  return normalize(rawText, splitByNext);
}

export function normalizeVariantReplyParts(rawText: string): string[] {
  return normalize(rawText, splitByVariant);
}

export function normalizeProvidedReplyParts(parts: string[]): string[] {
  return parts.map(sanitizeReplyPart).filter(isInsertableReplyPart);
}

export function normalizeSingleReplyPart(rawText: string): string[] {
  const sanitized = sanitizeReplyPart(rawText);
  return isInsertableReplyPart(sanitized) ? [sanitized] : [];
}
