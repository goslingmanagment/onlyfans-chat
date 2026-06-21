// Why every OFAPI request happens (SPEC §5 credit telemetry; PLAN item 9).
// Every OfApiClient call site is compiler-forced to declare one of these; the
// credit meter tallies per-purpose and credit_log persists per-day rows.

export const OFAPI_PURPOSES = [
  'hot-poll',
  'deep-sweep',
  'unread-reconcile',
  'hydration',
  'message-tail',
  'chat-refresh',
  'media',
  'scan-deep-fetch',
  'send',
  'vault',
  'spend-sweep',
  'spenders',
  'spenders-refresh',
] as const;

export type OfApiPurpose = (typeof OFAPI_PURPOSES)[number];

/** credit_log rows recorded before per-purpose tagging existed (migration v7). */
export const UNTAGGED_PURPOSE = 'untagged';

/**
 * Ledger row labels (mockup wording where the mockup names the row). Keyed by
 * string so legacy 'untagged' and forward-compat purposes still render.
 */
export const OFAPI_PURPOSE_LABELS: Readonly<Record<string, string>> = {
  'hot-poll': 'Hot polls (new-message detector)',
  'deep-sweep': 'Deep sweeps (older chats)',
  'unread-reconcile': 'Unread read-state reconcile',
  'hydration': 'Hydration (chat-list backfill, fan details)',
  'message-tail': 'Message fetches (changed chats)',
  'chat-refresh': 'Manual chat refresh',
  'media': 'Media downloads',
  'scan-deep-fetch': 'Scan deep fetches',
  'send': 'Sends & delivery checks',
  'vault': 'Vault browsing & uploads',
  'spend-sweep': 'Fan-spend sweeps',
  'spenders': 'Spenders board (tier lists)',
  'spenders-refresh': 'Spenders refresh (thread backfill)',
  [UNTAGGED_PURPOSE]: 'Untagged (recorded before this update)',
};

export function purposeLabel(purpose: string): string {
  return OFAPI_PURPOSE_LABELS[purpose] ?? purpose;
}
