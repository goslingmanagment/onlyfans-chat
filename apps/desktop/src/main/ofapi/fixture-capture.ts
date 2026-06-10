// Debug-mode fixture capture (SPEC §5, §12): records sanitized request/response
// pairs for contract tests. No sandbox upstream — recorded fixtures are the
// regression net. Auth headers are stripped, response PII anonymized (sanitize.ts).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createOfApiSanitizer } from './sanitize';

const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'set-cookie', 'x-api-key']);

export interface CapturedExchange {
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  status: number;
  responseHeaders: Record<string, string>;
  responseBody: unknown;
}

export interface FixtureCapture {
  readonly enabled: boolean;
  record(exchange: CapturedExchange): void;
}

export interface FixtureCaptureOptions {
  dir: string;
  enabled?: boolean;
  /** Injectable for tests; defaults to mkdir+writeFileSync. */
  writeFile?: (filePath: string, contents: string) => void;
  now?: () => number;
}

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    out[name] = SENSITIVE_HEADERS.has(name.toLowerCase()) ? '[REDACTED]' : value;
  }
  return out;
}

function fileSlug(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    return pathname.replace(/^\/api\/?/, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'root';
  } catch {
    return 'request';
  }
}

export function createFixtureCapture(options: FixtureCaptureOptions): FixtureCapture {
  const enabled = options.enabled ?? false;
  const now = options.now ?? Date.now;
  const writeFile =
    options.writeFile ??
    ((filePath: string, contents: string): void => {
      mkdirSync(options.dir, { recursive: true });
      writeFileSync(filePath, contents);
    });

  return {
    enabled,
    record(exchange): void {
      if (!enabled) return;
      // Fresh sanitizer per exchange: fixtures stay self-consistent, captures
      // from different sessions never share a mapping.
      const sanitizer = createOfApiSanitizer();
      const doc = {
        _fixture: {
          capturedAt: new Date(now()).toISOString(),
          sanitized: true,
        },
        request: {
          method: exchange.method,
          url: sanitizer.sanitizeApiUrl(exchange.url),
          headers: redactHeaders(exchange.requestHeaders),
        },
        response: {
          status: exchange.status,
          headers: redactHeaders(exchange.responseHeaders),
          body: sanitizer.sanitize(exchange.responseBody),
        },
      };
      const name = `${exchange.method.toLowerCase()}_${fileSlug(exchange.url)}_${now()}.json`;
      writeFile(join(options.dir, name), `${JSON.stringify(doc, null, 2)}\n`);
    },
  };
}
