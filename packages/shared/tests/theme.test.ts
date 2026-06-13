import { describe, expect, it } from 'vitest';
import { UI_THEME_SETTINGS, resolveUiTheme } from '../src/theme';

describe('resolveUiTheme', () => {
  it('explicit settings win regardless of the OS preference', () => {
    expect(resolveUiTheme('light', true)).toBe('light');
    expect(resolveUiTheme('light', false)).toBe('light');
    expect(resolveUiTheme('dark', true)).toBe('dark');
    expect(resolveUiTheme('dark', false)).toBe('dark');
  });

  it("'system' follows the OS preference", () => {
    expect(resolveUiTheme('system', true)).toBe('dark');
    expect(resolveUiTheme('system', false)).toBe('light');
  });

  it('every settings value resolves to a concrete theme', () => {
    for (const setting of UI_THEME_SETTINGS) {
      for (const prefersDark of [true, false]) {
        expect(['light', 'dark']).toContain(resolveUiTheme(setting, prefersDark));
      }
    }
  });
});
