import { create } from "zustand";
import {
  DEFAULT_COMPOSER_OPTIONS,
  type ComposerOptions,
} from "@chatgoose/shared/composer";
interface State {
  options: ComposerOptions;
  set: (patch: Partial<ComposerOptions>) => void;
  clearLegacyOptions: () => void;
  reset: () => void;
}
export const useComposerStore = create<State>((set) => ({
  options: { ...DEFAULT_COMPOSER_OPTIONS },
  set: (patch) =>
    set((state) => ({
      options: {
        ...state.options,
        ...Object.fromEntries(
          Object.entries(patch).filter(
            ([key]) => key in DEFAULT_COMPOSER_OPTIONS,
          ),
        ),
      },
    })),
  clearLegacyOptions: () =>
    set((state) => ({
      options: {
        ...DEFAULT_COMPOSER_OPTIONS,
        replyToMessageId: state.options.replyToMessageId,
      },
    })),
  reset: () =>
    set({
      options: { ...DEFAULT_COMPOSER_OPTIONS },
    }),
}));

export const pendingComposerRows = new Set<string>();
