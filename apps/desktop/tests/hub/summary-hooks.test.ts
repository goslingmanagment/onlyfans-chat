// SummaryHubHooks adapters (SPEC §8.5): prefetch adopt/hydrate semantics
// (newer-than-local only), the 5 s prefetch budget (slow hub must not delay
// generation), push hub_sync_state bookkeeping ('synced' on 2xx / 'pending'
// on failure), the 50 KB byte gate, and silent skips on unresolvable pages.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSummaryHubHooks,
  HUB_PROFILE_MAX_BYTES,
  SUMMARY_REPLAY_DELAY_MS,
} from '@main/hub/summary-hooks';
import type { DataLayer } from '@main/db/index';
import { ACCT, FAN, hubProfile, makeFakeHubClient, memoryDataLayer, seedSummary } from './helpers';

const HUB_BODY = 'hub summary body';
const HUB_AT = '2026-06-10T10:00:00.000Z';
const HUB_AT_MS = Date.parse(HUB_AT);

function hooksWith(
  data: DataLayer,
  client = makeFakeHubClient(),
  pageLabel: string | null = 'Lora',
  isSummaryCurrent: (accountId: string, entry: NonNullable<ReturnType<DataLayer['summaries']['get']>>) => boolean = () => true,
) {
  const resolvePageLabel = vi.fn(() => Promise.resolve(pageLabel));
  const hooks = createSummaryHubHooks({
    client,
    data,
    resolvePageLabel,
    isSummaryCurrent,
    isPageLabelCurrent: () => true,
  });
  return { hooks, client, resolvePageLabel };
}

function hubSyncStateOf(data: DataLayer): unknown {
  return data.summaries.get(ACCT, FAN)?.hubSyncState;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('prefetchSummary', () => {
  it('adopts a hub profile newer than the local cache and hydrates db.summaries', async () => {
    const data = memoryDataLayer();
    seedSummary(data, { body: 'stale local', generatedAt: HUB_AT_MS - 60_000 });
    const client = makeFakeHubClient({
      getFanProfile: () => Promise.resolve(hubProfile(HUB_BODY, HUB_AT)),
    });
    const { hooks } = hooksWith(data, client);

    const result = await hooks.prefetchSummary?.({ accountId: ACCT, fanId: FAN });
    expect(result).toEqual({ body: HUB_BODY, generatedAt: HUB_AT_MS });

    const entry = data.summaries.get(ACCT, FAN);
    expect(entry?.body).toBe(HUB_BODY);
    expect(entry?.generatedAt).toBe(HUB_AT_MS);
    expect(entry?.hubSyncState).toMatchObject({ state: 'synced' });
    // Existing-row personality fields survive the hydrate.
    expect(entry?.personalityId).toBe('builtin:lora');
  });

  it('returns null (and leaves the row alone) when the hub profile is not newer', async () => {
    const data = memoryDataLayer();
    seedSummary(data, { body: 'fresher local', generatedAt: HUB_AT_MS + 60_000 });
    const client = makeFakeHubClient({
      getFanProfile: () => Promise.resolve(hubProfile(HUB_BODY, HUB_AT)),
    });
    const { hooks } = hooksWith(data, client);

    await expect(hooks.prefetchSummary?.({ accountId: ACCT, fanId: FAN })).resolves.toBeNull();
    expect(data.summaries.get(ACCT, FAN)?.body).toBe('fresher local');
    expect(hubSyncStateOf(data)).toBeUndefined();
  });

  it('returns null on 404 / absent profile version', async () => {
    const data = memoryDataLayer();
    const { hooks } = hooksWith(data, makeFakeHubClient({ getFanProfile: () => Promise.resolve(null) }));
    await expect(hooks.prefetchSummary?.({ accountId: ACCT, fanId: FAN })).resolves.toBeNull();
    expect(data.summaries.get(ACCT, FAN)).toBeNull();
  });

  it('skips silently when no page label resolves — getFanProfile is never called', async () => {
    const data = memoryDataLayer();
    const client = makeFakeHubClient();
    const { hooks } = hooksWith(data, client, null);
    await expect(hooks.prefetchSummary?.({ accountId: ACCT, fanId: FAN })).resolves.toBeNull();
    expect(client.getFanProfileMock).not.toHaveBeenCalled();
  });

  it('resolves null on a thrown client error instead of breaking the Scan', async () => {
    const data = memoryDataLayer();
    const client = makeFakeHubClient({
      getFanProfile: () => Promise.reject(new Error('hub down')),
    });
    const { hooks } = hooksWith(data, client);
    await expect(hooks.prefetchSummary?.({ accountId: ACCT, fanId: FAN })).resolves.toBeNull();
  });

  it('abandons a slow hub at the 5 s budget without delaying generation', async () => {
    vi.useFakeTimers();
    const data = memoryDataLayer();
    const client = makeFakeHubClient({
      getFanProfile: () => new Promise(() => undefined), // never resolves
    });
    const { hooks } = hooksWith(data, client);

    let settled: { body: string; generatedAt: number } | null | undefined;
    void hooks.prefetchSummary?.({ accountId: ACCT, fanId: FAN }).then((value) => {
      settled = value;
    });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(settled).toBeUndefined(); // still inside the budget
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBeNull(); // budget elapsed → generation proceeds
  });

  it('quiesce waits for a budget-abandoned resolver before releasing SQLite ownership', async () => {
    vi.useFakeTimers();
    const data = memoryDataLayer();
    let releaseResolver!: () => void;
    const resolverGate = new Promise<void>((resolve) => {
      releaseResolver = resolve;
    });
    const resolvePageLabel = vi.fn(async () => {
      await resolverGate;
      // This is the DB-owning continuation that must finish before close.
      return data.accounts.get(ACCT)?.username ?? null;
    });
    const hooks = createSummaryHubHooks({
      client: makeFakeHubClient(),
      data,
      resolvePageLabel,
      isSummaryCurrent: () => true,
      isPageLabelCurrent: () => true,
    });
    const publicPrefetch = hooks.prefetchSummary?.({ accountId: ACCT, fanId: FAN });
    await Promise.resolve();
    expect(resolvePageLabel).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(publicPrefetch).resolves.toBeNull();

    let released = false;
    const stopped = hooks.quiesce().then(() => {
      released = true;
    });
    await Promise.resolve();
    expect(released).toBe(false);

    releaseResolver();
    await stopped;
    data.close();
    await expect(hooks.prefetchSummary?.({ accountId: ACCT, fanId: FAN })).resolves.toBeNull();
  });
});

describe('pushSummary', () => {
  it("sets hub_sync_state 'synced' on a delivered push", async () => {
    const data = memoryDataLayer();
    seedSummary(data, { body: HUB_BODY, generatedAt: HUB_AT_MS });
    const client = makeFakeHubClient();
    const { hooks } = hooksWith(data, client);

    await hooks.pushSummary?.({ accountId: ACCT, fanId: FAN, body: HUB_BODY, generatedAt: HUB_AT_MS });
    expect(client.putFanProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pageLabel: 'Lora',
        fanId: FAN,
        body: HUB_BODY,
        generatedAtMs: HUB_AT_MS,
      }),
    );
    expect(hubSyncStateOf(data)).toMatchObject({ state: 'synced' });
  });

  it("sets hub_sync_state 'pending' when the push fails (no throw)", async () => {
    const data = memoryDataLayer();
    seedSummary(data, { body: HUB_BODY, generatedAt: HUB_AT_MS });
    const client = makeFakeHubClient({ putFanProfile: () => Promise.reject(new Error('503')) });
    const { hooks } = hooksWith(data, client);

    await hooks.pushSummary?.({ accountId: ACCT, fanId: FAN, body: HUB_BODY, generatedAt: HUB_AT_MS });
    expect(hubSyncStateOf(data)).toMatchObject({ state: 'pending', reason: 'delivery-failed' });
    hooks.dispose();
  });

  it("marks 'pending' when the push exceeds its 10 s budget", async () => {
    vi.useFakeTimers();
    const data = memoryDataLayer();
    seedSummary(data, { body: HUB_BODY, generatedAt: HUB_AT_MS });
    const client = makeFakeHubClient({ putFanProfile: () => new Promise(() => undefined) });
    const { hooks } = hooksWith(data, client);

    const push = hooks.pushSummary?.({ accountId: ACCT, fanId: FAN, body: HUB_BODY, generatedAt: HUB_AT_MS });
    await vi.advanceTimersByTimeAsync(10_000);
    await push;
    expect(hubSyncStateOf(data)).toMatchObject({ state: 'pending', reason: 'delivery-failed' });
    hooks.dispose();
  });

  it('gates oversize bodies (> 50 KB UTF-8) before the wire', async () => {
    const data = memoryDataLayer();
    const oversize = 'x'.repeat(HUB_PROFILE_MAX_BYTES + 1);
    seedSummary(data, { body: oversize, generatedAt: HUB_AT_MS });
    const client = makeFakeHubClient();
    const { hooks, resolvePageLabel } = hooksWith(data, client);

    await hooks.pushSummary?.({ accountId: ACCT, fanId: FAN, body: oversize, generatedAt: HUB_AT_MS });
    expect(resolvePageLabel).not.toHaveBeenCalled();
    expect(client.putFanProfileMock).not.toHaveBeenCalled();
    expect(hubSyncStateOf(data)).toMatchObject({ state: 'rejected', reason: 'oversize' });
    hooks.dispose();
  });

  it('counts the gate in UTF-8 bytes, not characters', async () => {
    const data = memoryDataLayer();
    // Two-byte chars: 26,000 chars = 52,000 bytes — over the byte gate while
    // comfortably under a 50,000-character gate.
    const multibyte = 'я'.repeat(26_000);
    seedSummary(data, { body: multibyte, generatedAt: HUB_AT_MS });
    const client = makeFakeHubClient();
    const { hooks } = hooksWith(data, client);
    await hooks.pushSummary?.({ accountId: ACCT, fanId: FAN, body: multibyte, generatedAt: HUB_AT_MS });
    expect(client.putFanProfileMock).not.toHaveBeenCalled();
    expect(hubSyncStateOf(data)).toMatchObject({ state: 'rejected', reason: 'oversize' });
    hooks.dispose();
  });

  it('skips silently when no page label resolves', async () => {
    const data = memoryDataLayer();
    seedSummary(data, { body: HUB_BODY, generatedAt: HUB_AT_MS });
    const client = makeFakeHubClient();
    const { hooks } = hooksWith(data, client, null);
    await hooks.pushSummary?.({ accountId: ACCT, fanId: FAN, body: HUB_BODY, generatedAt: HUB_AT_MS });
    expect(client.putFanProfileMock).not.toHaveBeenCalled();
    expect(hubSyncStateOf(data)).toMatchObject({ state: 'pending', reason: 'page-unresolved' });
    hooks.dispose();
  });

  it('never clobbers a row whose body changed while the push ran', async () => {
    const data = memoryDataLayer();
    seedSummary(data, { body: 'regenerated meanwhile', generatedAt: HUB_AT_MS + 1 });
    const client = makeFakeHubClient();
    const { hooks } = hooksWith(data, client);
    await hooks.pushSummary?.({ accountId: ACCT, fanId: FAN, body: HUB_BODY, generatedAt: HUB_AT_MS });
    expect(data.summaries.get(ACCT, FAN)?.body).toBe('regenerated meanwhile');
    expect(hubSyncStateOf(data)).toBeUndefined();
    hooks.dispose();
  });

  it('replays a failed push after connectivity returns and marks the same body synced', async () => {
    vi.useFakeTimers();
    const data = memoryDataLayer();
    seedSummary(data, { body: HUB_BODY, generatedAt: HUB_AT_MS });
    let offline = true;
    const client = makeFakeHubClient({
      putFanProfile: () =>
        offline ? Promise.reject(new Error('offline')) : Promise.resolve({ version: 1 }),
    });
    const { hooks } = hooksWith(data, client);

    await hooks.pushSummary?.({ accountId: ACCT, fanId: FAN, body: HUB_BODY, generatedAt: HUB_AT_MS });
    expect(hubSyncStateOf(data)).toMatchObject({ state: 'pending' });
    offline = false;

    await vi.advanceTimersByTimeAsync(SUMMARY_REPLAY_DELAY_MS);

    expect(client.putFanProfileMock).toHaveBeenCalledTimes(2);
    expect(hubSyncStateOf(data)).toMatchObject({ state: 'synced' });
    hooks.dispose();
  });

  it('persists pending before page resolution so a runtime swap can replay the same body', async () => {
    const data = memoryDataLayer();
    seedSummary(data, { body: HUB_BODY, generatedAt: HUB_AT_MS });
    let resolvePage: ((value: string | null) => void) | undefined;
    const first = createSummaryHubHooks({
      client: makeFakeHubClient(),
      data,
      isSummaryCurrent: () => true,
      isPageLabelCurrent: () => true,
      resolvePageLabel: () => new Promise<string | null>((resolve) => {
        resolvePage = resolve;
      }),
    });

    const interruptedPush = first.pushSummary?.({
      accountId: ACCT,
      fanId: FAN,
      body: HUB_BODY,
      generatedAt: HUB_AT_MS,
    });
    expect(hubSyncStateOf(data)).toMatchObject({
      state: 'pending',
      reason: 'delivery-pending',
    });
    first.dispose();
    resolvePage?.('acct-page');
    await interruptedPush;

    const replacementClient = makeFakeHubClient();
    const replacement = createSummaryHubHooks({
      client: replacementClient,
      data,
      resolvePageLabel: async () => 'acct-page',
      isSummaryCurrent: () => true,
      isPageLabelCurrent: () => true,
    });
    await replacement.replayPending();

    expect(replacementClient.putFanProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({ body: HUB_BODY, generatedAtMs: HUB_AT_MS }),
    );
    expect(hubSyncStateOf(data)).toMatchObject({ state: 'synced' });
    replacement.dispose();
  });

  it('does not replay an old body after the local summary is replaced', async () => {
    vi.useFakeTimers();
    const data = memoryDataLayer();
    seedSummary(data, { body: HUB_BODY, generatedAt: HUB_AT_MS });
    const client = makeFakeHubClient({ putFanProfile: () => Promise.reject(new Error('offline')) });
    const { hooks } = hooksWith(data, client);
    await hooks.pushSummary?.({ accountId: ACCT, fanId: FAN, body: HUB_BODY, generatedAt: HUB_AT_MS });

    seedSummary(data, { body: 'new local body', generatedAt: HUB_AT_MS + 1 });
    await vi.advanceTimersByTimeAsync(SUMMARY_REPLAY_DELAY_MS);

    expect(client.putFanProfileMock).toHaveBeenCalledTimes(1);
    expect(data.summaries.get(ACCT, FAN)?.body).toBe('new local body');
    hooks.dispose();
  });

  it('parks a pending Hub A summary instead of replaying it through Hub B', async () => {
    const data = memoryDataLayer();
    seedSummary(data, {
      body: HUB_BODY,
      generatedAt: HUB_AT_MS,
      personalityId: 'source-A',
    });
    const offlineA = makeFakeHubClient({ putFanProfile: () => Promise.reject(new Error('offline')) });
    const hooksA = createSummaryHubHooks({
      client: offlineA,
      data,
      resolvePageLabel: async () => 'acct-page',
      isSummaryCurrent: (_accountId, entry) => entry.personalityId === 'source-A',
      isPageLabelCurrent: () => true,
    });
    await hooksA.pushSummary?.({ accountId: ACCT, fanId: FAN, body: HUB_BODY, generatedAt: HUB_AT_MS });
    hooksA.dispose();

    const clientB = makeFakeHubClient();
    const hooksB = createSummaryHubHooks({
      client: clientB,
      data,
      resolvePageLabel: async () => 'acct-page',
      isSummaryCurrent: (_accountId, entry) => entry.personalityId === 'source-B',
      isPageLabelCurrent: () => true,
    });
    await hooksB.replayPending();
    expect(clientB.putFanProfileMock).not.toHaveBeenCalled();
    expect(hubSyncStateOf(data)).toMatchObject({ state: 'pending' });
    hooksB.dispose();

    const onlineA = makeFakeHubClient();
    const replacementA = createSummaryHubHooks({
      client: onlineA,
      data,
      resolvePageLabel: async () => 'acct-page',
      isSummaryCurrent: (_accountId, entry) => entry.personalityId === 'source-A',
      isPageLabelCurrent: () => true,
    });
    await replacementA.replayPending();
    expect(onlineA.putFanProfileMock).toHaveBeenCalledTimes(1);
    replacementA.dispose();
  });

  it('keeps a parked row retryable when its persona mapping becomes current again', async () => {
    vi.useFakeTimers();
    const data = memoryDataLayer();
    seedSummary(data, {
      body: HUB_BODY,
      generatedAt: HUB_AT_MS,
      personalityId: 'source-A',
      hubSyncState: { state: 'pending', at: HUB_AT, reason: 'delivery-failed' },
    });
    let current = false;
    const client = makeFakeHubClient();
    const hooks = createSummaryHubHooks({
      client,
      data,
      resolvePageLabel: async () => 'acct-page',
      isSummaryCurrent: () => current,
      isPageLabelCurrent: () => true,
    });

    await hooks.replayPending();
    expect(client.putFanProfileMock).not.toHaveBeenCalled();
    current = true;
    await vi.advanceTimersByTimeAsync(SUMMARY_REPLAY_DELAY_MS);

    expect(client.putFanProfileMock).toHaveBeenCalledTimes(1);
    hooks.dispose();
  });

  it('rechecks persona identity after page resolution and never PUTs a remapped summary', async () => {
    const data = memoryDataLayer();
    seedSummary(data, { body: HUB_BODY, generatedAt: HUB_AT_MS, personalityId: 'source-A' });
    let current = true;
    let resolvePage!: (value: string | null) => void;
    const client = makeFakeHubClient();
    const hooks = createSummaryHubHooks({
      client,
      data,
      resolvePageLabel: () => new Promise<string | null>((resolve) => {
        resolvePage = resolve;
      }),
      isSummaryCurrent: () => current,
      isPageLabelCurrent: () => true,
    });

    const push = hooks.pushSummary?.({ accountId: ACCT, fanId: FAN, body: HUB_BODY, generatedAt: HUB_AT_MS });
    current = false;
    resolvePage('acct-page');
    await push;

    expect(client.putFanProfileMock).not.toHaveBeenCalled();
    hooks.dispose();
  });

  it('rechecks page destination after resolution and never PUTs to a replaced override', async () => {
    const data = memoryDataLayer();
    seedSummary(data, { body: HUB_BODY, generatedAt: HUB_AT_MS });
    let destination = 'old-page-coordinate';
    let resolvePage!: (value: string | null) => void;
    const client = makeFakeHubClient();
    const hooks = createSummaryHubHooks({
      client,
      data,
      resolvePageLabel: () => new Promise<string | null>((resolve) => {
        resolvePage = resolve;
      }),
      isSummaryCurrent: () => true,
      isPageLabelCurrent: (_accountId, pageLabel) => pageLabel === destination,
    });

    const push = hooks.pushSummary?.({ accountId: ACCT, fanId: FAN, body: HUB_BODY, generatedAt: HUB_AT_MS });
    destination = 'new-page-coordinate';
    resolvePage('old-page');
    await push;

    expect(client.putFanProfileMock).not.toHaveBeenCalled();
    expect(hubSyncStateOf(data)).toMatchObject({ state: 'pending' });
    hooks.dispose();
  });
});
