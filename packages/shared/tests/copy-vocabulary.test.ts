// D35 vocabulary pin (unified-account plan §2). A chatter knows a login, a
// password and the devices they are signed in on — nothing else. Words that
// leak the machinery (token, key, API, bearer, activation, reservation,
// prefix) must not appear in any user-facing string: the UI catalog, the
// error registry, or the Windows guides.
//
// Two scopes are deliberately exempt, each for a reason the reader can check:
//   • `hub.diag.*` — the Diagnostics block is the ONE place the plan keeps
//     technical detail (last4, machine id, app version).
//   • DOMAIN_EXEMPT_KEYS — strings about OTHER domains that legitimately own
//     these words: the OnlyFans vendor API key a manager reconnects, and the
//     LLM context "tokens" of the AI cost hints. Neither is part of the
//     chatter's account vocabulary; keep this list short and justified.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CG_ERROR_CODES, CG_ERROR_REGISTRY } from '../src/errors/index';
import { UI_MESSAGES } from '../src/i18n/catalog';

/** RU and EN forms. Cyrillic has no \b in JS regexes — guard with a lookbehind
 * over letters so «выключено» does not read as «ключ». */
const FORBIDDEN: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: 'токен', pattern: /(?<![\p{L}])токен/iu },
  { label: 'token', pattern: /(?<![\p{L}])tokens?(?![\p{L}])/iu },
  { label: 'ключ', pattern: /(?<![\p{L}])ключ/iu },
  { label: 'key', pattern: /(?<![\p{L}])keys?(?![\p{L}])/iu },
  { label: 'API', pattern: /(?<![\p{L}])API(?![\p{L}])/iu },
  { label: 'bearer', pattern: /(?<![\p{L}])bearer/iu },
  { label: 'активация', pattern: /(?<![\p{L}])активаци/iu },
  { label: 'activation', pattern: /(?<![\p{L}])activation/iu },
  { label: 'резервация', pattern: /(?<![\p{L}])резерваци/iu },
  { label: 'reservation', pattern: /(?<![\p{L}])reservation/iu },
  { label: 'префикс', pattern: /(?<![\p{L}])префикс/iu },
  { label: 'prefix', pattern: /(?<![\p{L}])prefix/iu },
];

/** Strings owned by other domains: the OnlyFans vendor key a manager
 * reconnects, LLM context tokens / prompt prefixes, and the keyboard. */
const DOMAIN_EXEMPT_KEYS: ReadonlySet<string> = new Set([
  'err.CG-OF-01',
  'err.CG-OF-03',
  'err.CG-OF-04',
  'err.CG-OF-09',
  'context.tokens',
  'activity.colTokens',
  'behavior.promptCachingHint',
  'conv.recoveryRefusedExplainer',
  'cheat.extraJump',
]);

const DOMAIN_EXEMPT_CODES: ReadonlySet<string> = new Set([
  'CG-OF-01',
  'CG-OF-03',
  'CG-OF-04',
  'CG-OF-09',
]);

const GUIDES = [
  '../../../docs/WINDOWS-GUIDE.html',
  '../../../docs/WINDOWS-VERIFICATION.md',
  '../../../docs/WINDOWS-VERIFICATION.html',
] as const;

function offendingWords(text: string): string[] {
  return FORBIDDEN.filter((entry) => entry.pattern.test(text)).map((entry) => entry.label);
}

describe('D35 user-facing vocabulary', () => {
  it('keeps the UI catalog free of credential machinery', () => {
    for (const [key, entry] of Object.entries(UI_MESSAGES)) {
      if (key.startsWith('hub.diag.') || DOMAIN_EXEMPT_KEYS.has(key)) continue;
      expect(offendingWords(entry.en), `${key}.en`).toEqual([]);
      expect(offendingWords(entry.ru), `${key}.ru`).toEqual([]);
    }
  });

  it('keeps the error registry free of credential machinery', () => {
    for (const code of CG_ERROR_CODES) {
      if (DOMAIN_EXEMPT_CODES.has(code)) continue;
      const definition = CG_ERROR_REGISTRY[code];
      expect(offendingWords(definition.message), `${code}.message`).toEqual([]);
      expect(offendingWords(definition.recovery), `${code}.recovery`).toEqual([]);
    }
  });

  it('keeps the shipped guides free of credential machinery', () => {
    for (const relative of GUIDES) {
      const text = readFileSync(new URL(relative, import.meta.url), 'utf8');
      expect(offendingWords(text), relative).toEqual([]);
    }
  });
});
