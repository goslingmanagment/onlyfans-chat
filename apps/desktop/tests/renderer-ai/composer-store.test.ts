import { beforeEach, expect, it } from "vitest";
import { useComposerStore } from "../../src/renderer/src/features/conversation/composerStore";
import { DEFAULT_COMPOSER_OPTIONS } from "@chatgoose/shared/composer";
beforeEach(() => useComposerStore.getState().reset());
it("restores rich payload fields without leaking recovery metadata into the next send", () => {
  const saved = {
    ...DEFAULT_COMPOSER_OPTIONS,
    priceCents: 697,
    reuseProviderOperation: true,
    rfGuest: ["90071992547409931234"],
  };
  useComposerStore.getState().set(saved);
  expect(useComposerStore.getState().options).toEqual({
    ...DEFAULT_COMPOSER_OPTIONS,
    rfGuest: ["90071992547409931234"],
  });
  useComposerStore.getState().reset();
  expect(useComposerStore.getState().options).toEqual(DEFAULT_COMPOSER_OPTIONS);
});

it("clears retired options only on explicit action and preserves the reply and saved payload", () => {
  const saved = {
    ...DEFAULT_COMPOSER_OPTIONS,
    lockedText: true,
    replyToMessageId: "123",
    giphyId: "old-gif",
    rfTag: ["11"],
    rfPartner: ["12"],
    rfGuest: ["13"],
    blockBannedWords: "strict_ban" as const,
  };
  const original = structuredClone(saved);
  useComposerStore.getState().set(saved);
  expect(useComposerStore.getState().options).toEqual(original);
  useComposerStore.getState().clearLegacyOptions();
  expect(useComposerStore.getState().options).toEqual({
    ...DEFAULT_COMPOSER_OPTIONS,
    replyToMessageId: "123",
  });
  expect(saved).toEqual(original);
});
