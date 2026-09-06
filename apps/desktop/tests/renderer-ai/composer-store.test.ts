import { beforeEach, expect, it } from "vitest";
import { useComposerStore } from "../../src/renderer/src/features/conversation/composerStore";
import { DEFAULT_COMPOSER_OPTIONS } from "@chatgoose/shared/composer";
beforeEach(() => useComposerStore.getState().reset());
it("keeps invalid reference fields blocking until every field is repaired", () => {
  useComposerStore.getState().setReference("rfTag", "invalid", "Invalid tag");
  useComposerStore
    .getState()
    .setReference("rfPartner", "12", "Invalid partner");
  expect(useComposerStore.getState().error).toBe("Invalid tag");
  expect(useComposerStore.getState().references.rfTag).toBe("invalid");
  useComposerStore
    .getState()
    .setReference("rfTag", "90071992547409931234", "Invalid tag");
  expect(useComposerStore.getState().error).toBeNull();
  expect(useComposerStore.getState().options.rfTag).toEqual([
    "90071992547409931234",
  ]);
});
it("restores rich payload fields without leaking recovery metadata into the next send", () => {
  const saved = {
    ...DEFAULT_COMPOSER_OPTIONS,
    priceCents: 697,
    reuseProviderOperation: true,
    rfGuest: ["42"],
  };
  useComposerStore.getState().set(saved);
  expect(useComposerStore.getState().options).toEqual({
    ...DEFAULT_COMPOSER_OPTIONS,
    rfGuest: ["42"],
  });
  expect(useComposerStore.getState().references.rfGuest).toBe("42");
  useComposerStore.getState().reset();
  expect(useComposerStore.getState().references.rfGuest).toBe("");
});
