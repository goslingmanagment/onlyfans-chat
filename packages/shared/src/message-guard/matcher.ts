import { detectStructural } from './detectors';
import { isAsciiAlnum, normalizeWithMap } from './normalize';
import type {
  CompiledGuardRule,
  CompiledMessageGuardPolicy,
  GuardDecision,
  GuardSpan,
  GuardVerdict,
  TrieNode,
} from './types';

function decisionRank(decision: GuardDecision): number {
  switch (decision) {
    case 'allow':
      return 0;
    case 'warn':
      return 1;
    case 'block':
      return 2;
  }
}

function actionToDecision(action: 'allow' | 'warn' | 'block'): GuardDecision {
  return action === 'allow' ? 'allow' : action;
}

function spanForTerm(raw: string, rule: CompiledGuardRule, startUnit: number, endUnit: number, units: ReturnType<typeof normalizeWithMap>['units']): GuardSpan | null {
  const first = units[startUnit];
  const last = units[endUnit - 1];
  if (first === undefined || last === undefined) return null;
  return {
    start: first.srcStart,
    end: last.srcEnd,
    category: rule.category,
    action: rule.action,
    ruleId: rule.id,
    ruleLabel: rule.label,
    reasonKey: rule.reasonKey,
    matchedOriginal: raw.slice(first.srcStart, last.srcEnd),
    matchedNormalized: normalizeWithMap(raw.slice(first.srcStart, last.srcEnd), true).text,
  };
}

function rawBoundaryOk(raw: string, rawStart: number, rawEnd: number): boolean {
  const before = raw[rawStart - 1];
  const after = raw[rawEnd];
  const beforeFolded = before === undefined ? undefined : normalizeWithMap(before, true).text;
  const afterFolded = after === undefined ? undefined : normalizeWithMap(after, true).text;
  return (
    (beforeFolded === undefined || beforeFolded.length === 0 || !isAsciiAlnum(beforeFolded)) &&
    (afterFolded === undefined || afterFolded.length === 0 || !isAsciiAlnum(afterFolded))
  );
}

function termSpans(compiled: CompiledMessageGuardPolicy, raw: string): GuardSpan[] {
  const skeleton = normalizeWithMap(raw, true);
  const spans: GuardSpan[] = [];
  for (let start = 0; start < skeleton.text.length; start += 1) {
    let node: TrieNode | undefined = compiled.trie;
    for (let cursor = start; cursor < skeleton.text.length; cursor += 1) {
      const ch = skeleton.text[cursor];
      if (ch === undefined) break;
      node = node.children.get(ch);
      if (node === undefined) break;
      const end = cursor + 1;
      for (const output of node.outputs) {
        const span = spanForTerm(raw, output, start, end, skeleton.units);
        if (span !== null && !output.allowInsideWords && !rawBoundaryOk(raw, span.start, span.end)) {
          continue;
        }
        if (span !== null) spans.push(span);
      }
    }
  }
  return spans;
}

function whitelisted(compiled: CompiledMessageGuardPolicy, raw: string, span: GuardSpan): boolean {
  const skeleton = normalizeWithMap(raw, true);
  for (const entry of compiled.whitelist) {
    let from = 0;
    for (;;) {
      const index = skeleton.text.indexOf(entry.normalized, from);
      if (index === -1) break;
      const first = skeleton.units[index];
      const last = skeleton.units[index + entry.normalized.length - 1];
      if (first !== undefined && last !== undefined) {
        const covers = first.srcStart <= span.start && last.srcEnd >= span.end;
        const exactEntity =
          entry.kind !== 'term' &&
          normalizeWithMap(span.matchedOriginal, true).text === entry.normalized;
        if (covers || exactEntity) return true;
      }
      from = index + 1;
    }
  }
  return false;
}

function mergeSpans(spans: GuardSpan[]): GuardSpan[] {
  const sorted = [...spans].sort(
    (a, b) =>
      a.start - b.start ||
      b.end - a.end ||
      decisionRank(actionToDecision(b.action)) - decisionRank(actionToDecision(a.action)),
  );
  const out: GuardSpan[] = [];
  for (const span of sorted) {
    const prev = out[out.length - 1];
    if (prev === undefined || span.start >= prev.end) {
      out.push(span);
      continue;
    }
    const prevRank = decisionRank(actionToDecision(prev.action));
    const rank = decisionRank(actionToDecision(span.action));
    if (rank > prevRank || (rank === prevRank && span.end > prev.end)) {
      out[out.length - 1] = {
        ...span,
        start: Math.min(prev.start, span.start),
        end: Math.max(prev.end, span.end),
        matchedOriginal: span.matchedOriginal.length >= prev.matchedOriginal.length
          ? span.matchedOriginal
          : prev.matchedOriginal,
        matchedNormalized: span.matchedNormalized.length >= prev.matchedNormalized.length
          ? span.matchedNormalized
          : prev.matchedNormalized,
      };
    } else if (span.end > prev.end) {
      out[out.length - 1] = {
        ...prev,
        end: span.end,
        matchedOriginal: prev.matchedOriginal.length >= span.matchedOriginal.length
          ? prev.matchedOriginal
          : span.matchedOriginal,
        matchedNormalized: prev.matchedNormalized.length >= span.matchedNormalized.length
          ? prev.matchedNormalized
          : span.matchedNormalized,
      };
    }
  }
  return out;
}

export function scanText(compiled: CompiledMessageGuardPolicy, raw: string): GuardVerdict {
  const candidates = [
    ...detectStructural(raw, compiled.policy),
    ...termSpans(compiled, raw),
  ].filter((span) => span.end > span.start && span.action !== 'allow');
  const surviving = mergeSpans(candidates.filter((span) => !whitelisted(compiled, raw, span)));
  let decision: GuardDecision = 'allow';
  for (const span of surviving) {
    const spanDecision = actionToDecision(span.action);
    if (decisionRank(spanDecision) > decisionRank(decision)) decision = spanDecision;
  }
  return {
    decision,
    spans: surviving,
    policyVersion: compiled.policy.version,
    builtInVersion: compiled.policy.builtInVersion,
  };
}
