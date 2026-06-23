import { z } from 'zod';
import type {
  GuardAuditEvent,
  GuardSpan,
  GuardStructuralSettings,
  GuardVerdict,
  MessageGuardPolicy,
} from './types';

export const guardCategorySchema = z.enum(['off_platform', 'red', 'yellow', 'custom']);
export const guardActionSchema = z.enum(['block', 'warn', 'allow']);
export const guardDecisionSchema = z.enum(['allow', 'warn', 'block']);

export const guardStructuralSettingsSchema = z.strictObject({
  url: z.boolean(),
  domain: z.boolean(),
  email: z.boolean(),
  phone: z.boolean(),
  wallet: z.boolean(),
  handle: z.boolean(),
  altPay: z.boolean(),
}) satisfies z.ZodType<GuardStructuralSettings>;

export const guardRuleSchema = z.strictObject({
  id: z.string().min(1).max(120),
  category: guardCategorySchema,
  action: guardActionSchema,
  label: z.string().min(1).max(200),
  reasonKey: z.string().min(1).max(120),
  kind: z.enum(['term', 'phrase', 'regex', 'structural']),
  value: z.string().min(1).max(500),
  enabled: z.boolean(),
  allowInsideWords: z.boolean().optional(),
});

export const guardWhitelistRuleSchema = z.strictObject({
  id: z.string().min(1).max(120),
  kind: z.enum(['term', 'domain', 'email', 'phone', 'handle', 'regex']),
  value: z.string().min(1).max(500),
  reason: z.string().min(1).max(500),
  enabled: z.boolean(),
});

export const messageGuardPolicySchema = z.strictObject({
  version: z.string().min(1).max(80),
  builtInVersion: z.string().min(1).max(80),
  source: z.enum(['builtin+local', 'core']),
  yellowMode: z.enum(['block', 'warn']),
  customDefaultAction: guardActionSchema,
  blockBareHandles: z.boolean(),
  structural: guardStructuralSettingsSchema,
  rules: z.array(guardRuleSchema).max(2_000),
  whitelist: z.array(guardWhitelistRuleSchema).max(1_000),
}) satisfies z.ZodType<MessageGuardPolicy>;

export const guardSpanSchema = z.strictObject({
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  category: guardCategorySchema,
  action: guardActionSchema,
  ruleId: z.string().min(1),
  ruleLabel: z.string().min(1),
  reasonKey: z.string().min(1),
  matchedOriginal: z.string(),
  matchedNormalized: z.string(),
}) satisfies z.ZodType<GuardSpan>;

export const guardVerdictSchema = z.strictObject({
  decision: guardDecisionSchema,
  spans: z.array(guardSpanSchema),
  policyVersion: z.string().min(1),
  builtInVersion: z.string().min(1),
}) satisfies z.ZodType<GuardVerdict>;

export const guardAuditEventSchema = z.strictObject({
  id: z.string().min(1),
  occurredAt: z.string().min(1),
  actorUserId: z.string().nullable(),
  actorLabel: z.string().nullable(),
  accountId: z.string().min(1),
  chatId: z.string().min(1),
  surface: z.string().min(1),
  transport: z.string().nullable(),
  decision: z.enum(['blocked', 'warned', 'sent_after_warning']),
  policyVersion: z.string().min(1),
  category: guardCategorySchema,
  ruleId: z.string().min(1),
  ruleLabel: z.string().min(1),
  matchedOriginal: z.string(),
  matchedNormalized: z.string(),
  spanStart: z.number().int().min(0),
  spanEnd: z.number().int().min(0),
  messageText: z.string(),
  messageHash: z.string().min(1),
  mediaCount: z.number().int().min(0),
  price: z.number().min(0),
}) satisfies z.ZodType<GuardAuditEvent>;
