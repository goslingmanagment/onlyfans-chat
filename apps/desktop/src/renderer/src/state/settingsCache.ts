// Tiny synchronous mirror of the settings the event layer needs outside React
// (toast/sound decisions + toast locale). Source of truth stays the TanStack
// Query cache; AppShell keeps this in sync from query data.

import { create } from 'zustand';
import type { UiLocaleSetting } from '@chatgoose/shared/i18n/index';

interface SettingsCacheState {
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  debugMode: boolean;
  uiLocale: UiLocaleSetting;
  setFromSettings: (s: {
    notificationsEnabled: boolean;
    soundEnabled: boolean;
    debugMode: boolean;
    uiLocale: UiLocaleSetting;
  }) => void;
}

export const useSettingsCache = create<SettingsCacheState>((set) => ({
  notificationsEnabled: true,
  soundEnabled: true,
  debugMode: false,
  uiLocale: 'system',
  setFromSettings: (s) =>
    set({
      notificationsEnabled: s.notificationsEnabled,
      soundEnabled: s.soundEnabled,
      debugMode: s.debugMode,
      uiLocale: s.uiLocale,
    }),
}));
