import { describe, expect, it } from 'vitest';
import {
  canIssueHubDeviceToken,
  hasHubDeviceTokenCustody,
  hubDeviceTokenStatus,
  hubUrlChangeRequiresDeviceSignOut,
  isHubConfigured,
  requiresSignIn,
} from '../../src/renderer/src/features/settings/sections/hubSettingsLogic';

describe('hasHubDeviceTokenCustody', () => {
  it('keeps cancel/sign-out available for active and staged transitions', () => {
    expect(hasHubDeviceTokenCustody({
      hasHubDeviceToken: false,
      hubDeviceTokenTransition: null,
    })).toBe(false);
    expect(hasHubDeviceTokenCustody({
      hasHubDeviceToken: true,
      hubDeviceTokenTransition: null,
    })).toBe(true);
    expect(hasHubDeviceTokenCustody({
      hasHubDeviceToken: false,
      hubDeviceTokenTransition: 'activation',
    })).toBe(true);
    expect(hasHubDeviceTokenCustody({
      hasHubDeviceToken: false,
      hubDeviceTokenTransition: 'revocation',
    })).toBe(true);
  });

  it('prioritizes a durable revocation state over the retained active secret', () => {
    expect(hubDeviceTokenStatus({
      hasHubDeviceToken: true,
      hubDeviceTokenBindingState: 'bound',
      hubDeviceTokenTransition: 'revocation',
    })).toBe('revocation');
    expect(hubDeviceTokenStatus({
      hasHubDeviceToken: true,
      hubDeviceTokenBindingState: 'bound',
      hubDeviceTokenTransition: null,
    })).toBe('configured');
  });
});

describe('isHubConfigured', () => {
  it('the signed-in device credential configures the hub', () => {
    expect(
      isHubConfigured({
        hubBaseUrl: 'https://hub.example.com',
        hasHubDeviceToken: true,
        hubDeviceTokenBindingState: 'bound',
      }),
    ).toBe(true);
  });

  it('no credential leaves the hub unconfigured', () => {
    expect(
      isHubConfigured({
        hubBaseUrl: 'https://hub.example.com',
        hasHubDeviceToken: false,
        hubDeviceTokenBindingState: 'none',
      }),
    ).toBe(false);
  });

  it('no base URL leaves the hub unconfigured even when signed in', () => {
    expect(isHubConfigured({
      hubBaseUrl: null,
      hasHubDeviceToken: true,
      hubDeviceTokenBindingState: 'bound',
    })).toBe(false);
  });

  it('quarantines a credential whose saved Hub origin is not proven', () => {
    expect(isHubConfigured({
      hubBaseUrl: 'https://hub.example.com',
      hasHubDeviceToken: true,
      hubDeviceTokenBindingState: 'mismatch',
    })).toBe(false);
  });
});

describe('requiresSignIn (D35 first-run gate)', () => {
  it('shows the sign-in screen only with no device custody at all', () => {
    expect(requiresSignIn('unset')).toBe(true);
    expect(requiresSignIn('configured')).toBe(false);
    expect(requiresSignIn('activation')).toBe(false);
    expect(requiresSignIn('revocation')).toBe(false);
    // Quarantined custody keeps the Account section's recovery affordances —
    // a sign-in screen there would offer a second credential it must refuse.
    expect(requiresSignIn('attention')).toBe(false);
  });

  it('follows hubDeviceTokenStatus through every custody shape', () => {
    const gate = (input: Parameters<typeof hubDeviceTokenStatus>[0]): boolean =>
      requiresSignIn(hubDeviceTokenStatus(input));
    expect(gate({
      hasHubDeviceToken: false,
      hubDeviceTokenBindingState: 'none',
      hubDeviceTokenTransition: null,
    })).toBe(true);
    expect(gate({
      hasHubDeviceToken: true,
      hubDeviceTokenBindingState: 'bound',
      hubDeviceTokenTransition: null,
    })).toBe(false);
    expect(gate({
      hasHubDeviceToken: true,
      hubDeviceTokenBindingState: 'unbound',
      hubDeviceTokenTransition: null,
    })).toBe(false);
    expect(gate({
      hasHubDeviceToken: false,
      hubDeviceTokenBindingState: 'none',
      hubDeviceTokenTransition: 'activation',
    })).toBe(false);
  });
});

describe('canIssueHubDeviceToken', () => {
  it('requires credentials and permits the first idle sign-in', () => {
    expect(canIssueHubDeviceToken({
      username: 'operator',
      password: 'secret',
      hasStoredDeviceToken: false,
      issuePending: false,
      signOutPending: false,
    })).toBe(true);
  });

  it('blocks replacement and overlapping credential mutations', () => {
    const ready = {
      username: 'operator',
      password: 'secret',
      hasStoredDeviceToken: false,
      issuePending: false,
      signOutPending: false,
    };
    expect(canIssueHubDeviceToken({ ...ready, hasStoredDeviceToken: true })).toBe(false);
    expect(canIssueHubDeviceToken({ ...ready, issuePending: true })).toBe(false);
    expect(canIssueHubDeviceToken({ ...ready, signOutPending: true })).toBe(false);
  });
});

describe('hubUrlChangeRequiresDeviceSignOut', () => {
  it('blocks a different or cleared Hub origin while a device token is stored', () => {
    const savedHubBaseUrl = 'https://gosling-agency.ru';
    expect(hubUrlChangeRequiresDeviceSignOut({
      draftHubBaseUrl: 'http://localhost:4000',
      savedHubBaseUrl,
      hasStoredDeviceToken: true,
    })).toBe(true);
    expect(hubUrlChangeRequiresDeviceSignOut({
      draftHubBaseUrl: '',
      savedHubBaseUrl,
      hasStoredDeviceToken: true,
    })).toBe(true);
  });

  it('allows equivalent normalized URLs and any change after sign-out', () => {
    expect(hubUrlChangeRequiresDeviceSignOut({
      draftHubBaseUrl: 'https://gosling-agency.ru/',
      savedHubBaseUrl: 'https://gosling-agency.ru',
      hasStoredDeviceToken: true,
    })).toBe(false);
    expect(hubUrlChangeRequiresDeviceSignOut({
      draftHubBaseUrl: 'http://localhost:4000',
      savedHubBaseUrl: 'https://gosling-agency.ru',
      hasStoredDeviceToken: false,
    })).toBe(false);
    expect(hubUrlChangeRequiresDeviceSignOut({
      draftHubBaseUrl: 'https://evil.example.com/path',
      savedHubBaseUrl: 'https://gosling-agency.ru',
      hasStoredDeviceToken: true,
    })).toBe(false);
  });
});
