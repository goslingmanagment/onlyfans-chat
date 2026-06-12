import { describe, expect, it } from 'vitest';
import {
  UI_MESSAGES,
  makeTranslator,
  pluralEn,
  pluralRu,
  pluralWord,
  resolveUiLocale,
  uiMessage,
} from '../src/i18n/index';
import { OFAPI_PURPOSES, UNTAGGED_PURPOSE, OFAPI_PURPOSE_LABELS } from '../src/activity/purposes';

describe('UI message catalog', () => {
  it('every key has non-empty en and ru texts', () => {
    for (const [key, entry] of Object.entries(UI_MESSAGES)) {
      expect(entry.en.length, `${key}.en`).toBeGreaterThan(0);
      expect(entry.ru.length, `${key}.ru`).toBeGreaterThan(0);
    }
  });

  it('placeholders match between locales', () => {
    const names = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();
    for (const [key, entry] of Object.entries(UI_MESSAGES)) {
      expect(names(entry.ru), `${key}: placeholder mismatch`).toEqual(names(entry.en));
    }
  });

  it('ru texts differ from en where translation is expected (spot checks)', () => {
    expect(UI_MESSAGES['settings.title'].ru).toBe('Настройки');
    expect(UI_MESSAGES['activity.totalToday'].ru).toBe('Итого за сегодня');
  });

  it('covers every OFAPI purpose incl. untagged, with en equal to the shared label map', () => {
    for (const purpose of [...OFAPI_PURPOSES, UNTAGGED_PURPOSE]) {
      const key = `purpose.${purpose}` as keyof typeof UI_MESSAGES;
      expect(UI_MESSAGES[key], key).toBeDefined();
      expect(UI_MESSAGES[key].en).toBe(OFAPI_PURPOSE_LABELS[purpose]);
    }
  });
});

describe('uiMessage', () => {
  it('returns the locale text and interpolates {params}', () => {
    expect(uiMessage('en', 'settings.title')).toBe('Settings');
    expect(uiMessage('ru', 'settings.title')).toBe('Настройки');
    expect(uiMessage('ru', 'activity.balance', { n: '96,105' })).toBe('Остаток 96,105');
    expect(uiMessage('en', 'notif.budgetBody', { used: 80, budget: 100 })).toBe(
      '80 of 100 credits used this shift.',
    );
  });

  it('leaves unknown placeholders verbatim', () => {
    expect(uiMessage('en', 'activity.balance', {})).toBe('Balance {n}');
  });

  it('makeTranslator binds the locale', () => {
    const t = makeTranslator('ru');
    expect(t('common.save')).toBe('Сохранить');
  });
});

describe('resolveUiLocale', () => {
  it('explicit settings win', () => {
    expect(resolveUiLocale('en', 'ru-RU')).toBe('en');
    expect(resolveUiLocale('ru', 'en-US')).toBe('ru');
  });

  it('system resolves by tag prefix, defaulting to en', () => {
    expect(resolveUiLocale('system', 'ru-RU')).toBe('ru');
    expect(resolveUiLocale('system', 'ru')).toBe('ru');
    expect(resolveUiLocale('system', 'RU')).toBe('ru');
    expect(resolveUiLocale('system', 'en-US')).toBe('en');
    expect(resolveUiLocale('system', 'uk-UA')).toBe('en');
    expect(resolveUiLocale('system', null)).toBe('en');
    expect(resolveUiLocale('system', undefined)).toBe('en');
    expect(resolveUiLocale('system', '')).toBe('en');
  });
});

describe('plural helpers', () => {
  it('pluralRu follows CLDR russian rules', () => {
    const word = (n: number): string => pluralRu(n, 'запуск', 'запуска', 'запусков');
    expect(word(1)).toBe('запуск');
    expect(word(21)).toBe('запуск');
    expect(word(101)).toBe('запуск');
    expect(word(2)).toBe('запуска');
    expect(word(3)).toBe('запуска');
    expect(word(4)).toBe('запуска');
    expect(word(22)).toBe('запуска');
    expect(word(0)).toBe('запусков');
    expect(word(5)).toBe('запусков');
    expect(word(11)).toBe('запусков');
    expect(word(12)).toBe('запусков');
    expect(word(14)).toBe('запусков');
    expect(word(111)).toBe('запусков');
    expect(word(24)).toBe('запуска');
    expect(word(25)).toBe('запусков');
  });

  it('pluralEn picks one vs other', () => {
    expect(pluralEn(1, 'run', 'runs')).toBe('run');
    expect(pluralEn(0, 'run', 'runs')).toBe('runs');
    expect(pluralEn(2, 'run', 'runs')).toBe('runs');
  });

  it('pluralWord dispatches by locale', () => {
    expect(pluralWord('en', 5, ['run', 'runs'], ['запуск', 'запуска', 'запусков'])).toBe('runs');
    expect(pluralWord('ru', 5, ['run', 'runs'], ['запуск', 'запуска', 'запусков'])).toBe('запусков');
  });
});
