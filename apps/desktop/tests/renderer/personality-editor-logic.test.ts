import { describe, expect, it } from 'vitest';
import type { Personality } from '@chatgoose/shared/types';
import {
  applyPersonalityDraft,
  capturePersonalityEditorBase,
  isPersonalityEditorLocked,
} from '../../src/renderer/src/features/settings/sections/personalityEditorLogic';

describe('personality editor CAS base', () => {
  it('does not rebase an open draft onto a later list revision', () => {
    const opened: Personality = {
      id: 'custom:shared',
      name: 'Shared',
      content: 'version one',
      updatedAt: 1,
      remoteVersion: 1,
    };
    const editorBase = capturePersonalityEditorBase(opened);

    // A settings invalidation may replace the live query row while the editor
    // remains open. That row must not become the draft's CAS base.
    const refreshed: Personality = {
      ...opened,
      content: 'device B won',
      updatedAt: 2,
      remoteVersion: 2,
    };
    expect(refreshed.remoteVersion).toBe(2);

    const submitted = applyPersonalityDraft(editorBase, {
      name: ' Shared ',
      content: 'device A draft',
      updatedAt: 3,
    });
    expect(submitted).toMatchObject({
      id: opened.id,
      name: 'Shared',
      content: 'device A draft',
      remoteVersion: 1,
    });
  });

  it('keeps navigation and draft inputs locked until either mutation settles', () => {
    expect(isPersonalityEditorLocked(false, false)).toBe(false);
    expect(isPersonalityEditorLocked(true, false)).toBe(true);
    expect(isPersonalityEditorLocked(false, true)).toBe(true);
    expect(isPersonalityEditorLocked(true, true)).toBe(true);
  });
});
