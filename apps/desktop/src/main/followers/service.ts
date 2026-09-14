import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CgError } from "@chatgoose/shared";
import type { DataLayer } from "../db";
import type {
  OfApiClient,
  OfApiRequestEvent,
  WelcomeMessage,
} from "../ofapi/client";
import type { OfApiMessage, OfApiUser } from "../ofapi/schemas";
import { mapChat, mapFan, mapMessage, type ToMediaUrl } from "../sync/mappers";
import type {
  FollowersChannels,
  FollowersSnapshotVM,
  FollowerRowVM,
  FollowerDetailVM,
  FollowerTraceVM,
  FollowerStatus,
} from "../../preload/followers-contract";
import { assessHistory, historyRevision, messageKind, plain } from "./evidence";
import { createFollowerPacer } from "./pacing";

export const FOLLOWER_MAX_FANS = 5_000;
export const FOLLOWER_MAX_HISTORY = 1_000;
export const FOLLOWER_TRACE_RUNS = 8;
export const FOLLOWER_TRACE_EVENTS = 100_000;
const TRACE_CHARS = 20_000_000;
const statuses: FollowerStatus[] = [
  "pending",
  "checking",
  "ready",
  "replied",
  "contacted",
  "unknown",
  "blocked",
  "sending",
  "sent",
];
type SnapshotArgs = FollowersChannels["query:followers.snapshot"]["args"];
type TraceArgs = FollowersChannels["query:followers.trace"]["args"];
interface Entry {
  row: FollowerRowVM;
  user: OfApiUser;
  messages: OfApiMessage[];
  complete: boolean;
  cursor?: string | undefined;
  draft: string;
  busy: boolean;
  generating: boolean;
  localId?: string;
}
interface Journal {
  id: string;
  startedAt: string;
  events: FollowerTraceVM[];
  dropped: number;
  chars: number;
}
interface Run {
  id: string;
  accountId: string;
  startedAt: number;
  from: number;
  to: number;
  state: FollowersSnapshotVM["state"];
  stage: string;
  error: string | null;
  entries: Map<string, Entry>;
  offset: number;
  listed: boolean;
  requests: number;
  truncated: boolean;
  welcome: WelcomeMessage | null;
  controller: AbortController;
  worker: Promise<void> | null;
  journal: Journal | null;
}
export interface FollowersOptions {
  client: Pick<
    OfApiClient,
    "listFansAll" | "listMessages" | "getWelcomeMessage" | "getUsersByIds"
  >;
  data: DataLayer;
  toMediaUrl: ToMediaUrl;
  isDebug: () => boolean;
  onChanged: (accountId: string) => void;
  generate: (
    accountId: string,
    fanId: string,
    signal: AbortSignal,
  ) => Promise<string>;
  enqueue: (accountId: string, fanId: string, text: string) => string;
  now?: () => number;
  pacer?: ReturnType<typeof createFollowerPacer>;
}
const journalSchema = z.object({
  id: z.string(),
  startedAt: z.string(),
  dropped: z.number(),
  chars: z.number(),
  events: z
    .array(
      z.object({
        seq: z.number(),
        at: z.string(),
        elapsedMs: z.number(),
        fanId: z.string().nullable(),
        event: z.string(),
        detail: z.record(
          z.string(),
          z.union([z.string(), z.number(), z.boolean(), z.null()]),
        ),
      }),
    )
    .max(FOLLOWER_TRACE_EVENTS),
});

export function createFollowersService(options: FollowersOptions) {
  const { data, client } = options;
  const now = options.now ?? Date.now;
  const pacer = options.pacer ?? createFollowerPacer({ now });
  const runs = new Map<string, Run>();
  const journals = new Map<string, Journal[]>();
  const changed = new Set<string>();
  const actions = new Set<Promise<void>>();
  let notifyTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  function notify(accountId: string): void {
    if (disposed) return;
    changed.add(accountId);
    notifyTimer ??= setTimeout(() => {
      notifyTimer = null;
      for (const id of changed) options.onChanged(id);
      changed.clear();
    }, 50);
  }
  function authorize(accountId: string): void {
    const account = data.accounts.get(accountId);
    if (
      disposed ||
      !account ||
      account.grantState !== "granted" ||
      account.authState !== "authenticated"
    )
      throw new Error("Аккаунт недоступен: проверьте подключение Hub");
  }
  function current(run: Run): void {
    authorize(run.accountId);
    run.controller.signal.throwIfAborted();
    if (runs.get(run.accountId) !== run) throw new Error("Проверка заменена");
  }
  function getRun(accountId: string): Run {
    authorize(accountId);
    const run = runs.get(accountId);
    if (!run) throw new Error("Сначала запустите проверку");
    return run;
  }
  function getEntry(run: Run, fanId: string): Entry {
    const entry = run.entries.get(fanId);
    if (!entry) throw new Error("Фан отсутствует в этой проверке");
    return entry;
  }
  function traceRuns(accountId: string): Journal[] {
    let list = journals.get(accountId);
    if (!list) {
      list =
        data.settings.getParsed(
          `followers.traces.${accountId}`,
          z.array(journalSchema).max(FOLLOWER_TRACE_RUNS),
        ) ?? [];
      journals.set(accountId, list);
    }
    return list;
  }
  function persist(run: Run): void {
    if (run.journal)
      data.settings.set(
        `followers.traces.${run.accountId}`,
        traceRuns(run.accountId),
      );
  }
  function trace(
    run: Run,
    event: string,
    fanId: string | null = null,
    detail: FollowerTraceVM["detail"] = {},
  ): void {
    if (!options.isDebug() || !run.journal) return;
    const journal = run.journal;
    const item: FollowerTraceVM = {
      seq: journal.events.length + journal.dropped + 1,
      at: new Date(now()).toISOString(),
      elapsedMs: now() - run.startedAt,
      fanId,
      event,
      detail,
    };
    const chars = JSON.stringify(item).length;
    if (
      journal.events.length >= FOLLOWER_TRACE_EVENTS ||
      journal.chars + chars > TRACE_CHARS
    ) {
      journal.dropped += 1;
      return;
    }
    journal.events.push(item);
    journal.chars += chars;
  }
  async function read<T>(
    run: Run,
    fanId: string | null,
    operation: string,
    task: () => Promise<T>,
  ): Promise<T> {
    current(run);
    return pacer.read(
      run.accountId,
      run.controller.signal,
      fanId !== null,
      async () => {
        current(run);
        return task();
      },
      (event) => {
        if (event.event === "request") run.requests += 1;
        trace(run, `${operation}.${event.event}`, fanId, { ...event });
        notify(run.accountId);
      },
    );
  }
  const draftKey = (accountId: string, fanId: string): string =>
    `followers.draft.${accountId}.${fanId}`;
  function updateOutbox(run: Run, entry: Entry): void {
    if (!entry.localId) return;
    const row = data.outbox.get(entry.localId);
    if (!row) return;
    entry.row.status =
      row.state === "sent"
        ? "sent"
        : row.state === "queued" || row.state === "sending"
          ? "sending"
          : "unknown";
    entry.row.reason =
      row.state === "sent"
        ? "Отправка подтверждена Hub"
        : row.state === "queued" || row.state === "sending"
          ? "Ожидаем подтверждение отправки"
          : "Отправка не подтверждена. Проверьте очередь в чате; повтор автоматически запрещён";
  }
  function addFan(run: Run, user: OfApiUser): void {
    if (!Number.isSafeInteger(user.id) || user.id <= 0)
      throw new Error("Некорректный идентификатор фана");
    const fanId = String(user.id);
    if (run.entries.has(fanId)) {
      trace(run, "fan.duplicate", fanId);
      return;
    }
    const subscribed = Date.parse(user.subscribedOnData?.subscribeAt ?? "");
    if (
      Number.isFinite(subscribed) &&
      (subscribed < run.from || subscribed > run.to)
    ) {
      trace(run, "fan.outside-range", fanId, {
        subscribedAt: new Date(subscribed).toISOString(),
      });
      return;
    }
    data.fans.upsert(
      mapFan(
        run.accountId,
        user,
        options.toMediaUrl,
        new Date(now()).toISOString(),
      ),
    );
    const blocked =
      user.isBlocked === true ||
      user.isRestricted === true ||
      user.canReceiveChatMessage === false;
    const draft =
      data.settings.getParsed(
        draftKey(run.accountId, fanId),
        z.string().max(5_000),
      ) ?? "";
    const row: FollowerRowVM = {
      fanId,
      name: user.displayName || user.name || user.username || fanId,
      username: user.username ?? "",
      avatarUrl: user.avatar ? options.toMediaUrl(user.avatar) : null,
      subscribedAt: Number.isFinite(subscribed)
        ? new Date(subscribed).toISOString()
        : null,
      status: !Number.isFinite(subscribed)
        ? "unknown"
        : blocked
          ? "blocked"
          : "pending",
      reason: !Number.isFinite(subscribed)
        ? "OFAPI не вернул дату подписки — принадлежность диапазону неизвестна"
        : blocked
          ? "Фан заблокирован или сообщения недоступны"
          : "Ожидает проверки",
      checkedAt: null,
      proof: null,
      revision: null,
      hasDraft: draft !== "",
    };
    run.entries.set(fanId, {
      row,
      user,
      messages: [],
      complete: false,
      draft,
      busy: false,
      generating: false,
    });
    trace(run, "fan.listed", fanId, {
      status: row.status,
      subscribedAt: row.subscribedAt,
    });
  }
  async function historyPage(
    run: Run,
    entry: Entry,
    cursor?: string,
  ): Promise<{ messages: OfApiMessage[]; complete: boolean; cursor?: string }> {
    const fanId = entry.row.fanId;
    const result = await read(run, fanId, "messages", () =>
      client.listMessages({
        accountId: run.accountId,
        chatId: fanId,
        purpose: "followers",
        limit: 100,
        order: "desc",
        skipUsers: "all",
        retry: "none",
        strict: true,
        signal: run.controller.signal,
        ...(cursor
          ? { firstId: cursor, readIntent: "deep-history-v1" as const }
          : {}),
      }),
    );
    current(run);
    const unique = new Set<number>();
    let previous: number | null = null;
    for (const message of result.messages) {
      if (
        unique.has(message.id) ||
        (previous !== null && message.id >= previous) ||
        (cursor && message.id >= Number(cursor))
      )
        throw new Error(
          "Страница истории не продвинулась или нарушен порядок сообщений",
        );
      unique.add(message.id);
      previous = message.id;
    }
    if (result.nextPageUrl !== null && result.messages.length === 0)
      throw new Error("Пустая промежуточная страница истории");
    data.messages.upsertMany(
      result.messages.map((m) =>
        mapMessage(run.accountId, fanId, m, options.toMediaUrl),
      ),
    );
    const last = result.messages.at(-1);
    return {
      messages: result.messages,
      complete: result.nextPageUrl === null,
      ...(last ? { cursor: String(last.id) } : {}),
    };
  }
  async function check(run: Run, entry: Entry): Promise<void> {
    current(run);
    if (entry.row.subscribedAt === null) return;
    if (
      entry.user.isBlocked === true ||
      entry.user.isRestricted === true ||
      entry.user.canReceiveChatMessage === false
    ) {
      entry.row.status = "blocked";
      entry.row.reason = "Отправка недоступна для этого фана";
      entry.row.revision = null;
      return;
    }
    entry.row.status = "checking";
    entry.row.reason = "Читаем историю";
    entry.row.revision = null;
    notify(run.accountId);
    const messages: OfApiMessage[] = [];
    let complete: boolean;
    let cursor: string | undefined;
    try {
      do {
        const page = await historyPage(run, entry, cursor);
        messages.push(...page.messages);
        complete = page.complete;
        cursor = page.cursor;
        const verdict = assessHistory(messages, complete, run.welcome);
        if (verdict.status === "contacted" || verdict.status === "replied")
          break;
      } while (!complete && messages.length < FOLLOWER_MAX_HISTORY);
      current(run);
      entry.messages = messages;
      entry.complete = complete;
      entry.cursor = cursor;
      Object.assign(entry.row, assessHistory(messages, complete, run.welcome), {
        checkedAt: new Date(now()).toISOString(),
        revision: historyRevision(messages),
      });
      trace(run, "fan.verdict", entry.row.fanId, {
        status: entry.row.status,
        messages: messages.length,
        complete,
        revision: entry.row.revision,
      });
    } catch (error) {
      entry.row.status = run.controller.signal.aborted ? "pending" : "unknown";
      entry.row.reason = run.controller.signal.aborted
        ? "Проверка приостановлена"
        : `Историю не удалось проверить${error instanceof CgError ? ` (${error.code})` : ""}`;
      entry.row.revision = null;
      trace(run, "fan.error", entry.row.fanId, {
        code: error instanceof CgError ? error.code : "invalid_or_incomplete",
        aborted: run.controller.signal.aborted,
      });
      authorize(run.accountId);
      if (
        run.controller.signal.aborted ||
        (error instanceof CgError &&
          ["CG-HUB-01", "CG-OF-01", "CG-OF-02", "CG-OF-04"].includes(
            error.code,
          ))
      )
        throw error;
    } finally {
      notify(run.accountId);
    }
  }
  async function work(run: Run): Promise<void> {
    try {
      if (!run.welcome) {
        run.stage = "Загружаем welcome-шаблон";
        try {
          run.welcome = await read(run, null, "welcome", () =>
            client.getWelcomeMessage({
              accountId: run.accountId,
              purpose: "followers",
              retry: "none",
              signal: run.controller.signal,
            }),
          );
        } catch (error) {
          current(run);
          trace(run, "welcome.unavailable");
          if (
            error instanceof CgError &&
            ["CG-HUB-01", "CG-OF-01", "CG-OF-02", "CG-OF-04"].includes(
              error.code,
            )
          )
            throw error;
        }
      }
      while (!run.listed) {
        current(run);
        run.stage = "Загружаем новых подписчиков";
        const page = await read(run, null, "fans", () =>
          client.listFansAll({
            accountId: run.accountId,
            purpose: "followers",
            limit: 20,
            offset: run.offset,
            retry: "none",
            strict: true,
            signal: run.controller.signal,
          }),
        );
        current(run);
        if (page.hasMore && page.fans.length === 0)
          throw new Error("Пустая промежуточная страница фанов");
        for (const fan of page.fans) addFan(run, fan);
        run.offset += page.fans.length;
        // Newest-first is OFAPI's documented ordering. Only a whole dated
        // page below the lower boundary can terminate enumeration early.
        const older =
          page.fans.length > 0 &&
          page.fans.every(
            (fan) =>
              Date.parse(fan.subscribedOnData?.subscribeAt ?? "") < run.from,
          );
        run.listed = !page.hasMore || older;
        if (!run.listed && run.offset >= FOLLOWER_MAX_FANS) {
          run.listed = true;
          run.truncated = true;
        }
        notify(run.accountId);
      }
      run.stage = "Проверяем переписку";
      for (const entry of run.entries.values()) {
        current(run);
        if (entry.row.status === "pending") await check(run, entry);
      }
      current(run);
      run.state = "complete";
      run.stage = run.truncated
        ? "Проверка завершена с ограничением списка"
        : "Проверка завершена";
      trace(run, "run.complete", null, {
        total: run.entries.size,
        requests: run.requests,
        truncated: run.truncated,
      });
    } catch (error) {
      run.state = run.controller.signal.aborted ? "paused" : "error";
      run.stage = run.state === "paused" ? "Пауза" : "Проверка остановлена";
      run.error =
        run.state === "error"
          ? `Не удалось продолжить проверку${error instanceof CgError ? ` (${error.code})` : ""}. Уже проверенные фаны сохранены.`
          : null;
      trace(run, `run.${run.state}`);
    } finally {
      run.worker = null;
      if (!disposed) {
        persist(run);
        notify(run.accountId);
      }
    }
  }
  async function actionInner(
    accountId: string,
    fanId: string,
    task: (run: Run, entry: Entry) => Promise<void>,
  ): Promise<void> {
    const run = getRun(accountId);
    const entry = getEntry(run, fanId);
    if (run.state === "running" || entry.busy)
      throw new Error(
        "Дождитесь завершения или приостановите текущую проверку",
      );
    entry.busy = true;
    try {
      if (run.worker) await run.worker;
      if (disposed || runs.get(accountId) !== run)
        throw new Error("Проверка заменена");
      if (run.controller.signal.aborted) run.controller = new AbortController();
      current(run);
      await task(run, entry);
    } finally {
      entry.busy = false;
      if (!disposed) {
        persist(run);
        notify(accountId);
      }
    }
  }
  function action(
    accountId: string,
    fanId: string,
    task: (run: Run, entry: Entry) => Promise<void>,
  ): Promise<void> {
    const promise = actionInner(accountId, fanId, task);
    actions.add(promise);
    void promise.finally(() => actions.delete(promise)).catch(() => undefined);
    return promise;
  }
  const service = {
    snapshot(args: SnapshotArgs): FollowersSnapshotVM {
      authorize(args.accountId);
      const run = runs.get(args.accountId);
      const counts = Object.fromEntries(statuses.map((s) => [s, 0])) as Record<
        FollowerStatus,
        number
      >;
      const all = run
        ? [...run.entries.values()].map((entry) => {
            updateOutbox(run, entry);
            return { ...entry.row };
          })
        : [];
      for (const row of all) counts[row.status] += 1;
      const search = (args.search ?? "").toLocaleLowerCase();
      const matching = all.filter(
        (row) =>
          (!args.filter ||
            args.filter === "all" ||
            row.status === args.filter) &&
          `${row.name} ${row.username} ${row.fanId}`
            .toLocaleLowerCase()
            .includes(search),
      );
      return {
        runId: run?.id ?? null,
        state: run?.state ?? "idle",
        stage: run?.stage ?? "Готово к проверке",
        from: run ? new Date(run.from).toISOString() : null,
        to: run ? new Date(run.to).toISOString() : null,
        startedAt: run ? new Date(run.startedAt).toISOString() : null,
        checked: all.filter(
          (row) => row.status !== "pending" && row.status !== "checking",
        ).length,
        total: all.length,
        requests: run?.requests ?? 0,
        cooldownUntil: pacer.cooldown(args.accountId),
        truncated: run?.truncated ?? false,
        error: run?.error ?? null,
        counts,
        rows: matching.slice(
          args.offset ?? 0,
          (args.offset ?? 0) + (args.limit ?? 200),
        ),
        matching: matching.length,
        debug: options.isDebug(),
      };
    },
    detail(accountId: string, fanId: string): FollowerDetailVM | null {
      authorize(accountId);
      const run = runs.get(accountId);
      const entry = run?.entries.get(fanId);
      if (!run || !entry) return null;
      updateOutbox(run, entry);
      return {
        row: { ...entry.row },
        about: plain(entry.user.about),
        messages: [...entry.messages]
          .reverse()
          .map((m) => ({
            id: String(m.id),
            at: m.createdAt,
            fromMe: m.isSentByMe,
            text: plain(m.text),
            mediaCount: m.mediaCount ?? m.media?.length ?? 0,
            kind: messageKind(m, run.welcome),
          })),
        hasOlder:
          !entry.complete && entry.messages.length < FOLLOWER_MAX_HISTORY,
        draft: entry.draft,
        generating: entry.generating,
        sending: entry.row.status === "sending",
      };
    },
    start(accountId: string, hours: number): void {
      authorize(accountId);
      const old = runs.get(accountId);
      if (
        old?.worker ||
        [...(old?.entries.values() ?? [])].some(
          (entry) => entry.busy || entry.row.status === "sending",
        )
      )
        throw new Error("Дождитесь завершения активных операций");
      old?.controller.abort();
      const startedAt = now();
      const id = randomUUID();
      const journal: Journal | null = options.isDebug()
        ? {
            id,
            startedAt: new Date(startedAt).toISOString(),
            events: [],
            dropped: 0,
            chars: 0,
          }
        : null;
      if (journal) {
        const list = traceRuns(accountId);
        list.unshift(journal);
        list.splice(FOLLOWER_TRACE_RUNS);
      }
      const run: Run = {
        id,
        accountId,
        startedAt,
        from: startedAt - hours * 3_600_000,
        to: startedAt,
        state: "running",
        stage: "Начинаем проверку",
        error: null,
        entries: new Map(),
        offset: 0,
        listed: false,
        requests: 0,
        truncated: false,
        welcome: null,
        controller: new AbortController(),
        worker: null,
        journal,
      };
      runs.set(accountId, run);
      trace(run, "run.start", null, { hours });
      run.worker = work(run);
      notify(accountId);
    },
    pause(accountId: string): void {
      const run = getRun(accountId);
      run.controller.abort();
      run.state = "paused";
      run.stage = "Пауза";
      trace(run, "run.pause");
      persist(run);
      notify(accountId);
    },
    async resume(accountId: string): Promise<void> {
      const run = getRun(accountId);
      if (run.worker) await run.worker;
      if ([...run.entries.values()].some((e) => e.busy))
        throw new Error("Дождитесь активной операции");
      if (run.state !== "paused" && run.state !== "error") return;
      run.controller = new AbortController();
      run.state = "running";
      run.error = null;
      trace(run, "run.resume");
      run.worker = work(run);
      notify(accountId);
    },
    recheck(accountId: string, fanId: string): Promise<void> {
      return action(accountId, fanId, async (run, entry) => {
        if (entry.localId) {
          const row = data.outbox.get(entry.localId);
          if (
            !row ||
            (row.state !== "failed" &&
              !(row.state === "cancelled" && row.attempts === 0))
          )
            throw new Error("Сначала проверьте отправку в чате");
          delete entry.localId;
        }
        await check(run, entry);
      });
    },
    older(accountId: string, fanId: string): Promise<void> {
      return action(accountId, fanId, async (run, entry) => {
        if (entry.complete || entry.messages.length >= FOLLOWER_MAX_HISTORY)
          return;
        const page = await historyPage(run, entry, entry.cursor);
        entry.messages.push(...page.messages);
        entry.complete = page.complete;
        entry.cursor = page.cursor;
        trace(run, "history.expanded", fanId, {
          count: entry.messages.length,
          complete: entry.complete,
        });
        // Viewing older messages never grants eligibility or changes the reviewed revision.
      });
    },
    draft(accountId: string, fanId: string, text: string): void {
      const run = getRun(accountId);
      const entry = getEntry(run, fanId);
      if (text.length > 5_000)
        throw new Error("Черновик длиннее 5000 символов");
      entry.draft = text;
      entry.row.hasDraft = text !== "";
      data.settings.set(draftKey(accountId, fanId), text);
      notify(accountId);
    },
    generate(accountId: string, fanId: string): Promise<void> {
      return action(accountId, fanId, async (run, entry) => {
        if (entry.row.status !== "ready")
          throw new Error("Приветствие доступно только после полной проверки");
        const revision = entry.row.revision;
        const before = entry.draft;
        entry.generating = true;
        trace(run, "generation.start", fanId);
        notify(accountId);
        try {
          const text = await options.generate(
            accountId,
            fanId,
            run.controller.signal,
          );
          current(run);
          if (
            entry.row.status !== "ready" ||
            entry.row.revision !== revision ||
            entry.draft !== before
          )
            throw new Error("Фан или черновик изменились во время генерации");
          if (
            !text.trim() ||
            text.length > 5_000 ||
            /\[(?:NEXT|VARIANT)\]/.test(text)
          )
            throw new Error("AI вернул некорректное приветствие");
          service.draft(accountId, fanId, text);
          trace(run, "generation.complete", fanId);
        } finally {
          entry.generating = false;
        }
      });
    },
    send(
      accountId: string,
      fanId: string,
      revision: string,
      text: string,
    ): Promise<void> {
      return action(accountId, fanId, async (run, entry) => {
        if (
          entry.row.status !== "ready" ||
          entry.row.revision !== revision ||
          !text.trim() ||
          text.length > 5_000 ||
          entry.localId
        )
          throw new Error("Отправка недоступна: проверьте фанa и черновик");
        const beforeOutbox = new Set(
          data.outbox.listForChat(accountId, fanId).map((row) => row.localId),
        );
        if (
          data.outbox
            .listForChat(accountId, fanId)
            .some((row) =>
              ["queued", "sending", "unconfirmed"].includes(row.state),
            )
        )
          throw new Error("В чате уже есть неподтверждённая отправка");
        trace(run, "send.preflight", fanId);
        const users = await read(run, fanId, "profile", () =>
          client.getUsersByIds({
            accountId,
            ids: [fanId],
            purpose: "followers",
            retry: "none",
            signal: run.controller.signal,
          }),
        );
        current(run);
        const user = users[fanId];
        if (
          !user ||
          String(user.id) !== fanId ||
          user.canReceiveChatMessage !== true ||
          user.isBlocked === true ||
          user.isRestricted === true
        )
          throw new Error(
            "OFAPI не подтвердил возможность отправки этому фану",
          );
        entry.user = user;
        data.fans.upsert(
          mapFan(
            accountId,
            user,
            options.toMediaUrl,
            new Date(now()).toISOString(),
          ),
        );
        if (!data.chats.get(accountId, fanId)) {
          // A new fan can have no existing chat. Seed identity/sendability only
          // from the just-read profile's explicit canReceiveChatMessage proof.
          const chat = mapChat(
            accountId,
            { fan: user, canSendMessage: true },
            options.toMediaUrl,
          );
          if (!chat) throw new Error("OFAPI не вернул идентификатор чата");
          data.chats.upsert(chat);
        }
        await check(run, entry);
        current(run);
        if (entry.row.status !== "ready" || entry.row.revision !== revision)
          throw new Error("Переписка изменилась. Просмотрите проверку ещё раз");
        if (
          data.outbox
            .listForChat(accountId, fanId)
            .some(
              (row) =>
                !beforeOutbox.has(row.localId) ||
                ["queued", "sending", "unconfirmed"].includes(row.state),
            )
        ) {
          entry.row.status = "unknown";
          entry.row.revision = null;
          entry.row.reason = "Очередь чата изменилась во время проверки";
          throw new Error("Очередь чата изменилась. Перепроверьте фана");
        }
        entry.localId = options.enqueue(accountId, fanId, text.trim());
        entry.row.status = "sending";
        entry.row.reason = "Ожидаем подтверждение отправки";
        if (entry.draft.trim() === text.trim())
          service.draft(accountId, fanId, "");
        trace(run, "send.queued", fanId, { localId: entry.localId });
      });
    },
    trace(args: TraceArgs) {
      authorize(args.accountId);
      if (!options.isDebug())
        return { runs: [], events: [], total: 0, dropped: 0 };
      const list = traceRuns(args.accountId);
      const journal = args.runId
        ? list.find((j) => j.id === args.runId)
        : list[0];
      const events =
        journal?.events.filter(
          (e) =>
            (!args.fanId || e.fanId === args.fanId) &&
            (!args.search ||
              `${e.event} ${JSON.stringify(e.detail)}`
                .toLowerCase()
                .includes(args.search.toLowerCase())),
        ) ?? [];
      return {
        runs: list.map((j) => ({ id: j.id, startedAt: j.startedAt })),
        events: events.slice(args.offset ?? 0, (args.offset ?? 0) + 1_000),
        total: events.length,
        dropped: journal?.dropped ?? 0,
      };
    },
    exportText(accountId: string, runId?: string): string {
      authorize(accountId);
      if (!options.isDebug()) throw new Error("Включите режим отладки");
      const journal = traceRuns(accountId).find(
        (j) => !runId || j.id === runId,
      );
      if (!journal) throw new Error("Журнал не найден");
      return (
        `ChatGoose new followers | ${journal.id} | ${journal.startedAt}\nDropped events: ${journal.dropped}\n` +
        journal.events
          .map(
            (e) =>
              `${e.at} +${e.elapsedMs}ms #${e.seq} fan=${e.fanId ?? "-"} ${e.event} ${JSON.stringify(e.detail)}`,
          )
          .join("\n")
      );
    },
    onRequestEvent(event: OfApiRequestEvent): void {
      if (event.purpose !== "followers") return;
      const run = runs.get(event.accountKey);
      if (!run) return;
      const fanId = /\/chats\/(\d+)\/messages/.exec(event.path)?.[1] ?? null;
      const query = Object.fromEntries(
        Object.entries(event.query)
          .filter(
            ([key, value]) =>
              [
                "offset",
                "limit",
                "order",
                "first_id",
                "skip_users",
                "ids",
              ].includes(key) &&
              value !== undefined &&
              value !== null,
          )
          .map(([key, value]) => [key, String(value)]),
      );
      trace(run, `http.${event.phase}`, fanId, {
        path: event.path,
        method: event.method,
        attempt: event.attempt,
        ...query,
        ...(event.phase === "started"
          ? { queueWaitMs: event.queueWaitMs }
          : {}),
        ...(event.phase === "response"
          ? { status: event.status, elapsedMs: event.elapsedMs }
          : {}),
      });
    },
    onOutboxChanged(accountId: string): void {
      const run = runs.get(accountId);
      if (run) {
        let statusChanged = false;
        for (const entry of run.entries.values()) {
          const before = entry.row.status;
          updateOutbox(run, entry);
          if (before !== entry.row.status) {
            statusChanged = true;
            trace(run, "send.status", entry.row.fanId, {
              before,
              status: entry.row.status,
            });
          }
        }
        if (statusChanged) {
          persist(run);
          notify(accountId);
        }
      }
    },
    async dispose(): Promise<void> {
      disposed = true;
      for (const run of runs.values()) run.controller.abort();
      if (notifyTimer) clearTimeout(notifyTimer);
      await Promise.allSettled([
        ...actions,
        ...[...runs.values()].flatMap((run) =>
          run.worker ? [run.worker] : [],
        ),
      ]);
      for (const run of runs.values()) persist(run);
    },
  };
  return service;
}
export type FollowersService = ReturnType<typeof createFollowersService>;
