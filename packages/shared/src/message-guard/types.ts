export type GuardCategory = 'off_platform' | 'red' | 'yellow' | 'custom';
export type GuardAction = 'block' | 'warn' | 'allow';
export type GuardDecision = 'allow' | 'warn' | 'block';
export type GuardPolicySource = 'builtin+local' | 'core';
export type GuardYellowMode = 'block' | 'warn';
export type GuardRuleKind = 'term' | 'phrase' | 'regex' | 'structural';
export type GuardWhitelistKind = 'term' | 'domain' | 'email' | 'phone' | 'handle' | 'regex';

export interface GuardStructuralSettings {
  url: boolean;
  domain: boolean;
  email: boolean;
  phone: boolean;
  wallet: boolean;
  handle: boolean;
  altPay: boolean;
}

export interface GuardRule {
  id: string;
  category: GuardCategory;
  action: GuardAction;
  label: string;
  reasonKey: string;
  kind: GuardRuleKind;
  value: string;
  enabled: boolean;
  allowInsideWords?: boolean | undefined;
}

export interface GuardWhitelistRule {
  id: string;
  kind: GuardWhitelistKind;
  value: string;
  reason: string;
  enabled: boolean;
}

export interface MessageGuardPolicy {
  version: string;
  builtInVersion: string;
  source: GuardPolicySource;
  yellowMode: GuardYellowMode;
  customDefaultAction: GuardAction;
  blockBareHandles: boolean;
  structural: GuardStructuralSettings;
  rules: GuardRule[];
  whitelist: GuardWhitelistRule[];
}

export interface GuardSpan {
  start: number;
  end: number;
  category: GuardCategory;
  action: GuardAction;
  ruleId: string;
  ruleLabel: string;
  reasonKey: string;
  matchedOriginal: string;
  matchedNormalized: string;
}

export interface GuardVerdict {
  decision: GuardDecision;
  spans: GuardSpan[];
  policyVersion: string;
  builtInVersion: string;
}

export interface GuardAuditEvent {
  id: string;
  occurredAt: string;
  actorUserId: string | null;
  actorLabel: string | null;
  accountId: string;
  chatId: string;
  surface: string;
  transport: string | null;
  decision: 'blocked' | 'warned' | 'sent_after_warning';
  policyVersion: string;
  category: GuardCategory;
  ruleId: string;
  ruleLabel: string;
  matchedOriginal: string;
  matchedNormalized: string;
  spanStart: number;
  spanEnd: number;
  messageText: string;
  messageHash: string;
  mediaCount: number;
  price: number;
}

export interface MappedChar {
  ch: string;
  srcStart: number;
  srcEnd: number;
}

export interface MappedText {
  text: string;
  units: MappedChar[];
}

export interface CompiledGuardRule {
  id: string;
  category: GuardCategory;
  action: GuardAction;
  label: string;
  reasonKey: string;
  term: string;
  allowInsideWords: boolean;
}

export interface CompiledGuardWhitelist {
  id: string;
  kind: GuardWhitelistKind;
  value: string;
  normalized: string;
  enabled: boolean;
}

export interface TrieNode {
  children: Map<string, TrieNode>;
  outputs: CompiledGuardRule[];
}

export interface CompiledMessageGuardPolicy {
  policy: MessageGuardPolicy;
  trie: TrieNode;
  whitelist: CompiledGuardWhitelist[];
}
