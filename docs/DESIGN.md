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
- **Chat list:** ~340 px, rows ~64 px, virtualized. Filter chips (All / Unread / With tips; Priority/Pinned only as server-side filters until a flag source is confirmed — PRD F2). Search. "Fan waiting" indicator per PRD F2.
- **Conversation:** virtualized list; PPV state badges unmissable (purchased = filled, not purchased = outline); tips highlighted; send-state glyphs (sending → sent → seen / failed / unconfirmed). Reply-to context inline.
- **AI dock:** docked above composer, never a modal — chatter can keep reading/scrolling while it streams; tone selector; per-part Insert/Copy buttons; per-op cost shown after completion; cancel always visible.
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
| `⌘1..9` | Insert part N (companion phase: copy part N) |
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

## 4. Visual direction — "strict professional console" (decided 2026-06-10, owner-reviewed)

- **Light theme, only theme at v1** (owner decision 2026-06-10; dark mode revisit later). White panels on a cool `#f2f3f5` window, hairline borders (`#e6e8ec`/`#d3d7dd`), minimal shadows, 4–6 px radii, ink-black (`#16181d`) for primary actions/selection (Send button, unread pills, active account, selected-row bar).
- **Money = financial green** (`#0e7b43` on `#ecf6f0`): lifetime/value chips, tip ledger rows, purchased-PPV badges, credit/LLM figures in the status bar. **Pending money = amber-bronze** (unopened PPV badge). Other semantics: seen `#2563eb`, unconfirmed/warn `#b45309`, failed/churn `#c0392b`, online `#16a34a`.
- Typography: **IBM Plex Sans** (UI) + **IBM Plex Mono** (all numerals, timestamps, send-state labels, micro-caps) — sober, corporate, characterful; 13 px base; **tabular numerals for money and time**; uppercase letterspaced micro-labels for section captions.
- Send states as terminal-style mono micro-labels: `SEEN 18:42` / `SENT` / `UNCONF` / `FAILED`.
- Density over decoration: flat scannable message rows (fan = white, model = light grey tint), not bubble-with-tail chat cuteness; information-dense but calm (PRD §7.6).
- Custom design system in `src/renderer/design/` (tokens + primitives: Button, Chip, Badge, ListRow, Skeleton, Toast, Dock). **No heavy component library**; no generic "AI-generated SaaS" look (gradient heroes, glassmorphism, decorative blur) — restraint, craft, speed.
- Anti-goals: no modal dialogs inside the shift loop; no dark theme v1; no avatar noise in dense lists beyond the chat row.

## 5. Visual reference mockup

A static, owner-reviewed mockup of the default workspace state lives at **[`mockups/workspace.html`](mockups/workspace.html)** (preview: `mockups/workspace-preview.png`). It is the **binding visual reference** for P1: zones, density, light professional palette per §4 (white panels, ink primaries, green money), IBM Plex typography, ledger-style tip rows, PPV purchase badges, terminal-style send-state labels (`SEEN 18:42`), AI dock with per-part Insert, status bar with credits/LLM spend. Deviations require updating the mockup + this brief in the same PR. Iterate on the mockup (cheap) before iterating in React (expensive).

## 6. Process

- P1: build the design system + the three-zone shell with the **frontend-design skill**, against this brief and the §5 mockup; show 1–2 chatters real data early and iterate on the triage loop before polishing anything else.
- The hotkey map and §3 checklist are acceptance items of the P1/P2 gates.
- Changes to this brief are doc-updates in the same PR that implements them (CLAUDE.md discipline).
