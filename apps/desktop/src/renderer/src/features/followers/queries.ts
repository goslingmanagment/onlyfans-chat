export const followerKey = (accountId: string) =>
  ['followers', accountId] as const;
/** Main owns the run even when this surface is closed. These are cache-only IPC
 * reads: every mount refreshes main's current state without spending credits. */
export const FOLLOWERS_QUERY_POLICY = { refetchOnMount: 'always' as const };
