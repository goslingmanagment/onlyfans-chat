# Spenders contact view

Current behavior from Desktop Decisions D29–D30 (2026-09-11–12). Approved D29 reference:
[full interface mockup](mockups/spenders-contact-columns.html). Earlier DESIGN
and `supporters.html` descriptions are historical where D29 supersedes them.

## Reading the board

Each row keeps the avatar, name and lifetime spend, followed by one latest
message with an explicit «Мы:» or «Фан:» prefix. The remaining columns show
30-day spend, «Мы писали» and «Фан писал». Tier emojis and counts stay visible.
Green denotes positive recent spend. Contact ages have no urgency colour.

The two dates mean the last known message **from each side**, not the last time
the chatter opened the conversation. Minutes/hours appear for recent messages;
days are full elapsed 24-hour periods. Hovering a date shows its exact local
date and time. «—» means the date is unknown. An empty preview with no known
dates says the history has not been loaded. Known zero spend shows $0; missing
spend shows «—».

Click either date heading to sort within each tier. The default puts older fan
messages first. Clicking the selected heading reverses it; missing dates stay
last. Sorting happens before a shelf's short preview is selected. A minute
clock updates the displayed age and refreshes on window focus without fetching
messages or spending credits.

Click a fan (or Space) to open the mini-chat. Its header repeats the two dates;
Previous/Next and J/K move through visible fans. A new message or sort change
keeps the open fan selected by ID. If that fan moves outside the short shelf
preview, its data stays available and navigation continues from its new position.
Esc closes the mini-chat; O opens the full conversation.

Search (or `/` to focus it) matches name, username and fan ID. The Filters
button reveals two neutral choices: who sent the latest message and whether
any message information is available. Search and filters are combined. They
include loaded rows beyond the short tier previews and show all matches.
«Найдено X из N загруженных» states the available scope; unopened tiers retain
«загрузить для поиска». Typing does not trigger new reads. Statistics keep their
account-wide scope. Esc in search clears its text, then blurs the empty field.
Changing accounts clears the old chip, filters, expanded tiers and mini-chat;
a removed tier selection falls back to All.

Filtering preserves the open fan by ID, even when it no longer matches. J/K
navigates the new matching set. Completed AI drafts are inserted once per
operation: closing and reopening the mini-chat cannot bring back text that was
already sent, cleared or edited. Explicit insertion and new generations remain
available.

Ping generates only when the chatter requests it. A recent fan message is not
a reason to disable Ping. Authentication, a mapped personality, loaded history
and other existing feature gates still apply. Sending remains a separate human
action through the existing send engine.

## Data and coverage

Both dates are assembled in Electron main from local message history and the
latest known chat-list head. Preview text and its author are selected together.
Deleted messages, invalid dates, and queued/failed/unconfirmed sends cannot
advance a contact date. Messages with media or tips retain a readable preview.
No new OFAPI operation, SDK vendor update or database migration is required.

These are the latest **known** facts, not a claim that all history has been
downloaded. Scoped Refresh retains its cost estimate and mini-chat hydration
retains its read policy. «Обе даты: X из N» counts visible fans for whom
both dates are known. Statistics retain their existing local data scope; the
unread queue is labelled «Последним писал фан · не прочитано» to match its actual
filter. The silence buckets use neutral factual labels.

Refresh now distinguishes fetched tails, TTL reuse, policy skips, errors and
stops. A fully covered scope shows its oldest verified source timestamp; TTL
reuse never makes it newer just because Refresh was clicked. When automatic
reads are off, stale/unknown histories remain unread and the UI explains the
skip. Partial runs show verified counts and do not set a new full-scope date.
Old completion-time stamps/queues are excluded from the new persisted format.
FanPanel likewise uses the fan record's source fetchedAt for its age label.

Initial query failures have a visible error and Retry action. Failed refreshes
keep previously loaded rows/statistics/fan details and explain that they are cached. These
states are separate from successfully loaded empty results and real zeros.

## Verification and rollout

Desktop checks: `pnpm check` (types, lint, tests, build). Focused regression
coverage includes nullable dates, timezone offsets, timestamp/ID ties, deleted
heads, media/tips, outbox isolation, both sorting directions, shelf clipping,
selection after confirmed messages, and manual Ping with no implicit send.
UI verification uses the built Electron renderer with synthetic IPC fixtures
in a separate keyless profile; it is not a production or live-send test.

Verified for D29 on 2026-09-11: full Desktop check passed with **2,227 tests**, five existing
skips and eight lint warnings (zero errors). The built window was inspected at
1440px and 1100px, including the 400px board with expanded statistics. Header
and row date tracks align with the reserved scrollbar gutter; no horizontal
document overflow was observed. Sorting both ways, Previous/Next, Esc, unknown
dates and dark theme were checked. A Ping for the fixture fan whose last message
was one hour ago generated one `ai:start` and **zero `cmd:send*`** calls.
Independent review reproduced and closed the selection-after-refresh defect.
Screenshots: [board](mockups/spenders-contact-columns-preview.png),
[mini-chat](mockups/spenders-contact-columns-mini-chat.png),
[dark](mockups/spenders-contact-columns-dark.png).

Verified for D30 on 2026-09-12: `pnpm check` passed with **2,286 tests**, five
existing skips and eight existing lint warnings (zero errors). Additional
coverage includes search beyond shelf previews, unknown-history author filters,
account reset, cached/initial failure states, AI insertion receipts, source age,
policy skips, failures across restart, mapping changes and obsolete child outcomes.

Built Electron verification (keyless profile, synthetic IPC) covered search
without additional roster/history calls, author/history filters, manual Retry
after initial roster/statistics failure, cached statistics during refresh failure,
the explicit auto-read-off outcome, dark theme and the 400px board at a 1100px
window. No horizontal document overflow was observed. A cached account switch
did not read its unopened untiered roster; a fan outside its loaded shelves
opened correctly from Statistics. AI completion, draft clearing and mini-chat
reopening were exercised; no send command was issued.

The UI probe also exposed a fixture-only ordering error: mock request latency
could execute a draft read before an earlier write. Real main draft handlers
are synchronous. The mock now preserves execution order while delaying replies;
deterministic tests cover replies arriving in reverse order. This is separate
from the production insertion-receipt fix.

Current screenshots: [board](mockups/spenders-search-final-board.png),
[filters](mockups/spenders-search-final-filters.png),
[dark](mockups/spenders-search-dark.png),
[initial error](mockups/spenders-search-initial-errors.png),
[cached data after error](mockups/spenders-search-cached-error.png).

The companion Hub change is Decision **#295**, implemented separately on
`release/onlyfans-manual-ping-20260912` (commit `9597d9315111`), preserving the
production baseline `2c6b42b71aaf` (original implementation `b2259f6b`). It accepts manually requested OnlyFans Ping for an
active conversation and keeps the observed segment in context. Fansly's gate
and assembled prompt remain unchanged. Hub has its own full check plus provider
stub integration coverage.

Deploy Hub support before or with Desktop. A new Desktop against an older Hub
can still receive `gate_ping_active`; do not describe the feature as released
until both sides are deployed. The owner authorized the 0.1.52 release on 2026-09-12; live fan messaging remains a separate manual action.
