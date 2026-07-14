#!/usr/bin/env node

// Pre-publication compatibility gate. The release workflow reads the public
// production health response and refuses to publish a Desktop that depends on
// a Core lifecycle contract which is not deployed yet.

const requiredCapability = process.argv[2];
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(requiredCapability ?? '')) {
  throw new Error('usage: assert-kernel-capabilities.mjs <required-capability>');
}

let input = '';
for await (const chunk of process.stdin) {
  input += String(chunk);
}

const parsed = JSON.parse(input);
const capabilities = Array.isArray(parsed?.capabilities)
  ? parsed.capabilities.filter((value) => typeof value === 'string')
  : [];

if (!capabilities.includes(requiredCapability)) {
  throw new Error(
    `production Core does not advertise required capability ${requiredCapability}`,
  );
}

process.stdout.write(`production Core capability present: ${requiredCapability}\n`);
