#!/usr/bin/env node

// Repository-enforced pre-publication gate. A release tag may be pushed while
// main CI is still pending (this private repository cannot require checks via
// branch protection), so the publishing workflow independently proves that
// the exact release SHA already has a successful cross-platform CI run.

const expectedSha = process.argv[2];
if (!/^[0-9a-f]{40}$/i.test(expectedSha ?? '')) {
  throw new Error('usage: assert-ci-success.mjs <40-character release sha>');
}

let input = '';
for await (const chunk of process.stdin) {
  input += String(chunk);
}
const parsed = JSON.parse(input);
const runs = Array.isArray(parsed?.workflow_runs) ? parsed.workflow_runs : [];
const match = runs.find(
  (run) =>
    run !== null &&
    typeof run === 'object' &&
    run.head_sha === expectedSha &&
    run.status === 'completed' &&
    run.conclusion === 'success',
);

if (match === undefined) {
  throw new Error(`exact release SHA ${expectedSha} has no successful completed CI run`);
}

process.stdout.write(`exact-SHA CI passed: ${String(match.html_url ?? match.id ?? expectedSha)}\n`);
