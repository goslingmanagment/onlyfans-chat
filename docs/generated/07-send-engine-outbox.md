> Generated 2026-07-07 from docs/project-kernel/prompt-1-map.md at commit d044790.
> Machine-generated reference — regenerate by re-running that prompt in a
> fresh session; do not hand-edit.

# ChatGoose Desktop — Send Engine & Command Outbox (main/send)

The write path. Every OnlyFans write — text, PPV/media, unsend, mark-read, typing — is an
idempotent command submitted to **core's command outbox** and confirmed by polling +
verification. The direct-to-OFAPI write path is fail-closed. Two safety invariants govern
the whole subsystem: **never auto-retry an indeterminate send**, and **AI never sends
without an explicit human action**.

## `send/engine.ts` (904 lines)

### Transport (hub-command only; direct fails closed)

New outbox rows are stamped `HUB_WRITE_TRANSPORT = 'hub'` (`engine.ts:120`). The schema's
`OutboxTransport` still allows `'direct'` (`apps/desktop/src/main/db/queries/outbox.ts:14`),
but `attemptSend` **fails any `direct` row closed** → `failed` + `CG-HUB-02` "Direct OFAPI
writes are disabled…" (`engine.ts:531-548`). So the hub command outbox is the only live
write path. The engine's only read dependency on the OFAPI client is a `Pick<OfApiClient,
'listMessages'>` (`engine.ts:52`) — it touches no OFAPI write method.

### The outbox state machine

States (`send/audit.ts:62-69`): `queued`, `sending`, `sent`, `failed`, `unconfirmed`,
`cancelled`. Transitions:

- `queued → sending` via atomic `data.outbox.claimNextQueued` — **persisted BEFORE command
  intake**, `attempts+1`; a single-flight pump per chat, claimable at most once
  (`engine.ts:235-267`).
- `sending → sent` on hub `confirmed` — the confirmed message is upserted locally with
  `source:'hub-command'` (`engine.ts:269-312`).
- `sending → failed` on hub `failed_retryable | failed_terminal | cancelled`
  (`engine.ts:313-326`).
- `sending → unconfirmed` on hub `indeterminate`, on still-`queued/in_flight` after the poll
  budget, and on a transport throw that is NOT config-missing → `CG-OF-06`
  (`engine.ts:327-334,404-437`).
- transport throw when the hub is **unavailable** (config missing, or `HubError`
  auth/bad-request) → `failed` `CG-HUB-01`/`CG-HUB-02` (`engine.ts:342-345,420-437`).
- `retry` (FAILED rows only): the old row → `cancelled` (superseded), a NEW row queues with
  `retryOf` set; **`unconfirmed` rows are refused** ("verify or dismiss first" — retry could
  double-message) (`engine.ts:738-782`).
- `dismiss`: `failed|unconfirmed → cancelled`. `cancelSequence`: remaining `queued` in a
  sequence → `cancelled` (`engine.ts:784-801`).
- `reconcileOnBoot`: `queued → cancelled` (**never auto-send on boot**), `sending →
  unconfirmed` (CG-OF-06), then verify unconfirmed chats (`engine.ts:813-838`).

### How a send reaches the command outbox (exact commands)

`ensureHubCommand` builds and submits through the `@kernel/sdk` command client:
`createOfapiCommand POST /api/v1/ofapi/commands`, `getOfapiCommand GET
/api/v1/ofapi/commands/:commandId`, `cancelOfapiCommand POST …/:commandId/cancel`. The
command `kind` values (`engine.ts`; enum in the SDK routes):

- `send_text_message_v1` — payload `{text}` (`engine.ts:371-378`).
- `send_media_message_v1` — PPV/media, payload `{text, price, mediaFiles, previews}`
  (`engine.ts:356-370`).
- `unsend_message_v1` (`engine.ts:461-469`), `mark_chat_read_v1` (`engine.ts:507-516`),
  `typing_active_v1` (`engine.ts:850-860`).

`clientCommandId = row.localId` is the idempotent intake key for sends; `retryOfCommandId` is
threaded for retries (`engine.ts:346-383`). Command states read back are `queued, in_flight,
confirmed, failed_retryable, failed_terminal, indeterminate, cancelled`.

### One-attempt discipline & confirmation

- **One idempotent core command per claimed row.** After a transport failure the engine
  **never** re-submits blind — recovery repeats intake with the same id and reads status;
  only a missing-config situation is treated as "no command accepted" (`engine.ts:420-425`).
- **What confirms a send:** (1) hub command status polling — `waitForHubCommand` polls
  `getOfapiCommand` up to `HUB_COMMAND_POLL_LIMIT=60` × `HUB_COMMAND_POLL_INTERVAL_MS=500ms`
  (`engine.ts:386-399`); (2) the **verifier** (`verifyChat`) re-checks unconfirmed rows via
  hub status + a local `messages`-tail match; (3) **stream echo** — `handleSyncEvent` on a
  `messageSent` event runs a local-only `matchUnconfirmed` (no network)
  (`engine.ts:805-811`).
- **Verifier (SPEC §7.5):** `VERIFY_INTERVAL_MS=30_000`, `VERIFY_AUTO_STOP_AGE_MS=10min`,
  tail-match window `[−2min, +10min]`. A match = own message + normalized-text equality
  (+ price & media-count for media rows); each server message id is claimable by **≤1 row**
  (no cross-claiming) (`engine.ts:562-611`). Rows older than 10 min are manual-verify-only.
- **Indeterminate handling:** `CG-OF-06` rows are never auto-retried; only the verifier
  promotes them on evidence.

### Unsend / mark-read / typing / multi-part / PPV

- **Unsend:** `unsendViaHub` → `unsend_message_v1`; `confirmed` → `markDeleted`; dedup via
  `pendingHubUnsends`/`submittedHubUnsends`; failure surfaces `CG-OF-07`-class from the
  command `lastErrorCode` (`engine.ts:440-501`).
- **Mark-read:** `MARK_READ_DEBOUNCE_MS=1500`, gated on `settings.markAsReadOnOpen`;
  `mark_chat_read_v1`; on `confirmed` zeroes local unread (`engine.ts:503-529,863-886`).
- **Typing:** `TYPING_MIN_INTERVAL_MS=2500` per chat; `typing_active_v1` fire-and-forget.
- **Multi-part pacing:** `INTER_PART_DELAY_MIN/MAX_MS = 2000/5000` randomized; a failure of
  **either kind aborts the remaining sequence** (`engine.ts:251-261`).
- **PPV is always a single row** (sequences never apply). Validation runs BEFORE enqueue:
  mediaFiles non-empty, no dup, price 0 or an integer 3–200 (`PPV_PRICE_MIN/MAX`), previews ⊆
  mediaFiles (`engine.ts:689-736`).
- **Every send** first passes `messageGuard.assertAllowed` and the `gateCanSend` chat check
  (`engine.ts:194-223,667-669,708-716`). The AI dock never calls the engine on its own — a
  human insert/send action is required (see `08`, `10`).

## `send/audit.ts` (159 lines) — the send audit log

A read-only cross-check over `outbox` + `messages` for the P3 gate ("≥500 real sends, zero
lost/duplicated"). It reports: `doubleClaims` (one server id claimed by many rows — an
invariant violation / release blocker), `suspectDuplicates` (same chat + normalized text,
distinct ids, within `SUSPECT_DUPLICATE_WINDOW_MS=120_000`, not retry-linked),
`staleUnconfirmed` (unconfirmed ≥ `STALE_UNCONFIRMED_AFTER_MS=10min`),
`sentMissingFromMessages`, and a `cleanSends` headline (`audit.ts:23-159`). Surfaced via
`query:outbox.audit` in the Activity settings panel (`10`, `11`).

## Outbox persistence (cross-ref `09`)

The outbox table itself (columns, `claimNextQueued`, `setCoreCommandId`, the state CHECK
constraint, "rows kept forever — the send audit") is owned by
`apps/desktop/src/main/db/queries/outbox.ts` and described in `09-data-model-storage.md`.

## Remnant flagged

`apps/desktop/tests/live/send-live.test.ts` (env-gated `P3_LIVE_SEND=1`, not run in CI)
wires `createSendEngine` **without** a `hubCommandClient`; post-migration this makes
`sendParts` fail closed (`CG-HUB-02`) rather than actually send — a stale remnant of the
pre-kernel direct-send era.
