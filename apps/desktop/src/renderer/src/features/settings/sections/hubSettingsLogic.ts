// Pure Hub-settings predicate (tested in tests/renderer/): kept outside
// HubSettings.tsx so vitest can prove the credential-precedence rule without
// mounting React (mirrors features/ai/dockLogic.ts's hasConfiguredAiTransport).

import { DEFAULT_AGENCY_HUB_BASE_URL } from '@chatgoose/shared';

export interface HubCredentialSettings {
  hubBaseUrl: string | null;
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
 * D35: the bound device credential of this machine is the only hub credential
 * there is — an install is configured exactly when it is signed in.
 */
export function isHubConfigured(settings: HubCredentialSettings): boolean {
  return settings.hubBaseUrl !== null
    && settings.hubDeviceTokenBindingState === 'bound';
}

/**
 * D35 §9: the first-run gate. ONLY a machine with no device custody at all
 * sees the sign-in screen — a settling activation/revocation keeps the
 * workspace (with its banner), a quarantined credential keeps the existing
 * Account-section recovery, and an unreachable hub is a status, not a
 * sign-out. A wipe (expired/revoked) turns custody into 'unset' first, which
 * is what brings the screen up with its banner.
 */
export function requiresSignIn(
  status: 'activation' | 'revocation' | 'configured' | 'attention' | 'unset',
): boolean {
  return status === 'unset';
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
