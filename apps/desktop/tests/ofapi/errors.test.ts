// OFAPI → CG-OF-* error mapping (SPEC §5, §11).

import { describe, expect, it } from 'vitest';
import {
  OfApiError,
  mapOfApiHttpError,
  mapOfApiNetworkError,
  ofApiShapeError,
  parseRetryAfterMs,
} from '@main/ofapi/errors';
import { accountNeedsReauth, ofapiAccountSchema } from '@main/ofapi/schemas';
import { loadFixture } from './helpers';

const URL_OK = 'https://app.onlyfansapi.com/api/acct_x/chats';
const URL_NO_PREFIX = 'https://app.onlyfansapi.com/api/123456/chats';

describe('mapOfApiHttpError', () => {
  it('401 → CG-OF-01 (API key invalid)', () => {
    const error = mapOfApiHttpError({ status: 401, url: URL_OK, body: { message: 'Unauthenticated.' } });
    expect(error.code).toBe('CG-OF-01');
    expect(error.detail?.status).toBe(401);
    expect(error.detail?.provider).toBe('ofapi');
  });

  it('429 → CG-OF-03 carrying retryAfterMs', () => {
    const error = mapOfApiHttpError({
      status: 429,
      url: URL_OK,
      body: { message: 'Too Many Attempts.' },
      retryAfterMs: 3000,
    });
    expect(error.code).toBe('CG-OF-03');
    expect(error.retryAfterMs).toBe(3000);
    expect(error.detail?.retryAtMs).toBeTypeOf('number');
  });

  it('402 → CG-OF-04 (credits exhausted)', () => {
    expect(mapOfApiHttpError({ status: 402, url: URL_OK, body: null }).code).toBe('CG-OF-04');
  });

  it('credits-exhausted phrasing on other statuses → CG-OF-04', () => {
    const error = mapOfApiHttpError({
      status: 403,
      url: URL_OK,
      body: { message: 'Insufficient credits: 150 required' },
    });
    expect(error.code).toBe('CG-OF-04');
  });

  it('account session/auth failure phrasing → CG-OF-02', () => {
    for (const message of [
      'OnlyFans session expired, please reconnect the account',
      'Account authentication failed',
      'This account is not authenticated',
    ]) {
      expect(mapOfApiHttpError({ status: 400, url: URL_OK, body: { message } }).code).toBe('CG-OF-02');
    }
  });

  it('400 restricted words (top-level fallback shape) → CG-OF-05 carrying textHighLight', () => {
    const error = mapOfApiHttpError({
      status: 400,
      url: URL_OK,
      body: { message: 'Input contains restricted words', textHighLight: 'badword' },
    });
    expect(error.code).toBe('CG-OF-05');
    expect(error).toBeInstanceOf(OfApiError);
    expect(error.textHighLight).toBe('badword');
    expect(error.textHighLights).toEqual(['badword']);
  });

  it('top-level textHighLight array is normalized to one string and kept as array', () => {
    const error = mapOfApiHttpError({
      status: 400,
      url: URL_OK,
      body: { message: 'Input contains restricted words', textHighLight: ['a', 'b'] },
    });
    expect(error.code).toBe('CG-OF-05');
    expect(error.textHighLight).toBe('a, b');
    expect(error.textHighLights).toEqual(['a', 'b']);
  });

  it('LIVE wrapped restricted-words 400 (fixture) → CG-OF-05 with the nested textHighLight array', () => {
    const error = mapOfApiHttpError({
      status: 400,
      url: URL_OK,
      body: loadFixture('send-message-restricted-400.json'),
    });
    expect(error.code).toBe('CG-OF-05');
    // Live capture: the entry is the FULL message text, no per-word markers.
    expect(error.textHighLights).toEqual(['haha no I do not even have a cashapp']);
    expect(error.textHighLight).toBe('haha no I do not even have a cashapp');
    expect(error.upstreamStatus).toBe(400);
    expect(error.detail?.status).toBe(400);
  });

  it('wrapped ONLYFANS_COM_ERROR classifies by onlyfans_response.status', () => {
    const wrap = (status: number, message: string): unknown => ({
      error: 'ONLYFANS_COM_ERROR',
      message: 'Bad Request - The request could not be understood by the server.',
      onlyfans_response: { status, body: { error: { code: 0, message } } },
    });
    const session = mapOfApiHttpError({ status: 400, url: URL_OK, body: wrap(401, 'Unauthorized') });
    expect(session.code).toBe('CG-OF-02');
    expect(session.upstreamStatus).toBe(401);

    const limited = mapOfApiHttpError({ status: 400, url: URL_OK, body: wrap(429, 'Too many requests') });
    expect(limited.code).toBe('CG-OF-03');

    const upstream5xx = mapOfApiHttpError({ status: 400, url: URL_OK, body: wrap(502, 'Bad gateway') });
    expect(upstream5xx.code).toBe('CG-NET-01');
    expect(upstream5xx.upstreamStatus).toBe(502);

    const unknown = mapOfApiHttpError({ status: 400, url: URL_OK, body: wrap(403, 'Forbidden') });
    expect(unknown.code).toBe('CG-APP-01');
    expect(unknown.upstreamStatus).toBe(403);
  });

  it('wrapped error without textHighLight but with restricted-words message → CG-OF-05', () => {
    const error = mapOfApiHttpError({
      status: 400,
      url: URL_OK,
      body: {
        error: 'ONLYFANS_COM_ERROR',
        message: 'Bad Request',
        onlyfans_response: { status: 400, body: { error: { code: 0, message: 'Input contains restricted words' } } },
      },
    });
    expect(error.code).toBe('CG-OF-05');
    expect(error.textHighLights).toBeUndefined();
  });

  it('404 → CG-APP-01 with an acct_-prefix hint when the path lacks it', () => {
    const hinted = mapOfApiHttpError({ status: 404, url: URL_NO_PREFIX, body: null });
    expect(hinted.code).toBe('CG-APP-01');
    expect(hinted.message).toContain('acct_');

    const plain = mapOfApiHttpError({ status: 404, url: URL_OK, body: null });
    expect(plain.code).toBe('CG-APP-01');
    expect(plain.message).not.toContain('acct_');
  });

  it('422 → CG-APP-01 carrying the validation detail', () => {
    const error = mapOfApiHttpError({
      status: 422,
      url: URL_OK,
      body: {
        error: 'VALIDATION_ERROR',
        message: 'The text field is required.',
        description: 'The request parameters failed validation.',
        errors: { text: ['The text field is required.'] },
      },
    });
    expect(error.code).toBe('CG-APP-01');
    expect(error.message).toContain('The text field is required.');
    expect(error.validationErrors).toEqual({ text: ['The text field is required.'] });
  });

  it('5xx → CG-NET-01 (after the executor exhausted its retries)', () => {
    expect(mapOfApiHttpError({ status: 500, url: URL_OK, body: null }).code).toBe('CG-NET-01');
    expect(mapOfApiHttpError({ status: 503, url: URL_OK, body: 'Bad Gateway' }).code).toBe('CG-NET-01');
  });

  it('other 400s → CG-APP-01 with a response snippet', () => {
    const error = mapOfApiHttpError({ status: 400, url: URL_OK, body: { message: 'weird' } });
    expect(error.code).toBe('CG-APP-01');
    expect(error.detail?.responseSnippet).toContain('weird');
  });

  it('tolerates non-JSON (text) bodies', () => {
    const error = mapOfApiHttpError({ status: 400, url: URL_OK, body: '<html>nope</html>' });
    expect(error.code).toBe('CG-APP-01');
  });

  it('tolerates the live 405 HTML page body (method probing 2026-06-11)', () => {
    const error = mapOfApiHttpError({
      status: 405,
      url: URL_OK,
      body: '<html><body><h1>405 Method Not Allowed</h1></body></html>',
    });
    expect(error.code).toBe('CG-APP-01');
    expect(error.detail?.status).toBe(405);
    expect(error.detail?.responseSnippet).toContain('405 Method Not Allowed');
  });
});

describe('mapOfApiNetworkError', () => {
  it('timeout/abort → CG-NET-02', () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    expect(mapOfApiNetworkError(abort, URL_OK).code).toBe('CG-NET-02');
    const timeout = new Error('timed out');
    timeout.name = 'TimeoutError';
    expect(mapOfApiNetworkError(timeout, URL_OK).code).toBe('CG-NET-02');
  });

  it('other network failures → CG-NET-01', () => {
    expect(mapOfApiNetworkError(new TypeError('fetch failed'), URL_OK).code).toBe('CG-NET-01');
    expect(mapOfApiNetworkError('boom', URL_OK).code).toBe('CG-NET-01');
  });

  it('preserves the original error chain on .cause (classifySendFailure needs the codes)', () => {
    const syscall = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
    const raw = new TypeError('fetch failed', { cause: syscall });
    const mapped = mapOfApiNetworkError(raw, URL_OK);
    expect(mapped.cause).toBe(raw);
  });
});

describe('parseRetryAfterMs', () => {
  it('parses delta-seconds', () => {
    expect(parseRetryAfterMs('2')).toBe(2000);
    expect(parseRetryAfterMs('0')).toBe(0);
  });
  it('returns undefined for absent/garbage values', () => {
    expect(parseRetryAfterMs(null)).toBeUndefined();
    expect(parseRetryAfterMs('')).toBeUndefined();
    expect(parseRetryAfterMs('soon')).toBeUndefined();
  });
  it('parses an HTTP-date as a non-negative delay', () => {
    const future = new Date(Date.now() + 5000).toUTCString();
    const ms = parseRetryAfterMs(future);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(5000);
  });
});

describe('shape errors and account auth state', () => {
  it('ofApiShapeError → CG-APP-01 with the validation summary', () => {
    const error = ofApiShapeError('/accounts', 'expected array');
    expect(error.code).toBe('CG-APP-01');
    expect(error.message).toContain('expected array');
  });

  it('accountNeedsReauth flags is_authenticated=false (CG-OF-02 surface)', () => {
    const stale = ofapiAccountSchema.parse({ id: 'acct_1', is_authenticated: false });
    const fresh = ofapiAccountSchema.parse({ id: 'acct_2', is_authenticated: true });
    const unknown = ofapiAccountSchema.parse({ id: 'acct_3' });
    expect(accountNeedsReauth(stale)).toBe(true);
    expect(accountNeedsReauth(fresh)).toBe(false);
    expect(accountNeedsReauth(unknown)).toBe(false);
  });
});
