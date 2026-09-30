#!/usr/bin/env node
// `pnpm check` on the PC runners (ci.yml, self-hosted only): the same parts,
// read from package.json's "check" at run time and run with the same argv,
// but the parts that only read the tree run side by side. Every other part
// runs alone at its place in the chain, and a stage starts only after every
// earlier part passed, as with `&&`. Each part logs to its own file; the logs
// print in chain order when their stage ends. A "check" that is not a plain
// `pnpm … && pnpm …` chain runs as `pnpm check` itself. GitHub-hosted runners
// and local runs keep `pnpm check`.
//
//   node scripts/ci-parallel-check.mjs          run the check
//   node scripts/ci-parallel-check.mjs --plan   print the stages as JSON, run nothing

import { spawn, spawnSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Parts that write nothing another part reads: `tsc --noEmit` and vitest in
// each package, and `eslint .`. The tests write to temp dirs only (a golden
// context-blocks.txt only when it is missing or with UPDATE_GOLDEN). Not
// `build`: electron-vite writes apps/desktop/out/. A new part runs alone
// until it is known to be as harmless.
const READ_ONLY_PARTS = new Set(['typecheck', 'lint', 'test']);

// Words no shell splits, quotes or expands, so the argv is exactly what
// `sh -c` would pass. Anything else in "check" falls back to `pnpm check`.
const WORD = '[\\w.:/@=-]+';
const PART = `pnpm(?: +${WORD})+`;
const CHAIN = new RegExp(`^ *${PART}(?: +&& +${PART})+ *$`);

const show = (argv) => argv.join(' ');
const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;

function planOf(pkg) {
  const scripts = pkg?.scripts ?? {};
  const check = scripts.check;
  if (typeof check !== 'string') return { sequential: 'package.json has no "check" script' };
  if (!CHAIN.test(check)) {
    return { sequential: `"check" is not a plain chain of pnpm commands joined by &&: ${JSON.stringify(check)}` };
  }
  for (const hook of ['precheck', 'postcheck']) {
    if (Object.hasOwn(scripts, hook)) return { sequential: `"${hook}" runs only with pnpm check` };
  }
  const stages = [];
  let previousReadOnly = false;
  for (const part of check.trim().split(/ +&& +/)) {
    const argv = part.split(/ +/);
    const name = argv.length === 2 ? argv[1] : '';
    const readOnly =
      READ_ONLY_PARTS.has(name) && !Object.hasOwn(scripts, `pre${name}`) && !Object.hasOwn(scripts, `post${name}`);
    if (readOnly && previousReadOnly) stages.at(-1).push(argv);
    else stages.push([argv]);
    previousReadOnly = readOnly;
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

function runPart(argv, logPath, announce) {
  return new Promise((resolve) => {
    const log = openSync(logPath, 'w');
    const started = Date.now();
    // Its own process group, so a stop reaches pnpm, the shell and every
    // worker under them.
    const child = spawn(argv[0], argv.slice(1), { detached: true, stdio: ['ignore', log, log] });
    closeSync(log);
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
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      // A second signal, or a part that ignores the first, gets SIGKILL.
      killGroups(stopping ? 'SIGKILL' : 'SIGTERM');
      stopping = signal;
      setTimeout(() => killGroups('SIGKILL'), 10_000).unref();
    });
  }
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
  const took = seconds(Date.now() - started);
  if (stopping) {
    console.log(`ci-parallel-check: stopped by ${stopping} after ${took}`);
    process.exitCode = stopping === 'SIGINT' ? 130 : 143;
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

let pkg = null;
try {
  pkg = JSON.parse(readFileSync('package.json', 'utf8'));
} catch {
  // no readable package.json: the plan falls back to `pnpm check`, which says why
}
const plan = planOf(pkg);

if (args[0] === '--plan') {
  console.log(JSON.stringify(plan.stages ? { stages: plan.stages.map((stage) => stage.map(show)) } : plan));
} else if (plan.sequential) {
  console.log(`::notice::ci-parallel-check: ${plan.sequential}; running pnpm check`);
  const run = spawnSync('pnpm', ['check'], { stdio: 'inherit' });
  if (run.error) console.error(`ci-parallel-check: ${run.error.message}`);
  process.exitCode = run.status ?? 1;
} else {
  await runStages(plan.stages);
}
