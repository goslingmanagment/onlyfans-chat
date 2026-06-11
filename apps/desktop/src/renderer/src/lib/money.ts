// Dollar formatting (OFAPI amounts are dollars — never mills, CLAUDE.md).

/** '$1,284' (whole dollars) or '$45.50' when cents are present. */
export function formatDollars(amount: number): string {
  const isWhole = Number.isInteger(amount);
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: isWhole ? 0 : 2,
  });
}

/** Chat-list fan-value figure (DESIGN §1): whole dollars with thousands
 *  separators — '$1,284'. Exact notation, never K-compacted; cents round. */
export function formatWholeDollars(amount: number): string {
  return Math.round(amount).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/** Ledger amount: always two decimals, leading sign: '+$25.00'. */
export function formatLedgerAmount(amount: number): string {
  const abs = Math.abs(amount).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${amount < 0 ? '-' : '+'}${abs}`;
}
