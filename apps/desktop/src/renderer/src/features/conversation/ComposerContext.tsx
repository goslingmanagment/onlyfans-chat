import { useLocale } from "../../lib/i18n";
import { useComposerStore } from "./composerStore";

/** Selection/removal only. Retained outbox payloads must never become invisible
 * when a newer release removes the controls that originally created them. */
export function ComposerContext(): React.JSX.Element | null {
  const ru = useLocale() === "ru";
  const { options, set, clearLegacyOptions } = useComposerStore();
  const retained: string[] = [];
  if (options.lockedText)
    retained.push(
      ru ? "текст скрыт до покупки" : "caption hidden until purchased",
    );
  if (options.giphyId) retained.push("GIF");
  if (
    options.rfTag.length ||
    options.rfPartner.length ||
    options.rfGuest.length
  ) {
    retained.push(ru ? "отметки участников" : "participant tags");
  }
  if (options.blockBannedWords) {
    const levels = {
      strict_ban: ru
        ? "проверка слов: все уровни"
        : "word screening: all tiers",
      risky: ru
        ? "проверка слов: рискованные и требующие замены"
        : "word screening: risky and replace/soften",
      replace_soften: ru
        ? "проверка слов: требующие замены"
        : "word screening: replace/soften",
    };
    retained.push(levels[options.blockBannedWords]);
  }
  if (!options.replyToMessageId && retained.length === 0) return null;

  return (
    <div className="mb-2 space-y-1 text-[12px] text-ink-mid">
      {options.replyToMessageId && (
        <div className="flex items-center gap-2">
          <span>
            {ru ? "Ответ на" : "Reply to"} #{options.replyToMessageId}
          </span>
          <button
            type="button"
            aria-label={ru ? "Убрать ответ" : "Clear reply"}
            className="text-clay-deep"
            onClick={() => set({ replyToMessageId: null })}
          >
            ×
          </button>
        </div>
      )}
      {retained.length > 0 && (
        <div>
          {ru ? "Из сохранённого сообщения: " : "From the saved message: "}
          {retained.join("; ")}.{" "}
          <button
            type="button"
            className="text-clay-deep underline"
            onClick={clearLegacyOptions}
          >
            {ru ? "Сбросить эти параметры" : "Clear these options"}
          </button>
        </div>
      )}
    </div>
  );
}
