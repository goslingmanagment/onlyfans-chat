import { describe, expect, it } from 'vitest';
import { isHubConfigured } from '../../src/renderer/src/features/settings/sections/hubSettingsLogic';

describe('isHubConfigured', () => {
  it('a legacy chatter key alone configures the hub', () => {
    expect(
      isHubConfigured({
        hubBaseUrl: 'https://hub.example.com',
        hasHubKey: true,
        hasHubDeviceToken: false,
      }),
    ).toBe(true);
  });

  it('a device token ALONE configures the hub (no legacy key needed)', () => {
    expect(
      isHubConfigured({
        hubBaseUrl: 'https://hub.example.com',
        hasHubKey: false,
        hasHubDeviceToken: true,
      }),
    ).toBe(true);
  });

  it('neither credential leaves the hub unconfigured', () => {
    expect(
      isHubConfigured({
        hubBaseUrl: 'https://hub.example.com',
        hasHubKey: false,
        hasHubDeviceToken: false,
      }),
    ).toBe(false);
  });

  it('no base URL leaves the hub unconfigured even with a credential', () => {
    expect(isHubConfigured({ hubBaseUrl: null, hasHubKey: true, hasHubDeviceToken: false })).toBe(
      false,
    );
    expect(isHubConfigured({ hubBaseUrl: null, hasHubKey: false, hasHubDeviceToken: true })).toBe(
      false,
    );
  });
});
