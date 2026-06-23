import { messageGuardPolicySchema } from './schema';
import { normalizeWithMap } from './normalize';
import type {
  CompiledGuardRule,
  CompiledGuardWhitelist,
  CompiledMessageGuardPolicy,
  GuardAction,
  GuardRule,
  MessageGuardPolicy,
  TrieNode,
} from './types';

function createNode(): TrieNode {
  return { children: new Map<string, TrieNode>(), outputs: [] };
}

function effectiveAction(rule: GuardRule, policy: MessageGuardPolicy): GuardAction {
  if (rule.category === 'yellow') return policy.yellowMode === 'block' ? 'block' : rule.action;
  if (rule.category === 'custom' && rule.action === 'allow') return policy.customDefaultAction;
  return rule.action;
}

function insert(root: TrieNode, rule: CompiledGuardRule): void {
  let node = root;
  for (const ch of rule.term) {
    let next = node.children.get(ch);
    if (next === undefined) {
      next = createNode();
      node.children.set(ch, next);
    }
    node = next;
  }
  node.outputs.push(rule);
}

export function compileGuard(policyInput: MessageGuardPolicy): CompiledMessageGuardPolicy {
  const policy = messageGuardPolicySchema.parse(policyInput);
  const trie = createNode();
  for (const rule of policy.rules) {
    if (!rule.enabled || rule.kind === 'structural') continue;
    const term = normalizeWithMap(rule.value, true).text;
    if (term.length === 0) continue;
    insert(trie, {
      id: rule.id,
      category: rule.category,
      action: effectiveAction(rule, policy),
      label: rule.label,
      reasonKey: rule.reasonKey,
      term,
      allowInsideWords: rule.allowInsideWords ?? false,
    });
  }
  const whitelist: CompiledGuardWhitelist[] = policy.whitelist
    .filter((entry) => entry.enabled)
    .map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      value: entry.value,
      normalized: normalizeWithMap(entry.value, true).text,
      enabled: entry.enabled,
    }))
    .filter((entry) => entry.normalized.length > 0);
  return { policy, trie, whitelist };
}
