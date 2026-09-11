import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { SpenderStatsVM } from '../../src/preload/contract';
import { StatsPanel } from '../../src/renderer/src/features/spenders/StatsPanel';

vi.mock('../../src/renderer/src/lib/i18n', () => ({
  useT: () => (key: string) => key,
  useLocale: () => 'en',
  localeTag: () => 'en-US',
}));

// The node Vitest config uses classic JSX for imported renderer components.
// Supply that runtime only in this test; production uses the automatic runtime.
vi.stubGlobal('React', React);
afterAll(() => vi.unstubAllGlobals());

const EMPTY_STATS: SpenderStatsVM = {
  days: [],
  revenue30d: 0,
  revenue7d: 0,
  revenue7dPct: null,
  revenueToday: 0,
  payers30d: 0,
  txCount30d: 0,
  avgCheck30d: 0,
  tiers: [],
  radar: [],
  hotCount: 0,
  hotLifetime: 0,
  waiting: [],
  newSpenders: [],
};

const LOADED_STATS: SpenderStatsVM = {
  ...EMPTY_STATS,
  days: [{ day: '2026-09-11', amount: 25 }],
  revenue30d: 1200,
  revenue7d: 300,
  revenueToday: 25,
  payers30d: 3,
  txCount30d: 5,
  avgCheck30d: 80,
};

describe.each([false, true])('StatsPanel query states (expanded=%s)', (expanded) => {
  function render(overrides: Partial<React.ComponentProps<typeof StatsPanel>> = {}) {
    return renderToStaticMarkup(React.createElement(StatsPanel, {
      expanded,
      stats: undefined,
      loading: false,
      error: null,
      onRetry: vi.fn(),
      ...overrides,
    }));
  }

  it('shows initial loading without inventing zero statistics', () => {
    const html = render({ loading: true });
    expect(html).toContain('animate-pulse');
    expect(html).not.toContain('$0');
    expect(html).not.toContain('role="alert"');
  });

  it('does not treat an absent idle result as successful empty data', () => {
    const html = render();
    expect(html).toContain('animate-pulse');
    expect(html).not.toContain('$0');
  });

  it('shows an initial failure and manual retry without fake values or raw error text', () => {
    const onRetry = vi.fn();
    const html = render({ error: new Error('private database path'), onRetry });
    expect(html).toContain('role="alert"');
    expect(html).toContain('sp.stats.loadFailed');
    expect(html).toContain('sp.retry');
    expect(html).toContain(expanded ? 'sp.stats.collapse' : 'sp.stats.expand');
    expect(html).not.toContain('$0');
    expect(html).not.toContain('animate-pulse');
    expect(html).not.toContain('sp.stats.refreshFailed');
    expect(html).not.toContain('private database path');
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('renders real zero statistics after a successful empty result', () => {
    const html = render({ stats: EMPTY_STATS });
    expect(html).toContain('$0');
    expect(html).not.toContain('animate-pulse');
    expect(html).not.toContain('role="alert"');
  });

  it('keeps cached values visible when a refresh fails', () => {
    const html = render({ stats: LOADED_STATS, error: new Error('refresh failed') });
    expect(html).toContain('$1,200');
    expect(html).toContain('sp.stats.refreshFailed');
    expect(html).toContain('sp.retry');
    expect(html).not.toContain('sp.stats.loadFailed');
    expect(html).not.toContain('animate-pulse');
  });

  it('keeps cached values visible during a normal background refresh', () => {
    const html = render({ stats: LOADED_STATS, loading: true });
    expect(html).toContain('$1,200');
    expect(html).not.toContain('animate-pulse');
    expect(html).not.toContain('role="alert"');
  });

  it.each([undefined, LOADED_STATS])('disables duplicate retries while the read is in flight (stats=%j)', (stats) => {
    const html = render({ stats, loading: true, error: new Error('previous failure') });
    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>sp\.retry<\/button>/);
    expect(html).not.toContain('animate-pulse');
  });
});
