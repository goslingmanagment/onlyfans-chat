import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import type {
  FollowerDetailVM,
  FollowerMessageVM,
} from "../../../../preload/followers-contract";
import { getBridge } from "../../bridge/bridge";
import { Avatar } from "../../design/Avatar";
import { Button } from "../../design/Button";
import { cx } from "../../lib/cx";
import { formatFollowerTime, useFollowersCopy } from "./copy";
import { getFollowerDraftWriter } from "./draftWriter";
import { followerKey, FOLLOWERS_QUERY_POLICY } from "./queries";

export function FollowerDetail({
  accountId,
  fanId,
  scanRunning,
}: {
  accountId: string;
  fanId: string;
  scanRunning: boolean;
}): React.JSX.Element {
  const { c, status, locale } = useFollowersCopy();
  const client = useQueryClient();
  const query = useQuery({
    ...FOLLOWERS_QUERY_POLICY,
    queryKey: [...followerKey(accountId), "detail", fanId],
    queryFn: () =>
      getBridge().invoke("query:followers.detail", { accountId, fanId }),
  });
  const detail = query.data;
  const [draft, setDraft] = useState("");
  const [reviewedRevision, setReviewedRevision] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<
    "generate" | "send" | "recheck" | "older" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const edited = useRef(false);
  const mounted = useRef(true);
  const writer = useMemo(
    () =>
      getFollowerDraftWriter(accountId, fanId, (text) =>
        getBridge().invoke("cmd:followers.draft", { accountId, fanId, text }),
      ),
    [accountId, fanId],
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void writer.flush().catch(() => {
        /* invoke failures are recorded by the bridge */
      });
    };
  }, [writer]);
  useEffect(() => {
    if (detail == null || edited.current) return;
    const pendingText = writer.pendingText();
    setDraft(pendingText ?? detail.draft);
    setReviewedRevision(detail.row.revision);
    if (pendingText !== null || detail.draft !== "") edited.current = true;
  }, [detail, writer]);
  useEffect(() => {
    if (!writer.isDirty()) return;
    const timer = setTimeout(() => {
      setSaving(true);
      void writer
        .flush()
        .then(() => {
          if (mounted.current) setError(null);
        })
        .catch((e: unknown) => {
          if (mounted.current)
            setError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => {
          if (mounted.current) setSaving(false);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [draft, writer]);

  async function action(kind: NonNullable<typeof pending>): Promise<void> {
    if (pending !== null || detail == null || scanRunning) return;
    setPending(kind);
    setError(null);
    try {
      await writer.flush();
      if (!mounted.current) return;
      if (kind === "generate") {
        await getBridge().invoke("cmd:followers.generate", {
          accountId,
          fanId,
        });
        const updated = await getBridge().invoke("query:followers.detail", {
          accountId,
          fanId,
        });
        if (mounted.current && updated !== null) {
          edited.current = true;
          setDraft(updated.draft);
          setReviewedRevision(updated.row.revision);
          client.setQueryData(
            [...followerKey(accountId), "detail", fanId],
            updated,
          );
        }
      } else if (kind === "send") {
        if (reviewedRevision === null) throw new Error(c.changed);
        await getBridge().invoke("cmd:followers.send", {
          accountId,
          fanId,
          revision: reviewedRevision,
          text: draft,
        });
        if (mounted.current) {
          edited.current = false;
          setDraft("");
        }
      } else if (kind === "recheck")
        await getBridge().invoke("cmd:followers.recheck", { accountId, fanId });
      else
        await getBridge().invoke("cmd:followers.older", { accountId, fanId });
      await client.invalidateQueries({ queryKey: followerKey(accountId) });
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setPending(null);
    }
  }
  if (query.isPending)
    return (
      <div className="flex flex-1 items-center justify-center text-ink-low">
        {c.loading}
      </div>
    );
  if (detail == null)
    return (
      <div
        className="flex flex-1 items-center justify-center text-ink-low"
        role={query.error ? "alert" : "status"}
      >
        {query.error?.message ?? c.select}
      </div>
    );
  const row = detail.row;
  const canWrite = row.status === "ready";
  const editorLocked = pending !== null || detail.generating || detail.sending;
  const locked = editorLocked || scanRunning;
  const changed = draft.trim() !== "" && reviewedRevision !== row.revision;
  return (
    <article className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex-none border-b border-line px-5 py-3">
        <div className="flex items-center gap-3">
          <Avatar name={row.name} url={row.avatarUrl} size={42} radius={21} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-serif text-[20px] font-semibold">
              {row.name}
            </h2>
            <p className="truncate text-[12px] text-ink-low">
              @{row.username} · ID {row.fanId}
            </p>
          </div>
          <Button
            size="sm"
            disabled={locked}
            title={scanRunning ? c.pauseHint : ""}
            onClick={() => {
              void action("recheck");
            }}
          >
            {c.retry}
          </Button>
        </div>
        {detail.about && (
          <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-[13px] text-ink-mid">
            {detail.about}
          </p>
        )}
        <p className="mt-2 text-[13px] font-semibold text-ink-mid">
          {status[row.status]}{" "}
          <span className="font-normal">· {row.reason}</span>
        </p>
        <p className="num mt-1 text-[10px] text-ink-low">
          {c.subscribed}: {formatFollowerTime(row.subscribedAt, locale)} ·{" "}
          {c.checkedAt}: {formatFollowerTime(row.checkedAt, locale)}
        </p>
        {row.proof && (
          <blockquote className="mt-2 border-l-2 border-clay-line pl-3 text-[12px] text-ink-mid">
            <span className="num text-[10px] text-ink-low">
              {formatFollowerTime(row.proof.at, locale)}
            </span>
            <p className="line-clamp-3 whitespace-pre-wrap">{row.proof.text}</p>
          </blockquote>
        )}
      </header>
      <p className="flex-none px-5 pt-2 text-[11px] text-ink-low">{c.cached}</p>
      {detail.hasOlder && (
        <div className="flex flex-none justify-center py-2">
          <Button
            size="sm"
            disabled={locked}
            title={scanRunning ? c.pauseHint : ""}
            onClick={() => {
              void action("older");
            }}
          >
            {pending === "older" ? c.loading : c.older}
          </Button>
        </div>
      )}
      <FollowerHistory messages={detail.messages} />
      <div className="flex-none space-y-2 border-t border-line px-5 py-3">
        {(error ?? query.error?.message) && (
          <p role="alert" className="text-[13px] text-bad">
            {error ?? query.error?.message}
          </p>
        )}
        {(canWrite || draft !== "" || detail.generating) && (
          <>
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="follower-draft"
                className="text-[13px] font-semibold text-ink-mid"
              >
                {c.draft}
              </label>
              <Button
                size="sm"
                disabled={!canWrite || locked}
                title={scanRunning ? c.pauseHint : ""}
                onClick={() => {
                  void action("generate");
                }}
              >
                {pending === "generate" || detail.generating
                  ? c.generating
                  : `✦ ${c.generate}`}
              </Button>
            </div>
            <textarea
              id="follower-draft"
              aria-label={c.draft}
              value={draft}
              maxLength={5000}
              rows={2}
              disabled={!canWrite || editorLocked}
              placeholder={c.placeholder}
              className="max-h-40 min-h-20 w-full resize-y rounded-panel border border-line bg-bg1 p-3 font-serif text-[15px] leading-relaxed outline-none focus:border-clay disabled:opacity-60"
              onChange={(e) => {
                const text = e.target.value;
                edited.current = true;
                setDraft(text);
                writer.edit(text);
                client.setQueryData<FollowerDetailVM | null>(
                  [...followerKey(accountId), "detail", fanId],
                  (cached) =>
                    cached == null ? cached : { ...cached, draft: text },
                );
              }}
              onKeyDown={(e) => {
                if (
                  (e.metaKey || e.ctrlKey) &&
                  e.key === "Enter" &&
                  canWrite &&
                  !locked &&
                  !changed &&
                  draft.trim() !== ""
                ) {
                  e.preventDefault();
                  void action("send");
                }
              }}
            />
            {changed && (
              <div className="text-[12px] text-amber">
                <p>{c.changed}</p>
                <Button
                  size="sm"
                  variant="subtle"
                  disabled={!canWrite || locked}
                  title={scanRunning ? c.pauseHint : ""}
                  onClick={() => setReviewedRevision(row.revision)}
                >
                  {c.reviewed}
                </Button>
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="flex-1 text-[11px] text-ink-low">
                {saving ? c.saving : scanRunning ? c.pauseHint : c.readyHint}
              </span>
              <span className="num text-[10px] text-ink-low">
                {draft.length}/5000
              </span>
              <Button
                size="sm"
                variant="primary"
                disabled={
                  !canWrite ||
                  locked ||
                  changed ||
                  reviewedRevision === null ||
                  draft.trim() === ""
                }
                onClick={() => {
                  void action("send");
                }}
              >
                {pending === "send" || detail.sending ? c.sending : c.send}
              </Button>
            </div>
          </>
        )}
      </div>
    </article>
  );
}

function FollowerHistory({
  messages,
}: {
  messages: FollowerMessageVM[];
}): React.JSX.Element {
  const { c, locale } = useFollowersCopy();
  const scroll = useRef<HTMLDivElement>(null);
  const followInitialBottom = useRef(true);
  const previousFirst = useRef<string | undefined>(undefined);
  const previousHeight = useRef(0);
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 100,
    getItemKey: (i) => messages[i]?.id ?? i,
    overscan: 5,
    paddingStart: 12,
    paddingEnd: 12,
  });
  useEffect(() => {
    const element = scroll.current;
    if (messages.length === 0 || element === null) return;
    const first = messages[0]?.id;
    if (
      previousFirst.current !== undefined &&
      previousFirst.current !== first
    ) {
      followInitialBottom.current = false;
      element.scrollTop += Math.max(
        0,
        virtualizer.getTotalSize() - previousHeight.current,
      );
    }
    previousFirst.current = first;
    previousHeight.current = virtualizer.getTotalSize();
    let frame: number | null = null;
    const settle = (): void => {
      if (!followInitialBottom.current) return;
      if (frame !== null) cancelAnimationFrame(frame);
      virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
      frame = requestAnimationFrame(() => {
        frame = null;
        if (followInitialBottom.current)
          element.scrollTop = element.scrollHeight;
      });
    };
    const stopFollowing = (): void => {
      followInitialBottom.current = false;
    };
    // Measurement and the surrounding controls can resize AFTER the initial
    // scroll. Keep the last bubble visible until the chatter navigates history;
    // never drag them back after scrolling or prepending older messages.
    const observer = new ResizeObserver(settle);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    element.addEventListener("wheel", stopFollowing, { passive: true });
    element.addEventListener("pointerdown", stopFollowing);
    element.addEventListener("keydown", stopFollowing);
    settle();
    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      element.removeEventListener("wheel", stopFollowing);
      element.removeEventListener("pointerdown", stopFollowing);
      element.removeEventListener("keydown", stopFollowing);
    };
  }, [messages, virtualizer]);
  return (
    <div
      ref={scroll}
      className="min-h-0 flex-1 overflow-y-auto px-5"
      aria-label={c.cached}
    >
      {messages.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-ink-low">
          {c.noMessages}
        </p>
      ) : (
        <div
          style={{ height: virtualizer.getTotalSize(), position: "relative" }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const message = messages[item.index];
            if (message === undefined) return null;
            return (
              <div
                key={item.key}
                data-index={item.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${item.start}px)`,
                }}
                className={cx(
                  "flex pb-3",
                  message.fromMe ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cx(
                    "max-w-[85%] rounded-panel border px-3 py-2",
                    message.fromMe
                      ? "border-clay-line bg-clay-bg"
                      : "border-line bg-bg2",
                  )}
                >
                  <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed">
                    {message.text || "—"}
                  </p>
                  {message.mediaCount > 0 && (
                    <p className="mt-1 text-[11px] text-ink-low">
                      ▧ {message.mediaCount}
                    </p>
                  )}
                  <p className="num mt-1 text-[10px] text-ink-low">
                    {formatFollowerTime(message.at, locale)}
                    {message.kind === "automatic"
                      ? " · AUTO"
                      : message.kind === "ambiguous"
                        ? " · ?"
                        : ""}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
