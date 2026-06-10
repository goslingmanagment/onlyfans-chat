import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './app/AppShell';
import { KeymapProvider } from './app/KeymapProvider';
import { attachBridgeEvents } from './bridge/events';

// event-driven invalidation only — no refetch loops (DESIGN §3)
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

export function App(): React.JSX.Element {
  const [queryClient] = useState(makeQueryClient);

  useEffect(() => attachBridgeEvents(queryClient), [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <KeymapProvider>
        <AppShell />
      </KeymapProvider>
    </QueryClientProvider>
  );
}
