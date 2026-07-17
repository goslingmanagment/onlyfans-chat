import { describe, expect, it } from 'vitest';
import {
  CG_ERROR_CODES,
  CG_ERROR_REGISTRY,
  CgError,
  classifyAnthropicHttpError,
  classifyOpenRouterHttpError,
  createUserFacing,
  describeError,
  formatUserFacing,
  isCgErrorCode,
  isUserFacingError,
  toDebugPayload,
  toUserFacing,
  userFacingErrorSchema,
} from '../src/errors';

describe('error registry', () => {
  it('defines every code with a non-empty message and recovery action', () => {
    for (const code of CG_ERROR_CODES) {
      const def = CG_ERROR_REGISTRY[code];
      expect(def.message.length, code).toBeGreaterThan(0);
      expect(def.recovery.length, code).toBeGreaterThan(0);
    }
  });

  it('includes all new OFAPI and hub codes from SPEC §11', () => {
    const newCodes = [
      'CG-OF-01',
      'CG-OF-02',
      'CG-OF-03',
      'CG-OF-04',
      'CG-OF-05',
      'CG-OF-06',
      'CG-OF-07',
      'CG-OF-08',
      'CG-HUB-01',
      'CG-HUB-02',
      'CG-GUARD-01',
      'CG-GUARD-02',
    ];
    for (const code of newCodes) {
      expect(isCgErrorCode(code), code).toBe(true);
    }
  });

  it('keeps Hub authentication recovery on device sign-in, not the removed key flow', () => {
    const definition = CG_ERROR_REGISTRY['CG-HUB-01'];
    expect(definition.recovery).toContain('sign out');
    expect(definition.recovery).toContain('sign in again');
    expect(`${definition.message} ${definition.recovery}`).not.toMatch(/chatter key/i);
  });

  it('includes all ported legacy codes', () => {
    const ported = [
      'CG-AUTH-01',
      'CG-AUTH-02',
      'CG-API-01',
      'CG-API-02',
      'CG-API-03',
      'CG-API-04',
      'CG-API-05',
      'CG-API-06',
      'CG-NET-01',
      'CG-NET-02',
      'CG-FLOW-01',
      'CG-FLOW-02',
      'CG-FLOW-03',
      'CG-FLOW-04',
      'CG-FLOW-05',
      'CG-FLOW-06',
      'CG-FLOW-07',
      'CG-FLOW-08',
      'CG-FLOW-09',
      'CG-FAN-02',
      'CG-UI-01',
      'CG-APP-01',
    ];
    for (const code of ported) {
      expect(isCgErrorCode(code), code).toBe(true);
    }
  });

  it('rejects non-codes in isCgErrorCode', () => {
    expect(isCgErrorCode('CG-FAN-01')).toBe(false);
    expect(isCgErrorCode('not_connected')).toBe(false);
    expect(isCgErrorCode(42)).toBe(false);
    expect(isCgErrorCode(null)).toBe(false);
  });

  it('produces schema-valid user-facing errors for every code', () => {
    for (const code of CG_ERROR_CODES) {
      expect(userFacingErrorSchema.safeParse(describeError(code)).success, code).toBe(true);
    }
  });
});

// Legacy errors.test.ts: ChatGooseError construction facts.
describe('CgError', () => {
  it('constructs with code and default message', () => {
    const err = new CgError('CG-FAN-02');
    expect(err.code).toBe('CG-FAN-02');
    expect(err.message).toBe('OnlyFans session expired.');
    expect(err.isOptional).toBe(false);
  });

  it('constructs with custom message', () => {
    const err = new CgError('CG-NET-01', { message: 'fetch failed' });
    expect(err.message).toBe('fetch failed');
  });

  it('constructs with detail', () => {
    const err = new CgError('CG-API-05', { message: 'fail', detail: { status: 500 } });
    expect(err.detail?.status).toBe(500);
  });

  it('constructs with isOptional flag', () => {
    const err = new CgError('CG-NET-01', { isOptional: true });
    expect(err.isOptional).toBe(true);
  });

  it('is an instance of Error', () => {
    const err = new CgError('CG-APP-01');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('CgError');
  });

  it('lifts retry fields from detail when not given explicitly', () => {
    const err = new CgError('CG-API-01', { detail: { retryAfterMs: 7000, retryAtMs: 1750000007000 } });
    expect(err.retryAfterMs).toBe(7000);
    expect(err.retryAtMs).toBe(1750000007000);
  });

  it('prefers explicit retry fields over detail', () => {
    const err = new CgError('CG-API-01', { detail: { retryAfterMs: 7000 }, retryAfterMs: 3000 });
    expect(err.retryAfterMs).toBe(3000);
  });
});

// Legacy errors.test.ts: toUserError facts.
describe('toUserFacing', () => {
  it('maps CgError to its user-facing message', () => {
    const result = toUserFacing(new CgError('CG-AUTH-01'));
    expect(result.code).toBe('CG-AUTH-01');
    expect(result.settingsLink).toBe(true);
    expect(result.message).toContain('API key');
  });

  it('returns CG-APP-01 for a plain Error', () => {
    const result = toUserFacing(new Error('random'));
    expect(result.code).toBe('CG-APP-01');
    expect(result.message).toBe('Something went wrong.');
  });

  it('returns CG-APP-01 for null', () => {
    expect(toUserFacing(null).code).toBe('CG-APP-01');
    expect(toUserFacing(undefined).code).toBe('CG-APP-01');
  });

  it('carries retry fields from a CgError', () => {
    const result = toUserFacing(new CgError('CG-API-01', { retryAfterMs: 12000, retryAtMs: 1750000012000 }));
    expect(result.retryAfterMs).toBe(12000);
    expect(result.retryAtMs).toBe(1750000012000);
  });

  it('rebuilds a prototype-less CgError copy (IPC structured clone) from its code', () => {
    const wire = JSON.parse(JSON.stringify(toDebugPayload(new CgError('CG-API-01', { retryAfterMs: 9000 }))));
    const result = toUserFacing(wire);
    expect(result.code).toBe('CG-API-01');
    expect(result.message).toBe('Rate limit reached.');
    expect(result.retryAfterMs).toBe(9000);
  });

  it('passes a pre-built user-facing error through unchanged', () => {
    const custom = createUserFacing('CG-NET-02', { message: 'Summary timed out.' });
    expect(toUserFacing(custom)).toEqual(custom);
  });

  it('rewords OpenRouter-classified errors per provider', () => {
    const result = toUserFacing(classifyOpenRouterHttpError(401, null));
    expect(result.code).toBe('CG-AUTH-02');
    expect(result.message).toBe('OpenRouter API key is invalid.');
    expect(result.recovery).toContain('OpenRouter');
  });

  it('keeps Claude wording for Anthropic-classified errors', () => {
    const result = toUserFacing(classifyAnthropicHttpError(401, null));
    expect(result.message).toBe('Claude API key is invalid.');
  });

  it('applies provider rewording to prototype-less copies too', () => {
    const wire = JSON.parse(JSON.stringify(toDebugPayload(classifyOpenRouterHttpError(402, null))));
    const result = toUserFacing(wire);
    expect(result.code).toBe('CG-API-02');
    expect(result.message).toBe('OpenRouter balance is insufficient.');
  });

  it.each(['rate_limit_exceeded', 'rate_limit'])(
    'uses throttling wording for kernel 429 code %s',
    (kernelCode) => {
      const result = toUserFacing(
        new CgError('CG-HUB-02', {
          message: 'Too many requests',
          detail: { status: 429, kernelCode },
        }),
      );
      expect(result.message).toBe('Agency Hub is rate-limiting requests.');
      expect(result.recovery).toContain('not an outage');
      expect(result.detailText).toBe('Too many requests');
    },
  );

  it('applies canonical kernel rate-limit wording to a prototype-less copy', () => {
    const wire = JSON.parse(
      JSON.stringify(
        toDebugPayload(
          new CgError('CG-HUB-02', {
            message: 'Too many requests',
            detail: { status: 429, kernelCode: 'rate_limit_exceeded' },
          }),
        ),
      ),
    );
    const result = toUserFacing(wire);
    expect(result.message).toBe('Agency Hub is rate-limiting requests.');
    expect(result.recovery).toContain('not an outage');
  });
});

// Legacy errors.test.ts: getErrorMessage facts.
describe('describeError', () => {
  it('returns the ping-blocked wording', () => {
    expect(describeError('CG-FLOW-05').message).toContain('still active');
  });

  it('marks the unmapped-account error with a settings link', () => {
    expect(describeError('CG-FLOW-02').settingsLink).toBe(true);
  });
});

// Legacy anthropic-client.test.ts error-mapping facts (Bug 8).
describe('classifyAnthropicHttpError', () => {
  it('maps 401 to CG-AUTH-02', () => {
    expect(classifyAnthropicHttpError(401, null).code).toBe('CG-AUTH-02');
  });

  it('maps 403 to CG-AUTH-02', () => {
    expect(classifyAnthropicHttpError(403, null).code).toBe('CG-AUTH-02');
  });

  it('maps 429 to CG-API-01', () => {
    expect(classifyAnthropicHttpError(429, null).code).toBe('CG-API-01');
  });

  it('maps 500 to CG-API-05', () => {
    expect(classifyAnthropicHttpError(500, null).code).toBe('CG-API-05');
  });

  it('maps 400 with not_found_error to CG-API-03 (model unavailable)', () => {
    const err = classifyAnthropicHttpError(400, { type: 'not_found_error', message: 'model not found' });
    expect(err.code).toBe('CG-API-03');
  });

  it('maps 400 with a non-model error to CG-APP-01, not CG-NET-01 (legacy Bug 8)', () => {
    const err = classifyAnthropicHttpError(400, {
      type: 'invalid_request_error',
      message: 'max_tokens: must be positive',
    });
    expect(err.code).toBe('CG-APP-01');
  });

  it('does not classify a non-model "not found" message as model unavailable', () => {
    const err = classifyAnthropicHttpError(400, {
      type: 'invalid_request_error',
      message: 'requested resource was not found',
    });
    expect(err.code).toBe('CG-APP-01');
  });

  it('does not classify a generic "billing" message as insufficient balance', () => {
    const err = classifyAnthropicHttpError(400, {
      type: 'invalid_request_error',
      message: 'update your billing address',
    });
    expect(err.code).toBe('CG-APP-01');
  });

  it('maps 400 with no parseable body to CG-APP-01', () => {
    expect(classifyAnthropicHttpError(400, null).code).toBe('CG-APP-01');
  });

  it('maps an unrecognized non-ok status to CG-NET-01', () => {
    expect(classifyAnthropicHttpError(418, null).code).toBe('CG-NET-01');
  });

  it('maps rate_limit_error type and "rate limit" message without 429 status', () => {
    expect(classifyAnthropicHttpError(400, { type: 'rate_limit_error' }).code).toBe('CG-API-01');
    expect(classifyAnthropicHttpError(400, { message: 'Rate limit exceeded' }).code).toBe('CG-API-01');
  });

  it('maps balance phrases and types to CG-API-02', () => {
    expect(classifyAnthropicHttpError(400, { type: 'insufficient_balance_error' }).code).toBe('CG-API-02');
    expect(
      classifyAnthropicHttpError(400, { message: 'Your credit balance is too low to access the API' }).code,
    ).toBe('CG-API-02');
  });

  it('maps 413, context types, and context phrases to CG-API-04', () => {
    expect(classifyAnthropicHttpError(413, null).code).toBe('CG-API-04');
    expect(classifyAnthropicHttpError(400, { type: 'context_window_exceeded_error' }).code).toBe('CG-API-04');
    expect(classifyAnthropicHttpError(400, { message: 'prompt is too long: 250000 tokens' }).code).toBe('CG-API-04');
  });

  it('maps overloaded_error and 529 to CG-API-05', () => {
    expect(classifyAnthropicHttpError(400, { type: 'overloaded_error' }).code).toBe('CG-API-05');
    expect(classifyAnthropicHttpError(529, null).code).toBe('CG-API-05');
  });

  it('maps status 0 (no response) to CG-API-05', () => {
    expect(classifyAnthropicHttpError(0, null).code).toBe('CG-API-05');
  });

  it('carries status, provider message, and retry timing in detail', () => {
    const before = Date.now();
    const err = classifyAnthropicHttpError(429, { message: 'Rate limited' }, 7000);
    expect(err.detail?.status).toBe(429);
    expect(err.detail?.providerMessage).toBe('Rate limited');
    expect(err.retryAfterMs).toBe(7000);
    expect(err.retryAtMs).toBeGreaterThanOrEqual(before + 7000);
    expect(err.detail?.provider).toBe('anthropic');
  });

  it('omits status from detail when status is 0', () => {
    expect(classifyAnthropicHttpError(0, null).detail?.status).toBeUndefined();
  });
});

describe('classifyOpenRouterHttpError', () => {
  it('tags detail with the openrouter provider', () => {
    expect(classifyOpenRouterHttpError(429, null).detail?.provider).toBe('openrouter');
  });

  it('maps 429 status, "429" code, and rate-limit message to CG-API-01', () => {
    expect(classifyOpenRouterHttpError(429, null).code).toBe('CG-API-01');
    expect(classifyOpenRouterHttpError(400, { code: 429 }).code).toBe('CG-API-01');
    expect(classifyOpenRouterHttpError(400, { message: 'rate limit exceeded' }).code).toBe('CG-API-01');
  });

  it('maps 402, "402" code, and balance phrases to CG-API-02', () => {
    expect(classifyOpenRouterHttpError(402, null).code).toBe('CG-API-02');
    expect(classifyOpenRouterHttpError(400, { code: '402' }).code).toBe('CG-API-02');
    expect(classifyOpenRouterHttpError(400, { message: 'Insufficient credits remaining' }).code).toBe('CG-API-02');
  });

  it('maps 401/403 statuses and codes to CG-AUTH-02', () => {
    expect(classifyOpenRouterHttpError(401, null).code).toBe('CG-AUTH-02');
    expect(classifyOpenRouterHttpError(403, null).code).toBe('CG-AUTH-02');
    expect(classifyOpenRouterHttpError(400, { code: '401' }).code).toBe('CG-AUTH-02');
  });

  it('maps 404 and model phrases to CG-API-03', () => {
    expect(classifyOpenRouterHttpError(404, null).code).toBe('CG-API-03');
    expect(classifyOpenRouterHttpError(400, { message: 'foo is not a valid model' }).code).toBe('CG-API-03');
  });

  it('does not classify a generic "billing" message as insufficient balance', () => {
    expect(classifyOpenRouterHttpError(400, { message: 'update your billing address' }).code).toBe('CG-APP-01');
  });

  it('does not classify a non-model "not found" message as model unavailable', () => {
    expect(classifyOpenRouterHttpError(400, { message: 'requested resource was not found' }).code).toBe('CG-APP-01');
  });

  it('maps 413 and context phrases to CG-API-04', () => {
    expect(classifyOpenRouterHttpError(413, null).code).toBe('CG-API-04');
    expect(classifyOpenRouterHttpError(400, { message: 'maximum context exceeded' }).code).toBe('CG-API-04');
  });

  it('maps 5xx and status 0 to CG-API-05', () => {
    expect(classifyOpenRouterHttpError(502, null).code).toBe('CG-API-05');
    expect(classifyOpenRouterHttpError(503, null).code).toBe('CG-API-05');
    expect(classifyOpenRouterHttpError(0, null).code).toBe('CG-API-05');
  });

  it('maps unmatched 400 to CG-APP-01 and unrecognized statuses to CG-NET-01', () => {
    expect(classifyOpenRouterHttpError(400, null).code).toBe('CG-APP-01');
    expect(classifyOpenRouterHttpError(418, null).code).toBe('CG-NET-01');
  });
});

describe('user-facing helpers', () => {
  it('formats code-prefixed display strings', () => {
    expect(formatUserFacing(describeError('CG-APP-01'))).toBe('CG-APP-01: Something went wrong.');
  });

  it('createUserFacing applies overrides without touching the registry', () => {
    const result = createUserFacing('CG-NET-02', { recovery: 'Retry the summary.' });
    expect(result.recovery).toBe('Retry the summary.');
    expect(describeError('CG-NET-02').recovery).toBe('The request took too long. Try again.');
  });

  it('isUserFacingError accepts registry output and rejects partial shapes', () => {
    expect(isUserFacingError(describeError('CG-OF-06'))).toBe(true);
    expect(isUserFacingError({ code: 'CG-OF-06', message: 'x' })).toBe(false);
    expect(isUserFacingError({ code: 'CG-XX-99', message: 'x', recovery: 'y' })).toBe(false);
    expect(isUserFacingError(null)).toBe(false);
  });

  it('toDebugPayload serializes a CgError with its detail and flags', () => {
    const err = new CgError('CG-API-01', { detail: { status: 429, provider: 'anthropic' }, isOptional: true });
    expect(toDebugPayload(err)).toEqual({
      code: 'CG-API-01',
      message: 'Rate limit reached.',
      isOptional: true,
      detail: { status: 429, provider: 'anthropic' },
    });
  });

  it('toDebugPayload passes non-CgError values through', () => {
    const value = { anything: true };
    expect(toDebugPayload(value)).toBe(value);
  });
});
