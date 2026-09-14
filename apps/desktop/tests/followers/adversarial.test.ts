import { expect, test, vi } from "vitest";
import { createFollowersService } from "../../src/main/followers/service";
import { createFollowerPacer } from "../../src/main/followers/pacing";
import { OfApiError } from "../../src/main/ofapi/errors";
import { assessHistory } from "../../src/main/followers/evidence";
import type { DataLayer } from "../../src/main/db";

const now = Date.parse("2026-09-15T12:00:00Z");

test("queue origin alone cannot exclude a scheduled personal greeting", () => {
  // The primary Send Mass Message schema accepts userIds with one recipient
  // together with scheduledDate. Queue membership is not a broadcast proof.
  const verdict = assessHistory(
    [
      {
        id: 123,
        text: "Hey Alex, I remembered our plans",
        isSentByMe: true,
        isFromQueue: true,
        scheduledAt: "2026-09-15T11:00:00Z",
        createdAt: "2026-09-15T11:00:00Z",
      },
    ],
    true,
    { id: 9, text: "Welcome", media: [], isActive: true },
  );
  expect(verdict.status).toBe("unknown");
});
const fan = (id: number) => ({
  id,
  name: `fan ${id}`,
  canReceiveChatMessage: true,
  subscribedOnData: { subscribeAt: new Date(now - 1000).toISOString() },
});
function fixture() {
  const settings = new Map<string, unknown>();
  const data = {
    accounts: {
      get: () => ({ grantState: "granted", authState: "authenticated" }),
    },
    settings: {
      getParsed: (key: string) => settings.get(key),
      set: (key: string, value: unknown) => settings.set(key, value),
    },
    fans: { upsert: vi.fn() },
    messages: { upsertMany: vi.fn() },
    chats: { get: () => ({ canSendMessage: true }), upsert: vi.fn() },
    outbox: { get: () => null, listForChat: () => [] },
  } as unknown as DataLayer;
  let clock = now;
  const client = {
    listFansLatest: vi.fn(async () => ({
      fans: [fan(1), fan(2), fan(3)],
      hasMore: false,
      nextOffset: null,
    })),
    listMessages: vi.fn(async (_args: { chatId: string }) => ({
      messages: [],
      nextPageUrl: null,
    })),
    getWelcomeMessage: vi.fn(async () => ({
      id: 9,
      text: "welcome",
      media: [],
      isActive: true,
    })),
    getUsersByIds: vi.fn(async () => ({ "1": fan(1) })),
  };
  const enqueue = vi.fn(() => "local");
  const service = createFollowersService({
    client,
    data,
    toMediaUrl: (s) => s,
    isDebug: () => false,
    onChanged: () => {},
    generate: async () => "hey",
    enqueue,
    now: () => clock,
    pacer: createFollowerPacer({
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    }),
  });
  return { service, client, enqueue };
}
const drain = async () => {
  for (let i = 0; i < 100; i++) await Promise.resolve();
};

test("terminal account error stops before another fan history request", async () => {
  const { service, client } = fixture();
  client.listMessages.mockRejectedValue(new OfApiError("CG-OF-02"));
  service.start("acct", 24);
  await drain();
  expect(client.listMessages).toHaveBeenCalledTimes(1);
  expect(service.snapshot({ accountId: "acct" }).state).toBe("error");
  await service.dispose();
});

test("two pending pause actions cannot enqueue the same fan twice", async () => {
  const { service, client, enqueue } = fixture();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  client.listMessages.mockImplementation(async (args) => {
    if (args.chatId === "2") await pending;
    return { messages: [], nextPageUrl: null };
  });
  service.start("acct", 24);
  await drain();
  const revision = service.detail("acct", "1")!.row.revision!;
  service.pause("acct");
  const first = service.send("acct", "1", revision, "hello");
  const second = service.send("acct", "1", revision, "hello");
  release();
  const outcomes = await Promise.allSettled([first, second]);
  expect(outcomes.map((x) => x.status)).toEqual(["fulfilled", "rejected"]);
  expect(enqueue).toHaveBeenCalledTimes(1);
  await service.dispose();
});

test("delayed upstream limiter does not collapse actual request spacing", async () => {
  let clock = 0;
  const actual: number[] = [];
  const pacer = createFollowerPacer({
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
  });
  const signal = new AbortController().signal;
  await pacer.read(
    "acct",
    signal,
    true,
    async () => {
      clock += 10000;
      actual.push(clock);
    },
    () => {},
  );
  await pacer.read(
    "acct",
    signal,
    true,
    async () => {
      actual.push(clock);
    },
    () => {},
  );
  expect(actual).toEqual([10000, 11500]);
});

test("a newer edited draft survives the send preflight of an older draft", async () => {
  const { service, client, enqueue } = fixture();
  service.start("acct", 24);
  await drain();
  service.draft("acct", "1", "hello");
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  client.getUsersByIds.mockImplementation(async () => {
    await pending;
    return { "1": fan(1) };
  });
  const revision = service.detail("acct", "1")!.row.revision!;
  const sending = service.send("acct", "1", revision, "hello");
  await drain();
  service.draft("acct", "1", "newer draft typed during the check");
  release();
  await sending;
  expect(enqueue).toHaveBeenCalledWith("acct", "1", "hello");
  expect(service.detail("acct", "1")!.draft).toBe(
    "newer draft typed during the check",
  );
  await service.dispose();
});
