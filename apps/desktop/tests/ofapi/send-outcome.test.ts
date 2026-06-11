// classifySendFailure matrix (SPEC §7.4–7.5): 'definite' ONLY when the request
// provably never left (connection-establishment/TLS causes) or a definitive 4xx
// application response (408 excluded, 429 included). Everything else — and
// anything in doubt — is 'indeterminate' and must never be auto-retried.

import { describe, expect, it } from 'vitest';
import { OfApiError, mapOfApiHttpError, mapOfApiNetworkError } from '@main/ofapi/errors';
import { classifySendFailure } from '@main/ofapi/send-outcome';
import { loadFixture } from './helpers';

const URL_OK = 'https://app.onlyfansapi.com/api/acct_x/chats/1/messages';

/** undici-style chain: TypeError('fetch failed') with the syscall error on .cause. */
function fetchFailed(code: string, message = code): TypeError {
  const syscall = new Error(message);
  // Node syscall errors expose .code; assign like the runtime does.
  Object.assign(syscall, { code });
  return new TypeError('fetch failed', { cause: syscall });
}

describe('definite: request provably never left', () => {
  const CONNECT_CODES = ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH'];

  it.each(CONNECT_CODES)('%s (raw undici chain)', (code) => {
    expect(classifySendFailure(fetchFailed(code))).toBe('definite');
  });

  it.each(CONNECT_CODES)('%s survives mapOfApiNetworkError (cause preserved)', (code) => {
    const mapped = mapOfApiNetworkError(fetchFailed(code), URL_OK);
    expect(mapped.code).toBe('CG-NET-01');
    expect(classifySendFailure(mapped)).toBe('definite');
  });

  it.each([
    'CERT_HAS_EXPIRED',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'HOSTNAME_MISMATCH',
    'ERR_TLS_CERT_ALTNAME_INVALID',
    'ERR_TLS_HANDSHAKE_TIMEOUT',
  ])('TLS/cert failure %s', (code) => {
    expect(classifySendFailure(mapOfApiNetworkError(fetchFailed(code), URL_OK))).toBe('definite');
  });

  it('finds the code deep in a nested cause chain', () => {
    const inner = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
    const middle = new Error('connect failed', { cause: inner });
    const outer = new TypeError('fetch failed', { cause: middle });
    expect(classifySendFailure(mapOfApiNetworkError(outer, URL_OK))).toBe('definite');
  });

  it('tolerates a cyclic cause chain without hanging', () => {
    const cyclic = new Error('loop');
    cyclic.cause = cyclic;
    expect(classifySendFailure(cyclic)).toBe('indeterminate');
  });
});

describe('definite: definitive HTTP application responses', () => {
  it.each([400, 401, 402, 404, 422, 429, 451])('%i → definite', (status) => {
    expect(classifySendFailure(mapOfApiHttpError({ status, url: URL_OK, body: null }))).toBe(
      'definite',
    );
  });

  it('live restricted-words 400 fixture → definite (CG-OF-05)', () => {
    const error = mapOfApiHttpError({
      status: 400,
      url: URL_OK,
      body: loadFixture('send-message-restricted-400.json'),
    });
    expect(error.code).toBe('CG-OF-05');
    expect(classifySendFailure(error)).toBe('definite');
  });

  it('429 rate-limit rejection counts as not-processed → definite', () => {
    const error = mapOfApiHttpError({
      status: 429,
      url: URL_OK,
      body: { message: 'Too Many Attempts.' },
      retryAfterMs: 1000,
    });
    expect(classifySendFailure(error)).toBe('definite');
  });
});

describe('indeterminate: everything else (never auto-retry)', () => {
  it('408 is NOT definite despite being 4xx', () => {
    expect(classifySendFailure(mapOfApiHttpError({ status: 408, url: URL_OK, body: null }))).toBe(
      'indeterminate',
    );
  });

  it.each([500, 502, 503, 504])('%i → indeterminate', (status) => {
    expect(classifySendFailure(mapOfApiHttpError({ status, url: URL_OK, body: null }))).toBe(
      'indeterminate',
    );
  });

  it('wrapped OnlyFans 5xx stays indeterminate even when OFAPI returns 4xx packaging', () => {
    const error = mapOfApiHttpError({
      status: 400,
      url: URL_OK,
      body: {
        error: 'ONLYFANS_COM_ERROR',
        message: 'Bad Request - The request could not be understood by the server.',
        onlyfans_response: { status: 502, body: { error: { code: 0, message: 'Bad gateway' } } },
      },
    });
    expect(error.upstreamStatus).toBe(502);
    expect(classifySendFailure(error)).toBe('indeterminate');
  });

  it('timeout/abort (request may have left) → indeterminate', () => {
    for (const name of ['TimeoutError', 'AbortError']) {
      const error = new Error('aborted');
      error.name = name;
      expect(classifySendFailure(error)).toBe('indeterminate');
      expect(classifySendFailure(mapOfApiNetworkError(error, URL_OK))).toBe('indeterminate');
    }
  });

  it.each(['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'UND_ERR_SOCKET'])(
    'post-connect failure %s → indeterminate',
    (code) => {
      expect(classifySendFailure(fetchFailed(code, 'socket hang up'))).toBe('indeterminate');
      expect(classifySendFailure(mapOfApiNetworkError(fetchFailed(code), URL_OK))).toBe(
        'indeterminate',
      );
    },
  );

  it('unknown errors and non-errors → indeterminate', () => {
    expect(classifySendFailure(new Error('???'))).toBe('indeterminate');
    expect(classifySendFailure('boom')).toBe('indeterminate');
    expect(classifySendFailure(undefined)).toBe('indeterminate');
    expect(classifySendFailure(null)).toBe('indeterminate');
    expect(classifySendFailure(new OfApiError('CG-NET-01'))).toBe('indeterminate');
  });

  it('numeric code properties are not mistaken for syscall codes', () => {
    const weird = Object.assign(new Error('weird'), { code: 404 });
    expect(classifySendFailure(weird)).toBe('indeterminate');
  });
});
