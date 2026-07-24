import { describe, expect, it } from 'vitest';
import {
  CG_ERROR_CODES,
  CG_ERROR_REGISTRY,
  CgError,
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
      'CG-HUB-03',
      'CG-HUB-04',
      'CG-HUB-05',
      'CG-HUB-06',
      'CG-HUB-07',
      'CG-HUB-08',
      'CG-HUB-09',
      'CG-HUB-10',
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

  it('gives terminal provider failures manager-action recovery instead of retry advice', () => {
    for (const code of ['CG-HUB-04', 'CG-HUB-05', 'CG-HUB-08', 'CG-HUB-10'] as const) {
      expect(CG_ERROR_REGISTRY[code].recovery, code).toMatch(/manager/i);
      expect(CG_ERROR_REGISTRY[code].recovery, code).toMatch(/retrying will not help|do not keep retrying/i);
    }
  });

  it('keeps temporary provider and interrupted-stream recovery manual and honest', () => {
    expect(CG_ERROR_REGISTRY['CG-HUB-06'].recovery).toMatch(/retrying manually/i);
    expect(CG_ERROR_REGISTRY['CG-HUB-07'].recovery).toMatch(/retry manually later/i);
    expect(CG_ERROR_REGISTRY['CG-HUB-09'].recovery).toMatch(/no result was shown/i);
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

  it('turns retryAfterMs into one absolute deadline when no deadline was supplied', () => {
    const before = Date.now();
    const err = new CgError('CG-HUB-06', { retryAfterMs: 7000 });
    const after = Date.now();
    expect(err.retryAtMs).toBeGreaterThanOrEqual(before + 7000);
    expect(err.retryAtMs).toBeLessThanOrEqual(after + 7000);
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
    const result = toUserFacing(new CgError('CG-AUTH-02', { detail: { provider: 'openrouter' } }));
    expect(result.code).toBe('CG-AUTH-02');
    expect(result.message).toBe('OpenRouter API key is invalid.');
    expect(result.recovery).toContain('OpenRouter');
  });

  it('keeps Claude wording for Anthropic-classified errors', () => {
    const result = toUserFacing(new CgError('CG-AUTH-02', { detail: { provider: 'anthropic' } }));
    expect(result.message).toBe('Claude API key is invalid.');
  });

  it('applies provider rewording to prototype-less copies too', () => {
    const wire = JSON.parse(
      JSON.stringify(
        toDebugPayload(new CgError('CG-API-02', { detail: { provider: 'openrouter' } })),
      ),
    );
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
