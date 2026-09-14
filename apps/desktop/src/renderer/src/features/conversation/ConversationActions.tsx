import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ComposerAction } from "@chatgoose/shared/composer";
import { getBridge } from "../../bridge/bridge";
import { useLocale } from "../../lib/i18n";
import { useComposerStore } from "./composerStore";
import { focusComposer } from "./composerDom";

const actionLabels: Record<ComposerAction["kind"], [string, string]> = {
  set_fan_custom_name_v1: ["Изменение имени", "Name change"],
  like_message_v1: ["Лайк", "Like"],
  unlike_message_v1: ["Снятие лайка", "Unlike"],
  pin_message_v1: ["Закрепление сообщения", "Pin message"],
  unpin_message_v1: ["Открепление сообщения", "Unpin message"],
  mark_chat_unread_v1: ["Отметка непрочитанным", "Mark unread"],
  mute_chat_v1: ["Выключение уведомлений", "Mute"],
  unmute_chat_v1: ["Включение уведомлений", "Unmute"],
  hide_chat_v1: ["Скрытие чата", "Hide chat"],
};

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
  return (
    <div
      className="relative text-[12px]"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpen(false);
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
          {state.error && (
            <p role="alert" className="text-warn">
              {state.error}
            </p>
          )}
          {state.rows.some((row) => row.state === "unconfirmed") && (
            <div className="space-y-1 border-t border-line pt-2 text-ink-low">
              {state.rows
                .filter((row) => row.state === "unconfirmed")
                .map((row) => (
                  <div key={row.clientCommandId}>
                    <span>
                      {actionLabels[row.action.kind][ru ? 0 : 1]}:{" "}
                      {ru ? "не подтверждено" : "not confirmed"}
                    </span>
                    <button
                      type="button"
                      disabled={state.busy}
                      className="ml-2 text-clay-deep underline"
                      onClick={() => void state.perform(row.action)}
                    >
                      {ru ? "Проверить статус" : "Check status"}
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
