#!/usr/bin/env node
// `pnpm check` on the PC runners (ci.yml, self-hosted only): the same parts,
// read from package.json's "check" at run time and run with the same argv,
// but the parts that only read the tree run side by side. Every other part
// runs alone at its place in the chain, and a stage starts only after every
// earlier part passed, as with `&&`. Each part logs to its own file; the logs
// print in chain order when their stage ends. A "check" that is not a plain
// `pnpm … && pnpm …` chain, or a side-by-side part that no longer runs exactly
// what SIDE_BY_SIDE pins, runs as `pnpm check` itself. GitHub-hosted runners
// and local runs keep `pnpm check`.
//
//   node scripts/ci-parallel-check.mjs          run the check
//   node scripts/ci-parallel-check.mjs --plan   print the stages as JSON, run nothing

import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The parts that may run side by side, pinned to exactly what they run: the
// root script and, for a part that fans out with `pnpm -r`, that script in
// every workspace package (a package not listed must not define it). No pre
// or post hook may join them, at the root or in a package. As pinned they
// write nothing another part reads: `tsc --noEmit` and vitest in each
// package, and `eslint .`; the tests write to temp dirs only. Not `build`:
// electron-vite writes apps/desktop/out/. When any of this drifts, the whole
// check runs as plain `pnpm check` (slower, still correct) until pinned here.
const SIDE_BY_SIDE = {
  typecheck: {
    script: 'pnpm -r --no-bail typecheck',
    packages: {
      'apps/desktop':
        'tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json && tsc --noEmit -p tsconfig.test-web.json',
      'packages/shared': 'tsc --noEmit',
    },
  },
  lint: { script: 'eslint .' },
  test: {
    script: 'pnpm -r --no-bail test',
    packages: { 'apps/desktop': 'vitest run', 'packages/shared': 'vitest run' },
  },
};

// Words no shell splits, quotes or expands, so the argv is exactly what
// `sh -c` would pass. Anything else in "check" falls back to `pnpm check`.
const WORD = '[\\w.:/@=-]+';
const PART = `pnpm(?: +${WORD})+`;
const CHAIN = new RegExp(`^ *${PART}(?: +&& +${PART})+ *$`);

const show = (argv) => argv.join(' ');
const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;
const hooksOf = (name) => [`pre${name}`, `post${name}`];

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

// The packages `pnpm -r` runs in, from pnpm-workspace.yaml: plain `dir` and
// `dir/*` entries only (a dir counts when it holds a package.json, as for
// pnpm). Any other shape is an error, so the check runs as `pnpm check`.
function workspacePackages(root) {
  let text;
  try {
    text = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
  } catch {
    return { error: 'there is no readable pnpm-workspace.yaml' };
  }
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^packages:\s*$/.test(line));
  if (start < 0) return { error: 'pnpm-workspace.yaml has no "packages:" list' };
  const globs = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s*(#.*)?$/.test(line)) continue;
    if (!/^\s/.test(line)) break;
    const item = line.match(/^\s+-\s+(['"]?)([\w.@-]+(?:\/[\w.@-]+)*)(\/\*)?\1\s*$/);
    if (item === null || item[2].split('/').includes('..')) {
      return { error: `pnpm-workspace.yaml lists a package glob this script does not read: ${line.trim()}` };
    }
    globs.push({ dir: item[2], children: item[3] !== undefined });
  }
  const packages = new Map();
  for (const { dir, children } of globs) {
    let dirs = [dir];
    if (children) {
      try {
        dirs = readdirSync(join(root, dir), { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => `${dir}/${entry.name}`);
      } catch {
        dirs = [];
      }
    }
    for (const pkgDir of dirs) {
      const manifest = join(root, pkgDir, 'package.json');
      if (!existsSync(manifest)) continue;
      const pkg = readJson(manifest);
      if (pkg === null) return { error: `${pkgDir}/package.json is not readable JSON` };
      packages.set(pkgDir, pkg.scripts ?? {});
    }
  }
  return { packages };
}

// Why the parts named in "check" that may run side by side do not run exactly
// what SIDE_BY_SIDE pins, or '' when they do.
function pinDrift(root, scripts, names) {
  let workspace = null;
  for (const name of names) {
    const pin = SIDE_BY_SIDE[name];
    if (scripts[name] !== pin.script) {
      return `"${name}" is ${JSON.stringify(scripts[name] ?? null)}, not the pinned ${JSON.stringify(pin.script)}`;
    }
    const rootHook = hooksOf(name).find((hook) => Object.hasOwn(scripts, hook));
    if (rootHook) return `"${rootHook}" runs with pnpm ${name}`;
    if (!pin.packages) continue;
    workspace ??= workspacePackages(root);
    if (workspace.error) return workspace.error;
    const each = pin.script.split(' ').at(-1);
    for (const [pkgDir, pkgScripts] of workspace.packages) {
      const expected = pin.packages[pkgDir];
      if (pkgScripts[each] !== expected) {
        return `${pkgDir} "${each}" is ${JSON.stringify(pkgScripts[each] ?? null)}, not the pinned ${JSON.stringify(expected ?? null)}`;
      }
      const hook = hooksOf(each).find((h) => Object.hasOwn(pkgScripts, h));
      if (hook) return `${pkgDir} "${hook}" runs with pnpm -r ${each}`;
    }
    const missing = Object.keys(pin.packages).find((pkgDir) => !workspace.packages.has(pkgDir));
    if (missing) return `the pinned workspace package ${missing} is gone`;
  }
  return '';
}

function planOf(root) {
  const pkg = readJson(join(root, 'package.json'));
  const scripts = pkg?.scripts ?? {};
  const check = scripts.check;
  if (typeof check !== 'string') return { sequential: 'package.json has no "check" script' };
  if (!CHAIN.test(check)) {
    return { sequential: `"check" is not a plain chain of pnpm commands joined by &&: ${JSON.stringify(check)}` };
  }
  for (const hook of hooksOf('check')) {
    if (Object.hasOwn(scripts, hook)) return { sequential: `"${hook}" runs only with pnpm check` };
  }
  const parts = check
    .trim()
    .split(/ +&& +/)
    .map((part) => part.split(/ +/));
  const sideBySide = (argv) => argv.length === 2 && Object.hasOwn(SIDE_BY_SIDE, argv[1]);
  const drift = pinDrift(root, scripts, parts.filter(sideBySide).map((argv) => argv[1]));
  if (drift) return { sequential: `${drift}, so no part runs side by side until the change is pinned` };
  const stages = [];
  let previous = false;
  for (const argv of parts) {
    const current = sideBySide(argv);
    if (current && previous) stages.at(-1).push(argv);
    else stages.push([argv]);
    previous = current;
  }
  if (stages.every((stage) => stage.length === 1)) {
    return { sequential: 'no two neighbouring parts of "check" may run side by side' };
  }
  return { stages };
}

const running = new Set();
let stopping = '';

function killGroups(signal) {
  for (const child of running) {
    try {
      process.kill(-child.pid, signal);
    } catch {
      // the group is already gone
    }
  }
}

// Stops every running part on SIGINT/SIGTERM. The step must `exec` this
// script so the runner's signals on cancel or timeout reach it.
function stopOnSignals() {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      // A second signal, or a part that ignores the first, gets SIGKILL.
      killGroups(stopping ? 'SIGKILL' : 'SIGTERM');
      stopping = signal;
      setTimeout(() => killGroups('SIGKILL'), 10_000).unref();
    });
  }
}

const stoppedCode = () => (stopping === 'SIGINT' ? 130 : 143);

// Output goes to logPath, or straight through when it is null.
function runPart(argv, logPath, announce) {
  return new Promise((resolve) => {
    const log = logPath === null ? 'inherit' : openSync(logPath, 'w');
    const started = Date.now();
    // Its own process group, so a stop reaches pnpm, the shell and every
    // worker under them.
    const child = spawn(argv[0], argv.slice(1), { detached: true, stdio: ['ignore', log, log] });
    if (logPath !== null) closeSync(log);
    running.add(child);
    let settled = false;
    const settle = (code, how) => {
      if (settled) return;
      settled = true;
      running.delete(child);
      const result = { command: show(argv), logPath, code, detail: `${how}, ${seconds(Date.now() - started)}` };
      if (announce) console.log(`ci-parallel-check: ${status(result)}`);
      resolve(result);
    };
    child.on('error', (error) => settle(-1, error.message));
    child.on('close', (code, signal) => settle(code ?? -1, signal ? `killed by ${signal}` : `exit ${code}`));
  });
}

function status(result) {
  return `${result.command}: ${result.code === 0 ? 'ok' : 'FAILED'} (${result.detail})`;
}

function printLog(result) {
  const log = readFileSync(result.logPath);
  // A passing part folds into a group; a failing part's output stays in view.
  console.log(result.code === 0 ? `::group::${status(result)}` : status(result));
  process.stdout.write(log);
  if (log.length > 0 && log.at(-1) !== 0x0a) process.stdout.write('\n');
  if (result.code === 0) console.log('::endgroup::');
}

async function runStages(stages) {
  const logDir = mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), 'ci-parallel-check-'));
  console.log(
    `ci-parallel-check: ${stages.map((stage) => stage.map(show).join(' | ')).join(', then ')}; logs in ${logDir}`,
  );
  const started = Date.now();
  const failed = [];
  let index = 0;
  for (const stage of stages) {
    if (failed.length > 0 || stopping) {
      for (const argv of stage) console.log(`${show(argv)}: not run, ${stopping ? 'stopped' : 'an earlier part failed'}`);
      continue;
    }
    const results = await Promise.all(
      stage.map((argv) => {
        index += 1;
        const logPath = join(logDir, `${index}-${argv.slice(1).join('-').replace(/[^\w.-]/g, '_')}.log`);
        return runPart(argv, logPath, stage.length > 1);
      }),
    );
    for (const result of results) printLog(result);
    failed.push(...results.filter((result) => result.code !== 0).map((result) => result.command));
  }
  rmSync(logDir, { recursive: true, force: true });
  const took = seconds(Date.now() - started);
  if (stopping) {
    console.log(`ci-parallel-check: stopped by ${stopping} after ${took}`);
    process.exitCode = stoppedCode();
  } else if (failed.length > 0) {
    console.log(`::error::ci-parallel-check: failed: ${failed.join(', ')} (${took})`);
    process.exitCode = 1;
  } else {
    console.log(`ci-parallel-check: every part passed in ${took}`);
  }
}

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--plan')) {
  console.error('usage: node scripts/ci-parallel-check.mjs [--plan]');
  process.exit(2);
}

const plan = planOf(process.cwd());

if (args[0] === '--plan') {
  console.log(JSON.stringify(plan.stages ? { stages: plan.stages.map((stage) => stage.map(show)) } : plan));
} else if (plan.sequential) {
  console.log(`::notice::ci-parallel-check: ${plan.sequential}; running pnpm check`);
  stopOnSignals();
  const result = await runPart(['pnpm', 'check'], null, false);
  if (stopping) {
    console.log(`ci-parallel-check: stopped by ${stopping}`);
    process.exitCode = stoppedCode();
  } else if (result.code !== 0) {
    console.log(`::error::ci-parallel-check: ${status(result)}`);
    process.exitCode = result.code > 0 ? result.code : 1;
  }
} else {
  stopOnSignals();
  await runStages(plan.stages);
}
