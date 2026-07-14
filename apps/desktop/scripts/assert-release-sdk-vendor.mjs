#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const manifestPath = resolve(
  process.argv[2] ?? 'packages/kernel-sdk/kernel-sdk.vendor.json',
);

try {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const sourceCommit = manifest?.sourceCommit;
  if (typeof sourceCommit !== 'string' || !/^[0-9a-f]{40}$/.test(sourceCommit)) {
    throw new Error(
      'sourceCommit must be exactly 40 lowercase hexadecimal characters; dirty SDK snapshots cannot be released',
    );
  }
  process.stdout.write(`release SDK source commit verified: ${sourceCommit}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`release SDK vendor provenance check failed (${manifestPath}): ${message}\n`);
  process.exitCode = 1;
}
