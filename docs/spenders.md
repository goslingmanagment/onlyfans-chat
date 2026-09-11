# Spenders contact view

Current behavior from Desktop Decision D29 (2026-09-11). Approved reference:
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
downloaded. Existing scoped Refresh controls, their cost estimate, timestamps,
and mini-chat hydration remain. «Обе даты: X из N» counts visible fans for whom
both dates are known. Statistics retain their existing local data scope; the
unread queue is labelled «Последним писал фан · не прочитано» to match its actual
filter. The silence buckets use neutral factual labels.

## Verification and rollout

Desktop checks: `pnpm check` (types, lint, tests, build). Focused regression
coverage includes nullable dates, timezone offsets, timestamp/ID ties, deleted
heads, media/tips, outbox isolation, both sorting directions, shelf clipping,
selection after confirmed messages, and manual Ping with no implicit send.
UI verification uses the built Electron renderer with synthetic IPC fixtures
in a separate keyless profile; it is not a production or live-send test.

Verified 2026-09-11: full Desktop check passed with **2,227 tests**, five existing
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

The companion Hub change is Decision **#294**, implemented separately on
`codex/onlyfans-manual-ping` (commit `b2259f6b`). It accepts manually requested OnlyFans Ping for an
active conversation and keeps the observed segment in context. Fansly's gate
and assembled prompt remain unchanged. Hub has its own full check plus provider
stub integration coverage.

Deploy Hub support before or with Desktop. A new Desktop against an older Hub
can still receive `gate_ping_active`; do not describe the feature as released
until both sides are deployed. This change does not authorize deployment or
live fan messaging.
