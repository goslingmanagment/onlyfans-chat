import { parseComposerReferences } from "@chatgoose/shared/composer-references";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  DEFAULT_COMPOSER_OPTIONS,
  parsePriceCents,
  centsToDollars,
  releaseReferenceIds,
} from "@chatgoose/shared/composer";
import {
  HubError,
  type HubOfapiCommand,
  type HubOfapiCommandCreateRequest,
} from "@chatgoose/shared/hub/index";
import { createSendEngine, type SendEngine } from "@main/send/engine";
import { createComposerActionService } from "@main/send/composer-actions";
import type { DataLayer } from "@main/db/index";
import {
  ACCT,
  CHAT,
  memoryDataLayer,
  seedChat,
  seedMessage,
  makeStubClient,
  allowMessageGuard,
  toMediaUrl,
  drain,
} from "./helpers";

function response(
  request: HubOfapiCommandCreateRequest,
  state: HubOfapiCommand["state"],
  extra: Partial<HubOfapiCommand> = {},
): HubOfapiCommand {
  return {
    commandId: randomUUID(),
    clientCommandId: request.clientCommandId,
    kind: request.kind,
    accountId: request.accountId,
    conversationId: request.conversationId,
    state,
    payloadHash: "a".repeat(64),
    retryOfCommandId: request.retryOfCommandId ?? null,
    attemptCount: 1,
    lastErrorCode: null,
    lastErrorClass: null,
    verifierResult: null,
    platformMessageId: state === "confirmed" ? "90071992547409931234" : null,
    attemptStartedAt: new Date().toISOString(),
    attemptFinishedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deduplicated: false,
    ...extra,
  };
}
describe("composer v2 durable boundaries", () => {
  let data: DataLayer;
  let engine: SendEngine | undefined;
  beforeEach(() => {
    data = memoryDataLayer();
    seedChat(data);
  });
  afterEach(() => {
    engine?.dispose();
    data.close();
  });
  function setup(
    state: HubOfapiCommand["state"] = "confirmed",
    extra: Partial<HubOfapiCommand> = {},
  ) {
    const calls: HubOfapiCommandCreateRequest[] = [];
    let current: HubOfapiCommand;
    const createOfapiCommand = vi.fn(
      async ({ command }: { command: HubOfapiCommandCreateRequest }) => {
        calls.push(command);
        current = response(command, state, extra);
        return current;
      },
    );
    const getOfapiCommand = vi.fn(async () => current);
    const stub = makeStubClient();
    engine = createSendEngine({
      client: stub.client,
      hubCommandClient: { createOfapiCommand, getOfapiCommand },
      data,
      messageGuard: allowMessageGuard,
      toMediaUrl,
      getSettings: async () => ({ markAsReadOnOpen: false }),
      sleep: async () => {},
      hubCommandPollLimit: 1,
    });
    return { calls, createOfapiCommand, getOfapiCommand, stub };
  }
  /** One scripted Hub answer per create call (the last step repeats); status
   * reads return the stored command so the verifier never mints anything. */
  function scriptedSetup(
    script: ReadonlyArray<(request: HubOfapiCommandCreateRequest) => HubOfapiCommand | Error>,
  ) {
    const calls: HubOfapiCommandCreateRequest[] = [];
    const commands = new Map<string, HubOfapiCommand>();
    const createOfapiCommand = vi.fn(
      async ({ command }: { command: HubOfapiCommandCreateRequest }) => {
        calls.push(command);
        const step = script[Math.min(calls.length, script.length) - 1]!;
        const result = step(command);
        if (result instanceof Error) throw result;
        commands.set(result.commandId, result);
        return result;
      },
    );
    const getOfapiCommand = vi.fn(async ({ commandId }: { commandId: string }) => {
      const found = commands.get(commandId);
      if (!found) throw new Error(`unknown command ${commandId}`);
      return found;
    });
    engine = createSendEngine({
      client: makeStubClient().client,
      hubCommandClient: { createOfapiCommand, getOfapiCommand },
      data,
      messageGuard: allowMessageGuard,
      toMediaUrl,
      getSettings: async () => ({ markAsReadOnOpen: false }),
      sleep: async () => {},
      hubCommandPollLimit: 1,
    });
    return { calls, createOfapiCommand, getOfapiCommand };
  }
  const richOptions = { ...DEFAULT_COMPOSER_OPTIONS, replyToMessageId: "12" };
  async function sendIndeterminateRich(h: ReturnType<typeof scriptedSetup>) {
    const { localIds } = engine!.sendParts({
      accountId: ACCT,
      chatId: CHAT,
      parts: ["hello"],
      composer: richOptions,
    });
    await drain();
    const original = localIds[0]!;
    expect(data.outbox.get(original)).toMatchObject({ state: "unconfirmed", errorCode: "CG-OF-06" });
    expect(h.calls).toHaveLength(1);
    return original;
  }
  /** The duplicate-DM invariant: after a refusal, verify + boot read status
   * only, no third create, no second client id, no plain retry of the original. */
  async function expectNoFreshKeyEver(h: ReturnType<typeof scriptedSetup>, original: string, child: string) {
    expect(() =>
      engine!.retry({ accountId: ACCT, localId: original, text: "hello" }),
    ).toThrow(/unconfirmed/);
    expect(() =>
      engine!.retry({ accountId: ACCT, localId: child, text: "hello" }),
    ).toThrow(/only failed rows/);
    await engine!.verifyChat(ACCT, CHAT);
    await engine!.reconcileOnBoot();
    await drain();
    expect(h.calls).toHaveLength(2);
    expect(new Set(h.calls.map((call) => call.clientCommandId)).size).toBe(2);
    expect(h.calls[1]).toMatchObject({
      clientCommandId: child,
      retryOfCommandId: data.outbox.get(original)?.coreCommandId,
      payload: { reuseProviderOperation: true },
    });
    expect(data.outbox.get(original)?.state).toBe("unconfirmed");
    expect(data.outbox.get(child)?.state).toBe("cancelled");
  }

  it("returns the original to manual check when Hub refuses the reuse at dispatch (local_precondition); never failed-with-Retry", async () => {
    const h = scriptedSetup([
      (request) => response(request, "indeterminate"),
      (request) =>
        response(request, "failed_terminal", {
          lastErrorCode: "ofapi_provider_replay_unavailable",
          lastErrorClass: "terminal",
          verifierResult: {
            source: "local_precondition",
            reason: "provider_replay_unavailable",
            detail: null,
          },
        }),
    ]);
    const original = await sendIndeterminateRich(h);
    const child = engine!.retry({
      accountId: ACCT,
      localId: original,
      text: "hello",
      reuseProviderOperation: true,
    }).localId;
    await drain();
    expect(data.outbox.get(child)).toMatchObject({
      state: "cancelled",
      retryOf: original,
      errorCode: "CG-OF-09",
      errorMessage: "provider_replay_unavailable",
    });
    expect(data.outbox.get(original)).toMatchObject({
      state: "unconfirmed",
      errorCode: "CG-OF-09",
      errorMessage: "provider_replay_unavailable",
      text: "hello",
      composer: { replyToMessageId: "12", reuseProviderOperation: false },
    });
    await expectNoFreshKeyEver(h, original, child);
  });

  it("treats a 409 on the reuse create call as a refusal too: the child is never a Hub command, the original stays unconfirmed", async () => {
    const h = scriptedSetup([
      (request) => response(request, "indeterminate"),
      () =>
        new HubError("http", {
          message: "provider operation reuse unavailable",
          detail: { status: 409, kernelCode: "provider_operation_reuse_unavailable" },
        }),
    ]);
    const original = await sendIndeterminateRich(h);
    const child = engine!.retry({
      accountId: ACCT,
      localId: original,
      text: "hello",
      reuseProviderOperation: true,
    }).localId;
    await drain();
    expect(data.outbox.get(child)).toMatchObject({
      state: "cancelled",
      coreCommandId: null,
      errorCode: "CG-OF-09",
      errorMessage: "intake refused: provider operation reuse unavailable",
    });
    expect(data.outbox.get(original)).toMatchObject({
      state: "unconfirmed",
      errorCode: "CG-OF-09",
      errorMessage: "intake refused: provider operation reuse unavailable",
    });
    await expectNoFreshKeyEver(h, original, child);
  });

  it("keeps Retry only for a definite vendor rejection of the replayed payload (ofapi_response 4xx)", async () => {
    const h = scriptedSetup([
      (request) => response(request, "indeterminate"),
      (request) =>
        response(request, "failed_terminal", {
          lastErrorCode: "ofapi_http_422",
          verifierResult: {
            source: "ofapi_response",
            httpStatus: 422,
            validationResponse: JSON.stringify({ message: "Banned word found" }),
          },
        }),
    ]);
    const original = await sendIndeterminateRich(h);
    const child = engine!.retry({
      accountId: ACCT,
      localId: original,
      text: "hello",
      reuseProviderOperation: true,
    }).localId;
    await drain();
    expect(data.outbox.get(child)).toMatchObject({
      state: "failed",
      errorMessage: "Banned word found",
    });
    expect(data.outbox.get(original)?.state).toBe("cancelled");
    expect(h.calls).toHaveLength(2);
  });

  it("a recovery child still queued at boot hands the original back to manual check instead of cancelling both", async () => {
    const reuse = { ...richOptions, priceCents: 0, reuseProviderOperation: true };
    data.outbox.insertMany([
      {
        localId: "orig",
        accountId: ACCT,
        chatId: CHAT,
        text: "hello",
        sequenceId: null,
        partIndex: 0,
        retryOf: null,
        createdAt: new Date().toISOString(),
        composer: { ...reuse, reuseProviderOperation: false },
      },
    ]);
    data.outbox.claimNextQueued(ACCT, CHAT);
    data.outbox.setCoreCommandId("orig", "cmd-orig");
    data.outbox.transition({ localId: "orig", from: ["sending"], to: "unconfirmed", errorCode: "CG-OF-06" });
    expect(
      data.outbox.replaceFailedWithRetry(
        "orig",
        {
          localId: "child",
          accountId: ACCT,
          chatId: CHAT,
          text: "hello",
          sequenceId: null,
          partIndex: 0,
          retryOf: "orig",
          createdAt: new Date().toISOString(),
          composer: reuse,
        },
        true,
      ),
    ).toBe(true);
    const h = scriptedSetup([
      () => new Error("boot must not create commands"),
    ]);
    const original = response(
      { clientCommandId: "orig", kind: "send_message_v2", accountId: ACCT, conversationId: CHAT, retryOfCommandId: null, payload: { ...reuse, reuseProviderOperation: false, text: "hello", mediaFiles: [], previews: [] } },
      "indeterminate",
      { commandId: "cmd-orig" },
    );
    h.getOfapiCommand.mockImplementation(async () => original);
    await engine!.reconcileOnBoot();
    await drain();
    expect(data.outbox.get("child")).toMatchObject({ state: "cancelled", errorCode: "CG-OF-09" });
    expect(data.outbox.get("orig")).toMatchObject({ state: "unconfirmed", errorCode: "CG-OF-09", coreCommandId: "cmd-orig" });
    expect(h.createOfapiCommand).not.toHaveBeenCalled();
    expect(data.outbox.claimNextQueued(ACCT, CHAT)).toBeNull();
  });

  it("encodes $6.97 without float rounding, rejects extra decimal digits, and keeps native IDs exact", () => {
    expect(parsePriceCents("$6.97")).toBe(697);
    expect(centsToDollars(697)).toBe(6.97);
    for (const value of ["6.999", "2.99", "200.01", "1e2", "Infinity", "-3"])
      expect(parsePriceCents(value)).toBeNull();
    expect(parsePriceCents("0.00")).toBe(0);
    expect(parsePriceCents("200.00")).toBe(20000);
    expect(releaseReferenceIds("90071992547409931234, 12")).toEqual([
      "90071992547409931234",
      "12",
    ]);
  });
  it("persists exact cents, visible caption, previews/reply/GIF and all release references before v2 intake", async () => {
    const h = setup();
    const opts = {
      ...DEFAULT_COMPOSER_OPTIONS,
      replyToMessageId: "90071992547409931234",
      giphyId: "gif1",
      rfTag: ["1"],
      rfPartner: ["2"],
      rfGuest: ["3"],
      blockBannedWords: "strict_ban" as const,
    };
    const { localId } = engine!.sendPpv({
      accountId: ACCT,
      chatId: CHAT,
      text: "caption",
      price: 6.97,
      priceCents: 697,
      composer: opts,
      mediaFiles: ["90071992547409931234", "ofapi_media_token"],
      previews: ["90071992547409931234"],
    });
    expect(data.outbox.get(localId)?.composer).toMatchObject({
      ...opts,
      priceCents: 697,
    });
    await drain();
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]).toMatchObject({
      kind: "send_message_v2",
      payload: {
        ...opts,
        priceCents: 697,
        text: "caption",
        mediaFiles: ["90071992547409931234", "ofapi_media_token"],
        previews: ["90071992547409931234"],
        reuseProviderOperation: false,
      },
    });
    expect(data.outbox.get(localId)?.state).toBe("sent");
    expect(h.stub.sendCalls).toHaveLength(0);
  });
  it("retains a rejected 422 draft with exact options and a bounded explanation; never resends it", async () => {
    const h = setup("failed_terminal", {
      lastErrorCode: "ofapi_http_422",
      verifierResult: {
        httpStatus: 422,
        validationResponse: JSON.stringify({
          message: "Banned word found",
          errors: { text: ["Replace the highlighted word"] },
          words: ["banned"],
        }),
      },
    });
    const { localIds } = engine!.sendParts({
      accountId: ACCT,
      chatId: CHAT,
      parts: ["banned draft"],
      composer: { ...DEFAULT_COMPOSER_OPTIONS, blockBannedWords: "risky" },
    });
    await drain();
    expect(data.outbox.get(localIds[0]!)).toMatchObject({
      state: "failed",
      text: "banned draft",
      composer: { blockBannedWords: "risky" },
      errorMessage: "Banned word found Replace the highlighted word",
      textHighlights: ["banned"],
    });
    await engine!.reconcileOnBoot();
    expect(h.createOfapiCommand).toHaveBeenCalledTimes(1);
  });
  it("does not confirm rich sends by similar text and permits only explicit unchanged recovery", async () => {
    const h = setup("indeterminate");
    const { localIds } = engine!.sendParts({
      accountId: ACCT,
      chatId: CHAT,
      parts: ["hello"],
      composer: { ...DEFAULT_COMPOSER_OPTIONS, replyToMessageId: "12" },
    });
    await drain();
    const original = localIds[0]!;
    seedMessage(data, {
      messageId: "222",
      textPlain: "hello",
      textHtml: "hello",
    });
    await engine!.verifyChat(ACCT, CHAT);
    expect(data.outbox.get(original)?.state).toBe("unconfirmed");
    expect(h.calls).toHaveLength(1);
    expect(() =>
      engine!.retry({
        accountId: ACCT,
        localId: original,
        text: "edited",
        reuseProviderOperation: true,
      }),
    ).toThrow(/unchanged/);
    expect(() =>
      engine!.retry({ accountId: ACCT, localId: original, text: "hello" }),
    ).toThrow(/unconfirmed/);
    const retry = engine!.retry({
      accountId: ACCT,
      localId: original,
      text: "hello",
      reuseProviderOperation: true,
    });
    await drain();
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1]).toMatchObject({
      clientCommandId: retry.localId,
      retryOfCommandId: data.outbox.get(original)?.coreCommandId,
      payload: { reuseProviderOperation: true, replyToMessageId: "12" },
    });
    expect(() =>
      engine!.retry({
        accountId: ACCT,
        localId: original,
        text: "hello",
        reuseProviderOperation: true,
      }),
    ).toThrow();
  });
  it("accepts a GIF-only message and rejects unsafe numeric media IDs before an outbox row", async () => {
    const h = setup();
    engine!.sendParts({
      accountId: ACCT,
      chatId: CHAT,
      parts: [""],
      composer: { ...DEFAULT_COMPOSER_OPTIONS, giphyId: "abc" },
    });
    await drain();
    expect(h.calls[0]).toMatchObject({
      kind: "send_message_v2",
      payload: { giphyId: "abc", text: "" },
    });
    expect(() =>
      engine!.sendPpv({
        accountId: ACCT,
        chatId: CHAT,
        text: "x",
        price: 0,
        priceCents: 0,
        composer: DEFAULT_COMPOSER_OPTIONS,
        mediaFiles: [Number.MAX_SAFE_INTEGER + 1],
        previews: [],
      }),
    ).toThrow(/exact/);
    expect(data.outbox.listForChat(ACCT, CHAT)).toHaveLength(1);
  });
  it("retains an action before intake, coalesces clicks and recovers the same identity after lost response", async () => {
    const ids: string[] = [];
    let first = true;
    const createOfapiCommand = vi.fn(
      async ({ command }: { command: HubOfapiCommandCreateRequest }) => {
        ids.push(command.clientCommandId);
        if (first) {
          first = false;
          throw new Error("response lost");
        }
        return response(command, "confirmed");
      },
    );
    const hub = { createOfapiCommand, getOfapiCommand: vi.fn() };
    const service = createComposerActionService(data, hub);
    const action = {
      kind: "set_fan_custom_name_v1",
      customName: "Same fan",
    } as const;
    const [one, two] = await Promise.all([
      service.perform(ACCT, CHAT, action),
      service.perform(ACCT, CHAT, action),
    ]);
    expect(one).toEqual(two);
    expect(one.state).toBe("unconfirmed");
    expect(data.chats.get(ACCT, CHAT)?.fanName).toBe("Fan One");
    expect(ids).toHaveLength(1);
    const restarted = createComposerActionService(data, hub);
    const result = await restarted.perform(ACCT, CHAT, action);
    expect(ids).toEqual([one.clientCommandId, one.clientCommandId]);
    expect(result.state).toBe("confirmed");
    expect(data.chats.get(ACCT, CHAT)?.fanName).toBe("Same fan");
    expect(restarted.list(ACCT, CHAT)).toHaveLength(1);
  });
  it("projects only confirmed closed actions and keeps hidden chat history locally", async () => {
    let state: HubOfapiCommand["state"] = "failed_terminal";
    const hub = {
      createOfapiCommand: vi.fn(
        async ({ command }: { command: HubOfapiCommandCreateRequest }) =>
          response(command, state),
      ),
      getOfapiCommand: vi.fn(),
    };
    const service = createComposerActionService(data, hub);
    expect(
      (await service.perform(ACCT, CHAT, { kind: "hide_chat_v1" })).state,
    ).toBe("failed");
    expect(
      data.chats.list({ accountId: ACCT, filter: "all" }).items,
    ).toHaveLength(1);
    state = "confirmed";
    await service.perform(ACCT, CHAT, { kind: "mark_chat_unread_v1" });
    expect(data.chats.get(ACCT, CHAT)?.unreadCount).toBe(1);
    await service.perform(ACCT, CHAT, { kind: "hide_chat_v1" });
    expect(
      data.chats.list({ accountId: ACCT, filter: "all" }).items,
    ).toHaveLength(0);
    expect(data.chats.get(ACCT, CHAT)).not.toBeNull();
  });
  it("a hidden chat stays hidden for older activity and resurfaces once a newer message arrives", async () => {
    const hub = {
      createOfapiCommand: vi.fn(
        async ({ command }: { command: HubOfapiCommandCreateRequest }) =>
          response(command, "confirmed"),
      ),
      getOfapiCommand: vi.fn(),
    };
    const hiddenAtMs = Date.parse("2026-09-06T12:00:00.000Z");
    const service = createComposerActionService(data, hub, () => hiddenAtMs);
    seedChat(data, { lastMessageAt: "2026-09-06T11:50:00+00:00", lastMessageId: "10" });
    const visible = () => data.chats.list({ accountId: ACCT, filter: "all" }).items.map((c) => c.chatId);
    const found = () => data.chats.search({ accountId: ACCT, query: "fan" }).map((c) => c.chatId);

    expect((await service.perform(ACCT, CHAT, { kind: "hide_chat_v1" })).state).toBe("confirmed");
    expect(visible()).toEqual([]);
    expect(found()).toEqual([]);

    // Sync re-delivers the same head, then an older message: still hidden.
    seedChat(data, { lastMessageAt: "2026-09-06T11:50:00+00:00", lastMessageId: "10" });
    seedChat(data, { lastMessageAt: "2026-09-06T11:40:00+00:00", lastMessageId: "9" });
    expect(visible()).toEqual([]);
    expect(data.chats.get(ACCT, CHAT)).not.toBeNull();

    // A message newer than the hide moment un-hides the chat (list and search).
    seedChat(data, { lastMessageAt: "2026-09-06T12:00:05+00:00", lastMessageId: "11", unreadCount: 1 });
    expect(visible()).toEqual([CHAT]);
    expect(found()).toEqual([CHAT]);
  });

  it("the hide moment is never behind the current head, so a head slightly ahead of the local clock cannot un-hide on the next sync", async () => {
    const hub = {
      createOfapiCommand: vi.fn(
        async ({ command }: { command: HubOfapiCommandCreateRequest }) =>
          response(command, "confirmed"),
      ),
      getOfapiCommand: vi.fn(),
    };
    // local clock 30 s behind the server-stamped head
    const service = createComposerActionService(data, hub, () => Date.parse("2026-09-06T12:00:00.000Z"));
    seedChat(data, { lastMessageAt: "2026-09-06T12:00:30+00:00", lastMessageId: "20" });
    await service.perform(ACCT, CHAT, { kind: "hide_chat_v1" });
    seedChat(data, { lastMessageAt: "2026-09-06T12:00:30+00:00", lastMessageId: "20" });
    expect(data.chats.list({ accountId: ACCT, filter: "all" }).items).toHaveLength(0);
    seedChat(data, { lastMessageAt: "2026-09-06T12:00:31+00:00", lastMessageId: "21" });
    expect(data.chats.list({ accountId: ACCT, filter: "all" }).items).toHaveLength(1);
  });

  it("retains confirmed message and chat settings after the recent history window fills", async () => {
    const hub = {
      createOfapiCommand: vi.fn(
        async ({ command }: { command: HubOfapiCommandCreateRequest }) =>
          response(command, "confirmed"),
      ),
      getOfapiCommand: vi.fn(),
    };
    const service = createComposerActionService(data, hub);
    await service.perform(ACCT, CHAT, {
      kind: "pin_message_v1",
      messageId: "123",
    });
    await service.perform(ACCT, CHAT, { kind: "mute_chat_v1" });
    for (let i = 0; i < 60; i++)
      await service.perform(ACCT, CHAT, {
        kind: i % 2 ? "like_message_v1" : "unlike_message_v1",
        messageId: "123",
      });
    expect(
      service
        .list(ACCT, CHAT, "123")
        .some((row) => row.action.kind === "pin_message_v1"),
    ).toBe(true);
    expect(
      service
        .list(ACCT, CHAT)
        .some((row) => row.action.kind === "mute_chat_v1"),
    ).toBe(true);
    expect(service.list(ACCT, CHAT, "123").length).toBeLessThanOrEqual(52);
  });
  it("blocks opposing action while its outcome remains unknown", async () => {
    const hub = {
      createOfapiCommand: vi.fn(async () => {
        throw new Error("lost response");
      }),
      getOfapiCommand: vi.fn(),
    };
    const service = createComposerActionService(data, hub);
    await service.perform(ACCT, CHAT, { kind: "mute_chat_v1" });
    await expect(
      service.perform(ACCT, CHAT, { kind: "unmute_chat_v1" }),
    ).rejects.toThrow(/saved action/);
    expect(hub.createOfapiCommand).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed reference envelopes and preserves unknown or empty continuing coverage", () => {
    expect(() =>
      parseComposerReferences("release_forms", { data: {} }),
    ).toThrow();
    expect(() =>
      parseComposerReferences("giphy", { data: { items: [] } }),
    ).toThrow();
    expect(parseComposerReferences("giphy", { data: [] }).partial).toBe(true);
    expect(
      parseComposerReferences("release_forms", {
        data: { items: [] },
        _pagination: { next_page: "?offset=20" },
      }),
    ).toEqual({ items: [], partial: true });
    expect(
      parseComposerReferences("release_forms", {
        data: { items: [] },
        _pagination: { next_page: null },
      }).partial,
    ).toBe(false);
    expect(() =>
      parseComposerReferences("taggable_users", {
        data: { items: [{ id: Number.MAX_SAFE_INTEGER + 1 }] },
      }),
    ).toThrow();
  });
});
