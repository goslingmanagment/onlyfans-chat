import type { Personality } from '@chatgoose/shared/types';

/** Immutable editor base: the CAS token belongs to the payload the user saw. */
export function capturePersonalityEditorBase(personality: Personality): Personality {
  return { ...personality };
}

export function applyPersonalityDraft(
  base: Personality,
  draft: { name: string; content: string; updatedAt: number },
): Personality {
  return {
    ...base,
    name: draft.name.trim(),
    content: draft.content,
    updatedAt: draft.updatedAt,
  };
}

/** A pending save/delete owns the visible draft until its completion callback. */
export function isPersonalityEditorLocked(savePending: boolean, deletePending: boolean): boolean {
  return savePending || deletePending;
}
