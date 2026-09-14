import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockBridge } from '../../src/renderer/src/dev/mockBridge';
import { createMockFollowers } from '../../src/renderer/src/dev/mockFollowers';
import { useUiStore } from '../../src/renderer/src/state/uiStore';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllTimers();
  vi.useRealTimers();
});
describe('new subscriber UI fixture contract', () => {
  it('shows all 700 subscribers across pages while keeping detail reads free', async () => {
    vi.useFakeTimers();
    const changed = vi.fn();
    const h = createMockFollowers(changed, () => true);
    const initial = await h['query:followers.snapshot']({
      accountId: 'acct_a',
    });
    expect(initial.state).toBe('idle');
    expect(initial.requests).toBe(0);
    await h['cmd:followers.start']({
      accountId: 'acct_a',
      hours: 24,
      acknowledgeRead: true,
    });
    await vi.advanceTimersByTimeAsync(3000);
    const ids: string[] = [];
    for (let offset = 0; offset < 700; offset += 100) {
      const page = await h['query:followers.snapshot']({
        accountId: 'acct_a',
        offset,
        limit: 100,
      });
      expect(page.matching).toBe(700);
      expect(page.rows).toHaveLength(100);
      ids.push(...page.rows.map((r) => r.fanId));
    }
    expect(new Set(ids).size).toBe(700);
    const before = await h['query:followers.snapshot']({ accountId: 'acct_a' });
    const firstId = ids[0]!;
    const detail = await h['query:followers.detail']({
      accountId: 'acct_a',
      fanId: firstId,
    });
    expect(detail?.row.status).toBe('ready');
    expect(detail?.messages).toEqual([]);
    expect(detail?.hasOlder).toBe(false);
    expect(before.requests).toBe(736); // welcome template + 35 fan pages + 700 histories
    for (const [fanId, kind] of [
      ['91001', 'personal'],
      ['91002', 'incoming'],
    ] as const) {
      const contacted = await h['query:followers.detail']({
        accountId: 'acct_a',
        fanId,
      });
      expect(contacted?.messages[0]?.kind).toBe('ambiguous');
      const proof = contacted?.messages.find(
        (message) => message.kind === kind,
      );
      expect(proof).toBeDefined();
      expect(contacted?.row.proof).toEqual({
        at: proof?.at,
        text: proof?.text,
        kind,
      });
    }
    await h['cmd:followers.recheck']({ accountId: 'acct_a', fanId: '91004' });
    const ambiguous = await h['query:followers.detail']({
      accountId: 'acct_a',
      fanId: '91004',
    });
    expect(ambiguous?.row.status).toBe('unknown');
    expect(ambiguous?.messages[0]?.kind).toBe('ambiguous');
    expect(
      (await h['query:followers.snapshot']({ accountId: 'acct_a' })).requests,
    ).toBe(before.requests);
    expect(
      (await h['query:followers.trace']({ accountId: 'acct_a' })).total,
    ).toBe(701);
    expect(
      await h['query:followers.detail']({
        accountId: 'acct_b',
        fanId: firstId,
      }),
    ).toBeNull();
    expect(changed).toHaveBeenCalled();
  });

  it('keeps frozen time boundaries on pause and resume', async () => {
    vi.useFakeTimers();
    const h = createMockFollowers(
      () => {},
      () => false,
    );
    await h['cmd:followers.start']({
      accountId: 'acct_a',
      hours: 48,
      acknowledgeRead: true,
    });
    await vi.advanceTimersByTimeAsync(300);
    await h['cmd:followers.pause']({ accountId: 'acct_a' });
    const paused = await h['query:followers.snapshot']({ accountId: 'acct_a' });
    await vi.advanceTimersByTimeAsync(86_400_000);
    expect(
      (await h['query:followers.snapshot']({ accountId: 'acct_a' })).checked,
    ).toBe(paused.checked);
    await h['cmd:followers.resume']({ accountId: 'acct_a' });
    const resumed = await h['query:followers.snapshot']({
      accountId: 'acct_a',
    });
    expect(resumed.from).toBe(paused.from);
    expect(resumed.to).toBe(paused.to);
    expect(
      (await h['query:followers.trace']({ accountId: 'acct_a' })).events,
    ).toEqual([]);
  });

  it('keeps the followers surface when selecting another account, clearing chat context', () => {
    useUiStore.setState({
      view: 'followers',
      selectedAccountId: 'acct_a',
      selectedChatId: '123',
    });
    useUiStore.getState().selectAccount('acct_b');
    expect(useUiStore.getState()).toMatchObject({
      view: 'followers',
      selectedAccountId: 'acct_b',
      selectedChatId: null,
    });
  });
});

it('captures a reopened follower draft after each preceding save even when acknowledgements arrive out of order', async () => {
  vi.useFakeTimers();
  const bridge = createMockBridge();
  const start = bridge.invoke('cmd:followers.start', {
    accountId: 'acct_lora',
    hours: 24,
    acknowledgeRead: true,
  });
  await vi.advanceTimersByTimeAsync(100);
  await start;
  const responses: Array<() => void> = [];
  vi.stubGlobal('setTimeout', (callback: () => void) => {
    responses.push(callback);
    return responses.length;
  });
  const args = { accountId: 'acct_lora', fanId: '91000' };
  const save = bridge.invoke('cmd:followers.draft', {
    ...args,
    text: 'latest edit',
  });
  const reopened = bridge.invoke('query:followers.detail', args);
  const clear = bridge.invoke('cmd:followers.draft', { ...args, text: '' });
  const cleared = bridge.invoke('query:followers.detail', args);
  expect(responses).toHaveLength(4);
  for (const index of [3, 1, 2, 0]) responses[index]!();
  expect((await reopened)?.draft).toBe('latest edit');
  expect((await cleared)?.draft).toBe('');
  await Promise.all([save, clear]);
});
