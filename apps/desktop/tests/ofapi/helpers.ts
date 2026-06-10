import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FIXTURES_DIR = new URL('../../../../tests/fixtures/ofapi/', import.meta.url);

export function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(fileURLToPath(new URL(name, FIXTURES_DIR)), 'utf8'));
}

export function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
}

/** fetch stub: serves queued responses (last one repeats) and records requests. */
export function stubFetch(responses: Array<() => Response>): {
  fetchImpl: typeof fetch;
  requests: RecordedRequest[];
} {
  const requests: RecordedRequest[] = [];
  let index = 0;
  const fetchImpl: typeof fetch = (input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const headers: Record<string, string> = {};
    const rawHeaders = init?.headers;
    if (rawHeaders !== undefined) {
      new Headers(rawHeaders).forEach((value, name) => {
        headers[name] = value;
      });
    }
    requests.push({ url, method: init?.method ?? 'GET', headers });
    const factory = responses[Math.min(index, responses.length - 1)];
    index += 1;
    if (!factory) throw new Error('stubFetch: no responses queued');
    return Promise.resolve(factory());
  };
  return { fetchImpl, requests };
}

export const instantSleep = (_ms: number): Promise<void> => Promise.resolve();
