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
  startedAt = NOW,
) {
  let clock = startedAt;
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
    listFansLatest: vi.fn(async ({ offset = 0 }: { offset?: number }) => ({
      fans: users.slice(offset, offset + 20),
      hasMore: offset + 20 < users.length,
      nextOffset: offset + 20 < users.length ? offset + 20 : null,
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
  it("continues past the 18 unordered old dates from Max's incident and uses the provider offset", async () => {
    // Dates from the 2026-09-14 export; fan identities are synthetic.
    const dates = [
      "2025-11-03T07:55:34Z",
      "2026-04-04T09:05:49Z",
      "2026-02-10T11:08:28Z",
      "2026-05-22T21:45:54Z",
      "2025-11-27T14:51:51Z",
      "2026-03-14T01:38:16Z",
      "2025-09-27T12:49:18Z",
      "2026-01-01T17:42:50Z",
      "2025-12-03T02:38:05Z",
      "2026-04-24T15:33:54Z",
      "2025-12-16T21:22:47Z",
      "2026-03-19T00:36:35Z",
      "2025-10-25T21:45:36Z",
      "2025-12-22T00:34:05Z",
      "2026-02-23T11:08:59Z",
      "2026-05-04T21:21:00Z",
      "2026-07-28T20:57:29Z",
      "2025-11-09T21:05:20Z",
    ];
    const startedAt = Date.parse("2026-09-14T22:46:31.573Z");
    const list = vi.fn(async ({ offset }: { offset: number }) =>
      offset === 0
        ? {
            fans: dates.map((d, i) => fan(i + 1, Date.parse(d))),
            hasMore: true,
            nextOffset: 20,
          }
        : {
            fans: [fan(99, startedAt - 1000)],
            hasMore: false,
            nextOffset: null,
          },
    );
    const { service, finish, client } = setup(
      [],
      { listFansLatest: list },
      startedAt,
    );
    service.start(accountId, 72);
    await finish();
    expect(list.mock.calls.map(([p]) => p.offset)).toEqual([0, 20]);
    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "new",
        startDate: "2026-09-10",
        endDate: "2026-09-16",
      }),
    );
    expect(service.snapshot({ accountId })).toMatchObject({
      total: 1,
      checked: 1,
      truncated: false,
    });
    expect(client.listMessages).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ chatId: "99" }),
    );
    const text = service.exportText(accountId);
    expect(text.match(/fan.outside-range/g)).toHaveLength(18);
    expect(text).toContain('"nextOffset":20');
    expect(text).toContain('"reason":"source-exhausted"');
    expect(text).toContain('"examined":19');
  });
  it("checks 700 fans across short, empty and overlapping pages without confusing row counts with offsets", async () => {
    const sizes = [18, 0, 7, 19, 13];
    const pages: {
      fans: OfApiUser[];
      hasMore: boolean;
      nextOffset: number | null;
    }[] = [];
    let id = 1;
    while (id <= 700) {
      const count = Math.min(sizes[pages.length % sizes.length]!, 701 - id);
      const fans = Array.from({ length: count }, () => fan(id++));
      if (fans.length > 0 && pages.length > 0) fans.unshift(fan(1));
      pages.push({
        fans,
        hasMore: id <= 700,
        nextOffset: id <= 700 ? (pages.length + 1) * 50 : null,
      });
    }
    const list = vi.fn(
      async ({ offset }: { offset: number }) => pages[offset / 50]!,
    );
    const { service, finish, client } = setup([], { listFansLatest: list });
    service.start(accountId, 72);
    await finish();
    expect(service.snapshot({ accountId })).toMatchObject({
      total: 700,
      checked: 700,
      truncated: false,
    });
    expect(list.mock.calls.map(([p]) => p.offset)).toEqual(
      pages.map((_, i) => i * 50),
    );
    expect(client.listMessages).toHaveBeenCalledTimes(700);
    expect(service.exportText(accountId).match(/fan.verdict/g)).toHaveLength(
      700,
    );
  });
  it("does not let an old occurrence of a fan hide their later in-window subscription", async () => {
    const list = vi.fn(async ({ offset }: { offset: number }) =>
      offset === 0
        ? {
            fans: [fan(1, NOW - 10 * 86_400_000)],
            hasMore: true,
            nextOffset: 20,
          }
        : { fans: [fan(1, NOW - 1000)], hasMore: false, nextOffset: null },
    );
    const { service, finish, client } = setup([], { listFansLatest: list });
    service.start(accountId, 72);
    await finish();
    expect(service.snapshot({ accountId })).toMatchObject({
      total: 1,
      checked: 1,
    });
    expect(client.listMessages).toHaveBeenCalledTimes(1);
  });
  it("bounds empty intermediate pages by page count, not by returned rows or offset", async () => {
    const list = vi.fn(async ({ offset }: { offset: number }) => ({
      fans: [],
      hasMore: true,
      nextOffset: offset + 1,
    }));
    const { service, finish, client } = setup([], { listFansLatest: list });
    service.start(accountId, 72);
    await finish();
    expect(list).toHaveBeenCalledTimes(250);
    expect(service.snapshot({ accountId })).toMatchObject({
      total: 0,
      truncated: true,
    });
    expect(service.exportText(accountId)).toContain('"reason":"scan-limit"');
    expect(client.listMessages).not.toHaveBeenCalled();
  });
  it.each(["repeated", "backward", "contradictory"])(
    "cannot claim completion after %s pagination",
    async (kind) => {
      const list = vi.fn(async ({ offset }: { offset: number }) => ({
        fans: [fan(1)],
        hasMore: kind !== "contradictory",
        nextOffset: kind === "backward" ? offset : offset + 20,
      }));
      const { service, client } = setup([], { listFansLatest: list });
      service.start(accountId, 72);
      await vi.waitFor(() =>
        expect(service.snapshot({ accountId }).state).toBe("error"),
      );
      expect(list.mock.calls.length).toBeLessThanOrEqual(2);
      expect(service.exportText(accountId)).not.toContain("run.complete");
      expect(client.listMessages).not.toHaveBeenCalled();
    },
  );
  it("retains the same server window when paused during enumeration across midnight", async () => {
    let release!: () => void;
    const blocker = new Promise<void>((r) => {
      release = r;
    });
    const list = vi.fn(async (_args: { offset: number }) => {
      if (list.mock.calls.length === 1) await blocker;
      return { fans: [], hasMore: false, nextOffset: null };
    });
    const { service, finish, advance } = setup(
      [],
      { listFansLatest: list },
      Date.parse("2026-09-14T23:59:59.999Z"),
    );
    service.start(accountId, 72);
    await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    service.pause(accountId);
    advance(3 * 86_400_000);
    release();
    await service.resume(accountId);
    await finish();
    expect(list).toHaveBeenCalledTimes(2);
    for (const args of list.mock.calls)
      expect(args[0]).toEqual(
        expect.objectContaining({
          startDate: "2026-09-10",
          endDate: "2026-09-16",
          offset: 0,
        }),
      );
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
