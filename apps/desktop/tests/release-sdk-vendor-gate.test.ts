import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const gate = resolve(repoRoot, 'apps/desktop/scripts/assert-release-sdk-vendor.mjs');

function runWith(sourceCommit: unknown) {
  const dir = mkdtempSync(join(tmpdir(), 'chatgoose-sdk-release-gate-'));
  const manifest = join(dir, 'kernel-sdk.vendor.json');
  writeFileSync(manifest, JSON.stringify({ sourceCommit }));
  return spawnSync(process.execPath, [gate, manifest], { encoding: 'utf8' });
}

describe('release SDK vendor provenance gate', () => {
  it('accepts only an exact lowercase commit and rejects dirty or ambiguous provenance', () => {
    const clean = runWith('0123456789abcdef0123456789abcdef01234567');
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
});
