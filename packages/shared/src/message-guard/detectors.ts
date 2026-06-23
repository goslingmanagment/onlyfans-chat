import type { GuardSpan, MessageGuardPolicy } from './types';
import { isAsciiAlnum, normalizeWithMap } from './normalize';

const COMMON_TLDS = ['com', 'net', 'org', 'io', 'co', 'me', 'ee', 'to', 'ru', 'info', 'biz', 'app', 'dev', 'tv', 'cc', 'gg', 'link', 'site', 'online'] as const;
const TLD_PATTERN = `(?:${COMMON_TLDS.join('|')})`;
const DOMAIN_RE = new RegExp(
  `\\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.${TLD_PATTERN}(?:\\.[a-z]{2,})*\\b`,
  'giu',
);
const URL_RE = new RegExp(`\\b(?:https?|hxxps?)://[^\\s]+|\\bwww\\.[^\\s]+`, 'giu');
const EMAIL_RE = new RegExp(`\\b[a-z0-9._%+-]+@[a-z0-9.-]+\\.${TLD_PATTERN}\\b`, 'giu');
const OBFUSCATED_EMAIL_RE = new RegExp(
  `\\b[a-z0-9._%+-]+\\s+at\\s+[a-z0-9.-]+\\s+(?:dot|\\.)\\s+${TLD_PATTERN.replace('(?:', '(?:')}`,
  'giu',
);
const ETH_RE = /\b0x[a-f0-9]{40}\b/giu;
const BTC_RE = /\b(?:bc1[ac-hj-np-z02-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/gu;
const TRON_RE = /\bT[A-Za-z1-9]{33}\b/gu;
const SOL_RE = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/gu;
const PLATFORM_HANDLE_RE =
  /\b(?:telegram|tg|insta|instagram|snap|snapchat|sc|whatsapp|wa|kik|reddit|discord)\b\s*(?:@|[:=/]|handle\s+)[a-z0-9_.-]{3,32}\b/giu;
const PLATFORM_URL_RE = /\b(?:t\.me|wa\.me|ig\.me|instagram\.com|snapchat\.com|discord\.gg)\/[a-z0-9_.-]{2,64}\b/giu;
const BARE_HANDLE_RE = /(^|[\s([{])@([a-z0-9_][a-z0-9_.-]{2,31})\b/giu;
const ALT_PAY_TERMS = [
  'cashapp',
  'cashtag',
  'paypal',
  'venmo',
  'zelle',
  'revolut',
  'wise',
  'banktransfer',
  'wiretransfer',
  'bitcoin',
  'btc',
  'ethereum',
  'eth',
  'usdt',
] as const;

const STRUCTURAL_LABELS: Record<string, string> = {
  url: 'Off-platform URL',
  domain: 'Off-platform domain',
  email: 'Email address',
  phone: 'Phone number',
  wallet: 'Crypto wallet',
  handle: 'Social handle',
  altPay: 'Alternative payment',
};

function spanFromRaw(raw: string, start: number, end: number, id: string): GuardSpan {
  return {
    start,
    end,
    category: 'off_platform',
    action: 'block',
    ruleId: `builtin-structural-${id}`,
    ruleLabel: STRUCTURAL_LABELS[id] ?? 'Off-platform content',
    reasonKey: 'guard.reason.off_platform',
    matchedOriginal: raw.slice(start, end),
    matchedNormalized: normalizeWithMap(raw.slice(start, end), true).text,
  };
}

function addRegexMatches(spans: GuardSpan[], raw: string, re: RegExp, id: string): void {
  re.lastIndex = 0;
  for (;;) {
    const match = re.exec(raw);
    if (match === null) break;
    const text = match[0] ?? '';
    const start = match.index;
    const end = start + text.length;
    if (end > start) spans.push(spanFromRaw(raw, start, end, id));
    if (text.length === 0) re.lastIndex += 1;
  }
}

function addSkeletonTermMatches(spans: GuardSpan[], raw: string, terms: readonly string[], id: string): void {
  const skeleton = normalizeWithMap(raw, true);
  for (const term of terms) {
    let from = 0;
    for (;;) {
      const index = skeleton.text.indexOf(term, from);
      if (index === -1) break;
      const endIndex = index + term.length - 1;
      const first = skeleton.units[index];
      const last = skeleton.units[endIndex];
      if (first !== undefined && last !== undefined) {
        const before = skeleton.text[index - 1];
        const after = skeleton.text[index + term.length];
        const boundaryOk =
          (before === undefined || !isAsciiAlnum(before)) &&
          (after === undefined || !isAsciiAlnum(after));
        if (boundaryOk || term.length <= 4 || id === 'domain') {
          spans.push(spanFromRaw(raw, first.srcStart, last.srcEnd, id));
        }
      }
      from = index + 1;
    }
  }
}

function addSkeletonDomainMatches(spans: GuardSpan[], raw: string): void {
  const skeleton = normalizeWithMap(raw, true);
  const tlds = COMMON_TLDS.join('|');
  const re = new RegExp(`[a-z0-9]{2,}(?:${tlds})\\b`, 'gu');
  re.lastIndex = 0;
  for (;;) {
    const match = re.exec(skeleton.text);
    if (match === null) break;
    const text = match[0] ?? '';
    const start = match.index;
    const first = skeleton.units[start];
    const last = skeleton.units[start + text.length - 1];
    if (first !== undefined && last !== undefined) {
      spans.push(spanFromRaw(raw, first.srcStart, last.srcEnd, 'domain'));
    }
    if (text.length === 0) re.lastIndex += 1;
  }
}

function addPhoneMatches(spans: GuardSpan[], raw: string): void {
  const re = /(?:\+?\d[\d\s().-]{6,}\d)/gu;
  re.lastIndex = 0;
  for (;;) {
    const match = re.exec(raw);
    if (match === null) break;
    const text = match[0] ?? '';
    const digits = text.replaceAll(/\D/gu, '');
    const hasStrongSignal =
      /^\s*\+/u.test(text) ||
      /[().-]/u.test(text) ||
      /\b(?:phone|number|call|text|sms|whatsapp|telegram|wa)\b/i.test(
        raw.slice(Math.max(0, match.index - 24), Math.min(raw.length, match.index + text.length + 24)),
      );
    if (digits.length >= 8 && digits.length <= 15 && hasStrongSignal) {
      spans.push(spanFromRaw(raw, match.index, match.index + text.length, 'phone'));
    }
    if (text.length === 0) re.lastIndex += 1;
  }
}

function addBareHandleMatches(spans: GuardSpan[], raw: string): void {
  BARE_HANDLE_RE.lastIndex = 0;
  for (;;) {
    const match = BARE_HANDLE_RE.exec(raw);
    if (match === null) break;
    const prefix = match[1] ?? '';
    const text = match[0] ?? '';
    const start = match.index + prefix.length;
    const end = match.index + text.length;
    if (end > start) spans.push(spanFromRaw(raw, start, end, 'handle'));
  }
}

export function detectStructural(raw: string, policy: MessageGuardPolicy): GuardSpan[] {
  const spans: GuardSpan[] = [];
  const canonical = normalizeWithMap(raw, false).text;
  if (policy.structural.url) addRegexMatches(spans, canonical, URL_RE, 'url');
  if (policy.structural.domain) {
    addRegexMatches(spans, canonical, DOMAIN_RE, 'domain');
    addSkeletonDomainMatches(spans, raw);
    addSkeletonTermMatches(spans, raw, ['linktree', 'linktreee', 'onlyfto'], 'domain');
  }
  if (policy.structural.email) {
    addRegexMatches(spans, canonical, EMAIL_RE, 'email');
    addRegexMatches(spans, canonical, OBFUSCATED_EMAIL_RE, 'email');
  }
  if (policy.structural.phone) addPhoneMatches(spans, raw);
  if (policy.structural.wallet) {
    addRegexMatches(spans, raw, ETH_RE, 'wallet');
    addRegexMatches(spans, raw, BTC_RE, 'wallet');
    addRegexMatches(spans, raw, TRON_RE, 'wallet');
    addRegexMatches(spans, raw, SOL_RE, 'wallet');
  }
  if (policy.structural.handle) {
    addRegexMatches(spans, canonical, PLATFORM_HANDLE_RE, 'handle');
    addRegexMatches(spans, canonical, PLATFORM_URL_RE, 'handle');
    if (policy.blockBareHandles) addBareHandleMatches(spans, raw);
  }
  if (policy.structural.altPay) {
    addSkeletonTermMatches(spans, raw, ALT_PAY_TERMS, 'altPay');
  }
  return spans;
}
