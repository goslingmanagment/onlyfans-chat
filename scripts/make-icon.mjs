#!/usr/bin/env node
// Regenerates apps/desktop/build/icon.png (1024×1024) from build/icon.svg.
// macOS-only (uses Quick Look's qlmanage rasterizer — no extra tooling); the
// PNG is committed, so Windows/CI builds never need to run this. electron-builder
// derives .icns/.ico from the PNG at package time (docs/RELEASE.md).

import { execFileSync } from 'node:child_process';
import { renameSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') {
  console.error('make-icon.mjs uses macOS qlmanage; regenerate the icon on a mac.');
  process.exit(1);
}

const buildDir = join(dirname(fileURLToPath(import.meta.url)), '../apps/desktop/build');
const svg = join(buildDir, 'icon.svg');
if (!existsSync(svg)) {
  console.error(`missing ${svg}`);
  process.exit(1);
}

execFileSync('qlmanage', ['-t', '-s', '1024', '-o', buildDir, svg], { stdio: 'inherit' });
renameSync(join(buildDir, 'icon.svg.png'), join(buildDir, 'icon.png'));
console.log(`wrote ${join(buildDir, 'icon.png')}`);
