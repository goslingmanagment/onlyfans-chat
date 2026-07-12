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
    it(`${path} uses device sign-in instead of a full OFAPI key`, () => {
      const text = read(path);
      expect(text).not.toMatch(/API-ключи|Ключ OFAPI|ChatGoose-Setup-0\.1\.0/);
      expect(text).toMatch(/Agency Hub/);
      expect(text).toMatch(/device token/i);
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
