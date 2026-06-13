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

  it('is a plain JSON-serializable object', () => {
    expect(() => JSON.stringify(buildDiagnosticsReport(inputs()))).not.toThrow();
  });
});
