// Status-bar tooltips are BYTE-FOR-BYTE from the binding mockup's tiplist
// (docs/mockups/experiments/activity-panel.html, owner sign-off 2026-06-11) —
// this test reads the mockup itself so any drift in either place fails loudly.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SyncStatusVM } from '../../src/preload/contract';
import { selectStatusAge } from '../../src/renderer/src/app/statusAge';
import { statusBarMode, STATUS_BAR_TIPS } from '../../src/renderer/src/app/statusBarTips';

function mockupTips(): Map<string, string> {
  const html = readFileSync(
    resolve(import.meta.dirname, '../../../../docs/mockups/experiments/activity-panel.html'),
    'utf8',
  );
  const table = /<table class="tiplist">([\s\S]*?)<\/table>/.exec(html)?.[1];
  if (table === undefined) throw new Error('tiplist table not found in the mockup');
  const tips = new Map<string, string>();
  for (const match of table.matchAll(/<tr><td>(.*?)<\/td><td>(.*?)<\/td><\/tr>/g)) {
    tips.set(match[1] ?? '', match[2] ?? '');
  }
  return tips;
}

describe('status-bar Russian tooltips (binding mockup tiplist)', () => {
  const tips = mockupTips();

  it('the mockup tiplist parsed completely', () => {
    expect([...tips.keys()]).toEqual([
      'POLLING',
      'HUB LIVE',
      'CREDITS TODAY · BAL',
      'AI TODAY',
      'SENDS · UNCONF',
      'UPDATED',
    ]);
  });

  it.each([
    ['POLLING', STATUS_BAR_TIPS.polling],
    ['HUB LIVE', STATUS_BAR_TIPS.hubLive],
    ['CREDITS TODAY · BAL', STATUS_BAR_TIPS.credits],
    ['AI TODAY', STATUS_BAR_TIPS.aiToday],
    ['SENDS · UNCONF', STATUS_BAR_TIPS.sends],
    ['UPDATED', STATUS_BAR_TIPS.updated],
  ])('%s matches the mockup byte-for-byte', (segment, text) => {
    expect(text).toBe(tips.get(segment));
  });
});

describe('statusBarMode (mode word matches the panel badge)', () => {
  it('polling when sync is live and hub is not', () => {
    expect(statusBarMode('live', 'off')).toMatchObject({ word: 'POLLING', tone: 'ok' });
    expect(statusBarMode('live', 'connecting')).toMatchObject({ word: 'POLLING' });
    expect(statusBarMode('live', 'degraded')).toMatchObject({ word: 'POLLING' });
    expect(statusBarMode('live', 'stopped')).toMatchObject({ word: 'POLLING' });
  });

  it('hub live promotes the mode word', () => {
    expect(statusBarMode('live', 'live')).toMatchObject({
      word: 'HUB LIVE',
      tone: 'ok',
      tip: STATUS_BAR_TIPS.hubLive,
    });
  });

  it('hub live outranks auxiliary polling trouble', () => {
    expect(statusBarMode('degraded', 'live')).toMatchObject({ word: 'HUB LIVE', tone: 'ok' });
    expect(statusBarMode('offline', 'live')).toMatchObject({ word: 'HUB LIVE', tone: 'ok' });
  });

  it('polling trouble is shown when hub is not live', () => {
    expect(statusBarMode('degraded', 'off')).toMatchObject({ word: 'DEGRADED', tone: 'warn' });
    expect(statusBarMode('offline', 'off')).toMatchObject({ word: 'OFFLINE', tone: 'bad' });
  });

  it('force-hub shows degraded while the hub is not live', () => {
    expect(statusBarMode('live', 'connecting', 'hub')).toMatchObject({
      word: 'DEGRADED',
      tone: 'warn',
      tip: STATUS_BAR_TIPS.forcedHub,
    });
  });
});

describe('selectStatusAge', () => {
  const base: SyncStatusVM = {
    creditsBalance: null,
    creditsUsedToday: 0,
    rpmRemaining: null,
    freshness: { acct_1: '2026-06-11T10:00:00.000Z' },
    listVerifiedAt: { acct_1: '2026-06-11T10:00:00.000Z' },
    state: 'live',
    hub: 'live',
    hubMode: 'live',
    hubCredentialAttention: false,
    hubModeOverride: 'auto',
    hubLastEventAt: '2026-06-11T10:14:00.000Z',
    hubLastEventType: 'messageReceived',
    hubEventsToday: 1,
    hubAppliedEventsToday: 1,
    hubDroppedEventsToday: 0,
    hubFallbackEventsToday: 0,
    hubEventsByTypeToday: { messageReceived: 1 },
    hubAppliedByTypeToday: { messageReceived: 1 },
    hubFallbackByTypeToday: {},
    hubDroppedByTypeToday: {},
    hubFallbackByReasonToday: {},
    hubLifetime: {
      received: { total: 1, byType: { messageReceived: 1 } },
      applied: { total: 1, byType: { messageReceived: 1 } },
      fallback: { total: 0, byType: {} },
      dropped: { total: 0, byType: {} },
      fallbackByReason: {},
    },
    hubLastFallbackReason: null,
    aiTodayUsd: 0,
    sendsToday: { sent: 0, failed: 0, unconfirmed: 0 },
  };

  it('uses push event age as primary in hub-live and keeps list verification secondary', () => {
    expect(selectStatusAge(base, 'acct_1')).toEqual({
      primaryAt: '2026-06-11T10:14:00.000Z',
      primaryKind: 'push',
      listVerifiedAt: '2026-06-11T10:00:00.000Z',
      showListVerified: true,
    });
  });

  it('preserves old polling semantics outside hub-live', () => {
    expect(
      selectStatusAge({ ...base, hub: 'off', hubMode: 'off', hubLastEventAt: null }, 'acct_1'),
    ).toEqual({
      primaryAt: '2026-06-11T10:00:00.000Z',
      primaryKind: 'list',
      listVerifiedAt: '2026-06-11T10:00:00.000Z',
      showListVerified: false,
    });
  });
});
