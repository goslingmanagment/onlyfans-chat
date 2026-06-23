import {
  compileGuard,
  scanText,
  type CompiledMessageGuardPolicy,
  type GuardCategory,
  type GuardSpan,
  type GuardVerdict,
  type MessageGuardPolicy,
} from '@chatgoose/shared/message-guard/index';
import { splitDraftParts } from './sendLogic';

export interface GuardSegment {
  text: string;
  start: number;
  end: number;
  span: GuardSpan | null;
}

export type RendererGuardState =
  | { kind: 'ready'; compiled: CompiledMessageGuardPolicy }
  | { kind: 'unavailable' };

let currentGuard: RendererGuardState = { kind: 'unavailable' };

export function compileRendererGuardPolicy(policy: MessageGuardPolicy | null): RendererGuardState {
  if (policy === null) {
    return { kind: 'unavailable' };
  }
  try {
    return { kind: 'ready', compiled: compileGuard(policy) };
  } catch {
    return { kind: 'unavailable' };
  }
}

export function setCurrentGuardState(state: RendererGuardState): void {
  currentGuard = state;
}

export function setCurrentGuardPolicy(policy: MessageGuardPolicy | null): RendererGuardState {
  currentGuard = compileRendererGuardPolicy(policy);
  return currentGuard;
}

export function currentRendererGuard(): RendererGuardState {
  return currentGuard;
}

export function scanWithGuard(
  guard: RendererGuardState,
  text: string,
): GuardVerdict | null {
  if (guard.kind !== 'ready') return null;
  return scanText(guard.compiled, text);
}

export function scanDraftForDisplay(
  guard: RendererGuardState,
  draft: string,
): GuardVerdict | null {
  if (draft.length === 0) return null;
  return scanWithGuard(guard, draft);
}

export function scanDraftPartsForSend(draft: string): 'allow' | 'block' | 'unavailable' {
  if (currentGuard.kind !== 'ready') return 'unavailable';
  const parts = splitDraftParts(draft);
  for (const part of parts) {
    if (scanText(currentGuard.compiled, part).decision === 'block') {
      return 'block';
    }
  }
  return 'allow';
}

export function scanTextForSend(text: string): 'allow' | 'block' | 'unavailable' {
  if (currentGuard.kind !== 'ready') return 'unavailable';
  if (text.trim().length === 0) return 'allow';
  return scanText(currentGuard.compiled, text).decision === 'block' ? 'block' : 'allow';
}

export function verdictBlocks(verdict: GuardVerdict | null): boolean {
  return verdict?.decision === 'block';
}

export function verdictCategories(verdict: GuardVerdict | null): GuardCategory[] {
  if (verdict === null) return [];
  return [...new Set(verdict.spans.map((span) => span.category))];
}

export function verdictToSegments(text: string, verdict: GuardVerdict | null): GuardSegment[] {
  const spans = [...(verdict?.spans ?? [])]
    .filter((span) => span.end > span.start)
    .sort((a, b) => a.start - b.start || b.end - a.end);
  if (spans.length === 0) return [{ text, start: 0, end: text.length, span: null }];
  const segments: GuardSegment[] = [];
  let pos = 0;
  for (const span of spans) {
    const start = Math.max(0, Math.min(text.length, span.start));
    const end = Math.max(start, Math.min(text.length, span.end));
    if (start > pos) segments.push({ text: text.slice(pos, start), start: pos, end: start, span: null });
    if (end > pos) segments.push({ text: text.slice(start, end), start, end, span });
    pos = Math.max(pos, end);
  }
  if (pos < text.length) segments.push({ text: text.slice(pos), start: pos, end: text.length, span: null });
  return segments;
}
