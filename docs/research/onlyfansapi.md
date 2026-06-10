# OnlyFans API (onlyfansapi.com) — Technical Research Report

> Researched 2026-06-10 against docs.onlyfansapi.com. Exact paths and field names verified against the vendored OpenAPI spec (`docs/vendor/onlyfansapi/openapi.json`) and the full docs dump (`docs/vendor/onlyfansapi/llms-full.txt`). When implementing, treat the vendored OpenAPI spec as the source of truth for request/response shapes; re-fetch per-page `.mdx` docs (section 8) for anything ambiguous.

## 1. Service overview & how it works under the hood

OnlyFansAPI.com is a **hosted REST gateway that holds OnlyFans sessions server-side** and reverse-engineers the private OnlyFans web/mobile API. Their pitch: interact with OnlyFans "without the need to build your proxy management system, reverse engineer the API, or deal with WebSockets." ~300+ REST endpoints (266 operations / 201 paths in the OpenAPI spec).

How it works:
- **You connect an OnlyFans account once.** They store the credentials/session encrypted (AES-256-CBC + MAC), run the actual OnlyFans login in a queued background job, and keep the session warm. They state they do **not** store account content/data on their servers; media is proxied/cached on their CDN only.
- **Each connected account gets its own dedicated mobile/residential proxy IP** (US or UK only right now). Public/search endpoints use rotating residential proxies. Custom proxies supported (must be dedicated mobile/residential, not datacenter).
- **Every request you make is translated to a live OnlyFans call** (for account-scoped endpoints) or served from their DB/cache (for "Computed"/"Hybrid" endpoints).
- 5-year track record, "zero bans" claim, including chatbot use. Status page: `status.onlyfansapi.com`. **No sandbox** — test with a real throwaway OF account.

**Three endpoint data-source classes** (page `/introduction/essentials/endpoint-data-sources`):
- **Live passthrough** (default): straight OnlyFans response. Uncached, costs credits.
- **Hybrid**: live OF call + enrichment from their DB. Relevant: `GET /{account}/chats` adds `lastReplyAt` per chat; `GET /{account}/chats/{chat_id}/messages` adds `lastReplyAt` per participant; `GET /{account}/fans/*` adds `lastReplyAt` per fan; `GET /{account}/transactions` adds computed `type`.
- **Computed**: built entirely from their DB, never calls OF (webhooks CRUD, data-exports, smart links, auth/account rows).

**Latency/consistency notes for a chat UI:** chat lists return immediately, but **fan detail is scraped in the background (2–3 s, sometimes up to ~10 s)** — you can get empty/partial fan data and must either call Get User Details or retry after ~10 s. Media in messages can arrive with `isReady: false` / null URLs while OnlyFans transcodes; poll until `isReady: true`.

## 2. Auth & account connection lifecycle

### 2a. Your app's auth to OFAPI
- **Base URL:** `https://app.onlyfansapi.com`, all endpoints under `/api`.
- **Auth:** HTTP Bearer. Header `Authorization: Bearer YOUR_API_KEY`. API keys created in the console; keys start with `ofapi_`. 401 = bad/missing key.
- **No scopes by default**: "Every API key has full access to every account you've connected, including every endpoint." The console adds optional **scoped keys** and per-account permissions, plus team RBAC (roles Owner/Admin/Member/Developer/Viewer/Custom with `category.action` permission keys). The raw REST key is all-or-nothing unless scoped in console.
- **Account ID format is load-bearing:** `acct_XXXXXXXX`. Almost every endpoint is `/api/{account}/...`. Missing the prefix is the #1 cause of 404s. Get IDs from `GET /api/accounts` (`id` field) or `GET /api/whoami`.

### 2b. Connecting an OnlyFans account — 5 methods
1. **Automated login (dashboard):** email + password; captcha bypassed; if 2FA on, enter the OTP in their UI. Pick proxy country (US/UK).
2. **Auth+ iPhone app (TestFlight):** creator signs in + completes 2FA/Face ID on their own phone. **Required when the account uses OnlyFans "v2 Face Authentication"** (dashboard/API flows cannot complete v2 face auth).
3. **Embedded "Login with OnlyFans" widget:** `@onlyfansapi/auth` npm package + a client session token (`ofapi_cs_…`, minted via `POST /api/client-sessions`). Renders an iframe modal; `onSuccess` returns `{accountId, username, response}`.
4. **Programmatic API flow** (see 2c).
5. **cURL / cookie import** — `auth_type: raw_data` with `auth_id`, `cookies`, `xbc`, `user_agent`. **Most relevant if we already broker browser sessions (e.g. via OnlyMonster)** — instant authentication from an existing cookie jar, no password.

### 2c. Programmatic connection lifecycle
- `POST /api/authenticate` — body: `auth_type` (`email_password` default | `raw_data` | `mobile_app`), `name`, `email`, `password`, `auth_id`, `cookies`, `xbc`, `user_agent`, `proxyCountry`, `customProxy`, `force_connect`. Returns `attempt_id`, `polling_url`, and (mobile) `mobile_auth_session_deeplink`.
- `GET /api/authenticate/{attempt_id}` — poll. Key fields: `state`, `progress`, `lastAttempt.{success,needs_otp,needs_face_otp,face_otp_verification_url,error_message,error_code}`. States observed: `needs-otp` (SMS), `needs-app-otp` (authenticator), face-otp-required (use `face_otp_verification_url`), `progress: wrong_2fa_code_retry` (error_code `WRONG_2FA`, resubmit without restart).
- `PUT /api/authenticate/{attempt_id}` — submit `{code}` for OTP, or `{selfie_verification_completed: true}` for face.
- `POST /api/authenticate/{attempt_id}/send-email-to-creator` — trigger OF email-code helper.
- `POST /api/authenticate/{account_id}/reauthenticate` — **re-connect an existing account without re-entering credentials.** Use this (not `/authenticate`) to avoid duplicate account rows.
- `DELETE /api/accounts/{id}` — disconnect.
- `GET /api/accounts` — list; per account: `id`, `onlyfans_id`, `onlyfans_username`, `onlyfans_email`, `is_authenticated`, `authentication_progress` (e.g. `signed_in`), `display_name`, full `onlyfans_user_data` (subscriber counts, csrf, OnlyFans `wsUrl`/`wsAuthToken`, etc.).

### 2d. Session expiry & coexistence with OnlyMonster (critical)
- **Session expiry:** they auto re-login up to **3 times within 1 hour**. Webhook `accounts.session_expired` fires when recovered silently (no action needed); `accounts.authentication_failed` fires when auto-recovery fails (you must re-auth). Also `accounts.otp_code_required` / `accounts.face_otp_required` during connect.
- **Coexistence with other CRMs — explicitly documented as safe.** FAQ verbatim: *"Can I use OnlyFans API with OnlyMonster / Infloww / CreatorHero / Any other OnlyFans CRM? Yes, absolutely. Having your account connected to OnlyFans API doesn't affect your ability to use any other OnlyFans CRM and vice versa."* OnlyFans permits multiple concurrent sessions/tokens per account; OFAPI uses its own dedicated proxy IP per account rather than hijacking the browser session.
  - **Caveat (not answered by docs):** no OnlyMonster-specific documentation; unverified whether heavy concurrent activity (both sending typing/read events) causes UI races. **Run a real-world test with one account on both OnlyMonster + OFAPI before architecture lock-in.**

## 3. Capability map by category

All paths prefixed with `/api`. `{account}` = `acct_…`. `{chat_id}` = the fan's OnlyFans user ID (from `data.fan.id` in List Chats). Two ID namespaces: OFAPI account ids (`acct_…`) vs raw OnlyFans numeric ids for fans/chats/messages.

### Chats
| Method | Path | Notes |
|---|---|---|
| GET | `/{account}/chats` | Query: `limit` (1–100, def 10), `offset`, `skip_users` (`all`/`none`, def all), `order` (`recent`/`old`), `filter` (`pinned`/`priority`/`unread`/`with_tips`/`unread_with_tips`), `query`. Returns per chat: `unreadMessagesCount`, `hasUnreadTips`, `isMutedNotifications`, `lastMessage{}`, `lastReadMessageId`, `canSendMessage`, `countPinnedMessages`, `fan{}` (full profile incl. `lastSeen`, `listsStates`, counts), enriched `lastReplyAt`. |
| GET | `/{account}/chats/{chat_id}/media` | Chat media gallery. `type`, `limit`, `offset`, `skip_users`. |
| POST | `/{account}/chats/{chat_id}/mark-as-read` | Mark one chat read. |
| POST | `/{account}/chats/mark-as-read` | Mark **all** chats read. |
| POST | `/{account}/chats/{chat_id}/mark-as-unread` | Mark unread. |
| POST | `/{account}/chats/{chat_id}/typing` | Show "model is typing…" to fan for ~4 s. Call repeatedly to sustain. **Free, no credits.** |
| POST/DELETE | `/{account}/chats/{chat_id}/mute` / `/unmute` | Mute notifications. |
| POST | `/{account}/chats/{chat_id}/hide` | Hide chat. |
| DELETE | `/{account}/chats/{chat_id}` | Delete chat. |

Gap: no online-status field on the chat beyond `fan.lastSeen`. Online presence is delivered via webhooks (`users.online`/`users.offline`), not a chat field.

### Chat Messages
| Method | Path | Notes |
|---|---|---|
| GET | `/{account}/chats/{chat_id}/messages` | Query: `limit` (def 10, max 100), `filter` (only `pins`), `first_id` (paginate when `order=desc`), `last_id` (paginate when `order=asc`, inverts list), `order` (`desc`/`asc`), `skip_users`. Each message: `id`, `text` (HTML), `price`, `isFree`, `isOpened`, **`isNew`** (read-receipt proxy: true=unseen by fan, false=read), `isTip`, `isFromQueue`, `canUnsendQueue`, `unsendSecondsQueue`, `mediaCount`, `media[]`, `previews[]`, `lockedText`, `giphyId`, `isLiked`, `isPinned`, `releaseForms[]`, **`isSentByMe`**, `createdAt`, `changedAt`, `responseType`. |
| GET | `/{account}/chats/{chat_id}/messages/{message_id}` | Single message. |
| GET | `/{account}/chats/{chat_id}/messages/search` | Search within a chat (`query`). Returns IDs to feed into `first_id`. |
| POST | `/{account}/chats/{chat_id}/messages` | **Send message.** Body: `text` (HTML; required unless media present), `replyToMessageId`, `lockedText`, `price` (0 or **3–200**; nonzero ⇒ PPV, requires `mediaFiles`), `mediaFiles[]` (direct upload `ofapi_media_…` IDs, or OF vault IDs), `previews[]` (free-preview subset; **every preview must also be in `mediaFiles`**), `giphyId`, `rfTag`/`rfPartner`/`rfGuest` (release-form tagging). |
| DELETE | `/{account}/chats/{chat_id}/messages/{message_id}` | **Unsend/delete — only within 24 h of sending.** |
| POST/DELETE | `…/{message_id}/like` / `/unlike` | Like/unlike. |
| POST/DELETE | `…/{message_id}/pin` / `/unpin` | Pin/unpin. |
| POST | `/{account}/messages/{message_id}/attach-tags` | Attach release-form tags. |

**Composing/formatting:** text is OnlyFans HTML — wrap in `<p>`, `<br>` for newlines, size via `<span class="m-editor-fs__{sm,s,l,lg}">`, bold `<strong>`, italic `<em>`, colors `m-editor-fc__{gray,blue-1,blue-2}`. A `400 "Input contains restricted words"` comes from OnlyFans itself; response carries `textHighLight`.
**"Has fan read?":** poll `isNew` (true→false). No read-receipt webhook exists.
**"What did a fan purchase?":** no direct endpoint — scan sent messages for `isOpened === true && price > 0` (purchase state is directly on the message object).

### Mass messaging / queue / saved-for-later
| Method | Path | Notes |
|---|---|---|
| POST | `/{account}/mass-messaging` | Send/schedule mass DM. Body: `userLists[]`, `excludedLists[]`, `userIds[]`, `text`*, `lockedText`, `price`, `mediaFiles[]`, `previews[]`, `giphyId`, `rf*`, `scheduledDate` (UTC), `saveForLater`. **Single-fan scheduling trick:** one user ID in `userIds` = scheduled message for one chat. |
| GET | `/{account}/mass-messaging` / `/{id}` / `/overview` | List queue / get one / overview stats. |
| PUT/DELETE | `/{account}/mass-messaging/{id}` | Update / unsend-delete a mass message. |
| GET | `/{account}/queue`, `/queue/counts` | Queue items & counts (posts+messages pipeline). |
| PUT | `/{account}/queue/{queue_id}/publish` | Publish queued item now. |
| — | `…/saved-for-later/messages` etc. | List + enable/disable/update automatic messaging cadence. |

### Fans / users
| Method | Path | Notes |
|---|---|---|
| GET | `/{account}/fans/all` `/active` `/expired` | Filters: `filter.online` (`1`), `filter.total_spent`, `filter.tips`, `filter.duration` (months), `query`, `limit` (**1–20 max**), `offset`, `type`. |
| GET | `/{account}/fans/latest` | `start_date`/`end_date`. |
| GET | `/{account}/fans/top` | `by` (ranking metric). |
| GET/PUT/DELETE | `/{account}/fans/{fan_id}/notes` | Get / create-edit (`notes`) / clear fan notes (OF-native notes, visible in other CRMs too). |
| PUT | `/{account}/fans/{fan_id}/custom-name` | Set fan nickname (`custom_name`). |
| GET | `/{account}/fans/{user_id}/subscriptions-history` | Subscription history. |
| GET/POST | `/{account}/fans/{fan_id}/summary` | Their own AI fan summary (get / generate, `regenerate`). **200 credits/gen** — we have our own summaries; treat as optional alternative. |
| GET | `/{account}/users/{username}` | Full user detail incl. `subscribedOnData{}`. |
| GET | `/{account}/users/list?ids=…` | **Mass-list up to 10 users in one call (credit saver).** |
| POST/DELETE | `/{account}/users/{user_id}/{block,restrict,subscribe}` | Moderation + subscribe/unsubscribe. |
| GET | `/{account}/following/{all,active,expired}` | Who the account follows. |

**Fan spending fields** (on `subscribedOnData` / fan objects, also in webhook `fanData.spending`): `totalSumm`, `subscribesSumm`, `tipsSumm`, `messagesSumm`, `postsSumm`, `streamsSumm`; plus `subscribeAt`, `expiredAt`, `renewedAt`, `duration` ("3 months"), `discountPercent`, `hasActivePaidSubscriptions`, `unsubscribeReason`.
**Labels/lists:** `/{account}/user-lists…` covers custom lists + system lists (`rebill_on`/`rebill_off`/`fans`/`following`/`muted`).
Gaps: no fan language-preference field; no per-fan purchase-history endpoint.

### Transactions / earnings / analytics
| Method | Path | Notes |
|---|---|---|
| GET | `/{account}/transactions` | Query: `limit`, `startDate` (def `-30days`), `marker` (pagination), `type` (`subscribes`/`tips`/`post`/`chat_messages`/`stream`), `tipsSource` (`profile`/`post_all`/`chat`/`stream`/`story`). Fields: amount, vat/tax/net/fee, currency, status, fan, computed `type`. |
| GET | `/{account}/statistics/{overview,statements/earnings,total-transactions,subscriber-metrics}` | Earnings & subscriber stats (live passthrough). |
| GET | `/{account}/payouts/{balances,earning-statistics,eligibility,payout-requests}` | Balances & payouts. |
| POST | `/{account}/payouts/request-manual-withdrawal` | `amount`. |
| POST | `/api/analytics/{summary,financial}/…` | Cross-account analytics (team-level, `account_ids[]`, date ranges, forecasts). |
| GET | `/{account}/chargebacks…` | Chargebacks + ratio + stats. |

No single per-fan financial ledger endpoint; per-fan totals come from `*Summ` fields, detailed rows from `/transactions` joined on fan id.

### Media / vault
| Method | Path | Notes |
|---|---|---|
| POST | `/{account}/media/upload` | Upload to OF CDN. multipart `file` **or** `file_url` (exactly one). `async` (recommended >50 MB → 202 + `polling_url`). `file` ≤100 MB (Cloudflare), `file_url` ≤1 GB. Returns `prefixed_id` (`ofapi_media_…`) — **single-use**. **3 credits/MB.** |
| POST | `/{account}/media/vault` | Upload into vault (returns `data.id`, reusable vault ID). |
| GET | `/{account}/media/uploads/{upload}/status` | Poll async upload (`pending`/`processing`/`completed`/`failed`). Free. |
| GET | `/{account}/media/vault` | List vault. `query`, `field`, `type`, `list`, `sort`, `limit` (10–100, def 24), `offset`. |
| GET/DELETE | `/{account}/media/vault/{media_id}`, `/delete-media` | Get / delete (`mediaIds`). |
| — | `…/media/vault/lists…` | Vault list (album) CRUD + add/remove media. |
| GET | `/{account}/media/download/{cdnUrl}` | Download bytes from a `cdn*.onlyfans.com` URL (paste URL unencoded after path). Streams binary. 302→their CDN if cached (**free**); else streams from OF (**3 credits/MB**) and caches. |
| POST | `/{account}/media/scrape` | **Deprecated.** Use download instead. |

`cdn*.onlyfans.com` URLs are IP-locked to their proxy and expire in ~1 min; always go through the download endpoint with the **same account ID** that produced the URL (else 403). Media in responses is auto-rewritten to `cdn.fansapi.com` when cached. Bulk: Data Exports → Media gives a single ZIP of the whole vault.

### Posts / stories / promotions / settings / misc
Full coverage exists (Posts, Post Comments, Post Labels, Stories, Story Highlights, Promotions, Subscription Bundles, Settings, Release Forms, Free/Tracking/Smart Links, Notifications, Giphy). Peripheral for a chat client but available: `GET /{account}/notifications` + `/counts`, Giphy search/trending (for `giphyId`), Settings (welcome message, subscription price), Promotions/Bundles (upsell flows).

## 4. Real-time strategy for a desktop app

**There is NO customer-facing websocket or SSE.** Two mechanisms only:

### Webhooks (their recommended real-time path)
- Configured per **team**, not per API key. CRUD: `POST/GET/PUT/DELETE /api/webhooks`, `GET /api/webhooks/events`.
- Create body: `endpoint_url`*, `signing_secret`, `events[]`*, `account_scope`* (`global` | `inclusive` | `exclusive`), `account_ids[]` (required unless global).
- **Delivery:** HTTP POST, **at-least-once**, 15 s response timeout, retried up to **5×** with exponential backoff. **Dedupe by `event_id`.** Signature = `HMAC-SHA256(rawJsonBody, signing_secret)` (hex). Envelope: `{event, account_id, payload}` (data-export & fan-summary events are team-level with `account_ids[]`).
- **Cost: 1 credit per 100 webhook events.**

**Full webhook event list** (docs page `/webhooks/available-events` is authoritative):
- Messages: `messages.received`, `messages.sent`, `messages.ppv.unlocked`, `messages.deleted`
- Chat queue: `chat_queue.updated`, `chat_queue.finished`
- Transactions/tips: `transactions.new` (type ∈ message/post/tip/new_subscription/recurring_subscription/stream/other; **may lag up to 3 min**), `tips.received`
- Subscriptions: `subscriptions.new` (also covers free follows), `subscriptions.renewed`
- Posts: `posts.liked`
- Users/presence: `users.typing` (fan typing; fires ~every 3 s while typing, no "stopped" event — replicate ~5 s decay), `users.online`, `users.offline` (presence via periodic polling on their side, **not instant**)
- Accounts: `accounts.connected`, `accounts.reconnected`, `accounts.session_expired`, `accounts.authentication_failed`, `accounts.otp_code_required`, `accounts.face_otp_required`
- Data exports: `data_exports.{calculating_credits,…,completed,failed,cancelled}`
- AI: `fan_summary.completed`

**`messages.received` payload is rich** — full message (text, media, price, isFree, isTip, queueId), full `fromUser` (incl. `lastSeen`, `listsStates`, subscription flags), `fanData.spending`, and `replyToMessage`. An incoming message can be rendered directly from the webhook without an extra fetch (except media still processing — poll until `isReady`).

### The desktop-app problem (no public HTTP endpoint)
1. **Thin relay backend (recommended).** Small always-on service that owns the OFAPI key, registers the webhook, verifies HMAC, dedupes by `event_id`, persists events, and fans out to desktop clients over our own WebSocket. Standard architecture; also keeps the all-accounts API key off chatter machines.
2. **Polling fallback / hybrid.** For things webhooks don't cover — chiefly **read receipts** (`isNew` flips) — poll `GET /{account}/chats/{chat_id}/messages`. Poll `GET /{account}/chats` for the inbox. Each uncached account call = 1 credit; budget carefully.
3. **MCP server** (`https://app.onlyfansapi.com/mcp/onlyfans-mcp`, OAuth, 200+ tools, 120 RPM/key) — useful for AI-agent experiments, **not** a real-time transport.

**Net:** webhooks-via-relay for inbound events + targeted polling for read-state. Before the relay exists, foreground polling works (see SPEC sync engine).

## 5. Rate limits & pricing (exact numbers, as of 2026-06; verify before launch)

### Rate limits
- Daily limits removed (`*_day` fields/headers are legacy).
- **Basic: 1,000 RPM. Pro: 5,000 RPM. Enterprise: unlimited.** Per minute, per API key. MCP: 120 RPM.
- On exceed: `429`; exponential backoff (1→2→4→8 s), honor `retry-after`.
- Monitoring: headers `x-rate-limit-limit-minute`, `x-rate-limit-remaining-minute`; body `_meta._rate_limits.{limit_minute,remaining_minute}`. Cached responses don't count.

### Credits
| Action | Cost |
|---|---|
| Any uncached account-specific request (send message, list chats/messages, fans, transactions, …) | **1 credit** |
| Cached public response | 0 |
| Media upload | **3 credits/MB** |
| Media download (uncached) | **3 credits/MB**; cached on their CDN = 0 |
| Webhooks | **1 credit / 100 events** |
| Search Profiles | 1 credit / result |
| Data export | 1 credit / 20 results (public profiles: 3/profile) |
| Their AI fan summary | 200 credits / generation |
| Typing indicator | **Free** |
| Upload status polling | Free |

- Account-specific endpoints are **never cached** (always fresh, always charged). Public endpoints cache by default; `?fresh=true` forces. `_meta._credits` returns `{used, balance, note}`; headers `x-ofapi-credits-used`, `x-ofapi-credits-balance`, `x-ofapi-is-cached`.
- Credit rollover up to 200% of monthly allocation.

### Plans (pricing page; docs credits page disagrees slightly — confirm with vendor)
| Plan | Price | Accounts | Credits/mo | RPM |
|---|---|---|---|---|
| Free | $0 | 1 | 10 credits total | 1,000 |
| Basic | $69/mo | 1 | 20,000 (pricing page) / 25,000 (docs) | 1,000 |
| Pro | $299/mo | 5 incl. (+$10–$29 per extra) | 100,000 (pricing) / 75,000 (docs) + 10,000 per extra account | 5,000 |
| Enterprise | Custom | Custom | Unlimited | Unlimited |

- Top-ups: 25k=$50, 50k=$89, 100k=$149, 500k=$499, 1M=$799.
- Pro scale discounts up to 60% at 500+ accounts. Add-ons (per account/mo, tiered by earnings): AI Voice $0–50; Housekeeping $0–100. 60-day money-back.

**Cost-modeling flag:** at 1 credit per uncached call, naive polling burns credits fast (20 accounts' chat lists every 30 s ≈ 57,600 credits/day). **Webhooks are ~100× cheaper than polling** — design around webhooks; poll only on demand.

## 6. Error handling, pagination, SDKs

**Response envelope:** `{ data, _meta { _credits, _cache, _rate_limits }, _pagination? }`.

**Errors:** `400` often OnlyFans-origin (e.g. restricted words, with `textHighLight`); `401` bad key; `403` expired/foreign CDN URL on media download; `404` usually missing `acct_` prefix; `405` wrong method; `422` validation `{ error:"VALIDATION_ERROR", message, description, errors:{field:[…]} }`; `429` rate limit. Auth widget errors: `{message, code, details}` (e.g. `AUTH_CANCELLED`).

**Pagination — four styles, no single convention** (build a per-endpoint adapter):
- Cursor URL: `_meta._pagination.next_page` (chats, messages, tracking-links)
- `limit`/`offset`: fans, vault, user-lists, comments
- `marker`: transactions, story archive, message buyers
- `first_id`/`last_id`: chat messages (direction-dependent; `last_id`+`asc` inverts order)
- `cursor`: Search Profiles

**Idempotency:** **No request-side idempotency keys** — a retried send may double-post. Only webhook-side `event_id` dedup exists. Client must implement its own send-dedup (local IDs + reconcile against `messages.sent`).

**SDKs/tooling:** `@onlyfansapi/auth` (auth widget only); no official full REST SDK (docs show cURL/JS/Go/Python/Java/C# snippets); `onlyfansapi-skill` agent skill (expects `ONLYFANSAPI_API_KEY`); docs MCP server `https://docs.onlyfansapi.com/api/mcp` (read-only: `search_docs`, `get_doc_page`, `get_overview`); Make/n8n/Zapier modules.

## 7. Risks / gotchas / open questions

1. **No realtime socket for clients** — relay backend effectively mandatory for a responsive inbox.
2. **No read-receipt or "stopped typing" events** — poll `isNew`; simulate typing decay (~5 s).
3. **`transactions.new` lags up to 3 min; presence events are polled, not instant.**
4. **API key is all-accounts/all-endpoints unless scoped in console** — never ship an unscoped key in a desktop binary.
5. **Send has no idempotency key** — implement client-side dedup.
6. **Background-scrape staleness:** fan data may be empty 2–10 s after a chat list; media URLs null until transcoded. Need retry/poll + skeleton states.
7. **Unsend window = 24 h only.**
8. **`ofapi_media_` upload IDs are single-use;** reuse requires vault IDs.
9. **Proxy geography US/UK only;** match creator's historical geolocation; custom proxy must be mobile/residential.
10. **v2 Face Authentication accounts connect ONLY via the Auth+ iPhone app.**
11. **Credit costs of polling** — model unit economics; webhooks are ~100× cheaper.
12. **Pricing/credit discrepancy** between docs and pricing page — confirm with vendor.
13. **OnlyMonster coexistence asserted generally, not tested** — run a live test (read/typing/seen races) before lock-in. Decide connection method: fresh OFAPI login vs `raw_data` cookie import.
14. **Stability depends on OnlyFans** — handle 5xx, `accounts.authentication_failed`; surface `status.onlyfansapi.com`.
15. **Two ID namespaces:** `acct_…` (OFAPI) vs raw OnlyFans numeric ids (`chat_id == fan.id`).
16. **No sandbox** — test against a real throwaway OF account; tests consume credits.

## 8. Key `.mdx` URLs per subsystem

Append `.mdx` to any docs page URL for raw markdown. The vendored `openapi.json` is the field-level source of truth.

**Foundational:** `introduction/quickstart`, `introduction/essentials/response-structure`, `introduction/essentials/rate-limits`, `introduction/essentials/credits`, `introduction/essentials/endpoint-data-sources`, `introduction/essentials/proxies`, `introduction/guides/develop-with-ai-agents` — all under `https://docs.onlyfansapi.com/…​.mdx`

**Account connection:** `introduction/guides/connect-onlyfans-account`, `api-reference/connect-onlyfans-account/start-authentication`, `…/poll-authentication-status`, `…/submit2fa`, `…/re-authenticate-account`, `api-reference/client-sessions/create-client-session`, `api-reference/account/list-accounts`, `auth/quickstart`

**Chat/messaging (core):** `api-reference/chats/list-chats`, `api-reference/chat-messages/list-chat-messages`, `api-reference/chat-messages/send-message`, `…/delete-message`, `…/search-chat-messages`, `api-reference/chats/mark-chat-as-read`, `…/start-typing-indicator`, `introduction/guides/composing-messages`, `introduction/guides/text-formatting`

**Mass messaging/queue:** `api-reference/mass-messaging/send-mass-message`, `…/list-mass-message-queue`, `api-reference/queue/list-queue-items`

**Fans/users:** `api-reference/fans/list-active-fans`, `…/get-subscription-history`, `…/get-fan-notes`, `…/create-edit-fan-notes`, `api-reference/users/get-user-details`, `…/mass-list-user-details`, `api-reference/user-list-collections/list-user-lists`

**Media/vault:** `introduction/guides/uploading-media`, `introduction/guides/downloading-media`, `api-reference/media/upload-media-to-the-only-fans-cdn`, `api-reference/media-vault/list-vault-media`

**Transactions:** `api-reference/transactions/list-transactions`, `api-reference/statistics/get-earnings`

**Webhooks:** `webhooks`, `webhooks/available-events` (authoritative event catalog), `webhooks/subscribing-to-webhooks`, `webhooks/protecting-your-webhooks`, `api-reference/webhooks/create-webhook`

**Machine-readable spec:** `https://app.onlyfansapi.com/scribe-docs/openapi.json` / `.yaml` (JSON vendored locally).
