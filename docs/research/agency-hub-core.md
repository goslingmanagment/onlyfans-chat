# Agency Hub "core" — capability map for ChatGoose Desktop integration

> Researched 2026-06-10 from `~/code/core` (read-only). Core is the agency's central backend+dashboard, **in production**. It plays the "hub" role for this product — no separate relay is built. This is a snapshot; verify against core's contracts (`packages/contracts/src/routes.ts`) / OpenAPI (`reference/agency-hub.openapi.json` or `GET /api/v1/openapi.json`, owner session) before coding against it.

## What core is

- **Stack:** pnpm monorepo. `apps/runtime` = Fastify 5 backend (Node 22, TS ESM) + pg-boss worker + CLI; `apps/dashboard` = React 19 SPA (Vite, Tailwind 4, react-router 7, TanStack Query), served same-origin by the API. `packages/`: `contracts` (zod route schemas → OpenAPI), `db` (Drizzle + Postgres 16, money as BIGINT mills), `fansly` (own reverse-engineered Fansly adapter), `onlyfans` (actually an **OnlyMonster** client, `omapi.onlymonster.ai`, header `x-om-auth-token`), `shared`.
- **Deploy:** one Docker image in two roles (`api` on loopback :3000 behind TLS proxy, `worker`) + Postgres 16, on a VPS (`/opt/agency-hub`); migrations auto-run on startup under advisory lock.
- **Sync engine:** pg-boss planner/executor in worker. Fansly = full coverage (account, transactions, top spenders, subscribers, followers, DM conversations/messages ~30min/24h cadence). **OnlyFans = OnlyMonster only and thin: connection + transactions; DM polling exists but is disabled by default (`ONLYFANS_DM_POLLING_ENABLED=false`).**
- **onlyfansapi.com (OFAPI) is not present anywhere in core** — no mentions of `onlyfansapi`/`ofapi`/`acct_`. All OFAPI work for P6 is new.

## The ChatGoose/"ChatMuse" contract — live today

Core calls this chat product **"ChatMuse"**. The four endpoints the legacy Firefox extension uses all exist (paths exact):

| Endpoint | Notes |
|---|---|
| `GET /api/v1/pages` | Pages visible to the principal (owner = all, chatter = assigned). Returns `{id, label, platform: "fansly"\|"onlyfans", modelSlug, modelName, username, displayName, followerCount, subscriberCount, …}` |
| `GET /api/v1/pages/{pageLabel}/conversations/{conversationId}/profile` | Conversation-based profile lookup (needs core's DM sync to resolve — for OnlyFans prefer the fan-id route below) |
| `GET/PUT /api/v1/pages/{pageLabel}/fans/{platformUserId}/profile` | **The summary store.** PUT body `{body: string ≤50000}`; **append-only versions**, stamped `source:"chatmuse"`, `createdByUserId`. GET returns latest. PUT is API-key-only |
| `POST /api/v1/ai-usage/batch` | `{events[1..100]}`, per-event: `clientEventId` (dedup per user), `feature`, `model`, token counts, `conversationId?`, `durationMs?`, `isCacheHit`, `isRegeneration`, `completedAt` (ISO, ≤5 min future). Returns `{receivedCount, insertedCount, dedupedCount}`. API-key-only |

Also useful: `GET …/fans/{platformUserId}` (fan detail w/ spend), `GET …/fans/{platformUserId}/profile` (GET twin of PUT), `POST …/fans/{platformUserId}/notes`, `PATCH /api/v1/fans/{platform}/{platformUserId}/flags` (`whale|vip|risky`), `GET /api/v1/health`.

**Constraints to respect:**
- `feature` is a **closed zod enum** in `core: packages/shared/src/types.ts`: `fast-reply | improve-draft | help-me | fan-summary | chat-review | scan | ping | hi-greeting`. New feature names require a core change + `pnpm contracts:generate`.
- AI usage stores **tokens only, no dollar column** — cost is derived at report time.
- Fan identity is `(platform, platform_user_id)` — matches OFAPI (`chat_id === fan.id`). No cross-platform fan linking.
- Profiles are rendered in core's dashboard FanProfilePage ("Latest ChatMuse profile") with version history.

## Auth model

- **Chatter API keys** (Bearer `agency_hub_core_<24 chars>`, sha256-stored, prefix-tracked): the only auth for the chat app. **Role `chatter` only; one active key per chatter** (issuing rotates old ones); revocable in dashboard Settings → Users (the UI literally warns it "will disconnect {user}'s browser extension immediately") — this is the kill-switch.
- Page scoping enforced server-side on every page route (`canAccessPage`); chatters see only assigned pages.
- Dashboard sessions (cookie, argon2) are owner/team_lead only — the chat app never uses them. Admin surface (`/api/v1/admin/*`: users, key issuance, models/pages CRUD, sync ops) is owner-only.

## Real-time & AI status (relevant to P6)

- **No websocket/SSE/webhook infrastructure exists today.** Core decision #25: REST everywhere, **SSE reserved for future AI streaming**. New-data delivery today would be HTTP polling.
- **Roadmap Phase 7 "ChatMuse Backend" — NOT started.** Planned scope (matches our P6 needs): AI proxy with streaming (app → hub → provider), fan-context injection, per-chatter rate limiting/quota, cost tracking (token+dollar ledger), prompt caching, per-page model personality management. Decision "Hub-Owned AI Gateway" confirms central Claude access is the intended design.
- Anthropic SDK is used in core only for an internal workboard-v2 classifier (`ANTHROPIC_API_KEY`, `WB_CLOSING_LLM_ENABLED`) — no general AI endpoint yet.
- Job/scheduling infra (pg-boss) and an admin/notification stack (Telegram) exist and can carry the webhook-processing load.

## Implications for this repo

1. **P4 (deep AI):** integrate immediately against the live endpoints — profile prefetch/push + ai-usage batches + chatter API key in settings. Map OFAPI account → core page label by `platform === 'onlyfans'` + normalized username, manual override in settings. **Open verification item:** whether `PUT …/fans/{platformUserId}/profile` auto-creates the fan row when core's (thin, transactions-only) OnlyFans sync has never seen that fan — chatters will summarize non-spenders. If it 404s, core needs a small auto-create patch. Also: every target OF page must be onboarded as a core page (ops).
2. **P6 (real-time + AI gateway):** new work lands **in core's repo** — OFAPI webhook receiver (HMAC, `event_id` dedupe, journal, pg-boss), SSE fanout (`Last-Event-ID` replay, page ACLs), AI gateway per Phase 7. See SPEC §9.2.
3. Don't duplicate: notes/flags/spend views exist in core; our fan panel may deep-link to core's FanProfilePage for managers.
4. Future synergy (P7 idea): OFAPI webhook stream could enrich core's thin OnlyFans analytics (subscribers/DM data that OnlyMonster doesn't provide).
