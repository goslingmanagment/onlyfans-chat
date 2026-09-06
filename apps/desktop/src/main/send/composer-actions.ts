import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { routeSchemas } from "@kernel/sdk";
import {
  composerActionSchema,
  type ComposerAction,
} from "@chatgoose/shared/composer";
import type { HubClient, HubOfapiCommand } from "@chatgoose/shared/hub/index";
import type { DataLayer } from "../db/index";

export interface ComposerActionResult {
  clientCommandId: string;
  coreCommandId: string | null;
  action: ComposerAction;
  state: "pending" | "confirmed" | "failed" | "unconfirmed";
  error: string | null;
}
const rowSchema = z.object({
  client_command_id: z.string(),
  core_command_id: z.string().nullable(),
  action: z.string(),
  state: z.enum(["pending", "confirmed", "failed", "unconfirmed"]),
  result: z.string().nullable(),
});
function decode(value: unknown): ComposerActionResult {
  const row = rowSchema.parse(value);
  return {
    clientCommandId: row.client_command_id,
    coreCommandId: row.core_command_id,
    action: composerActionSchema.parse(JSON.parse(row.action)),
    state: row.state,
    error: row.result,
  };
}
export function createComposerActionService(
  data: DataLayer,
  hub: Pick<HubClient, "createOfapiCommand" | "getOfapiCommand"> | undefined,
  now = Date.now,
) {
  const flights = new Map<string, Promise<ComposerActionResult>>();
  function list(accountId: string, chatId: string, messageId?: string) {
    return data.db
      .prepare(
        `WITH scoped AS (
          SELECT *, rowid AS sequence,
            CASE json_extract(action,'$.kind')
              WHEN 'like_message_v1' THEN 'like' WHEN 'unlike_message_v1' THEN 'like'
              WHEN 'pin_message_v1' THEN 'pin' WHEN 'unpin_message_v1' THEN 'pin'
              WHEN 'mute_chat_v1' THEN 'mute' WHEN 'unmute_chat_v1' THEN 'mute'
              ELSE json_extract(action,'$.kind') END AS state_key
          FROM composer_actions WHERE account_id=@a AND chat_id=@c
            AND (@message IS NULL OR json_extract(action,'$.messageId')=@message)
        ), latest AS (
          SELECT *, row_number() OVER (PARTITION BY state_key ORDER BY sequence DESC) AS rank
          FROM scoped WHERE state='confirmed'
            AND (@message IS NOT NULL OR json_extract(action,'$.messageId') IS NULL)
        ), recent AS (SELECT sequence FROM scoped ORDER BY sequence DESC LIMIT 50)
        SELECT * FROM scoped WHERE sequence IN (SELECT sequence FROM recent)
          OR sequence IN (SELECT sequence FROM latest WHERE rank=1)
        ORDER BY sequence DESC`,
      )
      .all({ a: accountId, c: chatId, message: messageId ?? null })
      .map(decode);
  }
  function applyConfirmed(
    accountId: string,
    chatId: string,
    action: ComposerAction,
  ) {
    if (action.kind === "set_fan_custom_name_v1") {
      data.db
        .prepare(
          "UPDATE fans SET custom_name=@name WHERE account_id=@a AND fan_id=@c",
        )
        .run({ a: accountId, c: chatId, name: action.customName });
      data.db
        .prepare(
          "UPDATE chats SET fan_name=CASE WHEN @name != '' THEN @name ELSE coalesce((SELECT name FROM fans WHERE account_id=@a AND fan_id=@c),fan_name) END WHERE account_id=@a AND chat_id=@c",
        )
        .run({ a: accountId, c: chatId, name: action.customName });
      data.bus.publish({ scope: "fans", accountId });
    } else if (action.kind === "mark_chat_unread_v1") {
      data.db
        .prepare(
          "UPDATE chats SET unread_count=max(unread_count,1) WHERE account_id=@a AND chat_id=@c",
        )
        .run({ a: accountId, c: chatId });
    } else if (action.kind === "hide_chat_v1") {
      // The hide moment is at least the current head, so a head timestamp a
      // few seconds ahead of this clock cannot un-hide the chat on the next
      // sync; only a head that advances past it does (chats upsert, v22).
      data.db
        .prepare(
          `UPDATE chats SET locally_hidden=1,
             locally_hidden_at=CASE WHEN last_message_at IS NOT NULL
               AND julianday(last_message_at) > julianday(@now) THEN last_message_at ELSE @now END
           WHERE account_id=@a AND chat_id=@c`,
        )
        .run({ a: accountId, c: chatId, now: new Date(now()).toISOString() });
    }
    // Like/pin/mute are projected from the retained confirmed action rows. They
    // do not fabricate message bodies or turn failed/unknown commands into UI state.
    data.bus.publish({ scope: "chats", accountId, chatId });
    data.bus.publish({ scope: "messages", accountId, chatId });
  }
  async function run(
    accountId: string,
    chatId: string,
    action: ComposerAction,
    key: string,
  ) {
    if (!hub) throw new Error("Hub command transport is not configured");
    const existing = data.db
      .prepare(
        `SELECT * FROM composer_actions WHERE account_id=@a AND chat_id=@c AND action_key=@k AND state IN ('pending','unconfirmed') ORDER BY created_at DESC LIMIT 1`,
      )
      .get({ a: accountId, c: chatId, k: key });
    let row: ComposerActionResult;
    if (existing) row = decode(existing);
    else {
      const family = (value: ComposerAction) => {
        if ("messageId" in value)
          return `${value.kind.includes("pin_") ? "pin" : "like"}:${value.messageId}`;
        return value.kind === "unmute_chat_v1" ? "mute_chat_v1" : value.kind;
      };
      const unresolved = data.db
        .prepare(
          "SELECT * FROM composer_actions WHERE account_id=@a AND chat_id=@c AND state IN ('pending','unconfirmed')",
        )
        .all({ a: accountId, c: chatId })
        .map(decode);
      if (unresolved.some((saved) => family(saved.action) === family(action))) {
        throw new Error(
          "Check the saved action status before changing the same setting.",
        );
      }
      row = {
        clientCommandId: randomUUID(),
        coreCommandId: null,
        action,
        state: "pending",
        error: null,
      };
      data.db
        .prepare(
          `INSERT INTO composer_actions(client_command_id,account_id,chat_id,action,action_key,state,created_at,updated_at) VALUES(@id,@a,@c,@action,@k,'pending',@now,@now)`,
        )
        .run({
          id: row.clientCommandId,
          a: accountId,
          c: chatId,
          action: JSON.stringify(action),
          k: key,
          now: new Date(now()).toISOString(),
        });
    }
    const persist = (
      state: ComposerActionResult["state"],
      result: string | null,
      commandId = row.coreCommandId,
    ) => {
      data.db
        .prepare(
          "UPDATE composer_actions SET state=@state,result=@result,core_command_id=coalesce(core_command_id,@command),updated_at=@now WHERE client_command_id=@id",
        )
        .run({
          state,
          result,
          command: commandId,
          now: new Date(now()).toISOString(),
          id: row.clientCommandId,
        });
      row = { ...row, state, error: result, coreCommandId: commandId };
      data.bus.publish({ scope: "outbox", accountId, chatId });
    };
    try {
      const { kind, ...payload } = action;
      const command = routeSchemas.createOfapiCommand.body.parse({
        clientCommandId: row.clientCommandId,
        accountId,
        conversationId: chatId,
        kind,
        payload,
      });
      let response: HubOfapiCommand = row.coreCommandId
        ? await hub.getOfapiCommand({ commandId: row.coreCommandId })
        : await hub.createOfapiCommand({ command });
      persist("pending", null, response.commandId); // durable before a polling await
      for (
        let i = 0;
        i < 12 && ["queued", "in_flight"].includes(response.state);
        i++
      ) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        response = await hub.getOfapiCommand({ commandId: response.commandId });
      }
      if (response.state === "confirmed") {
        data.db.transaction(() => {
          applyConfirmed(accountId, chatId, action);
          persist("confirmed", null);
        });
      } else if (
        ["failed_retryable", "failed_terminal", "cancelled"].includes(
          response.state,
        )
      )
        persist("failed", response.lastErrorCode ?? response.state);
      else
        persist(
          "unconfirmed",
          "Hub has not confirmed this action. Check its status before another action.",
        );
    } catch {
      persist(
        "unconfirmed",
        "The outcome could not be confirmed. Check status to recover the same command.",
      );
    }
    return row;
  }
  return {
    list,
    perform(accountId: string, chatId: string, input: ComposerAction) {
      const action = composerActionSchema.parse(input);
      z.string()
        .regex(/^acct_[A-Za-z0-9]+$/)
        .parse(accountId);
      z.string()
        .regex(/^[0-9]{1,30}$/)
        .parse(chatId);
      const key = createHash("sha256")
        .update(JSON.stringify(action))
        .digest("hex");
      const flightKey = `${accountId}:${chatId}:${key}`;
      const existing = flights.get(flightKey);
      if (existing) return existing;
      const pending = run(accountId, chatId, action, key);
      flights.set(flightKey, pending);
      void pending
        .finally(() => flights.delete(flightKey))
        .catch(() => undefined);
      return pending;
    },
  };
}
