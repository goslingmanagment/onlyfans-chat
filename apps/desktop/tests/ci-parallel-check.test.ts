// scripts/ci-parallel-check.mjs runs the root `pnpm check` on the PC runners
// with the read-only parts side by side. Its plan (`--plan`, nothing runs)
// must keep every part of the real chain in order, overlap only the
// read-only parts, and fall back to a plain `pnpm check` for any other shape
// of "check".

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const script = resolve(repoRoot, 'scripts/ci-parallel-check.mjs');

interface Plan {
  stages?: string[][];
  sequential?: string;
}

function planIn(cwd: string): Plan {
  return JSON.parse(execFileSync(process.execPath, [script, '--plan'], { cwd, encoding: 'utf8' })) as Plan;
}

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function planFor(scripts: Record<string, string>): Plan {
  const dir = mkdtempSync(join(tmpdir(), 'ci-parallel-check-'));
  tempDirs.push(dir);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts }));
  return planIn(dir);
}

describe('ci-parallel-check', () => {
  it('runs every part of the real check once, in chain order, and overlaps some', () => {
    const rootPackage = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
      scripts: { check: string };
    };
    const stages = planIn(repoRoot).stages ?? [];
    expect(stages.flat().join(' && ')).toBe(rootPackage.scripts.check);
    expect(stages.length).toBeLessThan(stages.flat().length);
  });

  it('overlaps only neighbouring read-only parts; build runs alone, in order', () => {
    expect(planFor({ check: 'pnpm typecheck && pnpm lint && pnpm test && pnpm build' })).toEqual({
      stages: [['pnpm typecheck', 'pnpm lint', 'pnpm test'], ['pnpm build']],
    });
    expect(planFor({ check: 'pnpm lint && pnpm build && pnpm typecheck && pnpm test' })).toEqual({
      stages: [['pnpm lint'], ['pnpm build'], ['pnpm typecheck', 'pnpm test']],
    });
  });

  it('runs a part alone when it carries flags or its own pre/post script', () => {
    expect(planFor({ check: 'pnpm typecheck && pnpm lint && pnpm -r --no-bail test' })).toEqual({
      stages: [['pnpm typecheck', 'pnpm lint'], ['pnpm -r --no-bail test']],
    });
    expect(planFor({ check: 'pnpm typecheck && pnpm test && pnpm lint', prelint: 'node x.mjs' })).toEqual({
      stages: [['pnpm typecheck', 'pnpm test'], ['pnpm lint']],
    });
  });

  it.each([
    'pnpm typecheck || pnpm lint',
    'pnpm typecheck; pnpm lint',
    'pnpm typecheck & pnpm lint',
    'pnpm typecheck | tee log && pnpm lint',
    'CI=1 pnpm typecheck && pnpm lint',
    'pnpm typecheck && npm run lint',
    'pnpm typecheck && (pnpm lint)',
    'pnpm typecheck && pnpm "lint"',
    'pnpm typecheck && pnpm $LINT',
    'pnpm typecheck &&\npnpm lint',
    'pnpm typecheck',
    'pnpm build && pnpm dist',
  ])('falls back to pnpm check for %j', (check) => {
    expect(planFor({ check }).sequential).toBeTruthy();
  });

  it('falls back without a check script, or when check has its own pre/post script', () => {
    expect(planFor({}).sequential).toBeTruthy();
    expect(planFor({ check: 'pnpm typecheck && pnpm lint', precheck: 'x' }).sequential).toBeTruthy();
    expect(planFor({ check: 'pnpm typecheck && pnpm lint', postcheck: 'x' }).sequential).toBeTruthy();
  });

  it('keeps pnpm check on GitHub-hosted runners and runs the script only on the PC', () => {
    const ci = readFileSync(resolve(repoRoot, '.github/workflows/ci.yml'), 'utf8').replace(/\r\n/g, '\n');
    expect(ci).toMatch(/if: runner\.environment != 'self-hosted'\n\s+run: pnpm check\n/);
    expect(ci).toMatch(/if: runner\.environment == 'self-hosted'\n\s+run: node scripts\/ci-parallel-check\.mjs\n/);
  });
});
