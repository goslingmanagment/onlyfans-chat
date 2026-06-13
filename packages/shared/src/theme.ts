// UI theme (Settings → Behavior → Theme). Platform-pure: the resolved value is
// applied by the desktop app (renderer `.dark` class on <html>, main process
// nativeTheme.themeSource + window backgroundColor). Mirrors the UiLocaleSetting
// pattern in i18n/index.ts.

export type UiTheme = 'light' | 'dark';

/** Settings value: 'system' resolves from the OS color scheme at runtime. */
export type UiThemeSetting = 'system' | UiTheme;

export const UI_THEME_SETTINGS = ['system', 'light', 'dark'] as const satisfies readonly UiThemeSetting[];

/** Resolve the persisted setting against the OS preference (matchMedia / nativeTheme). */
export function resolveUiTheme(setting: UiThemeSetting, systemPrefersDark: boolean): UiTheme {
  if (setting === 'light' || setting === 'dark') {
    return setting;
  }
  return systemPrefersDark ? 'dark' : 'light';
}
