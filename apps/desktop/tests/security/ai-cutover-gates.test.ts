// Stage 31 Task 3 grep gates — compile-time-style proofs that the cutover
// holds: no vendor AI endpoints, no imports of the deleted local AI
// machinery. A hit anywhere in src/ is a regression, not a judgment call.
//
// Only grep's "no line matched" (exit 1) is a clean result. Any other outcome
// (no grep on the runner, a bad pattern, a read error) throws, and so does a
// missing source dir, checked up front: BSD grep (macOS) skips a missing
// operand that fails --include without a word. A gate never passes without
// having searched.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, normalize } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const SOURCE_DIRS = [join(REPO_ROOT, 'apps', 'desktop', 'src'), join(REPO_ROOT, 'packages', 'shared', 'src')];

function grepSources(pattern: string, dirs: readonly string[] = SOURCE_DIRS, grep = 'grep'): string[] {
  for (const dir of dirs) {
    if (statSync(dir, { throwIfNoEntry: false })?.isDirectory() !== true) {
      throw new Error(`source dir to grep is missing: ${dir}`);
    }
  }
  const result = spawnSync(grep, ['-rlE', pattern, '--include=*.ts', '--include=*.tsx', ...dirs], {
    encoding: 'utf8',
  });
  if (result.error) throw new Error(`grep did not run: ${result.error.message}`);
  if (result.status === 1) return []; // no line matched, and no error
  if (result.status !== 0) {
    const how = result.status === null ? `killed by ${result.signal}` : `exit ${result.status}`;
    throw new Error(`grep failed (${how}): ${result.stderr.trim()}`);
  }
  return result.stdout.split('\n').filter((line) => line.trim() !== '');
}

describe('AI cutover grep gates (Stage 31)', () => {
  it('no vendor AI endpoints anywhere in source', () => {
    expect(grepSources('api\\.anthropic\\.com|openrouter\\.ai')).toEqual([]);
  });

  it('no imports of the deleted prompt/llm/provider modules', () => {
    expect(grepSources(
      "from '@chatgoose/shared/(prompts|llm)/|from '\\.\\./(ai/)?providers/|from '\\./providers/",
    )).toEqual([]);
  });

  it('no direct/hub gateway constructors survive', () => {
    expect(grepSources('createDirectGateway|createSelectableAiGateway|createHubAiGateway')).toEqual([]);
  });
});

describe('the grep behind the gates fails closed', () => {
  const tempDirs: string[] = [];
  afterAll(() => {
    for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  });

  function sourceDir(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'ai-cutover-gates-'));
    tempDirs.push(dir);
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
    return dir;
  }

  it('searches both real source trees', () => {
    const importers = grepSources('^import ');
    for (const dir of SOURCE_DIRS) expect(importers.some((file) => file.startsWith(dir)), dir).toBe(true);
  });

  it('lists a hit, and returns nothing only when nothing matched', () => {
    const dir = sourceDir({ 'hit.ts': "fetch('https://api.anthropic.com/v1');\n", 'clean.ts': 'export {};\n' });
    expect(grepSources('api\\.anthropic\\.com', [dir]).map(normalize)).toEqual([join(dir, 'hit.ts')]);
    expect(grepSources('openrouter\\.ai', [dir])).toEqual([]);
  });

  it('throws when a source dir is missing, even next to a dir that matches', () => {
    const dir = sourceDir({ 'hit.ts': "fetch('https://api.anthropic.com/v1');\n" });
    expect(() => grepSources('openrouter\\.ai', [join(dir, 'renamed')])).toThrow(/source dir to grep is missing/);
    expect(() => grepSources('api\\.anthropic\\.com', [dir, join(dir, 'renamed')])).toThrow(/source dir to grep is missing/);
  });

  it('throws on a pattern grep cannot compile', () => {
    expect(() => grepSources('(unclosed', [sourceDir({ 'a.ts': 'x\n' })])).toThrow(/grep failed \(exit 2\)/);
  });

  it('throws when there is no grep to run', () => {
    expect(() => grepSources('x', SOURCE_DIRS, 'grep-not-installed')).toThrow(/grep did not run/);
  });
});
