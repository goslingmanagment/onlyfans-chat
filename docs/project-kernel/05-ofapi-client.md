> **SUPERSEDED (Stage 35, 2026-07-07):** this is the Pass 1 (pre-migration)
> codebase map, kept as the migration's historical record. The regenerated
> post-migration maps live in `docs/generated/` in this repo.

# 05 — Direct OFAPI Client Subsystem

## Scope

This doc maps `apps/desktop/src/main/ofapi/*` — the hand-written HTTP client that talks to OnlyFans **through** the third-party OFAPI service (`app.onlyfansapi.com`), plus the same client re-pointed at the core hub's read-gateway. It describes **how the client is built and behaves**: request composition, auth injection, rate limiting, retry policy, error taxonomy mapping, credit accounting, pagination, response sanitization, fixture capture, the zod trust-boundary schemas, and send-outcome classification. It runs entirely in the Electron **main** process (SPEC §15: secrets/network only in main).

It deliberately does **not** re-catalog the OFAPI wire contract (every endpoint, query param, field) — that is `02-external-boundaries.md`. It does not cover who *calls* this client (the sync/read loops → `06-sync-and-reads.md`; the write path/outbox → `07-send-engine-outbox.md`; AI → `08-ai-pipeline.md`), how the client is wired at the composition root (`04-main-bootstrap-ipc-settings.md`), how credit telemetry is persisted/reported (`11-hub-monetization-activity.md`), or the shared error/schema/purpose primitives it imports from `packages/shared` (`03-shared-package.md`). Where behavior crosses those boundaries this doc cites the neighbor and states only what this subsystem does.

Every file cited is under `apps/desktop/src/main/ofapi/` unless a fuller path is given.

---

## File inventory

| File | Lines | Role |
|---|---|---|
| `client.ts` | ~997 | The client factory `createOfApiClient` + the `OfApiClient` interface. Builds every request, unwraps envelopes, parses with zod, records credits, maps errors. Owns read + Direct write methods. |
| `transport.ts` | 78 | **Not** a low-level fetch layer. A custody wrapper `createOfApiTransportClient` that delegates reads and **fails writes closed**, plus `buildHubOfApiReadBaseUrl`. |
| `rate-limiter.ts` | 273 | Token-bucket throttle + per-account/global concurrency semaphores (`createRateLimiter`) and the retry/backoff state machine (`createRequestExecutor`). |
| `errors.ts` | 233 | `OfApiError` class + `mapOfApiHttpError` / `mapOfApiNetworkError` → CG-* taxonomy; OnlyFans-wrapped-error parsing; `parseRetryAfterMs`. |
| `send-outcome.ts` | 92 | `classifySendFailure` → `definite` vs `indeterminate` for the send invariant. |
| `credit-meter.ts` | 158 | `createCreditMeter` — tallies OFAPI credits/rate-limits from headers + body `_meta`, per-purpose, per-UTC-day. |
| `pagination.ts` | 178 | Four pagination engines (`paginateNextPageUrl`, `paginateLimitOffset`, `paginateMarker`, `paginateFirstLastId`) over one core loop. |
| `sanitize.ts` | 186 | `createOfApiSanitizer` — PII scrubber for captured fixtures. |
| `schemas.ts` | 374 | zod loose schemas for all consumed OFAPI response shapes. |
| `fixture-capture.ts` | 92 | `createOfApiSanitizer`-backed debug recorder that writes sanitized request/response JSON. |
| `index.ts` | 104 | Barrel: re-exports the subsystem's public surface. |
| `ofapi.gen.ts` | 51,871 | GENERATED typed OpenAPI surface (`paths`/`operations`/`components`). Characterized only, below. |

Tests live in `apps/desktop/tests/ofapi/**` (13 files); their locked behaviors are summarized at the end.

---

## `index.ts` — public surface

Pure barrel (no logic). Re-exports the factory `createOfApiClient`, the `OfApiClient` type and all param interfaces, `OFAPI_BASE_URL` and the limit constants; the rate-limiter factories/constants/types; `classifySendFailure`/`SendFailureKind`; the four pagination engines; `createCreditMeter` and its types; the error class + mappers; `createFixtureCapture`; `createOfApiSanitizer`; and every zod schema + inferred type from `schemas.ts`. Notably it does **not** export `transport.ts` (`createOfApiTransportClient`, `buildHubOfApiReadBaseUrl`) — those are imported directly by the composition root (`apps/desktop/src/main/index.ts`).

---

## `client.ts` — the client factory

### Shape

`createOfApiClient(options: OfApiClientOptions): OfApiClient` (`client.ts:370`) is a **closure-based factory** — no class. It returns an object literal (`client.ts:635`) implementing `OfApiClient` (interface at `client.ts:297`). All shared state (baseUrl, fetch impl, timeout, credit meter, rate limiter, request executor) is captured in the closure.

**Options** (`OfApiClientOptions`, `client.ts:93`):

| Option | Default | Purpose |
|---|---|---|
| `apiKey` | — (required) | Bearer token; the OFAPI team key (Direct) or the hub chatter key (hub read gateway). |
| `baseUrl` | `OFAPI_BASE_URL` = `https://app.onlyfansapi.com/api` (`client.ts:60`) | Trailing slash stripped (`client.ts:371`). Hub read mode passes the gateway URL. |
| `authErrorCode` | `undefined` | When set to `'CG-HUB-01'`, a `401` that would map to `CG-OF-01` is re-mapped to Hub auth failure (`client.ts:531-538`). |
| `fetchImpl` | global `fetch` | Injected in tests. |
| `onMeta` / `creditMeter` | fresh meter | If a shared `creditMeter` is injected, `onMeta` is additionally subscribed (`client.ts:374-377`). |
| `rateLimiter` / `limits` | fresh `createRateLimiter` | `limits` used only when no limiter injected (`client.ts:378`). |
| `requestTimeoutMs` | `OFAPI_REQUEST_TIMEOUT_MS` = 30 000 ms (`packages/shared/src/constants.ts:56`) | Per-request abort deadline. **See discrepancy note below** — production overrides this. |
| `sleep` | real `setTimeout` | Backoff sleeper, injected for tests. |
| `fixtureCapture` | none | Debug recorder (see `fixture-capture.ts`). |
| `onError(error, {url, purpose})` | none | Fires **before** the mapped error is thrown (`client.ts:490`, `539`) so background callers that swallow the throw still leave a diagnostics record. Never alters control flow. |
| `onRequestEvent(event)` | none | Per-attempt lifecycle telemetry (queued/started/response). |

### Request pipeline (`requestJson`, `client.ts:410-543`)

Every method — read and write — funnels through the private `requestJson(spec: RequestSpec)` (spec type at `client.ts:392`). Sequence:

1. **URL build** — `buildUrl` (`client.ts:384`) concatenates `baseUrl + path`, sets query params via `URLSearchParams` (which percent-encodes, including bracket notation `filter[online]` → `filter%5Bonline%5D`), and **drops any `undefined` value** so conditional query spreads are unnecessary.
2. **Headers** (`client.ts:439`): `authorization: Bearer <apiKey>`, `accept: application/json`, and `content-type: application/json` **only** when a JSON body is present. Multipart bodies deliberately set no content-type — `fetch` adds the boundary itself (`client.ts:399-401`, `883-887`).
3. **Execute** via `executor.execute(accountKey, () => fetchImpl(url, {...}), {retry, priority, on*})` (`client.ts:446`). The fetch signal is `AbortSignal.timeout(spec.timeoutMs ?? requestTimeoutMs)` (`client.ts:457`). Body is `JSON.stringify(jsonBody)`, or `formBody()` (a `FormData` thunk), or none.
4. **Network-error branch** (`client.ts:488-492`): a thrown fetch (never produced a `Response`) → `mapOfApiNetworkError`, fired to `onError`, then rethrown.
5. **Body read** (`client.ts:494-502`): `response.text()`; empty string → `null`; else `JSON.parse`, falling back to the **raw string** on parse failure (tolerates OFAPI's HTML 405 pages).
6. **Credit recording** (`client.ts:504-509`): a loose `{_meta}` re-parse extracts body `_meta`; `creditMeter.record({headers, meta, purpose})` runs on **every** response, success or error.
7. **Fixture capture** (`client.ts:511-521`) when enabled.
8. **HTTP-error branch** (`client.ts:523-541`): non-2xx → `parseRetryAfterMs(header)` → `mapOfApiHttpError`. If status is `401`, `authErrorCode` is set, and the base mapping was `CG-OF-01`, it re-wraps to the configured hub code preserving `detail`. Fired to `onError`, then thrown.
9. Otherwise returns the parsed body (still `unknown`).

`getJson` (`client.ts:545`) is a GET convenience wrapper defaulting `retry: 'idempotent'`.

### Envelope handling (per-operation, not universal)

The header comment (`client.ts:9-11`) and `unwrapEnvelope` (`client.ts:585`) encode a real OFAPI quirk: account-scoped endpoints return `{data, _meta, _pagination}`, but `/accounts` returns a **bare array** and `/whoami` a **bare object**, and async vault upload (202) and `getUploadStatus` return **bare** objects too. Each method chooses:

- `listAccounts` (`client.ts:638`), `whoami` (`client.ts:645`), `getUploadStatus` (`client.ts:856`) parse the payload directly, no unwrap.
- Everything else calls `unwrapEnvelope` which validates `ofapiEnvelopeSchema`, returns `{data, nextPageUrl: _pagination.next_page ?? null}`.
- `uploadVaultMedia` (`client.ts:866`) tries the bare `ofapiVaultUploadStartedSchema` first (202 async), else unwraps the envelope (200 sync).

### zod at the boundary

`parseWith(schema, value, url)` (`client.ts:564`) is the single trust-gate: `safeParse`, and on failure throws `ofApiShapeError(url, prettifyError(...).slice(0,500))` → `CG-APP-01`. `parseMessageList` (`client.ts:572`) is the lenient exception — it parses an array of `unknown` and **individually** `safeParse`s each row, silently dropping malformed rows rather than failing the whole page (locked by `client.test.ts:119`).

### Operation catalog (behavior, not wire contract — see `02`)

Methods group by transport intent. Reads use `retry: 'idempotent'`; writes use `retry: 'none'` (see the send invariant note). Path helpers: `accountPath` (`client.ts:593`, prefixes `/{encodeURIComponent(accountId)}`), `chatPath` (`client.ts:597`), `messagePath` (`client.ts:601`).

**Team-level (rate-limiter key `__global__`, `client.ts:84`):**
- `listAccounts` — bare array of `ofapiAccountSchema`. Default purpose `'hydration'`.
- `whoami` — bare object.

**Chat/message reads:**
- `listChats` (`client.ts:652`) — always sends `skip_users` explicitly (default `'none'`), `order` default `'recent'`, `limit` default 50; the comment (`client.ts:660`) notes live default differs from documented default so it's always explicit. Returns `{chats, nextPageUrl}`.
- `listMessages` (`client.ts:667`) — enforces that `firstId`/`lastId` are mutually exclusive (`client.ts:668`) and direction rules: `firstId` requires `order=desc` (backward scrollback), `lastId` requires `order=asc` (boundary-inclusive tail); order auto-derives from which cursor is present (`client.ts:671`). Defaults `limit` 100, `skip_users` `'all'`. Accepts a per-call `retry` and `priority`. Returns `{messages, nextPageUrl}` via `parseMessageList` (row-tolerant).
- `getMessage` (`client.ts:693`), `getUserByUsername` (`client.ts:703`) — single-object envelope unwraps.
- `getUsersByIds` (`client.ts:710`) — mass-list credit saver: validates `1..USERS_MASS_LIST_MAX_IDS` (=10, `client.ts:61`) before fetch, joins ids with `,`, parses an id-keyed record (`ofapiUsersByIdSchema`).

**Transactions / fans / user-lists (all read-only):**
- `listTransactions` (`client.ts:725`) — marker pagination; derives `hasMore` from `hasMore ?? nextMarker != null`.
- `listFans` (`client.ts:605`, exposed as `listFansAll` → `/fans/all`, `listFansActive` → `/fans/active`): validates `limit <= FANS_LIST_MAX_LIMIT` (=20, `client.ts:62`). **Wire-format note** (`client.ts:614-628`): the online / total-spent filters are emitted as Laravel/Spatie **bracket** keys `filter[online]=1` and `filter[total_spent]=<n>`, NOT the dotted form the OpenAPI/`ofapi.gen.ts` document (Scribe doc convention); PHP `parse_str` would collapse the dotted form. Locked by `fans-active.test.ts`.
- `listUserLists` (`client.ts:756`) / `listUserListUsers` (`client.ts:768`) — OnlyMonster tier lists, **strictly read-only by construction** (no add/remove/create/delete method exists; enforced by `user-lists.test.ts:117`). `listUserListUsers` validates `limit <= USER_LIST_USERS_MAX_LIMIT` (=100). The `listUserLists` code comment (`client.ts:763`) records that the live `data` is `{list, hasMore}`, diverging from the OpenAPI example's bare array.

**Vault / media (PRD F7):**
- `listVaultMedia` (`client.ts:793`, cap 100), `listVaultLists` (`client.ts:812`), `getVaultMedia` (`client.ts:824`), `listChatMedia` (`client.ts:834`, forces `skip_users: 'all'`), `getUploadStatus` (`client.ts:856`, free/0-credit bare object).
- `uploadVaultMedia` (`client.ts:866`) — the **only Direct multipart write**. Preflights: rejects empty (`byteLength === 0`) and > `VAULT_UPLOAD_MAX_BYTES` (100 × 1 000 000 B, Cloudflare cap, `client.ts:69`). Sends exactly one `file` field (Blob) + optional `async=true`. Uses `retry: 'none'` and a longer `UPLOAD_TIMEOUT_MS` (5 min, `client.ts:81`) because large bodies outlive the default deadline. Returns a discriminated `VaultUploadOutcome` (`client.ts:293`): `{kind:'completed', media}` or `{kind:'started', prefixedId, pollingUrl}`.
- Cost helpers: `estimateUploadCredits(bytes)` (`client.ts:75`) = `ceil(MB × UPLOAD_CREDITS_PER_MB)` with `UPLOAD_CREDITS_PER_MB = 3` (`client.ts:72`).

**Write paths (SPEC §7 — `retry: 'none'`, exactly one attempt):**
- `sendMessage` (`client.ts:907`) — POST `.../messages`; JSON body conditionally includes `replyToMessageId`, `lockedText`, `price`, `mediaFiles`, `previews`. Returns `ofapiSentMessageSchema` (carries `cancelSeconds`, the live unsend countdown).
- `deleteMessage` (`client.ts:930`, DELETE, unsend), `likeMessage` (`client.ts:944`, POST `/like`), `unlikeMessage` (`client.ts:957`, DELETE `/unlike`), `startTyping` (`client.ts:970`, POST `/typing`, resolves `void`, 0 credits), `markChatRead` (`client.ts:983`, POST `/mark-as-read`).

The file header (`client.ts:1-11`) states the invariant plainly: OFAPI has no idempotency keys, so every write runs `retry:'none'` — a retried send could double-message a fan; recovery belongs to the outbox via `classifySendFailure`. In the Direct client these methods are *implemented*, but at runtime they are shadowed by `transport.ts` (below) — Direct writes are removed as a hard invariant.

### Purpose tagging & request-lifecycle events

Every param interface extends `PurposeTagged` (`client.ts:157`): a mandatory `purpose: OfApiPurpose` and optional `priority: QueuePriority`. `OfApiPurpose` is a shared union of 14 values (`packages/shared/src/activity/purposes.ts:5`: `hot-poll`, `deep-sweep`, `unread-reconcile`, `hydration`, `message-tail`, `chat-refresh`, `media`, `scan-deep-fetch`, `send`, `vault`, `spend-sweep`, `spenders`, `spenders-refresh`, `online`). It is threaded into `creditMeter.record` for per-purpose tallying and into every diagnostics event. The compiler forces exhaustive tagging at each call site.

`OfApiRequestEvent` (`client.ts:117`) is a three-phase union (`queued` → `started` (adds `queueWaitMs`) → `response` (adds `status`, `elapsedMs`, `willRetry`, optional `retryKind`/`retryDelayMs`)). `requestJson` builds a base envelope and merges phase-specific fields (`client.ts:414-437`), driven by the executor's `onAttempt*` callbacks. The composition root only forwards message-history reads to the logger (`apps/desktop/src/main/index.ts:354-395`).

---

## `transport.ts` — custody wrapper (name ≠ low-level transport)

Despite the filename, this is **not** the fetch/transport layer (that lives in `client.ts` + `rate-limiter.ts`). It is the "C6 custody bridge" (`transport.ts:29-33`):

- `createOfApiTransportClient(readClient: OfApiClient): OfApiClient` (`transport.ts:34`) returns a new `OfApiClient` that **delegates every read** straight to `readClient` (and shares its `creditMeter`), but **fails every app-level write closed before any network call**:
  - `sendMessage`/`deleteMessage`/`likeMessage`/`unlikeMessage`/`startTyping`/`markChatRead` → throw `disabledDirectWrite()` = `OfApiError('CG-HUB-02', {message:'Direct OFAPI writes are disabled. Use Agency Hub commands…'})` (`transport.ts:15`, `58-75`).
  - `uploadVaultMedia` → throw `disabledDiskUpload()` = `OfApiError('CG-OF-08', {message:'Local file upload into Vault is disabled…'})` (`transport.ts:22`, `55`).
  This is what makes the whole app Hub-write-only: the composition root wraps whatever read client it built (`apps/desktop/src/main/index.ts:447`) so the object handed to send/sync code physically cannot Direct-write. (Note: the `CG-HUB-02` registry message is the generic "Agency Hub request failed" at `packages/shared/src/errors/index.ts:193`; `transport.ts` overrides it with a write-specific message.)
- `buildHubOfApiReadBaseUrl(hubBaseUrl)` (`transport.ts:7`) normalizes a hub origin to `<base>/api/v1/ofapi/read`, appending `/api/v1` only when absent, stripping trailing slashes. Used when read transport is `'hub'`.
- `OFAPI_READ_TRANSPORTS = ['direct','hub']` / `OfApiReadTransport` (`transport.ts:4-5`) — the settings enum for read selection (Direct-vs-Hub selection logic itself lives in `06-sync-and-reads.md` / the composition root at `apps/desktop/src/main/index.ts:397-451`).

---

## `rate-limiter.ts` — throttle, concurrency gates, retry executor

Two independent constructs the client composes (`client.ts:378-382`).

### `createRateLimiter` (`rate-limiter.ts:74`)

A **token bucket** plus two layers of **counting semaphores**:

- **Token bucket** (`reserveDelayMs`, `rate-limiter.ts:87`): capacity `burst` (default `DEFAULT_BURST` = 20), refills continuously at `rpm` tokens/60 000 ms (default `DEFAULT_RPM` = 300). Each request decrements one token; a negative balance yields a computed sleep so callers queue behind each other. Deliberately kept "well under plan RPM" (`rate-limiter.ts:1-2`).
- **Concurrency semaphores** (`createSemaphore`, `rate-limiter.ts:44`): a **global** gate (`DEFAULT_GLOBAL_CONCURRENCY` = 12) and a **per-account** gate (`DEFAULT_PER_ACCOUNT_CONCURRENCY` = 4), lazily created per `accountKey` (`rate-limiter.ts:96`). The semaphore is priority-aware: `'user'` waiters jump ahead of `'normal'` waiters (`rate-limiter.ts:55-59`, released FIFO within a class at `rate-limiter.ts:63`). `release` hands the slot directly to the next waiter without decrementing `active`.
- `run(accountKey, task, priority)` (`rate-limiter.ts:106`) acquires **global → per-account** gates, then reserves a token and sleeps if needed, then runs `task`, releasing both gates in `finally`. Ordering: acquire global, then account, so a slow account can't starve the global pool asymmetrically.

`QueuePriority` is `'normal' | 'user'` (`rate-limiter.ts:37`). All limiter overrides (`rpm`, `burst`, concurrencies, `now`, `sleep`) are injectable (`RateLimiterOptions`, `rate-limiter.ts:24`).

### `createRequestExecutor` (`rate-limiter.ts:162`)

Wraps `limiter.run` with the **retry state machine**, keyed by `RetryPolicy` (`rate-limiter.ts:137`):

- **`'none'`** (`rate-limiter.ts:184-207`): exactly **one** attempt through the limiter, no retry of any kind — 429/5xx/timeouts surface immediately. Still emits queued/started/response events. This is the write-path guarantee.
- **`'idempotent'`** (`rate-limiter.ts:208-270`): an unbounded `for(;;)` loop where:
  - `429` → retries up to `RATE_LIMIT_BACKOFF_MS.length` (=4) times, sleeping `max(backoffLadder[i], min(retryAfterMs, RETRY_AFTER_CAP_MS))`. Ladder = `[1000, 2000, 4000, 8000]` (`rate-limiter.ts:20`); `retry-after` honored but capped at 60 000 ms (`rate-limiter.ts:21`).
  - `>=500` → retries up to `SERVER_ERROR_RETRY_DELAYS_MS.length` (=3) times, sleeping `[1000, 2000, 4000]` (`rate-limiter.ts:22`).
  - Any other status (incl. definitive 4xx) → returned immediately without retry.
  - Before each retry it calls `drainRetryBody` (`rate-limiter.ts:170`) — best-effort `arrayBuffer()` to free the socket, swallowing errors.
  The executor only inspects `response.status` and the `retry-after` header (`RetryableResponse`, `rate-limiter.ts:130`); it returns the final `Response` for the client to map. It does **not** map errors itself.

Retry counters are per-kind (`rateLimitRetries`, `serverErrorRetries`) so a response bouncing between 429 and 5xx does not share a budget.

---

## `errors.ts` — OFAPI failure → CG-* taxonomy

`OfApiError extends CgError` (`errors.ts:56`) adds four OFAPI-specific fields: `textHighLight` (normalized restricted-words string), `textHighLights` (raw array), `validationErrors` (422 field map), `upstreamStatus` (OnlyFans' own HTTP status when OFAPI wrapped it). CG codes are the shared registry in `packages/shared/src/errors/index.ts` (see `03`).

### `mapOfApiHttpError(input)` (`errors.ts:132`)

Parses the body with two tolerant schemas: `errorBodySchema` (`errors.ts:32`, top-level `{error,message,description,errors,textHighLight,onlyfans_response}`) and the nested `onlyfansResponseSchema` (`errors.ts:12`) for OFAPI's `ONLYFANS_COM_ERROR` wrapper. Non-JSON bodies (`safeParse` fail) leave `body` undefined and classification runs on status alone. **Decision order is load-bearing** (comment `errors.ts:131`):

| Condition | → code |
|---|---|
| status `401` | `CG-OF-01` (invalid API key) |
| status `429` | `CG-OF-03` (rate limit) |
| status `402` OR body matches `CREDITS_PHRASES` (`errors.ts:84`) | `CG-OF-04` (credits exhausted) |
| `textHighLight` present (top-level or nested) OR (status/upstream `400` and message contains "restricted words") | `CG-OF-05` (restricted words), carrying joined `textHighLight` + raw `textHighLights[]` |
| body matches `ACCOUNT_AUTH_PHRASES` (`errors.ts:94`) OR upstreamStatus `401` | `CG-OF-02` (OnlyFans account re-auth; the *account* session failed, our key is fine) |
| status `422` | `CG-APP-01` with `validationErrors` field map |
| upstreamStatus `429` | `CG-OF-03` |
| upstreamStatus `>= 500` | `CG-NET-01` |
| status `404` | `CG-APP-01`; message adds an `acct_`-prefix hint when the URL lacks that prefix (`errors.ts:194`) |
| status `>= 500` | `CG-NET-01` |
| fallthrough | `CG-APP-01` |

`buildDetail` (`errors.ts:118`) attaches `provider:'ofapi'`, `status`, `providerMessage`, a 500-char `responseSnippet`, and when a `retry-after` was parsed, `retryAfterMs` + absolute `retryAtMs`. The restricted-words highlight is explicitly best-effort: live captures put the **full message text** (no per-word markers) into the highlight array (`errors.ts:44-49`).

### `mapOfApiNetworkError(error, url)` (`errors.ts:209`)

For a thrown fetch (no `Response`): `AbortError`/`TimeoutError` → `CG-NET-02` (timeout); everything else → `CG-NET-01`. **Crucially it sets `mapped.cause = error`** (`errors.ts:222`) to preserve the undici error chain (`ENOTFOUND`/`ECONNREFUSED`/… land on `.cause`), which `classifySendFailure` walks.

### Helpers

- `parseRetryAfterMs` (`errors.ts:75`) — delta-seconds or HTTP-date → ms (non-negative), else `undefined`. Shared with the rate-limiter.
- `ofApiShapeError(url, summary)` (`errors.ts:227`) — the 2xx-body zod failure → `CG-APP-01`.

---

## `send-outcome.ts` — send classification (send invariant)

`classifySendFailure(error): 'definite' | 'indeterminate'` (`send-outcome.ts:83`) is the crux of the never-double-send guarantee (cross-ref `07-send-engine-outbox.md`; SPEC §7.4-7.5, §15.5). The outbox may mark a row `failed` (retry/edit UI) **only** on `'definite'`; `'indeterminate'` means the message may have reached the fan and must **never** be auto-retried.

Logic:
1. `httpStatusOf(error)` (`send-outcome.ts:53`) — for a wrapped `OfApiError`, **`upstreamStatus` wins** (OnlyFans' own status is the truth; the OFAPI wrapper status is just packaging); else `error.detail.status`.
2. If a status exists: `408` → `indeterminate` (request reached the server, handling unknown); `400-499` → `definite` (incl. 429, a rejection that was *not* processed); `>= 500` (incl. wrapped OnlyFans 5xx) → `indeterminate`.
3. Else `requestNeverLeft(error)` (`send-outcome.ts:64`) — walks the `.cause` chain up to depth 10 for a connection-establishment code (`CONNECT_FAILURE_CODES`: ENOTFOUND, EAI_AGAIN, ECONNREFUSED, EHOSTUNREACH, ENETUNREACH — `send-outcome.ts:14`; or a TLS handshake code / `ERR_TLS_*` — `send-outcome.ts:23-41`) → `definite` (provably never sent application bytes).
4. Everything else (timeout/abort, ECONNRESET, unknown, non-Error) → `indeterminate`. Default bias is explicitly "when in doubt, indeterminate" (`send-outcome.ts:5`). The depth bound also guards a cyclic cause chain (locked by `send-outcome.test.ts:53`).

---

## `credit-meter.ts` — OFAPI credit accounting

`createCreditMeter({onMeta?, now?})` (`credit-meter.ts:64`) is a stateful tally fed by `record(...)` on **every** response (`client.ts:505`). Sources for each metric are tried headers-first, body-`_meta` fallback (`record`, `credit-meter.ts:108-119`):

| Metric | Header | Body `_meta` fallback |
|---|---|---|
| credits used (this call) | `x-ofapi-credits-used` | `_credits.used` |
| balance | `x-ofapi-credits-balance` | `_credits.balance` |
| rpm remaining | `x-rate-limit-remaining-minute` | `_rate_limits.remaining_minute` |

Body meta is validated with a loose `responseMetaSchema` (`credit-meter.ts:10`). State: running `balance`, `rpmRemaining`, `usedToday`, and a per-purpose `Map<string, {requests, credits}>` (`byPurpose`), all scoped to a `utcDay` string. Key behaviors:

- **Skip rule** (`credit-meter.ts:123`): an **untagged** response (no `purpose`) carrying **no** telemetry emits nothing and does not reset anything (preserves legacy invisibility). A tagged response always counts as one request even if it carries zero telemetry / is a free endpoint (`credit-meter.ts:128-133`).
- **Per-purpose tally** increments `requests` always, `credits += used ?? 0`.
- **UTC day roll** (`rollDay`, `credit-meter.ts:77`): on `snapshot`/`record`/`hydrate`, if the UTC day changed, `usedToday` and `byPurpose` reset (balance/rpm persist).
- `snapshot()` (`credit-meter.ts:86`) returns `{balance, usedToday, rpmRemaining, utcDay, usedTodayByPurpose}` with **copied** tally objects (no internal leak, locked by `credit-meter.test.ts:159`).
- `hydrate(state)` (`credit-meter.ts:140`) restores same-day persisted counters only (stale days ignored); the DB layer owns persistence and rehydrates at startup (`apps/desktop/src/main/index.ts:454`; consumption → `11-hub-monetization-activity.md`).
- `subscribe`/`onMeta` fan snapshots out to listeners on every mutating `record`.

---

## `pagination.ts` — four cursor styles over one engine

`paginateEngine<T,C>` (`pagination.ts:42`) is the shared loop: fetch a page, dedupe by `idOf` (into a `Set`), stop when the `want` is satisfied (`{kind:'count', count}` or `{kind:'until', predicate}`), when `page.next === null` (exhausted), when a boundary-inclusive page yields zero **new** items (`appended === 0` → exhausted, `pagination.ts:75`), or when `maxPages` cap is hit. Enforces `interPageDelayMs` between pages (default `OFAPI_INTER_PAGE_DELAY_MS` = 300 ms, `packages/shared/src/constants.ts:55`). For `count`, over-fetched items are truncated to exactly `count` (`pagination.ts:82`). The hard page cap is mandatory (legacy deep-fetch discipline, `pagination.ts:2`).

Four public adapters map an OFAPI style onto that engine:

| Fn | Style | Cursor | Notes |
|---|---|---|---|
| `paginateNextPageUrl` (`pagination.ts:90`) | `_pagination.next_page` URL | opaque URL string | chats, messages, tracking-links |
| `paginateLimitOffset` (`pagination.ts:108`) | limit/offset | numeric offset | fans, vault, user-lists; infers `hasMore` from a full page when the flag is absent (`pagination.ts:121`) |
| `paginateMarker` (`pagination.ts:129`) | marker | numeric marker | transactions, story archive, message buyers |
| `paginateFirstLastId` (`pagination.ts:149`) | first_id/last_id | message id | `direction` `'backward'` (first_id + desc) or `'forward'` (last_id + asc); **`idOf` is required** because boundary pages repeat the cursor message — dedupe is mandatory (§6.1 delta rule). Next cursor is always the page's **last** item's id (`pagination.ts:170-175`). |

The `direction` field on `paginateFirstLastId` is destructured into `_direction` and **unused** in the engine (`pagination.ts:163`) — direction is enforced by the *caller* (in `listMessages`), not here; the field documents intent for the call site.

---

## `sanitize.ts` — PII scrubber for captured fixtures

`createOfApiSanitizer()` (`sanitize.ts:53`) returns `{sanitize(value), sanitizeApiUrl(value)}`. Structure is preserved exactly; only identifying *values* are replaced, with **stable per-instance mappings** so cross-references survive (a fan keeps the same fake id across chats/messages/user rows). Dependency-free on purpose — imported directly by `scripts/make-ofapi-fixtures.mjs` under Node type-stripping.

`walk` (`sanitize.ts:143`) recurses objects/arrays keyed on field name:

- `ID_KEYS` (`sanitize.ts:9`: id, userId, fromUserId, toUserId, queueId, replyToMessageId, subscriberId, earningId, lastReadMessageId, onlyfans_id) → stable fake numeric id via `fakeNumericId` (skips `0`).
- `acct_[0-9a-f]{32}` values → stable fake acct id (`fakeAcct`, `sanitize.ts:72`).
- `USERNAME_KEYS` → `fan###`; `NAME_KEYS` → `Fan N` (per-persona counter).
- `TEXT_KEYS` (text, tipText, lockedText, about, rawText, message, notes, description) → a fixed sample sentence, HTML-aware (`anonText`, `sanitize.ts:92`).
- `DROP_VALUE_KEYS` (website, location, wishlist, email, onlyfans_email, ip, csrf, wsUrl) → empty string.
- OFAPI URLs → `sanitizeApiUrl` (rewrites acct ids, numeric path segments, and `first_id`/`last_id`/`marker` cursor params, `sanitize.ts:116`); other `http(s)` URLs → `anonUrl` (strips to `/anonymized/sample.<ext>`, since CDN URLs embed signed policies + user ids).
- Bare strings → `scrubEmbedded` (`sanitize.ts:110`): rewrites embedded `onlyfans.com/u\d+` anchors and `<a>` link text.

---

## `fixture-capture.ts` — debug-mode response recorder

`createFixtureCapture({dir, enabled?, writeFile?, now?})` (`fixture-capture.ts:52`). When `enabled`, `record(exchange)` (`fixture-capture.ts:64`) writes one sanitized JSON file per exchange to `dir`. Details:

- A **fresh `createOfApiSanitizer` per exchange** (`fixture-capture.ts:68`) — fixtures stay self-consistent but never share a mapping across sessions.
- Auth/PII headers (`authorization`, `cookie`, `set-cookie`, `x-api-key`, `SENSITIVE_HEADERS` `fixture-capture.ts:9`) redacted to `[REDACTED]`; body (request + response) run through the sanitizer.
- Filename: `<method>_<slug>_<epochMs>.json` where `fileSlug` (`fixture-capture.ts:43`) strips the `/api/` prefix and slugifies the path.
- Disabled by default; `record` is a no-op when `enabled` is false (`fixture-capture.ts:65`). Wired from the client via `options.fixtureCapture` (`client.ts:511`). Committed fixtures live under `tests/fixtures/ofapi/`, produced by `scripts/make-ofapi-fixtures.mjs` (which reuses this same sanitizer on non-committed live probes `tmp/probe-*.json`).

---

## `schemas.ts` — zod trust-boundary schemas

All schemas are `z.looseObject` (`schemas.ts:2`) — validate only the narrow shape consumed downstream, tolerate every extra upstream field. Field shapes are annotated as verified against `docs/vendor/onlyfansapi/openapi.json` and live Phase-0 probes. Highlights the reviewer will care about:

- **Envelope**: `ofapiEnvelopeSchema` (`schemas.ts:15`) `{data:unknown, _meta?, _pagination?}`; `ofapiPaginationSchema` `{next_page?}`.
- **Team-level bare shapes**: `ofapiAccountSchema` (`schemas.ts:25`, plus `accountNeedsReauth(account)` = `is_authenticated === false`, `schemas.ts:45`), `ofapiWhoamiSchema` (`schemas.ts:49`).
- **Users/fans**: `ofapiUserSchema` (`schemas.ts:94`), `ofapiSubscribedOnDataSchema` (spend rollups, `schemas.ts:74`), `ofapiUsersByIdSchema` (id-keyed record, `schemas.ts:116`), `ofapiFansDataSchema` `{list, hasMore?}`.
- **User lists** (`schemas.ts:131-154`): documents the **live divergence** — `data` is `{list, hasMore}` not the OpenAPI example's bare array; custom list ids arrive as strings, built-ins as words, names HTML-entity-encoded; strictly read-only.
- **Chats/messages**: `ofapiChatSchema` (`schemas.ts:169`; `lastReadMessageId` may be number **or** numeric string, live divergence); `ofapiMessageSchema` (`schemas.ts:187`) **extends the shared** `ofapiChatMessageSchema` (from `@chatgoose/shared`; see `03`) with `tipText` + `fromUser`.
- **Write responses**: `ofapiSentMessageSchema` (`schemas.ts:203`, extends message with `cancelSeconds`/`queueId`), `ofapiSuccessDataSchema` `{success}` (`schemas.ts:212`), `ofapiLikeDataSchema` `{success, isLiked?}`.
- **Transactions**: `ofapiTransactionSchema` (`schemas.ts:226`) — amounts are dollars (comment `schemas.ts:227`, never mills); `ofapiTransactionsDataSchema` carries both `marker` and `nextMarker`.
- **Vault/media**: `ofapiVaultMediaSchema` (`schemas.ts:276`, files variants + `isReady`), `ofapiVaultListSchema`, `ofapiChatMediaMessageSchema`, `ofapiVaultUploadStartedSchema` (bare 202), `ofapiUploadStatusSchema` (`schemas.ts:358`, enum `pending|processing|completed|failed`).

---

## `ofapi.gen.ts` — characterization only

51,871 lines, `// GENERATED by scripts/codegen-ofapi.mjs … do not edit` (`ofapi.gen.ts:1`). It is the **typed OpenAPI surface** of OFAPI: exported `type paths`, `operations`, and `components` produced by `openapi-typescript` (`openapiTS(spec, {exportType:true})`, `scripts/codegen-ofapi.mjs:15`) from the vendored `docs/vendor/onlyfansapi/openapi.json`. Regenerated with `pnpm codegen:ofapi`; the output is **committed** so builds never depend on running codegen (`scripts/codegen-ofapi.mjs:2-3`). `client.ts` consumes it only for compile-time query-param types (e.g. `operations['listChats']['parameters']['query']` at `client.ts:86-89` derives `ChatListFilter`/`ChatListOrder`/`SkipUsers`). It is **not** used at runtime and is not the runtime validation layer — that is `schemas.ts`. Reviewers should not read it end-to-end; treat it as generated reference for wire field names/enums.

---

## Behaviors locked by tests (`apps/desktop/tests/ofapi/**`)

`helpers.ts` provides `loadFixture`, `jsonResponse`, a recording `stubFetch` (queues responses, records url/method/headers/body/form), and `instantSleep`. Fixtures under `tests/fixtures/ofapi/` are sanitized live captures.

| Test file | Locks |
|---|---|
| `client.test.ts` | envelope-vs-bare unwrap; explicit `skip_users`/order/limit defaults; auth header; `first_id`/`last_id` mutual exclusion + order derivation; **malformed rows dropped, page not rejected**; team-level bare shapes; shape-drift → `CG-APP-01`; mass-list ≤10 guard; fans limit ≤20 guard; credit telemetry from `_meta`/headers (even on errors); 401→CG-OF-01 no retry; read-gateway 401→CG-HUB-01; persistent 429 backoff→CG-OF-03; **every write = exactly one attempt on 500/429 (no sleep)**; reads GET-only. |
| `rate-limiter.test.ts` | burst-then-refill; concurrency caps (per-account 4, global 12); slot handoff; idempotent 429 ladder + retry-after cap + body drain; 5xx ≤3; definitive 4xx not retried; `'none'` = one attempt through the limiter for 5xx/429/timeout. |
| `errors.test.ts` | full status→CG-* table incl. wrapped ONLYFANS_COM_ERROR classification, restricted-words shapes, 422 validation, non-JSON/HTML bodies; `.cause` preservation; `parseRetryAfterMs`. |
| `send-outcome.test.ts` | definite vs indeterminate matrix: deep/cyclic cause chains; restricted-words 400→definite; 429→definite; 408→indeterminate; wrapped OF 5xx→indeterminate; timeout→indeterminate; numeric non-syscall `code` not mistaken. |
| `send.test.ts` | send POST body byte-for-byte; optional-field inclusion only when provided; credit telemetry; restricted-words→CG-OF-05 one attempt; timeout→CG-NET-02 one attempt; 500→CG-NET-01 no backoff; delete/like/unlike verbs+paths; typing/mark-read; HTML 405. |
| `vault.test.ts` | vault media/lists/chat-media unwrap; upload status branches; upload sync-200 multipart + async-202 bare outcome; **upload never retries**; size/empty preflight; `estimateUploadCredits`. |
| `user-lists.test.ts` | live `{list,hasMore}` shape; string/word id namespaces; limit≤100 guard; path id encoding; **no write method exists**. |
| `fans-active.test.ts` | bracket-notation `filter[online]=1` / `filter[total_spent]` wire format; omitted when unset; `listFansAll` never emits filter keys. |
| `credit-meter.test.ts` | header-vs-meta precedence; UTC-day reset; per-purpose tallies; hydrate; snapshot isolation. |
| `pagination.test.ts` | all four engines: count/until/exhaustion/page-cap/inter-page-delay; offset advance + hasMore inference; marker chaining; first/last boundary dedupe (§6.1). |
| `fixture-capture.test.ts` | sanitizer id/URL/text/anchor rules; redacted-header write; no-op when disabled; committed fixtures PII-free + structurally intact. |
| `transport.test.ts` | hub base-URL normalization; reads route to selected client, **writes fail before network**; local upload fails closed without calling Direct. |

---

## Cross-cutting notes & discrepancies

- **`transport.ts` is misnamed relative to its content.** It is a write-disabling custody bridge + hub URL builder, not the low-level transport. The actual transport layer is `requestJson` in `client.ts` plus `createRequestExecutor`/`createRateLimiter` in `rate-limiter.ts`.
- **Direct writes exist in `client.ts` but are unreachable at runtime.** The composition root always wraps the read client with `createOfApiTransportClient` (`apps/desktop/src/main/index.ts:447`), so `sendMessage`/etc. throw `CG-HUB-02` before any fetch. The `client.ts` write methods are exercised by unit tests and would only run if that wrapper were bypassed. (Writes go through the Hub command outbox — `07-send-engine-outbox.md`.)
- **The 30 s default timeout is not what production uses.** `OFAPI_REQUEST_TIMEOUT_MS` = 30 000 is the client default (`client.ts:373`), but both the Direct and Hub read clients are constructed with `requestTimeoutMs: HUB_OFAPI_READ_TIMEOUT_MS` = 75 000 ms (`apps/desktop/src/main/index.ts:81`, `402`, `431`). Multipart uploads separately use `UPLOAD_TIMEOUT_MS` = 5 min.
- **`CG-HUB-02` registry text vs. usage.** The shared registry message is generic ("Agency Hub request failed", `packages/shared/src/errors/index.ts:193`); `transport.ts:16` overrides it with a write-specific message for the disabled-Direct-write case.
- **Restricted-words highlighting is best-effort.** Live captures place the full message text (no per-word markers) into the highlight array; `errors.ts` and its extras document this (`errors.ts:44-49`).
- **Dotted-vs-bracket query divergence.** `ofapi.gen.ts`/OpenAPI document nested query params dotted (`filter.online`), but the client must emit bracket notation on the wire (`client.ts:614-628`); the generated types are documentation convention, not the wire format.
