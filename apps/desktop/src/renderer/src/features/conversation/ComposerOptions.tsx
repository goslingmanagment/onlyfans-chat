import { useEffect, useState } from "react";
import type { InvokeChannels } from "../../../../preload/contract";
type HubBannedPreview =
  InvokeChannels["query:composer.bannedPreview"]["result"];
type ComposerReferenceKind =
  InvokeChannels["query:composer.references"]["args"]["kind"];
import { getBridge } from "../../bridge/bridge";
import { useComposerStore } from "./composerStore";
import { useLocale } from "../../lib/i18n";

const inputClass =
  "rounded-chip border border-line bg-bg2 px-2 py-1 text-[12px] text-ink outline-none focus:border-clay-line";
export function ComposerOptions({
  accountId,
  draft,
}: {
  accountId: string;
  draft: string;
}): React.JSX.Element {
  const ru = useLocale() === "ru";
  const state = useComposerStore();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<HubBannedPreview | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [kind, setKind] = useState<ComposerReferenceKind>("giphy");
  const [query, setQuery] = useState("");
  const [references, setReferences] = useState<
    InvokeChannels["query:composer.references"]["result"] | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void getBridge()
        .invoke("query:composer.bannedPreview", { text: draft.slice(0, 10000) })
        .then((result) => {
          if (active) {
            setPreview(result);
            setPreviewFailed(false);
          }
        })
        .catch(() => {
          if (active) {
            setPreview(null);
            setPreviewFailed(true);
          }
        });
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [draft]);
  async function lookup() {
    if (busy) return;
    setBusy(true);
    setLookupError(null);
    try {
      setReferences(
        await getBridge().invoke("query:composer.references", {
          accountId,
          kind,
          query,
        }),
      );
    } catch {
      setReferences(null);
      setLookupError(
        ru
          ? "Справочник недоступен. Владелец проверяет доступ и политику сбора."
          : "Lookup unavailable. Ask the owner to check access and collection policy.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mb-2 text-[12px]">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="text-clay-deep underline decoration-dotted"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {ru ? "Параметры сообщения" : "Message options"}
        </button>
        {state.options.replyToMessageId && (
          <span>
            {ru ? "Ответ на" : "Reply to"} #{state.options.replyToMessageId}{" "}
            <button
              type="button"
              aria-label={ru ? "Убрать ответ" : "Clear reply"}
              onClick={() => state.set({ replyToMessageId: null })}
            >
              ×
            </button>
          </span>
        )}
        {state.options.giphyId && (
          <span>
            GIF: {state.options.giphyId}{" "}
            <button
              type="button"
              aria-label={ru ? "Убрать GIF" : "Clear GIF"}
              onClick={() => state.set({ giphyId: null })}
            >
              ×
            </button>
          </span>
        )}
      </div>
      {open && (
        <div className="mt-2 space-y-2 rounded-chip border border-line bg-bg1 p-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={state.options.lockedText}
              onChange={(e) => state.set({ lockedText: e.target.checked })}
            />
            {ru ? "Скрыть текст до покупки" : "Hide caption until purchased"}
          </label>
          <label className="flex flex-wrap items-center gap-2">
            {ru ? "Проверка провайдера" : "Provider screening"}
            <select
              className={inputClass}
              value={state.options.blockBannedWords ?? ""}
              onChange={(e) =>
                state.set({
                  blockBannedWords: (e.target.value ||
                    null) as typeof state.options.blockBannedWords,
                })
              }
            >
              <option value="">
                {ru
                  ? "Только подсказки; не блокировать"
                  : "Preview only; do not block"}
              </option>
              <option value="strict_ban">
                {ru ? "Блокировать все три уровня" : "Block all three tiers"}
              </option>
              <option value="risky">
                {ru
                  ? "Блокировать Risky + Replace/soften"
                  : "Block Risky + Replace/soften"}
              </option>
              <option value="replace_soften">
                {ru
                  ? "Блокировать только Replace/soften"
                  : "Block Replace/soften only"}
              </option>
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <select
              aria-label={ru ? "Справочник" : "Reference type"}
              className={inputClass}
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as ComposerReferenceKind);
                setReferences(null);
              }}
            >
              <option value="giphy">Giphy</option>
              <option value="release_forms">
                {ru ? "Релиз-формы" : "Release forms"}
              </option>
              <option value="taggable_users">
                {ru ? "Люди для отметки" : "Taggable users"}
              </option>
            </select>
            <input
              aria-label={ru ? "Поиск в справочнике" : "Reference search"}
              className={inputClass}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={200}
            />
            <button
              type="button"
              className="text-clay-deep underline"
              disabled={busy}
              onClick={() => void lookup()}
            >
              {busy ? "…" : ru ? "Загрузить одну страницу" : "Load one page"}
            </button>
          </div>
          {lookupError && (
            <p role="alert" className="text-warn">
              {lookupError}
            </p>
          )}
          {references && (
            <div className="max-h-32 overflow-auto">
              {references.items.map((item) => (
                <div className="flex gap-2 py-1" key={item.id}>
                  <span>
                    {item.label} · {item.id}
                    {item.partnerId ? ` · partner ${item.partnerId}` : ""}
                    {item.guest ? " · guest" : ""}
                  </span>
                  {kind === "giphy" && (
                    <button
                      type="button"
                      className="text-clay-deep underline"
                      onClick={() => state.set({ giphyId: item.id })}
                    >
                      {ru ? "Прикрепить" : "Attach"}
                    </button>
                  )}
                </div>
              ))}
              <p className="text-ink-low">
                {references.partial
                  ? ru
                    ? "Полнота справочника не подтверждена. Уточните поиск."
                    : "Partial or unknown coverage. Narrow the search."
                  : ru
                    ? "Ответ провайдера на этот запрос."
                    : "Provider response for this lookup."}
              </p>
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-3">
            {(["rfTag", "rfPartner", "rfGuest"] as const).map((field) => (
              <label key={field}>
                {field === "rfTag"
                  ? ru
                    ? "ID авторов"
                    : "Creator IDs"
                  : field === "rfPartner"
                    ? ru
                      ? "ID партнёров"
                      : "Partner IDs"
                    : ru
                      ? "ID гостей"
                      : "Guest IDs"}
                <input
                  className={`${inputClass} mt-1 w-full`}
                  aria-label={field}
                  value={state.references[field]}
                  onChange={(e) =>
                    state.setReference(
                      field,
                      e.target.value,
                      ru
                        ? "Нужны числовые ID через запятую. ID формы не равен ID человека."
                        : "Use numeric IDs separated by commas. A form ID is not a person ID.",
                    )
                  }
                />
              </label>
            ))}
          </div>
          <p className="text-ink-low">
            {ru
              ? "Прикрепляйте подтверждённые ID нужного типа. ID формы не преобразуется в ID партнёра или гостя."
              : "Attach verified IDs of the selected type. A form ID is not converted into a partner or guest ID."}
          </p>
        </div>
      )}
      {state.error && (
        <p role="alert" className="text-bad">
          {state.error}
        </p>
      )}
      {previewFailed ? (
        <p className="mt-1 text-ink-low">
          {ru
            ? "Словарь сейчас недоступен. Текст не изменён."
            : "Dictionary unavailable. Draft unchanged."}
        </p>
      ) : (
        preview && (
          <div className="mt-1 text-ink-low">
            {preview.version === null
              ? ru
                ? "Словарь ещё не загружен владельцем."
                : "The owner has not loaded a dictionary yet."
              : !preview.complete
                ? ru
                  ? "Словарь частичный."
                  : "Dictionary coverage is partial."
                : null}
            {preview.matches.map((match, i) => (
              <div key={`${match.start}:${i}`}>
                <mark className="rounded bg-warn/15 px-1 text-warn">
                  {draft.slice(match.start, match.end)}
                </mark>{" "}
                · {match.riskLevel}
                {match.alternatives ? ` → ${match.alternatives}` : ""}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
