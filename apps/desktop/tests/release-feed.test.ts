import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const cli = resolve(repoRoot, 'apps/desktop/scripts/release-feed.mjs');
const ciGate = resolve(repoRoot, 'apps/desktop/scripts/assert-ci-success.mjs');
const kernelGate = resolve(repoRoot, 'apps/desktop/scripts/assert-kernel-capabilities.mjs');
const publisher = resolve(repoRoot, 'apps/desktop/scripts/publish-feed.sh');
const publisherEnv = {
  ...process.env,
  CHATGOOSE_ALLOW_PORTABLE_LOCK_FALLBACK: '1',
  CHATGOOSE_FEED_MIN_FREE_KIB: '0',
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

function readNormalized(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

describe('Windows release feed policy', () => {
  it('blocks publication until production Core advertises the required lifecycle', () => {
    const missing = spawnSync(process.execPath, [kernelGate, 'desktop-lifecycle-v2'], {
      input: JSON.stringify({ status: 'ok', capabilities: ['older-contract'] }),
      encoding: 'utf8',
    });
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain('does not advertise required capability desktop-lifecycle-v2');

    const ready = spawnSync(process.execPath, [kernelGate, 'desktop-lifecycle-v2'], {
      input: JSON.stringify({ status: 'ok', capabilities: ['desktop-lifecycle-v2'] }),
      encoding: 'utf8',
    });
    expect(ready.status, ready.stderr).toBe(0);
    expect(ready.stdout).toContain('production Core capability present: desktop-lifecycle-v2');
  });

  it('rechecks the production lifecycle after staging and immediately before atomic publication', () => {
    const script = workflowRunScript('Upload to the update feed');
    expect(script).toContain('https://gosling-agency.ru/api/v1/health');
    expect(script).toContain('assert-kernel-capabilities.mjs desktop-lifecycle-v2');
    const stageIndex = script.indexOf('scp "${SSH_OPTIONS[@]}"');
    const recheckIndex = script.indexOf('core_verified=false', stageIndex);
    const publishIndex = script.indexOf(
      'if ! ssh "${SSH_OPTIONS[@]}" cgupdates@45.8.230.111 "bash -s -- \'$FEED_DIR\' \'$stage_dir\'"',
      recheckIndex,
    );
    expect(stageIndex).toBeGreaterThan(-1);
    expect(recheckIndex).toBeGreaterThan(stageIndex);
    expect(publishIndex).toBeGreaterThan(recheckIndex);
    expect(script.slice(recheckIndex, publishIndex)).toContain(
      'assert-kernel-capabilities.mjs desktop-lifecycle-v2',
    );
  });

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

  it('dry-runs and applies bounded installer retention while protecting latest.yml and every blockmap', () => {
    const root = mkdtempSync(join(tmpdir(), 'chatgoose-feed-retention-'));
    const feed = join(root, 'feed');
    mkdirSync(join(feed, '.incoming'), { recursive: true });
    for (const version of ['1.2.1', '1.2.2', '1.2.3', '1.2.4']) {
      fixture(feed, version, `installer-${version}`);
    }
    for (const version of ['8.8.8', '9.9.9']) {
      writeFileSync(join(feed, `ChatGoose-Setup-${version}.exe`), `orphan-${version}`);
      writeFileSync(join(feed, `ChatGoose-Setup-${version}.exe.blockmap`), `blockmap-${version}`);
    }

    const env = { ...publisherEnv, CHATGOOSE_FEED_KEEP_INSTALLERS: '2' };
    const beforeDryRun = readdirSync(feed).sort();
    const dryRun = spawnSync('bash', [publisher, '--maintain', feed, '--dry-run'], {
      env,
      encoding: 'utf8',
    });
    expect(dryRun.status, dryRun.stderr).toBe(0);
    expect(dryRun.stdout).toContain('retention would remove installer=');
    expect(readdirSync(feed).sort()).toEqual(beforeDryRun);

    const applied = spawnSync('bash', [publisher, '--maintain', feed], { env, encoding: 'utf8' });
    expect(applied.status, applied.stderr).toBe(0);
    expect(readdirSync(feed).filter((name) => name.endsWith('.exe')).sort()).toEqual([
      'ChatGoose-Setup-1.2.4.exe',
      'ChatGoose-Setup-9.9.9.exe',
    ]);
    expect(readFileSync(join(feed, 'latest.yml'), 'utf8')).toContain('version: 1.2.4');
    for (const version of ['1.2.1', '1.2.2', '1.2.3', '1.2.4', '8.8.8', '9.9.9']) {
      expect(existsSync(join(feed, `ChatGoose-Setup-${version}.exe.blockmap`))).toBe(true);
    }
  });

  it('retains the current and previous installers before publishing the new manifest last', () => {
    const root = mkdtempSync(join(tmpdir(), 'chatgoose-feed-publish-retention-'));
    const feed = join(root, 'feed');
    mkdirSync(join(feed, '.incoming'), { recursive: true });
    for (const version of ['1.2.1', '1.2.2', '1.2.3']) {
      fixture(feed, version, `installer-${version}`);
    }

    const stage = join(feed, '.incoming', 'run-retained');
    mkdirSync(stage);
    fixture(stage, '1.2.4', 'candidate');
    const result = spawnSync('bash', [publisher, feed, stage], {
      env: { ...publisherEnv, CHATGOOSE_FEED_KEEP_INSTALLERS: '3' },
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    expect(readdirSync(feed).filter((name) => name.endsWith('.exe')).sort()).toEqual([
      'ChatGoose-Setup-1.2.2.exe',
      'ChatGoose-Setup-1.2.3.exe',
      'ChatGoose-Setup-1.2.4.exe',
    ]);
    expect(readFileSync(join(feed, 'latest.yml'), 'utf8')).toContain('version: 1.2.4');
    expect(existsSync(join(feed, 'ChatGoose-Setup-1.2.1.exe.blockmap'))).toBe(true);
  });

  it('fails below the disk-space floor without switching the manifest or leaking the stage', () => {
    const root = mkdtempSync(join(tmpdir(), 'chatgoose-feed-disk-floor-'));
    const feed = join(root, 'feed');
    mkdirSync(join(feed, '.incoming'), { recursive: true });
    fixture(feed, '1.2.3', 'current');
    const stage = join(feed, '.incoming', 'run-no-space');
    mkdirSync(stage);
    fixture(stage, '1.2.4', 'candidate');

    const result = spawnSync('bash', [publisher, feed, stage], {
      env: { ...publisherEnv, CHATGOOSE_FEED_MIN_FREE_KIB: '999999999999999' },
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/free space/i);
    expect(readFileSync(join(feed, 'latest.yml'), 'utf8')).toContain('version: 1.2.3');
    expect(readFileSync(join(feed, 'ChatGoose-Setup-1.2.3.exe'), 'utf8')).toBe('current');
    expect(existsSync(join(feed, 'ChatGoose-Setup-1.2.4.exe'))).toBe(false);
    expect(existsSync(stage)).toBe(false);
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

    const invalidRetention = join(feed, '.incoming', 'run-invalid-retention');
    mkdirSync(invalidRetention);
    fixture(invalidRetention, '1.2.4', 'candidate');
    expect(spawnSync('bash', [publisher, feed, invalidRetention], {
      env: { ...publisherEnv, CHATGOOSE_FEED_KEEP_INSTALLERS: '1' },
    }).status).not.toBe(0);
    expect(existsSync(invalidRetention)).toBe(false);

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
    fixture(releaseDir, '1.2.4', 'candidate installer');
    writeFileSync(join(scriptsDir, 'release-feed.mjs'), readFileSync(cli));
    writeFileSync(join(scriptsDir, 'assert-kernel-capabilities.mjs'), readFileSync(kernelGate));
    writeFileSync(join(scriptsDir, 'publish-feed.sh'), readFileSync(publisher));
    const mockLog = join(root, 'transport.log');
    writeExecutable(
      join(mockBin, 'ssh'),
      `#!/usr/bin/env bash
set -eu
printf 'ssh %s\\n' "$*" >> "$MOCK_LOG"
remote_command="\${!#}"
if [[ "$remote_command" == *"bash -s -- --maintain"* ]]; then
  cat >/dev/null
  exit 0
fi
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
    writeExecutable(
      join(mockBin, 'curl'),
      '#!/usr/bin/env bash\nif [[ "$*" == *"/api/v1/health"* ]]; then printf \'%s\\n\' \'{"status":"ok","capabilities":["desktop-lifecycle-v2"]}\'; exit 0; fi\nexit 1\n',
    );
    writeExecutable(join(mockBin, 'sleep'), '#!/usr/bin/env bash\nexit 0\n');

    const uploadScript = `export PATH="$1:$PATH"\n${workflowRunScript('Upload to the update feed')}`;
    const result = spawnSync('bash', [
      '-c',
      uploadScript,
      'chatgoose-release-harness',
      toBashPath(mockBin),
    ], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
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
    expect(existsSync(join(home, '.ssh/id_ed25519'))).toBe(false);
    const log = readFileSync(mockLog, 'utf8');
    const bashFeed = toBashPath(feed);
    const bashStage = toBashPath(stage);
    expect(log).toContain(`mkdir -p '${bashStage}'`);
    expect(log).toContain(`bash -s -- '${bashFeed}' '${bashStage}'`);
    expect(log).toContain(`rm -rf -- '${bashStage}'`);
    expect(log.indexOf(`bash -s -- --maintain '${bashFeed}'`)).toBeLessThan(
      log.indexOf(`mkdir -p '${bashStage}'`),
    );
  });

  it.skipIf(process.platform === 'win32')(
    'reclaims stale stages before enforcing the disk floor',
    () => {
      const root = mkdtempSync(join(tmpdir(), 'chatgoose-upload-stage-gc-'));
      const feed = join(root, 'remote-feed');
      const staleStage = join(feed, '.incoming', 'abandoned-hard-kill');
      const freshStage = join(feed, '.incoming', 'still-active');
      const mockBin = join(root, 'mock-bin');
      mkdirSync(staleStage, { recursive: true });
      mkdirSync(freshStage);
      mkdirSync(mockBin);
      fixture(feed, '1.2.3', 'current');
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60_000);
      utimesSync(staleStage, fourHoursAgo, fourHoursAgo);
      writeExecutable(join(mockBin, 'df'), `#!/usr/bin/env bash
if [[ -d "$STALE_STAGE" ]]; then
  printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\nmock 100 99 1 99%% /\n'
else
  printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\nmock 10000000 1 9999999 1%% /\n'
fi
`);

      const result = spawnSync('bash', [publisher, '--maintain', feed], {
        encoding: 'utf8',
        env: {
          ...publisherEnv,
          PATH: `${mockBin}:${process.env.PATH ?? ''}`,
          STALE_STAGE: staleStage,
          CHATGOOSE_FEED_MIN_FREE_KIB: '5000000',
        },
      });

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      expect(existsSync(staleStage)).toBe(false);
      expect(existsSync(freshStage)).toBe(true);
      expect(result.stdout).toContain('maintenance removed stale stage=abandoned-hard-kill');
      expect(result.stdout).toContain('available_kib=9999999');
    },
  );

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

  it('keeps unsigned pilot builds optional but fails closed for partial or required signing', () => {
    const script = workflowRunScript('Validate optional Windows signing configuration');
    const run = (overrides: Record<string, string>) => {
      const root = mkdtempSync(join(tmpdir(), 'chatgoose-signing-gate-'));
      const output = join(root, 'github-output');
      const result = spawnSync('bash', ['-c', script], {
        encoding: 'utf8',
        env: {
          ...process.env,
          CSC_LINK: '',
          CSC_KEY_PASSWORD: '',
          WINDOWS_SIGNING_REQUIRED: 'false',
          GITHUB_OUTPUT: output,
          ...overrides,
        },
      });
      return { result, output: existsSync(output) ? readFileSync(output, 'utf8') : '' };
    };

    const pilot = run({});
    expect(pilot.result.status, pilot.result.stderr).toBe(0);
    expect(pilot.output).toContain('expected=false');

    expect(run({ CSC_LINK: 'certificate' }).result.status).not.toBe(0);
    expect(run({ WINDOWS_SIGNING_REQUIRED: 'true' }).result.status).not.toBe(0);

    const configured = run({
      CSC_LINK: 'certificate',
      CSC_KEY_PASSWORD: 'password',
      WINDOWS_SIGNING_REQUIRED: 'true',
    });
    expect(configured.result.status, configured.result.stderr).toBe(0);
    expect(configured.output).toContain('expected=true');
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
    expect(workflow).toContain("bash -s -- --maintain '$FEED_DIR'");
    expect(workflow).toContain('WINDOWS_CSC_LINK');
    expect(workflow).toContain('WINDOWS_SIGNING_REQUIRED');
    expect(workflow).toContain('Get-AuthenticodeSignature');
    expect(workflow).toContain("-Pattern '^publisherName:'");
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
    expect(release).toMatch(/WINDOWS_SIGNING_REQUIRED/);
    expect(release).toMatch(/protected GitHub environment/i);
    expect(release).not.toMatch(/rolls the fleet to whatever `latest\.yml` points at/i);

    const builder = readNormalized(resolve(repoRoot, 'apps/desktop/electron-builder.yml'));
    expect(builder).toMatch(/verifyUpdateCodeSignature:\s*true/);

    const rootPackage = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
      pnpm?: { overrides?: Record<string, string> };
    };
    expect(rootPackage.pnpm?.overrides?.['js-yaml']).toBe('4.3.0');

    const publisherScript = readFileSync(publisher, 'utf8');
    expect(publisherScript).toContain('flock -n');
    expect(publisherScript).toMatch(/already published version=/);
    expect(publisherScript).toContain('CHATGOOSE_FEED_KEEP_INSTALLERS');
    expect(publisherScript).toContain('CHATGOOSE_FEED_MIN_FREE_KIB');
    expect(publisherScript).toContain('-mmin +180 -print0');
  });
});
