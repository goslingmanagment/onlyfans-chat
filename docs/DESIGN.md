# ChatGoose Desktop — UI/UX Design Brief

Status: Draft v1 — 2026-06-10. Binding companion to [PRD.md](PRD.md) §7 (principles) and [SPEC.md](SPEC.md) §13 (performance budgets). This brief turns those into concrete layout, interaction, and performance-engineering requirements. Final visual design is produced at implementation time (P1) with the frontend-design skill **against this brief**, then iterated with real chatters on real data. The UI is designed from scratch — owner requirement: "прям очень удобно" and **fast**.

## 1. Workspace anatomy

```
┌────┬─────────────┬───────────────────────────────┬───────────────┐
│ A  │ CHAT LIST   │ CONVERSATION                  │ FAN PANEL     │
│ c  │             │ header: name · lastSeen ·     │ (collapsible) │
│ c  │ filters:    │   value chips ($ total, sub)  │ tabs:         │
│ t  │ All/Unread/ │                               │  Info         │
│ s  │ Tips        │  virtualized message list     │  Summary (AI) │
│    │ search ⌘K   │  day separators               │  Notes        │
│ ▾  │             │  money events stand out       │               │
│    │ virtualized │  send-state glyphs            │ spend chips   │
│    │ rows:       │ ┌───────────────────────────┐ │ sub status /  │
│    │ avatar,     │ │ AI DOCK (collapsible)     │ │ churn badge   │
│    │ preview,    │ │ streams; Insert/Copy/parts│ │ last seen     │
│    │ time,       │ └───────────────────────────┘ │ custom name   │
│    │ badges      │ composer · tones · send ⌘↵    │               │
└────┴─────────────┴───────────────────────────────┴───────────────┘
```

- **Account rail (A):** avatars with unread badges; switch <500 ms (budget). Aggregate badge on app icon.
- **Chat list:** ~340 px, rows ~64 px, virtualized. Minimal chrome (owner): no list title, no per-list sync label (freshness lives in the status bar only); a single quiet filter row — All / Unread / With tips; search/jump only via the ⌘K palette. "Fan waiting" indicator per PRD F2. **Fan value in the row** (owner-settled 2026-06-11 after four side-by-side experiment rounds; scratch experiment pages live untracked in `mockups/experiments/` — only the binding mockup is committed): **lifetime spend right after the name** — bare mono figure by default (10.5 px `--t-mid`), bordered chip via a **per-chatter display setting** (`spendStyle: figure | chip`); the name truncates first, the figure survives. **30-day spend bottom-right as a bare green `+$120`** (10 px mono semibold `--green`, no label — tooltip explains the window) beside the unread badge — the row's single colour accent: **green marks recent money inflow, never stock**. Exact dollars with thousands separators everywhere, matching the header chip and fan panel; $0/unknown renders **nothing** — silence is the signal. Rejected along the way (kept in the gallery's "rejected" section): right-column totals, K-notation, whale tiers (bold or colour), the separate tip pill, green badge recolouring, the `· 30D` label. The unread badge is always clay; tips read via the Tips filter and the preview line (owner: chatters work primarily through OnlyMonster — this app is a companion, signals must not scream). Data: lifetime from `fans.spending.total` (every list-chats poll); 30-day aggregated at read time from the local `fan_transactions` store, fed by an incremental `GET /{account}/transactions` sweep (first walk `-30days`, then from the newest cached row − 1 h overlap; 10-min cadence, ≈1 credit per sweep at steady state — see `sweepFanSpend` in polling-sync).
- **Conversation:** virtualized list; PPV state badges unmissable (purchased = filled, not purchased = outline); tips highlighted; send-state glyphs (sending → sent → seen / failed / unconfirmed). Reply-to context inline.
- **AI surface (redesigned 2026-06-10 after owner feedback).** Three tiers of access: **(1) composer pill row — all five frequent actions, always visible**: `✳ Reply ⌘R · Improve ⌘I · Help ⌘H · Ping ⌘P · Hi ⌘G` (owner: Ping/Hi are frequent — keep them at hand; when inapplicable they dim with the reason in a tooltip — fan-active for Ping, >10 msgs for Hi — matching legacy gates); **(2) the `✳ AI` menu in the conversation header — rare/deep actions only**: **Scan ⌘S** (deep fan profile → panel's Scan tab; "Scan" is the team's name for fan-summary, the legacy UI label — `chatgoose: src/content/button-bar.ts:10`), Chat review ⌘E, Compare; **(3) the ⌘K palette** (every action by name). Analysis outputs (Review, Help coaching) render in the dock as read-only serif cards — only true reply drafts get the insert affordance. Active state = dock above the composer, never a modal: suggestions render as **draft message bubbles** (serif text, dashed terracotta border) — **clicking the bubble inserts it** (the whole card is the target; a quiet `INSERT ⌘1` chip sits inside), `⌘0` inserts all parts; footer = tone pills (Fast Reply only) + Regenerate; cost appears top-right after completion; streaming = caret in the text; dismiss = ✕ / Esc. **No model/TTFT telemetry in the UI** — that lives in debug mode only.
- **Fan panel:** collapsible (`]`), three tabs; money chips (total / tips / messages / subs), auto-renew-off ⇒ churn-risk badge.
- Every surface has skeleton + empty + error states and a data-age indicator ("updated 12 s ago") — honesty over spinners (PRD §7.3).
- **Status bar & Settings → Activity (owner-approved 2026-06-11; binding mockup [`mockups/experiments/activity-panel.html`](mockups/experiments/activity-panel.html)).** The bar is the one-line summary — mode word matching the panel badge (`POLLING` / `HUB LIVE`; sync trouble outranks: `DEGRADED` / `OFFLINE`), `CREDITS TODAY n · BAL n`, `AI TODAY $x` (today's aggregate, not the last op), `SENDS n · n UNCONF`, `UPDATED ns AGO`. **Every segment shows a Russian hover tooltip (texts byte-for-byte from the mockup's tiplist) and clicks through to Settings → Activity**, the first settings section: three flat ledgers (data flow now · OFAPI credits by purpose · AI spend by feature) + RUN OUTBOX AUDIT. RPM headroom lives in the credits-ledger footer, not the bar. Read-only except the audit button.
- **Spenders page (owner-designed 2026-06-12/13; renamed from «Supporters» and re-laid out as a SEPARATE page per owner direction 2026-06-13. Row anatomy stays per the binding mockup [`mockups/supporters.html`](mockups/supporters.html) — its HTML comment header is the consolidated decision log; the page layout follows [`mockups/experiments/spenders-page-2.html`](mockups/experiments/spenders-page-2.html); rejected variants in `mockups/experiments/{reactivation-pass*,supporters-*}.html` and the v1 squeezed-roster default in `spenders-page.html` must not be resurrected).** A viewing board of the account's spenders that also carries the reactivation job — **no AI automation**: the board only shows, the human decides; AI runs only on explicit click/hotkey. A separate page: the workspace chat list is NOT shown; `ESC`/`←` return to the chat. **Default state: the board owns the screen with a compact 300px stats column right; `S`/⤢ expands stats to a full grid (roster squeezes to 400px), ⤡ collapses back.** Tiers = OnlyMonster user-lists (read-only; owner-ordered list→shelf mapping in Settings → Spenders; spenders outside mapped lists → «Без тира»); «Все» chip = tier sections (first shelf previews 4 rows, later shelves 2, tiers >50 collapsed with lazy roster loading), tier chip = flat list, in-shelf sort by fan silence. Row anatomy per the mockup: lifetime right after the nick (mono 10.5), 30-day green `+$N` top-right (>0 only), author-prefixed preview, fan-silence dot (≤7 d none · 8–21 amber · >21 clay-deep; burns until the fan replies, even after a ping) before the `МОДЕЛЬ N Д · ФАН M Д` counters (local DB only — vendor lastReplyAt is null; for never-opened chats the chat row's list-payload stamp covers whichever side wrote last). **Stats panel (`query:spenders.stats` — all LOCAL data, 0 credits): Выручка (30 daily bars in the user's local calendar days; 30d/7d/today totals with a 7-to-7 percent delta — the local transaction store retains 31 days, so a month-to-month comparison would be dishonest; payers + avg check), По полкам (per-shelf 30-day revenue, click = tier chip), Реактивация (warm 8–21 d / hot >21 d per shelf + lifetime at stake, amber summary, click = tier chip), Ждут ответа (fanWaiting by lifetime, click = preview), Новые · 30 д (lifetime ≈ window spend ⇒ first purchase inside the window). Neutral chart fills — colour only where the system already has it (money green, silence amber/clay).** Quick-look preview = centered overlay mini-chat: local-DB thread («↑ раньше» pages, 0 credits), AI pill row reusing the composer gates (Ping primary; Reply/Hi dim with the same reasons), own composer wired into the one send engine (`⌘↵`; SPEC §7), `SPACE` open, `J/K` walks fans without closing, `O` opens the full chat; no staleness dot in the preview header; also opens above the stats panel (queue clicks). Send-blocked fans surface the platform reason human-readably (live tokens `unsubscribed`/`chat_unavailable`). **Entry points (owner 2026-06-13): a visible `$` button in the account rail above the settings gear (clay highlight when active) + the ⌘K palette command "Spenders — board of top spenders"**; page keys `J/K/SPACE/O/←/S` are listed in the cheatsheet extras. Strings localize through the shared catalog (RU pinned to the mockup texts; «Спендеры»).
- **Settings surface (UX revamp 2026-06-12; experiment page [`mockups/experiments/settings-v2.html`](mockups/experiments/settings-v2.html)).** Sticky left section nav with scrollspy (Activity · API keys · Agency Hub · Models · Personalities · Behavior · Local data), `⌘,` opens settings from anywhere, the SAVED confirmation floats bottom-right (visible wherever the changed control is). **Interface language is a setting** (Behavior → Language: System / English / Русский): the settings surface, status bar segment labels, toasts and main-process notifications localize through the shared typed catalog (`packages/shared/src/i18n` — every key carries en+ru, parity-tested); status/mode words (`POLLING`, `HUB LIVE`, `DIRECT`…) and AI feature names (Fast Reply, Scan…) are product terms and stay English in both locales; the six status-bar tooltips stay byte-pinned to the activity mockup. Workspace strings localize in a later pass (PLAN parallel track). Also in the revamp: per-key fingerprints (`…a4f2 · added <date>`) + **Test buttons** probing the stored keys (OFAPI `/whoami`, Anthropic `/v1/models`, OpenRouter `/api/v1/key` — all free) and a hub **Test connection** (`GET /api/v1/auth/me`); per-feature trailing-7-day cost hints + "Reset to recommended" in Models; range + token hints under context-size fields; UI scale (90–125%, `webContents.setZoomFactor`); spend-style picker renders real ChatRow mini-previews; Local data shows cache footprint, opens the data folder, exports a secrets-free diagnostics JSON, and purge requires typing `purge`.

## 2. Interaction model & hotkeys

Goal: **a full shift without touching the mouse.** Core triage loop: `⌘U` (next unread) → read → `⌘R` (fast reply) → review/edit → `⌘↵` (send) → `⌘U` …

| Key | Action |
|---|---|
| `⌘K` | Command palette: jump to chat/fan/account, run any action |
| `J / K` (list focused) / `⌘U` | Next/prev chat / next unread |
| `Enter` / `Esc` | Focus composer / blur·dismiss dock |
| `⌘↵` | Send |
| `⌘R` / `⌘I` / `⌘H` | Fast Reply / Improve Draft / Help Me |
| `⌘P` / `⌘G` / `⌘E` / `⌘S` | Ping / Hi greeting / Chat review / Fan summary (when applicable) |
| `⌘1..9` / `⌘0` | Insert part N / insert all parts (companion phase: copy) — or click the draft bubble itself |
| `⌘.` | Cancel running AI operation |
| `⌘T` | Cycle tone (casual/flirty/upsell/spicy) |
| `]` / `[` | Toggle fan panel / chat list |
| `?` | Hotkey cheatsheet overlay |
| `⌘,` | Open settings (any view) |

All hotkeys also reachable via the palette; keymap centralized (single registry, no scattered listeners). The app sets a custom application menu (main): Electron's default menu would shadow `⌘R`/`⌘H`/`⌘0` with Reload/Hide/Actual-Size accelerators before the renderer keymap sees them — Hide lives on `⌃⌘H`, Reload exists only unpackaged on `⇧⌘R`, zoom roles are dropped (UI scale is a setting), Edit clipboard roles stay.

## 3. Performance engineering — how the SPEC §13 budgets are met

This section is review-blocking for renderer PRs, same weight as SPEC §15 invariants.

1. **Cache-first paint.** Cold start renders the inbox from SQLite before any network; network results reconcile through the DB → change-subscription path, never direct `setState` from fetch handlers. Single source of truth = DB (SPEC §6.3).
2. **Virtualize both long lists** (`@tanstack/react-virtual`): chat list and message history. Memoized rows, stable keys, measured-height cache; scrollback fetches pages of ≤100 from main.
3. **IPC discipline:** renderer receives narrow typed view-models, never raw OFAPI JSON blobs; queries are paginated; DB-change notifications batched (≤1 flush / 50 ms — the legacy stream-batching lesson). No polling loops in the renderer; main pushes.
4. **AI streaming without re-render storms:** stream chunks append via direct text-node updates inside the dock (legacy overlay technique) with 50 ms batching — the React tree around the streaming card must not re-render per chunk.
5. **Media pipeline:** thumbnails through the `media://` handler with disk LRU (SPEC §10); `loading=lazy`, `decoding=async`; dominant-color/blurhash placeholders; full-size media only on click; image decode must never block scroll.
6. **State discipline:** Zustand with per-slice selectors (no whole-store subscriptions); TanStack Query structural sharing for IPC reads; no app-wide context providers that re-render the tree; React StrictMode + Profiler pass per feature.
7. **Main-thread budget:** any renderer task >16 ms is a defect; JSON parsing, diffing, search indexes live in main (or a worker if ever needed). Long-task monitoring on in debug builds.
8. **Animations:** transform/opacity only, 150–200 ms, reduced-motion respected; none during streaming or fling-scroll.
9. **Electron config:** single BrowserWindow; `backgroundThrottling` disabled for the timer that drives slowed hidden-window polling (SPEC §6.1 — notifications must fire in companion mode); preload kept minimal.
10. **Perf smoke test in CI (from P1):** scripted scroll over a 10k-message fixture asserting frame budget, plus startup-time measurement; budgets from SPEC §13 are the thresholds.

## 4. Visual direction — "Claude-style warm professional" (chosen by owner 2026-06-10)

- **Light theme, only theme at v1** (dark mode revisit later). Anthropic-like warm palette: cream window `#efece4`, ivory panels `#faf9f5`, warm hairlines (`#e2dfd3`/`#cfcaba`), soft shadows, 7–14 px radii, pill-shaped chips, asymmetric bubble corners (flat side toward the sender).
- **Terracotta `#d97757`** (hover/deep `#c2603f`) for primary actions and attention: Send, active account, selected-row bar, unread pills, active tone chip, "fan waiting" dots, the AI spark.
- **Money = financial green** (`#3a7d44` on `#e9f1e5`): lifetime/value chips, tip ledger rows, purchased-PPV badges, credit/LLM figures in the status bar. **Pending money = amber** (`#96691c`, unopened PPV). Other semantics: seen `#4a72b8`, warn `#b45309`, failed/churn `#bb4430`, online `#3f9e54`.
- Typography: **Hanken Grotesk** (UI) + **Source Serif 4** for headings (wordmark, section titles, fan names) **and for all AI-authored text** — dock outputs, AI summaries — the "machine speaks in serif" signature; **IBM Plex Mono** for numerals, timestamps, send-states, micro-caps; tabular numerals for money and time. **Type floor (owner feedback): 14 px base, 14.5 px message text, 10 px micro-labels.**
- Send states as terminal-style mono micro-labels: `SEEN 18:42` / `SENT` / `UNCONF` / `FAILED`.
- Density over decoration: flat scannable rows, information-dense but calm (PRD §7.6).
- Custom design system in `src/renderer/design/` (tokens + primitives: Button, Chip, Badge, ListRow, Skeleton, Toast, Dock). **No heavy component library**; no generic "AI-generated SaaS" look (gradient heroes, glassmorphism, decorative blur) — restraint, craft, speed.
- Anti-goals: no modal dialogs inside the shift loop; no dark theme v1; no avatar noise in dense lists beyond the chat row.

## 5. Visual reference mockup

The owner-**approved** mockup (sign-off 2026-06-10 after 4 iterations: light→bigger type→Claude-style→AI-surface redesign) lives at **[`mockups/workspace.html`](mockups/workspace.html)** (preview: `mockups/workspace-preview.png`) — Claude-style warm per §4, picked over a strict-console alternative. It is the **binding visual reference** for P1: zones, density, cream/terracotta palette, serif AI text, ledger-style tip rows, fan-value figures in chat rows (lifetime beside the name — figure default / chip per setting; green 30-day inflow at right), PPV purchase badges, terminal-style send states, AI dock with per-part Insert, the clickable activity status bar (mode word · credits · AI TODAY · sends · updated, per the owner-approved [`mockups/experiments/activity-panel.html`](mockups/experiments/activity-panel.html) — itself binding for the Activity panel), ≥14 px base type. Deviations require updating the mockup + this brief in the same PR. Iterate on the mockup (cheap) before iterating in React (expensive).

## 6. Process

- P1: build the design system + the three-zone shell with the **frontend-design skill**, against this brief and the §5 mockup; show 1–2 chatters real data early and iterate on the triage loop before polishing anything else.
- The hotkey map and §3 checklist are acceptance items of the P1/P2 gates.
- Changes to this brief are doc-updates in the same PR that implements them (CLAUDE.md discipline).
