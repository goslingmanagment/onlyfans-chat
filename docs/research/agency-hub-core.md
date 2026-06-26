# Agency Hub "core" — capability map for ChatGoose Desktop integration

> Originally researched 2026-06-10; **the OFAPI / real-time / AI sections were rewritten 2026-06-26** to match what core actually shipped — P6 is largely done and production-enabled (see SPEC §9.2). Core is the agency's central backend+dashboard, **in production**, and plays the "hub" role for this product — no separate relay is built. Still verify exact shapes against core's OpenAPI (`reference/agency-hub.openapi.json`, mtime 2026-06-25, or `GET /api/v1/openapi.json`) before coding against it.

## What core is

- **Stack:** pnpm monorepo. `apps/runtime` = Fastify 5 backend (Node 22, TS ESM) + pg-boss worker + CLI; `apps/dashboard` = React 19 SPA (Vite, Tailwind 4, react-router 7, TanStack Query), served same-origin by the API. `packages/`: `contracts` (zod route schemas → OpenAPI), `db` (Drizzle + Postgres 16, money as BIGINT mills), `fansly` (own reverse-engineered Fansly adapter), `onlyfans` (actually an **OnlyMonster** client, `omapi.onlymonster.ai`, header `x-om-auth-token`), `shared`.
- **Deploy:** one Docker image in two roles (`api` on loopback :3000 behind TLS proxy, `worker`) + Postgres 16, on a VPS (`/opt/agency-hub`); migrations auto-run on startup under advisory lock.
- **Sync engine:** pg-boss planner/executor in worker. Fansly = full coverage (account, transactions, top spenders, subscribers, followers, DM conversations/messages ~30min/24h cadence). **OnlyFans is now a full OFAPI subsystem (updated 2026-06-26):** DM, audience, spend, and presence sync (`apps/runtime/src/services/sync/ofapi-dm-sync.ts`, `sync/ofapi-audience-sync.ts`, `ofapi-spend-projection.ts`, `ofapi-presence-projection.ts`). The old OnlyMonster DM-polling path (`ONLYFANS_DM_POLLING_ENABLED`, still default `false`) is explicitly demoted to **legacy** in the config registry — superseded by the OFAPI webhook path.
- **OFAPI is now a first-class subsystem in core (updated 2026-06-26):** ~27 `ofapi-*` service files under `apps/runtime/src/services/` (client, read-gateway, webhooks, events, command outbox/executor, spend/presence/DM/subscription projections, credits, sync-snapshot), DB repos + 20+ `00xx_ofapi_*` migrations, ~30 `tests/ofapi-*.test.ts`. The 2026-06-10 "OFAPI not present anywhere" note is obsolete.

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

## Real-time & AI status (P6 — now largely shipped, updated 2026-06-26)

- **Webhook + SSE infrastructure is LIVE.** OFAPI webhook intake `POST /api/v1/ofapi/webhook` (HMAC, dedupe, journal, pg-boss; `apps/runtime/src/services/ofapi-webhooks.ts`); SSE fanout `GET /api/v1/events/stream` (`Last-Event-ID` resume) + snapshot recovery `GET /api/v1/events/snapshot`; webhook registration `GET/POST /api/v1/admin/ofapi/webhook`. Desktop consumes these in Hub mode (SPEC §6.2 / §9.2). The 2026-06-10 "no SSE/webhook infra" note is obsolete.
- **AI gateway is LIVE.** `POST /api/v1/ai/gateway/stream` (SSE, API-key principal; `apps/runtime/src/services/ai-gateway*.ts`) with a request cost ceiling (`f5adfa0`) and a usage-required hardening fix (`f7469e7`, 2026-06-25). It is production-enabled, but **Desktop AI still defaults to Direct** until rollout acceptance (core M7 open) — see SPEC §9.2. The OFAPI **read-gateway** (`/api/v1/ofapi/read/*`) and **command outbox** (`/api/v1/ofapi/commands*`) are likewise live and are the desktop's default read/write paths.
- Anthropic is also used internally for a workboard-v2 classifier (`WB_CLOSING_LLM_ENABLED`); the general chat AI path is now the gateway above.
- Job/scheduling infra (pg-boss) and an admin/notification stack (Telegram) carry the webhook-processing load.

## Implications for this repo

1. **P4 (deep AI):** integrate against the live endpoints — profile prefetch/push + ai-usage batches + chatter API key in settings. Map OFAPI account → core page label by `platform === 'onlyfans'` + normalized username, manual override in settings. **The 2026-06-10 fan auto-create blocker is RESOLVED:** `upsertPageFanProfile` now calls `resolveOrCreatePageFan` (`apps/runtime/src/services/fan-profiles.ts:104`, invoked at `:169`), which idempotently `upsertFans` + `upsertFanPages` on demand for `platform === 'onlyfans'` (deleted fans + Fansly pages still 404). Ops note still applies: every target OF page must be onboarded as a core page.
2. **Real-time + AI gateway — SHIPPED (updated 2026-06-26):** the OFAPI webhook receiver, SSE fanout (`Last-Event-ID` replay + snapshot recovery), read-gateway, command outbox/executor, and AI gateway all landed in core's repo and are production-enabled (desktop AI rollout / M7 still open). Desktop is Hub-first by default. See SPEC §9.2 for the live custody status.
3. Don't duplicate: notes/flags/spend views exist in core; our fan panel may deep-link to core's FanProfilePage for managers.
4. Future synergy (P7 idea): OFAPI webhook stream could enrich core's thin OnlyFans analytics (subscribers/DM data that OnlyMonster doesn't provide).
