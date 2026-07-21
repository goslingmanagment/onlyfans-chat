# Startup Notification Flood Fix — Implementation Plan

> **Post-review amendments (2026-07-22).** The agentic reviews of core PR #21
> and desktop PR #16 changed four things against the plan as written below:
> (1) the marker is NOT a domain frame — the published DomainEventFrame
> contract requires positive accountId/accountSeq and the vendored SDK kills
> the subscription on any invalid domain frame; it is now a dedicated
> `event: control` SSE frame `{"type":"replay_completed"}`, which old clients
> skip by the same rule as `event: ephemeral`, and the desktop consumes it
> signal-only (no cursor checkpoint); (2) core guards the marker write (and
> the pre-existing snapshot-marker write) with the same
> writableEnded/destroyed check as writeV2Frame — an unlistened
> write-after-end is a process-fatal stream error; (3) the alert-dedup
> registry spans BOTH event sources — polling-origin messageReceived claims
> ids too, so an SSE replay after a polling-covered outage cannot alert
> twice; (4) the live signal re-arms after a suspend-sized wall-clock gap
> (>5 min between gate evaluations): a sleeping session was not watching, so
> the wake backlog replays silently like a cold start. D23 records the
> as-built rules.

## Why this work exists (read first)

**Problem being solved.** Production bug report (desktop v0.1.47): when a
chatter launches the app after hours offline, it fires a toast + notification
sound for EVERY message that arrived during the whole shift, one after another,
and keeps beeping for ~5 minutes.

**Root cause (verified in code).** On startup HubSync resumes the core SSE
stream from the cursor persisted at the end of the previous session. Core's
event journal retention is effectively infinite, so the server replays every
event of the offline gap, one frame at a time. `hub-provider.ts` emits every
replayed `messageReceived` through the same path as a live event — there is no
notion of "this is historical catch-up". The renderer then shows a toast and
plays a blip per event (`bridge/events.ts`), and main shows an OS notification
per event when the window is backgrounded (`index.ts` ~1096). The ~5-minute
duration comes from a pacing amplifier: with the default `autoReadChats=false`,
every thin (body-less) replay frame awaits `refreshAccountHead` behind a
2-second debounce (`HUB_LIST_REFRESH_DEBOUNCE_MS`), and frames are handled
strictly sequentially, so the debounce never coalesces — each frame pays ~2 s.

The polling provider already implements the intended product behavior: its
first sweep after start deliberately emits nothing ("silently swallows the
downtime backlog so it never replays as live events", `polling-sync.ts` ~1592).
The SSE path never got the equivalent guard. This plan adds it.

**Design rule (the one-sentence spec).** Replay restores state; only a message
that arrives while this app session is watching may produce user attention
(toast, sound, OS notification). State application, query invalidation, cursor
checkpointing, and unread badges are NOT gated — they must behave exactly as
today. Cursor semantics must not change (decision D10: the client never clears
a stale cursor; the fix must never skip or drop replayed state).

**Mechanism.**
1. Core (authoritative signal): after finishing the v2 replay for a
   connection, the server writes a synthetic domain frame
   `stream.replay_completed`. Everything after it on this connection is live
   delivery. Old desktop clients ignore unknown frame types by contract.
2. Desktop (gate + fallback): hub-provider suppresses "attention" for
   `messageReceived` events until the first `stream.replay_completed` of the
   app session; if the marker never comes (older core, v1 protocol), a
   fallback timestamp gate applies: attention only for messages whose
   timestamp is not older than the provider start epoch minus a 60 s grace.
   Suppressed events still emit — stamped `live: false` — so state flows
   unchanged; consumers skip toast/sound/OS-notif for them.
3. Independent hardening: dedup of alerts by message id (a crash-window frame
   replay must not alert twice), a ≥2 s min interval between sound blips, and
   an early proof-check in `refreshChat` that collapses the thin-frame replay
   drain from minutes to seconds.

**Goal.** After this change, launching the app after a shift offline produces
zero notification spam (list/badges simply reflect unread state), while a
message arriving mid-session — including during a brief SSE reconnect gap —
still alerts exactly once.

---

**Architecture:** Two repos. Core: one synthetic SSE frame at the existing
`replayDone` flip point (v2 stream only). Desktop: thread `occurredAt` from the
v2 frame into the local `SyncEvent`, add an `onCaughtUp` callback through
HubSync → hub-provider, compute attention-eligibility in hub-provider (single
choke point), stamp `live: false` on suppressed events, honor the flag in main
and renderer via one shared helper.

**Tech stack:** TypeScript strict, zod at trust boundaries, Vitest. pnpm
monorepo in both repos.

## Global constraints

- `pnpm check` must pass in each repo before its commit (typecheck + lint +
  unit tests + build).
- Never modify anything under `packages/kernel-sdk` (vendored, hash-gated).
- SPEC §15 invariants are review-blocking; relevant here: zod at every trust
  boundary; `packages/shared` stays platform-pure (no Electron/DOM imports).
- No new dependencies in either repo.
- Match surrounding comment style: comments state constraints the code cannot
  show, not narration of the next line.
- One commit per repo, `type(scope): summary` convention. Do not push.
- Task 1 is in the CORE worktree; Tasks 2–8 are in the DESKTOP worktree. The
  desktop side must work correctly with a core that does NOT yet send the
  marker (fallback path) — there is no deploy-order coupling.

## File map

Core worktree (`/Users/dmitriy/code/.worktrees/core/260721b-replay-completed-marker`):
- Modify: `apps/runtime/src/modules/events/index.ts` (v2 route handler)
- Test: `tests/domain-events-stream.test.ts`

Desktop worktree (`/Users/dmitriy/code/.worktrees/chatgoose_desktop/260721a-startup-notification-flood`):
- Modify: `packages/shared/src/protocol/index.ts` (schema + mapDomainFrame)
- Modify: `packages/shared/src/notifications/index.ts` (isAlertEligible helper)
- Modify: `apps/desktop/src/main/sync/hub-sync.ts` (onCaughtUp option + v2 marker intercept)
- Modify: `apps/desktop/src/main/sync/hub-provider.ts` (attention gate, dedup, callback wiring)
- Modify: `apps/desktop/src/main/index.ts` (createHubSync onCaughtUp pass-through ~line 826; OS-notif gate ~line 1096)
- Modify: `apps/desktop/src/main/sync/polling-sync.ts` (refreshChat early proof-check ~line 2013)
- Modify: `apps/desktop/src/renderer/src/bridge/events.ts` (toast/blip gate)
- Modify: `apps/desktop/src/renderer/src/lib/sound.ts` (blip throttle)
- Modify: `docs/decisions.md` (new decision entry)
- Tests: `packages/shared/tests/protocol-domain-frames.test.ts`,
  `packages/shared/tests/notifications.test.ts` (create if absent),
  `apps/desktop/tests/sync/hub-sync-v2.test.ts`,
  `apps/desktop/tests/sync/hub-sync.test.ts` (hub-provider cases live here),
  `apps/desktop/tests/sync/polling-sync.test.ts`,
  `apps/desktop/tests/renderer/sound.test.ts` (create)

---

### Task 1: Core — emit `stream.replay_completed` after v2 replay

**Files:**
- Modify: `apps/runtime/src/modules/events/index.ts`
- Test: `tests/domain-events-stream.test.ts`

**Interfaces:**
- Produces (wire contract consumed by desktop Task 3): a domain frame written
  on `/api/v1/events/v2/stream` after all replay work for the connection
  finishes and before buffered live frames flush:
  ```json
  {"accountId":0,"accountSeq":0,"type":"stream.replay_completed","occurredAt":"<iso>","data":null,"accountRef":null}
  ```
  Sent on EVERY v2 connection, including a fresh connect with no cursor
  (replay is empty → marker comes immediately after subscribe).

- [ ] Step: locate the v2 stream route handler in
  `apps/runtime/src/modules/events/index.ts`. Near the end of its replay
  section there is exactly one point where the ordinary/post-snapshot replay
  finishes (currently ~line 1058):
  ```ts
  replayDone = true;
  const buffered = bufferedLive.drain();
  ```
  Insert the marker write between `replayDone = true;` and the drain,
  mirroring the existing `stream.snapshot_replay_completed` synthetic frame a
  few lines above (~line 996–1006) — same `raw.write` shape, same
  `encodedConnectionCursor()` id:
  ```ts
  replayDone = true;
  // Live/replay boundary for clients (desktop notification gate): every
  // frame after this marker on this connection is live delivery, not
  // catch-up. Written before the buffered flush so frames that arrived
  // during replay correctly land on the live side.
  raw.write(
    `id: ${encodedConnectionCursor()}\nevent: domain\ndata: ${JSON.stringify({
      accountId: 0,
      accountSeq: 0,
      type: "stream.replay_completed",
      occurredAt: new Date().toISOString(),
      data: null,
      accountRef: null,
    })}\n\n`,
  );
  const buffered = bufferedLive.drain();
  ```
  Keep the object shape exactly as above — the desktop parses it with
  `domainEventFrameSchema` (requires integer `accountId`/`accountSeq`, string
  `type`/`occurredAt`).
- [ ] Step: add two cases to `tests/domain-events-stream.test.ts`, using the
  file's existing connection/stream harness (reuse its helpers for opening a
  v2 stream and reading frames):
  1. resume with a cursor behind existing events → the replayed `domain`
     frames all arrive BEFORE a frame with
     `type === "stream.replay_completed"`, and at least one replayed frame
     exists in the assertion;
  2. fresh connect (no cursor) → a `stream.replay_completed` frame arrives
     without any preceding domain frames.
- [ ] Verify: `pnpm check` in the core worktree passes.
- [ ] Commit (core worktree): `feat(events): mark v2 replay completion on the stream`

### Task 2: Desktop shared protocol — `occurredAt` + `live` on messageReceived

**Files:**
- Modify: `packages/shared/src/protocol/index.ts`
- Test: `packages/shared/tests/protocol-domain-frames.test.ts`

**Interfaces:**
- Produces (used by Tasks 4, 5):
  - `messageReceivedEventSchema` gains `occurredAt: z.string().optional()`
    and `live: z.boolean().optional()`; absent `live` means "alert-eligible"
    (polling-origin events never set it — their backlog gate already exists).
  - `mapDomainFrame` copies the v2 frame's `occurredAt` onto mapped
    `messageReceived` events.

- [ ] Step: in `packages/shared/src/protocol/index.ts` extend
  `messageReceivedEventSchema` (currently ~line 244):
  ```ts
  export const messageReceivedEventSchema = z.object({
    type: z.literal('messageReceived'),
    accountId: idSchema,
    chatId: idSchema,
    messageId: idSchema,
    message: tolerantNormalizedSyncMessageSchema,
    /** v2 journal time of the event; catch-up/live gating input (absent on v1). */
    occurredAt: z.string().optional(),
    /** false = replayed catch-up: apply state, but suppress toast/sound/OS-notif. */
    live: z.boolean().optional(),
  });
  ```
- [ ] Step: in `mapDomainFrame` (same file, ~line 508), the
  `'message.received' | 'message.sent'` case returns the mapped event. Include
  `occurredAt` only for the received variant:
  ```ts
  return {
    type: frame.type === 'message.received' ? 'messageReceived' : 'messageSent',
    accountId,
    chatId,
    messageId,
    ...(frame.type === 'message.received' ? { occurredAt: frame.occurredAt } : {}),
    ...(message !== undefined ? { message } : {}),
  };
  ```
  (TypeScript: the union return type stays valid because the spread is
  conditional on the same discriminant; if the compiler rejects the single
  return, split the two branches into separate `return` statements.)
- [ ] Step: tests in `packages/shared/tests/protocol-domain-frames.test.ts`:
  - a `message.received` domain frame maps to a `messageReceived` event with
    `occurredAt` equal to the frame's `occurredAt`;
  - a `message.sent` frame maps WITHOUT `occurredAt`;
  - `parseSyncEvent` accepts a `messageReceived` payload carrying
    `live: false` and one carrying no `live` field (round-trip through the
    schema, both parse successfully).
- [ ] Verify: `pnpm --filter @chatgoose/shared test` (or the repo's test
  invocation for that package) passes.
- [ ] Commit: fold into the single desktop commit at the end (Task 8).

### Task 3: Desktop hub-sync — `onCaughtUp` + marker intercept

**Files:**
- Modify: `apps/desktop/src/main/sync/hub-sync.ts`
- Test: `apps/desktop/tests/sync/hub-sync-v2.test.ts`

**Interfaces:**
- Consumes: core marker frame from Task 1 (works without it too — the
  callback simply never fires).
- Produces (used by Task 4): `HubSyncOptions` gains
  `onCaughtUp?: () => void;` — invoked once per connection when the v2 stream
  signals `stream.replay_completed`. Not supported for protocol v1 (no marker
  exists there); v1 callers rely on the Task 4 timestamp fallback.

- [ ] Step: add to `HubSyncOptions` (interface at ~line 234, next to
  `onEvent`):
  ```ts
  /** v2 replay/live boundary: core's stream.replay_completed marker. */
  onCaughtUp?: () => void;
  ```
- [ ] Step: in `handleV2Frame` (~line 598), after `parseDomainEventFrame`
  succeeds and BEFORE `mapDomainFrame` is called, intercept the marker:
  ```ts
  const domainFrame = parseDomainEventFrame(json);
  if (domainFrame === null) {
    dropped += 1;
    return;
  }
  if (domainFrame.type === 'stream.replay_completed') {
    // Synthetic live/replay boundary (accountRef null by design) — consume
    // before mapDomainFrame's accountRef drop; checkpoint like any frame.
    options.onCaughtUp?.();
    if (frame.id !== null && frame.id.length > 0) {
      options.setV2Cursor!(frame.id);
    }
    return;
  }
  ```
  Do NOT count it in `dropped`.
- [ ] Step: tests in `apps/desktop/tests/sync/hub-sync-v2.test.ts` (reuse the
  file's existing fake-stream harness that feeds SSE bytes):
  - a `stream.replay_completed` domain frame fires `onCaughtUp` exactly once,
    does NOT reach `onEvent`, does not increment the dropped counter
    (assert via whatever the harness exposes — e.g. subsequent frames still
    apply), and its `id:` line is checkpointed via `setV2Cursor`;
  - a stream without the marker never calls `onCaughtUp` and behaves exactly
    as before (existing tests stay green).
- [ ] Verify: `pnpm --filter @chatgoose/desktop test -- hub-sync-v2` (match
  the repo's per-file test invocation) passes.
- [ ] Commit: folded into Task 8's commit.

### Task 4: Desktop hub-provider — attention gate + dedup

**Files:**
- Modify: `apps/desktop/src/main/sync/hub-provider.ts`
- Modify: `apps/desktop/src/main/index.ts` (~line 826: pass `onCaughtUp`
  from the factory callbacks into `createHubSync`)
- Test: `apps/desktop/tests/sync/hub-sync.test.ts` (createHubAwareSync is
  exercised here)

**Interfaces:**
- Consumes: `onCaughtUp` from Task 3; `occurredAt`/`live` fields from Task 2.
- Produces (consumed by Task 5): every hub-origin `messageReceived` emitted to
  the bus either is alert-eligible (no `live` field) or carries
  `live: false`. Rules, in order:
  1. same message id already alerted this session → `live: false`;
  2. `stream.replay_completed` already seen this app session → eligible;
  3. otherwise fallback: eligible iff `message.createdAt` (preferred) or
     `occurredAt` parses to a time ≥ provider-start epoch − 60 000 ms;
     missing/unparsable timestamp → `live: false` (fail-quiet).

- [ ] Step: in `createHubAwareSync` (`hub-provider.ts` ~line 177), next to the
  other module state, add:
  ```ts
  // Attention gate (see docs/plans/2026-07-22-startup-notification-flood.md):
  // replay restores state; only messages arriving while this session watches
  // may toast/beep. Epoch fallback covers cores without the v2 marker.
  const NOTIFICATION_EPOCH_GRACE_MS = 60_000;
  const ALERTED_IDS_CAP = 500;
  const notificationEpochMs = now();
  let sawReplayCompleted = false;
  const alertedIds = new Set<string>();
  const alertedOrder: string[] = [];

  function markAlerted(key: string): void {
    alertedIds.add(key);
    alertedOrder.push(key);
    if (alertedOrder.length > ALERTED_IDS_CAP) {
      const evicted = alertedOrder.shift();
      if (evicted !== undefined) {
        alertedIds.delete(evicted);
      }
    }
  }

  function attentionEligible(
    event: Extract<SyncEvent, { type: 'messageReceived' }>,
  ): boolean {
    const key = `${event.accountId}/${event.chatId}/${event.messageId}`;
    if (alertedIds.has(key)) {
      return false;
    }
    let eligible: boolean;
    if (sawReplayCompleted) {
      eligible = true;
    } else {
      const ts = event.message?.createdAt ?? event.occurredAt;
      const ms = ts === undefined ? Number.NaN : Date.parse(ts);
      eligible = Number.isFinite(ms) && ms >= notificationEpochMs - NOTIFICATION_EPOCH_GRACE_MS;
    }
    if (eligible) {
      markAlerted(key);
    }
    return eligible;
  }

  function emitMessageEvent(
    event: Extract<SyncEvent, { type: 'messageReceived' | 'messageSent' }>,
  ): void {
    if (event.type !== 'messageReceived') {
      emit(event);
      return;
    }
    emit(attentionEligible(event) ? event : { ...event, live: false });
  }
  ```
  Place these AFTER `emit` is defined (~line 375) so the closure resolves.
- [ ] Step: in `handleHubEvent`'s `'messageReceived' | 'messageSent'` case
  (~line 683–740) replace BOTH `emit(event)` call sites (the enriched-ingest
  success path and the post-`refreshChat` fallback path) with
  `emitMessageEvent(event)`. Leave every other case untouched.
- [ ] Step: flip the flag when the stream reports the boundary. In the
  `createHub(...)` invocation (~line 904) the provider passes its callback
  object; add:
  ```ts
  onCaughtUp: () => {
    sawReplayCompleted = true;
  },
  ```
  and extend `HubFactoryCallbacks` (~line 66) with
  `onCaughtUp: () => void;`. `sawReplayCompleted` is deliberately
  session-sticky: reconfigure/reconnect replays a mid-session gap whose
  messages ARE news (polling parity) — do not reset it per connection.
- [ ] Step: in `apps/desktop/src/main/index.ts` (~line 826) the `createHub`
  implementation destructures the factory callbacks into the
  `createHubSync({ ... })` options. Pass `onCaughtUp` through alongside
  `onEvent`/`onSnapshot`/etc.
- [ ] Step: tests in `apps/desktop/tests/sync/hub-sync.test.ts` using the
  existing createHubAwareSync harness (fake hub feeding events, recorded
  emissions). Cases:
  1. enriched `messageReceived` with `message.createdAt` hours before the
     harness clock, no marker yet → emitted with `live: false`;
  2. same but `createdAt` = now → emitted WITHOUT a `live` field;
  3. id-only `messageReceived` (no body, no `occurredAt`), no marker → after
     the fallback path it emits with `live: false`;
  4. after `onCaughtUp` fires, an old-timestamp frame emits WITHOUT `live`
     (post-marker = live by definition);
  5. the same message id emitted twice while eligible → second emission has
     `live: false` (dedup);
  6. `messageSent` frames never carry a `live` field.
  If the harness's fake clock is injectable via `options.now`, pin it so case
  1/2 thresholds are deterministic.
- [ ] Verify: hub-sync test file passes; full `pnpm check` deferred to Task 8.
- [ ] Commit: folded into Task 8's commit.

### Task 5: Desktop consumers — honor the flag via one shared helper

**Files:**
- Modify: `packages/shared/src/notifications/index.ts`
- Modify: `apps/desktop/src/main/index.ts` (~line 1096)
- Modify: `apps/desktop/src/renderer/src/bridge/events.ts` (~line 160–183)
- Test: `packages/shared/tests/notifications.test.ts` (create if absent;
  extend if it exists)

**Interfaces:**
- Consumes: `live` field from Task 4.
- Produces: `isAlertEligible(event: { live?: boolean }): boolean` in
  `@chatgoose/shared/notifications/index` — the single definition both
  processes use.

- [ ] Step: add to `packages/shared/src/notifications/index.ts`:
  ```ts
  /** Attention gate consumer side: absent flag = live (polling events never
   * stamp it); only an explicit false suppresses toast/sound/OS-notif. */
  export function isAlertEligible(event: { live?: boolean }): boolean {
    return event.live !== false;
  }
  ```
- [ ] Step: main OS-notification condition in
  `apps/desktop/src/main/index.ts` (~line 1095) becomes:
  ```ts
  if (
    event.type === 'messageReceived' &&
    isAlertEligible(event) &&
    isWindowBackgrounded(mainWindow) &&
    notificationPrefs.notificationsEnabled &&
    Notification.isSupported()
  ) {
  ```
  Import `isAlertEligible` next to the existing
  `messageNotificationBody` import from the same module.
- [ ] Step: renderer `bridge/events.ts` `messageReceived` case: the
  toast+blip block currently guarded by `if (!isOpenChat)` becomes
  `if (!isOpenChat && isAlertEligible(event))`. Query invalidation above it
  stays UNGATED.
- [ ] Step: tests in `packages/shared/tests/notifications.test.ts`:
  `isAlertEligible({}) === true`, `isAlertEligible({ live: true }) === true`,
  `isAlertEligible({ live: false }) === false`.
- [ ] Verify: shared tests pass; renderer typecheck via `pnpm typecheck`.
- [ ] Commit: folded into Task 8's commit.

### Task 6: Desktop polling — early proof-check in `refreshChat`

**Files:**
- Modify: `apps/desktop/src/main/sync/polling-sync.ts` (~line 2013)
- Test: `apps/desktop/tests/sync/polling-sync.test.ts`

**Interfaces:**
- Consumes: nothing new. Independent latency fix: during boot replay the
  awaited 2 s-debounced head refresh per thin frame is what stretches the
  backlog drain (and the beeping) over minutes.
- Produces: `refreshChat(accountId, chatId, purpose, expectedMessageId)`
  resolves immediately — no tail fetch, no head refresh, no debounce wait —
  when its proof condition already holds locally. Externally observable
  contract (hub fallback callers) is unchanged: resolve = the expected
  message is durably observable locally; reject = it is not.

- [ ] Step: in the `refreshChat` implementation insert an early return before
  any network work:
  ```ts
  refreshChat(accountId, chatId, purpose, expectedMessageId) {
    return trackActive((async () => {
      // refreshChat is the AUTOMATIC/background body-read seam (hub message
      // reactions, scoped Spenders refresh). When auto-read is off, skip the
      // tail GET (which would mark the chat read) and just nudge the list;
      // listChats-driven rows stay fresh through a debounced hub activity refresh.
      const bodyReadEnabled = autoReadEnabled();
      // Replay fast-path: once the proof condition below already holds
      // locally (typical for startup catch-up frames — the first head
      // refresh advanced the cached head past the whole backlog), another
      // paid read cannot add anything; each skipped call also skips an
      // awaited 2 s debounce that would otherwise pace the SSE replay.
      if (expectedMessageId !== undefined) {
        const alreadyApplied = bodyReadEnabled
          ? data.messages.get(accountId, chatId, expectedMessageId) !== null
          : listHeadReachedExpectedMessage(accountId, chatId, expectedMessageId);
        if (alreadyApplied) {
          return;
        }
      }
      if (!bodyReadEnabled) {
      ...
  ```
  The rest of the function body stays byte-identical.
- [ ] Step: tests in `apps/desktop/tests/sync/polling-sync.test.ts` (reuse its
  fixture/factory helpers):
  1. auto-read OFF, cached chat row has `lastMessageId: '200'` →
     `refreshChat(acc, chat, undefined, '150')` resolves without issuing any
     list request and without needing timer advancement (fake timers: no
     pending 2 s debounce afterwards);
  2. auto-read OFF, cached head `'200'`, expected `'250'` → the existing
     debounced head-refresh path still runs (list request observed after
     advancing timers) — i.e. only the already-proven case short-circuits;
  3. auto-read ON, message row for `expectedMessageId` already in the DB →
     resolves without a tail fetch.
- [ ] Verify: polling-sync test file passes, including all pre-existing
  cases (especially the warm-restart/"no replay burst" ones).
- [ ] Commit: folded into Task 8's commit.

### Task 7: Desktop renderer — blip throttle

**Files:**
- Modify: `apps/desktop/src/renderer/src/lib/sound.ts`
- Test: `apps/desktop/tests/renderer/sound.test.ts` (create)

**Interfaces:**
- Produces: `playNotificationBlip(nowMs?: number)` — same call sites keep
  working (argument optional); at most one blip per 2 s window regardless of
  caller frequency. Exports `__resetBlipThrottleForTests()` for test isolation.

- [ ] Step: rewrite `apps/desktop/src/renderer/src/lib/sound.ts` as:
  ```ts
  // Tiny synthesized notification blip — no audio assets, no network.

  /** Even a legitimate live burst must not machine-gun the speaker. */
  const BLIP_MIN_INTERVAL_MS = 2_000;

  let ctx: AudioContext | null = null;
  let lastBlipAtMs = Number.NEGATIVE_INFINITY;

  export function __resetBlipThrottleForTests(): void {
    lastBlipAtMs = Number.NEGATIVE_INFINITY;
  }

  export function playNotificationBlip(nowMs: number = Date.now()): void {
    if (nowMs - lastBlipAtMs < BLIP_MIN_INTERVAL_MS) {
      return;
    }
    lastBlipAtMs = nowMs;
    try {
      ctx ??= new AudioContext();
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, t0);
      osc.frequency.exponentialRampToValueAtTime(1320, t0 + 0.08);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.06, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.2);
    } catch {
      // audio unavailable — stay silent
    }
  }
  ```
- [ ] Step: create `apps/desktop/tests/renderer/sound.test.ts`:
  ```ts
  import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
  import {
    __resetBlipThrottleForTests,
    playNotificationBlip,
  } from '../../src/renderer/src/lib/sound';

  let oscillatorStarts: number;

  class FakeGainParam {
    setValueAtTime(): void {}
    exponentialRampToValueAtTime(): void {}
  }
  class FakeNode {
    gain = new FakeGainParam();
    frequency = new FakeGainParam();
    type = '';
    connect(next: unknown): unknown {
      return next;
    }
    start(): void {
      oscillatorStarts += 1;
    }
    stop(): void {}
  }
  class FakeAudioContext {
    currentTime = 0;
    destination = new FakeNode();
    createOscillator(): FakeNode {
      return new FakeNode();
    }
    createGain(): FakeNode {
      return new FakeNode();
    }
  }

  describe('playNotificationBlip throttle', () => {
    beforeEach(() => {
      oscillatorStarts = 0;
      vi.stubGlobal('AudioContext', FakeAudioContext);
      __resetBlipThrottleForTests();
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('plays at most one blip per 2s window', () => {
      playNotificationBlip(1_000);
      playNotificationBlip(1_100);
      playNotificationBlip(2_900);
      expect(oscillatorStarts).toBe(1);
    });

    it('plays again once the window elapsed', () => {
      playNotificationBlip(1_000);
      playNotificationBlip(3_100);
      expect(oscillatorStarts).toBe(2);
    });
  });
  ```
  (If the renderer test environment lacks `AudioContext` typings for the stub,
  cast through `unknown` at the `vi.stubGlobal` call — do not loosen tsconfig.)
- [ ] Verify: the new test file passes.
- [ ] Commit: folded into Task 8's commit.

### Task 8: Desktop docs + final gate + commit

**Files:**
- Modify: `docs/decisions.md`
- (This plan file is already at `docs/plans/2026-07-22-startup-notification-flood.md` — commit it too.)

- [ ] Step: append a new decision to `docs/decisions.md` following the file's
  existing entry format (quick-ref table row + full entry). Use the next free
  number after the current last entry (D22 as of this writing → D23):
  ```
  **D23 (2026-07-22).** SSE replay never alerts: hub catch-up frames apply
  state but are stamped `live: false` and produce no toast/sound/OS
  notification. Live/replay boundary = core's v2 `stream.replay_completed`
  marker (session-sticky once seen); fallback for marker-less streams is a
  provider-start epoch minus 60 s grace over message.createdAt/occurredAt,
  fail-quiet on missing timestamps. Alerts dedup by message id (bounded 500).
  Matches the polling provider's long-standing "history is not news" baseline
  (its first sweep swallows the downtime backlog); D10 cursor semantics
  untouched — no replayed state is ever skipped.
  ```
  Add the matching one-line row to the quick-ref table at the top of the file.
- [ ] Verify: `pnpm check` at the desktop worktree root passes (typecheck +
  lint + all unit tests + build).
- [ ] Commit (desktop worktree, single commit):
  `fix(sync): suppress notifications for SSE replay backlog on startup`

---

## Self-review checklist (executor: run before finishing)

1. Coverage: symptom has two halves — spam (Tasks 2–5) and 5-minute duration
   (Task 6 + Task 7). Both must be closed; Task 1 is the exact boundary signal.
2. No behavior change for: polling-origin events (never stamped), query
   invalidation, unread badges, cursor checkpointing (marker checkpoints like
   any frame; D10 untouched), auto-read semantics (Task 6 only short-circuits
   an already-proven condition).
3. Type consistency: `live`/`occurredAt` exist only on `messageReceived`;
   `isAlertEligible` accepts any `{ live?: boolean }`; `onCaughtUp` optional
   everywhere so v1/polling-only configurations compile unchanged.
4. Old-core compatibility: without the marker, Tasks 2–7 alone must fully fix
   the reported bug via the epoch fallback (verify hub-sync.test.ts case 1–3).
