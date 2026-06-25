import type { OfApiTransaction } from './schemas';

const REVERSAL_STATUSES = new Set([
  'undo',
  'reverse',
  'reversed',
  'reversal',
  'refund',
  'refunded',
  'return',
  'returned',
  'pending return',
  'pending refund',
  'chargeback',
  'charged back',
  'cancelled',
  'canceled',
  'void',
  'voided',
]);

const REVERSAL_TEXT = /\b(chargeback|refund|refunded|reversal|reversed|returned)\b/i;

function normalizeStatus(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const normalized = value.replace(/[_-]+/g, ' ').trim().toLowerCase();
  return normalized.length === 0 ? null : normalized;
}

function isReversalLike(tx: OfApiTransaction): boolean {
  const status = normalizeStatus(tx.status);
  if (status !== null && REVERSAL_STATUSES.has(status)) {
    return true;
  }
  const type = normalizeStatus(tx.type);
  if (type !== null && REVERSAL_STATUSES.has(type)) {
    return true;
  }
  return typeof tx.description === 'string' && REVERSAL_TEXT.test(tx.description);
}

/** Signed gross/net dollars for spend displays and prompt context. */
export function signedTransactionAmounts(
  tx: OfApiTransaction,
): { amount: number; net: number } | null {
  if (typeof tx.amount !== 'number' || !Number.isFinite(tx.amount) || tx.amount === 0) {
    return null;
  }
  const gross = Math.abs(tx.amount);
  const rawNet = typeof tx.net === 'number' && Number.isFinite(tx.net) ? tx.net : null;
  const reversal = tx.amount < 0 || isReversalLike(tx);
  const net =
    rawNet !== null && rawNet > 0 && rawNet <= gross
      ? rawNet
      : reversal && rawNet !== null && rawNet < 0 && Math.abs(rawNet) <= gross
        ? Math.abs(rawNet)
      : Math.round(gross * 80) / 100;
  const sign = reversal ? -1 : 1;
  return { amount: sign * gross, net: sign * net };
}
