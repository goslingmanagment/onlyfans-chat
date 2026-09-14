import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_COMPOSER_OPTIONS } from "@chatgoose/shared/composer";
import { useComposerStore } from "../../src/renderer/src/features/conversation/composerStore";
import type * as ComposerStoreModule from "../../src/renderer/src/features/conversation/composerStore";
import { ComposerContext } from "../../src/renderer/src/features/conversation/ComposerContext";

vi.mock("../../src/renderer/src/lib/i18n", () => ({ useLocale: () => "ru" }));
vi.mock(
  "../../src/renderer/src/features/conversation/composerStore",
  async (importOriginal) => {
    const original =
      await importOriginal<
      typeof ComposerStoreModule
      >();
    // Render the current store snapshot with server rendering, without a DOM shim.
    return {
      ...original,
      useComposerStore: Object.assign(
        () => original.useComposerStore.getState(),
        original.useComposerStore,
      ),
    };
  },
);
vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => useComposerStore.getState().reset());

it("renders nothing for a fresh composer", () => {
  expect(renderToStaticMarkup(React.createElement(ComposerContext))).toBe("");
});

it("keeps reply selection visible and removable without the options form", () => {
  useComposerStore.getState().set({ replyToMessageId: "123" });
  const html = renderToStaticMarkup(React.createElement(ComposerContext));
  expect(html).toContain("Ответ на");
  expect(html).toContain("123");
  expect(html).toContain("Убрать ответ");
  expect(html).not.toContain("Параметры сообщения");
  expect(html).not.toMatch(/<(input|select)/);
});

it("makes restored legacy options visible without exposing raw IDs or new input controls", () => {
  const saved = {
    ...DEFAULT_COMPOSER_OPTIONS,
    lockedText: true,
    giphyId: "legacy-gif-secret-id",
    rfTag: ["90071992547409931234"],
    blockBannedWords: "risky" as const,
  };
  useComposerStore.getState().set(saved);
  const html = renderToStaticMarkup(React.createElement(ComposerContext));
  expect(html).toContain("текст скрыт до покупки");
  expect(html).toContain("GIF");
  expect(html).toContain("отметки участников");
  expect(html).toContain("проверка слов: рискованные и требующие замены");
  expect(html).toContain("Сбросить эти параметры");
  expect(html).not.toContain(saved.giphyId);
  expect(html).not.toContain(saved.rfTag[0]);
  expect(html).not.toMatch(/<(input|select)/);
  expect(useComposerStore.getState().options).toEqual(saved);
});
