import { createHash } from "node:crypto";
import { htmlToPlainText } from "@chatgoose/shared/transcript/index";
import type { OfApiMessage } from "../ofapi/schemas";
import type { WelcomeMessage } from "../ofapi/client";
import type {
  FollowerMessageVM,
  FollowerStatus,
} from "../../preload/followers-contract";

export function plain(value: string | null | undefined): string {
  return htmlToPlainText(value ?? "").trim();
}

/** OF delivers the welcome template through its own queue: every delivered
 * copy carries `queueId` equal to the welcome-template id (live-verified on
 * LoraVie FREE 2026-09-15, 12/12 chats; personal DMs carry unrelated queue
 * ids). That equality is the origin proof D32 asked for (D36). A bare queueId
 * is still NOT a mass-message proof: OFAPI also returns it on personal DMs. */
export function isWelcomeDelivery(
  message: OfApiMessage,
  welcome: WelcomeMessage | null,
): boolean {
  if (welcome === null) return false;
  if (message.queueId === null || message.queueId === undefined) return false;
  return String(message.queueId) === String(welcome.id);
}

/** Matching only the current welcome text/media is a candidate, not proof, since
 * OF does not provide an immutable welcome-origin flag. Ambiguous outgoing
 * messages deny a negative verdict; template edits must never turn uncertainty
 * into a send. */
export function messageKind(
  message: OfApiMessage,
  welcome: WelcomeMessage | null,
): FollowerMessageVM["kind"] {
  if (!message.isSentByMe) return "incoming";
  if (isWelcomeDelivery(message, welcome)) return "automatic";
  // OFAPI's queue supports one recipient and scheduled personal messages.
  // queue=true alone cannot prove mass outreach or an automatic welcome.
  if (message.isFromQueue === true) return "ambiguous";
  if (message.isFromQueue !== false || welcome === null) return "ambiguous";
  const text = plain(message.text);
  const media = (message.media ?? [])
    .map((m) => String(m.id))
    .sort()
    .join(",");
  const welcomeMedia = welcome.media
    .map((m) => String(m.id))
    .sort()
    .join(",");
  if (
    (text !== "" || media !== "") &&
    text === plain(welcome.text) &&
    media === welcomeMedia
  )
    return "ambiguous";
  return "personal";
}

export function historyRevision(messages: readonly OfApiMessage[]): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        [...messages]
          .sort((a, b) => a.id - b.id)
          .map((m) => ({
            id: m.id,
            at: m.createdAt,
            changedAt: m.changedAt,
            sent: m.isSentByMe,
            text: m.text ?? "",
            queue: m.isFromQueue,
            media: m.media,
            price: m.price,
            isTip: m.isTip,
          })),
      ),
    )
    .digest("hex");
}

export function assessHistory(
  messages: readonly OfApiMessage[],
  complete: boolean,
  welcome: WelcomeMessage | null,
): {
  status: FollowerStatus;
  reason: string;
  proof: { at: string; text: string; kind: "personal" | "incoming" } | null;
} {
  const personal = messages.find((m) => messageKind(m, welcome) === "personal");
  if (personal)
    return {
      status: "contacted",
      reason: "Найдено личное исходящее сообщение",
      proof: {
        at: personal.createdAt,
        text: plain(personal.text).slice(0, 240),
        kind: "personal",
      },
    };
  const incoming = messages.find((m) => !m.isSentByMe);
  if (incoming)
    return {
      status: "replied",
      reason: "Фан уже писал — продолжите диалог",
      proof: {
        at: incoming.createdAt,
        text: plain(incoming.text).slice(0, 240),
        kind: "incoming",
      },
    };
  if (!complete)
    return {
      status: "unknown",
      reason: "История загружена не полностью",
      proof: null,
    };
  if (messages.some((m) => messageKind(m, welcome) === "ambiguous"))
    return {
      status: "unknown",
      reason:
        "Нельзя отличить рассылку или отложенное сообщение от личного — проверьте чат вручную",
      proof: null,
    };
  return {
    status: "ready",
    reason: messages.length
      ? "В истории только автоматическое welcome-сообщение"
      : "История пуста",
    proof: null,
  };
}
