import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const cli = resolve(repoRoot, 'apps/desktop/scripts/release-feed.mjs');
const ciGate = resolve(repoRoot, 'apps/desktop/scripts/assert-ci-success.mjs');
const publisher = resolve(repoRoot, 'apps/desktop/scripts/publish-feed.sh');
const publisherEnv = {
  ...process.env,
  CHATGOOSE_ALLOW_PORTABLE_LOCK_FALLBACK: '1',
};

function fixture(dir: string, version: string, body: string): { manifest: string; artifact: string; sha: string } {
  const artifactName = `ChatGoose-Setup-${version}.exe`;
  const artifact = join(dir, artifactName);
  const sha = createHash('sha512').update(body).digest('base64');
  writeFileSync(artifact, body);
  writeFileSync(`${artifact}.blockmap`, 'blockmap');
  const manifest = join(dir, 'latest.yml');
  writeFileSync(manifest, `version: ${version}\npath: ${artifactName}\nsha512: ${sha}\n`);
  return { manifest, artifact, sha };
}

function workflowRunScript(stepName: string): string {
  const workflow = readFileSync(resolve(repoRoot, '.github/workflows/windows-build.yml'), 'utf8')
    .replace(/\r\n/g, '\n');
  const marker = `      - name: ${stepName}\n`;
  const stepStart = workflow.indexOf(marker);
  expect(stepStart).toBeGreaterThan(-1);
  const runMarker = '        run: |\n';
  const scriptStart = workflow.indexOf(runMarker, stepStart) + runMarker.length;
  expect(scriptStart).toBeGreaterThan(runMarker.length - 1);
  const tail = workflow.slice(scriptStart);
  const nextStep = tail.search(/\n {6}- (?:name:|uses:)/);
  const block = nextStep === -1 ? tail : tail.slice(0, nextStep);
  return block
    .split('\n')
    .map((line) => (line.startsWith('          ') ? line.slice(10) : line))
    .join('\n');
}

function writeExecutable(path: string, body: string): void {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

function toBashPath(path: string): string {
  if (process.platform !== 'win32') return path;
  return path
    .replace(/^([A-Za-z]):[\\/]/, (_match, drive: string) => `/${drive.toLowerCase()}/`)
    .replaceAll('\\', '/');
}

function bashPathWith(prepend: string): string {
  const inherited = execFileSync('bash', ['-lc', 'printf %s "$PATH"'], { encoding: 'utf8' });
  return `${toBashPath(prepend)}:${inherited}`;
}

function readNormalized(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

function markStaleForBash(path: string, date: Date): void {
  const pad = (value: number) => String(value).padStart(2, '0');
  const timestamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
    + `${pad(date.getHours())}${pad(date.getMinutes())}.${pad(date.getSeconds())}`;
  execFileSync('bash', [
    '-c',
    'touch -t "$1" "$2"',
    'bash',
    timestamp,
    toBashPath(path),
  ]);
}

describe('Windows release feed policy', () => {
  it('validates local and served installer SHA-512 against latest.yml', () => {
    const dir = mkdtempSync(join(tmpdir(), 'chatgoose-release-'));
    const built = fixture(dir, '1.2.3', 'installer-one');
    const metadata = execFileSync(process.execPath, [cli, 'metadata', built.manifest], { encoding: 'utf8' });
    expect(metadata).toContain('version=1.2.3');
    expect(metadata).toContain(`sha512=${built.sha}`);

    writeFileSync(built.artifact, 'tampered');
    expect(spawnSync(process.execPath, [cli, 'verify-artifact', built.manifest, built.artifact]).status)
      .not.toBe(0);
  });

  it('publishes under a crash-safe lock, retries identical success, and rejects conflicts', () => {
    const root = mkdtempSync(join(tmpdir(), 'chatgoose-feed-'));
    const feed = join(root, 'feed');
    mkdirSync(join(feed, '.incoming'), { recursive: true });
    fixture(feed, '1.2.3', 'old');

    const stage = join(feed, '.incoming', 'run-new');
    mkdirSync(stage);
    fixture(stage, '1.2.4', 'new');
    execFileSync('bash', [publisher, feed, stage], { env: publisherEnv });
    expect(readFileSync(join(feed, 'latest.yml'), 'utf8')).toContain('version: 1.2.4');
    expect(readFileSync(join(feed, 'ChatGoose-Setup-1.2.4.exe'), 'utf8')).toBe('new');

    const retry = join(feed, '.incoming', 'run-retry');
    mkdirSync(retry);
    fixture(retry, '1.2.4', 'new');
    expect(() => execFileSync('bash', [publisher, feed, retry], { env: publisherEnv })).not.toThrow();

    const conflict = join(feed, '.incoming', 'run-conflict');
    mkdirSync(conflict);
    fixture(conflict, '1.2.4', 'different bytes');
    expect(spawnSync('bash', [publisher, feed, conflict], { env: publisherEnv }).status).not.toBe(0);
    expect(existsSync(conflict)).toBe(false);

    const stale = join(feed, '.incoming', 'run-stale');
    mkdirSync(stale);
    fixture(stale, '1.2.3', 'stale');
    expect(spawnSync('bash', [publisher, feed, stale], { env: publisherEnv }).status).not.toBe(0);
    expect(existsSync(stale)).toBe(false);
    expect(readFileSync(join(feed, 'latest.yml'), 'utf8')).toContain('version: 1.2.4');

    // The portable fallback reclaims this dead owner; production Linux uses
    // flock, which ignores/removes no stale directory state at all.
    const staleLock = join(feed, '.publish.lock.d');
    mkdirSync(staleLock, { recursive: true });
    writeFileSync(join(staleLock, 'pid'), '99999999\n');
    const afterCrash = join(feed, '.incoming', 'run-after-crash');
    mkdirSync(afterCrash);
    fixture(afterCrash, '1.2.5', 'after crash');
    expect(() => execFileSync('bash', [publisher, feed, afterCrash], { env: publisherEnv })).not.toThrow();
    expect(readFileSync(join(feed, 'latest.yml'), 'utf8')).toContain('version: 1.2.5');
  });

  it('cleans a rejected validated stage but never deletes an unsafe directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'chatgoose-feed-cleanup-'));
    const feed = join(root, 'feed');
    mkdirSync(join(feed, '.incoming'), { recursive: true });
    fixture(feed, '1.2.3', 'old');

    const badHash = join(feed, '.incoming', 'run-bad-hash');
    mkdirSync(badHash);
    const staged = fixture(badHash, '1.2.4', 'candidate');
    writeFileSync(staged.artifact, 'tampered after manifest');
    expect(spawnSync('bash', [publisher, feed, badHash], { env: publisherEnv }).status).not.toBe(0);
    expect(existsSync(badHash)).toBe(false);
    expect(readFileSync(join(feed, 'latest.yml'), 'utf8')).toContain('version: 1.2.3');

    const unsafe = join(root, 'outside-incoming');
    mkdirSync(unsafe);
    fixture(unsafe, '1.2.4', 'must survive');
    expect(spawnSync('bash', [publisher, feed, unsafe], { env: publisherEnv }).status).not.toBe(0);
    expect(existsSync(unsafe)).toBe(true);
  });

  it('publishes when the script is streamed to remote bash stdin', () => {
    const root = mkdtempSync(join(tmpdir(), 'chatgoose-feed-stdin-'));
    const feed = join(root, 'feed');
    mkdirSync(join(feed, '.incoming'), { recursive: true });
    fixture(feed, '1.2.3', 'old');

    const stage = join(feed, '.incoming', 'run-stdin');
    mkdirSync(stage);
    fixture(stage, '1.2.4', 'new');

    const publisherScript = readFileSync(publisher, 'utf8');
    expect(publisherScript).not.toContain('\r');
    const result = spawnSync('bash', ['-s', '--', feed, stage], {
      env: publisherEnv,
      input: publisherScript,
      encoding: 'utf8',
    });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(readFileSync(join(feed, 'latest.yml'), 'utf8')).toContain('version: 1.2.4');
  });

  it('cleans the remote stage and private key when transport fails before the remote publisher starts', () => {
    const root = mkdtempSync(join(tmpdir(), 'chatgoose-upload-transport-failure-'));
    const releaseDir = join(root, 'apps/desktop/release');
    const scriptsDir = join(root, 'apps/desktop/scripts');
    const mockBin = join(root, 'mock-bin');
    const home = join(root, 'home');
    const runnerTemp = join(root, 'runner-temp');
    const feed = join(root, 'remote-feed');
    for (const dir of [releaseDir, scriptsDir, mockBin, home, runnerTemp, join(feed, '.incoming')]) {
      mkdirSync(dir, { recursive: true });
    }
    const staleStage = join(feed, '.incoming', 'abandoned-hard-kill');
    const freshStage = join(feed, '.incoming', 'still-active');
    mkdirSync(staleStage);
    mkdirSync(freshStage);
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60_000);
    // Set the timestamp through the same Git-Bash/MSYS filesystem view used
    // by the mocked remote `find`; Node's Win32 directory utimes are not
    // consistently surfaced to GNU find on windows-latest.
    markStaleForBash(staleStage, fourHoursAgo);
    fixture(releaseDir, '1.2.4', 'candidate installer');
    writeFileSync(join(scriptsDir, 'release-feed.mjs'), readFileSync(cli));
    writeFileSync(join(scriptsDir, 'publish-feed.sh'), readFileSync(publisher));
    const mockLog = join(root, 'transport.log');
    writeExecutable(
      join(mockBin, 'ssh'),
      `#!/usr/bin/env bash
set -eu
printf 'ssh %s\\n' "$*" >> "$MOCK_LOG"
remote_command="\${!#}"
if [[ "$remote_command" == *"bash -s --"* ]]; then
  exit 1
fi
if [[ "$remote_command" == *"find "* || "$remote_command" == *"mkdir -p"* || "$remote_command" == case\\ * ]]; then
  bash -c "$remote_command"
fi
`,
    );
    writeExecutable(
      join(mockBin, 'scp'),
      `#!/usr/bin/env bash
set -eu
printf 'scp %s\\n' "$*" >> "$MOCK_LOG"
destination="\${!#}"
stage="\${destination#*:}"
mkdir -p "$stage"
touch "$stage/scp-succeeded"
`,
    );
    writeExecutable(join(mockBin, 'curl'), '#!/usr/bin/env bash\nexit 1\n');
    writeExecutable(join(mockBin, 'sleep'), '#!/usr/bin/env bash\nexit 0\n');

    const result = spawnSync('bash', ['-c', workflowRunScript('Upload to the update feed')], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: bashPathWith(mockBin),
        HOME: toBashPath(home),
        SSH_KEY: 'test-private-key',
        FEED_DIR: toBashPath(feed),
        FEED_URL: 'https://feed.invalid',
        GITHUB_RUN_ID: '29210025236',
        GITHUB_RUN_ATTEMPT: '1',
        GITHUB_OUTPUT: toBashPath(join(root, 'github-output')),
        RUNNER_TEMP: toBashPath(runnerTemp),
        MOCK_LOG: toBashPath(mockLog),
      },
    });

    expect(result.status).not.toBe(0);
    const stage = join(feed, '.incoming', '29210025236-1');
    expect(existsSync(stage)).toBe(false);
    expect(existsSync(staleStage)).toBe(false);
    expect(existsSync(freshStage)).toBe(true);
    expect(existsSync(join(home, '.ssh/id_ed25519'))).toBe(false);
    const log = readFileSync(mockLog, 'utf8');
    const bashFeed = toBashPath(feed);
    const bashStage = toBashPath(stage);
    expect(log).toContain(`mkdir -p '${bashStage}'`);
    expect(log).toContain(`bash -s -- '${bashFeed}' '${bashStage}'`);
    expect(log).toContain(`rm -rf -- '${bashStage}'`);
  });

  it('accepts only a successful completed CI run for the exact release SHA', () => {
    const sha = 'a'.repeat(40);
    const success = spawnSync(process.execPath, [ciGate, sha], {
      encoding: 'utf8',
      input: JSON.stringify({
        workflow_runs: [
          { head_sha: 'b'.repeat(40), status: 'completed', conclusion: 'success' },
          { head_sha: sha, status: 'completed', conclusion: 'success', html_url: 'https://ci/run/1' },
        ],
      }),
    });
    expect(success.status).toBe(0);
    expect(success.stdout).toContain('https://ci/run/1');

    const pending = spawnSync(process.execPath, [ciGate, sha], {
      encoding: 'utf8',
      input: JSON.stringify({ workflow_runs: [{ head_sha: sha, status: 'in_progress', conclusion: null }] }),
    });
    expect(pending.status).not.toBe(0);
  });

  it('pins the repository-controlled workflow gates and roll-forward runbook', () => {
    const workflow = readNormalized(resolve(repoRoot, '.github/workflows/windows-build.yml'));
    const ci = readNormalized(resolve(repoRoot, '.github/workflows/ci.yml'));
    expect(workflow).toMatch(/concurrency:/);
    expect(workflow).toMatch(/build:\n\s+runs-on: windows-latest\n\s+timeout-minutes: 130/);
    expect(workflow).toMatch(/permissions:\n\s+actions: read\n\s+contents: read/);
    expect(workflow).toMatch(/fetch-depth:\s*0/);
    expect(workflow).toContain('git merge-base --is-ancestor');
    expect(workflow).toContain('run: pnpm check');
    expect(workflow).toContain('publish-feed.sh');
    expect(workflow).toContain('command -v flock');
    expect(workflow).toMatch(/SSH acknowledgement was lost/);
    expect(workflow).toMatch(/ambiguous publication verification attempt/);
    expect(workflow).toMatch(/for attempt in 1 2 3 4 5 6/);
    expect(workflow).toContain('trap cleanup_publish EXIT');
    expect(workflow).toContain("rm -rf -- '$stage_dir'");
    expect(workflow).toContain('rm -f ~/.ssh/id_ed25519');
    expect(workflow.indexOf('trap cleanup_publish EXIT')).toBeLessThan(
      workflow.indexOf("printf '%s\\n' \"$SSH_KEY\" > ~/.ssh/id_ed25519"),
    );
    expect(workflow.indexOf('rm -f ~/.ssh/id_ed25519')).toBeLessThan(
      workflow.indexOf('- name: Assert served feed version == package.json == tag'),
    );
    expect(workflow).toMatch(
      /- name: Remove update-feed deploy key\n\s+if: always\(\)[\s\S]*?run: rm -f ~\/\.ssh\/id_ed25519/,
    );
    expect(workflow.indexOf('- name: Remove update-feed deploy key')).toBeLessThan(
      workflow.indexOf('- name: Assert served feed version == package.json == tag'),
    );
    expect(workflow).toContain('-o ConnectTimeout=10');
    expect(workflow).toContain('--max-time 120');
    expect(workflow).toContain('assert-ci-success.mjs');
    expect(workflow).toContain("-mmin +180 -exec rm -rf -- {} +");
    expect(workflow).not.toMatch(/curl[^\n]*\s-k/);

    // Keep the existing Linux required-check identity while adding the same
    // cross-platform gate that must pass before a release tag is published.
    expect(ci).toMatch(/check:\n\s+name: pnpm check\n\s+runs-on: ubuntu-latest/);
    expect(ci).toMatch(/windows-check:\n\s+name: pnpm check \(Windows\)\n\s+runs-on: windows-latest/);
    expect(ci.match(/run: pnpm check/g)).toHaveLength(2);

    const release = readNormalized(resolve(repoRoot, 'docs/RELEASE.md'));
    expect(release).toMatch(/higher-semver/i);
    expect(release).toMatch(/roll forward/i);
    expect(release).toMatch(/wait for \*\*both\*\* release-prerequisite CI jobs/i);
    expect(release).toMatch(/pnpm check \(Windows\)/);
    expect(release).toMatch(/refuses\s+to build or publish unless the exact tag SHA/i);
    expect(release).not.toMatch(/rolls the fleet to whatever `latest\.yml` points at/i);

    const rootPackage = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
      pnpm?: { overrides?: Record<string, string> };
    };
    expect(rootPackage.pnpm?.overrides?.['js-yaml']).toBe('4.3.0');

    const publisherScript = readFileSync(publisher, 'utf8');
    expect(publisherScript).toContain('flock -n');
    expect(publisherScript).toMatch(/already published version=/);
  });
});
