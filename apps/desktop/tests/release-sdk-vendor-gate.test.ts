import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const gate = resolve(repoRoot, 'apps/desktop/scripts/assert-release-sdk-vendor.mjs');

const cleanCommit = '0123456789abcdef0123456789abcdef01234567';
const cleanContractHash = 'a'.repeat(64);

function runWith(
  sourceCommit: unknown,
  contractHash: unknown = cleanContractHash,
  health?: unknown,
) {
  const dir = mkdtempSync(join(tmpdir(), 'chatgoose-sdk-release-gate-'));
  const manifest = join(dir, 'kernel-sdk.vendor.json');
  writeFileSync(manifest, JSON.stringify({ sourceCommit, contractHash }));
  const args = [gate, manifest];
  if (health !== undefined) {
    const healthPath = join(dir, 'health.json');
    writeFileSync(healthPath, JSON.stringify(health));
    args.push('--health', healthPath);
  }
  return spawnSync(process.execPath, args, { encoding: 'utf8' });
}

describe('release SDK vendor provenance gate', () => {
  it('accepts only an exact lowercase commit and rejects dirty or ambiguous provenance', () => {
    const clean = runWith(cleanCommit);
    expect(clean.status, clean.stderr).toBe(0);

    for (const sourceCommit of [
      '0123456789abcdef0123456789abcdef01234567-dirty',
      '0123456789ABCDEF0123456789ABCDEF01234567',
      '0123456789abcdef',
      null,
    ]) {
      const rejected = runWith(sourceCommit);
      expect(rejected.status).not.toBe(0);
      expect(rejected.stderr).toContain('sourceCommit must be exactly 40 lowercase hexadecimal characters');
    }
  });

  it('requires an exact vendored contract hash', () => {
    for (const contractHash of ['a'.repeat(63), 'A'.repeat(64), null]) {
      const rejected = runWith(cleanCommit, contractHash);
      expect(rejected.status).not.toBe(0);
      expect(rejected.stderr).toContain(
        'vendored SDK contractHash must be exactly 64 lowercase hexadecimal characters',
      );
    }
  });

  it('compares deployed health to the vendored contract without git ancestry assumptions', () => {
    const matching = runWith(cleanCommit, cleanContractHash, {
      contractHash: cleanContractHash,
    });
    expect(matching.status, matching.stderr).toBe(0);
    expect(matching.stdout).toContain('production Core contractHash matches vendored SDK');

    const mismatching = runWith(cleanCommit, cleanContractHash, {
      contractHash: 'b'.repeat(64),
    });
    expect(mismatching.status).not.toBe(0);
    expect(mismatching.stderr).toContain('does not match vendored SDK');

    const missing = runWith(cleanCommit, cleanContractHash, {});
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain('production Core health.contractHash');
  });

  it('runs on tag/publish releases before the ordinary check build', () => {
    const workflow = readFileSync(
      resolve(repoRoot, '.github/workflows/windows-build.yml'),
      'utf8',
    ).replace(/\r\n/g, '\n');
    const gateStep = workflow.indexOf('- name: Assert release SDK vendor provenance is clean');
    const checkStep = workflow.indexOf('- name: Check (typecheck + lint + test + build)');
    expect(gateStep).toBeGreaterThan(-1);
    expect(workflow.slice(gateStep, checkStep)).toContain(
      "if: startsWith(github.ref, 'refs/tags/v') || inputs.publishFeed == true",
    );
    expect(workflow.slice(gateStep, checkStep)).toContain(
      'node apps/desktop/scripts/assert-release-sdk-vendor.mjs',
    );
    expect(gateStep).toBeLessThan(checkStep);
  });

  it('checks canonical production capability and exact contract at both release fences', () => {
    const workflow = readFileSync(
      resolve(repoRoot, '.github/workflows/windows-build.yml'),
      'utf8',
    ).replace(/\r\n/g, '\n');
    const canonicalHealth = 'https://gosling-agency.ru/api/v1/health';
    expect(workflow.split(canonicalHealth)).toHaveLength(3);
    expect(
      workflow.match(/assert-kernel-capabilities\.mjs desktop-lifecycle-v2/g),
    ).toHaveLength(2);
    expect(workflow.match(/assert-release-sdk-vendor\.mjs/g)).toHaveLength(3);
    expect(workflow.match(/--health "\$core_health"/g)).toHaveLength(2);
    expect(workflow.match(/--write-out '%\{http_code\}'/g)).toHaveLength(2);
    expect(workflow.match(/\[ "\$core_http_status" = 200 \]/g)).toHaveLength(2);
    for (const healthCurl of workflow.split(canonicalHealth).slice(0, -1)) {
      expect(healthCurl.slice(healthCurl.lastIndexOf('curl'))).not.toContain('--location');
    }
  });
});
