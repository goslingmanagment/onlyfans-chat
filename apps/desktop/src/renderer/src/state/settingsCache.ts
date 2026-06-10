// Tiny synchronous mirror of the settings the event layer needs outside React
// (toast/sound decisions). Source of truth stays the TanStack Query cache;
// AppShell keeps this in sync from query data.

import { create } from 'zustand';

interface SettingsCacheState {
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  debugMode: boolean;
  setFromSettings: (s: {
    notificationsEnabled: boolean;
    soundEnabled: boolean;
    debugMode: boolean;
  }) => void;
}

export const useSettingsCache = create<SettingsCacheState>((set) => ({
  notificationsEnabled: true,
  soundEnabled: true,
  debugMode: false,
  setFromSettings: (s) =>
    set({
      notificationsEnabled: s.notificationsEnabled,
      soundEnabled: s.soundEnabled,
      debugMode: s.debugMode,
    }),
}));
