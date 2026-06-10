// Simple subsequence fuzzy match for the ⌘K palette.

/** null = no match. Higher score = better. Empty query matches everything at 0. */
export function fuzzyScore(query: string, target: string): number | null {
  const q = query.trim().toLowerCase();
  if (q === '') return 0;
  const t = target.toLowerCase();
  let score = 0;
  let searchFrom = 0;
  let prevMatch = -2;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q.charAt(qi);
    const idx = t.indexOf(ch, searchFrom);
    if (idx === -1) return null;
    score += 1;
    if (idx === prevMatch + 1) score += 3; // consecutive run
    if (idx === 0 || ' _-@./'.includes(t.charAt(idx - 1))) score += 2; // word start
    prevMatch = idx;
    searchFrom = idx + 1;
  }
  if (t.startsWith(q)) score += 4;
  score -= Math.max(0, t.length - q.length) * 0.05; // mild length penalty
  return score;
}

export function fuzzyFilter<T>(
  items: readonly T[],
  query: string,
  text: (item: T) => string,
  limit = 20,
): T[] {
  const scored: Array<{ item: T; score: number }> = [];
  for (const item of items) {
    const score = fuzzyScore(query, text(item));
    if (score !== null) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.item);
}
