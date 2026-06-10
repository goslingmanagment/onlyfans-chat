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

function stripThinkBlocks(text: string): string {
  return text
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:think|thinking|reasoning|chain-of-thought)[^\n]*\n[\s\S]*?```/gi, '');
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
  return stripWrappingQuotes(stripReplyPrefix(removeMetaLeakLines(stripThinkBlocks(part))));
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
