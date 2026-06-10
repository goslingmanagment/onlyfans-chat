# ChatGoose Desktop — Product Requirements Document

| | |
|---|---|
| Status | Draft v1 — 2026-06-10 |
| Product | Standalone desktop chat client for OnlyFans agency chatters, with built-in AI assistance |
| Predecessor | ChatGoose Firefox extension for Fansly (`/Users/dmitriy/code/chatgoose`, analyzed in [research/legacy-chatgoose.md](research/legacy-chatgoose.md)) |
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
| AI assist is used and useful | AI actions per hour; suggestion acceptance rate (inserted or sent / generated); regenerate rate |
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

1. **Desktop app** (this repo, `apps/desktop`) — the chatter's workspace. In early phases it talks to OFAPI directly (polling) and to LLM providers directly, with scoped API keys.
2. **Hub relay service** (`apps/hub`, later phase) — small always-on backend that owns the OFAPI key, receives OFAPI webhooks, pushes events to desktop clients over WebSocket, stores shared fan summaries/notes centrally, tracks AI usage, and enforces per-chatter limits. Replaces polling; centralizes secrets. Aligns with the agency "core" vision (central summary storage, per-chatter token limits — see `~/code/мысли и хотелки, транскрипт.md`).

Rollout: internal pilot on 1 creator account + 1–2 trusted chatters in read+AI mode (sends still via OnlyMonster) → enable sending in-app → expand accounts/chatters → hub phase.

## 6. Functional requirements

Features marked **[P1]**–**[P7]** map to plan phases. Legacy behavioral details (exact prompts, thresholds, timeouts) are normative where referenced — see [research/legacy-chatgoose.md](research/legacy-chatgoose.md).

### F1. Accounts & onboarding [P1]
- App configured with an OFAPI key (per-chatter **scoped** key in direct mode; hub-issued token later). Keys stored in OS keychain, never in plaintext config.
- App lists connected OF accounts (`GET /api/accounts`), shows auth state (`is_authenticated`), and surfaces session-expiry/re-auth needs (later via `accounts.*` webhook events; in P1 via API errors).
- Account connection itself happens in the OFAPI console by the admin (out of app scope for v1; revisit embedded connect widget later).
- **Personality mapping:** every account must be mapped to a personality before AI features activate (same rule as legacy; unmapped → AI buttons disabled with clear prompt). Personalities: name + free-form content, CRUD in settings, bundled "Lora" starter ported from legacy.

### F2. Inbox / chat list [P1]
- Per-account chat list via `GET /{account}/chats`: fan name/avatar, last message preview, time, unread count, tip indicator (`hasUnreadTips`), pinned/priority.
- Filters: All / Unread / With tips / Priority. Search by fan name (`query`).
- Account switcher (chatter may handle several accounts per shift); per-account unread badges; aggregate badge on app icon.
- Sorting by recency. The OFAPI-enriched `lastReplyAt` is displayed to spot "fan waiting" chats.
- New-message arrival: list updates via sync engine (P1 polling, P6 push); toast + optional sound for incoming messages on any handled account.

### F3. Conversation view [P1]
- Full message history with infinite scrollback (paginated fetch, local cache for instant re-open).
- Message rendering: text (OF HTML → safe rich text), media (photos/videos/audio/gif with thumbnails, blurred-locked state, `isReady` polling for processing media), tips (`isTip` with amount), GIFs, replied-to context, deleted state.
- **PPV state is first-class:** sent PPV messages show price + purchased/not-purchased badge directly from `price`/`isOpened`. (This fixes legacy's #1 incident class — AI pitching already-purchased content — at the data-model level.)
- Fan read receipts: `isNew` flag → "seen" indicator on our sent messages (refreshed on conversation poll; no webhook exists — UI must not promise instant ticks).
- Presence: fan `lastSeen` ("online Xm ago"); live online/typing indicators when hub phase delivers `users.online/offline/typing` events [P6].
- Mark-as-read: automatic on conversation open+focus (debounced), with a setting to disable (interplay with OnlyMonster workflows, see Open Questions).

### F4. Composer & sending [P2]
- Text composer with per-chat persistent drafts, emoji picker, OF text formatting subset (bold/italic; sizes/colors optional later).
- Send via `POST /{account}/chats/{chat_id}/messages`. Optimistic append → confirmed/failed states. **Send-dedup is mandatory** (no idempotency keys upstream): single-flight per chat, outbox journal, unconfirmed-on-restart surfaced for manual reconcile, never silent auto-retry of a possibly-sent message.
- Restricted-words rejection (OF 400 + `textHighLight`) → inline highlight of offending words, message preserved for editing.
- Typing indicator sent while chatter types (free endpoint, throttled ~3s).
- Multi-part replies: AI `[NEXT]` parts can be sent as a queued sequence with natural randomized delays (e.g. 2–5 s), cancelable mid-sequence; or inserted one-by-one (chatter choice).
- Unsend (≤24 h window) with countdown awareness; reply-to; like/unlike fan messages.

### F5. Fan context panel [P1 read, P2 write]
- Identity: avatar, name, custom name (editable → `PUT …/custom-name`), username, lastSeen, lists/labels membership.
- **Spending:** total + breakdown (subscriptions / tips / messages / posts / streams) from `subscribedOnData` `*Summ` fields; rendered both for the chatter and as AI context.
- **Subscription:** status, price, subscribed-since, renew date, **auto-renew off ⇒ churn-risk badge**, duration, subscription history on demand.
- **Notes:** OF-native fan notes (`GET/PUT …/notes`) — readable/writable; visible to other tools (incl. OnlyMonster) since they live on OnlyFans itself.
- **AI Fan Summary card:** latest summary with generated-at timestamp + refresh (F6.4); stored locally in P-early, centrally via hub later [P6].

### F6. AI assist suite [P3–P4] — ported from legacy, behavior-compatible
All features stream token-by-token into an AI panel docked above the composer; results offer **Insert** (into composer) / **Insert part N** / copy. Same staged-timeout discipline, cancellation, error taxonomy, reply sanitizer, prompt-injection escaping, and safety preambles as legacy (see research doc §2, §8, §9). Prompt templates are ported with Fansly→OnlyFans adaptations; transcript/spending/subscription context blocks keep their proven text formats but are built from OFAPI data (mapping table in [SPEC.md](SPEC.md) §8).

1. **Fast Reply** [P3] — in-voice reply from last ~100 messages + spending/subscription context. Tones: casual / flirty / upsell / spicy. Split mode (`[NEXT]`). Regenerate.
2. **Improve Draft** [P3] — rewrite the chatter's draft in-character, preserving intent/facts/prices; draft may be written in Russian, output in fan's language. Single message out.
3. **Help Me** [P3] — coaching: situational read + Engaging and Flirty ready-to-send suggestions (XML-parsed).
4. **Fan Summary** [P4] — deep profile (~1500 msgs): dossier, psychology, stage/trajectory, communication, financial profile, open loops, strategy. **Output in Russian.** Cached per conversation with legacy invalidation rules (personality/model/data-verified); refresh on demand; hub prefetch/sync when hub exists.
5. **Chat Review** [P4] — chatter performance rating 1–10 + evaluation + recommendations (XML-parsed), deep context, never cached.
6. **Ping** [P4] — reactivation message; legacy segmentation ported verbatim: blocked if fan texted within 5 days ("still active — use Reply"); Segment A (≥3 fan texts, silent >5 d) references past topics; Segment B (thin history) warm low-pressure opener.
7. **Hi Greeting** [P4] — 3 opener variants (`[VARIANT]`) for fresh conversations (≤10 total messages), username-aware.
8. **Compare** [P4, lowest priority] — run Fast Reply across multiple personality cards side-by-side (A/B tool).

Model support: per-feature model selection + reasoning effort (off/low/medium/high/max), Anthropic direct + OpenRouter, prompt caching, live cost display per operation — all per legacy registry (refresh model list at implementation time).

**AI quality bar:** the legacy anti-AI-slop work (few-shot examples over prose rules, banned-formula structural rules, output sanitizer) is the most valuable ported asset and must not regress. Build the prompt regression harness early (PLAN §P4): golden transcripts → generated outputs reviewed against the legacy bad-output taxonomy.

### F7. Vault & PPV sending [P5]
- Browse vault (`GET /{account}/media/vault`, albums via vault lists), thumbnail grid, search/filter, multi-select.
- Attach vault media to a message; set price ($3–200) and free-preview subset (previews ⊆ attached); locked-text caption.
- Upload new media from disk (3 credits/MB — show size/cost preflight; route through vault for reusability; `ofapi_media_` direct-upload IDs are single-use).
- Clear PPV compose summary before send (N items, price, previews) — misprice prevention.

### F8. Real-time & hub relay [P6]
- Hub service receives OFAPI webhooks (`messages.received/sent`, `messages.ppv.unlocked`, `tips.received`, `subscriptions.*`, `users.typing/online/offline`, `accounts.*`), verifies HMAC, dedupes `event_id`, fans out to desktop clients over WebSocket.
- Desktop drops its polling loops in favor of push (polling stays as degraded fallback); read-state (`isNew`) still polled on-demand for the open conversation.
- Hub owns the OFAPI key; desktop authenticates to hub with per-chatter tokens → per-chatter account ACLs, central kill-switch.
- Central storage: fan summaries + AI usage events (port legacy Agency Hub client; one summary visible to all chatters of that account), per-chatter LLM token limits.
- LLM calls proxy through hub (central provider keys, caching, limits) — desktop-direct mode remains for solo/dev use.

### F9. Settings [P1–P3, grows with features]
Ported legacy schema where applicable: provider API keys; per-feature model + reasoning; message-count knobs (quick 100 / improve 25 / deep 1500, same ranges); personalities CRUD; account→personality mappings; debug mode (+ pipeline profiling view); prompt-caching toggle; sound/notification prefs; mark-as-read policy; hub URL/token (later).

### F10. Operational UX (cross-cutting)
- **Status bar:** OFAPI credit balance + credits used today (from `_meta._credits` on every response), per-op LLM cost after each AI action (legacy spend summary), sync freshness ("updated 12 s ago"), connection state.
- Account session health banner (expired → "re-auth needed, ping admin" with deep link to OFAPI console).
- Every error maps to a coded, actionable message (legacy `CG-*` taxonomy extended with OFAPI codes); raw payloads in debug mode.
- Offline/API-down: cached data remains browsable, composer disabled with reason, auto-recovery on reconnect.

## 7. UX design principles (UI is designed from scratch — explicit requirement)

Detailed design happens at implementation with the frontend-design skill; these principles are binding:

1. **Three-zone workspace:** left = account rail (avatars w/ badges) + chat list; center = conversation + composer; right = fan context panel (collapsible). AI output appears in a **dock above the composer** (streams in place, Insert buttons land text exactly where the eyes already are) — proven by legacy inline-panel pattern.
2. **Keyboard-first.** Every high-frequency action has a hotkey: send, next/prev unread chat (J/K-style), AI features (e.g. ⌘R fast reply, ⌘I improve draft, ⌘1..9 insert part N), tone cycling, search. Hotkey cheatsheet overlay (?).
3. **Latency is masked, never hidden.** Optimistic sends with explicit state glyphs (sending → sent → seen); skeletons over spinners; cached conversation paints instantly, refresh reconciles; every async surface shows data age. Honest about what's not real-time (read receipts, presence in polling mode).
4. **Streaming everywhere.** AI output renders token-by-token with cancel always available; no modal blocks the conversation — chatter can keep reading/scrolling while AI generates.
5. **Money is visible.** Fan value (total spent, churn-risk) visible without clicks; PPV purchase states unmissable in history; tips highlighted. The chatter's next monetization move should be obvious from the screen.
6. **Dense but calm.** Information-dense layout for power users; restrained palette (dark theme default), no decorative chrome; visual emphasis reserved for money events, unread state, and errors.
7. **Trust through transparency.** Per-operation cost, what context the AI saw (debug inspector), and explicit "AI never sends by itself" affordances.
8. **Fast.** Cold start <3 s to usable inbox; cached chat open <300 ms; account switch <500 ms (budgets in SPEC §13).

## 8. Constraints & dependencies

- **OFAPI is a hard dependency** (unofficial third-party gateway, $; see §10/§11 risks). All access through it; no direct OF reverse engineering in this product.
- **No customer-facing websocket from OFAPI** → real-time requires our hub relay (webhooks) or polling. No read-receipt webhook at all.
- **No send idempotency upstream** → client-side dedup is a correctness requirement, not polish.
- **Account-scoped calls cost 1 credit each, never cached** → sync design is a cost feature (SPEC §6).
- **OF restricted-words** and 24 h unsend window are platform rules surfaced in UX.
- AI provider usage policies: agency-operated assistant for adult-platform chat; same posture as the legacy product (human-in-the-loop, no platform ToS evasion features beyond what the agency already accepts by using OnlyMonster/OFAPI).

## 9. Competitive/context note

OnlyMonster, Infloww, Supercreator et al. offer CRM + AI features. We are not competing commercially — this is an internal tool whose edge is (a) our proven prompt stack and persona discipline, (b) agency-owned data (summaries, usage, costs), (c) UI shaped exactly to our chatters' workflow, (d) per-feature model control and cost transparency.

## 10. Unit economics (rough, validate in pilot — week-1 task in PLAN)

**OFAPI credits** (1 credit ≈ $0.0015–0.003 depending on plan/top-up):
- Polling mode (P1–P5), one active account/shift: chat-list poll @20–30 s ≈ 1,000–1,400/8 h; open-conversation refreshes (conditional on list delta) ≈ 500–1,500; sends/reads/fan fetches ≈ 300–800. **≈ 2–4 k credits per chatter-shift** → 45–90 k/mo per full-time seat. Pro plan (100 k/mo incl. 5 accounts, $299) covers a small pilot; polling at scale needs top-ups → hub phase pays for itself.
- Hub/webhook mode (P6+): events ≈ 1 credit/100 → **≈ 0.5–1 k credits per chatter-shift** (sends + on-demand fetches dominate). ~5–10× cheaper.
- Media: 3 credits/MB upload/first-download; thumbnails cached on their CDN (free after first fetch).

**LLM** (legacy registry prices): fast replies ≈ $0.01–0.03/op (Sonnet-class + prompt caching), deep summary ≈ $0.3–0.8/op (Opus-class, 1500 msgs). Typical shift ≈ **$1.5–4/chatter**. Per-feature model knobs + hub limits keep this governed.

## 11. Risks & open questions

| # | Risk / question | Plan |
|---|---|---|
| 1 | **OnlyMonster coexistence** asserted by OFAPI FAQ but untested for races (read-state, typing, dual sends) | Week-1 pilot test on a throwaway account: both tools active, verify no logout, observe read/typing behavior. Decide mark-as-read policy from results |
| 2 | **OFAPI latency** for live passthrough endpoints unknown (every call proxies to OF) | Week-1 spike: measure p50/p95 for list-chats / list-messages / send; if p95 > ~2.5 s, increase cache/prefetch investment |
| 3 | **OFAPI reliability/business risk** (unofficial API, OF could break it; vendor could die) | Local SQLite cache keeps history readable; OnlyMonster remains operational fallback; data-provider abstraction isolates vendor |
| 4 | **Account safety** (third-party session, proxy geo US/UK) | Same risk class the agency already accepts with OnlyMonster; use matching proxy geo; pilot on lower-value account first |
| 5 | **Pricing/credit discrepancy** (docs 25k/75k vs pricing page 20k/100k) | Confirm with vendor before plan purchase |
| 6 | **Connection method**: fresh OFAPI login vs `raw_data` cookie import; v2 Face-Auth accounts need Auth+ iPhone app | Ops decision during pilot onboarding; document per-account |
| 7 | **Sending from a second session** — fan sees replies "from nowhere" in OnlyMonster UI (OM chat log may confuse other chatters during transition) | Transition protocol: one account works from exactly one surface per shift |
| 8 | UI language (assumed English UI, Russian AI summaries — legacy convention) | Confirm with chatters in pilot |
| 9 | Read-marking policy (auto-read on open may fight OnlyMonster triage habits) | Setting + pilot feedback (tied to #1) |
| 10 | Legacy unresolved: AI-slop quality drift | Port prompts verbatim first; build regression harness (PLAN P4) before iterating on prompt content |

## 12. Acceptance (per release gate)

- **P1 gate:** chatter monitors a real account read-only for a full shift without opening OnlyMonster for *reading*; data correct vs OM spot-checks (messages, PPV states, spending).
- **P2 gate:** full text shift in-app; zero lost/duplicated sends across ≥500 messages; restricted-words and error paths exercised.
- **P3 gate:** Fast Reply / Improve / Help Me used in real shifts; acceptance rate ≥ legacy Fansly baseline; per-op cost shown.
- **P4 gate:** Summary/Review/Ping/Hi at behavior parity with legacy (side-by-side prompt-output review); summary caching correct.
- **P5 gate:** PPV send with vault media + previews + price executes correctly end-to-end (verified in OM/OF).
- **P6 gate:** webhook→UI latency ≤2 s p95 for incoming messages; desktop holds no OFAPI key; central summaries shared across chatters; credit burn per shift drops ≥5×.
