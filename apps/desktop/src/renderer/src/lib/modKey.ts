// Hotkey-label platform seam (PLAN item 11). Key MATCHING is already
// platform-agnostic — lib/keymap.ts treats 'mod' as metaKey || ctrlKey — so
// only the rendered labels differ between platforms: ⌘K on macOS, Ctrl+K
// everywhere else. Every modifier label in the renderer flows through this
// module; never hardcode the ⌘ glyph in a component. Label builders take the
// platform as an injectable parameter so tests pin BOTH renderings.

export type LabelPlatform = string; // a process.platform value

/**
 * The renderer's platform: the preload bridge inside Electron, the host
 * browser in plain-vite dev (mock bridge), darwin under node tests — which
 * keeps the historical ⌘-pinned label assertions meaningful as the default.
 * Accessed via globalThis so the module typechecks under both the DOM
 * (renderer) and node (tests) tsconfigs.
 */
export function appPlatform(): LabelPlatform {
  const host = globalThis as {
    chatgoose?: { platform: string };
    navigator?: { platform?: string };
  };
  if (host.chatgoose !== undefined) {
    return host.chatgoose.platform;
  }
  if (host.navigator?.platform !== undefined) {
    return /mac/i.test(host.navigator.platform) ? 'darwin' : 'win32';
  }
  return 'darwin';
}

/** The mod-key display name alone: '⌘' on darwin, 'Ctrl' elsewhere. */
export function modKeyLabel(platform: LabelPlatform = appPlatform()): string {
  return platform === 'darwin' ? '⌘' : 'Ctrl';
}

/** A full combo label: modCombo('K') → '⌘K' on darwin, 'Ctrl+K' elsewhere. */
export function modCombo(key: string, platform: LabelPlatform = appPlatform()): string {
  return platform === 'darwin' ? `⌘${key}` : `Ctrl+${key}`;
}
