// Tiny synchronous mirror of the settings the event layer needs outside React
// (toast/sound decisions + toast locale). Source of truth stays the TanStack
// Query cache; AppShell keeps this in sync from query data.

import { create } from 'zustand';
import type { UiLocaleSetting } from '@chatgoose/shared/i18n/index';
import type { SoundTone } from '@chatgoose/shared/sound/index';

interface SoundPrefs {
  soundEnabled: boolean;
  soundTone: SoundTone;
  soundVolume: number;
  subscriberSoundEnabled: boolean;
  subscriberSoundTone: SoundTone;
}

interface SettingsCacheState extends SoundPrefs {
  notificationsEnabled: boolean;
  debugMode: boolean;
  uiLocale: UiLocaleSetting;
  setFromSettings: (s: SoundPrefs & {
    notificationsEnabled: boolean;
    debugMode: boolean;
    uiLocale: UiLocaleSetting;
  }) => void;
}

export const useSettingsCache = create<SettingsCacheState>((set) => ({
  notificationsEnabled: true,
  soundEnabled: true,
  soundTone: 'blip',
  soundVolume: 50,
  subscriberSoundEnabled: true,
  subscriberSoundTone: 'arpeggio',
  debugMode: false,
  uiLocale: 'system',
  setFromSettings: (s) =>
    set({
      notificationsEnabled: s.notificationsEnabled,
      soundEnabled: s.soundEnabled,
      soundTone: s.soundTone,
      soundVolume: s.soundVolume,
      subscriberSoundEnabled: s.subscriberSoundEnabled,
      subscriberSoundTone: s.subscriberSoundTone,
      debugMode: s.debugMode,
      uiLocale: s.uiLocale,
    }),
}));
