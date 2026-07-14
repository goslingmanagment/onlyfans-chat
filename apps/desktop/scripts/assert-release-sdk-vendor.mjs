#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const healthIndex = args.indexOf('--health');
let healthPath = null;
if (healthIndex >= 0) {
  const healthArg = args[healthIndex + 1];
  if (typeof healthArg !== 'string' || healthArg.startsWith('--')) {
    throw new Error(
      'usage: assert-release-sdk-vendor.mjs [manifest-path] [--health health-json-path]',
    );
  }
  healthPath = resolve(healthArg);
  args.splice(healthIndex, 2);
}
if (args.length > 1 || args.some((arg) => arg.startsWith('--'))) {
  throw new Error(
    'usage: assert-release-sdk-vendor.mjs [manifest-path] [--health health-json-path]',
  );
}

const manifestPath = resolve(args[0] ?? 'packages/kernel-sdk/kernel-sdk.vendor.json');

function requireContractHash(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be exactly 64 lowercase hexadecimal characters`);
  }
  return value;
}

try {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const sourceCommit = manifest?.sourceCommit;
  if (typeof sourceCommit !== 'string' || !/^[0-9a-f]{40}$/.test(sourceCommit)) {
    throw new Error(
      'sourceCommit must be exactly 40 lowercase hexadecimal characters; dirty SDK snapshots cannot be released',
    );
  }
  const vendorContractHash = requireContractHash(
    manifest?.contractHash,
    'vendored SDK contractHash',
  );

  process.stdout.write(`vendored SDK sourceCommit format verified: ${sourceCommit}\n`);
  process.stdout.write(`vendored SDK contractHash verified: ${vendorContractHash}\n`);

  if (healthPath !== null) {
    const health = JSON.parse(readFileSync(healthPath, 'utf8'));
    const deployedContractHash = requireContractHash(
      health?.contractHash,
      'production Core health.contractHash',
    );
    if (deployedContractHash !== vendorContractHash) {
      throw new Error(
        `production Core contractHash ${deployedContractHash} does not match vendored SDK ${vendorContractHash}`,
      );
    }
    process.stdout.write(
      `production Core contractHash matches vendored SDK: ${vendorContractHash}\n`,
    );
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const inputs = healthPath === null ? manifestPath : `${manifestPath}; ${healthPath}`;
  process.stderr.write(`release SDK vendor compatibility check failed (${inputs}): ${message}\n`);
  process.exitCode = 1;
}
