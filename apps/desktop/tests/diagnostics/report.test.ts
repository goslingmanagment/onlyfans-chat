import { describe, expect, it } from 'vitest';
import { buildDiagnosticsReport, type DiagnosticsInputs } from '../../src/main/diagnostics/report';

function inputs(overrides: Partial<DiagnosticsInputs> = {}): DiagnosticsInputs {
  return {
    generatedAt: '2026-06-13T00:00:00.000Z',
    app: {
      version: '0.1.0',
      electron: '30.0.0',
      chrome: '124',
      node: '20',
      platform: 'darwin',
      arch: 'arm64',
    },
    runtime: { uptimeMs: 12_345, locale: 'ru-RU', uiLocale: 'ru' },
    settings: { hubBaseUrl: 'https://hub.example.com', debugMode: false },
    sync: { state: 'live', freshness: {} },
    hub: 'live',
    hubActivity: null,
    credits: { balance: 100, usedToday: 3 },
    coreCredits: null,
    db: { schemaVersion: 7, counts: { accounts: 2, chats: 40, messages: 1200 } },
    outboxAudit: { cleanSends: 10 },
    errorCounts: { 'CG-OF-03': 2 },
    logs: [{ t: 0, level: 'error', scope: 'sync', msg: 'blip', code: 'CG-NET-01' }],
    fileLog: ['2026-06-13T00:00:00.000Z ERROR [boot] fatal startup error'],
    ...overrides,
  };
}

describe('buildDiagnosticsReport', () => {
  it('includes the log, db counts, outbox audit and error summary in one object', () => {
    const report = buildDiagnosticsReport(inputs());
    expect(report['logs']).toHaveLength(1);
    expect(report['fileLog']).toEqual([
      '2026-06-13T00:00:00.000Z ERROR [boot] fatal startup error',
    ]);
    expect(report['db']).toMatchObject({ schemaVersion: 7 });
    expect(report['outboxAudit']).toMatchObject({ cleanSends: 10 });
    expect(report['errorCounts']).toEqual({ 'CG-OF-03': 2 });
    expect(report['app']).toMatchObject({ version: '0.1.0', arch: 'arm64' });
  });

  it('deep-redacts any leaked secret value against the live secret set', () => {
    const report = buildDiagnosticsReport(
      inputs({
        // A secret that somehow reached an unredacted field — the final pass must catch it.
        settings: { note: 'leaked key sk-secret-value-1234567890' },
        logs: [{ t: 0, level: 'error', scope: 's', msg: 'using sk-secret-value-1234567890' }],
      }),
      ['sk-secret-value-1234567890'],
    );
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('sk-secret-value-1234567890');
    expect(serialized).toContain('[redacted]');
  });

  it('masks token shapes even without an enumerated secret', () => {
    const report = buildDiagnosticsReport(
      inputs({ settings: { token: 'agency_hub_core_abcdef123456' } }),
      [],
    );
    expect(JSON.stringify(report)).not.toContain('agency_hub_core_abcdef123456');
  });

  it('preserves every usage-spool row past the generic 100-item diagnostics bound', () => {
    const events = Array.from({ length: 250 }, (_, index) => ({
      id: `usage-${String(index)}`,
      attempts: index % 4,
      state: 'pending',
      payload: {
        clientEventId: `usage-${String(index)}`,
        note: index === 249 ? 'token=agency_hub_core_abcdef123456' : 'ok',
      },
    }));
    const report = buildDiagnosticsReport(
      inputs({
        usageSpool: {
          counts: { pending: 250, deadLetter: 0, quarantined: 0, invalid: 0 },
          events,
        },
      }),
    );

    const exported = report['usageSpool'] as { events: typeof events };
    expect(exported.events).toHaveLength(250);
    expect(exported.events[249]?.id).toBe('usage-249');
    expect(JSON.stringify(exported.events[249])).not.toContain('agency_hub_core_abcdef123456');
  });

  it('exports durable hub telemetry while redacting lifecycle fields', () => {
    const report = buildDiagnosticsReport(
      inputs({
        hubActivity: {
          lastEventAt: Date.parse('2026-06-13T00:00:00Z'),
          lastEventType: 'messageReceived',
          lastFallbackReason: 'hub-id-only-fallback agency_hub_core_abcdef123456',
          eventsToday: 2,
          appliedEventsToday: 1,
          fallbackEventsToday: 1,
          droppedEventsToday: 0,
          eventsByTypeToday: { messageReceived: 2 },
          appliedByTypeToday: { messageReceived: 1 },
          fallbackByTypeToday: { messageReceived: 1 },
          droppedByTypeToday: {},
          fallbackByReasonToday: { 'hub-id-only-fallback': 1 },
          lifetime: {
            received: { total: 10, byType: { messageReceived: 10 } },
            applied: { total: 8, byType: { messageReceived: 8 } },
            fallback: { total: 2, byType: { messageReceived: 2 } },
            dropped: { total: 0, byType: {} },
            fallbackByReason: { 'hub-id-only-fallback': 2 },
          },
        },
      }),
      [],
    );

    expect(report['hubActivity']).toMatchObject({
      eventsToday: 2,
      eventsByTypeToday: { messageReceived: 2 },
      fallbackByReasonToday: { 'hub-id-only-fallback': 1 },
      lifetime: {
        received: { total: 10, byType: { messageReceived: 10 } },
        fallbackByReason: { 'hub-id-only-fallback': 2 },
      },
    });
    expect(JSON.stringify(report)).not.toContain('agency_hub_core_abcdef123456');
  });

  it('is a plain JSON-serializable object', () => {
    expect(() => JSON.stringify(buildDiagnosticsReport(inputs()))).not.toThrow();
  });
});
