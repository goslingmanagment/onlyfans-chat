import { create } from "zustand";
import {
  DEFAULT_COMPOSER_OPTIONS,
  releaseReferenceIds,
  type ComposerOptions,
} from "@chatgoose/shared/composer";
type ReferenceField = "rfTag" | "rfPartner" | "rfGuest";
const fields = ["rfTag", "rfPartner", "rfGuest"] as const;
const emptyReferences = { rfTag: "", rfPartner: "", rfGuest: "" };
interface State {
  options: ComposerOptions;
  error: string | null;
  set: (patch: Partial<ComposerOptions>) => void;
  references: Record<ReferenceField, string>;
  invalidReferences: Partial<Record<ReferenceField, string>>;
  setReference: (field: ReferenceField, text: string, error: string) => void;
  reset: () => void;
}
export const useComposerStore = create<State>((set) => ({
  options: { ...DEFAULT_COMPOSER_OPTIONS },
  error: null,
  references: { ...emptyReferences },
  invalidReferences: {},
  set: (patch) =>
    set((state) => ({
      references: {
        ...state.references,
        ...Object.fromEntries(
          fields
            .filter((field) => patch[field] !== undefined)
            .map((field) => [field, patch[field]!.join(", ")]),
        ),
      },
      options: {
        ...state.options,
        ...Object.fromEntries(
          Object.entries(patch).filter(
            ([key]) => key in DEFAULT_COMPOSER_OPTIONS,
          ),
        ),
      },
    })),
  setReference: (field, text, error) =>
    set((state) => {
      const invalidReferences = { ...state.invalidReferences };
      let options = state.options;
      try {
        options = { ...options, [field]: releaseReferenceIds(text) };
        delete invalidReferences[field];
      } catch {
        invalidReferences[field] = error;
      }
      return {
        options,
        references: { ...state.references, [field]: text },
        invalidReferences,
        error: Object.values(invalidReferences)[0] ?? null,
      };
    }),
  reset: () =>
    set({
      options: { ...DEFAULT_COMPOSER_OPTIONS },
      error: null,
      references: { ...emptyReferences },
      invalidReferences: {},
    }),
}));

export const pendingComposerRows = new Set<string>();
