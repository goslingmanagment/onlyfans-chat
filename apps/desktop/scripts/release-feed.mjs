#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION_RE = /^\d+\.\d+\.\d+$/;
const SHA512_RE = /^[A-Za-z0-9+/]{86}==$/;

function field(text, name) {
  const match = text.match(new RegExp(`^${name}:[ \\t]*(\\S+)[ \\t]*$`, 'm'));
  if (match === null) throw new Error(`latest.yml is missing ${name}`);
  return match[1].replace(/\r$/, '');
}

export function parseManifest(text) {
  const version = field(text, 'version');
  const artifact = field(text, 'path');
  const sha512 = field(text, 'sha512');
  if (!VERSION_RE.test(version)) throw new Error(`unsupported release version: ${version}`);
  if (artifact !== basename(artifact) || artifact !== `ChatGoose-Setup-${version}.exe`) {
    throw new Error(`unsafe or mismatched release artifact: ${artifact}`);
  }
  if (!SHA512_RE.test(sha512) || Buffer.from(sha512, 'base64').length !== 64) {
    throw new Error('latest.yml sha512 is not a base64 SHA-512 digest');
  }
  return { version, artifact, sha512 };
}

export async function sha512File(path) {
  return createHash('sha512').update(await readFile(path)).digest('base64');
}

async function manifestAt(path) {
  return parseManifest(await readFile(path, 'utf8'));
}

async function verifyArtifact(manifestPath, artifactPath) {
  const manifest = await manifestAt(manifestPath);
  if (basename(artifactPath) !== manifest.artifact) {
    throw new Error(`artifact name ${basename(artifactPath)} != manifest path ${manifest.artifact}`);
  }
  const actual = await sha512File(artifactPath);
  if (actual !== manifest.sha512) throw new Error(`artifact SHA-512 mismatch for ${manifest.artifact}`);
  return manifest;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'metadata') {
    const [manifestPath] = args;
    if (manifestPath === undefined) throw new Error('usage: release-feed.mjs metadata <latest.yml>');
    const manifest = await verifyArtifact(manifestPath, join(dirname(manifestPath), (await manifestAt(manifestPath)).artifact));
    process.stdout.write(`version=${manifest.version}\nartifact=${manifest.artifact}\nsha512=${manifest.sha512}\n`);
    return;
  }
  if (command === 'verify-manifest') {
    const [manifestPath, expectedVersion, expectedArtifact, expectedSha] = args;
    if ([manifestPath, expectedVersion, expectedArtifact, expectedSha].some((value) => value === undefined)) {
      throw new Error('usage: release-feed.mjs verify-manifest <latest.yml> <version> <artifact> <sha512>');
    }
    const manifest = await manifestAt(manifestPath);
    if (
      manifest.version !== expectedVersion ||
      manifest.artifact !== expectedArtifact ||
      manifest.sha512 !== expectedSha
    ) {
      throw new Error(`served manifest does not match this run: ${JSON.stringify(manifest)}`);
    }
    return;
  }
  if (command === 'verify-artifact') {
    const [manifestPath, artifactPath] = args;
    if (manifestPath === undefined || artifactPath === undefined) {
      throw new Error('usage: release-feed.mjs verify-artifact <latest.yml> <artifact>');
    }
    await verifyArtifact(manifestPath, artifactPath);
    return;
  }
  throw new Error(`unknown command: ${command ?? ''}`);
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
