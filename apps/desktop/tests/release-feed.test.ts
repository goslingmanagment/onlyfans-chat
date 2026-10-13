import { createHash } from 'node:crypto';
import { execFileSync, spawnSync, type SpawnSyncReturns } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
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
const releaseSdkGate = resolve(repoRoot, 'apps/desktop/scripts/assert-release-sdk-vendor.mjs');
const publisher = resolve(repoRoot, 'apps/desktop/scripts/publish-feed.sh');
const macPublisher = resolve(repoRoot, 'apps/desktop/scripts/publish-mac.sh');
const macRemotePublisher = resolve(repoRoot, 'apps/desktop/scripts/publish-mac-remote.sh');
const downloadPage = resolve(repoRoot, 'docs/download-page/index.html');
const publisherEnv = {
  ...process.env,
  CHATGOOSE_ALLOW_PORTABLE_LOCK_FALLBACK: '1',
  CHATGOOSE_FEED_MIN_FREE_KIB: '0',
};
const macPublisherEnv = {
  ...process.env,
  CHATGOOSE_ALLOW_PORTABLE_LOCK_FALLBACK: '1',
  CHATGOOSE_SKIP_PUBLIC_CHOWN: '1',
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

function macStage(
  publicDir: string,
  version: string,
  body: string,
  runId: string,
): { stageName: string; sha: string; size: number } {
  const stageName = `.upload-ChatGoose-${version}-mac-arm64.dmg.${runId}.tmp`;
  writeFileSync(join(publicDir, stageName), body);
  return {
    stageName,
    sha: createHash('sha512').update(body).digest('base64'),
    size: Buffer.byteLength(body),
  };
}

function runMacRemotePublisher(
  publicDir: string,
  version: string,
  body: string,
  runId: string,
  keep = 3,
): SpawnSyncReturns<string> {
  const staged = macStage(publicDir, version, body, runId);
  return spawnSync(
    'bash',
    [
      macRemotePublisher,
      publicDir,
      staged.stageName,
      version,
      staged.sha,
      String(staged.size),
      'cgupdates',
      String(keep),
    ],
    { env: macPublisherEnv, encoding: 'utf8' },
  );
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

// Runs one workflow step the way Actions does (`bash -eo pipefail`) against
// feed hosts faked on disk: `curl https://<host>/<any path>/<file>` copies
// sites/<host>/<file>, and exits 22 like `curl --fail` when it is absent.
function runFeedStep(
  stepName: string,
  sites: Record<string, Record<string, string>>,
  env: Record<string, string>,
): SpawnSyncReturns<string> {
  const root = mkdtempSync(join(tmpdir(), 'chatgoose-feed-step-'));
  const mockBin = join(root, 'mock-bin');
  const runnerTemp = join(root, 'runner-temp');
  mkdirSync(mockBin);
  mkdirSync(runnerTemp);
  for (const [host, files] of Object.entries(sites)) {
    mkdirSync(join(root, 'sites', host), { recursive: true });
    for (const [name, body] of Object.entries(files)) {
      writeFileSync(join(root, 'sites', host, name), body);
    }
  }
  writeExecutable(
    join(mockBin, 'curl'),
    `#!/usr/bin/env bash
set -eu
url=""
output=""
while (( $# > 0 )); do
  case "$1" in
    --output) output="$2"; shift 2 ;;
    --connect-timeout|--max-time) shift 2 ;;
    https://*) url="$1"; shift ;;
    *) shift ;;
  esac
done
host="\${url#https://}"
host="\${host%%/*}"
served="$MOCK_SITES/$host/\${url##*/}"
[[ -f "$served" ]] || exit 22
cp "$served" "$output"
`,
  );
  writeExecutable(join(mockBin, 'sleep'), '#!/usr/bin/env bash\nexit 0\n');
  return spawnSync(
    'bash',
    [
      '-eo',
      'pipefail',
      '-c',
      `export PATH="$1:$PATH"\n${workflowRunScript(stepName)}`,
      'chatgoose-release-harness',
      toBashPath(mockBin),
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        RUNNER_TEMP: toBashPath(runnerTemp),
        MOCK_SITES: toBashPath(join(root, 'sites')),
        ...env,
      },
    },
  );
}

function manifestText(version: string, body: string): string {
  const sha = createHash('sha512').update(body).digest('base64');
  return `version: ${version}\npath: ChatGoose-Setup-${version}.exe\nsha512: ${sha}\n`;
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
      'if ! ssh "${SSH_OPTIONS[@]}" cgupdates@152.53.191.242 "bash -s -- \'$FEED_DIR\' \'$stage_dir\' \'$PUBLIC_DL_DIR\'"',
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

  // An installed build reads its feed URL only from the packaged
  // app-update.yml, so the URL in electron-builder.yml is permanent for every
  // machine that installs that build (D45).
  it('packages one feed URL on our own host name and verifies that same URL', () => {
    const builder = readNormalized(resolve(repoRoot, 'apps/desktop/electron-builder.yml'));
    const workflow = readNormalized(resolve(repoRoot, '.github/workflows/windows-build.yml'));
    const publishUrl = builder.match(/^publish:\n {2}provider: generic\n {2}url: (\S+)\n/m)?.[1] ?? '';
    const feedUrls = [...workflow.matchAll(/^ +FEED_URL: (\S+)$/gm)].map((match) => match[1]);

    expect(new URL(publishUrl).origin).toBe('https://ext.gosling-agency.ru');
    expect(publishUrl).toMatch(/\/u\/[0-9a-f]{24}\/$/);
    // Defined once for the job, so no step can verify a different feed.
    expect(feedUrls).toEqual([publishUrl.slice(0, -1)]);
    // The IP-bound name builds up to 0.1.65 poll is served by the old server
    // alone: nothing here uploads to it or waits for it.
    expect(workflow).not.toMatch(/sslip\.io|45[.-]8[.-]230[.-]111/);

    const gate = workflow.indexOf('- name: Assert the feed URL serves the feed');
    const build = workflow.indexOf('- name: Build Windows installer');
    const packaged = workflow.indexOf('- name: Assert the packaged feed URL');
    const upload = workflow.indexOf('- name: Upload to the update feed');
    expect(gate).toBeGreaterThan(-1);
    expect(build).toBeGreaterThan(gate);
    expect(packaged).toBeGreaterThan(build);
    expect(upload).toBeGreaterThan(packaged);
    // The packaged check has no `if:`: a validation dispatch runs it too.
    expect(workflow.slice(packaged, upload)).toMatch(
      /^- name: Assert the packaged feed URL\n {8}shell: bash\n {8}run: node apps\/desktop\/scripts\/release-feed\.mjs verify-app-update apps\/desktop\/release\/win-unpacked\/resources\/app-update\.yml "\$FEED_URL"\n/,
    );
  });

  it('rejects a packaged app-update.yml that does not carry the expected feed URL', () => {
    const dir = mkdtempSync(join(tmpdir(), 'chatgoose-app-update-'));
    const appUpdate = join(dir, 'app-update.yml');
    const verify = (body: string, expected: string): SpawnSyncReturns<string> => {
      writeFileSync(appUpdate, body);
      return spawnSync(process.execPath, [cli, 'verify-app-update', appUpdate, expected], { encoding: 'utf8' });
    };
    const packaged = "provider: generic\nurl: https://feed.example/u/abc/\nupdaterCacheDirName: '@app-updater'\n";

    const exact = verify(packaged, 'https://feed.example/u/abc');
    expect(exact.status, exact.stderr).toBe(0);
    expect(exact.stdout).toContain('packaged feed URL verified: https://feed.example/u/abc/');
    expect(verify("provider: generic\r\nurl: 'https://feed.example/u/abc'\r\n", 'https://feed.example/u/abc/').status)
      .toBe(0);

    const otherHost = verify(packaged, 'https://other.example/u/abc');
    expect(otherHost.status).not.toBe(0);
    expect(otherHost.stderr).toContain('packaged feed URL https://feed.example/u/abc/ is not https://other.example/u/abc');
    expect(verify(packaged, 'https://feed.example/u/abcd').status).not.toBe(0);
    expect(verify(packaged.replace('https:', 'http:'), 'http://feed.example/u/abc').stderr)
      .toContain('must be a plain https URL');
    expect(verify(packaged.replace('generic', 'github'), 'https://feed.example/u/abc').stderr)
      .toContain('packaged update provider is github');
    expect(verify('provider: generic\n', 'https://feed.example/u/abc').stderr)
      .toContain('app-update.yml is missing url');
  });

  // Each failing case runs the step's six attempts; Git Bash on Windows CI is slow.
  it('refuses a release while the feed URL does not serve the feed', () => {
    const step = 'Assert the feed URL serves the feed';
    const env = { FEED_URL: 'https://feed.example/u/abc' };

    const served = runFeedStep(step, { 'feed.example': { 'latest.yml': manifestText('1.2.3', 'current') } }, env);
    expect(served.status, `${served.stdout}\n${served.stderr}`).toBe(0);
    expect(served.stdout).toContain('https://feed.example/u/abc serves 1.2.3');

    const down = runFeedStep(step, {}, env);
    expect(down.status).not.toBe(0);
    expect(down.stdout).toContain('::error::https://feed.example/u/abc does not serve the update feed');

    const notAManifest = runFeedStep(step, { 'feed.example': { 'latest.yml': '<html>404</html>' } }, env);
    expect(notAManifest.status).not.toBe(0);
    expect(notAManifest.stdout).toContain('::error::https://feed.example/u/abc does not serve the update feed');
  }, 60_000);

  it('fails the run unless the feed URL serves the published release', () => {
    const step = 'Assert served feed version == package.json == tag';
    const version = (JSON.parse(readFileSync(resolve(repoRoot, 'apps/desktop/package.json'), 'utf8')) as {
      version: string;
    }).version;
    const artifact = `ChatGoose-Setup-${version}.exe`;
    const published = { 'latest.yml': manifestText(version, 'published'), [artifact]: 'published' };
    const env = {
      FEED_URL: 'https://feed.example/u/abc',
      EXPECTED_ARTIFACT: artifact,
      EXPECTED_SHA512: createHash('sha512').update('published').digest('base64'),
      GITHUB_REF: 'refs/heads/main',
    };

    const live = runFeedStep(step, { 'feed.example': published }, env);
    expect(live.status, `${live.stdout}\n${live.stderr}`).toBe(0);
    expect(live.stdout).toContain(`package.json=${version} served artifact=${artifact}`);

    // Uploaded to one server while the name shows another: the name still
    // serves the previous manifest, so no build polling it gets the release.
    const behind = runFeedStep(
      step,
      { 'feed.example': { 'latest.yml': manifestText('0.0.1', 'previous'), 'ChatGoose-Setup-0.0.1.exe': 'previous' } },
      env,
    );
    expect(behind.status).not.toBe(0);
    expect(behind.stdout).toContain('::error::Served feed did not converge to this run');

    const tampered = runFeedStep(step, { 'feed.example': { ...published, [artifact]: 'other bytes' } }, env);
    expect(tampered.status).not.toBe(0);
    expect(tampered.stdout).toContain('::error::Served feed did not converge to this run');
  }, 60_000);

  it('uploads to one feed host, pinned by its host key, from CI and from the mac publisher', () => {
    const upload = workflowRunScript('Upload to the update feed');
    const targets = new Set([...upload.matchAll(/\b(\w+)@(\d+\.\d+\.\d+\.\d+)\b/g)].map((match) => match[0]));
    expect([...targets]).toEqual(['cgupdates@152.53.191.242']);
    // The only known_hosts line is this host's key, written before any ssh.
    const pins = [...upload.matchAll(/^echo "(\S+) (ssh-ed25519 \S+)" > ~\/\.ssh\/known_hosts$/gm)];
    expect(pins.map((match) => match[1])).toEqual(['152.53.191.242']);
    expect(pins[0]?.[2]).toBe('ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFVfNGPiVJY8E/IHh8QokJNJw9yP5az/fwiQtmT24C9Q');
    expect(upload.indexOf('> ~/.ssh/known_hosts')).toBeLessThan(upload.indexOf('"command -v flock'));
    expect(upload).not.toMatch(/StrictHostKeyChecking|UserKnownHostsFile/);

    expect(readNormalized(macPublisher)).toMatch(/^readonly VPS=root@152\.53\.191\.242$/m);
  });

  // Five Git Bash publisher processes can exceed Vitest's 5 s default on Windows CI.
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
  }, 15_000);

  it('refreshes the public download page on publish, on lost-ack retry, and standalone', () => {
    const root = mkdtempSync(join(tmpdir(), 'chatgoose-feed-public-'));
    const feed = join(root, 'feed');
    const publicDir = join(root, 'public');
    mkdirSync(join(feed, '.incoming'), { recursive: true });
    mkdirSync(publicDir);
    fixture(feed, '1.2.3', 'old');

    // Publish with the public dir → the page's symlink and manifest move.
    const stage = join(feed, '.incoming', 'run-public');
    mkdirSync(stage);
    fixture(stage, '1.2.4', 'new bytes');
    execFileSync('bash', [publisher, feed, stage, publicDir], { env: publisherEnv });
    const link = join(publicDir, 'ChatGoose-Setup-latest.exe');
    expect(readFileSync(link, 'utf8')).toBe('new bytes');
    if (process.platform !== 'win32') {
      // canonical_dir resolves symlinked tmp roots (macOS /var → /private/var).
      expect(readlinkSync(link)).toBe(realpathSync(join(feed, 'ChatGoose-Setup-1.2.4.exe')));
    }
    expect(JSON.parse(readFileSync(join(publicDir, 'version-win.json'), 'utf8'))).toEqual({
      version: '1.2.4',
      size: 9,
    });

    // A lost-ack equal-version retry must converge a page the original run
    // never managed to refresh.
    rmSync(link);
    rmSync(join(publicDir, 'version-win.json'));
    const retry = join(feed, '.incoming', 'run-public-retry');
    mkdirSync(retry);
    fixture(retry, '1.2.4', 'new bytes');
    execFileSync('bash', [publisher, feed, retry, publicDir], { env: publisherEnv });
    expect(readFileSync(link, 'utf8')).toBe('new bytes');

    // Standalone repair mode converges from the current manifest alone.
    rmSync(link);
    execFileSync('bash', [publisher, '--refresh-public', feed, publicDir], { env: publisherEnv });
    expect(readFileSync(link, 'utf8')).toBe('new bytes');

    // A missing public dir rejects the publication before any feed mutation.
    const bad = join(feed, '.incoming', 'run-bad-public');
    mkdirSync(bad);
    fixture(bad, '1.2.5', 'never');
    const rejected = spawnSync('bash', [publisher, feed, bad, join(root, 'absent')], {
      env: publisherEnv,
      encoding: 'utf8',
    });
    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toContain('public download directory does not exist');
    expect(readFileSync(join(feed, 'latest.yml'), 'utf8')).toContain('version: 1.2.4');
  }, 15_000);

  it('fails loudly when the public download destination cannot be replaced', () => {
    const root = mkdtempSync(join(tmpdir(), 'chatgoose-feed-public-failure-'));
    const feed = join(root, 'feed');
    const publicDir = join(root, 'public');
    mkdirSync(join(feed, '.incoming'), { recursive: true });
    mkdirSync(publicDir);
    fixture(feed, '1.2.3', 'old');

    // A directory at the public filename models an invalid/undeletable target.
    // The feed switch has already committed when refresh_public runs, so the
    // publisher must return non-zero instead of masking the page failure.
    mkdirSync(join(publicDir, 'ChatGoose-Setup-latest.exe'));
    const stage = join(feed, '.incoming', 'run-public-failure');
    mkdirSync(stage);
    fixture(stage, '1.2.4', 'new');
    const result = spawnSync('bash', [publisher, feed, stage, publicDir], {
      env: publisherEnv,
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('destination path is a directory');
    expect(result.stderr).toContain('public download refresh FAILED');
    expect(readFileSync(join(feed, 'latest.yml'), 'utf8')).toContain('version: 1.2.4');
    expect(existsSync(join(publicDir, 'version-win.json'))).toBe(false);
    const source = readNormalized(publisher);
    expect(source).toContain('ln -sfn "$feed_dir/$artifact" "$link_tmp" || return 1');
    expect(source).toContain('mv -f "$json_tmp" "$public_dir/version-win.json" || return 1');
  }, 15_000);

  // The remote publisher runs on Linux; Git Bash emulates `ln -s` as a regular
  // file on Windows, so its symlink recovery contract is not testable there.
  it.skipIf(process.platform === 'win32')('publishes mac releases monotonically, idempotently, and with protected retention', () => {
    const publicDir = mkdtempSync(join(tmpdir(), 'chatgoose-mac-public-'));

    const first = runMacRemotePublisher(publicDir, '1.2.3', 'mac-1.2.3', 'first');
    expect(first.status, first.stderr).toBe(0);
    expect(readlinkSync(join(publicDir, 'ChatGoose-latest-mac-arm64.dmg'))).toBe(
      'ChatGoose-1.2.3-mac-arm64.dmg',
    );
    expect(JSON.parse(readFileSync(join(publicDir, 'version-mac.json'), 'utf8'))).toEqual({
      version: '1.2.3',
      size: 9,
    });

    // JSON is authoritative if the process dies between its rename and the
    // stable-link rename. A retry must repair that lagging link before treating
    // the byte-identical release as an idempotent success.
    unlinkSync(join(publicDir, 'ChatGoose-latest-mac-arm64.dmg'));
    symlinkSync('ChatGoose-0.0.1-mac-arm64.dmg', join(publicDir, 'ChatGoose-latest-mac-arm64.dmg'));
    const retry = runMacRemotePublisher(publicDir, '1.2.3', 'mac-1.2.3', 'retry');
    expect(retry.status, retry.stderr).toBe(0);
    expect(retry.stdout).toContain('repaired latest mac link');
    expect(retry.stdout).toContain('already published');
    expect(readlinkSync(join(publicDir, 'ChatGoose-latest-mac-arm64.dmg'))).toBe(
      'ChatGoose-1.2.3-mac-arm64.dmg',
    );

    const conflicting = runMacRemotePublisher(publicDir, '1.2.3', 'different', 'conflict');
    expect(conflicting.status).not.toBe(0);
    expect(conflicting.stderr).toContain('conflicting equal-version');
    expect(readFileSync(join(publicDir, 'ChatGoose-1.2.3-mac-arm64.dmg'), 'utf8')).toBe(
      'mac-1.2.3',
    );

    const downgrade = runMacRemotePublisher(publicDir, '1.2.2', 'mac-1.2.2', 'downgrade');
    expect(downgrade.status).not.toBe(0);
    expect(downgrade.stderr).toContain('refusing mac downgrade');

    for (const version of ['1.2.4', '1.2.5', '1.2.6']) {
      const result = runMacRemotePublisher(publicDir, version, `mac-${version}`, version);
      expect(result.status, result.stderr).toBe(0);
    }
    expect(readlinkSync(join(publicDir, 'ChatGoose-latest-mac-arm64.dmg'))).toBe(
      'ChatGoose-1.2.6-mac-arm64.dmg',
    );
    expect(
      readdirSync(publicDir)
        .filter((name) => /^ChatGoose-\d+\.\d+\.\d+-mac-arm64\.dmg$/.test(name))
        .sort(),
    ).toEqual([
      'ChatGoose-1.2.4-mac-arm64.dmg',
      'ChatGoose-1.2.5-mac-arm64.dmg',
      'ChatGoose-1.2.6-mac-arm64.dmg',
    ]);
  }, 15_000);

  it('gates local mac publication on an exact clean tag and an exact served hash', () => {
    const source = readNormalized(macPublisher);
    const page = readNormalized(downloadPage);
    expect(source).toContain('git status --porcelain');
    expect(source).toContain('refs/tags/$expected_tag^{commit}');
    expect(source).toContain('DMG lacks matching clean-tag provenance');
    expect(source).toContain('-mountpoint "$mount_dir"');
    expect(source).not.toContain('volume="/Volumes/ChatGoose');
    expect(source).toContain('publish-mac-remote.sh');
    expect(source).toContain('--range 0-0 --output /dev/null "$PUBLIC_URL/$dmg_name"');
    expect(source).toContain('served_sha=$(curl');
    expect(source).toContain('if [[ "$served_sha" != "$sha512" ]]');
    expect(page).toContain("'ChatGoose-' + v.version + '-mac-arm64.dmg'");
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
    // Linux flock intentionally keeps this inode in place forever. Compare
    // only managed feed entries: unlinking/recreating the lock path could let
    // two publishers lock different inodes concurrently.
    const managedEntries = (): string[] => readdirSync(feed)
      .filter((name) => name !== '.publish.lock')
      .sort();
    const beforeDryRun = managedEntries();
    const dryRun = spawnSync('bash', [publisher, '--maintain', feed, '--dry-run'], {
      env,
      encoding: 'utf8',
    });
    expect(dryRun.status, dryRun.stderr).toBe(0);
    expect(dryRun.stdout).toContain('retention would remove installer=');
    expect(managedEntries()).toEqual(beforeDryRun);

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
    const kernelSdkDir = join(root, 'packages/kernel-sdk');
    for (const dir of [
      releaseDir,
      scriptsDir,
      mockBin,
      home,
      runnerTemp,
      kernelSdkDir,
      join(feed, '.incoming'),
    ]) {
      mkdirSync(dir, { recursive: true });
    }
    fixture(releaseDir, '1.2.4', 'candidate installer');
    writeFileSync(join(scriptsDir, 'release-feed.mjs'), readFileSync(cli));
    writeFileSync(join(scriptsDir, 'assert-kernel-capabilities.mjs'), readFileSync(kernelGate));
    writeFileSync(join(scriptsDir, 'assert-release-sdk-vendor.mjs'), readFileSync(releaseSdkGate));
    writeFileSync(join(scriptsDir, 'publish-feed.sh'), readFileSync(publisher));
    const fixtureContractHash = 'a'.repeat(64);
    writeFileSync(join(kernelSdkDir, 'kernel-sdk.vendor.json'), JSON.stringify({
      contractHash: fixtureContractHash,
      sourceCommit: 'b'.repeat(40),
      source: 'release test fixture',
    }));
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
      `#!/usr/bin/env bash
set -eu
if [[ "$*" != *"/api/v1/health"* ]]; then exit 1; fi
output=""
write_out=""
while (( $# > 0 )); do
  if [[ "$1" == "--output" ]]; then
    output="$2"
    shift 2
    continue
  fi
  if [[ "$1" == "--write-out" ]]; then
    write_out="$2"
    shift 2
    continue
  fi
  shift
done
body='{"status":"ok","capabilities":["desktop-lifecycle-v2"],"contractHash":"${fixtureContractHash}"}'
if [[ -n "$output" ]]; then printf '%s\n' "$body" > "$output"; else printf '%s\n' "$body"; fi
if [[ -n "$write_out" ]]; then printf '200'; fi
`,
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
    // pwsh `exit $null` exits 0: the smoke gate fails when the launch reports
    // no exit code, before it exits with that code.
    const smoke = workflowRunScript('Smoke-launch the packaged app');
    expect(smoke).toContain("Start-Process -FilePath $exe -ArgumentList '--smoke' -Wait -PassThru");
    expect(smoke).toMatch(
      /if \(\$null -eq \$p -or -not \$p\.HasExited -or \$null -eq \$p\.ExitCode\) \{\n[^\n]*\n\s+exit 1\n\s*\}\n/,
    );
    expect(smoke.indexOf('$null -eq $p.ExitCode')).toBeLessThan(smoke.indexOf('exit $p.ExitCode'));
    // PR runs of ci.yml skip the Windows job, so only a main push run may
    // prove the exact release SHA passed cross-platform CI.
    expect(workflowRunScript('Assert exact commit passed cross-platform CI')).toContain(
      '/actions/workflows/ci.yml/runs?head_sha=$release_sha&status=success&per_page=10&event=push&branch=main"',
    );
    // A real release has spent ~10 min in scp: the upload keeps a 20-minute budget.
    expect(workflow).toMatch(
      /- name: Upload to the update feed\n\s+id: publish\n\s+if: [^\n]+\n(?:\s+#[^\n]*\n)*\s+timeout-minutes: 20\n/,
    );
    // Only publishing runs share the feed lock, so a validation dispatch can
    // neither delay a release nor get it cancelled as a superseded pending run.
    expect(workflow).toContain(
      "group: ${{ (startsWith(github.ref, 'refs/tags/v') || inputs.publishFeed) && 'chatgoose-windows-update-feed' || format('windows-build-{0}', github.run_id) }}",
    );

    // Keep the existing required-check identities. The Linux job runs on the
    // CI_POOL-selected runner (owner's PC on first attempt, else GitHub-hosted
    // ubuntu-24.04); the Windows job runs only on pushes to main, which is the
    // run the release guard above accepts.
    expect(ci).toMatch(
      /check:\n\s+name: pnpm check\n\s+runs-on: \$\{\{ vars\.CI_POOL == 'pc' && github\.run_attempt == '1' && fromJSON\('\["self-hosted","ci-pc"\]'\) \|\| 'ubuntu-24\.04' \}\}\n/,
    );
    expect(ci).toMatch(
      /windows-check:\n\s+name: pnpm check \(Windows\)\n(?:\s+#[^\n]*\n)*\s+if: github\.event_name == 'push'\n\s+runs-on: windows-latest\n/,
    );
    expect(ci).toMatch(/push:\n\s+branches:\n\s+- main\n/);
    expect(ci).toMatch(/cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
    // Pushes get a per-run group: a shared group would let GitHub cancel a
    // pending main run, leaving the release guard without an exact-SHA run.
    expect(ci).toContain("group: ci-${{ github.event_name == 'pull_request' && github.ref || github.run_id }}");
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
