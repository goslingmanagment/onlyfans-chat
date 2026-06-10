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
- **Chat list:** ~340 px, rows ~64 px, virtualized. Minimal chrome (owner): no list title, no per-list sync label (freshness lives in the status bar only); a single quiet filter row — All / Unread / With tips; search/jump only via the ⌘K palette. "Fan waiting" indicator per PRD F2.
- **Conversation:** virtualized list; PPV state badges unmissable (purchased = filled, not purchased = outline); tips highlighted; send-state glyphs (sending → sent → seen / failed / unconfirmed). Reply-to context inline.
- **AI surface (redesigned 2026-06-10 after owner feedback).** Three tiers of access: **(1) composer pill row** for in-the-moment actions — `✳ Reply ⌘R · Improve ⌘I · Help ⌘H`, plus **contextual chips that appear only when relevant**: `Ping ⌘P` when the fan has been silent >5 days, `Hi ⌘G` on fresh chats (≤10 msgs); **(2) the `✳ AI` menu in the conversation header** — the full feature catalog with one-line descriptions and disabled-state reasons (Review ⌘E, Summary ⌘S → panel tab, Ping, Hi, Compare, Scan), so everything is discoverable without hotkeys; **(3) the ⌘K palette** (every action by name). Analysis outputs (Review, Help coaching) render in the dock as read-only serif cards — only true reply drafts get the insert affordance. Active state = dock above the composer, never a modal: suggestions render as **draft message bubbles** (serif text, dashed terracotta border) — **clicking the bubble inserts it** (the whole card is the target; a quiet `INSERT ⌘1` chip sits inside), `⌘0` inserts all parts; footer = tone pills (Fast Reply only) + Regenerate; cost appears top-right after completion; streaming = caret in the text; dismiss = ✕ / Esc. **No model/TTFT telemetry in the UI** — that lives in debug mode only.
- **Fan panel:** collapsible (`]`), three tabs; money chips (total / tips / messages / subs), auto-renew-off ⇒ churn-risk badge.
- Every surface has skeleton + empty + error states and a data-age indicator ("updated 12 s ago") — honesty over spinners (PRD §7.3).

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

All hotkeys also reachable via the palette; keymap centralized (single registry, no scattered listeners).

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

The owner-chosen mockup of the default workspace state lives at **[`mockups/workspace.html`](mockups/workspace.html)** (preview: `mockups/workspace-preview.png`) — Claude-style warm per §4, picked 2026-06-10 over a strict-console alternative. It is the **binding visual reference** for P1: zones, density, cream/terracotta palette, serif AI text, ledger-style tip rows, PPV purchase badges, terminal-style send states, AI dock with per-part Insert, credits/LLM status bar, ≥14 px base type. Deviations require updating the mockup + this brief in the same PR. Iterate on the mockup (cheap) before iterating in React (expensive).

## 6. Process

- P1: build the design system + the three-zone shell with the **frontend-design skill**, against this brief and the §5 mockup; show 1–2 chatters real data early and iterate on the triage loop before polishing anything else.
- The hotkey map and §3 checklist are acceptance items of the P1/P2 gates.
- Changes to this brief are doc-updates in the same PR that implements them (CLAUDE.md discipline).
