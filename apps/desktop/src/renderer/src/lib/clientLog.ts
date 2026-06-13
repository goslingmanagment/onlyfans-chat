// Renderer → main log feed. Renderer-side problems (render crashes, unhandled
// rejections, failed IPC calls) must land in the SAME log file the user exports,
// so support sees one timeline. Fire-and-forget and self-silencing: logging can
// never throw into the UI, and a failed log call is dropped (the bridge wrapper
// also skips the log channel itself so this can't recurse).

import type { LogLevel } from '@chatgoose/shared/diagnostics/log';
import { getBridge } from '../bridge/bridge';

/** Channel the bridge wrapper must NOT re-log (would recurse). */
export const CLIENT_LOG_CHANNEL = 'cmd:diag.logClient';

export function logClient(
  level: LogLevel,
  scope: string,
  message: string,
  fields?: Record<string, unknown>,
): void {
  try {
    void getBridge()
      .invoke(CLIENT_LOG_CHANNEL, {
        level,
        scope,
        message: message.slice(0, 4000),
        ...(fields !== undefined ? { fields } : {}),
      })
      .catch(() => undefined);
  } catch {
    // Never let diagnostics logging break the UI.
  }
}

let installed = false;

/** Capture window.onerror + unhandledrejection once, at renderer startup. */
export function installGlobalErrorCapture(): void {
  if (installed || typeof window === 'undefined') {
    return;
  }
  installed = true;

  window.addEventListener('error', (event) => {
    logClient('error', 'window', event.message || 'window error', {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      ...(event.error instanceof Error ? { stack: event.error.stack } : {}),
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason: unknown = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    logClient(
      'error',
      'unhandledrejection',
      message,
      reason instanceof Error ? { stack: reason.stack } : { reason },
    );
  });
}
