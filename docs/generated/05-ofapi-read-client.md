> Generated 2026-07-07 from docs/project-kernel/prompt-1-map.md at commit d044790.
> Machine-generated reference — regenerate by re-running that prompt in a
> fresh session; do not hand-edit.

# ChatGoose Desktop — OFAPI Read Client (main/ofapi)

This map documents `apps/desktop/src/main/ofapi/` as it exists post-kernel-migration.
The directory is byte-identical between the banner commit `d044790` and the current
checkout (the `apps/desktop/src/main/ofapi` tree shows an empty diff-stat across that
range), so every `path:line` anchor below is valid for `d044790`.

## What this module is now (the one fact that overrides the file names)

Despite names, comments, and constants that still speak of a "direct OFAPI client"
talking to `app.onlyfansapi.com`, in production this module is a **read-only shell in
front of the Agency Hub read-gateway**. It never opens a socket to onlyfansapi.com.

- The composition root (`apps/desktop/src/main/index.ts:427-435`) constructs the
  client with `baseUrl: buildHubOfApiReadBaseUrl(initialSettings.hubBaseUrl)`
  (`apps/desktop/src/main/ofapi/transport.ts:8-14`), which resolves to core's
  `…/api/v1/ofapi/read` gateway — NOT the OFAPI base. `OFAPI_BASE_URL =
  'https://app.onlyfansapi.com/api'` (`client.ts:60`) is still exported but is only
  the default when no `baseUrl` is supplied; the desktop always supplies the hub URL,
  so the constant is dead in production.
- The read client is then wrapped by `createOfApiTransportClient(readClient)`
  (`transport.ts:35-78`, wired at `index.ts:436`). The wrapper forwards every READ
  method to `readClient` and replaces every WRITE method with a fail-closed stub
  (see "The custody bridge" below). The wrapped instance (`nextClient`) is what the
  rest of the app receives.
- The read-transport enum collapsed to a single literal: `export type
  OfApiReadTransport = 'hub'` (`transport.ts:6`; comment at `transport.ts:4-5`
  records that the direct branch "died with the direct branch" under Stage 24 / DP 8).
- Auth: reads carry a hub **chatter key**, so a 401 is re-tagged `CG-HUB-01` rather
  than the OFAPI `CG-OF-01` (`index.ts:430` passes `authErrorCode: 'CG-HUB-01'`;
  the re-tag happens in `client.ts:531-538`).
- Request deadline: reads use `HUB_OFAPI_READ_TIMEOUT_MS = 75_000`
  (`index.ts:86`, passed at `index.ts:431`) — 75 s, deliberately longer than the
  OFAPI default `OFAPI_REQUEST_TIMEOUT_MS = 30_000`
  (`packages/shared/src/constants.ts:56`), which is the fallback when no override is
  given (`client.ts:373`).
- When the hub base URL or chatter key is missing, no client is built at all: the
  wiring logs `hub read transport not configured` and either throws (if a runtime was
  already active) or returns; break-glass reads during a kernel outage fall back to the
  local SQLite cache, not a direct call (`index.ts:408-426`).

The gateway's wire contract (paths, the `…/ofapi/read` prefix, how the hub proxies to
OFAPI) is owned by `01-external-boundaries.md`; this map only documents the desktop
client that consumes it.

## transport.ts — the custody bridge (load-bearing)

`transport.ts` is the C6 custody bridge. Two responsibilities:

1. **Base-URL builder** `buildHubOfApiReadBaseUrl(hubBaseUrl)` (`transport.ts:8-14`):
   trims trailing slashes; if the hub base already ends in `/api/v1` it appends
   `/ofapi/read`, otherwise it appends `/api/v1/ofapi/read`.

2. **Write-fail-closed wrapper** `createOfApiTransportClient(readClient)`
   (`transport.ts:35-78`): returns a new `OfApiClient` whose read methods delegate
   verbatim to `readClient` (`transport.ts:38-54`), and whose write methods throw
   before any network call:
   - `uploadVaultMedia` → `disabledDiskUpload()` = `OfApiError('CG-OF-08', …)` with
     message "Local file upload into Vault is disabled in ChatGoose Desktop"
     (`transport.ts:23-28, 56-58`). (Note: the shared registry's canonical `CG-OF-08`
     message is "Media is still processing or unavailable",
     `packages/shared/src/errors/index.ts:184-187`; the transport supplies its own
     override message on the thrown instance.)
   - `sendMessage`, `deleteMessage`, `likeMessage`, `unlikeMessage`, `startTyping`,
     `markChatRead` → `disabledDirectWrite()` = `OfApiError('CG-HUB-02', …)` with
     message "Direct OFAPI writes are disabled. Use Agency Hub commands for OnlyFans
     writes" (`transport.ts:16-21, 59-77`).
   - `creditMeter` is passed straight through (`transport.ts:37`).

   Consequence: the underlying `client.ts` write implementations
   (`client.ts:866-994`) are never reached in the desktop — every OnlyFans write flows
   through the Hub command outbox instead (see `07-send-engine-outbox.md`).

## client.ts — createOfApiClient (the read request engine)

`createOfApiClient(options)` (`client.ts:370-996`) builds one HTTP client. Even though
only its read methods run in production (writes are shadowed by the transport wrapper),
the file still defines the full method surface and the request machinery.

### Options (`OfApiClientOptions`, `client.ts:93-115`)
- `apiKey` — sent as `authorization: Bearer <apiKey>` on every request
  (`client.ts:440`). In production this is the hub chatter key.
- `baseUrl` — defaults to `OFAPI_BASE_URL` (`client.ts:371`); production passes the hub
  read-gateway URL.
- `authErrorCode?: 'CG-OF-01' | 'CG-HUB-01'` — which code a 401 becomes; production
  passes `CG-HUB-01`.
- `fetchImpl?` — injectable `fetch` (tests).
- `onMeta` / `creditMeter` — credit telemetry sink (see credit-meter.ts). If a
  `creditMeter` is injected AND `onMeta` given, the meter is also `subscribe`d
  (`client.ts:374-377`).
- `rateLimiter` / `limits` — throttle (see rate-limiter.ts).
- `requestTimeoutMs?` — per-request deadline (`AbortSignal.timeout`, `client.ts:457`).
- `sleep?` — backoff sleep (injectable).
- `fixtureCapture?` — optional debug capture (see fixture-capture.ts). NOT wired in
  production; the only reference is `client.ts:511-521`.
- `onError(error, {url, purpose})` — fired just BEFORE any mapped error is thrown, for
  the diagnostics log, on both network failures (`client.ts:490`) and non-2xx
  (`client.ts:539`); never alters control flow.
- `onRequestEvent(event)` — lifecycle telemetry (queued/started/response), consumed by
  the diagnostics log (`index.ts:400-405`).

### Request composition (`requestJson`, `client.ts:410-543`)
- `buildUrl` (`client.ts:384-390`) joins `baseUrl + path` and sets query params
  verbatim via `URLSearchParams` (drops `undefined`, `String()`-coerces the rest).
  Note callers deliberately pass Laravel/Spatie bracket keys like `filter[online]`
  (`client.ts:627-628`) — the OpenAPI/`ofapi.gen.ts` dotted form is Scribe doc
  convention, not the wire format (`client.ts:617-626`).
- Headers: `authorization: Bearer …`, `accept: application/json`, plus
  `content-type: application/json` only when a JSON body is present (`client.ts:439-443`).
- Body: exactly one of `jsonBody` (POST JSON) or `formBody()` (multipart FormData —
  vault upload; content-type/boundary set by fetch itself) (`client.ts:398-407, 452-456`).
- The fetch is run through `executor.execute(accountKey, doFetch, {retry, priority,
  onAttempt*})` (`client.ts:446-487`) — the rate-limiter/retry loop.
- Thrown fetch errors → `mapOfApiNetworkError` (`client.ts:488-492`).
- Response body is read as text then `JSON.parse`d, falling back to raw text
  (`client.ts:494-502`).
- **Credit metering runs on EVERY response** (2xx or not): it loose-parses a top-level
  `_meta` off the body and calls `creditMeter.record({headers, meta, purpose})`
  (`client.ts:504-509`).
- Optional fixture capture on every response when enabled (`client.ts:511-521`).
- Non-2xx → `mapOfApiHttpError` (`client.ts:523-541`), with the 401→`authErrorCode`
  re-tag applied only when the mapped code is `CG-OF-01` (`client.ts:531-538`).

### Parse discipline
- `parseWith(schema, value, url)` (`client.ts:564-570`) safe-parses; on failure throws
  `ofApiShapeError` with a 500-char `z.prettifyError` summary.
- `parseMessageList` (`client.ts:572-582`) parses row-by-row and **silently drops**
  rows that fail `ofapiMessageSchema` (best-effort transcript ingest).
- `unwrapEnvelope` (`client.ts:585-591`) validates the `{data,_meta,_pagination}`
  envelope and returns `{data, nextPageUrl: _pagination?.next_page ?? null}`.
- **Envelope unwrap is per-operation, not universal** (`client.ts:9-11`): account-scoped
  endpoints return the envelope; `/accounts` returns a bare array (`client.ts:638-643`),
  `/whoami` a bare object (`client.ts:645-650`), upload-status a bare object
  (`client.ts:856-864`), and async upload returns a bare `{status,prefixed_id,
  polling_url}` (`client.ts:893-902`).

### Method surface (`OfApiClient`, `client.ts:297-354`)
Reads (all live in production, retry `'idempotent'` via `getJson`, `client.ts:545-562`):
- `listAccounts` → `OfApiAccount[]` (bare array, key `__global__`) — `client.ts:638-643`
- `whoami` → `OfApiWhoami` (bare object, key `__global__`) — `client.ts:645-650`
- `listChats` → `{chats, nextPageUrl}`; always sends explicit `skip_users` default
  `'none'` because the live default differs from docs — `client.ts:652-665`
- `listMessages` → `{messages, nextPageUrl}`; enforces `first_id`/`last_id` mutual
  exclusion and their order coupling (`first_id`⇒desc scrollback, `last_id`⇒asc tail),
  `skip_users` default `'all'` — `client.ts:667-691`
- `getMessage` → `OfApiMessage` — `client.ts:693-701`
- `getUserByUsername` → `OfApiUser` — `client.ts:703-708`
- `getUsersByIds` → `Record<idString, OfApiUser>`; mass-list, capped at 10 ids
  (`USERS_MASS_LIST_MAX_IDS`, `client.ts:61`) — `client.ts:710-723`
- `listTransactions` → `{transactions, hasMore, nextMarker, nextPageUrl}` (marker
  pagination) — `client.ts:725-746`
- `listFansAll` / `listFansActive` → `{fans, hasMore}` via shared `listFans`
  (`client.ts:605-633`); upstream limit capped at 20 (`FANS_LIST_MAX_LIMIT`,
  `client.ts:62`); `filter[online]` / `filter[total_spent]` bracket keys —
  `client.ts:748-754`
- `listUserLists` / `listUserListUsers` → OnlyMonster tier lists, **strictly
  read-only** (no add/remove/create/delete method exists — `client.ts:205-207,
  756-791`); `listUserListUsers` capped at 100 (`USER_LIST_USERS_MAX_LIMIT`,
  `client.ts:64`), returns `nextOffset`
- `listVaultMedia` / `listVaultLists` / `getVaultMedia` / `listChatMedia` → vault &
  chat-media reads (`client.ts:793-854`); vault limit capped at 100
  (`VAULT_LIST_MAX_LIMIT`, `client.ts:66`); `listChatMedia` forces `skip_users:'all'`
  and returns `nextLastId`
- `getUploadStatus` → `OfApiUploadStatus`, free/no-credit async-upload poller (bare
  object) — `client.ts:856-864`

Writes (defined but shadowed by the transport wrapper in production; each runs with
`retry:'none'` = exactly one attempt, per the no-idempotency-key hard rule at
`client.ts:1-7`):
- `uploadVaultMedia` (`client.ts:866-905`) — multipart `file` upload, size-preflighted
  against `VAULT_UPLOAD_MAX_BYTES` = 100 MB (`client.ts:69`) with 5-min timeout
  (`UPLOAD_TIMEOUT_MS`, `client.ts:81`); returns `{kind:'started'|'completed'}`.
- `sendMessage` → `OfApiSentMessage` (`client.ts:907-928`)
- `deleteMessage` / `likeMessage` / `unlikeMessage` / `startTyping` / `markChatRead`
  (`client.ts:930-994`)

Upload-cost helpers `estimateUploadCredits(bytes)` (3 credits/decimal-MB,
`UPLOAD_CREDITS_PER_MB`, `client.ts:70-78`) exist but are only meaningful on the
now-disabled upload path.

### Request telemetry types
`OfApiRequestEvent` is a queued|started|response union (`client.ts:117-150`), each
carrying `accountKey`, `method`, `path`, `query`, `purpose`, `priority`, `retry`,
`attempt`; the response phase adds `status`, `elapsedMs`, `willRetry`, and optional
retry kind/delay. `PurposeTagged` (`client.ts:157-160`) forces every call site to
declare a `purpose` (compiler-exhaustive) plus optional `priority`.

## rate-limiter.ts — throttle, concurrency, retry loop

Two exports: `createRateLimiter` and `createRequestExecutor`.

- **Token bucket + concurrency gates** (`createRateLimiter`, `rate-limiter.ts:74-127`):
  default 300 RPM / burst 20 (`DEFAULT_RPM`, `DEFAULT_BURST`, `rate-limiter.ts:16-17`),
  per-account concurrency 4, global 12 (`rate-limiter.ts:18-19`). `run(accountKey,
  task, priority)` acquires the global semaphore then the per-account semaphore, then
  reserves a token (`reserveDelayMs`, `rate-limiter.ts:87-94`) and sleeps if the bucket
  went negative. Semaphores are two-queue priority (user waiters served before normal,
  `rate-limiter.ts:44-72`); `QueuePriority = 'normal' | 'user'` (`rate-limiter.ts:37`).
  In production the account key is the `acct_…` id, or `'__global__'` for team-level
  endpoints (`GLOBAL_KEY`, `client.ts:84`).
- **Retry policy** (`RetryPolicy = 'idempotent' | 'none'`, `rate-limiter.ts:137`):
  - `'idempotent'` (GET reads): on 429, backs off `1/2/4/8 s` floor
    (`RATE_LIMIT_BACKOFF_MS`, `rate-limiter.ts:20`) honoring `retry-after` up to a 60 s
    cap (`RETRY_AFTER_CAP_MS`, `rate-limiter.ts:21`); on 5xx retries up to 3 with
    `1/2/4 s` (`SERVER_ERROR_RETRY_DELAYS_MS`, `rate-limiter.ts:22`); drains the retry
    body between attempts (`rate-limiter.ts:170-176, 208-269`).
  - `'none'` (writes): **exactly one attempt** — 429/5xx/timeout surface immediately
    (`rate-limiter.ts:184-207`).
  - `createRequestExecutor` emits `onAttemptQueued/Started/Response` for each attempt —
    the events `client.ts` re-publishes as `OfApiRequestEvent`.

## errors.ts — OfApiError + HTTP/network classification

- `OfApiError extends CgError` (`errors.ts:56-72`) with OFAPI-specific extras:
  `textHighLight` (normalized restricted-words string), `textHighLights` (raw array),
  `validationErrors` (422 field map), `upstreamStatus` (OnlyFans' own HTTP status when
  OFAPI wrapped it).
- `mapOfApiHttpError(input)` (`errors.ts:132-206`) — decision order is load-bearing
  (401/429 first). Handles OFAPI's wrapped-OnlyFans envelope
  (`error:"ONLYFANS_COM_ERROR"`, `errors.ts:12-40, 138-143`). Mapping:
  401→`CG-OF-01`; 429→`CG-OF-03`; 402 or credits-phrase→`CG-OF-04`; restricted-words
  highlight or 400-with-"restricted words"→`CG-OF-05`; session/reconnect phrases or
  wrapped 401→`CG-OF-02`; 422→`CG-APP-01` with `validationErrors`; wrapped upstream
  429→`CG-OF-03`, wrapped upstream ≥500→`CG-NET-01`; 404→`CG-APP-01` (with a hint that
  account-scoped paths need the `acct_` prefix when the URL has none,
  `errors.ts:193-200`); other ≥500→`CG-NET-01`; else `CG-APP-01`.
- `mapOfApiNetworkError(error, url)` (`errors.ts:209-224`) — AbortError/TimeoutError →
  `CG-NET-02` (timeout), else `CG-NET-01`; preserves `.cause` chain (undici puts
  ENOTFOUND/ECONNREFUSED on `.cause`) so `classifySendFailure` can prove a request
  never left.
- `parseRetryAfterMs` (`errors.ts:75-82`) handles delta-seconds and HTTP-date.
- `ofApiShapeError` (`errors.ts:227-232`) — trust-boundary zod failure on a 2xx body →
  `CG-APP-01`.

Because reads run through the hub gateway, these OFAPI-origin codes are produced only
when the hub forwards an OFAPI error body upstream; the transport 401 re-tag to
`CG-HUB-01` is the desktop-visible auth code.

## send-outcome.ts — classifySendFailure (present, but no production consumer)

`classifySendFailure(error)` (`send-outcome.ts:83-92`) returns `'definite'` |
`'indeterminate'` per SPEC §7.4–7.5: definite only when the request provably never left
(connection-establishment/TLS codes, `send-outcome.ts:14-41, 64-72`) or a definitive
4xx-except-408 HTTP response (`send-outcome.ts:84-89`); everything else (timeout,
ECONNRESET, 5xx incl. wrapped OnlyFans 5xx, unknown) is indeterminate. It reads
`upstreamStatus` first for wrapped `ONLYFANS_COM_ERROR` failures
(`send-outcome.ts:53-61`).

Status post-migration: it is exported from the barrel (`index.ts:44`) and exercised by
`apps/desktop/tests/ofapi/send-outcome.test.ts`, but a repo-wide search finds **no
non-test production consumer** — the desktop no longer classifies OFAPI send failures
because writes are hub-only (the Hub command outbox owns send recovery; see
`07-send-engine-outbox.md`). The comment header still describes the pre-migration outbox
role.

## sanitize.ts — createOfApiSanitizer (fixture PII scrubber)

`createOfApiSanitizer()` (`sanitize.ts:53-186`) deep-walks recorded JSON preserving
structure, replacing only identifying values with stable per-sanitizer mappings so
cross-references survive: numeric ids → sequential fakes from 1,000,001
(`ID_KEYS`, `sanitize.ts:9-20`), `acct_…` ids → `acct_01000…` fakes
(`ACCT_ID_RE = /^acct_[0-9a-f]{32}$/`, `sanitize.ts:43, 72-80`), usernames→`fanNNN`,
names→`Fan N`, free text→a boilerplate sentence, dropped keys (website/email/ip/…)→`''`,
and URLs anonymized (OFAPI URLs via `sanitizeApiUrl`, CDN/media via `anonUrl`).
`sanitizeApiUrl` (`sanitize.ts:116-137`) rewrites acct-ids, numeric path segments, and
`first_id`/`last_id`/`marker` cursor params. Consumers: `fixture-capture.ts:68` and
`scripts/make-ofapi-fixtures.mjs:16` (imported directly under Node type-stripping —
kept dependency-free on purpose, `sanitize.ts:6-7`).

## pagination.ts — the four OFAPI pagination styles

One engine (`paginateEngine`, `pagination.ts:42-86`) behind four adapters, all gated by
`maxPages` hard cap and a default 300 ms inter-page delay
(`OFAPI_INTER_PAGE_DELAY_MS`, `pagination.ts:43`; constant in
`packages/shared/src/constants.ts:55`):
- `paginateNextPageUrl` — `_pagination.next_page` cursor URLs (chats, messages) —
  `pagination.ts:90-104`
- `paginateLimitOffset` — fans, vault, user-lists — `pagination.ts:108-125`
- `paginateMarker` — transactions — `pagination.ts:129-145`
- `paginateFirstLastId` — chat messages; `backward`=`first_id`+order=desc (scrollback),
  `forward`=`last_id`+order=asc (boundary-inclusive tail). Requires `idOf` to dedupe
  the repeated boundary message (`pagination.ts:149-178`).
`PaginationWant<T>` is `count` or `until(predicate)`; the outcome reports
`{items, pages, satisfied, exhausted}` (`pagination.ts:12-34`). Boundary-inclusive
styles treat a page of only already-seen items as caught-up (`pagination.ts:75-78`).

## credit-meter.ts — createCreditMeter (per-purpose credit/request tallies)

`createCreditMeter` (`credit-meter.ts:64-158`) parses credit/rate-limit telemetry from
each response and publishes a `CreditMeterSnapshot`
(`{balance, usedToday, rpmRemaining, utcDay, usedTodayByPurpose}`,
`credit-meter.ts:35-43`). Sources, header first then body `_meta`:
- credits used → header `x-ofapi-credits-used` ?? `_meta._credits.used`
- balance → header `x-ofapi-credits-balance` ?? `_meta._credits.balance`
- RPM remaining → header `x-rate-limit-remaining-minute` ?? `_meta._rate_limits.remaining_minute`
(`credit-meter.ts:100-119`). Per-purpose tallies (`PurposeTally = {requests, credits}`,
`credit-meter.ts:30-33`) increment on every tagged response — a request counts even at
0 credits; an untagged response with no telemetry stays invisible
(`credit-meter.ts:123-133`). Daily counters reset on UTC-day flip (`rollDay`,
`credit-meter.ts:77-84`). `hydrate` restores persisted counters only when the persisted
UTC day matches (`credit-meter.ts:140-152`); `subscribe` returns an unsubscribe.

Wiring: the meter is shared (constructed in `index.ts`, passed as `creditMeter`), then
`hydrate`d from `dataLayer.creditLog` (`index.ts:439-448`) and its snapshot deltas are
flushed back to the `credit_log` table per purpose (`index.ts:462-467`). Persistence and
the ledger table are owned by `09-data-model-storage.md` and
`11-hub-monetization-activity.md`; the OFAPI purpose vocabulary itself lives in
`@chatgoose/shared` (see below).

## schemas.ts — zod trust-boundary response schemas

All schemas are `z.looseObject` (validate the narrow consumed shape, tolerate the rest;
`schemas.ts:1-4`). The boundary data that crosses:
- **Envelope** `ofapiEnvelopeSchema` `{data, _meta?, _pagination?.next_page?}`
  (`schemas.ts:15-19`) — per-operation, not universal.
- **Team-level (bare, no envelope):** `ofapiAccountSchema` (`schemas.ts:25-40`) —
  carries the `acct_…` `id`, `is_authenticated`, and `onlyfans_id`/`onlyfans_username`;
  `accountNeedsReauth` = `is_authenticated === false` (`schemas.ts:44-47`).
  `ofapiWhoamiSchema` (`schemas.ts:49-63`).
- **Users/fans:** `ofapiUserSchema` (`schemas.ts:94-111`) — `id: z.number()` is the RAW
  OnlyFans numeric id; nested `subscribedOnData` sums (`totalSumm`, `tipsSumm`, …,
  `schemas.ts:74-90`) are **dollars**. `ofapiUsersByIdSchema` = record keyed by id
  string (`schemas.ts:116`). `ofapiFansDataSchema = {list, hasMore?}` (`schemas.ts:118-121`).
- **User lists (OnlyMonster tiers):** `ofapiUserListSchema` id is string-or-number,
  live shape `{list, hasMore}` (a live divergence from the vendored OpenAPI example's
  bare array — `schemas.ts:123-154`).
- **Chats:** `ofapiChatSchema` (`schemas.ts:169-181`) — note `lastReadMessageId` arrives
  as number OR numeric string (live divergence, `schemas.ts:176-177`); optional embedded
  `fan` profile depends on `skip_users`.
- **Messages:** `ofapiMessageSchema` extends the shared `ofapiChatMessageSchema` (from
  `@chatgoose/shared`) with `tipText` and `fromUser.id` (`schemas.ts:187-193`).
- **Write-path responses (still defined for the disabled write methods):**
  `ofapiSentMessageSchema` adds `cancelSeconds` (server-computed ~24 h unsend window)
  and `queueId` (`schemas.ts:203-207`); `ofapiSuccessDataSchema` `{success}`
  (`schemas.ts:212-214`); `ofapiLikeDataSchema` `{success, isLiked?}` (`schemas.ts:217-220`).
- **Transactions:** `ofapiTransactionSchema` — `amount`/`net`/`fee`/`vatAmount`/
  `taxAmount` are **dollars** (explicit comment "OFAPI is USD-denominated; never mills",
  `schemas.ts:226-248`); `ofapiTransactionsDataSchema = {list, hasMore?, marker?,
  nextMarker?}` (`schemas.ts:250-255`).
- **Vault/media:** `ofapiVaultMediaSchema` with `files.{full,thumb,preview,
  squarePreview}` variants, `isReady` transcode flag, `counters.tipsSumm` (dollars)
  (`schemas.ts:262-299`); `ofapiVaultListSchema` albums (`schemas.ts:301-319`);
  `ofapiChatMediaMessageSchema` = message objects carrying media, plus
  `ofapiChatMediaDataSchema` `{list, hasMore, nextLastId}` (`schemas.ts:321-342`).
- **Upload:** `ofapiVaultUploadStartedSchema` bare `{status, prefixed_id, polling_url}`
  (async 202) and `ofapiUploadStatusSchema` poller (`schemas.ts:344-373`).

## Boundary invariants a cross-project reviewer needs

- **Two ID namespaces.** Account scope is `acct_…` (32 hex chars,
  `ACCT_ID_RE`, `sanitize.ts:43`; used as the URL path prefix via `accountPath`,
  `client.ts:593-595`; a 404 on a path with no `acct_` gets a dedicated hint,
  `errors.ts:193-200`). Everything about a fan/message/chat uses the **raw OnlyFans
  numeric id** (`ofapiUserSchema.id: z.number()`, `schemas.ts:95`; a user-list roster
  entry's numeric id equals the chat id, `schemas.ts:147-149`).
- **OFAPI money is dollars, never mills.** Transaction and subscription/tip sums are
  plain USD numbers (`schemas.ts:229, 74-90`). The mills/micro-USD unit discipline is a
  core-kernel concern; this client passes dollar figures through unconverted.
- **Purposes tag credit spend.** Every call site declares an `OfApiPurpose`; the 14-value
  vocabulary (`hot-poll`, `deep-sweep`, `unread-reconcile`, `hydration`, `message-tail`,
  `chat-refresh`, `media`, `scan-deep-fetch`, `send`, `vault`, `spend-sweep`, `spenders`,
  `spenders-refresh`, `online`) and its labels live in
  `packages/shared/src/activity/purposes.ts:5-51` (`OFAPI_PURPOSES`). The meter tallies
  per purpose; `credit_log` persists per-day/per-purpose rows (legacy rows carry
  `UNTAGGED_PURPOSE`, `purposes.ts:25`).

## fixture-capture.ts — createFixtureCapture (debug only)

`createFixtureCapture(options)` (`fixture-capture.ts:52-92`) writes one sanitized
JSON file per request/response exchange to `options.dir` when `enabled`. Auth/cookie
headers are `[REDACTED]` (`SENSITIVE_HEADERS`, `fixture-capture.ts:9, 35-41`); bodies
and URLs are run through a fresh `createOfApiSanitizer()` per exchange
(`fixture-capture.ts:66-90`). The client calls it at `client.ts:511-521` only when
`options.fixtureCapture?.enabled`. Post-migration status: no production wiring passes a
`fixtureCapture` into `createOfApiClient` (only tests and the standalone
`scripts/make-ofapi-fixtures.mjs` use this machinery) — it is a debug/contract-test
facility, not part of the live read path.

## ofapi.gen.ts — generated OpenAPI types (characterization only)

`apps/desktop/src/main/ofapi/ofapi.gen.ts` is a ~51,871-line file
(`/* eslint-disable */`, header "GENERATED by scripts/codegen-ofapi.mjs … do not
edit"), produced by `openapi-typescript` from `docs/vendor/onlyfansapi/openapi.json`
via `scripts/codegen-ofapi.mjs` (regenerate: `pnpm codegen:ofapi`). It is committed so
builds never depend on codegen. Its role in this module is narrow: `client.ts:86-91`
imports `operations` only to derive a handful of query-param types
(`ListChatsQuery`, `ChatListFilter`, `ChatListOrder`, `SkipUsers`); the runtime trust
boundary is `schemas.ts` (hand-written zod), not these generated types. Not enumerated
here by design.

## index.ts — barrel

`index.ts` re-exports the public surface: `createOfApiClient` + client types/constants;
the rate-limiter factories and types; `classifySendFailure`; the four pagination
helpers; `createCreditMeter`; the error map/type set; `createFixtureCapture`;
`createOfApiSanitizer`; and the zod schemas + inferred types
(`apps/desktop/src/main/ofapi/index.ts:1-104`). It does NOT export `transport.ts`
(`buildHubOfApiReadBaseUrl` / `createOfApiTransportClient` are imported directly by the
composition root, `index.ts:48-49` in `apps/desktop/src/main/index.ts`).

## Cross-references (not duplicated here)
- Hub read-gateway wire contract & the `…/ofapi/read` prefix: `01-external-boundaries.md`.
- Sync/polling consumers of these read methods: `06-sync-and-reads.md`.
- The write/command path (Hub command outbox that replaced direct writes):
  `07-send-engine-outbox.md`.
- Credit-ledger persistence (`credit_log`) and the Activity ledger:
  `09-data-model-storage.md`, `11-hub-monetization-activity.md`.
