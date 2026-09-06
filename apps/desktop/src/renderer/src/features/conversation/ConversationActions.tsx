import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ComposerAction } from "@chatgoose/shared/composer";
import { getBridge } from "../../bridge/bridge";
import { useLocale } from "../../lib/i18n";
import { useComposerStore } from "./composerStore";
import { focusComposer } from "./composerDom";

function useActions(accountId: string, chatId: string, messageId?: string) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["outbox", accountId, chatId, "actions", messageId ?? "chat"],
    queryFn: () =>
      getBridge().invoke("query:composer.actions", {
        accountId,
        chatId,
        ...(messageId === undefined ? {} : { messageId }),
      }),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function perform(action: ComposerAction) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await getBridge().invoke("cmd:composer.action", {
        accountId,
        chatId,
        action,
      });
      if (result.state !== "confirmed") setError(result.error ?? result.state);
      await client.invalidateQueries({
        queryKey: ["outbox", accountId, chatId],
      });
      await client.invalidateQueries({ queryKey: ["chats", accountId] });
      await client.invalidateQueries({ queryKey: ["chat", accountId, chatId] });
      await client.invalidateQueries({ queryKey: ["fan", accountId, chatId] });
    } catch {
      setError(
        "Hub could not confirm the action. Its saved intent is retained.",
      );
    } finally {
      setBusy(false);
    }
  }
  return { rows: query.data ?? [], busy, error, perform };
}
export function MessageActions({
  accountId,
  chatId,
  messageId,
}: {
  accountId: string;
  chatId: string;
  messageId: string;
}): React.JSX.Element {
  const ru = useLocale() === "ru";
  const state = useActions(accountId, chatId, messageId);
  const confirmed = state.rows.filter(
    (row) =>
      row.state === "confirmed" &&
      "messageId" in row.action &&
      row.action.messageId === messageId,
  );
  const liked =
    confirmed.find(
      (row) =>
        row.action.kind === "like_message_v1" ||
        row.action.kind === "unlike_message_v1",
    )?.action.kind === "like_message_v1";
  const pinned =
    confirmed.find(
      (row) =>
        row.action.kind === "pin_message_v1" ||
        row.action.kind === "unpin_message_v1",
    )?.action.kind === "pin_message_v1";
  return (
    <span className="flex flex-wrap gap-2 text-[11px] text-ink-low">
      <button
        type="button"
        className="hover:text-clay-deep"
        onClick={() => {
          useComposerStore.getState().set({ replyToMessageId: messageId });
          focusComposer();
        }}
      >
        {ru ? "Ответить" : "Reply"}
      </button>
      <button
        type="button"
        disabled={state.busy}
        className={liked ? "text-clay-deep" : ""}
        onClick={() =>
          void state.perform({
            kind: liked ? "unlike_message_v1" : "like_message_v1",
            messageId,
          })
        }
      >
        {liked ? (ru ? "Убрать лайк" : "Unlike") : ru ? "Лайк" : "Like"}
      </button>
      <button
        type="button"
        disabled={state.busy}
        className={pinned ? "text-clay-deep" : ""}
        onClick={() =>
          void state.perform({
            kind: pinned ? "unpin_message_v1" : "pin_message_v1",
            messageId,
          })
        }
      >
        {pinned ? (ru ? "Открепить" : "Unpin") : ru ? "Закрепить" : "Pin"}
      </button>
      {state.error && (
        <span role="alert" className="text-warn">
          {state.error}
        </span>
      )}
    </span>
  );
}
export function ConversationActions({
  accountId,
  chatId,
  name,
}: {
  accountId: string;
  chatId: string;
  name: string;
}): React.JSX.Element {
  const ru = useLocale() === "ru";
  const state = useActions(accountId, chatId);
  const [open, setOpen] = useState(false);
  const [customName, setCustomName] = useState(name);
  const [confirmHide, setConfirmHide] = useState(false);
  const muted =
    state.rows.find(
      (row) =>
        row.state === "confirmed" &&
        (row.action.kind === "mute_chat_v1" ||
          row.action.kind === "unmute_chat_v1"),
    )?.action.kind === "mute_chat_v1";
  return (
    <div
      className="relative text-[12px]"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpen(false);
          setConfirmHide(false);
        }
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label={ru ? "Действия с чатом" : "Chat actions"}
        onClick={() => setOpen(!open)}
        className="rounded-full border border-line px-2 py-1"
      >
        •••
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-30 w-80 space-y-3 rounded-card border border-line bg-bg1 p-3 shadow-soft">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void state.perform({
                kind: "set_fan_custom_name_v1",
                customName,
              });
            }}
          >
            <label className="block text-ink-mid">
              {ru ? "Имя фана в OnlyFans" : "OnlyFans custom name"}
              <input
                aria-label={ru ? "Имя фана" : "Fan custom name"}
                className="mt-1 w-full rounded border border-line bg-bg2 p-1 text-ink"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                maxLength={100}
              />
            </label>
            <button
              type="submit"
              className="mt-1 text-clay-deep underline"
              disabled={state.busy}
            >
              {ru ? "Сохранить имя" : "Save name"}
            </button>
          </form>
          <div className="flex flex-wrap gap-3 text-clay-deep">
            <button
              type="button"
              disabled={state.busy}
              onClick={() =>
                void state.perform({ kind: "mark_chat_unread_v1" })
              }
            >
              {ru ? "Отметить непрочитанным" : "Mark unread"}
            </button>
            <button
              type="button"
              disabled={state.busy}
              onClick={() =>
                void state.perform({
                  kind: muted ? "unmute_chat_v1" : "mute_chat_v1",
                })
              }
            >
              {muted
                ? ru
                  ? "Включить уведомления"
                  : "Unmute"
                : ru
                  ? "Выключить уведомления"
                  : "Mute"}
            </button>
          </div>
          {confirmHide ? (
            <div>
              {ru ? "Скрыть чат в OnlyFans?" : "Hide this chat in OnlyFans?"}{" "}
              <button
                type="button"
                disabled={state.busy}
                className="text-clay-deep underline"
                onClick={() => {
                  setConfirmHide(false);
                  void state.perform({ kind: "hide_chat_v1" });
                }}
              >
                {ru ? "Скрыть" : "Hide"}
              </button>{" "}
              ·{" "}
              <button type="button" onClick={() => setConfirmHide(false)}>
                {ru ? "Отмена" : "Cancel"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="text-ink-mid underline"
              onClick={() => setConfirmHide(true)}
            >
              {ru ? "Скрыть чат…" : "Hide chat…"}
            </button>
          )}
          {state.error && (
            <p role="alert" className="text-warn">
              {state.error}
            </p>
          )}
          <div className="max-h-40 space-y-1 overflow-auto border-t border-line pt-2 text-ink-low">
            {state.rows.slice(0, 8).map((row) => (
              <div key={row.clientCommandId}>
                <span>
                  {row.action.kind.replace(/_v1$/, "").replaceAll("_", " ")} ·{" "}
                  {row.state}
                </span>
                {row.state === "unconfirmed" && (
                  <button
                    type="button"
                    disabled={state.busy}
                    className="ml-2 text-clay-deep underline"
                    onClick={() => void state.perform(row.action)}
                  >
                    {ru ? "Проверить статус" : "Check status"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
