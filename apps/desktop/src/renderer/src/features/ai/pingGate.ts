// query:ai.pingGate — main describes the local transcript's ping segment.
// D29: recency never blocks a manual Ping. Refetches are
// event-driven: the newest loaded message id is fed in by the pill row, so the
// gate re-evaluates exactly when the messages cache moves (no polling,
// DESIGN §3.3/§3.6).

import { useEffect } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { PingGateVM } from '../../../../preload/contract';
import { getBridge } from '../../bridge/bridge';

/** Stable key (no message id) so keymap/palette can read the cached gate. */
export function pingGateKey(accountId: string, chatId: string): readonly string[] {
  return ['ai-ping-gate', accountId, chatId] as const;
}

export function usePingGate(
  accountId: string | null,
  chatId: string | null,
  lastMessageId: string | null,
): UseQueryResult<PingGateVM> {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (accountId !== null && chatId !== null && lastMessageId !== null) {
      void queryClient.invalidateQueries({ queryKey: pingGateKey(accountId, chatId) });
    }
  }, [queryClient, accountId, chatId, lastMessageId]);

  return useQuery<PingGateVM>({
    queryKey:
      accountId === null || chatId === null
        ? ['ai-ping-gate', 'none', 'none']
        : pingGateKey(accountId, chatId),
    queryFn: () =>
      getBridge().invoke('query:ai.pingGate', { accountId: accountId ?? '', chatId: chatId ?? '' }),
    enabled: accountId !== null && chatId !== null,
  });
}
