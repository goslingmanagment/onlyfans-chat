import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FanPanelVM } from '../../src/preload/contract';
import { FanPanel } from '../../src/renderer/src/features/fan-panel/FanPanel';

const query = vi.hoisted(() => ({
  fan: null as FanPanelVM | null | undefined,
  dataUpdatedAt: 0,
  isError: false,
  isFetching: false,
  refetch: vi.fn(async () => undefined),
}));

vi.mock('../../src/renderer/src/bridge/queries', () => ({
  useFan: () => ({
    data: query.fan, dataUpdatedAt: query.dataUpdatedAt, isPending: false,
    isError: query.isError, isFetching: query.isFetching, refetch: query.refetch,
  }),
  useAccounts: () => ({ data: [] }),
  useMessages: () => ({ data: undefined }),
  useSettings: () => ({ data: undefined }),
}));
vi.mock('../../src/renderer/src/state/uiStore', () => ({
  useUiStore: (select: (state: unknown) => unknown) => select({
    selectedAccountId: 'acct_1', selectedChatId: '7', fanPanelTab: 'info', setFanPanelTab: () => undefined,
  }),
}));
vi.mock('../../src/renderer/src/features/ai/aiStore', () => ({
  useAiStore: (select: (state: unknown) => unknown) => select({ scanFlashSeq: 0 }),
  startAiFeature: () => undefined,
}));
vi.mock('../../src/renderer/src/lib/i18n', () => ({
  useT: () => (key: string) => key,
  useLocale: () => 'en',
}));

function render(fetchedAt: string | null, options: { error?: boolean; fetching?: boolean; noData?: boolean } = {}): string {
  const now = Date.parse('2026-06-13T12:00:00.000Z');
  vi.spyOn(Date, 'now').mockReturnValue(now);
  vi.stubGlobal('React', React);
  query.dataUpdatedAt = now;
  query.isError = options.error ?? false;
  query.isFetching = options.fetching ?? false;
  query.fan = options.noData ? undefined : {
    fanId: '7', name: 'Fan', customName: null, username: 'fan7', avatarUrl: null,
    lastSeen: null, about: null, spending: null, subscription: null, summary: null, fetchedAt,
  };
  return renderToStaticMarkup(React.createElement(FanPanel));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('FanPanel source age', () => {
  it('shows the 12-day-old source even when React Query was updated just now', () => {
    const html = render('2026-06-01T12:00:00.000Z');
    expect(html).toContain('12D');
    expect(html).not.toContain('0S');
  });

  it('shows unknown source age instead of the renderer query timestamp', () => {
    const html = render(null);
    expect(html).toContain('fan.sourceAgeUnknown');
    expect(html).not.toContain('0S');
  });

  it('shows an initial load failure with Retry rather than claiming there are no data', () => {
    const html = render(null, { error: true, noData: true });
    expect(html).toContain('fan.loadFailed');
    expect(html).toContain('sp.retry');
    expect(html).not.toContain('fan.noDataTitle');
  });

  it('preserves cached fan data and its source age when a refresh fails', () => {
    const html = render('2026-06-01T12:00:00.000Z', { error: true });
    expect(html).toContain('fan.refreshFailed');
    expect(html).toContain('@fan7');
    expect(html).toContain('12D');
    expect(html).toContain('sp.retry');
    expect(html).not.toContain('fan.loadFailed');
  });

  it.each([true, false])('disables the retry action while a request is in flight (noData=%s)', (noData) => {
    const html = render(null, { error: true, fetching: true, noData });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>sp\.retry<\/button>/);
  });
});
