import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const cli = resolve(repoRoot, 'apps/desktop/scripts/release-feed.mjs');
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

    const stale = join(feed, '.incoming', 'run-stale');
    mkdirSync(stale);
    fixture(stale, '1.2.3', 'stale');
    expect(spawnSync('bash', [publisher, feed, stale], { env: publisherEnv }).status).not.toBe(0);
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

  it('pins the repository-controlled workflow gates and roll-forward runbook', () => {
    const workflow = readFileSync(resolve(repoRoot, '.github/workflows/windows-build.yml'), 'utf8');
    expect(workflow).toMatch(/concurrency:/);
    expect(workflow).toMatch(/fetch-depth:\s*0/);
    expect(workflow).toContain('git merge-base --is-ancestor');
    expect(workflow).toContain('run: pnpm check');
    expect(workflow).toContain('publish-feed.sh');
    expect(workflow).toContain('command -v flock');
    expect(workflow).toMatch(/SSH acknowledgement was lost/);
    expect(workflow).toMatch(/ambiguous publication verification attempt/);
    expect(workflow).toMatch(/for attempt in 1 2 3 4 5 6/);
    expect(workflow).not.toMatch(/curl[^\n]*\s-k/);

    const release = readFileSync(resolve(repoRoot, 'docs/RELEASE.md'), 'utf8');
    expect(release).toMatch(/higher-semver/i);
    expect(release).toMatch(/roll forward/i);
    expect(release).not.toMatch(/rolls the fleet to whatever `latest\.yml` points at/i);

    const publisherScript = readFileSync(publisher, 'utf8');
    expect(publisherScript).toContain('flock -n');
    expect(publisherScript).toMatch(/already published version=/);
  });
});
