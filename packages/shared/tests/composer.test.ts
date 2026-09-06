import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COMPOSER_OPTIONS,
  composerOptionsSchema,
  needsComposerV2,
  type ComposerOptions,
} from '../src/composer';

describe('needsComposerV2 (review #27 fix 3)', () => {
  it('default options — including a structurally equal copy — keep the v1 text command', () => {
    expect(needsComposerV2(DEFAULT_COMPOSER_OPTIONS)).toBe(false);
    expect(needsComposerV2({ ...DEFAULT_COMPOSER_OPTIONS, rfTag: [], rfPartner: [], rfGuest: [] })).toBe(false);
    expect(needsComposerV2(composerOptionsSchema.parse(structuredClone(DEFAULT_COMPOSER_OPTIONS)))).toBe(false);
  });

  it.each<[keyof ComposerOptions, ComposerOptions[keyof ComposerOptions]]>([
    ['lockedText', true],
    ['replyToMessageId', '12'],
    ['giphyId', 'gif'],
    ['rfTag', ['1']],
    ['rfPartner', ['2']],
    ['rfGuest', ['3']],
    ['blockBannedWords', 'strict_ban'],
    ['blockBannedWords', 'risky'],
    ['blockBannedWords', 'replace_soften'],
  ])('any single rich option (%s) requires send_message_v2', (key, value) => {
    expect(needsComposerV2({ ...DEFAULT_COMPOSER_OPTIONS, [key]: value })).toBe(true);
  });

  it('covers every option key so a new field cannot silently stay on v1', () => {
    for (const key of Object.keys(composerOptionsSchema.shape)) {
      expect(Object.hasOwn(DEFAULT_COMPOSER_OPTIONS, key), key).toBe(true);
    }
  });
});
