// Stage 31 Task 3 grep gates — compile-time-style proofs that the cutover
// holds: no vendor AI endpoints, no imports of the deleted local AI
// machinery. A hit anywhere in src/ is a regression, not a judgment call.

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

function grepSources(pattern: string): string[] {
  try {
    const output = execFileSync(
      'grep',
      [
        '-rlE',
        pattern,
        '--include=*.ts',
        '--include=*.tsx',
        join(REPO_ROOT, 'apps', 'desktop', 'src'),
        join(REPO_ROOT, 'packages', 'shared', 'src'),
      ],
      { encoding: 'utf8' },
    );
    return output.split('\n').filter((line) => line.trim() !== '');
  } catch {
    return []; // grep exits 1 on zero matches
  }
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
