// D35 §9 п.3: the first-run screen's decision surface — when it appears, when
// it can submit, and what a chatter reads on each failure. The component is
// JSX-only glue over these predicates (vitest here runs without a DOM).

import { describe, expect, it } from 'vitest';
import { createUserFacing } from '@chatgoose/shared/errors/index';
import { uiMessage } from '@chatgoose/shared/i18n/index';
import { signInOutcome } from '../../src/renderer/src/features/auth/signInLogic';
import { HELP_SIGN_IN_URL } from '../../src/renderer/src/features/auth/links';
import {
  canIssueHubDeviceToken,
  hubDeviceTokenStatus,
  requiresSignIn,
} from '../../src/renderer/src/features/settings/sections/hubSettingsLogic';

type Custody = Parameters<typeof hubDeviceTokenStatus>[0];

const NO_CUSTODY: Custody = {
  hasHubDeviceToken: false,
  hubDeviceTokenBindingState: 'none',
  hubDeviceTokenTransition: null,
};

describe('the first-run gate (§9 state model)', () => {
  it('a fresh install with no credentials lands on the sign-in screen', () => {
    expect(requiresSignIn(hubDeviceTokenStatus(NO_CUSTODY))).toBe(true);
  });

  it('a signed-in install goes straight to the workspace', () => {
    expect(requiresSignIn(hubDeviceTokenStatus({
      hasHubDeviceToken: true,
      hubDeviceTokenBindingState: 'bound',
      hubDeviceTokenTransition: null,
    }))).toBe(false);
  });

  it('a settling sign-in/sign-out keeps the workspace (banner, not a screen)', () => {
    for (const transition of ['activation', 'revocation'] as const) {
      const status = hubDeviceTokenStatus({ ...NO_CUSTODY, hubDeviceTokenTransition: transition });
      expect(status).toBe(transition);
      expect(requiresSignIn(status)).toBe(false);
    }
  });

  it('quarantined custody keeps the workspace and its Account-section recovery', () => {
    for (const binding of ['unbound', 'mismatch', 'unreadable'] as const) {
      const status = hubDeviceTokenStatus({
        hasHubDeviceToken: true,
        hubDeviceTokenBindingState: binding,
        hubDeviceTokenTransition: null,
      });
      expect(status).toBe('attention');
      expect(requiresSignIn(status)).toBe(false);
    }
  });

  it('a wipe on a revoked/expired credential arrives as no custody plus a reason', () => {
    // What main leaves behind after the self-healing dispatcher runs: custody
    // gone (so the gate fires) and a non-secret reason for the banner.
    const afterWipe = { ...NO_CUSTODY, hubSignedOutReason: 'token_revoked' as const };
    expect(requiresSignIn(hubDeviceTokenStatus(afterWipe))).toBe(true);
    expect(afterWipe.hubSignedOutReason).not.toBeNull();
    // The banner never names the mechanism — both reasons read the same.
    expect(uiMessage('ru', 'auth.signedOut')).toBe('Сессия на этом устройстве завершена, войдите снова.');
  });
});

describe('sign-in submission', () => {
  const ready = {
    username: 'grisha',
    password: 'secret',
    hasStoredDeviceToken: false,
    issuePending: false,
    signOutPending: false,
  };

  it('needs both a login and a password', () => {
    expect(canIssueHubDeviceToken(ready)).toBe(true);
    expect(canIssueHubDeviceToken({ ...ready, username: '   ' })).toBe(false);
    expect(canIssueHubDeviceToken({ ...ready, password: '' })).toBe(false);
  });

  it('cannot double-submit while a sign-in or a settings save is in flight', () => {
    expect(canIssueHubDeviceToken({ ...ready, issuePending: true })).toBe(false);
    expect(canIssueHubDeviceToken({ ...ready, signOutPending: true })).toBe(false);
  });
});

describe('sign-in outcome', () => {
  it('is idle before the first attempt', () => {
    expect(signInOutcome({ data: undefined, isError: false })).toEqual({ kind: 'idle' });
  });

  it('reports success', () => {
    expect(signInOutcome({
      data: { ok: true, keyPrefix: 'p', label: 'Desktop · box', expiresAt: '2026-12-01T00:00:00.000Z' },
      isError: false,
    })).toEqual({ kind: 'signed-in' });
  });

  it('surfaces a refusal as data, with the code the screen localizes', () => {
    const error = createUserFacing('CG-HUB-20');
    expect(signInOutcome({ data: { ok: false, error }, isError: false }))
      .toEqual({ kind: 'failed', error });
  });

  it('keeps a transport failure distinct from a refusal', () => {
    expect(signInOutcome({ data: undefined, isError: true })).toEqual({ kind: 'unavailable' });
  });

  it('has Russian copy for every sign-in outcome a chatter can hit', () => {
    expect(uiMessage('ru', 'err.CG-HUB-20')).toMatch(/Неверный логин или пароль/);
    expect(uiMessage('ru', 'err.CG-HUB-21')).toMatch(/недоступен/);
    expect(uiMessage('ru', 'err.CG-HUB-22')).toMatch(/Вход не завершился/);
    expect(uiMessage('ru', 'err.CG-HUB-23')).toMatch(/владелец должен сбросить пароль/);
  });
});

describe('help link', () => {
  it('points at the one shared "how to start" page (plan §6.2)', () => {
    expect(HELP_SIGN_IN_URL).toBe('https://ext.gosling-agency.ru/start.html');
  });
});
