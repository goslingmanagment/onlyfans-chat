// Guard for `pnpm dist:win`: better-sqlite3-multiple-ciphers ships no
// prebuilds, so the Windows-ABI binary can only be compiled ON Windows —
// a cross-"build" from macOS would silently pack the mac .node and the
// installed app would crash opening the encrypted db. Real Windows builds:
// a Windows machine with VS Build Tools, or the windows-build GitHub
// workflow (docs/RELEASE.md).

if (process.platform !== 'win32') {
  console.error(
    'dist:win must run on Windows (native sqlite ABI — see docs/RELEASE.md).\n' +
      'From a mac, use the "windows-build" GitHub Actions workflow instead.',
  );
  process.exit(1);
}
