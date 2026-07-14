// Pure Hub-settings predicate (tested in tests/renderer/): kept outside
// HubSettings.tsx so vitest can prove the credential-precedence rule without
// mounting React (mirrors features/ai/dockLogic.ts's hasConfiguredAiTransport).

import { DEFAULT_AGENCY_HUB_BASE_URL } from '@chatgoose/shared';

export interface HubCredentialSettings {
  hubBaseUrl: string | null;
  hasHubKey: boolean;
  hubApiKeyBindingState: 'none' | 'bound' | 'unbound' | 'mismatch' | 'unreadable';
  hasHubDeviceToken: boolean;
  hubDeviceTokenBindingState: 'none' | 'bound' | 'unbound' | 'mismatch' | 'unreadable';
}

export function hasHubDeviceTokenCustody(input: {
  hasHubDeviceToken: boolean;
  hubDeviceTokenTransition: 'activation' | 'revocation' | null;
}): boolean {
  return input.hasHubDeviceToken || input.hubDeviceTokenTransition !== null;
}

export function hubDeviceTokenStatus(input: {
  hasHubDeviceToken: boolean;
  hubDeviceTokenBindingState: 'none' | 'bound' | 'unbound' | 'mismatch' | 'unreadable';
  hubDeviceTokenTransition: 'activation' | 'revocation' | null;
}): 'activation' | 'revocation' | 'configured' | 'attention' | 'unset' {
  // Revocation deliberately retains the active file until Core confirms the
  // exact bearer is dead. The durable transition is therefore authoritative
  // for UI state even while hasHubDeviceToken is still true.
  return input.hubDeviceTokenTransition
    ?? (input.hasHubDeviceToken
      ? input.hubDeviceTokenBindingState === 'bound' ? 'configured' : 'attention'
      : 'unset');
}

/**
 * Stage 24: the device token is the primary hub credential, the chatter key
 * a kernel-dual-acceptance fallback (device-token.ts resolveHubCredential).
 * Either one configures the hub — a token-only install must read the same
 * as a key-only one.
 */
export function isHubConfigured(settings: HubCredentialSettings): boolean {
  return settings.hubBaseUrl !== null && (
    settings.hubApiKeyBindingState === 'bound'
    || settings.hubDeviceTokenBindingState === 'bound'
  );
}

export function canIssueHubDeviceToken(input: {
  username: string;
  password: string;
  hasStoredDeviceToken: boolean;
  issuePending: boolean;
  signOutPending: boolean;
}): boolean {
  return (
    input.username.trim().length > 0 &&
    input.password.length > 0 &&
    !input.hasStoredDeviceToken &&
    !input.issuePending &&
    !input.signOutPending
  );
}

const PROD_HUB_ORIGIN = new URL(DEFAULT_AGENCY_HUB_BASE_URL).origin;
const LOOPBACK_HUB_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function normalizedHubUrl(raw: string | null): string | null | undefined {
  const trimmed = raw?.trim() ?? '';
  if (trimmed.length === 0) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    const isProdHub = parsed.origin === PROD_HUB_ORIGIN;
    const isLoopback = LOOPBACK_HUB_HOSTS.has(parsed.hostname);
    if (
      (!isProdHub && !isLoopback) ||
      (isProdHub && parsed.protocol !== 'https:') ||
      (isLoopback && parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
      (parsed.pathname !== '' && parsed.pathname !== '/') ||
      parsed.search !== '' ||
      parsed.hash !== ''
    ) {
      return undefined;
    }
    return parsed.origin;
  } catch {
    return undefined;
  }
}

/** Changing Hub origins while a device token is stored would orphan a live
 * remote credential. Main rejects the mutation; this predicate makes the
 * required sign-out visible before the user submits the form. */
export function hubUrlChangeRequiresDeviceSignOut(input: {
  draftHubBaseUrl: string;
  savedHubBaseUrl: string | null;
  hasStoredDeviceToken: boolean;
}): boolean {
  const draft = normalizedHubUrl(input.draftHubBaseUrl);
  // Invalid input belongs to the normal URL validator. Do not replace its
  // actionable error with a misleading request to sign out first.
  if (draft === undefined) {
    return false;
  }
  return (
    input.hasStoredDeviceToken &&
    draft !== normalizedHubUrl(input.savedHubBaseUrl)
  );
}
