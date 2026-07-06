> **SUPERSEDED (Stage 35, 2026-07-07):** this is the Pass 1 (pre-migration)
> codebase map, kept as the migration's historical record. The regenerated
> post-migration maps live in `docs/generated/` in this repo.

# 07 — Send Engine & Command Outbox

## Scope

This document maps the **write path**: how outgoing actions (text messages, media/PPV, typing beacons, unsend, mark-read) leave ChatGoose Desktop. Every write is **Hub-only** — the app builds an OFAPI command and submits it to the Agency Hub "core" command outbox; the Direct (local OFAPI key) write path was removed and now fails closed. The primary files are `apps/desktop/src/main/send/engine.ts` (the send state machine + verifier), `apps/desktop/src/main/db/queries/outbox.ts` (the durable outbox table and its guarded state machine), `apps/desktop/src/main/send/audit.ts` (the read-only outbox journal auditor), and `apps/desktop/src/main/ofapi/send-outcome.ts` (the Direct send-failure classifier).

It covers the two review-critical invariants (never auto-retry an indeterminate send; AI never sends without explicit human action) and pins where each is enforced. It **defers**: the Hub command wire contract and its zod schemas to **02-external-boundaries** and **11-hub-monetization-activity** (both grounded in `packages/shared/src/hub/client.ts`, which this doc cites only for the shapes the engine emits/consumes); the Direct OFAPI HTTP client and error mapping to **05-ofapi-client**; the read/sync path and `messageSent` sync events to **06-sync-and-reads**; the encrypted SQLite schema/migrations and the `messages` table generally to **09-data-model-storage**; the message-guard runtime internals to **08-ai-pipeline**; and how the renderer renders pending sends to **10-renderer-ui**.

---

## 1. Territory at a glance

| File | Role |
|---|---|
| `apps/desktop/src/main/send/engine.ts` | The send state machine + verifier. The **only** code path that may create Hub OFAPI commands (self-declared, line 1). Builds queued outbox rows, runs a single-flight pump per chat, submits commands to core, settles them, and runs the recovery verifier. Also owns typing/mark-read/unsend (which do **not** use the outbox table). |
| `apps/desktop/src/main/db/queries/outbox.ts` | The durable `outbox` table operations: insert (always `queued`), guarded `transition`, atomic `claimNextQueued`, sequence cancellation, `claimedMessageIds` cross-claim guard, `setCoreCommandId`. Encodes the state machine as SQL with `state IN (...)` guards. |
| `apps/desktop/src/main/send/audit.ts` | Read-only post-hoc journal auditor over `outbox` + `messages`. Produces `OutboxAuditReport` (double-claims, suspect duplicates, stale-unconfirmed, sent-missing-from-messages, clean-send count). Debug-surface tooling, not part of the live send path. |
| `apps/desktop/src/main/ofapi/send-outcome.ts` | `classifySendFailure(error) → 'definite' | 'indeterminate'`. Classifies a **Direct OFAPI HTTP failure**. **Discrepancy: not consumed by the current Hub-only engine** (see §9). |

Wiring: the engine is constructed in `apps/desktop/src/main/index.ts:611` (`createSendEngine`) with `hubCommandClient: nextHub.commandClient` (`index.ts:613`); `reconcileOnBoot()` is awaited before first send (`index.ts:678`); `nextSync.subscribe(... engine.handleSyncEvent)` feeds sync events (`index.ts:658`). IPC exposure is in `apps/desktop/src/main/ipc/handlers.ts` (§3).

---

## 2. What uses the outbox vs. what does not

Only **text sends** and **media/PPV sends** are durable outbox rows. Advisory/one-shot commands go straight to core without an outbox row:

| Action | Outbox row? | Engine method | Hub command kind |
|---|---|---|---|
| Text message (single or `[NEXT]` sequence) | **Yes** | `sendParts` | `send_text_message_v1` |
| Media / PPV | **Yes** (always a single row) | `sendPpv` | `send_media_message_v1` |
| Typing beacon | No | `typingActive` | `typing_active_v1` |
| Mark chat read | No | `markRead` | `mark_chat_read_v1` |
| Unsend a message | No | `unsend` | `unsend_message_v1` |

The command-kind literals are the discriminated union in `packages/shared/src/hub/client.ts:223` (`hubOfapiCommandKindSchema`) and `:287` (`hubOfapiCommandCreateRequestSchema`).

---

## 3. Entry points (IPC → engine)

All write entry points require an engine; `requireSend()` (`handlers.ts:869`) throws "Sending is not available yet — configure Agency Hub in Settings." when `deps.send` is null.

| IPC channel | Handler | Engine call | Input schema |
|---|---|---|---|
| `cmd:send.message` | `handlers.ts:881` | `sendParts` | `sendMessageSchema` (`:237`) — `parts: string[].min(1).max(10)`, each 1–20 000 chars |
| `cmd:send.ppv` | `handlers.ts:1059` | `sendPpv` | `sendPpvSchema` (`:280`) — `price 0–200`, `mediaFiles 1–40`, `previews ≤40` |
| `cmd:send.retry` | `handlers.ts:886` | `retry` | `sendRetrySchema` (`:243`) |
| `cmd:send.dismiss` | `handlers.ts:891` | `dismiss` | `sendRowRefSchema` (`:244`) |
| `cmd:send.cancelSequence` | `handlers.ts:896` | `cancelSequence` | `sendSequenceSchema` (`:245`) |
| `cmd:send.verifyNow` | `handlers.ts:901` | `verifyChat` | `convSchema` |
| `cmd:chat.typingActive` | `handlers.ts:907` | `typingActive` (via `deps.send?.` — **silent no-op without engine**) | `convSchema` |
| `cmd:chat.markRead` | `handlers.ts:912` | `markRead` (via `deps.send?.`) | `convSchema` |
| `cmd:message.unsend` | `handlers.ts:917` | `unsend` (requires engine) | `messageRefSchema` (`:246`) |
| `query:outbox.list` | `handlers.ts:876` | `data.outbox.listForChat` → `outboxToVM` (`:298`) | `convSchema` |

`outboxToVM` (`handlers.ts:298`) is the renderer projection of an outbox row: it exposes `localId, chatId, text, transport, state, messageId, sequenceId, partIndex, errorCode, errorMessage, textHighlights, price, mediaCount (= mediaFiles.length), createdAt, updatedAt`. Note it exposes `mediaCount` but **not** the media ids themselves.

---

## 4. The outbox table (`db/queries/outbox.ts`)

### 4.1 Row shape and states

`OutboxRow` (`outbox.ts:28`) columns of interest: `state` (`OutboxState`), `transport` (`'direct' | 'hub'`), `sequenceId`, `partIndex`, `messageId` (the confirmed server id, once known), `errorCode`/`errorMessage`, `textHighlights` (CG-OF-05 restricted-word spans), `attempts`, `retryOf` (superseding lineage), `coreCommandId` (the Hub command id, once core accepts the row), and the v5 PPV payload `price` / `mediaFiles` / `previews` (`OutboxMediaId = string | number`, `outbox.ts:26`). Decoding + zod validation of the SQL row: `decodeOutboxRow` (`outbox.ts:106`), schema `outboxSqlSchema` (`outbox.ts:78`). Additive columns have back-compat defaults: `transport` defaults `'direct'` (pre-v11 rows, `:84`) and `core_command_id` defaults `null` (pre-v16, `:95`).

States (`OutboxState`, `outbox.ts:13`): `queued | sending | sent | failed | unconfirmed | cancelled`. The header comment (`outbox.ts:1-6`) declares the machine: `queued → sending → sent | failed | unconfirmed`; `queued|failed|unconfirmed → cancelled`. `'sending'` is persisted by the claim **before** any network I/O.

### 4.2 The structural single-send guarantee

The table is designed so a second POST for one row is structurally impossible:

- **Insert always enters `queued`.** `INSERT_SQL` (`outbox.ts:173`) hard-codes `state = 'queued'`, `attempts = 0`, `message_id = NULL`. Note `insertMany` defaults `transport` to `'hub'` at write time (`outbox.ts:208`) even though the column's decode default is `'direct'`.
- **`claimNextQueued` is the only gateway into `'sending'`** (`outbox.ts:321`). Inside a single `db.transaction`, it selects the oldest `queued` row **by `rowid`** (insertion order — chosen over `created_at`/`part_index` because `created_at` can collide within a tick and `part_index` cannot order across sequences, `:322-324`), then `UPDATE ... SET state='sending', attempts = attempts+1 WHERE local_id=@local_id AND state='queued'`. It returns the row only when `changes === 1`. Two concurrent claimers cannot both win the guarded UPDATE.
- **`transition` is guarded** (`outbox.ts:231`). It reads the row, returns `false` if the row is missing or its current state is not in `from`, then runs `UPDATE ... WHERE local_id=@local_id AND state IN (<from>)` and returns `false` if `changes === 0`. `message_id`/`error_code`/`error_message`/`text_highlights` are written via `COALESCE(@x, existing)` so a transition that omits them preserves prior values. **No method in this file re-queues a row** (there is no `→ queued` transition), so `attempts` never exceeds 1 for a normally-claimed row.
- **`setCoreCommandId`** (`outbox.ts:268`) writes `core_command_id = COALESCE(core_command_id, @new)` — the Hub command id is recorded once and never overwritten.

Change notifications: every mutation publishes `{ scope: 'outbox', accountId, chatId }` on the `DbChangeBus` (`outbox.ts:192` `publish`), which the renderer keys on to refetch the outbox list (see §11).

### 4.3 Sequence + verifier query helpers

- `hasQueuedInSequence` / `cancelQueuedInSequence` (`outbox.ts:352`, `:363`) — the multi-part `[NEXT]` machinery; cancellation flips only still-`queued` rows to `cancelled` and publishes per affected chat.
- `listByStateForChat` (`outbox.ts:310`) — oldest-first (`ORDER BY rowid`), the verifier's claim order.
- `claimedMessageIds` (`outbox.ts:389`) — the set of server message ids already claimed by this chat's rows; the verifier's cross-claim guard.
- `chatsWithState` (`outbox.ts:399`) — distinct chats with rows in a state, used by boot reconcile and periodic verify.

---

## 5. The send engine (`send/engine.ts`)

### 5.1 Construction and constants

`createSendEngine(options)` (`engine.ts:153`). Dependencies: `client` (only `listMessages`, `SendClient` at `:51`), optional `hubCommandClient` (`Pick<HubClient,'createOfapiCommand'|'getOfapiCommand'>`, `:55`), `data` (the `DataLayer`), `messageGuard` (`assertAllowed` only), `toMediaUrl`, `getSettings` (reads `markAsReadOnOpen`), and injectable `now`/`sleep`/`random` seams. Note: `client` is retained in the type but the current send path never calls `listMessages` — verification is done against the **local** messages table, not a fresh GET (see §6).

Tuned constants (`engine.ts:28-48`): inter-part delay randomized 2000–5000 ms; verifier cadence 30 s (`VERIFY_INTERVAL_MS`), auto-stop age 10 min (`VERIFY_AUTO_STOP_AGE_MS`); tail-match window `[createdAt−2min, createdAt+10min]`; typing min interval 2.5 s; mark-read debounce 1.5 s; hub command poll interval 500 ms × limit 60 (= up to 30 s wait per command); PPV price bounds 3–200.

In-memory state (`engine.ts:164-170`): `pumping` (single-flight per chat), `verifyTimers`, `markReadTimers`, `typingLastAt`, `pendingHubUnsends`, `submittedHubUnsends`, and a `disposed` flag.

### 5.2 Pre-enqueue gates (both fire before any row is inserted)

1. **`gateCanSend`** (`engine.ts:180`) — reads the local chat row; throws "Cannot send: unknown chat" if absent, or "Cannot send to this chat: …" when `chat.canSendMessage` is false (using `canNotSendReason`).
2. **`guardText` → `messageGuard.assertAllowed`** (`engine.ts:192`) — the Message-Guard restricted-word gate, called per part before insert; `transport` is hard-coded `HUB_WRITE_TRANSPORT` (`'hub'`). Guard internals are doc 08's territory; here it is a synchronous throw-if-blocked gate. `sendParts` runs it for **every** part before inserting any row (`engine.ts:651-653`), so a blocked part inserts nothing.

### 5.3 `sendParts` — text (`engine.ts:646`)

Requires ≥1 part. After both gates: allocates a `sequenceId` (`randomUUID`) **only when `parts.length > 1`** (else `null`), one `createdAt` shared by all parts, and one row per part with `localId = randomUUID()`, `transport = 'hub'`, ascending `partIndex`, `retryOf: null`. All rows are inserted in one `insertMany` transaction, then `kickPump`. Returns `{ localIds, sequenceId }`.

### 5.4 `sendPpv` — media/PPV (`engine.ts:672`)

**All validation precedes the insert** (an invalid PPV must never enqueue): non-empty `mediaFiles` (`:674`), no duplicate media ids (`:677`), `isValidPpvPrice` (`:680` → `isValidPpvPrice` at `:113`: `0` or integer 3–200), and `previews ⊆ mediaFiles` compared across string/number forms via `String(...)` (`:685-690`). Then `gateCanSend` + `guardText` (with `mediaCount`/`price`). Inserts **exactly one row** with `sequenceId: null` — the code comments that `[NEXT]` sequences never apply to PPV (`:708`, PRD F7). Returns `{ localId }`.

### 5.5 The pump — single-flight per chat (`kickPump`, `engine.ts:221`)

Keyed by `accountId|chatId`. If already pumping that chat, returns (a second concurrent POST for the chat cannot exist). Otherwise loops: `claimNextQueued` → `attemptSend(row)`. On a failed attempt, if the row had a `sequenceId`, `cancelQueuedInSequence` aborts the rest of the sequence (either failure kind aborts). Between successfully-sent parts of a still-populated sequence, it `sleep(interPartDelayMs())` **before** claiming the next part, so the next part stays `queued` and cancelable in the gap. The loop exits when `claimNextQueued` returns null; `finally` clears the pumping flag.

### 5.6 `attemptSend` / `attemptHubSend` — the command lifecycle (`engine.ts:526`, `:384`)

`attemptSend` routes `transport === 'hub'` rows to `attemptHubSend`; any other transport hits `failClosedDirectRow` (`engine.ts:514`) which transitions `sending → failed` with `CG-HUB-02` and the message "Direct OFAPI writes are disabled…". This is the **fail-closed Direct write path**.

`attemptHubSend`:

1. `ensureHubCommand(row)` (`engine.ts:325`) — **idempotent intake keyed on `row.localId`**. If `coreCommandId` is already set, it `getOfapiCommand` (never re-POSTs). Otherwise it builds the request (`send_media_message_v1` when `mediaFiles.length > 0`, else `send_text_message_v1`) with `clientCommandId: row.localId`, then `createOfapiCommand`, then records the returned id via `setCoreCommandId`. Retry lineage: if `row.retryOf` points to a prior `hub` row, its `coreCommandId` is passed as `retryOfCommandId` (`:332-338`).
2. `waitForHubCommand(command)` (`engine.ts:369`) — polls `getOfapiCommand` up to `hubCommandPollLimit` times at `hubCommandPollIntervalMs`, returning as soon as `state` leaves `queued`/`in_flight`.
3. If still `queued`/`in_flight` after polling: `sending → unconfirmed` with `CG-OF-06` and schedule verify (returns `false`).
4. Otherwise `settleHubCommand(row, command)` (see §5.7); if the result was not sent **and** the state was `indeterminate`, schedule verify.
5. **`catch`** (`engine.ts:403`): classifies via `isHubWriteUnavailable` (`:133` — a `HubError` with reason `auth`/`bad-request`, or the local `CG-HUB-02` "transport required" sentinel). If **unavailable** (no command could have been accepted): `sending → failed`. Otherwise (transport failed but core may have accepted): `sending → unconfirmed` + schedule verify. The comment (`:405-408`) states the reasoning: intake is idempotent, a transport failure may have landed after core accepted, so it must **never** fall back to Direct — recovery repeats intake with the same id and reads status.

### 5.7 `settleHubCommand` — mapping Hub state → outbox state (`engine.ts:285`)

The Hub command's own `state` (the 7-value enum `HUB_OFAPI_COMMAND_STATES`, `client.ts:211`) drives the outbox outcome:

| Hub command `state` | Outbox transition | Returns | Notes |
|---|---|---|---|
| `confirmed` | `['sending','unconfirmed'] → sent` (with `messageId = platformMessageId`) | `true` | Also projects the confirmed message row (§10). Throws if `platformMessageId === null` (`:256`). |
| `failed_retryable` / `failed_terminal` / `cancelled` | `['sending','unconfirmed'] → failed` (`errorCode = lastErrorCode ?? 'CG-APP-01'`) | `false` | `cancelled` gets a distinct message. **Note:** despite the `_retryable` label, the engine treats it as a terminal `failed` outcome — recovery is a *new row* via `retry()`, never an auto re-attempt. |
| `indeterminate` | `['sending'] → unconfirmed` (`CG-OF-06`) | `false` | The verifier owns recovery. |
| `queued` / `in_flight` | no transition | `false` | Still pending. |

### 5.8 `retry`, `dismiss`, `cancelSequence`

- **`retry`** (`engine.ts:721`) — **failed rows only**. Explicitly **rejects `unconfirmed`** rows with "verify or dismiss it first" (`:726-729`) — the comment ties this to SPEC §15.5 (a retry could double-message the fan). It re-runs `gateCanSend` + `guardText`, transitions the old row `failed → cancelled` (superseded), and inserts a **new** row with a fresh `localId`, `retryOf = <old localId>`, `sequenceId: null`, carrying the PPV payload over unchanged (only the caption `text` is editable). The message-guard runs **before** the old row is cancelled (locked by test `engine.test.ts:548`).
- **`dismiss`** (`engine.ts:767`) — transitions `['failed','unconfirmed'] → cancelled`; throws if the row is in any other state.
- **`cancelSequence`** (`engine.ts:782`) — delegates to `cancelQueuedInSequence` (only still-`queued` parts flip; an in-flight part finishes its own course).

### 5.9 `reconcileOnBoot` (`engine.ts:796`) — the never-auto-send-on-restart guarantee

Runs (awaited) before the app accepts sends (`index.ts:678`). Steps: (1) every `queued` row → `cancelled` (a restart kills pending sequences; the app never auto-sends on boot); (2) every `sending` row → `unconfirmed` with `CG-OF-06` "The app restarted while this send was in flight" (the outcome is unknowable → verification, not resend); (3) for each chat with `unconfirmed` rows, `verifyChat`, and if any remain, `scheduleVerify`. All network errors are swallowed internally.

---

## 6. The verifier (recovery without resending)

The verifier is how indeterminate/unconfirmed rows resolve — it **only promotes on evidence, never resends**.

- **`verifyChat`** (`engine.ts:596`) — for the chat's `unconfirmed` rows: for each **hub** row, `ensureHubCommand` (idempotent — re-reads or repeats intake with the same id) + `settleHubCommand`; a throw is swallowed (the periodic pass retries). Then `matchUnconfirmed` runs a local-evidence pass.
- **`matchUnconfirmed`** (`engine.ts:570`) — reads the chat's `unconfirmed` rows and the last 100 **local** messages filtered to `isSentByMe && !deleted`. For each row it finds the first candidate that is **not already claimed** (`claimedMessageIds` + an in-pass `claimed` set) and satisfies `rowMatchesCandidate`; on a match it adds the id to `claimed` and transitions `unconfirmed → sent` with that `messageId`. **No message id can be claimed by two rows** (cross-claim guard).
- **`rowMatchesCandidate`** (`engine.ts:545`) — (a) candidate server timestamp must fall inside `[row.createdAt−2min, row.createdAt+10min]`; (b) `normalizeForMatch(candidate.textPlain) === normalizeForMatch(row.text)` (trim + collapse inner whitespace, `:108`); (c) for media rows additionally `candidate.price === row.price && candidate.media.length === row.mediaFiles.length` — this pins price + media count so a caption-less twin or a plain-text message with identical wording cannot be cross-claimed (locked by `engine-ppv.test.ts:396`, `:408`, `:423`).
- **`handleSyncEvent`** (`engine.ts:788`) — on a `messageSent` sync event (sync already upserted the message), it runs `matchUnconfirmed` locally with **no extra network**. Subscribed at `index.ts:658`. (Sync event production is doc 06.)
- **Scheduling** (`scheduleVerify`, `engine.ts:619`; `hasAutoVerifiableRows`, `:613`) — one 30 s timer per chat; the callback bails if no `unconfirmed` row is younger than 10 min (`VERIFY_AUTO_STOP_AGE_MS`), otherwise `verifyChat` and reschedule if rows remain. `verifyChat` is also directly callable by the user via `cmd:send.verifyNow`, which bypasses the auto-stop age.

---

## 7. Invariant #1 — never auto-retry an indeterminate send

Enforced structurally in several layers; the reviewer should treat these as the binding sites:

1. **The outbox has no re-queue transition** (`db/queries/outbox.ts`). The only gateway into `sending` is `claimNextQueued`, which claims a `queued` row exactly once. Nothing sets a row back to `queued`. Therefore a row is POSTed at most once per stable `localId`/`clientCommandId`.
2. **Indeterminate outcomes park as `unconfirmed`, never re-attempt** (`engine.ts:310-318`, `:387-396`, `:409-419`). `unconfirmed` rows are only advanced by the **verifier** on evidence (Hub command status or a local message match), which promotes to `sent` or `failed` but issues **no new send**.
3. **`retry()` refuses `unconfirmed` rows** (`engine.ts:726-729`) — the human cannot retry an indeterminate send; they must verify or dismiss. `retry()` accepts only `failed` rows and, when it proceeds, cancels the old row and creates a **new** row (new id) — so even the "retry" of a definite failure is a distinct command, never a second attempt on the same row.
4. **Idempotent intake on transport failure** (`attemptHubSend` catch, `engine.ts:403-419`): a mid-flight transport error goes to `unconfirmed` (not `failed`, not resend) unless Hub is provably unconfigured, because the command may already have been accepted; recovery repeats intake with the **same** `clientCommandId` and reads status. The `deduplicated` flag on the Hub command response (`client.ts:344`) is how core signals a repeated intake.
5. **The classifier** `classifySendFailure` (`ofapi/send-outcome.ts:83`) encodes the definite/indeterminate rule ("when in doubt: indeterminate"): `definite` only for a request that provably never left (connection-establishment/TLS codes, `:14-41`, `:64-72`) or a definitive 4xx-except-408 HTTP response (`:83-92`); timeouts/abort/`ECONNRESET`/5xx/wrapped-OF-5xx/unknown → `indeterminate`. **See §9 for the discrepancy that this is not wired into the Hub engine.**

The `send/audit.ts` auditor exists to *detect a violation of this invariant after the fact*: `doubleClaims` (two rows → one server id, `audit.ts:83`) is called an invariant violation and release blocker; `suspectDuplicates` (`audit.ts:100`) is the classic double-send shape.

---

## 8. Invariant #2 — AI never sends without explicit human action

**Enforcement is architectural (by absence of a code path), not a runtime check inside the engine.** The engine's write entry points (`sendParts`, `sendPpv`, `retry`) are reachable **only** through the IPC channels `cmd:send.message` / `cmd:send.ppv` / `cmd:send.retry` (`handlers.ts:881`, `:1059`, `:886`), which are invoked from explicit renderer user actions. Verified: the AI subsystem under `apps/desktop/src/main/ai/` contains **no reference** to `sendParts`, `sendPpv`, or the `SendEngine` type (grep returns only an unrelated comment in `ai/index.ts`). The AI coordinator produces draft/streamed text into the composer; it has no handle to the send engine. There is no auto-send timer, no "send on generation complete" path. The message-guard gate (`assertAllowed`) additionally sits on every send, but that is a restricted-word gate, not the human-action gate. So the invariant holds because the only way to enqueue a command is a human-triggered IPC call — the reviewer should confirm no future coupling is introduced between `main/ai/*` and the engine.

---

## 9. `ofapi/send-outcome.ts` and its discrepancy

`classifySendFailure` (`send-outcome.ts:83`) is a fully-tested (`tests/ofapi/send-outcome.test.ts`) pure classifier for **Direct OFAPI HTTP send failures**. Its header comment still frames it as "The outbox engine may mark a row 'failed' … ONLY on a 'definite' failure."

**Actual behavior:** the current Hub-only engine (`send/engine.ts`) does **not import or call** `classifySendFailure`. Verified by grep — the only references are the re-export in `ofapi/index.ts:44` and comments in `ofapi/client.ts`/`errors.ts`. In the Hub path the definite-vs-indeterminate decision is made **server-side by core** and delivered as the Hub command `state` enum, which `settleHubCommand` maps directly (§5.7). The classifier's logic is thus preserved and tested but dormant on the live write path; it would only re-activate if a Direct write path were restored (which `failClosedDirectRow` currently blocks). The reviewer should read `send-outcome.ts` as *the specification of the classification the server is now expected to perform*, not as code the engine executes.

---

## 10. Confirmation reconciliation against synced messages (commit b1dd980)

When a Hub command confirms, the engine both marks the outbox row `sent` and **projects a message row** so the sent message shows immediately even before sync ingests it — but it must not clobber an already-enriched row.

- `upsertHubConfirmedMessage` (`engine.ts:255`) builds a **synthetic** message row from the outbox row + command: `messageId = command.platformMessageId`, `createdAt = command.attemptFinishedAt ?? command.updatedAt`, `isSentByMe: true`, `textHtml`/`textPlain = row.text`, `price = row.price`, empty `media`, `raw = { source: 'hub-command', commandId }`. This stub has **no media URLs, no `isOpened`, no rich fields**.
- Commit **b1dd980** ("Preserve enriched Hub messages on command confirmation") switched this call from `upsertMany` to **`insertManyIfAbsent`** (`engine.ts:259`; the one-line engine change plus the new DB helper). `insertManyIfAbsent` (`db/queries/messages.ts:145`, SQL `INSERT_IF_ABSENT_SQL` at `:43`, `ON CONFLICT … DO NOTHING`) inserts the stub only when the row is absent, and returns the count actually inserted. This prevents the synthetic hub-command stub from downgrading an authoritative row already ingested from Hub SSE / sync (e.g. the enriched `messageSent` row arriving **before** command confirmation — the regression the commit locks, `tests/send/engine-hub.test.ts:107`).
- The outbox row is still transitioned to `sent` with the real `platformMessageId` regardless of whether the stub was inserted (`engine.ts:289-294`) — so the row is reconciled even when the message row already existed.
- Contrast with the general sync path, which uses `upsertMany` (`messages.ts:115`, `ON CONFLICT … DO UPDATE`); its `deleted` column is merged monotonically (`deleted = (messages.deleted OR excluded.deleted)`, `:40`) so a re-upsert cannot un-delete a tombstone. Full `messages` table semantics are doc 09.

---

## 11. Optimistic/local echo and how the renderer shows pending sends

There is **no synthetic "pending" message row**. The optimistic echo *is the outbox row itself*:

- The engine inserts `queued` rows immediately (before any network), and every state change publishes `{ scope: 'outbox', accountId, chatId }` (`outbox.ts:192`).
- The renderer reads pending sends via `query:outbox.list` → `outboxToVM` (`handlers.ts:876`, `:298`), keyed as `['outbox', accountId, chatId]` (`renderer/src/bridge/queries.ts:50`, `:200`), and refetches on the `outbox` db-change scope (`renderer/src/bridge/dbInvalidation.ts:59`). Pending rows are merged into the thread as `{ kind: 'outbox' }` items (`renderer/src/features/conversation/sendLogic.ts:197`, `renderer/src/features/conversation/Thread.tsx:367`).
- A real `messages`-table row for the outgoing message appears only on **confirmation** (`upsertHubConfirmedMessage`, §10) or when sync ingests it. Renderer rendering of these states is doc 10's territory.

`markRead`'s local echo is separate: on a confirmed `mark_chat_read_v1`, `zeroUnread` (`engine.ts:504`) directly updates the `chats` row (`unread_count = 0, has_unread_tips = 0`) and publishes `{ scope: 'chats' }`.

---

## 12. Non-outbox commands (typing, mark-read, unsend)

These bypass the outbox table and call `hubCommandClient.createOfapiCommand` directly.

- **`typingActive`** (`engine.ts:823`) — throttled to `TYPING_MIN_INTERVAL_MS` (2.5 s) per chat via `typingLastAt`. Fire-and-forget: if `hubCommandClient` is undefined it returns silently; otherwise it posts `typing_active_v1` and swallows all errors (`.catch(() => undefined)`). No confirmation, no retry.
- **`markRead`** (`engine.ts:846`) — gated on `getSettings().markAsReadOnOpen` and `!disposed`. Debounced `MARK_READ_DEBOUNCE_MS` (1.5 s) per chat (rapid re-opens collapse into one call). On fire, `markReadViaHub` (`:486`) posts `mark_chat_read_v1` and awaits confirmation; **only on `state === 'confirmed'`** does it `zeroUnread`. Lossy on failure — "the next conversation open retries" (`:866`). Note `markReadViaHub` returns `false` (no-op) when `hubCommandClient` is undefined.
- **`unsend`** (`engine.ts:871` → `unsendViaHub`, `:423`) — requires `hubCommandClient` (throws `hubWriteUnavailable` / `CG-HUB-02` otherwise). Dedup uses two structures keyed `accountId|chatId|messageId`: `pendingHubUnsends` (in-flight promise, so duplicate clicks await the same task) and `submittedHubUnsends` (a marker that suppresses re-submission while pending). Early-returns if the local message is already `deleted`. Posts `unsend_message_v1` with a fresh `randomUUID` clientCommandId and awaits: on `confirmed` → `markDeleted` (tombstone) + clear marker; on `queued`/`in_flight`/`indeterminate` → returns leaving the message **visible** and the marker set (the message is tombstoned only after confirmation); on `failed_*`/`cancelled` → clears the marker and throws. Locked by `engine-hub.test.ts:336`, `:376`.

Because typing/mark-read/unsend are not outbox rows, they are **not** covered by the boot reconcile, the verifier, or the audit — they are best-effort one-shots (unsend additionally guarded by its dedup maps within a single process lifetime).

---

## 13. Wire contract to core (cross-ref 02 / 11)

The engine's only sink is `hubCommandClient` = `Pick<HubClient, 'createOfapiCommand' | 'getOfapiCommand'>` (the concrete client is `packages/shared/src/hub/client.ts`, owned by 02/11). Key shapes the engine relies on:

- **Request** `HubOfapiCommandCreateRequest` (`client.ts:287`) — discriminated on `kind`; `clientCommandId` must be a UUID (`client.ts:232`) — the engine supplies `row.localId` for outbox sends and `randomUUID()` for typing/mark-read/unsend. `accountId` must match `/^acct_…/` and `conversationId` `/^[0-9]{1,30}$/`. The media payload schema (`client.ts:246`) re-validates `price ∈ {0}∪[3,200]`, `mediaFiles 1–50`, `previews ⊆ mediaFiles` — i.e. core independently re-checks the same PPV invariants the engine enforces pre-enqueue.
- **Response** `HubOfapiCommand` (`client.ts:347`) — the engine consumes `commandId`, `state`, `platformMessageId`, `attemptFinishedAt`, `updatedAt`, `lastErrorCode`, and (implicitly, via idempotent re-intake) `deduplicated`. The response schema **rejects any `payload` field** (`client.ts:350-358`) — command payloads never round-trip back.
- `createOfapiCommand`/`getOfapiCommand`/`cancelOfapiCommand` all POST/GET `/api/v1/ofapi/commands[/…]` with a 10 s timeout (`client.ts:825`, `:842`, `:858`; `HUB_OFAPI_COMMAND_TIMEOUT_MS = 10_000` at `:32`). **Note:** the engine never calls `cancelOfapiCommand` — cancellation is local-only (`cancelQueuedInSequence` flips still-`queued` rows before they are ever POSTed); an already-submitted command is not remotely cancelled by the engine.
- `HubError` reasons (`client.ts:104`) map to the engine's fail-closed classification: `auth`/`bad-request` ⇒ `isHubWriteUnavailable` ⇒ `failed`; everything else ⇒ `unconfirmed` (`engine.ts:133-142`, `:404-419`).

---

## 14. Locked behaviors (from `tests/send/**`)

The reviewer can treat these as pinned contracts (test file : intent):

- `engine.test.ts:132` — sending row (attempts=1) persisted **before** the POST, then sent + message projection.
- `engine.test.ts:177`, `:193` — a guard block prevents any outbox row *or* Hub command; sequence parts are guard-validated atomically (all-or-nothing).
- `engine.test.ts:232` — indeterminate (timeout) → `unconfirmed` + `CG-OF-06` and **exactly one** send call ever.
- `engine.test.ts:257`, `:273`, `:294` — verifier promotes on normalized-text + time-window; refuses cross-claiming (one candidate → one row, oldest first); leaves no-match rows `unconfirmed`.
- `engine.test.ts:334` — periodic auto-verify every 30 s, stops for rows >10 min.
- `engine.test.ts:364`, `:403` — boot: `sending→unconfirmed→verified`, `queued→cancelled`, a late success cannot clobber; unverifiable `sending` stays `unconfirmed` with `CG-OF-06`.
- `engine.test.ts:423`, `:450`, `:474`, `:489` — 3-part sequence FIFO with randomized 2–5 s delays; sequence aborts on the first failure (either kind); `cancelSequence` between parts cancels queued, in-flight finishes.
- `engine.test.ts:517`, `:548`, `:573` — retry from `failed` supersedes via `retry_of`; guard runs before cancelling the old row; retry of an `unconfirmed` row is rejected.
- `engine-hub.test.ts:59`, `:420`, `:459`, `:492`, `:543` — hub intake/status without a Direct client; ambiguous intake recovered by repeating the same client id **without a body read**; fail-closed when Hub transport is unconfigured; retry lineage via `retryOfCommandId` with a new local/client id; a pre-intake auth failure retried as fresh lineage without re-posting the original.
- `engine-hub.test.ts:107` — the b1dd980 regression: a confirmation does not downgrade an enriched `messageSent` row.
- `engine-ppv.test.ts:144`, `:198`, `:274`, `:289`, `:356`, `:408` — invalid PPV inserts nothing; exactly one row (no sequence); indeterminate PPV never auto-retried; retry carries the payload over (caption editable); caption-less rows match on empty text + price + media count; two caption-less twins claim distinct messages.
- `outbox-queries.test.ts:90`, `:103`, `:113`, `:178` — `claimNextQueued` claims the oldest exactly once; `core_command_id` recorded once; guarded transitions no-op on wrong `from`; `claimedMessageIds` collects the cross-claim guard set.
- `audit.test.ts:91`, `:99`, `:117`, `:137` — double-claim flagging, suspect-duplicate window/normalization, retry-chain exclusion, stale-unconfirmed listing.

---

## 15. Discrepancies & ambiguities (actual vs. named/documented)

1. **`send-outcome.ts` is dormant on the live path** — its header says "the outbox engine may mark a row failed … ONLY on a definite failure," but the Hub-only engine never calls `classifySendFailure`; core makes that call and the engine consumes the resulting command `state`. See §9.
2. **`failed_retryable` is treated as terminal** — `settleHubCommand` maps `failed_retryable` to the outbox `failed` state identically to `failed_terminal` (`engine.ts:296-309`). The name implies a retry, but the engine never auto-retries it; recovery is a human `retry()` producing a new row.
3. **The engine's `client` (`listMessages`) is unused for verification** — the type still carries `SendClient`, and older comments reference "GET /messages," but `verifyChat`/`matchUnconfirmed` match against the **local** messages table only (no fresh network GET). Hub reads populate that table (doc 06).
4. **`transport` decode default vs. insert default** — `decodeOutboxRow` defaults a missing `transport` column to `'direct'` (`outbox.ts:84`), but `insertMany` writes `'hub'` when the caller omits it (`outbox.ts:208`), and the engine always passes `'hub'`. New rows are therefore always `'hub'`; only legacy/foreign rows could decode as `'direct'`, and those fail closed at send time.
5. **`cancelOfapiCommand` exists in the client but is never called by the engine** — sequence cancellation is purely local (pre-POST). An already-submitted command cannot be remotely cancelled through this subsystem.
6. **`dismiss` on an `unconfirmed` row is a local giving-up, not a remote cancel** — it flips the row to `cancelled` but does nothing to any Hub command already in flight; the message may still have been / may still be delivered (consistent with `CG-OF-06` recovery text). This is by design but worth flagging as a place where local state and server state can legitimately diverge.
