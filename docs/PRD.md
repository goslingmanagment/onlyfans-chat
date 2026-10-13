> **MIXED HISTORICAL PRODUCT BASELINE.** Product goals and safety/UX intent remain
> useful, but Direct OFAPI, local provider-key, model, prompt, and phase-status
> statements predate the kernel cutover. For current architecture use source,
> `AGENTS.md`, and `docs/decisions.md`; do not implement a Direct fallback from
> this document.

# ChatGoose Desktop — Product Requirements Document

| | |
|---|---|
| Status | Updated 2026-06-21 — implementation code-complete through P5; webhook/SSE, read custody, supported command custody, keyless Hub defaults, configurable unread reconcile, and core AI gateway foundation are documented in [PLAN](PLAN.md) |
| Product | Standalone desktop chat client for OnlyFans agency chatters, with built-in AI assistance |
| Predecessor | ChatGoose Firefox extension for Fansly (`/Users/dmitriy/code/goose/fansly-ext`, analyzed in [research/legacy-chatgoose.md](research/legacy-chatgoose.md)) |
| Platform API | onlyfansapi.com (OFAPI) — third-party hosted OnlyFans REST gateway (analyzed in [research/onlyfansapi.md](research/onlyfansapi.md)) |

## 1. Problem & opportunity

The agency's chatters manage OnlyFans creator accounts through **OnlyMonster**. Unlike Fansly (where the ChatGoose extension injects AI tools directly into the site), we **cannot inject UI into OnlyFans as accessed via OnlyMonster**. Result: OnlyFans chatters — the larger share of the business — work with zero AI assistance, while Fansly chatters have the full ChatGoose feature set (fast replies, coaching, fan summaries, reactivation pings, performance reviews).

OFAPI gives us full programmatic access to connected OnlyFans accounts (read chats, send messages incl. PPV, fan data, spending, vault, webhooks) and **explicitly coexists with OnlyMonster** (multiple concurrent OF sessions are permitted; OFAPI holds its own server-side session on a dedicated proxy).

**The product: our own OnlyFans chat interface.** A desktop app that renders the conversation workspace we wish OnlyFans had — designed from scratch around the chatter's actual workflow — with the proven ChatGoose AI feature set built in natively instead of bolted on via DOM injection. The chatter runs their shift in our app; OnlyMonster remains available for everything else (posting, account settings) and as a fallback surface.

### Why now / why this shape
- The AI features and prompt engineering are already proven on Fansly (v1.4.1, 783 tests, in production). The expensive part — what to generate, how to avoid AI-slop, what context the model needs — is done and portable.
- OFAPI removes the hardest problems (session management, proxies, OF reverse engineering) for a fixed per-account cost.
- Owning the UI removes the extension's biggest fragility (DOM coupling to a third-party SPA) and unlocks capabilities an overlay never could: multi-part send automation, scheduled sends, cross-account inbox, persistent local history, instant fan context.

### Why not alternatives
- **Inject into OnlyMonster** — closed app, no extension surface; fragile and adversarial. Rejected.
- **Browser extension on onlyfans.com directly** — chatters don't access OF through a normal browser; sessions live in OnlyMonster. Rejected.
- **Use OnlyMonster's own AI tools** — not ours, not our prompts/economics, no agency-level data ownership. Rejected.

## 2. Users

**Primary: the chatter.** Works in DMs on behalf of one or a few creator accounts per shift. Goals: respond fast, keep fans engaged, sell PPV/customs, not break character. Power user: keyboard-driven, many hours/day in the tool, tolerates density, hates latency and clicking. Russian-speaking; works with English-language fans. May run OnlyMonster in parallel during transition.

**Secondary: agency manager/admin.** Configures accounts, personalities, model access, and (later) reviews AI usage, costs, and chat quality. Today served partly by the separate "Agency Hub / core" backend project; this PRD treats the Hub as an integration target, not part of this product.

## 3. Goals & success metrics

| Goal | Metric (measure in pilot) |
|---|---|
| Chatter can run a full text-chat shift in the app | % of shift time spent in app vs OnlyMonster; messages sent via app / total |
| AI assist is used and useful | AI actions per hour; suggestion acceptance rate = copied-or-inserted / generated (a regenerate counts as rejection of the prior output); regenerate rate |
| Faster fan handling | Median time from incoming message → reply, vs OnlyMonster baseline |
| Revenue-positive behavior | PPV sends per shift; tips/PPV revenue per shift (directional, vs baseline) |
| Cost under control | OFAPI credits per chatter-shift; LLM $ per chatter-shift (targets: §10) |
| Reliability | <1 dropped/duplicated outbound message per 1,000 sends; recoverable state on every error |

## 4. Non-goals (v1)

- **Not an autopilot.** AI never sends a message without an explicit human action. (Automation of *approved* multi-part sends is in scope; unattended chatting is not.)
- **Not an OnlyMonster replacement.** No posting, stories, promotions, account settings management.
- **No Fansly support in v1.** The Firefox extension keeps serving Fansly. The architecture keeps a path to multi-platform later (platform-agnostic core), but we do not build it now.
- **Not the agency analytics dashboard.** Earnings dashboards, staff management, PnL — that's the separate "core/hub" project.
- **No mobile, no web app.** Desktop (macOS first, Windows packaging when needed — chatters' machines TBD, see §11).
- **No vault content production tools** (tagging, editing). Browse/attach/price only.

## 5. Product shape & rollout phases

Two components, introduced in stages (details in [PLAN.md](PLAN.md)):

1. **Desktop app** (this repo, `apps/desktop`) — the chatter's workspace. Fresh/default profiles are Hub-first for supported OFAPI reads and writes: the production Hub URL is prefilled, a Hub chatter key is the normal onboarding secret, and a local OFAPI key is optional Direct rollback only (OFAPI offers no key scopes — custody rules in SPEC §5). Desktop still calls LLM providers directly until the separate desktop AI-gateway rollout is accepted.
2. **Agency Hub ("core", `~/code/goose/hub`) integration** — the agency's existing production backend (Fastify + Postgres + worker, Docker on a VPS) takes the hub role; we do **not** build a separate relay. Core already serves the legacy ChatGoose API (it calls the product "ChatMuse"): central fan-profile storage with append-only versions, AI-usage ingestion, per-chatter revocable API keys with page scoping — the desktop integrates these from P4. Core now owns the push-first webhook/SSE path, the read-custody gateway, supported command intake/execution, and a production-enabled AI gateway foundation with owner usage reporting. Desktop Hub mode covers reads, text, typing, unsend, mark-read, and media/PPV sends without a local OFAPI key; Direct remains explicit rollback.

Rollout: internal pilot on 1 creator account + 1–2 trusted chatters in read+AI mode (sends still via OnlyMonster) → enable sending in-app → expand accounts/chatters → hub phase.

## 6. Functional requirements

Features marked **[P1]**–**[P7]** map to plan phases. Legacy behavioral details (exact prompts, thresholds, timeouts) are normative where referenced — see [research/legacy-chatgoose.md](research/legacy-chatgoose.md).

### F1. Accounts & onboarding [P1]
- App configured with an Agency Hub (core) chatter API key for normal Hub mode. A per-chatter **named** OFAPI key remains optional for explicit Direct rollback/dev mode only — OFAPI keys cannot be scoped, every key is full-access; custody rules in SPEC §5. Keys are stored in OS keychain, never in plaintext config.
- App lists connected OF accounts (`GET /api/accounts`), shows auth state (`is_authenticated`), and surfaces re-auth needs (later via `accounts.authentication_failed` / `is_authenticated=false`; a lone `accounts.session_expired` is informational — OFAPI auto-recovers it; in P1 via API errors).
- Account connection itself happens in the OFAPI console by the admin (out of app scope for v1; revisit embedded connect widget later).
- **Personality mapping:** every account must be mapped to a personality before AI features activate (same rule as legacy; unmapped → AI buttons disabled with clear prompt). Personalities: name + free-form content, CRUD in settings, bundled "Lora" starter ported from legacy.

### F2. Inbox / chat list [P1]
- Per-account chat list via `GET /{account}/chats`: fan name/avatar, last message preview, time, unread count, tip indicator (`hasUnreadTips`). Pinned/priority exist as **server-side filters**; the live chat object carries no per-chat pinned/priority flag (verified 2026-06-10; Phase-0 spike re-confirmed: only `countPinnedMessages` (pinned *messages*) and `fan.listsStates` (user-list membership: Tagged/Recent/Muted — not pinned/priority) exist) — **no badge source; v1 ships without pinned/priority badges**, filters stay API-level only.
- Filters: one quiet row — All / Unread / With tips (owner 2026-06-10: minimal list chrome; no list title, no per-list sync label — freshness lives in the status bar; Priority/Pinned stay API-level only). Search/jump via the ⌘K palette, no dedicated search box in the list.
- Account switcher (chatter may handle several accounts per shift); per-account unread badges; aggregate badge on app icon.
- Sorting by recency. "Fan waiting" indicator derived from `lastMessage` (`isSentByMe=false` + `unreadMessagesCount>0`); the OFAPI-enriched `lastReplyAt` re-checked in the Phase-0 spike (2026-06-10, ~12 h after connect, 70 list-chats samples): still `null` on every chat — v1 ships on the fallback only; vendor question (does enrichment accumulate?) stays open. P7 ping-queue has the same dependency.
- New-message arrival: list updates via sync engine (P1 polling; SSE push from ~P3 via the parallel core track); toast + optional sound for incoming messages on any handled account.

### F3. Conversation view [P1]
- Full message history with infinite scrollback (paginated fetch, local cache for instant re-open).
- Message rendering: text (OF HTML → safe rich text), media (photos/videos/audio/gif with thumbnails, blurred-locked state, `isReady` polling for processing media), tips (`isTip` with amount), GIFs, replied-to context, deleted state.
- **PPV state is first-class:** sent PPV messages show price + purchased/not-purchased badge directly from `price`/`isOpened`. (This fixes legacy's #1 incident class — AI pitching already-purchased content — at the data-model level.)
- Fan read receipts: `isNew` flag → "seen" indicator on our sent messages (refreshed on conversation poll; no webhook exists — UI must not promise instant ticks).
- Presence: fan `lastSeen` ("online Xm ago"); live online/typing indicators once the parallel core track delivers `users.online/offline/typing` events [~P3].
- Mark-as-read: automatic on conversation open+focus (debounced 1.5 s), settings toggle default on (decided 2026-06-10) — **[P3]**: P1–P2 chatter keys are read-only (SPEC §5 scope matrix), so until P3 unread state is display-only and chats are actually marked read in OnlyMonster.

### F4. Composer & sending [P3]
- Text composer with per-chat persistent drafts, emoji picker, OF text formatting subset (bold/italic; sizes/colors optional later).
- Send via `POST /{account}/chats/{chat_id}/messages`. Optimistic append → confirmed/failed states. **Send-dedup is mandatory** (no idempotency keys upstream): single-flight per chat, outbox journal, unconfirmed-on-restart surfaced for manual reconcile, never silent auto-retry of a possibly-sent message.
- Restricted-words rejection (OF 400 + `textHighLight`) → inline highlight of offending words, message preserved for editing.
- Typing indicator sent while chatter types (free endpoint, throttled ~3s).
- Multi-part replies: AI `[NEXT]` parts can be sent as a queued sequence with natural randomized delays (e.g. 2–5 s), cancelable mid-sequence; or inserted one-by-one (chatter choice).
- Unsend (≤24 h window) with countdown awareness; reply-to; like/unlike fan messages.

### F5. Fan context panel [P1 read, P3 write]
- Identity: avatar, name, custom name (editable → `PUT …/custom-name`), username, lastSeen, lists/labels membership.
- **Spending:** total + breakdown (subscriptions / tips / messages / posts / streams) from `subscribedOnData` `*Summ` fields; rendered both for the chatter and as AI context.
- **Subscription:** status, price, subscribed-since, renew date, **auto-renew off ⇒ churn-risk badge**, duration, subscription history on demand.
- **Notes — cut from v1 (owner decision 2026-06-10).** The team's notes live in OnlyMonster's own notes, whose public API exposes no notes endpoints (verified: 7 paths, none for notes) — they can't be pulled, and nobody will migrate them by hand. A from-scratch notes store would sit empty and split-brain against OM. The need is covered by the **AI Fan Summary** (F6.4): its dossier section (facts, key quotes, triggers) is generated from the conversation itself — always current, zero manual upkeep. Core's `fan_notes` endpoint and OF-native notes remain available for a future opt-in; backlog idea (P7): AI-extracted persistent fan facts accumulating in core automatically.
- **AI Fan Summary card:** latest summary with generated-at timestamp + refresh (F6.4); cached locally, synced centrally to Agency Hub (core) from P4.

### F6. AI assist suite [P2 quick, P4 deep] — behavior-compatible with legacy (fresh code; carry-over rules in SPEC §8.1)
All features stream token-by-token into an AI panel docked above the composer; results offer **Insert** (into composer) / **Insert part N** / copy. During the P2 companion phase (before in-app sending exists) Copy is the primary action — the chatter pastes into OnlyMonster. Same staged-timeout discipline, cancellation, error taxonomy, reply sanitizer, prompt-injection escaping, and safety preambles as legacy (see research doc §2, §8, §9). Prompt templates are ported with Fansly→OnlyFans adaptations; transcript/spending/subscription context blocks keep their proven text formats but are built from OFAPI data (mapping table in [SPEC.md](SPEC.md) §8).

1. **Fast Reply** [P2] — in-voice reply from last ~100 messages + spending/subscription context. Tones: casual / flirty / upsell / spicy; **default = casual** (owner 2026-06-10; legacy default was no-override — deliberate default change, tone texts themselves port verbatim); clicking the active tone deselects back to personality-only. Split mode (`[NEXT]`). Regenerate.
2. **Improve Draft** [P2] — rewrite the chatter's draft in-character, preserving intent/facts/prices; draft may be written in Russian, output in fan's language. Single message out.
3. **Help Me** [P2] — coaching: situational read + Engaging and Flirty ready-to-send suggestions (XML-parsed).
4. **Fan Summary** [P4] — **UI label: "Scan"** (the team's established name; legacy button label for `fan-summary`, `chatgoose: src/content/button-bar.ts:10`; usage events still report feature id `fan-summary` — core's stray `scan` enum value stays unused). Deep profile (~1500 msgs): dossier, psychology, stage/trajectory, communication, financial profile, open loops, strategy. **Output in Russian.** Cached per conversation with legacy invalidation rules (personality/model/data-verified); refresh on demand; central prefetch/sync via Agency Hub (core) from P4 — its fan-profile store already exists, so one chatter's summary is visible to all.
5. **Chat Review** [P4] — chatter performance rating 1–10 + evaluation + recommendations (XML-parsed), deep context, never cached.
6. **Ping** [P4] — reactivation message; legacy segmentation behavior carried over exactly (thresholds verbatim, code fresh): blocked if fan texted within 5 days ("still active — use Reply"); Segment A (≥3 fan texts, silent >5 d) references past topics; Segment B (thin history) warm low-pressure opener.
7. **Hi Greeting** [P4] — 3 opener variants (`[VARIANT]`) for fresh conversations (≤10 total messages), username-aware.
8. **Compare** [P4, lowest priority] — run Fast Reply across multiple personality cards side-by-side (A/B tool).

Model support: per-feature model selection + reasoning effort (off/low/medium/high/max), Anthropic direct + OpenRouter, prompt caching, live cost display per operation — all per legacy registry (refresh model list at implementation time).

**AI quality bar:** the legacy anti-AI-slop work (few-shot examples over prose rules, banned-formula structural rules, output sanitizer) is the most valuable ported asset and must not regress. Build the prompt regression harness early (PLAN §P4): golden transcripts → generated outputs reviewed against the legacy bad-output taxonomy.

### F7. Vault & PPV sending [P5]
- Browse vault (`GET /{account}/media/vault`, albums via vault lists), thumbnail grid, search/filter, multi-select.
- Attach vault media to a message; set price ($3–200) and free-preview subset (previews ⊆ attached); locked-text caption.
- Local upload-from-disk is intentionally absent from the desktop app surface as an unsafe file-byte custody path. Media sends use existing Vault media ids; unsupported local file-byte upload is not a normal-operation requirement.
- Clear PPV compose summary before send (N items, price, previews) — misprice prevention.

### F8. Real-time via Agency Hub (core) [parallel core track, target P3; AI gateway P6]
- Core has an OFAPI webhook receiver (`messages.received/sent/deleted`, `messages.ppv.unlocked`, `tips.received`, `transactions.new` (lags ≤3 min), `subscriptions.*`, `users.typing/online/offline`, `accounts.*`): HMAC verify, idempotency-header dedupe, journal, fan-out to desktop clients over **SSE** (core decision #25: REST + SSE, no websockets). `messages.deleted` is load-bearing for SPEC §6.3 tombstones.
- Desktop uses push-first sync when hub is live (polling stays as degraded fallback); read-state (`isNew`) still polled on-demand for the open conversation. External OF/OnlyMonster reads that clear unread badges have no webhook, so desktop also runs a configurable, body-free unread reconcile using only the chat-list unread filter (no message bodies, no mark-read).
- Desktop authenticates to core with the existing per-chatter API keys (page-scoped, revocable — the central kill-switch already works today).
- Central storage is live from P4 (fan summaries, AI usage). Core's P6 AI gateway foundation is production-enabled with provider egress routed through page/account proxies, quota reservation, usage/cost ledger fields, stale-reservation recovery, and owner reporting. Desktop has HubGateway wiring, but desktop AI still defaults to Direct until the separate rollout is accepted.
- OFAPI key custody (desktop holds no OFAPI key, OF calls proxied via core) is now the default normal-operation path for supported reads and writes. A local OFAPI key remains an optional, named, revocable Direct rollback only (SPEC §5).

### F9. Settings [P1–P2, grows with features]
Ported legacy schema where applicable: provider API keys; per-feature model + reasoning; message-count knobs (quick 100 / improve 25 / deep 1500, same ranges); personalities CRUD; account→personality mappings; debug mode (+ pipeline profiling view); prompt-caching toggle; sound/notification prefs; mark-as-read policy; configurable unread reconcile triggers/intervals/page caps; interface language + UI scale; **color theme (`system` / `light` / `dark`, default `light`; owner 2026-06-13);** Agency Hub (core) URL + chatter API key (from P4).

### F10. Operational UX (cross-cutting)
- **Status bar:** OFAPI credit balance + credits used today (from `_meta._credits` / `x-ofapi-credits-*` headers where present — the envelope isn't universal), per-op LLM cost after each AI action (legacy spend summary), sync freshness ("updated 12 s ago"), connection state.
- Account session health banner (authentication failed → "re-auth needed, ping admin" with deep link to OFAPI console; `session_expired` events are info-only, no banner).
- Every error maps to a coded, actionable message (legacy `CG-*` taxonomy extended with OFAPI codes); raw payloads in debug mode.
- Offline/API-down: cached data remains browsable, composer disabled with reason, auto-recovery on reconnect.

## 7. UX design principles (UI is designed from scratch — explicit requirement)

Concrete layout anatomy, hotkey map, performance-engineering checklist and visual direction live in [DESIGN.md](DESIGN.md) (binding). Detailed visual design happens at implementation with the frontend-design skill; these principles are binding:

1. **Three-zone workspace:** left = account rail (avatars w/ badges) + chat list; center = conversation + composer; right = fan context panel (collapsible). AI output appears in a **dock above the composer** (streams in place, Insert buttons land text exactly where the eyes already are) — proven by legacy inline-panel pattern.
2. **Keyboard-first.** Every high-frequency action has a hotkey: send, next/prev unread chat (J/K-style), jump to chat N (⌘1..9, with a held-modifier number overlay), AI features (e.g. ⌘R fast reply, ⌘I improve draft; ⌘0 inserts all draft parts, individual parts are click-only), tone cycling, search. Hotkey cheatsheet overlay (?).
3. **Latency is masked, never hidden.** Optimistic sends with explicit state glyphs (sending → sent → seen); skeletons over spinners; cached conversation paints instantly, refresh reconciles; every async surface shows data age. Honest about what's not real-time (read receipts, presence in polling mode).
4. **Streaming everywhere.** AI output renders token-by-token with cancel always available; no modal blocks the conversation — chatter can keep reading/scrolling while AI generates.
5. **Money is visible.** Fan value (total spent, churn-risk) visible without clicks; PPV purchase states unmissable in history; tips highlighted. The chatter's next monetization move should be obvious from the screen.
6. **Dense but calm.** Information-dense layout for power users; restrained warm professional palette (DESIGN.md §4 — owner decision 2026-06-10), light by default with an optional dark theme (owner 2026-06-13, pure token swap — the restraint rules hold in both); no decorative chrome; visual emphasis reserved for money events, unread state, and errors.
7. **Trust through transparency.** Per-operation cost, what context the AI saw (debug inspector), and explicit "AI never sends by itself" affordances.
8. **Fast.** Cold start <3 s to usable inbox; cached chat open <300 ms; account switch <500 ms (budgets in SPEC §13).

## 8. Constraints & dependencies

- **OFAPI is a hard dependency** (unofficial third-party gateway, $; see §10/§11 risks). All access through it; no direct OF reverse engineering in this product.
- **No customer-facing websocket from OFAPI** → real-time requires our hub relay (webhooks) or polling. No read-receipt webhook at all.
- **No send idempotency upstream** → client-side dedup is a correctness requirement, not polish.
- **Account-scoped calls cost 1 credit each, never cached** → sync design is a cost feature (SPEC §6).
- **OF restricted-words** and 24 h unsend window are platform rules surfaced in UX.
- Chatter machines hold sensitive data (fan PII, adult DM history) → local store is **encrypted at rest** with purge controls (SPEC §10); optional Direct rollback OFAPI keys stay under the SPEC §5 custody rules (vendor offers no key scopes — verified 2026-06-11).
- AI provider usage policies: agency-operated assistant for adult-platform chat; same posture as the legacy product (human-in-the-loop, no platform ToS evasion features beyond what the agency already accepts by using OnlyMonster/OFAPI).

## 9. Competitive/context note

OnlyMonster, Infloww, Supercreator et al. offer CRM + AI features. We are not competing commercially — this is an internal tool whose edge is (a) our proven prompt stack and persona discipline, (b) agency-owned data (summaries, usage, costs), (c) UI shaped exactly to our chatters' workflow, (d) per-feature model control and cost transparency.

## 10. Unit economics (rough, validate in pilot — week-1 task in PLAN)

**OFAPI credits** (1 credit ≈ $0.0008–0.0035 across plan/top-up tiers; mid-range ≈ $0.0015–0.002):
- Polling mode (P1–P5), one active account/shift: chat-list poll @20–30 s ≈ 1,000–1,400/8 h; open-conversation read-state sweep @30 s ≈ 800–960; delta-triggered refreshes + sends/reads/fan fetches ≈ 500–1,200. **≈ 2.5–4 k credits per chatter-shift** → 55–90 k/mo per full-time seat. Pro plan (100 k/mo incl. 5 accounts, $299) covers a small pilot; polling at scale needs top-ups → hub phase pays for itself.
- Webhook mode (from ~P3, parallel core track): events ≈ 1 credit/100 → **≈ 0.5–1 k credits per chatter-shift** (sends, conditional read-state sweeps and on-demand fetches dominate). ~3–5× cheaper than polling mode.
- Media: 3 credits/MB upload/first-download; thumbnails cached on their CDN (free after first fetch).

**LLM** (legacy registry prices): fast replies ≈ $0.01–0.03/op (Sonnet-class + prompt caching), deep summary ≈ $0.3–0.8/op (Opus-class, 1500 msgs). Typical shift ≈ **$1.5–4/chatter**. Per-feature model knobs + hub limits keep this governed.

## 11. Risks & open questions

| # | Risk / question | Plan |
|---|---|---|
| 1 | **OnlyMonster coexistence** asserted by OFAPI FAQ but untested for races (read-state, typing, dual sends) | Week-1 pilot test on a throwaway account: both tools active, verify no logout, observe read/typing behavior. Decide mark-as-read policy from results |
| 2 | **OFAPI latency** for live passthrough endpoints unknown (every call proxies to OF) | Week-1 spike: measure p50/p95 for list-chats / list-messages / send; if p95 > ~2.5 s, increase cache/prefetch investment |
| 3 | **OFAPI reliability/business risk** (unofficial API, OF could break it; vendor could die) | Local SQLite cache keeps history readable; OnlyMonster remains operational fallback; data-provider abstraction isolates vendor |
| 4 | **Account safety** (third-party session, proxy geo US/UK) | Same risk class the agency already accepts with OnlyMonster; use matching proxy geo; pilot on lower-value account first |
| 5 | Pricing/credit allocation discrepancy (docs vs pricing page) | Low priority since the dev key shows 99k credits / 5k RPM; confirm terms with vendor before scaling to many accounts |
| 6 | ✅ Resolved 2026-06-10: accounts are connected by the admin via the OFAPI dashboard (automated login); the app uses console-issued API keys. `raw_data` cookie import is a fallback; v2 Face-Auth accounts require the Auth+ iPhone app | — |
| 7 | **Concurrent work on one page** — two surfaces (OM + app) or two app instances racing: double replies, mark-as-read races (single-flight/outbox are per-instance; multi-chatter presence only arrives in P7) | Transition protocol: one page is worked from exactly one surface AND by exactly one chatter per shift |
| 8 | ✅ Resolved 2026-06-10: English UI; AI fan summaries stay Russian (legacy convention) | — |
| 9 | ✅ Resolved 2026-06-10: auto mark-as-read on conversation open, with settings toggle (default on). Phase-0 coexistence test still validates the OnlyMonster interplay | — |
| 10 | Legacy unresolved: AI-slop quality drift | Port prompts verbatim first; build regression harness (PLAN P4) before iterating on prompt content |

## 12. Acceptance (per release gate)

- **P1 gate:** chatter monitors a real account read-only for a full shift without opening OnlyMonster for *reading*; data correct vs OM spot-checks (messages, PPV states, spending).
- **P2 gate (AI quick, companion mode):** Fast Reply / Improve / Help Me used in real shifts with copy-to-OnlyMonster; acceptance rate instrumented from day 1 — pilot week 1 establishes the baseline (no legacy number exists; the Fansly extension never tracked acceptance), gate = week-2 trend stable/improving + chatter sign-off; per-op cost shown.
- **P3 gate (sending):** full text shift in-app; zero lost/duplicated sends across ≥500 messages; restricted-words and error paths exercised; AI Insert replaces copy. Real-time target: the parallel core track is live — incoming message → UI ≤2 s p95 via SSE, polling demoted to fallback, credit burn per shift drops ≥5×. (If the track slips, P3 may ship on tightened polling, but the app is not declared the primary surface until SSE lands.)
- **P4 gate:** Summary/Review/Ping/Hi at behavior parity with legacy (side-by-side prompt-output review); summary caching correct; summaries sync to Agency Hub (core) and are visible to other chatters and in core's dashboard.
- **P5 gate:** PPV send with vault media + previews + price executes correctly end-to-end (verified in OM/OF).
- **P6 gate:** per-chatter LLM limits enforced by core's AI gateway; live provider streaming validated in production; desktop runs without local LLM provider keys in gateway mode; kill-switch (revoke chatter API key in core admin) demonstrated.
