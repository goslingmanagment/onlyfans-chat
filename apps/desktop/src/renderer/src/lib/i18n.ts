// Renderer binding for the shared UI message catalog (stage 1: settings
// surface + status bar + toasts). Locale = settings.uiLocale resolved against
// the browser tag; non-React consumers read the zustand settings mirror.

import { useMemo } from 'react';
import {
  UI_MESSAGES,
  makeTranslator,
  resolveUiLocale,
  uiMessage,
  type UiLocale,
  type UiMessageKey,
  type UiTranslator,
} from '@chatgoose/shared/i18n/index';
import { useSettings } from '../bridge/queries';
import { useSettingsCache } from '../state/settingsCache';

export function useLocale(): UiLocale {
  const setting = useSettings().data?.uiLocale ?? 'system';
  return resolveUiLocale(setting, navigator.language);
}

export function useT(): UiTranslator {
  const locale = useLocale();
  return useMemo(() => makeTranslator(locale), [locale]);
}

/** Locale for non-React consumers (bridge/events.ts toasts). */
export function currentLocale(): UiLocale {
  return resolveUiLocale(useSettingsCache.getState().uiLocale, navigator.language);
}

/** BCP-47 tag for Intl formatting (dates in key metadata etc.). */
export function localeTag(locale: UiLocale): string {
  return locale === 'ru' ? 'ru-RU' : 'en-US';
}

/**
 * Failure text for a CG-* code. EN always shows the registry-backed wire
 * message; RU uses the catalog when it covers the code and falls back to the
 * wire message otherwise.
 */
export function localizedErrorText(locale: UiLocale, code: string | null, fallback: string): string {
  if (locale !== 'en' && code !== null) {
    const key = `err.${code}`;
    if (key in UI_MESSAGES) {
      return uiMessage(locale, key as UiMessageKey);
    }
  }
  return fallback;
}
