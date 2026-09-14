import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import {
  FOLLOWERS_QUERY_POLICY,
  followerKey,
} from '../../src/renderer/src/features/followers/queries';

describe('follower cache-only query lifecycle', () => {
  it('refreshes main after leaving and returning despite the application Infinity cache default', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, retry: false } },
    });
    const queryKey = [...followerKey('acct_1'), 'snapshot'];
    let state = 'running';
    const queryFn = vi.fn(async () => ({ state }));
    const first = new QueryObserver(client, {
      ...FOLLOWERS_QUERY_POLICY,
      queryKey,
      queryFn,
    });
    const offFirst = first.subscribe(() => {});
    await first.refetch();
    expect(first.getCurrentResult().data?.state).toBe('running');
    offFirst();
    state = 'complete';
    const beforeReopen = queryFn.mock.calls.length;
    const reopened = new QueryObserver(client, {
      ...FOLLOWERS_QUERY_POLICY,
      queryKey,
      queryFn,
    });
    let offReopened: () => void = () => {};
    await new Promise<void>((resolve) => {
      offReopened = reopened.subscribe((result) => {
        if (result.data?.state === 'complete') resolve();
      });
    });
    expect(queryFn).toHaveBeenCalledTimes(beforeReopen + 1);
    offReopened();
    client.clear();
  });
});
