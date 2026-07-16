// Builds the diagnostics bundle the user exports as ONE file and sends to
// support. The composition root gathers the live inputs (versions, sync/hub/
// credit status, DB counts, outbox audit, recent log) and this assembles +
// re-redacts them. Pure (no Electron/fs) so the shape and the redaction are
// unit-tested. SPEC §15: the bundle is MEANT to leave the machine — every
// string leaf is run through the secret redactor one last time before writing.

import { redactValue, type LogEntry } from '@chatgoose/shared/diagnostics/log';

export interface DiagnosticsInputs {
  /** ISO timestamp the bundle was produced. */
  generatedAt: string;
  app: {
    version: string;
    electron: string;
    chrome: string;
    node: string;
    platform: string;
    arch: string;
  };
  runtime: {
    uptimeMs: number;
    /** OS locale tag (app.getLocale()). */
    locale: string;
    /** Resolved interface language ('en' | 'ru'). */
    uiLocale: string;
  };
  /** SettingsVM via settingsForDiagnosticsExport (no last4 fingerprints). */
  settings: unknown;
  sync: unknown;
  hub: unknown;
  hubActivity: unknown;
  credits: unknown;
  coreCredits: unknown;
  /** Stable local harvest identity, once prepared by the owner. */
  harvest: { machineId: string | null };
  db: { schemaVersion: number | null; counts: Record<string, number> };
  outboxAudit: unknown;
  messageGuardAudit?: unknown;
  /**
   * The full undelivered usage spool — pending, dead-letter AND quarantined
   * rows, each with state + payload. Valid usage telemetry carries no message
   * text; malformed legacy rows remain raw and are explicitly marked invalid.
   * Exporting is the only way these facts leave the machine before a purge
   * (Stage 4 kept-but-exportable).
   */
  usageSpool?: unknown;
  /** error-level CG-* code → count over the in-memory log ring. */
  errorCounts: Record<string, number>;
  /** Structured recent records from the in-memory ring (current session). */
  logs: LogEntry[];
  /**
   * Raw redacted log lines read back from disk (app.1.log + app.log). Spans
   * process restarts, so a crash from a PRIOR session is captured here even
   * though `logs` (the ring) only holds the current session.
   */
  fileLog: string[];
}

/** Strip every last-4 fingerprint carrier before the settings VM enters the
 * bundle (SPEC §15: the file is meant to leave the machine, so even partial
 * key material goes). D19 added hubDeviceIdentity, which carries tokenLast4. */
export function settingsForDiagnosticsExport<T extends {
  keyMeta: unknown;
  hubDeviceIdentity: unknown;
}>(vm: T): Omit<T, 'keyMeta' | 'hubDeviceIdentity'> {
  const { keyMeta: _keyMeta, hubDeviceIdentity: _identity, ...rest } = vm;
  return rest;
}

/**
 * Assemble the export object and deep-redact it against the live secret values.
 * The result is JSON-serialized and written to one `.json` file by the caller.
 */
export function buildDiagnosticsReport(
  inputs: DiagnosticsInputs,
  secrets: readonly string[] = [],
): Record<string, unknown> {
  const { usageSpool, logs, fileLog, ...rest } = inputs;
  // Both sources are chronological (oldest -> newest). The generic redactor
  // keeps the first 100 array items, which used to discard the incident tail.
  // Bound these arrays from the end before the final all-field redaction pass.
  const boundedInputs = {
    ...rest,
    logs: logs.slice(-100),
    fileLog: fileLog.slice(-100),
  };
  const report = redactValue(boundedInputs, secrets) as Record<string, unknown>;
  if (usageSpool !== undefined) {
    // The generic diagnostics redactor deliberately caps arrays at 100. The
    // usage spool is different: it is the purge insurance for accounting facts,
    // so every DB row (including an invalid raw legacy payload) must survive
    // export. Retain all rows/keys while still applying the exact same secret,
    // depth and per-string safety passes.
    report['usageSpool'] = redactValue(usageSpool, secrets, {
      maxArrayItems: Number.POSITIVE_INFINITY,
      maxObjectKeys: Number.POSITIVE_INFINITY,
    });
  }
  return report;
}
