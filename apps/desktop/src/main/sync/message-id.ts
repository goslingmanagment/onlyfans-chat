/**
 * OF message ids are decimal integers in production, but fixtures and legacy
 * rows can contain opaque strings. Keep one deterministic ordering rule for
 * every sync path that must break an equal-timestamp tie.
 */
export function compareMessageIds(a: string, b: string): number {
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    const left = BigInt(a);
    const right = BigInt(b);
    return left < right ? -1 : left > right ? 1 : 0;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}
