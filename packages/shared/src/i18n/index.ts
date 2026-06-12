// UI localization (stage 1: settings surface + status bar + toasts + main notifications).
// Platform-pure: a typed message catalog plus tiny helpers — no Intl loading, no deps.
// AI prompts are NOT localized (CLAUDE.md: prompts are byte-for-byte; language of the
// interface never touches the LLM path).

import { UI_MESSAGES, type UiMessageKey } from './catalog';

export { UI_MESSAGES, type UiMessageKey } from './catalog';

export type UiLocale = 'en' | 'ru';

/** Settings value: 'system' resolves from the OS/browser locale tag at runtime. */
export type UiLocaleSetting = 'system' | UiLocale;

export const UI_LOCALE_SETTINGS = ['system', 'en', 'ru'] as const satisfies readonly UiLocaleSetting[];

/** Resolve the persisted setting against a BCP-47-ish tag ('ru-RU', 'ru', 'en-US', …). */
export function resolveUiLocale(setting: UiLocaleSetting, systemTag: string | null | undefined): UiLocale {
  if (setting === 'en' || setting === 'ru') {
    return setting;
  }
  return (systemTag ?? '').toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

export type UiMessageParams = Record<string, string | number>;

/** Translate a catalog key, interpolating `{name}` placeholders. Unknown placeholders stay verbatim. */
export function uiMessage(locale: UiLocale, key: UiMessageKey, params?: UiMessageParams): string {
  const template = UI_MESSAGES[key][locale];
  if (params === undefined) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/** Translator bound to one locale — what renderer hooks and main-process call sites use. */
export type UiTranslator = (key: UiMessageKey, params?: UiMessageParams) => string;

export function makeTranslator(locale: UiLocale): UiTranslator {
  return (key, params) => uiMessage(locale, key, params);
}

/** Russian plural form: 1 запуск / 2 запуска / 5 запусков (standard CLDR rules, integers). */
export function pluralRu(count: number, one: string, few: string, many: string): string {
  const n = Math.abs(Math.trunc(count));
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few;
  }
  return many;
}

export function pluralEn(count: number, one: string, other: string): string {
  return Math.abs(count) === 1 ? one : other;
}

/** Locale-aware count word: pluralWord('ru', 5, ['run','runs'], ['запуск','запуска','запусков']). */
export function pluralWord(
  locale: UiLocale,
  count: number,
  en: readonly [string, string],
  ru: readonly [string, string, string],
): string {
  return locale === 'ru' ? pluralRu(count, ru[0], ru[1], ru[2]) : pluralEn(count, en[0], en[1]);
}
