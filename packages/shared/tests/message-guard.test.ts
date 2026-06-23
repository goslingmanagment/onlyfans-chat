import { describe, expect, it } from 'vitest';
import {
  BUILTIN_MESSAGE_GUARD_POLICY,
  compileGuard,
  normalizeWithMap,
  scanText,
  type GuardRule,
  type GuardWhitelistRule,
  type MessageGuardPolicy,
} from '../src/message-guard/index';

function policy(
  rules: GuardRule[] = [],
  whitelist: GuardWhitelistRule[] = BUILTIN_MESSAGE_GUARD_POLICY.whitelist,
): MessageGuardPolicy {
  return {
    ...BUILTIN_MESSAGE_GUARD_POLICY,
    version: `test-${rules.length}-${whitelist.length}`,
    rules: [...BUILTIN_MESSAGE_GUARD_POLICY.rules, ...rules],
    whitelist,
  };
}

function scan(raw: string, p: MessageGuardPolicy = policy()) {
  return scanText(compileGuard(p), raw);
}

describe('message guard normalization', () => {
  it('keeps raw offsets through zero-width, spacing, leet and repeat folds', () => {
    const raw = 'c a $ h a p p';
    const mapped = normalizeWithMap(raw, true);
    expect(mapped.text).toBe('cashapp');
    expect(mapped.units[0]?.srcStart).toBe(0);
    expect(mapped.units.at(-1)?.srcEnd).toBe(raw.length);
    expect(raw.slice(mapped.units[0]?.srcStart, mapped.units.at(-1)?.srcEnd)).toBe(raw);
    expect(normalizeWithMap('TELE\u200bGRAM', true).text).toBe('telegram');
    expect(normalizeWithMap('loooook', true).text).toBe('lok');
  });

  it('context-gates leet folding so prices and ordinary numbers stay numeric', () => {
    expect(normalizeWithMap('$40 for 3 pics', true).text).toBe('40for3pics');
    expect(normalizeWithMap('ca$happ', true).text).toBe('cashapp');
    expect(normalizeWithMap('te1egram', true).text).toBe('teiegram');
  });
});

describe('message guard structural detectors', () => {
  it('blocks obfuscated domains, emails, alt-pay terms and handles', () => {
    expect(scan('send it through linktr . ee / x').decision).toBe('block');
    expect(scan('john at gmail dot com').decision).toBe('block');
    expect(scan('c a $ h a p p me').decision).toBe('block');
    expect(scan('telegram @name').decision).toBe('block');
    expect(scan('t.me/name').decision).toBe('block');
  });

  it('blocks phones and wallets without blocking prices or short ids', () => {
    expect(scan('text me +1 (555) 123-4567').decision).toBe('block');
    expect(scan('send to 0x742d35Cc6634C0532925a3b844Bc454e4438f44e').decision).toBe('block');
    expect(scan('$120 for 30 min and 100 tokens').decision).toBe('allow');
  });

  it('does not block ordinary social-platform mentions without handles', () => {
    expect(scan('snapchat was in the news today').decision).toBe('allow');
  });
});

describe('message guard whitelist and verdict resolution', () => {
  it('applies narrow whitelist precedence', () => {
    expect(scan('onlyfans.com').decision).toBe('allow');
    expect(scan('onlyfans.com.evil').decision).toBe('block');
  });

  it('resolves block over warn over allow and maps raw spans', () => {
    const red: GuardRule = {
      id: 'test-red',
      category: 'red',
      action: 'block',
      label: 'Red test',
      reasonKey: 'guard.reason.red',
      kind: 'term',
      value: 'telegram',
      enabled: true,
    };
    const yellow: GuardRule = {
      id: 'test-yellow',
      category: 'yellow',
      action: 'warn',
      label: 'Yellow test',
      reasonKey: 'guard.reason.yellow',
      kind: 'term',
      value: 'maybe',
      enabled: true,
    };
    const verdict = scan('try t.e.l.e.g.r.a.m maybe', policy([red, yellow]));
    expect(verdict.decision).toBe('block');
    expect(verdict.spans.some((span) => span.ruleId === 'test-red')).toBe(true);
    expect(verdict.spans.find((span) => span.ruleId === 'test-red')?.matchedOriginal).toBe(
      't.e.l.e.g.r.a.m',
    );
  });

  it('lets yellow warn only when policy explicitly selects warn mode', () => {
    const yellow: GuardRule = {
      id: 'test-yellow',
      category: 'yellow',
      action: 'warn',
      label: 'Yellow test',
      reasonKey: 'guard.reason.yellow',
      kind: 'term',
      value: 'maybe',
      enabled: true,
    };
    expect(scan('maybe', policy([yellow])).decision).toBe('block');
    expect(scan('maybe', { ...policy([yellow]), yellowMode: 'warn' }).decision).toBe('warn');
  });
});
