import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFollowersService,
  type FollowersOptions,
} from "@main/followers/service";
import { createFollowerPacer } from "@main/followers/pacing";
import {
  assessHistory,
  historyRevision,
  messageKind,
} from "@main/followers/evidence";
import type { OfApiMessage, OfApiUser } from "@main/ofapi/schemas";
import { memoryDataLayer } from "../db/helpers";
const NOW = Date.parse("2026-09-15T12:00:00.000Z");
const accountId = "acct_1";
const welcome = { id: "1", text: "Welcome!", media: [], isActive: true };
const message = (patch: Partial<OfApiMessage> = {}): OfApiMessage => ({
  id: 10,
  createdAt: new Date(NOW - 1000).toISOString(),
  text: "hi",
  isSentByMe: true,
  isFromQueue: false,
  ...patch,
});
const fan = (id: number, date = NOW - 3600_000): OfApiUser => ({
  id,
  name: `Fan ${id}`,
  username: `fan${id}`,
  canReceiveChatMessage: true,
  subscribedOnData: { subscribeAt: new Date(date).toISOString() },
});
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cb of cleanup.splice(0)) await cb();
});
function setup(
  users: OfApiUser[] = [fan(1)],
  overrides: Partial<FollowersOptions["client"]> = {},
) {
  let clock = NOW;
  const data = memoryDataLayer();
  data.accounts.upsert({
    id: accountId,
    username: "model",
    displayName: "Model",
    avatar: null,
    authState: "authenticated",
    raw: {},
  });
  const client = {
    listFansAll: vi.fn(async ({ offset = 0 }: { offset?: number }) => ({
      fans: users.slice(offset, offset + 20),
      hasMore: offset + 20 < users.length,
    })),
    listMessages: vi.fn(async () => ({
      messages: [] as OfApiMessage[],
      nextPageUrl: null as string | null,
    })),
    getWelcomeMessage: vi.fn(async () => welcome),
    getUsersByIds: vi.fn(async () =>
      Object.fromEntries(users.map((u) => [String(u.id), u])),
    ),
    ...overrides,
  };
  const enqueue = vi.fn(() => "test-outbox-id");
  const generate = vi.fn(async () => "Hello there");
  const service = createFollowersService({
    client,
    data,
    toMediaUrl: () => null,
    isDebug: () => true,
    onChanged: vi.fn(),
    generate,
    enqueue,
    now: () => clock,
    pacer: createFollowerPacer({
      now: () => clock,
      sleep: async (ms, signal) => {
        signal.throwIfAborted();
        clock += ms;
      },
    }),
  });
  cleanup.push(async () => {
    await service.dispose();
    data.close();
  });
  const finish = async () => {
    await vi.waitFor(
      () => expect(service.snapshot({ accountId }).state).toBe("complete"),
      { timeout: 5000 },
    );
  };
  return {
    service,
    client,
    data,
    enqueue,
    generate,
    finish,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe("OnlyFans eligibility evidence", () => {
  it("does not confuse personal queueId metadata with a mass message", () => {
    expect(messageKind(message({ queueId: 900 }), welcome)).toBe("personal");
    expect(
      assessHistory([message({ queueId: 900 })], false, welcome).status,
    ).toBe("contacted");
  });
  it("fails closed for missing origin flags, welcome candidates and incomplete history", () => {
    expect(
      assessHistory([message({ isFromQueue: undefined })], true, welcome)
        .status,
    ).toBe("unknown");
    expect(
      assessHistory([message({ text: "<p>Welcome!</p>" })], true, welcome)
        .status,
    ).toBe("unknown");
    expect(assessHistory([], false, welcome).status).toBe("unknown");
    expect(
      assessHistory([message({ isFromQueue: true })], true, welcome).status,
    ).toBe("unknown");
    expect(
      assessHistory([message({ isSentByMe: false })], false, null).status,
    ).toBe("replied");
  });
  it("revisions detect edited text, deleted rows and changed media", () => {
    const a = message();
    expect(historyRevision([a])).not.toBe(
      historyRevision([message({ text: "edited" })]),
    );
    expect(historyRevision([a])).not.toBe(historyRevision([]));
    expect(historyRevision([a])).not.toBe(
      historyRevision([message({ media: [{ id: 1, type: "photo" }] })]),
    );
  });
});

describe("new follower workflow", () => {
  it("returns chronological history while preserving the newest personal proof", async () => {
    const older = message({
      id: 10,
      createdAt: new Date(NOW - 2000).toISOString(),
    });
    const newer = message({
      id: 20,
      createdAt: new Date(NOW - 1000).toISOString(),
    });
    const { service, finish } = setup([fan(1)], {
      listMessages: async () => ({
        messages: [newer, older],
        nextPageUrl: null,
      }),
    });
    service.start(accountId, 24);
    await finish();
    const detail = service.detail(accountId, "1");
    expect(detail?.messages.map((m) => m.id)).toEqual(["10", "20"]);
    expect(detail?.row.proof?.at).toBe(newer.createdAt);
  });

  it("preserves a new draft entered while send preflight is waiting", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { service, finish } = setup([fan(1)], {
      getUsersByIds: async () => {
        await gate;
        return { "1": fan(1) };
      },
    });
    service.start(accountId, 24);
    await finish();
    service.draft(accountId, "1", "reviewed greeting");
    const pending = service.send(
      accountId,
      "1",
      service.detail(accountId, "1")?.row.revision ?? "",
      "reviewed greeting",
    );
    service.draft(accountId, "1", "new unsent edit");
    release();
    await pending;
    expect(service.detail(accountId, "1")?.draft).toBe("new unsent edit");
  });

  it("refuses a normal local send that enters the outbox during preflight", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { service, finish, data, enqueue } = setup([fan(1)], {
      getUsersByIds: async () => {
        await gate;
        return { "1": fan(1) };
      },
    });
    service.start(accountId, 24);
    await finish();
    const pending = service.send(
      accountId,
      "1",
      service.detail(accountId, "1")?.row.revision ?? "",
      "hello",
    );
    const rejected = expect(pending).rejects.toThrow("Очередь чата изменилась");
    data.outbox.insertMany([
      {
        localId: "normal-racing-send",
        accountId,
        chatId: "1",
        text: "ordinary hello",
        sequenceId: null,
        partIndex: 0,
        retryOf: null,
        createdAt: new Date(NOW).toISOString(),
      },
    ]);
    release();
    await rejected;
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("checks all 700 fans, paginates cached views and retains a verdict for every fan in the trace", async () => {
    const { service, finish, client } = setup(
      Array.from({ length: 700 }, (_, i) => fan(i + 1)),
    );
    service.start(accountId, 24);
    await finish();
    expect(service.snapshot({ accountId })).toMatchObject({
      total: 700,
      checked: 700,
      counts: { ready: 700 },
      truncated: false,
      requests: 736,
    });
    expect(
      service.snapshot({ accountId, offset: 650, limit: 200 }).rows,
    ).toHaveLength(50);
    expect(client.listMessages).toHaveBeenCalledTimes(700);
    const exported = service.exportText(accountId);
    expect(exported.match(/fan.verdict/g)).toHaveLength(700);
    expect(exported).not.toContain("Welcome!");
    service.detail(accountId, "1");
    service.detail(accountId, "1");
    expect(client.listMessages).toHaveBeenCalledTimes(700);
  });
  it("keeps exact inclusive time bounds and reports missing subscription dates", async () => {
    const { service, finish } = setup([
      fan(1, NOW),
      fan(2, NOW - 24 * 3600_000),
      fan(3, NOW + 1),
      fan(4, NOW - 24 * 3600_000 - 1),
      { id: 5, joinDate: new Date(NOW).toISOString() },
    ]);
    service.start(accountId, 24);
    await finish();
    expect(
      service.snapshot({ accountId }).rows.map((r) => [r.fanId, r.status]),
    ).toEqual([
      ["1", "ready"],
      ["2", "ready"],
      ["5", "unknown"],
    ]);
  });
  it("stops at full-history cap with unknown instead of ready", async () => {
    const { service, finish } = setup([fan(1)], {
      listMessages: async ({ firstId }) => ({
        messages: Array.from({ length: 100 }, (_, i) =>
          message({
            id: (firstId ? Number(firstId) - 1 : 2000) - i,
            isFromQueue: true,
          }),
        ),
        nextPageUrl: "/older",
      }),
    });
    service.start(accountId, 24);
    await finish();
    expect(service.detail(accountId, "1")).toMatchObject({
      row: { status: "unknown" },
      hasOlder: false,
    });
    expect(service.detail(accountId, "1")?.messages).toHaveLength(1000);
  });
  it("refuses repeating pages and never converts their failure into empty history", async () => {
    const { service, finish } = setup([fan(1)], {
      listMessages: async () => ({
        messages: [message({ isFromQueue: true })],
        nextPageUrl: "/older",
      }),
    });
    service.start(accountId, 24);
    await finish();
    expect(service.detail(accountId, "1")?.row.status).toBe("unknown");
  });
  it("rechecks before enqueue and refuses a fan who wrote since review", async () => {
    const { service, finish, enqueue, client } = setup();
    service.start(accountId, 24);
    await finish();
    const revision = service.detail(accountId, "1")?.row.revision ?? "";
    vi.mocked(client.listMessages).mockResolvedValueOnce({
      messages: [message({ isSentByMe: false })],
      nextPageUrl: null,
    });
    await expect(
      service.send(accountId, "1", revision, "hello"),
    ).rejects.toThrow("Переписка изменилась");
    expect(enqueue).not.toHaveBeenCalled();
  });
  it("seeds a previously empty chat only after fresh explicit sendability, then enqueues once", async () => {
    const { service, finish, enqueue, data } = setup();
    service.start(accountId, 24);
    await finish();
    const revision = service.detail(accountId, "1")?.row.revision ?? "";
    await service.send(accountId, "1", revision, "hello");
    expect(enqueue).toHaveBeenCalledExactlyOnceWith(accountId, "1", "hello");
    expect(data.chats.get(accountId, "1")?.canSendMessage).toBe(true);
    await expect(
      service.send(accountId, "1", revision, "hello"),
    ).rejects.toThrow();
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
  it("pauses in-flight read, resumes pending fan and retains original bounds and drafts", async () => {
    let release!: () => void;
    const blocker = new Promise<void>((r) => {
      release = r;
    });
    let calls = 0;
    const { service, finish, advance } = setup([fan(1)], {
      listMessages: async () => {
        if (calls++ === 0) await blocker;
        return { messages: [], nextPageUrl: null };
      },
    });
    service.start(accountId, 24);
    await vi.waitFor(() => expect(calls).toBe(1));
    service.draft(accountId, "1", "my draft");
    const bounds = service.snapshot({ accountId });
    service.pause(accountId);
    advance(48 * 3600_000);
    release();
    await service.resume(accountId);
    await finish();
    expect(service.snapshot({ accountId })).toMatchObject({
      from: bounds.from,
      to: bounds.to,
    });
    expect(service.detail(accountId, "1")).toMatchObject({
      draft: "my draft",
      row: { status: "ready" },
    });
  });
  it("rejects credential/account revocation and never invokes AI or send", async () => {
    const { service, finish, data, generate, enqueue } = setup();
    service.start(accountId, 24);
    await finish();
    data.accounts.revokeGrant(accountId);
    await expect(service.generate(accountId, "1")).rejects.toThrow();
    expect(generate).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
});
