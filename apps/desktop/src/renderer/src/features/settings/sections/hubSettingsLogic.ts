// Pure Hub-settings predicate (tested in tests/renderer/): kept outside
// HubSettings.tsx so vitest can prove the credential-precedence rule without
// mounting React (mirrors features/ai/dockLogic.ts's hasConfiguredAiTransport).

export interface HubCredentialSettings {
  hubBaseUrl: string | null;
  hasHubKey: boolean;
  hasHubDeviceToken: boolean;
}

/**
 * Stage 24: the device token is the primary hub credential, the chatter key
 * a kernel-dual-acceptance fallback (device-token.ts resolveHubCredential).
 * Either one configures the hub — a token-only install must read the same
 * as a key-only one.
 */
export function isHubConfigured(settings: HubCredentialSettings): boolean {
  return settings.hubBaseUrl !== null && (settings.hasHubKey || settings.hasHubDeviceToken);
}
