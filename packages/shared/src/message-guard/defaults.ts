import type { GuardStructuralSettings, MessageGuardPolicy } from './types';

export const MESSAGE_GUARD_BUILTIN_VERSION = 'mg-builtin-2026-06-23';

export const DEFAULT_GUARD_STRUCTURAL: GuardStructuralSettings = {
  url: true,
  domain: true,
  email: true,
  phone: true,
  wallet: true,
  handle: true,
  altPay: true,
};

export const BUILTIN_MESSAGE_GUARD_POLICY: MessageGuardPolicy = {
  version: MESSAGE_GUARD_BUILTIN_VERSION,
  builtInVersion: MESSAGE_GUARD_BUILTIN_VERSION,
  source: 'builtin+local',
  yellowMode: 'block',
  customDefaultAction: 'block',
  blockBareHandles: true,
  structural: DEFAULT_GUARD_STRUCTURAL,
  rules: [
    {
      id: 'builtin-red-placeholder-owner-todo',
      category: 'red',
      action: 'block',
      label: 'TODO(owner): red ToS term seed',
      reasonKey: 'guard.reason.red',
      kind: 'term',
      value: '__message_guard_owner_red_term_placeholder__',
      enabled: false,
    },
    {
      id: 'builtin-yellow-placeholder-owner-todo',
      category: 'yellow',
      action: 'block',
      label: 'TODO(owner): yellow review term seed',
      reasonKey: 'guard.reason.yellow',
      kind: 'term',
      value: '__message_guard_owner_yellow_term_placeholder__',
      enabled: false,
    },
  ],
  whitelist: [
    {
      id: 'builtin-onlyfans-domain',
      kind: 'domain',
      value: 'onlyfans.com',
      reason: 'First-party platform domain',
      enabled: true,
    },
  ],
};

// Temporary owner-requested kill switch (2026-06-24): keep the saved policy
// intact, but make runtime/renderer enforcement a no-op until the guard is
// tuned enough for chatter shifts.
export const MESSAGE_GUARD_ENFORCEMENT_ENABLED = false;
export const MESSAGE_GUARD_DISABLED_POLICY_VERSION = 'mg-disabled-2026-06-24';

export const DISABLED_MESSAGE_GUARD_POLICY: MessageGuardPolicy = {
  ...BUILTIN_MESSAGE_GUARD_POLICY,
  version: MESSAGE_GUARD_DISABLED_POLICY_VERSION,
  yellowMode: 'warn',
  customDefaultAction: 'allow',
  blockBareHandles: false,
  structural: {
    url: false,
    domain: false,
    email: false,
    phone: false,
    wallet: false,
    handle: false,
    altPay: false,
  },
  rules: BUILTIN_MESSAGE_GUARD_POLICY.rules.map((rule) => ({
    ...rule,
    enabled: false,
  })),
};

export function effectiveMessageGuardPolicy(policy: MessageGuardPolicy): MessageGuardPolicy {
  return MESSAGE_GUARD_ENFORCEMENT_ENABLED ? policy : DISABLED_MESSAGE_GUARD_POLICY;
}
