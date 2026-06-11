// OFAPI account → core page-label mapping (SPEC §8.5). Pure helper; the
// manual override lives upstream in settings.
//
// SPEC rule (legacy rule re-targeted to OnlyFans): platform === 'onlyfans' +
// normalized-username equality, exactly one match required — zero or multiple
// matches → null, never guess.
//
// Identifying fields: the live 2026-06-11 contract check only guarantees
// {id, label, platform, modelSlug, modelName} on GET /api/v1/pages; `username`
// is in core's OpenAPI but nullable (core's OnlyFans data is thin). Heuristic:
// compare the account username against page fields in strength order —
// username, then modelSlug, then label — and stop at the strongest tier that
// has any match. Ambiguity inside that tier returns null rather than falling
// through to a weaker field. modelName/displayName are display strings, not
// handles, and never participate.

export interface PageMatchCandidate {
  label: string;
  platform: string;
  modelSlug?: string | null | undefined;
  username?: string | null | undefined;
}

export interface AccountMatchCandidate {
  /** OFAPI account id (`acct_…`); only echoed back as the map key. */
  id: string;
  /** OnlyFans username of the connected account. */
  username: string;
}

/** Legacy normalization rule: trim, strip leading '@'s, lowercase. Empty → null. */
export function normalizeHubUsername(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/^@+/, '').toLowerCase() ?? '';
  return normalized || null;
}

const MATCH_TIERS: ReadonlyArray<(page: PageMatchCandidate) => string | null | undefined> = [
  (page) => page.username,
  (page) => page.modelSlug,
  (page) => page.label,
];

/** Resolves the core page label for one OnlyFans username, or null (no/ambiguous match). */
export function matchPageLabelForUsername(
  username: string,
  pages: readonly PageMatchCandidate[],
): string | null {
  const target = normalizeHubUsername(username);
  if (target === null) {
    return null;
  }
  const onlyfansPages = pages.filter((page) => page.platform === 'onlyfans');

  for (const pick of MATCH_TIERS) {
    const labels = new Set<string>();
    for (const page of onlyfansPages) {
      if (normalizeHubUsername(pick(page)) === target) {
        labels.add(page.label);
      }
    }
    if (labels.size === 1) {
      const [label] = labels;
      return label ?? null;
    }
    if (labels.size > 1) {
      return null;
    }
  }
  return null;
}

/** Maps each OFAPI account id to its matched core page label, or null per account. */
export function matchAccountToPage(
  accounts: readonly AccountMatchCandidate[],
  pages: readonly PageMatchCandidate[],
): Map<string, string | null> {
  const result = new Map<string, string | null>();
  for (const account of accounts) {
    result.set(account.id, matchPageLabelForUsername(account.username, pages));
  }
  return result;
}
