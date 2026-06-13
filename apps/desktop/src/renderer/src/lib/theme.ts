// Renderer-side theme application. Toggles the `dark` class on <html>; every
// color flows through CSS variables overridden under `.dark` (styles/index.css),
// so no component reads the theme directly.
//
// In real Electron, main also sets nativeTheme.themeSource (window background +
// native chrome). Here we still resolve from the uiTheme SETTING — not only
// matchMedia — so dev/mock mode (no main process) switches live too. matchMedia
// is consulted for the 'system' case.

import { resolveUiTheme, type UiTheme, type UiThemeSetting } from '@chatgoose/shared/theme';

const ECHO_KEY = 'chatgoose.uiTheme.resolved';

function prefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

function paint(resolved: UiTheme): void {
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  try {
    localStorage.setItem(ECHO_KEY, resolved);
  } catch {
    // private mode / disabled storage — the echo is best-effort only.
  }
}

/**
 * Pre-React paint from the last resolved value, so a dark user does not get a
 * light first frame while the settings query is in flight. Call once before
 * React mounts. Falls back to the OS preference when no echo exists.
 */
export function bootstrapTheme(): void {
  let echoed: string | null;
  try {
    echoed = localStorage.getItem(ECHO_KEY);
  } catch {
    echoed = null;
  }
  const resolved: UiTheme =
    echoed === 'dark' || echoed === 'light' ? echoed : prefersDark() ? 'dark' : 'light';
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

/**
 * Apply a theme SETTING. Returns a cleanup function: for 'system' it subscribes
 * to OS scheme flips; for explicit settings the returned fn is a no-op.
 */
export function applyThemeSetting(setting: UiThemeSetting): () => void {
  paint(resolveUiTheme(setting, prefersDark()));

  if (setting !== 'system' || typeof matchMedia !== 'function') {
    return () => {};
  }
  const mql = matchMedia('(prefers-color-scheme: dark)');
  const onChange = (): void => paint(resolveUiTheme('system', mql.matches));
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}
