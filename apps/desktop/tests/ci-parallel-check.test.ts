// scripts/ci-parallel-check.mjs runs the root `pnpm check` on the PC runners
// with the read-only parts side by side. Its plan (`--plan`, nothing runs)
// must keep every part of the real chain in order, overlap only the parts it
// pins, and fall back to a plain `pnpm check` for any other shape of "check"
// or as soon as a pinned part runs anything else: another root script body, a
// changed or new workspace package script, or a pre/post hook anywhere. A run
// must fail when a part fails and stop its parts when it is stopped.

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const script = resolve(repoRoot, 'scripts/ci-parallel-check.mjs');

interface Plan {
  stages?: string[][];
  sequential?: string;
}

type Scripts = Record<string, string>;
interface Tree {
  root: Scripts;
  workspaceYaml: string | null;
  packages: Record<string, Scripts>;
}

function planIn(cwd: string): Plan {
  return JSON.parse(execFileSync(process.execPath, [script, '--plan'], { cwd, encoding: 'utf8' })) as Plan;
}

function readScripts(path: string): Scripts {
  return (JSON.parse(readFileSync(path, 'utf8')) as { scripts?: Scripts }).scripts ?? {};
}

// The real root scripts, pnpm-workspace.yaml and workspace package scripts.
function realTree(): Tree {
  const packages: Record<string, Scripts> = {};
  for (const parent of ['apps', 'packages']) {
    for (const name of readdirSync(join(repoRoot, parent))) {
      const manifest = join(repoRoot, parent, name, 'package.json');
      if (existsSync(manifest)) packages[`${parent}/${name}`] = readScripts(manifest);
    }
  }
  return {
    root: readScripts(join(repoRoot, 'package.json')),
    workspaceYaml: readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8'),
    packages,
  };
}

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ci-parallel-check-'));
  tempDirs.push(dir);
  return dir;
}

// A copy of the real tree's manifests, changed by `edit`.
function mirror(edit: (tree: Tree) => void = () => {}): string {
  const tree = realTree();
  edit(tree);
  const dir = tempDir();
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: tree.root }));
  if (tree.workspaceYaml !== null) writeFileSync(join(dir, 'pnpm-workspace.yaml'), tree.workspaceYaml);
  for (const [pkgDir, scripts] of Object.entries(tree.packages)) {
    mkdirSync(join(dir, pkgDir), { recursive: true });
    writeFileSync(join(dir, pkgDir, 'package.json'), JSON.stringify({ name: pkgDir, scripts }));
  }
  return dir;
}

const planFor = (edit: (tree: Tree) => void) => planIn(mirror(edit));
const withCheck = (check: string) => planFor((tree) => void (tree.root.check = check));

describe('ci-parallel-check plan', () => {
  it('runs every part of the real check once, in chain order, and overlaps some', () => {
    const { root } = realTree();
    const stages = planIn(repoRoot).stages ?? [];
    expect(stages.flat().join(' && ')).toBe(root.check);
    expect(stages.length).toBeLessThan(stages.flat().length);
  });

  it('plans a copy of the real manifests like the real tree', () => {
    expect(planIn(mirror())).toEqual(planIn(repoRoot));
  });

  it('overlaps only neighbouring pinned parts; build runs alone, in order', () => {
    expect(withCheck('pnpm typecheck && pnpm lint && pnpm test && pnpm build')).toEqual({
      stages: [['pnpm typecheck', 'pnpm lint', 'pnpm test'], ['pnpm build']],
    });
    expect(withCheck('pnpm lint && pnpm build && pnpm typecheck && pnpm test')).toEqual({
      stages: [['pnpm lint'], ['pnpm build'], ['pnpm typecheck', 'pnpm test']],
    });
  });

  it('runs a part alone when it carries flags', () => {
    expect(withCheck('pnpm typecheck && pnpm lint && pnpm -r --no-bail test')).toEqual({
      stages: [['pnpm typecheck', 'pnpm lint'], ['pnpm -r --no-bail test']],
    });
  });

  it.each([
    ['test', 'pnpm build && pnpm -r --no-bail test'],
    ['test', 'pnpm -r test'],
    ['lint', 'eslint . --fix'],
    ['typecheck', 'pnpm -r --no-bail typecheck && pnpm build'],
  ])('falls back when the root "%s" is %j, not the pinned body', (name, body) => {
    expect(planFor((tree) => void (tree.root[name] = body)).sequential).toMatch(`"${name}" is`);
  });

  it('falls back when a pinned part is no script at all', () => {
    expect(planFor((tree) => void delete tree.root.lint).sequential).toMatch('"lint" is null');
  });

  it.each(['pretest', 'posttest', 'prelint', 'pretypecheck'])('falls back on a root %s hook', (hook) => {
    expect(planFor((tree) => void (tree.root[hook] = 'node x.mjs')).sequential).toMatch(`"${hook}" runs with`);
  });

  it.each([
    ['apps/desktop', 'pretest'],
    ['apps/desktop', 'posttypecheck'],
    ['packages/shared', 'posttest'],
    ['packages/kernel-sdk', 'pretest'],
  ])('falls back on a %s %s hook under pnpm -r', (pkgDir, hook) => {
    const plan = planFor((tree) => void (tree.packages[pkgDir]![hook] = 'touch out/x'));
    expect(plan.sequential).toMatch(`${pkgDir} "${hook}" runs with pnpm -r`);
  });

  it('falls back when a workspace package script changes, appears, or its package goes', () => {
    expect(
      planFor((tree) => void (tree.packages['apps/desktop']!.test = 'vitest run && electron-vite build')).sequential,
    ).toMatch('apps/desktop "test" is');
    expect(planFor((tree) => void (tree.packages['packages/kernel-sdk']!.typecheck = 'tsc')).sequential).toMatch(
      'packages/kernel-sdk "typecheck" is "tsc", not the pinned null',
    );
    expect(planFor((tree) => void (tree.packages['apps/new'] = { test: 'vitest run' })).sequential).toMatch(
      'apps/new "test" is',
    );
    expect(planFor((tree) => void delete tree.packages['packages/shared']).sequential).toMatch(
      'packages/shared is gone',
    );
  });

  it.each([
    ['is missing', null],
    ['has no packages list', 'onlyBuiltDependencies:\n  - esbuild\n'],
    ['negates a glob', "packages:\n  - apps/*\n  - '!apps/legacy'\n"],
    ['globs deeper', 'packages:\n  - apps/**\n'],
    ['climbs out', 'packages:\n  - ../other/*\n'],
  ])('falls back when pnpm-workspace.yaml %s', (_, workspaceYaml) => {
    expect(planFor((tree) => void (tree.workspaceYaml = workspaceYaml)).sequential).toMatch('pnpm-workspace.yaml');
  });

  it('falls back when a workspace package.json is not JSON', () => {
    const dir = mirror();
    writeFileSync(join(dir, 'apps/desktop/package.json'), '{ "scripts": ');
    expect(planIn(dir).sequential).toMatch('apps/desktop/package.json is not readable JSON');
  });

  it('reads quoted globs and comments in pnpm-workspace.yaml', () => {
    const plan = planFor((tree) => {
      tree.workspaceYaml = "# workspace\npackages:\n  # apps\n  - 'apps/*'\n  - \"packages/*\"\n\nonlyBuiltDependencies:\n  - x\n";
    });
    expect(plan).toEqual(planIn(repoRoot));
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
    expect(withCheck(check).sequential).toBeTruthy();
  });

  it('falls back without a check script, or when check has its own pre/post script', () => {
    expect(planFor((tree) => void delete tree.root.check).sequential).toBeTruthy();
    expect(planFor((tree) => void (tree.root.precheck = 'x')).sequential).toBeTruthy();
    expect(planFor((tree) => void (tree.root.postcheck = 'x')).sequential).toBeTruthy();
  });

  it('keeps pnpm check on GitHub-hosted runners and execs the script only on the PC', () => {
    const ci = readFileSync(resolve(repoRoot, '.github/workflows/ci.yml'), 'utf8').replace(/\r\n/g, '\n');
    expect(ci).toMatch(/if: runner\.environment != 'self-hosted'\n\s+run: pnpm check\n/);
    // On cancel or timeout the runner signals the step's shell; only with
    // exec does the signal reach the script, which then stops its parts.
    expect(ci).toMatch(/if: runner\.environment == 'self-hosted'\n\s+run: exec node scripts\/ci-parallel-check\.mjs\n/);
  });
});

// Real runs with a stand-in `pnpm` that logs its first argument, fails with 3
// for the script in FAKE_PNPM_FAIL and hangs in the one in FAKE_PNPM_HANG.
describe.skipIf(process.platform === 'win32')('ci-parallel-check run', () => {
  function fakePnpm(extra: Record<string, string> = {}) {
    const bin = tempDir();
    const log = join(bin, 'calls.log');
    const pidFile = join(bin, 'hang.pid');
    writeFileSync(
      join(bin, 'pnpm'),
      [
        '#!/bin/sh',
        `echo "$1" >> '${log}'`,
        `if [ "$1" = "$FAKE_PNPM_HANG" ]; then echo $$ > '${pidFile}'; exec sleep 60; fi`,
        'if [ "$1" = "$FAKE_PNPM_FAIL" ]; then echo "$1 broke"; exit 3; fi',
        'echo "$1 fine"',
        '',
      ].join('\n'),
    );
    chmodSync(join(bin, 'pnpm'), 0o755);
    const env: Record<string, string | undefined> = {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
      RUNNER_TEMP: bin,
      FAKE_PNPM_FAIL: '',
      FAKE_PNPM_HANG: '',
      ...extra,
    };
    const calls = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []);
    return { env, calls, pidFile };
  }

  const run = (cwd: string, env: Record<string, string | undefined>) =>
    spawnSync(process.execPath, [script], { cwd, env, encoding: 'utf8', timeout: 30_000 });

  it('passes when every part passes, and fails without running build when one part fails', () => {
    const fake = fakePnpm();
    const ok = run(mirror(), fake.env);
    expect(ok.status, ok.stdout).toBe(0);
    expect(fake.calls().sort()).toEqual(['build', 'lint', 'test', 'typecheck']);

    const broken = fakePnpm({ FAKE_PNPM_FAIL: 'lint' });
    const failed = run(mirror(), broken.env);
    expect(failed.status, failed.stdout).toBe(1);
    expect(failed.stdout).toContain('pnpm lint: FAILED (exit 3');
    expect(failed.stdout).toContain('pnpm build: not run');
    expect(broken.calls()).not.toContain('build');
  });

  it('falls back to one pnpm check and fails with its exit code', () => {
    const drifted = () => mirror((tree) => void (tree.root.test = 'pnpm build && pnpm -r --no-bail test'));
    const fake = fakePnpm();
    const ok = run(drifted(), fake.env);
    expect(ok.status, ok.stdout).toBe(0);
    expect(ok.stdout).toContain('::notice::ci-parallel-check: "test" is');
    expect(fake.calls()).toEqual(['check']);

    const failed = run(drifted(), fakePnpm({ FAKE_PNPM_FAIL: 'check' }).env);
    expect(failed.status, failed.stdout).toBe(3);
    expect(failed.stdout).toContain('check broke');
  });

  it.each([
    ['side by side', () => mirror(), 'test'],
    ['as one pnpm check', () => mirror((tree) => void (tree.root.prelint = 'x')), 'check'],
  ])('stops its parts on SIGTERM when it runs %s', async (_, cwd, hang) => {
    const fake = fakePnpm({ FAKE_PNPM_HANG: hang });
    const child = spawn(process.execPath, [script], { cwd: cwd(), env: fake.env, stdio: 'ignore' });
    const exited = new Promise<number | null>((done) => child.on('exit', (code) => done(code)));
    const deadline = Date.now() + 15_000;
    while (!existsSync(fake.pidFile) || readFileSync(fake.pidFile, 'utf8').trim() === '') {
      if (Date.now() > deadline) throw new Error('the hanging part never started');
      await new Promise((done) => setTimeout(done, 50));
    }
    const hangPid = Number(readFileSync(fake.pidFile, 'utf8').trim());
    child.kill('SIGTERM');
    expect(await exited).toBe(143);
    expect(() => process.kill(hangPid, 0)).toThrow();
  }, 30_000);
});
