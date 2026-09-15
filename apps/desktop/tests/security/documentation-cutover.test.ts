import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../../..');

function read(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('kernel cutover documentation gates', () => {
  const windowsDocs = [
    'docs/WINDOWS-VERIFICATION.md',
    'docs/WINDOWS-VERIFICATION.html',
    'docs/WINDOWS-GUIDE.html',
  ];

  for (const path of windowsDocs) {
    // D35: the guides speak the chatter's vocabulary — a login, a password and
    // the devices they are signed in on. The credential machinery is gone from
    // the copy (the word-level pin lives in
    // packages/shared/tests/copy-vocabulary.test.ts).
    it(`${path} explains the sign-in screen without credential machinery`, () => {
      const text = read(path);
      expect(text).not.toMatch(/API-ключи|Ключ OFAPI|ChatGoose-Setup-0\.1\.0/);
      expect(text).not.toMatch(/device token/i);
      expect(text).not.toMatch(/API key/i);
      expect(text).not.toMatch(/(?<![\p{L}])токен/iu);
      expect(text).not.toMatch(/(?<![\p{L}])ключ/iu);
      expect(text).not.toMatch(/Agency Hub/);
      expect(text).toMatch(/ChatGoose/);
      expect(text).toMatch(/(?<![\p{L}])аккаунт/iu);
      expect(text).toMatch(/логин и пароль/i);
    });
  }

  const historicalDocs: Array<[string, RegExp]> = [
    ['docs/PRD.md', /MIXED HISTORICAL PRODUCT BASELINE/],
    ['docs/SPEC.md', /HISTORICAL ARCHITECTURE SPEC/],
    ['docs/PLAN.md', /HISTORICAL EXECUTION RECORD/],
    ['docs/DESIGN.md', /MIXED SHIPPED DESIGN INTENT/],
  ];

  for (const [path, banner] of historicalDocs) {
    it(`${path} declares its authority boundary`, () => {
      expect(read(path).slice(0, 800)).toMatch(banner);
    });
  }
});
