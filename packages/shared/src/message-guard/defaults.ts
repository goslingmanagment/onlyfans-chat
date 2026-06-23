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
