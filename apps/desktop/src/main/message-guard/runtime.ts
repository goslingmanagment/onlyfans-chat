import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  BUILTIN_MESSAGE_GUARD_POLICY,
  CgError,
  compileGuard,
  effectiveMessageGuardPolicy,
  messageGuardPolicySchema,
  scanText,
  type CompiledMessageGuardPolicy,
  type GuardVerdict,
  type MessageGuardPolicy,
} from '@chatgoose/shared';
import type { DataLayer, MessageGuardBlocksReport } from '../db/index';
import type { Logger } from '../diagnostics/logger';

const POLICY_KEY = 'messageGuardPolicy';
// Stage 4 stop-loss: effectively disabled (10 y) — guard-audit rows are the
// send-safety evidence trail; prune machinery kept, horizon raised.
const TTL_MS = 3650 * 24 * 60 * 60 * 1000;
const LONG_SCAN_MS = 16;

export interface MessageGuardAssertArgs {
  accountId: string;
  chatId: string;
  text: string;
  surface: string;
  transport: string | null;
  mediaCount?: number;
  price?: number;
}

export interface MessageGuardRuntime {
  getPolicy(): MessageGuardPolicy;
  updatePolicy(policy: MessageGuardPolicy): MessageGuardPolicy;
  scan(text: string): GuardVerdict;
  assertAllowed(args: MessageGuardAssertArgs): void;
  blocks(args?: { accountId?: string; limit?: number }): MessageGuardBlocksReport;
  pruneExpired(): number;
}

function hashMessage(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function nowIso(): string {
  return new Date().toISOString();
}

function cutoffIso(): string {
  return new Date(Date.now() - TTL_MS).toISOString();
}

function errorFromPolicyUnavailable(): CgError {
  return new CgError('CG-GUARD-02', {
    detail: { provider: 'message-guard' },
  });
}

function errorFromBlock(verdict: GuardVerdict): CgError {
  return new CgError('CG-GUARD-01', {
    detail: {
      provider: 'message-guard',
      policyVersion: verdict.policyVersion,
      guardSpans: verdict.spans.map((span) => ({
        start: span.start,
        end: span.end,
        category: span.category,
        ruleId: span.ruleId,
        ruleLabel: span.ruleLabel,
      })),
    },
  });
}

export function createMessageGuardRuntime(options: {
  data: DataLayer;
  logger?: Logger;
}): MessageGuardRuntime {
  const { data, logger } = options;
  let compiled: CompiledMessageGuardPolicy | null = null;
  let compiledKey: string | null = null;

  function readPolicyCandidate(): unknown {
    try {
      return data.settings.get(POLICY_KEY) ?? BUILTIN_MESSAGE_GUARD_POLICY;
    } catch (error) {
      logger?.warn('message-guard', 'failed to read guard policy', {
        message: error instanceof Error ? error.message : String(error),
      });
      return BUILTIN_MESSAGE_GUARD_POLICY;
    }
  }

  function compileCurrent(): CompiledMessageGuardPolicy {
    const parsed = messageGuardPolicySchema.safeParse(readPolicyCandidate());
    if (!parsed.success) {
      logger?.warn('message-guard', 'invalid guard policy; keeping last known policy', {
        issues: parsed.error.issues.length,
      });
      if (compiled !== null) return compiled;
      throw errorFromPolicyUnavailable();
    }
    const policy = effectiveMessageGuardPolicy(parsed.data);
    const key = `${policy.version}|${policy.builtInVersion}|${JSON.stringify(policy)}`;
    if (compiled !== null && compiledKey === key) return compiled;
    try {
      compiled = compileGuard(policy);
      compiledKey = key;
      return compiled;
    } catch (error) {
      logger?.warn('message-guard', 'failed to compile guard policy; keeping last known policy', {
        message: error instanceof Error ? error.message : String(error),
      });
      if (compiled !== null) return compiled;
      throw errorFromPolicyUnavailable();
    }
  }

  function timedScan(text: string): GuardVerdict {
    const started = performance.now();
    const verdict = scanText(compileCurrent(), text.slice(0, 20_000));
    const elapsedMs = performance.now() - started;
    const debugMode = data.settings.getParsed('debugMode', z.boolean());
    if (debugMode === true || elapsedMs >= LONG_SCAN_MS) {
      logger?.debug('message-guard', 'scanText duration', {
        elapsedMs: Math.round(elapsedMs * 100) / 100,
        chars: text.length,
        decision: verdict.decision,
      });
    }
    return verdict;
  }

  function audit(args: MessageGuardAssertArgs, verdict: GuardVerdict, decision: 'blocked' | 'warned'): void {
    if (verdict.spans.length === 0) return;
    const occurredAt = nowIso();
    const messageHash = hashMessage(args.text);
    for (const span of verdict.spans) {
      data.messageGuardEvents.insert({
        id: randomUUID(),
        occurredAt,
        actorUserId: null,
        actorLabel: null,
        accountId: args.accountId,
        chatId: args.chatId,
        surface: args.surface,
        transport: args.transport,
        decision,
        policyVersion: verdict.policyVersion,
        category: span.category,
        ruleId: span.ruleId,
        ruleLabel: span.ruleLabel,
        matchedOriginal: span.matchedOriginal,
        matchedNormalized: span.matchedNormalized,
        spanStart: span.start,
        spanEnd: span.end,
        messageText: args.text,
        messageHash,
        mediaCount: args.mediaCount ?? 0,
        price: args.price ?? 0,
      });
    }
    data.messageGuardEvents.pruneOlderThan(cutoffIso());
  }

  return {
    getPolicy() {
      return compileCurrent().policy;
    },

    updatePolicy(policy) {
      const parsed = messageGuardPolicySchema.parse(policy);
      data.settings.set(POLICY_KEY, parsed);
      const effective = effectiveMessageGuardPolicy(parsed);
      compiled = compileGuard(effective);
      compiledKey = `${effective.version}|${effective.builtInVersion}|${JSON.stringify(effective)}`;
      data.bus.publish({ scope: 'guard' });
      return effective;
    },

    scan(text) {
      return timedScan(text);
    },

    assertAllowed(args) {
      const verdict = timedScan(args.text);
      if (verdict.decision === 'block') {
        audit(args, verdict, 'blocked');
        throw errorFromBlock(verdict);
      }
      if (verdict.decision === 'warn') {
        audit(args, verdict, 'warned');
      }
    },

    blocks(args) {
      return data.messageGuardEvents.report(args);
    },

    pruneExpired() {
      return data.messageGuardEvents.pruneOlderThan(cutoffIso());
    },
  };
}
