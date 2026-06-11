// Pure Scan-tab logic (tested in tests/renderer-ai/): paragraph splitting for
// the Russian dossier body and the quiet staleness hint.

/** Blank-line separated paragraphs; single newlines stay inside a paragraph. */
export function splitSummaryParagraphs(body: string): string[] {
  return body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

/**
 * Quiet stale hint: messages arrived after the scan was generated. Client-side
 * heuristic only — the authoritative cache invalidation (personality/model/
 * data-verified, SPEC §8.5) lives in main. Unparseable dates = not stale.
 */
export function isScanStale(generatedAtIso: string, newestMessageAtIso: string | null): boolean {
  if (newestMessageAtIso === null) return false;
  const generatedAt = Date.parse(generatedAtIso);
  const newestAt = Date.parse(newestMessageAtIso);
  if (Number.isNaN(generatedAt) || Number.isNaN(newestAt)) return false;
  return newestAt > generatedAt;
}
